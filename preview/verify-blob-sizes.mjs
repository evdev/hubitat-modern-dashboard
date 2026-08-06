#!/usr/bin/env node
// Ensure Hubitat File Manager blobs stay within size limits:
//   All JS/CSS → 124 KB (File Manager per-file ceiling)
//   Cloud-critical JS (mld-app.js, mld-app-post3.js) → 118 KB
//     (Hubitat Cloud OAuth/MQTT drops larger responses)
// Run:  node preview/verify-blob-sizes.mjs
// Requires:  npm run build  (or existing dist/upload output)

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const upload = join(root, "dist", "upload");
const HUB_MAX_BLOB = 124 * 1024;
const CLOUD_SAFE_JS_BLOB = 118 * 1024;
/** Boot + deferred post3 are the cloud-critical OAuth JS responses. */
const CLOUD_CRITICAL_JS = new Set(["mld-app.js", "mld-app-post3.js"]);
const CHECK_EXTS = new Set([".js", ".css"]);

const failures = [];

function limitFor(path) {
  const name = basename(path);
  if (CLOUD_CRITICAL_JS.has(name)) return CLOUD_SAFE_JS_BLOB;
  return HUB_MAX_BLOB;
}

function limitLabel(path) {
  const name = basename(path);
  if (CLOUD_CRITICAL_JS.has(name)) return "118 KB (cloud-critical JS)";
  return "124 KB";
}

function checkFile(path) {
  const size = readFileSync(path).length;
  const limit = limitFor(path);
  const kb = (size / 1024).toFixed(1);
  const headroom = ((limit - size) / 1024).toFixed(1);
  if (size >= limit) {
    failures.push(`${path} is ${kb} KB (limit ${limitLabel(path)})`);
    console.error("FAIL:", path.replace(root + "/", ""), `${kb} KB`, `(limit ${limitLabel(path)})`);
    return;
  }
  console.log("ok:", path.replace(root + "/", ""), `${kb} KB`, `(${headroom} KB headroom vs ${limitLabel(path)})`);
}

if (!existsSync(upload)) {
  console.error("FAIL: dist/upload missing — run npm run build first");
  process.exit(1);
}

for (const name of readdirSync(upload).sort()) {
  if (!CHECK_EXTS.has(extname(name))) continue;
  checkFile(join(upload, name));
}

if (failures.length) {
  console.error(
    "\n" + failures.length +
      " file(s) exceed Hubitat blob limits (all ≤ 124 KB; cloud-critical JS ≤ 118 KB)."
  );
  process.exit(1);
}

console.log("\nAll upload blobs are under limits (cloud-critical JS ≤ 118 KB; others ≤ 124 KB).");
