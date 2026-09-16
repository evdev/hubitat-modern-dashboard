// Mirror of merge helpers in src/app-pre.js for preview verification.

const SENSOR_TEMP_PROMOTE_TYPES = new Set(["humidity", "illuminance"]);

function mergeSensorExEntries(parts, excludeKeys) {
  const exclude = new Set((excludeKeys || []).map((k) => String(k).toLowerCase()));
  const out = [];
  const seen = new Set();
  for (const list of parts) {
    for (const e of list || []) {
      const k = String(e.k || "").toLowerCase();
      if (!k || exclude.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push({ k: e.k, v: e.v, u: e.u ?? null });
    }
  }
  return out;
}

function resolveMergedSensorBattery(tempRec, sensorRec, ex) {
  const batEx = (ex || []).find((e) => e.k === "battery");
  const bat = tempRec?.bat ?? sensorRec?.bat ?? (batEx ? batEx.v : null);
  return bat != null && bat !== "" ? bat : null;
}

function environmentalTempPrimaryCard(tempRec, sensorRec) {
  const exParts = [];
  if (sensorRec.v != null && sensorRec.v !== "") {
    exParts.push([{ k: sensorRec.t, v: sensorRec.v, u: sensorRec.u ?? null }]);
  }
  exParts.push(sensorRec.ex || [], tempRec.ex || []);
  const ex = mergeSensorExEntries(exParts, ["temperature"]);
  return {
    i: tempRec.i,
    t: "temp",
    v: tempRec.temp,
    ex,
    bat: resolveMergedSensorBattery(tempRec, sensorRec, ex),
  };
}

function sensorPrimaryCard(sensorRec, tempRec) {
  const exclude = sensorRec.t === "humidity" ? ["humidity"]
    : sensorRec.t === "illuminance" ? ["illuminance"] : [];
  const exParts = [sensorRec.ex || []];
  if (tempRec) {
    exParts.push([{ k: "temperature", v: tempRec.temp, u: tempRec.u ?? null }]);
    exParts.push(tempRec.ex || []);
  }
  const ex = mergeSensorExEntries(exParts, exclude);
  return {
    i: sensorRec.i,
    t: sensorRec.t,
    v: sensorRec.v,
    ex,
    bat: resolveMergedSensorBattery(tempRec, sensorRec, ex),
  };
}

// Mirror of sensorCardFilterTypes in src/app-pre.js for preview verification.
const SENSOR_FILTER_TYPE_KEYS = new Set([
  "temp", "motion", "shock", "contact", "leak", "smoke", "humidity", "illuminance", "presence", "valve", "generic",
]);
const SENSOR_EX_KEY_TO_FILTER_TYPE = {
  temperature: "temp",
  humidity: "humidity",
  illuminance: "illuminance",
  motion: "motion",
  contact: "contact",
  water: "leak",
  smoke: "smoke",
  presence: "presence",
  acceleration: "shock",
  shock: "shock",
  vibration: "shock",
};

function sensorCardFilterTypes(dev) {
  const types = new Set();
  const add = (t) => {
    if (t && SENSOR_FILTER_TYPE_KEYS.has(t)) types.add(t);
  };
  add(dev.t);
  add(dev._senRef?.t);
  if (dev._tempRef) add("temp");
  for (const e of dev.ex || []) {
    const k = String(e.k || "").toLowerCase();
    add(SENSOR_EX_KEY_TO_FILTER_TYPE[k] || (SENSOR_FILTER_TYPE_KEYS.has(k) ? k : null));
  }
  return types;
}

function normalizeRoomId(rid) {
  if (rid == null || rid === "null" || rid === "") return -1;
  if (rid === -1 || rid === "-1") return -1;
  const n = Number(rid);
  return Number.isFinite(n) ? n : -1;
}

export function sensorTemperatureReading(dev) {
  if (dev?.temp != null && dev.temp !== "") {
    const n = Number(dev.temp);
    if (!isNaN(n)) return { temp: n, u: dev.u ?? null };
  }
  const ex = (dev?.ex || []).find((e) => String(e.k || "").toLowerCase() === "temperature");
  if (ex?.v == null || ex.v === "") return null;
  const n = Number(ex.v);
  if (isNaN(n)) return null;
  return { temp: n, u: ex.u ?? dev.u ?? null };
}

export function climateSensorsByRoom(tempSensors, sensors) {
  const map = new Map();
  const dedicatedRooms = new Set();
  const seenIds = new Set();
  for (const s of tempSensors || []) {
    const rid = normalizeRoomId(s.r);
    if (!map.has(rid)) map.set(rid, []);
    map.get(rid).push(s);
    dedicatedRooms.add(rid);
    seenIds.add(Number(s.i));
  }
  for (const s of sensors || []) {
    if (seenIds.has(Number(s.i))) continue;
    if (!sensorTemperatureReading(s)) continue;
    const rid = normalizeRoomId(s.r);
    if (dedicatedRooms.has(rid)) continue;
    if (!map.has(rid)) map.set(rid, []);
    map.get(rid).push(s);
  }
  return map;
}

export function buildMergedSensorCard(tempRec, sensorRec) {
  if (tempRec && sensorRec && SENSOR_TEMP_PROMOTE_TYPES.has(sensorRec.t)) {
    return environmentalTempPrimaryCard(tempRec, sensorRec);
  }
  if (sensorRec) return sensorPrimaryCard(sensorRec, tempRec);
  if (tempRec) {
    return { i: tempRec.i, t: "temp", v: tempRec.temp, ex: tempRec.ex || [], bat: tempRec.bat ?? null };
  }
  return null;
}

export { sensorCardFilterTypes };
