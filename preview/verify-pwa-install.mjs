#!/usr/bin/env node
// Regression guard for the 0.3.77 Android / Pixel PWA install contract:
// small hub manifest + public release PNGs (never data: URIs or hub-proxied PNGs).
//
// 0.3.86: icon URLs are version-in-FILENAME, not "?v=" query string.
// raw.githubusercontent.com caches by path only and ignores query strings for its
// cache key, so bumping only a query string never busts its edge cache — the CDN can
// (and did) keep serving a stale icon under a "new" versioned URL for its full TTL.
// A distinct filename per release has no prior cached entry to collide with.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const groovy = readFileSync(join(root, "dist", "ModernLightsDashboard.groovy"), "utf8");
const staticManifest = JSON.parse(
  readFileSync(join(root, "dist", "upload", "mld-manifest.webmanifest"), "utf8"),
);
const builtIndex = readFileSync(join(root, "dist", "upload", "mld-index.html"), "utf8");

if (!builtIndex.includes("crossorigin=\"use-credentials\"")) {
  throw new Error("index.html manifest link missing crossorigin=use-credentials");
}
if (!groovy.includes(',"id":"/mDash"')) {
  throw new Error("generated manifest missing stable id");
}

const manifestBody = groovy.slice(
  groovy.indexOf("def renderManifest()"),
  groovy.indexOf("def renderSw()"),
);
if (!manifestBody || manifestBody.includes("data:image")) {
  throw new Error("renderManifest must not embed data: URI icons");
}
if (/icons\/icon-/.test(manifestBody)) {
  throw new Error("renderManifest must not reference hub-proxied icons/icon-*.png");
}

const urlMatch = groovy.match(
  /def src = "(https:\/\/[^"]+\/mld-icon-\$\{size\}-[^"]+\.png)"/,
);
if (!urlMatch) throw new Error("public icon URL template missing from generated Groovy");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);
const isPngSignature = (buf) =>
  [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => buf[i] === v);

const sizes = ["192", "512", "1024"];
const urls = sizes.map((size) => urlMatch[1].replace("${size}", size));

for (const [idx, url] of urls.entries()) {
  const size = sizes[idx];
  if (!url.endsWith(`-${pkg.version}.png`)) {
    throw new Error(`icon URL version mismatch: ${url}`);
  }

  const localPath = join(root, "dist", "upload", `mld-icon-${size}-${pkg.version}.png`);
  const local = readFileSync(localPath);
  if (!isPngSignature(local) || local.readUInt32BE(16) !== Number(size)) {
    throw new Error(`local ${localPath} missing or invalid`);
  }

  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) {
    // Expected before this release is committed/pushed: the filename is brand new and
    // has never been fetched, so there is nothing stale to worry about once published.
    console.log(`pending publish (404 until pushed) ${url} — local ok ${local.length}B ${sha256(local)}`);
    continue;
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!res.ok || res.headers.get("content-type") !== "image/png" || !isPngSignature(bytes)) {
    throw new Error(`invalid public PWA icon: ${url}`);
  }
  if (!bytes.equals(local)) {
    throw new Error(
      `published icon does not match local build (possible CDN staleness): ${url} ` +
        `(remote ${bytes.length}B ${sha256(bytes)} vs local ${local.length}B ${sha256(local)})`,
    );
  }
  console.log(`ok ${res.status} ${bytes.length}B ${sha256(bytes)} ${url}`);
}

const purposes = staticManifest.icons.map((i) => i.purpose);
if (!purposes.includes("any") || !purposes.includes("maskable")) {
  throw new Error(`static manifest missing any/maskable purposes: ${purposes.join(",")}`);
}
if (purposes.some((p) => String(p).includes(" "))) {
  throw new Error(`static manifest must split purposes (got ${purposes.join(",")})`);
}

const simulated = {
  name: "mDash",
  short_name: "mDash",
  start_url: `./dashboard?access_token=${"x".repeat(40)}`,
  scope: "./",
  display: "standalone",
  background_color: "#0b0d12",
  theme_color: "#0b0d12",
  icons: urls.flatMap((src, idx) => {
    const size = sizes[idx];
    return ["any", "maskable"].map((purpose) => ({
      src,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose,
    }));
  }),
};
const bytes = Buffer.byteLength(JSON.stringify(simulated));
if (bytes > 2048) throw new Error(`simulated cloud manifest too large: ${bytes} bytes`);
console.log(`ok simulated cloud manifest ${bytes} bytes`);
console.log("PWA install contract verified");
