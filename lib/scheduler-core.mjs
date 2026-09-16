// Shared scheduler helpers mirrored from the Hubitat Groovy implementation.
// Used by the preview mock and Node unit/smoke tests (no Hubitat runtime).

export const WEEKLY_DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Quartz cron for daily/weekly clock triggers. Daily uses DOM=* DOW=?; weekly uses DOM=? DOW=names. */
export function scheduleCronForTrigger(kind, time, days) {
  const parts = String(time || "").split(":");
  if (parts.length < 2) return null;
  const hh = Number(parts[0].trim());
  const mm = Number(parts[1].trim());
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  if (kind === "weekly") {
    const valid = new Set(WEEKLY_DAY_NAMES);
    const dowList = (Array.isArray(days) ? days : [])
      .map((d) => String(d || "").trim().toUpperCase())
      .filter((d) => valid.has(d));
    if (!dowList.length) return null;
    return `0 ${mm} ${hh} ? * ${dowList.join(",")} *`;
  }
  return `0 ${mm} ${hh} * * ? *`;
}

function cronParseDayOrInt(tok, dayNames) {
  if (dayNames) {
    const named = dayNames[String(tok || "").toUpperCase()];
    if (named != null) return named;
  }
  const n = Number.parseInt(tok, 10);
  if (!Number.isFinite(n)) throw new Error("bad cron token");
  return n;
}

/** Parse one Quartz cron field into a Set of ints. Day names allowed when lo/hi is 1–7. */
export function cronFieldValues(field, lo, hi) {
  if (field == null) return null;
  const f = String(field).trim();
  const out = new Set();
  if (f === "?" || f === "*") {
    for (let v = lo; v <= hi; v++) out.add(v);
    return out;
  }
  const dayNames = (lo === 1 && hi === 7)
    ? { SUN: 1, MON: 2, TUE: 3, WED: 4, THU: 5, FRI: 6, SAT: 7 }
    : null;
  for (const part of f.split(",")) {
    let p = part.trim();
    if (!p) continue;
    let step = 1;
    const slash = p.indexOf("/");
    if (slash >= 0) {
      step = Number.parseInt(p.slice(slash + 1).trim(), 10);
      if (!Number.isFinite(step) || step <= 0) return null;
      p = p.slice(0, slash).trim();
    }
    let plo = lo;
    let phi = hi;
    if (p !== "*" && p !== "?") {
      const dash = p.indexOf("-");
      try {
        if (dash >= 0) {
          plo = cronParseDayOrInt(p.slice(0, dash).trim(), dayNames);
          phi = cronParseDayOrInt(p.slice(dash + 1).trim(), dayNames);
        } else {
          plo = cronParseDayOrInt(p, dayNames);
          phi = plo;
        }
      } catch {
        return null;
      }
    }
    if (plo < lo) plo = lo;
    if (phi > hi) phi = hi;
    for (let v = plo; v <= phi; v += step) out.add(v);
  }
  return out.size ? out : null;
}

/** Next fire ms after fromMs for a 6–7 field Quartz cron, using the process local timezone. */
export function cronNextFire(cronExpr, fromMs) {
  if (!cronExpr) return null;
  const f = String(cronExpr).trim().split(/\s+/);
  if (f.length < 6) return null;
  const sec = cronFieldValues(f[0], 0, 59);
  const min = cronFieldValues(f[1], 0, 59);
  const hour = cronFieldValues(f[2], 0, 23);
  const dom = cronFieldValues(f[3], 1, 31);
  const mon = cronFieldValues(f[4], 1, 12);
  const dow = cronFieldValues(f[5], 1, 7);
  if (!sec || !min || !hour || !dom || !mon || !dow) return null;

  const cal = new Date(fromMs + 1000);
  cal.setSeconds(0, 0);
  // Truncating seconds can land on the just-elapsed minute — step forward.
  if (cal.getTime() <= fromMs) cal.setMinutes(cal.getMinutes() + 1);
  // Cap ~2 years of minutes
  for (let i = 0; i < 366 * 24 * 60 * 2; i++) {
    const s = cal.getSeconds();
    const mi = cal.getMinutes();
    const h = cal.getHours();
    const d = cal.getDate();
    const mo = cal.getMonth() + 1;
    const dw = cal.getDay() + 1; // JS 0=Sun → Quartz 1=Sun
    if (sec.has(s) && min.has(mi) && hour.has(h) && mon.has(mo) && dom.has(d) && dow.has(dw)) {
      return cal.getTime();
    }
    cal.setMinutes(cal.getMinutes() + 1);
  }
  return null;
}

export function scheduleTriggerWhen(tr) {
  const w = String(tr?.when || "").trim().toLowerCase();
  if (w === "sunrise" || w === "sunset") return w;
  return "clock";
}

export function scheduleOffsetMin(tr) {
  const n = Number(tr?.offsetMin ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-720, Math.min(720, Math.trunc(n)));
}

/**
 * Next sun-based fire. sunProvider(which, offsetMin, dayDate) -> ms|null
 */
export function scheduleSunNextFire(tr, which, fromMs, sunProvider) {
  const offsetMin = scheduleOffsetMin(tr);
  const names = WEEKLY_DAY_NAMES;
  const now = new Date(fromMs);
  // Include the previous solar day because a positive offset can cross
  // midnight and still produce the next fire after fromMs.
  for (let i = -1; i < 370; i++) {
    const cand = new Date(now);
    cand.setDate(now.getDate() + i);
    cand.setHours(0, 0, 0, 0);
    if (tr.kind === "weekly") {
      const days = Array.isArray(tr.days) ? tr.days : [];
      if (days.length && !days.includes(names[cand.getDay()])) continue;
    }
    const sunMs = sunProvider(which, offsetMin, cand);
    if (sunMs != null && sunMs > fromMs) return sunMs;
  }
  return null;
}

export function parseLocalDateTimeMs(value) {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!match) return NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || 0);
  const parsed = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute ||
    parsed.getSeconds() !== second
  ) return NaN;
  return parsed.getTime();
}

export function validateSchedulePayload(s, nowMs = Date.now()) {
  if (!s) return "invalid schedule";
  const tr = s.trigger || {};
  const kind = String(tr.kind || "");
  if (!["daily", "weekly", "once", "mode"].includes(kind)) return "unsupported trigger type";
  if (kind === "daily" || kind === "weekly") {
    const when = scheduleTriggerWhen(tr);
    if (when === "clock") {
      if (!scheduleCronForTrigger(kind, tr.time, tr.days)) return "invalid clock time or days";
    } else {
      const off = scheduleOffsetMin(tr);
      if (off < -720 || off > 720) return "offset must be between -720 and 720 minutes";
    }
    if (kind === "weekly") {
      const days = tr.days;
      if (!Array.isArray(days) || !days.length) return "pick at least one day";
    }
  } else if (kind === "once") {
    const at = String(tr.at || "").trim();
    const atMs = parseLocalDateTimeMs(at);
    if (!Number.isFinite(atMs)) return "invalid one-time date";
    if (atMs <= nowMs) return "one-time schedule must be in the future";
  } else if (kind === "mode") {
    if (!String(tr.mode || "").trim()) return "pick a hub mode";
  }
  const ac = s.action || {};
  const target = String(ac.target || "");
  if (!["lights", "outlets", "thermostats", "hubMode"].includes(target)) return "unsupported action type";
  if (target === "lights" || target === "outlets") {
    if (!Array.isArray(ac.states) || !ac.states.length) return "select at least one device";
  } else if (target === "thermostats") {
    if (!Array.isArray(ac.devices) || !ac.devices.length) return "select at least one thermostat";
  } else if (target === "hubMode") {
    if (!String(ac.mode || "").trim()) return "pick a hub mode";
  }
  return null;
}

/** Reject mode-trigger schedules that set hub mode in a loop (A→B→A) or onto themselves. */
export function modeCycleError(schedules, incoming) {
  const byId = new Map();
  for (const s of Array.isArray(schedules) ? schedules : []) {
    const id = s?.id != null ? String(s.id) : "";
    if (!id) continue;
    byId.set(id, s);
  }
  if (incoming) {
    const id = incoming.id != null ? String(incoming.id) : "__incoming__";
    byId.set(id, incoming);
  }
  const graph = new Map();
  for (const s of byId.values()) {
    if (s?.enabled === false) continue;
    if (String(s?.trigger?.kind || "") !== "mode") continue;
    if (String(s?.action?.target || "") !== "hubMode") continue;
    const from = String(s?.trigger?.mode || "").trim();
    const to = String(s?.action?.mode || "").trim();
    if (!from || !to) continue;
    if (from === to) return "mode trigger cannot set the same hub mode";
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push(to);
  }
  const visiting = new Set();
  const seen = new Set();
  const hasCycle = (node) => {
    if (visiting.has(node)) return true;
    if (seen.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) || []) {
      if (hasCycle(next)) return true;
    }
    visiting.delete(node);
    seen.add(node);
    return false;
  };
  for (const node of graph.keys()) {
    if (hasCycle(node)) return "mode schedules form a hub-mode loop";
  }
  return null;
}

export function recomputeNextFire(s, fromMs = Date.now(), opts = {}) {
  const sunProvider = opts.sunProvider;
  if (!s?.enabled) {
    s.nextFire = null;
    return s.nextFire;
  }
  const tr = s.trigger || {};
  if (tr.kind === "once") {
    const at = String(tr.at || "").trim();
    const t = parseLocalDateTimeMs(at);
    s.nextFire = Number.isFinite(t) && t > fromMs ? t : null;
    return s.nextFire;
  }
  if (tr.kind === "mode") {
    s.nextFire = null;
    return null;
  }
  if (tr.kind === "daily" || tr.kind === "weekly") {
    const when = scheduleTriggerWhen(tr);
    if (when === "sunrise" || when === "sunset") {
      s.nextFire = sunProvider
        ? scheduleSunNextFire(tr, when, fromMs, sunProvider)
        : null;
      return s.nextFire;
    }
    const cron = scheduleCronForTrigger(tr.kind, tr.time, tr.days);
    s.nextFire = cron ? cronNextFire(cron, fromMs) : null;
    return s.nextFire;
  }
  s.nextFire = null;
  return null;
}

/**
 * IDs due for the single Hubitat dispatcher. Future occurrences are never
 * consumed; the grace window lets the watchdog recover a missed callback
 * without replaying old daily automations indefinitely.
 */
export function dueScheduleIds(schedules, atMs, {
  graceMs = 10 * 60 * 1000,
  earlyMs = 0,
} = {}) {
  return Object.entries(schedules || {})
    .flatMap(([id, s]) => {
      if (!s?.enabled || s.nextFire == null) return [];
      const fireMs = Number(s.nextFire);
      if (!Number.isFinite(fireMs)) return [];
      if (fireMs < atMs - graceMs || fireMs > atMs + earlyMs) return [];
      return [{ id, fireMs }];
    })
    .sort((a, b) => (a.fireMs - b.fireMs) || a.id.localeCompare(b.id))
    .map((row) => row.id);
}

/** The one dispatcher time for all enabled time-based schedules. */
export function nextDispatcherAt(schedules, nowMs, minimumDelayMs = 1000) {
  let earliest = null;
  for (const s of Object.values(schedules || {})) {
    if (!s?.enabled || s.nextFire == null) continue;
    const fireMs = Number(s.nextFire);
    if (!Number.isFinite(fireMs)) continue;
    if (earliest == null || fireMs < earliest) earliest = fireMs;
  }
  return earliest == null ? null : Math.max(earliest, nowMs + minimumDelayMs);
}
