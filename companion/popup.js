const $=id=>document.getElementById(id);
const status=message=>{$("status").textContent=message};
const call=(action,data={})=>chrome.runtime.sendMessage({action,...data});
async function render(){
  const {feed,watch,choices}=await call("state");
  $("paired").hidden=!feed;$("pair").hidden=!!feed;$("another").hidden=!feed;
  $("choose").hidden=choices.length<2;
  $("feed-choice").replaceChildren(...choices.map(x=>new Option(x.label,x.id,false,x.id===feed?.id)));
  if(!feed)return;
  $("offer").textContent=feed.spec.provider+" · "+feed.spec.offer;
  $("market").textContent=feed.market+" · "+feed.spec.variant;
  $("terms").textContent=feed.basis+" · "+feed.context;
  $("stop").hidden=!watch;$("pick").disabled=!!watch;
  if(watch)status("Sharing session ends by "+new Date(watch.until).toLocaleTimeString()+".");
}
$("another").onclick=()=>{$("pair").hidden=false;$("another").hidden=true;$("code").focus()};
$("feed-choice").onchange=async e=>{const reply=await call("choose",{id:e.target.value});status(reply.error||"Feed selected.");await render()};
$("pair").onsubmit=async e=>{
  e.preventDefault();
  try{
    const url=new URL($("code").value.trim());
    const local=["127.0.0.1","localhost"].includes(url.hostname);
    if((url.protocol!=="https:"&&!(local&&url.protocol==="http:"))||url.username||url.password||url.pathname!=="/api/price-events"||url.search||!/^#pv_[a-f0-9]{64}$/.test(url.hash))throw Error("Paste the complete connection code from App feeds.");
    const token=url.hash.slice(1);url.hash="";
    const allowed=await chrome.permissions.request({origins:[url.protocol+"//"+url.hostname+"/*"]});
    if(!allowed)throw Error("Allow access to the PriceWitness site to pair.");
    const reply=await call("pair",{endpoint:url.href,token});
    if(reply.error)throw Error(reply.error);
    $("code").value="";status("Paired.");await render();
  }catch(e){status(e.message)}
};
$("pick").onclick=async()=>{
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const reply=await call("pick",{tabId:tab.id});
    if(reply.error)throw Error(reply.error);
    window.close();
  }catch(e){status(e.message)}
};
$("stop").onclick=async()=>{await call("stop");status("Sharing stopped.");await render()};
$("forget").onclick=async()=>{await call("forget");status("Connection removed from this browser.");await render()};
render().catch(e=>status(e.message));
