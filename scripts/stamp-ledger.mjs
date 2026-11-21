// Saves one completed day's public fingerprint list and asks independent RFC 3161 timestamp
// services to stamp it, so the list cannot be quietly rewritten later.
//
//   node scripts/stamp-ledger.mjs https://your-site.example            (yesterday, UTC)
//   node scripts/stamp-ledger.mjs https://your-site.example 2026-11-20
//   node scripts/stamp-ledger.mjs http://127.0.0.1:4387 --no-stamp     (save the list only)
//
// Output goes to ledger/<day>.txt and ledger/<day>.<service>.tsr. Commit both to the public repository.
// Only the SHA-256 of the list is sent to the timestamp services. Verify a stamp with OpenSSL:
//   openssl ts -reply -in ledger/<day>.freetsa.tsr -text
//   openssl ts -verify -data ledger/<day>.txt -in ledger/<day>.freetsa.tsr -CAfile <service CA certificate>
import {createHash, randomBytes} from "node:crypto";
import {mkdir, writeFile} from "node:fs/promises";

export const services = [
  {name: "freetsa", url: "https://freetsa.org/tsr"},
  {name: "digicert", url: "http://timestamp.digicert.com"}
];

// DER-encoded TimeStampReq (RFC 3161 section 2.4.1) for a SHA-256 digest, asking for the signer certificate.
export function timestampRequest(digest, nonce = randomBytes(8)) {
  if (digest.length !== 32 || nonce.length !== 8) throw Error("Expected a 32-byte digest and an 8-byte nonce.");
  const positive = Buffer.from(nonce); positive[0] = (positive[0] & 0x7f) || 1;
  const sha256 = Buffer.from("300d06096086480165030402010500", "hex");
  const imprint = Buffer.concat([Buffer.from([0x30, 0x31]), sha256, Buffer.from([0x04, 0x20]), digest]);
  const body = Buffer.concat([Buffer.from([0x02, 0x01, 0x01]), imprint, Buffer.from([0x02, 0x08]), positive, Buffer.from([0x01, 0x01, 0xff])]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

async function main() {
  const args = process.argv.slice(2), stamp = !args.includes("--no-stamp");
  const [site, chosen] = args.filter(a => !a.startsWith("--"));
  if (!site) throw Error("Give the site address, e.g. node scripts/stamp-ledger.mjs https://your-site.example");
  const day = chosen || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(day)) throw Error("Use a date like 2026-11-20.");
  if (day >= new Date().toISOString().slice(0, 10)) throw Error("Only completed UTC days can be stamped.");
  const response = await fetch(new URL("/api/ledger?day=" + day + "&format=text", site));
  if (!response.ok) throw Error("The site returned " + response.status + " for " + day + ".");
  const text = await response.text(), digest = createHash("sha256").update(text).digest();
  if (response.headers.get("X-Ledger-Root") && response.headers.get("X-Ledger-Root") !== digest.toString("hex")) throw Error("The list does not match its published root.");
  await mkdir("ledger", {recursive: true});
  await writeFile("ledger/" + day + ".txt", text);
  console.log("Saved ledger/" + day + ".txt: " + (text ? text.trim().split("\n").length : 0) + " fingerprints, root " + digest.toString("hex"));
  if (!stamp) return;
  for (const service of services) {
    try {
      const reply = await fetch(service.url, {method: "POST", headers: {"Content-Type": "application/timestamp-query"}, body: timestampRequest(digest), signal: AbortSignal.timeout(20000)});
      if (!reply.ok || !reply.headers.get("content-type")?.includes("timestamp-reply")) throw Error("HTTP " + reply.status);
      await writeFile("ledger/" + day + "." + service.name + ".tsr", Buffer.from(await reply.arrayBuffer()));
      console.log("Stamped by " + service.name + ": ledger/" + day + "." + service.name + ".tsr");
    } catch (error) {
      console.error("Could not get a stamp from " + service.name + ": " + error.message);
    }
  }
}
if (process.argv[1]?.endsWith("stamp-ledger.mjs")) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
