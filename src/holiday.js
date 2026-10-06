import {
  HOLIDAY_API_VERSION,
  OCCASIONS,
  addDays,
  buildDeviceTimeline,
  devicesInActions,
  emptyTemplate,
  formatHubTime,
  occasionLabel,
  templateBadge,
  templateErrors,
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
    hubModes: api.hubModes || [],
    schedules: live.schedules || [],
    rooms: api.rooms || [],
    use24: live.use24 === true,
    tz: live.tz || "",
  };
}

let model = null;
let view = "list";
let detailId = null;
let lightId = null;
let wizard = null;
let hostEl = null;

function injectCss() {
  if (document.getElementById("mld-holiday-css")) return;
  const style = document.createElement("style");
  style.id = "mld-holiday-css";
  style.textContent = HOLIDAY_CSS;
  document.head.appendChild(style);
}

async function load() {
  model = await M().getJson("holidays");
  return model;
}

async function post(path, body) {
  const res = await M().postJson(path, body);
  if (!res?.ok) return { ok: false, error: "Could not save" };
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

function stateText(s) {
  let text = deviceName(s.id) + (s.on ? " on" : " off");
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
      else { model = saved; render(); }
    }
  });
  row.appendChild(check);
  row.appendChild(document.createTextNode(" This Friday: regular candle-lighting time"));
  return row;
}

function spanById(id) {
  return (model?.spans || []).find((s) => s.id === id);
}

function deviceName(id) {
  const cat = catalog();
  const all = [...(cat.lights || []), ...(cat.outlets || [])];
  const hit = all.find((d) => String(d.i) === String(id));
  return hit?.n || `Device ${id}`;
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
    p.textContent = "Upload mld-holiday.js to File Manager.";
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
  hostEl.innerHTML = "";
  if (!model?.ok && model?.error) {
    renderShell(model.error);
    return;
  }
  if (model?.apiVersion !== HOLIDAY_API_VERSION) {
    renderShell("Update the Shabbat & holidays files so the dashboard and hub app match.");
    return;
  }
  if (view === "wizard") hostEl.appendChild(renderWizard());
  else if (view === "detail") hostEl.appendChild(renderDetail());
  else if (view === "light") hostEl.appendChild(renderByLight());
  else hostEl.appendChild(renderList());
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
  setup.textContent = "Set up Shabbat & holidays";
  setup.addEventListener("click", () => openWizard(null));
  actions.appendChild(setup);
  const byLight = ce("button", "ghost-btn");
  byLight.type = "button";
  byLight.textContent = "Timeline by light";
  byLight.addEventListener("click", () => { view = "light"; lightId = null; render(); });
  actions.appendChild(byLight);
  head.appendChild(actions);
  if (model?.settings?.earlyFriday?.type && model.settings.earlyFriday.type !== "off") {
    wrap.appendChild(fridaySwitch());
  }
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
  const rows = model?.rows || [];
  if (!rows.length) {
    const empty = ce("p", "sched-empty");
    empty.textContent = "No upcoming Shabbat or holiday yet. Set up a schedule to see it here.";
    wrap.appendChild(empty);
    return wrap;
  }
  const list = ce("div", "sched-list");
  for (const row of rows) list.appendChild(renderRow(row));
  wrap.appendChild(list);
  return wrap;
}

function renderRow(row) {
  const el = ce("div", "sched-row" + (row.skipped ? " is-off" : ""));
  el.dataset.name = `${row.name || ""} shabbat holiday`;
  const head = ce("div", "sched-row-head");
  const name = ce("div", "sched-row-name");
  name.textContent = row.name || "Holiday";
  head.appendChild(name);
  const badge = ce("span", "holiday-badge");
  badge.textContent = row.badge || "schedule set";
  head.appendChild(badge);
  el.appendChild(head);
  const rule = ce("div", "sched-row-rule");
  const when = ce("div");
  when.textContent = row.inProgress
    ? `In progress, ends ${fmt(row.end)}`
    : `${fmt(row.start)} – ${fmt(row.end)}`;
  rule.appendChild(when);
  const then = ce("div", "holiday-badge");
  then.textContent = row.skipped ? "Skipped this time" : "Schedule is set";
  rule.appendChild(then);
  if (row.skipped) {
    const undo = ce("button", "ghost-btn");
    undo.type = "button";
    undo.textContent = "Undo skip";
    undo.addEventListener("click", (e) => {
      e.stopPropagation();
      setSkip(row.spanId, true);
    });
    el.appendChild(undo);
  }
  el.appendChild(rule);
  if (row.warning) {
    const w = ce("div", "holiday-warn");
    w.textContent = row.warning;
    el.appendChild(w);
  }
  el.addEventListener("click", () => {
    detailId = row.spanId;
    view = "detail";
    render();
  });
  return el;
}

function renderDetail() {
  const span = spanById(detailId);
  const wrap = ce("div", "holiday-slot");
  wrap.appendChild(backRow("Shabbat & holidays", () => { view = "list"; render(); }));
  if (!span) {
    const p = ce("p", "sched-empty");
    p.textContent = "That holiday is no longer on the calendar.";
    wrap.appendChild(p);
    return wrap;
  }
  const title = ce("h3", "sched-section-title");
  title.textContent = span.name;
  wrap.appendChild(title);
  const known = new Set([...(catalog().lights || []), ...(catalog().outlets || [])].map((d) => String(d.i)));
  const missing = [];
  for (const a of span.actions || []) {
    for (const s of a.states || []) {
      if (!known.has(String(s.id)) && !missing.includes(String(s.id))) missing.push(String(s.id));
    }
  }
  if (missing.length) {
    const w = ce("p", "holiday-warn");
    w.textContent = "A saved light is no longer in the dashboard: " + missing.map(deviceName).join(", ");
    wrap.appendChild(w);
  }
  const tools = ce("div", "holiday-head");
  const edit = ce("button", "ghost-btn");
  edit.type = "button";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => openWizard(span.occasion));
  tools.appendChild(edit);
  const skip = ce("button", "ghost-btn");
  skip.type = "button";
  skip.textContent = span.skipped ? "Undo skip" : "Skip this time";
  skip.addEventListener("click", () => {
    if (!span.skipped && !confirm("Skip this occurrence? The hub mode will be left as it is.")) return;
    setSkip(span.id, !!span.skipped);
  });
  tools.appendChild(skip);
  const testStart = ce("button", "ghost-btn");
  testStart.type = "button";
  testStart.textContent = "Run start actions now";
  testStart.addEventListener("click", () => runHolidayTest(span.occasion, "start"));
  tools.appendChild(testStart);
  const testEnd = ce("button", "ghost-btn");
  testEnd.type = "button";
  testEnd.textContent = "Run end actions now";
  testEnd.addEventListener("click", () => runHolidayTest(span.occasion, "end"));
  tools.appendChild(testEnd);
  wrap.appendChild(tools);
  wrap.appendChild(renderTimelines(span, span.actions || []));
  wrap.appendChild(renderEventList(span.actions || []));
  return wrap;
}

function renderByLight() {
  const wrap = ce("div", "holiday-slot");
  wrap.appendChild(backRow("Shabbat & holidays", () => { view = "list"; render(); }));
  const title = ce("h3", "sched-section-title");
  title.textContent = "Timeline by light";
  wrap.appendChild(title);
  const ids = new Map();
  for (const span of model?.spans || []) {
    for (const d of devicesInActions(span.actions || [])) ids.set(d.id, d);
  }
  if (!lightId && ids.size) lightId = [...ids.keys()][0];
  const picker = ce("div", "sched-segment");
  for (const id of ids.keys()) {
    const b = ce("button", "sched-seg" + (id === lightId ? " is-active" : ""));
    b.type = "button";
    b.textContent = deviceName(id);
    b.addEventListener("click", () => { lightId = id; render(); });
    picker.appendChild(b);
  }
  wrap.appendChild(picker);
  const note = alsoControlled(lightId);
  if (note) wrap.appendChild(note);
  for (const span of (model?.spans || []).slice(0, 8)) {
    const label = ce("p", "holiday-badge");
    label.textContent = span.name;
    wrap.appendChild(label);
    wrap.appendChild(renderOneBar(span, lightId));
  }
  return wrap;
}

function renderTimelines(span, actions) {
  const box = ce("div", "holiday-timeline");
  const devices = devicesInActions(actions);
  if (!devices.length) {
    const p = ce("p", "sched-empty");
    p.textContent = "No lights or outlets in this schedule.";
    box.appendChild(p);
    return box;
  }
  for (const d of devices) {
    const row = ce("div", "holiday-bar-row");
    const name = ce("div", "holiday-bar-name");
    name.textContent = deviceName(d.id);
    const note = alsoControlled(d.id);
    if (note) name.appendChild(note);
    row.appendChild(name);
    row.appendChild(renderOneBar(span, d.id, actions));
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

function renderOneBar(span, id, actions) {
  const list = actions || span.actions || [];
  const tl = buildDeviceTimeline(span, list, id);
  const scroll = ce("div", "holiday-bar-scroll");
  const track = ce("div", "holiday-track");
  const bar = ce("div", "holiday-bar");
  const width = Math.max(span.end - span.start, 1);
  const leftOf = (at) => `${((at - span.start) / width) * 100}%`;
  for (const seg of tl.segments) {
    const piece = ce("div", "holiday-seg is-" + seg.state);
    piece.style.width = `${((seg.end - seg.start) / width) * 100}%`;
    const bits = [fmt(seg.start), seg.state];
    if (seg.state === "on" && seg.level != null) bits.push(seg.level + "%");
    piece.title = bits.join(" ");
    bar.appendChild(piece);
  }
  const now = model?.now || Date.now();
  if (now >= span.start && now <= span.end) {
    const mark = ce("div", "holiday-now");
    mark.style.left = leftOf(now);
    bar.appendChild(mark);
  }
  track.appendChild(bar);
  const hours = ce("div", "holiday-hours");
  for (let h = 0; h <= 72; h++) {
    const at = span.start + h * 3600000;
    if (at > span.end) break;
    const tick = ce("span", "holiday-tick");
    tick.style.left = leftOf(at);
    hours.appendChild(tick);
  }
  for (const mark of timelineMarks(span)) {
    const label = ce("span", "holiday-mark holiday-mark-" + mark.kind);
    label.style.left = leftOf(mark.at);
    label.textContent = mark.label;
    hours.appendChild(label);
  }
  track.appendChild(hours);
  scroll.appendChild(track);
  return scroll;
}

function renderEventList(actions) {
  const list = ce("div", "holiday-events");
  for (const a of actions || []) {
    if (a.kind !== "devices") continue;
    const line = ce("div");
    const names = (a.states || []).map(stateText).join(", ");
    line.textContent = a.skipped
      ? `${a.question}: skipped this time (${names})`
      : `${fmt(a.at)} ${a.question}: ${names}`;
    list.appendChild(line);
  }
  return list;
}

async function setSkip(spanId, undo) {
  const saved = await post("holidays/skip", { spanId, undo: !!undo, revision: model.revision });
  if (!saved?.ok) { flash(saved?.error || "Could not update", true); return; }
  model = saved;
  render();
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

async function runHolidayTest(occasion, which) {
  const noun = which === "end" ? "end" : "start";
  if (!confirm(`Run ${noun} actions now? This does not change the hub mode.`)) return;
  const res = await post("holidays/test", { which, occasion });
  flash(res?.ok ? "Ran actions now" : "Actions did not complete", !res?.ok);
}

function backRow(label, fn) {
  const b = ce("button", "ghost-btn");
  b.type = "button";
  b.textContent = "Back to " + label;
  b.addEventListener("click", fn);
  return b;
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
  view = "wizard";
  render();
}

const QUESTIONS = ["start", "night", "morning", "afternoon", "evening", "end", "custom", "review"];

function renderWizard() {
  const wrap = ce("div", "sched-workflow");
  const title = ce("h3", "sched-section-title");
  title.textContent = wizard.step === "mode" || wizard.step === "endmode" || wizard.step === "where" || wizard.step === "away" || wizard.step === "timing" || wizard.step === "warn"
    ? "Shabbat & holidays"
    : (OCCASIONS.find((o) => o.id === wizard.occasion)?.label || "Schedule");
  wrap.appendChild(title);
  if (wizard.step === "mode") wrap.appendChild(modeStep("holidayMode", "Which mode should the house enter at candle lighting? Pick a mode you do not use for anything else.", "endmode"));
  else if (wizard.step === "endmode") wrap.appendChild(modeStep("endMode", "Which mode should the house return to when Shabbat or the holiday ends?", "where"));
  else if (wizard.step === "where") wrap.appendChild(whereStep());
  else if (wizard.step === "away") wrap.appendChild(awayStep());
  else if (wizard.step === "timing") wrap.appendChild(timingStep());
  else if (wizard.step === "warn") wrap.appendChild(warnStep());
  else if (wizard.step === "occasions") wrap.appendChild(occasionList());
  else if (wizard.step === "choice") wrap.appendChild(choiceStep());
  else if (wizard.step === "questions") wrap.appendChild(questionStep());
  const cancel = ce("button", "ghost-btn");
  cancel.type = "button";
  cancel.textContent = "Close";
  cancel.addEventListener("click", () => { view = "list"; wizard = null; render(); });
  wrap.appendChild(cancel);
  return wrap;
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
  const settings = wizard.settings;
  settings.havdalah = settings.havdalah || { type: "nightfall", minutes: 42 };
  settings.earlyFriday = settings.earlyFriday || { type: "off", value: "" };
  const q = ce("p", "sched-question");
  q.textContent = "Candle lighting is this many minutes before sunset. 18 is usual. 40 is common in Jerusalem.";
  box.appendChild(q);
  const input = ce("input", "sched-input");
  input.type = "number";
  input.min = "0";
  input.value = String(settings.candleMin ?? 18);
  input.addEventListener("change", () => { settings.candleMin = Number(input.value); });
  box.appendChild(input);

  const havLabel = ce("p", "sched-hint");
  havLabel.textContent = "Havdalah";
  box.appendChild(havLabel);
  const hav = ce("div", "sched-segment");
  for (const [type, label] of [["nightfall", "Nightfall"], ["minutes", "Minutes after sunset"]]) {
    const b = ce("button", "sched-seg" + (settings.havdalah.type === type ? " is-active" : ""));
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => { settings.havdalah.type = type; render(); });
    hav.appendChild(b);
  }
  box.appendChild(hav);
  if (settings.havdalah.type === "minutes") {
    const mins = ce("input", "sched-input");
    mins.type = "number";
    mins.min = "0";
    mins.value = String(settings.havdalah.minutes ?? 42);
    mins.addEventListener("change", () => { settings.havdalah.minutes = Number(mins.value); });
    box.appendChild(mins);
  }

  const earlyLabel = ce("p", "sched-hint");
  earlyLabel.textContent = "Start the mode and candle-lighting lights this many minutes early. 0 means at candle lighting.";
  box.appendChild(earlyLabel);
  const early = ce("input", "sched-input");
  early.type = "number";
  early.min = "0";
  early.value = String(settings.startEarlyMin ?? 0);
  early.addEventListener("change", () => { settings.startEarlyMin = Number(early.value); });
  box.appendChild(early);

  const friLabel = ce("p", "sched-hint");
  friLabel.textContent = "Early Friday, only when that night is a plain Shabbat and the time is earlier than candle lighting.";
  box.appendChild(friLabel);
  const fri = ce("div", "sched-segment");
  for (const [type, label] of [["off", "Off"], ["time", "Fixed time"], ["minutes", "Minutes early"]]) {
    const b = ce("button", "sched-seg" + (settings.earlyFriday.type === type ? " is-active" : ""));
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => { settings.earlyFriday.type = type; render(); });
    fri.appendChild(b);
  }
  box.appendChild(fri);
  if (settings.earlyFriday.type === "time") {
    const t = ce("input", "sched-input");
    t.type = "time";
    t.value = settings.earlyFriday.value || "18:00";
    t.addEventListener("change", () => { settings.earlyFriday.value = t.value; });
    box.appendChild(t);
  } else   if (settings.earlyFriday.type === "minutes") {
    const n = ce("input", "sched-input");
    n.type = "number";
    n.min = "1";
    n.value = String(settings.earlyFriday.value || 60);
    n.addEventListener("change", () => { settings.earlyFriday.value = Number(n.value); });
    box.appendChild(n);
  }
  if (settings.earlyFriday.type !== "off") box.appendChild(fridaySwitch());
  box.appendChild(nav(() => { wizard.step = "away"; render(); }, async () => {
    model = await post("holidays/save", { revision: model.revision, settings: wizard.settings });
    if (!model.ok) { flash(model.error || "Could not save", true); return; }
    wizard.step = "warn";
    render();
  }));
  return box;
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
    const choice = o.id === "shabbat" ? "own" : (model?.occasions?.[o.id] || "shabbat");
    b.textContent = `${o.label} — ${templateBadge(o.id, { occasions: { ...model?.occasions, [o.id]: choice } })}`;
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
        model = await post("holidays/save", { revision: model.revision, occasion: wizard.occasion, choice: id });
        if (!model.ok) { flash(model.error || "Could not save", true); return; }
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
  const q = ce("p", "sched-question");
  q.textContent = questionPrompt(key);
  box.appendChild(q);
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
    if (key === "end") {
      const row = ce("label", "sched-hint");
      const check = ce("input");
      check.type = "checkbox";
      check.checked = wizard.template.end.offStillOn !== false;
      check.addEventListener("change", () => { wizard.template.end.offStillOn = check.checked; });
      row.appendChild(check);
      row.appendChild(document.createTextNode(" Turn off what is still on"));
      box.appendChild(row);
    }
  } else if (key === "custom") {
    box.appendChild(customEditor());
  } else {
    const groups = (wizard.template[key] ||= []);
    if (!groups.length) groups.push({ time: "21:00", states: [] });
    groups.forEach((group, i) => {
      const time = ce("input", "sched-input");
      time.type = "time";
      time.value = group.time || "21:00";
      time.addEventListener("change", () => { group.time = time.value; });
      box.appendChild(time);
      box.appendChild(deviceLists(group.states ||= []));
      if (i === groups.length - 1) {
        const add = ce("button", "ghost-btn");
        add.type = "button";
        add.textContent = "Add another time";
        add.addEventListener("click", () => { groups.push({ time: "21:00", states: [] }); render(); });
        box.appendChild(add);
      }
    });
  }
  const errs = templateErrors(wizard.template);
  if (errs.length) {
    const w = ce("p", "holiday-warn");
    w.textContent = "A device is in both the on list and the off list.";
    box.appendChild(w);
  }
  box.appendChild(nav(() => {
    wizard.q = Math.max(0, wizard.q - 1);
    if (wizard.q === 0 && wizard.occasion !== "shabbat") wizard.step = "choice";
    render();
  }, () => {
    if (templateErrors(wizard.template).length) { flash("A device is in both lists", true); return; }
    wizard.q += 1;
    render();
  }));
  return box;
}

function questionPrompt(key) {
  switch (key) {
    case "start": return "At candle lighting, what turns on, and what turns off?";
    case "night": return "What turns off at night, and at what time? You can add another time.";
    case "morning": return "What turns on in the morning, and at what time?";
    case "afternoon": return "What should change in the afternoon, and at what time?";
    case "evening": return "What should change in the evening, before the day ends?";
    case "end": return "At havdalah, what turns off, and what turns on?";
    default: return "Add a custom time that does not fit the questions above.";
  }
}

const openHolidayRooms = new Set();

function deviceLists(states) {
  const box = ce("div");
  const cat = catalog();
  const all = [
    ...(cat.lights || []).map((d) => ({ id: String(d.i), kind: "light", name: d.n, room: d.r, dim: !!d.d, ct: !!d.ct })),
    ...(cat.outlets || []).map((d) => ({ id: String(d.i), kind: "outlet", name: d.n, room: d.r, dim: false, ct: false })),
  ].filter((d) => d.kind === "light" || d.kind === "outlet");
  const byRoom = new Map();
  for (const d of all) {
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
    const toggle = ce("button", "holiday-room-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    const room = (cat.rooms || []).find((r) => r.id === rid);
    const summary = roomStateSummary(devices, states);
    toggle.textContent = (open ? "▾ " : "▸ ") + (rid === -1 ? "Unassigned" : (room?.name || "Room")) + (summary ? " · " + summary : "");
    toggle.addEventListener("click", () => {
      const key = String(rid);
      if (openHolidayRooms.has(key)) openHolidayRooms.delete(key);
      else openHolidayRooms.add(key);
      render();
    });
    heading.appendChild(toggle);
    heading.appendChild(roomStateSelector(devices, states));
    box.appendChild(heading);
    if (open) {
      const body = ce("div", "holiday-room-body");
      for (const d of devices) appendHolidayDevice(body, d, states);
      box.appendChild(body);
    }
  }
  return box;
}

function roomStateSummary(devices, states) {
  let on = 0;
  let off = 0;
  for (const d of devices) {
    const current = states.find((s) => String(s.id) === d.id);
    if (!current) continue;
    if (current.on) on += 1;
    else off += 1;
  }
  const bits = [];
  if (on) bits.push(on + " on");
  if (off) bits.push(off + " off");
  return bits.join(", ");
}

function roomStateSelector(devices, states) {
  const seg = ce("div", "sched-segment holiday-room-seg");
  const selected = devices.map((d) => states.find((s) => String(s.id) === d.id));
  const allSkip = selected.every((s) => !s);
  const allOn = selected.length > 0 && selected.every((s) => s && s.on === true);
  const allOff = selected.length > 0 && selected.every((s) => s && s.on === false);
  for (const [on, label, active] of [[true, "On", allOn], [false, "Off", allOff], [null, "Skip", allSkip]]) {
    const b = ce("button", "sched-seg" + (active ? " is-active" : ""));
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      applyRoomState(devices, states, on);
      render();
    });
    seg.appendChild(b);
  }
  return seg;
}

function applyRoomState(devices, states, on) {
  for (const d of devices) {
    if (d.kind !== "light" && d.kind !== "outlet") continue;
    const idx = states.findIndex((s) => String(s.id) === d.id);
    if (on == null) {
      if (idx >= 0) states.splice(idx, 1);
      continue;
    }
    if (idx >= 0) {
      states[idx].on = on;
      if (!on) { states[idx].level = null; states[idx].ct = null; }
    } else {
      states.push({ id: d.id, kind: d.kind, on, level: null, ct: null });
    }
  }
}

function appendHolidayDevice(box, d, states) {
    const row = ce("div", "holiday-device");
    const name = ce("span");
    name.textContent = d.name;
    row.appendChild(name);
    const current = states.find((s) => String(s.id) === d.id);
    const seg = ce("div", "sched-segment");
    for (const [on, label] of [[true, "On"], [false, "Off"], [null, "Skip"]]) {
      const active = on == null ? !current : current && current.on === on;
      const b = ce("button", "sched-seg" + (active ? " is-active" : ""));
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => {
        const idx = states.findIndex((s) => String(s.id) === d.id);
        if (on == null) { if (idx >= 0) states.splice(idx, 1); }
        else if (idx >= 0) { states[idx].on = on; if (!on) { states[idx].level = null; states[idx].ct = null; } }
        else states.push({ id: d.id, kind: d.kind, on, level: null, ct: null });
        render();
      });
      seg.appendChild(b);
    }
    row.appendChild(seg);
    if (current?.on && d.kind === "light" && (d.dim || d.ct)) {
      const extras = ce("div", "holiday-level");
      if (d.dim) {
        const level = ce("input", "sched-input");
        level.type = "number";
        level.min = "1";
        level.max = "100";
        level.placeholder = "Level %";
        level.value = current.level == null ? "" : String(current.level);
        level.addEventListener("change", () => {
          current.level = level.value === "" ? null : Number(level.value);
        });
        extras.appendChild(level);
      }
      if (d.ct) {
        const ct = ce("input", "sched-input");
        ct.type = "number";
        ct.min = "2500";
        ct.max = "6000";
        ct.step = "100";
        ct.placeholder = "Kelvin";
        ct.value = current.ct == null ? "" : String(current.ct);
        ct.addEventListener("change", () => {
          current.ct = ct.value === "" ? null : Number(ct.value);
        });
        extras.appendChild(ct);
      }
      row.appendChild(extras);
    }
    box.appendChild(row);
}

const CUSTOM_ANCHORS = [
  ["clock-night", "Clock, that night"],
  ["clock-day", "Clock, that day"],
  ["sunrise", "Minutes after sunrise"],
  ["sunset", "Minutes after sunset"],
  ["after-start", "Minutes after candle lighting"],
  ["before-end", "Minutes before havdalah"],
  ["after-end", "Minutes after havdalah"],
];
const CUSTOM_DAYS = [["every", "Every day"], ["first", "First day"], ["last", "Last day"]];

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
    const anchor = ce("select", "sched-input");
    for (const [id, label] of CUSTOM_ANCHORS) {
      const opt = ce("option");
      opt.value = id;
      opt.textContent = label;
      opt.selected = entry.anchor === id;
      anchor.appendChild(opt);
    }
    anchor.addEventListener("change", () => {
      entry.anchor = anchor.value;
      entry.value = anchor.value.startsWith("clock") ? "15:00" : 0;
      render();
    });
    card.appendChild(anchor);
    const days = ce("select", "sched-input");
    for (const [id, label] of CUSTOM_DAYS) {
      const opt = ce("option");
      opt.value = id;
      opt.textContent = label;
      opt.selected = (entry.days || "every") === id;
      days.appendChild(opt);
    }
    days.addEventListener("change", () => { entry.days = days.value; });
    card.appendChild(days);
    const value = ce("input", "sched-input");
    if (String(entry.anchor || "").startsWith("clock")) {
      value.type = "time";
      value.value = entry.value || "15:00";
    } else {
      value.type = "number";
      value.min = "0";
      value.value = String(entry.value ?? 0);
    }
    value.addEventListener("change", () => {
      entry.value = value.type === "number" ? Number(value.value) : value.value;
    });
    card.appendChild(value);
    const remove = ce("button", "ghost-btn");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => { list.splice(index, 1); render(); });
    card.appendChild(remove);
    card.appendChild(deviceLists(entry.states ||= []));
    box.appendChild(card);
  });
  return box;
}

function reviewStep() {
  const box = ce("div", "sched-step");
  const q = ce("p", "sched-question");
  q.textContent = "Review the next occurrence, then save.";
  box.appendChild(q);
  const holder = ce("div");
  holder.textContent = "Loading preview…";
  box.appendChild(holder);
  post("holidays/preview", {
    occasion: wizard.occasion,
    choice: wizard.occasion === "shabbat" ? "own" : wizard.choice,
    template: wizard.template,
    settings: wizard.settings,
  }).then((res) => {
    holder.innerHTML = "";
    if (res?.span) {
      holder.appendChild(renderTimelines(res.span, res.span.actions || []));
      holder.appendChild(renderEventList(res.span.actions || []));
    } else {
      holder.textContent = "No upcoming date for this occasion yet.";
    }
    if (res?.warnings?.length) {
      const w = ce("p", "holiday-warn");
      w.textContent = "A device is turned on and off at the same minute.";
      holder.appendChild(w);
    }
  }).catch(() => { holder.textContent = "Could not preview."; });
  box.appendChild(nav(() => { wizard.q -= 1; render(); }, async () => {
    model = await post("holidays/save", {
      revision: model.revision,
      settings: wizard.settings,
      occasion: wizard.occasion,
      choice: wizard.occasion === "shabbat" ? "own" : (wizard.choice || "own"),
      template: wizard.template,
    });
    if (!model?.ok) { flash(model?.error || "Could not save", true); return; }
    flash("Saved");
    wizard.step = "occasions";
    render();
  }, "Save"));
  return box;
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

globalThis.mldHoliday = { mount, apiVersion: HOLIDAY_API_VERSION };
