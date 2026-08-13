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
assert(/failReason && s\.enabled == true/.test(src), "must reject save/toggle when registration fails");

// Day-name parsing for weekly nextFire
assert(src.includes("cronParseDayOrInt"), "must parse Quartz day names for nextFire");
assert(/SUN:\s*1,\s*MON:\s*2/.test(src), "must map SUN–SAT to Quartz 1–7");

assert(src.includes('log.info "Modern Dashboard: schedule ran —'), "must log schedule runs at info");
assert(src.includes('log.info "Modern Dashboard: schedule skipped —'), "must log mode skips at info");
assert(src.includes('log.info "Modern Dashboard: schedule test —'), "must log schedule tests at info");

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

console.log("ok source: scheduler Groovy invariants");
