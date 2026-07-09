#!/usr/bin/env node
// Smoke-test sensor + valve API shapes against the local preview server.
// Run:  node preview/verify-sensors.mjs

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

async function getJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

async function waitForServer(child) {
  for (let i = 0; i < 40; i++) {
    if (child.exitCode != null) throw new Error("preview server exited early");
    try {
      await getJson("/data");
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
    const data = await getJson("/data");

    assert(Array.isArray(data.tempSensors) && data.tempSensors.length >= 1, "tempSensors present");
    assert(Array.isArray(data.sensors) && data.sensors.length >= 1, "sensors present");
    assert(Array.isArray(data.valves) && data.valves.length >= 2, "valves present");

    const types = new Set(data.sensors.map((s) => s.t));
    for (const t of ["motion", "contact", "leak", "presence", "humidity", "illuminance", "smoke", "generic"]) {
      assert(types.has(t), `sensor type "${t}" in /data`);
    }

    for (const s of data.tempSensors) {
      assert(s.temp != null && !Number.isNaN(Number(s.temp)), `temp sensor ${s.i} has numeric temp`);
    }
    for (const s of data.sensors) {
      assert(s.v != null && s.v !== "", `sensor ${s.i} (${s.t}) has primary value`);
      assert(Array.isArray(s.ex), `sensor ${s.i} has ex[] array`);
    }
    for (const v of data.valves) {
      assert(v.st != null && v.st !== "", `valve ${v.i} has st`);
    }

    const motion = data.sensors.find((s) => s.t === "motion");
    const motionDev = await getJson(`/device?id=${motion.i}`);
    assert(motionDev.t === "motion" && motionDev.v != null && Array.isArray(motionDev.ex), "/device returns full sensor shape");

    const valve = data.valves[0];
    const valveBefore = (await getJson(`/device?id=${valve.i}`)).st;
    const openRes = await fetch(`http://127.0.0.1:${PORT}/cmd?id=${valve.i}&c=open`);
    assert(openRes.ok, "valve open /cmd succeeds");
    const valveOpen = await getJson(`/device?id=${valve.i}`);
    assert(valveOpen.st === "open", "valve /device reflects open after /cmd");

    const closeRes = await fetch(`http://127.0.0.1:${PORT}/cmd?id=${valve.i}&c=close`);
    assert(closeRes.ok, "valve close /cmd succeeds");
    const valveClosed = await getJson(`/device?id=${valve.i}`);
    assert(valveClosed.st === "closed", "valve /device reflects closed after /cmd");

    assert((data.config?.favorites || []).includes(valve.i), "mock favorites includes a valve");

    const favRes = await fetch(`http://127.0.0.1:${PORT}/favorites?ids=${valve.i}`);
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
