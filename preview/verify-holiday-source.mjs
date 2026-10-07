#!/usr/bin/env node
// The child app cannot run in Node. Check that its occasion table and rules match the JS core.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const groovy = readFileSync(join(root, "app/mDashHolidays.groovy"), "utf8");
const parent = readFileSync(join(root, "app/ModernLightsDashboard.groovy.template"), "utf8");
const build = readFileSync(join(root, "build.mjs"), "utf8");
const holidayJs = readFileSync(join(root, "src/holiday.js"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

for (const piece of [
  "Tishrei 1,2 roshHashana",
  "10 yomKippur",
  "15,16 sukkot",
  "22,23 shemini",
  "Nisan 15,16 pesachFirst",
  "21,22 pesachLast",
  "Sivan 6,7 shavuot",
  "repeatLaterNights",
  "2L * 60 * 60 * 1000",
  "mDash Holidays:",
  "holidayParentPause",
  "HOLIDAY_API_VERSION 2",
  "apiVersion: 2",
  "parent.holidaySupportedKinds()",
  'return ["light", "outlet"]',
  "parent.thermostatSettingError",
  "skipped a late unlock",
  "holidayCloneStates(raw)",
]) {
  assert(groovy.includes(piece), `child app missing ${piece}`);
}
assert((groovy.match(/apiVersion: 2/g) || []).length >= 3, "status, preview, and try-now return apiVersion 2");
assert(/holidayTemplateSlots[\s\S]*"night"[\s\S]*"evening"[\s\S]*template\?\.custom/.test(groovy), "every time slot is checked for conflicting commands");
{
  const save = groovy.slice(groovy.indexOf("def holidaysSave"), groovy.indexOf("def holidaysSkip"));
  const checked = save.indexOf("holidayTemplateErrors");
  const stored = save.indexOf("templates[id] = holidayPlain(body.template)");
  assert(checked >= 0 && stored > checked, "a rejected schedule must not be stored");
}
assert(groovy.includes("holidayModeThisRun"), "device commands in the same run must not reread a stale location.mode");
assert(groovy.includes("def holidayPlain"), "JSON saved into state must be copied into plain maps");
assert(groovy.includes("def holidayPutCalendar"), "calendar fetches must replace state.calendar");
assert(groovy.includes("singleThreaded: true"), "mode changes and the schedule must not run at the same time");
assert(groovy.includes("config.pausedOccasions = list"), "pausing one occasion must be written back onto state.config");
assert(groovy.includes("afterEnd ? at < (day.end as long)"), "a custom time after the end is outside the day when it lands early");
assert(groovy.includes("holidayWatch"), "a lost one-shot fire is picked up on the hourly watch");
assert(/holidayReconcile[\s\S]*finally \{[\s\S]*holidayArm\(\)/.test(groovy), "a failed run still re-arms the next fire");
assert(groovy.includes("replayHeld"), "devices held for Do not start stay pending until that mode is set");
assert(groovy.includes("holidayMarkPassedDone(true)"), "a save must leave held and catch-up actions pending");
assert(groovy.includes("def holidayActionStillPending"), "save must tell a still-due action from one that already passed");
{
  const resume = groovy.slice(groovy.indexOf("def holidayTogglePause"), groovy.indexOf("def holidayStartTestSpan"));
  assert(resume.includes("holidayMarkPassedDone()"), "resuming still marks past actions so they are not replayed");
  assert(!resume.includes("holidayMarkPassedDone(true)"), "resume does not keep the catch-up window");
}
assert(groovy.includes('a.kind == "modeEnter" && spanOpen'), "an early mode change still runs when the job is a minute late");

assert(parent.includes('path("/holidays")'), "parent must expose /holidays");
assert(parent.includes("def holidayRunAction"), "parent must run holiday device actions");
assert(parent.includes("def holidaySupportedKinds()"), "parent must tell the child which device kinds it can run");
assert(/def holidayRunKind[\s\S]*runShadeCmd\(dev,/.test(parent), "blinds go through runShadeCmd");
assert(/def holidayRunKind[\s\S]*runFanCmd\(dev,/.test(parent), "fans go through runFanCmd");
assert(/def holidayRunKind[\s\S]*runLockCmd\(dev,/.test(parent), "locks go through runLockCmd");
assert(/def holidayRunKind[\s\S]*runThermostatSetting\(dev, st\)/.test(parent), "thermostats go through runThermostatSetting");
assert(/kind == "light"\) \{[\s\S]*?runScheduleLightAction/.test(parent), "only lights reach the light action");
assert(!/for \(st in states\) \{[\s\S]{0,500}def one = \[states: \[\[id: st\?\.id, on:/.test(parent), "states are not rebuilt as lights before the kind is known");
assert(parent.includes("holidayFilePresent"), "parent enables holidays when mld-holiday.js is present");
assert(parent.includes("holidaysAvailable"), "parent must report holidaysAvailable");
assert(!parent.includes('app(name: "mDashHolidays"'), "parent must not offer a child-app install button");
assert(!parent.includes("mld-holiday.js</code></li><li><code>mld-manifest"), "holiday file stays off the required twelve");
assert(build.includes('asset.name !== "mld-holiday.js"'), "Modern Dashboard package must not ship mld-holiday.js");
assert(build.includes("holidayPackageManifest.json"), "holiday file must be its own HPM package");
{
  const postFn = holidayJs.match(/async function post\(path, body\) \{[\s\S]*?\n\}/);
  assert(postFn, "holiday post helper parseable");
  assert(postFn[0].includes("postJsonSilent"), "holiday save must not flash before the caller");
  assert(!postFn[0].includes('error: "Could not save" }'), "holiday post must not replace the hub error");
  assert(postFn[0].includes("res?.error"), "holiday post keeps the hub error");
  assert(postFn[0].includes("status === 401"), "a rejected password session stays on the password dialog");
}

console.log("holiday source ok");
