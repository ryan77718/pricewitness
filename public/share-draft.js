import {markets} from "./markets.js";

// Retain only a known provider and a single unambiguous USD amount in the private draft.
export function sharedDraft(form) {
  const text=[form.get("title"),form.get("text"),form.get("url")].filter(s=>typeof s==="string").join(" ").slice(0,8192);
  const providers=new Set();
  const withoutURLs=text.replace(/https?:\/\/[^\s<>"']+/gi,value=>{
    try {
      const host=new URL(value).hostname.toLowerCase();
      for(const [name,{domain}] of Object.entries(markets)){
        if(host===domain || host.endsWith("."+domain))providers.add(name);
      }
    } catch { /* Other share metadata is discarded. */ }
    return " ";
  });
  if(!providers.size) for(const name of Object.keys(markets)){
    const literal=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    if(new RegExp("\\b"+literal+"\\b","i").test(withoutURLs))providers.add(name);
  }
  const amountMatches=[...withoutURLs.matchAll(/(?:\bUSD\s*\$?\s*|(?<![\w$])\$\s*)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?(?![\d.,]\d)/gi)];
  const amounts=new Set(amountMatches.map(m=>Number(m[1].replaceAll(",",""))*100+Number(m[2]||0)));
  const params=new URLSearchParams({share:"1"});
  if(providers.size===1)params.set("provider",[...providers][0]);
  const [cents]=amounts;
  if(amounts.size===1 && Number.isSafeInteger(cents) && cents<=99999999999 && !/\b(?:CAD|AUD|NZD|SGD|HKD|MXN)\b/i.test(withoutURLs))params.set("cents",String(cents));
  return params;
}

export async function shareRedirect(request) {
  if(!request.headers.get("Content-Type")?.startsWith("application/x-www-form-urlencoded"))return new Response("Expected a text or link share.",{status:415});
  if(Number(request.headers.get("Content-Length"))>8192)return new Response("Share is too long.",{status:413});
  const text=await request.text();
  if(text.length>8192)return new Response("Share is too long.",{status:413});
  const url=new URL("/",request.url);url.hash=sharedDraft(new URLSearchParams(text)).toString();
  return new Response(null,{status:303,headers:{Location:url.href,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
