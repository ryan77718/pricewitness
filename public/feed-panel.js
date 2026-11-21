import {markets,marketLabel,usesOrigin,usesDestination,needsBranch} from "./markets.js";

export function createFeedPanel({dialog,show,field,button,h,requireAccess,openResult}) {
  let generation=0;
  async function api(data) {
    const response=await fetch("/api/feeds",data ? {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)} : {cache:"no-store"});
    const body=await response.json();
    if (!response.ok) throw Error(body.error||"Could not reach the feed.");
    return body;
  }
  const errorBox='<p class="error-text" role="alert"></p>';
  const back=()=>button("feeds","All app feeds","small-btn");
  function visible(form){return dialog.open && dialog.contains(form);}
  function formFields(spec) {
    const policy=markets[spec.provider], ride=policy.category==="Rides";
    const zip=(label,name)=>field(label,name,{value:spec[name],max:5,placeholder:"28205",extra:'pattern="[0-9]{5}" inputmode="numeric" autocomplete="off"'});
    return `<div class="field-set market-areas">
      ${usesOrigin(spec)?zip(ride?"Pickup ZIP":policy.location==="service"?"Service ZIP":"Store or restaurant ZIP","originZip"):""}
      ${usesDestination(spec)?zip(ride?"Drop-off ZIP":"Destination ZIP","destinationZip"):""}
      ${needsBranch(spec)?field(policy.category==="Delivery"?"Restaurant and branch":"Retailer and store name or number","branch",{value:spec.branch,max:80,placeholder:policy.category==="Delivery"?"e.g. Chipotle, South End":"e.g. Harris Teeter, The Plaza"}):""}
    </div>`;
  }
  function extraFields(policy,spec) {
    return (policy.extras||[]).map(item=>{
      if(item.choices)return '<label class="field">'+h(item.label)+'<select name="'+item.name+'">'+item.choices.map(v=>'<option '+(spec[item.name]===v?"selected":"")+'>'+h(v)+'</option>').join("")+'</select></label>';
      const type=item.type==="date"?"date":item.type==="integer"?"number":"text";
      const extra=item.type==="integer"?'min="1" max="'+item.max+'" step="1"':item.type==="airport"?'pattern="[A-Za-z]{3}" autocapitalize="characters"':"";
      return field(item.label,item.name,{value:spec[item.name]??(item.type==="country"?"US":""),type,extra,max:item.type==="airport"?3:item.type==="country"?2:item.max||100});
    }).join("");
  }
  function compose(raw={},intent="connect",locked=false) {
    if(!requireAccess())return;
    const spec={...raw},policy=markets[spec.provider];
    spec.fulfillment=spec.fulfillment||policy.modes[0];
    const posting=intent==="publish";
    const localNow=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    const selectMode='<label class="field">Offer type<select name="fulfillment">'+policy.modes.map(m=>`<option ${spec.fulfillment===m?"selected":""}>${h(m)}</option>`).join("")+'</select></label>';
    const fixed=locked?`<div class="note-box"><strong>${h(spec.offer)}</strong><div>${h(spec.variant)}</div><div>${h(marketLabel(spec))}</div>${spec.productCode?"<div>Item ID "+h(spec.productCode)+"</div>":""}</div>`:
      field(policy.offer,"offer",{value:spec.offer})+
      field(policy.variant,"variant",{value:spec.variant,max:180})+extraFields(policy,spec)+
      selectMode+'<div id="feed-area">'+formFields(spec)+'</div>';
    show((posting?"Report a price from ":"Connect a feed from ")+spec.provider,
      `<p class="side-sub">${posting?"Compare a quote with shoppers in the same market.":"Choose the offer and area this connection may publish."} Use public offer details and leave out personal addresses or account IDs.</p>
       <form id="market-form">${fixed}
       ${field("Membership, discounts and fees","context",{value:raw.context,max:180,placeholder:"e.g. Standard account, no coupon"})}
       <div class="note-box"><strong>${h(policy.basis)} · USD</strong><div>${policy.minutes===1440?"UTC calendar-day":policy.minutes+"-minute"} comparison windows. Other shoppers can see the offer, area, time and account conditions.</div></div>
       ${posting?'<div class="form-row">'+field("Price in USD","amount",{type:"number",value:raw.amount||"",extra:'min="0" max="999999999.99" step="0.01"'})+field("Time seen (your local time)","observed",{type:"datetime-local",value:localNow})+'</div>':""}
       ${errorBox}<div class="form-actions">${back()}<button type="submit" class="primary">${posting?"Publish price":"Create connection"}</button></div></form>`,"market");
    const form=dialog.querySelector("form"),key=crypto.randomUUID();
    if(!locked) form.elements.fulfillment.onchange=()=>{
      Object.assign(spec,Object.fromEntries(new FormData(form)));
      form.querySelector("#feed-area").innerHTML=formFields(spec);
    };
    form.onsubmit=async event=>{
      event.preventDefault();
      const submit=form.querySelector("[type=submit]"),out=form.querySelector(".error-text");
      if(submit.disabled)return;
      submit.disabled=true;out.textContent="";
      try {
        const values=Object.fromEntries(new FormData(form));
        const data={action:intent,spec:locked?spec:{...values,provider:spec.provider},context:values.context};
        if(posting) Object.assign(data,{eventId:key,cents:Math.round(Number(values.amount)*100),observedAt:new Date(values.observed).toISOString()});
        const response=await api(data);
        if(!visible(form))return;
        if(posting) await openResult(response.thread);
        else connectionReady(response.token,spec.provider);
      } catch(e){out.textContent=e.message} finally{submit.disabled=false}
    };
  }
  function connectionReady(token,provider) {
    const endpoint=new URL("/api/price-events",location.origin).href;
    const code=endpoint+"#"+token;
    show("Pair your "+provider+" feed",`<p>Paste this private connection code into the browser companion. Anyone with the code can publish prices to this offer.</p>
      <label class="field">Connection code (shown once)<input type="password" readonly id="pair-code" autocomplete="off"></label>
      <div class="detail-tools"><button type="button" class="primary" id="copy-pair">Copy connection code</button></div>
      <h3>From your browser</h3><ol class="privacy-list">
      <li><a href="/price-companion.zip" download>Download the browser companion</a> and unzip it.</li>
      <li>Open Extensions in Chrome or Edge, turn on Developer mode, choose <strong>Load unpacked</strong> and select the unzipped folder containing manifest.json.</li>
      <li>Open the companion, paste the code and pair. On the matching ${h(provider)} offer, select a visible price and confirm it to share subsequent changes for up to 15 minutes.</li></ol>
      <details><summary>Connect your own app or shortcut</summary><p>Send a JSON POST to <code>${h(endpoint)}</code>. Use the part after the # as the bearer token. Retry an event with the same ID, amount and observation time.</p>
      <pre>Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

${h(JSON.stringify({eventId:"quote-001",observedAt:new Date().toISOString(),cents:1825},null,2))}</pre></details>
      <div class="form-actions">${back()}</div>`,"pair");
    const input=dialog.querySelector("#pair-code");input.value=code;
    dialog.querySelector("#copy-pair").onclick=async e=>{
      try{await navigator.clipboard.writeText(code);e.target.textContent="Copied"}
      catch{input.type="text";input.focus();input.select();e.target.textContent="Select and copy the code"}
    };
  }
  async function open(provider,shared=null) {
    if(!requireAccess())return;
    const stamp=++generation;
    const sectors=[...new Set(Object.values(markets).map(policy=>policy.category))];
    const sectorNames={Groceries:"Groceries & consumer staples",Tech:"Tech & electronics",Subscriptions:"Software & subscriptions",Flights:"Airlines",Retail:"General retail"};
    const sectorName=key=>sectorNames[key]||key;
    const selectedSector=provider?markets[provider].category:"Groceries";
    show("App feeds",`<p class="side-sub">Choose where you saw the price. Share from a signed-in website, pair a compatible app, or report a single quote.</p>
       <div class="form-row"><label class="field">Sector<select id="feed-sector"><option value="">All sectors</option>${sectors.map(key=>'<option value="'+h(key)+'" '+(key===selectedSector?"selected":"")+'>'+h(sectorName(key))+'</option>').join("")}</select></label>
       <label class="field">Find an app<input type="search" id="feed-search" placeholder="Search all apps and sectors"></label></div>
       <div class="provider-grid" id="directory-results"></div>
       <div id="provider-choice"></div><h3>Your connections</h3><div id="feed-list" role="status">Loading connections…</div><details><summary>Share from a phone or browser</summary><p>On Android, install PriceWitness from Chrome’s menu. In an app that offers sharing, choose Share, then PriceWitness. Review the draft before publishing. Some apps share only a link.</p><p><a href="/price-companion.zip" download>Download the Chrome / Edge companion</a> to watch a selected website price.</p></details>`,"feeds");
    const list=dialog.querySelector("#feed-list");
    function choose(name) {
      if(shared)return compose({provider:name,amount:shared.amount},"publish");
      dialog.querySelectorAll("[data-provider]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.provider===name)));
      dialog.querySelector("#provider-choice").innerHTML=`<div class="note-box"><strong>${h(markets[name].basis)}</strong><p>Report the price you saw on ${h(markets[name].domain)}, use the browser companion, or pair a compatible app. Prices are shopper contributions.</p>
        <div class="detail-tools"><button class="primary" id="new-connection">Connect feed</button><button class="small-btn" id="one-price">Report once</button></div></div>`;
      dialog.querySelector("#new-connection").onclick=()=>compose({provider:name});
      dialog.querySelector("#one-price").onclick=()=>compose({provider:name},"publish");
    }
    const sector=dialog.querySelector("#feed-sector"),search=dialog.querySelector("#feed-search"),grid=dialog.querySelector("#directory-results");
    function filter(){
      const query=search.value.trim().toLowerCase();
      const names=Object.keys(markets).filter(name=>{
        const category=markets[name].category;
        return (!sector.value || category===sector.value) && (name+" "+sectorName(category)).toLowerCase().includes(query);
      });
      grid.innerHTML=names.map(name=>button("choose-provider","<strong>"+h(name)+"</strong><small>"+h(sectorName(markets[name].category))+"</small>","provider-tile",'data-provider="'+h(name)+'" aria-pressed="false"')).join("")||"<p>No matching apps.</p>";
      dialog.querySelector("#provider-choice").replaceChildren();
    }
    sector.onchange=()=>{search.value="";filter()};
    search.oninput=()=>{sector.value="";filter()};
    grid.onclick=e=>{const tile=e.target.closest("[data-provider]");if(tile)choose(tile.dataset.provider)};
    filter();
    if(provider)choose(provider);
    if(shared)dialog.querySelector(".side-sub").textContent="Choose the app that showed the price to finish your shared draft.";
    try{
      const {feeds}=await api();
      if(stamp!==generation||!visible(list))return;
      list.innerHTML=feeds.length?feeds.map(f=>`<div class="linked-feed"><div><strong>${h(f.spec.provider)} · ${h(f.spec.offer)}</strong><div>${h(marketLabel(f.spec))}</div><small>${f.last_received?"Last price received "+h(new Date(f.last_received).toLocaleString()):"Waiting for first price"}</small></div>${button("disconnect-feed","Disconnect","text-btn",'data-feed="'+h(f.id)+'"')}</div>`).join(""):"<p>No connections yet. Choose an app above to connect your first feed.</p>";
      list.querySelectorAll("[data-feed]").forEach(b=>b.onclick=async()=>{
        b.disabled=true;
        try{await api({action:"disconnect",id:b.dataset.feed});if(visible(list))await open(provider);}
        catch(e){b.disabled=false;list.append(document.createTextNode(e.message))}
      });
    }catch(e){if(visible(list))list.textContent=e.message;}
  }
  return {open,compose};
}
