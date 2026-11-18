import {spawn} from "node:child_process";
import {setTimeout as wait} from "node:timers/promises";
const url = "http://127.0.0.1:4387/";
async function running() {
  try {
    const response = await fetch(url, {signal:AbortSignal.timeout(600)});
    return response.ok && (await response.text()).includes("<title>PriceWitness");
  } catch {return false}
}
let started;
if (!await running()) {
  started = spawn(process.execPath, ["scripts/preview.mjs"], {stdio:"inherit"});
  for (let attempt = 0; attempt < 60 && !await running(); attempt++) {
    if (started.exitCode !== null) process.exit(started.exitCode || 1);
    await wait(150);
  }
}
if (!await running()) {
  console.error("PriceWitness could not start on port 4387.");
  started?.kill();
  process.exit(1);
}
spawn("explorer.exe", [url], {detached:true,stdio:"ignore",windowsHide:true}).unref();

