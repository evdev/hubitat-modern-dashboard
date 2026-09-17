#!/usr/bin/env node
// Cross-chunk reference audit for split JS blobs.
// Run: node preview/verify-blob-crossrefs.mjs  (after npm run build)

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const upload = join(root, "dist", "upload");
const srcApp = join(root, "src", "app.js");
const srcPre = join(root, "src", "app-pre.js");

const MLD_SPLIT_CORE = "// __MLD_SPLIT_CORE__";
const MLD_SPLIT = "// __MLD_SPLIT__";
const MLD_SPLIT2 = "// __MLD_SPLIT2__";
const MLD_SPLIT3 = "// __MLD_SPLIT3__";

const CHUNKS = [
  "mld-app.js",
  "mld-app-core.js",
  "mld-app-post.js",
  "mld-app-post2.js",
  "mld-app-post3.js",
];

const REQUIRED_MLD_FUNCTIONS = [
  "postCall",
  "publishMld",
  "ensureColorPopup",
  "render",
  "refreshDevice",
  "updateStates",
  "applySchedulesFromData",
  "renderSchedulerView",
  "refreshCamerasPopup",
  "updateQuickNavVisibility",
  "mergedSensorList",
  "updateSensorCard",
  "roomLabel",
  "currentCategory",
  "closeQuickPopup",
  "isPost3Ready",
  "ensurePost3Loaded",
  "activateDeferredModule",
  "renderSensorsPopup",
  "renderMusicPopup",
  "refreshBlindsPopup",
  "refreshFansPopup",
  "makeShadeTile",
  "makeFanTile",
  "makeFavoriteSensorCard",
  "makeMusicRow",
  "showTab",
  "makeFavoriteEntryElement",
];

let failures = 0;
function fail(msg) {
  failures++;
  console.error("FAIL:", msg);
}
function ok(msg) {
  console.log("ok:", msg);
}

function parseTopLevelIdsFromLines(text) {
  const ids = new Set();
  for (const line of text.split("\n")) {
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
      i += 2;
      while (i < code.length && code[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      i++;
      while (i < code.length) {
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    const start = i;
    while (i < code.length) {
      const c = code[i];
      if (c === '"' || c === "'" || c === "`") break;
      if (c === "/" && (code[i + 1] === "/" || code[i + 1] === "*")) break;
      i++;
    }
    parts.push(code.slice(start, i));
    i = start + parts[parts.length - 1].length;
  }
  return parts.join("");
}

function countBareRefs(code, symbol) {
  const escaped = symbol.replace(/\$/g, "\\$");
  const re = new RegExp(
    `(?<!(?:const|let|var|function|async function) )\\b${escaped}\\b`,
    "g"
  );
  const stripped = stripStringsAndComments(code);
  let count = 0;
  for (const m of stripped.matchAll(re)) {
    const before = stripped.slice(0, m.index);
    const after = stripped.slice(m.index + symbol.length);
    if (/^\s*:/.test(after) && /[{,]\s*$/.test(before)) continue;
    count++;
  }
  return count;
}

function isAllowedForwardRef(partSource, symbol) {
  const esc = symbol.replace(/\$/g, "\\$");
  if (new RegExp(`postCall\\(\\s*["'\`]${esc}["'\`]`).test(partSource)) return true;
  if (new RegExp(`__MLD[^\\n;]{0,120}${esc}`).test(partSource)) return true;
  if (new RegExp(`globalThis\\.\\__MLD\\?\\.\\[?["'\`]${esc}["'\`]\\]?`).test(partSource)) return true;
  return false;
}

function splitSourceParts() {
  const raw = readFileSync(srcApp, "utf8");
  const splitCoreIdx = raw.indexOf(MLD_SPLIT_CORE);
  const split1Idx = raw.indexOf(MLD_SPLIT);
  const split2Idx = raw.indexOf(MLD_SPLIT2);
  const split3Idx = raw.indexOf(MLD_SPLIT3);
  if (splitCoreIdx < 0 || split1Idx < 0 || split2Idx < 0 || split3Idx < 0) {
    throw new Error("Missing split markers in src/app.js");
  }
  return {
    part1: raw.slice(0, splitCoreIdx),
    core: raw.slice(splitCoreIdx + MLD_SPLIT_CORE.length, split1Idx),
    post: raw.slice(split1Idx + MLD_SPLIT.length, split2Idx),
    post2: raw.slice(split2Idx + MLD_SPLIT2.length, split3Idx),
    post3: raw.slice(split3Idx + MLD_SPLIT3.length),
  };
}

function auditSourceCrossRefs() {
  const parts = splitSourceParts();
  const order = ["part1", "core", "post", "post2", "post3"];
  const idsByPart = {};
  for (const k of order) idsByPart[k] = parseTopLevelIdsFromLines(parts[k]);
  const preIds = parseTopLevelIdsFromLines(readFileSync(srcPre, "utf8"));

  // Part 1 must not bare-reference symbols that only exist in later chunks.
  const part1Available = new Set([...preIds, ...idsByPart.part1]);
  const laterOnlyFromPart1 = new Set();
  for (const k of order.slice(1)) {
    for (const id of idsByPart[k]) {
      if (!part1Available.has(id)) laterOnlyFromPart1.add(id);
    }
  }
  const part1Offenders = [];
  for (const id of laterOnlyFromPart1) {
    if (!countBareRefs(parts.part1, id)) continue;
    if (isAllowedForwardRef(parts.part1, id)) continue;
    part1Offenders.push(id);
  }
  if (part1Offenders.length) {
    fail(
      `part1 has bare refs to later-chunk symbols: ${part1Offenders.sort().slice(0, 16).join(", ")}` +
        (part1Offenders.length > 16 ? ` (+${part1Offenders.length - 16} more)` : "")
    );
  } else {
    ok("part1: forward refs use postCall/__MLD only");
  }
}

function auditBuiltBlobs() {
  if (!existsSync(upload)) {
    fail("dist/upload missing — run npm run build first");
    return;
  }

  for (const name of CHUNKS) {
    const path = join(upload, name);
    if (!existsSync(path)) {
      fail(`${name} missing`);
      continue;
    }
    try {
      execSync(`node --check "${path}"`, { stdio: "pipe" });
      ok(`${name} syntax valid`);
    } catch (e) {
      fail(`${name} syntax error: ${e.stderr?.toString().trim() || e.message}`);
    }
  }

  const app = readFileSync(join(upload, "mld-app.js"), "utf8");
  if (!app.includes("globalThis.__MLD")) fail("mld-app.js missing globalThis.__MLD bootstrap");
  else ok("mld-app.js bootstraps globalThis.__MLD");

  for (const name of CHUNKS.slice(1)) {
    const body = readFileSync(join(upload, name), "utf8");
    if (!body.includes("globalThis.__MLD")) fail(`${name} missing __MLD wrapper`);
    if (!body.includes("Object.assign(M")) fail(`${name} missing Object.assign export block`);
  }
  ok("post chunks use __MLD IIFE wrapper + Object.assign exports");

  const html = readFileSync(join(upload, "mld-index.html"), "utf8");
  const srcHtml = readFileSync(join(root, "src", "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const expected = ["app.js", "app-core.js", "app-post.js", "app-post2.js", "app-post3.js"];
  for (let i = 0; i < expected.length; i++) {
    if (!scripts[i] || !scripts[i].includes(expected[i])) {
      fail(`mld-index.html script[${i}] should be ${expected[i]} (got ${scripts[i] || "missing"})`);
    }
  }
  if (scripts.length !== expected.length) {
    fail(`mld-index.html unexpected extra scripts: ${scripts.join(", ")}`);
  }
  if (!/<head>[\s\S]*meta name="mld-post3"[\s\S]*<\/head>/.test(html)
    || !/<head>[\s\S]*meta name="mld-post3"[\s\S]*<\/head>/.test(srcHtml)) {
    fail("index.html missing mld-post3 meta in head");
  }
  if (!/<script[^>]+src="[^"]*app-post3\.js/.test(srcHtml)) {
    fail("src/index.html must parser-load app-post3.js after app-post2.js");
  } else {
    ok("mld-index.html boot scripts include parser-loaded post3");
  }
}

function auditRuntimeExportChain() {
  const makeEl = (tag) => {
    const el = {
      tagName: String(tag || "div").toUpperCase(),
      id: "",
      style: {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      dataset: {},
      hidden: false,
      disabled: false,
      textContent: "",
      innerHTML: "",
      value: "",
      checked: false,
      children: [],
      parentElement: null,
      parentNode: null,
      nextSibling: null,
      appendChild(c) {
        this.children.push(c);
        c.parentElement = this;
        c.parentNode = this;
        return c;
      },
      insertBefore(c, ref) {
        const i = ref ? this.children.indexOf(ref) : -1;
        if (i >= 0) this.children.splice(i, 0, c);
        else this.children.push(c);
        c.parentElement = this;
        c.parentNode = this;
        return c;
      },
      remove() {},
      setAttribute() {},
      getAttribute: () => null,
      removeAttribute() {},
      hasAttribute: () => false,
      toggleAttribute() {},
      addEventListener() {},
      removeEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      closest: () => null,
      focus() {},
      click() {},
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
    };
    return el;
  };
  const elsById = Object.create(null);
  const getEl = (id) => {
    if (id == null || id === "") return null;
    const key = String(id);
    if (!elsById[key]) {
      elsById[key] = makeEl("div");
      elsById[key].id = key;
    }
    return elsById[key];
  };

  const sandbox = {
    globalThis: {},
    console,
    // No-op timers so dashboard init/polling cannot keep the process alive or
    // throw after the audit returns (real timers dumped chunk source on exit).
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    URL,
    Blob,
    FormData,
    AbortController,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    structuredClone: (x) => x,
    performance: { now: () => Date.now() },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { vibrate: () => {}, userAgent: "verify" },
    location: { href: "http://localhost/", origin: "http://localhost", pathname: "/", search: "" },
    history: { replaceState() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame() { return 0; },
    cancelAnimationFrame() {},
    Event: class {},
    CustomEvent: class {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
    },
    WebSocket: class {
      close() {}
    },
    Audio: class {
      play() {
        return Promise.resolve();
      }
      pause() {}
    },
    document: {
      getElementById: (id) => getEl(id),
      querySelector: (sel) => {
        const m = String(sel || "").match(/^#([\w-]+)$/);
        return m ? getEl(m[1]) : null;
      },
      querySelectorAll: () => [],
      createElement: (t) => makeEl(t),
      createElementNS: () => makeEl("svg"),
      head: makeEl("head"),
      body: makeEl("body"),
      documentElement: makeEl("html"),
      addEventListener() {},
      removeEventListener() {},
    },
    fetch() {
      // Leave init() pending so its 404/error path cannot throw after the audit.
      return new Promise(() => {});
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.removeEventListener = () => {};
  sandbox.addEventListener = sandbox.window.addEventListener;
  sandbox.removeEventListener = sandbox.window.removeEventListener;
  const ctx = vm.createContext(sandbox);

  const growth = [];
  for (const name of CHUNKS) {
    const code = readFileSync(join(upload, name), "utf8");
    try {
      vm.runInContext(code, ctx, { filename: name, timeout: 15000 });
    } catch (e) {
      fail(`${name} runtime eval: ${e.message}`);
      return;
    }
    growth.push(`${name}=${Object.keys(sandbox.globalThis.__MLD || {}).length}`);
  }
  ok(`__MLD export growth: ${growth.join(" -> ")}`);

  const mld = sandbox.globalThis.__MLD || {};
  const missing = REQUIRED_MLD_FUNCTIONS.filter((k) => typeof mld[k] !== "function");
  if (missing.length) fail(`__MLD missing functions after full load: ${missing.join(", ")}`);
  else ok("critical __MLD functions present after all chunks load");

  try {
    mld.applySchedulesFromData({ schedulerEnabled: false });
    ok("applySchedulesFromData({ schedulerEnabled: false }) does not throw");
  } catch (e) {
    fail(`applySchedulesFromData with scheduler disabled threw: ${e.message}`);
  }
}

async function drainMicrotasks() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function drainMacrotask() {
  // unhandledRejection is a later event-loop turn, not a microtask.
  return new Promise((resolve) => setImmediate(resolve));
}

async function main() {
  const lateErrors = [];
  const onLate = (err) => {
    lateErrors.push(err);
    fail(`late sandbox error: ${err?.message || err}`);
  };
  process.on("unhandledRejection", onLate);
  auditSourceCrossRefs();
  auditBuiltBlobs();
  auditRuntimeExportChain();
  await drainMicrotasks();
  await drainMacrotask();
  if (failures || lateErrors.length) {
    console.error(`\n${failures} blob cross-reference check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll blob cross-reference checks passed.");
  // Hung sandbox fetch keeps the event loop alive; exit only after late errors
  // have had a turn so a success code cannot mask them.
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
