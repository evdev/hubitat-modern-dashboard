#!/usr/bin/env node
// Smoke-test sensor + valve API shapes against the local preview server.
// Run:  node preview/verify-sensors.mjs

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildMergedSensorCard } from "./merge-sensor-card.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = String(18000 + Math.floor(Math.random() * 2000));

const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error("FAIL:", msg);
}

function ok(msg) {
  console.log("ok:", msg);
}

function assert(cond, msg) {
  if (!cond) fail(msg);
  else ok(msg);
}

async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

const MOCK_DASH_PASSWORD = "dashpass";
let dashSessionQuery = "";

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
  for (let i = 0; i < 40; i++) {
    if (child.exitCode != null) throw new Error("preview server exited early");
    try {
      await getJson("/auth/status");
      return;
    } catch {
      await wait(100);
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
  const child = spawn("node", ["preview/server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(child);
    await unlockPreview();
    const data = await getJson("/data");

    assert(Array.isArray(data.tempSensors) && data.tempSensors.length >= 1, "tempSensors present");
    assert(Array.isArray(data.sensors) && data.sensors.length >= 1, "sensors present");
    assert(Array.isArray(data.valves) && data.valves.length >= 2, "valves present");

    const types = new Set(data.sensors.map((s) => s.t));
    for (const t of ["motion", "shock", "contact", "leak", "presence", "humidity", "illuminance", "smoke", "generic"]) {
      assert(types.has(t), `sensor type "${t}" in /data`);
    }

    for (const s of data.tempSensors) {
      assert(s.temp != null && !Number.isNaN(Number(s.temp)), `temp sensor ${s.i} has numeric temp`);
      assert(Array.isArray(s.ex), `temp sensor ${s.i} has ex[] array`);
    }
    const motionMulti = data.sensors.find((s) => s.i === 2103);
    assert(motionMulti && motionMulti.ex.filter((e) => e.k !== "battery").length >= 3, "motion multisensor carries multiple secondary readings");
    assert(motionMulti?.le != null && motionMulti.le > 0, "motion sensor exposes last event timestamp");
    const contact = data.sensors.find((s) => s.i === 2101);
    assert(contact?.le != null && contact.le > 0, "contact sensor exposes last event timestamp");
    const shock = data.sensors.find((s) => s.i === 2110);
    assert(shock?.le != null && shock.le > 0, "shock sensor exposes last event timestamp");
    const tempOnlyMulti = data.tempSensors.find((s) => s.i === 2010);
    assert(tempOnlyMulti?.ex?.some((e) => e.k === "humidity"), "temp-only multisensor exposes humidity in ex[]");
    const genericMulti = data.sensors.find((s) => s.i === 2199);
    assert(genericMulti && genericMulti.ex.length >= 4, "generic multisensor exposes expanded ex[]");
    for (const s of data.sensors) {
      assert(s.v != null && s.v !== "", `sensor ${s.i} (${s.t}) has primary value`);
      assert(Array.isArray(s.ex), `sensor ${s.i} has ex[] array`);
    }
    for (const v of data.valves) {
      assert(v.st != null && v.st !== "", `valve ${v.i} has st`);
    }

    const dualTemp = data.tempSensors.find((t) => t.i === 2105);
    const dualHum = data.sensors.find((s) => s.i === 2105 && s.t === "humidity");
    assert(dualTemp && dualHum, "dual temp+humidity device in both arrays");
    const mergedHum = buildMergedSensorCard(dualTemp, dualHum);
    assert(mergedHum.t === "temp", "merged temp+humidity card is temperature-primary");
    assert(mergedHum.ex.some((e) => e.k === "humidity" && e.v === dualHum.v), "merged card carries humidity as secondary");

    const dualIllTemp = data.tempSensors.find((t) => t.i === 2106);
    const dualIll = data.sensors.find((s) => s.i === 2106 && s.t === "illuminance");
    assert(dualIllTemp && dualIll, "dual temp+illuminance device in both arrays");
    const mergedIll = buildMergedSensorCard(dualIllTemp, dualIll);
    assert(mergedIll.t === "temp", "merged temp+illuminance card is temperature-primary");
    assert(mergedIll.ex.some((e) => e.k === "illuminance" && e.v === dualIll.v), "merged card carries illuminance as secondary");

    const dualGenericTemp = data.tempSensors.find((t) => t.i === 2199);
    const dualGeneric = data.sensors.find((s) => s.i === 2199 && s.t === "generic");
    assert(dualGenericTemp && dualGeneric, "dual temp+generic device in both arrays");
    const mergedGeneric = buildMergedSensorCard(dualGenericTemp, dualGeneric);
    assert(mergedGeneric.t === "generic", "merged temp+generic card keeps generic primary");
    assert(mergedGeneric.ex.some((e) => e.k === "temperature" && e.v === dualGenericTemp.temp), "merged generic card folds temperature into ex[]");

    const motion = data.sensors.find((s) => s.t === "motion");
    const motionDev = await getJson(`/device?id=${motion.i}`);
    assert(motionDev.t === "motion" && motionDev.v != null && Array.isArray(motionDev.ex), "/device returns full sensor shape");

    const valve = data.valves[0];
    const valveBefore = (await getJson(`/device?id=${valve.i}`)).st;
    const openRes = await fetch(`http://127.0.0.1:${PORT}/cmd?id=${valve.i}&c=open&${dashSessionQuery}`);
    assert(openRes.ok, "valve open /cmd succeeds");
    const valveOpen = await getJson(`/device?id=${valve.i}`);
    assert(valveOpen.st === "open", "valve /device reflects open after /cmd");

    const closeRes = await fetch(`http://127.0.0.1:${PORT}/cmd?id=${valve.i}&c=close&${dashSessionQuery}`);
    assert(closeRes.ok, "valve close /cmd succeeds");
    const valveClosed = await getJson(`/device?id=${valve.i}`);
    assert(valveClosed.st === "closed", "valve /device reflects closed after /cmd");

    assert((data.config?.favorites || []).includes(valve.i), "mock favorites includes a valve");

    const favRes = await fetch(`http://127.0.0.1:${PORT}/favorites?ids=${valve.i}&${dashSessionQuery}`);
    assert(favRes.ok, "favorites endpoint accepts valve id");

    ok(`valve state exercised: ${valveBefore} -> ${valveOpen.st} -> ${valveClosed.st}`);

    if (failures.length) {
      console.error(`\n${failures.length} verification failure(s)`);
      process.exitCode = 1;
    } else {
      console.log("\nAll sensor/valve preview checks passed.");
    }
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
