export default {
  async fetch(request,env) {
    const path = new URL(request.url).pathname;
    if(path==="/share-price" && request.method==="POST") return shareRedirect(request);
    if(path==="/api/local-updates" && request.method==="GET") {
      const row=await env.DB.prepare("SELECT COALESCE(MAX(rowid),0) AS revision FROM local_price_events").first();
      return Response.json(row,{headers:{"Cache-Control":"public, max-age=5"}});
    }
    if (path === "/api/feeds" || path === "/api/price-events") return feedApi(request,env,path);
    if (path === "/api/community") return communityApi(request,env);
    if (path === "/api/ledger") return ledgerApi(request,env);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed",{status:405});
    const pages = {"/":"index.html","/methods":"methods.html"};
    const asset = assets[pages[path] || path.slice(1)];
    if (!asset?.type) return new Response("Page not found",{status:404});
    const headers = {
      "Content-Type":asset.type, "Cache-Control":"no-cache", "ETag":asset.etag,
      "X-Content-Type-Options":"nosniff", "Referrer-Policy":"same-origin",
      "Permissions-Policy":"camera=(), microphone=(), geolocation=()"
    };
    const validators = (request.headers.get("If-None-Match") || "").split(",").map(value=>value.trim().replace(/^W\//,""));
    if (validators.includes(asset.etag) || validators.includes("*")) return new Response(null,{status:304,headers});
    const body = request.method === "HEAD" ? null : Uint8Array.from(atob(asset.body),char=>char.charCodeAt(0));
    return new Response(body,{headers});
  }
};
