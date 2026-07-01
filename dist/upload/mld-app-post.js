(() => {
  "use strict";
  const M = globalThis.__MLD;
  if (!M) {
    console.error("Modern Dashboard: upload mld-app.js before mld-app-post.js");
    return;
  }
// Sensors (other-sensor pickers): [{i,n,r,t,v,a,ex:[{k,v,u?}]}]
  let sensors = [];
  const sensorCardMap = new Map(); // id -> { el, heroEl, pillEl, pillTxt, dot, footEl, favBtn, t, i }
  const favSensorMap = new Map(); // id -> sensor card rec (M.favorites popup)
  let sensorsPopupSig = "";
  const sensorTypeFilter = new Set(); // empty = show all types
  let sensorFilterOpen = false;
  let sensorFilterChipsEl = null;
  let sensorFilterBtnEl = null;
  let sensorFilterEmptyEl = null;

  // Mutate exported arrays/maps in place so part1 closures stay in sync after the JS split.
  function replaceList(list, next) {
    list.length = 0;
    const items = Array.isArray(next) ? next : [];
    if (items.length) list.push(...items);
  }

  function repopulateThermoByRoom() {
    M.thermoByRoom.clear();
    for (const t of M.thermostats) {
      const rid = normalizeRoomId(t.r);
      if (!M.thermoByRoom.has(rid)) M.thermoByRoom.set(rid, []);
      M.thermoByRoom.get(rid).push(t);
    }
  }

  function repopulateSensorByRoom() {
    M.sensorByRoom.clear();
    for (const s of M.tempSensors) {
      const rid = normalizeRoomId(s.r);
      if (!M.sensorByRoom.has(rid)) M.sensorByRoom.set(rid, []);
      M.sensorByRoom.get(rid).push(s);
    }
  }

  function syncRoomMap() {
    M.roomMap.clear();
    for (const r of M.rooms) M.roomMap.set(r.id, r.name);
  }

  // ---------- render ----------
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
      'Open the Modern Dashboard app on your hub and select your lights or thermostats.' +
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

  function ensureRoomsFromDevices() {
    if (M.rooms.length) return;
    const byId = new Map();
    const addRef = (item) => {
      const id = normalizeRoomId(item?.r);
      if (id === -1) return;
      if (!byId.has(id)) byId.set(id, { id, name: "Room " + id });
    };
    for (const dev of M.devices) addRef(dev);
    for (const t of M.thermostats) addRef(t);
    for (const s of M.tempSensors) addRef(s);
    for (const lk of M.locks) addRef(lk);
    if (!byId.size) return;
    replaceList(M.rooms, [...byId.values()].sort((a, b) => a.id - b.id));
    syncRoomMap();
  }

  function contentRoomIds() {
    const ids = new Set();
    for (const rid of M.devicesByRoom.keys()) ids.add(rid);
    for (const rid of M.thermoByRoom.keys()) ids.add(rid);
    for (const rid of M.sensorByRoom.keys()) ids.add(rid);
    return ids;
  }

  function getDisplayRoomIds(groups, hasContent) {
    const knownIds = new Set(M.rooms.map(r => r.id));
    const allIds = new Set(knownIds);
    for (const id of contentRoomIds()) allIds.add(id);
    const hasUnassigned = groups.has(-1) || M.roomHasClimate(-1);
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
    if (currentCategory() === "security") renderSecurityPopup();
    setTimeout(() => { M.fetchData().catch(() => {}); }, 3000);
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

  function getFavoriteEntries() {
    const out = [];
    for (const id of M.favorites) {
      const dev = M.devices.find(d => d.i === id);
      if (dev) { out.push({ type: "light", dev }); continue; }
      const t = M.thermostats.find(x => x.i === id);
      if (t) { out.push({ type: "thermostat", dev: t }); continue; }
      const ts = M.tempSensors.find(x => x.i === id);
      if (ts) { out.push({ type: "sensor", dev: normalizeTempSensorForCard(ts) }); continue; }
      const sen = sensors.find(x => x.i === id);
      if (sen) out.push({ type: "sensor", dev: sen });
    }
    return out;
  }

  function updateAllFavButtons() {
    for (const [, rec] of M.devMap) M.syncFavButton(rec.el.querySelector(".tile-fav"), rec.data.i);
    for (const [, rec] of M.favDevMap) M.syncFavButton(rec.el.querySelector(".tile-fav"), rec.data.i);
    for (const [, rec] of sensorCardMap) M.syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of favSensorMap) M.syncFavButton(rec.favBtn, rec.i);
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
    const idx = M.favorites.indexOf(numId);
    const wasFav = idx >= 0;
    if (wasFav) M.favorites.splice(idx, 1);
    else M.favorites.push(numId);
    updateAllFavButtons();
    updateQuickNavVisibility();
    if (currentCategory() === "favorites") renderFavoritesPopup();
    const ok = await saveFavorites(M.favorites);
    if (!ok) {
      if (wasFav) M.favorites.push(numId);
      else M.favorites.splice(M.favorites.indexOf(numId), 1);
      updateAllFavButtons();
      updateQuickNavVisibility();
      if (currentCategory() === "favorites") renderFavoritesPopup();
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
    for (const [, rec] of M.roomEls) rec.card.classList.remove("collapsed");
    updateExpandAllBtn();
    stopPolling();
    M.reorderMode = true;
    M.APP_EL?.classList.toggle("reorder-mode", true);
    closeTopbarOverflowMenu();
    if (M.REORDER_DONE_BTN) M.REORDER_DONE_BTN.hidden = false;
    if (M.REORDER_CANCEL_BTN) M.REORDER_CANCEL_BTN.hidden = false;
    M.SEARCH_EL.disabled = true;
    M.SEARCH_EL.blur();
    updateMoveButtons();
  }

  function exitReorderMode(resumePoll) {
    M.reorderMode = false;
    M.reorderBusy = false;
    M.reorderDraftOrder = null;
    M.reorderSnapshot = null;
    M.APP_EL?.classList.toggle("reorder-mode", false);
    if (M.REORDER_DONE_BTN) M.REORDER_DONE_BTN.hidden = true;
    if (M.REORDER_CANCEL_BTN) M.REORDER_CANCEL_BTN.hidden = true;
    M.SEARCH_EL.disabled = false;
    if (resumePoll) {
      startPolling();
      refresh();
    } else {
      applySearch();
    }
  }

  async function finishReorderMode() {
    const order = M.reorderDraftOrder ?? currentRoomOrderFromDom();
    const saved = await saveRoomOrder(order);
    if (!saved) return;
    M.cfg.roomOrder = order.length ? order.slice() : null;
    M.lastDataSig = "";
    exitReorderMode(true);
  }

  function cancelReorderMode() {
    M.cfg.roomOrder = M.reorderSnapshot ? M.reorderSnapshot.slice() : null;
    M.lastDataSig = "";
    exitReorderMode(false);
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
      const rooms = visibleRooms();
      let insertBefore = null;
      for (const room of M.rooms) {
        const rect = room.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
          insertBefore = room;
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
      if (!M.reorderMode || M.SEARCH_EL.value.trim()) return;
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

  function render(d) {
    replaceList(M.hubModes, d.hubModes);
    if (!hubModeLocked()) M.currentHubMode = d.currentHubMode || "";
    if (!hsmLocked()) {
      M.hsmStatus = d.hsmStatus || "";
      M.hsmAlert = d.hsmAlert || "";
      M.hsmAlertDesc = d.hsmAlertDesc || "";
    }
    M.hsmEnabled = !!d.hsmEnabled;
    M.hsmPinRequired = !!d.hsmPinRequired;
    M.thermostatsPopupEnabled = d.thermostatsPopupEnabled !== false;
    M.unlockPinEnabled = !!d.unlockPinEnabled;
    M.unlockPinRequired = !!d.unlockPinRequired;
    replaceList(M.scenes, d.scenes);
    replaceList(M.locks, d.locks);
    replaceList(M.music, d.music);
    if (Array.isArray(d.config?.favorites)) replaceList(M.favorites, d.config.favorites.map(Number));
    M.reapplyLockOptimistic();
    M.reapplyMusicOptimistic();
    M.reapplySetpointOptimistic();

    replaceList(M.rooms, sortRoomsByOrder(d.rooms || [], M.cfg.roomOrder));
    syncRoomMap();
    replaceList(M.devices, d.devices);
    replaceList(M.thermostats, d.thermostats);
    replaceList(M.tempSensors, d.tempSensors);
    replaceList(sensors, d.sensors);
    M.rebuildDevicesByRoom();
    M.reapplySwitchOptimistic();
    M.reapplyTstatDeviceModeLocks();
    M.applyTstatSessionModeLock();

    repopulateThermoByRoom();
    repopulateSensorByRoom();
    ensureRoomsFromDevices();
    updateQuickNavVisibility();

    if (!M.devices.length && !M.thermostats.length && !M.tempSensors.length) { noDevicesState(); return; }

    const groups = new Map();
    for (const dev of M.devices) {
      const rid = normalizeRoomId(dev.r);
      if (!groups.has(rid)) groups.set(rid, []);
      groups.get(rid).push(dev);
    }
    const hasContent = (rid) => (groups.get(normalizeRoomId(rid))?.length || M.roomHasClimate(rid));
    const displayOrder = getDisplayRoomIds(groups, hasContent);

    const sig = displayOrder.join(",") + "|" + M.devices.map(x => x.i).join(",")
      + "|" + M.thermostats.map(x => x.i).join(",") + "|" + M.tempSensors.map(x => x.i).join(",");
    const fullRerender = sig !== M.lastDataSig;
    M.lastDataSig = sig;

    if (fullRerender && !M.reorderMode) buildDom();
    updateStates();
    M.updateClimateWidgets();
    applySearch();
    refreshQuickPopupIfOpen();
  }

  function buildDom() {
    M.ROOMS_EL.innerHTML = "";
    M.roomEls.clear(); M.devMap.clear(); M.climateEls.clear();

    // group M.devices by room id (null/undefined -> -1 Unassigned)
    const groups = new Map();
    for (const dev of M.devices) {
      const rid = normalizeRoomId(dev.r);
      if (!groups.has(rid)) groups.set(rid, []);
      groups.get(rid).push(dev);
    }

    // a room is shown if it has lights, M.thermostats, or temp sensors
    const hasContent = (rid) => (groups.get(normalizeRoomId(rid))?.length || M.roomHasClimate(rid));

    const orderedIds = getDisplayRoomIds(groups, hasContent);

    for (const rid of orderedIds) {
      const roomKey = normalizeRoomId(rid);
      const devs = groups.get(roomKey) || [];
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
            if (quickPopup?.classList.contains("open")) closeQuickPopup();
            M.openTstatPopup(roomKey, el);
          });
        }
        head.appendChild(el);
        M.climateEls.set(roomKey, { el, iconEl, tempEl, controllable: climate.controllable });
      }

      const toggle = ce("div", "room-toggle");
      const offBtn = ce("button", "btn-off"); offBtn.type = "button"; offBtn.textContent = "Off";
      offBtn.addEventListener("click", (e) => { e.stopPropagation(); roomAll(roomKey, "off"); });
      const onBtn = ce("button", "btn-on"); onBtn.type = "button"; onBtn.textContent = "On";
      onBtn.addEventListener("click", (e) => { e.stopPropagation(); roomAll(roomKey, "on"); });
      toggle.appendChild(offBtn); toggle.appendChild(onBtn);
      head.appendChild(toggle);

      const col = ce("button", "room-collapse"); col.type = "button"; col.setAttribute("aria-label", "Collapse room");
      col.innerHTML = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
      col.addEventListener("click", (e) => {
        e.stopPropagation();
        card.classList.toggle("collapsed");
        persistCollapsed();
        updateExpandAllBtn();
      });
      head.appendChild(col);

      const body = ce("div", "room-body");

      card.appendChild(head); card.appendChild(body);
      M.ROOMS_EL.appendChild(card);

      attachRoomReorder(card, dragHandle);
      M.roomEls.set(roomKey, { card, body, meta, moveUp, moveDown });

      for (const dev of devs) body.appendChild(makeTile(dev));
    }

    restoreCollapsed();
    updateRoomMeta();
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
      slider.appendChild(ce("div", "slider-fill"));
      const thumb = ce("div", "slider-thumb"); slider.appendChild(thumb);
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

  // Tap detector for switch tiles: ignores scrolls, long-presses, and taps on the name.
  function attachSwitchTap(tile, id) {
    const TAP_MOVE = 10;
    const TAP_MAX_MS = 500;
    let downX = 0, downY = 0, downT = 0, active = false;

    tile.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest(".tile-bulb")) return;
      if (e.target.closest(".tile-fav")) return;
      active = true;
      downX = e.clientX; downY = e.clientY; downT = Date.now();
    }, { passive: true });

    tile.addEventListener("pointerup", (e) => {
      if (!active) return;
      active = false;
      if (e.target.closest(".tile-bulb")) return;
      if (e.target.closest(".tile-name")) return;
      if (e.target.closest(".tile-fav")) return;
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);
      if (dx > TAP_MOVE || dy > TAP_MOVE) return;
      if (Date.now() - downT > TAP_MAX_MS) return;
      toggleSwitch(id);
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

  const SLIDER_THUMB_PX = 30;

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
    const nameEl = qs(".tile-name", rec.el);
    if (nameEl) nameEl.classList.toggle("color-capable", rec.isDim);
    rec.levelEl.textContent = formatFootText(
      rec.isDim ? { ...dev, l: M.effectiveLevel(dev) } : dev,
      rec.isDim
    );
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
    updateRoomMeta();
  }

  function updateRoomMeta() {
    for (const [rid, rec] of M.roomEls) {
      const devs = M.devicesByRoom.get(rid) || [];
      const onCount = devs.filter((d) => M.effectiveSwitch(d)).length;
      const total = devs.length;
      const hasClimate = M.roomHasClimate(rid);
      let text;
      if (total > 0) {
        text = onCount ? onCount + " of " + total + " on" : (total + " light" + (total === 1 ? "" : "s"));
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
      } else if (hasClimate) {
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
      const rect = slider.getBoundingClientRect();
      const usable = rect.width - SLIDER_THUMB_PX;
      const x = (e.clientX != null ? e.clientX : 0) - rect.left - SLIDER_THUMB_PX / 2;
      let p = usable > 0 ? Math.round((x / usable) * 100) : 0;
      if (p < 0) p = 0; if (p > 100) p = 100;
      return p;
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
        return;
      }
      const lock = M.locks.find(x => x.i === Number(d.i));
      if (lock) {
        if (d.lk != null) lock.lk = d.lk ? 1 : 0;
        if (d.st != null) lock.st = d.st;
        const opt = M.lockOptimistic.get(Number(d.i));
        if (opt && !!lock.lk === !!opt.lk) M.clearLockOptimistic(Number(d.i));
        if (currentCategory() === "locks") renderLocksPopup();
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
        if (currentCategory() === "music") renderMusicPopup();
      }
    } catch {}
  }

  function reconcileLock(id) {
    setTimeout(() => refreshDevice(id), 7000);
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
      if (currentCategory() === "music") renderMusicPopup();
    }
    const result = await M.sendCmd(id, cmd, val);
    if (!result.ok) {
      M.clearMusicOptimistic(id);
      reconcileMusic(id);
      if (currentCategory() === "music") renderMusicPopup();
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
        if (currentCategory() === "music") renderMusicPopup();
      });
    }
    if (currentCategory() === "music") renderMusicPopup();
  }

  async function sendLockCmd(id, cmd, pin) {
    const lock = M.locks.find(l => l.i === id);
    if (!lock) return { ok: false };
    const lk = cmd === "lock" ? 1 : 0;
    const st = cmd === "lock" ? "locked" : "unlocked";
    M.hapticTap();
    M.setLockOptimistic(id, lk, st);
    if (currentCategory() === "locks") renderLocksPopup();
    const result = await M.sendCmd(id, cmd, null, pin);
    if (!result.ok) {
      M.clearLockOptimistic(id);
      reconcileLock(id);
      if (currentCategory() === "locks") renderLocksPopup();
    } else {
      reconcileLock(id);
    }
    return result;
  }

  function devicesNeedingCmd(devs, cmd) {
    return devs.filter((d) => (cmd === "on" ? !M.effectiveSwitch(d) : M.effectiveSwitch(d)));
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
    const toChange = devicesNeedingCmd(devs, cmd);
    if (!toChange.length) return;
    const ids = toChange.map(d => d.i);
    const hasDimmer = toChange.some(d => d.d);
    for (const dev of toChange) applySwitchCmdOptimistic(dev, cmd);
    updateStates();
    M.sendCmdBatch(ids.map(id => ({ id, cmd })));
    if (cmd === "on" && hasDimmer) setTimeout(refresh, 900); // reconcile restored levels
  }

  function allLights(cmd) {
    const toChange = devicesNeedingCmd(M.devices, cmd);
    if (!toChange.length) return;
    const ids = toChange.map(d => d.i);
    const hasDimmer = toChange.some(d => d.d);
    for (const dev of toChange) applySwitchCmdOptimistic(dev, cmd);
    updateStates();
    M.sendCmdBatch(ids.map(id => ({ id, cmd })));
    if (cmd === "on" && hasDimmer) setTimeout(refresh, 900);
  }

  let confirmPopup = null;
  let confirmPending = null;
  let quickPopup = null;

  function ensureQuickPopup() {
    if (quickPopup) return quickPopup;
    quickPopup = ce("div", "quick-popup");
    quickPopup.hidden = true;
    quickPopup.setAttribute("role", "dialog");
    quickPopup.setAttribute("aria-modal", "true");
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
    quickPopup.appendChild(panel);
    document.body.appendChild(quickPopup);

    quickPopup.addEventListener("click", (e) => {
      if (e.target === quickPopup) closeQuickPopup();
    });
    panel.addEventListener("click", (e) => e.stopPropagation());
    close.addEventListener("click", (e) => { e.stopPropagation(); closeQuickPopup(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && quickPopup.classList.contains("open")) closeQuickPopup();
    });

    quickPopup._title = title;
    quickPopup._body = body;
    return quickPopup;
  }

  function renderLocksPopup() {
    const popup = ensureQuickPopup();
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
    for (const lock of sorted) {
      const row = ce("div", "quick-lock-row");
      const info = ce("div", "quick-lock-info");
      const name = ce("span", "quick-fav-name");
      name.textContent = lock.n || ("Lock " + lock.i);
      const meta = ce("span", "quick-fav-meta");
      meta.textContent = roomLabel(lock.r) + " · " + M.lockStatusLabel(lock);
      info.appendChild(name);
      info.appendChild(meta);
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
      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  // ---------- sensors popup ----------
  function normalizeTempSensorForCard(s) {
    return { i: s.i, n: s.n, r: s.r, t: "temp", v: s.temp, u: s.u, a: 0, ex: [], _ref: s };
  }

  function mergedSensorList() {
    const out = [];
    for (const s of M.tempSensors) out.push({ i: s.i, n: s.n, r: s.r, t: "temp", v: s.temp, u: s.u, a: 0, ex: [], _ref: s });
    for (const s of sensors) out.push({ i: s.i, n: s.n, r: s.r, t: s.t, v: s.v, a: s.a, ex: s.ex || [], _ref: s });
    out.sort((a, b) => {
      const ra = roomLabel(a.r).localeCompare(roomLabel(b.r));
      if (ra !== 0) return ra;
      return String(a.n || "").localeCompare(String(b.n || ""));
    });
    return out;
  }

  function sensorsPopupSignature() {
    return mergedSensorList().map((d) => `${d.i}:${d.t}:${d.v}:${d.a}:${(d.ex || []).map((e) => e.k + e.v).join(".")}`).join("|");
  }

  function sensorTypesWithCounts() {
    const counts = new Map();
    for (const d of mergedSensorList()) counts.set(d.t, (counts.get(d.t) || 0) + 1);
    return [...counts.entries()].sort((a, b) => sensorTypeLabel(a[0]).localeCompare(sensorTypeLabel(b[0])));
  }

  function sensorMatchesFilter(dev) {
    return !sensorTypeFilter.size || sensorTypeFilter.has(dev.t);
  }

  function syncSensorFilterBtn() {
    if (!sensorFilterBtnEl) return;
    const n = sensorTypeFilter.size;
    sensorFilterBtnEl.classList.toggle("is-active", n > 0 || sensorFilterOpen);
    let badge = sensorFilterBtnEl.querySelector(".sensor-filter-btn-badge");
    if (n > 0) {
      if (!badge) {
        badge = ce("span", "sensor-filter-btn-badge");
        sensorFilterBtnEl.appendChild(badge);
      }
      badge.textContent = String(n);
      badge.hidden = false;
    } else if (badge) badge.hidden = true;
  }

  function syncSensorFilterChips() {
    if (!sensorFilterChipsEl) return;
    for (const btn of sensorFilterChipsEl.querySelectorAll(".sensor-filter-chip")) {
      const t = btn.dataset.type;
      const on = t === "all" ? !sensorTypeFilter.size : sensorTypeFilter.has(t);
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function applySensorTypeFilter() {
    let visible = 0;
    for (const dev of mergedSensorList()) {
      const rec = sensorCardMap.get(dev.i);
      if (!rec) continue;
      const show = sensorMatchesFilter(dev);
      rec.el.hidden = !show;
      if (show) visible++;
    }
    if (sensorFilterEmptyEl) sensorFilterEmptyEl.hidden = visible > 0;
    syncSensorFilterBtn();
    syncSensorFilterChips();
  }

  function buildSensorFilterBar() {
    const toolbar = ce("div", "sensor-toolbar");
    const filterBtn = ce("button", "sensor-filter-btn");
    filterBtn.type = "button";
    filterBtn.innerHTML = FILTER_SVG + '<span class="sensor-filter-btn-label">Filter</span>';
    filterBtn.setAttribute("aria-expanded", sensorFilterOpen ? "true" : "false");
    filterBtn.setAttribute("aria-label", "Filter sensors by type");
    toolbar.appendChild(filterBtn);
    sensorFilterBtnEl = filterBtn;

    const chips = ce("div", "sensor-filter-chips");
    chips.hidden = !sensorFilterOpen;
    chips.classList.toggle("is-open", sensorFilterOpen);
    const allBtn = ce("button", "sensor-filter-chip");
    allBtn.type = "button";
    allBtn.dataset.type = "all";
    allBtn.textContent = "All";
    allBtn.setAttribute("aria-pressed", !sensorTypeFilter.size ? "true" : "false");
    if (!sensorTypeFilter.size) allBtn.classList.add("active");
    allBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sensorTypeFilter.clear();
      applySensorTypeFilter();
    });
    chips.appendChild(allBtn);
    for (const [t, n] of sensorTypesWithCounts()) {
      const btn = ce("button", "sensor-filter-chip sensor-filter-chip--" + t);
      btn.type = "button";
      btn.dataset.type = t;
      btn.textContent = sensorTypeLabel(t) + " " + n;
      btn.setAttribute("aria-pressed", sensorTypeFilter.has(t) ? "true" : "false");
      if (sensorTypeFilter.has(t)) btn.classList.add("active");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (sensorTypeFilter.has(t)) sensorTypeFilter.delete(t);
        else sensorTypeFilter.add(t);
        applySensorTypeFilter();
      });
      chips.appendChild(btn);
    }
    sensorFilterChipsEl = chips;
    filterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sensorFilterOpen = !sensorFilterOpen;
      chips.hidden = !sensorFilterOpen;
      chips.classList.toggle("is-open", sensorFilterOpen);
      filterBtn.setAttribute("aria-expanded", sensorFilterOpen ? "true" : "false");
      syncSensorFilterBtn();
    });
    syncSensorFilterBtn();
    return { toolbar, chips };
  }

  function sensorExFooter(dev) {
    const ex = dev.ex || [];
    if (!ex.length) return "";
    const parts = [];
    for (const e of ex.slice(0, 2)) {
      let txt = humanizeAttr(e.k);
      const v = e.v;
      if (v != null && v !== "") {
        if (e.k === "battery") txt += " " + Math.round(Number(v)) + "%";
        else if (e.k === "temperature") txt += " " + Math.round(Number(v)) + tstatTempSuffix(e.u);
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
    card.setAttribute("aria-label", `${dev.n || "Sensor"}, ${roomLabel(dev.r)}, ${sensorTypeLabel(dev.t)}${pill ? ", " + pill : ""}`);
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
    metaRow.textContent = roomLabel(dev.r) + " · " + sensorTypeLabel(dev.t);
    const foot = ce("div", "sensor-card-foot");
    const fav = ce("button", "sensor-card-fav tile-fav");
    fav.type = "button";
    attachFavButton(fav, dev.i);
    card.appendChild(top);
    card.appendChild(hero);
    card.appendChild(name);
    card.appendChild(metaRow);
    card.appendChild(foot);
    card.appendChild(fav);
    const rec = { el: card, heroEl: hero, pillEl: pill, pillTxt, dot, footEl: foot, favBtn: fav, t: dev.t, i: dev.i };
    applySensorCardState(card, dev, rec);
    if (context === "favorites") favSensorMap.set(dev.i, rec);
    else sensorCardMap.set(dev.i, rec);
    return card;
  }

  function makeFavoriteSensorCard(dev) {
    return makeSensorCard(dev, "favorites");
  }

  function updateSensorCard(dev) {
    const rec = sensorCardMap.get(dev.i);
    if (rec) applySensorCardState(rec.el, dev, rec);
  }

  function renderSensorsPopup() {
    const popup = ensureQuickPopup();
    const body = currentBody();
    body.className = "quick-body quick-body-sensors" + (inTabView() ? " tab-body" : "");
    body.innerHTML = "";
    sensorCardMap.clear();
    sensorFilterChipsEl = null;
    sensorFilterBtnEl = null;
    sensorFilterEmptyEl = null;
    const merged = mergedSensorList();
    sensorsPopupSig = sensorsPopupSignature();
    if (!merged.length) {
      body.textContent = "No sensors selected — add temperature or other sensors in Hubitat app settings";
      return;
    }
    const wrap = ce("div", "sensor-popup-wrap");
    const { toolbar, chips } = buildSensorFilterBar();
    const grid = ce("div", "sensor-grid");
    for (const dev of merged) grid.appendChild(makeSensorCard(dev));
    const empty = ce("div", "sensor-filter-empty");
    empty.textContent = "No sensors match this filter";
    empty.hidden = true;
    sensorFilterEmptyEl = empty;
    wrap.appendChild(toolbar);
    wrap.appendChild(chips);
    wrap.appendChild(grid);
    wrap.appendChild(empty);
    body.appendChild(wrap);
    applySensorTypeFilter();
  }

  function refreshSensorsPopup() {
    if (currentCategory() !== "sensors") return;
    const sig = sensorsPopupSignature();
    const body = currentBody();
    if (!body.querySelector(".sensor-grid") || sig !== sensorsPopupSig) {
      renderSensorsPopup();
      return;
    }
    for (const dev of mergedSensorList()) updateSensorCard(dev);
    applySensorTypeFilter();
  }

  let musicVolTimer = null;
  function renderMusicPopup() {
    const popup = ensureQuickPopup();
    const body = currentBody();
    body.className = "quick-body quick-body-music" + (inTabView() ? " tab-body" : "");
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
    for (const dev of sorted) {
      const ctrl = M.musicControls(dev);
      const playing = M.isMusicPlaying(M.effectiveMusicStatus(dev));
      const status = M.effectiveMusicStatus(dev);
      const vol = M.effectiveMusicVolume(dev);
      const muted = dev.m === "muted";
      const canPlayPause = ctrl.play || ctrl.pause;

      const row = ce("div", "music-row" + (playing ? " is-playing" : ""));
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
      if (muted && ctrl.mute) {
        const mute = ce("span", "music-muted-badge");
        mute.textContent = "Muted";
        art.appendChild(mute);
      }

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

      const transportCount = (ctrl.prev ? 1 : 0) + (canPlayPause ? 1 : 0) + (ctrl.stop ? 1 : 0) + (ctrl.next ? 1 : 0);
      const transport = ce("div", "music-transport" + (transportCount <= 3 ? " is-compact" : ""));
      if (ctrl.prev) {
        const prevBtn = ce("button", "music-btn");
        prevBtn.type = "button";
        prevBtn.setAttribute("aria-label", "Previous track");
        prevBtn.innerHTML = MUSIC_PREV_SVG;
        prevBtn.addEventListener("click", () => sendMusicCmd(dev.i, "previousTrack"));
        transport.appendChild(prevBtn);
      }
      if (canPlayPause) {
        const playPauseBtn = ce("button", "music-btn music-btn-primary");
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
        const stopBtn = ce("button", "music-btn");
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
      row.appendChild(info);
      const right = ce("div", "music-right");
      if (transport.childElementCount) right.appendChild(transport);
      if (ctrl.volume) right.appendChild(volWrap);
      row.appendChild(right);
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  function renderHubModePopup() {
    const popup = ensureQuickPopup();
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
    panel.appendChild(dots);
    panel.appendChild(keys);
    panel.appendChild(actions);
    M.pinPadPopup.appendChild(panel);
    document.body.appendChild(M.pinPadPopup);

    M.pinPadPopup.addEventListener("click", (e) => {
      if (e.target === M.pinPadPopup) closePinPad();
    });
    panel.addEventListener("click", (e) => e.stopPropagation());
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
    M.pinPadPopup._dots = dots;
    M.pinPadPopup._keys = keys;
    M.pinPadPopup._submit = submit;
    return M.pinPadPopup;
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
    M.pinPadState.pin += d;
    renderPinPadDots();
  }

  function backspacePinDigit() {
    if (!M.pinPadState || !M.pinPadState.pin.length) return;
    M.hapticTap();
    M.pinPadState.pin = M.pinPadState.pin.slice(0, -1);
    renderPinPadDots();
  }

  function closePinPad() {
    if (!M.pinPadPopup) return;
    M.pinPadPopup.hidden = true;
    M.pinPadPopup.classList.remove("open");
    M.pinPadPopup.classList.remove("shake");
    M.pinPadState = null;
  }

  function openPinPad({ title, onSubmit, onCancel }) {
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
      b.textContent = mode.label;
      if (hsmModeIsActive(M.hsmStatus, mode)) b.classList.add("active");
      b.addEventListener("click", () => {
        if (skipActive && hsmModeIsActive(M.hsmStatus, mode)) return;
        runHsmAction(mode.label, mode.cmd);
      });
      container.appendChild(b);
    }
  }

  function renderSecurityPopup() {
    const popup = ensureQuickPopup();
    const body = popup._body;
    body.className = "quick-body quick-body-security";
    body.innerHTML = "";
    if (!M.hsmEnabled) {
      body.textContent = "Enable HSM control in the Hubitat app settings";
      return;
    }

    const statusWrap = ce("div", "quick-hsm-status");
    const statusLabel = ce("span", "quick-hsm-status-label");
    statusLabel.textContent = hsmStatusLabel(M.hsmStatus);
    statusWrap.appendChild(statusLabel);
    const monMeta = ce("span", "quick-hsm-status-meta");
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
      cancelBtn.textContent = "Cancel Alert";
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
    const intrModes = ce("div", "tstat-modes quick-hsm-modes");
    appendHsmModeButtons(intrModes, HSM_INTRUSION_MODES);
    intrSection.appendChild(intrModes);
    body.appendChild(intrSection);

    const monSection = ce("div", "quick-hsm-section");
    const monTitle = ce("h3", "quick-hsm-section-title");
    monTitle.textContent = "Leak & Environmental";
    monSection.appendChild(monTitle);
    const monDesc = ce("p", "quick-hsm-section-meta");
    monDesc.textContent = "Water leak, smoke, and CO monitoring";
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

  function renderScenesPopup() {
    const popup = ensureQuickPopup();
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
        const ok = await activateSceneApi(sc.id);
        b.disabled = false;
        if (ok) M.flash("Scene activated");
      });
      list.appendChild(b);
    }
    body.appendChild(list);
  }

  function favoritesPopupSignature() {
    return getFavoriteEntries().map((e) => e.type + ":" + e.dev.i).join(",");
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
    for (const entry of getFavoriteEntries()) {
      if (entry.type !== "thermostat") continue;
      const t = M.thermostats.find((x) => x.i === entry.dev.i) || entry.dev;
      updateQuickTstatCard(t, M.favTstatMap);
    }
    updateStates();
    if (M.favTstatModeMenu) M.repositionFavoriteTstatModeMenu();
  }

  function renderFavoritesPopup() {
    M.closeFavoriteTstatModeMenu();
    const popup = ensureQuickPopup();
    popup.classList.toggle("quick-popup-wide", !inTabView());
    const body = currentBody();
    body.className = "quick-body quick-body-favorites" + (inTabView() ? " tab-body" : "");
    body.innerHTML = "";
    M.favDevMap.clear();
    M.favTstatMap.clear();
    favSensorMap.clear();
    const entries = getFavoriteEntries();
    M.favPopupSig = favoritesPopupSignature();
    if (!entries.length) {
      body.textContent = "Tap the star on any light, thermostat, or sensor to add it here";
      return;
    }
    const grid = ce("div", "quick-fav-grid");
    for (const entry of entries) {
      if (entry.type === "light") {
        grid.appendChild(makeTile(entry.dev, "favorites"));
      } else if (entry.type === "thermostat") {
        grid.appendChild(makeQuickTstatCard(entry.dev, M.favTstatMap));
      } else {
        grid.appendChild(makeFavoriteSensorCard(entry.dev));
      }
    }
    body.appendChild(grid);
    updateStates();
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
    const popup = ensureQuickPopup();
    popup.classList.toggle("quick-popup-wide", !inTabView());
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
      const ra = roomLabel(a.r).localeCompare(roomLabel(b.r));
      if (ra !== 0) return ra;
      return String(a.n || "").localeCompare(String(b.n || ""));
    });
    const grid = ce("div", "quick-fav-grid");
    for (const t of sorted) grid.appendChild(makeQuickTstatCard(t, M.tstatsPopupMap));
    body.appendChild(grid);
  }

  function quickNavPopupHasContent(popup) {
    switch (popup) {
      case "locks": return M.locks.length > 0;
      case "scenes": return M.scenes.length > 0;
      case "hub-mode": return M.hubModes.length > 0;
      case "security": return M.hsmEnabled;
      case "blinds":
      case "scheduling": return false;
      case "sensors": return mergedSensorList().length > 0;
      case "thermostats": return M.thermostatsPopupEnabled && M.thermostats.length > 0;
      case "music": return M.music.length > 0;
      case "favorites": return getFavoriteEntries().length > 0;
      default: return false;
    }
  }

  function updateQuickNavVisibility() {
    let anyVisible = false;
    for (const { id, popup } of QUICK_NAV) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      const show = quickNavPopupHasContent(popup);
      btn.hidden = !show;
      if (show) anyVisible = true;
    }
    // Lights tab is shown whenever tab mode is on (independent of content)
    if (M.tabMode && M.QUICK_LIGHTS_BTN) { M.QUICK_LIGHTS_BTN.hidden = false; anyVisible = true; }
    const nav = document.querySelector(".quick-nav");
    if (nav) nav.hidden = !anyVisible;
    if (M.quickPopupOpenType && !quickNavPopupHasContent(M.quickPopupOpenType)) closeQuickPopup();
    if (M.tabMode && inTabView() && !quickNavPopupHasContent(M.activeTab)) showTab("lights");
  }

  function refreshQuickPopupIfOpen() {
    if (inTabView()) {
      switch (M.activeTab) {
        case "music": renderMusicPopup(); break;
        case "favorites": refreshFavoritesPopup(); break;
        case "thermostats": refreshThermostatsPopup(); break;
        case "sensors": refreshSensorsPopup(); break;
      }
      return;
    }
    if (!quickPopup?.classList.contains("open") || !M.quickPopupOpenType) return;
    switch (M.quickPopupOpenType) {
      case "hub-mode": renderHubModePopup(); break;
      case "locks": renderLocksPopup(); break;
      case "music": renderMusicPopup(); break;
      case "favorites": refreshFavoritesPopup(); break;
      case "thermostats": refreshThermostatsPopup(); break;
      case "security": renderSecurityPopup(); break;
      case "sensors": refreshSensorsPopup(); break;
    }
  }

  function openQuickPopup(id, title) {
    if (M.colorSession) M.closeColorPopup(true);
    if (M.tstatSession) M.closeTstatPopup();
    M.closeMusicMasterPopup();
    const popup = ensureQuickPopup();
    popup.classList.toggle("quick-popup-wide", id === "favorites" || id === "sensors" || id === "thermostats");
    popup.classList.toggle("quick-popup-hub-mode", id === "hub-mode");
    popup._title.textContent = title;
    popup.setAttribute("aria-label", title);
    M.quickPopupOpenType = id;
    switch (id) {
      case "hub-mode": renderHubModePopup(); break;
      case "scenes": renderScenesPopup(); break;
      case "favorites": renderFavoritesPopup(); break;
      case "locks": renderLocksPopup(); break;
      case "music": renderMusicPopup(); break;
      case "security": renderSecurityPopup(); break;
      case "sensors": renderSensorsPopup(); break;
      case "thermostats": renderThermostatsPopup(); break;
      default:
        popup._body.className = "quick-body";
        popup._body.textContent = "Coming soon";
    }
    popup.hidden = false;
    popup.classList.add("open");
    popup.querySelector(".quick-close").focus();
  }

  function closeQuickPopup() {
    M.closeFavoriteTstatModeMenu();
    if (!quickPopup) return;
    quickPopup.hidden = true;
    quickPopup.classList.remove("open");
    quickPopup.classList.remove("quick-popup-wide");
    quickPopup.classList.remove("quick-popup-hub-mode");
    M.quickPopupOpenType = null;
    M.favDevMap.clear();
    M.favTstatMap.clear();
    favSensorMap.clear();
    M.favPopupSig = "";
    M.tstatsPopupMap.clear();
    M.tstatsPopupSig = "";
    sensorCardMap.clear();
    sensorsPopupSig = "";
    sensorTypeFilter.clear();
    sensorFilterOpen = false;
    sensorFilterChipsEl = null;
    sensorFilterBtnEl = null;
    sensorFilterEmptyEl = null;
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
    return ensureQuickPopup()._body;
  }

  function currentCategory() {
    if (M.tabMode && M.activeTab !== "lights") return M.activeTab;
    return M.quickPopupOpenType;
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
    if (quickPopup && quickPopup.classList.contains("open")) closeQuickPopup();
    M.activeTab = id;
    ensureTabView();
    const nonLights = id !== "lights";
    if (M.ROOMS_EL) M.ROOMS_EL.hidden = nonLights;
    if (M.tabViewEl) M.tabViewEl.hidden = !nonLights;
    if (M.ALL_ON_BTN) M.ALL_ON_BTN.hidden = nonLights;
    if (M.ALL_OFF_BTN) M.ALL_OFF_BTN.hidden = nonLights;
    if (M.CENTRAL_TSTAT_BTN) M.CENTRAL_TSTAT_BTN.hidden = !(M.tabMode && id === "thermostats");
    if (M.CENTRAL_MUSIC_BTN) M.CENTRAL_MUSIC_BTN.hidden = !(M.tabMode && id === "music");
    if (M.SEARCH_EL) M.SEARCH_EL.placeholder = nonLights ? "Search " + (M.TAB_LABELS[id] || "items") : "Search lights or rooms";
    updateTabActiveStates();
    if (nonLights) {
      switch (id) {
        case "favorites": renderFavoritesPopup(); break;
        case "sensors": renderSensorsPopup(); break;
        case "thermostats": renderThermostatsPopup(); break;
        case "music": renderMusicPopup(); break;
      }
    }
    applySearch();
  }

  function closeCurrentView() {
    if (M.tabMode && M.activeTab !== "lights") showTab("lights");
    else closeQuickPopup();
  }

  function setTabMode(on) {
    M.cfg.enableTabs = on;
    M.tabMode = on;
    M.saveTabsPref(on);
    if (M.QUICK_LIGHTS_BTN) M.QUICK_LIGHTS_BTN.hidden = !on;
    if (!on) {
      if (quickPopup && quickPopup.classList.contains("open")) closeQuickPopup();
      M.activeTab = "lights";
      if (M.ROOMS_EL) M.ROOMS_EL.hidden = false;
      if (M.tabViewEl) M.tabViewEl.hidden = true;
      if (M.ALL_ON_BTN) M.ALL_ON_BTN.hidden = false;
      if (M.ALL_OFF_BTN) M.ALL_OFF_BTN.hidden = false;
      if (M.CENTRAL_TSTAT_BTN) M.CENTRAL_TSTAT_BTN.hidden = true;
      if (M.CENTRAL_MUSIC_BTN) M.CENTRAL_MUSIC_BTN.hidden = true;
      if (M.SEARCH_EL) M.SEARCH_EL.placeholder = "Search lights or rooms";
    } else {
      showTab("lights");
    }
    updateTabActiveStates();
    updateQuickNavVisibility();
  }

  function closeConfirm(result) {
    if (!confirmPopup) return;
    confirmPopup.hidden = true;
    confirmPopup.classList.remove("open");
    const resolve = confirmPending;
    confirmPending = null;
    if (resolve) resolve(result);
  }

  function ensureConfirmPopup() {
    if (confirmPopup) return confirmPopup;
    confirmPopup = ce("div", "confirm-popup");
    confirmPopup.hidden = true;
    confirmPopup.setAttribute("role", "dialog");
    confirmPopup.setAttribute("aria-modal", "true");
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
    confirmPopup.appendChild(panel);
    document.body.appendChild(confirmPopup);

    confirmPopup.addEventListener("click", (e) => {
      if (e.target === confirmPopup) closeConfirm(false);
    });
    panel.addEventListener("click", (e) => e.stopPropagation());
    cancel.addEventListener("click", (e) => { e.stopPropagation(); closeConfirm(false); });
    ok.addEventListener("click", (e) => { e.stopPropagation(); M.hapticTap(); closeConfirm(true); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && confirmPopup.classList.contains("open")) closeConfirm(false);
    });

    confirmPopup._msg = msg;
    confirmPopup._ok = ok;
    return confirmPopup;
  }

  function confirmAction({ message, confirmLabel, danger = false }) {
    return new Promise((resolve) => {
      const popup = ensureConfirmPopup();
      popup._msg.textContent = message;
      popup._ok.textContent = confirmLabel;
      popup._ok.classList.toggle("danger", danger);
      confirmPending = resolve;
      popup.hidden = false;
      popup.classList.add("open");
      popup._ok.focus();
    });
  }

  if (M.ALL_ON_BTN) {
    M.ALL_ON_BTN.addEventListener("click", async () => {
      if (!M.devices.length) return;
      if (await confirmAction({ message: "Turn on all lights?", confirmLabel: "All on" })) allLights("on");
    });
  }
  if (M.ALL_OFF_BTN) {
    M.ALL_OFF_BTN.addEventListener("click", async () => {
      if (!M.devices.length) return;
      if (await confirmAction({ message: "Turn off all lights?", confirmLabel: "All off", danger: true })) allLights("off");
    });
  }

  // ---------- filter ----------
  let collapsedBeforeSearch = null;

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
    const collapsed = allRoomsCollapsed();
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
      if (allRoomsCollapsed()) expandAllRooms();
      else collapseAllRooms();
    });
  }

  if (M.REORDER_DONE_BTN) {
    M.REORDER_DONE_BTN.addEventListener("click", finishReorderMode);
  }

  if (M.REORDER_CANCEL_BTN) {
    M.REORDER_CANCEL_BTN.addEventListener("click", cancelReorderMode);
  }

  if (M.OVERFLOW_BTN) {
    M.OVERFLOW_BTN.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleTopbarOverflowMenu();
    });
  }

  if (M.MENU_REORDER_BTN) {
    M.MENU_REORDER_BTN.addEventListener("click", () => {
      closeTopbarOverflowMenu();
      enterReorderMode();
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
      if (M.cfg.enableHaptics) testHaptics();
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

  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (M.cfg.theme === "auto") M.applyTheme("auto");
    });
  } catch {}

  M.applyTheme(M.cfg.theme);

  // ---------- polling ----------
  async function refresh() {
    try {
      const d = await M.fetchData();
      render(d);
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
    if (M.pollTimer) startPolling();
  }
  function stopPolling() { if (M.pollTimer) { clearInterval(M.pollTimer); M.pollTimer = null; } }

  // ---------- websocket (local only) ----------
  function startWS() {
    if (!M.cfg.useWebSocket) return;
    if (M.ws) return;
    if (location.hostname === "cloud.hubitat.com" || location.protocol === "https:") return; // M.ws not available via cloud proxy
    const wsUrl = "ws://" + location.host + "/eventsocket";
    try { M.ws = new WebSocket(wsUrl); } catch { M.ws = null; return; }
    M.ws.onopen = () => { M.wsRetry = 0; M.wsConnected = true; restartPolling(); };
    M.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (!m) return;
        if (m.source === "LOCATION") {
          if (m.name === "hsmStatus" && !hsmLocked()) {
            M.hsmStatus = String(m.value || "");
            if (currentCategory() === "security") renderSecurityPopup();
          } else if (m.name === "hsmAlert") {
            M.hsmAlert = String(m.value || "");
            if (m.descriptionText) M.hsmAlertDesc = String(m.descriptionText);
            if (currentCategory() === "security") renderSecurityPopup();
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
            updateStates();
          }
          else if (m.name === "level" && rec.isDim) {
            const lvl = Math.round(Number(m.value));
            if (!isNaN(lvl)) {
              if (dev) dev.l = lvl;
              M.clearSwitchOptimistic(Number(m.deviceId));
              if (!rec.el.classList.contains("dragging")) updateStates();
            }
          }
          else if (m.name === "colorTemperature" && rec.data.ct) {
            const k = Math.round(Number(m.value));
            if (!isNaN(k) && (!M.colorSession || M.colorSession.id !== rec.data.i)) {
              rec.data.k = k;
              updateStates();
            }
          }
          else if (m.name === "hue" && rec.data.rgb) {
            const h = Math.round(Number(m.value));
            if (!isNaN(h) && (!M.colorSession || M.colorSession.id !== rec.data.i)) {
              rec.data.h = h;
              updateStates();
            }
          }
          else if (m.name === "saturation" && rec.data.rgb) {
            const sat = Math.round(Number(m.value));
            if (!isNaN(sat) && (!M.colorSession || M.colorSession.id !== rec.data.i)) {
              rec.data.sat = sat;
              updateStates();
            }
          }
          return;
        }
        const lock = M.locks.find(x => x.i === Number(m.deviceId));
        if (lock && String(m.name || "") === "lock") {
          const val = String(m.value || "");
          const opt = M.lockOptimistic.get(lock.i);
          if (opt && opt.until > Date.now()) return;
          lock.st = val;
          lock.lk = val === "locked" ? 1 : 0;
          if (currentCategory() === "locks") renderLocksPopup();
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
          updateRoomMeta();
          M.refreshOpenTstatQuickPopups();
          return;
        }
        const s = M.tempSensors.find(x => x.i === Number(m.deviceId));
        if (s && String(m.name || "") === "temperature") {
          const n = Number(m.value);
          if (!isNaN(n)) {
            s.temp = Math.round(n);
            M.updateClimateWidgets();
            updateRoomMeta();
            if (currentCategory() === "sensors") refreshSensorsPopup();
          }
          return;
        }
        const sen = sensors.find(x => x.i === Number(m.deviceId));
        if (sen) {
          const nm = String(m.name || "").toLowerCase();
          const val = m.value;
          if (nm === "battery" || nm === "temperature" || nm === "humidity" || nm === "illuminance") {
            const ex = sen.ex || (sen.ex = []);
            let entry = ex.find((e) => e.k === nm);
            if (entry) { entry.v = val; if (m.unit) entry.u = m.unit; }
            else if (ex.length < 3) ex.push({ k: nm, v: val, u: m.unit || null });
          } else {
            sen.v = val;
            const alerts = ({ motion: ["active"], contact: ["open"], water: ["wet"], leak: ["wet"], smoke: ["detected"], presence: ["present"] })[sen.t] || [];
            sen.a = alerts.includes(String(val || "").toLowerCase()) ? 1 : 0;
          }
          if (currentCategory() === "sensors") refreshSensorsPopup();
        }
      } catch {}
    };
    M.ws.onclose = () => { M.ws = null; M.wsConnected = false; restartPolling(); scheduleReconnect(); };
    M.ws.onerror = () => { try { M.ws.close(); } catch {} };
  }
  function scheduleReconnect() {
    if (!M.cfg.useWebSocket) return;
    M.wsRetry = Math.min(M.wsRetry + 1, 6);
    const delay = Math.min(15000, 1000 * 2 ** M.wsRetry);
    setTimeout(startWS, delay);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stopPolling(); }
    else { refresh(); startPolling(); startWS(); }
  });

  // ---------- init ----------
  updateExpandAllBtn();
  QUICK_NAV.forEach(({ id, popup, title, svg }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.innerHTML = svg;
    btn.addEventListener("click", () => {
      M.hapticTap();
      if (M.tabMode && M.TAB_CATEGORIES.has(popup)) showTab(popup);
      else openQuickPopup(popup, title);
    });
  });
  if (M.QUICK_LIGHTS_BTN) {
    M.QUICK_LIGHTS_BTN.innerHTML = LIGHTS_SVG;
    M.QUICK_LIGHTS_BTN.addEventListener("click", () => {
      M.hapticTap();
      if (M.tabMode) showTab("lights");
    });
    M.QUICK_LIGHTS_BTN.hidden = !M.tabMode;
  }
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
  if (location.protocol === "https:" && "serviceWorker" in navigator) {
    navigator.serviceWorker.register(M.withToken("sw.js"), { scope: "./" }).catch(() => {});
  }

  (async function init() {
    loadingState();
    try {
      const d = await M.fetchData();
      render(d);
      startPolling();
      startWS();
    } catch (e) {
      console.error("Dashboard init failed:", e);
      const detail = e?.message ? String(e.message) : "";
      M.setStatus("Cannot reach hub. Make sure you opened the dashboard via the app URL.", true);
      emptyState(
        '<div class="empty"><h2>Connection error</h2>' +
        'Could not load /data. Open this page through the Modern Dashboard app URL on your hub.' +
        (detail ? '<p class="empty-detail">' + detail.replace(/</g, "&lt;") + '</p>' : '') +
        '</div>'
      );
    }
  })();

  // Monolith dev: expose part-two handlers for M.postCall() in part one.
  Object.assign(globalThis.__MLD ||= {}, {
    updateStates,
    refreshDevice,
    reconcileDevice,
    renderLocksPopup,
    renderMusicPopup,
    renderFavoritesPopup,
    refreshFavoritesPopup,
    renderThermostatsPopup,
    refreshThermostatsPopup,
    toggleFavorite,
  });
  Object.assign(M, { replaceList, repopulateThermoByRoom, repopulateSensorByRoom, syncRoomMap, emptyState, loadingState, noDevicesState, sortRoomsByOrder, ensureRoomsFromDevices, contentRoomIds, getDisplayRoomIds, saveRoomOrder, postJson, postJsonSilent, setHsmApi, setHubModeApi, activateSceneApi, saveFavorites, hubModeLocked, hsmLocked, roomLabel, getFavoriteEntries, updateAllFavButtons, attachFavButton, toggleFavorite, currentRoomOrderFromDom, updateDraftOrderFromDom, updateMoveButtons, moveRoom, enterReorderMode, exitReorderMode, finishReorderMode, cancelReorderMode, closeTopbarOverflowMenu, openTopbarOverflowMenu, toggleTopbarOverflowMenu, attachRoomReorder, render, buildDom, makeTile, attachSwitchTap, attachBulbTap, attachColorNameClick, clampLevel, setSliderLevel, syncTileState, updateStates, updateRoomMeta, attachDrag, testHaptics, toggleSwitch, toggleDimmer, reconcileDevice, refreshDevice, reconcileLock, reconcileMusic, sendMusicCmd, broadcastMusic, broadcastMusicVolume, sendLockCmd, devicesNeedingCmd, applySwitchCmdOptimistic, roomAll, allLights, ensureQuickPopup, renderLocksPopup, normalizeTempSensorForCard, mergedSensorList, sensorsPopupSignature, sensorTypesWithCounts, sensorMatchesFilter, syncSensorFilterBtn, syncSensorFilterChips, applySensorTypeFilter, buildSensorFilterBar, sensorExFooter, applySensorCardState, makeSensorCard, makeFavoriteSensorCard, updateSensorCard, renderSensorsPopup, refreshSensorsPopup, renderMusicPopup, renderHubModePopup, ensurePinPadPopup, renderPinPadDots, appendPinDigit, backspacePinDigit, closePinPad, openPinPad, promptUnlockPin, runHsmAction, appendHsmModeButtons, renderSecurityPopup, renderScenesPopup, favoritesPopupSignature, makeQuickTstatCard, updateQuickTstatCard, refreshFavoritesPopup, renderFavoritesPopup, thermostatsListSignature, refreshThermostatsPopup, renderThermostatsPopup, quickNavPopupHasContent, updateQuickNavVisibility, refreshQuickPopupIfOpen, openQuickPopup, closeQuickPopup, ensureTabView, currentBody, currentCategory, inTabView, updateTabActiveStates, showTab, closeCurrentView, setTabMode, closeConfirm, ensureConfirmPopup, confirmAction, collapsedIdSet, applyFilter, applyTabSearch, applySearch, collapsedSet, persistCollapsed, allRoomsCollapsed, updateExpandAllBtn, collapseAllRooms, expandAllRooms, restoreCollapsed, refresh, effectivePollInterval, startPolling, restartPolling, stopPolling, startWS, scheduleReconnect });
})();
