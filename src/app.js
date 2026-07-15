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
  const CENTRAL_BLINDS_BTN = document.getElementById("blinds-central-btn");
  const CENTRAL_FAN_BTN = document.getElementById("fan-central-btn");
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
  const fanOptimistic = new Map(); // fan id -> { s?, sp?, until, timer }
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
  let fanMasterPopup = null;
  let shadeMasterPopup = null;
  let fanMasterSession = null;   // { ids: number[], allIds: number[] }
  let shadeMasterSession = null;
  let fanMasterTargetMenu = null;
  let fanMasterTargetMenuCleanup = null;
  let fanMasterTargetMenuAnchor = null;
  let shadeMasterTargetMenu = null;
  let shadeMasterTargetMenuCleanup = null;
  let shadeMasterTargetMenuAnchor = null;
  const fanMasterTargetState = { menu: null, anchor: null, cleanup: null };
  const shadeMasterTargetState = { menu: null, anchor: null, cleanup: null };
  const MUSIC_VOL_STEP = 5;

  let hubModes = [];
  let currentHubMode = "";
  let scenes = [];
  let locks = [];
  let garageDoors = [];
  let windowShades = [];
  let ceilingFans = [];           // [{i,n,r,s,sp,supSp,hasSw}]
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
  let roomClimateEnabled = true;
  let schedulerEnabled = true;
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
  const TAB_CATEGORIES = new Set(["favorites", "sensors", "thermostats", "music", "blinds", "fans", "outlets", "scheduling"]);
  const TAB_LABELS = { lights: "Lights", favorites: "Favorites", sensors: "Sensors", thermostats: "Thermostats", music: "Music", blinds: "Blinds", fans: "Fans", outlets: "Outlets", scheduling: "Scheduler" };
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
      if (postCall("currentCategory") === "blinds") postCall("refreshBlindsPopup");
      else if (postCall("currentCategory") === "favorites") postCall("refreshFavoritesPopup");
      if (shadeMasterPopup?.classList.contains("open")) postCall("updateShadeMasterBody");
    }, LEVEL_OPTIMISTIC_MS);
    shadeOptimistic.set(id, entry);
  }

  function clearShadeOptimistic(id) {
    const prev = shadeOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    shadeOptimistic.delete(id);
  }

  function shadeOptimisticSatisfied(opt, shade) {
    if (!opt || !shade) return false;
    if (opt.st != null) {
      const want = String(opt.st);
      const got = String(shade.st || "");
      if (want !== got) {
        // Hub often reports the settled state while we still hold opening/closing.
        if (!(want === "opening" && got === "open") && !(want === "closing" && got === "closed")) {
          return false;
        }
      }
    }
    if (opt.pos != null && shade.pos !== opt.pos) return false;
    return true;
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
      if (shadeOptimisticSatisfied(opt, shade)) {
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

  function applyShadeWsEvent(shade, name, value) {
    if (!shade) return false;
    const opt = shadeOptimistic.get(shade.i);
    if (opt && opt.until > Date.now()) return true;
    if (name === "windowShade" || name === "windowBlind") {
      shade.st = String(value || "");
    } else if (name === "position" || name === "level") {
      const pos = Math.round(Number(value));
      if (!isNaN(pos)) {
        shade.pos = pos;
        if (pos <= 0) shade.st = "closed";
        else if (pos >= 99) shade.st = "open";
        else shade.st = "partially open";
      }
    } else if (name === "switch") {
      const sw = String(value || "");
      if (sw === "on") shade.st = "open";
      else if (sw === "off") shade.st = "closed";
    } else return false;
    return true;
  }

  function refreshShadeViews() {
    if (postCall("currentCategory") === "blinds") postCall("refreshBlindsPopup");
    else if (postCall("currentCategory") === "favorites") postCall("refreshFavoritesPopup");
    if (shadeMasterPopup?.classList.contains("open")) postCall("updateShadeMasterBody");
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

  function setFanOptimistic(id, patch) {
    const prev = fanOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const fan = ceilingFans.find((f) => f.i === id);
    if (fan) {
      if (patch.s != null) fan.s = patch.s ? 1 : 0;
      if (patch.sp != null) fan.sp = patch.sp;
    }
    const entry = {
      s: patch.s != null ? (patch.s ? 1 : 0) : prev?.s,
      sp: patch.sp != null ? patch.sp : prev?.sp,
      until: Date.now() + LEVEL_OPTIMISTIC_MS,
      timer: null,
    };
    entry.timer = setTimeout(() => {
      fanOptimistic.delete(id);
      if (postCall("currentCategory") === "fans") postCall("refreshFansPopup");
      else if (postCall("currentCategory") === "favorites") postCall("refreshFavoritesPopup");
    }, LEVEL_OPTIMISTIC_MS);
    fanOptimistic.set(id, entry);
  }

  function clearFanOptimistic(id) {
    const prev = fanOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    fanOptimistic.delete(id);
  }

  function reapplyFanOptimistic() {
    for (const [id, opt] of fanOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        fanOptimistic.delete(id);
        continue;
      }
      const fan = ceilingFans.find((f) => f.i === id);
      if (!fan) continue;
      let matched = true;
      if (opt.s != null && !!fan.s !== !!opt.s) matched = false;
      if (opt.sp != null && String(fan.sp || "").toLowerCase() !== String(opt.sp).toLowerCase()) matched = false;
      if (matched) {
        if (opt.timer) clearTimeout(opt.timer);
        fanOptimistic.delete(id);
        continue;
      }
      if (opt.s != null) fan.s = opt.s ? 1 : 0;
      if (opt.sp != null) fan.sp = opt.sp;
    }
  }

  function effectiveFanOn(fan) {
    const opt = fanOptimistic.get(fan.i);
    if (opt && Date.now() < opt.until && opt.s != null) return !!opt.s;
    return !!fan.s;
  }

  function effectiveFanSpeed(fan) {
    const opt = fanOptimistic.get(fan.i);
    if (opt && Date.now() < opt.until && opt.sp != null) return opt.sp;
    return fan.sp;
  }

  function ceilingFanSpeedLabel(sp) {
    const key = String(sp || "").trim().toLowerCase();
    if (!key) return "—";
    if (CEILING_FAN_SPEED_LABELS[key]) return CEILING_FAN_SPEED_LABELS[key];
    return key.replace(/(^|[-_\s])([a-z])/g, (_, a, b) => (a === "-" ? "-" : " ") + b.toUpperCase()).replace(/^ /, "");
  }

  function ceilingFanSpeeds(fan) {
    const list = parseList(fan?.supSp).map((s) => String(s).toLowerCase());
    const filtered = list.filter((s) => s && s !== "off" && s !== "on" && s !== "auto");
    if (filtered.length) {
      // Misparsed dim-level maps (e.g. 25,50,75) are not valid FanControl speeds.
      // Keep small numeric lists (1–6 DC fans). Anything >10 is almost certainly levels.
      const allNumeric = filtered.every((s) => /^\d+(\.\d+)?$/.test(s));
      const max = allNumeric ? Math.max(...filtered.map(Number)) : 0;
      if (allNumeric && max > 10) return CEILING_FAN_SPEED_ORDER.slice(0, 3);
      return filtered.slice().sort((a, b) => {
        const ia = CEILING_FAN_SPEED_ORDER.indexOf(a);
        const ib = CEILING_FAN_SPEED_ORDER.indexOf(b);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b, undefined, { numeric: true });
      });
    }
    return CEILING_FAN_SPEED_ORDER.slice(0, 3); // low, medium, high
  }

  function ceilingFanSupportsSpeed(fan, speed) {
    const sp = String(speed || "").toLowerCase();
    if (!sp || sp === "off") return true;
    return ceilingFanSpeeds(fan).includes(sp);
  }

  function sortCeilingFanSpeedTokens(speeds) {
    return speeds.slice().sort((a, b) => {
      const ia = CEILING_FAN_SPEED_ORDER.indexOf(a);
      const ib = CEILING_FAN_SPEED_ORDER.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }

  function intersectionCeilingFanSpeeds(fans) {
    if (!fans.length) return [];
    let common = new Set(ceilingFanSpeeds(fans[0]).map((s) => String(s).toLowerCase()));
    for (let i = 1; i < fans.length; i++) {
      const supported = new Set(ceilingFanSpeeds(fans[i]).map((s) => String(s).toLowerCase()));
      common = new Set([...common].filter((s) => supported.has(s)));
      if (!common.size) break;
    }
    return sortCeilingFanSpeedTokens([...common]);
  }

  function unionCeilingFanSpeeds(fans) {
    const seen = new Set();
    const out = [];
    for (const fan of fans) {
      for (const sp of ceilingFanSpeeds(fan)) {
        const key = String(sp).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(key);
        }
      }
    }
    return sortCeilingFanSpeedTokens(out);
  }

  function allHouseCeilingFanSpeeds() {
    return unionCeilingFanSpeeds(ceilingFans);
  }

  function averageShadePosition(shades) {
    const list = shades || windowShades;
    const positioned = list.filter((s) => s.pos != null);
    if (!positioned.length) return 50;
    let sum = 0;
    for (const shade of positioned) {
      const pos = effectiveShadePosition(shade);
      sum += pos != null ? pos : 0;
    }
    return Math.round(sum / positioned.length);
  }

  const NAMED_FAN_SPIN_SEC = {
    low: 2.4,
    "medium-low": 2,
    medium: 1.6,
    "medium-high": 1.2,
    high: 0.9,
  };

  function fanSpinDuration(fan, speedKey) {
    const key = String(speedKey || "").toLowerCase();
    if (NAMED_FAN_SPIN_SEC[key] != null) return NAMED_FAN_SPIN_SEC[key];
    const speeds = ceilingFanSpeeds(fan);
    const idx = speeds.indexOf(key);
    const i = idx >= 0 ? idx : 0;
    const n = speeds.length;
    if (n <= 1) return 1.6;
    const slow = 2.4;
    const fast = 0.9;
    return slow - (i / (n - 1)) * (slow - fast);
  }

  function syncFanBladeSpin(powerEl, fan, on, speedKey) {
    const blades = powerEl && powerEl.querySelector(".fan-blades");
    if (!blades) return;
    if (!on) {
      blades.style.removeProperty("animation-duration");
      return;
    }
    blades.style.animationDuration = fanSpinDuration(fan, speedKey) + "s";
  }

  function fanStatusLabel(fan) {
    if (!effectiveFanOn(fan)) return "Off";
    return ceilingFanSpeedLabel(effectiveFanSpeed(fan));
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
      || ceilingFans.some((f) => f.i === numId)
      || valves.some((v) => v.i === numId);
  }

  function centralThermostatsSorted() {
    return thermostats.slice().sort((a, b) => {
      const labelA = postCall("roomLabel", a.r) || String(a.r ?? "");
      const labelB = postCall("roomLabel", b.r) || String(b.r ?? "");
      const ra = labelA.localeCompare(labelB);
      if (ra !== 0) return ra;
      return String(a.n || "").localeCompare(String(b.n || ""), undefined, { sensitivity: "base" });
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
        if (data?.required === false) {
          postCall("syncDashboardAuthState", false);
          return false;
        }
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
    return !!document.querySelector(".dash-gate-popup.open");
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
    if (d && typeof d.dashboardPasswordRequired === "boolean") {
      postCall("syncDashboardAuthState", !!d.dashboardPasswordRequired);
    }
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
  const favFanMap = new Map(); // id -> fan tile rec (favorites popup)
  const fansPopupMap = new Map(); // id -> fan tile rec (fans popup/tab)
  let fansPopupSig = "";
  const shadePopupMap = new Map(); // id -> shade tile rec (blinds popup/tab)
  let blindsPopupSig = "";
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
  // __MLD_SPLIT_CORE__

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
    publishMld({ colorSession: colorSession, colorPopup: popup });
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
    publishMld({ colorSession: null, colorPopup: colorPopup });
  }

  function closeCtPopup(commit) { closeColorPopup(commit); }

  // =================== thermostat ===================

  function applyCentralTstatSelection(selectedIds) {
    if (!tstatSession?.central && !tstatSession?.roomGroup) return;
    const allIds = tstatSession.allIds || thermostats.map((t) => t.i);
    const ids = selectedIds.filter((id) => allIds.includes(id));
    tstatSession.ids = ids;
    if (tstatSession.central) {
      const selected = ids.map((id) => thermostats.find((t) => t.i === id)).filter(Boolean);
      tstatSession.centralTstat = buildCentralTstat(selected, tstatSession.unit);
    }
    updateTstatHeadExtras();
    renderTstatDial();
    renderTstatControls();
    syncCentralTstatTargetMenu();
  }

  function tstatTargetPickerEnabled() {
    return !!(tstatSession?.central || tstatSession?.roomGroup);
  }

  function updateCentralTstatTargetButton() {
    const btn = tstatPopup?._targetBtn;
    if (!btn) return;
    if (!tstatTargetPickerEnabled()) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    const labelEl = btn.querySelector(".tstat-target-btn-label");
    const allCount = (tstatSession.allIds || []).length;
    const selCount = tstatSession.ids.length;
    let label;
    if (selCount === 0) label = "No thermostats selected";
    else if (selCount === allCount) {
      label = tstatSession.roomGroup
        ? ("All in room (" + allCount + ")")
        : ("All thermostats (" + allCount + ")");
    } else if (selCount === 1) {
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
    if (tstatSession.ids.length !== 1 || !isFavoriteableDeviceId(tstatSession.ids[0])) {
      favBtn.hidden = true;
      return;
    }
    favBtn.hidden = false;
    syncFavButton(favBtn, tstatSession.ids[0]);
  }

  function updateTstatFavButton() {
    updateTstatHeadExtras();
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
      if (tstatSession?.ids?.length !== 1) return;
      const id = tstatSession.ids[0];
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
    tstatPopup._modeBtns = {};
    tstatPopup._fanModeSection = fanModeSection;
    tstatPopup._fanModes = fanModes;
    tstatPopup._fanModeBtns = fanModeBtns;
    tstatPopup._fanSpeedSection = fanSpeedSection;
    tstatPopup._fanSpeeds = fanSpeeds;
    tstatPopup._fanSpeedBtns = fanSpeedBtns;
    publishMld({ tstatPopup: tstatPopup });
    return tstatPopup;
  }

  function activeTstat() {
    if (!tstatSession) return null;
    // Mode/fan caps always come from one real device when exactly one is selected.
    if (tstatSession.ids?.length === 1) {
      return thermostats.find((x) => x.i === tstatSession.ids[0]) || null;
    }
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
    if (!tstatSession) return;
    const popup = ensureTstatPopup();
    const t = activeTstat();
    if (!t) return;
    const unit = tstatSession.unit;
    const cx = TSTAT_DIAL_SIZE / 2, cy = TSTAT_DIAL_SIZE / 2;
    const tm = String(t.tm || "").toLowerCase();
    const deg = tstatTempSuffix(unit);
    const tempVal = t.temp != null ? Math.round(Number(t.temp)) : null;

    popup._tempEl.textContent = tempVal != null ? (tempVal + deg) : "—";
    if (tstatTargetPickerEnabled() && tstatSession.ids?.length !== 1) {
      popup._title.textContent = (tstatSession.ids?.length || 0) + " thermostats";
    } else {
      popup._title.textContent = t.n || "Thermostat";
    }

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
    const noneSelected = !!(tstatTargetPickerEnabled() && !tstatSession.ids?.length);
    popup._svg.classList.toggle("disabled", tm === "off" || noneSelected);
    const noMode = !!(tstatTargetPickerEnabled() && tstatSession.ids?.length !== 1);
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
    if (!tstatSession) return;
    const popup = ensureTstatPopup();
    const t = activeTstat();
    if (!t) return;
    const noneSelected = !!(tstatTargetPickerEnabled() && !tstatSession.ids?.length);
    // Multi-select bulk sessions must not invent a combined mode list — only show
    // mode/fan controls when a single thermostat is the target.
    const singleTarget = tstatSession.ids?.length === 1;
    if (tstatTargetPickerEnabled() && !singleTarget) {
      popup._modeSection.style.display = "none";
      popup._fanModeSection.style.display = "none";
      popup._fanSpeedSection.style.display = "none";
      return;
    }
    const supM = supportedModes(t);
    const tm = String(t.tm || "").toLowerCase();
    renderTstatModeButtons(popup, supM, tm, noneSelected);
    popup._modeSection.style.display = supM.length ? "" : "none";

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
    if (!centralTstatTargetMenu || !tstatTargetPickerEnabled()) return;
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
    if (!tstatTargetPickerEnabled()) return;

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

    const pool = tstatSession.roomGroup
      ? allIds.map((id) => thermostats.find((t) => t.i === id)).filter(Boolean)
      : centralThermostatsSorted();
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
    closeFanMasterPopup();
    closeShadeMasterPopup();
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
    publishMld({ tstatSession: tstatSession, tstatPopup: popup });
  }

  function openTstatPopup(rid, anchorEl) {
    cancelAllSlideGestures();
    closeTstatPopup();
    if (colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    closeFanMasterPopup();
    closeShadeMasterPopup();
    const roomKey = normalizeRoomId(rid);
    const list = thermoByRoom.get(roomKey) || [];
    if (!list.length) return;
    if (list.length === 1) {
      openTstatPopupForDevice(list[0].i, anchorEl);
      return;
    }
    const ids = list.map((x) => x.i);
    // Start on one device so mode/fan caps are always that unit's own list.
    // Target picker can switch among roommates (or select several for setpoints).
    tstatSession = {
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
    publishMld({ tstatSession: tstatSession, tstatPopup: popup });
  }

  function openTstatPopupForDevice(tstatId, anchorEl) {
    cancelAllSlideGestures();
    closeTstatPopup();
    if (colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    closeFanMasterPopup();
    closeShadeMasterPopup();
    const t = thermostats.find((x) => x.i === tstatId);
    if (!t) return;
    tstatSession = {
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
    publishMld({ tstatSession: tstatSession, tstatPopup: popup });
  }

  function closeTstatPopup() {
    closeCentralTstatTargetMenu();
    if (tstatPopup) {
      tstatPopup.setAttribute("hidden", "");
      tstatPopup.classList.remove("open");
    }
    tstatSession = null;
    publishMld({ tstatSession: null, tstatPopup: tstatPopup });
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
    closeFanMasterPopup();
    closeShadeMasterPopup();
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
      room.textContent = postCall("roomLabel", dev.r) || String(dev.r ?? "");
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
    closeMasterTargetMenu(fanMasterTargetState);
    fanMasterTargetMenu = null;
    fanMasterTargetMenuAnchor = null;
    fanMasterTargetMenuCleanup = null;
  }

  function closeShadeMasterTargetMenu() {
    closeMasterTargetMenu(shadeMasterTargetState);
    shadeMasterTargetMenu = null;
    shadeMasterTargetMenuAnchor = null;
    shadeMasterTargetMenuCleanup = null;
  }

  function applyFanMasterSelection(selectedIds) {
    if (!fanMasterSession) return;
    const allIds = fanMasterSession.allIds || ceilingFans.map((f) => f.i);
    fanMasterSession.ids = selectedIds.filter((id) => allIds.includes(id));
    publishMld({ fanMasterSession });
    updateFanMasterHead();
    renderFanMasterBody();
    syncMasterTargetMenu(fanMasterTargetState, fanMasterSession, "fanId");
  }

  function applyShadeMasterSelection(selectedIds) {
    if (!shadeMasterSession) return;
    const allIds = shadeMasterSession.allIds || windowShades.map((s) => s.i);
    shadeMasterSession.ids = selectedIds.filter((id) => allIds.includes(id));
    publishMld({ shadeMasterSession });
    updateShadeMasterHead();
    renderShadeMasterBody();
    syncMasterTargetMenu(shadeMasterTargetState, shadeMasterSession, "shadeId");
  }

  function updateFanMasterHead() {
    const popup = fanMasterPopup;
    if (!popup) return;
    updateMasterTargetButton(
      popup._targetBtn,
      fanMasterSession,
      { all: "All fans", unit: "fans", one: "fan" },
      (id) => ceilingFans.find((f) => f.i === id)?.n
    );
    const favBtn = popup._favBtn;
    if (!favBtn) return;
    if (!fanMasterSession?.ids?.length || fanMasterSession.ids.length !== 1 || !isFavoriteableDeviceId(fanMasterSession.ids[0])) {
      favBtn.hidden = true;
      return;
    }
    favBtn.hidden = false;
    syncFavButton(favBtn, fanMasterSession.ids[0]);
  }

  function updateShadeMasterHead() {
    const popup = shadeMasterPopup;
    if (!popup) return;
    updateMasterTargetButton(
      popup._targetBtn,
      shadeMasterSession,
      { all: "All blinds", unit: "blinds", one: "blind" },
      (id) => windowShades.find((s) => s.i === id)?.n
    );
    const favBtn = popup._favBtn;
    if (!favBtn) return;
    if (!shadeMasterSession?.ids?.length || shadeMasterSession.ids.length !== 1 || !isFavoriteableDeviceId(shadeMasterSession.ids[0])) {
      favBtn.hidden = true;
      return;
    }
    favBtn.hidden = false;
    syncFavButton(favBtn, shadeMasterSession.ids[0]);
  }

  function openFanMasterTargetMenu(anchorBtn) {
    closeFanMasterTargetMenu();
    if (!fanMasterSession) return;
    openMasterTargetMenu(fanMasterTargetState, anchorBtn, {
      getSession: () => fanMasterSession,
      onApply: applyFanMasterSelection,
      getPool: () => postCall("sortByRoomThenFullName", ceilingFans) || ceilingFans.slice(),
      datasetKey: "fanId",
      deviceFallback: "Fan",
      onCloseMenu: closeFanMasterTargetMenu,
    });
    fanMasterTargetMenu = fanMasterTargetState.menu;
    fanMasterTargetMenuAnchor = fanMasterTargetState.anchor;
    fanMasterTargetMenuCleanup = fanMasterTargetState.cleanup;
  }

  function openShadeMasterTargetMenu(anchorBtn) {
    closeShadeMasterTargetMenu();
    if (!shadeMasterSession) return;
    openMasterTargetMenu(shadeMasterTargetState, anchorBtn, {
      getSession: () => shadeMasterSession,
      onApply: applyShadeMasterSelection,
      getPool: () => postCall("sortByRoomThenFullName", windowShades) || windowShades.slice(),
      datasetKey: "shadeId",
      deviceFallback: "Shade",
      onCloseMenu: closeShadeMasterTargetMenu,
    });
    shadeMasterTargetMenu = shadeMasterTargetState.menu;
    shadeMasterTargetMenuAnchor = shadeMasterTargetState.anchor;
    shadeMasterTargetMenuCleanup = shadeMasterTargetState.cleanup;
  }

  function ensureFanMasterPopup() {
    if (fanMasterPopup) return fanMasterPopup;
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
      if (fanMasterTargetMenu) closeFanMasterTargetMenu();
      else openFanMasterTargetMenu(targetBtn);
    });
    const favBtn = ce("button", "tstat-fav");
    favBtn.type = "button";
    favBtn.hidden = true;
    favBtn.innerHTML = FAVORITES_SVG;
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (fanMasterSession?.ids?.length !== 1) return;
      const id = fanMasterSession.ids[0];
      if (id == null || !isFavoriteableDeviceId(id)) return;
      hapticTap();
      postCall("toggleFavorite", id);
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
    appendPopup(popup);

    bindPopupDismiss(popup, panel, closeBtn, closeFanMasterPopup);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !popup.classList.contains("open")) return;
      if (fanMasterTargetMenu) { closeFanMasterTargetMenu(); return; }
      closeFanMasterPopup();
    });

    popup._body = body;
    popup._title = title;
    popup._targetBtn = targetBtn;
    popup._favBtn = favBtn;
    fanMasterPopup = popup;
    return popup;
  }

  function renderFanMasterBody() {
    const popup = ensureFanMasterPopup();
    const body = popup._body;
    body.innerHTML = "";
    const selectedIds = new Set(fanMasterSession?.ids || []);
    const selectedFans = ceilingFans.filter((f) => selectedIds.has(f.i));
    const noneSelected = !selectedFans.length;
    const anyOn = !noneSelected && selectedFans.some((f) => effectiveFanOn(f));

    const controls = ce("div", "fan-controls fan-master-controls" + (anyOn ? " is-on" : ""));
    const power = ce("button", "fan-power");
    power.type = "button";
    power.innerHTML = FAN_BTN_SVG;
    power.disabled = noneSelected;
    power.setAttribute("aria-label", anyOn ? "Turn all fans off" : "Turn all fans on");
    power.setAttribute("aria-pressed", anyOn ? "true" : "false");
    power.addEventListener("click", () => postCall("broadcastFanPower"));
    if (selectedFans.length) {
      const ref = selectedFans[0];
      syncFanBladeSpin(power, ref, anyOn, effectiveFanSpeed(ref));
    }
    controls.appendChild(power);
    body.appendChild(controls);

    const speeds = intersectionCeilingFanSpeeds(selectedFans);
    if (speeds.length) {
      const row = ce("div", "fan-master-speeds");

      for (const sp of speeds) {
        const btn = ce("button", "fan-master-speed-btn");
        btn.type = "button";
        btn.textContent = ceilingFanSpeedLabel(sp);
        btn.disabled = noneSelected;
        btn.addEventListener("click", () => postCall("broadcastFanSpeed", sp));
        row.appendChild(btn);
      }
      body.appendChild(row);
    }
  }

  function openFanMasterPopup() {
    cancelAllSlideGestures();
    closeTstatPopup();
    if (colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    closeShadeMasterPopup();
    postCall("closeQuickPopup");
    if (!ceilingFans.length) return;
    const ids = ceilingFans.map((f) => f.i);
    fanMasterSession = { ids: ids.slice(), allIds: ids.slice() };
    publishMld({ fanMasterSession });
    renderFanMasterBody();
    updateFanMasterHead();
    const popup = ensureFanMasterPopup();
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    publishMld({ fanMasterPopup: popup });
  }

  function closeFanMasterPopup() {
    closeFanMasterTargetMenu();
    if (!fanMasterPopup) return;
    fanMasterPopup.setAttribute("hidden", "");
    fanMasterPopup.classList.remove("open");
    fanMasterSession = null;
    publishMld({ fanMasterPopup: null, fanMasterSession: null });
  }

  function ensureShadeMasterPopup() {
    if (shadeMasterPopup) return shadeMasterPopup;
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
      if (shadeMasterTargetMenu) closeShadeMasterTargetMenu();
      else openShadeMasterTargetMenu(targetBtn);
    });
    const favBtn = ce("button", "tstat-fav");
    favBtn.type = "button";
    favBtn.hidden = true;
    favBtn.innerHTML = FAVORITES_SVG;
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (shadeMasterSession?.ids?.length !== 1) return;
      const id = shadeMasterSession.ids[0];
      if (id == null || !isFavoriteableDeviceId(id)) return;
      hapticTap();
      postCall("toggleFavorite", id);
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
    appendPopup(popup);

    bindPopupDismiss(popup, panel, closeBtn, closeShadeMasterPopup);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !popup.classList.contains("open")) return;
      if (shadeMasterTargetMenu) { closeShadeMasterTargetMenu(); return; }
      closeShadeMasterPopup();
    });

    popup._body = body;
    popup._title = title;
    popup._targetBtn = targetBtn;
    popup._favBtn = favBtn;
    shadeMasterPopup = popup;
    return popup;
  }

  function renderShadeMasterBody() {
    const popup = ensureShadeMasterPopup();
    const body = popup._body;
    body.innerHTML = "";
    const selectedIds = new Set(shadeMasterSession?.ids || []);
    const selectedShades = windowShades.filter((s) => selectedIds.has(s.i));
    const noneSelected = !selectedShades.length;

    const actions = ce("div", "shade-master-actions");
    const openBtn = ce("button", "quick-lock-btn shade-btn");
    openBtn.type = "button";
    openBtn.innerHTML = SHADE_OPEN_SVG + '<span class="quick-lock-btn-label">Open</span>';
    openBtn.disabled = noneSelected;
    openBtn.addEventListener("click", () => postCall("broadcastShadeCmd", "open"));
    const closeBtn = ce("button", "quick-lock-btn shade-btn");
    closeBtn.type = "button";
    closeBtn.innerHTML = SHADE_CLOSE_SVG + '<span class="quick-lock-btn-label">Close</span>';
    closeBtn.disabled = noneSelected;
    closeBtn.addEventListener("click", () => postCall("broadcastShadeCmd", "close"));
    actions.appendChild(openBtn);
    actions.appendChild(closeBtn);
    body.appendChild(actions);
    popup._openBtn = openBtn;
    popup._closeBtn = closeBtn;

    const positioned = selectedShades.filter((s) => s.pos != null);
    if (positioned.length) {
      const sliderWrap = ce("div", "shade-master-slider-wrap");
      const levelLabel = ce("span", "shade-level-label");
      const pos = averageShadePosition(positioned);
      levelLabel.textContent = pos + "%";
      const slider = ce("div", "slider shade-slider");
      const inner = ce("div", "slider-inner");
      inner.appendChild(ce("div", "slider-fill"));
      slider.appendChild(inner);
      slider.appendChild(ce("div", "slider-thumb"));
      if (noneSelected) slider.classList.add("disabled");
      postCall("setSliderLevel", slider, pos);
      sliderWrap.appendChild(levelLabel);
      sliderWrap.appendChild(slider);
      body.appendChild(sliderWrap);
      popup._sliderWrap = sliderWrap;
      popup._levelLabel = levelLabel;
      popup._slider = slider;
      if (!noneSelected) {
        postCall("attachBulkShadeDrag", sliderWrap, slider, (lvl) => { levelLabel.textContent = lvl + "%"; });
      }
    } else {
      popup._sliderWrap = null;
      popup._levelLabel = null;
      popup._slider = null;
    }
    updateShadeMasterBody();
  }

  function updateShadeMasterBody() {
    const popup = shadeMasterPopup;
    if (!popup || popup.hidden) return;
    const selectedIds = new Set(shadeMasterSession?.ids || []);
    const selectedShades = windowShades.filter((s) => selectedIds.has(s.i));
    const noneSelected = !selectedShades.length;
    const allOpen = !noneSelected && selectedShades.every((s) => {
      const st = effectiveShadeState(s);
      return st === "open" || st === "opening";
    });
    const allClosed = !noneSelected && selectedShades.every((s) => {
      const st = effectiveShadeState(s);
      return st === "closed" || st === "closing";
    });
    const anyMoving = !noneSelected && selectedShades.some((s) => shadeIsMoving(s));

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

    const positioned = selectedShades.filter((s) => s.pos != null || effectiveShadePosition(s) != null);
    if (popup._slider && popup._levelLabel && positioned.length && !popup._slider.classList.contains("dragging")) {
      const pos = averageShadePosition(positioned);
      postCall("setSliderLevel", popup._slider, pos);
      popup._levelLabel.textContent = pos + "%";
    }
  }

  function openShadeMasterPopup() {
    cancelAllSlideGestures();
    closeTstatPopup();
    if (colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    closeFanMasterPopup();
    postCall("closeQuickPopup");
    if (!windowShades.length) return;
    const ids = windowShades.map((s) => s.i);
    shadeMasterSession = { ids: ids.slice(), allIds: ids.slice() };
    publishMld({ shadeMasterSession });
    const popup = ensureShadeMasterPopup();
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    publishMld({ shadeMasterPopup: popup });
    renderShadeMasterBody();
    updateShadeMasterHead();
  }

  function closeShadeMasterPopup() {
    closeShadeMasterTargetMenu();
    if (!shadeMasterPopup) return;
    shadeMasterPopup.setAttribute("hidden", "");
    shadeMasterPopup.classList.remove("open");
    shadeMasterSession = null;
    publishMld({ shadeMasterPopup: null, shadeMasterSession: null });
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

  function roomShowsClimate(rid) {
    return roomClimateEnabled !== false && roomHasClimate(rid);
  }

  function getDisplayRoomIds(groups, hasContent) {
    const knownIds = new Set(rooms.map(r => r.id));
    const allIds = new Set(knownIds);
    for (const id of contentRoomIds()) allIds.add(id);
    const hasUnassigned = groups.has(-1) || (outletsInLightsRooms() && outletsByRoom.has(-1)) || roomShowsClimate(-1);
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

  // __MLD_SPLIT__

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

  function currentNavOrderFromDom() {
    const nav = document.querySelector(".quick-nav");
    if (!nav) return [];
    return Array.from(nav.querySelectorAll(".nav-reorder-item"))
      .map(el => el.dataset.navKey)
      .filter(Boolean);
  }

  function updateNavDraftOrderFromDom() {
    navReorderDraftOrder = currentNavOrderFromDom();
  }

  function showAllNavForReorder() {
    const nav = document.querySelector(".quick-nav");
    let anyVisible = false;
    for (const [key, rec] of navEls) {
      const show = key === "lights" ? tabMode : quickNavPopupHasContent(key);
      if (rec.wrap) rec.wrap.hidden = !show;
      if (rec.btn) rec.btn.hidden = !show;
      if (show) anyVisible = true;
    }
    if (nav) nav.hidden = !anyVisible;
  }

  function cleanupNavDragState() {
    const nav = document.querySelector(".quick-nav");
    if (!nav) return;
    nav.querySelectorAll(".nav-drag-placeholder").forEach((el) => el.remove());
    for (const [, rec] of navEls) {
      if (!rec?.wrap) continue;
      rec.wrap.classList.remove("nav-dragging");
      rec.wrap.style.width = "";
      rec.wrap.style.left = "";
      rec.wrap.style.top = "";
    }
  }

  async function saveNavOrder(order) {
    if (!order?.length) {
      flash("No icons to save", true);
      return false;
    }
    const headers = { "Accept": "application/json" };
    const paths = ["nav-order", "settings/nav-order"];
    let lastMsg = "Could not save icon order";
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
    flash(lastMsg === "Could not save icon order"
      ? "Could not save icon order — update the hub app code and try again"
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
      applyDashSessionFromResponse(data);
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
      applyDashSessionFromResponse(data);
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
    setTimeout(() => { refresh().catch(() => {}); }, 3000);
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
      roomGestureLockCount++;
      APP_EL?.classList.add("room-gesture-lock");
    } else {
      roomGestureLockCount = Math.max(0, roomGestureLockCount - 1);
      if (roomGestureLockCount === 0) APP_EL?.classList.remove("room-gesture-lock");
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
        const idx = activeSlideGestures.indexOf(reset);
        if (idx >= 0) activeSlideGestures.splice(idx, 1);
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
        flash("No saved state", true);
      }
      if (holdActive) {
        suppressClick = true;
        gestureHandled = true;
        setTimeout(() => { gestureHandled = false; suppressClick = false; }, 0);
      }
      reset();
    }

    primaryBtn.addEventListener("pointerdown", (e) => {
      if (reorderMode) return;
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
        activeSlideGestures.push(reset);
      }
      try { track.setPointerCapture(pointerId); } catch {
        try { primaryBtn.setPointerCapture(pointerId); } catch {}
      }
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (pointerId == null) return;
        if (canCommit && !canCommit()) {
          holdBlocked = true;
          flash("No saved state", true);
          return;
        }
        holdActive = true;
        suppressClick = true;
        track.classList.add("slide-confirm-active", "slide-confirm-revealed", "room-slide-active", "room-slide-revealed");
        setupSlideMetrics();
        setRoomGestureLock(true);
        hapticTap();
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
    for (const [rid, rec] of roomEls) {
      const has = !!snapshots[snapshotRoomKey(rid)];
      rec.card.classList.toggle("room-has-snapshot", has);
      rec.card.classList.toggle("room-no-snapshot", !has);
      if (rec.restoreBtn) {
        rec.restoreBtn.disabled = !has;
        rec.restoreBtn.setAttribute("aria-disabled", has ? "false" : "true");
      }
    }
    const hasHouse = !!snapshots[snapshotHouseKey()];
    if (ALL_ON_TRACK) {
      ALL_ON_TRACK.classList.toggle("house-has-snapshot", hasHouse);
      ALL_ON_TRACK.classList.toggle("house-no-snapshot", !hasHouse);
    }
    if (ALL_ON_RESTORE_BTN) {
      ALL_ON_RESTORE_BTN.disabled = !hasHouse;
      ALL_ON_RESTORE_BTN.setAttribute("aria-disabled", hasHouse ? "false" : "true");
    }
  }

  function getFavoriteEntries() {
    const out = [];
    for (const id of favorites) {
      // Prefer fan over light when the same device is in both pickers.
      const fan = ceilingFans.find(x => x.i === id);
      if (fan) { out.push({ type: "fan", dev: fan }); continue; }
      const dev = devices.find(d => d.i === id);
      if (dev) { out.push({ type: "light", dev }); continue; }
      const outlet = outlets.find(o => o.i === id);
      if (outlet) { out.push({ type: "outlet", dev: outlet }); continue; }
      const t = thermostats.find(x => x.i === id);
      if (t) { out.push({ type: "thermostat", dev: t }); continue; }
      const valve = valves.find(x => x.i === id);
      if (valve) { out.push({ type: "sensor", dev: normalizeValveForCard(valve) }); continue; }
      const mp = music.find(x => x.i === id);
      if (mp) { out.push({ type: "music", dev: mp }); continue; }
      const lk = locks.find(x => x.i === id);
      if (lk) { out.push({ type: "lock", dev: lk }); continue; }
      const garage = garageDoors.find(x => x.i === id);
      if (garage) { out.push({ type: "garage", dev: garage }); continue; }
      const shade = windowShades.find(x => x.i === id);
      if (shade) { out.push({ type: "shade", dev: shade }); continue; }
      const ts = tempSensors.find(x => x.i === id);
      const sen = sensors.find(x => x.i === id);
      const sensorDev = buildMergedSensorCard(ts, sen);
      if (sensorDev) { out.push({ type: "sensor", dev: sensorDev }); continue; }
    }
    return out;
  }

  function updateAllFavButtons() {
    for (const [, rec] of devMap) syncFavButton(rec.el.querySelector(".tile-fav"), rec.data.i);
    for (const [, rec] of outletMap) syncFavButton(rec.el.querySelector(".tile-fav"), rec.data.i);
    for (const [, rec] of favDevMap) syncFavButton(rec.el.querySelector(".tile-fav"), rec.data.i);
    for (const [, rec] of sensorCardMap) syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of favSensorMap) syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of favMusicMap) syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of favLockMap) syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of favGarageMap) syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of favShadeMap) syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of favFanMap) syncFavButton(rec.favBtn, rec.i);
    updateTstatFavButton();
    if (fanMasterPopup?.classList.contains("open")) postCall("updateFanMasterHead");
    if (shadeMasterPopup?.classList.contains("open")) postCall("updateShadeMasterHead");
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
    if (!isFavoriteableDeviceId(numId)) return;
    const idx = favorites.indexOf(numId);
    const wasFav = idx >= 0;
    if (wasFav) favorites.splice(idx, 1);
    else favorites.push(numId);
    updateAllFavButtons();
    updateQuickNavVisibility();
    if (currentCategory() === "favorites") renderFavoritesPopup();
    else if (quickPopupOpenType === "locks") renderLocksPopup();
    else if (quickPopupOpenType === "music") renderMusicPopup();
    else if (quickPopupOpenType === "blinds") refreshBlindsPopup();
    else if (quickPopupOpenType === "fans") refreshFansPopup();
    const ok = await saveFavorites(favorites);
    if (!ok) {
      if (wasFav) favorites.push(numId);
      else favorites.splice(favorites.indexOf(numId), 1);
      updateAllFavButtons();
      updateQuickNavVisibility();
      if (currentCategory() === "favorites") renderFavoritesPopup();
      else if (quickPopupOpenType === "locks") renderLocksPopup();
      else if (quickPopupOpenType === "music") renderMusicPopup();
      else if (quickPopupOpenType === "blinds") refreshBlindsPopup();
      else if (quickPopupOpenType === "fans") refreshFansPopup();
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
    navReorderSnapshot = cfg.navOrder?.length ? cfg.navOrder.slice() : null;
    navReorderDraftOrder = currentNavOrderFromDom();
    for (const [, rec] of roomEls) rec.card.classList.remove("collapsed");
    updateExpandAllBtn();
    stopPolling();
    reorderMode = true;
    APP_EL?.classList.toggle("reorder-mode", true);
    closeTopbarOverflowMenu();
    relocateNavForReorder();
    showAllNavForReorder();
    if (SEARCH_EL) {
      SEARCH_EL.value = "";
      applySearch();
    }
    if (REORDER_DONE_BTN) REORDER_DONE_BTN.hidden = false;
    if (REORDER_CANCEL_BTN) REORDER_CANCEL_BTN.hidden = false;
    updateMoveButtons();
  }

  function exitReorderMode(resumePoll) {
    reorderMode = false;
    reorderBusy = false;
    reorderDraftOrder = null;
    reorderSnapshot = null;
    navReorderDraftOrder = null;
    navReorderSnapshot = null;
    APP_EL?.classList.toggle("reorder-mode", false);
    restoreNavAfterReorder();
    cleanupNavDragState();
    if (REORDER_DONE_BTN) REORDER_DONE_BTN.hidden = true;
    if (REORDER_CANCEL_BTN) REORDER_CANCEL_BTN.hidden = true;
    updateQuickNavVisibility();
    if (resumePoll) {
      startPolling();
      refresh();
    } else {
      applySearch();
    }
  }

  async function finishReorderMode() {
    const order = reorderDraftOrder ?? currentRoomOrderFromDom();
    const navOrder = navReorderDraftOrder ?? currentNavOrderFromDom();
    const [roomsSaved, navSaved] = await Promise.all([
      saveRoomOrder(order),
      saveNavOrder(navOrder),
    ]);
    if (!roomsSaved || !navSaved) return;
    cfg.roomOrder = order.length ? order.slice() : null;
    cfg.navOrder = navOrder.length ? navOrder.slice() : null;
    lastDataSig = "";
    exitReorderMode(true);
    flash("Order saved");
  }

  function cancelReorderMode() {
    cfg.roomOrder = reorderSnapshot ? reorderSnapshot.slice() : null;
    cfg.navOrder = navReorderSnapshot ? navReorderSnapshot.slice() : null;
    lastDataSig = "";
    exitReorderMode(false);
    postCall("applyNavOrder", postCall("getDisplayNavOrder"));
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
    updateLocalModeMenuUI();
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
      const roomCards = visibleRooms();
      let insertBefore = null;
      for (const roomCard of roomCards) {
        const rect = roomCard.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
          insertBefore = roomCard;
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
      if (!reorderMode) return;
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
      reorderBusy = true;
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
        if (Math.hypot(dx, dy) < REORDER_DRAG_THRESHOLD) return;
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
        reorderBusy = false;
        cleanupListeners();
        try { handle.releasePointerCapture(pointerId); } catch {}
      }
    }

    handle.addEventListener("pointerdown", (e) => {
      if (!reorderMode) return;
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
    const entries = [{ key: "lights", btn: QUICK_LIGHTS_BTN }];
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
      navEls.set(key, { wrap, btn, handle });
    }
  }

  function relocateNavForReorder() {
    if (!cfg.enableDrawer || navReorderDrawerRelocated) return;
    const d = resolveDrawerDom();
    const nav = document.querySelector(".quick-nav");
    if (!d || !nav || nav.parentElement === d.topbar) return;
    if (drawerOpen || drawerClosing) closeDrawer();
    d.topbar.appendChild(nav);
    navReorderDrawerRelocated = true;
  }

  function restoreNavAfterReorder() {
    if (!navReorderDrawerRelocated) return;
    const d = resolveDrawerDom();
    const nav = document.querySelector(".quick-nav");
    if (d && nav) d.navSlot.appendChild(nav);
    navReorderDrawerRelocated = false;
  }

  function captureUiScroll() {
    const snap = { y: window.scrollY || document.documentElement.scrollTop || 0 };
    const panel = document.querySelector(".quick-popup.open .quick-panel");
    if (panel) snap.panelY = panel.scrollTop;
    const scrollBody = (tabMode && activeTab !== "lights" && tabViewEl)
      ? tabViewEl
      : document.querySelector(".quick-popup.open .quick-body");
    const list = scrollBody && scrollBody.querySelector(".quick-list");
    if (list) snap.listY = list.scrollTop;
    return snap;
  }

  function restoreUiScroll(snap) {
    if (!snap) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scrollBody = (tabMode && activeTab !== "lights" && tabViewEl)
          ? tabViewEl
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
    outletsSeparateTab = !!d.outletsSeparateTab;
    roomClimateEnabled = d.roomClimateEnabled !== false;
    schedulerEnabled = d.schedulerEnabled !== false;
    unlockPinEnabled = !!d.unlockPinEnabled;
    unlockPinRequired = !!d.unlockPinRequired;
    replaceList(scenes, d.scenes);
    replaceList(locks, d.locks);
    replaceList(garageDoors, d.garageDoors);
    replaceList(windowShades, d.windowShades);
    replaceList(ceilingFans, d.ceilingFans);
    if (!Array.isArray(valves)) valves = [];
    replaceList(valves, Array.isArray(d.valves) ? d.valves : []);
    replaceList(music, d.music);
    if (Array.isArray(d.config?.favorites)) replaceList(favorites, d.config.favorites.map(Number));
    reapplyLockOptimistic();
    reapplyGarageOptimistic();
    reapplyShadeOptimistic();
    reapplyFanOptimistic();
    try { reapplyValveOptimistic(); } catch {}
    reapplyMusicOptimistic();
    reapplySetpointOptimistic();

    replaceList(rooms, sortRoomsByOrder(d.rooms || [], cfg.roomOrder));
    syncRoomMap();
    replaceList(devices, d.devices);
    replaceList(outlets, d.outlets);
    replaceList(thermostats, d.thermostats);
    replaceList(tempSensors, d.tempSensors);
    replaceList(sensors, d.sensors);
    snapshots = d.snapshots && typeof d.snapshots === "object" ? d.snapshots : {};
    rebuildDevicesByRoom();
    rebuildOutletsByRoom();
    reapplySwitchOptimistic();
    reapplyTstatDeviceModeLocks();
    applyTstatSessionModeLock();

    repopulateThermoByRoom();
    repopulateSensorByRoom();
    ensureRoomsFromDevices();
    updateQuickNavVisibility();

    if (!devices.length && !outlets.length && !thermostats.length && !tempSensors.length) { noDevicesState(); return; }

    const groups = new Map();
    for (const dev of devices) {
      const rid = normalizeRoomId(dev.r);
      if (!groups.has(rid)) groups.set(rid, []);
      groups.get(rid).push(dev);
    }
    const hasContent = (rid) => (groups.get(normalizeRoomId(rid))?.length || roomShowsClimate(rid));
    const displayOrder = getDisplayRoomIds(groups, hasContent);

    const sig = displayOrder.join(",") + "|" + devices.map(x => x.i).join(",")
      + "|" + outlets.map(x => x.i).join(",") + "|" + (outletsSeparateTab ? 1 : 0)
      + "|" + thermostats.map(x => x.i).join(",") + "|" + tempSensors.map(x => x.i).join(",")
      + "|" + (roomClimateEnabled ? 1 : 0);
    const fullRerender = sig !== lastDataSig;
    lastDataSig = sig;

    const scrollSnap = captureUiScroll();
    if (fullRerender && !reorderMode) buildDom();
    updateRoomSnapshotUi();
    updateStates();
    updateClimateWidgets();
    applySearch();
    refreshQuickPopupIfOpen();
    restoreUiScroll(scrollSnap);
  }

  function buildDom() {
    ROOMS_EL.innerHTML = "";
    roomEls.clear(); devMap.clear(); outletMap.clear(); climateEls.clear();

    // group devices by room id (null/undefined -> -1 Unassigned)
    const groups = new Map();
    for (const dev of devices) {
      const rid = normalizeRoomId(dev.r);
      if (!groups.has(rid)) groups.set(rid, []);
      groups.get(rid).push(dev);
    }
    const outletGroups = new Map();
    if (outletsInLightsRooms()) {
      for (const out of outlets) {
        const rid = normalizeRoomId(out.r);
        if (!outletGroups.has(rid)) outletGroups.set(rid, []);
        outletGroups.get(rid).push(out);
      }
    }

    // a room is shown if it has lights, outlets (when in rooms), thermostats, or temp sensors
    const hasContent = (rid) => {
      const key = normalizeRoomId(rid);
      const hasOutlets = outletsInLightsRooms() && (outletGroups.get(key)?.length || 0) > 0;
      return (groups.get(key)?.length || hasOutlets || roomShowsClimate(key));
    };

    const orderedIds = getDisplayRoomIds(groups, hasContent);

    for (const rid of orderedIds) {
      const roomKey = normalizeRoomId(rid);
      const name = roomKey === -1 ? "Unassigned" : (roomMap.get(roomKey) || "Room");
      const devs = sortDevicesInRoom(groups.get(roomKey) || [], name);
      const roomOutlets = outletsInLightsRooms()
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
      const climate = roomClimateEnabled ? roomClimateInfo(roomKey) : null;
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
              const snapDevs = devicesByRoom.get(roomKey) || [];
              snapshots[snapshotRoomKey(roomKey)] = { ts: Date.now(), count: snapDevs.length };
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
      }

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
      for (const out of roomOutlets) body.appendChild(makeOutletTile(out));
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
    if (inFavorites) favDevMap.set(dev.i, rec);
    else devMap.set(dev.i, rec);
    return tile;
  }

  function makeOutletTile(outlet, context) {
    const inFavorites = context === "favorites";
    const inOutletsTab = context === "outlets";
    const tile = ce("section", "tile switch outlet" + (inOutletsTab ? " outlet-tab-card" : ""));
    tile.dataset.id = outlet.i;
    tile.dataset.name = String(outlet.n || "").toLowerCase();

    const fullName = outlet.n || ("Outlet " + outlet.i);
    const roomName = outlet.r != null && outlet.r !== -1 ? roomMap.get(outlet.r) : null;
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
    if (inFavorites) favDevMap.set(outlet.i, rec);
    else outletMap.set(outlet.i, rec);
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
    const socket = qs(".tile-socket", rec.el);
    if (socket) socket.setAttribute("aria-pressed", on ? "true" : "false");
    const nameEl = qs(".tile-name", rec.el);
    if (nameEl) nameEl.classList.toggle("color-capable", rec.isDim);
    if (rec.isOutlet) {
      rec.levelEl.textContent = outletsSeparateTab ? roomLabel(dev.r) : "Outlet";
    } else {
      rec.levelEl.textContent = formatFootText(
        rec.isDim ? { ...dev, l: effectiveLevel(dev) } : dev,
        rec.isDim
      );
    }
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
    for (const out of outlets) {
      syncTileState(outletMap.get(out.i), out);
      syncTileState(favDevMap.get(out.i), out);
    }
    updateRoomMeta();
  }

  function updateRoomMeta() {
    for (const [rid, rec] of roomEls) {
      const devs = devicesByRoom.get(rid) || [];
      const roomOutlets = outletsInLightsRooms() ? (outletsByRoom.get(rid) || []) : [];
      const onCount = devs.filter((d) => effectiveSwitch(d)).length;
      const total = devs.length;
      const outletOn = roomOutlets.filter((o) => effectiveSwitch(o)).length;
      const outletTotal = roomOutlets.length;
      const hasClimate = roomShowsClimate(rid);
      let text;
      if (total > 0) {
        text = onCount ? onCount + " of " + total + " on" : (total + " light" + (total === 1 ? "" : "s"));
        if (outletsInLightsRooms() && outletTotal > 0) {
          text += " · " + outletTotal + " outlet" + (outletTotal === 1 ? "" : "s");
          if (outletOn) text += " (" + outletOn + " on)";
        }
      } else if (outletsInLightsRooms() && outletTotal > 0) {
        text = outletOn
          ? outletOn + " of " + outletTotal + " outlet" + (outletTotal === 1 ? "" : "s") + " on"
          : (outletTotal + " outlet" + (outletTotal === 1 ? "" : "s"));
      } else if (hasClimate && thermoByRoom.has(rid)) {
        const t = (thermoByRoom.get(rid) || [])[0];
        const tm = String(t?.tm || "").toLowerCase();
        text = tm && tm !== "off" ? tm : "Thermostat";
      } else if (hasClimate && sensorByRoom.has(rid)) {
        text = (sensorByRoom.get(rid)[0]?.n) || "Temperature";
      } else {
        text = "";
      }
      rec.meta.textContent = text;
      let state = "mixed";
      if (total > 0) {
        if (onCount === 0) state = "all-off";
        else if (onCount === total) state = "all-on";
      } else if (outletsInLightsRooms() && outletTotal > 0 || hasClimate) {
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
      return trackPctFromEvent(slider, e);
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
      return trackPctFromEvent(slider, e);
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

  function attachBulkShadeDrag(tile, slider, onLevelChange) {
    const INTENT = 8;
    const TAP_MOVE = 10;
    let dragging = false;
    let aborted = false;
    let startX = 0, startY = 0;
    let lastCommit = 0;
    let pendingLevel = null;
    let downLevel = null;

    function pctFromEvent(e) {
      return trackPctFromEvent(slider, e);
    }
    function setVisual(p) {
      const level = clampLevel(p);
      setSliderLevel(slider, level);
      if (onLevelChange) onLevelChange(level);
    }
    function commitLevel(p) {
      setVisual(p);
      broadcastShadeCmd("setPosition", p);
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
        broadcastShadeCmd("setPosition", p, { quiet: true, skipMasterUpdate: true });
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

  function toggleOutlet(id) {
    hapticTap();
    const out = outlets.find((d) => d.i === id);
    if (!out) return;
    const on = effectiveSwitch(out);
    const next = on ? "off" : "on";
    setSwitchOptimistic(id, next === "on" ? 1 : 0);
    updateStates();
    sendCmd(id, next).then((r) => {
      if (!r?.ok) { clearSwitchOptimistic(id); refresh(); }
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
      const numId = Number(d.i);

      const shade = windowShades.find(x => x.i === numId);
      if (shade && (d.st != null || d.pos != null)) {
        if (d.st != null) shade.st = d.st;
        if (d.pos != null) shade.pos = d.pos;
        const opt = shadeOptimistic.get(numId);
        if (opt && shadeOptimisticSatisfied(opt, shade)) clearShadeOptimistic(numId);
        refreshShadeViews();
      }

      const rec = devMap.get(numId) || favDevMap.get(numId);
      if (rec && !rec.isOutlet) {
        const dev = devices.find((x) => x.i === numId);
        if (dev) {
          if (d.s != null) dev.s = d.s ? 1 : 0;
          if (rec.isDim && d.l != null) dev.l = d.l;
          if (rec.data.ct && d.k != null) dev.k = d.k;
          if (rec.data.rgb && d.h != null) dev.h = d.h;
          if (rec.data.rgb && d.sat != null) dev.sat = d.sat;
        }
        const opt = switchOptimistic.get(numId);
        if (opt && !!dev?.s === !!opt.s) clearSwitchOptimistic(numId);
        updateStates();
        if (shade && (d.st != null || d.pos != null)) return;
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
      const sen = sensors.find(x => x.i === Number(d.i));
      const lock = locks.find(x => x.i === Number(d.i));
      const garage = garageDoors.find(x => x.i === Number(d.i));
      const fan = ceilingFans.find(x => x.i === Number(d.i));
      const valve = valves.find(x => x.i === Number(d.i));
      const mp = music.find(x => x.i === Number(d.i));
      const hasControlRole = !!(lock || garage || shade || fan || valve || mp);
      if (s && sen && !hasControlRole) {
        syncDualSensorSources(s, sen, d);
        updateClimateWidgets();
        updateRoomMeta();
        refreshSensorViews();
        return;
      }
      if (s && !sen && !hasControlRole) {
        applyTempSensorPayload(s, d);
        updateClimateWidgets();
        updateRoomMeta();
        refreshSensorViews();
        return;
      }
      if (sen && !hasControlRole) {
        applySensorPayload(sen, d);
        refreshSensorViews();
        return;
      }
      if (lock) {
        if (d.lk != null) lock.lk = d.lk ? 1 : 0;
        if (d.st != null) lock.st = d.st;
        const opt = lockOptimistic.get(Number(d.i));
        if (opt && !!lock.lk === !!opt.lk) clearLockOptimistic(Number(d.i));
        if (currentCategory() === "locks") renderLocksPopup();
        else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
        return;
      }
      if (garage) {
        if (d.st != null) garage.st = d.st;
        const opt = garageOptimistic.get(Number(d.i));
        if (opt?.st != null && garage.st === opt.st) clearGarageOptimistic(Number(d.i));
        if (currentCategory() === "locks") renderLocksPopup();
        else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
        return;
      }
      if (shade && (d.st != null || d.pos != null)) return;
      if (fan) {
        if (d.s != null) fan.s = d.s ? 1 : 0;
        if (d.sp != null) fan.sp = d.sp;
        const opt = fanOptimistic.get(Number(d.i));
        if (opt) {
          let matched = true;
          if (opt.s != null && !!fan.s !== !!opt.s) matched = false;
          if (opt.sp != null && String(fan.sp || "").toLowerCase() !== String(opt.sp).toLowerCase()) matched = false;
          if (matched) clearFanOptimistic(Number(d.i));
        }
        updateFanTile(fan);
        if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
        return;
      }
      if (valve) {
        if (d.st != null) valve.st = d.st;
        const opt = valveOptimistic.get(Number(d.i));
        if (opt?.st != null && valve.st === opt.st) clearValveOptimistic(Number(d.i));
        if (currentCategory() === "sensors") refreshSensorsPopup();
        else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
        return;
      }
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
        else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
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
      else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    }
    const result = await sendCmd(id, cmd, val);
    if (!result.ok) {
      clearMusicOptimistic(id);
      reconcileMusic(id);
      if (currentCategory() === "music") renderMusicPopup();
      else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
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
        else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
      });
    }
    if (currentCategory() === "music") renderMusicPopup();
    else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
  }

  function reconcileGarage(id) {
    setTimeout(() => refreshDevice(id), 700);
    setTimeout(() => refreshDevice(id), 2200);
  }

  async function sendGarageCmd(id, cmd, pin) {
    const door = garageDoors.find((g) => g.i === id);
    if (!door) return { ok: false };
    hapticTap();
    const patch = cmd === "open" ? { st: "opening" } : cmd === "close" ? { st: "closing" } : null;
    if (patch) {
      setGarageOptimistic(id, patch);
      if (currentCategory() === "locks") renderLocksPopup();
      else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    }
    const result = await sendCmd(id, cmd, null, pin);
    if (!result.ok) {
      clearGarageOptimistic(id);
      reconcileGarage(id);
      if (currentCategory() === "locks") renderLocksPopup();
      else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    } else {
      reconcileGarage(id);
    }
    return result;
  }

  async function sendLockCmd(id, cmd, pin) {
    const lock = locks.find(l => l.i === id);
    if (!lock) return { ok: false };
    const lk = cmd === "lock" ? 1 : 0;
    const st = cmd === "lock" ? "locked" : "unlocked";
    hapticTap();
    setLockOptimistic(id, lk, st);
    if (currentCategory() === "locks") renderLocksPopup();
    else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    const result = await sendCmd(id, cmd, null, pin);
    if (!result.ok) {
      clearLockOptimistic(id);
      reconcileLock(id);
      if (currentCategory() === "locks") renderLocksPopup();
      else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    } else {
      reconcileLock(id);
    }
    return result;
  }

  async function sendShadeCmd(id, cmd, val, opts) {
    const quiet = opts?.quiet;
    const skipOptimistic = opts?.skipOptimistic;
    const shade = windowShades.find(s => s.i === id);
    if (!shade) return { ok: false };
    if (!quiet) hapticTap();
    if (!skipOptimistic) {
      let patch = {};
      if (cmd === "open") patch = { st: "opening" };
      else if (cmd === "close") patch = { st: "closing" };
      else if (cmd === "setPosition") patch = { pos: Math.max(0, Math.min(100, Number(val))) };
      if (patch.st != null || patch.pos != null) {
        setShadeOptimistic(id, patch);
        if (!quiet) {
          if (currentCategory() === "blinds") refreshBlindsPopup();
          else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
        }
      }
    }
    const result = await sendCmd(id, cmd, val);
    if (!result.ok) {
      clearShadeOptimistic(id);
      reconcileShade(id);
      if (!quiet) {
        if (currentCategory() === "blinds") refreshBlindsPopup();
        else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
      }
      if (shadeMasterPopup?.classList.contains("open")) postCall("updateShadeMasterBody");
    } else {
      reconcileShade(id);
    }
    return result;
  }

  async function sendFanCmd(id, cmd, val) {
    const fan = ceilingFans.find((f) => f.i === id);
    if (!fan) return { ok: false };
    hapticTap();
    let patch = null;
    if (cmd === "on") patch = { s: 1 };
    else if (cmd === "off") patch = { s: 0, sp: "off" };
    else if (cmd === "setSpeed") {
      const sp = String(val || "").trim();
      const spLower = sp.toLowerCase();
      patch = { sp: spLower, s: spLower === "off" ? 0 : 1 };
    }
    if (patch) {
      setFanOptimistic(id, patch);
      updateFanTile(fan);
      if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    }
    const result = await sendCmd(id, cmd, val);
    if (!result.ok) {
      clearFanOptimistic(id);
      reconcileFan(id);
      updateFanTile(fan);
      if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    } else {
      reconcileFan(id);
    }
    return result;
  }

  function fanMasterTargetIds() {
    if (!fanMasterSession) return [];
    return fanMasterSession.ids || [];
  }

  function shadeMasterTargetIds() {
    if (!shadeMasterSession) return [];
    return shadeMasterSession.ids || [];
  }

  function broadcastFanPower() {
    const ids = fanMasterTargetIds();
    if (!ids.length) return;
    const fans = ids.map((id) => ceilingFans.find((f) => f.i === id)).filter(Boolean);
    if (!fans.length) return;
    const anyOn = fans.some((f) => effectiveFanOn(f));
    const cmd = anyOn ? "off" : "on";
    for (const fan of fans) sendFanCmd(fan.i, cmd);
    if (currentCategory() === "fans") refreshFansPopup();
    else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    if (fanMasterPopup?.classList.contains("open")) postCall("renderFanMasterBody");
  }

  function broadcastFanSpeed(speed) {
    const ids = fanMasterTargetIds();
    if (!ids.length) return;
    const sp = String(speed || "").toLowerCase();
    for (const id of ids) {
      const fan = ceilingFans.find((f) => f.i === id);
      if (!fan) continue;
      if (sp === "off") sendFanCmd(fan.i, "off");
      else if (ceilingFanSupportsSpeed(fan, sp)) sendFanCmd(fan.i, "setSpeed", sp);
    }
    if (currentCategory() === "fans") refreshFansPopup();
    else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    if (fanMasterPopup?.classList.contains("open")) postCall("renderFanMasterBody");
  }

  function broadcastShadeCmd(cmd, val, opts) {
    const ids = shadeMasterTargetIds();
    if (!ids.length) return;
    const quiet = opts?.quiet;
    const skipMasterUpdate = opts?.skipMasterUpdate;
    if (!quiet) hapticTap();

    const shades = [];
    for (const id of ids) {
      const shade = windowShades.find((s) => s.i === id);
      if (!shade) continue;
      if (cmd === "setPosition" && shade.pos == null) continue;
      shades.push(shade);
    }
    if (!shades.length) return;

    // Bulk Open/Close jump to the settled end-state so the master popup gets
    // immediate active/slider feedback (individual tiles still use opening/closing).
    for (const shade of shades) {
      let patch = {};
      if (cmd === "open") patch = { st: "open", pos: shade.pos != null ? 100 : undefined };
      else if (cmd === "close") patch = { st: "closed", pos: shade.pos != null ? 0 : undefined };
      else if (cmd === "setPosition") patch = { pos: Math.max(0, Math.min(100, Number(val))) };
      if (patch.st != null || patch.pos != null) setShadeOptimistic(shade.i, patch);
    }

    for (const shade of shades) {
      sendShadeCmd(shade.i, cmd, val, { quiet: true, skipOptimistic: true });
    }

    if (!skipMasterUpdate && shadeMasterPopup?.classList.contains("open")) {
      postCall("updateShadeMasterBody");
    }
    if (!quiet) {
      if (currentCategory() === "blinds") refreshBlindsPopup();
      else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    }
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

  function ensureQuickPopup() {
    if (quickPopup) {
      syncQuickPopupRef(quickPopup);
      return quickPopup;
    }
    const el = ce("div", "quick-popup");
    syncQuickPopupRef(el);
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
    appendPopup(el);

    bindPopupDismiss(el, panel, close, closeQuickPopup);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.classList.contains("open")) closeQuickPopup();
    });

    el._title = title;
    el._body = body;
    return el;
  }

  const WIDE_POPUP_TYPES = new Set(["favorites", "sensors", "thermostats", "blinds", "fans", "outlets", "scheduling"]);
  const HUB_MODE_POPUP_TYPE = "hub-mode";

  function syncQuickPopupWidth(popup, type) {
    popup.classList.toggle("quick-popup-wide", WIDE_POPUP_TYPES.has(type) && !inTabView());
    popup.classList.toggle("quick-popup-hub-mode", type === HUB_MODE_POPUP_TYPE);
  }

  function syncQuickPopupWidthForOpen(popup) {
    const type = inTabView() ? activeTab : quickPopupOpenType;
    if (type) syncQuickPopupWidth(popup, type);
  }

  function updateFavoriteGarageRow(door) {
    const rec = favGarageMap.get(door.i);
    if (!rec) return;
    rec.meta.textContent = roomLabel(door.r) + " · " + garageStatusLabel(door);
    const isOpen = garageIsOpen(door);
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
    meta.textContent = roomLabel(door.r) + " · " + garageStatusLabel(door);
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
    const isOpen = garageIsOpen(door);
    if (!isOpen) closeBtn.classList.add("active");
    else openBtn.classList.add("active");
    closeBtn.addEventListener("click", () => {
      if (!garageIsMoving(door) && garageIsOpen(door)) sendGarageCmd(door.i, "close");
    });
    openBtn.addEventListener("click", () => {
      if (garageIsMoving(door) || garageIsOpen(door)) return;
      if (unlockPinRequired) promptGarageOpenPin(door.i, door.n);
      else sendGarageCmd(door.i, "open");
    });
    actions.appendChild(closeBtn);
    actions.appendChild(openBtn);
    row.appendChild(actions);

    if (inFav) {
      favGarageMap.set(door.i, { el: row, meta, closeBtn, openBtn, favBtn: fav, i: door.i });
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
    meta.textContent = roomLabel(lock.r) + " · " + lockStatusLabel(lock);
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
    row.appendChild(actions);

    if (inFav) {
      favLockMap.set(lock.i, { el: row, meta, lockBtn, unlockBtn, favBtn: fav });
    }
    return row;
  }

  function updateFavoriteLockRow(lock) {
    const rec = favLockMap.get(lock.i);
    if (!rec) return;
    rec.meta.textContent = roomLabel(lock.r) + " · " + lockStatusLabel(lock);
    const isLocked = effectiveLock(lock);
    rec.lockBtn.classList.toggle("active", isLocked);
    rec.unlockBtn.classList.toggle("active", !isLocked);
  }

  function renderLocksPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = popup._body;
    body.className = "quick-body quick-body-locks";
    body.innerHTML = "";
    if (!locks.length && !garageDoors.length) {
      body.textContent = "No locks or garage doors selected — add them in the Hubitat app settings";
      return;
    }
    if (unlockPinEnabled && !unlockPinRequired) {
      const hint = ce("p", "quick-lock-pin-hint");
      hint.textContent = "Set unlock PIN in Hubitat app settings";
      body.appendChild(hint);
    }
    const entries = [];
    for (const lock of locks) entries.push({ kind: "lock", dev: lock });
    for (const door of garageDoors) entries.push({ kind: "garage", dev: door });
    entries.sort((a, b) => compareByRoomThenFullName(a.dev, b.dev));
    const list = ce("div", "quick-list");
    for (const entry of entries) {
      if (entry.kind === "lock") list.appendChild(makeLockRow(entry.dev, "popup"));
      else list.appendChild(makeGarageRow(entry.dev, "popup"));
    }
    body.appendChild(list);
  }

  // __MLD_SPLIT2__

  function makeShadeTile(shade, context) {
    const inFav = context === "favorites";
    const tile = ce("div", "shade-tile" + (inFav ? " quick-fav-span" : ""));
    tile.dataset.name = String(shade.n || "").toLowerCase();
    const head = ce("div", "quick-fav-row-head");
    const info = ce("div", "shade-info");
    const name = ce("span", "quick-fav-name");
    name.textContent = shade.n || ("Shade " + shade.i);
    const meta = ce("span", "quick-fav-meta");
    meta.textContent = roomLabel(shade.r) + " · " + shadeStatusLabel(shade);
    info.appendChild(name);
    info.appendChild(meta);
    head.appendChild(info);
    const fav = ce("button", "tile-fav");
    fav.type = "button";
    attachFavButton(fav, shade.i);
    head.appendChild(fav);
    tile.appendChild(head);

    const moving = shadeIsMoving(shade);
    const pos = effectiveShadePosition(shade);
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
    let stopBtn = null;
    if (moving) {
      stopBtn = ce("button", "quick-lock-btn shade-btn shade-stop-btn");
      stopBtn.type = "button";
      stopBtn.innerHTML = SHADE_STOP_SVG + '<span class="quick-lock-btn-label">Stop</span>';
      stopBtn.addEventListener("click", () => sendShadeCmd(shade.i, "stop"));
      actions.appendChild(stopBtn);
    }
    tile.appendChild(actions);

    const shadeRec = { el: tile, meta, levelLabel, slider, openBtn, closeBtn, stopBtn, favBtn: fav };
    if (inFav) favShadeMap.set(shade.i, shadeRec);
    else if (context === "popup") shadePopupMap.set(shade.i, shadeRec);
    return tile;
  }

  function updateShadeTile(shade) {
    const rec = shadePopupMap.get(shade.i) || favShadeMap.get(shade.i);
    if (!rec) return;
    const moving = shadeIsMoving(shade);
    const pos = effectiveShadePosition(shade);
    rec.meta.textContent = roomLabel(shade.r) + " · " + shadeStatusLabel(shade);
    if (rec.levelLabel) rec.levelLabel.textContent = (pos != null ? pos : "—") + "%";
    if (rec.slider) {
      setSliderLevel(rec.slider, pos != null ? pos : 0);
      rec.slider.classList.toggle("disabled", moving);
    }
    const st = effectiveShadeState(shade);
    rec.openBtn.classList.toggle("active", st === "open");
    rec.closeBtn.classList.toggle("active", st === "closed");
    rec.openBtn.classList.toggle("moving", moving);
    rec.closeBtn.classList.toggle("moving", moving);
    rec.openBtn.disabled = moving;
    rec.closeBtn.disabled = moving;
  }

  function updateFavoriteShadeTile(shade) {
    updateShadeTile(shade);
  }

  function shadesListSignature() {
    return windowShades.map((s) => s.i).join(",");
  }

  function refreshBlindsPopup() {
    if (currentCategory() !== "blinds") return;
    const listSig = shadesListSignature();
    const body = currentBody();
    if (!body.querySelector(".quick-list") || listSig !== blindsPopupSig) {
      renderBlindsPopup();
      return;
    }
    for (const shade of windowShades) updateShadeTile(shade);
  }

  function renderBlindsPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-blinds");
    body.innerHTML = "";
    shadePopupMap.clear();
    blindsPopupSig = shadesListSignature();
    if (!windowShades.length) {
      body.textContent = "No shades selected — add shades in the Hubitat app settings";
      return;
    }
    const sorted = sortByRoomThenFullName(windowShades);
    const list = ce("div", "quick-list");
    for (const shade of sorted) list.appendChild(makeShadeTile(shade, "popup"));
    body.appendChild(list);
  }

  function toggleCeilingFan(id) {
    const fan = ceilingFans.find((f) => f.i === id);
    if (!fan) return;
    sendFanCmd(id, effectiveFanOn(fan) ? "off" : "on");
  }

  function stepCeilingFanSpeed(id, delta) {
    const fan = ceilingFans.find((f) => f.i === id);
    if (!fan) return;
    const speeds = ceilingFanSpeeds(fan);
    if (!speeds.length) return;
    const on = effectiveFanOn(fan);
    const cur = String(effectiveFanSpeed(fan) || "").toLowerCase();
    let idx = speeds.indexOf(cur);
    if (!on || cur === "off") {
      if (delta > 0) sendFanCmd(id, "on");
      return;
    }
    if (idx < 0) {
      if (delta < 0) sendFanCmd(id, "off");
      else sendFanCmd(id, "setSpeed", speeds[0]);
      return;
    }
    const next = idx + delta;
    if (next < 0) {
      sendFanCmd(id, "off");
      return;
    }
    if (next >= speeds.length) return;
    sendFanCmd(id, "setSpeed", speeds[next]);
  }

  function makeFanTile(fan, context) {
    const inFav = context === "favorites";
    const on = effectiveFanOn(fan);
    const sp = String(effectiveFanSpeed(fan) || "").toLowerCase();
    const speeds = ceilingFanSpeeds(fan);
    const idx = speeds.indexOf(sp);
    const tile = ce("div", "fan-tile" + (on ? " is-on" : "") + (inFav ? " quick-fav-span" : ""));
    tile.dataset.name = String(fan.n || "").toLowerCase();
    tile.dataset.speed = on ? sp : "off";

    const head = ce("div", "quick-fav-row-head");
    const info = ce("div", "shade-info");
    const name = ce("span", "quick-fav-name");
    name.textContent = fan.n || ("Fan " + fan.i);
    const meta = ce("span", "quick-fav-meta");
    meta.textContent = roomLabel(fan.r) + " · " + fanStatusLabel(fan);
    info.appendChild(name);
    info.appendChild(meta);
    head.appendChild(info);
    const fav = ce("button", "tile-fav");
    fav.type = "button";
    attachFavButton(fav, fan.i);
    head.appendChild(fav);
    tile.appendChild(head);

    const controls = ce("div", "fan-controls");
    const minus = ce("button", "fan-step");
    minus.type = "button";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Decrease fan speed");
    minus.disabled = !on;
    minus.addEventListener("click", () => stepCeilingFanSpeed(fan.i, -1));

    const power = ce("button", "fan-power");
    power.type = "button";
    power.innerHTML = FAN_BTN_SVG;
    power.setAttribute("aria-label", on ? "Turn fan off" : "Turn fan on");
    power.setAttribute("aria-pressed", on ? "true" : "false");
    power.addEventListener("click", () => toggleCeilingFan(fan.i));
    syncFanBladeSpin(power, fan, on, sp);

    const plus = ce("button", "fan-step");
    plus.type = "button";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Increase fan speed");
    plus.disabled = on && idx >= 0 && idx >= speeds.length - 1;
    plus.addEventListener("click", () => stepCeilingFanSpeed(fan.i, 1));

    controls.appendChild(minus);
    controls.appendChild(power);
    controls.appendChild(plus);
    tile.appendChild(controls);

    const speedLabel = ce("div", "fan-speed-label");
    speedLabel.textContent = fanStatusLabel(fan);
    tile.appendChild(speedLabel);

    if (inFav) {
      favFanMap.set(fan.i, { el: tile, meta, speedLabel, minus, plus, power, favBtn: fav });
    } else if (context === "popup") {
      fansPopupMap.set(fan.i, { el: tile, meta, speedLabel, minus, plus, power, favBtn: fav });
    }
    return tile;
  }

  function updateFanTile(fan) {
    const rec = fansPopupMap.get(fan.i) || favFanMap.get(fan.i);
    if (!rec) return;
    const on = effectiveFanOn(fan);
    const sp = String(effectiveFanSpeed(fan) || "").toLowerCase();
    const speeds = ceilingFanSpeeds(fan);
    const idx = speeds.indexOf(sp);
    rec.el.classList.toggle("is-on", on);
    rec.el.dataset.speed = on ? sp : "off";
    rec.meta.textContent = roomLabel(fan.r) + " · " + fanStatusLabel(fan);
    rec.speedLabel.textContent = fanStatusLabel(fan);
    rec.minus.disabled = !on;
    rec.plus.disabled = on && idx >= 0 && idx >= speeds.length - 1;
    rec.power.setAttribute("aria-label", on ? "Turn fan off" : "Turn fan on");
    rec.power.setAttribute("aria-pressed", on ? "true" : "false");
    syncFanBladeSpin(rec.power, fan, on, sp);
  }

  function fansListSignature() {
    return ceilingFans.map((f) => f.i).join(",");
  }

  function refreshFansPopup() {
    if (currentCategory() !== "fans") return;
    const listSig = fansListSignature();
    const body = currentBody();
    if (!body.querySelector(".quick-list") || listSig !== fansPopupSig) {
      renderFansPopup();
      return;
    }
    for (const fan of ceilingFans) updateFanTile(fan);
  }

  function renderFansPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-fans");
    body.innerHTML = "";
    fansPopupMap.clear();
    fansPopupSig = fansListSignature();
    if (!ceilingFans.length) {
      body.textContent = "No fans selected — add ceiling fans in the Hubitat app settings";
      return;
    }
    const sorted = sortByRoomThenFullName(ceilingFans);
    const list = ce("div", "quick-list");
    for (const fan of sorted) list.appendChild(makeFanTile(fan, "popup"));
    body.appendChild(list);
  }

  function renderOutletsPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-outlets");
    body.innerHTML = "";
    outletMap.clear();
    if (!outlets.length) {
      body.textContent = "No outlets configured — add outlets in the Hubitat app settings";
      return;
    }
    const sorted = sortByRoomThenFullName(outlets);
    const grid = ce("div", "quick-fav-grid");
    for (const out of sorted) grid.appendChild(makeOutletTile(out, "outlets"));
    body.appendChild(grid);
    updateStates();
  }

  function normalizeTempSensorForCard(s) {
    return tempPrimaryCardFromRec(s);
  }

  function syncDualSensorSources(s, sen, d) {
    if (sen && d) applySensorPayload(sen, d);
    if (s && d) {
      if (d.temp != null) s.temp = Number(d.temp);
      if (d.bat != null) s.bat = Number(d.bat);
      if (Array.isArray(d.ex) && !sen) {
        s.ex = d.ex.map((e) => ({ k: e.k, v: e.v, u: e.u ?? null }));
      }
    }
    if (s && sen) syncTempSensorFromSensorEntry(s, sen);
  }

  function applySensorLiveAttr(deviceId, attrName, value, unit) {
    const id = Number(deviceId);
    const s = tempSensors.find((x) => x.i === id);
    const sen = sensors.find((x) => x.i === id);
    const nm = String(attrName || "");
    let changed = false;
    let climate = false;
    if (s) {
      if (nm === "temperature") {
        const n = Number(value);
        if (!isNaN(n)) {
          s.temp = Math.round(n);
          changed = true;
          climate = true;
        }
      } else if (nm === "battery") {
        const n = Number(value);
        if (!isNaN(n)) {
          s.bat = Math.round(n);
          changed = true;
        }
      } else if (applyTempSensorWsAttr(s, nm, value, unit)) {
        changed = true;
      }
    }
    if (sen && applySensorWsAttr(sen, nm, value, unit)) changed = true;
    if (s && sen && nm !== "temperature") syncTempSensorFromSensorEntry(s, sen);
    if (changed && climate) {
      updateClimateWidgets();
      updateRoomMeta();
    }
    return changed;
  }

  function refreshSensorViews() {
    if (currentCategory() === "sensors") refreshSensorsPopup();
    else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
  }


  let musicVolTimer = null;

  function makeMusicRow(dev, context) {
    const inFav = context === "favorites";
    const ctrl = musicControls(dev);
    const playing = isMusicPlaying(effectiveMusicStatus(dev));
    const status = effectiveMusicStatus(dev);
    const vol = effectiveMusicVolume(dev);
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
    meta.textContent = roomLabel(dev.r) + " · " + musicStatusLabel(dev);
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
    row.appendChild(infoHead);
    const right = ce("div", "music-right");
    if (transport.childElementCount) right.appendChild(transport);
    if (ctrl.volume) right.appendChild(volWrap);
    row.appendChild(right);

    if (inFav) {
      favMusicMap.set(dev.i, {
        el: row, art, track, meta, playPauseBtn, stopBtn, volIcon, slider, muteBadge, favBtn, i: dev.i,
      });
    }
    return row;
  }

  function updateFavoriteMusicRow(dev) {
    const rec = favMusicMap.get(dev.i);
    if (!rec) return;
    const ctrl = musicControls(dev);
    const playing = isMusicPlaying(effectiveMusicStatus(dev));
    const status = effectiveMusicStatus(dev);
    const vol = effectiveMusicVolume(dev);
    const muted = dev.m === "muted";
    rec.el.classList.toggle("is-playing", playing);
    rec.art.classList.toggle("playing", playing);
    rec.track.textContent = dev.tr ? dev.tr : (playing ? "Streaming…" : "—");
    rec.meta.textContent = roomLabel(dev.r) + " · " + musicStatusLabel(dev);
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
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-music");
    body.innerHTML = "";
    if (!music.length) {
      body.textContent = "No speakers selected — add music players or additional speakers in the Hubitat app settings";
      return;
    }
    const sorted = sortByRoomThenFullName(music);
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
    pinPadPopup.appendChild(panel);
    appendPopup(pinPadPopup);

    bindPopupDismiss(pinPadPopup, panel, null, () => {
      pinPadState?.onCancel?.();
      closePinPad();
    });
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
    pinPadPopup._error = error;
    pinPadPopup._dots = dots;
    pinPadPopup._keys = keys;
    pinPadPopup._submit = submit;
    return pinPadPopup;
  }

  function showPinPadError(message) {
    if (!pinPadPopup?._error) return;
    pinPadPopup._error.textContent = message;
    pinPadPopup._error.hidden = false;
  }

  function clearPinPadError() {
    if (!pinPadPopup?._error) return;
    pinPadPopup._error.textContent = "";
    pinPadPopup._error.hidden = true;
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
    clearPinPadError();
    pinPadState.pin += d;
    renderPinPadDots();
  }

  function backspacePinDigit() {
    if (!pinPadState || !pinPadState.pin.length) return;
    hapticTap();
    clearPinPadError();
    pinPadState.pin = pinPadState.pin.slice(0, -1);
    renderPinPadDots();
  }

  function closePinPad() {
    if (!pinPadPopup) return;
    pinPadPopup.hidden = true;
    pinPadPopup.classList.remove("open");
    pinPadPopup.classList.remove("shake");
    clearPinPadError();
    pinPadState = null;
  }

  function openPinPad({ title, onSubmit, onCancel }) {
    cancelAllSlideGestures();
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
        if (pinPadState) pinPadState.pin = "";
        renderPinPadDots();
      },
    };
  }

  function promptGarageOpenPin(garageId, garageName) {
    hapticTap();
    const pad = openPinPad({
      title: "Enter PIN to open" + (garageName ? " " + garageName : ""),
      onSubmit: async (pin) => {
        const result = await sendGarageCmd(garageId, "open", pin);
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
      if (hsmModeIsActive(hsmStatus, mode)) {
        b.classList.add("active");
        const activeClass = hsmModeActiveClass(mode, hsmStatus);
        if (activeClass) b.classList.add(activeClass);
      }
      b.addEventListener("click", () => {
        if (skipActive && hsmModeIsActive(hsmStatus, mode)) return;
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
    if (!hsmEnabled) {
      body.textContent = "Enable HSM control in the Hubitat app settings";
      return;
    }

    const statusTone = hsmStatusTone(hsmStatus, hsmAlert);
    const statusWrap = ce("div", "quick-hsm-status quick-hsm-status--" + statusTone);
    if (hsmHasActiveAlert(hsmAlert)) statusWrap.classList.add("alert");
    const statusLabel = ce("span", "quick-hsm-status-label");
    statusLabel.textContent = hsmStatusLabel(hsmStatus);
    statusWrap.appendChild(statusLabel);
    const monMeta = ce("span", "quick-hsm-status-meta quick-hsm-status-meta--" + hsmMonitoringTone(hsmStatus));
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
    if (hsmIntrusionArmed(hsmStatus)) {
      const intrMeta = ce("p", "quick-hsm-section-meta quick-hsm-section-meta--" + hsmIntrusionTone(hsmStatus));
      intrMeta.textContent = hsmStatusLabel(hsmStatus);
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
    const monDesc = ce("p", "quick-hsm-section-meta quick-hsm-section-meta--" + hsmMonitoringTone(hsmStatus));
    monDesc.textContent = hsmMonitoringLabel(hsmStatus);
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

  async function sendValveCmd(id, cmd) {
    const valve = valves.find((v) => v.i === id);
    if (!valve) return { ok: false };
    hapticTap();
    const patch = cmd === "open" ? { st: "opening" } : cmd === "close" ? { st: "closing" } : null;
    if (patch) {
      setValveOptimistic(id, patch);
      if (currentCategory() === "sensors") refreshSensorsPopup();
      else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    }
    const result = await sendCmd(id, cmd);
    if (!result.ok) {
      clearValveOptimistic(id);
      reconcileValve(id);
      if (currentCategory() === "sensors") refreshSensorsPopup();
      else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    } else {
      reconcileValve(id);
    }
    return result;
  }

  function reconcileValve(id) {
    setTimeout(() => refreshDevice(id), 700);
    setTimeout(() => refreshDevice(id), 2200);
  }

  // ---------- sensors popup ----------
  const SENSOR_TYPE_ORDER = Object.keys(SENSOR_TYPE_META);

  function sensorTypeOrder(t) {
    const idx = SENSOR_TYPE_ORDER.indexOf(t);
    return idx >= 0 ? idx : SENSOR_TYPE_ORDER.length;
  }

  function sortSensorsInRoom(devs, roomName) {
    return devs.slice().sort((a, b) => {
      const ta = sensorTypeOrder(a.t) - sensorTypeOrder(b.t);
      if (ta !== 0) return ta;
      return compareDevicesInRoom(a, b, roomName);
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
    for (const s of tempSensors) {
      byId.set(String(s.i), normalizeTempSensorForCard(s));
    }
    for (const s of sensors) {
      const tempRec = tempSensors.find((x) => x.i === s.i);
      byId.set(String(s.i), buildMergedSensorCard(tempRec, s));
    }
    // Valve controls take priority if a valve also exposes a sensor capability.
    for (const v of valves) byId.set(String(v.i), normalizeValveForCard(v));
    const out = [...byId.values()];
    out.sort((a, b) => {
      const ta = sensorTypeOrder(a.t) - sensorTypeOrder(b.t);
      if (ta !== 0) return ta;
      return String(a.n || "").localeCompare(String(b.n || ""), undefined, { sensitivity: "base" });
    });
    return out;
  }

  function sensorsPopupSignature() {
    return mergedSensorList().map((d) => `${d.i}:${d.r}:${d.t}:${d.v}:${d.a}:${d.le ?? ""}:${sensorBatteryPct(d)}:${(d.ex || []).map((e) => e.k + e.v).join(".")}`).join("|");
  }

  function sensorTypesWithCounts() {
    const counts = new Map();
    for (const d of mergedSensorList()) {
      for (const t of sensorCardFilterTypes(d)) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => sensorTypeLabel(a[0]).localeCompare(sensorTypeLabel(b[0])));
  }

  function sensorMatchesFilter(dev) {
    if (!sensorTypeFilter.size) return true;
    const types = sensorCardFilterTypes(dev);
    for (const t of sensorTypeFilter) {
      if (types.has(t)) return true;
    }
    return false;
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
      if (show && !rec.el.classList.contains("search-hidden")) visible++;
    }
    for (const [, rec] of sensorRoomEls) {
      const visibleCards = rec.body.querySelectorAll(".sensor-card:not([hidden]):not(.search-hidden)");
      rec.card.classList.toggle("hidden", visibleCards.length === 0);
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
    const ex = sortSensorExForDisplay(dev.ex, sensorExFooterExcludeForType(dev.t));
    if (!ex.length) return "";
    const parts = [];
    for (const e of ex.slice(0, 4)) {
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
      hero = formatRoomTemp(dev._ref || dev);
      pill = "Temp";
      alert = false;
    } else if (dev.t === "valve") {
      const d = sensorDisplay({ ...dev, v: effectiveValveState(dev._ref || dev) });
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
    rec.footEl.textContent = sensorCardFootText(dev, sensorExFooter);
    rec.footEl.hidden = !rec.footEl.textContent;
    const batTxt = sensorBatteryLabel(dev);
    rec.batteryEl.textContent = batTxt;
    rec.batteryEl.hidden = !batTxt;
    const lastTxt = sensorLastEventLine(dev);
    card.setAttribute("aria-label", (dev.n || "Sensor") + ", " + roomLabel(dev.r) + ", " + sensorTypeLabel(dev.t) + (pill ? ", " + pill : "") + (lastTxt ? ", " + lastTxt : "") + (batTxt ? ", " + batTxt : ""));
    if (dev.t === "valve" && rec.openBtn && rec.closeBtn) {
      const valve = dev._ref || dev;
      const moving = valveIsMoving(valve);
      const st = effectiveValveState(valve);
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
    const fullName = dev.n || ("Sensor " + dev.i);
    const roomName = dev.r != null && dev.r !== -1 ? roomMap.get(dev.r) : null;
    const displayName = context === "sensors"
      ? ((dev.n ? stripRoomPrefix(dev.n, roomName) : null) || fullName)
      : fullName;
    name.textContent = displayName;
    if (dev.n && displayName !== dev.n) name.title = dev.n;
    const metaRow = ce("div", "sensor-card-meta");
    metaRow.textContent = context === "sensors"
      ? sensorTypeLabel(dev.t)
      : roomLabel(dev.r) + " · " + sensorTypeLabel(dev.t);
    const foot = ce("div", "sensor-card-foot");
    const actions = ce("div", "sensor-card-actions");
    const battery = ce("div", "sensor-card-battery");
    const fav = ce("button", "sensor-card-fav tile-fav");
    fav.type = "button";
    attachFavButton(fav, dev.i);
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
        if (!valveIsMoving(valveRef) && effectiveValveState(valveRef) !== "open") sendValveCmd(valveRef.i, "open");
      });
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!valveIsMoving(valveRef) && effectiveValveState(valveRef) !== "closed") sendValveCmd(valveRef.i, "close");
      });
      controls.appendChild(openBtn);
      controls.appendChild(closeBtn);
      card.appendChild(controls);
      rec.openBtn = openBtn;
      rec.closeBtn = closeBtn;
    }
    card.appendChild(actions);
    applySensorCardState(card, dev, rec);
    if (context === "favorites") favSensorMap.set(dev.i, rec);
    else sensorCardMap.set(dev.i, rec);
    return card;
  }

  function makeFavoriteSensorCard(dev) {
    return makeSensorCard(dev, "favorites");
  }

  function updateSensorCard(dev) {
    // Update both maps: after visiting Sensors then Favorites, sensorCardMap can
    // still hold detached cards that would otherwise steal updates from fav cards.
    const sen = sensorCardMap.get(dev.i);
    if (sen) applySensorCardState(sen.el, dev, sen);
    const fav = favSensorMap.get(dev.i);
    if (fav && fav !== sen) applySensorCardState(fav.el, dev, fav);
  }

  function buildSensorRoomSection(roomKey, devs) {
    const name = roomKey === -1 ? "Unassigned" : (roomMap.get(roomKey) || "Room");
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

    const sorted = sortSensorsInRoom(devs, name);
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

    sensorRoomEls.set(roomKey, { card, body, meta });
    return card;
  }

  function renderSensorsPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-sensors");
    body.innerHTML = "";
    sensorCardMap.clear();
    sensorRoomEls.clear();
    sensorCollapsedBeforeSearch = null;
    favSensorMap.clear();
    sensorFilterChipsEl = null;
    sensorFilterBtnEl = null;
    sensorFilterEmptyEl = null;
    const merged = mergedSensorList();
    sensorsPopupSig = sensorsPopupSignature();
    if (!merged.length) {
      body.textContent = "No sensors selected — add temperature, other sensors, or valves in Hubitat app settings";
      return;
    }
    const wrap = ce("div", "sensor-popup-wrap");
    const { toolbar, chips } = buildSensorFilterBar();
    const roomsEl = ce("div", "sensor-rooms");
    const sensorGroups = groupSensorsByRoom(merged);
    const hasSensors = (rid) => (sensorGroups.get(normalizeRoomId(rid))?.length || 0) > 0;
    const orderedIds = getDisplayRoomIds(sensorGroups, hasSensors);
    for (const rid of orderedIds) {
      const roomKey = normalizeRoomId(rid);
      const devs = sensorGroups.get(roomKey) || [];
      if (!devs.length) continue;
      roomsEl.appendChild(buildSensorRoomSection(roomKey, devs));
    }
    const empty = ce("div", "sensor-filter-empty");
    empty.textContent = "No sensors match this filter";
    empty.hidden = true;
    sensorFilterEmptyEl = empty;
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
    if (!body.querySelector(".sensor-rooms") || sig !== sensorsPopupSig) {
      renderSensorsPopup();
      return;
    }
    for (const dev of mergedSensorList()) updateSensorCard(dev);
    applySensorTypeFilter();
  }



  function renderScenesPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
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
      openTstatPopupForDevice(t.i, null);
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
      if (entry.type === "thermostat") {
        const t = thermostats.find((x) => x.i === entry.dev.i) || entry.dev;
        updateQuickTstatCard(t, favTstatMap);
      } else if (entry.type === "sensor") {
        const dev = mergedSensorList().find((x) => x.i === entry.dev.i) || entry.dev;
        updateSensorCard(dev);
      } else if (entry.type === "music") {
        const mp = music.find((x) => x.i === entry.dev.i) || entry.dev;
        updateFavoriteMusicRow(mp);
      } else if (entry.type === "lock") {
        const lk = locks.find((x) => x.i === entry.dev.i) || entry.dev;
        updateFavoriteLockRow(lk);
      } else if (entry.type === "garage") {
        const door = garageDoors.find((x) => x.i === entry.dev.i) || entry.dev;
        updateFavoriteGarageRow(door);
      } else if (entry.type === "shade") {
        const sh = windowShades.find((x) => x.i === entry.dev.i) || entry.dev;
        updateFavoriteShadeTile(sh);
      } else if (entry.type === "fan") {
        const f = ceilingFans.find((x) => x.i === entry.dev.i) || entry.dev;
        updateFanTile(f);
      }
    }
    updateStates();
    if (favTstatModeMenu) repositionFavoriteTstatModeMenu();
  }

  function renderFavoritesPopup() {
    closeFavoriteTstatModeMenu();
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-favorites");
    body.innerHTML = "";
    favDevMap.clear();
    favTstatMap.clear();
    favSensorMap.clear();
    sensorCardMap.clear();
    favMusicMap.clear();
    favLockMap.clear();
    favGarageMap.clear();
    favShadeMap.clear();
    favFanMap.clear();
    const entries = getFavoriteEntries();
    favPopupSig = favoritesPopupSignature();
    if (!entries.length) {
      body.textContent = "Tap the star on any device to add it here";
      return;
    }
    const grid = ce("div", "quick-fav-grid");
    for (const entry of entries) {
      if (entry.type === "light") {
        grid.appendChild(makeTile(entry.dev, "favorites"));
      } else if (entry.type === "outlet") {
        grid.appendChild(makeOutletTile(entry.dev, "favorites"));
      } else if (entry.type === "thermostat") {
        grid.appendChild(makeQuickTstatCard(entry.dev, favTstatMap));
      } else if (entry.type === "sensor") {
        grid.appendChild(makeFavoriteSensorCard(entry.dev));
      } else if (entry.type === "music") {
        grid.appendChild(makeMusicRow(entry.dev, "favorites"));
      } else if (entry.type === "lock") {
        grid.appendChild(makeLockRow(entry.dev, "favorites"));
      } else if (entry.type === "garage") {
        grid.appendChild(makeGarageRow(entry.dev, "favorites"));
      } else if (entry.type === "shade") {
        grid.appendChild(makeShadeTile(entry.dev, "favorites"));
      } else if (entry.type === "fan") {
        grid.appendChild(makeFanTile(entry.dev, "favorites"));
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
    if (!inTabView()) {
      const popup = ensureQuickPopup();
      syncQuickPopupWidthForOpen(popup);
    }
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-thermostats");
    body.innerHTML = "";
    tstatsPopupMap.clear();
    tstatsPopupSig = thermostatsListSignature();
    if (!thermostats.length) {
      body.textContent = "No thermostats selected — add thermostats in the Hubitat app settings";
      return;
    }
    const sorted = sortByRoomThenFullName(thermostats);
    const grid = ce("div", "quick-fav-grid");
    for (const t of sorted) grid.appendChild(makeQuickTstatCard(t, tstatsPopupMap));
    body.appendChild(grid);
  }

  function quickNavPopupHasContent(popup) {
    switch (popup) {
      case "locks": return locks.length > 0 || garageDoors.length > 0;
      case "scenes": return scenes.length > 0;
      case "hub-mode": return hubModes.length > 0;
      case "security": return hsmEnabled;
      case "blinds": return windowShades.length > 0;
      case "fans": return ceilingFans.length > 0;
      case "outlets": return outletsSeparateTab && outlets.length > 0;
      case "scheduling": return schedulerEnabled;
      case "sensors": return mergedSensorList().length > 0;
      case "thermostats": return thermostatsPopupEnabled && thermostats.length > 0;
      case "music": return music.length > 0;
      case "favorites": return getFavoriteEntries().length > 0;
      default: return false;
    }
  }

  function updateQuickNavVisibility() {
    if (reorderMode) return;
    let anyVisible = false;
    for (const { id, popup } of QUICK_NAV) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      const show = quickNavPopupHasContent(popup);
      btn.hidden = !show;
      const rec = navEls.get(popup);
      if (rec?.wrap) rec.wrap.hidden = !show;
      if (show) anyVisible = true;
    }
    // Lights tab is shown whenever tab mode is on (independent of content)
    if (tabMode && QUICK_LIGHTS_BTN) {
      QUICK_LIGHTS_BTN.hidden = false;
      const lightsRec = navEls.get("lights");
      if (lightsRec?.wrap) lightsRec.wrap.hidden = false;
      anyVisible = true;
    } else {
      const lightsRec = navEls.get("lights");
      if (lightsRec?.wrap) lightsRec.wrap.hidden = true;
    }
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
        case "blinds": refreshBlindsPopup(); break;
        case "fans": refreshFansPopup(); break;
        case "outlets": renderOutletsPopup(); break;
        case "scheduling":
          if (globalThis.__MLD?.renderSchedulerView) globalThis.__MLD.renderSchedulerView();
          break;
      }
      return;
    }
    if (!quickPopup?.classList.contains("open") || !quickPopupOpenType) return;
    switch (quickPopupOpenType) {
      case "hub-mode": renderHubModePopup(); break;
      case "locks": renderLocksPopup(); break;
      case "blinds": refreshBlindsPopup(); break;
      case "fans": refreshFansPopup(); break;
      case "music": renderMusicPopup(); break;
      case "favorites": refreshFavoritesPopup(); break;
      case "thermostats": refreshThermostatsPopup(); break;
      case "security": renderSecurityPopup(); break;
      case "sensors": refreshSensorsPopup(); break;
      case "scheduling":
        if (globalThis.__MLD?.renderSchedulerView) globalThis.__MLD.renderSchedulerView();
        break;
    }
  }

  function openQuickPopup(id, title) {
    cancelAllSlideGestures();
    if (colorSession) closeColorPopup(true);
    if (tstatSession) closeTstatPopup();
    closeMusicMasterPopup();
    closeFanMasterPopup();
    closeShadeMasterPopup();
    const popup = ensureQuickPopup();
    syncQuickPopupRef(popup);
    syncQuickPopupWidth(popup, id);
    popup._title.textContent = title;
    popup.setAttribute("aria-label", title);
    quickPopupOpenType = id;
    switch (id) {
      case "hub-mode": renderHubModePopup(); break;
      case "scenes": renderScenesPopup(); break;
      case "favorites": renderFavoritesPopup(); break;
      case "locks": renderLocksPopup(); break;
      case "blinds": refreshBlindsPopup(); break;
      case "fans": refreshFansPopup(); break;
      case "outlets": renderOutletsPopup(); break;
      case "music": renderMusicPopup(); break;
      case "security": renderSecurityPopup(); break;
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
    closeFavoriteTstatModeMenu();
    const popup = quickPopup || (globalThis.__MLD && globalThis.__MLD.quickPopup) || document.querySelector(".quick-popup");
    if (!popup) return;
    syncQuickPopupRef(popup);
    popup.hidden = true;
    popup.classList.remove("open");
    popup.classList.remove("quick-popup-wide");
    popup.classList.remove("quick-popup-hub-mode");
    quickPopupOpenType = null;
    favDevMap.clear();
    favTstatMap.clear();
    favSensorMap.clear();
    favMusicMap.clear();
    favLockMap.clear();
    favGarageMap.clear();
    favShadeMap.clear();
    favFanMap.clear();
    fansPopupMap.clear();
    fansPopupSig = "";
    shadePopupMap.clear();
    blindsPopupSig = "";
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
    updateCurrentCategoryTitle();
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

  function setQuickBodyClass(body, classes) {
    if (body === tabViewEl) body.className = "tab-view " + classes + " tab-body";
    else body.className = classes;
  }

  function currentBody() {
    if (tabMode && activeTab !== "lights") return ensureTabView();
    return ensureQuickPopup()._body;
  }

  function currentCategory() {
    if (tabMode && activeTab !== "lights") return activeTab;
    return quickPopupOpenType;
  }

  const POPUP_LABELS = {};
  for (const { popup, title } of QUICK_NAV) POPUP_LABELS[popup] = title;

  function currentCategoryLabel() {
    const cat = quickPopupOpenType || (tabMode && activeTab !== "lights" ? activeTab : null);
    if (!cat) return "Lights";
    return POPUP_LABELS[cat] || TAB_LABELS[cat] || cat;
  }

  function updateCurrentCategoryTitle() {
    if (CURRENT_CATEGORY_TITLE_EL) CURRENT_CATEGORY_TITLE_EL.textContent = currentCategoryLabel();
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
    if (fanMasterPopup && fanMasterPopup.classList.contains("open")) closeFanMasterPopup();
    if (shadeMasterPopup && shadeMasterPopup.classList.contains("open")) closeShadeMasterPopup();
    if (quickPopup && quickPopup.classList.contains("open")) closeQuickPopup();
    const tabChanged = id !== activeTab;
    if (tabChanged && SEARCH_EL) {
      SEARCH_EL.value = "";
      collapsedBeforeSearch = null;
      sensorCollapsedBeforeSearch = null;
    }
    activeTab = id;
    ensureTabView();
    const nonLights = id !== "lights";
    if (ROOMS_EL) ROOMS_EL.hidden = nonLights;
    if (tabViewEl) tabViewEl.hidden = !nonLights;
    if (ALL_ON_TRACK) ALL_ON_TRACK.hidden = nonLights;
    else if (ALL_ON_BTN) ALL_ON_BTN.hidden = nonLights;
    if (ALL_OFF_TRACK) ALL_OFF_TRACK.hidden = nonLights;
    else if (ALL_OFF_BTN) ALL_OFF_BTN.hidden = nonLights;
    if (CENTRAL_TSTAT_BTN) CENTRAL_TSTAT_BTN.hidden = !(tabMode && id === "thermostats");
    if (CENTRAL_MUSIC_BTN) CENTRAL_MUSIC_BTN.hidden = !(tabMode && id === "music");
    if (CENTRAL_BLINDS_BTN) CENTRAL_BLINDS_BTN.hidden = !(tabMode && id === "blinds");
    if (CENTRAL_FAN_BTN) CENTRAL_FAN_BTN.hidden = !(tabMode && id === "fans");
    if (SEARCH_EL) SEARCH_EL.placeholder = nonLights ? "Search " + (TAB_LABELS[id] || "items") : "Search lights or rooms";
    updateTabActiveStates();
    if (nonLights) {
      switch (id) {
        case "favorites": renderFavoritesPopup(); break;
        case "sensors": renderSensorsPopup(); break;
        case "thermostats": renderThermostatsPopup(); break;
        case "music": renderMusicPopup(); break;
        case "blinds": refreshBlindsPopup(); break;
        case "fans": refreshFansPopup(); break;
        case "outlets": renderOutletsPopup(); break;
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
    if (tabMode && activeTab !== "lights") showTab("lights");
    else closeQuickPopup();
  }

  function setTabMode(on) {
    if (cfg.enableDrawer && !on) return; // drawer mode forces tab mode on
    cfg.enableTabs = on;
    tabMode = on;
    saveTabsPref(on);
    if (QUICK_LIGHTS_BTN) QUICK_LIGHTS_BTN.hidden = !on;
    if (!on) {
      if (quickPopup && quickPopup.classList.contains("open")) closeQuickPopup();
      activeTab = "lights";
      if (ROOMS_EL) ROOMS_EL.hidden = false;
      if (tabViewEl) tabViewEl.hidden = true;
      if (ALL_ON_TRACK) ALL_ON_TRACK.hidden = false;
      else if (ALL_ON_BTN) ALL_ON_BTN.hidden = false;
      if (ALL_OFF_TRACK) ALL_OFF_TRACK.hidden = false;
      else if (ALL_OFF_BTN) ALL_OFF_BTN.hidden = false;
      if (CENTRAL_TSTAT_BTN) CENTRAL_TSTAT_BTN.hidden = true;
      if (CENTRAL_MUSIC_BTN) CENTRAL_MUSIC_BTN.hidden = true;
      if (CENTRAL_BLINDS_BTN) CENTRAL_BLINDS_BTN.hidden = true;
      if (CENTRAL_FAN_BTN) CENTRAL_FAN_BTN.hidden = true;
      if (SEARCH_EL) SEARCH_EL.placeholder = "Search lights or rooms";
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
  let priorTabsPref = cfg.enableTabs;
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
    else { closeTopbarOverflowMenu(); openDrawer(); }
  }

  function setDrawerMode(on) {
    const d = resolveDrawerDom();
    if (!d) return;
    cfg.enableDrawer = on;
    saveDrawerPref(on);
    if (on) {
      priorTabsPref = cfg.enableTabs;
      // Relocate search + quick-nav into the drawer (listeners preserved).
      d.searchSlot.appendChild(document.querySelector(".search-wrap"));
      d.navSlot.appendChild(document.querySelector(".quick-nav"));
      setDrawerLabels();
      APP_EL?.classList.add("drawer-mode");
      d.toggle.hidden = false;
      // Force tab mode on; disable the tabs checkbox while drawer is active.
      setTabMode(true);
      if (MENU_TABS_EL) {
        MENU_TABS_EL.disabled = true;
        const label = MENU_TABS_EL.closest(".topbar-overflow-check");
        if (label) { label.setAttribute("aria-disabled", "true"); label.style.opacity = "0.5"; label.style.pointerEvents = "none"; }
      }
    } else {
      APP_EL?.classList.remove("drawer-mode");
      if (drawerOpen || drawerClosing) closeDrawer();
      d.toggle.hidden = true;
      // Move search + quick-nav back to the topbar (original order: topbar-row, quick-nav, search-wrap).
      const nav = document.querySelector(".quick-nav");
      const search = document.querySelector(".search-wrap");
      if (nav) d.topbar.appendChild(nav);
      if (search) d.topbar.appendChild(search);
      if (nav) for (const btn of nav.querySelectorAll(".ghost-btn.icon-btn")) btn.removeAttribute("data-drawer-label");
      // Restore prior tab preference.
      if (MENU_TABS_EL) {
        MENU_TABS_EL.disabled = false;
        const label = MENU_TABS_EL.closest(".topbar-overflow-check");
        if (label) { label.removeAttribute("aria-disabled"); label.style.opacity = ""; label.style.pointerEvents = ""; }
      }
      setTabMode(priorTabsPref);
    }
    if (MENU_DRAWER_EL) {
      MENU_DRAWER_EL.checked = on;
      const label = MENU_DRAWER_EL.closest(".topbar-overflow-check");
      if (label) label.setAttribute("aria-checked", on ? "true" : "false");
    }
    updateQuickNavVisibility();
  }

  function closeConfirm(result) {
    const popup = confirmPopup || document.querySelector(".confirm-popup");
    if (!popup) return;
    popup.hidden = true;
    popup.classList.remove("open");
    const resolve = confirmPending;
    confirmPending = null;
    if (resolve) resolve(result);
  }

  function ensureConfirmPopup() {
    if (confirmPopup) return confirmPopup;
    const el = ce("div", "confirm-popup");
    confirmPopup = el;
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
    appendPopup(el);

    bindPopupDismiss(el, null, null, () => closeConfirm(false));
    cancel.addEventListener("click", (e) => { e.stopPropagation(); closeConfirm(false); });
    ok.addEventListener("click", (e) => { e.stopPropagation(); hapticTap(); closeConfirm(true); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.classList.contains("open")) closeConfirm(false);
    });

    el._msg = msg;
    el._ok = ok;
    return el;
  }

  function confirmAction({ message, confirmLabel, danger = false }) {
    return new Promise((resolve) => {
      cancelAllSlideGestures();
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

  async function tapAllOn() {
    if (!devices.length) { flash("No lights configured", true); return; }
    if (await confirmAction({ message: "Turn on all lights?", confirmLabel: "All on" })) allLights("on");
  }

  async function tapAllOff() {
    if (!devices.length) { flash("No lights configured", true); return; }
    if (await confirmAction({ message: "Turn off all lights?", confirmLabel: "All off", danger: true })) allLights("off");
  }

  if (ALL_ON_BTN && ALL_ON_TRACK && ALL_ON_RESTORE_BTN) {
    attachRoomSlideAction(ALL_ON_TRACK, ALL_ON_BTN, ALL_ON_RESTORE_BTN, {
      direction: "right",
      clickFallback: true,
      onTap: () => { void tapAllOn(); },
      onCommit: () => {
        snapshotRestoreApi("house").then((ok) => {
          if (ok) flash("Restoring home…");
        });
      },
      canCommit: () => !!snapshots[snapshotHouseKey()],
    });
  } else if (ALL_ON_BTN) {
    ALL_ON_BTN.addEventListener("click", () => { void tapAllOn(); });
  }
  if (ALL_OFF_BTN && ALL_OFF_TRACK && ALL_OFF_SAVE_BTN) {
    attachRoomSlideAction(ALL_OFF_TRACK, ALL_OFF_BTN, ALL_OFF_SAVE_BTN, {
      direction: "left",
      clickFallback: true,
      onTap: () => { void tapAllOff(); },
      onCommit: () => {
        snapshotSaveApi("house").then((ok) => {
          if (!ok) return;
          snapshots[snapshotHouseKey()] = { ts: Date.now(), count: devices.length };
          updateRoomSnapshotUi();
          flash("Home saved");
        });
      },
      canCommit: () => true,
    });
  } else if (ALL_OFF_BTN) {
    ALL_OFF_BTN.addEventListener("click", () => { void tapAllOff(); });
  }

  // ---------- filter ----------
  let collapsedBeforeSearch = null;
  let sensorCollapsedBeforeSearch = null;

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
      if (outletsInLightsRooms()) {
        for (const [, rec] of outletMap) rec.el.classList.remove("hidden");
      }
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
    if (outletsInLightsRooms()) {
      for (const [, rec] of outletMap) {
        rec.el.classList.toggle("hidden", !rec.el.dataset.name.includes(q));
      }
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
    if (activeTab === "sensors" && sensorRoomEls.size) {
      if (!q) {
        for (const [, rec] of sensorRoomEls) {
          for (const card of rec.body.querySelectorAll(".sensor-card")) card.classList.remove("search-hidden");
        }
        if (sensorCollapsedBeforeSearch) {
          for (const [rid, rec] of sensorRoomEls) {
            rec.card.classList.toggle("collapsed", sensorCollapsedBeforeSearch.has(rid));
          }
          sensorCollapsedBeforeSearch = null;
        }
        applySensorTypeFilter();
        return;
      }
      if (!sensorCollapsedBeforeSearch) sensorCollapsedBeforeSearch = sensorsCollapsedIdSet();
      for (const [, rec] of sensorRoomEls) {
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
  function sensorsCollapsedIdSet() {
    const set = new Set();
    for (const [rid, rec] of sensorRoomEls) if (rec.card.classList.contains("collapsed")) set.add(rid);
    return set;
  }

  function sensorsCollapsedSet() {
    const set = [];
    for (const [rid, rec] of sensorRoomEls) if (rec.card.classList.contains("collapsed")) set.push(rid);
    return set;
  }

  function persistSensorsCollapsed() {
    try { localStorage.setItem("mld_sensors_collapsed", sensorsCollapsedSet().join(",")); } catch {}
  }

  function allSensorRoomsCollapsed() {
    if (sensorRoomEls.size === 0) return true;
    for (const [, rec] of sensorRoomEls) if (!rec.card.classList.contains("collapsed")) return false;
    return true;
  }

  function expandAllSensorRooms() {
    for (const [, rec] of sensorRoomEls) rec.card.classList.remove("collapsed");
  }

  function collapseAllSensorRooms() {
    for (const [, rec] of sensorRoomEls) rec.card.classList.add("collapsed");
  }

  function restoreSensorsCollapsed() {
    for (const [, rec] of sensorRoomEls) rec.card.classList.remove("collapsed");
    let raw = null;
    try { raw = localStorage.getItem("mld_sensors_collapsed"); } catch {}
    if (!raw) return;
    const set = new Set(raw.split(",").filter(Boolean).map(Number));
    for (const [rid, rec] of sensorRoomEls) {
      if (set.has(rid)) rec.card.classList.add("collapsed");
    }
  }

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
    const useSensors = activeTab === "sensors" && sensorRoomEls.size > 0;
    const collapsed = useSensors ? allSensorRoomsCollapsed() : allRoomsCollapsed();
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
      if (activeTab === "sensors" && sensorRoomEls.size) {
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

  if (REORDER_DONE_BTN) {
    REORDER_DONE_BTN.addEventListener("click", finishReorderMode);
  }

  if (REORDER_CANCEL_BTN) {
    REORDER_CANCEL_BTN.addEventListener("click", cancelReorderMode);
  }

  if (OVERFLOW_BTN) {
    OVERFLOW_BTN.addEventListener("click", (e) => {
      e.stopPropagation();
      if (cfg.enableDrawer) closeDrawer();
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

  if (MENU_DRAWER_EL) {
    const drawerLabel = MENU_DRAWER_EL.closest(".topbar-overflow-check");
    MENU_DRAWER_EL.checked = cfg.enableDrawer;
    if (drawerLabel) drawerLabel.setAttribute("aria-checked", cfg.enableDrawer ? "true" : "false");
    MENU_DRAWER_EL.addEventListener("click", (e) => e.stopPropagation());
    MENU_DRAWER_EL.addEventListener("change", () => {
      setDrawerMode(MENU_DRAWER_EL.checked);
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

  if (MENU_OPEN_LOCAL_BTN) {
    MENU_OPEN_LOCAL_BTN.addEventListener("click", () => {
      closeTopbarOverflowMenu();
      navigateToLocal();
    });
  }

  if (MENU_OPEN_CLOUD_BTN) {
    MENU_OPEN_CLOUD_BTN.addEventListener("click", () => {
      closeTopbarOverflowMenu();
      navigateToCloud();
    });
  }

  if (MENU_LOCAL_URL_EL) {
    MENU_LOCAL_URL_EL.addEventListener("click", (e) => e.stopPropagation());
    MENU_LOCAL_URL_EL.addEventListener("change", () => {
      const v = MENU_LOCAL_URL_EL.value.trim();
      saveStoredLocalUrl(v);
      cfg.localUrl = v;
      if (!v) {
        try { localStorage.removeItem(LOCAL_OK_STORAGE_KEY); } catch {}
      }
      updateLocalModeMenuUI();
    });
    MENU_LOCAL_URL_EL.addEventListener("blur", () => {
      const v = MENU_LOCAL_URL_EL.value.trim();
      saveStoredLocalUrl(v);
      cfg.localUrl = v;
      if (!v) {
        try { localStorage.removeItem(LOCAL_OK_STORAGE_KEY); } catch {}
      }
      updateLocalModeMenuUI();
    });
  }

  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (cfg.theme === "auto") applyTheme("auto");
    });
  } catch {}

  applyTheme(cfg.theme);

  // ---------- polling ----------
  async function refresh() {
    if (isDashboardGateOpen()) return;
    try {
      const d = await fetchData();
      refreshLocalUrlFromConfig();
      updateLocalModeMenuUI();
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
    if (!document.hidden && !reorderMode) startPolling();
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  function clearWsReconnectTimer() {
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
  }

  function stopWS() {
    clearWsReconnectTimer();
    wsConnected = false;
    if (ws) {
      try { ws.close(); } catch {}
      ws = null;
    }
  }

  function pauseApp() {
    stopPolling();
    stopWS();
  }

  function resetUiOnResume() {
    cancelAllSlideGestures();
    closeConfirm(false);
    if (drawerOpen) closeDrawer();
    if (colorSession) closeColorPopup(false);
  }

  function syncApp() {
    if (document.hidden) return;
    if (isDashboardGateOpen()) return;
    refresh();
    if (!reorderMode) startPolling();
    startWS();
  }

  function resumeApp() {
    if (document.hidden) return;
    resetUiOnResume();
    syncApp();
  }

  // ---------- websocket (local only) ----------
  function startWS() {
    if (!cfg.useWebSocket) return;
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) return;
      try { ws.close(); } catch {}
      ws = null;
      wsConnected = false;
    }
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
          } else if (m.name === "hsmAlert" && !hsmLocked()) {
            hsmAlert = String(m.value || "");
            if (m.descriptionText) hsmAlertDesc = String(m.descriptionText);
            if (currentCategory() === "security") renderSecurityPopup();
          }
          return;
        }
        if (m.source !== "DEVICE" || m.deviceId == null) return;
        const deviceId = Number(m.deviceId);
        const shade = windowShades.find(x => x.i === deviceId);
        const shadeName = String(m.name || "");
        const shadeEvt = shade && (shadeName === "windowShade" || shadeName === "windowBlind" || shadeName === "position" || shadeName === "level" || shadeName === "switch");
        if (shadeEvt && applyShadeWsEvent(shade, shadeName, m.value)) {
          refreshShadeViews();
          if (shadeName !== "switch" && shadeName !== "level") return;
        }
        const rec = devMap.get(deviceId) || favDevMap.get(deviceId);
        if (rec && !rec.isOutlet) {
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
        const outletRec = outletMap.get(Number(m.deviceId)) || favDevMap.get(Number(m.deviceId));
        if (outletRec?.isOutlet && m.name === "switch") {
          const out = outlets.find((x) => x.i === Number(m.deviceId));
          if (out) out.s = (m.value === "on") ? 1 : 0;
          clearSwitchOptimistic(Number(m.deviceId));
          updateStates();
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
          else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
          return;
        }
        const garage = garageDoors.find(x => x.i === Number(m.deviceId));
        if (garage && String(m.name || "") === "door") {
          const opt = garageOptimistic.get(garage.i);
          if (opt && opt.until > Date.now()) return;
          garage.st = String(m.value || "");
          if (currentCategory() === "locks") renderLocksPopup();
          else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
          return;
        }
        const fan = ceilingFans.find(x => x.i === Number(m.deviceId));
        if (fan) {
          const name = String(m.name || "");
          const opt = fanOptimistic.get(fan.i);
          if (opt && opt.until > Date.now()) return;
          if (name === "switch") {
            fan.s = (m.value === "on") ? 1 : 0;
            if (fan.s === 0) fan.sp = "off";
          } else if (name === "speed") {
            fan.sp = String(m.value || "");
            const sp = fan.sp.toLowerCase();
            if (sp === "off") fan.s = 0;
            else if (sp) fan.s = 1;
          } else return;
          updateFanTile(fan);
          if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
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
        const sen = sensors.find(x => x.i === Number(m.deviceId));
        if (s || sen) {
          if (applySensorLiveAttr(m.deviceId, m.name, m.value, m.unit)) refreshSensorViews();
          return;
        }
        const valve = valves.find(x => x.i === Number(m.deviceId));
        if (valve) {
          const nm = String(m.name || "").toLowerCase();
          if (nm === "valve") {
            valve.st = String(m.value || "");
            const opt = valveOptimistic.get(valve.i);
            if (opt?.st != null && valve.st === opt.st) clearValveOptimistic(valve.i);
            if (currentCategory() === "sensors") refreshSensorsPopup();
            else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
          }
          return;
        }
      } catch {}
    };
    ws.onclose = () => {
      ws = null;
      wsConnected = false;
      restartPolling();
      if (!document.hidden) scheduleReconnect();
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  function scheduleReconnect() {
    if (!cfg.useWebSocket || document.hidden) return;
    wsRetry = Math.min(wsRetry + 1, 6);
    const delay = Math.min(15000, 1000 * 2 ** wsRetry);
    clearWsReconnectTimer();
    wsReconnectTimer = setTimeout(() => {
      wsReconnectTimer = null;
      startWS();
    }, delay);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pageWasHidden = true;
      pauseApp();
    } else if (pageWasHidden) {
      pageWasHidden = false;
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
      if (reorderMode) return;
      hapticTap();
      if (tabMode && TAB_CATEGORIES.has(popup)) showTab(popup);
      else openQuickPopup(popup, title);
      if (cfg.enableDrawer) closeDrawer();
    });
  });
  if (QUICK_LIGHTS_BTN) {
    QUICK_LIGHTS_BTN.innerHTML = LIGHTS_SVG;
    QUICK_LIGHTS_BTN.addEventListener("click", () => {
      if (reorderMode) return;
      hapticTap();
      if (tabMode) showTab("lights");
      if (cfg.enableDrawer) closeDrawer();
    });
    QUICK_LIGHTS_BTN.hidden = !tabMode;
  }
  setupNavReorderItems();
  postCall("applyNavOrder", postCall("getDisplayNavOrder"));
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
  if (CENTRAL_BLINDS_BTN) {
    CENTRAL_BLINDS_BTN.innerHTML = CENTRAL_BLINDS_SVG + '<span>All blinds</span>';
    CENTRAL_BLINDS_BTN.addEventListener("click", () => {
      hapticTap();
      openShadeMasterPopup();
    });
  }
  if (CENTRAL_FAN_BTN) {
    CENTRAL_FAN_BTN.innerHTML = CENTRAL_FANS_SVG + '<span>All fans</span>';
    CENTRAL_FAN_BTN.addEventListener("click", () => {
      hapticTap();
      openFanMasterPopup();
    });
  }
  if (tabMode) { ensureTabView(); updateTabActiveStates(); }
  if (cfg.enableDrawer) setDrawerMode(true);
  updateCurrentCategoryTitle();
  if (location.protocol === "https:" && "serviceWorker" in navigator) {
    navigator.serviceWorker.register(withToken("sw.js"), { scope: "./" }).catch(() => {});
  }

  // Password gate UI lives here (post2) so mld-app.js stays under Hubitat's 128 KB
  // File Manager limit — putting it in part1 previously left only ~3 KB headroom.
  let dashGateRecheckTimer = null;
  const DASH_GATE_RECHECK_MS = 8000;

  function stopDashGateRecheck() {
    if (dashGateRecheckTimer) {
      clearInterval(dashGateRecheckTimer);
      dashGateRecheckTimer = null;
    }
  }

  function syncDashboardAuthState(required) {
    if (required) {
      dashboardPasswordRequired = true;
      return;
    }
    dashboardPasswordRequired = false;
    clearDashSession();
    if (isDashboardGateOpen()) {
      const resolve = gateState?.resolve;
      stopDashGateRecheck();
      closeDashboardGate();
      resolve?.();
    }
  }

  async function fetchAuthStatus() {
    const r = await fetchWithTimeout(withToken("auth/status"), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  async function recheckDashboardAuthWhileGateOpen() {
    if (!isDashboardGateOpen()) {
      stopDashGateRecheck();
      return;
    }
    try {
      const status = await fetchAuthStatus();
      if (!status?.required) syncDashboardAuthState(false);
    } catch {}
  }

  function startDashGateRecheck() {
    stopDashGateRecheck();
    dashGateRecheckTimer = setInterval(recheckDashboardAuthWhileGateOpen, DASH_GATE_RECHECK_MS);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isDashboardGateOpen()) {
      recheckDashboardAuthWhileGateOpen();
    }
  });

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
      if (data?.required === false) {
        syncDashboardAuthState(false);
        return { ok: true };
      }
      if (!data?.session && !data?.dashSession) {
        return { ok: false, error: "Unlock failed" };
      }
      applyDashSessionFromResponse(data);
      return { ok: true };
    }
    try {
      const postUrl = withToken("auth/unlock");
      let r = await fetchWithTimeout(postUrl, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ password }),
      });
      let result = await parseUnlockResponse(r);
      if (result.ok || result.error === "wrong password") return result;
      const sep = postUrl.includes("?") ? "&" : "?";
      r = await fetchWithTimeout(postUrl + sep + "password=" + encodeURIComponent(password), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      return parseUnlockResponse(r);
    } catch {
      return { ok: false, error: "Unlock failed" };
    }
  }

  function ensureDashboardGatePopup() {
    if (gatePopup) return gatePopup;
    gatePopup = ce("div", "dash-gate-popup");
    gatePopup.hidden = true;
    gatePopup.setAttribute("role", "dialog");
    gatePopup.setAttribute("aria-modal", "true");
    gatePopup.setAttribute("aria-label", "Dashboard password");
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
    gatePopup.appendChild(panel);
    appendPopup(gatePopup);

    async function submitGate() {
      hapticTap();
      const password = input.value;
      if (!password) return;
      submit.disabled = true;
      const result = await unlockDashboard(password);
      submit.disabled = false;
      if (result.ok) {
        error.hidden = true;
        error.textContent = "";
        const resolve = gateState?.resolve;
        closeDashboardGate();
        resolve?.();
        return;
      }
      error.textContent = result.error === "wrong password" ? "Wrong password" : (result.error || "Unlock failed");
      error.hidden = false;
      gatePopup.classList.remove("shake");
      void gatePopup.offsetWidth;
      gatePopup.classList.add("shake");
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

    gatePopup._title = title;
    gatePopup._error = error;
    gatePopup._input = input;
    gatePopup._submit = submit;
    return gatePopup;
  }

  function openDashboardGate() {
    const popup = ensureDashboardGatePopup();
    const alreadyOpen = popup.classList.contains("open") && gateState?.resolve;
    if (!alreadyOpen) {
      popup._error.hidden = true;
      popup._error.textContent = "";
      popup._input.value = "";
    }
    popup.hidden = false;
    popup.classList.remove("shake");
    popup.classList.add("open");
    startDashGateRecheck();
    if (!alreadyOpen) requestAnimationFrame(() => popup._input.focus());
  }

  function closeDashboardGate() {
    if (!gatePopup) return;
    stopDashGateRecheck();
    gatePopup.classList.remove("open", "shake");
    gatePopup.hidden = true;
    gateState = null;
  }

  function promptDashboardPassword() {
    return new Promise((resolve) => {
      gateState = { resolve };
      openDashboardGate();
    });
  }

  async function ensureDashboardAccess() {
    if (ensureDashboardAccessTask) return ensureDashboardAccessTask;
    ensureDashboardAccessTask = (async () => {
      loadDashSession();
      let status;
      try {
        status = await fetchAuthStatus();
      } catch {
        try {
          status = await fetchAuthStatus();
        } catch {
          return;
        }
      }
      if (!status?.required) {
        syncDashboardAuthState(false);
        return;
      }
      syncDashboardAuthState(true);
      if (isDashSessionFresh()) {
        setupDashSessionActivityRenewal();
        return;
      }
      await promptDashboardPassword();
      // Unlock writes localStorage via applyDashSessionFromResponse; re-sync before /data.
      loadDashSession();
      setupDashSessionActivityRenewal();
    })();
    try {
      await ensureDashboardAccessTask;
    } finally {
      ensureDashboardAccessTask = null;
    }
  }

  (async function init() {
    consumePreferCloudParam();
    try {
      await ensureDashboardAccess();
    } catch (e) {
      console.error("Dashboard auth failed:", e);
    }
    loadingState();
    try {
      const d = await fetchData();
      if (applyLocalModeStrategy()) return;
      render(d);
      initAndroidLocalImmersive();
      startPolling();
      startWS();
    } catch (e) {
      console.error("Dashboard init failed:", e);
      // getJson already prompts on 401; only recover here if that path threw auth_required.
      if (e?.code === "auth_required" || /auth required/i.test(String(e?.message || ""))) {
        try {
          loadDashSession();
          if (!isDashSessionFresh()) await ensureDashboardAccess();
          const d = await fetchData();
          if (applyLocalModeStrategy()) return;
          render(d);
          initAndroidLocalImmersive();
          startPolling();
          startWS();
          return;
        } catch (retryErr) {
          console.error("Dashboard auth retry failed:", retryErr);
        }
      }
      const cloud = String(cfg.cloudUrl || loadStoredCloudUrl() || "").trim();
      if (isLocalOrigin() && cloud) {
        cfg.cloudUrl = cloud;
        navigateToCloud();
        return;
      }
      const detail = e?.message ? String(e.message) : "";
      setStatus("Cannot reach hub. Make sure you opened the dashboard via the app URL.", true);
      emptyState(
        '<div class="empty"><h2>Connection error</h2>' +
        'Could not load /data. Open this page through the Modern Dashboard app URL on your hub.' +
        (detail ? '<p class="empty-detail">' + detail.replace(/</g, "&lt;") + '</p>' : '') +
        (cloud ? '<p class="empty-detail"><button type="button" class="ghost-btn" id="fallback-cloud-btn">Open cloud mode</button></p>' : '') +
        '</div>'
      );
      const fallbackBtn = document.getElementById("fallback-cloud-btn");
      if (fallbackBtn) {
        fallbackBtn.addEventListener("click", () => {
          cfg.cloudUrl = cloud;
          navigateToCloud();
        });
      }
    }
  })();

  if (globalThis.__MLD) globalThis.__MLD.updateQuickNavVisibility = updateQuickNavVisibility;

  // __MLD_SPLIT3__

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
    schedulerEnabled = data.schedulerEnabled !== false;
    if (!schedulerEnabled) {
      schedDraft = null;
      schedEditingId = null;
      schedStep = 1;
    }
    if (Array.isArray(data.schedules)) schedules = data.schedules;
    if (data.sunTimes && typeof data.sunTimes === "object") {
      sunTimes = { sunrise: data.sunTimes.sunrise ?? null, sunset: data.sunTimes.sunset ?? null };
    }
    schedUse24Hour = data.schedUse24Hour === true;
    if (schedulerViewIsActive() && schedulerEnabled) renderSchedulerActive();
  }

  function schedulerViewIsActive() {
    if (inTabView()) return activeTab === "scheduling";
    return quickPopupOpenType === "scheduling";
  }

  function schedulerHasContent() {
    return schedulerEnabled;
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
        hapticTap(8);
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
    doneBtn.addEventListener("click", () => { hapticTap(); close(true); });
    bindPopupDismiss(overlay, panel, null, () => close(false));
    appendPopup(overlay);
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
      hapticTap();
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
      hapticTap();
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
          hapticTap();
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
      const r = await fetch(withToken("schedules/" + path), {
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
    const popup = ensureQuickPopup();
    syncQuickPopupRef(popup);
    syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-scheduler");
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
      hapticTap();
      toggle.disabled = true;
      const res = await schedApi("toggle", { id: s.id });
      toggle.disabled = false;
      if (res?.ok) {
        if (Array.isArray(res.schedules)) schedules = res.schedules;
        renderSchedulerActive();
      } else {
        flash(res?.error || "Toggle failed", true);
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
      hapticTap();
      testBtn.disabled = true;
      const res = await schedApi("test", { id: s.id });
      testBtn.disabled = false;
      flash(res?.ok ? "Ran schedule actions" : (res?.error || "Test failed"), !res?.ok);
    });
    controls.appendChild(testBtn);

    const delBtn = ce("button", "ghost-btn sched-icon-btn sched-del-btn");
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      if (!confirm("Delete this schedule?")) return;
      hapticTap();
      delBtn.disabled = true;
      const res = await schedApi("delete", { id: s.id });
      delBtn.disabled = false;
      if (res?.ok) {
        if (Array.isArray(res.schedules)) schedules = res.schedules;
        renderSchedulerActive();
      } else {
        flash(res?.error || "Delete failed", true);
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
          if (!tr.mode && hubModes.length) tr.mode = hubModes[0];
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
        if (!/^\d{1,2}:\d{2}$/.test(tr.time || "")) { flash("Enter a valid time", true); return false; }
      } else {
        const off = Number(tr.offsetMin);
        if (!Number.isFinite(off) || off < -720 || off > 720) { flash("Offset must be between -720 and 720 minutes", true); return false; }
      }
    }
    if (tr.kind === "weekly" && (!tr.days || !tr.days.length)) { flash("Pick at least one day", true); return false; }
    if (tr.kind === "once" && !tr.at) { flash("Pick a date and time", true); return false; }
    if (tr.kind === "mode" && !tr.mode) { flash("Pick a hub mode", true); return false; }
    return true;
  }

  function renderSchedModeTriggerPicker(tr) {
    const wrap = ce("div", "sched-field");
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = "When hub mode becomes";
    wrap.appendChild(lbl);
    if (!hubModes.length) {
      const empty = ce("p", "sched-empty");
      empty.textContent = "No hub modes available.";
      wrap.appendChild(empty);
      return wrap;
    }
    const grid = ce("div", "sched-mode-grid");
    for (const m of hubModes) {
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
    if (!hubModes.length) {
      const empty = ce("p", "sched-empty");
      empty.textContent = "No hub modes available.";
      wrap.appendChild(empty);
      return wrap;
    }
    const selected = new Set(schedDraft.onlyInModes || []);
    const grid = ce("div", "sched-mode-grid");
    for (const m of hubModes) {
      const b = ce("button", "sched-type-card " + (selected.has(m) ? "is-active" : ""));
      b.type = "button";
      b.textContent = m;
      b.addEventListener("click", () => {
        hapticTap();
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
      ...(outlets.length ? [{ k: "outlets", label: "Outlets" }] : []),
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
      if (!schedDraft.action.target) { flash("Pick a type", true); return; }
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
    else if (t === "outlets") wrap.appendChild(renderSchedOnOffDeviceAction(outlets, "Select outlets", "No outlets configured. Add outlets in the companion app device settings."));
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
      const roomOrder = [...(rooms || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
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
          hapticTap();
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
            hapticTap();
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
            hapticTap();
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
    for (const d of devices) {
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
        hapticTap();
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
        hapticTap();
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
        const { el: levelTrack } = makeLevelTrackSlider({
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
        const { el: ctTrack } = makeCtTrackSlider({
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
      const roomOrder = [...(rooms || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
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
          hapticTap();
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
    for (const t of thermostats) {
      const sel = selectedIds.has(String(t.i));
      const row = ce("div", "sched-light-toggle-row");
      const check = ce("button", "sched-check " + (sel ? "is-on" : ""));
      check.type = "button";
      check.textContent = sel ? "\u2713" : "";
      const toggle = () => {
        hapticTap();
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
    if (!hubModes.length) {
      const empty = ce("p", "sched-empty");
      empty.textContent = "No hub modes available.";
      wrap.appendChild(empty);
      return wrap;
    }
    const grid = ce("div", "sched-mode-grid");
    for (const m of hubModes) {
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
    if (ac.target === "lights" && (!ac.states || !ac.states.length)) { flash("Select at least one light", true); return; }
    if (ac.target === "outlets" && (!ac.states || !ac.states.length)) { flash("Select at least one outlet", true); return; }
    if (ac.target === "thermostats" && (!ac.devices || !ac.devices.length)) { flash("Select at least one thermostat", true); return; }
    if (ac.target === "hubMode" && !ac.mode) { flash("Pick a hub mode", true); return; }
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
      flash("Schedule saved");
      renderSchedulerActive();
    } else {
      flash(res?.error || "Save failed", true);
    }
  }

  Object.assign(globalThis.__MLD, { applySchedulesFromData, schedulerHasContent, renderSchedulerView });
  globalThis.__MLD.updateQuickNavVisibility?.();

})();
