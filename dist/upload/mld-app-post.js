(() => {
  "use strict";
  const M = globalThis.__MLD;
  if (!M) {
    console.error("Modern Dashboard: upload mld-app-core.js before mld-app-post.js");
    return;
  }
  async function saveRoomOrder(order) {
    if (!order?.length) {
      M.flash("No rooms to save", true);
      return false;
    }
    const headers = { "Accept": "application/json" };
    const paths = ["room-order", "settings/room-order"];
    let lastMsg = "Could not save room order";
    for (const path of paths) {
      try {
        let r = await fetch(M.withToken(path), {
          method: "POST",
          cache: "no-store",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ order }),
        });
        if (r.ok) return true;
        try {
          const body = await r.json();
          if (body?.error) lastMsg = String(body.error);
        } catch {}
        if (r.status === 404) continue;
        r = await fetch(M.withToken(path + "?order=" + encodeURIComponent(order.join(","))), {
          method: "GET",
          cache: "no-store",
          headers,
        });
        if (r.ok) return true;
        try {
          const body = await r.json();
          if (body?.error) lastMsg = String(body.error);
        } catch {}
      } catch {}
    }
    M.flash(lastMsg === "Could not save room order"
      ? "Could not save room order — update the hub app code and try again"
      : lastMsg, true);
    return false;
  }

  function currentNavOrderFromDom() {
    const nav = document.querySelector(".quick-nav");
    if (!nav) return [];
    return Array.from(nav.querySelectorAll(".nav-reorder-item"))
      .map(el => el.dataset.navKey)
      .filter(Boolean);
  }

  function updateNavDraftOrderFromDom() {
    M.navReorderDraftOrder = currentNavOrderFromDom();
  }

  function showAllNavForReorder() {
    const nav = document.querySelector(".quick-nav");
    if (nav) nav.hidden = false;
    for (const [, rec] of M.navEls) {
      if (rec.wrap) rec.wrap.hidden = false;
      if (rec.btn) rec.btn.hidden = false;
    }
  }

  function cleanupNavDragState() {
    const nav = document.querySelector(".quick-nav");
    if (!nav) return;
    nav.querySelectorAll(".nav-drag-placeholder").forEach((el) => el.remove());
    for (const [, rec] of M.navEls) {
      if (!rec?.wrap) continue;
      rec.wrap.classList.remove("nav-dragging");
      rec.wrap.style.width = "";
      rec.wrap.style.left = "";
      rec.wrap.style.top = "";
    }
  }

  async function saveNavOrder(order) {
    if (!order?.length) {
      M.flash("No icons to save", true);
      return false;
    }
    const headers = { "Accept": "application/json" };
    const paths = ["nav-order", "settings/nav-order"];
    let lastMsg = "Could not save icon order";
    for (const path of paths) {
      try {
        let r = await fetch(M.withToken(path), {
          method: "POST",
          cache: "no-store",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ order }),
        });
        if (r.ok) return true;
        try {
          const body = await r.json();
          if (body?.error) lastMsg = String(body.error);
        } catch {}
        if (r.status === 404) continue;
        r = await fetch(M.withToken(path + "?order=" + encodeURIComponent(order.join(","))), {
          method: "GET",
          cache: "no-store",
          headers,
        });
        if (r.ok) return true;
        try {
          const body = await r.json();
          if (body?.error) lastMsg = String(body.error);
        } catch {}
      } catch {}
    }
    M.flash(lastMsg === "Could not save icon order"
      ? "Could not save icon order — update the hub app code and try again"
      : lastMsg, true);
    return false;
  }

  async function postJson(path, body) {
    try {
      const r = await fetch(M.withToken(path), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        let msg = "Request failed";
        try {
          const j = await r.json();
          if (j?.error) msg = String(j.error);
        } catch {}
        M.flash(msg, true);
        return { ok: false };
      }
      let data = {};
      try { data = await r.json(); } catch {}
      M.applyDashSessionFromResponse(data);
      return { ok: true, data };
    } catch {
      M.flash("Request failed", true);
      return { ok: false };
    }
  }

  async function postJsonSilent(path, body) {
    try {
      const r = await fetch(M.withToken(path), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      let data = {};
      try { data = await r.json(); } catch {}
      M.applyDashSessionFromResponse(data);
      return { ok: r.ok, status: r.status, data, error: data?.error };
    } catch {
      return { ok: false, error: "Request failed" };
    }
  }

  async function setHsmApi(mode, pin, padApi) {
    let result = await postJsonSilent("hsm", { mode, pin });
    if (!result.ok) {
      if (result.status === 403 || result.error === "wrong pin") {
        padApi?.shake();
        return false;
      }
      if (result.error) M.flash(String(result.error), true);
      else M.flash("Could not change security status", true);
      padApi?.close();
      return false;
    }
    padApi?.close();
    const modeDef = [...HSM_INTRUSION_MODES, ...HSM_MONITORING_MODES].find((m) => m.cmd === mode);
    if (modeDef?.status) {
      M.hsmStatus = modeDef.status;
      M.hsmLockUntil = Date.now() + 4000;
    }
    if (mode === "cancelAlerts") {
      M.hsmAlert = "";
      M.hsmAlertDesc = "";
      M.hsmLockUntil = Date.now() + 4000;
    }
    if (result.data?.status) M.hsmStatus = result.data.status;
    if (result.data?.alert !== undefined) M.hsmAlert = result.data.alert || "";
    if (result.data?.alertDesc !== undefined) M.hsmAlertDesc = result.data.alertDesc || "";
    if (M.currentCategory() === "security") renderSecurityPopup();
    setTimeout(() => { M.refresh().catch(() => {}); }, 3000);
    return true;
  }

  async function setHubModeApi(mode) {
    let result = await postJson("hub-mode", { mode });
    if (result.ok) return true;
    try {
      const r = await fetch(M.withToken("hub-mode?mode=" + encodeURIComponent(mode)), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not set hub mode";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      M.flash(msg, true);
    } catch {
      M.flash("Could not set hub mode", true);
    }
    return false;
  }

  async function activateSceneApi(id) {
    let result = await postJson("scene/activate", { id });
    if (result.ok) return true;
    try {
      const r = await fetch(M.withToken("scene/activate?id=" + encodeURIComponent(id)), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not activate scene";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      M.flash(msg, true);
    } catch {
      M.flash("Could not activate scene", true);
    }
    return false;
  }

  async function bulkLightsApi(cmd, scope, roomId) {
    const body = { cmd, scope };
    if (scope === "room") body.roomId = roomId;
    let result = await postJson("lights/bulk", body);
    if (result.ok) return true;
    try {
      let url = "lights/bulk?cmd=" + encodeURIComponent(cmd) + "&scope=" + encodeURIComponent(scope);
      if (scope === "room") url += "&roomId=" + encodeURIComponent(roomId);
      const r = await fetch(M.withToken(url), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not control lights";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      M.flash(msg, true);
    } catch {
      M.flash("Could not control lights", true);
    }
    return false;
  }

  async function snapshotSaveApi(scope, roomId) {
    const body = { scope };
    if (scope === "room") body.roomId = roomId;
    let result = await postJson("snapshot/save", body);
    if (result.ok) return true;
    try {
      let url = "snapshot/save?scope=" + encodeURIComponent(scope);
      if (scope === "room") url += "&roomId=" + encodeURIComponent(roomId);
      const r = await fetch(M.withToken(url), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not save state";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      M.flash(msg, true);
    } catch {
      M.flash("Could not save state", true);
    }
    return false;
  }

  async function snapshotRestoreApi(scope, roomId) {
    const body = { scope };
    if (scope === "room") body.roomId = roomId;
    let result = await postJson("snapshot/restore", body);
    if (result.ok) return true;
    try {
      let url = "snapshot/restore?scope=" + encodeURIComponent(scope);
      if (scope === "room") url += "&roomId=" + encodeURIComponent(roomId);
      const r = await fetch(M.withToken(url), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not restore state";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      M.flash(msg, true);
    } catch {
      M.flash("Could not restore state", true);
    }
    return false;
  }

  async function saveFavorites(ids) {
    const paths = ["favorites"];
    let lastMsg = "Could not save favorites";
    for (const path of paths) {
      try {
        let r = await fetch(M.withToken(path), {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (r.ok) return true;
        try {
          const body = await r.json();
          if (body?.error) lastMsg = String(body.error);
        } catch {}
        if (r.status === 404) continue;
        r = await fetch(M.withToken(path + "?ids=" + encodeURIComponent(ids.join(","))), {
          method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
        });
        if (r.ok) return true;
        try {
          const body = await r.json();
          if (body?.error) lastMsg = String(body.error);
        } catch {}
      } catch {}
    }
    M.flash(lastMsg, true);
    return false;
  }

  function hubModeLocked() {
    return M.hubModeLockUntil > Date.now();
  }

  function hsmLocked() {
    return M.hsmLockUntil > Date.now();
  }

  function roomLabel(rid) {
    if (rid == null || rid === -1) return "Unassigned";
    return M.roomMap.get(rid) || "Room";
  }

  function snapshotRoomKey(roomKey) {
    return "room:" + roomKey;
  }

  function snapshotHouseKey() {
    return "house";
  }

  function setRoomGestureLock(on) {
    if (on) {
      M.roomGestureLockCount++;
      M.APP_EL?.classList.add("room-gesture-lock");
    } else {
      M.roomGestureLockCount = Math.max(0, M.roomGestureLockCount - 1);
      if (M.roomGestureLockCount === 0) M.APP_EL?.classList.remove("room-gesture-lock");
    }
  }

  const SLIDE_HOLD_MS = 400;
  const SLIDE_FALLBACK_COMMIT_PX = 86;
  const SLIDE_MIN_COMMIT_PX = 52;
  const SLIDE_TAP_MOVE = 10;

  function attachRoomSlideAction(track, primaryBtn, actionBtn, opts) {
    const { direction, onTap, onCommit, canCommit, clickFallback } = opts;
    let pointerId = null;
    let downX = 0;
    let downY = 0;
    let downT = 0;
    let holdTimer = null;
    let holdActive = false;
    let holdBlocked = false;
    let sliding = false;
    let slidePx = 0;
    let slideMaxPx = SLIDE_FALLBACK_COMMIT_PX;
    let gestureHandled = false;
    let suppressClick = false;
    let gestureRegistered = false;

    track.addEventListener("contextmenu", (e) => e.preventDefault());
    track.addEventListener("selectstart", (e) => e.preventDefault());
    track.addEventListener("lostpointercapture", (e) => {
      if (e.pointerId === pointerId) reset();
    });

    function actionWidth() {
      const rectW = actionBtn?.getBoundingClientRect?.().width || 0;
      const styleW = actionBtn ? parseFloat(getComputedStyle(actionBtn).maxWidth) || 0 : 0;
      return Math.max(rectW, styleW, SLIDE_FALLBACK_COMMIT_PX);
    }

    function setupSlideMetrics() {
      const primaryRect = primaryBtn.getBoundingClientRect();
      const actionStyle = actionBtn ? getComputedStyle(actionBtn) : null;
      const actionW = actionWidth();
      const thumbW = parseFloat(getComputedStyle(track).getPropertyValue("--slide-thumb-size")) || 28;
      const margin = actionStyle
        ? (direction === "left" ? parseFloat(actionStyle.marginRight) || 0 : parseFloat(actionStyle.marginLeft) || 0)
        : 0;
      const primaryW = primaryRect.width || 64;
      const start = direction === "left"
        ? actionW + margin + Math.max(0, (primaryW - thumbW) / 2)
        : Math.max(0, (primaryW - thumbW) / 2);
      slideMaxPx = Math.max(SLIDE_MIN_COMMIT_PX, Math.round((primaryW / 2) + margin + (actionW / 2)));
      track.style.setProperty("--slide-thumb-left", Math.round(start) + "px");
      applySlide();
    }

    function commitDistance() {
      return slideMaxPx || SLIDE_FALLBACK_COMMIT_PX;
    }

    function applySlide() {
      const signed = direction === "left" ? -slidePx : slidePx;
      track.style.setProperty("--slide-thumb-x", signed + "px");
      track.style.setProperty("--slide-progress", Math.min(1, slidePx / commitDistance()).toFixed(3));
    }

    function reset() {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      holdActive = false;
      holdBlocked = false;
      sliding = false;
      slidePx = 0;
      slideMaxPx = SLIDE_FALLBACK_COMMIT_PX;
      suppressClick = false;
      track.style.removeProperty("--slide-thumb-x");
      track.style.removeProperty("--slide-thumb-left");
      track.style.removeProperty("--slide-progress");
      track.classList.remove("slide-confirm-active", "slide-confirm-revealed", "slide-confirm-target", "room-slide-active", "room-slide-revealed", "room-slide-target");
      setRoomGestureLock(false);
      try { track.releasePointerCapture(pointerId); } catch {}
      try { primaryBtn.releasePointerCapture(pointerId); } catch {}
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      pointerId = null;
      if (gestureRegistered) {
        gestureRegistered = false;
        const idx = M.activeSlideGestures.indexOf(reset);
        if (idx >= 0) M.activeSlideGestures.splice(idx, 1);
      }
    }

    function onMove(e) {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (!holdActive) {
        if (Math.abs(dx) > SLIDE_TAP_MOVE || Math.abs(dy) > SLIDE_TAP_MOVE) {
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
        }
        return;
      }
      if (!sliding) {
        if (Math.abs(dy) > Math.abs(dx) * 1.6 && Math.abs(dy) > 28) {
          reset();
          return;
        }
        sliding = true;
      }
      e.preventDefault();
      const maxSlide = commitDistance();
      if (direction === "left") {
        slidePx = Math.min(maxSlide, Math.max(0, -dx));
      } else {
        slidePx = Math.min(maxSlide, Math.max(0, dx));
      }
      applySlide();
      const atTarget = slidePx >= maxSlide;
      track.classList.toggle("slide-confirm-target", atTarget);
      track.classList.toggle("room-slide-target", atTarget);
    }

    function onUp(e) {
      if (e.pointerId !== pointerId) return;
      const elapsed = Date.now() - downT;
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);

      if (holdBlocked) {
        reset();
        return;
      }

      if (!holdActive && elapsed <= SLIDE_HOLD_MS + 80 && dx <= SLIDE_TAP_MOVE && dy <= SLIDE_TAP_MOVE) {
        reset();
        if (clickFallback) return;
        gestureHandled = true;
        setTimeout(() => { gestureHandled = false; }, 0);
        onTap();
        return;
      }

      if (holdActive && slidePx >= commitDistance() && (!canCommit || canCommit())) {
        suppressClick = true;
        gestureHandled = true;
        setTimeout(() => { gestureHandled = false; suppressClick = false; }, 0);
        reset();
        onCommit();
        return;
      }

      if (holdActive && slidePx > 0 && canCommit && !canCommit()) {
        M.flash("No saved state", true);
      }
      if (holdActive) {
        suppressClick = true;
        gestureHandled = true;
        setTimeout(() => { gestureHandled = false; suppressClick = false; }, 0);
      }
      reset();
    }

    primaryBtn.addEventListener("pointerdown", (e) => {
      if (M.reorderMode) return;
      if (e.button != null && e.button !== 0) return;
      if (pointerId != null) reset();
      if (!clickFallback) e.preventDefault();
      e.stopPropagation();
      pointerId = e.pointerId;
      downX = e.clientX;
      downY = e.clientY;
      downT = Date.now();
      holdActive = false;
      holdBlocked = false;
      sliding = false;
      slidePx = 0;
      gestureHandled = false;
      suppressClick = false;
      if (!gestureRegistered) {
        gestureRegistered = true;
        M.activeSlideGestures.push(reset);
      }
      try { track.setPointerCapture(pointerId); } catch {
        try { primaryBtn.setPointerCapture(pointerId); } catch {}
      }
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (pointerId == null) return;
        if (canCommit && !canCommit()) {
          holdBlocked = true;
          M.flash("No saved state", true);
          return;
        }
        holdActive = true;
        suppressClick = true;
        track.classList.add("slide-confirm-active", "slide-confirm-revealed", "room-slide-active", "room-slide-revealed");
        setupSlideMetrics();
        setRoomGestureLock(true);
        M.hapticTap();
      }, SLIDE_HOLD_MS);
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });

    primaryBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (suppressClick || gestureHandled) {
        e.preventDefault();
        return;
      }
      if (clickFallback) onTap();
    });

    if (actionBtn) {
      actionBtn.addEventListener("pointerdown", (e) => e.preventDefault());
    }
  }

  function updateRoomSnapshotUi() {
    for (const [rid, rec] of M.roomEls) {
      const has = !!M.snapshots[snapshotRoomKey(rid)];
      rec.card.classList.toggle("room-has-snapshot", has);
      rec.card.classList.toggle("room-no-snapshot", !has);
      if (rec.restoreBtn) {
        rec.restoreBtn.disabled = !has;
        rec.restoreBtn.setAttribute("aria-disabled", has ? "false" : "true");
      }
    }
    const hasHouse = !!M.snapshots[snapshotHouseKey()];
    if (M.ALL_ON_TRACK) {
      M.ALL_ON_TRACK.classList.toggle("house-has-snapshot", hasHouse);
      M.ALL_ON_TRACK.classList.toggle("house-no-snapshot", !hasHouse);
    }
    if (M.ALL_ON_RESTORE_BTN) {
      M.ALL_ON_RESTORE_BTN.disabled = !hasHouse;
      M.ALL_ON_RESTORE_BTN.setAttribute("aria-disabled", hasHouse ? "false" : "true");
    }
  }

  function getFavoriteEntries() {
    const out = [];
    for (const id of M.favorites) {
      const dev = M.devices.find(d => d.i === id);
      if (dev) { out.push({ type: "light", dev }); continue; }
      const outlet = M.outlets.find(o => o.i === id);
      if (outlet) { out.push({ type: "outlet", dev: outlet }); continue; }
      const t = M.thermostats.find(x => x.i === id);
      if (t) { out.push({ type: "thermostat", dev: t }); continue; }
      const ts = M.tempSensors.find(x => x.i === id);
      if (ts) { out.push({ type: "sensor", dev: normalizeTempSensorForCard(ts) }); continue; }
      const sen = M.sensors.find(x => x.i === id);
      if (sen) { out.push({ type: "sensor", dev: sen }); continue; }
      const valve = M.valves.find(x => x.i === id);
      if (valve) { out.push({ type: "sensor", dev: M.normalizeValveForCard(valve) }); continue; }
      const mp = M.music.find(x => x.i === id);
      if (mp) { out.push({ type: "music", dev: mp }); continue; }
      const lk = M.locks.find(x => x.i === id);
      if (lk) { out.push({ type: "lock", dev: lk }); continue; }
      const shade = M.windowShades.find(x => x.i === id);
      if (shade) out.push({ type: "shade", dev: shade });
    }
    return out;
  }

  function updateAllFavButtons() {
    for (const [, rec] of M.devMap) M.syncFavButton(rec.el.querySelector(".tile-fav"), rec.data.i);
    for (const [, rec] of M.outletMap) M.syncFavButton(rec.el.querySelector(".tile-fav"), rec.data.i);
    for (const [, rec] of M.favDevMap) M.syncFavButton(rec.el.querySelector(".tile-fav"), rec.data.i);
    for (const [, rec] of M.sensorCardMap) M.syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of M.favSensorMap) M.syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of M.favMusicMap) M.syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of M.favLockMap) M.syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of M.favShadeMap) M.syncFavButton(rec.favBtn, rec.i);
    M.updateTstatFavButton();
  }

  function attachFavButton(btn, id) {
    btn.innerHTML = FAVORITES_SVG;
    M.syncFavButton(btn, id);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      M.hapticTap();
      toggleFavorite(id);
    });
  }

  async function toggleFavorite(id) {
    const numId = Number(id);
    if (!M.isFavoriteableDeviceId(numId)) return;
    const idx = M.favorites.indexOf(numId);
    const wasFav = idx >= 0;
    if (wasFav) M.favorites.splice(idx, 1);
    else M.favorites.push(numId);
    updateAllFavButtons();
    M.updateQuickNavVisibility();
    if (M.currentCategory() === "favorites") M.renderFavoritesPopup();
    else if (M.quickPopupOpenType === "locks") renderLocksPopup();
    else if (M.quickPopupOpenType === "music") renderMusicPopup();
    else if (M.quickPopupOpenType === "blinds") renderBlindsPopup();
    const ok = await saveFavorites(M.favorites);
    if (!ok) {
      if (wasFav) M.favorites.push(numId);
      else M.favorites.splice(M.favorites.indexOf(numId), 1);
      updateAllFavButtons();
      M.updateQuickNavVisibility();
      if (M.currentCategory() === "favorites") M.renderFavoritesPopup();
      else if (M.quickPopupOpenType === "locks") renderLocksPopup();
      else if (M.quickPopupOpenType === "music") renderMusicPopup();
      else if (M.quickPopupOpenType === "blinds") renderBlindsPopup();
    }
  }

  function currentRoomOrderFromDom() {
    return Array.from(M.ROOMS_EL.querySelectorAll(".room:not(.hidden)"))
      .map(el => Number(el.dataset.roomId));
  }

  function updateDraftOrderFromDom() {
    M.reorderDraftOrder = currentRoomOrderFromDom();
  }

  function updateMoveButtons() {
    if (!M.reorderMode) return;
    const cards = Array.from(M.ROOMS_EL.querySelectorAll(".room:not(.hidden)"));
    cards.forEach((card, i) => {
      const rec = M.roomEls.get(Number(card.dataset.roomId));
      if (!rec?.moveUp || !rec?.moveDown) return;
      rec.moveUp.disabled = i === 0;
      rec.moveDown.disabled = i === cards.length - 1;
    });
  }

  function moveRoom(rid, delta) {
    const cards = Array.from(M.ROOMS_EL.querySelectorAll(".room:not(.hidden)"));
    const idx = cards.findIndex(c => Number(c.dataset.roomId) === rid);
    if (idx < 0) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= cards.length) return;
    const card = cards[idx];
    const sibling = cards[newIdx];
    if (delta < 0) M.ROOMS_EL.insertBefore(card, sibling);
    else M.ROOMS_EL.insertBefore(sibling, card);
    updateDraftOrderFromDom();
    updateMoveButtons();
    M.hapticTap();
  }

  function enterReorderMode() {
    M.reorderSnapshot = M.cfg.roomOrder?.length ? M.cfg.roomOrder.slice() : null;
    M.reorderDraftOrder = currentRoomOrderFromDom();
    M.navReorderSnapshot = M.cfg.navOrder?.length ? M.cfg.navOrder.slice() : null;
    M.navReorderDraftOrder = currentNavOrderFromDom();
    for (const [, rec] of M.roomEls) rec.card.classList.remove("collapsed");
    M.updateExpandAllBtn();
    M.stopPolling();
    M.reorderMode = true;
    M.APP_EL?.classList.toggle("reorder-mode", true);
    closeTopbarOverflowMenu();
    relocateNavForReorder();
    showAllNavForReorder();
    if (M.SEARCH_EL) {
      M.SEARCH_EL.value = "";
      M.applySearch();
    }
    if (M.REORDER_DONE_BTN) M.REORDER_DONE_BTN.hidden = false;
    if (M.REORDER_CANCEL_BTN) M.REORDER_CANCEL_BTN.hidden = false;
    updateMoveButtons();
  }

  function exitReorderMode(resumePoll) {
    M.reorderMode = false;
    M.reorderBusy = false;
    M.reorderDraftOrder = null;
    M.reorderSnapshot = null;
    M.navReorderDraftOrder = null;
    M.navReorderSnapshot = null;
    M.APP_EL?.classList.toggle("reorder-mode", false);
    restoreNavAfterReorder();
    cleanupNavDragState();
    if (M.REORDER_DONE_BTN) M.REORDER_DONE_BTN.hidden = true;
    if (M.REORDER_CANCEL_BTN) M.REORDER_CANCEL_BTN.hidden = true;
    M.updateQuickNavVisibility();
    if (resumePoll) {
      M.startPolling();
      M.refresh();
    } else {
      M.applySearch();
    }
  }

  async function finishReorderMode() {
    const order = M.reorderDraftOrder ?? currentRoomOrderFromDom();
    const navOrder = M.navReorderDraftOrder ?? currentNavOrderFromDom();
    const [roomsSaved, navSaved] = await Promise.all([
      saveRoomOrder(order),
      saveNavOrder(navOrder),
    ]);
    if (!roomsSaved || !navSaved) return;
    M.cfg.roomOrder = order.length ? order.slice() : null;
    M.cfg.navOrder = navOrder.length ? navOrder.slice() : null;
    M.lastDataSig = "";
    exitReorderMode(true);
    M.flash("Order saved");
  }

  function cancelReorderMode() {
    M.cfg.roomOrder = M.reorderSnapshot ? M.reorderSnapshot.slice() : null;
    M.cfg.navOrder = M.navReorderSnapshot ? M.navReorderSnapshot.slice() : null;
    M.lastDataSig = "";
    exitReorderMode(false);
    M.postCall("applyNavOrder", M.postCall("getDisplayNavOrder"));
    buildDom();
  }

  let topbarOverflowDismiss = null;

  function closeTopbarOverflowMenu() {
    if (!M.OVERFLOW_MENU || !M.OVERFLOW_BTN) return;
    M.OVERFLOW_MENU.hidden = true;
    M.OVERFLOW_BTN.setAttribute("aria-expanded", "false");
    if (topbarOverflowDismiss) {
      document.removeEventListener("click", topbarOverflowDismiss.onClick);
      document.removeEventListener("keydown", topbarOverflowDismiss.onKey);
      topbarOverflowDismiss = null;
    }
  }

  function openTopbarOverflowMenu() {
    if (!M.OVERFLOW_MENU || !M.OVERFLOW_BTN || M.reorderMode) return;
    M.updateLocalModeMenuUI();
    M.OVERFLOW_MENU.hidden = false;
    M.OVERFLOW_BTN.setAttribute("aria-expanded", "true");
    const onClick = (e) => {
      if (M.OVERFLOW_MENU.contains(e.target) || M.OVERFLOW_BTN.contains(e.target)) return;
      closeTopbarOverflowMenu();
    };
    const onKey = (e) => {
      if (e.key === "Escape") closeTopbarOverflowMenu();
    };
    topbarOverflowDismiss = { onClick, onKey };
    setTimeout(() => {
      document.addEventListener("click", onClick);
      document.addEventListener("keydown", onKey);
    }, 0);
  }

  function toggleTopbarOverflowMenu() {
    if (!M.OVERFLOW_MENU) return;
    if (M.OVERFLOW_MENU.hidden) openTopbarOverflowMenu();
    else closeTopbarOverflowMenu();
  }

  function attachRoomReorder(card, handle) {
    let active = false;
    let dragging = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let floatOffsetY = 0;
    let placeholder = null;

    function visibleRooms() {
      return Array.from(M.ROOMS_EL.querySelectorAll(".room:not(.hidden):not(.room-dragging)"));
    }

    function movePlaceholderForY(y) {
      if (!placeholder) return;
      const roomCards = visibleRooms();
      let insertBefore = null;
      for (const roomCard of roomCards) {
        const rect = roomCard.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
          insertBefore = roomCard;
          break;
        }
      }
      if (insertBefore) M.ROOMS_EL.insertBefore(placeholder, insertBefore);
      else M.ROOMS_EL.appendChild(placeholder);
    }

    function positionFloat(clientY) {
      card.style.top = (clientY - floatOffsetY) + "px";
    }

    function beginDrag(e) {
      dragging = true;
      M.reorderBusy = true;
      const rect = card.getBoundingClientRect();
      floatOffsetY = e.clientY - rect.top;
      placeholder = ce("div", "room-drag-placeholder");
      placeholder.style.height = rect.height + "px";
      card.parentNode.insertBefore(placeholder, card);
      card.classList.add("room-dragging");
      card.style.width = rect.width + "px";
      card.style.left = rect.left + "px";
      card.style.top = rect.top + "px";
      positionFloat(e.clientY);
      movePlaceholderForY(e.clientY);
    }

    function commitDrag() {
      if (placeholder?.parentNode) {
        M.ROOMS_EL.insertBefore(card, placeholder);
        placeholder.remove();
      }
      card.classList.remove("room-dragging");
      card.style.width = "";
      card.style.left = "";
      card.style.top = "";
      placeholder = null;
      updateDraftOrderFromDom();
      updateMoveButtons();
    }

    function cleanupListeners() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    }

    function onMove(e) {
      if (!active) return;
      if (!dragging) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.hypot(dx, dy) < M.REORDER_DRAG_THRESHOLD) return;
        beginDrag(e);
      }
      e.preventDefault();
      positionFloat(e.clientY);
      movePlaceholderForY(e.clientY);
    }

    function onUp() {
      if (!active) return;
      if (dragging) commitDrag();
      active = false;
      dragging = false;
      M.reorderBusy = false;
      cleanupListeners();
      try { handle.releasePointerCapture(pointerId); } catch {}
    }

    handle.addEventListener("pointerdown", (e) => {
      if (!M.reorderMode) return;
      e.preventDefault();
      e.stopPropagation();
      active = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      handle.setPointerCapture(pointerId);
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  function attachNavReorder(wrap, handle) {
    let active = false;
    let dragging = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let floatOffsetX = 0;
    let placeholder = null;
    const nav = () => document.querySelector(".quick-nav");

    function visibleItems() {
      const el = nav();
      if (!el) return [];
      return Array.from(el.querySelectorAll(".nav-reorder-item:not(.nav-dragging)"));
    }

    function movePlaceholderForX(x) {
      if (!placeholder) return;
      const el = nav();
      if (!el) return;
      const items = visibleItems();
      let insertBefore = null;
      for (const item of items) {
        const rect = item.getBoundingClientRect();
        if (x < rect.left + rect.width / 2) {
          insertBefore = item;
          break;
        }
      }
      if (insertBefore) el.insertBefore(placeholder, insertBefore);
      else el.appendChild(placeholder);
    }

    function positionFloat(clientX) {
      wrap.style.left = (clientX - floatOffsetX) + "px";
    }

    function beginDrag(e) {
      dragging = true;
      M.reorderBusy = true;
      const rect = wrap.getBoundingClientRect();
      floatOffsetX = e.clientX - rect.left;
      placeholder = ce("div", "nav-drag-placeholder");
      placeholder.style.width = rect.width + "px";
      placeholder.style.height = rect.height + "px";
      wrap.parentNode.insertBefore(placeholder, wrap);
      wrap.classList.add("nav-dragging");
      wrap.style.width = rect.width + "px";
      wrap.style.left = rect.left + "px";
      wrap.style.top = rect.top + "px";
      positionFloat(e.clientX);
      movePlaceholderForX(e.clientX);
    }

    function commitDrag() {
      const el = nav();
      if (placeholder?.parentNode && el) el.insertBefore(wrap, placeholder);
      placeholder?.remove();
      wrap.classList.remove("nav-dragging");
      wrap.style.width = "";
      wrap.style.left = "";
      wrap.style.top = "";
      placeholder = null;
      updateNavDraftOrderFromDom();
    }

    function cleanupListeners() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    }

    function onMove(e) {
      if (!active) return;
      if (!dragging) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.hypot(dx, dy) < M.REORDER_DRAG_THRESHOLD) return;
        beginDrag(e);
      }
      e.preventDefault();
      positionFloat(e.clientX);
      movePlaceholderForX(e.clientX);
    }

    function onUp() {
      if (!active) return;
      try {
        if (dragging) commitDrag();
      } finally {
        if (placeholder?.parentNode) {
          placeholder.remove();
          placeholder = null;
        }
        if (wrap.classList.contains("nav-dragging")) {
          wrap.classList.remove("nav-dragging");
          wrap.style.width = "";
          wrap.style.left = "";
          wrap.style.top = "";
        }
        active = false;
        dragging = false;
        M.reorderBusy = false;
        cleanupListeners();
        try { handle.releasePointerCapture(pointerId); } catch {}
      }
    }

    handle.addEventListener("pointerdown", (e) => {
      if (!M.reorderMode) return;
      e.preventDefault();
      e.stopPropagation();
      active = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      handle.setPointerCapture(pointerId);
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  function setupNavReorderItems() {
    const nav = document.querySelector(".quick-nav");
    if (!nav || nav.dataset.reorderReady) return;
    nav.dataset.reorderReady = "1";
    const entries = [{ key: "lights", btn: M.QUICK_LIGHTS_BTN }];
    for (const { id, popup } of QUICK_NAV) entries.push({ key: popup, btn: document.getElementById(id) });
    for (const { key, btn } of entries) {
      if (!btn) continue;
      btn.dataset.navKey = key;
      const wrap = ce("div", "nav-reorder-item");
      wrap.dataset.navKey = key;
      nav.insertBefore(wrap, btn);
      wrap.appendChild(btn);
      const handle = ce("button", "nav-drag-handle");
      handle.type = "button";
      handle.setAttribute("aria-label", "Drag to reorder");
      handle.innerHTML = DRAG_HANDLE_SVG;
      wrap.appendChild(handle);
      attachNavReorder(wrap, handle);
      M.navEls.set(key, { wrap, btn, handle });
    }
  }

  function relocateNavForReorder() {
    if (!M.cfg.enableDrawer || M.navReorderDrawerRelocated) return;
    const d = M.resolveDrawerDom();
    const nav = document.querySelector(".quick-nav");
    if (!d || !nav || nav.parentElement === d.topbar) return;
    if (M.drawerOpen || M.drawerClosing) M.closeDrawer();
    d.topbar.appendChild(nav);
    M.navReorderDrawerRelocated = true;
  }

  function restoreNavAfterReorder() {
    if (!M.navReorderDrawerRelocated) return;
    const d = M.resolveDrawerDom();
    const nav = document.querySelector(".quick-nav");
    if (d && nav) d.navSlot.appendChild(nav);
    M.navReorderDrawerRelocated = false;
  }

  function render(d) {
    M.replaceList(M.hubModes, d.hubModes);
    if (!hubModeLocked()) M.currentHubMode = d.currentHubMode || "";
    if (!hsmLocked()) {
      M.hsmStatus = d.hsmStatus || "";
      M.hsmAlert = d.hsmAlert || "";
      M.hsmAlertDesc = d.hsmAlertDesc || "";
    }
    M.hsmEnabled = !!d.hsmEnabled;
    M.hsmPinRequired = !!d.hsmPinRequired;
    M.thermostatsPopupEnabled = d.thermostatsPopupEnabled !== false;
    M.outletsSeparateTab = !!d.outletsSeparateTab;
    M.unlockPinEnabled = !!d.unlockPinEnabled;
    M.unlockPinRequired = !!d.unlockPinRequired;
    M.replaceList(M.scenes, d.scenes);
    M.replaceList(M.locks, d.locks);
    M.replaceList(M.windowShades, d.windowShades);
    if (!Array.isArray(M.valves)) M.valves = [];
    M.replaceList(M.valves, Array.isArray(d.valves) ? d.valves : []);
    M.replaceList(M.music, d.music);
    if (Array.isArray(d.config?.favorites)) M.replaceList(M.favorites, d.config.favorites.map(Number));
    M.reapplyLockOptimistic();
    M.reapplyShadeOptimistic();
    try { M.reapplyValveOptimistic(); } catch {}
    M.reapplyMusicOptimistic();
    M.reapplySetpointOptimistic();

    M.replaceList(M.rooms, M.sortRoomsByOrder(d.rooms || [], M.cfg.roomOrder));
    M.syncRoomMap();
    M.replaceList(M.devices, d.devices);
    M.replaceList(M.outlets, d.outlets);
    M.replaceList(M.thermostats, d.thermostats);
    M.replaceList(M.tempSensors, d.tempSensors);
    M.replaceList(M.sensors, d.sensors);
    M.snapshots = d.snapshots && typeof d.snapshots === "object" ? d.snapshots : {};
    M.rebuildDevicesByRoom();
    M.rebuildOutletsByRoom();
    M.reapplySwitchOptimistic();
    M.reapplyTstatDeviceModeLocks();
    M.applyTstatSessionModeLock();

    M.repopulateThermoByRoom();
    M.repopulateSensorByRoom();
    M.ensureRoomsFromDevices();
    M.updateQuickNavVisibility();

    if (!M.devices.length && !M.outlets.length && !M.thermostats.length && !M.tempSensors.length) { M.noDevicesState(); return; }

    const groups = new Map();
    for (const dev of M.devices) {
      const rid = normalizeRoomId(dev.r);
      if (!groups.has(rid)) groups.set(rid, []);
      groups.get(rid).push(dev);
    }
    const hasContent = (rid) => (groups.get(normalizeRoomId(rid))?.length || M.roomHasClimate(rid));
    const displayOrder = M.getDisplayRoomIds(groups, hasContent);

    const sig = displayOrder.join(",") + "|" + M.devices.map(x => x.i).join(",")
      + "|" + M.outlets.map(x => x.i).join(",") + "|" + (M.outletsSeparateTab ? 1 : 0)
      + "|" + M.thermostats.map(x => x.i).join(",") + "|" + M.tempSensors.map(x => x.i).join(",");
    const fullRerender = sig !== M.lastDataSig;
    M.lastDataSig = sig;

    if (fullRerender && !M.reorderMode) buildDom();
    updateRoomSnapshotUi();
    updateStates();
    M.updateClimateWidgets();
    M.applySearch();
    M.refreshQuickPopupIfOpen();
  }

  function buildDom() {
    M.ROOMS_EL.innerHTML = "";
    M.roomEls.clear(); M.devMap.clear(); M.outletMap.clear(); M.climateEls.clear();

    // group M.devices by room id (null/undefined -> -1 Unassigned)
    const groups = new Map();
    for (const dev of M.devices) {
      const rid = normalizeRoomId(dev.r);
      if (!groups.has(rid)) groups.set(rid, []);
      groups.get(rid).push(dev);
    }
    const outletGroups = new Map();
    if (M.outletsInLightsRooms()) {
      for (const out of M.outlets) {
        const rid = normalizeRoomId(out.r);
        if (!outletGroups.has(rid)) outletGroups.set(rid, []);
        outletGroups.get(rid).push(out);
      }
    }

    // a room is shown if it has lights, M.outlets (when in M.rooms), M.thermostats, or temp M.sensors
    const hasContent = (rid) => {
      const key = normalizeRoomId(rid);
      const hasOutlets = M.outletsInLightsRooms() && (outletGroups.get(key)?.length || 0) > 0;
      return (groups.get(key)?.length || hasOutlets || M.roomHasClimate(key));
    };

    const orderedIds = M.getDisplayRoomIds(groups, hasContent);

    for (const rid of orderedIds) {
      const roomKey = normalizeRoomId(rid);
      const devs = groups.get(roomKey) || [];
      const roomOutlets = M.outletsInLightsRooms() ? (outletGroups.get(roomKey) || []) : [];
      const name = roomKey === -1 ? "Unassigned" : (M.roomMap.get(roomKey) || "Room");

      const card = ce("section", "room");
      card.dataset.roomId = roomKey;
      card.dataset.roomName = String(name).toLowerCase();

      const head = ce("div", "room-head");
      const dragHandle = ce("button", "room-drag-handle");
      dragHandle.type = "button";
      dragHandle.setAttribute("aria-label", "Drag to reorder");
      dragHandle.innerHTML = DRAG_HANDLE_SVG;
      head.appendChild(dragHandle);

      const title = ce("div", "room-title");
      const nameEl = ce("div", "room-name"); nameEl.textContent = name;
      const meta = ce("div", "room-meta");
      title.appendChild(nameEl); title.appendChild(meta);
      head.appendChild(title);

      const moveBtns = ce("div", "room-move-btns");
      const moveUp = ce("button", "room-move-btn");
      moveUp.type = "button";
      moveUp.setAttribute("aria-label", "Move room up");
      moveUp.innerHTML = MOVE_UP_SVG;
      moveUp.addEventListener("click", (e) => { e.stopPropagation(); moveRoom(roomKey, -1); });
      const moveDown = ce("button", "room-move-btn");
      moveDown.type = "button";
      moveDown.setAttribute("aria-label", "Move room down");
      moveDown.innerHTML = MOVE_DOWN_SVG;
      moveDown.addEventListener("click", (e) => { e.stopPropagation(); moveRoom(roomKey, 1); });
      moveBtns.appendChild(moveUp); moveBtns.appendChild(moveDown);
      head.appendChild(moveBtns);

      // climate widget (thermostat or temp sensor) — left of Off button
      const climate = M.roomClimateInfo(roomKey);
      if (climate) {
        const el = ce(climate.controllable ? "button" : "div",
          "room-climate" + (climate.controllable ? " room-climate-control" : " room-climate-sensor"));
        if (climate.controllable) el.type = "button";
        let iconEl = null;
        if (climate.controllable) {
          iconEl = ce("span", "room-tstat-icon state-off");
          iconEl.innerHTML = TSTAT_SVG;
          el.appendChild(iconEl);
        }
        const tempEl = ce("span", "room-tstat-temp");
        tempEl.textContent = M.formatRoomTemp(climate.device);
        el.appendChild(tempEl);
        if (climate.controllable) {
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (M.colorSession) M.closeColorPopup(true);
            if (M.quickPopup?.classList.contains("open")) M.closeQuickPopup();
            M.openTstatPopup(roomKey, el);
          });
        }
        head.appendChild(el);
        M.climateEls.set(roomKey, { el, iconEl, tempEl, controllable: climate.controllable });
      }

      const toggle = ce("div", "room-toggle");

      const offTrack = ce("div", "slide-confirm-track room-slide-track room-slide-off");
      const saveBtn = ce("button", "slide-confirm-action room-snap-action room-snap-save");
      saveBtn.type = "button";
      saveBtn.textContent = "Save Current State";
      saveBtn.setAttribute("aria-label", "Save current state");
      saveBtn.tabIndex = -1;
      const offBtn = ce("button", "btn-off");
      offBtn.type = "button";
      offBtn.textContent = "Off";
      offTrack.appendChild(saveBtn);
      offTrack.appendChild(offBtn);
      offTrack.appendChild(ce("span", "slide-confirm-thumb"));

      const onTrack = ce("div", "slide-confirm-track room-slide-track room-slide-on");
      const onBtn = ce("button", "btn-on");
      onBtn.type = "button";
      onBtn.textContent = "On";
      const restoreBtn = ce("button", "slide-confirm-action room-snap-action room-snap-restore");
      restoreBtn.type = "button";
      restoreBtn.textContent = "Restore Saved State";
      restoreBtn.setAttribute("aria-label", "Restore saved state");
      restoreBtn.tabIndex = -1;
      restoreBtn.disabled = true;
      restoreBtn.setAttribute("aria-disabled", "true");
      onTrack.appendChild(onBtn);
      onTrack.appendChild(restoreBtn);
      onTrack.appendChild(ce("span", "slide-confirm-thumb"));

      toggle.appendChild(offTrack);
      toggle.appendChild(onTrack);
      head.appendChild(toggle);

      attachRoomSlideAction(offTrack, offBtn, saveBtn, {
        direction: "left",
        onTap: () => roomAll(roomKey, "off"),
        onCommit: () => {
          snapshotSaveApi("room", roomKey).then((ok) => {
            if (!ok) return;
            const snapDevs = M.devicesByRoom.get(roomKey) || [];
            M.snapshots[snapshotRoomKey(roomKey)] = { ts: Date.now(), count: snapDevs.length };
            updateRoomSnapshotUi();
            M.flash(roomLabel(roomKey) + " saved");
          });
        },
        canCommit: () => true,
      });

      attachRoomSlideAction(onTrack, onBtn, restoreBtn, {
        direction: "right",
        onTap: () => roomAll(roomKey, "on"),
        onCommit: () => {
          snapshotRestoreApi("room", roomKey).then((ok) => {
            if (ok) M.flash("Restoring " + roomLabel(roomKey) + "…");
          });
        },
        canCommit: () => !!M.snapshots[snapshotRoomKey(roomKey)],
      });

      const col = ce("button", "room-collapse"); col.type = "button"; col.setAttribute("aria-label", "Collapse room");
      col.innerHTML = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
      col.addEventListener("click", (e) => {
        e.stopPropagation();
        card.classList.toggle("collapsed");
        M.persistCollapsed();
        M.updateExpandAllBtn();
      });
      head.appendChild(col);

      const body = ce("div", "room-body");

      card.appendChild(head); card.appendChild(body);
      M.ROOMS_EL.appendChild(card);

      attachRoomReorder(card, dragHandle);
      M.roomEls.set(roomKey, { card, body, meta, moveUp, moveDown, offTrack, onTrack, saveBtn, restoreBtn });

      for (const dev of devs) body.appendChild(makeTile(dev));
      for (const out of roomOutlets) body.appendChild(makeOutletTile(out));
    }

    M.restoreCollapsed();
    updateRoomMeta();
    updateRoomSnapshotUi();
    M.updateClimateWidgets();
    updateMoveButtons();
  }

  function makeTile(dev, context) {
    const inFavorites = context === "favorites";
    const isDim = !!dev.d;
    const tile = ce("section", "tile " + (isDim ? "dimmer" : "switch"));
    tile.dataset.id = dev.i;
    tile.dataset.name = String(dev.n || "").toLowerCase();

    const fullName = dev.n || ("Device " + dev.i);
    const roomName = dev.r != null && dev.r !== -1 ? M.roomMap.get(dev.r) : null;
    const shortName = (dev.n ? stripRoomPrefix(dev.n, roomName) : null) || fullName;

    const head = ce("div", "tile-head");
    const name = ce("div", "tile-name");
    name.textContent = shortName;
    if (dev.n) name.title = dev.n;
    const bulb = ce("button", "tile-bulb");
    bulb.type = "button";
    bulb.setAttribute("aria-label", "Toggle " + shortName);
    bulb.setAttribute("aria-pressed", dev.s ? "true" : "false");
    head.appendChild(name); head.appendChild(bulb);
    tile.appendChild(head);

    attachBulbTap(bulb, dev);
    if (isDim) attachColorNameClick(name, dev, shortName);

    if (isDim) {
      const slider = ce("div", "slider");
      const inner = ce("div", "slider-inner");
      inner.appendChild(ce("div", "slider-dim"));
      slider.appendChild(inner);
      const thumb = ce("div", "slider-thumb");
      slider.appendChild(thumb);
      tile.appendChild(slider);
      attachDrag(tile, slider);
    }

    const fav = ce("button", "tile-fav");
    fav.type = "button";
    attachFavButton(fav, dev.i);

    const foot = ce("div", "tile-foot");
    const state = ce("span", "tile-state"); state.textContent = dev.s ? "On" : "Off";
    const level = ce("span", "tile-level");
    level.textContent = formatFootText(dev, isDim);
    const footStart = ce("div", "tile-foot-start");
    footStart.appendChild(fav);
    footStart.appendChild(state);
    foot.appendChild(footStart);
    foot.appendChild(level);
    tile.appendChild(foot);

    if (!isDim) {
      attachSwitchTap(tile, dev.i);
    }

    const rec = { el: tile, data: dev, isDim, levelEl: level, stateEl: state, sliderEl: isDim ? qs(".slider", tile) : null };
    if (inFavorites) M.favDevMap.set(dev.i, rec);
    else M.devMap.set(dev.i, rec);
    return tile;
  }

  function makeOutletTile(outlet, context) {
    const inFavorites = context === "favorites";
    const inOutletsTab = context === "outlets";
    const tile = ce("section", "tile switch outlet" + (inOutletsTab ? " outlet-tab-card" : ""));
    tile.dataset.id = outlet.i;
    tile.dataset.name = String(outlet.n || "").toLowerCase();

    const fullName = outlet.n || ("Outlet " + outlet.i);
    const roomName = outlet.r != null && outlet.r !== -1 ? M.roomMap.get(outlet.r) : null;
    const shortName = (outlet.n ? stripRoomPrefix(outlet.n, roomName) : null) || fullName;

    const socket = ce("button", "tile-socket" + (inOutletsTab ? " outlet-tab-socket" : ""));
    socket.type = "button";
    socket.setAttribute("aria-label", "Toggle " + shortName);
    socket.setAttribute("aria-pressed", outlet.s ? "true" : "false");
    const face = ce("span", "tile-socket-face");
    face.appendChild(ce("span", "tile-socket-slot tile-socket-slot-l"));
    face.appendChild(ce("span", "tile-socket-slot tile-socket-slot-r"));
    face.appendChild(ce("span", "tile-socket-ground"));
    socket.appendChild(face);
    attachOutletSocketTap(socket, outlet.i);

    const fav = ce("button", "tile-fav");
    fav.type = "button";
    attachFavButton(fav, outlet.i);

    const state = ce("span", "tile-state");
    state.textContent = outlet.s ? "On" : "Off";
    const level = ce("span", "tile-level");
    level.textContent = "Outlet";
    const name = ce("div", "tile-name" + (inOutletsTab ? " outlet-tab-name" : ""));
    name.textContent = shortName;
    if (outlet.n) name.title = outlet.n;

    if (inOutletsTab) {
      const visual = ce("div", "outlet-tab-visual");
      visual.appendChild(socket);
      const status = ce("div", "outlet-tab-status");
      status.appendChild(state);
      const foot = ce("div", "outlet-tab-foot");
      foot.appendChild(level);
      foot.appendChild(name);
      tile.appendChild(fav);
      tile.appendChild(visual);
      tile.appendChild(status);
      tile.appendChild(foot);
    } else {
      const head = ce("div", "tile-head");
      head.appendChild(name);
      head.appendChild(socket);
      tile.appendChild(head);
      const foot = ce("div", "tile-foot");
      const footStart = ce("div", "tile-foot-start");
      footStart.appendChild(fav);
      footStart.appendChild(state);
      foot.appendChild(footStart);
      foot.appendChild(level);
      tile.appendChild(foot);
    }

    attachSwitchTap(tile, outlet.i);

    const rec = { el: tile, data: outlet, isDim: false, isOutlet: true, levelEl: level, stateEl: state, sliderEl: null };
    if (inFavorites) M.favDevMap.set(outlet.i, rec);
    else M.outletMap.set(outlet.i, rec);
    return tile;
  }

  function attachOutletSocketTap(socket, id) {
    socket.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleOutlet(id);
    });
  }

  // Tap detector for switch tiles: ignores scrolls, long-presses, and taps on the name.
  function attachSwitchTap(tile, id) {
    const TAP_MOVE = 10;
    const TAP_MAX_MS = 500;
    let downX = 0, downY = 0, downT = 0, active = false;
    const isOutlet = tile.classList.contains("outlet");

    tile.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest(".tile-bulb")) return;
      if (e.target.closest(".tile-socket")) return;
      if (e.target.closest(".tile-fav")) return;
      active = true;
      downX = e.clientX; downY = e.clientY; downT = Date.now();
    }, { passive: true });

    tile.addEventListener("pointerup", (e) => {
      if (!active) return;
      active = false;
      if (e.target.closest(".tile-bulb")) return;
      if (e.target.closest(".tile-socket")) return;
      if (e.target.closest(".tile-name")) return;
      if (e.target.closest(".tile-fav")) return;
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);
      if (dx > TAP_MOVE || dy > TAP_MOVE) return;
      if (Date.now() - downT > TAP_MAX_MS) return;
      if (isOutlet) toggleOutlet(id);
      else toggleSwitch(id);
    }, { passive: true });

    tile.addEventListener("pointercancel", () => { active = false; }, { passive: true });
  }

  function attachBulbTap(bulb, dev) {
    const id = dev.i;
    const isDim = !!dev.d;
    bulb.addEventListener("click", (e) => {
      e.stopPropagation();
      if (M.colorSession && M.colorSession.id !== id) M.closeColorPopup(true);
      if (M.tstatSession) M.closeTstatPopup();
      if (isDim) toggleDimmer(id); else toggleSwitch(id);
    });
  }

  function attachColorNameClick(nameEl, dev, displayName) {
    const id = dev.i;
    const label = displayName || dev.n || "light";
    nameEl.classList.add("color-capable");
    nameEl.setAttribute("role", "button");
    nameEl.setAttribute("tabindex", "0");
    nameEl.setAttribute("aria-label", (dev.ct || dev.rgb ? "Light settings" : "Brightness") + " — " + label);

    function open(e) {
      e.stopPropagation();
      if (M.tstatSession) M.closeTstatPopup();
      if (M.colorSession && M.colorSession.id !== id) M.closeColorPopup(true);
      const rec = M.devMap.get(id);
      M.openColorPopup(id, nameEl, rec?.data || dev);
    }

    nameEl.addEventListener("click", open);
    nameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e); }
    });
  }

  function clampLevel(level) {
    const n = Number(level);
    if (isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function setSliderLevel(slider, level) {
    slider.style.setProperty("--level", clampLevel(level));
  }

  function syncTileState(rec, dev) {
    if (!rec) return;
    rec.data = dev;
    const on = M.effectiveSwitch(dev);
    rec.el.classList.toggle("on", on);
    rec.el.classList.toggle("off", !on);
    rec.stateEl.textContent = on ? "On" : "Off";
    const bulb = qs(".tile-bulb", rec.el);
    if (bulb) bulb.setAttribute("aria-pressed", on ? "true" : "false");
    const socket = qs(".tile-socket", rec.el);
    if (socket) socket.setAttribute("aria-pressed", on ? "true" : "false");
    const nameEl = qs(".tile-name", rec.el);
    if (nameEl) nameEl.classList.toggle("color-capable", rec.isDim);
    if (rec.isOutlet) {
      rec.levelEl.textContent = M.outletsSeparateTab ? roomLabel(dev.r) : "Outlet";
    } else {
      rec.levelEl.textContent = formatFootText(
        rec.isDim ? { ...dev, l: M.effectiveLevel(dev) } : dev,
        rec.isDim
      );
    }
    if (rec.isDim) {
      const displayL = M.effectiveLevel(dev);
      if (!rec.el.classList.contains("dragging") && displayL != null) {
        setSliderLevel(rec.sliderEl, displayL);
      }
    }
    M.syncFavButton(rec.el.querySelector(".tile-fav"), dev.i);
  }

  function updateStates() {
    for (const dev of M.devices) {
      syncTileState(M.devMap.get(dev.i), dev);
      syncTileState(M.favDevMap.get(dev.i), dev);
    }
    for (const out of M.outlets) {
      syncTileState(M.outletMap.get(out.i), out);
      syncTileState(M.favDevMap.get(out.i), out);
    }
    updateRoomMeta();
  }

  function updateRoomMeta() {
    for (const [rid, rec] of M.roomEls) {
      const devs = M.devicesByRoom.get(rid) || [];
      const roomOutlets = M.outletsInLightsRooms() ? (M.outletsByRoom.get(rid) || []) : [];
      const onCount = devs.filter((d) => M.effectiveSwitch(d)).length;
      const total = devs.length;
      const outletOn = roomOutlets.filter((o) => M.effectiveSwitch(o)).length;
      const outletTotal = roomOutlets.length;
      const hasClimate = M.roomHasClimate(rid);
      let text;
      if (total > 0) {
        text = onCount ? onCount + " of " + total + " on" : (total + " light" + (total === 1 ? "" : "s"));
        if (M.outletsInLightsRooms() && outletTotal > 0) {
          text += " · " + outletTotal + " outlet" + (outletTotal === 1 ? "" : "s");
          if (outletOn) text += " (" + outletOn + " on)";
        }
      } else if (M.outletsInLightsRooms() && outletTotal > 0) {
        text = outletOn
          ? outletOn + " of " + outletTotal + " outlet" + (outletTotal === 1 ? "" : "s") + " on"
          : (outletTotal + " outlet" + (outletTotal === 1 ? "" : "s"));
      } else if (M.thermoByRoom.has(rid)) {
        const t = (M.thermoByRoom.get(rid) || [])[0];
        const tm = String(t?.tm || "").toLowerCase();
        text = tm && tm !== "off" ? tm : "Thermostat";
      } else if (M.sensorByRoom.has(rid)) {
        text = (M.sensorByRoom.get(rid)[0]?.n) || "Temperature";
      } else {
        text = "";
      }
      rec.meta.textContent = text;
      let state = "mixed";
      if (total > 0) {
        if (onCount === 0) state = "all-off";
        else if (onCount === total) state = "all-on";
      } else if (M.outletsInLightsRooms() && outletTotal > 0 || hasClimate) {
        state = "all-off";
      }
      rec.card.classList.remove("room-all-on", "room-all-off", "room-mixed", "room-on");
      rec.card.classList.add("room-" + state);
    }
  }

  // ---------- dimmer drag ----------
  function attachDrag(tile, slider) {
    const id = Number(tile.dataset.id);
    const levelEl = qs(".tile-level", tile);
    const INTENT = 8;
    const TAP_MOVE = 10;
    let dragging = false;
    let aborted = false;
    let startX = 0, startY = 0;
    let lastCommit = 0;
    let pendingLevel = null;
    let downLevel = null;

    function pctFromEvent(e) {
      return M.trackPctFromEvent(slider, e);
    }
    function setVisual(p) {
      const level = clampLevel(p);
      setSliderLevel(slider, level);
      if (levelEl) levelEl.textContent = level + "%";
    }
    function commitLevel(p) {
      setVisual(p);
      M.setLevelOptimistic(id, p);
      M.sendCmd(id, "setLevel", p);
      const dev = M.devices.find((d) => d.i === id);
      if (dev) {
        dev.s = p > 0 ? 1 : 0;
        dev.l = p;
        updateStates();
      }
    }
    function cleanup() {
      dragging = false;
      aborted = false;
      slider.classList.remove("dragging");
      tile.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    }
    function start(e) {
      if (e.button != null && e.button !== 0) return;
      dragging = false;
      aborted = false;
      startX = e.clientX; startY = e.clientY;
      downLevel = pctFromEvent(e);
      pendingLevel = downLevel;
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", end, { passive: false });
      window.addEventListener("pointercancel", end, { passive: false });
    }
    function move(e) {
      if (aborted) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < INTENT && Math.abs(dy) < INTENT) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          aborted = true;
          cleanup();
          return;
        }
        dragging = true;
        slider.classList.add("dragging");
        tile.classList.add("dragging");
      }
      e.preventDefault();
      const p = pctFromEvent(e);
      setVisual(p);
      pendingLevel = p;
      const now = Date.now();
      if (now - lastCommit > 350) {
        lastCommit = now;
        M.setLevelOptimistic(id, p);
        M.sendCmd(id, "setLevel", p);
      }
    }
    function end(e) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (aborted) { cleanup(); return; }
      if (dragging) {
        const p = pendingLevel == null ? 0 : pendingLevel;
        slider.classList.remove("dragging");
        tile.classList.remove("dragging");
        dragging = false;
        commitLevel(p);
        return;
      }
      // tap-to-jump: only if finger barely moved
      if (e && e.clientX != null) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx <= TAP_MOVE && dy <= TAP_MOVE) commitLevel(downLevel);
      }
      cleanup();
    }
    slider.addEventListener("pointerdown", start);
  }

  function attachShadeDrag(tile, slider, shadeId, onLevelChange) {
    const INTENT = 8;
    const TAP_MOVE = 10;
    let dragging = false;
    let aborted = false;
    let startX = 0, startY = 0;
    let lastCommit = 0;
    let pendingLevel = null;
    let downLevel = null;

    function pctFromEvent(e) {
      return M.trackPctFromEvent(slider, e);
    }
    function setVisual(p) {
      const level = clampLevel(p);
      setSliderLevel(slider, level);
      if (onLevelChange) onLevelChange(level);
    }
    function commitLevel(p) {
      setVisual(p);
      sendShadeCmd(shadeId, "setPosition", p);
    }
    function cleanup() {
      dragging = false;
      aborted = false;
      slider.classList.remove("dragging");
      tile.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    }
    function start(e) {
      if (e.button != null && e.button !== 0) return;
      dragging = false;
      aborted = false;
      startX = e.clientX; startY = e.clientY;
      downLevel = pctFromEvent(e);
      pendingLevel = downLevel;
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", end, { passive: false });
      window.addEventListener("pointercancel", end, { passive: false });
    }
    function move(e) {
      if (aborted) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < INTENT && Math.abs(dy) < INTENT) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          aborted = true;
          cleanup();
          return;
        }
        dragging = true;
        slider.classList.add("dragging");
        tile.classList.add("dragging");
      }
      e.preventDefault();
      const p = pctFromEvent(e);
      setVisual(p);
      pendingLevel = p;
      const now = Date.now();
      if (now - lastCommit > 350) {
        lastCommit = now;
        sendShadeCmd(shadeId, "setPosition", p);
      }
    }
    function end(e) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (aborted) { cleanup(); return; }
      if (dragging) {
        const p = pendingLevel == null ? 0 : pendingLevel;
        slider.classList.remove("dragging");
        tile.classList.remove("dragging");
        dragging = false;
        commitLevel(p);
        return;
      }
      if (e && e.clientX != null) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx <= TAP_MOVE && dy <= TAP_MOVE) commitLevel(downLevel);
      }
      cleanup();
    }
    slider.addEventListener("pointerdown", start);
  }

  // ---------- commands ----------
  // Diagnostic shown when the user enables haptics, so we can tell exactly why
  // the device isn't buzzing (secure context, API presence, or call acceptance).
  function testHaptics() {
    const secure = window.isSecureContext;
    const vibrate = navigator.vibrate;
    const hasApi = typeof vibrate === "function";
    let accepted = false;
    if (secure && hasApi) {
      try { accepted = !!vibrate.call(navigator, [60, 40, 60]); } catch {}
    }
    const parts = [];
    parts.push(secure ? "HTTPS ok" : "no HTTPS (local URL?)");
    parts.push(hasApi ? "API ok" : "no vibrate API");
    if (secure && hasApi) parts.push(accepted ? "call ok" : "call rejected");
    M.flash("Haptics: " + parts.join(" · "), !accepted);
  }

  function toggleSwitch(id) {
    M.hapticTap();
    const dev = M.devices.find((d) => d.i === id);
    if (!dev) return;
    const on = M.effectiveSwitch(dev);
    const next = on ? "off" : "on";
    M.setSwitchOptimistic(id, next === "on" ? 1 : 0);
    updateStates();
    M.sendCmd(id, next).then((r) => {
      if (!r?.ok) { M.clearSwitchOptimistic(id); refreshDevice(id); }
    });
  }

  function toggleOutlet(id) {
    M.hapticTap();
    const out = M.outlets.find((d) => d.i === id);
    if (!out) return;
    const on = M.effectiveSwitch(out);
    const next = on ? "off" : "on";
    M.setSwitchOptimistic(id, next === "on" ? 1 : 0);
    updateStates();
    M.sendCmd(id, next).then((r) => {
      if (!r?.ok) { M.clearSwitchOptimistic(id); M.refresh(); }
    });
  }

  function toggleDimmer(id) {
    M.hapticTap();
    const dev = M.devices.find((d) => d.i === id);
    if (!dev) return;
    if (M.effectiveSwitch(dev)) {
      M.setSwitchOptimistic(id, 0, 0);
      M.setLevelOptimistic(id, 0);
      updateStates();
      M.sendCmd(id, "off").then((r) => {
        if (!r?.ok) { M.clearSwitchOptimistic(id); refreshDevice(id); }
      });
    } else {
      M.setSwitchOptimistic(id, 1, null);
      updateStates();
      M.sendCmd(id, "on").then((r) => {
        if (!r?.ok) { M.clearSwitchOptimistic(id); refreshDevice(id); }
      });
      reconcileDevice(id);
    }
  }

  // After turning a dimmer on, learn the level the light restored to.
  // Locally the eventsocket pushes it instantly; remotely we poll the device.
  function reconcileDevice(id) {
    setTimeout(() => refreshDevice(id), 500);
    setTimeout(() => refreshDevice(id), 1500); // retry once in case the hub is slow
  }

  async function refreshDevice(id) {
    try {
      const d = await M.getJson("device?id=" + id);
      if (!d || d.i == null) return;
      const rec = M.devMap.get(Number(d.i));
      if (rec) {
        const dev = M.devices.find((x) => x.i === Number(d.i));
        if (dev) {
          dev.s = d.s ? 1 : 0;
          if (rec.isDim && d.l != null) dev.l = d.l;
          if (rec.data.ct && d.k != null) dev.k = d.k;
          if (rec.data.rgb && d.h != null) dev.h = d.h;
          if (rec.data.rgb && d.sat != null) dev.sat = d.sat;
        }
        const opt = M.switchOptimistic.get(Number(d.i));
        if (opt && !!dev?.s === !!opt.s) M.clearSwitchOptimistic(Number(d.i));
        updateStates();
        return;
      }
      // thermostat reconcile
      const t = M.thermostats.find(x => x.i === Number(d.i));
      if (t) {
        const modeLocked = M.tstatModeLocked(t.i);
        if (d.tm != null && !modeLocked) t.tm = d.tm;
        if (d.os != null && !modeLocked) t.os = d.os;
        M.applyTstatSetpoints(t, { hsp: d.hsp, csp: d.csp });
        if (d.temp != null) t.temp = Number(d.temp);
        if (d.hasFm != null) t.hasFm = d.hasFm;
        if (d.fm != null) t.fm = d.fm;
        if (d.hasFs != null) t.hasFs = d.hasFs;
        if (d.fs != null) t.fs = d.fs;
        M.updateClimateWidgets();
        updateRoomMeta();
        M.refreshOpenTstatQuickPopups();
        return;
      }
      const s = M.tempSensors.find(x => x.i === Number(d.i));
      if (s) {
        if (d.temp != null) s.temp = Number(d.temp);
        M.updateClimateWidgets();
        updateRoomMeta();
        if (M.currentCategory() === "sensors") M.refreshSensorsPopup();
        else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
        return;
      }
      const sen = M.sensors.find(x => x.i === Number(d.i));
      if (sen) {
        applySensorPayload(sen, d);
        if (M.currentCategory() === "sensors") M.refreshSensorsPopup();
        else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
        return;
      }
      const lock = M.locks.find(x => x.i === Number(d.i));
      if (lock) {
        if (d.lk != null) lock.lk = d.lk ? 1 : 0;
        if (d.st != null) lock.st = d.st;
        const opt = M.lockOptimistic.get(Number(d.i));
        if (opt && !!lock.lk === !!opt.lk) M.clearLockOptimistic(Number(d.i));
        if (M.currentCategory() === "locks") renderLocksPopup();
        else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
        return;
      }
      const shade = M.windowShades.find(x => x.i === Number(d.i));
      if (shade) {
        if (d.st != null) shade.st = d.st;
        if (d.pos != null) shade.pos = d.pos;
        const opt = M.shadeOptimistic.get(Number(d.i));
        if (opt) {
          let matched = true;
          if (opt.st != null && shade.st !== opt.st) matched = false;
          if (opt.pos != null && shade.pos !== opt.pos) matched = false;
          if (matched) M.clearShadeOptimistic(Number(d.i));
        }
        if (M.currentCategory() === "blinds") renderBlindsPopup();
        else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
        return;
      }
      const valve = M.valves.find(x => x.i === Number(d.i));
      if (valve) {
        if (d.st != null) valve.st = d.st;
        const opt = M.valveOptimistic.get(Number(d.i));
        if (opt?.st != null && valve.st === opt.st) M.clearValveOptimistic(Number(d.i));
        if (M.currentCategory() === "sensors") M.refreshSensorsPopup();
        else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
        return;
      }
      const mp = M.music.find(x => x.i === Number(d.i));
      if (mp) {
        if (d.st != null) mp.st = d.st;
        if (d.v != null) mp.v = d.v;
        if (d.tr != null) mp.tr = d.tr;
        if (d.m != null) mp.m = d.m;
        if (d.f != null) mp.f = d.f;
        const mopt = M.musicOptimistic.get(Number(d.i));
        if (mopt && (mopt.st == null || mp.st === mopt.st) && (mopt.v == null || mp.v === mopt.v)) {
          M.clearMusicOptimistic(Number(d.i));
        }
        if (M.currentCategory() === "music") renderMusicPopup();
        else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
      }
    } catch {}
  }

  function reconcileLock(id) {
    setTimeout(() => refreshDevice(id), 7000);
  }

  function reconcileShade(id) {
    setTimeout(() => refreshDevice(id), 700);
    setTimeout(() => refreshDevice(id), 2200);
  }

  function reconcileMusic(id) {
    setTimeout(() => refreshDevice(id), 700);
    setTimeout(() => refreshDevice(id), 2200);
  }

  async function sendMusicCmd(id, cmd, val) {
    const dev = M.music.find(m => m.i === id);
    if (!dev) return;
    const ctrl = M.musicControls(dev);
    if (cmd === "play" && !ctrl.play) return;
    if (cmd === "pause" && !ctrl.pause) return;
    if (cmd === "stop" && !ctrl.stop) return;
    if (cmd === "previousTrack" && !ctrl.prev) return;
    if (cmd === "nextTrack" && !ctrl.next) return;
    if (cmd === "setVolume" && !ctrl.volume) return;
    if ((cmd === "mute" || cmd === "unmute") && !ctrl.mute) return;
    M.hapticTap();
    let patch = {};
    if (cmd === "play") patch = { st: "playing" };
    else if (cmd === "pause") patch = { st: "paused" };
    else if (cmd === "stop") patch = { st: "stopped" };
    else if (cmd === "setVolume") patch = { v: Math.max(0, Math.min(100, Number(val))) };
    if (patch.st != null || patch.v != null) {
      M.setMusicOptimistic(id, patch);
      if (M.currentCategory() === "music") renderMusicPopup();
      else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    }
    const result = await M.sendCmd(id, cmd, val);
    if (!result.ok) {
      M.clearMusicOptimistic(id);
      reconcileMusic(id);
      if (M.currentCategory() === "music") renderMusicPopup();
      else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    } else {
      reconcileMusic(id);
    }
  }

  function broadcastMusic(cmd) {
    if (!M.music.length) return;
    M.hapticTap();
    for (const dev of M.music) {
      const ctrl = M.musicControls(dev);
      if (cmd === "play" && !ctrl.play) continue;
      if (cmd === "pause" && !ctrl.pause) continue;
      if (cmd === "stop" && !ctrl.stop) continue;
      sendMusicCmd(dev.i, cmd);
    }
  }

  async function broadcastMusicVolume(delta) {
    const capable = M.music.filter((d) => M.musicControls(d).volume);
    if (!capable.length) return;
    M.hapticTap();
    for (const dev of capable) {
      const base = M.effectiveMusicVolume(dev) ?? 0;
      const next = Math.max(0, Math.min(100, base + delta));
      M.setMusicOptimistic(dev.i, { v: next });
      M.sendCmd(dev.i, "setVolume", next).then((result) => {
        if (!result.ok) { M.clearMusicOptimistic(dev.i); reconcileMusic(dev.i); }
        else reconcileMusic(dev.i);
        if (M.currentCategory() === "music") renderMusicPopup();
        else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
      });
    }
    if (M.currentCategory() === "music") renderMusicPopup();
    else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
  }

  async function sendLockCmd(id, cmd, pin) {
    const lock = M.locks.find(l => l.i === id);
    if (!lock) return { ok: false };
    const lk = cmd === "lock" ? 1 : 0;
    const st = cmd === "lock" ? "locked" : "unlocked";
    M.hapticTap();
    M.setLockOptimistic(id, lk, st);
    if (M.currentCategory() === "locks") renderLocksPopup();
    else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    const result = await M.sendCmd(id, cmd, null, pin);
    if (!result.ok) {
      M.clearLockOptimistic(id);
      reconcileLock(id);
      if (M.currentCategory() === "locks") renderLocksPopup();
      else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    } else {
      reconcileLock(id);
    }
    return result;
  }

  async function sendShadeCmd(id, cmd, val) {
    const shade = M.windowShades.find(s => s.i === id);
    if (!shade) return { ok: false };
    M.hapticTap();
    let patch = {};
    if (cmd === "open") patch = { st: "opening" };
    else if (cmd === "close") patch = { st: "closing" };
    else if (cmd === "setPosition") patch = { pos: Math.max(0, Math.min(100, Number(val))) };
    if (patch.st != null || patch.pos != null) {
      M.setShadeOptimistic(id, patch);
      if (M.currentCategory() === "blinds") renderBlindsPopup();
      else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    }
    const result = await M.sendCmd(id, cmd, val);
    if (!result.ok) {
      M.clearShadeOptimistic(id);
      reconcileShade(id);
      if (M.currentCategory() === "blinds") renderBlindsPopup();
      else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    } else {
      reconcileShade(id);
    }
    return result;
  }

  function applySwitchCmdOptimistic(dev, cmd) {
    const id = dev.i;
    if (cmd === "on") {
      M.setSwitchOptimistic(id, 1, dev.d ? null : undefined);
    } else {
      M.setSwitchOptimistic(id, 0, dev.d ? 0 : undefined);
      if (dev.d) M.setLevelOptimistic(id, 0);
    }
  }

  function roomAll(rid, cmd) {
    M.hapticTap();
    const devs = M.devicesByRoom.get(rid) || [];
    if (!devs.length) return;
    const hasDimmer = devs.some(d => d.d);
    for (const dev of devs) applySwitchCmdOptimistic(dev, cmd);
    updateStates();
    bulkLightsApi(cmd, "room", rid);
    if (cmd === "on" && hasDimmer) setTimeout(M.refresh, 900); // reconcile restored levels
  }

  function allLights(cmd) {
    if (!M.devices.length) return;
    const hasDimmer = M.devices.some(d => d.d);
    for (const dev of M.devices) applySwitchCmdOptimistic(dev, cmd);
    updateStates();
    bulkLightsApi(cmd, "house");
    if (cmd === "on" && hasDimmer) setTimeout(M.refresh, 900);
  }

  function ensureQuickPopup() {
    if (M.quickPopup) {
      M.syncQuickPopupRef(M.quickPopup);
      return M.quickPopup;
    }
    const el = ce("div", "quick-popup");
    M.syncQuickPopupRef(el);
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    const panel = ce("div", "quick-panel");
    const head = ce("div", "quick-head");
    const title = ce("h2", "quick-title");
    const close = ce("button", "quick-close");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "\u00d7";
    const body = ce("div", "quick-body");
    head.appendChild(title);
    head.appendChild(close);
    panel.appendChild(head);
    panel.appendChild(body);
    el.appendChild(panel);
    M.appendPopup(el);

    M.bindPopupDismiss(el, panel, close, M.closeQuickPopup);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.classList.contains("open")) M.closeQuickPopup();
    });

    el._title = title;
    el._body = body;
    return el;
  }

  const WIDE_POPUP_TYPES = new Set(["favorites", "sensors", "thermostats", "blinds", "outlets", "scheduling"]);
  const HUB_MODE_POPUP_TYPE = "hub-mode";

  function syncQuickPopupWidth(popup, type) {
    popup.classList.toggle("quick-popup-wide", WIDE_POPUP_TYPES.has(type) && !M.inTabView());
    popup.classList.toggle("quick-popup-hub-mode", type === HUB_MODE_POPUP_TYPE);
  }

  function syncQuickPopupWidthForOpen(popup) {
    const type = M.inTabView() ? M.activeTab : M.quickPopupOpenType;
    if (type) syncQuickPopupWidth(popup, type);
  }

  function makeLockRow(lock, context) {
    const inFav = context === "favorites";
    const row = ce("div", "quick-lock-row" + (inFav ? " quick-fav-span" : ""));
    row.dataset.name = String(lock.n || "").toLowerCase();
    const head = ce("div", "quick-fav-row-head");
    const info = ce("div", "quick-lock-info");
    const name = ce("span", "quick-fav-name");
    name.textContent = lock.n || ("Lock " + lock.i);
    const meta = ce("span", "quick-fav-meta");
    meta.textContent = roomLabel(lock.r) + " · " + M.lockStatusLabel(lock);
    info.appendChild(name);
    info.appendChild(meta);
    head.appendChild(info);
    const fav = ce("button", "tile-fav");
    fav.type = "button";
    attachFavButton(fav, lock.i);
    head.appendChild(fav);
    row.appendChild(head);

    const actions = ce("div", "quick-lock-actions");
    const lockBtn = ce("button", "quick-lock-btn");
    lockBtn.type = "button";
    lockBtn.innerHTML = LOCK_BTN_SVG + '<span class="quick-lock-btn-label">Lock</span>';
    const unlockBtn = ce("button", "quick-lock-btn");
    unlockBtn.type = "button";
    unlockBtn.innerHTML = UNLOCK_BTN_SVG + '<span class="quick-lock-btn-label">Unlock</span>';
    const isLocked = M.effectiveLock(lock);
    if (isLocked) lockBtn.classList.add("active");
    else unlockBtn.classList.add("active");
    lockBtn.addEventListener("click", () => {
      if (!M.effectiveLock(lock)) sendLockCmd(lock.i, "lock");
    });
    unlockBtn.addEventListener("click", () => {
      if (!M.effectiveLock(lock)) return;
      if (M.unlockPinRequired) promptUnlockPin(lock.i, lock.n);
      else sendLockCmd(lock.i, "unlock");
    });
    actions.appendChild(lockBtn);
    actions.appendChild(unlockBtn);
    row.appendChild(actions);

    if (inFav) {
      M.favLockMap.set(lock.i, { el: row, meta, lockBtn, unlockBtn, favBtn: fav });
    }
    return row;
  }

  function updateFavoriteLockRow(lock) {
    const rec = M.favLockMap.get(lock.i);
    if (!rec) return;
    rec.meta.textContent = roomLabel(lock.r) + " · " + M.lockStatusLabel(lock);
    const isLocked = M.effectiveLock(lock);
    rec.lockBtn.classList.toggle("active", isLocked);
    rec.unlockBtn.classList.toggle("active", !isLocked);
  }

  function renderLocksPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = popup._body;
    body.className = "quick-body quick-body-locks";
    body.innerHTML = "";
    if (!M.locks.length) {
      body.textContent = "No locks selected — add locks in the Hubitat app settings";
      return;
    }
    if (M.unlockPinEnabled && !M.unlockPinRequired) {
      const hint = ce("p", "quick-lock-pin-hint");
      hint.textContent = "Set unlock PIN in Hubitat app settings";
      body.appendChild(hint);
    }
    const sorted = M.locks.slice().sort((a, b) => {
      const ra = roomLabel(a.r).localeCompare(roomLabel(b.r));
      if (ra !== 0) return ra;
      return String(a.n || "").localeCompare(String(b.n || ""));
    });
    const list = ce("div", "quick-list");
    for (const lock of sorted) list.appendChild(makeLockRow(lock, "popup"));
    body.appendChild(list);
  }

  function makeShadeTile(shade, context) {
    const inFav = context === "favorites";
    const tile = ce("div", "shade-tile" + (inFav ? " quick-fav-span" : ""));
    tile.dataset.name = String(shade.n || "").toLowerCase();
    const head = ce("div", "quick-fav-row-head");
    const info = ce("div", "shade-info");
    const name = ce("span", "quick-fav-name");
    name.textContent = shade.n || ("Shade " + shade.i);
    const meta = ce("span", "quick-fav-meta");
    meta.textContent = roomLabel(shade.r) + " · " + M.shadeStatusLabel(shade);
    info.appendChild(name);
    info.appendChild(meta);
    head.appendChild(info);
    const fav = ce("button", "tile-fav");
    fav.type = "button";
    attachFavButton(fav, shade.i);
    head.appendChild(fav);
    tile.appendChild(head);

    const moving = M.shadeIsMoving(shade);
    const pos = M.effectiveShadePosition(shade);
    const hasPos = shade.pos != null;
    let levelLabel = null;
    let slider = null;
    if (hasPos) {
      const sliderWrap = ce("div", "shade-slider-wrap");
      levelLabel = ce("span", "shade-level-label");
      levelLabel.textContent = (pos != null ? pos : "—") + "%";
      slider = ce("div", "slider shade-slider");
      const inner = ce("div", "slider-inner");
      inner.appendChild(ce("div", "slider-fill"));
      slider.appendChild(inner);
      slider.appendChild(ce("div", "slider-thumb"));
      setSliderLevel(slider, pos != null ? pos : 0);
      if (moving) slider.classList.add("disabled");
      sliderWrap.appendChild(levelLabel);
      sliderWrap.appendChild(slider);
      tile.appendChild(sliderWrap);
      if (!moving) {
        attachShadeDrag(tile, slider, shade.i, (lvl) => { levelLabel.textContent = lvl + "%"; });
      }
    }

    const actions = ce("div", "shade-actions");
    const openBtn = ce("button", "quick-lock-btn shade-btn");
    openBtn.type = "button";
    openBtn.innerHTML = SHADE_OPEN_SVG + '<span class="quick-lock-btn-label">Open</span>';
    const closeBtn = ce("button", "quick-lock-btn shade-btn");
    closeBtn.type = "button";
    closeBtn.innerHTML = SHADE_CLOSE_SVG + '<span class="quick-lock-btn-label">Close</span>';
    const st = M.effectiveShadeState(shade);
    if (st === "open") openBtn.classList.add("active");
    else if (st === "closed") closeBtn.classList.add("active");
    if (moving) {
      openBtn.classList.add("moving");
      closeBtn.classList.add("moving");
      openBtn.disabled = true;
      closeBtn.disabled = true;
    }
    openBtn.addEventListener("click", () => {
      if (!M.shadeIsMoving(shade) && M.effectiveShadeState(shade) !== "open") sendShadeCmd(shade.i, "open");
    });
    closeBtn.addEventListener("click", () => {
      if (!M.shadeIsMoving(shade) && M.effectiveShadeState(shade) !== "closed") sendShadeCmd(shade.i, "close");
    });
    actions.appendChild(openBtn);
    actions.appendChild(closeBtn);
    let stopBtn = null;
    if (moving) {
      stopBtn = ce("button", "quick-lock-btn shade-btn shade-stop-btn");
      stopBtn.type = "button";
      stopBtn.innerHTML = SHADE_STOP_SVG + '<span class="quick-lock-btn-label">Stop</span>';
      stopBtn.addEventListener("click", () => sendShadeCmd(shade.i, "stop"));
      actions.appendChild(stopBtn);
    }
    tile.appendChild(actions);

    if (inFav) {
      M.favShadeMap.set(shade.i, { el: tile, meta, levelLabel, slider, openBtn, closeBtn, stopBtn, favBtn: fav });
    }
    return tile;
  }

  function updateFavoriteShadeTile(shade) {
    const rec = M.favShadeMap.get(shade.i);
    if (!rec) return;
    const moving = M.shadeIsMoving(shade);
    const pos = M.effectiveShadePosition(shade);
    rec.meta.textContent = roomLabel(shade.r) + " · " + M.shadeStatusLabel(shade);
    if (rec.levelLabel) rec.levelLabel.textContent = (pos != null ? pos : "—") + "%";
    if (rec.slider) {
      setSliderLevel(rec.slider, pos != null ? pos : 0);
      rec.slider.classList.toggle("disabled", moving);
    }
    const st = M.effectiveShadeState(shade);
    rec.openBtn.classList.toggle("active", st === "open");
    rec.closeBtn.classList.toggle("active", st === "closed");
    rec.openBtn.classList.toggle("moving", moving);
    rec.closeBtn.classList.toggle("moving", moving);
    rec.openBtn.disabled = moving;
    rec.closeBtn.disabled = moving;
  }

  function renderBlindsPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = M.currentBody();
    body.className = "quick-body quick-body-blinds" + (M.inTabView() ? " tab-body" : "");
    body.innerHTML = "";
    if (!M.windowShades.length) {
      body.textContent = "No shades selected — add shades in the Hubitat app settings";
      return;
    }
    const sorted = M.windowShades.slice().sort((a, b) => {
      const ra = roomLabel(a.r).localeCompare(roomLabel(b.r));
      if (ra !== 0) return ra;
      return String(a.n || "").localeCompare(String(b.n || ""));
    });
    const list = ce("div", "quick-list");
    for (const shade of sorted) list.appendChild(makeShadeTile(shade, "popup"));
    body.appendChild(list);
  }

  function renderOutletsPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = M.currentBody();
    body.className = "quick-body quick-body-outlets" + (M.inTabView() ? " tab-body" : "");
    body.innerHTML = "";
    M.outletMap.clear();
    if (!M.outlets.length) {
      body.textContent = "No outlets configured — add outlets in the Hubitat app settings";
      return;
    }
    const sorted = M.outlets.slice().sort((a, b) => {
      const ra = roomLabel(a.r).localeCompare(roomLabel(b.r));
      if (ra !== 0) return ra;
      return String(a.n || "").localeCompare(String(b.n || ""));
    });
    const grid = ce("div", "quick-fav-grid");
    for (const out of sorted) grid.appendChild(makeOutletTile(out, "outlets"));
    body.appendChild(grid);
    updateStates();
  }

  function normalizeTempSensorForCard(s) {
    return { i: s.i, n: s.n, r: s.r, t: "temp", v: s.temp, u: s.u, a: 0, ex: [], bat: s.bat ?? null, _ref: s };
  }


  let musicVolTimer = null;

  function makeMusicRow(dev, context) {
    const inFav = context === "favorites";
    const ctrl = M.musicControls(dev);
    const playing = M.isMusicPlaying(M.effectiveMusicStatus(dev));
    const status = M.effectiveMusicStatus(dev);
    const vol = M.effectiveMusicVolume(dev);
    const muted = dev.m === "muted";
    const canPlayPause = ctrl.play || ctrl.pause;

    const row = ce("div", "music-row" + (playing ? " is-playing" : "") + (inFav ? " quick-fav-span" : ""));
    row.dataset.name = String(dev.n || "").toLowerCase();

    const art = ce("div", "music-art" + (playing ? " playing" : ""));
    art.innerHTML = MUSIC_ART_SVG;
    const eq = ce("div", "music-eq");
    eq.setAttribute("aria-hidden", "true");
    for (let b = 0; b < 4; b++) {
      const bar = ce("span");
      bar.style.setProperty("animation-delay", (b * 140) + "ms");
      eq.appendChild(bar);
    }
    art.appendChild(eq);
    let muteBadge = null;
    if (muted && ctrl.mute) {
      muteBadge = ce("span", "music-muted-badge");
      muteBadge.textContent = "Muted";
      art.appendChild(muteBadge);
    }

    const infoHead = ce("div", "music-info-head");
    const info = ce("div", "music-info");
    const name = ce("span", "music-name");
    name.textContent = dev.n || ("Player " + dev.i);
    const track = ce("span", "music-track");
    track.textContent = dev.tr ? dev.tr : (playing ? "Streaming…" : "—");
    const meta = ce("span", "music-meta");
    meta.textContent = roomLabel(dev.r) + " · " + M.musicStatusLabel(dev);
    info.appendChild(name);
    info.appendChild(track);
    info.appendChild(meta);
    infoHead.appendChild(info);
    const favBtn = ce("button", "tile-fav");
    favBtn.type = "button";
    attachFavButton(favBtn, dev.i);
    infoHead.appendChild(favBtn);

    const transportCount = (ctrl.prev ? 1 : 0) + (canPlayPause ? 1 : 0) + (ctrl.stop ? 1 : 0) + (ctrl.next ? 1 : 0);
    const transport = ce("div", "music-transport" + (transportCount <= 3 ? " is-compact" : ""));
    let playPauseBtn = null;
    let stopBtn = null;
    if (ctrl.prev) {
      const prevBtn = ce("button", "music-btn");
      prevBtn.type = "button";
      prevBtn.setAttribute("aria-label", "Previous track");
      prevBtn.innerHTML = MUSIC_PREV_SVG;
      prevBtn.addEventListener("click", () => sendMusicCmd(dev.i, "previousTrack"));
      transport.appendChild(prevBtn);
    }
    if (canPlayPause) {
      playPauseBtn = ce("button", "music-btn music-btn-primary");
      playPauseBtn.type = "button";
      const isPlay = !playing;
      playPauseBtn.setAttribute("aria-label", isPlay ? "Play" : "Pause");
      playPauseBtn.innerHTML = isPlay ? MUSIC_PLAY_SVG : MUSIC_PAUSE_SVG;
      if (playing) playPauseBtn.classList.add("active");
      playPauseBtn.addEventListener("click", () => {
        sendMusicCmd(dev.i, playing ? "pause" : "play");
      });
      transport.appendChild(playPauseBtn);
    }
    if (ctrl.stop) {
      stopBtn = ce("button", "music-btn");
      stopBtn.type = "button";
      stopBtn.setAttribute("aria-label", "Stop");
      stopBtn.innerHTML = MUSIC_STOP_SVG;
      if (status === "stopped") stopBtn.classList.add("active");
      stopBtn.addEventListener("click", () => sendMusicCmd(dev.i, "stop"));
      transport.appendChild(stopBtn);
    }
    if (ctrl.next) {
      const nextBtn = ce("button", "music-btn");
      nextBtn.type = "button";
      nextBtn.setAttribute("aria-label", "Next track");
      nextBtn.innerHTML = MUSIC_NEXT_SVG;
      nextBtn.addEventListener("click", () => sendMusicCmd(dev.i, "nextTrack"));
      transport.appendChild(nextBtn);
    }

    const volWrap = ce("div", "music-volume");
    const volIcon = ce("span", "music-volume-icon");
    volIcon.textContent = vol == null ? "♪" : (vol === 0 || muted ? "🔇" : (vol < 34 ? "🔈" : (vol < 67 ? "🔉" : "🔊")));
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.value = String(vol == null ? 0 : vol);
    slider.className = "music-volume-slider";
    slider.setAttribute("aria-label", "Volume");
    slider.style.setProperty("--vol", String(vol == null ? 0 : vol) + "%");
    if (vol == null || !ctrl.volume) slider.disabled = true;
    let pendingVol = null;
    slider.addEventListener("input", () => {
      pendingVol = Number(slider.value);
      slider.style.setProperty("--vol", String(pendingVol) + "%");
      M.setMusicOptimistic(dev.i, { v: pendingVol });
      const volNow = Number(slider.value);
      volIcon.textContent = volNow === 0 || muted ? "🔇" : (volNow < 34 ? "🔈" : (volNow < 67 ? "🔉" : "🔊"));
      if (musicVolTimer) clearTimeout(musicVolTimer);
      musicVolTimer = setTimeout(() => {
        const v = pendingVol;
        pendingVol = null;
        musicVolTimer = null;
        if (v == null) return;
        sendMusicCmd(dev.i, "setVolume", v);
      }, 280);
    });
    volWrap.appendChild(volIcon);
    volWrap.appendChild(slider);

    row.appendChild(art);
    row.appendChild(infoHead);
    const right = ce("div", "music-right");
    if (transport.childElementCount) right.appendChild(transport);
    if (ctrl.volume) right.appendChild(volWrap);
    row.appendChild(right);

    if (inFav) {
      M.favMusicMap.set(dev.i, {
        el: row, art, track, meta, playPauseBtn, stopBtn, volIcon, slider, muteBadge, favBtn, i: dev.i,
      });
    }
    return row;
  }

  function updateFavoriteMusicRow(dev) {
    const rec = M.favMusicMap.get(dev.i);
    if (!rec) return;
    const ctrl = M.musicControls(dev);
    const playing = M.isMusicPlaying(M.effectiveMusicStatus(dev));
    const status = M.effectiveMusicStatus(dev);
    const vol = M.effectiveMusicVolume(dev);
    const muted = dev.m === "muted";
    rec.el.classList.toggle("is-playing", playing);
    rec.art.classList.toggle("playing", playing);
    rec.track.textContent = dev.tr ? dev.tr : (playing ? "Streaming…" : "—");
    rec.meta.textContent = roomLabel(dev.r) + " · " + M.musicStatusLabel(dev);
    if (rec.playPauseBtn) {
      rec.playPauseBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
      rec.playPauseBtn.innerHTML = playing ? MUSIC_PAUSE_SVG : MUSIC_PLAY_SVG;
      rec.playPauseBtn.classList.toggle("active", playing);
    }
    if (rec.stopBtn) rec.stopBtn.classList.toggle("active", status === "stopped");
    if (rec.slider && vol != null) {
      rec.slider.value = String(vol);
      rec.slider.style.setProperty("--vol", String(vol) + "%");
    }
    if (rec.volIcon) {
      rec.volIcon.textContent = vol == null ? "♪" : (vol === 0 || muted ? "🔇" : (vol < 34 ? "🔈" : (vol < 67 ? "🔉" : "🔊")));
    }
    if (ctrl.mute) {
      if (muted && !rec.muteBadge) {
        rec.muteBadge = ce("span", "music-muted-badge");
        rec.muteBadge.textContent = "Muted";
        rec.art.appendChild(rec.muteBadge);
      } else if (!muted && rec.muteBadge) {
        rec.muteBadge.remove();
        rec.muteBadge = null;
      }
    }
  }

  function renderMusicPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = M.currentBody();
    body.className = "quick-body quick-body-music" + (M.inTabView() ? " tab-body" : "");
    body.innerHTML = "";
    if (!M.music.length) {
      body.textContent = "No speakers selected — add music players or additional speakers in the Hubitat app settings";
      return;
    }
    const sorted = M.music.slice().sort((a, b) => {
      const ra = roomLabel(a.r).localeCompare(roomLabel(b.r));
      if (ra !== 0) return ra;
      return String(a.n || "").localeCompare(String(b.n || ""));
    });
    const list = ce("div", "quick-list music-list");
    for (const dev of sorted) list.appendChild(makeMusicRow(dev, "popup"));
    body.appendChild(list);
  }

  function renderHubModePopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = popup._body;
    body.className = "quick-body quick-body-hub-mode";
    body.innerHTML = "";
    if (!M.hubModes.length) {
      body.textContent = "No hub modes configured";
      return;
    }
    const grid = ce("div", "hub-mode-grid");
    for (const mode of M.hubModes) {
      const meta = hubModeMeta(mode);
      const b = ce("button", "hub-mode-btn");
      b.type = "button";
      b.innerHTML = meta.svg;
      const label = ce("span", "hub-mode-label");
      label.textContent = mode;
      b.appendChild(label);
      if (mode === M.currentHubMode) b.classList.add("active");
      b.addEventListener("click", async () => {
        if (mode === M.currentHubMode) return;
        M.hapticTap();
        M.currentHubMode = mode;
        M.hubModeLockUntil = Date.now() + 4000;
        renderHubModePopup();
        await setHubModeApi(mode);
      });
      grid.appendChild(b);
    }
    body.appendChild(grid);
  }

  function ensurePinPadPopup() {
    if (M.pinPadPopup) return M.pinPadPopup;
    M.pinPadPopup = ce("div", "pin-pad-popup");
    M.pinPadPopup.hidden = true;
    M.pinPadPopup.setAttribute("role", "dialog");
    M.pinPadPopup.setAttribute("aria-modal", "true");
    const panel = ce("div", "pin-pad-panel");
    const title = ce("h2", "pin-pad-title");
    const error = ce("p", "pin-pad-error");
    error.hidden = true;
    error.setAttribute("role", "alert");
    error.setAttribute("aria-live", "polite");
    const dots = ce("div", "pin-dots");
    const keys = ce("div", "pin-keys");
    const actions = ce("div", "pin-actions");
    const cancel = ce("button", "ghost-btn pin-cancel");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const submit = ce("button", "confirm-btn pin-submit");
    submit.type = "button";
    submit.textContent = "Submit";
    actions.appendChild(cancel);
    actions.appendChild(submit);
    panel.appendChild(title);
    panel.appendChild(error);
    panel.appendChild(dots);
    panel.appendChild(keys);
    panel.appendChild(actions);
    M.pinPadPopup.appendChild(panel);
    M.appendPopup(M.pinPadPopup);

    M.bindPopupDismiss(M.pinPadPopup, panel, null, () => {
      M.pinPadState?.onCancel?.();
      closePinPad();
    });
    cancel.addEventListener("click", (e) => {
      e.stopPropagation();
      M.pinPadState?.onCancel?.();
      closePinPad();
    });
    submit.addEventListener("click", (e) => {
      e.stopPropagation();
      M.hapticTap();
      if (!M.pinPadState?.pin?.length) return;
      M.pinPadState?.onSubmit?.(M.pinPadState.pin);
    });
    document.addEventListener("keydown", (e) => {
      if (!M.pinPadPopup.classList.contains("open")) return;
      if (e.key === "Escape") {
        M.pinPadState?.onCancel?.();
        closePinPad();
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        appendPinDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspacePinDigit();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (M.pinPadState?.pin?.length) M.pinPadState.onSubmit?.(M.pinPadState.pin);
      }
    });

    M.pinPadPopup._title = title;
    M.pinPadPopup._error = error;
    M.pinPadPopup._dots = dots;
    M.pinPadPopup._keys = keys;
    M.pinPadPopup._submit = submit;
    return M.pinPadPopup;
  }

  function showPinPadError(message) {
    if (!M.pinPadPopup?._error) return;
    M.pinPadPopup._error.textContent = message;
    M.pinPadPopup._error.hidden = false;
  }

  function clearPinPadError() {
    if (!M.pinPadPopup?._error) return;
    M.pinPadPopup._error.textContent = "";
    M.pinPadPopup._error.hidden = true;
  }

  function renderPinPadDots() {
    if (!M.pinPadPopup || !M.pinPadState) return;
    const len = M.pinPadState.pin.length;
    M.pinPadPopup._dots.innerHTML = "";
    for (let i = 0; i < Math.max(4, len); i++) {
      const dot = ce("span", "pin-dot");
      if (i < len) dot.classList.add("filled");
      M.pinPadPopup._dots.appendChild(dot);
    }
    M.pinPadPopup._submit.disabled = len === 0;
  }

  function appendPinDigit(d) {
    if (!M.pinPadState || M.pinPadState.pin.length >= 8) return;
    M.hapticTap();
    clearPinPadError();
    M.pinPadState.pin += d;
    renderPinPadDots();
  }

  function backspacePinDigit() {
    if (!M.pinPadState || !M.pinPadState.pin.length) return;
    M.hapticTap();
    clearPinPadError();
    M.pinPadState.pin = M.pinPadState.pin.slice(0, -1);
    renderPinPadDots();
  }

  function closePinPad() {
    if (!M.pinPadPopup) return;
    M.pinPadPopup.hidden = true;
    M.pinPadPopup.classList.remove("open");
    M.pinPadPopup.classList.remove("shake");
    clearPinPadError();
    M.pinPadState = null;
  }

  function openPinPad({ title, onSubmit, onCancel }) {
    M.cancelAllSlideGestures();
    const popup = ensurePinPadPopup();
    M.pinPadState = { pin: "", onSubmit, onCancel };
    popup._title.textContent = title;
    popup.setAttribute("aria-label", title);
    popup._keys.innerHTML = "";
    for (let d = 1; d <= 9; d++) {
      const key = ce("button", "pin-key");
      key.type = "button";
      key.textContent = String(d);
      key.addEventListener("click", (e) => {
        e.stopPropagation();
        appendPinDigit(String(d));
      });
      popup._keys.appendChild(key);
    }
    const blank = ce("span", "pin-key-spacer");
    popup._keys.appendChild(blank);
    const zero = ce("button", "pin-key");
    zero.type = "button";
    zero.textContent = "0";
    zero.addEventListener("click", (e) => {
      e.stopPropagation();
      appendPinDigit("0");
    });
    popup._keys.appendChild(zero);
    const back = ce("button", "pin-key pin-key-back");
    back.type = "button";
    back.setAttribute("aria-label", "Backspace");
    back.textContent = "\u232b";
    back.addEventListener("click", (e) => {
      e.stopPropagation();
      backspacePinDigit();
    });
    popup._keys.appendChild(back);
    renderPinPadDots();
    clearPinPadError();
    popup.hidden = false;
    popup.classList.remove("shake");
    popup.classList.add("open");
    popup._submit.focus();

    return {
      close: closePinPad,
      shake() {
        popup.classList.remove("shake");
        void popup.offsetWidth;
        popup.classList.add("shake");
        showPinPadError("Wrong PIN. Try again.");
        if (M.pinPadState) M.pinPadState.pin = "";
        renderPinPadDots();
      },
    };
  }

  function promptUnlockPin(lockId, lockName) {
    M.hapticTap();
    const pad = openPinPad({
      title: "Enter PIN to unlock" + (lockName ? " " + lockName : ""),
      onSubmit: async (pin) => {
        const result = await sendLockCmd(lockId, "unlock", pin);
        if (!result?.ok && (result?.status === 403 || result?.error === "wrong pin")) {
          pad.shake();
          return;
        }
        if (result?.ok) {
          pad.close();
          return;
        }
        if (result?.error === "pin not configured") M.flash("Set unlock PIN in Hubitat app settings", true);
        pad.close();
      },
    });
  }

  function runHsmAction(title, cmd) {
    M.hapticTap();
    if (M.hsmPinRequired) {
      const pad = openPinPad({
        title: "Enter PIN to " + title,
        onSubmit: (pin) => setHsmApi(cmd, pin, pad),
      });
      return;
    }
    setHsmApi(cmd, null, null);
  }

  function appendHsmModeButtons(container, modes, { skipActive = true } = {}) {
    for (const mode of modes) {
      const b = ce("button", "tstat-mode quick-hsm-mode");
      b.type = "button";
      b.innerHTML = (mode.svg || "") + '<span class="quick-hsm-mode-label">' + mode.label + "</span>";
      if (hsmModeIsActive(M.hsmStatus, mode)) {
        b.classList.add("active");
        const activeClass = hsmModeActiveClass(mode, M.hsmStatus);
        if (activeClass) b.classList.add(activeClass);
      }
      b.addEventListener("click", () => {
        if (skipActive && hsmModeIsActive(M.hsmStatus, mode)) return;
        runHsmAction(mode.label, mode.cmd);
      });
      container.appendChild(b);
    }
  }

  function renderSecurityPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = popup._body;
    body.className = "quick-body quick-body-security";
    body.innerHTML = "";
    if (!M.hsmEnabled) {
      body.textContent = "Enable HSM control in the Hubitat app settings";
      return;
    }

    const statusTone = hsmStatusTone(M.hsmStatus, M.hsmAlert);
    const statusWrap = ce("div", "quick-hsm-status quick-hsm-status--" + statusTone);
    if (hsmHasActiveAlert(M.hsmAlert)) statusWrap.classList.add("alert");
    const statusLabel = ce("span", "quick-hsm-status-label");
    statusLabel.textContent = hsmStatusLabel(M.hsmStatus);
    statusWrap.appendChild(statusLabel);
    const monMeta = ce("span", "quick-hsm-status-meta quick-hsm-status-meta--" + hsmMonitoringTone(M.hsmStatus));
    monMeta.textContent = hsmMonitoringLabel(M.hsmStatus);
    statusWrap.appendChild(monMeta);
    body.appendChild(statusWrap);

    if (hsmHasActiveAlert(M.hsmAlert)) {
      const alertBanner = ce("div", "quick-hsm-alert-banner");
      const alertText = ce("span", "quick-hsm-alert");
      alertText.textContent = hsmAlertLabel(M.hsmAlert, M.hsmAlertDesc);
      alertBanner.appendChild(alertText);
      const cancelBtn = ce("button", "quick-hsm-cancel-btn");
      cancelBtn.type = "button";
      cancelBtn.innerHTML = HSM_CANCEL_ALERT_SVG + '<span class="quick-hsm-cancel-label">Cancel Alert</span>';
      cancelBtn.addEventListener("click", () => {
        runHsmAction("cancel alert", "cancelAlerts");
      });
      alertBanner.appendChild(cancelBtn);
      body.appendChild(alertBanner);
    }

    const intrSection = ce("div", "quick-hsm-section");
    const intrTitle = ce("h3", "quick-hsm-section-title");
    intrTitle.textContent = "Intrusion";
    intrSection.appendChild(intrTitle);
    if (hsmIntrusionArmed(M.hsmStatus)) {
      const intrMeta = ce("p", "quick-hsm-section-meta quick-hsm-section-meta--" + hsmIntrusionTone(M.hsmStatus));
      intrMeta.textContent = hsmStatusLabel(M.hsmStatus);
      intrSection.appendChild(intrMeta);
    }
    const intrModes = ce("div", "tstat-modes quick-hsm-modes");
    appendHsmModeButtons(intrModes, HSM_INTRUSION_MODES);
    intrSection.appendChild(intrModes);
    body.appendChild(intrSection);

    const monSection = ce("div", "quick-hsm-section");
    const monTitle = ce("h3", "quick-hsm-section-title");
    monTitle.textContent = "Leak & Environmental";
    monSection.appendChild(monTitle);
    const monDesc = ce("p", "quick-hsm-section-meta quick-hsm-section-meta--" + hsmMonitoringTone(M.hsmStatus));
    monDesc.textContent = hsmMonitoringLabel(M.hsmStatus);
    monSection.appendChild(monDesc);
    const monModes = ce("div", "tstat-modes quick-hsm-modes");
    appendHsmModeButtons(monModes, HSM_MONITORING_MODES);
    monSection.appendChild(monModes);
    body.appendChild(monSection);

    const ruleSection = ce("div", "quick-hsm-section");
    const ruleTitle = ce("h3", "quick-hsm-section-title");
    ruleTitle.textContent = "Custom Rules";
    ruleSection.appendChild(ruleTitle);
    const ruleDesc = ce("p", "quick-hsm-section-meta");
    ruleDesc.textContent = "Hubitat Safety Monitor custom monitoring rules";
    ruleSection.appendChild(ruleDesc);
    const ruleModes = ce("div", "tstat-modes quick-hsm-modes");
    appendHsmModeButtons(ruleModes, HSM_RULE_MODES, { skipActive: false });
    ruleSection.appendChild(ruleModes);
    body.appendChild(ruleSection);
  }
  Object.assign(M, { saveRoomOrder, currentNavOrderFromDom, updateNavDraftOrderFromDom, showAllNavForReorder, cleanupNavDragState, saveNavOrder, postJson, postJsonSilent, setHsmApi, setHubModeApi, activateSceneApi, bulkLightsApi, snapshotSaveApi, snapshotRestoreApi, saveFavorites, hubModeLocked, hsmLocked, roomLabel, snapshotRoomKey, snapshotHouseKey, setRoomGestureLock, attachRoomSlideAction, updateRoomSnapshotUi, getFavoriteEntries, updateAllFavButtons, attachFavButton, toggleFavorite, currentRoomOrderFromDom, updateDraftOrderFromDom, updateMoveButtons, moveRoom, enterReorderMode, exitReorderMode, finishReorderMode, cancelReorderMode, closeTopbarOverflowMenu, openTopbarOverflowMenu, toggleTopbarOverflowMenu, attachRoomReorder, attachNavReorder, setupNavReorderItems, relocateNavForReorder, restoreNavAfterReorder, render, buildDom, makeTile, makeOutletTile, attachOutletSocketTap, attachSwitchTap, attachBulbTap, attachColorNameClick, clampLevel, setSliderLevel, syncTileState, updateStates, updateRoomMeta, attachDrag, attachShadeDrag, testHaptics, toggleSwitch, toggleOutlet, toggleDimmer, reconcileDevice, refreshDevice, reconcileLock, reconcileShade, reconcileMusic, sendMusicCmd, broadcastMusic, broadcastMusicVolume, sendLockCmd, sendShadeCmd, applySwitchCmdOptimistic, roomAll, allLights, ensureQuickPopup, syncQuickPopupWidth, syncQuickPopupWidthForOpen, makeLockRow, updateFavoriteLockRow, renderLocksPopup, makeShadeTile, updateFavoriteShadeTile, renderBlindsPopup, renderOutletsPopup, normalizeTempSensorForCard, makeMusicRow, updateFavoriteMusicRow, renderMusicPopup, renderHubModePopup, ensurePinPadPopup, showPinPadError, clearPinPadError, renderPinPadDots, appendPinDigit, backspacePinDigit, closePinPad, openPinPad, promptUnlockPin, runHsmAction, appendHsmModeButtons, renderSecurityPopup });
})();
