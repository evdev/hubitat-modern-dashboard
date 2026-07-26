#!/usr/bin/env node
// Smoke test: HTML attribute tiles + mixed favorites layout via preview server.
// Run: node preview/verify-html-tiles.mjs

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = String(18000 + Math.floor(Math.random() * 2000));
const MOCK_DASH_PASSWORD = "dashpass";
let dashSessionQuery = "";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(path) {
  const sep = path.includes("?") ? "&" : "?";
  const url = dashSessionQuery
    ? `http://127.0.0.1:${PORT}${path}${sep}${dashSessionQuery}`
    : `http://127.0.0.1:${PORT}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

async function postJson(path, body) {
  const sep = path.includes("?") ? "&" : "?";
  const url = dashSessionQuery
    ? `http://127.0.0.1:${PORT}${path}${sep}${dashSessionQuery}`
    : `http://127.0.0.1:${PORT}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function waitForServer(child) {
  for (let i = 0; i < 300; i++) {
    if (child.exitCode != null) throw new Error("preview server exited early");
    try {
      await getJson("/auth/status");
      return;
    } catch {
      await wait(200);
    }
  }
  throw new Error("preview server did not become ready");
}

async function unlockPreview() {
  const res = await fetch(`http://127.0.0.1:${PORT}/auth/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ password: MOCK_DASH_PASSWORD }),
  });
  if (!res.ok) throw new Error("auth unlock failed: HTTP " + res.status);
  const data = await res.json();
  if (!data.session) throw new Error("auth unlock missing session");
  dashSessionQuery = "dash_session=" + encodeURIComponent(data.session);
}

const child = spawn("node", ["preview/server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(child);
  await unlockPreview();

  const initial = await getJson("/data");
  assert(Array.isArray(initial.htmlTiles), "htmlTiles at top level");
  assert(initial.htmlTiles.some((tile) => tile.id === "9001:tile5"), "Battery Monitor catalog entry");
  assert(initial.htmlTiles.some((tile) => tile.id === "9002:html"), "PALISADE catalog entry");
  assert(initial.htmlTiles.every((tile) => tile.html == null), "catalog-only tiles omit html");
  assert(initial.htmlTiles.every((tile) => tile.size === "tall"), "catalog tiles have default size");

  const favorites = (initial.config?.favorites || []).map(Number);
  const htmlKey = "h:9001:tile5";
  const layout = [htmlKey, "h:9999:missing", ...favorites.map((id) => "d:" + id)];
  const saved = await postJson("/settings/favorites-layout", {
    layout,
    htmlSizes: { "9001:tile5": "wide" },
    htmlZooms: { "9001:tile5": 125 },
  });
  assert(saved.res.ok, "HTML layout save ok");
  assert(saved.json.favoritesLayout[0] === htmlKey, "HTML layout key saved");
  assert(!saved.json.favoritesLayout.includes("h:9999:missing"), "unknown HTML key rejected");
  assert(saved.json.htmlSizes?.["9001:tile5"] === "wide", "HTML size returned");
  assert(saved.json.htmlZooms?.["9001:tile5"] === 125, "HTML zoom returned");

  const afterSave = await getJson("/data");
  assert(afterSave.config?.favoritesLayout?.[0] === htmlKey, "HTML layout persisted");
  assert(afterSave.config?.htmlSizes?.["9001:tile5"] === "wide", "HTML size persisted");
  assert(afterSave.config?.htmlZooms?.["9001:tile5"] === 125, "HTML zoom persisted");
  const activeTile = afterSave.htmlTiles.find((tile) => tile.id === "9001:tile5");
  assert(typeof activeTile?.html === "string" && activeTile.html.includes("<table"), "favorited tile includes html");
  assert(activeTile?.size === "wide", "favorited tile includes saved size");
  assert(activeTile?.zoom === 125, "favorited tile includes saved zoom");
  const inactiveTile = afterSave.htmlTiles.find((tile) => tile.id === "9002:html");
  assert(inactiveTile?.html == null, "unfavorited tile omits html");

  const reversed = favorites.slice().reverse();
  const legacy = await postJson("/favorites", { ids: reversed, sizes: {} });
  assert(legacy.res.ok, "legacy favorites save ok");
  assert(legacy.json.favoritesLayout?.includes(htmlKey), "legacy favorites preserves HTML slot");

  const withoutHtml = reversed.map((id) => "d:" + id);
  const removed = await postJson("/settings/favorites-layout", {
    layout: withoutHtml,
    htmlSizes: {},
  });
  assert(removed.res.ok, "HTML removal save ok");
  assert(!removed.json.favoritesLayout?.some((key) => key.startsWith("h:")), "HTML key removed");

  const afterRemove = await getJson("/data");
  assert(!afterRemove.config?.favoritesLayout?.some((key) => key.startsWith("h:")), "HTML removal persisted");
  assert(afterRemove.htmlTiles.find((tile) => tile.id === "9001:tile5")?.html == null, "removed tile omits html");

  console.log("verify-html-tiles: ok");
} finally {
  child.kill("SIGTERM");
}
