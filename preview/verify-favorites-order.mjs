#!/usr/bin/env node
// Smoke test: favorites order round-trip via preview server.
// Run: node preview/verify-favorites-order.mjs

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
  await new Promise((r) => setTimeout(r, ms));
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

  const data = await getJson("/data");
  const initial = Array.isArray(data.config?.favorites) ? data.config.favorites.map(Number) : [];
  assert(initial.length >= 2, "mock has at least two favorites");

  const reversed = initial.slice().reverse();
  const postRes = await fetch(`http://127.0.0.1:${PORT}/favorites?${dashSessionQuery}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ids: reversed }),
  });
  assert(postRes.ok, "POST /favorites ok");

  const after = await getJson("/data");
  const saved = (after.config?.favorites || []).map(Number);
  assert(saved.join(",") === reversed.join(","), "favorites order persisted");

  // ---- Sizes round-trip ----
  const sizeIds = reversed.slice(0, 2);
  const sizesBody = { ids: reversed, sizes: { [sizeIds[0]]: "tall", [sizeIds[1]]: "compact" } };
  const sizeRes = await fetch(`http://127.0.0.1:${PORT}/favorites?${dashSessionQuery}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(sizesBody),
  });
  assert(sizeRes.ok, "POST /favorites with sizes ok");
  const sizeJson = await sizeRes.json();
  assert(sizeJson.sizes && String(sizeJson.sizes[sizeIds[0]]) === "tall", "server echoes tall size");
  assert(String(sizeJson.sizes[sizeIds[1]]) === "compact", "server echoes compact size");

  const afterSizes = await getJson("/data");
  const cfgSizes = afterSizes.config?.favoriteSizes || {};
  assert(String(cfgSizes[sizeIds[0]]) === "tall", "tall size persisted in /data config");
  assert(String(cfgSizes[sizeIds[1]]) === "compact", "compact size persisted in /data config");

  // ---- Unknown preset rejected ----
  const badRes = await fetch(`http://127.0.0.1:${PORT}/favorites?${dashSessionQuery}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ids: reversed, sizes: { [sizeIds[0]]: "enormous" } }),
  });
  const badJson = await badRes.json();
  assert(!badJson.sizes || badJson.sizes[sizeIds[0]] == null, "unknown preset rejected");

  // ---- Unknown id rejected ----
  const badIdRes = await fetch(`http://127.0.0.1:${PORT}/favorites?${dashSessionQuery}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ids: reversed, sizes: { "999999": "square" } }),
  });
  const badIdJson = await badIdRes.json();
  assert(!badIdJson.sizes || badIdJson.sizes["999999"] == null, "unknown id size rejected");

  // ---- Old client (no sizes) preserves retained sizes, prunes removed ----
  const pruned = reversed.slice(0, reversed.length - 1);
  await fetch(`http://127.0.0.1:${PORT}/favorites?${dashSessionQuery}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ids: reversed, sizes: { [sizeIds[0]]: "wide" } }),
  });
  const oldClientRes = await fetch(`http://127.0.0.1:${PORT}/favorites?${dashSessionQuery}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ids: pruned }),
  });
  const oldJson = await oldClientRes.json();
  assert(String(oldJson.sizes[sizeIds[0]]) === "wide", "old client preserves retained size");
  const removedId = reversed[reversed.length - 1];
  assert(oldJson.sizes[removedId] == null, "old client prunes removed favorite size");

  // ---- Re-add starts without a size ----
  const readdRes = await fetch(`http://127.0.0.1:${PORT}/favorites?${dashSessionQuery}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ids: reversed, sizes: {} }),
  });
  const readdJson = await readdRes.json();
  assert(Object.keys(readdJson.sizes || {}).length === 0, "empty sizes clears stored sizes");

  // ---- Mixed layout save via settings/favorites-layout ----
  const layout = reversed.map((id) => "d:" + id);
  const layoutSizes = { [reversed[0]]: "wide", [reversed[1]]: "standard" };
  const layoutRes = await fetch(`http://127.0.0.1:${PORT}/settings/favorites-layout?${dashSessionQuery}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      layout,
      favoriteSizes: layoutSizes,
      embedSizes: {},
    }),
  });
  assert(layoutRes.ok, "POST settings/favorites-layout ok");
  const layoutJson = await layoutRes.json();
  assert(Array.isArray(layoutJson.favoritesLayout), "layout returned");
  assert(layoutJson.favoritesLayout.join(",") === layout.join(","), "device layout persisted");
  assert(String(layoutJson.sizes[reversed[0]]) === "wide", "wide size via layout save");
  assert(String(layoutJson.sizes[reversed[1]]) === "standard", "standard size via layout save");

  // ---- Unknown layout size rejected; known sizes retained when omitted ----
  const badLayoutRes = await fetch(`http://127.0.0.1:${PORT}/settings/favorites-layout?${dashSessionQuery}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      layout,
      favoriteSizes: { [reversed[0]]: "enormous" },
    }),
  });
  assert(badLayoutRes.ok, "invalid size still returns ok with filtered map");
  const badLayoutJson = await badLayoutRes.json();
  assert(badLayoutJson.sizes[reversed[0]] == null, "invalid layout size filtered out");

  // viewport is embed-only and must not stick on a device favorite
  const viewportRes = await fetch(`http://127.0.0.1:${PORT}/settings/favorites-layout?${dashSessionQuery}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      layout,
      favoriteSizes: { [reversed[0]]: "viewport" },
    }),
  });
  const viewportJson = await viewportRes.json();
  assert(viewportJson.sizes[reversed[0]] == null, "viewport rejected for device favorites");

  console.log("verify-favorites-order: ok");
} finally {
  child.kill("SIGTERM");
}
