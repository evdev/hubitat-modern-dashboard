import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const parent = readFileSync(join(root, "app/ModernLightsDashboard.groovy.template"), "utf8");
const groovy = readFileSync(join(root, "app/mDashSynagogue.groovy"), "utf8");
const build = readFileSync(join(root, "build.mjs"), "utf8");
const pre = readFileSync(join(root, "src/app-pre.js"), "utf8");
const uiDir = join(root, "src", "synagogue");
const ui = readdirSync(uiDir).filter((name) => name.endsWith(".js")).sort().map((name) => readFileSync(join(uiDir, name), "utf8")).join("\n");

function assert(ok, message) {
  if (!ok) {
    console.error("FAIL " + message);
    process.exit(1);
  }
}

assert(groovy.includes('name: "mDash Synagogue"'), "child app name is mDash Synagogue");
assert(!groovy.includes("Shabbat") || groovy.includes("shabbat"), "the app label must not be the holiday child");
assert(!/name: ".*Shabbat/.test(groovy) && !/name: ".*Holiday/.test(groovy), "definition name must not contain Shabbat or Holiday");
assert(parent.includes("synagogueFilePresent"), "parent detects the synagogue file");
assert(parent.includes("synagogueAvailable"), "parent reports synagogueAvailable");
assert(parent.includes('addChildApp("mDash", "mDash Synagogue", "Synagogue")'), "parent adds the synagogue child");
assert(parent.includes('"synagogue"'), "synagogue is a nav key");
assert(!parent.includes("mld-synagogue.js</code></li><li><code>mld-manifest"), "synagogue file stays off the required asset list");
assert(!build.includes('name: "mld-synagogue.js"') || build.includes("synagoguePackageManifest.json"), "synagogue file is its own package");
const assets = build.slice(build.indexOf("const FILE_MANAGER_ASSETS = ["), build.indexOf("];", build.indexOf("const FILE_MANAGER_ASSETS = [")));
assert(!assets.includes("mld-synagogue.js"), "main asset list must not require mld-synagogue.js");
assert(ui.includes("globalThis.mldSynagogue"), "tab exports a mount");
assert(ui.includes("Use Shabbat for all Yom Tov"), "days menu can apply Shabbat to Yom Tov");
assert(ui.includes("Skip this one"), "agenda can skip one occurrence");
assert(ui.includes("Calendars"), "tab has a calendars section");
assert(pre.includes("qnSyn"), "synagogue tab icon is its own picture");
assert(build.includes('readdirSync(dir)'), "synagogue scripts are bundled from src/synagogue");
assert(groovy.includes("webcal://"), "webcal links are accepted");
assert(groovy.includes("synagogueMaskSecret"), "calendar links are masked");
console.log("synagogue source ok");
