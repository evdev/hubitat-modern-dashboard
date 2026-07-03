(() => {
  "use strict";
  const M = globalThis.__MLD;
  if (!M) {
    console.error("Modern Dashboard: upload mld-app-post2.js before mld-app-post3.js");
    return;
  }
// ---------- scheduler module (ships as mld-app-post3.js) ----------
  const SCHED_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const SCHED_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const SCHED_OFFSET_PRESETS = [-60, -45, -30, -15, 0, 15, 30, 45, 60];
  let schedules = [];
  let sunTimes = { sunrise: null, sunset: null };
  let schedViewOpen = false;
  let schedDraft = null;     // in-progress create/edit draft
  let schedStep = 1;         // 1 | 2 | 3
  let schedEditingId = null;

  function applySchedulesFromData(data) {
    if (!data) return;
    if (Array.isArray(data.schedules)) schedules = data.schedules;
    if (data.sunTimes && typeof data.sunTimes === "object") {
      sunTimes = { sunrise: data.sunTimes.sunrise ?? null, sunset: data.sunTimes.sunset ?? null };
    }
    if (schedViewOpen) renderSchedulerActive();
  }

  function schedulerHasContent() {
    return true;
  }

  function fmtSchedTime(ms) {
    if (ms == null) return "\u2014";
    try {
      const d = new Date(Number(ms));
      if (isNaN(d.getTime())) return "\u2014";
      return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch { return "\u2014"; }
  }

  function newSchedDraft() {
    return {
      name: "",
      enabled: true,
      trigger: { kind: "daily", when: "clock", time: "19:30", offsetMin: 0, days: [], at: "", mode: "" },
      onlyInModes: [],
      action: { target: "lights", states: [], "devices": [], mode: "heat", heat: 68, cool: 72, fanMode: "auto" }
    };
  }

  async function schedApi(path, body) {
    try {
      const r = await fetch(M.withToken("schedules/" + path), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body || {})
      });
      return await r.json();
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  }

  function renderSchedulerView() {
    schedViewOpen = true;
    renderSchedulerActive();
  }

  function renderSchedulerActive() {
    const popup = M.ensureQuickPopup();
    M.syncQuickPopupRef(popup);
    popup.classList.remove("quick-popup-hub-mode");
    popup.classList.add("quick-popup-wide");
    const body = M.currentBody();
    body.className = "quick-body quick-body-scheduler" + (M.inTabView() ? " tab-body" : "");
    body.innerHTML = "";
    if (schedDraft) {
      body.appendChild(renderSchedWorkflow());
    } else {
      body.appendChild(renderSchedList());
    }
  }

  // ---------- saved schedules list ----------
  function renderSchedList() {
    const wrap = ce("div", "sched-list-wrap");
    const header = ce("div", "sched-section-head");
    const title = ce("h3", "sched-section-title");
    title.textContent = "Schedules";
    header.appendChild(title);
    const addBtn = ce("button", "ghost-btn sched-add-btn");
    addBtn.type = "button";
    addBtn.textContent = "+ New schedule";
    addBtn.addEventListener("click", () => {
      schedDraft = newSchedDraft();
      schedEditingId = null;
      schedStep = 1;
      renderSchedulerActive();
    });
    header.appendChild(addBtn);
    wrap.appendChild(header);

    if (!schedules.length) {
      const empty = ce("p", "sched-empty");
      empty.textContent = "No schedules yet. Tap \u201cNew schedule\u201d to create one.";
      wrap.appendChild(empty);
      return wrap;
    }

    const list = ce("div", "sched-list");
    for (const s of schedules) {
      list.appendChild(renderSchedRow(s));
    }
    wrap.appendChild(list);
    return wrap;
  }

  function renderSchedRow(s) {
    const row = ce("div", "sched-row");
    const info = ce("div", "sched-row-info");
    const nameEl = ce("div", "sched-row-name");
    nameEl.textContent = s.name || "Untitled schedule";
    info.appendChild(nameEl);
    const sum = ce("div", "sched-row-summary");
    sum.textContent = s.summary || "";
    info.appendChild(sum);
    const times = ce("div", "sched-row-times");
    const nextLbl = ce("span", "sched-time-lbl");
    nextLbl.textContent = "Next: ";
    const nextVal = ce("span", "sched-time-val");
    nextVal.textContent = s.trigger?.kind === "mode" ? "On mode change" : (s.nextFire == null ? "On schedule" : fmtSchedTime(s.nextFire));
    times.appendChild(nextLbl);
    times.appendChild(nextVal);
    const lastLbl = ce("span", "sched-time-lbl");
    lastLbl.textContent = " \u00b7 Last: ";
    const lastVal = ce("span", "sched-time-val");
    lastVal.textContent = fmtSchedTime(s.lastFired);
    times.appendChild(lastLbl);
    times.appendChild(lastVal);
    info.appendChild(times);
    row.appendChild(info);

    const controls = ce("div", "sched-row-controls");
    const toggle = ce("button", "sched-toggle " + (s.enabled ? "is-on" : "is-off"));
    toggle.type = "button";
    toggle.setAttribute("aria-pressed", s.enabled ? "true" : "false");
    toggle.textContent = s.enabled ? "Enabled" : "Disabled";
    toggle.addEventListener("click", async () => {
      M.hapticTap();
      toggle.disabled = true;
      const res = await schedApi("toggle", { id: s.id });
      toggle.disabled = false;
      if (res?.ok) {
        if (Array.isArray(res.schedules)) schedules = res.schedules;
        renderSchedulerActive();
      } else {
        M.flash(res?.error || "Toggle failed", true);
      }
    });
    controls.appendChild(toggle);

    const editBtn = ce("button", "ghost-btn sched-icon-btn");
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      schedDraft = JSON.parse(JSON.stringify(s));
      schedDraft.trigger = schedDraft.trigger || { kind: "daily", when: "clock", time: "19:30", offsetMin: 0, mode: "" };
      if (!schedDraft.trigger.when) schedDraft.trigger.when = "clock";
      if (schedDraft.trigger.offsetMin == null) schedDraft.trigger.offsetMin = 0;
      if (!schedDraft.trigger.mode) schedDraft.trigger.mode = "";
      schedDraft.onlyInModes = Array.isArray(schedDraft.onlyInModes) ? schedDraft.onlyInModes : [];
      schedDraft.action = schedDraft.action || { target: "lights", states: [] };
      schedEditingId = s.id;
      schedStep = 1;
      renderSchedulerActive();
    });
    controls.appendChild(editBtn);

    const testBtn = ce("button", "ghost-btn sched-icon-btn");
    testBtn.type = "button";
    testBtn.textContent = "Test";
    testBtn.addEventListener("click", async () => {
      M.hapticTap();
      testBtn.disabled = true;
      const res = await schedApi("test", { id: s.id });
      testBtn.disabled = false;
      M.flash(res?.ok ? "Ran schedule actions" : (res?.error || "Test failed"), !res?.ok);
    });
    controls.appendChild(testBtn);

    const delBtn = ce("button", "ghost-btn sched-icon-btn sched-del-btn");
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      if (!confirm("Delete this schedule?")) return;
      M.hapticTap();
      delBtn.disabled = true;
      const res = await schedApi("delete", { id: s.id });
      delBtn.disabled = false;
      if (res?.ok) {
        if (Array.isArray(res.schedules)) schedules = res.schedules;
        renderSchedulerActive();
      } else {
        M.flash(res?.error || "Delete failed", true);
      }
    });
    controls.appendChild(delBtn);
    row.appendChild(controls);
    return row;
  }

  // ---------- workflow ----------
  function renderSchedWorkflow() {
    const wrap = ce("div", "sched-workflow");
    const head = ce("div", "sched-workflow-head");
    const title = ce("h3", "sched-section-title");
    title.textContent = schedEditingId ? "Edit schedule" : "New schedule";
    head.appendChild(title);
    const cancelBtn = ce("button", "ghost-btn sched-cancel-btn");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      schedDraft = null;
      schedEditingId = null;
      renderSchedulerActive();
    });
    head.appendChild(cancelBtn);
    wrap.appendChild(head);

    const steps = ce("div", "sched-step-indicator");
    for (let i = 1; i <= 3; i++) {
      const dot = ce("div", "sched-step-dot " + (i === schedStep ? "is-active" : (i < schedStep ? "is-done" : "")));
      dot.textContent = String(i);
      steps.appendChild(dot);
      if (i < 3) steps.appendChild(ce("div", "sched-step-line"));
    }
    wrap.appendChild(steps);

    if (schedStep === 1) wrap.appendChild(renderSchedStep1());
    else if (schedStep === 2) wrap.appendChild(renderSchedStep2());
    else wrap.appendChild(renderSchedStep3());
    return wrap;
  }

  function schedNavRow(backLabel, backCb, fwdLabel, fwdCb) {
    const nav = ce("div", "sched-nav");
    if (backLabel) {
      const b = ce("button", "ghost-btn");
      b.type = "button";
      b.textContent = backLabel;
      b.addEventListener("click", backCb);
      nav.appendChild(b);
    }
    if (fwdLabel) {
      const f = ce("button", "ghost-btn sched-primary-btn");
      f.type = "button";
      f.textContent = fwdLabel;
      f.addEventListener("click", fwdCb);
      nav.appendChild(f);
    }
    return nav;
  }

  function schedBindPickRow(row, toggle) {
    row.classList.add("sched-pick-row");
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      toggle();
    });
  }

  function schedBindPickRoom(hdr, checkBtn) {
    hdr.classList.add("sched-pick-room");
    hdr.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      checkBtn.click();
    });
  }

  // Step 1: When
  function renderSchedStep1() {
    const wrap = ce("div", "sched-step");
    const q = ce("p", "sched-question");
    q.textContent = "When would you like this automation to occur?";
    wrap.appendChild(q);

    const tr = schedDraft.trigger;
    const kinds = [
      { k: "daily", label: "Daily" },
      { k: "weekly", label: "Weekly" },
      { k: "once", label: "One-time" },
      { k: "mode", label: "When mode changes" }
    ];
    const seg = ce("div", "sched-segment");
    for (const { k, label } of kinds) {
      const b = ce("button", "sched-seg " + (tr.kind === k ? "is-active" : ""));
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => {
        tr.kind = k;
        if (k === "weekly" && (!tr.days || !tr.days.length)) tr.days = ["MON"];
        if (k === "once" && !tr.at) tr.at = defaultOnceAt();
        if (k === "mode") {
          schedDraft.onlyInModes = [];
          if (!tr.mode && M.hubModes.length) tr.mode = M.hubModes[0];
        }
        renderSchedulerActive();
      });
      seg.appendChild(b);
    }
    wrap.appendChild(seg);

    if (tr.kind === "daily" || tr.kind === "weekly") {
      wrap.appendChild(renderSchedWhenPicker(tr));
      if ((tr.when || "clock") === "clock") {
        wrap.appendChild(renderSchedTimePicker(tr));
      } else {
        wrap.appendChild(renderSchedOffsetPicker(tr));
        wrap.appendChild(renderSchedSunPreview(tr));
      }
    }
    if (tr.kind === "weekly") {
      wrap.appendChild(renderSchedDayPicker(tr));
    }
    if (tr.kind === "once") {
      wrap.appendChild(renderSchedOncePicker(tr));
    }
    if (tr.kind === "mode") {
      wrap.appendChild(renderSchedModeTriggerPicker(tr));
    }
    if (tr.kind !== "mode" && (tr.kind === "daily" || tr.kind === "weekly" || tr.kind === "once")) {
      wrap.appendChild(renderSchedModeCondition());
    }

    const nameField = ce("div", "sched-field");
    const nlbl = ce("label", "sched-field-label");
    nlbl.textContent = "Schedule name (optional)";
    nameField.appendChild(nlbl);
    const nin = ce("input", "sched-input");
    nin.type = "text";
    nin.value = schedDraft.name || "";
    nin.placeholder = autoSchedName();
    nin.addEventListener("input", () => { schedDraft.name = nin.value; });
    nameField.appendChild(nin);
    wrap.appendChild(nameField);

    wrap.appendChild(schedNavRow(null, null, "Next", () => {
      if (!validateStep1()) return;
      schedStep = 2;
      renderSchedulerActive();
    }));
    return wrap;
  }

  function validateStep1() {
    const tr = schedDraft.trigger;
    const when = tr.when || "clock";
    if (tr.kind === "daily" || tr.kind === "weekly") {
      if (when === "clock") {
        if (!/^\d{1,2}:\d{2}$/.test(tr.time || "")) { M.flash("Enter a valid time (HH:MM)", true); return false; }
      } else {
        const off = Number(tr.offsetMin);
        if (!Number.isFinite(off) || off < -720 || off > 720) { M.flash("Offset must be between -720 and 720 minutes", true); return false; }
      }
    }
    if (tr.kind === "weekly" && (!tr.days || !tr.days.length)) { M.flash("Pick at least one day", true); return false; }
    if (tr.kind === "once" && !tr.at) { M.flash("Pick a date and time", true); return false; }
    if (tr.kind === "mode" && !tr.mode) { M.flash("Pick a hub mode", true); return false; }
    return true;
  }

  function renderSchedModeTriggerPicker(tr) {
    const wrap = ce("div", "sched-field");
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = "When hub mode becomes";
    wrap.appendChild(lbl);
    if (!M.hubModes.length) {
      const empty = ce("p", "sched-empty");
      empty.textContent = "No hub modes available.";
      wrap.appendChild(empty);
      return wrap;
    }
    const grid = ce("div", "sched-mode-grid");
    for (const m of M.hubModes) {
      const b = ce("button", "sched-type-card " + (tr.mode === m ? "is-active" : ""));
      b.type = "button";
      b.textContent = m;
      b.addEventListener("click", () => { tr.mode = m; renderSchedulerActive(); });
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function renderSchedModeCondition() {
    const wrap = ce("div", "sched-field");
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = "Restrict to modes (optional)";
    wrap.appendChild(lbl);
    const hint = ce("p", "sched-hint");
    hint.textContent = "Only run when the hub is in one of these modes. Leave all unselected to always run.";
    wrap.appendChild(hint);
    if (!M.hubModes.length) {
      const empty = ce("p", "sched-empty");
      empty.textContent = "No hub modes available.";
      wrap.appendChild(empty);
      return wrap;
    }
    const selected = new Set(schedDraft.onlyInModes || []);
    const grid = ce("div", "sched-mode-grid");
    for (const m of M.hubModes) {
      const b = ce("button", "sched-type-card " + (selected.has(m) ? "is-active" : ""));
      b.type = "button";
      b.textContent = m;
      b.addEventListener("click", () => {
        M.hapticTap();
        if (selected.has(m)) {
          selected.delete(m);
        } else {
          selected.add(m);
        }
        schedDraft.onlyInModes = [...selected];
        renderSchedulerActive();
      });
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function schedOffsetLabel(min) {
    const n = Number(min) || 0;
    if (n === 0) return "At time";
    if (n > 0) return "+" + n + " min";
    return String(n) + " min";
  }

  function renderSchedWhenPicker(tr) {
    const field = ce("div", "sched-field");
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = "Time of day";
    field.appendChild(lbl);
    const when = tr.when || "clock";
    const seg = ce("div", "sched-segment");
    for (const { k, label } of [{ k: "clock", label: "Clock" }, { k: "sunrise", label: "Sunrise" }, { k: "sunset", label: "Sunset" }]) {
      const b = ce("button", "sched-seg " + (when === k ? "is-active" : ""));
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => {
        tr.when = k;
        if (k === "clock" && !tr.time) tr.time = "19:30";
        if (k !== "clock" && tr.offsetMin == null) tr.offsetMin = 0;
        renderSchedulerActive();
      });
      seg.appendChild(b);
    }
    field.appendChild(seg);
    return field;
  }

  function renderSchedOffsetPicker(tr) {
    const field = ce("div", "sched-field");
    const when = tr.when || "sunrise";
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = when === "sunset" ? "Offset from sunset" : "Offset from sunrise";
    field.appendChild(lbl);
    const presets = ce("div", "sched-offset-row");
    const cur = Number(tr.offsetMin) || 0;
    for (const off of SCHED_OFFSET_PRESETS) {
      const b = ce("button", "sched-offset " + (cur === off ? "is-on" : ""));
      b.type = "button";
      b.textContent = schedOffsetLabel(off);
      b.addEventListener("click", () => {
        tr.offsetMin = off;
        renderSchedulerActive();
      });
      presets.appendChild(b);
    }
    field.appendChild(presets);
    const custom = ce("div", "sched-offset-custom");
    const clbl = ce("label", "sched-field-label");
    clbl.textContent = "Custom offset (minutes, negative = before)";
    custom.appendChild(clbl);
    const inp = ce("input", "sched-input");
    inp.type = "number";
    inp.min = "-720";
    inp.max = "720";
    inp.step = "5";
    inp.value = String(cur);
    inp.addEventListener("input", () => { tr.offsetMin = Number(inp.value) || 0; });
    custom.appendChild(inp);
    field.appendChild(custom);
    return field;
  }

  function renderSchedSunPreview(tr) {
    const when = tr.when || "sunrise";
    const base = when === "sunset" ? sunTimes.sunset : sunTimes.sunrise;
    if (base == null) return ce("div");
    const off = (Number(tr.offsetMin) || 0) * 60 * 1000;
    const at = Number(base) + off;
    const field = ce("div", "sched-field sched-sun-preview");
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = "Today's time";
    field.appendChild(lbl);
    const val = ce("div", "sched-sun-preview-val");
    val.textContent = fmtSchedTime(at);
    field.appendChild(val);
    return field;
  }

  function renderSchedTimePicker(tr) {
    const field = ce("div", "sched-field");
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = "Time";
    field.appendChild(lbl);
    const inp = ce("input", "sched-input");
    inp.type = "time";
    inp.value = tr.time || "19:30";
    inp.addEventListener("input", () => { tr.time = inp.value; });
    field.appendChild(inp);
    return field;
  }

  function renderSchedDayPicker(tr) {
    const field = ce("div", "sched-field");
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = "Days";
    field.appendChild(lbl);
    const row = ce("div", "sched-day-row");
    const selected = new Set(tr.days || []);
    for (let i = 0; i < 7; i++) {
      const d = SCHED_DAYS[i];
      const b = ce("button", "sched-day " + (selected.has(d) ? "is-on" : ""));
      b.type = "button";
      b.textContent = SCHED_DAY_LABELS[i];
      b.addEventListener("click", () => {
        if (selected.has(d)) selected.delete(d); else selected.add(d);
        tr.days = [...selected];
        renderSchedulerActive();
      });
      row.appendChild(b);
    }
    field.appendChild(row);
    return field;
  }

  function defaultOnceAt() {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function renderSchedOncePicker(tr) {
    const field = ce("div", "sched-field");
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = "Date and time";
    field.appendChild(lbl);
    const dt = ce("input", "sched-input sched-datetime");
    dt.type = "datetime-local";
    if (tr.at && tr.at.length >= 16) {
      dt.value = tr.at.substring(0, 16);
    } else {
      dt.value = defaultOnceAt();
      tr.at = dt.value;
    }
    dt.addEventListener("input", () => { tr.at = dt.value; });
    field.appendChild(dt);
    return field;
  }

  // Step 2: device type
  function renderSchedStep2() {
    const wrap = ce("div", "sched-step");
    const q = ce("p", "sched-question");
    q.textContent = "What type of device would you like to control?";
    wrap.appendChild(q);
    const opts = [
      { k: "lights", label: "Lights" },
      ...(M.plainSwitches.length ? [{ k: "switches", label: "Switches" }] : []),
      ...(M.outlets.length ? [{ k: "outlets", label: "Outlets" }] : []),
      { k: "thermostats", label: "Thermostats" },
      { k: "hubMode", label: "Hub mode" }
    ];
    if (!opts.some((o) => o.k === schedDraft.action.target)) {
      schedDraft.action.target = "lights";
    }
    const grid = ce("div", "sched-type-grid");
    for (const { k, label } of opts) {
      const b = ce("button", "sched-type-card " + (schedDraft.action.target === k ? "is-active" : ""));
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => {
        schedDraft.action.target = k;
        if ((k === "lights" || k === "switches" || k === "outlets") && !schedDraft.action.states) schedDraft.action.states = [];
        if (k === "thermostats" && !schedDraft.action.devices) schedDraft.action.devices = [];
        renderSchedulerActive();
      });
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    wrap.appendChild(schedNavRow("Back", () => { schedStep = 1; renderSchedulerActive(); }, "Next", () => {
      if (!schedDraft.action.target) { M.flash("Pick a type", true); return; }
      schedStep = 3;
      renderSchedulerActive();
    }));
    return wrap;
  }

  // Step 3: action
  function renderSchedStep3() {
    const wrap = ce("div", "sched-step");
    const t = schedDraft.action.target;
    if (t === "lights") wrap.appendChild(renderSchedLightAction());
    else if (t === "switches") wrap.appendChild(renderSchedOnOffDeviceAction(M.plainSwitches, "Select switches", "No switches configured. Add switches in the companion app device settings."));
    else if (t === "outlets") wrap.appendChild(renderSchedOnOffDeviceAction(M.outlets, "Select outlets", "No outlets configured. Add outlets in the companion app device settings."));
    else if (t === "thermostats") wrap.appendChild(renderSchedThermostatAction());
    else if (t === "hubMode") wrap.appendChild(renderSchedHubModeAction());
    wrap.appendChild(schedNavRow("Back", () => { schedStep = 2; renderSchedulerActive(); }, schedEditingId ? "Save" : "Create", saveSchedule));
    return wrap;
  }

  function renderSchedOnOffDeviceAction(devList, question, emptyMsg) {
    const wrap = ce("div", "sched-action");
    const q = ce("p", "sched-question");
    q.textContent = question;
    wrap.appendChild(q);
    if (!devList.length) {
      const empty = ce("p", "sched-empty");
      empty.textContent = emptyMsg;
      wrap.appendChild(empty);
      return wrap;
    }

    const selectedIds = new Set((schedDraft.action.states || []).map((s) => String(s.id)));
    const byRoom = new Map();
    for (const d of devList) {
      const rid = d.r == null ? "none" : String(d.r);
      if (!byRoom.has(rid)) byRoom.set(rid, []);
      byRoom.get(rid).push(d);
    }
    const findState = (id) => (schedDraft.action.states || []).find((s) => String(s.id) === String(id));

    function renderRow(d) {
      const st = findState(d.i);
      const row = ce("div", "sched-light-row");
      const head = ce("div", "sched-light-row-head");
      const nm = ce("div", "sched-light-name");
      nm.textContent = d.n || ("Device " + d.i);
      head.appendChild(nm);
      const removeBtn = ce("button", "ghost-btn sched-mini-btn");
      removeBtn.type = "button";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        selectedIds.delete(String(d.i));
        schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
        refreshOnOffAction();
      });
      head.appendChild(removeBtn);
      row.appendChild(head);
      const onOff = ce("div", "sched-onoff");
      const onBtn = ce("button", "sched-seg " + (st.on ? "is-active" : ""));
      onBtn.type = "button"; onBtn.textContent = "On";
      onBtn.addEventListener("click", () => { st.on = true; refreshOnOffAction(); });
      const offBtn = ce("button", "sched-seg " + (!st.on ? "is-active" : ""));
      offBtn.type = "button"; offBtn.textContent = "Off";
      offBtn.addEventListener("click", () => { st.on = false; refreshOnOffAction(); });
      onOff.appendChild(onBtn); onOff.appendChild(offBtn);
      row.appendChild(onOff);
      return row;
    }

    function refreshOnOffAction() {
      const oldPicker = wrap.querySelector(".sched-light-picker");
      const oldRows = wrap.querySelector(".sched-lights");
      const next = ce("div", "sched-light-picker");
      const roomOrder = [...(M.rooms || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      for (const r of roomOrder) {
        const rid = String(r.id);
        const roomDevs = byRoom.get(rid) || [];
        if (!roomDevs.length) continue;
        const hdr = ce("div", "sched-room-header");
        const allOn = roomDevs.every((d) => selectedIds.has(String(d.i)));
        const check = ce("button", "sched-check " + (allOn ? "is-on" : ""));
        check.type = "button";
        check.textContent = allOn ? "\u2713" : "";
        check.addEventListener("click", () => {
          M.hapticTap();
          if (allOn) {
            for (const d of roomDevs) {
              selectedIds.delete(String(d.i));
              schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
            }
          } else {
            for (const d of roomDevs) {
              selectedIds.add(String(d.i));
              if (!findState(d.i)) schedDraft.action.states.push({ id: d.i, on: true });
            }
          }
          refreshOnOffAction();
        });
        hdr.appendChild(check);
        const nm = ce("div", "sched-room-name");
        nm.textContent = r.name || "Room";
        hdr.appendChild(nm);
        schedBindPickRoom(hdr, check);
        next.appendChild(hdr);
        for (const d of roomDevs) {
          const row = ce("div", "sched-light-toggle-row");
          const sel = selectedIds.has(String(d.i));
          const cbtn = ce("button", "sched-check " + (sel ? "is-on" : ""));
          cbtn.type = "button";
          cbtn.textContent = sel ? "\u2713" : "";
          const toggle = () => {
            M.hapticTap();
            if (sel) {
              selectedIds.delete(String(d.i));
              schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
            } else {
              selectedIds.add(String(d.i));
              schedDraft.action.states.push({ id: d.i, on: true });
            }
            refreshOnOffAction();
          };
          cbtn.addEventListener("click", toggle);
          schedBindPickRow(row, toggle);
          row.appendChild(cbtn);
          const dnm = ce("div", "sched-light-name");
          dnm.textContent = d.n || ("Device " + d.i);
          row.appendChild(dnm);
          next.appendChild(row);
        }
      }
      const unroomed = byRoom.get("none") || [];
      if (unroomed.length) {
        const hdr = ce("div", "sched-room-header");
        const h = ce("div", "sched-room-name");
        h.textContent = "No room";
        hdr.appendChild(h);
        next.appendChild(hdr);
        for (const d of unroomed) {
          const row = ce("div", "sched-light-toggle-row");
          const sel = selectedIds.has(String(d.i));
          const cbtn = ce("button", "sched-check " + (sel ? "is-on" : ""));
          cbtn.type = "button";
          cbtn.textContent = sel ? "\u2713" : "";
          const toggle = () => {
            M.hapticTap();
            if (sel) {
              selectedIds.delete(String(d.i));
              schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
            } else {
              selectedIds.add(String(d.i));
              schedDraft.action.states.push({ id: d.i, on: true });
            }
            refreshOnOffAction();
          };
          cbtn.addEventListener("click", toggle);
          schedBindPickRow(row, toggle);
          row.appendChild(cbtn);
          const dnm = ce("div", "sched-light-name");
          dnm.textContent = d.n || ("Device " + d.i);
          row.appendChild(dnm);
          next.appendChild(row);
        }
      }
      if (oldPicker) oldPicker.replaceWith(next); else wrap.appendChild(next);

      const selList = ce("div", "sched-lights");
      for (const r of roomOrder) {
        const rid = String(r.id);
        const selDevs = (byRoom.get(rid) || []).filter((d) => selectedIds.has(String(d.i)));
        if (!selDevs.length) continue;
        const hdr = ce("div", "sched-room-header sched-room-header-selected");
        const nm = ce("div", "sched-room-name");
        nm.textContent = r.name || "Room";
        hdr.appendChild(nm);
        selList.appendChild(hdr);
        for (const d of selDevs) selList.appendChild(renderRow(d));
      }
      const unroomedSel = unroomed.filter((d) => selectedIds.has(String(d.i)));
      if (unroomedSel.length) {
        const hdr = ce("div", "sched-room-header sched-room-header-selected");
        const nm = ce("div", "sched-room-name");
        nm.textContent = "No room";
        hdr.appendChild(nm);
        selList.appendChild(hdr);
        for (const d of unroomedSel) selList.appendChild(renderRow(d));
      }
      if (oldRows) oldRows.replaceWith(selList); else wrap.appendChild(selList);
    }

    refreshOnOffAction();
    return wrap;
  }

  function renderSchedLightAction() {
    const wrap = ce("div", "sched-action");
    const q = ce("p", "sched-question");
    q.textContent = "Select lights and states";
    wrap.appendChild(q);

    const selectedIds = new Set((schedDraft.action.states || []).map((s) => String(s.id)));
    const byRoom = new Map();
    for (const d of M.devices) {
      const rid = d.r == null ? "none" : String(d.r);
      if (!byRoom.has(rid)) byRoom.set(rid, []);
      byRoom.get(rid).push(d);
    }

    const findState = (id) => (schedDraft.action.states || []).find((s) => String(s.id) === String(id));

    function renderSchedRoomToggle(r, roomDevs) {
      const hdr = ce("div", "sched-room-header");
      const allOn = roomDevs.every((d) => selectedIds.has(String(d.i)));
      const check = ce("button", "sched-check " + (allOn ? "is-on" : ""));
      check.type = "button";
      check.setAttribute("aria-pressed", allOn ? "true" : "false");
      check.textContent = allOn ? "\u2713" : "";
      check.addEventListener("click", () => {
        M.hapticTap();
        if (allOn) {
          for (const d of roomDevs) {
            selectedIds.delete(String(d.i));
            schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
          }
        } else {
          for (const d of roomDevs) {
            selectedIds.add(String(d.i));
            if (!findState(d.i)) schedDraft.action.states.push({ id: d.i, on: true, level: d.d ? 100 : null, ct: d.ct ? 3000 : null });
          }
        }
        refreshLightAction();
      });
      hdr.appendChild(check);
      const nm = ce("div", "sched-room-name");
      nm.textContent = r.name || "Room";
      hdr.appendChild(nm);
      schedBindPickRoom(hdr, check);
      return hdr;
    }

    function renderSchedLightToggle(d) {
      const row = ce("div", "sched-light-toggle-row");
      const sel = selectedIds.has(String(d.i));
      const check = ce("button", "sched-check " + (sel ? "is-on" : ""));
      check.type = "button";
      check.textContent = sel ? "\u2713" : "";
      const toggle = () => {
        M.hapticTap();
        if (sel) {
          selectedIds.delete(String(d.i));
          schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
        } else {
          selectedIds.add(String(d.i));
          schedDraft.action.states.push({ id: d.i, on: true, level: d.d ? 100 : null, ct: d.ct ? 3000 : null });
        }
        refreshLightAction();
      };
      check.addEventListener("click", toggle);
      schedBindPickRow(row, toggle);
      row.appendChild(check);
      const nm = ce("div", "sched-light-name");
      nm.textContent = d.n || ("Device " + d.i);
      row.appendChild(nm);
      return row;
    }

    function renderSchedLightRow(d) {
      const st = findState(d.i);
      const row = ce("div", "sched-light-row");
      const head = ce("div", "sched-light-row-head");
      const nm = ce("div", "sched-light-name");
      nm.textContent = d.n || ("Device " + d.i);
      head.appendChild(nm);
      const removeBtn = ce("button", "ghost-btn sched-mini-btn");
      removeBtn.type = "button";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        selectedIds.delete(String(d.i));
        schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
        refreshLightAction();
      });
      head.appendChild(removeBtn);
      row.appendChild(head);

      const onOff = ce("div", "sched-onoff");
      const onBtn = ce("button", "sched-seg " + (st.on ? "is-active" : ""));
      onBtn.type = "button"; onBtn.textContent = "On";
      onBtn.addEventListener("click", () => { st.on = true; refreshLightAction(); });
      const offBtn = ce("button", "sched-seg " + (!st.on ? "is-active" : ""));
      offBtn.type = "button"; offBtn.textContent = "Off";
      offBtn.addEventListener("click", () => { st.on = false; refreshLightAction(); });
      onOff.appendChild(onBtn); onOff.appendChild(offBtn);
      row.appendChild(onOff);

      if (d.d && st.on) {
        const field = ce("div", "sched-field");
        const lbl = ce("label", "sched-field-label");
        lbl.textContent = "Brightness";
        field.appendChild(lbl);
        const sl = ce("input", "sched-input sched-slider");
        sl.type = "range"; sl.min = "1"; sl.max = "100"; sl.value = String(st.level ?? 100);
        const val = ce("span", "sched-slider-val");
        val.textContent = (st.level ?? 100) + "%";
        sl.addEventListener("input", () => { st.level = Number(sl.value); val.textContent = sl.value + "%"; });
        field.appendChild(sl); field.appendChild(val);
        row.appendChild(field);
      }
      if (d.ct && st.on) {
        const field = ce("div", "sched-field");
        const lbl = ce("label", "sched-field-label");
        lbl.textContent = "White balance (K)";
        field.appendChild(lbl);
        const sl = ce("input", "sched-input sched-slider");
        sl.type = "range"; sl.min = "2500"; sl.max = "6000"; sl.step = "100"; sl.value = String(st.ct ?? 3000);
        const val = ce("span", "sched-slider-val");
        val.textContent = (st.ct ?? 3000) + "K";
        sl.addEventListener("input", () => { st.ct = Number(sl.value); val.textContent = sl.value + "K"; });
        field.appendChild(sl); field.appendChild(val);
        row.appendChild(field);
      }
      return row;
    }

    function refreshLightAction() {
      const oldPicker = wrap.querySelector(".sched-light-picker");
      const oldRows = wrap.querySelector(".sched-lights");
      const next = ce("div", "sched-light-picker");
      const roomOrder = [...(M.rooms || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      for (const r of roomOrder) {
        const rid = String(r.id);
        const roomDevs = byRoom.get(rid) || [];
        if (!roomDevs.length) continue;
        next.appendChild(renderSchedRoomToggle(r, roomDevs));
        for (const d of roomDevs) next.appendChild(renderSchedLightToggle(d));
      }
      const unroomed = byRoom.get("none") || [];
      if (unroomed.length) {
        const hdr = ce("div", "sched-room-header");
        const h = ce("div", "sched-room-name");
        h.textContent = "No room";
        hdr.appendChild(h);
        next.appendChild(hdr);
        for (const d of unroomed) next.appendChild(renderSchedLightToggle(d));
      }
      if (oldPicker) oldPicker.replaceWith(next); else wrap.appendChild(next);

      const selList = ce("div", "sched-lights");
      for (const r of roomOrder) {
        const rid = String(r.id);
        const roomDevs = byRoom.get(rid) || [];
        const selDevs = roomDevs.filter((d) => selectedIds.has(String(d.i)));
        if (!selDevs.length) continue;
        const hdr = ce("div", "sched-room-header sched-room-header-selected");
        const nm = ce("div", "sched-room-name");
        nm.textContent = r.name || "Room";
        hdr.appendChild(nm);
        const allOn = roomDevs.every((d) => selectedIds.has(String(d.i)));
        const allBtn = ce("button", "ghost-btn sched-mini-btn");
        allBtn.type = "button";
        allBtn.textContent = allOn ? "Deselect all" : "Select all";
        allBtn.addEventListener("click", () => {
          M.hapticTap();
          if (allOn) {
            for (const d of roomDevs) {
              selectedIds.delete(String(d.i));
              schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
            }
          } else {
            for (const d of roomDevs) {
              selectedIds.add(String(d.i));
              if (!findState(d.i)) schedDraft.action.states.push({ id: d.i, on: true, level: d.d ? 100 : null, ct: d.ct ? 3000 : null });
            }
          }
          refreshLightAction();
        });
        hdr.appendChild(allBtn);
        selList.appendChild(hdr);
        for (const d of selDevs) selList.appendChild(renderSchedLightRow(d));
      }
      const unroomedSel = unroomed.filter((d) => selectedIds.has(String(d.i)));
      if (unroomedSel.length) {
        const hdr = ce("div", "sched-room-header sched-room-header-selected");
        const nm = ce("div", "sched-room-name");
        nm.textContent = "No room";
        hdr.appendChild(nm);
        selList.appendChild(hdr);
        for (const d of unroomedSel) selList.appendChild(renderSchedLightRow(d));
      }
      if (oldRows) oldRows.replaceWith(selList); else wrap.appendChild(selList);
    }

    refreshLightAction();
    return wrap;
  }

  function renderSchedThermostatAction() {
    const wrap = ce("div", "sched-action");
    const q = ce("p", "sched-question");
    q.textContent = "Select thermostats and settings";
    wrap.appendChild(q);

    const selectedIds = new Set(schedDraft.action.devices || []);
    const list = ce("div", "sched-lights");
    for (const t of M.thermostats) {
      const sel = selectedIds.has(String(t.i));
      const row = ce("div", "sched-light-toggle-row");
      const check = ce("button", "sched-check " + (sel ? "is-on" : ""));
      check.type = "button";
      check.textContent = sel ? "\u2713" : "";
      const toggle = () => {
        M.hapticTap();
        if (sel) selectedIds.delete(String(t.i));
        else selectedIds.add(String(t.i));
        schedDraft.action.devices = [...selectedIds];
        renderSchedulerActive();
      };
      check.addEventListener("click", toggle);
      schedBindPickRow(row, toggle);
      row.appendChild(check);
      const nm = ce("div", "sched-light-name");
      nm.textContent = t.n || ("Thermostat " + t.i);
      row.appendChild(nm);
      list.appendChild(row);
    }
    wrap.appendChild(list);

    if (!(schedDraft.action.devices || []).length) {
      const note = ce("p", "sched-empty");
      note.textContent = "No thermostats selected.";
      wrap.appendChild(note);
    } else {
      const modeField = ce("div", "sched-field");
      const mlbl = ce("label", "sched-field-label");
      mlbl.textContent = "System mode";
      modeField.appendChild(mlbl);
      const modes = ["auto", "heat", "cool", "off"];
      const seg = ce("div", "sched-segment");
      for (const m of modes) {
        const b = ce("button", "sched-seg " + (schedDraft.action.mode === m ? "is-active" : ""));
        b.type = "button"; b.textContent = m;
        b.addEventListener("click", () => { schedDraft.action.mode = m; renderSchedulerActive(); });
        seg.appendChild(b);
      }
      modeField.appendChild(seg);
      wrap.appendChild(modeField);

      const heatField = ce("div", "sched-field");
      const hlbl = ce("label", "sched-field-label");
      hlbl.textContent = "Heat setpoint (\u00b0F)";
      heatField.appendChild(hlbl);
      const hin = ce("input", "sched-input");
      hin.type = "number"; hin.min = "40"; hin.max = "90"; hin.value = String(schedDraft.action.heat ?? 68);
      hin.addEventListener("input", () => { schedDraft.action.heat = Number(hin.value); });
      heatField.appendChild(hin);
      wrap.appendChild(heatField);

      const coolField = ce("div", "sched-field");
      const clbl = ce("label", "sched-field-label");
      clbl.textContent = "Cool setpoint (\u00b0F)";
      coolField.appendChild(clbl);
      const cin = ce("input", "sched-input");
      cin.type = "number"; cin.min = "50"; cin.max = "100"; cin.value = String(schedDraft.action.cool ?? 72);
      cin.addEventListener("input", () => { schedDraft.action.cool = Number(cin.value); });
      coolField.appendChild(cin);
      wrap.appendChild(coolField);

      const fanField = ce("div", "sched-field");
      const flbl = ce("label", "sched-field-label");
      flbl.textContent = "Fan mode";
      fanField.appendChild(flbl);
      const fanModes = ["auto", "on", "circulate"];
      const fseg = ce("div", "sched-segment");
      for (const m of fanModes) {
        const b = ce("button", "sched-seg " + (schedDraft.action.fanMode === m ? "is-active" : ""));
        b.type = "button"; b.textContent = m;
        b.addEventListener("click", () => { schedDraft.action.fanMode = m; renderSchedulerActive(); });
        fseg.appendChild(b);
      }
      fanField.appendChild(fseg);
      wrap.appendChild(fanField);
    }
    return wrap;
  }

  function renderSchedHubModeAction() {
    const wrap = ce("div", "sched-action");
    const q = ce("p", "sched-question");
    q.textContent = "Which hub mode should be set?";
    wrap.appendChild(q);
    if (!M.hubModes.length) {
      const empty = ce("p", "sched-empty");
      empty.textContent = "No hub modes available.";
      wrap.appendChild(empty);
      return wrap;
    }
    const grid = ce("div", "sched-mode-grid");
    for (const m of M.hubModes) {
      const b = ce("button", "sched-type-card " + (schedDraft.action.mode === m ? "is-active" : ""));
      b.type = "button"; b.textContent = m;
      b.addEventListener("click", () => { schedDraft.action.mode = m; renderSchedulerActive(); });
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function autoSchedName() {
    const tr = schedDraft?.trigger;
    const ac = schedDraft?.action;
    let when = "Schedule";
    const trWhen = tr?.when || "clock";
    if (tr?.kind === "daily") {
      if (trWhen === "clock") when = "Daily " + (tr.time || "");
      else {
        const sun = trWhen === "sunset" ? "Sunset" : "Sunrise";
        const off = Number(tr.offsetMin) || 0;
        when = off === 0 ? ("Daily " + sun) : ("Daily " + sun + " " + schedOffsetLabel(off));
      }
    } else if (tr?.kind === "weekly") {
      const days = (tr.days || []).join(",");
      if (trWhen === "clock") when = "Weekly " + days + " " + (tr.time || "");
      else {
        const sun = trWhen === "sunset" ? "Sunset" : "Sunrise";
        const off = Number(tr.offsetMin) || 0;
        when = off === 0 ? ("Weekly " + days + " " + sun) : ("Weekly " + days + " " + sun + " " + schedOffsetLabel(off));
      }
    } else if (tr?.kind === "once") when = "Once " + (tr.at || "");
    else if (tr?.kind === "mode") when = "When mode is " + (tr.mode || "");
    let what = "";
    if (ac?.target === "lights") what = " lights";
    else if (ac?.target === "switches") what = " switches";
    else if (ac?.target === "outlets") what = " outlets";
    else if (ac?.target === "thermostats") what = " thermostats";
    else if (ac?.target === "hubMode") what = " \u2192 " + (ac.mode || "mode");
    return when + what;
  }

  async function saveSchedule() {
    if (!validateStep1()) { schedStep = 1; renderSchedulerActive(); return; }
    const ac = schedDraft.action;
    if (ac.target === "lights" && (!ac.states || !ac.states.length)) { M.flash("Select at least one light", true); return; }
    if (ac.target === "switches" && (!ac.states || !ac.states.length)) { M.flash("Select at least one switch", true); return; }
    if (ac.target === "outlets" && (!ac.states || !ac.states.length)) { M.flash("Select at least one outlet", true); return; }
    if (ac.target === "thermostats" && (!ac.devices || !ac.devices.length)) { M.flash("Select at least one thermostat", true); return; }
    if (ac.target === "hubMode" && !ac.mode) { M.flash("Pick a hub mode", true); return; }
    const payload = {
      id: schedEditingId || undefined,
      name: (schedDraft.name || "").trim() || autoSchedName(),
      enabled: schedDraft.enabled,
      trigger: schedDraft.trigger,
      onlyInModes: schedDraft.onlyInModes || [],
      action: schedDraft.action
    };
    const res = await schedApi("save", payload);
    if (res?.ok) {
      if (Array.isArray(res.schedules)) schedules = res.schedules;
      schedDraft = null;
      schedEditingId = null;
      M.flash("Schedule saved");
      renderSchedulerActive();
    } else {
      M.flash(res?.error || "Save failed", true);
    }
  }

  Object.assign(globalThis.__MLD, { applySchedulesFromData, schedulerHasContent, renderSchedulerView });
  globalThis.__MLD.updateQuickNavVisibility?.();

  Object.assign(M, { applySchedulesFromData, schedulerHasContent, fmtSchedTime, newSchedDraft, schedApi, renderSchedulerView, renderSchedulerActive, renderSchedList, renderSchedRow, renderSchedWorkflow, schedNavRow, schedBindPickRow, schedBindPickRoom, renderSchedStep1, validateStep1, renderSchedModeTriggerPicker, renderSchedModeCondition, schedOffsetLabel, renderSchedWhenPicker, renderSchedOffsetPicker, renderSchedSunPreview, renderSchedTimePicker, renderSchedDayPicker, defaultOnceAt, renderSchedOncePicker, renderSchedStep2, renderSchedStep3, renderSchedOnOffDeviceAction, renderSchedLightAction, renderSchedThermostatAction, renderSchedHubModeAction, autoSchedName, saveSchedule });
})();
