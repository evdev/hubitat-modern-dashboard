function renderDays() {
  const box = ce("div");
  const unset = (model.menu || []).filter((row) => row.source === "unset").length;
  const total = (model.menu || []).length || 1;
  const done = total - unset;
  const progress = ce("div", "synagogue-progress");
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-valuenow", String(done));
  progress.setAttribute("aria-valuemax", String(total));
  const fill = ce("span");
  fill.style.width = Math.round(100 * done / total) + "%";
  progress.appendChild(fill);
  box.appendChild(progress);
  box.appendChild(healthNote(done + " of " + total + " set up"));
  const tools = ce("div", "synagogue-actions");
  tools.appendChild(ghost(selecting ? "Done selecting" : "Select", () => { selecting = !selecting; selectedDays = []; render(); }));
  tools.appendChild(ghost("Use Shabbat for all Yom Tov", () => openYomTov()));
  box.appendChild(tools);
  box.appendChild(chips([["all", "All"], ["unset", "Needs setup"], ["same", "Uses Shabbat"], ["own", "Own schedule"]], dayFilter, (id) => { dayFilter = id; render(); }));
  const search = ce("input");
  search.type = "search";
  search.className = "synagogue-find";
  search.placeholder = "Find a holiday";
  search.value = dayQuery;
  search.setAttribute("aria-label", "Find a holiday");
  const list = ce("div", "synagogue-day-list");
  search.addEventListener("input", () => {
    dayQuery = search.value;
    fillDayList(list);
    list.scrollTop = 0;
  });
  box.appendChild(search);
  fillDayList(list);
  box.appendChild(list);
  if (selecting && selectedDays.length) {
    const bar = ce("div", "synagogue-bar");
    bar.appendChild(ghost("Same as Shabbat", () => bulk("same", "shabbat")));
    bar.appendChild(ghost("Normal schedule", () => bulk("normal", "")));
    bar.appendChild(ghost("No services", () => bulk("none", ""), true));
    box.appendChild(bar);
  }
  return box;
}

function dayVisible(row, q) {
  if (dayFilter === "unset" && row.source !== "unset") return false;
  if (dayFilter === "same" && row.source !== "same" && row.source !== "changes") return false;
  if (dayFilter === "own" && row.source !== "own" && row.source !== "copy") return false;
  if (q && !(row.label + " " + (row.he || "")).toLowerCase().includes(q)) return false;
  return true;
}

function fillDayList(list) {
  const q = dayQuery.trim().toLowerCase();
  let group = "";
  list.textContent = "";
  for (const row of model.menu || []) {
    if (!dayVisible(row, q)) continue;
    if (row.group !== group) { group = row.group; list.appendChild(sectionTitle(group)); }
    list.appendChild(dayRow(row));
  }
}

function dayRow(row) {
  const b = ce("button", "sched-row");
  b.type = "button";
  const head = ce("div", "synagogue-name-row");
  const title = ce("span", "sched-row-name");
  title.textContent = (selecting && selectedDays.includes(row.id) ? "✓ " : "") + row.label;
  const he = ce("span", "synagogue-he");
  he.textContent = row.he || "";
  head.append(title, he);
  b.appendChild(head);
  const meta = ce("div", "synagogue-pills");
  meta.appendChild(pill(row.phrase || "not set up", phraseTone(row.source)));
  if (row.next) meta.appendChild(pill("Next: " + fmtDate(row.next)));
  b.appendChild(meta);
  b.addEventListener("click", () => {
    if (!selecting) { openDay(row.id); return; }
    selectedDays = selectedDays.includes(row.id) ? selectedDays.filter((id) => id !== row.id) : selectedDays.concat(row.id);
    render();
  });
  return b;
}
function phraseTone(source) {
  if (source === "unset" || source === "none") return "unset";
  if (source === "same" || source === "changes") return "same";
  if (source === "own" || source === "copy") return "own";
  return "";
}
function openYomTov() {
  const names = ["Rosh Hashana", "Yom Kippur", "Sukkot", "Shemini Atzeret / Simchat Torah", "Pesach, first days", "Pesach, last days", "Shavuot"];
  openSheet("Use Shabbat for all Yom Tov", (box) => {
    box.appendChild(note("These days will follow Shabbat, including later edits to Shabbat."));
    for (const name of names) box.appendChild(noteLine(name));
    box.appendChild(primary("Apply", () => { closeSheet(); saveOp({ op: "yomTovFromShabbat" }); }));
  });
}
function bulk(source, follows) {
  const ids = selectedDays.slice();
  selecting = false;
  selectedDays = [];
  saveOp({ op: "bulk", ids, source, follows });
}

function dayRecord(id) {
  return (model.days && model.days[id]) || { source: "unset", follows: "", entries: [], changes: { disabled: [], patched: {}, added: [] } };
}
function openDay(id) { editingDay = id; view = "day"; render(); }

function renderDay() {
  const row = (model.menu || []).find((item) => item.id === editingDay) || { id: editingDay, label: editingDay, he: "" };
  const day = dayRecord(editingDay);
  const box = ce("div");
  box.appendChild(ghost("Back", () => { view = "days"; render(); }));
  const head = ce("div", "synagogue-name-row");
  const h = ce("h2", "sched-section-title");
  h.textContent = row.label;
  const he = ce("span", "synagogue-he");
  he.textContent = row.he || "";
  head.append(h, he);
  box.appendChild(head);
  if (editingDay === "shabbatCholHaMoed") box.appendChild(note("This Shabbat is used for both Sukkot and Pesach."));
  if (row.next) box.appendChild(healthNote("Next: " + fmtDate(row.next) + (row.nextEnd ? "" : "")));
  const impact = impactSentence(editingDay);
  if (impact) box.appendChild(note(impact));
  const choices = [
    ["same", "Use my Shabbat schedule"],
    ["changes", "Use Shabbat, with changes"],
    ["copy", "Start from a copy of Shabbat and edit"],
    ["own", "Make a new schedule"],
    ["normal", "Nothing special, run the normal day"],
    ["none", "No services"],
  ];
  if (editingDay === "pesachLast") choices.splice(1, 0, ["pesach", "Use my Pesach first-days schedule"]);
  for (const [id, label] of choices) {
    const b = ce("button", "sched-type-card" + (sourceOf(day) === id ? " is-active" : ""));
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => chooseSource(id));
    box.appendChild(b);
  }
  const daySource = day.source || "unset";
  if (daySource === "normal") box.appendChild(note("The regular weekday schedule runs on this date."));
  else if (daySource === "none") box.appendChild(note("No services run."));
  else if (daySource !== "unset") {
    const program = resolvedEntries(editingDay);
    box.appendChild(entryGroup("Evening before", program.filter((e) => e.position === "evening"), day));
    box.appendChild(entryGroup("During the day", program.filter((e) => e.position !== "evening"), day));
  }
  box.appendChild(primary("Add a service", () => {
    if ((day.source || "unset") === "normal") {
      openSheet("Replace the weekday schedule?", (ask) => {
        ask.appendChild(note("Adding a service replaces the weekday schedule for this day."));
        ask.appendChild(primary("Continue", () => { closeSheet(); openEntry(null); }));
      });
      return;
    }
    openEntry(null);
  }));
  if (row.next) box.appendChild(ghost("Just this date", () => openDate(row.next)));
  return box;
}

function sourceOf(day) {
  if (day.source === "same" && day.follows === "pesachFirst") return "pesach";
  return day.source || "unset";
}
function chooseSource(id) {
  const day = structuredClone(dayRecord(editingDay));
  if (id === "pesach") { day.source = "same"; day.follows = "pesachFirst"; }
  else if (id === "same" || id === "changes") { day.source = id; day.follows = day.follows && day.follows !== "pesachFirst" ? day.follows : "shabbat"; }
  else if (id === "copy") {
    day.source = "copy";
    day.follows = "shabbat";
    day.entries = structuredClone(resolvedEntries("shabbat"));
  } else if (id === "own") {
    day.source = "own";
    if (!day.entries) day.entries = [];
  } else day.source = id;
  saveOp({ op: "day", dayId: editingDay, day });
}
function resolvedEntries(id, seen) {
  const walk = seen || [];
  if (walk.includes(id) || walk.length > 8) return [];
  const day = dayRecord(id);
  const source = day.source || "unset";
  if (source === "unset" || source === "none") return [];
  if (source === "same" || source === "changes") {
    const base = resolvedEntries(day.follows || "shabbat", walk.concat(id));
    if (source === "same") return base;
    const disabled = new Set((day.changes?.disabled || []).map(String));
    const patched = day.changes?.patched || {};
    const out = base.filter((e) => !disabled.has(String(e.id))).map((e) => ({ ...e, ...(patched[e.id] || {}) }));
    return out.concat(day.changes?.added || []);
  }
  return day.entries || [];
}
function entryOrigin(day, entry) {
  const source = day.source || "unset";
  if (source === "own" || source === "copy") return "own";
  if (source !== "changes") return "inherited";
  if ((day.changes?.added || []).some((e) => e.id === entry.id)) return "added";
  if (day.changes?.patched?.[entry.id]) return "changed";
  return "inherited";
}
function entryGroup(label, entries, day) {
  const box = ce("div");
  box.appendChild(sectionTitle(label));
  if (!entries.length) box.appendChild(note("None yet."));
  for (const entry of entries) {
    const origin = entryOrigin(day, entry);
    const b = ce("button", "sched-row");
    b.type = "button";
    const head = ce("div", "synagogue-name-row");
    const name = ce("span", "sched-row-name");
    name.textContent = entry.name;
    head.appendChild(name);
    const pills = ce("div", "synagogue-pills");
    if (origin === "inherited") pills.appendChild(pill("from " + dayName(day.follows || "shabbat"), "same"));
    if (origin === "changed") pills.appendChild(pill("Changed", "unset"));
    head.appendChild(pills);
    b.appendChild(head);
    b.appendChild(noteLine(startPhrase(entry.start, entry.name)));
    b.addEventListener("click", () => {
      if (origin === "inherited") openInherited(entry, day);
      else openEntry(entry);
    });
    box.appendChild(b);
  }
  return box;
}
function openInherited(entry, day) {
  openSheet(entry.name, (box) => {
    box.appendChild(note("This follows " + dayName(day.follows || "shabbat") + ". Turn it off here, or edit " + dayName(day.follows || "shabbat") + " to change it everywhere."));
    box.appendChild(ghost("Turn off for this day", () => { closeSheet(); turnOff(entry); }, true));
  });
}
function turnOff(entry) {
  const day = structuredClone(dayRecord(editingDay));
  const previous = structuredClone(day);
  if (day.source === "same") {
    day.source = "changes";
    day.follows = day.follows || "shabbat";
    day.changes = { disabled: [], patched: {}, added: [] };
  }
  day.changes = day.changes || { disabled: [], patched: {}, added: [] };
  day.changes.disabled = (day.changes.disabled || []).concat(entry.id);
  offerUndo("Turned off " + entry.name + " for this day.", () => saveOp({ op: "day", dayId: editingDay, day: previous }));
  saveOp({ op: "day", dayId: editingDay, day });
}
function resetChange(entry) {
  const day = structuredClone(dayRecord(editingDay));
  if (day.changes?.patched) delete day.changes.patched[entry.id];
  if (day.changes?.added) day.changes.added = day.changes.added.filter((e) => e.id !== entry.id);
  saveOp({ op: "day", dayId: editingDay, day }, "day");
}
function removeOwn(entry) {
  const day = structuredClone(dayRecord(editingDay));
  const previous = structuredClone(day);
  if (day.source === "changes") {
    day.changes.added = (day.changes?.added || []).filter((e) => e.id !== entry.id);
    if (day.changes.patched) delete day.changes.patched[entry.id];
  } else {
    day.entries = (day.entries || []).filter((e) => e.id !== entry.id);
  }
  offerUndo("Removed " + entry.name + ".", () => saveOp({ op: "day", dayId: editingDay, day: previous }, "day"));
  saveOp({ op: "day", dayId: editingDay, day }, "day");
}
