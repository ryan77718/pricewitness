// Evidence fields, record fingerprints and the public daily fingerprint list.
// See public/methods.html for the plain-language description of every rule in this file.
const MIN_SETUP_SHOPPERS = 3;   // Setup totals stay hidden until this many shoppers report an offer.
const LEDGER_DAYS = 30;

function optionalCents(value, label) {
  if (value == null || value === "") return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 99999999999) throw new InputError("Check the " + label + ".");
  return value;
}
// Normalizes the optional evidence a shopper may add to a price. Unknown setup keys are rejected
// so that the public record only ever contains the documented categories.
function evidenceInput(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const evidence = {
    listCents: optionalCents(source.listCents, "crossed-out price"),
    feesCents: optionalCents(source.feesCents, "fees"),
    totalCents: optionalCents(source.totalCents, "checkout total"),
    rank: null, notice: "", noticeText: "", conditions: {}, shopperState: "", proofHash: ""
  };
  if (source.rank != null && source.rank !== "") {
    if (!Number.isSafeInteger(source.rank) || source.rank < 1 || source.rank > 1000) throw new InputError("Check the search position.");
    evidence.rank = source.rank;
  }
  if (source.notice != null && source.notice !== "") {
    if (!noticeOptions.some(([key]) => key && key === source.notice)) throw new InputError("Choose what the page said about personalized prices.");
    evidence.notice = source.notice;
  }
  if (source.noticeText != null && source.noticeText !== "") {
    if (typeof source.noticeText !== "string" || source.noticeText.trim().length > 300) throw new InputError("Shorten the notice wording to 300 characters.");
    if (noticeShown.includes(evidence.notice)) evidence.noticeText = source.noticeText.trim().replace(/\s+/g, " ");
  }
  if (source.conditions != null) {
    if (typeof source.conditions !== "object" || Array.isArray(source.conditions)) throw new InputError("Check your setup answers.");
    for (const [name, value] of Object.entries(source.conditions)) {
      const question = setupQuestions.find(q => q.name === name);
      if (!question) throw new InputError("Check your setup answers.");
      if (value === "" || value == null) continue;
      if (!question.options.some(([key]) => key === value)) throw new InputError("Check your setup answers.");
      evidence.conditions[name] = value;
    }
  }
  if (source.shopperState != null && source.shopperState !== "") {
    if (!shopperStates.includes(source.shopperState)) throw new InputError("Choose the state you were in.");
    evidence.shopperState = source.shopperState;
  }
  if (source.proofHash != null && source.proofHash !== "") {
    if (typeof source.proofHash !== "string" || !/^[a-f0-9]{64}$/.test(source.proofHash)) throw new InputError("The screenshot fingerprint is not valid.");
    evidence.proofHash = source.proofHash;
  }
  return evidence;
}
function canonicalConditions(conditions) {
  return JSON.stringify(Object.fromEntries(Object.keys(conditions).sort().map(key => [key, conditions[key]])));
}
// The record fingerprint. Anyone holding the full record can recompute it and find it in that day's list.
// A random salt, kept private with the record, stops anyone from guessing the private answers
// (setup, state, exact time) by trying combinations against a public fingerprint.
// Field order is fixed by version "pw-evidence-v1"; never reorder it.
async function recordFingerprint(r) {
  r.salt ??= Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
  return hashText(JSON.stringify(["pw-evidence-v1", r.salt, r.id, r.thread, r.cents,
    r.evidence.listCents, r.evidence.feesCents, r.evidence.totalCents, r.evidence.rank,
    r.evidence.notice, r.evidence.noticeText, canonicalConditions(r.evidence.conditions), r.evidence.shopperState,
    r.observed, r.evidence.proofHash, r.campaign, r.tier, r.received]));
}
// Columns and values shared by every observation insert.
function evidenceColumns(r) {
  const e = r.evidence;
  return [e.listCents, e.feesCents, e.totalCents, e.rank, e.notice || null, e.noticeText || null,
    Object.keys(e.conditions).length ? canonicalConditions(e.conditions) : null, e.shopperState || null,
    e.proofHash || null, r.tier, r.campaign || null, r.received, r.hash, r.salt];
}
const evidenceColumnNames = "list_cents,fees_cents,total_cents,search_rank,notice,notice_text,conditions,shopper_state,proof_hash,tier,campaign,received_at,record_hash,record_salt";
// Appends the stored row's fingerprint. Retries and ignored updates add nothing new.
function logEvidence(db, observationId) {
  return db.prepare(`INSERT OR IGNORE INTO evidence_log(hash,day,received_at)
    SELECT record_hash,substr(received_at,1,10),received_at FROM observations WHERE id=? AND record_hash IS NOT NULL`).bind(observationId);
}

const hourStart = iso => new Date(Math.floor(Date.parse(iso) / 3600000) * 3600000).toISOString();
// Other shoppers see the hour, not the minute, and never see someone else's setup or state.
function publicSighting(row) {
  const {own, conditions, shopper_state, observed_at, ...rest} = row;
  const sighting = {...rest, own};
  if (own) Object.assign(sighting, {observed_at, conditions: conditions ? JSON.parse(conditions) : null, shopper_state});
  else if (observed_at) Object.assign(sighting, {observed_at: hourStart(observed_at), rounded: true});
  return sighting;
}
async function evidenceSummary(db, t) {
  const rows = await allRows(db.prepare("SELECT notice,conditions,campaign,observed_at FROM observations WHERE thread=? LIMIT 2000").bind(t.id));
  const notices = {checked: 0, none: 0, shown: 0, near: 0, link: 0, elsewhere: 0};
  const setups = {}, times = [];
  for (const row of rows) {
    if (row.notice) {
      notices.checked++;
      if (row.notice === "none") notices.none++;
      else notices.shown++;
      if (row.notice === "near-price") notices.near++;
      if (row.notice === "behind-link") notices.link++;
      if (row.notice === "elsewhere") notices.elsewhere++;
    }
    for (const [name, value] of Object.entries(row.conditions ? JSON.parse(row.conditions) : {})) {
      setups[name] ??= {};
      setups[name][value] = (setups[name][value] || 0) + 1;
    }
    if (row.observed_at) times.push(Date.parse(row.observed_at));
  }
  const reported = Object.keys(setups).length > 0;
  const summary = {notices, setups: null, setupsHidden: false, minShoppers: MIN_SETUP_SHOPPERS};
  if (reported && t.shoppers >= MIN_SETUP_SHOPPERS) summary.setups = setups;
  else if (reported) summary.setupsHidden = true;
  if (t.campaign && times.length > 1) summary.spreadMinutes = Math.round((Math.max(...times) - Math.min(...times)) / 60000);
  return summary;
}

async function ledgerDay(db, day) {
  const rows = await allRows(db.prepare("SELECT hash FROM evidence_log WHERE day=? ORDER BY hash").bind(day));
  const text = rows.map(r => r.hash + "\n").join("");
  return {day, count: rows.length, complete: day < new Date().toISOString().slice(0, 10), root: await hashText(text), text, fingerprints: rows.map(r => r.hash)};
}
export async function ledgerApi(request, env) {
  try {
    if (request.method !== "GET") throw new InputError("Method unavailable.", 405);
    const params = new URL(request.url).searchParams, day = params.get("day");
    if (!day) {
      const days = await allRows(env.DB.prepare("SELECT day,COUNT(*) AS count FROM evidence_log GROUP BY day ORDER BY day DESC LIMIT ?").bind(LEDGER_DAYS));
      return json({days: await Promise.all(days.map(async d => {const {text, fingerprints, ...rest} = await ledgerDay(env.DB, d.day); return rest;}))});
    }
    if (!/^\d{4}-\d\d-\d\d$/.test(day) || new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day) throw new InputError("Use a date like 2026-11-21.");
    const ledger = await ledgerDay(env.DB, day);
    const cache = ledger.complete ? "public, max-age=3600" : "no-store";
    if (params.get("format") === "text")
      return new Response(ledger.text, {headers: {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": cache, "X-Content-Type-Options": "nosniff", "X-Ledger-Root": ledger.root}});
    const {text, ...body} = ledger;
    return Response.json(body, {headers: {"Cache-Control": cache, "X-Content-Type-Options": "nosniff"}});
  } catch (error) {
    if (error instanceof InputError) return json({error: error.message}, error.status);
    console.error("Ledger request failed", error?.name);
    return json({error: "The fingerprint list is temporarily unavailable."}, 503);
  }
}
