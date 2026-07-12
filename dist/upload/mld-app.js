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
  const DASH_SESSION_STORAGE_KEY = "mld_dashSession";
  const DASH_SESSION_EXPIRES_KEY = "mld_dashSessionExpiresAt";
  const LOCAL_OK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const DASH_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
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
    return true;
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
  const garageOptimistic = new Map(); // garage id -> { st, until, timer }
  const shadeOptimistic = new Map(); // shade id -> { st?, pos?, until, timer }
  const valveOptimistic = new Map(); // valve id -> { st?, until, timer }
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
  let garageDoors = [];
  let windowShades = [];
  let valves = [];
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
  let gatePopup = null;
  let gateState = null;
  let dashSession = "";
  let dashSessionExpiresAt = 0;
  let dashboardPasswordRequired = false;
  let dashSessionActivityBound = false;
  let ensureDashboardAccessTask = null;
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

  function setGarageOptimistic(id, patch) {
    const prev = garageOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const door = garageDoors.find((g) => g.i === id);
    if (door && patch.st != null) door.st = patch.st;
    const entry = {
      st: patch.st != null ? patch.st : prev?.st,
      until: Date.now() + LEVEL_OPTIMISTIC_MS,
      timer: null,
    };
    entry.timer = setTimeout(() => {
      garageOptimistic.delete(id);
      if (postCall("currentCategory") === "locks") postCall("renderLocksPopup");
    }, LEVEL_OPTIMISTIC_MS);
    garageOptimistic.set(id, entry);
  }

  function clearGarageOptimistic(id) {
    const prev = garageOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    garageOptimistic.delete(id);
  }

  function reapplyGarageOptimistic() {
    for (const [id, opt] of garageOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        garageOptimistic.delete(id);
        continue;
      }
      const door = garageDoors.find((g) => g.i === id);
      if (!door) continue;
      if (opt.st != null && door.st === opt.st) {
        if (opt.timer) clearTimeout(opt.timer);
        garageOptimistic.delete(id);
        continue;
      }
      if (opt.st != null) door.st = opt.st;
    }
  }

  function effectiveGarageState(door) {
    const opt = garageOptimistic.get(door.i);
    if (opt && Date.now() < opt.until && opt.st != null) return opt.st;
    return door.st || "unknown";
  }

  function garageIsOpen(door) {
    const st = effectiveGarageState(door);
    return st === "open" || st === "opening";
  }

  function garageIsMoving(door) {
    const st = effectiveGarageState(door);
    return st === "opening" || st === "closing";
  }

  function garageStatusLabel(door) {
    const st = effectiveGarageState(door);
    if (st === "opening") return "Opening…";
    if (st === "closing") return "Closing…";
    if (st === "open") return "Open";
    if (st === "closed") return "Closed";
    if (st === "unknown" || st === "unavailable") return st.charAt(0).toUpperCase() + st.slice(1);
    return st || "—";
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

  function setValveOptimistic(id, patch) {
    const prev = valveOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const valve = valves.find((v) => v.i === id);
    if (valve && patch.st != null) valve.st = patch.st;
    const entry = {
      st: patch.st != null ? patch.st : prev?.st,
      until: Date.now() + LEVEL_OPTIMISTIC_MS,
      timer: null,
    };
    entry.timer = setTimeout(() => {
      valveOptimistic.delete(id);
      if (postCall("currentCategory") === "sensors") postCall("refreshSensorsPopup");
      else if (postCall("currentCategory") === "favorites") postCall("refreshFavoritesPopup");
    }, LEVEL_OPTIMISTIC_MS);
    valveOptimistic.set(id, entry);
  }

  function clearValveOptimistic(id) {
    const prev = valveOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    valveOptimistic.delete(id);
  }

  function reapplyValveOptimistic() {
    for (const [id, opt] of valveOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        valveOptimistic.delete(id);
        continue;
      }
      const valve = valves.find((v) => v.i === id);
      if (!valve) continue;
      if (opt.st != null && valve.st === opt.st) {
        if (opt.timer) clearTimeout(opt.timer);
        valveOptimistic.delete(id);
        continue;
      }
      if (opt.st != null) valve.st = opt.st;
    }
  }

  function effectiveValveState(valve) {
    const opt = valveOptimistic.get(valve.i);
    if (opt && Date.now() < opt.until && opt.st != null) return opt.st;
    return valve.st || "unknown";
  }

  function valveIsMoving(valve) {
    const st = effectiveValveState(valve);
    return st === "opening" || st === "closing";
  }

  function normalizeValveForCard(valve) {
    const st = effectiveValveState(valve);
    return { i: valve.i, n: valve.n, r: valve.r, t: "valve", v: st, a: st === "open" ? 1 : 0, ex: [], _ref: valve };
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
        postCall("renderTstatDial");
        postCall("updateClimateWidgets");
      }
      postCall("refreshOpenTstatQuickPopups");
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

  function supportedModes(t) {
    if (t?.supM == null) return TSTAT_DEFAULT_MODES;
    return parseList(t.supM);
  }

  function supportedFanModes(t) {
    // null/undefined = attribute missing → defaults when device has fan mode.
    // "" or [] = driver reported none → show no fan mode controls.
    if (t?.supFM == null) return t?.hasFm ? TSTAT_DEFAULT_FAN_MODES : [];
    return parseList(t.supFM);
  }

  function intersectSupportedLists(lists) {
    const cleaned = lists.map((list) => (Array.isArray(list) ? list : [])).filter((list) => list.length);
    if (!cleaned.length) return [];
    return cleaned.reduce((acc, list) => acc.filter((item) => list.includes(item)));
  }

  function buildMultiTstatView(selectedThermostats, unitHint) {
    const first = selectedThermostats[0];
    return {
      i: -2,
      n: selectedThermostats.length === 1 ? (first?.n || "Thermostat") : (selectedThermostats.length + " thermostats"),
      r: first?.r ?? null,
      tm: selectedThermostats.length === 1 ? (first?.tm || "") : "",
      os: selectedThermostats.length === 1 ? (first?.os || "") : "",
      hsp: selectedThermostats.length === 1 ? first?.hsp : null,
      csp: selectedThermostats.length === 1 ? first?.csp : null,
      temp: selectedThermostats.length === 1 ? first?.temp : null,
      u: first?.u ?? unitHint,
      hasFm: selectedThermostats.some((t) => t.hasFm),
      fm: selectedThermostats.length === 1 ? (first?.fm || "") : "",
      hasFs: selectedThermostats.some(deviceHasFanSpeed),
      fs: selectedThermostats.length === 1 ? (first?.fs || "") : "",
      fsLev: intersectSupportedLists(selectedThermostats.map(supportedFanSpeeds)).join(","),
      // Only modes every selected device supports — avoids offering Cool on a heat-only HVAC.
      supM: intersectSupportedLists(selectedThermostats.map(supportedModes)).join(","),
      supFM: (() => {
        const present = selectedThermostats.filter((t) => t.supFM != null);
        if (!present.length) return null;
        return intersectSupportedLists(present.map(supportedFanModes)).join(",");
      })(),
      _multi: true,
    };
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
      || garageDoors.some((g) => g.i === numId)
      || windowShades.some((s) => s.i === numId)
      || valves.some((v) => v.i === numId);
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

  function postCall(name, ...args) {
    const fn = globalThis.__MLD?.[name];
    if (typeof fn === "function") return fn(...args);
  }


  // ---------- Dashboard session + API (bootstrap) ----------

  function loadDashSession() {
    try {
      dashSession = localStorage.getItem(DASH_SESSION_STORAGE_KEY) || "";
      dashSessionExpiresAt = Number(localStorage.getItem(DASH_SESSION_EXPIRES_KEY)) || 0;
    } catch {
      dashSession = "";
      dashSessionExpiresAt = 0;
    }
    publishMld({ dashSession: dashSession, dashSessionExpiresAt: dashSessionExpiresAt });
  }

  function saveDashSession(session, expiresAt) {
    dashSession = String(session || "");
    const exp = Number(expiresAt);
    dashSessionExpiresAt = Number.isFinite(exp) && exp > 0 ? exp : 0;
    try {
      if (dashSession) {
        localStorage.setItem(DASH_SESSION_STORAGE_KEY, dashSession);
        localStorage.setItem(DASH_SESSION_EXPIRES_KEY, String(dashSessionExpiresAt));
      } else {
        localStorage.removeItem(DASH_SESSION_STORAGE_KEY);
        localStorage.removeItem(DASH_SESSION_EXPIRES_KEY);
      }
    } catch {}
    publishMld({ dashSession: dashSession, dashSessionExpiresAt: dashSessionExpiresAt });
  }

  function clearDashSession() {
    saveDashSession("", 0);
  }

  function isDashSessionFresh() {
    return !!dashSession && dashSessionExpiresAt > Date.now();
  }

  let dashSessionRenewInFlight = null;
  let dashSessionLastRenewAt = 0;
  const DASH_SESSION_RENEW_MIN_INTERVAL_MS = 60 * 60 * 1000; // at most hourly

  async function renewDashSessionFromServer(force) {
    if (!dashSession || !isDashSessionFresh()) return false;
    const now = Date.now();
    if (!force && now - dashSessionLastRenewAt < DASH_SESSION_RENEW_MIN_INTERVAL_MS) return true;
    if (dashSessionRenewInFlight) return dashSessionRenewInFlight;
    dashSessionRenewInFlight = (async () => {
      try {
        const r = await fetchWithTimeout(withToken("auth/renew"), {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (r.status === 401) {
          clearDashSession();
          return false;
        }
        if (!r.ok) return false;
        const data = await r.json();
        applyDashSessionFromResponse(data);
        dashSessionLastRenewAt = Date.now();
        return isDashSessionFresh();
      } catch {
        return false;
      } finally {
        dashSessionRenewInFlight = null;
      }
    })();
    return dashSessionRenewInFlight;
  }

  function slideDashSessionExpiry() {
    if (!dashSession) return;
    // Server is authoritative — ask it to slide the 7-day window (throttled).
    renewDashSessionFromServer(false);
  }

  function applyDashSessionFromResponse(data) {
    if (!data) return;
    const session = data.session || data.dashSession;
    if (!session) return;
    const expiresAt = data.expiresAt ?? data.dashSessionExpiresAt;
    saveDashSession(session, expiresAt);
  }

  function isDashboardGateOpen() {
    return !!gatePopup?.classList.contains("open");
  }

  function setupDashSessionActivityRenewal() {
    if (dashSessionActivityBound) return;
    dashSessionActivityBound = true;
    const renew = () => {
      if (!isDashSessionFresh()) return;
      slideDashSessionExpiry();
    };
    document.addEventListener("pointerdown", renew, { passive: true });
    document.addEventListener("keydown", renew);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") renewDashSessionFromServer(true);
    });
  }


  // ---------- API (OAuth: access_token required on every request, especially cloud) ----------
  const ACCESS_TOKEN = (() => {
    try { return new URLSearchParams(location.search).get("access_token") || ""; }
    catch { return ""; }
  })();

  function withToken(path) {
    if (!dashSession) loadDashSession();
    const parts = [];
    if (ACCESS_TOKEN) parts.push("access_token=" + encodeURIComponent(ACCESS_TOKEN));
    if (dashSession && isDashSessionFresh()) {
      parts.push("dash_session=" + encodeURIComponent(dashSession));
    }
    if (!parts.length) return path;
    const sep = path.indexOf("?") >= 0 ? "&" : "?";
    return path + sep + parts.join("&");
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

  async function getJson(url, authPass) {
    const pass = authPass || 0;
    const r = await fetchWithTimeout(withToken(url), { cache: "no-store", headers: { "Accept": "application/json" } });
    if (r.status === 401) {
      // First 401: reload any just-saved session and retry before prompting again.
      // Clearing first caused a second password prompt when /data raced unlock.
      if (pass === 0) {
        loadDashSession();
        if (isDashSessionFresh()) return getJson(url, 1);
      }
      clearDashSession();
      await postCall("ensureDashboardAccess");
      if (pass < 2) return getJson(url, pass + 1);
      const err = new Error("auth required");
      err.code = "auth_required";
      throw err;
    }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    applyDashSessionFromResponse(data);
    return data;
  }

  async function fetchData() {
    const d = await getJson("data");
    if (d && d.config) {
      if (d.config.pollIntervalMs) cfg.pollIntervalMs = d.config.pollIntervalMs;
      if (typeof d.config.useWebSocket === "boolean") cfg.useWebSocket = d.config.useWebSocket;
      if (d.config.dashboardName != null) postCall("applyDashboardName", d.config.dashboardName);
      if (!reorderMode && Array.isArray(d.config.roomOrder)) {
        cfg.roomOrder = d.config.roomOrder.length ? d.config.roomOrder : null;
      }
      if (!reorderMode && Array.isArray(d.config.navOrder)) {
        cfg.navOrder = d.config.navOrder.length ? d.config.navOrder : null;
        postCall("applyNavOrder", postCall("getDisplayNavOrder"));
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
        if (r.status !== 403 && msg !== "wrong pin") postCall("flash", msg, true);
        return { ok: false, status: r.status, error: msg };
      }
      return { ok: true };
    } catch (e) { postCall("flash", "Command failed", true); return { ok: false }; }
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
        postCall("flash", "Command failed", true);
        return { ok: false, failed: commands.length, total: commands.length };
      }
      if (data.failed > 0) {
        postCall("flash", data.failed + " of " + data.total + " command(s) failed", true);
      }
      return data;
    } catch (e) {
      postCall("flash", "Command failed", true);
      return { ok: false, failed: commands.length, total: commands.length };
    }
  }

  function publishMld(patch) {
    const m = globalThis.__MLD;
    if (m) Object.assign(m, patch);
  }


  // Sensors (other-sensor pickers): [{i,n,r,t,v,a,ex:[{k,v,u?}]}]
  let sensors = [];
  const sensorCardMap = new Map(); // id -> { el, heroEl, pillEl, pillTxt, dot, footEl, batteryEl, favBtn, t, i }
  const sensorRoomEls = new Map(); // roomId -> { card, body, meta }
  const favSensorMap = new Map(); // id -> sensor card rec (favorites popup)
  const favMusicMap = new Map(); // id -> music row rec (favorites popup)
  const favLockMap = new Map(); // id -> lock row rec (favorites popup)
  const favGarageMap = new Map(); // id -> garage row rec (favorites popup)
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
  globalThis.__MLD = { ROOMS_EL, SEARCH_EL, STATUS_EL, ALL_ON_BTN, ALL_OFF_BTN, ALL_ON_TRACK, ALL_OFF_TRACK, ALL_ON_RESTORE_BTN, ALL_OFF_SAVE_BTN, CENTRAL_TSTAT_BTN, CENTRAL_MUSIC_BTN, EXPAND_ALL_BTN, REORDER_DONE_BTN, REORDER_CANCEL_BTN, OVERFLOW_BTN, OVERFLOW_MENU, MENU_REORDER_BTN, MENU_HAPTICS_EL, MENU_TABS_EL, MENU_DRAWER_EL, MENU_THEME_SEGMENT, MENU_OPEN_LOCAL_BTN, MENU_OPEN_CLOUD_BTN, MENU_LOCAL_URL_EL, HAPTICS_STORAGE_KEY, THEME_STORAGE_KEY, TABS_STORAGE_KEY, DRAWER_STORAGE_KEY, LOCAL_URL_STORAGE_KEY, LOCAL_OK_STORAGE_KEY, CLOUD_URL_STORAGE_KEY, PREFER_CLOUD_STORAGE_KEY, DASH_SESSION_STORAGE_KEY, DASH_SESSION_EXPIRES_KEY, LOCAL_OK_MAX_AGE_MS, DASH_SESSION_MAX_AGE_MS, THEME_OPTIONS, APP_EL, REORDER_DRAG_THRESHOLD, DASHBOARD_TITLE_EL, CURRENT_CATEGORY_TITLE_EL, POLL_DEFAULT, POLL_WS_FALLBACK, loadHapticsPref, saveHapticsPref, loadThemePref, saveThemePref, loadTabsPref, saveTabsPref, loadDrawerPref, saveDrawerPref, cfg, localModeBannerEl, localBannerDismissed, rooms, roomMap, devices, devicesByRoom, outletsByRoom, devMap, outletMap, favDevMap, roomEls, lastDataSig, pollTimer, ws, wsConnected, wsRetry, wsReconnectTimer, pageWasHidden, reorderMode, reorderBusy, reorderSnapshot, reorderDraftOrder, navReorderSnapshot, navReorderDraftOrder, navReorderDrawerRelocated, navEls, colorPopup, colorSession, levelOptimistic, switchOptimistic, lockOptimistic, garageOptimistic, shadeOptimistic, valveOptimistic, musicOptimistic, setpointOptimistic, rgbWheelCache, thermostats, tempSensors, thermoByRoom, sensorByRoom, climateEls, tstatPopup, tstatSession, tstatDeviceModeLock, musicMasterPopup, MUSIC_VOL_STEP, hubModes, currentHubMode, scenes, locks, garageDoors, windowShades, valves, outlets, music, favorites, snapshots, roomGestureLockCount, hubModeLockUntil, hsmStatus, hsmAlert, hsmAlertDesc, hsmEnabled, hsmPinRequired, thermostatsPopupEnabled, outletsSeparateTab, unlockPinEnabled, unlockPinRequired, hsmLockUntil, pinPadPopup, pinPadState, gatePopup, gateState, dashSession, dashSessionExpiresAt, dashboardPasswordRequired, dashSessionActivityBound, ensureDashboardAccessTask, confirmPopup, confirmPending, quickPopup, quickPopupOpenType, syncQuickPopupRef, TAB_CATEGORIES, TAB_LABELS, tabMode, activeTab, tabViewEl, QUICK_LIGHTS_BTN, favTstatModeMenu, favTstatModeMenuCleanup, favTstatModeMenuId, favTstatModeMenuAnchor, centralTstatTargetMenu, centralTstatTargetMenuCleanup, centralTstatTargetMenuAnchor, favTstatMap, favPopupSig, tstatsPopupMap, tstatsPopupSig, setLevelOptimistic, setSwitchOptimistic, clearSwitchOptimistic, reapplySwitchOptimistic, effectiveSwitch, effectiveLevel, setLockOptimistic, clearLockOptimistic, reapplyLockOptimistic, effectiveLock, lockStatusLabel, setGarageOptimistic, clearGarageOptimistic, reapplyGarageOptimistic, effectiveGarageState, garageIsOpen, garageIsMoving, garageStatusLabel, setShadeOptimistic, clearShadeOptimistic, reapplyShadeOptimistic, effectiveShadeState, effectiveShadePosition, shadeIsMoving, shadeStatusLabel, setValveOptimistic, clearValveOptimistic, reapplyValveOptimistic, effectiveValveState, valveIsMoving, normalizeValveForCard, isMusicPlaying, musicControls, effectiveMusicStatus, effectiveMusicVolume, musicStatusLabel, setMusicOptimistic, clearMusicOptimistic, reapplyMusicOptimistic, setSetpointOptimistic, clearSetpointOptimistic, reapplySetpointOptimistic, applyTstatSetpoints, drawRgbWheel, activeSlideGestures, cancelAllSlideGestures, appendPopup, bindPopupDismiss, supportedModes, supportedFanModes, intersectSupportedLists, buildMultiTstatView, deviceHasFanSpeed, supportedFanSpeeds, showFanSpeedControls, fanModeActive, tstatSectionLabel, tstatStateClass, formatRoomTemp, roomClimateInfo, roomHasClimate, roomTstatState, isFavorite, syncFavButton, isFavoriteableDeviceId, centralThermostatsSorted, buildCentralTstat, postCall, loadDashSession, saveDashSession, clearDashSession, isDashSessionFresh, dashSessionRenewInFlight, dashSessionLastRenewAt, DASH_SESSION_RENEW_MIN_INTERVAL_MS, renewDashSessionFromServer, slideDashSessionExpiry, applyDashSessionFromResponse, isDashboardGateOpen, setupDashSessionActivityRenewal, ACCESS_TOKEN, withToken, fetchWithTimeout, getJson, fetchData, sendCmd, sendCmdBatch, publishMld, sensors, sensorCardMap, sensorRoomEls, favSensorMap, favMusicMap, favLockMap, favGarageMap, favShadeMap, sensorsPopupSig, sensorTypeFilter, sensorFilterOpen, sensorFilterChipsEl, sensorFilterBtnEl, sensorFilterEmptyEl, replaceList, repopulateThermoByRoom, repopulateSensorByRoom, syncRoomMap };
})();
