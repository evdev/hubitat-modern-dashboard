#!/usr/bin/env node
// Smoke test: scheduler CRUD / nextFire / validation via preview server.
// Run: node preview/verify-schedules.mjs

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  scheduleCronForTrigger,
  cronNextFire,
  cronFieldValues,
  modeCycleError,
  parseLocalDateTimeMs,
  dueScheduleIds,
  nextDispatcherAt,
  scheduleSunNextFire,
  scheduleRecentSunMs,
  validateSchedulePayload,
  thermostatSettingError,
  thermostatSettingNormalized,
  onceScheduleDisposition,
  ONCE_CATCHUP_MS,
} from "../lib/scheduler-core.mjs";
import { readFileSync } from "node:fs";

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

function pad(n) {
  return String(n).padStart(2, "0");
}

function futureOnceAt(hoursAhead = 2) {
  const d = new Date(Date.now() + hoursAhead * 3600 * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- pure unit checks (no server) ----------
{
  const daily = scheduleCronForTrigger("daily", "19:30", []);
  assert(daily === "0 30 19 * * ? *", `daily cron expected * * ?, got ${daily}`);
  const weekly = scheduleCronForTrigger("weekly", "08:00", ["MON", "WED"]);
  assert(weekly === "0 0 8 ? * MON,WED *", `weekly cron got ${weekly}`);
  assert(scheduleCronForTrigger("daily", "25:00", []) == null, "invalid hour should reject");
  assert(scheduleCronForTrigger("weekly", "08:00", []) == null, "weekly without days should reject");
  const dow = cronFieldValues("MON,WED", 1, 7);
  assert(dow && dow.has(2) && dow.has(4) && !dow.has(1), "MON/WED day-name parsing");
  const from = new Date();
  from.setHours(7, 0, 0, 0);
  const nf = cronNextFire(weekly, from.getTime() - 1000);
  assert(nf != null && nf > from.getTime() - 1000, "weekly nextFire should resolve");
  // Exactly on a matching minute must advance to a future occurrence
  const onFire = new Date();
  onFire.setHours(8, 0, 0, 0);
  // Find a Monday 08:00
  while (onFire.getDay() !== 1) onFire.setDate(onFire.getDate() + 1);
  const nfAfter = cronNextFire("0 0 8 ? * MON *", onFire.getTime());
  assert(nfAfter != null && nfAfter > onFire.getTime(), "nextFire must not return the just-elapsed minute");
  assert(Number.isNaN(parseLocalDateTimeMs("2026-02-31T10:00")), "impossible calendar date should reject");
  assert(Number.isFinite(parseLocalDateTimeMs("2028-02-29T10:00")), "valid leap date should parse");

  // Dispatcher helpers still order due jobs for tests; Hubitat arms per-job
  // scheduledJobHandler with overwrite:false.
  const at = Date.now();
  const schedules = {
    "sun-b": { enabled: true, nextFire: at },
    "sun-a": { enabled: true, nextFire: at },
    early: { enabled: true, nextFire: at + 500 },
    recovered: { enabled: true, nextFire: at - 5 * 60 * 1000 },
    stale: { enabled: true, nextFire: at - 11 * 60 * 1000 },
    paused: { enabled: false, nextFire: at },
  };
  const due = dueScheduleIds(schedules, at);
  assert(due.join(",") === "recovered,sun-a,sun-b", `due order: ${due.join(",")}`);
  assert(!due.includes("early"), "must not fire a future job early");
  assert(!due.includes("stale"), "must not replay stale daily jobs");
  assert(nextDispatcherAt(schedules, at) === at + 1000, "overdue uses minimum delay");
  assert(nextDispatcherAt({}, at) == null, "no schedules means no dispatcher");

  const midnight = new Date(2026, 8, 15, 0, 0, 0, 0);
  const crossed = scheduleSunNextFire(
    { kind: "daily", when: "sunset", offsetMin: 420 },
    "sunset",
    midnight.getTime(),
    (_which, offsetMin, day) => {
      const sunset = new Date(day);
      sunset.setHours(18, 0, 0, 0);
      return sunset.getTime() + offsetMin * 60 * 1000;
    },
  );
  const expectedCrossed = new Date(2026, 8, 15, 1, 0, 0, 0).getTime();
  assert(crossed === expectedCrossed, `cross-midnight sunset offset: ${new Date(crossed)}`);

  const sunAt = (hour, minute, day) => {
    const sunset = new Date(day);
    sunset.setHours(hour, minute, 0, 0);
    return sunset.getTime();
  };
  const sunProvider = (_which, offsetMin, day) => sunAt(18, 0, day) + offsetMin * 60 * 1000;
  const fiveLate = sunAt(18, 5, new Date(2026, 8, 15));
  const recentSun = scheduleRecentSunMs(
    { kind: "daily", when: "sunset", offsetMin: 0 },
    fiveLate,
    sunProvider,
  );
  assert(recentSun === sunAt(18, 0, new Date(2026, 8, 15)), "a sunset five minutes late is still due");
  const elevenLate = sunAt(18, 11, new Date(2026, 8, 15));
  assert(
    scheduleRecentSunMs({ kind: "daily", when: "sunset", offsetMin: 0 }, elevenLate, sunProvider) == null,
    "a sunset older than ten minutes is not caught up",
  );
  assert(
    scheduleRecentSunMs({ kind: "daily", when: "clock", time: "18:00" }, fiveLate, sunProvider) == null,
    "a clock schedule is not a sun catch-up",
  );
  const afterMidnight = sunAt(1, 5, new Date(2026, 8, 16));
  const crossedRecent = scheduleRecentSunMs(
    { kind: "daily", when: "sunset", offsetMin: 420 },
    afterMidnight,
    sunProvider,
  );
  assert(crossedRecent === sunAt(1, 0, new Date(2026, 8, 16)), "a sunset offset past midnight is still caught up");
  assert(
    scheduleRecentSunMs(
      { kind: "weekly", when: "sunset", offsetMin: 0, days: ["MON"] },
      fiveLate,
      sunProvider,
    ) == null,
    "a weekly sunset catch-up skips other days",
  );

  const staleOnce = {
    enabled: true,
    trigger: { kind: "once", at: "2020-01-01T00:00" },
    action: { target: "lights", states: [{ id: 1, on: true }] },
  };
  assert(
    validateSchedulePayload(staleOnce, at) === "one-time schedule must be in the future",
    "enabling a stale one-time schedule must be rejected",
  );

  console.log("ok unit: cron generation / day-name nextFire");
}

{
  assert(modeCycleError([{ id: "a", enabled: true, trigger: { kind: "mode", mode: "Day" }, action: { target: "hubMode", mode: "Day" } }]) === "mode trigger cannot set the same hub mode", "self-loop rejected");
  assert(modeCycleError([
    { id: "a", enabled: true, trigger: { kind: "mode", mode: "Day" }, action: { target: "hubMode", mode: "Evening" } },
    { id: "b", enabled: true, trigger: { kind: "mode", mode: "Evening" }, action: { target: "hubMode", mode: "Day" } },
  ]) === "mode schedules form a hub-mode loop", "A→B→A rejected");
  assert(modeCycleError([
    { id: "a", enabled: true, trigger: { kind: "mode", mode: "Day" }, action: { target: "hubMode", mode: "Evening" } },
    { id: "b", enabled: true, trigger: { kind: "mode", mode: "Evening" }, action: { target: "lights", states: [{ id: 1, on: false }] } },
  ]) == null, "mode→lights cascade allowed");
  console.log("ok unit: mode-cycle validation");
}

{
  const browserSrc = readFileSync(join(root, "src/app.js"), "utf8");
  const pick = (name) => {
    const start = browserSrc.indexOf(`function ${name}(`);
    assert(start >= 0, `${name} missing from src/app.js`);
    let depth = 0;
    let end = browserSrc.indexOf("{", start);
    for (; end < browserSrc.length; end++) {
      if (browserSrc[end] === "{") depth++;
      else if (browserSrc[end] === "}" && --depth === 0) { end++; break; }
    }
    return browserSrc.slice(start, end);
  };
  const browserErr = new Function(
    `${pick("normalizeTstatModeKey")}\n${pick("thermostatSetpointsForMode")}\n${pick("thermostatSettingError")}\nreturn thermostatSettingError;`,
  )();

  const cases = [
    [{ mode: "heat", heat: 68 }, null],
    [{ mode: "heat", heat: 68, cool: 60 }, null],
    [{ mode: "heat" }, "enter a heat setpoint"],
    [{ mode: "heat", heat: "" }, "enter a heat setpoint"],
    [{ mode: "emergency heat", heat: 66 }, null],
    [{ mode: "cool" }, "enter a cool setpoint"],
    [{ mode: "cool", cool: 74, heat: 80 }, null],
    [{ mode: "auto", heat: 68 }, "enter a cool setpoint"],
    [{ mode: "auto", heat: 72, cool: 72 }, "heat setpoint must be below cool setpoint"],
    [{ mode: "auto", heat: 68, cool: 72 }, null],
    [{ mode: "off", heat: 90, cool: 50 }, null],
    [{ mode: "fan only" }, null],
    [{}, "choose a mode, setpoint, or fan mode"],
    [{ fanMode: "on" }, null],
    [{ heat: 70, cool: 68 }, "heat setpoint must be below cool setpoint"],
    [{ mode: "heat", heat: 40 }, "heat setpoint must be between 50 and 90", "F"],
    [{ mode: "heat", heat: 50 }, null, "F"],
    [{ mode: "heat", heat: 90 }, null, "F"],
    [{ mode: "heat", heat: 91 }, "heat setpoint must be between 50 and 90", "F"],
    [{ mode: "cool", cool: 9 }, "cool setpoint must be between 10 and 32", "C"],
    [{ mode: "cool", cool: 24 }, null, "C"],
    [{ mode: "heat", heat: 68 }, "heat setpoint must be between 10 and 32", "C"],
    [{ mode: "off", heat: 40, cool: 5 }, null, "F"],
    [{ mode: "heat", heat: 40 }, null],
  ];
  for (const [ac, want, unit] of cases) {
    const got = thermostatSettingError(ac, unit);
    assert(got === want, `thermostatSettingError(${JSON.stringify(ac)}, ${unit}) = ${got}, want ${want}`);
    assert(browserErr(ac, unit) === want, `editor copy of thermostatSettingError(${JSON.stringify(ac)}, ${unit}) = ${browserErr(ac, unit)}, want ${want}`);
  }

  const n = thermostatSettingNormalized({ mode: "heat", heat: "68.6", cool: 72, fanMode: "" });
  assert(JSON.stringify(n) === JSON.stringify({ mode: "heat", heat: 69 }), "heat mode keeps a whole-degree heat setpoint only: " + JSON.stringify(n));
  const off = thermostatSettingNormalized({ mode: "off", heat: 68, cool: 72, fanMode: "auto" });
  assert(JSON.stringify(off) === JSON.stringify({ mode: "off", fanMode: "auto" }), "off mode drops setpoints: " + JSON.stringify(off));
  assert(
    validateSchedulePayload({ trigger: { kind: "daily", time: "07:00" }, action: { target: "thermostats", devices: ["1"], mode: "auto", heat: 74, cool: 70 } })
      === "heat setpoint must be below cool setpoint",
    "schedule save rejects a reversed auto range",
  );
  console.log("ok unit: thermostat setting rules (preview and editor agree)");
}

{
  const now = 1_700_000_000_000;
  assert(onceScheduleDisposition(now + 1000, now) === "schedule", "future once schedules");
  assert(onceScheduleDisposition(now - 60 * 1000, now) === "catchup", "one minute late still runs");
  assert(onceScheduleDisposition(now - ONCE_CATCHUP_MS, now) === "catchup", "exactly 10 minutes late still runs");
  assert(onceScheduleDisposition(now - ONCE_CATCHUP_MS - 1, now) === "drop", "older than 10 minutes is dropped");
  assert(onceScheduleDisposition(Number.NaN, now) === "invalid", "bad once time");
  console.log("ok unit: once catch-up window");
}

const child = spawn("node", ["preview/server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (d) => { stderr += d.toString(); });

try {
  await waitForServer(child);
  await unlockPreview();

  const list0 = await getJson("/schedules");
  assert(list0.ok === true, "GET /schedules ok");
  assert(Array.isArray(list0.schedules) && list0.schedules.length >= 3, "seeded schedules present");

  const data = await getJson("/data");
  assert(data.schedulerEnabled !== false, "scheduler enabled in /data");
  assert(typeof data.hubTimeZone === "string" && data.hubTimeZone.length > 0, "hubTimeZone present");
  assert(Number.isFinite(Number(data.hubNow)) && Number(data.hubNow) > 0, "hubNow present");
  assert(data.sunTimes?.sunrise != null && data.sunTimes?.sunset != null, "sunTimes present");
  assert(Array.isArray(data.schedules), "local /data includes schedules");

  // Save daily clock
  {
    const { res, json } = await postJson("/schedules/save", {
      name: "Verify daily",
      enabled: true,
      trigger: { kind: "daily", when: "clock", time: "19:30" },
      onlyInModes: [],
      action: { target: "lights", states: [{ id: 1, on: true, level: 50 }] },
    });
    assert(res.status === 200 && json.ok, `daily save failed: ${JSON.stringify(json)}`);
    const row = json.schedules.find((s) => s.id === json.id);
    assert(row?.nextFire != null && row.nextFire > Date.now(), "daily nextFire set");
    assert(/Daily/.test(row.summary), `daily summary: ${row.summary}`);
  }

  // Save weekly named days
  let weeklyId;
  {
    const { res, json } = await postJson("/schedules/save", {
      name: "Verify weekly",
      enabled: true,
      trigger: { kind: "weekly", when: "clock", time: "08:15", days: ["MON", "WED", "FRI"] },
      onlyInModes: [],
      action: { target: "lights", states: [{ id: 2, on: false }] },
    });
    assert(res.status === 200 && json.ok, `weekly save failed: ${JSON.stringify(json)}`);
    weeklyId = json.id;
    const row = json.schedules.find((s) => s.id === weeklyId);
    assert(row?.nextFire != null, "weekly nextFire set");
    assert(row.trigger.days.join(",") === "MON,WED,FRI", "weekly days preserved");
  }

  // Save sunset offset
  {
    const { res, json } = await postJson("/schedules/save", {
      name: "Verify sunset",
      enabled: true,
      trigger: { kind: "daily", when: "sunset", offsetMin: -15 },
      onlyInModes: [],
      action: { target: "lights", states: [{ id: 3, on: true }] },
    });
    assert(res.status === 200 && json.ok, `sunset save failed: ${JSON.stringify(json)}`);
    const row = json.schedules.find((s) => s.id === json.id);
    assert(row?.nextFire != null, "sunset nextFire set");
    assert(/Sunset/.test(row.summary), `sunset summary: ${row.summary}`);
  }

  // Save once
  {
    const at = futureOnceAt(3);
    const { res, json } = await postJson("/schedules/save", {
      name: "Verify once",
      enabled: true,
      trigger: { kind: "once", at },
      onlyInModes: [],
      action: { target: "hubMode", mode: "Night" },
    });
    assert(res.status === 200 && json.ok, `once save failed: ${JSON.stringify(json)}`);
    const row = json.schedules.find((s) => s.id === json.id);
    assert(row?.nextFire != null && row.nextFire > Date.now(), "once nextFire set");
  }

  // Save mode trigger
  {
    const { res, json } = await postJson("/schedules/save", {
      name: "Verify mode",
      enabled: true,
      trigger: { kind: "mode", mode: "Away" },
      onlyInModes: [],
      action: { target: "lights", states: [{ id: 1, on: false }] },
    });
    assert(res.status === 200 && json.ok, `mode save failed: ${JSON.stringify(json)}`);
    const row = json.schedules.find((s) => s.id === json.id);
    assert(row?.nextFire == null, "mode nextFire is null");
    assert(/Away/.test(row.summary), `mode summary: ${row.summary}`);
  }

  // Invalid: weekly without days
  {
    const { res, json } = await postJson("/schedules/save", {
      name: "Bad weekly",
      enabled: true,
      trigger: { kind: "weekly", when: "clock", time: "09:00", days: [] },
      action: { target: "lights", states: [{ id: 1, on: true }] },
    });
    assert(res.status === 422 && json.ok === false, "weekly without days should 422");
  }

  // Invalid: empty action
  {
    const { res, json } = await postJson("/schedules/save", {
      name: "Bad action",
      enabled: true,
      trigger: { kind: "daily", when: "clock", time: "10:00" },
      action: { target: "lights", states: [] },
    });
    assert(res.status === 422 && json.ok === false, "empty lights action should 422");
  }

  // Toggle off → nextFire null; toggle on → recomputed
  {
    const { res: r1, json: j1 } = await postJson("/schedules/toggle", { id: weeklyId });
    assert(r1.status === 200 && j1.ok && j1.enabled === false, "toggle off");
    const off = j1.schedules.find((s) => s.id === weeklyId);
    assert(off.nextFire == null, "disabled nextFire null");
    const { res: r2, json: j2 } = await postJson("/schedules/toggle", { id: weeklyId });
    assert(r2.status === 200 && j2.ok && j2.enabled === true, "toggle on");
    const on = j2.schedules.find((s) => s.id === weeklyId);
    assert(on.nextFire != null, "re-enabled nextFire set");
  }

  // Delete
  {
    const { res, json } = await postJson("/schedules/delete", { id: weeklyId });
    assert(res.status === 200 && json.ok, "delete ok");
    assert(!json.schedules.some((s) => s.id === weeklyId), "deleted from list");
  }

  // Preserve lastFired on update
  {
    const seeded = list0.schedules.find((s) => s.id === "sc-demo-1");
    assert(seeded?.lastFired != null, "seeded lastFired");
    const { res, json } = await postJson("/schedules/save", {
      id: "sc-demo-1",
      name: "Evening lights updated",
      enabled: true,
      trigger: { kind: "daily", when: "clock", time: "20:00" },
      onlyInModes: [],
      action: { target: "lights", states: [{ id: 1, on: true, level: 80 }] },
    });
    assert(res.status === 200 && json.ok, "update save ok");
    const row = json.schedules.find((s) => s.id === "sc-demo-1");
    assert(row.lastFired === seeded.lastFired, "lastFired preserved on update");
    assert(row.name === "Evening lights updated", "name updated");
  }

  // Cloud /data omits schedules; GET /schedules still works
  {
    const cloud = await getJson("/data?omitSchedules=1");
    assert(cloud.schedules === null, "cloud-style /data omits schedules");
    const list = await getJson("/schedules");
    assert(Array.isArray(list.schedules) && list.schedules.length > 0, "GET /schedules still returns list");
  }

  // Failed GET /schedules
  {
    const sep = dashSessionQuery ? "&" : "?";
    const res = await fetch(`http://127.0.0.1:${PORT}/schedules?fail=1${sep}${dashSessionQuery}`);
    assert(res.status === 500, "failed schedules GET is 500");
    const json = await res.json();
    assert(json.ok === false && /unreadable/.test(json.error || ""), "failed GET explains store error");
  }

  // Unknown device rejected
  {
    const { res, json } = await postJson("/schedules/save", {
      name: "Missing light",
      enabled: true,
      trigger: { kind: "daily", when: "clock", time: "11:00" },
      action: { target: "lights", states: [{ id: 99999, on: true }] },
    });
    assert(res.status === 422 && json.ok === false, "unknown light id should 422");
    assert(/not available/.test(json.error || ""), `unknown device error: ${json.error}`);
  }

  // Mode self-loop / cycle
  {
    const { res, json } = await postJson("/schedules/save", {
      name: "Self mode",
      enabled: true,
      trigger: { kind: "mode", mode: "Day" },
      action: { target: "hubMode", mode: "Day" },
    });
    assert(res.status === 422 && json.ok === false, "mode self-loop should 422");
  }
  {
    const a = await postJson("/schedules/save", {
      name: "Day to Evening",
      enabled: true,
      trigger: { kind: "mode", mode: "Day" },
      action: { target: "hubMode", mode: "Evening" },
    });
    assert(a.res.status === 200 && a.json.ok, "first mode-edge save ok");
    const b = await postJson("/schedules/save", {
      name: "Evening to Day",
      enabled: true,
      trigger: { kind: "mode", mode: "Evening" },
      action: { target: "hubMode", mode: "Day" },
    });
    assert(b.res.status === 422 && b.json.ok === false, "mode cycle should 422");
    assert(/loop/.test(b.json.error || ""), `cycle error: ${b.json.error}`);
  }

  // Test returns lastResult without consuming the schedule
  {
    const { res, json } = await postJson("/schedules/test", { id: "sc-demo-1" });
    assert(res.status === 200 && json.ok, "test ok");
    assert(json.lastResult && json.lastResult.ok === true, "test lastResult present");
    const failed = await postJson("/schedules/test", { id: "sc-demo-1", simulateResult: "failed" });
    assert(failed.res.status === 200 && failed.json.ok === false, "failed action must not report top-level success");
    assert(failed.json.lastResult?.failed?.length === 1, "failed action result must include failed target");
    const missing = await postJson("/schedules/test", { id: "sc-demo-1", simulateResult: "missing" });
    assert(missing.res.status === 200 && missing.json.ok === false, "missing target must not report top-level success");
    assert(missing.json.lastResult?.missing?.length === 1, "missing action result must include target");
  }

  console.log("ok api: scheduler CRUD / nextFire / validation");
} catch (e) {
  console.error("FAIL:", e.message || e);
  if (stderr) console.error(stderr);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
}
