#!/usr/bin/env node
// Unit tests for dashboard default schedule names.
// Run: node preview/verify-scheduler-naming.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadAutoScheduleName() {
  const src = readFileSync(join(root, "src/app-pre.js"), "utf8");
  const start = src.indexOf("function autoScheduleName(");
  if (start < 0) throw new Error("autoScheduleName missing from src/app-pre.js");
  const brace = src.indexOf("{", start);
  let depth = 0;
  let end = brace;
  for (; end < src.length; end++) {
    const ch = src[end];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end++;
        break;
      }
    }
  }
  const fnSrc = src.slice(start, end);
  return new Function(`${fnSrc}\nreturn autoScheduleName;`)();
}

const autoScheduleName = loadAutoScheduleName();

const appJs = readFileSync(join(root, "src/app.js"), "utf8");
assert(
  appJs.includes("const fn = globalThis.autoScheduleName"),
  "autoSchedName must call globalThis.autoScheduleName (Hubitat split JS files)"
);
assert(
  appJs.includes("fn(schedDraft, { rooms, devices, outlets, thermostats, locks, windowShades, ceilingFans }"),
  "autoSchedName must delegate to autoScheduleName with live catalogs"
);
assert(
  appJs.includes("wrap.appendChild(renderSchedNameField())"),
  "generated name field must appear on every wizard step"
);
assert(
  appJs.includes("nin.value = schedLiveName()"),
  "name field shows the live generated name before save"
);
assert(
  appJs.includes("function schedSyncNameField()"),
  "name field must refresh when trigger/action change without a full re-render"
);
assert(
  /name:\s*\(schedNameCustom \? \(schedDraft\.name \|\| ""\)\.trim\(\) : ""\) \|\| autoSchedName\(\)/.test(appJs),
  "save uses the generated name unless the user edited it"
);

function clock12(str24) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str24 || "").trim());
  if (!m) return str24 || "";
  let h = Number(m[1]);
  const min = m[2];
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12;
  if (h === 0) h = 12;
  return h + ":" + min + " " + ap;
}

const fmt12 = { clockTime: clock12, dateTimeLocal: (t) => t || "" };
const fmt24 = { clockTime: (t) => t || "", dateTimeLocal: (t) => t || "" };

const catalogs = {
  rooms: [
    { id: 1, name: "Kitchen" },
    { id: 2, name: "Hall" },
    { id: 3, name: "Office" },
  ],
  devices: [
    { i: 10, n: "Kitchen Lamp", r: 1 },
    { i: 11, n: "Kitchen Ceiling", r: 1 },
    { i: 12, n: "Hall Light", r: 2 },
    { i: 13, n: "Porch Light", r: null },
  ],
  outlets: [
    { i: 20, n: "Coffee Maker", r: 1 },
    { i: 21, n: "Toaster", r: 1 },
    { i: 22, n: "Desk Lamp Outlet", r: 3 },
  ],
  thermostats: [
    { i: 30, n: "Hall Thermostat", r: 2 },
    { i: 31, n: "Office Thermostat", r: 3 },
    { i: 32, n: "Kitchen Thermostat", r: 1 },
    { i: 33, n: "Hall Upstairs", r: 2 },
    { i: 37, n: "Living Room Thermostat", r: 1 },
  ],
  locks: [
    { i: 3001, n: "Front Door", r: 11 },
    { i: 3002, n: "Garage Entry", r: 6 },
  ],
  windowShades: [
    { i: 5001, n: "Living Room Shade", r: 1 },
    { i: 5002, n: "Kitchen Shade", r: 1 },
  ],
  ceilingFans: [
    { i: 5103, n: "Patio DC Fan", r: 7 },
    { i: 5101, n: "Living Room Fan", r: 1 },
  ],
};

function nameOf(draft, fmt = fmt12, cats = catalogs) {
  return autoScheduleName(draft, cats, fmt);
}

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "19:30" },
    action: { target: "lights", states: [{ id: 10, on: true }] },
  }) === "Kitchen Lamp On at 7:30 PM",
  "single light on at clock time"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "sunset", offsetMin: -15 },
    action: { target: "lights", states: [{ id: 10, on: false }, { id: 11, on: false }] },
  }) === "Kitchen Lights Off at Sunset -15m",
  "same-room lights off at sunset offset"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "21:00" },
    action: { target: "lights", states: [{ id: 10, on: false }, { id: 12, on: false }] },
  }) === "Lights Off at 9:00 PM",
  "cross-room lights use type name"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "19:30" },
    action: { target: "lights", states: [{ id: 10, on: true }, { id: 11, on: false }] },
  }) === "Kitchen Lights Set at 7:30 PM",
  "mixed on/off uses Set"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "sunrise", offsetMin: 0 },
    action: { target: "outlets", states: [{ id: 20, on: true }] },
  }) === "Coffee Maker On at Sunrise",
  "single outlet at sunrise"
);

assert(
  nameOf({
    trigger: { kind: "weekly", when: "clock", time: "19:30", days: ["WED", "SUN", "FRI"] },
    action: { target: "lights", states: [{ id: 10, on: true }] },
  }) === "Kitchen Lamp On at 7:30 PM on Sun, Wed, Fri",
  "weekly days are listed in week order"
);

assert(
  nameOf({
    trigger: { kind: "weekly", when: "clock", time: "08:00", days: ["MON", "WED"] },
    action: { target: "outlets", states: [{ id: 20, on: false }, { id: 21, on: false }] },
  }) === "Kitchen Outlets Off at 8:00 AM on Mon, Wed",
  "same-room weekly outlets include weekdays"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "06:00" },
    action: { target: "thermostats", devices: [30, 31], mode: "heat", heat: 68, cool: 72 },
  }) === "Thermostats Heat 68\u00b0 at 6:00 AM",
  "cross-room thermostats heat setpoint"
);

assert(
  nameOf({
    trigger: { kind: "mode", mode: "Home" },
    action: { target: "thermostats", devices: [30], mode: "auto", heat: 68, cool: 72 },
  }) === "Hall Thermostat Auto 68\u00b0-72\u00b0 when mode is Home",
  "single thermostat auto range on mode trigger"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "22:00" },
    action: { target: "hubMode", mode: "Night" },
  }) === "Hub Mode Night at 10:00 PM",
  "hub mode destination at clock time"
);

assert(
  nameOf({
    trigger: { kind: "once", at: "2026-09-14T19:30" },
    action: { target: "lights", states: [{ id: 10, on: true }] },
  }) === "Kitchen Lamp On at 2026-09-14T19:30",
  "once trigger uses dateTimeLocal formatter"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "19:30" },
    action: { target: "lights", states: [{ id: 10, on: true }] },
  }, fmt24) === "Kitchen Lamp On at 19:30",
  "24-hour clock formatter"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "19:30" },
    action: { target: "lights", states: [{ id: 99, on: true }] },
  }) === "Device 99 On at 7:30 PM",
  "missing catalog entry uses Device id"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "19:30" },
    action: { target: "lights", states: [] },
  }) === "Lights at 7:30 PM",
  "no devices selected still names the type and time"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "19:30" },
    action: { target: "unknown" },
  }) === "Devices at 7:30 PM",
  "unknown target falls back to Devices"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "07:00" },
    action: { target: "thermostats", devices: [30, 32], mode: "off" },
  }) === "Thermostats Off at 7:00 AM",
  "thermostat off omits setpoints"
);

assert(
  nameOf({
    trigger: { kind: "weekly", when: "sunset", offsetMin: 30, days: ["FRI"] },
    action: { target: "outlets", states: [{ id: 20, on: false }, { id: 22, on: false }] },
  }) === "Outlets Off at Sunset +30m on Fri",
  "cross-room outlets at sunset plus offset include weekday"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "06:00" },
    action: { target: "thermostats", devices: [30, 33], mode: "heat", heat: 68 },
  }) === "Hall Thermostats Heat 68\u00b0 at 6:00 AM",
  "same-room thermostats use room + type"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "21:00" },
    action: { target: "lights", states: [{ id: 13, on: false }, { id: 99, on: false }] },
  }) === "Lights Off at 9:00 PM",
  "unroomed / unknown mix does not invent a room name"
);

assert(
  nameOf({
    trigger: { kind: "mode", when: "clock", time: "19:30", mode: "Away" },
    action: { target: "lights", states: [{ id: 10, on: false }] },
  }) === "Kitchen Lamp Off when mode is Away",
  "mode trigger ignores leftover clock time"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "19:30" },
    action: { target: "lights", states: [{ id: 10, on: true }, null] },
  }) === "Kitchen Lamp On at 7:30 PM",
  "null state rows are ignored"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "8:00" },
    action: { target: "thermostats", devices: 37, mode: "cool", cool: 72 },
  }) === "Living Room Thermostat Cool 72\u00b0 at 8:00 AM",
  "scalar thermostat id is one device, not a count"
);

{
  const cats = {
    ...catalogs,
    devices: [{ i: 10, n: "   ", r: 1 }, { i: 11, n: "Kitchen Ceiling", r: 1 }],
  };
  assert(
    nameOf({
      trigger: { kind: "daily", when: "clock", time: "19:30" },
      action: { target: "lights", states: [{ id: 10, on: true }] },
    }, fmt12, cats) === "Device 10 On at 7:30 PM",
    "whitespace-only device name falls back to Device id"
  );
}

function loadSchedActionDescription() {
  const src = readFileSync(join(root, "src/app.js"), "utf8");
  const start = src.indexOf("  function schedIdList(");
  if (start < 0) throw new Error("schedIdList missing from src/app.js");
  const end = src.indexOf("  function schedOnlyInModesList(");
  if (end < 0) throw new Error("schedOnlyInModesList missing from src/app.js");
  const fnSrc = src.slice(start, end);
  return new Function(`${fnSrc}\nreturn { schedIdList, schedActionDescription };`)();
}

const { schedIdList, schedActionDescription } = loadSchedActionDescription();

assert(schedIdList(37).join(",") === "37", "scalar device id is one thermostat");
assert(schedIdList("37").join(",") === "37", "string device id is not split into digits");
assert(schedIdList([37]).join(",") === "37", "single-item id array stays one thermostat");
assert(schedIdList([37, "37", 37]).join(",") === "37", "duplicate ids collapse");

{
  const thenLine = schedActionDescription(
    { target: "thermostats", devices: 37, mode: "cool", cool: 72 },
    catalogs
  );
  assert(
    thenLine === "Living Room Thermostat \u00b7 Cool 72\u00b0",
    "Then line names the thermostat and does not repeat cool: " + thenLine
  );
  assert(!thenLine.includes("37 thermostat"), "Then line must not treat the device id as a count");
}

assert(
  schedActionDescription(
    { target: "thermostats", devices: [30, 31], mode: "heat", heat: 68 },
    catalogs
  ) === "Hall Thermostat & Office Thermostat \u00b7 Heat 68\u00b0",
  "two thermostats list both names"
);

assert(
  schedActionDescription(
    { target: "thermostats", devices: [30, 31, 32], mode: "cool", cool: 72 },
    catalogs
  ) === "3 thermostats \u00b7 Cool 72\u00b0",
  "three or more thermostats collapse to a count"
);

assert(
  schedActionDescription(
    { target: "thermostats", devices: [30], mode: "auto", heat: 68, cool: 72, fanMode: "on" },
    catalogs
  ) === "Hall Thermostat \u00b7 Auto \u00b7 Heat 68\u00b0 \u00b7 Cool 72\u00b0 \u00b7 Fan on",
  "auto mode lists both setpoints without duplicating heat/cool as the mode word"
);

assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "22:00" },
    action: { target: "locks", states: [{ id: 3001, locked: true }] },
  }) === "Front Door Locked at 10:00 PM",
  "lock schedule name"
);
assert(
  nameOf({
    trigger: { kind: "daily", when: "sunrise", offsetMin: 0 },
    action: { target: "blinds", states: [{ id: 5001, open: true }, { id: 5002, open: true }] },
  }) === "Kitchen Blinds Open at Sunrise",
  "blinds in one room share the room name"
);
assert(
  nameOf({
    trigger: { kind: "daily", when: "clock", time: "21:00" },
    action: { target: "fans", states: [{ id: 5103, on: true, speed: "4" }] },
  }) === "Patio DC Fan 4 at 9:00 PM",
  "fan speed is part of the name"
);
assert(
  schedActionDescription({ target: "locks", states: [{ id: 3001, locked: false }] }, catalogs) === "Unlock Front Door",
  "Then line names one unlock"
);
assert(
  schedActionDescription(
    { target: "blinds", states: [{ id: 5001, open: true, position: 40 }, { id: 5002, open: true, position: 40 }] },
    catalogs
  ) === "Open 2 blinds \u00b7 40%",
  "Then line counts blinds that share a position"
);
assert(
  schedActionDescription({ target: "fans", states: [{ id: 5103, on: true, speed: "4" }] }, catalogs) === "Patio DC Fan \u00b7 4",
  "Then line names a fan speed"
);

console.log("ok unit: scheduler default naming");
