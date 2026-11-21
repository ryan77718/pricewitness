import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {localDatabase} from "../scripts/local-database.mjs";
import worker from "../dist/server/index.js";

const origin = "https://pricewitness.test";
const sha256 = text => createHash("sha256").update(text).digest("hex");
const today = () => new Date().toISOString().slice(0, 10);
const ride = {provider:"Uber", offer:"UberX", variant:"NoDa station to airport terminal", originZip:"28205", destinationZip:"28208", fulfillment:"On demand"};
const offer = {action:"quote", merchant:"Test grocer", title:"Coffee, 12 oz", category:"Groceries", variant:"Store 1, pickup", currency:"USD"};
const evidence = {
  listCents:1299, feesCents:199, totalCents:1198, rank:3, notice:"behind-link", noticeText:" Prices may be   personalized ",
  conditions:{signedIn:"yes", device:"phone", place:"store"}, shopperState:"NC", proofHash:"a".repeat(64)
};

function setup(t) {
  const DB = localDatabase(":memory:");
  t.after(() => DB.close());
  async function call(path, {owner, token, body} = {}) {
    const headers = new Headers({"Content-Type":"application/json"});
    if (owner) headers.set("oai-authenticated-user-id", owner);
    if (token) headers.set("Authorization", "Bearer " + token);
    const response = await worker.fetch(new Request(origin + path, {method:body ? "POST" : "GET", headers, body:body ? JSON.stringify(body) : undefined}), {DB});
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = {text}; }
    return {status:response.status, headers:response.headers, ...data};
  }
  const quote = (owner, key, extra = {}, fields = {}) => call("/api/community", {owner, body:{...offer, key, ...fields,
    quotes:[{cents:999, context:"Store app", seen:today(), observedAt:new Date(Date.now() - 600000).toISOString(), ...extra}]}});
  const item = (id, owner) => call("/api/community?mode=item&id=" + id, {owner});
  return {DB, call, quote, item};
}

test("evidence fields are stored, fingerprinted and listed once in the public daily list", async t => {
  const {DB, call, quote, item} = setup(t);
  const {thread, status} = await quote("one", "with-evidence", evidence);
  assert.equal(status, 200);
  await quote("one", "with-evidence", evidence); // A retry adds nothing.
  const mine = (await item(thread, "one")).item.quotes[0];
  assert.equal(mine.list_cents, 1299); assert.equal(mine.fees_cents, 199); assert.equal(mine.total_cents, 1198);
  assert.equal(mine.search_rank, 3); assert.equal(mine.notice, "behind-link"); assert.equal(mine.notice_text, "Prices may be personalized");
  assert.deepEqual(mine.conditions, {device:"phone", place:"store", signedIn:"yes"}); assert.equal(mine.shopper_state, "NC");
  assert.equal(mine.tier, 1); assert.match(mine.record_hash, /^[a-f0-9]{64}$/);

  // Another person sees the price breakdown and notice, but not the setup, the state or the minute.
  const theirs = (await item(thread, "two")).item.quotes[0];
  assert.equal(theirs.notice, "behind-link"); assert.equal(theirs.conditions, undefined); assert.equal(theirs.shopper_state, undefined);
  assert.ok(theirs.rounded); assert.equal(new Date(theirs.observed_at).getUTCMinutes(), 0);

  // The fingerprint can be recomputed from the full record held by the site.
  const row = DB.prepare("SELECT * FROM observations WHERE thread=?").bind(thread).first();
  assert.match(row.record_salt, /^[a-f0-9]{32}$/);
  assert.equal(JSON.stringify((await item(thread, "two")).item).includes(row.record_salt), false);
  const recipe = ["pw-evidence-v1", row.record_salt, row.id, row.thread, row.cents, 1299, 199, 1198, 3, "behind-link", "Prices may be personalized",
    JSON.stringify({device:"phone", place:"store", signedIn:"yes"}), "NC", row.observed_at, "a".repeat(64), "", 1, row.received_at];
  assert.equal(sha256(JSON.stringify(recipe)), row.record_hash);

  const day = row.received_at.slice(0, 10);
  const ledger = await call("/api/ledger?day=" + day);
  assert.deepEqual(ledger.fingerprints, [row.record_hash]);
  assert.equal(ledger.complete, false);
  const text = await call("/api/ledger?day=" + day + "&format=text");
  assert.equal(text.text, row.record_hash + "\n");
  assert.equal(sha256(text.text), ledger.root);
  assert.equal(text.headers.get("X-Ledger-Root"), ledger.root);
  assert.deepEqual((await call("/api/ledger")).days.map(d => [d.day, d.count]), [[day, 1]]);
  assert.equal((await call("/api/ledger?day=2026-02-30")).status, 400);

  // Removing a report keeps its fingerprint in the list; the fingerprint alone reveals nothing.
  await call("/api/community", {owner:"one", body:{action:"remove-quote", id:row.id}});
  assert.equal((await call("/api/ledger?day=" + day)).count, 1);
});

test("unknown or malformed evidence is rejected", async t => {
  const {quote, item} = setup(t);
  const invalid = [{notice:"maybe"}, {conditions:{mood:"happy"}}, {conditions:{device:"watch"}}, {conditions:"signed in"},
    {shopperState:"ZZ"}, {proofHash:"abc"}, {listCents:-1}, {feesCents:1.5}, {rank:0}, {noticeText:"x".repeat(301)},
    {observedAt:"yesterday"}, {observedAt:new Date(Date.now() + 3600000).toISOString()}];
  for (const [i, bad] of invalid.entries()) {
    const reply = await quote("one", "bad-" + i, bad);
    assert.equal(reply.status, 400, JSON.stringify(bad)); assert.notEqual(reply.error, "Invalid record.");
  }
  for (const [i, campaign] of ["a", "bad code!", "x".repeat(41)].entries())
    assert.match((await quote("one", "code-" + i, {}, {campaign})).error, /price check code/);
  // A notice wording is kept only when the shopper says a notice was shown.
  const {thread} = await quote("one", "no-notice", {notice:"none", noticeText:"ignored"});
  assert.equal((await item(thread, "one")).item.quotes[0].notice_text, null);
});

test("price check codes keep organized tests apart and report how close together prices were seen", async t => {
  const {call, quote, item} = setup(t);
  const everyday = (await quote("one", "everyday")).thread;
  const tested = (await quote("one", "tested", {}, {campaign:"CLT-Grocery-1"})).thread;
  assert.notEqual(tested, everyday);
  assert.equal((await quote("two", "tested-2", {}, {campaign:"clt-grocery-1"})).thread, tested);
  // Adding to an existing comparison inherits its code.
  const added = await call("/api/community", {owner:"three", body:{action:"quote", key:"added", thread:tested, campaign:"other-test",
    quotes:[{cents:1099, context:"Signed out", seen:today()}]}});
  assert.equal(added.thread, tested);
  const shown = (await item(tested, "three")).item;
  assert.equal(shown.campaign, "clt-grocery-1"); assert.equal(shown.shoppers, 3);
  assert.ok(shown.quotes.every(q => q.campaign === "clt-grocery-1"));
  assert.ok((await call("/api/community?mode=board&q=clt-grocery-1")).threads.some(row => row.id === tested));

  // Connected feeds for a price check share one comparison even across clock windows.
  const connect = owner => call("/api/feeds", {owner, body:{action:"connect", spec:ride, context:"Standard account", campaign:"clt-rides-1"}});
  const a = await connect("a"), b = await connect("b");
  assert.equal(a.status, 201);
  const now = Date.now();
  const first = await call("/api/price-events", {token:a.token, body:{eventId:"e1", cents:2400, observedAt:new Date(now - 40 * 60000).toISOString(), proofHash:"b".repeat(64), notice:"none"}});
  const second = await call("/api/price-events", {token:b.token, body:{eventId:"e2", cents:2750, observedAt:new Date(now - 5 * 60000).toISOString()}});
  assert.equal(first.thread, second.thread);
  const local = (await item(first.thread, "a")).item;
  assert.equal(local.campaign, "clt-rides-1"); assert.equal(local.evidence.spreadMinutes, 35);
  const tiers = Object.fromEntries(local.quotes.map(q => [q.cents, q.tier]));
  assert.deepEqual(tiers, {2400:2, 2750:0});
  assert.equal(local.evidence.notices.checked, 1); assert.equal(local.evidence.notices.none, 1);
  // Without a code, the same two events fall in different 15-minute ride windows.
  const c = await call("/api/feeds", {owner:"c", body:{action:"connect", spec:ride, context:"Standard account"}});
  const x = await call("/api/price-events", {token:c.token, body:{eventId:"x1", cents:2400, observedAt:new Date(now - 40 * 60000).toISOString()}});
  const y = await call("/api/price-events", {token:c.token, body:{eventId:"x2", cents:2400, observedAt:new Date(now - 5 * 60000).toISOString()}});
  assert.notEqual(x.thread, y.thread); assert.notEqual(x.thread, first.thread);
  assert.equal((await call("/api/feeds", {owner:"a"})).feeds[0].campaign, "clt-rides-1");
});

test("setup totals stay hidden until three different shoppers report the same offer", async t => {
  const {quote, item} = setup(t);
  const {thread} = await quote("one", "s1", {conditions:{signedIn:"yes"}, notice:"near-price"});
  await quote("two", "s2", {conditions:{signedIn:"no"}, notice:"none"});
  let summary = (await item(thread)).item.evidence;
  assert.equal(summary.setups, null); assert.ok(summary.setupsHidden);
  assert.deepEqual([summary.notices.checked, summary.notices.shown, summary.notices.near], [2, 1, 1]);
  await quote("three", "s3", {conditions:{signedIn:"no", device:"computer"}});
  summary = (await item(thread)).item.evidence;
  assert.deepEqual(summary.setups, {signedIn:{yes:1, no:2}, device:{computer:1}});
  assert.equal(summary.setupsHidden, false);
});

test("daily lists are stamped with a standard RFC 3161 request for their SHA-256 root", async () => {
  const {timestampRequest} = await import("../scripts/stamp-ledger.mjs");
  const digest = createHash("sha256").update("a\n").digest(), nonce = Buffer.from("ff00000000000001", "hex");
  const request = timestampRequest(digest, nonce);
  assert.equal(request.length, 69);
  assert.equal(request.subarray(0, 7).toString("hex"), "30430201013031");
  assert.equal(request.subarray(7, 22).toString("hex"), "300d06096086480165030402010500"); // SHA-256
  assert.ok(request.subarray(24, 56).equals(digest));
  assert.equal(request.subarray(56, 66).toString("hex"), "02087f00000000000001"); // Nonce kept positive.
  assert.equal(request.subarray(66).toString("hex"), "0101ff");
  assert.throws(() => timestampRequest(Buffer.alloc(20)));
});
