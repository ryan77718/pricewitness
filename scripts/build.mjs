import {readFile,writeFile,mkdir,readdir,cp} from "node:fs/promises";
import {extname} from "node:path";
const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".webp":"image/webp"};
const assets={};
for(const name of await readdir("public")){
  const content=await readFile("public/"+name);
  assets[name]={type:types[extname(name)],body:content.toString("base64")};
}
const data=(await readFile("public/data.js","utf8")).replace(/^export /gm,"");
const api=await readFile("worker/api.js","utf8");
const runtime=await readFile("worker/router.js","utf8");
await mkdir("dist/server",{recursive:true});await mkdir("dist/.openai",{recursive:true});
await writeFile("dist/server/index.js","const assets="+JSON.stringify(assets)+";\n"+data+"\n"+api+"\n"+runtime);
await cp(".openai/hosting.json","dist/.openai/hosting.json");await cp("drizzle","dist/.openai/drizzle",{recursive:true});
console.log("Built PriceWitness with "+Object.keys(assets).length+" assets.");
