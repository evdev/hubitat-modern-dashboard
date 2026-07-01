#!/usr/bin/env node
// Local preview server (no deps) so you can develop the UI in a normal browser
// against fake /data without a hub. Generates ~130 lights across several rooms.
// Run:  node preview/server.mjs   then open http://localhost:4321/

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "node:http";
import { createIconPng } from "../lib/pwa-icons.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const readB64Icon = (name, size) => {
  const built = join(root, "dist", "upload", name);
  if (existsSync(built)) return readFileSync(built);
  return createIconPng(size);
};

const ROOM_NAMES = ["Living Room", "Kitchen", "Master Bedroom", "Office", "Hallway", "Garage", "Backyard", "Bathroom", "Kids Room", "Dining Room", "Foyer", "Basement"];
const NAMES = ["Ceiling", "Recessed", "Pendant", "Lamp", "Sconce", "Strip", "Spot", "Track", "Vanity", "Porch", "Flood", "Cabinet"];
const MOCK_HSM_PIN = "1234";
const MOCK_UNLOCK_PIN = "5678";
const MOCK_TRACKS = [
  "Daft Punk — Get Lucky",
  "Fleetwood Mac — Dreams",
  "Tame Impala — The Less I Know the Better",
  "Khruangbin — Texas Sun",
  "The Weeknd — Blinding Lights",
  "Stevie Wonder — Sir Duke",
];
const AUDIO_F_FULL = 127;
const AUDIO_F_CHROMECAST = 39; // play|pause|stop|volume
const AUDIO_F_AIRPLAY = 111;   // play|pause|stop|next|volume|mute (no prev)
const HSM_VALID_MODES = new Set([
  "disarm", "armAway", "armHome", "armNight",
  "armAll", "disarmAll", "armRules", "disarmRules", "cancelAlerts",
]);
const HSM_MODE_TO_STATUS = {
  disarm: "disarmed",
  armAway: "armedAway",
  armHome: "armedHome",
  armNight: "armedNight",
  armAll: "disarmed",
  disarmAll: "allDisarmed",
  armRules: "disarmed",
  disarmRules: "allDisarmed",
  cancelAlerts: "disarmed",
};

let state = buildMockData(130);

function buildMockData(count) {
  const rooms = ROOM_NAMES.map((name, i) => ({ id: i + 1, name }));
  const devices = [];
  for (let i = 1; i <= count; i++) {
    const rIdx = (i - 1) % rooms.length;
    const isDim = (i % 3 !== 0); // ~2/3 dimmers
    const hasCt = (i % 5 === 0); // ~1/5 support white balance
    const hasRgb = (i % 7 === 0); // ~1/7 support RGB
    const on = (i % 2 === 0);
    const lvl = isDim ? (on ? 10 + ((i * 7) % 90) : 0) : null;
    const kelvin = hasCt ? (2500 + ((i * 137) % 3501)) : null;
    const hue = hasRgb ? ((i * 23) % 101) : null;
    const sat = hasRgb ? (50 + ((i * 11) % 51)) : null;
    const cmode = (hasCt && hasRgb) ? (on ? "RGB" : "CT") : null;
    devices.push({
      i,
      n: `${ROOM_NAMES[rIdx]} ${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1}`.trim(),
      r: rooms[rIdx].id,
      d: isDim ? 1 : 0,
      ct: hasCt ? 1 : 0,
      rgb: hasRgb ? 1 : 0,
      s: on ? 1 : 0,
      l: lvl,
      k: kelvin,
      h: hue,
      sat: sat,
      cm: cmode,
    });
  }
  const thermostats = [
    { i: 1001, n: "Living Room Thermostat", r: 1, tm: "heat", os: "heating", hsp: 70, csp: 74, temp: 68, u: "F", hasFm: 1, fm: "auto", hasFs: 1, fs: "medium", supM: "auto,heat,cool,off", supFM: "auto,circulate,on", fsLev: "low,medium,high" },
    { i: 1002, n: "Master Bedroom Thermostat", r: 3, tm: "cool", os: "cooling", hsp: 68, csp: 72, temp: 74, u: "F", hasFm: 1, fm: "on", hasFs: 1, fs: "low", supM: "auto,heat,cool,off", supFM: "auto,on", fsLev: "low,medium,high" },
    { i: 1003, n: "Office Thermostat", r: 4, tm: "off", os: "idle", hsp: 65, csp: 75, temp: 70, u: "F", hasFm: 1, fm: "circulate", hasFs: 0, fs: null, supM: "auto,heat,cool,off", supFM: "auto,circulate", fsLev: null },
  ];
  const tempSensors = [
    { i: 2001, n: "Kitchen Sensor", r: 2, temp: 71, u: "F" },
    { i: 2002, n: "Hallway Sensor", r: 5, temp: 69, u: "F" },
  ];
  const sensors = [
    { i: 2101, n: "Front Door", r: 11, t: "contact", v: "closed", a: 0, ex: [{ k: "battery", v: 92, u: "%" }] },
    { i: 2102, n: "Back Door", r: 7, t: "contact", v: "open", a: 1, ex: [{ k: "battery", v: 88, u: "%" }] },
    { i: 2103, n: "Garage Motion", r: 6, t: "motion", v: "active", a: 1, ex: [{ k: "battery", v: 74, u: "%" }, { k: "temperature", v: 68, u: "F" }] },
    { i: 2104, n: "Basement Leak", r: 8, t: "leak", v: "dry", a: 0, ex: [{ k: "battery", v: 99, u: "%" }] },
    { i: 2105, n: "Attic Humidity", r: 9, t: "humidity", v: 54, a: 0, ex: [{ k: "temperature", v: 78, u: "F" }] },
    { i: 2106, n: "Desk Light Sensor", r: 4, t: "illuminance", v: 320, a: 0, ex: [] },
    { i: 2107, n: "Car Presence", r: 11, t: "presence", v: "present", a: 1, ex: [] },
    { i: 2108, n: "Kitchen Smoke", r: 2, t: "smoke", v: "clear", a: 0, ex: [{ k: "battery", v: 95, u: "%" }] },
    { i: 2199, n: "Air Quality Monitor", r: 4, t: "generic", v: "82", a: 0, ex: [{ k: "battery", v: 60, u: "%" }, { k: "pressure", v: 29.9, u: "inHg" }, { k: "co2", v: 612, u: "ppm" }] },
  ];
  const locks = [
    { i: 3001, n: "Front Door", r: 11, lk: 1, st: "locked" },
    { i: 3002, n: "Garage Entry", r: 6, lk: 0, st: "unlocked" },
    { i: 3003, n: "Back Door", r: 7, lk: 1, st: "locked" },
  ];
  const music = [
    { i: 4001, n: "Living Room Sonos", r: 1, st: "playing", v: 35, tr: "Daft Punk — Get Lucky", m: "unmuted", trackIdx: 0, f: AUDIO_F_FULL },
    { i: 4002, n: "Kitchen Echo", r: 2, st: "paused", v: 50, tr: "Fleetwood Mac — Dreams", m: "unmuted", trackIdx: 1, f: AUDIO_F_FULL },
    { i: 4003, n: "Living Room Chromecast", r: 1, st: "playing", v: 60, tr: "YouTube", m: "unmuted", f: AUDIO_F_CHROMECAST },
    { i: 4004, n: "Office HomePod", r: 4, st: "playing", v: 28, tr: "Khruangbin — Texas Sun", m: "unmuted", trackIdx: 3, f: AUDIO_F_AIRPLAY },
    { i: 4005, n: "Patio Speaker", r: 7, st: "stopped", v: 0, tr: "", m: "muted", trackIdx: 2, f: AUDIO_F_FULL },
  ];
  return { config: { pollIntervalMs: 5000, useWebSocket: false, dashboardName: "Lights", roomOrder: [], favorites: [1, 5, 1001, 2103] }, rooms, devices, thermostats, tempSensors, sensors, locks, music, hubModes: ["Day", "Evening", "Night", "Away"], currentHubMode: "Day", hsmStatus: "disarmed", hsmAlert: "water", hsmAlertDesc: "Basement leak sensor", hsmEnabled: true, hsmPinEnabled: true, hsmPinRequired: true, thermostatsPopupEnabled: true, unlockPinEnabled: true, unlockPinRequired: true, scenes: [{ id: 1, n: "Good Morning" }, { id: 2, n: "Movie Time" }, { id: 3, n: "Good Night" }, { id: 4, n: "Away" }] };
}

function tstatOstateForMode(tm) {
  if (tm === "heat") return "heating";
  if (tm === "cool") return "cooling";
  if (tm === "off") return "idle";
  return "idle";
}

function musicCmdAllowed(mp, c) {
  const f = mp.f ?? AUDIO_F_FULL;
  if (c === "play") return !!(f & 1);
  if (c === "pause") return !!(f & 2);
  if (c === "stop") return !!(f & 4);
  if (c === "previousTrack") return !!(f & 8);
  if (c === "nextTrack") return !!(f & 16);
  if (c === "setVolume") return !!(f & 32);
  if (c === "mute" || c === "unmute") return !!(f & 64);
  return false;
}

function validateUnlockPin(pin) {
  if (!state.unlockPinEnabled) return { ok: true };
  if (!state.unlockPinRequired) return { ok: false, error: "pin not configured" };
  if (pin !== MOCK_UNLOCK_PIN) return { ok: false, error: "wrong pin" };
  return { ok: true };
}

function applyCmd(id, c, v, pin) {
  const dev = state.devices.find(d => d.i === id);
  if (dev) {
    if (c === "on") { dev.s = 1; if (dev.d && (dev.l == null || dev.l === 0)) dev.l = 100; }
    else if (c === "off") { dev.s = 0; }
    else if (c === "setLevel") { const lvl = Math.max(0, Math.min(100, Number(v))); dev.l = lvl; dev.s = lvl > 0 ? 1 : 0; }
    else if (c === "setCT") {
      const k = Math.max(2500, Math.min(6000, Math.round(Number(v))));
      dev.k = k;
      dev.s = 1;
    }
    else if (c === "setColor") {
      const parts = String(v || "0,100").split(",");
      dev.h = Math.max(0, Math.min(100, Math.round(Number(parts[0]))));
      dev.sat = Math.max(0, Math.min(100, Math.round(Number(parts[1] ?? 100))));
      dev.s = 1;
      dev.cm = "RGB";
    }
    return { ok: true };
  }
  const t = state.thermostats?.find(d => d.i === id);
  if (t) {
    if (c === "setMode" || c === "modeAuto" || c === "modeHeat" || c === "modeCool" || c === "off") {
      if (c === "setMode") t.tm = v;
      else if (c === "modeAuto") t.tm = "auto";
      else if (c === "modeHeat") t.tm = "heat";
      else if (c === "modeCool") t.tm = "cool";
      else if (c === "off") t.tm = "off";
      t.os = tstatOstateForMode(t.tm);
    } else if (c === "setHeat") { t.hsp = Math.round(Number(v)); if (t.tm === "heat") t.os = t.temp < t.hsp ? "heating" : "idle"; }
    else if (c === "setCool") { t.csp = Math.round(Number(v)); if (t.tm === "cool") t.os = t.temp > t.csp ? "cooling" : "idle"; }
    else if (c === "setFanMode" && t.hasFm) {
      t.fm = v;
      if (t.tm === "off" && (v === "on" || v === "circulate")) t.os = "fan";
      else if (t.tm === "off") t.os = "idle";
    }
    else if (c === "setFanSpeed" && t.hasFs) { t.fs = v; }
    return { ok: true };
  }
  const lock = state.locks?.find(d => d.i === id);
  if (lock) {
    if (c === "lock") { lock.lk = 1; lock.st = "locked"; }
    else if (c === "unlock") {
      const pinResult = validateUnlockPin(pin ?? "");
      if (!pinResult.ok) return pinResult;
      lock.lk = 0; lock.st = "unlocked";
    }
    else return { ok: false, error: "unknown command" };
    return { ok: true };
  }
  const mp = state.music?.find(d => d.i === id);
  if (mp) {
    if (!musicCmdAllowed(mp, c)) return { ok: false, error: "unsupported command" };
    if (c === "play") { mp.st = "playing"; if (!mp.tr) mp.tr = MOCK_TRACKS[mp.trackIdx ?? 0] ?? ""; }
    else if (c === "pause") { mp.st = "paused"; }
    else if (c === "stop") { mp.st = "stopped"; }
    else if (c === "nextTrack") { mp.trackIdx = ((mp.trackIdx ?? 0) + 1) % MOCK_TRACKS.length; mp.tr = MOCK_TRACKS[mp.trackIdx]; }
    else if (c === "previousTrack") { mp.trackIdx = ((mp.trackIdx ?? 0) - 1 + MOCK_TRACKS.length) % MOCK_TRACKS.length; mp.tr = MOCK_TRACKS[mp.trackIdx]; }
    else if (c === "mute") { mp.m = "muted"; }
    else if (c === "unmute") { mp.m = "unmuted"; }
    else if (c === "setVolume") { mp.v = Math.max(0, Math.min(100, Math.round(Number(v)))); if (mp.v > 0) mp.m = "unmuted"; }
    else return { ok: false, error: "unknown command" };
    return { ok: true };
  }
  return { ok: false, error: "device not found" };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : null);
      } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

const mime = {
  "/": "text/html",
  "/app.css": "text/css",
  "/app-pre.js": "application/javascript",
  "/app.js": "application/javascript",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  if (p === "/" ) {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(read("src/index.html"));
  }
  if (p === "/app.css") {
    res.writeHead(200, { "Content-Type": "text/css" });
    return res.end(read("src/styles.css"));
  }
  if (p === "/app-pre.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    return res.end(read("src/app-pre.js"));
  }
  if (p === "/app.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    return res.end(read("src/app.js"));
  }
  if (p === "/manifest.webmanifest") {
    res.writeHead(200, { "Content-Type": "application/manifest+json" });
    return res.end(read("src/manifest.webmanifest"));
  }
  if (p === "/sw.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    return res.end(read("src/sw.js"));
  }
  if (p === "/icons/icon-192.png") {
    res.writeHead(200, { "Content-Type": "image/png" });
    return res.end(readB64Icon("mld-icon-192.png", 192));
  }
  if (p === "/icons/icon-512.png") {
    res.writeHead(200, { "Content-Type": "image/png" });
    return res.end(readB64Icon("mld-icon-512.png", 512));
  }
  if (p === "/data") {
    // occasionally flip a random light to simulate real activity
    if (state.devices.length && Math.random() < 0.15) {
      const d = state.devices[Math.floor(Math.random() * state.devices.length)];
      d.s = d.s ? 0 : 1;
      if (d.d) d.l = d.s ? 20 + Math.floor(Math.random() * 80) : 0;
    }
    // nudge thermostats so the room icon color / temp change during preview
    if (state.thermostats?.length && Math.random() < 0.25) {
      const t = state.thermostats[Math.floor(Math.random() * state.thermostats.length)];
      if (t.tm === "heat") { t.temp = Math.max(t.hsp - 4, t.temp + (Math.random() < 0.5 ? -1 : 1)); t.os = t.temp >= t.hsp ? "idle" : "heating"; }
      else if (t.tm === "cool") { t.temp = Math.min(t.csp + 4, t.temp + (Math.random() < 0.5 ? -1 : 1)); t.os = t.temp <= t.csp ? "idle" : "cooling"; }
      else if (t.fm === "on" || t.fm === "circulate") { t.os = "fan"; }
      else { t.os = "idle"; }
    }
    if (state.tempSensors?.length && Math.random() < 0.2) {
      const s = state.tempSensors[Math.floor(Math.random() * state.tempSensors.length)];
      s.temp = Math.max(60, Math.min(80, s.temp + (Math.random() < 0.5 ? -1 : 1)));
    }
    // nudge sensor readings / flip binary sensors to simulate live updates
    if (state.sensors?.length && Math.random() < 0.3) {
      const sen = state.sensors[Math.floor(Math.random() * state.sensors.length)];
      if (sen.t === "motion") { const on = Math.random() < 0.5; sen.v = on ? "active" : "inactive"; sen.a = on ? 1 : 0; }
      else if (sen.t === "contact") { const op = Math.random() < 0.3; sen.v = op ? "open" : "closed"; sen.a = op ? 1 : 0; }
      else if (sen.t === "leak") { const wet = Math.random() < 0.15; sen.v = wet ? "wet" : "dry"; sen.a = wet ? 1 : 0; }
      else if (sen.t === "presence") { const p = Math.random() < 0.4; sen.v = p ? "present" : "not present"; sen.a = p ? 1 : 0; }
      else if (sen.t === "humidity") { sen.v = Math.max(20, Math.min(90, Math.round(Number(sen.v)) + (Math.random() < 0.5 ? -1 : 1))); }
      else if (sen.t === "illuminance") { sen.v = Math.max(0, Math.min(1000, Math.round(Number(sen.v)) + Math.round((Math.random() - 0.5) * 60))); }
      else if (sen.t === "smoke") { const det = Math.random() < 0.05; sen.v = det ? "detected" : "clear"; sen.a = det ? 1 : 0; }
    }
    // advance a playing music player's track occasionally to simulate live updates
    if (state.music?.length && Math.random() < 0.18) {
      const playing = state.music.filter(m => m.st === "playing");
      if (playing.length) {
        const m = playing[Math.floor(Math.random() * playing.length)];
        m.trackIdx = ((m.trackIdx ?? 0) + 1) % MOCK_TRACKS.length;
        m.tr = MOCK_TRACKS[m.trackIdx];
      }
    }
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify(state));
  }
  if (p === "/device") {
    const id = Number(url.searchParams.get("id"));
    const dev = state.devices.find(d => d.i === id);
    if (dev) {
      // simulate a dimmer restoring to a previous level when turned on
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({
        i: dev.i, d: dev.d, ct: dev.ct || 0, rgb: dev.rgb || 0,
        s: dev.s, l: dev.l, k: dev.k ?? null, h: dev.h ?? null, sat: dev.sat ?? null,
      }));
    }
    const t = state.thermostats?.find(d => d.i === id);
    if (t) {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ i: t.i, tm: t.tm, os: t.os, hsp: t.hsp, csp: t.csp, temp: t.temp, hasFm: t.hasFm, fm: t.fm, hasFs: t.hasFs, fs: t.fs }));
    }
    const s = state.tempSensors?.find(d => d.i === id);
    if (s) {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ i: s.i, temp: s.temp }));
    }
    const sen = state.sensors?.find(d => d.i === id);
    if (sen) {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ i: sen.i, t: sen.t, v: sen.v }));
    }
    const lock = state.locks?.find(d => d.i === id);
    if (lock) {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ i: lock.i, lk: lock.lk, st: lock.st }));
    }
    const mp = state.music?.find(d => d.i === id);
    if (mp) {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ i: mp.i, st: mp.st, v: mp.v, tr: mp.tr, m: mp.m, f: mp.f ?? AUDIO_F_FULL }));
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end('{"error":"not found"}');
  }
  if (p === "/cmd") {
    const id = Number(url.searchParams.get("id"));
    const c = url.searchParams.get("c");
    const v = url.searchParams.get("v");
    const pin = url.searchParams.get("pin");
    const result = applyCmd(id, c, v, pin);
    const status = result.ok ? 200 : (result.error === "device not found" ? 404 : result.error === "wrong pin" ? 403 : 400);
    res.writeHead(status, { "Content-Type": "application/json" });
    return res.end(result.ok ? '{"ok":true}' : JSON.stringify({ ok: false, error: result.error }));
  }
  if (p === "/cmd/batch" && req.method === "POST") {
    let body;
    try { body = await readJsonBody(req); } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end('{"ok":false,"error":"invalid json"}');
    }
    const commands = body?.commands;
    if (!Array.isArray(commands) || !commands.length) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end('{"ok":false,"error":"missing commands"}');
    }
    const errors = [];
    for (const item of commands) {
      const result = applyCmd(Number(item.id), item.c, item.v ?? null, item.pin ?? null);
      if (!result.ok) errors.push({ id: item.id, error: result.error });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      ok: errors.length === 0,
      total: commands.length,
      failed: errors.length,
      errors,
    }));
  }
  if (p === "/settings/room-order" || p === "/room-order") {
    const orderParam = url.searchParams.get("order");
    if (req.method === "GET" && orderParam) {
      const order = orderParam.split(",").map(s => s.trim()).filter(Boolean);
      const valid = new Set(state.rooms.map(r => String(r.id)));
      valid.add("-1");
      const validated = [];
      const seen = new Set();
      for (const item of order) {
        const key = String(item);
        if (!valid.has(key) || seen.has(key)) continue;
        seen.add(key);
        validated.push(key === "-1" ? -1 : Number(key));
      }
      if (!validated.length) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end('{"ok":false,"error":"empty order"}');
      }
      state.config.roomOrder = validated;
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, order: validated }));
    }
    if (req.method === "POST") {
      let body;
      try { body = await readJsonBody(req); } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end('{"ok":false,"error":"invalid json"}');
      }
      const order = body?.order;
      if (!Array.isArray(order) || !order.length) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end('{"ok":false,"error":"missing order"}');
      }
      const valid = new Set(state.rooms.map(r => String(r.id)));
      valid.add("-1");
      const validated = [];
      const seen = new Set();
      for (const item of order) {
        const key = String(item);
        if (!valid.has(key) || seen.has(key)) continue;
        seen.add(key);
        validated.push(key === "-1" ? -1 : Number(key));
      }
      if (!validated.length) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end('{"ok":false,"error":"empty order"}');
      }
      state.config.roomOrder = validated;
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, order: validated }));
    }
  }
  if (p === "/hub-mode") {
    const modeParam = url.searchParams.get("mode");
    if (req.method === "GET" && modeParam) {
      if (!state.hubModes.includes(modeParam)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end('{"ok":false,"error":"unknown mode"}');
      }
      state.currentHubMode = modeParam;
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, mode: modeParam }));
    }
    if (req.method === "POST") {
      let body;
      try { body = await readJsonBody(req); } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end('{"ok":false,"error":"invalid json"}');
      }
      const mode = body?.mode;
      if (!mode || !state.hubModes.includes(mode)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end('{"ok":false,"error":"unknown mode"}');
      }
      state.currentHubMode = mode;
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, mode }));
    }
  }
  if (p === "/hsm") {
    const modeParam = url.searchParams.get("mode");
    const pinParam = url.searchParams.get("pin");
    const applyHsm = (mode, pin) => {
      if (!state.hsmEnabled) {
        return { ok: false, status: 400, error: "HSM control disabled" };
      }
      if (!HSM_VALID_MODES.has(mode)) {
        return { ok: false, status: 400, error: "unknown mode" };
      }
      if (state.hsmPinEnabled) {
        if (!state.hsmPinRequired) {
          return { ok: false, status: 400, error: "pin not configured" };
        }
        if (pin !== MOCK_HSM_PIN) {
          return { ok: false, status: 403, error: "wrong pin" };
        }
      }
      if (mode === "cancelAlerts") {
        state.hsmAlert = "";
        state.hsmAlertDesc = "";
      } else if (HSM_MODE_TO_STATUS[mode]) {
        state.hsmStatus = HSM_MODE_TO_STATUS[mode];
        if (mode !== "armRules" && mode !== "disarmRules") {
          state.hsmAlert = "";
          state.hsmAlertDesc = "";
        }
      }
      return {
        ok: true,
        mode,
        status: state.hsmStatus,
        alert: state.hsmAlert,
        alertDesc: state.hsmAlertDesc,
      };
    };
    if (req.method === "GET" && modeParam) {
      const result = applyHsm(modeParam, pinParam ?? "");
      res.writeHead(result.ok ? 200 : result.status, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(result.ok
        ? { ok: true, mode: result.mode, status: result.status, alert: result.alert, alertDesc: result.alertDesc }
        : { ok: false, error: result.error }));
    }
    if (req.method === "POST") {
      let body;
      try { body = await readJsonBody(req); } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end('{"ok":false,"error":"invalid json"}');
      }
      const mode = body?.mode;
      const pin = body?.pin ?? "";
      if (!mode) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end('{"ok":false,"error":"missing mode"}');
      }
      const result = applyHsm(mode, pin);
      res.writeHead(result.ok ? 200 : result.status, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(result.ok
        ? { ok: true, mode: result.mode, status: result.status, alert: result.alert, alertDesc: result.alertDesc }
        : { ok: false, error: result.error }));
    }
  }
  if (p === "/scene/activate") {
    const idParam = url.searchParams.get("id");
    if (req.method === "GET" && idParam) {
      const sceneId = Number(idParam);
      if (!state.scenes?.some(s => s.id === sceneId)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end('{"ok":false,"error":"scene not found"}');
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, id: sceneId }));
    }
    if (req.method === "POST") {
      let body;
      try { body = await readJsonBody(req); } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end('{"ok":false,"error":"invalid json"}');
      }
      const sceneId = Number(body?.id);
      if (!state.scenes?.some(s => s.id === sceneId)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end('{"ok":false,"error":"scene not found"}');
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, id: sceneId }));
    }
  }
  if (p === "/favorites") {
    const idsParam = url.searchParams.get("ids");
    const validIds = new Set([
      ...state.devices.map(d => d.i),
      ...(state.thermostats || []).map(t => t.i),
      ...(state.tempSensors || []).map(s => s.i),
      ...(state.sensors || []).map(s => s.i),
    ]);
    const validateIds = (raw) => {
      const validated = [];
      const seen = new Set();
      for (const item of raw) {
        const id = Number(item);
        if (!validIds.has(id) || seen.has(id)) continue;
        seen.add(id);
        validated.push(id);
      }
      return validated;
    };
    if (req.method === "GET" && idsParam != null) {
      const ids = validateIds(idsParam.split(",").map(s => s.trim()).filter(Boolean));
      state.config.favorites = ids;
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, ids }));
    }
    if (req.method === "POST") {
      let body;
      try { body = await readJsonBody(req); } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end('{"ok":false,"error":"invalid json"}');
      }
      const ids = validateIds(body?.ids || []);
      state.config.favorites = ids;
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, ids }));
    }
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

const PORT = process.env.PORT || 4321;
server.listen(PORT, () => {
  console.log(`Preview: http://localhost:${PORT}/  (${state.devices.length} mock lights, ${state.thermostats?.length || 0} thermostats, ${state.locks?.length || 0} locks, ${state.music?.length || 0} music players, ${state.tempSensors?.length || 0} temp sensors, ${state.sensors?.length || 0} other sensors, ${state.rooms.length} rooms)`);
  console.log(`data payload: ${(JSON.stringify(state).length / 1024).toFixed(1)} KB`);
});
