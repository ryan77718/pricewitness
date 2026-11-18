export default {async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==="/api/community")return communityApi(request,env);
  if(request.method!=="GET" && request.method!=="HEAD")return new Response("Method not allowed",{status:405});
  const asset=assets[path==="/"?"index.html":path.slice(1)];
  if(!asset||!asset.type)return new Response("Page not found",{status:404});
  return new Response(request.method==="HEAD"?null:Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)),{headers:{"Content-Type":asset.type,"Cache-Control":"no-cache","X-Content-Type-Options":"nosniff","Referrer-Policy":"same-origin","Permissions-Policy":"camera=(), microphone=(), geolocation=()"}});
}};
