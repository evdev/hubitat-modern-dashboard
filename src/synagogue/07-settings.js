function renderSettings() {
  const box = ce("div");
  box.appendChild(ghost("Back", () => { view = "agenda"; render(); }));
  const s = model.settings || {};
  box.appendChild(sectionTitle("Times"));
  box.appendChild(field("Candle lighting minutes", "number", String(s.candleMin ?? 18), (v) => { s.candleMin = Number(v); }));
  box.appendChild(field("Havdalah minutes", "number", String(s.havdalahMinutes ?? 50), (v) => { s.havdalahMinutes = Number(v); }));
  const night = ce("label", "synagogue-field");
  night.appendChild(text("Nightfall"));
  const sel = ce("select");
  for (const [id, label] of [["tzeit42min", "42 minutes after sunset"], ["tzeit50min", "50 minutes after sunset"], ["tzeit72min", "72 minutes after sunset"], ["tzeit85deg", "8.5° below the horizon"]]) {
    const o = ce("option");
    o.value = id;
    o.textContent = label;
    if ((s.nightfall || "tzeit50min") === id) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => { s.nightfall = sel.value; });
  night.appendChild(sel);
  box.appendChild(night);
  box.appendChild(checkField("In Israel", s.israel === true, (on) => { s.israel = on; }));
  const modes = M().hubModes || [];
  if (modes.length) {
    box.appendChild(sectionTitle("When to hold"));
    box.appendChild(note("While the hub is in a selected mode, due actions wait."));
    s.heldModes = Array.isArray(s.heldModes) ? s.heldModes : [];
    for (const mode of modes) {
      const name = String(mode);
      box.appendChild(checkField(name, s.heldModes.includes(name), (on) => {
        s.heldModes = on ? (s.heldModes.includes(name) ? s.heldModes : s.heldModes.concat(name)) : s.heldModes.filter((item) => item !== name);
      }));
    }
  }
  box.appendChild(sectionTitle("Pause"));
  box.appendChild(ghost(model.paused ? "Resume" : "Pause", () => saveOp({ op: "pause", paused: !model.paused }, "settings")));
  const history = (model.history || []).slice(-8).reverse();
  if (history.length) {
    box.appendChild(sectionTitle("Recent actions"));
    for (const item of history) {
      const card = ce("div", "sched-row");
      const pills = ce("div", "synagogue-pills");
      if (item.status === "ran") pills.appendChild(pill("Ran", "ok"));
      else if (item.status === "late") pills.appendChild(pill("Late", "late"));
      else if (item.status === "failed") pills.appendChild(pill("Failed", "late"));
      card.appendChild(pills);
      card.appendChild(noteLine((item.text || "Action") + (item.reason ? " — " + item.reason : "")));
      box.appendChild(card);
    }
  }
  box.appendChild(primary("Save settings", () => saveOp({ op: "settings", settings: s }, "settings")));
  return box;
}

function defaultTimes() {
  return {
    weekdayMode: "offset", weekdayMinutes: 15, weekdayContains: "Mincha",
    fridayMode: "candles", fridayMinutes: 18, fridayContains: "Mincha",
    shabbatMode: "offset", shabbatMinutes: 15, shabbatContains: "Mincha",
    monThuTime: "07:00", monThuLasts: 50, monThuMode: "clock", monThuContains: "Shacharis",
    sunTime: "08:30", sunLasts: 60, sunMode: "clock", sunContains: "Shacharis",
    shabbatTime: "09:00", shabbatLasts: 150, shabbatShacharisMode: "clock", shabbatShacharisContains: "Shacharis",
    maarivAfter: 0, maarivLasts: 25, maarivMode: "nightfall", maarivContains: "Maariv",
    weekdayMaariv: false, weekdayMaarivMode: "nightfall", weekdayMaarivContains: "Maariv", weekdayMaarivLasts: 20,
  };
}

function renderWizard() {
  if (!wizard) wizard = { name: "Sanctuary", devices: [], preset: "heat", yomTov: true, openDays: false, times: defaultTimes() };
  if (!wizard.times) wizard.times = defaultTimes();
  const box = ce("div", "sched-workflow");
  const h = ce("h2", "sched-section-title");
  h.textContent = "Set up the synagogue";
  box.appendChild(h);
  box.appendChild(stepDots(wizardStep, 7));
  if (wizardStep === 1) box.appendChild(note(model.locationProblem || "The hub location is set. Times can be loaded."));
  else if (wizardStep === 2) {
    box.appendChild(field("Space name", "text", wizard.name, (v) => { wizard.name = v; }, "wiz-name"));
    const q = ce("p", "sched-question");
    q.textContent = "Choose devices";
    box.appendChild(q);
    box.appendChild(roomDevicePicker(
      (item) => wizard.devices.some((d) => d.id === String(item.device.i)),
      (item, on) => {
        const id = String(item.device.i);
        wizard.devices = wizard.devices.filter((d) => d.id !== id);
        if (on) wizard.devices.push({ id, kind: item.kind, dimmer: item.device.d === 1, name: item.device.n, modes: modeList(item.device) });
        render();
      },
    ));
  } else if (wizardStep === 3) {
    for (const [id, label] of [["heat", "Heat early, lights just before"], ["lights", "Lights only"], ["blank", "Start blank"]]) {
      const b = ce("button", "sched-type-card" + (wizard.preset === id ? " is-active" : ""));
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => { wizard.preset = id; render(); });
      box.appendChild(b);
    }
  } else if (wizardStep === 4) renderMinchaStep(box);
  else if (wizardStep === 5) renderMorningStep(box);
  else if (wizardStep === 6) {
    box.appendChild(note("Yom Tov can follow Shabbat. You can change any day later."));
    for (const [id, label] of [["yes", "Use your Shabbat schedule for all Yom Tov"], ["no", "Not now"], ["choose", "Let me choose"]]) {
      const on = (id === "yes" && wizard.yomTov && !wizard.openDays) || (id === "no" && !wizard.yomTov && !wizard.openDays) || (id === "choose" && wizard.openDays);
      const b = ce("button", "sched-type-card" + (on ? " is-active" : ""));
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => {
        wizard.yomTov = id === "yes";
        wizard.openDays = id === "choose";
        render();
      });
      box.appendChild(b);
    }
  } else {
    box.appendChild(note(wizardSummary()));
    box.appendChild(primary("Finish", () => finishWizard(wizard.yomTov, wizard.openDays)));
  }
  const bar = ce("div", "synagogue-bar");
  if (wizardStep > 1) bar.appendChild(ghost("Back", () => { wizardStep -= 1; render(); }));
  if (wizardStep < 7) bar.appendChild(ghost("Skip", () => { wizardStep += 1; render(); }));
  if (wizardStep < 7) bar.appendChild(primary(wizardStep === 6 ? "Continue" : "Next", () => { wizardStep += 1; render(); }));
  box.appendChild(bar);
  return box;
}

function stepDots(current, total) {
  const row = ce("div", "sched-step-indicator");
  row.setAttribute("aria-label", "Step " + current + " of " + total);
  for (let i = 1; i <= total; i++) {
    const dot = ce("span", "sched-step-dot" + (i === current ? " is-active" : i < current ? " is-done" : ""));
    dot.textContent = String(i);
    row.appendChild(dot);
    if (i < total) row.appendChild(ce("span", "sched-step-line"));
  }
  return row;
}
function wizardSummary() {
  const times = wizard.times || defaultTimes();
  const bits = [];
  bits.push((wizard.name || "Sanctuary") + " with " + (wizard.devices.length || "no") + " devices.");
  bits.push("Weekday Mincha is " + (times.weekdayMode === "calendar" ? "from the calendar" : times.weekdayMinutes + " minutes before sunset") + ".");
  bits.push(wizard.openDays ? "You can choose each holiday next." : wizard.yomTov ? "Yom Tov will follow Shabbat." : "Yom Tov stays unset for now.");
  return bits.join(" ");
}

function finishWizard(yomTov, openDays) {
  const lights = wizard.devices.filter((d) => d.kind === "light");
  const outlets = wizard.devices.filter((d) => d.kind === "outlet");
  const locks = wizard.devices.filter((d) => d.kind === "lock");
  const thermostats = wizard.devices.filter((d) => d.kind === "thermostat");
  const controls = [];
  if (lights.length) controls.push({ id: "lights", name: "Lights", kind: "light", devices: lights.map((d) => ({ id: d.id, dimmer: !!d.dimmer, name: d.name || "" })) });
  if (outlets.length) controls.push({ id: "outlets", name: "Outlets", kind: "outlet", devices: outlets.map((d) => ({ id: d.id, name: d.name || "" })) });
  if (locks.length) controls.push({ id: "door", name: "Door", kind: "lock", devices: locks.map((d) => ({ id: d.id, name: d.name || "" })) });
  if (thermostats.length) {
    const comfort = {};
    const setback = {};
    for (const t of thermostats) {
      const heat = (t.modes || []).includes("heat") ? "heat" : (t.modes || [])[0];
      comfort[t.id] = { mode: heat, heat: 70, cool: (t.modes || []).includes("cool") || (t.modes || []).includes("auto") ? 74 : undefined };
      setback[t.id] = { mode: (t.modes || []).includes("off") ? "off" : heat, heat: 62 };
    }
    controls.push({ id: "heat", name: "Heating and cooling", kind: "thermostat", devices: thermostats.map((d) => ({ id: d.id, name: d.name || "" })), comfort, setback });
  }
  const cues = [];
  if (wizard.preset === "heat" && thermostats.length) cues.push({ id: "c-heat", anchor: "start", offsetMin: -60, controlId: "heat", action: "comfort", appliesTo: [] });
  if (wizard.preset !== "blank" && lights.length) {
    cues.push({ id: "c-lights", anchor: "start", offsetMin: -2, controlId: "lights", action: "on", appliesTo: [] });
    cues.push({ id: "c-off", anchor: "end", offsetMin: 0, controlId: "lights", action: "off", appliesTo: [] });
  }
  if (wizard.preset === "heat" && thermostats.length) cues.push({ id: "c-setback", anchor: "end", offsetMin: 0, controlId: "heat", action: "setback", appliesTo: [] });
  const space = { id: "sanctuary", name: wizard.name || "Sanctuary", stayOnGapMin: 45, controls, cues };
  const times = wizard.times || defaultTimes();
  const prayer = (id, name, position, start, lasts) => ({
    id, name, spaceId: space.id, position, start,
    end: { type: "duration", minutes: Number(lasts) || 30 },
    roundTo: roundFor(start), runCues: true, laterDays: true, laterEvenings: true,
  });
  const weekdayMincha = minchaStart(times);
  const monThu = [
    prayer("wd-shacharis", "Shacharis", "day", shacharisStart(times.monThuMode, times.monThuTime, times.monThuContains), times.monThuLasts || 50),
    prayer("wd-mincha", "Mincha", "day", weekdayMincha, 30),
  ];
  const sun = [
    prayer("sun-shacharis", "Shacharis", "day", shacharisStart(times.sunMode, times.sunTime, times.sunContains), times.sunLasts || 60),
    prayer("sun-mincha", "Mincha", "day", weekdayMincha, 30),
  ];
  if (times.weekdayMaariv) {
    const maariv = weekdayMaarivStart(times);
    monThu.push(prayer("wd-maariv", "Maariv", "day", maariv, times.weekdayMaarivLasts || 20));
    sun.push(prayer("sun-maariv", "Maariv", "day", maariv, times.weekdayMaarivLasts || 20));
  }
  const shabbat = [
    prayer("sh-mincha", "Mincha", "evening", fridayMinchaStart(times), 30),
    prayer("sh-maariv", "Maariv", "evening", shabbatMaarivStart(times), times.maarivLasts || 25),
    prayer("sh-shacharis", "Shacharis", "day", shacharisStart(times.shabbatShacharisMode, times.shabbatTime, times.shabbatShacharisContains), times.shabbatLasts || 150),
  ];
  if (times.shabbatMode !== "none") shabbat.push(prayer("sh-mincha-day", "Mincha", "day", shabbatMinchaStart(times), 30));
  const week = {
    monThu: { source: "own", entries: monThu },
    sun: { source: "own", entries: sun },
    friday: { source: "same", follows: "monThu", entries: [] },
    shabbat: { source: "own", entries: shabbat },
  };
  saveOp({ op: "setup", space, week, yomTov: !!yomTov && !openDays }, openDays ? "days" : "agenda");
}

function beforeSunset(minutes) { return { type: "zman", zman: "sunset", offsetMin: -Math.abs(Number(minutes) || 0) }; }
function fromCalendar(contains, fallback) { return { type: "calendar", contains: contains || "Mincha", ifMissing: "skip", fallback }; }
function roundFor(start) {
  if (start?.type === "clock") return 0;
  if (start?.type === "calendar" && start.fallback?.type === "clock") return 0;
  return 5;
}
function minchaStart(times) {
  const usual = beforeSunset(times.weekdayMinutes);
  return times.weekdayMode === "calendar" ? fromCalendar(times.weekdayContains, usual) : usual;
}
function fridayMinchaStart(times) {
  const candles = { type: "zman", zman: "candleLighting", offsetMin: 0 };
  if (times.fridayMode === "calendar") return fromCalendar(times.fridayContains, candles);
  if (times.fridayMode === "same") return beforeSunset(times.weekdayMinutes);
  if (times.fridayMode === "offset") return beforeSunset(times.fridayMinutes);
  return candles;
}
function shabbatMinchaStart(times) {
  const usual = beforeSunset(times.shabbatMinutes);
  return times.shabbatMode === "calendar" ? fromCalendar(times.shabbatContains, usual) : usual;
}
function shacharisStart(mode, time, contains) {
  const usual = { type: "clock", time: time || "07:00" };
  return mode === "calendar" ? fromCalendar(contains || "Shacharis", usual) : usual;
}
function shabbatMaarivStart(times) {
  const usual = { type: "zman", zman: "nightfall", offsetMin: Number(times.maarivAfter) || 0 };
  return times.maarivMode === "calendar" ? fromCalendar(times.maarivContains, usual) : usual;
}
function weekdayMaarivStart(times) {
  const usual = { type: "zman", zman: "nightfall", offsetMin: 0 };
  return times.weekdayMaarivMode === "calendar" ? fromCalendar(times.weekdayMaarivContains, usual) : usual;
}
function minuteChoices(minutes, onPick) {
  const n = Math.abs(Number(minutes) || 0);
  const wrap = ce("div");
  wrap.appendChild(chips([["10", "10"], ["15", "15"], ["20", "20"]], [10, 15, 20].includes(n) ? String(n) : "", (id) => { onPick(Number(id)); render(); }));
  wrap.appendChild(field("Minutes before sunset", "number", String(n), (v) => onPick(Math.abs(Number(v) || 0))));
  return wrap;
}
function calendarChoice(on, contains, onMode, onContains) {
  const box = ce("div");
  box.appendChild(checkField("Use the calendar instead", on, (checked) => onMode(checked)));
  if (on) box.appendChild(field("Title contains", "text", contains || "", (v) => onContains(v)));
  return box;
}
function renderMinchaStep(box) {
  const times = wizard.times;
  box.appendChild(sectionTitle("Weekday Mincha"));
  box.appendChild(note("How many minutes before sunset."));
  if (times.weekdayMode !== "calendar") box.appendChild(minuteChoices(times.weekdayMinutes, (n) => { times.weekdayMinutes = n; }));
  box.appendChild(calendarChoice(times.weekdayMode === "calendar", times.weekdayContains, (on) => { times.weekdayMode = on ? "calendar" : "offset"; render(); }, (v) => { times.weekdayContains = v; }));
  box.appendChild(sectionTitle("Friday night Mincha"));
  box.appendChild(chips([["candles", "Candle lighting"], ["same", "Same as weekday"], ["offset", "Other"], ["calendar", "Calendar"]], times.fridayMode, (id) => { times.fridayMode = id; render(); }));
  if (times.fridayMode === "offset") box.appendChild(field("Minutes before sunset", "number", String(times.fridayMinutes), (v) => { times.fridayMinutes = Math.abs(Number(v) || 0); }));
  if (times.fridayMode === "calendar") box.appendChild(field("Title contains", "text", times.fridayContains, (v) => { times.fridayContains = v; }));
  box.appendChild(sectionTitle("Shabbat afternoon Mincha"));
  box.appendChild(chips([["offset", "Before sunset"], ["calendar", "Calendar"], ["none", "None"]], times.shabbatMode, (id) => { times.shabbatMode = id; render(); }));
  if (times.shabbatMode === "offset") box.appendChild(minuteChoices(times.shabbatMinutes, (n) => { times.shabbatMinutes = n; }));
  if (times.shabbatMode === "calendar") box.appendChild(field("Title contains", "text", times.shabbatContains, (v) => { times.shabbatContains = v; }));
}
function renderMorningStep(box) {
  const times = wizard.times;
  box.appendChild(note("Friday night and Shabbat morning stay on Shabbat, so they are not scheduled twice."));
  const mornings = [
    ["Monday to Thursday", "monThuTime", "monThuLasts", "monThuMode", "monThuContains"],
    ["Sunday", "sunTime", "sunLasts", "sunMode", "sunContains"],
    ["Shabbat", "shabbatTime", "shabbatLasts", "shabbatShacharisMode", "shabbatShacharisContains"],
  ];
  for (const [label, timeKey, lastsKey, modeKey, containsKey] of mornings) {
    const card = ce("div", "sched-row");
    card.appendChild(sectionTitle(label + " Shacharis"));
    if (times[modeKey] !== "calendar") {
      card.appendChild(field("Starts", "time", times[timeKey], (v) => { times[timeKey] = v; }));
      card.appendChild(field("Lasts minutes", "number", String(times[lastsKey]), (v) => { times[lastsKey] = Number(v); }));
    }
    card.appendChild(calendarChoice(times[modeKey] === "calendar", times[containsKey], (on) => { times[modeKey] = on ? "calendar" : "clock"; render(); }, (v) => { times[containsKey] = v; }));
    box.appendChild(card);
  }
  box.appendChild(sectionTitle("Shabbat Maariv"));
  if (times.maarivMode !== "calendar") {
    box.appendChild(note("At nightfall."));
    box.appendChild(field("Minutes after nightfall", "number", String(times.maarivAfter), (v) => { times.maarivAfter = Number(v) || 0; }));
    box.appendChild(field("Lasts minutes", "number", String(times.maarivLasts), (v) => { times.maarivLasts = Number(v); }));
  }
  box.appendChild(calendarChoice(times.maarivMode === "calendar", times.maarivContains, (on) => { times.maarivMode = on ? "calendar" : "nightfall"; render(); }, (v) => { times.maarivContains = v; }));
  box.appendChild(checkField("Also schedule weekday Maariv on its own", !!times.weekdayMaariv, (on) => { times.weekdayMaariv = on; render(); }));
  if (times.weekdayMaariv) {
    box.appendChild(note("Weekday Maariv is at nightfall. Otherwise it stays inside Mincha."));
    box.appendChild(field("Lasts minutes", "number", String(times.weekdayMaarivLasts), (v) => { times.weekdayMaarivLasts = Number(v); }));
    box.appendChild(calendarChoice(times.weekdayMaarivMode === "calendar", times.weekdayMaarivContains, (on) => { times.weekdayMaarivMode = on ? "calendar" : "nightfall"; render(); }, (v) => { times.weekdayMaarivContains = v; }));
  }
}

globalThis.mldSynagogue = { mount, refresh, apiVersion: API };
