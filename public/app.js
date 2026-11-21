import {categories,currencies,price,dayLabel} from "./data.js";
import {catIcon,hydrateIcons,icon} from "./icons.js";
import {createFeedPanel} from "./feed-panel.js";
import {markets,windowLabel} from "./markets.js";
import {mountPricePlot} from "./price-plot.js";
import {evidenceFields,readEvidence,evidenceBadges,evidenceSummary} from "./evidence-form.js";
import {testCode} from "./evidence.js";

const $ = selector => document.querySelector(selector);
const dialog = $("#dialog");
const h = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const button = (act, label, className="", extra="") => `<button type="button" data-act="${act}" class="${className}" ${extra}>${label}</button>`;
const attr = id => 'data-id="'+h(id)+'"';
const state = {view:"feed", category:"All", query:"",sort:"newest", threads:[], total:0,next:null, ready:false,signed:false};
const photos = {
  "example-headphones":"/headphones.jpg", "example-flight":"/thumb-flight.jpg", "example-flight2":"/thumb-flight.jpg",
  "example-ride":"/thumb-ride.jpg", "example-ride2":"/thumb-ride.jpg", "example-hotel":"/thumb-hotel.jpg", "example-coffee":"/thumb-coffee.jpg"
};
let activeItem=null, featureItem=null, activeSection="sightings", mode="",formKey="";
let boardRequest=0,detailRequest=0,featureRequest=0,searchTimer,toastTimer;
const localToday=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const compareUrl=id=>{const u=new URL("/",location.origin);u.searchParams.set("item",id);return u};
const findThread=id=>[activeItem,featureItem,...state.threads].find(t=>t?.id===id);
function currentTest(){try{return sessionStorage.getItem("pricewitness-test")||""}catch{return ""}}
const periodLabel=t=>t.campaign?"Price check "+t.campaign:windowLabel(t.period_start,t.period_minutes);
function toast(message) {
  $("#toast").textContent=message;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$("#toast").textContent="",3300);
}
async function request(params, body) {
  const url="/api/community"+(params?"?"+new URLSearchParams(params):"");
  const options=body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{cache:"no-store"};
  const res=await fetch(url,options);
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error || "Couldn’t reach the price index. Try again.");
  return data;
}
const feedPanel=createFeedPanel({dialog,show,field,button,h,requireAccess,openResult:async id=>{
  await Promise.all([refresh(),refreshFeature()]);await openDetail(id);toast("Price sighting published.");
}});
function localDetails(t) {
  if(!t.period_start)return "";
  const spec=JSON.parse(t.offer_spec);
  const product=spec.productCode ? '<span>UPC or SKU '+h(spec.productCode)+'</span>' : '';
  return '<div class="market-facts"><strong>'+h(t.market)+'</strong>'+product+'<span>'+h(markets[spec.provider].basis)+' · '+h(periodLabel(t))+'</span></div>';
}
function thumb(t) {
  const src=photos[t.id];
  return `<span class="thumb ${h(t.category.toLowerCase())}" aria-hidden="true">${src?`<img src="${src}" alt="" loading="lazy" width="51" height="51">`:icon(catIcon[t.category],22)}</span>`;
}
function mark(t,full=false) {
  const label=t.saved?"Remove from watchlist":"Save to watchlist";
  return button("save",icon("bookmark",16)+(full?(t.saved?"Saved":"Save"):""),(full?"small-btn ":"mark ")+(t.saved?"on":""),attr(t.id)+` aria-label="${label}" aria-pressed="${!!t.saved}"`);
}
function row(t) {
  const range = t.count===1 || t.low===t.high ? h(price(t.low,t.currency)) :
    h(price(t.low,t.currency))+'<span class="range-dash"> – </span>'+h(price(t.high,t.currency));
  const gap=t.count<2?'<span class="reporter-note">Pending</span>':
    `<span class="gap-badge ${t.high===t.low?"flat":""}">${t.high>t.low?icon("up-right",12):""}${t.percent===null?h(price(t.high-t.low,t.currency)):t.percent+"%"}</span>`;
  return `<tr><td>${button("detail",thumb(t)+`<span class="item-info"><span class="item-name">${h(t.title)}</span><span class="item-meta">${h(t.merchant)}${t.market?" · "+h(t.market):""}<span class="mobile-count">· ${t.count.toLocaleString()} seen</span>${t.examples?"<em>Example</em>":""}</span>${t.period_start||t.campaign?'<small class="item-period">'+h(t.period_start?periodLabel(t):"Price check "+t.campaign)+'</small>':""}</span>`,"item-link",attr(t.id))}</td>
    <td class="range-data">${range}${t.currency==="USD"?"":` <small class="currency">${h(t.currency)}</small>`}</td>
    <td class="stat-n">${t.count.toLocaleString()}</td><td>${gap}</td><td class="save-cell">${mark(t)}</td></tr>`;
}
function renderShell() {
  const titles={feed:["Price explorer","See what shoppers were quoted for the same offer."],saved:["Watchlist","Revisit the offers you’re following."],mine:["My reports","Comparisons you’ve contributed to."]};
  $("#page-intro").hidden=state.view==="feed";
  $("#page-title").textContent=titles[state.view][0];
  $("#page-sub").textContent=titles[state.view][1];
  document.querySelectorAll(".nav").forEach(b=>{b.classList.toggle("active",(b.dataset.act==="find"?"feed":b.dataset.act)===state.view);if((b.dataset.act==="find"?"feed":b.dataset.act)===state.view)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  $("#filters").innerHTML=["All",...categories].map(c=>button("category",(c==="All"?"":icon(catIcon[c],13))+h(c),"filter "+(c===state.category?"selected":""),`data-cat="${h(c)}" aria-pressed="${c===state.category}"`)).join("");
}
function renderBoard() {
  $("#result-count").textContent=state.total.toLocaleString();
  $("#index-title").textContent=state.query?"Search results":state.view==="saved"?"Saved comparisons":state.view==="mine"?"Your comparisons":"Explore comparisons";
  if(state.threads.length) {
    $("#cards").innerHTML=`<table class="index-table"><caption class="sr">Reported offers, price range, number of sightings, and percentage spread from the lowest price</caption><thead><tr><th scope="col">Offer / retailer</th><th scope="col">Reported range</th><th scope="col">Sightings</th><th scope="col">Spread</th><th scope="col"><span class="sr">Watchlist</span></th></tr></thead><tbody>${state.threads.map(row).join("")}</tbody></table>`;
  } else {
    const msg=state.query||state.category!=="All"?"Try another search or category.":state.view==="saved"?"Bookmark an offer to follow its reported prices.":state.view==="mine"?"Publish a sighting to start your first comparison.":"Share the first sighting.";
    $("#cards").innerHTML=`<section class="empty"><h3>${state.view==="saved"&&!state.query&&state.category==="All"?"Your watchlist is empty":"No comparisons here yet"}</h3><p>${msg}</p>${button(state.view==="mine"?"share":"feed",state.view==="mine"?"Report a price":"Explore all comparisons","small-btn")}</section>`;
  }
  $("#more-posts").innerHTML=state.next!==null?button("load-more","Show more comparisons "+icon("down",13),"load-more"):"";
}
const featurePhotos = {
  "example-headphones":"/headphones.jpg", "example-flight":"/feature-flight.jpg",
  "example-ride":"/feature-ride.jpg", "example-hotel":"/feature-hotel.jpg"
};
const featureSubjects = {
  "example-headphones":"Same headphones.", "example-flight":"Same flight.",
  "example-ride":"Same ride.", "example-hotel":"Same room."
};
let featureChoices = [];
let selectedFeature = "";
function renderFeature(t) {
  const src = featurePhotos[t.id];
  const index = featureChoices.findIndex(choice => choice.id === t.id);
  const difference = t.low === t.high ? "Same price." : price(t.high - t.low, t.currency) + " apart.";
  const tags = t.plot.edges.map((edge,i) => {
    const label = t.low === t.high ? "Reported price" : i === 0 ? "Lowest sighting" : "Highest sighting";
    return button("edge", `<span>${label}</span><strong>${h(price(edge.cents,t.currency))}</strong><small>${h(edge.context)}</small>`,
      "price-ticket " + (i === 0 ? "low-ticket" : "high-ticket"), `data-edge="${i}" aria-label="${h(label + ", " + price(edge.cents,t.currency) + ". Inspect sightings.")}"`);
  }).join("");
  const pager = featureChoices.length > 1 ? `<div class="feature-pager">
    ${button("turn-feature",icon("down",17),"previous-feature",'data-step="-1" aria-label="Previous featured comparison"')}
    <span aria-label="Comparison ${index+1} of ${featureChoices.length}">${index+1} / ${featureChoices.length}</span>
    ${button("turn-feature",icon("down",17),"next-feature",'data-step="1" aria-label="Next featured comparison"')}</div>` : "";
  const holder = $("#featured");
  holder.innerHTML = `<article class="spotlight">
    <figure class="feature-figure">
      <div class="feature-art ${src ? "" : "type-only"}">
        ${src ? `<img class="feature-photo" alt="" src="${src}" fetchpriority="high" width="627" height="627">` :
          `<span class="feature-category">${icon(catIcon[t.category],38)}${h(t.category)}</span>`}
        ${tags}
      </div>
      <figcaption><span>Featured comparisons</span>${pager}</figcaption>
    </figure>
    <header class="feature-story"><div class="feature-byline"><span>${h(t.merchant)}</span>${t.examples ? '<span class="sample-label">Example data</span>' : ''}</div>
      <h1>${h(featureSubjects[t.id] || t.title)} <em>${h(difference)}</em></h1>
      <p class="feature-offer">${h(featureSubjects[t.id] ? t.title : t.category)}<span aria-hidden="true"> · </span>${h(t.currency)}</p>
      <p class="feature-terms">${h(t.variant)}</p>${localDetails(t)}
    </header>
    <div class="feature-lab" id="focus-plot"></div>
    <div class="feature-source">${button("detail","View all " + t.count.toLocaleString() + " sightings","source-link",attr(t.id))}</div>
  </article>`;
  mountPricePlot($("#focus-plot"),t.plot,band=>openBand(t,band));
}
async function refreshFeature(focusStep) {
  const stamp = ++featureRequest;
  const holder = $("#featured");
  holder.hidden = state.view !== "feed";
  if (holder.hidden) return;
  holder.setAttribute("aria-busy","true");
  try {
    const params = {mode:"featured"};
    if (selectedFeature) params.id = selectedFeature;
    const {item,choices} = await request(params);
    if (stamp !== featureRequest) return;
    const same = featureItem?.id === item.id && JSON.stringify(featureItem.plot) === JSON.stringify(item.plot)
      && JSON.stringify(featureChoices) === JSON.stringify(choices);
    featureItem = item;
    featureChoices = choices;
    if (selectedFeature) selectedFeature = item.id;
    if (!same) renderFeature(item);
    if (focusStep) holder.querySelector('[data-step="'+focusStep+'"]')?.focus({preventScroll:true});
  } catch (error) {
    if (stamp !== featureRequest) return;
    selectedFeature = featureItem?.id || "";
    if (featureItem) toast("Couldn't update the featured comparison. Try again.");
    else holder.innerHTML = '<div class="feature-loading" role="status"><h1>Explore prices</h1><p>Featured comparison unavailable. '+button("retry-feature","Try again","text-btn")+'</p></div>';
  } finally {
    if (stamp === featureRequest) holder.removeAttribute("aria-busy");
  }
}
function turnFeature(step) {
  const index = featureChoices.findIndex(choice=>choice.id===(selectedFeature || featureItem.id));
  selectedFeature = featureChoices[(index + step + featureChoices.length) % featureChoices.length].id;
  return refreshFeature(step);
}
async function refresh(append=false) {
  const n=++boardRequest;
  $("#index").setAttribute("aria-busy","true");
  try{
    const offset=append?state.next:0;
    const data=await request({mode:"board",view:state.view,category:state.category,q:state.query,sort:state.sort,offset:offset||0});
    if(n!==boardRequest)return;
    state.threads=append?[...new Map([...state.threads,...data.threads].map(t=>[t.id,t])).values()]:data.threads;
    Object.assign(state,{next:data.next,total:data.total,signed:data.signedIn,ready:true});
    $("#load-status").innerHTML="";renderBoard();
  }catch(e){
    if(n!==boardRequest)return;
    if(append && $("#more-posts button"))$("#more-posts button").disabled=false;
    $("#load-status").innerHTML='<p class="message">'+h(e.message)+" "+button("retry","Retry")+'</p>';
  }finally{if(n===boardRequest)$("#index").removeAttribute("aria-busy")}
}
function setView(view) {
  clearTimeout(searchTimer);
  Object.assign(state,{view,category:"All",query:""});
  $("#search-term").value="";
  renderShell();
  if(dialog.open)dialog.close();
  return Promise.all([refresh(),refreshFeature()]);
}
function show(title,content,kind="info") {
  mode=kind;
  ++detailRequest;
  dialog.innerHTML=`<div class="modal-head"><h2 id="dialog-title" tabindex="-1">${h(title)}</h2>${button("close",icon("close",16),"icon-btn",'aria-label="Close dialog"')}</div><div class="modal-body">${content}</div>`;
  if(!dialog.open)dialog.showModal();
  dialog.scrollTop=0;
  $("#dialog-title").focus({preventScroll:true});
}
function close(){dialog.close()}
dialog.addEventListener("close",()=>{
  ++detailRequest;mode="";activeItem=null;
  const url=new URL(location.href);
  url.searchParams.delete("item");url.searchParams.delete("view");history.replaceState(null,"",url);
});
dialog.addEventListener("click",e=>{
  if(e.target!==dialog)return;
  const r=dialog.getBoundingClientRect();
  if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();
});
function sightingRow(x,t,removal="") {
  // Other shoppers' times arrive rounded to the hour.
  const when=!x.observed_at?dayLabel(x.seen):x.rounded?new Date(x.observed_at).toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric"})+" hour":new Date(x.observed_at).toLocaleString();
  return `<div class="sighting-row"><strong>${h(price(x.cents,t.currency))}</strong><div>${h(x.context)}<small>${h(x.alias)} · ${h(when)} ${x.channel?" · "+h(x.channel):""} ${removal}</small>${evidenceBadges(x,cents=>price(cents,t.currency))}</div></div>`;
}
function openBand(t,band) {
  const low=price(band.lo,t.currency),high=price(band.hi,t.currency);
  const range=band.lo===band.hi ? low : low+" – "+high;
  show("Sightings in this range",`<div class="band-summary"><strong>${h(range)}</strong>
    <span>${h(t.title)} · ${h(t.merchant)} · ${h(t.currency)}</span>
    <small>${band.n == null ? (t.examples ? "Example sightings" : "Shopper sightings") : band.n.toLocaleString()+(t.examples?" example":"")+" "+(band.n===1?"sighting":"sightings")}</small></div>
    <div id="band-rows"></div><div id="band-status" role="status"></div>
    <div class="band-actions"><button id="band-more" type="button" class="small-btn" hidden>Show more sightings</button>
    ${button("detail","View full comparison "+icon("arrow-right",14),"small-btn",attr(t.id))}</div>`,"band");
  const generation=detailRequest;
  const status=$("#band-status"),more=$("#band-more"),rows=$("#band-rows");
  let offset=0;
  async function loadPage() {
    more.disabled=true;
    status.textContent="Loading sightings…";
    try {
      const data=await request({mode:"sightings",id:t.id,min:band.lo,max:band.hi,offset});
      if (generation!==detailRequest) return;
      rows.insertAdjacentHTML("beforeend",data.rows.map(x=>sightingRow(x,t)).join(""));
      offset+=data.rows.length;
      status.textContent=offset?"":"These sightings are no longer available.";
      more.hidden=!data.more;
      more.textContent="Show more sightings";
    } catch(error) {
      if (generation!==detailRequest) return;
      status.textContent=error.message;
      more.hidden=false;
      more.textContent="Try again";
    } finally {more.disabled=false}
  }
  more.addEventListener("click",loadPage);
  loadPage();
}
function recordList(t) {
  const comments=activeSection==="comments";
  const list=comments?t.comments:t.quotes;
  const entries=list.map(x=>{
    const removal=x.own?button(comments?"remove-comment":"remove-quote","Remove","text-btn",attr(x.id)):"";
    const by=h(x.alias)+" · "+h(dayLabel(comments?x.created:x.seen));
    return comments?`<div class="comment-row"><div>${h(x.body)}</div><small>${by} ${removal}</small></div>`:
      sightingRow(x,t,removal);
  }).join("");
  return entries+(!list.length?'<p class="muted">No comments yet.</p>':"")+
    ((comments?t.moreComments:t.moreQuotes)?button("more-records","Show more "+(comments?"comments":"sightings"),"small-btn detail-more"):"")+
    (comments?'<form id="comment-form"><label class="field">Your comment<textarea name="body" required maxlength="750" placeholder="Which offer details should shoppers check?"></textarea></label><div class="form-actions"><span class="error-text" role="alert"></span><button type="submit" class="small-btn">Post comment</button></div></form>':"");
}
function renderRecords() {
  const t=activeItem;if(!t||!$("#record-tabs"))return;
  $("#record-tabs").innerHTML=["sightings","comments"].map(s=>button("section",(s==="comments"?"Discussion ("+t.replies:"Price sightings ("+t.count.toLocaleString())+")","",`data-section="${s}" aria-pressed="${s===activeSection}"`)).join("");
  $("#records").innerHTML=recordList(t);
}
function renderDetail(t,section) {
  activeItem=t;activeSection=section;formKey=crypto.randomUUID();
  const sample=t.examples?'<span class="example-chip">Example data</span>':"";
  const note=t.examples?"Illustrative prices and conditions. Start a real comparison to collect shopper reports.":"Check the dates, fees, and eligibility for each offer. These prices were reported by shoppers.";
  const shoppers=t.shoppers!=null&&!t.examples?` · ${t.count.toLocaleString()} sighting${t.count===1?"":"s"} from ${t.shoppers.toLocaleString()} shopper${t.shoppers===1?"":"s"}`:"";
  const test=t.campaign&&!t.period_start?`<div class="market-facts"><strong>Price check ${h(t.campaign)}</strong><span>Reports from one organized test, kept apart from everyday reports.</span></div>`:"";
  show(t.title,`<div class="detail-meta"><span class="pill">${h(t.category)}</span> · ${h(t.merchant)} · ${h(t.currency)}${shoppers} ${sample}</div><p>${h(t.variant)}</p>${localDetails(t)}${test}${evidenceSummary(t.evidence)}
    <div class="detail-plot" id="detail-plot"></div>
    <div class="detail-tools">${button(t.examples?"start-real":"add-quote",icon("plus",14)+(t.examples?"Start a real comparison":"Add your price"),"primary",attr(t.id))}${t.offer_spec?button("connect-offer","Connect this offer","small-btn",attr(t.id)):""}${mark(t,true)}${button("like",icon("thumb",14)+"Helpful"+(t.votes?" "+t.votes:""),"small-btn",attr(t.id)+' aria-pressed="'+!!t.liked+'"')}${button("copy-link",icon("link",14)+"Copy link","small-btn",attr(t.id))}</div>
    <p class="note-box">${h(t.period_start?"Each shopper contributes their latest price in this "+(t.campaign?"price check":"window")+". Check the route or branch, fees and account conditions before drawing conclusions.":note)}</p><div id="record-tabs" class="detail-tabs"></div><div id="records"></div>`,"detail");
  mountPricePlot($("#detail-plot"),t.plot,band=>openBand(t,band));
  history.replaceState(null,"",compareUrl(t.id));renderRecords();
}
async function openDetail(id,section="sightings") {
  const known=findThread(id);
  show(known?.title||"Comparison",'<p role="status">Loading reports…</p>',"loading");
  const n=detailRequest;
  try {
    const {item,signedIn}=await request({mode:"item",id});
    if(n!==detailRequest||!dialog.open)return;
    state.signed=signedIn;state.ready=true;renderDetail(item,section);
  } catch(e){if(n===detailRequest)show("Comparison unavailable",'<p>'+h(e.message)+'</p>'+button("detail","Try again","small-btn",attr(id)))}
}
async function moreRecords(b) {
  b.disabled=true;
  const t=activeItem,section=activeSection,key=section==="comments"?"comments":"quotes";
  const data=await request({mode:section,id:t.id,offset:t[key].length});
  if(activeItem!==t||activeSection!==section||mode!=="detail")return;
  t[key].push(...data.rows);t[section==="comments"?"moreComments":"moreQuotes"]=data.more;
  renderRecords();
}
function profile() {
  show("Contributor profile",'<p>Choose the alias displayed with your reports and comments.</p><form id="profile-form">'+field("Preferred alias on this device","alias",{max:32,required:false,value:savedAlias(),placeholder:"Anonymous shopper"})+'<div class="form-actions"><button type="submit" class="primary">Save preference</button></div></form><h3>Your activity</h3>'+'<div class="detail-tools">'+button("mine","My reports","small-btn")+button("saved","Watchlist","small-btn")+button("feeds","App feeds","small-btn")+'</div>');
}
function field(label,name,opts={}){const {type="text",value="",placeholder="",max=100,required=true,extra=""}=opts;return '<label class="field">'+h(label)+'<input type="'+type+'" name="'+name+'" '+(required?"required ":"")+'maxlength="'+max+'" value="'+h(value)+'" placeholder="'+h(placeholder)+'" '+extra+'></label>'}
function select(label,name,arr,selected){return '<label class="field">'+h(label)+'<select name="'+name+'">'+arr.map(c=>'<option '+(c===selected?"selected":"")+'>'+h(c)+'</option>').join("")+'</select></label>'}
function quoteFields(n,label){return '<fieldset><legend>'+h(label)+'</legend><div class="field-set"><div class="form-row">'+field("Price shown","amount"+n,{type:"number",placeholder:"0.00",extra:'min="0" max="999999999.99" step="0.01"'})+field("Date seen","seen"+n,{type:"date",value:localToday(),extra:'max="'+localToday()+'"'})+'</div>'+field("Time seen (optional)","time"+n,{type:"time",required:false})+field("Account and offer context","context"+n,{max:180,placeholder:"e.g. Signed in, mobile app, tax included"})+evidenceFields(String(n))+'</div></fieldset>'}
function requireAccess(){
 if(!state.ready){toast("The feed is connecting. Try again in a moment.");return false}
 if(state.signed)return true;
 show("Sign in to contribute",'<p>Sign in to save comparisons, share a price, or join a discussion. Your public posts use a shopper alias.</p><a class="primary signin-link" href="/signin-with-chatgpt?return_to='+encodeURIComponent(location.pathname+location.search+location.hash)+'" target="_top">Sign in with ChatGPT</a>');return false;
}
function savedAlias(){try{return localStorage.getItem("pricewitness-alias")||""}catch{return ""}}
function share(t=null,append=false){
 if(append && t?.offer_spec)return feedPanel.compose({...JSON.parse(t.offer_spec),campaign:t.campaign||""},"publish",true);
 if(!requireAccess())return;
 formKey=crypto.randomUUID();
 const base=append?'<div class="note-box"><strong>'+h(t.title)+'</strong><div class="form-note">'+h(t.merchant)+' · '+h(t.variant)+' · '+h(t.currency)+'</div></div>':'<div class="form-row">'+field("Retailer or provider","merchant",{max:60,value:t?.merchant||"",placeholder:"e.g. Amazon"})+select("Category","category",categories,t?.category||"Retail")+'</div>'+field("Product or service","title",{value:t?.title||"",placeholder:"e.g. Sony WH-1000XM5 headphones"})+field("Details that identify the same offer","variant",{max:180,value:t?.variant||"",placeholder:"Model and seller, or flight number, date and fare class"})+select("Currency","currency",currencies,t?.currency||"USD")+field("Price check code (optional)","campaign",{required:false,max:40,value:currentTest(),placeholder:"Only if you joined an organized price check",extra:'pattern="[A-Za-z0-9][A-Za-z0-9\\-]{1,39}" autocomplete="off"'});
 show(append?"Add your price":"Share a price",'<p class="side-sub">Share only what another shopper needs to compare the offer.</p>'+(!append?button("feeds","Compare a local app price","small-btn"):"")+'<form id="quote-form" '+(append?'data-thread="'+h(t.id)+'"':"")+'>'+base+quoteFields(1,"Your price sighting")+'<div id="second-quote">'+button("second-quote",icon("plus",14)+" Add a second price (optional)","text-btn")+'</div>'+field("Public alias (optional)","alias",{required:false,max:32,value:savedAlias(),placeholder:"Anonymous shopper"})+'<span class="form-note">Leave out names, order numbers, and account details.</span><div class="error-text" role="alert"></div><div class="form-actions">'+button("close","Cancel","small-btn")+'<button class="primary" type="submit">Publish sighting '+icon("arrow-right",15)+'</button></div></form>',"share");
}
const information={
 how:["How PriceWitness works",'<ol class="privacy-list"><li><strong>Find the same offer.</strong> Search for a product, flight, room, or service. Match the seller, model, dates, and terms.</li><li><strong>Share what you saw.</strong> Enter a price, currency, date, and the account or offer conditions. One sighting is enough to start.</li><li><strong>Compare the details.</strong> The index shows the lowest and highest recorded prices. The percentage gap is the difference divided by the lowest price.</li></ol><p>Promotions, inventory, taxes, and timing can all affect a quote. A difference alone cannot establish why a price changed.</p><p>Offers marked “Example” use illustrative prices. Real sightings are collected in separate comparisons.</p><p><a href="/methods">Read the full methods and data dictionary</a>: how prices are matched, what each field means, how records are fingerprinted and what the data cannot show.</p>'],
 privacy:["Privacy",'<p>PriceWitness asks for the price you saw and the conditions that help others compare it. Local app feeds publish the ZIP areas, branch, offer, account conditions, price and observation time you choose. The browser companion sends amounts from a price you select. Your merchant credentials stay with the merchant.</p><h3>What other shoppers see</h3><p>Shared prices, dates, offer details, comments, and the alias you choose. Leaving the alias blank publishes as Anonymous shopper.</p><h3>What the app stores</h3><p>A site-specific sign-in identifier connects your posts, helpful votes, and private watchlist. The app does not store your sign-in email or full name. A preferred alias can be saved on this device.</p><h3>What stays private</h3><p>Other shoppers see the hour a price was seen, not the minute. Your setup answers (signed in, device, where you were) and your state are never shown one report at a time; they appear only as totals once at least three people have reported the same offer. Screenshots and browser page captures never leave your device: only a digital fingerprint is sent. The app does not record your internet (IP) address with your reports.</p><p>You can remove your own price sightings and comments from a comparison. Disconnecting a feed stops future submissions. Previously shared prices remain until you remove them. A removed report\'s fingerprint stays in the public daily fingerprint list; the fingerprint alone reveals nothing about you or the price. This site uses no advertising pixels or third-party analytics scripts. <a href="/methods#privacy">More in the methods</a>.</p>'],
 guidelines:["Community guidelines",'<ul class="privacy-list"><li>Post prices you actually saw. Add the date, seller, fees, membership offer, and exact product or itinerary where relevant.</li><li>Keep comparisons like-for-like. Start a separate thread for another currency, seller, product variant, or fare class.</li><li>Describe what you observed. Avoid attributing a difference to personal characteristics without evidence.</li><li>Protect everyone’s privacy. Leave out personal names, exact home addresses, account numbers, and order identifiers.</li><li>Keep discussions focused on the offer and treat other shoppers with respect.</li></ul>']
};


async function reactTo(b,t,action) {
  if(!requireAccess())return;
  b.disabled=true;
  const enabled=action==="save"?!t.saved:!t.liked;
  await request(null,{action,thread:t.id,enabled});
  const records=new Set([activeItem,featureItem,...state.threads].filter(x=>x?.id===t.id));
  for(const item of records){
    if(action==="save")item.saved=enabled;
    else {item.liked=enabled;item.votes+=enabled?1:-1}
  }
  if(mode==="detail"&&activeItem?.id===t.id){
    if(action==="save")b.outerHTML=mark(activeItem,true);
    else {b.disabled=false;b.setAttribute("aria-pressed",String(enabled));b.innerHTML=icon("thumb",14)+"Helpful"+(t.votes?" "+t.votes:"")}
  }
  if(state.view==="saved")await refresh();else renderBoard();
  if(!dialog.open)toast(action==="save"?(enabled?"Saved to your watchlist.":"Removed from your watchlist."):(enabled?"Marked helpful.":"Vote removed."));
}
document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-act]");if(!b)return;
  const action=b.dataset.act,id=b.dataset.id,t=findThread(id);
  try{
    switch(action){
      case "close": return close();
      case "find":{
        if(state.view!=="feed" || state.category!=="All")await setView("feed");
        $("#index").scrollIntoView({block:"start"});
        $("#search-term").focus({preventScroll:true});
        return;
      }
      case "feed":case "saved":case "mine":return await setView(action);
      case "how":case "privacy":case "guidelines":return show(...information[action]);
      case "profile":return profile();
      case "feeds":return feedPanel.open();
      case "connect-offer":return feedPanel.compose(JSON.parse(t.offer_spec),"connect",true);
      case "category":{
        state.category=b.dataset.cat;
        for (const filter of $("#filters").children) {
          filter.classList.toggle("selected",filter===b);
          filter.setAttribute("aria-pressed",String(filter===b));
        }
        return await refresh();
      }
      case "retry":return await refresh();
      case "turn-feature":return await turnFeature(Number(b.dataset.step));
      case "edge":{
        const edge=featureItem.plot.edges[Number(b.dataset.edge)];
        return openBand(featureItem,{lo:edge.cents,hi:edge.cents});
      }
      case "retry-feature":return await refreshFeature();
      case "load-more":b.disabled=true;return await refresh(true);
      case "detail":return await openDetail(id);
      case "section":activeSection=b.dataset.section;renderRecords();return;
      case "more-records":return await moreRecords(b);
      case "share":case "start-real":case "add-quote":return share(t,action==="add-quote");
      case "save":case "like":return await reactTo(b,t,action);
      case "second-quote":$("#second-quote").innerHTML=quoteFields(2,"Second price sighting")+button("remove-second","Remove second price","text-btn");return;
      case "remove-second":$("#second-quote").innerHTML=button("second-quote",icon("plus",14)+" Add a second price (optional)","text-btn");return;
      case "copy-link":{
        const url=compareUrl(id).href;
        try{await navigator.clipboard.writeText(url);b.textContent="Link copied"}catch{show("Comparison link",'<label class="field">Copy this address<input readonly value="'+h(url)+'"></label>');dialog.querySelector("input").select()}
        return;
      }
      case "remove-quote":case "remove-comment":{
        const tid=activeItem.id;
        return show("Remove your "+(action==="remove-quote"?"sighting":"comment")+"?",'<p>This contribution will be removed from the comparison.</p><div class="form-actions">'+button("detail","Keep it","small-btn",attr(tid))+button("confirm-remove","Remove","primary",attr(id)+' data-op="'+action+'" data-thread="'+h(tid)+'"')+'</div>');
      }
      case "confirm-remove":{
        b.disabled=true;await request(null,{action:b.dataset.op,id});await Promise.all([refresh(),refreshFeature()]);
        if(b.dataset.op==="remove-quote"&&activeItem?.count===1){close();return}
        await openDetail(b.dataset.thread,b.dataset.op==="remove-comment"?"comments":"sightings");return;
      }
    }
  }catch(err){b.disabled=false;if(dialog.open){let out=dialog.querySelector(".action-error");if(!out){out=document.createElement("p");out.className="error-text action-error";out.setAttribute("role","alert");dialog.querySelector(".modal-body").prepend(out)}out.textContent=err.message}else toast(err.message)}
});
$("#search-term").addEventListener("input",e=>{
  clearTimeout(searchTimer);state.query=e.target.value.trim();++boardRequest;
  searchTimer=setTimeout(()=>refresh(),160);
});
$("#search-form").addEventListener("submit",e=>{e.preventDefault();clearTimeout(searchTimer);refresh()});
$("#sort").addEventListener("change",e=>{state.sort=e.target.value;refresh()});
document.addEventListener("keydown",e=>{
  if(e.key==="/"&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!dialog.open&&!["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)){e.preventDefault();$("#search-term").focus()}
});
document.addEventListener("submit",async e=>{
  const form=e.target;
  if(!["profile-form","quote-form","comment-form"].includes(form.id))return;
  e.preventDefault();
  const values=Object.fromEntries(new FormData(form));
  if(form.id==="profile-form"){
    try{localStorage.setItem("pricewitness-alias",values.alias.trim());close();toast("Alias preference saved.")}catch{toast("Your browser couldn’t save that preference.")}return;
  }
  if(!requireAccess())return;
  const submit=form.querySelector("button[type=submit]");if(submit.disabled)return;
  submit.disabled=true;const error=form.querySelector(".error-text");error.textContent="";
  try{
    if(form.id==="quote-form"){
      const quote=async n=>({cents:Math.round(Number(values["amount"+n])*100),context:values["context"+n],seen:values["seen"+n],
        observedAt:values["time"+n]?new Date(values["seen"+n]+"T"+values["time"+n]).toISOString():"",...await readEvidence(form,String(n))});
      const quotes=values.amount2===undefined?[await quote(1)]:[await quote(1),await quote(2)];
      const result=await request(null,{action:"quote",key:formKey,thread:form.dataset.thread||null,title:values.title,merchant:values.merchant,category:values.category,variant:values.variant,currency:values.currency,alias:values.alias,campaign:values.campaign||"",quotes});
      await Promise.all([refresh(),refreshFeature()]);await openDetail(result.thread);toast("Price sighting published.");
    } else {
      const id=activeItem.id;
      await request(null,{action:"comment",key:formKey,thread:id,body:values.body,alias:savedAlias()});
      await refresh();await openDetail(id,"comments");
    }
  } catch(err){error.textContent=err.message||"Couldn’t save your contribution."}finally{submit.disabled=false}
});
let feedRevision,checkingFeed=false;
async function checkLocalUpdates() {
  if(checkingFeed || document.hidden)return;
  if(dialog.open && (mode!=="detail"||!activeItem?.period_start||activeSection!=="sightings"))return;
  if(!dialog.open && (state.threads.length>10 || $("#index").getAttribute("aria-busy")==="true"))return;
  const focused=document.activeElement;
  if(focused?.closest("form,#detail-plot,#focus-plot,#cards,#records,#record-tabs"))return;
  checkingFeed=true;
  try {
    const response=await fetch("/api/local-updates");
    if(!response.ok)return;
    const {revision}=await response.json();
    if(revision===(dialog.open?activeItem?.liveRevision:feedRevision))return;
    if(dialog.open) {
      const before=activeItem,stamp=detailRequest;
      if(mode!=="detail"||!before?.period_start||activeSection!=="sightings"||before.quotes.length>12)return;
      const {item}=await request({mode:"item",id:before.id});
      if(stamp!==detailRequest||before!==activeItem||activeSection!=="sightings"||document.activeElement!==focused)return;
      if(JSON.stringify(before.plot)!==JSON.stringify(item.plot)||JSON.stringify(before.quotes)!==JSON.stringify(item.quotes)){
        activeItem=item;mountPricePlot($("#detail-plot"),item.plot,band=>openBand(item,band));renderRecords();
      }
      // The board is refreshed after the dialog closes, including when a new time window opened.
    } else if(feedRevision!==undefined || revision>0) {
      await Promise.all([refresh(),refreshFeature()]);
    }
    if(!dialog.open)feedRevision=revision;
    else activeItem.liveRevision=revision;
  } catch { /* Keep the displayed prices when the update check is offline. */ }
  finally{checkingFeed=false}
}
hydrateIcons();
renderShell();
await Promise.all([refresh(),refreshFeature()]);
const requested=new URL(location.href).searchParams.get("item");
const joined=testCode(new URL(location.href).searchParams.get("test"));
if(joined){
  try{sessionStorage.setItem("pricewitness-test",joined)}catch{}
  state.query=joined;$("#search-term").value=joined;await refresh();
  toast("Price check "+joined+": prices you report are grouped for this test.");
}
const shared=new URLSearchParams(location.hash.slice(1));
if(shared.get("share")==="1") {
  const provider=shared.get("provider"),cents=shared.get("cents");
  const amount=cents!==null && /^\d{1,11}$/.test(cents)?(Number(cents)/100).toFixed(2):"";
  if(state.signed){
    history.replaceState(null,"",location.pathname);
    if(provider && Object.hasOwn(markets,provider))feedPanel.compose({provider,amount},"publish");
    else await feedPanel.open(null,{amount});
  } else requireAccess();
} else if(requested)await openDetail(requested);
else if(new URL(location.href).searchParams.get("view")==="feeds")await feedPanel.open();
if("serviceWorker" in navigator)navigator.serviceWorker.register("/share-worker.js",{type:"module"}).catch(()=>{});
checkLocalUpdates();
setInterval(checkLocalUpdates,15000);
let hiddenAt = Date.now();
document.addEventListener("visibilitychange",()=>{
  if(document.hidden) hiddenAt=Date.now();
  else if(!dialog.open && Date.now()-hiddenAt>60000){refresh();refreshFeature()}
});
