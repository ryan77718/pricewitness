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
async function feed(db,owner){
  const queries=[
    db.prepare("SELECT * FROM threads ORDER BY created DESC"),
    db.prepare("SELECT id,thread,alias,cents,context,seen,(owner=?) AS own FROM observations ORDER BY seen DESC,id").bind(owner),
    db.prepare("SELECT id,thread,alias,body,created,(owner=?) AS own FROM comments ORDER BY created").bind(owner),
    db.prepare("SELECT thread,SUM(CASE WHEN kind='like' THEN 1 ELSE 0 END) AS votes,MAX(CASE WHEN owner=? AND kind='like' THEN 1 ELSE 0 END) AS liked,MAX(CASE WHEN owner=? AND kind='save' THEN 1 ELSE 0 END) AS saved FROM reactions GROUP BY thread").bind(owner,owner)
  ];
  const [groups,observations,replies,activity]=(await db.batch(queries)).map(q=>q.results);
  const threads=[...groups.map(t=>({...t,quotes:[],comments:[],votes:0,saved:false,liked:false})),...examples.map(t=>({...t,comments:[]}))];
  const byId=new Map(threads.map(t=>[t.id,t]));
  for(const q of observations)byId.get(q.thread)?.quotes.push(q);
  for(const c of replies)byId.get(c.thread)?.comments.push(c);
  for(const a of activity){const t=byId.get(a.thread);if(t)Object.assign(t,{votes:a.votes,saved:!!a.saved,liked:!!a.liked})}
  return threads.filter(t=>t.quotes.length);
}
async function write(db,owner,b){
  const op=b.action;
  if(op==="remove-quote"||op==="remove-comment"){
    const table=op==="remove-quote"?"observations":"comments";
    await db.prepare("DELETE FROM "+table+" WHERE id=? AND owner=?").bind(identifier(b.id),owner).run();return {};
  }
  let t=b.thread?identifier(b.thread):null;
  const example=t && examples.some(e=>e.id===t);
  if(t && !example && !await db.prepare("SELECT id FROM threads WHERE id=?").bind(t).first())throw new InputError("Comparison could not be found.",404);
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
  const batch=[];
  if(!t){
    const title=field(b.title,100,"item"),merchant=field(b.merchant,60,"merchant"),variant=field(b.variant,180,"item details"),category=b.category,currency=b.currency;
    if(!categories.includes(category)||!currencies.includes(currency))throw new InputError("Choose a category and currency.");
    t=await digest(JSON.stringify([title,merchant,variant,category,currency].map(x=>x.trim().replace(/\s+/g," ").toLowerCase())));
    batch.push(db.prepare("INSERT OR IGNORE INTO threads(id,title,merchant,category,variant,currency,created) VALUES(?,?,?,?,?,?,?)").bind(t,title,merchant,category,variant,currency,now));
  }
  if(!Array.isArray(b.quotes)||b.quotes.length<1||b.quotes.length>2)throw new InputError("Enter one or two price sightings.");
  b.quotes.forEach((q,i)=>{
    if(!q||!Number.isSafeInteger(q.cents)||q.cents<0||q.cents>99999999999)throw new InputError("Enter a valid price.");
    if(typeof q.seen!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(q.seen)||Number.isNaN(Date.parse(q.seen))||new Date(q.seen).toISOString().slice(0,10)!==q.seen||q.seen>new Date(Date.now()+86400000).toISOString().slice(0,10))throw new InputError("Enter the date you saw this price.");
    batch.push(db.prepare("INSERT OR IGNORE INTO observations(id,thread,owner,alias,cents,context,seen) VALUES(?,?,?,?,?,?,?)").bind(id+"-"+i,t,owner,alias,q.cents,field(q.context,180,"price context"),q.seen));
  });
  await db.batch(batch);return {thread:t};
}
export async function communityApi(request,env){
  const owner=request.headers.get("oai-authenticated-user-id")||"";
  try{
    if(request.method==="GET")return json({threads:await feed(env.DB,owner),signedIn:!!owner});
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
