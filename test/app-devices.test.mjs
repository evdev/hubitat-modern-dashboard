import assert from "node:assert/strict";
import test from "node:test";
import { createAppHarness, plain } from "./harness.mjs";

test("light optimistic state immediately drives effective switch and level values", () => {
  const { api } = createAppHarness();
  api.state.devices.push({ i: 10, s: 0, l: 15 });
  api.setSwitchOptimistic(10, true, 70);
  assert.strictEqual(api.effectiveSwitch(api.state.devices[0]), true);
  assert.strictEqual(api.effectiveLevel(api.state.devices[0]), 70);
  api.setLevelOptimistic(10, 42);
  assert.strictEqual(api.effectiveLevel(api.state.devices[0]), 42);
});

test("lock and garage state helpers characterize transitional labels", () => {
  const { api } = createAppHarness();
  const lock = { i: 1, lk: 1, st: "locked" };
  api.state.locks.push(lock);
  api.setLockOptimistic(1, false, "unlocking");
  assert.strictEqual(api.effectiveLock(lock), false);
  assert.strictEqual(api.lockIsMoving(lock), true);
  assert.strictEqual(api.lockStatusLabel(lock), "Unlocking…");

  const door = { i: 2, st: "closed" };
  api.state.garageDoors.push(door);
  api.setGarageOptimistic(2, { st: "opening" });
  assert.strictEqual(api.garageIsOpen(door), true);
  assert.strictEqual(api.garageIsMoving(door), true);
  assert.strictEqual(api.garageStatusLabel(door), "Opening…");
});

test("shade websocket events normalize position, switch, and motion states", () => {
  const { api } = createAppHarness();
  const shade = { i: 3, st: "closed", pos: 0, hasPos: true, hasStop: true };
  assert.strictEqual(api.applyShadeWsEvent(shade, "position", "55"), true);
  assert.deepStrictEqual(plain({ st: shade.st, pos: shade.pos }), { st: "partially open", pos: 55 });
  assert.strictEqual(api.shadeStatusLabel(shade), "55% · Partially open");
  assert.strictEqual(api.applyShadeWsEvent(shade, "switch", "off"), true);
  assert.strictEqual(api.effectiveShadeState(shade), "closed");
  assert.strictEqual(api.applyShadeWsEvent(shade, "unsupported", "x"), false);
  assert.strictEqual(api.shadeHasPosition(shade), true);
  assert.strictEqual(api.shadeHasStop(shade), true);
});

test("ceiling fan speeds are normalized, sorted, intersected, and unioned", () => {
  const { api } = createAppHarness();
  const named = { supSp: "high, low, medium" };
  const extended = { supSp: "low, medium-low, medium, high" };
  assert.deepStrictEqual(Array.from(api.ceilingFanSpeeds(named)), ["low", "medium", "high"]);
  assert.deepStrictEqual(Array.from(api.ceilingFanSpeeds({ supSp: "25,50,75" })), ["low", "medium-low", "medium"]);
  assert.deepStrictEqual(Array.from(api.intersectionCeilingFanSpeeds([named, extended])), ["low", "medium", "high"]);
  assert.deepStrictEqual(Array.from(api.unionCeilingFanSpeeds([named, extended])), ["low", "medium-low", "medium", "high"]);
  assert.strictEqual(api.ceilingFanSupportsSpeed(named, "medium"), true);
  assert.strictEqual(api.ceilingFanSupportsSpeed(named, "turbo"), false);
  assert.strictEqual(api.ceilingFanSpeedLabel("medium-high"), "Med-High");
});

test("fan, valve, shade, and music optimistic helpers expose user-facing state", () => {
  const { api } = createAppHarness();
  const fan = { i: 4, s: 0, sp: "low", supSp: "low,medium,high" };
  api.state.ceilingFans.push(fan);
  api.setFanOptimistic(4, { s: true, sp: "high" });
  assert.strictEqual(api.fanStatusLabel(fan), "High");

  const valve = { i: 5, n: "Water", r: 1, st: "closed" };
  api.state.valves.push(valve);
  api.setValveOptimistic(5, { st: "opening" });
  assert.strictEqual(api.valveIsMoving(valve), true);
  assert.deepStrictEqual(plain(api.normalizeValveForCard(valve)), {
    i: 5, n: "Water", r: 1, t: "valve", v: "opening", a: 0, ex: [], _ref: valve,
  });

  const music = { i: 6, st: "paused", v: 20, f: 35 };
  api.state.music.push(music);
  assert.deepStrictEqual(plain(api.musicControls(music)), {
    play: true, pause: true, stop: false, prev: false, next: false, volume: true, mute: false,
  });
  api.setMusicOptimistic(6, { st: "playing", v: 35 });
  assert.strictEqual(api.isMusicPlaying(api.effectiveMusicStatus(music)), true);
  assert.strictEqual(api.effectiveMusicVolume(music), 35);
  assert.strictEqual(api.musicStatusLabel(music), "Playing");
});

test("average shade position ignores devices without position support", () => {
  const { api } = createAppHarness();
  assert.strictEqual(api.averageShadePosition([]), 50);
  assert.strictEqual(api.averageShadePosition([
    { i: 1, hasPos: true, pos: 20 },
    { i: 2, hasPos: false, pos: 100 },
    { i: 3, hasPos: true, pos: 80 },
  ]), 50);
});
