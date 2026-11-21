import {readFile,writeFile,mkdir,readdir,cp,rename} from "node:fs/promises";
import {createHash} from "node:crypto";
import {extname} from "node:path";
import {companionZip} from "./companion-zip.mjs";
const types={".webmanifest":"application/manifest+json",".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml",".jpg":"image/jpeg",".png":"image/png",".webp":"image/webp"};
const assets={};
for(const name of await readdir("public")){
  const content=await readFile("public/"+name);
  const etag = '"' + createHash("sha256").update(content).digest("hex") + '"';
  assets[name]={type:types[extname(name)],etag,body:content.toString("base64")};
}
const providers=await readFile("companion/providers.js");
assets["companion/providers.js"]={type:types[".js"],etag:'"'+createHash("sha256").update(providers).digest("hex")+'"',body:providers.toString("base64")};
const extension=await companionZip();
assets["price-companion.zip"]={type:"application/zip",etag:'"'+createHash("sha256").update(extension).digest("hex")+'"',body:extension.toString("base64")};
const shared=[providers.toString("utf8"),...await Promise.all(["data","markets","share-draft"].map(name=>readFile("public/"+name+".js","utf8")))];
const data=shared.join("\n").replace(/^export /gm,"").replace(/^import .*?;\r?$/gm,"");
const api = (await Promise.all(["examples","api","read","feeds"].map(name=>readFile("worker/"+name+".js","utf8")))).join("\n");
const runtime=await readFile("worker/router.js","utf8");
await mkdir("dist/server",{recursive:true});await mkdir("dist/.openai",{recursive:true});
const staging = "dist/server/build-" + process.pid + ".tmp";
await writeFile(staging,"const assets="+JSON.stringify(assets)+";\n"+data+"\n"+api+"\n"+runtime);
await rename(staging,"dist/server/index.js");
await cp(".openai/hosting.json","dist/.openai/hosting.json");await cp("drizzle","dist/.openai/drizzle",{recursive:true});
console.log("Built PriceWitness with "+Object.keys(assets).length+" assets.");
