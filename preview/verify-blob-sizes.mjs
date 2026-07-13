#!/usr/bin/env node
// Ensure Hubitat File Manager blobs stay under 124 KB (JS + CSS).
// Run:  node preview/verify-blob-sizes.mjs
// Requires:  npm run build  (or existing dist/upload output)

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const upload = join(root, "dist", "upload");
const HUB_MAX_BLOB = 124 * 1024;
const CHECK_EXTS = new Set([".js", ".css"]);

const failures = [];

function checkFile(path) {
  const size = readFileSync(path).length;
  const kb = (size / 1024).toFixed(1);
  const headroom = ((HUB_MAX_BLOB - size) / 1024).toFixed(1);
  if (size >= HUB_MAX_BLOB) {
    failures.push(`${path} is ${kb} KB (limit 124 KB)`);
    console.error("FAIL:", path.replace(root + "/", ""), `${kb} KB`);
    return;
  }
  console.log("ok:", path.replace(root + "/", ""), `${kb} KB`, `(${headroom} KB headroom)`);
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
  console.error("\n" + failures.length + " file(s) exceed the 124 KB Hubitat blob limit.");
  process.exit(1);
}

console.log("\nAll JS and CSS upload blobs are under 124 KB.");
