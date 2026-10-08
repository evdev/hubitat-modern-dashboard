#!/usr/bin/env node
// Holiday calendar, expansion, catch-up, and timeline rules.
// Run: node preview/verify-holidays.mjs

import {
  CATCH_UP_MS,
  addDays,
  buildDeviceTimeline,
  buildObservedDays,
  buildSpans,
  calendarQueryKey,
  cloneStates,
  conflictingSchedules,
  duplicateDeviceIds,
  expandSpan,
  expandUpcoming,
  formatHubTime,
  isListedNear,
  NEAR_LIST_DAYS,
  occasionForHdate,
  passedActionIds,
  planCatchUp,
  saveKeepsPending,
  preflight,
  resolveTemplate,
  sameMinuteWarnings,
  templateErrors,
  zonedMs,
  zonedParts,
} from "../lib/holiday-core.mjs";

const TZ = "America/New_York";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: ${a} !== ${b}`);
}

function candles(iso) {
  return { title: "Candle lighting", date: iso, category: "candles" };
}
function havdalah(iso) {
  return { title: "Havdalah", date: iso, category: "havdalah" };
}
function hol(date, hdate) {
  return { title: "Holiday", date, hdate, category: "holiday", yomtov: true };
}

const light = (id, on, extra = {}) => ({ id, kind: "light", on, ...extra });

function cfg(extra = {}) {
  return {
    settings: {
      holidayMode: "Shabbat",
      endMode: "Home",
      israel: false,
      doNotStartModes: ["Away"],
      candleMin: 18,
      havdalah: { type: "nightfall", minutes: 0 },
      startEarlyMin: 0,
      earlyFriday: { type: "off", value: "" },
      fridayOverrideDate: "",
      ...(extra.settings || {}),
    },
    templates: {
      shabbat: {
        start: { states: [light("dining", true), light("bed", false)], repeatLaterNights: false },
        night: [{ time: "23:00", states: [light("dining", false)] }],
        morning: [{ time: "08:00", states: [light("kitchen", true)] }],
        afternoon: [],
        evening: [{ time: "19:30", states: [light("porch", true)] }],
        end: { states: [], offStillOn: true },
        custom: [],
      },
      ...(extra.templates || {}),
    },
    occasions: {
      roshHashana: "shabbat",
      yomKippur: "shabbat",
      sukkot: "shabbat",
      shemini: "shabbat",
      pesachFirst: "shabbat",
      pesachLast: "shabbat",
      shavuot: "shabbat",
      ...(extra.occasions || {}),
    },
  };
}

// Real HebCal slice: Rosh Hashana 2026 begins on Shabbat.
const RH_2026 = [
  candles("2026-09-11T18:53:00-04:00"),
  hol("2026-09-12", "1 Tishrei 5787"),
  candles("2026-09-12T19:51:00-04:00"),
  hol("2026-09-13", "2 Tishrei 5787"),
  havdalah("2026-09-13T19:49:00-04:00"),
];

eq(occasionForHdate("1 Tishrei 5787"), "roshHashana", "tishrei 1");
eq(occasionForHdate("2 Tishrei 5787"), "roshHashana", "tishrei 2");
eq(occasionForHdate("10 Tishrei 5787"), "yomKippur", "yk");
eq(occasionForHdate("15 Nisan 5787"), "pesachFirst", "pesach 15");
eq(occasionForHdate("21 Nisan 5787"), "pesachLast", "pesach 21");
eq(occasionForHdate("6 Sivan 5787"), "shavuot", "shavuot");
eq(occasionForHdate("29 Elul 5786"), null, "erev is not an occasion");

{
  const days = buildObservedDays(RH_2026, TZ, cfg());
  eq(days.length, 2, "RH 2026 is two days, Saturday is not a separate Shabbat");
  eq(days[0].occasion, "roshHashana", "day 1 occasion");
  eq(days[1].occasion, "roshHashana", "day 2 occasion");
  eq(days[0].date, "2026-09-12", "RH daytime");
  const start = zonedParts(days[0].start, TZ);
  eq(start.date, "2026-09-11", "starts Friday evening");
  eq(start.hour, 18, "6pm hour");
  eq(start.minute, 53, "53");
  const mid = zonedParts(days[0].end, TZ);
  eq(mid.date, "2026-09-12", "day 1 ends Saturday night candles");
  eq(mid.hour, 19, "7pm");
  eq(mid.minute, 51, "51");
  const spans = buildSpans(days);
  eq(spans.length, 1, "one RH span");
  eq(spans[0].days.length, 2, "two days joined");
}

{
  const israel = [
    candles("2026-09-11T18:40:00-04:00"),
    hol("2026-09-12", "1 Tishrei 5787"),
    candles("2026-09-12T19:30:00-04:00"),
    hol("2026-09-13", "2 Tishrei 5787"),
    havdalah("2026-09-13T19:40:00-04:00"),
  ];
  const days = buildObservedDays(israel, TZ, cfg());
  eq(days.filter((d) => d.occasion === "roshHashana").length, 2, "Israel keeps two days of Rosh Hashana");
}

{
  // Thursday-Friday RH plus Shabbat.
  const items = [
    candles("2026-09-16T18:40:00-04:00"),
    hol("2026-09-17", "1 Tishrei 5787"),
    candles("2026-09-17T18:39:00-04:00"),
    hol("2026-09-18", "2 Tishrei 5787"),
    candles("2026-09-18T18:38:00-04:00"),
    havdalah("2026-09-19T19:30:00-04:00"),
  ];
  const fri = zonedParts(Date.parse("2026-09-18T18:38:00-04:00"), TZ);
  eq(fri.weekday, "Fri", "fixture Friday");
  const spans = buildSpans(buildObservedDays(items, TZ, cfg()));
  eq(spans.length, 1, "RH plus Shabbat is one span");
  eq(spans[0].days.length, 3, "three nights");
  eq(spans[0].days[2].occasion, "shabbat", "third day is Shabbat");
  const actions = expandSpan(spans[0], cfg(), TZ);
  const starts = actions.filter((a) => a.question === "start" && !a.skipped);
  eq(starts.length, 1, "start list does not repeat later nights by default");
  const modes = actions.filter((a) => a.kind === "modeEnter" || a.kind === "modeExit");
  eq(modes.length, 2, "one enter and one exit");
  assert(modes[0].at < modes[1].at, "enter before exit");
  const withRepeat = cfg({
    templates: {
      shabbat: {
        ...cfg().templates.shabbat,
        start: { states: [light("dining", true)], repeatLaterNights: true },
      },
    },
  });
  const starts2 = expandSpan(spans[0], withRepeat, TZ).filter((a) => a.question === "start" && !a.skipped);
  eq(starts2.length, 3, "opt-in repeats the start each night");
}

{
  // Shabbat then a skipped Sunday Yom Tov. Shabbat ends at Saturday-night candles.
  const items = [
    candles("2026-09-25T18:30:00-04:00"),
    candles("2026-09-26T19:20:00-04:00"),
    hol("2026-09-27", "10 Tishrei 5787"),
    havdalah("2026-09-27T19:25:00-04:00"),
  ];
  const sat = zonedParts(Date.parse("2026-09-26T12:00:00-04:00"), TZ);
  eq(sat.weekday, "Sat", "Sep 26 2026 is Saturday");
  const skipped = cfg({ occasions: { yomKippur: "skip" } });
  const days = buildObservedDays(items, TZ, skipped);
  eq(days.length, 1, "only Shabbat");
  eq(days[0].occasion, "shabbat", "shabbat");
  const end = zonedParts(days[0].end, TZ);
  eq(end.date, "2026-09-26", "ends Saturday night");
  eq(end.hour, 19, "at the Sunday-holiday candles");
  eq(end.minute, 20, "20");
}

{
  // Yom Kippur on Shabbat uses Yom Kippur.
  const items = [
    candles("2026-10-02T18:20:00-04:00"),
    hol("2026-10-03", "10 Tishrei 5788"),
    havdalah("2026-10-03T19:10:00-04:00"),
  ];
  const days = buildObservedDays(items, TZ, cfg({ occasions: { yomKippur: "own" }, templates: { yomKippur: cfg().templates.shabbat } }));
  eq(days.length, 1, "one day");
  eq(days[0].occasion, "yomKippur", "YK wins over Shabbat");
}

{
  // Plain Shabbat crossing Dec 31.
  const items = [
    candles("2027-01-01T16:30:00-05:00"),
    havdalah("2027-01-02T17:40:00-05:00"),
  ];
  const fri = zonedParts(Date.parse("2027-01-01T16:30:00-05:00"), TZ);
  eq(fri.weekday, "Fri", "Jan 1 2027 is Friday");
  const days = buildObservedDays(items, TZ, cfg());
  eq(days.length, 1, "one shabbat");
  eq(days[0].date, "2027-01-02", "Saturday civil date is the new year");
  const start = zonedParts(days[0].start, TZ);
  eq(start.date, "2027-01-01", "starts Dec... January Friday");
}

{
  const a = calendarQueryKey({ israel: false, candleMin: 18, havdalah: { type: "nightfall" } }, { lat: 1, lon: 2, tz: TZ });
  const b = calendarQueryKey({ israel: true, candleMin: 18, havdalah: { type: "nightfall" } }, { lat: 1, lon: 2, tz: TZ });
  assert(a !== b, "Israel flag changes the calendar query");
  const c = calendarQueryKey({ israel: false, candleMin: 18, havdalah: { type: "nightfall" } }, { lat: 3, lon: 2, tz: TZ });
  assert(a !== c, "location changes the calendar query");
}

{
  // Saturday 7:30pm is Saturday, not Friday. Night 00:30 is after midnight.
  // Summer 6pm night time is skipped. Evening after havdalah is skipped.
  const items = [
    candles("2026-06-05T19:30:00-04:00"),
    havdalah("2026-06-06T20:40:00-04:00"),
  ];
  const config = cfg({
    templates: {
      shabbat: {
        start: { states: [light("dining", true, { level: 60 }), light("bed", false), light("hall", true)], repeatLaterNights: false },
        night: [
          { time: "00:30", states: [light("dining", false)] },
          { time: "18:00", states: [light("late", false)] },
        ],
        morning: [],
        afternoon: [],
        evening: [{ time: "19:30", states: [light("porch", true)] }],
        end: { states: [light("path", true)], offStillOn: true },
        custom: [],
      },
    },
  });
  const span = buildSpans(buildObservedDays(items, TZ, config))[0];
  const actions = expandSpan(span, config, TZ);
  const nightOk = actions.find((a) => a.question === "night" && a.states[0]?.id === "dining");
  assert(nightOk && !nightOk.skipped, "after-midnight night time runs");
  eq(zonedParts(nightOk.at, TZ).date, "2026-06-06", "00:30 is Saturday");
  const nightSkip = actions.find((a) => a.states[0]?.id === "late");
  assert(nightSkip.skipped, "6pm night time more than 12h after a 7:30pm start is skipped");
  const eve = actions.find((a) => a.question === "evening");
  assert(!eve.skipped, "Saturday 7:30pm evening is inside this Shabbat");
  eq(zonedParts(eve.at, TZ).date, "2026-06-06", "evening is Saturday");
  eq(zonedParts(eve.at, TZ).weekday, "Sat", "weekday Saturday");
  const start = actions.find((a) => a.question === "start");
  assert(start.states.some((s) => s.id === "dining" && s.on) && start.states.some((s) => s.id === "bed" && !s.on), "start can turn one on and one off");
  const end = actions.find((a) => a.question === "end");
  assert(!end.states.some((s) => s.id === "hall"), "havdalah does not turn off lights that were left on");
  assert(end.states.some((s) => s.id === "path" && s.on), "havdalah can also turn a light on");
  assert(actions.find((a) => a.kind === "modeEnter").at <= start.at, "mode enter is not after the start actions");
  assert(actions.find((a) => a.kind === "modeExit").at >= end.at, "mode exit is not before the end actions");
}

{
  const items = [
    candles("2026-12-04T16:20:00-05:00"),
    havdalah("2026-12-05T17:15:00-05:00"),
  ];
  const config = cfg({
    templates: {
      shabbat: {
        ...cfg().templates.shabbat,
        evening: [{ time: "19:30", states: [light("porch", true)] }],
      },
    },
  });
  const span = buildSpans(buildObservedDays(items, TZ, config))[0];
  const eve = expandSpan(span, config, TZ).find((a) => a.question === "evening");
  assert(eve.skipped, "evening after havdalah is skipped");
}

{
  const base = cfg();
  const linked = resolveTemplate("roshHashana", base);
  assert(linked === base.templates.shabbat, "as-is uses the Shabbat template object");
  const copied = cfg({
    occasions: { roshHashana: "copy" },
    templates: { roshHashana: { ...cfg().templates.shabbat, start: { states: [light("seder", true)], repeatLaterNights: false } } },
  });
  const own = resolveTemplate("roshHashana", copied);
  assert(own !== copied.templates.shabbat, "copy does not follow later Shabbat edits");
  eq(own.start.states[0].id, "seder", "copy keeps its own lights");
  const pesach = cfg({
    occasions: { pesachFirst: "shabbat", pesachLast: "pesachFirst" },
  });
  assert(resolveTemplate("pesachLast", pesach) === pesach.templates.shabbat, "last days can reuse first days");
}

{
  const bad = cfg().templates.shabbat;
  bad.start = { states: [light("a", true), light("a", false)], repeatLaterNights: false };
  assert(templateErrors(bad).length === 1, "same device on and off at one time is rejected");
  assert(duplicateDeviceIds([light("a", true), light("b", false)]).length === 0, "different devices are fine");
}

{
  const items = [
    candles("2026-06-05T19:30:00-04:00"),
    havdalah("2026-06-06T20:40:00-04:00"),
  ];
  const config = cfg({ settings: { earlyFriday: { type: "time", value: "18:00" }, holidayMode: "Shabbat", endMode: "Home" } });
  const day = buildObservedDays(items, TZ, config)[0];
  eq(zonedParts(day.start, TZ).hour, 18, "early Friday used when earlier");
  const later = cfg({ settings: { earlyFriday: { type: "time", value: "21:00" }, holidayMode: "Shabbat", endMode: "Home" } });
  const day2 = buildObservedDays(items, TZ, later)[0];
  eq(zonedParts(day2.start, TZ).hour, 19, "early Friday ignored when it is later than candles");
  const override = cfg({
    settings: {
      earlyFriday: { type: "time", value: "18:00" },
      fridayOverrideDate: "2026-06-05",
      holidayMode: "Shabbat",
      endMode: "Home",
    },
  });
  const day3 = buildObservedDays(items, TZ, override)[0];
  eq(zonedParts(day3.start, TZ).minute, 30, "one-week regular time");
  const yom = buildObservedDays(RH_2026, TZ, config);
  eq(zonedParts(yom[0].start, TZ).minute, 53, "early Friday does not apply when Shabbat is Yom Tov");
}

{
  const items = [
    candles("2026-06-05T19:30:00-04:00"),
    havdalah("2026-06-06T20:40:00-04:00"),
  ];
  const config = cfg();
  const span = buildSpans(buildObservedDays(items, TZ, config))[0];
  const a = expandSpan(span, config, TZ);
  const shifted = [
    candles("2026-06-05T19:31:00-04:00"),
    havdalah("2026-06-06T20:41:00-04:00"),
  ];
  const span2 = buildSpans(buildObservedDays(shifted, TZ, config))[0];
  const b = expandSpan(span2, config, TZ);
  eq(a.find((x) => x.question === "start").id, b.find((x) => x.question === "start").id, "action id ignores a one-minute calendar shift");
}

{
  const now = Date.parse("2026-06-06T02:00:00-04:00");
  const actions = [
    { id: "start", at: now - 90 * 60000, kind: "devices", skipped: false, states: [light("dining", true), light("bed", false)] },
    { id: "night", at: now - 30 * 60000, kind: "devices", skipped: false, states: [light("dining", false)] },
    { id: "old", at: now - 3 * 60 * 60000, kind: "devices", skipped: false, states: [light("porch", true)] },
    { id: "done", at: now - 20 * 60000, kind: "devices", skipped: false, states: [light("kitchen", true)] },
    { id: "modeEnter", at: now - 90 * 60000, kind: "modeEnter", skipped: false, states: [] },
  ];
  const plan = planCatchUp({
    actions,
    now,
    doneIds: { done: 1 },
    currentMode: "Shabbat",
    holidayMode: "Shabbat",
    endMode: "Home",
    held: false,
    overridden: false,
    startRan: true,
    spanEnded: false,
  });
  const dining = plan.replay.find((s) => s.id === "dining");
  assert(dining && dining.on === false, "latest missed state is off");
  assert(!plan.replay.some((s) => s.id === "kitchen"), "already-run action is not replayed");
  assert(plan.markSkipped.includes("old"), "older than two hours is skipped");
  assert(!plan.replay.some((s) => s.id === "porch"), "old light is not replayed");
  eq(plan.setMode, null, "already in holiday mode");
  const missedStart = planCatchUp({
    actions,
    now,
    doneIds: {},
    currentMode: "Home",
    holidayMode: "Shabbat",
    endMode: "Home",
    held: false,
    overridden: false,
    startRan: true,
    spanEnded: false,
  });
  eq(missedStart.setMode, "Shabbat", "mode is corrected even though the start was more than... within window here");
  const oldStart = planCatchUp({
    actions: [{ id: "modeEnter", at: now - 5 * 60 * 60000, kind: "modeEnter", skipped: false, states: [] }],
    now,
    doneIds: {},
    currentMode: "Home",
    holidayMode: "Shabbat",
    endMode: "Home",
    held: false,
    overridden: false,
    startRan: true,
    spanEnded: false,
  });
  eq(oldStart.setMode, "Shabbat", "mode is corrected when the start was missed by more than two hours");
  const held = planCatchUp({
    actions,
    now,
    doneIds: {},
    currentMode: "Away",
    holidayMode: "Shabbat",
    endMode: "Home",
    held: true,
    overridden: false,
    startRan: false,
    spanEnded: false,
  });
  eq(held.setMode, null, "Away holds the span across catch-up");
  assert(held.replay.length === 0, "held span does not replay lights");
  assert(CATCH_UP_MS === 2 * 60 * 60 * 1000, "window is two hours");
}

{
  const now = Date.parse("2026-06-05T22:30:00-04:00");
  const ids = passedActionIds([
    { id: "past", at: now - 1000, skipped: false },
    { id: "future", at: now + 60000, skipped: false },
  ], now);
  assert(ids.includes("past") && !ids.includes("future"), "resume marks past actions done");
  const spanId = "span";
  const heldLight = { id: "held", kind: "devices", spanId, at: now - 3 * 60 * 60 * 1000, skipped: false };
  assert(saveKeepsPending(heldLight, now, { spanOpen: true, held: true, heldSpanId: spanId }), "a save keeps lights waiting on Do not start");
  const recent = { id: "recent", kind: "devices", spanId, at: now - 30 * 60 * 1000, skipped: false };
  assert(saveKeepsPending(recent, now, { spanOpen: true, held: false }), "a save keeps a scene inside the two-hour catch-up");
  const stale = { id: "stale", kind: "devices", spanId, at: now - 3 * 60 * 60 * 1000, skipped: false };
  assert(!saveKeepsPending(stale, now, { spanOpen: true, held: false }), "a save marks a scene older than the catch-up");
  const mode = { id: "mode", kind: "modeEnter", spanId, at: now - 3 * 60 * 60 * 1000, skipped: false };
  assert(saveKeepsPending(mode, now, { spanOpen: true, held: false }), "a save keeps a missed mode change while the span is open");
  assert(!saveKeepsPending(mode, now, { spanOpen: false, held: false }), "a missed mode change after the span is marked done");
  const future = { id: "future", kind: "devices", spanId, at: now + 60000, skipped: false };
  assert(!saveKeepsPending(future, now, { spanOpen: true, held: true, heldSpanId: spanId }), "a future action is not a pending past action");
}

{
  const span = {
    id: "2026-09-17+2026-09-18+2026-09-19",
    start: Date.parse("2026-09-16T18:40:00-04:00"),
    end: Date.parse("2026-09-19T19:30:00-04:00"),
  };
  const actions = [
    { spanId: span.id, kind: "devices", skipped: false, at: span.start, question: "start", states: [light("dining", true), light("bed", false)] },
    { spanId: span.id, kind: "devices", skipped: false, at: span.start + 5 * 3600000, question: "night", states: [light("bed", false)] },
    { spanId: span.id, kind: "devices", skipped: false, at: span.start + 36 * 3600000, question: "start", states: [light("dining", true)] },
  ];
  const dining = buildDeviceTimeline(span, actions, "dining");
  eq(dining.segments[0].state, "on", "dining on from the start");
  assert(dining.segments[dining.segments.length - 1].end === span.end, "bar runs to the end of a multi-day span");
  assert(dining.segments.every((s) => s.state === "on"), "dining stays on across the second night");
  const bed = buildDeviceTimeline(span, actions, "bed");
  eq(bed.segments[0].state, "off", "bed off on its own bar");
  const quiet = buildDeviceTimeline(span, [{ spanId: span.id, kind: "devices", skipped: false, at: span.start + 3600000, question: "morning", states: [light("kitchen", true)] }], "kitchen");
  eq(quiet.segments[0].state, "unchanged", "neutral until the first action");
  eq(quiet.segments[1].state, "on", "then on");
}

{
  const pf = preflight({ holidayMode: "Shabbat", endMode: "Shabbat" }, { lat: 1, lon: 2, tz: TZ }, ["Shabbat", "Home"]);
  assert(!pf.ok, "modes must differ");
  const ok = preflight({ holidayMode: "Shabbat", endMode: "Home" }, { lat: 1, lon: 2, tz: TZ }, ["Shabbat", "Home"]);
  assert(ok.ok, "preflight passes");
}

{
  const items = [
    candles("2026-06-05T19:30:00-04:00"),
    havdalah("2026-06-06T20:40:00-04:00"),
    candles("2026-06-12T19:35:00-04:00"),
    havdalah("2026-06-13T20:45:00-04:00"),
  ];
  const { spans, actions } = expandUpcoming(items, cfg(), TZ, Date.parse("2026-06-01T12:00:00-04:00"));
  assert(spans.length >= 2, "several Shabbatot");
  const later = expandUpcoming([
    candles("2026-06-05T19:30:00-04:00"),
    havdalah("2026-06-06T20:40:00-04:00"),
    candles("2026-07-20T19:10:00-04:00"),
    hol("2026-07-21", "10 Tishrei 5787"),
    havdalah("2026-07-21T20:20:00-04:00"),
  ], cfg(), TZ, Date.parse("2026-06-01T12:00:00-04:00"));
  assert(later.spans.some((s) => s.occasion === "shabbat"), "near shabbat stays on the list");
  assert(later.spans.some((s) => (s.days || []).some((d) => d.occasion === "yomKippur")), "a scheduled holiday shows even when it is more than two weeks away");
  eq(NEAR_LIST_DAYS, 14, "the first load is two weeks");
  const laterNow = Date.parse("2026-06-01T12:00:00-04:00");
  const farKippur = later.spans.find((s) => (s.days || []).some((d) => d.occasion === "yomKippur"));
  assert(farKippur && !isListedNear(farKippur.start, laterNow, TZ), "a holiday more than two weeks out waits for the later section");
  assert(later.spans.filter((s) => s.occasion === "shabbat").every((s) => isListedNear(s.start, laterNow, TZ)), "shabbat inside two weeks stays on the first load");
  const many = expandUpcoming([
    candles("2026-06-05T19:30:00-04:00"),
    havdalah("2026-06-06T20:40:00-04:00"),
    candles("2026-07-20T19:10:00-04:00"),
    hol("2026-07-21", "10 Tishrei 5787"),
    havdalah("2026-07-21T20:20:00-04:00"),
    candles("2026-08-10T19:10:00-04:00"),
    hol("2026-08-11", "6 Sivan 5787"),
    candles("2026-08-11T19:12:00-04:00"),
    hol("2026-08-12", "7 Sivan 5787"),
    havdalah("2026-08-12T20:20:00-04:00"),
  ], cfg(), TZ, Date.parse("2026-06-01T12:00:00-04:00"));
  assert(many.spans.some((s) => (s.days || []).some((d) => d.occasion === "yomKippur")), "yom kippur is listed");
  assert(many.spans.some((s) => (s.days || []).some((d) => d.occasion === "shavuot")), "shavuot is listed too");
  const hidden = expandUpcoming([
    candles("2026-06-05T19:30:00-04:00"),
    havdalah("2026-06-06T20:40:00-04:00"),
    candles("2026-07-20T19:10:00-04:00"),
    hol("2026-07-21", "10 Tishrei 5787"),
    havdalah("2026-07-21T20:20:00-04:00"),
  ], cfg({ occasions: { yomKippur: "skip" } }), TZ, Date.parse("2026-06-01T12:00:00-04:00"));
  assert(!hidden.spans.some((s) => (s.days || []).some((d) => d.occasion === "yomKippur")), "a holiday without a schedule stays off the list");
  const bars = spans.map((s) => buildDeviceTimeline(s, actions, "dining")).filter((t) => t.changes.length);
  assert(bars.length >= 2, "by-light view has a bar per occasion");
}

{
  const warns = sameMinuteWarnings([
    { kind: "devices", skipped: false, at: 60000, states: [light("a", true)] },
    { kind: "devices", skipped: false, at: 60000, states: [light("a", false)] },
  ]);
  eq(warns.length, 1, "same minute on and off warns");
}

{
  const cloned = cloneStates([
    { id: "s", kind: "blind", open: true, position: 40.4 },
    { id: "p", kind: "blind", open: false, position: 80 },
    { id: "f", kind: "fan", on: true, speed: "medium" },
    { id: "f2", kind: "fan", on: false, speed: "high" },
    { id: "l", kind: "lock", locked: false },
    { id: "t", kind: "thermostat", mode: "heat", heat: 68.6, cool: 74, fanMode: "auto" },
    { id: "g", kind: "garage", open: true },
    { id: "old", on: true },
  ]);
  const byId = Object.fromEntries(cloned.map((s) => [s.id, s]));
  assert(!byId.g, "unknown kinds are dropped");
  eq(byId.old.kind, "light", "a state with no kind stays a light");
  eq(byId.s.position, 40, "blind position is a whole percent");
  assert(byId.p.position == null, "a closed blind does not keep a position");
  assert(byId.f2.speed == null, "an off fan does not keep a speed");
  eq(byId.t.heat, 69, "thermostat heat is a whole degree");
  assert(byId.t.cool == null, "heat mode drops the cool setpoint");
  eq(duplicateDeviceIds([{ id: "a", kind: "blind", open: true }, { id: "a", kind: "blind", open: false }]).join(), "a", "two blind commands conflict");
  assert(duplicateDeviceIds([{ id: "a", kind: "fan", on: true, speed: "low" }, { id: "a", kind: "fan", on: true, speed: "low" }]).length === 0, "the same command twice is fine");
  const night = { night: [{ time: "23:00", states: [{ id: "a", kind: "lock", locked: true }, { id: "a", kind: "lock", locked: false }] }] };
  assert(templateErrors(night).some((e) => e.label === "night 1"), "conflicts are checked in every time slot");
  const reversed = { start: { states: [{ id: "t", kind: "thermostat", mode: "auto", heat: 74, cool: 70 }] } };
  assert(templateErrors(reversed).some((e) => e.error === "heat setpoint must be below cool setpoint"), "auto requires heat below cool");
  const warns = sameMinuteWarnings([
    { kind: "devices", skipped: false, at: 120000, states: [{ id: "d", kind: "blind", open: true, position: 40 }] },
    { kind: "devices", skipped: false, at: 120000, states: [{ id: "d", kind: "blind", open: false }] },
  ]);
  eq(warns.join(), "d", "same-minute blind commands warn");
  const span = { id: "s", start: 0, end: 10 };
  const actions = [
    { spanId: "s", kind: "devices", skipped: false, at: 1, states: [{ id: "b", kind: "blind", open: true, position: 40 }] },
    { spanId: "s", kind: "devices", skipped: false, at: 2, states: [{ id: "f", kind: "fan", on: false }] },
    { spanId: "s", kind: "devices", skipped: false, at: 3, states: [{ id: "l", kind: "lock", locked: false }] },
    { spanId: "s", kind: "devices", skipped: false, at: 4, states: [{ id: "t", kind: "thermostat", mode: "off" }] },
    { spanId: "s", kind: "devices", skipped: false, at: 5, states: [{ id: "h", kind: "thermostat", mode: "heat", heat: 68 }] },
  ];
  eq(buildDeviceTimeline(span, actions, "b").segments.at(-1).state, "on", "an open blind uses the on color");
  assert(buildDeviceTimeline(span, actions, "b").segments.at(-1).label.includes("40"), "blind timeline names the position");
  eq(buildDeviceTimeline(span, actions, "f").segments.at(-1).state, "off", "a fan off uses the off color");
  eq(buildDeviceTimeline(span, actions, "l").segments.at(-1).state, "on", "unlocked uses the on color");
  eq(buildDeviceTimeline(span, actions, "l").segments.at(-1).tone, "lock-open", "an unlocked door has its own section");
  eq(buildDeviceTimeline(span, actions, "l").segments.at(-1).caption, "Unlocked", "the lock section says Unlocked");
  const locked = buildDeviceTimeline(span, [
    { spanId: "s", kind: "devices", skipped: false, at: 3, states: [{ id: "l", kind: "lock", locked: true }] },
  ], "l");
  eq(locked.segments.at(-1).tone, "lock-shut", "a locked door has its own section");
  eq(locked.segments.at(-1).caption, "Locked", "the lock section says Locked");
  eq(locked.changes.map((c) => c.at).join(), "3", "a lock change keeps its time");
  eq(buildDeviceTimeline(span, actions, "t").segments.at(-1).state, "off", "thermostat off uses the off color");
  eq(buildDeviceTimeline(span, actions, "h").segments.at(-1).state, "on", "a heating thermostat uses the on color");
  eq(buildDeviceTimeline(span, actions, "h").segments.at(-1).tone, "heat", "heat uses the heat tone");
  eq(buildDeviceTimeline(span, actions, "h").segments.at(-1).heat, 68, "heat setpoint stays on the segment");
  const tstatSpan = { id: "ts", start: 0, end: 20 };
  const tstatActions = [
    { spanId: "ts", kind: "devices", skipped: false, at: 1, question: "start", states: [{ id: "t", kind: "thermostat", mode: "heat", heat: 72 }] },
    { spanId: "ts", kind: "devices", skipped: false, at: 5, question: "night", states: [{ id: "t", kind: "thermostat", mode: "auto", heat: 68, cool: 74 }] },
    { spanId: "ts", kind: "devices", skipped: false, at: 9, question: "morning", states: [{ id: "t", kind: "thermostat", mode: "cool", cool: 73 }] },
    { spanId: "ts", kind: "devices", skipped: false, at: 13, question: "afternoon", states: [{ id: "t", kind: "thermostat", mode: "fan", fanMode: "on" }] },
  ];
  const tstat = buildDeviceTimeline(tstatSpan, tstatActions, "t");
  eq(tstat.segments[0].tone, "unchanged", "thermostat is unchanged before the first setting");
  eq(tstat.segments[1].tone, "heat", "candle lighting is heat");
  eq(tstat.segments[1].heat, 72, "heat section keeps 72");
  eq(tstat.segments[2].tone, "auto", "night is auto");
  eq(tstat.segments[2].heat, 68, "auto keeps the heat setpoint");
  eq(tstat.segments[2].cool, 74, "auto keeps the cool setpoint");
  eq(tstat.segments[3].tone, "cool", "morning is cool");
  eq(tstat.segments[3].cool, 73, "cool section keeps 73");
  eq(tstat.segments[4].tone, "fan", "later is fan");
  assert(tstat.segments[4].heat == null && tstat.segments[4].cool == null, "fan has no setpoint");
  eq(tstat.changes.map((c) => c.at).join(), "1,5,9,13", "each thermostat change keeps its time");
  const cover = buildDeviceTimeline(span, actions, "b");
  eq(cover.segments.at(-1).tone, "blind-open", "an open blind has its own section");
  eq(cover.segments.at(-1).caption, "40%", "the blind section shows its position");
  eq(cover.changes.map((c) => c.at).join(), "1", "a blind change keeps its time");
  const fanBar = buildDeviceTimeline(span, [
    { spanId: "s", kind: "devices", skipped: false, at: 2, states: [{ id: "f", kind: "fan", on: true, speed: "low" }] },
    { spanId: "s", kind: "devices", skipped: false, at: 6, states: [{ id: "f", kind: "fan", on: true, speed: "high" }] },
    { spanId: "s", kind: "devices", skipped: false, at: 8, states: [{ id: "f", kind: "fan", on: false }] },
  ], "f");
  eq(fanBar.segments[1].tone, "fan-low", "low speed has its own tone");
  eq(fanBar.segments[1].caption, "Low", "low speed is labeled");
  eq(fanBar.segments[2].tone, "fan-high", "high speed has its own tone");
  eq(fanBar.segments[3].tone, "fan-off", "a stopped fan is off");
  eq(fanBar.changes.map((c) => c.at).join(), "2,6,8", "each fan change keeps its time");
  const now = 1_000_000;
  const catchUp = planCatchUp({
    actions: [
      { id: "blind", at: now - 1000, kind: "devices", skipped: false, states: [{ id: "b", kind: "blind", open: true, position: 40 }] },
      { id: "fan", at: now - 2000, kind: "devices", skipped: false, states: [{ id: "f", kind: "fan", on: true, speed: "high" }] },
      { id: "lock", at: now - 3000, kind: "devices", skipped: false, states: [{ id: "l", kind: "lock", locked: true }] },
      { id: "unlock", at: now - 4000, kind: "devices", skipped: false, states: [{ id: "u", kind: "lock", locked: false }] },
      { id: "tstat", at: now - 5000, kind: "devices", skipped: false, states: [{ id: "t", kind: "thermostat", mode: "cool", cool: 72 }] },
    ],
    now,
    doneIds: {},
    currentMode: "Shabbat",
    holidayMode: "Shabbat",
    endMode: "Home",
    held: false,
    overridden: false,
    startRan: true,
    spanEnded: false,
  });
  assert(catchUp.replay.some((s) => s.kind === "blind" && s.position === 40), "catch-up replays a blind position");
  assert(catchUp.replay.some((s) => s.kind === "fan" && s.speed === "high"), "catch-up replays a fan speed");
  assert(catchUp.replay.some((s) => s.kind === "lock" && s.locked === true), "catch-up replays a lock");
  assert(catchUp.replay.some((s) => s.kind === "thermostat" && s.mode === "cool"), "catch-up replays a thermostat mode");
  assert(!catchUp.replay.some((s) => s.locked === false), "catch-up never replays an unlock");
  assert(catchUp.markSkipped.includes("unlock"), "a missed unlock is marked skipped");
  const conflicts = conflictingSchedules([
    { id: "s", enabled: true, name: "Evening", trigger: { kind: "daily" }, action: { target: "thermostats", devices: [1005], mode: "heat", heat: 68 } },
  ], "Night");
  eq(conflicts[0].devices.join(), "1005", "thermostat schedules count as also controlling that thermostat");
}

assert(addDays("2026-12-31", 1) === "2027-01-01", "addDays crosses the year");
assert(zonedMs("2026-09-11", "18:53", TZ) === Date.parse("2026-09-11T18:53:00-04:00"), "zonedMs matches HebCal offset");
assert(formatHubTime(Date.parse("2026-09-11T18:53:00-04:00"), TZ, false).includes("53"), "format includes minutes");

console.log("holiday rules ok");
