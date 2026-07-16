(() => {
  "use strict";
  const M = globalThis.__MLD;
  if (!M) {
    console.error("Modern Dashboard: upload mld-app.js before mld-app-core.js");
    return;
  }
  function ensureColorPopup() {
    if (M.colorPopup) return M.colorPopup;
    M.colorPopup = ce("div", "ct-popup");
    M.colorPopup.hidden = true;
    M.colorPopup.setAttribute("role", "dialog");
    M.colorPopup.setAttribute("aria-modal", "true");
    M.colorPopup.setAttribute("aria-label", "Light settings");
    const panel = ce("div", "ct-panel");
    const head = ce("div", "ct-head");
    const value = ce("div", "ct-value");
    const closeBtn = ce("button", "ct-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close light settings");
    closeBtn.textContent = "×";
    head.appendChild(value);
    head.appendChild(closeBtn);

    const tabs = ce("div", "ct-tabs");
    const tabCt = ce("button", "ct-tab");
    tabCt.type = "button";
    tabCt.textContent = "White";
    tabCt.dataset.tab = "ct";
    const tabRgb = ce("button", "ct-tab");
    tabRgb.type = "button";
    tabRgb.textContent = "RGB";
    tabRgb.dataset.tab = "rgb";
    tabs.appendChild(tabCt);
    tabs.appendChild(tabRgb);
    const tabLevel = ce("button", "ct-tab");
    tabLevel.type = "button";
    tabLevel.textContent = "Brightness";
    tabLevel.dataset.tab = "level";
    tabs.appendChild(tabLevel);

    const paneCt = ce("div", "ct-pane ct-pane-ct");
    const track = ce("div", "ct-track");
    const thumb = ce("div", "ct-thumb");
    track.appendChild(thumb);
    paneCt.appendChild(track);
    const ctPresets = ce("div", "ct-presets");
    for (const k of CT_PRESETS) {
      const btn = ce("button", "ct-preset");
      btn.type = "button";
      btn.dataset.k = String(k);
      btn.setAttribute("aria-label", k + " Kelvin");
      btn.style.background = kelvinSwatchColor(k);
      const label = ce("span", "ct-preset-k");
      label.textContent = String(k);
      btn.appendChild(label);
      ctPresets.appendChild(btn);
    }
    paneCt.appendChild(ctPresets);

    const paneRgb = ce("div", "ct-pane ct-pane-rgb");
    const wheelWrap = ce("div", "rgb-wheel-wrap");
    const canvas = ce("canvas", "rgb-wheel");
    canvas.width = RGB_WHEEL_SIZE;
    canvas.height = RGB_WHEEL_SIZE;
    const cursor = ce("div", "rgb-cursor");
    wheelWrap.appendChild(canvas);
    wheelWrap.appendChild(cursor);
    const presets = ce("div", "rgb-presets");
    for (const p of RGB_PRESETS) {
      const sw = ce("button", "rgb-swatch");
      sw.type = "button";
      sw.setAttribute("aria-label", p.label);
      sw.style.background = hsToHex(p.h, p.s);
      sw.dataset.h = String(p.h);
      sw.dataset.s = String(p.s);
      presets.appendChild(sw);
    }
    paneRgb.appendChild(wheelWrap);
    paneRgb.appendChild(presets);

    const paneLevel = ce("div", "ct-pane ct-pane-level");
    const levelTrack = ce("div", "level-track");
    const levelInner = ce("div", "level-track-inner");
    const levelDim = ce("div", "level-dim");
    const levelThumb = ce("div", "level-thumb");
    levelInner.appendChild(levelDim);
    levelTrack.appendChild(levelInner);
    levelTrack.appendChild(levelThumb);
    paneLevel.appendChild(levelTrack);
    const levelPresets = ce("div", "level-presets");
    for (const pct of LEVEL_PRESETS) {
      const btn = ce("button", "level-preset");
      btn.type = "button";
      btn.dataset.l = String(pct);
      btn.setAttribute("aria-label", pct + " percent brightness");
      const label = ce("span", "level-preset-pct");
      label.textContent = pct + "%";
      btn.appendChild(label);
      levelPresets.appendChild(btn);
    }
    paneLevel.appendChild(levelPresets);

    panel.appendChild(head);
    panel.appendChild(tabs);
    panel.appendChild(paneCt);
    panel.appendChild(paneRgb);
    panel.appendChild(paneLevel);
    M.colorPopup.appendChild(panel);
    M.appendPopup(M.colorPopup);

    M.colorPopup._valueEl = value;
    M.colorPopup._tabsEl = tabs;
    M.colorPopup._tabCt = tabCt;
    M.colorPopup._tabRgb = tabRgb;
    M.colorPopup._tabLevel = tabLevel;
    M.colorPopup._paneCt = paneCt;
    M.colorPopup._paneRgb = paneRgb;
    M.colorPopup._paneLevel = paneLevel;
    M.colorPopup._trackEl = track;
    M.colorPopup._thumbEl = thumb;
    M.colorPopup._levelTrackEl = levelTrack;
    M.colorPopup._levelDimEl = levelDim;
    M.colorPopup._levelThumbEl = levelThumb;
    M.colorPopup._wheelCanvas = canvas;
    M.colorPopup._wheelCursor = cursor;
    M.colorPopup._presetsEl = presets;

    M.drawRgbWheel(canvas);
    attachCtTrackDrag(track);
    attachCtPresets(ctPresets);
    attachLevelTrackDrag(levelTrack);
    attachLevelPresets(levelPresets);
    attachRgbWheel(canvas, cursor);
    attachRgbPresets(presets);

    tabCt.addEventListener("click", (e) => { e.stopPropagation(); setColorTab("ct"); });
    tabRgb.addEventListener("click", (e) => { e.stopPropagation(); setColorTab("rgb"); });
    tabLevel.addEventListener("click", (e) => { e.stopPropagation(); setColorTab("level"); });

    M.bindPopupDismiss(M.colorPopup, panel, closeBtn, () => closeColorPopup(true));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && M.colorSession) closeColorPopup(false);
    });

    return M.colorPopup;
  }

  function setColorTab(tab) {
    if (!M.colorSession) return;
    M.colorSession.tab = tab;
    updateColorPopupUI();
  }

  function updateColorPopupUI() {
    if (!M.colorSession) return;
    const popup = ensureColorPopup();
    const sess = M.colorSession;
    const tabCount = (sess.hasCt ? 1 : 0) + (sess.hasRgb ? 1 : 0) + (sess.hasLevel ? 1 : 0);
    popup._tabsEl.hidden = tabCount < 2;
    popup._tabCt.hidden = !sess.hasCt;
    popup._tabRgb.hidden = !sess.hasRgb;
    popup._tabLevel.hidden = !sess.hasLevel;
    popup._tabCt.classList.toggle("active", sess.tab === "ct");
    popup._tabRgb.classList.toggle("active", sess.tab === "rgb");
    popup._tabLevel.classList.toggle("active", sess.tab === "level");
    popup._paneCt.hidden = sess.tab !== "ct";
    popup._paneRgb.hidden = sess.tab !== "rgb";
    popup._paneLevel.hidden = sess.tab !== "level";
    if (sess.tab === "ct") setCtVisual(sess.k);
    else if (sess.tab === "rgb") setRgbVisual(sess.h, sess.s);
    else setLevelVisual(sess.level);
  }

  function tileRecsFor(id) {
    const out = [];
    const roomRec = M.devMap.get(id);
    if (roomRec) out.push(roomRec);
    const favRec = M.favDevMap.get(id);
    if (favRec) out.push(favRec);
    return out;
  }

  function applyLevelChange(id, level) {
    setLevelVisual(level);
    for (const rec of tileRecsFor(id)) {
      rec.data.l = level;
      rec.data.s = level > 0 ? 1 : 0;
      rec.levelEl.textContent = formatFootText(rec.data, rec.isDim);
    }
  }

  function applyCtChange(id, k) {
    setCtVisual(k);
    for (const rec of tileRecsFor(id)) {
      rec.data.k = k;
      rec.levelEl.textContent = formatFootText(rec.data, rec.isDim);
    }
  }

  function applyRgbChange(id, h, s) {
    setRgbVisual(h, s);
    for (const rec of tileRecsFor(id)) {
      rec.data.h = h;
      rec.data.sat = s;
      rec.levelEl.textContent = formatFootText(rec.data, rec.isDim);
    }
  }

  function attachCtPresets(presetsEl) {
    presetsEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".ct-preset");
      if (!btn || !M.colorSession) return;
      e.stopPropagation();
      const k = Number(btn.dataset.k);
      M.colorSession.k = k;
      M.colorSession.changed = true;
      applyCtChange(M.colorSession.id, k);
      M.sendCmd(M.colorSession.id, "setCT", k);
      ensureLightOn(M.colorSession.id);
    });
  }

  function attachLevelPresets(presetsEl) {
    presetsEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".level-preset");
      if (!btn || !M.colorSession) return;
      e.stopPropagation();
      const level = Number(btn.dataset.l);
      M.colorSession.level = level;
      M.colorSession.changed = true;
      applyLevelChange(M.colorSession.id, level);
      M.setLevelOptimistic(M.colorSession.id, level);
      M.sendCmd(M.colorSession.id, "setLevel", level);
    });
  }

  function trackPctFromEvent(track, e) {
    const rect = track.getBoundingClientRect();
    const style = getComputedStyle(track);
    const thumbSize = parseFloat(style.getPropertyValue("--thumb-size"));
    const overhang = parseFloat(style.getPropertyValue("--thumb-overhang"));
    const size = Number.isFinite(thumbSize) && thumbSize > 0 ? thumbSize : 34;
    const hang = Number.isFinite(overhang) && overhang >= 0 ? overhang : 6;
    const inset = size / 2 - hang;
    const x = (e.clientX != null ? e.clientX : 0) - rect.left - inset;
    const travel = rect.width - 2 * inset;
    let pct = travel > 0 ? Math.round((x / travel) * 100) : 0;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    return pct;
  }

  function levelFromTrackEvent(track, e) {
    return trackPctFromEvent(track, e);
  }

  function updateLevelTrackVisual(track, thumbEl, dimEl, level) {
    const l = Math.max(0, Math.min(100, Math.round(level)));
    track.style.setProperty("--level", String(l));
    return l;
  }

  function bindLevelTrackDrag(track, opts) {
    const { canAdjust, levelFromEvent, onAdjust, onCommit, throttleMs = 0 } = opts;
    let lastCommit = 0;

    function adjust(e) {
      if (!canAdjust()) return;
      const level = levelFromEvent(e);
      onAdjust(level);
      if (onCommit && throttleMs > 0) {
        const now = Date.now();
        if (now - lastCommit > throttleMs) {
          lastCommit = now;
          onCommit(level);
        }
      }
      e.preventDefault();
    }

    function stop(e) {
      track.removeEventListener("pointermove", adjust);
      track.removeEventListener("pointerup", stop);
      track.removeEventListener("pointercancel", stop);
      try { if (e?.pointerId != null) track.releasePointerCapture(e.pointerId); } catch {}
      if (canAdjust() && onCommit) onCommit(levelFromEvent(e));
    }

    function start(e) {
      if (!canAdjust()) return;
      if (e.button != null && e.button !== 0) return;
      lastCommit = 0;
      adjust(e);
      try { track.setPointerCapture(e.pointerId); } catch {}
      track.addEventListener("pointermove", adjust);
      track.addEventListener("pointerup", stop);
      track.addEventListener("pointercancel", stop);
    }

    track.addEventListener("pointerdown", start);
  }

  function makeLevelTrackSlider({ value = 100, min = 1, max = 100, onChange }) {
    const track = ce("div", "level-track");
    const inner = ce("div", "level-track-inner");
    const dim = ce("div", "level-dim");
    const thumb = ce("div", "level-thumb");
    inner.appendChild(dim);
    track.appendChild(inner);
    track.appendChild(thumb);

    function clampLevel(level) {
      return Math.max(min, Math.min(max, Math.round(level)));
    }

    function setLevel(level) {
      const l = clampLevel(level);
      updateLevelTrackVisual(track, thumb, dim, l);
      return l;
    }

    setLevel(value);

    bindLevelTrackDrag(track, {
      canAdjust: () => true,
      levelFromEvent: (e) => clampLevel(levelFromTrackEvent(track, e)),
      onAdjust: (level) => { onChange(setLevel(level)); },
    });

    return { el: track, setValue: setLevel };
  }

  function updateCtTrackVisual(thumbEl, k) {
    const clamped = Math.max(CT_K_MIN, Math.min(CT_K_MAX, Math.round(k)));
    const pct = ((clamped - CT_K_MIN) / (CT_K_MAX - CT_K_MIN)) * 100;
    if (thumbEl) thumbEl.style.setProperty("--pct", String(pct));
    return clamped;
  }

  function bindCtTrackDrag(track, opts) {
    const { canAdjust, kFromEvent, onAdjust, onCommit, throttleMs = 0 } = opts;
    let lastCommit = 0;

    function adjust(e) {
      if (!canAdjust()) return;
      const k = kFromEvent(e);
      onAdjust(k);
      if (onCommit && throttleMs > 0) {
        const now = Date.now();
        if (now - lastCommit > throttleMs) {
          lastCommit = now;
          onCommit(k);
        }
      }
      e.preventDefault();
    }

    function stop(e) {
      track.removeEventListener("pointermove", adjust);
      track.removeEventListener("pointerup", stop);
      track.removeEventListener("pointercancel", stop);
      try { if (e?.pointerId != null) track.releasePointerCapture(e.pointerId); } catch {}
      if (canAdjust() && onCommit) onCommit(kFromEvent(e));
    }

    function start(e) {
      if (!canAdjust()) return;
      if (e.button != null && e.button !== 0) return;
      lastCommit = 0;
      adjust(e);
      try { track.setPointerCapture(e.pointerId); } catch {}
      track.addEventListener("pointermove", adjust);
      track.addEventListener("pointerup", stop);
      track.addEventListener("pointercancel", stop);
    }

    track.addEventListener("pointerdown", start);
  }

  function makeCtTrackSlider({ value = CT_K_DEFAULT, onChange }) {
    const track = ce("div", "ct-track");
    const thumb = ce("div", "ct-thumb");
    track.appendChild(thumb);

    function setK(k) {
      const clamped = updateCtTrackVisual(thumb, k);
      return clamped;
    }

    setK(value);

    bindCtTrackDrag(track, {
      canAdjust: () => true,
      kFromEvent: (e) => kFromEvent(track, e),
      onAdjust: (k) => { onChange(setK(k)); },
    });

    return { el: track, setValue: setK };
  }

  function attachLevelTrackDrag(track) {
    bindLevelTrackDrag(track, {
      canAdjust: () => M.colorSession && M.colorSession.tab === "level",
      levelFromEvent: (e) => levelFromTrackEvent(track, e),
      onAdjust: (level) => {
        M.colorSession.level = level;
        M.colorSession.changed = true;
        applyLevelChange(M.colorSession.id, level);
      },
      onCommit: (level) => {
        M.setLevelOptimistic(M.colorSession.id, level);
        M.sendCmd(M.colorSession.id, "setLevel", level);
      },
      throttleMs: 300,
    });
  }

  function attachRgbPresets(presetsEl) {
    presetsEl.addEventListener("click", (e) => {
      const sw = e.target.closest(".rgb-swatch");
      if (!sw || !M.colorSession) return;
      e.stopPropagation();
      const h = Number(sw.dataset.h);
      const s = Number(sw.dataset.s);
      M.colorSession.h = h;
      M.colorSession.s = s;
      M.colorSession.changed = true;
      applyRgbChange(M.colorSession.id, h, s);
      M.sendCmd(M.colorSession.id, "setColor", h + "," + s);
      ensureLightOn(M.colorSession.id);
    });
  }

  function attachRgbWheel(canvas, cursor) {
    let lastCommit = 0;
    const radius = RGB_WHEEL_SIZE / 2;

    function pick(e) {
      if (!M.colorSession || M.colorSession.tab !== "rgb") return;
      const rect = canvas.getBoundingClientRect();
      const scale = canvas.width / rect.width;
      const x = (e.clientX - rect.left) * scale;
      const y = (e.clientY - rect.top) * scale;
      const { h, s } = posToHs(radius, radius, x, y, radius - 2);
      M.colorSession.h = h;
      M.colorSession.s = s;
      M.colorSession.changed = true;
      applyRgbChange(M.colorSession.id, h, s);
      const now = Date.now();
      if (now - lastCommit > 300) {
        lastCommit = now;
        M.sendCmd(M.colorSession.id, "setColor", h + "," + s);
        ensureLightOn(M.colorSession.id);
      }
      e.preventDefault();
    }

    function stop(e) {
      canvas.removeEventListener("pointermove", pick);
      canvas.removeEventListener("pointerup", stop);
      canvas.removeEventListener("pointercancel", stop);
      try { if (e?.pointerId != null) canvas.releasePointerCapture(e.pointerId); } catch {}
      if (M.colorSession && M.colorSession.tab === "rgb") {
        M.sendCmd(M.colorSession.id, "setColor", M.colorSession.h + "," + M.colorSession.s);
      }
    }

    function start(e) {
      if (!M.colorSession || M.colorSession.tab !== "rgb") return;
      if (e.button != null && e.button !== 0) return;
      lastCommit = 0;
      pick(e);
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      canvas.addEventListener("pointermove", pick);
      canvas.addEventListener("pointerup", stop);
      canvas.addEventListener("pointercancel", stop);
    }

    canvas.addEventListener("pointerdown", start);
  }

  function ensureLightOn(id) {
    const dev = M.devices.find((d) => d.i === id);
    if (dev && !M.effectiveSwitch(dev)) {
      M.setSwitchOptimistic(id, 1);
      M.postCall("updateStates");
    }
  }

  function attachCtTrackDrag(track) {
    bindCtTrackDrag(track, {
      canAdjust: () => M.colorSession && M.colorSession.tab === "ct",
      kFromEvent: (e) => kFromEvent(track, e),
      onAdjust: (k) => {
        M.colorSession.k = k;
        M.colorSession.changed = true;
        applyCtChange(M.colorSession.id, k);
      },
      onCommit: (k) => {
        M.sendCmd(M.colorSession.id, "setCT", k);
        ensureLightOn(M.colorSession.id);
      },
      throttleMs: 300,
    });
  }

  function kToPct(k) {
    return ((k - CT_K_MIN) / (CT_K_MAX - CT_K_MIN)) * 100;
  }

  function pctToK(pct) {
    const k = Math.round(CT_K_MIN + (pct / 100) * (CT_K_MAX - CT_K_MIN));
    return Math.max(CT_K_MIN, Math.min(CT_K_MAX, k));
  }

  function kFromEvent(track, e) {
    return pctToK(trackPctFromEvent(track, e));
  }

  function setCtVisual(k) {
    const popup = ensureColorPopup();
    const pct = kToPct(k);
    popup._valueEl.textContent = k + "K";
    popup._thumbEl.style.setProperty("--pct", String(pct));
    popup.querySelectorAll(".ct-preset").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.k) === k);
    });
  }

  function setRgbVisual(h, s) {
    const popup = ensureColorPopup();
    popup._valueEl.textContent = hsToHex(h, s);
    const radius = RGB_WHEEL_SIZE / 2;
    const angle = (h / 100) * Math.PI * 2;
    const dist = (s / 100) * (radius - 8);
    const x = radius + Math.sin(angle) * dist;
    const y = radius - Math.cos(angle) * dist;
    popup._wheelCursor.style.left = x + "px";
    popup._wheelCursor.style.top = y + "px";
    popup._wheelCursor.style.background = hsToHex(h, s);
  }

  function setLevelVisual(level) {
    const popup = ensureColorPopup();
    const l = Math.max(0, Math.min(100, Math.round(level)));
    popup._valueEl.textContent = l + "%";
    updateLevelTrackVisual(popup._levelTrackEl, popup._levelThumbEl, popup._levelDimEl, l);
    popup.querySelectorAll(".level-preset").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.l) === l);
    });
  }

  function openColorPopup(id, anchorEl, dev) {
    M.cancelAllSlideGestures();
    closeColorPopup(false);
    const hasCt = !!dev.ct;
    const hasRgb = !!dev.rgb;
    const hasLevel = !!dev.d;
    let tab = "level";
    if (hasCt || hasRgb) {
      tab = "ct";
      if (hasRgb && !hasCt) tab = "rgb";
      else if (hasCt && hasRgb) {
        const cm = String(dev.cm || "").toUpperCase();
        tab = cm === "RGB" ? "rgb" : "ct";
      }
    }
    const k = dev.k != null ? Math.max(CT_K_MIN, Math.min(CT_K_MAX, Math.round(dev.k))) : CT_K_DEFAULT;
    const h = dev.h != null ? Math.max(0, Math.min(100, Math.round(dev.h))) : 0;
    const s = dev.sat != null ? Math.max(0, Math.min(100, Math.round(dev.sat))) : 100;
    const rawLevel = M.effectiveLevel(dev) ?? dev.l ?? 0;
    const level = Math.max(0, Math.min(100, Math.round(rawLevel)));
    M.colorSession = { id, anchorEl, tab, hasCt, hasRgb, hasLevel, k, h, s, level, changed: false };
    const popup = ensureColorPopup();
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    M.publishMld({ colorSession: M.colorSession, colorPopup: popup });
    updateColorPopupUI();
    if (tab !== "level") ensureLightOn(id);
  }

  function closeColorPopup(commit) {
    if (!M.colorSession) return;
    const { id, tab, k, h, s, level, changed } = M.colorSession;
    if (commit && changed) {
      const rec = M.devMap.get(id);
      if (tab === "ct") {
        M.sendCmd(id, "setCT", k);
        if (rec) { rec.data.k = k; rec.data.s = 1; M.postCall("updateStates"); }
      } else if (tab === "rgb") {
        M.sendCmd(id, "setColor", h + "," + s);
        if (rec) { rec.data.h = h; rec.data.sat = s; rec.data.s = 1; M.postCall("updateStates"); }
      } else if (tab === "level") {
        M.setLevelOptimistic(id, level);
        M.sendCmd(id, "setLevel", level);
        if (rec) {
          rec.data.l = level;
          rec.data.s = level > 0 ? 1 : 0;
          M.postCall("updateStates");
        }
      }
      M.postCall("reconcileDevice", id);
    }
    if (M.colorPopup) {
      M.colorPopup.setAttribute("hidden", "");
      M.colorPopup.classList.remove("open");
    }
    M.colorSession = null;
    M.publishMld({ colorSession: null, colorPopup: M.colorPopup });
  }

  function closeCtPopup(commit) { closeColorPopup(commit); }

  // =================== thermostat ===================

  function applyCentralTstatSelection(selectedIds) {
    if (!M.tstatSession?.central && !M.tstatSession?.roomGroup) return;
    const allIds = M.tstatSession.allIds || M.thermostats.map((t) => t.i);
    const ids = selectedIds.filter((id) => allIds.includes(id));
    M.tstatSession.ids = ids;
    if (M.tstatSession.central) {
      const selected = ids.map((id) => M.thermostats.find((t) => t.i === id)).filter(Boolean);
      M.tstatSession.centralTstat = M.buildCentralTstat(selected, M.tstatSession.unit);
    }
    updateTstatHeadExtras();
    renderTstatDial();
    renderTstatControls();
    syncCentralTstatTargetMenu();
  }

  function tstatTargetPickerEnabled() {
    return !!(M.tstatSession?.central || M.tstatSession?.roomGroup);
  }

  function updateCentralTstatTargetButton() {
    const btn = M.tstatPopup?._targetBtn;
    if (!btn) return;
    if (!tstatTargetPickerEnabled()) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    const labelEl = btn.querySelector(".tstat-target-btn-label");
    const allCount = (M.tstatSession.allIds || []).length;
    const selCount = M.tstatSession.ids.length;
    let label;
    if (selCount === 0) label = "No thermostats selected";
    else if (selCount === allCount) {
      label = M.tstatSession.roomGroup
        ? ("All in room (" + allCount + ")")
        : ("All thermostats (" + allCount + ")");
    } else if (selCount === 1) {
      const t = M.thermostats.find((x) => x.i === M.tstatSession.ids[0]);
      label = t?.n || "1 thermostat";
    } else label = selCount + " of " + allCount + " thermostats";
    if (labelEl) labelEl.textContent = label;
    btn.setAttribute("aria-label", "Choose thermostats to control: " + label);
  }

  function updateTstatHeadExtras() {
    updateCentralTstatTargetButton();
    const favBtn = M.tstatPopup?._favBtn;
    if (!favBtn || !M.tstatSession?.ids?.length) return;
    if (M.tstatSession.ids.length !== 1 || !M.isFavoriteableDeviceId(M.tstatSession.ids[0])) {
      favBtn.hidden = true;
      return;
    }
    favBtn.hidden = false;
    M.syncFavButton(favBtn, M.tstatSession.ids[0]);
  }

  function updateTstatFavButton() {
    updateTstatHeadExtras();
  }

  function ensureTstatPopup() {
    if (M.tstatPopup) return M.tstatPopup;
    M.tstatPopup = ce("div", "tstat-popup");
    M.tstatPopup.hidden = true;
    M.tstatPopup.setAttribute("role", "dialog");
    M.tstatPopup.setAttribute("aria-modal", "true");
    M.tstatPopup.setAttribute("aria-label", "Thermostat");

    const panel = ce("div", "tstat-panel");
    const head = ce("div", "tstat-head");
    const leading = ce("div", "tstat-head-leading");
    const title = ce("div", "tstat-title");
    const targetBtn = ce("button", "tstat-target-btn");
    targetBtn.type = "button";
    targetBtn.hidden = true;
    targetBtn.setAttribute("aria-haspopup", "listbox");
    targetBtn.setAttribute("aria-expanded", "false");
    const targetLabel = ce("span", "tstat-target-btn-label");
    const targetCaret = ce("span", "tstat-target-btn-caret");
    targetCaret.setAttribute("aria-hidden", "true");
    targetCaret.textContent = "▾";
    targetBtn.appendChild(targetLabel);
    targetBtn.appendChild(targetCaret);
    targetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      if (M.centralTstatTargetMenu) closeCentralTstatTargetMenu();
      else openCentralTstatTargetMenu(targetBtn);
    });
    const favBtn = ce("button", "tstat-fav");
    favBtn.type = "button";
    favBtn.innerHTML = FAVORITES_SVG;
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (M.tstatSession?.ids?.length !== 1) return;
      const id = M.tstatSession.ids[0];
      if (id == null || !M.isFavoriteableDeviceId(id)) return;
      hapticTap();
      M.postCall("toggleFavorite", id);
    });
    const closeBtn = ce("button", "tstat-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close thermostat");
    closeBtn.textContent = "×";
    leading.appendChild(title);
    leading.appendChild(targetBtn);
    leading.appendChild(favBtn);
    head.appendChild(leading); head.appendChild(closeBtn);

    const dialWrap = ce("div", "tstat-dial-wrap");
    const svg = svgEl("svg", { viewBox: `0 0 ${TSTAT_DIAL_SIZE} ${TSTAT_DIAL_SIZE}`, class: "tstat-dial" });
    const cx = TSTAT_DIAL_SIZE / 2, cy = TSTAT_DIAL_SIZE / 2;
    // static track
    svg.appendChild(svgEl("path", { class: "tstat-track", d: describeArc(cx, cy, TSTAT_DIAL_R, TSTAT_ANGLE_MIN, TSTAT_ANGLE_MAX) }));
    // tick marks
    const ticks = svgEl("g", { class: "tstat-ticks" });
    const unit = "F";
    const { min, max } = tstatRange(unit);
    for (let v = min; v <= max; v += 1) {
      const major = (v % 5 === 0);
      const a = valToAngle(v, unit);
      const inner = polar(cx, cy, TSTAT_DIAL_R - (major ? 14 : 8), a);
      const outer = polar(cx, cy, TSTAT_DIAL_R - 2, a);
      ticks.appendChild(svgEl("line", {
        x1: inner.x.toFixed(2), y1: inner.y.toFixed(2),
        x2: outer.x.toFixed(2), y2: outer.y.toFixed(2),
        class: major ? "tstat-tick major" : "tstat-tick"
      }));
    }
    svg.appendChild(ticks);
    const heatArc = svgEl("path", { class: "tstat-arc heat" });
    const coolArc = svgEl("path", { class: "tstat-arc cool" });
    svg.appendChild(heatArc); svg.appendChild(coolArc);
    const heatKnob = svgEl("circle", { class: "tstat-knob heat", r: 11 });
    const coolKnob = svgEl("circle", { class: "tstat-knob cool", r: 11 });
    svg.appendChild(heatKnob); svg.appendChild(coolKnob);

    const center = ce("div", "tstat-center");
    const curBlock = ce("div", "tstat-readout");
    const curLbl = ce("div", "tstat-readout-label");
    curLbl.textContent = "Currently:";
    const tempEl = ce("div", "tstat-temp");
    curBlock.appendChild(curLbl);
    curBlock.appendChild(tempEl);
    const spBlock = ce("div", "tstat-readout");
    const spLbl = ce("div", "tstat-readout-label");
    spLbl.textContent = "Setpoint:";
    const spEl = ce("div", "tstat-sp");
    spBlock.appendChild(spLbl);
    spBlock.appendChild(spEl);
    center.appendChild(curBlock);
    center.appendChild(spBlock);

    function dialStepPos(angleDeg) {
      const cx = TSTAT_DIAL_SIZE / 2, cy = TSTAT_DIAL_SIZE / 2;
      const outerR = TSTAT_DIAL_R + 30;
      const p = polar(cx, cy, outerR, angleDeg);
      const downNudge = 14;
      return {
        left: ((p.x / TSTAT_DIAL_SIZE) * 100).toFixed(2) + "%",
        top: (((p.y + downNudge) / TSTAT_DIAL_SIZE) * 100).toFixed(2) + "%",
      };
    }

    const minusBtn = ce("button", "tstat-step-btn tstat-step-minus");
    minusBtn.type = "button";
    minusBtn.textContent = "−";
    minusBtn.setAttribute("aria-label", "Decrease setpoint by 1 degree");
    const minusPos = dialStepPos(-132);
    minusBtn.style.left = minusPos.left;
    minusBtn.style.top = minusPos.top;
    let stepBusy = false;
    function onStep(delta, e) {
      e.stopPropagation();
      e.preventDefault();
      if (stepBusy) return;
      stepBusy = true;
      adjustTstatSetpoint(delta);
      setTimeout(() => { stepBusy = false; }, 300);
    }
    minusBtn.addEventListener("click", (e) => onStep(-1, e));
    minusBtn.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return;
      onStep(-1, e);
    });

    const plusBtn = ce("button", "tstat-step-btn tstat-step-plus");
    plusBtn.type = "button";
    plusBtn.textContent = "+";
    plusBtn.setAttribute("aria-label", "Increase setpoint by 1 degree");
    const plusPos = dialStepPos(132);
    plusBtn.style.left = plusPos.left;
    plusBtn.style.top = plusPos.top;
    plusBtn.addEventListener("click", (e) => onStep(1, e));
    plusBtn.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return;
      onStep(1, e);
    });

    dialWrap.appendChild(svg);
    dialWrap.appendChild(minusBtn);
    dialWrap.appendChild(plusBtn);
    dialWrap.appendChild(center);
    attachTstatDialDrag(svg);

    const chips = ce("div", "tstat-chips");
    const heatChip = ce("button", "tstat-chip heat"); heatChip.type = "button"; heatChip.textContent = "Heat";
    heatChip.addEventListener("click", (e) => { e.stopPropagation(); if (M.tstatSession) { M.tstatSession.edit = "heat"; renderTstatDial(); } });
    const coolChip = ce("button", "tstat-chip cool"); coolChip.type = "button"; coolChip.textContent = "Cool";
    coolChip.addEventListener("click", (e) => { e.stopPropagation(); if (M.tstatSession) { M.tstatSession.edit = "cool"; renderTstatDial(); } });
    chips.appendChild(heatChip); chips.appendChild(coolChip);

    const modeSection = ce("div", "tstat-section");
    modeSection.appendChild(M.tstatSectionLabel("Thermostat mode"));
    const modes = ce("div", "tstat-modes");
    modeSection.appendChild(modes);

    const fanModeSection = ce("div", "tstat-section");
    fanModeSection.appendChild(M.tstatSectionLabel("Fan mode"));
    const fanModes = ce("div", "tstat-modes");
    const fanModeBtns = {};
    for (const fm of FAN_MODE_OPTS) {
      const b = ce("button", "tstat-mode");
      b.type = "button";
      b.textContent = fm.label;
      b.dataset.fanKey = fm.key;
      b.setAttribute("aria-label", fm.aria);
      b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); setFanMode(fm.key); });
      fanModes.appendChild(b);
      fanModeBtns[fm.key] = b;
    }
    fanModeSection.appendChild(fanModes);

    const fanSpeedSection = ce("div", "tstat-section");
    fanSpeedSection.appendChild(M.tstatSectionLabel("Fan speed"));
    const fanSpeeds = ce("div", "tstat-modes");
    const fanSpeedBtns = {};
    for (const lv of FAN_SPEED_OPTS) {
      const b = ce("button", "tstat-mode");
      b.type = "button";
      b.textContent = lv.label;
      b.dataset.speedKey = lv.key;
      b.setAttribute("aria-label", lv.aria);
      b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); setFanSpeed(lv.key); });
      fanSpeeds.appendChild(b);
      fanSpeedBtns[lv.key] = b;
    }
    fanSpeedSection.appendChild(fanSpeeds);

    panel.appendChild(head);
    panel.appendChild(dialWrap);
    panel.appendChild(chips);
    panel.appendChild(modeSection);
    panel.appendChild(fanModeSection);
    panel.appendChild(fanSpeedSection);
    M.tstatPopup.appendChild(panel);
    M.appendPopup(M.tstatPopup);

    M.bindPopupDismiss(M.tstatPopup, panel, closeBtn, closeTstatPopup);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !M.tstatSession) return;
      if (M.centralTstatTargetMenu) { closeCentralTstatTargetMenu(); return; }
      closeTstatPopup();
    });

    M.tstatPopup._panel = panel;
    M.tstatPopup._title = title;
    M.tstatPopup._targetBtn = targetBtn;
    M.tstatPopup._favBtn = favBtn;
    M.tstatPopup._svg = svg;
    M.tstatPopup._heatArc = heatArc;
    M.tstatPopup._coolArc = coolArc;
    M.tstatPopup._heatKnob = heatKnob;
    M.tstatPopup._coolKnob = coolKnob;
    M.tstatPopup._tempEl = tempEl;
    M.tstatPopup._spEl = spEl;
    M.tstatPopup._minusBtn = minusBtn;
    M.tstatPopup._plusBtn = plusBtn;
    M.tstatPopup._chips = chips;
    M.tstatPopup._heatChip = heatChip;
    M.tstatPopup._coolChip = coolChip;
    M.tstatPopup._modeSection = modeSection;
    M.tstatPopup._modes = modes;
    M.tstatPopup._modeBtns = {};
    M.tstatPopup._fanModeSection = fanModeSection;
    M.tstatPopup._fanModes = fanModes;
    M.tstatPopup._fanModeBtns = fanModeBtns;
    M.tstatPopup._fanSpeedSection = fanSpeedSection;
    M.tstatPopup._fanSpeeds = fanSpeeds;
    M.tstatPopup._fanSpeedBtns = fanSpeedBtns;
    M.publishMld({ tstatPopup: M.tstatPopup });
    return M.tstatPopup;
  }

  function activeTstat() {
    if (!M.tstatSession) return null;
    // Mode/fan caps always come from one real device when exactly one is selected.
    if (M.tstatSession.ids?.length === 1) {
      return M.thermostats.find((x) => x.i === M.tstatSession.ids[0]) || null;
    }
    if (M.tstatSession.central) return M.tstatSession.centralTstat;
    if (!M.tstatSession.ids?.length) return null;
    return M.thermostats.find((x) => x.i === M.tstatSession.ids[0]) || null;
  }

  function tstatSetpointTarget(t) {
    if (!t || !M.tstatSession) return null;
    const tm = String(t.tm || "").toLowerCase();
    if (M.tstatSession?.central && !tm) return null;
    if (tm === "off") return null;
    return (M.tstatSession.edit === "cool" && tm === "auto") || tm === "cool" ? "cool" : "heat";
  }

  async function commitTstatSetpoint(ids, target, val, { haptic = true } = {}) {
    const patch = target === "heat" ? { hsp: val } : { csp: val };
    const cmd = target === "heat" ? "setHeat" : "setCool";
    for (const id of ids) M.setSetpointOptimistic(id, patch);
    if (haptic) hapticTap();
    renderTstatDial();
    updateClimateWidgets();
    refreshOpenTstatQuickPopups();
    const results = await Promise.all(ids.map((id) => M.sendCmd(id, cmd, val)));
    if (results.some((r) => !r?.ok)) {
      for (const id of ids) M.clearSetpointOptimistic(id);
      renderTstatDial();
      updateClimateWidgets();
      refreshOpenTstatQuickPopups();
      for (const id of ids) reconcileTstat(id);
      return false;
    }
    for (const id of ids) reconcileTstat(id);
    return true;
  }

  function adjustTstatSetpoint(delta) {
    if (!M.tstatSession?.ids?.length) return;
    const t = activeTstat();
    if (!t) return;
    const target = tstatSetpointTarget(t);
    if (!target) return;
    const unit = M.tstatSession.unit;
    const field = target === "heat" ? "hsp" : "csp";
    const cur = Number(t[field]);
    const base = Number.isFinite(cur) ? cur : (target === "heat" ? 70 : 74);
    const val = clampSetpoint(base + delta, unit);
    if (M.tstatSession.central) t[field] = val;
    commitTstatSetpoint(M.tstatSession.ids, target, val);
  }

  function renderTstatDial() {
    if (!M.tstatSession) return;
    const popup = ensureTstatPopup();
    const t = activeTstat();
    if (!t) return;
    const unit = M.tstatSession.unit;
    const cx = TSTAT_DIAL_SIZE / 2, cy = TSTAT_DIAL_SIZE / 2;
    const tm = String(t.tm || "").toLowerCase();
    const deg = tstatTempSuffix(unit);
    const tempVal = t.temp != null ? Math.round(Number(t.temp)) : null;

    popup._tempEl.textContent = tempVal != null ? (tempVal + deg) : "—";
    if (tstatTargetPickerEnabled() && M.tstatSession.ids?.length !== 1) {
      popup._title.textContent = (M.tstatSession.ids?.length || 0) + " thermostats";
    } else {
      popup._title.textContent = t.n || "Thermostat";
    }

    const showHeat = (tm === "heat" || tm === "auto" || tm === "emergency heat");
    const showCool = (tm === "cool" || tm === "auto");
    const editHeat = M.tstatSession.edit === "heat" || tm === "heat" || tm === "emergency heat";

    const hsp = t.hsp != null ? Number(t.hsp) : null;
    const csp = t.csp != null ? Number(t.csp) : null;

    // heat arc
    if (showHeat && hsp != null) {
      popup._heatArc.setAttribute("d", describeArc(cx, cy, TSTAT_DIAL_R, TSTAT_ANGLE_MIN, valToAngle(hsp, unit)));
      const kp = polar(cx, cy, TSTAT_DIAL_R, valToAngle(hsp, unit));
      popup._heatKnob.setAttribute("cx", kp.x.toFixed(2));
      popup._heatKnob.setAttribute("cy", kp.y.toFixed(2));
      popup._heatKnob.setAttribute("data-active", editHeat ? "1" : "0");
    } else {
      popup._heatArc.setAttribute("d", "");
      popup._heatKnob.setAttribute("cx", -100);
    }
    // cool arc
    if (showCool && csp != null) {
      popup._coolArc.setAttribute("d", describeArc(cx, cy, TSTAT_DIAL_R, TSTAT_ANGLE_MIN, valToAngle(csp, unit)));
      const kp = polar(cx, cy, TSTAT_DIAL_R, valToAngle(csp, unit));
      popup._coolKnob.setAttribute("cx", kp.x.toFixed(2));
      popup._coolKnob.setAttribute("cy", kp.y.toFixed(2));
      popup._coolKnob.setAttribute("data-active", !editHeat ? "1" : "0");
    } else {
      popup._coolArc.setAttribute("d", "");
      popup._coolKnob.setAttribute("cx", -100);
    }

    // setpoint readout
    let spText;
    if (tm === "off") spText = "Off";
    else if (tm === "heat" || tm === "emergency heat") spText = hsp != null ? hsp + deg : "—";
    else if (tm === "cool") spText = csp != null ? csp + deg : "—";
    else if (tm === "auto") spText = (editHeat ? hsp : csp) != null ? (editHeat ? hsp : csp) + deg : "—";
    else spText = "—";
    popup._spEl.textContent = spText;

    // chips only in auto
    popup._chips.style.display = (tm === "auto") ? "" : "none";
    popup._heatChip.classList.toggle("active", editHeat);
    popup._coolChip.classList.toggle("active", !editHeat);

    // disabled look when off or none selected for bulk
    const noneSelected = !!(tstatTargetPickerEnabled() && !M.tstatSession.ids?.length);
    popup._svg.classList.toggle("disabled", tm === "off" || noneSelected);
    const noMode = !!(tstatTargetPickerEnabled() && M.tstatSession.ids?.length !== 1);
    const canAdjust = tm !== "off" && !noMode && !noneSelected;
    if (popup._minusBtn) popup._minusBtn.disabled = !canAdjust;
    if (popup._plusBtn) popup._plusBtn.disabled = !canAdjust;
  }

  function renderTstatModeButtons(popup, supported, tm, noneSelected) {
    const modes = popup._modes;
    modes.replaceChildren();
    popup._modeBtns = {};
    for (const key of supported) {
      const k = String(key).toLowerCase();
      const b = ce("button", "tstat-mode");
      if (k === "off") b.classList.add("off");
      b.type = "button";
      b.dataset.modeKey = k;
      if (k === "off") {
        b.setAttribute("aria-label", "Turn thermostat off");
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9"/><path d="M7.5 5.5a7 7 0 1 0 9 0"/></svg>';
        b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); setTstatMode("off", "off"); });
      } else {
        const def = TSTAT_MODE_DEFS.find((m) => m.key === k);
        const { cmd } = modeCmdForKey(k);
        const label = def ? def.label : tstatModeDisplayLabel(k);
        b.textContent = label;
        b.setAttribute("aria-label", "Set thermostat to " + label);
        b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); setTstatMode(cmd, k); });
      }
      b.classList.toggle("active", tm === k);
      b.disabled = noneSelected;
      modes.appendChild(b);
      popup._modeBtns[k] = b;
    }
  }

  function renderTstatControls() {
    if (!M.tstatSession) return;
    const popup = ensureTstatPopup();
    const t = activeTstat();
    if (!t) return;
    const noneSelected = !!(tstatTargetPickerEnabled() && !M.tstatSession.ids?.length);
    // Multi-select bulk sessions must not invent a combined mode list — only show
    // mode/fan controls when a single thermostat is the target.
    const singleTarget = M.tstatSession.ids?.length === 1;
    if (tstatTargetPickerEnabled() && !singleTarget) {
      popup._modeSection.style.display = "none";
      popup._fanModeSection.style.display = "none";
      popup._fanSpeedSection.style.display = "none";
      return;
    }
    const supM = M.supportedModes(t);
    const tm = String(t.tm || "").toLowerCase();
    renderTstatModeButtons(popup, supM, tm, noneSelected);
    popup._modeSection.style.display = supM.length ? "" : "none";

    if (t.hasFm) {
      const supported = M.supportedFanModes(t);
      const fmVal = String(t.fm || "").toLowerCase();
      let fanCount = 0;
      for (const [key, btn] of Object.entries(popup._fanModeBtns)) {
        const show = supported.includes(key);
        btn.hidden = !show;
        if (show) fanCount++;
        btn.classList.toggle("active", fmVal === key);
        btn.disabled = noneSelected;
      }
      popup._fanModeSection.style.display = fanCount ? "" : "none";
    } else {
      popup._fanModeSection.style.display = "none";
    }

    if (M.showFanSpeedControls(t)) {
      const levels = M.supportedFanSpeeds(t);
      const fsVal = String(t.fs || "").toLowerCase();
      let speedCount = 0;
      for (const [key, btn] of Object.entries(popup._fanSpeedBtns)) {
        const show = levels.includes(key);
        btn.hidden = !show;
        if (show) speedCount++;
        btn.classList.toggle("active", fsVal === key);
        btn.disabled = noneSelected;
      }
      popup._fanSpeedSection.style.display = speedCount ? "" : "none";
    } else {
      popup._fanSpeedSection.style.display = "none";
    }
  }

  function attachTstatDialDrag(svg) {
    let dragging = false;
    let lastCommit = 0;

    function angleFromEvent(e) {
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const px = e.clientX != null ? e.clientX : 0;
      const py = e.clientY != null ? e.clientY : 0;
      let a = Math.atan2(px - cx, cy - py) * 180 / Math.PI; // 0 at top, clockwise
      // normalize to [-180,180]; clamp to dial range
      if (a < TSTAT_ANGLE_MIN) a = TSTAT_ANGLE_MIN;
      if (a > TSTAT_ANGLE_MAX) a = TSTAT_ANGLE_MAX;
      return a;
    }

    function apply(e) {
      const t = activeTstat();
      if (!t || !M.tstatSession || !M.tstatSession.ids?.length) return;
      const unit = M.tstatSession.unit;
      const tm = String(t.tm || "").toLowerCase();
      if (tm === "off") return;
      const val = angleToVal(angleFromEvent(e), unit);
      const editing = (M.tstatSession.edit === "cool" && tm === "auto") || tm === "cool" ? "cool" : "heat";
      const patch = editing === "heat" ? { hsp: clampSetpoint(val, unit) } : { csp: clampSetpoint(val, unit) };
      if (editing === "heat") t.hsp = patch.hsp;
      else t.csp = patch.csp;
      for (const id of M.tstatSession.ids) M.setSetpointOptimistic(id, patch);
      renderTstatDial();
      const now = Date.now();
      if (now - lastCommit > 300) {
        lastCommit = now;
        const cmd = editing === "heat" ? "setHeat" : "setCool";
        const sendVal = editing === "heat" ? patch.hsp : patch.csp;
        for (const id of M.tstatSession.ids) M.sendCmd(id, cmd, sendVal);
      }
      e.preventDefault();
    }

    function end() {
      dragging = false;
      svg.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      const t = activeTstat();
      if (t && M.tstatSession) {
        const tm = String(t.tm || "").toLowerCase();
        if (tm !== "off") {
          const editing = (M.tstatSession.edit === "cool" && tm === "auto") || tm === "cool" ? "cool" : "heat";
          const val = editing === "heat" ? t.hsp : t.csp;
          commitTstatSetpoint(M.tstatSession.ids, editing, val, { haptic: false });
        }
      }
    }
    function move(e) { if (dragging) apply(e); }
    function start(e) {
      const t = activeTstat();
      if (!t || !M.tstatSession || !M.tstatSession.ids?.length) return;
      if (String(t.tm || "").toLowerCase() === "off") return;
      if (M.tstatSession?.central && !String(t.tm || "")) return;
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      svg.classList.add("dragging");
      lastCommit = 0;
      apply(e);
      try { svg.setPointerCapture(e.pointerId); } catch {}
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", end, { passive: false });
      window.addEventListener("pointercancel", end, { passive: false });
    }
    svg.addEventListener("pointerdown", start);
  }

  function tstatModeLocked(id) {
    const devLock = M.tstatDeviceModeLock.get(Number(id));
    if (devLock?.until > Date.now()) return true;
    return !!(M.tstatSession?.modeLockUntil > Date.now() && M.tstatSession.ids?.includes(Number(id)));
  }

  function reapplyTstatDeviceModeLocks() {
    const now = Date.now();
    for (const [id, lock] of M.tstatDeviceModeLock) {
      if (lock.until <= now) {
        M.tstatDeviceModeLock.delete(id);
        continue;
      }
      const t = M.thermostats.find(x => x.i === id);
      if (t) t.tm = lock.mode;
    }
  }

  function tstatModeDisplayLabel(tm) {
    const m = String(tm || "").toLowerCase();
    if (m === "heat" || m === "emergency heat") return "Heat";
    if (m === "cool") return "Cool";
    if (m === "auto") return "Auto";
    if (m === "off") return "Off";
    return tm || "—";
  }

  function favoriteTstatTarget(t) {
    const tm = String(t?.tm || "").toLowerCase();
    if (tm === "off") return null;
    if (tm === "cool") return "cool";
    if (tm === "heat" || tm === "emergency heat") return "heat";
    if (tm === "auto") {
      const os = String(t?.os || "").toLowerCase();
      if (os === "cooling" || os === "pending cool") return "cool";
      return "heat";
    }
    return "heat";
  }

  function favoriteTstatTemps(t) {
    const unit = normalizeTstatUnit(t.u);
    const deg = "°" + unit;
    const current = t.temp != null ? Math.round(t.temp) + deg : "—";
    const tm = String(t?.tm || "").toLowerCase();
    if (tm === "off") return { current, setpoint: "Off", tone: "off" };
    const target = favoriteTstatTarget(t);
    if (!target) return { current, setpoint: "—", tone: "off" };
    const sp = target === "heat" ? t.hsp : t.csp;
    const setpoint = sp != null ? Math.round(Number(sp)) + deg : "—";
    return { current, setpoint, tone: target };
  }

  function favoriteTstatState(t) {
    const unit = normalizeTstatUnit(t.u);
    const deg = "°" + unit;
    const tm = String(t?.tm || "").toLowerCase();
    const os = String(t?.os || "").toLowerCase();
    const current = t.temp != null ? Math.round(t.temp) + deg : "—";
    if (tm === "off") return { label: "Off · now " + current, active: false };
    if (os === "heating" || os === "pending heat") return { label: "Heating · now " + current, active: true };
    if (os === "cooling" || os === "pending cool") return { label: "Cooling · now " + current, active: true };
    if (os === "fan" || os === "fan only") return { label: "Fan · now " + current, active: true };
    return { label: "Now " + current, active: false };
  }

  function modeCmdForKey(key) {
    const k = String(key).toLowerCase();
    const def = TSTAT_MODE_DEFS.find(m => m.key === k);
    if (def) return { cmd: def.cmd, key: k };
    if (k === "off") return { cmd: "off", key: k };
    return { cmd: "setMode", key: k };
  }

  function applyTstatModeOptimistic(ids, key) {
    for (const id of ids) {
      const t = M.thermostats.find(x => x.i === id);
      if (!t) continue;
      t.tm = key;
      if (key === "heat") t.os = "heating";
      else if (key === "cool") t.os = "cooling";
      else if (key === "off") t.os = "idle";
      else if (key === "auto") t.os = "idle";
      M.tstatDeviceModeLock.set(id, { until: Date.now() + 4000, mode: key });
    }
    refreshOpenTstatQuickPopups();
  }

  function sendTstatModeCmd(id, cmd, key) {
    if (cmd === "setMode") return M.sendCmd(id, cmd, key);
    return M.sendCmd(id, cmd);
  }

  function adjustFavoriteTstat(id, delta) {
    const t = M.thermostats.find(x => x.i === id);
    if (!t) return;
    const target = favoriteTstatTarget(t);
    if (!target) return;
    const unit = normalizeTstatUnit(t.u);
    const field = target === "heat" ? "hsp" : "csp";
    const cur = Number(t[field]);
    const base = Number.isFinite(cur) ? cur : (target === "heat" ? 70 : 74);
    const val = clampSetpoint(base + delta, unit);
    commitTstatSetpoint([id], target, val);
  }

  function refreshOpenTstatQuickPopups() {
    M.postCall("refreshFavoritesPopup");
    M.postCall("refreshThermostatsPopup");
  }

  function closeFavoriteTstatModeMenu() {
    if (M.favTstatModeMenuCleanup) {
      M.favTstatModeMenuCleanup();
      M.favTstatModeMenuCleanup = null;
    }
    if (M.favTstatModeMenu) {
      M.favTstatModeMenu.remove();
      M.favTstatModeMenu = null;
    }
    M.favTstatModeMenuId = null;
    M.favTstatModeMenuAnchor = null;
  }

  function repositionFavoriteTstatModeMenu() {
    const menu = M.favTstatModeMenu;
    if (!menu) return;
    let anchorBtn = M.favTstatModeMenuAnchor;
    if (!anchorBtn?.isConnected && M.favTstatModeMenuId != null) {
      anchorBtn = M.favTstatMap.get(M.favTstatModeMenuId)?.modeBtn
        || M.tstatsPopupMap.get(M.favTstatModeMenuId)?.modeBtn || null;
      M.favTstatModeMenuAnchor = anchorBtn;
    }
    if (!anchorBtn) return;
    const rect = anchorBtn.getBoundingClientRect();
    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    let top = rect.top - menuH - 6;
    if (top < 8) top = rect.bottom + 6;
    let left = rect.left + rect.width / 2 - menuW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    menu.style.top = top + "px";
    menu.style.left = left + "px";
  }

  function syncFavoriteTstatModeMenu(t) {
    if (!M.favTstatModeMenu) return;
    const current = String(t?.tm || "").toLowerCase();
    for (const b of M.favTstatModeMenu.querySelectorAll(".quick-fav-mode-opt")) {
      const key = b.dataset.modeKey;
      const active = key === current;
      b.classList.toggle("active", active);
      if (active) b.setAttribute("aria-selected", "true");
      else b.removeAttribute("aria-selected");
    }
  }

  function applyFavoriteTstatMode(id, key) {
    const { cmd } = modeCmdForKey(key);
    hapticTap();
    closeFavoriteTstatModeMenu();
    applyTstatModeOptimistic([id], key);
    if (M.tstatSession?.ids?.includes(id)) {
      M.tstatSession.modeLockUntil = Date.now() + 4000;
      M.tstatSession.lockedMode = key;
      renderTstatDial();
      renderTstatControls();
    }
    updateClimateWidgets();
    sendTstatModeCmd(id, cmd, key);
    reconcileTstat(id);
  }

  function openFavoriteTstatModeMenu(anchorBtn, tstatId) {
    closeFavoriteTstatModeMenu();
    const t = M.thermostats.find(x => x.i === tstatId);
    if (!t) return;
    const modes = M.supportedModes(t);
    if (!modes.length) return;

    const menu = ce("div", "quick-fav-mode-menu");
    menu.setAttribute("role", "listbox");
    const current = String(t.tm || "").toLowerCase();

    for (const m of modes) {
      const key = String(m).toLowerCase();
      const b = ce("button", "tstat-mode quick-fav-mode-opt");
      if (key === "off") b.classList.add("off");
      b.type = "button";
      b.setAttribute("role", "option");
      b.dataset.modeKey = key;
      b.textContent = tstatModeDisplayLabel(key);
      if (key === current) {
        b.classList.add("active");
        b.setAttribute("aria-selected", "true");
      }
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (key === current) { closeFavoriteTstatModeMenu(); return; }
        applyFavoriteTstatMode(tstatId, key);
      });
      menu.appendChild(b);
    }

    document.body.appendChild(menu);
    M.favTstatModeMenu = menu;
    M.favTstatModeMenuId = tstatId;
    M.favTstatModeMenuAnchor = anchorBtn;

    repositionFavoriteTstatModeMenu();

    anchorBtn.setAttribute("aria-expanded", "true");

    const onOutside = (e) => {
      if (menu.contains(e.target) || anchorBtn.contains(e.target)) return;
      closeFavoriteTstatModeMenu();
    };
    const onKey = (e) => {
      if (e.key === "Escape") closeFavoriteTstatModeMenu();
    };
    setTimeout(() => {
      document.addEventListener("click", onOutside);
      document.addEventListener("keydown", onKey);
    }, 0);

    M.favTstatModeMenuCleanup = () => {
      document.removeEventListener("click", onOutside);
      document.removeEventListener("keydown", onKey);
      anchorBtn.setAttribute("aria-expanded", "false");
      M.favTstatModeMenuAnchor = null;
    };
  }

  function closeCentralTstatTargetMenu() {
    if (M.centralTstatTargetMenuCleanup) {
      M.centralTstatTargetMenuCleanup();
      M.centralTstatTargetMenuCleanup = null;
    }
    if (M.centralTstatTargetMenu) {
      M.centralTstatTargetMenu.remove();
      M.centralTstatTargetMenu = null;
    }
    M.centralTstatTargetMenuAnchor = null;
  }

  function repositionCentralTstatTargetMenu() {
    const menu = M.centralTstatTargetMenu;
    const anchorBtn = M.centralTstatTargetMenuAnchor;
    if (!menu || !anchorBtn?.isConnected) return;
    const rect = anchorBtn.getBoundingClientRect();
    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    let top = rect.bottom + 6;
    if (top + menuH > window.innerHeight - 8) top = rect.top - menuH - 6;
    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    menu.style.top = top + "px";
    menu.style.left = left + "px";
  }

  function syncCentralTstatTargetMenu() {
    if (!M.centralTstatTargetMenu || !tstatTargetPickerEnabled()) return;
    const allIds = M.tstatSession.allIds || [];
    const selectedSet = new Set(M.tstatSession.ids);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedSet.has(id));
    const selectAllBtn = M.centralTstatTargetMenu.querySelector(".tstat-target-all");
    if (selectAllBtn) {
      selectAllBtn.classList.toggle("active", allSelected);
      selectAllBtn.setAttribute("aria-selected", allSelected ? "true" : "false");
    }
    for (const b of M.centralTstatTargetMenu.querySelectorAll(".tstat-target-opt:not(.tstat-target-all)")) {
      const id = Number(b.dataset.tstatId);
      const on = selectedSet.has(id);
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-selected", "true");
      else b.removeAttribute("aria-selected");
    }
  }

  function openCentralTstatTargetMenu(anchorBtn) {
    closeCentralTstatTargetMenu();
    if (!tstatTargetPickerEnabled()) return;

    const menu = ce("div", "tstat-target-menu");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-multiselectable", "true");

    const allIds = M.tstatSession.allIds || M.thermostats.map((t) => t.i);
    const selectedSet = new Set(M.tstatSession.ids);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedSet.has(id));

    const selectAllBtn = ce("button", "tstat-target-opt tstat-target-all");
    selectAllBtn.type = "button";
    selectAllBtn.setAttribute("role", "option");
    const selectAllCheck = ce("span", "tstat-target-check");
    const selectAllInfo = ce("span", "tstat-target-info");
    const selectAllName = ce("span", "tstat-target-name");
    selectAllName.textContent = "Select all";
    selectAllInfo.appendChild(selectAllName);
    selectAllBtn.appendChild(selectAllCheck);
    selectAllBtn.appendChild(selectAllInfo);
    if (allSelected) {
      selectAllBtn.classList.add("active");
      selectAllBtn.setAttribute("aria-selected", "true");
    }
    selectAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      const currentSelected = new Set(M.tstatSession.ids);
      const currentlyAll = allIds.length > 0 && allIds.every((id) => currentSelected.has(id));
      applyCentralTstatSelection(currentlyAll ? [] : allIds.slice());
    });
    menu.appendChild(selectAllBtn);

    const pool = M.tstatSession.roomGroup
      ? allIds.map((id) => M.thermostats.find((t) => t.i === id)).filter(Boolean)
      : M.centralThermostatsSorted();
    for (const t of pool) {
      const b = ce("button", "tstat-target-opt");
      b.type = "button";
      b.setAttribute("role", "option");
      b.dataset.tstatId = String(t.i);
      const check = ce("span", "tstat-target-check");
      const info = ce("span", "tstat-target-info");
      const name = ce("span", "tstat-target-name");
      name.textContent = t.n || ("Thermostat " + t.i);
      const room = ce("span", "tstat-target-room");
      room.textContent = M.postCall("roomLabel", t.r) || String(t.r ?? "");
      info.appendChild(name);
      info.appendChild(room);
      b.appendChild(check);
      b.appendChild(info);
      if (selectedSet.has(t.i)) {
        b.classList.add("active");
        b.setAttribute("aria-selected", "true");
      }
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        hapticTap();
        const next = new Set(M.tstatSession.ids);
        if (next.has(t.i)) next.delete(t.i);
        else next.add(t.i);
        applyCentralTstatSelection([...next]);
      });
      menu.appendChild(b);
    }

    document.body.appendChild(menu);
    M.centralTstatTargetMenu = menu;
    M.centralTstatTargetMenuAnchor = anchorBtn;
    repositionCentralTstatTargetMenu();
    anchorBtn.setAttribute("aria-expanded", "true");

    const onOutside = (e) => {
      if (menu.contains(e.target) || anchorBtn.contains(e.target)) return;
      closeCentralTstatTargetMenu();
    };
    const onKey = (e) => {
      if (e.key === "Escape") closeCentralTstatTargetMenu();
    };
    setTimeout(() => {
      document.addEventListener("click", onOutside);
      document.addEventListener("keydown", onKey);
    }, 0);

    M.centralTstatTargetMenuCleanup = () => {
      document.removeEventListener("click", onOutside);
      document.removeEventListener("keydown", onKey);
      anchorBtn.setAttribute("aria-expanded", "false");
      M.centralTstatTargetMenuAnchor = null;
    };
  }

  function setTstatMode(cmd, key) {
    if (!M.tstatSession || !M.tstatSession.ids?.length) return;
    const ids = M.tstatSession.ids;
    applyTstatModeOptimistic(ids, key);
    if (M.tstatSession.central) {
      const ct = M.tstatSession.centralTstat;
      ct.tm = key;
      if (ct.hsp == null) {
        const ref = M.thermostats.find(x => x.hsp != null);
        ct.hsp = ref ? Number(ref.hsp) : 70;
      }
      if (ct.csp == null) {
        const ref = M.thermostats.find(x => x.csp != null);
        ct.csp = ref ? Number(ref.csp) : 74;
      }
      M.tstatSession.edit = key === "cool" ? "cool" : "heat";
    }
    M.tstatSession.modeLockUntil = Date.now() + 4000;
    M.tstatSession.lockedMode = key;
    renderTstatDial(); renderTstatControls(); updateClimateWidgets();
    for (const id of ids) sendTstatModeCmd(id, cmd, key);
    for (const id of ids) reconcileTstat(id);
  }

  function setFanMode(fm) {
    if (!M.tstatSession || !M.tstatSession.ids?.length) return;
    const ids = M.tstatSession.ids;
    for (const id of ids) {
      for (const t of M.thermostats) {
        if (t.i !== id || !t.hasFm) continue;
        t.fm = fm;
        if (fm !== "on") continue;
        if (!t.fs && M.deviceHasFanSpeed(t)) {
          const levels = M.supportedFanSpeeds(t);
          t.fs = levels.includes("medium") ? "medium" : levels[0] || "medium";
        }
      }
    }
    renderTstatControls(); updateClimateWidgets();
    for (const id of ids) M.sendCmd(id, "setFanMode", fm);
    if (M.tstatSession.central) M.tstatSession.centralTstat.fm = fm;
    if (fm === "on") {
      for (const id of ids) {
        const t = M.thermostats.find((x) => x.i === id);
        if (t?.fs) M.sendCmd(id, "setFanSpeed", t.fs);
      }
    }
  }

  function setFanSpeed(lv) {
    if (!M.tstatSession || !M.tstatSession.ids?.length) return;
    const ids = M.tstatSession.ids;
    for (const id of ids) for (const t of M.thermostats) if (t.i === id && M.deviceHasFanSpeed(t)) t.fs = lv;
    renderTstatControls();
    if (M.tstatSession.central) M.tstatSession.centralTstat.fs = lv;
    for (const id of ids) M.sendCmd(id, "setFanSpeed", lv);
  }

  function positionTstatPopup(anchorEl) {
    const popup = ensureTstatPopup();
    const panel = popup._panel;
    // Centered on screen; size is handled by CSS (responsive).
    panel.style.width = "";
    panel.style.left = "";
    panel.style.top = "";
  }

  function openCentralTstatPopup() {
    M.cancelAllSlideGestures();
    closeTstatPopup();
    if (M.colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    closeFanMasterPopup();
    closeShadeMasterPopup();
    if (!M.thermostats.length) return;
    const ids = M.thermostats.map((t) => t.i);
    const first = M.thermostats[0];
    M.tstatSession = {
      rid: null,
      anchorEl: M.CENTRAL_TSTAT_BTN,
      ids: ids.slice(),
      allIds: ids.slice(),
      unit: normalizeTstatUnit(first?.u),
      edit: "heat",
      central: true,
      centralTstat: M.buildCentralTstat(M.thermostats, normalizeTstatUnit(first?.u)),
    };
    const popup = ensureTstatPopup();
    renderTstatDial();
    renderTstatControls();
    updateTstatHeadExtras();
    positionTstatPopup(M.CENTRAL_TSTAT_BTN);
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    M.publishMld({ tstatSession: M.tstatSession, tstatPopup: popup });
  }

  function openTstatPopup(rid, anchorEl) {
    M.cancelAllSlideGestures();
    closeTstatPopup();
    if (M.colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    closeFanMasterPopup();
    closeShadeMasterPopup();
    const roomKey = normalizeRoomId(rid);
    const list = M.thermoByRoom.get(roomKey) || [];
    if (!list.length) return;
    if (list.length === 1) {
      openTstatPopupForDevice(list[0].i, anchorEl);
      return;
    }
    const ids = list.map((x) => x.i);
    // Start on one device so mode/fan caps are always that unit's own list.
    // Target picker can switch among roommates (or select several for setpoints).
    M.tstatSession = {
      rid: roomKey,
      anchorEl,
      ids: [list[0].i],
      allIds: ids.slice(),
      unit: normalizeTstatUnit(list[0].u),
      edit: "heat",
      roomGroup: true,
    };
    const popup = ensureTstatPopup();
    renderTstatDial();
    renderTstatControls();
    updateTstatHeadExtras();
    positionTstatPopup(anchorEl);
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    M.publishMld({ tstatSession: M.tstatSession, tstatPopup: popup });
  }

  function openTstatPopupForDevice(tstatId, anchorEl) {
    M.cancelAllSlideGestures();
    closeTstatPopup();
    if (M.colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    closeFanMasterPopup();
    closeShadeMasterPopup();
    const t = M.thermostats.find((x) => x.i === tstatId);
    if (!t) return;
    M.tstatSession = {
      rid: normalizeRoomId(t.r),
      anchorEl,
      ids: [t.i],
      unit: normalizeTstatUnit(t.u),
      edit: "heat",
    };
    const popup = ensureTstatPopup();
    renderTstatDial();
    renderTstatControls();
    updateTstatFavButton();
    positionTstatPopup(anchorEl);
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    M.publishMld({ tstatSession: M.tstatSession, tstatPopup: popup });
  }

  function closeTstatPopup() {
    closeCentralTstatTargetMenu();
    if (M.tstatPopup) {
      M.tstatPopup.setAttribute("hidden", "");
      M.tstatPopup.classList.remove("open");
    }
    M.tstatSession = null;
    M.publishMld({ tstatSession: null, tstatPopup: M.tstatPopup });
  }

  function ensureMusicMasterPopup() {
    if (M.musicMasterPopup) return M.musicMasterPopup;
    const popup = ce("div", "music-master-popup");
    popup.hidden = true;
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-label", "All music");

    const panel = ce("div", "music-master-panel");
    const head = ce("div", "music-master-head");
    const title = ce("div", "music-master-title");
    title.textContent = "All music";
    const closeBtn = ce("button", "music-master-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "\u00d7";
    head.appendChild(title);
    head.appendChild(closeBtn);

    const body = ce("div", "music-master-body");
    panel.appendChild(head);
    panel.appendChild(body);
    popup.appendChild(panel);
    M.appendPopup(popup);

    M.bindPopupDismiss(popup, panel, closeBtn, closeMusicMasterPopup);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && popup.classList.contains("open")) closeMusicMasterPopup();
    });

    popup._body = body;
    M.musicMasterPopup = popup;
    return popup;
  }

  function renderMusicMasterBody() {
    const popup = ensureMusicMasterPopup();
    const body = popup._body;
    body.innerHTML = "";
    const any = (cap) => M.music.some((d) => M.musicControls(d)[cap]);
    const canPlay = any("play");
    const canPause = any("pause");
    const canStop = any("stop");
    const canVolume = any("volume");

    const transport = ce("div", "music-master-transport");
    const playBtn = ce("button", "music-btn music-btn-primary");
    playBtn.type = "button";
    playBtn.setAttribute("aria-label", "Play all");
    playBtn.innerHTML = MUSIC_PLAY_SVG;
    playBtn.disabled = !canPlay;
    playBtn.addEventListener("click", () => M.postCall("broadcastMusic", "play"));
    const pauseBtn = ce("button", "music-btn music-btn-primary");
    pauseBtn.type = "button";
    pauseBtn.setAttribute("aria-label", "Pause all");
    pauseBtn.innerHTML = MUSIC_PAUSE_SVG;
    pauseBtn.disabled = !canPause;
    pauseBtn.addEventListener("click", () => M.postCall("broadcastMusic", "pause"));
    const stopBtn = ce("button", "music-btn");
    stopBtn.type = "button";
    stopBtn.setAttribute("aria-label", "Stop all");
    stopBtn.innerHTML = MUSIC_STOP_SVG;
    stopBtn.disabled = !canStop;
    stopBtn.addEventListener("click", () => M.postCall("broadcastMusic", "stop"));
    transport.appendChild(playBtn);
    transport.appendChild(pauseBtn);
    transport.appendChild(stopBtn);
    body.appendChild(transport);

    const volRow = ce("div", "music-master-volume");
    const volLabel = ce("span", "music-master-volume-label");
    volLabel.textContent = "Volume";
    const volDown = ce("button", "music-btn music-master-vol-btn");
    volDown.type = "button";
    volDown.setAttribute("aria-label", "Volume down for all");
    volDown.textContent = "\u2212";
    volDown.disabled = !canVolume;
    volDown.addEventListener("click", () => M.postCall("broadcastMusicVolume", -M.MUSIC_VOL_STEP));
    const volUp = ce("button", "music-btn music-master-vol-btn");
    volUp.type = "button";
    volUp.setAttribute("aria-label", "Volume up for all");
    volUp.textContent = "+";
    volUp.disabled = !canVolume;
    volUp.addEventListener("click", () => M.postCall("broadcastMusicVolume", M.MUSIC_VOL_STEP));
    volRow.appendChild(volLabel);
    volRow.appendChild(volDown);
    volRow.appendChild(volUp);
    body.appendChild(volRow);
  }

  function openMusicMasterPopup() {
    M.cancelAllSlideGestures();
    closeTstatPopup();
    if (M.colorSession) closeColorPopup(false);
    closeFanMasterPopup();
    closeShadeMasterPopup();
    M.postCall("closeQuickPopup");
    if (!M.music.length) return;
    renderMusicMasterBody();
    const popup = ensureMusicMasterPopup();
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    M.publishMld({ musicMasterPopup: popup });
  }

  function closeMusicMasterPopup() {
    if (!M.musicMasterPopup) return;
    M.musicMasterPopup.setAttribute("hidden", "");
    M.musicMasterPopup.classList.remove("open");
    M.publishMld({ musicMasterPopup: null });
  }

  function closeMasterTargetMenu(state) {
    if (state.cleanup) {
      state.cleanup();
      state.cleanup = null;
    }
    if (state.menu) {
      state.menu.remove();
      state.menu = null;
    }
    state.anchor = null;
  }

  function repositionMasterTargetMenu(state) {
    const menu = state.menu;
    const anchorBtn = state.anchor;
    if (!menu || !anchorBtn?.isConnected) return;
    const rect = anchorBtn.getBoundingClientRect();
    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    let top = rect.bottom + 6;
    if (top + menuH > window.innerHeight - 8) top = rect.top - menuH - 6;
    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    menu.style.top = top + "px";
    menu.style.left = left + "px";
  }

  function updateMasterTargetButton(btn, session, labels, getDeviceName) {
    if (!btn) return;
    if (!session) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    const labelEl = btn.querySelector(".tstat-target-btn-label");
    const allCount = (session.allIds || []).length;
    const selCount = session.ids.length;
    let label;
    if (selCount === 0) label = "No " + labels.unit + " selected";
    else if (selCount === allCount) label = labels.all + " (" + allCount + ")";
    else if (selCount === 1) label = getDeviceName(session.ids[0]) || ("1 " + labels.one);
    else label = selCount + " of " + allCount + " " + labels.unit;
    if (labelEl) labelEl.textContent = label;
    btn.setAttribute("aria-label", "Choose " + labels.unit + " to control: " + label);
  }

  function syncMasterTargetMenu(state, session, datasetKey) {
    if (!state.menu || !session) return;
    const allIds = session.allIds || [];
    const selectedSet = new Set(session.ids);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedSet.has(id));
    const selectAllBtn = state.menu.querySelector(".tstat-target-all");
    if (selectAllBtn) {
      selectAllBtn.classList.toggle("active", allSelected);
      selectAllBtn.setAttribute("aria-selected", allSelected ? "true" : "false");
    }
    for (const b of state.menu.querySelectorAll(".tstat-target-opt:not(.tstat-target-all)")) {
      const id = Number(b.dataset[datasetKey]);
      const on = selectedSet.has(id);
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-selected", "true");
      else b.removeAttribute("aria-selected");
    }
  }

  function openMasterTargetMenu(state, anchorBtn, config) {
    closeMasterTargetMenu(state);
    const session = config.getSession();
    if (!session) return;

    const menu = ce("div", "tstat-target-menu");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-multiselectable", "true");

    const allIds = session.allIds || [];
    const selectedSet = new Set(session.ids);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedSet.has(id));

    const selectAllBtn = ce("button", "tstat-target-opt tstat-target-all");
    selectAllBtn.type = "button";
    selectAllBtn.setAttribute("role", "option");
    const selectAllCheck = ce("span", "tstat-target-check");
    const selectAllInfo = ce("span", "tstat-target-info");
    const selectAllName = ce("span", "tstat-target-name");
    selectAllName.textContent = "Select all";
    selectAllInfo.appendChild(selectAllName);
    selectAllBtn.appendChild(selectAllCheck);
    selectAllBtn.appendChild(selectAllInfo);
    if (allSelected) {
      selectAllBtn.classList.add("active");
      selectAllBtn.setAttribute("aria-selected", "true");
    }
    selectAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      const currentSelected = new Set(session.ids);
      const currentlyAll = allIds.length > 0 && allIds.every((id) => currentSelected.has(id));
      config.onApply(currentlyAll ? [] : allIds.slice());
    });
    menu.appendChild(selectAllBtn);

    for (const dev of config.getPool()) {
      const b = ce("button", "tstat-target-opt");
      b.type = "button";
      b.setAttribute("role", "option");
      b.dataset[config.datasetKey] = String(dev.i);
      const check = ce("span", "tstat-target-check");
      const info = ce("span", "tstat-target-info");
      const name = ce("span", "tstat-target-name");
      name.textContent = dev.n || (config.deviceFallback + " " + dev.i);
      const room = ce("span", "tstat-target-room");
      room.textContent = M.postCall("roomLabel", dev.r) || String(dev.r ?? "");
      info.appendChild(name);
      info.appendChild(room);
      b.appendChild(check);
      b.appendChild(info);
      if (selectedSet.has(dev.i)) {
        b.classList.add("active");
        b.setAttribute("aria-selected", "true");
      }
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        hapticTap();
        const next = new Set(session.ids);
        if (next.has(dev.i)) next.delete(dev.i);
        else next.add(dev.i);
        config.onApply([...next]);
      });
      menu.appendChild(b);
    }

    document.body.appendChild(menu);
    state.menu = menu;
    state.anchor = anchorBtn;
    repositionMasterTargetMenu(state);
    anchorBtn.setAttribute("aria-expanded", "true");

    const onOutside = (e) => {
      if (menu.contains(e.target) || anchorBtn.contains(e.target)) return;
      if (config.onCloseMenu) config.onCloseMenu();
      else closeMasterTargetMenu(state);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (config.onCloseMenu) config.onCloseMenu();
        else closeMasterTargetMenu(state);
      }
    };
    setTimeout(() => {
      document.addEventListener("click", onOutside);
      document.addEventListener("keydown", onKey);
    }, 0);

    state.cleanup = () => {
      document.removeEventListener("click", onOutside);
      document.removeEventListener("keydown", onKey);
      anchorBtn.setAttribute("aria-expanded", "false");
      state.anchor = null;
    };
  }

  function closeFanMasterTargetMenu() {
    closeMasterTargetMenu(M.fanMasterTargetState);
    M.fanMasterTargetMenu = null;
    M.fanMasterTargetMenuAnchor = null;
    M.fanMasterTargetMenuCleanup = null;
  }

  function closeShadeMasterTargetMenu() {
    closeMasterTargetMenu(M.shadeMasterTargetState);
    M.shadeMasterTargetMenu = null;
    M.shadeMasterTargetMenuAnchor = null;
    M.shadeMasterTargetMenuCleanup = null;
  }

  function applyFanMasterSelection(selectedIds) {
    if (!M.fanMasterSession) return;
    const allIds = M.fanMasterSession.allIds || M.ceilingFans.map((f) => f.i);
    M.fanMasterSession.ids = selectedIds.filter((id) => allIds.includes(id));
    M.publishMld({ fanMasterSession: M.fanMasterSession });
    updateFanMasterHead();
    renderFanMasterBody();
    syncMasterTargetMenu(M.fanMasterTargetState, M.fanMasterSession, "fanId");
  }

  function applyShadeMasterSelection(selectedIds) {
    if (!M.shadeMasterSession) return;
    const allIds = M.shadeMasterSession.allIds || M.windowShades.map((s) => s.i);
    M.shadeMasterSession.ids = selectedIds.filter((id) => allIds.includes(id));
    M.publishMld({ shadeMasterSession: M.shadeMasterSession });
    updateShadeMasterHead();
    renderShadeMasterBody();
    syncMasterTargetMenu(M.shadeMasterTargetState, M.shadeMasterSession, "shadeId");
  }

  function updateFanMasterHead() {
    const popup = M.fanMasterPopup;
    if (!popup) return;
    updateMasterTargetButton(
      popup._targetBtn,
      M.fanMasterSession,
      { all: "All fans", unit: "fans", one: "fan" },
      (id) => M.ceilingFans.find((f) => f.i === id)?.n
    );
    const favBtn = popup._favBtn;
    if (!favBtn) return;
    if (!M.fanMasterSession?.ids?.length || M.fanMasterSession.ids.length !== 1 || !M.isFavoriteableDeviceId(M.fanMasterSession.ids[0])) {
      favBtn.hidden = true;
      return;
    }
    favBtn.hidden = false;
    M.syncFavButton(favBtn, M.fanMasterSession.ids[0]);
  }

  function updateShadeMasterHead() {
    const popup = M.shadeMasterPopup;
    if (!popup) return;
    updateMasterTargetButton(
      popup._targetBtn,
      M.shadeMasterSession,
      { all: "All blinds", unit: "blinds", one: "blind" },
      (id) => M.windowShades.find((s) => s.i === id)?.n
    );
    const favBtn = popup._favBtn;
    if (!favBtn) return;
    if (!M.shadeMasterSession?.ids?.length || M.shadeMasterSession.ids.length !== 1 || !M.isFavoriteableDeviceId(M.shadeMasterSession.ids[0])) {
      favBtn.hidden = true;
      return;
    }
    favBtn.hidden = false;
    M.syncFavButton(favBtn, M.shadeMasterSession.ids[0]);
  }

  function openFanMasterTargetMenu(anchorBtn) {
    closeFanMasterTargetMenu();
    if (!M.fanMasterSession) return;
    openMasterTargetMenu(M.fanMasterTargetState, anchorBtn, {
      getSession: () => M.fanMasterSession,
      onApply: applyFanMasterSelection,
      getPool: () => M.postCall("sortByRoomThenFullName", M.ceilingFans) || M.ceilingFans.slice(),
      datasetKey: "fanId",
      deviceFallback: "Fan",
      onCloseMenu: closeFanMasterTargetMenu,
    });
    M.fanMasterTargetMenu = M.fanMasterTargetState.menu;
    M.fanMasterTargetMenuAnchor = M.fanMasterTargetState.anchor;
    M.fanMasterTargetMenuCleanup = M.fanMasterTargetState.cleanup;
  }

  function openShadeMasterTargetMenu(anchorBtn) {
    closeShadeMasterTargetMenu();
    if (!M.shadeMasterSession) return;
    openMasterTargetMenu(M.shadeMasterTargetState, anchorBtn, {
      getSession: () => M.shadeMasterSession,
      onApply: applyShadeMasterSelection,
      getPool: () => M.postCall("sortByRoomThenFullName", M.windowShades) || M.windowShades.slice(),
      datasetKey: "shadeId",
      deviceFallback: "Shade",
      onCloseMenu: closeShadeMasterTargetMenu,
    });
    M.shadeMasterTargetMenu = M.shadeMasterTargetState.menu;
    M.shadeMasterTargetMenuAnchor = M.shadeMasterTargetState.anchor;
    M.shadeMasterTargetMenuCleanup = M.shadeMasterTargetState.cleanup;
  }

  function ensureFanMasterPopup() {
    if (M.fanMasterPopup) return M.fanMasterPopup;
    const popup = ce("div", "fan-master-popup");
    popup.hidden = true;
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-label", "All fans");

    const panel = ce("div", "fan-master-panel");
    const head = ce("div", "fan-master-head");
    const leading = ce("div", "fan-master-head-leading");
    const title = ce("div", "fan-master-title");
    title.textContent = "All fans";
    const targetBtn = ce("button", "tstat-target-btn");
    targetBtn.type = "button";
    targetBtn.setAttribute("aria-haspopup", "listbox");
    targetBtn.setAttribute("aria-expanded", "false");
    const targetLabel = ce("span", "tstat-target-btn-label");
    const targetCaret = ce("span", "tstat-target-btn-caret");
    targetCaret.setAttribute("aria-hidden", "true");
    targetCaret.textContent = "\u25be";
    targetBtn.appendChild(targetLabel);
    targetBtn.appendChild(targetCaret);
    targetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      if (M.fanMasterTargetMenu) closeFanMasterTargetMenu();
      else openFanMasterTargetMenu(targetBtn);
    });
    const favBtn = ce("button", "tstat-fav");
    favBtn.type = "button";
    favBtn.hidden = true;
    favBtn.innerHTML = FAVORITES_SVG;
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (M.fanMasterSession?.ids?.length !== 1) return;
      const id = M.fanMasterSession.ids[0];
      if (id == null || !M.isFavoriteableDeviceId(id)) return;
      hapticTap();
      M.postCall("toggleFavorite", id);
    });
    const closeBtn = ce("button", "fan-master-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "\u00d7";
    leading.appendChild(title);
    leading.appendChild(targetBtn);
    leading.appendChild(favBtn);
    head.appendChild(leading);
    head.appendChild(closeBtn);

    const body = ce("div", "fan-master-body");
    panel.appendChild(head);
    panel.appendChild(body);
    popup.appendChild(panel);
    M.appendPopup(popup);

    M.bindPopupDismiss(popup, panel, closeBtn, closeFanMasterPopup);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !popup.classList.contains("open")) return;
      if (M.fanMasterTargetMenu) { closeFanMasterTargetMenu(); return; }
      closeFanMasterPopup();
    });

    popup._body = body;
    popup._title = title;
    popup._targetBtn = targetBtn;
    popup._favBtn = favBtn;
    M.fanMasterPopup = popup;
    return popup;
  }

  function renderFanMasterBody() {
    const popup = ensureFanMasterPopup();
    const body = popup._body;
    body.innerHTML = "";
    const selectedIds = new Set(M.fanMasterSession?.ids || []);
    const selectedFans = M.ceilingFans.filter((f) => selectedIds.has(f.i));
    const noneSelected = !selectedFans.length;
    const anyOn = !noneSelected && selectedFans.some((f) => M.effectiveFanOn(f));

    const controls = ce("div", "fan-controls fan-master-controls" + (anyOn ? " is-on" : ""));
    const power = ce("button", "fan-power");
    power.type = "button";
    power.innerHTML = FAN_BTN_SVG;
    power.disabled = noneSelected;
    power.setAttribute("aria-label", anyOn ? "Turn all fans off" : "Turn all fans on");
    power.setAttribute("aria-pressed", anyOn ? "true" : "false");
    power.addEventListener("click", () => M.postCall("broadcastFanPower"));
    if (selectedFans.length) {
      const ref = selectedFans[0];
      M.syncFanBladeSpin(power, ref, anyOn, M.effectiveFanSpeed(ref));
    }
    controls.appendChild(power);
    body.appendChild(controls);

    const speeds = M.intersectionCeilingFanSpeeds(selectedFans);
    if (speeds.length) {
      const row = ce("div", "fan-master-speeds");

      for (const sp of speeds) {
        const btn = ce("button", "fan-master-speed-btn");
        btn.type = "button";
        btn.textContent = M.ceilingFanSpeedLabel(sp);
        btn.disabled = noneSelected;
        btn.addEventListener("click", () => M.postCall("broadcastFanSpeed", sp));
        row.appendChild(btn);
      }
      body.appendChild(row);
    }
  }

  function openFanMasterPopup() {
    M.cancelAllSlideGestures();
    closeTstatPopup();
    if (M.colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    closeShadeMasterPopup();
    M.postCall("closeQuickPopup");
    if (!M.ceilingFans.length) return;
    const ids = M.ceilingFans.map((f) => f.i);
    M.fanMasterSession = { ids: ids.slice(), allIds: ids.slice() };
    M.publishMld({ fanMasterSession: M.fanMasterSession });
    renderFanMasterBody();
    updateFanMasterHead();
    const popup = ensureFanMasterPopup();
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    M.publishMld({ fanMasterPopup: popup });
  }

  function closeFanMasterPopup() {
    closeFanMasterTargetMenu();
    if (!M.fanMasterPopup) return;
    M.fanMasterPopup.setAttribute("hidden", "");
    M.fanMasterPopup.classList.remove("open");
    M.fanMasterSession = null;
    M.publishMld({ fanMasterPopup: null, fanMasterSession: null });
  }

  function ensureShadeMasterPopup() {
    if (M.shadeMasterPopup) return M.shadeMasterPopup;
    const popup = ce("div", "shade-master-popup");
    popup.hidden = true;
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-label", "All blinds");

    const panel = ce("div", "shade-master-panel");
    const head = ce("div", "shade-master-head");
    const leading = ce("div", "shade-master-head-leading");
    const title = ce("div", "shade-master-title");
    title.textContent = "All blinds";
    const targetBtn = ce("button", "tstat-target-btn");
    targetBtn.type = "button";
    targetBtn.setAttribute("aria-haspopup", "listbox");
    targetBtn.setAttribute("aria-expanded", "false");
    const targetLabel = ce("span", "tstat-target-btn-label");
    const targetCaret = ce("span", "tstat-target-btn-caret");
    targetCaret.setAttribute("aria-hidden", "true");
    targetCaret.textContent = "\u25be";
    targetBtn.appendChild(targetLabel);
    targetBtn.appendChild(targetCaret);
    targetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      if (M.shadeMasterTargetMenu) closeShadeMasterTargetMenu();
      else openShadeMasterTargetMenu(targetBtn);
    });
    const favBtn = ce("button", "tstat-fav");
    favBtn.type = "button";
    favBtn.hidden = true;
    favBtn.innerHTML = FAVORITES_SVG;
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (M.shadeMasterSession?.ids?.length !== 1) return;
      const id = M.shadeMasterSession.ids[0];
      if (id == null || !M.isFavoriteableDeviceId(id)) return;
      hapticTap();
      M.postCall("toggleFavorite", id);
    });
    const closeBtn = ce("button", "shade-master-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "\u00d7";
    leading.appendChild(title);
    leading.appendChild(targetBtn);
    leading.appendChild(favBtn);
    head.appendChild(leading);
    head.appendChild(closeBtn);

    const body = ce("div", "shade-master-body");
    panel.appendChild(head);
    panel.appendChild(body);
    popup.appendChild(panel);
    M.appendPopup(popup);

    M.bindPopupDismiss(popup, panel, closeBtn, closeShadeMasterPopup);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !popup.classList.contains("open")) return;
      if (M.shadeMasterTargetMenu) { closeShadeMasterTargetMenu(); return; }
      closeShadeMasterPopup();
    });

    popup._body = body;
    popup._title = title;
    popup._targetBtn = targetBtn;
    popup._favBtn = favBtn;
    M.shadeMasterPopup = popup;
    return popup;
  }

  function renderShadeMasterBody() {
    const popup = ensureShadeMasterPopup();
    const body = popup._body;
    body.innerHTML = "";
    const selectedIds = new Set(M.shadeMasterSession?.ids || []);
    const selectedShades = M.windowShades.filter((s) => selectedIds.has(s.i));
    const noneSelected = !selectedShades.length;

    const actions = ce("div", "shade-master-actions");
    const openBtn = ce("button", "quick-lock-btn shade-btn");
    openBtn.type = "button";
    openBtn.innerHTML = SHADE_OPEN_SVG + '<span class="quick-lock-btn-label">Open</span>';
    openBtn.disabled = noneSelected;
    openBtn.addEventListener("click", () => M.postCall("broadcastShadeCmd", "open"));
    const closeBtn = ce("button", "quick-lock-btn shade-btn");
    closeBtn.type = "button";
    closeBtn.innerHTML = SHADE_CLOSE_SVG + '<span class="quick-lock-btn-label">Close</span>';
    closeBtn.disabled = noneSelected;
    closeBtn.addEventListener("click", () => M.postCall("broadcastShadeCmd", "close"));
    actions.appendChild(openBtn);
    actions.appendChild(closeBtn);
    body.appendChild(actions);
    popup._openBtn = openBtn;
    popup._closeBtn = closeBtn;

    const positioned = selectedShades.filter((s) => s.pos != null);
    if (positioned.length) {
      const sliderWrap = ce("div", "shade-master-slider-wrap");
      const levelLabel = ce("span", "shade-level-label");
      const pos = M.averageShadePosition(positioned);
      levelLabel.textContent = pos + "%";
      const slider = ce("div", "slider shade-slider");
      const inner = ce("div", "slider-inner");
      inner.appendChild(ce("div", "slider-fill"));
      slider.appendChild(inner);
      slider.appendChild(ce("div", "slider-thumb"));
      if (noneSelected) slider.classList.add("disabled");
      M.postCall("setSliderLevel", slider, pos);
      sliderWrap.appendChild(levelLabel);
      sliderWrap.appendChild(slider);
      body.appendChild(sliderWrap);
      popup._sliderWrap = sliderWrap;
      popup._levelLabel = levelLabel;
      popup._slider = slider;
      if (!noneSelected) {
        M.postCall("attachBulkShadeDrag", sliderWrap, slider, (lvl) => { levelLabel.textContent = lvl + "%"; });
      }
    } else {
      popup._sliderWrap = null;
      popup._levelLabel = null;
      popup._slider = null;
    }
    updateShadeMasterBody();
  }

  function updateShadeMasterBody() {
    const popup = M.shadeMasterPopup;
    if (!popup || popup.hidden) return;
    const selectedIds = new Set(M.shadeMasterSession?.ids || []);
    const selectedShades = M.windowShades.filter((s) => selectedIds.has(s.i));
    const noneSelected = !selectedShades.length;
    const allOpen = !noneSelected && selectedShades.every((s) => {
      const st = M.effectiveShadeState(s);
      return st === "open" || st === "opening";
    });
    const allClosed = !noneSelected && selectedShades.every((s) => {
      const st = M.effectiveShadeState(s);
      return st === "closed" || st === "closing";
    });
    const anyMoving = !noneSelected && selectedShades.some((s) => M.shadeIsMoving(s));

    if (popup._openBtn) {
      popup._openBtn.classList.toggle("active", allOpen);
      popup._openBtn.classList.toggle("moving", anyMoving && allOpen);
      // Keep buttons clickable so Open/Close stay responsive (can reverse direction).
      popup._openBtn.disabled = noneSelected;
    }
    if (popup._closeBtn) {
      popup._closeBtn.classList.toggle("active", allClosed);
      popup._closeBtn.classList.toggle("moving", anyMoving && allClosed);
      popup._closeBtn.disabled = noneSelected;
    }

    const positioned = selectedShades.filter((s) => s.pos != null || M.effectiveShadePosition(s) != null);
    if (popup._slider && popup._levelLabel && positioned.length && !popup._slider.classList.contains("dragging")) {
      const pos = M.averageShadePosition(positioned);
      M.postCall("setSliderLevel", popup._slider, pos);
      popup._levelLabel.textContent = pos + "%";
    }
  }

  function openShadeMasterPopup() {
    M.cancelAllSlideGestures();
    closeTstatPopup();
    if (M.colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    closeFanMasterPopup();
    M.postCall("closeQuickPopup");
    if (!M.windowShades.length) return;
    const ids = M.windowShades.map((s) => s.i);
    M.shadeMasterSession = { ids: ids.slice(), allIds: ids.slice() };
    M.publishMld({ shadeMasterSession: M.shadeMasterSession });
    const popup = ensureShadeMasterPopup();
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    M.publishMld({ shadeMasterPopup: popup });
    renderShadeMasterBody();
    updateShadeMasterHead();
  }

  function closeShadeMasterPopup() {
    closeShadeMasterTargetMenu();
    if (!M.shadeMasterPopup) return;
    M.shadeMasterPopup.setAttribute("hidden", "");
    M.shadeMasterPopup.classList.remove("open");
    M.shadeMasterSession = null;
    M.publishMld({ shadeMasterPopup: null, shadeMasterSession: null });
  }

  function reconcileTstat(id) {
    setTimeout(() => M.postCall("refreshDevice", id), 600);
    setTimeout(() => M.postCall("refreshDevice", id), 1800);
  }

  function updateClimateWidgets() {
    for (const [rid, rec] of M.climateEls) {
      const info = M.roomClimateInfo(rid);
      if (!info) continue;
      rec.tempEl.textContent = M.formatRoomTemp(info.device);
      if (rec.iconEl) {
        rec.iconEl.classList.remove("state-off", "state-heat", "state-cool", "state-fan");
        if (info.controllable) {
          const cls = M.roomTstatState(rid);
          rec.iconEl.classList.add(cls);
          rec.el.setAttribute("aria-label", "Thermostat — " + cls.replace("state-", "") + ", " + M.formatRoomTemp(info.device));
        }
      }
    }
    if (M.tstatSession) {
      renderTstatDial();
      renderTstatControls();
    }
  }

  function setStatus(msg, isErr) {
    if (!msg) { M.STATUS_EL.hidden = true; M.STATUS_EL.textContent = ""; return; }
    M.STATUS_EL.hidden = false;
    M.STATUS_EL.textContent = msg;
    M.STATUS_EL.classList.toggle("error", !!isErr);
  }
  function flash(msg, isErr) { setStatus(msg, isErr); clearTimeout(flash._t); flash._t = setTimeout(() => setStatus(""), 2200); }

  function hapticTap(pattern) {
    if (!M.cfg.enableHaptics) return;
    if (!window.isSecureContext) return;
    const vibrate = navigator.vibrate;
    if (typeof vibrate !== "function") return;
    try {
      vibrate.call(navigator, pattern || 15);
    } catch {}
  }

  function effectiveTheme(theme) {
    const pref = M.THEME_OPTIONS.includes(theme) ? theme : "auto";
    if (pref === "auto") {
      try {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } catch {
        return "dark";
      }
    }
    return pref;
  }

  function updateThemeSegmentUI(theme) {
    if (!M.MENU_THEME_SEGMENT) return;
    for (const btn of M.MENU_THEME_SEGMENT.querySelectorAll(".topbar-overflow-seg")) {
      const selected = btn.dataset.theme === theme;
      btn.setAttribute("aria-checked", selected ? "true" : "false");
    }
  }

  function applyTheme(theme) {
    M.cfg.theme = M.THEME_OPTIONS.includes(theme) ? theme : "auto";
    const effective = effectiveTheme(M.cfg.theme);
    document.documentElement.setAttribute("data-theme", effective);
    document.documentElement.style.colorScheme = effective;
    const meta = qs('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", effective === "light" ? "#eef1f7" : "#0b0d12");
    updateThemeSegmentUI(M.cfg.theme);
  }

  function applyDashboardName(name) {
    const title = String(name || "").trim() || "mDash";
    M.cfg.dashboardName = title;
    if (M.DASHBOARD_TITLE_EL) M.DASHBOARD_TITLE_EL.textContent = title;
    document.title = title;
  }

  // ---------- local / cloud mode switching ----------
  function isCloudOrigin() {
    return location.hostname === "cloud.hubitat.com" || location.protocol === "https:";
  }

  function isLocalOrigin() {
    return location.protocol === "http:" && location.hostname !== "cloud.hubitat.com";
  }

  function isAndroid() {
    try {
      if (navigator.userAgentData?.platform === "Android") return true;
    } catch {}
    return /Android/i.test(navigator.userAgent || "");
  }

  function isStandaloneDisplay() {
    try {
      return window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches;
    } catch {
      return false;
    }
  }

  function initAndroidLocalImmersive() {
    if (!isLocalOrigin() || !isAndroid() || isStandaloneDisplay()) return;

    document.documentElement.classList.add("android-browser-local");

    function isModalOpen() {
      try {
        if (document.fullscreenElement) return true;
      } catch {}
      if (document.querySelector(".camera-expand-overlay")) return true;
      return !!document.querySelector(
        ".quick-popup.open, .ct-popup.open, .tstat-popup.open, .music-master-popup.open, .confirm-popup.open, .pin-pad-popup.open, .dash-gate-popup.open"
      );
    }

    function nudgeScroll() {
      if (isModalOpen()) return;
      if (window.scrollY <= 1) {
        try { window.scrollTo(0, 1); } catch {}
      }
    }

    nudgeScroll();
    requestAnimationFrame(nudgeScroll);
    setTimeout(nudgeScroll, 50);
    setTimeout(nudgeScroll, 300);

    let nudgeTimer = null;
    window.addEventListener("scroll", () => {
      if (window.scrollY > 1) return;
      if (nudgeTimer) return;
      nudgeTimer = setTimeout(() => {
        nudgeTimer = null;
        nudgeScroll();
      }, 120);
    }, { passive: true });

    window.addEventListener("orientationchange", () => {
      setTimeout(nudgeScroll, 200);
    }, { passive: true });
  }

  function loadStoredLocalUrl() {
    try { return localStorage.getItem(M.LOCAL_URL_STORAGE_KEY) || ""; } catch { return ""; }
  }

  function saveStoredLocalUrl(url) {
    try {
      const v = String(url || "").trim();
      if (v) localStorage.setItem(M.LOCAL_URL_STORAGE_KEY, v);
      else localStorage.removeItem(M.LOCAL_URL_STORAGE_KEY);
    } catch {}
  }

  function loadStoredCloudUrl() {
    try { return localStorage.getItem(M.CLOUD_URL_STORAGE_KEY) || ""; } catch { return ""; }
  }

  function saveStoredCloudUrl(url) {
    try {
      const v = String(url || "").trim();
      if (v) localStorage.setItem(M.CLOUD_URL_STORAGE_KEY, v);
      else localStorage.removeItem(M.CLOUD_URL_STORAGE_KEY);
    } catch {}
  }

  function preferCloudMode() {
    try { return localStorage.getItem(M.PREFER_CLOUD_STORAGE_KEY) === "1"; } catch { return false; }
  }

  function setPreferCloudMode(on) {
    try {
      if (on) localStorage.setItem(M.PREFER_CLOUD_STORAGE_KEY, "1");
      else localStorage.removeItem(M.PREFER_CLOUD_STORAGE_KEY);
    } catch {}
  }

  function consumePreferCloudParam() {
    try {
      const params = new URLSearchParams(location.search);
      if (params.get("mld_prefer_cloud") !== "1") return;
      setPreferCloudMode(true);
      params.delete("mld_prefer_cloud");
      const qs = params.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    } catch {}
  }

  function refreshLocalUrlFromConfig() {
    if (M.cfg.localUrl) {
      saveStoredLocalUrl(M.cfg.localUrl);
      if (M.MENU_LOCAL_URL_EL && document.activeElement !== M.MENU_LOCAL_URL_EL) {
        M.MENU_LOCAL_URL_EL.value = M.cfg.localUrl;
      }
    }
    if (M.cfg.cloudUrl) saveStoredCloudUrl(M.cfg.cloudUrl);
  }

  function navigateToLocal(url) {
    const target = String(url || loadStoredLocalUrl() || "").trim();
    if (!target) return false;
    setPreferCloudMode(false);
    location.replace(target);
    return true;
  }

  function navigateToCloud() {
    let target = String(M.cfg.cloudUrl || loadStoredCloudUrl() || "").trim();
    if (!target) return false;
    setPreferCloudMode(true);
    const sep = target.includes("?") ? "&" : "?";
    target = target + sep + "mld_prefer_cloud=1";
    location.replace(target);
    return true;
  }

  function updateLocalModeMenuUI() {
    const localUrl = loadStoredLocalUrl() || M.cfg.localUrl || "";
    const onCloud = isCloudOrigin();
    const onLocal = isLocalOrigin();
    if (M.MENU_OPEN_LOCAL_BTN) {
      M.MENU_OPEN_LOCAL_BTN.hidden = !(onCloud && !!localUrl);
    }
    if (M.MENU_OPEN_CLOUD_BTN) {
      M.MENU_OPEN_CLOUD_BTN.hidden = !(onLocal && !!M.cfg.cloudUrl);
    }
    if (M.MENU_LOCAL_URL_EL && document.activeElement !== M.MENU_LOCAL_URL_EL) {
      M.MENU_LOCAL_URL_EL.value = localUrl;
    }
  }

  function hideLocalModeBanner() {
    if (M.localModeBannerEl) {
      M.localModeBannerEl.remove();
      M.localModeBannerEl = null;
    }
  }

  function isPrivateLanHostname(hostname) {
    const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
    if (host.endsWith(".local")) return true;
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")) {
      return true;
    }
    const octets = host.split(".").map(Number);
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    return octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 169 && octets[1] === 254);
  }

  function buildLocalProbeUrl(localUrl) {
    try {
      const src = new URL(localUrl);
      if (src.protocol !== "http:" || !isPrivateLanHostname(src.hostname)) return "";
      const probePath = src.pathname.replace(/\/dashboard\/?$/, "/lan-probe");
      if (probePath === src.pathname) return "";
      const token = src.searchParams.get("access_token");
      if (!token) return "";
      const u = new URL(src.origin + probePath);
      u.searchParams.set("access_token", token);
      u.searchParams.set("mld_lan_probe", crypto.randomUUID());
      return u.href;
    } catch {
      return "";
    }
  }

  async function probeLocalHubReachable(localUrl, timeoutMs = 30000) {
    const probeUrl = buildLocalProbeUrl(localUrl);
    if (!probeUrl) return false;
    const nonce = new URL(probeUrl).searchParams.get("mld_lan_probe");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(probeUrl, {
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
        targetAddressSpace: "local",
      });
      if (!response.ok) return false;
      return (await response.text()).trim() === nonce;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  let localModeProbeStarted = false;

  function maybeStartLocalModeProbe() {
    if (localModeProbeStarted || M.localBannerDismissed || !isCloudOrigin() || !isAndroid()) return;
    if (preferCloudMode()) return;
    const localUrl = loadStoredLocalUrl();
    if (!localUrl) return;
    localModeProbeStarted = true;
    probeLocalHubReachable(localUrl).then((reachable) => {
      if (reachable && loadStoredLocalUrl() === localUrl) showLocalModeBanner(localUrl);
    });
  }

  function showLocalModeBanner(verifiedLocalUrl) {
    if (M.localModeBannerEl || M.localBannerDismissed || !isCloudOrigin() || !isAndroid()) return;
    const localUrl = String(verifiedLocalUrl || "").trim();
    if (!localUrl) return;

    const banner = document.createElement("div");
    banner.className = "local-mode-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Switch to local mode");

    const text = document.createElement("span");
    text.className = "local-mode-banner-text";
    text.textContent = "Local hub reachable — switch to faster mode?";

    const switchBtn = document.createElement("button");
    switchBtn.type = "button";
    switchBtn.className = "ghost-btn local-mode-banner-switch";
    switchBtn.textContent = "Switch";

    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.className = "ghost-btn icon-btn local-mode-banner-dismiss";
    dismissBtn.setAttribute("aria-label", "Dismiss");
    dismissBtn.textContent = "\u00d7";

    switchBtn.addEventListener("click", () => navigateToLocal(localUrl));
    dismissBtn.addEventListener("click", () => {
      M.localBannerDismissed = true;
      hideLocalModeBanner();
    });

    banner.appendChild(text);
    banner.appendChild(switchBtn);
    banner.appendChild(dismissBtn);

    if (M.APP_EL && M.ROOMS_EL) M.APP_EL.insertBefore(banner, M.ROOMS_EL);
    else if (M.APP_EL) M.APP_EL.appendChild(banner);
    M.localModeBannerEl = banner;
  }

  // Returns true when navigating away (caller should stop init).
  function applyLocalModeStrategy() {
    consumePreferCloudParam();
    refreshLocalUrlFromConfig();

    if (isLocalOrigin()) {
      updateLocalModeMenuUI();
      return false;
    }

    if (!isCloudOrigin()) {
      updateLocalModeMenuUI();
      return false;
    }

    if (preferCloudMode()) {
      updateLocalModeMenuUI();
      return false;
    }

    const localUrl = loadStoredLocalUrl();
    if (!localUrl) {
      updateLocalModeMenuUI();
      return false;
    }

    if (isAndroid()) maybeStartLocalModeProbe();

    updateLocalModeMenuUI();
    return false;
  }

  function rebuildDevicesByRoom() {
    M.devicesByRoom.clear();
    for (const dev of M.devices) {
      const rid = normalizeRoomId(dev.r);
      if (!M.devicesByRoom.has(rid)) M.devicesByRoom.set(rid, []);
      M.devicesByRoom.get(rid).push(dev);
    }
  }

  function rebuildOutletsByRoom() {
    M.outletsByRoom.clear();
    for (const out of M.outlets) {
      const rid = normalizeRoomId(out.r);
      if (!M.outletsByRoom.has(rid)) M.outletsByRoom.set(rid, []);
      M.outletsByRoom.get(rid).push(out);
    }
  }

  function applyTstatSessionModeLock() {
    if (M.tstatSession?.modeLockUntil > Date.now() && M.tstatSession.lockedMode) {
      for (const t of M.thermostats) {
        if (!M.tstatSession.ids.includes(t.i)) continue;
        t.tm = M.tstatSession.lockedMode;
      }
    }
  }

  function emptyState(html) {
    M.ROOMS_EL.innerHTML = html;
    M.roomEls.clear(); M.devMap.clear();
  }

  function loadingState() {
    emptyState('<div class="loading"><div class="spinner"></div>Loading lights…</div>');
  }

  function noDevicesState() {
    emptyState(
      '<div class="empty">' +
      '<h2>No devices configured</h2>' +
      'Open the Modern Dashboard app on your hub and select your lights, outlets, or thermostats.' +
      '</div>'
    );
  }

  function sortRoomsByOrder(allRooms, order) {
    const list = Array.isArray(allRooms) ? allRooms : [];
    if (!order?.length) {
      return list.slice().sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
      );
    }
    const byId = new Map(list.map(r => [r.id, r]));
    const sorted = [];
    const seen = new Set();
    for (const rawId of order) {
      const id = normalizeRoomId(rawId);
      if (id === -1) continue;
      if (byId.has(id)) {
        sorted.push(byId.get(id));
        seen.add(id);
      }
    }
    const newcomers = list.filter(r => !seen.has(r.id)).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
    );
    sorted.push(...newcomers);
    return sorted;
  }

  function sortCamerasByOrder(allCams, order) {
    const list = Array.isArray(allCams) ? allCams : [];
    if (!order?.length) return list.slice();
    const byId = new Map(list.map(c => [Number(c.i), c]));
    const sorted = [];
    const seen = new Set();
    for (const rawId of order) {
      const id = Number(rawId);
      if (byId.has(id)) {
        sorted.push(byId.get(id));
        seen.add(id);
      }
    }
    for (const c of list) {
      if (!seen.has(Number(c.i))) sorted.push(c);
    }
    return sorted;
  }

  function ensureRoomsFromDevices() {
    if (M.rooms.length) return;
    const byId = new Map();
    const addRef = (item) => {
      const id = normalizeRoomId(item?.r);
      if (id === -1) return;
      if (!byId.has(id)) byId.set(id, { id, name: "Room " + id });
    };
    for (const dev of M.devices) addRef(dev);
    for (const out of M.outlets) addRef(out);
    for (const t of M.thermostats) addRef(t);
    for (const s of M.tempSensors) addRef(s);
    for (const lk of M.locks) addRef(lk);
    if (!byId.size) return;
    M.replaceList(M.rooms, [...byId.values()].sort((a, b) => a.id - b.id));
    M.syncRoomMap();
  }

  function contentRoomIds() {
    const ids = new Set();
    for (const rid of M.devicesByRoom.keys()) ids.add(rid);
    if (outletsInLightsRooms()) {
      for (const rid of M.outletsByRoom.keys()) ids.add(rid);
    }
    for (const rid of M.thermoByRoom.keys()) ids.add(rid);
    for (const rid of M.sensorByRoom.keys()) ids.add(rid);
    return ids;
  }

  function outletsInLightsRooms() {
    return !M.outletsSeparateTab;
  }

  function roomShowsClimate(rid) {
    return M.roomClimateEnabled !== false && M.roomHasClimate(rid);
  }

  function getDisplayRoomIds(groups, hasContent) {
    const knownIds = new Set(M.rooms.map(r => r.id));
    const allIds = new Set(knownIds);
    for (const id of contentRoomIds()) allIds.add(id);
    const hasUnassigned = groups.has(-1) || (outletsInLightsRooms() && M.outletsByRoom.has(-1)) || roomShowsClimate(-1);
    let order;
    if (M.cfg.roomOrder?.length) {
      order = M.cfg.roomOrder.map(normalizeRoomId).filter(id => {
        if (id === -1) return hasUnassigned;
        return allIds.has(id);
      });
      const inOrder = new Set(order.filter(id => id !== -1));
      const newcomers = [...allIds].filter(id => !inOrder.has(id));
      if (newcomers.length) {
        newcomers.sort((a, b) => {
          const an = M.roomMap.get(a) || "";
          const bn = M.roomMap.get(b) || "";
          return String(an).localeCompare(String(bn), undefined, { sensitivity: "base" }) || (a - b);
        });
        const uIdx = order.indexOf(-1);
        if (uIdx >= 0) order = order.slice(0, uIdx).concat(newcomers, order.slice(uIdx));
        else order = order.concat(newcomers);
      }
      if (hasUnassigned && !order.includes(-1)) order.push(-1);
    } else {
      order = M.rooms.map(r => r.id);
      for (const id of allIds) {
        if (id !== -1 && !order.includes(id)) order.push(id);
      }
      if (hasUnassigned && !order.includes(-1)) order.push(-1);
    }
    return order.filter(rid => hasContent(rid));
  }

  function getDefaultNavOrder() {
    return ["lights", ...QUICK_NAV.map(n => n.popup)];
  }

  function getDisplayNavOrder() {
    const defaults = getDefaultNavOrder();
    if (!M.cfg.navOrder?.length) return defaults.slice();
    const known = new Set(defaults);
    const order = M.cfg.navOrder.filter(k => known.has(k));
    for (const key of defaults) {
      if (!order.includes(key)) order.push(key);
    }
    return order;
  }

  function applyNavOrder(order) {
    const nav = document.querySelector(".quick-nav");
    if (!nav) return;
    for (const key of order) {
      const rec = M.navEls.get(key);
      if (rec?.wrap) nav.appendChild(rec.wrap);
    }
  }
  Object.assign(M, { ensureColorPopup, setColorTab, updateColorPopupUI, tileRecsFor, applyLevelChange, applyCtChange, applyRgbChange, attachCtPresets, attachLevelPresets, trackPctFromEvent, levelFromTrackEvent, updateLevelTrackVisual, bindLevelTrackDrag, makeLevelTrackSlider, updateCtTrackVisual, bindCtTrackDrag, makeCtTrackSlider, attachLevelTrackDrag, attachRgbPresets, attachRgbWheel, ensureLightOn, attachCtTrackDrag, kToPct, pctToK, kFromEvent, setCtVisual, setRgbVisual, setLevelVisual, openColorPopup, closeColorPopup, closeCtPopup, applyCentralTstatSelection, tstatTargetPickerEnabled, updateCentralTstatTargetButton, updateTstatHeadExtras, updateTstatFavButton, ensureTstatPopup, activeTstat, tstatSetpointTarget, commitTstatSetpoint, adjustTstatSetpoint, renderTstatDial, renderTstatModeButtons, renderTstatControls, attachTstatDialDrag, tstatModeLocked, reapplyTstatDeviceModeLocks, tstatModeDisplayLabel, favoriteTstatTarget, favoriteTstatTemps, favoriteTstatState, modeCmdForKey, applyTstatModeOptimistic, sendTstatModeCmd, adjustFavoriteTstat, refreshOpenTstatQuickPopups, closeFavoriteTstatModeMenu, repositionFavoriteTstatModeMenu, syncFavoriteTstatModeMenu, applyFavoriteTstatMode, openFavoriteTstatModeMenu, closeCentralTstatTargetMenu, repositionCentralTstatTargetMenu, syncCentralTstatTargetMenu, openCentralTstatTargetMenu, setTstatMode, setFanMode, setFanSpeed, positionTstatPopup, openCentralTstatPopup, openTstatPopup, openTstatPopupForDevice, closeTstatPopup, ensureMusicMasterPopup, renderMusicMasterBody, openMusicMasterPopup, closeMusicMasterPopup, closeMasterTargetMenu, repositionMasterTargetMenu, updateMasterTargetButton, syncMasterTargetMenu, openMasterTargetMenu, closeFanMasterTargetMenu, closeShadeMasterTargetMenu, applyFanMasterSelection, applyShadeMasterSelection, updateFanMasterHead, updateShadeMasterHead, openFanMasterTargetMenu, openShadeMasterTargetMenu, ensureFanMasterPopup, renderFanMasterBody, openFanMasterPopup, closeFanMasterPopup, ensureShadeMasterPopup, renderShadeMasterBody, updateShadeMasterBody, openShadeMasterPopup, closeShadeMasterPopup, reconcileTstat, updateClimateWidgets, setStatus, flash, hapticTap, effectiveTheme, updateThemeSegmentUI, applyTheme, applyDashboardName, isCloudOrigin, isLocalOrigin, isAndroid, isStandaloneDisplay, initAndroidLocalImmersive, loadStoredLocalUrl, saveStoredLocalUrl, loadStoredCloudUrl, saveStoredCloudUrl, preferCloudMode, setPreferCloudMode, consumePreferCloudParam, refreshLocalUrlFromConfig, navigateToLocal, navigateToCloud, updateLocalModeMenuUI, hideLocalModeBanner, isPrivateLanHostname, buildLocalProbeUrl, probeLocalHubReachable, maybeStartLocalModeProbe, showLocalModeBanner, applyLocalModeStrategy, rebuildDevicesByRoom, rebuildOutletsByRoom, applyTstatSessionModeLock, emptyState, loadingState, noDevicesState, sortRoomsByOrder, sortCamerasByOrder, ensureRoomsFromDevices, contentRoomIds, outletsInLightsRooms, roomShowsClimate, getDisplayRoomIds, getDefaultNavOrder, getDisplayNavOrder, applyNavOrder });
})();
