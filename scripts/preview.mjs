import {createServer} from "node:http";
import {localDatabase} from "./local-database.mjs";
import {mkdirSync,readFileSync,existsSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {spawnSync} from "node:child_process";
if(!existsSync("dist/server/index.js") || !process.env.PW_SKIP_BUILD){
 const run=spawnSync(process.execPath,["scripts/build.mjs"],{stdio:"inherit"});if(run.status!==0)process.exit(1);
}
const api=await import(pathToFileURL(resolve("dist/server/index.js")).href);
mkdirSync(".sites-runtime",{recursive:true});const DB=localDatabase(process.env.PW_LOCAL_DB||".sites-runtime/preview.sqlite");
const port=Number(process.env.PORT||4387);
createServer(async(req,res)=>{
 try{
  const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>8192){res.writeHead(413);res.end();return}chunks.push(part)}
  const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(typeof v==="string"&&!k.startsWith("oai-"))headers.set(k,v);
  // Loopback development uses a local test identity. The deployed Worker uses the host's authenticated identity.
  headers.set("oai-authenticated-user-id","local-preview");
  const request=new Request("http://127.0.0.1:"+port+req.url,{method:req.method,headers,body:chunks.length?Buffer.concat(chunks):undefined});
  const response=await api.default.fetch(request,{DB});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end("Preview error")}
}).listen(port,"127.0.0.1",()=>console.log("PriceWitness running at http://127.0.0.1:"+port));
