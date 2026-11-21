import {test} from "node:test";
import assert from "node:assert/strict";
import {runInNewContext} from "node:vm";
import {localDatabase} from "../scripts/local-database.mjs";
import worker from "../dist/server/index.js";

function storage() {
  const state={};
  return {
    setAccessLevel:async()=>{},get:async()=>({...state}),
    set:async value=>Object.assign(state,value),remove:async key=>{delete state[key]}
  };
}
function listener() {
  let callback;
  return {addListener:fn=>{callback=fn},removeListener:()=>{callback=null},emit:(...args)=>callback?.(...args)};
}
class Element {
  constructor(){this.style={};this.children=[];this.isConnected=true}
  append(...nodes){this.children.push(...nodes)}
  remove(){this.isConnected=false}
  attachShadow(){this.root=new Element();return this.root}
  checkVisibility(){return true}
}

test("paired companion requires price confirmation and sends only changing visible prices to its scoped feed",async t=>{
  const DB=localDatabase(":memory:");t.after(()=>DB.close());
  const endpoint="https://price.test/api/price-events", providerURL="https://www.target.com/p/example";
  const req=new Request("https://price.test/api/feeds",{method:"POST",headers:{"content-type":"application/json","oai-authenticated-user-id":"tester"},body:JSON.stringify({
    action:"connect",context:"No membership",spec:{offer:"Tea",variant:"20 bags, Target",provider:"Target",originZip:"28205",branch:"Store 183",fulfillment:"Pickup"}
  })});
  const {token}=await (await worker.fetch(req,{DB})).json();
  const transmissions=[];
  t.mock.method(globalThis,"fetch",async(url,options)=>{
    assert.equal(url,endpoint);
    if(options.body)transmissions.push(JSON.parse(options.body));
    return worker.fetch(new Request(url,options),{DB});
  });

  const messages=listener(), pageMessages=listener(),popup={url:"chrome-extension://test/popup.html"};
  const page={url:providerURL,frameId:0,tab:{id:42}},events=new Map();
  const document={hidden:false,documentElement:new Element(),createElement:()=>new Element(),
    addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const send=(input,sender)=>new Promise(resolve=>messages.emit(input,sender,resolve));
  let tick,completion,activeUrl=providerURL;
  globalThis.chrome={
    storage:{session:storage(),local:storage()},runtime:{getURL:file=>"chrome-extension://test/"+file,onMessage:messages},
    tabs:{get:async()=>({id:42,url:activeUrl}),onUpdated:listener(),onRemoved:listener(),sendMessage:async(id,m)=>pageMessages.emit(m)},
    scripting:{executeScript:async({func,args})=>{
      runInNewContext("("+func.toString()+")(...args)",{args,document,HTMLElement:Element,crypto,location:{href:activeUrl},
        setInterval:fn=>{tick=fn;return 1},clearInterval:()=>{},setTimeout:()=>{},
        chrome:{runtime:{onMessage:pageMessages,sendMessage:m=>(completion=send(m,page))}}});
    }}
  };
  t.after(()=>{delete globalThis.chrome});
  await import("../companion/background.js");
  assert.deepEqual(await send({action:"pair",endpoint,token},popup),{});
  const paired=await send({action:"state"},popup);assert.equal(paired.choices.length,1);
  assert.ok(!JSON.stringify(paired).includes(token));
  activeUrl="https://www.walmart.com/some-offer";
  assert.ok((await send({action:"pick",tabId:42},popup)).error);
  activeUrl=providerURL;
  assert.deepEqual(await send({action:"pick",tabId:42},popup),{});
  const node=new Element();node.innerText="$12.40";
  events.get("click")({isTrusted:true,target:node,composedPath:()=>[node],preventDefault(){},stopImmediatePropagation(){}});
  assert.equal(transmissions.length,0);
  const controls=document.documentElement.children[0].root.children[0].children;
  const confirm=controls.find(e=>e.textContent==="Start sharing");assert.ok(!confirm.hidden);
  confirm.onclick({isTrusted:true});
  const {thread}=await completion;
  assert.ok(thread);
  await tick();
  assert.equal(transmissions.length,1);
  node.innerText="$13.05";document.hidden=true;
  await tick();assert.equal(transmissions.length,1);
  document.hidden=false;await tick();
  assert.deepEqual(transmissions.map(x=>x.cents),[1240,1305]);
  assert.deepEqual(Object.keys(transmissions[1]).sort(),["cents","eventId","observedAt"]);
  const item=await (await worker.fetch(new Request("https://price.test/api/community?mode=item&id="+thread),{DB})).json();
  assert.equal(item.item.count,1);assert.equal(item.item.high,1305);
  node.isConnected=false;await tick();await completion;
  assert.equal((await send({action:"state"},popup)).watch,null);
});
