// All browser-facing reads are bounded. Large comparisons return bin counts, not a list of every price.
const BOARD_SIZE = 10;
const RECORDS_PER_PAGE = 12;
const BIN_COUNT = 16;

function pageNumber(value) {
  const n = Number(value || 0);
  if (!Number.isSafeInteger(n) || n < 0 || n > 1000000000) throw new InputError("Invalid page.");
  return n;
}
async function allRows(statement) {
  return (await statement.run()).results;
}
const metricsSQL = `
 (SELECT COUNT(*) FROM observations o WHERE o.thread=t.id) AS count,
 (SELECT COUNT(DISTINCT owner) FROM observations o WHERE o.thread=t.id) AS shoppers,
 (SELECT MIN(cents) FROM observations o WHERE o.thread=t.id) AS low,
 (SELECT MAX(cents) FROM observations o WHERE o.thread=t.id) AS high,
 (SELECT MAX(seen) FROM observations o WHERE o.thread=t.id) AS lastSeen,
 (SELECT COUNT(*) FROM comments c WHERE c.thread=t.id) AS replies,
 (SELECT COUNT(*) FROM reactions r WHERE r.thread=t.id AND r.kind='like') AS votes`;
function asSummary(row) {
  const percent = row.low > 0 ? Math.round((row.high-row.low)/row.low*100) : null;
  return {...row, percent, saved:!!row.saved, liked:!!row.liked};
}
async function sampleSummaries(db, owner) {
  const ids = examples.map(e=>e.id);
  const slots = ids.map(()=>"?").join(",");
  const [reactions, comments] = await db.batch([
    db.prepare(`SELECT thread, SUM(kind='like') AS votes, MAX(owner=? AND kind='like') AS liked,
      MAX(owner=? AND kind='save') AS saved FROM reactions WHERE thread IN (${slots}) GROUP BY thread`).bind(owner,owner,...ids),
    db.prepare(`SELECT thread, COUNT(*) AS replies, MAX(owner=?) AS mine FROM comments WHERE thread IN (${slots}) GROUP BY thread`).bind(owner,...ids)
  ]);
  const flags = new Map(reactions.results.map(r=>[r.thread,r]));
  const counts = new Map(comments.results.map(r=>[r.thread,r]));
  return examples.map(t=>{
    const {quotes,comments, ...base} = t;
    const {low,high}=spread(t);
    return asSummary({...base, low, high, count:quotes.length, shoppers:quotes.length, lastSeen:t.created.slice(0,10), replies:0, ...flags.get(t.id), ...counts.get(t.id)});
  });
}
function applySearch(params,owner) {
  const where=["EXISTS(SELECT 1 FROM observations o WHERE o.thread=t.id)"], args=[];
  const category=params.get("category"), view=params.get("view"), q=(params.get("q")||"").trim().slice(0,120);
  if(category && category!=="All") {where.push("t.category=?");args.push(category)}
  const terms=[...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))];
  for (const term of terms) {
    where.push("instr(lower(t.title||' '||t.merchant||' '||t.variant||' '||t.category||' '||t.market||' '||coalesce(json_extract(t.offer_spec,'$.productCode'),'')||' '||coalesce(t.campaign,'')),lower(?))>0");
    args.push(term);
  }
  if(view==="saved") {
    where.push("t.id IN (SELECT thread FROM reactions WHERE owner=? AND kind='save')");args.push(owner);
  }
  if(view==="mine"){
    where.push("(t.id IN (SELECT thread FROM observations WHERE owner=?) OR t.id IN (SELECT thread FROM comments WHERE owner=?))");args.push(owner,owner);
  }
  return {clause:where.join(" AND "),args,category,view,terms};
}
async function readBoard(db,owner,params) {
  const filter=applySearch(params,owner);
  const sort=params.get("sort")||"newest";
  const order={newest:"created DESC",gap:"CASE WHEN low>0 THEN (high-low)*1.0/low ELSE -1 END DESC",discussed:"replies DESC",helpful:"votes DESC",reports:"count DESC"};
  const offset=pageNumber(params.get("offset"));
  // At most the fixed number of examples can precede the requested live rows.
  const realStart=Math.max(0,offset-examples.length);
  const orderSql=Object.hasOwn(order,sort)?order[sort]:order.newest;
  const base=" FROM threads t WHERE "+filter.clause;
  const sql=`SELECT * FROM (SELECT t.*, ${metricsSQL},
    EXISTS(SELECT 1 FROM reactions WHERE thread=t.id AND owner=? AND kind='save') AS saved,
    EXISTS(SELECT 1 FROM reactions WHERE thread=t.id AND owner=? AND kind='like') AS liked ${base})
    ORDER BY ${orderSql}, created DESC,id DESC LIMIT ? OFFSET ?`;
  const [liveCount, real, samples]=await Promise.all([
    db.prepare("SELECT COUNT(*) AS n"+base).bind(...filter.args).first(),
    allRows(db.prepare(sql).bind(owner,owner,...filter.args,BOARD_SIZE+offset-realStart,realStart)),
    sampleSummaries(db,owner)
  ]);
  const score=t=>({gap:t.low>0?(t.high-t.low)/t.low:-1,discussed:t.replies,helpful:t.votes,reports:t.count}[sort]||0);
  const rank=(a,b)=>score(b)-score(a)||b.created.localeCompare(a.created)||b.id.localeCompare(a.id);
  const matching=samples.filter(t=>(!filter.category||filter.category==="All"||t.category===filter.category)
     && (filter.view!=="saved"||t.saved) && (filter.view!=="mine"||t.mine)
     && filter.terms.every(term=>[t.title,t.merchant,t.variant,t.category].join(" ").toLowerCase().includes(term)));
  const pageStart=offset-realStart;
  const threads=[...real.map(asSummary),...matching].sort(rank).slice(pageStart,pageStart+BOARD_SIZE);
  const total=liveCount.n+matching.length;
  return {threads,total,exampleCount:matching.length,next:offset+threads.length<total?offset+threads.length:null,signedIn:!!owner};
}
function sampleDistribution(t) {
  const values=t.quotes.map(q=>q.cents).sort((a,b)=>a-b);
  const count=values.length,low=values[0],high=values[count-1];
  const median=(values[Math.floor((count-1)/2)]+values[Math.floor(count/2)])/2;
  const width=Math.max(1,Math.ceil((high-low+1)/BIN_COUNT));
  const bins=new Map();
  for (const v of values) {
    const i=count<=8?v:Math.floor((v-low)/width);
    const bin=bins.get(i)||{minSeen:v,maxSeen:v,lo:count<=8?v:low+i*width,hi:count<=8?v:Math.min(high,low+(i+1)*width-1),n:0};
    bin.maxSeen=v;bin.n++;bins.set(i,bin);
  }
  return {count,low,high,median,bins:[...bins.values()],currency:t.currency,examples:true};
}
async function realDistribution(db,t) {
  const mid=Math.floor((t.count-1)/2), size=t.count%2?1:2;
  const width=Math.max(1,Math.ceil((t.high-t.low+1)/BIN_COUNT));
  const grouped=t.count<=8
    ? db.prepare("SELECT cents AS lo,cents AS hi,COUNT(*) AS n FROM observations WHERE thread=? GROUP BY cents ORDER BY cents").bind(t.id)
    : db.prepare(`SELECT ?+bucket*? AS lo,MIN(?,?+(bucket+1)*?-1) AS hi,MIN(cents) AS minSeen,MAX(cents) AS maxSeen,COUNT(*) AS n
        FROM (SELECT cents,CAST((cents-?)/? AS INTEGER) AS bucket FROM observations WHERE thread=?)
        GROUP BY bucket ORDER BY bucket`).bind(t.low,width,t.high,t.low,width,t.low,width,t.id);
  const [middle,buckets]=await db.batch([
    db.prepare("SELECT cents FROM observations WHERE thread=? ORDER BY cents LIMIT ? OFFSET ?").bind(t.id,size,mid),
    grouped
  ]);
  const cents=middle.results.map(r=>r.cents);
  return {currency:t.currency,count:t.count,low:t.low,high:t.high,median:cents.reduce((a,b)=>a+b,0)/cents.length,bins:buckets.results,examples:false};
}
function requestedBand(params) {
  if (!params.has("min") && !params.has("max")) return null;
  const amounts=["min","max"].map(key=>{
    const raw=params.get(key);
    if (!/^\d{1,11}$/.test(raw ?? "")) throw new InputError("Invalid price range.");
    return Number(raw);
  });
  if (amounts[0]>amounts[1]) throw new InputError("Invalid price range.");
  return amounts;
}
async function getRecordPage(db, owner, id, kind, offset, sample, band=null) {
  if(kind==="sightings" && sample) {
    const quotes=band ? sample.quotes.filter(q=>q.cents>=band[0] && q.cents<=band[1]) : sample.quotes;
    return {rows:quotes.slice(offset,offset+RECORDS_PER_PAGE),more:offset+RECORDS_PER_PAGE<quotes.length};
  }
  const query=kind==="comments"
    ? "SELECT id,alias,body,created,(owner=?) AS own FROM comments WHERE thread=? ORDER BY created DESC,id DESC LIMIT ? OFFSET ?"
    : "SELECT id,alias,cents,context,seen,observed_at,channel,list_cents,fees_cents,total_cents,search_rank,notice,notice_text,conditions,shopper_state,tier,campaign,record_hash,(owner=?) AS own FROM observations WHERE thread=?" +
      (band ? " AND cents BETWEEN ? AND ?" : "") + " ORDER BY seen DESC,observed_at DESC,id DESC LIMIT ? OFFSET ?";
  const rows=await allRows(db.prepare(query).bind(owner,id,...(band||[]),RECORDS_PER_PAGE+1,offset));
  const page=rows.slice(0,RECORDS_PER_PAGE);
  return {rows:kind==="comments"?page:page.map(publicSighting),more:rows.length>RECORDS_PER_PAGE};
}
async function endpointReports(db,owner,t,sample) {
  const prices = t.low === t.high ? [t.low] : [t.low,t.high];
  if (sample) return prices.map(cents => sample.quotes.find(q => q.cents === cents));
  const results = await db.batch(prices.map(cents => db.prepare(
    "SELECT id,cents,context,seen,observed_at,channel,alias,(owner=?) AS own FROM observations WHERE thread=? AND cents=? ORDER BY seen DESC,observed_at DESC,id DESC LIMIT 1"
  ).bind(owner,t.id,cents)));
  return results.map(result => result.results[0]).filter(Boolean).map(publicSighting);
}
async function readItem(db,owner,id,includeRecords=true) {
  const sample=examples.find(e=>e.id===id);
  const t=sample?(await sampleSummaries(db,owner)).find(s=>s.id===id):await db.prepare(`
    SELECT t.*, ${metricsSQL},
    EXISTS(SELECT 1 FROM reactions WHERE thread=t.id AND owner=? AND kind='save') AS saved,
    EXISTS(SELECT 1 FROM reactions WHERE thread=t.id AND owner=? AND kind='like') AS liked
    FROM threads t WHERE id=?`).bind(owner,owner,id).first();
  if(!t||!t.count)throw new InputError("This comparison is no longer available.",404);
  const [plot,edges,quotes,replies,evidence]=await Promise.all([
    sample?sampleDistribution(sample):realDistribution(db,t),
    endpointReports(db,owner,t,sample),
    includeRecords && getRecordPage(db,owner,id,"sightings",0,sample),
    includeRecords && getRecordPage(db,owner,id,"comments",0,sample),
    sample?null:evidenceSummary(db,t)
  ]);
  const summary={...asSummary(t),plot:{...plot,edges},evidence};
  return includeRecords ? {...summary,quotes:quotes.rows,comments:replies.rows,moreQuotes:quotes.more,moreComments:replies.more} : summary;
}
async function communityRead(db,owner,url) {
  const p=new URL(url).searchParams, mode=p.get("mode");
  if(mode==="featured") {
    const live = await allRows(db.prepare(`SELECT t.id,t.title FROM threads t WHERE EXISTS
      (SELECT 1 FROM observations o WHERE o.thread=t.id LIMIT 1 OFFSET 1)
      ORDER BY t.created DESC,t.id DESC LIMIT 4`));
    const choices = [...live];
    for (const sample of examples) {
      if (choices.length >= 4) break;
      choices.push({id:sample.id,title:sample.title});
    }
    const selected = choices.find(choice=>choice.id===p.get("id")) || choices[0];
    return {item:await readItem(db,owner,selected.id,false),choices};
  }
  if(mode==="board") return readBoard(db,owner,p);
  if(mode==="item") return {item:await readItem(db,owner,identifier(p.get("id"))),signedIn:!!owner};
  if(mode==="sightings"||mode==="comments") {
    const id=identifier(p.get("id"));
    return getRecordPage(db,owner,id,mode,pageNumber(p.get("offset")),examples.find(e=>e.id===id),mode==="sightings"?requestedBand(p):null);
  }
  // Older clients receive the first bounded page with the original field names.
  const board=await readBoard(db,owner,p);
  return {...board,threads:await Promise.all(board.threads.map(t=>readItem(db,owner,t.id)))};
}
