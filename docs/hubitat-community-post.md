# Hubitat Community release post (draft)

Copy the body below into a new topic on the [Hubitat Community](https://community.hubitat.com/) (Apps category). After publishing, set `COMMUNITY_LINK` in `build.mjs` to your thread URL and rebuild.

---

**Title:** Modern Dashboard — minimal-setup room dashboard (PWA, hub-only)

**Body:**

## Modern Dashboard for Hubitat

A mobile-first dashboard with almost no configuration: **select your devices in the app and you're done.** Everything is grouped by Hubitat room, laid out automatically, and works on both your local network and via the Hubitat cloud proxy.

### Why you might like it

- **Minimal setup** — pick lights, thermostats, sensors, locks, and media players; no manual layout or grouping rules.
- **Smart names** — room prefixes are stripped from device labels (e.g. "Kitchen Light" under Kitchen, not "Kitchen Kitchen Light").
- **Installable PWA** — open the cloud URL on your phone and add to your home screen.
- **Hub-only** — UI and API are served from your hub. No Maker API, no third-party cloud backend.

### Features

Room-grouped lights with dimmers, RGB/CT, per-room on/off, search, and collapsible rooms. Thermostat dial (setpoints, mode, fan). Music/media controls (Sonos, Echo Speaks, AirPlay, Chromecast where supported). Locks, HSM, and a sensors popup. Dark/light/auto themes. Optional LAN WebSocket updates.

### Install (HPM — recommended)

1. In **Hubitat Package Manager → Settings**, add this custom repository:
   `https://raw.githubusercontent.com/evdev/hubitat-modern-dashboard/master/hubitat/repository.json`
2. **Install → By Repository** → **Modern Dashboard**
3. **Apps → Add User App → Modern Dashboard** → select devices → **Done**
4. Open the **Cloud** link from the app page; install as a PWA if you like.

Updates: HPM **Update** (manifest must track `master`, not a version-tagged URL — see README).

### Links

- Source & README: https://github.com/evdev/hubitat-modern-dashboard
- License: Apache 2.0

Feedback and screenshots welcome in this thread.
