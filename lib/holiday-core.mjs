// Shabbat and Yom Tov expansion. The Hubitat child app ports these rules.
// Preview and Node tests import this file directly.

import { thermostatSettingError, thermostatSettingNormalized } from "./scheduler-core.mjs";

export const HOLIDAY_API_VERSION = 2;
export const CATCH_UP_MS = 2 * 60 * 60 * 1000;
/** Occasions that start sooner than this are on the first holiday load. The child app uses the same cutoff. */
export const NEAR_LIST_DAYS = 14;
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
    end: { states: [] },
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

function clampWhole(v, min, max) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Keeps light, outlet, blind, fan, lock, and thermostat states. Any other kind is dropped. */
export function cloneStates(states) {
  const out = [];
  for (const s of Array.isArray(states) ? states : []) {
    const id = String(s?.id ?? "");
    if (!id) continue;
    const kind = s?.kind;
    if (kind === "blind") {
      out.push({ id, kind: "blind", open: s.open === true, position: s.open === true ? clampWhole(s.position, 1, 100) : null });
    } else if (kind === "fan") {
      const speed = s.speed == null || String(s.speed).trim() === "" ? null : String(s.speed);
      out.push({ id, kind: "fan", on: s.on === true, speed: s.on === true ? speed : null });
    } else if (kind === "lock") {
      out.push({ id, kind: "lock", locked: s.locked !== false });
    } else if (kind === "thermostat") {
      const n = thermostatSettingNormalized(s);
      out.push({
        id,
        kind: "thermostat",
        mode: n.mode ?? null,
        heat: n.heat ?? null,
        cool: n.cool ?? null,
        fanMode: n.fanMode ?? null,
      });
    } else if (kind == null || kind === "" || kind === "light" || kind === "outlet") {
      out.push({
        id,
        kind: kind === "outlet" ? "outlet" : "light",
        on: s?.on === true,
        level: s?.level == null || s?.level === "" ? null : Number(s.level),
        ct: s?.ct == null || s?.ct === "" ? null : Number(s.ct),
      });
    }
  }
  return out;
}

function commandSignature(s) {
  if (s.kind === "blind") return `blind|${s.open ? 1 : 0}|${s.position ?? ""}`;
  if (s.kind === "fan") return `fan|${s.on ? 1 : 0}|${s.speed ?? ""}`;
  if (s.kind === "lock") return `lock|${s.locked ? 1 : 0}`;
  if (s.kind === "thermostat") return `tstat|${s.mode ?? ""}|${s.heat ?? ""}|${s.cool ?? ""}|${s.fanMode ?? ""}`;
  return `${s.kind}|${s.on ? 1 : 0}|${s.level ?? ""}|${s.ct ?? ""}`;
}

/** Ids listed twice in one slot with two different commands. */
export function duplicateDeviceIds(states) {
  const seen = new Map();
  const both = [];
  for (const s of cloneStates(states)) {
    const sig = commandSignature(s);
    const prev = seen.get(s.id);
    if (prev == null) seen.set(s.id, sig);
    else if (prev !== sig && !both.includes(s.id)) both.push(s.id);
  }
  return both;
}

export function templateErrors(template) {
  const t = template || emptyTemplate();
  const errors = [];
  const check = (label, states) => {
    const cloned = cloneStates(states);
    const ids = duplicateDeviceIds(cloned);
    if (ids.length) errors.push({ label, ids });
    for (const s of cloned) {
      if (s.kind !== "thermostat") continue;
      const err = thermostatSettingError(s);
      if (err) errors.push({ label, ids: [s.id], error: err });
    }
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
  const choice = occasions[occasionId] || (occasionId === "shabbat" ? "own" : "skip");
  if (choice === "skip") return null;
  if (choice === "shabbat") return templates.shabbat || emptyTemplate();
  if (choice === "pesachFirst") return resolveTemplate("pesachFirst", config, seen);
  return templates[occasionId] || templates.shabbat || emptyTemplate();
}

export function templateBadge(occasionId, config) {
  const choice = config?.occasions?.[occasionId] || (occasionId === "shabbat" ? "own" : "skip");
  if (choice === "skip") return "skipped";
  if (occasionId === "shabbat") return "own schedule";
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

function templateForSpan(span, day, config) {
  const once = span?.id != null ? config?.spanOverrides?.[span.id] : null;
  if (once) return once;
  return resolveTemplate(day.occasion, config) || emptyTemplate();
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
    const template = templateForSpan(span, day, config);
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
    for (const s of cloneStates(a.states || [])) {
      const key = `${minute}|${s.id}`;
      if (!buckets.has(key)) buckets.set(key, new Set());
      buckets.get(key).add(commandSignature(s));
    }
  }
  const warnings = [];
  for (const [key, set] of buckets) {
    if (set.size > 1) warnings.push(key.split("|")[1]);
  }
  return [...new Set(warnings)];
}

function spanOccasionIds(span) {
  const ids = [];
  for (const day of span?.days || []) {
    if (day?.occasion && !ids.includes(day.occasion)) ids.push(day.occasion);
  }
  if (span?.occasion && !ids.includes(span.occasion)) ids.push(span.occasion);
  return ids;
}

export function calendarDayDistance(fromMs, toMs, timeZone) {
  const a = zonedParts(fromMs, timeZone).date.split("-").map(Number);
  const b = zonedParts(toMs, timeZone).date.split("-").map(Number);
  const utcA = Date.UTC(a[0], a[1] - 1, a[2]);
  const utcB = Date.UTC(b[0], b[1] - 1, b[2]);
  return Math.round((utcB - utcA) / 86400000);
}

/** True when a span belongs on the first load. Later spans wait until that section is opened. */
export function isListedNear(startMs, nowMs, timeZone) {
  return calendarDayDistance(nowMs, startMs, timeZone) < NEAR_LIST_DAYS;
}

/** Near spans, plus the next time for each scheduled holiday that is further out. */
export function selectListedSpans(spans, nowMs, nearMs = 17 * 24 * 60 * 60 * 1000) {
  const future = (spans || []).filter((s) => s.end > nowMs).sort((a, b) => a.start - b.start);
  const near = future.filter((s) => s.start < nowMs + nearMs);
  const shown = new Set();
  for (const span of near) for (const id of spanOccasionIds(span)) shown.add(id);
  const extra = [];
  for (const span of future) {
    const ids = spanOccasionIds(span).filter((id) => id !== "shabbat");
    if (!ids.length || ids.every((id) => shown.has(id))) continue;
    extra.push(span);
    for (const id of ids) shown.add(id);
  }
  return [...near, ...extra].sort((a, b) => a.start - b.start);
}

export function expandUpcoming(items, config, timeZone, nowMs, sunProvider, horizonMs = 14 * 24 * 60 * 60 * 1000) {
  const days = buildObservedDays(items, timeZone, config);
  const future = buildSpans(days).filter((s) => s.end > nowMs);
  const spans = selectListedSpans(future, nowMs, horizonMs + 3 * 24 * 60 * 60 * 1000);
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
      if (s.action?.target === "thermostats" && Array.isArray(s.action.devices)) {
        for (const id of s.action.devices) {
          const sid = String(id ?? "");
          if (sid && !devices.includes(sid)) devices.push(sid);
        }
      }
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
  const skippedUnlocks = [];
  const ordered = [...latest.values()].sort((a, b) => a.at - b.at);
  for (const row of ordered) {
    if (row.state?.kind === "lock" && row.state.locked === false) {
      skippedUnlocks.push({ id: row.state.id, actionId: row.actionId });
      continue;
    }
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
    skippedUnlocks,
  };
}

export function thermostatTone(mode) {
  const key = String(mode || "").toLowerCase().replace(/[\s_-]+/g, "");
  if (key === "heat" || key === "emergencyheat") return "heat";
  if (key === "cool" || key === "dry") return "cool";
  if (key === "auto") return "auto";
  if (key === "fan" || key === "fanonly") return "fan";
  return "off";
}

function timelineFields(s) {
  const kind = s?.kind || "light";
  if (kind === "blind") {
    const open = s.open === true;
    const pos = open ? numOrNull(s.position) : null;
    return {
      on: open,
      level: pos,
      label: open ? (pos != null ? `open ${pos}%` : "open") : "closed",
      tone: open ? "blind-open" : "blind-closed",
      caption: open ? (pos != null ? `${pos}%` : "Open") : "Closed",
    };
  }
  if (kind === "fan") {
    const on = s.on === true;
    const speed = on ? String(s.speed || "").trim() : "";
    return {
      on,
      level: null,
      label: on ? (speed || "on") : "off",
      tone: on ? fanTone(speed) : "fan-off",
      caption: on ? fanCaption(speed) : "Off",
    };
  }
  if (kind === "lock") {
    const unlocked = s.locked === false;
    return {
      on: unlocked,
      level: null,
      label: unlocked ? "unlocked" : "locked",
      tone: unlocked ? "lock-open" : "lock-shut",
      caption: unlocked ? "Unlocked" : "Locked",
    };
  }
  if (kind === "thermostat") {
    const mode = String(s.mode || "").trim();
    const bits = [];
    if (mode) bits.push(mode);
    if (s.heat != null) bits.push(`${s.heat}°`);
    if (s.cool != null) bits.push(`${s.cool}°`);
    if (s.fanMode) bits.push(`fan ${s.fanMode}`);
    const tone = thermostatTone(mode);
    return {
      on: tone !== "off",
      level: null,
      label: bits.join(" ") || "set",
      tone,
      heat: tone === "heat" || tone === "auto" ? numOrNull(s.heat) : null,
      cool: tone === "cool" || tone === "auto" ? numOrNull(s.cool) : null,
    };
  }
  const on = s.on === true;
  return { on, level: s.level ?? null, label: on && s.level != null ? `on ${s.level}%` : (on ? "on" : "off") };
}

function fanTone(speed) {
  const key = String(speed || "").toLowerCase();
  if (key === "low" || key === "1") return "fan-low";
  if (key === "medium" || key === "med" || key === "2") return "fan-med";
  if (key === "high" || key === "3") return "fan-high";
  return "fan-on";
}

function fanCaption(speed) {
  const key = String(speed || "").toLowerCase();
  if (!key) return "On";
  if (key === "med") return "Medium";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function numOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function passedActionIds(actions, now) {
  return (actions || []).filter((a) => !a.skipped && a.at != null && a.at <= now).map((a) => a.id);
}

const SAVE_ON_TIME_MS = 20 * 1000;

/**
 * A dashboard save leaves these past actions unmarked. Catch-up and a
 * Do-not-start hold can still run them. Resume-from-pause marks every past
 * action instead, via passedActionIds.
 */
export function saveKeepsPending(action, now, opts = {}) {
  if (!action || action.skipped || action.at == null) return false;
  const at = Number(action.at);
  if (!Number.isFinite(at) || at > now) return false;
  const spanOpen = opts.spanOpen === true;
  const heldSpanId = opts.heldSpanId != null ? String(opts.heldSpanId) : "";
  const replayHeldId = opts.replayHeldId != null ? String(opts.replayHeldId) : "";
  const spanId = action.spanId != null ? String(action.spanId) : "";
  const waitingOnHold = opts.held === true && spanOpen && heldSpanId !== "" && heldSpanId === spanId;
  const releasingHold = replayHeldId !== "" && replayHeldId === spanId;
  const catchUpMs = opts.catchUpMs ?? CATCH_UP_MS;
  if (now - at <= SAVE_ON_TIME_MS) return true;
  if (action.kind === "modeEnter" && spanOpen) return true;
  if (action.kind === "devices" && (now - at <= catchUpMs || waitingOnHold || releasingHold)) return true;
  return false;
}

export function buildDeviceTimeline(span, actions, deviceId) {
  const id = String(deviceId);
  const changes = [];
  for (const a of actions || []) {
    if (a.spanId !== span.id || a.kind !== "devices" || a.skipped || a.at == null) continue;
    for (const s of a.states || []) {
      if (String(s.id) !== id) continue;
      const fields = timelineFields(s);
      changes.push({
        at: a.at,
        on: fields.on,
        level: fields.level,
        ct: s.ct,
        label: fields.label,
        tone: fields.tone || null,
        heat: fields.heat ?? null,
        cool: fields.cool ?? null,
        caption: fields.caption || null,
        question: a.question,
      });
    }
  }
  changes.sort((a, b) => a.at - b.at);
  const segments = [];
  let cursor = span.start;
  let state = "unchanged";
  let level = null;
  let label = null;
  let tone = "unchanged";
  let heat = null;
  let cool = null;
  let caption = null;
  if (!changes.length) {
    return { deviceId: id, segments: [{ start: span.start, end: span.end, state: "unchanged", level: null, label: null, tone: "unchanged", heat: null, cool: null, caption: null }], changes: [] };
  }
  for (const c of changes) {
    const at = Math.max(span.start, Math.min(span.end, c.at));
    if (at > cursor) segments.push({ start: cursor, end: at, state, level, label, tone, heat, cool, caption });
    state = c.on ? "on" : "off";
    level = c.level;
    label = c.label;
    tone = c.tone || state;
    heat = c.heat ?? null;
    cool = c.cool ?? null;
    caption = c.caption || null;
    cursor = at;
  }
  if (cursor < span.end) segments.push({ start: cursor, end: span.end, state, level, label, tone, heat, cool, caption });
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
