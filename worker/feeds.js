async function hashText(value) {
  const hash = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,"0")).join("");
}
function validateSpec(raw) {
  if (!raw || !Object.hasOwn(markets,raw.provider)) throw new InputError("Choose a supported app.");
  const provider=raw.provider, policy=markets[provider];
  if (!policy.modes.includes(raw.fulfillment)) throw new InputError("Choose how the offer is fulfilled.");
  const spec={provider,offer:field(raw.offer,100,"offer"),variant:field(raw.variant,180,"offer details"),fulfillment:raw.fulfillment};
  function zip(value) {
    if (typeof value!=="string" || !/^\d{5}$/.test(value) || value==="00000") throw new InputError("Enter a five-digit US ZIP code for each area.");
    return value;
  }
  spec.originZip=usesOrigin(spec) ? zip(raw.originZip) : "";
  spec.destinationZip=usesDestination(spec) ? zip(raw.destinationZip) : "";
  spec.branch=needsBranch(spec) ? field(raw.branch,80,"store or restaurant branch") : "";
  for(const item of policy.extras||[]){
    let value=field(raw[item.name],item.type==="date"?10:item.max && item.type!=="integer"?item.max:48,item.label);
    if(item.type==="country"){
      value=value.toUpperCase();
      if(!/^[A-Z]{2}$/.test(value))throw new InputError("Use a two-letter storefront country code.");
    }
    if(item.type==="airport"){
      value=value.toUpperCase();
      if(!/^[A-Z]{3}$/.test(value))throw new InputError("Use a three-letter airport code.");
    }
    if(item.type==="date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw new InputError("Enter a valid "+item.label.toLowerCase()+".");
    if(item.type==="integer" && (!/^[1-9]\d*$/.test(value)||Number(value)>item.max))throw new InputError("Enter between 1 and "+item.max+" adults.");
    if(item.choices && !item.choices.includes(value))throw new InputError("Choose a price stage.");
    spec[item.name]=value;
  }
  if(spec.checkOut && spec.checkOut<=spec.checkIn)throw new InputError("Check-out must be after check-in.");
  if(policy.location==="airports"){
    spec.offer=spec.offer.toUpperCase().replace(/\s/g,"");
    if(!/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(spec.offer)||spec.departure===spec.arrival)throw new InputError("Check the flight number and airport pair.");
  }
  return spec;
}
async function feedBody(request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new InputError("JSON required.",415);
  if (Number(request.headers.get("content-length"))>8192) throw new InputError("Entry is too long.",413);
  const raw=await request.text();
  if(raw.length>8192) throw new InputError("Entry is too long.",413);
  let data;
  try {data=JSON.parse(raw)} catch {throw new InputError("Invalid JSON.")}
  if (!data || typeof data!=="object" || Array.isArray(data)) throw new InputError("Invalid request.");
  return data;
}
function confirmedTime(value) {
  if (typeof value!=="string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) throw new InputError("Send the time the price was seen in UTC.");
  const time=Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().replace(".000Z","Z")!==value.replace(".000Z","Z")) throw new InputError("Invalid observation time.");
  return new Date(time).toISOString();
}
async function recordLocalPrice(db, owner, spec, context, data, feed=null) {
  const eventId=identifier(data.eventId), cents=data.cents, observed=confirmedTime(data.observedAt);
  if (!Number.isSafeInteger(cents) || cents<0 || cents>99999999999) throw new InputError("Send the USD price in whole cents.");
  const now=new Date().toISOString(), time=Date.parse(observed);
  const source=feed?.id ?? "manual:"+owner;
  const evidence=evidenceInput(data);
  const campaign=feed ? feed.campaign||"" : testCode(data.campaign);
  if(campaign===null) throw new InputError("Use 2 to 40 letters, numbers or dashes for the price check code.");
  // Connected apps and the browser companion send a page fingerprint; the website form sends a screenshot fingerprint.
  const tier=evidence.proofHash ? (feed ? 2 : 1) : 0;
  const fingerprint=await hashText(JSON.stringify([cents,observed,spec,context,evidence,campaign]));
  function receipt(row) {
    if (row.fingerprint!==fingerprint) throw new InputError("This event ID already has a different price or time.",409);
    return {thread:row.thread};
  }
  const previous=db.prepare("SELECT fingerprint,thread FROM local_price_events WHERE source=? AND event_id=?").bind(source,eventId);
  const prior=await previous.first();
  if(prior) return receipt(prior);
  if (time>Date.now()+60000 || time<Date.now()-86400000) throw new InputError("Send a quote observed within the past 24 hours.");
  const {minutes:windowMinutes,category}=markets[spec.provider];
  const normalized=Object.entries(spec).filter(([key])=>key!=="offer" || !spec.productCode).map(([,value])=>value.trim().replace(/\s+/g," ").toLowerCase());
  // Everyday reports share fixed clock windows. An organized price check is one comparison per offer and
  // code, so two participants checking seconds apart never land on opposite sides of a window boundary.
  const minutes=campaign ? 0 : windowMinutes;
  const period=campaign ? new Date(Math.floor(time/60000)*60000).toISOString() : new Date(Math.floor(time/(minutes*60000))*minutes*60000).toISOString();
  const thread=await hashText(JSON.stringify(campaign ? ["local-usd-test-v1",...normalized,campaign] : ["local-usd-v1",...normalized,period]));
  const record=await hashText(JSON.stringify(["local-sighting",owner,thread]));
  const entry={id:record,thread,cents,evidence,campaign,observed,tier,received:now};
  entry.hash=await recordFingerprint(entry);
  const batch=[];
  // The receipt and sighting commit together. Recheck revocation inside the same transaction.
  if (feed) {
    batch.push(db.prepare(`INSERT OR IGNORE INTO local_price_events(source,event_id,fingerprint,thread)
      SELECT id,?,?,? FROM price_feeds WHERE id=? AND token_hash=?`)
      .bind(eventId,fingerprint,thread,feed.id,feed.token_hash));
  } else {
    batch.push(db.prepare("INSERT OR IGNORE INTO local_price_events(source,event_id,fingerprint,thread) VALUES(?,?,?,?)").bind(source,eventId,fingerprint,thread));
  }
  const guard=" WHERE EXISTS(SELECT 1 FROM local_price_events WHERE source=? AND event_id=? AND fingerprint=?)";
  const guardArgs=[source,eventId,fingerprint];
  batch.push(db.prepare(`INSERT OR IGNORE INTO threads(id,title,merchant,category,variant,currency,created,market,period_start,period_minutes,offer_spec,campaign)
    SELECT ?,?,?,?,?,'USD',?,?,?,?,?,?`+guard).bind(thread,spec.offer,spec.provider,category,spec.variant,now,marketLabel(spec),period,minutes,JSON.stringify(spec),campaign||null,...guardArgs));
  const updates=evidenceColumnNames.split(",").map(name=>name+"=excluded."+name).join(",");
  batch.push(db.prepare(`INSERT INTO observations(id,thread,owner,alias,cents,context,seen,observed_at,channel,${evidenceColumnNames})
    SELECT ?,?,?,'Anonymous shopper',?,?,?,?,?,${Array(14).fill("?").join()}`+guard+`
    ON CONFLICT(id) DO UPDATE SET cents=excluded.cents,context=excluded.context,seen=excluded.seen,
    observed_at=excluded.observed_at,channel=excluded.channel,${updates} WHERE excluded.observed_at>observations.observed_at`)
    .bind(record,thread,owner,cents,context,observed.slice(0,10),observed,feed?"Connected app":"Shopper report",...evidenceColumns(entry),...guardArgs));
  batch.push(logEvidence(db,record));
  if(feed) {
    batch.push(db.prepare("UPDATE price_feeds SET last_received=? WHERE id=? AND token_hash=?").bind(now,feed.id,feed.token_hash));
  }
  batch.push(previous);
  const result=(await db.batch(batch)).at(-1).results[0];
  if(!result) throw new InputError("This connection has been disconnected.",401);
  return receipt(result);
}
async function feedApi(request,env,path) {
  try {
    const db=env.DB, method=request.method;
    if (!["GET","POST"].includes(method)) throw new InputError("Method unavailable.",405);
    if (path==="/api/price-events") {
      const bearer=/^Bearer (pv_[a-f0-9]{64})$/.exec(request.headers.get("Authorization")||"");
      const feed=bearer && await db.prepare("SELECT * FROM price_feeds WHERE token_hash=?").bind(await hashText(bearer[1])).first();
      if (!feed) throw new InputError("Connection code is invalid or disconnected.",401);
      const spec=JSON.parse(feed.spec);
      if(method==="GET") return json({id:feed.id,spec,context:feed.context,campaign:feed.campaign||"",domain:markets[spec.provider].domain,basis:markets[spec.provider].basis,market:marketLabel(spec)});
      return json(await recordLocalPrice(db,feed.owner,spec,feed.context,await feedBody(request),feed));
    }
    const owner=request.headers.get("oai-authenticated-user-id");
    if(!owner) throw new InputError("Sign in to manage price feeds.",401);
    if(method==="GET") {
      const rows=await allRows(db.prepare("SELECT id,spec,context,campaign,created,last_received FROM price_feeds WHERE owner=? AND token_hash IS NOT NULL ORDER BY created DESC").bind(owner));
      return json({feeds:rows.map(row=>({...row,spec:JSON.parse(row.spec)}))});
    }
    const origin=request.headers.get("origin");
    if (origin && origin!==new URL(request.url).origin) throw new InputError("Invalid request origin.",403);
    const data=await feedBody(request);
    if(data.action==="disconnect") {
      await db.prepare("UPDATE price_feeds SET token_hash=NULL WHERE id=? AND owner=?").bind(identifier(data.id),owner).run();
      return json({});
    }
    const spec=validateSpec(data.spec), context=field(data.context,180,"account and offer conditions");
    if(data.action==="publish") return json(await recordLocalPrice(db,owner,spec,context,data));
    if(data.action!=="connect") throw new InputError("Unknown action.");
    const campaign=testCode(data.campaign);
    if(campaign===null) throw new InputError("Use 2 to 40 letters, numbers or dashes for the price check code.");
    const id=crypto.randomUUID(),token="pv_"+Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,"0")).join("");
    const created=new Date().toISOString();
    const result=await db.prepare(`INSERT INTO price_feeds(id,owner,spec,context,token_hash,created,campaign)
      SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM price_feeds WHERE owner=? AND token_hash IS NOT NULL)<30 RETURNING id`)
      .bind(id,owner,JSON.stringify(spec),context,await hashText(token),created,campaign||null,owner).run();
    if (!result.results.length) throw new InputError("Disconnect an unused feed before creating another.",409);
    return json({id,token},201);
  } catch(error) {
    if(error instanceof InputError) return json({error:error.message},error.status);
    console.error("Price feed request failed",error?.name);
    return json({error:"Price feeds are temporarily unavailable."},503);
  }
}
