function openEntry(entry) {
  const spaceId = (model.spaces || [])[0]?.id || "";
  editingEntry = entry ? structuredClone(entry) : {
    id: "en-" + Date.now(),
    name: "Mincha",
    spaceId,
    position: "day",
    start: { type: "zman", zman: "sunset", offsetMin: -15 },
    end: { type: "duration", minutes: 30 },
    roundTo: 5,
    runCues: true,
    laterDays: true,
    laterEvenings: true,
  };
  view = "entry";
  previewImmediate = true;
  render();
  const row = (model.menu || []).find((item) => item.id === editingDay);
  if (row?.next && daysUntil(row.next) > 21) ensureFar(row.next);
}

function daysUntil(iso) {
  const today = hubToday();
  if (!today || !iso) return 0;
  return Math.round((Date.parse(iso + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86400000);
}
async function ensureFar(date) {
  try { await post("synagogue/preview", { op: "zmanim", date, revision: model.revision }); }
  catch (e) { flash(e.message, true); }
}

function renderEntry() {
  const entry = editingEntry;
  const day = dayRecord(editingDay);
  const origin = entryOrigin(day, entry);
  const box = ce("div", "synagogue-stack");
  const sentence = ce("p", "synagogue-note");
  sentence.textContent = entrySentence(entry);
  box.appendChild(sentence);
  const impact = impactSentence(editingDay);
  if (impact) box.appendChild(note(impact));
  box.appendChild(sectionTitle("What"));
  box.appendChild(field("Name", "text", entry.name, (v) => { entry.name = v; sentence.textContent = entrySentence(entry); }, "name"));
  const space = ce("label", "synagogue-field");
  space.appendChild(text("Space"));
  const spaces = ce("select");
  for (const item of model.spaces || []) {
    const o = ce("option");
    o.value = item.id;
    o.textContent = item.name;
    if (entry.spaceId === item.id) o.selected = true;
    spaces.appendChild(o);
  }
  spaces.addEventListener("change", () => { entry.spaceId = spaces.value; });
  space.appendChild(spaces);
  box.appendChild(space);
  const pos = ce("label", "synagogue-field");
  pos.appendChild(text("When"));
  const posSel = ce("select");
  for (const [id, label] of [["day", "During the day"], ["evening", "Evening before"]]) {
    const o = ce("option");
    o.value = id;
    o.textContent = label;
    if ((entry.position || "day") === id) o.selected = true;
    posSel.appendChild(o);
  }
  posSel.addEventListener("change", () => { entry.position = posSel.value; });
  pos.appendChild(posSel);
  box.appendChild(pos);
  box.appendChild(sectionTitle("Starts"));
  appendStartEditor(box, entry, () => { sentence.textContent = entrySentence(entry); });
  box.appendChild(sectionTitle("How long"));
  appendEndEditor(box, entry);
  const endWarn = ce("p", "synagogue-health");
  box.appendChild(endWarn);
  box.appendChild(sectionTitle("More options"));
  box.appendChild(field("Never before", "time", entry.notBefore || "", (v) => { entry.notBefore = v; }));
  box.appendChild(field("Never after", "time", entry.notAfter || "", (v) => { entry.notAfter = v; }));
  box.appendChild(checkField("Round to 5 minutes", entry.roundTo === 5, (on) => { entry.roundTo = on ? 5 : 0; }));
  box.appendChild(checkField("Also on later days", entry.laterDays !== false, (on) => { entry.laterDays = on; }));
  box.appendChild(checkField("Also on later evenings", entry.laterEvenings !== false, (on) => { entry.laterEvenings = on; }));
  box.appendChild(checkField("Run device cues", entry.runCues !== false, (on) => { entry.runCues = on; }));
  const preview = ce("div");
  preview.textContent = "Checking the next times…";
  box.appendChild(preview);
  const bar = ce("div", "synagogue-bar");
  bar.appendChild(ghost("Back", () => { view = "day"; render(); }));
  if (origin === "changed" || origin === "added") bar.appendChild(ghost("Reset", () => resetChange(entry)));
  if (origin === "own" || origin === "added") bar.appendChild(ghost("Remove", () => removeOwn(entry), true));
  bar.appendChild(primary("Save service", () => saveEntry()));
  box.appendChild(bar);
  refreshPreview(preview, endWarn);
  return box;
}

function appendEndEditor(box, entry) {
  if (!entry.end || typeof entry.end !== "object") entry.end = { type: "duration", minutes: 30 };
  const end = entry.end;
  box.appendChild(chips([
    ["duration", "For a length"],
    ["clock", "Until a clock time"],
    ["zman", "Until a time of day"],
  ], end.type || "duration", (id) => {
    if (id === "clock") entry.end = { type: "clock", time: "18:00" };
    else if (id === "zman") entry.end = { type: "zman", zman: "sunset", offsetMin: 0 };
    else entry.end = { type: "duration", minutes: 30 };
    render();
  }));
  if ((end.type || "duration") === "duration") {
    box.appendChild(field("Lasts minutes", "number", String(end.minutes ?? 30), (v) => { entry.end = { type: "duration", minutes: Number(v) }; }));
  } else if (end.type === "clock") {
    box.appendChild(field("Until", "time", end.time || "18:00", (v) => { entry.end.time = v; }));
  } else appendZmanEditor(box, end);
}

function entrySentence(entry) {
  const phrase = startPhrase(entry.start, entry.name);
  if (entry.start?.type === "calendar") return (entry.name || "Service") + " " + phrase;
  return (entry.name || "Service") + " " + phrase + ".";
}
function startPhrase(start, name) {
  const spec = start || {};
  if (spec.type === "clock") return "at " + (spec.time || "");
  if (spec.type === "calendar") {
    const title = spec.contains || name || "the service";
    const miss = spec.ifMissing === "fallback" ? " If that day has none, the usual time is used." : " If that day has none, it is skipped.";
    return "uses a calendar event containing “" + title + "”." + miss;
  }
  const offset = Number(spec.offsetMin || 0);
  const when = offset < 0 ? Math.abs(offset) + " min before " : offset > 0 ? offset + " min after " : "at ";
  return when + zmanLabel(spec.zman);
}

function appendStartEditor(box, entry, onEdit) {
  const touch = () => { if (onEdit) onEdit(); };
  if (!entry.start || typeof entry.start !== "object") entry.start = { type: "zman", zman: "sunset", offsetMin: -15 };
  const start = entry.start;
  const when = ce("label", "synagogue-field");
  when.appendChild(text("Starts"));
  const kind = ce("select");
  for (const [id, label] of [["zman", "Minutes before or after a time of day"], ["clock", "At a clock time"], ["calendar", "From the calendar"]]) {
    const o = ce("option");
    o.value = id;
    o.textContent = label;
    if ((start.type || "zman") === id) o.selected = true;
    kind.appendChild(o);
  }
  kind.addEventListener("change", () => {
    if (kind.value === "clock") entry.start = { type: "clock", time: "07:00" };
    else if (kind.value === "calendar") {
      const fallback = start.type === "clock" ? { type: "clock", time: start.time || "07:00" } : { type: "zman", zman: start.zman || "sunset", offsetMin: start.offsetMin ?? -15 };
      entry.start = { type: "calendar", contains: entry.name || "Mincha", ifMissing: "skip", fallback: start.type === "calendar" ? (start.fallback || fallback) : fallback };
    } else entry.start = { type: "zman", zman: "sunset", offsetMin: -15 };
    render();
  });
  when.appendChild(kind);
  box.appendChild(when);
  if (start.type === "clock") box.appendChild(field("Time", "time", start.time || "07:00", (v) => { entry.start.time = v; touch(); }));
  else if (start.type === "calendar") {
    box.appendChild(field("Title contains", "text", start.contains || "", (v) => { entry.start.contains = v; touch(); }, "contains"));
    box.appendChild(sectionTitle("If that day has no event"));
    box.appendChild(chips([["skip", "Skip it"], ["fallback", "Use the usual time"]], start.ifMissing === "fallback" ? "fallback" : "skip", (id) => {
      entry.start.ifMissing = id;
      if (id === "fallback" && !entry.start.fallback) entry.start.fallback = { type: "zman", zman: "sunset", offsetMin: -15 };
      render();
    }));
    if (start.ifMissing === "fallback") {
      const usual = ce("div", "sched-row");
      usual.appendChild(note("Usual time"));
      appendFallbackEditor(usual, entry.start, touch);
      box.appendChild(usual);
    }
  } else appendZmanEditor(box, entry.start, touch);
}

function appendFallbackEditor(box, calendarStart, onEdit) {
  if (!calendarStart.fallback || calendarStart.fallback.type === "calendar") calendarStart.fallback = { type: "zman", zman: "sunset", offsetMin: -15 };
  const fb = calendarStart.fallback;
  box.appendChild(chips([["zman", "Time of day"], ["clock", "Clock time"]], fb.type === "clock" ? "clock" : "zman", (id) => {
    calendarStart.fallback = id === "clock" ? { type: "clock", time: "07:00" } : { type: "zman", zman: "sunset", offsetMin: -15 };
    render();
  }));
  if (fb.type === "clock") box.appendChild(field("Time", "time", fb.time || "07:00", (v) => { fb.time = v; if (onEdit) onEdit(); }));
  else appendZmanEditor(box, fb, onEdit);
}

function appendZmanEditor(box, start, onEdit) {
  const z = ce("label", "synagogue-field");
  z.appendChild(text("Time of day"));
  const sel = ce("select");
  for (const item of zmanChoices()) {
    const o = ce("option");
    o.value = item.id;
    o.textContent = item.label;
    if ((start.zman || "sunset") === item.id) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => { start.zman = sel.value; if (onEdit) onEdit(); render(); });
  z.appendChild(sel);
  box.appendChild(z);
  const zman = start.zman || "sunset";
  const offset = Number(start.offsetMin ?? (zman === "sunset" ? -15 : 0));
  if (zman === "sunset") {
    const n = Math.abs(offset);
    box.appendChild(chips([["10", "10"], ["15", "15"], ["20", "20"]], [10, 15, 20].includes(n) ? String(n) : "", (id) => {
      start.offsetMin = -Number(id);
      if (onEdit) onEdit();
      render();
    }));
    box.appendChild(field("Minutes before sunset", "number", String(n), (v) => { start.offsetMin = -Math.abs(Number(v) || 0); if (onEdit) onEdit(); }));
    return;
  }
  box.appendChild(chips([["before", "Before"], ["after", "After"]], offset <= 0 ? "before" : "after", (id) => {
    const amount = Math.abs(Number(start.offsetMin) || 0);
    start.offsetMin = id === "before" ? -amount : amount;
    if (onEdit) onEdit();
    render();
  }));
  box.appendChild(field("Minutes", "number", String(Math.abs(offset)), (v) => {
    const amount = Math.abs(Number(v) || 0);
    start.offsetMin = offset <= 0 ? -amount : amount;
    if (onEdit) onEdit();
  }));
}

let previewTimer = 0;
let previewSeq = 0;
let previewImmediate = false;

function cancelPreview() {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = 0;
  }
  previewSeq += 1;
  previewImmediate = false;
}

function refreshPreview(preview, endWarn) {
  const immediate = previewImmediate;
  previewImmediate = false;
  previewSeq += 1;
  const seq = previewSeq;
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = 0;
  }
  previewTimer = setTimeout(() => {
    previewTimer = 0;
    runPreview(preview, endWarn, seq);
  }, immediate ? 0 : 300);
}

async function runPreview(preview, endWarn, seq) {
  if (!editingEntry || seq !== previewSeq) return;
  const day = structuredClone(dayRecord(editingDay));
  if (day.source === "unset" || day.source === "same" || day.source === "normal" || day.source === "none") day.source = "own";
  const entries = (day.entries || []).filter((e) => e.id !== editingEntry.id);
  entries.push(editingEntry);
  day.entries = entries;
  try {
    const res = await post("synagogue/preview", { revision: model.revision, op: "day", dayId: editingDay, day, entryId: editingEntry.id });
    if (seq !== previewSeq || !preview.isConnected) return;
    const lines = (res.preview || []).map((row) => fmtDate(row.date) + " " + fmtTime(row.start, row.startHm) + (formatWhy(row.why) ? " · " + formatWhy(row.why) : "") + (row.replaced ? " · " + row.replaced : ""));
    const notes = (res.warnings || []).filter((line) => String(line).includes(editingEntry.name || "A service"));
    const ended = notes.find((line) => String(line).includes("ends before"));
    if (endWarn) endWarn.textContent = ended ? "That ends before it starts." : "";
    preview.textContent = lines.join("\n") || notes.filter((line) => line !== ended).join("\n") || "No upcoming time for this service.";
  } catch (e) {
    if (seq !== previewSeq || !preview.isConnected) return;
    preview.textContent = e.message;
  }
}

function saveEntry() {
  const current = dayRecord(editingDay);
  if ((current.source || "unset") === "same" && !askedFollow[editingDay]) {
    openSheet("Stop following " + dayName(current.follows || "shabbat") + "?", (box) => {
      box.appendChild(note("This will stop following " + dayName(current.follows || "shabbat") + " for these entries. Continue?"));
      box.appendChild(primary("Continue", () => { askedFollow[editingDay] = true; closeSheet(); saveEntry(); }));
    });
    return;
  }
  const day = structuredClone(current);
  if (day.source === "same") {
    day.source = "changes";
    day.follows = day.follows || "shabbat";
    day.changes = { disabled: [], patched: {}, added: [] };
  }
  if (day.source === "changes") {
    day.changes = day.changes || { disabled: [], patched: {}, added: [] };
    const baseIds = new Set(resolvedEntries(day.follows || "shabbat").map((e) => e.id));
    if (baseIds.has(editingEntry.id)) day.changes.patched[editingEntry.id] = editingEntry;
    else {
      day.changes.added = (day.changes.added || []).filter((e) => e.id !== editingEntry.id);
      day.changes.added.push(editingEntry);
    }
  } else {
    if (day.source === "unset" || day.source === "normal" || day.source === "none") day.source = "own";
    day.entries = (day.entries || []).filter((e) => e.id !== editingEntry.id);
    day.entries.push(editingEntry);
  }
  saveOp({ op: "day", dayId: editingDay, day }, "day");
}

function openDate(date) {
  const current = (model.dateOverrides && model.dateOverrides[date]) || resolvedEntries(editingDay);
  dateDraft = { date, entries: structuredClone(current) };
  view = "date";
  render();
}
function renderDate() {
  const box = ce("div", "synagogue-stack");
  box.appendChild(ghost("Back", () => { view = "day"; render(); }));
  box.appendChild(note("This changes only " + fmtDate(dateDraft.date) + ", including the evening before. The regular schedule stays as it is."));
  dateDraft.entries.forEach((entry, index) => {
    const row = ce("div", "sched-row");
    row.appendChild(field("Name", "text", entry.name, (v) => { entry.name = v; }));
    row.appendChild(chips([["day", "During the day"], ["evening", "Evening before"]], entry.position || "day", (id) => { entry.position = id; }));
    appendStartEditor(row, entry);
    row.appendChild(ghost("Remove", () => { dateDraft.entries.splice(index, 1); render(); }, true));
    box.appendChild(row);
  });
  box.appendChild(primary("Save this date", () => saveOp({ op: "dateProgram", date: dateDraft.date, entries: dateDraft.entries }, "day")));
  box.appendChild(ghost("Use the regular schedule", () => saveOp({ op: "dateProgram", date: dateDraft.date, clear: true }, "day")));
  return box;
}
