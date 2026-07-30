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

console.log("ok source: scheduler Groovy invariants");
