// Mirror of sensor ex/footer helpers in src/app-pre.js (keep in sync for preview tests).

const SECONDARY_ATTR_ORDER = ["temperature", "humidity", "illuminance", "pressure", "co2", "carbonmonoxide"];
const SENSOR_CARDWORTHY_EX_ATTRS = new Set(["battery", ...SECONDARY_ATTR_ORDER]);
const SENSOR_SKIP_ATTRS = new Set([
  "lastupdate", "lastevent", "epevent", "devicewatch-devicestatus", "checkinterval", "status", "name",
  "switch", "power", "energy", "rssi", "lqi", "lastactivity", "lastopened", "lastclosed", "datatype", "level", "healthstatus",
  "tamper", "enrollment", "encap", "destinationendpoint", "cluster", "fccdeviceclass", "firmware",
  "hardware", "software", "supportedthermostatmodes", "supportedfanmodes",
]);
const SENSOR_LAST_EVENT_TYPES = new Set(["smoke", "leak", "contact", "motion", "presence", "shock"]);

export function sensorExKeyAllowed(key, sensorType) {
  const k = String(key || "").toLowerCase();
  if (!k) return false;
  if (sensorType === "generic") return !SENSOR_SKIP_ATTRS.has(k);
  return SENSOR_CARDWORTHY_EX_ATTRS.has(k);
}

export function filterSensorExForType(ex, sensorType) {
  return (ex || []).filter((e) => e && sensorExKeyAllowed(e.k, sensorType));
}

function formatSensorLastEvent(ms) {
  const n = Number(ms);
  if (ms == null || isNaN(n)) return "";
  const now = Date.now();
  const diff = now - n;
  if (diff < 45000) return "Just now";
  if (diff < 3600000) {
    const mins = Math.max(1, Math.floor(diff / 60000));
    return mins + " min ago";
  }
  if (diff < 86400000) {
    const hrs = Math.max(1, Math.floor(diff / 3600000));
    return hrs + " hr ago";
  }
  const d = new Date(n);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function sensorLastEventLine(dev) {
  if (!SENSOR_LAST_EVENT_TYPES.has(dev.t)) return "";
  const ms = dev.le ?? dev._ref?.le ?? dev._senRef?.le ?? null;
  const txt = formatSensorLastEvent(ms);
  return txt ? "Last activity · " + txt : "";
}

export function sensorCardFootText(dev, exFooterText) {
  const parts = [];
  const last = sensorLastEventLine(dev);
  if (last) parts.push(last);
  if (exFooterText) parts.push(exFooterText);
  return parts.join(" · ");
}

export function mockSensorExFooter(dev) {
  const ex = filterSensorExForType(dev.ex, dev.t).filter((e) => String(e.k).toLowerCase() !== "battery");
  if (!ex.length) return "";
  return ex.map((e) => {
    const label = e.k.charAt(0).toUpperCase() + e.k.slice(1);
    return label + " " + e.v;
  }).join(" · ");
}
