const SYNAGOGUE_CSS = __SYNAGOGUE_CSS__;
const API = 1;

function M() { return globalThis.__MLD; }
function ce(tag, cls) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  return el;
}
function flash(msg, err) {
  const fn = M().flash;
  if (typeof fn === "function") fn(msg, err);
}

let hostEl = null;
let model = null;
let view = "agenda";
let busy = false;
let dayFilter = "all";
let dayQuery = "";
let dayScroll = 0;
let editingDay = "";
let editingEntry = null;
let editingSpace = null;
let wizardStep = 1;
let wizard = null;
let dateDraft = null;
let calendarDraft = { name: "", url: "", bookAll: false, spaceId: "" };
let ruleDraft = { contains: "", spaceId: "", field: "title", name: "", ignore: false };
let bookingDraft = { name: "", spaceId: "", date: "", start: "19:00", minutes: "60" };
let agendaDays = 7;
let sheet = null;
let undo = null;
let undoTimer = 0;
let expanded = {};
let selecting = false;
let selectedDays = [];
let askedFollow = {};
let checkResult = null;
let focusKeep = "";
let timesOpen = false;
let closureDraft = null;
let closureSeq = 0;

function catalog() {
  const api = M();
  return {
    lights: api.devices || [],
    outlets: api.outlets || [],
    locks: api.locks || [],
    thermostats: api.thermostats || [],
    rooms: api.rooms || [],
  };
}

function tz() { return model?.tz || undefined; }
function use24() {
  try { return M().holidayBridge?.().use24 === true; } catch (e) { return false; }
}
const dateFormatters = new Map();
function dateFormatter(key, locale, options) {
  let fmt = dateFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, options);
    dateFormatters.set(key, fmt);
  }
  return fmt;
}
function fmtTime(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return "";
  const hour24 = use24();
  const zone = tz() || "";
  return dateFormatter("time|" + zone + "|" + (hour24 ? "24" : "12"), "en-US", {
    timeZone: zone || undefined,
    hour: hour24 ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: !hour24,
    hourCycle: hour24 ? "h23" : undefined,
  }).format(new Date(Number(ms)));
}
function fmtClock(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return "12:00";
  const zone = tz() || "";
  const parts = dateFormatter("clock|" + zone, "en-GB", {
    timeZone: zone || undefined,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(Number(ms)));
  return (parts.find((p) => p.type === "hour")?.value || "00") + ":" + (parts.find((p) => p.type === "minute")?.value || "00");
}
function hubToday() {
  const fromHub = model?.today?.date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(fromHub || ""))) return String(fromHub);
  try {
    const zone = tz() || "";
    return dateFormatter("today|" + zone, "en-CA", {
      timeZone: zone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch (e) { return ""; }
}
function addIso(iso, n) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y) return "";
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
function fmtMonthDay(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y) return "";
  const zone = tz() || "";
  return dateFormatter("month|" + zone, "en-US", {
    timeZone: zone || undefined,
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d, 16)));
}
function fmtDate(iso) {
  if (!iso) return "";
  const today = hubToday();
  if (iso === today) return "Today";
  if (iso === addIso(today, 1)) return "Tomorrow";
  const [y, m, d] = String(iso).split("-").map(Number);
  const zone = tz() || "";
  return dateFormatter("date|" + zone, "en-US", {
    timeZone: zone || undefined,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d, 16)));
}
function ago(ms) {
  const n = Date.now() - Number(ms);
  if (!Number.isFinite(n) || n < 0) return "";
  const min = Math.round(n / 60000);
  if (min < 1) return "just now";
  if (min < 90) return min + " minutes ago";
  const hr = Math.round(min / 60);
  if (hr < 36) return hr + " hours ago";
  return Math.round(hr / 24) + " days ago";
}
function countdown(ms) {
  const n = Number(ms) - Date.now();
  if (n <= 60000) return "now";
  const min = Math.round(n / 60000);
  if (min < 60) return "in " + min + " min";
  const hr = Math.floor(min / 60);
  if (hr < 36) return "in " + hr + " hr";
  return "in " + Math.round(hr / 24) + " days";
}
function occStarted(row) {
  const cues = row?.cues || [];
  if (cues.some((c) => c.anchor !== "end" && Number(c.at) <= Date.now())) return true;
  return cues.length === 0 && Number(row?.start) <= Date.now();
}

async function getJson(path) {
  return M().getJson(path);
}
async function post(path, body) {
  const res = await M().postJsonSilent(path, body);
  const data = res?.data && typeof res.data === "object" ? res.data : {};
  if (!res?.ok || data.ok === false) {
    const err = new Error(data.error || res?.error || "Could not save");
    err.payload = data;
    throw err;
  }
  return data;
}

function ensureCss() {
  if (document.getElementById("mld-synagogue-css")) return;
  const style = ce("style");
  style.id = "mld-synagogue-css";
  style.textContent = SYNAGOGUE_CSS;
  document.head.appendChild(style);
}

async function load(quiet) {
  if (busy) return;
  busy = true;
  try {
    const next = await getJson("synagogue?days=" + agendaDays);
    model = next?.apiVersion && next.apiVersion !== API ? { mismatch: true } : next;
  } catch (e) {
    if (!quiet) model = { error: e?.message || "Could not load Synagogue." };
  } finally {
    busy = false;
    render();
  }
}

function mount(host) {
  ensureCss();
  hostEl = host;
  hostEl.classList.add("synagogue-slot");
  if (!hostEl.dataset.keys) {
    hostEl.dataset.keys = "1";
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sheet) { e.preventDefault(); closeSheet(); }
    });
  }
  if (!model) {
    hostEl.textContent = "Loading Synagogue…";
    load(false);
    return;
  }
  render();
}

function refresh() {
  if (!["agenda", "days", "spaces", "calendars"].includes(view)) return;
  load(true);
}

function render() {
  if (!hostEl) return;
  if (view !== "entry") cancelPreview();
  const active = document.activeElement;
  if (active && hostEl.contains(active) && active.dataset.keep) focusKeep = active.dataset.keep + "|" + (active.selectionStart || 0);
  const panel = hostEl.closest(".quick-panel");
  const page = document.scrollingElement;
  const savedPanel = panel ? panel.scrollTop : 0;
  const savedPage = !panel && page ? page.scrollTop : 0;
  const keep = hostEl.querySelector(".synagogue-day-list");
  if (view === "days" && keep) dayScroll = keep.scrollTop;
  hostEl.innerHTML = "";
  if (!model) return;
  if (model.mismatch) { hostEl.appendChild(banner("Update Modern Dashboard and mDash Synagogue so they match.")); return; }
  if (model.error) { hostEl.appendChild(banner(model.error)); return; }
  if (!model.settings?.setupDone && !model.spaces?.length && view !== "wizard") view = "wizard";
  if (view !== "entry") cancelPreview();
  paint(view === "wizard" ? renderWizard() : renderShell());
  const extra = sheetNode();
  if (extra) hostEl.appendChild(extra);
  const bar = undoNode();
  if (bar) hostEl.appendChild(bar);
  if (panel) panel.scrollTop = savedPanel;
  else if (page) page.scrollTop = savedPage;
  if (view === "days") requestAnimationFrame(() => { const el = hostEl.querySelector(".synagogue-day-list"); if (el) el.scrollTop = dayScroll; });
  if (focusKeep) {
    const [sel, pos] = focusKeep.split("|");
    const el = hostEl.querySelector('[data-keep="' + sel + '"]');
    if (el) { el.focus(); try { el.setSelectionRange(Number(pos) || 0, Number(pos) || 0); } catch (e) {} }
    focusKeep = "";
  }
}

function paint(node) { if (node) hostEl.appendChild(node); }
function banner(text) { const p = ce("p", "synagogue-banner"); p.textContent = text; return p; }
function note(text) { const p = ce("p", "synagogue-note"); p.textContent = text; return p; }
function text(value) { const span = ce("span"); span.textContent = value; return span; }
function sectionTitle(label) { const g = ce("div", "synagogue-group"); g.textContent = label; return g; }

function field(label, type, value, onInput, keep) {
  const wrap = ce("label", "synagogue-field");
  wrap.appendChild(text(label));
  const input = ce("input");
  input.type = type;
  input.value = value == null ? "" : String(value);
  if (keep) input.dataset.keep = keep;
  input.addEventListener("input", () => onInput(input.value));
  wrap.appendChild(input);
  return wrap;
}
function checkField(label, on, toggle) {
  const row = ce("label", "synagogue-check");
  const input = ce("input");
  input.type = "checkbox";
  input.checked = !!on;
  input.addEventListener("change", () => toggle(input.checked));
  const words = ce("span");
  words.textContent = label;
  row.append(input, words);
  return row;
}
function chips(options, selected, onPick, extra) {
  const seg = ce("div", "sched-segment" + (extra ? " " + extra : ""));
  for (const [id, label] of options) {
    const b = ce("button", "sched-seg" + (String(selected) === String(id) ? " is-active" : ""));
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => onPick(id));
    seg.appendChild(b);
  }
  return seg;
}
function ghost(label, onclick, danger) {
  const b = ce("button", "ghost-btn" + (danger ? " synagogue-danger" : ""));
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", onclick);
  return b;
}
function primary(label, onclick) {
  const b = ce("button", "ghost-btn sched-primary-btn synagogue-grow");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", onclick);
  return b;
}
function pill(label, tone) {
  const s = ce("span", "synagogue-pill" + (tone ? " is-" + tone : ""));
  s.textContent = label;
  return s;
}
function editorBar(backLabel, onBack, saveLabel, onSave) {
  const bar = ce("div", "synagogue-bar");
  bar.appendChild(ghost(backLabel || "Back", onBack));
  if (saveLabel) bar.appendChild(primary(saveLabel, onSave));
  return bar;
}

function openSheet(title, build) { sheet = { title, build }; render(); }
function closeSheet() { sheet = null; render(); }
function sheetNode() {
  if (!sheet) return null;
  const back = ce("div", "synagogue-sheet-back");
  const box = ce("div", "synagogue-sheet");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", sheet.title);
  const h = ce("h2", "sched-section-title");
  h.textContent = sheet.title;
  box.appendChild(h);
  sheet.build(box);
  back.addEventListener("click", (e) => { if (e.target === back) closeSheet(); });
  back.appendChild(box);
  return back;
}
function offerUndo(label, restore, duration) {
  undo = { label, restore };
  clearTimeout(undoTimer);
  const wait = Number(duration) > 0 ? Number(duration) : 8000;
  undoTimer = setTimeout(() => { undo = null; if (hostEl) render(); }, wait);
  if (hostEl) render();
}
function undoNode() {
  if (!undo) return null;
  const row = ce("div", "synagogue-undo");
  row.appendChild(text(undo.label));
  row.appendChild(ghost("Undo", () => { const job = undo.restore; undo = null; job(); }));
  return row;
}

function renderShell() {
  const box = ce("div", "synagogue-stack");
  const head = ce("div", "sched-section-head");
  const section = view === "space" ? "spaces" : (view === "day" || view === "entry" || view === "date") ? "days" : view;
  head.appendChild(chips([
    ["agenda", "Agenda"],
    ["days", "Days"],
    ["spaces", "Spaces"],
    ["calendars", "Calendars"],
    ["settings", model.paused ? "Paused" : "Settings"],
  ], section, (id) => { view = id; render(); }));
  box.appendChild(head);
  if (model.locationProblem) box.appendChild(banner(model.locationProblem));
  else if (model.hebcal?.error) box.appendChild(banner(model.hebcal.error));
  else if (model.paused) box.appendChild(banner("Paused. Future actions will not run."));
  if (model.calendarError) box.appendChild(banner(model.calendarError));
  if (view === "agenda") box.appendChild(renderAgenda());
  else if (view === "days") box.appendChild(renderDays());
  else if (view === "spaces") box.appendChild(renderSpaces());
  else if (view === "calendars") box.appendChild(renderCalendars());
  else if (view === "settings") box.appendChild(renderSettings());
  else if (view === "day") box.appendChild(renderDay());
  else if (view === "entry") box.appendChild(renderEntry());
  else if (view === "space") box.appendChild(renderSpace());
  else if (view === "date") box.appendChild(renderDate());
  return box;
}

function zmanChoices() {
  if (model?.zmanim?.length) return model.zmanim;
  return [
    { id: "sunset", label: "Shkiah (sunset)" },
    { id: "nightfall", label: "Tzeis (nightfall)" },
    { id: "candleLighting", label: "Candle lighting" },
    { id: "sunrise", label: "Netz (sunrise)" },
  ];
}
function zmanLabel(id) {
  return (model?.zmanim || []).find((z) => z.id === id)?.label || id || "sunset";
}
function formatWhy(why) {
  if (!why || !why.kind) return "";
  if (why.kind === "calendar") return "Calendar event containing “" + (why.contains || "the title") + "”";
  if (why.kind === "clock") return why.time || "";
  if (why.kind === "zman") {
    const off = Number(why.offsetMin) || 0;
    const base = why.base ? " " + fmtTime(why.base) : "";
    const label = zmanLabel(why.zman);
    if (!off) return label + base;
    return label + base + (off < 0 ? " − " : " + ") + Math.abs(off) + " min";
  }
  return "";
}
function dayName(id) {
  return (model?.menu || []).find((row) => row.id === id)?.label || id || "that day";
}
function impactOf(id) {
  const list = model?.impact?.[id];
  return Array.isArray(list) ? list : [];
}
function impactSentence(id) {
  const list = impactOf(id);
  if (!list.length) return "";
  const names = list.slice(0, 3).map((row) => row.label);
  const more = list.length > 3 ? " and " + (list.length - 3) + " more" : "";
  return "This also changes " + names.join(", ") + more + ".";
}

async function saveOp(body, nextView) {
  try {
    const saved = await post("synagogue/save", { ...body, revision: model.revision });
    if (saved.settings || saved.agenda || saved.menu) model = saved;
    else if (saved.revision != null) model.revision = saved.revision;
    if (nextView) view = nextView;
    if (body.op === "testAlert") flash("Test alert sent.");
    else if (body.op !== "tryCue" && body.op !== "backup") flash("Saved");
    render();
    return true;
  } catch (e) {
    if (e.payload?.revision != null) model.revision = e.payload.revision;
    flash(e.message, true);
    return false;
  }
}

async function tryControl(control, action) {
  if (model.quiet) { flash("Try it now is off during Shabbat and Yom Tov.", true); return; }
  try {
    const saved = await post("synagogue/save", { op: "tryCue", controlId: control.id, action, revision: model.revision });
    if (saved.revision != null) model.revision = saved.revision;
    flash("Tried " + (control.name || "that control"));
  } catch (e) {
    if (e.payload?.revision != null) model.revision = e.payload.revision;
    flash(e.message, true);
  }
}
