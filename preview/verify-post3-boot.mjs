#!/usr/bin/env node
// Regression: app-post3.js must parser-load. 0.4.17 deferred it while post3 still
// owned sensors/music/blinds/fans/favorites tiles, so default-tab boot threw
// "X is not a function" and init() mislabeled it as "Cannot reach hub".
// Run: node preview/verify-post3-boot.mjs  (after npm run build)

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const upload = join(root, "dist", "upload");
const CHUNKS = [
  "mld-app.js",
  "mld-app-core.js",
  "mld-app-post.js",
  "mld-app-post2.js",
  "mld-app-post3.js",
];
const POST3_VIEW_FNS = [
  "renderSensorsPopup",
  "renderMusicPopup",
  "refreshBlindsPopup",
  "refreshFansPopup",
  "makeShadeTile",
  "makeFanTile",
  "makeFavoriteSensorCard",
  "makeMusicRow",
];
const MISSING_POST3_RE =
  /is not a function|Cannot read propert(?:y|ies) of undefined/i;

let failures = 0;
function fail(msg) {
  failures++;
  console.error("FAIL:", msg);
}
function ok(msg) {
  console.log("ok:", msg);
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function mockData(defaultTab) {
  return {
    config: {
      pollIntervalMs: 5000,
      useWebSocket: false,
      dashboardName: "mDash",
      defaultTab,
      favorites: [2103, 4001, 5001, 5101],
      favoriteSizes: {},
    },
    rooms: [{ id: 1, name: "Living Room" }],
    devices: [{ i: 1, n: "Lamp", r: 1, d: 0, s: 1, l: null, k: null, h: null, sat: null, cm: null, ct: 0, rgb: 0 }],
    outlets: [],
    thermostats: [],
    tempSensors: [],
    sensors: [{ i: 2103, n: "Front Door", r: 1, t: "contact", v: "closed", a: "contact" }],
    valves: [],
    locks: [],
    garageDoors: [],
    music: [{ i: 4001, n: "Living Speaker", r: 1, st: "stopped", v: 20, tr: "", m: "unmuted", f: 0 }],
    cameras: [],
    windowShades: [{ i: 5001, n: "Living Shade", r: 1, st: "open", pos: 100, hasPos: 1, hasStop: 1 }],
    ceilingFans: [{ i: 5101, n: "Living Fan", r: 1, s: 1, sp: "medium", supSp: "low,medium,high", hasSw: 1 }],
    hubModes: ["Day"],
    currentHubMode: "Day",
    hsmEnabled: false,
    schedulerEnabled: true,
    dashboardPasswordRequired: false,
    scenes: [],
    schedules: [],
    snapshots: {},
  };
}

function makeEl(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    id: "",
    style: { setProperty() {}, getPropertyValue: () => "", removeProperty() {} },
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
}

function loadChunks(chunkNames, defaultTab = "sensors") {
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
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class { observe() {} disconnect() {} },
    WebSocket: class { close() {} },
    Audio: class { play() { return Promise.resolve(); } pause() {} },
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
    fetch(url) {
      const path = String(url || "").split("?")[0];
      if (path === "data" || path.endsWith("/data")) {
        return Promise.resolve(jsonResponse(mockData(defaultTab)));
      }
      if (path.includes("auth/status")) {
        return Promise.resolve(jsonResponse({ required: false }));
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.removeEventListener = () => {};
  sandbox.addEventListener = sandbox.window.addEventListener;
  sandbox.removeEventListener = sandbox.window.removeEventListener;
  const ctx = vm.createContext(sandbox);
  for (const name of chunkNames) {
    const code = readFileSync(join(upload, name), "utf8");
    vm.runInContext(code, ctx, { filename: name, timeout: 15000 });
  }
  return sandbox.globalThis.__MLD || {};
}

function isMissingPost3Error(err) {
  const msg = String(err?.message || err || "");
  if (!MISSING_POST3_RE.test(msg)) return false;
  return POST3_VIEW_FNS.some((fn) => msg.includes(fn));
}

function callAndCatch(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
}

function auditHtmlScriptOrder() {
  const html = readFileSync(join(root, "src", "index.html"), "utf8");
  const built = existsSync(join(upload, "mld-index.html"))
    ? readFileSync(join(upload, "mld-index.html"), "utf8")
    : "";
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const expected = ["app.js", "app-core.js", "app-post.js", "app-post2.js", "app-post3.js"];
  for (let i = 0; i < expected.length; i++) {
    if (!scripts[i] || !scripts[i].includes(expected[i])) {
      fail(`src/index.html script[${i}] should be ${expected[i]} (got ${scripts[i] || "missing"})`);
      return;
    }
  }
  if (built && !/<script[^>]+src="[^"]*app-post3\.js/.test(built)) {
    fail("dist/upload/mld-index.html is missing parser-loaded app-post3.js — run npm run build");
    return;
  }
  ok("HTML parser-loads app-post3.js after app-post2.js");
}

function auditMissingWithoutPost3() {
  const mld = loadChunks(CHUNKS.slice(0, 4));
  const present = POST3_VIEW_FNS.filter((fn) => typeof mld[fn] === "function");
  if (present.length) {
    fail(`post3 view functions leaked onto __MLD before post3 load: ${present.join(", ")}`);
  } else {
    ok("post3 view functions are absent until mld-app-post3.js loads");
  }

  const shadeErr = callAndCatch(() => mld.makeFavoriteEntryElement?.({
    type: "shade",
    dev: { i: 5001, n: "Shade", r: 1, st: "open", pos: 100, hasPos: 1, hasStop: 1 },
  }));
  if (!isMissingPost3Error(shadeErr)) {
    fail(`favorites shade tile before post3 should throw a missing-function error, got: ${shadeErr?.message || shadeErr || "no throw"}`);
  } else {
    ok("favorites shade tile throws without post3 (0.4.17 failure mode)");
  }

  const tabErr = callAndCatch(() => mld.showTab?.("sensors"));
  if (!isMissingPost3Error(tabErr)) {
    fail(`showTab("sensors") before post3 should throw a missing-function error, got: ${tabErr?.message || tabErr || "no throw"}`);
  } else {
    ok('showTab("sensors") throws without post3 (0.4.17 failure mode)');
  }
}

function auditPresentWithPost3() {
  const mld = loadChunks(CHUNKS);
  const missing = POST3_VIEW_FNS.filter((fn) => typeof mld[fn] !== "function");
  if (missing.length) fail(`after post3 load, missing: ${missing.join(", ")}`);
  else ok("post3 view functions exist after parser-load order");

  const shadeErr = callAndCatch(() => mld.makeFavoriteEntryElement({
    type: "shade",
    dev: { i: 5001, n: "Shade", r: 1, st: "open", pos: 100, hasPos: 1, hasStop: 1 },
  }));
  if (isMissingPost3Error(shadeErr)) {
    fail(`favorites shade tile after post3 still missing function: ${shadeErr.message}`);
  } else {
    ok("favorites shade tile does not miss post3 helpers after full load");
  }

  for (const tab of ["sensors", "music", "blinds", "fans", "favorites", "scheduling"]) {
    const err = callAndCatch(() => mld.showTab(tab));
    if (isMissingPost3Error(err)) {
      fail(`showTab("${tab}") after post3 missing function: ${err.message}`);
    } else {
      ok(`showTab("${tab}") does not miss post3 helpers after full load`);
    }
  }
}

function main() {
  if (!existsSync(upload)) {
    fail("dist/upload missing — run npm run build first");
    process.exit(1);
  }
  auditHtmlScriptOrder();
  auditMissingWithoutPost3();
  auditPresentWithPost3();
  if (failures) {
    console.error(`\n${failures} post3 boot check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll post3 boot checks passed.");
}

main();
