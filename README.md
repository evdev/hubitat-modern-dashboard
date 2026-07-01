# Modern Dashboard for Hubitat Elevation

A modern, mobile-first dashboard for Hubitat — lights, thermostats, and temperature
sensors grouped by room, with prominent per-room on/off controls and drag-to-dim
sliders. It's delivered by a single companion Hubitat app that serves its own UI
and data over **both** the local URL and Hubitat's **cloud proxy**, so the same
dashboard works at home and remotely.

Supports dimmers, switches, color-temperature and RGB bulbs, thermostats (dial
setpoints, mode, fan), music and media speakers (Sonos, Echo Speaks, AirPlay,
Chromecast — play/pause/stop, skip when supported, volume, current track), and
read-only temperature sensors. Designed to show ~130
lights on one page, comfortably within Hubitat's 128 KB per-response cloud cap.

## Why this design

- **Looks better than the built-in dashboard** — modern dark/light UI, large touch
  targets, sticky search, collapsible rooms, smooth dimmer sliders, thermostat dial.
- **Portable across hubs** — the same app code works on any hub. No file edits,
  no token copying: install, pick devices, done.
- **Persistent config** — settings live in the hub's app database, not the
  browser, so they survive cache clears and work from any device.
- **Works away from home** — via Hubitat's cloud proxy (`cloud.hubitat.com`),
  no port forwarding or VPN needed.
- **No Maker API dependency** — the app reads device state directly and returns
  slim JSON (~8 KB for 130 lights), avoiding Maker API's verbose payloads that
  can blow past the 128 KB cloud cap.

## Repo layout

```
src/
  index.html      page shell (links app.css / app-pre.js / app.js via relative paths)
  manifest.webmanifest   PWA manifest (install name, icons, theme)
  sw.js           pass-through service worker (Chrome install gate)
  styles.css      the full visual design (served at /app.css)
  app-pre.js      pure SVG/data constants + stateless helpers (preload, served at /app-pre.js)
  app.js          data fetch, rendering, dimmer drag, climate, color, polling, WS
lib/
  pwa-icons.mjs   generates dashboard PNG icons at build time
app/
  ModernLightsDashboard.groovy.template   Groovy SmartApp (HTTP endpoints)
build.mjs        no-dependency build: copies src/* -> dist/upload, bundles ZIP
preview/
  server.mjs      local mock server (fake /data, ~130 lights) for UI dev
dist/
  ModernLightsDashboard.groovy   generated, paste this into Hubitat
```

## Develop the UI locally (no hub needed)

```bash
node preview/server.mjs
# open http://localhost:4321/
```

The mock server generates ~130 lights across 12 rooms, thermostats, temperature
sensors, occasionally flips a random light to simulate activity, and handles
`/cmd`. Edit files in `src/`, refresh the browser.

## Build

```bash
node build.mjs
```

Outputs:

| file | purpose |
| ---- | ------- |
| `dist/ModernLightsDashboard.bundle.zip` | Manual install — import via Bundles → Import ZIP |
| `dist/ModernLightsDashboard.groovy` | HPM / manual paste into Apps Code |
| `dist/upload/mld-*` | File Manager assets (HPM auto-deploys; manual/bundle installs upload by hand) |
| `hubitat/packageManifest.json` | **HPM manifest** — app (`oauth: true`) + File Manager `files` |
| `dist/packageManifest.json` | Copy of the HPM manifest |

Set `HPM_BASE_URL` to the raw URL prefix where you host `dist/` (e.g. a GitHub release or tagged path) before publishing to HPM:

```bash
HPM_BASE_URL=https://raw.githubusercontent.com/evdev/hubitat-modern-dashboard/v0.1.3/dist node build.mjs
```

The Groovy app does **not** embed the UI (Hubitat cannot compile huge base64 blobs). The app reads nine files from File Manager at runtime. The JS is split into `mld-app-pre.js` (constants/helpers), `mld-app.js` (core logic), and `mld-app-post.js` (render/commands/init) to keep each file under the hub's single-file serving limit (~128 KB). PWA assets (`mld-manifest.webmanifest`, `mld-sw.js`, icon `.b64` files) enable install-from-home-screen on the cloud URL. Icons are stored as base64 text in File Manager because Hubitat cannot reliably read binary PNG files from the hub filesystem.

## Install on a hub (HPM — recommended)

1. Publish `hubitat/packageManifest.json` to your HPM repository (set `HPM_BASE_URL` and rebuild so URLs point at hosted `dist/ModernLightsDashboard.groovy` and `dist/upload/mld-*`).
2. Hubitat → **Apps → Hubitat Package Manager** → install **Modern Dashboard**.
3. HPM installs the Groovy app, **enables OAuth automatically**, and deploys all nine File Manager assets.
4. **Apps → Add User App → Modern Dashboard** → select lights, thermostats, and/or temperature sensors → **Done**.
5. Open the **Cloud** URL shown in the app page and install as a PWA (see below).

No manual OAuth toggle or File Manager upload is needed when installing via HPM.

## Install on a hub (bundle)

1. Run `node build.mjs` on your computer.
2. Hubitat → **Settings → Developer Tools → Bundles → Import ZIP**
3. Upload `dist/ModernLightsDashboard.bundle.zip` and wait for **Bundle imported**.
4. **Apps Code → Modern Dashboard** → click **OAuth** → enable OAuth → **Save**.
5. **Settings → File Manager** — upload the 9 files from `dist/upload/` (or extract `file-manager/` from the bundle zip):
   - `mld-index.html`, `mld-app.css`, `mld-app-pre.js`, `mld-app.js`, `mld-app-post.js`
   - `mld-manifest.webmanifest`, `mld-sw.js`, `mld-icon-192.b64`, `mld-icon-512.b64`
6. **Apps → Add User App → Modern Dashboard** → select lights, thermostats, and/or temperature sensors → **Done**.
7. Open the **Cloud** URL shown in the app page and install as a PWA (see below).

## Install on a hub (manual paste)

1. Run `node build.mjs` on your computer.
2. **Apps Code → New App**: paste the entire contents of `dist/ModernLightsDashboard.groovy`.
3. Click **OAuth** and enable OAuth, then **Save** (should complete in a few seconds).
4. **Settings → File Manager**: upload all nine files from `dist/upload/`:
   - `mld-index.html`, `mld-app.css`, `mld-app-pre.js`, `mld-app.js`, `mld-app-post.js`
   - `mld-manifest.webmanifest`, `mld-sw.js`, `mld-icon-192.b64`, `mld-icon-512.b64`
   (Filenames must match exactly.)

> If you are updating an existing install, re-paste the new `dist/ModernLightsDashboard.groovy` (or re-import the bundle) so the hub learns new routes (`/manifest.webmanifest`, `/sw.js`, `/icons/*`), then upload any new `mld-*` files.
5. **Apps → Add User App → Modern Dashboard**.
6. Select your light, thermostat, and temperature sensor devices; set options; click **Done**.
7. Open the **Cloud** URL shown in the app page and install as a PWA (see below).

## Install as a PWA (cloud URL)

Use the **Cloud** link from the app page (`cloud.hubitat.com`, includes `/dashboard` in the path).

| Platform | How to install |
| -------- | -------------- |
| **Android Chrome** | Open the cloud URL → menu → **Install app** (or the install banner) |
| **iOS Safari** | Open the cloud URL → **Share** → **Add to Home Screen** |

The installed app opens in a standalone window with the dashboard icon. Device control still requires your hub to be online — there is no offline mode.

**Important:** The cloud URL contains your OAuth access token. Anyone with that URL can control your devices. If you revoke OAuth or regenerate the token, reinstall from a fresh cloud link.

Local hub URLs are HTTP and do not support the full PWA install flow; use the cloud URL for home-screen install.

## Move to another hub

Paste the same `dist/ModernLightsDashboard.groovy`, enable OAuth, select
devices. Nothing to edit.

## How it works

- The page uses **relative** API paths (`data`, `cmd`, `device`), so when loaded
  via the local URL its calls stay local and fast; loaded via the cloud URL they
  go through the cloud proxy (same-origin, no CORS).
- **Sync**: polls `/data` every N seconds (works everywhere). On the local
  network it additionally connects to `ws://<hub-ip>/eventsocket` for instant
  updates when enabled; remote uses polling only. The page pauses polling when
  hidden and reconnects on return.
- **Commands**: `cmd?id=…&c=on|off|setLevel|setCT|setColor|play|pause|stop|nextTrack|previousTrack|setVolume|…&v=…` for single devices.
  Room on/off and All on/off use `POST cmd/batch` with a JSON array so the hub
  executes commands sequentially in one request. Optimistic UI updates apply
  immediately.
- **Dimmer drag**: Pointer Events (touch + mouse), live fill + %, throttled
  `setLevel` while dragging, commits on release.
- **Color**: tap a bulb name to open white (color temperature) and/or RGB
  controls. Escape dismisses without saving; click outside or × commits.
- **Climate**: room header shows temperature; tap the thermostat icon to open the
  dial popup for heat/cool setpoints, mode, and fan controls.
- **Music**: the Music quick-nav button lists all selected audio devices with
  transport (previous / play-pause / stop / next — hidden when unsupported),
  a volume slider, and the current track or media source. The album icon shows an
  animated equalizer while a player is playing (disabled under reduced-motion
  preferences). In the Hubitat app, add full music players (Sonos, Echo Speaks,
  AirPlay) under **Music / media players**, and Chromecast / Google Home devices
  under **Additional speakers**.

## Notes

- The access token is part of the URL (Hubitat OAuth standard). Treat the cloud
  URL like a secret — anyone with it can control your devices.
- The eventsocket WebSocket is a local-only, undocumented Hubitat interface; it
  may change. Polling is the reliable baseline.
- Theme (Dark / Light / Auto) is in the topbar overflow menu (⋯) and saved in
  this browser; Auto follows your system appearance.
