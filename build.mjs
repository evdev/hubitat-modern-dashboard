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
const MLD_SPLIT2 = "// __MLD_SPLIT2__";
const MLD_SPLIT3 = "// __MLD_SPLIT3__";
const HUB_MAX_BLOB = 128 * 1024;

// Must match definition(namespace:, name:) in the Groovy template
const NS = "modernlights";
const APP_FILE = `${NS}.ModernLightsDashboard.groovy`;
const BUNDLE_NAME = "ModernLightsDashboard";
const APP_DISPLAY_NAME = "Modern Dashboard";

const HPM_BASE_URL =
  process.env.HPM_BASE_URL ??
  "https://raw.githubusercontent.com/evdev/hubitat-modern-dashboard/master/dist";

const APP_AUTHOR = "Ephrayim (evdev)";
const GITHUB_URL = "https://github.com/evdev/hubitat-modern-dashboard";
const LICENSE_NAME = "Apache License 2.0";
const LICENSE_URL =
  "https://raw.githubusercontent.com/evdev/hubitat-modern-dashboard/master/LICENSE";
const PACKAGE_DESCRIPTION =
  "Control-first Hubitat dashboard: select your devices and you're done. Optimized for acting on devices — bulk room/house lights, multi-thermostat control. Installable PWA, built-in remote scheduler (no Hubitat login), runs entirely on your hub.";
const FEATURE_SUMMARY =
  "Control-first, minimal-effort Hubitat dashboard (mDash): pick devices and go — rooms and layout are automatic. Optimized for control (not just status): bulk room/house on/off, multi-thermostat control, drag-to-dim. Installable PWA from the cloud URL. Built-in scheduler (daily/weekly/once/sunrise/sunset/mode) managed from the dashboard without Hubitat admin login. Lights, shades, thermostats, locks, HSM, scenes, hub mode, music/media, and sensors. Snapshots, favorites, and reorderable rooms/nav. Fully hosted on your hub — no Maker API or third-party cloud.";
// Set to your Hubitat Community thread URL after posting docs/hubitat-community-post.md
const COMMUNITY_LINK =
  process.env.COMMUNITY_LINK ?? `${GITHUB_URL}/discussions`;
const HPM_REPO_PACKAGE_ID = "e8f4a1c2-3b5d-4e9f-a7c6-1d2e3f4a5b6c";
const REPOSITORY_JSON_URL =
  "https://raw.githubusercontent.com/evdev/hubitat-modern-dashboard/master/hubitat/repository.json";
const PACKAGE_MANIFEST_URL =
  "https://raw.githubusercontent.com/evdev/hubitat-modern-dashboard/master/hubitat/packageManifest.json";

// Stable UUIDs for HPM update tracking (do not regenerate per build)
const HPM_APP_ID = "a4f8c2e1-6b3d-4a9f-8e7c-1d2b3c4d5e6f";
const FILE_MANAGER_ASSETS = [
  { id: "b1a2c3d4-e5f6-7890-abcd-ef1234567890", name: "mld-index.html" },
  { id: "c2b3d4e5-f6a7-8901-bcde-f12345678901", name: "mld-app.css" },
  { id: "d3c4e5f6-a7b8-9012-cdef-123456789012", name: "mld-app-pre.js" },
  { id: "e4d5f6a7-b8c9-0123-def0-234567890123", name: "mld-app.js" },
  { id: "f5e6a7b8-c9d0-1234-ef01-345678901234", name: "mld-app-post.js" },
  { id: "e7f8a9b0-c1d2-3456-7890-abcdef123456", name: "mld-app-post2.js" },
  { id: "f8a9b0c1-d2e3-4567-8901-bcdef1234567", name: "mld-app-post3.js" },
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

function parseTopLevelIdsFromLines(lines) {
  const ids = new Set();
  for (const line of lines) {
    if (!line.startsWith("  ")) continue;
    let m = line.match(/^  (?:let|const) ([A-Za-z_$][\w$]*)/);
    if (m) {
      ids.add(m[1]);
      continue;
    }
    m = line.match(/^  (?:async )?function ([A-Za-z_$][\w$]*)/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

function stripStringsAndComments(code) {
  const parts = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === "/" && code[i + 1] === "/") {
      const start = i;
      i += 2;
      while (i < code.length && code[i] !== "\n") i++;
      parts.push({ literal: true, text: code.slice(start, i) });
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
      parts.push({ literal: true, text: code.slice(start, i) });
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
  return parts.filter((p) => !p.literal).map((p) => p.text).join("");
}

function assertNoPart1BarePart2Refs(part1Lines, part2Lines) {
  const part1Ids = parseTopLevelIdsFromLines(part1Lines);
  const part2Ids = parseTopLevelIdsFromLines(part2Lines);
  const part2Only = [...part2Ids].filter((id) => !part1Ids.has(id));
  const part1Code = stripStringsAndComments(part1Lines.join("\n"));
  const offenders = [];
  for (const id of part2Only) {
    const escaped = id.replace(/\$/g, "\\$");
    const declRe = new RegExp(`(?:const|let|var|function|async function)\\s+${escaped}\\b`);
    const propRe = new RegExp(`\\b${escaped}\\s*:`);
    const refRe = new RegExp(
      `(?<!(?:const|let|var|function|async function) )\\b${escaped}\\b`
    );
    if (!refRe.test(part1Code)) continue;
    if (declRe.test(part1Code) || propRe.test(part1Code)) continue;
    offenders.push(id);
  }
  if (offenders.length) {
    throw new Error(
      `Part 1 references part-2-only symbols without postCall(): ${offenders.sort().join(", ")}`
    );
  }
}

function rewritePart2(part2Lines, exportIds) {
  const localIds = new Set(parseTopLevelIds(part2Lines));
  const replaceIds = exportIds.filter((id) => !localIds.has(id));
  replaceIds.sort((a, b) => b.length - a.length);
  return rewritePart2PreservingStrings(part2Lines.join("\n"), replaceIds);
}

function wrapPostChunk(body, exportIds, priorMissingMsg) {
  const localIds = new Set(parseTopLevelIds(body.split("\n")));
  const replaceIds = exportIds.filter((id) => !localIds.has(id));
  replaceIds.sort((a, b) => b.length - a.length);
  const rewritten = rewritePart2PreservingStrings(body, replaceIds);
  const chunkIds = parseTopLevelFunctions(body.split("\n")).filter((id) => !exportIds.includes(id));
  const assign = chunkIds.length ? `\n  Object.assign(M, { ${chunkIds.join(", ")} });\n` : "";
  return `(() => {\n  "use strict";\n  const M = globalThis.__MLD;\n  if (!M) {\n    console.error("Modern Dashboard: ${priorMissingMsg}");\n    return;\n  }\n${rewritten}${assign}})();\n`;
}

function splitAppJs(srcPath) {
  const raw = readFileSync(srcPath, "utf8");
  const split1Idx = raw.indexOf(MLD_SPLIT);
  if (split1Idx < 0) throw new Error(`Missing ${MLD_SPLIT} in src/app.js`);
  const split2Idx = raw.indexOf(MLD_SPLIT2);
  if (split2Idx < 0 || split2Idx <= split1Idx) {
    throw new Error(`Missing ${MLD_SPLIT2} after ${MLD_SPLIT} in src/app.js`);
  }
  const split3Idx = raw.indexOf(MLD_SPLIT3);
  if (split3Idx < 0 || split3Idx <= split2Idx) {
    throw new Error(`Missing ${MLD_SPLIT3} after ${MLD_SPLIT2} in src/app.js`);
  }

  const part1Lines = raw.slice(0, split1Idx).trimEnd().split("\n");
  let part2Lines = raw.slice(split1Idx + MLD_SPLIT.length, split2Idx).trimStart().split("\n");
  let part3Lines = raw.slice(split2Idx + MLD_SPLIT2.length, split3Idx).trimStart().split("\n");
  let part4Lines = raw.slice(split3Idx + MLD_SPLIT3.length).trimStart().split("\n");

  const trimTrailing = (lines) => {
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    while (lines.length && /^}\)\(\);?\s*$/.test(lines[lines.length - 1])) lines.pop();
    return lines;
  };
  trimTrailing(part1Lines);
  trimTrailing(part2Lines);
  trimTrailing(part3Lines);
  trimTrailing(part4Lines);

  assertNoPart1BarePart2Refs(part1Lines, [...part2Lines, ...part3Lines, ...part4Lines]);

  const exportIds1 = parseTopLevelIds(part1Lines.slice(1));
  const exportBlock = `  globalThis.__MLD = { ${exportIds1.join(", ")} };`;
  const part1Out = `${part1Lines.join("\n")}\n${exportBlock}\n})();\n`;

  const exportIds2Set = new Set(parseTopLevelIds(part2Lines));
  const exportIds3Set = new Set(parseTopLevelIds(part3Lines));
  const exportIds4Set = new Set(parseTopLevelIds(part4Lines));
  const exportIds3Only = [...exportIds3Set].filter((id) => !exportIds2Set.has(id));
  const exportIds4Only = [...exportIds4Set].filter((id) => !exportIds2Set.has(id));
  const exportIdsForPart2 = [...exportIds1, ...exportIds3Only, ...exportIds4Only];
  const exportIdsForPart3 = [
    ...exportIds1,
    ...[...exportIds2Set].filter((id) => !exportIds3Set.has(id)),
    ...[...exportIds4Set].filter((id) => !exportIds3Set.has(id)),
  ];
  const exportIdsForPart4 = [
    ...exportIds1,
    ...[...exportIds2Set].filter((id) => !exportIds4Set.has(id)),
    ...[...exportIds3Set].filter((id) => !exportIds4Set.has(id)),
  ];

  const part2Out = wrapPostChunk(
    part2Lines.join("\n"),
    exportIdsForPart2,
    "upload mld-app.js before mld-app-post.js"
  );
  const part3Out = wrapPostChunk(
    part3Lines.join("\n"),
    exportIdsForPart3,
    "upload mld-app-post.js before mld-app-post2.js"
  );
  const part4Out = wrapPostChunk(
    part4Lines.join("\n"),
    exportIdsForPart4,
    "upload mld-app-post2.js before mld-app-post3.js"
  );

  return { part1Out, part2Out, part3Out, part4Out };
}

function assertUnderHubLimit(label, content) {
  const size = typeof content === "string" ? content.length : content;
  if (size >= HUB_MAX_BLOB) {
    throw new Error(
      `${label} is ${size} bytes (limit ${HUB_MAX_BLOB} / 128 KB). Split src/app.js further or trim the asset.`
    );
  }
}

function assertUploadBlobLimits() {
  for (const { name } of FILE_MANAGER_ASSETS) {
    const path = join(upload, name);
    const size = readFileSync(path).length;
    assertUnderHubLimit(name, size);
  }
}

function fileManagerAssetList() {
  return FILE_MANAGER_ASSETS.map((a) => `   - ${a.name}`).join("\n");
}

function substituteGroovyTemplate(template) {
  return template
    .replaceAll("__APP_VERSION__", pkg.version)
    .replaceAll("__APP_AUTHOR__", APP_AUTHOR)
    .replaceAll("__GITHUB_URL__", GITHUB_URL)
    .replaceAll("__LICENSE_NAME__", LICENSE_NAME);
}

function changelogEntryForVersion(version) {
  const changelogPath = join(root, "CHANGELOG.md");
  let changelog;
  try {
    changelog = readFileSync(changelogPath, "utf8");
  } catch {
    return PACKAGE_DESCRIPTION;
  }
  const escaped = version.replace(/\./g, "\\.");
  const re = new RegExp(`## ${escaped}\\s+([\\s\\S]*?)(?=\\n## |$)`);
  const match = changelog.match(re);
  if (!match) return PACKAGE_DESCRIPTION;
  return match[1]
    .trim()
    .split("\n")
    .map((line) => line.replace(/^- /, ""))
    .filter(Boolean)
    .join("; ");
}

function hpmReleaseNotes() {
  const entry = changelogEntryForVersion(pkg.version);
  return `${pkg.version}: ${entry}\n${FEATURE_SUMMARY}`;
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

const { part1Out, part2Out, part3Out, part4Out } = splitAppJs(join(root, "src", "app.js"));
assertUnderHubLimit("mld-app.js", part1Out);
assertUnderHubLimit("mld-app-post.js", part2Out);
assertUnderHubLimit("mld-app-post2.js", part3Out);
assertUnderHubLimit("mld-app-post3.js", part4Out);
writeFileSync(join(upload, "mld-app.js"), part1Out);
writeFileSync(join(upload, "mld-app-post.js"), part2Out);
writeFileSync(join(upload, "mld-app-post2.js"), part3Out);
writeFileSync(join(upload, "mld-app-post3.js"), part4Out);

for (const name of ["mld-app-pre.js", "mld-sw.js"]) {
  const content = readFileSync(join(upload, name), "utf8");
  assertUnderHubLimit(name, content);
}
assertUploadBlobLimits();

const groovyRaw = readFileSync(join(root, "app", "ModernLightsDashboard.groovy.template"), "utf8");
const groovy = substituteGroovyTemplate(groovyRaw);
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
  `Modern Dashboard — File Manager assets

Minimal setup: after the Groovy app is installed, upload these ${FILE_MANAGER_ASSETS.length} files (exact names).
Then Apps → Add User App → ${APP_DISPLAY_NAME} → select your devices → Done.
The dashboard groups devices by Hubitat room automatically.

Installable PWA: open the cloud URL from the app page on your phone.
Built-in scheduler: manage schedules remotely without Hubitat admin login.
Fully hosted on your hub — no Maker API or external services.

Upload to Settings → File Manager (root folder):
${fileManagerAssetList()}

For automatic OAuth and File Manager deployment, install via Hubitat Package Manager instead.
See ${GITHUB_URL}#readme
`
);

writeFileSync(
  join(staging, "BUNDLE-README.txt"),
  `Modern Dashboard — Hubitat bundle

Minimal setup: select your devices in the app — rooms and layout are automatic.
Installable PWA via the cloud URL. Built-in remote scheduler. Fully hosted on your hub.

IMPORT (installs the Groovy app):
  Settings → Developer Tools → Bundles → Import ZIP
  Upload: ModernLightsDashboard.bundle.zip

THEN (required — bundles cannot install File Manager files or enable OAuth):
  Upload these ${FILE_MANAGER_ASSETS.length} files to Settings → File Manager (root folder, exact names):
  Open Apps Code → ${APP_DISPLAY_NAME} → enable OAuth → Save
  Apps → Add User App → ${APP_DISPLAY_NAME} → select devices → Done

HPM INSTALL (recommended):
  Hubitat Package Manager — OAuth and File Manager files are handled automatically.
  Custom repo: ${REPOSITORY_JSON_URL}
`
);

const bundleZip = join(dist, "ModernLightsDashboard.bundle.zip");
rmSync(bundleZip, { force: true });
execSync(`cd "${staging}" && zip -rq "${bundleZip}" .`, { stdio: "inherit" });

const hpmManifest = {
  packageName: APP_DISPLAY_NAME,
  minimumHEVersion: "2.3.0",
  author: APP_AUTHOR,
  version: pkg.version,
  dateReleased: new Date().toISOString().slice(0, 10),
  licenseFile: LICENSE_URL,
  releaseNotes: hpmReleaseNotes(),
  documentationLink: `${GITHUB_URL}#readme`,
  communityLink: COMMUNITY_LINK,
  gitHubUrl: GITHUB_URL,
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

const hpmRepository = {
  author: APP_AUTHOR,
  gitHubUrl: GITHUB_URL,
  packages: [
    {
      id: HPM_REPO_PACKAGE_ID,
      name: APP_DISPLAY_NAME,
      category: "Convenience",
      location: PACKAGE_MANIFEST_URL,
      description: PACKAGE_DESCRIPTION,
      tags: [
        "Cloud",
        "Dashboards",
        "Lights & Switches",
        "Climate Control",
        "Temperature & Humidity",
        "Multimedia",
      ],
    },
  ],
};
writeFileSync(join(hubitat, "repository.json"), JSON.stringify(hpmRepository, null, "\t") + "\n");

const kb = (p) => (readFileSync(p).length / 1024).toFixed(1);
const blobHeadroom = (p) => ((HUB_MAX_BLOB - readFileSync(p).length) / 1024).toFixed(1);
console.log("Built:");
console.log(`  dist/ModernLightsDashboard.groovy       ${kb(join(dist, "ModernLightsDashboard.groovy"))} KB`);
console.log(`  dist/ModernLightsDashboard.bundle.zip   ${kb(bundleZip)} KB  ← manual Bundles → Import`);
for (const { name } of FILE_MANAGER_ASSETS) {
  const path = join(upload, name);
  console.log(`  dist/upload/${name.padEnd(24)} ${kb(path).padStart(6)} KB  (${blobHeadroom(path)} KB headroom)`);
}
console.log(`  hubitat/packageManifest.json            (HPM: app + oauth + ${FILE_MANAGER_ASSETS.length} files)`);
console.log(`  hubitat/repository.json                 (HPM custom repository listing)`);
console.log(`  dist/packageManifest.json               (copy of HPM manifest)`);
if (HPM_BASE_URL.includes("UPDATE_USER")) {
  console.log("\nHPM: set HPM_BASE_URL to your hosted dist/ raw URL before publishing, then rebuild.");
}
console.log("\nHPM install: Package Manager → OAuth + File Manager files handled automatically");
console.log("Bundle install: Import ZIP → enable OAuth → upload file-manager/ files");
