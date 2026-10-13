import assert from "node:assert/strict";
import test from "node:test";
import { createAppHarness, plain } from "./harness.mjs";

test("thermostat capabilities parse supported modes, fan speeds, and vane positions", () => {
  const { api } = createAppHarness();
  const tstat = {
    supM: "heat,cool,auto,off",
    supFM: "auto,on,quiet",
    hasFs: true,
    fsLev: "low,medium,high",
    hasVp: true,
    vpLev: "auto,1,2",
    fm: "on",
  };
  assert.deepStrictEqual(Array.from(api.supportedModes(tstat)), ["heat", "cool", "auto", "off"]);
  assert.deepStrictEqual(Array.from(api.supportedFanModes(tstat)), ["auto", "on", "quiet"]);
  assert.deepStrictEqual(Array.from(api.supportedFanSpeeds(tstat)), ["low", "medium", "high"]);
  assert.deepStrictEqual(Array.from(api.supportedVanePositions(tstat)), ["auto", "1", "2"]);
  assert.strictEqual(api.showFanSpeedControls(tstat), true);
  assert.strictEqual(api.deviceHasComfortFan(tstat), true);
  assert.strictEqual(api.deviceHasVane(tstat), true);
  assert.strictEqual(api.tstatChoiceLabel([{ key: "quiet", label: "Quiet" }], "quiet"), "Quiet");
});

test("thermostat state colors prioritize mode and active operating state", () => {
  const { api } = createAppHarness();
  assert.strictEqual(api.tstatStateClass({ tm: "heat", os: "idle" }), "state-heat");
  assert.strictEqual(api.tstatStateClass({ tm: "cool", os: "idle" }), "state-cool");
  assert.strictEqual(api.tstatStateClass({ tm: "auto", os: "heating" }), "state-heat");
  assert.strictEqual(api.tstatStateClass({ tm: "auto", os: "cooling" }), "state-cool");
  assert.strictEqual(api.tstatStateClass({ tm: "off", hasFm: true, fm: "circulate" }), "state-fan");
  assert.strictEqual(api.tstatStateClass({ tm: "off", hasFm: true, fm: "auto" }), "state-off");
});

test("central thermostat combines the union of selected device capabilities", () => {
  const { api } = createAppHarness();
  const central = api.buildCentralTstat([
    { u: "F", supM: "heat,off", hasFm: true, supFM: "auto,on", hasFs: true, fsLev: "low,high" },
    { u: "F", supM: "cool,off", hasVp: true, vpLev: "auto,1" },
  ], "C");
  assert.strictEqual(central.u, "F");
  assert.deepStrictEqual(central.supM.split(","), ["heat", "off", "cool"]);
  assert.deepStrictEqual(central.fsLev.split(","), ["low", "high"]);
  assert.deepStrictEqual(central.vpLev.split(","), ["auto", "1"]);
  assert.strictEqual(central.hasFm, true);
  assert.strictEqual(central.hasVp, true);
  assert.strictEqual(central._central, true);
});

test("thermostat setpoint updates preserve in-flight optimistic values", () => {
  const { api } = createAppHarness();
  const tstat = { i: 8, hsp: 68, csp: 75 };
  api.state.thermostats.push(tstat);
  api.state.setpointOptimistic.set(8, { hsp: 70, csp: null, until: Date.now() + 60_000, timer: null });
  api.applyTstatSetpoints(tstat, { hsp: 68, csp: 74 });
  assert.deepStrictEqual(plain({ hsp: tstat.hsp, csp: tstat.csp }), { hsp: 70, csp: 74 });
  api.applyTstatSetpoints(tstat, { hsp: 70, csp: 74 });
  assert.strictEqual(api.state.setpointOptimistic.has(8), false);
});

test("single and batch commands encode requests and report partial failures", async () => {
  const { api, context } = createAppHarness({ search: "?access_token=token" });
  const requests = [];
  context.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.startsWith("cmd/batch")) {
      return { ok: true, status: 200, json: async () => ({ ok: false, failed: 1, total: 2 }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  assert.deepStrictEqual(plain(await api.sendCmd(10, "set level", "50 & up", "1234")), { ok: true });
  assert.strictEqual(requests[0].url, "cmd?id=10&c=set%20level&v=50%20%26%20up&pin=1234&access_token=token");

  const result = await api.sendCmdBatch([
    { id: 10, cmd: "on", val: null },
    { id: 11, cmd: "setLevel", val: 25 },
  ]);
  assert.deepStrictEqual(plain(result), { ok: false, failed: 1, total: 2 });
  assert.strictEqual(requests[1].url, "cmd/batch?access_token=token");
  assert.deepStrictEqual(JSON.parse(requests[1].options.body), {
    commands: [
      { id: 10, c: "on", v: null },
      { id: 11, c: "setLevel", v: 25 },
    ],
  });
});
