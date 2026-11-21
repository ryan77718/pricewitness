import {shareRedirect} from "./share-draft.js";

self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin && url.pathname==="/share-price" && event.request.method==="POST"){
    event.respondWith(shareRedirect(event.request));
  }
});
