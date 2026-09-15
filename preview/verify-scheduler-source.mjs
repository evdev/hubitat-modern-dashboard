#!/usr/bin/env node
// Source invariants for Hubitat scheduler (Groovy cannot run here).
// Run: node preview/verify-scheduler-source.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "app/ModernLightsDashboard.groovy.template"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Daily cron must use DOM=* DOW=? (not ? for both)
assert(src.includes('return "0 ${mmStr} ${hhStr} * * ? *"'), "daily cron must be `0 mm hh * * ? *`");
assert(!src.includes('return "0 ${mm} ${hh} ? * ${dow} *"'), "old daily cron with dual ? must be gone");

// Sun times via getSunriseAndSunset, not location.sunrise(opts)
assert(src.includes("getSunriseAndSunset(opts)"), "must call getSunriseAndSunset(opts)");
assert(!/location\.sunrise\s*\(/.test(src), "must not call location.sunrise(...)");
assert(!/location\.sunset\s*\(/.test(src), "must not call location.sunset(...)");
{
  const m = src.match(/def scheduleSunNextFire\([\s\S]*?\ndef scheduleSunLabel/);
  assert(m, "scheduleSunNextFire parseable");
  assert(m[0].includes("cal.add(Calendar.DATE, -1)"), "sun scan must include the previous solar day");
}

// Subscription cleanup
assert(src.includes('unsubscribe("schedulerSunTimeChanged")'), "must unsubscribe sun handler");
assert(src.includes('unsubscribe("schedulerModeChanged")'), "must unsubscribe mode handler");

// Post-reboot re-init (Hubitat apps do not auto-call initialize())
assert(src.includes('subscribe(location, "systemStart", "hubSystemStart")'), "must subscribe to systemStart for reboot re-arm");
assert(src.includes("def hubSystemStart("), "must define hubSystemStart handler");
assert(src.includes("ensureSystemStartSubscription"), "must ensure systemStart subscription from installed/updated");
assert(/hubSystemStart[\s\S]*initializeScheduler\(\)/.test(src), "hubSystemStart must re-arm scheduler");
{
  const m = src.match(/def shutdownScheduler\(\)[\s\S]*?\ndef [a-zA-Z]/);
  const block = m ? m[0] : "";
  assert(block.includes("shutdownScheduler"), "shutdownScheduler block parseable");
  assert(!block.includes('unsubscribe("hubSystemStart")'), "shutdownScheduler must not unsubscribe hubSystemStart");
}

// Mode-skip still advances
assert(src.includes("scheduleAdvanceAfterTrigger"), "must advance after mode-skip / fire");

// Save/toggle surface registration failures
assert(src.includes("schedulesValidateNormalized"), "must validate normalized payloads");
assert(src.includes("failReason && s.enabled == true"), "save must reject registration failures");
assert(src.includes("failReason && enabledNow == true"), "toggle must reject registration failures");

// Day-name parsing for weekly nextFire
assert(src.includes("cronParseDayOrInt"), "must parse Quartz day names for nextFire");
assert(/SUN:\s*1,\s*MON:\s*2/.test(src), "must map SUN–SAT to Quartz 1–7");

assert(src.includes('log.info "Modern Dashboard: schedule ran —'), "must log schedule runs at info");
assert(src.includes('log.info "Modern Dashboard: schedule skipped —'), "must log mode skips at info");
assert(src.includes('log.info "Modern Dashboard: schedule test —'), "must log schedule tests at info");
assert(src.includes("def logControl(source, detail)"), "must define logControl helper");
assert(src.includes("def runScheduleAction(action, logSource)"), "runScheduleAction must take logSource");
assert(src.includes("def runScheduleLightAction(action, logSource)"), "light actions must take logSource");
assert(src.includes("def runScheduleOnOffAction(action, deviceList, logSource)"), "on/off actions must take logSource");
assert(src.includes("def runScheduleThermostatAction(action, logSource)"), "thermostat actions must take logSource");
assert(src.includes("runScheduleAction(action, logSource)"), "real fires must pass logSource");
assert(src.includes('runScheduleAction(s?.action, "automation ${scheduleLogName(id, s)}")'), "tests must pass automation logSource");
assert(src.includes('logSource = "automation ${scheduleLogName(id, s)}"'), "fires must tag automation name");
assert(src.includes('logControl("manual"'), "must log manual dashboard commands at info");
assert(src.includes("logControl(logSource"), "schedule device cmds must log with automation source");
assert(!src.includes('logDbg("schedule cmd'), "per-device schedule cmds must not be debug-only");
assert(!src.includes('logDbg("cmd —'), "manual cmds must not be debug-only");
{
  const m = src.match(/def executeOneCmd\([\s\S]*?\ndef doCmd\(/);
  assert(m, "executeOneCmd parseable");
  assert(m[0].includes('logControl("manual"'), "executeOneCmd must log manual at info");
}

assert(!src.includes("?.["), "must not use Groovy ?.[] safe-index (unsupported on Hubitat)");

// Simple Automation Rules import (Hubitat App Export paste)
assert(src.includes('page(name: "schedImportPage"'), "must register schedImportPage");
assert(src.includes("schedImportConvertExport"), "must convert SAR exports");
assert(src.includes("schedImportApplyOk"), "must apply imported schedules");
assert(src.includes("Unsupported trigger:"), "must report unsupported trigger skips");
assert(src.includes("Mode Changes"), "must support SAR Mode Changes trigger");
assert(src.includes("schedImportBuildModeTrigger") || src.includes("onMode"), "must map onMode for mode triggers");
assert(src.includes("not in Lights/Outlets") || src.includes("No devices remain after filtering"), "must report device picker skips");
assert(src.includes("schedImportHidePaste"), "must hide paste textarea after import (Hubitat form overwrite)");
assert(src.includes('app.clearSetting("schedImportPaste")') || src.includes('app.updateSetting("schedImportPaste"'), "must clear paste setting");
assert(!src.includes("id.isInteger()"), "must not use String.isInteger for device ids");
assert(src.includes("slotOn ? 'on' : 'off'"), "SAR secondary schedule name must be (on)/(off)");
assert(src.includes('s.name = body?.name?.toString()?.trim() ?: ""'), "hub stores the client-sent schedule name as a string");
assert(src.includes('out << ",\\"name\\":" << jsonStr(s?.name?.toString() ?: "")'), "schedule names are JSON-escaped for Hubitat");
assert(src.includes("state.schedulesJson = groovy.json.JsonOutput.toJson(map ?: [:])"), "schedules persist via JsonOutput");

// One dispatcher owns all time-based schedules. This avoids Hubitat's
// same-handler overwrite behavior and same-second state races.
assert(src.includes("singleThreaded: true"), "app must serialize top-level Hubitat executions");
assert(src.includes("def schedulerNextFireHandler("), "must define the single dispatcher");
assert(src.includes("def schedulerDueScheduleIds("), "must collect every due schedule");
assert(src.includes("def schedulerArmNextDispatcher("), "must arm the earliest dispatcher");
{
  const runOnceLines = [...src.matchAll(/runOnce\([^\n]+/g)].map((m) => m[0]);
  assert(runOnceLines.length === 1, `expected one dispatcher runOnce call, got ${runOnceLines.length}`);
  assert(runOnceLines[0].includes('"schedulerNextFireHandler"'), "runOnce must target the dispatcher");
  assert(runOnceLines[0].includes("overwrite: true"), "dispatcher runOnce must replace its prior arm");
  assert(!runOnceLines[0].includes("scheduledJobHandler"), "legacy shared handler must not be armed");
}
assert(src.includes('subscribe(location, "sunrise", schedulerSunEvent)'), "must subscribe to sunrise event");
assert(src.includes('subscribe(location, "sunset", schedulerSunEvent)'), "must subscribe to sunset event");
assert(src.includes("def schedulerSunEvent("), "must define schedulerSunEvent handler");
assert(src.includes("def runScheduledJobById("), "must share fire path for sun and dispatcher events");
assert(src.includes('unsubscribe("schedulerSunEvent")'), "must unsubscribe sun event handler");
assert(!src.includes("scheduleSunFiredToday"), "must not suppress edited sun schedules for an entire day");
assert(!src.includes("schedulerJobNearMs"), "legacy no-id early-fire fallback must be gone");
assert(!src.includes("MLD_SCHED_LOCK"), "regular state must not rely on an in-process lock");
{
  const m = src.match(/def schedulerSunEvent\([\s\S]*?\ndef schedulerMidnightRearm/);
  assert(m, "schedulerSunEvent parseable");
  assert(m[0].includes("scheduleOffsetMin(tr) != 0"), "sun event fallback is exact-offset only");
  assert(m[0].includes("storedFire > eventMs"), "sun event fallback must never consume a future occurrence");
  assert(m[0].includes("rebuildScheduledJobs()"), "sun event must re-arm the dispatcher");
}
{
  const m = src.match(/def runScheduledJobById\([\s\S]*?\ndef scheduleLogName/);
  assert(m, "runScheduledJobById parseable");
  assert(m[0].includes("scheduleAdvanceAfterTrigger(id, s, map, true)"), "must persist lastFired before device commands");
}
{
  const m = src.match(/def schedulerMidnightRearm\([\s\S]*?\ndef schedulerModeChanged/);
  assert(m, "schedulerMidnightRearm parseable");
  assert(m[0].includes("rebuildScheduledJobs()"), "midnight must recompute the single dispatcher");
  assert(!m[0].includes("runIn("), "midnight must not overwrite its recurring cron with a retry");
  assert(!m[0].includes('unschedule("scheduledJobHandler")'), "midnight must not cancel due jobs");
}
{
  const m = src.match(/def cleanupSchedules\(\)[\s\S]*?\n\/\/ --- endpoints ---/);
  assert(m, "cleanupSchedules parseable");
  assert(m[0].includes("schedulerNextFireHandler()"), "watchdog must run overdue one-time jobs");
  assert(!m[0].includes("map.remove"), "watchdog must not delete one-time jobs before they run");
}

console.log("ok source: scheduler Groovy invariants");
