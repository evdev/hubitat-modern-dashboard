function renderAgenda() {
  const box = ce("div", "synagogue-stack");
  const rows = model.agenda || [];
  const next = rows.find((row) => !row.skipped && Number(row.start) > Date.now() - 60 * 60000);
  if (next) {
    const hero = ce("div", "synagogue-hero");
    hero.appendChild(kicker("Next · " + countdown(next.start)));
    const time = ce("p", "synagogue-hero-time");
    time.textContent = next.name + " · " + fmtTime(next.start);
    hero.appendChild(time);
    const first = (next.cues || []).slice().sort((a, b) => a.at - b.at)[0];
    hero.appendChild(noteLine(next.spaceName + (first ? " · First action: " + first.label + " at " + fmtTime(first.at) : "")));
    box.appendChild(hero);
  }
  const todayCard = renderToday();
  if (todayCard) box.appendChild(todayCard);
  const health = healthLine();
  if (health) box.appendChild(healthNote(health));
  for (const nudge of model.nudges || []) {
    const card = ce("div", "sched-row synagogue-nudge");
    card.appendChild(note(nudge.label + " is in " + nudge.inDays + " days and has no schedule."));
    card.appendChild(ghost("Set up", () => openDay(nudge.id)));
    box.appendChild(card);
  }
  const closed = {};
  for (const row of model.closed || []) closed[row.date] = row.name;
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.date)) groups.set(row.date, []);
    groups.get(row.date).push(row);
  }
  for (const date of Object.keys(closed)) if (!groups.has(date)) groups.set(date, []);
  for (const date of [...groups.keys()].sort()) {
    box.appendChild(sectionTitle(fmtDate(date)));
    if (closed[date]) {
      const line = ce("p", "synagogue-closed");
      line.textContent = "Closed: " + closed[date];
      box.appendChild(line);
    }
    for (const row of groups.get(date)) box.appendChild(renderOcc(row));
  }
  if (!rows.length) box.appendChild(note("No services in the next week yet. Add one from Days."));
  if (agendaDays < 21) {
    box.appendChild(ghost(agendaDays === 7 ? "Show later" : "Show the next 3 weeks", () => {
      agendaDays = agendaDays === 7 ? 14 : 21;
      load(false);
    }));
  }
  return box;
}

function kicker(value) { const p = ce("p", "synagogue-kicker"); p.textContent = value; return p; }
function noteLine(value) { const p = ce("p", "synagogue-sub"); p.textContent = value; return p; }
function healthNote(value) { const p = ce("p", "synagogue-health"); p.textContent = value; return p; }
function healthLine() {
  const bits = [];
  if (model.hebcal?.fetchedAt) bits.push("Times updated " + ago(model.hebcal.fetchedAt));
  if (model.ical?.fetchedAt && (model.calendars || []).length) bits.push("Calendar updated " + ago(model.ical.fetchedAt));
  return bits.join(" · ");
}

function renderOcc(row) {
  const card = ce("article", "sched-row");
  const grid = ce("div", "synagogue-occ");
  const clock = ce("div", "synagogue-clock");
  clock.textContent = fmtTime(row.start);
  const main = ce("div", "synagogue-detail");
  const name = ce("strong");
  name.textContent = row.name || "Service";
  main.appendChild(name);
  main.appendChild(noteLine([row.dayLabel, row.spaceName].filter(Boolean).join(" · ")));
  const pills = ce("div", "synagogue-pills");
  if (row.skipped) pills.appendChild(pill("Skipped", "bad"));
  if (row.changed) pills.appendChild(pill("Changed this time", "unset"));
  if (Number(row.warmEarlierMin) > 0) pills.appendChild(pill("Warms up earlier, " + row.warmEarlierMin + " min", "unset"));
  if (row.dateChanged) pills.appendChild(pill("Changed this date", "unset"));
  if (row.estimated) pills.appendChild(pill("Estimated", "unset"));
  if (row.replaced) pills.appendChild(pill(row.replaced, "same"));
  if (row.stayOn) pills.appendChild(pill("Back-to-back, lights stay on", "ok"));
  if (row.overlap) pills.appendChild(pill(row.warning || "Overlaps another service", "late"));
  if (row.result === "ran") pills.appendChild(pill("Ran", "ok"));
  if (row.result === "late") pills.appendChild(pill("Late", "late"));
  if (row.result === "partial") pills.appendChild(pill("Ran, some devices skipped", "late"));
  if (row.result === "failed") pills.appendChild(pill("Failed", "late"));
  if (pills.childNodes.length) main.appendChild(pills);
  const cueLine = ce("button", "ghost-btn synagogue-cue");
  cueLine.type = "button";
  const cues = row.cues || [];
  cueLine.textContent = !cues.length ? "No device cues" : expanded[row.id] ? "Hide actions" : cues.map((c) => c.label + " " + fmtTime(c.at)).join(" · ");
  cueLine.addEventListener("click", () => { expanded[row.id] = !expanded[row.id]; render(); });
  main.appendChild(cueLine);
  if (expanded[row.id] && cues.length) {
    const list = ce("ul", "synagogue-cues");
    for (const cue of cues) {
      const li = ce("li");
      const devices = (cue.states || []).map((st) => st.name).filter(Boolean).join(", ");
      li.textContent = cue.label + " at " + fmtTime(cue.at) + (devices ? " · " + devices : "") + (cue.suppressed ? " · stays on" : "");
      list.appendChild(li);
    }
    main.appendChild(list);
  }
  grid.append(clock, main);
  card.appendChild(grid);
  const actions = ce("div", "synagogue-actions");
  actions.appendChild(ghost(row.skipped ? "Undo skip" : "Skip this one", () => saveOp({ op: "skip", occurrenceId: row.id, undo: !!row.skipped })));
  actions.appendChild(ghost("More", () => openMore(row)));
  card.appendChild(actions);
  return card;
}

function openMore(row) {
  openSheet(row.name || "This time", (box) => {
    box.appendChild(note("This changes only this time. The regular schedule stays as it is."));
    const rowBtns = ce("div", "sched-segment");
    for (const minutes of [15, 30, 60]) {
      const b = ce("button", "sched-seg");
      b.type = "button";
      b.textContent = "Extend " + minutes;
      b.addEventListener("click", () => { closeSheet(); saveOp({ op: "override", occurrenceId: row.id, extendMin: minutes }); });
      rowBtns.appendChild(b);
    }
    box.appendChild(rowBtns);
    let custom = "45";
    box.appendChild(field("Other minutes", "number", custom, (v) => { custom = v; }, "extend"));
    box.appendChild(ghost("Extend by that many", () => { closeSheet(); saveOp({ op: "override", occurrenceId: row.id, extendMin: Number(custom) || 0 }); }));
    box.appendChild(note("Heat starts this much sooner for this time only."));
    const warm = ce("div", "sched-segment");
    for (const minutes of [15, 30, 60, 90]) {
      const b = ce("button", "sched-seg");
      b.type = "button";
      b.textContent = "Warm up earlier " + minutes;
      b.addEventListener("click", () => { closeSheet(); saveOp({ op: "override", occurrenceId: row.id, warmEarlierMin: minutes }); });
      warm.appendChild(b);
    }
    box.appendChild(warm);
    if (Number(row.warmEarlierMin) > 0) {
      box.appendChild(ghost("Use the regular warm-up", () => { closeSheet(); saveOp({ op: "override", occurrenceId: row.id, warmEarlierMin: 0 }); }));
    }
    let start = fmtClock(row.start);
    box.appendChild(field("New start", "time", start, (v) => { start = v; }, "change"));
    box.appendChild(ghost("Change this time", () => { closeSheet(); saveOp({ op: "override", occurrenceId: row.id, start }); }));
    const started = occStarted(row);
    box.appendChild(ghost(row.cancelled ? "Undo cancel" : "Cancel", () => {
      if (row.cancelled) { closeSheet(); saveOp({ op: "override", occurrenceId: row.id, cancel: false }); return; }
      if (!started) { closeSheet(); saveOp({ op: "override", occurrenceId: row.id, cancel: true }); return; }
      openSheet("Turn the room off now?", (ask) => {
        ask.appendChild(note("This already started. Running the end cues puts the room back."));
        ask.appendChild(primary("Turn it off and cancel", async () => {
          closeSheet();
          await saveOp({ op: "endNow", occurrenceId: row.id });
          saveOp({ op: "override", occurrenceId: row.id, cancel: true });
        }));
        ask.appendChild(ghost("Cancel only", () => { closeSheet(); saveOp({ op: "override", occurrenceId: row.id, cancel: true }); }));
      });
    }, true));
    if (row.kind !== "booking" && row.kind !== "calendar") {
      box.appendChild(ghost("Edit day", () => { closeSheet(); openDay(row.dayId); }));
    }
  });
}

function shortZman(row) {
  const id = String(row?.id || "");
  if (id === "sunset") return "Shkiah";
  if (id === "sunrise") return "Netz";
  if (id === "nightfall" || id.startsWith("tzeit")) return "Tzeis";
  if (id === "candleLighting") return "Candles";
  if (id === "havdalah") return "Havdalah";
  if (id === "plagHaMincha") return "Plag";
  if (id === "sofZmanShma") return "Latest Shema";
  return row?.label || "Time";
}

function renderToday() {
  const today = model.today;
  const rows = today?.rows || [];
  if (!rows.length) return null;
  const card = ce("section", "synagogue-today");
  card.setAttribute("aria-label", "Today's times");
  const shkiah = rows.find((row) => row.id === "sunset");
  const tzeis = rows.find((row) => row.id === "nightfall" || String(row.id || "").startsWith("tzeit"));
  const summary = ["Today"];
  if (shkiah) summary.push("Shkiah " + fmtTime(shkiah.at));
  if (tzeis) summary.push("Tzeis " + fmtTime(tzeis.at));
  if (!shkiah && !tzeis) {
    for (const row of rows.slice(0, 2)) summary.push(shortZman(row) + " " + fmtTime(row.at));
  }
  if (today.estimated) summary.push("Estimated");
  const head = ce("div", "synagogue-today-line");
  const line = ce("p", "synagogue-today-summary");
  line.textContent = summary.join(" · ");
  const toggle = ce("button", "ghost-btn");
  toggle.type = "button";
  toggle.textContent = timesOpen ? "Show less" : "Show all";
  toggle.addEventListener("click", () => { timesOpen = !timesOpen; render(); });
  head.append(line, toggle);
  card.appendChild(head);
  if (timesOpen) {
    card.appendChild(noteLine((today.dayLabel || "Today") + (today.estimated ? " · Estimated" : "")));
    const grid = ce("div", "synagogue-today-grid");
    for (const row of rows) {
      const lab = ce("span");
      lab.textContent = row.label || shortZman(row);
      const time = ce("span");
      time.textContent = fmtTime(row.at);
      grid.append(lab, time);
    }
    card.appendChild(grid);
  }
  return card;
}
