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

## Table of contents

- [What makes it different](#what-makes-it-different)
- [User guide](#user-guide)
  - [Lights & rooms](#lights--rooms)
  - [Light snapshots](#light-snapshots)
  - [Thermostats](#thermostats)
  - [Motorized shades & blinds](#motorized-shades--blinds)
  - [Ceiling fans](#ceiling-fans)
  - [Locks](#locks)
  - [Hubitat Safety Monitor (HSM)](#hubitat-safety-monitor-hsm)
  - [Hub mode & scenes](#hub-mode--scenes)
  - [Music & media](#music--media)
  - [Sensors](#sensors)
  - [Scheduler](#scheduler)
  - [Favorites](#favorites)
  - [Search, collapse & reorder](#search-collapse--reorder)
  - [UI preferences](#ui-preferences)
  - [Local vs cloud mode](#local-vs-cloud-mode)
  - [Real-time updates (WebSocket)](#real-time-updates-websocket)
  - [PWA installation](#pwa-installation)
- [Get started](#get-started-in-minutes)
- [Installation](#install-on-a-hub-hpm--recommended)
- [App preferences (hub)](#app-preferences-hub)
- [Developer docs](#repo-layout)
- [Security](#security)
- [Changelog](#changelog)

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

## User guide

This section documents every feature in the app — including the practical details
that do not belong in a forum announcement.

### Lights & rooms

The main view groups selected **light devices** (switches and dimmers from the
app preferences) by Hubitat room. Device labels have the room name stripped when
it would be redundant — e.g. a device named "Kitchen Island" under the Kitchen
room header shows as **Island**, not "Kitchen Island".

| Action | How |
| ------ | --- |
| Toggle on/off | Tap the tile |
| Dim | Drag horizontally on the tile fill (touch or mouse) |
| Color / white balance | Tap the device **name** to open the color popup |
| Room all on / all off | Use the **On** / **Off** buttons in the room header (lights only) |
| Whole house all on / all off | Use **All on** / **All off** in the top bar (lights only) |

**Color popup:** RGB bulbs get white (color temperature) and/or color tabs as
supported by the device. Changes apply live while you adjust; click outside the
popup or press Escape to dismiss. Tap the tile body (not the name) to toggle
on/off without opening color controls.

**Outlets:** Devices selected under the **Outlets** picker use socket-style tiles
so they are easy to tell apart from lights. By default they appear in the same
room layout as lights. Enable **Show outlets in separate Outlets tab** in the
companion app to move them to the **Outlets** quick-nav view instead. Tap an
outlet tile to toggle it. Room and whole-house **On** / **Off** (and snapshots)
control **lights only** — outlets are never included in bulk lighting control.

**Room climate:** If a thermostat or temperature sensor is in the same room,
the room header shows the current temperature. Tap the thermostat icon to open
the dial popup for that unit (when the device is a controllable thermostat).

**Bulk on/off confirmations:** Whole-house **All on** and **All off** show a
confirmation dialog before sending commands. Room on/off does not.

**Command metering:** By default the hub sends light commands one device at a time
with a short delay between each (configurable in app preferences). This helps
avoid flooding Zigbee/Z-Wave networks when turning many lights on or off at once.

### Light snapshots

Snapshots save the current on/off, level, color temperature, and RGB state of
lights so you can restore them later. They are stored on the hub (not in the
browser) and sync to every device that opens the dashboard.

**What is captured per light:** switch state, level (dimmers), color temperature,
and hue/saturation (RGB bulbs).

**Room snapshot**

Each room header has **On** / **Off** slide tracks:

| Gesture | **Off** track | **On** track |
| ------- | ------------- | ------------ |
| Quick tap | Turn all lights in the room **off** | Turn all lights in the room **on** |
| Press & hold (~0.4 s), then slide | **Save Current State** | **Restore Saved State** |

Slide toward the revealed action label and release at the end of the track to
commit. Restore is only available after a snapshot has been saved for that room.

**Whole-house snapshot**

The top-bar **All off** / **All on** buttons work the same way:

| Gesture | **All off** | **All on** |
| ------- | ----------- | ---------- |
| Quick tap | Turn off all lights (with confirmation) | Turn on all lights (with confirmation) |
| Press & hold, then slide | **Save Home State** | **Restore Home State** |

**Tips**

- Save before changing lighting for a party, movie, or cleaning — restore when
  you are done.
- Snapshot restore runs commands through the same metered queue as bulk on/off.
  Large restores may take a few seconds.
- **Activation optimization** (app preference) skips level/CT/RGB commands during
  restore when the device already reports the expected value.

### Thermostats

Select thermostats in the app preferences. They appear in the **Thermostats**
quick-nav popup (when enabled) and in room headers when assigned to a room.

- **Per-thermostat dial:** heat/cool setpoints, mode, fan mode/speed
- **All thermostats:** top-bar button (when multiple thermostats are configured)
  opens a central control with a multi-select target menu — choose which units to
  adjust, then apply mode or setpoints to the selection

Hide the thermostats quick-nav icon via **Show thermostats in dashboard quick
menu** in app preferences if you only use per-room headers.

### Motorized shades & blinds

Select devices with the `windowShade` capability. They appear in the **Blinds**
quick-nav popup and as tiles grouped by room on that view.

- Open / close / pause buttons
- Drag the position slider to set shade level
- Favorites star works on shade tiles

### Ceiling fans

Select devices with the `FanControl` capability. They appear on their own
**Fans** tab (or popup). Hubitat exposes discrete speeds (typically
low/medium/high for AC fans; DC fans report whatever list the driver supports
via `supportedFanSpeeds`).

- Tap the fan icon to turn on or off (on restores the last speed on the hub)
- Use **+** / **−** to step through supported speeds
- Favorites star works on fan tiles

### Locks & garage doors

Select lock devices and garage door openers in the **Locks / garage doors** app
preferences section. The **Locks** quick-nav popup lists all selected locks and
garage doors with lock/unlock or open/close controls.

- **Unlock PIN** (optional, app preference): when enabled, unlocking a lock or
  opening a garage door from the dashboard requires entering a PIN on an on-screen
  pad. Locking and closing garage doors never requires a PIN. The PIN is validated
  by this app before the command is sent.

### Hubitat Safety Monitor (HSM)

HSM control is **off by default**. Enable **HSM security control** in app
preferences to show the **Security** quick-nav icon.

- View current HSM status and any active alert
- Arm home / away / night, disarm all, cancel alerts
- **HSM PIN** (optional): require PIN before arm/disarm commands
- Status colors reflect armed, arming, disarmed, monitoring, and alert states

### Hub mode & scenes

- **Hub mode** quick-nav popup lists your hub's location modes; tap to activate
- **Scenes** quick-nav popup lists native Hubitat scenes from `location.scenes`;
  tap to activate. No separate scene picker in app preferences — all hub scenes
  are available automatically

Hub mode can also be used as a **scheduler trigger** or **scheduler action**
(see Scheduler).

### Music & media

Two device pickers in app preferences:

| Picker | Typical devices | Controls |
| ------ | ----------------- | -------- |
| **Music / media players** | Sonos, Echo Speaks, AirPlay | Transport (prev/play-pause/stop/next when supported), volume, current track |
| **Additional speakers** | Chromecast, Google Home | Play/pause/stop, volume (per device capabilities) |

The **Music** quick-nav popup lists all configured players. The top-bar **All
music** button appears when multiple players are selected. An animated equalizer
on the album icon indicates playback (respects reduced-motion preferences).

### Sensors

Most sensors are **read-only** on the dashboard. Select them in the **Other sensors**
section of app preferences (motion, contact, water, presence, humidity,
illuminance, smoke/CO, valves) plus **Temperature sensors** for display-only temperature.

The **Sensors** quick-nav popup aggregates all selected sensors and valves.
Temperature sensors also appear in room headers. Battery percentage is shown when
the device reports it. Valves show open/close controls on their cards.

A device selected in multiple sensor pickers appears once, using the first
matching type.

### Scheduler

Open the **Scheduler** quick-nav icon to create schedules without logging into
the Hubitat admin UI. Schedules are stored on the hub and fire via Groovy
`schedule()` / `runOnce()` — they work remotely through the same OAuth dashboard
URL.

**Triggers**

| Type | Description |
| ---- | ----------- |
| Daily | Same time every day |
| Weekly | Same time on selected days of the week |
| One-time | Specific date and time; **self-deletes** after firing |
| Sunrise / sunset | Daily or weekly, with minute offset (uses hub sun times) |
| Hub mode change | Fires when the hub enters a selected mode |

Time-based schedules can optionally **restrict to modes** (only fire when the hub
is in one of the selected modes). This condition does not apply to mode-change
triggers.

**Actions**

| Target | Options |
| ------ | ------- |
| Lights | Per-room or per-device; on/off; dim level; color temperature (CT devices) |
| Switches | Per-room or per-device; on/off only (devices from the **Switches** picker) |
| Outlets | Per-room or per-device; on/off only (devices from the **Outlets** picker) |
| Thermostats | Mode, heat/cool setpoints, fan mode |
| Hub mode | Set location mode |

Each schedule row shows last run and next run. Use the per-row toggle to
enable/disable, or **Test** to fire immediately. Times display in 12h or 24h
format per the **Use 24-hour time in scheduler** app preference (stored internally
as 24h for reliable firing).

### Favorites

Tap the star on a supported device tile (lights, shades, locks, garage doors, music, sensors,
etc.) to add it to favorites. The list is stored on the hub and syncs across
devices. Open the **Favorites** quick-nav icon for a cross-category view of
starred devices.

### Search, collapse & reorder

**Search** — the sticky search bar filters lights and rooms by name. Matching
rooms auto-expand; non-matching tiles are hidden.

**Collapse** — tap the chevron on a room header to collapse/expand. The
top-bar expand/collapse-all button toggles every room.

**Reorder** — overflow menu (⋯) → **Reorder**:

- **Rooms:** drag handles appear; drag rooms to change display order. Tap
  **Done** to save to the hub (syncs across devices).
- **Quick-nav icons:** drag category icons (locks, scenes, scheduler, etc.) to
  reorder. Search is hidden while reordering.

### UI preferences

Stored **per browser** in `localStorage` (overflow menu ⋯):

| Setting | Description |
| ------- | ----------- |
| Theme | Dark, Light, or Auto (follows system) |
| Haptic feedback | Short vibration on supported mobile browsers |
| Category tabs | Show Lights / Favorites / Sensors / etc. as tabs instead of popups |
| Navigation drawer | Move search and category icons into a side drawer; top bar shows active category |
| Local hub URL | Used for local-mode switching (see below) |

### Local vs cloud mode

The app page shows two URLs:

| URL | When to use |
| --- | ----------- |
| **Local** | `http://<hub-ip>:8080/...` — fastest at home on your LAN |
| **Cloud** | `https://cloud.hubitat.com/...` — works anywhere via Hubitat's proxy |

Both URLs include the OAuth `access_token` and serve the same dashboard. API
calls use relative paths, so they stay on whichever origin you opened.

**Switching modes**

- **Open local mode** / **Open cloud mode** in the overflow menu navigate between
  stored URLs.
- The **local hub URL** field is pre-filled from the hub on first load; edit it
  if your hub IP changes.
- On **Android**, when you open the cloud URL after recently using the local URL,
  a banner offers to switch to faster local mode. Dismiss or tap **Switch**.
- Choosing cloud mode sets a `prefer cloud` flag so Android does not auto-redirect
  away from the cloud URL.

**iOS PWA and local mode — important limitations**

1. **Install from the cloud URL.** iOS **Add to Home Screen** requires the HTTPS
   cloud link. You cannot install a full standalone PWA from the local HTTP URL.
2. **Installed PWA stays on the cloud origin.** The home-screen app loads
   `cloud.hubitat.com`. That is correct for remote access and PWA install.
3. **Switching to local mode leaves the PWA origin.** If you tap **Open local
   mode** inside the installed app, the browser navigates to `http://<hub-ip>`.
   On iOS this typically drops you out of the installed PWA context into a
   regular browser tab — you lose the standalone app chrome until you reopen the
   home-screen icon (which returns to cloud).
4. **No Android-style local banner on iOS.** iOS does not show the "switch to
   local mode" banner.
5. **WebSocket is local-only** (see below). An installed iOS PWA using the cloud
   URL will not get LAN WebSocket updates; polling still works.
6. **Practical recommendation for iOS:** install the PWA from the cloud URL for
   everyday and remote use. If you want maximum LAN speed at home, bookmark the
   local URL separately — but treat it as a browser bookmark, not the installed
   PWA. Do not expect to combine "installed PWA" and "always on local HTTP" on
   iOS in one home-screen icon.

### Real-time updates (WebSocket)

When **Enable real-time updates on local network (eventsocket)** is on in app
preferences (default: enabled), the dashboard connects to
`ws://<hub-ip>/eventsocket` while you are on the **local URL**.

| | Local URL | Cloud URL |
| --- | --- | --- |
| Polling (`/data`) | Yes | Yes |
| WebSocket | Yes | **No** — cloud proxy does not expose eventsocket |

**What WebSocket updates:** device switch/level/color changes, thermostat
attributes, lock state, shade position, music player state, sensor readings,
battery, HSM status, and hub mode — without waiting for the next poll.

**Caveats**

- The eventsocket interface is a local-only, undocumented Hubitat feature and may
  change in future hub firmware. Polling is the reliable baseline; WebSocket is
  an enhancement.
- When WebSocket is connected, the poll interval may lengthen; polling resumes
  fully if the socket disconnects.
- Polling pauses when the browser tab or PWA is hidden and resumes when you return.

### PWA installation

Use the **Cloud** link from the app page (`cloud.hubitat.com`, path includes
`/dashboard`).

| Platform | How to install |
| -------- | -------------- |
| **Android Chrome** | Open the cloud URL → menu → **Install app** (or the install banner) |
| **iOS Safari** | Open the cloud URL → **Share** → **Add to Home Screen** |

The installed app opens in a standalone window branded **mDash**. A pass-through
service worker is registered (required for Chrome install criteria) but **does
not cache** assets — the hub must be online; there is no offline mode.

After OAuth token regeneration, open a fresh cloud link and reinstall or re-add to
home screen.

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

## App preferences (hub)

All settings below are in **Apps → Modern Dashboard** (the installed app instance).

| Section | Setting | Default | Notes |
| ------- | ------- | ------- | ----- |
| Devices | Lights, switches, outlets, thermostats, sensors, locks, garage doors, shades, music, speakers | — | See [device selection](#device-selection) |
| Options | Dashboard name | `mDash` | Browser tab and PWA title |
| Options | Refresh interval | 5 s (2–60) | `/data` poll interval |
| Options | Enable eventsocket | On | LAN WebSocket; see [WebSocket](#real-time-updates-websocket) |
| Scheduler | 24-hour time display | Off | Display only; stored times are 24h |
| Light control | Disable metering | Off | When off, commands are staggered |
| Light control | Metering delay | 75 ms | 0–2000 ms between light commands |
| Light control | On/off optimization | Off | Skip on/off if device already in target state |
| Light control | Activation optimization | Off | Skip level/CT/RGB on snapshot restore if already correct |
| Dashboard access | Dashboard password | Off | Password required to open dashboard (7-day sliding session) |
| Locks | Unlock PIN | Off | PIN required to unlock / open garage from dashboard |
| Thermostats | Show in quick menu | On | Hide thermostats nav icon when off |
| Security | HSM enabled | Off | Show Security quick-nav icon |
| Security | HSM PIN | Off | PIN required to arm/disarm |
| Hub file access | Username / password | — | Only if Hub Login Security blocks file reads |

### Device selection

| Preference | Main lights view | Scheduler | Other views |
| ---------- | ---------------- | --------- | ----------- |
| Lights (switches & dimmers) | Tiles by room | On/off, dim, CT | — |
| Outlets | Socket tiles by room, or separate Outlets tab (preference) | On/off only | Favorites |
| Thermostats | Room header + Thermostats popup | Mode, setpoints, fan | All thermostats bulk |
| Temperature sensors | Room header (read-only) | — | Sensors popup |
| Locks | — | — | Locks popup (locks + garage doors) |
| Shades | — | — | Blinds popup |
| Music / speakers | — | — | Music popup |
| Motion, contact, water, etc. | — | — | Sensors popup |
| Valves | — | — | Sensors popup (open/close) |
| Hub scenes | — | — | Scenes popup (all hub scenes) |
| Hub mode | — | Trigger & action | Hub mode popup |

Outlets may also be selected in the **Lights** picker (they then behave as
lights, including room/house on/off). The **Outlets** picker and optional
**separate Outlets tab** only include devices selected under **Outlets**.

## Community and wider distribution

- **Forum release post:**
  [Hubitat Community thread](https://community.hubitat.com/t/release-modern-dashboard-mdash-minimal-setup-pwa-with-built-in-scheduler-runs-entirely-on-your-hub/165028)
  (draft/archive in [`docs/hubitat-community-post.md`](docs/hubitat-community-post.md)).
- **HPM community registry:** see [`docs/hpm-registry.md`](docs/hpm-registry.md)
  for submitting a PR so the package appears in HPM search (optional; custom repo
  install works today).

## Security

- The cloud and local dashboard URLs include your OAuth **access_token** (Hubitat
  standard). Anyone with the URL can control the devices you selected in app
  preferences. Treat links like secrets.
- Revoking OAuth or regenerating the token invalidates old URLs — open a fresh
  link from the app page and reinstall the PWA if needed.
- Lock and HSM PINs are validated by this SmartApp before commands are sent; they
  are not Hubitat user-account passwords.
- Optional **Dashboard password** adds a second gate before the UI loads device
  data. The password is checked server-side; a signed session in browser storage
  renews for seven days while the dashboard is used, then expires after a week of
  inactivity. This does not replace the OAuth URL token — treat dashboard links
  as secrets either way.
- The dashboard does not implement Hubitat admin login. The optional **Hub file
  access** credentials are only for the SmartApp to read File Manager assets when
  Hub Login Security is enabled.

## Move to another hub

Paste the same `dist/ModernLightsDashboard.groovy`, enable OAuth, select devices.
Nothing to edit.

## How it works

**Architecture**

- UI assets live in Hubitat **File Manager** (`mld-*` files). The Groovy SmartApp
  serves them and implements a slim JSON API — no Maker API.
- JS is split into four chunks to stay under Hubitat's ~128 KB per-file limit.
- PWA manifest and pass-through service worker enable home-screen install from the
  cloud URL.

**Data sync**

- The page polls `GET /data` on a configurable interval. Response includes devices,
  room/nav order, favorites, snapshots, schedules, HSM state, sun times, and config.
- On the LAN, optional WebSocket pushes device events for faster UI updates.
- Commands use optimistic UI: the tile updates immediately; failed commands roll back.
- When the page is hidden, polling stops and WebSocket disconnects; both resume on return.

**Commands**

| Endpoint | Use |
| -------- | --- |
| `GET /cmd?id=…&c=…&v=…` | Single device command |
| `POST /cmd/batch` | Sequential batch (room/house on/off) |
| `POST /snapshot/save`, `/snapshot/restore` | Light snapshots |
| `POST /lights/bulk` | Bulk on/off by scope |
| `POST /hub-mode`, `/hsm`, `/scene/activate` | Mode, security, scenes |
| `GET/POST /schedules/*` | Scheduler CRUD, toggle, test |
| `POST /settings/room-order`, `/nav-order`, `/favorites` | Layout sync |

All endpoints require `?access_token=…` (included automatically when you open the
dashboard link from the app page).

**Smart names**

`stripRoomPrefix()` removes a leading room name from device labels when the device
is already grouped under that room — but only when the remainder starts with a
non-alphanumeric separator (space, hyphen, etc.), so names like "KitchenAid" in the
Kitchen room are not shortened incorrectly.

## Limitations

- No offline mode — hub must be reachable (local or cloud).
- WebSocket only on the local URL; cloud access uses polling only.
- Plain switches are scheduler-only (not shown as tiles). Outlets can appear in
  room cards or a separate Outlets tab (companion app preference); they are
  excluded from room/house on/off and light snapshots either way.
- Cloud responses are capped at ~128 KB; the slim API supports ~130 lights on one
  page but very large installs may need device subsetting.
- Service worker does not cache — refresh always fetches from the hub.
- iOS PWA and local-mode switching have constraints documented in
  [Local vs cloud mode](#local-vs-cloud-mode).

## License

Copyright 2026 Ephrayim (evdev)

Licensed under the [Apache License, Version 2.0](LICENSE). See [LICENSE](LICENSE)
and [NOTICE](NOTICE) for attribution.

Source: [https://github.com/evdev/hubitat-modern-dashboard](https://github.com/evdev/hubitat-modern-dashboard)

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
