class InputError extends Error {
  constructor(message,status=400){super(message);this.status=status}
}
const json=(value,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
function field(value,max,label,optional=false){
  if(optional && (value==null || value==="")) return "";
  if(typeof value!=="string" || !value.trim() || value.trim().length>max) throw new InputError("Check the "+label+" field.");
  return value.trim();
}
function identifier(value){if(typeof value!=="string" || !/^[a-zA-Z0-9-]{1,100}$/.test(value))throw new InputError("Invalid record.");return value}
async function write(db,owner,b){
  const op=b.action;
  if(op==="remove-quote"||op==="remove-comment"){
    const table=op==="remove-quote"?"observations":"comments";
    await db.prepare("DELETE FROM "+table+" WHERE id=? AND owner=?").bind(identifier(b.id),owner).run();return {};
  }
  let t=b.thread?identifier(b.thread):null;
  const example=t && examples.some(e=>e.id===t);
  const existing=t && !example ? await db.prepare("SELECT id,offer_spec,campaign FROM threads WHERE id=?").bind(t).first() : null;
  if(t && !example && !existing)throw new InputError("Comparison could not be found.",404);
  if(op==="save"||op==="like"){
    if(!t||typeof b.enabled!=="boolean")throw new InputError("Choose a comparison.");
    const sql=b.enabled?"INSERT OR IGNORE INTO reactions(thread,owner,kind) VALUES(?,?,?)":"DELETE FROM reactions WHERE thread=? AND owner=? AND kind=?";
    await db.prepare(sql).bind(t,owner,op).run();return {thread:t};
  }
  const alias=field(b.alias,32,"display name",true)||"Anonymous shopper";
  const key=identifier(b.key),now=new Date().toISOString();
  // A visitor's retry key cannot collide with another visitor's contribution.
  const digest=async(s)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,"0")).join("");
  const id=await digest(owner+"|"+key);
  if(op==="comment"){
    if(!t)throw new InputError("Choose a comparison.");
    await db.prepare("INSERT OR IGNORE INTO comments(id,thread,owner,alias,body,created) VALUES(?,?,?,?,?,?)").bind(id,t,owner,alias,field(b.body,750,"comment"),now).run();return {thread:t};
  }
  if(op!=="quote"||example)throw new InputError("Start a new comparison to share a real price.");
  if(existing?.offer_spec)
    throw new InputError("Use the local quote form to confirm the market and observation time.");
  const batch=[];
  // Reports added to an existing comparison inherit its price check code.
  let campaign=existing?existing.campaign||"":testCode(b.campaign);
  if(campaign===null)throw new InputError("Use 2 to 40 letters, numbers or dashes for the price check code.");
  if(!t){
    const title=field(b.title,100,"item"),merchant=field(b.merchant,60,"merchant"),variant=field(b.variant,180,"item details"),category=b.category,currency=b.currency;
    if(!categories.includes(category)||!currencies.includes(currency))throw new InputError("Choose a category and currency.");
    const key=[title,merchant,variant,category,currency].map(x=>x.trim().replace(/\s+/g," ").toLowerCase());
    // Reports from an organized price check stay in their own comparison.
    t=await digest(JSON.stringify(campaign?[...key,campaign]:key));
    batch.push(db.prepare("INSERT OR IGNORE INTO threads(id,title,merchant,category,variant,currency,created,campaign) VALUES(?,?,?,?,?,?,?,?)").bind(t,title,merchant,category,variant,currency,now,campaign||null));
  }
  if(!Array.isArray(b.quotes)||b.quotes.length<1||b.quotes.length>2)throw new InputError("Enter one or two price sightings.");
  for(const [i,q] of b.quotes.entries()){
    if(!q||!Number.isSafeInteger(q.cents)||q.cents<0||q.cents>99999999999)throw new InputError("Enter a valid price.");
    if(typeof q.seen!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(q.seen)||Number.isNaN(Date.parse(q.seen))||new Date(q.seen).toISOString().slice(0,10)!==q.seen||q.seen>new Date(Date.now()+86400000).toISOString().slice(0,10))throw new InputError("Enter the date you saw this price.");
    let observed=null;
    if(q.observedAt!=null && q.observedAt!==""){
      observed=confirmedTime(q.observedAt);
      if(Date.parse(observed)>Date.now()+60000)throw new InputError("The time seen cannot be in the future.");
    }
    const evidence=evidenceInput(q),record={id:id+"-"+i,thread:t,cents:q.cents,evidence,campaign,
      observed:observed||q.seen,tier:evidence.proofHash?1:0,received:now};
    record.hash=await recordFingerprint(record);
    batch.push(db.prepare("INSERT OR IGNORE INTO observations(id,thread,owner,alias,cents,context,seen,observed_at,"+evidenceColumnNames+") VALUES("+Array(22).fill("?").join()+")")
      .bind(record.id,t,owner,alias,q.cents,field(q.context,180,"price context"),q.seen,observed,...evidenceColumns(record)));
    batch.push(logEvidence(db,record.id));
  }
  await db.batch(batch);return {thread:t};
}
export async function communityApi(request,env){
  const owner=request.headers.get("oai-authenticated-user-id")||"";
  try{
    if(request.method==="GET")return json(await communityRead(env.DB,owner,request.url));
    if(request.method!=="POST")return json({error:"Method unavailable."},405);
    if(!owner)return json({error:"Sign in to contribute."},401);
    const origin=request.headers.get("origin");
    if(origin && origin!==new URL(request.url).origin)return json({error:"Request origin could not be verified."},403);
    if(!request.headers.get("content-type")?.includes("application/json"))return json({error:"JSON required."},415);
    const raw=await request.text();if(raw.length>8192)return json({error:"This entry is too long."},413);
    let b;try{b=JSON.parse(raw)}catch{return json({error:"Invalid request."},400)}
    if(!b||Array.isArray(b)||typeof b!=="object")return json({error:"Invalid request."},400);
    return json(await write(env.DB,owner,b));
  }catch(e){if(e instanceof InputError)return json({error:e.message},e.status);console.error("Community request failed",e?.name);return json({error:"The community feed is temporarily unavailable. Please try again."},503)}
}
