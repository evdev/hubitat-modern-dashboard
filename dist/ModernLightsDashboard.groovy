// Modern Dashboard v0.3.46
// Author: Ephrayim (evdev)
// Distribution: https://github.com/evdev/hubitat-modern-dashboard
// License: Apache License 2.0 (see LICENSE in repository)
//
// INSTALL:
//   1. Paste this file into Apps Code, enable OAuth, Save.
//   2. Upload the 12 files from dist/upload/ to Settings -> File Manager:
//        mld-index.html, mld-app.css, mld-app-post.css, mld-app.js, mld-app-core.js, mld-app-post.js, mld-app-post2.js, mld-app-post3.js,
//        mld-manifest.webmanifest, mld-sw.js, mld-icon-192.b64, mld-icon-512.b64
//   3. Apps -> Add User App -> Modern Dashboard -> select devices -> Done

import groovy.transform.Field

@Field private static Map LOCAL_ASSET_CACHE = [:]
@Field private static String LOCAL_ASSET_CACHE_VERSION = ""
@Field private static int LOCAL_ASSET_CACHE_BYTES = 0
@Field private static final int LOCAL_ASSET_CACHE_MAX_BYTES = 768 * 1024
@Field private static final String MLD_DEPLOYED_VERSION = "0.3.46"

definition(
    name: "Modern Dashboard",
    namespace: "mDash",
    author: "Ephrayim (evdev)",
    description: "Control-first Hubitat dashboard: select your devices and you're done. Bulk room/house lights and multi-thermostat control. Installable PWA, built-in remote scheduler (no Hubitat login), runs entirely on your hub.",
    category: "My Apps",
    iconUrl: "",
    iconX2Url: "",
    iconX3Url: "",
    oauth: [displayName: "Modern Dashboard", displayLink: ""]
)

preferences {
    page(name: "mainPage", uninstall: true, install: true)
}

def mainPage() {
    if (!state.accessToken) { createAccessToken() }
    def assetsOk = assetsPresent()
    def localUrl = dashboardUrl(true)
    def cloudUrl = dashboardUrl(false)
    dynamicPage(name: "mainPage", uninstall: true, install: true) {
        section("About Modern Dashboard", hideable: true, hidden: true) {
            paragraph "<small><b>Control-first:</b> optimized for acting on devices — bulk room/house lights, multi-thermostat control — not just viewing status.</small>"
            paragraph "<small><b>Minimal effort:</b> select your devices below — the dashboard groups them by Hubitat room and lays them out automatically. Customization is optional.</small>"
            paragraph "<small><b>PWA:</b> use the cloud link below to install on your phone's home screen (standalone app icon).</small>"
            if (schedulerDisabled != true) {
                paragraph "<small><b>Scheduler:</b> create and manage schedules from the dashboard — including remotely — without logging into the Hubitat admin UI.</small>"
                paragraph "<small><b>Hub-only:</b> UI, API, and scheduler run entirely on your hub — no Maker API or third-party cloud.</small>"
            } else {
                paragraph "<small><b>Hub-only:</b> UI and API run entirely on your hub — no Maker API or third-party cloud.</small>"
            }
            paragraph "<small>Version 0.3.46 · Ephrayim (evdev) · Apache License 2.0 · <a href='https://github.com/evdev/hubitat-modern-dashboard' target='_blank'>Source</a></small>"
        }
        if (assetsOk) {
            section("Dashboard links") {
                paragraph "<div style='margin-bottom:12px'><b>Local</b> (on your home network):<br><a href='${localUrl}' target='_blank' style='word-break:break-all'>${localUrl}</a></div>"
                paragraph "<div style='margin-bottom:8px'><b>Cloud</b> (works anywhere via Hubitat proxy):<br><a href='${cloudUrl}' target='_blank' style='word-break:break-all'>${cloudUrl}</a></div>"
                paragraph "<small>Open the <b>cloud</b> link on your phone to install as a PWA (Android Chrome: Install app) or use <b>Add to Home Screen</b> on iOS. Cloud URL must include <code>/dashboard</code> in the path.</small>"
            }
        } else {
            section("Required: upload dashboard files") {
                def names = listLocalFileNames()
                def need = requiredAssetFiles()
                def missing = need.findAll { n -> !fileNamePresent(names, n) }
                paragraph "Upload these files via <b>Settings → File Manager</b> (root folder, exact names):"
                paragraph "<ul><li><code>mld-index.html</code></li><li><code>mld-app.css</code></li><li><code>mld-app-post.css</code></li><li><code>mld-app.js</code></li><li><code>mld-app-core.js</code></li><li><code>mld-app-post.js</code></li><li><code>mld-app-post2.js</code></li><li><code>mld-app-post3.js</code></li><li><code>mld-manifest.webmanifest</code></li><li><code>mld-sw.js</code></li><li><code>mld-icon-192.b64</code></li><li><code>mld-icon-512.b64</code></li></ul>"
                if (names) {
                    def mld = names.findAll { it?.contains("mld-") }
                    paragraph "<small>Files seen on hub: ${mld ? mld.join(', ') : '(none matching mld-*)'}</small>"
                }
                if (missing) {
                    paragraph "<small><b>Still missing:</b> ${missing.join(', ')}</small>"
                }
                if (!hubSecurity) {
                    paragraph "<small><b>Hub Login Security enabled?</b> Expand <b>Hub file access</b> below, turn on the toggle, and enter your hub admin username/password (not the dashboard password above).</small>"
                } else if (!hubCredentials().user || !hubCredentials().pass) {
                    paragraph "<small><b>Hub file access:</b> enter your hub admin username and password below, then press <b>Done</b> again.</small>"
                } else if (state.hubLoginLastOutcome == "rejected") {
                    paragraph "<small><b>Hub file access:</b> hub rejected the login — re-check admin username/password under <b>Hub file access</b> (from <b>Settings → Hub Login Security</b>), re-enter the password, and press <b>Done</b>.</small>"
                } else if (!names) {
                    paragraph "<small><b>Hub file access:</b> could not list File Manager files. Upload the <code>mld-*</code> files above. If Hubitat Logs show <code>hub login rejected</code>, re-check credentials; otherwise re-enter the password and press <b>Done</b>.</small>"
                }
            }
        }
        section("Lights & outlets") {
            paragraph "<small>Rooms and layout are automatic based on your Hubitat room assignments.</small>"
            input "lights", "capability.switch", title: "Select your light devices (switches and dimmers)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "outletSwitches", "capability.switch", title: "Outlets",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "outletsSeparateTab", "bool", title: "Show outlets in separate Outlets tab", defaultValue: false, submitOnChange: true
            paragraph "<small>Outlets may also appear in the lights list. With <b>separate Outlets tab</b> off, outlets show in room cards; when on, they move to the Outlets quick-nav tab. Room On/Off never controls outlets.</small>"
        }
        section("Climate") {
            input "thermostats", "capability.thermostat", title: "Select your thermostats",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "thermostatsPopupEnabled", "bool", title: "Show thermostats in dashboard quick menu", defaultValue: true, submitOnChange: true
            input "tempSensors", "capability.temperatureMeasurement", title: "Temperature sensors (display only)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "roomClimateEnabled", "bool", title: "Show temperature and thermostat on room cards",
                defaultValue: true, submitOnChange: true
            paragraph "<small>When <b>quick menu</b> or <b>room cards</b> is off, thermostats and temperature sensors remain available in their other views.</small>"
        }
        section("Shades, fans & media") {
            input "windowShades", "capability.windowShade", title: "Shades & blinds (Window Shade drivers)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "windowBlinds", "capability.windowBlind", title: "Blinds (Window Blind drivers)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "windowShadesLevel", "capability.switchLevel", title: "Shades & blinds (dimmer / Switch Level drivers)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            paragraph "<small>Use the first two lists for <b>Window Shade</b> / <b>Window Blind</b> drivers. Many motors only advertise <b>Switch Level</b> — pick those in the third list. That list also includes ordinary lights; select shades only and put real lights under Lights.</small>"
            input "ceilingFans", "capability.fanControl", title: "Ceiling fans",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "musicPlayers", "capability.musicPlayer", title: "Music / media players (Sonos, Echo Speaks, AirPlay, …)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "audioSpeakers", "capability.audioVolume", title: "Additional speakers (Chromecast, Google Home, …)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
        }
        section("Locks & garage") {
            paragraph "<small>Locks and garage doors appear in the Locks dashboard popup.</small>"
            input "locks", "capability.lock", title: "Locks",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "garageDoors", "capability.garageDoorControl", title: "Garage door openers",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "unlockPinEnabled", "bool", title: "Require PIN to unlock doors / open garage doors from dashboard", defaultValue: false, submitOnChange: true
            if (unlockPinEnabled) {
                input "unlockPin", "password", title: "Unlock PIN", required: false
                paragraph "<small>PIN is validated before unlock and garage-open commands. Locking and closing do not require a PIN.</small>"
            }
        }
        section("Sensors") {
            paragraph "<small>Sensors appear in the Sensors popup. Multi-sensors may overlap with other pickers; temperature + humidity or illuminance merge into one tile. Alert types (motion, contact, etc.) stay primary with other readings in the footer.</small>"
            input "motionSensors", "capability.motionSensor", title: "Motion sensors",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "shockSensors", "capability.accelerationSensor", title: "Shock / glass-break sensors",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "contactSensors", "capability.contactSensor", title: "Contact / door / window sensors",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "waterSensors", "capability.waterSensor", title: "Water / leak sensors",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "presenceSensors", "capability.presenceSensor", title: "Presence sensors",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "humiditySensors", "capability.relativeHumidityMeasurement", title: "Humidity sensors",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "illuminanceSensors", "capability.illuminanceMeasurement", title: "Illuminance / light sensors",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "smokeSensors", "capability.smokeDetector", title: "Smoke / CO detectors",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "genericSensors", "capability.sensor", title: "Other / generic sensors",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "valves", "capability.valve", title: "Valves (water shutoff, irrigation)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
        }
        section("Cameras") {
            paragraph "<small>Select <b>go2rtc Camera</b> devices. Requires <b>Enable tabs</b> and the <b>local hub dashboard URL</b>. Grid tiles use the sub stream; tap <b>HD</b> for the main stream.</small>"
            input "cameras", "capability.imageCapture", title: "Cameras (go2rtc)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
        }
        section("Notifications") {
            paragraph "<small>Rule Machine and other apps can send notifications to an <b>mDash Notifications</b> device; the dashboard shows each unread message as a banner until marked as read.</small>"
            def notifChild = getNotificationChildDevice()
            if (notifChild) {
                paragraph "<small><b>Dashboard notification device:</b> ${htmlEsc(notifChild.displayName)} (created by this app).</small>"
            } else {
                input "notifDeviceLabel", "string", title: "Name for new mDash Notifications device",
                    defaultValue: "Dashboard Notifications", required: false
                input name: "btnCreateNotifDevice", type: "button", title: "Create mDash Notifications device"
                paragraph "<small>Requires the <b>mDash Notifications</b> driver from this package (installed automatically via HPM). The device can be renamed under <b>Devices</b>; deleting it only removes it from the hub — use <b>Create</b> again to add a new one.</small>"
                if (state.notifDeviceCreateError) {
                    paragraph "<small><b>Could not create device:</b> ${htmlEsc(state.notifDeviceCreateError.toString())}</small>"
                }
                if (state.notifDeviceCreateOk) {
                    paragraph "<small><b>Created:</b> ${htmlEsc(state.notifDeviceCreateOk.toString())}</small>"
                }
            }
            input "notificationDevices", "capability.notification", title: "Notification devices",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            paragraph "<small>Creating the device above selects it once. You can remove it from this list or add other <code>capability.notification</code> devices; your selection is kept when you press Done.</small>"
        }
        section("Dashboard options") {
            input "dashboardName", "string", title: "Dashboard name", defaultValue: "mDash", required: false
            input "pollSec", "number", title: "Refresh interval (seconds)", defaultValue: 5, required: false, range: "2..60"
            input "enableWs", "bool", title: "Enable real-time updates on local network (eventsocket)", defaultValue: true, required: false
            input "defaultTab", "enum", title: "Default tab when dashboard loads",
                options: [
                    ["lights": "Lights"],
                    ["favorites": "Favorites"],
                    ["sensors": "Sensors"],
                    ["thermostats": "Thermostats"],
                    ["music": "Music"],
                    ["cameras": "Cameras"],
                    ["blinds": "Blinds"],
                    ["fans": "Fans"],
                    ["outlets": "Outlets"],
                    ["scheduling": "Scheduler"]
                ],
                defaultValue: "lights", required: false
            paragraph "<small>Applies when Category tabs is enabled on the dashboard. Falls back to Lights if the chosen tab has no content (or Cameras when not on the local URL).</small>"
            input "hubModePopupEnabled", "bool", title: "Show hub mode in dashboard quick menu", defaultValue: true, submitOnChange: true
            input "scenesPopupEnabled", "bool", title: "Show scenes in dashboard quick menu", defaultValue: true, submitOnChange: true
            paragraph "<small>Hub mode and scene toggles only hide quick-nav buttons; scheduler and other features still use them.</small>"
            input "schedulerDisabled", "bool",
                title: "Hide scheduler (also stops schedules from running)",
                defaultValue: false, submitOnChange: true
            if (schedulerDisabled != true) {
                input "schedulerUse24Hour", "bool", title: "Use 24-hour time in scheduler", defaultValue: false
            }
            paragraph "<small>When scheduler is hidden, no schedules run. Saved schedules are kept if you turn it back on.</small>"
            input "debugLogging", "bool", title: "Enable debug logging", defaultValue: false, submitOnChange: true
            paragraph "<small>Logs command traces to Hubitat Logs for troubleshooting. Auto-disables after 30 minutes. Failures are always logged regardless of this setting.</small>"
        }
        section("Light control", hideable: true, hidden: true) {
            paragraph "<small>Applies to snapshot restore, All on/off, and room on/off. Metering is on by default.</small>"
            input "lightControlDisableMetering", "bool",
                title: "Disable metering", defaultValue: false, submitOnChange: true
            if (lightControlDisableMetering != true) {
                input "lightControlMeterDelayMs", "number",
                    title: "Metering delay (milliseconds)", defaultValue: 75, required: false, range: "0..2000"
                paragraph "<small>Wait between commands to each device. May help if devices respond poorly to rapid successive commands.</small>"
            }
            input "lightControlOnOffOptimization", "bool",
                title: "Enable on/off optimization", defaultValue: false
            paragraph "<small>Skip on/off commands when the device already reports the desired state. May reduce traffic but can misbehave if state is stale.</small>"
            input "lightControlActivationOptimization", "bool",
                title: "Enable activation optimization", defaultValue: false
            paragraph "<small>Snapshot restore only: skip level, color, and color temperature when the device already matches.</small>"
        }
        section("Security & access") {
            input "dashboardPasswordEnabled", "bool", title: "Require password to open dashboard", defaultValue: false, submitOnChange: true
            if (dashboardPasswordEnabled) {
                input "dashboardPassword", "password", title: "Dashboard password", required: false
                paragraph "<small>Visitors must enter this password before the dashboard loads. Unlock lasts seven days while the dashboard is used.</small>"
            }
            input "hsmEnabled", "bool", title: "Enable HSM security control", defaultValue: false, submitOnChange: true
            if (hsmEnabled) {
                input "hsmPinEnabled", "bool", title: "Require PIN to arm/disarm from dashboard", defaultValue: false, submitOnChange: true
                if (hsmPinEnabled) {
                    input "hsmPin", "password", title: "HSM PIN", required: false
                    paragraph "<small>PIN is validated before arm/disarm commands to Hubitat Safety Monitor.</small>"
                }
            }
        }
        section("Hub file access", hideable: true, hidden: !(hubSecurity || !assetsOk)) {
            paragraph "Required when <b>Settings → Hub Login Security</b> is enabled. Use your <b>hub admin</b> login (Settings → Hub Login Security), not the optional dashboard password above."
            input "hubSecurity", "bool", title: "Hub Login Security is enabled", defaultValue: false, submitOnChange: true
            if (hubSecurity) {
                input "hubUsername", "string", title: "Hub username", required: false
                input "hubPassword", "password", title: "Hub password", required: false
                paragraph "<small>Re-enter the password whenever you change other settings — Hubitat clears password fields on save.</small>"
            }
        }
    }
}

def installed() {
    if (!state.accessToken) { createAccessToken() }
    logInit()
    try { syncHubCredentials() } catch (e) { log.warn "Modern Dashboard: hub credential sync failed: ${e}" }
    try { initializeScheduler() } catch (e) { log.warn "Modern Dashboard: scheduler init failed: ${e}" }
    try { initializeHsm() } catch (e) { log.warn "Modern Dashboard: HSM init failed: ${e}" }
    try { initializeNotifications() } catch (e) { log.warn "Modern Dashboard: notifications init failed: ${e}" }
}

def updated() {
    logInit()
    try { clearLocalAssetCache() } catch (e) { log.warn "Modern Dashboard: asset cache clear failed: ${e}" }
    try { syncHubCredentials() } catch (e) { log.warn "Modern Dashboard: hub credential sync failed: ${e}" }
    try { syncDashPasswordEpoch() } catch (e) { log.warn "Modern Dashboard: dash password sync failed: ${e}" }
    try { initializeScheduler() } catch (e) { log.warn "Modern Dashboard: scheduler init failed: ${e}" }
    try { initializeHsm() } catch (e) { log.warn "Modern Dashboard: HSM init failed: ${e}" }
    try { initializeNotifications() } catch (e) { log.warn "Modern Dashboard: notifications init failed: ${e}" }
    syncDebugLoggingAutoOff()
}

def appButtonHandler(btn) {
    if (btn == "btnCreateNotifDevice") {
        createNotificationChildDeviceFromUi()
    }
}

def initialize() {
    syncDebugLoggingAutoOff()
}

def syncDebugLoggingAutoOff() {
    if (debugLogging != true) {
        state.remove("debugLogExpiresAt")
        state.debugLogWasOn = false
        try { unschedule("logsOff") } catch (e) {}
        return
    }
    def nowMs = now()
    def expiresAt = null
    if (state.debugLogExpiresAt != null) {
        try { expiresAt = state.debugLogExpiresAt.toLong() } catch (e) { expiresAt = null }
    }
    def newlyEnabled = (state.debugLogWasOn != true)
    if (newlyEnabled || expiresAt == null) {
        expiresAt = nowMs + 1800000L
        state.debugLogExpiresAt = expiresAt
    }
    state.debugLogWasOn = true
    if (nowMs >= expiresAt) {
        logsOff()
        return
    }
    def remainingSec = Math.max(1, Math.ceil((expiresAt - nowMs) / 1000.0).toInteger())
    try { unschedule("logsOff") } catch (e) {}
    runIn(remainingSec, "logsOff")
}

def logsOff() {
    state.debugLogExpiresAt = now()
    state.debugLogWasOn = false
    if (debugLogging != true) return
    log.warn "Modern Dashboard: debug logging disabled (auto-off after 30 minutes)"
    // String "false" matches Hubitat community apps; boolean false also works on newer hubs.
    app?.updateSetting("debugLogging", [value: "false", type: "bool"])
}

def debugLogActive() {
    if (debugLogging != true) return false
    if (state.debugLogExpiresAt != null) {
        try {
            if (now() > state.debugLogExpiresAt.toLong()) return false
        } catch (e) {}
    }
    return true
}

def logDbg(msg) {
    if (debugLogActive()) log.debug "Modern Dashboard: ${msg}"
}

def deviceLabel(dev) {
    if (!dev) return "?"
    def n = dev.displayName ?: dev.name ?: "device"
    return "${n} (${dev.id})"
}

def logCmdFailure(dev, cmd, val, err) {
    def v = (val != null && val.toString() != "") ? " v=${val}" : ""
    log.warn "Modern Dashboard: cmd failed — ${deviceLabel(dev)} ${cmd}${v}: ${err}"
}

def logInit() {
    if (lights) { log.info "Modern Dashboard: ${lights.size()} light(s) authorized" }
    if (outletSwitches) { log.info "Modern Dashboard: ${outletSwitches.size()} outlet(s) authorized" }
    if (thermostats) { log.info "Modern Dashboard: ${thermostats.size()} thermostat(s) authorized" }
    if (tempSensors) { log.info "Modern Dashboard: ${tempSensors.size()} temperature sensor(s) authorized" }
    def sensorCount = allSensorDevices()?.size() ?: 0
    if (sensorCount) { log.info "Modern Dashboard: ${sensorCount} other sensor(s) authorized" }
    def audioCount = allAudioDevices()?.size() ?: 0
    if (audioCount) { log.info "Modern Dashboard: ${audioCount} audio device(s) authorized" }
    def shadeCount = allWindowShades()?.size() ?: 0
    if (shadeCount) { log.info "Modern Dashboard: ${shadeCount} shade(s) authorized" }
    if (ceilingFans) { log.info "Modern Dashboard: ${ceilingFans.size()} ceiling fan(s) authorized" }
    if (valves) { log.info "Modern Dashboard: ${valves.size()} valve(s) authorized" }
    if (garageDoors) { log.info "Modern Dashboard: ${garageDoors.size()} garage door(s) authorized" }
    if (cameras) { log.info "Modern Dashboard: ${cameras.size()} camera(s) authorized" }
    if (state.accessToken == null) { state.accessToken = createAccessToken() }
    if (!assetsPresent()) { log.warn "Modern Dashboard: upload all mld-* dashboard files to File Manager (see app setup page)" }
}

def allAudioDevices() {
    def out = []
    def seen = [:]
    if (musicPlayers) {
        for (d in musicPlayers) {
            def key = d.id.toString()
            if (!seen[key]) { seen[key] = true; out << d }
        }
    }
    if (audioSpeakers) {
        for (d in audioSpeakers) {
            def key = d.id.toString()
            if (!seen[key]) { seen[key] = true; out << d }
        }
    }
    return out
}

def allWindowShades() {
    def out = []
    def seen = [:]
    // Window Shade, Window Blind, and Switch Level (dimmer-style) shade drivers.
    // settings.windowShadesVirtual: one-release migration from an earlier Virtual Shade-only picker.
    for (list in [windowShades, windowBlinds, windowShadesLevel, settings?.windowShadesVirtual]) {
        for (d in asDeviceList(list)) {
            if (d == null) continue
            def key = null
            try { key = d.id?.toString() } catch (e) { key = null }
            if (!key || seen[key]) continue
            seen[key] = true
            out << d
        }
    }
    return out
}

def shadePosition(dev) {
    def pos = safeCurrent(dev, "position")
    if (pos != null) return pos
    return safeCurrent(dev, "level")
}

def shadeStatus(dev) {
    def st = safeCurrent(dev, "windowShade")
    if (st != null) return st
    st = safeCurrent(dev, "windowBlind")
    if (st != null) return st
    def pos = shadePosition(dev)
    if (pos != null && isNumberLike(pos)) {
        int p = new BigDecimal(pos.toString()).intValue()
        if (p <= 0) return "closed"
        if (p >= 99) return "open"
        return "partially open"
    }
    def sw = safeCurrent(dev, "switch")
    if (sw == "off") return "closed"
    if (sw == "on") return "open"
    return null
}

// Sensor descriptors as methods (not fields) — Hubitat can leave Groovy field
// initializers null (same class of bug as dashSessionTtlMs).
// Ordered for dedup priority (safety first).
def sensorTypeInputs() {
    return [
        [list: smokeSensors,       t: "smoke",       attr: "smoke",        alerts: ["detected"]],
        [list: waterSensors,       t: "leak",        attr: "water",        alerts: ["wet"]],
        [list: contactSensors,     t: "contact",     attr: "contact",      alerts: ["open"]],
        [list: motionSensors,      t: "motion",      attr: "motion",       alerts: ["active"]],
        [list: shockSensors,       t: "shock",       attr: "acceleration", alerts: ["active"]],
        [list: presenceSensors,    t: "presence",    attr: "presence",     alerts: ["present"]],
        [list: humiditySensors,    t: "humidity",    attr: "humidity",     alerts: []],
        [list: illuminanceSensors, t: "illuminance", attr: "illuminance",  alerts: []],
        [list: genericSensors,     t: "generic",     attr: null,           alerts: []]
    ]
}

// Noisy / internal attributes to skip when building ex[].
def sensorSkipAttrs() {
    return [
        "lastupdate", "lastevent", "epevent", "devicewatch-devicestatus", "checkinterval", "status", "name",
        "switch", "power", "energy", "rssi", "lqi", "lastactivity", "lastopened", "lastclosed", "datatype", "level", "healthstatus",
        "tamper", "enrollment", "encap", "destinationendpoint", "cluster", "fccdeviceclass", "firmware",
        "hardware", "software", "supportedthermostatmodes", "supportedfanmodes"
    ] as Set
}

def sensorExtraAttrKey(nm) {
    def n = nm?.toString()?.toLowerCase()
    if (n == "relativehumidity") return "humidity"
    return n
}

def sensorExtraStateEntry(d, nm) {
    if (!nm) return null
    def raw = null
    def unit = null
    try {
        def st = d.currentState(nm)
        raw = st?.value
        unit = st?.unit
    } catch (e) {}
    if (raw == null) return null
    def v = raw.toString()
    if (v.isEmpty()) return null
    return [k: sensorExtraAttrKey(nm), v: v, u: unit != null ? unit.toString() : null]
}

// Normalize a device input to a List (Hubitat may return a single DeviceWrapper).
def asDeviceList(val) {
    if (val == null) return []
    if (val instanceof Collection) return val as List
    return [val]
}

def allSensorDevices() {
    def out = []
    def seen = [:]
    for (spec in sensorTypeInputs()) {
        for (d in asDeviceList(spec.list)) {
            if (d == null) continue
            def key = null
            try { key = d.id?.toString() } catch (e) { key = null }
            if (!key || seen[key]) continue
            seen[key] = true
            out << [device: d, type: spec.t, attr: spec.attr, alerts: spec.alerts]
        }
    }
    return out
}

def sensorRoomId(d, roomsList) {
    def roomName = null
    try { roomName = d.getRoomName() } catch (e) { roomName = null }
    if (roomName) {
        def rm = roomsList.find { it.name == roomName }
        if (rm) return rm.id
    }
    return null
}

// Card-worthy secondary attrs only (typed sensors); generic may discover more via sensorSkipAttrs.
def sensorCardworthyExtraAttrNames() {
    return ["battery", "temperature", "humidity", "relativehumidity", "illuminance", "pressure", "co2", "carbonmonoxide"]
}

// Build ex[]: battery when present (not counted toward maxNonBattery), then up to maxNonBattery other attrs.
def sensorExtraAttrs(d, primaryAttr, int maxNonBattery, String sensorType = null) {
    def out = []
    def primary = primaryAttr?.toString()?.toLowerCase()
    def primaryKey = sensorExtraAttrKey(primary)
    def skip = sensorSkipAttrs()
    def ordered = []
    for (nm in sensorCardworthyExtraAttrNames()) {
        if (!ordered.contains(nm)) ordered << nm
    }
    boolean genericDiscovery = (sensorType == "generic")
    if (genericDiscovery) {
        def present = []
        try {
            for (st in d.currentStates) {
                def nm = st?.name?.toString()?.toLowerCase()
                if (!nm || skip.contains(nm)) continue
                def key = sensorExtraAttrKey(nm)
                if (key == primaryKey) continue
                if (!ordered.contains(nm)) present << nm
            }
        } catch (e) {}
        for (nm in ((present as Set).sort())) {
            if (!ordered.contains(nm)) ordered << nm
        }
    }
    int addedNonBattery = 0
    def seenKeys = [] as Set
    for (nm in ordered) {
        def key = sensorExtraAttrKey(nm)
        if (key == primaryKey || seenKeys.contains(key)) continue
        def entry = sensorExtraStateEntry(d, nm)
        if (!entry) continue
        if (key == "battery") {
            out << entry
            seenKeys << key
            continue
        }
        if (addedNonBattery >= maxNonBattery) continue
        out << entry
        seenKeys << key
        addedNonBattery++
    }
    return out
}

def sensorExMaxForType(t) {
    return (t == "generic") ? 5 : 4
}

def sensorShowsLastEvent(t) {
    return ["motion", "contact", "shock", "smoke", "leak", "presence"].contains(t)
}

def sensorLastEventAttrCandidates(t) {
    switch (t) {
        case "contact": return ["lastOpened", "lastClosed", "lastActivity", "lastEvent"]
        case "motion": return ["lastActivity", "lastEvent"]
        case "shock": return ["lastActivity", "lastEvent"]
        default: return ["lastActivity", "lastEvent"]
    }
}

def parseSensorEventTimeMs(raw) {
    if (raw == null) return null
    try {
        String v = raw.toString().trim()
        if (v.isEmpty()) return null
        if (v ==~ /^\d+$/) {
            long n = Long.parseLong(v)
            if (n < 10000000000L) return n * 1000L
            return n
        }
        def tz = location.timeZone
        def patterns = [
            "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
            "yyyy-MM-dd'T'HH:mm:ssZ",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd'T'HH:mm",
            "yyyy-MM-dd HH:mm:ss",
            "MMM d, yyyy h:mm:ss a",
            "MMM d, yyyy h:mm a"
        ]
        for (pat in patterns) {
            try {
                def fmt = new java.text.SimpleDateFormat(pat, java.util.Locale.US)
                if (tz) fmt.setTimeZone(tz)
                return fmt.parse(v).getTime()
            } catch (e) {}
        }
    } catch (e) {}
    return null
}

def resolveSensorLastEventMs(d, t) {
    if (!sensorShowsLastEvent(t)) return null
    Long best = null
    for (attr in sensorLastEventAttrCandidates(t)) {
        def raw = safeCurrent(d, attr)
        def ms = parseSensorEventTimeMs(raw)
        if (ms != null && (best == null || ms > best)) best = ms
    }
    if (best == null) {
        try {
            def la = d.getLastActivity()
            if (la) best = la.time
        } catch (e) {}
    }
    return best
}

def appendExJsonArray(out, extras) {
    out << ",\"ex\":["
    boolean exFirst = true
    for (ex in extras) {
        if (!exFirst) out << ","; exFirst = false
        out << "{\"k\":" << jsonStr(ex.k)
        if (isNumberLike(ex.v)) {
            out << ",\"v\":" << numOrNull(ex.v)
        } else {
            out << ",\"v\":" << jsonStr(ex.v)
        }
        out << ",\"u\":" << jsonStr(ex.u)
        out << "}"
    }
    out << "]"
}

def audioControlFlags(d) {
    if (d == null) return 0
    int f = 0
    if (d.hasCommand("play")) f |= 1
    if (d.hasCommand("pause")) f |= 2
    if (d.hasCommand("stop")) f |= 4
    if (d.hasCommand("previousTrack")) f |= 8
    if (d.hasCommand("nextTrack")) f |= 16
    if (d.hasCommand("setVolume") || d.hasCapability("MusicPlayer") || d.hasCapability("AudioVolume")) f |= 32
    if (d.hasCommand("mute")) f |= 64
    return f
}

def normalizeAudioStatus(d) {
    def st = safeCurrent(d, "status")
    if (st != null) {
        def s = st.toString().toLowerCase()
        if (s == "running") return "playing"
        if (s == "idle") return "idle"
        return s
    }
    def ts = safeCurrent(d, "transportStatus")
    if (ts != null) return ts.toString().toLowerCase()
    return "idle"
}

def normalizeAudioVolume(d) {
    def lvl = safeCurrent(d, "level")
    if (lvl != null) return lvl
    return safeCurrent(d, "volume")
}

def normalizeAudioTrack(d) {
    def tr = safeCurrent(d, "trackDescription")
    if (tr) return tr.toString()
    for (attr in ["currentAlbum", "currentStation", "mediaTitle"]) {
        def v = safeCurrent(d, attr)
        if (v) return v.toString()
    }
    def src = safeCurrent(d, "mediaSource")
    if (src && src.toString().toLowerCase() != "none") return src.toString()
    return ""
}

def audioRoomId(d, roomsList) {
    def roomName = null
    try { roomName = d.getRoomName() } catch (e) { roomName = null }
    if (!roomName) return null
    def rm = roomsList.find { it.name == roomName }
    return rm ? rm.id : null
}

def appendAudioDeviceJson(out, d, roomsList) {
    def rid = audioRoomId(d, roomsList)
    def statusVal = normalizeAudioStatus(d)
    def lvl = normalizeAudioVolume(d)
    def track = normalizeAudioTrack(d)
    def muteVal = safeCurrent(d, "mute")
    def flags = audioControlFlags(d)
    out << "{\"i\":" << d.id
    out << ",\"n\":" << jsonStr(d.displayName)
    out << ",\"r\":" << (rid == null ? "null" : rid.toString())
    out << ",\"st\":" << jsonStr(statusVal ?: "idle")
    out << ",\"v\":" << (lvl == null ? "null" : lvl.toString())
    out << ",\"tr\":" << jsonStr(track ?: "")
    out << ",\"m\":" << jsonStr(muteVal ?: "unmuted")
    out << ",\"f\":" << flags.toString()
    out << "}"
}

// Cloud API Gateway does not route path("/") — use a named endpoint (see Hubitat community webhook examples).
def dashboardUrl(boolean local) {
    def base = local ? getFullLocalApiServerUrl() : getFullApiServerUrl()
    return "${base}/dashboard?access_token=${state.accessToken}"
}

// ---------------------------------------------------------------------------
// File Manager asset cache + HTTP cache headers
// ---------------------------------------------------------------------------
def noStoreHeaders() {
    return [
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0"
    ]
}

def versionedAssetHeaders() {
    return ["Cache-Control": "private, max-age=31536000, immutable"]
}

def renderNoStore(String contentType, String data, int status = 200) {
    render contentType: contentType, data: data, status: status, headers: noStoreHeaders()
}

def renderJsonNoStore(String data, int status = 200) {
    render contentType: "application/json", data: data, status: status, headers: noStoreHeaders()
}

def renderVersionedAsset(String contentType, String data) {
    render contentType: contentType, data: data, status: 200, headers: versionedAssetHeaders()
}

def useDirectLocalAssets() {
    try {
        return request?.requestSource == "local" && !hubSecurity
    } catch (e) {
        return false
    }
}

def cacheableAssetFileNames() {
    return requiredAssetFiles() + [assetIcon512File()]
}

def isCacheableAsset(String fileName) {
    return cacheableAssetFileNames().contains(fileName)
}

def assetBodyByteLength(String body) {
    return body ? body.getBytes("UTF-8").length : 0
}

def clearLocalAssetCache(boolean keepGeneration = false) {
    def gen = LOCAL_ASSET_CACHE_VERSION
    LOCAL_ASSET_CACHE.clear()
    LOCAL_ASSET_CACHE_BYTES = 0
    LOCAL_ASSET_CACHE_VERSION = keepGeneration ? (gen ?: "") : ""
}

def assetCacheGeneration() {
    return LOCAL_ASSET_CACHE_VERSION ?: "${MLD_DEPLOYED_VERSION}|"
}

def assetCacheKey(String fileName) {
    return "${assetCacheGeneration()}:${fileName}"
}

def ensureAssetCacheVersion() {
    // Groovy app code updated while an older generation is still in memory.
    if (LOCAL_ASSET_CACHE_VERSION && !LOCAL_ASSET_CACHE_VERSION.startsWith("${MLD_DEPLOYED_VERSION}|")) {
        clearLocalAssetCache()
    }
}

def rememberCachedAsset(String fileName, String body) {
    if (!body || !isCacheableAsset(fileName)) return
    ensureAssetCacheVersion()
    def key = assetCacheKey(fileName)
    def bytes = assetBodyByteLength(body)
    if (bytes <= 0) return
    if (LOCAL_ASSET_CACHE_BYTES + bytes > LOCAL_ASSET_CACHE_MAX_BYTES) {
        clearLocalAssetCache(true)
    }
    def prev = LOCAL_ASSET_CACHE.remove(key)
    if (prev) LOCAL_ASSET_CACHE_BYTES -= assetBodyByteLength(prev)
    LOCAL_ASSET_CACHE[key] = body
    LOCAL_ASSET_CACHE_BYTES += bytes
}

def readCachedAsset(String fileName) {
    if (!isCacheableAsset(fileName)) return null
    ensureAssetCacheVersion()
    return LOCAL_ASSET_CACHE[assetCacheKey(fileName)]
}

/** Build version stamped into File Manager HTML (`app.js?v=…`). */
def assetVersionFromHtml(String html) {
    if (!html) return null
    def m = (html =~ /(?:^|["\s])(?:app\.js|mld-app\.js)\?v=([0-9A-Za-z._+-]+)/)
    if (m.find()) return m.group(1)?.toString()
    m = (html =~ /\?v=([0-9]+\.[0-9]+\.[0-9]+[0-9A-Za-z._+-]*)/)
    if (m.find()) return m.group(1)?.toString()
    return null
}

def fetchLocalAssetUncached(String fileName) {
    def result = ""
    try {
        def params = [
            uri: "${hubBaseUri()}/local/${fileName}",
            contentType: "text/plain",
            textParser: true,
            timeout: 30,
            ignoreSSLIssues: true
        ]
        def headers = hubRequestHeaders()
        if (headers) params.headers = headers
        httpGet(params) { resp ->
            def code = resp?.status ?: resp?.statusCode
            if (code == 200 && resp?.data != null) {
                def data = resp.getData() != null ? resp.getData() : resp.data
                result = readHttpBody(data)
            }
        }
    } catch (e) {
        log.error "fetchLocalAssetUncached ${fileName}: ${e.message}"
    }
    return result
}

/**
 * Always re-read mld-index.html from File Manager. If its embedded ?v= (or the Groovy
 * app version) differs from the in-memory cache generation, drop cached JS/CSS so cloud
 * picks up HPM file updates without Done/reboot. Keeps the cache warm across reloads
 * when versions match.
 */
def syncAssetCacheWithFileManagerHtml() {
    def html = fetchLocalAssetUncached(assetHtmlFile())
    if (!html) return null
    def fileVer = assetVersionFromHtml(html) ?: "unknown"
    def stamp = "${MLD_DEPLOYED_VERSION}|${fileVer}"
    if (LOCAL_ASSET_CACHE_VERSION != stamp) {
        clearLocalAssetCache()
        LOCAL_ASSET_CACHE_VERSION = stamp
    }
    rememberCachedAsset(assetHtmlFile(), html)
    return html
}

def rewriteDashboardAssetRefsToFileManager(String html) {
    if (!useDirectLocalAssets()) return html
    def base = "${hubBaseUri()}/local"
    [
        ["href", "app.css", assetCssFile()],
        ["href", "app-post.css", assetCssPostFile()],
        ["src", "app.js", assetJsFile()],
        ["src", "app-core.js", assetJsCoreFile()],
        ["src", "app-post.js", assetJsPostFile()],
        ["src", "app-post2.js", assetJsPost2File()],
        ["src", "app-post3.js", assetJsPost3File()],
        ["content", "app-post3.js", assetJsPost3File()],
    ].each { spec ->
        def attr = spec[0], assetPath = spec[1], fmFile = spec[2]
        def escaped = assetPath.replace(".", "\\.")
        html = html.replaceAll(/${attr}="${escaped}(\?[^"]*)?"/) { m ->
            "${attr}=\"${base}/${fmFile}${m[1] ?: ''}\""
        }
    }
    return html
}

// File Manager asset names (uploaded to /local/)
def assetHtmlFile() { return "mld-index.html" }
def assetCssFile()  { return "mld-app.css" }
def assetCssPostFile() { return "mld-app-post.css" }
def assetJsFile()   { return "mld-app.js" }
def assetJsCoreFile() { return "mld-app-core.js" }
def assetJsPostFile() { return "mld-app-post.js" }
def assetJsPost2File() { return "mld-app-post2.js" }
def assetJsPost3File() { return "mld-app-post3.js" }
def assetManifestFile() { return "mld-manifest.webmanifest" }
def assetSwFile() { return "mld-sw.js" }
def assetIcon192File() { return "mld-icon-192.b64" }
def assetIcon512File() { return "mld-icon-512.b64" }

def requiredAssetFiles() {
    return [
        assetHtmlFile(), assetCssFile(), assetCssPostFile(), assetJsFile(), assetJsCoreFile(), assetJsPostFile(), assetJsPost2File(), assetJsPost3File(),
        assetManifestFile(), assetSwFile(), assetIcon192File()
    ]
}

def hubBaseUri() {
    return "http://${location.hub.localIP}:8080"
}

def hubLoginUri() {
    return "http://127.0.0.1:8080"
}

def hubCredentials() {
    def user = hubUsername?.toString()?.trim() ?: state.hubUsername?.toString()?.trim() ?: ""
    def pass = hubPassword?.toString() ?: state.hubPassword?.toString() ?: ""
    return [user: user, pass: pass]
}

def syncHubCredentials() {
    def user = hubUsername?.toString()?.trim()
    if (user) state.hubUsername = user
    def pass = hubPassword?.toString()
    if (pass) state.hubPassword = pass
    state.remove("hubAuthCookie")
    state.remove("hubAuthCookieExpiresAt")
}

def extractHubSessionCookie(resp) {
    try {
        def setCookie = resp?.headers?.'Set-Cookie'
        if (!setCookie && resp?.headers) setCookie = resp.headers["Set-Cookie"]
        if (!setCookie) return null
        def raw = (setCookie instanceof List) ? setCookie.join(", ") : setCookie.toString()
        def m = raw =~ /HUBSESSION=[^;,\s]+/
        if (m.find()) return m.group(0)
        def first = raw.split(";")[0]?.trim()
        return first ?: null
    } catch (e) {
        return null
    }
}

def hubRequestHeaders() {
    def cookie = hubAuthCookie()
    return cookie ? ["Cookie": cookie] : null
}

def hubAuthCookie(boolean forceRefresh = false) {
    if (!hubSecurity) return null
    def creds = hubCredentials()
    if (!creds.user || !creds.pass) {
        log.warn "hubAuthCookie: Hub Login Security is enabled but hub username/password are missing"
        return null
    }
    def nowMs = now()
    if (!forceRefresh && state.hubAuthCookie) {
        try {
            if (state.hubAuthCookieExpiresAt?.toLong() > nowMs) return state.hubAuthCookie.toString()
        } catch (e) {}
    }
    try {
        def cookie = null
        def loginRejected = false
        httpPost([
            uri: hubLoginUri(),
            path: "/login",
            query: [loginRedirect: "/"],
            body: [username: creds.user, password: creds.pass, submit: "Login"],
            textParser: true,
            ignoreSSLIssues: true
        ]) { resp ->
            def bodyText = resp?.data?.text?.toString() ?: ""
            if (bodyText.contains("The login information you supplied was incorrect.")) {
                loginRejected = true
            } else {
                cookie = extractHubSessionCookie(resp)
            }
        }
        if (loginRejected) {
            state.hubLoginLastOutcome = "rejected"
            state.remove("hubAuthCookie")
            state.remove("hubAuthCookieExpiresAt")
            state.remove("hubPassword")
            log.error "hubAuthCookie: hub login rejected — verify Hub file access username/password"
            return null
        }
        if (!cookie) {
            state.hubLoginLastOutcome = "no_cookie"
            state.remove("hubAuthCookie")
            state.remove("hubAuthCookieExpiresAt")
            log.error "hubAuthCookie: hub login succeeded but no session cookie — retry or check hub firmware"
            return null
        }
        state.hubLoginLastOutcome = "ok"
        state.hubAuthCookie = cookie
        state.hubAuthCookieExpiresAt = nowMs + 1800000L
        return cookie
    } catch (e) {
        log.error "hubAuthCookie: ${e.message}"
        return null
    }
}

def parseFileManagerJson(data) {
    if (data == null) return null
    if (data instanceof Map) return data
    def text = data.toString()?.trim()
    if (!text || text.startsWith("<")) return null
    try {
        return new groovy.json.JsonSlurper().parseText(text)
    } catch (e) {
        return null
    }
}

def logHubFileAuthHint(String context) {
    if (hubSecurity) {
        log.error "${context}: hub returned a login page — verify Hub file access username/password"
    } else {
        log.error "${context}: hub returned a login page — enable Hub Login Security under Hub file access and enter hub admin credentials"
    }
}

def listLocalFileNames() {
    def names = []
    try {
        def params = [
            uri: "${hubBaseUri()}/hub/fileManager/json",
            timeout: 15,
            ignoreSSLIssues: true
        ]
        def headers = hubRequestHeaders()
        if (headers) params.headers = headers
        httpGet(params) { resp ->
            def code = resp?.status ?: resp?.statusCode
            def json = parseFileManagerJson(resp?.data)
            if (code == 200 && json?.files) {
                json.files.each { f ->
                    if (f.type == "file" && f.name) names << f.name.trim()
                }
            } else if (json == null && (code == 200 || code == 401 || code == 403)) {
                logHubFileAuthHint("listLocalFileNames")
            }
        }
    } catch (e) {
        def msg = e.message?.toString() ?: "${e}"
        if (msg.contains("'<',") || msg.toLowerCase().contains("lexing failed")) {
            logHubFileAuthHint("listLocalFileNames")
        } else {
            log.error "listLocalFileNames: ${msg}"
        }
    }
    return names
}

def fileNamePresent(List names, String want) {
    if (!names || !want) return false
    return names.any { n -> n == want || n.endsWith("/${want}") || n.endsWith(want) }
}

def assetsPresent() {
    def names = listLocalFileNames()
    if (names) {
        return requiredAssetFiles().every { n -> fileNamePresent(names, n) }
    }
    // fallback if file list API unavailable
    return requiredAssetFiles().every { n -> readLocalAsset(n)?.length() > 0 }
}

def readHttpBody(data) {
    if (data == null) return ""
    try {
        def sb = new StringBuilder()
        int i = data.read()
        while (i != -1) {
            sb.append((char) i)
            i = data.read()
        }
        if (sb.length() > 0) return sb.toString()
    } catch (e) {}
    def s = data.toString()
    return s.startsWith("java.io.") ? "" : s
}

def readLocalAsset(String fileName) {
    def cached = readCachedAsset(fileName)
    if (cached != null) return cached
    def result = fetchLocalAssetUncached(fileName)
    if (result) rememberCachedAsset(fileName, result)
    return result
}

def renderPngFromBase64Asset(String b64FileName, String missingMsg) {
    def b64 = readLocalAsset(b64FileName)
    if (!b64) {
        return renderNoStore("text/plain", missingMsg, 404)
    }
    try {
        def bytes = b64.trim().decodeBase64()
        return renderNoStore("image/png", new String(bytes, "ISO-8859-1"), 200)
    } catch (e) {
        log.error "renderPngFromBase64Asset ${b64FileName}: ${e.message}"
        return renderNoStore("text/plain", "Invalid icon file", 500)
    }
}

def missingAssetHtml() {
    return """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setup</title></head><body style="font-family:system-ui;padding:24px;max-width:520px;margin:auto;line-height:1.5"><h1>Setup required</h1><p>Modern Dashboard serves its UI from File Manager on your hub. Upload these twelve files to <b>Settings &rarr; File Manager</b> (root folder, exact names):</p><ul><li>mld-index.html</li><li>mld-app.css</li><li>mld-app-post.css</li><li>mld-app.js</li><li>mld-app-core.js</li><li>mld-app-post.js</li><li>mld-app-post2.js</li><li>mld-app-post3.js</li><li>mld-manifest.webmanifest</li><li>mld-sw.js</li><li>mld-icon-192.b64</li><li>mld-icon-512.b64</li></ul><p><b>Easiest install:</b> use <a href="https://github.com/evdev/hubitat-modern-dashboard#readme">Hubitat Package Manager</a> — OAuth and File Manager files are deployed automatically.</p><p>Then reopen the Modern Dashboard app, select your devices, and open the dashboard link.</p></body></html>"""
}

// ---------------------------------------------------------------------------
// HTTP mappings
// ---------------------------------------------------------------------------
mappings {
    path("/dashboard") { action: [GET: "renderIndex"] }
    path("/")          { action: [GET: "renderIndex"] }
    path("/app.css")   { action: [GET: "renderCss"] }
    path("/app-post.css") { action: [GET: "renderCssPost"] }
    path("/app.js")    { action: [GET: "renderJs"] }
    path("/app-core.js") { action: [GET: "renderJsCore"] }
    path("/app-post.js") { action: [GET: "renderJsPost"] }
    path("/app-post2.js") { action: [GET: "renderJsPost2"] }
    path("/app-post3.js") { action: [GET: "renderJsPost3"] }
    path("/manifest.webmanifest") { action: [GET: "renderManifest"] }
    path("/sw.js") { action: [GET: "renderSw"] }
    path("/icons/icon-192.png") { action: [GET: "renderIcon192"] }
    path("/icons/icon-512.png") { action: [GET: "renderIcon512"] }
    path("/lan-probe") { action: [GET: "renderLanProbe"] }
    path("/auth/status") { action: [GET: "authStatus"] }
    path("/auth/unlock") { action: [GET: "authUnlock", POST: "authUnlock"] }
    path("/auth/renew") { action: [GET: "authRenew", POST: "authRenew"] }
    path("/data")      { action: [GET: "renderData"] }
    path("/device")    { action: [GET: "renderDevice"] }
    path("/cmd")       { action: [GET: "doCmd"] }
    path("/cmd/batch") { action: [POST: "doCmdBatch"] }
    path("/settings/room-order") { action: [GET: "saveRoomOrderGet", POST: "saveRoomOrder"] }
    path("/room-order") { action: [GET: "saveRoomOrderGet", POST: "saveRoomOrder"] }
    path("/settings/nav-order") { action: [GET: "saveNavOrderGet", POST: "saveNavOrder"] }
    path("/nav-order") { action: [GET: "saveNavOrderGet", POST: "saveNavOrder"] }
    path("/settings/camera-order") { action: [GET: "saveCameraOrderGet", POST: "saveCameraOrder"] }
    path("/camera-order") { action: [GET: "saveCameraOrderGet", POST: "saveCameraOrder"] }
    path("/hub-mode") { action: [GET: "setHubModeGet", POST: "setHubMode"] }
    path("/hsm") { action: [GET: "setHsmGet", POST: "setHsm"] }
    path("/scene/activate") { action: [GET: "activateSceneGet", POST: "activateScene"] }
    path("/favorites") { action: [GET: "saveFavoritesGet", POST: "saveFavorites"] }
    path("/embed-cards") { action: [POST: "saveEmbedCards"] }
    path("/time-cards") { action: [POST: "saveTimeCards"] }
    path("/settings/favorites-layout") { action: [POST: "saveFavoritesLayout"] }
    path("/snapshot/save") { action: [GET: "snapshotSaveGet", POST: "snapshotSave"] }
    path("/snapshot/restore") { action: [GET: "snapshotRestoreGet", POST: "snapshotRestore"] }
    path("/snapshot/status") { action: [GET: "snapshotStatus"] }
    path("/lights/bulk") { action: [GET: "lightsBulkGet", POST: "lightsBulk"] }
    path("/schedules") { action: [GET: "schedulesGet", POST: "schedulesSave"] }
    path("/schedules/save") { action: [POST: "schedulesSave"] }
    path("/schedules/delete") { action: [POST: "schedulesDelete"] }
    path("/schedules/toggle") { action: [POST: "schedulesToggle"] }
    path("/schedules/test") { action: [POST: "schedulesTest"] }
    path("/notifications") { action: [GET: "notificationsGet"] }
    path("/notifications/ack") { action: [GET: "notificationsAckGet", POST: "notificationsAck"] }
}

def readIconDataUri(String b64FileName) {
    def b64 = readLocalAsset(b64FileName)?.trim()
    if (!b64) return null
    return "data:image/png;base64,${b64}"
}

def appendAccessToken(String html, String attr, String assetPath, String token) {
    if (!token) return html
    def pattern = /(${attr}="${assetPath.replace('.', '\\.')})(\?[^"]*)?(")/
    return html.replaceAll(pattern) { m ->
        def query = m[2] ?: ""
        def sep = query ? "&" : "?"
        return "${m[1]}${query}${sep}access_token=${token}${m[3]}"
    }
}

def renderIndex() {
    // Revalidate against File Manager HTML ?v= so cloud cache invalidates on HPM
    // file updates without clearing on every reload when versions already match.
    def html = syncAssetCacheWithFileManagerHtml()
    if (!html) { html = missingAssetHtml() }
    def token = params?.access_token
    def iconHref = readIconDataUri(assetIcon192File())
    if (iconHref) {
        html = html.replace('href="icons/icon-192.png"', "href=\"${iconHref}\"")
    }
    def title = htmlEsc(resolvedDashboardName())
    html = html.replace('<title>mDash</title>', "<title>${title}</title>")
    html = html.replace('id="dashboard-title">mDash</span>', "id=\"dashboard-title\">${title}</span>")
    html = html.replace('name="apple-mobile-web-app-title" content="mDash"', "name=\"apple-mobile-web-app-title\" content=\"${title}\"")
    if (token) {
        def q = "?access_token=${token}"
        html = appendAccessToken(html, "href", "app.css", token)
        html = appendAccessToken(html, "href", "app-post.css", token)
        html = html.replace('href="manifest.webmanifest"', "href=\"manifest.webmanifest${q}\"")
        if (!iconHref) {
            html = html.replace('href="icons/icon-192.png"', "href=\"icons/icon-192.png${q}\"")
        }
        for (def asset : ["app.js", "app-core.js", "app-post.js", "app-post2.js", "app-post3.js"]) {
            html = appendAccessToken(html, "src", asset, token)
        }
        html = appendAccessToken(html, "content", "app-post3.js", token)
    }
    html = rewriteDashboardAssetRefsToFileManager(html)
    renderNoStore("text/html", html, 200)
}

def renderCss() {
    def css = readLocalAsset(assetCssFile())
    if (!css) { css = "/* upload mld-app.css to File Manager */" }
    renderVersionedAsset("text/css", css)
}

def renderCssPost() {
    def css = readLocalAsset(assetCssPostFile())
    if (!css) { css = "/* upload mld-app-post.css to File Manager */" }
    renderVersionedAsset("text/css", css)
}

def renderJs() {
    def js = readLocalAsset(assetJsFile())
    if (!js) { js = "document.body.innerHTML='<p>Upload mld-app.js to File Manager</p>';" }
    renderVersionedAsset("application/javascript", js)
}

def renderJsCore() {
    def js = readLocalAsset(assetJsCoreFile())
    if (!js) { js = "console.warn('Upload mld-app-core.js to File Manager');" }
    renderVersionedAsset("application/javascript", js)
}

def renderJsPost() {
    def js = readLocalAsset(assetJsPostFile())
    if (!js) { js = "console.warn('Upload mld-app-post.js to File Manager');" }
    renderVersionedAsset("application/javascript", js)
}

def renderJsPost2() {
    def js = readLocalAsset(assetJsPost2File())
    if (!js) { js = "console.warn('Upload mld-app-post2.js to File Manager');" }
    renderVersionedAsset("application/javascript", js)
}

def renderJsPost3() {
    def js = readLocalAsset(assetJsPost3File())
    if (!js) { js = "console.warn('Upload mld-app-post3.js to File Manager');" }
    renderVersionedAsset("application/javascript", js)
}

def renderManifest() {
    def token = params?.access_token
    def q = token ? "?access_token=${token}" : ""
    def icon192 = readLocalAsset(assetIcon192File())?.trim()
    def out = new StringBuilder()
    def pwaName = (dashboardName?.trim()) ?: "mDash"
    out << '{"name":' << jsonStr(pwaName) << ',"short_name":' << jsonStr(pwaName)
    out << ',"start_url":"./dashboard' << q << '"'
    out << ',"scope":"./"'
    out << ',"display":"standalone"'
    out << ',"background_color":"#0b0d12"'
    out << ',"theme_color":"#0b0d12"'
    out << ',"icons":['
    if (icon192) {
        def uri = "data:image/png;base64,${icon192}"
        out << '{"src":"' << uri << '","sizes":"192x192","type":"image/png","purpose":"any"},'
        out << '{"src":"' << uri << '","sizes":"512x512","type":"image/png","purpose":"any"},'
        out << '{"src":"' << uri << '","sizes":"192x192","type":"image/png","purpose":"maskable"},'
        out << '{"src":"' << uri << '","sizes":"512x512","type":"image/png","purpose":"maskable"}'
    }
    out << ']}'
    renderNoStore("application/manifest+json", out.toString(), 200)
}

def renderSw() {
    def js = readLocalAsset(assetSwFile())
    if (!js) { js = "self.addEventListener('fetch',e=>e.respondWith(fetch(e.request)));" }
    renderNoStore("application/javascript", js, 200)
}

def renderIcon192() {
    return renderPngFromBase64Asset(assetIcon192File(), "Upload mld-icon-192.b64 to File Manager")
}

def renderIcon512() {
    return renderPngFromBase64Asset(assetIcon512File(), "Upload mld-icon-512.b64 to File Manager")
}

// Echoes a one-time nonce so cloud clients can prove this app answered, not a cache or another LAN host.
def renderLanProbe() {
    def nonce = params?.mld_lan_probe?.toString()
    if (!nonce || !(nonce ==~ /[0-9a-fA-F-]{36}/)) {
        return render(contentType: "text/plain", data: "invalid probe", status: 400)
    }
    return render(
        contentType: "text/plain",
        data: nonce,
        status: 200,
        headers: [
            "Access-Control-Allow-Origin": "https://cloud.hubitat.com",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
            "Vary": "Origin"
        ]
    )
}

// ---------------------------------------------------------------------------
// /data - slim JSON
// ---------------------------------------------------------------------------
def renderData() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def out = new StringBuilder()
    out << "{\"config\":{"
    out << "\"pollIntervalMs\":" << (pollSec ? (pollSec.toInteger() * 1000) : 5000)
    out << ",\"useWebSocket\":" << (enableWs == null ? true : enableWs)
    out << ",\"dashboardName\":" << jsonStr((dashboardName?.trim()) ?: "mDash")
    out << ",\"defaultTab\":" << jsonStr(normalizedDefaultTab())
    out << ",\"localUrl\":" << jsonStr(dashboardUrl(true))
    out << ",\"cloudUrl\":" << jsonStr(dashboardUrl(false))
    out << roomOrderJsonFragment()
    out << navOrderJsonFragment()
    out << cameraOrderJsonFragment()
    out << favoritesJsonFragment()
    out << lightControlConfigJsonFragment()
    out << "},\"rooms\":["
    def roomsList = app.getRooms() ?: []
    boolean first = true
    for (r in roomsList) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << r.id << ",\"name\":" << jsonStr(r.name) << "}"
    }
    out << "],\"devices\":["
    first = true
    if (lights) {
        for (d in lights) {
            if (!first) out << ","; first = false
            def isDim = d.hasCapability("SwitchLevel")
            def roomName = null
            try { roomName = d.getRoomName() } catch (e) { roomName = null }
            def rid = null
            if (roomName) {
                def rm = roomsList.find { it.name == roomName }
                if (rm) rid = rm.id
            }
            def hasCt = d.hasCapability("ColorTemperature")
            def hasRgb = d.hasCapability("ColorControl")
            def sw = safeCurrent(d, "switch")
            def lvl = isDim ? safeCurrent(d, "level") : null
            def kelvin = hasCt ? safeCurrent(d, "colorTemperature") : null
            def hue = hasRgb ? safeCurrent(d, "hue") : null
            def sat = hasRgb ? safeCurrent(d, "saturation") : null
            def cmode = (hasCt && hasRgb) ? safeCurrent(d, "colorMode") : null
            out << "{\"i\":" << d.id
            out << ",\"n\":" << jsonStr(d.displayName)
            out << ",\"r\":" << (rid == null ? "null" : rid.toString())
            out << ",\"d\":" << (isDim ? 1 : 0)
            out << ",\"ct\":" << (hasCt ? 1 : 0)
            out << ",\"rgb\":" << (hasRgb ? 1 : 0)
            out << ",\"s\":" << (sw == "on" ? 1 : 0)
            out << ",\"l\":" << (lvl == null ? "null" : lvl.toString())
            out << ",\"k\":" << (kelvin == null ? "null" : kelvin.toString())
            out << ",\"h\":" << (hue == null ? "null" : hue.toString())
            out << ",\"sat\":" << (sat == null ? "null" : sat.toString())
            out << ",\"cm\":" << jsonStr(cmode)
            out << "}"
        }
    }
    out << "],\"outlets\":["
    first = true
    if (outletSwitches) {
        for (d in outletSwitches) {
            if (!first) out << ","; first = false
            appendOnOffDeviceJson(out, d, roomsList)
        }
    }
    out << "],\"thermostats\":["
    first = true
    if (thermostats) {
        for (d in thermostats) {
            if (!first) out << ","; first = false
            def roomName = null
            try { roomName = d.getRoomName() } catch (e) { roomName = null }
            def rid = null
            if (roomName) {
                def rm = roomsList.find { it.name == roomName }
                if (rm) rid = rm.id
            }
            def tmode = safeCurrent(d, "thermostatMode")
            def ostate = safeCurrent(d, "thermostatOperatingState")
            def hsp = safeCurrent(d, "heatingSetpoint")
            def csp = safeCurrent(d, "coolingSetpoint")
            def temp = safeCurrent(d, "temperature")
            def tempUnit = "F"
            try {
                def st = d.currentState("temperature")
                if (st?.unit) tempUnit = st.unit
            } catch (e) {}
            def hasFanMode = d.hasCapability("ThermostatFanMode") || d.hasAttribute("thermostatFanMode")
            def fmode = hasFanMode ? safeCurrent(d, "thermostatFanMode") : null
            def hasFanSpeed = d.hasAttribute("fanSpeed") || d.hasCommand("setFanSpeed") || d.hasAttribute("fanSpeedLevels")
            def fspeed = hasFanSpeed ? safeCurrent(d, "fanSpeed") : null
            def supModes = safeCurrent(d, "supportedThermostatModes")
            def supFanModes = null
            if (hasFanMode) {
                supFanModes = safeCurrent(d, "supportedThermostatFanModes") ?: safeCurrent(d, "supportedFanModes")
            }
            def fsLevels = hasFanSpeed ? safeCurrent(d, "fanSpeedLevels") : null
            out << "{\"i\":" << d.id
            out << ",\"n\":" << jsonStr(d.displayName)
            out << ",\"r\":" << (rid == null ? "null" : rid.toString())
            out << ",\"tm\":" << jsonStr(tmode)
            out << ",\"os\":" << jsonStr(ostate)
            out << ",\"hsp\":" << numOrNull(hsp)
            out << ",\"csp\":" << numOrNull(csp)
            out << ",\"temp\":" << numOrNull(temp)
            out << ",\"u\":" << jsonStr(tempUnit)
            out << ",\"hasFm\":" << (hasFanMode ? 1 : 0)
            out << ",\"fm\":" << jsonStr(fmode)
            out << ",\"hasFs\":" << (hasFanSpeed ? 1 : 0)
            out << ",\"fs\":" << jsonStr(fspeed)
            out << ",\"supM\":" << jsonListAttr(supModes)
            out << ",\"supFM\":" << jsonListAttr(supFanModes)
            out << ",\"fsLev\":" << jsonListAttr(fsLevels)
            out << "}"
        }
    }
    out << "],\"tempSensors\":["
    first = true
    def thermoIds = thermostats ? thermostats.collect { it.id } : []
    if (tempSensors) {
        for (d in tempSensors) {
            if (thermoIds.contains(d.id)) continue
            if (!first) out << ","; first = false
            def roomName = null
            try { roomName = d.getRoomName() } catch (e) { roomName = null }
            def rid = null
            if (roomName) {
                def rm = roomsList.find { it.name == roomName }
                if (rm) rid = rm.id
            }
            def temp = safeCurrent(d, "temperature")
            def tempUnit = "F"
            try {
                def st = d.currentState("temperature")
                if (st?.unit) tempUnit = st.unit
            } catch (e) {}
            def bat = safeCurrent(d, "battery")
            def extras = sensorExtraAttrs(d, "temperature", sensorExMaxForType("temp"), "temp")
            out << "{\"i\":" << d.id
            out << ",\"n\":" << jsonStr(d.displayName)
            out << ",\"r\":" << (rid == null ? "null" : rid.toString())
            out << ",\"temp\":" << numOrNull(temp)
            out << ",\"u\":" << jsonStr(tempUnit)
            out << ",\"bat\":" << numOrNull(bat)
            appendExJsonArray(out, extras)
            out << "}"
        }
    }
    out << "],\"sensors\":["
    first = true
    try {
        def sensorDevs = allSensorDevices()
        if (sensorDevs) {
            for (entry in sensorDevs) {
                def d = entry.device
                try {
                    def chunk = new StringBuilder()
                    appendSensorJson(chunk, d, entry, roomsList)
                    if (!first) out << ","
                    first = false
                    out << chunk
                } catch (e) {
                    log.warn "Modern Dashboard: skip sensor ${d?.id}: ${e.message ?: e}"
                }
            }
        }
    } catch (e) {
        log.warn "Modern Dashboard: sensors list failed: ${e.message ?: e}"
    }
    out << "],\"music\":["
    first = true
    def audioDevs = allAudioDevices()
    if (audioDevs) {
        for (d in audioDevs) {
            if (!first) out << ","; first = false
            appendAudioDeviceJson(out, d, roomsList)
        }
    }
    out << "],\"cameras\":["
    first = true
    def cameraDevs = orderedCamerasList()
    if (cameraDevs) {
        for (d in cameraDevs) {
            def urls = cameraStreamUrls(d)
            if (!urls?.u) continue
            if (!first) out << ","; first = false
            out << "{\"i\":" << d.id
            out << ",\"n\":" << jsonStr(d.displayName)
            out << ",\"u\":" << jsonStr(urls.u)
            if (urls.uh) out << ",\"uh\":" << jsonStr(urls.uh)
            out << "}"
        }
    }
    out << "],\"locks\":["
    first = true
    if (locks) {
        for (d in locks) {
            if (!first) out << ","; first = false
            def roomName = null
            try { roomName = d.getRoomName() } catch (e) { roomName = null }
            def rid = null
            if (roomName) {
                def rm = roomsList.find { it.name == roomName }
                if (rm) rid = rm.id
            }
            def lockSt = safeCurrent(d, "lock")
            out << "{\"i\":" << d.id
            out << ",\"n\":" << jsonStr(d.displayName)
            out << ",\"r\":" << (rid == null ? "null" : rid.toString())
            out << ",\"lk\":" << (lockSt == "locked" ? 1 : 0)
            out << ",\"st\":" << jsonStr(lockSt)
            out << "}"
        }
    }
    out << "],\"garageDoors\":["
    first = true
    if (garageDoors) {
        for (d in garageDoors) {
            if (!first) out << ","; first = false
            def roomName = null
            try { roomName = d.getRoomName() } catch (e) { roomName = null }
            def rid = null
            if (roomName) {
                def rm = roomsList.find { it.name == roomName }
                if (rm) rid = rm.id
            }
            def doorSt = safeCurrent(d, "door")
            out << "{\"i\":" << d.id
            out << ",\"n\":" << jsonStr(d.displayName)
            out << ",\"r\":" << (rid == null ? "null" : rid.toString())
            out << ",\"st\":" << jsonStr(doorSt)
            out << "}"
        }
    }
    out << "],\"windowShades\":["
    first = true
    for (d in allWindowShades()) {
        if (!first) out << ","; first = false
        def roomName = null
        try { roomName = d.getRoomName() } catch (e) { roomName = null }
        def rid = null
        if (roomName) {
            def rm = roomsList.find { it.name == roomName }
            if (rm) rid = rm.id
        }
        def shadeSt = shadeStatus(d)
        def shadePos = shadePosition(d)
        out << "{\"i\":" << d.id
        out << ",\"n\":" << jsonStr(d.displayName)
        out << ",\"r\":" << (rid == null ? "null" : rid.toString())
        out << ",\"st\":" << jsonStr(shadeSt)
        out << ",\"pos\":" << numOrNull(shadePos)
        out << "}"
    }
    out << "],\"ceilingFans\":["
    first = true
    if (ceilingFans) {
        for (d in ceilingFans) {
            if (!first) out << ","; first = false
            def roomName = null
            try { roomName = d.getRoomName() } catch (e) { roomName = null }
            def rid = null
            if (roomName) {
                def rm = roomsList.find { it.name == roomName }
                if (rm) rid = rm.id
            }
            def speed = safeCurrent(d, "speed")
            def sw = safeCurrent(d, "switch")
            def hasSw = d.hasCapability("Switch") || d.hasCommand("on") || d.hasCommand("off")
            def on = false
            if (sw != null) on = (sw == "on")
            else if (speed != null) on = (speed.toString().toLowerCase() != "off")
            def supSpeeds = safeCurrent(d, "supportedFanSpeeds")
            out << "{\"i\":" << d.id
            out << ",\"n\":" << jsonStr(d.displayName)
            out << ",\"r\":" << (rid == null ? "null" : rid.toString())
            out << ",\"s\":" << (on ? 1 : 0)
            out << ",\"sp\":" << jsonStr(speed)
            out << ",\"supSp\":" << jsonListAttr(supSpeeds)
            out << ",\"hasSw\":" << (hasSw ? 1 : 0)
            out << "}"
        }
    }
    out << "],\"valves\":["
    first = true
    if (valves) {
        for (d in valves) {
            if (!first) out << ","; first = false
            def roomName = null
            try { roomName = d.getRoomName() } catch (e) { roomName = null }
            def rid = null
            if (roomName) {
                def rm = roomsList.find { it.name == roomName }
                if (rm) rid = rm.id
            }
            def valveSt = safeCurrent(d, "valve")
            out << "{\"i\":" << d.id
            out << ",\"n\":" << jsonStr(d.displayName)
            out << ",\"r\":" << (rid == null ? "null" : rid.toString())
            out << ",\"st\":" << jsonStr(valveSt)
            out << "}"
        }
    }
    out << "],\"hubModes\":["
    def hubModesList = []
    try { hubModesList = location.modes ?: [] } catch (e) {}
    first = true
    for (m in hubModesList) {
        if (!first) out << ","; first = false
        out << jsonStr(m?.toString())
    }
    def hubModeCurrent = ""
    try { hubModeCurrent = location.mode?.toString() ?: "" } catch (e) {}
    out << "],\"currentHubMode\":" << jsonStr(hubModeCurrent)
    def hsmStatusVal = readHsmStatus()
    def hsmAlertVal = readHsmAlert()
    def hsmAlertDescVal = readHsmAlertDesc()
    out << ",\"hsmStatus\":" << jsonStr(hsmStatusVal)
    out << ",\"hsmAlert\":" << jsonStr(hsmAlertVal)
    out << ",\"hsmAlertDesc\":" << jsonStr(hsmAlertDescVal)
    out << ",\"hsmEnabled\":" << (hsmEnabled == true ? "true" : "false")
    out << ",\"hsmPinRequired\":" << (hsmEnabled == true && hsmPinEnabled == true && hsmPin?.toString()?.trim() ? "true" : "false")
    out << ",\"thermostatsPopupEnabled\":" << (thermostatsPopupEnabled == true ? "true" : "false")
    out << ",\"outletsSeparateTab\":" << (outletsSeparateTab == true ? "true" : "false")
    out << ",\"hubModePopupEnabled\":" << (hubModePopupEnabled == null ? "true" : (hubModePopupEnabled == true ? "true" : "false"))
    out << ",\"scenesPopupEnabled\":" << (scenesPopupEnabled == null ? "true" : (scenesPopupEnabled == true ? "true" : "false"))
    out << ",\"roomClimateEnabled\":" << (roomClimateEnabled == null ? "true" : (roomClimateEnabled == true ? "true" : "false"))
    out << ",\"schedulerEnabled\":" << (schedulerIsEnabled() ? "true" : "false")
    out << ",\"schedUse24Hour\":" << (schedulerUse24Hour == true ? "true" : "false")
    out << ",\"unlockPinEnabled\":" << (unlockPinEnabled == true ? "true" : "false")
    out << ",\"unlockPinRequired\":" << (unlockPinEnabled == true && unlockPin?.toString()?.trim() ? "true" : "false")
    out << ",\"dashboardPasswordRequired\":" << (dashboardPasswordRequired() ? "true" : "false")
    out << ",\"scenes\":["
    def sceneEntries = []
    try {
        def scenesMap = location.scenes ?: [:]
        scenesMap.each { sid, sname ->
            sceneEntries << [id: sid, name: sname?.toString() ?: ""]
        }
        sceneEntries.sort { a, b -> a.name <=> b.name }
    } catch (e) {}
    first = true
    for (sc in sceneEntries) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << sc.id << ",\"n\":" << jsonStr(sc.name) << "}"
    }
    out << "]"
    out << snapshotsJsonFragment()
    out << lightJobJsonFragment()
    out << sunTimesJsonFragment()
    out << notificationsJsonFragment()
    // Cloud MQTT ~128 KB limit: schedules can make /data fail entirely. Client loads via GET /schedules.
    if (request?.requestSource == "cloud") {
        out << ',"schedules":null'
    } else {
        out << schedulesJsonFragment()
    }
    if (authRenewed) {
        out << ",\"dashSession\":" << jsonStr(authRenewed.session)
        out << ",\"dashSessionExpiresAt\":" << authRenewed.expiresAt
    }
    out << "}"
    renderJsonNoStore(out.toString(), 200)
}

def safeCurrent(d, attrName) {
    try {
        def st = d.currentState(attrName)
        return st?.value
    } catch (e) { return null }
}

def appendOnOffDeviceJson(out, d, roomsList) {
    def roomName = null
    try { roomName = d.getRoomName() } catch (e) { roomName = null }
    def rid = null
    if (roomName) {
        def rm = roomsList.find { it.name == roomName }
        if (rm) rid = rm.id
    }
    def sw = safeCurrent(d, "switch")
    out << "{\"i\":" << d.id
    out << ",\"n\":" << jsonStr(d.displayName)
    out << ",\"r\":" << (rid == null ? "null" : rid.toString())
    out << ",\"s\":" << (sw == "on" ? 1 : 0)
    out << "}"
}

def numOrNull(v) {
    if (v == null) return "null"
    try {
        def n = new BigDecimal(v.toString())
        return n.toString()
    } catch (e) { return "null" }
}

def isNumberLike(v) {
    if (v == null) return false
    try {
        new BigDecimal(v.toString())
        return true
    } catch (e) { return false }
}

// First meaningful (non-skip, non-empty) attribute value for generic sensors.
def firstMeaningfulAttr(d, skipAttr) {
    def states = null
    try { states = d.currentStates } catch (e) { states = null }
    if (states == null) return null
    try {
        for (st in states) {
            def nm = st?.name?.toString()?.toLowerCase()
            if (!nm) continue
            if (nm == skipAttr) continue
            if (sensorSkipAttrs().contains(nm)) continue
            def v = st?.value
            if (v == null) continue
            def s = v.toString()
            if (s.isEmpty()) continue
            return [name: nm, value: s]
        }
    } catch (e) {}
    return null
}

// Alternate Hubitat attribute names per sensor type (tried after the picker's primary attr).
def sensorAttrCandidates() {
    return [
        smoke: ["smoke", "carbonMonoxide"],
        leak: ["water"],
        contact: ["contact"],
        motion: ["motion", "motionStatus"],
        shock: ["acceleration", "shock", "vibration", "moving"],
        presence: ["presence"],
        humidity: ["humidity", "relativeHumidity"],
        illuminance: ["illuminance"]
    ]
}

def normalizeSensorValue(t, attrName, raw) {
    if (raw == null) return null
    def s = raw.toString().trim()
    if (s.isEmpty()) return null
    def lower = s.toLowerCase()
    switch (t) {
        case "motion":
            if (lower == "on" || lower == "true") return "active"
            if (lower == "off" || lower == "false") return "inactive"
            return lower
        case "shock":
            if (lower == "on" || lower == "true" || lower == "active") return "active"
            if (lower == "off" || lower == "false" || lower == "inactive") return "inactive"
            if (isNumberLike(raw)) {
                def n = raw.toDouble()
                if (n >= 1.5d) return "active"
                return "inactive"
            }
            return lower
        case "contact":
            if (lower == "on" || lower == "true") return "open"
            if (lower == "off" || lower == "false") return "closed"
            return lower
        case "leak":
            if (lower == "true" || lower == "wet") return "wet"
            if (lower == "false" || lower == "dry") return "dry"
            return lower
        case "presence":
            if (lower == "home" || lower == "true") return "present"
            if (lower == "away" || lower == "false" || lower == "not home" || lower == "not present") return "not present"
            return lower
        case "smoke":
            if (lower == "tested" || lower == "monitored") return "clear"
            if (attrName == "carbonMonoxide" && (lower == "detected" || lower == "co")) return "detected"
            return lower
        default:
            return s
    }
}

def resolveSensorReading(d, entry) {
    def t = entry.type
    def alerts = entry.alerts as Set
    def primaryAttr = entry.attr
    def rawVal = null
    def candidates = entry.attr ? [entry.attr] : []
    def extra = sensorAttrCandidates()[t]
    if (extra) {
        for (a in extra) {
            if (!candidates.contains(a)) candidates << a
        }
    }
    for (attr in candidates) {
        def raw = safeCurrent(d, attr)
        if (raw == null) continue
        def norm = normalizeSensorValue(t, attr, raw)
        if (norm == null) continue
        rawVal = norm
        primaryAttr = attr
        if (t == "smoke" && attr == "carbonMonoxide") {
            alerts = ["detected"] as Set
        }
        break
    }
    if (rawVal == null) {
        t = "generic"
        def fm = firstMeaningfulAttr(d, null)
        if (fm != null) {
            rawVal = fm.value
            primaryAttr = fm.name
        }
        alerts = [] as Set
    }
    def aFlag = 0
    if (rawVal != null && alerts && alerts.contains(rawVal.toString().toLowerCase())) aFlag = 1
    return [t: t, attr: primaryAttr, v: rawVal, a: aFlag]
}

def appendSensorJson(out, d, entry, roomsList) {
    def reading = resolveSensorReading(d, entry)
    def t = reading.t
    def primaryAttr = reading.attr
    def rawVal = reading.v
    def aFlag = reading.a
    def rid = sensorRoomId(d, roomsList)
    out << "{\"i\":" << d.id
    out << ",\"n\":" << jsonStr(d.displayName)
    out << ",\"r\":" << (rid == null ? "null" : rid.toString())
    out << ",\"t\":" << jsonStr(t)
    if (rawVal != null && isNumberLike(rawVal)) {
        out << ",\"v\":" << numOrNull(rawVal)
    } else {
        out << ",\"v\":" << jsonStr(rawVal)
    }
    out << ",\"a\":" << aFlag
    def leMs = resolveSensorLastEventMs(d, t)
    if (leMs != null) out << ",\"le\":" << leMs
    def extras = sensorExtraAttrs(d, primaryAttr, sensorExMaxForType(t), t)
    appendExJsonArray(out, extras)
    out << "}"
}

def resolvedDashboardName() {
    return (dashboardName?.trim()) ?: "mDash"
}

def normalizedDefaultTab() {
    def allowed = [
        "lights", "favorites", "sensors", "thermostats", "music",
        "cameras", "blinds", "fans", "outlets", "scheduling"
    ] as Set
    def v = defaultTab?.toString()?.trim()
    return (v && allowed.contains(v)) ? v : "lights"
}

def htmlEsc(s) {
    if (s == null) return ""
    return s.toString()
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
}

def jsonStr(s) {
    if (s == null) return "null"
    String v = s.toString()
    StringBuilder b = new StringBuilder("\"")
    for (int i = 0; i < v.length(); i++) {
        char c = v.charAt(i)
        switch (c) {
            case '"':  b.append("\\\""); break
            case '\\': b.append("\\\\"); break
            case '\n': b.append("\\n");  break
            case '\r': b.append("\\r");  break
            case '\t': b.append("\\t");  break
            default:
                if (c < 0x20) { b.append(String.format("\\u%04x", (int) c)) }
                else { b.append(c) }
        }
    }
    b.append("\"")
    return b.toString()
}

// JSON_OBJECT / list thermostat attributes (supportedThermostatModes, etc.)
def stripListToken(s) {
    if (s == null) return null
    def t = s.toString().trim()
    if (!t) return null
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        t = t.substring(1, t.length() - 1).trim()
    }
    return t ?: null
}

def isNumericListToken(v) {
    if (v == null) return false
    if (v instanceof Number) return true
    def s = v.toString().trim()
    return s ==~ /^\d+(\.\d+)?$/
}

def normalizeListTokens(v) {
    if (v == null) return null
    def tokens = []
    if (v instanceof Collection) {
        v.each { item ->
            def tok = stripListToken(item)
            if (tok) tokens << tok
        }
        return tokens
    }
    if (v instanceof Map) {
        // Fan speed maps often use names as keys and dim levels as values — send names, not levels.
        def keys = (v.keySet() ?: []) as List
        def vals = (v.values() ?: []) as List
        def valsAllNumeric = !vals.isEmpty() && vals.every { isNumericListToken(it) }
        def source = (valsAllNumeric ? keys : (vals.any { it != null && it.toString().trim() } ? vals : keys))
        source.each { item ->
            def tok = stripListToken(item)
            if (tok) tokens << tok
        }
        return tokens
    }
    def s = v.toString().trim()
    if (!s) return tokens
    if (s.startsWith("[")) {
        try {
            def parsed = new groovy.json.JsonSlurper().parseText(s)
            if (parsed instanceof Collection) {
                parsed.each { item ->
                    def tok = stripListToken(item)
                    if (tok) tokens << tok
                }
                return tokens
            }
            if (parsed instanceof Map) {
                return normalizeListTokens(parsed)
            }
        } catch (e) {
            def inner = s.length() > 2 ? s.substring(1, s.length() - 1).trim() : ""
            if (inner) {
                inner.split(/\s*,\s*/).each { part ->
                    def tok = stripListToken(part)
                    if (tok) tokens << tok
                }
            }
            return tokens
        }
    } else if (s.startsWith("{")) {
        try {
            def parsed = new groovy.json.JsonSlurper().parseText(s)
            return normalizeListTokens(parsed)
        } catch (e) {}
    } else {
        s.split(/[,;|]/).each { part ->
            def tok = stripListToken(part)
            if (tok) tokens << tok
        }
    }
    return tokens
}

def jsonListAttr(v) {
    if (v == null) return "null"
    def tokens = normalizeListTokens(v)
    if (tokens == null) return "null"
    // Empty list is intentional (e.g. supportedThermostatFanModes: []) — not "unknown".
    if (!tokens) return '""'
    return jsonStr(tokens.join(","))
}

// ---------------------------------------------------------------------------
// /device?id=.. - single-device state (reconcile dimmer level after "on")
// ---------------------------------------------------------------------------
def renderDevice() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def id = params.id
    if (id == null) {
        return renderJsonNoStore( '{"error":"missing id"}', 400)
    }
    def dev = lights?.find { it.id.toString() == id.toString() }
    def shadeForDev = allWindowShades()?.find { it.id.toString() == id.toString() }
    if (dev != null) {
        def isDim = dev.hasCapability("SwitchLevel")
        def hasCt = dev.hasCapability("ColorTemperature")
        def hasRgb = dev.hasCapability("ColorControl")
        try { dev.refresh() } catch (e) {}
        def sw = safeCurrent(dev, "switch")
        def lvl = isDim ? safeCurrent(dev, "level") : null
        def kelvin = hasCt ? safeCurrent(dev, "colorTemperature") : null
        def hue = hasRgb ? safeCurrent(dev, "hue") : null
        def sat = hasRgb ? safeCurrent(dev, "saturation") : null
        def out = new StringBuilder()
        out << "{\"i\":" << dev.id << ",\"d\":" << (isDim ? 1 : 0)
        out << ",\"ct\":" << (hasCt ? 1 : 0)
        out << ",\"rgb\":" << (hasRgb ? 1 : 0)
        out << ",\"s\":" << (sw == "on" ? 1 : 0)
        out << ",\"l\":" << (lvl == null ? "null" : lvl.toString())
        out << ",\"k\":" << (kelvin == null ? "null" : kelvin.toString())
        out << ",\"h\":" << (hue == null ? "null" : hue.toString())
        out << ",\"sat\":" << (sat == null ? "null" : sat.toString())
        if (shadeForDev != null) {
            try { shadeForDev.refresh() } catch (e) {}
            out << ",\"st\":" << jsonStr(shadeStatus(shadeForDev))
            out << ",\"pos\":" << numOrNull(shadePosition(shadeForDev))
        }
        out << "}"
        return renderJsonNoStore( withAuthJson(out.toString()), 200)
    }
    // thermostat?
    def t = thermostats?.find { it.id.toString() == id.toString() }
    if (t != null) {
        try { t.refresh() } catch (e) {}
        def hasFanMode = t.hasCapability("ThermostatFanMode") || t.hasAttribute("thermostatFanMode")
        def hasFanSpeed = t.hasAttribute("fanSpeed") || t.hasCommand("setFanSpeed") || t.hasAttribute("fanSpeedLevels")
        def out = new StringBuilder()
        out << "{\"i\":" << t.id
        out << ",\"tm\":" << jsonStr(safeCurrent(t, "thermostatMode"))
        out << ",\"os\":" << jsonStr(safeCurrent(t, "thermostatOperatingState"))
        out << ",\"hsp\":" << numOrNull(safeCurrent(t, "heatingSetpoint"))
        out << ",\"csp\":" << numOrNull(safeCurrent(t, "coolingSetpoint"))
        out << ",\"temp\":" << numOrNull(safeCurrent(t, "temperature"))
        out << ",\"hasFm\":" << (hasFanMode ? 1 : 0)
        out << ",\"fm\":" << jsonStr(hasFanMode ? safeCurrent(t, "thermostatFanMode") : null)
        out << ",\"hasFs\":" << (hasFanSpeed ? 1 : 0)
        out << ",\"fs\":" << jsonStr(hasFanSpeed ? safeCurrent(t, "fanSpeed") : null)
        out << "}"
        return renderJsonNoStore( withAuthJson(out.toString()), 200)
    }
    def senEntry = allSensorDevices()?.find { it.device.id.toString() == id.toString() }
    def hasControlRole =
        locks?.any { it.id.toString() == id.toString() } ||
        garageDoors?.any { it.id.toString() == id.toString() } ||
        allWindowShades()?.any { it.id.toString() == id.toString() } ||
        ceilingFans?.any { it.id.toString() == id.toString() } ||
        valves?.any { it.id.toString() == id.toString() } ||
        allAudioDevices()?.any { it.id.toString() == id.toString() }
    def s = tempSensors?.find { it.id.toString() == id.toString() }
    if (s != null && senEntry == null && !hasControlRole) {
        try { s.refresh() } catch (e) {}
        def out = new StringBuilder()
        def extras = sensorExtraAttrs(s, "temperature", sensorExMaxForType("temp"), "temp")
        out << "{\"i\":" << s.id
        out << ",\"temp\":" << numOrNull(safeCurrent(s, "temperature"))
        out << ",\"bat\":" << numOrNull(safeCurrent(s, "battery"))
        appendExJsonArray(out, extras)
        out << "}"
        return renderJsonNoStore( withAuthJson(out.toString()), 200)
    }
    if (senEntry != null && !hasControlRole) {
        def sd = senEntry.device
        try { sd.refresh() } catch (e) {}
        def roomsList = app.getRooms() ?: []
        def out = new StringBuilder()
        appendSensorJson(out, sd, senEntry, roomsList)
        return renderJsonNoStore( withAuthJson(out.toString()), 200)
    }
    def lk = locks?.find { it.id.toString() == id.toString() }
    if (lk != null) {
        try { lk.refresh() } catch (e) {}
        def lockSt = safeCurrent(lk, "lock")
        def out = new StringBuilder()
        out << "{\"i\":" << lk.id
        out << ",\"lk\":" << (lockSt == "locked" ? 1 : 0)
        out << ",\"st\":" << jsonStr(lockSt) << "}"
        return renderJsonNoStore( withAuthJson(out.toString()), 200)
    }
    def garage = garageDoors?.find { it.id.toString() == id.toString() }
    if (garage != null) {
        try { garage.refresh() } catch (e) {}
        def out = new StringBuilder()
        out << "{\"i\":" << garage.id
        out << ",\"st\":" << jsonStr(safeCurrent(garage, "door")) << "}"
        return renderJsonNoStore( withAuthJson(out.toString()), 200)
    }
    def shade = allWindowShades()?.find { it.id.toString() == id.toString() }
    if (shade != null) {
        try { shade.refresh() } catch (e) {}
        def shadeSt = shadeStatus(shade)
        def shadePos = shadePosition(shade)
        def out = new StringBuilder()
        out << "{\"i\":" << shade.id
        out << ",\"st\":" << jsonStr(shadeSt)
        out << ",\"pos\":" << numOrNull(shadePos) << "}"
        return renderJsonNoStore( withAuthJson(out.toString()), 200)
    }
    def fan = ceilingFans?.find { it.id.toString() == id.toString() }
    if (fan != null) {
        try { fan.refresh() } catch (e) {}
        def speed = safeCurrent(fan, "speed")
        def sw = safeCurrent(fan, "switch")
        def on = false
        if (sw != null) on = (sw == "on")
        else if (speed != null) on = (speed.toString().toLowerCase() != "off")
        def out = new StringBuilder()
        out << "{\"i\":" << fan.id
        out << ",\"s\":" << (on ? 1 : 0)
        out << ",\"sp\":" << jsonStr(speed) << "}"
        return renderJsonNoStore( withAuthJson(out.toString()), 200)
    }
    def valve = valves?.find { it.id.toString() == id.toString() }
    if (valve != null) {
        try { valve.refresh() } catch (e) {}
        def out = new StringBuilder()
        out << "{\"i\":" << valve.id
        out << ",\"st\":" << jsonStr(safeCurrent(valve, "valve"))
        out << "}"
        return renderJsonNoStore( withAuthJson(out.toString()), 200)
    }
    def mp = allAudioDevices()?.find { it.id.toString() == id.toString() }
    if (mp != null) {
        try { mp.refresh() } catch (e) {}
        def out = new StringBuilder()
        out << "{\"i\":" << mp.id
        out << ",\"st\":" << jsonStr(normalizeAudioStatus(mp) ?: "idle")
        def lvl = normalizeAudioVolume(mp)
        out << ",\"v\":" << (lvl == null ? "null" : lvl.toString())
        out << ",\"tr\":" << jsonStr(normalizeAudioTrack(mp) ?: "")
        def muteVal = safeCurrent(mp, "mute")
        out << ",\"m\":" << jsonStr(muteVal ?: "unmuted")
        out << ",\"f\":" << audioControlFlags(mp).toString()
        out << "}"
        return renderJsonNoStore( withAuthJson(out.toString()), 200)
    }
    renderJsonNoStore('{"error":"not found"}', 404)
}

// ---------------------------------------------------------------------------
// /cmd?id=..&c=on|off|setLevel|setCT|setColor&v=..
// POST /cmd/batch  body: {"commands":[{"id":1,"c":"on","v":null},...]}
// ---------------------------------------------------------------------------
def runLightCmd(dev, c, v) {
    switch (c) {
        case "on":       dev.on(); break
        case "off":      dev.off(); break
        case "setLevel":
            int lvl = (v != null) ? Math.max(0, Math.min(100, v.toInteger())) : 0
            dev.setLevel(lvl)
            break
        case "setCT":
            int k = (v != null) ? Math.max(2500, Math.min(6000, v.toInteger())) : 3000
            dev.setColorTemperature(k)
            break
        case "setColor":
            def parts = v?.toString()?.split(",")
            int hue = (parts && parts.length > 0) ? Math.max(0, Math.min(100, parts[0].trim().toInteger())) : 0
            int sat = (parts && parts.length > 1) ? Math.max(0, Math.min(100, parts[1].trim().toInteger())) : 100
            dev.setColor([hue: hue, saturation: sat])
            break
        default:
            throw new IllegalArgumentException("unknown command")
    }
}

def runThermostatCmd(t, c, v) {
    switch (c) {
        case "setMode":
            if (v != null) t.setThermostatMode(v.toString())
            break
        case "modeAuto": t.auto(); break
        case "modeHeat": t.heat(); break
        case "modeCool": t.cool(); break
        case "off":      t.off(); break
        case "setHeat":
            if (v != null) t.setHeatingSetpoint(v.toInteger())
            break
        case "setCool":
            if (v != null) t.setCoolingSetpoint(v.toInteger())
            break
        case "setFanMode":
            if (v != null && (t.hasCapability("ThermostatFanMode") || t.hasAttribute("thermostatFanMode"))) t.setFanMode(v.toString())
            break
        case "setFanSpeed":
            if (v != null && (t.hasAttribute("fanSpeed") || t.hasCommand("setFanSpeed"))) t.setFanSpeed(v.toString())
            break
        default:
            throw new IllegalArgumentException("unknown command")
    }
}

def runLockCmd(dev, c, v) {
    switch (c) {
        case "lock":   dev.lock(); break
        case "unlock": dev.unlock(); break
        default:
            throw new IllegalArgumentException("unknown command")
    }
}

def runGarageDoorCmd(dev, c, v) {
    switch (c) {
        case "open":  dev.open(); break
        case "close": dev.close(); break
        default:
            throw new IllegalArgumentException("unknown command")
    }
}

def runShadeCmd(dev, c, v) {
    switch (c) {
        case "open":
            if (dev.hasCommand("open")) dev.open()
            else if (dev.hasCommand("on")) dev.on()
            else throw new IllegalArgumentException("unsupported command")
            break
        case "close":
            if (dev.hasCommand("close")) dev.close()
            else if (dev.hasCommand("off")) dev.off()
            else throw new IllegalArgumentException("unsupported command")
            break
        case "setPosition":
            int pos = (v != null) ? Math.max(0, Math.min(100, v.toInteger())) : 0
            if (dev.hasCommand("setPosition")) dev.setPosition(pos)
            else if (dev.hasCommand("setLevel")) dev.setLevel(pos)
            else throw new IllegalArgumentException("unsupported command")
            break
        case "stop":
            if (dev.hasCommand("stopPositionChange")) dev.stopPositionChange()
            else if (dev.hasCommand("stop")) dev.stop()
            else throw new IllegalArgumentException("unsupported command")
            break
        default:
            throw new IllegalArgumentException("unknown command")
    }
}

def runFanCmd(dev, c, v) {
    switch (c) {
        case "on":
            if (dev.hasCommand("on")) dev.on()
            else if (dev.hasCommand("setSpeed")) dev.setSpeed("on")
            else if (dev.hasCommand("setFanSpeed")) dev.setFanSpeed("on")
            else throw new IllegalArgumentException("unsupported command")
            break
        case "off":
            if (dev.hasCommand("off")) dev.off()
            else if (dev.hasCommand("setSpeed")) dev.setSpeed("off")
            else if (dev.hasCommand("setFanSpeed")) dev.setFanSpeed("off")
            else throw new IllegalArgumentException("unsupported command")
            break
        case "setSpeed":
            def speed = resolveFanSpeed(dev, v)
            if (!speed) throw new IllegalArgumentException("missing speed")
            if (dev.hasCommand("setSpeed")) {
                dev.setSpeed(speed)
            } else if (dev.hasCommand("setFanSpeed")) {
                dev.setFanSpeed(speed)
            } else if (dev.hasCommand("setLevel")) {
                def lvl = fanSpeedLevel(dev, speed)
                if (lvl == null) throw new IllegalArgumentException("unsupported speed")
                dev.setLevel(lvl)
            } else {
                throw new IllegalArgumentException("unsupported command")
            }
            break
        default:
            throw new IllegalArgumentException("unknown command")
    }
}

def fanSpeedTokens(dev) {
    def fromAttr = normalizeListTokens(safeCurrent(dev, "supportedFanSpeeds"))
    if (fromAttr) return fromAttr
    def cur = safeCurrent(dev, "speed")
    return cur ? [cur.toString()] : []
}

def resolveFanSpeed(dev, v) {
    if (v == null || !v.toString().trim()) return null
    def req = v.toString().trim()
    def reqLower = req.toLowerCase()
    def tokens = fanSpeedTokens(dev)
    if (tokens) {
        for (tok in tokens) {
            if (tok.toString().equalsIgnoreCase(req)) return tok.toString()
        }
    }
    // Common aliases when supportedFanSpeeds is missing or incomplete.
    def aliases = [
        "med": "medium",
        "medium": "medium",
        "hi": "high",
        "high": "high",
        "lo": "low",
        "low": "low",
    ]
    def canonical = aliases[reqLower] ?: reqLower
    if (tokens) {
        for (tok in tokens) {
            if (tok.toString().equalsIgnoreCase(canonical)) return tok.toString()
        }
    }
    return req
}

def fanSpeedLevel(dev, speed) {
    def raw = safeCurrent(dev, "supportedFanSpeeds")
    if (raw instanceof Map) {
        def direct = raw[speed]
        if (direct == null) {
            raw.each { k, val ->
                if (k.toString().equalsIgnoreCase(speed.toString())) {
                    direct = val
                }
            }
        }
        if (isNumericListToken(direct)) return Math.max(0, Math.min(100, direct.toInteger()))
    }
    def defaults = [low: 25, "medium-low": 33, medium: 50, "medium-high": 67, high: 99, on: 99]
    def key = speed?.toString()?.toLowerCase()
    if (key && defaults.containsKey(key)) return defaults[key]
    return null
}

def runValveCmd(dev, c, v) {
    switch (c) {
        case "open":  dev.open(); break
        case "close": dev.close(); break
        default:
            throw new IllegalArgumentException("unknown command")
    }
}

def runAudioCmd(dev, c, v) {
    switch (c) {
        case "play":
            if (!dev.hasCommand("play")) throw new IllegalArgumentException("unsupported command")
            dev.play()
            break
        case "pause":
            if (!dev.hasCommand("pause")) throw new IllegalArgumentException("unsupported command")
            dev.pause()
            break
        case "stop":
            if (!dev.hasCommand("stop")) throw new IllegalArgumentException("unsupported command")
            dev.stop()
            break
        case "nextTrack":
            if (!dev.hasCommand("nextTrack")) throw new IllegalArgumentException("unsupported command")
            dev.nextTrack()
            break
        case "previousTrack":
            if (!dev.hasCommand("previousTrack")) throw new IllegalArgumentException("unsupported command")
            dev.previousTrack()
            break
        case "mute":
            if (!dev.hasCommand("mute")) throw new IllegalArgumentException("unsupported command")
            dev.mute()
            break
        case "unmute":
            if (!dev.hasCommand("unmute")) throw new IllegalArgumentException("unsupported command")
            dev.unmute()
            break
        case "setVolume":
            if (!dev.hasCommand("setVolume") && !dev.hasCapability("MusicPlayer") && !dev.hasCapability("AudioVolume")) {
                throw new IllegalArgumentException("unsupported command")
            }
            int vol = (v != null) ? Math.max(0, Math.min(100, v.toInteger())) : 0
            dev.setVolume(vol)
            break
        default:
            throw new IllegalArgumentException("unknown command")
    }
}

def validateUnlockPin(pin) {
    if (unlockPinEnabled != true) return [ok: true]
    def expected = unlockPin?.toString()?.trim() ?: ""
    if (!expected) {
        log.warn "Modern Dashboard: unlock pin failed — pin not configured"
        return [ok: false, error: "pin not configured"]
    }
    if (!pin?.trim()) {
        log.warn "Modern Dashboard: unlock pin failed — wrong pin"
        return [ok: false, error: "wrong pin"]
    }
    if (!pinsMatch(expected, pin.trim())) {
        log.warn "Modern Dashboard: unlock pin failed — wrong pin"
        return [ok: false, error: "wrong pin"]
    }
    return [ok: true]
}

def isShadeCmd(c) {
    return c == "open" || c == "close" || c == "setPosition" || c == "stop"
}

def executeOneCmd(id, c, v, pin) {
    if (id == null || c == null) {
        log.warn "Modern Dashboard: cmd failed — id=${id} ${c}: missing params"
        return [ok: false, error: "missing params"]
    }
    def dev = lights?.find { it.id.toString() == id.toString() }
    def outletDev = outletSwitches?.find { it.id.toString() == id.toString() }
    def t = thermostats?.find { it.id.toString() == id.toString() }
    def lk = locks?.find { it.id.toString() == id.toString() }
    def garage = garageDoors?.find { it.id.toString() == id.toString() }
    def shade = allWindowShades()?.find { it.id.toString() == id.toString() }
    def fan = ceilingFans?.find { it.id.toString() == id.toString() }
    def valve = valves?.find { it.id.toString() == id.toString() }
    def mp = allAudioDevices()?.find { it.id.toString() == id.toString() }
    if (dev == null && outletDev == null && t == null && lk == null && garage == null && shade == null && fan == null && valve == null && mp == null) {
        log.warn "Modern Dashboard: cmd failed — id=${id} ${c}: device not found"
        return [ok: false, error: "device not found"]
    }
    def targetDev = dev ?: outletDev ?: t ?: lk ?: garage ?: shade ?: fan ?: valve ?: mp
    try {
        logDbg("cmd — ${deviceLabel(targetDev)} ${c}" + ((v != null && v.toString() != "") ? " v=${v}" : ""))
        if (shade != null && isShadeCmd(c)) {
            runShadeCmd(shade, c, v)
        } else if (fan != null && (c == "on" || c == "off" || c == "setSpeed")) {
            runFanCmd(fan, c, v)
        } else if (dev != null) {
            runLightCmd(dev, c, v)
        } else if (outletDev != null) {
            runLightCmd(outletDev, c, v)
        } else if (t != null) {
            runThermostatCmd(t, c, v)
        } else if (lk != null) {
            if (c == "unlock") {
                def pinResult = validateUnlockPin(pin)
                if (!pinResult.ok) return pinResult
            }
            runLockCmd(lk, c, v)
        } else if (garage != null) {
            if (c == "open") {
                def pinResult = validateUnlockPin(pin)
                if (!pinResult.ok) return pinResult
            }
            runGarageDoorCmd(garage, c, v)
        } else if (shade != null) {
            runShadeCmd(shade, c, v)
        } else if (fan != null) {
            runFanCmd(fan, c, v)
        } else if (valve != null) {
            runValveCmd(valve, c, v)
        } else {
            runAudioCmd(mp, c, v)
        }
        return [ok: true]
    } catch (e) {
        logCmdFailure(targetDev, c, v, e.message ?: e.toString())
        return [ok: false, error: e.message ?: e.toString()]
    }
}

def doCmd() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def result = executeOneCmd(params.id, params.c, params.v, params.pin)
    if (!result.ok) {
        def status = result.error == "device not found" ? 404 : (result.error == "missing params" ? 400 : 500)
        if (result.error?.contains("unknown command")) status = 400
        if (result.error == "wrong pin") status = 403
        if (result.error == "pin not configured") status = 400
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr(result.error)}}", status)
    }
    return renderJsonNoStore( withAuthJson('{"ok":true}'), 200)
}

def doCmdBatch() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    def commands = body?.commands
    if (!(commands instanceof List) || commands.isEmpty()) {
        return renderJsonNoStore( '{"ok":false,"error":"missing commands"}', 400)
    }
    def errors = []
    int failed = 0
    for (item in commands) {
        def id = item?.id
        def c = item?.c
        def v = item?.containsKey("v") ? item.v : null
        def pin = item?.containsKey("pin") ? item.pin : null
        def result = executeOneCmd(id, c, v, pin)
        if (!result.ok) {
            failed++
            errors << [id: id, error: result.error]
        }
    }
    if (failed > 0) {
        log.warn "Modern Dashboard: batch cmd — ${failed} failed of ${commands.size()}"
    }
    def out = new StringBuilder()
    out << "{\"ok\":" << (failed == 0 ? "true" : "false")
    out << ",\"total\":" << commands.size()
    out << ",\"failed\":" << failed
    out << ",\"errors\":["
    boolean first = true
    for (err in errors) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << (err.id == null ? "null" : err.id.toString())
        out << ",\"error\":" << jsonStr(err.error) << "}"
    }
    out << "]}"
    def status = 200
    return renderJsonNoStore( withAuthJson(out.toString()), status)
}

// ---------------------------------------------------------------------------
// Light control: snapshots, bulk on/off, async command queue
// ---------------------------------------------------------------------------
def parseRequestJson() {
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    return body
}

def lightControlMeterDelayMsValue() {
    if (lightControlDisableMetering == true) return 0
    def ms = lightControlMeterDelayMs
    if (ms == null) return 75
    try {
        ms = ms.toInteger()
    } catch (e) {
        ms = 75
    }
    return Math.max(0, Math.min(2000, ms))
}

def lightControlConfigJsonFragment() {
    def out = new StringBuilder()
    out << ",\"lightControlDisableMetering\":" << (lightControlDisableMetering == true ? "true" : "false")
    out << ",\"lightControlMeterDelayMs\":" << lightControlMeterDelayMsValue()
    out << ",\"lightControlOnOffOptimization\":" << (lightControlOnOffOptimization == true ? "true" : "false")
    out << ",\"lightControlActivationOptimization\":" << (lightControlActivationOptimization == true ? "true" : "false")
    return out.toString()
}

def snapshotScopeKey(scope, roomId) {
    if (scope == "house") return "house"
    if (scope == "room") {
        def rid = roomId?.toString()?.trim()
        if (!rid) return null
        return "room:${rid}"
    }
    return null
}

def lightsInScope(scope, roomId) {
    if (!lights) return []
    def roomsList = app.getRooms() ?: []
    if (scope == "house") return lights.collect()
    if (scope != "room") return []
    def rid = roomId?.toString()?.trim()
    if (rid == "-1") {
        return lights.findAll { d ->
            def roomName = null
            try { roomName = d.getRoomName() } catch (e) { roomName = null }
            if (!roomName) return true
            return !roomsList.find { it.name == roomName }
        }
    }
    def room = null
    try {
        def ridLong = rid.toLong()
        room = roomsList.find { it.id == ridLong }
    } catch (e) {
        room = roomsList.find { it.id.toString() == rid }
    }
    if (!room) return []
    return lights.findAll { d ->
        def roomName = null
        try { roomName = d.getRoomName() } catch (e) { roomName = null }
        return roomName == room.name
    }
}

def captureLightState(d) {
    def m = [:]
    def sw = safeCurrent(d, "switch")
    m.s = (sw == "on") ? 1 : 0
    if (d.hasCapability("SwitchLevel")) {
        def lvl = safeCurrent(d, "level")
        if (lvl != null) {
            try { m.l = lvl.toInteger() } catch (e) {}
        }
    }
    if (d.hasCapability("ColorTemperature")) {
        def k = safeCurrent(d, "colorTemperature")
        if (k != null) {
            try { m.k = k.toInteger() } catch (e) {}
        }
    }
    if (d.hasCapability("ColorControl")) {
        def hue = safeCurrent(d, "hue")
        def sat = safeCurrent(d, "saturation")
        if (hue != null) {
            try { m.h = hue.toInteger() } catch (e) {}
        }
        if (sat != null) {
            try { m.sat = sat.toInteger() } catch (e) {}
        }
    }
    if (d.hasCapability("ColorTemperature") && d.hasCapability("ColorControl")) {
        def cm = safeCurrent(d, "colorMode")
        if (cm) m.cm = cm.toString()
    }
    return m
}

def parseSnapshotsMap() {
    if (!state.snapshotsJson) return [:]
    try {
        return new groovy.json.JsonSlurper().parseText(state.snapshotsJson.toString()) ?: [:]
    } catch (e) {
        return [:]
    }
}

def saveSnapshotsMap(map) {
    state.snapshotsJson = groovy.json.JsonOutput.toJson(map ?: [:])
}

def parseLightCommandJob() {
    if (!state.lightCommandJobJson) return null
    try {
        return new groovy.json.JsonSlurper().parseText(state.lightCommandJobJson.toString())
    } catch (e) {
        return null
    }
}

def saveLightCommandJob(job) {
    state.lightCommandJobJson = groovy.json.JsonOutput.toJson(job)
}

def clearLightCommandJob() {
    state.remove("lightCommandJobJson")
    try { unschedule("lightCommandNextStep") } catch (e) {}
}

def scheduleLightCommandNextStep(delayMs) {
    def ms = delayMs
    if (ms == null) ms = lightControlMeterDelayMsValue()
    try {
        ms = Math.max(1, ms.toInteger())
    } catch (e) {
        ms = 75
    }
    try {
        runInMillis(ms, "lightCommandNextStep")
    } catch (e) {
        def sec = Math.max(1, Math.ceil(ms / 1000.0).toInteger())
        runIn(sec, "lightCommandNextStep")
    }
}

def lightJobActive() {
    def job = parseLightCommandJob()
    return job != null && job.index != null && job.total != null && job.index < job.total
}

def snapshotsJsonFragment() {
    def map = parseSnapshotsMap()
    def out = new StringBuilder()
    out << ",\"snapshots\":{"
    boolean first = true
    map.each { key, snap ->
        if (!first) out << ","; first = false
        out << jsonStr(key.toString()) << ":{"
        out << "\"ts\":" << (snap?.ts ?: 0)
        def ids = snap?.deviceIds
        def count = (ids instanceof List) ? ids.size() : 0
        out << ",\"count\":" << count
        out << "}"
    }
    out << "}"
    return out.toString()
}

def lightJobJsonFragment() {
    def job = parseLightCommandJob()
    def out = new StringBuilder()
    out << ",\"lightJob\":{"
    if (job && job.index != null && job.total != null && job.index < job.total) {
        out << "\"active\":true"
        out << ",\"kind\":" << jsonStr(job.kind?.toString() ?: "")
        out << ",\"done\":" << job.index
        out << ",\"total\":" << job.total
        out << ",\"failed\":" << (job.failed ?: 0)
        if (job.scope) out << ",\"scope\":" << jsonStr(job.scope.toString())
        if (job.cmd) out << ",\"cmd\":" << jsonStr(job.cmd.toString())
    } else {
        out << "\"active\":false,\"kind\":null,\"done\":0,\"total\":0,\"failed\":0"
    }
    out << "}"
    return out.toString()
}

def shouldSkipOnOffCmd(dev, cmd) {
    if (lightControlOnOffOptimization != true) return false
    def sw = safeCurrent(dev, "switch")?.toString()
    if (cmd == "on" && sw == "on") return true
    if (cmd == "off" && sw == "off") return true
    return false
}

def shouldSkipActivationCmd(dev, cmd, v, snap) {
    if (lightControlActivationOptimization != true || !snap) return false
    switch (cmd) {
        case "setLevel":
            if (snap.l == null) return false
            def lvl = safeCurrent(dev, "level")
            if (lvl == null) return false
            try {
                return Math.abs(lvl.toInteger() - snap.l.toInteger()) <= 1
            } catch (e) { return false }
        case "setCT":
            if (snap.k == null) return false
            def k = safeCurrent(dev, "colorTemperature")
            if (k == null) return false
            try {
                return Math.abs(k.toInteger() - snap.k.toInteger()) <= 25
            } catch (e) { return false }
        case "setColor":
            if (snap.h == null || snap.sat == null) return false
            def hue = safeCurrent(dev, "hue")
            def sat = safeCurrent(dev, "saturation")
            if (hue == null || sat == null) return false
            try {
                return Math.abs(hue.toInteger() - snap.h.toInteger()) <= 2 &&
                    Math.abs(sat.toInteger() - snap.sat.toInteger()) <= 2
            } catch (e) { return false }
        default:
            return false
    }
}

def shouldSkipLightCmd(dev, cmd, v, snap) {
    if (cmd == "on" || cmd == "off") return shouldSkipOnOffCmd(dev, cmd)
    return shouldSkipActivationCmd(dev, cmd, v, snap)
}

def buildBulkSteps(cmd, scopeDevices) {
    def steps = []
    for (d in scopeDevices) {
        if (shouldSkipOnOffCmd(d, cmd)) continue
        steps << [id: d.id, cmds: [[cmd, null]]]
    }
    return steps
}

def buildRestoreSteps(devicesMap, deviceIds) {
    def offSteps = []
    def onSteps = []
    for (id in deviceIds) {
        def key = id.toString()
        def snap = devicesMap[key]
        if (!snap) continue
        def dev = lights?.find { it.id.toString() == key }
        if (!dev) continue
        def step = buildRestoreDeviceStep(dev, snap)
        if (step) {
            if (snap.s == 0) offSteps << step
            else onSteps << step
        }
    }
    return offSteps + onSteps
}

def buildRestoreDeviceStep(dev, snap) {
    def cmds = []
    def snapCopy = [
        s: snap.s, l: snap.l, k: snap.k, h: snap.h, sat: snap.sat, cm: snap.cm
    ]
    if (snap.s == 0) {
        if (!shouldSkipOnOffCmd(dev, "off")) cmds << ["off", null]
        if (cmds.isEmpty()) return null
        return [id: dev.id, cmds: cmds, snap: snapCopy]
    }
    if (!shouldSkipOnOffCmd(dev, "on")) cmds << ["on", null]
    if (snap.l != null && dev.hasCapability("SwitchLevel")) {
        cmds << ["setLevel", snap.l]
    }
    def cm = snap.cm?.toString()
    if (snap.k != null && dev.hasCapability("ColorTemperature") && (!cm || cm.equalsIgnoreCase("CT"))) {
        cmds << ["setCT", snap.k]
    }
    if (snap.h != null && snap.sat != null && dev.hasCapability("ColorControl") && (!cm || cm.equalsIgnoreCase("RGB"))) {
        cmds << ["setColor", "${snap.h},${snap.sat}"]
    }
    if (cmds.isEmpty()) return null
    // Drop activation-only cmds that optimization would skip; keep on if present
    def filtered = []
    for (pair in cmds) {
        def c = pair[0]
        def v = pair.size() > 1 ? pair[1] : null
        if (!shouldSkipLightCmd(dev, c, v, snapCopy)) filtered << pair
    }
    if (filtered.isEmpty()) return null
    return [id: dev.id, cmds: filtered, snap: snapCopy]
}

def enqueueLightCommandJob(kind, steps, meta) {
    clearLightCommandJob()
    if (!steps || steps.isEmpty()) {
        return [ok: true, async: false, total: 0]
    }
    def job = [
        kind: kind,
        index: 0,
        total: steps.size(),
        failed: 0,
        steps: steps
    ]
    if (meta) job.putAll(meta)
    saveLightCommandJob(job)
    logDbg("async light job — ${kind ?: 'bulk'} ${steps.size()} steps")
    lightCommandNextStep()
    return [ok: true, async: true, total: steps.size()]
}

def lightCommandNextStep() {
    def job = parseLightCommandJob()
    if (!job || job.steps == null) {
        clearLightCommandJob()
        return
    }
    def idx = job.index ?: 0
    if (idx >= job.steps.size()) {
        def failed = job.failed ?: 0
        if (failed > 0) {
            log.warn "Modern Dashboard: async light job — ${failed} failed of ${job.total ?: job.steps.size()}"
        }
        clearLightCommandJob()
        return
    }
    def step = job.steps[idx]
    def dev = lights?.find { it.id.toString() == step.id.toString() }
    if (dev && step.cmds) {
        def snap = step.snap
        for (pair in step.cmds) {
            def c = pair[0]
            def v = pair.size() > 1 ? pair[1] : null
            if (shouldSkipLightCmd(dev, c, v, snap)) continue
            try {
                runLightCmd(dev, c, v)
            } catch (e) {
                job.failed = (job.failed ?: 0) + 1
                logCmdFailure(dev, c, v, e.message ?: e.toString())
            }
        }
    }
    job.index = idx + 1
    if (job.index >= job.steps.size()) {
        def failed = job.failed ?: 0
        if (failed > 0) {
            log.warn "Modern Dashboard: async light job — ${failed} failed of ${job.total ?: job.steps.size()}"
        }
        clearLightCommandJob()
        return
    }
    saveLightCommandJob(job)
    scheduleLightCommandNextStep(lightControlMeterDelayMsValue())
}

def renderAsyncEnqueueResult(result, extra) {
    def out = new StringBuilder()
    out << "{\"ok\":" << (result.ok ? "true" : "false")
    out << ",\"async\":" << (result.async ? "true" : "false")
    out << ",\"total\":" << (result.total ?: 0)
    if (extra) {
        extra.each { k, v ->
            if (v == null) out << ",\"${k}\":null"
            else if (v instanceof Number) out << ",\"${k}\":" << v
            else out << ",\"${k}\":" << jsonStr(v.toString())
        }
    }
    out << "}"
    return renderJsonNoStore( withAuthJson(out.toString()), 200)
}

def parseScopeParams(body) {
    def scope = body?.scope ?: params?.scope
    def roomId = body?.containsKey("roomId") ? body.roomId : params?.roomId
    scope = scope?.toString()?.trim()
    if (!scope) return [error: "missing scope"]
    if (scope != "house" && scope != "room") return [error: "invalid scope"]
    if (scope == "room" && roomId == null) return [error: "missing roomId"]
    return [scope: scope, roomId: roomId]
}

def snapshotSaveGet() {
    def body = [scope: params?.scope, roomId: params?.roomId]
    return snapshotSaveFromParams(body)
}

def snapshotSave() {
    return snapshotSaveFromParams(parseRequestJson())
}

def snapshotSaveFromParams(body) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def parsed = parseScopeParams(body ?: [:])
    if (parsed.error) {
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr(parsed.error)}}", 400)
    }
    def key = snapshotScopeKey(parsed.scope, parsed.roomId)
    if (!key) {
        return renderJsonNoStore( '{"ok":false,"error":"invalid scope"}', 400)
    }
    def scopeDevices = lightsInScope(parsed.scope, parsed.roomId)
    def deviceIds = []
    def devicesMap = [:]
    for (d in scopeDevices) {
        deviceIds << d.id
        devicesMap[d.id.toString()] = captureLightState(d)
    }
    def ts = now()
    def snap = [ts: ts, deviceIds: deviceIds, devices: devicesMap]
    def all = parseSnapshotsMap()
    all[key] = snap
    saveSnapshotsMap(all)
    return renderJsonNoStore(withAuthJson("{\"ok\":true,\"ts\":${ts},\"count\":${deviceIds.size()},\"scope\":${jsonStr(key)}}"), 200)
}

def snapshotRestoreGet() {
    def body = [scope: params?.scope, roomId: params?.roomId]
    return snapshotRestoreFromParams(body)
}

def snapshotRestore() {
    return snapshotRestoreFromParams(parseRequestJson())
}

def snapshotRestoreFromParams(body) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def parsed = parseScopeParams(body ?: [:])
    if (parsed.error) {
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr(parsed.error)}}", 400)
    }
    def key = snapshotScopeKey(parsed.scope, parsed.roomId)
    if (!key) {
        return renderJsonNoStore( '{"ok":false,"error":"invalid scope"}', 400)
    }
    def all = parseSnapshotsMap()
    def snap = all[key]
    if (!snap) {
        return renderJsonNoStore( '{"ok":false,"error":"no snapshot"}', 404)
    }
    def deviceIds = snap.deviceIds ?: []
    def devicesMap = snap.devices ?: [:]
    def steps = buildRestoreSteps(devicesMap, deviceIds)
    def result = enqueueLightCommandJob("restore", steps, [scope: key])
    return renderAsyncEnqueueResult(result, [scope: key])
}

def snapshotStatus() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def job = parseLightCommandJob()
    def out = new StringBuilder()
    out << "{\"ok\":true"
    if (job && job.index != null && job.total != null && job.index < job.total) {
        out << ",\"restoring\":true"
        out << ",\"kind\":" << jsonStr(job.kind?.toString() ?: "")
        out << ",\"done\":" << job.index
        out << ",\"total\":" << job.total
        out << ",\"failed\":" << (job.failed ?: 0)
        if (job.scope) out << ",\"scope\":" << jsonStr(job.scope.toString())
    } else {
        out << ",\"restoring\":false,\"done\":0,\"total\":0,\"failed\":0"
    }
    out << "}"
    return renderJsonNoStore( withAuthJson(out.toString()), 200)
}

def lightsBulkGet() {
    def body = [cmd: params?.cmd, scope: params?.scope, roomId: params?.roomId]
    return lightsBulkFromParams(body)
}

def lightsBulk() {
    return lightsBulkFromParams(parseRequestJson())
}

def lightsBulkFromParams(body) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def cmd = body?.cmd ?: params?.cmd
    cmd = cmd?.toString()?.trim()
    if (cmd != "on" && cmd != "off") {
        return renderJsonNoStore( '{"ok":false,"error":"invalid cmd"}', 400)
    }
    def parsed = parseScopeParams(body ?: [:])
    if (parsed.error) {
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr(parsed.error)}}", 400)
    }
    def scopeDevices = lightsInScope(parsed.scope, parsed.roomId)
    def steps = buildBulkSteps(cmd, scopeDevices)
    def result = enqueueLightCommandJob("bulk", steps, [scope: parsed.scope, cmd: cmd, roomId: parsed.roomId])
    return renderAsyncEnqueueResult(result, [cmd: cmd, scope: parsed.scope])
}

// ---------------------------------------------------------------------------
// Room order (state.roomOrder — synced across devices)
// ---------------------------------------------------------------------------
def parseRoomOrderState() {
    if (!state.roomOrder) return []
    try {
        return state.roomOrder.split(",").collect { it.trim() }.findAll { it }.collect { it.toInteger() }
    } catch (e) {
        return []
    }
}

def roomOrderJsonFragment() {
    def ids = parseRoomOrderState()
    def out = new StringBuilder()
    out << ",\"roomOrder\":["
    boolean first = true
    for (id in ids) {
        if (!first) out << ","; first = false
        out << id
    }
    out << "]"
    return out.toString()
}

def validRoomIdSet() {
    def set = new HashSet()
    set.add("-1")
    def roomsList = app.getRooms() ?: []
    for (r in roomsList) set.add(r.id.toString())
    return set
}

def saveRoomOrderGet() {
    def orderStr = params?.order
    if (!orderStr?.trim()) {
        return renderJsonNoStore( '{"ok":false,"error":"missing order"}', 400)
    }
    def order = orderStr.split(",").collect { it.trim() }.findAll { it }
    return saveRoomOrderFromList(order)
}

def saveRoomOrder() {
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    def order = body?.order
    return saveRoomOrderFromList(order)
}

def saveRoomOrderFromList(order) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    if (!(order instanceof List) || order.isEmpty()) {
        return renderJsonNoStore( '{"ok":false,"error":"missing order"}', 400)
    }
    def valid = validRoomIdSet()
    def validated = []
    def seen = new HashSet()
    for (item in order) {
        def key
        try {
            key = (item instanceof Number) ? item.longValue().toString() : item.toString().trim()
        } catch (e) { continue }
        if (!key || !valid.contains(key)) continue
        if (seen.contains(key)) continue
        seen.add(key)
        validated << (key == "-1" ? -1 : key.toLong())
    }
    if (validated.isEmpty()) {
        return renderJsonNoStore( '{"ok":false,"error":"empty order"}', 400)
    }
    state.roomOrder = validated.join(",")
    def out = new StringBuilder()
    out << "{\"ok\":true,\"order\":["
    boolean first = true
    for (id in validated) {
        if (!first) out << ","; first = false
        out << id
    }
    out << "]}"
    return renderJsonNoStore( withAuthJson(out.toString()), 200)
}

// ---------------------------------------------------------------------------
// Nav order (state.navOrder — synced across devices)
// ---------------------------------------------------------------------------
def validNavKeySet() {
    return ["lights", "locks", "scenes", "hub-mode", "security", "blinds", "outlets", "scheduling", "sensors", "thermostats", "music", "cameras", "favorites"] as Set
}

def cameraGo2rtcServerBase(dev) {
    def snap = safeCurrent(dev, "snapshotUrl")
    if (snap == null) snap = safeCurrent(dev, "image")
    if (snap == null) return null
    def s = snap.toString().trim()
    if (!s) return null
    try {
        def qIdx = s.indexOf("?")
        def base = qIdx >= 0 ? s.substring(0, qIdx) : s
        if (base.endsWith("/api/frame.jpeg")) {
            base = base.substring(0, base.length() - "/api/frame.jpeg".length())
        } else {
            base = base.replaceAll(/\\/api\\/frame\\.jpeg.*$/, "")
        }
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1)
        return base ?: null
    } catch (e) {
        return null
    }
}

def cameraStreamNameFromSnapshot(dev) {
    def snap = safeCurrent(dev, "snapshotUrl")
    if (snap == null) snap = safeCurrent(dev, "image")
    if (snap == null) return null
    def s = snap.toString().trim()
    if (!s) return null
    try {
        def qIdx = s.indexOf("?")
        def q = qIdx >= 0 ? s.substring(qIdx + 1) : ""
        for (part in q.split("&")) {
            if (part.startsWith("src=")) {
                return URLDecoder.decode(part.substring(4), "UTF-8")
            }
        }
    } catch (e) { }
    def sn = safeCurrent(dev, "streamName")
    return sn ? sn.toString().trim() : null
}

def cameraParseStreamRoles(dev) {
    def raw = safeCurrent(dev, "streamRoles")
    if (!raw) return [:]
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(raw.toString())
        if (parsed instanceof Map) {
            Map out = [:]
            parsed.each { k, v ->
                if (v) out[k.toString().toLowerCase()] = v.toString()
            }
            return out
        }
    } catch (e) { }
    return [:]
}

def cameraPickRoleName(roles, order) {
    for (role in order) {
        if (roles[role]) return roles[role]
    }
    return null
}

def cameraWebrtcEmbedUrl(dev, String streamName) {
    if (!streamName) return null
    def base = cameraGo2rtcServerBase(dev)
    if (!base) return null
    // webrtc.html + media=video+audio: audio track available; go2rtc player starts muted (unmute in iframe controls).
    return base + "/webrtc.html?src=" + URLEncoder.encode(streamName, "UTF-8") + "&media=video+audio"
}

def cameraStreamUrls(dev) {
    Map roles = cameraParseStreamRoles(dev)
    String mainName = cameraPickRoleName(roles, ['main', 'high', 'hd'])
    String loName = cameraPickRoleName(roles, ['sub', 'low', 'sd'])
    String fallback = cameraStreamNameFromSnapshot(dev)
    if (!mainName) mainName = fallback
    if (!loName) loName = mainName ?: fallback
    if (!mainName) mainName = loName
    String u = cameraWebrtcEmbedUrl(dev, loName)
    if (!u) return null
    String uh = cameraWebrtcEmbedUrl(dev, mainName)
    if (uh == u) uh = null
    return [u: u, uh: uh]
}

def cameraStreamEmbedUrl(dev) {
    def urls = cameraStreamUrls(dev)
    return urls ? urls.u : null
}

def parseNavOrderState() {
    if (!state.navOrder) return []
    try {
        return state.navOrder.split(",").collect { it.trim() }.findAll { it }
    } catch (e) {
        return []
    }
}

def navOrderJsonFragment() {
    def keys = parseNavOrderState()
    def out = new StringBuilder()
    out << ",\"navOrder\":["
    boolean first = true
    for (key in keys) {
        if (!first) out << ","; first = false
        out << jsonStr(key)
    }
    out << "]"
    return out.toString()
}

def saveNavOrderGet() {
    def orderStr = params?.order
    if (!orderStr?.trim()) {
        return renderJsonNoStore( '{"ok":false,"error":"missing order"}', 400)
    }
    def order = orderStr.split(",").collect { it.trim() }.findAll { it }
    return saveNavOrderFromList(order)
}

def saveNavOrder() {
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    def order = body?.order
    return saveNavOrderFromList(order)
}

def saveNavOrderFromList(order) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    if (!(order instanceof List) || order.isEmpty()) {
        return renderJsonNoStore( '{"ok":false,"error":"missing order"}', 400)
    }
    def valid = validNavKeySet()
    def validated = []
    def seen = new HashSet()
    for (item in order) {
        def key = item?.toString()?.trim()
        if (!key || !valid.contains(key)) continue
        if (seen.contains(key)) continue
        seen.add(key)
        validated << key
    }
    if (validated.isEmpty()) {
        return renderJsonNoStore( '{"ok":false,"error":"empty order"}', 400)
    }
    state.navOrder = validated.join(",")
    def out = new StringBuilder()
    out << "{\"ok\":true,\"order\":["
    boolean first = true
    for (key in validated) {
        if (!first) out << ","; first = false
        out << jsonStr(key)
    }
    out << "]}"
    return renderJsonNoStore( withAuthJson(out.toString()), 200)
}

// ---------------------------------------------------------------------------
// Camera order (state.cameraOrder — synced across devices)
// ---------------------------------------------------------------------------
def parseCameraOrderState() {
    if (!state.cameraOrder) return []
    try {
        return state.cameraOrder.split(",").collect { it.trim() }.findAll { it }.collect { it.toLong() }
    } catch (e) {
        return []
    }
}

def cameraOrderJsonFragment() {
    def ids = parseCameraOrderState()
    def out = new StringBuilder()
    out << ",\"cameraOrder\":["
    boolean first = true
    for (id in ids) {
        if (!first) out << ","; first = false
        out << id
    }
    out << "]"
    return out.toString()
}

def validCameraIdSet() {
    def set = new HashSet()
    if (cameras) {
        for (d in cameras) {
            try { set.add(d.id.toString()) } catch (e) {}
        }
    }
    return set
}

def orderedCamerasList() {
    if (!cameras) return []
    def list = cameras.toList()
    def order = parseCameraOrderState()
    if (!order) return list
    def byId = [:]
    for (d in list) byId[d.id.toString()] = d
    def result = []
    def seen = new HashSet()
    for (id in order) {
        def key = id.toString()
        if (byId[key]) {
            result << byId[key]
            seen.add(key)
        }
    }
    for (d in list) {
        if (!seen.contains(d.id.toString())) result << d
    }
    return result
}

def saveCameraOrderGet() {
    def orderStr = params?.order
    if (!orderStr?.trim()) {
        return renderJsonNoStore( '{"ok":false,"error":"missing order"}', 400)
    }
    def order = orderStr.split(",").collect { it.trim() }.findAll { it }
    return saveCameraOrderFromList(order)
}

def saveCameraOrder() {
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    def order = body?.order
    return saveCameraOrderFromList(order)
}

def saveCameraOrderFromList(order) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    if (!(order instanceof List) || order.isEmpty()) {
        return renderJsonNoStore( '{"ok":false,"error":"missing order"}', 400)
    }
    def valid = validCameraIdSet()
    def validated = []
    def seen = new HashSet()
    for (item in order) {
        def key
        try {
            key = (item instanceof Number) ? item.longValue().toString() : item.toString().trim()
        } catch (e) { continue }
        if (!key || !valid.contains(key)) continue
        if (seen.contains(key)) continue
        seen.add(key)
        validated << key.toLong()
    }
    if (validated.isEmpty()) {
        return renderJsonNoStore( '{"ok":false,"error":"empty order"}', 400)
    }
    state.cameraOrder = validated.join(",")
    def out = new StringBuilder()
    out << "{\"ok\":true,\"order\":["
    boolean first = true
    for (id in validated) {
        if (!first) out << ","; first = false
        out << id
    }
    out << "]}"
    return renderJsonNoStore( withAuthJson(out.toString()), 200)
}

// ---------------------------------------------------------------------------
// Hub mode, scenes, favorites
// ---------------------------------------------------------------------------
def parseFavoritesState() {
    if (!state.favorites) return []
    try {
        return state.favorites.split(",").collect { it.trim() }.findAll { it }.collect { it.toLong() }
    } catch (e) {
        return []
    }
}

def favoritesJsonFragment() {
    def ids = parseFavoritesState()
    def out = new StringBuilder()
    out << ",\"favorites\":["
    boolean first = true
    for (id in ids) {
        if (!first) out << ","; first = false
        out << id
    }
    out << "]"
    out << favoriteSizesJsonFragment()
    out << embedCardsJsonFragment()
    out << timeCardsJsonFragment()
    out << favoritesLayoutJsonFragment()
    return out.toString()
}

// ---------------------------------------------------------------------------
// Favorites embed cards + time cards + mixed layout (device + embed + time)
// ---------------------------------------------------------------------------
def maxEmbedCards() { return 12 }
def maxTimeCards() { return 12 }
def maxEmbedTitleLen() { return 80 }
def maxEmbedUrlLen() { return 4096 }
def maxEmbedCardsStateBytes() { return 32768 }
def maxTimeCardsStateBytes() { return 8192 }
def embedSizePresetSet() { return ["compact", "standard", "wide", "square", "portrait", "full", "tall", "large", "viewport"] as Set }
def timeSizePresetSet() { return ["compact", "standard", "square", "wide", "tall", "large"] as Set }
def timeStyleSet() { return ["time", "time_seconds", "time_date"] as Set }

def parseEmbedCardsState() {
    if (!state.embedCardsJson) return []
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(state.embedCardsJson.toString())
        if (!(parsed instanceof List)) return []
        def out = []
        def seen = new HashSet()
        for (item in parsed) {
            if (!(item instanceof Map)) continue
            def id = item.id?.toString()?.trim()
            def url = validateHttpsEmbedUrl(item.url)
            if (!id || !id.startsWith("e_") || !url || seen.contains(id)) continue
            seen.add(id)
            def title = normalizeEmbedTitle(item.title, url)
            def size = item.size?.toString()?.trim()
            if (!embedSizePresetSet().contains(size)) size = "tall"
            out << [id: id, title: title, url: url, size: size]
            if (out.size() >= maxEmbedCards()) break
        }
        return out
    } catch (e) {
        return []
    }
}

def parseTimeCardsState() {
    if (!state.timeCardsJson) return []
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(state.timeCardsJson.toString())
        if (!(parsed instanceof List)) return []
        def out = []
        def seen = new HashSet()
        for (item in parsed) {
            if (!(item instanceof Map)) continue
            def id = item.id?.toString()?.trim()
            if (!id || !id.startsWith("t_") || seen.contains(id)) continue
            seen.add(id)
            def style = item.style?.toString()?.trim()
            if (!timeStyleSet().contains(style)) style = "time"
            def size = item.size?.toString()?.trim()
            if (!timeSizePresetSet().contains(size)) size = "square"
            out << [id: id, style: style, size: size]
            if (out.size() >= maxTimeCards()) break
        }
        return out
    } catch (e) {
        return []
    }
}

def parseFavoritesLayoutState() {
    if (!state.favoritesLayoutJson) return []
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(state.favoritesLayoutJson.toString())
        if (!(parsed instanceof List)) return []
        return parsed.collect { it?.toString()?.trim() }.findAll { it }
    } catch (e) {
        return []
    }
}

def deviceLayoutKey(id) { return "d:" + id.toString() }
def embedLayoutKey(id) { return "e:" + id.toString().replaceFirst(/^e_/, "") }

def normalizeEmbedLayoutKey(raw) {
    def s = raw?.toString()?.trim()
    if (!s) return null
    if (s.startsWith("d:")) {
        def rest = s.substring(2)
        if (!(rest ==~ /^\d+$/)) return null
        return "d:" + rest
    }
    if (s.startsWith("e:")) {
        def rest = s.substring(2).trim()
        if (!rest) return null
        if (rest.startsWith("e_")) rest = rest.substring(2)
        if (!(rest ==~ /^[A-Za-z0-9_-]+$/)) return null
        return "e:" + rest
    }
    if (s.startsWith("e_")) {
        def rest = s.substring(2)
        if (!(rest ==~ /^[A-Za-z0-9_-]+$/)) return null
        return "e:" + rest
    }
    if (s.startsWith("t:")) {
        def rest = s.substring(2).trim()
        if (!rest) return null
        if (rest.startsWith("t_")) rest = rest.substring(2)
        if (!(rest ==~ /^[A-Za-z0-9_-]+$/)) return null
        return "t:" + rest
    }
    if (s.startsWith("t_")) {
        def rest = s.substring(2)
        if (!(rest ==~ /^[A-Za-z0-9_-]+$/)) return null
        return "t:" + rest
    }
    return null
}

def embedCardIdFromLayoutKey(key) {
    def k = normalizeEmbedLayoutKey(key)
    if (!k || !k.startsWith("e:")) return null
    return "e_" + k.substring(2)
}

def timeCardIdFromLayoutKey(key) {
    def k = normalizeEmbedLayoutKey(key)
    if (!k || !k.startsWith("t:")) return null
    return "t_" + k.substring(2)
}

def hostnameFromHttpsUrl(url) {
    try {
        def u = new java.net.URI(url.toString())
        return (u.host ?: "").toString()
    } catch (e) {
        return ""
    }
}

def normalizeEmbedTitle(raw, url) {
    def t = raw == null ? "" : raw.toString().replaceAll(/[\u0000-\u001F\u007F]/, " ").trim()
    if (t.length() > maxEmbedTitleLen()) t = t.substring(0, maxEmbedTitleLen()).trim()
    if (t) return t
    def host = hostnameFromHttpsUrl(url)
    return host ?: "Embed"
}

def validateHttpsEmbedUrl(raw) {
    if (raw == null) return null
    def s = raw.toString().trim()
    if (!s || s.length() > maxEmbedUrlLen()) return null
    for (int i = 0; i < s.length(); i++) {
        if ((int) s.charAt(i) < 0x20) return null
    }
    if (s.startsWith("//")) return null
    try {
        def u = new java.net.URI(s)
        if (!u.isAbsolute()) return null
        def scheme = (u.scheme ?: "").toLowerCase()
        if (scheme != "https") return null
        if (!u.host) return null
        return s
    } catch (e) {
        return null
    }
}

def persistEmbedCards(cards) {
    def json = groovy.json.JsonOutput.toJson(cards)
    if (json.toString().length() > maxEmbedCardsStateBytes()) {
        return [ok: false, error: "embed cards too large"]
    }
    state.embedCardsJson = json
    return [ok: true]
}

def persistTimeCards(cards) {
    def json = groovy.json.JsonOutput.toJson(cards)
    if (json.toString().length() > maxTimeCardsStateBytes()) {
        return [ok: false, error: "time cards too large"]
    }
    state.timeCardsJson = json
    return [ok: true]
}

def reconcileFavoritesLayout(deviceIds, embedCards, preferredLayout = null, persist = true, timeCards = null) {
    def times = timeCards != null ? timeCards : parseTimeCardsState()
    def validDevices = new HashSet(deviceIds.collect { it.toString() })
    def validEmbeds = new HashSet(embedCards.collect { it.id.toString() })
    def validTimes = new HashSet(times.collect { it.id.toString() })
    def source = preferredLayout != null ? preferredLayout : parseFavoritesLayoutState()
    def out = []
    def seen = new HashSet()
    for (raw in source) {
        def key = normalizeEmbedLayoutKey(raw)
        if (!key || seen.contains(key)) continue
        if (key.startsWith("d:")) {
            def id = key.substring(2)
            if (!validDevices.contains(id)) continue
        } else if (key.startsWith("e:")) {
            def eid = embedCardIdFromLayoutKey(key)
            if (!eid || !validEmbeds.contains(eid)) continue
            key = "e:" + eid.substring(2)
        } else if (key.startsWith("t:")) {
            def tid = timeCardIdFromLayoutKey(key)
            if (!tid || !validTimes.contains(tid)) continue
            key = "t:" + tid.substring(2)
        } else {
            continue
        }
        seen.add(key)
        out << key
    }
    for (id in deviceIds) {
        def key = deviceLayoutKey(id)
        if (!seen.contains(key)) {
            seen.add(key)
            out << key
        }
    }
    for (card in embedCards) {
        def key = "e:" + card.id.toString().substring(2)
        if (!seen.contains(key)) {
            seen.add(key)
            out << key
        }
    }
    for (card in times) {
        def key = "t:" + card.id.toString().substring(2)
        if (!seen.contains(key)) {
            seen.add(key)
            out << key
        }
    }
    if (persist) state.favoritesLayoutJson = groovy.json.JsonOutput.toJson(out)
    return out
}

def replaceDeviceSlotsInLayout(deviceIds) {
    def cards = parseEmbedCardsState()
    def times = parseTimeCardsState()
    def prev = parseFavoritesLayoutState()
    def deviceQueue = deviceIds.collect { deviceLayoutKey(it) }
    def next = []
    def di = 0
    for (raw in prev) {
        def key = normalizeEmbedLayoutKey(raw)
        if (!key) continue
        if (key.startsWith("d:")) {
            if (di < deviceQueue.size()) {
                next << deviceQueue[di]
                di++
            }
        } else if (key.startsWith("e:")) {
            def eid = embedCardIdFromLayoutKey(key)
            if (eid && cards.find { it.id == eid }) next << ("e:" + eid.substring(2))
        } else if (key.startsWith("t:")) {
            def tid = timeCardIdFromLayoutKey(key)
            if (tid && times.find { it.id == tid }) next << ("t:" + tid.substring(2))
        }
    }
    while (di < deviceQueue.size()) {
        next << deviceQueue[di]
        di++
    }
    return reconcileFavoritesLayout(deviceIds, cards, next, true, times)
}

def embedCardsJsonFragment() {
    def cards = parseEmbedCardsState()
    def out = new StringBuilder()
    out << ",\"embedCards\":["
    boolean first = true
    for (card in cards) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
        out << ",\"title\":" << jsonStr(card.title)
        out << ",\"url\":" << jsonStr(card.url)
        out << ",\"size\":" << jsonStr(card.size) << "}"
    }
    out << "]"
    return out.toString()
}

def timeCardsJsonFragment() {
    def cards = parseTimeCardsState()
    def out = new StringBuilder()
    out << ",\"timeCards\":["
    boolean first = true
    for (card in cards) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
        out << ",\"style\":" << jsonStr(card.style)
        out << ",\"size\":" << jsonStr(card.size) << "}"
    }
    out << "]"
    return out.toString()
}

def favoritesLayoutJsonFragment() {
    // Read-only reconcile for the response; do not rewrite hub state on every /data poll.
    def layout = reconcileFavoritesLayout(parseFavoritesState(), parseEmbedCardsState(), parseFavoritesLayoutState(), false, parseTimeCardsState())
    def out = new StringBuilder()
    out << ",\"favoritesLayout\":["
    boolean first = true
    for (key in layout) {
        if (!first) out << ","; first = false
        out << jsonStr(key)
    }
    out << "]"
    return out.toString()
}

def newEmbedCardId() {
    return "e_" + UUID.randomUUID().toString().replace("-", "")
}

def saveEmbedCards() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    def action = body?.action?.toString()?.trim()?.toLowerCase()
    if (!action) return renderJsonNoStore('{"ok":false,"error":"missing action"}', 400)
    def cards = parseEmbedCardsState()
    def deviceIds = parseFavoritesState()

    if (action == "create") {
        if (cards.size() >= maxEmbedCards()) {
            return renderJsonNoStore('{"ok":false,"error":"embed card limit reached"}', 400)
        }
        def url = validateHttpsEmbedUrl(body?.url)
        if (!url) return renderJsonNoStore('{"ok":false,"error":"invalid https url"}', 400)
        def size = body?.size?.toString()?.trim()
        if (!embedSizePresetSet().contains(size)) size = "tall"
        def id = newEmbedCardId()
        def title = normalizeEmbedTitle(body?.title, url)
        cards << [id: id, title: title, url: url, size: size]
        def persisted = persistEmbedCards(cards)
        if (!persisted.ok) return renderJsonNoStore("{\"ok\":false,\"error\":${jsonStr(persisted.error)}}", 400)
        def layout = parseFavoritesLayoutState()
        layout << ("e:" + id.substring(2))
        def reconciled = reconcileFavoritesLayout(deviceIds, cards, layout)
        return renderEmbedCardsResponse(cards, reconciled, id)
    }

    if (action == "update") {
        def id = body?.id?.toString()?.trim()
        if (!id || !id.startsWith("e_")) return renderJsonNoStore('{"ok":false,"error":"missing id"}', 400)
        def idx = -1
        for (int i = 0; i < cards.size(); i++) {
            if (cards[i].id == id) { idx = i; break }
        }
        if (idx < 0) return renderJsonNoStore('{"ok":false,"error":"not found"}', 404)
        def url = body?.url != null ? validateHttpsEmbedUrl(body.url) : cards[idx].url
        if (!url) return renderJsonNoStore('{"ok":false,"error":"invalid https url"}', 400)
        def title = body?.title != null ? normalizeEmbedTitle(body.title, url) : normalizeEmbedTitle(cards[idx].title, url)
        def size = body?.size != null ? body.size.toString().trim() : cards[idx].size
        if (!embedSizePresetSet().contains(size)) size = cards[idx].size
        cards[idx] = [id: id, title: title, url: url, size: size]
        def persisted = persistEmbedCards(cards)
        if (!persisted.ok) return renderJsonNoStore("{\"ok\":false,\"error\":${jsonStr(persisted.error)}}", 400)
        def reconciled = reconcileFavoritesLayout(deviceIds, cards)
        return renderEmbedCardsResponse(cards, reconciled, id)
    }

    if (action == "delete") {
        def id = body?.id?.toString()?.trim()
        if (!id || !id.startsWith("e_")) return renderJsonNoStore('{"ok":false,"error":"missing id"}', 400)
        def next = cards.findAll { it.id != id }
        if (next.size() == cards.size()) return renderJsonNoStore('{"ok":false,"error":"not found"}', 404)
        def persisted = persistEmbedCards(next)
        if (!persisted.ok) return renderJsonNoStore("{\"ok\":false,\"error\":${jsonStr(persisted.error)}}", 400)
        def reconciled = reconcileFavoritesLayout(deviceIds, next)
        return renderEmbedCardsResponse(next, reconciled, id)
    }

    return renderJsonNoStore('{"ok":false,"error":"invalid action"}', 400)
}

def renderEmbedCardsResponse(cards, layout, id = null) {
    def times = parseTimeCardsState()
    def out = new StringBuilder()
    out << "{\"ok\":true"
    if (id != null) out << ",\"id\":" << jsonStr(id)
    out << ",\"embedCards\":["
    boolean first = true
    for (card in cards) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
        out << ",\"title\":" << jsonStr(card.title)
        out << ",\"url\":" << jsonStr(card.url)
        out << ",\"size\":" << jsonStr(card.size) << "}"
    }
    out << "],\"timeCards\":["
    first = true
    for (card in times) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
        out << ",\"style\":" << jsonStr(card.style)
        out << ",\"size\":" << jsonStr(card.size) << "}"
    }
    out << "],\"favoritesLayout\":["
    first = true
    for (key in layout) {
        if (!first) out << ","; first = false
        out << jsonStr(key)
    }
    out << "]}"
    return renderJsonNoStore(withAuthJson(out.toString()), 200)
}

def newTimeCardId() {
    return "t_" + UUID.randomUUID().toString().replace("-", "")
}

def saveTimeCards() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    def action = body?.action?.toString()?.trim()?.toLowerCase()
    if (!action) return renderJsonNoStore('{"ok":false,"error":"missing action"}', 400)
    def cards = parseTimeCardsState()
    def embeds = parseEmbedCardsState()
    def deviceIds = parseFavoritesState()

    if (action == "create") {
        if (cards.size() >= maxTimeCards()) {
            return renderJsonNoStore('{"ok":false,"error":"time card limit reached"}', 400)
        }
        def style = body?.style?.toString()?.trim()
        if (!timeStyleSet().contains(style)) style = "time"
        def size = body?.size?.toString()?.trim()
        if (!timeSizePresetSet().contains(size)) size = "square"
        def id = newTimeCardId()
        cards << [id: id, style: style, size: size]
        def persisted = persistTimeCards(cards)
        if (!persisted.ok) return renderJsonNoStore("{\"ok\":false,\"error\":${jsonStr(persisted.error)}}", 400)
        def layout = parseFavoritesLayoutState()
        layout << ("t:" + id.substring(2))
        def reconciled = reconcileFavoritesLayout(deviceIds, embeds, layout, true, cards)
        return renderTimeCardsResponse(cards, reconciled, id)
    }

    if (action == "update") {
        def id = body?.id?.toString()?.trim()
        if (!id || !id.startsWith("t_")) return renderJsonNoStore('{"ok":false,"error":"missing id"}', 400)
        def idx = -1
        for (int i = 0; i < cards.size(); i++) {
            if (cards[i].id == id) { idx = i; break }
        }
        if (idx < 0) return renderJsonNoStore('{"ok":false,"error":"not found"}', 404)
        def style = body?.style != null ? body.style.toString().trim() : cards[idx].style
        if (!timeStyleSet().contains(style)) style = cards[idx].style
        def size = body?.size != null ? body.size.toString().trim() : cards[idx].size
        if (!timeSizePresetSet().contains(size)) size = cards[idx].size
        cards[idx] = [id: id, style: style, size: size]
        def persisted = persistTimeCards(cards)
        if (!persisted.ok) return renderJsonNoStore("{\"ok\":false,\"error\":${jsonStr(persisted.error)}}", 400)
        def reconciled = reconcileFavoritesLayout(deviceIds, embeds, null, true, cards)
        return renderTimeCardsResponse(cards, reconciled, id)
    }

    if (action == "delete") {
        def id = body?.id?.toString()?.trim()
        if (!id || !id.startsWith("t_")) return renderJsonNoStore('{"ok":false,"error":"missing id"}', 400)
        def next = cards.findAll { it.id != id }
        if (next.size() == cards.size()) return renderJsonNoStore('{"ok":false,"error":"not found"}', 404)
        def persisted = persistTimeCards(next)
        if (!persisted.ok) return renderJsonNoStore("{\"ok\":false,\"error\":${jsonStr(persisted.error)}}", 400)
        def reconciled = reconcileFavoritesLayout(deviceIds, embeds, null, true, next)
        return renderTimeCardsResponse(next, reconciled, id)
    }

    return renderJsonNoStore('{"ok":false,"error":"invalid action"}', 400)
}

def renderTimeCardsResponse(cards, layout, id = null) {
    def embeds = parseEmbedCardsState()
    def out = new StringBuilder()
    out << "{\"ok\":true"
    if (id != null) out << ",\"id\":" << jsonStr(id)
    out << ",\"timeCards\":["
    boolean first = true
    for (card in cards) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
        out << ",\"style\":" << jsonStr(card.style)
        out << ",\"size\":" << jsonStr(card.size) << "}"
    }
    out << "],\"embedCards\":["
    first = true
    for (card in embeds) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
        out << ",\"title\":" << jsonStr(card.title)
        out << ",\"url\":" << jsonStr(card.url)
        out << ",\"size\":" << jsonStr(card.size) << "}"
    }
    out << "],\"favoritesLayout\":["
    first = true
    for (key in layout) {
        if (!first) out << ","; first = false
        out << jsonStr(key)
    }
    out << "]}"
    return renderJsonNoStore(withAuthJson(out.toString()), 200)
}

def saveFavoritesLayout() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    def layoutIn = body?.layout
    if (!(layoutIn instanceof List)) {
        return renderJsonNoStore('{"ok":false,"error":"missing layout"}', 400)
    }
    def cards = parseEmbedCardsState()
    def times = parseTimeCardsState()
    def deviceIds = parseFavoritesState()
    def validDevices = new HashSet(deviceIds.collect { it.toString() })
    def cardById = [:]
    for (card in cards) cardById[card.id] = card
    def timeById = [:]
    for (card in times) timeById[card.id] = card

    def nextLayout = []
    def seen = new HashSet()
    def nextDevices = []
    def embedSizes = body?.embedSizes
    if (embedSizes != null && !(embedSizes instanceof Map)) {
        return renderJsonNoStore('{"ok":false,"error":"invalid embedSizes"}', 400)
    }
    def timeSizes = body?.timeSizes
    if (timeSizes != null && !(timeSizes instanceof Map)) {
        return renderJsonNoStore('{"ok":false,"error":"invalid timeSizes"}', 400)
    }
    def favoriteSizes = body?.favoriteSizes
    if (favoriteSizes != null && !(favoriteSizes instanceof Map)) {
        return renderJsonNoStore('{"ok":false,"error":"invalid favoriteSizes"}', 400)
    }

    for (raw in layoutIn) {
        def key = normalizeEmbedLayoutKey(raw)
        if (!key || seen.contains(key)) continue
        if (key.startsWith("d:")) {
            def id = key.substring(2)
            if (!validDevices.contains(id)) continue
            seen.add(key)
            nextLayout << key
            nextDevices << id.toLong()
        } else if (key.startsWith("e:")) {
            def eid = embedCardIdFromLayoutKey(key)
            if (!eid || !cardById.containsKey(eid)) continue
            def nk = "e:" + eid.substring(2)
            seen.add(nk)
            nextLayout << nk
        } else if (key.startsWith("t:")) {
            def tid = timeCardIdFromLayoutKey(key)
            if (!tid || !timeById.containsKey(tid)) continue
            def nk = "t:" + tid.substring(2)
            seen.add(nk)
            nextLayout << nk
        }
    }
    // Preserve any omitted devices/embeds/times at the end (deterministic reconcile).
    nextLayout = reconcileFavoritesLayout(nextDevices.size() ? nextDevices : deviceIds, cards, nextLayout, true, times)
    if (nextDevices.size()) {
        state.favorites = nextDevices.join(",")
        deviceIds = nextDevices
    }

    // Device sizes: same rules as saveFavoritesFromList when provided.
    if (favoriteSizes != null) {
        def validSizes = new HashSet(["full", "square", "wide", "tall", "standard", "compact"])
        def validatedSet = new HashSet(deviceIds.collect { it.toString() })
        def nextSizes = [:]
        for (entry in favoriteSizes) {
            def idKey = String.valueOf(entry.key)
            def val = String.valueOf(entry.value)
            if (!validatedSet.contains(idKey)) continue
            if (!validSizes.contains(val)) continue
            nextSizes[idKey] = val
        }
        state.favoriteSizesJson = groovy.json.JsonOutput.toJson(nextSizes)
    }

    // Embed sizes live on each card.
    if (embedSizes != null) {
        def allowed = embedSizePresetSet()
        def nextCards = []
        for (card in cards) {
            def size = card.size
            if (embedSizes.containsKey(card.id)) {
                def cand = embedSizes[card.id]?.toString()?.trim()
                if (allowed.contains(cand)) size = cand
            } else if (embedSizes.containsKey(card.id.toString().substring(2))) {
                def cand = embedSizes[card.id.toString().substring(2)]?.toString()?.trim()
                if (allowed.contains(cand)) size = cand
            }
            nextCards << [id: card.id, title: card.title, url: card.url, size: size]
        }
        def persisted = persistEmbedCards(nextCards)
        if (!persisted.ok) return renderJsonNoStore("{\"ok\":false,\"error\":${jsonStr(persisted.error)}}", 400)
        cards = nextCards
        nextLayout = reconcileFavoritesLayout(deviceIds, cards, nextLayout, true, times)
    }

    // Time sizes live on each card.
    if (timeSizes != null) {
        def allowed = timeSizePresetSet()
        def nextTimes = []
        for (card in times) {
            def size = card.size
            if (timeSizes.containsKey(card.id)) {
                def cand = timeSizes[card.id]?.toString()?.trim()
                if (allowed.contains(cand)) size = cand
            } else if (timeSizes.containsKey(card.id.toString().substring(2))) {
                def cand = timeSizes[card.id.toString().substring(2)]?.toString()?.trim()
                if (allowed.contains(cand)) size = cand
            }
            nextTimes << [id: card.id, style: card.style, size: size]
        }
        def persisted = persistTimeCards(nextTimes)
        if (!persisted.ok) return renderJsonNoStore("{\"ok\":false,\"error\":${jsonStr(persisted.error)}}", 400)
        times = nextTimes
        nextLayout = reconcileFavoritesLayout(deviceIds, cards, nextLayout, true, times)
    }

    def out = new StringBuilder()
    out << "{\"ok\":true,\"favorites\":["
    boolean first = true
    for (id in deviceIds) {
        if (!first) out << ","; first = false
        out << id
    }
    out << "],\"sizes\":"
    out << (state.favoriteSizesJson ? state.favoriteSizesJson.toString() : "{}")
    out << ",\"embedCards\":["
    first = true
    for (card in cards) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
        out << ",\"title\":" << jsonStr(card.title)
        out << ",\"url\":" << jsonStr(card.url)
        out << ",\"size\":" << jsonStr(card.size) << "}"
    }
    out << "],\"timeCards\":["
    first = true
    for (card in times) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
        out << ",\"style\":" << jsonStr(card.style)
        out << ",\"size\":" << jsonStr(card.size) << "}"
    }
    out << "],\"favoritesLayout\":["
    first = true
    for (key in nextLayout) {
        if (!first) out << ","; first = false
        out << jsonStr(key)
    }
    out << "]}"
    return renderJsonNoStore(withAuthJson(out.toString()), 200)
}

def parseFavoriteSizesState() {
    if (!state.favoriteSizesJson) return [:]
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(state.favoriteSizesJson.toString())
        if (parsed instanceof Map) return parsed
        return [:]
    } catch (e) {
        return [:]
    }
}

def favoriteSizesJsonFragment() {
    def sizes = parseFavoriteSizesState()
    def out = new StringBuilder()
    out << ",\"favoriteSizes\":{"
    boolean first = true
    for (entry in sizes) {
        if (!first) out << ","; first = false
        out << jsonStr(String.valueOf(entry.key)) << ":" << jsonStr(String.valueOf(entry.value))
    }
    out << "}"
    return out.toString()
}

def validFavoriteIdSet() {
    def set = new HashSet()
    lights?.each { set.add(it.id.toString()) }
    outletSwitches?.each { set.add(it.id.toString()) }
    thermostats?.each { set.add(it.id.toString()) }
    tempSensors?.each { set.add(it.id.toString()) }
    allSensorDevices()?.each { set.add(it.device.id.toString()) }
    locks?.each { set.add(it.id.toString()) }
    garageDoors?.each { set.add(it.id.toString()) }
    allWindowShades()?.each { set.add(it.id.toString()) }
    ceilingFans?.each { set.add(it.id.toString()) }
    valves?.each { set.add(it.id.toString()) }
    allAudioDevices()?.each { set.add(it.id.toString()) }
    return set
}

def setHubModeGet() {
    def mode = params?.mode
    if (!mode?.trim()) {
        return renderJsonNoStore( '{"ok":false,"error":"missing mode"}', 400)
    }
    return setHubModeFromName(mode.trim())
}

def setHubMode() {
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    def mode = body?.mode
    if (!mode?.toString()?.trim()) {
        return renderJsonNoStore( '{"ok":false,"error":"missing mode"}', 400)
    }
    return setHubModeFromName(mode.toString().trim())
}

def setHubModeFromName(modeName) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def modes = []
    try { modes = location.modes ?: [] } catch (e) {}
    if (!modes.contains(modeName)) {
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr("unknown mode")}}", 400)
    }
    try {
        location.setMode(modeName)
        return renderJsonNoStore( withAuthJson("{\"ok\":true,\"mode\":${jsonStr(modeName)}}"), 200)
    } catch (e) {
        log.warn "Modern Dashboard: hub mode failed — ${modeName}: ${e.message ?: e}"
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr(e.message ?: e.toString())}}", 500)
    }
}

def pinsMatch(expected, provided) {
    if (expected == null || expected == "") {
        return provided == null || provided == ""
    }
    if (provided == null) provided = ""
    def a = expected.toString()
    def b = provided.toString()
    def diff = a.length() ^ b.length()
    def maxLen = Math.max(a.length(), b.length())
    for (int i = 0; i < maxLen; i++) {
        def ca = i < a.length() ? (int)a.charAt(i) : 0
        def cb = i < b.length() ? (int)b.charAt(i) : 0
        diff |= (ca ^ cb)
    }
    return diff == 0
}

def authRenewed = null

def dashboardPasswordRequired() {
    return dashboardPasswordEnabled == true && (dashboardPassword?.toString()?.trim() ?: "") != ""
}

// 7 days in ms — method (not a field) so Hubitat cannot leave it null.
def dashSessionTtlMs() {
    return 604800000L
}

// Opaque sessions in app state. Sliding expiry: each validated request extends to now+7d.
// (Signed/HMAC tokens were unreliable in Hubitat sandbox and tied to access_token.)
def parseDashSessionsMap() {
    if (!state.dashSessionsJson) return [:]
    try {
        return new groovy.json.JsonSlurper().parseText(state.dashSessionsJson.toString()) ?: [:]
    } catch (e) {
        return [:]
    }
}

def saveDashSessionsMap(map) {
    state.dashSessionsJson = groovy.json.JsonOutput.toJson(map ?: [:])
}

def syncDashPasswordEpoch() {
    def enabled = dashboardPasswordEnabled == true ? "1" : "0"
    def fp = enabled + "|" + (dashboardPassword?.toString()?.trim() ?: "")
    if (state.dashPwFp != fp) {
        state.dashPwFp = fp
        state.dashSessionsJson = "{}"
    }
}

def pruneDashSessionsMap(map, long nowMs) {
    def out = [:]
    map?.each { k, v ->
        try {
            long exp = (v instanceof Number) ? v.longValue() : v.toString().toLong()
            if (k && exp > nowMs) out[k.toString()] = exp
        } catch (e) {}
    }
    return out
}

def newDashSessionToken() {
    long seq = 0L
    try {
        if (state.dashSessionSeq != null) seq = state.dashSessionSeq.toString().toLong()
    } catch (e) {
        seq = 0L
    }
    seq = seq + 1L
    if (seq > 2000000000L) seq = 1L
    state.dashSessionSeq = seq
    return "ds-" + now().toString() + "-" + seq.toString()
}

def issueDashboardSession() {
    syncDashPasswordEpoch()
    long nowMs = now()
    long expiry = nowMs + dashSessionTtlMs()
    def token = newDashSessionToken()
    def map = pruneDashSessionsMap(parseDashSessionsMap(), nowMs)
    map[token] = expiry
    saveDashSessionsMap(map)
    return [session: token, expiresAt: expiry]
}

def validateAndRenewDashboardSession(token) {
    if (!token || !dashboardPasswordRequired()) return null
    syncDashPasswordEpoch()
    def key = token.toString().trim()
    if (!key) return null
    long nowMs = now()
    def map = pruneDashSessionsMap(parseDashSessionsMap(), nowMs)
    def expVal = map[key]
    if (expVal == null) {
        saveDashSessionsMap(map)
        return null
    }
    long expiry
    try {
        expiry = (expVal instanceof Number) ? expVal.longValue() : expVal.toString().toLong()
    } catch (e) {
        map.remove(key)
        saveDashSessionsMap(map)
        return null
    }
    if (expiry <= nowMs) {
        map.remove(key)
        saveDashSessionsMap(map)
        return null
    }
    // Slide window: activity extends expiry another 7 days from now.
    long renewedExpiry = nowMs + dashSessionTtlMs()
    map[key] = renewedExpiry
    saveDashSessionsMap(map)
    return [session: key, expiresAt: renewedExpiry]
}

def extractDashSession() {
    def token = params?.dash_session?.toString()?.trim()
    if (token) return token
    try {
        def body = request?.JSON
        if (body == null) {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        }
        if (body?.dash_session) return body.dash_session.toString().trim()
    } catch (e) {}
    return null
}

def checkDashboardSession() {
    if (!dashboardPasswordRequired()) return [allowed: true, renewed: null]
    def token = extractDashSession()
    def renewed = validateAndRenewDashboardSession(token)
    if (!renewed) return [allowed: false, renewed: null]
    return [allowed: true, renewed: renewed]
}

def guardDashboardAccess() {
    authRenewed = null
    def auth = checkDashboardSession()
    if (!auth.allowed) return false
    authRenewed = auth.renewed
    return true
}

def renderAuthRequired() {
    return renderJsonNoStore('{"ok":false,"error":"auth required"}', 401)
}

def withAuthJson(baseJson) {
    if (!authRenewed) return baseJson
    def suffix = ',"dashSession":' + jsonStr(authRenewed.session) + ',"dashSessionExpiresAt":' + authRenewed.expiresAt
    if (baseJson.endsWith("}")) {
        return baseJson.substring(0, baseJson.length() - 1) + suffix + "}"
    }
    return baseJson + suffix
}

def authStatus() {
    if (!dashboardPasswordRequired()) syncDashPasswordEpoch()
    renderJsonNoStore('{"required":' + (dashboardPasswordRequired() ? "true" : "false") + '}', 200)
}

def authUnlock() {
    try {
        def body = request?.JSON
        if (body == null) {
            try {
                def raw = request?.postBody ?: request?.content
                if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
            } catch (e) {}
        }
        if (!dashboardPasswordRequired()) {
            return renderJsonNoStore( '{"ok":true,"required":false}', 200)
        }
        def expected = dashboardPassword?.toString()?.trim() ?: ""
        if (!expected) {
            log.warn "Modern Dashboard: auth failed — password not configured"
            return renderJsonNoStore( '{"ok":false,"error":"password not configured"}', 400)
        }
        def provided = body?.password?.toString() ?: params?.password?.toString() ?: ""
        if (!provided.trim() || !pinsMatch(expected, provided.trim())) {
            log.warn "Modern Dashboard: auth failed — wrong password"
            return renderJsonNoStore( '{"ok":false,"error":"wrong password"}', 403)
        }
        def issued = issueDashboardSession()
        def out = new StringBuilder()
        out << '{"ok":true,"session":' << jsonStr(issued.session)
        out << ',"expiresAt":' << issued.expiresAt << '}'
        return renderJsonNoStore( out.toString(), 200)
    } catch (e) {
        log.error "Modern Dashboard authUnlock: ${e.message}"
        return renderJsonNoStore( '{"ok":false,"error":"unlock failed","detail":' + jsonStr(e.message ?: e.toString()) + '}', 500)
    }
}

def authRenew() {
    if (!dashboardPasswordRequired()) {
        return renderJsonNoStore( '{"ok":true,"required":false}', 200)
    }
    if (!guardDashboardAccess()) return renderAuthRequired()
    def out = new StringBuilder()
    out << '{"ok":true,"session":' << jsonStr(authRenewed.session)
    out << ',"expiresAt":' << authRenewed.expiresAt << '}'
    return renderJsonNoStore( out.toString(), 200)
}

def initializeHsm() {
    if (hsmEnabled != true) return
    try { subscribe(location, "hsmStatus", hsmStatusChanged) } catch (e) {}
    try { subscribe(location, "hsmAlert", hsmAlertChanged) } catch (e) {}
    def seeded = readHsmStatus()
    if (seeded) state.hsmStatus = seeded
    def alert = readHsmAlert()
    if (alert) state.hsmAlert = alert
    def alertDesc = readHsmAlertDesc()
    if (alertDesc) state.hsmAlertDesc = alertDesc
}

// ---------------------------------------------------------------------------
// Virtual / Notification devices → dashboard popup queue
// ---------------------------------------------------------------------------
def maxNotificationQueue() { return 20 }
def maxNotificationTextLen() { return 1024 }

def notificationChildDni() {
    return "mld-notif-${app.id}"
}

def getNotificationChildDevice() {
    try {
        return getChildDevice(notificationChildDni())
    } catch (e) {
        return null
    }
}

def createNotificationChildDeviceFromUi() {
    state.remove("notifDeviceCreateError")
    state.remove("notifDeviceCreateOk")
    def existing = getNotificationChildDevice()
    if (existing) {
        state.notifDeviceCreateOk = existing.displayName
        syncNotificationChildSelection()
        try { initializeNotifications() } catch (e) {}
        return
    }
    def label = notifDeviceLabel?.toString()?.trim()
    if (!label) label = "Dashboard Notifications"
    if (label.length() > 64) label = label.substring(0, 64)
    try {
        def child = addChildDevice(
            "mDash",
            "mDash Notifications",
            notificationChildDni(),
            [
                name: "mDash Notifications",
                label: label,
                isComponent: false
            ]
        )
        state.notifDeviceCreateOk = child?.displayName ?: label
        log.info "Modern Dashboard: created notification device ${state.notifDeviceCreateOk}"
        syncNotificationChildSelection()
        try { initializeNotifications() } catch (e) {}
    } catch (e) {
        def msg = e?.message?.toString() ?: e?.toString() ?: "unknown error"
        state.notifDeviceCreateError = msg
        log.warn "Modern Dashboard: could not create mDash Notifications device: ${msg}"
    }
}

def notificationDeviceIdList() {
    def ids = []
    def seen = new HashSet()
    def addId = { id ->
        def key = id?.toString()?.trim()
        if (!key || seen.contains(key)) return
        seen.add(key)
        ids << key
    }
    try {
        if (notificationDevices instanceof List) {
            notificationDevices.each { d -> addId(d?.id) }
        } else if (notificationDevices) {
            addId(notificationDevices?.id)
        }
    } catch (e) {}
    return ids
}

def syncNotificationChildSelection() {
    // Only from Create button — never from updated()/installed().
    def child = getNotificationChildDevice()
    if (!child) return
    def childId = child.id?.toString()?.trim()
    if (!childId) return
    def current = notificationDeviceIdList()
    if (current.contains(childId)) return
    def next = current + [childId]
    try {
        app.updateSetting("notificationDevices", [type: "capability.notification", value: next])
    } catch (e) {
        log.warn "Modern Dashboard: could not auto-select notification child device: ${e}"
    }
}

def allNotificationDevices() {
    def out = []
    def seen = new HashSet()
    def addDev = { d ->
        if (d == null) return
        def key = null
        try { key = d.id?.toString() } catch (e) {}
        if (!key || seen.contains(key)) return
        seen.add(key)
        out << d
    }
    try {
        if (notificationDevices instanceof List) notificationDevices.each { addDev(it) }
        else if (notificationDevices) addDev(notificationDevices)
    } catch (e) {}
    return out
}

def initializeNotifications() {
    // Drop all notification subscriptions (including removed picker devices).
    try { unsubscribe("notificationDeviceEvent") } catch (e) {}
    def devices = allNotificationDevices()
    if (!devices) return
    for (d in devices) {
        try { subscribe(d, "notificationText", notificationDeviceEvent) } catch (e) {}
        try { subscribe(d, "deviceNotification", notificationDeviceEvent) } catch (e) {}
        try { subscribe(d, "lastMessage", notificationDeviceEvent) } catch (e) {}
    }
}

def notificationDeviceEvent(evt) {
    def text = evt?.value?.toString()?.trim()
    if (!text) return
    if (text.length() > maxNotificationTextLen()) text = text.substring(0, maxNotificationTextLen())
    def deviceId = null
    def deviceName = ""
    try { deviceId = evt?.deviceId } catch (e) {}
    try { deviceName = evt?.displayName?.toString() ?: "" } catch (e) {}
    if (!deviceName) {
        try { deviceName = evt?.device?.displayName?.toString() ?: "" } catch (e) {}
    }
    // Some drivers fire multiple attributes for one notify (e.g. notificationText +
    // lastMessage). Collapse same device+text within a short window into one queue item.
    def nowMs = now()
    def dedupeKey = "${deviceId ?: ""}|${text}"
    def lastKey = state.notifDedupeKey?.toString()
    def lastAt = (state.notifDedupeAt instanceof Number) ? state.notifDedupeAt.longValue() : 0L
    if (dedupeKey == lastKey && (nowMs - lastAt) < 3000L) return
    state.notifDedupeKey = dedupeKey
    state.notifDedupeAt = nowMs
    appendNotification(text, deviceId, deviceName)
}

def parseNotificationsState() {
    if (!state.notificationsJson) return []
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(state.notificationsJson.toString())
        if (!(parsed instanceof List)) return []
        def out = []
        for (item in parsed) {
            if (!(item instanceof Map)) continue
            def id = item.id?.toString()?.trim()
            def text = item.text?.toString()
            if (!id || text == null) continue
            def entry = [
                id: id,
                text: text.toString(),
                ts: (item.ts instanceof Number) ? item.ts.longValue() : now(),
                deviceId: item.deviceId,
                deviceName: item.deviceName?.toString() ?: ""
            ]
            out << entry
            if (out.size() >= maxNotificationQueue()) break
        }
        return out
    } catch (e) {
        return []
    }
}

def persistNotificationsState(list) {
    def capped = (list instanceof List) ? list.take(maxNotificationQueue()) : []
    state.notificationsJson = groovy.json.JsonOutput.toJson(capped)
}

def appendNotification(text, deviceId, deviceName) {
    def list = parseNotificationsState()
    def seq = (state.notifSeq instanceof Number) ? state.notifSeq.longValue() : 0L
    seq++
    state.notifSeq = seq
    def id = "n_${now()}_${seq}"
    def entry = [
        id: id,
        text: text?.toString() ?: "",
        ts: now(),
        deviceId: deviceId,
        deviceName: deviceName?.toString() ?: ""
    ]
    list << entry
    while (list.size() > maxNotificationQueue()) {
        list.remove(0)
    }
    persistNotificationsState(list)
}

def notificationsJsonFragment() {
    def list = parseNotificationsState()
    def out = new StringBuilder()
    out << ",\"notifications\":["
    boolean first = true
    for (item in list) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(item.id)
        out << ",\"text\":" << jsonStr(item.text)
        out << ",\"ts\":" << (item.ts ?: 0)
        if (item.deviceId != null) out << ",\"deviceId\":" << item.deviceId
        out << ",\"deviceName\":" << jsonStr(item.deviceName ?: "")
        out << "}"
    }
    out << "]"
    out << ",\"notificationDeviceIds\":["
    first = true
    for (d in allNotificationDevices()) {
        if (!first) out << ","; first = false
        out << d.id
    }
    out << "]"
    return out.toString()
}

def notificationsGet() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def out = new StringBuilder()
    out << '{"ok":true'
    out << notificationsJsonFragment()
    out << "}"
    return renderJsonNoStore(withAuthJson(out.toString()), 200)
}

def notificationsAckGet() {
    def id = params?.id
    if (!id?.toString()?.trim()) {
        return renderJsonNoStore('{"ok":false,"error":"missing id"}', 400)
    }
    return notificationsAckFromId(id.toString().trim())
}

def notificationsAck() {
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    def id = body?.id ?: params?.id
    if (!id?.toString()?.trim()) {
        return renderJsonNoStore('{"ok":false,"error":"missing id"}', 400)
    }
    return notificationsAckFromId(id.toString().trim())
}

def notificationsAckFromId(id) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def list = parseNotificationsState()
    def next = list.findAll { it.id?.toString() != id }
    persistNotificationsState(next)
    def out = new StringBuilder()
    out << '{"ok":true,"id":' << jsonStr(id)
    out << ',"notifications":['
    boolean first = true
    for (item in next) {
        if (!first) out << ","; first = false
        out << '{"id":' << jsonStr(item.id)
        out << ',"text":' << jsonStr(item.text)
        out << ',"ts":' << (item.ts ?: 0)
        if (item.deviceId != null) out << ',"deviceId":' << item.deviceId
        out << ',"deviceName":' << jsonStr(item.deviceName ?: "")
        out << "}"
    }
    out << "]}"
    return renderJsonNoStore(withAuthJson(out.toString()), 200)
}

def hsmStatusChanged(evt) {
    state.hsmStatus = evt?.value?.toString() ?: ""
}

def hsmAlertChanged(evt) {
    state.hsmAlert = evt?.value?.toString() ?: ""
    state.hsmAlertDesc = evt?.descriptionText?.toString() ?: ""
}

def readHsmStatus() {
    def val = ""
    try { val = location.hsmStatus?.toString()?.trim() ?: "" } catch (e) {}
    if (!val && state.hsmStatus) val = state.hsmStatus.toString().trim()
    return val ?: ""
}

def readHsmAlert() {
    def val = ""
    if (state.hsmAlert) val = state.hsmAlert.toString().trim()
    return val ?: ""
}

def readHsmAlertDesc() {
    def val = ""
    if (state.hsmAlertDesc) val = state.hsmAlertDesc.toString().trim()
    return val ?: ""
}

def persistHsmFromCommand(mode) {
    def status = hsmModeToStatus(mode)
    def read = readHsmStatus()
    if (read) status = read
    if (status) state.hsmStatus = status
    if (mode == "cancelAlerts") {
        state.hsmAlert = ""
        state.hsmAlertDesc = ""
    } else {
        def alert = readHsmAlert()
        def alertDesc = readHsmAlertDesc()
        if (alert) state.hsmAlert = alert
        if (alertDesc) state.hsmAlertDesc = alertDesc
    }
}

def hsmModeToStatus(mode) {
    switch (mode) {
        case "armAway": return "armedAway"
        case "armHome": return "armedHome"
        case "armNight": return "armedNight"
        case "disarm": return "disarmed"
        case "disarmAll": return "allDisarmed"
        case "armAll": return "disarmed"
        default: return ""
    }
}

def hsmResponseAfterCommand(mode) {
    def status = readHsmStatus()
    if (!status) status = hsmModeToStatus(mode)
    def alertVal = readHsmAlert()
    def alertDescVal = readHsmAlertDesc()
    if (mode == "cancelAlerts") {
        alertVal = ""
        alertDescVal = ""
    }
    return [status: status, alert: alertVal, alertDesc: alertDescVal]
}

def setHsmGet() {
    def mode = params?.mode
    def pin = params?.pin
    if (!mode?.trim()) {
        return renderJsonNoStore( '{"ok":false,"error":"missing mode"}', 400)
    }
    return setHsmFromMode(mode.trim(), pin)
}

def setHsm() {
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    def mode = body?.mode
    def pin = body?.pin
    if (!mode?.toString()?.trim()) {
        return renderJsonNoStore( '{"ok":false,"error":"missing mode"}', 400)
    }
    return setHsmFromMode(mode.toString().trim(), pin?.toString())
}

def setHsmFromMode(mode, pin) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    if (hsmEnabled != true) {
        return renderJsonNoStore( '{"ok":false,"error":"HSM control disabled"}', 400)
    }
    def validModes = ["armAway", "armHome", "armNight", "disarm", "armAll", "disarmAll", "armRules", "disarmRules", "cancelAlerts"]
    if (!validModes.contains(mode)) {
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr("unknown mode")}}", 400)
    }
    if (hsmPinEnabled == true) {
        def expectedPin = hsmPin?.toString()?.trim() ?: ""
        if (!expectedPin) {
            log.warn "Modern Dashboard: HSM pin failed — pin not configured"
            return renderJsonNoStore( '{"ok":false,"error":"pin not configured"}', 400)
        }
        if (!pin?.trim()) {
            log.warn "Modern Dashboard: HSM pin failed — wrong pin"
            return renderJsonNoStore( '{"ok":false,"error":"wrong pin"}', 403)
        }
        if (!pinsMatch(expectedPin, pin.trim())) {
            log.warn "Modern Dashboard: HSM pin failed — wrong pin"
            return renderJsonNoStore( '{"ok":false,"error":"wrong pin"}', 403)
        }
    }
    try {
        sendLocationEvent(name: "hsmSetArm", value: mode)
        persistHsmFromCommand(mode)
        def out = hsmResponseAfterCommand(mode)
        return renderJsonNoStore( withAuthJson("{\"ok\":true,\"mode\":${jsonStr(mode)},\"status\":${jsonStr(out.status)},\"alert\":${jsonStr(out.alert)},\"alertDesc\":${jsonStr(out.alertDesc)}}"), 200)
    } catch (e) {
        log.warn "Modern Dashboard: HSM failed — ${mode}: ${e.message ?: e}"
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr(e.message ?: e.toString())}}", 500)
    }
}

def activateSceneGet() {
    def id = params?.id
    if (id == null) {
        return renderJsonNoStore( '{"ok":false,"error":"missing id"}', 400)
    }
    return activateSceneFromId(id)
}

def activateScene() {
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    def id = body?.id
    if (id == null) {
        return renderJsonNoStore( '{"ok":false,"error":"missing id"}', 400)
    }
    return activateSceneFromId(id)
}

def activateSceneFromId(id) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def sceneId
    try { sceneId = id instanceof Number ? id.longValue() : id.toString().toLong() } catch (e) {
        return renderJsonNoStore( '{"ok":false,"error":"invalid id"}', 400)
    }
    def scenesMap = [:]
    try { scenesMap = location.scenes ?: [:] } catch (e) {}
    if (!scenesMap.containsKey(sceneId)) {
        log.warn "Modern Dashboard: scene failed — ${sceneId}: scene not found"
        return renderJsonNoStore( '{"ok":false,"error":"scene not found"}', 404)
    }
    try {
        location.activateScene(sceneId)
        return renderJsonNoStore( withAuthJson("{\"ok\":true,\"id\":${sceneId}}"), 200)
    } catch (e) {
        log.warn "Modern Dashboard: scene failed — ${sceneId}: ${e.message ?: e}"
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr(e.message ?: e.toString())}}", 500)
    }
}

def saveFavoritesGet() {
    def idsStr = params?.ids
    if (!idsStr?.trim()) {
        return renderJsonNoStore( '{"ok":false,"error":"missing ids"}', 400)
    }
    def ids = idsStr.split(",").collect { it.trim() }.findAll { it }
    return saveFavoritesFromList(ids)
}

def saveFavorites() {
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    def ids = body?.ids
    if (!(ids instanceof List)) {
        return renderJsonNoStore( '{"ok":false,"error":"missing ids"}', 400)
    }
    def sizes = body?.sizes
    if (sizes != null && !(sizes instanceof Map)) {
        return renderJsonNoStore( '{"ok":false,"error":"invalid sizes"}', 400)
    }
    return saveFavoritesFromList(ids, sizes)
}

def saveFavoritesFromList(ids, sizes = null) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def valid = validFavoriteIdSet()
    def validated = []
    def seen = new HashSet()
    for (item in ids) {
        def key
        try {
            key = (item instanceof Number) ? item.longValue().toString() : item.toString().trim()
        } catch (e) { continue }
        if (!key || !valid.contains(key)) continue
        if (seen.contains(key)) continue
        seen.add(key)
        validated << key.toLong()
    }
    state.favorites = validated.join(",")

    // Persist only non-default, valid preset sizes for retained favorites.
    def validSizes = new HashSet(["full", "square", "wide", "tall", "standard", "compact"])
    def validatedSet = new HashSet(validated.collect { it.toString() })
    def nextSizes = [:]
    if (sizes != null) {
        for (entry in sizes) {
            def idKey = String.valueOf(entry.key)
            def val = String.valueOf(entry.value)
            if (!validatedSet.contains(idKey)) continue
            if (!validSizes.contains(val)) continue
            nextSizes[idKey] = val
        }
        state.favoriteSizesJson = groovy.json.JsonOutput.toJson(nextSizes)
    } else {
        // Older client (GET fallback or omitted sizes): preserve retained, prune removed.
        def prev = parseFavoriteSizesState()
        for (entry in prev) {
            def idKey = String.valueOf(entry.key)
            if (validatedSet.contains(idKey)) nextSizes[idKey] = String.valueOf(entry.value)
        }
        state.favoriteSizesJson = groovy.json.JsonOutput.toJson(nextSizes)
    }

    // Preserve embed slots when device favorites change from older clients.
    def layout = replaceDeviceSlotsInLayout(validated)

    def out = new StringBuilder()
    out << "{\"ok\":true,\"ids\":["
    boolean first = true
    for (id in validated) {
        if (!first) out << ","; first = false
        out << id
    }
    out << "],\"sizes\":"
    out << (state.favoriteSizesJson ? state.favoriteSizesJson.toString() : "{}")
    out << ",\"favoritesLayout\":["
    first = true
    for (key in layout) {
        if (!first) out << ","; first = false
        out << jsonStr(key)
    }
    out << "],\"embedCards\":["
    first = true
    for (card in parseEmbedCardsState()) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
        out << ",\"title\":" << jsonStr(card.title)
        out << ",\"url\":" << jsonStr(card.url)
        out << ",\"size\":" << jsonStr(card.size) << "}"
    }
    out << "],\"timeCards\":["
    first = true
    for (card in parseTimeCardsState()) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
        out << ",\"style\":" << jsonStr(card.style)
        out << ",\"size\":" << jsonStr(card.size) << "}"
    }
    out << "]}"
    return renderJsonNoStore( withAuthJson(out.toString()), 200)
}

// ===========================================================================
// Scheduler
// ===========================================================================
// Schedules are stored as a JSON map id->schedule in state.schedulesJson.
// One shared handler `scheduledJobHandler(data)` runs each job, identified by
// the schedule id carried in the `data` map. `rebuildScheduledJobs()` is the
// single source of truth that applies state to the Hubitat scheduler; it is
// called by every mutating endpoint and by the periodic cleanup job.
// ===========================================================================

def parseSchedulesMap() {
    if (!state.schedulesJson) return [:]
    try {
        return new groovy.json.JsonSlurper().parseText(state.schedulesJson.toString()) ?: [:]
    } catch (e) {
        return [:]
    }
}

def saveSchedulesMap(map) {
    state.schedulesJson = groovy.json.JsonOutput.toJson(map ?: [:])
}

def scheduleNewId() {
    return "sc-" + now() + "-" + Math.abs(new Random().nextInt() % 100000)
}

// Stable cron string for daily/weekly clock-time triggers.
// kind: "daily" or "weekly"; days: list of 3-letter upper-case day names (["MON","WED"])
// time: "HH:MM" (24h)
def scheduleCronForTrigger(kind, time, days) {
    def parts = time?.toString()?.split(":")
    if (!parts || parts.length < 2) return null
    def hh = parts[0]?.trim()
    def mm = parts[1]?.trim()
    try { hh.toInteger(); mm.toInteger() } catch (e) { return null }
    def dow
    if (kind == "weekly" && days instanceof List && days) {
        dow = days.collect { it?.toString()?.trim()?.toUpperCase() }.findAll { it }.join(",")
        if (!dow) dow = "*"
    } else {
        dow = "?"
    }
    // sec min hour dom mon dow year
    return "0 ${mm} ${hh} ? * ${dow} *".toString()
}

// when: "clock" | "sunrise" | "sunset"; offsetMin: minutes before (−) or after (+) sun event
def scheduleTriggerWhen(tr) {
    def w = tr?.when?.toString()?.trim()?.toLowerCase()
    if (w == "sunrise" || w == "sunset") return w
    return "clock"
}

def scheduleOffsetMin(tr) {
    try {
        return (tr?.offsetMin ?: 0).toInteger()
    } catch (e) {
        return 0
    }
}

def scheduleSunMs(which, offsetMin, forDate) {
    try {
        def opts = [offset: (offsetMin ?: 0) as Integer]
        if (forDate) opts.date = forDate
        def d = (which == "sunrise") ? location.sunrise(opts) : location.sunset(opts)
        return d?.getTime()
    } catch (e) {
        return null
    }
}

def scheduleWeeklyDayNames() {
    return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
}

def scheduleDayMatchesWeekly(tr, cal) {
    def kind = tr?.kind?.toString()
    if (kind != "weekly") return true
    def days = tr?.days
    if (!(days instanceof List) || !days) return false
    int dow = cal.get(Calendar.DAY_OF_WEEK)
    def names = scheduleWeeklyDayNames()
    if (dow < 1 || dow > 7) return false
    return days.contains(names[dow - 1])
}

def scheduleSunNextFire(tr, which, long fromMs) {
    def offsetMin = scheduleOffsetMin(tr)
    def tz = location.timeZone
    def cal = Calendar.getInstance()
    if (tz) cal.setTimeZone(tz)
    cal.setTime(new Date(fromMs + 1000))
    cal.set(Calendar.HOUR_OF_DAY, 0)
    cal.set(Calendar.MINUTE, 0)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    for (int i = 0; i < 370; i++) {
        if (scheduleDayMatchesWeekly(tr, cal)) {
            def sunMs = scheduleSunMs(which, offsetMin, cal.getTime())
            if (sunMs != null && sunMs > fromMs) return sunMs
        }
        cal.add(Calendar.DATE, 1)
    }
    return null
}

def scheduleSunLabel(which, offsetMin) {
    def base = (which == "sunrise") ? "Sunrise" : "Sunset"
    def off = offsetMin ?: 0
    if (off == 0) return base
    if (off > 0) return "${base} +${off}m".toString()
    return "${base} ${off}m".toString()
}

def sunTimesJsonFragment() {
    def rise = null
    def set = null
    try { rise = scheduleSunMs("sunrise", 0, null) } catch (e) {}
    try { set = scheduleSunMs("sunset", 0, null) } catch (e) {}
    def out = new StringBuilder()
    out << ",\"sunTimes\":{"
    out << "\"sunrise\":" << (rise == null ? "null" : rise.toString())
    out << ",\"sunset\":" << (set == null ? "null" : set.toString())
    out << "}"
    return out.toString()
}

def formatSchedClockTime(time24) {
    def t = time24?.toString()?.trim()
    if (!t) return ""
    if (schedulerUse24Hour == true) return t
    try {
        def parts = t.split(":")
        if (parts.size() < 2) return t
        int h = parts[0].toInteger()
        int m = parts[1].toInteger()
        def ap = h < 12 ? "AM" : "PM"
        int h12 = h % 12
        if (h12 == 0) h12 = 12
        return String.format("%d:%02d %s", h12, m, ap)
    } catch (e) {
        return t
    }
}

def formatSchedDateTimeLocal(at) {
    def s = at?.toString()?.trim()
    if (!s) return ""
    if (schedulerUse24Hour == true) return s
    try {
        def iso = s.length() >= 16 ? s.substring(0, 16) : s
        def inFmt = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm")
        def dt = inFmt.parse(iso)
        def outFmt = new java.text.SimpleDateFormat("MMM d, yyyy h:mm a", java.util.Locale.US)
        return outFmt.format(dt)
    } catch (e) {
        return s
    }
}

def scheduleSummary(s) {
    if (!s) return ""
    def tr = s.trigger ?: [:]
    def kind = tr?.kind?.toString()
    switch (kind) {
        case "daily":
            if (scheduleTriggerWhen(tr) != "clock") {
                return "Daily " + scheduleSunLabel(scheduleTriggerWhen(tr), scheduleOffsetMin(tr))
            }
            return "Daily " + formatSchedClockTime(tr?.time ?: "")
        case "weekly":
            def d = (tr?.days instanceof List ? tr.days : []).join(",")
            if (scheduleTriggerWhen(tr) != "clock") {
                return "Weekly " + (d ?: "") + " " + scheduleSunLabel(scheduleTriggerWhen(tr), scheduleOffsetMin(tr))
            }
            return "Weekly " + (d ?: "") + " " + formatSchedClockTime(tr?.time ?: "")
        case "once":
            return "Once " + formatSchedDateTimeLocal(tr?.at ?: "")
        case "mode":
            def m = tr?.mode?.toString() ?: ""
            if (m) return "When mode is " + m
            return "When hub mode changes"
        default:
            return kind ?: ""
    }
}

def schedulerIsEnabled() {
    return schedulerDisabled != true
}

def shutdownScheduler() {
    // Targeted unschedules only — never bare unschedule() (would kill light metering jobs).
    try { unschedule("scheduledJobHandler") } catch (e) {}
    try { unschedule("cleanupSchedules") } catch (e) {}
    try { unschedule("schedulerMidnightRearm") } catch (e) {}
}

def guardSchedulerEnabled() {
    if (schedulerIsEnabled()) return true
    renderJsonNoStore('{"ok":false,"error":"scheduler disabled"}', 403)
    return false
}

def schedulesJsonFragment() {
    if (!schedulerIsEnabled()) return ',"schedules":[]'
    def map = parseSchedulesMap()
    def out = new StringBuilder()
    out << ",\"schedules\":["
    boolean first = true
    def ids = []
    try { ids = map.keySet().sort { a, b -> a.toString() <=> b.toString() } } catch (e) {}
    for (id in ids) {
        def s = map[id]
        if (!s) continue
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(id.toString())
        out << ",\"name\":" << jsonStr(s?.name?.toString() ?: "")
        out << ",\"enabled\":" << (s?.enabled == true ? "true" : "false")
        out << ",\"summary\":" << jsonStr(scheduleSummary(s))
        def lastFired = s?.lastFired
        out << ",\"lastFired\":" << (lastFired == null ? "null" : lastFired.toString())
        def nextFire = s?.nextFire
        out << ",\"nextFire\":" << (nextFire == null ? "null" : nextFire.toString())
        out << ",\"trigger\":" << groovy.json.JsonOutput.toJson(s?.trigger ?: [:])
        out << ",\"action\":" << groovy.json.JsonOutput.toJson(s?.action ?: [:])
        out << ",\"onlyInModes\":["
        boolean mf = true
        def modeList = (s?.onlyInModes instanceof List) ? s.onlyInModes : []
        for (m in modeList) {
            if (!mf) out << ","; mf = false
            out << jsonStr(m?.toString())
        }
        out << "]"
        out << ",\"ts\":" << (s?.ts == null ? "0" : s.ts.toString())
        out << "}"
    }
    out << "]"
    return out.toString()
}

def initializeScheduler() {
    shutdownScheduler()
    if (!schedulerIsEnabled()) return
    rebuildScheduledJobs()
    try { subscribe(location, "sunriseTime", schedulerSunTimeChanged) } catch (e) {}
    try { subscribe(location, "sunsetTime", schedulerSunTimeChanged) } catch (e) {}
    try { subscribe(location, "mode", schedulerModeChanged) } catch (e) {}
    try { schedule("0 0 0 * * ?", "schedulerMidnightRearm") } catch (e) {}
    try { runEvery5Minutes("cleanupSchedules") } catch (e) {}
}

def schedulerSunTimeChanged(evt) {
    if (!schedulerIsEnabled()) return
    try { rebuildScheduledJobs() } catch (e) { log.warn "Modern Dashboard: sun time re-arm failed: ${e}" }
}

def schedulerMidnightRearm() {
    if (!schedulerIsEnabled()) return
    try { rebuildScheduledJobs() } catch (e) { log.warn "Modern Dashboard: midnight scheduler re-arm failed: ${e}" }
}

def schedulerModeChanged(evt) {
    if (!schedulerIsEnabled()) return
    def newMode = evt?.value?.toString()?.trim()
    if (!newMode) {
        try { newMode = location.mode?.toString()?.trim() } catch (e) {}
    }
    if (!newMode) return
    def map = parseSchedulesMap()
    for (id in map.keySet().toList()) {
        def s = map[id]
        if (!s || s?.enabled != true) continue
        if (s?.trigger?.kind?.toString() != "mode") continue
        if (s?.trigger?.mode?.toString() != newMode) continue
        try {
            scheduledJobHandler([id: id.toString()])
        } catch (e) {
            log.warn "Modern Dashboard: mode schedule ${id} failed: ${e}"
        }
    }
}

def rebuildScheduledJobs() {
    if (!schedulerIsEnabled()) return
    try { unschedule("scheduledJobHandler") } catch (e) {}
    def map = parseSchedulesMap()
    def now = now()
    def updated = false
    int registered = 0
    for (id in map.keySet().toList()) {
        def s = map[id]
        if (!s) continue
        def enabled = (s?.enabled == true)
        def tr = s?.trigger ?: [:]
        def kind = tr?.kind?.toString()
        def nextFire = null
        if (enabled) {
            try {
                if (kind == "daily" || kind == "weekly") {
                    def when = scheduleTriggerWhen(tr)
                    if (when == "clock") {
                        def cron = scheduleCronForTrigger(kind, tr?.time, tr?.days)
                        if (cron) {
                            schedule(cron, "scheduledJobHandler", [data: [id: id.toString()], overwrite: false])
                            registered++
                            def nf = cronNextFire(cron, now)
                            if (nf != null) nextFire = nf
                        }
                    } else {
                        def nf = scheduleSunNextFire(tr, when, now)
                        if (nf != null && nf > now) {
                            runOnce(new Date(nf), "scheduledJobHandler", [data: [id: id.toString()]])
                            registered++
                            nextFire = nf
                        }
                    }
                } else if (kind == "once") {
                    def atMs = scheduleOnceToMs(tr?.at)
                    if (atMs != null && atMs > now) {
                        runOnce(new Date(atMs), "scheduledJobHandler", [data: [id: id.toString()]])
                        registered++
                        nextFire = atMs
                    } else if (atMs != null && atMs <= now) {
                        // past one-time — will be removed by cleanupSchedules shortly
                        nextFire = null
                    }
                } else if (kind == "mode") {
                    nextFire = null
                }
            } catch (e) {
                log.warn "Modern Dashboard: schedule ${id} register failed: ${e}"
            }
        }
        if (s.nextFire != nextFire) {
            s.nextFire = nextFire
            updated = true
        }
    }
    if (updated) saveSchedulesMap(map)
    logDbg("scheduler rebuild — ${registered} jobs")
}

def scheduleOnceToMs(at) {
    if (at == null) return null
    try {
        String v = at.toString()
        // Accept "yyyy-MM-ddTHH:mm" or "yyyy-MM-ddTHH:mm:ss"
        if (v.length() >= 16) {
            def tz = location.timeZone
            def fmt = new java.text.SimpleDateFormat(v.length() >= 19 ? "yyyy-MM-dd'T'HH:mm:ss" : "yyyy-MM-dd'T'HH:mm")
            if (tz) fmt.setTimeZone(tz)
            return fmt.parse(v).getTime()
        }
    } catch (e) {}
    return null
}

def scheduledJobHandler(data) {
    if (!schedulerIsEnabled()) return
    def id = data?.id?.toString()
    if (!id) return
    def map = parseSchedulesMap()
    def s = map[id]
    if (!s) return
    if (s?.enabled != true) return
    def kind = s?.trigger?.kind?.toString()
    // Mode condition applies to time-based schedules only (not mode triggers)
    if (kind != "mode") {
        def onlyInModes = s?.onlyInModes
        if (onlyInModes instanceof List && onlyInModes) {
            def cur = ""
            try { cur = location.mode?.toString() ?: "" } catch (e) {}
            def ok = false
            for (m in onlyInModes) { if (m?.toString() == cur) { ok = true; break } }
            if (!ok) return
        }
    }
    // Mark last fired
    s.lastFired = now()
    // Run actions
    try {
        runScheduleAction(s?.action)
    } catch (e) {
        log.warn "Modern Dashboard: schedule ${id} action failed: ${e}"
    }
    // One-time schedules self-delete after firing
    if (kind == "once") {
        map.remove(id)
        saveSchedulesMap(map)
        return
    }
    // Mode triggers are event-driven — nothing to re-arm
    if (kind == "mode") {
        saveSchedulesMap(map)
        return
    }
    saveSchedulesMap(map)
    try {
        def tr = s?.trigger
        if (kind == "daily" || kind == "weekly") {
            def when = scheduleTriggerWhen(tr)
            if (when == "clock") {
                def cron = scheduleCronForTrigger(kind, tr?.time, tr?.days)
                if (cron) {
                    def nf = cronNextFire(cron, now())
                    s.nextFire = nf
                    saveSchedulesMap(map)
                }
            } else {
                saveSchedulesMap(map)
                rebuildScheduledJobs()
                return
            }
        }
    } catch (e) {}
}

def runScheduleAction(action) {
    if (!action) return
    def target = action?.target?.toString()
    switch (target) {
        case "lights":
            runScheduleLightAction(action)
            break
        case "outlets":
            runScheduleOnOffAction(action, outletSwitches)
            break
        case "thermostats":
            runScheduleThermostatAction(action)
            break
        case "hubMode":
            def mode = action?.mode?.toString()?.trim()
            if (mode) {
                try { location.setMode(mode) } catch (e) { log.warn "Modern Dashboard: hub mode failed — ${mode}: ${e}" }
            }
            break
        default:
            break
    }
}

def runScheduleOnOffAction(action, deviceList) {
    def states = action?.states
    if (!(states instanceof List)) return
    for (st in states) {
        def id = st?.id
        if (id == null) continue
        def dev = deviceList?.find { it.id.toString() == id.toString() }
        if (!dev) continue
        try {
            if (st?.on == true) dev.on() else dev.off()
        } catch (e) {
            log.warn "Modern Dashboard: schedule on/off cmd failed for ${id}: ${e}"
        }
    }
}

def runScheduleLightAction(action) {
    def states = action?.states
    if (!(states instanceof List)) return
    for (st in states) {
        def id = st?.id
        if (id == null) continue
        def dev = lights?.find { it.id.toString() == id.toString() }
        if (!dev) continue
        try {
            def on = (st?.on == true)
            if (on) {
                dev.on()
                def lvl = st?.level
                if (lvl != null && dev.hasCapability("SwitchLevel")) {
                    int l = Math.max(0, Math.min(100, lvl.toInteger()))
                    dev.setLevel(l)
                }
                def ct = st?.ct
                if (ct != null && dev.hasCapability("ColorTemperature")) {
                    int k = Math.max(2500, Math.min(6000, ct.toInteger()))
                    try { dev.setColorTemperature(k) } catch (e) {
                        log.warn "Modern Dashboard: schedule light CT failed for ${id}: ${e}"
                    }
                }
            } else {
                dev.off()
            }
        } catch (e) {
            log.warn "Modern Dashboard: schedule light cmd failed for ${id}: ${e}"
        }
    }
}

def runScheduleThermostatAction(action) {
    def ids = action?.devices
    if (!(ids instanceof List)) return
    def mode = action?.mode?.toString()
    def heat = action?.heat
    def cool = action?.cool
    def fanMode = action?.fanMode?.toString()
    for (id in ids) {
        def dev = thermostats?.find { it.id.toString() == id.toString() }
        if (!dev) continue
        try {
            if (mode) {
                try { dev.setThermostatMode(mode) } catch (e) {
                    log.warn "Modern Dashboard: schedule tstat mode failed for ${id}: ${e}"
                }
            }
            if (heat != null) {
                try { dev.setHeatingSetpoint(heat.toInteger()) } catch (e) {
                    log.warn "Modern Dashboard: schedule tstat heat failed for ${id}: ${e}"
                }
            }
            if (cool != null) {
                try { dev.setCoolingSetpoint(cool.toInteger()) } catch (e) {
                    log.warn "Modern Dashboard: schedule tstat cool failed for ${id}: ${e}"
                }
            }
            if (fanMode && (dev.hasCapability("ThermostatFanMode") || dev.hasAttribute("thermostatFanMode"))) {
                try { dev.setFanMode(fanMode) } catch (e) {
                    log.warn "Modern Dashboard: schedule tstat fan failed for ${id}: ${e}"
                }
            }
        } catch (e) {
            log.warn "Modern Dashboard: schedule tstat cmd failed for ${id}: ${e}"
        }
    }
}

def cleanupSchedules() {
    if (!schedulerIsEnabled()) return
    def map = parseSchedulesMap()
    def now = now()
    def changed = false
    for (id in map.keySet().toList()) {
        def s = map[id]
        if (!s) continue
        def kind = s?.trigger?.kind?.toString()
        if (kind == "once") {
            def atMs = scheduleOnceToMs(s?.trigger?.at)
            if (atMs != null && atMs < now) {
                map.remove(id)
                changed = true
            }
        }
    }
    if (changed) saveSchedulesMap(map)
    rebuildScheduledJobs()
}

// --- endpoints ---

def schedulesGet() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    if (!guardSchedulerEnabled()) return
    return renderJsonNoStore( withAuthJson(groovy.json.JsonOutput.toJson([ok: true, schedules: schedulesListForClient()])), 200)
}

def schedulesListForClient() {
    def map = parseSchedulesMap()
    def out = []
    def ids = []
    try { ids = map.keySet().sort { a, b -> a.toString() <=> b.toString() } } catch (e) {}
    for (id in ids) {
        def s = map[id]
        if (!s) continue
        out << [
            id: id.toString(),
            name: s?.name?.toString() ?: "",
            enabled: (s?.enabled == true),
            summary: scheduleSummary(s),
            lastFired: s?.lastFired,
            nextFire: s?.nextFire,
            trigger: s?.trigger,
            action: s?.action,
            onlyInModes: (s?.onlyInModes instanceof List) ? s.onlyInModes : [],
            ts: s?.ts
        ]
    }
    return out
}

def schedulesNormalizePayload(body) {
    def s = [:]
    def id = body?.id?.toString()?.trim()
    if (id) s.id = id
    s.name = body?.name?.toString()?.trim() ?: ""
    s.enabled = (body?.enabled == true)
    // trigger
    def tr = [:]
    tr.kind = body?.trigger?.kind?.toString()?.trim() ?: "daily"
    if (tr.kind == "daily" || tr.kind == "weekly") {
        tr.when = body?.trigger?.when?.toString()?.trim()?.toLowerCase() ?: "clock"
        if (tr.when != "sunrise" && tr.when != "sunset") tr.when = "clock"
        if (tr.when == "clock") {
            tr.time = body?.trigger?.time?.toString()?.trim() ?: "00:00"
            tr.offsetMin = 0
        } else {
            tr.time = ""
            try {
                tr.offsetMin = Math.max(-720, Math.min(720, (body?.trigger?.offsetMin ?: 0).toInteger()))
            } catch (e) {
                tr.offsetMin = 0
            }
        }
        if (tr.kind == "weekly") {
            def days = body?.trigger?.days
            if (days instanceof List) {
                tr.days = days.collect { it?.toString()?.trim()?.toUpperCase() }.findAll { it }
            } else {
                tr.days = []
            }
        }
    } else if (tr.kind == "once") {
        tr.at = body?.trigger?.at?.toString()?.trim() ?: ""
    } else if (tr.kind == "mode") {
        tr.mode = body?.trigger?.mode?.toString()?.trim() ?: ""
    }
    s.trigger = tr
    // optional mode condition (time-based schedules only)
    if (tr.kind == "mode") {
        s.onlyInModes = []
    } else {
        def modes = body?.onlyInModes
        if (modes instanceof List) {
            s.onlyInModes = modes.collect { it?.toString() }.findAll { it }
        } else {
            s.onlyInModes = []
        }
    }
    // action
    def ac = [:]
    ac.target = body?.action?.target?.toString()?.trim() ?: "lights"
    if (ac.target == "lights" || ac.target == "outlets") {
        def states = body?.action?.states
        if (states instanceof List) {
            ac.states = states.collect {
                def o = [id: it?.id]
                o.on = (it?.on == true)
                if (ac.target == "lights") {
                    if (it?.level != null) o.level = it.level
                    if (it?.ct != null) o.ct = it.ct
                }
                o
            }
        } else {
            ac.states = []
        }
    } else if (ac.target == "thermostats") {
        def devs = body?.action?.devices
        ac.devices = (devs instanceof List) ? devs.collect { it } : []
        if (body?.action?.mode != null) ac.mode = body.action.mode.toString()
        if (body?.action?.heat != null) ac.heat = body.action.heat
        if (body?.action?.cool != null) ac.cool = body.action.cool
        if (body?.action?.fanMode != null) ac.fanMode = body.action.fanMode.toString()
    } else if (ac.target == "hubMode") {
        ac.mode = body?.action?.mode?.toString()?.trim() ?: ""
    }
    s.action = ac
    s.ts = now()
    return s
}

def schedulesSave() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    if (!guardSchedulerEnabled()) return
    def body = parseRequestJson()
    if (body == null) {
        return renderJsonNoStore( '{"ok":false,"error":"missing body"}', 400)
    }
    def s = schedulesNormalizePayload(body)
    def map = parseSchedulesMap()
    def id = s.id
    if (!id) id = scheduleNewId()
    def existing = map[id]
    if (existing && existing.lastFired != null) s.lastFired = existing.lastFired
    map[id] = s
    saveSchedulesMap(map)
    rebuildScheduledJobs()
    def out = new StringBuilder()
    out << "{\"ok\":true,\"id\":" << jsonStr(id.toString())
    out << ",\"schedules\":" << groovy.json.JsonOutput.toJson(schedulesListForClient())
    out << "}"
    return renderJsonNoStore( withAuthJson(out.toString()), 200)
}

def schedulesDelete() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    if (!guardSchedulerEnabled()) return
    def body = parseRequestJson()
    def id = body?.id?.toString()?.trim()
    if (!id) {
        return renderJsonNoStore( '{"ok":false,"error":"missing id"}', 400)
    }
    def map = parseSchedulesMap()
    if (map.containsKey(id)) {
        map.remove(id)
        saveSchedulesMap(map)
    }
    rebuildScheduledJobs()
    def out = new StringBuilder()
    out << "{\"ok\":true,\"id\":" << jsonStr(id.toString())
    out << ",\"schedules\":" << groovy.json.JsonOutput.toJson(schedulesListForClient())
    out << "}"
    return renderJsonNoStore( withAuthJson(out.toString()), 200)
}

def schedulesToggle() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    if (!guardSchedulerEnabled()) return
    def body = parseRequestJson()
    def id = body?.id?.toString()?.trim()
    if (!id) {
        return renderJsonNoStore( '{"ok":false,"error":"missing id"}', 400)
    }
    def map = parseSchedulesMap()
    def s = map[id]
    if (!s) {
        return renderJsonNoStore( '{"ok":false,"error":"not found"}', 404)
    }
    s.enabled = (s.enabled != true)
    map[id] = s
    saveSchedulesMap(map)
    rebuildScheduledJobs()
    def out = new StringBuilder()
    out << "{\"ok\":true,\"id\":" << jsonStr(id.toString())
    out << ",\"enabled\":" << (s.enabled == true ? "true" : "false")
    out << ",\"schedules\":" << groovy.json.JsonOutput.toJson(schedulesListForClient())
    out << "}"
    return renderJsonNoStore( withAuthJson(out.toString()), 200)
}

def schedulesTest() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    if (!guardSchedulerEnabled()) return
    def body = parseRequestJson()
    def id = body?.id?.toString()?.trim()
    if (!id) {
        return renderJsonNoStore( '{"ok":false,"error":"missing id"}', 400)
    }
    def map = parseSchedulesMap()
    def s = map[id]
    if (!s) {
        return renderJsonNoStore( '{"ok":false,"error":"not found"}', 404)
    }
    try {
        runScheduleAction(s?.action)
    } catch (e) {
        log.warn "Modern Dashboard: schedule ${id} test failed: ${e}"
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr(e.message ?: e.toString())}}".toString(), 500)
    }
    return renderJsonNoStore( withAuthJson('{"ok":true}'), 200)
}

// --- cron next-fire helper (7-field Quartz: sec min hour dom mon dow year) ---
// Returns next fire time in ms after `fromMs`, or null if unparseable.
def cronNextFire(String cronExpr, long fromMs) {
    if (cronExpr == null) return null
    def f = cronExpr.toString().split("\\s+")
    if (f.length < 6) return null
    def sec = cronFieldValues(f[0], 0, 59)
    def min = cronFieldValues(f[1], 0, 59)
    def hour = cronFieldValues(f[2], 0, 23)
    def dom = cronFieldValues(f[3], 1, 31)
    def mon = cronFieldValues(f[4], 1, 12)
    def dow = cronFieldValues(f[5], 1, 7)  // Quartz: 1=SUN .. 7=SAT
    if (sec == null || min == null || hour == null || dom == null || mon == null || dow == null) return null
    def tz = location.timeZone
    def cal = new GregorianCalendar()
    if (tz) cal.setTimeZone(tz)
    cal.setTime(new Date(fromMs + 1000))
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    // Cap iterations to ~2 years (2*366*24*60)
    for (int i = 0; i < 1750000; i++) {
        int s = cal.get(Calendar.SECOND)
        int mi = cal.get(Calendar.MINUTE)
        int h = cal.get(Calendar.HOUR_OF_DAY)
        int d = cal.get(Calendar.DAY_OF_MONTH)
        int mo = cal.get(Calendar.MONTH) + 1
        int dw = cal.get(Calendar.DAY_OF_WEEK)  // 1=SUN .. 7=SAT
        if (sec.contains(s) && min.contains(mi) && hour.contains(h) && mon.contains(mo) && dom.contains(d) && dow.contains(dw)) {
            return cal.getTimeInMillis()
        }
        cal.add(Calendar.SECOND, 1)
    }
    return null
}

// Parse a single cron field into a Set of integers. Supports "*", numbers, ranges "a-b",
// steps "a/b" and "*/b", and lists "a,b,c". '?' is treated as '*'.
def cronFieldValues(String field, int lo, int hi) {
    def out = new HashSet()
    if (field == null) return null
    String f = field.trim()
    if (f == "?" || f == "*") {
        for (int v = lo; v <= hi; v++) out.add(v)
        return out
    }
    for (String part : f.split(",")) {
        String p = part.trim()
        if (!p) continue
        int step = 1
        int slash = p.indexOf("/")
        if (slash >= 0) {
            try { step = Integer.parseInt(p.substring(slash + 1).trim()) } catch (e) { return null }
            if (step <= 0) return null
            p = p.substring(0, slash).trim()
        }
        int plo = lo
        int phi = hi
        if (p == "*" || p == "?") {
            // range stays lo..hi
        } else {
            int dash = p.indexOf("-")
            if (dash >= 0) {
                try {
                    plo = Integer.parseInt(p.substring(0, dash).trim())
                    phi = Integer.parseInt(p.substring(dash + 1).trim())
                } catch (e) { return null }
            } else {
                try { plo = Integer.parseInt(p); phi = plo } catch (e) { return null }
            }
        }
        if (plo < lo) plo = lo
        if (phi > hi) phi = hi
        for (int v = plo; v <= phi; v += step) out.add(v)
    }
    if (out.isEmpty()) return null
    return out
}
