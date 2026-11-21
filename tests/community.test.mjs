import {test} from "node:test";
import assert from "node:assert/strict";
import {localDatabase} from "../scripts/local-database.mjs";
import worker from "../dist/server/index.js";
import {cheaperCount} from "../public/price-plot.js";
import {spread} from "../public/data.js";

const origin = "https://pricewitness.test";
const quote = {cents: 8000, context: "Signed out, including fees", seen: "2026-01-01"};
const input = {action:"quote", key:"post-one", merchant:"Test seller", title:"Matching offer", category:"Retail", variant:"One new item", currency:"USD", quotes:[quote]};

function fixture(t) {
  const DB = localDatabase(":memory:");
  t.after(() => DB.close());
  return async function call(owner, body, from = origin, params = {}) {
    const headers = {"content-type":"application/json", origin:from};
    if (owner) headers["oai-authenticated-user-id"] = owner;
    const req = new Request(origin + "/api/community?" + new URLSearchParams(params), {headers, method:body ? "POST" : "GET", body:body ? JSON.stringify(body) : undefined});
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

test("featured ranges expose the underlying sightings, even across multiple pages", async t => {
  const call=fixture(t);
  const read=params=>call("",null,origin,params);
  const {item:sample,choices}=await read({mode:"featured"});
  assert.equal(choices.length,4);
  assert.equal((await read({mode:"featured",id:choices[1].id})).item.id,choices[1].id);
  assert.equal((await read({mode:"featured",id:"expired"})).item.id,sample.id);
  assert.deepEqual(cheaperCount(sample.plot.bins,28999),{lower:100,upper:100});
  assert.ok(sample.examples);
  assert.equal(sample.quotes,undefined);
  assert.equal(sample.plot.edges[0].cents,sample.plot.low);
  assert.equal(sample.plot.edges[1].cents,sample.plot.high);
  const {thread}=await call("one",input);
  for (let i=0;i<15;i++) {
    await call("two",{...input,thread,key:"middle-"+i,quotes:[{...quote,cents:9000}]});
  }
  await call("three",{...input,thread,key:"last",quotes:[{...quote,cents:10000,context:"Includes delivery"}]});
  const feature=(await read({mode:"featured"})).item;
  assert.equal(feature.id,thread);
  assert.equal(feature.count,17);
  assert.equal(feature.plot.median,9000);
  assert.equal(feature.plot.edges[1].context,"Includes delivery");
  assert.equal(feature.plot.bins.reduce((n,b)=>n+b.n,0),17);
  const band=feature.plot.bins.find(b=>b.n===15);
  assert.equal(band.minSeen,9000);
  assert.equal(band.maxSeen,9000);
  const params={mode:"sightings",id:thread,min:band.lo,max:band.hi};
  const first=await read(params);
  const second=await read({...params,offset:first.rows.length});
  assert.ok(first.more);
  assert.equal(second.more,false);
  const rows=[...first.rows,...second.rows];
  assert.equal(new Set(rows.map(r=>r.id)).size,15);
  assert.ok(rows.every(r=>r.cents===9000));
  for (const limits of [{min:10001,max:10000},{min:-1,max:100},{min:0}]) {
    assert.equal((await read({mode:"sightings",id:thread,...limits})).status,400);
  }
});

test("board pages keep live and example comparisons in the selected sort order", async t => {
  const call=fixture(t);
  for (let i=0;i<16;i++) {
    await call("one",{...input,key:"offer-"+i,title:"Offer "+i,quotes:[quote,{...quote,cents:8000+1000*i}]});
  }
  let offset=0;
  const collected=[];
  do {
    const board=await call("",null,origin,{mode:"board",sort:"gap",offset});
    collected.push(...board.threads);
    offset=board.next;
  } while (offset!==null);
  assert.equal(collected.length,27);
  assert.equal(new Set(collected.map(t=>t.id)).size,27);
  assert.deepEqual(collected.map(t=>t.percent),collected.map(t=>t.percent).sort((a,b)=>b-a));
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

test("private comparisons respect ties and only promise counts supported by the bin",()=>{
  const grouped=[{lo:100,hi:109,n:4,minSeen:102,maxSeen:108},{lo:110,hi:110,n:2}];
  for (const [input,lower,upper] of [[0,0,0],[102,0,0],[106,1,3],[108,1,3],[110,4,4],[111,6,6]]) {
    assert.deepEqual(cheaperCount(grouped,input),{lower,upper});
  }
  assert.deepEqual(cheaperCount([{lo:0,hi:5,n:2}],3),{lower:1,upper:1});
});

test("offer search matches separated words across the same live or example offer",async t=>{
  const call=fixture(t);
  const {thread}=await call("one",input);
  const board=q=>call("",null,origin,{mode:"board",q});
  assert.deepEqual((await board("WIRELESS headphones")).threads.map(t=>t.id),["example-headphones"]);
  assert.deepEqual((await board("seller matching")).threads.map(t=>t.id),[thread]);
  assert.equal((await board("headphones nonexistent")).total,0);
});
