import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appPath = join(root, "src", "app.js");
const prePath = join(root, "src", "app-pre.js");
const splitMarker = "// __MLD_SPLIT_CORE__";

const exposedFunctions = [
  "loadHapticsPref", "saveHapticsPref", "loadNotifSoundPref", "saveNotifSoundPref",
  "loadNotifSnoozeMap", "saveNotifSnoozeMap", "loadThemePref", "saveThemePref",
  "loadTabsPref", "saveTabsPref", "loadDrawerPref", "saveDrawerPref",
  "loadCamerasColsPref", "saveCamerasColsPref", "loadSensorsFlatPref", "saveSensorsFlatPref",
  "validateHttpsEmbedUrl", "hostnameFromHttpsUrl", "normalizeEmbedTitle", "normalizeHtmlTileTitle",
  "applyHtmlTitleOverridesFromConfig", "htmlTitleOverridesForLayout", "applyHtmlCatalogFromData",
  "applyEmbedConfigFromData",
  "parseEmbedInput", "isSameOriginEmbedUrl", "deviceFavoriteKey", "embedFavoriteKey",
  "timeFavoriteKey", "notificationFavoriteKey", "htmlFavoriteKey", "parseHtmlTileId",
  "normalizeTimeStyle", "normalizeTimeSize", "normalizeNotificationSize", "normalizeHtmlZoom",
  "favoriteEntryKey", "normalizeFavoritesLayout", "mapTimeCardsFromConfig",
  "mapNotificationCardsFromConfig", "loadFavoriteSizesCache", "saveFavoriteSizesCache",
  "primeFavoriteSizesFromConfig", "setLevelOptimistic", "effectiveLevel", "setSwitchOptimistic",
  "effectiveSwitch", "setLockOptimistic", "effectiveLockState", "effectiveLock", "lockIsMoving",
  "lockStatusLabel", "setGarageOptimistic", "effectiveGarageState", "garageIsOpen",
  "garageIsMoving", "garageStatusLabel", "setShadeOptimistic", "effectiveShadeState",
  "effectiveShadePosition", "applyShadeWsEvent", "shadeIsMoving", "shadeHasPosition",
  "shadeHasStop", "shadeStatusLabel", "setFanOptimistic", "effectiveFanOn", "effectiveFanSpeed",
  "ceilingFanSpeedLabel", "ceilingFanSpeeds", "ceilingFanSupportsSpeed",
  "intersectionCeilingFanSpeeds", "unionCeilingFanSpeeds", "averageShadePosition",
  "fanSpinDuration", "fanStatusLabel", "setValveOptimistic", "effectiveValveState",
  "valveIsMoving", "normalizeValveForCard", "isMusicPlaying", "musicControls",
  "effectiveMusicStatus", "effectiveMusicVolume", "musicStatusLabel", "setMusicOptimistic",
  "applyTstatSetpoints", "supportedModes", "tstatControlModes", "supportedFanModes",
  "deviceHasFanSpeed", "supportedFanSpeeds", "showFanSpeedControls", "deviceHasComfortFan",
  "deviceHasVane", "comfortFanSpeeds", "supportedVanePositions", "tstatChoiceLabel",
  "comfortFanValue", "fanModeActive", "tstatStateClass", "buildCentralTstat",
  "loadDashSession", "saveDashSession", "clearDashSession", "isDashSessionFresh",
  "withToken", "withOAuthToken", "getJson", "fetchData", "sendCmd", "sendCmdBatch", "replaceList",
];

export function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createAppHarness({ storage: initialStorage = {}, search = "" } = {}) {
  const values = new Map(Object.entries(initialStorage).map(([key, value]) => [key, String(value)]));
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
  const document = {
    visibilityState: "visible",
    getElementById() { return null; },
    addEventListener() {},
    querySelector() { return null; },
  };
  let nextTimer = 1;
  const timers = new Map();
  const sandbox = {
    console,
    document,
    localStorage,
    navigator: {},
    location: {
      href: "http://dashboard.local/index.html" + search,
      origin: "http://dashboard.local",
      protocol: "http:",
      search,
    },
    URL,
    URLSearchParams,
    AbortController,
    fetch: async () => { throw new Error("Unexpected fetch"); },
    setTimeout(fn) { const id = nextTimer++; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn) { const id = nextTimer++; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); },
    requestAnimationFrame(fn) { return sandbox.setTimeout(fn); },
    cancelAnimationFrame(id) { sandbox.clearTimeout(id); },
    __MLD: {},
    __APP_TEST__: {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);

  new vm.Script(readFileSync(prePath, "utf8"), { filename: prePath }).runInContext(context);

  const source = readFileSync(appPath, "utf8");
  const splitAt = source.indexOf(splitMarker);
  assert.notStrictEqual(splitAt, -1, "app.js core split marker must exist");
  const functions = exposedFunctions.join(", ");
  const instrumented = source.slice(0, splitAt) + `
  Object.assign(globalThis.__APP_TEST__, { ${functions},
    state: {
      cfg, devices, locks, garageDoors, windowShades, ceilingFans, valves, music, thermostats,
      favorites, favoriteSizes, embedCards, timeCards, notificationCards, htmlTiles,
      htmlTileTitleOverrides, favoritesLayout, levelOptimistic, switchOptimistic, lockOptimistic, garageOptimistic,
      shadeOptimistic, fanOptimistic, valveOptimistic, musicOptimistic, setpointOptimistic,
    },
  });
})();
`;
  new vm.Script(instrumented, { filename: appPath }).runInContext(context);

  return {
    api: context.__APP_TEST__,
    context,
    localStorage,
    timers,
    storage: values,
  };
}
