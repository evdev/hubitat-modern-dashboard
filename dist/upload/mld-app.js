(() => {
  "use strict";

  const ROOMS_EL = document.getElementById("rooms");
  const SEARCH_EL = document.getElementById("search");
  const STATUS_EL = document.getElementById("status");
  const ALL_ON_BTN = document.getElementById("all-on");
  const ALL_OFF_BTN = document.getElementById("all-off");
  const ALL_ON_TRACK = document.getElementById("all-on-track");
  const ALL_OFF_TRACK = document.getElementById("all-off-track");
  const ALL_ON_RESTORE_BTN = document.getElementById("all-on-restore");
  const ALL_OFF_SAVE_BTN = document.getElementById("all-off-save");
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
  const MENU_DRAWER_EL = document.getElementById("menu-drawer");
  const MENU_THEME_SEGMENT = document.getElementById("menu-theme-segment");
  const MENU_OPEN_LOCAL_BTN = document.getElementById("menu-open-local");
  const MENU_OPEN_CLOUD_BTN = document.getElementById("menu-open-cloud");
  const MENU_LOCAL_URL_EL = document.getElementById("menu-local-url");
  const HAPTICS_STORAGE_KEY = "mld_haptics";
  const THEME_STORAGE_KEY = "mld_theme";
  const TABS_STORAGE_KEY = "mld_tabs";
  const DRAWER_STORAGE_KEY = "mld_drawer";
  const LOCAL_URL_STORAGE_KEY = "mld_localUrl";
  const LOCAL_OK_STORAGE_KEY = "mld_localOk";
  const CLOUD_URL_STORAGE_KEY = "mld_cloudUrl";
  const PREFER_CLOUD_STORAGE_KEY = "mld_preferCloud";
  const LOCAL_OK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const THEME_OPTIONS = ["dark", "light", "auto"];
  const APP_EL = document.getElementById("app");
  const REORDER_DRAG_THRESHOLD = 8;
  const DASHBOARD_TITLE_EL = document.getElementById("dashboard-title");
  const CURRENT_CATEGORY_TITLE_EL = document.getElementById("current-category-title");

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

  function loadDrawerPref() {
    try {
      const raw = localStorage.getItem(DRAWER_STORAGE_KEY);
      if (raw === "0") return false;
      if (raw === "1") return true;
    } catch {}
    return false;
  }

  function saveDrawerPref(on) {
    try { localStorage.setItem(DRAWER_STORAGE_KEY, on ? "1" : "0"); } catch {}
  }

  let cfg = { pollIntervalMs: POLL_DEFAULT, useWebSocket: false, theme: loadThemePref(), dashboardName: "mDash", roomOrder: null, navOrder: null, enableHaptics: loadHapticsPref(), enableTabs: loadTabsPref(), enableDrawer: loadDrawerPref(), localUrl: "", cloudUrl: "" };

  let localModeBannerEl = null;
  let localBannerDismissed = false;

  // state
  let rooms = [];            // [{id,name}]
  let roomMap = new Map();   // id -> name
  let devices = [];          // [{i,n,r,d,ct,s,l,k}]
  let devicesByRoom = new Map(); // roomId -> [device]
  let outletsByRoom = new Map(); // roomId -> [outlet]
  let devMap = new Map();    // id -> {el, data}
  let outletMap = new Map(); // id -> {el, data} (outlet tiles in rooms)
  let favDevMap = new Map(); // id -> {el, data} (favorites popup tiles)
  let roomEls = new Map();   // roomId -> {card, body, meta}
  let lastDataSig = "";
  let pollTimer = null;
  let ws = null;
  let wsConnected = false;
  let wsRetry = 0;
  let wsReconnectTimer = null;
  let pageWasHidden = false;
  let reorderMode = false;
  let reorderBusy = false;
  let reorderSnapshot = null;
  let reorderDraftOrder = null;
  let navReorderSnapshot = null;
  let navReorderDraftOrder = null;
  let navReorderDrawerRelocated = false;
  const navEls = new Map(); // navKey -> { wrap, btn, handle }

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
  let plainSwitches = [];        // [{i,n,r,s}] on/off only
  let outlets = [];              // [{i,n,r,s}] outlet devices from companion app
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
  let outletsSeparateTab = false;
  let unlockPinEnabled = false;
  let unlockPinRequired = false;
  let hsmLockUntil = 0;
  let pinPadPopup = null;
  let pinPadState = null;
  let confirmPopup = null;
  let confirmPending = null;
  let quickPopup = null;
  let quickPopupOpenType = null;

  function syncQuickPopupRef(el) {
    quickPopup = el;
    if (globalThis.__MLD) globalThis.__MLD.quickPopup = el;
  }

  // ---------- tab mode (inline tabs instead of popups) ----------
  const TAB_CATEGORIES = new Set(["favorites", "sensors", "thermostats", "music", "blinds", "outlets", "scheduling"]);
  const TAB_LABELS = { lights: "Lights", favorites: "Favorites", sensors: "Sensors", thermostats: "Thermostats", music: "Music", blinds: "Blinds", outlets: "Outlets", scheduling: "Scheduler" };
  let tabMode = cfg.enableTabs;
  let activeTab = "lights";
  let tabViewEl = null;
  const QUICK_LIGHTS_BTN = document.getElementById("quick-lights");
  let favTstatModeMenu = null;
  let favTstatModeMenuCleanup = null;
  let favTstatModeMenuId = null;
  let favTstatModeMenuAnchor = null;
  let centralTstatTargetMenu = null;
  let centralTstatTargetMenuCleanup = null;
  let centralTstatTargetMenuAnchor = null;
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
    } else {
      const out = outlets.find((d) => d.i === id);
      if (out) out.s = s;
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
      const dev = devices.find((d) => d.i === id) || outlets.find((d) => d.i === id);
      if (!dev) continue;
      const sMatch = !!dev.s === !!opt.s;
      const lMatch = opt.l === undefined || (opt.l === null && opt.s === 1) || dev.l === opt.l;
      if (sMatch && lMatch) {
        if (opt.timer) clearTimeout(opt.timer);
        switchOptimistic.delete(id);
        continue;
      }
      dev.s = opt.s;
      if (opt.l !== undefined && "l" in dev) dev.l = opt.l;
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
      if (postCall("currentCategory") === "blinds") postCall("renderBlindsPopup");
      else if (postCall("currentCategory") === "favorites") postCall("refreshFavoritesPopup");
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

  const activeSlideGestures = [];

  function cancelAllSlideGestures() {
    while (activeSlideGestures.length) activeSlideGestures[0]();
  }

  function appendPopup(el) {
    document.documentElement.appendChild(el);
  }

  function bindPopupDismiss(overlay, panel, closeBtn, onClose) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) onClose();
    });
    if (panel) panel.addEventListener("click", (e) => e.stopPropagation());
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        onClose();
      });
    }
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
    colorPopup.appendChild(panel);
    appendPopup(colorPopup);

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
    colorPopup._levelDimEl = levelDim;
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

    bindPopupDismiss(colorPopup, panel, closeBtn, () => closeColorPopup(true));
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
      canAdjust: () => colorSession && colorSession.tab === "level",
      levelFromEvent: (e) => levelFromTrackEvent(track, e),
      onAdjust: (level) => {
        colorSession.level = level;
        colorSession.changed = true;
        applyLevelChange(colorSession.id, level);
      },
      onCommit: (level) => {
        setLevelOptimistic(colorSession.id, level);
        sendCmd(colorSession.id, "setLevel", level);
      },
      throttleMs: 300,
    });
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
    bindCtTrackDrag(track, {
      canAdjust: () => colorSession && colorSession.tab === "ct",
      kFromEvent: (e) => kFromEvent(track, e),
      onAdjust: (k) => {
        colorSession.k = k;
        colorSession.changed = true;
        applyCtChange(colorSession.id, k);
      },
      onCommit: (k) => {
        sendCmd(colorSession.id, "setCT", k);
        ensureLightOn(colorSession.id);
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
    cancelAllSlideGestures();
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

  function isFavoriteableDeviceId(id) {
    const numId = Number(id);
    if (!Number.isFinite(numId) || numId < 0) return false;
    return devices.some((d) => d.i === numId)
      || outlets.some((o) => o.i === numId)
      || thermostats.some((t) => t.i === numId)
      || tempSensors.some((t) => t.i === numId)
      || sensors.some((s) => s.i === numId)
      || music.some((m) => m.i === numId)
      || locks.some((l) => l.i === numId)
      || windowShades.some((s) => s.i === numId);
  }

  function centralThermostatsSorted() {
    return thermostats.slice().sort((a, b) => {
      const labelA = postCall("roomLabel", a.r) || String(a.r ?? "");
      const labelB = postCall("roomLabel", b.r) || String(b.r ?? "");
      const ra = labelA.localeCompare(labelB);
      if (ra !== 0) return ra;
      return String(a.n || "").localeCompare(String(b.n || ""));
    });
  }

  function buildCentralTstat(selectedThermostats, unitHint) {
    const first = selectedThermostats[0];
    const union = (arr) => [...new Set(arr.flat())];
    return {
      i: -1, n: "All Thermostats", r: null,
      tm: "", os: "", hsp: null, csp: null, temp: null, u: first?.u ?? unitHint,
      hasFm: selectedThermostats.some((t) => t.hasFm), fm: "",
      hasFs: selectedThermostats.some(deviceHasFanSpeed), fs: "",
      fsLev: union(selectedThermostats.map(supportedFanSpeeds)).join(","),
      supM: union(selectedThermostats.map(supportedModes)).join(","),
      supFM: union(selectedThermostats.map(supportedFanModes)).join(","),
      _central: true,
    };
  }

  function applyCentralTstatSelection(selectedIds) {
    if (!tstatSession?.central) return;
    const allIds = tstatSession.allIds || thermostats.map((t) => t.i);
    const ids = selectedIds.filter((id) => allIds.includes(id));
    tstatSession.ids = ids;
    const selected = ids.map((id) => thermostats.find((t) => t.i === id)).filter(Boolean);
    tstatSession.centralTstat = buildCentralTstat(selected, tstatSession.unit);
    updateTstatHeadExtras();
    renderTstatDial();
    renderTstatControls();
    syncCentralTstatTargetMenu();
  }

  function updateCentralTstatTargetButton() {
    const btn = tstatPopup?._targetBtn;
    if (!btn) return;
    if (!tstatSession?.central) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    const labelEl = btn.querySelector(".tstat-target-btn-label");
    const allCount = (tstatSession.allIds || []).length;
    const selCount = tstatSession.ids.length;
    let label;
    if (selCount === 0) label = "No thermostats selected";
    else if (selCount === allCount) label = "All thermostats (" + allCount + ")";
    else if (selCount === 1) {
      const t = thermostats.find((x) => x.i === tstatSession.ids[0]);
      label = t?.n || "1 thermostat";
    } else label = selCount + " of " + allCount + " thermostats";
    if (labelEl) labelEl.textContent = label;
    btn.setAttribute("aria-label", "Choose thermostats to control: " + label);
  }

  function updateTstatHeadExtras() {
    updateCentralTstatTargetButton();
    const favBtn = tstatPopup?._favBtn;
    if (!favBtn || !tstatSession?.ids?.length) return;
    if (tstatSession.central || !isFavoriteableDeviceId(tstatSession.ids[0])) {
      favBtn.hidden = true;
      return;
    }
    favBtn.hidden = false;
    syncFavButton(favBtn, tstatSession.ids[0]);
  }

  function updateTstatFavButton() {
    updateTstatHeadExtras();
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
      if (centralTstatTargetMenu) closeCentralTstatTargetMenu();
      else openCentralTstatTargetMenu(targetBtn);
    });
    const favBtn = ce("button", "tstat-fav");
    favBtn.type = "button";
    favBtn.innerHTML = FAVORITES_SVG;
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (tstatSession?.central) return;
      const id = tstatSession?.ids?.[0];
      if (id == null || !isFavoriteableDeviceId(id)) return;
      hapticTap();
      postCall("toggleFavorite", id);
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
    appendPopup(tstatPopup);

    bindPopupDismiss(tstatPopup, panel, closeBtn, closeTstatPopup);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !tstatSession) return;
      if (centralTstatTargetMenu) { closeCentralTstatTargetMenu(); return; }
      closeTstatPopup();
    });

    tstatPopup._panel = panel;
    tstatPopup._title = title;
    tstatPopup._targetBtn = targetBtn;
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
    if (!tstatSession) return null;
    if (tstatSession.central) return tstatSession.centralTstat;
    if (!tstatSession.ids?.length) return null;
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
    const t = activeTstat();
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

    // disabled look when off or none selected for bulk
    const noneSelected = !!(tstatSession?.central && !tstatSession.ids?.length);
    popup._svg.classList.toggle("disabled", tm === "off" || noneSelected);
    const noMode = !!(tstatSession?.central && !tm);
    const canAdjust = tm !== "off" && !noMode && !noneSelected;
    if (popup._minusBtn) popup._minusBtn.disabled = !canAdjust;
    if (popup._plusBtn) popup._plusBtn.disabled = !canAdjust;
  }

  function renderTstatControls() {
    const popup = ensureTstatPopup();
    const t = activeTstat();
    if (!t) return;
    const noneSelected = !!(tstatSession?.central && !tstatSession.ids?.length);
    const supM = supportedModes(t);
    const tm = String(t.tm || "").toLowerCase();
    let modeCount = 0;
    for (const [key, btn] of Object.entries(popup._modeBtns)) {
      const show = supM.includes(key);
      btn.hidden = !show;
      if (show) modeCount++;
      btn.classList.toggle("active", tm === key);
      btn.disabled = noneSelected;
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
        btn.disabled = noneSelected;
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
      if (!t || !tstatSession || !tstatSession.ids?.length) return;
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
      if (!t || !tstatSession || !tstatSession.ids?.length) return;
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

  function closeCentralTstatTargetMenu() {
    if (centralTstatTargetMenuCleanup) {
      centralTstatTargetMenuCleanup();
      centralTstatTargetMenuCleanup = null;
    }
    if (centralTstatTargetMenu) {
      centralTstatTargetMenu.remove();
      centralTstatTargetMenu = null;
    }
    centralTstatTargetMenuAnchor = null;
  }

  function repositionCentralTstatTargetMenu() {
    const menu = centralTstatTargetMenu;
    const anchorBtn = centralTstatTargetMenuAnchor;
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
    if (!centralTstatTargetMenu || !tstatSession?.central) return;
    const allIds = tstatSession.allIds || [];
    const selectedSet = new Set(tstatSession.ids);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedSet.has(id));
    const selectAllBtn = centralTstatTargetMenu.querySelector(".tstat-target-all");
    if (selectAllBtn) {
      selectAllBtn.classList.toggle("active", allSelected);
      selectAllBtn.setAttribute("aria-selected", allSelected ? "true" : "false");
    }
    for (const b of centralTstatTargetMenu.querySelectorAll(".tstat-target-opt:not(.tstat-target-all)")) {
      const id = Number(b.dataset.tstatId);
      const on = selectedSet.has(id);
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-selected", "true");
      else b.removeAttribute("aria-selected");
    }
  }

  function openCentralTstatTargetMenu(anchorBtn) {
    closeCentralTstatTargetMenu();
    if (!tstatSession?.central) return;

    const menu = ce("div", "tstat-target-menu");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-multiselectable", "true");

    const allIds = tstatSession.allIds || thermostats.map((t) => t.i);
    const selectedSet = new Set(tstatSession.ids);
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
      const currentSelected = new Set(tstatSession.ids);
      const currentlyAll = allIds.length > 0 && allIds.every((id) => currentSelected.has(id));
      applyCentralTstatSelection(currentlyAll ? [] : allIds.slice());
    });
    menu.appendChild(selectAllBtn);

    for (const t of centralThermostatsSorted()) {
      const b = ce("button", "tstat-target-opt");
      b.type = "button";
      b.setAttribute("role", "option");
      b.dataset.tstatId = String(t.i);
      const check = ce("span", "tstat-target-check");
      const info = ce("span", "tstat-target-info");
      const name = ce("span", "tstat-target-name");
      name.textContent = t.n || ("Thermostat " + t.i);
      const room = ce("span", "tstat-target-room");
      room.textContent = postCall("roomLabel", t.r) || String(t.r ?? "");
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
        const next = new Set(tstatSession.ids);
        if (next.has(t.i)) next.delete(t.i);
        else next.add(t.i);
        applyCentralTstatSelection([...next]);
      });
      menu.appendChild(b);
    }

    document.body.appendChild(menu);
    centralTstatTargetMenu = menu;
    centralTstatTargetMenuAnchor = anchorBtn;
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

    centralTstatTargetMenuCleanup = () => {
      document.removeEventListener("click", onOutside);
      document.removeEventListener("keydown", onKey);
      anchorBtn.setAttribute("aria-expanded", "false");
      centralTstatTargetMenuAnchor = null;
    };
  }

  function setTstatMode(cmd, key) {
    if (!tstatSession || !tstatSession.ids?.length) return;
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
    if (!tstatSession || !tstatSession.ids?.length) return;
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
    if (!tstatSession || !tstatSession.ids?.length) return;
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
    cancelAllSlideGestures();
    closeTstatPopup();
    if (colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    if (!thermostats.length) return;
    const ids = thermostats.map((t) => t.i);
    const first = thermostats[0];
    tstatSession = {
      rid: null,
      anchorEl: CENTRAL_TSTAT_BTN,
      ids: ids.slice(),
      allIds: ids.slice(),
      unit: normalizeTstatUnit(first?.u),
      edit: "heat",
      central: true,
      centralTstat: buildCentralTstat(thermostats, normalizeTstatUnit(first?.u)),
    };
    const popup = ensureTstatPopup();
    renderTstatDial();
    renderTstatControls();
    updateTstatHeadExtras();
    positionTstatPopup(CENTRAL_TSTAT_BTN);
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    publishMld({ tstatSession, tstatPopup: popup });
  }

  function openTstatPopup(rid, anchorEl) {
    cancelAllSlideGestures();
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
    closeCentralTstatTargetMenu();
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
    head.appendChild(title);
    head.appendChild(closeBtn);

    const body = ce("div", "music-master-body");
    panel.appendChild(head);
    panel.appendChild(body);
    popup.appendChild(panel);
    appendPopup(popup);

    bindPopupDismiss(popup, panel, closeBtn, closeMusicMasterPopup);
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
    cancelAllSlideGestures();
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
      return !!document.querySelector(
        ".quick-popup.open, .ct-popup.open, .tstat-popup.open, .music-master-popup.open, .confirm-popup.open, .pin-pad-popup.open"
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
    try { return localStorage.getItem(LOCAL_URL_STORAGE_KEY) || ""; } catch { return ""; }
  }

  function saveStoredLocalUrl(url) {
    try {
      const v = String(url || "").trim();
      if (v) localStorage.setItem(LOCAL_URL_STORAGE_KEY, v);
      else localStorage.removeItem(LOCAL_URL_STORAGE_KEY);
    } catch {}
  }

  function loadStoredCloudUrl() {
    try { return localStorage.getItem(CLOUD_URL_STORAGE_KEY) || ""; } catch { return ""; }
  }

  function saveStoredCloudUrl(url) {
    try {
      const v = String(url || "").trim();
      if (v) localStorage.setItem(CLOUD_URL_STORAGE_KEY, v);
      else localStorage.removeItem(CLOUD_URL_STORAGE_KEY);
    } catch {}
  }

  function preferCloudMode() {
    try { return localStorage.getItem(PREFER_CLOUD_STORAGE_KEY) === "1"; } catch { return false; }
  }

  function setPreferCloudMode(on) {
    try {
      if (on) localStorage.setItem(PREFER_CLOUD_STORAGE_KEY, "1");
      else localStorage.removeItem(PREFER_CLOUD_STORAGE_KEY);
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

  function loadLocalOkTs() {
    try {
      const n = Number(localStorage.getItem(LOCAL_OK_STORAGE_KEY));
      return Number.isFinite(n) ? n : 0;
    } catch { return 0; }
  }

  function saveLocalOkTs(ts) {
    try { localStorage.setItem(LOCAL_OK_STORAGE_KEY, String(ts || Date.now())); } catch {}
  }

  function localOkFresh() {
    const ts = loadLocalOkTs();
    return ts > 0 && (Date.now() - ts) < LOCAL_OK_MAX_AGE_MS;
  }

  function refreshLocalUrlFromConfig() {
    if (cfg.localUrl) {
      saveStoredLocalUrl(cfg.localUrl);
      if (MENU_LOCAL_URL_EL && document.activeElement !== MENU_LOCAL_URL_EL) {
        MENU_LOCAL_URL_EL.value = cfg.localUrl;
      }
    }
    if (cfg.cloudUrl) saveStoredCloudUrl(cfg.cloudUrl);
  }

  function navigateToLocal(url, remember) {
    const target = String(url || loadStoredLocalUrl() || "").trim();
    if (!target) return false;
    setPreferCloudMode(false);
    if (remember !== false && isCloudOrigin()) saveLocalOkTs(Date.now());
    location.replace(target);
    return true;
  }

  function maybeRefreshLocalOkFromReferrer() {
    if (!isCloudOrigin()) return;
    try {
      const ref = document.referrer;
      if (!ref || ref.includes("cloud.hubitat.com")) return;
      const refUrl = new URL(ref);
      if (refUrl.protocol === "http:" && refUrl.hostname !== "cloud.hubitat.com") {
        saveLocalOkTs(Date.now());
      }
    } catch {}
  }

  function navigateToCloud() {
    let target = String(cfg.cloudUrl || loadStoredCloudUrl() || "").trim();
    if (!target) return false;
    setPreferCloudMode(true);
    const sep = target.includes("?") ? "&" : "?";
    target = target + sep + "mld_prefer_cloud=1";
    location.replace(target);
    return true;
  }

  function updateLocalModeMenuUI() {
    const localUrl = loadStoredLocalUrl() || cfg.localUrl || "";
    const onCloud = isCloudOrigin();
    const onLocal = isLocalOrigin();
    if (MENU_OPEN_LOCAL_BTN) {
      MENU_OPEN_LOCAL_BTN.hidden = !(onCloud && !!localUrl);
    }
    if (MENU_OPEN_CLOUD_BTN) {
      MENU_OPEN_CLOUD_BTN.hidden = !(onLocal && !!cfg.cloudUrl);
    }
    if (MENU_LOCAL_URL_EL && document.activeElement !== MENU_LOCAL_URL_EL) {
      MENU_LOCAL_URL_EL.value = localUrl;
    }
  }

  function hideLocalModeBanner() {
    if (localModeBannerEl) {
      localModeBannerEl.remove();
      localModeBannerEl = null;
    }
  }

  function showLocalModeBanner() {
    if (localModeBannerEl || localBannerDismissed || !isCloudOrigin() || !isAndroid()) return;
    const localUrl = loadStoredLocalUrl();
    if (!localUrl) return;

    const banner = document.createElement("div");
    banner.className = "local-mode-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Switch to local mode");

    const text = document.createElement("span");
    text.className = "local-mode-banner-text";
    text.textContent = "You're home — switch to faster local mode?";

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
      localBannerDismissed = true;
      hideLocalModeBanner();
    });

    banner.appendChild(text);
    banner.appendChild(switchBtn);
    banner.appendChild(dismissBtn);

    if (APP_EL && ROOMS_EL) APP_EL.insertBefore(banner, ROOMS_EL);
    else if (APP_EL) APP_EL.appendChild(banner);
    localModeBannerEl = banner;
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

    maybeRefreshLocalOkFromReferrer();

    const localUrl = loadStoredLocalUrl();
    if (!localUrl) {
      updateLocalModeMenuUI();
      return false;
    }

    if (isAndroid()) {
      if (localOkFresh()) return navigateToLocal(localUrl, false);
      showLocalModeBanner();
    }

    updateLocalModeMenuUI();
    return false;
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

  async function fetchWithTimeout(url, opts = {}, ms = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function getJson(url) {
    const r = await fetchWithTimeout(withToken(url), { cache: "no-store", headers: { "Accept": "application/json" } });
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
      if (!reorderMode && Array.isArray(d.config.navOrder)) {
        cfg.navOrder = d.config.navOrder.length ? d.config.navOrder : null;
        applyNavOrder(getDisplayNavOrder());
      }
      if (d.config.localUrl != null) cfg.localUrl = String(d.config.localUrl || "");
      if (d.config.cloudUrl != null) cfg.cloudUrl = String(d.config.cloudUrl || "");
    }
    if (globalThis.__MLD) {
      const schedHook = globalThis.__MLD["applySchedules" + "FromData"];
      if (typeof schedHook === "function") schedHook(d);
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

  function rebuildOutletsByRoom() {
    outletsByRoom.clear();
    for (const out of outlets) {
      const rid = normalizeRoomId(out.r);
      if (!outletsByRoom.has(rid)) outletsByRoom.set(rid, []);
      outletsByRoom.get(rid).push(out);
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
  const sensorCardMap = new Map(); // id -> { el, heroEl, pillEl, pillTxt, dot, footEl, batteryEl, favBtn, t, i }
  const favSensorMap = new Map(); // id -> sensor card rec (favorites popup)
  const favMusicMap = new Map(); // id -> music row rec (favorites popup)
  const favLockMap = new Map(); // id -> lock row rec (favorites popup)
  const favShadeMap = new Map(); // id -> shade tile rec (favorites popup)
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

  function ensureRoomsFromDevices() {
    if (rooms.length) return;
    const byId = new Map();
    const addRef = (item) => {
      const id = normalizeRoomId(item?.r);
      if (id === -1) return;
      if (!byId.has(id)) byId.set(id, { id, name: "Room " + id });
    };
    for (const dev of devices) addRef(dev);
    for (const out of outlets) addRef(out);
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
    if (outletsInLightsRooms()) {
      for (const rid of outletsByRoom.keys()) ids.add(rid);
    }
    for (const rid of thermoByRoom.keys()) ids.add(rid);
    for (const rid of sensorByRoom.keys()) ids.add(rid);
    return ids;
  }

  function outletsInLightsRooms() {
    return !outletsSeparateTab;
  }

  function getDisplayRoomIds(groups, hasContent) {
    const knownIds = new Set(rooms.map(r => r.id));
    const allIds = new Set(knownIds);
    for (const id of contentRoomIds()) allIds.add(id);
    const hasUnassigned = groups.has(-1) || (outletsInLightsRooms() && outletsByRoom.has(-1)) || roomHasClimate(-1);
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

  function getDefaultNavOrder() {
    return ["lights", ...QUICK_NAV.map(n => n.popup)];
  }

  function getDisplayNavOrder() {
    const defaults = getDefaultNavOrder();
    if (!cfg.navOrder?.length) return defaults.slice();
    const known = new Set(defaults);
    const order = cfg.navOrder.filter(k => known.has(k));
    for (const key of defaults) {
      if (!order.includes(key)) order.push(key);
    }
    return order;
  }

  function applyNavOrder(order) {
    const nav = document.querySelector(".quick-nav");
    if (!nav) return;
    for (const key of order) {
      const rec = navEls.get(key);
      if (rec?.wrap) nav.appendChild(rec.wrap);
    }
  }
  globalThis.__MLD = { ROOMS_EL, SEARCH_EL, STATUS_EL, ALL_ON_BTN, ALL_OFF_BTN, ALL_ON_TRACK, ALL_OFF_TRACK, ALL_ON_RESTORE_BTN, ALL_OFF_SAVE_BTN, CENTRAL_TSTAT_BTN, CENTRAL_MUSIC_BTN, EXPAND_ALL_BTN, REORDER_DONE_BTN, REORDER_CANCEL_BTN, OVERFLOW_BTN, OVERFLOW_MENU, MENU_REORDER_BTN, MENU_HAPTICS_EL, MENU_TABS_EL, MENU_DRAWER_EL, MENU_THEME_SEGMENT, MENU_OPEN_LOCAL_BTN, MENU_OPEN_CLOUD_BTN, MENU_LOCAL_URL_EL, HAPTICS_STORAGE_KEY, THEME_STORAGE_KEY, TABS_STORAGE_KEY, DRAWER_STORAGE_KEY, LOCAL_URL_STORAGE_KEY, LOCAL_OK_STORAGE_KEY, CLOUD_URL_STORAGE_KEY, PREFER_CLOUD_STORAGE_KEY, LOCAL_OK_MAX_AGE_MS, THEME_OPTIONS, APP_EL, REORDER_DRAG_THRESHOLD, DASHBOARD_TITLE_EL, CURRENT_CATEGORY_TITLE_EL, POLL_DEFAULT, POLL_WS_FALLBACK, loadHapticsPref, saveHapticsPref, loadThemePref, saveThemePref, loadTabsPref, saveTabsPref, loadDrawerPref, saveDrawerPref, cfg, localModeBannerEl, localBannerDismissed, rooms, roomMap, devices, devicesByRoom, outletsByRoom, devMap, outletMap, favDevMap, roomEls, lastDataSig, pollTimer, ws, wsConnected, wsRetry, wsReconnectTimer, pageWasHidden, reorderMode, reorderBusy, reorderSnapshot, reorderDraftOrder, navReorderSnapshot, navReorderDraftOrder, navReorderDrawerRelocated, navEls, colorPopup, colorSession, levelOptimistic, switchOptimistic, lockOptimistic, shadeOptimistic, musicOptimistic, setpointOptimistic, rgbWheelCache, thermostats, tempSensors, thermoByRoom, sensorByRoom, climateEls, tstatPopup, tstatSession, tstatDeviceModeLock, musicMasterPopup, MUSIC_VOL_STEP, hubModes, currentHubMode, scenes, locks, windowShades, plainSwitches, outlets, music, favorites, snapshots, roomGestureLockCount, hubModeLockUntil, hsmStatus, hsmAlert, hsmAlertDesc, hsmEnabled, hsmPinRequired, thermostatsPopupEnabled, outletsSeparateTab, unlockPinEnabled, unlockPinRequired, hsmLockUntil, pinPadPopup, pinPadState, confirmPopup, confirmPending, quickPopup, quickPopupOpenType, syncQuickPopupRef, TAB_CATEGORIES, TAB_LABELS, tabMode, activeTab, tabViewEl, QUICK_LIGHTS_BTN, favTstatModeMenu, favTstatModeMenuCleanup, favTstatModeMenuId, favTstatModeMenuAnchor, centralTstatTargetMenu, centralTstatTargetMenuCleanup, centralTstatTargetMenuAnchor, favTstatMap, favPopupSig, tstatsPopupMap, tstatsPopupSig, setLevelOptimistic, setSwitchOptimistic, clearSwitchOptimistic, reapplySwitchOptimistic, effectiveSwitch, effectiveLevel, setLockOptimistic, clearLockOptimistic, reapplyLockOptimistic, effectiveLock, lockStatusLabel, setShadeOptimistic, clearShadeOptimistic, reapplyShadeOptimistic, effectiveShadeState, effectiveShadePosition, shadeIsMoving, shadeStatusLabel, isMusicPlaying, musicControls, effectiveMusicStatus, effectiveMusicVolume, musicStatusLabel, setMusicOptimistic, clearMusicOptimistic, reapplyMusicOptimistic, setSetpointOptimistic, clearSetpointOptimistic, reapplySetpointOptimistic, applyTstatSetpoints, drawRgbWheel, activeSlideGestures, cancelAllSlideGestures, appendPopup, bindPopupDismiss, ensureColorPopup, setColorTab, updateColorPopupUI, tileRecsFor, applyLevelChange, applyCtChange, applyRgbChange, attachCtPresets, attachLevelPresets, trackPctFromEvent, levelFromTrackEvent, updateLevelTrackVisual, bindLevelTrackDrag, makeLevelTrackSlider, updateCtTrackVisual, bindCtTrackDrag, makeCtTrackSlider, attachLevelTrackDrag, attachRgbPresets, attachRgbWheel, ensureLightOn, attachCtTrackDrag, kToPct, pctToK, kFromEvent, setCtVisual, setRgbVisual, setLevelVisual, openColorPopup, closeColorPopup, closeCtPopup, supportedModes, supportedFanModes, deviceHasFanSpeed, supportedFanSpeeds, showFanSpeedControls, fanModeActive, tstatSectionLabel, tstatStateClass, formatRoomTemp, roomClimateInfo, roomHasClimate, roomTstatState, isFavorite, syncFavButton, isFavoriteableDeviceId, centralThermostatsSorted, buildCentralTstat, applyCentralTstatSelection, updateCentralTstatTargetButton, updateTstatHeadExtras, updateTstatFavButton, postCall, ensureTstatPopup, activeTstat, tstatSetpointTarget, commitTstatSetpoint, adjustTstatSetpoint, renderTstatDial, renderTstatControls, attachTstatDialDrag, tstatModeLocked, reapplyTstatDeviceModeLocks, tstatModeDisplayLabel, favoriteTstatTarget, favoriteTstatTemps, favoriteTstatState, modeCmdForKey, applyTstatModeOptimistic, sendTstatModeCmd, adjustFavoriteTstat, refreshOpenTstatQuickPopups, closeFavoriteTstatModeMenu, repositionFavoriteTstatModeMenu, syncFavoriteTstatModeMenu, applyFavoriteTstatMode, openFavoriteTstatModeMenu, closeCentralTstatTargetMenu, repositionCentralTstatTargetMenu, syncCentralTstatTargetMenu, openCentralTstatTargetMenu, setTstatMode, setFanMode, setFanSpeed, positionTstatPopup, openCentralTstatPopup, openTstatPopup, closeTstatPopup, ensureMusicMasterPopup, renderMusicMasterBody, openMusicMasterPopup, closeMusicMasterPopup, reconcileTstat, updateClimateWidgets, setStatus, flash, hapticTap, effectiveTheme, updateThemeSegmentUI, applyTheme, applyDashboardName, isCloudOrigin, isLocalOrigin, isAndroid, isStandaloneDisplay, initAndroidLocalImmersive, loadStoredLocalUrl, saveStoredLocalUrl, loadStoredCloudUrl, saveStoredCloudUrl, preferCloudMode, setPreferCloudMode, consumePreferCloudParam, loadLocalOkTs, saveLocalOkTs, localOkFresh, refreshLocalUrlFromConfig, navigateToLocal, maybeRefreshLocalOkFromReferrer, navigateToCloud, updateLocalModeMenuUI, hideLocalModeBanner, showLocalModeBanner, applyLocalModeStrategy, ACCESS_TOKEN, withToken, fetchWithTimeout, getJson, fetchData, sendCmd, sendCmdBatch, publishMld, rebuildDevicesByRoom, rebuildOutletsByRoom, applyTstatSessionModeLock, sensors, sensorCardMap, favSensorMap, favMusicMap, favLockMap, favShadeMap, sensorsPopupSig, sensorTypeFilter, sensorFilterOpen, sensorFilterChipsEl, sensorFilterBtnEl, sensorFilterEmptyEl, replaceList, repopulateThermoByRoom, repopulateSensorByRoom, syncRoomMap, emptyState, loadingState, noDevicesState, sortRoomsByOrder, ensureRoomsFromDevices, contentRoomIds, outletsInLightsRooms, getDisplayRoomIds, getDefaultNavOrder, getDisplayNavOrder, applyNavOrder };
})();
