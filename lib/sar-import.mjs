// Deterministic Simple Automation Rules (Hubitat App Export) → mDash schedule drafts.
// Mirrored in app/ModernLightsDashboard.groovy.template (schedImport*).

import { validateSchedulePayload } from "./scheduler-core.mjs";

const WEEKLY_DAY_NAMES = new Set(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]);

const ALLOWED_ACTIONS = new Set([
  "Turn On",
  "Turn Off",
  "Turn On & Set Level",
  "Turn On & Set Temperature",
]);

/** Repair Hubitat export escape quirks (e.g. \\\" inside modes values), then JSON.parse. */
export function repairExportText(text) {
  let s = String(text || "").trim();
  if (!s) return s;
  // Hubitat sometimes emits \\ before quotes inside stringified lists.
  s = s.replace(/\\\\/g, "\\");
  return s;
}

export function parseSarExport(text) {
  const raw = String(text || "").trim();
  if (!raw) return { error: "Paste is empty", root: null };
  let fixed = repairExportText(raw);
  let root;
  try {
    root = JSON.parse(fixed);
  } catch (e1) {
    try {
      // Second pass: some exports keep doubled backslashes only in value strings.
      root = JSON.parse(raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
    } catch (e2) {
      return { error: `Invalid export JSON: ${e1.message || e1}`, root: null };
    }
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    return { error: "Export must be a JSON object", root: null };
  }
  if (!root.appData || typeof root.appData !== "object") {
    return { error: "Export has no appData", root: null };
  }
  return { error: null, root };
}

function settingMap(appSettings) {
  const m = {};
  if (!Array.isArray(appSettings)) return m;
  for (const s of appSettings) {
    if (s?.name) m[String(s.name)] = s;
  }
  return m;
}

function settingValue(settings, name) {
  const s = settings[name];
  if (!s) return null;
  const v = s.value;
  if (v == null || v === "") return null;
  return v;
}

function parseModesValue(raw) {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
  } catch {
    // fall through
  }
  // Hubitat may store Groovy-ish [Mode A, Mode B]
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((p) => p.trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "")).filter(Boolean);
  }
  return [s];
}

function parseDaysValue(raw) {
  if (raw == null || raw === "") return [];
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      list = raw.split(",").map((x) => x.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((d) => String(d || "").trim().toUpperCase().slice(0, 3))
    .filter((d) => WEEKLY_DAY_NAMES.has(d));
}

function deviceIdsFromLightsSetting(settings) {
  const s = settings.lights;
  if (!s) return [];
  const dl = s.deviceList;
  if (dl && typeof dl === "object" && !Array.isArray(dl)) {
    return Object.keys(dl).map((k) => String(k));
  }
  // Fallback: value as list of ids
  const v = s.value;
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string" && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {
      return v.split(",").map((x) => x.trim()).filter(Boolean);
    }
  }
  return [];
}

function deviceLabel(deviceMeta, id) {
  const d = deviceMeta?.[String(id)];
  return d?.deviceLabel || d?.deviceName || String(id);
}

function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, "").trim();
}

function isSarApp(meta) {
  const t = String(meta?.appTypeName || meta?.appName || "");
  return /^Simple Automation Rule/i.test(t);
}

function parseClockTime(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  // Hubitat may use HH:MM or full ISO-ish
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function parseOffset(raw) {
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-720, Math.min(720, Math.trunc(n)));
}

function actionOnState(action) {
  if (action === "Turn Off") return { on: false };
  if (action === "Turn On") return { on: true };
  if (action === "Turn On & Set Level") return { on: true, setLevel: true };
  if (action === "Turn On & Set Temperature") return { on: true, setLevel: true, setCt: true };
  return null;
}

/** SAR at2* / doAntiAction: opposite of the primary on/off (no level/CT). */
function antiActionOnState(onInfo) {
  return { on: !(onInfo?.on === true) };
}

function buildTrigger(settings, slot) {
  // slot: "primary" | "secondary"
  const atTKey = slot === "secondary" ? "at2T" : "atT";
  const atTimeKey = slot === "secondary" ? "at2Time" : "atTime";
  const atT = String(settingValue(settings, atTKey) || "").trim().toLowerCase();
  if (!atT) return { error: slot === "secondary" ? null : "Missing time type (atT)" };

  const days = parseDaysValue(settingValue(settings, "days"));
  const kind = days.length ? "weekly" : "daily";
  const trigger = { kind };

  if (atT === "time") {
    const time = parseClockTime(settingValue(settings, atTimeKey));
    if (!time) return { error: `Invalid or missing clock time (${atTimeKey})` };
    trigger.when = "clock";
    trigger.time = time;
    trigger.offsetMin = 0;
  } else if (atT === "sunrise" || atT === "sunset") {
    trigger.when = atT;
    trigger.time = "";
    let off;
    if (slot === "secondary") {
      off = settingValue(settings, atT === "sunrise" ? "sunrise2Offset" : "sunset2Offset");
    } else {
      off = settingValue(settings, atT === "sunrise" ? "sunriseOffset" : "sunsetOffset");
    }
    trigger.offsetMin = parseOffset(off);
  } else {
    return { error: `Unsupported time type: ${atT}` };
  }

  if (kind === "weekly") trigger.days = days;
  return { trigger };
}

function classifyDevices(ids, lightIds, outletIds, deviceMeta) {
  const lightSet = new Set((lightIds || []).map(String));
  const outletSet = new Set((outletIds || []).map(String));
  const lights = [];
  const outlets = [];
  const unknown = [];
  for (const id of ids) {
    const sid = String(id);
    if (outletSet.has(sid)) outlets.push(sid);
    else if (lightSet.has(sid)) lights.push(sid);
    else unknown.push({ id: sid, label: deviceLabel(deviceMeta, sid) });
  }
  return { lights, outlets, unknown };
}

function makeStates(ids, onInfo, target, level, ct) {
  return ids.map((id) => {
    const o = { id: Number.isFinite(Number(id)) ? Number(id) : id, on: onInfo.on === true };
    if (target === "lights" && onInfo.on) {
      if (onInfo.setLevel && level != null) o.level = level;
      if (onInfo.setCt && ct != null) o.ct = ct;
    }
    return o;
  });
}

function scheduleSummaryDraft(s) {
  const tr = s.trigger || {};
  if (tr.kind === "mode") {
    return `Mode ${tr.mode || ""}`.trim();
  }
  if (tr.kind === "daily" || tr.kind === "weekly") {
    const prefix = tr.kind === "weekly" ? `Weekly ${(tr.days || []).join(",")}` : "Daily";
    if (tr.when === "sunrise" || tr.when === "sunset") {
      const off = tr.offsetMin || 0;
      const offLabel = off === 0 ? tr.when : `${tr.when} ${off > 0 ? "+" : ""}${off}`;
      return `${prefix} ${offLabel}`;
    }
    return `${prefix} ${tr.time || ""}`;
  }
  return tr.kind || "schedule";
}

function buildModeTrigger(settings) {
  const mode = String(settingValue(settings, "onMode") || "").trim();
  if (!mode) return { error: "Mode Changes rule missing onMode" };
  // offMode is a bool in SAR exports; when enabled it may invert on leave — do not guess.
  const offMode = settingValue(settings, "offMode");
  if (offMode === true || String(offMode).toLowerCase() === "true") {
    return { error: "Mode Changes with offMode (leave-mode action) is not imported — create manually if needed" };
  }
  return { trigger: { kind: "mode", mode } };
}

/**
 * Convert one SAR app entry to zero or more schedule drafts.
 * @returns {{ schedules: object[], skipped: {appId,name,reason}[] }}
 */
export function convertSarApp(appId, appData, appMeta, deviceMeta, lightIds, outletIds) {
  const skipped = [];
  const name =
    stripHtml(appData?.state?.appName) ||
    stripHtml(settingValue(settingMap(appData?.appSettings || []), "newName")) ||
    stripHtml(appMeta?.appLabel) ||
    `SAR ${appId}`;

  if (!isSarApp(appMeta) && !isSarApp({ appTypeName: appData?.state?.appTypeName })) {
    // Parent "Simple Automation Rules" has no child type — skip non-rule entries
    const typeName = String(appMeta?.appTypeName || "");
    if (/^Simple Automation Rules$/i.test(typeName) && !appData?.appSettings?.length) {
      return { schedules: [], skipped: [] }; // parent container — ignore silently
    }
    if (!/^Simple Automation Rule/i.test(typeName)) {
      skipped.push({ appId: String(appId), name, reason: `Not a Simple Automation Rule (${typeName || "unknown type"})` });
      return { schedules: [], skipped };
    }
  }

  const settings = settingMap(appData?.appSettings || []);
  const how = String(settingValue(settings, "howToTrigger") || "").trim();
  const timeTrigger = how === "At a Specific Time";
  const modeTrigger = how === "Mode Changes";
  if (!timeTrigger && !modeTrigger) {
    skipped.push({
      appId: String(appId),
      name,
      reason: how ? `Unsupported trigger: ${how}` : "Missing howToTrigger",
    });
    return { schedules: [], skipped };
  }

  const action = String(settingValue(settings, "action") || "").trim();
  if (!ALLOWED_ACTIONS.has(action)) {
    skipped.push({
      appId: String(appId),
      name,
      reason: action ? `Unsupported action: ${action}` : "Missing action",
    });
    return { schedules: [], skipped };
  }

  const onInfo = actionOnState(action);
  let level = null;
  let ct = null;
  if (onInfo.setLevel || onInfo.setCt) {
    if (onInfo.setLevel) {
      const lv = Number(settingValue(settings, "level"));
      if (Number.isFinite(lv) && lv >= 0 && lv <= 100) level = Math.trunc(lv);
      else if (action === "Turn On & Set Level") {
        skipped.push({ appId: String(appId), name, reason: "Turn On & Set Level requires a valid level (0–100)" });
        return { schedules: [], skipped };
      }
    }
    if (onInfo.setCt) {
      const t = Number(settingValue(settings, "temperature"));
      if (!Number.isFinite(t) || t < 1500 || t > 9000) {
        skipped.push({ appId: String(appId), name, reason: "Turn On & Set Temperature requires a valid color temperature (Kelvin)" });
        return { schedules: [], skipped };
      }
      ct = Math.trunc(t);
      // Set Temperature often includes level; require it when present-empty is ok, but if invalid ignore
      if (level == null) {
        const lv = Number(settingValue(settings, "level"));
        if (Number.isFinite(lv) && lv >= 0 && lv <= 100) level = Math.trunc(lv);
      }
    }
  }

  const ids = deviceIdsFromLightsSetting(settings);
  if (!ids.length) {
    skipped.push({ appId: String(appId), name, reason: "No devices in rule" });
    return { schedules: [], skipped };
  }

  const classified = classifyDevices(ids, lightIds, outletIds, deviceMeta);
  for (const u of classified.unknown) {
    skipped.push({
      appId: String(appId),
      name,
      reason: `Partial: device ${u.id} (${u.label}) is not in Lights/Outlets (other devices in this rule can still import)`,
    });
  }
  if (!classified.lights.length && !classified.outlets.length) {
    const cleaned = skipped.filter((row) => !(row.appId === String(appId) && String(row.reason || "").startsWith("Partial:")));
    cleaned.push({
      appId: String(appId),
      name,
      reason: "No devices remain after filtering to Lights/Outlets pickers",
    });
    return { schedules: [], skipped: cleaned };
  }

  const enabled = !(appData?.state?.disabled === true || appData?.state?.paused === true);
  const targets = [];
  if (classified.lights.length) targets.push({ target: "lights", ids: classified.lights });
  if (classified.outlets.length) targets.push({ target: "outlets", ids: classified.outlets });
  const partialCount = skipped.filter(
    (row) => row.appId === String(appId) && String(row.reason || "").startsWith("Partial:")
  ).length;
  const partialNote = partialCount ? ` (${partialCount} device(s) omitted)` : "";

  const schedules = [];

  if (modeTrigger) {
    const built = buildModeTrigger(settings);
    if (built.error) {
      skipped.push({ appId: String(appId), name, reason: built.error });
      return { schedules: [], skipped };
    }
    for (const t of targets) {
      const draft = {
        name,
        enabled,
        importKey: `sar-${appId}-${t.target}`,
        onlyInModes: [],
        trigger: { ...built.trigger },
        action: {
          target: t.target,
          states: makeStates(t.ids, onInfo, t.target, level, ct),
        },
      };
      const verr = validateSchedulePayload(draft);
      if (verr) {
        skipped.push({ appId: String(appId), name: draft.name, reason: `Validation failed: ${verr}` });
        continue;
      }
      schedules.push({
        importKey: draft.importKey,
        name: draft.name,
        summary: scheduleSummaryDraft(draft) + partialNote,
        schedule: draft,
      });
    }
    if (!schedules.length && !skipped.length) {
      skipped.push({ appId: String(appId), name, reason: "Could not build a schedule" });
    }
    return { schedules, skipped };
  }

  // Time / sun path
  const onlyInModes = parseModesValue(settingValue(settings, "modes"));
  const at2T = String(settingValue(settings, "at2T") || "").trim();
  const slots = ["primary"];
  // at2T + doAntiAction: second time runs the opposite on/off (confirmed via SAR export subscriptions).
  if (at2T) slots.push("secondary");

  for (const slot of slots) {
    const built = buildTrigger(settings, slot);
    if (built.error == null && !built.trigger) continue;
    if (built.error) {
      skipped.push({
        appId: String(appId),
        name,
        reason: slot === "secondary" ? `Secondary time: ${built.error}` : built.error,
      });
      continue;
    }
    const slotOnInfo = slot === "secondary" ? antiActionOnState(onInfo) : onInfo;
    const slotLevel = slot === "secondary" ? null : level;
    const slotCt = slot === "secondary" ? null : ct;
    const slotName = slot === "secondary" ? `${name} (2nd time)` : name;
    const slotKeySuffix = slot === "secondary" ? `-2` : "";

    for (const t of targets) {
      const draft = {
        name: slotName,
        enabled,
        importKey: `sar-${appId}${slotKeySuffix}-${t.target}`,
        onlyInModes: [...onlyInModes],
        trigger: { ...built.trigger, days: built.trigger.days ? [...built.trigger.days] : undefined },
        action: {
          target: t.target,
          states: makeStates(t.ids, slotOnInfo, t.target, slotLevel, slotCt),
        },
      };
      if (draft.trigger.days === undefined) delete draft.trigger.days;

      const verr = validateSchedulePayload(draft);
      if (verr) {
        skipped.push({ appId: String(appId), name: draft.name, reason: `Validation failed: ${verr}` });
        continue;
      }
      schedules.push({
        importKey: draft.importKey,
        name: draft.name,
        summary: scheduleSummaryDraft(draft) + (onlyInModes.length ? ` [${onlyInModes.join(", ")}]` : "") + partialNote,
        schedule: draft,
      });
    }
  }

  if (!schedules.length && !skipped.length) {
    skipped.push({ appId: String(appId), name, reason: "Could not build a schedule" });
  }

  return { schedules, skipped };
}

/**
 * Full export conversion.
 * @returns {{ ok: object[], skipped: object[], error: string|null }}
 */
export function convertSarExport(text, lightIds = [], outletIds = []) {
  const parsed = parseSarExport(text);
  if (parsed.error) return { ok: [], skipped: [], error: parsed.error };
  const root = parsed.root;
  const appData = root.appData || {};
  const appReplacements = root.appReplacements || {};
  const deviceMeta = root.deviceReplacements || {};
  const ok = [];
  const skipped = [];

  for (const appId of Object.keys(appData)) {
    const meta = appReplacements[appId] || {};
    // Skip parent container with no useful settings
    if (/^Simple Automation Rules$/i.test(String(meta.appTypeName || "")) && !appData[appId]?.appSettings?.some((s) => s?.name === "howToTrigger")) {
      continue;
    }
    const result = convertSarApp(appId, appData[appId], meta, deviceMeta, lightIds, outletIds);
    ok.push(...result.schedules);
    skipped.push(...result.skipped);
  }

  if (!ok.length && !skipped.length) {
    return { ok: [], skipped: [], error: "No Simple Automation Rules found in export" };
  }
  return { ok, skipped, error: null };
}
