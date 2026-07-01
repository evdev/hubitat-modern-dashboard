#!/usr/bin/env node
// Build outputs:
//   dist/ModernLightsDashboard.groovy     — paste into Apps Code (manual / HPM)
//   dist/upload/mld-*                     — upload to File Manager (manual / HPM)
//   dist/ModernLightsDashboard.bundle.zip — Hubitat Bundles → Import ZIP
//   hubitat/packageManifest.json          — HPM manifest (apps + files)

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { iconBase64, createIconPng } from "./lib/pwa-icons.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const dist = join(root, "dist");
const upload = join(dist, "upload");
const staging = join(dist, "bundle-staging");
const hubitat = join(root, "hubitat");

const MLD_SPLIT = "// __MLD_SPLIT__";
const HUB_MAX_JS = 128 * 1024;

// Must match definition(namespace:, name:) in the Groovy template
const NS = "modernlights";
const APP_FILE = `${NS}.ModernLightsDashboard.groovy`;
const BUNDLE_NAME = "ModernLightsDashboard";
const APP_DISPLAY_NAME = "Modern Dashboard";

const HPM_BASE_URL =
  process.env.HPM_BASE_URL ??
  "https://raw.githubusercontent.com/evdev/hubitat-modern-dashboard/master/dist";

// Stable UUIDs for HPM update tracking (do not regenerate per build)
const HPM_APP_ID = "a4f8c2e1-6b3d-4a9f-8e7c-1d2b3c4d5e6f";
const FILE_MANAGER_ASSETS = [
  { id: "b1a2c3d4-e5f6-7890-abcd-ef1234567890", name: "mld-index.html" },
  { id: "c2b3d4e5-f6a7-8901-bcde-f12345678901", name: "mld-app.css" },
  { id: "d3c4e5f6-a7b8-9012-cdef-123456789012", name: "mld-app-pre.js" },
  { id: "e4d5f6a7-b8c9-0123-def0-234567890123", name: "mld-app.js" },
  { id: "f5e6a7b8-c9d0-1234-ef01-345678901234", name: "mld-app-post.js" },
  { id: "a6f7b8c9-d0e1-2345-f012-456789012345", name: "mld-manifest.webmanifest" },
  { id: "b7a8c9d0-e1f2-3456-0123-567890123456", name: "mld-sw.js" },
  { id: "c8b9d0e1-f2a3-4567-1234-678901234567", name: "mld-icon-192.b64" },
  { id: "d9c0e1f2-a3b4-5678-2345-789012345678", name: "mld-icon-512.b64" },
];

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function parseTopLevelIds(lines) {
  const ids = [];
  for (const line of lines) {
    if (!line.startsWith("  ")) continue;
    let m = line.match(/^  (?:let|const) ([A-Za-z_$][\w$]*)/);
    if (m) {
      ids.push(m[1]);
      continue;
    }
    m = line.match(/^  (?:async )?function ([A-Za-z_$][\w$]*)/);
    if (m) ids.push(m[1]);
  }
  return [...new Set(ids)];
}

function rewriteCodeSegment(segment, replaceIds) {
  let out = segment;
  for (const id of replaceIds) {
    const re = new RegExp(
      `(?<!(?:const|let|var) )(?<![.\\w])${id.replace(/\$/g, "\\$")}(?![\\w$])`,
      "g"
    );
    out = out.replace(re, `M.${id}`);
  }
  return out;
}

function rewritePart2PreservingStrings(code, replaceIds) {
  const parts = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === "/" && code[i + 1] === "/") {
      const start = i;
      i += 2;
      while (i < code.length && code[i] !== "\n") i++;
      parts.push({ literal: false, text: code.slice(start, i) });
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
      parts.push({ literal: false, text: code.slice(start, i) });
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const start = i;
      i++;
      while (i < code.length) {
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === ch) {
          i++;
          break;
        }
        i++;
      }
      parts.push({ literal: true, text: code.slice(start, i) });
      continue;
    }
    const start = i;
    while (i < code.length) {
      const c = code[i];
      if (c === '"' || c === "'" || c === "`") break;
      if (c === "/" && (code[i + 1] === "/" || code[i + 1] === "*")) break;
      i++;
    }
    parts.push({ literal: false, text: code.slice(start, i) });
  }
  return parts
    .map((p) => (p.literal ? p.text : rewriteCodeSegment(p.text, replaceIds)))
    .join("");
}

function parseTopLevelFunctions(lines) {
  const ids = [];
  for (const line of lines) {
    if (!line.startsWith("  ")) continue;
    const m = line.match(/^  (?:async )?function ([A-Za-z_$][\w$]*)/);
    if (m) ids.push(m[1]);
  }
  return [...new Set(ids)];
}

function rewritePart2(part2Lines, exportIds) {
  const localIds = new Set(parseTopLevelIds(part2Lines));
  const replaceIds = exportIds.filter((id) => !localIds.has(id));
  replaceIds.sort((a, b) => b.length - a.length);
  return rewritePart2PreservingStrings(part2Lines.join("\n"), replaceIds);
}

function splitAppJs(srcPath) {
  const raw = readFileSync(srcPath, "utf8");
  const splitIdx = raw.indexOf(MLD_SPLIT);
  if (splitIdx < 0) throw new Error(`Missing ${MLD_SPLIT} in src/app.js`);

  const part1Lines = raw.slice(0, splitIdx).trimEnd().split("\n");
  let part2Lines = raw.slice(splitIdx + MLD_SPLIT.length).trimStart().split("\n");

  const trimTrailing = (lines) => {
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    while (lines.length && /^}\)\(\);?\s*$/.test(lines[lines.length - 1])) lines.pop();
    return lines;
  };
  trimTrailing(part1Lines);
  trimTrailing(part2Lines);

  const exportIds = parseTopLevelIds(part1Lines.slice(1));
  const exportBlock = `  globalThis.__MLD = { ${exportIds.join(", ")} };`;
  const part1Out = `${part1Lines.join("\n")}\n${exportBlock}\n})();\n`;

  const part2Body = rewritePart2(part2Lines, exportIds);
  const post2Ids = parseTopLevelFunctions(part2Lines).filter((id) => !exportIds.includes(id));
  const postAssign = post2Ids.length
    ? `\n  Object.assign(M, { ${post2Ids.join(", ")} });\n`
    : "";
  const part2Out = `(() => {\n  "use strict";\n  const M = globalThis.__MLD;\n  if (!M) {\n    console.error("Modern Dashboard: upload mld-app.js before mld-app-post.js");\n    return;\n  }\n${part2Body}${postAssign}})();\n`;

  return { part1Out, part2Out };
}

function assertUnderHubLimit(label, content) {
  if (content.length >= HUB_MAX_JS) {
    throw new Error(
      `${label} is ${content.length} bytes (limit ${HUB_MAX_JS} / 128 KB). Split src/app.js further.`
    );
  }
}

function fileManagerAssetList() {
  return FILE_MANAGER_ASSETS.map((a) => `   - ${a.name}`).join("\n");
}

mkdirSync(upload, { recursive: true });

copyFileSync(join(root, "src", "index.html"), join(upload, "mld-index.html"));
copyFileSync(join(root, "src", "styles.css"), join(upload, "mld-app.css"));
copyFileSync(join(root, "src", "app-pre.js"), join(upload, "mld-app-pre.js"));
copyFileSync(join(root, "src", "manifest.webmanifest"), join(upload, "mld-manifest.webmanifest"));
copyFileSync(join(root, "src", "sw.js"), join(upload, "mld-sw.js"));
writeFileSync(join(upload, "mld-icon-192.b64"), iconBase64(192) + "\n");
writeFileSync(join(upload, "mld-icon-512.b64"), iconBase64(512) + "\n");
writeFileSync(join(upload, "mld-icon-192.png"), createIconPng(192));
writeFileSync(join(upload, "mld-icon-512.png"), createIconPng(512));

const { part1Out, part2Out } = splitAppJs(join(root, "src", "app.js"));
assertUnderHubLimit("mld-app.js", part1Out);
assertUnderHubLimit("mld-app-post.js", part2Out);
writeFileSync(join(upload, "mld-app.js"), part1Out);
writeFileSync(join(upload, "mld-app-post.js"), part2Out);

const groovy = readFileSync(join(root, "app", "ModernLightsDashboard.groovy.template"), "utf8");
writeFileSync(join(dist, "ModernLightsDashboard.groovy"), groovy);

// Hubitat bundle manifest (install.txt / update.txt format)
const manifest = `${NS}\n${BUNDLE_NAME}\napp ${APP_FILE}\n`;

rmSync(staging, { recursive: true, force: true });
mkdirSync(join(staging, "file-manager"), { recursive: true });

writeFileSync(join(staging, APP_FILE), groovy);
writeFileSync(join(staging, "install.txt"), manifest);
writeFileSync(join(staging, "update.txt"), manifest);

for (const { name } of FILE_MANAGER_ASSETS) {
  copyFileSync(join(upload, name), join(staging, "file-manager", name));
}

writeFileSync(
  join(staging, "file-manager", "README.txt"),
  `After importing the bundle on your hub:

1. Open Settings → File Manager
2. Upload these 9 files from this folder (names must match exactly):
${fileManagerAssetList()}
3. Apps → Add User App → ${APP_DISPLAY_NAME}
4. Enable OAuth on the app in Apps Code if not already enabled
5. Select lights and open the dashboard URL shown in the app

For automatic OAuth and File Manager deployment, install via Hubitat Package Manager instead.
`
);

writeFileSync(
  join(staging, "BUNDLE-README.txt"),
  `Modern Dashboard — Hubitat bundle

IMPORT (installs the Groovy app):
  Settings → Developer Tools → Bundles → Import ZIP
  Upload: ModernLightsDashboard.bundle.zip

THEN (required — bundles cannot install File Manager files or enable OAuth):
  Upload the files from the file-manager/ folder to Settings → File Manager
  Open Apps Code → ${APP_DISPLAY_NAME} → enable OAuth → Save

HPM INSTALL (recommended):
  Install via Hubitat Package Manager — OAuth and File Manager files are handled automatically.
`
);

const bundleZip = join(dist, "ModernLightsDashboard.bundle.zip");
rmSync(bundleZip, { force: true });
execSync(`cd "${staging}" && zip -rq "${bundleZip}" .`, { stdio: "inherit" });

const hpmManifest = {
  packageName: APP_DISPLAY_NAME,
  minimumHEVersion: "2.3.0",
  author: "you",
  version: pkg.version,
  dateReleased: new Date().toISOString().slice(0, 10),
  licenseFile: "",
  releaseNotes:
    "0.1.4: HPM update detection fix — manifest asset URLs now track master; bump version for hubs that matched 0.1.3 without deploying files.\n" +
    "Modern, mobile-first Hubitat dashboard for lights (switches, dimmers, color temperature, RGB), thermostats (setpoint dial, mode, fan), temperature sensors, and music/media players (Sonos, Echo Speaks, AirPlay, Chromecast). Room-grouped layout with per-room on/off, drag-to-dim sliders, sticky search, and collapsible rooms. Works on local and cloud URLs with no Maker API; installable as a PWA from the cloud link. Dark, light, and auto themes; instant LAN updates via WebSocket when available.",
  documentationLink: "",
  communityLink: "",
  apps: [
    {
      id: HPM_APP_ID,
      name: APP_DISPLAY_NAME,
      namespace: NS,
      location: `${HPM_BASE_URL}/ModernLightsDashboard.groovy`,
      required: true,
      oauth: true,
      primary: true,
    },
  ],
  files: FILE_MANAGER_ASSETS.map(({ id, name }) => ({
    id,
    name,
    location: `${HPM_BASE_URL}/upload/${name}`,
  })),
};

const hpmManifestJson = JSON.stringify(hpmManifest, null, "\t") + "\n";
mkdirSync(hubitat, { recursive: true });
writeFileSync(join(hubitat, "packageManifest.json"), hpmManifestJson);
writeFileSync(join(dist, "packageManifest.json"), hpmManifestJson);

const kb = (p) => (readFileSync(p).length / 1024).toFixed(1);
console.log("Built:");
console.log(`  dist/ModernLightsDashboard.groovy       ${kb(join(dist, "ModernLightsDashboard.groovy"))} KB`);
console.log(`  dist/ModernLightsDashboard.bundle.zip   ${kb(bundleZip)} KB  ← manual Bundles → Import`);
console.log(`  dist/upload/mld-app.js                  ${kb(join(upload, "mld-app.js"))} KB`);
console.log(`  dist/upload/mld-app-post.js             ${kb(join(upload, "mld-app-post.js"))} KB`);
console.log(`  dist/upload/                            (${FILE_MANAGER_ASSETS.length} File Manager assets)`);
console.log(`  hubitat/packageManifest.json            (HPM: app + oauth + ${FILE_MANAGER_ASSETS.length} files)`);
console.log(`  dist/packageManifest.json               (copy of HPM manifest)`);
if (HPM_BASE_URL.includes("UPDATE_USER")) {
  console.log("\nHPM: set HPM_BASE_URL to your hosted dist/ raw URL before publishing, then rebuild.");
}
console.log("\nHPM install: Package Manager → OAuth + File Manager files handled automatically");
console.log("Bundle install: Import ZIP → enable OAuth → upload file-manager/ files");
