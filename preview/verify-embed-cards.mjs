#!/usr/bin/env node
// Smoke test: embed cards + mixed favorites layout via preview server.
// Run: node preview/verify-embed-cards.mjs

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

  const data = await getJson("/data");
  const favorites = (data.config?.favorites || []).map(Number);
  assert(favorites.length >= 2, "mock has device favorites");

  // Reject http / javascript
  for (const bad of ["http://example.com", "javascript:alert(1)", "data:text/html,hi", "//example.com", "not a url"]) {
    const { res, json } = await postJson("/embed-cards", { action: "create", url: bad, title: "x" });
    assert(!res.ok, "reject bad url: " + bad);
    assert(json.error, "error for bad url: " + bad);
  }

  // Create HTTPS card
  const created = await postJson("/embed-cards", {
    action: "create",
    title: " Calendar ",
    url: "https://calendar.google.com/calendar/embed?src=example",
    size: "tall",
  });
  assert(created.res.ok, "create embed ok");
  assert(created.json.id?.startsWith("e_"), "id generated");
  assert(created.json.embedCards?.length === 1, "one embed card");
  assert(created.json.embedCards[0].title === "Calendar", "title normalized");
  assert(created.json.favoritesLayout.some((k) => k.startsWith("e:")), "layout includes embed");

  const embedId = created.json.id;

  // Update
  const updated = await postJson("/embed-cards", {
    action: "update",
    id: embedId,
    title: "Agenda",
    url: "https://calendar.google.com/calendar/embed?src=example2",
    size: "viewport",
  });
  assert(updated.res.ok, "update ok");
  assert(updated.json.embedCards[0].title === "Agenda", "title updated");
  assert(updated.json.embedCards[0].size === "viewport", "size updated");

  // Mixed layout round-trip
  const layout = [
    "e:" + embedId.slice(2),
    ...favorites.map((id) => "d:" + id),
  ];
  const layoutSave = await postJson("/settings/favorites-layout", {
    layout,
    favoriteSizes: { [favorites[0]]: "wide" },
    embedSizes: { [embedId]: "standard" },
  });
  assert(layoutSave.res.ok, "layout save ok");
  assert(layoutSave.json.favoritesLayout[0] === "e:" + embedId.slice(2), "embed first");
  assert(String(layoutSave.json.sizes[favorites[0]]) === "wide", "device size saved");
  assert(layoutSave.json.embedCards[0].size === "standard", "embed size saved");

  // Embed viewport round-trip via layout
  const viewportSave = await postJson("/settings/favorites-layout", {
    layout,
    favoriteSizes: { [favorites[0]]: "square" },
    embedSizes: { [embedId]: "viewport" },
  });
  assert(viewportSave.res.ok, "viewport layout save ok");
  assert(viewportSave.json.embedCards[0].size === "viewport", "embed viewport saved");
  assert(String(viewportSave.json.sizes[favorites[0]]) === "square", "device square retained");

  // Invalid embed size ignored (previous size kept)
  const badEmbedSize = await postJson("/settings/favorites-layout", {
    layout,
    embedSizes: { [embedId]: "compact" },
  });
  assert(badEmbedSize.res.ok, "bad embed size request ok");
  assert(badEmbedSize.json.embedCards[0].size === "viewport", "invalid embed size ignored");

  // Legacy POST /favorites preserves embeds
  const reversed = favorites.slice().reverse();
  const legacy = await postJson("/favorites", { ids: reversed, sizes: {} });
  assert(legacy.res.ok, "legacy favorites ok");
  assert(legacy.json.embedCards?.length === 1, "legacy preserves embeds");
  assert(legacy.json.favoritesLayout.some((k) => k.startsWith("e:")), "legacy preserves embed layout slot");
  assert(legacy.json.embedCards[0].size === "viewport", "legacy preserves embed size");

  // Delete
  const deleted = await postJson("/embed-cards", { action: "delete", id: embedId });
  assert(deleted.res.ok, "delete ok");
  assert((deleted.json.embedCards || []).length === 0, "no embeds left");
  assert(!(deleted.json.favoritesLayout || []).some((k) => k.startsWith("e:")), "embed removed from layout");

  // Card limit
  for (let i = 0; i < 12; i++) {
    const r = await postJson("/embed-cards", {
      action: "create",
      title: "Card " + i,
      url: "https://example.com/embed/" + i,
    });
    assert(r.res.ok, "create card " + i);
  }
  const over = await postJson("/embed-cards", {
    action: "create",
    title: "Overflow",
    url: "https://example.com/embed/overflow",
  });
  assert(!over.res.ok, "limit enforced");

  console.log("verify-embed-cards: ok");
} finally {
  child.kill("SIGTERM");
}
