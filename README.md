# Modern Dashboard for Hubitat Elevation

A **minimal-effort**, **control-first** Hubitat dashboard — **select your devices
and you're done**. Most dashboards are built around viewing status; this one is
optimized for *doing* things — large touch targets, drag-to-dim, and bulk actions
so you can turn off a whole room, the whole house, or adjust multiple thermostats
at once. No layout builder, no grouping rules, no token copying. The app groups
everything by Hubitat room, strips redundant room prefixes from device names, and
presents a clean, touch-friendly UI. Optional tweaks (theme, favorites, nav order,
PINs) are available when you want them, but nothing is required to get a usable
dashboard.

It is a **PWA** you can install on your phone, includes a **simple scheduler** you
can manage remotely without logging into the Hubitat admin UI, and runs
**completely on your hub** — no Maker API, no third-party cloud backend.

Works over both the local URL and Hubitat's **cloud proxy**, so the same
experience works at home and away.

Supports lights (dimmers, switches, CT, RGB), motorized shades, thermostats,
locks, HSM, Hubitat scenes, hub mode, music/media players, sensors, and a
built-in scheduler for lights, switches, outlets, thermostats, and hub mode.
Designed to show ~130 lights on one page, within Hubitat's 128 KB cloud response
cap.

## What makes it different

1. **Control-first, not status-first** — the UI is optimized for acting on devices
   quickly: drag-to-dim, one-tap room/house on/off, multi-thermostat control, and
   other bulk actions. Status is there when you need it; control is the priority.
2. **Minimal-effort configuration** — install the app, pick devices in Hubitat
   preferences, open the link. Rooms and layout come from your Hubitat room
   assignments. Customization is optional, not required.
3. **Installable PWA** — open the cloud URL on your phone and add it to your home
   screen (Android Chrome: Install app; iOS Safari: Add to Home Screen).
4. **Simple remote scheduler** — create daily, weekly, one-time, sunrise/sunset,
   and mode-change schedules from the dashboard itself. No Hubitat login, no Rule
   Machine, no external service — just the same OAuth dashboard URL.
5. **Runs completely local on your hub** — UI, API, scheduler, snapshots, and
   favorites all live on the hub. Cloud access is optional via Hubitat's own
   `cloud.hubitat.com` proxy.

## Features

### Lights & rooms
- Room-grouped tiles with on/off, drag-to-dim, RGB and color-temperature popups
- **Bulk control** — per-room and whole-house **All on / All off** with
  slide-to-confirm; control many lights in one gesture
- **Light snapshots** — slide to save or restore lighting scenes per room or house
- Sticky search, collapsible rooms, favorites starred across device types
- Drag-to-reorder rooms and quick-nav icons (order syncs across devices via the hub)

### Scheduler
- Create, edit, enable/disable, delete, and test schedules from the dashboard
- Triggers: daily, weekly, one-time, sunrise/sunset (with offsets), hub mode change
- Optional “restrict to modes” on time-based schedules
- Actions: lights (on/off, dim, CT), switches, outlets, thermostats, hub mode
- Runs on the hub via Groovy `schedule()` / `runOnce()` — works remotely through
  the same cloud dashboard URL, without Hubitat admin login

### Climate, security & more
- Thermostat dial (heat/cool setpoints, mode, fan) plus **multi-select bulk
  thermostat control** — change several units at once
- Locks (optional unlock PIN), HSM arm/disarm (optional PIN), Hubitat scenes, hub mode
- Motorized shades/blinds: open/close/pause and drag-to-position
- Music/media (Sonos, Echo Speaks, AirPlay, Chromecast) — transport, volume, track
- Sensors popup (motion, contact, water, presence, humidity, illuminance, smoke/CO, temp + battery)

### UX
- Dark / Light / Auto theme; optional category tabs and navigation drawer
- Local ↔ cloud switching from the overflow menu (faster LAN when at home)
- Optimistic UI with rollback on failure; optional LAN WebSocket for instant updates

## Get started in minutes

1. Install via HPM (recommended), bundle, or manual paste — see below.
2. **Apps → Add User App → Modern Dashboard** → select devices → **Done**.
3. Open the **Cloud** URL from the app page; install as a PWA if you like.
4. Optionally open the **Scheduler** icon to add remote schedules without Hubitat login.

## Why this design

- **Built for control** — most dashboards emphasize status at a glance; this one
  prioritizes fast, confident actions, including bulk room/house lights and
  multi-thermostat control.
- **Zero-config layout** — pick devices once; rooms, ordering, and display names
  are handled from Hubitat room assignments.
- **Looks better than the built-in dashboard** — modern dark/light UI, large touch
  targets, sticky search, collapsible rooms, smooth dimmer sliders, thermostat dial.
- **Portable across hubs** — same app code on any hub. Install, pick devices, done.
- **Persistent config** — room order, nav order, favorites, snapshots, and schedules
  live in the hub's app database, so they work from any device.
- **Works away from home** — via Hubitat's cloud proxy; no port forwarding or VPN.
- **No Maker API dependency** — slim custom JSON (~8 KB for 130 lights) stays under
  the 128 KB cloud cap.

## Repo layout

```
src/
  index.html             page shell
  manifest.webmanifest   PWA manifest (install name: mDash)
  sw.js                  pass-through service worker
  styles.css             visual design (served at /app.css)
  app-pre.js             SVG/data constants + helpers
  app.js                 core UI (split into 4 File Manager chunks at build)
lib/
  pwa-icons.mjs          generates dashboard PNG icons at build time
app/
  ModernLightsDashboard.groovy.template   Groovy SmartApp
build.mjs                no-dependency build → dist/ + HPM manifests
preview/
  server.mjs             local mock server (~130 lights) for UI dev
dist/
  ModernLightsDashboard.groovy   generated SmartApp
  upload/mld-*                   File Manager assets (11 files)
docs/
  hubitat-community-post.md      Hubitat Community forum draft
  hpm-registry.md                HPM community registry submission
```

## Develop the UI locally (no hub needed)

```bash
node preview/server.mjs
# open http://localhost:4321/
```

The mock server generates ~130 lights across 12 rooms, thermostats, sensors,
scheduler demos, and more. Edit files in `src/`, refresh the browser.

## Build

```bash
node build.mjs
```

Outputs:

| file | purpose |
| ---- | ------- |
| `dist/ModernLightsDashboard.bundle.zip` | Manual install — Bundles → Import ZIP |
| `dist/ModernLightsDashboard.groovy` | HPM / manual paste into Apps Code |
| `dist/upload/mld-*` | File Manager assets (11 files; HPM auto-deploys) |
| `hubitat/packageManifest.json` | HPM manifest — app (`oauth: true`) + files |
| `dist/packageManifest.json` | Copy of the HPM manifest |

```bash
HPM_BASE_URL=https://raw.githubusercontent.com/evdev/hubitat-modern-dashboard/master/dist node build.mjs
```

The Groovy app does **not** embed the UI (Hubitat cannot compile huge blobs). The
app reads **11 files** from File Manager at runtime. JS is split into
`mld-app-pre.js`, `mld-app.js`, `mld-app-post.js`, `mld-app-post2.js`, and
`mld-app-post3.js` to stay under the hub's ~128 KB per-file limit. PWA assets
(`mld-manifest.webmanifest`, `mld-sw.js`, icon `.b64` files) enable home-screen
install on the cloud URL. Icons are stored as base64 text because Hubitat cannot
reliably serve binary PNGs from File Manager.

### File Manager assets (exact names)

```
mld-index.html
mld-app.css
mld-app-pre.js
mld-app.js
mld-app-post.js
mld-app-post2.js
mld-app-post3.js
mld-manifest.webmanifest
mld-sw.js
mld-icon-192.b64
mld-icon-512.b64
```

## Install on a hub (HPM — recommended)

1. In HPM **Settings**, add this custom repository URL:
   `https://raw.githubusercontent.com/evdev/hubitat-modern-dashboard/master/hubitat/repository.json`
2. **Install → By Repository** → find **Modern Dashboard** → install.
3. HPM installs the Groovy app, **enables OAuth automatically**, and deploys all
   11 File Manager assets.
4. **Apps → Add User App → Modern Dashboard** → select devices → **Done**.
5. Open the **Cloud** URL shown in the app page and install as a PWA (see below).

**Important for updates:** HPM must track the floating manifest on `master`, not a
version-tagged URL. Tagged URLs freeze the version HPM sees and updates never
appear. If you previously installed from a tagged manifest URL, use **Unmatch**
on the old entry, then install again via the custom repository above.

If HPM shows the latest version but files did not change (for example after
**Match Up**), use **Repair** on the package to redeploy assets.

No manual OAuth toggle or File Manager upload is needed when installing via HPM.

## Install on a hub (bundle)

1. Run `node build.mjs` on your computer.
2. Hubitat → **Settings → Developer Tools → Bundles → Import ZIP**
3. Upload `dist/ModernLightsDashboard.bundle.zip` and wait for **Bundle imported**.
4. **Apps Code → Modern Dashboard** → click **OAuth** → enable OAuth → **Save**.
5. **Settings → File Manager** — upload all **11** files from `dist/upload/`
   (or extract `file-manager/` from the bundle zip). Filenames must match exactly.
6. **Apps → Add User App → Modern Dashboard** → select your devices → **Done**.
7. Open the **Cloud** URL and install as a PWA if desired.

## Install on a hub (manual paste)

1. Run `node build.mjs` on your computer.
2. **Apps Code → New App**: paste the entire contents of
   `dist/ModernLightsDashboard.groovy`.
3. Click **OAuth** and enable OAuth, then **Save**.
4. **Settings → File Manager**: upload all **11** files from `dist/upload/`
   (exact names listed above).
5. **Apps → Add User App → Modern Dashboard** → select devices → **Done**.
6. Open the **Cloud** URL and install as a PWA if desired.

> When updating an existing install, re-paste the new Groovy (or re-import the
> bundle) so the hub learns any new routes, then upload any new `mld-*` files.

### Hub Login Security

If **Settings → Hub Login Security** is enabled, expand **Hub file access** in
the app preferences and enter your hub username/password so the SmartApp can read
File Manager assets.

## Community and wider distribution

- **Forum release post:** draft in
  [`docs/hubitat-community-post.md`](docs/hubitat-community-post.md). After you
  publish on the [Hubitat Community](https://community.hubitat.com/), set
  `COMMUNITY_LINK` in [`build.mjs`](build.mjs) (or
  `COMMUNITY_LINK=... npm run build`) to your thread URL and rebuild so HPM shows
  the link.
- **HPM community registry:** see [`docs/hpm-registry.md`](docs/hpm-registry.md)
  for submitting a PR so the package appears in HPM search (optional; custom repo
  install works today).

## Install as a PWA (cloud URL)

Use the **Cloud** link from the app page (`cloud.hubitat.com`, includes
`/dashboard` in the path).

| Platform | How to install |
| -------- | -------------- |
| **Android Chrome** | Open the cloud URL → menu → **Install app** (or the install banner) |
| **iOS Safari** | Open the cloud URL → **Share** → **Add to Home Screen** |

The installed app opens in a standalone window with the dashboard icon (branded
**mDash**). Device control still requires your hub to be online — there is no
offline mode.

**Important:** The cloud URL contains your OAuth access token. Anyone with that
URL can control your devices. If you revoke OAuth or regenerate the token,
reinstall from a fresh cloud link.

Local hub URLs are HTTP and do not support the full PWA install flow; use the
cloud URL for home-screen install.

## Device selection notes

| Preference | Shown on main lights view | Scheduler actions |
| ---------- | ------------------------- | ----------------- |
| Lights (switches & dimmers) | Yes | Yes |
| Switches (not lights/outlets) | No | Yes (on/off) |
| Outlets | No | Yes (on/off) |
| Thermostats, locks, shades, music, sensors | Yes (via tiles / quick-nav) | Thermostats & hub mode in scheduler |

## Optional customization

Nothing below is required for a working dashboard.

**Hubitat app preferences:** dashboard name, refresh interval, WebSocket, scheduler
12h/24h display, command metering, on/off and snapshot optimization, lock/HSM PINs,
thermostats in quick menu, HSM enable.

**Per-browser (localStorage):** theme, haptics, category tabs, navigation drawer,
local hub URL for LAN switching.

**Synced on the hub:** room order, nav icon order, favorites, light snapshots,
schedules.

## Move to another hub

Paste the same `dist/ModernLightsDashboard.groovy`, enable OAuth, select devices.
Nothing to edit.

## How it works

- The page uses **relative** API paths (`data`, `cmd`, `device`, `schedules`, …),
  so local URL calls stay local and fast; cloud URL calls go through the cloud
  proxy (same-origin, no CORS).
- **Sync**: polls `/data` every N seconds. On the LAN it can also use
  `ws://<hub-ip>/eventsocket` when enabled. Polling pauses when the page is hidden.
- **Commands**: single-device `cmd` and batch `POST cmd/batch` for room/house
  on/off. Optimistic UI updates apply immediately.
- **Scheduler**: persisted in hub `state`, armed with Groovy `schedule()` /
  `runOnce()`, managed via `/schedules*` endpoints from the dashboard UI.
- **Dimmer drag**: Pointer Events, live fill + %, throttled `setLevel` while
  dragging, commits on release.
- **Color / climate / music / shades / HSM / scenes**: quick-nav popups; see the
  app for controls.

## Notes

- The access token is part of the URL (Hubitat OAuth standard). Treat the cloud
  URL like a secret.
- The eventsocket WebSocket is a local-only, undocumented Hubitat interface; it
  may change. Polling is the reliable baseline.
- Theme (Dark / Light / Auto) is in the topbar overflow menu (⋯) and saved in
  this browser; Auto follows your system appearance.

## License

Copyright 2026 Ephrayim (evdev)

Licensed under the [Apache License, Version 2.0](LICENSE). See [LICENSE](LICENSE)
and [NOTICE](NOTICE) for attribution.

Source: [https://github.com/evdev/hubitat-modern-dashboard](https://github.com/evdev/hubitat-modern-dashboard)

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
