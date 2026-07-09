# Hubitat Community release post (draft)

Copy the title and body below into a new topic on the
[Hubitat Community](https://community.hubitat.com/) (Apps category is a good fit).
After publishing, set `COMMUNITY_LINK` in `build.mjs` to your thread URL and rebuild
so HPM shows the link.

Screenshots help a lot — capture from your hub or from the local preview
(`node preview/server.mjs` → http://localhost:4321/). Attach a few images of the
main lights view, scheduler, and phone home-screen icon if you can.

---

**Title:** Modern Dashboard (mDash) — control-first PWA with bulk actions & scheduler, runs entirely on your hub

**Body:**

## Modern Dashboard for Hubitat

I built a mobile-first dashboard that tries to stay out of your way — and that is
designed around **control**, not just viewing status.

Most dashboards are status boards. This one is optimized for *doing* things:
large touch targets, drag-to-dim, and **bulk device control** so you can turn off
a whole room's lights, the whole house, or adjust multiple thermostats at once.

**Select your devices and you're done.** No layout builder, no grouping rules, no
Maker API setup. Rooms and names come from your Hubitat room assignments. You
*can* customize a few things later, but you don't have to.

### What makes it different

1. **Control-first UI** — built for acting on devices quickly, including bulk
   room/house lights and multi-thermostat control. Status is available; control
   is the priority.
2. **Minimal-effort configuration** — install the app, pick devices, open the
   link. Layout is automatic from Hubitat rooms. Optional tweaks (theme,
   favorites, nav order, PINs) are available when you want them.
3. **Installable PWA** — open the cloud URL on your phone and add it to your home
   screen (Android: Install app; iOS Safari: Add to Home Screen). It opens like a
   standalone app with its own icon (**mDash**).
4. **Simple remote scheduler** — create and manage schedules from the dashboard
   itself, including when you're away. No Hubitat admin login, no Rule Machine,
   no external service — same OAuth dashboard URL you already use for control.
5. **Runs completely on your hub** — UI, API, scheduler, snapshots, and favorites
   all live on the hub. No third-party cloud backend. Remote access uses Hubitat's
   own cloud proxy when you want it.

### Features at a glance

- **Lights** — room-grouped tiles, drag-to-dim, RGB / color temperature, **per-room
  and whole-house on/off**, light snapshots (slide to save/restore)
- **Scheduler** — daily, weekly, one-time, sunrise/sunset (with offsets), and hub
  mode triggers; actions for lights, switches, outlets, thermostats, and hub mode
- **Climate** — thermostat dial (setpoints, mode, fan) and **multi-select bulk
  thermostat control**
- **Security & home** — locks (optional PIN), HSM arm/disarm (optional PIN),
  Hubitat scenes, hub mode
- **Shades / blinds** — open/close/pause and drag-to-position
- **Music / media** — Sonos, Echo Speaks, AirPlay, Chromecast (where supported)
- **Sensors** — motion, contact, water, presence, humidity, illuminance, smoke/CO,
  temperature (+ battery when available)
- **UX** — dark/light/auto theme, search, collapsible rooms, favorites, reorderable
  rooms and nav icons (synced across devices), local ↔ cloud switching

Plain switches and outlets are selected separately and used in the **scheduler**
(they are not shown as light tiles on the main view).

### Install (HPM — recommended)

1. In **Hubitat Package Manager → Settings**, add this custom repository:

   `https://raw.githubusercontent.com/evdev/hubitat-modern-dashboard/master/hubitat/repository.json`

2. **Install → By Repository** → **Modern Dashboard**
3. **Apps → Add User App → Modern Dashboard** → select devices → **Done**
4. Open the **Cloud** link from the app page
5. On your phone: install as a PWA / Add to Home Screen if you like
6. Tap the **Scheduler** icon to add schedules you can manage remotely

HPM enables OAuth and deploys the File Manager assets automatically.

**Updates:** use HPM Update. The custom repo must point at `master` (not a
version-tagged URL), or updates will never appear. If files look stale after Match
Up, use **Repair** on the package.

### Manual / bundle install

See the [README](https://github.com/evdev/hubitat-modern-dashboard#readme) for
bundle and paste-into-Apps-Code instructions (upload 11 `mld-*` files to File
Manager, enable OAuth).

### Security note

The cloud URL includes your OAuth access token (Hubitat's normal pattern). Treat
it like a secret — anyone with the URL can control the devices you've selected.
If you regenerate the token, open a fresh cloud link and reinstall the PWA.

### Links

- Source & docs: https://github.com/evdev/hubitat-modern-dashboard
- License: Apache 2.0
- Current version: see the repo / HPM package (0.2.x)

Feedback, feature requests, and screenshots welcome in this thread. Happy to
answer questions about setup, the scheduler, or how it compares to the built-in
dashboard / other community dashboards.
