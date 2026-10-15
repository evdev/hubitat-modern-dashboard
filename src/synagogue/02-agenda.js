function renderAgenda() {
  const box = ce("div");
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
  const health = healthLine();
  if (health) box.appendChild(healthNote(health));
  for (const nudge of model.nudges || []) {
    const card = ce("div", "sched-row");
    card.appendChild(note(nudge.label + " is in " + nudge.inDays + " days and has no schedule."));
    card.appendChild(primary("Set up", () => openDay(nudge.id)));
    box.appendChild(card);
  }
  let last = "";
  for (const row of rows) {
    if (row.date !== last) {
      last = row.date;
      box.appendChild(sectionTitle(fmtDate(row.date)));
    }
    box.appendChild(renderOcc(row));
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
  const main = ce("div");
  const name = ce("strong");
  name.textContent = row.name || "Service";
  main.appendChild(name);
  main.appendChild(noteLine([row.dayLabel, row.spaceName].filter(Boolean).join(" · ")));
  const pills = ce("div", "synagogue-pills");
  if (row.skipped) pills.appendChild(pill("Skipped", "bad"));
  if (row.changed) pills.appendChild(pill("Changed this time", "unset"));
  if (row.dateChanged) pills.appendChild(pill("Changed this date", "unset"));
  if (row.estimated) pills.appendChild(pill("Estimated", "unset"));
  if (row.replaced) pills.appendChild(pill(row.replaced, "same"));
  if (row.stayOn) pills.appendChild(pill("Back-to-back, lights stay on", "ok"));
  if (row.overlap) pills.appendChild(pill(row.warning || "Overlaps another service", "late"));
  if (row.result === "ran") pills.appendChild(pill("Ran", "ok"));
  if (row.result === "late") pills.appendChild(pill("Late", "late"));
  if (row.result === "failed") pills.appendChild(pill("Failed", "late"));
  if (pills.childNodes.length) main.appendChild(pills);
  const cueLine = ce("button", "ghost-btn");
  cueLine.type = "button";
  const cues = row.cues || [];
  cueLine.textContent = cues.length ? cues.map((c) => c.label + " " + fmtTime(c.at)).join(" · ") : "No device cues";
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
