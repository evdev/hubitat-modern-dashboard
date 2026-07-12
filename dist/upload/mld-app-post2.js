(() => {
  "use strict";
  const M = globalThis.__MLD;
  if (!M) {
    console.error("Modern Dashboard: upload mld-app-post.js before mld-app-post2.js");
    return;
  }
  async function sendValveCmd(id, cmd) {
    const valve = M.valves.find((v) => v.i === id);
    if (!valve) return { ok: false };
    M.hapticTap();
    const patch = cmd === "open" ? { st: "opening" } : cmd === "close" ? { st: "closing" } : null;
    if (patch) {
      M.setValveOptimistic(id, patch);
      if (currentCategory() === "sensors") refreshSensorsPopup();
      else if (currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    }
    const result = await M.sendCmd(id, cmd);
    if (!result.ok) {
      M.clearValveOptimistic(id);
      reconcileValve(id);
      if (currentCategory() === "sensors") refreshSensorsPopup();
      else if (currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    } else {
      reconcileValve(id);
    }
    return result;
  }

  function reconcileValve(id) {
    setTimeout(() => M.refreshDevice(id), 700);
    setTimeout(() => M.refreshDevice(id), 2200);
  }

  // ---------- M.sensors popup ----------
  const SENSOR_TYPE_ORDER = Object.keys(SENSOR_TYPE_META);

  function sensorTypeOrder(t) {
    const idx = SENSOR_TYPE_ORDER.indexOf(t);
    return idx >= 0 ? idx : SENSOR_TYPE_ORDER.length;
  }

  function sortSensorsInRoom(devs) {
    return devs.slice().sort((a, b) => {
      const ta = sensorTypeOrder(a.t) - sensorTypeOrder(b.t);
      if (ta !== 0) return ta;
      return String(a.n || "").localeCompare(String(b.n || ""));
    });
  }

  function groupSensorsByRoom(merged) {
    const groups = new Map();
    for (const dev of merged) {
      const rid = normalizeRoomId(dev.r);
      if (!groups.has(rid)) groups.set(rid, []);
      groups.get(rid).push(dev);
    }
    return groups;
  }

  function groupRoomSensorsByType(devs) {
    const types = [];
    let lastType = null;
    for (const dev of devs) {
      if (dev.t !== lastType) {
        types.push({ type: dev.t, devs: [] });
        lastType = dev.t;
      }
      types[types.length - 1].devs.push(dev);
    }
    return types;
  }

  function mergedSensorList() {
    const byId = new Map();
    for (const s of M.tempSensors) {
      byId.set(String(s.i), { i: s.i, n: s.n, r: s.r, t: "temp", v: s.temp, u: s.u, a: 0, ex: [], bat: s.bat ?? null, _ref: s });
    }
    // A multi-sensor may also be in M.tempSensors. Prefer its explicitly selected
    // sensor type so motion/contact/etc. is not reduced to a temperature card.
    for (const s of M.sensors) {
      byId.set(String(s.i), { i: s.i, n: s.n, r: s.r, t: s.t, v: s.v, a: s.a, ex: s.ex || [], _ref: s });
    }
    // Valve controls take priority if a valve also exposes a sensor capability.
    for (const v of M.valves) byId.set(String(v.i), M.normalizeValveForCard(v));
    const out = [...byId.values()];
    out.sort((a, b) => {
      const ta = sensorTypeOrder(a.t) - sensorTypeOrder(b.t);
      if (ta !== 0) return ta;
      return String(a.n || "").localeCompare(String(b.n || ""));
    });
    return out;
  }

  function sensorsPopupSignature() {
    return mergedSensorList().map((d) => `${d.i}:${d.r}:${d.t}:${d.v}:${d.a}:${sensorBatteryPct(d)}:${(d.ex || []).map((e) => e.k + e.v).join(".")}`).join("|");
  }

  function sensorTypesWithCounts() {
    const counts = new Map();
    for (const d of mergedSensorList()) counts.set(d.t, (counts.get(d.t) || 0) + 1);
    return [...counts.entries()].sort((a, b) => sensorTypeLabel(a[0]).localeCompare(sensorTypeLabel(b[0])));
  }

  function sensorMatchesFilter(dev) {
    return !M.sensorTypeFilter.size || M.sensorTypeFilter.has(dev.t);
  }

  function syncSensorFilterBtn() {
    if (!M.sensorFilterBtnEl) return;
    const n = M.sensorTypeFilter.size;
    M.sensorFilterBtnEl.classList.toggle("is-active", n > 0 || M.sensorFilterOpen);
    let badge = M.sensorFilterBtnEl.querySelector(".sensor-filter-btn-badge");
    if (n > 0) {
      if (!badge) {
        badge = ce("span", "sensor-filter-btn-badge");
        M.sensorFilterBtnEl.appendChild(badge);
      }
      badge.textContent = String(n);
      badge.hidden = false;
    } else if (badge) badge.hidden = true;
  }

  function syncSensorFilterChips() {
    if (!M.sensorFilterChipsEl) return;
    for (const btn of M.sensorFilterChipsEl.querySelectorAll(".sensor-filter-chip")) {
      const t = btn.dataset.type;
      const on = t === "all" ? !M.sensorTypeFilter.size : M.sensorTypeFilter.has(t);
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function applySensorTypeFilter() {
    let visible = 0;
    for (const dev of mergedSensorList()) {
      const rec = M.sensorCardMap.get(dev.i);
      if (!rec) continue;
      const show = sensorMatchesFilter(dev);
      rec.el.hidden = !show;
      if (show && !rec.el.classList.contains("search-hidden")) visible++;
    }
    for (const [, rec] of M.sensorRoomEls) {
      const visibleCards = rec.body.querySelectorAll(".sensor-card:not([hidden]):not(.search-hidden)");
      rec.card.classList.toggle("hidden", visibleCards.length === 0);
    }
    if (M.sensorFilterEmptyEl) M.sensorFilterEmptyEl.hidden = visible > 0;
    syncSensorFilterBtn();
    syncSensorFilterChips();
  }

  function buildSensorFilterBar() {
    const toolbar = ce("div", "sensor-toolbar");
    const filterBtn = ce("button", "sensor-filter-btn");
    filterBtn.type = "button";
    filterBtn.innerHTML = FILTER_SVG + '<span class="sensor-filter-btn-label">Filter</span>';
    filterBtn.setAttribute("aria-expanded", M.sensorFilterOpen ? "true" : "false");
    filterBtn.setAttribute("aria-label", "Filter sensors by type");
    toolbar.appendChild(filterBtn);
    M.sensorFilterBtnEl = filterBtn;

    const chips = ce("div", "sensor-filter-chips");
    chips.hidden = !M.sensorFilterOpen;
    chips.classList.toggle("is-open", M.sensorFilterOpen);
    const allBtn = ce("button", "sensor-filter-chip");
    allBtn.type = "button";
    allBtn.dataset.type = "all";
    allBtn.textContent = "All";
    allBtn.setAttribute("aria-pressed", !M.sensorTypeFilter.size ? "true" : "false");
    if (!M.sensorTypeFilter.size) allBtn.classList.add("active");
    allBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      M.sensorTypeFilter.clear();
      applySensorTypeFilter();
    });
    chips.appendChild(allBtn);
    for (const [t, n] of sensorTypesWithCounts()) {
      const btn = ce("button", "sensor-filter-chip sensor-filter-chip--" + t);
      btn.type = "button";
      btn.dataset.type = t;
      btn.textContent = sensorTypeLabel(t) + " " + n;
      btn.setAttribute("aria-pressed", M.sensorTypeFilter.has(t) ? "true" : "false");
      if (M.sensorTypeFilter.has(t)) btn.classList.add("active");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (M.sensorTypeFilter.has(t)) M.sensorTypeFilter.delete(t);
        else M.sensorTypeFilter.add(t);
        applySensorTypeFilter();
      });
      chips.appendChild(btn);
    }
    M.sensorFilterChipsEl = chips;
    filterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      M.sensorFilterOpen = !M.sensorFilterOpen;
      chips.hidden = !M.sensorFilterOpen;
      chips.classList.toggle("is-open", M.sensorFilterOpen);
      filterBtn.setAttribute("aria-expanded", M.sensorFilterOpen ? "true" : "false");
      syncSensorFilterBtn();
    });
    syncSensorFilterBtn();
    return { toolbar, chips };
  }

  function sensorBatteryPct(dev) {
    const ex = dev.ex || [];
    const entry = ex.find((e) => e.k === "battery");
    if (entry?.v != null && entry.v !== "") {
      const n = Number(entry.v);
      if (!isNaN(n)) return Math.round(n);
    }
    const bat = dev.bat ?? dev._ref?.bat;
    if (bat != null && bat !== "") {
      const n = Number(bat);
      if (!isNaN(n)) return Math.round(n);
    }
    return null;
  }

  function sensorBatteryLabel(dev) {
    const pct = sensorBatteryPct(dev);
    return pct != null ? pct + "% battery" : "";
  }

  function sensorExFooter(dev) {
    const ex = (dev.ex || []).filter((e) => e.k !== "battery");
    if (!ex.length) return "";
    const parts = [];
    for (const e of ex.slice(0, 2)) {
      let txt = humanizeAttr(e.k);
      const v = e.v;
      if (v != null && v !== "") {
        if (e.k === "temperature") txt += " " + Math.round(Number(v)) + tstatTempSuffix(e.u);
        else if (e.k === "humidity") txt += " " + Math.round(Number(v)) + "%";
        else if (e.k === "illuminance") txt += " " + Math.round(Number(v)) + " lx";
        else txt += " " + v + (e.u ? " " + e.u : "");
      }
      parts.push(txt);
    }
    return parts.join(" · ");
  }

  function applySensorCardState(card, dev, rec) {
    const meta = SENSOR_TYPE_META[dev.t] || SENSOR_TYPE_META.generic;
    card.style.setProperty("--sensor-accent", meta.accent);
    let hero, pill, alert;
    if (dev.t === "temp") {
      hero = M.formatRoomTemp(dev._ref || dev);
      pill = "Temp";
      alert = false;
    } else if (dev.t === "valve") {
      const d = sensorDisplay({ ...dev, v: M.effectiveValveState(dev._ref || dev) });
      hero = d.hero; pill = d.pill; alert = d.alert;
    } else {
      const d = sensorDisplay(dev);
      hero = d.hero; pill = d.pill; alert = d.alert;
    }
    card.className = "sensor-card sensor-card--" + (dev.t || "generic") + (alert ? " is-alert" : "");
    rec.heroEl.textContent = hero;
    if (pill) {
      rec.pillEl.hidden = false;
      rec.pillTxt.textContent = pill;
      rec.dot.classList.toggle("is-active", !!alert);
    } else {
      rec.pillEl.hidden = true;
    }
    rec.footEl.textContent = sensorExFooter(dev);
    rec.footEl.hidden = !rec.footEl.textContent;
    const batTxt = sensorBatteryLabel(dev);
    rec.batteryEl.textContent = batTxt;
    rec.batteryEl.hidden = !batTxt;
    card.setAttribute("aria-label", (dev.n || "Sensor") + ", " + M.roomLabel(dev.r) + ", " + sensorTypeLabel(dev.t) + (pill ? ", " + pill : "") + (batTxt ? ", " + batTxt : ""));
    if (dev.t === "valve" && rec.openBtn && rec.closeBtn) {
      const valve = dev._ref || dev;
      const moving = M.valveIsMoving(valve);
      const st = M.effectiveValveState(valve);
      rec.openBtn.classList.toggle("active", st === "open");
      rec.closeBtn.classList.toggle("active", st === "closed");
      rec.openBtn.classList.toggle("moving", moving);
      rec.closeBtn.classList.toggle("moving", moving);
      rec.openBtn.disabled = moving;
      rec.closeBtn.disabled = moving;
    }
  }

  function makeSensorCard(dev, context) {
    const meta = SENSOR_TYPE_META[dev.t] || SENSOR_TYPE_META.generic;
    const card = ce("div", "sensor-card sensor-card--" + (dev.t || "generic"));
    card.style.setProperty("--sensor-accent", meta.accent);
    card.dataset.name = String(dev.n || "").toLowerCase();
    const top = ce("div", "sensor-card-top");
    const icon = ce("span", "sensor-card-icon");
    icon.innerHTML = meta.svg;
    const pill = ce("span", "sensor-card-pill");
    const dot = ce("span", "sensor-card-dot");
    const pillTxt = ce("span", "sensor-card-pill-txt");
    pill.appendChild(dot);
    pill.appendChild(pillTxt);
    top.appendChild(icon);
    top.appendChild(pill);
    const hero = ce("div", "sensor-card-value");
    const name = ce("div", "sensor-card-name");
    name.textContent = dev.n || ("Sensor " + dev.i);
    const metaRow = ce("div", "sensor-card-meta");
    metaRow.textContent = context === "sensors"
      ? sensorTypeLabel(dev.t)
      : M.roomLabel(dev.r) + " · " + sensorTypeLabel(dev.t);
    const foot = ce("div", "sensor-card-foot");
    const actions = ce("div", "sensor-card-actions");
    const battery = ce("div", "sensor-card-battery");
    const fav = ce("button", "sensor-card-fav tile-fav");
    fav.type = "button";
    M.attachFavButton(fav, dev.i);
    actions.appendChild(battery);
    actions.appendChild(fav);
    card.appendChild(top);
    card.appendChild(hero);
    card.appendChild(name);
    card.appendChild(metaRow);
    card.appendChild(foot);
    const rec = { el: card, heroEl: hero, pillEl: pill, pillTxt, dot, footEl: foot, batteryEl: battery, favBtn: fav, t: dev.t, i: dev.i };
    if (dev.t === "valve") {
      const controls = ce("div", "sensor-card-controls");
      const openBtn = ce("button", "quick-lock-btn sensor-valve-btn");
      openBtn.type = "button";
      openBtn.innerHTML = SHADE_OPEN_SVG + '<span class="quick-lock-btn-label">Open</span>';
      const closeBtn = ce("button", "quick-lock-btn sensor-valve-btn");
      closeBtn.type = "button";
      closeBtn.innerHTML = SHADE_CLOSE_SVG + '<span class="quick-lock-btn-label">Close</span>';
      const valveRef = dev._ref || dev;
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!M.valveIsMoving(valveRef) && M.effectiveValveState(valveRef) !== "open") sendValveCmd(valveRef.i, "open");
      });
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!M.valveIsMoving(valveRef) && M.effectiveValveState(valveRef) !== "closed") sendValveCmd(valveRef.i, "close");
      });
      controls.appendChild(openBtn);
      controls.appendChild(closeBtn);
      card.appendChild(controls);
      rec.openBtn = openBtn;
      rec.closeBtn = closeBtn;
    }
    card.appendChild(actions);
    applySensorCardState(card, dev, rec);
    if (context === "favorites") M.favSensorMap.set(dev.i, rec);
    else M.sensorCardMap.set(dev.i, rec);
    return card;
  }

  function makeFavoriteSensorCard(dev) {
    return makeSensorCard(dev, "favorites");
  }

  function updateSensorCard(dev) {
    // Update both maps: after visiting Sensors then Favorites, M.sensorCardMap can
    // still hold detached cards that would otherwise steal updates from fav cards.
    const sen = M.sensorCardMap.get(dev.i);
    if (sen) applySensorCardState(sen.el, dev, sen);
    const fav = M.favSensorMap.get(dev.i);
    if (fav && fav !== sen) applySensorCardState(fav.el, dev, fav);
  }

  function buildSensorRoomSection(roomKey, devs) {
    const name = roomKey === -1 ? "Unassigned" : (M.roomMap.get(roomKey) || "Room");
    const card = ce("section", "room sensor-room");
    card.dataset.roomId = roomKey;
    card.dataset.roomName = String(name).toLowerCase();

    const head = ce("div", "room-head");
    const title = ce("div", "room-title");
    const nameEl = ce("div", "room-name");
    nameEl.textContent = name;
    const meta = ce("div", "room-meta");
    meta.textContent = devs.length + (devs.length === 1 ? " sensor" : " sensors");
    title.appendChild(nameEl);
    title.appendChild(meta);
    head.appendChild(title);

    const col = ce("button", "room-collapse");
    col.type = "button";
    col.setAttribute("aria-label", "Collapse room");
    col.innerHTML = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
    col.addEventListener("click", (e) => {
      e.stopPropagation();
      card.classList.toggle("collapsed");
      persistSensorsCollapsed();
      updateExpandAllBtn();
    });
    head.appendChild(col);
    head.addEventListener("click", () => {
      card.classList.toggle("collapsed");
      persistSensorsCollapsed();
      updateExpandAllBtn();
    });

    const body = ce("div", "room-body sensor-room-body");
    card.appendChild(head);
    card.appendChild(body);

    const sorted = sortSensorsInRoom(devs);
    const typeGroups = groupRoomSensorsByType(sorted);
    for (const tg of typeGroups) {
      if (typeGroups.length > 1) {
        const label = ce("div", "sensor-type-label");
        label.textContent = sensorTypeLabel(tg.type);
        body.appendChild(label);
      }
      const grid = ce("div", "sensor-grid");
      for (const dev of tg.devs) grid.appendChild(makeSensorCard(dev, "sensors"));
      body.appendChild(grid);
    }

    M.sensorRoomEls.set(roomKey, { card, body, meta });
    return card;
  }

  function renderSensorsPopup() {
    const popup = M.ensureQuickPopup();
    M.syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    body.className = "quick-body quick-body-sensors" + (inTabView() ? " tab-body" : "");
    body.innerHTML = "";
    M.sensorCardMap.clear();
    M.sensorRoomEls.clear();
    sensorCollapsedBeforeSearch = null;
    M.favSensorMap.clear();
    M.sensorFilterChipsEl = null;
    M.sensorFilterBtnEl = null;
    M.sensorFilterEmptyEl = null;
    const merged = mergedSensorList();
    M.sensorsPopupSig = sensorsPopupSignature();
    if (!merged.length) {
      body.textContent = "No sensors selected — add temperature, other sensors, or valves in Hubitat app settings";
      return;
    }
    const wrap = ce("div", "sensor-popup-wrap");
    const { toolbar, chips } = buildSensorFilterBar();
    const roomsEl = ce("div", "sensor-rooms");
    const sensorGroups = groupSensorsByRoom(merged);
    const hasSensors = (rid) => (sensorGroups.get(normalizeRoomId(rid))?.length || 0) > 0;
    const orderedIds = M.getDisplayRoomIds(sensorGroups, hasSensors);
    for (const rid of orderedIds) {
      const roomKey = normalizeRoomId(rid);
      const devs = sensorGroups.get(roomKey) || [];
      if (!devs.length) continue;
      roomsEl.appendChild(buildSensorRoomSection(roomKey, devs));
    }
    const empty = ce("div", "sensor-filter-empty");
    empty.textContent = "No sensors match this filter";
    empty.hidden = true;
    M.sensorFilterEmptyEl = empty;
    wrap.appendChild(toolbar);
    wrap.appendChild(chips);
    wrap.appendChild(roomsEl);
    wrap.appendChild(empty);
    body.appendChild(wrap);
    restoreSensorsCollapsed();
    applySensorTypeFilter();
    updateExpandAllBtn();
  }

  function refreshSensorsPopup() {
    if (currentCategory() !== "sensors") return;
    const sig = sensorsPopupSignature();
    const body = currentBody();
    if (!body.querySelector(".sensor-rooms") || sig !== M.sensorsPopupSig) {
      renderSensorsPopup();
      return;
    }
    for (const dev of mergedSensorList()) updateSensorCard(dev);
    applySensorTypeFilter();
  }



  function renderScenesPopup() {
    const popup = M.ensureQuickPopup();
    M.syncQuickPopupWidthForOpen(popup);
    const body = popup._body;
    body.className = "quick-body quick-body-scenes";
    body.innerHTML = "";
    if (!M.scenes.length) {
      body.textContent = "No scenes on this hub";
      return;
    }
    const list = ce("div", "quick-list");
    for (const sc of M.scenes) {
      const b = ce("button", "quick-list-btn");
      b.type = "button";
      b.textContent = sc.n || ("Scene " + sc.id);
      b.addEventListener("click", async () => {
        b.disabled = true;
        M.hapticTap();
        const ok = await M.activateSceneApi(sc.id);
        b.disabled = false;
        if (ok) M.flash("Scene activated");
      });
      list.appendChild(b);
    }
    body.appendChild(list);
  }

  function favoritesPopupSignature() {
    return M.getFavoriteEntries().map((e) => e.type + ":" + e.dev.i).join(",");
  }

  function makeQuickTstatCard(t, map) {
    const tm = String(t.tm || "").toLowerCase();
    const card = ce("div", "quick-fav-card quick-fav-tstat mode-" + (tm || "off"));
    card.dataset.name = String(t.n || "").toLowerCase();

    const nameBtn = ce("button", "quick-fav-tstat-name");
    nameBtn.type = "button";
    nameBtn.textContent = t.n || ("Thermostat " + t.i);
    nameBtn.setAttribute("aria-label", "Open full controls for " + (t.n || "thermostat"));
    nameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      M.hapticTap();
      closeCurrentView();
      const rid = normalizeRoomId(t.r);
      const climateRec = M.climateEls.get(rid);
      M.openTstatPopup(rid, climateRec?.el || null);
    });

    const temps = M.favoriteTstatTemps(t);
    const stateInfo = M.favoriteTstatState(t);

    const info = ce("div", "quick-fav-tstat-info");
    info.appendChild(nameBtn);
    const stateEl = ce("div", "quick-fav-tstat-state" + (stateInfo.active ? " is-active" : ""));
    const dot = ce("span", "quick-fav-tstat-dot");
    const stateTxt = ce("span", "quick-fav-tstat-state-txt");
    stateTxt.textContent = stateInfo.label;
    stateEl.appendChild(dot);
    stateEl.appendChild(stateTxt);
    info.appendChild(stateEl);

    const spEl = ce("div", "quick-fav-tstat-sp " + temps.tone);
    spEl.textContent = temps.setpoint;

    const controls = ce("div", "quick-fav-tstat-controls");
    const minus = ce("button", "quick-fav-ctl quick-fav-step");
    minus.type = "button";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Decrease setpoint");
    const modeBtn = ce("button", "quick-fav-ctl quick-fav-ctl-mode");
    modeBtn.type = "button";
    const modeLabel = ce("span", "quick-fav-ctl-mode-label");
    modeLabel.textContent = M.tstatModeDisplayLabel(t.tm);
    const modeCaret = ce("span", "quick-fav-ctl-mode-caret");
    modeCaret.setAttribute("aria-hidden", "true");
    modeCaret.textContent = "▾";
    modeBtn.appendChild(modeLabel);
    modeBtn.appendChild(modeCaret);
    modeBtn.setAttribute("aria-label", "Change thermostat mode");
    modeBtn.setAttribute("aria-haspopup", "listbox");
    modeBtn.setAttribute("aria-expanded", "false");
    const plus = ce("button", "quick-fav-ctl quick-fav-step");
    plus.type = "button";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Increase setpoint");
    const canAdjust = !!M.favoriteTstatTarget(t);
    if (!canAdjust) {
      minus.disabled = true;
      plus.disabled = true;
    } else {
      minus.addEventListener("click", (e) => {
        e.stopPropagation();
        M.adjustFavoriteTstat(t.i, -1);
      });
      plus.addEventListener("click", (e) => {
        e.stopPropagation();
        M.adjustFavoriteTstat(t.i, 1);
      });
    }
    modeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      M.hapticTap();
      M.openFavoriteTstatModeMenu(modeBtn, t.i);
    });
    controls.appendChild(minus);
    controls.appendChild(modeBtn);
    controls.appendChild(plus);
    card.appendChild(info);
    card.appendChild(spEl);
    card.appendChild(controls);

    map.set(t.i, { el: card, card, spEl, stateEl, stateTxt, modeLabel, modeBtn, minus, plus });
    return card;
  }

  function updateQuickTstatCard(t, map) {
    const rec = map.get(t.i);
    if (!rec) return;
    const tm = String(t.tm || "").toLowerCase();
    rec.card.className = "quick-fav-card quick-fav-tstat mode-" + (tm || "off");
    const temps = M.favoriteTstatTemps(t);
    const stateInfo = M.favoriteTstatState(t);
    rec.spEl.className = "quick-fav-tstat-sp " + temps.tone;
    rec.spEl.textContent = temps.setpoint;
    rec.stateEl.className = "quick-fav-tstat-state" + (stateInfo.active ? " is-active" : "");
    rec.stateTxt.textContent = stateInfo.label;
    rec.modeLabel.textContent = M.tstatModeDisplayLabel(t.tm);
    const canAdjust = !!M.favoriteTstatTarget(t);
    rec.minus.disabled = !canAdjust;
    rec.plus.disabled = !canAdjust;
    if (M.favTstatModeMenu && M.favTstatModeMenuId === t.i) M.syncFavoriteTstatModeMenu(t);
  }

  function refreshFavoritesPopup() {
    if (currentCategory() !== "favorites") return;
    const sig = favoritesPopupSignature();
    const body = currentBody();
    if (!body.querySelector(".quick-fav-grid") || sig !== M.favPopupSig) {
      renderFavoritesPopup();
      return;
    }
    for (const entry of M.getFavoriteEntries()) {
      if (entry.type === "thermostat") {
        const t = M.thermostats.find((x) => x.i === entry.dev.i) || entry.dev;
        updateQuickTstatCard(t, M.favTstatMap);
      } else if (entry.type === "sensor") {
        const dev = mergedSensorList().find((x) => x.i === entry.dev.i) || entry.dev;
        updateSensorCard(dev);
      } else if (entry.type === "music") {
        const mp = M.music.find((x) => x.i === entry.dev.i) || entry.dev;
        M.updateFavoriteMusicRow(mp);
      } else if (entry.type === "lock") {
        const lk = M.locks.find((x) => x.i === entry.dev.i) || entry.dev;
        M.updateFavoriteLockRow(lk);
      } else if (entry.type === "garage") {
        const door = M.garageDoors.find((x) => x.i === entry.dev.i) || entry.dev;
        M.updateFavoriteGarageRow(door);
      } else if (entry.type === "shade") {
        const sh = M.windowShades.find((x) => x.i === entry.dev.i) || entry.dev;
        M.updateFavoriteShadeTile(sh);
      }
    }
    M.updateStates();
    if (M.favTstatModeMenu) M.repositionFavoriteTstatModeMenu();
  }

  function renderFavoritesPopup() {
    M.closeFavoriteTstatModeMenu();
    const popup = M.ensureQuickPopup();
    M.syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    body.className = "quick-body quick-body-favorites" + (inTabView() ? " tab-body" : "");
    body.innerHTML = "";
    M.favDevMap.clear();
    M.favTstatMap.clear();
    M.favSensorMap.clear();
    M.sensorCardMap.clear();
    M.favMusicMap.clear();
    M.favLockMap.clear();
    M.favGarageMap.clear();
    M.favShadeMap.clear();
    const entries = M.getFavoriteEntries();
    M.favPopupSig = favoritesPopupSignature();
    if (!entries.length) {
      body.textContent = "Tap the star on any device to add it here";
      return;
    }
    const grid = ce("div", "quick-fav-grid");
    for (const entry of entries) {
      if (entry.type === "light") {
        grid.appendChild(M.makeTile(entry.dev, "favorites"));
      } else if (entry.type === "outlet") {
        grid.appendChild(M.makeOutletTile(entry.dev, "favorites"));
      } else if (entry.type === "thermostat") {
        grid.appendChild(makeQuickTstatCard(entry.dev, M.favTstatMap));
      } else if (entry.type === "sensor") {
        grid.appendChild(makeFavoriteSensorCard(entry.dev));
      } else if (entry.type === "music") {
        grid.appendChild(M.makeMusicRow(entry.dev, "favorites"));
      } else if (entry.type === "lock") {
        grid.appendChild(M.makeLockRow(entry.dev, "favorites"));
      } else if (entry.type === "garage") {
        grid.appendChild(M.makeGarageRow(entry.dev, "favorites"));
      } else if (entry.type === "shade") {
        grid.appendChild(M.makeShadeTile(entry.dev, "favorites"));
      }
    }
    body.appendChild(grid);
    M.updateStates();
  }

  function thermostatsListSignature() {
    return M.thermostats.map((t) => t.i).join(",");
  }

  function refreshThermostatsPopup() {
    if (currentCategory() !== "thermostats") return;
    const listSig = thermostatsListSignature();
    const body = currentBody();
    if (!body.querySelector(".quick-fav-grid") || listSig !== M.tstatsPopupSig) {
      renderThermostatsPopup();
      return;
    }
    for (const t of M.thermostats) updateQuickTstatCard(t, M.tstatsPopupMap);
    if (M.favTstatModeMenu) M.repositionFavoriteTstatModeMenu();
  }

  function renderThermostatsPopup() {
    M.closeFavoriteTstatModeMenu();
    const popup = M.ensureQuickPopup();
    M.syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    body.className = "quick-body quick-body-thermostats" + (inTabView() ? " tab-body" : "");
    body.innerHTML = "";
    M.tstatsPopupMap.clear();
    M.tstatsPopupSig = thermostatsListSignature();
    if (!M.thermostats.length) {
      body.textContent = "No thermostats selected — add thermostats in the Hubitat app settings";
      return;
    }
    const sorted = M.thermostats.slice().sort((a, b) => {
      const ra = M.roomLabel(a.r).localeCompare(M.roomLabel(b.r));
      if (ra !== 0) return ra;
      return String(a.n || "").localeCompare(String(b.n || ""));
    });
    const grid = ce("div", "quick-fav-grid");
    for (const t of sorted) grid.appendChild(makeQuickTstatCard(t, M.tstatsPopupMap));
    body.appendChild(grid);
  }

  function quickNavPopupHasContent(popup) {
    switch (popup) {
      case "locks": return M.locks.length > 0 || M.garageDoors.length > 0;
      case "scenes": return M.scenes.length > 0;
      case "hub-mode": return M.hubModes.length > 0;
      case "security": return M.hsmEnabled;
      case "blinds": return M.windowShades.length > 0;
      case "outlets": return M.outletsSeparateTab && M.outlets.length > 0;
      case "scheduling": return true;
      case "sensors": return mergedSensorList().length > 0;
      case "thermostats": return M.thermostatsPopupEnabled && M.thermostats.length > 0;
      case "music": return M.music.length > 0;
      case "favorites": return M.getFavoriteEntries().length > 0;
      default: return false;
    }
  }

  function updateQuickNavVisibility() {
    if (M.reorderMode) return;
    let anyVisible = false;
    for (const { id, popup } of QUICK_NAV) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      const show = quickNavPopupHasContent(popup);
      btn.hidden = !show;
      const rec = M.navEls.get(popup);
      if (rec?.wrap) rec.wrap.hidden = !show;
      if (show) anyVisible = true;
    }
    // Lights tab is shown whenever tab mode is on (independent of content)
    if (M.tabMode && M.QUICK_LIGHTS_BTN) {
      M.QUICK_LIGHTS_BTN.hidden = false;
      const lightsRec = M.navEls.get("lights");
      if (lightsRec?.wrap) lightsRec.wrap.hidden = false;
      anyVisible = true;
    } else {
      const lightsRec = M.navEls.get("lights");
      if (lightsRec?.wrap) lightsRec.wrap.hidden = true;
    }
    const nav = document.querySelector(".quick-nav");
    if (nav) nav.hidden = !anyVisible;
    if (M.quickPopupOpenType && !quickNavPopupHasContent(M.quickPopupOpenType)) closeQuickPopup();
    if (M.tabMode && inTabView() && !quickNavPopupHasContent(M.activeTab)) showTab("lights");
  }

  function refreshQuickPopupIfOpen() {
    if (inTabView()) {
      switch (M.activeTab) {
        case "music": M.renderMusicPopup(); break;
        case "favorites": refreshFavoritesPopup(); break;
        case "thermostats": refreshThermostatsPopup(); break;
        case "sensors": refreshSensorsPopup(); break;
        case "blinds": M.renderBlindsPopup(); break;
        case "outlets": M.renderOutletsPopup(); break;
        case "scheduling":
          if (globalThis.__MLD?.renderSchedulerView) globalThis.__MLD.renderSchedulerView();
          break;
      }
      return;
    }
    if (!M.quickPopup?.classList.contains("open") || !M.quickPopupOpenType) return;
    switch (M.quickPopupOpenType) {
      case "hub-mode": M.renderHubModePopup(); break;
      case "locks": M.renderLocksPopup(); break;
      case "blinds": M.renderBlindsPopup(); break;
      case "music": M.renderMusicPopup(); break;
      case "favorites": refreshFavoritesPopup(); break;
      case "thermostats": refreshThermostatsPopup(); break;
      case "security": M.renderSecurityPopup(); break;
      case "sensors": refreshSensorsPopup(); break;
      case "scheduling":
        if (globalThis.__MLD?.renderSchedulerView) globalThis.__MLD.renderSchedulerView();
        break;
    }
  }

  function openQuickPopup(id, title) {
    M.cancelAllSlideGestures();
    if (M.colorSession) M.closeColorPopup(true);
    if (M.tstatSession) M.closeTstatPopup();
    M.closeMusicMasterPopup();
    const popup = M.ensureQuickPopup();
    M.syncQuickPopupRef(popup);
    M.syncQuickPopupWidth(popup, id);
    popup._title.textContent = title;
    popup.setAttribute("aria-label", title);
    M.quickPopupOpenType = id;
    switch (id) {
      case "hub-mode": M.renderHubModePopup(); break;
      case "scenes": renderScenesPopup(); break;
      case "favorites": renderFavoritesPopup(); break;
      case "locks": M.renderLocksPopup(); break;
      case "blinds": M.renderBlindsPopup(); break;
      case "outlets": M.renderOutletsPopup(); break;
      case "music": M.renderMusicPopup(); break;
      case "security": M.renderSecurityPopup(); break;
      case "sensors": renderSensorsPopup(); break;
      case "thermostats": renderThermostatsPopup(); break;
      case "scheduling":
        if (globalThis.__MLD?.renderSchedulerView) globalThis.__MLD.renderSchedulerView();
        else {
          popup._body.className = "quick-body";
          popup._body.textContent = "Coming soon";
        }
        break;
      default:
        popup._body.className = "quick-body";
        popup._body.textContent = "Coming soon";
    }
    popup.hidden = false;
    popup.classList.add("open");
    popup.querySelector(".quick-close").focus();
    updateCurrentCategoryTitle();
  }

  function closeQuickPopup() {
    M.closeFavoriteTstatModeMenu();
    const popup = M.quickPopup || (globalThis.__MLD && globalThis.__MLD.quickPopup) || document.querySelector(".quick-popup");
    if (!popup) return;
    M.syncQuickPopupRef(popup);
    popup.hidden = true;
    popup.classList.remove("open");
    popup.classList.remove("quick-popup-wide");
    popup.classList.remove("quick-popup-hub-mode");
    M.quickPopupOpenType = null;
    M.favDevMap.clear();
    M.favTstatMap.clear();
    M.favSensorMap.clear();
    M.favMusicMap.clear();
    M.favLockMap.clear();
    M.favGarageMap.clear();
    M.favShadeMap.clear();
    M.favPopupSig = "";
    M.tstatsPopupMap.clear();
    M.tstatsPopupSig = "";
    M.sensorCardMap.clear();
    M.sensorsPopupSig = "";
    M.sensorTypeFilter.clear();
    M.sensorFilterOpen = false;
    M.sensorFilterChipsEl = null;
    M.sensorFilterBtnEl = null;
    M.sensorFilterEmptyEl = null;
    updateCurrentCategoryTitle();
  }

  // ---------- tab mode helpers ----------
  function ensureTabView() {
    if (M.tabViewEl) return M.tabViewEl;
    M.tabViewEl = ce("div", "tab-view");
    M.tabViewEl.hidden = true;
    // place it right after the M.rooms main element
    if (M.ROOMS_EL && M.ROOMS_EL.parentNode) M.ROOMS_EL.parentNode.insertBefore(M.tabViewEl, M.ROOMS_EL.nextSibling);
    return M.tabViewEl;
  }

  function currentBody() {
    if (M.tabMode && M.activeTab !== "lights") return ensureTabView();
    return M.ensureQuickPopup()._body;
  }

  function currentCategory() {
    if (M.tabMode && M.activeTab !== "lights") return M.activeTab;
    return M.quickPopupOpenType;
  }

  const POPUP_LABELS = {};
  for (const { popup, title } of QUICK_NAV) POPUP_LABELS[popup] = title;

  function currentCategoryLabel() {
    const cat = M.quickPopupOpenType || (M.tabMode && M.activeTab !== "lights" ? M.activeTab : null);
    if (!cat) return "Lights";
    return POPUP_LABELS[cat] || M.TAB_LABELS[cat] || cat;
  }

  function updateCurrentCategoryTitle() {
    if (M.CURRENT_CATEGORY_TITLE_EL) M.CURRENT_CATEGORY_TITLE_EL.textContent = currentCategoryLabel();
  }

  function inTabView() {
    return M.tabMode && M.activeTab !== "lights";
  }

  function updateTabActiveStates() {
    if (M.QUICK_LIGHTS_BTN) M.QUICK_LIGHTS_BTN.classList.toggle("is-tab-active", M.tabMode && M.activeTab === "lights");
    for (const { popup } of QUICK_NAV) {
      if (!M.TAB_CATEGORIES.has(popup)) continue;
      const btn = document.getElementById("quick-" + popup);
      if (btn) btn.classList.toggle("is-tab-active", M.tabMode && M.activeTab === popup);
    }
  }

  function showTab(id) {
    if (M.colorSession) M.closeColorPopup(true);
    if (M.tstatSession) M.closeTstatPopup();
    if (M.musicMasterPopup && M.musicMasterPopup.classList.contains("open")) M.closeMusicMasterPopup();
    if (M.quickPopup && M.quickPopup.classList.contains("open")) closeQuickPopup();
    const tabChanged = id !== M.activeTab;
    if (tabChanged && M.SEARCH_EL) {
      M.SEARCH_EL.value = "";
      collapsedBeforeSearch = null;
      sensorCollapsedBeforeSearch = null;
    }
    M.activeTab = id;
    ensureTabView();
    const nonLights = id !== "lights";
    if (M.ROOMS_EL) M.ROOMS_EL.hidden = nonLights;
    if (M.tabViewEl) M.tabViewEl.hidden = !nonLights;
    if (M.ALL_ON_TRACK) M.ALL_ON_TRACK.hidden = nonLights;
    else if (M.ALL_ON_BTN) M.ALL_ON_BTN.hidden = nonLights;
    if (M.ALL_OFF_TRACK) M.ALL_OFF_TRACK.hidden = nonLights;
    else if (M.ALL_OFF_BTN) M.ALL_OFF_BTN.hidden = nonLights;
    if (M.CENTRAL_TSTAT_BTN) M.CENTRAL_TSTAT_BTN.hidden = !(M.tabMode && id === "thermostats");
    if (M.CENTRAL_MUSIC_BTN) M.CENTRAL_MUSIC_BTN.hidden = !(M.tabMode && id === "music");
    if (M.SEARCH_EL) M.SEARCH_EL.placeholder = nonLights ? "Search " + (M.TAB_LABELS[id] || "items") : "Search lights or rooms";
    updateTabActiveStates();
    if (nonLights) {
      switch (id) {
        case "favorites": renderFavoritesPopup(); break;
        case "sensors": renderSensorsPopup(); break;
        case "thermostats": renderThermostatsPopup(); break;
        case "music": M.renderMusicPopup(); break;
        case "blinds": M.renderBlindsPopup(); break;
        case "outlets": M.renderOutletsPopup(); break;
        case "scheduling":
          if (globalThis.__MLD?.renderSchedulerView) globalThis.__MLD.renderSchedulerView();
          break;
      }
    }
    applySearch();
    updateExpandAllBtn();
    updateCurrentCategoryTitle();
  }

  function closeCurrentView() {
    if (M.tabMode && M.activeTab !== "lights") showTab("lights");
    else closeQuickPopup();
  }

  function setTabMode(on) {
    if (M.cfg.enableDrawer && !on) return; // drawer mode forces tab mode on
    M.cfg.enableTabs = on;
    M.tabMode = on;
    M.saveTabsPref(on);
    if (M.QUICK_LIGHTS_BTN) M.QUICK_LIGHTS_BTN.hidden = !on;
    if (!on) {
      if (M.quickPopup && M.quickPopup.classList.contains("open")) closeQuickPopup();
      M.activeTab = "lights";
      if (M.ROOMS_EL) M.ROOMS_EL.hidden = false;
      if (M.tabViewEl) M.tabViewEl.hidden = true;
      if (M.ALL_ON_TRACK) M.ALL_ON_TRACK.hidden = false;
      else if (M.ALL_ON_BTN) M.ALL_ON_BTN.hidden = false;
      if (M.ALL_OFF_TRACK) M.ALL_OFF_TRACK.hidden = false;
      else if (M.ALL_OFF_BTN) M.ALL_OFF_BTN.hidden = false;
      if (M.CENTRAL_TSTAT_BTN) M.CENTRAL_TSTAT_BTN.hidden = true;
      if (M.CENTRAL_MUSIC_BTN) M.CENTRAL_MUSIC_BTN.hidden = true;
      if (M.SEARCH_EL) M.SEARCH_EL.placeholder = "Search lights or rooms";
    } else {
      showTab("lights");
    }
    updateTabActiveStates();
    updateQuickNavVisibility();
    updateCurrentCategoryTitle();
  }

  // ---------- navigation drawer ----------
  let drawerOpen = false;
  let drawerClosing = false;
  let priorTabsPref = M.cfg.enableTabs;
  let drawerDom = null;

  function resolveDrawerDom() {
    if (drawerDom) return drawerDom;
    const toggle = document.getElementById("drawer-toggle");
    const aside = document.getElementById("app-drawer");
    const backdrop = document.getElementById("drawer-backdrop");
    const searchSlot = aside?.querySelector(".drawer-search-slot");
    const navSlot = aside?.querySelector(".drawer-nav-slot");
    const topbar = document.querySelector(".topbar");
    if (!toggle || !aside || !backdrop || !searchSlot || !navSlot || !topbar) return null;
    drawerDom = { toggle, aside, backdrop, searchSlot, navSlot, topbar };
    return drawerDom;
  }

  function setDrawerLabels() {
    const nav = document.querySelector(".quick-nav");
    if (!nav) return;
    for (const btn of nav.querySelectorAll(".ghost-btn.icon-btn")) {
      const label = btn.getAttribute("title") || btn.getAttribute("aria-label") || "";
      if (label) btn.setAttribute("data-drawer-label", label);
    }
  }

  function openDrawer() {
    const d = resolveDrawerDom();
    if (!d || drawerOpen || drawerClosing) return;
    drawerOpen = true;
    d.aside.hidden = false;
    d.backdrop.hidden = false;
    d.toggle.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      d.aside.classList.add("open");
      d.backdrop.classList.add("open");
    }));
  }

  function closeDrawer() {
    const d = resolveDrawerDom();
    if (!d || !drawerOpen) return;
    drawerOpen = false;
    drawerClosing = true;
    d.toggle.setAttribute("aria-expanded", "false");
    d.aside.classList.remove("open");
    d.backdrop.classList.remove("open");
    const finish = () => {
      if (drawerOpen) { drawerClosing = false; return; }
      d.aside.hidden = true;
      d.backdrop.hidden = true;
      drawerClosing = false;
    };
    d.aside.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 280);
  }

  function toggleDrawer() {
    if (drawerOpen) closeDrawer();
    else { M.closeTopbarOverflowMenu(); openDrawer(); }
  }

  function setDrawerMode(on) {
    const d = resolveDrawerDom();
    if (!d) return;
    M.cfg.enableDrawer = on;
    M.saveDrawerPref(on);
    if (on) {
      priorTabsPref = M.cfg.enableTabs;
      // Relocate search + quick-nav into the drawer (listeners preserved).
      d.searchSlot.appendChild(document.querySelector(".search-wrap"));
      d.navSlot.appendChild(document.querySelector(".quick-nav"));
      setDrawerLabels();
      M.APP_EL?.classList.add("drawer-mode");
      d.toggle.hidden = false;
      // Force tab mode on; disable the tabs checkbox while drawer is active.
      setTabMode(true);
      if (M.MENU_TABS_EL) {
        M.MENU_TABS_EL.disabled = true;
        const label = M.MENU_TABS_EL.closest(".topbar-overflow-check");
        if (label) { label.setAttribute("aria-disabled", "true"); label.style.opacity = "0.5"; label.style.pointerEvents = "none"; }
      }
    } else {
      M.APP_EL?.classList.remove("drawer-mode");
      if (drawerOpen || drawerClosing) closeDrawer();
      d.toggle.hidden = true;
      // Move search + quick-nav back to the topbar (original order: topbar-row, quick-nav, search-wrap).
      const nav = document.querySelector(".quick-nav");
      const search = document.querySelector(".search-wrap");
      if (nav) d.topbar.appendChild(nav);
      if (search) d.topbar.appendChild(search);
      if (nav) for (const btn of nav.querySelectorAll(".ghost-btn.icon-btn")) btn.removeAttribute("data-drawer-label");
      // Restore prior tab preference.
      if (M.MENU_TABS_EL) {
        M.MENU_TABS_EL.disabled = false;
        const label = M.MENU_TABS_EL.closest(".topbar-overflow-check");
        if (label) { label.removeAttribute("aria-disabled"); label.style.opacity = ""; label.style.pointerEvents = ""; }
      }
      setTabMode(priorTabsPref);
    }
    if (M.MENU_DRAWER_EL) {
      M.MENU_DRAWER_EL.checked = on;
      const label = M.MENU_DRAWER_EL.closest(".topbar-overflow-check");
      if (label) label.setAttribute("aria-checked", on ? "true" : "false");
    }
    updateQuickNavVisibility();
  }

  function closeConfirm(result) {
    const popup = M.confirmPopup || document.querySelector(".confirm-popup");
    if (!popup) return;
    popup.hidden = true;
    popup.classList.remove("open");
    const resolve = M.confirmPending;
    M.confirmPending = null;
    if (resolve) resolve(result);
  }

  function ensureConfirmPopup() {
    if (M.confirmPopup) return M.confirmPopup;
    const el = ce("div", "confirm-popup");
    M.confirmPopup = el;
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    const panel = ce("div", "confirm-panel");
    const msg = ce("div", "confirm-msg");
    const actions = ce("div", "confirm-actions");
    const cancel = ce("button", "ghost-btn confirm-cancel");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const ok = ce("button", "confirm-btn");
    ok.type = "button";
    panel.appendChild(msg);
    actions.appendChild(cancel);
    actions.appendChild(ok);
    panel.appendChild(actions);
    el.appendChild(panel);
    M.appendPopup(el);

    M.bindPopupDismiss(el, null, null, () => closeConfirm(false));
    cancel.addEventListener("click", (e) => { e.stopPropagation(); closeConfirm(false); });
    ok.addEventListener("click", (e) => { e.stopPropagation(); M.hapticTap(); closeConfirm(true); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.classList.contains("open")) closeConfirm(false);
    });

    el._msg = msg;
    el._ok = ok;
    return el;
  }

  function confirmAction({ message, confirmLabel, danger = false }) {
    return new Promise((resolve) => {
      M.cancelAllSlideGestures();
      const popup = ensureConfirmPopup();
      popup._msg.textContent = message;
      popup._ok.textContent = confirmLabel;
      popup._ok.classList.toggle("danger", danger);
      M.confirmPending = resolve;
      popup.hidden = false;
      popup.classList.add("open");
      popup._ok.focus();
    });
  }

  async function tapAllOn() {
    if (!M.devices.length) { M.flash("No lights configured", true); return; }
    if (await confirmAction({ message: "Turn on all lights?", confirmLabel: "All on" })) M.allLights("on");
  }

  async function tapAllOff() {
    if (!M.devices.length) { M.flash("No lights configured", true); return; }
    if (await confirmAction({ message: "Turn off all lights?", confirmLabel: "All off", danger: true })) M.allLights("off");
  }

  if (M.ALL_ON_BTN && M.ALL_ON_TRACK && M.ALL_ON_RESTORE_BTN) {
    M.attachRoomSlideAction(M.ALL_ON_TRACK, M.ALL_ON_BTN, M.ALL_ON_RESTORE_BTN, {
      direction: "right",
      clickFallback: true,
      onTap: () => { void tapAllOn(); },
      onCommit: () => {
        M.snapshotRestoreApi("house").then((ok) => {
          if (ok) M.flash("Restoring home…");
        });
      },
      canCommit: () => !!M.snapshots[M.snapshotHouseKey()],
    });
  } else if (M.ALL_ON_BTN) {
    M.ALL_ON_BTN.addEventListener("click", () => { void tapAllOn(); });
  }
  if (M.ALL_OFF_BTN && M.ALL_OFF_TRACK && M.ALL_OFF_SAVE_BTN) {
    M.attachRoomSlideAction(M.ALL_OFF_TRACK, M.ALL_OFF_BTN, M.ALL_OFF_SAVE_BTN, {
      direction: "left",
      clickFallback: true,
      onTap: () => { void tapAllOff(); },
      onCommit: () => {
        M.snapshotSaveApi("house").then((ok) => {
          if (!ok) return;
          M.snapshots[M.snapshotHouseKey()] = { ts: Date.now(), count: M.devices.length };
          M.updateRoomSnapshotUi();
          M.flash("Home saved");
        });
      },
      canCommit: () => true,
    });
  } else if (M.ALL_OFF_BTN) {
    M.ALL_OFF_BTN.addEventListener("click", () => { void tapAllOff(); });
  }

  // ---------- filter ----------
  let collapsedBeforeSearch = null;
  let sensorCollapsedBeforeSearch = null;

  function collapsedIdSet() {
    const set = new Set();
    for (const [rid, rec] of M.roomEls) if (rec.card.classList.contains("collapsed")) set.add(rid);
    return set;
  }

  function applyFilter() {
    if (!M.SEARCH_EL) return;
    const q = M.SEARCH_EL.value.trim().toLowerCase();
    if (!q) {
      for (const [, rec] of M.roomEls) rec.card.classList.remove("hidden");
      for (const [, rec] of M.devMap) rec.el.classList.remove("hidden");
      if (M.outletsInLightsRooms()) {
        for (const [, rec] of M.outletMap) rec.el.classList.remove("hidden");
      }
      if (collapsedBeforeSearch) {
        for (const [rid, rec] of M.roomEls) {
          rec.card.classList.toggle("collapsed", collapsedBeforeSearch.has(rid));
        }
        collapsedBeforeSearch = null;
        updateExpandAllBtn();
      }
      return;
    }

    if (!collapsedBeforeSearch) collapsedBeforeSearch = collapsedIdSet();

    for (const [, rec] of M.devMap) {
      rec.el.classList.toggle("hidden", !rec.el.dataset.name.includes(q));
    }
    if (M.outletsInLightsRooms()) {
      for (const [, rec] of M.outletMap) {
        rec.el.classList.toggle("hidden", !rec.el.dataset.name.includes(q));
      }
    }
    for (const [, rec] of M.roomEls) {
      const visible = rec.body.querySelectorAll(".tile:not(.hidden)");
      let show = visible.length > 0;
      if (rec.card.dataset.roomName.includes(q)) show = true;
      rec.card.classList.toggle("hidden", !show);
      if (show) rec.card.classList.remove("collapsed");
    }
  }

  function applyTabSearch(q) {
    if (!M.tabViewEl) return;
    if (M.activeTab === "sensors" && M.sensorRoomEls.size) {
      if (!q) {
        for (const [, rec] of M.sensorRoomEls) {
          for (const card of rec.body.querySelectorAll(".sensor-card")) card.classList.remove("search-hidden");
        }
        if (sensorCollapsedBeforeSearch) {
          for (const [rid, rec] of M.sensorRoomEls) {
            rec.card.classList.toggle("collapsed", sensorCollapsedBeforeSearch.has(rid));
          }
          sensorCollapsedBeforeSearch = null;
        }
        applySensorTypeFilter();
        return;
      }
      if (!sensorCollapsedBeforeSearch) sensorCollapsedBeforeSearch = sensorsCollapsedIdSet();
      for (const [, rec] of M.sensorRoomEls) {
        const roomMatch = rec.card.dataset.roomName.includes(q);
        let anyVisible = roomMatch;
        for (const card of rec.body.querySelectorAll(".sensor-card")) {
          const nameMatch = card.dataset.name.includes(q);
          const show = roomMatch || nameMatch;
          card.classList.toggle("search-hidden", !show);
          if (show) anyVisible = true;
        }
        if (anyVisible) rec.card.classList.remove("collapsed");
        rec.card.classList.toggle("hidden", !anyVisible);
      }
      return;
    }
    const items = M.tabViewEl.querySelectorAll("[data-name]");
    for (const el of items) {
      el.classList.toggle("search-hidden", !!q && !el.dataset.name.includes(q));
    }
  }

  function applySearch() {
    if (!M.SEARCH_EL) return;
    if (inTabView()) {
      applyTabSearch(M.SEARCH_EL.value.trim().toLowerCase());
    } else {
      applyFilter();
    }
  }
  if (M.SEARCH_EL) M.SEARCH_EL.addEventListener("input", applySearch);

  // ---------- collapse persistence ----------
  function sensorsCollapsedIdSet() {
    const set = new Set();
    for (const [rid, rec] of M.sensorRoomEls) if (rec.card.classList.contains("collapsed")) set.add(rid);
    return set;
  }

  function sensorsCollapsedSet() {
    const set = [];
    for (const [rid, rec] of M.sensorRoomEls) if (rec.card.classList.contains("collapsed")) set.push(rid);
    return set;
  }

  function persistSensorsCollapsed() {
    try { localStorage.setItem("mld_sensors_collapsed", sensorsCollapsedSet().join(",")); } catch {}
  }

  function allSensorRoomsCollapsed() {
    if (M.sensorRoomEls.size === 0) return true;
    for (const [, rec] of M.sensorRoomEls) if (!rec.card.classList.contains("collapsed")) return false;
    return true;
  }

  function expandAllSensorRooms() {
    for (const [, rec] of M.sensorRoomEls) rec.card.classList.remove("collapsed");
  }

  function collapseAllSensorRooms() {
    for (const [, rec] of M.sensorRoomEls) rec.card.classList.add("collapsed");
  }

  function restoreSensorsCollapsed() {
    for (const [, rec] of M.sensorRoomEls) rec.card.classList.remove("collapsed");
    let raw = null;
    try { raw = localStorage.getItem("mld_sensors_collapsed"); } catch {}
    if (!raw) return;
    const set = new Set(raw.split(",").filter(Boolean).map(Number));
    for (const [rid, rec] of M.sensorRoomEls) {
      if (set.has(rid)) rec.card.classList.add("collapsed");
    }
  }

  function collapsedSet() {
    const set = [];
    for (const [rid, rec] of M.roomEls) if (rec.card.classList.contains("collapsed")) set.push(rid);
    return set;
  }

  function persistCollapsed() {
    try { localStorage.setItem("mld_collapsed", collapsedSet().join(",")); } catch {}
  }

  function allRoomsCollapsed() {
    if (M.roomEls.size === 0) return true;
    for (const [, rec] of M.roomEls) if (!rec.card.classList.contains("collapsed")) return false;
    return true;
  }

  function updateExpandAllBtn() {
    if (!M.EXPAND_ALL_BTN) return;
    const useSensors = M.activeTab === "sensors" && M.sensorRoomEls.size > 0;
    const collapsed = useSensors ? allSensorRoomsCollapsed() : allRoomsCollapsed();
    const label = collapsed ? "Expand all rooms" : "Collapse all rooms";
    M.EXPAND_ALL_BTN.innerHTML = collapsed ? EXPAND_ALL_SVG : COLLAPSE_ALL_SVG;
    M.EXPAND_ALL_BTN.setAttribute("aria-label", label);
    M.EXPAND_ALL_BTN.setAttribute("title", label);
  }

  function collapseAllRooms() {
    for (const [, rec] of M.roomEls) rec.card.classList.add("collapsed");
    persistCollapsed();
    updateExpandAllBtn();
  }

  function expandAllRooms() {
    for (const [, rec] of M.roomEls) rec.card.classList.remove("collapsed");
    persistCollapsed();
    updateExpandAllBtn();
  }

  function restoreCollapsed() {
    let raw = null;
    try { raw = localStorage.getItem("mld_collapsed"); } catch {}
    if (raw === null) {
      collapseAllRooms();
      return;
    }
    const set = new Set(raw.split(",").filter(Boolean).map(Number));
    for (const [rid, rec] of M.roomEls) {
      rec.card.classList.toggle("collapsed", set.has(rid));
    }
    updateExpandAllBtn();
  }

  if (M.EXPAND_ALL_BTN) {
    M.EXPAND_ALL_BTN.addEventListener("click", () => {
      if (M.activeTab === "sensors" && M.sensorRoomEls.size) {
        if (allSensorRoomsCollapsed()) expandAllSensorRooms();
        else collapseAllSensorRooms();
        persistSensorsCollapsed();
        updateExpandAllBtn();
        return;
      }
      if (allRoomsCollapsed()) expandAllRooms();
      else collapseAllRooms();
    });
  }

  if (M.REORDER_DONE_BTN) {
    M.REORDER_DONE_BTN.addEventListener("click", M.finishReorderMode);
  }

  if (M.REORDER_CANCEL_BTN) {
    M.REORDER_CANCEL_BTN.addEventListener("click", M.cancelReorderMode);
  }

  if (M.OVERFLOW_BTN) {
    M.OVERFLOW_BTN.addEventListener("click", (e) => {
      e.stopPropagation();
      if (M.cfg.enableDrawer) closeDrawer();
      M.toggleTopbarOverflowMenu();
    });
  }

  if (M.MENU_REORDER_BTN) {
    M.MENU_REORDER_BTN.addEventListener("click", () => {
      M.closeTopbarOverflowMenu();
      M.enterReorderMode();
    });
  }

  if (M.MENU_HAPTICS_EL) {
    const hapticsLabel = M.MENU_HAPTICS_EL.closest(".topbar-overflow-check");
    M.MENU_HAPTICS_EL.checked = M.cfg.enableHaptics;
    if (hapticsLabel) hapticsLabel.setAttribute("aria-checked", M.cfg.enableHaptics ? "true" : "false");
    M.MENU_HAPTICS_EL.addEventListener("click", (e) => e.stopPropagation());
    M.MENU_HAPTICS_EL.addEventListener("change", () => {
      M.cfg.enableHaptics = M.MENU_HAPTICS_EL.checked;
      M.saveHapticsPref(M.cfg.enableHaptics);
      if (hapticsLabel) hapticsLabel.setAttribute("aria-checked", M.cfg.enableHaptics ? "true" : "false");
      if (M.cfg.enableHaptics) M.testHaptics();
    });
  }

  if (M.MENU_TABS_EL) {
    const tabsLabel = M.MENU_TABS_EL.closest(".topbar-overflow-check");
    M.MENU_TABS_EL.checked = M.cfg.enableTabs;
    if (tabsLabel) tabsLabel.setAttribute("aria-checked", M.cfg.enableTabs ? "true" : "false");
    M.MENU_TABS_EL.addEventListener("click", (e) => e.stopPropagation());
    M.MENU_TABS_EL.addEventListener("change", () => {
      setTabMode(M.MENU_TABS_EL.checked);
      if (tabsLabel) tabsLabel.setAttribute("aria-checked", M.cfg.enableTabs ? "true" : "false");
    });
  }

  if (M.MENU_DRAWER_EL) {
    const drawerLabel = M.MENU_DRAWER_EL.closest(".topbar-overflow-check");
    M.MENU_DRAWER_EL.checked = M.cfg.enableDrawer;
    if (drawerLabel) drawerLabel.setAttribute("aria-checked", M.cfg.enableDrawer ? "true" : "false");
    M.MENU_DRAWER_EL.addEventListener("click", (e) => e.stopPropagation());
    M.MENU_DRAWER_EL.addEventListener("change", () => {
      setDrawerMode(M.MENU_DRAWER_EL.checked);
    });
  }

  const DRAWER_TOGGLE_BTN_REF = document.getElementById("drawer-toggle");
  const DRAWER_BACKDROP_REF = document.getElementById("drawer-backdrop");
  if (DRAWER_TOGGLE_BTN_REF) {
    DRAWER_TOGGLE_BTN_REF.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDrawer();
    });
  }
  if (DRAWER_BACKDROP_REF) {
    DRAWER_BACKDROP_REF.addEventListener("click", closeDrawer);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawerOpen) closeDrawer();
  });

  if (M.MENU_THEME_SEGMENT) {
    for (const btn of M.MENU_THEME_SEGMENT.querySelectorAll(".topbar-overflow-seg")) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const theme = btn.dataset.theme;
        if (!M.THEME_OPTIONS.includes(theme)) return;
        M.saveThemePref(theme);
        M.applyTheme(theme);
      });
    }
  }

  if (M.MENU_OPEN_LOCAL_BTN) {
    M.MENU_OPEN_LOCAL_BTN.addEventListener("click", () => {
      M.closeTopbarOverflowMenu();
      M.navigateToLocal();
    });
  }

  if (M.MENU_OPEN_CLOUD_BTN) {
    M.MENU_OPEN_CLOUD_BTN.addEventListener("click", () => {
      M.closeTopbarOverflowMenu();
      M.navigateToCloud();
    });
  }

  if (M.MENU_LOCAL_URL_EL) {
    M.MENU_LOCAL_URL_EL.addEventListener("click", (e) => e.stopPropagation());
    M.MENU_LOCAL_URL_EL.addEventListener("change", () => {
      const v = M.MENU_LOCAL_URL_EL.value.trim();
      M.saveStoredLocalUrl(v);
      M.cfg.localUrl = v;
      if (!v) {
        try { localStorage.removeItem(M.LOCAL_OK_STORAGE_KEY); } catch {}
      }
      M.updateLocalModeMenuUI();
    });
    M.MENU_LOCAL_URL_EL.addEventListener("blur", () => {
      const v = M.MENU_LOCAL_URL_EL.value.trim();
      M.saveStoredLocalUrl(v);
      M.cfg.localUrl = v;
      if (!v) {
        try { localStorage.removeItem(M.LOCAL_OK_STORAGE_KEY); } catch {}
      }
      M.updateLocalModeMenuUI();
    });
  }

  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (M.cfg.theme === "auto") M.applyTheme("auto");
    });
  } catch {}

  M.applyTheme(M.cfg.theme);

  // ---------- polling ----------
  async function refresh() {
    if (M.isDashboardGateOpen()) return;
    try {
      const d = await M.fetchData();
      M.refreshLocalUrlFromConfig();
      M.updateLocalModeMenuUI();
      M.render(d);
      M.setStatus("");
    } catch (e) {
      M.setStatus("Cannot reach hub", true);
    }
  }
  function effectivePollInterval() {
    const base = Math.max(2000, M.cfg.pollIntervalMs || M.POLL_DEFAULT);
    if (M.cfg.useWebSocket && M.wsConnected) return Math.max(base, M.POLL_WS_FALLBACK);
    return base;
  }

  function startPolling() {
    stopPolling();
    M.pollTimer = setInterval(refresh, effectivePollInterval());
  }

  function restartPolling() {
    if (!document.hidden && !M.reorderMode) startPolling();
  }
  function stopPolling() { if (M.pollTimer) { clearInterval(M.pollTimer); M.pollTimer = null; } }

  function clearWsReconnectTimer() {
    if (M.wsReconnectTimer) {
      clearTimeout(M.wsReconnectTimer);
      M.wsReconnectTimer = null;
    }
  }

  function stopWS() {
    clearWsReconnectTimer();
    M.wsConnected = false;
    if (M.ws) {
      try { M.ws.close(); } catch {}
      M.ws = null;
    }
  }

  function pauseApp() {
    stopPolling();
    stopWS();
  }

  function resetUiOnResume() {
    M.cancelAllSlideGestures();
    closeConfirm(false);
    if (drawerOpen) closeDrawer();
    if (M.quickPopupOpenType) closeQuickPopup();
    if (M.colorSession) M.closeColorPopup(false);
  }

  function syncApp() {
    if (document.hidden) return;
    if (M.isDashboardGateOpen()) return;
    refresh();
    if (!M.reorderMode) startPolling();
    startWS();
  }

  function resumeApp() {
    if (document.hidden) return;
    resetUiOnResume();
    syncApp();
  }

  // ---------- websocket (local only) ----------
  function startWS() {
    if (!M.cfg.useWebSocket) return;
    if (M.ws) {
      if (M.ws.readyState === WebSocket.OPEN) return;
      try { M.ws.close(); } catch {}
      M.ws = null;
      M.wsConnected = false;
    }
    if (location.hostname === "cloud.hubitat.com" || location.protocol === "https:") return; // M.ws not available via cloud proxy
    const wsUrl = "ws://" + location.host + "/eventsocket";
    try { M.ws = new WebSocket(wsUrl); } catch { M.ws = null; return; }
    M.ws.onopen = () => { M.wsRetry = 0; M.wsConnected = true; restartPolling(); };
    M.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (!m) return;
        if (m.source === "LOCATION") {
          if (m.name === "hsmStatus" && !M.hsmLocked()) {
            M.hsmStatus = String(m.value || "");
            if (currentCategory() === "security") M.renderSecurityPopup();
          } else if (m.name === "hsmAlert" && !M.hsmLocked()) {
            M.hsmAlert = String(m.value || "");
            if (m.descriptionText) M.hsmAlertDesc = String(m.descriptionText);
            if (currentCategory() === "security") M.renderSecurityPopup();
          }
          return;
        }
        if (m.source !== "DEVICE" || m.deviceId == null) return;
        const rec = M.devMap.get(Number(m.deviceId));
        if (rec) {
          const dev = M.devices.find((x) => x.i === Number(m.deviceId));
          if (m.name === "switch") {
            const s = (m.value === "on") ? 1 : 0;
            if (dev) dev.s = s;
            M.clearSwitchOptimistic(Number(m.deviceId));
            M.updateStates();
          }
          else if (m.name === "level" && rec.isDim) {
            const lvl = Math.round(Number(m.value));
            if (!isNaN(lvl)) {
              if (dev) dev.l = lvl;
              M.clearSwitchOptimistic(Number(m.deviceId));
              if (!rec.el.classList.contains("dragging")) M.updateStates();
            }
          }
          else if (m.name === "colorTemperature" && rec.data.ct) {
            const k = Math.round(Number(m.value));
            if (!isNaN(k) && (!M.colorSession || M.colorSession.id !== rec.data.i)) {
              rec.data.k = k;
              M.updateStates();
            }
          }
          else if (m.name === "hue" && rec.data.rgb) {
            const h = Math.round(Number(m.value));
            if (!isNaN(h) && (!M.colorSession || M.colorSession.id !== rec.data.i)) {
              rec.data.h = h;
              M.updateStates();
            }
          }
          else if (m.name === "saturation" && rec.data.rgb) {
            const sat = Math.round(Number(m.value));
            if (!isNaN(sat) && (!M.colorSession || M.colorSession.id !== rec.data.i)) {
              rec.data.sat = sat;
              M.updateStates();
            }
          }
          return;
        }
        const outletRec = M.outletMap.get(Number(m.deviceId)) || M.favDevMap.get(Number(m.deviceId));
        if (outletRec?.isOutlet && m.name === "switch") {
          const out = M.outlets.find((x) => x.i === Number(m.deviceId));
          if (out) out.s = (m.value === "on") ? 1 : 0;
          M.clearSwitchOptimistic(Number(m.deviceId));
          M.updateStates();
          return;
        }
        const lock = M.locks.find(x => x.i === Number(m.deviceId));
        if (lock && String(m.name || "") === "lock") {
          const val = String(m.value || "");
          const opt = M.lockOptimistic.get(lock.i);
          if (opt && opt.until > Date.now()) return;
          lock.st = val;
          lock.lk = val === "locked" ? 1 : 0;
          if (currentCategory() === "locks") M.renderLocksPopup();
          else if (currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
          return;
        }
        const garage = M.garageDoors.find(x => x.i === Number(m.deviceId));
        if (garage && String(m.name || "") === "door") {
          const opt = M.garageOptimistic.get(garage.i);
          if (opt && opt.until > Date.now()) return;
          garage.st = String(m.value || "");
          if (currentCategory() === "locks") M.renderLocksPopup();
          else if (currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
          return;
        }
        const shade = M.windowShades.find(x => x.i === Number(m.deviceId));
        if (shade) {
          const name = String(m.name || "");
          const opt = M.shadeOptimistic.get(shade.i);
          if (opt && opt.until > Date.now()) return;
          if (name === "windowShade") {
            shade.st = String(m.value || "");
          } else if (name === "position") {
            const pos = Math.round(Number(m.value));
            if (!isNaN(pos)) shade.pos = pos;
          } else return;
          if (currentCategory() === "blinds") M.renderBlindsPopup();
          else if (currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
          return;
        }
        // thermostat / sensor events
        const t = M.thermostats.find(x => x.i === Number(m.deviceId));
        if (t) {
          const name = String(m.name || "");
          const val = m.value;
          if (name === "thermostatMode" && !M.tstatModeLocked(t.i)) t.tm = val;
          else if (name === "thermostatOperatingState" && !M.tstatModeLocked(t.i)) t.os = val;
          else if (name === "heatingSetpoint") M.applyTstatSetpoints(t, { hsp: val });
          else if (name === "coolingSetpoint") M.applyTstatSetpoints(t, { csp: val });
          else if (name === "temperature") { const n = Number(val); if (!isNaN(n)) t.temp = Math.round(n); }
          else if (name === "thermostatFanMode") t.fm = val;
          else if (name === "fanSpeed") t.fs = val;
          else return;
          M.updateClimateWidgets();
          M.updateRoomMeta();
          M.refreshOpenTstatQuickPopups();
          return;
        }
        const s = M.tempSensors.find(x => x.i === Number(m.deviceId));
        if (s) {
          const nm = String(m.name || "");
          if (nm === "temperature") {
            const n = Number(m.value);
            if (!isNaN(n)) {
              s.temp = Math.round(n);
              M.updateClimateWidgets();
              M.updateRoomMeta();
            }
          } else if (nm === "battery") {
            const n = Number(m.value);
            if (!isNaN(n)) s.bat = Math.round(n);
          } else return;
          if (currentCategory() === "sensors") refreshSensorsPopup();
          return;
        }
        const sen = M.sensors.find(x => x.i === Number(m.deviceId));
        if (sen) {
          if (applySensorWsAttr(sen, m.name, m.value, m.unit)) {
            if (currentCategory() === "sensors") refreshSensorsPopup();
            else if (currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
          }
          return;
        }
        const valve = M.valves.find(x => x.i === Number(m.deviceId));
        if (valve) {
          const nm = String(m.name || "").toLowerCase();
          if (nm === "valve") {
            valve.st = String(m.value || "");
            const opt = M.valveOptimistic.get(valve.i);
            if (opt?.st != null && valve.st === opt.st) M.clearValveOptimistic(valve.i);
            if (currentCategory() === "sensors") refreshSensorsPopup();
            else if (currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
          }
          return;
        }
      } catch {}
    };
    M.ws.onclose = () => {
      M.ws = null;
      M.wsConnected = false;
      restartPolling();
      if (!document.hidden) scheduleReconnect();
    };
    M.ws.onerror = () => { try { M.ws.close(); } catch {} };
  }
  function scheduleReconnect() {
    if (!M.cfg.useWebSocket || document.hidden) return;
    M.wsRetry = Math.min(M.wsRetry + 1, 6);
    const delay = Math.min(15000, 1000 * 2 ** M.wsRetry);
    clearWsReconnectTimer();
    M.wsReconnectTimer = setTimeout(() => {
      M.wsReconnectTimer = null;
      startWS();
    }, delay);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      M.pageWasHidden = true;
      pauseApp();
    } else if (M.pageWasHidden) {
      M.pageWasHidden = false;
      resumeApp();
    } else {
      syncApp();
    }
  });
  window.addEventListener("pageshow", (e) => {
    if (document.hidden) return;
    if (e.persisted) resumeApp();
  });

  // ---------- init ----------
  updateExpandAllBtn();
  QUICK_NAV.forEach(({ id, popup, title, svg }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.innerHTML = svg;
    btn.addEventListener("click", () => {
      if (M.reorderMode) return;
      M.hapticTap();
      if (M.tabMode && M.TAB_CATEGORIES.has(popup)) showTab(popup);
      else openQuickPopup(popup, title);
      if (M.cfg.enableDrawer) closeDrawer();
    });
  });
  if (M.QUICK_LIGHTS_BTN) {
    M.QUICK_LIGHTS_BTN.innerHTML = LIGHTS_SVG;
    M.QUICK_LIGHTS_BTN.addEventListener("click", () => {
      if (M.reorderMode) return;
      M.hapticTap();
      if (M.tabMode) showTab("lights");
      if (M.cfg.enableDrawer) closeDrawer();
    });
    M.QUICK_LIGHTS_BTN.hidden = !M.tabMode;
  }
  M.setupNavReorderItems();
  M.postCall("applyNavOrder", M.postCall("getDisplayNavOrder"));
  if (M.CENTRAL_TSTAT_BTN) {
    M.CENTRAL_TSTAT_BTN.innerHTML = CENTRAL_TSTAT_SVG + '<span>All thermostats</span>';
    M.CENTRAL_TSTAT_BTN.addEventListener("click", () => {
      M.hapticTap();
      M.openCentralTstatPopup();
    });
  }
  if (M.CENTRAL_MUSIC_BTN) {
    M.CENTRAL_MUSIC_BTN.innerHTML = CENTRAL_MUSIC_SVG + '<span>All music</span>';
    M.CENTRAL_MUSIC_BTN.addEventListener("click", () => {
      M.hapticTap();
      M.openMusicMasterPopup();
    });
  }
  if (M.tabMode) { ensureTabView(); updateTabActiveStates(); }
  if (M.cfg.enableDrawer) setDrawerMode(true);
  updateCurrentCategoryTitle();
  if (location.protocol === "https:" && "serviceWorker" in navigator) {
    navigator.serviceWorker.register(M.withToken("sw.js"), { scope: "./" }).catch(() => {});
  }

  // Password gate UI lives here (post2) so mld-app.js stays under Hubitat's 128 KB
  // File Manager limit — putting it in part1 previously left only ~3 KB headroom.
  async function fetchAuthStatus() {
    const r = await M.fetchWithTimeout(M.withToken("auth/status"), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  async function unlockDashboard(password) {
    async function parseUnlockResponse(r) {
      let data = {};
      try { data = await r.json(); } catch {}
      if (r.status === 403 || data.error === "wrong password") {
        return { ok: false, error: "wrong password" };
      }
      if (!r.ok) {
        const hubMsg = data?.detail || data?.message || data?.errorMessage || data?.msg;
        const err = data?.error;
        let msg = "Unlock failed";
        if (typeof hubMsg === "string" && hubMsg.trim()) msg = hubMsg.trim();
        else if (typeof err === "string" && err.trim()) msg = err.trim();
        else if (err != null && err !== true) msg = String(err);
        return { ok: false, error: msg };
      }
      if (!data?.session && !data?.dashSession) {
        return { ok: false, error: "Unlock failed" };
      }
      M.applyDashSessionFromResponse(data);
      return { ok: true };
    }
    try {
      const postUrl = M.withToken("auth/unlock");
      let r = await M.fetchWithTimeout(postUrl, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ password }),
      });
      let result = await parseUnlockResponse(r);
      if (result.ok || result.error === "wrong password") return result;
      const sep = postUrl.includes("?") ? "&" : "?";
      r = await M.fetchWithTimeout(postUrl + sep + "password=" + encodeURIComponent(password), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      return parseUnlockResponse(r);
    } catch {
      return { ok: false, error: "Unlock failed" };
    }
  }

  function ensureDashboardGatePopup() {
    if (M.gatePopup) return M.gatePopup;
    M.gatePopup = ce("div", "dash-gate-popup");
    M.gatePopup.hidden = true;
    M.gatePopup.setAttribute("role", "dialog");
    M.gatePopup.setAttribute("aria-modal", "true");
    M.gatePopup.setAttribute("aria-label", "Dashboard password");
    const panel = ce("div", "dash-gate-panel");
    const title = ce("h2", "dash-gate-title");
    title.textContent = "Enter dashboard password";
    const error = ce("p", "dash-gate-error");
    error.hidden = true;
    error.setAttribute("role", "alert");
    error.setAttribute("aria-live", "polite");
    const input = ce("input", "dash-gate-input");
    input.type = "password";
    input.autocomplete = "current-password";
    input.placeholder = "Password";
    input.spellcheck = false;
    const submit = ce("button", "confirm-btn dash-gate-submit");
    submit.type = "button";
    submit.textContent = "Unlock";
    panel.appendChild(title);
    panel.appendChild(error);
    panel.appendChild(input);
    panel.appendChild(submit);
    M.gatePopup.appendChild(panel);
    M.appendPopup(M.gatePopup);

    async function submitGate() {
      M.hapticTap();
      const password = input.value;
      if (!password) return;
      submit.disabled = true;
      const result = await unlockDashboard(password);
      submit.disabled = false;
      if (result.ok) {
        error.hidden = true;
        error.textContent = "";
        const resolve = M.gateState?.resolve;
        closeDashboardGate();
        resolve?.();
        return;
      }
      error.textContent = result.error === "wrong password" ? "Wrong password" : (result.error || "Unlock failed");
      error.hidden = false;
      M.gatePopup.classList.remove("shake");
      void M.gatePopup.offsetWidth;
      M.gatePopup.classList.add("shake");
      input.select();
    }

    submit.addEventListener("click", (e) => {
      e.stopPropagation();
      submitGate();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitGate();
      }
    });

    M.gatePopup._title = title;
    M.gatePopup._error = error;
    M.gatePopup._input = input;
    M.gatePopup._submit = submit;
    return M.gatePopup;
  }

  function openDashboardGate() {
    const popup = ensureDashboardGatePopup();
    const alreadyOpen = popup.classList.contains("open") && M.gateState?.resolve;
    if (!alreadyOpen) {
      popup._error.hidden = true;
      popup._error.textContent = "";
      popup._input.value = "";
    }
    popup.hidden = false;
    popup.classList.remove("shake");
    popup.classList.add("open");
    if (!alreadyOpen) requestAnimationFrame(() => popup._input.focus());
  }

  function closeDashboardGate() {
    if (!M.gatePopup) return;
    M.gatePopup.classList.remove("open", "shake");
    M.gatePopup.hidden = true;
    M.gateState = null;
  }

  function promptDashboardPassword() {
    return new Promise((resolve) => {
      M.gateState = { resolve };
      openDashboardGate();
    });
  }

  async function ensureDashboardAccess() {
    if (M.ensureDashboardAccessTask) return M.ensureDashboardAccessTask;
    M.ensureDashboardAccessTask = (async () => {
      M.loadDashSession();
      let status;
      try {
        status = await fetchAuthStatus();
      } catch {
        return;
      }
      if (!status?.required) {
        M.dashboardPasswordRequired = false;
        M.clearDashSession();
        return;
      }
      M.dashboardPasswordRequired = true;
      if (M.isDashSessionFresh()) {
        M.setupDashSessionActivityRenewal();
        return;
      }
      await promptDashboardPassword();
      // Unlock writes localStorage via M.applyDashSessionFromResponse; re-sync before /data.
      M.loadDashSession();
      M.setupDashSessionActivityRenewal();
    })();
    try {
      await M.ensureDashboardAccessTask;
    } finally {
      M.ensureDashboardAccessTask = null;
    }
  }

  (async function init() {
    M.consumePreferCloudParam();
    try {
      await ensureDashboardAccess();
    } catch (e) {
      console.error("Dashboard auth failed:", e);
    }
    M.loadingState();
    try {
      const d = await M.fetchData();
      if (M.applyLocalModeStrategy()) return;
      M.render(d);
      M.initAndroidLocalImmersive();
      startPolling();
      startWS();
    } catch (e) {
      console.error("Dashboard init failed:", e);
      // M.getJson already prompts on 401; only recover here if that path threw auth_required.
      if (e?.code === "auth_required" || /auth required/i.test(String(e?.message || ""))) {
        try {
          M.loadDashSession();
          if (!M.isDashSessionFresh()) await ensureDashboardAccess();
          const d = await M.fetchData();
          if (M.applyLocalModeStrategy()) return;
          M.render(d);
          M.initAndroidLocalImmersive();
          startPolling();
          startWS();
          return;
        } catch (retryErr) {
          console.error("Dashboard auth retry failed:", retryErr);
        }
      }
      const cloud = String(M.cfg.cloudUrl || M.loadStoredCloudUrl() || "").trim();
      if (M.isLocalOrigin() && cloud) {
        M.cfg.cloudUrl = cloud;
        M.navigateToCloud();
        return;
      }
      const detail = e?.message ? String(e.message) : "";
      M.setStatus("Cannot reach hub. Make sure you opened the dashboard via the app URL.", true);
      M.emptyState(
        '<div class="empty"><h2>Connection error</h2>' +
        'Could not load /data. Open this page through the Modern Dashboard app URL on your hub.' +
        (detail ? '<p class="empty-detail">' + detail.replace(/</g, "&lt;") + '</p>' : '') +
        (cloud ? '<p class="empty-detail"><button type="button" class="ghost-btn" id="fallback-cloud-btn">Open cloud mode</button></p>' : '') +
        '</div>'
      );
      const fallbackBtn = document.getElementById("fallback-cloud-btn");
      if (fallbackBtn) {
        fallbackBtn.addEventListener("click", () => {
          M.cfg.cloudUrl = cloud;
          M.navigateToCloud();
        });
      }
    }
  })();

  if (globalThis.__MLD) globalThis.__MLD.updateQuickNavVisibility = updateQuickNavVisibility;
  Object.assign(M, { sendValveCmd, reconcileValve, sensorTypeOrder, sortSensorsInRoom, groupSensorsByRoom, groupRoomSensorsByType, mergedSensorList, sensorsPopupSignature, sensorTypesWithCounts, sensorMatchesFilter, syncSensorFilterBtn, syncSensorFilterChips, applySensorTypeFilter, buildSensorFilterBar, sensorBatteryPct, sensorBatteryLabel, sensorExFooter, applySensorCardState, makeSensorCard, makeFavoriteSensorCard, updateSensorCard, buildSensorRoomSection, renderSensorsPopup, refreshSensorsPopup, renderScenesPopup, favoritesPopupSignature, makeQuickTstatCard, updateQuickTstatCard, refreshFavoritesPopup, renderFavoritesPopup, thermostatsListSignature, refreshThermostatsPopup, renderThermostatsPopup, quickNavPopupHasContent, updateQuickNavVisibility, refreshQuickPopupIfOpen, openQuickPopup, closeQuickPopup, ensureTabView, currentBody, currentCategory, currentCategoryLabel, updateCurrentCategoryTitle, inTabView, updateTabActiveStates, showTab, closeCurrentView, setTabMode, resolveDrawerDom, setDrawerLabels, openDrawer, closeDrawer, toggleDrawer, setDrawerMode, closeConfirm, ensureConfirmPopup, confirmAction, tapAllOn, tapAllOff, collapsedIdSet, applyFilter, applyTabSearch, applySearch, sensorsCollapsedIdSet, sensorsCollapsedSet, persistSensorsCollapsed, allSensorRoomsCollapsed, expandAllSensorRooms, collapseAllSensorRooms, restoreSensorsCollapsed, collapsedSet, persistCollapsed, allRoomsCollapsed, updateExpandAllBtn, collapseAllRooms, expandAllRooms, restoreCollapsed, refresh, effectivePollInterval, startPolling, restartPolling, stopPolling, clearWsReconnectTimer, stopWS, pauseApp, resetUiOnResume, syncApp, resumeApp, startWS, scheduleReconnect, fetchAuthStatus, unlockDashboard, ensureDashboardGatePopup, openDashboardGate, closeDashboardGate, promptDashboardPassword, ensureDashboardAccess });
})();
