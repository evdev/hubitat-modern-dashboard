# Changelog

## 0.3.20

- **Fix:** cloud dashboard could show only a bare top bar (All on/off) after embed-card
  work — Hubitat Cloud drops OAuth responses near its ~128 KB MQTT limit, and
  `mld-app-post2.js` had grown to ~122 KB (it hosts boot/`init`). Rebalanced chunks so
  post2 stays ~81 KB; shades/fans/sensors/scenes move to post3, which loads with the
  other scripts again (no longer deferred).

## 0.3.19

- **Performance:** cloud File Manager asset cache no longer clears on every dashboard
  HTML load. It re-reads `mld-index.html`, compares its embedded `?v=` (plus Groovy
  app version) to the cache generation, and only invalidates JS/CSS when that changes —
  so HPM file updates still apply without Done/reboot, while unchanged reloads keep the
  warm in-memory cache.

## 0.3.18

- **Fix:** cloud dashboard could keep serving stale JS after File Manager updates
  (HPM), while local LAN worked — local loads `/local/mld-*` directly; cloud used an
  in-memory asset cache that did not refresh until Done/reboot. Interim fix cleared the
  cache on each HTML load (refined in 0.3.19).

## 0.3.17

- **Fix:** dashboard could fail to leave the loading shell when Favorites had an
  HTTPS embed card plus saved device sizes — size lookup assumed every favorite
  entry had a device (`e.dev.i`) and threw on embed entries.

## 0.3.16

- **Fix:** favorites embed cards could disappear or ignore saved layout after `/data`
  refresh — embed and layout arrays are updated in place so all JS chunks share the
  same `__MLD` references.

## 0.3.15

- **Favorites:** embed cards style and layout load with the main dashboard (not only
  after the deferred JS chunk), so the Favorites tab looks correct on first open.
- **Favorites:** embed editor and reorder mode no longer lose embed state when live
  `/data` refreshes arrive from another chunk.

## 0.3.14

- **Favorites:** HTTPS embed cards — add iframe widget URLs (Google Calendar embed,
  weather widgets, etc.) from overflow **Add embed** or the empty state. Cards are
  sandboxed, lazy-loaded, resizable (standard / wide / tall / near full-screen),
  expandable to a temporary full-viewport overlay, and can interleave with device
  favorites. Only absolute `https://` sources are accepted; use the provider’s
  iframe embed link (normal websites often refuse framing). **Open** always
  available as a fallback.

## 0.3.13

- **Favorites:** new **tall (2×4)** size preset for thermostats, locks, shades, fans,
  music, and valve sensors — same three choices for all of them: **square** (default),
  **full**, and **tall**. Garage doors keep full / square / wide.
- **Favorites:** denser grid on tablets — square and tall tiles span two rows so
  standard compact tiles tuck beside them without stretching.
- **Favorites:** on wider screens, **full** presets for controlled devices use a
  horizontal layout (setpoints and mode buttons, lock icon + actions, shade slider,
  fan speed, music transport, valve open/close) so controls stay on one row.
- **Favorites:** sensor favorite cards update type/alert styling correctly on live
  status changes.

## 0.3.12

- **Favorites:** lock tiles support full and square sizes only (wide removed);
  existing lock favorites saved as wide migrate to square automatically.
  Garage doors still support wide.

## 0.3.11

- **Favorites:** on phones, wide/square/standard/compact tiles use a single column
  (only full-width favorites span two columns).
- **Favorites:** wide lock tiles — horizontal layout with icon, name, and side-by-side
  Lock/Unlock buttons; icon-only buttons on narrow screens.
- **Favorites:** thermostat tile mode colors update correctly on live status changes.

## 0.3.10

- **Favorites:** larger lock icons on favorite tiles; square preset shows Lock/Unlock
  labels again with slightly taller buttons.

## 0.3.9

- **Favorites:** lock tiles use blue open/closed lock icons that update with state;
  unlocked tiles get a red border and tint so status is obvious at a glance.

## 0.3.8

- **Favorites:** lock tiles show a centered lock icon with locked/unlocked styling;
  square preset uses icon-only Lock/Unlock buttons to fit the layout.
- **Favorites:** size saves are more reliable when device metadata loads after the
  first paint — sizes are kept through hub sync instead of being dropped locally.

## 0.3.7

- **Favorites:** square tile preset uses a true 1:1 aspect ratio at every breakpoint
  (including phones) instead of fixed heights that could overflow or clip.
- **Favorites:** lock and garage square tiles — tighter layout, status hidden in
  favor of name + stacked Lock/Unlock buttons that fit the square.

## 0.3.6

- **Favorites:** tile sizes load immediately from a local cache on open, then sync
  with the hub when `/data` arrives — no flash of default sizes on refresh.
- **Favorites:** reorder mode shows live size previews when cycling presets,
  including on phone resize/rotation.
- **Favorites:** lock and garage door tiles lay out correctly in square and wide
  size presets.

## 0.3.5

- **Fix:** favorites tile sizes could fail to save — the JS chunk rewriter now
  handles object spread (`{...favoriteSizes}`) so reorder/size changes persist
  correctly.

## 0.3.4

- **Favorites:** responsive tile-size layout on phones — 2-column and single-column
  breakpoints, content-based heights instead of crushed aspect ratios.
- **Favorites:** clearer reorder overlay — Size button uses a 2×2 control grid on
  standard/compact tiles, improved tap handling, and updated on-screen hints.

## 0.3.3

- **Favorites:** customizable tile size per favorite — in Reorder mode, tap the size
  button on each tile to cycle through allowed presets (standard, wide, compact for
  lights/outlets/sensors; full, square, wide for locks, shades, fans, and music;
  thermostats: full or square). Sizes are saved on the hub and sync across devices.

## 0.3.2

- **Favorites:** reorder favorite tiles from the Favorites tab via overflow menu
  → Reorder. Drag handles and move buttons update the saved favorites order;
  compact tiles reflow responsively while wide favorites stay full-width.
- **Dashboard options:** choose which category tab opens on first load (Lights by
  default; falls back to Lights when the chosen tab has no content).
- **Setup:** hub file login uses `127.0.0.1` (HPM pattern) with clearer log messages
  for rejected login vs missing session cookie.

## 0.3.1

- **Setup:** Hub file access credentials persist in app state (Hubitat clears password
  fields on save); cached hub login cookie with clearer errors when File Manager reads
  fail or hub admin login is wrong.
- **Setup:** improved missing-file and Hub Login Security guidance on the companion app page.

## 0.3.0

- **Thermostats:** All thermostats bulk control shows mode buttons even when drivers
  omit `supportedThermostatModes`, so you can pick heat/cool before adjusting setpoints.
  Room multi-thermostat groups stay setpoint-only.

## 0.2.99

- **Performance:** defer `mld-app-post3.js` (Cameras + Scheduler) until after the first
  Lights render; load on demand when those tabs open, with retry on failure.
- **Local dashboard:** post3 URL carried in page meta so direct `/local/` asset rewrites
  still work when Hub Login Security is off.

## 0.2.98

- **Performance:** data-first startup — load `/data` immediately instead of blocking on
  `/auth/status`; password gate opens only on 401. Session renewal still arms from
  `/data` when a saved session is active.

## 0.2.97

- **Performance:** in-memory File Manager asset cache on the hub (cleared on app update;
  version-keyed, ~768 KB cap).
- **Performance:** versioned CSS/JS served with long-lived `immutable` cache headers;
  HTML, JSON, and API responses use `no-store`.
- **Local dashboard:** when opened on LAN without Hub Login Security, CSS/JS load
  directly from `/local/mld-*` instead of through the app proxy.

## 0.2.96

- **Build:** esbuild minifies CSS and JS at build time (more headroom under the 124 KB
  File Manager limit per chunk).
- **Deploy:** `mld-app-pre.js` removed — constants from `src/app-pre.js` are merged into
  `mld-app.js`; HPM and manual installs now ship **11** File Manager assets (was 12).

## 0.2.95

- **Logging:** server-side failures (commands, batch, async light jobs, hub mode, HSM, scenes, scheduler) now write to Hubitat Logs with device and error context.
- **Debug logging:** optional preference under Dashboard options; logs command traces when enabled and auto-disables after 30 minutes. Passwords and PINs are never logged.
- **Debug logging:** auto-off timer re-arms after hub reboot and no longer resets on unrelated app saves.

## 0.2.94

- **Companion app:** reorganized preferences on a single page — dashboard links near the top, device pickers split into Lights & outlets, Climate, Shades/fans/media, Locks & garage, Sensors, and Cameras; Options, hub mode/scenes, and scheduler merged under Dashboard options; password and HSM merged under Security & access; About and Light control collapsed by default.
- **Quick nav:** optional toggles to hide **Hub mode** and **Scenes** from the dashboard quick menu.
- **Cameras:** camera reorder requires the local dashboard URL; removed unused full-screen expand overlay (HD toggle remains in-grid).

## 0.2.93

- **Cameras:** overflow layout picker (1 / 2 / 3 columns) on the Cameras tab; preference saved per device.

## 0.2.92

- **Cameras:** HD toggles high-res stream in the grid tile (no expand overlay); button nudged up and right.

## 0.2.91

- **Cameras:** HD button on dual-stream tiles (initial in-place stream switch).

## 0.2.90

- Thermostat fan modes: hide fan controls when `supportedThermostatFanModes` is
  missing or empty, matching Hubitat’s built-in dashboards (no default Auto /
  Circulate / On list).

## 0.2.89

- **Cameras:** even larger reorder controls (80px touch targets, wider overlay padding)
  on the Cameras tab.

## 0.2.88

- **Cameras:** larger reorder controls (drag handle and up/down buttons) for easier
  touch use on the Cameras tab.

## 0.2.87

- **Cameras:** manual reorder on the Cameras tab via overflow **Reorder** — drag handle and up/down buttons on each tile; order syncs across devices (`cameraOrder`).

## 0.2.86

- **Sensors:** security and life-safety tiles show **Last activity ·** (not enrollment or other driver internals).
- **Sensors:** typed sensor cards only include card-worthy secondary readings in `ex[]` (battery, temperature, humidity, illuminance, pressure, CO₂/CO); generic sensors still discover other non-skipped attrs.
- **Backend:** fall back to Hubitat `getLastActivity()` when drivers omit `lastActivity` / `lastOpened` timestamp attributes.

## 0.2.85

- **Cameras:** grid tiles use go2rtc sub/low stream (`u`); tap a tile for full-screen main/high stream (`uh`) from grouped go2rtc Camera devices (`streamRoles`).
- **Backend:** parses `streamRoles` on camera devices and emits separate WebRTC embed URLs for grid vs expand.

## 0.2.84

- **Cameras:** always embed `webrtc.html?media=video+audio`; unmute via go2rtc’s own
  player controls (removed redundant mDash mute toggle that only switched stream tracks).

## 0.2.83

- **Local mode:** Android cloud no longer shows “You’re home” whenever a local URL
  is known. An authenticated `/lan-probe` request uses Chrome Local Network Access
  and a one-time, no-store nonce; the banner appears only when the hub echoes that
  nonce. Removed silent auto-redirect based on recent local use.

## 0.2.82

- **Cameras:** hide the Cameras tab unless the dashboard is opened via the local hub URL
  (not cloud HTTPS), so go2rtc HTTP embeds never trigger mixed-content “Not secure” warnings.

## 0.2.81

- **Fix:** move Cameras tab code (WebRTC embeds, mute/unmute, viewport gating) into
  `mld-app-post3.js` so `mld-app-post2.js` stays safely under the 124 KB File Manager
  limit — restores a working dashboard while keeping 0.2.79 camera features.
- **Cameras:** mute button SVG constants moved to `mld-app-pre.js` to save chunk space.

## 0.2.80

- **Cameras:** hide search bar on the Cameras tab via layout class (more reliable than
  toggling the search element directly).

## 0.2.79

- **Cameras:** switch to go2rtc **WebRTC** embed (`webrtc.html`) — lower latency than
  `stream.html`; streams start muted (`media=video`).
- **Cameras:** working mute/unmute per tile (toggles `media=video+audio`); only one
  camera unmuted at a time; auto-mute when a tile scrolls off-screen.
- **Cameras:** hide the search bar on the Cameras tab.

## 0.2.78

- **Cameras:** new Cameras tab (requires **Enable tabs**) for go2rtc Camera devices —
  live streams load from your LAN go2rtc server when each tile scrolls into view, and
  stop when off-screen or when leaving the tab.
- **Cameras:** companion app picker and stream URL derivation from go2rtc snapshot URLs;
  use the local hub dashboard URL (not cloud) unless the phone can reach go2rtc via VPN.

## 0.2.77

- **UI:** hide **Expand all rooms** when the current view has no collapsible room
  sections (Lights tab or Sensors quick popup).

## 0.2.76

- **Rooms:** companion app option to hide temperature and thermostat indicators on
  room cards (default on); climate-only rooms are hidden from the Lights tab when off.
- **Dashboard password:** sessions invalidate when the password is disabled or changed;
  password gate dismisses automatically when protection is turned off (including while
  the gate is open).

## 0.2.75

- **Blinds:** shade commands route correctly when a device is also listed as a light
  (e.g. Switch Level shades); `/device` refresh returns shade state/position.
- **Blinds:** live updates handle `windowBlind`, `level`, and `switch` events; position
  parsing tolerates non-integer hub values.
- **Blinds:** reconcile and WebSocket paths share shade refresh logic so dual-listed
  devices stay in sync.

## 0.2.74

- **Blinds master popup:** Open/Close stay clickable while shades move so you can
  reverse direction; active state and slider update immediately on bulk commands.
- **Blinds:** optimistic UI clears when the hub reports the settled open/closed state
  even if we still held opening/closing.

## 0.2.73

- **Scheduler:** optional "Hide scheduler" app preference — hides the Scheduler tab and stops all schedule jobs on the hub while keeping saved schedules for re-enable.
- **Scheduler:** clear in-progress draft when disabled; preview server mirrors hub 403/empty-schedules behavior.
- **Scheduler:** nav reorder and About section respect the hide-scheduler preference.

## 0.2.72

- **Blinds:** three device pickers — Window Shade, Window Blind, and Switch Level —
  so dimmer-style shade/blind drivers (Virtual Shade, many community motors) can be
  selected even when they lack Window Shade. Migrates selections from the prior
  Virtual Shade-only picker. Position/status fall back to `level` / `switch`;
  open/close/set/stop fall back to on/off/`setLevel` when needed.
- **Docs:** Switch Level shade picker limitation documented — Hubitat lists every
  dimmer there; select only real shades/blinds, not ordinary lights.

## 0.2.71

- **Blinds:** support Hubitat's built-in **Virtual Shade** driver — separate picker,
  position from `level` when `position` is absent, and open/close/set/stop commands
  fall back to switch/level drivers when Window Shade commands aren't available.

## 0.2.70

- **Thermostats tab:** fix +/- on quick thermostat cards — setpoint changes no longer
  run full dial-popup rendering when the dial is closed (which could abort the hub
  command and skip the card refresh).

## 0.2.69

- **Deploy fix:** build now asserts split JS chunks have no bare cross-chunk
  references; fixes `activeTab` in quick-popup width sync (`M.activeTab`).

## 0.2.68

- **Deploy fix:** JS chunk rewriter now expands object shorthand (`{ foo }`) to
  `{ foo: M.foo }` so cross-chunk references resolve correctly in **All fans** /
  **All blinds** and other split code.

## 0.2.67

- **Deploy fix:** build splitter no longer rewrites object shorthand properties
  (`{ foo }`), which broke **All fans** / **All blinds** bulk controls and other
  chunk code; build now runs `node --check` on every JS chunk.

## 0.2.66

- **Fans:** **All fans** top-bar control on the Fans tab — multi-select target menu,
  then turn selected fans on/off or set a common speed.
- **Blinds:** **All blinds** top-bar control on the Blinds tab — multi-select target
  menu, then open, close, or set position for the selection.
- **Docs:** HPM install instructions updated — **Modern Dashboard** is in the default
  Hubitat Package Manager repository (no custom repo URL required).
- **Docs:** File Manager asset count corrected to 12 files (`mld-app-core.js`);
  scheduler and plain-switch descriptions aligned with current app behavior.

## 0.2.65

- **Sensors:** filter chips count merged tiles in every matching category — for
  example, a temp+humidity tile appears under both Temperature and Humidity filters.

## 0.2.64

- **Sensors:** new Shock / glass-break picker and tile type.
- **Sensors:** motion, contact, shock, leak, smoke, and presence tiles show when
  the device last reported activity (for example, "Last · 3 min ago").
- **Sensors:** improved multi-picker merge — temperature + humidity or illuminance
  stays temperature-primary; temperature + generic keeps the generic primary with
  temperature in the footer; alert types stay primary with other readings secondary.
- **Sensors:** filter chips reflect the merged tile type (temp+humidity counts as
  Temperature).

## 0.2.63

- **Sensors:** multi-capability devices show one tile with the primary reading large
  and up to four secondary readings (humidity, light level, pressure, CO₂, and more).
- **Sensors:** devices in both Temperature and Humidity pickers merge into one
  temperature-primary tile with humidity secondary.
- **Sensors:** temperature-only selections surface other environmental readings when
  the hardware reports them; live WebSocket updates cover secondary attributes.

## 0.2.62

- **Ceiling fans:** better compatibility with more fan drivers — correct speed
  names when the hub stores a name→level map, plus `setFanSpeed` / `setLevel`
  fallbacks when `setSpeed` isn’t available.
- **Ceiling fans:** speed buttons fall back to low/medium/high when a driver
  reports dim levels instead of speed names.
- **Favorites:** a device in both Lights and Fans pickers shows as a fan tile.

## 0.2.61

- **Lights:** devices in each room sort alphabetically by their displayed name.
- **Sorting:** case-insensitive alphabetical order across category tabs (Fans,
  Blinds, Outlets, Music, Thermostats, Locks, and more).
- **Favorites & Outlets:** light and outlet tiles show the full device name
  instead of the shortened room-stripped label.

## 0.2.60

- **Lights:** devices within each room are sorted alphabetically by their displayed
  name (after room-prefix stripping).

## 0.2.59

- **Ceiling fans:** new Fans tab for `FanControl` devices — tap to turn on/off (hub
  restores last speed), use +/− to step through supported speeds. Works with typical
  3/4-speed AC fans and DC fans that report their own speed list.
- **Fans & Blinds:** smoother live updates, scroll position kept on refresh, and
  full-height lists in category tabs.
- **Fans:** blade animation speed matches the selected speed.
- **Deploy fix:** JS files rebalanced so HPM/File Manager upload stays under the
  hub’s per-file size limit.

## 0.2.58

- **Fans & Blinds:** live status updates without rebuilding the whole list; scroll
  position is kept when the dashboard refreshes.
- **Fans:** blade animation speed matches the selected speed (works with multi-step
  DC fans, not just low/medium/high).
- **Category tabs:** Fans and Blinds lists use full tab height instead of a short
  clipped scroll area.

## 0.2.57

- **Ceiling fans:** new Fans tab for `FanControl` devices with on/off (hub
  restores last speed) and +/− to step through supported speeds. Works with
  typical AC 3/4-speed fans and DC fans that report a speed list.

## 0.2.56

- **Sensors:** grouped by room with collapsible sections, type labels, search, and
  expand/collapse-all.
- **Lights:** room On/Off controls are hidden when a room has no lights.
- **Thermostats:** mode and fan buttons match what each device actually supports,
  including heat-only or cool-only units and drivers that report limited fan modes.
- **Thermostats:** tap a thermostat in Favorites or the Thermostats view to open
  that unit’s controls. In rooms with more than one thermostat, use the target
  picker to switch units; mode and fan controls apply to one selected unit at a
  time.

## 0.2.55

- Thermostat dial mode/fan controls always follow the open device’s own
  `supportedThermostatModes` / `supportedThermostatFanModes` (not a merge of
  other units in the room).

## 0.2.54

- Thermostat fan modes: empty `supFM` from the driver means no fan controls (not
  “unknown”).
- Favorites thermostat tap opens that device’s dial, not the room’s first
  thermostat.

## 0.2.53

- Thermostat supported modes/fan modes: emit normalized comma-separated strings in
  `/data` (handles collections, JSON arrays, and quoted tokens).
- Thermostat dial: build mode buttons only from the device’s supported mode list
  (no hidden placeholder buttons).

## 0.2.52

- Thermostat list attributes: normalize bracketed string values (JSON or
  comma-separated) into a properly quoted JSON string array in `/data`.

## 0.2.51

- Thermostat list attributes: serialize Hubitat collections as a JSON string array
  via `jsonStr` per item (avoids `JsonOutput` quirks on driver list values).

## 0.2.50

- Thermostat supported modes/fan modes/fan speeds: serialize Hubitat list attributes
  as JSON arrays in `/data` and parse them reliably in the UI (fixes drivers that
  expose only `cool`/`off` or similar subsets).
- Thermostat dial: honor empty `supM` / `supFM` from the device instead of
  substituting default mode lists.

## 0.2.49

- Thermostat fan modes: read `supportedThermostatFanModes` when drivers expose it
  (fallback to `supportedFanModes`).
- Thermostat mode buttons: enforce `display: none` when hidden so unsupported modes
  do not leave empty gaps in the dial popup.

## 0.2.48

- Sensors tab: room headers collapse/expand on tap, expand/collapse-all works in
  Sensors view, and rooms start expanded unless previously collapsed.
- Lights view: hide room On/Off controls when a room has no lights.

## 0.2.47

- Sensors view grouped by Hubitat room with collapsible room sections, type
  sub-labels within each room, and search/filter support across the room layout.

## 0.2.46

- Companion app preferences cleanup: unlock PIN lives under **Locks / garage
  doors**; thermostat quick-menu toggle sits with the thermostat picker (removed
  separate Locks and Thermostats sections).

## 0.2.45

- Companion app: locks and garage door openers moved to a dedicated **Locks /
  garage doors** preferences section (clearer than mixing with other device types).

## 0.2.44

- Garage door support in the **Locks** quick-nav popup: select devices with
  `capability.garageDoorControl`, open/close controls, favorites, and optional
  unlock PIN on open (same PIN as locks).

## 0.2.43

- Fix Sensors tab empty for authorized non-temperature sensors: Hubitat can leave
  Groovy field constants null (same class of bug as session TTL). Sensor type
  tables are now methods, and device pickers are read via direct input fields
  instead of `settings[name]`.

## 0.2.42

- Dashboard password sessions: use `dashSessionTtlMs()` method instead of a Groovy
  field (Hubitat could leave the constant null); safer session sequence handling.

## 0.2.41

- Dashboard password sessions: store opaque tokens in hub state with sliding 7-day
  renewal via new `/auth/renew` endpoint (replaces signed tokens that broke on hub
  password changes and sandbox limits). Client renews server-side on activity.

## 0.2.40

- Fix multi-sensors disappearing from the Sensors view when they are also
  authorized as temperature sensors or another dashboard device type.
- Add an **Other / generic sensors** picker for devices that only expose
  Hubitat's base Sensor capability.

## 0.2.39

- Remove optional offline device indicator (deferred; see
  [docs/deferred/offline-device-status.md](docs/deferred/offline-device-status.md)).

## 0.2.38

- Category quick-nav icons align left (scrollable row) instead of centered.

## 0.2.37

- Optional **Show inactive devices as offline** companion setting (removed in 0.2.39).

## 0.2.36

- Dashboard password: re-sync session from localStorage after unlock; derive expiry
  from signed token prefix when missing; retry /data once on 401 before re-prompting.

## 0.2.35

- Dashboard password unlock: avoid `Long.toHexString` and `JsonOutput.toJson` in the
  unlock handler (Hubitat sandbox blocks them); use decimal djb2 sig and manual JSON.
- Unlock errors now include a `detail` field surfaced in the password gate UI.

## 0.2.34

- Dashboard password unlock: use stateless signed sessions (djb2 hash) instead of
  server-side session map — avoids Hubitat sandbox failures from `Random` and
  session state writes that caused "an unexpected error occurred" on unlock.

## 0.2.33

- Dashboard password sessions: store opaque tokens in app state instead of
  SHA-256/HMAC (Hubitat sandbox blocks `MessageDigest`). Unlock and API calls now
  renew sessions server-side; client uses `expiresAt` from the hub.

## 0.2.32

- Dashboard password gate: skip polling/refresh while the gate is open; dedupe
  concurrent `ensureDashboardAccess` calls; avoid clearing the password field when
  the gate is already showing.

## 0.2.31

- Outlets tab: dedicated card layout with centered socket graphic, status, and name
  (2-column grid); room tiles keep the compact inline layout.

## 0.2.30

- Category tabs on by default for new users (localStorage unset → enabled).
- Outlets quick-nav and tile icon use a blue gradient socket graphic.

## 0.2.29

- Fix Category tabs / non-Lights views crashing with `ReferenceError: activeTab is
  not defined`. The chunk rewriter treated ternary `? activeTab : …` like an object
  key and skipped the `M.` prefix after the 0.2.28 core split.

## 0.2.28

- Fix cloud dashboard blank after 0.2.27: Hubitat cloud gateway times out serving
  `mld-app.js` above ~120 KB (`HTTP 504`, `globalThis.__MLD` never loads). Split
  thermostat/core UI into new `mld-app-core.js` so `mld-app.js` is ~41 KB again.
- Keep shared sensor state (`sensors[]`, `replaceList`, etc.) in bootstrap `mld-app.js`
  so `render()` can hydrate `/data` without crashing.
- File Manager install is now 12 files (add `mld-app-core.js`).

## 0.2.27

- Fix dashboard password flow on hub: validate session expiry from the token (not only
  client-side sliding expiry), retry auth after HTTP 401 instead of showing a generic
  connection error, and fall back to GET unlock when POST body parsing fails on Hubitat.
- Bust browser cache after updates: script/CSS URLs in `mld-index.html` include the app
  version query string so hubs no longer keep serving stale JS after File Manager uploads.

## 0.2.26

- Fix password unlock hanging forever: `closeDashboardGate()` cleared `gateState`
  before the unlock promise could resolve, so `/data` never loaded after Unlock.

## 0.2.25

- Fix blank dashboard after password feature: move password-gate UI out of
  `mld-app.js` into `mld-app-post2.js`. Part1 was only ~3 KB under Hubitat's 128 KB
  File Manager limit and could truncate on upload.

## 0.2.23

- Optional dashboard password: enable in app preferences to require a password
  before the dashboard loads. Successful unlock keeps a server-signed session that
  slides forward for seven days while the dashboard is used; after a week of
  inactivity the password is required again.
- Dashboard session expiry uses Hubitat `now()` instead of `System.currentTimeMillis()`.
- Fix valve Open/Close UI not updating after visiting Sensors then Favorites:
  `updateSensorCard` preferred detached Sensors-tab cards over live Favorites cards.

## 0.2.22

- Re-land valve controls and sensor normalization with fixes for the blank-dashboard
  regression from 0.2.18/0.2.20:
  - Hubitat valves picker uses `capability.valve` (lowercase).
  - Sensor/valve UI moved into `mld-app-post2.js` so `mld-app-post.js` stays near the
    previously working ~118 KB size.
  - `/data` without a `valves` array no longer breaks room/light rendering.

## 0.2.21

- Revert 0.2.20 (valve controls and sensor normalization) — restores the previous
  stable release.

## 0.2.20

- Re-land valve controls and sensor normalization from 0.2.18.
- Fix Hubitat valves picker: use `capability.valve` (lowercase). Capital
  `capability.Valve` in 0.2.18 could break Groovy compile and leave the dashboard
  shell empty aside from All on/All off.

## 0.2.19

- Revert 0.2.18 (valve controls and sensor normalization) — restores the previous
  stable release.

## 0.2.19

- Revert 0.2.18 (valve controls and sensor normalization) — restores the previous
  stable release.

## 0.2.17

- Companion app option **Show outlets in separate Outlets tab** — when enabled,
  outlets move from Lights room cards to a dedicated Outlets quick-nav view.
- Removed **Switches (not lights or outlets)** companion app picker — plain
  switches had no dashboard UI; use **Outlets** or **Lights** instead.

## 0.2.16

- Outlets appear as socket-style tiles in rooms (favorites supported); room and
  house on/off and light snapshots still control lights only.

## 0.2.15

- HPM manifest and README link to the published Hubitat Community release thread.

## 0.2.14

- Nav reorder mode: drag-only (no arrow buttons), handle above each icon; search bar hidden while reordering.

## 0.2.13

- Reorder category nav icons (lights, locks, scenes, etc.) alongside rooms; order syncs across devices via the hub.
- Popup panels use safer viewport sizing on narrow screens; lock PIN hint wraps long text.
- Scheduler view stays in sync when switching tabs or popups.

## 0.2.12

- Central thermostat target menu: toggle select-all off, deselect individual units down to none; controls disable when nothing is selected.

## 0.2.11

- All-thermostats popup: choose which thermostats to control via a multi-select target menu.
- Favorites star only appears for devices that support favorites.

## 0.2.10

- All-lights and room slide buttons: tap works reliably; incomplete slides no longer fire a ghost click.
- App resume refreshes data without resetting open popups unless the page was hidden.

## 0.2.9

- Unified slider thumb positioning across tile dimmers, shade sliders, level tracks, and color-temperature controls (shared inset math and edge gutters).
- Tile dimmer sliders use an inner clip layer so the warm gradient and dim overlay match popup/scheduler tracks.

## 0.2.8

- Scheduler time picker: tap hour or minute to open a scroll-wheel sheet (12h and 24h).
- Level/dimmer track uses an inner clip layer so the warm gradient and dim overlay align at the edges.

## 0.2.7

- Scheduler time picker uses +/- stepper buttons with hold-to-repeat (12h and 24h).
- Dimmer and color-temperature slider thumbs align correctly at track edges via CSS positioning.
- Scheduler device-action step gets clearer headings, hints, and room-grouped layout.

## 0.2.6

- Dimmer sliders and color-popup level track use a warm brightness gradient with a dim overlay (matches tile drag-to-dim behavior).
- Scheduler brightness and white-balance controls use the same drag tracks instead of native range inputs.

## 0.2.5

- Sensor cards show battery percentage in the bottom-left corner (temperature sensors and other sensors with a battery attribute).
- Temperature sensor battery included in `/data` and updated live via WebSocket.

## 0.2.4

- PIN pad shows a clear "Wrong PIN. Try again." message on incorrect entry (HSM and lock unlock).

## 0.2.3

- HSM popup semantic state colors: status banner, mode buttons, and section labels reflect armed, arming, disarmed, monitoring, and alert states.
- HSM backend subscribes to `hsmStatus`/`hsmAlert` events and persists state for more reliable status after commands and refreshes.

## 0.2.2

- Optional navigation drawer: overflow menu toggle moves search and category icons into a side menu; topbar shows the active category (Lights, Scheduler, etc.).
- Scheduler 12/24-hour display preference in app settings; times stay stored in 24-hour form for reliable firing.

## 0.2.1

- Scheduler UI touch optimization: larger tap targets, improved typography, and row/room-header tap-to-toggle on device pickers.
- Fix scheduler nav flicker by decoupling visibility from post3 chunk load.

## 0.2.0

- Scheduler MVP (Phase 1): create, edit, enable/disable, delete, and test schedules from the dashboard.
  - Triggers: daily, weekly (day-of-week picker), and one-time (date+time picker); one-time schedules self-delete after firing.
  - Actions: lights (per-room or per-device on/off, dimming for dimmers, white-balance for CT-capable devices), thermostats (mode, heat/cool setpoints, fan mode), and hub mode.
  - Each schedule shows last run and next run; per-row toggle with distinct enabled/disabled colors.
  - Groovy backend persists schedules in `state.schedulesJson`, arms jobs via Quartz `schedule()` (daily/weekly) and `runOnce()` (one-time), recomputes next-fire with a 7-field cron parser, re-arms on `updated()`/`installed()`, and prunes past one-time schedules every 5 minutes. Endpoints: `/schedules` (GET), `/schedules/save`, `/schedules/delete`, `/schedules/toggle`, `/schedules/test`.
- Scheduler Phase 3: sunrise and sunset triggers with minute offsets for daily and weekly schedules.
  - Sun-based schedules use `runOnce` and re-arm on fire, at midnight, and when hub `sunriseTime`/`sunsetTime` events update.
  - Dashboard step 1 offers Clock / Sunrise / Sunset with preset and custom offsets; shows today's computed time when available via `sunTimes` in `/data`.
- Scheduler Phase 4: hub mode as trigger and optional mode condition on time-based schedules.
  - **When mode changes** trigger fires via `subscribe(location, "mode", …)` when the hub enters the selected mode.
  - **Restrict to modes** optional condition on daily, weekly, once, and sun-time schedules; hidden for mode triggers.
- Scheduler Phase 2: switches and outlets as separate scheduler action types.
  - Companion app device pickers for plain switches and outlets; streamed in `/data` as `plainSwitches` and `outlets`.
  - Scheduler workflow step 2 shows Switches/Outlets only when devices are configured; step 3 supports per-room selection with on/off only.
- Scheduler infrastructure: fourth JS chunk (`mld-app-post3.js`) housing the scheduler UI; build enforces 128 KB limit on all four app chunks.

## 0.1.9

- Local/cloud mode switching: overflow menu links, editable local URL, Android cloud banner, and remembered local access.
- House snapshot slides on **All on** / **All off** with slide-confirm thumb UI; refined room snapshot gesture and animation.
- App JS split into three File Manager chunks (`mld-app-post2.js`) to stay under hub size limits.
- Light command metering uses `runInMillis`; snapshot timestamps use Hubitat `now()`.

## 0.1.8

- Motorized shades & blinds: device picker, room tiles, quick popup with open/close/pause and drag-to-position.
- Light snapshots: slide-to-save and slide-to-restore per room or whole house.
- Bulk room/house light on/off; configurable metering, on/off optimization, and activation optimization for snapshots.
- Build-time size checks for `mld-app-pre.js` and `mld-sw.js`.

## 0.1.7

- Default dashboard and PWA title renamed to **mDash**.
- HSM quick popup: shield icons for arm/disarm modes and cancel-alert button.
- Fix music master transport and popup close across JS chunks (`postCall`); build-time check for part-1/part-2 symbol leaks.

## 0.1.6

- Documentation pass: community post draft, HPM registry guide, CHANGELOG, NOTICE, bundle READMEs, PWA description, generated `repository.json`, setup page copy.
- Groovy Devices section intro; `communityLink` in HPM manifest (update URL after forum post).

## 0.1.5

- Updated HPM, README, and SmartApp descriptions emphasizing minimal setup, smart device names, PWA, and hub-only hosting.
- Apache 2.0 LICENSE; author and version metadata centralized in `build.mjs`.

## 0.1.4

- HPM asset URLs track `master/dist` for reliable updates.
- README documents custom repository URL and common HPM update pitfalls.

## 0.1.3

- Cross-chunk `postCall` fixes for lock/music optimistic popups and thermostat quick-popup refresh.

## 0.1.2

- Hub mode icons and thermostat popup fixes.

## 0.1.1

- Expanded HPM package description.

## 0.1.0

- Initial public release: room-grouped dashboard, HPM support, PWA assets, File Manager deployment.
