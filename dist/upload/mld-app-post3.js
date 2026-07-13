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
  let schedUse24Hour = false;
  let schedDraft = null;     // in-progress create/edit draft
  let schedStep = 1;         // 1 | 2 | 3
  let schedEditingId = null;

  function applySchedulesFromData(data) {
    if (!data) return;
    if (Array.isArray(data.schedules)) schedules = data.schedules;
    if (data.sunTimes && typeof data.sunTimes === "object") {
      sunTimes = { sunrise: data.sunTimes.sunrise ?? null, sunset: data.sunTimes.sunset ?? null };
    }
    schedUse24Hour = data.schedUse24Hour === true;
    if (schedulerViewIsActive()) renderSchedulerActive();
  }

  function schedulerViewIsActive() {
    if (M.inTabView()) return M.activeTab === "scheduling";
    return M.quickPopupOpenType === "scheduling";
  }

  function schedulerHasContent() {
    return true;
  }

  function schedParseTime24(str) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || "").trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return { h, min };
  }

  function schedFormatTime24(h, min) {
    return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
  }

  function schedTime24To12(str) {
    const t = schedParseTime24(str);
    if (!t) return str || "";
    let h12 = t.h % 12;
    if (h12 === 0) h12 = 12;
    const ap = t.h < 12 ? "AM" : "PM";
    return h12 + ":" + String(t.min).padStart(2, "0") + " " + ap;
  }

  function schedTime12To24(h12, min, ap) {
    let h = Number(h12);
    const m = Number(min);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
    const mer = String(ap || "").toUpperCase();
    if (mer !== "AM" && mer !== "PM") return "";
    h = Math.round(h);
    const mm = Math.round(m);
    if (h < 1 || h > 12 || mm < 0 || mm > 59) return "";
    if (mer === "AM") { if (h === 12) h = 0; }
    else { if (h !== 12) h += 12; }
    return schedFormatTime24(h, mm);
  }

  function schedFmtClockTime(str24) {
    if (!str24) return "";
    return schedUse24Hour ? str24 : schedTime24To12(str24);
  }

  function schedFmtDateTimeLocal(iso) {
    if (!iso) return "";
    if (schedUse24Hour) return iso;
    try {
      const d = new Date(iso.length >= 16 ? iso.substring(0, 16) : iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
    } catch { return iso; }
  }

  const SCHED_WHEEL_ITEM_H = 44;

  function schedCreateScrollWheel(min, max, fmtVal, initial, onSelect) {
    const col = ce("div", "sched-wheel-col");
    const viewport = ce("div", "sched-wheel-viewport");
    viewport.setAttribute("tabindex", "0");
    const list = ce("div", "sched-wheel-list");
    const pad = ce("div", "sched-wheel-pad");
    list.appendChild(pad);
    const values = [];
    const itemEls = [];
    for (let v = min; v <= max; v++) {
      values.push(v);
      const item = ce("div", "sched-wheel-item");
      item.textContent = fmtVal(v);
      list.appendChild(item);
      itemEls.push(item);
    }
    list.appendChild(pad.cloneNode());
    viewport.appendChild(list);
    col.appendChild(viewport);

    let lastVal = initial;
    let snapTimer = null;
    const paintCenter = () => {
      const idx = Math.max(0, Math.min(values.length - 1, Math.round(viewport.scrollTop / SCHED_WHEEL_ITEM_H)));
      itemEls.forEach((el, i) => el.classList.toggle("is-centered", i === idx));
    };
    const snap = () => {
      const idx = Math.max(0, Math.min(values.length - 1, Math.round(viewport.scrollTop / SCHED_WHEEL_ITEM_H)));
      const top = idx * SCHED_WHEEL_ITEM_H;
      if (Math.abs(viewport.scrollTop - top) > 1) viewport.scrollTo({ top, behavior: "smooth" });
      paintCenter();
      const v = values[idx];
      if (v !== lastVal) {
        lastVal = v;
        M.hapticTap(8);
        onSelect(v);
      }
    };
    const onScroll = () => {
      paintCenter();
      clearTimeout(snapTimer);
      snapTimer = setTimeout(snap, 90);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("scrollend", snap);

    const scrollTo = (v, smooth) => {
      const idx = values.indexOf(v);
      if (idx < 0) return;
      lastVal = v;
      viewport.scrollTo({ top: idx * SCHED_WHEEL_ITEM_H, behavior: smooth ? "smooth" : "auto" });
    };

    requestAnimationFrame(() => scrollTo(initial, false));
    return { col, scrollTo, destroy: () => { clearTimeout(snapTimer); viewport.removeEventListener("scroll", onScroll); viewport.removeEventListener("scrollend", snap); } };
  }

  function schedOpenTimeWheelSheet(state, onDone) {
    const overlay = ce("div", "sched-time-sheet open");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Select time");
    const panel = ce("div", "sched-time-sheet-panel");
    const head = ce("div", "sched-time-sheet-head");
    const title = ce("div", "sched-time-sheet-title");
    title.textContent = "Select time";
    const doneBtn = ce("button", "sched-time-sheet-done");
    doneBtn.type = "button";
    doneBtn.textContent = "Done";
    head.appendChild(title);
    head.appendChild(doneBtn);
    panel.appendChild(head);

    const wheels = ce("div", "sched-time-wheels");
    let draftH24 = state.h24;
    let draftMin = state.min;
    let draftAp = state.ap;
    const wheelsCleanup = [];

    const applyHour12 = (h12) => {
      const mer = draftAp === "PM";
      draftH24 = h12 === 12 ? (mer ? 12 : 0) : (mer ? h12 + 12 : h12);
    };

    const hourWheel = schedCreateScrollWheel(
      state.use24h ? 0 : 1,
      state.use24h ? 23 : 12,
      (v) => state.use24h ? String(v).padStart(2, "0") : String(v),
      state.use24h ? draftH24 : (draftH24 % 12 || 12),
      (v) => { if (state.use24h) draftH24 = v; else applyHour12(v); }
    );
    wheels.appendChild(hourWheel.col);
    wheelsCleanup.push(hourWheel);

    const sep = ce("span", "sched-time-wheels-sep");
    sep.textContent = ":";
    sep.setAttribute("aria-hidden", "true");
    wheels.appendChild(sep);

    const minWheel = schedCreateScrollWheel(0, 59, (v) => String(v).padStart(2, "0"), draftMin, (v) => { draftMin = v; });
    wheels.appendChild(minWheel.col);
    wheelsCleanup.push(minWheel);

    if (!state.use24h) {
      const apWheel = schedCreateScrollWheel(0, 1, (v) => (v === 0 ? "AM" : "PM"), draftAp === "AM" ? 0 : 1, (v) => {
        draftAp = v === 0 ? "AM" : "PM";
        const h12 = draftH24 % 12 || 12;
        draftH24 = draftAp === "AM" ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12);
        hourWheel.scrollTo(h12, true);
      });
      wheels.appendChild(apWheel.col);
      wheelsCleanup.push(apWheel);
    }

    panel.appendChild(wheels);
    overlay.appendChild(panel);

    const close = (apply) => {
      wheelsCleanup.forEach((w) => w.destroy());
      overlay.remove();
      if (apply) onDone({ h24: draftH24, min: draftMin, ap: draftAp });
    };
    doneBtn.addEventListener("click", () => { M.hapticTap(); close(true); });
    M.bindPopupDismiss(overlay, panel, null, () => close(false));
    M.appendPopup(overlay);
    if (state.focusCol === "minute") requestAnimationFrame(() => minWheel.col.querySelector(".sched-wheel-viewport")?.focus());
    else requestAnimationFrame(() => hourWheel.col.querySelector(".sched-wheel-viewport")?.focus());
  }

  function schedBindStepHold(btn, stepFn) {
    let delayTimer = null;
    let repeatTimer = null;
    const clear = () => {
      if (delayTimer) clearTimeout(delayTimer);
      if (repeatTimer) clearInterval(repeatTimer);
      delayTimer = repeatTimer = null;
    };
    const run = () => {
      M.hapticTap();
      stepFn();
    };
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      run();
      delayTimer = setTimeout(() => { repeatTimer = setInterval(run, 80); }, 400);
    });
    btn.addEventListener("pointerup", clear);
    btn.addEventListener("pointercancel", clear);
  }

  function schedAppendTimeStep(btnRow, glyph, ariaLabel, stepFn) {
    const b = ce("button", "sched-time-step");
    b.type = "button";
    b.textContent = glyph;
    b.setAttribute("aria-label", ariaLabel);
    schedBindStepHold(b, stepFn);
    btnRow.appendChild(b);
  }

  function schedAppendTimeColumn(parent, label, getVal, setVal, min, max, fmtVal, onTapVal) {
    const col = ce("div", "sched-time-col");
    const lbl = ce("span", "sched-time-col-label");
    lbl.textContent = label;
    col.appendChild(lbl);
    const valBtn = ce("button", "sched-time-val sched-time-val-btn");
    valBtn.type = "button";
    valBtn.setAttribute("aria-label", "Select " + label.toLowerCase());
    valBtn.setAttribute("aria-live", "polite");
    const refreshVal = () => { valBtn.textContent = fmtVal(getVal()); };
    refreshVal();
    valBtn.addEventListener("click", () => {
      M.hapticTap();
      onTapVal?.();
    });
    col.appendChild(valBtn);
    const btnRow = ce("div", "sched-time-step-row");
    schedAppendTimeStep(btnRow, "\u2212", "Decrease " + label.toLowerCase(), () => {
      const v = getVal();
      setVal(v <= min ? max : v - 1);
      refreshVal();
    });
    schedAppendTimeStep(btnRow, "+", "Increase " + label.toLowerCase(), () => {
      const v = getVal();
      setVal(v >= max ? min : v + 1);
      refreshVal();
    });
    col.appendChild(btnRow);
    parent.appendChild(col);
    return { refreshVal };
  }

  function schedAppendClockPicker(parent, time24, onTime24) {
    const parsed = schedParseTime24(time24) || { h: 19, min: 30 };
    let h24 = parsed.h;
    let min = parsed.min;
    let ap = h24 < 12 ? "AM" : "PM";
    const wrap = ce("div", "sched-time-stepper");
    const sync = () => {
      const t = schedUse24Hour
        ? schedFormatTime24(h24, min)
        : schedTime12To24(h24 % 12 || 12, min, ap);
      if (t) onTime24(t);
    };
    const openSheet = (focusCol) => {
      schedOpenTimeWheelSheet(
        { h24, min, ap, use24h: schedUse24Hour, focusCol },
        ({ h24: h, min: m, ap: a }) => {
          h24 = h;
          min = m;
          if (!schedUse24Hour) ap = a;
          hourCol.refreshVal();
          minCol.refreshVal();
          if (!schedUse24Hour) {
            apSeg.querySelectorAll(".sched-seg").forEach((btn) => {
              btn.classList.toggle("is-active", btn.textContent === ap);
            });
          }
          sync();
        }
      );
    };
    const hourCol = schedAppendTimeColumn(
      wrap,
      "Hour",
      () => schedUse24Hour ? h24 : (h24 % 12 || 12),
      (v) => {
        if (schedUse24Hour) h24 = v;
        else {
          const mer = ap === "PM";
          h24 = v === 12 ? (mer ? 12 : 0) : (mer ? v + 12 : v);
        }
        sync();
      },
      schedUse24Hour ? 0 : 1,
      schedUse24Hour ? 23 : 12,
      (v) => schedUse24Hour ? String(v).padStart(2, "0") : String(v),
      () => openSheet("hour")
    );
    const sep = ce("span", "sched-time-sep");
    sep.textContent = ":";
    sep.setAttribute("aria-hidden", "true");
    wrap.appendChild(sep);
    const minCol = schedAppendTimeColumn(
      wrap,
      "Minute",
      () => min,
      (v) => { min = v; sync(); },
      0,
      59,
      (v) => String(v).padStart(2, "0"),
      () => openSheet("minute")
    );
    let apSeg = null;
    if (!schedUse24Hour) {
      const apCol = ce("div", "sched-time-col sched-time-ap-col");
      const apLbl = ce("span", "sched-time-col-label");
      apLbl.textContent = "AM / PM";
      apCol.appendChild(apLbl);
      apSeg = ce("div", "sched-segment sched-time-ap");
      for (const p of ["AM", "PM"]) {
        const b = ce("button", "sched-seg " + (ap === p ? "is-active" : ""));
        b.type = "button";
        b.textContent = p;
        b.addEventListener("click", () => {
          M.hapticTap();
          ap = p;
          const h12 = h24 % 12 || 12;
          h24 = p === "AM" ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12);
          apSeg.querySelectorAll(".sched-seg").forEach((btn) => {
            btn.classList.toggle("is-active", btn.textContent === ap);
          });
          hourCol.refreshVal();
          sync();
        });
        apSeg.appendChild(b);
      }
      apCol.appendChild(apSeg);
      wrap.appendChild(apCol);
    }
    parent.appendChild(wrap);
  }

  function fmtSchedTime(ms) {
    if (ms == null) return "\u2014";
    try {
      const d = new Date(Number(ms));
      if (isNaN(d.getTime())) return "\u2014";
      return d.toLocaleString([], schedUse24Hour
        ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }
        : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
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
    renderSchedulerActive();
  }

  function renderSchedulerActive() {
    if (!schedulerViewIsActive()) return;
    const popup = M.ensureQuickPopup();
    M.syncQuickPopupRef(popup);
    M.syncQuickPopupWidthForOpen(popup);
    const body = M.currentBody();
    M.setQuickBodyClass(body, "quick-body quick-body-scheduler");
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

  function schedNavRow(backLabel, backCb, fwdLabel, fwdCb, extraClass) {
    const nav = ce("div", "sched-nav" + (extraClass ? " " + extraClass : ""));
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
    }, "sched-nav-hero"));
    return wrap;
  }

  function validateStep1() {
    const tr = schedDraft.trigger;
    const when = tr.when || "clock";
    if (tr.kind === "daily" || tr.kind === "weekly") {
      if (when === "clock") {
        if (!/^\d{1,2}:\d{2}$/.test(tr.time || "")) { M.flash("Enter a valid time", true); return false; }
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
    schedAppendClockPicker(field, tr.time || "19:30", (t) => { tr.time = t; });
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
    const wrap = ce("div", "sched-once-fields");
    if (!tr.at || tr.at.length < 16) tr.at = defaultOnceAt();

    const dateField = ce("div", "sched-field");
    const dlbl = ce("label", "sched-field-label");
    dlbl.textContent = "Date";
    dateField.appendChild(dlbl);
    const dateIn = ce("input", "sched-input");
    dateIn.type = "date";
    dateIn.value = tr.at.substring(0, 10);
    dateIn.addEventListener("input", () => {
      const timePart = tr.at.length >= 16 ? tr.at.substring(11, 16) : "19:30";
      tr.at = dateIn.value + "T" + timePart;
    });
    dateField.appendChild(dateIn);
    wrap.appendChild(dateField);

    const timeField = ce("div", "sched-field");
    const tlbl = ce("label", "sched-field-label");
    tlbl.textContent = "Time";
    timeField.appendChild(tlbl);
    const timePart = tr.at.length >= 16 ? tr.at.substring(11, 16) : "19:30";
    schedAppendClockPicker(timeField, timePart, (t) => {
      const datePart = tr.at.length >= 10 ? tr.at.substring(0, 10) : defaultOnceAt().substring(0, 10);
      tr.at = datePart + "T" + t;
    });
    wrap.appendChild(timeField);
    return wrap;
  }

  // Step 2: device type
  function renderSchedStep2() {
    const wrap = ce("div", "sched-step");
    const q = ce("p", "sched-question");
    q.textContent = "What type of device would you like to control?";
    wrap.appendChild(q);
    const opts = [
      { k: "lights", label: "Lights" },
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
        if ((k === "lights" || k === "outlets") && !schedDraft.action.states) schedDraft.action.states = [];
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
  function schedMountDeviceActionsSection(wrap, oldActionsEl, selList, hintText) {
    if (!selList.childNodes.length) {
      if (oldActionsEl) oldActionsEl.remove();
      return;
    }
    const section = ce("div", "sched-device-actions");
    const head = ce("div", "sched-device-actions-head");
    const title = ce("h4", "sched-device-actions-title");
    title.textContent = "Set action for each device";
    const hint = ce("p", "sched-device-actions-hint");
    hint.textContent = hintText;
    head.appendChild(title);
    head.appendChild(hint);
    section.appendChild(head);
    section.appendChild(selList);
    if (oldActionsEl) oldActionsEl.replaceWith(section);
    else wrap.appendChild(section);
  }

  function renderSchedStep3() {
    const wrap = ce("div", "sched-step");
    const t = schedDraft.action.target;
    if (t === "lights") wrap.appendChild(renderSchedLightAction());
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
      const oldActions = wrap.querySelector(".sched-device-actions");
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
        const hdr = ce("div", "sched-actions-room-head");
        const nm = ce("div", "sched-room-name");
        nm.textContent = r.name || "Room";
        hdr.appendChild(nm);
        selList.appendChild(hdr);
        for (const d of selDevs) selList.appendChild(renderRow(d));
      }
      const unroomedSel = unroomed.filter((d) => selectedIds.has(String(d.i)));
      if (unroomedSel.length) {
        const hdr = ce("div", "sched-actions-room-head");
        const nm = ce("div", "sched-room-name");
        nm.textContent = "No room";
        hdr.appendChild(nm);
        selList.appendChild(hdr);
        for (const d of unroomedSel) selList.appendChild(renderRow(d));
      }
      schedMountDeviceActionsSection(wrap, oldActions, selList, "Choose on or off for every selected device below.");
    }

    refreshOnOffAction();
    return wrap;
  }

  function renderSchedLightAction() {
    const wrap = ce("div", "sched-action");
    const q = ce("p", "sched-question");
    q.textContent = "Select lights";
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
        const fieldHead = ce("div", "sched-field-head");
        const lbl = ce("label", "sched-field-label");
        lbl.textContent = "Brightness";
        const val = ce("span", "sched-slider-val");
        val.textContent = (st.level ?? 100) + "%";
        fieldHead.appendChild(lbl);
        fieldHead.appendChild(val);
        field.appendChild(fieldHead);
        const { el: levelTrack } = M.makeLevelTrackSlider({
          value: st.level ?? 100,
          min: 1,
          max: 100,
          onChange: (l) => { st.level = l; val.textContent = l + "%"; },
        });
        field.appendChild(levelTrack);
        row.appendChild(field);
      }
      if (d.ct && st.on) {
        const field = ce("div", "sched-field");
        const fieldHead = ce("div", "sched-field-head");
        const lbl = ce("label", "sched-field-label");
        lbl.textContent = "White balance (K)";
        const val = ce("span", "sched-slider-val");
        val.textContent = (st.ct ?? 3000) + "K";
        fieldHead.appendChild(lbl);
        fieldHead.appendChild(val);
        field.appendChild(fieldHead);
        const { el: ctTrack } = M.makeCtTrackSlider({
          value: st.ct ?? 3000,
          onChange: (k) => { st.ct = k; val.textContent = k + "K"; },
        });
        field.appendChild(ctTrack);
        row.appendChild(field);
      }
      return row;
    }

    function refreshLightAction() {
      const oldPicker = wrap.querySelector(".sched-light-picker");
      const oldActions = wrap.querySelector(".sched-device-actions");
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
        const hdr = ce("div", "sched-actions-room-head");
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
        const hdr = ce("div", "sched-actions-room-head");
        const nm = ce("div", "sched-room-name");
        nm.textContent = "No room";
        hdr.appendChild(nm);
        selList.appendChild(hdr);
        for (const d of unroomedSel) selList.appendChild(renderSchedLightRow(d));
      }
      schedMountDeviceActionsSection(wrap, oldActions, selList, "Choose on/off and brightness for every selected device below.");
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
      const sysMode = schedDraft.action.mode || "auto";
      for (const m of modes) {
        const b = ce("button", "sched-seg " + (sysMode === m ? "is-active" : ""));
        b.type = "button"; b.textContent = m;
        b.addEventListener("click", () => {
          schedDraft.action.mode = m;
          if (m === "heat") schedDraft.action.cool = null;
          else if (m === "cool") schedDraft.action.heat = null;
          renderSchedulerActive();
        });
        seg.appendChild(b);
      }
      modeField.appendChild(seg);
      wrap.appendChild(modeField);

      if (sysMode !== "cool") {
        const heatField = ce("div", "sched-field");
        const hlbl = ce("label", "sched-field-label");
        hlbl.textContent = "Heat setpoint (\u00b0F)";
        heatField.appendChild(hlbl);
        const hin = ce("input", "sched-input");
        hin.type = "number"; hin.min = "40"; hin.max = "90"; hin.value = String(schedDraft.action.heat ?? 68);
        hin.addEventListener("input", () => { schedDraft.action.heat = Number(hin.value); });
        heatField.appendChild(hin);
        wrap.appendChild(heatField);
      }

      if (sysMode !== "heat") {
        const coolField = ce("div", "sched-field");
        const clbl = ce("label", "sched-field-label");
        clbl.textContent = "Cool setpoint (\u00b0F)";
        coolField.appendChild(clbl);
        const cin = ce("input", "sched-input");
        cin.type = "number"; cin.min = "50"; cin.max = "100"; cin.value = String(schedDraft.action.cool ?? 72);
        cin.addEventListener("input", () => { schedDraft.action.cool = Number(cin.value); });
        coolField.appendChild(cin);
        wrap.appendChild(coolField);
      }

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
      if (trWhen === "clock") when = "Daily " + schedFmtClockTime(tr.time || "");
      else {
        const sun = trWhen === "sunset" ? "Sunset" : "Sunrise";
        const off = Number(tr.offsetMin) || 0;
        when = off === 0 ? ("Daily " + sun) : ("Daily " + sun + " " + schedOffsetLabel(off));
      }
    } else if (tr?.kind === "weekly") {
      const days = (tr.days || []).join(",");
      if (trWhen === "clock") when = "Weekly " + days + " " + schedFmtClockTime(tr.time || "");
      else {
        const sun = trWhen === "sunset" ? "Sunset" : "Sunrise";
        const off = Number(tr.offsetMin) || 0;
        when = off === 0 ? ("Weekly " + days + " " + sun) : ("Weekly " + days + " " + sun + " " + schedOffsetLabel(off));
      }
    } else if (tr?.kind === "once") when = "Once " + schedFmtDateTimeLocal(tr.at || "");
    else if (tr?.kind === "mode") when = "When mode is " + (tr.mode || "");
    let what = "";
    if (ac?.target === "lights") what = " lights";
    else if (ac?.target === "outlets") what = " outlets";
    else if (ac?.target === "thermostats") what = " thermostats";
    else if (ac?.target === "hubMode") what = " \u2192 " + (ac.mode || "mode");
    return when + what;
  }

  async function saveSchedule() {
    if (!validateStep1()) { schedStep = 1; renderSchedulerActive(); return; }
    const ac = schedDraft.action;
    if (ac.target === "lights" && (!ac.states || !ac.states.length)) { M.flash("Select at least one light", true); return; }
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

  Object.assign(M, { applySchedulesFromData, schedulerViewIsActive, schedulerHasContent, schedParseTime24, schedFormatTime24, schedTime24To12, schedTime12To24, schedFmtClockTime, schedFmtDateTimeLocal, schedCreateScrollWheel, schedOpenTimeWheelSheet, schedBindStepHold, schedAppendTimeStep, schedAppendTimeColumn, schedAppendClockPicker, fmtSchedTime, newSchedDraft, schedApi, renderSchedulerView, renderSchedulerActive, renderSchedList, renderSchedRow, renderSchedWorkflow, schedNavRow, schedBindPickRow, schedBindPickRoom, renderSchedStep1, validateStep1, renderSchedModeTriggerPicker, renderSchedModeCondition, schedOffsetLabel, renderSchedWhenPicker, renderSchedOffsetPicker, renderSchedSunPreview, renderSchedTimePicker, renderSchedDayPicker, defaultOnceAt, renderSchedOncePicker, renderSchedStep2, schedMountDeviceActionsSection, renderSchedStep3, renderSchedOnOffDeviceAction, renderSchedLightAction, renderSchedThermostatAction, renderSchedHubModeAction, autoSchedName, saveSchedule });
})();
