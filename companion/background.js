import {providerDirectory} from "./providers.js";
import {pickVisiblePrice} from "./picker.js";

const ready=chrome.storage.local.setAccessLevel({accessLevel:"TRUSTED_CONTEXTS"});
const popupURL=chrome.runtime.getURL("popup.html");

function onDomain(url,domain) {
  if(!url)return false;
  const site=new URL(url);
  return site.protocol==="https:" && (site.hostname===domain || site.hostname.endsWith("."+domain));
}
async function upstream(pair,data) {
  const headers={Authorization:"Bearer "+pair.token};
  if(data)headers["Content-Type"]="application/json";
  const response=await fetch(pair.endpoint,{method:data?"POST":"GET",headers,credentials:"omit",redirect:"error",cache:"no-store",body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(10000)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||"The feed could not receive this request.");
  return result;
}
// Page text behind each fingerprint stays in this browser so the shopper can prove what they saw.
async function keepCapture(entry) {
  const {captures=[]}=await chrome.storage.local.get("captures");
  await chrome.storage.local.set({captures:[entry,...captures].slice(0,200)});
}
async function stopWatch(watch) {
  if(!watch)return;
  await chrome.storage.session.remove("watch");
  await chrome.tabs.sendMessage(watch.tabId,{action:"end",watchId:watch.id}).catch(()=>{});
}
async function handle(message,sender) {
  await ready;
  const {pairs=[],selectedId}=await chrome.storage.local.get(["pairs","selectedId"]);
  const pair=pairs.find(entry=>entry.id===selectedId);
  const {watch}=await chrome.storage.session.get("watch");
  if(sender.url===popupURL){
    switch(message.action){
      case "state": return {feed:pair?.feed,watch:watch?.until>Date.now()?watch:null,
        captures:((await chrome.storage.local.get("captures")).captures||[]).length,
        choices:pairs.map(p=>({id:p.id,label:p.feed.spec.provider+" · "+p.feed.spec.offer+" · "+p.feed.market}))};
      case "choose":{
        if(!pairs.some(p=>p.id===message.id))throw Error("Feed unavailable.");
        await stopWatch(watch);await chrome.storage.local.set({selectedId:message.id});return {};
      }
      case "pair":{
        const feed=await upstream(message);
        if(!feed.spec || !Object.hasOwn(providerDirectory,feed.spec.provider) || providerDirectory[feed.spec.provider][1]!==feed.domain || !feed.id) throw Error("This site did not return a supported feed.");
        await stopWatch(watch);
        const next={id:feed.id,endpoint:message.endpoint,token:message.token,feed};
        await chrome.storage.local.set({pairs:[...pairs.filter(p=>p.id!==feed.id),next],selectedId:feed.id});
        return {};
      }
      case "forget":{
        await stopWatch(watch);
        const remaining=pairs.filter(p=>p.id!==selectedId);
        await chrome.storage.local.set({pairs:remaining,selectedId:remaining[0]?.id??null});return {};
      }
      case "stop":await stopWatch(watch);return {};
      case "captures":return {captures:(await chrome.storage.local.get("captures")).captures||[]};
      case "clear-captures":await chrome.storage.local.remove("captures");return {};
      case "pick":{
        if(!pair)throw Error("Pair a feed first.");
        const tab=await chrome.tabs.get(message.tabId);
        if(!onDomain(tab.url,pair.feed.domain))throw Error("Open your matching offer on "+pair.feed.domain+" first.");
        await stopWatch(watch);
        const next={id:crypto.randomUUID(),tabId:tab.id,until:Date.now()+15*60000};
        await chrome.storage.session.set({watch:next});
        try {
          await chrome.scripting.executeScript({target:{tabId:tab.id},func:pickVisiblePrice,args:[next.id,next.until,pair.feed.spec.offer,pair.feed.market]});
        } catch(e){await stopWatch(next);throw e}
        return {};
      }
    }
  }
  if(!pair||!watch||sender.tab?.id!==watch.tabId||sender.frameId!==0||message.watchId!==watch.id||!onDomain(sender.url,pair.feed.domain))throw Error("Sharing has ended.");
  if(message.action==="finished"){await stopWatch(watch);return {}}
  if(message.action!=="capture"||watch.until<=Date.now())throw Error("Sharing has ended.");
  const {eventId,observedAt,cents,notice,proofHash}=message.event;
  const device=globalThis.navigator?.userAgentData?.mobile?"phone":"computer";
  const result=await upstream(pair,{eventId,observedAt,cents,notice,proofHash,conditions:{surface:"website",device}});
  await keepCapture({observedAt,cents,notice,proofHash,provider:pair.feed.spec.provider,offer:pair.feed.spec.offer,market:pair.feed.market,
    campaign:pair.feed.campaign||"",url:String(message.page?.url||"").slice(0,500),text:String(message.page?.snippet||"").slice(0,1500),
    recipe:'SHA-256 of JSON ["pw-page-v1", url, observedAt, cents, text]'});
  return result;
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  handle(message,sender).then(respond,e=>respond({error:e.message||"Feed unavailable."}));
  return true;
});
async function tabEnded(id){
  const {watch}=await chrome.storage.session.get("watch");
  if(watch?.tabId===id)await stopWatch(watch);
}
chrome.tabs.onRemoved.addListener(tabEnded);
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status==="loading"||change.url)tabEnded(id)});
