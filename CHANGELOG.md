# Changelog

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
