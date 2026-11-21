// This function is injected in an isolated world after a click in the companion.
// Keep it self-contained. Only prices, observation times, the shopper's notice answer and a page
// fingerprint leave this browser. The page text behind the fingerprint stays in the companion's storage.
export function pickVisiblePrice(watchId,until,offer,market) {
  const originalUrl=location.href, pageUrl=location.href.split(/[?#]/)[0];
  const host=document.createElement("div");
  host.style.cssText="all:initial;position:fixed;z-index:2147483647;bottom:16px;right:16px;max-width:min(360px,92vw)";
  const root=host.attachShadow({mode:"closed"});
  const box=document.createElement("div"),label=document.createElement("span"),stop=document.createElement("button");
  box.style.cssText="padding:14px;background:#24352b;color:white;border-radius:6px;font:15px/1.45 system-ui;box-shadow:0 2px 14px #0004";
  label.textContent="Click the USD price for "+offer+" ("+market+").";
  const noticeBox=document.createElement("label"),notice=document.createElement("select");
  noticeBox.hidden=true;noticeBox.textContent="Did this page say the price was personalized or set by an algorithm?";
  noticeBox.style.cssText="display:block;margin-top:8px;font:13px/1.4 system-ui";
  notice.style.cssText="display:block;font:inherit;margin-top:4px;max-width:100%";
  for(const [value,text] of [["","Didn't check"],["none","Looked: no notice"],["near-price","Notice next to the price"],["behind-link","Notice behind a link or in fine print"],["elsewhere","Notice elsewhere on the page"]]){
    const option=document.createElement("option");option.value=value;option.textContent=text;notice.append(option);
  }
  noticeBox.append(notice);
  const start=document.createElement("button");start.hidden=true;start.textContent="Start sharing";start.style.cssText="font:inherit;margin:6px;padding:3px 8px;cursor:pointer";
  stop.textContent="Cancel";stop.style.cssText="font:inherit;margin-left:10px;padding:3px 8px;cursor:pointer";
  box.append(label,noticeBox,start,stop);root.append(box);document.documentElement.append(host);
  let element=null,reviewed=null,sharing=false,last=null,busy=false,ended=false;
  function end(message) {
    if(ended)return;
    ended=true;clearInterval(timer);document.removeEventListener("click",select,true);
    document.removeEventListener("keydown",escape,true);chrome.runtime.onMessage.removeListener(onMessage);
    chrome.runtime.sendMessage({action:"finished",watchId}).catch(()=>{});
    if(message){label.textContent=message;noticeBox.remove();start.remove();stop.remove();setTimeout(()=>host.remove(),4500)}else host.remove();
  }
  function escape(e){if(e.key==="Escape")end();}
  function onMessage(m){if(m.action==="end"&&m.watchId===watchId)end();}
  function read(node) {
    if(!(node instanceof HTMLElement)||!node.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true}))return null;
    const match=/^(?:US\s*)?\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?$/.exec(node.innerText.trim());
    return match?Number(match[1].replaceAll(",",""))*100+Number(match[2]||0):null;
  }
  // The visible text around the price: crossed-out prices, fees and notices usually sit nearby.
  function pageText(node) {
    let near=node;
    for(let i=0;i<6 && near.parentElement && (near.parentElement.innerText||"").length<=1500;i++)near=near.parentElement;
    return (near.innerText||"").replace(/\s+/g," ").trim().slice(0,1500);
  }
  async function fingerprint(record) {
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(record)));
    return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
  }
  async function update() {
    if(ended)return;
    if(Date.now()>=until||location.href!==originalUrl||(element&&!element.isConnected))return end("Price sharing ended.");
    if(!element||!sharing||document.hidden||busy)return;
    const cents=read(element);
    if(cents===null)return end("The selected price is no longer visible. Sharing ended.");
    if(cents===last)return;
    busy=true;
    try {
      const observedAt=new Date().toISOString(),snippet=pageText(element);
      const proofHash=await fingerprint(["pw-page-v1",pageUrl,observedAt,cents,snippet]);
      const event={eventId:crypto.randomUUID(),cents,observedAt,notice:notice.value||"",proofHash};
      const result=await chrome.runtime.sendMessage({action:"capture",watchId,event,page:{url:pageUrl,snippet}});
      if(result.error)return end(result.error);
      last=event.cents;
      label.textContent="Shared "+(last/100).toLocaleString("en-US",{style:"currency",currency:"USD"})+" for "+offer+". Watching for changes.";
    }catch{return end("Could not reach the companion. Start sharing again.")}
    finally{busy=false}
  }
  function select(e) {
    if(!e.isTrusted||element||e.composedPath().includes(host))return;
    e.preventDefault();e.stopImmediatePropagation();
    let node=e.target;
    for(let i=0;i<4 && node && read(node)===null;i++)node=node.parentElement;
    if(!node||read(node)===null){label.textContent="Choose one visible dollar amount, such as $18.25.";return}
    element=node;document.removeEventListener("click",select,true);preview(read(node));
  }
  function preview(cents){
    reviewed=cents;
    const price=(cents/100).toLocaleString("en-US",{style:"currency",currency:"USD"});
    label.textContent="Share "+price+" for "+offer+" ("+market+") and subsequent changes? PriceWitness receives the price, the time, your notice answer and a fingerprint of the nearby page text. The text itself stays in this browser.";
    noticeBox.hidden=false;start.hidden=false;
  }
  start.onclick=e=>{
    if(!e.isTrusted || !element)return;
    if(location.href!==originalUrl||!element.isConnected||Date.now()>=until)return end("Offer changed. Start again.");
    const cents=read(element);
    if(cents===null)return end("The price is no longer available.");
    if(cents!==reviewed)return preview(cents);
    start.hidden=true;stop.textContent="Stop";sharing=true;update();
  };
  const timer=setInterval(update,3000);
  stop.onclick=()=>end();
  document.addEventListener("click",select,true);document.addEventListener("keydown",escape,true);
  chrome.runtime.onMessage.addListener(onMessage);
}
