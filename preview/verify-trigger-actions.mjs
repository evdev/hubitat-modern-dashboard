#!/usr/bin/env node
// Smoke test: dashboard trigger actions + arm/shunt via preview server.
// Run: node preview/verify-trigger-actions.mjs

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

async function main() {
  const child = spawn(process.execPath, ["preview/server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForServer(child);
    await unlockPreview();

    const data = await getJson("/data");
    assert(data.triggersEnabled === true, "triggersEnabled missing");
    assert(data.alertsArmed === true, "alertsArmed missing");
    assert(Array.isArray(data.triggerSourceIds), "triggerSourceIds missing");
    assert(Array.isArray(data.cameras) && data.cameras.length > 0, "need mock cameras");

    const armOff = await postJson("/alerts/arm", { armed: false });
    assert(armOff.json?.ok && armOff.json.alertsArmed === false, "arm off failed");

    const pushShunted = await postJson("/trigger-actions/push", {
      cameraId: data.cameras[0].i,
      toneId: "chime",
      text: "Door open",
    });
    assert(pushShunted.json?.ok, "push failed while shunted");
    const shuntedAction = pushShunted.json.triggerActions.at(-1);
    assert(shuntedAction.cameraId != null, "camera should still enqueue when shunted");
    assert(!shuntedAction.toneId, "tone must be omitted when shunted");
    assert(shuntedAction.notificationId, "notification id should be linked");

    const armOn = await postJson("/alerts/arm", { armed: true });
    assert(armOn.json?.alertsArmed === true, "arm on failed");

    const pushArmed = await postJson("/trigger-actions/push", {
      cameraId: data.cameras[0].i,
      toneId: "alert",
      text: "Motion",
      durationSec: 60,
    });
    const armedAction = pushArmed.json.triggerActions.at(-1);
    assert(armedAction.toneId === "alert", "tone should enqueue when armed");
    assert(Number(armedAction.cameraExpiresAt) > Date.now() + 50_000, "60s camera expiry");
    assert(Number(armedAction.toneExpiresAt) < Number(armedAction.cameraExpiresAt), "tone shorter than camera");
    const cams = pushArmed.json.triggerActions.filter((a) => a.cameraId != null);
    assert(cams.length === 1, "only one camera action after supersede");

    const list = await getJson("/trigger-actions");
    assert(list.ok && Array.isArray(list.triggerActions), "GET trigger-actions failed");

    const ack = await postJson("/trigger-actions/ack", { id: armedAction.id });
    assert(ack.json?.ok, "ack failed");
    assert(!(ack.json.triggerActions || []).some((a) => a.id === armedAction.id), "acked id still present");

    const ack2 = await postJson("/trigger-actions/ack", { id: armedAction.id });
    assert(ack2.json?.ok, "idempotent ack failed");

    const notifAck = await postJson("/notifications/ack", { id: shuntedAction.notificationId });
    assert(notifAck.json?.ok, "notification ack failed");
    assert(!(notifAck.json.notifications || []).some((n) => n.id === shuntedAction.notificationId), "notif still present");

    console.log("verify-trigger-actions: ok");
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
