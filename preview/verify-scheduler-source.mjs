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
assert(src.includes("failReason && s.enabled == true"), "save/toggle must reject registration failures");

// Day-name parsing for weekly nextFire
assert(src.includes("cronParseDayOrInt"), "must parse Quartz day names for nextFire");
assert(/SUN:\s*1,\s*MON:\s*2/.test(src), "must map SUN–SAT to Quartz 1–7");

assert(src.includes('log.info "Modern Dashboard: schedule ran —'), "must log schedule runs at info");
assert(src.includes('log.info "Modern Dashboard: schedule skipped —'), "must log mode skips at info");
assert(src.includes('log.info "Modern Dashboard: schedule test —'), "must log schedule tests at info");
assert(src.includes("def logControl(source, detail)"), "must define logControl helper");
assert(src.includes('logControl("manual"'), "must log manual dashboard commands at info");
assert(src.includes('logControl("automation"'), "schedule device cmds must log at info");
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

assert(src.includes("singleThreaded: true"), "app must serialize top-level Hubitat executions");

// Multiple jobs share scheduledJobHandler — overwrite:false required
assert(src.includes("def scheduleJobOptions(id)"), "must share overwrite:false job options");
assert(src.includes("overwrite: false"), "must register duplicate handler jobs with overwrite: false");
assert(!/runOnce\([^)]*scheduledJobHandler[^)]*\[data:\s*\[id:[^\]]+\]\]\s*\)/.test(src), "runOnce must not omit overwrite: false");

{
  const adv = src.match(/def scheduleAdvanceAfterTrigger[\s\S]*?\ndef scheduledJobHandler/);
  assert(adv, "scheduleAdvanceAfterTrigger block parseable");
  assert(!adv[0].includes("rebuildScheduledJobs()"), "sun advance must not globally rebuild jobs");
  assert(adv[0].includes("armSunScheduleNext"), "sun advance must re-arm only that schedule");
}
{
  const handler = src.match(/def scheduledJobHandler\(data\)[\s\S]*?\ndef scheduleLogName/);
  assert(handler, "scheduledJobHandler block parseable");
  const skip = handler[0].match(/not allowed\)"[\s\S]*?return/);
  assert(skip, "mode skip block parseable");
  assert(skip[0].includes('skipped: "mode"'), "a mode skip must record that the slot was skipped");
  assert(skip[0].includes("scheduleAdvanceAfterTrigger(id, s, map, true)"), "a mode skip must consume the slot so catch-up does not run it");
  assert(!skip[0].includes("scheduleAdvanceAfterTrigger(id, s, map, false)"), "a mode skip must not leave the slot looking missed");
}
{
  const clean = src.match(/def cleanupSchedules\(\)[\s\S]*?\n\/\/ --- endpoints/);
  assert(clean, "cleanupSchedules block parseable");
  assert(/if \(changed \|\| needsArm\) rebuildScheduledJobs\(\)/.test(clean[0]), "cleanup rebuilds after a drop or a late catch-up");
  assert(!/if \(changed\) saveSchedulesMap\(map\)\s+rebuildScheduledJobs\(\)/.test(clean[0]), "cleanup must not rebuild unconditionally");
  assert(clean[0].includes("scheduleRecentSunMs"), "cleanup must catch up a recent sunrise or sunset");
  assert(clean[0].includes("onceScheduleDisposition"), "cleanup must use the one-time catch-up window");
  assert(clean[0].includes('how == "drop" && s?.enabled == true'), "cleanup drops an expired one-time schedule only when it is enabled");
  assert(clean[0].includes('how == "catchup" && s?.enabled == true'), "paused one-time schedules stay through the catch-up window");
}
assert(src.includes("def onceScheduleDisposition("), "one-time arming must classify future, catch-up, and drop");
assert(src.includes("return 10L * 60L * 1000L"), "one-time catch-up window is 10 minutes");
assert(src.includes("def scheduleRecentSunMs("), "sunrise and sunset use the same catch-up window");
assert(/how == "catchup"[\s\S]*nowMs \+ 2000L/.test(src), "a late one-time schedule is armed a couple of seconds ahead");
assert(/how == "drop"[\s\S]{0,160}one-time schedule must be in the future/.test(src), "enabling an expired one-time schedule must fail like save");
assert(src.includes("thermostatSettingError(ac, thermostatTempUnit(dev))"), "save must reject setpoints outside that thermostat's dial");
assert(src.includes('schedule("0 1 0 * * ?", "schedulerMidnightRearm")'), "midnight re-arm must run at 00:01");
assert(!src.includes('schedule("0 0 0 * * ?", "schedulerMidnightRearm")'), "midnight re-arm must not run at 00:00");
assert(src.includes("parseSchedulesMapResult"), "must distinguish empty vs corrupt schedule store");
assert(src.includes("schedule store unreadable"), "must fail closed on corrupt schedule JSON");
assert(src.includes("hubTimeZone"), "must expose hub timezone to the client");
assert(src.includes("def hubTimeZoneId("), "must read location.timeZone ID");
assert(src.includes("mode trigger cannot set the same hub mode"), "must reject mode self-loops");
assert(src.includes("mode schedules form a hub-mode loop"), "must reject mode-action cycles");
assert(src.includes("def captureScheduleActionResult("), "must record action result metadata");
assert(src.includes("lastResult"), "must persist lastResult for the client");
assert(src.includes("fmt.setLenient(false)"), "one-time parser must reject impossible calendar dates");
assert(src.includes("schedulerModeCascadeTransitions"), "mode cascade guard must survive asynchronous mode events");
assert(!src.includes("schedulerModeDepth"), "transient mode depth guard must be gone");
assert(/schedulerModeChanged[\s\S]*schedulesModeCycleError\(map\)/.test(src), "runtime mode handler must reject stored cycles");
assert(src.includes("def schedulerSunRetry("), "failed sun re-arms must have a targeted retry");
assert(src.includes('unschedule("schedulerSunRetry")'), "scheduler shutdown must clear targeted sun retries");
assert(/runScheduleThermostatAction[\s\S]*?if \(runThermostatSetting\(dev, action\)\) result\.succeeded\+\+\s*else result\.failed/.test(src), "thermostat command failures must affect lastResult");
assert(/def runThermostatSetting[\s\S]*?return !deviceFailed/.test(src), "runThermostatSetting must report command failures");
assert(src.includes("def scheduleThermostatIds("), "must normalize scalar or list thermostat ids");
assert(/def scheduleBoolIs[\s\S]*instanceof Boolean/.test(src), "lock unlock must require a real boolean, not Groovy's 0 == false");
assert(src.includes("locked: !scheduleBoolIs(st?.locked, false)"), "normalize must unlock only for boolean false");
assert(src.includes("def unlock = scheduleBoolIs(st?.locked, false)"), "run must unlock only for boolean false");
assert(src.includes("ac.devices = scheduleThermostatIds(body?.action?.devices)"), "save must persist normalized thermostat ids");
assert(/runScheduleThermostatAction[\s\S]*scheduleThermostatIds\(action\?\.devices\)/.test(src), "run must use normalized thermostat ids");
assert(/setThermostatFanModeCmd[\s\S]*tstatHasComfortFanSpeed[\s\S]*return dispatched/.test(src), "fan dispatch accounting must support comfort-only thermostats");
assert(/setThermostatFanModeCmd\(dev, fanMode\) != true/.test(src), "scheduler must reject fan requests that dispatch no command");
assert(/runScheduleThermostatAction[\s\S]*?runThermostatSetting\(dev, action\)/.test(src), "schedule run must send each thermostat through runThermostatSetting");
assert(/def runThermostatSetting\(dev, raw\) \{\s*def setting = thermostatSettingNormalized\(raw\)/.test(src), "runThermostatSetting must skip setpoints the mode does not use");
assert(/def runThermostatSetting[\s\S]*?if \(fanMode && !tstatSupportsFanMode\(dev\)\)[\s\S]*?fanMode = null/.test(src), "thermostats without fan modes must skip the fan step instead of failing");
assert(src.includes("ac.putAll(thermostatSettingNormalized(body?.action))"), "save must store only the fields the thermostat mode uses");
assert(/target == "thermostats"\) \{[\s\S]{0,200}thermostatSettingError\(ac\)/.test(src), "save must reject missing or reversed thermostat setpoints");
assert(!/setColorTemperature\(k\)\s*\}\s*catch/.test(src), "CT failures must not be swallowed");
assert(/def schedulesTest[\s\S]*\[ok: ok, lastResult: lastResult\]/.test(src), "test endpoint success must reflect action outcome");
{
  const fmt = src.match(/def formatSchedDateTimeLocal[\s\S]*?\ndef scheduleSummary/);
  assert(fmt && fmt[0].includes("setTimeZone(tz)"), "one-time summary formatter must use hub timezone");
}

const js = readFileSync(join(root, "src/app.js"), "utf8");
assert(js.includes("function schedEnsureStateList("), "editor must keep a one-device state object");
assert(js.includes("schedEnsureStateList(schedDraft.action)"), "open and save must coerce an unwrapped state");
assert(js.includes("schedulesLoadState"), "UI must track schedule load state");
assert(js.includes("schedulesCloudOmitted"), "UI must refetch when cloud /data omits schedules");
assert(!js.includes("schedulesLoadedFromHub"), "removed leftover schedulesLoadedFromHub global");
assert(js.includes('ensureSchedulesLoaded({ force: true })'), "opening scheduler must force refresh");
assert(js.includes("Couldn\\u2019t load schedules") || js.includes("Couldn’t load schedules"), "failed fetch must not look empty");
assert(js.includes("Run actions now"), "test button must say it runs actions now");
assert(js.includes("schedParseTime24(tr.time"), "clock step must use schedParseTime24");
assert(js.includes("schedSaveInFlight"), "save must guard against double submit");
assert(js.includes("schedulesRefreshEpoch"), "stale schedule refreshes must be rejected");
assert((js.match(/schedulesRefreshEpoch\+\+/g) || []).length >= 2, "mutations must invalidate polls at start and completion");
assert(js.includes("schedulesMutationChain"), "schedule mutations must be serialized");
assert(js.includes("schedRowInFlight"), "row actions must survive poll-driven rerenders");
assert(js.includes("schedulerResponseEpoch"), "data polls must carry scheduler response ordering");
assert(/retainPost3PendingData[\s\S]*applySchedulesFromDataSafe\(d, requestEpoch\)/.test(js), "scheduler metadata must apply on every data poll");
assert(js.includes("applySchedulesFromData failed"), "scheduler apply must not throw out of boot/poll");
assert(/schedSaveInFlight[\s\S]*f\.disabled = true/.test(js), "Create/Save must visibly disable while pending");
assert(js.includes("res?.lastResult?.ok !== false"), "Run actions now must inspect action outcome");
assert(js.includes("hubTimeZone"), "UI must consume hub timezone");
assert(js.includes("Times use hub time"), "clock/once pickers must label hub time when TZ differs");
assert(js.includes("applySchedulesResponse"), "mutations must apply returned schedules even on error");
assert(js.includes("schedLastResultNote"), "list must surface missing/failed action results");
assert(js.includes('lastResult?.skipped === "mode"'), "a mode skip must not look like the actions ran");
assert(js.includes("Hub mode was not allowed"), "a mode skip must say the hub mode was not allowed");
assert(js.includes("function schedIdList("), "Then line must normalize thermostat id lists");
assert(js.includes("schedActionDescription(s.action, { thermostats, locks, windowShades, ceilingFans })"), "Then line must resolve thermostat names");
assert(js.includes("new Set(schedIdList(schedDraft.action.devices))"), "thermostat picker must not iterate a string id");
{
  const start = js.indexOf("function renderSchedThermostatAction(");
  const body = js.slice(start, js.indexOf("function renderSchedHubModeAction(", start));
  assert(body.includes("schedTstatModeChoices(selected)"), "thermostat modes must come from the selected devices");
  assert(body.includes("schedTstatFanChoices(selected)") && body.includes("if (fanModes.length)"), "fan mode row must only show for thermostats that support it");
  assert(body.includes('renderSchedTstatSetpoint("Heat setpoint", "heat", unit)'), "setpoints must use the thermostat's own unit");
  assert(!/\u00b0F|\\u00b0F|"auto", "heat", "cool", "off"/.test(body), "thermostat step must not hardcode modes or Fahrenheit");
}
assert(/ac\.target === "thermostats"[\s\S]{0,300}thermostatSettingError\(ac\)/.test(js), "save must check thermostat setpoints before sending");
assert(js.includes("schedTstatRangeError(ac)"), "save must check each thermostat's dial range");
assert(/if \(!schedDraft\) renderSchedulerActive\(\)/.test(js), "poll refresh must not rebuild an open schedule editor");
assert(js.includes('bits.push("Fan " + fan)'), "Then line must show an explicit fan mode");
assert(!js.includes('fan.toLowerCase() !== "auto"'), "Fan auto must not be hidden on the Then line");
assert(/input\.addEventListener\("blur"[\s\S]{0,400}clampSetpoint\(/.test(js), "setpoint blur must snap into the dial range");
assert(/action: \{ target: "lights"[^}]*mode: null, heat: null, cool: null, fanMode: null \}/.test(js), "new drafts must not carry hidden thermostat defaults");
assert(js.includes("function ensurePost3Loaded"), "post3 must load through ensurePost3Loaded");
assert(js.includes("loadPost3AfterFirstRender"), "post3 must load after the first render");
{
  const index = readFileSync(join(root, "src/index.html"), "utf8");
  assert(/<head>[\s\S]*meta name="mld-post3"[\s\S]*<\/head>/.test(index), "index must advertise the post3 URL in head");
  assert(/<script[^>]+src="[^"]*app-post3\.js/.test(index), "index must parser-load app-post3.js after app-post2.js");
}

const build = readFileSync(join(root, "build.mjs"), "utf8");
assert(build.includes("existingRepository.packages"), "build must merge the shared HPM catalog");
assert(build.includes("HPM_REPO_PACKAGE_ID"), "build must keep the Modern Dashboard catalog entry");

console.log("ok source: scheduler Groovy invariants");
console.log("ok source: scheduler UI invariants");
console.log("ok source: shared HPM catalog preservation");
