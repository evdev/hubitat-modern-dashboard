(() => {
  "use strict";

  const ROOMS_EL = document.getElementById("rooms");
  const SEARCH_EL = document.getElementById("search");
  const STATUS_EL = document.getElementById("status");
  const ALL_ON_BTN = document.getElementById("all-on");
  const ALL_OFF_BTN = document.getElementById("all-off");
  const CENTRAL_TSTAT_BTN = document.getElementById("tstat-central-btn");
  const CENTRAL_MUSIC_BTN = document.getElementById("music-central-btn");
  const EXPAND_ALL_BTN = document.getElementById("expand-all");
  const REORDER_DONE_BTN = document.getElementById("reorder-done");
  const REORDER_CANCEL_BTN = document.getElementById("reorder-cancel");
  const OVERFLOW_BTN = document.getElementById("topbar-overflow-btn");
  const OVERFLOW_MENU = document.getElementById("topbar-overflow-menu");
  const MENU_REORDER_BTN = document.getElementById("menu-reorder");
  const MENU_HAPTICS_EL = document.getElementById("menu-haptics");
  const MENU_TABS_EL = document.getElementById("menu-tabs");
  const MENU_THEME_SEGMENT = document.getElementById("menu-theme-segment");
  const HAPTICS_STORAGE_KEY = "mld_haptics";
  const THEME_STORAGE_KEY = "mld_theme";
  const TABS_STORAGE_KEY = "mld_tabs";
  const THEME_OPTIONS = ["dark", "light", "auto"];
  const APP_EL = document.getElementById("app");
  const REORDER_DRAG_THRESHOLD = 8;
  const DASHBOARD_TITLE_EL = document.getElementById("dashboard-title");

  const POLL_DEFAULT = 5000;
  const POLL_WS_FALLBACK = 45000;

  function loadHapticsPref() {
    try {
      const raw = localStorage.getItem(HAPTICS_STORAGE_KEY);
      if (raw === "0") return false;
      if (raw === "1") return true;
    } catch {}
    return true;
  }

  function saveHapticsPref(on) {
    try { localStorage.setItem(HAPTICS_STORAGE_KEY, on ? "1" : "0"); } catch {}
  }

  function loadThemePref() {
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (THEME_OPTIONS.includes(raw)) return raw;
    } catch {}
    return "auto";
  }

  function saveThemePref(theme) {
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
  }

  function loadTabsPref() {
    try {
      const raw = localStorage.getItem(TABS_STORAGE_KEY);
      if (raw === "0") return false;
      if (raw === "1") return true;
    } catch {}
    return false;
  }

  function saveTabsPref(on) {
    try { localStorage.setItem(TABS_STORAGE_KEY, on ? "1" : "0"); } catch {}
  }

  let cfg = { pollIntervalMs: POLL_DEFAULT, useWebSocket: false, theme: loadThemePref(), dashboardName: "mDash", roomOrder: null, enableHaptics: loadHapticsPref(), enableTabs: loadTabsPref() };

  // state
  let rooms = [];            // [{id,name}]
  let roomMap = new Map();   // id -> name
  let devices = [];          // [{i,n,r,d,ct,s,l,k}]
  let devicesByRoom = new Map(); // roomId -> [device]
  let devMap = new Map();    // id -> {el, data}
  let favDevMap = new Map(); // id -> {el, data} (favorites popup tiles)
  let roomEls = new Map();   // roomId -> {card, body, meta}
  let lastDataSig = "";
  let pollTimer = null;
  let ws = null;
  let wsConnected = false;
  let wsRetry = 0;
  let reorderMode = false;
  let reorderBusy = false;
  let reorderSnapshot = null;
  let reorderDraftOrder = null;

  let colorPopup = null;
  let colorSession = null;
  const levelOptimistic = new Map(); // device id -> { level, until, timer }
  const switchOptimistic = new Map(); // device id -> { s, l?, until, timer }
  const lockOptimistic = new Map(); // lock id -> { lk, st, until, timer }
  const shadeOptimistic = new Map(); // shade id -> { st?, pos?, until, timer }
  const musicOptimistic = new Map(); // music id -> { st, v?, until, timer }
  const setpointOptimistic = new Map(); // tstat id -> { hsp?, csp?, until, timer }

  let rgbWheelCache = null;

  // ---- thermostat ----
  let thermostats = [];          // [{i,n,r,tm,os,hsp,csp,temp,u,hasFm,fm,hasFs,fs,supM,supFM,fsLev}]
  let tempSensors = [];          // [{i,n,r,temp,u}]
  let thermoByRoom = new Map();  // roomId -> [thermostat]
  let sensorByRoom = new Map();  // roomId -> [temp sensor]
  let climateEls = new Map();    // roomId -> { el, iconEl, tempEl, controllable }
  let tstatPopup = null;
  let tstatSession = null;       // { rid, anchor, ids:[], unit, edit:"heat"|"cool" }
  const tstatDeviceModeLock = new Map(); // id -> { until, mode }

  let musicMasterPopup = null;
  const MUSIC_VOL_STEP = 5;

  let hubModes = [];
  let currentHubMode = "";
  let scenes = [];
  let locks = [];
  let windowShades = [];
  let music = [];
  let favorites = [];
  let snapshots = {};
  let roomGestureLockCount = 0;
  let hubModeLockUntil = 0;
  let hsmStatus = "";
  let hsmAlert = "";
  let hsmAlertDesc = "";
  let hsmEnabled = false;
  let hsmPinRequired = false;
  let thermostatsPopupEnabled = false;
  let unlockPinEnabled = false;
  let unlockPinRequired = false;
  let hsmLockUntil = 0;
  let pinPadPopup = null;
  let pinPadState = null;
  let quickPopupOpenType = null;

  // ---------- tab mode (inline tabs instead of popups) ----------
  const TAB_CATEGORIES = new Set(["favorites", "sensors", "thermostats", "music"]);
  const TAB_LABELS = { lights: "Lights", favorites: "Favorites", sensors: "Sensors", thermostats: "Thermostats", music: "Music" };
  let tabMode = cfg.enableTabs;
  let activeTab = "lights";
  let tabViewEl = null;
  const QUICK_LIGHTS_BTN = document.getElementById("quick-lights");
  let favTstatModeMenu = null;
  let favTstatModeMenuCleanup = null;
  let favTstatModeMenuId = null;
  let favTstatModeMenuAnchor = null;
  let favTstatMap = new Map(); // tstat id -> { el, card, spEl, stateEl, stateTxt, modeLabel, modeBtn, minus, plus }
  let favPopupSig = "";
  let tstatsPopupMap = new Map();
  let tstatsPopupSig = "";

  function setLevelOptimistic(id, level) {
    const prev = levelOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const until = Date.now() + LEVEL_OPTIMISTIC_MS;
    const timer = setTimeout(() => {
      levelOptimistic.delete(id);
      postCall("updateStates");
    }, LEVEL_OPTIMISTIC_MS);
    levelOptimistic.set(id, { level, until, timer });
  }

  function setSwitchOptimistic(id, s, l) {
    const prev = switchOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const dev = devices.find((d) => d.i === id);
    if (dev) {
      dev.s = s;
      if (l !== undefined) dev.l = l;
    }
    const entry = { s, until: Date.now() + LEVEL_OPTIMISTIC_MS, timer: null };
    if (l !== undefined) entry.l = l;
    entry.timer = setTimeout(() => {
      switchOptimistic.delete(id);
      postCall("updateStates");
    }, LEVEL_OPTIMISTIC_MS);
    switchOptimistic.set(id, entry);
  }

  function clearSwitchOptimistic(id) {
    const prev = switchOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    switchOptimistic.delete(id);
  }

  function reapplySwitchOptimistic() {
    for (const [id, opt] of switchOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        switchOptimistic.delete(id);
        continue;
      }
      const dev = devices.find((d) => d.i === id);
      if (!dev) continue;
      const sMatch = !!dev.s === !!opt.s;
      const lMatch = opt.l === undefined || (opt.l === null && opt.s === 1) || dev.l === opt.l;
      if (sMatch && lMatch) {
        if (opt.timer) clearTimeout(opt.timer);
        switchOptimistic.delete(id);
        continue;
      }
      dev.s = opt.s;
      if (opt.l !== undefined) dev.l = opt.l;
    }
  }

  function effectiveSwitch(dev) {
    const opt = switchOptimistic.get(dev.i);
    if (opt && Date.now() < opt.until) return !!opt.s;
    return !!dev.s;
  }

  function effectiveLevel(dev) {
    const swOpt = switchOptimistic.get(dev.i);
    if (swOpt && Date.now() < swOpt.until && swOpt.l === null) return null;
    const opt = levelOptimistic.get(dev.i);
    if (opt && Date.now() < opt.until) return opt.level;
    return dev.l;
  }

  function setLockOptimistic(id, lk, st) {
    const prev = lockOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const lock = locks.find((l) => l.i === id);
    if (lock) {
      lock.lk = lk;
      lock.st = st;
    }
    const timer = setTimeout(() => {
      lockOptimistic.delete(id);
      if (postCall("currentCategory") === "locks") postCall("renderLocksPopup");
    }, LEVEL_OPTIMISTIC_MS);
    lockOptimistic.set(id, { lk, st, until: Date.now() + LEVEL_OPTIMISTIC_MS, timer });
  }

  function clearLockOptimistic(id) {
    const prev = lockOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    lockOptimistic.delete(id);
  }

  function reapplyLockOptimistic() {
    for (const [id, opt] of lockOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        lockOptimistic.delete(id);
        continue;
      }
      const lock = locks.find((l) => l.i === id);
      if (!lock) continue;
      if (!!lock.lk === !!opt.lk) {
        if (opt.timer) clearTimeout(opt.timer);
        lockOptimistic.delete(id);
        continue;
      }
      lock.lk = opt.lk;
      lock.st = opt.st;
    }
  }

  function effectiveLock(lock) {
    const opt = lockOptimistic.get(lock.i);
    if (opt && Date.now() < opt.until) return !!opt.lk;
    return !!lock.lk;
  }

  function lockStatusLabel(lock) {
    const opt = lockOptimistic.get(lock.i);
    const st = (opt && Date.now() < opt.until) ? opt.st : lock.st;
    if (st === "jammed") return "Jammed";
    if (st === "unknown") return "Unknown";
    if (st === "unavailable") return "Unavailable";
    return effectiveLock(lock) ? "Locked" : "Unlocked";
  }

  function setShadeOptimistic(id, patch) {
    const prev = shadeOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const shade = windowShades.find((s) => s.i === id);
    if (shade) {
      if (patch.st != null) shade.st = patch.st;
      if (patch.pos != null) shade.pos = patch.pos;
    }
    const entry = {
      st: patch.st != null ? patch.st : prev?.st,
      pos: patch.pos != null ? patch.pos : prev?.pos,
      until: Date.now() + LEVEL_OPTIMISTIC_MS,
      timer: null,
    };
    entry.timer = setTimeout(() => {
      shadeOptimistic.delete(id);
      if (quickPopupOpenType === "blinds") postCall("renderBlindsPopup");
    }, LEVEL_OPTIMISTIC_MS);
    shadeOptimistic.set(id, entry);
  }

  function clearShadeOptimistic(id) {
    const prev = shadeOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    shadeOptimistic.delete(id);
  }

  function reapplyShadeOptimistic() {
    for (const [id, opt] of shadeOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        shadeOptimistic.delete(id);
        continue;
      }
      const shade = windowShades.find((s) => s.i === id);
      if (!shade) continue;
      let matched = true;
      if (opt.st != null && shade.st !== opt.st) matched = false;
      if (opt.pos != null && shade.pos !== opt.pos) matched = false;
      if (matched) {
        if (opt.timer) clearTimeout(opt.timer);
        shadeOptimistic.delete(id);
        continue;
      }
      if (opt.st != null) shade.st = opt.st;
      if (opt.pos != null) shade.pos = opt.pos;
    }
  }

  function effectiveShadeState(shade) {
    const opt = shadeOptimistic.get(shade.i);
    if (opt && Date.now() < opt.until && opt.st != null) return opt.st;
    return shade.st || "unknown";
  }

  function effectiveShadePosition(shade) {
    const opt = shadeOptimistic.get(shade.i);
    if (opt && Date.now() < opt.until && opt.pos != null) return opt.pos;
    return shade.pos;
  }

  function shadeIsMoving(shade) {
    const st = effectiveShadeState(shade);
    return st === "opening" || st === "closing";
  }

  function shadeStatusLabel(shade) {
    const st = effectiveShadeState(shade);
    const pos = effectiveShadePosition(shade);
    const posText = pos != null ? pos + "%" : null;
    if (st === "opening") return "Opening…";
    if (st === "closing") return "Closing…";
    if (st === "open") return posText ? posText + " · Open" : "Open";
    if (st === "closed") return posText ? posText + " · Closed" : "Closed";
    if (st === "partially open") return posText ? posText + " · Partially open" : "Partially open";
    if (st === "unknown" || st === "unavailable") return st.charAt(0).toUpperCase() + st.slice(1);
    return posText || st || "—";
  }

  function isMusicPlaying(st) {
    return st === "playing" || st === "transitioning" || st === "running";
  }

  function musicControls(dev) {
    const f = dev.f == null ? 127 : Number(dev.f);
    return {
      play: !!(f & 1),
      pause: !!(f & 2),
      stop: !!(f & 4),
      prev: !!(f & 8),
      next: !!(f & 16),
      volume: !!(f & 32),
      mute: !!(f & 64),
    };
  }

  function effectiveMusicStatus(dev) {
    const opt = musicOptimistic.get(dev.i);
    if (opt && Date.now() < opt.until && opt.st != null) return opt.st;
    return dev.st || "idle";
  }

  function effectiveMusicVolume(dev) {
    const opt = musicOptimistic.get(dev.i);
    if (opt && Date.now() < opt.until && opt.v != null) return opt.v;
    return dev.v == null ? null : dev.v;
  }

  function musicStatusLabel(dev) {
    const st = effectiveMusicStatus(dev);
    if (st === "playing") return "Playing";
    if (st === "transitioning") return "Transitioning";
    if (st === "paused") return "Paused";
    if (st === "stopped") return "Stopped";
    return "Idle";
  }

  function setMusicOptimistic(id, patch) {
    const prev = musicOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const dev = music.find((m) => m.i === id);
    if (dev) {
      if (patch.st != null) dev.st = patch.st;
      if (patch.v != null) dev.v = patch.v;
    }
    const entry = {
      st: patch.st ?? null,
      v: patch.v ?? null,
      until: Date.now() + LEVEL_OPTIMISTIC_MS,
      timer: null,
    };
    entry.timer = setTimeout(() => {
      musicOptimistic.delete(id);
      if (postCall("currentCategory") === "music") postCall("renderMusicPopup");
    }, LEVEL_OPTIMISTIC_MS);
    musicOptimistic.set(id, entry);
  }

  function clearMusicOptimistic(id) {
    const prev = musicOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    musicOptimistic.delete(id);
  }

  function reapplyMusicOptimistic() {
    for (const [id, opt] of musicOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        musicOptimistic.delete(id);
        continue;
      }
      const dev = music.find((m) => m.i === id);
      if (!dev) continue;
      const stMatch = opt.st == null || dev.st === opt.st;
      const vMatch = opt.v == null || dev.v === opt.v;
      if (stMatch && vMatch) {
        if (opt.timer) clearTimeout(opt.timer);
        musicOptimistic.delete(id);
        continue;
      }
      if (opt.st != null) dev.st = opt.st;
      if (opt.v != null) dev.v = opt.v;
    }
  }


  function setSetpointOptimistic(id, patch) {
    const prev = setpointOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const t = thermostats.find((x) => x.i === id);
    if (t) {
      if (patch.hsp != null) t.hsp = patch.hsp;
      if (patch.csp != null) t.csp = patch.csp;
    }
    const entry = {
      hsp: patch.hsp ?? null,
      csp: patch.csp ?? null,
      until: Date.now() + LEVEL_OPTIMISTIC_MS,
      timer: null,
    };
    entry.timer = setTimeout(() => {
      setpointOptimistic.delete(id);
      if (tstatSession?.ids?.includes(id)) {
        renderTstatDial();
        updateClimateWidgets();
      }
      refreshOpenTstatQuickPopups();
      postCall("refreshDevice", id);
    }, LEVEL_OPTIMISTIC_MS);
    setpointOptimistic.set(id, entry);
  }

  function clearSetpointOptimistic(id) {
    const prev = setpointOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    setpointOptimistic.delete(id);
  }

  function reapplySetpointOptimistic() {
    for (const [id, opt] of setpointOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        setpointOptimistic.delete(id);
        continue;
      }
      const t = thermostats.find((x) => x.i === id);
      if (!t) continue;
      const hspMatch = opt.hsp == null || t.hsp === opt.hsp;
      const cspMatch = opt.csp == null || t.csp === opt.csp;
      if (hspMatch && cspMatch) {
        if (opt.timer) clearTimeout(opt.timer);
        setpointOptimistic.delete(id);
        continue;
      }
      if (opt.hsp != null) t.hsp = opt.hsp;
      if (opt.csp != null) t.csp = opt.csp;
    }
  }

  function applyTstatSetpoints(t, { hsp, csp }) {
    const opt = setpointOptimistic.get(t.i);
    if (hsp != null && (!opt || Date.now() >= opt.until || opt.hsp == null)) {
      t.hsp = Number(hsp);
    }
    if (csp != null && (!opt || Date.now() >= opt.until || opt.csp == null)) {
      t.csp = Number(csp);
    }
    if (opt && Date.now() < opt.until) {
      if (opt.hsp != null) t.hsp = opt.hsp;
      if (opt.csp != null) t.csp = opt.csp;
      const hspOk = opt.hsp == null || (hsp != null && Number(hsp) === opt.hsp);
      const cspOk = opt.csp == null || (csp != null && Number(csp) === opt.csp);
      if (hspOk && cspOk) clearSetpointOptimistic(t.i);
    }
  }

  function drawRgbWheel(canvas) {
    const ctx = canvas.getContext("2d");
    if (rgbWheelCache) {
      ctx.drawImage(rgbWheelCache, 0, 0);
      return;
    }
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2;
    const off = document.createElement("canvas");
    off.width = size;
    off.height = size;
    const offCtx = off.getContext("2d");
    const img = offCtx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * size + x) * 4;
        if (dist > radius) {
          data[idx + 3] = 0;
          continue;
        }
        const { h, s } = posToHs(cx, cy, x + 0.5, y + 0.5, radius);
        const [r, g, b] = hsToRgb(h, s);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);
    rgbWheelCache = off;
    ctx.drawImage(off, 0, 0);
  }

  function ensureColorPopup() {
    if (colorPopup) return colorPopup;
    colorPopup = ce("div", "ct-popup");
    colorPopup.hidden = true;
    colorPopup.setAttribute("role", "dialog");
    colorPopup.setAttribute("aria-modal", "true");
    colorPopup.setAttribute("aria-label", "Light settings");
    const panel = ce("div", "ct-panel");
    const head = ce("div", "ct-head");
    const value = ce("div", "ct-value");
    const closeBtn = ce("button", "ct-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close light settings");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeColorPopup(true);
    });
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
    const levelFill = ce("div", "level-fill");
    const levelThumb = ce("div", "level-thumb");
    levelTrack.appendChild(levelFill);
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
    colorPopup.appendChild(panel);
    document.body.appendChild(colorPopup);

    colorPopup._valueEl = value;
    colorPopup._tabsEl = tabs;
    colorPopup._tabCt = tabCt;
    colorPopup._tabRgb = tabRgb;
    colorPopup._tabLevel = tabLevel;
    colorPopup._paneCt = paneCt;
    colorPopup._paneRgb = paneRgb;
    colorPopup._paneLevel = paneLevel;
    colorPopup._trackEl = track;
    colorPopup._thumbEl = thumb;
    colorPopup._levelTrackEl = levelTrack;
    colorPopup._levelFillEl = levelFill;
    colorPopup._levelThumbEl = levelThumb;
    colorPopup._wheelCanvas = canvas;
    colorPopup._wheelCursor = cursor;
    colorPopup._presetsEl = presets;

    drawRgbWheel(canvas);
    attachCtTrackDrag(track);
    attachCtPresets(ctPresets);
    attachLevelTrackDrag(levelTrack);
    attachLevelPresets(levelPresets);
    attachRgbWheel(canvas, cursor);
    attachRgbPresets(presets);

    tabCt.addEventListener("click", (e) => { e.stopPropagation(); setColorTab("ct"); });
    tabRgb.addEventListener("click", (e) => { e.stopPropagation(); setColorTab("rgb"); });
    tabLevel.addEventListener("click", (e) => { e.stopPropagation(); setColorTab("level"); });

    panel.addEventListener("click", (e) => e.stopPropagation());
    colorPopup.addEventListener("click", (e) => {
      if (e.target === colorPopup) closeColorPopup(true);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && colorSession) closeColorPopup(false);
    });

    return colorPopup;
  }

  function setColorTab(tab) {
    if (!colorSession) return;
    colorSession.tab = tab;
    updateColorPopupUI();
  }

  function updateColorPopupUI() {
    if (!colorSession) return;
    const popup = ensureColorPopup();
    const sess = colorSession;
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
    const roomRec = devMap.get(id);
    if (roomRec) out.push(roomRec);
    const favRec = favDevMap.get(id);
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
      if (!btn || !colorSession) return;
      e.stopPropagation();
      const k = Number(btn.dataset.k);
      colorSession.k = k;
      colorSession.changed = true;
      applyCtChange(colorSession.id, k);
      sendCmd(colorSession.id, "setCT", k);
      ensureLightOn(colorSession.id);
    });
  }

  function attachLevelPresets(presetsEl) {
    presetsEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".level-preset");
      if (!btn || !colorSession) return;
      e.stopPropagation();
      const level = Number(btn.dataset.l);
      colorSession.level = level;
      colorSession.changed = true;
      applyLevelChange(colorSession.id, level);
      setLevelOptimistic(colorSession.id, level);
      sendCmd(colorSession.id, "setLevel", level);
    });
  }

  function attachLevelTrackDrag(track) {
    let lastCommit = 0;

    function levelFromEvent(e) {
      const rect = track.getBoundingClientRect();
      const x = (e.clientX != null ? e.clientX : 0) - rect.left;
      let pct = Math.round((x / rect.width) * 100);
      if (pct < 0) pct = 0;
      if (pct > 100) pct = 100;
      return pct;
    }

    function adjust(e) {
      if (!colorSession || colorSession.tab !== "level") return;
      const level = levelFromEvent(e);
      colorSession.level = level;
      colorSession.changed = true;
      applyLevelChange(colorSession.id, level);
      const now = Date.now();
      if (now - lastCommit > 300) {
        lastCommit = now;
        setLevelOptimistic(colorSession.id, level);
        sendCmd(colorSession.id, "setLevel", level);
      }
      e.preventDefault();
    }

    function stop(e) {
      track.removeEventListener("pointermove", adjust);
      track.removeEventListener("pointerup", stop);
      track.removeEventListener("pointercancel", stop);
      try { if (e?.pointerId != null) track.releasePointerCapture(e.pointerId); } catch {}
      if (colorSession && colorSession.tab === "level") {
        setLevelOptimistic(colorSession.id, colorSession.level);
        sendCmd(colorSession.id, "setLevel", colorSession.level);
      }
    }

    function start(e) {
      if (!colorSession || colorSession.tab !== "level") return;
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

  function attachRgbPresets(presetsEl) {
    presetsEl.addEventListener("click", (e) => {
      const sw = e.target.closest(".rgb-swatch");
      if (!sw || !colorSession) return;
      e.stopPropagation();
      const h = Number(sw.dataset.h);
      const s = Number(sw.dataset.s);
      colorSession.h = h;
      colorSession.s = s;
      colorSession.changed = true;
      applyRgbChange(colorSession.id, h, s);
      sendCmd(colorSession.id, "setColor", h + "," + s);
      ensureLightOn(colorSession.id);
    });
  }

  function attachRgbWheel(canvas, cursor) {
    let lastCommit = 0;
    const radius = RGB_WHEEL_SIZE / 2;

    function pick(e) {
      if (!colorSession || colorSession.tab !== "rgb") return;
      const rect = canvas.getBoundingClientRect();
      const scale = canvas.width / rect.width;
      const x = (e.clientX - rect.left) * scale;
      const y = (e.clientY - rect.top) * scale;
      const { h, s } = posToHs(radius, radius, x, y, radius - 2);
      colorSession.h = h;
      colorSession.s = s;
      colorSession.changed = true;
      applyRgbChange(colorSession.id, h, s);
      const now = Date.now();
      if (now - lastCommit > 300) {
        lastCommit = now;
        sendCmd(colorSession.id, "setColor", h + "," + s);
        ensureLightOn(colorSession.id);
      }
      e.preventDefault();
    }

    function stop(e) {
      canvas.removeEventListener("pointermove", pick);
      canvas.removeEventListener("pointerup", stop);
      canvas.removeEventListener("pointercancel", stop);
      try { if (e?.pointerId != null) canvas.releasePointerCapture(e.pointerId); } catch {}
      if (colorSession && colorSession.tab === "rgb") {
        sendCmd(colorSession.id, "setColor", colorSession.h + "," + colorSession.s);
      }
    }

    function start(e) {
      if (!colorSession || colorSession.tab !== "rgb") return;
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
    const dev = devices.find((d) => d.i === id);
    if (dev && !effectiveSwitch(dev)) {
      setSwitchOptimistic(id, 1);
      postCall("updateStates");
    }
  }

  function attachCtTrackDrag(track) {
    let lastCommit = 0;

    function adjust(e) {
      if (!colorSession || colorSession.tab !== "ct") return;
      const k = kFromEvent(track, e);
      colorSession.k = k;
      colorSession.changed = true;
      applyCtChange(colorSession.id, k);
      const now = Date.now();
      if (now - lastCommit > 300) {
        lastCommit = now;
        sendCmd(colorSession.id, "setCT", k);
        ensureLightOn(colorSession.id);
      }
      e.preventDefault();
    }

    function stop(e) {
      track.removeEventListener("pointermove", adjust);
      track.removeEventListener("pointerup", stop);
      track.removeEventListener("pointercancel", stop);
      try { if (e?.pointerId != null) track.releasePointerCapture(e.pointerId); } catch {}
      if (colorSession && colorSession.tab === "ct") sendCmd(colorSession.id, "setCT", colorSession.k);
    }

    function start(e) {
      if (!colorSession || colorSession.tab !== "ct") return;
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

  function kToPct(k) {
    return ((k - CT_K_MIN) / (CT_K_MAX - CT_K_MIN)) * 100;
  }

  function pctToK(pct) {
    const k = Math.round(CT_K_MIN + (pct / 100) * (CT_K_MAX - CT_K_MIN));
    return Math.max(CT_K_MIN, Math.min(CT_K_MAX, k));
  }

  function kFromEvent(track, e) {
    const rect = track.getBoundingClientRect();
    const x = (e.clientX != null ? e.clientX : 0) - rect.left;
    let pct = (x / rect.width) * 100;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    return pctToK(pct);
  }

  function setCtVisual(k) {
    const popup = ensureColorPopup();
    const pct = kToPct(k);
    popup._valueEl.textContent = k + "K";
    popup._thumbEl.style.left = pct + "%";
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
    popup._levelFillEl.style.width = l + "%";
    popup._levelThumbEl.style.left = l + "%";
    popup.querySelectorAll(".level-preset").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.l) === l);
    });
  }

  function openColorPopup(id, anchorEl, dev) {
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
    const rawLevel = effectiveLevel(dev) ?? dev.l ?? 0;
    const level = Math.max(0, Math.min(100, Math.round(rawLevel)));
    colorSession = { id, anchorEl, tab, hasCt, hasRgb, hasLevel, k, h, s, level, changed: false };
    const popup = ensureColorPopup();
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    publishMld({ colorSession, colorPopup: popup });
    updateColorPopupUI();
    if (tab !== "level") ensureLightOn(id);
  }

  function closeColorPopup(commit) {
    if (!colorSession) return;
    const { id, tab, k, h, s, level, changed } = colorSession;
    if (commit && changed) {
      const rec = devMap.get(id);
      if (tab === "ct") {
        sendCmd(id, "setCT", k);
        if (rec) { rec.data.k = k; rec.data.s = 1; postCall("updateStates"); }
      } else if (tab === "rgb") {
        sendCmd(id, "setColor", h + "," + s);
        if (rec) { rec.data.h = h; rec.data.sat = s; rec.data.s = 1; postCall("updateStates"); }
      } else if (tab === "level") {
        setLevelOptimistic(id, level);
        sendCmd(id, "setLevel", level);
        if (rec) {
          rec.data.l = level;
          rec.data.s = level > 0 ? 1 : 0;
          postCall("updateStates");
        }
      }
      postCall("reconcileDevice", id);
    }
    if (colorPopup) {
      colorPopup.setAttribute("hidden", "");
      colorPopup.classList.remove("open");
    }
    colorSession = null;
    publishMld({ colorSession: null, colorPopup });
  }

  function closeCtPopup(commit) { closeColorPopup(commit); }

  // =================== thermostat ===================
  function supportedModes(t) {
    const list = parseList(t?.supM);
    return list.length ? list : TSTAT_DEFAULT_MODES;
  }

  function supportedFanModes(t) {
    const list = parseList(t?.supFM);
    if (list.length) return list;
    return t?.hasFm ? TSTAT_DEFAULT_FAN_MODES : [];
  }

  function deviceHasFanSpeed(t) {
    return !!(t?.hasFs || parseList(t?.fsLev).length);
  }

  function supportedFanSpeeds(t) {
    const list = parseList(t?.fsLev);
    if (list.length) return list;
    return deviceHasFanSpeed(t) ? FAN_SPEED_OPTS.map((o) => o.key) : [];
  }

  function showFanSpeedControls(t) {
    return String(t?.fm || "").toLowerCase() === "on" && deviceHasFanSpeed(t);
  }

  function fanModeActive(fm) {
    const m = String(fm || "").toLowerCase();
    return m === "on" || m === "circulate";
  }

  function tstatSectionLabel(text) {
    const el = ce("div", "tstat-section-label");
    el.textContent = text;
    return el;
  }

  // icon color: mode-driven (off=gray, heat=red, cool=blue, fan=white),
  // with auto falling back to operating state, and fan-on overriding to white
  function tstatStateClass(t) {
    const os = String(t?.os || "").toLowerCase();
    const tm = String(t?.tm || "").toLowerCase();
    const fmOn = !!(t?.hasFm && fanModeActive(t.fm));
    if (tm === "heat" || tm === "emergency heat") return "state-heat";
    if (tm === "cool") return "state-cool";
    if (tm === "auto") {
      if (os === "heating" || os === "pending heat") return "state-heat";
      if (os === "cooling" || os === "pending cool") return "state-cool";
      if (fmOn || os === "fan" || os === "fan only") return "state-fan";
      return "state-off";
    }
    if (fmOn) return "state-fan"; // fan-only while "off"
    return "state-off";
  }

  function formatRoomTemp(device) {
    if (device?.temp == null) return "—";
    return Math.round(Number(device.temp)) + tstatTempSuffix(device.u);
  }

  function roomClimateInfo(rid) {
    const key = normalizeRoomId(rid);
    const thermos = thermoByRoom.get(key);
    if (thermos?.length) return { device: thermos[0], controllable: true };
    const sensors = sensorByRoom.get(key);
    if (sensors?.length) return { device: sensors[0], controllable: false };
    return null;
  }

  function roomHasClimate(rid) {
    const key = normalizeRoomId(rid);
    return thermoByRoom.has(key) || sensorByRoom.has(key);
  }

  // pick the most "active" thermostat in a room for the icon color
  function roomTstatState(rid) {
    const list = thermoByRoom.get(normalizeRoomId(rid)) || [];
    const rank = { "state-heat": 3, "state-cool": 2, "state-fan": 1, "state-off": 0 };
    let best = "state-off";
    for (const t of list) {
      const cls = tstatStateClass(t);
      if (rank[cls] > rank[best]) best = cls;
    }
    return best;
  }

  function isFavorite(id) {
    return favorites.includes(Number(id));
  }

  function syncFavButton(btn, id) {
    if (!btn) return;
    const on = isFavorite(id);
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Remove from favorites" : "Add to favorites");
  }

  function updateTstatFavButton() {
    if (!tstatPopup?._favBtn || !tstatSession?.ids?.length) return;
    if (tstatSession.central) { tstatPopup._favBtn.hidden = true; return; }
    tstatPopup._favBtn.hidden = false;
    syncFavButton(tstatPopup._favBtn, tstatSession.ids[0]);
  }

  function postCall(name, ...args) {
    const fn = globalThis.__MLD?.[name];
    if (typeof fn === "function") return fn(...args);
  }

  function ensureTstatPopup() {
    if (tstatPopup) return tstatPopup;
    tstatPopup = ce("div", "tstat-popup");
    tstatPopup.hidden = true;
    tstatPopup.setAttribute("role", "dialog");
    tstatPopup.setAttribute("aria-modal", "true");
    tstatPopup.setAttribute("aria-label", "Thermostat");

    const panel = ce("div", "tstat-panel");
    const head = ce("div", "tstat-head");
    const leading = ce("div", "tstat-head-leading");
    const title = ce("div", "tstat-title");
    const favBtn = ce("button", "tstat-fav");
    favBtn.type = "button";
    favBtn.innerHTML = FAVORITES_SVG;
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = tstatSession?.ids?.[0];
      if (id == null) return;
      hapticTap();
      postCall("toggleFavorite", id);
    });
    const closeBtn = ce("button", "tstat-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close thermostat");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", (e) => { e.stopPropagation(); closeTstatPopup(); });
    leading.appendChild(title); leading.appendChild(favBtn);
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
    heatChip.addEventListener("click", (e) => { e.stopPropagation(); if (tstatSession) { tstatSession.edit = "heat"; renderTstatDial(); } });
    const coolChip = ce("button", "tstat-chip cool"); coolChip.type = "button"; coolChip.textContent = "Cool";
    coolChip.addEventListener("click", (e) => { e.stopPropagation(); if (tstatSession) { tstatSession.edit = "cool"; renderTstatDial(); } });
    chips.appendChild(heatChip); chips.appendChild(coolChip);

    const modeSection = ce("div", "tstat-section");
    modeSection.appendChild(tstatSectionLabel("Thermostat mode"));
    const modes = ce("div", "tstat-modes");
    const modeBtns = {};
    for (const m of TSTAT_MODE_DEFS) {
      const b = ce("button", "tstat-mode");
      b.type = "button";
      b.textContent = m.label;
      b.dataset.modeKey = m.key;
      b.setAttribute("aria-label", "Set thermostat to " + m.label);
      b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); setTstatMode(m.cmd, m.key); });
      modes.appendChild(b);
      modeBtns[m.key] = b;
    }
    const offBtn = ce("button", "tstat-mode off");
    offBtn.type = "button";
    offBtn.dataset.modeKey = "off";
    offBtn.setAttribute("aria-label", "Turn thermostat off");
    offBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9"/><path d="M7.5 5.5a7 7 0 1 0 9 0"/></svg>';
    offBtn.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); setTstatMode("off", "off"); });
    modes.appendChild(offBtn);
    modeBtns.off = offBtn;
    modeSection.appendChild(modes);

    const fanModeSection = ce("div", "tstat-section");
    fanModeSection.appendChild(tstatSectionLabel("Fan mode"));
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
    fanSpeedSection.appendChild(tstatSectionLabel("Fan speed"));
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
    tstatPopup.appendChild(panel);
    document.body.appendChild(tstatPopup);

    panel.addEventListener("click", (e) => e.stopPropagation());
    tstatPopup.addEventListener("click", (e) => {
      if (e.target === tstatPopup) closeTstatPopup();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && tstatSession) closeTstatPopup();
    });

    tstatPopup._panel = panel;
    tstatPopup._title = title;
    tstatPopup._favBtn = favBtn;
    tstatPopup._svg = svg;
    tstatPopup._heatArc = heatArc;
    tstatPopup._coolArc = coolArc;
    tstatPopup._heatKnob = heatKnob;
    tstatPopup._coolKnob = coolKnob;
    tstatPopup._tempEl = tempEl;
    tstatPopup._spEl = spEl;
    tstatPopup._minusBtn = minusBtn;
    tstatPopup._plusBtn = plusBtn;
    tstatPopup._chips = chips;
    tstatPopup._heatChip = heatChip;
    tstatPopup._coolChip = coolChip;
    tstatPopup._modeSection = modeSection;
    tstatPopup._modes = modes;
    tstatPopup._modeBtns = modeBtns;
    tstatPopup._fanModeSection = fanModeSection;
    tstatPopup._fanModes = fanModes;
    tstatPopup._fanModeBtns = fanModeBtns;
    tstatPopup._fanSpeedSection = fanSpeedSection;
    tstatPopup._fanSpeeds = fanSpeeds;
    tstatPopup._fanSpeedBtns = fanSpeedBtns;
    publishMld({ tstatPopup });
    return tstatPopup;
  }

  function activeTstat() {
    if (!tstatSession?.ids?.length) return null;
    if (tstatSession.central) return tstatSession.centralTstat;
    return thermostats.find((x) => x.i === tstatSession.ids[0]) || null;
  }

  function tstatSetpointTarget(t) {
    if (!t || !tstatSession) return null;
    const tm = String(t.tm || "").toLowerCase();
    if (tstatSession?.central && !tm) return null;
    if (tm === "off") return null;
    return (tstatSession.edit === "cool" && tm === "auto") || tm === "cool" ? "cool" : "heat";
  }

  async function commitTstatSetpoint(ids, target, val, { haptic = true } = {}) {
    const patch = target === "heat" ? { hsp: val } : { csp: val };
    const cmd = target === "heat" ? "setHeat" : "setCool";
    for (const id of ids) setSetpointOptimistic(id, patch);
    if (haptic) hapticTap();
    renderTstatDial();
    updateClimateWidgets();
    refreshOpenTstatQuickPopups();
    const results = await Promise.all(ids.map((id) => sendCmd(id, cmd, val)));
    if (results.some((r) => !r?.ok)) {
      for (const id of ids) clearSetpointOptimistic(id);
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
    if (!tstatSession?.ids?.length) return;
    const t = thermostats.find((x) => x.i === tstatSession.ids[0]);
    if (!t) return;
    const target = tstatSetpointTarget(t);
    if (!target) return;
    const unit = tstatSession.unit;
    const field = target === "heat" ? "hsp" : "csp";
    const cur = Number(t[field]);
    const base = Number.isFinite(cur) ? cur : (target === "heat" ? 70 : 74);
    const val = clampSetpoint(base + delta, unit);
    if (tstatSession.central) t[field] = val;
    commitTstatSetpoint(tstatSession.ids, target, val);
  }

  function renderTstatDial() {
    const popup = ensureTstatPopup();
    const t = activeTstat();
    if (!t) return;
    const unit = tstatSession.unit;
    const cx = TSTAT_DIAL_SIZE / 2, cy = TSTAT_DIAL_SIZE / 2;
    const tm = String(t.tm || "").toLowerCase();
    const deg = tstatTempSuffix(unit);
    const tempVal = t.temp != null ? Math.round(Number(t.temp)) : null;

    popup._tempEl.textContent = tempVal != null ? (tempVal + deg) : "—";
    popup._title.textContent = t.n || "Thermostat";

    const showHeat = (tm === "heat" || tm === "auto" || tm === "emergency heat");
    const showCool = (tm === "cool" || tm === "auto");
    const editHeat = tstatSession.edit === "heat" || tm === "heat" || tm === "emergency heat";

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

    // disabled look when off
    popup._svg.classList.toggle("disabled", tm === "off");
    const noMode = !!(tstatSession?.central && !tm);
    const canAdjust = tm !== "off" && !noMode;
    if (popup._minusBtn) popup._minusBtn.disabled = !canAdjust;
    if (popup._plusBtn) popup._plusBtn.disabled = !canAdjust;
  }

  function renderTstatControls() {
    const popup = ensureTstatPopup();
    const t = activeTstat();
    if (!t) return;
    const supM = supportedModes(t);
    const tm = String(t.tm || "").toLowerCase();
    let modeCount = 0;
    for (const [key, btn] of Object.entries(popup._modeBtns)) {
      const show = supM.includes(key);
      btn.hidden = !show;
      if (show) modeCount++;
      btn.classList.toggle("active", tm === key);
    }
    popup._modeSection.style.display = modeCount ? "" : "none";

    if (t.hasFm) {
      const supported = supportedFanModes(t);
      const fmVal = String(t.fm || "").toLowerCase();
      let fanCount = 0;
      for (const [key, btn] of Object.entries(popup._fanModeBtns)) {
        const show = supported.includes(key);
        btn.hidden = !show;
        if (show) fanCount++;
        btn.classList.toggle("active", fmVal === key);
      }
      popup._fanModeSection.style.display = fanCount ? "" : "none";
    } else {
      popup._fanModeSection.style.display = "none";
    }

    if (showFanSpeedControls(t)) {
      const levels = supportedFanSpeeds(t);
      const fsVal = String(t.fs || "").toLowerCase();
      let speedCount = 0;
      for (const [key, btn] of Object.entries(popup._fanSpeedBtns)) {
        const show = levels.includes(key);
        btn.hidden = !show;
        if (show) speedCount++;
        btn.classList.toggle("active", fsVal === key);
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
      if (!t || !tstatSession) return;
      const unit = tstatSession.unit;
      const tm = String(t.tm || "").toLowerCase();
      if (tm === "off") return;
      const val = angleToVal(angleFromEvent(e), unit);
      const editing = (tstatSession.edit === "cool" && tm === "auto") || tm === "cool" ? "cool" : "heat";
      const patch = editing === "heat" ? { hsp: clampSetpoint(val, unit) } : { csp: clampSetpoint(val, unit) };
      if (editing === "heat") t.hsp = patch.hsp;
      else t.csp = patch.csp;
      for (const id of tstatSession.ids) setSetpointOptimistic(id, patch);
      renderTstatDial();
      const now = Date.now();
      if (now - lastCommit > 300) {
        lastCommit = now;
        const cmd = editing === "heat" ? "setHeat" : "setCool";
        const sendVal = editing === "heat" ? patch.hsp : patch.csp;
        for (const id of tstatSession.ids) sendCmd(id, cmd, sendVal);
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
      if (t && tstatSession) {
        const tm = String(t.tm || "").toLowerCase();
        if (tm !== "off") {
          const editing = (tstatSession.edit === "cool" && tm === "auto") || tm === "cool" ? "cool" : "heat";
          const val = editing === "heat" ? t.hsp : t.csp;
          commitTstatSetpoint(tstatSession.ids, editing, val, { haptic: false });
        }
      }
    }
    function move(e) { if (dragging) apply(e); }
    function start(e) {
      const t = activeTstat();
      if (!t || !tstatSession) return;
      if (String(t.tm || "").toLowerCase() === "off") return;
      if (tstatSession?.central && !String(t.tm || "")) return;
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
    const devLock = tstatDeviceModeLock.get(Number(id));
    if (devLock?.until > Date.now()) return true;
    return !!(tstatSession?.modeLockUntil > Date.now() && tstatSession.ids?.includes(Number(id)));
  }

  function reapplyTstatDeviceModeLocks() {
    const now = Date.now();
    for (const [id, lock] of tstatDeviceModeLock) {
      if (lock.until <= now) {
        tstatDeviceModeLock.delete(id);
        continue;
      }
      const t = thermostats.find(x => x.i === id);
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
      const t = thermostats.find(x => x.i === id);
      if (!t) continue;
      t.tm = key;
      if (key === "heat") t.os = "heating";
      else if (key === "cool") t.os = "cooling";
      else if (key === "off") t.os = "idle";
      else if (key === "auto") t.os = "idle";
      tstatDeviceModeLock.set(id, { until: Date.now() + 4000, mode: key });
    }
    refreshOpenTstatQuickPopups();
  }

  function sendTstatModeCmd(id, cmd, key) {
    if (cmd === "setMode") return sendCmd(id, cmd, key);
    return sendCmd(id, cmd);
  }

  function adjustFavoriteTstat(id, delta) {
    const t = thermostats.find(x => x.i === id);
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
    postCall("refreshFavoritesPopup");
    postCall("refreshThermostatsPopup");
  }

  function closeFavoriteTstatModeMenu() {
    if (favTstatModeMenuCleanup) {
      favTstatModeMenuCleanup();
      favTstatModeMenuCleanup = null;
    }
    if (favTstatModeMenu) {
      favTstatModeMenu.remove();
      favTstatModeMenu = null;
    }
    favTstatModeMenuId = null;
    favTstatModeMenuAnchor = null;
  }

  function repositionFavoriteTstatModeMenu() {
    const menu = favTstatModeMenu;
    if (!menu) return;
    let anchorBtn = favTstatModeMenuAnchor;
    if (!anchorBtn?.isConnected && favTstatModeMenuId != null) {
      anchorBtn = favTstatMap.get(favTstatModeMenuId)?.modeBtn
        || tstatsPopupMap.get(favTstatModeMenuId)?.modeBtn || null;
      favTstatModeMenuAnchor = anchorBtn;
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
    if (!favTstatModeMenu) return;
    const current = String(t?.tm || "").toLowerCase();
    for (const b of favTstatModeMenu.querySelectorAll(".quick-fav-mode-opt")) {
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
    if (tstatSession?.ids?.includes(id)) {
      tstatSession.modeLockUntil = Date.now() + 4000;
      tstatSession.lockedMode = key;
      renderTstatDial();
      renderTstatControls();
    }
    updateClimateWidgets();
    sendTstatModeCmd(id, cmd, key);
    reconcileTstat(id);
  }

  function openFavoriteTstatModeMenu(anchorBtn, tstatId) {
    closeFavoriteTstatModeMenu();
    const t = thermostats.find(x => x.i === tstatId);
    if (!t) return;
    const modes = supportedModes(t);
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
    favTstatModeMenu = menu;
    favTstatModeMenuId = tstatId;
    favTstatModeMenuAnchor = anchorBtn;

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

    favTstatModeMenuCleanup = () => {
      document.removeEventListener("click", onOutside);
      document.removeEventListener("keydown", onKey);
      anchorBtn.setAttribute("aria-expanded", "false");
      favTstatModeMenuAnchor = null;
    };
  }

  function setTstatMode(cmd, key) {
    if (!tstatSession) return;
    const ids = tstatSession.ids;
    applyTstatModeOptimistic(ids, key);
    if (tstatSession.central) {
      const ct = tstatSession.centralTstat;
      ct.tm = key;
      if (ct.hsp == null) {
        const ref = thermostats.find(x => x.hsp != null);
        ct.hsp = ref ? Number(ref.hsp) : 70;
      }
      if (ct.csp == null) {
        const ref = thermostats.find(x => x.csp != null);
        ct.csp = ref ? Number(ref.csp) : 74;
      }
      tstatSession.edit = key === "cool" ? "cool" : "heat";
    }
    tstatSession.modeLockUntil = Date.now() + 4000;
    tstatSession.lockedMode = key;
    renderTstatDial(); renderTstatControls(); updateClimateWidgets();
    for (const id of ids) sendTstatModeCmd(id, cmd, key);
    for (const id of ids) reconcileTstat(id);
  }

  function setFanMode(fm) {
    if (!tstatSession) return;
    const ids = tstatSession.ids;
    for (const id of ids) {
      for (const t of thermostats) {
        if (t.i !== id || !t.hasFm) continue;
        t.fm = fm;
        if (fm !== "on") continue;
        if (!t.fs && deviceHasFanSpeed(t)) {
          const levels = supportedFanSpeeds(t);
          t.fs = levels.includes("medium") ? "medium" : levels[0] || "medium";
        }
      }
    }
    renderTstatControls(); updateClimateWidgets();
    for (const id of ids) sendCmd(id, "setFanMode", fm);
    if (tstatSession.central) tstatSession.centralTstat.fm = fm;
    if (fm === "on") {
      for (const id of ids) {
        const t = thermostats.find((x) => x.i === id);
        if (t?.fs) sendCmd(id, "setFanSpeed", t.fs);
      }
    }
  }

  function setFanSpeed(lv) {
    if (!tstatSession) return;
    const ids = tstatSession.ids;
    for (const id of ids) for (const t of thermostats) if (t.i === id && deviceHasFanSpeed(t)) t.fs = lv;
    renderTstatControls();
    if (tstatSession.central) tstatSession.centralTstat.fs = lv;
    for (const id of ids) sendCmd(id, "setFanSpeed", lv);
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
    closeTstatPopup();
    if (colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    if (!thermostats.length) return;
    const ids = thermostats.map(t => t.i);
    const first = thermostats[0];
    const union = (arr) => [...new Set(arr.flat())];
    const centralTstat = {
      i: -1, n: "All Thermostats", r: null,
      tm: "", os: "", hsp: null, csp: null, temp: null, u: first?.u,
      hasFm: thermostats.some(t => t.hasFm), fm: "",
      hasFs: thermostats.some(deviceHasFanSpeed), fs: "",
      fsLev: union(thermostats.map(supportedFanSpeeds)).join(","),
      supM: union(thermostats.map(supportedModes)).join(","),
      supFM: union(thermostats.map(supportedFanModes)).join(","),
      _central: true
    };
    tstatSession = { rid: null, anchorEl: CENTRAL_TSTAT_BTN, ids, unit: normalizeTstatUnit(first?.u), edit: "heat", central: true, centralTstat };
    const popup = ensureTstatPopup();
    renderTstatDial();
    renderTstatControls();
    updateTstatFavButton();
    positionTstatPopup(CENTRAL_TSTAT_BTN);
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    publishMld({ tstatSession, tstatPopup: popup });
  }

  function openTstatPopup(rid, anchorEl) {
    closeTstatPopup();
    if (colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    const roomKey = normalizeRoomId(rid);
    const list = thermoByRoom.get(roomKey) || [];
    if (!list.length) return;
    const t = list[0];
    tstatSession = { rid: roomKey, anchorEl, ids: list.map(x => x.i), unit: normalizeTstatUnit(t.u), edit: "heat" };
    const popup = ensureTstatPopup();
    renderTstatDial();
    renderTstatControls();
    updateTstatFavButton();
    positionTstatPopup(anchorEl);
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    publishMld({ tstatSession, tstatPopup: popup });
  }

  function closeTstatPopup() {
    if (tstatPopup) {
      tstatPopup.setAttribute("hidden", "");
      tstatPopup.classList.remove("open");
    }
    tstatSession = null;
    publishMld({ tstatSession: null, tstatPopup });
  }

  function ensureMusicMasterPopup() {
    if (musicMasterPopup) return musicMasterPopup;
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
    closeBtn.addEventListener("click", (e) => { e.stopPropagation(); closeMusicMasterPopup(); });
    head.appendChild(title);
    head.appendChild(closeBtn);

    const body = ce("div", "music-master-body");
    panel.appendChild(head);
    panel.appendChild(body);
    popup.appendChild(panel);
    document.body.appendChild(popup);

    popup.addEventListener("click", (e) => { if (e.target === popup) closeMusicMasterPopup(); });
    panel.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && popup.classList.contains("open")) closeMusicMasterPopup();
    });

    popup._body = body;
    musicMasterPopup = popup;
    return popup;
  }

  function renderMusicMasterBody() {
    const popup = ensureMusicMasterPopup();
    const body = popup._body;
    body.innerHTML = "";
    const any = (cap) => music.some((d) => musicControls(d)[cap]);
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
    playBtn.addEventListener("click", () => postCall("broadcastMusic", "play"));
    const pauseBtn = ce("button", "music-btn music-btn-primary");
    pauseBtn.type = "button";
    pauseBtn.setAttribute("aria-label", "Pause all");
    pauseBtn.innerHTML = MUSIC_PAUSE_SVG;
    pauseBtn.disabled = !canPause;
    pauseBtn.addEventListener("click", () => postCall("broadcastMusic", "pause"));
    const stopBtn = ce("button", "music-btn");
    stopBtn.type = "button";
    stopBtn.setAttribute("aria-label", "Stop all");
    stopBtn.innerHTML = MUSIC_STOP_SVG;
    stopBtn.disabled = !canStop;
    stopBtn.addEventListener("click", () => postCall("broadcastMusic", "stop"));
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
    volDown.addEventListener("click", () => postCall("broadcastMusicVolume", -MUSIC_VOL_STEP));
    const volUp = ce("button", "music-btn music-master-vol-btn");
    volUp.type = "button";
    volUp.setAttribute("aria-label", "Volume up for all");
    volUp.textContent = "+";
    volUp.disabled = !canVolume;
    volUp.addEventListener("click", () => postCall("broadcastMusicVolume", MUSIC_VOL_STEP));
    volRow.appendChild(volLabel);
    volRow.appendChild(volDown);
    volRow.appendChild(volUp);
    body.appendChild(volRow);
  }

  function openMusicMasterPopup() {
    closeTstatPopup();
    if (colorSession) closeColorPopup(false);
    postCall("closeQuickPopup");
    if (!music.length) return;
    renderMusicMasterBody();
    const popup = ensureMusicMasterPopup();
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    publishMld({ musicMasterPopup: popup });
  }

  function closeMusicMasterPopup() {
    if (!musicMasterPopup) return;
    musicMasterPopup.setAttribute("hidden", "");
    musicMasterPopup.classList.remove("open");
    publishMld({ musicMasterPopup: null });
  }

  function reconcileTstat(id) {
    setTimeout(() => postCall("refreshDevice", id), 600);
    setTimeout(() => postCall("refreshDevice", id), 1800);
  }

  function updateClimateWidgets() {
    for (const [rid, rec] of climateEls) {
      const info = roomClimateInfo(rid);
      if (!info) continue;
      rec.tempEl.textContent = formatRoomTemp(info.device);
      if (rec.iconEl) {
        rec.iconEl.classList.remove("state-off", "state-heat", "state-cool", "state-fan");
        if (info.controllable) {
          const cls = roomTstatState(rid);
          rec.iconEl.classList.add(cls);
          rec.el.setAttribute("aria-label", "Thermostat — " + cls.replace("state-", "") + ", " + formatRoomTemp(info.device));
        }
      }
    }
    if (tstatSession) {
      renderTstatDial();
      renderTstatControls();
    }
  }

  function setStatus(msg, isErr) {
    if (!msg) { STATUS_EL.hidden = true; STATUS_EL.textContent = ""; return; }
    STATUS_EL.hidden = false;
    STATUS_EL.textContent = msg;
    STATUS_EL.classList.toggle("error", !!isErr);
  }
  function flash(msg, isErr) { setStatus(msg, isErr); clearTimeout(flash._t); flash._t = setTimeout(() => setStatus(""), 2200); }

  function hapticTap(pattern) {
    if (!cfg.enableHaptics) return;
    if (!window.isSecureContext) return;
    const vibrate = navigator.vibrate;
    if (typeof vibrate !== "function") return;
    try {
      vibrate.call(navigator, pattern || 15);
    } catch {}
  }

  function effectiveTheme(theme) {
    const pref = THEME_OPTIONS.includes(theme) ? theme : "auto";
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
    if (!MENU_THEME_SEGMENT) return;
    for (const btn of MENU_THEME_SEGMENT.querySelectorAll(".topbar-overflow-seg")) {
      const selected = btn.dataset.theme === theme;
      btn.setAttribute("aria-checked", selected ? "true" : "false");
    }
  }

  function applyTheme(theme) {
    cfg.theme = THEME_OPTIONS.includes(theme) ? theme : "auto";
    const effective = effectiveTheme(cfg.theme);
    document.documentElement.setAttribute("data-theme", effective);
    document.documentElement.style.colorScheme = effective;
    const meta = qs('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", effective === "light" ? "#eef1f7" : "#0b0d12");
    updateThemeSegmentUI(cfg.theme);
  }

  function applyDashboardName(name) {
    const title = String(name || "").trim() || "mDash";
    cfg.dashboardName = title;
    if (DASHBOARD_TITLE_EL) DASHBOARD_TITLE_EL.textContent = title;
    document.title = title;
  }

  // ---------- API (OAuth: access_token required on every request, especially cloud) ----------
  const ACCESS_TOKEN = (() => {
    try { return new URLSearchParams(location.search).get("access_token") || ""; }
    catch { return ""; }
  })();

  function withToken(path) {
    if (!ACCESS_TOKEN) return path;
    const sep = path.indexOf("?") >= 0 ? "&" : "?";
    return path + sep + "access_token=" + encodeURIComponent(ACCESS_TOKEN);
  }

  async function getJson(url) {
    const r = await fetch(withToken(url), { cache: "no-store", headers: { "Accept": "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  async function fetchData() {
    const d = await getJson("data");
    if (d && d.config) {
      if (d.config.pollIntervalMs) cfg.pollIntervalMs = d.config.pollIntervalMs;
      if (typeof d.config.useWebSocket === "boolean") cfg.useWebSocket = d.config.useWebSocket;
      if (d.config.dashboardName != null) applyDashboardName(d.config.dashboardName);
      if (!reorderMode && Array.isArray(d.config.roomOrder)) {
        cfg.roomOrder = d.config.roomOrder.length ? d.config.roomOrder : null;
      }
    }
    return d;
  }

  async function sendCmd(id, cmd, val, pin) {
    let url = "cmd?id=" + id + "&c=" + encodeURIComponent(cmd);
    if (val != null) url += "&v=" + encodeURIComponent(val);
    if (pin != null && pin !== "") url += "&pin=" + encodeURIComponent(pin);
    try {
      const r = await fetch(withToken(url), { cache: "no-store" });
      if (!r.ok) {
        let msg = "Command failed";
        try {
          const body = await r.json();
          if (body?.error) msg = String(body.error);
        } catch {}
        if (r.status !== 403 && msg !== "wrong pin") flash(msg, true);
        return { ok: false, status: r.status, error: msg };
      }
      return { ok: true };
    } catch (e) { flash("Command failed", true); return { ok: false }; }
  }

  async function sendCmdBatch(commands) {
    if (!commands.length) return { ok: true, failed: 0 };
    if (commands.length === 1) {
      const c = commands[0];
      const result = await sendCmd(c.id, c.cmd, c.val);
      return { ok: result.ok, failed: result.ok ? 0 : 1, total: 1 };
    }
    try {
      const body = {
        commands: commands.map((c) => ({
          id: c.id,
          c: c.cmd,
          v: c.val == null ? null : c.val,
        })),
      };
      const r = await fetch(withToken("cmd/batch"), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body),
      });
      let data = null;
      try { data = await r.json(); } catch {}
      if (!r.ok || !data) {
        flash("Command failed", true);
        return { ok: false, failed: commands.length, total: commands.length };
      }
      if (data.failed > 0) {
        flash(data.failed + " of " + data.total + " command(s) failed", true);
      }
      return data;
    } catch (e) {
      flash("Command failed", true);
      return { ok: false, failed: commands.length, total: commands.length };
    }
  }

  function publishMld(patch) {
    const m = globalThis.__MLD;
    if (m) Object.assign(m, patch);
  }

  function rebuildDevicesByRoom() {
    devicesByRoom.clear();
    for (const dev of devices) {
      const rid = normalizeRoomId(dev.r);
      if (!devicesByRoom.has(rid)) devicesByRoom.set(rid, []);
      devicesByRoom.get(rid).push(dev);
    }
  }

  function applyTstatSessionModeLock() {
    if (tstatSession?.modeLockUntil > Date.now() && tstatSession.lockedMode) {
      for (const t of thermostats) {
        if (!tstatSession.ids.includes(t.i)) continue;
        t.tm = tstatSession.lockedMode;
      }
    }
  }

  // Sensors (other-sensor pickers): [{i,n,r,t,v,a,ex:[{k,v,u?}]}]
  let sensors = [];
  const sensorCardMap = new Map(); // id -> { el, heroEl, pillEl, pillTxt, dot, footEl, favBtn, t, i }
  const favSensorMap = new Map(); // id -> sensor card rec (favorites popup)
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
    thermoByRoom.clear();
    for (const t of thermostats) {
      const rid = normalizeRoomId(t.r);
      if (!thermoByRoom.has(rid)) thermoByRoom.set(rid, []);
      thermoByRoom.get(rid).push(t);
    }
  }

  function repopulateSensorByRoom() {
    sensorByRoom.clear();
    for (const s of tempSensors) {
      const rid = normalizeRoomId(s.r);
      if (!sensorByRoom.has(rid)) sensorByRoom.set(rid, []);
      sensorByRoom.get(rid).push(s);
    }
  }

  function syncRoomMap() {
    roomMap.clear();
    for (const r of rooms) roomMap.set(r.id, r.name);
  }

  // ---------- render ----------
  function emptyState(html) {
    ROOMS_EL.innerHTML = html;
    roomEls.clear(); devMap.clear();
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
    if (rooms.length) return;
    const byId = new Map();
    const addRef = (item) => {
      const id = normalizeRoomId(item?.r);
      if (id === -1) return;
      if (!byId.has(id)) byId.set(id, { id, name: "Room " + id });
    };
    for (const dev of devices) addRef(dev);
    for (const t of thermostats) addRef(t);
    for (const s of tempSensors) addRef(s);
    for (const lk of locks) addRef(lk);
    if (!byId.size) return;
    replaceList(rooms, [...byId.values()].sort((a, b) => a.id - b.id));
    syncRoomMap();
  }

  function contentRoomIds() {
    const ids = new Set();
    for (const rid of devicesByRoom.keys()) ids.add(rid);
    for (const rid of thermoByRoom.keys()) ids.add(rid);
    for (const rid of sensorByRoom.keys()) ids.add(rid);
    return ids;
  }

  function getDisplayRoomIds(groups, hasContent) {
    const knownIds = new Set(rooms.map(r => r.id));
    const allIds = new Set(knownIds);
    for (const id of contentRoomIds()) allIds.add(id);
    const hasUnassigned = groups.has(-1) || roomHasClimate(-1);
    let order;
    if (cfg.roomOrder?.length) {
      order = cfg.roomOrder.map(normalizeRoomId).filter(id => {
        if (id === -1) return hasUnassigned;
        return allIds.has(id);
      });
      const inOrder = new Set(order.filter(id => id !== -1));
      const newcomers = [...allIds].filter(id => !inOrder.has(id));
      if (newcomers.length) {
        newcomers.sort((a, b) => {
          const an = roomMap.get(a) || "";
          const bn = roomMap.get(b) || "";
          return String(an).localeCompare(String(bn), undefined, { sensitivity: "base" }) || (a - b);
        });
        const uIdx = order.indexOf(-1);
        if (uIdx >= 0) order = order.slice(0, uIdx).concat(newcomers, order.slice(uIdx));
        else order = order.concat(newcomers);
      }
      if (hasUnassigned && !order.includes(-1)) order.push(-1);
    } else {
      order = rooms.map(r => r.id);
      for (const id of allIds) {
        if (id !== -1 && !order.includes(id)) order.push(id);
      }
      if (hasUnassigned && !order.includes(-1)) order.push(-1);
    }
    return order.filter(rid => hasContent(rid));
  }

  async function saveRoomOrder(order) {
    if (!order?.length) {
      flash("No rooms to save", true);
      return false;
    }
    const headers = { "Accept": "application/json" };
    const paths = ["room-order", "settings/room-order"];
    let lastMsg = "Could not save room order";
    for (const path of paths) {
      try {
        let r = await fetch(withToken(path), {
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
        r = await fetch(withToken(path + "?order=" + encodeURIComponent(order.join(","))), {
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
    flash(lastMsg === "Could not save room order"
      ? "Could not save room order — update the hub app code and try again"
      : lastMsg, true);
    return false;
  }

  async function postJson(path, body) {
    try {
      const r = await fetch(withToken(path), {
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
        flash(msg, true);
        return { ok: false };
      }
      let data = {};
      try { data = await r.json(); } catch {}
      return { ok: true, data };
    } catch {
      flash("Request failed", true);
      return { ok: false };
    }
  }

  async function postJsonSilent(path, body) {
    try {
      const r = await fetch(withToken(path), {
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

  // __MLD_SPLIT__

  async function setHsmApi(mode, pin, padApi) {
    let result = await postJsonSilent("hsm", { mode, pin });
    if (!result.ok) {
      if (result.status === 403 || result.error === "wrong pin") {
        padApi?.shake();
        return false;
      }
      if (result.error) flash(String(result.error), true);
      else flash("Could not change security status", true);
      padApi?.close();
      return false;
    }
    padApi?.close();
    const modeDef = [...HSM_INTRUSION_MODES, ...HSM_MONITORING_MODES].find((m) => m.cmd === mode);
    if (modeDef?.status) {
      hsmStatus = modeDef.status;
      hsmLockUntil = Date.now() + 4000;
    }
    if (mode === "cancelAlerts") {
      hsmAlert = "";
      hsmAlertDesc = "";
      hsmLockUntil = Date.now() + 4000;
    }
    if (result.data?.status) hsmStatus = result.data.status;
    if (result.data?.alert !== undefined) hsmAlert = result.data.alert || "";
    if (result.data?.alertDesc !== undefined) hsmAlertDesc = result.data.alertDesc || "";
    if (currentCategory() === "security") renderSecurityPopup();
    setTimeout(() => { fetchData().catch(() => {}); }, 3000);
    return true;
  }

  async function setHubModeApi(mode) {
    let result = await postJson("hub-mode", { mode });
    if (result.ok) return true;
    try {
      const r = await fetch(withToken("hub-mode?mode=" + encodeURIComponent(mode)), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not set hub mode";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      flash(msg, true);
    } catch {
      flash("Could not set hub mode", true);
    }
    return false;
  }

  async function activateSceneApi(id) {
    let result = await postJson("scene/activate", { id });
    if (result.ok) return true;
    try {
      const r = await fetch(withToken("scene/activate?id=" + encodeURIComponent(id)), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not activate scene";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      flash(msg, true);
    } catch {
      flash("Could not activate scene", true);
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
      const r = await fetch(withToken(url), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not control lights";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      flash(msg, true);
    } catch {
      flash("Could not control lights", true);
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
      const r = await fetch(withToken(url), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not save state";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      flash(msg, true);
    } catch {
      flash("Could not save state", true);
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
      const r = await fetch(withToken(url), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not restore state";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      flash(msg, true);
    } catch {
      flash("Could not restore state", true);
    }
    return false;
  }

  async function saveFavorites(ids) {
    const paths = ["favorites"];
    let lastMsg = "Could not save favorites";
    for (const path of paths) {
      try {
        let r = await fetch(withToken(path), {
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
        r = await fetch(withToken(path + "?ids=" + encodeURIComponent(ids.join(","))), {
          method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
        });
        if (r.ok) return true;
        try {
          const body = await r.json();
          if (body?.error) lastMsg = String(body.error);
        } catch {}
      } catch {}
    }
    flash(lastMsg, true);
    return false;
  }

  function hubModeLocked() {
    return hubModeLockUntil > Date.now();
  }

  function hsmLocked() {
    return hsmLockUntil > Date.now();
  }

  function roomLabel(rid) {
    if (rid == null || rid === -1) return "Unassigned";
    return roomMap.get(rid) || "Room";
  }

  function snapshotRoomKey(roomKey) {
    return "room:" + roomKey;
  }

  function setRoomGestureLock(on) {
    if (on) {
      roomGestureLockCount++;
      APP_EL?.classList.add("room-gesture-lock");
    } else {
      roomGestureLockCount = Math.max(0, roomGestureLockCount - 1);
      if (roomGestureLockCount === 0) APP_EL?.classList.remove("room-gesture-lock");
    }
  }

  const SLIDE_HOLD_MS = 400;
  const SLIDE_REVEAL_PX = 80;
  const SLIDE_COMMIT_RATIO = 0.65;
  const SLIDE_TAP_MOVE = 10;

  function attachRoomSlideAction(track, primaryBtn, actionBtn, opts) {
    const { direction, onTap, onCommit, canCommit } = opts;
    let pointerId = null;
    let downX = 0;
    let downY = 0;
    let downT = 0;
    let holdTimer = null;
    let holdActive = false;
    let holdBlocked = false;
    let sliding = false;
    let slidePx = 0;
    let gestureHandled = false;

    track.addEventListener("contextmenu", (e) => e.preventDefault());
    track.addEventListener("selectstart", (e) => e.preventDefault());

    function reset() {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      holdActive = false;
      holdBlocked = false;
      sliding = false;
      slidePx = 0;
      primaryBtn.style.transform = "";
      track.classList.remove("room-slide-active");
      setRoomGestureLock(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      pointerId = null;
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
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
          reset();
          return;
        }
        sliding = true;
      }
      e.preventDefault();
      if (direction === "left") {
        slidePx = Math.max(0, Math.min(SLIDE_REVEAL_PX, -dx));
      } else {
        slidePx = Math.max(0, Math.min(SLIDE_REVEAL_PX, dx));
      }
      const tx = direction === "left" ? -slidePx : slidePx;
      primaryBtn.style.transform = "translateX(" + tx + "px)";
    }

    function onUp(e) {
      if (e.pointerId !== pointerId) return;
      gestureHandled = true;
      setTimeout(() => { gestureHandled = false; }, 0);
      const elapsed = Date.now() - downT;
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);
      try { primaryBtn.releasePointerCapture(pointerId); } catch {}

      if (holdBlocked) {
        reset();
        return;
      }

      if (!holdActive && elapsed <= SLIDE_HOLD_MS + 80 && dx <= SLIDE_TAP_MOVE && dy <= SLIDE_TAP_MOVE) {
        reset();
        onTap();
        return;
      }

      const commitThreshold = SLIDE_REVEAL_PX * SLIDE_COMMIT_RATIO;
      if (holdActive && slidePx >= commitThreshold && (!canCommit || canCommit())) {
        reset();
        onCommit();
        return;
      }

      if (holdActive && slidePx > 0 && canCommit && !canCommit()) {
        flash("No saved state", true);
      }
      reset();
    }

    primaryBtn.addEventListener("pointerdown", (e) => {
      if (reorderMode) return;
      if (e.button != null && e.button !== 0) return;
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
      try { primaryBtn.setPointerCapture(pointerId); } catch {}
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (canCommit && !canCommit()) {
          holdBlocked = true;
          flash("No saved state", true);
          return;
        }
        holdActive = true;
        track.classList.add("room-slide-active");
        setRoomGestureLock(true);
        hapticTap();
      }, SLIDE_HOLD_MS);
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });

    primaryBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (gestureHandled) {
        e.preventDefault();
      }
    });

    if (actionBtn) {
      actionBtn.addEventListener("pointerdown", (e) => e.preventDefault());
    }
  }

  function updateRoomSnapshotUi() {
    for (const [rid, rec] of roomEls) {
      const has = !!snapshots[snapshotRoomKey(rid)];
      rec.card.classList.toggle("room-has-snapshot", has);
      rec.card.classList.toggle("room-no-snapshot", !has);
      if (rec.restoreBtn) {
        rec.restoreBtn.disabled = !has;
        rec.restoreBtn.setAttribute("aria-disabled", has ? "false" : "true");
      }
    }
  }

  function getFavoriteEntries() {
    const out = [];
    for (const id of favorites) {
      const dev = devices.find(d => d.i === id);
      if (dev) { out.push({ type: "light", dev }); continue; }
      const t = thermostats.find(x => x.i === id);
      if (t) { out.push({ type: "thermostat", dev: t }); continue; }
      const ts = tempSensors.find(x => x.i === id);
      if (ts) { out.push({ type: "sensor", dev: normalizeTempSensorForCard(ts) }); continue; }
      const sen = sensors.find(x => x.i === id);
      if (sen) out.push({ type: "sensor", dev: sen });
    }
    return out;
  }

  function updateAllFavButtons() {
    for (const [, rec] of devMap) syncFavButton(rec.el.querySelector(".tile-fav"), rec.data.i);
    for (const [, rec] of favDevMap) syncFavButton(rec.el.querySelector(".tile-fav"), rec.data.i);
    for (const [, rec] of sensorCardMap) syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of favSensorMap) syncFavButton(rec.favBtn, rec.i);
    updateTstatFavButton();
  }

  function attachFavButton(btn, id) {
    btn.innerHTML = FAVORITES_SVG;
    syncFavButton(btn, id);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      toggleFavorite(id);
    });
  }

  async function toggleFavorite(id) {
    const numId = Number(id);
    const idx = favorites.indexOf(numId);
    const wasFav = idx >= 0;
    if (wasFav) favorites.splice(idx, 1);
    else favorites.push(numId);
    updateAllFavButtons();
    updateQuickNavVisibility();
    if (currentCategory() === "favorites") renderFavoritesPopup();
    const ok = await saveFavorites(favorites);
    if (!ok) {
      if (wasFav) favorites.push(numId);
      else favorites.splice(favorites.indexOf(numId), 1);
      updateAllFavButtons();
      updateQuickNavVisibility();
      if (currentCategory() === "favorites") renderFavoritesPopup();
    }
  }

  function currentRoomOrderFromDom() {
    return Array.from(ROOMS_EL.querySelectorAll(".room:not(.hidden)"))
      .map(el => Number(el.dataset.roomId));
  }

  function updateDraftOrderFromDom() {
    reorderDraftOrder = currentRoomOrderFromDom();
  }

  function updateMoveButtons() {
    if (!reorderMode) return;
    const cards = Array.from(ROOMS_EL.querySelectorAll(".room:not(.hidden)"));
    cards.forEach((card, i) => {
      const rec = roomEls.get(Number(card.dataset.roomId));
      if (!rec?.moveUp || !rec?.moveDown) return;
      rec.moveUp.disabled = i === 0;
      rec.moveDown.disabled = i === cards.length - 1;
    });
  }

  function moveRoom(rid, delta) {
    const cards = Array.from(ROOMS_EL.querySelectorAll(".room:not(.hidden)"));
    const idx = cards.findIndex(c => Number(c.dataset.roomId) === rid);
    if (idx < 0) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= cards.length) return;
    const card = cards[idx];
    const sibling = cards[newIdx];
    if (delta < 0) ROOMS_EL.insertBefore(card, sibling);
    else ROOMS_EL.insertBefore(sibling, card);
    updateDraftOrderFromDom();
    updateMoveButtons();
    hapticTap();
  }

  function enterReorderMode() {
    reorderSnapshot = cfg.roomOrder?.length ? cfg.roomOrder.slice() : null;
    reorderDraftOrder = currentRoomOrderFromDom();
    for (const [, rec] of roomEls) rec.card.classList.remove("collapsed");
    updateExpandAllBtn();
    stopPolling();
    reorderMode = true;
    APP_EL?.classList.toggle("reorder-mode", true);
    closeTopbarOverflowMenu();
    if (REORDER_DONE_BTN) REORDER_DONE_BTN.hidden = false;
    if (REORDER_CANCEL_BTN) REORDER_CANCEL_BTN.hidden = false;
    SEARCH_EL.disabled = true;
    SEARCH_EL.blur();
    updateMoveButtons();
  }

  function exitReorderMode(resumePoll) {
    reorderMode = false;
    reorderBusy = false;
    reorderDraftOrder = null;
    reorderSnapshot = null;
    APP_EL?.classList.toggle("reorder-mode", false);
    if (REORDER_DONE_BTN) REORDER_DONE_BTN.hidden = true;
    if (REORDER_CANCEL_BTN) REORDER_CANCEL_BTN.hidden = true;
    SEARCH_EL.disabled = false;
    if (resumePoll) {
      startPolling();
      refresh();
    } else {
      applySearch();
    }
  }

  async function finishReorderMode() {
    const order = reorderDraftOrder ?? currentRoomOrderFromDom();
    const saved = await saveRoomOrder(order);
    if (!saved) return;
    cfg.roomOrder = order.length ? order.slice() : null;
    lastDataSig = "";
    exitReorderMode(true);
  }

  function cancelReorderMode() {
    cfg.roomOrder = reorderSnapshot ? reorderSnapshot.slice() : null;
    lastDataSig = "";
    exitReorderMode(false);
    buildDom();
  }

  let topbarOverflowDismiss = null;

  function closeTopbarOverflowMenu() {
    if (!OVERFLOW_MENU || !OVERFLOW_BTN) return;
    OVERFLOW_MENU.hidden = true;
    OVERFLOW_BTN.setAttribute("aria-expanded", "false");
    if (topbarOverflowDismiss) {
      document.removeEventListener("click", topbarOverflowDismiss.onClick);
      document.removeEventListener("keydown", topbarOverflowDismiss.onKey);
      topbarOverflowDismiss = null;
    }
  }

  function openTopbarOverflowMenu() {
    if (!OVERFLOW_MENU || !OVERFLOW_BTN || reorderMode) return;
    OVERFLOW_MENU.hidden = false;
    OVERFLOW_BTN.setAttribute("aria-expanded", "true");
    const onClick = (e) => {
      if (OVERFLOW_MENU.contains(e.target) || OVERFLOW_BTN.contains(e.target)) return;
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
    if (!OVERFLOW_MENU) return;
    if (OVERFLOW_MENU.hidden) openTopbarOverflowMenu();
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
      return Array.from(ROOMS_EL.querySelectorAll(".room:not(.hidden):not(.room-dragging)"));
    }

    function movePlaceholderForY(y) {
      if (!placeholder) return;
      const rooms = visibleRooms();
      let insertBefore = null;
      for (const room of rooms) {
        const rect = room.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
          insertBefore = room;
          break;
        }
      }
      if (insertBefore) ROOMS_EL.insertBefore(placeholder, insertBefore);
      else ROOMS_EL.appendChild(placeholder);
    }

    function positionFloat(clientY) {
      card.style.top = (clientY - floatOffsetY) + "px";
    }

    function beginDrag(e) {
      dragging = true;
      reorderBusy = true;
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
        ROOMS_EL.insertBefore(card, placeholder);
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
        if (Math.hypot(dx, dy) < REORDER_DRAG_THRESHOLD) return;
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
      reorderBusy = false;
      cleanupListeners();
      try { handle.releasePointerCapture(pointerId); } catch {}
    }

    handle.addEventListener("pointerdown", (e) => {
      if (!reorderMode || SEARCH_EL.value.trim()) return;
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
    replaceList(hubModes, d.hubModes);
    if (!hubModeLocked()) currentHubMode = d.currentHubMode || "";
    if (!hsmLocked()) {
      hsmStatus = d.hsmStatus || "";
      hsmAlert = d.hsmAlert || "";
      hsmAlertDesc = d.hsmAlertDesc || "";
    }
    hsmEnabled = !!d.hsmEnabled;
    hsmPinRequired = !!d.hsmPinRequired;
    thermostatsPopupEnabled = d.thermostatsPopupEnabled !== false;
    unlockPinEnabled = !!d.unlockPinEnabled;
    unlockPinRequired = !!d.unlockPinRequired;
    replaceList(scenes, d.scenes);
    replaceList(locks, d.locks);
    replaceList(windowShades, d.windowShades);
    replaceList(music, d.music);
    if (Array.isArray(d.config?.favorites)) replaceList(favorites, d.config.favorites.map(Number));
    reapplyLockOptimistic();
    reapplyShadeOptimistic();
    reapplyMusicOptimistic();
    reapplySetpointOptimistic();

    replaceList(rooms, sortRoomsByOrder(d.rooms || [], cfg.roomOrder));
    syncRoomMap();
    replaceList(devices, d.devices);
    replaceList(thermostats, d.thermostats);
    replaceList(tempSensors, d.tempSensors);
    replaceList(sensors, d.sensors);
    snapshots = d.snapshots && typeof d.snapshots === "object" ? d.snapshots : {};
    rebuildDevicesByRoom();
    reapplySwitchOptimistic();
    reapplyTstatDeviceModeLocks();
    applyTstatSessionModeLock();

    repopulateThermoByRoom();
    repopulateSensorByRoom();
    ensureRoomsFromDevices();
    updateQuickNavVisibility();

    if (!devices.length && !thermostats.length && !tempSensors.length) { noDevicesState(); return; }

    const groups = new Map();
    for (const dev of devices) {
      const rid = normalizeRoomId(dev.r);
      if (!groups.has(rid)) groups.set(rid, []);
      groups.get(rid).push(dev);
    }
    const hasContent = (rid) => (groups.get(normalizeRoomId(rid))?.length || roomHasClimate(rid));
    const displayOrder = getDisplayRoomIds(groups, hasContent);

    const sig = displayOrder.join(",") + "|" + devices.map(x => x.i).join(",")
      + "|" + thermostats.map(x => x.i).join(",") + "|" + tempSensors.map(x => x.i).join(",");
    const fullRerender = sig !== lastDataSig;
    lastDataSig = sig;

    if (fullRerender && !reorderMode) buildDom();
    updateRoomSnapshotUi();
    updateStates();
    updateClimateWidgets();
    applySearch();
    refreshQuickPopupIfOpen();
  }

  function buildDom() {
    ROOMS_EL.innerHTML = "";
    roomEls.clear(); devMap.clear(); climateEls.clear();

    // group devices by room id (null/undefined -> -1 Unassigned)
    const groups = new Map();
    for (const dev of devices) {
      const rid = normalizeRoomId(dev.r);
      if (!groups.has(rid)) groups.set(rid, []);
      groups.get(rid).push(dev);
    }

    // a room is shown if it has lights, thermostats, or temp sensors
    const hasContent = (rid) => (groups.get(normalizeRoomId(rid))?.length || roomHasClimate(rid));

    const orderedIds = getDisplayRoomIds(groups, hasContent);

    for (const rid of orderedIds) {
      const roomKey = normalizeRoomId(rid);
      const devs = groups.get(roomKey) || [];
      const name = roomKey === -1 ? "Unassigned" : (roomMap.get(roomKey) || "Room");

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
      const climate = roomClimateInfo(roomKey);
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
        tempEl.textContent = formatRoomTemp(climate.device);
        el.appendChild(tempEl);
        if (climate.controllable) {
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (colorSession) closeColorPopup(true);
            if (quickPopup?.classList.contains("open")) closeQuickPopup();
            openTstatPopup(roomKey, el);
          });
        }
        head.appendChild(el);
        climateEls.set(roomKey, { el, iconEl, tempEl, controllable: climate.controllable });
      }

      const toggle = ce("div", "room-toggle");

      const offTrack = ce("div", "room-slide-track room-slide-off");
      const saveBtn = ce("button", "room-snap-action room-snap-save");
      saveBtn.type = "button";
      saveBtn.textContent = "Save";
      saveBtn.setAttribute("aria-label", "Save current state");
      saveBtn.tabIndex = -1;
      const offBtn = ce("button", "btn-off");
      offBtn.type = "button";
      offBtn.textContent = "Off";
      offTrack.appendChild(saveBtn);
      offTrack.appendChild(offBtn);

      const onTrack = ce("div", "room-slide-track room-slide-on");
      const onBtn = ce("button", "btn-on");
      onBtn.type = "button";
      onBtn.textContent = "On";
      const restoreBtn = ce("button", "room-snap-action room-snap-restore");
      restoreBtn.type = "button";
      restoreBtn.textContent = "Restore";
      restoreBtn.setAttribute("aria-label", "Restore saved state");
      restoreBtn.tabIndex = -1;
      restoreBtn.disabled = true;
      restoreBtn.setAttribute("aria-disabled", "true");
      onTrack.appendChild(onBtn);
      onTrack.appendChild(restoreBtn);

      toggle.appendChild(offTrack);
      toggle.appendChild(onTrack);
      head.appendChild(toggle);

      attachRoomSlideAction(offTrack, offBtn, saveBtn, {
        direction: "left",
        onTap: () => roomAll(roomKey, "off"),
        onCommit: () => {
          snapshotSaveApi("room", roomKey).then((ok) => {
            if (!ok) return;
            const devs = devicesByRoom.get(roomKey) || [];
            snapshots[snapshotRoomKey(roomKey)] = { ts: Date.now(), count: devs.length };
            updateRoomSnapshotUi();
            flash(roomLabel(roomKey) + " saved");
          });
        },
        canCommit: () => true,
      });

      attachRoomSlideAction(onTrack, onBtn, restoreBtn, {
        direction: "right",
        onTap: () => roomAll(roomKey, "on"),
        onCommit: () => {
          snapshotRestoreApi("room", roomKey).then((ok) => {
            if (ok) flash("Restoring " + roomLabel(roomKey) + "…");
          });
        },
        canCommit: () => !!snapshots[snapshotRoomKey(roomKey)],
      });

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
      ROOMS_EL.appendChild(card);

      attachRoomReorder(card, dragHandle);
      roomEls.set(roomKey, { card, body, meta, moveUp, moveDown, offTrack, onTrack, saveBtn, restoreBtn });

      for (const dev of devs) body.appendChild(makeTile(dev));
    }

    restoreCollapsed();
    updateRoomMeta();
    updateRoomSnapshotUi();
    updateClimateWidgets();
    updateMoveButtons();
  }

  function makeTile(dev, context) {
    const inFavorites = context === "favorites";
    const isDim = !!dev.d;
    const tile = ce("section", "tile " + (isDim ? "dimmer" : "switch"));
    tile.dataset.id = dev.i;
    tile.dataset.name = String(dev.n || "").toLowerCase();

    const fullName = dev.n || ("Device " + dev.i);
    const roomName = dev.r != null && dev.r !== -1 ? roomMap.get(dev.r) : null;
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
    if (inFavorites) favDevMap.set(dev.i, rec);
    else devMap.set(dev.i, rec);
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
      if (colorSession && colorSession.id !== id) closeColorPopup(true);
      if (tstatSession) closeTstatPopup();
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
      if (tstatSession) closeTstatPopup();
      if (colorSession && colorSession.id !== id) closeColorPopup(true);
      const rec = devMap.get(id);
      openColorPopup(id, nameEl, rec?.data || dev);
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
    const on = effectiveSwitch(dev);
    rec.el.classList.toggle("on", on);
    rec.el.classList.toggle("off", !on);
    rec.stateEl.textContent = on ? "On" : "Off";
    const bulb = qs(".tile-bulb", rec.el);
    if (bulb) bulb.setAttribute("aria-pressed", on ? "true" : "false");
    const nameEl = qs(".tile-name", rec.el);
    if (nameEl) nameEl.classList.toggle("color-capable", rec.isDim);
    rec.levelEl.textContent = formatFootText(
      rec.isDim ? { ...dev, l: effectiveLevel(dev) } : dev,
      rec.isDim
    );
    if (rec.isDim) {
      const displayL = effectiveLevel(dev);
      if (!rec.el.classList.contains("dragging") && displayL != null) {
        setSliderLevel(rec.sliderEl, displayL);
      }
    }
    syncFavButton(rec.el.querySelector(".tile-fav"), dev.i);
  }

  function updateStates() {
    for (const dev of devices) {
      syncTileState(devMap.get(dev.i), dev);
      syncTileState(favDevMap.get(dev.i), dev);
    }
    updateRoomMeta();
  }

  function updateRoomMeta() {
    for (const [rid, rec] of roomEls) {
      const devs = devicesByRoom.get(rid) || [];
      const onCount = devs.filter((d) => effectiveSwitch(d)).length;
      const total = devs.length;
      const hasClimate = roomHasClimate(rid);
      let text;
      if (total > 0) {
        text = onCount ? onCount + " of " + total + " on" : (total + " light" + (total === 1 ? "" : "s"));
      } else if (thermoByRoom.has(rid)) {
        const t = (thermoByRoom.get(rid) || [])[0];
        const tm = String(t?.tm || "").toLowerCase();
        text = tm && tm !== "off" ? tm : "Thermostat";
      } else if (sensorByRoom.has(rid)) {
        text = (sensorByRoom.get(rid)[0]?.n) || "Temperature";
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
      setLevelOptimistic(id, p);
      sendCmd(id, "setLevel", p);
      const dev = devices.find((d) => d.i === id);
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
        setLevelOptimistic(id, p);
        sendCmd(id, "setLevel", p);
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
    flash("Haptics: " + parts.join(" · "), !accepted);
  }

  function toggleSwitch(id) {
    hapticTap();
    const dev = devices.find((d) => d.i === id);
    if (!dev) return;
    const on = effectiveSwitch(dev);
    const next = on ? "off" : "on";
    setSwitchOptimistic(id, next === "on" ? 1 : 0);
    updateStates();
    sendCmd(id, next).then((r) => {
      if (!r?.ok) { clearSwitchOptimistic(id); refreshDevice(id); }
    });
  }

  function toggleDimmer(id) {
    hapticTap();
    const dev = devices.find((d) => d.i === id);
    if (!dev) return;
    if (effectiveSwitch(dev)) {
      setSwitchOptimistic(id, 0, 0);
      setLevelOptimistic(id, 0);
      updateStates();
      sendCmd(id, "off").then((r) => {
        if (!r?.ok) { clearSwitchOptimistic(id); refreshDevice(id); }
      });
    } else {
      setSwitchOptimistic(id, 1, null);
      updateStates();
      sendCmd(id, "on").then((r) => {
        if (!r?.ok) { clearSwitchOptimistic(id); refreshDevice(id); }
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
      const d = await getJson("device?id=" + id);
      if (!d || d.i == null) return;
      const rec = devMap.get(Number(d.i));
      if (rec) {
        const dev = devices.find((x) => x.i === Number(d.i));
        if (dev) {
          dev.s = d.s ? 1 : 0;
          if (rec.isDim && d.l != null) dev.l = d.l;
          if (rec.data.ct && d.k != null) dev.k = d.k;
          if (rec.data.rgb && d.h != null) dev.h = d.h;
          if (rec.data.rgb && d.sat != null) dev.sat = d.sat;
        }
        const opt = switchOptimistic.get(Number(d.i));
        if (opt && !!dev?.s === !!opt.s) clearSwitchOptimistic(Number(d.i));
        updateStates();
        return;
      }
      // thermostat reconcile
      const t = thermostats.find(x => x.i === Number(d.i));
      if (t) {
        const modeLocked = tstatModeLocked(t.i);
        if (d.tm != null && !modeLocked) t.tm = d.tm;
        if (d.os != null && !modeLocked) t.os = d.os;
        applyTstatSetpoints(t, { hsp: d.hsp, csp: d.csp });
        if (d.temp != null) t.temp = Number(d.temp);
        if (d.hasFm != null) t.hasFm = d.hasFm;
        if (d.fm != null) t.fm = d.fm;
        if (d.hasFs != null) t.hasFs = d.hasFs;
        if (d.fs != null) t.fs = d.fs;
        updateClimateWidgets();
        updateRoomMeta();
        refreshOpenTstatQuickPopups();
        return;
      }
      const s = tempSensors.find(x => x.i === Number(d.i));
      if (s) {
        if (d.temp != null) s.temp = Number(d.temp);
        updateClimateWidgets();
        updateRoomMeta();
        return;
      }
      const lock = locks.find(x => x.i === Number(d.i));
      if (lock) {
        if (d.lk != null) lock.lk = d.lk ? 1 : 0;
        if (d.st != null) lock.st = d.st;
        const opt = lockOptimistic.get(Number(d.i));
        if (opt && !!lock.lk === !!opt.lk) clearLockOptimistic(Number(d.i));
        if (currentCategory() === "locks") renderLocksPopup();
        return;
      }
      const shade = windowShades.find(x => x.i === Number(d.i));
      if (shade) {
        if (d.st != null) shade.st = d.st;
        if (d.pos != null) shade.pos = d.pos;
        const opt = shadeOptimistic.get(Number(d.i));
        if (opt) {
          let matched = true;
          if (opt.st != null && shade.st !== opt.st) matched = false;
          if (opt.pos != null && shade.pos !== opt.pos) matched = false;
          if (matched) clearShadeOptimistic(Number(d.i));
        }
        if (quickPopupOpenType === "blinds") renderBlindsPopup();
        return;
      }
      const mp = music.find(x => x.i === Number(d.i));
      if (mp) {
        if (d.st != null) mp.st = d.st;
        if (d.v != null) mp.v = d.v;
        if (d.tr != null) mp.tr = d.tr;
        if (d.m != null) mp.m = d.m;
        if (d.f != null) mp.f = d.f;
        const mopt = musicOptimistic.get(Number(d.i));
        if (mopt && (mopt.st == null || mp.st === mopt.st) && (mopt.v == null || mp.v === mopt.v)) {
          clearMusicOptimistic(Number(d.i));
        }
        if (currentCategory() === "music") renderMusicPopup();
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
    const dev = music.find(m => m.i === id);
    if (!dev) return;
    const ctrl = musicControls(dev);
    if (cmd === "play" && !ctrl.play) return;
    if (cmd === "pause" && !ctrl.pause) return;
    if (cmd === "stop" && !ctrl.stop) return;
    if (cmd === "previousTrack" && !ctrl.prev) return;
    if (cmd === "nextTrack" && !ctrl.next) return;
    if (cmd === "setVolume" && !ctrl.volume) return;
    if ((cmd === "mute" || cmd === "unmute") && !ctrl.mute) return;
    hapticTap();
    let patch = {};
    if (cmd === "play") patch = { st: "playing" };
    else if (cmd === "pause") patch = { st: "paused" };
    else if (cmd === "stop") patch = { st: "stopped" };
    else if (cmd === "setVolume") patch = { v: Math.max(0, Math.min(100, Number(val))) };
    if (patch.st != null || patch.v != null) {
      setMusicOptimistic(id, patch);
      if (currentCategory() === "music") renderMusicPopup();
    }
    const result = await sendCmd(id, cmd, val);
    if (!result.ok) {
      clearMusicOptimistic(id);
      reconcileMusic(id);
      if (currentCategory() === "music") renderMusicPopup();
    } else {
      reconcileMusic(id);
    }
  }

  function broadcastMusic(cmd) {
    if (!music.length) return;
    hapticTap();
    for (const dev of music) {
      const ctrl = musicControls(dev);
      if (cmd === "play" && !ctrl.play) continue;
      if (cmd === "pause" && !ctrl.pause) continue;
      if (cmd === "stop" && !ctrl.stop) continue;
      sendMusicCmd(dev.i, cmd);
    }
  }

  async function broadcastMusicVolume(delta) {
    const capable = music.filter((d) => musicControls(d).volume);
    if (!capable.length) return;
    hapticTap();
    for (const dev of capable) {
      const base = effectiveMusicVolume(dev) ?? 0;
      const next = Math.max(0, Math.min(100, base + delta));
      setMusicOptimistic(dev.i, { v: next });
      sendCmd(dev.i, "setVolume", next).then((result) => {
        if (!result.ok) { clearMusicOptimistic(dev.i); reconcileMusic(dev.i); }
        else reconcileMusic(dev.i);
        if (currentCategory() === "music") renderMusicPopup();
      });
    }
    if (currentCategory() === "music") renderMusicPopup();
  }

  async function sendLockCmd(id, cmd, pin) {
    const lock = locks.find(l => l.i === id);
    if (!lock) return { ok: false };
    const lk = cmd === "lock" ? 1 : 0;
    const st = cmd === "lock" ? "locked" : "unlocked";
    hapticTap();
    setLockOptimistic(id, lk, st);
    if (currentCategory() === "locks") renderLocksPopup();
    const result = await sendCmd(id, cmd, null, pin);
    if (!result.ok) {
      clearLockOptimistic(id);
      reconcileLock(id);
      if (currentCategory() === "locks") renderLocksPopup();
    } else {
      reconcileLock(id);
    }
    return result;
  }

  async function sendShadeCmd(id, cmd, val) {
    const shade = windowShades.find(s => s.i === id);
    if (!shade) return { ok: false };
    hapticTap();
    let patch = {};
    if (cmd === "open") patch = { st: "opening" };
    else if (cmd === "close") patch = { st: "closing" };
    else if (cmd === "setPosition") patch = { pos: Math.max(0, Math.min(100, Number(val))) };
    if (patch.st != null || patch.pos != null) {
      setShadeOptimistic(id, patch);
      if (quickPopupOpenType === "blinds") renderBlindsPopup();
    }
    const result = await sendCmd(id, cmd, val);
    if (!result.ok) {
      clearShadeOptimistic(id);
      reconcileShade(id);
      if (quickPopupOpenType === "blinds") renderBlindsPopup();
    } else {
      reconcileShade(id);
    }
    return result;
  }


  function applySwitchCmdOptimistic(dev, cmd) {
    const id = dev.i;
    if (cmd === "on") {
      setSwitchOptimistic(id, 1, dev.d ? null : undefined);
    } else {
      setSwitchOptimistic(id, 0, dev.d ? 0 : undefined);
      if (dev.d) setLevelOptimistic(id, 0);
    }
  }

  function roomAll(rid, cmd) {
    hapticTap();
    const devs = devicesByRoom.get(rid) || [];
    if (!devs.length) return;
    const hasDimmer = devs.some(d => d.d);
    for (const dev of devs) applySwitchCmdOptimistic(dev, cmd);
    updateStates();
    bulkLightsApi(cmd, "room", rid);
    if (cmd === "on" && hasDimmer) setTimeout(refresh, 900); // reconcile restored levels
  }

  function allLights(cmd) {
    if (!devices.length) return;
    const hasDimmer = devices.some(d => d.d);
    for (const dev of devices) applySwitchCmdOptimistic(dev, cmd);
    updateStates();
    bulkLightsApi(cmd, "house");
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
    if (!locks.length) {
      body.textContent = "No locks selected — add locks in the Hubitat app settings";
      return;
    }
    if (unlockPinEnabled && !unlockPinRequired) {
      const hint = ce("p", "quick-lock-pin-hint");
      hint.textContent = "Set unlock PIN in Hubitat app settings";
      body.appendChild(hint);
    }
    const sorted = locks.slice().sort((a, b) => {
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
      meta.textContent = roomLabel(lock.r) + " · " + lockStatusLabel(lock);
      info.appendChild(name);
      info.appendChild(meta);
      const actions = ce("div", "quick-lock-actions");
      const lockBtn = ce("button", "quick-lock-btn");
      lockBtn.type = "button";
      lockBtn.innerHTML = LOCK_BTN_SVG + '<span class="quick-lock-btn-label">Lock</span>';
      const unlockBtn = ce("button", "quick-lock-btn");
      unlockBtn.type = "button";
      unlockBtn.innerHTML = UNLOCK_BTN_SVG + '<span class="quick-lock-btn-label">Unlock</span>';
      const isLocked = effectiveLock(lock);
      if (isLocked) lockBtn.classList.add("active");
      else unlockBtn.classList.add("active");
      lockBtn.addEventListener("click", () => {
        if (!effectiveLock(lock)) sendLockCmd(lock.i, "lock");
      });
      unlockBtn.addEventListener("click", () => {
        if (!effectiveLock(lock)) return;
        if (unlockPinRequired) promptUnlockPin(lock.i, lock.n);
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

  function renderBlindsPopup() {
    const popup = ensureQuickPopup();
    const body = popup._body;
    body.className = "quick-body quick-body-blinds";
    body.innerHTML = "";
    if (!windowShades.length) {
      body.textContent = "No shades selected — add shades in the Hubitat app settings";
      return;
    }
    const sorted = windowShades.slice().sort((a, b) => {
      const ra = roomLabel(a.r).localeCompare(roomLabel(b.r));
      if (ra !== 0) return ra;
      return String(a.n || "").localeCompare(String(b.n || ""));
    });
    const list = ce("div", "quick-list");
    for (const shade of sorted) {
      const tile = ce("div", "shade-tile");
      const info = ce("div", "shade-info");
      const name = ce("span", "quick-fav-name");
      name.textContent = shade.n || ("Shade " + shade.i);
      const meta = ce("span", "quick-fav-meta");
      meta.textContent = roomLabel(shade.r) + " · " + shadeStatusLabel(shade);
      info.appendChild(name);
      info.appendChild(meta);
      tile.appendChild(info);

      const moving = shadeIsMoving(shade);
      const pos = effectiveShadePosition(shade);
      const hasPos = shade.pos != null;
      if (hasPos) {
        const sliderWrap = ce("div", "shade-slider-wrap");
        const levelLabel = ce("span", "shade-level-label");
        levelLabel.textContent = (pos != null ? pos : "—") + "%";
        const slider = ce("div", "slider shade-slider");
        slider.appendChild(ce("div", "slider-fill"));
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
      const st = effectiveShadeState(shade);
      if (st === "open") openBtn.classList.add("active");
      else if (st === "closed") closeBtn.classList.add("active");
      if (moving) {
        openBtn.classList.add("moving");
        closeBtn.classList.add("moving");
        openBtn.disabled = true;
        closeBtn.disabled = true;
      }
      openBtn.addEventListener("click", () => {
        if (!shadeIsMoving(shade) && effectiveShadeState(shade) !== "open") sendShadeCmd(shade.i, "open");
      });
      closeBtn.addEventListener("click", () => {
        if (!shadeIsMoving(shade) && effectiveShadeState(shade) !== "closed") sendShadeCmd(shade.i, "close");
      });
      actions.appendChild(openBtn);
      actions.appendChild(closeBtn);
      if (moving) {
        const stopBtn = ce("button", "quick-lock-btn shade-btn shade-stop-btn");
        stopBtn.type = "button";
        stopBtn.innerHTML = SHADE_STOP_SVG + '<span class="quick-lock-btn-label">Stop</span>';
        stopBtn.addEventListener("click", () => sendShadeCmd(shade.i, "stop"));
        actions.appendChild(stopBtn);
      }
      tile.appendChild(actions);
      list.appendChild(tile);
    }
    body.appendChild(list);
  }

  // ---------- sensors popup ----------
  function normalizeTempSensorForCard(s) {
    return { i: s.i, n: s.n, r: s.r, t: "temp", v: s.temp, u: s.u, a: 0, ex: [], _ref: s };
  }

  function mergedSensorList() {
    const out = [];
    for (const s of tempSensors) out.push({ i: s.i, n: s.n, r: s.r, t: "temp", v: s.temp, u: s.u, a: 0, ex: [], _ref: s });
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
      hero = formatRoomTemp(dev._ref || dev);
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
    if (!music.length) {
      body.textContent = "No speakers selected — add music players or additional speakers in the Hubitat app settings";
      return;
    }
    const sorted = music.slice().sort((a, b) => {
      const ra = roomLabel(a.r).localeCompare(roomLabel(b.r));
      if (ra !== 0) return ra;
      return String(a.n || "").localeCompare(String(b.n || ""));
    });
    const list = ce("div", "quick-list music-list");
    for (const dev of sorted) {
      const ctrl = musicControls(dev);
      const playing = isMusicPlaying(effectiveMusicStatus(dev));
      const status = effectiveMusicStatus(dev);
      const vol = effectiveMusicVolume(dev);
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
      meta.textContent = roomLabel(dev.r) + " · " + musicStatusLabel(dev);
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
        setMusicOptimistic(dev.i, { v: pendingVol });
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
    if (!hubModes.length) {
      body.textContent = "No hub modes configured";
      return;
    }
    const grid = ce("div", "hub-mode-grid");
    for (const mode of hubModes) {
      const meta = hubModeMeta(mode);
      const b = ce("button", "hub-mode-btn");
      b.type = "button";
      b.innerHTML = meta.svg;
      const label = ce("span", "hub-mode-label");
      label.textContent = mode;
      b.appendChild(label);
      if (mode === currentHubMode) b.classList.add("active");
      b.addEventListener("click", async () => {
        if (mode === currentHubMode) return;
        hapticTap();
        currentHubMode = mode;
        hubModeLockUntil = Date.now() + 4000;
        renderHubModePopup();
        await setHubModeApi(mode);
      });
      grid.appendChild(b);
    }
    body.appendChild(grid);
  }

  function ensurePinPadPopup() {
    if (pinPadPopup) return pinPadPopup;
    pinPadPopup = ce("div", "pin-pad-popup");
    pinPadPopup.hidden = true;
    pinPadPopup.setAttribute("role", "dialog");
    pinPadPopup.setAttribute("aria-modal", "true");
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
    pinPadPopup.appendChild(panel);
    document.body.appendChild(pinPadPopup);

    pinPadPopup.addEventListener("click", (e) => {
      if (e.target === pinPadPopup) closePinPad();
    });
    panel.addEventListener("click", (e) => e.stopPropagation());
    cancel.addEventListener("click", (e) => {
      e.stopPropagation();
      pinPadState?.onCancel?.();
      closePinPad();
    });
    submit.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      if (!pinPadState?.pin?.length) return;
      pinPadState?.onSubmit?.(pinPadState.pin);
    });
    document.addEventListener("keydown", (e) => {
      if (!pinPadPopup.classList.contains("open")) return;
      if (e.key === "Escape") {
        pinPadState?.onCancel?.();
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
        if (pinPadState?.pin?.length) pinPadState.onSubmit?.(pinPadState.pin);
      }
    });

    pinPadPopup._title = title;
    pinPadPopup._dots = dots;
    pinPadPopup._keys = keys;
    pinPadPopup._submit = submit;
    return pinPadPopup;
  }

  function renderPinPadDots() {
    if (!pinPadPopup || !pinPadState) return;
    const len = pinPadState.pin.length;
    pinPadPopup._dots.innerHTML = "";
    for (let i = 0; i < Math.max(4, len); i++) {
      const dot = ce("span", "pin-dot");
      if (i < len) dot.classList.add("filled");
      pinPadPopup._dots.appendChild(dot);
    }
    pinPadPopup._submit.disabled = len === 0;
  }

  function appendPinDigit(d) {
    if (!pinPadState || pinPadState.pin.length >= 8) return;
    hapticTap();
    pinPadState.pin += d;
    renderPinPadDots();
  }

  function backspacePinDigit() {
    if (!pinPadState || !pinPadState.pin.length) return;
    hapticTap();
    pinPadState.pin = pinPadState.pin.slice(0, -1);
    renderPinPadDots();
  }

  function closePinPad() {
    if (!pinPadPopup) return;
    pinPadPopup.hidden = true;
    pinPadPopup.classList.remove("open");
    pinPadPopup.classList.remove("shake");
    pinPadState = null;
  }

  function openPinPad({ title, onSubmit, onCancel }) {
    const popup = ensurePinPadPopup();
    pinPadState = { pin: "", onSubmit, onCancel };
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
        if (pinPadState) pinPadState.pin = "";
        renderPinPadDots();
      },
    };
  }

  function promptUnlockPin(lockId, lockName) {
    hapticTap();
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
        if (result?.error === "pin not configured") flash("Set unlock PIN in Hubitat app settings", true);
        pad.close();
      },
    });
  }

  function runHsmAction(title, cmd) {
    hapticTap();
    if (hsmPinRequired) {
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
      if (hsmModeIsActive(hsmStatus, mode)) b.classList.add("active");
      b.addEventListener("click", () => {
        if (skipActive && hsmModeIsActive(hsmStatus, mode)) return;
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
    if (!hsmEnabled) {
      body.textContent = "Enable HSM control in the Hubitat app settings";
      return;
    }

    const statusWrap = ce("div", "quick-hsm-status");
    const statusLabel = ce("span", "quick-hsm-status-label");
    statusLabel.textContent = hsmStatusLabel(hsmStatus);
    statusWrap.appendChild(statusLabel);
    const monMeta = ce("span", "quick-hsm-status-meta");
    monMeta.textContent = hsmMonitoringLabel(hsmStatus);
    statusWrap.appendChild(monMeta);
    body.appendChild(statusWrap);

    if (hsmHasActiveAlert(hsmAlert)) {
      const alertBanner = ce("div", "quick-hsm-alert-banner");
      const alertText = ce("span", "quick-hsm-alert");
      alertText.textContent = hsmAlertLabel(hsmAlert, hsmAlertDesc);
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

  // __MLD_SPLIT2__

  function renderScenesPopup() {
    const popup = ensureQuickPopup();
    const body = popup._body;
    body.className = "quick-body quick-body-scenes";
    body.innerHTML = "";
    if (!scenes.length) {
      body.textContent = "No scenes on this hub";
      return;
    }
    const list = ce("div", "quick-list");
    for (const sc of scenes) {
      const b = ce("button", "quick-list-btn");
      b.type = "button";
      b.textContent = sc.n || ("Scene " + sc.id);
      b.addEventListener("click", async () => {
        b.disabled = true;
        hapticTap();
        const ok = await activateSceneApi(sc.id);
        b.disabled = false;
        if (ok) flash("Scene activated");
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
      hapticTap();
      closeCurrentView();
      const rid = normalizeRoomId(t.r);
      const climateRec = climateEls.get(rid);
      openTstatPopup(rid, climateRec?.el || null);
    });

    const temps = favoriteTstatTemps(t);
    const stateInfo = favoriteTstatState(t);

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
    modeLabel.textContent = tstatModeDisplayLabel(t.tm);
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
    const canAdjust = !!favoriteTstatTarget(t);
    if (!canAdjust) {
      minus.disabled = true;
      plus.disabled = true;
    } else {
      minus.addEventListener("click", (e) => {
        e.stopPropagation();
        adjustFavoriteTstat(t.i, -1);
      });
      plus.addEventListener("click", (e) => {
        e.stopPropagation();
        adjustFavoriteTstat(t.i, 1);
      });
    }
    modeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      openFavoriteTstatModeMenu(modeBtn, t.i);
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
    const temps = favoriteTstatTemps(t);
    const stateInfo = favoriteTstatState(t);
    rec.spEl.className = "quick-fav-tstat-sp " + temps.tone;
    rec.spEl.textContent = temps.setpoint;
    rec.stateEl.className = "quick-fav-tstat-state" + (stateInfo.active ? " is-active" : "");
    rec.stateTxt.textContent = stateInfo.label;
    rec.modeLabel.textContent = tstatModeDisplayLabel(t.tm);
    const canAdjust = !!favoriteTstatTarget(t);
    rec.minus.disabled = !canAdjust;
    rec.plus.disabled = !canAdjust;
    if (favTstatModeMenu && favTstatModeMenuId === t.i) syncFavoriteTstatModeMenu(t);
  }

  function refreshFavoritesPopup() {
    if (currentCategory() !== "favorites") return;
    const sig = favoritesPopupSignature();
    const body = currentBody();
    if (!body.querySelector(".quick-fav-grid") || sig !== favPopupSig) {
      renderFavoritesPopup();
      return;
    }
    for (const entry of getFavoriteEntries()) {
      if (entry.type !== "thermostat") continue;
      const t = thermostats.find((x) => x.i === entry.dev.i) || entry.dev;
      updateQuickTstatCard(t, favTstatMap);
    }
    updateStates();
    if (favTstatModeMenu) repositionFavoriteTstatModeMenu();
  }

  function renderFavoritesPopup() {
    closeFavoriteTstatModeMenu();
    const popup = ensureQuickPopup();
    popup.classList.toggle("quick-popup-wide", !inTabView());
    const body = currentBody();
    body.className = "quick-body quick-body-favorites" + (inTabView() ? " tab-body" : "");
    body.innerHTML = "";
    favDevMap.clear();
    favTstatMap.clear();
    favSensorMap.clear();
    const entries = getFavoriteEntries();
    favPopupSig = favoritesPopupSignature();
    if (!entries.length) {
      body.textContent = "Tap the star on any light, thermostat, or sensor to add it here";
      return;
    }
    const grid = ce("div", "quick-fav-grid");
    for (const entry of entries) {
      if (entry.type === "light") {
        grid.appendChild(makeTile(entry.dev, "favorites"));
      } else if (entry.type === "thermostat") {
        grid.appendChild(makeQuickTstatCard(entry.dev, favTstatMap));
      } else {
        grid.appendChild(makeFavoriteSensorCard(entry.dev));
      }
    }
    body.appendChild(grid);
    updateStates();
  }

  function thermostatsListSignature() {
    return thermostats.map((t) => t.i).join(",");
  }

  function refreshThermostatsPopup() {
    if (currentCategory() !== "thermostats") return;
    const listSig = thermostatsListSignature();
    const body = currentBody();
    if (!body.querySelector(".quick-fav-grid") || listSig !== tstatsPopupSig) {
      renderThermostatsPopup();
      return;
    }
    for (const t of thermostats) updateQuickTstatCard(t, tstatsPopupMap);
    if (favTstatModeMenu) repositionFavoriteTstatModeMenu();
  }

  function renderThermostatsPopup() {
    closeFavoriteTstatModeMenu();
    const popup = ensureQuickPopup();
    popup.classList.toggle("quick-popup-wide", !inTabView());
    const body = currentBody();
    body.className = "quick-body quick-body-thermostats" + (inTabView() ? " tab-body" : "");
    body.innerHTML = "";
    tstatsPopupMap.clear();
    tstatsPopupSig = thermostatsListSignature();
    if (!thermostats.length) {
      body.textContent = "No thermostats selected — add thermostats in the Hubitat app settings";
      return;
    }
    const sorted = thermostats.slice().sort((a, b) => {
      const ra = roomLabel(a.r).localeCompare(roomLabel(b.r));
      if (ra !== 0) return ra;
      return String(a.n || "").localeCompare(String(b.n || ""));
    });
    const grid = ce("div", "quick-fav-grid");
    for (const t of sorted) grid.appendChild(makeQuickTstatCard(t, tstatsPopupMap));
    body.appendChild(grid);
  }

  function quickNavPopupHasContent(popup) {
    switch (popup) {
      case "locks": return locks.length > 0;
      case "scenes": return scenes.length > 0;
      case "hub-mode": return hubModes.length > 0;
      case "security": return hsmEnabled;
      case "blinds": return windowShades.length > 0;
      case "scheduling": return false;
      case "sensors": return mergedSensorList().length > 0;
      case "thermostats": return thermostatsPopupEnabled && thermostats.length > 0;
      case "music": return music.length > 0;
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
    if (tabMode && QUICK_LIGHTS_BTN) { QUICK_LIGHTS_BTN.hidden = false; anyVisible = true; }
    const nav = document.querySelector(".quick-nav");
    if (nav) nav.hidden = !anyVisible;
    if (quickPopupOpenType && !quickNavPopupHasContent(quickPopupOpenType)) closeQuickPopup();
    if (tabMode && inTabView() && !quickNavPopupHasContent(activeTab)) showTab("lights");
  }

  function refreshQuickPopupIfOpen() {
    if (inTabView()) {
      switch (activeTab) {
        case "music": renderMusicPopup(); break;
        case "favorites": refreshFavoritesPopup(); break;
        case "thermostats": refreshThermostatsPopup(); break;
        case "sensors": refreshSensorsPopup(); break;
      }
      return;
    }
    if (!quickPopup?.classList.contains("open") || !quickPopupOpenType) return;
    switch (quickPopupOpenType) {
      case "hub-mode": renderHubModePopup(); break;
      case "locks": renderLocksPopup(); break;
      case "blinds": renderBlindsPopup(); break;
      case "music": renderMusicPopup(); break;
      case "favorites": refreshFavoritesPopup(); break;
      case "thermostats": refreshThermostatsPopup(); break;
      case "security": renderSecurityPopup(); break;
      case "sensors": refreshSensorsPopup(); break;
    }
  }

  function openQuickPopup(id, title) {
    if (colorSession) closeColorPopup(true);
    if (tstatSession) closeTstatPopup();
    closeMusicMasterPopup();
    const popup = ensureQuickPopup();
    popup.classList.toggle("quick-popup-wide", id === "favorites" || id === "sensors" || id === "thermostats" || id === "blinds");
    popup.classList.toggle("quick-popup-hub-mode", id === "hub-mode");
    popup._title.textContent = title;
    popup.setAttribute("aria-label", title);
    quickPopupOpenType = id;
    switch (id) {
      case "hub-mode": renderHubModePopup(); break;
      case "scenes": renderScenesPopup(); break;
      case "favorites": renderFavoritesPopup(); break;
      case "locks": renderLocksPopup(); break;
      case "blinds": renderBlindsPopup(); break;
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
    closeFavoriteTstatModeMenu();
    if (!quickPopup) return;
    quickPopup.hidden = true;
    quickPopup.classList.remove("open");
    quickPopup.classList.remove("quick-popup-wide");
    quickPopup.classList.remove("quick-popup-hub-mode");
    quickPopupOpenType = null;
    favDevMap.clear();
    favTstatMap.clear();
    favSensorMap.clear();
    favPopupSig = "";
    tstatsPopupMap.clear();
    tstatsPopupSig = "";
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
    if (tabViewEl) return tabViewEl;
    tabViewEl = ce("div", "tab-view");
    tabViewEl.hidden = true;
    // place it right after the rooms main element
    if (ROOMS_EL && ROOMS_EL.parentNode) ROOMS_EL.parentNode.insertBefore(tabViewEl, ROOMS_EL.nextSibling);
    return tabViewEl;
  }

  function currentBody() {
    if (tabMode && activeTab !== "lights") return ensureTabView();
    return ensureQuickPopup()._body;
  }

  function currentCategory() {
    if (tabMode && activeTab !== "lights") return activeTab;
    return quickPopupOpenType;
  }

  function inTabView() {
    return tabMode && activeTab !== "lights";
  }

  function updateTabActiveStates() {
    if (QUICK_LIGHTS_BTN) QUICK_LIGHTS_BTN.classList.toggle("is-tab-active", tabMode && activeTab === "lights");
    for (const { popup } of QUICK_NAV) {
      if (!TAB_CATEGORIES.has(popup)) continue;
      const btn = document.getElementById("quick-" + popup);
      if (btn) btn.classList.toggle("is-tab-active", tabMode && activeTab === popup);
    }
  }

  function showTab(id) {
    if (colorSession) closeColorPopup(true);
    if (tstatSession) closeTstatPopup();
    if (musicMasterPopup && musicMasterPopup.classList.contains("open")) closeMusicMasterPopup();
    if (quickPopup && quickPopup.classList.contains("open")) closeQuickPopup();
    activeTab = id;
    ensureTabView();
    const nonLights = id !== "lights";
    if (ROOMS_EL) ROOMS_EL.hidden = nonLights;
    if (tabViewEl) tabViewEl.hidden = !nonLights;
    if (ALL_ON_BTN) ALL_ON_BTN.hidden = nonLights;
    if (ALL_OFF_BTN) ALL_OFF_BTN.hidden = nonLights;
    if (CENTRAL_TSTAT_BTN) CENTRAL_TSTAT_BTN.hidden = !(tabMode && id === "thermostats");
    if (CENTRAL_MUSIC_BTN) CENTRAL_MUSIC_BTN.hidden = !(tabMode && id === "music");
    if (SEARCH_EL) SEARCH_EL.placeholder = nonLights ? "Search " + (TAB_LABELS[id] || "items") : "Search lights or rooms";
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
    if (tabMode && activeTab !== "lights") showTab("lights");
    else closeQuickPopup();
  }

  function setTabMode(on) {
    cfg.enableTabs = on;
    tabMode = on;
    saveTabsPref(on);
    if (QUICK_LIGHTS_BTN) QUICK_LIGHTS_BTN.hidden = !on;
    if (!on) {
      if (quickPopup && quickPopup.classList.contains("open")) closeQuickPopup();
      activeTab = "lights";
      if (ROOMS_EL) ROOMS_EL.hidden = false;
      if (tabViewEl) tabViewEl.hidden = true;
      if (ALL_ON_BTN) ALL_ON_BTN.hidden = false;
      if (ALL_OFF_BTN) ALL_OFF_BTN.hidden = false;
      if (CENTRAL_TSTAT_BTN) CENTRAL_TSTAT_BTN.hidden = true;
      if (CENTRAL_MUSIC_BTN) CENTRAL_MUSIC_BTN.hidden = true;
      if (SEARCH_EL) SEARCH_EL.placeholder = "Search lights or rooms";
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
    ok.addEventListener("click", (e) => { e.stopPropagation(); hapticTap(); closeConfirm(true); });
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

  if (ALL_ON_BTN) {
    ALL_ON_BTN.addEventListener("click", async () => {
      if (!devices.length) return;
      if (await confirmAction({ message: "Turn on all lights?", confirmLabel: "All on" })) allLights("on");
    });
  }
  if (ALL_OFF_BTN) {
    ALL_OFF_BTN.addEventListener("click", async () => {
      if (!devices.length) return;
      if (await confirmAction({ message: "Turn off all lights?", confirmLabel: "All off", danger: true })) allLights("off");
    });
  }

  // ---------- filter ----------
  let collapsedBeforeSearch = null;

  function collapsedIdSet() {
    const set = new Set();
    for (const [rid, rec] of roomEls) if (rec.card.classList.contains("collapsed")) set.add(rid);
    return set;
  }

  function applyFilter() {
    if (!SEARCH_EL) return;
    const q = SEARCH_EL.value.trim().toLowerCase();
    if (!q) {
      for (const [, rec] of roomEls) rec.card.classList.remove("hidden");
      for (const [, rec] of devMap) rec.el.classList.remove("hidden");
      if (collapsedBeforeSearch) {
        for (const [rid, rec] of roomEls) {
          rec.card.classList.toggle("collapsed", collapsedBeforeSearch.has(rid));
        }
        collapsedBeforeSearch = null;
        updateExpandAllBtn();
      }
      return;
    }

    if (!collapsedBeforeSearch) collapsedBeforeSearch = collapsedIdSet();

    for (const [, rec] of devMap) {
      rec.el.classList.toggle("hidden", !rec.el.dataset.name.includes(q));
    }
    for (const [, rec] of roomEls) {
      const visible = rec.body.querySelectorAll(".tile:not(.hidden)");
      let show = visible.length > 0;
      if (rec.card.dataset.roomName.includes(q)) show = true;
      rec.card.classList.toggle("hidden", !show);
      if (show) rec.card.classList.remove("collapsed");
    }
  }

  function applyTabSearch(q) {
    if (!tabViewEl) return;
    const items = tabViewEl.querySelectorAll("[data-name]");
    for (const el of items) {
      el.classList.toggle("search-hidden", !!q && !el.dataset.name.includes(q));
    }
  }

  function applySearch() {
    if (!SEARCH_EL) return;
    if (inTabView()) {
      applyTabSearch(SEARCH_EL.value.trim().toLowerCase());
    } else {
      applyFilter();
    }
  }
  if (SEARCH_EL) SEARCH_EL.addEventListener("input", applySearch);

  // ---------- collapse persistence ----------
  function collapsedSet() {
    const set = [];
    for (const [rid, rec] of roomEls) if (rec.card.classList.contains("collapsed")) set.push(rid);
    return set;
  }

  function persistCollapsed() {
    try { localStorage.setItem("mld_collapsed", collapsedSet().join(",")); } catch {}
  }

  function allRoomsCollapsed() {
    if (roomEls.size === 0) return true;
    for (const [, rec] of roomEls) if (!rec.card.classList.contains("collapsed")) return false;
    return true;
  }

  function updateExpandAllBtn() {
    if (!EXPAND_ALL_BTN) return;
    const collapsed = allRoomsCollapsed();
    const label = collapsed ? "Expand all rooms" : "Collapse all rooms";
    EXPAND_ALL_BTN.innerHTML = collapsed ? EXPAND_ALL_SVG : COLLAPSE_ALL_SVG;
    EXPAND_ALL_BTN.setAttribute("aria-label", label);
    EXPAND_ALL_BTN.setAttribute("title", label);
  }

  function collapseAllRooms() {
    for (const [, rec] of roomEls) rec.card.classList.add("collapsed");
    persistCollapsed();
    updateExpandAllBtn();
  }

  function expandAllRooms() {
    for (const [, rec] of roomEls) rec.card.classList.remove("collapsed");
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
    for (const [rid, rec] of roomEls) {
      rec.card.classList.toggle("collapsed", set.has(rid));
    }
    updateExpandAllBtn();
  }

  if (EXPAND_ALL_BTN) {
    EXPAND_ALL_BTN.addEventListener("click", () => {
      if (allRoomsCollapsed()) expandAllRooms();
      else collapseAllRooms();
    });
  }

  if (REORDER_DONE_BTN) {
    REORDER_DONE_BTN.addEventListener("click", finishReorderMode);
  }

  if (REORDER_CANCEL_BTN) {
    REORDER_CANCEL_BTN.addEventListener("click", cancelReorderMode);
  }

  if (OVERFLOW_BTN) {
    OVERFLOW_BTN.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleTopbarOverflowMenu();
    });
  }

  if (MENU_REORDER_BTN) {
    MENU_REORDER_BTN.addEventListener("click", () => {
      closeTopbarOverflowMenu();
      enterReorderMode();
    });
  }

  if (MENU_HAPTICS_EL) {
    const hapticsLabel = MENU_HAPTICS_EL.closest(".topbar-overflow-check");
    MENU_HAPTICS_EL.checked = cfg.enableHaptics;
    if (hapticsLabel) hapticsLabel.setAttribute("aria-checked", cfg.enableHaptics ? "true" : "false");
    MENU_HAPTICS_EL.addEventListener("click", (e) => e.stopPropagation());
    MENU_HAPTICS_EL.addEventListener("change", () => {
      cfg.enableHaptics = MENU_HAPTICS_EL.checked;
      saveHapticsPref(cfg.enableHaptics);
      if (hapticsLabel) hapticsLabel.setAttribute("aria-checked", cfg.enableHaptics ? "true" : "false");
      if (cfg.enableHaptics) testHaptics();
    });
  }

  if (MENU_TABS_EL) {
    const tabsLabel = MENU_TABS_EL.closest(".topbar-overflow-check");
    MENU_TABS_EL.checked = cfg.enableTabs;
    if (tabsLabel) tabsLabel.setAttribute("aria-checked", cfg.enableTabs ? "true" : "false");
    MENU_TABS_EL.addEventListener("click", (e) => e.stopPropagation());
    MENU_TABS_EL.addEventListener("change", () => {
      setTabMode(MENU_TABS_EL.checked);
      if (tabsLabel) tabsLabel.setAttribute("aria-checked", cfg.enableTabs ? "true" : "false");
    });
  }

  if (MENU_THEME_SEGMENT) {
    for (const btn of MENU_THEME_SEGMENT.querySelectorAll(".topbar-overflow-seg")) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const theme = btn.dataset.theme;
        if (!THEME_OPTIONS.includes(theme)) return;
        saveThemePref(theme);
        applyTheme(theme);
      });
    }
  }

  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (cfg.theme === "auto") applyTheme("auto");
    });
  } catch {}

  applyTheme(cfg.theme);

  // ---------- polling ----------
  async function refresh() {
    try {
      const d = await fetchData();
      render(d);
      setStatus("");
    } catch (e) {
      setStatus("Cannot reach hub", true);
    }
  }
  function effectivePollInterval() {
    const base = Math.max(2000, cfg.pollIntervalMs || POLL_DEFAULT);
    if (cfg.useWebSocket && wsConnected) return Math.max(base, POLL_WS_FALLBACK);
    return base;
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(refresh, effectivePollInterval());
  }

  function restartPolling() {
    if (pollTimer) startPolling();
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  // ---------- websocket (local only) ----------
  function startWS() {
    if (!cfg.useWebSocket) return;
    if (ws) return;
    if (location.hostname === "cloud.hubitat.com" || location.protocol === "https:") return; // ws not available via cloud proxy
    const wsUrl = "ws://" + location.host + "/eventsocket";
    try { ws = new WebSocket(wsUrl); } catch { ws = null; return; }
    ws.onopen = () => { wsRetry = 0; wsConnected = true; restartPolling(); };
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (!m) return;
        if (m.source === "LOCATION") {
          if (m.name === "hsmStatus" && !hsmLocked()) {
            hsmStatus = String(m.value || "");
            if (currentCategory() === "security") renderSecurityPopup();
          } else if (m.name === "hsmAlert") {
            hsmAlert = String(m.value || "");
            if (m.descriptionText) hsmAlertDesc = String(m.descriptionText);
            if (currentCategory() === "security") renderSecurityPopup();
          }
          return;
        }
        if (m.source !== "DEVICE" || m.deviceId == null) return;
        const rec = devMap.get(Number(m.deviceId));
        if (rec) {
          const dev = devices.find((x) => x.i === Number(m.deviceId));
          if (m.name === "switch") {
            const s = (m.value === "on") ? 1 : 0;
            if (dev) dev.s = s;
            clearSwitchOptimistic(Number(m.deviceId));
            updateStates();
          }
          else if (m.name === "level" && rec.isDim) {
            const lvl = Math.round(Number(m.value));
            if (!isNaN(lvl)) {
              if (dev) dev.l = lvl;
              clearSwitchOptimistic(Number(m.deviceId));
              if (!rec.el.classList.contains("dragging")) updateStates();
            }
          }
          else if (m.name === "colorTemperature" && rec.data.ct) {
            const k = Math.round(Number(m.value));
            if (!isNaN(k) && (!colorSession || colorSession.id !== rec.data.i)) {
              rec.data.k = k;
              updateStates();
            }
          }
          else if (m.name === "hue" && rec.data.rgb) {
            const h = Math.round(Number(m.value));
            if (!isNaN(h) && (!colorSession || colorSession.id !== rec.data.i)) {
              rec.data.h = h;
              updateStates();
            }
          }
          else if (m.name === "saturation" && rec.data.rgb) {
            const sat = Math.round(Number(m.value));
            if (!isNaN(sat) && (!colorSession || colorSession.id !== rec.data.i)) {
              rec.data.sat = sat;
              updateStates();
            }
          }
          return;
        }
        const lock = locks.find(x => x.i === Number(m.deviceId));
        if (lock && String(m.name || "") === "lock") {
          const val = String(m.value || "");
          const opt = lockOptimistic.get(lock.i);
          if (opt && opt.until > Date.now()) return;
          lock.st = val;
          lock.lk = val === "locked" ? 1 : 0;
          if (currentCategory() === "locks") renderLocksPopup();
          return;
        }
        const shade = windowShades.find(x => x.i === Number(m.deviceId));
        if (shade) {
          const name = String(m.name || "");
          const opt = shadeOptimistic.get(shade.i);
          if (opt && opt.until > Date.now()) return;
          if (name === "windowShade") {
            shade.st = String(m.value || "");
          } else if (name === "position") {
            const pos = Math.round(Number(m.value));
            if (!isNaN(pos)) shade.pos = pos;
          } else return;
          if (quickPopupOpenType === "blinds") renderBlindsPopup();
          return;
        }
        // thermostat / sensor events
        const t = thermostats.find(x => x.i === Number(m.deviceId));
        if (t) {
          const name = String(m.name || "");
          const val = m.value;
          if (name === "thermostatMode" && !tstatModeLocked(t.i)) t.tm = val;
          else if (name === "thermostatOperatingState" && !tstatModeLocked(t.i)) t.os = val;
          else if (name === "heatingSetpoint") applyTstatSetpoints(t, { hsp: val });
          else if (name === "coolingSetpoint") applyTstatSetpoints(t, { csp: val });
          else if (name === "temperature") { const n = Number(val); if (!isNaN(n)) t.temp = Math.round(n); }
          else if (name === "thermostatFanMode") t.fm = val;
          else if (name === "fanSpeed") t.fs = val;
          else return;
          updateClimateWidgets();
          updateRoomMeta();
          refreshOpenTstatQuickPopups();
          return;
        }
        const s = tempSensors.find(x => x.i === Number(m.deviceId));
        if (s && String(m.name || "") === "temperature") {
          const n = Number(m.value);
          if (!isNaN(n)) {
            s.temp = Math.round(n);
            updateClimateWidgets();
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
    ws.onclose = () => { ws = null; wsConnected = false; restartPolling(); scheduleReconnect(); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  function scheduleReconnect() {
    if (!cfg.useWebSocket) return;
    wsRetry = Math.min(wsRetry + 1, 6);
    const delay = Math.min(15000, 1000 * 2 ** wsRetry);
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
      hapticTap();
      if (tabMode && TAB_CATEGORIES.has(popup)) showTab(popup);
      else openQuickPopup(popup, title);
    });
  });
  if (QUICK_LIGHTS_BTN) {
    QUICK_LIGHTS_BTN.innerHTML = LIGHTS_SVG;
    QUICK_LIGHTS_BTN.addEventListener("click", () => {
      hapticTap();
      if (tabMode) showTab("lights");
    });
    QUICK_LIGHTS_BTN.hidden = !tabMode;
  }
  if (CENTRAL_TSTAT_BTN) {
    CENTRAL_TSTAT_BTN.innerHTML = CENTRAL_TSTAT_SVG + '<span>All thermostats</span>';
    CENTRAL_TSTAT_BTN.addEventListener("click", () => {
      hapticTap();
      openCentralTstatPopup();
    });
  }
  if (CENTRAL_MUSIC_BTN) {
    CENTRAL_MUSIC_BTN.innerHTML = CENTRAL_MUSIC_SVG + '<span>All music</span>';
    CENTRAL_MUSIC_BTN.addEventListener("click", () => {
      hapticTap();
      openMusicMasterPopup();
    });
  }
  if (tabMode) { ensureTabView(); updateTabActiveStates(); }
  if (location.protocol === "https:" && "serviceWorker" in navigator) {
    navigator.serviceWorker.register(withToken("sw.js"), { scope: "./" }).catch(() => {});
  }

  (async function init() {
    loadingState();
    try {
      const d = await fetchData();
      render(d);
      startPolling();
      startWS();
    } catch (e) {
      console.error("Dashboard init failed:", e);
      const detail = e?.message ? String(e.message) : "";
      setStatus("Cannot reach hub. Make sure you opened the dashboard via the app URL.", true);
      emptyState(
        '<div class="empty"><h2>Connection error</h2>' +
        'Could not load /data. Open this page through the Modern Dashboard app URL on your hub.' +
        (detail ? '<p class="empty-detail">' + detail.replace(/</g, "&lt;") + '</p>' : '') +
        '</div>'
      );
    }
  })();

})();
