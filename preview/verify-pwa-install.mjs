#!/usr/bin/env node
// Regression guard for the 0.3.77 Android / Pixel PWA install contract:
// small hub manifest + public release PNGs (never data: URIs or hub-proxied PNGs).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const groovy = readFileSync(join(root, "dist", "ModernLightsDashboard.groovy"), "utf8");
const staticManifest = JSON.parse(
  readFileSync(join(root, "dist", "upload", "mld-manifest.webmanifest"), "utf8"),
);

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
  /def src = "(https:\/\/[^"]+\/mld-icon-\$\{size\}\.png\?v=[^"]+)"/,
);
if (!urlMatch) throw new Error("public icon URL template missing from generated Groovy");

const urls = ["192", "512"].map((size) => urlMatch[1].replace("${size}", size));
for (const url of urls) {
  if (!url.includes(`?v=${pkg.version}`)) {
    throw new Error(`icon URL version mismatch: ${url}`);
  }
  const res = await fetch(url);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  if (!res.ok || res.headers.get("content-type") !== "image/png" || !isPng) {
    throw new Error(`invalid public PWA icon: ${url}`);
  }
  console.log(`ok ${res.status} ${bytes.length}B ${url}`);
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
    const size = idx === 0 ? "192" : "512";
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
