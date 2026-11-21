import {noticeOptions,setupQuestions,shopperStates,evidenceTierLabels,optionLabel} from "./evidence.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const choice = (label, name, options, empty) => '<label class="field">' + escape(label) + '<select name="' + name + '">' +
  '<option value="">' + escape(empty) + '</option>' + options.map(([value, text]) => '<option value="' + escape(value) + '">' + escape(text) + '</option>').join("") + '</select></label>';
const money = (label, name, hint) => '<label class="field">' + escape(label) +
  '<input type="number" name="' + name + '" min="0" max="999999999.99" step="0.01" placeholder="0.00">' + (hint ? '<small>' + escape(hint) + '</small>' : '') + '</label>';

// Optional evidence for one price. Suffix keeps two prices in the same form apart.
export function evidenceFields(suffix = "") {
  const notices = noticeOptions.filter(([value]) => value);
  return '<div class="evidence-block">' +
    choice("Did the page say this price was personalized or set by an algorithm?", "notice" + suffix, notices, "Didn't check") +
    '<label class="field">Exact notice wording, if there was one<input name="noticeText' + suffix + '" maxlength="300" placeholder="e.g. This price was set by an algorithm using your personal data"></label>' +
    '<details class="evidence-more"><summary>Price breakdown and your setup <span class="form-note">(recommended)</span></summary><div class="field-set">' +
    '<div class="form-row">' + money("Crossed-out “was” price", "listCents" + suffix, "The higher price shown next to a sale price") +
      money("Fees added at checkout", "feesCents" + suffix, "Delivery, service or booking fees") + '</div>' +
    '<div class="form-row">' + money("Checkout total before tax", "totalCents" + suffix) +
      '<label class="field">Position in search results<input type="number" name="rank' + suffix + '" min="1" max="1000" step="1" placeholder="e.g. 3"></label></div>' +
    '<div class="setup-grid">' + setupQuestions.map(q => choice(q.label, q.name + suffix, q.options, "Not sure")).join("") +
      choice("State you were in", "shopperState" + suffix, shopperStates.map(s => [s, s]), "Prefer not to say") + '</div>' +
    '<p class="form-note">Other shoppers never see your setup or state one report at a time. They see totals once at least three people have reported the same offer.</p>' +
    '<label class="field">Screenshot of the price (stays on your device)<input type="file" name="proof' + suffix + '" accept="image/*">' +
      '<small>Your browser makes a digital fingerprint of the image. Only the fingerprint is sent. Keep the original file: it can later prove what you saw.</small></label>' +
    '</div></details></div>';
}

async function fingerprintFile(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
const centsOrNull = value => value === "" || value == null ? null : Math.round(Number(value) * 100);

export async function readEvidence(form, suffix = "") {
  const get = name => form.elements[name + suffix]?.value ?? "";
  const conditions = {};
  for (const q of setupQuestions) if (get(q.name)) conditions[q.name] = get(q.name);
  const file = form.elements["proof" + suffix]?.files?.[0];
  const rank = get("rank");
  return {
    listCents: centsOrNull(get("listCents")), feesCents: centsOrNull(get("feesCents")), totalCents: centsOrNull(get("totalCents")),
    rank: rank === "" ? null : Number(rank), notice: get("notice"), noticeText: get("noticeText").trim(),
    conditions, shopperState: get("shopperState"), proofHash: file ? await fingerprintFile(file) : ""
  };
}

// Plain-language badges for one sighting row.
export function evidenceBadges(x, formatPrice) {
  const parts = [];
  if (x.list_cents != null) parts.push("Was " + formatPrice(x.list_cents));
  if (x.fees_cents != null) parts.push("Fees " + formatPrice(x.fees_cents));
  if (x.total_cents != null) parts.push("Total " + formatPrice(x.total_cents));
  if (x.search_rank != null) parts.push("#" + x.search_rank + " in results");
  if (x.notice) parts.push(x.notice === "none" ? "No personalization notice" : optionLabel(noticeOptions, x.notice));
  if (x.conditions) parts.push(...setupQuestions.filter(q => x.conditions[q.name]).map(q => optionLabel(q.options, x.conditions[q.name])));
  if (x.shopper_state) parts.push(x.shopper_state);
  const facts = parts.length ? '<span class="evidence-facts">' + parts.map(escape).join(" · ") + '</span>' : "";
  const wording = x.notice_text ? '<q class="notice-quote">' + escape(x.notice_text) + '</q>' : "";
  const tier = x.tier != null ? '<span class="tier-chip tier-' + Number(x.tier) + '">' + escape(evidenceTierLabels[x.tier] || "") + '</span>' : "";
  const test = x.campaign ? '<span class="tier-chip">Price check ' + escape(x.campaign) + '</span>' : "";
  const print = x.record_hash ? '<code class="fingerprint" title="Record fingerprint ' + escape(x.record_hash) + '">' + escape(x.record_hash.slice(0, 12)) + '</code>' : "";
  return facts || wording || tier || print ? '<span class="evidence-line">' + tier + test + facts + wording + print + '</span>' : "";
}

// Totals across shoppers for one comparison.
export function evidenceSummary(summary) {
  if (!summary) return "";
  const n = summary.notices, lines = [];
  if (n.checked) {
    const where = [[n.near, "next to the price"], [n.link, "behind a link or in fine print"], [n.elsewhere, "elsewhere on the page"]]
      .filter(([count]) => count).map(([count, text]) => count + " " + text).join(", ");
    lines.push("<strong>Personalization notice:</strong> " + n.checked + " sighting" + (n.checked === 1 ? "" : "s") + " checked. " +
      (n.shown ? n.shown + " reported a notice (" + escape(where) + ")." : "None reported a notice."));
  }
  if (summary.setups) {
    const rows = setupQuestions.filter(q => summary.setups[q.name]).map(q =>
      escape(q.label.replace(/\?$/, "")) + ": " + q.options.filter(([value]) => summary.setups[q.name][value]).map(([value, text]) => summary.setups[q.name][value] + " " + escape(text.toLowerCase())).join(", "));
    if (rows.length) lines.push("<strong>Shopper setups:</strong> " + rows.join(" · "));
  } else if (summary.setupsHidden) {
    lines.push("Shopper setup totals appear once " + summary.minShoppers + " different shoppers report this offer.");
  }
  if (summary.spreadMinutes != null) lines.push("<strong>Timing:</strong> all prices in this price check were seen within " + summary.spreadMinutes + " minute" + (summary.spreadMinutes === 1 ? "" : "s") + ".");
  return lines.length ? '<div class="note-box evidence-summary">' + lines.map(line => "<p>" + line + "</p>").join("") + '</div>' : "";
}
