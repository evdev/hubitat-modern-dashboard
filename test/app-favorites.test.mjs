import assert from "node:assert/strict";
import test from "node:test";
import { createAppHarness, plain } from "./harness.mjs";

test("embed URLs accept only absolute HTTPS values", () => {
  const { api } = createAppHarness();
  assert.strictEqual(api.validateHttpsEmbedUrl(" https://Example.com/view?q=1 "), "https://Example.com/view?q=1");
  for (const value of ["", "http://example.com", "//example.com", "/relative", "javascript:alert(1)", "https://bad.example/\nnext"]) {
    assert.strictEqual(api.validateHttpsEmbedUrl(value), null, value);
  }
  assert.deepStrictEqual(plain(api.parseEmbedInput("https://cams.example/live")), {
    ok: true,
    url: "https://cams.example/live",
  });
  assert.match(api.parseEmbedInput("<script src='x'></script>").error, /Script embeds are not supported/);
  assert.strictEqual(api.isSameOriginEmbedUrl("http://dashboard.local/tiles"), true);
  assert.strictEqual(api.isSameOriginEmbedUrl("https://dashboard.local/tiles"), false);
});

test("embed and HTML titles are cleaned, truncated, and given useful fallbacks", () => {
  const { api } = createAppHarness();
  assert.strictEqual(api.normalizeEmbedTitle("  Kitchen\u0000 Camera  ", "https://fallback.example/x"), "Kitchen  Camera");
  assert.strictEqual(api.normalizeEmbedTitle("", "https://fallback.example/x"), "fallback.example");
  assert.strictEqual(api.normalizeHtmlTileTitle("", "temperature"), "temperature");
  assert.strictEqual(api.normalizeHtmlTileTitle("", ""), "HTML");
  assert.strictEqual(api.normalizeEmbedTitle("x".repeat(100), "https://x.example").length, 80);
});

test("favorite identifiers normalize legacy prefixes and validate HTML tile IDs", () => {
  const { api } = createAppHarness();
  assert.strictEqual(api.deviceFavoriteKey("42"), "d:42");
  assert.strictEqual(api.embedFavoriteKey("e_weather"), "e:weather");
  assert.strictEqual(api.timeFavoriteKey("t_clock"), "t:clock");
  assert.strictEqual(api.notificationFavoriteKey("n_alerts"), "n:alerts");
  assert.strictEqual(api.htmlFavoriteKey("12:temperature"), "h:12:temperature");
  assert.deepStrictEqual(plain(api.parseHtmlTileId("12:current.value")), {
    id: "12:current.value",
    deviceId: 12,
    attribute: "current.value",
  });
  assert.strictEqual(api.parseHtmlTileId("abc:value"), null);
  assert.strictEqual(api.parseHtmlTileId("12:bad value"), null);
});

test("favorite layouts retain valid unique entries and append missing configured cards", () => {
  const { api } = createAppHarness();
  const layout = api.normalizeFavoritesLayout(
    ["d:2", "e_weather", "e:e_weather", "t_clock", "n:alerts", "h:7:html", "d:999", "bad"],
    [1, 2],
    [{ id: "e_weather" }, { id: "e_cam" }],
    [{ id: "t_clock" }],
    [{ id: "n_alerts" }],
    [{ id: "7:html" }],
  );
  assert.deepStrictEqual(Array.from(layout), [
    "d:2", "e:weather", "t:clock", "n:alerts", "h:7:html", "d:1", "e:cam",
  ]);
});

test("time and notification cards use safe style and size defaults", () => {
  const { api } = createAppHarness();
  assert.deepStrictEqual(plain(api.mapTimeCardsFromConfig([
    { id: "t_clock", style: "time_seconds", size: "wide" },
    { id: "t_bad", style: "unknown", size: "unknown" },
    { id: "wrong", style: "time" },
  ])), [
    { id: "t_clock", style: "time_seconds", size: "wide" },
    { id: "t_bad", style: "time", size: "square" },
  ]);
  assert.deepStrictEqual(plain(api.mapNotificationCardsFromConfig([
    { id: "n_alerts", size: "full" },
    { id: "n_bad", size: "tiny" },
  ])), [
    { id: "n_alerts", size: "full" },
    { id: "n_bad", size: "tall" },
  ]);
  assert.strictEqual(api.normalizeHtmlZoom(125), 125);
  assert.strictEqual(api.normalizeHtmlZoom(110), 100);
});
