import {test} from "node:test";
import assert from "node:assert/strict";
import {markets} from "../public/markets.js";
import {sharedDraft} from "../public/share-draft.js";
import worker from "../dist/server/index.js";
import {localDatabase} from "../scripts/local-database.mjs";

test("phone shares create a private price draft and discard paths, addresses and order numbers",async()=>{
  async function share(input) {
    const req=new Request("https://example.test/share-price",{method:"POST",body:new URLSearchParams(input)});
    const res=await worker.fetch(req,{});
    assert.equal(res.status,303);
    return new URL(res.headers.get("location"));
  }
  const result=await share({title:"A private order",text:"$12.45 · 123 Test St",url:"https://www.target.com/p/private?order=secret"});
  assert.equal(result.hash,"#share=1&provider=Target&cents=1245");
  assert.equal(result.search,"");
  assert.equal((await share({text:"DoorDash $4.99 delivery and $29.20 total"})).hash,"#share=1&provider=DoorDash");
  assert.equal((await share({url:"https://example.test/?message=Walmart"})).hash,"#share=1");
  assert.equal((await share({text:"CAD $19.99 at Walmart"})).hash,"#share=1&provider=Walmart");
});

test("the directory routes every provider through pairing and keeps observations inside that provider",async t=>{
  const {connect,send,event,get}=setup(t),threads=new Set();
  for(const [provider,policy] of Object.entries(markets)){
    const spec={provider,offer:policy.category==="Flights"?"AA 123":"Example offer",variant:"Standard terms",
      fulfillment:policy.modes[0],originZip:"28205",destinationZip:"28202",branch:"Store 1",
      productCode:"00123456789",city:"Charlotte, NC",checkIn:"2027-04-01",checkOut:"2027-04-03",adults:"2",
      departure:"clt",arrival:"bos",flyDate:"2027-04-01",phase:"Standard",marketCountry:"US"};
    const {token,status}=await connect(provider,spec);assert.equal(status,201,provider);
    const {thread}=await send(token,event("offer-1",10000));assert.ok(thread,provider);
    assert.ok(!threads.has(thread),provider);threads.add(thread);
    const {item}=await get(thread);assert.equal(item.merchant,provider);assert.equal(item.category,policy.category);
    assert.equal(sharedDraft(new URLSearchParams({url:"https://www."+policy.domain+"/"})).get("provider"),provider);
  }
  assert.equal(threads.size,45);
  assert.equal(sharedDraft(new URLSearchParams({text:"BookingXcom $12"})).get("provider"),null);
});

test("travel dates, occupancy, itinerary and buyer market define separate comparable offers",async t=>{
  const {connect,send,event}=setup(t);
  async function thread(spec){
    const {token}=await connect("shopper",spec);
    assert.ok(token);return (await send(token,event("p1",9900))).thread;
  }
  const hotel={provider:"Booking.com",offer:"Example hotel",variant:"King, flexible, breakfast",fulfillment:markets["Booking.com"].modes[0],
    city:"Charlotte NC",marketCountry:"US",checkIn:"2027-02-12",checkOut:"2027-02-14",adults:"2"};
  const initial=await thread(hotel);
  for(const change of [{adults:"1"},{marketCountry:"CA"},{checkOut:"2027-02-15"},{variant:"King, nonrefundable"}])
    assert.notEqual(await thread({...hotel,...change}),initial);
  for(const change of [{checkOut:hotel.checkIn},{checkOut:"2027-02-30"},{adults:"0"}])
    assert.equal((await connect("shopper",{...hotel,...change})).status,400);
  const flight={provider:"American Airlines",offer:"AA 123",variant:"Main cabin, no bag",fulfillment:markets["American Airlines"].modes[0],
    departure:"clt",arrival:"bos",flyDate:"2027-02-14",marketCountry:"US"};
  const air=await thread(flight);
  assert.equal(await thread({...flight,offer:"aa123",departure:"CLT"}),air);
  assert.notEqual(await thread({...flight,arrival:"JFK"}),air);
  assert.notEqual(await thread({...flight,flyDate:"2027-02-15"}),air);
  assert.equal((await connect("a",{...flight,arrival:"CLT"})).status,400);
});
test("grocery codes survive label variations; plans distinguish billing schedules and price stages",async t=>{
  const {connect,send,event,call}=setup(t);
  async function thread(spec){const {token}=await connect("a",spec);assert.ok(token);return (await send(token,event("p1",2500))).thread}
  const sku={provider:"Harris Teeter",offer:"Milk",variant:"Brand A, 1 gallon",productCode:"001234",fulfillment:"Pickup",originZip:"28205",branch:"Branch 1"};
  const item=await thread(sku);assert.equal(await thread({...sku,offer:"Whole milk"}),item);
  assert.notEqual(await thread({...sku,productCode:"1234"}),item);
  const found=await call("/api/community?mode=board&q=001234");
  assert.deepEqual(found.threads.map(row=>row.id),[item]);
  assert.notEqual(await thread({...sku,branch:"Branch 2"}),item);
  const plan={provider:"Adobe",offer:"Creative Cloud",variant:"Individual, one seat, direct",fulfillment:"Annual billed monthly",phase:"Introductory"};
  const intro=await thread(plan);
  assert.notEqual(await thread({...plan,phase:"Renewal"}),intro);
  assert.notEqual(await thread({...plan,fulfillment:"Monthly"}),intro);
});
const ride={provider:"Uber",offer:"UberX",variant:"NoDa station to airport terminal",originZip:"28205",destinationZip:"28208",fulfillment:"On demand"};
const origin="https://example.test";
function setup(t) {
  const DB=localDatabase(":memory:");
  t.after(()=>DB.close());
  async function call(path,{owner,token,body,from}={}) {
    const headers=new Headers({"Content-Type":"application/json"});
    if(owner)headers.set("oai-authenticated-user-id",owner);
    if(token)headers.set("Authorization","Bearer "+token);
    if(from)headers.set("Origin",from);
    const req=new Request(origin+path,{method:body?"POST":"GET",headers,body:body?JSON.stringify(body):undefined});
    const response=await worker.fetch(req,{DB});
    return {status:response.status,...await response.json()};
  }
  const connect=(owner,spec=ride,context="No promotion")=>call("/api/feeds",{owner,body:{action:"connect",spec,context}});
  const get=id=>call("/api/community?mode=item&id="+id);
  const send=(token,event)=>call("/api/price-events",{token,body:event});
  // Fixed points inside the previous complete half-hour window, safe at midnight and at test start.
  const base=Math.floor(Date.now()/1800000)*1800000-1800000;
  const event=(id,cents,offset=120000)=>({eventId:id,cents,observedAt:new Date(base+offset).toISOString()});
  return {DB,call,connect,get,send,event};
}
test("personal feeds verify ownership, disclose keys once, and stop accepting events after revocation",async t=>{
  const {DB,call,connect,send,event}=setup(t);
  assert.equal((await connect(null)).status,401);
  assert.equal((await call("/api/feeds",{owner:"a",from:"https://other.test",body:{action:"connect",spec:ride,context:"Standard"}})).status,403);
  const {id,token,status}=await connect("a");
  assert.equal(status,201);
  assert.notEqual(DB.prepare("SELECT token_hash FROM price_feeds").first().token_hash,token);
  assert.deepEqual((await call("/api/feeds",{owner:"b"})).feeds,[]);
  const listed=await call("/api/feeds",{owner:"a"});
  assert.equal(listed.feeds.length,1);
  assert.ok(!JSON.stringify(listed).includes(token));
  assert.equal((await call("/api/price-events",{owner:"a"})).status,401);
  assert.equal((await call("/api/price-events",{token})).domain,"uber.com");
  assert.equal((await call("/api/feeds",{token,body:{action:"disconnect",id}})).status,401);
  await call("/api/feeds",{owner:"b",body:{action:"disconnect",id}});
  assert.equal((await send(token,event("p1",1750))).status,200);
  await call("/api/feeds",{owner:"a",body:{action:"disconnect",id}});
  assert.equal((await send(token,event("p2",1700))).status,401);
  assert.deepEqual((await call("/api/feeds",{owner:"a"})).feeds,[]);
});
test("same local market, offer and window converge; retries and older events cannot overweight one shopper",async t=>{
  const {call,connect,get,send,event}=setup(t);
  const a=await connect("a"), b=await connect("b",{...ride,offer:" uberx "},"Member fare");
  const one=event("p1",2425);
  const {thread,status}=await send(a.token,one);assert.equal(status,200);
  assert.equal((await send(a.token,one)).thread,thread);
  assert.equal((await send(a.token,{...one,cents:1})).status,409);
  assert.equal((await send(a.token,event("p2",1800,240000))).thread,thread);
  await send(a.token,event("arrived-late",2500,180000));
  assert.equal((await send(b.token,one)).thread,thread);
  const {item}=await get(thread);
  assert.equal(item.count,2);assert.equal(item.plot.median,2112.5);
  assert.equal(item.market,"28205 → 28208 · On demand");
  assert.equal(item.quotes[0].channel,"Connected app");
  // Other people see the hour; the contributor sees their own exact time.
  const exact=event("p2",1800,240000).observedAt;
  assert.equal(item.quotes[0].cents,1800);assert.ok(item.quotes[0].rounded);
  assert.equal(item.quotes[0].observed_at,new Date(Math.floor(Date.parse(exact)/3600000)*3600000).toISOString());
  assert.equal((await call("/api/community?mode=item&id="+thread,{owner:"a"})).item.quotes.find(x=>x.own).observed_at,exact);
  assert.ok(!JSON.stringify(item).includes(a.token));
  const {thread:manual}=await call("/api/feeds",{owner:"c",body:{action:"publish",spec:ride,context:"Signed out",...one}});
  assert.equal(manual,thread);
  assert.equal((await get(thread)).item.count,3);
  assert.equal((await call("/api/community",{owner:"a",body:{action:"quote",key:"p3",thread,quotes:[{cents:123,context:"x",seen:one.observedAt.slice(0,10)}]}})).status,400);
  const bOwned=(await call("/api/community?mode=item&id="+thread,{owner:"b"})).item.quotes.find(x=>x.own);
  await call("/api/community",{owner:"b",body:{action:"remove-quote",id:bOwned.id}});
  await send(b.token,one);
  assert.equal((await get(thread)).item.count,2);
  for(const changes of [{originZip:"28202"},{destinationZip:"28209"},{originZip:"28208",destinationZip:"28205"},{provider:"Lyft"},{variant:"Different airport entrance"}]){
    const feed=await connect("d",{...ride,...changes});
    assert.notEqual((await send(feed.token,one)).thread,thread);
  }
  assert.notEqual((await send(a.token,event("later-slot",1800,17*60000))).thread,thread);
  const board=await call("/api/community?mode=board&q=28205");
  assert.ok(board.threads.some(row=>row.id===thread));
  assert.ok((await call("/api/local-updates")).revision>0);
});
test("delivery and retail require the right location for each fulfillment mode",async t=>{
  const {connect,send,event,get}=setup(t);
  for(const provider of ["DoorDash","Grubhub","Walmart","Target"]){
    const spec={provider,fulfillment:"Delivery",offer:"One item",variant:"Size and seller",branch:"Branch 183",originZip:"28205",destinationZip:"28202"};
    for(const invalid of [{branch:""},{originZip:"bad"},{destinationZip:"12 Main St"},{fulfillment:"unknown"}]){
      assert.equal((await connect("a",{...spec,...invalid})).status,400);
    }
    const threads=[];
    for(const change of [{},{branch:"Branch 184"},{fulfillment:"Pickup",destinationZip:""}]){
      const {token}=await connect("a",{...spec,...change});
      const sent=await send(token,event("p1",690));assert.equal(sent.status,200);
      threads.push(sent.thread);
    }
    assert.equal(new Set(threads).size,3);
    const {item}=await get(threads[0]);
    assert.equal(item.period_minutes,["Target","Walmart"].includes(provider)?1440:30);
    assert.ok(item.market.includes("28205 → 28202"));
  }
  const ship={provider:"Walmart",fulfillment:"Shipping",offer:"Tea",variant:"20 bags",destinationZip:"02108"};
  const feed=await connect("a",ship);
  assert.equal(feed.status,201);
  const {thread}=await send(feed.token,event("p1",400));
  assert.equal((await get(thread)).item.market,"Shipped to 02108");
  for(const bad of [{cents:-2},{observedAt:"2026-02-31T12:00:00Z"},{observedAt:new Date(Date.now()-2*86400000).toISOString()},{observedAt:new Date(Date.now()+3600000).toISOString()}]){
    assert.equal((await send(feed.token,{...event("bad-event",1),...bad})).status,400);
  }
});
