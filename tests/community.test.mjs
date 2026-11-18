import {test} from "node:test";
import assert from "node:assert/strict";
import {localDatabase} from "../scripts/local-database.mjs";
import worker from "../dist/server/index.js";
import {spread} from "../public/data.js";

const origin = "https://pricewitness.test";
const quote = {cents: 8000, context: "Signed out, including fees", seen: "2026-01-01"};
const input = {action:"quote", key:"post-one", merchant:"Test seller", title:"Matching offer", category:"Retail", variant:"One new item", currency:"USD", quotes:[quote]};

function fixture(t) {
  const DB = localDatabase(":memory:");
  t.after(() => DB.close());
  return async function call(owner, body, from = origin) {
    const headers = {"content-type":"application/json", origin:from};
    if (owner) headers["oai-authenticated-user-id"] = owner;
    const req = new Request(origin + "/api/community", {headers, method:body ? "POST" : "GET", body:body ? JSON.stringify(body) : undefined});
    const response = await worker.fetch(req, {DB});
    return {status:response.status, ...await response.json()};
  };
}

test("like-for-like reports from two shoppers converge, retries do not duplicate, and currencies remain separate", async t => {
  const call = fixture(t);
  const first = await call("one", input);
  assert.equal(first.status, 200);
  await call("one", input);
  const second = await call("two", {...input, key:"post-two", title:" MATCHING offer ", quotes:[{...quote,cents:10000}]});
  assert.equal(first.thread, second.thread);
  const euro = await call("one", {...input,key:"separate",currency:"EUR"});
  assert.notEqual(euro.thread,first.thread);
  const {threads} = await call("two");
  const item = threads.find(t => t.id === first.thread);
  assert.equal(item.quotes.length,2);
  assert.deepEqual(spread(item),{low:8000,high:10000,gap:2000,percent:25});
  assert.equal(item.quotes.filter(q=>q.own).length,1);
  assert.ok(!JSON.stringify(threads).includes('"owner"'));
});

test("saves are private, likes are idempotent, and only the author can remove a contribution",async t=>{
  const call=fixture(t);
  const {thread}=await call("one",input);
  for (const action of ["like","save","like"]) await call("one",{action,thread,enabled:true});
  await call("two",{action:"comment",thread,body:"Same model?",key:"comment1"});
  const a=(await call("one")).threads.find(t=>t.id===thread);
  const b=(await call("two")).threads.find(t=>t.id===thread);
  assert.ok(a.saved && a.liked);
  assert.ok(!b.saved && !b.liked);
  assert.equal(b.votes,1);
  assert.equal(b.comments.length,1);
  await call("one",{action:"remove-comment",id:b.comments[0].id});
  await call("two",{action:"remove-quote",id:a.quotes[0].id});
  const kept=(await call("one")).threads.find(t=>t.id===thread);
  assert.equal(kept.quotes.length,1);
  assert.equal(kept.comments.length,1);
  await call("two",{action:"remove-comment",id:b.comments[0].id});
  await call("one",{action:"remove-quote",id:a.quotes[0].id});
  assert.ok(!(await call("one")).threads.some(t=>t.id===thread));
});

test("invalid prices, malformed dates, unsigned writes, foreign origins, and adding to example ranges are rejected",async t=>{
  const call=fixture(t);
  assert.equal((await call("",input)).status,401);
  assert.equal((await call("one",input,"https://elsewhere.test")).status,403);
  for (const invalid of [{cents:-100},{seen:"2026-02-31"},{context:""}])
    assert.equal((await call("one",{...input,quotes:[quote,{...quote,...invalid}]})).status,400);
  assert.equal((await call("one",{...input,thread:"example-headphones"})).status,400);
  const feed=await call("");
  assert.ok(feed.threads.length && feed.threads.every(t=>t.examples));
  assert.equal(feed.signedIn,false);
});
