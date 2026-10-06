// Shabbat and Yom Tov expansion. The Hubitat child app ports these rules.
// Preview and Node tests import this file directly.

export const HOLIDAY_API_VERSION = 1;
export const CATCH_UP_MS = 2 * 60 * 60 * 1000;
export const NIGHT_WINDOW_MS = 12 * 60 * 60 * 1000;
export const DONE_KEEP_MS = 4 * 24 * 60 * 60 * 1000;

export const OCCASIONS = [
  { id: "shabbat", label: "Shabbat" },
  { id: "roshHashana", label: "Rosh Hashana", month: "Tishrei", days: [1, 2] },
  { id: "yomKippur", label: "Yom Kippur", month: "Tishrei", days: [10] },
  { id: "sukkot", label: "Sukkot", month: "Tishrei", days: [15, 16] },
  { id: "shemini", label: "Shemini Atzeret / Simchat Torah", month: "Tishrei", days: [22, 23] },
  { id: "pesachFirst", label: "Pesach, first days", month: "Nisan", days: [15, 16] },
  { id: "pesachLast", label: "Pesach, last days", month: "Nisan", days: [21, 22] },
  { id: "shavuot", label: "Shavuot", month: "Sivan", days: [6, 7] },
];

const OCCASION_BY_ID = new Map(OCCASIONS.map((o) => [o.id, o]));

export function occasionLabel(id) {
  return OCCASION_BY_ID.get(id)?.label || id || "Holiday";
}

export function emptyTemplate() {
  return {
    start: { states: [], repeatLaterNights: false },
    night: [],
    morning: [],
    afternoon: [],
    evening: [],
    end: { states: [], offStillOn: true },
    custom: [],
  };
}

export function emptyConfig() {
  return {
    settings: {
      holidayMode: "",
      endMode: "",
      israel: false,
      doNotStartModes: [],
      candleMin: 18,
      havdalah: { type: "nightfall", minutes: 42 },
      startEarlyMin: 0,
      earlyFriday: { type: "off", value: "" },
      fridayOverrideDate: "",
      paused: false,
    },
    templates: { shabbat: emptyTemplate() },
    occasions: {},
  };
}

export function parseHdate(hdate) {
  const m = String(hdate || "").trim().match(/^(\d+)\s+([A-Za-z]+)\s+(\d+)/);
  if (!m) return null;
  return { day: Number(m[1]), month: m[2], year: Number(m[3]) };
}

export function occasionForHdate(hdate) {
  const p = parseHdate(hdate);
  if (!p) return null;
  for (const o of OCCASIONS) {
    if (!o.month) continue;
    if (o.month === p.month && o.days.includes(p.day)) return o.id;
  }
  return null;
}

export function calendarQueryKey(settings, location) {
  const s = settings || {};
  const loc = location || {};
  const hav = s.havdalah || {};
  return [
    s.israel ? "il" : "diaspora",
    String(s.candleMin ?? 18),
    String(hav.type || "nightfall"),
    String(hav.minutes ?? ""),
    String(loc.lat ?? ""),
    String(loc.lon ?? ""),
    String(loc.tz ?? ""),
  ].join("|");
}

export function zonedParts(ms, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const bag = {};
  for (const p of fmt.formatToParts(new Date(ms))) bag[p.type] = p.value;
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  const date = `${bag.year}-${bag.month}-${bag.day}`;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    date,
    weekday: bag.weekday,
  };
}

export function addDays(date, n) {
  const [y, m, d] = String(date).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

/** Milliseconds for a civil date and HH:mm in a time zone. */
export function zonedMs(date, hhmm, timeZone) {
  const [y, m, d] = String(date).split("-").map(Number);
  const [hh, mm] = String(hhmm || "00:00").split(":").map(Number);
  let utc = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
  for (let i = 0; i < 4; i++) {
    const p = zonedParts(utc, timeZone);
    const got = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
    const want = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
    const delta = want - got;
    if (delta === 0) break;
    utc += delta;
  }
  return utc;
}

function parseIsoMs(value) {
  const t = Date.parse(String(value || ""));
  return Number.isFinite(t) ? t : null;
}

function itemCategory(item) {
  return String(item?.category || "").toLowerCase();
}

export function parseHebcal(items, timeZone) {
  const boundaries = [];
  const holidays = [];
  for (const item of items || []) {
    const cat = itemCategory(item);
    if (cat === "candles" || cat === "havdalah") {
      const at = parseIsoMs(item.date);
      if (at == null) continue;
      boundaries.push({ at, kind: cat });
      continue;
    }
    if (cat !== "holiday") continue;
    const occasion = occasionForHdate(item.hdate);
    if (!occasion) continue;
    const date = String(item.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    holidays.push({ date, hdate: String(item.hdate), occasion, yomTov: item.yomtov === true });
  }
  boundaries.sort((a, b) => a.at - b.at);
  void timeZone;
  return { boundaries, holidays };
}

function latestCandlesBeforeNoon(boundaries, civilDate, timeZone) {
  const noon = zonedMs(civilDate, "12:00", timeZone);
  let best = null;
  for (const b of boundaries) {
    if (b.kind !== "candles") continue;
    if (b.at < noon && (best == null || b.at > best)) best = b.at;
  }
  return best;
}

function nextBoundaryAfter(boundaries, at) {
  for (const b of boundaries) {
    if (b.at > at) return b.at;
  }
  return null;
}

function cloneStates(states) {
  return (Array.isArray(states) ? states : []).map((s) => ({
    id: String(s?.id ?? ""),
    kind: s?.kind === "outlet" ? "outlet" : "light",
    on: s?.on === true,
    level: s?.level == null || s?.level === "" ? null : Number(s.level),
    ct: s?.ct == null || s?.ct === "" ? null : Number(s.ct),
  })).filter((s) => s.id);
}

export function duplicateDeviceIds(states) {
  const on = new Set();
  const off = new Set();
  for (const s of cloneStates(states)) {
    if (s.on) on.add(s.id);
    else off.add(s.id);
  }
  const both = [];
  for (const id of on) if (off.has(id)) both.push(id);
  return both;
}

export function templateErrors(template) {
  const t = template || emptyTemplate();
  const errors = [];
  const check = (label, states) => {
    const ids = duplicateDeviceIds(states);
    if (ids.length) errors.push({ label, ids });
  };
  check("start", t.start?.states);
  for (const bucket of ["night", "morning", "afternoon", "evening"]) {
    (t[bucket] || []).forEach((group, i) => check(`${bucket} ${i + 1}`, group?.states));
  }
  check("end", t.end?.states);
  (t.custom || []).forEach((c, i) => check(`custom ${i + 1}`, c?.states));
  return errors;
}

export function resolveTemplate(occasionId, config, seen = new Set()) {
  if (!occasionId || seen.has(occasionId)) return null;
  seen.add(occasionId);
  const occasions = config?.occasions || {};
  const templates = config?.templates || {};
  const choice = occasionId === "shabbat" ? "own" : (occasions[occasionId] || "skip");
  if (choice === "skip") return null;
  if (choice === "shabbat") return templates.shabbat || emptyTemplate();
  if (choice === "pesachFirst") return resolveTemplate("pesachFirst", config, seen);
  return templates[occasionId] || templates.shabbat || emptyTemplate();
}

export function templateBadge(occasionId, config) {
  if (occasionId === "shabbat") return "own schedule";
  const choice = config?.occasions?.[occasionId] || "skip";
  if (choice === "shabbat") return "uses Shabbat";
  if (choice === "copy") return "based on Shabbat";
  if (choice === "pesachFirst") return "uses Pesach first days";
  if (choice === "own") return "own schedule";
  return "skipped";
}

function earlyFridayMs(fridayDate, candlesAt, settings, timeZone) {
  const early = settings?.earlyFriday || { type: "off" };
  if (early.type === "off" || !early.type) return candlesAt;
  if (settings?.fridayOverrideDate && settings.fridayOverrideDate === fridayDate) return candlesAt;
  let at = null;
  if (early.type === "time" && early.value) at = zonedMs(fridayDate, early.value, timeZone);
  else if (early.type === "minutes") at = candlesAt - Number(early.value || 0) * 60000;
  if (at == null || !Number.isFinite(at)) return candlesAt;
  return at < candlesAt ? at : candlesAt;
}

/**
 * Observed Jewish days. Skipped holidays are omitted so a Saturday that is
 * also that holiday falls back to Shabbat. Shabbat is every Friday candle
 * lighting whose Saturday is not already a kept Yom Tov day.
 */
export function buildObservedDays(items, timeZone, config) {
  const { boundaries, holidays } = parseHebcal(items, timeZone);
  const settings = config?.settings || {};
  const yom = [];
  for (const h of holidays) {
    if (!resolveTemplate(h.occasion, config)) continue;
    const start = latestCandlesBeforeNoon(boundaries, h.date, timeZone);
    const end = start == null ? null : nextBoundaryAfter(boundaries, start);
    if (start == null || end == null) continue;
    yom.push({
      date: h.date,
      hdate: h.hdate,
      occasion: h.occasion,
      yomTov: true,
      start,
      end,
    });
  }
  const yomDates = new Set(yom.map((d) => d.date));
  const days = yom.slice();
  for (const b of boundaries) {
    if (b.kind !== "candles") continue;
    const parts = zonedParts(b.at, timeZone);
    if (parts.weekday !== "Fri") continue;
    const saturday = addDays(parts.date, 1);
    if (yomDates.has(saturday)) continue;
    const end = nextBoundaryAfter(boundaries, b.at);
    if (end == null) continue;
    const fridayIsYomTov = yomDates.has(parts.date);
    let start = b.at;
    if (!fridayIsYomTov) start = earlyFridayMs(parts.date, b.at, settings, timeZone);
    days.push({
      date: saturday,
      hdate: "",
      occasion: "shabbat",
      yomTov: false,
      start,
      end,
      fridayDate: parts.date,
    });
  }
  days.sort((a, b) => a.start - b.start || a.date.localeCompare(b.date));
  return days;
}

export function buildSpans(days) {
  const spans = [];
  let cur = null;
  for (const day of days) {
    const prev = cur?.days[cur.days.length - 1];
    if (cur && prev && Math.abs(prev.end - day.start) < 60000) {
      cur.days.push({ ...day });
      cur.end = day.end;
    } else {
      cur = { start: day.start, end: day.end, days: [{ ...day }] };
      spans.push(cur);
    }
  }
  for (const span of spans) {
    span.id = span.days.map((d) => d.date).join("+");
    span.days.forEach((d, i) => {
      d.index = i;
      d.isFirst = i === 0;
      d.isLast = i === span.days.length - 1;
    });
    const names = [];
    for (const d of span.days) {
      const label = occasionLabel(d.occasion);
      if (!names.includes(label)) names.push(label);
    }
    span.name = names.join(" · ");
    span.occasion = span.days[0].occasion;
  }
  return spans;
}

function clockAfter(startMs, hhmm, timeZone, limitMs) {
  const startParts = zonedParts(startMs, timeZone);
  let date = startParts.date;
  let at = zonedMs(date, hhmm, timeZone);
  if (at <= startMs) {
    date = addDays(date, 1);
    at = zonedMs(date, hhmm, timeZone);
  }
  if (at <= startMs) return null;
  if (at - startMs > limitMs) return null;
  return at;
}

function placeGroup(day, hhmm, bucket, timeZone) {
  if (bucket === "night") return clockAfter(day.start, hhmm, timeZone, NIGHT_WINDOW_MS);
  return zonedMs(day.date, hhmm, timeZone);
}

function inDay(at, day) {
  return at != null && at >= day.start && at < day.end;
}

function actionId(span, day, question, groupIndex) {
  return `${span.id}|d${day.index}|${question}|${groupIndex}`;
}

function deviceAction(span, day, question, groupIndex, at, states, skipped, skipReason) {
  return {
    id: actionId(span, day, question, groupIndex),
    at,
    kind: "devices",
    spanId: span.id,
    dayDate: day.date,
    dayIndex: day.index,
    occasion: day.occasion,
    question,
    groupIndex,
    states: cloneStates(states),
    skipped: !!skipped,
    skipReason: skipReason || "",
  };
}

function applyStartEarly(at, settings) {
  const n = Number(settings?.startEarlyMin || 0);
  if (!Number.isFinite(n) || n === 0) return at;
  return at - n * 60000;
}

function customAt(entry, day, timeZone, sun) {
  const anchor = entry?.anchor || "clock-day";
  const days = entry?.days || "every";
  if (days === "first" && !day.isFirst) return { skip: true, reason: "not the first day" };
  if (days === "last" && !day.isLast) return { skip: true, reason: "not the last day" };
  if (anchor === "clock-night") {
    const at = clockAfter(day.start, entry.value, timeZone, NIGHT_WINDOW_MS);
    return { at };
  }
  if (anchor === "clock-day") return { at: zonedMs(day.date, entry.value, timeZone) };
  if (anchor === "after-start") return { at: day.start + Number(entry.value || 0) * 60000 };
  if (anchor === "before-end") return { at: day.end - Number(entry.value || 0) * 60000 };
  if (anchor === "after-end") return { at: day.end + Number(entry.value || 0) * 60000 };
  const sunMs = anchor === "sunrise" ? sun?.sunrise : sun?.sunset;
  if (sunMs == null) return { at: null, reason: "no sun time" };
  return { at: sunMs + Number(entry.value || 0) * 60000 };
}

function stillOnIds(actions) {
  const last = new Map();
  for (const a of actions) {
    if (a.kind !== "devices" || a.skipped || a.question === "end") continue;
    for (const s of a.states || []) last.set(String(s.id), s.on === true);
  }
  const ids = [];
  for (const [id, on] of last) if (on) ids.push(id);
  return ids;
}

export function expandSpan(span, config, timeZone, sunProvider) {
  const settings = config?.settings || {};
  const actions = [];
  const earlyStart = applyStartEarly(span.start, settings);
  actions.push({
    id: `${span.id}|modeEnter`,
    at: earlyStart,
    kind: "modeEnter",
    spanId: span.id,
    question: "modeEnter",
    groupIndex: 0,
    states: [],
    skipped: false,
    skipReason: "",
    mode: settings.holidayMode || "",
  });
  const pendingEnd = [];
  for (const day of span.days) {
    const template = resolveTemplate(day.occasion, config) || emptyTemplate();
    const startAt = applyStartEarly(day.start, settings);
    if (day.isFirst || template.start?.repeatLaterNights === true) {
      const states = cloneStates(template.start?.states);
      if (states.length) {
        actions.push(deviceAction(span, day, "start", 0, startAt, states, false, ""));
      }
    }
    for (const bucket of ["night", "morning", "afternoon", "evening"]) {
      (template[bucket] || []).forEach((group, i) => {
        const states = cloneStates(group?.states);
        if (!states.length || !group?.time) return;
        const at = placeGroup(day, group.time, bucket, timeZone);
        if (!inDay(at, day)) {
          actions.push(deviceAction(span, day, bucket, i, at, states, true, "outside this day"));
        } else {
          actions.push(deviceAction(span, day, bucket, i, at, states, false, ""));
        }
      });
    }
    (template.custom || []).forEach((entry, i) => {
      const states = cloneStates(entry?.states);
      if (!states.length) return;
      const sun = sunProvider ? sunProvider(day.date) : null;
      const placed = customAt(entry, day, timeZone, sun);
      if (placed.skip) return;
      const at = placed.at;
      if (!inDay(at, day) && entry?.anchor !== "after-end") {
        actions.push(deviceAction(span, day, "custom", i, at, states, true, placed.reason || "outside this day"));
      } else if (entry?.anchor === "after-end" && (at == null || at < day.end)) {
        actions.push(deviceAction(span, day, "custom", i, at, states, true, "outside this day"));
      } else {
        actions.push(deviceAction(span, day, "custom", i, at, states, false, ""));
      }
    });
    if (day.isLast) pendingEnd.push(template);
  }
  const endTemplate = pendingEnd[0] || emptyTemplate();
  const endStates = cloneStates(endTemplate.end?.states);
  if (endTemplate.end?.offStillOn !== false) {
    const explicitOff = new Set(endStates.filter((s) => !s.on).map((s) => s.id));
    for (const id of stillOnIds(actions)) {
      if (explicitOff.has(id)) continue;
      const sample = actions.flatMap((a) => a.states || []).find((s) => s.id === id);
      endStates.push({ id, kind: sample?.kind || "light", on: false, level: null, ct: null });
    }
  }
  if (endStates.length) {
    const last = span.days[span.days.length - 1];
    actions.push(deviceAction(span, last, "end", 0, span.end, endStates, false, ""));
  }
  actions.push({
    id: `${span.id}|modeExit`,
    at: span.end,
    kind: "modeExit",
    spanId: span.id,
    question: "modeExit",
    groupIndex: 0,
    states: [],
    skipped: false,
    skipReason: "",
    mode: settings.endMode || "",
  });
  actions.sort((a, b) => a.at - b.at || questionOrder(a.question) - questionOrder(b.question) || a.id.localeCompare(b.id));
  return actions;
}

function questionOrder(q) {
  if (q === "modeEnter") return 0;
  if (q === "start") return 1;
  if (q === "end") return 8;
  if (q === "modeExit") return 9;
  return 4;
}

export function sameMinuteWarnings(actions) {
  const buckets = new Map();
  for (const a of actions || []) {
    if (a.kind !== "devices" || a.skipped || a.at == null) continue;
    const minute = Math.floor(a.at / 60000);
    for (const s of a.states || []) {
      const key = `${minute}|${s.id}`;
      if (!buckets.has(key)) buckets.set(key, new Set());
      buckets.get(key).add(s.on ? "on" : "off");
    }
  }
  const warnings = [];
  for (const [key, set] of buckets) {
    if (set.has("on") && set.has("off")) warnings.push(key.split("|")[1]);
  }
  return [...new Set(warnings)];
}

export function expandUpcoming(items, config, timeZone, nowMs, sunProvider, horizonMs = 14 * 24 * 60 * 60 * 1000) {
  const days = buildObservedDays(items, timeZone, config);
  const spans = buildSpans(days).filter((s) => s.end > nowMs && s.start < nowMs + horizonMs + 3 * 24 * 60 * 60 * 1000);
  const actions = [];
  for (const span of spans) actions.push(...expandSpan(span, config, timeZone, sunProvider));
  return { days, spans, actions };
}

export function preflight(settings, location, modes) {
  const errors = [];
  const loc = location || {};
  if (loc.lat == null || loc.lon == null || !loc.tz) errors.push("Set the hub latitude, longitude, and time zone.");
  const holiday = String(settings?.holidayMode || "").trim();
  const end = String(settings?.endMode || "").trim();
  if (!holiday || !end) errors.push("Choose the holiday mode and the mode to return to.");
  else if (holiday === end) errors.push("The holiday mode and the end mode must be different.");
  const known = new Set(modes || []);
  if (holiday && known.size && !known.has(holiday)) errors.push("The holiday mode is not on this hub.");
  if (end && known.size && !known.has(end)) errors.push("The end mode is not on this hub.");
  return { ok: errors.length === 0, errors };
}

export function conflictingSchedules(schedules, holidayMode) {
  const mode = String(holidayMode || "");
  const out = [];
  for (const s of schedules || []) {
    if (!s || s.enabled === false) continue;
    const only = Array.isArray(s.onlyInModes) ? s.onlyInModes.filter(Boolean) : [];
    const triggerMode = s.trigger?.kind === "mode" && s.trigger?.mode === mode;
    const setsMode = s.action?.target === "hubMode" && s.action?.mode === mode;
    const unrestricted = !only.length && s.trigger?.kind !== "mode";
    const restricted = only.includes(mode);
    if (triggerMode || setsMode || unrestricted || restricted) {
      const states = Array.isArray(s.action?.states) ? s.action.states : [];
      const devices = states.map((st) => String(st?.id ?? "")).filter(Boolean);
      out.push({ id: s.id, name: s.name || "Untitled schedule", devices });
    }
  }
  return out;
}

function deviceKey(s) {
  return `${s.kind || "light"}:${s.id}`;
}

/** Latest missed state per device inside the catch-up window. Older misses are skipped. */
export function planCatchUp({
  actions,
  now,
  doneIds,
  currentMode,
  holidayMode,
  endMode,
  held,
  overridden,
  startRan,
  spanEnded,
  catchUpMs = CATCH_UP_MS,
}) {
  const done = doneIds instanceof Set ? doneIds : new Set(Object.keys(doneIds || {}));
  const markSkipped = [];
  const candidates = [];
  let setMode = null;
  if (spanEnded && currentMode && currentMode === holidayMode) setMode = endMode || null;
  else if (!held && !overridden && startRan && currentMode !== holidayMode) setMode = holidayMode || null;
  const willBeHoliday = setMode === holidayMode || currentMode === holidayMode;
  for (const a of actions || []) {
    if (a.skipped || a.at == null || a.at > now) continue;
    if (done.has(a.id)) continue;
    if (a.kind === "modeEnter" || a.kind === "modeExit") {
      markSkipped.push(a.id);
      continue;
    }
    if (now - a.at > catchUpMs) {
      markSkipped.push(a.id);
      continue;
    }
    if (!willBeHoliday) {
      markSkipped.push(a.id);
      continue;
    }
    candidates.push(a);
  }
  const latest = new Map();
  for (const a of candidates) {
    for (const s of a.states || []) {
      latest.set(deviceKey(s), { actionId: a.id, at: a.at, state: s });
    }
  }
  const replayStates = [];
  const replayIds = new Set();
  const ordered = [...latest.values()].sort((a, b) => a.at - b.at);
  for (const row of ordered) {
    replayStates.push(row.state);
    replayIds.add(row.actionId);
  }
  for (const a of candidates) {
    if (!replayIds.has(a.id)) markSkipped.push(a.id);
  }
  return {
    setMode: setMode || null,
    replay: replayStates,
    ranIds: [...replayIds],
    markSkipped: [...new Set(markSkipped)],
  };
}

export function passedActionIds(actions, now) {
  return (actions || []).filter((a) => !a.skipped && a.at != null && a.at <= now).map((a) => a.id);
}

export function buildDeviceTimeline(span, actions, deviceId) {
  const id = String(deviceId);
  const changes = [];
  for (const a of actions || []) {
    if (a.spanId !== span.id || a.kind !== "devices" || a.skipped || a.at == null) continue;
    for (const s of a.states || []) {
      if (String(s.id) !== id) continue;
      changes.push({ at: a.at, on: s.on === true, level: s.level, ct: s.ct, question: a.question });
    }
  }
  changes.sort((a, b) => a.at - b.at);
  const segments = [];
  let cursor = span.start;
  let state = "unchanged";
  let level = null;
  if (!changes.length) {
    return { deviceId: id, segments: [{ start: span.start, end: span.end, state: "unchanged", level: null }], changes: [] };
  }
  for (const c of changes) {
    const at = Math.max(span.start, Math.min(span.end, c.at));
    if (at > cursor) segments.push({ start: cursor, end: at, state, level });
    state = c.on ? "on" : "off";
    level = c.level;
    cursor = at;
  }
  if (cursor < span.end) segments.push({ start: cursor, end: span.end, state, level });
  return { deviceId: id, segments, changes };
}

export function devicesInActions(actions) {
  const map = new Map();
  for (const a of actions || []) {
    for (const s of a.states || []) {
      if (!map.has(String(s.id))) map.set(String(s.id), { id: String(s.id), kind: s.kind });
    }
  }
  return [...map.values()];
}

export function listRows(spans, now) {
  return (spans || []).map((span) => {
    const inProgress = span.start <= now && span.end > now;
    return {
      spanId: span.id,
      name: span.name,
      start: span.start,
      end: span.end,
      occasion: span.occasion,
      inProgress,
    };
  }).sort((a, b) => a.start - b.start);
}

export function formatHubTime(ms, timeZone, use24) {
  if (ms == null || !Number.isFinite(Number(ms))) return "";
  const opts = use24
    ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }
    : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone };
  return new Intl.DateTimeFormat("en-US", opts).format(new Date(ms));
}
