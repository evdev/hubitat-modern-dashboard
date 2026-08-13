#!/usr/bin/env node
// Run: node preview/verify-sar-import.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convertSarExport, parseSarExport } from "../lib/sar-import.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = readFileSync(join(root, "preview/fixtures/simple-automation-export.txt"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function byKey(ok, key) {
  return ok.find((x) => x.importKey === key || x.importKey?.startsWith(key));
}

// Parse repair
{
  const p = parseSarExport(fixture);
  assert(!p.error, "fixture should parse: " + p.error);
  assert(p.root.appData["194"], "app 194 present");
  assert(p.root.appData["148"], "app 148 present");
  assert(p.root.appData["105"], "app 105 present");
}

// Empty / invalid
{
  const e = convertSarExport("");
  assert(e.error && /empty/i.test(e.error), "empty paste error");
  const bad = convertSarExport("{not json");
  assert(bad.error && /invalid/i.test(bad.error), "invalid json error");
}

// Convert with all devices in lights picker
{
  const lightIds = ["176", "238", "230", "56"];
  const r = convertSarExport(fixture, lightIds, []);
  assert(!r.error, "convert error: " + r.error);
  assert(r.ok.length >= 3, "expected >=3 schedules, got " + r.ok.length + " skips=" + JSON.stringify(r.skipped));

  const a194 = r.ok.find((x) => String(x.importKey).includes("sar-194"));
  assert(a194, "194 present");
  assert(a194.schedule.trigger.when === "sunset", "194 sunset");
  assert(a194.schedule.trigger.offsetMin === 120, "194 offset 120");
  assert(a194.schedule.onlyInModes.includes("Shabbos & Yom Tov"), "194 modes");
  assert(a194.schedule.action.states.every((s) => s.on === false), "194 off");
  assert(a194.schedule.action.states.length === 2, "194 two devices");

  const a148 = r.ok.find((x) => String(x.importKey).includes("sar-148"));
  assert(a148, "148 present");
  assert(a148.schedule.trigger.time === "00:01", "148 time 00:01 got " + a148.schedule.trigger.time);
  assert(a148.schedule.action.states[0].id == 230 || a148.schedule.action.states[0].id === "230", "148 device");

  const a105 = r.ok.find((x) => String(x.importKey).includes("sar-105"));
  assert(a105, "105 present");
  assert(a105.schedule.trigger.time === "00:00", "105 midnight");
}

// Devices missing → skip with reasons
{
  const r = convertSarExport(fixture, [], []);
  assert(!r.error, "no parse error");
  assert(r.ok.length === 0, "nothing importable without pickers");
  assert(r.skipped.length > 0, "must have skip reasons");
  assert(r.skipped.every((s) => s.reason && s.name), "each skip has name+reason");
  assert(r.skipped.some((s) => /not in Lights\/Outlets|No devices remain/i.test(s.reason)), "device skip reason");
}

// Partial: one device in picker, one missing
{
  const r = convertSarExport(fixture, ["176"], []);
  const a194 = r.ok.find((x) => String(x.importKey).includes("sar-194"));
  assert(a194, "194 still imports with one device");
  assert(a194.schedule.action.states.length === 1, "only device 176");
  assert(r.skipped.some((s) => /Partial:/i.test(s.reason) && /238/.test(s.reason)), "partial skip for 238");
}

// Mode Changes → mDash mode trigger
{
  const modeFixture = readFileSync(join(root, "preview/fixtures/simple-automation-mode-change.txt"), "utf8");
  const r = convertSarExport(modeFixture, [], ["260", "261"]);
  assert(!r.error, "mode fixture parse: " + r.error);
  assert(r.ok.length >= 1, "mode rule imports: " + JSON.stringify(r.skipped));
  const row = r.ok[0];
  assert(row.schedule.trigger.kind === "mode", "kind mode");
  assert(row.schedule.trigger.mode === "Home", "mode Home");
  assert(row.schedule.action.target === "outlets", "outlets target");
  assert(row.schedule.action.states.every((s) => s.on === true), "turn on");
  assert(row.schedule.action.states.length === 2, "both devices");
}

// Sunrise + Set Temperature + second time (sunset anti-action)
{
  const ctFixture = readFileSync(join(root, "preview/fixtures/simple-automation-sunrise-ct.txt"), "utf8");
  const r = convertSarExport(ctFixture, ["244"], []);
  assert(!r.error, "ct fixture: " + r.error);
  assert(r.ok.length === 2, "primary + secondary: " + r.ok.length + " " + JSON.stringify(r.skipped));
  const primary = r.ok.find((x) => x.importKey === "sar-396-lights");
  const secondary = r.ok.find((x) => x.importKey === "sar-396-2-lights");
  assert(primary, "primary present");
  assert(secondary, "secondary present");
  assert(primary.schedule.trigger.when === "sunrise", "sunrise");
  assert(primary.schedule.action.states[0].on === true, "primary on");
  assert(primary.schedule.action.states[0].level === 60, "level 60");
  assert(primary.schedule.action.states[0].ct === 2700, "ct 2700");
  assert(secondary.schedule.trigger.when === "sunset", "sunset anti");
  assert(secondary.schedule.action.states[0].on === false, "secondary off");
  assert(secondary.schedule.action.states[0].level == null, "secondary no level");
  assert(secondary.schedule.action.states[0].ct == null, "secondary no ct");
}

// Secondary time with clock → anti-action off
{
  const mini = JSON.stringify({
    deviceReplacements: { "1": { deviceLabel: "Lamp" } },
    appReplacements: {
      "9": { appTypeName: "Simple Automation Rule 1.2", appLabel: "On sunset off later" },
    },
    appData: {
      "9": {
        state: { appName: "On sunset off later" },
        appSettings: [
          { name: "howToTrigger", type: "enum", value: "At a Specific Time" },
          { name: "atT", type: "enum", value: "sunset" },
          { name: "sunsetOffset", type: "number", value: "0" },
          { name: "at2T", type: "enum", value: "time" },
          { name: "at2Time", type: "time", value: "23:00" },
          { name: "action", type: "enum", value: "Turn On" },
          { name: "lights", type: "capability.switch", value: null, deviceList: { "1": "Lamp" }, multiple: true },
        ],
      },
    },
  });
  const r = convertSarExport(mini, ["1"], []);
  assert(r.ok.length === 2, "primary+secondary clock");
  assert(r.ok[0].schedule.trigger.when === "sunset", "primary sunset");
  const sec = r.ok.find((x) => String(x.importKey).includes("-2-"));
  assert(sec.schedule.trigger.time === "23:00", "secondary 23:00");
  assert(sec.schedule.action.states[0].on === false, "anti off");
  assert(/ \(off\)$/.test(sec.name), "synthetic secondary named off");
}

// Unsupported trigger fixture
{
  const mini = JSON.stringify({
    deviceReplacements: { "1": { deviceLabel: "Lamp" } },
    appReplacements: {
      "9": {
        appTypeName: "Simple Automation Rule 1.2",
        appLabel: "When switch on",
      },
    },
    appData: {
      "9": {
        state: { appName: "When switch on", disabled: false },
        appSettings: [
          { name: "howToTrigger", type: "enum", value: "Switch turns On" },
          { name: "action", type: "enum", value: "Turn On" },
          { name: "lights", type: "capability.switch", value: null, deviceList: { "1": "Lamp" }, multiple: true },
        ],
      },
    },
  });
  const r = convertSarExport(mini, ["1"], []);
  assert(r.ok.length === 0, "switch trigger not importable");
  assert(r.skipped.some((s) => /Unsupported trigger/i.test(s.reason)), "trigger skip reason: " + JSON.stringify(r.skipped));
}

// Toggle unsupported
{
  const mini = JSON.stringify({
    deviceReplacements: { "1": { deviceLabel: "Lamp" } },
    appReplacements: {
      "9": { appTypeName: "Simple Automation Rule 1.2", appLabel: "Toggle at noon" },
    },
    appData: {
      "9": {
        state: { appName: "Toggle at noon" },
        appSettings: [
          { name: "howToTrigger", type: "enum", value: "At a Specific Time" },
          { name: "atT", type: "enum", value: "time" },
          { name: "atTime", type: "time", value: "12:00" },
          { name: "action", type: "enum", value: "Toggle" },
          { name: "lights", type: "capability.switch", value: null, deviceList: { "1": "Lamp" }, multiple: true },
        ],
      },
    },
  });
  const r = convertSarExport(mini, ["1"], []);
  assert(r.ok.length === 0);
  assert(r.skipped.some((s) => /Unsupported action:\s*Toggle/i.test(s.reason)), "toggle reason");
}

// Outlet classification
{
  const r = convertSarExport(fixture, [], ["176", "238", "230", "56"]);
  assert(r.ok.length >= 3, "outlets path");
  assert(r.ok.every((x) => x.schedule.action.target === "outlets"), "all outlets");
}

// Weekly days + sunset offset (Restricted = days, not modes)
{
  const weekly = readFileSync(join(root, "preview/fixtures/simple-automation-weekly-sunset.txt"), "utf8");
  const r = convertSarExport(weekly, [], ["66"]);
  assert(!r.error, "weekly fixture: " + r.error);
  assert(r.ok.length === 1, "one schedule");
  const s = r.ok[0].schedule;
  assert(s.trigger.kind === "weekly", "weekly");
  assert(s.trigger.days.includes("FRI"), "Friday → FRI");
  assert(s.trigger.when === "sunset", "sunset");
  assert(s.trigger.offsetMin === -40, "offset -40");
  assert(s.onlyInModes.length === 0, "no mode restriction in this export");
  assert(s.action.states[0].on === true, "turn on");
}

// Leftover at2Time=00:00 with empty at2T is NOT a cycle (app 148)
{
  const r = convertSarExport(fixture, ["176", "238", "230", "56"], []);
  const rows148 = r.ok.filter((x) => String(x.importKey).includes("sar-148"));
  assert(rows148.length === 1, "148 one schedule, not leftover midnight off: " + rows148.length);
  assert(!r.ok.some((x) => String(x.importKey).includes("sar-148-2")), "148 must not split");
}

// Live cycle: sunset +20 on, sunrise −20 off (Bug Zapper 290)
{
  const zap = readFileSync(join(root, "preview/fixtures/simple-automation-bug-zapper-cycle.txt"), "utf8");
  const r = convertSarExport(zap, ["59"], []);
  assert(!r.error, "zapper fixture: " + r.error);
  assert(r.ok.length === 2, "zapper primary+secondary: " + r.ok.length + " " + JSON.stringify(r.skipped));
  const primary = r.ok.find((x) => x.importKey === "sar-290-lights");
  const secondary = r.ok.find((x) => x.importKey === "sar-290-2-lights");
  assert(primary, "zapper primary");
  assert(secondary, "zapper secondary");
  assert(primary.schedule.trigger.when === "sunset", "zapper sunset");
  assert(primary.schedule.trigger.offsetMin === 20, "zapper +20");
  assert(primary.schedule.action.states[0].on === true, "zapper on");
  assert(secondary.schedule.trigger.when === "sunrise", "zapper sunrise anti");
  assert(secondary.schedule.trigger.offsetMin === -20, "zapper sunrise -20");
  assert(secondary.schedule.action.states[0].on === false, "zapper off");
  assert(/ \(off\)$/.test(secondary.name), "zapper secondary named off: " + secondary.name);
}

// Live cycle: sunset on, clock 00:00 off (floodlights 415). at2T=time; no doAntiAction in export.
{
  const flood = readFileSync(join(root, "preview/fixtures/simple-automation-floodlight-sunset-clock.txt"), "utf8");
  const ids = ["356", "54", "55", "359"];
  const r = convertSarExport(flood, ids, []);
  assert(!r.error, "flood fixture: " + r.error);
  assert(r.ok.length === 2, "flood primary+secondary: " + r.ok.length + " " + JSON.stringify(r.skipped));
  const primary = r.ok.find((x) => x.importKey === "sar-415-lights");
  const secondary = r.ok.find((x) => x.importKey === "sar-415-2-lights");
  assert(primary, "flood primary");
  assert(secondary, "flood secondary");
  assert(primary.schedule.trigger.when === "sunset", "flood sunset");
  assert(primary.schedule.action.states[0].on === true, "flood on");
  assert(primary.schedule.action.states.length === 4, "flood four devices");
  assert(secondary.schedule.trigger.when === "clock", "flood clock anti");
  assert(secondary.schedule.trigger.time === "00:00", "flood 00:00");
  assert(secondary.schedule.action.states[0].on === false, "flood off");
  assert(/ \(off\)$/.test(secondary.name), "flood secondary named off: " + secondary.name);
}

// CT sunrise cycle secondary is named (off)
{
  const ctFixture = readFileSync(join(root, "preview/fixtures/simple-automation-sunrise-ct.txt"), "utf8");
  const r = convertSarExport(ctFixture, ["244"], []);
  const secondary = r.ok.find((x) => x.importKey === "sar-396-2-lights");
  assert(/ \(off\)$/.test(secondary.name), "ct secondary named off: " + secondary.name);
}

console.log("ok sar-import:", {
  withLights: convertSarExport(fixture, ["176", "238", "230", "56"], []).ok.length,
  skippedWithout: convertSarExport(fixture, [], []).skipped.length,
});
