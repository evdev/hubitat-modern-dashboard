"use strict";
// Preload: pure SVG/data constants and stateless helpers for Modern Dashboard.
// Loaded before app.js so the main IIFE can reference these by bare name.
// Kept in a separate file to stay under the hub's single-file serving limit.

const EXPAND_ALL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 8 6 6 6-6"/><path d="m6 13 6 6 6-6"/></svg>';
const COLLAPSE_ALL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 16 6-6 6 6"/><path d="m6 11 6-6 6 6"/></svg>';
const DRAG_HANDLE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="17" r="1.5"/><circle cx="15" cy="17" r="1.5"/></svg>';
const MOVE_UP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>';
const MOVE_DOWN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg>';
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="qnLock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd08a"/><stop offset="1" stop-color="#e0913a"/></linearGradient></defs><path d="M8.5 11.2V7.5a3.5 3.5 0 0 1 7 0v3.7" fill="none" stroke="#c9cedb" stroke-width="2" stroke-linecap="round"/><rect x="5" y="11" width="14" height="9.6" rx="2.6" fill="url(#qnLock)" stroke="#a96a22" stroke-width="0.9"/><circle cx="12" cy="15" r="1.5" fill="#3a2410"/><path d="M12 16.3v2" stroke="#3a2410" stroke-width="1.6" stroke-linecap="round"/></svg>';
const LIGHTS_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="qnLights" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f0a93a"/></linearGradient></defs><path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.7.55 1.2 1.35 1.35 2.3h4.9c.15-.95.65-1.75 1.35-2.3A6.5 6.5 0 0 0 12 2.5z" fill="url(#qnLights)" stroke="#c98a2a" stroke-width="0.8" stroke-linejoin="round"/><path d="M8.8 18.5h6.4M9.8 21h4.4" stroke="#c98a2a" stroke-width="1.4" stroke-linecap="round"/></svg>';
const SCENES_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="qnScenes" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f0a93a"/></linearGradient></defs><path d="M12 3l1.3 4.3L17.6 8.6 13.3 9.9 12 14.2l-1.3-4.3L6.4 8.6l4.3-1.3L12 3z" fill="url(#qnScenes)" stroke="#c98a2a" stroke-width="0.6" stroke-linejoin="round"/><path d="M5 15l.8 2.7L8.5 18.5l-2.7.8L5 22l-.8-2.7L1.5 18.5l2.7-.8L5 15z" fill="url(#qnScenes)" stroke="#c98a2a" stroke-width="0.5" stroke-linejoin="round"/><path d="M19 15l.8 2.7L22.5 18.5l-2.7.8L19 22l-.8-2.7L15.5 18.5l2.7-.8L19 15z" fill="url(#qnScenes)" stroke="#c98a2a" stroke-width="0.5" stroke-linejoin="round"/></svg>';
const MUSIC_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="qnMusic" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5ff"/><stop offset="1" stop-color="#7b5cff"/></linearGradient></defs><path d="M9.5 17.6V5.4l9-2v12.2" fill="none" stroke="url(#qnMusic)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 5.4l9-2" stroke="url(#qnMusic)" stroke-width="3" stroke-linecap="round"/><ellipse cx="6.9" cy="17.6" rx="2.7" ry="2.1" fill="url(#qnMusic)" stroke="#5a3df0" stroke-width="0.6" transform="rotate(-22 6.9 17.6)"/><ellipse cx="15.8" cy="15.6" rx="2.4" ry="1.8" fill="url(#qnMusic)" stroke="#5a3df0" stroke-width="0.6" transform="rotate(-22 15.8 15.6)"/></svg>';
const SCHEDULE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="qnSched" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7aa2ff"/><stop offset="1" stop-color="#3b6bff"/></linearGradient></defs><rect x="3.5" y="5" width="17" height="15.5" rx="2.6" fill="var(--panel-2)" stroke="url(#qnSched)" stroke-width="1.5"/><path d="M3.5 9.2h17" stroke="url(#qnSched)" stroke-width="1.5"/><path d="M8 3.3v3.4M16 3.3v3.4" stroke="#5b8cff" stroke-width="2" stroke-linecap="round"/><path d="M7 13h3M7 15.5h6M14 13h3" stroke="#9aa4b8" stroke-width="1.5" stroke-linecap="round"/></svg>';
const HUB_MODE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="qnSun" cx="42%" cy="38%" r="65%"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#ff9d3c"/></radialGradient></defs><g stroke="#ffb86b" stroke-width="2" stroke-linecap="round"><path d="M12 2.4v2.4M12 19.2v2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M2.4 12h2.4M19.2 12h2.4M4.8 19.2l1.7-1.7M17.5 6.5l1.7-1.7"/></g><circle cx="12" cy="12" r="4.1" fill="url(#qnSun)" stroke="#e0832a" stroke-width="0.8"/></svg>';

// Hub location mode icons for the mode popup (Hubitat API exposes names only, not icons).
const HUB_MODE_DAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="hmDay" cx="42%" cy="38%" r="65%"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#ff9d3c"/></radialGradient></defs><g stroke="#ffb86b" stroke-width="2" stroke-linecap="round"><path d="M12 2.4v2.4M12 19.2v2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M2.4 12h2.4M19.2 12h2.4M4.8 19.2l1.7-1.7M17.5 6.5l1.7-1.7"/></g><circle cx="12" cy="12" r="4.1" fill="url(#hmDay)" stroke="#e0832a" stroke-width="0.8"/></svg>';
const HUB_MODE_EVENING_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="hmEvening" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9d5c"/><stop offset="1" stop-color="#e05858"/></linearGradient></defs><path d="M3 17.5h18" stroke="#c96a4a" stroke-width="1.5" stroke-linecap="round"/><path d="M12 14.5a5.5 5.5 0 0 1 0-11 5.5 5.5 0 0 1 0 11Z" fill="url(#hmEvening)" stroke="#c96a4a" stroke-width="0.8"/></svg>';
const HUB_MODE_NIGHT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="hmNight" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5ff"/><stop offset="1" stop-color="#6b5cff"/></linearGradient></defs><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" fill="url(#hmNight)" stroke="#5a4de0" stroke-width="0.8"/><circle cx="17" cy="7" r="0.9" fill="#fff" opacity="0.85"/><circle cx="19.5" cy="10.5" r="0.6" fill="#fff" opacity="0.65"/></svg>';
const HUB_MODE_AWAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="hmAway" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7aa2ff"/><stop offset="1" stop-color="#3b6bff"/></linearGradient></defs><path d="M5 17.5h14l-1.4-4.2H6.4L5 17.5Z" fill="url(#hmAway)" stroke="#2b54e6" stroke-width="0.8" stroke-linejoin="round"/><path d="M7.2 13.3l1.8-5.4h6l1.8 5.4" fill="none" stroke="#2b54e6" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8.5" cy="17.5" r="1.4" fill="var(--panel-2)" stroke="#2b54e6" stroke-width="1.2"/><circle cx="15.5" cy="17.5" r="1.4" fill="var(--panel-2)" stroke="#2b54e6" stroke-width="1.2"/></svg>';
const HUB_MODE_GENERIC_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="hmGeneric" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd08a"/><stop offset="1" stop-color="#cf8f3a"/></linearGradient></defs><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19V10.5Z" fill="url(#hmGeneric)" stroke="#a96a22" stroke-width="0.8" stroke-linejoin="round"/><path d="M10 20.5v-6h4v6" fill="var(--panel-2)" stroke="#a96a22" stroke-width="0.8" stroke-linejoin="round"/></svg>';

const HUB_MODE_META = {
  day: HUB_MODE_DAY_SVG,
  home: HUB_MODE_DAY_SVG,
  evening: HUB_MODE_EVENING_SVG,
  dusk: HUB_MODE_EVENING_SVG,
  sunset: HUB_MODE_EVENING_SVG,
  night: HUB_MODE_NIGHT_SVG,
  sleep: HUB_MODE_NIGHT_SVG,
  asleep: HUB_MODE_NIGHT_SVG,
  bedtime: HUB_MODE_NIGHT_SVG,
  away: HUB_MODE_AWAY_SVG,
  vacation: HUB_MODE_AWAY_SVG,
  holiday: HUB_MODE_AWAY_SVG,
};

function hubModeMeta(name) {
  const key = String(name || "").trim().toLowerCase();
  return { svg: HUB_MODE_META[key] || HUB_MODE_GENERIC_SVG };
}
const FAVORITES_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21.1 7 14.2 2 9.3l6.9-1L12 2z"/></svg>';
const FAV_NAV_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="qnFav" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f0a93a"/></linearGradient></defs><path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.5l-5.8 3.05 1.1-6.47L2.6 9.45l6.5-.95L12 2.6z" fill="url(#qnFav)" stroke="#c98a2a" stroke-width="0.7" stroke-linejoin="round"/><path d="M12 2.6l2.9 5.9 3.1.46" fill="none" stroke="#fff4cc" stroke-width="1" stroke-linecap="round" opacity="0.75"/></svg>';
const SECURITY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="qnSec" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7aa2ff"/><stop offset="1" stop-color="#3b6bff"/></linearGradient></defs><path d="M12 2.2l8 3.8v6c0 5-3.5 9.3-8 9.8-4.5-.5-8-4.8-8-9.8V6l8-3.8z" fill="url(#qnSec)" stroke="#2b54e6" stroke-width="0.8" stroke-linejoin="round"/><path d="M8.5 12l2.4 2.4L15.8 9.6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const BLINDS_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="qnBlinds" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd08a"/><stop offset="1" stop-color="#cf8f3a"/></linearGradient></defs><rect x="4" y="4.5" width="16" height="14.8" rx="1.4" fill="url(#qnBlinds)" stroke="#a96a22" stroke-width="0.8"/><path d="M4 8.1h16M4 11.1h16M4 14.1h16" stroke="#9c5f24" stroke-width="0.9" opacity="0.65"/><path d="M12 19.3v1.9" stroke="#c9cedb" stroke-width="1.2" stroke-linecap="round"/><circle cx="12" cy="21.7" r="0.95" fill="#c9cedb"/></svg>';
const SENSORS_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="qnSensors" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7aa2ff"/><stop offset="1" stop-color="#3b6bff"/></linearGradient></defs><path d="M6 9a9 9 0 0 1 12 0" fill="none" stroke="url(#qnSensors)" stroke-width="2" stroke-linecap="round"/><path d="M9 12.5a4.5 4.5 0 0 1 6 0" fill="none" stroke="url(#qnSensors)" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.9" fill="url(#qnSensors)" stroke="#2b54e6" stroke-width="0.5"/></svg>';
const TSTAT_NAV_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="qnTstat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fd3b0"/><stop offset="1" stop-color="#2b6bff"/></linearGradient></defs><circle cx="12" cy="12" r="10.5" fill="url(#qnTstat)" stroke="#2b54e6" stroke-width="0.7"/><circle cx="12" cy="12" r="8.8" fill="none" stroke="#ffffff" stroke-width="0.9" opacity="0.7"/><text x="12" y="12.2" font-size="8.4" font-weight="800" fill="#ffffff" stroke="none" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif">72°</text></svg>';
const CENTRAL_TSTAT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="qnCentralTstat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fd3b0"/><stop offset="1" stop-color="#2b6bff"/></linearGradient></defs><circle cx="12" cy="12" r="10.5" fill="url(#qnCentralTstat)" stroke="#2b54e6" stroke-width="0.7"/><circle cx="12" cy="12" r="8.8" fill="none" stroke="#ffffff" stroke-width="0.9" opacity="0.7"/><text x="12" y="12.2" font-size="8.4" font-weight="800" fill="#ffffff" stroke="none" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif">72°</text></svg>';
const CENTRAL_MUSIC_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="qnCentralMusic" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5ff"/><stop offset="1" stop-color="#7b5cff"/></linearGradient></defs><path d="M9.5 17.8V6.2l9-2v11.6" fill="none" stroke="url(#qnCentralMusic)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="6.9" cy="17.8" rx="2.6" ry="2" fill="url(#qnCentralMusic)" stroke="#5a3df0" stroke-width="0.5" transform="rotate(-22 6.9 17.8)"/><ellipse cx="15.8" cy="15.8" rx="2.3" ry="1.7" fill="url(#qnCentralMusic)" stroke="#5a3df0" stroke-width="0.5" transform="rotate(-22 15.8 15.8)"/></svg>';

// Sensor type metadata for the Sensors popup. accent = alert/active color.
// Each svg uses currentColor so the card tint applies via CSS color.
const SENSOR_TYPE_META = {
  temp: { label: "Temperature", accent: "#5b9cff", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 13.6V5a2 2 0 1 0-4 0v8.6a4.5 4.5 0 1 0 4 0Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="17" r="2.1" fill="currentColor"/></svg>' },
  motion: { label: "Motion", accent: "#f0a93a", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="15" r="1.8" fill="currentColor"/></svg>' },
  contact: { label: "Contact", accent: "#ff6b4a", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="4" width="7" height="16" rx="1.5" fill="currentColor" opacity="0.25"/><path d="M11 12h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
  leak: { label: "Water", accent: "#ff6b4a", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' },
  smoke: { label: "Smoke", accent: "#ff6b4a", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 14a4 4 0 0 1 1-7.5A5 5 0 0 1 16 6a4 4 0 0 1 1 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 18h2M11 18h2M15 18h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
  humidity: { label: "Humidity", accent: "#5b9cff", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' },
  illuminance: { label: "Illuminance", accent: "#b58cff", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
  presence: { label: "Presence", accent: "#3fbf7f", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 20a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
  valve: { label: "Valve", accent: "#4a9eff", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h8v3l4 4-4 4v3H8v-3l-4-4 4-4V8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
  generic: { label: "Sensor", accent: "#9aa4b8", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h3l2-5 4 12 2-7h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
};

const SENSOR_ALERT_WORDS = { wet: 1, open: 1, active: 1, detected: 1, present: 1 };

function sensorTypeLabel(t) {
  return (SENSOR_TYPE_META[t] || SENSOR_TYPE_META.generic).label;
}

const FILTER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function humanizeAttr(k) {
  const map = { battery: "Battery", temperature: "Temp", humidity: "Humidity", illuminance: "Light", motion: "Motion", contact: "Contact", water: "Water", presence: "Presence", smoke: "Smoke", pressure: "Pressure", co2: "CO₂", carbonmonoxide: "CO" };
  const n = String(k || "").toLowerCase();
  if (map[n]) return map[n];
  return k ? (k.charAt(0).toUpperCase() + k.slice(1)) : "";
}

// Returns { hero, pill, alert } for a sensor device object.
const SENSOR_PRIMARY_ATTRS = {
  motion: new Set(["motion", "motionstatus"]),
  contact: new Set(["contact"]),
  leak: new Set(["water"]),
  presence: new Set(["presence"]),
  humidity: new Set(["humidity", "relativehumidity"]),
  illuminance: new Set(["illuminance"]),
  smoke: new Set(["smoke", "carbonmonoxide"]),
  valve: new Set(["valve"]),
};

function sensorIsPrimaryAttr(t, attrName) {
  const set = SENSOR_PRIMARY_ATTRS[t];
  if (!set) return false;
  return set.has(String(attrName || "").toLowerCase());
}

function normalizeSensorWsValue(t, attr, val) {
  if (val == null) return val;
  const lower = String(val).trim().toLowerCase();
  const attrL = String(attr || "").toLowerCase();
  switch (t) {
    case "motion":
      if (lower === "on" || lower === "true") return "active";
      if (lower === "off" || lower === "false") return "inactive";
      return lower;
    case "contact":
      if (lower === "on" || lower === "true") return "open";
      if (lower === "off" || lower === "false") return "closed";
      return lower;
    case "leak":
      if (lower === "true" || lower === "wet") return "wet";
      if (lower === "false" || lower === "dry") return "dry";
      return lower;
    case "presence":
      if (lower === "home" || lower === "true") return "present";
      if (lower === "away" || lower === "false" || lower === "not home" || lower === "not present") return "not present";
      return lower;
    case "smoke":
      if (lower === "tested" || lower === "monitored") return "clear";
      if (attrL === "carbonmonoxide" && (lower === "detected" || lower === "co")) return "detected";
      return lower;
    default:
      return val;
  }
}

function sensorAlertFlag(t, v) {
  const s = String(v || "").toLowerCase();
  const alerts = { motion: ["active"], contact: ["open"], leak: ["wet"], smoke: ["detected"], presence: ["present"], valve: ["open"] };
  return (alerts[t] || []).includes(s) ? 1 : 0;
}

function applySensorPayload(sen, d) {
  if (d.t != null) sen.t = d.t;
  if (d.v !== undefined) sen.v = d.v;
  if (d.a != null) sen.a = d.a ? 1 : 0;
  if (Array.isArray(d.ex)) sen.ex = d.ex.map((e) => ({ k: e.k, v: e.v, u: e.u ?? null }));
}

function applySensorWsAttr(sen, attrName, val, unit) {
  const nm = String(attrName || "").toLowerCase();
  const t = sen.t || "generic";
  const secondary = nm === "battery" || nm === "temperature" || nm === "humidity" || nm === "illuminance";
  if (secondary && (t === "generic" || !sensorIsPrimaryAttr(t, nm))) {
    const ex = sen.ex || (sen.ex = []);
    let entry = ex.find((e) => e.k === nm);
    if (entry) {
      entry.v = val;
      if (unit) entry.u = unit;
    } else if (ex.length < 3) {
      ex.push({ k: nm, v: val, u: unit || null });
    }
    return true;
  }
  if (sensorIsPrimaryAttr(t, nm) || t === "generic") {
    sen.v = t === "generic" ? val : normalizeSensorWsValue(t, nm, val);
    sen.a = sensorAlertFlag(t, sen.v);
    return true;
  }
  return false;
}

function sensorDisplay(dev) {
  const t = dev.t || "generic";
  const v = dev.v;
  switch (t) {
    case "motion": return v === "active" ? { hero: "Motion", pill: "Motion", alert: true } : { hero: "Clear", pill: "Clear", alert: false };
    case "contact": return v === "open" ? { hero: "Open", pill: "Open", alert: true } : { hero: "Closed", pill: "Closed", alert: false };
    case "leak": return v === "wet" ? { hero: "Wet", pill: "Wet", alert: true } : { hero: "Dry", pill: "Dry", alert: false };
    case "smoke": {
      const s = String(v || "").toLowerCase();
      if (s === "detected" || s === "co" || s === "carbonmonoxide") return { hero: "Detected", pill: (s === "co" || s === "carbonmonoxide") ? "CO" : "Detected", alert: true };
      return { hero: "Clear", pill: "Clear", alert: false };
    }
    case "presence": {
      const s = String(v || "").toLowerCase();
      const home = s === "present" || s === "home" || s === "true";
      return home ? { hero: "Present", pill: "Present", alert: true } : { hero: "Away", pill: "Away", alert: false };
    }
    case "humidity": { const n = Math.round(Number(v)); return { hero: isNaN(n) ? "—" : (n + "%"), pill: "Humidity", alert: false }; }
    case "illuminance": { const n = Math.round(Number(v)); return { hero: isNaN(n) ? "—" : (n + " lx"), pill: "Light", alert: false }; }
    case "valve": {
      const s = String(v || "").toLowerCase();
      if (s === "opening") return { hero: "Opening…", pill: "Opening", alert: false };
      if (s === "closing") return { hero: "Closing…", pill: "Closing", alert: false };
      if (s === "open") return { hero: "Open", pill: "Open", alert: true };
      return { hero: "Closed", pill: "Closed", alert: false };
    }
    case "temp": return { hero: "—", pill: "Temp", alert: false }; // temp hero computed in app.js via formatRoomTemp
    default: return { hero: (v != null && v !== "") ? String(v) : dev.n, pill: "", alert: !!(v && SENSOR_ALERT_WORDS[String(v).toLowerCase()]) };
  }
}

const TSTAT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 13.6V5a2 2 0 1 0-4 0v8.6a4.5 4.5 0 1 0 4 0Z"/><path d="M12 9v5"/><circle cx="12" cy="17" r="2.1"/></svg>';
const LOCK_BTN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const UNLOCK_BTN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 11V7.5a3.5 3.5 0 0 1 6.5-1.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const SHADE_OPEN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 6h16M4 9.5h16M4 13h16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.55"/></svg>';
const SHADE_CLOSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 6h16M4 9.5h16M4 13h16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.55"/></svg>';
const SHADE_STOP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>';
const MUSIC_PREV_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6v12L9 12l9-6z" fill="currentColor"/><rect x="6" y="6" width="2.2" height="12" rx="1" fill="currentColor"/></svg>';
const MUSIC_NEXT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6v12l9-6-9-6z" fill="currentColor"/><rect x="15.8" y="6" width="2.2" height="12" rx="1" fill="currentColor"/></svg>';
const MUSIC_PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor"/></svg>';
const MUSIC_PAUSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5.5" width="3.4" height="13" rx="1.4" fill="currentColor"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1.4" fill="currentColor"/></svg>';
const MUSIC_STOP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/></svg>';
const MUSIC_ART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="mlMusicArt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5ff"/><stop offset="1" stop-color="#7b5cff"/></linearGradient></defs><path d="M9.5 17.6V5.4l9-2v12.2" fill="none" stroke="url(#mlMusicArt)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="6.9" cy="17.6" rx="2.7" ry="2.1" fill="url(#mlMusicArt)" stroke="#5a3df0" stroke-width="0.6" transform="rotate(-22 6.9 17.6)"/><ellipse cx="15.8" cy="15.6" rx="2.4" ry="1.8" fill="url(#mlMusicArt)" stroke="#5a3df0" stroke-width="0.6" transform="rotate(-22 15.8 15.6)"/></svg>';

const OUTLET_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="qnOutlet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fe7ff"/><stop offset="1" stop-color="#2b9bd6"/></linearGradient></defs><rect x="3.8" y="2.7" width="16.4" height="18.6" rx="3.4" fill="url(#qnOutlet)" stroke="#1f7aa8" stroke-width="0.9"/><rect x="3.8" y="2.7" width="16.4" height="18.6" rx="3.4" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.45"/><circle cx="12" cy="5.4" r="0.55" fill="#1f7aa8" opacity="0.55"/><rect x="8.1" y="8" width="1.7" height="5.4" rx="0.85" fill="#ffffff"/><rect x="14.2" y="8" width="1.7" height="5.4" rx="0.85" fill="#ffffff"/><circle cx="12" cy="17.1" r="1.55" fill="#ffffff"/></svg>';

const QUICK_NAV = [
  { id: "quick-locks", popup: "locks", title: "Locks", svg: LOCK_SVG },
  { id: "quick-scenes", popup: "scenes", title: "Scenes", svg: SCENES_SVG },
  { id: "quick-hub-mode", popup: "hub-mode", title: "Hub mode", svg: HUB_MODE_SVG },
  { id: "quick-security", popup: "security", title: "Security", svg: SECURITY_SVG },
  { id: "quick-blinds", popup: "blinds", title: "Blinds", svg: BLINDS_SVG },
  { id: "quick-outlets", popup: "outlets", title: "Outlets", svg: OUTLET_SVG },
  { id: "quick-scheduling", popup: "scheduling", title: "Scheduling", svg: SCHEDULE_SVG },
  { id: "quick-sensors", popup: "sensors", title: "Sensors", svg: SENSORS_SVG },
  { id: "quick-thermostats", popup: "thermostats", title: "Thermostats", svg: TSTAT_NAV_SVG },
  { id: "quick-music", popup: "music", title: "Music", svg: MUSIC_SVG },
  { id: "quick-favorites", popup: "favorites", title: "Favorites", svg: FAV_NAV_SVG },
];

const CT_K_MIN = 2500;
const CT_K_MAX = 6000;
const CT_K_DEFAULT = 3000;
const CT_PRESETS = [2700, 3000, 3500, 4000, 4500, 5000, 5500, 6000];
const LEVEL_PRESETS = [25, 50, 75, 100, 1, 5];
const LEVEL_OPTIMISTIC_MS = 4000;

const RGB_PRESETS = [
  { label: "Red", h: 0, s: 100 },
  { label: "Orange", h: 8, s: 100 },
  { label: "Yellow", h: 17, s: 100 },
  { label: "Green", h: 33, s: 100 },
  { label: "Cyan", h: 50, s: 100 },
  { label: "Blue", h: 67, s: 100 },
  { label: "Purple", h: 83, s: 100 },
  { label: "White", h: 0, s: 0 },
];
const RGB_WHEEL_SIZE = 280;

const TSTAT_ANGLE_MIN = -135;     // dial start (bottom-left)
const TSTAT_ANGLE_MAX = 135;      // dial end (bottom-right) -> 270° sweep
const TSTAT_RANGES = { F: { min: 50, max: 90 }, C: { min: 10, max: 32 } };
const TSTAT_DIAL_SIZE = 280;
const TSTAT_DIAL_R = 122;

const TSTAT_DEFAULT_MODES = ["auto", "heat", "cool", "off"];
const TSTAT_DEFAULT_FAN_MODES = ["auto", "circulate", "on"];
const FAN_MODE_OPTS = [
  { key: "auto", label: "Auto", aria: "Fan runs automatically" },
  { key: "circulate", label: "Circulate", aria: "Fan circulates air" },
  { key: "on", label: "On", aria: "Fan always on" },
];
const FAN_SPEED_OPTS = [
  { key: "low", label: "Low", aria: "Fan speed low" },
  { key: "medium", label: "Med", aria: "Fan speed medium" },
  { key: "high", label: "High", aria: "Fan speed high" },
];
const TSTAT_MODE_DEFS = [
  { key: "auto", label: "Auto", cmd: "modeAuto" },
  { key: "heat", label: "Heat", cmd: "modeHeat" },
  { key: "cool", label: "Cool", cmd: "modeCool" },
];

const HSM_SHIELD = '<path d="M12 3 5 6v5c0 4.4 3 8.5 7 9.8 4-1.3 7-5.4 7-9.8V6l-7-3Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>';
const HSM_DISARM_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' + HSM_SHIELD + '<path d="m6 6.4 12 11.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const HSM_ARM_AWAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' + HSM_SHIELD + '<path d="M9.5 12.6v-1.5a2.5 2.5 0 0 1 5 0v1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="8.6" y="12.6" width="6.8" height="5" rx="1.1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const HSM_ARM_HOME_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' + HSM_SHIELD + '<path d="M8.8 16.6v-3.1l3.2-2.4 3.2 2.4v3.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M11 16.6v-1.5h2v1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const HSM_ARM_NIGHT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' + HSM_SHIELD + '<path d="M15.6 10.8a3.6 3.6 0 1 1-3.5-3.5 2.9 2.9 0 0 0 3.5 3.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const HSM_ARM_MONITORING_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' + HSM_SHIELD + '<path d="M12 9.3s3 3.3 3 5.3a3 3 0 0 1-6 0c0-2 3-5.3 3-5.3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
const HSM_DISARM_ALL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' + HSM_SHIELD + '<path d="m6.5 7 11 10M17.5 7 6.5 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const HSM_ARM_RULES_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h10M4 17h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="14" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const HSM_DISARM_RULES_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h10M4 17h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="14" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="m7 5 10 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const HSM_CANCEL_ALERT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a5 5 0 0 1 5 5v2.5l1.5 2.5H5.5L7 11.5V9a5 5 0 0 1 5-5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m8 8 8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const HSM_INTRUSION_MODES = [
  { cmd: "disarm", label: "Disarm", status: "disarmed", svg: HSM_DISARM_SVG },
  { cmd: "armAway", label: "Arm Away", status: "armedAway", svg: HSM_ARM_AWAY_SVG },
  { cmd: "armHome", label: "Arm Home", status: "armedHome", svg: HSM_ARM_HOME_SVG },
  { cmd: "armNight", label: "Arm Night", status: "armedNight", svg: HSM_ARM_NIGHT_SVG },
];

const HSM_MONITORING_MODES = [
  { cmd: "armAll", label: "Arm Monitoring", status: "disarmed", svg: HSM_ARM_MONITORING_SVG },
  { cmd: "disarmAll", label: "Disarm All", status: "allDisarmed", svg: HSM_DISARM_ALL_SVG },
];

const HSM_RULE_MODES = [
  { cmd: "armRules", label: "Arm Custom Rules", svg: HSM_ARM_RULES_SVG },
  { cmd: "disarmRules", label: "Disarm Custom Rules", svg: HSM_DISARM_RULES_SVG },
];

const HSM_MODES = HSM_INTRUSION_MODES;

function hsmStatusLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "alldisarmed") return "All Disarmed";
  if (!s || s === "disarmed") return "Intrusion Disarmed";
  if (s === "armedaway" || s === "armingaway") return "Armed Away";
  if (s === "armedhome" || s === "arminghome") return "Armed Home";
  if (s === "armednight" || s === "armingnight") return "Armed Night";
  return status || "Unknown";
}

function hsmModeIsActive(status, modeDef) {
  const s = String(status || "").toLowerCase();
  if (modeDef.cmd === "disarm") {
    return s === "disarmed";
  }
  if (modeDef.cmd === "disarmAll") {
    return s === "alldisarmed";
  }
  if (modeDef.cmd === "armAll") {
    return s !== "alldisarmed";
  }
  if (!modeDef.status) return false;
  const armed = modeDef.status.toLowerCase();
  const arming = ("arming" + modeDef.cmd.slice(3)).toLowerCase();
  return s === armed || s === arming;
}

function hsmIntrusionArmed(status) {
  const s = String(status || "").toLowerCase();
  return s.startsWith("armed") || s.startsWith("arming");
}

function hsmStatusTone(status, alert) {
  if (hsmHasActiveAlert(alert)) return "alert";
  const s = String(status || "").toLowerCase();
  if (s === "alldisarmed") return "all-safe";
  if (s.startsWith("arming")) return "arming";
  if (s.startsWith("armed")) return "armed";
  return "safe";
}

function hsmIntrusionTone(status) {
  const s = String(status || "").toLowerCase();
  if (s === "alldisarmed") return "all-safe";
  if (s.startsWith("arming")) return "arming";
  if (s.startsWith("armed")) return "armed";
  return "safe";
}

function hsmMonitoringTone(status) {
  return hsmMonitoringArmed(status) ? "mon-armed" : "mon-disarmed";
}

function hsmModeActiveClass(modeDef, status) {
  if (!hsmModeIsActive(status, modeDef)) return "";
  const s = String(status || "").toLowerCase();
  const cmd = modeDef.cmd;
  if (cmd === "disarm") return "hsm-active-disarm";
  if (cmd === "disarmAll") return "hsm-active-disarm-all";
  if (cmd === "armAll") return "hsm-active-mon-armed";
  if (s.startsWith("arming") && (cmd === "armAway" || cmd === "armHome" || cmd === "armNight")) {
    return "hsm-active-arming";
  }
  if (cmd === "armAway") return "hsm-active-away";
  if (cmd === "armHome") return "hsm-active-home";
  if (cmd === "armNight") return "hsm-active-night";
  return "";
}

function hsmMonitoringArmed(status) {
  return String(status || "").toLowerCase() !== "alldisarmed";
}

function hsmMonitoringLabel(status) {
  return hsmMonitoringArmed(status)
    ? "Water, smoke & leak monitoring armed"
    : "Environmental monitoring disarmed";
}

function hsmHasActiveAlert(alert) {
  const a = String(alert || "").toLowerCase();
  return !!a && a !== "none" && a !== "cancel";
}

function hsmAlertLabel(alert, desc) {
  const a = String(alert || "").toLowerCase();
  if (!a || a === "none" || a === "cancel") return "";
  if (a === "water") return "Water leak detected";
  if (a === "smoke") return "Smoke / CO detected";
  if (a === "rule") return desc ? ("Custom rule: " + desc) : "Custom rule alert";
  if (a === "intrusion" || a === "intrusion-away") return "Intrusion — Away";
  if (a === "intrusion-home") return "Intrusion — Home";
  if (a === "intrusion-night") return "Intrusion — Night";
  if (a.includes("water") || a.includes("leak")) return "Water leak detected";
  if (a.includes("smoke") || a.includes("co")) return "Smoke / CO detected";
  return alert;
}

function kelvinSwatchColor(k) {
  const pct = (k - CT_K_MIN) / (CT_K_MAX - CT_K_MIN);
  const r = Math.round(255 + (168 - 255) * pct);
  const g = Math.round(154 + (212 - 154) * pct);
  const b = Math.round(60 + (255 - 60) * pct);
  return "rgb(" + r + "," + g + "," + b + ")";
}

function formatFootText(dev, isDim) {
  const parts = [];
  if (isDim) parts.push(dev.l == null ? "—" : dev.l + "%");
  if (dev.ct && dev.k != null) parts.push(dev.k + "K");
  return parts.join(" · ");
}

function hsToRgb(h, s) {
  const H = (h / 100) * 360;
  const S = s / 100;
  const V = 1;
  const C = V * S;
  const X = C * (1 - Math.abs((H / 60) % 2 - 1));
  const m = V - C;
  let rp = 0, gp = 0, bp = 0;
  if (H < 60) { rp = C; gp = X; }
  else if (H < 120) { rp = X; gp = C; }
  else if (H < 180) { gp = C; bp = X; }
  else if (H < 240) { gp = X; bp = C; }
  else if (H < 300) { rp = X; bp = C; }
  else { rp = C; bp = X; }
  return [Math.round((rp + m) * 255), Math.round((gp + m) * 255), Math.round((bp + m) * 255)];
}

function hsToHex(h, s) {
  const [r, g, b] = hsToRgb(h, s);
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

function posToHs(cx, cy, x, y, radius) {
  const dx = x - cx;
  const dy = y - cy;
  let dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > radius) dist = radius;
  let angle = Math.atan2(dx, -dy);
  if (angle < 0) angle += Math.PI * 2;
  const h = Math.round((angle / (Math.PI * 2)) * 100) % 100;
  const sat = Math.round((dist / radius) * 100);
  return { h, s: sat };
}

function parseList(csv) {
  if (csv == null || csv === "") return [];
  const raw = String(csv).trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map(s => String(s).trim().toLowerCase()).filter(Boolean);
    } catch {}
  }
  return raw.split(/[,;|]/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

function stripRoomPrefix(deviceName, roomName) {
  if (deviceName == null || deviceName === "") return deviceName;
  const room = roomName == null ? "" : String(roomName).trim();
  if (!room || room === "Unassigned") return deviceName;
  const name = String(deviceName);
  const nameLower = name.toLowerCase();
  const roomLower = room.toLowerCase();
  if (!nameLower.startsWith(roomLower)) return deviceName;
  if (roomLower.length < nameLower.length && /[a-zA-Z0-9]/.test(name[room.length])) return deviceName;
  const remainder = name.slice(room.length).replace(/^[\s\-_:,·]+/, "").trim();
  return remainder || deviceName;
}

function normalizeRoomId(rid) {
  if (rid == null || rid === "null" || rid === "") return -1;
  if (rid === -1 || rid === "-1") return -1;
  const n = Number(rid);
  return Number.isFinite(n) ? n : -1;
}

function normalizeTstatUnit(unit) {
  const u = String(unit || "F").replace(/°/g, "").trim().toUpperCase();
  return u === "C" ? "C" : "F";
}

function tstatTempSuffix(unit) {
  return "°" + normalizeTstatUnit(unit);
}

function tstatRange(unit) {
  return TSTAT_RANGES[normalizeTstatUnit(unit) === "C" ? "C" : "F"];
}

function polar(cx, cy, r, angleDeg) {
  const a = angleDeg * Math.PI / 180; // 0 at top, clockwise
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

function describeArc(cx, cy, r, a0, a1) {
  if (Math.abs(a1 - a0) < 0.01) return "";
  const start = polar(cx, cy, r, a0);
  const end = polar(cx, cy, r, a1);
  const large = (a1 - a0) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function valToAngle(v, unit) {
  const { min, max } = tstatRange(unit);
  const clamped = Math.max(min, Math.min(max, v));
  return TSTAT_ANGLE_MIN + (clamped - min) / (max - min) * (TSTAT_ANGLE_MAX - TSTAT_ANGLE_MIN);
}

function angleToVal(angle, unit) {
  const { min, max } = tstatRange(unit);
  let v = min + (angle - TSTAT_ANGLE_MIN) / (TSTAT_ANGLE_MAX - TSTAT_ANGLE_MIN) * (max - min);
  return Math.round(v);
}

function clampSetpoint(v, unit) {
  const { min, max } = tstatRange(unit);
  return Math.max(min, Math.min(max, Math.round(v)));
}

function svgEl(name, attrs) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", name);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

const qs = (s, r = document) => r.querySelector(s);
const ce = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
