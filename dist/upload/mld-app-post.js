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
    if (M.currentCategory() === "security") M.renderSecurityPopup();
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

  function compareByRoomThenFullName(a, b) {
    const ra = roomLabel(a.r).localeCompare(roomLabel(b.r), undefined, { sensitivity: "base" });
    if (ra !== 0) return ra;
    return String(a.n || "").localeCompare(String(b.n || ""), undefined, { sensitivity: "base" });
  }

  function sortByRoomThenFullName(devs) {
    return devs.slice().sort(compareByRoomThenFullName);
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
      // Prefer fan over light when the same device is in both pickers.
      const fan = M.ceilingFans.find(x => x.i === id);
      if (fan) { out.push({ type: "fan", dev: fan }); continue; }
      const dev = M.devices.find(d => d.i === id);
      if (dev) { out.push({ type: "light", dev }); continue; }
      const outlet = M.outlets.find(o => o.i === id);
      if (outlet) { out.push({ type: "outlet", dev: outlet }); continue; }
      const t = M.thermostats.find(x => x.i === id);
      if (t) { out.push({ type: "thermostat", dev: t }); continue; }
      const valve = M.valves.find(x => x.i === id);
      if (valve) { out.push({ type: "sensor", dev: M.normalizeValveForCard(valve) }); continue; }
      const mp = M.music.find(x => x.i === id);
      if (mp) { out.push({ type: "music", dev: mp }); continue; }
      const lk = M.locks.find(x => x.i === id);
      if (lk) { out.push({ type: "lock", dev: lk }); continue; }
      const garage = M.garageDoors.find(x => x.i === id);
      if (garage) { out.push({ type: "garage", dev: garage }); continue; }
      const shade = M.windowShades.find(x => x.i === id);
      if (shade) { out.push({ type: "shade", dev: shade }); continue; }
      const sen = M.sensors.find(x => x.i === id);
      if (sen) { out.push({ type: "sensor", dev: sen }); continue; }
      const ts = M.tempSensors.find(x => x.i === id);
      if (ts) out.push({ type: "sensor", dev: M.normalizeTempSensorForCard(ts) });
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
    for (const [, rec] of M.favGarageMap) M.syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of M.favShadeMap) M.syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of M.favFanMap) M.syncFavButton(rec.favBtn, rec.i);
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
    else if (M.quickPopupOpenType === "music") M.renderMusicPopup();
    else if (M.quickPopupOpenType === "blinds") M.refreshBlindsPopup();
    else if (M.quickPopupOpenType === "fans") M.refreshFansPopup();
    const ok = await saveFavorites(M.favorites);
    if (!ok) {
      if (wasFav) M.favorites.push(numId);
      else M.favorites.splice(M.favorites.indexOf(numId), 1);
      updateAllFavButtons();
      M.updateQuickNavVisibility();
      if (M.currentCategory() === "favorites") M.renderFavoritesPopup();
      else if (M.quickPopupOpenType === "locks") renderLocksPopup();
      else if (M.quickPopupOpenType === "music") M.renderMusicPopup();
      else if (M.quickPopupOpenType === "blinds") M.refreshBlindsPopup();
      else if (M.quickPopupOpenType === "fans") M.refreshFansPopup();
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

  function captureUiScroll() {
    const snap = { y: window.scrollY || document.documentElement.scrollTop || 0 };
    const panel = document.querySelector(".quick-popup.open .quick-panel");
    if (panel) snap.panelY = panel.scrollTop;
    const scrollBody = (M.tabMode && M.activeTab !== "lights" && M.tabViewEl)
      ? M.tabViewEl
      : document.querySelector(".quick-popup.open .quick-body");
    const list = scrollBody && scrollBody.querySelector(".quick-list");
    if (list) snap.listY = list.scrollTop;
    return snap;
  }

  function restoreUiScroll(snap) {
    if (!snap) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scrollBody = (M.tabMode && M.activeTab !== "lights" && M.tabViewEl)
          ? M.tabViewEl
          : document.querySelector(".quick-popup.open .quick-body");
        const list = scrollBody && scrollBody.querySelector(".quick-list");
        if (snap.listY != null && list) list.scrollTop = snap.listY;
        const panel = document.querySelector(".quick-popup.open .quick-panel");
        if (snap.panelY != null && panel) panel.scrollTop = snap.panelY;
        if (snap.y > 0) window.scrollTo(0, snap.y);
      });
    });
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
    M.replaceList(M.garageDoors, d.garageDoors);
    M.replaceList(M.windowShades, d.windowShades);
    M.replaceList(M.ceilingFans, d.ceilingFans);
    if (!Array.isArray(M.valves)) M.valves = [];
    M.replaceList(M.valves, Array.isArray(d.valves) ? d.valves : []);
    M.replaceList(M.music, d.music);
    if (Array.isArray(d.config?.favorites)) M.replaceList(M.favorites, d.config.favorites.map(Number));
    M.reapplyLockOptimistic();
    M.reapplyGarageOptimistic();
    M.reapplyShadeOptimistic();
    M.reapplyFanOptimistic();
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

    const scrollSnap = captureUiScroll();
    if (fullRerender && !M.reorderMode) buildDom();
    updateRoomSnapshotUi();
    updateStates();
    M.updateClimateWidgets();
    M.applySearch();
    M.refreshQuickPopupIfOpen();
    restoreUiScroll(scrollSnap);
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
      const name = roomKey === -1 ? "Unassigned" : (M.roomMap.get(roomKey) || "Room");
      const devs = sortDevicesInRoom(groups.get(roomKey) || [], name);
      const roomOutlets = M.outletsInLightsRooms()
        ? sortDevicesInRoom(outletGroups.get(roomKey) || [], name)
        : [];

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

      let offTrack = null;
      let onTrack = null;
      let saveBtn = null;
      let restoreBtn = null;
      if (devs.length > 0) {
        const toggle = ce("div", "room-toggle");

        offTrack = ce("div", "slide-confirm-track room-slide-track room-slide-off");
        saveBtn = ce("button", "slide-confirm-action room-snap-action room-snap-save");
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

        onTrack = ce("div", "slide-confirm-track room-slide-track room-slide-on");
        const onBtn = ce("button", "btn-on");
        onBtn.type = "button";
        onBtn.textContent = "On";
        restoreBtn = ce("button", "slide-confirm-action room-snap-action room-snap-restore");
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
      }

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
    const displayName = inFavorites ? fullName : ((dev.n ? stripRoomPrefix(dev.n, roomName) : null) || fullName);

    const head = ce("div", "tile-head");
    const name = ce("div", "tile-name");
    name.textContent = displayName;
    if (dev.n && displayName !== dev.n) name.title = dev.n;
    const bulb = ce("button", "tile-bulb");
    bulb.type = "button";
    bulb.setAttribute("aria-label", "Toggle " + displayName);
    bulb.setAttribute("aria-pressed", dev.s ? "true" : "false");
    head.appendChild(name); head.appendChild(bulb);
    tile.appendChild(head);

    attachBulbTap(bulb, dev);
    if (isDim) attachColorNameClick(name, dev, displayName);

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
    const truncate = !inFavorites && !inOutletsTab;
    const displayName = truncate
      ? ((outlet.n ? stripRoomPrefix(outlet.n, roomName) : null) || fullName)
      : fullName;

    const socket = ce("button", "tile-socket" + (inOutletsTab ? " outlet-tab-socket" : ""));
    socket.type = "button";
    socket.setAttribute("aria-label", "Toggle " + displayName);
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
    name.textContent = displayName;
    if (outlet.n && displayName !== outlet.n) name.title = outlet.n;

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
      const sen = M.sensors.find(x => x.i === Number(d.i));
      const lock = M.locks.find(x => x.i === Number(d.i));
      const garage = M.garageDoors.find(x => x.i === Number(d.i));
      const shade = M.windowShades.find(x => x.i === Number(d.i));
      const fan = M.ceilingFans.find(x => x.i === Number(d.i));
      const valve = M.valves.find(x => x.i === Number(d.i));
      const mp = M.music.find(x => x.i === Number(d.i));
      const hasControlRole = !!(lock || garage || shade || fan || valve || mp);
      if (s && !sen && !hasControlRole) {
        if (d.temp != null) s.temp = Number(d.temp);
        M.updateClimateWidgets();
        updateRoomMeta();
        if (M.currentCategory() === "sensors") M.refreshSensorsPopup();
        else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
        return;
      }
      if (sen && !hasControlRole) {
        applySensorPayload(sen, d);
        if (M.currentCategory() === "sensors") M.refreshSensorsPopup();
        else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
        return;
      }
      if (lock) {
        if (d.lk != null) lock.lk = d.lk ? 1 : 0;
        if (d.st != null) lock.st = d.st;
        const opt = M.lockOptimistic.get(Number(d.i));
        if (opt && !!lock.lk === !!opt.lk) M.clearLockOptimistic(Number(d.i));
        if (M.currentCategory() === "locks") renderLocksPopup();
        else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
        return;
      }
      if (garage) {
        if (d.st != null) garage.st = d.st;
        const opt = M.garageOptimistic.get(Number(d.i));
        if (opt?.st != null && garage.st === opt.st) M.clearGarageOptimistic(Number(d.i));
        if (M.currentCategory() === "locks") renderLocksPopup();
        else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
        return;
      }
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
        if (M.currentCategory() === "blinds") M.refreshBlindsPopup();
        else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
        return;
      }
      if (fan) {
        if (d.s != null) fan.s = d.s ? 1 : 0;
        if (d.sp != null) fan.sp = d.sp;
        const opt = M.fanOptimistic.get(Number(d.i));
        if (opt) {
          let matched = true;
          if (opt.s != null && !!fan.s !== !!opt.s) matched = false;
          if (opt.sp != null && String(fan.sp || "").toLowerCase() !== String(opt.sp).toLowerCase()) matched = false;
          if (matched) M.clearFanOptimistic(Number(d.i));
        }
        M.updateFanTile(fan);
        if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
        return;
      }
      if (valve) {
        if (d.st != null) valve.st = d.st;
        const opt = M.valveOptimistic.get(Number(d.i));
        if (opt?.st != null && valve.st === opt.st) M.clearValveOptimistic(Number(d.i));
        if (M.currentCategory() === "sensors") M.refreshSensorsPopup();
        else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
        return;
      }
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
        if (M.currentCategory() === "music") M.renderMusicPopup();
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

  function reconcileFan(id) {
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
      if (M.currentCategory() === "music") M.renderMusicPopup();
      else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    }
    const result = await M.sendCmd(id, cmd, val);
    if (!result.ok) {
      M.clearMusicOptimistic(id);
      reconcileMusic(id);
      if (M.currentCategory() === "music") M.renderMusicPopup();
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
        if (M.currentCategory() === "music") M.renderMusicPopup();
        else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
      });
    }
    if (M.currentCategory() === "music") M.renderMusicPopup();
    else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
  }

  function reconcileGarage(id) {
    setTimeout(() => refreshDevice(id), 700);
    setTimeout(() => refreshDevice(id), 2200);
  }

  async function sendGarageCmd(id, cmd, pin) {
    const door = M.garageDoors.find((g) => g.i === id);
    if (!door) return { ok: false };
    M.hapticTap();
    const patch = cmd === "open" ? { st: "opening" } : cmd === "close" ? { st: "closing" } : null;
    if (patch) {
      M.setGarageOptimistic(id, patch);
      if (M.currentCategory() === "locks") renderLocksPopup();
      else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    }
    const result = await M.sendCmd(id, cmd, null, pin);
    if (!result.ok) {
      M.clearGarageOptimistic(id);
      reconcileGarage(id);
      if (M.currentCategory() === "locks") renderLocksPopup();
      else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    } else {
      reconcileGarage(id);
    }
    return result;
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
      if (M.currentCategory() === "blinds") M.refreshBlindsPopup();
      else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    }
    const result = await M.sendCmd(id, cmd, val);
    if (!result.ok) {
      M.clearShadeOptimistic(id);
      reconcileShade(id);
      if (M.currentCategory() === "blinds") M.refreshBlindsPopup();
      else if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    } else {
      reconcileShade(id);
    }
    return result;
  }

  async function sendFanCmd(id, cmd, val) {
    const fan = M.ceilingFans.find((f) => f.i === id);
    if (!fan) return { ok: false };
    M.hapticTap();
    let patch = null;
    if (cmd === "on") patch = { s: 1 };
    else if (cmd === "off") patch = { s: 0, sp: "off" };
    else if (cmd === "setSpeed") {
      const sp = String(val || "").trim();
      const spLower = sp.toLowerCase();
      patch = { sp: spLower, s: spLower === "off" ? 0 : 1 };
    }
    if (patch) {
      M.setFanOptimistic(id, patch);
      M.updateFanTile(fan);
      if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    }
    const result = await M.sendCmd(id, cmd, val);
    if (!result.ok) {
      M.clearFanOptimistic(id);
      reconcileFan(id);
      M.updateFanTile(fan);
      if (M.currentCategory() === "favorites") M.postCall("refreshFavoritesPopup");
    } else {
      reconcileFan(id);
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

  const WIDE_POPUP_TYPES = new Set(["favorites", "sensors", "thermostats", "blinds", "fans", "outlets", "scheduling"]);
  const HUB_MODE_POPUP_TYPE = "hub-mode";

  function syncQuickPopupWidth(popup, type) {
    popup.classList.toggle("quick-popup-wide", WIDE_POPUP_TYPES.has(type) && !M.inTabView());
    popup.classList.toggle("quick-popup-hub-mode", type === HUB_MODE_POPUP_TYPE);
  }

  function syncQuickPopupWidthForOpen(popup) {
    const type = M.inTabView() ? M.activeTab : M.quickPopupOpenType;
    if (type) syncQuickPopupWidth(popup, type);
  }

  function updateFavoriteGarageRow(door) {
    const rec = M.favGarageMap.get(door.i);
    if (!rec) return;
    rec.meta.textContent = roomLabel(door.r) + " · " + M.garageStatusLabel(door);
    const isOpen = M.garageIsOpen(door);
    rec.closeBtn.classList.toggle("active", !isOpen);
    rec.openBtn.classList.toggle("active", isOpen);
  }

  function makeGarageRow(door, context) {
    const inFav = context === "favorites";
    const row = ce("div", "quick-lock-row" + (inFav ? " quick-fav-span" : ""));
    row.dataset.name = String(door.n || "").toLowerCase();
    const head = ce("div", "quick-fav-row-head");
    const info = ce("div", "quick-lock-info");
    const name = ce("span", "quick-fav-name");
    name.textContent = door.n || ("Garage " + door.i);
    const meta = ce("span", "quick-fav-meta");
    meta.textContent = roomLabel(door.r) + " · " + M.garageStatusLabel(door);
    info.appendChild(name);
    info.appendChild(meta);
    head.appendChild(info);
    const fav = ce("button", "tile-fav");
    fav.type = "button";
    attachFavButton(fav, door.i);
    head.appendChild(fav);
    row.appendChild(head);

    const actions = ce("div", "quick-lock-actions");
    const closeBtn = ce("button", "quick-lock-btn");
    closeBtn.type = "button";
    closeBtn.innerHTML = SHADE_CLOSE_SVG + '<span class="quick-lock-btn-label">Close</span>';
    const openBtn = ce("button", "quick-lock-btn");
    openBtn.type = "button";
    openBtn.innerHTML = SHADE_OPEN_SVG + '<span class="quick-lock-btn-label">Open</span>';
    const isOpen = M.garageIsOpen(door);
    if (!isOpen) closeBtn.classList.add("active");
    else openBtn.classList.add("active");
    closeBtn.addEventListener("click", () => {
      if (!M.garageIsMoving(door) && M.garageIsOpen(door)) sendGarageCmd(door.i, "close");
    });
    openBtn.addEventListener("click", () => {
      if (M.garageIsMoving(door) || M.garageIsOpen(door)) return;
      if (M.unlockPinRequired) M.promptGarageOpenPin(door.i, door.n);
      else sendGarageCmd(door.i, "open");
    });
    actions.appendChild(closeBtn);
    actions.appendChild(openBtn);
    row.appendChild(actions);

    if (inFav) {
      M.favGarageMap.set(door.i, { el: row, meta, closeBtn, openBtn, favBtn: fav, i: door.i });
    }
    return row;
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
      if (M.unlockPinRequired) M.promptUnlockPin(lock.i, lock.n);
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
    if (!M.locks.length && !M.garageDoors.length) {
      body.textContent = "No locks or garage doors selected — add them in the Hubitat app settings";
      return;
    }
    if (M.unlockPinEnabled && !M.unlockPinRequired) {
      const hint = ce("p", "quick-lock-pin-hint");
      hint.textContent = "Set unlock PIN in Hubitat app settings";
      body.appendChild(hint);
    }
    const entries = [];
    for (const lock of M.locks) entries.push({ kind: "lock", dev: lock });
    for (const door of M.garageDoors) entries.push({ kind: "garage", dev: door });
    entries.sort((a, b) => compareByRoomThenFullName(a.dev, b.dev));
    const list = ce("div", "quick-list");
    for (const entry of entries) {
      if (entry.kind === "lock") list.appendChild(makeLockRow(entry.dev, "popup"));
      else list.appendChild(makeGarageRow(entry.dev, "popup"));
    }
    body.appendChild(list);
  }
  Object.assign(M, { saveRoomOrder, currentNavOrderFromDom, updateNavDraftOrderFromDom, showAllNavForReorder, cleanupNavDragState, saveNavOrder, postJson, postJsonSilent, setHsmApi, setHubModeApi, activateSceneApi, bulkLightsApi, snapshotSaveApi, snapshotRestoreApi, saveFavorites, hubModeLocked, hsmLocked, roomLabel, compareByRoomThenFullName, sortByRoomThenFullName, snapshotRoomKey, snapshotHouseKey, setRoomGestureLock, attachRoomSlideAction, updateRoomSnapshotUi, getFavoriteEntries, updateAllFavButtons, attachFavButton, toggleFavorite, currentRoomOrderFromDom, updateDraftOrderFromDom, updateMoveButtons, moveRoom, enterReorderMode, exitReorderMode, finishReorderMode, cancelReorderMode, closeTopbarOverflowMenu, openTopbarOverflowMenu, toggleTopbarOverflowMenu, attachRoomReorder, attachNavReorder, setupNavReorderItems, relocateNavForReorder, restoreNavAfterReorder, captureUiScroll, restoreUiScroll, render, buildDom, makeTile, makeOutletTile, attachOutletSocketTap, attachSwitchTap, attachBulbTap, attachColorNameClick, clampLevel, setSliderLevel, syncTileState, updateStates, updateRoomMeta, attachDrag, attachShadeDrag, testHaptics, toggleSwitch, toggleOutlet, toggleDimmer, reconcileDevice, refreshDevice, reconcileLock, reconcileShade, reconcileFan, reconcileMusic, sendMusicCmd, broadcastMusic, broadcastMusicVolume, reconcileGarage, sendGarageCmd, sendLockCmd, sendShadeCmd, sendFanCmd, applySwitchCmdOptimistic, roomAll, allLights, ensureQuickPopup, syncQuickPopupWidth, syncQuickPopupWidthForOpen, updateFavoriteGarageRow, makeGarageRow, makeLockRow, updateFavoriteLockRow, renderLocksPopup });
})();
