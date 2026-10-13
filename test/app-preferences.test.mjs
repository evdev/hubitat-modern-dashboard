import assert from "node:assert/strict";
import test from "node:test";
import { createAppHarness, plain } from "./harness.mjs";

test("preference loaders use documented defaults and valid stored values", () => {
  const { api, localStorage } = createAppHarness();
  assert.strictEqual(api.loadHapticsPref(), true);
  assert.strictEqual(api.loadNotifSoundPref(), false);
  assert.strictEqual(api.loadThemePref(), "auto");
  assert.strictEqual(api.loadTabsPref(), true);
  assert.strictEqual(api.loadDrawerPref(), false);
  assert.strictEqual(api.loadCamerasColsPref(), 1);
  assert.strictEqual(api.loadSensorsFlatPref(), false);

  localStorage.setItem("mld_haptics", "0");
  localStorage.setItem("mld_notif_sound", "1");
  localStorage.setItem("mld_theme", "dark");
  localStorage.setItem("mld_tabs", "0");
  localStorage.setItem("mld_drawer", "1");
  localStorage.setItem("mld_cameras_cols", "3");
  localStorage.setItem("mld_sensors_flat", "1");
  assert.strictEqual(api.loadHapticsPref(), false);
  assert.strictEqual(api.loadNotifSoundPref(), true);
  assert.strictEqual(api.loadThemePref(), "dark");
  assert.strictEqual(api.loadTabsPref(), false);
  assert.strictEqual(api.loadDrawerPref(), true);
  assert.strictEqual(api.loadCamerasColsPref(), 3);
  assert.strictEqual(api.loadSensorsFlatPref(), true);
});

test("preference savers serialize booleans and structured snooze data", () => {
  const { api, storage } = createAppHarness();
  api.saveHapticsPref(false);
  api.saveNotifSoundPref(true);
  api.saveThemePref("light");
  api.saveTabsPref(false);
  api.saveDrawerPref(true);
  api.saveCamerasColsPref(2);
  api.saveSensorsFlatPref(true);
  api.saveNotifSnoozeMap({ alert: 123 });

  assert.strictEqual(storage.get("mld_haptics"), "0");
  assert.strictEqual(storage.get("mld_notif_sound"), "1");
  assert.strictEqual(storage.get("mld_theme"), "light");
  assert.strictEqual(storage.get("mld_tabs"), "0");
  assert.strictEqual(storage.get("mld_drawer"), "1");
  assert.strictEqual(storage.get("mld_cameras_cols"), "2");
  assert.strictEqual(storage.get("mld_sensors_flat"), "1");
  assert.deepStrictEqual(plain(api.loadNotifSnoozeMap()), { alert: 123 });
});

test("malformed preference JSON and favorite-size entries are ignored", () => {
  const { api, localStorage } = createAppHarness();
  localStorage.setItem("mld_notif_snooze", "{");
  assert.deepStrictEqual(plain(api.loadNotifSnoozeMap()), {});

  localStorage.setItem("mld_favorite_sizes", JSON.stringify({ 1: "wide", 2: "bogus", nope: "tall" }));
  assert.deepStrictEqual(plain(api.loadFavoriteSizesCache()), { 1: "wide" });
  api.saveFavoriteSizesCache({ 3: "square" });
  assert.deepStrictEqual(JSON.parse(localStorage.getItem("mld_favorite_sizes")), { 3: "square" });
  api.saveFavoriteSizesCache({});
  assert.strictEqual(localStorage.getItem("mld_favorite_sizes"), null);
});

test("dashboard sessions persist, expire, and contribute URL parameters", () => {
  const expiry = Date.now() + 60_000;
  const { api, storage } = createAppHarness({ search: "?access_token=cloud token" });
  api.saveDashSession("session/value", expiry);
  assert.strictEqual(storage.get("mld_dashSession"), "session/value");
  assert.strictEqual(api.isDashSessionFresh(), true);
  assert.strictEqual(
    api.withToken("data?x=1"),
    "data?x=1&access_token=cloud%20token&dash_session=session%2Fvalue",
  );
  assert.strictEqual(api.withOAuthToken("sw.js"), "sw.js?access_token=cloud%20token");
  api.clearDashSession();
  assert.strictEqual(api.isDashSessionFresh(), false);
  assert.strictEqual(storage.has("mld_dashSession"), false);
});
