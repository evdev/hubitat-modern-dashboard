import {
  HOLIDAY_API_VERSION,
  OCCASIONS,
  addDays,
  buildDeviceTimeline,
  devicesInActions,
  emptyTemplate,
  formatHubTime,
  isListedNear,
  occasionLabel,
  templateBadge,
  resolveTemplate,
  templateErrors,
  thermostatTone,
  zonedMs,
  zonedParts,
} from "../lib/holiday-core.mjs";

const HOLIDAY_CSS = __HOLIDAY_CSS__;

function M() {
  return globalThis.__MLD;
}

function ce(tag, cls) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  return el;
}
function flash(msg, err) { M().flash(msg, err); }
function catalog() {
  const api = M();
  const live = api.holidayBridge ? api.holidayBridge() : {};
  return {
    lights: api.devices || [],
    outlets: api.outlets || [],
    shades: api.windowShades || [],
    fans: api.ceilingFans || [],
    locks: api.locks || [],
    thermostats: api.thermostats || [],
    hubModes: api.hubModes || [],
    schedules: live.schedules || [],
    rooms: api.rooms || [],
    use24: live.use24 === true,
    tz: live.tz || "",
  };
}

let laterOpen = false;
const pauseBusy = new Set();
const skipPending = new Map();
let laterPack = null;
let laterLoading = false;
let laterError = "";
let settingsAdvancedOpen = false;
let setupOffered = false;
let model = null;
let view = "list";
let detailId = null;
let lightId = null;
let wizard = null;
let settingsDraft = null;
let settingsSavedFingerprint = "";
let hostEl = null;

function injectCss() {
  if (document.getElementById("mld-holiday-css")) return;
  const style = document.createElement("style");
  style.id = "mld-holiday-css";
  style.textContent = HOLIDAY_CSS;
  document.head.appendChild(style);
}

async function load() {
  const next = await M().getJson("holidays");
  return acceptStatus(next);
}

function acceptStatus(next) {
  if (!next || typeof next !== "object") return next;
  if (laterPack && laterPack.revision !== next.revision) laterPack = null;
  model = next;
  return next;
}

function hubDefersLater() {
  return Number.isFinite(Number(model?.laterCount));
}

function deferredLaterCount() {
  if (hubDefersLater()) return Number(model.laterCount);
  return (model?.rows || []).filter((row) => !isWithinTwoWeeks(row.start)).length;
}

function laterRows() {
  if (laterPack && laterPack.revision === model?.revision) return laterPack.rows || [];
  if (!hubDefersLater()) return (model?.rows || []).filter((row) => !isWithinTwoWeeks(row.start));
  return [];
}

function laterReady() {
  return !hubDefersLater() || (laterPack && laterPack.revision === model?.revision);
}

function startLaterLoad() {
  if (laterLoading || !hubDefersLater()) return;
  laterLoading = true;
  const revision = model?.revision;
  M().getJson("holidays/later").then((data) => {
    if (model?.revision !== revision) return;
    if (!data?.ok || !Array.isArray(data.rows)) {
      laterError = "Couldn’t load later holidays.";
      return;
    }
    laterPack = { revision, rows: data.rows, spans: data.spans || [] };
    for (const occasion of pauseBusy) {
      const row = (model?.rows || []).find((r) => r.occasion === occasion);
      if (row) applyPause(occasion, row.paused === true);
    }
    reapplyPendingSkips();
    laterError = "";
  }).catch(() => {
    if (model?.revision === revision) laterError = "Couldn’t load later holidays.";
  }).finally(() => {
    laterLoading = false;
    if (model?.revision === revision && (laterOpen || view === "detail")) render();
  });
}

async function post(path, body) {
  const res = await M().postJsonSilent(path, body);
  if (!res?.ok) {
    // The password dialog is the recovery. Callers supply their own fallback.
    if (res?.status === 401) return { ok: false };
    const message = res?.error || res?.data?.error || "Could not save";
    return { ok: false, error: String(message) };
  }
  return res.data || { ok: true };
}

function fmt(ms) {
  const tz = hubTz();
  return formatHubTime(ms, tz, catalog().use24 === true);
}

function hubTz() {
  return model?.tz || catalog().tz || "UTC";
}

function upcomingFriday() {
  const tz = hubTz();
  const now = model?.now || Date.now();
  let date = zonedParts(now, tz).date;
  for (let i = 0; i < 8; i++) {
    if (zonedParts(zonedMs(date, "12:00", tz), tz).weekday === "Fri" && zonedMs(date, "23:59", tz) > now) return date;
    date = addDays(date, 1);
  }
  return date;
}

function offeredKinds() {
  const reported = Array.isArray(model?.deviceKinds) && model.deviceKinds.length
    ? model.deviceKinds.map(String)
    : ["light", "outlet"];
  const api = M();
  const thermostatReady = typeof api.schedTstatModeChoices === "function"
    && typeof api.schedTstatNormalize === "function"
    && typeof api.schedTstatSetMode === "function"
    && typeof api.thermostatSetpointsForMode === "function";
  return thermostatReady ? reported : reported.filter((k) => k !== "thermostat");
}

function parentUpdateNote() {
  const reported = Array.isArray(model?.deviceKinds) ? model.deviceKinds.map(String) : ["light", "outlet"];
  const missing = ["blind", "fan", "lock", "thermostat"].filter((k) => !reported.includes(k));
  if (!missing.length && offeredKinds().includes("thermostat")) return "";
  if (missing.length) return "Update Modern Dashboard to schedule blinds, fans, locks, and thermostats.";
  return "Reload the dashboard to schedule thermostats.";
}

function errorStepKey(label) {
  return String(label || "").split(" ")[0];
}

function namedErrorText(errs) {
  const lines = [];
  const seen = new Set();
  for (const err of errs || []) {
    const step = questionTitle(errorStepKey(err.label));
    const detail = err.error
      ? String(err.error).replace(/^./, (c) => c.toUpperCase())
      : "A device is listed twice with different commands.";
    const line = `${step}: ${detail}`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines.join(" ");
}

function errorsForStep(errs, key) {
  return (errs || []).filter((err) => errorStepKey(err.label) === key);
}

function stateIsOn(s) {
  const kind = s?.kind || "light";
  if (kind === "blind") return s.open === true;
  if (kind === "fan") return s.on === true;
  if (kind === "lock") return s.locked === false;
  if (kind === "thermostat") return String(s.mode || "").toLowerCase() !== "off";
  return s.on === true;
}

function stateChipText(s) {
  const name = deviceName(s.id);
  const kind = s?.kind || "light";
  if (kind === "blind") {
    if (s.open === true && s.position != null && s.position !== "") return `${name} open ${s.position}%`;
    return name + (s.open === true ? " open" : " closed");
  }
  if (kind === "fan") {
    if (s.on !== true) return name + " off";
    return s.speed ? `${name} ${fanSpeedLabel(s.speed)}` : name + " on";
  }
  if (kind === "lock") return name + (s.locked === false ? " unlocked" : " locked");
  if (kind === "thermostat") {
    const bits = [];
    if (s.mode) bits.push(String(s.mode));
    if (s.heat != null) bits.push(s.heat + "°");
    if (s.cool != null) bits.push(s.cool + "°");
    if (s.fanMode) bits.push("fan " + s.fanMode);
    return name + (bits.length ? " " + bits.join(" ") : " set");
  }
  let text = name + (s.on ? " on" : " off");
  if (s.on && s.level != null && s.level !== "") text += " " + s.level + "%";
  if (s.on && s.ct != null && s.ct !== "") text += " " + s.ct + "K";
  return text;
}

function fridaySwitch() {
  const friday = upcomingFriday();
  const settings = wizard?.step === "timing" ? wizard.settings : model.settings;
  const row = ce("label", "sched-hint");
  const check = ce("input");
  check.type = "checkbox";
  check.checked = settings?.fridayOverrideDate === friday;
  check.addEventListener("change", async () => {
    settings.fridayOverrideDate = check.checked ? friday : "";
    if (settings === model.settings) {
      const saved = await post("holidays/save", { revision: model.revision, settings: model.settings });
      if (!saved?.ok) flash(saved?.error || "Could not save", true);
      else { acceptStatus(saved); render(); }
    }
  });
  row.appendChild(check);
  row.appendChild(document.createTextNode(" This Friday: regular candle-lighting time"));
  return row;
}

function isWithinTwoWeeks(start) {
  const at = Number(start);
  if (!Number.isFinite(at)) return false;
  return isListedNear(at, Number(model?.now) || Date.now(), hubTz());
}

function nearHolidaySpans() {
  return (model?.spans || []).filter((span) => isWithinTwoWeeks(span.start));
}

function spanById(id) {
  return (model?.spans || []).find((s) => s.id === id)
    || (laterPack?.spans || []).find((s) => s.id === id);
}

function deviceName(id) {
  const cat = catalog();
  const all = [
    ...(cat.lights || []), ...(cat.outlets || []), ...(cat.shades || []),
    ...(cat.fans || []), ...(cat.locks || []), ...(cat.thermostats || []),
  ];
  const hit = all.find((d) => String(d.i) === String(id));
  return hit?.n || `Device ${id}`;
}

function knownDeviceIds() {
  const cat = catalog();
  return new Set([
    ...(cat.lights || []), ...(cat.outlets || []), ...(cat.shades || []),
    ...(cat.fans || []), ...(cat.locks || []), ...(cat.thermostats || []),
  ].map((d) => String(d.i)));
}

function mount(host) {
  injectCss();
  hostEl = host;
  if (model) {
    render();
    return;
  }
  if (globalThis.mldHolidayMissing) {
    host.innerHTML = "";
    const p = ce("p", "sched-empty");
    p.textContent = "Shabbat & holidays did not load. Install mDash Shabbat and Holidays from Hubitat Package Manager, then reload this page.";
    host.appendChild(p);
    return;
  }
  renderShell("Loading Shabbat & holidays…");
  load().then(() => render()).catch(() => {
    renderShell("Couldn’t load Shabbat & holidays.");
  });
}

function renderShell(text) {
  hostEl.innerHTML = "";
  const p = ce("p", "sched-empty");
  p.textContent = text;
  hostEl.appendChild(p);
}

function render() {
  if (!hostEl) return;
  clearDetailLabelObservers();
  hostEl.innerHTML = "";
  if (!model?.ok && model?.error) {
    renderShell(model.error);
  } else if (model?.apiVersion !== HOLIDAY_API_VERSION) {
    renderShell("Update the Shabbat & holidays files so the dashboard and hub app match.");
  }   else if (view === "wizard") hostEl.appendChild(renderWizard());
  else if (view === "detail") hostEl.appendChild(renderDetail());
  else if (view === "settings") hostEl.appendChild(renderSettings());
  else if (view === "light") hostEl.appendChild(renderByLight());
  else hostEl.appendChild(renderList());
  markPressedButtons(hostEl);
  syncSchedulerChrome();
  if (view === "list" && !setupOffered && needsFirstRun()) {
    setupOffered = true;
    setTimeout(() => { if (view === "list") openWizard(null); }, 0);
  }
}

let scheduleChromeHidden = false;
let refreshingScheduler = false;

function syncSchedulerChrome() {
  const cover = view !== "list";
  if (cover === scheduleChromeHidden || refreshingScheduler) return;
  scheduleChromeHidden = cover;
  const refresh = M()?.renderSchedulerView;
  if (typeof refresh !== "function") return;
  refreshingScheduler = true;
  try { refresh(); }
  finally { refreshingScheduler = false; }
}

function needsFirstRun() {
  const s = model?.settings;
  if (!s) return false;
  return !String(s.holidayMode || "").trim() || !String(s.endMode || "").trim();
}

function hubModeNames() {
  const live = catalog().hubModes || [];
  if (live.length) return live;
  return Array.isArray(model?.modes) ? model.modes.map(String) : [];
}

function renderList() {
  const wrap = ce("div", "holiday-slot");
  const head = ce("div", "holiday-head");
  const title = ce("h3", "sched-section-title");
  title.textContent = "Shabbat & holidays";
  head.appendChild(title);
  const actions = ce("div", "holiday-head");
  const setup = ce("button", "ghost-btn");
  setup.type = "button";
  const firstRun = needsFirstRun();
  setup.textContent = firstRun ? "Set up" : "Settings";
  setup.addEventListener("click", () => { if (firstRun) openWizard(null); else openSettings(); });
  actions.appendChild(setup);
  const byLight = ce("button", "ghost-btn");
  byLight.type = "button";
  byLight.textContent = "By device";
  byLight.addEventListener("click", () => { view = "light"; lightId = null; render(); });
  actions.appendChild(byLight);
  head.appendChild(actions);
  wrap.appendChild(head);
  if (model?.calendar?.error) {
    const w = ce("p", "holiday-warn");
    w.textContent = model.calendar.error;
    wrap.appendChild(w);
  }
  if (model?.preflight && !model.preflight.ok) {
    const w = ce("p", "holiday-warn");
    w.textContent = (model.preflight.errors || []).join(" ");
    wrap.appendChild(w);
  }
  const near = (model?.rows || []).filter((row) => isWithinTwoWeeks(row.start));
  const laterCount = deferredLaterCount();
  if (!near.length && !laterCount) {
    const empty = ce("p", "sched-empty");
    empty.textContent = "No upcoming Shabbat or holiday yet. Set up a schedule to see it here.";
    wrap.appendChild(empty);
    return wrap;
  }
  const list = ce("div", "sched-list");
  for (const row of near) list.appendChild(renderRow(row));
  if (!near.length) {
    const empty = ce("p", "sched-empty");
    empty.textContent = "Nothing in the next two weeks.";
    list.appendChild(empty);
  }
  if (laterCount) list.appendChild(renderLater(laterCount));
  wrap.appendChild(list);
  return wrap;
}

function markPressedButtons(root) {
  if (!root) return;
  const groups = new Map();
  for (const b of root.querySelectorAll("button.sched-seg, button.sched-type-card")) {
    const parent = b.parentElement;
    if (!parent) continue;
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(b);
  }
  for (const group of groups.values()) {
    const selectable = group[0].classList.contains("sched-seg")
      || group[0].parentElement.classList.contains("sched-mode-grid")
      || group.some((b) => b.classList.contains("is-active"));
    if (!selectable) continue;
    for (const b of group) b.setAttribute("aria-pressed", b.classList.contains("is-active") ? "true" : "false");
  }
}

function disclosureButton(open, label) {
  const toggle = ce("button", "holiday-room-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.innerHTML = '<svg class="holiday-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const text = ce("span");
  text.textContent = label;
  toggle.appendChild(text);
  return toggle;
}

function renderLater(count) {
  const box = ce("div", "holiday-later");
  const toggle = disclosureButton(laterOpen, `Later, after the next two weeks (${count})`);
  toggle.addEventListener("click", () => {
    laterOpen = !laterOpen;
    if (laterOpen) laterError = "";
    render();
  });
  box.appendChild(toggle);
  if (!laterOpen) return box;
  if (!laterReady()) {
    const note = ce("p", "sched-empty");
    note.textContent = laterError || "Loading later holidays…";
    box.appendChild(note);
    if (!laterError) startLaterLoad();
    return box;
  }
  const list = ce("div", "sched-list");
  for (const row of laterRows()) list.appendChild(renderRow(row));
  box.appendChild(list);
  return box;
}

function renderRow(row) {
  const el = ce("div", "sched-row holiday-list-row" + (row.skipped ? " is-off" : ""));
  el.dataset.name = `${row.name || ""} shabbat holiday`;
  const head = ce("div", "sched-row-head");
  const open = ce("button", "holiday-open-btn");
  open.type = "button";
  const name = ce("span", "sched-row-name");
  name.textContent = row.name || "Holiday";
  const when = whenLine(row);
  const meta = ce("span", "holiday-row-meta");
  fillRelationship(meta, row);
  open.appendChild(name);
  open.appendChild(when);
  open.appendChild(meta);
  open.setAttribute("aria-label", `${name.textContent}. ${when.textContent}. ${meta.textContent}`);
  open.addEventListener("click", () => openDetail(row));
  head.appendChild(open);
  head.appendChild(pauseToggle(row));
  el.appendChild(head);
  if (isThisFridayShabbat(row)) el.appendChild(fridaySwitch());
  if (row.warning) {
    const w = ce("div", "holiday-warn");
    w.textContent = row.warning;
    el.appendChild(w);
  }
  if (row.skipped && !isShabbatWeek(row)) {
    const undo = ce("button", "ghost-btn sched-icon-btn");
    undo.type = "button";
    undo.textContent = "Undo skip";
    undo.addEventListener("click", (e) => {
      e.stopPropagation();
      setSkip(row.spanId, true);
    });
    el.appendChild(undo);
  }
  return el;
}

function openDetail(row) {
  detailId = row.spanId;
  view = "detail";
  render();
}

function isShabbatWeek(item) {
  return item?.occasion === "shabbat";
}

function pauseToggle(row) {
  if (row.occasion === "shabbat") return shabbatWeekToggle(row);
  const active = !row.paused;
  const toggle = ce("button", "sched-toggle " + (active ? "is-on" : "is-off"));
  toggle.type = "button";
  toggle.setAttribute("aria-pressed", active ? "true" : "false");
  toggle.textContent = active ? "Active" : "Paused";
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePause(row.occasion);
  });
  return toggle;
}

function shabbatWeekToggle(row) {
  const paused = row.paused === true;
  const skipped = !paused && row.skipped === true;
  const active = !paused && !skipped;
  const toggle = ce("button", "sched-toggle " + (active ? "is-on" : "is-off"));
  toggle.type = "button";
  toggle.setAttribute("aria-pressed", active ? "true" : "false");
  toggle.textContent = paused ? "Paused" : skipped ? "Week skipped" : "Active";
  if (paused) toggle.title = "Shabbat is paused for every week. Open this week to resume.";
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (paused) {
      flash("Shabbat is paused for every week. Open this week to resume.");
      return;
    }
    if (!skipped && row.inProgress && !confirm("Skip this week? The hub mode will be left as it is.")) return;
    setSkip(row.spanId, skipped);
  });
  return toggle;
}

function whenLine(row) {
  const line = ce("span", "holiday-when");
  const now = Number(model?.now) || Date.now();
  let tone = "";
  let prefix = "";
  let at = row.start;
  const shabbat = isShabbatWeek(row);
  if (row.paused) {
    tone = "is-paused";
    prefix = shabbat ? "Paused. " : "Nothing will run. Would start ";
  } else if (row.skipped) {
    tone = "is-skip";
    prefix = shabbat ? "Week skipped. " : "Skipped this time. ";
  } else if (row.inProgress) {
    tone = "is-now";
    prefix = "In progress, ends ";
    at = row.end;
  } else {
    const days = dayDistance(now, Number(row.start));
    const rel = days <= 0 ? "Today" : days === 1 ? "Tomorrow" : days < 14 ? `In ${days} days` : `In ${Math.round(days / 7)} weeks`;
    prefix = `${rel}, `;
  }
  if (tone) {
    line.classList.add(tone);
    const dot = ce("span", "holiday-dot " + tone);
    dot.setAttribute("aria-hidden", "true");
    line.appendChild(dot);
  }
  line.appendChild(document.createTextNode(prefix));
  line.appendChild(document.createTextNode(`${fmtDay(at)}, `));
  const clock = ce("span", "holiday-when-clock");
  clock.textContent = fmtClock(at);
  line.appendChild(clock);
  return line;
}

function fmtOccasion(ms) {
  return `${fmtDay(ms)}, ${fmtClock(ms)}`;
}

function dayDistance(fromMs, toMs) {
  const tz = hubTz();
  const a = zonedParts(fromMs, tz).date.split("-").map(Number);
  const b = zonedParts(toMs, tz).date.split("-").map(Number);
  const utcA = Date.UTC(a[0], a[1] - 1, a[2]);
  const utcB = Date.UTC(b[0], b[1] - 1, b[2]);
  return Math.round((utcB - utcA) / 86400000);
}

function rowOccasionId(row) {
  const span = spanById(row.spanId);
  return span?.days?.[0]?.occasion || row.occasion;
}

function deviceCountForRow(row) {
  const span = spanById(row.spanId);
  if (!span) return 0;
  return devicesInActions(span.actions || []).length;
}

function relationshipTone(badge) {
  if (badge === "own schedule") return "is-own";
  if (badge === "based on Shabbat") return "is-based";
  if (badge === "uses Shabbat" || badge === "uses Pesach first days") return "is-link";
  return "is-skip";
}

function relationshipPhrase(badge) {
  return {
    "own schedule": "Its own schedule",
    "uses Shabbat": "Follows the Shabbat schedule",
    "based on Shabbat": "Based on the Shabbat schedule",
    "uses Pesach first days": "Follows the Pesach first-days schedule",
    skipped: "No schedule",
  }[badge] || "Schedule set";
}

function fillRelationship(meta, row) {
  const badge = templateBadge(rowOccasionId(row), model);
  const phrase = ce("span", "holiday-rel " + relationshipTone(badge));
  phrase.textContent = relationshipPhrase(badge);
  meta.appendChild(phrase);
  if (badge !== "skipped") {
    const count = deviceCountForRow(row);
    const devices = count === 1 ? "1 device" : count ? `${count} devices` : "No devices";
    meta.appendChild(document.createTextNode(`. ${devices}.`));
  }
  if (row.once) {
    const once = ce("span", "holiday-rel is-own");
    once.textContent = " Changed this time.";
    meta.appendChild(once);
  }
}

function isThisFridayShabbat(row) {
  const early = model?.settings?.earlyFriday;
  if (!early?.type || early.type === "off") return false;
  if (rowOccasionId(row) !== "shabbat") return false;
  return zonedParts(Number(row.start), hubTz()).date === upcomingFriday();
}

function renderDetail() {
  const span = spanById(detailId);
  const wrap = ce("div", "holiday-slot");
  wrap.appendChild(backRow("Shabbat & holidays", () => { view = "list"; render(); }));
  if (!span) {
    const waiting = hubDefersLater() && deferredLaterCount() > 0 && !laterReady();
    const p = ce("p", "sched-empty");
    p.textContent = waiting
      ? (laterError || "Loading later holidays…")
      : "That holiday is no longer on the calendar.";
    wrap.appendChild(p);
    if (waiting && !laterError) startLaterLoad();
    return wrap;
  }
  const title = ce("h3", "sched-section-title");
  title.textContent = span.name;
  wrap.appendChild(title);
  const shabbat = isShabbatWeek(span);
  const when = ce("p", "holiday-when");
  const range = `${fmt(span.start)} – ${fmt(span.end)}`;
  when.textContent = shabbat && span.paused
    ? `Paused · ${range}`
    : span.skipped
      ? `${shabbat ? "Week skipped" : "Skipped this time"} · ${range}`
      : range;
  wrap.appendChild(when);
  const known = knownDeviceIds();
  const missing = [];
  for (const a of span.actions || []) {
    for (const s of a.states || []) {
      if (!known.has(String(s.id)) && !missing.includes(String(s.id))) missing.push(String(s.id));
    }
  }
  if (missing.length) {
    const w = ce("p", "holiday-warn");
    w.textContent = "A saved device is no longer in the dashboard: " + missing.map(deviceName).join(", ");
    wrap.appendChild(w);
  }
  const tools = ce("div", "holiday-tools");
  const edit = ce("button", "ghost-btn sched-primary-btn");
  edit.type = "button";
  edit.textContent = "Edit usual schedule";
  edit.title = span.once
    ? "Changes every other time. This time keeps its own schedule."
    : "Changes the schedule for every time";
  edit.addEventListener("click", () => openWizard(span.occasion));
  tools.appendChild(edit);
  const once = ce("button", "ghost-btn");
  once.type = "button";
  once.textContent = "Change this time only";
  once.addEventListener("click", () => openOnceWizard(span));
  tools.appendChild(once);
  if (span.once) {
    const note = ce("p", "holiday-when");
    note.textContent = "This time has its own schedule. The usual schedule is unchanged.";
    wrap.appendChild(note);
    const clear = ce("button", "ghost-btn");
    clear.type = "button";
    clear.textContent = "Use the usual schedule";
    clear.addEventListener("click", () => {
      if (!confirm("Use the usual schedule for this time? The one-time change will be removed.")) return;
      clearOnce(span.id);
    });
    tools.appendChild(clear);
  }
  const skip = ce("button", "ghost-btn");
  skip.type = "button";
  skip.textContent = span.skipped ? "Undo skip" : (shabbat ? "Skip this week" : "Skip this time");
  skip.addEventListener("click", () => {
    if (!span.skipped) {
      const now = Number(model?.now) || Date.now();
      const live = Number(span.start) <= now && Number(span.end) > now;
      const ask = shabbat
        ? (live ? "Skip this week? The hub mode will be left as it is." : "Skip this week?")
        : (live ? "Skip this occurrence? The hub mode will be left as it is." : "Skip this occurrence?");
      if (!confirm(ask)) return;
    }
    setSkip(span.id, !!span.skipped);
  });
  tools.appendChild(skip);
  if (shabbat) {
    const every = ce("button", "ghost-btn");
    every.type = "button";
    every.textContent = span.paused ? "Resume" : "Pause every week";
    every.addEventListener("click", () => togglePause("shabbat"));
    tools.appendChild(every);
  }
  wrap.appendChild(tools);
  const tryRow = ce("div", "holiday-tools holiday-tools-quiet");
  const tryLabel = ce("span", "holiday-kicker");
  tryLabel.textContent = "Try on devices";
  tryRow.appendChild(tryLabel);
  const testStart = ce("button", "ghost-btn");
  testStart.type = "button";
  testStart.textContent = "Run candle-lighting actions";
  testStart.addEventListener("click", () => runHolidayTest(span, "start"));
  tryRow.appendChild(testStart);
  const testEnd = ce("button", "ghost-btn");
  testEnd.type = "button";
  testEnd.textContent = "Run havdalah actions";
  testEnd.addEventListener("click", () => runHolidayTest(span, "end"));
  tryRow.appendChild(testEnd);
  wrap.appendChild(tryRow);
  const tryNote = ce("p", "holiday-when");
  tryNote.textContent = "Runs those actions now. The hub mode stays as it is.";
  wrap.appendChild(tryNote);
  const removeRow = ce("div", "holiday-tools holiday-remove");
  const remove = ce("button", "ghost-btn sched-del-btn");
  remove.type = "button";
  remove.textContent = "Remove schedule";
  remove.addEventListener("click", () => removeSchedule(span.occasion));
  removeRow.appendChild(remove);
  wrap.appendChild(removeRow);
  wrap.appendChild(renderEventList(span.actions || []));
  const section = ce("div", "holiday-section-head");
  const sectionTitle = ce("h4", "holiday-section");
  sectionTitle.textContent = "Each device";
  section.appendChild(sectionTitle);
  section.appendChild(timelineLegend(span.actions || []));
  wrap.appendChild(section);
  wrap.appendChild(renderTimelines(span, span.actions || []));
  return wrap;
}

function renderByLight() {
  const wrap = ce("div", "holiday-slot");
  wrap.appendChild(backRow("Shabbat & holidays", () => { view = "list"; render(); }));
  const title = ce("h3", "sched-section-title");
  title.textContent = "By device";
  wrap.appendChild(title);
  const scale = ce("p", "holiday-when");
  const spans = nearHolidaySpans().slice(0, 8);
  const longest = spans.reduce((max, span) => Math.max(max, Number(span.end) - Number(span.start)), 1);
  scale.textContent = "A longer holiday is drawn longer, so the bars can be compared.";
  wrap.appendChild(scale);
  const ids = new Map();
  for (const span of spans) {
    for (const d of devicesInActions(span.actions || [])) ids.set(d.id, d);
  }
  if (!lightId && ids.size) lightId = [...ids.keys()][0];
  const pickerLabel = ce("label", "holiday-kicker");
  pickerLabel.textContent = "Device";
  const picker = ce("select", "sched-input");
  picker.setAttribute("aria-label", "Device");
  for (const id of ids.keys()) {
    const opt = ce("option");
    opt.value = id;
    opt.textContent = deviceName(id);
    opt.selected = id === lightId;
    picker.appendChild(opt);
  }
  picker.addEventListener("change", () => { lightId = picker.value; render(); });
  wrap.appendChild(pickerLabel);
  wrap.appendChild(picker);
  const note = alsoControlled(lightId);
  if (note) wrap.appendChild(note);
  for (const span of spans) {
    const label = ce("p", "holiday-badge");
    label.textContent = span.name;
    wrap.appendChild(label);
    wrap.appendChild(renderCompactBar(span, lightId, null, { scale: longest }));
  }
  return wrap;
}

function renderTimelines(span, actions) {
  const box = ce("div", "holiday-timeline");
  const devices = devicesInActions(actions);
  if (!devices.length) {
    const p = ce("p", "sched-empty");
    p.textContent = "No devices in this schedule.";
    box.appendChild(p);
    return box;
  }
  for (const d of devices) {
    const row = ce("div", "holiday-bar-row");
    const name = ce("div", "holiday-bar-name");
    name.textContent = deviceName(d.id);
    name.title = deviceName(d.id);
    row.appendChild(name);
    row.appendChild(renderCompactBar(span, d.id, actions, { detail: true }));
    box.appendChild(row);
  }
  return box;
}

function nightTitle(day, days) {
  const same = (days || []).filter((d) => d.occasion === day.occasion);
  const base = occasionLabel(day.occasion);
  if (same.length < 2) return base;
  const n = same.indexOf(day) + 1;
  return base + " " + (["", "I", "II", "III"][n] || String(n));
}

function timelineMarks(span) {
  const tz = hubTz();
  const marks = [];
  const days = span.days || [];
  for (const day of days) {
    const at = Number(day.start);
    if (at >= span.start && at <= span.end) marks.push({ at, kind: "night", label: nightTitle(day, days) });
  }
  let date = zonedParts(span.start, tz).date;
  for (let n = 0; n < 8; n++) {
    const midnight = zonedMs(date, "00:00", tz);
    if (midnight > span.start && midnight < span.end) {
      marks.push({ at: midnight, kind: "midnight", label: formatHubTime(midnight, tz, catalog().use24 === true) });
    }
    if (midnight >= span.end) break;
    date = addDays(date, 1);
  }
  return marks.sort((a, b) => a.at - b.at);
}

const ZOOM_MS = 8 * 3600000;

function renderCompactBar(span, id, actions, opts) {
  const line = ce("div", "holiday-bar-line");
  const track = renderSpanTrack(span, id, actions, {
    from: span.start, to: span.end, changes: true, detail: !!opts?.detail,
  });
  const duration = Math.max(Number(span.end) - Number(span.start), 1);
  if (opts?.scale && opts.scale > duration + 1000) {
    const ratio = Math.max(0.18, duration / opts.scale);
    line.classList.add("is-scaled");
    line.style.width = `calc((100% - var(--holiday-bar-end, 26px)) * ${ratio.toFixed(4)} + var(--holiday-bar-end, 26px))`;
  }
  line.appendChild(track);
  const expand = ce("button", "ghost-btn holiday-expand");
  expand.type = "button";
  expand.title = "Expand";
  expand.setAttribute("aria-label", "Expand " + deviceName(id) + " timeline");
  expand.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6"/><path d="M21 3 14 10"/><path d="M9 21H3v-6"/><path d="M3 21l7-7"/></svg>';
  expand.addEventListener("click", () => openTimelinePopup(span, id, actions || span.actions || []));
  line.appendChild(expand);
  return line;
}

function renderSpanTrack(span, id, actions, opts) {
  const from = opts?.from ?? span.start;
  const to = opts?.to ?? span.end;
  const scale = Math.max(opts?.scale ?? (to - from), 1);
  const list = actions || span.actions || [];
  const tl = opts?.timeline || buildDeviceTimeline(span, list, id);
  const track = ce("div", "holiday-track" + (opts?.detail ? " holiday-track-detail" : ""));
  const bar = ce("div", "holiday-bar");
  const leftOf = (at) => `${((at - from) / scale) * 100}%`;
  for (const seg of tl.segments) {
    const a = Math.max(seg.start, from);
    const b = Math.min(seg.end, to);
    if (b <= a) continue;
    const piece = ce("div", "holiday-seg is-" + (seg.tone || seg.state));
    piece.style.left = leftOf(a);
    piece.style.width = `${((b - a) / scale) * 100}%`;
    const bits = [fmt(seg.start)];
    if (seg.label) bits.push(seg.label);
    else {
      bits.push(seg.state);
      if (seg.state === "on" && seg.level != null) bits.push(seg.level + "%");
    }
    piece.title = bits.join(" ");
    if (seg.tone === "auto") {
      piece.appendChild(thermostatHalf("heat", seg.heat));
      piece.appendChild(thermostatHalf("cool", seg.cool));
    } else if (seg.tone === "heat") {
      appendSetpoint(piece, seg.heat);
    } else if (seg.tone === "cool") {
      appendSetpoint(piece, seg.cool);
    } else if (seg.caption) {
      appendCaption(piece, seg.caption);
    }
    if (seg.tone === "blind-open" && seg.level != null) piece.style.setProperty("--open", seg.level + "%");
    bar.appendChild(piece);
  }
  const now = model?.now || Date.now();
  if (now >= from && now <= to) {
    const mark = ce("div", "holiday-now");
    mark.style.left = leftOf(now);
    bar.appendChild(mark);
  }
  if (to < from + scale - 1000) {
    const cap = ce("div", "holiday-zoom-cap");
    cap.style.left = leftOf(to);
    bar.appendChild(cap);
  }
  if (opts?.marks || opts?.changes) {
    for (const change of tl.changes) {
      if (!markInSlice(change.at, from, to, span.end)) continue;
      const pin = ce("div", "holiday-change");
      pin.style.left = leftOf(change.at);
      pin.title = fmtClock(change.at);
      bar.appendChild(pin);
    }
  }
  track.appendChild(bar);
  const outside = opts?.detail ? ce("div", "holiday-outside") : null;
  if (outside) track.appendChild(outside);
  if (opts?.marks) track.appendChild(renderHourScale(span, from, to, scale, tl.changes));
  else if (opts?.changes) {
    const hours = renderChangeTimes(from, to, scale, tl.changes, span.end);
    track.appendChild(hours);
    watchCompactTimes(hours);
  }
  if (outside) watchDetailLabels(track, bar, outside);
  return track;
}

const detailLabelObservers = [];

function clearDetailLabelObservers() {
  for (const ro of detailLabelObservers) ro.disconnect();
  detailLabelObservers.length = 0;
}

function watchCompactTimes(hours) {
  const place = () => spaceCompactTimes(hours);
  const ro = new ResizeObserver(place);
  ro.observe(hours);
  detailLabelObservers.push(ro);
  requestAnimationFrame(place);
}

function spaceCompactTimes(hours) {
  if (!hours.isConnected) return;
  const labels = [...hours.querySelectorAll(".holiday-mark")];
  const width = hours.clientWidth;
  if (width < 1) return;
  for (const label of labels) {
    label.hidden = false;
    label.style.marginLeft = "0px";
  }
  const parent = hours.getBoundingClientRect();
  let edge = 0;
  for (const label of labels) {
    const rect = label.getBoundingClientRect();
    const left = rect.left - parent.left;
    if (left < edge) {
      const shift = edge - left;
      if (left + shift + rect.width > width + 1) {
        label.hidden = true;
        continue;
      }
      label.style.marginLeft = `${Math.ceil(shift)}px`;
      edge = left + shift + rect.width + 6;
    } else {
      edge = left + rect.width + 6;
    }
  }
}

function labelHosts(bar) {
  const hosts = [];
  for (const seg of bar.querySelectorAll(".holiday-seg")) {
    if (seg.querySelector(":scope > .holiday-setpoint")) hosts.push(seg);
    for (const half of seg.querySelectorAll(":scope > .holiday-seg-half")) {
      if (half.querySelector(":scope > .holiday-setpoint")) hosts.push(half);
    }
  }
  return hosts;
}

function watchDetailLabels(track, bar, layer) {
  const place = () => {
    if (!track.isConnected) return;
    for (const host of bar.querySelectorAll(".holiday-seg, .holiday-seg-half")) host.classList.remove("is-label-out");
    layer.replaceChildren();
    const base = bar.getBoundingClientRect();
    if (base.width < 1) return;
    for (const host of labelHosts(bar)) {
      const label = host.querySelector(":scope > .holiday-setpoint");
      if (!label) continue;
      const width = label.scrollWidth;
      if (host.clientWidth >= width + 8) continue;
      host.classList.add("is-label-out");
      const pin = ce("span", "holiday-setpoint is-outside");
      pin.textContent = label.textContent;
      const rect = host.getBoundingClientRect();
      let left = host.classList.contains("is-cool") ? rect.right - base.left - width : rect.left - base.left;
      const maxLeft = Math.max(0, base.width - width);
      pin.style.left = `${Math.max(0, Math.min(left, maxLeft))}px`;
      layer.appendChild(pin);
    }
  };
  const ro = new ResizeObserver(place);
  ro.observe(bar);
  detailLabelObservers.push(ro);
  requestAnimationFrame(place);
}

function renderChangeTimes(from, to, scale, changes, spanEnd) {
  const hours = ce("div", "holiday-hours holiday-compact-times");
  const leftOf = (at) => `${((at - from) / scale) * 100}%`;
  const place = (at) => {
    const pct = (at - from) / scale;
    if (pct < 0.08) return "none";
    if (pct > 0.92) return "translateX(-100%)";
    return "translateX(-50%)";
  };
  let lastPct = -1;
  for (const change of changes || []) {
    if (!markInSlice(change.at, from, to, spanEnd)) continue;
    const pct = (change.at - from) / scale;
    if (lastPct >= 0 && pct - lastPct < 0.12) continue;
    lastPct = pct;
    const label = ce("span", "holiday-mark holiday-mark-change");
    label.style.left = leftOf(change.at);
    label.style.transform = place(change.at);
    label.textContent = fmtClock(change.at).replace(/\s*(AM|PM)$/i, "");
    hours.appendChild(label);
  }
  return hours;
}

function thermostatHalf(tone, value) {
  const half = ce("span", "holiday-seg-half is-" + tone);
  appendSetpoint(half, value);
  return half;
}

function appendSetpoint(parent, value) {
  if (value == null || value === "") return;
  appendCaption(parent, value + "°");
}

function appendCaption(parent, text) {
  if (!text) return;
  const label = ce("span", "holiday-setpoint");
  label.textContent = text;
  parent.appendChild(label);
}

function markInSlice(at, from, to, spanEnd) {
  if (at < from || at > to) return false;
  const last = to >= spanEnd - 1000;
  return last ? at <= to : at < to;
}

function renderHourScale(span, from, to, scale, changes) {
  const hours = ce("div", "holiday-hours");
  const leftOf = (at) => `${((at - from) / scale) * 100}%`;
  const place = (at) => {
    const pct = (at - from) / scale;
    if (pct < 0.12) return "none";
    if (pct > 0.88) return "translateX(-100%)";
    return "translateX(-50%)";
  };
  for (let at = Math.ceil(from / 3600000) * 3600000; at <= to; at += 3600000) {
    const tick = ce("span", "holiday-tick");
    tick.style.left = leftOf(at);
    hours.appendChild(tick);
  }
  for (const mark of timelineMarks(span)) {
    if (!markInSlice(mark.at, from, to, span.end)) continue;
    const label = ce("span", "holiday-mark holiday-mark-" + mark.kind);
    label.style.left = leftOf(mark.at);
    label.style.transform = place(mark.at);
    label.textContent = mark.label;
    hours.appendChild(label);
  }
  for (const change of changes || []) {
    if (!markInSlice(change.at, from, to, span.end)) continue;
    const label = ce("span", "holiday-mark holiday-mark-change");
    label.style.left = leftOf(change.at);
    label.style.transform = place(change.at);
    label.textContent = fmtClock(change.at);
    hours.appendChild(label);
  }
  return hours;
}

function zoomSlices(span) {
  const slices = [];
  let at = span.start;
  while (at < span.end - 1000) {
    const scaleEnd = at + ZOOM_MS;
    slices.push({ from: at, to: Math.min(span.end, scaleEnd), scale: ZOOM_MS });
    at = scaleEnd;
  }
  return slices;
}

function fmtClock(ms) {
  const tz = hubTz();
  const use24 = catalog().use24 === true;
  const opts = use24
    ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }
    : { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz };
  return new Intl.DateTimeFormat("en-US", opts).format(new Date(ms));
}

function fmtDay(ms) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: hubTz(),
  }).format(new Date(ms));
}

function openTimelinePopup(span, id, actions) {
  closeTimelinePopup();
  const list = actions || span.actions || [];
  const timeline = buildDeviceTimeline(span, list, id);
  const overlay = ce("div", "holiday-zoom");
  overlay.id = "holiday-zoom";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", deviceName(id) + " timeline");
  const panel = ce("div", "holiday-zoom-panel");
  const head = ce("div", "holiday-zoom-head");
  const title = ce("div", "holiday-zoom-title");
  title.textContent = deviceName(id);
  const done = ce("button", "holiday-zoom-done");
  done.type = "button";
  done.textContent = "Done";
  done.addEventListener("click", closeTimelinePopup);
  head.appendChild(title);
  head.appendChild(done);
  panel.appendChild(head);
  const when = ce("p", "holiday-badge");
  when.textContent = `${span.name} · ${fmt(span.start)} – ${fmt(span.end)}`;
  panel.appendChild(when);
  const note = alsoControlled(id);
  if (note) panel.appendChild(note);
  const lines = ce("div", "holiday-zoom-lines");
  let lastDay = "";
  for (const slice of zoomSlices(span)) {
    const day = fmtDay(slice.from);
    if (day !== lastDay) {
      const heading = ce("div", "holiday-zoom-day");
      heading.textContent = day;
      lines.appendChild(heading);
      lastDay = day;
    }
    const row = ce("div", "holiday-zoom-line");
    const clock = ce("div", "holiday-zoom-clock");
    clock.textContent = fmtClock(slice.from);
    row.appendChild(clock);
    row.appendChild(renderSpanTrack(span, id, list, {
      from: slice.from,
      to: slice.to,
      scale: slice.scale,
      marks: true,
      timeline,
    }));
    lines.appendChild(row);
  }
  panel.appendChild(lines);
  panel.appendChild(renderEventList(list.filter((a) => (a.states || []).some((s) => String(s.id) === String(id))), id));
  overlay.appendChild(panel);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeTimelinePopup(); });
  document.body.appendChild(overlay);
  const onKey = (e) => { if (e.key === "Escape") closeTimelinePopup(); };
  overlay._onKey = onKey;
  document.addEventListener("keydown", onKey);
  done.focus();
}

function closeTimelinePopup() {
  const overlay = document.getElementById("holiday-zoom");
  if (!overlay) return;
  document.removeEventListener("keydown", overlay._onKey);
  overlay.remove();
}

function renderEventList(actions, onlyId) {
  const list = ce("div", "holiday-events");
  const title = ce("h4", "holiday-section");
  title.textContent = "What happens";
  list.appendChild(title);
  let count = 0;
  for (const a of actions || []) {
    if (a.kind !== "devices") continue;
    const states = (a.states || []).filter((s) => !onlyId || String(s.id) === String(onlyId));
    if (!states.length) continue;
    list.appendChild(renderEventRow(a, states));
    count += 1;
  }
  if (!count) {
    const empty = ce("p", "sched-empty");
    empty.textContent = "Nothing is scheduled yet.";
    list.appendChild(empty);
  }
  return list;
}

function chipTone(s) {
  if (s?.kind === "thermostat") {
    const tone = thermostatTone(s.mode);
    return tone === "off" ? "is-off" : "is-" + tone;
  }
  if (s?.kind === "fan") return s.on === true ? "is-fan-on" : "is-off";
  if (s?.kind === "blind") return s.open === true ? "is-blind-open" : "is-off";
  if (s?.kind === "lock") return s.locked === false ? "is-lock-open" : "is-lock-shut";
  return stateIsOn(s) ? "is-on" : "is-off";
}

function renderEventRow(action, states) {
  const row = ce("div", "holiday-event");
  const time = ce("div", "holiday-event-time");
  time.textContent = action.skipped ? "Skipped" : fmt(action.at);
  const body = ce("div", "holiday-event-body");
  const label = ce("div", "holiday-event-label");
  label.textContent = questionTitle(action.question);
  body.appendChild(label);
  const chips = ce("div", "holiday-chips");
  for (const s of states) {
    const chip = ce("span", "holiday-chip " + chipTone(s));
    chip.textContent = stateChipText(s);
    chips.appendChild(chip);
  }
  body.appendChild(chips);
  row.appendChild(time);
  row.appendChild(body);
  return row;
}

function pauseTargets() {
  return {
    rows: [...(model?.rows || []), ...(laterPack?.rows || [])],
    spans: [...(model?.spans || []), ...(laterPack?.spans || [])],
  };
}

function applyPause(occasion, paused) {
  const targets = pauseTargets();
  for (const row of targets.rows) if (row.occasion === occasion) row.paused = paused;
  for (const span of targets.spans) if (span.occasion === occasion) span.paused = paused;
}

function applySkip(spanId, skipped) {
  const id = String(spanId);
  const targets = pauseTargets();
  for (const row of targets.rows) if (String(row.spanId) === id) row.skipped = skipped;
  for (const span of targets.spans) if (String(span.id) === id) span.skipped = skipped;
}

function reapplyPendingSkips() {
  for (const [id, skipped] of skipPending) applySkip(id, skipped);
}

function rememberRevision(revision) {
  if (revision == null || !model) return;
  model.revision = revision;
  if (laterPack) laterPack.revision = revision;
}

async function togglePause(occasion) {
  if (!occasion || pauseBusy.has(occasion)) return;
  const current = pauseTargets().rows.find((row) => row.occasion === occasion);
  const nextPaused = !(current?.paused === true);
  applyPause(occasion, nextPaused);
  render();
  pauseBusy.add(occasion);
  try {
    const saved = await post("holidays/save", { revision: model.revision, pauseOccasion: occasion });
    if (!saved?.ok) {
      applyPause(occasion, !nextPaused);
      render();
      flash(saved?.error || "Could not update", true);
      return;
    }
    rememberRevision(saved.revision);
  } finally {
    pauseBusy.delete(occasion);
  }
}

async function removeSchedule(occasion) {
  const label = occasionLabel(occasion);
  const again = needsFirstRun() ? "Set up" : "Holiday schedules in Settings";
  if (!confirm(`Remove the ${label} schedule? It will not change devices or the hub mode. You can add it again from ${again}.`)) return;
  const saved = await post("holidays/save", {
    revision: model.revision,
    occasion,
    choice: "skip",
    template: emptyTemplate(),
  });
  if (!saved?.ok) { flash(saved?.error || "Could not remove", true); return; }
  acceptStatus(saved);
  view = "list";
  render();
}

async function setSkip(spanId, undo) {
  const id = String(spanId || "");
  if (!id || skipPending.has(id)) return;
  const nextSkipped = !undo;
  applySkip(id, nextSkipped);
  render();
  skipPending.set(id, nextSkipped);
  try {
    const saved = await post("holidays/skip", { spanId: id, undo: !!undo, revision: model.revision });
    if (!saved?.ok) {
      applySkip(id, !nextSkipped);
      render();
      flash(saved?.error || "Could not update", true);
      return;
    }
    rememberRevision(saved.revision);
    skipPending.delete(id);
    reapplyPendingSkips();
    render();
  } catch (e) {
    applySkip(id, !nextSkipped);
    render();
    flash("Could not update", true);
  } finally {
    skipPending.delete(id);
  }
}

function alsoControlled(deviceId) {
  const names = [];
  for (const conflict of model?.conflicts || []) {
    const ids = (conflict.devices || []).map(String);
    if (ids.includes(String(deviceId))) names.push(conflict.name);
  }
  if (!names.length) return null;
  const note = ce("div", "holiday-badge");
  note.textContent = "Also controlled by: " + names.join(", ");
  return note;
}

async function runHolidayTest(span, which) {
  const occasion = span?.occasion || "shabbat";
  const noun = which === "end" ? "havdalah" : "candle lighting";
  const template = span?.onceTemplate || resolveTemplate(occasion, model);
  if (!template) { flash("This holiday has no schedule", true); return; }
  const states = which === "end" ? template.end?.states : template.start?.states;
  const unlocks = (states || []).filter((s) => s?.kind === "lock" && s.locked === false);
  let msg = `Run the ${noun} actions now? This does not change the hub mode.`;
  if (span?.once) msg = `Run this time's ${noun} actions now? This does not change the hub mode.`;
  if (unlocks.length) msg += " This will unlock " + unlocks.map((s) => deviceName(s.id)).join(", ") + ".";
  if (!confirm(msg)) return;
  const body = { which, occasion };
  if (span?.once && span.id) body.spanId = span.id;
  const res = await post("holidays/test", body);
  flash(res?.ok ? "Ran actions now" : (res?.error || "Actions did not complete"), !res?.ok);
}

function backRow(label, fn) {
  const b = ce("button", "ghost-btn");
  b.type = "button";
  b.textContent = "Back to " + label;
  b.addEventListener("click", fn);
  return b;
}

function templateForOnceEdit(span) {
  const days = span?.days?.length ? span.days : [{ occasion: span?.occasion }];
  const firstId = days[0]?.occasion || span?.occasion;
  const lastId = days[days.length - 1]?.occasion || firstId;
  const base = span?.onceTemplate || resolveTemplate(firstId, model) || emptyTemplate();
  const template = structuredClone(base);
  if (!template.start) template.start = { states: [], repeatLaterNights: false };
  if (!span?.onceTemplate && lastId !== firstId) {
    const last = resolveTemplate(lastId, model) || emptyTemplate();
    template.end = structuredClone(last.end || { states: [] });
  }
  const occasions = [];
  for (const day of days) {
    if (day?.occasion && !occasions.includes(day.occasion)) occasions.push(day.occasion);
  }
  return { template, mixed: occasions.length > 1 };
}

function openOnceWizard(span) {
  const seeded = templateForOnceEdit(span);
  wizard = {
    step: "questions",
    occasion: span?.occasion || "shabbat",
    spanId: span?.id,
    once: true,
    mixedOnce: seeded.mixed,
    settings: structuredClone(model?.settings || {}),
    choice: "own",
    template: seeded.template,
    q: 0,
  };
  if (!wizard.template.start) wizard.template = emptyTemplate();
  normalizeWizardSettings(wizard.settings);
  rememberWizardSaved();
  view = "wizard";
  render();
}

async function clearOnce(spanId) {
  const saved = await post("holidays/save", { revision: model.revision, spanId, clearOnce: true });
  if (!saved?.ok) { flash(saved?.error || "Could not update", true); return; }
  acceptStatus(saved);
  render();
}

function openWizard(occasion) {
  wizard = {
    step: !occasion ? "mode" : (occasion === "shabbat" ? "questions" : "choice"),
    occasion: occasion || "shabbat",
    settings: structuredClone(model?.settings || {}),
    choice: model?.occasions?.[occasion] || (occasion ? "shabbat" : "own"),
    template: structuredClone(model?.templates?.[occasion] || model?.templates?.shabbat || emptyTemplate()),
    q: 0,
  };
  if (!wizard.template.start) wizard.template = emptyTemplate();
  normalizeWizardSettings(wizard.settings);
  rememberWizardSaved();
  view = "wizard";
  render();
}

function normalizeWizardSettings(settings) {
  settings.havdalah = settings.havdalah || { type: "nightfall", minutes: 42 };
  settings.earlyFriday = settings.earlyFriday || { type: "off", value: "" };
}

function wizardFingerprint() {
  return JSON.stringify({
    settings: wizard.settings,
    template: wizard.template,
    choice: wizard.choice,
  });
}

function rememberWizardSaved() {
  if (wizard) wizard.savedFingerprint = wizardFingerprint();
}

function closeWizard() {
  if (wizard?.savedFingerprint && wizardFingerprint() !== wizard.savedFingerprint) {
    if (!confirm("Close without saving your changes?")) return;
  }
  view = wizard?.once && detailId ? "detail" : "list";
  wizard = null;
  render();
}

const QUESTIONS = ["start", "night", "morning", "afternoon", "evening", "end", "custom", "review"];

const SETUP_STEPS = ["mode", "endmode", "where", "away", "timing", "warn"];

function renderWizard() {
  const wrap = ce("div", "sched-workflow");
  const head = ce("div", "sched-workflow-head");
  const title = ce("h3", "sched-section-title");
  title.textContent = wizard.once
    ? "This time only"
    : SETUP_STEPS.includes(wizard.step) || wizard.step === "occasions"
      ? "Shabbat & holidays"
      : (OCCASIONS.find((o) => o.id === wizard.occasion)?.label || "Schedule");
  head.appendChild(title);
  const cancel = ce("button", "ghost-btn");
  cancel.type = "button";
  cancel.textContent = "Close";
  cancel.addEventListener("click", closeWizard);
  head.appendChild(cancel);
  wrap.appendChild(head);
  const setupAt = SETUP_STEPS.indexOf(wizard.step);
  if (setupAt >= 0) wrap.appendChild(progressBar(setupAt + 1, SETUP_STEPS.length, "Setup"));
  if (wizard.step === "mode") wrap.appendChild(modeStep("holidayMode", "Which mode should the house enter at candle lighting? Pick a mode you do not use for anything else.", "endmode"));
  else if (wizard.step === "endmode") wrap.appendChild(modeStep("endMode", "Which mode should the house return to when Shabbat or the holiday ends?", "where"));
  else if (wizard.step === "where") wrap.appendChild(whereStep());
  else if (wizard.step === "away") wrap.appendChild(awayStep());
  else if (wizard.step === "timing") wrap.appendChild(timingStep());
  else if (wizard.step === "warn") wrap.appendChild(warnStep());
  else if (wizard.step === "occasions") wrap.appendChild(occasionList());
  else if (wizard.step === "choice") wrap.appendChild(choiceStep());
  else if (wizard.step === "questions") wrap.appendChild(questionStep());
  return wrap;
}

function progressBar(current, total, label) {
  const box = ce("div", "holiday-progress");
  box.setAttribute("role", "progressbar");
  box.setAttribute("aria-valuemin", "1");
  box.setAttribute("aria-valuemax", String(total));
  box.setAttribute("aria-valuenow", String(current));
  box.setAttribute("aria-label", `${label}, step ${current} of ${total}`);
  const text = ce("span", "holiday-kicker");
  text.setAttribute("aria-hidden", "true");
  text.textContent = `${label} · ${current} of ${total}`;
  const track = ce("div", "holiday-progress-track");
  const fill = ce("div", "holiday-progress-fill");
  fill.style.width = `${Math.round((current / total) * 100)}%`;
  track.appendChild(fill);
  box.appendChild(text);
  box.appendChild(track);
  return box;
}

function modeStep(key, prompt, next) {
  const box = ce("div", "sched-step");
  const q = ce("p", "sched-question");
  q.textContent = prompt;
  box.appendChild(q);
  const grid = ce("div", "sched-mode-grid");
  for (const mode of catalog().hubModes || []) {
    const b = ce("button", "sched-type-card" + (wizard.settings[key] === mode ? " is-active" : ""));
    b.type = "button";
    b.textContent = mode;
    b.addEventListener("click", () => { wizard.settings[key] = mode; render(); });
    grid.appendChild(b);
  }
  box.appendChild(grid);
  box.appendChild(nav(null, () => { wizard.step = next; render(); }));
  return box;
}

function whereStep() {
  const box = ce("div", "sched-step");
  const q = ce("p", "sched-question");
  q.textContent = "Where are you? Diaspora observes two days of Yom Tov. Israel observes one, except Rosh Hashana, which is two days in both places.";
  box.appendChild(q);
  const seg = ce("div", "sched-segment");
  for (const [val, label] of [[false, "Diaspora"], [true, "Israel"]]) {
    const b = ce("button", "sched-seg" + (wizard.settings.israel === val ? " is-active" : ""));
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => { wizard.settings.israel = val; render(); });
    seg.appendChild(b);
  }
  box.appendChild(seg);
  box.appendChild(nav(() => { wizard.step = "endmode"; render(); }, () => { wizard.step = "away"; render(); }));
  return box;
}

function awayStep() {
  const box = ce("div", "sched-step");
  const q = ce("p", "sched-question");
  q.textContent = "Do not start Shabbat or a holiday if the hub is already in one of these modes.";
  box.appendChild(q);
  const selected = new Set(wizard.settings.doNotStartModes || []);
  const grid = ce("div", "sched-mode-grid");
  for (const mode of catalog().hubModes || []) {
    const b = ce("button", "sched-type-card" + (selected.has(mode) ? " is-active" : ""));
    b.type = "button";
    b.textContent = mode;
    b.addEventListener("click", () => {
      if (selected.has(mode)) selected.delete(mode); else selected.add(mode);
      wizard.settings.doNotStartModes = [...selected];
      render();
    });
    grid.appendChild(b);
  }
  box.appendChild(grid);
  box.appendChild(nav(() => { wizard.step = "where"; render(); }, () => { wizard.step = "timing"; render(); }));
  return box;
}

function timingStep() {
  const box = ce("div", "sched-step");
  const q = ce("p", "sched-question");
  q.textContent = "When should candle lighting and havdalah happen?";
  box.appendChild(q);
  appendTimingControls(box, wizard.settings);
  box.appendChild(nav(() => { wizard.step = "away"; render(); }, async () => {
    const saved = await post("holidays/save", { revision: model.revision, settings: wizard.settings });
    if (!saved?.ok) { flash(saved?.error || "Could not save", true); return; }
    acceptStatus(saved);
    rememberWizardSaved();
    wizard.step = "warn";
    render();
  }));
  return box;
}

function appendTimingControls(parent, settings) {
  normalizeWizardSettings(settings);
  const sentence = ce("p", "holiday-timing-sentence");
  const refreshSentence = () => { sentence.textContent = timingSentence(settings); };
  refreshSentence();
  parent.appendChild(sentence);

  const candle = ce("input", "sched-input");
  candle.type = "number";
  candle.min = "0";
  candle.value = String(settings.candleMin ?? 18);
  candle.addEventListener("input", () => {
    settings.candleMin = Number(candle.value);
    refreshSentence();
  });
  parent.appendChild(labeledField("Candle lighting", "Minutes before sunset. 18 is usual. 40 is common in Jerusalem.", candle));

  const havLabel = ce("div", "sched-field");
  const havName = ce("div", "sched-field-label");
  havName.textContent = "Havdalah";
  havLabel.appendChild(havName);
  const hav = ce("div", "sched-segment");
  for (const [type, label] of [["nightfall", "Nightfall"], ["minutes", "Minutes after sunset"]]) {
    const b = ce("button", "sched-seg" + (settings.havdalah.type === type ? " is-active" : ""));
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => { settings.havdalah.type = type; render(); });
    hav.appendChild(b);
  }
  havLabel.appendChild(hav);
  parent.appendChild(havLabel);
  if (settings.havdalah.type === "minutes") {
    const mins = ce("input", "sched-input");
    mins.type = "number";
    mins.min = "0";
    mins.value = String(settings.havdalah.minutes ?? 42);
    mins.addEventListener("input", () => {
      settings.havdalah.minutes = Number(mins.value);
      refreshSentence();
    });
    parent.appendChild(labeledField("Minutes after sunset", "", mins));
  }

  const early = ce("input", "sched-input");
  early.type = "number";
  early.min = "0";
  early.value = String(settings.startEarlyMin ?? 0);
  early.addEventListener("input", () => {
    settings.startEarlyMin = Number(early.value);
    refreshSentence();
  });
  parent.appendChild(labeledField("Start early", "Minutes before candle lighting. 0 starts at candle lighting.", early));

  const friLabel = ce("div", "sched-field");
  const friName = ce("div", "sched-field-label");
  friName.textContent = "Early Friday";
  friLabel.appendChild(friName);
  const friHint = ce("p", "sched-hint");
  friHint.textContent = "Only when that night is a plain Shabbat, and only if the time is earlier than candle lighting.";
  friLabel.appendChild(friHint);
  const fri = ce("div", "sched-segment");
  for (const [type, label] of [["off", "Off"], ["time", "Fixed time"], ["minutes", "Minutes early"]]) {
    const b = ce("button", "sched-seg" + (settings.earlyFriday.type === type ? " is-active" : ""));
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => { settings.earlyFriday.type = type; render(); });
    fri.appendChild(b);
  }
  friLabel.appendChild(fri);
  parent.appendChild(friLabel);
  if (settings.earlyFriday.type === "time") {
    const t = ce("input", "sched-input");
    t.type = "time";
    t.value = settings.earlyFriday.value || "18:00";
    t.addEventListener("change", () => {
      settings.earlyFriday.value = t.value;
      refreshSentence();
    });
    parent.appendChild(labeledField("Fixed time", "", t));
  } else if (settings.earlyFriday.type === "minutes") {
    const n = ce("input", "sched-input");
    n.type = "number";
    n.min = "1";
    n.value = String(settings.earlyFriday.value || 60);
    n.addEventListener("input", () => {
      settings.earlyFriday.value = Number(n.value);
      refreshSentence();
    });
    parent.appendChild(labeledField("Minutes early", "", n));
  }
  if (settings.earlyFriday.type !== "off" && settings === wizard?.settings) parent.appendChild(fridaySwitch());
}

function labeledField(label, hint, control) {
  const field = ce("div", "sched-field");
  const id = "mld-hf-" + Math.random().toString(36).slice(2, 8);
  control.id = id;
  const lbl = ce("label", "sched-field-label");
  lbl.htmlFor = id;
  lbl.textContent = label;
  field.appendChild(lbl);
  field.appendChild(control);
  if (hint) {
    const h = ce("p", "sched-hint");
    h.textContent = hint;
    field.appendChild(h);
  }
  return field;
}

function timingSentence(settings) {
  const mins = Number(settings.candleMin ?? 18);
  const early = Number(settings.startEarlyMin ?? 0);
  const hav = settings.havdalah || {};
  const saved = model?.settings || {};
  const bits = [];
  const next = nextCalendarStart();
  if (next) bits.push(`Next on the calendar: ${next}.`);
  bits.push(`Candle lighting is ${mins} minutes before sunset.`);
  bits.push(early > 0 ? `The house starts ${early} minutes before that.` : "The house starts at candle lighting.");
  bits.push(hav.type === "minutes"
    ? `Havdalah is ${Number(hav.minutes ?? 42)} minutes after sunset.`
    : "Havdalah is at nightfall.");
  bits.push(earlyFridaySentence(settings));
  const fri = settings.earlyFriday || {};
  const savedFri = saved.earlyFriday || {};
  const changed = Number(saved.candleMin ?? 18) !== mins
    || Number(saved.startEarlyMin ?? 0) !== early
    || (saved.havdalah?.type || "nightfall") !== (hav.type || "nightfall")
    || Number(saved.havdalah?.minutes ?? 42) !== Number(hav.minutes ?? 42)
    || (fri.type || "off") !== (savedFri.type || "off")
    || String(fri.value ?? "") !== String(savedFri.value ?? "");
  if (changed) bits.push("Saving updates the calendar.");
  return bits.join(" ");
}

function earlyFridaySentence(settings) {
  const fri = settings.earlyFriday || {};
  const type = fri.type || "off";
  if (type === "minutes") {
    const count = Number(fri.value);
    const n = Number.isFinite(count) ? count : 0;
    return `On a plain Friday the house starts ${n} ${n === 1 ? "minute" : "minutes"} before candle lighting.`;
  }
  if (type === "time") {
    const clock = fmtTimeValue(fri.value || "18:00");
    return clock
      ? `On a plain Friday the house starts at ${clock}, when that is earlier than candle lighting.`
      : "On a plain Friday the house starts at a fixed time, when that is earlier than candle lighting.";
  }
  return "Early Friday is off.";
}

function fmtTimeValue(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hhmm = `${match[1].padStart(2, "0")}:${match[2]}`;
  return fmtClock(zonedMs("2020-01-06", hhmm, hubTz()));
}

function nextCalendarStart() {
  const row = (model?.rows || []).find((r) => !r.skipped && !r.paused);
  return row ? fmtOccasion(row.start) : "";
}

function openSettings() {
  settingsDraft = structuredClone(model?.settings || {});
  normalizeWizardSettings(settingsDraft);
  settingsSavedFingerprint = JSON.stringify(settingsDraft);
  settingsAdvancedOpen = false;
  view = "settings";
  render();
}

function settingsDirty() {
  return !!settingsDraft && JSON.stringify(settingsDraft) !== settingsSavedFingerprint;
}

function closeSettings() {
  if (settingsDirty() && !confirm("Close without saving your changes?")) return;
  settingsDraft = null;
  view = "list";
  render();
}

function renderSettings() {
  const settings = settingsDraft || (settingsDraft = structuredClone(model?.settings || {}));
  normalizeWizardSettings(settings);
  const wrap = ce("div", "holiday-slot");
  wrap.appendChild(backRow("Shabbat & holidays", closeSettings));
  const title = ce("h3", "sched-section-title");
  title.textContent = "Settings";
  wrap.appendChild(title);
  wrap.appendChild(modePicker(settings, "holidayMode", "Hub mode at candle lighting", "Pick a mode you do not use for anything else."));
  wrap.appendChild(modePicker(settings, "endMode", "Hub mode when it ends", "The house returns to this mode at havdalah."));
  wrap.appendChild(locationPicker(settings));
  wrap.appendChild(advancedSettings(settings));
  appendTimingControls(wrap, settings);
  const conflicts = model?.conflicts || [];
  if (conflicts.length) {
    const note = ce("p", "sched-hint");
    note.textContent = "These schedules can also run during the holiday: " + conflicts.map((c) => c.name).join(", ") + ".";
    wrap.appendChild(note);
  }
  const holidays = ce("button", "ghost-btn");
  holidays.type = "button";
  holidays.textContent = "Holiday schedules";
  holidays.addEventListener("click", () => {
    if (settingsDirty() && !confirm("Close without saving your changes?")) return;
    settingsDraft = null;
    openOccasions();
  });
  wrap.appendChild(holidays);
  wrap.appendChild(nav(closeSettings, saveSettings, "Save"));
  return wrap;
}

function modePicker(settings, key, label, hint) {
  const box = ce("div", "sched-field");
  const lbl = ce("div", "sched-field-label");
  lbl.textContent = label;
  box.appendChild(lbl);
  if (hint) {
    const h = ce("p", "sched-hint");
    h.textContent = hint;
    box.appendChild(h);
  }
  const modes = hubModeNames();
  if (!modes.length) {
    const empty = ce("p", "sched-hint");
    empty.textContent = "No hub modes found.";
    box.appendChild(empty);
    return box;
  }
  const grid = ce("div", "sched-mode-grid");
  for (const mode of modes) {
    const b = ce("button", "sched-type-card" + (settings[key] === mode ? " is-active" : ""));
    b.type = "button";
    b.textContent = mode;
    b.addEventListener("click", () => { settings[key] = mode; render(); });
    grid.appendChild(b);
  }
  box.appendChild(grid);
  return box;
}

function locationPicker(settings) {
  const box = ce("div", "sched-field");
  const lbl = ce("div", "sched-field-label");
  lbl.textContent = "Location";
  box.appendChild(lbl);
  const hint = ce("p", "sched-hint");
  hint.textContent = "Diaspora observes two days of Yom Tov. Israel observes one, except Rosh Hashana, which is two days in both places.";
  box.appendChild(hint);
  const seg = ce("div", "sched-segment");
  for (const [val, label] of [[false, "Diaspora"], [true, "Israel"]]) {
    const b = ce("button", "sched-seg" + (settings.israel === val ? " is-active" : ""));
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => { settings.israel = val; render(); });
    seg.appendChild(b);
  }
  box.appendChild(seg);
  return box;
}

function advancedSettings(settings) {
  const box = ce("div", "sched-field");
  const toggle = disclosureButton(settingsAdvancedOpen, "Advanced");
  toggle.addEventListener("click", () => { settingsAdvancedOpen = !settingsAdvancedOpen; render(); });
  box.appendChild(toggle);
  if (!settingsAdvancedOpen) return box;
  const hint = ce("p", "sched-hint");
  hint.textContent = "Do not start Shabbat or a holiday if the hub is already in one of these modes.";
  box.appendChild(hint);
  const selected = new Set(settings.doNotStartModes || []);
  const grid = ce("div", "sched-mode-grid");
  for (const mode of hubModeNames()) {
    const b = ce("button", "sched-type-card" + (selected.has(mode) ? " is-active" : ""));
    b.type = "button";
    b.textContent = mode;
    b.addEventListener("click", () => {
      if (selected.has(mode)) selected.delete(mode); else selected.add(mode);
      settings.doNotStartModes = [...selected];
      render();
    });
    grid.appendChild(b);
  }
  box.appendChild(grid);
  return box;
}

async function saveSettings() {
  const saved = await post("holidays/save", { revision: model.revision, settings: settingsDraft });
  if (!saved?.ok) { flash(saved?.error || "Could not save", true); return; }
  acceptStatus(saved);
  settingsDraft = null;
  flash("Saved");
  view = "list";
  render();
}

function openOccasions() {
  wizard = {
    step: "occasions",
    occasion: "shabbat",
    settings: structuredClone(model?.settings || {}),
    choice: model?.occasions?.shabbat || "own",
    template: structuredClone(model?.templates?.shabbat || emptyTemplate()),
    q: 0,
  };
  if (!wizard.template.start) wizard.template = emptyTemplate();
  normalizeWizardSettings(wizard.settings);
  rememberWizardSaved();
  view = "wizard";
  render();
}

function warnStep() {
  const box = ce("div", "sched-step");
  const lines = [
    "If Shabbat and Holiday Scheduler is installed, turn off its mode switching so the hub is not switched twice.",
    "Limit Rule Machine and motion rules to modes other than the holiday mode.",
  ];
  for (const text of lines) {
    const p = ce("p", "sched-hint");
    p.textContent = text;
    box.appendChild(p);
  }
  const conflicts = model?.conflicts || [];
  if (conflicts.length) {
    const p = ce("p", "sched-hint");
    p.textContent = "These schedules can also run during the holiday: " + conflicts.map((c) => c.name).join(", ") + ".";
    box.appendChild(p);
  }
  box.appendChild(nav(() => { wizard.step = "timing"; render(); }, () => { wizard.step = "occasions"; render(); }));
  return box;
}

function occasionList() {
  const box = ce("div", "sched-step");
  for (const o of OCCASIONS) {
    const b = ce("button", "sched-type-card");
    b.type = "button";
    const choice = model?.occasions?.[o.id] || (o.id === "shabbat" ? "own" : "shabbat");
    const badge = templateBadge(o.id, { occasions: { ...model?.occasions, [o.id]: choice } });
    const name = ce("span");
    name.textContent = o.label;
    const desc = ce("span", "holiday-rel " + relationshipTone(badge));
    desc.textContent = relationshipPhrase(badge);
    b.append(name, document.createTextNode(" — "), desc);
    b.addEventListener("click", () => {
      wizard.occasion = o.id;
      wizard.choice = choice;
      wizard.template = structuredClone(model?.templates?.[o.id] || model?.templates?.shabbat || emptyTemplate());
      wizard.step = o.id === "shabbat" ? "questions" : "choice";
      wizard.q = 0;
      render();
    });
    box.appendChild(b);
  }
  return box;
}

function choiceStep() {
  const box = ce("div", "sched-step");
  const q = ce("p", "sched-question");
  q.textContent = "Would you like to use your Shabbat schedule?";
  box.appendChild(q);
  const options = [
    ["shabbat", "Yes, use it as-is"],
    ["copy", "Start from Shabbat and edit it"],
    ["own", "Create a new schedule"],
    ["skip", "No special schedule"],
  ];
  if (wizard.occasion === "pesachLast" && model?.occasions?.pesachFirst !== "skip") {
    options.splice(3, 0, ["pesachFirst", "Use my Pesach first-days schedule"]);
  }
  for (const [id, label] of options) {
    const b = ce("button", "sched-type-card" + (wizard.choice === id ? " is-active" : ""));
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", async () => {
      wizard.choice = id;
      if (id === "shabbat" || id === "skip" || id === "pesachFirst") {
        const saved = await post("holidays/save", { revision: model.revision, occasion: wizard.occasion, choice: id });
        if (!saved?.ok) { flash(saved?.error || "Could not save", true); return; }
        acceptStatus(saved);
        rememberWizardSaved();
        wizard.step = "occasions";
        render();
        return;
      }
      if (id === "copy") wizard.template = structuredClone(model?.templates?.shabbat || emptyTemplate());
      if (id === "own") wizard.template = emptyTemplate();
      wizard.step = "questions";
      wizard.q = 0;
      render();
    });
    box.appendChild(b);
  }
  return box;
}

function questionStep() {
  const key = QUESTIONS[wizard.q] || "review";
  if (key === "review") return reviewStep();
  const box = ce("div", "sched-step");
  const stepNo = QUESTIONS.indexOf(key) + 1;
  box.appendChild(progressBar(stepNo, QUESTIONS.length - 1, questionTitle(key)));
  const q = ce("p", "sched-question");
  q.textContent = questionPrompt(key);
  box.appendChild(q);
  if (wizard.once && wizard.q === 0) {
    const note = ce("p", "sched-hint");
    note.textContent = wizard.mixedOnce
      ? "This changes only this time, for the whole stretch. The usual schedules stay as they are."
      : "This changes only this time. The usual schedule stays as it is.";
    box.appendChild(note);
  }
  const goBack = () => {
    wizard.q = Math.max(0, wizard.q - 1);
    if (wizard.q === 0 && wizard.occasion !== "shabbat" && !wizard.once) wizard.step = "choice";
    render();
  };
  const goNext = () => {
    wizard.q += 1;
    render();
  };
  box.appendChild(topNav(goBack, goNext));
  if (key === "start" || key === "end") {
    const states = key === "start" ? (wizard.template.start.states ||= []) : (wizard.template.end.states ||= []);
    box.appendChild(deviceLists(states));
    if (key === "start") {
      const row = ce("label", "sched-hint");
      const check = ce("input");
      check.type = "checkbox";
      check.checked = wizard.template.start.repeatLaterNights === true;
      check.addEventListener("change", () => { wizard.template.start.repeatLaterNights = check.checked; });
      row.appendChild(check);
      row.appendChild(document.createTextNode(" Also do this at the start of each later night?"));
      box.appendChild(row);
    }
  } else if (key === "custom") {
    box.appendChild(customEditor());
  } else {
    const groups = (wizard.template[key] ||= []);
    groups.forEach((group, i) => {
      const row = ce("div", "holiday-time-head");
      const time = ce("input", "sched-input");
      time.type = "time";
      time.value = group.time || defaultDaypartTime(key);
      time.addEventListener("change", () => { group.time = time.value; });
      row.appendChild(time);
      const removeTime = ce("button", "ghost-btn");
      removeTime.type = "button";
      removeTime.textContent = "Remove";
      removeTime.addEventListener("click", () => { groups.splice(i, 1); render(); });
      row.appendChild(removeTime);
      box.appendChild(row);
      box.appendChild(deviceLists(group.states ||= []));
    });
    const add = ce("button", "ghost-btn");
    add.type = "button";
    add.textContent = "Add another time";
    add.addEventListener("click", () => { groups.push({ time: defaultDaypartTime(key), states: [] }); render(); });
    box.appendChild(add);
  }
  const errs = errorsForStep(templateErrors(wizard.template), key);
  if (errs.length) {
    const w = ce("p", "holiday-warn");
    w.textContent = namedErrorText(errs);
    box.appendChild(w);
  }
  return box;
}

function defaultDaypartTime(key) {
  if (key === "morning") return "08:00";
  if (key === "afternoon") return "15:00";
  if (key === "evening") return "18:00";
  return "21:00";
}

function questionTitle(key) {
  return {
    start: "Candle lighting",
    night: "Night",
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
    end: "Havdalah",
    custom: "Custom time",
    review: "Review",
  }[key] || "Schedule";
}

function questionPrompt(key) {
  switch (key) {
    case "start": return "At candle lighting, what should change?";
    case "night": return "What should change at night, and at what time? You can add another time.";
    case "morning": return "What should change in the morning, and at what time?";
    case "afternoon": return "What should change in the afternoon, and at what time?";
    case "evening": return "What should change in the evening, before the day ends?";
    case "end": return "At havdalah, what should change?";
    default: return "Add a custom time that does not fit the questions above.";
  }
}

const openHolidayRooms = new Set();

function fanSpeedChoices(fan) {
  const api = M();
  if (typeof api.ceilingFanSpeeds === "function") return api.ceilingFanSpeeds(fan);
  const raw = fan?.supSp;
  const list = (Array.isArray(raw) ? raw : String(raw || "").split(","))
    .map((s) => String(s).trim().toLowerCase())
    .filter((s) => s && s !== "off" && s !== "on" && s !== "auto");
  if (list.length && list.every((s) => /^\d+$/.test(s)) && Math.max(...list.map(Number)) > 10) return ["low", "medium", "high"];
  return list.length ? list : ["low", "medium", "high"];
}

function fanSpeedLabel(sp) {
  const api = M();
  if (typeof api.ceilingFanSpeedLabel === "function") return api.ceilingFanSpeedLabel(sp);
  return String(sp || "");
}

function holidayDevices() {
  const kinds = new Set(offeredKinds());
  const cat = catalog();
  const shadeIds = new Set((cat.shades || []).map((d) => String(d.i)));
  const fanIds = new Set((cat.fans || []).map((d) => String(d.i)));
  const out = [];
  const seen = new Set();
  const add = (d) => {
    if (!d || seen.has(d.id) || !kinds.has(d.kind)) return;
    seen.add(d.id);
    out.push(d);
  };
  if (kinds.has("blind")) {
    for (const d of cat.shades || []) add({ id: String(d.i), kind: "blind", name: d.n, room: d.r, hasPos: !!d.hasPos, raw: d });
  }
  if (kinds.has("fan")) {
    for (const d of cat.fans || []) add({ id: String(d.i), kind: "fan", name: d.n, room: d.r, speed: d.sp, raw: d });
  }
  for (const d of cat.lights || []) {
    const id = String(d.i);
    if (shadeIds.has(id) || fanIds.has(id)) continue;
    add({ id, kind: "light", name: d.n, room: d.r, dim: !!d.d, ct: !!d.ct, raw: d });
  }
  for (const d of cat.outlets || []) {
    const id = String(d.i);
    if (shadeIds.has(id) || fanIds.has(id)) continue;
    add({ id, kind: "outlet", name: d.n, room: d.r, raw: d });
  }
  if (kinds.has("lock")) {
    for (const d of cat.locks || []) add({ id: String(d.i), kind: "lock", name: d.n, room: d.r, raw: d });
  }
  if (kinds.has("thermostat")) {
    for (const d of cat.thermostats || []) add({ id: String(d.i), kind: "thermostat", name: d.n, room: d.r, raw: d });
  }
  return out;
}

function deviceLists(states) {
  const box = ce("div");
  const note = parentUpdateNote();
  if (note) {
    const p = ce("p", "sched-hint");
    p.textContent = note;
    box.appendChild(p);
  }
  const cat = catalog();
  const byRoom = new Map();
  for (const d of holidayDevices()) {
    const rid = d.room == null ? -1 : d.room;
    if (!byRoom.has(rid)) byRoom.set(rid, []);
    byRoom.get(rid).push(d);
  }
  const known = (cat.rooms || []).map((r) => r.id);
  const order = known.filter((id) => byRoom.has(id));
  for (const id of byRoom.keys()) if (!order.includes(id) && id !== -1) order.push(id);
  if (byRoom.has(-1)) order.push(-1);
  for (const rid of order) {
    const devices = byRoom.get(rid);
    const open = openHolidayRooms.has(String(rid));
    const heading = ce("div", "holiday-room");
    const room = (cat.rooms || []).find((r) => r.id === rid);
    const summary = roomStateSummary(devices, states);
    const roomName = rid === -1 ? "Unassigned" : (room?.name || "Room");
    const toggle = disclosureButton(open, summary ? `${roomName} · ${summary}` : roomName);
    toggle.addEventListener("click", () => {
      const key = String(rid);
      if (openHolidayRooms.has(key)) openHolidayRooms.delete(key);
      else openHolidayRooms.add(key);
      render();
    });
    heading.appendChild(toggle);
    box.appendChild(heading);
    if (open) box.appendChild(renderRoomDevices(devices, states));
  }
  return box;
}

function renderRoomDevices(devices, states) {
  const body = ce("div", "holiday-room-body");
  const groups = [
    ["Lights & outlets", devices.filter((d) => d.kind === "light" || d.kind === "outlet"), "switch"],
    ["Blinds", devices.filter((d) => d.kind === "blind"), "blind"],
    ["Fans", devices.filter((d) => d.kind === "fan"), "fan"],
    ["Locks", devices.filter((d) => d.kind === "lock"), "lock"],
    ["Thermostats", devices.filter((d) => d.kind === "thermostat"), "thermostat"],
  ];
  for (const [label, list, kind] of groups) {
    if (!list.length) continue;
    const head = ce("div", "holiday-group-head");
    const title = ce("div", "holiday-kicker");
    title.textContent = label;
    head.appendChild(title);
    head.appendChild(groupBulk(list, states, kind));
    body.appendChild(head);
    for (const d of list) appendHolidayDevice(body, d, states);
  }
  return body;
}

function roomStateSummary(devices, states) {
  const counts = { on: 0, off: 0, open: 0, closed: 0, locked: 0, unlocked: 0, set: 0 };
  for (const d of devices) {
    const current = states.find((s) => String(s.id) === d.id);
    if (!current) continue;
    if (d.kind === "blind") {
      if (current.open === true) counts.open += 1;
      else counts.closed += 1;
    } else if (d.kind === "fan") {
      if (current.on === true) counts.on += 1;
      else counts.off += 1;
    } else if (d.kind === "lock") {
      if (current.locked === false) counts.unlocked += 1;
      else counts.locked += 1;
    } else if (d.kind === "thermostat") counts.set += 1;
    else if (current.on) counts.on += 1;
    else counts.off += 1;
  }
  const bits = [];
  if (counts.on) bits.push(counts.on + " on");
  if (counts.off) bits.push(counts.off + " off");
  if (counts.open) bits.push(counts.open + " open");
  if (counts.closed) bits.push(counts.closed + " closed");
  if (counts.locked) bits.push(counts.locked + " locked");
  if (counts.unlocked) bits.push(counts.unlocked + " unlocked");
  if (counts.set) bits.push(counts.set + " set");
  return bits.join(", ");
}

function groupBulkChoices(kind) {
  if (kind === "blind") return [[true, "Open", true], [false, "Close", false], [null, "Leave as-is", null]];
  if (kind === "lock") return [[true, "Lock", false], [false, "Unlock", true], [null, "Leave as-is", null]];
  if (kind === "thermostat") return [[true, "Set", true], [null, "Leave as-is", null]];
  return [[true, "On", true], [false, "Off", false], [null, "Leave as-is", null]];
}

function groupMatch(device, state, kind, value) {
  if (value == null) return !state;
  if (!state) return false;
  if (kind === "blind") return state.open === value;
  if (kind === "lock") return (state.locked !== false) === value;
  if (kind === "thermostat") return state.kind === "thermostat";
  return state.on === value;
}

function groupBulk(devices, states, kind) {
  const seg = ce("div", "sched-segment holiday-room-seg");
  for (const [value, label, tone] of groupBulkChoices(kind)) {
    const active = devices.length > 0 && devices.every((d) => groupMatch(d, states.find((s) => String(s.id) === d.id), kind, value));
    const b = ce("button", stateButtonClass(tone, active));
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      applyGroupState(devices, states, kind, value);
      render();
    });
    seg.appendChild(b);
  }
  return seg;
}

function applyGroupState(devices, states, kind, value) {
  for (const d of devices) {
    const idx = states.findIndex((s) => String(s.id) === d.id);
    if (value == null) {
      if (idx >= 0) states.splice(idx, 1);
      continue;
    }
    if (kind === "blind") {
      if (idx >= 0) {
        states[idx].kind = "blind";
        states[idx].open = value;
        if (!value) states[idx].position = null;
        else if (d.hasPos && states[idx].position == null) states[idx].position = 100;
      } else states.push({ id: d.id, kind: "blind", open: value, position: value && d.hasPos ? 100 : null });
    } else if (kind === "fan") {
      const speeds = fanSpeedChoices(d.raw);
      if (idx >= 0) {
        states[idx].kind = "fan";
        states[idx].on = value;
        if (!value) states[idx].speed = null;
        else if (!states[idx].speed) states[idx].speed = firstFanSpeed(d, speeds);
      } else states.push({ id: d.id, kind: "fan", on: value, speed: value ? firstFanSpeed(d, speeds) : null });
    } else if (kind === "lock") {
      if (idx >= 0) { states[idx].kind = "lock"; states[idx].locked = value; }
      else states.push({ id: d.id, kind: "lock", locked: value });
    } else if (kind === "thermostat") {
      if (idx >= 0) continue;
      const state = { id: d.id, kind: "thermostat", mode: null, heat: null, cool: null, fanMode: null };
      M().schedTstatNormalize(state, [d.raw]);
      states.push(state);
    } else if (idx >= 0) {
      states[idx].on = value;
      if (!value) { states[idx].level = null; states[idx].ct = null; }
      else {
        if (d.dim && states[idx].level == null) states[idx].level = 100;
        if (d.ct && states[idx].ct == null) states[idx].ct = 3000;
      }
    } else {
      states.push({ id: d.id, kind: d.kind, on: value, level: value && d.dim ? 100 : null, ct: value && d.ct ? 3000 : null });
    }
  }
}

function stateButtonClass(on, active) {
  const kind = on == null ? "is-skip" : (on ? "is-on" : "is-off");
  return "sched-seg holiday-state " + kind + (active ? " is-active" : "");
}

function timelineLegend(actions) {
  const row = ce("div", "holiday-legend");
  const items = [["is-on", "On"], ["is-off", "Off"], ["is-unchanged", "No change yet"]];
  const kinds = new Set(devicesInActions(actions).map((d) => d.kind));
  if (kinds.has("thermostat")) items.push(["is-heat", "Heat"], ["is-cool", "Cool"], ["is-fan", "Fan"]);
  if (kinds.has("fan")) items.push(["is-fan-low", "Low"], ["is-fan-med", "Medium"], ["is-fan-high", "High"]);
  if (kinds.has("blind")) items.push(["is-blind-open", "Open"], ["is-blind-closed", "Closed"]);
  if (kinds.has("lock")) items.push(["is-lock-shut", "Locked"], ["is-lock-open", "Unlocked"]);
  for (const [cls, label] of items) {
    const item = ce("span", "holiday-legend-item");
    const sw = ce("span", "holiday-legend-swatch " + cls);
    item.appendChild(sw);
    item.appendChild(document.createTextNode(label));
    row.appendChild(item);
  }
  return row;
}

function holidaySliderField(label, valueText, makeTrack) {
  const field = ce("div", "sched-field");
  const fieldHead = ce("div", "sched-field-head");
  const lbl = ce("label", "sched-field-label");
  lbl.textContent = label;
  const val = ce("span", "sched-slider-val");
  val.textContent = valueText;
  fieldHead.appendChild(lbl);
  fieldHead.appendChild(val);
  field.appendChild(fieldHead);
  field.appendChild(makeTrack(val));
  return field;
}

function findState(states, id) {
  return states.findIndex((s) => String(s.id) === String(id));
}

function choiceRow(choices, active, onPick) {
  const seg = ce("div", "sched-segment holiday-state-seg");
  for (const [value, label, tone] of choices) {
    const b = ce("button", stateButtonClass(tone, active(value)));
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => onPick(value));
    seg.appendChild(b);
  }
  return seg;
}

function appendHolidayDevice(box, d, states) {
  const row = ce("div", "holiday-device");
  const name = ce("span", "holiday-device-name");
  name.textContent = d.name;
  row.appendChild(name);
  const idx = findState(states, d.id);
  const current = idx >= 0 ? states[idx] : null;
  if (d.kind === "blind") appendBlindChoices(row, d, states, current);
  else if (d.kind === "fan") appendFanChoices(row, d, states, current);
  else if (d.kind === "lock") appendLockChoices(row, d, states, current);
  else if (d.kind === "thermostat") appendThermostatChoices(row, d, states, current);
  else appendSwitchChoices(row, d, states, current);
  box.appendChild(row);
}

function appendSwitchChoices(row, d, states, current) {
  row.appendChild(choiceRow(
    [[true, "On", true], [false, "Off", false], [null, "Leave as-is", null]],
    (on) => (on == null ? !current : current && current.on === on),
    (on) => {
      const idx = findState(states, d.id);
      if (on == null) { if (idx >= 0) states.splice(idx, 1); }
      else if (idx >= 0) {
        states[idx].on = on;
        if (!on) { states[idx].level = null; states[idx].ct = null; }
        else {
          if (d.dim && states[idx].level == null) states[idx].level = 100;
          if (d.ct && states[idx].ct == null) states[idx].ct = 3000;
        }
      } else states.push({ id: d.id, kind: d.kind, on, level: on && d.dim ? 100 : null, ct: on && d.ct ? 3000 : null });
      render();
    },
  ));
  if (current?.on && d.kind === "light" && (d.dim || d.ct)) appendLightSliders(row, d, current);
}

function appendLightSliders(row, d, current) {
  const api = M();
  if (d.dim && typeof api.makeLevelTrackSlider === "function") {
    if (current.level == null) current.level = 100;
    row.appendChild(holidaySliderField("Brightness", (current.level ?? 100) + "%", (val) => {
      return api.makeLevelTrackSlider({
        value: current.level ?? 100,
        min: 1,
        max: 100,
        onChange: (level) => { current.level = level; val.textContent = level + "%"; },
      }).el;
    }));
  }
  if (d.ct && typeof api.makeCtTrackSlider === "function") {
    if (current.ct == null) current.ct = 3000;
    row.appendChild(holidaySliderField("White balance (K)", (current.ct ?? 3000) + "K", (val) => {
      return api.makeCtTrackSlider({
        value: current.ct ?? 3000,
        onChange: (k) => { current.ct = k; val.textContent = k + "K"; },
      }).el;
    }));
  }
}

function appendBlindChoices(row, d, states, current) {
  const open = current?.kind === "blind" ? current.open === true : null;
  row.appendChild(choiceRow(
    [[true, "Open", true], [false, "Close", false], [null, "Leave as-is", null]],
    (v) => (v == null ? !current : open === v),
    (v) => {
      const idx = findState(states, d.id);
      if (v == null) { if (idx >= 0) states.splice(idx, 1); }
      else if (idx >= 0) {
        states[idx].open = v;
        states[idx].kind = "blind";
        if (!v) states[idx].position = null;
        else if (d.hasPos && states[idx].position == null) states[idx].position = 100;
      } else states.push({ id: d.id, kind: "blind", open: v, position: v && d.hasPos ? 100 : null });
      render();
    },
  ));
  if (current?.open === true && d.hasPos && typeof M().makeLevelTrackSlider === "function") {
    if (current.position == null) current.position = 100;
    row.appendChild(holidaySliderField("Position", (current.position ?? 100) + "%", (val) => {
      return M().makeLevelTrackSlider({
        value: current.position ?? 100,
        min: 1,
        max: 100,
        onChange: (level) => { current.position = level; val.textContent = level + "%"; },
      }).el;
    }));
  }
}

function appendFanChoices(row, d, states, current) {
  const speeds = fanSpeedChoices(d.raw);
  row.appendChild(choiceRow(
    [[true, "On", true], [false, "Off", false], [null, "Leave as-is", null]],
    (v) => (v == null ? !current : current?.on === v),
    (v) => {
      const idx = findState(states, d.id);
      if (v == null) { if (idx >= 0) states.splice(idx, 1); }
      else if (idx >= 0) {
        states[idx].on = v;
        states[idx].kind = "fan";
        if (!v) states[idx].speed = null;
        else if (!states[idx].speed) states[idx].speed = firstFanSpeed(d, speeds);
      } else states.push({ id: d.id, kind: "fan", on: v, speed: v ? firstFanSpeed(d, speeds) : null });
      render();
    },
  ));
  if (current?.on === true && speeds.length) {
    const seg = ce("div", "sched-segment holiday-speed-seg");
    for (const sp of speeds) {
      const b = ce("button", "sched-seg" + (String(current.speed).toLowerCase() === String(sp).toLowerCase() ? " is-active" : ""));
      b.type = "button";
      b.textContent = fanSpeedLabel(sp);
      b.addEventListener("click", () => { current.speed = sp; render(); });
      seg.appendChild(b);
    }
    row.appendChild(seg);
  }
}

function firstFanSpeed(d, speeds) {
  const cur = String(d.speed || d.raw?.sp || "").toLowerCase();
  if (speeds.some((sp) => String(sp).toLowerCase() === cur)) return speeds.find((sp) => String(sp).toLowerCase() === cur);
  return null;
}

function appendLockChoices(row, d, states, current) {
  const locked = current?.kind === "lock" ? current.locked !== false : null;
  row.appendChild(choiceRow(
    [[true, "Lock", false], [false, "Unlock", true], [null, "Leave as-is", null]],
    (v) => (v == null ? !current : locked === v),
    (v) => {
      const idx = findState(states, d.id);
      if (v == null) { if (idx >= 0) states.splice(idx, 1); }
      else if (idx >= 0) { states[idx].kind = "lock"; states[idx].locked = v; }
      else states.push({ id: d.id, kind: "lock", locked: v });
      render();
    },
  ));
  if (current?.kind === "lock" && current.locked === false) {
    const hint = ce("p", "sched-hint holiday-lock-hint");
    hint.textContent = "A saved schedule unlocks this door without asking for the PIN.";
    row.appendChild(hint);
  }
}

function appendThermostatChoices(row, d, states, current) {
  const api = M();
  const t = d.raw;
  row.appendChild(choiceRow(
    [[true, "Set", true], [null, "Leave as-is", null]],
    (v) => (v == null ? !current : !!current),
    (v) => {
      const idx = findState(states, d.id);
      if (v == null) { if (idx >= 0) states.splice(idx, 1); }
      else if (idx < 0) {
        const state = { id: d.id, kind: "thermostat", mode: null, heat: null, cool: null, fanMode: null };
        api.schedTstatNormalize(state, [t]);
        states.push(state);
      }
      render();
    },
  ));
  if (!current || current.kind !== "thermostat") return;
  const panel = ce("div", "holiday-tstat");
  const modes = api.schedTstatModeChoices([t]) || [];
  if (modes.length) {
    const seg = ce("div", "sched-segment");
    for (const m of modes) {
      const active = api.normalizeTstatModeKey?.(current.mode) === api.normalizeTstatModeKey?.(m)
        || String(current.mode || "").toLowerCase().replace(/[\s_-]+/g, "") === String(m).toLowerCase().replace(/[\s_-]+/g, "");
      const b = ce("button", "sched-seg" + (active ? " is-active" : ""));
      b.type = "button";
      b.textContent = typeof api.schedTstatModeLabel === "function" ? api.schedTstatModeLabel(m) : m;
      b.addEventListener("click", () => {
        api.schedTstatSetMode(current, [t], m);
        api.schedTstatNormalize(current, [t]);
        render();
      });
      seg.appendChild(b);
    }
    panel.appendChild(seg);
  }
  const needs = api.thermostatSetpointsForMode(current.mode);
  const range = (globalThis.tstatRange || api.tstatRange)?.(t.u) || { min: 50, max: 90 };
  const suffix = (globalThis.tstatTempSuffix || api.tstatTempSuffix)?.(t.u) || "°";
  if (needs.heat) panel.appendChild(setpointField("Heat", "heat", current, range, suffix));
  if (needs.cool) panel.appendChild(setpointField("Cool", "cool", current, range, suffix));
  const fans = typeof api.schedTstatFanChoices === "function" ? api.schedTstatFanChoices([t]) : [];
  if (fans.length) {
    const seg = ce("div", "sched-segment");
    const labels = [...(globalThis.FAN_MODE_OPTS || []), ...(globalThis.COMFORT_FAN_SPEED_OPTS || [])];
    for (const m of [null, ...fans]) {
      const active = m == null ? !current.fanMode : String(current.fanMode || "").toLowerCase() === String(m).toLowerCase();
      const b = ce("button", "sched-seg" + (active ? " is-active" : ""));
      b.type = "button";
      b.textContent = m == null ? "No change" : (typeof api.tstatChoiceLabel === "function" ? api.tstatChoiceLabel(labels, m) : String(m));
      b.addEventListener("click", () => { current.fanMode = m; render(); });
      seg.appendChild(b);
    }
    panel.appendChild(seg);
  }
  row.appendChild(panel);
}

function setpointField(label, key, state, range, suffix) {
  const field = ce("div", "sched-field");
  const lbl = ce("label", "sched-field-label");
  lbl.textContent = label + " (" + suffix + ")";
  field.appendChild(lbl);
  const input = ce("input", "sched-input");
  input.type = "number";
  input.min = String(range.min);
  input.max = String(range.max);
  input.step = "1";
  input.value = state[key] == null ? "" : String(state[key]);
  input.addEventListener("input", () => {
    const v = input.value.trim();
    state[key] = v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v));
  });
  field.appendChild(input);
  return field;
}

const CUSTOM_DAYS = [["every", "Every day"], ["first", "On the first day"], ["last", "On the last day"]];
const CUSTOM_ANCHORS = [
  ["clock-day", "that day"],
  ["clock-night", "that night"],
  ["sunrise", "after sunrise"],
  ["sunset", "after sunset"],
  ["after-start", "after candle lighting"],
  ["before-end", "before havdalah"],
  ["after-end", "after havdalah"],
];

function customSelect(options, value, label, onChange) {
  const select = ce("select", "sched-input");
  select.setAttribute("aria-label", label);
  for (const [id, text] of options) {
    const opt = ce("option");
    opt.value = id;
    opt.textContent = text;
    opt.selected = value === id;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function customValueInput(entry) {
  const value = ce("input", "sched-input");
  const clock = String(entry.anchor || "clock-day").startsWith("clock");
  if (clock) {
    value.type = "time";
    value.setAttribute("aria-label", "Time");
    value.value = entry.value || "15:00";
  } else {
    value.type = "number";
    value.min = "0";
    value.setAttribute("aria-label", "Minutes");
    value.value = String(entry.value ?? 0);
  }
  value.addEventListener("change", () => {
    entry.value = value.type === "number" ? Number(value.value) : value.value;
  });
  return value;
}

function customSentence(entry) {
  const line = ce("p", "holiday-custom-sentence");
  line.appendChild(customSelect(CUSTOM_DAYS, entry.days || "every", "Which days", (days) => { entry.days = days; }));
  const clock = String(entry.anchor || "clock-day").startsWith("clock");
  const chunk = ce("span", "holiday-custom-chunk");
  if (clock) {
    chunk.appendChild(document.createTextNode(" at "));
    chunk.appendChild(customValueInput(entry));
    chunk.appendChild(document.createTextNode(" "));
  } else {
    chunk.appendChild(document.createTextNode(", "));
    chunk.appendChild(customValueInput(entry));
    chunk.appendChild(document.createTextNode(" minutes "));
  }
  line.appendChild(chunk);
  const end = ce("span", "holiday-custom-chunk");
  end.appendChild(customSelect(CUSTOM_ANCHORS, entry.anchor || "clock-day", "Relative to", (anchor) => {
    const wasClock = String(entry.anchor || "").startsWith("clock");
    entry.anchor = anchor;
    if (wasClock !== anchor.startsWith("clock")) entry.value = anchor.startsWith("clock") ? "15:00" : 0;
    render();
  }));
  end.appendChild(document.createTextNode("."));
  line.appendChild(end);
  return line;
}

function customEditor() {
  const box = ce("div");
  const list = (wizard.template.custom ||= []);
  const add = ce("button", "ghost-btn");
  add.type = "button";
  add.textContent = "Add a custom time";
  add.addEventListener("click", () => {
    list.push({ anchor: "clock-day", value: "15:00", days: "every", states: [] });
    render();
  });
  box.appendChild(add);
  list.forEach((entry, index) => {
    const card = ce("div", "holiday-custom");
    const head = ce("div", "holiday-custom-head");
    head.appendChild(customSentence(entry));
    const remove = ce("button", "ghost-btn");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => { list.splice(index, 1); render(); });
    head.appendChild(remove);
    card.appendChild(head);
    card.appendChild(deviceLists(entry.states ||= []));
    box.appendChild(card);
  });
  return box;
}

function reviewStep() {
  const box = ce("div", "sched-step");
  const q = ce("p", "sched-question");
  q.textContent = wizard.once
    ? (wizard.mixedOnce
      ? "This changes only this time, for the whole stretch. The usual schedules stay as they are."
      : "This changes only this time. The usual schedule stays as it is.")
    : "Review the next occurrence, then save.";
  box.appendChild(q);
  const goBack = () => { wizard.q -= 1; render(); };
  const pending = templateErrors(wizard.template);
  if (pending.length) {
    const w = ce("p", "holiday-warn");
    w.textContent = namedErrorText(pending);
    box.appendChild(w);
  }
  const goSave = async () => {
    const stillPending = templateErrors(wizard.template);
    if (stillPending.length) { flash(namedErrorText(stillPending), true); return; }
    const saved = await post("holidays/save", wizard.once ? {
      revision: model.revision,
      spanId: wizard.spanId,
      once: true,
      template: wizard.template,
    } : {
      revision: model.revision,
      settings: wizard.settings,
      occasion: wizard.occasion,
      choice: wizard.occasion === "shabbat" ? "own" : (wizard.choice || "own"),
      template: wizard.template,
    });
    if (!saved?.ok) { flash(saved?.error || "Could not save", true); return; }
    acceptStatus(saved);
    flash("Saved");
    if (wizard.once) {
      wizard = null;
      view = "detail";
      render();
      return;
    }
    rememberWizardSaved();
    wizard.step = "occasions";
    render();
  };
  box.appendChild(topNav(goBack, goSave, "Save"));
  const holder = ce("div");
  holder.textContent = "Generating preview…";
  box.appendChild(holder);
  post("holidays/preview", wizard.once ? {
    spanId: wizard.spanId,
    template: wizard.template,
    settings: wizard.settings,
  } : {
    occasion: wizard.occasion,
    choice: wizard.occasion === "shabbat" ? "own" : wizard.choice,
    template: wizard.template,
    settings: wizard.settings,
  }).then((res) => {
    holder.innerHTML = "";
    if (res?.ok === false && !res?.span) {
      holder.textContent = res?.error || "Could not preview.";
      return;
    }
    if (res?.span) {
      holder.appendChild(renderEventList(res.span.actions || []));
      holder.appendChild(renderTimelines(res.span, res.span.actions || []));
    } else {
      holder.textContent = "No upcoming date for this occasion yet.";
    }
    if (res?.warnings?.length) {
      const w = ce("p", "holiday-warn");
      w.textContent = "A device is set two ways at the same minute.";
      holder.appendChild(w);
    }
  }).catch(() => { holder.textContent = "Could not preview."; });
  return box;
}

function topNav(back, next, nextLabel) {
  const row = nav(back, next, nextLabel);
  row.classList.add("holiday-nav-top");
  return row;
}

function nav(back, next, nextLabel) {
  const row = ce("div", "sched-nav");
  if (back) {
    const b = ce("button", "ghost-btn");
    b.type = "button";
    b.textContent = "Back";
    b.addEventListener("click", back);
    row.appendChild(b);
  }
  const f = ce("button", "ghost-btn sched-primary-btn");
  f.type = "button";
  f.textContent = nextLabel || "Next";
  f.addEventListener("click", next);
  row.appendChild(f);
  return row;
}

function shouldPreserve() {
  return view === "wizard" || view === "detail" || view === "light" || view === "settings";
}

function reattach(host) {
  hostEl = host;
}

globalThis.mldHoliday = { mount, reattach, shouldPreserve, apiVersion: HOLIDAY_API_VERSION };
