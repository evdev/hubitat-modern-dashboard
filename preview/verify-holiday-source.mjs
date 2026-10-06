#!/usr/bin/env node
// The child app cannot run in Node. Check that its occasion table and rules match the JS core.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const groovy = readFileSync(join(root, "app/mDashHolidays.groovy"), "utf8");
const parent = readFileSync(join(root, "app/ModernLightsDashboard.groovy.template"), "utf8");
const build = readFileSync(join(root, "build.mjs"), "utf8");

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
  "HOLIDAY_API_VERSION 1",
]) {
  assert(groovy.includes(piece), `child app missing ${piece}`);
}

assert(parent.includes('path("/holidays")'), "parent must expose /holidays");
assert(parent.includes("def holidayRunAction"), "parent must run holiday device actions");
assert(parent.includes("holidayFilePresent"), "parent enables holidays when mld-holiday.js is present");
assert(parent.includes("holidaysAvailable"), "parent must report holidaysAvailable");
assert(!parent.includes('app(name: "mDashHolidays"'), "parent must not offer a child-app install button");
assert(!parent.includes("mld-holiday.js</code></li><li><code>mld-manifest"), "holiday file stays off the required twelve");
assert(build.includes('asset.name !== "mld-holiday.js"'), "Modern Dashboard package must not ship mld-holiday.js");
assert(build.includes("holidayPackageManifest.json"), "holiday file must be its own HPM package");

console.log("holiday source ok");
