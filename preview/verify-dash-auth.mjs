#!/usr/bin/env node
// Password-disabled dashboards must load /data without a session; enabled
// dashboards still 401 until unlock. Run: node preview/verify-dash-auth.mjs

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = String(18000 + Math.floor(Math.random() * 2000));
const MOCK_DASH_PASSWORD = "dashpass";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

function url(path) {
  return `http://127.0.0.1:${PORT}${path}`;
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(url(path), opts);
  const json = await res.json().catch(() => ({}));
  return { res, json, status: res.status };
}

async function setDashPassword(enabled) {
  const { res, json } = await fetchJson("/__preview/dash-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ enabled }),
  });
  assert(res.ok && json.ok === true, "preview password toggle failed: HTTP " + res.status);
  return json;
}

async function waitForServer(child) {
  for (let i = 0; i < 40; i++) {
    if (child.exitCode != null) throw new Error("preview server exited early");
    try {
      await fetchJson("/auth/status");
      return;
    } catch {
      await wait(100);
    }
  }
  throw new Error("preview server did not become ready");
}

async function main() {
  const child = spawn("node", ["preview/server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(child);

    const off = await setDashPassword(false);
    assert(off.enabled === false, "toggle off must report enabled:false");
    assert(off.required === false, "toggle off must report required:false");

    const statusOff = await fetchJson("/auth/status");
    assert(statusOff.status === 200, "auth/status HTTP " + statusOff.status);
    assert(statusOff.json.required === false, "auth/status must report required:false when password is off");

    const dataOff = await fetchJson("/data");
    if (dataOff.status !== 200) {
      throw new Error(
        "password-disabled /data must be 200 without a session; got HTTP " +
          dataOff.status +
          " flags enabled=" + off.enabled +
          " required=" + off.required
      );
    }
    assert(dataOff.json.dashboardPasswordRequired === false, "password-disabled /data must report dashboardPasswordRequired:false");
    console.log("ok: password-disabled /data and auth/status require no session");

    const on = await setDashPassword(true);
    assert(on.enabled === true && on.required === true, "toggle on must require a password");

    const statusOn = await fetchJson("/auth/status");
    assert(statusOn.json.required === true, "auth/status must report required:true when password is on");

    const gated = await fetchJson("/data");
    assert(gated.status === 401, "password-enabled /data must 401 without a session, got HTTP " + gated.status);

    const unlock = await fetchJson("/auth/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ password: MOCK_DASH_PASSWORD }),
    });
    assert(unlock.status === 200 && unlock.json.session, "unlock must issue a session");
    const session = "dash_session=" + encodeURIComponent(unlock.json.session);

    const dataOn = await fetchJson("/data?" + session);
    assert(dataOn.status === 200, "password-enabled /data must 200 with a session, got HTTP " + dataOn.status);
    assert(dataOn.json.dashboardPasswordRequired === true, "password-enabled /data must report dashboardPasswordRequired:true");
    console.log("ok: password-enabled /data 401 until unlock, then accepts the session");
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
