import assert from "node:assert/strict";
import test from "node:test";
import {
  scheduleCronForTrigger,
  cronNextFire,
  cronFieldValues,
  modeCycleError,
  parseLocalDateTimeMs,
  dueScheduleIds,
  nextDispatcherAt,
  scheduleSunNextFire,
  validateSchedulePayload,
} from "../lib/scheduler-core.mjs";

test("generates daily and weekly Quartz cron expressions", () => {
  assert.equal(scheduleCronForTrigger("daily", "19:30", []), "0 30 19 * * ? *");
  assert.equal(scheduleCronForTrigger("weekly", "08:00", ["MON", "WED"]), "0 0 8 ? * MON,WED *");
  assert.equal(scheduleCronForTrigger("daily", "25:00", []), null);
  assert.equal(scheduleCronForTrigger("weekly", "08:00", []), null);

  const days = cronFieldValues("MON,WED", 1, 7);
  assert.ok(days.has(2));
  assert.ok(days.has(4));
  assert.ok(!days.has(1));
});

test("calculates future cron occurrences and validates local dates", () => {
  const from = new Date();
  from.setHours(7, 0, 0, 0);
  const weekly = scheduleCronForTrigger("weekly", "08:00", ["MON", "WED"]);
  const next = cronNextFire(weekly, from.getTime() - 1000);
  assert.ok(next != null && next > from.getTime() - 1000);

  const onFire = new Date();
  onFire.setHours(8, 0, 0, 0);
  while (onFire.getDay() !== 1) onFire.setDate(onFire.getDate() + 1);
  const after = cronNextFire("0 0 8 ? * MON *", onFire.getTime());
  assert.ok(after != null && after > onFire.getTime(), "matching minute advances to a future occurrence");

  assert.ok(Number.isNaN(parseLocalDateTimeMs("2026-02-31T10:00")));
  assert.ok(Number.isFinite(parseLocalDateTimeMs("2028-02-29T10:00")));
});

test("orders due schedules and chooses the next dispatcher time", () => {
  const at = Date.now();
  const schedules = {
    "sun-b": { enabled: true, nextFire: at },
    "sun-a": { enabled: true, nextFire: at },
    early: { enabled: true, nextFire: at + 500 },
    recovered: { enabled: true, nextFire: at - 5 * 60 * 1000 },
    stale: { enabled: true, nextFire: at - 11 * 60 * 1000 },
    paused: { enabled: false, nextFire: at },
  };

  assert.deepEqual(dueScheduleIds(schedules, at), ["recovered", "sun-a", "sun-b"]);
  assert.equal(nextDispatcherAt(schedules, at), at + 1000);
  assert.equal(nextDispatcherAt({}, at), null);
});

test("handles sun offsets that cross midnight", () => {
  const midnight = new Date(2026, 8, 15, 0, 0, 0, 0);
  const next = scheduleSunNextFire(
    { kind: "daily", when: "sunset", offsetMin: 420 },
    "sunset",
    midnight.getTime(),
    (_which, offsetMin, day) => {
      const sunset = new Date(day);
      sunset.setHours(18, 0, 0, 0);
      return sunset.getTime() + offsetMin * 60 * 1000;
    },
  );
  const expected = new Date(2026, 8, 15, 1, 0, 0, 0).getTime();
  assert.equal(next, expected);
});

test("rejects an enabled one-time schedule in the past", () => {
  const stale = {
    enabled: true,
    trigger: { kind: "once", at: "2020-01-01T00:00" },
    action: { target: "lights", states: [{ id: 1, on: true }] },
  };
  assert.equal(validateSchedulePayload(stale, Date.now()), "one-time schedule must be in the future");
});

test("rejects hub-mode self-loops and cycles while allowing device cascades", () => {
  assert.equal(
    modeCycleError([
      { id: "a", enabled: true, trigger: { kind: "mode", mode: "Day" }, action: { target: "hubMode", mode: "Day" } },
    ]),
    "mode trigger cannot set the same hub mode",
  );
  assert.equal(
    modeCycleError([
      { id: "a", enabled: true, trigger: { kind: "mode", mode: "Day" }, action: { target: "hubMode", mode: "Evening" } },
      { id: "b", enabled: true, trigger: { kind: "mode", mode: "Evening" }, action: { target: "hubMode", mode: "Day" } },
    ]),
    "mode schedules form a hub-mode loop",
  );
  assert.equal(
    modeCycleError([
      { id: "a", enabled: true, trigger: { kind: "mode", mode: "Day" }, action: { target: "hubMode", mode: "Evening" } },
      { id: "b", enabled: true, trigger: { kind: "mode", mode: "Evening" }, action: { target: "lights", states: [{ id: 1, on: false }] } },
    ]),
    null,
  );
});
