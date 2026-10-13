import assert from "node:assert/strict";
import test from "node:test";
import { createAppHarness, plain } from "./harness.mjs";

test("HTML tile catalog applies configured titles, sizes, zoom, and safe identifiers", () => {
  const { api } = createAppHarness();
  const changed = api.applyHtmlCatalogFromData({
    config: {
      favorites: [],
      favoritesLayout: ["h:7:status", "h:bad"],
      htmlSizes: { "7:status": "wide" },
      htmlZooms: { "h:7:status": 125 },
      htmlTitles: { "7:status": "Front Door" },
    },
    htmlTiles: [
      { id: "7:status", name: "Status", html: "<b>Locked</b>", roomsCss: ".tile{}" },
      { id: "7:status", name: "Duplicate", html: "ignored" },
      { id: "not-valid", name: "Invalid" },
    ],
  });

  assert.strictEqual(changed, true);
  assert.deepStrictEqual(plain(api.state.htmlTiles), [{
    id: "7:status",
    deviceId: 7,
    attribute: "status",
    liveTitle: "Duplicate",
    title: "Front Door",
    size: "wide",
    zoom: 125,
    html: "<b>Locked</b>",
    roomsCss: ".tile{}",
  }]);
  assert.deepStrictEqual(Array.from(api.state.favoritesLayout), ["h:7:status"]);
  assert.deepStrictEqual(plain(api.htmlTitleOverridesForLayout()), { "7:status": "Front Door" });
});

test("embed configuration drops invalid cards and normalizes all card types", () => {
  const { api } = createAppHarness();
  api.state.favorites.push(12);
  api.state.htmlTiles.push({ id: "7:status" });
  const changed = api.applyEmbedConfigFromData({
    config: {
      embedCards: [
        { id: "e_cam", title: "", url: "https://cam.example/live", size: "wide" },
        { id: "e_insecure", title: "Nope", url: "http://cam.example", size: "wide" },
        { id: "bad", title: "Nope", url: "https://cam.example", size: "wide" },
      ],
      timeCards: [{ id: "t_clock", style: "bad", size: "bad" }],
      notificationCards: [{ id: "n_alerts", size: "full" }],
      favoritesLayout: ["n:alerts", "e:cam", "t:clock", "d:12", "h:7:status"],
    },
  }, { allowDuringReorder: true });

  assert.strictEqual(changed, true);
  assert.deepStrictEqual(plain(api.state.embedCards), [{
    id: "e_cam", title: "cam.example", url: "https://cam.example/live", size: "wide",
  }]);
  assert.deepStrictEqual(plain(api.state.timeCards), [{ id: "t_clock", style: "time", size: "square" }]);
  assert.deepStrictEqual(plain(api.state.notificationCards), [{ id: "n_alerts", size: "full" }]);
  assert.deepStrictEqual(Array.from(api.state.favoritesLayout), [
    "n:alerts", "e:cam", "t:clock", "d:12", "h:7:status",
  ]);
});

test("fetchData applies dashboard configuration and invokes extension hooks", async () => {
  const { api, context } = createAppHarness({ search: "?access_token=abc" });
  const calls = [];
  context.__MLD.syncDashboardAuthState = (required) => calls.push(["auth", required]);
  context.__MLD.applyDashboardName = (name) => calls.push(["name", name]);
  context.__MLD.getDisplayNavOrder = () => ["favorites", "lights"];
  context.__MLD.applyNavOrder = (order) => calls.push(["nav", Array.from(order)]);
  context.__MLD.applySchedulesFromData = (data) => calls.push(["schedules", data.schedules.length]);
  context.fetch = async (url, options) => {
    calls.push(["fetch", url, options.cache, options.headers.Accept]);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        dashboardPasswordRequired: false,
        schedules: [{ id: "morning" }],
        htmlTiles: [],
        config: {
          pollIntervalMs: 9000,
          useWebSocket: true,
          dashboardName: "Home",
          defaultTab: "favorites",
          roomOrder: [2, 1],
          navOrder: ["favorites", "lights"],
          cameraOrder: [5],
          thermostatOrder: [8],
          localUrl: "http://hub.local/apps/api/1/",
          cloudUrl: "https://cloud.hubitat.com/api/1/",
          favorites: [12],
          favoriteSizes: { 12: "wide", 99: "square" },
          embedCards: [],
          timeCards: [],
          notificationCards: [],
          favoritesLayout: [],
        },
      }),
    };
  };

  const data = await api.fetchData();
  assert.strictEqual(data.config.dashboardName, "Home");
  assert.deepStrictEqual(plain(api.state.cfg), {
    ...plain(api.state.cfg),
    pollIntervalMs: 9000,
    useWebSocket: true,
    dashboardName: "mDash",
    defaultTab: "favorites",
    roomOrder: [2, 1],
    navOrder: ["favorites", "lights"],
    cameraOrder: [5],
    thermostatOrder: [8],
    localUrl: "http://hub.local/apps/api/1/",
    cloudUrl: "https://cloud.hubitat.com/api/1/",
  });
  assert.strictEqual(api.state.favoriteSizes[12], "wide");
  assert.strictEqual(api.state.favoriteSizes[99], undefined);
  assert.deepStrictEqual(calls, [
    ["fetch", "data?access_token=abc", "no-store", "application/json"],
    ["auth", false],
    ["name", "Home"],
    ["nav", ["favorites", "lights"]],
    ["schedules", 1],
  ]);
});

test("getJson classifies timeout, HTTP, and invalid JSON failures", async () => {
  const { api, context } = createAppHarness();

  context.fetch = async () => { const error = new Error("aborted"); error.name = "AbortError"; throw error; };
  await assert.rejects(api.getJson("data"), (error) => error.code === "timeout");

  context.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(api.getJson("data"), (error) => error.status === 503);

  context.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad"); } });
  await assert.rejects(api.getJson("data"), (error) => error.code === "bad_json");
});
