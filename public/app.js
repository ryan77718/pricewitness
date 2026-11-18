import {categories,currencies,examples,price,spread,dayLabel} from "./data.js";
import {icon,hydrateIcons,catIcon} from "./icons.js";
const $=q=>document.querySelector(q),h=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const state={threads:examples,view:"feed",category:"All",merchant:"",query:"",sort:"newest",limit:6,more:false,signed:false,ready:false};
const dialog=$("#dialog");
let openThread=null,mode="",toastTimer,formKey,refreshNumber=0;
const button=(act,txt,cls="",extra="")=>'<button type="button" class="'+cls+'" data-act="'+act+'" '+extra+'>'+txt+'</button>';
const findThread=id=>state.threads.find(t=>t.id===id);
const attr=id=>'data-id="'+h(id)+'"';
const badge=c=>'<span class="pill '+h(c.toLowerCase())+'">'+icon(catIcon[c],12)+h(c)+'</span>';
const tiny=(name,text)=>icon(name,14)+h(text);
const localToday=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
function merchantLogo(name){
 const logos={Amazon:["amazon","a"],"Delta Air Lines":["delta",""],Uber:["uber","Uber"],Target:["target",""],"Booking.com":["booking","B."],Spotify:["spotify",icon("activity",18)]};
 const [css,letter]=Object.hasOwn(logos,name)?logos[name]:["",h(name.slice(0,1).toUpperCase())];return '<span class="ret-logo '+css+'" aria-hidden="true">'+letter+'</span>';
}
function toast(message){$("#toast").textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("#toast").textContent="",3000)}
function merchantCounts(){const counts=new Map();for(const t of state.threads)counts.set(t.merchant,(counts.get(t.merchant)||0)+1);return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))}
function retailerRow([name,n]){return button("merchant",merchantLogo(name)+'<span class="ret-name">'+h(name)+'</span><span class="ret-count">'+n+' '+(n===1?"thread":"threads")+'</span>',"ret-row",'data-name="'+h(name)+'"')}
function priceStrip(t){
 const s=spread(t),qs=[...t.quotes].sort((a,b)=>a.cents-b.cents),lo=qs[0],hi=qs[qs.length-1];
 const quote=(q,which,label)=>'<div class="quote-box '+which+'"><span class="price-label">'+icon(which==="low"?"down-right":"up-right",13)+label+'</span><strong class="price-value">'+h(price(q.cents,t.currency))+'</strong><small>'+h(q.context)+'</small></div>';
 if(t.quotes.length===1)return '<div class="price-strip single">'+quote(lo,"low","Price seen")+'<div class="gap-box"><span class="price-label">Price gap</span><small>Awaiting a second price</small></div></div>';
 return '<div class="price-strip">'+quote(lo,"low","Lowest seen")+quote(hi,"high","Highest seen")+'<div class="gap-box"><span class="price-label">Price gap</span><strong class="gap-value">'+(s.percent===null?h(price(s.gap,t.currency)):(s.percent>0?icon("up-right",16):"")+s.percent+"%")+'</strong><small>'+h(price(s.gap,t.currency))+' difference</small></div></div>';
}
function card(t){
 const id=attr(t.id),date=t.examples?"Example":dayLabel(t.created);
 return '<article class="post"><div class="post-inner"><div class="post-top"><div class="post-meta">'+badge(t.category)+'<span aria-hidden="true">·</span><span>'+h(t.merchant)+'</span></div><div class="meta-right"><span>'+h(date)+'</span>'+button("save",icon("bookmark",17),"mark "+(t.saved?"on":""),id+' aria-pressed="'+t.saved+'" aria-label="'+(t.saved?"Remove from":"Save to")+' watchlist"')+'</div></div><h3 class="post-title">'+button("detail",h(t.title),"",id)+'</h3><p class="variant">'+h(t.variant)+(t.currency!=="USD"?" · "+h(t.currency):"")+'</p>'+priceStrip(t)+'</div><div class="card-bottom"><div class="card-links">'+button("like",tiny("thumb","Helpful")+(t.votes?" "+t.votes:""),t.liked?"on":"",id+' aria-pressed="'+t.liked+'"')+button("discussion",tiny("chat",t.comments.length?t.comments.length+" "+(t.comments.length===1?"comment":"comments"):"Discuss"),"",id)+'</div>'+button("detail","View comparison "+icon("arrow-right",14),"detail-link",id)+'</div></article>';
}
function matches(t,q){return [t.title,t.category,t.merchant,t.variant].join(" ").toLowerCase().includes(q.toLowerCase())}
function filtered(){
 let items=state.threads.filter(t=>(state.view!=="saved"||t.saved)&&(state.view!=="mine"||t.quotes.some(q=>q.own)||t.comments.some(c=>c.own))&&(state.category==="All"||t.category===state.category)&&(!state.merchant||t.merchant===state.merchant)&&matches(t,state.query));
 const ranking={newest:t=>Date.parse(t.created),gap:t=>spread(t).percent??-1,discussed:t=>t.comments.length,helpful:t=>t.votes};
 return items.sort((a,b)=>Number(!!a.examples)-Number(!!b.examples)||ranking[state.sort](b)-ranking[state.sort](a)||b.created.localeCompare(a.created));
}
function render(){
 document.querySelectorAll(".nav").forEach(b=>b.classList.toggle("active",b.dataset.act===state.view));
 const titles={feed:["Community feed","Price comparisons from across the community."],saved:["Your watchlist","Comparisons you’ve saved to follow."],mine:["Your contributions","Comparisons where you’ve shared a price or a comment."]};
 $("#feed-title").textContent=titles[state.view][0];$("#feed-description").textContent=titles[state.view][1];
 const shown=["All","Retail","Flights","Hotels","Rides"];
 $("#filters").innerHTML=shown.map(c=>button("category",icon(catIcon[c],14)+(c==="All"?"All":h(c)),"filter "+(state.category===c?"selected":""),'data-cat="'+c+'" aria-pressed="'+(state.category===c)+'"')).join("")+'<div class="filter-wrap">'+button("more-categories",icon("dots",14)+(shown.includes(state.category)?"More":h(state.category)),"filter "+(!shown.includes(state.category)?"selected":""),'aria-expanded="'+state.more+'"')+(state.more?'<div class="pop-menu">'+categories.filter(c=>!shown.includes(c)).map(c=>button("category",icon(catIcon[c])+h(c),"",'data-cat="'+c+'"')).join("")+'</div>':"")+'</div>';
 $("#active-filters").innerHTML=(state.query||state.merchant)?'<div class="chip-line">'+(state.merchant?button("clear-merchant",h(state.merchant)+icon("close",12),"",'aria-label="Clear retailer filter"'):"")+(state.query?button("clear-search",'Search: '+h(state.query)+icon("close",12),"",'aria-label="Clear search"'):"")+'</div>':"";
 const items=filtered();
 $("#cards").innerHTML=items.length?items.slice(0,state.limit).map(card).join(""):'<div class="empty">'+icon(state.view==="saved"?"bookmark":"search",28)+'<h3>'+(state.view==="saved"&&!state.merchant&&!state.query&&state.category==="All"?"Your watchlist is empty":state.view==="mine"?"No contributions here yet":"No matching comparisons")+'</h3><p>'+(state.view==="saved"?"Save a comparison using its bookmark.":state.view==="mine"?"Share a price to start a comparison.":"Try another category or search term.")+'</p>'+button(state.view==="mine"?"share":"feed",state.view==="mine"?"Share a price":"Explore the feed","small-btn")+'</div>';
 $("#more-posts").innerHTML=items.length>state.limit?button("load-more","Load more comparisons "+icon("down",14),"load-more"):"";
 $("#retailers").innerHTML=merchantCounts().slice(0,5).map(retailerRow).join("");
}
function setView(view,scroll=true){Object.assign(state,{view,merchant:"",query:"",category:"All",more:false,limit:6});render();if(scroll)$("#feed").scrollIntoView({block:"start"})}
function show(title,body,kind="info"){
 mode=kind;dialog.innerHTML='<div class="modal-head"><h2 id="dialog-title" tabindex="-1">'+h(title)+'</h2>'+button("close",icon("close",17),"icon-btn",'aria-label="Close dialog"')+'</div><div class="modal-body">'+body+'</div>';
 if(!dialog.open)dialog.showModal();dialog.scrollTop=0;$("#dialog-title").focus({preventScroll:true});
}
function close(){dialog.close()}
dialog.addEventListener("close",()=>{mode="";openThread=null;const u=new URL(location.href);if(u.searchParams.has("item")){u.searchParams.delete("item");history.replaceState(null,"",u)}});
dialog.addEventListener("click",e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)close()}});
function lookupLink(t){const u=new URL(location.pathname,location.origin);u.searchParams.set("item",t.id);return u}
function details(t,discussion=false){
 openThread=t.id;history.replaceState(null,"",lookupLink(t));formKey=crypto.randomUUID();
 const qRows=[...t.quotes].sort((a,b)=>a.cents-b.cents).map(q=>'<div class="sighting-row"><strong>'+h(price(q.cents,t.currency))+'</strong><div>'+h(q.context)+'<small>'+h(q.alias)+' · '+h(dayLabel(q.seen))+'</small>'+(q.own?button("remove-quote","Remove my sighting","text-btn",attr(q.id)):"")+'</div></div>').join("");
 const replies=t.comments.map(c=>'<div class="comment-row"><div>'+h(c.body)+'</div><small>'+h(c.alias)+' · '+h(dayLabel(c.created))+'</small>'+(c.own?button("remove-comment","Remove my comment","text-btn",attr(c.id)):"")+'</div>').join("");
 show(t.title,'<div class="detail-meta">'+badge(t.category)+h(t.merchant)+'</div><p>'+h(t.variant)+' · '+h(t.currency)+'</p>'+priceStrip(t)+(t.examples?'<p class="note-box">Illustrative prices and account conditions. Start a real comparison to collect shopper reports for this item.</p>':'<p class="form-note">A gap shows the difference between reports. Check dates, fees, and offer terms before drawing a conclusion.</p>')+'<div class="detail-tools">'+button(t.examples?"start-real":"add-quote",icon("plus",15)+(t.examples?"Start a real comparison":"Add your price"),"primary",attr(t.id))+button("copy-link",icon("link",14)+"Copy link","small-btn",attr(t.id))+'</div><h3>Price sightings ('+t.quotes.length+')</h3>'+qRows+'<h3 id="discussion">Discussion ('+t.comments.length+')</h3>'+replies+'<form id="comment-form"><label class="field">Your comment<textarea name="body" required maxlength="750" placeholder="What else should shoppers compare?"></textarea></label><div class="form-actions"><div class="error-text" role="alert"></div><button class="small-btn" type="submit">Post comment</button></div></form>',"detail");
 if(discussion)requestAnimationFrame(()=>dialog.querySelector("textarea").focus());
}
function field(label,name,opts={}){const {type="text",value="",placeholder="",max=100,required=true,extra=""}=opts;return '<label class="field">'+h(label)+'<input type="'+type+'" name="'+name+'" '+(required?"required ":"")+'maxlength="'+max+'" value="'+h(value)+'" placeholder="'+h(placeholder)+'" '+extra+'></label>'}
function select(label,name,arr,selected){return '<label class="field">'+h(label)+'<select name="'+name+'">'+arr.map(c=>'<option '+(c===selected?"selected":"")+'>'+h(c)+'</option>').join("")+'</select></label>'}
function quoteFields(n,label){return '<fieldset><legend>'+h(label)+'</legend><div class="field-set"><div class="form-row">'+field("Price shown","amount"+n,{type:"number",placeholder:"0.00",extra:'min="0" max="999999999.99" step="0.01"'})+field("Date seen","seen"+n,{type:"date",value:localToday(),extra:'max="'+localToday()+'"'})+'</div>'+field("Account and offer context","context"+n,{max:180,placeholder:"e.g. Signed in, mobile app, tax included"})+'</div></fieldset>'}
function requireAccess(){
 if(!state.ready){toast("The feed is connecting. Try again in a moment.");return false}
 if(state.signed)return true;
 show("Sign in to contribute",'<p>Sign in to save comparisons, share a price, or join a discussion. Your public posts use a shopper alias.</p><a class="primary signin-link" href="/signin-with-chatgpt?return_to='+encodeURIComponent(location.pathname+location.search)+'" target="_top">Sign in with ChatGPT</a>');return false;
}
function savedAlias(){try{return localStorage.getItem("pricewitness-alias")||""}catch{return ""}}
function share(t=null,append=false){
 if(!requireAccess())return;
 formKey=crypto.randomUUID();
 const base=append?'<div class="note-box"><strong>'+h(t.title)+'</strong><div class="form-note">'+h(t.merchant)+' · '+h(t.variant)+' · '+h(t.currency)+'</div></div>':'<div class="form-row">'+field("Retailer or provider","merchant",{max:60,value:t?.merchant||"",placeholder:"e.g. Amazon"})+select("Category","category",categories,t?.category||"Retail")+'</div>'+field("Product or service","title",{value:t?.title||"",placeholder:"e.g. Sony WH-1000XM5 headphones"})+field("Details that identify the same offer","variant",{max:180,value:t?.variant||"",placeholder:"Model and seller, or flight number, date and fare class"})+select("Currency","currency",currencies,t?.currency||"USD");
 show(append?"Add your price":"Share a price",'<p class="side-sub">Share only what another shopper needs to compare the offer.</p><form id="quote-form" '+(append?'data-thread="'+h(t.id)+'"':"")+'>'+base+quoteFields(1,"Your price sighting")+'<div id="second-quote">'+button("second-quote",icon("plus",14)+" Add a second price (optional)","text-btn")+'</div>'+field("Public alias (optional)","alias",{required:false,max:32,value:savedAlias(),placeholder:"Anonymous shopper"})+'<span class="form-note">Leave out names, order numbers, and account details.</span><div class="error-text" role="alert"></div><div class="form-actions">'+button("close","Cancel","small-btn")+'<button class="primary" type="submit">Publish sighting '+icon("arrow-right",15)+'</button></div></form>',"share");
}
const information={
 how:["How PriceWitness works",'<ol class="privacy-list"><li><strong>Find the same offer.</strong> Search for a product, flight, room, or service. Match the seller, model, dates, and terms.</li><li><strong>Share what you saw.</strong> Enter a price, currency, date, and the account or offer conditions. One sighting is enough to start.</li><li><strong>Compare the details.</strong> The feed shows the lowest and highest recorded prices. The percentage gap is the difference divided by the lowest price.</li></ol><p>Promotions, inventory, taxes, and timing can all affect a quote. A difference alone cannot establish why a price changed.</p><p>Cards marked “Example” use illustrative prices. Real sightings are collected in separate comparisons.</p>'],
 privacy:["Your price. Your privacy.",'<p>PriceWitness asks for the price you saw and the conditions that help others compare it. Your merchant credentials, receipts, location history, and browsing history are never requested.</p><h3>What other shoppers see</h3><p>Shared prices, dates, offer details, comments, and the alias you choose. Leaving the alias blank publishes as Anonymous shopper.</p><h3>What the app stores</h3><p>A site-specific sign-in identifier connects your posts, helpful votes, and private watchlist. The app does not store your sign-in email or full name. A preferred alias can be saved on this device.</p><p>You can remove your own price sightings and comments from a comparison. This site uses no advertising pixels or third-party analytics scripts.</p>'],
 guidelines:["Community guidelines",'<ul class="privacy-list"><li>Post prices you actually saw. Add the date, seller, fees, membership offer, and exact product or itinerary where relevant.</li><li>Keep comparisons like-for-like. Start a separate thread for another currency, seller, product variant, or fare class.</li><li>Describe what you observed. Avoid attributing a difference to personal characteristics without evidence.</li><li>Protect everyone’s privacy. Leave out personal names, exact home addresses, account numbers, and order identifiers.</li><li>Keep discussions focused on the offer and treat other shoppers with respect.</li></ul>']
};
function searchResults(v){const result=state.threads.filter(t=>matches(t,v.trim())).slice(0,8);return result.length?result.map(t=>button("detail",merchantLogo(t.merchant)+'<span>'+h(t.title)+'<small>'+h(t.merchant)+' · '+h(t.category)+'</small></span>'+icon("arrow-right",14),"result-row",attr(t.id))).join(""):'<p>No comparisons match this search.</p>'}
function searchBox(){show("Search comparisons",'<form id="search-form"><label class="field">Product, retailer, or route<input id="search-term" name="query" maxlength="120" type="search" placeholder="Try Amazon, headphones, or a route" value="'+h(state.query)+'"></label><button class="small-btn" type="submit">Filter the feed</button></form><div id="search-results">'+searchResults(state.query)+'</div>',"search");$("#search-term").focus()}
async function refresh(){
 const n=++refreshNumber;
 try{const r=await fetch("/api/community",{cache:"no-store"});if(!r.ok)throw Error();const data=await r.json();if(n!==refreshNumber)return;state.threads=data.threads;state.signed=data.signedIn;state.ready=true;$("#load-status").innerHTML="";render()}
 catch{if(n!==refreshNumber)return;state.ready=false;$("#load-status").innerHTML='<div class="message">Community updates are unavailable. '+button("retry","Retry")+'</div>';render()}
}
async function send(payload){
 const res=await fetch("/api/community",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
 const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||"Couldn’t save this change. Try again.");return data;
}
function profile(){show("Your contributor profile",'<p>Your public alias can be different from your sign-in name. Leave it blank to post as Anonymous shopper.</p><form id="profile-form">'+field("Preferred alias on this device","alias",{max:32,required:false,value:savedAlias(),placeholder:"Anonymous shopper"})+'<div class="form-actions"><button class="primary" type="submit">Save preference</button></div></form><h3>Your activity</h3>'+button("mine",icon("layers",15)+" View my contributions","small-btn"))}
async function react(action,t,b){
 if(!requireAccess())return;
 b.disabled=true;const enabled=action==="save"?!t.saved:!t.liked;
 await send({action,thread:t.id,enabled});await refresh();
 if(action==="save")toast(enabled?"Comparison saved to your watchlist.":"Comparison removed from your watchlist.");
}
function goToDetails(id,discussion=false){const t=findThread(id);if(t)details(t,discussion)}
document.addEventListener("click",async e=>{
 const b=e.target.closest("[data-act]");if(!b){if(state.more&&!e.target.closest(".filter-wrap")){state.more=false;render()}return}
 const a=b.dataset.act,id=b.dataset.id,t=findThread(id);
 try{
 if(a==="close"){close();return}
 if(a==="feed"||a==="saved"||a==="mine"){if(dialog.open)close();setView(a);return}
 if(information[a]){show(...information[a]);return}
 if(a==="detail"||a==="discussion"){goToDetails(id,a==="discussion");return}
 if(a==="share"||a==="start-real"||a==="add-quote"){share(t,a==="add-quote");return}
 if(a==="like"||a==="save"){await react(a,t,b);return}
 if(a==="second-quote"){$("#second-quote").innerHTML=quoteFields(2,"Second price sighting")+button("remove-second","Remove second price","text-btn");return}
 if(a==="remove-second"){$("#second-quote").innerHTML=button("second-quote",icon("plus",14)+" Add a second price (optional)","text-btn");return}
 if(a==="category"){state.category=b.dataset.cat;state.limit=6;state.more=false;render();return}
 if(a==="more-categories"){state.more=!state.more;render();return}
 if(a==="merchant"){if(dialog.open)close();Object.assign(state,{view:"feed",category:"All",query:"",merchant:b.dataset.name,limit:6,more:false});render();$("#feed").scrollIntoView();return}
 if(a==="retailers"){show("Explore retailers",'<p>Select a retailer to see its comparisons.</p>'+merchantCounts().map(retailerRow).join(""));return}
 if(a==="clear-merchant"||a==="clear-search"){state[a==="clear-merchant"?"merchant":"query"]="";render();return}
 if(a==="search"){searchBox();return}
 if(a==="profile"){profile();return}
 if(a==="load-more"){state.limit+=6;render();return}
 if(a==="retry"){await refresh();return}
 if(a==="copy-link"){const url=lookupLink(t).href;try{await navigator.clipboard.writeText(url);b.textContent="Link copied"}catch{show("Comparison link",'<label class="field">Copy this address<input readonly value="'+h(url)+'"></label>');dialog.querySelector("input").select()}return}
 if(a==="remove-quote"||a==="remove-comment"){
   const tid=openThread;
   show("Remove your "+(a==="remove-quote"?"sighting":"comment")+"?",'<p>This contribution will be removed from the comparison.</p><div class="form-actions">'+button("detail","Keep it","small-btn",attr(tid))+button("confirm-remove","Remove","primary",attr(id)+' data-op="'+a+'" data-thread="'+h(tid)+'"')+'</div>');return
 }
 if(a==="confirm-remove"){b.disabled=true;await send({action:b.dataset.op,id});await refresh();const thread=findThread(b.dataset.thread);if(thread)details(thread);else close();toast("Your contribution was removed.");return}
 }catch(err){toast(err.message||"Couldn’t complete that action. Please try again.");b.disabled=false}
});
$("#sort").addEventListener("change",e=>{state.sort=e.target.value;state.limit=6;render()});
document.addEventListener("input",e=>{if(e.target.id==="search-term")$("#search-results").innerHTML=searchResults(e.target.value)});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&state.more){state.more=false;render()}});
document.addEventListener("submit",async e=>{
 const form=e.target;e.preventDefault();const val=Object.fromEntries(new FormData(form));
 if(form.id==="search-form"){const q=String(val.query).trim();setView("feed",false);state.query=q;render();close();$("#feed").scrollIntoView();return}
 if(form.id==="profile-form"){try{localStorage.setItem("pricewitness-alias",val.alias.trim());close();toast("Alias preference saved.")}catch{toast("Your browser couldn’t save that preference.")}return}
 if(!requireAccess())return;
 const submit=form.querySelector("[type=submit]");if(submit.disabled)return;submit.disabled=true;const error=form.querySelector(".error-text");error.textContent="";
 try{
   if(form.id==="quote-form"){
     const quote=n=>({cents:Math.round(Number(val["amount"+n])*100),context:val["context"+n],seen:val["seen"+n]});
     const result=await send({action:"quote",key:formKey,thread:form.dataset.thread||null,title:val.title,merchant:val.merchant,category:val.category,variant:val.variant,currency:val.currency,alias:val.alias,quotes:val.amount2===undefined?[quote(1)]:[quote(1),quote(2)]});
     await refresh();setView("feed",false);if(findThread(result.thread))details(findThread(result.thread));else close();toast("Price sighting published.");
   }else if(form.id==="comment-form"){
     const id=openThread;await send({action:"comment",key:formKey,thread:id,body:val.body,alias:savedAlias()});await refresh();goToDetails(id,true);toast("Comment posted.");
   }
 }catch(err){error.textContent=err.message||"Couldn’t save your contribution. Try again."}finally{submit.disabled=false}
});
hydrateIcons();render();await refresh();
const requested=new URL(location.href).searchParams.get("item");if(requested){const t=findThread(requested);if(t)details(t);else if(state.ready)toast("This comparison is no longer available.")}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&!dialog.open)refresh()});
