// Modern Dashboard v0.4.64
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
@Field private static final String MLD_DEPLOYED_VERSION = "0.4.64"

definition(
    name: "Modern Dashboard",
    namespace: "mDash",
    author: "Ephrayim (evdev)",
    description: "Control-first Hubitat dashboard: select your devices and you're done. Bulk room/house lights and multi-thermostat control. Installable PWA, built-in remote scheduler (no Hubitat login), runs entirely on your hub.",
    category: "My Apps",
    iconUrl: "",
    iconX2Url: "",
    iconX3Url: "",
    oauth: [displayName: "Modern Dashboard", displayLink: ""],
    singleThreaded: true
)

preferences {
    page(name: "mainPage", uninstall: true, install: true)
    page(name: "schedImportPage", title: "Import Simple Automation Rules", install: false, uninstall: false)
    page(name: "schedUploadPage", title: "Upload schedules", install: false, uninstall: false)
    page(name: "triggersPage", title: "Tablet triggers", install: false, uninstall: false)
}

def mainPage() {
    if (!state.accessToken) { createAccessToken() }
    def assetsOk = assetsPresent()
    def localUrl = dashboardUrl(true)
    def cloudUrl = dashboardUrl(false)
    def lightsCount = devicePickerCount(lights) + devicePickerCount(outletSwitches)
    def climateCount = devicePickerCount(thermostats) + devicePickerCount(tempSensors)
    def shadesMediaCount = devicePickerCount(windowShades) + devicePickerCount(windowBlinds) +
        devicePickerCount(windowShadesLevel) + devicePickerCount(ceilingFans) +
        devicePickerCount(musicPlayers) + devicePickerCount(audioSpeakers) +
        devicePickerCount(mediaTransportPlayers)
    def locksCount = devicePickerCount(locks) + devicePickerCount(garageDoors)
    def sensorsCount = devicePickerCount(motionSensors) + devicePickerCount(shockSensors) +
        devicePickerCount(contactSensors) + devicePickerCount(waterSensors) +
        devicePickerCount(presenceSensors) + devicePickerCount(humiditySensors) +
        devicePickerCount(illuminanceSensors) + devicePickerCount(smokeSensors) +
        devicePickerCount(genericSensors) + devicePickerCount(valves)
    def camerasCount = devicePickerCount(cameras) + devicePickerCount(rtspCameras)
    def htmlTilesCount = devicePickerCount(htmlTileDevices)
    def notifCount = notificationsConfiguredCount()
    dynamicPage(name: "mainPage", uninstall: true, install: true) {
        section("Get started", hideable: true, hidden: introSectionCollapsed()) {
            paragraph mldStepList([
                "Select your <b>lights</b> below — that's enough to start. Rooms and layout come from Hubitat automatically.",
                "Open the <b>Cloud</b> link and install on your phone (Android: Install app · iOS: Add to Home Screen).",
                "Everything else — sensors, locks, cameras, scheduler — is optional. Expand a section when you need it."
            ])
            paragraph mldTipCallout(
                "<b>Control-first:</b> bulk room/house lights and multi-thermostat control. " +
                "<b>Hub-only:</b> UI and API run on your hub — no Maker API." +
                (schedulerDisabled != true ? " <b>Scheduler:</b> manage schedules from the dashboard, including remotely." : "")
            )
            paragraph "<small>Version 0.4.64 · Ephrayim (evdev) · Apache License 2.0 · <a href='https://github.com/evdev/hubitat-modern-dashboard' target='_blank'>Source</a></small>"
        }
        if (assetsOk) {
            section("Dashboard links") {
                paragraph mldLinkCard("Local", "On your home network — fastest at home", localUrl, "info")
                paragraph mldLinkCard("Cloud", "Works anywhere — install the phone app from this link", cloudUrl, "warm")
                paragraph mldTipCallout(
                    "Open the <b>cloud</b> link on your phone to install as a PWA " +
                    "(Android Chrome: Install app · iOS Safari: Add to Home Screen)."
                )
            }
        } else {
            section("Required: upload dashboard files") {
                def names = listLocalFileNames()
                def need = requiredAssetFiles()
                def missing = need.findAll { n -> !fileNamePresent(names, n) }
                paragraph mldCallout("warning", "Dashboard files missing",
                    "Upload these files via <b>Settings → File Manager</b> (root folder, exact names). " +
                    "Easiest: install/update via <b>Hubitat Package Manager</b>.")
                paragraph "<ul><li><code>mld-index.html</code></li><li><code>mld-app.css</code></li><li><code>mld-app-post.css</code></li><li><code>mld-app.js</code></li><li><code>mld-app-core.js</code></li><li><code>mld-app-post.js</code></li><li><code>mld-app-post2.js</code></li><li><code>mld-app-post3.js</code></li><li><code>mld-manifest.webmanifest</code></li><li><code>mld-sw.js</code></li><li><code>mld-icon-192.b64</code></li><li><code>mld-icon-512.b64</code></li></ul>"
                if (names) {
                    def mld = names.findAll { it?.contains("mld-") }
                    paragraph "<small>Files seen on hub: ${mld ? mld.join(', ') : '(none matching mld-*)'}</small>"
                }
                if (missing) {
                    paragraph mldCallout("danger", "Still missing", htmlEsc(missing.join(', ')))
                }
                if (!hubSecurity) {
                    paragraph mldCallout("warning", "Hub Login Security?",
                        "If enabled on your hub, expand <b>Hub file access</b> below, turn on the toggle, and enter your hub admin username/password (not the optional dashboard password).")
                } else if (!hubCredentials().user || !hubCredentials().pass) {
                    paragraph mldCallout("warning", "Hub file access",
                        "Enter your hub admin username and password below, then press <b>Done</b> again.")
                } else if (state.hubLoginLastOutcome == "rejected") {
                    paragraph mldCallout("danger", "Hub login rejected",
                        "Re-check admin username/password under <b>Hub file access</b> (from <b>Settings → Hub Login Security</b>), re-enter the password, and press <b>Done</b>.")
                } else if (!names) {
                    paragraph mldCallout("warning", "Could not list File Manager",
                        "Upload the <code>mld-*</code> files above. If Hubitat Logs show <code>hub login rejected</code>, re-check credentials; otherwise re-enter the password and press <b>Done</b>.")
                }
            }
        }
        section(sectionTitleWithCount("Lights & outlets", lightsCount)) {
            paragraph mldTipCallout("Rooms and layout are automatic based on your Hubitat room assignments.")
            input "lights", "capability.switch", title: "Select your light devices (switches and dimmers)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "outletSwitches", "capability.switch", title: "Outlets",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "outletsSeparateTab", "bool", title: "Show outlets in separate Outlets tab", defaultValue: false, submitOnChange: true
            paragraph "<small>Outlets may also appear in the lights list. With <b>separate Outlets tab</b> off, outlets show in room cards; when on, they move to the Outlets quick-nav tab. Room On/Off never controls outlets.</small>"
        }
        section(sectionTitleWithCount("Climate", climateCount), hideable: true, hidden: climateSectionCollapsed()) {
            input "thermostats", "capability.thermostat", title: "Select your thermostats",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "thermostatsPopupEnabled", "bool", title: "Show thermostats in dashboard quick menu", defaultValue: true, submitOnChange: true
            input "tempSensors", "capability.temperatureMeasurement", title: "Temperature sensors (display only)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "roomClimateEnabled", "bool", title: "Show temperature and thermostat on room cards",
                defaultValue: true, submitOnChange: true
            paragraph "<small>When <b>quick menu</b> or <b>room cards</b> is off, thermostats and temperature sensors remain available in their other views. Multi-sensors selected under Sensors that report temperature also show on Lights room cards.</small>"
        }
        section(sectionTitleWithCount("Shades, fans & media", shadesMediaCount), hideable: true, hidden: shadesMediaSectionCollapsed()) {
            input "windowShades", "capability.windowShade", title: "Shades & blinds (Window Shade drivers)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "windowBlinds", "capability.windowBlind", title: "Blinds (Window Blind drivers)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "windowShadesLevel", "capability.switchLevel", title: "Shades & blinds (dimmer / Switch Level drivers)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            paragraph mldCallout("warning", "Switch Level list includes lights",
                "Use the first two lists for <b>Window Shade</b> / <b>Window Blind</b> drivers. Many motors only advertise <b>Switch Level</b> — pick those in the third list. That list also includes ordinary lights; select <b>shades only</b> and put real lights under Lights.")
            input "ceilingFans", "capability.fanControl", title: "Ceiling fans",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "musicPlayers", "capability.musicPlayer", title: "Music / media players (Sonos, Echo Speaks, AirPlay, …)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "audioSpeakers", "capability.audioVolume", title: "Additional speakers (Chromecast, Google Home, Bluetooth volume, …)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "mediaTransportPlayers", "capability.mediaTransport", title: "Media transport (HomeKit speakers, TVs, …)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            paragraph "<small>The Music tab only lists devices you can control from the dashboard (play/pause/stop or volume). TTS-only Bluetooth speakers are not shown — use Rule Machine to speak or play a track. C-8 Pro <b>BTHome</b> sensors belong under Sensors, not here.</small>"
        }
        section(sectionTitleWithCount("Locks & garage", locksCount), hideable: true, hidden: locksSectionCollapsed()) {
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
        section(sectionTitleWithCount("Sensors", sensorsCount), hideable: true, hidden: sensorsSectionCollapsed()) {
            paragraph "<small>Sensors appear in the Sensors popup. Multi-sensors may overlap with other pickers; temperature + humidity or illuminance merge into one tile. Alert types (motion, contact, etc.) stay primary with other readings in the footer. C-8 Pro <b>BTHome</b> / Shelly BLU devices use the matching typed lists (motion, contact, temperature, …); occupancy-only and button devices go under <b>Other / generic sensors</b>.</small>"
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
        section(sectionTitleWithCount("Cameras", camerasCount), hideable: true, hidden: camerasSectionCollapsed()) {
            paragraph "<small>Select <b>go2rtc Camera</b> and/or <b>native RTSP Camera Stream</b> devices. Requires <b>Enable tabs</b> and the <b>local hub dashboard URL</b>. go2rtc tiles use the sub stream with an <b>HD</b> toggle; native RTSP uses the hub MJPEG proxy (C-8 Pro).</small>"
            input "cameras", "capability.imageCapture", title: "Cameras (go2rtc)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            input "rtspCameras", "device.RTSPCameraStream", title: "Cameras (native RTSP)",
                multiple: true, required: false, showFilter: true, submitOnChange: true
        }
        section(sectionTitleWithCount("HTML tiles", htmlTilesCount), hideable: true, hidden: htmlTilesSectionCollapsed()) {
            paragraph "<small>Select devices that publish dashboard HTML (for example <b>Tile Builder Storage Driver</b>, vehicle status drivers, or weather tiles). On the Favorites tab, use <b>Add tile → HTML</b> to choose which attributes appear. Attribute names are detected automatically.</small>"
            input "htmlTileDevices", "capability.*", title: "HTML source devices",
                multiple: true, required: false, showFilter: true, submitOnChange: true
        }
        section(sectionTitleWithCount("Notifications", notifCount), hideable: true, hidden: notificationsSectionCollapsed()) {
            paragraph "<small>Rule Machine and other apps can send notifications to <b>mDash Notifications</b> devices. <b>Popup</b> devices show full-screen banners; <b>tile</b> devices appear in Favorites notification tiles.</small>"
            def notifChild = getNotificationChildDevice()
            if (notifChild) {
                paragraph mldCallout("success", "Popup notification device",
                    "${htmlEsc(notifChild.displayName)} (created by this app).")
            } else {
                input "notifDeviceLabel", "string", title: "Name for new popup mDash Notifications device",
                    defaultValue: "Dashboard Notifications", required: false
                input name: "btnCreateNotifDevice", type: "button", title: "Create popup mDash Notifications device"
                paragraph "<small>Requires the <b>mDash Notifications</b> driver from this package (installed automatically via HPM). The device can be renamed under <b>Devices</b>; deleting it only removes it from the hub — use <b>Create</b> again to add a new one.</small>"
                if (state.notifDeviceCreateError) {
                    paragraph mldCallout("danger", "Could not create popup device",
                        htmlEsc(state.notifDeviceCreateError.toString()))
                }
                if (state.notifDeviceCreateOk) {
                    paragraph mldCallout("success", "Created popup device",
                        htmlEsc(state.notifDeviceCreateOk.toString()))
                }
            }
            input "notificationDevices", "capability.notification", title: "Popup notification devices",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            def tileNotifChild = getTileNotificationChildDevice()
            if (tileNotifChild) {
                paragraph mldCallout("success", "Tile notification device",
                    "${htmlEsc(tileNotifChild.displayName)} (created by this app).")
            } else {
                input "tileNotifDeviceLabel", "string", title: "Name for new tile mDash Notifications device",
                    defaultValue: "Dashboard Notifications (Tile)", required: false
                input name: "btnCreateTileNotifDevice", type: "button", title: "Create tile mDash Notifications device"
                paragraph "<small>Same driver as popup; this device is selected for <b>tile</b> messages only. Rename or delete it under <b>Devices</b> like any other device.</small>"
                if (state.tileNotifDeviceCreateError) {
                    paragraph mldCallout("danger", "Could not create tile device",
                        htmlEsc(state.tileNotifDeviceCreateError.toString()))
                }
                if (state.tileNotifDeviceCreateOk) {
                    paragraph mldCallout("success", "Created tile device",
                        htmlEsc(state.tileNotifDeviceCreateOk.toString()))
                }
            }
            input "tileNotificationDevices", "capability.notification", title: "Tile notification devices",
                multiple: true, required: false, showFilter: true, submitOnChange: true
            paragraph "<small>Each <b>Create</b> button adds an mDash Notifications child and selects it in the matching picker. Assign existing devices to either list. A device in both lists is treated as popup-only.</small>"
        }
        section("Dashboard triggers", hideable: true, hidden: triggersSectionCollapsed()) {
            paragraph "<small>Make open tablets react when something happens at home — show a camera, play a sound, leave a short message. Turn triggers on, pick the devices you want to use, then <b>Set up tablet triggers…</b>. An optional switch can silence sounds for quiet hours (camera and text still run). Each tablet’s own sound preference still applies.</small>"
            input "triggersEnabled", "bool", title: "Enable tablet triggers", defaultValue: false, submitOnChange: true
            if (triggersEnabled == true) {
                input "alertsArmSwitch", "capability.switch", title: "Quiet-hours switch (ON = sounds allowed)",
                    multiple: false, required: false
                def armSw = alertsArmSwitch
                if (armSw) {
                    def armOn = safeCurrent(armSw, "switch")
                    paragraph "<small><b>Right now:</b> ${htmlEsc(armSw.displayName)} is <b>${armOn == "on" ? "allowing sounds" : "silencing sounds"}</b>. Flip it from Rule Machine, Mode Manager, or the dashboard overflow menu.</small>"
                } else {
                    paragraph "<small>Optional. Without a switch, trigger sounds play on every tablet. When a switch is selected and <b>off</b>, sounds are silenced; cameras and messages still run.</small>"
                }
                def overlayDurOpts = overlayDurationChoices()
                input "triggerOverlaySec", "enum", title: "Default how long cameras stay up",
                    options: overlayDurOpts,
                    defaultValue: "60", required: false
                input "triggerContactDevices", "capability.contactSensor", title: "Doors & windows you might use",
                    multiple: true, required: false, showFilter: true
                input "triggerMotionDevices", "capability.motionSensor", title: "Motion sensors you might use",
                    multiple: true, required: false, showFilter: true
                input "triggerButtonDevices", "capability.pushableButton", title: "Buttons & doorbells you might use",
                    multiple: true, required: false, showFilter: true
                href "toTriggers", title: "Set up tablet triggers…",
                    description: triggerRulesSummary(),
                    page: "triggersPage"
                input name: "btnTriggerTest", type: "button", title: "Send a test to open dashboards"
                paragraph "<small>Test uses the default camera duration above (press <b>Done</b> first if you changed it). It does not use a trigger’s own duration.</small>"
                if (state.triggerTestOk) {
                    paragraph mldCallout("success", "Test", htmlEsc(state.triggerTestOk.toString()))
                }
                if (state.triggerTestError) {
                    paragraph mldCallout("danger", "Test failed", htmlEsc(state.triggerTestError.toString()))
                }
            }
        }
        section("Dashboard options") {
            input "dashboardName", "string", title: "Dashboard name", defaultValue: "mDash", required: false
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
        }
        section("Dashboard options — advanced", hideable: true, hidden: true) {
            input "pollSec", "number", title: "Refresh interval (seconds)", defaultValue: 5, required: false, range: "2..60"
            input "enableWs", "bool", title: "Enable real-time updates on local network (eventsocket)", defaultValue: true, required: false
            input "hubModePopupEnabled", "bool", title: "Show hub mode in dashboard quick menu", defaultValue: true, submitOnChange: true
            input "scenesPopupEnabled", "bool", title: "Show scenes in dashboard quick menu", defaultValue: true, submitOnChange: true
            paragraph "<small>Hub mode and scene toggles only hide quick-nav buttons; scheduler and other features still use them.</small>"
            input "schedulerDisabled", "bool",
                title: "Hide scheduler (also stops schedules from running)",
                defaultValue: false, submitOnChange: true
            if (schedulerDisabled != true) {
                input "schedulerUse24Hour", "bool", title: "Use 24-hour time in scheduler", defaultValue: false
                input "mcpSchedulesEnabled", "bool",
                    title: "Allow an AI assistant to create schedules",
                    defaultValue: false, submitOnChange: true
                if (mcpSchedulesEnabled == true) {
                    paragraph "<small>The assistant can create, change, and delete schedules. It does not ask for the dashboard password. Use the link below from an assistant on your home network. Away from home, copy the schedule schema and upload the file.</small>"
                    paragraph mldLinkCard("Local assistant", "On your home network", mcpUrl(), "info")
                }
                href "toSchedUpload", title: "Upload schedules…",
                    description: "Schema and device list for an assistant, then paste the JSON it returns",
                    page: "schedUploadPage"
                href "toSchedImport", title: "Import Simple Automation Rules…",
                    description: "Paste a Hubitat App Export to create mDash schedules",
                    page: "schedImportPage"
            }
            if (holidayFilePresent()) {
                paragraph "<small>When scheduler is hidden, no schedules run, including Shabbat and holiday schedules. Saved schedules are kept if you turn it back on.</small>"
            } else {
                paragraph "<small>When scheduler is hidden, no schedules run. Saved schedules are kept if you turn it back on.</small>"
            }
            input "debugLogging", "bool", title: "Enable debug logging", defaultValue: false, submitOnChange: true
            paragraph "<small>Logs command traces to Hubitat Logs for troubleshooting. Auto-disables after 30 minutes. Failures are always logged regardless of this setting.</small>"
        }
        if (holidayFilePresent()) {
            section("Shabbat & holidays") {
                paragraph "<small><b>Enabled.</b> <code>mld-holiday.js</code> is in File Manager, so Shabbat &amp; holidays is on. That file comes from the separate <b>mDash Shabbat and Holidays</b> package in Hubitat Package Manager. This page does not install it.</small>"
                paragraph "<small>If Shabbat and Holiday Scheduler is also installed, turn off its mode switching so the hub is not switched twice.</small>"
            }
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
        section(securitySectionTitle(), hideable: true, hidden: securitySectionCollapsed()) {
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

def schedImportPage() {
    dynamicPage(name: "schedImportPage", title: "Import Simple Automation Rules", install: false, uninstall: false) {
        section("How to export") {
            paragraph "In Hubitat: <b>Apps</b> → gear icon next to <b>Simple Automation Rules</b> (or individual rules) → <b>Export/Import/Clone</b> → export and download the file. Paste the file contents below."
            paragraph "<small>Imports time / sunrise / sunset and <b>Mode Changes</b> (enter mode) rules, including Turn On/Off / Set Level / Set Temperature (CT) on devices in the Lights or Outlets pickers. A Simple Automation “second time” imports as a second schedule named <b>(on)</b> or <b>(off)</b>. Unsupported items are skipped with a reason.</small>"
            paragraph "<small><b>Not imported:</b> device/motion/contact triggers, Mode Transition (from→to), leave-mode offMode pairs, and Toggle — create those manually in the Scheduler if needed.</small>"
        }
        section("Paste export") {
            // Hubitat: updateSetting/clearSetting while an input is visible is often overwritten by the form post.
            // Hide the textarea after import/clear so the empty value sticks.
            if (state.schedImportHidePaste == true) {
                paragraph "<small>Paste cleared. Tap <b>Paste another export</b> to import again.</small>"
                input name: "btnSchedImportClear", type: "button", title: "Paste another export"
            } else {
                input "schedImportPaste", "textarea", title: "Hubitat App Export JSON", required: false, rows: 12, submitOnChange: true
                input name: "btnSchedImportClear", type: "button", title: "Clear paste"
            }
        }

        def preview = schedImportPreviewFromSettings()
        if (state.schedImportHidePaste != true) {
            if (preview.error) {
                section("Error") {
                    paragraph "<b>${htmlEsc(preview.error)}</b>"
                }
            } else if (preview.hasPaste) {
                section("Will import (${preview.ok.size()})") {
                    if (!preview.ok) {
                        paragraph "<small>Nothing to import.</small>"
                    } else {
                        def lines = preview.ok.collect { row ->
                            "<li><b>${htmlEsc(row.name)}</b> — ${htmlEsc(row.summary)}</li>"
                        }.join("")
                        paragraph "<ul>${lines}</ul>"
                    }
                }
                if (preview.skipped) {
                    section("Will skip (${preview.skipped.size()}) — not available in mDash scheduler") {
                        def lines = preview.skipped.collect { row ->
                            "<li><b>${htmlEsc(row.name)}</b>: ${htmlEsc(row.reason)}</li>"
                        }.join("")
                        paragraph "<ul style='color:#a33'>${lines}</ul>"
                    }
                }
                section("Import") {
                    if (preview.ok) {
                        input name: "btnSchedImportRun", type: "button", title: "Import ${preview.ok.size()} schedule(s)"
                        paragraph "<small>Creates or replaces mDash schedules keyed by the exported rule id. Original Simple Automation Rules are left unchanged — disable them in Hubitat after you verify.</small>"
                    } else {
                        paragraph "<b>No schedules can be imported.</b> Fix the skip reasons above (or select devices in Lights/Outlets), then try again."
                    }
                }
            }
        }

        if (state.schedImportResult) {
            section("Last import result") {
                paragraph htmlEsc(state.schedImportResult.toString())
                if (state.schedImportSkipped) {
                    paragraph "<b>Skipped:</b><br>${state.schedImportSkipped.toString()}"
                }
            }
        }

        section("") {
            href "backMain", title: "Back to Modern Dashboard settings", page: "mainPage"
        }
    }
}

def schedUploadPage() {
    dynamicPage(name: "schedUploadPage", title: "Upload schedules", install: false, uninstall: false) {
        if (state.schedUploadResult) {
            section("Last upload") {
                paragraph mldSchedScrollTop() + schedUploadResultHtml()
            }
        }
        section("How to import", hideable: true, hidden: false) {
            if (!state.schedUploadResult) paragraph mldSchedScrollTop()
            paragraph schedUploadHowTo()
        }
        section("Devices for your assistant", hideable: true, hidden: false) {
            if (holidayModuleInstalled()) {
                paragraph "<small>Selected devices and the controls a schedule or a Shabbat and holidays file can set. Each link includes your dashboard token.</small>"
            } else {
                paragraph "<small>Selected devices and the controls a schedule can set. Each link includes your dashboard token.</small>"
            }
            paragraph mldSchedActionLink("Download device list", scheduleDevicesUrl(false), "mdash-devices.json") +
                mldSchedActionLink("Local Network Download", scheduleDevicesUrl(true), "mdash-devices.json")
        }
        section("Schema for your assistant", hideable: true, hidden: false) {
            paragraph "<small>Give this to your assistant with the device list. Download or Copy for the full file.</small>"
            paragraph mldSchemaToolbar()
        }
        if (holidayModuleInstalled()) {
            section("Schema for Shabbat & holidays", hideable: true, hidden: false) {
                paragraph "<small>Give this to your assistant with the device list. Use it only for a Shabbat and holidays file. Download or Copy for the full file.</small>"
                paragraph holidaySchemaToolbar()
            }
        }
        section("Schedule JSON") {
            paragraph "<span style='color:#1f7a45'><b>Green</b></span> rows in the preview will be saved. <span style='color:#b8324a'><b>Red</b></span> rows will be skipped and not written."
            paragraph "<details style='margin:4px 0 8px'><summary style='cursor:pointer'>Schedule example</summary><pre style='white-space:pre-wrap;max-height:48px;overflow:auto'>" + htmlEsc(schedUploadExample()) + "</pre></details>"
            if (holidayModuleInstalled()) {
                paragraph "<details style='margin:4px 0 8px'><summary style='cursor:pointer'>Shabbat & holidays example</summary><pre style='white-space:pre-wrap;max-height:48px;overflow:auto'>" + htmlEsc(holidayUploadExample()) + "</pre></details>"
            }
            if (state.schedUploadHidePaste == true) {
                paragraph mldCallout("tip", "Paste cleared", "Tap <b>Paste another file</b> to upload again.")
                input name: "btnSchedUploadClear", type: "button", title: "Paste another file"
            } else {
                input "schedUploadPaste", "textarea", title: "Schedule JSON", required: false, rows: 3
                paragraph mldSchedUploadFilePicker()
                input name: "btnSchedUploadRun", type: "button", title: "Upload"
                input name: "btnSchedUploadClear", type: "button", title: "Clear paste"
            }
        }
        def preview = schedUploadPreviewFromSettings()
        if (state.schedUploadHidePaste != true) {
            if (preview.error && preview.hasPaste) {
                section("Error") {
                    paragraph mldCallout("danger", "This file cannot be imported yet",
                        htmlEsc(preview.error.toString()) + "<br>Nothing has been saved. Fix the file, then tap <b>Upload</b>.")
                }
            } else if (preview.hasPaste) {
                section("Will import (${preview.ok.size()})") {
                    if (!preview.ok) {
                        paragraph mldCallout("warning", "Nothing to import", "Every row was skipped, so Upload will not save anything.")
                    } else {
                        def lines = preview.ok.collect { row ->
                            def bits = []
                            def summary = row?.summary?.toString()?.trim()
                            if (summary) bits << summary
                            if (row?.replaced == true) bits << "will replace the schedule with this name"
                            else if (row?.replaced == false) bits << "will be added"
                            if (row?.enabled == false) bits << "will be left off"
                            def text = htmlEsc(bits.join(". "))
                            "<li><b>${htmlEsc(row.name)}</b>${text ? " — ${text}" : ""}</li>"
                        }.join("")
                        paragraph mldCallout("success", "${preview.ok.size()} will be saved",
                            "<ul style='margin:0;padding-left:18px;color:#1f7a45'>${lines}</ul>")
                    }
                }
                if (preview.skipped) {
                    section("Will skip (${preview.skipped.size()})") {
                        def lines = preview.skipped.collect { row ->
                            "<li><b>${htmlEsc(row.name ?: "Untitled")}</b>: ${htmlEsc(row.error)}</li>"
                        }.join("")
                        paragraph mldCallout("danger", "${preview.skipped.size()} will not be saved",
                            "<ul style='margin:0;padding-left:18px;color:#b8324a'>${lines}</ul>" +
                            "<div style='margin-top:6px'>Fix these if you want them included. Rows shown in green are still saved.</div>")
                    }
                }
                section("Import") {
                    if (preview.ok) {
                        def skipNote = preview.skipped ? " Red rows are skipped." : ""
                        paragraph mldCallout("info", "Next", "Tap <b>Upload</b> above to save the green rows.${skipNote}")
                    } else if (preview.kind == "holiday") {
                        paragraph mldCallout("danger", "No holiday items can be imported",
                            "Nothing will be saved. Fix the red rows, or paste a different Shabbat and holidays file.")
                    } else {
                        paragraph mldCallout("danger", "No schedules can be imported",
                            "Nothing will be saved. Fix the red rows, or paste a schedules file.")
                    }
                }
            }
        }
        section("") {
            href "backMainUpload", title: "Back to Modern Dashboard settings", page: "mainPage"
        }
    }
}

def triggersPage() {
    // Edit/Add runs on this same page (state.triggerUiMode) — avoids Hubitat href params,
    // which can throw String.call() when the page method signature does not match.
    if (state.triggerUiMode == "edit") {
        return triggerEditUi()
    }
    dynamicPage(name: "triggersPage", title: "Tablet triggers", install: false, uninstall: false) {
        section("") {
            paragraph "Tell open dashboards what to do when something happens at home — a door opens, motion starts, or a doorbell rings. Each trigger can show a camera, play a sound, and leave a short message."
            href name: "backMainTrig", page: "mainPage", title: "← Back to settings"
        }
        def rules = parseTriggerRulesMap()
        def ids = rules.keySet().collect { it.toString() }.sort()
        def atLimit = ids.size() >= maxTriggerRules()

        if (!ids) {
            section("Get started") {
                paragraph "You don't have any triggers yet. Pick a device event, then choose what tablets should show or say."
                if (!atLimit) {
                    input name: "btnTrigAdd", type: "button", title: "Create your first trigger"
                }
                paragraph "<small>Tip: choose contact, motion, and button devices under <b>Dashboard triggers</b> on the main settings page first.</small>"
            }
        } else {
            section(ids.size() == 1 ? "Your trigger" : "Your triggers (${ids.size()})") {
                if (!atLimit) {
                    input name: "btnTrigAdd", type: "button", title: "Add another trigger"
                } else {
                    paragraph "<small>You've reached the limit of ${maxTriggerRules()} triggers.</small>"
                }
                for (rid in ids) {
                    def r = rules[rid]
                    if (!(r instanceof Map)) continue
                    def broken = !triggerDeviceById(r.deviceId)
                    def camMissing = r.cameraId && !validCameraIdSet().contains(r.cameraId?.toString())
                    def status = (r.enabled == false) ? "Paused" : "On"
                    def warn = ""
                    if (broken) warn = "<br><small><b>Needs attention:</b> the source device is no longer available.</small>"
                    else if (camMissing) warn = "<br><small><b>Needs attention:</b> that camera is no longer configured.</small>"
                    paragraph "<b>${htmlEsc(triggerRuleLabel(r))}</b> · ${htmlEsc(status)}<br>" +
                        "<small>${htmlEsc(triggerRuleStory(r))}</small>${warn}"
                    input name: "btnTrigEdit_${rid}", type: "button", title: "Edit: ${triggerRuleLabel(r)}"
                    input name: "btnTrigDel_${rid}", type: "button", title: "Remove: ${triggerRuleLabel(r)}"
                }
            }
        }
    }
}

def triggerBeginEdit(ruleId) {
    state.triggerUiMode = "edit"
    state.triggerEditRuleId = (ruleId ?: "").toString().trim()
    state.remove("triggerEditLoadedId")
    state.remove("triggerEditError")
    state.remove("triggerEditReturnToList")
    state.remove("triggerReturnToListMsg")
}

def triggerCancelEdit() {
    state.remove("triggerUiMode")
    state.remove("triggerEditRuleId")
    state.remove("triggerEditLoadedId")
    state.remove("triggerEditError")
    state.remove("triggerEditReturnToList")
    state.remove("triggerReturnToListMsg")
}

def triggerEditUi() {
    def ruleId = state.triggerEditRuleId?.toString()?.trim() ?: ""
    def existing = ruleId ? parseTriggerRulesMap()[ruleId] : null
    if (ruleId && !(existing instanceof Map)) {
        // Stale id (deleted elsewhere) — return to list.
        triggerCancelEdit()
        return triggersPage()
    }
    if (existing instanceof Map) {
        try {
            if (state.triggerEditLoadedId?.toString() != ruleId) {
                app.updateSetting("trigEditEnabled", [type: "bool", value: existing.enabled != false])
                app.updateSetting("trigEditName", [type: "text", value: existing.name?.toString() ?: ""])
                app.updateSetting("trigEditKind", [type: "enum", value: existing.kind?.toString() ?: "contact"])
                app.updateSetting("trigEditDevice", [type: "enum", value: existing.deviceId?.toString() ?: ""])
                app.updateSetting("trigEditButton", [type: "number", value: existing.button ?: 1])
                app.updateSetting("trigEditCamera", [type: "enum", value: existing.cameraId?.toString() ?: "none"])
                app.updateSetting("trigEditTone", [type: "enum", value: existing.toneId?.toString() ?: "none"])
                app.updateSetting("trigEditText", [type: "text", value: existing.text?.toString() ?: ""])
                app.updateSetting("trigEditDuration", [type: "enum", value: existing.durationSec != null ? existing.durationSec.toString() : "default"])
                app.updateSetting("trigEditCooldown", [type: "number", value: existing.cooldownSec ?: 10])
                state.triggerEditLoadedId = ruleId
            }
        } catch (e) {}
    } else {
        // New rule: reset form fields so Hubitat does not keep the last edit's values.
        try {
            if (state.triggerEditLoadedId?.toString() != "__new__") {
                app.updateSetting("trigEditEnabled", [type: "bool", value: true])
                try { app.clearSetting("trigEditName") } catch (e1) {
                    try { app.updateSetting("trigEditName", [type: "text", value: ""]) } catch (e2) {}
                }
                app.updateSetting("trigEditKind", [type: "enum", value: "contact"])
                try { app.clearSetting("trigEditDevice") } catch (e1) {
                    try { app.updateSetting("trigEditDevice", [type: "enum", value: ""]) } catch (e2) {}
                }
                app.updateSetting("trigEditButton", [type: "number", value: 1])
                try { app.updateSetting("trigEditCamera", [type: "enum", value: "none"]) } catch (e1) {
                    try { app.clearSetting("trigEditCamera") } catch (e2) {}
                }
                app.updateSetting("trigEditTone", [type: "enum", value: "none"])
                try { app.clearSetting("trigEditText") } catch (e1) {
                    try { app.updateSetting("trigEditText", [type: "text", value: ""]) } catch (e2) {}
                }
                try { app.updateSetting("trigEditDuration", [type: "enum", value: "default"]) } catch (e1) {
                    try { app.clearSetting("trigEditDuration") } catch (e2) {}
                }
                app.updateSetting("trigEditCooldown", [type: "number", value: 10])
                state.triggerEditLoadedId = "__new__"
            }
        } catch (e) {}
    }

    def isNew = !(existing instanceof Map)
    dynamicPage(name: "triggersPage", title: isNew ? "New trigger" : "Edit trigger", install: false, uninstall: false) {
        section("") {
            input name: "btnTrigCancel", type: "button", title: "← All triggers"
            paragraph isNew ?
                "Describe what happens, then what your tablets should do. You’ll see a plain-English preview as you go." :
                "Update when this runs and what tablets should do. The preview below follows your choices."
        }

        def kindOpts = [
            ["contact": "A door or window opens"],
            ["motion": "Motion is detected"],
            ["button": "A button is pressed"]
        ]
        def curKind = trigEditKind?.toString() ?: (existing instanceof Map ? existing.kind?.toString() : null) ?: "contact"
        def deviceOpts = triggerDeviceEnumOptions(curKind)
        def cameraOpts = triggerCameraEnumOptions()
        def toneOpts = [
            ["none": "No sound"],
            ["chime": "Gentle chime"],
            ["alert": "Alert tone"]
        ]
        def durOpts = overlayDurationOverrideChoices()
        def camSel = trigEditCamera?.toString()?.trim()
        def showCameraExtras = camSel && camSel != "none" && camSel != ""
        def coolVal = 10
        try { if (trigEditCooldown != null) coolVal = trigEditCooldown.toString().toInteger() } catch (e) { coolVal = 10 }
        def advancedOpen = (coolVal != 10)

        section("Preview") {
            paragraph triggerEditPreviewHtml()
        }

        if (state.triggerEditError) {
            section("Almost there") {
                paragraph "<b>${htmlEsc(state.triggerEditError.toString())}</b>"
            }
        }

        section("When this happens") {
            input "trigEditEnabled", "bool", title: "This trigger is on", defaultValue: true, submitOnChange: true
            input "trigEditName", "text", title: "Short name (optional)", description: "e.g. Front door, Doorbell", required: false
            input "trigEditKind", "enum", title: "What kind of event?", options: kindOpts,
                defaultValue: "contact", required: true, submitOnChange: true
            if (!deviceOpts) {
                paragraph "No devices of this type are available yet. On the main settings page, open <b>Dashboard triggers</b> and pick the contact, motion, or button devices you want to use — then come back here."
            } else {
                input "trigEditDevice", "enum", title: "Which device?", options: deviceOpts, required: true, submitOnChange: true
            }
            if (curKind == "button") {
                input "trigEditButton", "number", title: "Which button number?", defaultValue: 1, required: false, range: "1..20",
                    submitOnChange: true
            }
        }

        section("What tablets should do") {
            paragraph "<small>Pick at least one: a camera, a sound, or a message.</small>"
            input "trigEditCamera", "enum", title: "Show a camera?", options: cameraOpts, required: false, submitOnChange: true
            if (showCameraExtras) {
                input "trigEditDuration", "enum", title: "How long should it stay up?", options: durOpts,
                    defaultValue: "default", required: false, submitOnChange: true
            }
            input "trigEditTone", "enum", title: "Play a sound?", options: toneOpts, defaultValue: "none", required: false,
                submitOnChange: true
            input "trigEditText", "text", title: "Message to show (optional)",
                description: "Appears as a caption while the camera is up, then as a notification", required: false,
                submitOnChange: true
        }

        section("Quiet between repeats", hideable: true, hidden: !advancedOpen) {
            input "trigEditCooldown", "number", title: "Wait this many seconds before firing again",
                defaultValue: 10, required: false, range: "1..600"
            paragraph "<small>Helps when a sensor chatters (door bounce, brief motion). Default is 10 seconds.</small>"
        }

        section("") {
            input name: "btnTrigSave", type: "button", title: isNew ? "Create trigger" : "Save trigger"
            paragraph "<small>Or use <b>← All triggers</b> above to leave without saving.</small>"
        }
    }
}

def schedImportPreviewFromSettings() {
    if (state.schedImportHidePaste == true) {
        return [hasPaste: false, ok: [], skipped: [], error: null]
    }
    def text = schedImportPaste?.toString()
    if (!text?.trim()) return [hasPaste: false, ok: [], skipped: [], error: null]
    def lightIds = (lights ?: []).collect { it?.id?.toString() }.findAll { it }
    def outletIds = (outletSwitches ?: []).collect { it?.id?.toString() }.findAll { it }
    def result = schedImportConvertExport(text, lightIds, outletIds)
    result.hasPaste = true
    return result
}

def schedImportClearPaste() {
    if (state.schedImportHidePaste == true) {
        // "Paste another export" — show the textarea again.
        state.schedImportHidePaste = false
        state.remove("schedImportResult")
        state.remove("schedImportSkipped")
        return
    }
    // Clear while textarea was visible: hide it on the next render so clearSetting sticks
    // (Hubitat often re-applies posted input values when the control remains on the page).
    state.schedImportHidePaste = true
    try { app.clearSetting("schedImportPaste") } catch (e1) {
        try { app.updateSetting("schedImportPaste", [type: "textarea", value: ""]) } catch (e2) {}
    }
    state.remove("schedImportResult")
    state.remove("schedImportSkipped")
}

def schedImportRunFromUi() {
    def preview = schedImportPreviewFromSettings()
    if (preview.error) {
        state.schedImportResult = "Import failed: ${preview.error}"
        state.schedImportSkipped = null
        return
    }
    if (!preview.ok) {
        state.schedImportResult = "Nothing imported."
        state.schedImportSkipped = schedImportFormatSkippedHtml(preview.skipped)
        return
    }
    def applied = schedImportApplyOk(preview.ok)
    if (applied.error) {
        state.schedImportResult = "Import failed: ${applied.error}"
        state.schedImportSkipped = schedImportFormatSkippedHtml(preview.skipped)
        return
    }
    state.schedImportResult = "Imported ${applied.count} schedule(s)."
    state.schedImportSkipped = schedImportFormatSkippedHtml(preview.skipped)
    try {
        log.info "Modern Dashboard: imported ${applied.count} schedule(s) from Simple Automation export" +
            (preview.skipped ? " (${preview.skipped.size()} skipped)" : "")
    } catch (e) {}
    // Hide textarea before clear so Hubitat does not re-apply the posted paste value.
    state.schedImportHidePaste = true
    try { app.clearSetting("schedImportPaste") } catch (e1) {
        try { app.updateSetting("schedImportPaste", [type: "textarea", value: ""]) } catch (e2) {}
    }
}

def schedUploadSchema() {
    return '''
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/evdev/hubitat-modern-dashboard/blob/beta/lib/schedule-upload.schema.json",
  "title": "Modern Dashboard schedule upload",
  "description": "Write one JSON object for Modern Dashboard and nothing else. It must match this schema. Use only device names the user gives you. Do not invent devices, rooms, or hub modes. Omit enabled to leave a schedule on. A schedule name that already exists is replaced. Clock times are 24-hour hub-local HH:mm. One-time at is yyyy-MM-ddTHH:mm in hub-local time and must be in the future. Weekly days are SUN, MON, TUE, WED, THU, FRI, SAT. Sunrise and sunset use offsetMin from -720 to 720; negative is before that event. onlyInModes does nothing on a mode trigger. A mode trigger must not set the same hub mode it watches. Do not schedule sensors, music, or scenes. Lights, outlets, locks, blinds, fans, and thermostats need at least one device. Heat must be below cool. Fahrenheit setpoints are 50-90. Celsius setpoints are 10-32. Level is 0-100. ct is color temperature in Kelvin, only for a bulb that supports it. A lock with locked false unlocks and does not ask for a PIN. Shade position is 1-100 and only applies when open is true and that shade supports position. Fan speed must be one that fan reports, such as low, medium, high, or a number like 4. Omit speed to turn the fan on. The speed off turns the fan off.",
  "type": "object",
  "additionalProperties": false,
  "required": ["schedules"],
  "properties": {
    "schedules": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/schedule" }
    }
  },
  "$defs": {
    "schedule": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "trigger", "action"],
      "properties": {
        "name": { "type": "string", "minLength": 1, "description": "Shown in the scheduler. Uploading the same name again replaces that schedule." },
        "enabled": { "type": "boolean", "description": "Omit to leave the schedule on." },
        "id": { "type": "string", "description": "Omit. The hub assigns an id. Send one only to replace a schedule whose id you already know." },
        "onlyInModes": {
          "type": "array",
          "items": { "type": "string", "minLength": 1 },
          "description": "Hub mode names. The schedule runs only while the hub is in one of these modes. Omit or use [] for any mode. Ignored when trigger.kind is mode."
        },
        "trigger": { "$ref": "#/$defs/trigger" },
        "action": { "$ref": "#/$defs/action" }
      }
    },
    "days": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": { "enum": ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] }
    },
    "trigger": {
      "oneOf": [
        {
          "title": "Daily or weekly clock",
          "type": "object",
          "additionalProperties": false,
          "required": ["kind", "when", "time"],
          "properties": {
            "kind": { "enum": ["daily", "weekly"] },
            "when": { "const": "clock" },
            "time": { "type": "string", "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$", "description": "24-hour hub-local time." },
            "days": { "$ref": "#/$defs/days" }
          },
          "allOf": [
            {
              "if": { "properties": { "kind": { "const": "weekly" } }, "required": ["kind"] },
              "then": { "required": ["days"] }
            }
          ]
        },
        {
          "title": "Daily or weekly sunrise or sunset",
          "type": "object",
          "additionalProperties": false,
          "required": ["kind", "when", "offsetMin"],
          "properties": {
            "kind": { "enum": ["daily", "weekly"] },
            "when": { "enum": ["sunrise", "sunset"] },
            "offsetMin": { "type": "integer", "minimum": -720, "maximum": 720, "description": "Minutes from the sun event. Negative is before." },
            "days": { "$ref": "#/$defs/days" }
          },
          "allOf": [
            {
              "if": { "properties": { "kind": { "const": "weekly" } }, "required": ["kind"] },
              "then": { "required": ["days"] }
            }
          ]
        },
        {
          "title": "One time",
          "type": "object",
          "additionalProperties": false,
          "required": ["kind", "at"],
          "properties": {
            "kind": { "const": "once" },
            "at": { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?$", "description": "Hub-local yyyy-MM-ddTHH:mm. Must be in the future. The schedule is removed after it runs." }
          }
        },
        {
          "title": "Hub mode change",
          "type": "object",
          "additionalProperties": false,
          "required": ["kind", "mode"],
          "properties": {
            "kind": { "const": "mode" },
            "mode": { "type": "string", "minLength": 1, "description": "Exact hub mode name. The schedule runs when the hub enters this mode." }
          }
        }
      ]
    },
    "action": {
      "oneOf": [
        {
          "title": "Lights",
          "type": "object",
          "additionalProperties": false,
          "required": ["target", "states"],
          "properties": {
            "target": { "const": "lights" },
            "states": {
              "type": "array",
              "minItems": 1,
              "items": { "$ref": "#/$defs/lightState" }
            }
          }
        },
        {
          "title": "Outlets",
          "type": "object",
          "additionalProperties": false,
          "required": ["target", "states"],
          "properties": {
            "target": { "const": "outlets" },
            "states": {
              "type": "array",
              "minItems": 1,
              "items": { "$ref": "#/$defs/outletState" }
            }
          }
        },
        {
          "title": "Thermostats",
          "type": "object",
          "additionalProperties": false,
          "required": ["target", "devices"],
          "properties": {
            "target": { "const": "thermostats" },
            "devices": {
              "type": "array",
              "minItems": 1,
              "items": { "type": "string", "minLength": 1, "description": "Thermostat name, or a numeric hub id." }
            },
            "mode": { "type": "string", "description": "heat, cool, auto, off, emergency heat, or another mode that thermostat supports. Omit to change setpoints only. heat and emergency heat require heat. cool requires cool. auto requires both." },
            "heat": { "type": "integer", "description": "Heat setpoint. 50-90 Fahrenheit or 10-32 Celsius." },
            "cool": { "type": "integer", "description": "Cool setpoint. Must be above heat. 50-90 Fahrenheit or 10-32 Celsius." },
            "fanMode": { "type": "string", "description": "auto, on, or circulate, when that thermostat has a fan mode." }
          }
        },
        {
          "title": "Locks",
          "type": "object",
          "additionalProperties": false,
          "required": ["target", "states"],
          "properties": {
            "target": { "const": "locks" },
            "states": {
              "type": "array",
              "minItems": 1,
              "items": { "$ref": "#/$defs/lockState" }
            }
          }
        },
        {
          "title": "Blinds",
          "type": "object",
          "additionalProperties": false,
          "required": ["target", "states"],
          "properties": {
            "target": { "const": "blinds" },
            "states": {
              "type": "array",
              "minItems": 1,
              "items": { "$ref": "#/$defs/blindState" }
            }
          }
        },
        {
          "title": "Fans",
          "type": "object",
          "additionalProperties": false,
          "required": ["target", "states"],
          "properties": {
            "target": { "const": "fans" },
            "states": {
              "type": "array",
              "minItems": 1,
              "items": { "$ref": "#/$defs/fanState" }
            }
          }
        },
        {
          "title": "Hub mode",
          "type": "object",
          "additionalProperties": false,
          "required": ["target", "mode"],
          "properties": {
            "target": { "const": "hubMode" },
            "mode": { "type": "string", "minLength": 1, "description": "Exact hub mode name to set. Must differ from trigger.mode when the trigger is a mode change." }
          }
        }
      ]
    },
    "lightState": {
      "type": "object",
      "additionalProperties": false,
      "required": ["on"],
      "anyOf": [{ "required": ["name"] }, { "required": ["id"] }],
      "properties": {
        "name": { "type": "string", "minLength": 1, "description": "Light name as selected in the app. Prefer name over id." },
        "id": { "type": "string", "description": "Numeric hub device id. Use only when the name is ambiguous." },
        "on": { "type": "boolean" },
        "level": { "type": "integer", "minimum": 0, "maximum": 100, "description": "Dim level. Omit for a switch that cannot dim." },
        "ct": { "type": "integer", "minimum": 2000, "maximum": 6500, "description": "Color temperature in Kelvin. Omit unless that bulb supports it." }
      }
    },
    "outletState": {
      "type": "object",
      "additionalProperties": false,
      "required": ["on"],
      "anyOf": [{ "required": ["name"] }, { "required": ["id"] }],
      "properties": {
        "name": { "type": "string", "minLength": 1, "description": "Outlet name as selected in the app." },
        "id": { "type": "string", "description": "Numeric hub device id. Use only when the name is ambiguous." },
        "on": { "type": "boolean" }
      }
    },
    "lockState": {
      "type": "object",
      "additionalProperties": false,
      "required": ["locked"],
      "anyOf": [{ "required": ["name"] }, { "required": ["id"] }],
      "properties": {
        "name": { "type": "string", "minLength": 1, "description": "Lock name as selected in the app." },
        "id": { "type": "string", "description": "Numeric hub device id. Use only when the name is ambiguous." },
        "locked": { "type": "boolean", "description": "false unlocks. A scheduled unlock does not ask for the PIN." }
      }
    },
    "blindState": {
      "type": "object",
      "additionalProperties": false,
      "required": ["open"],
      "anyOf": [{ "required": ["name"] }, { "required": ["id"] }],
      "properties": {
        "name": { "type": "string", "minLength": 1, "description": "Blind or shade name as selected in the app." },
        "id": { "type": "string", "description": "Numeric hub device id. Use only when the name is ambiguous." },
        "open": { "type": "boolean" },
        "position": { "type": "integer", "minimum": 1, "maximum": 100, "description": "Open position, 1-100. Only when open is true and that shade supports position. Omit to open without a level. Ignored when open is false." }
      }
    },
    "fanState": {
      "type": "object",
      "additionalProperties": false,
      "required": ["on"],
      "anyOf": [{ "required": ["name"] }, { "required": ["id"] }],
      "properties": {
        "name": { "type": "string", "minLength": 1, "description": "Ceiling fan name as selected in the app." },
        "id": { "type": "string", "description": "Numeric hub device id. Use only when the name is ambiguous." },
        "on": { "type": "boolean" },
        "speed": { "type": "string", "minLength": 1, "description": "A speed that fan reports, such as low, medium, high, or 4. Omit to turn on without a speed. off turns the fan off." }
      }
    }
  },
  "examples": [
    {
      "schedules": [
        {
          "name": "Porch at sunset",
          "trigger": { "kind": "daily", "when": "sunset", "offsetMin": -15 },
          "action": { "target": "lights", "states": [{ "name": "Porch", "on": true, "level": 40 }] }
        },
        {
          "name": "Weekday morning",
          "onlyInModes": ["Home"],
          "trigger": { "kind": "weekly", "when": "clock", "time": "06:30", "days": ["MON", "TUE", "WED", "THU", "FRI"] },
          "action": { "target": "lights", "states": [{ "name": "Kitchen", "on": true, "level": 80, "ct": 3000 }] }
        },
        {
          "name": "Guest outlet off",
          "trigger": { "kind": "once", "at": "2026-10-09T22:00" },
          "action": { "target": "outlets", "states": [{ "name": "Guest outlet", "on": false }] }
        },
        {
          "name": "Away cools the house",
          "trigger": { "kind": "mode", "mode": "Away" },
          "action": { "target": "thermostats", "devices": ["Hall thermostat"], "mode": "cool", "cool": 78, "fanMode": "auto" }
        },
        {
          "name": "Front door unlocks",
          "trigger": { "kind": "daily", "when": "clock", "time": "07:00" },
          "action": { "target": "locks", "states": [{ "name": "Front Door", "locked": false }] }
        },
        {
          "name": "Living room shade",
          "trigger": { "kind": "daily", "when": "sunrise", "offsetMin": 0 },
          "action": { "target": "blinds", "states": [{ "name": "Living Room Shade", "open": true, "position": 40 }] }
        },
        {
          "name": "Bedroom fan",
          "trigger": { "kind": "daily", "when": "clock", "time": "21:00" },
          "action": { "target": "fans", "states": [{ "name": "Bedroom Fan", "on": true, "speed": "medium" }] }
        }
      ]
    }
  ]
}
'''
}

def holidayUploadSchema() {
    return '''
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/evdev/hubitat-modern-dashboard/blob/beta/lib/holiday-upload.schema.json",
  "title": "Modern Dashboard Shabbat and holidays upload",
  "description": "Write one JSON object for Modern Dashboard and nothing else. It must match this schema. Do not include a schedules array. Use only device names and hub mode names the user gives you. Do not invent devices, rooms, or hub modes. Occasions left out of the file stay as they are. An occasion in the file replaces that occasion's choice. A template slot you include replaces that slot. A slot you leave out stays as saved. An empty list clears that slot. Shabbat choice is own and needs a template. choice shabbat uses the Shabbat template as-is. choice skip does not change devices or the hub mode for that holiday. choice own is a new schedule and needs a template. choice copy is a schedule based on Shabbat and needs a template. choice pesachFirst is only for pesachLast and uses the Pesach first-days template. Clock times are 24-hour hub-local HH:mm. kind is light, outlet, lock, blind, fan, or thermostat. Prefer a device name over its id. If both are set and they are different devices, that occasion is skipped. If the name matches more than one device, the id chooses among those matches. The same device command twice in one slot is stored once. Two different commands for one device in one slot skip that occasion. Heat must be below cool. Fahrenheit setpoints are 50-90. Celsius setpoints are 10-32. Level is 0-100 and only for a light that can dim. ct is color temperature in Kelvin from 2000 to 6500, only for a bulb that supports it. A lock with locked false unlocks and does not ask for a PIN. Shade position is 1-100 and only applies when open is true and that shade supports position. Fan speed must be one that fan reports, such as low, medium, high, or a number like 4. Omit speed to turn the fan on. on false turns the fan off. Do not send paused or a one-time Friday date. Do not add fields that are not in this schema.",
  "type": "object",
  "additionalProperties": false,
  "anyOf": [
    { "required": ["occasions"] },
    { "required": ["settings"] }
  ],
  "properties": {
    "settings": { "$ref": "#/$defs/settings" },
    "occasions": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/occasion" }
    }
  },
  "$defs": {
    "settings": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "holidayMode": { "type": "string", "minLength": 1, "description": "Hub mode entered at candle lighting. Must differ from endMode." },
        "endMode": { "type": "string", "minLength": 1, "description": "Hub mode restored at havdalah. Must differ from holidayMode." },
        "israel": { "type": "boolean", "description": "true for Israel. Omit or false for the diaspora. Rosh Hashana is two days in both." },
        "doNotStartModes": {
          "type": "array",
          "items": { "type": "string", "minLength": 1 },
          "description": "If the hub is in one of these modes at candle lighting, nothing starts. Use [] for none."
        },
        "candleMin": { "type": "integer", "minimum": 0, "maximum": 120, "description": "Minutes before sunset for candle lighting. 0 means at sunset. 18 is usual." },
        "havdalah": { "$ref": "#/$defs/havdalah" },
        "startEarlyMin": { "type": "integer", "minimum": 0, "maximum": 180, "description": "Minutes before candle lighting to enter the holiday mode and run the start actions. 0 starts at candle lighting." },
        "earlyFriday": { "$ref": "#/$defs/earlyFriday" }
      }
    },
    "havdalah": {
      "oneOf": [
        {
          "title": "Nightfall",
          "type": "object",
          "additionalProperties": false,
          "required": ["type"],
          "properties": { "type": { "const": "nightfall" } }
        },
        {
          "title": "Minutes after sunset",
          "type": "object",
          "additionalProperties": false,
          "required": ["type", "minutes"],
          "properties": {
            "type": { "const": "minutes" },
            "minutes": { "type": "integer", "minimum": 0, "maximum": 120, "description": "Minutes after sunset. 0 means at sunset. 42 is common." }
          }
        }
      ]
    },
    "earlyFriday": {
      "description": "Moves candle lighting earlier on a plain Friday only, and only when that time is before candle lighting.",
      "oneOf": [
        {
          "title": "Off",
          "type": "object",
          "additionalProperties": false,
          "required": ["type"],
          "properties": { "type": { "const": "off" } }
        },
        {
          "title": "Fixed time",
          "type": "object",
          "additionalProperties": false,
          "required": ["type", "value"],
          "properties": {
            "type": { "const": "time" },
            "value": { "type": "string", "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$", "description": "24-hour hub-local time." }
          }
        },
        {
          "title": "Minutes early",
          "type": "object",
          "additionalProperties": false,
          "required": ["type", "value"],
          "properties": {
            "type": { "const": "minutes" },
            "value": { "type": "integer", "minimum": 0, "maximum": 300, "description": "Minutes before that Friday's candle lighting." }
          }
        }
      ]
    },
    "occasion": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "choice"],
      "properties": {
        "id": {
          "enum": ["shabbat", "roshHashana", "yomKippur", "sukkot", "shemini", "pesachFirst", "pesachLast", "shavuot"]
        },
        "choice": {
          "enum": ["own", "copy", "shabbat", "skip", "pesachFirst"],
          "description": "own and copy need a template. shabbat uses the Shabbat template. skip leaves that holiday alone. pesachFirst is only for pesachLast."
        },
        "template": { "$ref": "#/$defs/template" }
      },
      "allOf": [
        {
          "if": { "properties": { "id": { "const": "shabbat" } }, "required": ["id"] },
          "then": {
            "properties": { "choice": { "const": "own" } },
            "required": ["template"]
          }
        },
        {
          "if": { "properties": { "choice": { "enum": ["own", "copy"] } }, "required": ["choice"] },
          "then": { "required": ["template"] }
        },
        {
          "if": { "properties": { "choice": { "const": "pesachFirst" } }, "required": ["choice"] },
          "then": { "properties": { "id": { "const": "pesachLast" } } }
        },
        {
          "if": { "properties": { "choice": { "enum": ["shabbat", "skip", "pesachFirst"] } }, "required": ["choice"] },
          "then": { "not": { "required": ["template"] } }
        }
      ]
    },
    "template": {
      "description": "Slots you include replace those slots. Slots you leave out stay as saved. An empty list clears that slot.",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "start": { "$ref": "#/$defs/startSlot" },
        "night": { "$ref": "#/$defs/timeGroups" },
        "morning": { "$ref": "#/$defs/timeGroups" },
        "afternoon": { "$ref": "#/$defs/timeGroups" },
        "evening": { "$ref": "#/$defs/timeGroups" },
        "end": { "$ref": "#/$defs/endSlot" },
        "custom": {
          "type": "array",
          "items": { "$ref": "#/$defs/customSlot" }
        }
      }
    },
    "startSlot": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "repeatLaterNights": { "type": "boolean", "description": "Also run these actions on later nights of a holiday. Omit or false to run them only on the first night." },
        "states": {
          "type": "array",
          "items": { "$ref": "#/$defs/deviceState" }
        }
      }
    },
    "endSlot": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "states": {
          "type": "array",
          "items": { "$ref": "#/$defs/deviceState" }
        }
      }
    },
    "timeGroups": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["time", "states"],
        "properties": {
          "time": { "type": "string", "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$", "description": "24-hour hub-local time on that Jewish day. Night times are after candle lighting." },
          "states": {
            "type": "array",
            "minItems": 1,
            "items": { "$ref": "#/$defs/deviceState" }
          }
        }
      }
    },
    "customSlot": {
      "type": "object",
      "additionalProperties": false,
      "required": ["anchor", "value", "states"],
      "properties": {
        "anchor": {
          "enum": ["clock-day", "clock-night", "sunrise", "sunset", "after-start", "before-end", "after-end"],
          "description": "clock-day and clock-night use an HH:mm value. The others use a number of minutes."
        },
        "value": {
          "oneOf": [
            { "type": "string", "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$" },
            { "type": "integer", "minimum": 0, "maximum": 720 }
          ]
        },
        "days": { "enum": ["every", "first", "last"], "description": "Omit for every day of the occasion." },
        "states": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/deviceState" }
        }
      }
    },
    "deviceState": {
      "oneOf": [
        { "$ref": "#/$defs/lightState" },
        { "$ref": "#/$defs/outletState" },
        { "$ref": "#/$defs/lockState" },
        { "$ref": "#/$defs/blindState" },
        { "$ref": "#/$defs/fanState" },
        { "$ref": "#/$defs/thermostatState" }
      ]
    },
    "lightState": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind", "on"],
      "anyOf": [{ "required": ["name"] }, { "required": ["id"] }],
      "properties": {
        "kind": { "const": "light" },
        "name": { "type": "string", "minLength": 1, "description": "Light name as selected in the app. Prefer name over id." },
        "id": { "type": "string", "description": "Numeric hub device id. Use when the name is missing or matches more than one device. If it is a different device than the name, the occasion is skipped." },
        "on": { "type": "boolean" },
        "level": { "type": "integer", "minimum": 0, "maximum": 100, "description": "Dim level. Omit for a switch that cannot dim." },
        "ct": { "type": "integer", "minimum": 2000, "maximum": 6500, "description": "Color temperature in Kelvin. Omit unless that bulb supports it." }
      }
    },
    "outletState": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind", "on"],
      "anyOf": [{ "required": ["name"] }, { "required": ["id"] }],
      "properties": {
        "kind": { "const": "outlet" },
        "name": { "type": "string", "minLength": 1, "description": "Outlet name as selected in the app." },
        "id": { "type": "string", "description": "Numeric hub device id. Use when the name is missing or matches more than one device. If it is a different device than the name, the occasion is skipped." },
        "on": { "type": "boolean" }
      }
    },
    "lockState": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind", "locked"],
      "anyOf": [{ "required": ["name"] }, { "required": ["id"] }],
      "properties": {
        "kind": { "const": "lock" },
        "name": { "type": "string", "minLength": 1, "description": "Lock name as selected in the app." },
        "id": { "type": "string", "description": "Numeric hub device id. Use when the name is missing or matches more than one device. If it is a different device than the name, the occasion is skipped." },
        "locked": { "type": "boolean", "description": "false unlocks. A scheduled unlock does not ask for the PIN." }
      }
    },
    "blindState": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind", "open"],
      "anyOf": [{ "required": ["name"] }, { "required": ["id"] }],
      "properties": {
        "kind": { "const": "blind" },
        "name": { "type": "string", "minLength": 1, "description": "Blind or shade name as selected in the app." },
        "id": { "type": "string", "description": "Numeric hub device id. Use when the name is missing or matches more than one device. If it is a different device than the name, the occasion is skipped." },
        "open": { "type": "boolean" },
        "position": { "type": "integer", "minimum": 1, "maximum": 100, "description": "Open position, 1-100. Only when open is true and that shade supports position. Omit to open without a level. Ignored when open is false." }
      }
    },
    "fanState": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind", "on"],
      "anyOf": [{ "required": ["name"] }, { "required": ["id"] }],
      "properties": {
        "kind": { "const": "fan" },
        "name": { "type": "string", "minLength": 1, "description": "Ceiling fan name as selected in the app." },
        "id": { "type": "string", "description": "Numeric hub device id. Use when the name is missing or matches more than one device. If it is a different device than the name, the occasion is skipped." },
        "on": { "type": "boolean" },
        "speed": { "type": "string", "minLength": 1, "description": "A speed that fan reports, such as low, medium, high, or 4. Omit to turn on without a speed. on false turns the fan off." }
      }
    },
    "thermostatState": {
      "type": "object",
      "additionalProperties": false,
      "anyOf": [{ "required": ["name"] }, { "required": ["id"] }],
      "required": ["kind"],
      "properties": {
        "kind": { "const": "thermostat" },
        "name": { "type": "string", "minLength": 1, "description": "Thermostat name as selected in the app." },
        "id": { "type": "string", "description": "Numeric hub device id. Use when the name is missing or matches more than one device. If it is a different device than the name, the occasion is skipped." },
        "mode": { "type": "string", "description": "heat, cool, auto, off, emergency heat, or another mode that thermostat supports. Omit to change setpoints only. heat and emergency heat require heat. cool requires cool. auto requires both." },
        "heat": { "type": "integer", "description": "Heat setpoint. 50-90 Fahrenheit or 10-32 Celsius." },
        "cool": { "type": "integer", "description": "Cool setpoint. Must be above heat. 50-90 Fahrenheit or 10-32 Celsius." },
        "fanMode": { "type": "string", "description": "auto, on, or circulate, when that thermostat has a fan mode." }
      }
    }
  },
  "examples": [
    {
      "settings": {
        "holidayMode": "Shabbat",
        "endMode": "Home",
        "israel": false,
        "doNotStartModes": ["Away"],
        "candleMin": 18,
        "havdalah": { "type": "minutes", "minutes": 42 },
        "earlyFriday": { "type": "off" }
      },
      "occasions": [
        {
          "id": "shabbat",
          "choice": "own",
          "template": {
            "start": {
              "states": [{ "kind": "light", "name": "Dining", "on": true, "level": 40 }]
            },
            "night": [
              { "time": "22:30", "states": [{ "kind": "light", "name": "Dining", "on": false }] }
            ],
            "end": {
              "states": [{ "kind": "light", "name": "Dining", "on": false }]
            }
          }
        },
        { "id": "yomKippur", "choice": "shabbat" },
        { "id": "pesachLast", "choice": "pesachFirst" }
      ]
    }
  ]
}
'''
}

def holidayUploadExample() {
    return '''{
  "occasions": [
    {
      "id": "shabbat",
      "choice": "own",
      "template": {
        "start": { "states": [{ "kind": "light", "name": "Dining", "on": true, "level": 40 }] },
        "end": { "states": [{ "kind": "light", "name": "Dining", "on": false }] }
      }
    }
  ]
}'''
}

def schedUploadExample() {
    return """{
  "schedules": [
    {
      "name": "Porch at sunset",
      "trigger": { "kind": "daily", "when": "sunset", "offsetMin": 0 },
      "action": {
        "target": "lights",
        "states": [{ "name": "Porch", "on": true, "level": 40 }]
      }
    }
  ]
}"""
}

def schedUploadPreviewFromSettings() {
    if (state.schedUploadHidePaste == true) return [hasPaste: false, ok: [], skipped: [], error: null]
    def text = schedUploadPaste?.toString()
    if (!text?.trim()) return [hasPaste: false, ok: [], skipped: [], error: null]
    def parsed = schedUploadParseText(text)
    if (parsed.error) return [hasPaste: true, ok: [], skipped: [], error: parsed.error, kind: parsed.kind]
    if (parsed.kind == "holiday") {
        def preview = holidayUploadPrepare(parsed.body)
        preview.hasPaste = true
        preview.kind = "holiday"
        return preview
    }
    def preview = schedulesPreviewBundle(parsed.items)
    preview.hasPaste = true
    preview.kind = "schedules"
    return preview
}

def schedUploadParseText(String text) {
    def body
    try { body = new groovy.json.JsonSlurper().parseText(text) } catch (e) {
        return [error: "That paste is not JSON"]
    }
    boolean holidayShape = body instanceof Map && (body.containsKey("settings") || body.containsKey("occasions"))
    boolean scheduleShape = body instanceof Map && (body.containsKey("schedules") || body.trigger instanceof Map || body.action instanceof Map)
    if (holidayShape && scheduleShape) {
        if (holidayModuleInstalled()) return [error: "Use one file for schedules or one file for Shabbat and holidays", kind: "holiday"]
        holidayShape = false
    }
    if (holidayShape) {
        if (!holidayModuleInstalled()) return [error: "Expected a schedules array, or one schedule object"]
        return [kind: "holiday", body: body]
    }
    def items = schedulesBundleItems(body)
    if (items == null) {
        if (holidayModuleInstalled()) return [error: "Expected a schedules array, or a Shabbat and holidays file", kind: "holiday"]
        return [error: "Expected a schedules array, or one schedule object"]
    }
    return [kind: "schedules", items: items]
}

def schedUploadClearPaste() {
    if (state.schedUploadHidePaste == true) {
        state.schedUploadHidePaste = false
        schedUploadClearResult()
        return
    }
    state.schedUploadHidePaste = true
    try { app.clearSetting("schedUploadPaste") } catch (e1) {
        try { app.updateSetting("schedUploadPaste", [type: "textarea", value: ""]) } catch (e2) {}
    }
    schedUploadClearResult()
}

def schedUploadClearResult() {
    state.remove("schedUploadResult")
    state.remove("schedUploadDetail")
    state.remove("schedUploadTone")
    state.remove("schedUploadSkipped")
    state.remove("schedUploadSaved")
}

def schedUploadRemember(String tone, String title, String detail, skipped, saved) {
    state.schedUploadTone = tone
    state.schedUploadResult = title?.toString()
    state.schedUploadDetail = detail?.toString()
    def skippedHtml = schedUploadFormatSkippedHtml(skipped)
    if (skippedHtml) state.schedUploadSkipped = skippedHtml
    else state.remove("schedUploadSkipped")
    def savedHtml = schedUploadFormatSavedHtml(saved)
    if (savedHtml) state.schedUploadSaved = savedHtml
    else state.remove("schedUploadSaved")
}

def schedUploadResultHtml() {
    def title = state.schedUploadResult?.toString() ?: ""
    if (!title) return ""
    def tone = state.schedUploadTone?.toString()
    if (!tone) tone = title.startsWith("Upload failed") ? "danger" : "success"
    def detail = htmlEsc(state.schedUploadDetail?.toString() ?: "").replace("\n", "<br>")
    if (state.schedUploadSaved) {
        detail += "<div style='margin-top:8px'><b style='color:#1f7a45'>Saved</b>${state.schedUploadSaved}</div>"
    }
    if (state.schedUploadSkipped) {
        detail += "<div style='margin-top:8px'><b style='color:#b8324a'>Not saved</b>${state.schedUploadSkipped}</div>"
    }
    return mldCallout(tone, title, detail)
}

def schedUploadHowTo() {
    def holiday = holidayModuleInstalled()
    def steps = []
    steps << "Download the <b>device list</b> below. It has the device names and hub mode names this app can use. Do not invent names."
    if (holiday) {
        steps << "Download or copy the <b>schedule schema</b>, or the <b>Shabbat &amp; holidays schema</b> if that is the file you want. Give that schema and the device list to your assistant. Ask for one JSON file."
    } else {
        steps << "Download or copy the <b>schema</b>. Give the schema and the device list to your assistant. Ask for one JSON file."
    }
    steps << "Paste that JSON into the box below, or tap <b>Choose file</b>. <span style='color:#1f7a45'><b>Green</b></span> preview rows will be saved. <span style='color:#b8324a'><b>Red</b></span> rows will be skipped."
    if (holiday) {
        steps << "Tap <b>Upload</b>. Use one file for schedules, or one file for Shabbat and holidays. A schedule name that already exists is replaced. A holiday occasion in the file replaces that occasion's choice. Template slots you include replace those slots. Slots you leave out stay as they are."
    } else {
        steps << "Tap <b>Upload</b>. A schedule name that already exists is replaced. Schedules that are not in the file stay as they are."
    }
    def items = []
    for (int i = 0; i < steps.size(); i++) {
        items << "<li style='margin:0 0 8px 0'><b style='color:#3b6bff'>Step ${i + 1}.</b> ${steps[i]}</li>"
    }
    return mldCallout("info", "How to import", "<ol style='margin:0;padding-left:18px'>${items.join('')}</ol>")
}

def schedUploadFailDetail(String error, String kind) {
    def why = error?.toString()?.trim() ?: "Nothing was imported."
    def lines = [why, "Nothing was saved. The paste is still in the box."]
    if (kind == "holiday") {
        lines << "Shabbat & holidays was not changed. Fix the file, then tap Upload again."
    } else {
        lines << "Your existing schedules were not changed. Use a file shaped like { \"schedules\": [ ... ] }, or one schedule with a trigger and an action. Then tap Upload again."
    }
    return lines.join("\n")
}

def schedUploadFormatSavedHtml(rows) {
    def lines = []
    for (row in (rows ?: [])) {
        def name = htmlEsc(row?.name?.toString()?.trim() ?: "Untitled")
        def bits = []
        if (row?.replaced == true) bits << "replaced the schedule with this name"
        else if (row?.replaced == false) bits << "added"
        def summary = row?.summary?.toString()?.trim()
        if (summary) bits << summary
        if (row?.enabled == false) bits << "left off"
        def text = htmlEsc(bits.join(". "))
        lines << "<li><b>${name}</b>${text ? " — ${text}" : ""}</li>"
    }
    if (!lines) return null
    return "<ul style='margin:6px 0 0;padding-left:18px;color:#1f7a45'>${lines.join('')}</ul>"
}

def schedUploadRunFromUi() {
    def text = schedUploadPaste?.toString()?.trim()
    if (!text) {
        schedUploadRemember("danger", "Upload failed",
            "Nothing was saved.\nThe paste box is empty. Paste JSON, or tap Choose file and pick a .json file. Check the preview, then tap Upload.",
            null, null)
        return
    }
    def parsed = schedUploadParseText(text)
    if (parsed.error) {
        def kind = parsed.kind == "holiday" ? "holiday" : "schedules"
        schedUploadRemember("danger", "Upload failed", schedUploadFailDetail(parsed.error, kind), null, null)
        return
    }
    if (parsed.kind == "holiday") {
        holidayUploadRun(parsed.body)
        return
    }
    def applied = schedulesCommitBundle(parsed.items)
    if (applied.ok != true) {
        schedUploadRemember("danger", "Upload failed", schedUploadFailDetail(applied.error ?: "nothing imported", "schedules"), applied.skipped, null)
        return
    }
    def skippedN = applied.skipped ? applied.skipped.size() : 0
    int n = 0
    try { n = applied.imported as int } catch (e) { n = 0 }
    def title = n == 1 ? "Imported 1 schedule." : "Imported ${n} schedules."
    if (skippedN) title += " ${skippedN} not saved."
    int replacedN = 0
    int addedN = 0
    for (row in (applied.importedRows ?: [])) {
        if (row?.replaced == true) replacedN++
        else if (row?.replaced == false) addedN++
    }
    def lines = []
    lines << (n == 1 ? "Saved 1 schedule in Modern Dashboard." : "Saved ${n} schedules in Modern Dashboard.")
    if (replacedN && addedN) lines << "${replacedN} replaced a schedule that already had the same name. ${addedN} ${addedN == 1 ? 'was' : 'were'} added."
    else if (replacedN == 1) lines << "It replaced a schedule that already had the same name."
    else if (replacedN) lines << "Each one replaced a schedule that already had the same name."
    else if (n == 1) lines << "It was added."
    else lines << "Each one was added."
    lines << "The green list is what was saved. Schedules that were not in this file were left as they are."
    if (skippedN) lines << "The red list was not written. Fix those and upload again if you want them included."
    lines << "The paste was cleared. Tap Paste another file to upload another one."
    schedUploadRemember(skippedN ? "warning" : "success", title, lines.join("\n"), applied.skipped, applied.importedRows)
    try { log.info "Modern Dashboard: uploaded ${applied.imported} schedule(s)" + (skippedN ? " (${skippedN} skipped)" : "") } catch (e) {}
    state.schedUploadHidePaste = true
    try { app.clearSetting("schedUploadPaste") } catch (e1) {
        try { app.updateSetting("schedUploadPaste", [type: "textarea", value: ""]) } catch (e2) {}
    }
}

def schedUploadFormatSkippedHtml(skipped) {
    if (!skipped) return null
    def lines = skipped.collect { row ->
        "<li><b>${htmlEsc(row.name ?: "Untitled")}</b>: ${htmlEsc(row.error)}</li>"
    }
    if (!lines) return null
    return "<ul style='margin:6px 0 0;padding-left:18px;color:#b8324a'>${lines.join('')}</ul>"
}

def holidayUploadRun(body) {
    def applied = holidayUploadCommit(body)
    if (applied?.ok != true) {
        schedUploadRemember("danger", "Upload failed", schedUploadFailDetail(applied?.error ?: "nothing imported", "holiday"), applied?.skipped, null)
        return
    }
    def skippedN = applied.skipped ? applied.skipped.size() : 0
    int n = 0
    try { n = applied.imported as int } catch (e) { n = 0 }
    def title = n == 1 ? "Imported 1 holiday item." : "Imported ${n} holiday items."
    if (skippedN) title += " ${skippedN} not saved."
    if (applied.armed == false) title += " Saved, but not scheduled."
    boolean hadOccasion = false
    for (row in (applied.rows ?: [])) {
        if (row?.id) hadOccasion = true
    }
    def lines = []
    lines << (n == 1 ? "Saved 1 holiday item in Shabbat & holidays." : "Saved ${n} holiday items in Shabbat & holidays.")
    if (hadOccasion) lines << "Each occasion in the file replaced that occasion's choice. Template slots included in the file replaced those slots. Slots you left out, occasions you left out, one-time edits, and paused occasions were kept."
    else lines << "Settings in the file were saved. Occasions, templates, one-time edits, and paused occasions were kept."
    lines << "The green list is what was saved."
    if (applied.armed == false) {
        def why = applied.note?.toString()?.trim() ?: "the next action could not be armed"
        lines << "Saved, but not scheduled: ${why}"
        lines << "The file is saved on the hub. Fix that, then upload again or open Shabbat & holidays."
    } else if (applied.scheduled == true) {
        def when = applied.when?.toString()?.trim()
        if (when) lines << "The next action was scheduled for ${when}."
        else lines << "The next action was scheduled."
    } else if (applied.retry == true) {
        lines << "The file is saved. The next action could not be scheduled just now. Shabbat & holidays will try again shortly."
    } else if (applied.scheduled == false) {
        lines << "The file is saved. No timer was set, because no lighting, havdalah, or other action is still ahead."
    }
    if (skippedN) lines << "The red list was not changed."
    lines << "The paste was cleared. Tap Paste another file to upload another one."
    def tone = (skippedN || applied.armed == false || applied.scheduled == false || applied.retry == true) ? "warning" : "success"
    schedUploadRemember(tone, title, lines.join("\n"), applied.skipped, applied.rows)
    try { log.info "Modern Dashboard: uploaded ${applied.imported} holiday item(s)" + (skippedN ? " (${skippedN} skipped)" : "") } catch (e) {}
    state.schedUploadHidePaste = true
    try { app.clearSetting("schedUploadPaste") } catch (e1) {
        try { app.updateSetting("schedUploadPaste", [type: "textarea", value: ""]) } catch (e2) {}
    }
}

def holidayUploadCommit(body) {
    def prepared = holidayUploadPrepare(body)
    if (prepared.error) return [ok: false, error: prepared.error, imported: 0, skipped: prepared.skipped ?: []]
    if (!prepared.ok) {
        def err = prepared.skipped ? prepared.skipped[0].error : "nothing to import"
        return [ok: false, error: err, imported: 0, skipped: prepared.skipped ?: []]
    }
    def child = holidaysChild()
    if (!child) return [ok: false, error: "Expected a schedules array, or one schedule object", imported: 0, skipped: prepared.skipped ?: []]
    def payload = [occasions: prepared.occasions ?: []]
    if (prepared.settings instanceof Map) payload.settings = prepared.settings
    def result = null
    try { result = child.holidaysImport(payload) } catch (e) {
        return [ok: false, error: holidayUploadChildError(e, "Upload failed"), imported: 0, skipped: prepared.skipped ?: []]
    }
    if (result?.ok != true) return [ok: false, error: result?.error ?: "nothing imported", imported: 0, skipped: prepared.skipped ?: []]
    def scheduled = null
    if (result instanceof Map && result.containsKey("scheduled")) scheduled = result.scheduled == true
    return [ok: true, imported: prepared.ok.size(), skipped: prepared.skipped ?: [], armed: result?.armed != false, scheduled: scheduled, retry: result?.retry == true, when: result?.when?.toString(), note: result?.note, rows: prepared.ok]
}

def holidayUploadChildError(e, String fallback) {
    def text = "${e ?: ''} ${e?.cause ?: ''}"
    if (text.contains("MissingMethodException")) return "Update the Shabbat and holidays app, then try again."
    def msg = e?.message?.toString()?.trim()
    return msg ?: fallback
}

def holidayUploadFileError(String message) {
    return [error: message, ok: [], skipped: [], settings: null, occasions: []]
}

def holidayUploadPrepare(body) {
    if (!holidayModuleInstalled()) return holidayUploadFileError("Expected a schedules array, or one schedule object")
    if (!(body instanceof Map)) return holidayUploadFileError("Expected a schedules array, or a Shabbat and holidays file")
    if (body.containsKey("settings") && !(body.settings instanceof Map)) return holidayUploadFileError("settings must be an object")
    if (body.containsKey("occasions") && !(body.occasions instanceof List)) return holidayUploadFileError("occasions must be a list")
    def child = holidaysChild()
    def snap = null
    try { snap = child?.holidayUploadSnapshot() } catch (e) {
        return holidayUploadFileError(holidayUploadChildError(e, "Could not read the Shabbat and holidays setup"))
    }
    if (!(snap instanceof Map)) return holidayUploadFileError("Could not read the Shabbat and holidays setup")
    def currentSettings = snap.settings instanceof Map ? snap.settings : [:]
    def storedOccasions = snap.occasions instanceof Map ? snap.occasions : [:]
    def storedTemplates = snap.templates instanceof Map ? snap.templates : [:]
    def settingsResult = holidayUploadSettings(body, currentSettings)
    if (settingsResult.error) return holidayUploadFileError(settingsResult.error)
    def occasionResult = holidayUploadOccasions(body.occasions, storedOccasions, storedTemplates)
    def ok = []
    if (settingsResult.settings instanceof Map) ok << [name: "Settings", summary: settingsResult.summary ?: "settings"]
    if (occasionResult.ok) ok.addAll(occasionResult.ok)
    return [error: null, ok: ok, skipped: occasionResult.skipped ?: [], settings: settingsResult.settings, occasions: occasionResult.occasions ?: []]
}

def holidayUploadModeNames() {
    def modes = []
    try {
        for (m in (location?.modes ?: [])) {
            def n = (m?.name != null) ? m.name.toString() : m?.toString()
            if (n) modes << n
        }
    } catch (e) {}
    return modes
}

def holidayUploadWhole(value) {
    if (value instanceof Boolean || value == null) return null
    if (!(value instanceof Number)) return null
    long n = value.longValue()
    if (value.doubleValue() != (n as double)) return null
    if (n > Integer.MAX_VALUE || n < Integer.MIN_VALUE) return null
    return n as int
}

def holidayUploadBool(value) {
    if (value == true || value == false) return value
    return null
}

def holidayUploadClock(value) {
    def text = value?.toString()?.trim()
    if (!(text ==~ /^([01][0-9]|2[0-3]):[0-5][0-9]$/)) return null
    return text
}

def holidayUploadKnownMode(String name, List modes) {
    if (!name) return false
    for (m in modes) if (m?.toString() == name) return true
    return false
}

def holidayUploadSettings(body, current) {
    if (!body.containsKey("settings")) return [settings: null]
    def incoming = body.settings
    def allowed = ["holidayMode", "endMode", "israel", "doNotStartModes", "candleMin", "havdalah", "startEarlyMin", "earlyFriday"] as Set
    def ignored = ["paused", "fridayOverrideDate"] as Set
    def next = [:]
    def notes = []
    for (k in incoming.keySet()) {
        def key = k?.toString()
        if (!key || ignored.contains(key)) continue
        if (!allowed.contains(key)) return [error: "Unknown setting ${key}"]
    }
    def modes = holidayUploadModeNames()
    boolean needsModes = incoming.containsKey("holidayMode") || incoming.containsKey("endMode") || incoming.containsKey("doNotStartModes")
    if (needsModes && !modes) return [error: "The hub has no modes to match."]
    if (incoming.containsKey("holidayMode")) {
        def name = incoming.holidayMode?.toString()?.trim()
        if (!name || !holidayUploadKnownMode(name, modes)) return [error: "Unknown hub mode ${incoming.holidayMode}"]
        next.holidayMode = name
        notes << "holiday mode ${name}"
    }
    if (incoming.containsKey("endMode")) {
        def name = incoming.endMode?.toString()?.trim()
        if (!name || !holidayUploadKnownMode(name, modes)) return [error: "Unknown hub mode ${incoming.endMode}"]
        next.endMode = name
        notes << "end mode ${name}"
    }
    def mergedHoliday = next.containsKey("holidayMode") ? next.holidayMode : current?.holidayMode?.toString()?.trim()
    def mergedEnd = next.containsKey("endMode") ? next.endMode : current?.endMode?.toString()?.trim()
    if (mergedHoliday && mergedEnd && mergedHoliday == mergedEnd) return [error: "The holiday mode and the end mode must be different."]
    if (incoming.containsKey("israel")) {
        def flag = holidayUploadBool(incoming.israel)
        if (flag == null) return [error: "israel must be true or false"]
        next.israel = flag
        notes << (flag ? "Israel" : "diaspora")
    }
    if (incoming.containsKey("doNotStartModes")) {
        def list = incoming.doNotStartModes
        if (!(list instanceof List)) return [error: "doNotStartModes must be a list"]
        def names = []
        for (item in list) {
            def name = item?.toString()?.trim()
            if (!name || !holidayUploadKnownMode(name, modes)) return [error: "Unknown hub mode ${item}"]
            if (!names.contains(name)) names << name
        }
        next.doNotStartModes = names
        notes << (names ? "do not start in ${names.join(', ')}" : "do not start: none")
    }
    if (incoming.containsKey("candleMin")) {
        def n = holidayUploadWhole(incoming.candleMin)
        if (n == null || n < 0 || n > 120) return [error: "candleMin must be from 0 to 120"]
        next.candleMin = n
        notes << "candle lighting ${n} minutes before sunset"
    }
    if (incoming.containsKey("startEarlyMin")) {
        def n = holidayUploadWhole(incoming.startEarlyMin)
        if (n == null || n < 0 || n > 180) return [error: "startEarlyMin must be from 0 to 180"]
        next.startEarlyMin = n
        notes << "start ${n} minutes early"
    }
    if (incoming.containsKey("havdalah")) {
        def hav = incoming.havdalah
        if (!(hav instanceof Map)) return [error: "havdalah must be an object"]
        def type = hav.type?.toString()
        def kept = 42
        if (current?.havdalah instanceof Map) {
            def prev = holidayUploadWhole(current.havdalah.minutes)
            if (prev != null && prev >= 0 && prev <= 120) kept = prev
        }
        if (type == "nightfall") {
            def extra = holidayUploadExtraKey(hav, ["type"])
            if (extra) return [error: "unknown field ${extra}"]
            next.havdalah = [type: "nightfall", minutes: kept]
            notes << "havdalah at nightfall"
        } else if (type == "minutes") {
            def extra = holidayUploadExtraKey(hav, ["type", "minutes"])
            if (extra) return [error: "unknown field ${extra}"]
            def n = holidayUploadWhole(hav.minutes)
            if (n == null || n < 0 || n > 120) return [error: "havdalah minutes must be from 0 to 120"]
            next.havdalah = [type: "minutes", minutes: n]
            notes << "havdalah ${n} minutes after sunset"
        } else return [error: "havdalah type must be nightfall or minutes"]
    }
    if (incoming.containsKey("earlyFriday")) {
        def fri = incoming.earlyFriday
        if (!(fri instanceof Map)) return [error: "earlyFriday must be an object"]
        def type = fri.type?.toString()
        if (type == "off") {
            def extra = holidayUploadExtraKey(fri, ["type"])
            if (extra) return [error: "unknown field ${extra}"]
            next.earlyFriday = [type: "off", value: ""]
            notes << "early Friday off"
        } else if (type == "time") {
            def extra = holidayUploadExtraKey(fri, ["type", "value"])
            if (extra) return [error: "unknown field ${extra}"]
            def clock = holidayUploadClock(fri.value)
            if (!clock) return [error: "early Friday needs a time like 18:00"]
            next.earlyFriday = [type: "time", value: clock]
            notes << "early Friday at ${clock}"
        } else if (type == "minutes") {
            def extra = holidayUploadExtraKey(fri, ["type", "value"])
            if (extra) return [error: "unknown field ${extra}"]
            def n = holidayUploadWhole(fri.value)
            if (n == null || n < 0 || n > 300) return [error: "early Friday minutes must be from 0 to 300"]
            next.earlyFriday = [type: "minutes", value: n]
            notes << "early Friday ${n} minutes early"
        } else return [error: "early Friday type must be off, time, or minutes"]
    }
    if (!next) return [settings: null]
    return [settings: next, summary: notes.join(", ")]
}

def holidayUploadIds() {
    return ["shabbat", "roshHashana", "yomKippur", "sukkot", "shemini", "pesachFirst", "pesachLast", "shavuot"]
}

def holidayUploadLabel(id) {
    def labels = [
        shabbat: "Shabbat",
        roshHashana: "Rosh Hashana",
        yomKippur: "Yom Kippur",
        sukkot: "Sukkot",
        shemini: "Shemini Atzeret / Simchat Torah",
        pesachFirst: "Pesach, first days",
        pesachLast: "Pesach, last days",
        shavuot: "Shavuot"
    ]
    return labels[id?.toString()] ?: (id?.toString() ?: "Occasion")
}

def holidayUploadOccasions(raw, storedOccasions, storedTemplates) {
    def skipped = []
    def first = []
    def seen = []
    if (!(raw instanceof List)) return [ok: [], skipped: [], occasions: []]
    for (item in raw) {
        if (!(item instanceof Map)) {
            skipped << [name: "Occasion", error: "each occasion must be an object"]
            continue
        }
        def id = item.id?.toString()?.trim()
        def label = holidayUploadLabel(id)
        if (!holidayUploadIds().contains(id)) {
            skipped << [name: label, error: "unknown occasion"]
            continue
        }
        if (seen.contains(id)) {
            skipped << [name: label, error: "already in this file"]
            continue
        }
        seen << id
        first << item
    }
    def pending = []
    for (item in first) {
        def built = holidayUploadOneOccasion(item, storedTemplates)
        if (built.error) skipped << [name: built.name, error: built.error]
        else pending << built
    }
    def pesachImported = null
    for (built in pending) if (built.id == "pesachFirst") pesachImported = built
    boolean pesachSkipped = false
    if (pesachImported) {
        pesachSkipped = pesachImported.choice == "skip"
    } else {
        def storedChoice = storedOccasions?.pesachFirst?.toString()?.trim()
        pesachSkipped = !storedChoice || storedChoice == "skip"
    }
    def ok = []
    def occasions = []
    for (built in pending) {
        if (built.choice == "pesachFirst" && pesachSkipped) {
            skipped << [name: built.name, error: "Pesach first days is skipped"]
            continue
        }
        def row = [id: built.id, choice: built.choice]
        if (built.template instanceof Map) row.template = built.template
        occasions << row
        ok << [name: built.name, summary: built.summary]
    }
    return [ok: ok, skipped: skipped, occasions: occasions]
}

def holidayUploadOneOccasion(item, storedTemplates) {
    def id = item.id?.toString()?.trim()
    def name = holidayUploadLabel(id)
    def choice = item.choice?.toString()?.trim()
    def choices = ["own", "copy", "shabbat", "skip", "pesachFirst"]
    if (!choices.contains(choice)) return [name: name, error: "choice must be own, copy, shabbat, skip, or pesachFirst"]
    if (id == "shabbat" && choice != "own") return [name: name, error: "Shabbat uses its own schedule"]
    if (choice == "pesachFirst" && id != "pesachLast") return [name: name, error: "that choice is only for Pesach last days"]
    boolean needsTemplate = choice == "own" || choice == "copy"
    if (needsTemplate) {
        if (!item.containsKey("template")) return [name: name, error: "that choice needs a template"]
        def storedTemplate = storedTemplates instanceof Map ? storedTemplates[id] : null
        def built = holidayUploadTemplate(item.template, storedTemplate)
        if (built.error) return [name: name, error: built.error]
        def summary = (choice == "copy" ? "based on Shabbat" : "own schedule") + ", ${built.devices} " + ((built.devices == 1) ? "device" : "devices")
        return [id: id, name: name, choice: choice, template: built.template, summary: summary]
    }
    if (item.containsKey("template")) return [name: name, error: "that choice does not take a template"]
    def summary = "uses Shabbat"
    if (choice == "skip") summary = "skipped"
    else if (choice == "pesachFirst") summary = "uses Pesach first days"
    return [id: id, name: name, choice: choice, summary: summary]
}

def holidayUploadTemplate(raw, stored) {
    if (!(raw instanceof Map)) return [error: "template must be an object"]
    def known = ["start", "night", "morning", "afternoon", "evening", "end", "custom"] as Set
    for (k in raw.keySet()) {
        def key = k?.toString()
        if (!known.contains(key)) return [error: "unknown template field ${key}"]
    }
    def template = holidayUploadStoredTemplate(stored)
    if (raw.containsKey("start")) {
        def start = raw.start
        if (!(start instanceof Map)) return [error: "start must be an object"]
        def extra = holidayUploadExtraKey(start, ["repeatLaterNights", "states"])
        if (extra) return [error: "unknown field ${extra}"]
        def repeat = false
        if (start.containsKey("repeatLaterNights")) {
            def flag = holidayUploadBool(start.repeatLaterNights)
            if (flag == null) return [error: "repeatLaterNights must be true or false"]
            repeat = flag
        }
        def states = holidayUploadStateList(start.states, "candle lighting")
        if (states.error) return states
        template.start = [states: states.states, repeatLaterNights: repeat]
    }
    for (bucket in ["night", "morning", "afternoon", "evening"]) {
        if (!raw.containsKey(bucket)) continue
        def groups = raw[bucket]
        if (!(groups instanceof List)) return [error: "${bucket} must be a list"]
        def built = []
        int i = 0
        for (g in groups) {
            i++
            if (!(g instanceof Map)) return [error: "${bucket} ${i} must be an object"]
            def extra = holidayUploadExtraKey(g, ["time", "states"])
            if (extra) return [error: "unknown field ${extra}"]
            def time = holidayUploadClock(g.time)
            if (!time) return [error: "${bucket} ${i} needs a time like 22:30"]
            def states = holidayUploadStateList(g.states, "${bucket} ${i}")
            if (states.error) return states
            if (!states.states) return [error: "${bucket} ${i} needs a device"]
            built << [time: time, states: states.states]
        }
        template[bucket] = built
    }
    if (raw.containsKey("end")) {
        def end = raw.end
        if (!(end instanceof Map)) return [error: "end must be an object"]
        def extra = holidayUploadExtraKey(end, ["states"])
        if (extra) return [error: "unknown field ${extra}"]
        def states = holidayUploadStateList(end.states, "havdalah")
        if (states.error) return states
        template.end = [states: states.states]
    }
    if (raw.containsKey("custom")) {
        def custom = raw.custom
        if (!(custom instanceof List)) return [error: "custom must be a list"]
        def anchors = ["clock-day", "clock-night", "sunrise", "sunset", "after-start", "before-end", "after-end"]
        def dayChoices = ["every", "first", "last"]
        def built = []
        int i = 0
        for (c in custom) {
            i++
            if (!(c instanceof Map)) return [error: "custom ${i} must be an object"]
            def extra = holidayUploadExtraKey(c, ["anchor", "value", "days", "states"])
            if (extra) return [error: "unknown field ${extra}"]
            def anchor = c.anchor?.toString()
            if (!anchors.contains(anchor)) return [error: "custom ${i} needs an anchor"]
            def days = c.containsKey("days") ? c.days?.toString() : "every"
            if (!dayChoices.contains(days)) return [error: "custom ${i} days must be every, first, or last"]
            def value = null
            if (anchor.startsWith("clock")) {
                value = holidayUploadClock(c.value)
                if (!value) return [error: "custom ${i} needs a time like 15:00"]
            } else {
                def n = holidayUploadWhole(c.value)
                if (n == null || n < 0 || n > 720) return [error: "custom ${i} needs minutes from 0 to 720"]
                value = n
            }
            def states = holidayUploadStateList(c.states, "custom ${i}")
            if (states.error) return states
            if (!states.states) return [error: "custom ${i} needs a device"]
            built << [anchor: anchor, value: value, days: days, states: states.states]
        }
        template.custom = built
    }
    return [template: template, devices: holidayUploadDeviceCount(template)]
}

def holidayUploadStoredTemplate(stored) {
    def template = [
        start: [states: [], repeatLaterNights: false],
        night: [], morning: [], afternoon: [], evening: [],
        end: [states: []],
        custom: []
    ]
    if (!(stored instanceof Map)) return template
    def copy = holidayUploadCopyValue(stored)
    if (!(copy instanceof Map)) return template
    if (copy.start instanceof Map) {
        template.start = [
            states: copy.start.states instanceof List ? copy.start.states : [],
            repeatLaterNights: copy.start.repeatLaterNights == true
        ]
    }
    for (bucket in ["night", "morning", "afternoon", "evening"]) {
        template[bucket] = copy[bucket] instanceof List ? copy[bucket] : []
    }
    if (copy.end instanceof Map) template.end = [states: copy.end.states instanceof List ? copy.end.states : []]
    template.custom = copy.custom instanceof List ? copy.custom : []
    return template
}

def holidayUploadCopyValue(value) {
    if (value instanceof Map) {
        def out = [:]
        value.each { k, v -> out[k == null ? "null" : k.toString()] = holidayUploadCopyValue(v) }
        return out
    }
    if (value instanceof List) {
        def out = []
        value.each { v -> out << holidayUploadCopyValue(v) }
        return out
    }
    return value
}

def holidayUploadDeviceCount(template) {
    def ids = []
    def lists = [template?.start?.states, template?.end?.states]
    for (bucket in ["night", "morning", "afternoon", "evening"]) {
        for (g in (template[bucket] ?: [])) lists << g?.states
    }
    for (c in (template?.custom ?: [])) lists << c?.states
    for (list in lists) {
        for (s in (list ?: [])) {
            def id = s?.id?.toString()
            if (id && !ids.contains(id)) ids << id
        }
    }
    return ids.size()
}

def holidayUploadStateList(raw, String slot) {
    if (raw == null) return [states: []]
    if (!(raw instanceof List)) return [error: "${slot} states must be a list"]
    def states = []
    def sigs = [:]
    for (st in raw) {
        def one = holidayUploadResolveState(st)
        if (one.error) return [error: "${slot}: ${one.error}"]
        def sid = one.state.id?.toString()
        def sig = holidayUploadSig(one.state)
        if (sigs.containsKey(sid)) {
            if (sigs[sid] != sig) return [error: "${slot}: a device is listed twice with different commands"]
            continue
        }
        sigs[sid] = sig
        states << one.state
    }
    return [states: states]
}

def holidayUploadSig(st) {
    def kind = st?.kind?.toString()
    if (kind == "blind") return "blind|${st.open == true}|${st.position}"
    if (kind == "fan") return "fan|${st.on == true}|${st.speed}"
    if (kind == "lock") return "lock|${st.locked != false}"
    if (kind == "thermostat") return "tstat|${st.mode}|${st.heat}|${st.cool}|${st.fanMode}"
    return "${kind}|${st.on == true}|${st.level}|${st.ct}"
}

def holidayUploadDevices(kind) {
    if (kind == "light") return lights
    if (kind == "outlet") return outletSwitches
    if (kind == "lock") return locks
    if (kind == "blind") return allWindowShades()
    if (kind == "fan") return ceilingFans
    if (kind == "thermostat") return thermostats
    return null
}

def holidayUploadResolveState(st) {
    if (!(st instanceof Map)) return [error: "each device state must be an object"]
    def kind = st.kind?.toString()?.trim()
    def known = ["light", "outlet", "lock", "blind", "fan", "thermostat"]
    if (!known.contains(kind)) return [error: "each device needs a kind of light, outlet, lock, blind, fan, or thermostat"]
    def allowed = ["kind", "name", "id", "label"]
    if (kind == "light") allowed += ["on", "level", "ct"]
    else if (kind == "outlet") allowed += ["on"]
    else if (kind == "lock") allowed += ["locked"]
    else if (kind == "blind") allowed += ["open", "position"]
    else if (kind == "fan") allowed += ["on", "speed"]
    else allowed += ["mode", "heat", "cool", "fanMode"]
    def extra = holidayUploadExtraKey(st, allowed)
    if (extra) return [error: "unknown field ${extra}"]
    def pool = holidayUploadDevices(kind)
    def resolved = holidayUploadPickDevice(st, pool)
    if (resolved.error) return [error: resolved.error]
    def id = resolved.id?.toString()
    def dev = null
    for (d in (pool ?: [])) {
        if (d?.id?.toString() == id) { dev = d; break }
    }
    if (kind == "light") return holidayUploadLightState(st, id, dev)
    if (kind == "outlet") return holidayUploadOutletState(st, id)
    if (kind == "lock") return holidayUploadLockState(st, id)
    if (kind == "blind") return holidayUploadBlindState(st, id, dev)
    if (kind == "fan") return holidayUploadFanState(st, id, dev)
    return holidayUploadThermostatState(st, id, dev)
}

def holidayUploadExtraKey(st, List allowed) {
    for (k in st.keySet()) {
        def key = k?.toString()
        if (!key || allowed.contains(key)) continue
        return key
    }
    return null
}

def holidayUploadPickDevice(st, pool) {
    def name = (st.name ?: st.label)?.toString()?.trim()
    def idText = (st.id != null) ? st.id.toString().trim() : ""
    if (!name && !idText) return [error: "device needs a name or id"]
    def byId = null
    if (idText) {
        byId = scheduleResolveDeviceToken(idText, pool)
        if (byId?.error) return byId
    }
    if (!name) return byId
    def byName = scheduleResolveDeviceToken(name, pool)
    if (!byName?.error) {
        if (byId && byName.id?.toString() != byId.id?.toString()) return [error: "the name and the id are different devices"]
        return byName
    }
    def ambiguous = byName.error?.toString()?.startsWith("more than one device matches")
    if (ambiguous && byId) {
        def label = ""
        for (d in (pool ?: [])) {
            if (d?.id?.toString() == byId.id?.toString()) {
                label = scheduleDeviceLabel(d)?.toString()?.toLowerCase() ?: ""
                break
            }
        }
        def needle = name.toLowerCase()
        if (label == needle || (needle && label.contains(needle))) return byId
        return [error: "the name and the id are different devices"]
    }
    return byName
}

def holidayUploadCan(dev, String cap) {
    if (!dev) return false
    try { return dev.hasCapability(cap) == true } catch (e) { return false }
}

def holidayUploadLightState(st, String id, dev) {
    def on = holidayUploadBool(st.on)
    if (on == null) return [error: "light needs on true or false"]
    def out = [id: id, kind: "light", on: on]
    if (st.level != null) {
        if (!holidayUploadCan(dev, "SwitchLevel")) return [error: "that light cannot dim"]
        def level = holidayUploadWhole(st.level)
        if (level == null || level < 0 || level > 100) return [error: "level must be from 0 to 100"]
        out.level = level
    }
    if (st.ct != null) {
        if (!holidayUploadCan(dev, "ColorTemperature")) return [error: "that light has no color temperature"]
        def ct = holidayUploadWhole(st.ct)
        if (ct == null || ct < 2000 || ct > 6500) return [error: "ct must be from 2000 to 6500"]
        out.ct = ct
    }
    return [state: out]
}

def holidayUploadOutletState(st, String id) {
    def on = holidayUploadBool(st.on)
    if (on == null) return [error: "outlet needs on true or false"]
    return [state: [id: id, kind: "outlet", on: on]]
}

def holidayUploadLockState(st, String id) {
    def locked = holidayUploadBool(st.locked)
    if (locked == null) return [error: "lock needs locked true or false"]
    return [state: [id: id, kind: "lock", locked: locked]]
}

def holidayUploadBlindState(st, String id, dev) {
    def open = holidayUploadBool(st.open)
    if (open == null) return [error: "shade needs open true or false"]
    def out = [id: id, kind: "blind", open: open]
    if (open == true && st.position != null && st.position.toString().trim()) {
        if (!(dev && shadeSupportsPosition(dev) == true)) return [error: "that shade has no position"]
        def pos = holidayUploadWhole(st.position)
        if (pos == null || pos < 1 || pos > 100) return [error: "position must be from 1 to 100"]
        out.position = pos
    }
    return [state: out]
}

def holidayUploadFanState(st, String id, dev) {
    def on = holidayUploadBool(st.on)
    if (on == null) return [error: "fan needs on true or false"]
    def out = [id: id, kind: "fan", on: on]
    if (on == true && st.speed != null && st.speed.toString().trim()) {
        def speed = dev ? scheduleFanSpeedMatch(dev, st.speed) : null
        if (!speed) return [error: "that fan has no speed ${st.speed}"]
        out.speed = speed
    }
    return [state: out]
}

def holidayUploadThermostatState(st, String id, dev) {
    for (key in ["heat", "cool"]) {
        if (st[key] != null && holidayUploadWhole(st[key]) == null) return [error: "${key} must be a whole number"]
    }
    def unit = null
    if (dev) {
        try { unit = thermostatTempUnit(dev) } catch (e) { unit = null }
    }
    def err = thermostatSettingError(st, unit)
    if (err) return [error: err]
    def n = thermostatSettingNormalized(st)
    def out = [id: id, kind: "thermostat"]
    if (n?.mode) out.mode = n.mode.toString()
    if (n?.heat != null) out.heat = n.heat
    if (n?.cool != null) out.cool = n.cool
    if (n?.fanMode) out.fanMode = n.fanMode.toString()
    return [state: out]
}

def schedImportFormatSkippedHtml(skipped) {
    if (!skipped) return null
    return skipped.collect { row ->
        "• ${htmlEsc(row.name)}: ${htmlEsc(row.reason)}"
    }.join("<br>")
}

def installed() {
    if (!state.accessToken) { createAccessToken() }
    logInit()
    try { syncHubCredentials() } catch (e) { log.warn "Modern Dashboard: hub credential sync failed: ${e}" }
    try { initializeScheduler() } catch (e) { log.warn "Modern Dashboard: scheduler init failed: ${e}" }
    try { holidayEnsureChild() } catch (e) { log.warn "Modern Dashboard: holiday setup failed: ${e}" }
    try { holidayNotifyChild() } catch (e) { log.warn "Modern Dashboard: holiday notify failed: ${e}" }
    try { initializeHsm() } catch (e) { log.warn "Modern Dashboard: HSM init failed: ${e}" }
    try { initializeNotifications() } catch (e) { log.warn "Modern Dashboard: notifications init failed: ${e}" }
    try { initializeTriggers() } catch (e) { log.warn "Modern Dashboard: triggers init failed: ${e}" }
    ensureSystemStartSubscription()
}

def updated() {
    logInit()
    try { clearLocalAssetCache() } catch (e) { log.warn "Modern Dashboard: asset cache clear failed: ${e}" }
    try { syncHubCredentials() } catch (e) { log.warn "Modern Dashboard: hub credential sync failed: ${e}" }
    try { syncDashPasswordEpoch() } catch (e) { log.warn "Modern Dashboard: dash password sync failed: ${e}" }
    try { initializeScheduler() } catch (e) { log.warn "Modern Dashboard: scheduler init failed: ${e}" }
    try { holidayEnsureChild() } catch (e) { log.warn "Modern Dashboard: holiday setup failed: ${e}" }
    try { holidayNotifyChild() } catch (e) { log.warn "Modern Dashboard: holiday notify failed: ${e}" }
    try { initializeHsm() } catch (e) { log.warn "Modern Dashboard: HSM init failed: ${e}" }
    try { initializeNotifications() } catch (e) { log.warn "Modern Dashboard: notifications init failed: ${e}" }
    try { initializeTriggers() } catch (e) { log.warn "Modern Dashboard: triggers init failed: ${e}" }
    ensureSystemStartSubscription()
    syncDebugLoggingAutoOff()
}

// Hubitat apps do not auto-call initialize() on reboot. Subscribe to location
// systemStart so schedules (especially runOnce sun/once jobs), mode/sun
// subscriptions, HSM, notifications, and triggers are re-armed after boot.
def ensureSystemStartSubscription() {
    try { unsubscribe("hubSystemStart") } catch (e) {}
    try {
        subscribe(location, "systemStart", "hubSystemStart")
    } catch (e) {
        log.warn "Modern Dashboard: systemStart subscribe failed: ${e}"
    }
}

def hubSystemStart(evt) {
    log.info "Modern Dashboard: hub started — re-arming scheduler and subscriptions"
    try { initializeScheduler() } catch (e) { log.warn "Modern Dashboard: scheduler init failed after reboot: ${e}" }
    try { initializeHsm() } catch (e) { log.warn "Modern Dashboard: HSM init failed after reboot: ${e}" }
    try { initializeNotifications() } catch (e) { log.warn "Modern Dashboard: notifications init failed after reboot: ${e}" }
    try { initializeTriggers() } catch (e) { log.warn "Modern Dashboard: triggers init failed after reboot: ${e}" }
    try { syncDebugLoggingAutoOff() } catch (e) { log.warn "Modern Dashboard: debug-log re-arm failed after reboot: ${e}" }
}

def appButtonHandler(btn) {
    if (btn == "btnCreateNotifDevice") {
        createNotificationChildDeviceFromUi()
    } else if (btn == "btnCreateTileNotifDevice") {
        createTileNotificationChildDeviceFromUi()
    } else if (btn == "btnSchedImportRun") {
        schedImportRunFromUi()
    } else if (btn == "btnSchedImportClear") {
        schedImportClearPaste()
    } else if (btn == "btnSchedUploadRun") {
        schedUploadRunFromUi()
    } else if (btn == "btnSchedUploadClear") {
        schedUploadClearPaste()
    } else if (btn == "btnTriggerTest") {
        triggerSendTestAction()
    } else if (btn == "btnTrigSave") {
        triggerSaveRuleFromUi()
    } else if (btn == "btnTrigCancel" || btn == "btnTrigAdd") {
        if (btn == "btnTrigAdd") triggerBeginEdit("")
        else triggerCancelEdit()
    } else if (btn?.toString()?.startsWith("btnTrigEdit_")) {
        def rid = btn.toString().substring("btnTrigEdit_".length())
        triggerBeginEdit(rid)
    } else if (btn?.toString()?.startsWith("btnTrigDel_")) {
        def rid = btn.toString().substring("btnTrigDel_".length())
        triggerDeleteRule(rid)
        triggerCancelEdit()
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

def logControl(source, detail) {
    log.info "Modern Dashboard: ${source} — ${detail}"
}

def cmdDetail(cmd, val) {
    if (val != null && val.toString() != "") return "${cmd} v=${val}"
    return cmd?.toString() ?: ""
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
    def camDevs = allCameraDevices()
    def cameraCount = camDevs ? camDevs.size() : 0
    if (cameraCount) { log.info "Modern Dashboard: ${cameraCount} camera(s) authorized" }
    if (state.accessToken == null) { state.accessToken = createAccessToken() }
    if (!assetsPresent()) { log.warn "Modern Dashboard: upload all mld-* dashboard files to File Manager (see app setup page)" }
}

def audioHasDashboardControls(d) {
    if (d == null) return false
    return d.hasCommand("play") || d.hasCommand("pause") || d.hasCommand("stop") ||
        d.hasCommand("previousTrack") || d.hasCommand("nextTrack") ||
        d.hasCommand("setVolume") || d.hasCommand("setLevel")
}

def allAudioDevices() {
    def out = []
    def seen = [:]
    for (list in [musicPlayers, audioSpeakers, mediaTransportPlayers]) {
        for (d in asDeviceList(list)) {
            if (d == null) continue
            def key = null
            try { key = d.id?.toString() } catch (e) { key = null }
            if (!key || seen[key]) continue
            if (!audioHasDashboardControls(d)) continue
            seen[key] = true
            out << d
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

def shadeSupportsPosition(dev) {
    return dev.hasCommand("setPosition") || dev.hasCommand("setLevel")
}

def shadeSupportsStop(dev) {
    return dev.hasCommand("stopPositionChange") || dev.hasCommand("stop")
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
    if (d.hasCommand("setVolume") || d.hasCommand("setLevel")) f |= 32
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

// Local OAuth URL only. Hubitat Cloud cannot keep the live connection an assistant needs.
def mcpUrl() {
    return "${getFullLocalApiServerUrl()}/mcp?access_token=${state.accessToken}"
}

def scheduleDevicesUrl(boolean local) {
    def base = local ? getFullLocalApiServerUrl() : getFullApiServerUrl()
    return "${base}/schedules/devices?access_token=${state.accessToken}"
}

def scheduleSchemaUrl(boolean local) {
    def base = local ? getFullLocalApiServerUrl() : getFullApiServerUrl()
    return "${base}/schedules/schema?access_token=${state.accessToken}"
}

def holidaySchemaUrl(boolean local) {
    def base = local ? getFullLocalApiServerUrl() : getFullApiServerUrl()
    return "${base}/holidays/schema?access_token=${state.accessToken}"
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
        ["src", "app-holiday.js", assetJsHolidayFile()],
        ["content", "app-post3.js", assetJsPost3File()],
        ["content", "app-holiday.js", assetJsHolidayFile()],
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
def assetJsHolidayFile() { return "mld-holiday.js" }
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
    path("/app-holiday.js") { action: [GET: "renderJsHoliday"] }
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
    path("/settings/thermostat-order") { action: [GET: "saveThermostatOrderGet", POST: "saveThermostatOrder"] }
    path("/thermostat-order") { action: [GET: "saveThermostatOrderGet", POST: "saveThermostatOrder"] }
    path("/hub-mode") { action: [GET: "setHubModeGet", POST: "setHubMode"] }
    path("/hsm") { action: [GET: "setHsmGet", POST: "setHsm"] }
    path("/scene/activate") { action: [GET: "activateSceneGet", POST: "activateScene"] }
    path("/favorites") { action: [GET: "saveFavoritesGet", POST: "saveFavorites"] }
    path("/device/label") { action: [GET: "saveDeviceLabel", POST: "saveDeviceLabel"] }
    path("/room/name") { action: [GET: "saveRoomName", POST: "saveRoomName"] }
    path("/embed-cards") { action: [POST: "saveEmbedCards"] }
    path("/time-cards") { action: [POST: "saveTimeCards"] }
    path("/notification-cards") { action: [POST: "saveNotificationCards"] }
    path("/settings/favorites-layout") { action: [POST: "saveFavoritesLayout"] }
    path("/snapshot/save") { action: [GET: "snapshotSaveGet", POST: "snapshotSave"] }
    path("/snapshot/restore") { action: [GET: "snapshotRestoreGet", POST: "snapshotRestore"] }
    path("/snapshot/status") { action: [GET: "snapshotStatus"] }
    path("/lights/bulk") { action: [GET: "lightsBulkGet", POST: "lightsBulk"] }
    path("/schedules") { action: [GET: "schedulesGet", POST: "schedulesSave"] }
    path("/schedules/save") { action: [POST: "schedulesSave"] }
    path("/schedules/upload") { action: [POST: "schedulesUpload"] }
    path("/schedules/devices") { action: [GET: "schedulesDevicesGet"] }
    path("/schedules/schema") { action: [GET: "schedulesSchemaGet"] }
    path("/schedules/delete") { action: [POST: "schedulesDelete"] }
    path("/schedules/toggle") { action: [POST: "schedulesToggle"] }
    path("/schedules/test") { action: [POST: "schedulesTest"] }
    path("/mcp") { action: [GET: "mcpGet", POST: "mcpPost"] }
    path("/holidays") { action: [GET: "holidaysGet"] }
    path("/holidays/later") { action: [GET: "holidaysLaterGet"] }
    path("/holidays/save") { action: [POST: "holidaysSave"] }
    path("/holidays/preview") { action: [POST: "holidaysPreview"] }
    path("/holidays/test") { action: [POST: "holidaysTest"] }
    path("/holidays/skip") { action: [POST: "holidaysSkip"] }
    path("/holidays/refresh") { action: [POST: "holidaysRefresh"] }
    path("/holidays/schema") { action: [GET: "holidaysSchemaGet"] }
    path("/notifications") { action: [GET: "notificationsGet"] }
    path("/notifications/ack") { action: [GET: "notificationsAckGet", POST: "notificationsAck"] }
    path("/tile-notifications") { action: [GET: "tileNotificationsGet"] }
    path("/tile-notifications/ack") { action: [GET: "tileNotificationsAckGet", POST: "tileNotificationsAck"] }
    path("/trigger-actions") { action: [GET: "triggerActionsGet"] }
    path("/trigger-actions/ack") { action: [GET: "triggerActionsAckGet", POST: "triggerActionsAck"] }
    path("/alerts/arm") { action: [GET: "alertsArmGet", POST: "alertsArm"] }
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
    // Same public release PNGs as renderManifest (0.3.77). Do not inline data: URIs
    // and do not proxy icons through Hubitat Cloud (binary responses get corrupted).
    // Version lives in the FILENAME, not a query string: raw.githubusercontent.com
    // caches by path only and ignores "?v=" for cache-key purposes (0.3.86).
    def iconHref = "https://raw.githubusercontent.com/evdev/hubitat-modern-dashboard/beta/dist/upload/mld-icon-192-0.4.64.png"
    html = html.replaceAll(/href="icons\/icon-192\.png[^"]*"/, "href=\"${iconHref}\"")
    def title = htmlEsc(resolvedDashboardName())
    html = html.replace('<title>mDash</title>', "<title>${title}</title>")
    html = html.replace('id="dashboard-title">mDash</span>', "id=\"dashboard-title\">${title}</span>")
    html = html.replace('name="apple-mobile-web-app-title" content="mDash"', "name=\"apple-mobile-web-app-title\" content=\"${title}\"")
    if (token) {
        def q = "?access_token=${token}"
        html = appendAccessToken(html, "href", "app.css", token)
        html = appendAccessToken(html, "href", "app-post.css", token)
        html = html.replace('href="manifest.webmanifest"', "href=\"manifest.webmanifest${q}\"")
        for (def asset : ["app.js", "app-core.js", "app-post.js", "app-post2.js", "app-post3.js", "app-holiday.js"]) {
            html = appendAccessToken(html, "src", asset, token)
        }
        html = appendAccessToken(html, "content", "app-post3.js", token)
        html = appendAccessToken(html, "content", "app-holiday.js", token)
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

def renderJsHoliday() {
    def js = readLocalAsset(assetJsHolidayFile())
    if (!js) { js = "globalThis.mldHolidayMissing=true;console.warn('Upload mld-holiday.js to File Manager');" }
    renderVersionedAsset("application/javascript", js)
}

def renderManifest() {
    // Keep the manifest small, but do not proxy PNG bytes through Hubitat Cloud:
    // Hubitat's text-oriented render path corrupts binary image responses. Published
    // release assets are public, valid PNGs that Chrome's WebAPK service can fetch.
    def token = params?.access_token
    def q = token ? "?access_token=${token}" : ""
    def out = new StringBuilder()
    def pwaName = (dashboardName?.trim()) ?: "mDash"
    out << '{"name":' << jsonStr(pwaName) << ',"short_name":' << jsonStr(pwaName)
    out << ',"id":"/mDash"'
    out << ',"start_url":"./dashboard' << q << '"'
    out << ',"scope":"./"'
    out << ',"display":"standalone"'
    out << ',"background_color":"#0b0d12"'
    out << ',"theme_color":"#0b0d12"'
    out << ',"icons":['
    // Separate any + maskable entries: Chrome installability requires purpose "any",
    // and Android launchers prefer an explicit maskable icon.
    def icons = []
    // 1024: Pixel / hi-DPI splash upscales 512; public PNG only (not a hub File Manager asset).
    // Version lives in the FILENAME (not "?v="): raw.githubusercontent.com ignores query
    // strings for cache-key purposes, so a query-only bump never busts its edge cache (0.3.86).
    for (def size : ["192", "512", "1024"]) {
        def src = "https://raw.githubusercontent.com/evdev/hubitat-modern-dashboard/beta/dist/upload/mld-icon-${size}-0.4.64.png"
        def sizes = "${size}x${size}"
        icons << '{"src":' + jsonStr(src) + ',"sizes":"' + sizes + '","type":"image/png","purpose":"any"}'
        icons << '{"src":' + jsonStr(src) + ',"sizes":"' + sizes + '","type":"image/png","purpose":"maskable"}'
    }
    out << icons.join(',')
    out << ']}'
    renderNoStore("application/manifest+json", out.toString(), 200)
}

def renderSw() {
    def js = readLocalAsset(assetSwFile())
    if (!js) { js = "self.addEventListener('fetch',e=>e.respondWith(fetch(e.request)));" }
    def headers = noStoreHeaders()
    headers["Service-Worker-Allowed"] = "/"
    render contentType: "application/javascript", data: js, status: 200, headers: headers
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
    out << thermostatOrderJsonFragment()
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
            appendTstatComfortJson(out, d)
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
    def rtspIds = rtspCameraIdSet()
    if (cameraDevs) {
        for (d in cameraDevs) {
            def key = d.id.toString()
            def urls = rtspIds.contains(key) ? cameraRtspStreamUrls(d) : cameraStreamUrls(d)
            if (urls == null || !urls.u) continue
            if (!first) out << ","; first = false
            out << "{\"i\":" << d.id
            out << ",\"n\":" << jsonStr(d.displayName)
            out << ",\"u\":" << jsonStr(urls.u)
            if (urls.uh) out << ",\"uh\":" << jsonStr(urls.uh)
            def streamType = urls.t ? urls.t : "webrtc"
            out << ",\"t\":" << jsonStr(streamType)
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
        out << ",\"hasPos\":" << (shadeSupportsPosition(d) ? 1 : 0)
        out << ",\"hasStop\":" << (shadeSupportsStop(d) ? 1 : 0)
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
    out << ",\"thermostatsPopupEnabled\":" << (thermostatsPopupEnabled == null ? "true" : (thermostatsPopupEnabled == true ? "true" : "false"))
    out << ",\"outletsSeparateTab\":" << (outletsSeparateTab == true ? "true" : "false")
    out << ",\"hubModePopupEnabled\":" << (hubModePopupEnabled == null ? "true" : (hubModePopupEnabled == true ? "true" : "false"))
    out << ",\"scenesPopupEnabled\":" << (scenesPopupEnabled == null ? "true" : (scenesPopupEnabled == true ? "true" : "false"))
    out << ",\"roomClimateEnabled\":" << (roomClimateEnabled == null ? "true" : (roomClimateEnabled == true ? "true" : "false"))
    out << ",\"schedulerEnabled\":" << (schedulerIsEnabled() ? "true" : "false")
    out << ",\"holidaysAvailable\":" << (holidaysAvailable() ? "true" : "false")
    out << ",\"schedUse24Hour\":" << (schedulerUse24Hour == true ? "true" : "false")
    out << ",\"hubTimeZone\":" << jsonStr(hubTimeZoneId())
    out << ",\"hubNow\":" << now().toString()
    out << ",\"triggersEnabled\":" << (triggersIsEnabled() ? "true" : "false")
    out << ",\"alertsArmed\":" << (readAlertsArmed() ? "true" : "false")
    out << ",\"alertsArmSwitchId\":" << (alertsArmSwitch?.id != null ? alertsArmSwitch.id.toString() : "null")
    out << ",\"triggerSourceIds\":" << triggerSourceIdsJsonArray()
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
    out << htmlTilesJsonFragment()
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

// Companion-app callout styles (mDash palette; Hubitat paragraph HTML only).
def mldCalloutColors(type) {
    switch ((type ?: "info").toString()) {
        case "success":
            return [border: "#3dba6a", bg: "rgba(61,186,106,0.10)", title: "#1f7a45"]
        case "warning":
            return [border: "#d97706", bg: "rgba(217,119,6,0.10)", title: "#9a5b04"]
        case "danger":
            return [border: "#ff5c7a", bg: "rgba(255,92,122,0.10)", title: "#b8324a"]
        case "warm":
            return [border: "#ffb86b", bg: "rgba(255,184,107,0.12)", title: "#b36b1a"]
        case "tip":
            return [border: "#9aa4b8", bg: "rgba(154,164,184,0.12)", title: "#475569"]
        default: // info
            return [border: "#5b8cff", bg: "rgba(91,140,255,0.10)", title: "#3b6bff"]
    }
}

def mldCallout(type, title, bodyHtml) {
    def c = mldCalloutColors(type)
    def t = ""
    if (title) {
        t = "<div style='font-weight:700;margin-bottom:4px;color:${c.title}'>${htmlEsc(title)}</div>"
    }
    return "<div style='border-radius:10px;padding:12px 14px;margin:8px 0;line-height:1.45;" +
        "border-left:4px solid ${c.border};background:${c.bg}'>${t}<div>${bodyHtml ?: ''}</div></div>"
}

def mldTipCallout(bodyHtml) {
    return mldCallout("tip", null, bodyHtml)
}

def mldStepList(steps) {
    def list = (steps instanceof Collection) ? (steps as List) : []
    if (!list) return ""
    def items = []
    for (int i = 0; i < list.size(); i++) {
        items << "<li style='margin:0 0 8px 0'><b>Step ${i + 1}.</b> ${list[i]}</li>"
    }
    return mldCallout("info", "Get started in three steps",
        "<ol style='margin:0;padding-left:18px'>${items.join('')}</ol>")
}

def mldLinkCard(label, subtitle, url, type) {
    def c = mldCalloutColors(type)
    def safeUrl = htmlEsc(url)
    return "<div style='border-radius:10px;padding:12px 14px;margin:8px 0;line-height:1.45;" +
        "border-left:4px solid ${c.border};background:${c.bg}'>" +
        "<div style='font-weight:700;color:${c.title}'>${htmlEsc(label)}</div>" +
        "<div style='font-size:12px;opacity:0.85;margin:2px 0 8px'>${htmlEsc(subtitle)}</div>" +
        "<a href='${safeUrl}' target='_blank' style='word-break:break-all;color:${c.title}'>${safeUrl}</a>" +
        "</div>"
}

// Light button with dark text. Hubitat forces link blue, which vanished on a blue fill.
def mldSchedActionLink(String label, String url, String downloadName, String linkTitle = null) {
    def extra = downloadName ? " download='${htmlEsc(downloadName)}'" : ""
    def titleText = linkTitle
    if (!titleText && label == "Download") titleText = "Download schedule schema"
    def titleAttr = titleText ? " title='${htmlEsc(titleText)}'" : ""
    return "<a href='${htmlEsc(url)}' target='_blank'${extra}${titleAttr} " +
        "style='display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:8px;" +
        "background:#ffffff !important;color:#111827 !important;-webkit-text-fill-color:#111827;" +
        "text-decoration:none !important;font-weight:700;font-size:13px;line-height:1.2;" +
        "border:1px solid #111827;cursor:pointer'>${htmlEsc(label)}</a>"
}

// Download and Copy sit on the schema. Copy reads the hidden textarea, so the JSON is not shown on the page.
def mldSchemaToolbar() {
    def copyJs = 'var b=this,el=document.getElementById("mldSchedSchema");if(!el)return false;' +
        'var v=el.value||el.textContent||el.innerText||"";' +
        'var ok=function(){b.textContent="Copied";};' +
        'var legacy=function(){try{var r=document.createRange();r.selectNodeContents(el);var s=window.getSelection();s.removeAllRanges();s.addRange(r);document.execCommand("copy");ok();}catch(e){b.textContent="Copy failed";}};' +
        'if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(v).then(ok).catch(legacy);}else{legacy();}' +
        'return false;'
    def copyBtn = "display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:8px;" +
        "background:#ffffff;color:#111827;font-weight:700;font-size:13px;line-height:1.2;" +
        "border:1px solid #111827;cursor:pointer;font-family:inherit"
    return "<div style='margin:0 0 4px'>" +
        mldSchedActionLink("Download", scheduleSchemaUrl(false), "mdash-schedule-schema.json") +
        "<button type='button' style='${copyBtn}' onclick='${copyJs}'>Copy</button>" +
        mldSchedActionLink("Local Network Download", scheduleSchemaUrl(true), "mdash-schedule-schema.json") +
        "</div>" +
        "<textarea id='mldSchedSchema' readonly aria-hidden='true' style='display:none'>" +
        htmlEsc(schedUploadSchema().trim()) + "</textarea>"
}

// Copy reads this textarea, not the schedule schema above it.
def holidaySchemaToolbar() {
    def copyJs = 'var b=this,el=document.getElementById("mldHolidaySchema");if(!el)return false;' +
        'var v=el.value||el.textContent||el.innerText||"";' +
        'var ok=function(){b.textContent="Copied";};' +
        'var legacy=function(){try{var r=document.createRange();r.selectNodeContents(el);var s=window.getSelection();s.removeAllRanges();s.addRange(r);document.execCommand("copy");ok();}catch(e){b.textContent="Copy failed";}};' +
        'if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(v).then(ok).catch(legacy);}else{legacy();}' +
        'return false;'
    def copyBtn = "display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:8px;" +
        "background:#ffffff;color:#111827;font-weight:700;font-size:13px;line-height:1.2;" +
        "border:1px solid #111827;cursor:pointer;font-family:inherit"
    return "<div style='margin:0 0 4px'>" +
        mldSchedActionLink("Download", holidaySchemaUrl(false), "mdash-holiday-schema.json", "Download Shabbat and holidays schema") +
        "<button type='button' style='${copyBtn}' onclick='${copyJs}'>Copy</button>" +
        mldSchedActionLink("Local Network Download", holidaySchemaUrl(true), "mdash-holiday-schema.json", "Download Shabbat and holidays schema") +
        "</div>" +
        "<textarea id='mldHolidaySchema' readonly aria-hidden='true' style='display:none'>" +
        htmlEsc(holidayUploadSchema().trim()) + "</textarea>"
}

// Hubitat reopens this page at the previous scroll position. Reset scrollable parents.
def mldSchedScrollTop() {
    def js = 'var n=0,t=function(){n++;try{window.scrollTo(0,0);var roots=[document.scrollingElement,document.documentElement,document.body];for(var i=0;i<roots.length;i++){if(roots[i])roots[i].scrollTop=0;}var nodes=document.getElementsByTagName("div");for(var j=0;j<nodes.length;j++){if(nodes[j].scrollTop>20)nodes[j].scrollTop=0;}}catch(e){}if(n<10)setTimeout(t,80);};t();'
    return "<img alt='' width='1' height='1' style='position:absolute;width:1px;height:1px;opacity:0' src='invalid:mld' onerror='${js}'>"
}

// Reads a JSON file into the Schedule JSON box. Upload then sends that text.
def mldSchedUploadFilePicker() {
    def js = 'var f=this.files&&this.files[0];if(!f)return;var r=new FileReader();r.onload=function(){var text=String(r.result||"");var areas=document.getElementsByTagName("textarea");var area=null;for(var i=0;i<areas.length;i++){var n=(areas[i].getAttribute("name")||"")+" "+(areas[i].id||"");if(n.indexOf("schedUploadPaste")>=0){area=areas[i];break;}}if(!area&&areas.length===1)area=areas[0];if(!area)return;var proto=window.HTMLTextAreaElement&&Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value");if(proto&&proto.set)proto.set.call(area,text);else area.value=text;area.dispatchEvent(new Event("input",{bubbles:true}));area.dispatchEvent(new Event("change",{bubbles:true}));area.focus();};r.readAsText(f);'
    return "<label style='display:inline-block;margin:0 0 8px;padding:8px 14px;border-radius:8px;" +
        "font-weight:700;font-size:14px;line-height:1.2;cursor:pointer;background:#e8edf5;color:#1e293b'>" +
        "Choose file<input id='mldSchedFile' type='file' accept='.json,application/json' " +
        "style='display:none' onchange='${js}'></label>"
}

def devicePickerCount(val) {
    return asDeviceList(val).size()
}

def sectionTitleWithCount(label, count) {
    int n = 0
    try { n = (count ?: 0) as int } catch (e) { n = 0 }
    if (n > 0) return "${label} (${n} selected)"
    return label?.toString() ?: ""
}

def introSectionCollapsed() {
    // Collapse once the user has picked lights or outlets (setup underway).
    return devicePickerCount(lights) > 0 || devicePickerCount(outletSwitches) > 0
}

def climateSectionCollapsed() {
    return devicePickerCount(thermostats) == 0 && devicePickerCount(tempSensors) == 0
}

def shadesMediaSectionCollapsed() {
    return devicePickerCount(windowShades) == 0 &&
        devicePickerCount(windowBlinds) == 0 &&
        devicePickerCount(windowShadesLevel) == 0 &&
        devicePickerCount(ceilingFans) == 0 &&
        devicePickerCount(musicPlayers) == 0 &&
        devicePickerCount(audioSpeakers) == 0 &&
        devicePickerCount(mediaTransportPlayers) == 0
}

def locksSectionCollapsed() {
    return devicePickerCount(locks) == 0 && devicePickerCount(garageDoors) == 0
}

def sensorsSectionCollapsed() {
    return devicePickerCount(motionSensors) == 0 &&
        devicePickerCount(shockSensors) == 0 &&
        devicePickerCount(contactSensors) == 0 &&
        devicePickerCount(waterSensors) == 0 &&
        devicePickerCount(presenceSensors) == 0 &&
        devicePickerCount(humiditySensors) == 0 &&
        devicePickerCount(illuminanceSensors) == 0 &&
        devicePickerCount(smokeSensors) == 0 &&
        devicePickerCount(genericSensors) == 0 &&
        devicePickerCount(valves) == 0
}

def camerasSectionCollapsed() {
    return devicePickerCount(cameras) == 0 && devicePickerCount(rtspCameras) == 0
}

def htmlTilesSectionCollapsed() {
    return devicePickerCount(htmlTileDevices) == 0
}

def notificationsConfiguredCount() {
    // Prefer picker selections; child devices are usually already selected in those pickers.
    def n = devicePickerCount(notificationDevices) + devicePickerCount(tileNotificationDevices)
    if (n > 0) return n
    if (getNotificationChildDevice()) n++
    if (getTileNotificationChildDevice()) n++
    return n
}

def notificationsSectionCollapsed() {
    if (getNotificationChildDevice()) return false
    if (getTileNotificationChildDevice()) return false
    return devicePickerCount(notificationDevices) == 0 &&
        devicePickerCount(tileNotificationDevices) == 0
}

def securitySectionCollapsed() {
    return dashboardPasswordEnabled != true && hsmEnabled != true
}

def securitySectionTitle() {
    if (dashboardPasswordEnabled == true || hsmEnabled == true) return "Security & access (on)"
    return "Security & access"
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

def tstatHasComfortMode(d) {
    return d.hasCommand("setComfortMode") || d.hasAttribute("comfortMode")
}

def tstatHasComfortFanSpeed(d) {
    return d.hasCommand("setComfortFanSpeed") || d.hasAttribute("comfortFanSpeed")
}

def tstatHasVane(d) {
    return d.hasCommand("setVanePosition") || d.hasAttribute("vanePosition")
}

def appendTstatComfortJson(out, d) {
    def hasCm = tstatHasComfortMode(d)
    def hasCfs = tstatHasComfortFanSpeed(d)
    def hasVp = tstatHasVane(d)
    def cfs = hasCfs ? (safeCurrent(d, "comfortFanSpeed") ?: safeCurrent(d, "thermostatFanMode")) : null
    def vp = hasVp ? safeCurrent(d, "vanePosition") : null
    def vpLev = hasVp ? safeCurrent(d, "supportedVanePositions") : null
    out << ",\"hasCm\":" << (hasCm ? 1 : 0)
    out << ",\"hasCfs\":" << (hasCfs ? 1 : 0)
    out << ",\"hasVp\":" << (hasVp ? 1 : 0)
    out << ",\"cfs\":" << jsonStr(cfs)
    out << ",\"vp\":" << jsonStr(vp)
    out << ",\"vpLev\":" << jsonListAttr(vpLev)
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
            out << ",\"hasPos\":" << (shadeSupportsPosition(shadeForDev) ? 1 : 0)
            out << ",\"hasStop\":" << (shadeSupportsStop(shadeForDev) ? 1 : 0)
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
        appendTstatComfortJson(out, t)
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
        out << ",\"pos\":" << numOrNull(shadePos)
        out << ",\"hasPos\":" << (shadeSupportsPosition(shade) ? 1 : 0)
        out << ",\"hasStop\":" << (shadeSupportsStop(shade) ? 1 : 0)
        out << "}"
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
            setThermostatFanModeCmd(t, v)
            break
        case "setFanSpeed":
            if (v != null && (t.hasAttribute("fanSpeed") || t.hasCommand("setFanSpeed"))) t.setFanSpeed(v.toString())
            break
        case "setComfortMode":
            setComfortModeCmd(t, v)
            break
        case "setComfortFanSpeed":
            setComfortFanSpeedCmd(t, v)
            break
        case "setVanePosition":
            if (v != null && t.hasCommand("setVanePosition")) t.setVanePosition(v.toString())
            break
        default:
            throw new IllegalArgumentException("unknown command")
    }
}

def setComfortModeCmd(t, modeStr) {
    if (modeStr == null) return
    def mode = modeStr.toString()
    if (t.hasCommand("setComfortMode")) t.setComfortMode(mode)
    else t.setThermostatMode(mode)
}

def setComfortFanSpeedCmd(t, speedStr) {
    if (speedStr == null) return
    def speed = speedStr.toString()
    if (t.hasCommand("setComfortFanSpeed")) t.setComfortFanSpeed(speed)
    else if (t.hasCommand("setThermostatFanMode")) t.setThermostatFanMode(speed)
    else if (t.hasCommand("setFanMode")) t.setFanMode(speed)
}

def tstatSupportsFanMode(t) {
    return t.hasCapability("ThermostatFanMode") || t.hasAttribute("thermostatFanMode") || tstatHasComfortFanSpeed(t)
}

def setThermostatFanModeCmd(t, modeStr) {
    def mode = modeStr?.toString()?.toLowerCase()
    if (!mode) return false
    if (!tstatSupportsFanMode(t)) return false
    boolean dispatched = false
    try {
        if (mode == "auto" && t.hasCommand("fanAuto")) { t.fanAuto(); dispatched = true }
        else if (mode == "on" && t.hasCommand("fanOn")) { t.fanOn(); dispatched = true }
        else if (mode == "circulate" && t.hasCommand("fanCirculate")) { t.fanCirculate(); dispatched = true }
        else if (t.hasCommand("setComfortFanSpeed")) { t.setComfortFanSpeed(modeStr.toString()); dispatched = true }
        else if (t.hasCommand("setThermostatFanMode")) { t.setThermostatFanMode(modeStr.toString()); dispatched = true }
        else if (t.hasCommand("setFanMode")) { t.setFanMode(modeStr.toString()); dispatched = true }
    } catch (e) {
        log.warn "Modern Dashboard: setFanMode ${mode} failed for ${t.id}: ${e}"
        throw e
    }
    return dispatched
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
            int vol = (v != null) ? Math.max(0, Math.min(100, v.toInteger())) : 0
            if (dev.hasCommand("setVolume")) {
                dev.setVolume(vol)
            } else if (dev.hasCommand("setLevel")) {
                dev.setLevel(vol)
            } else {
                throw new IllegalArgumentException("unsupported command")
            }
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
        logControl("manual", "${deviceLabel(targetDev)} ${cmdDetail(c, v)}")
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

def renameError(String message, int status) {
    return renderJsonNoStore("{\"ok\":false,\"error\":${jsonStr(message)}}", status)
}

def renameRequestValue(String key) {
    def body = parseRequestJson()
    if (body instanceof Map && body.containsKey(key)) return [present: true, value: body[key]]
    try {
        if (params instanceof Map && params.containsKey(key)) return [present: true, value: params[key]]
    } catch (e) {}
    return [present: false, value: null]
}

def sanitizeRenameText(value) {
    def text = value == null ? "" : value.toString()
    text = text.replaceAll("\\p{Cntrl}", " ").trim()
    return text
}

def dashboardDeviceLists() {
    def lists = [
        lights, outletSwitches, thermostats, locks, garageDoors, ceilingFans, valves,
        cameras, rtspCameras, htmlTileDevices, tempSensors, allWindowShades(), allAudioDevices()
    ]
    for (spec in sensorTypeInputs()) lists << spec.list
    return lists
}

def findDashboardDevice(id) {
    if (id == null) return null
    def want = id.toString()
    for (list in dashboardDeviceLists()) {
        for (d in asDeviceList(list)) {
            try {
                if (d?.id?.toString() == want) return d
            } catch (e) {}
        }
    }
    return null
}

def selectedDeviceIdsInRoom(String roomName) {
    def ids = new HashSet()
    if (!roomName) return ids
    for (list in dashboardDeviceLists()) {
        for (d in asDeviceList(list)) {
            if (d == null) continue
            def rn = null
            try { rn = d.getRoomName()?.toString() } catch (e) { rn = null }
            if (rn != roomName) continue
            try { ids.add(d.id.toString()) } catch (e) {}
        }
    }
    return ids
}

def roomMembershipIds(room) {
    if (room == null) return null
    def raw = null
    try { raw = room.deviceIds } catch (e) { return null }
    if (raw == null) return null
    def items = (raw instanceof Collection) ? raw : [raw]
    def ids = []
    for (item in items) {
        if (item == null) continue
        try { ids << (item as Long) } catch (e) { return null }
    }
    return ids
}

def postHubRoomSave(Map bodyMap) {
    if (hubSecurity && !hubAuthCookie()) {
        return [ok: false, error: "Hub Login Security is on. Enter hub admin credentials under Hub file access, then try again."]
    }
    def json = new groovy.json.JsonBuilder(bodyMap).toString()
    def params = [
        uri: "http://127.0.0.1:8080",
        path: "/room/save",
        contentType: "application/json",
        requestContentType: "application/json",
        body: json,
        textParser: true,
        timeout: 20
    ]
    def headers = hubRequestHeaders()
    if (headers) params.headers = headers
    try {
        def failed = null
        httpPost(params) { resp ->
            def code = resp?.status ?: resp?.statusCode ?: 200
            def text = ""
            try { text = readHttpBody(resp?.data) } catch (e) { text = "" }
            if ((code as int) >= 400) failed = "room save failed"
            else if (text?.contains("<html") || text?.contains("<HTML")) {
                failed = hubSecurity
                    ? "Hub Login Security is on. Enter hub admin credentials under Hub file access, then try again."
                    : "room save failed"
            }
        }
        if (failed) return [ok: false, error: failed]
        return [ok: true]
    } catch (e) {
        def msg = e?.message?.toString() ?: "room save failed"
        log.warn "Modern Dashboard: room save failed — ${msg}"
        if (msg.contains("'<',") || msg.toLowerCase().contains("login")) {
            return [ok: false, error: "Hub Login Security is on. Enter hub admin credentials under Hub file access, then try again."]
        }
        return [ok: false, error: "room save failed"]
    }
}

def saveDeviceLabel() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def idField = renameRequestValue("id")
    def labelField = renameRequestValue("label")
    if (!idField.present || !labelField.present) return renameError("missing params", 400)
    def dev = findDashboardDevice(idField.value)
    if (dev == null) return renameError("device not found", 404)
    def next = sanitizeRenameText(labelField.value)
    if (next.length() > 255) return renameError("label too long", 400)
    try {
        dev.setLabel(next)
    } catch (e) {
        def msg = e?.message?.toString() ?: "could not rename device"
        log.warn "Modern Dashboard: device label failed — id=${dev.id} ${msg}"
        return renameError(msg, 500)
    }
    def labelAfter = null
    try { labelAfter = dev.getLabel()?.toString()?.trim() } catch (e) { labelAfter = null }
    if (!next && labelAfter) return renameError("could not clear device label", 500)
    def shown = dev.displayName?.toString() ?: ""
    log.info "Modern Dashboard: renamed device ${dev.id} to ${shown}"
    return renderJsonNoStore(withAuthJson("{\"ok\":true,\"id\":${dev.id},\"n\":${jsonStr(shown)}}"), 200)
}

def saveRoomName() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def idField = renameRequestValue("id")
    def nameField = renameRequestValue("name")
    if (!idField.present || !nameField.present) return renameError("missing params", 400)
    def idStr = idField.value?.toString()?.trim()
    if (!idStr) return renameError("missing params", 400)
    if (idStr == "-1") return renameError("unassigned is not a room", 400)
    def next = sanitizeRenameText(nameField.value)
    if (!next) return renameError("room name required", 400)
    if (next.length() > 255) return renameError("room name too long", 400)
    def rooms = app.getRooms() ?: []
    def room = rooms.find { it?.id?.toString() == idStr }
    if (!room) return renameError("room not found", 404)
    def currentName = room.name?.toString()?.trim() ?: ""
    def dup = rooms.find {
        it?.id?.toString() != idStr && it?.name?.toString()?.trim()?.equalsIgnoreCase(next)
    }
    if (dup) return renameError("a room with that name already exists", 400)
    if (currentName == next) {
        return renderJsonNoStore(withAuthJson("{\"ok\":true,\"id\":${room.id},\"name\":${jsonStr(currentName)}}"), 200)
    }
    def membership = roomMembershipIds(room)
    if (membership == null) return renameError("room membership unavailable", 400)
    def beforeSet = new HashSet(membership.collect { it.toString() })
    for (sid in selectedDeviceIdsInRoom(currentName)) {
        if (!beforeSet.contains(sid)) return renameError("room membership snapshot is incomplete", 400)
    }
    def posted = postHubRoomSave([roomId: (room.id as Long), name: next, deviceIds: membership])
    if (!posted.ok) return renameError(posted.error ?: "room save failed", 500)
    def afterRooms = app.getRooms() ?: []
    def saved = afterRooms.find { it?.id?.toString() == idStr }
    if (!saved || saved.name?.toString()?.trim() != next) {
        log.warn "Modern Dashboard: room rename did not stick — id=${idStr}"
        return renameError("room name did not update", 500)
    }
    def afterMembership = roomMembershipIds(saved)
    if (afterMembership == null) return renameError("room membership changed unexpectedly", 500)
    def afterSet = new HashSet(afterMembership.collect { it.toString() })
    if (beforeSet != afterSet) {
        log.warn "Modern Dashboard: room membership changed during rename — id=${idStr}"
        return renameError("room membership changed unexpectedly", 500)
    }
    log.info "Modern Dashboard: renamed room ${saved.id} to ${next}"
    return renderJsonNoStore(withAuthJson("{\"ok\":true,\"id\":${saved.id},\"name\":${jsonStr(next)}}"), 200)
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

def allCameraDevices() {
    def out = []
    def seen = [:]
    for (list in [cameras, rtspCameras]) {
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

def rtspCameraIdSet() {
    def set = new HashSet()
    for (d in asDeviceList(rtspCameras)) {
        try { set.add(d.id.toString()) } catch (e) {}
    }
    return set
}

def cameraRtspMjpegUrl(dev) {
    def urlRaw = safeCurrent(dev, "imageUrl")
    if (urlRaw == null) return null
    def url = urlRaw.toString().trim()
    if (!url) return null
    def expected = "/hub2/videoStream/${dev.id}.mjpg"
    try {
        def path
        if (url.startsWith("http://") || url.startsWith("https://")) {
            path = new java.net.URI(url).path
        } else {
            path = url.split("\\?", 2)[0]
        }
        return path == expected ? expected : null
    } catch (e) {
        return null
    }
}

def cameraRtspStreamUrls(dev) {
    def u = cameraRtspMjpegUrl(dev)
    return u ? [u: u, t: "mjpg"] : null
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
// Numeric device-id order (cameras, thermostats — synced across devices)
// ---------------------------------------------------------------------------
def parseNumericIdOrderState(raw) {
    if (!raw) return []
    try {
        return raw.toString().split(",").collect { it.trim() }.findAll { it }.collect { it.toLong() }
    } catch (e) {
        return []
    }
}

def numericIdOrderJsonFragment(ids, jsonKey) {
    def out = new StringBuilder()
    out << ",\"" << jsonKey << "\":["
    boolean first = true
    for (id in ids) {
        if (!first) out << ","; first = false
        out << id
    }
    out << "]"
    return out.toString()
}

def parseOrderParamList() {
    def orderStr = params?.order
    if (!orderStr?.trim()) return null
    return orderStr.split(",").collect { it.trim() }.findAll { it }
}

def parseOrderBodyList() {
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    return body?.order
}

def validateNumericIdOrder(order, valid) {
    if (!(order instanceof List) || order.isEmpty()) return null
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
    return validated
}

def renderNumericIdOrderResult(validated) {
    if (validated == null) {
        return renderJsonNoStore( '{"ok":false,"error":"missing order"}', 400)
    }
    if (validated.isEmpty()) {
        return renderJsonNoStore( '{"ok":false,"error":"empty order"}', 400)
    }
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
// Camera order (state.cameraOrder — synced across devices)
// ---------------------------------------------------------------------------
def parseCameraOrderState() {
    return parseNumericIdOrderState(state.cameraOrder)
}

def cameraOrderJsonFragment() {
    return numericIdOrderJsonFragment(parseCameraOrderState(), "cameraOrder")
}

def validCameraIdSet() {
    def set = new HashSet()
    for (d in allCameraDevices()) {
        try { set.add(d.id.toString()) } catch (e) {}
    }
    return set
}

def orderedCamerasList() {
    def list = allCameraDevices()
    if (!list) return []
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
    def order = parseOrderParamList()
    if (order == null) {
        return renderJsonNoStore( '{"ok":false,"error":"missing order"}', 400)
    }
    return saveCameraOrderFromList(order)
}

def saveCameraOrder() {
    return saveCameraOrderFromList(parseOrderBodyList())
}

def saveCameraOrderFromList(order) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def validated = validateNumericIdOrder(order, validCameraIdSet())
    if (validated == null) {
        return renderJsonNoStore( '{"ok":false,"error":"missing order"}', 400)
    }
    if (validated.isEmpty()) {
        return renderJsonNoStore( '{"ok":false,"error":"empty order"}', 400)
    }
    state.cameraOrder = validated.join(",")
    return renderNumericIdOrderResult(validated)
}

// ---------------------------------------------------------------------------
// Thermostat order (state.thermostatOrder — synced across devices)
// ---------------------------------------------------------------------------
def parseThermostatOrderState() {
    return parseNumericIdOrderState(state.thermostatOrder)
}

def thermostatOrderJsonFragment() {
    return numericIdOrderJsonFragment(parseThermostatOrderState(), "thermostatOrder")
}

def validThermostatIdSet() {
    def set = new HashSet()
    for (d in asDeviceList(thermostats)) {
        try { set.add(d.id.toString()) } catch (e) {}
    }
    return set
}

def saveThermostatOrderGet() {
    def order = parseOrderParamList()
    if (order == null) {
        return renderJsonNoStore( '{"ok":false,"error":"missing order"}', 400)
    }
    return saveThermostatOrderFromList(order)
}

def saveThermostatOrder() {
    return saveThermostatOrderFromList(parseOrderBodyList())
}

def saveThermostatOrderFromList(order) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def validated = validateNumericIdOrder(order, validThermostatIdSet())
    if (validated == null) {
        return renderJsonNoStore( '{"ok":false,"error":"missing order"}', 400)
    }
    if (validated.isEmpty()) {
        return renderJsonNoStore( '{"ok":false,"error":"empty order"}', 400)
    }
    state.thermostatOrder = validated.join(",")
    return renderNumericIdOrderResult(validated)
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
    out << htmlTileSizesJsonFragment()
    out << htmlTileZoomsJsonFragment()
    out << htmlTileTitlesJsonFragment()
    out << embedCardsJsonFragment()
    out << timeCardsJsonFragment()
    out << notificationCardsJsonFragment()
    out << favoritesLayoutJsonFragment()
    return out.toString()
}

// ---------------------------------------------------------------------------
// Favorites embed cards + time cards + mixed layout (device + embed + time)
// ---------------------------------------------------------------------------
def maxEmbedCards() { return 12 }
def maxTimeCards() { return 12 }
def maxNotificationCards() { return 12 }
def maxEmbedTitleLen() { return 80 }
def maxEmbedUrlLen() { return 4096 }
def maxEmbedCardsStateBytes() { return 32768 }
def maxTimeCardsStateBytes() { return 8192 }
def maxNotificationCardsStateBytes() { return 8192 }
def embedSizePresetSet() { return ["compact", "standard", "wide", "square", "portrait", "full", "tall", "large", "viewport"] as Set }
def timeSizePresetSet() { return ["compact", "standard", "square", "wide", "tall", "large"] as Set }
def notificationSizePresetSet() { return ["compact", "standard", "square", "wide", "tall", "large", "full", "viewport"] as Set }
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

def parseNotificationCardsState() {
    if (!state.notificationCardsJson) return []
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(state.notificationCardsJson.toString())
        if (!(parsed instanceof List)) return []
        def out = []
        def seen = new HashSet()
        for (item in parsed) {
            if (!(item instanceof Map)) continue
            def id = item.id?.toString()?.trim()
            if (!id || !id.startsWith("n_") || seen.contains(id)) continue
            seen.add(id)
            def size = item.size?.toString()?.trim()
            if (!notificationSizePresetSet().contains(size)) size = "tall"
            out << [id: id, size: size]
            if (out.size() >= maxNotificationCards()) break
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
def htmlLayoutKey(deviceId, attribute) { return "h:" + deviceId.toString() + ":" + attribute.toString() }

def maxHtmlAttrBytes() { return 8192 }
def maxHtmlAttrsPerGenericDevice() { return 6 }
def htmlSizePresetSet() { return ["compact", "standard", "wide", "square", "portrait", "full", "tall", "large", "viewport"] as Set }
def htmlZoomPresetSet() { return [50, 75, 100, 125, 150] as Set }
def htmlNamedAttrs() { return ["html", "tile", "iframe"] as Set }

def isTileBuilderStorageDevice(d) {
    try {
        def tn = (d?.typeName ?: "").toString().toLowerCase()
        return tn.contains("tile builder storage")
    } catch (e) {
        return false
    }
}

def looksLikeDashboardHtml(raw) {
    def s = raw?.toString() ?: ""
    if (s.length() < 8) return false
    def lower = s.toLowerCase()
    return lower.contains("<div") || lower.contains("<table") || lower.contains("<style") || lower.contains("<iframe") ||
        lower.contains("[div") || lower.contains("[table") || lower.contains("[style") || lower.contains("[iframe")
}

def sanitizeHtmlForDashboard(raw) {
    if (raw == null) return null
    def s = raw.toString()
    s = s.replaceAll(/(?is)<script\b[^>]*>.*?<\/script>/, "")
    s = s.replaceAll(/(?is)<script\b[^>]*\/?>/, "")
    s = s.replaceAll(/(?i)\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/, "")
    s = s.replaceAll(/(?i)(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/, '$1=$2#$2')
    s = s.replaceAll(/(?is)<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/, "")
    return s
}

def parseTileDescriptionsMap(d) {
    // Only works when a driver publishes tileDescriptions as a device attribute (not Tile Builder state).
    def out = [:]
    try {
        def raw = safeCurrent(d, "tileDescriptions")
        if (raw == null) return out
        def parsed = new groovy.json.JsonSlurper().parseText(raw.toString())
        if (!(parsed instanceof Map)) return out
        for (entry in parsed) {
            def key = entry.key?.toString()?.trim()
            def val = entry.value?.toString()?.trim()
            if (!key || !val || val == "None") continue
            out[key] = val
        }
    } catch (e) {}
    return out
}

def tileBuilderDescriptions(d) {
    // Best-effort: Tile Builder stores descriptions in driver state; getTileList() may not
    // return data to arbitrary SmartApps. mDash title overrides are the reliable path.
    def map = [:]
    try {
        def list = d.getTileList()
        if (list instanceof List) {
            for (item in list) {
                def s = item?.toString() ?: ""
                def m = (s =~ /^(tile\d+)\s*:\s*(.*?)\s*:\s*\(/)
                if (m.find()) {
                    def desc = m.group(2)?.trim()
                    if (desc && desc != "None") map[m.group(1)] = desc
                }
            }
        }
    } catch (e) {}
    return map
}

def mergeTileDescriptionMaps(primary, secondary) {
    def out = [:]
    if (secondary instanceof Map) {
        for (entry in secondary) out[entry.key] = entry.value
    }
    if (primary instanceof Map) {
        for (entry in primary) out[entry.key] = entry.value
    }
    return out
}

def resolveHtmlTileTitle(descMap, attr, fallback) {
    def key = attr?.toString()
    if (key && descMap instanceof Map) {
        def fromMap = descMap[key]?.toString()?.trim()
        if (fromMap && fromMap != "None") return fromMap
    }
    def fb = fallback?.toString()?.trim()
    return fb ?: key ?: "HTML"
}

def htmlTileWantsBody(tileId, includeHtmlBodies, activeIds) {
    if (!includeHtmlBodies) return false
    if (activeIds == null) return true
    return activeIds.contains(tileId)
}

def discoverHtmlTilesForDevice(d, includeHtmlBodies = false, activeIds = null) {
    def out = []
    if (!d) return out
    def deviceName = d.displayName?.toString() ?: ("Device " + d.id)
    def deviceId = d.id
    if (isTileBuilderStorageDevice(d)) {
        def descs = mergeTileDescriptionMaps(parseTileDescriptionsMap(d), tileBuilderDescriptions(d))
        for (i in 1..26) {
            def attr = "tile" + i
            def val = safeCurrent(d, attr)
            if (val == null) continue
            def vs = val.toString()
            if (vs.trim() == "") continue
            def title = resolveHtmlTileTitle(descs, attr, "Tile " + i)
            def id = deviceId.toString() + ":" + attr
            def entry = [id: id, deviceId: deviceId, attribute: attr, title: title]
            // Keep HTML strings only for favorited/active tiles — avoids retaining large inactive bodies every /data poll.
            if (htmlTileWantsBody(id, includeHtmlBodies, activeIds)) entry.html = vs
            out << entry
        }
        return out
    }
    def descs = parseTileDescriptionsMap(d)
    def seen = new HashSet()
    def named = htmlNamedAttrs()
    try {
        def states = d.currentStates ?: []
        for (st in states) {
            def nm = st?.name?.toString()
            if (!nm) continue
            def low = nm.toLowerCase()
            if (low == "roomscss" || low == "alignroomtilescss" || low == "emptyattribute" || low == "tiledescriptions") continue
            def val = st?.value
            if (val == null) continue
            def vs = val.toString()
            if (vs.trim() == "") continue
            if (!(named.contains(low) || looksLikeDashboardHtml(vs))) continue
            if (seen.contains(nm)) continue
            seen.add(nm)
            def id = deviceId.toString() + ":" + nm
            def entry = [id: id, deviceId: deviceId, attribute: nm, title: resolveHtmlTileTitle(descs, nm, nm)]
            if (htmlTileWantsBody(id, includeHtmlBodies, activeIds)) entry.html = vs
            out << entry
            if (out.size() >= maxHtmlAttrsPerGenericDevice()) break
        }
    } catch (e) {}
    if (out.size() == 1) {
        if (!descs[out[0].attribute]) out[0].title = deviceName
    } else {
        for (t in out) {
            if (!descs[t.attribute]) t.title = deviceName + " — " + t.attribute
        }
    }
    return out
}

def activeHtmlLayoutIds(preferredLayout = null) {
    def source = preferredLayout != null ? preferredLayout : parseFavoritesLayoutState()
    def out = new HashSet()
    for (raw in source) {
        def parsed = parseHtmlLayoutKey(raw)
        if (parsed?.id) out.add(parsed.id)
    }
    return out
}

def discoverHtmlTileCatalog(includeHtmlBodies = false, activeIds = null) {
    def out = []
    def devices = htmlTileDevices ?: []
    def active = null
    if (activeIds instanceof Set) active = activeIds
    else if (activeIds instanceof Collection) active = new HashSet(activeIds)
    def sizes = parseHtmlTileSizesState()
    def zooms = parseHtmlTileZoomsState()
    def titles = parseHtmlTileTitlesState()
    for (d in devices) {
        def tiles = discoverHtmlTilesForDevice(d, includeHtmlBodies, active)
        def roomsCss = null
        def alignCss = null
        def needsCss = false
        if (includeHtmlBodies && isTileBuilderStorageDevice(d)) {
            for (t in tiles) {
                if (t.html != null) { needsCss = true; break }
            }
            if (needsCss) {
                roomsCss = safeCurrent(d, "roomsCSS")
                alignCss = safeCurrent(d, "alignRoomTilesCSS")
            }
        }
        for (t in tiles) {
            def liveTitle = t.title?.toString()?.trim() ?: ""
            def override = titles[t.id]
            def displayTitle = liveTitle
            if (override && override != liveTitle) displayTitle = override
            def entry = [
                id: t.id,
                deviceId: t.deviceId,
                attribute: t.attribute,
                title: displayTitle,
                liveTitle: liveTitle,
                size: (sizes[t.id] ?: "tall"),
                zoom: (zooms[t.id] ?: 100)
            ]
            if (t.html != null) {
                def raw = t.html
                if (raw.toString().size() > maxHtmlAttrBytes()) {
                    entry.error = "too_large"
                } else {
                    entry.html = sanitizeHtmlForDashboard(raw)
                    if (roomsCss) entry.roomsCss = roomsCss.toString()
                    if (alignCss) entry.alignCss = alignCss.toString()
                }
            }
            out << entry
        }
    }
    return out
}

def liveHtmlTileTitleMap() {
    def out = [:]
    for (d in asDeviceList(htmlTileDevices)) {
        for (t in discoverHtmlTilesForDevice(d, false, null)) {
            out[t.id] = t.title
        }
    }
    return out
}

def validHtmlTileIdSet() {
    def set = new HashSet()
    for (t in discoverHtmlTileCatalog(false, null)) set.add(t.id)
    return set
}

def parseHtmlTileSizesState() {
    if (!state.htmlTileSizesJson) return [:]
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(state.htmlTileSizesJson.toString())
        if (!(parsed instanceof Map)) return [:]
        def allowed = htmlSizePresetSet()
        def out = [:]
        for (entry in parsed) {
            def k = entry.key?.toString()?.trim()
            def v = entry.value?.toString()?.trim()
            if (!k || !(k ==~ /^\d+:[A-Za-z0-9_.-]+$/)) continue
            if (!allowed.contains(v)) continue
            out[k] = v
        }
        return out
    } catch (e) {
        return [:]
    }
}

def parseHtmlTileZoomsState() {
    if (!state.htmlTileZoomsJson) return [:]
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(state.htmlTileZoomsJson.toString())
        if (!(parsed instanceof Map)) return [:]
        def allowed = htmlZoomPresetSet()
        def out = [:]
        for (entry in parsed) {
            def k = entry.key?.toString()?.trim()
            if (!k || !(k ==~ /^\d+:[A-Za-z0-9_.-]+$/)) continue
            def n = null
            try {
                n = entry.value instanceof Number ? entry.value.toInteger() : Integer.parseInt(entry.value?.toString() ?: "")
            } catch (e) { n = null }
            if (n == null || !allowed.contains(n)) continue
            out[k] = n
        }
        return out
    } catch (e) {
        return [:]
    }
}

def normalizeHtmlTileTitle(raw) {
    def t = raw?.toString()?.trim() ?: ""
    if (!t) return ""
    if (t.length() > maxEmbedTitleLen()) t = t.substring(0, maxEmbedTitleLen()).trim()
    return t
}

def parseHtmlTileTitlesState() {
    if (!state.htmlTileTitlesJson) return [:]
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(state.htmlTileTitlesJson.toString())
        if (!(parsed instanceof Map)) return [:]
        def out = [:]
        for (entry in parsed) {
            def k = entry.key?.toString()?.trim()
            def v = normalizeHtmlTileTitle(entry.value)
            if (!k || !(k ==~ /^\d+:[A-Za-z0-9_.-]+$/) || !v) continue
            out[k] = v
        }
        return out
    } catch (e) {
        return [:]
    }
}

def htmlTilesJsonFragment() {
    def activeIds = activeHtmlLayoutIds()
    def tiles = discoverHtmlTileCatalog(true, activeIds)
    def out = new StringBuilder()
    out << ",\"htmlTiles\":["
    boolean first = true
    for (t in tiles) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(t.id)
        out << ",\"deviceId\":" << t.deviceId
        out << ",\"attribute\":" << jsonStr(t.attribute)
        out << ",\"title\":" << jsonStr(t.title)
        if (t.liveTitle) out << ",\"liveTitle\":" << jsonStr(t.liveTitle)
        out << ",\"size\":" << jsonStr(t.size ?: "tall")
        out << ",\"zoom\":" << (t.zoom != null ? t.zoom : 100)
        if (t.html != null) out << ",\"html\":" << jsonStr(t.html)
        if (t.error) out << ",\"error\":" << jsonStr(t.error)
        if (t.roomsCss) out << ",\"roomsCss\":" << jsonStr(t.roomsCss)
        if (t.alignCss) out << ",\"alignCss\":" << jsonStr(t.alignCss)
        out << "}"
    }
    out << "]"
    return out.toString()
}

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
    if (s.startsWith("n:")) {
        def rest = s.substring(2).trim()
        if (!rest) return null
        if (rest.startsWith("n_")) rest = rest.substring(2)
        if (!(rest ==~ /^[A-Za-z0-9_-]+$/)) return null
        return "n:" + rest
    }
    if (s.startsWith("n_")) {
        def rest = s.substring(2)
        if (!(rest ==~ /^[A-Za-z0-9_-]+$/)) return null
        return "n:" + rest
    }
    if (s.startsWith("h:")) {
        def rest = s.substring(2).trim()
        def idx = rest.indexOf(":")
        if (idx <= 0) return null
        def idPart = rest.substring(0, idx)
        def attr = rest.substring(idx + 1).trim()
        if (!(idPart ==~ /^\d+$/)) return null
        if (!(attr ==~ /^[A-Za-z0-9_.-]+$/)) return null
        return "h:" + idPart + ":" + attr
    }
    return null
}

def parseHtmlLayoutKey(raw) {
    def k = normalizeEmbedLayoutKey(raw)
    if (!k || !k.startsWith("h:")) return null
    def rest = k.substring(2)
    def idx = rest.indexOf(":")
    if (idx <= 0) return null
    def idPart = rest.substring(0, idx)
    def attr = rest.substring(idx + 1)
    return [id: idPart + ":" + attr, deviceId: idPart.toLong(), attribute: attr]
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

def notificationCardIdFromLayoutKey(key) {
    def k = normalizeEmbedLayoutKey(key)
    if (!k || !k.startsWith("n:")) return null
    return "n_" + k.substring(2)
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

def persistNotificationCards(cards) {
    def json = groovy.json.JsonOutput.toJson(cards)
    if (json.toString().length() > maxNotificationCardsStateBytes()) {
        return [ok: false, error: "notification cards too large"]
    }
    state.notificationCardsJson = json
    return [ok: true]
}

def reconcileFavoritesLayout(deviceIds, embedCards, preferredLayout = null, persist = true, timeCards = null, notificationCards = null) {
    def times = timeCards != null ? timeCards : parseTimeCardsState()
    def notifs = notificationCards != null ? notificationCards : parseNotificationCardsState()
    def validDevices = new HashSet(deviceIds.collect { it.toString() })
    def validEmbeds = new HashSet(embedCards.collect { it.id.toString() })
    def validTimes = new HashSet(times.collect { it.id.toString() })
    def validNotifs = new HashSet(notifs.collect { it.id.toString() })
    def validHtml = validHtmlTileIdSet()
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
        } else if (key.startsWith("n:")) {
            def nid = notificationCardIdFromLayoutKey(key)
            if (!nid || !validNotifs.contains(nid)) continue
            key = "n:" + nid.substring(2)
        } else if (key.startsWith("h:")) {
            def parsed = parseHtmlLayoutKey(key)
            if (!parsed || !validHtml.contains(parsed.id)) continue
            key = htmlLayoutKey(parsed.deviceId, parsed.attribute)
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
    for (card in notifs) {
        def key = "n:" + card.id.toString().substring(2)
        if (!seen.contains(key)) {
            seen.add(key)
            out << key
        }
    }
    // HTML tiles are never auto-appended; only explicit h: layout keys are kept.
    if (persist) state.favoritesLayoutJson = groovy.json.JsonOutput.toJson(out)
    return out
}

def replaceDeviceSlotsInLayout(deviceIds) {
    def cards = parseEmbedCardsState()
    def times = parseTimeCardsState()
    def notifs = parseNotificationCardsState()
    def prev = parseFavoritesLayoutState()
    def deviceQueue = deviceIds.collect { deviceLayoutKey(it) }
    def next = []
    def di = 0
    def validHtml = validHtmlTileIdSet()
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
        } else if (key.startsWith("n:")) {
            def nid = notificationCardIdFromLayoutKey(key)
            if (nid && notifs.find { it.id == nid }) next << ("n:" + nid.substring(2))
        } else if (key.startsWith("h:")) {
            def parsed = parseHtmlLayoutKey(key)
            if (parsed && validHtml.contains(parsed.id)) next << htmlLayoutKey(parsed.deviceId, parsed.attribute)
        }
    }
    while (di < deviceQueue.size()) {
        next << deviceQueue[di]
        di++
    }
    return reconcileFavoritesLayout(deviceIds, cards, next, true, times, notifs)
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

def notificationCardsJsonFragment() {
    def cards = parseNotificationCardsState()
    def out = new StringBuilder()
    out << ",\"notificationCards\":["
    boolean first = true
    for (card in cards) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
        out << ",\"size\":" << jsonStr(card.size) << "}"
    }
    out << "]"
    return out.toString()
}

def favoritesLayoutJsonFragment() {
    // Read-only reconcile for the response; do not rewrite hub state on every /data poll.
    def layout = reconcileFavoritesLayout(parseFavoritesState(), parseEmbedCardsState(), parseFavoritesLayoutState(), false, parseTimeCardsState(), parseNotificationCardsState())
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
    out << "],\"notificationCards\":["
    first = true
    for (card in parseNotificationCardsState()) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
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
    out << "],\"notificationCards\":["
    first = true
    for (card in parseNotificationCardsState()) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
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

def newNotificationCardId() {
    return "n_" + UUID.randomUUID().toString().replace("-", "")
}

def saveNotificationCards() {
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
    def cards = parseNotificationCardsState()
    def embeds = parseEmbedCardsState()
    def times = parseTimeCardsState()
    def deviceIds = parseFavoritesState()

    if (action == "create") {
        if (cards.size() >= maxNotificationCards()) {
            return renderJsonNoStore('{"ok":false,"error":"notification card limit reached"}', 400)
        }
        def size = body?.size?.toString()?.trim()
        if (!notificationSizePresetSet().contains(size)) size = "tall"
        def id = newNotificationCardId()
        cards << [id: id, size: size]
        def persisted = persistNotificationCards(cards)
        if (!persisted.ok) return renderJsonNoStore("{\"ok\":false,\"error\":${jsonStr(persisted.error)}}", 400)
        def layout = parseFavoritesLayoutState()
        layout << ("n:" + id.substring(2))
        def reconciled = reconcileFavoritesLayout(deviceIds, embeds, layout, true, times, cards)
        return renderNotificationCardsResponse(cards, reconciled, id)
    }

    if (action == "update") {
        def id = body?.id?.toString()?.trim()
        if (!id || !id.startsWith("n_")) return renderJsonNoStore('{"ok":false,"error":"missing id"}', 400)
        def idx = -1
        for (int i = 0; i < cards.size(); i++) {
            if (cards[i].id == id) { idx = i; break }
        }
        if (idx < 0) return renderJsonNoStore('{"ok":false,"error":"not found"}', 404)
        def size = body?.size != null ? body.size.toString().trim() : cards[idx].size
        if (!notificationSizePresetSet().contains(size)) size = cards[idx].size
        cards[idx] = [id: id, size: size]
        def persisted = persistNotificationCards(cards)
        if (!persisted.ok) return renderJsonNoStore("{\"ok\":false,\"error\":${jsonStr(persisted.error)}}", 400)
        def reconciled = reconcileFavoritesLayout(deviceIds, embeds, null, true, times, cards)
        return renderNotificationCardsResponse(cards, reconciled, id)
    }

    if (action == "delete") {
        def id = body?.id?.toString()?.trim()
        if (!id || !id.startsWith("n_")) return renderJsonNoStore('{"ok":false,"error":"missing id"}', 400)
        def next = cards.findAll { it.id != id }
        if (next.size() == cards.size()) return renderJsonNoStore('{"ok":false,"error":"not found"}', 404)
        def persisted = persistNotificationCards(next)
        if (!persisted.ok) return renderJsonNoStore("{\"ok\":false,\"error\":${jsonStr(persisted.error)}}", 400)
        def reconciled = reconcileFavoritesLayout(deviceIds, embeds, null, true, times, next)
        return renderNotificationCardsResponse(next, reconciled, id)
    }

    return renderJsonNoStore('{"ok":false,"error":"invalid action"}', 400)
}

def renderNotificationCardsResponse(cards, layout, id = null) {
    def embeds = parseEmbedCardsState()
    def times = parseTimeCardsState()
    def out = new StringBuilder()
    out << "{\"ok\":true"
    if (id != null) out << ",\"id\":" << jsonStr(id)
    out << ",\"notificationCards\":["
    boolean first = true
    for (card in cards) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
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
    def notifs = parseNotificationCardsState()
    def deviceIds = parseFavoritesState()
    def validDevices = new HashSet(deviceIds.collect { it.toString() })
    def cardById = [:]
    for (card in cards) cardById[card.id] = card
    def timeById = [:]
    for (card in times) timeById[card.id] = card
    def notifById = [:]
    for (card in notifs) notifById[card.id] = card
    def validHtml = validHtmlTileIdSet()

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
    def notificationSizes = body?.notificationSizes
    if (notificationSizes != null && !(notificationSizes instanceof Map)) {
        return renderJsonNoStore('{"ok":false,"error":"invalid notificationSizes"}', 400)
    }
    def htmlSizes = body?.htmlSizes
    if (htmlSizes != null && !(htmlSizes instanceof Map)) {
        return renderJsonNoStore('{"ok":false,"error":"invalid htmlSizes"}', 400)
    }
    def htmlZooms = body?.htmlZooms
    if (htmlZooms != null && !(htmlZooms instanceof Map)) {
        return renderJsonNoStore('{"ok":false,"error":"invalid htmlZooms"}', 400)
    }
    def htmlTitles = body?.htmlTitles
    if (htmlTitles != null && !(htmlTitles instanceof Map)) {
        return renderJsonNoStore('{"ok":false,"error":"invalid htmlTitles"}', 400)
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
        } else if (key.startsWith("n:")) {
            def nid = notificationCardIdFromLayoutKey(key)
            if (!nid || !notifById.containsKey(nid)) continue
            def nk = "n:" + nid.substring(2)
            seen.add(nk)
            nextLayout << nk
        } else if (key.startsWith("h:")) {
            def parsed = parseHtmlLayoutKey(key)
            if (!parsed || !validHtml.contains(parsed.id)) continue
            def nk = htmlLayoutKey(parsed.deviceId, parsed.attribute)
            seen.add(nk)
            nextLayout << nk
        }
    }
    // Preserve any omitted devices/embeds/times/notification tiles at the end (deterministic reconcile).
    // HTML tiles are only kept when explicitly present in layoutIn (reconcile does not auto-append them).
    nextLayout = reconcileFavoritesLayout(nextDevices.size() ? nextDevices : deviceIds, cards, nextLayout, true, times, notifs)
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
        nextLayout = reconcileFavoritesLayout(deviceIds, cards, nextLayout, true, times, notifs)
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
        nextLayout = reconcileFavoritesLayout(deviceIds, cards, nextLayout, true, times, notifs)
    }

    // Notification tile sizes live on each card.
    if (notificationSizes != null) {
        def allowed = notificationSizePresetSet()
        def nextNotifs = []
        for (card in notifs) {
            def size = card.size
            if (notificationSizes.containsKey(card.id)) {
                def cand = notificationSizes[card.id]?.toString()?.trim()
                if (allowed.contains(cand)) size = cand
            } else if (notificationSizes.containsKey(card.id.toString().substring(2))) {
                def cand = notificationSizes[card.id.toString().substring(2)]?.toString()?.trim()
                if (allowed.contains(cand)) size = cand
            }
            nextNotifs << [id: card.id, size: size]
        }
        def persisted = persistNotificationCards(nextNotifs)
        if (!persisted.ok) return renderJsonNoStore("{\"ok\":false,\"error\":${jsonStr(persisted.error)}}", 400)
        notifs = nextNotifs
        nextLayout = reconcileFavoritesLayout(deviceIds, cards, nextLayout, true, times, notifs)
    }

    // HTML tile sizes live in a separate map keyed by deviceId:attribute.
    if (htmlSizes != null) {
        def allowed = htmlSizePresetSet()
        def nextHtmlSizes = [:]
        def activeHtml = activeHtmlLayoutIds(nextLayout)
        for (id in activeHtml) {
            def size = "tall"
            if (htmlSizes.containsKey(id)) {
                def cand = htmlSizes[id]?.toString()?.trim()
                if (allowed.contains(cand)) size = cand
            } else {
                def prev = parseHtmlTileSizesState()[id]
                if (prev && allowed.contains(prev)) size = prev
            }
            nextHtmlSizes[id] = size
        }
        state.htmlTileSizesJson = groovy.json.JsonOutput.toJson(nextHtmlSizes)
    } else {
        def prevHtmlSizes = parseHtmlTileSizesState()
        def activeHtml = activeHtmlLayoutIds(nextLayout)
        def pruned = [:]
        for (entry in prevHtmlSizes) {
            def idKey = String.valueOf(entry.key)
            if (activeHtml.contains(idKey)) pruned[idKey] = String.valueOf(entry.value)
        }
        state.htmlTileSizesJson = groovy.json.JsonOutput.toJson(pruned)
    }

    // HTML tile zoom levels live in a separate map keyed by deviceId:attribute.
    if (htmlZooms != null) {
        def allowedZoom = htmlZoomPresetSet()
        def nextHtmlZooms = [:]
        def activeHtmlZoom = activeHtmlLayoutIds(nextLayout)
        for (id in activeHtmlZoom) {
            def zoom = 100
            if (htmlZooms.containsKey(id)) {
                try {
                    def cand = htmlZooms[id] instanceof Number ? htmlZooms[id].toInteger() : Integer.parseInt(htmlZooms[id]?.toString() ?: "")
                    if (allowedZoom.contains(cand)) zoom = cand
                } catch (e) {}
            } else {
                def prev = parseHtmlTileZoomsState()[id]
                if (prev != null && allowedZoom.contains(prev)) zoom = prev
            }
            nextHtmlZooms[id] = zoom
        }
        state.htmlTileZoomsJson = groovy.json.JsonOutput.toJson(nextHtmlZooms)
    } else {
        def prevHtmlZooms = parseHtmlTileZoomsState()
        def activeHtmlZoom = activeHtmlLayoutIds(nextLayout)
        def prunedZoom = [:]
        for (entry in prevHtmlZooms) {
            def idKey = String.valueOf(entry.key)
            if (activeHtmlZoom.contains(idKey)) prunedZoom[idKey] = entry.value
        }
        state.htmlTileZoomsJson = groovy.json.JsonOutput.toJson(prunedZoom)
    }

    // HTML tile display titles (user overrides only — never persist live hub/Tile Builder names).
    if (htmlTitles != null) {
        def nextHtmlTitles = [:]
        def activeHtmlTitles = activeHtmlLayoutIds(nextLayout)
        def liveTitles = liveHtmlTileTitleMap()
        // Prefer iterating the payload so Hubitat LazyMap key typing cannot drop overrides.
        for (entry in htmlTitles) {
            def id = entry.key?.toString()?.trim()
            if (!id || !activeHtmlTitles.contains(id)) continue
            def title = normalizeHtmlTileTitle(entry.value)
            if (!title) continue
            def live = liveTitles[id]?.toString()?.trim() ?: ""
            if (live && title == live) continue
            nextHtmlTitles[id] = title
        }
        state.htmlTileTitlesJson = groovy.json.JsonOutput.toJson(nextHtmlTitles)
    } else {
        def prevHtmlTitles = parseHtmlTileTitlesState()
        def activeHtmlTitles = activeHtmlLayoutIds(nextLayout)
        def prunedTitles = [:]
        for (entry in prevHtmlTitles) {
            def idKey = String.valueOf(entry.key)
            if (activeHtmlTitles.contains(idKey)) prunedTitles[idKey] = String.valueOf(entry.value)
        }
        state.htmlTileTitlesJson = groovy.json.JsonOutput.toJson(prunedTitles)
    }

    def htmlSizeMap = parseHtmlTileSizesState()
    def htmlZoomMap = parseHtmlTileZoomsState()
    def htmlTitleMap = parseHtmlTileTitlesState()

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
    out << "],\"notificationCards\":["
    first = true
    for (card in notifs) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
        out << ",\"size\":" << jsonStr(card.size) << "}"
    }
    out << "],\"htmlSizes\":{"
    first = true
    for (entry in htmlSizeMap) {
        if (!first) out << ","; first = false
        out << jsonStr(entry.key.toString()) << ":" << jsonStr(entry.value.toString())
    }
    out << "},\"htmlZooms\":{"
    first = true
    for (entry in htmlZoomMap) {
        if (!first) out << ","; first = false
        out << jsonStr(entry.key.toString()) << ":" << entry.value
    }
    out << "},\"htmlTitles\":{"
    first = true
    for (entry in htmlTitleMap) {
        if (!first) out << ","; first = false
        out << jsonStr(entry.key.toString()) << ":" << jsonStr(entry.value.toString())
    }
    out << "},\"favoritesLayout\":["
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

def htmlTileSizesJsonFragment() {
    def sizes = parseHtmlTileSizesState()
    def out = new StringBuilder()
    out << ",\"htmlSizes\":{"
    boolean first = true
    for (entry in sizes) {
        if (!first) out << ","; first = false
        out << jsonStr(String.valueOf(entry.key)) << ":" << jsonStr(String.valueOf(entry.value))
    }
    out << "}"
    return out.toString()
}

def htmlTileZoomsJsonFragment() {
    def zooms = parseHtmlTileZoomsState()
    def out = new StringBuilder()
    out << ",\"htmlZooms\":{"
    boolean first = true
    for (entry in zooms) {
        if (!first) out << ","; first = false
        out << jsonStr(String.valueOf(entry.key)) << ":" << entry.value
    }
    out << "}"
    return out.toString()
}

def htmlTileTitlesJsonFragment() {
    def titles = parseHtmlTileTitlesState()
    def out = new StringBuilder()
    out << ",\"htmlTitles\":{"
    boolean first = true
    for (entry in titles) {
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
    // location.modes is List<Mode>; compare by name (contains(String) is unreliable).
    def match = modes.find { m ->
        def n = (m?.name != null) ? m.name.toString() : m?.toString()
        return n == modeName
    }
    if (!match) {
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

def holidayModuleInstalled() {
    return holidayFilePresent() && holidaysChild()
}

def holidayFilePresent() {
    def names = []
    try { names = listLocalFileNames() } catch (e) { names = [] }
    if (names) {
        def present = fileNamePresent(names, assetJsHolidayFile())
        state.holidayFileSeen = present
        return present
    }
    return state.holidayFileSeen == true
}

def holidayEnsureChild() {
    if (!holidayFilePresent()) return
    if (holidaysChild()) return
    try {
        addChildApp("mDash", "mDash Shabbat and Holidays", "Shabbat & holidays")
        log.info "Modern Dashboard: Shabbat & holidays is on because mld-holiday.js is in File Manager."
    } catch (e) {
        log.info "Modern Dashboard: mld-holiday.js is in File Manager. Install the mDash Shabbat and Holidays package with Hubitat Package Manager so schedules can run."
    }
}

def holidaysChild() {
    def kids = []
    try { kids = getChildApps() ?: [] } catch (e) { kids = [] }
    for (child in kids) {
        def name = ""
        try { name = "${child?.getLabel() ?: ''} ${child?.name ?: ''}" } catch (e) { name = "" }
        if (name.contains("Shabbat") || name.contains("Holiday")) return child
    }
    return null
}

def holidaysAvailable() {
    if (!schedulerIsEnabled()) return false
    if (!holidayFilePresent()) return false
    def child = holidaysChild()
    if (!child) return true
    try { return child.holidayIsAvailable() == true } catch (e) { return true }
}

def holidayNotifyChild() {
    def child = holidaysChild()
    if (!child) return
    try { child.holidayParentPause(!schedulerIsEnabled()) } catch (e) {
        log.warn "Modern Dashboard: holiday child pause failed: ${e}"
    }
}

def holidaysRoute(String method) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def child = holidaysChild()
    if (!child) return renderJsonNoStore('{"ok":false,"error":"Install the optional mDash Shabbat and Holidays app with Hubitat Package Manager."}', 404)
    def body = null
    if (method != "status" && method != "later") {
        body = request?.JSON
        if (body == null) {
            try {
                def raw = request?.postBody ?: request?.content
                if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
            } catch (e) {}
        }
    }
    def result = null
    try {
        if (method == "status") result = child.holidaysStatus()
        else if (method == "later") result = child.holidaysLater()
        else if (method == "save") result = child.holidaysSave(body)
        else if (method == "preview") result = child.holidaysPreview(body)
        else if (method == "test") result = child.holidaysTest(body)
        else if (method == "skip") result = child.holidaysSkip(body)
        else if (method == "refresh") {
            child.holidayRefresh()
            result = child.holidaysStatus()
            result.ok = true
        }
    } catch (e) {
        log.warn "Modern Dashboard: holiday ${method} failed: ${e}"
        return renderJsonNoStore("{\"ok\":false,\"error\":${jsonStr(e.message ?: e.toString())}}", 500)
    }
    def json = groovy.json.JsonOutput.toJson(result ?: [ok: false])
    return renderJsonNoStore(withAuthJson(json), 200)
}

def holidaysGet() { return holidaysRoute("status") }
def holidaysLaterGet() { return holidaysRoute("later") }
def holidaysSave() { return holidaysRoute("save") }
def holidaysPreview() { return holidaysRoute("preview") }
def holidaysTest() { return holidaysRoute("test") }
def holidaysSkip() { return holidaysRoute("skip") }
def holidaysRefresh() { return holidaysRoute("refresh") }

def holidaySupportedKinds() {
    return ["light", "outlet", "blind", "fan", "lock", "thermostat"]
}

def holidayFindDevice(list, id) {
    if (id == null) return null
    return list?.find { it?.id?.toString() == id.toString() }
}

def holidayRunAction(states) {
    def result = newScheduleActionResult()
    if (!(states instanceof List)) return result
    int delay = 0
    try { delay = lightControlMeterDelayMsValue() as Integer } catch (e) { delay = 0 }
    if (lightControlDisableMetering == true) delay = 0
    boolean first = true
    for (st in states) {
        if (st == null) continue
        if (!first && delay > 0) {
            try { pauseExecution(delay) } catch (e) {}
        }
        first = false
        def kind = st?.kind?.toString() ?: "light"
        if (kind == "outlet") {
            runScheduleOnOffAction([states: [[id: st?.id, on: (st?.on == true)]]], outletSwitches, result)
        } else if (kind == "light") {
            runScheduleLightAction([states: [[id: st?.id, on: (st?.on == true), level: st?.level, ct: st?.ct]]], result)
        } else {
            holidayRunKind(kind, st, result)
        }
    }
    return [
        attempted: result.attempted,
        succeeded: result.succeeded,
        missing: result.missing,
        failed: result.failed
    ]
}

// Blinds, fans, locks, and thermostats. Lights and outlets never reach here.
def holidayRunKind(kind, st, result) {
    result.attempted++
    def id = st?.id?.toString()
    def dev = null
    if (kind == "blind") dev = holidayFindDevice(allWindowShades(), id)
    else if (kind == "fan") dev = holidayFindDevice(ceilingFans, id)
    else if (kind == "lock") dev = holidayFindDevice(locks, id)
    else if (kind == "thermostat") dev = holidayFindDevice(thermostats, id)
    if (!dev) {
        if (id) result.missing << id
        return
    }
    try {
        if (kind == "blind") {
            if (st?.open == true && st?.position != null && st.position.toString().trim()) runShadeCmd(dev, "setPosition", st.position)
            else runShadeCmd(dev, st?.open == true ? "open" : "close", null)
        } else if (kind == "fan") {
            if (st?.on != true) runFanCmd(dev, "off", null)
            else if (st?.speed?.toString()?.trim()) runFanCmd(dev, "setSpeed", st.speed)
            else runFanCmd(dev, "on", null)
        } else if (kind == "lock") {
            runLockCmd(dev, st?.locked == false ? "unlock" : "lock", null)
        } else if (kind == "thermostat") {
            if (runThermostatSetting(dev, st) != true) {
                result.failed << id
                return
            }
        } else {
            result.missing << id
            return
        }
        result.succeeded++
    } catch (e) {
        result.failed << id
        log.warn "Modern Dashboard: holiday ${kind} failed for ${id}: ${e}"
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
    try { unsubscribe("hsmStatusChanged") } catch (e) {}
    try { unsubscribe("hsmAlertChanged") } catch (e) {}
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
// Dashboard triggers (camera overlay / tones / notification text)
// ---------------------------------------------------------------------------
def maxTriggerRules() { return 6 }
def maxTriggerQueue() { return 20 }
def maxTriggerTextLen() { return 240 }
def defaultToneExpireMs() { return 15000L }

def triggersSectionCollapsed() {
    if (triggersEnabled == true) return false
    if (alertsArmSwitch) return false
    if (asDeviceList(triggerContactDevices)) return false
    if (asDeviceList(triggerMotionDevices)) return false
    if (asDeviceList(triggerButtonDevices)) return false
    return true
}

def triggersIsEnabled() {
    return triggersEnabled == true
}

def overlayDurationChoices() {
    return [
        ["15": "15 seconds"],
        ["30": "30 seconds"],
        ["60": "60 seconds"],
        ["120": "2 minutes"],
        ["300": "5 minutes"]
    ]
}

def overlayDurationOverrideChoices() {
    return [["default": "Use the app default"]] + overlayDurationChoices()
}

/** Accept enum keys, ints, or Hubitat labels like "15 seconds" / "2 minutes". */
def parseOverlayDurationSec(raw) {
    if (raw == null) return null
    def s = raw.toString().trim()
    if (!s) return null
    def lower = s.toLowerCase()
    if (lower == "default" || lower == "use default" || lower == "none") return null
    try {
        if (s.isInteger()) {
            def n = s.toInteger()
            if (n == 15 || n == 30 || n == 60 || n == 120 || n == 300) return n
        }
    } catch (e) {}
    // Hubitat sometimes stores the display label instead of the option key.
    if (lower == "15 seconds" || lower.startsWith("15 sec")) return 15
    if (lower == "30 seconds" || lower.startsWith("30 sec")) return 30
    if (lower == "60 seconds" || lower.startsWith("60 sec") || lower == "1 minute" || lower == "1 min") return 60
    if (lower == "2 minutes" || lower == "2 minute" || lower == "120 seconds" || lower.startsWith("2 min")) return 120
    if (lower == "5 minutes" || lower == "5 minute" || lower == "300 seconds" || lower.startsWith("5 min")) return 300
    // Leading digits only when the remainder is clearly a unit suffix.
    try {
        def m = (lower =~ /^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes)?$/)
        if (m.matches()) {
            def n = m.group(1).toInteger()
            def unit = m.group(2) ?: "s"
            if (unit.startsWith("m")) n = n * 60
            if (n == 15 || n == 30 || n == 60 || n == 120 || n == 300) return n
        }
    } catch (e) {}
    return null
}

def triggerDefaultDurationSec() {
    def v = parseOverlayDurationSec(triggerOverlaySec)
    return (v != null) ? v : 60
}

def parseTriggerRulesMap() {
    if (!state.triggerRulesJson) return [:]
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(state.triggerRulesJson.toString())
        return (parsed instanceof Map) ? parsed : [:]
    } catch (e) {
        return [:]
    }
}

def saveTriggerRulesMap(map) {
    state.triggerRulesJson = groovy.json.JsonOutput.toJson(map ?: [:])
}

def parseTriggerCooldownMap() {
    if (!state.triggerCooldownJson) return [:]
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(state.triggerCooldownJson.toString())
        return (parsed instanceof Map) ? parsed : [:]
    } catch (e) {
        return [:]
    }
}

def saveTriggerCooldownMap(map) {
    state.triggerCooldownJson = groovy.json.JsonOutput.toJson(map ?: [:])
}

def triggerRulesSummary() {
    def n = parseTriggerRulesMap().size()
    if (!triggersIsEnabled()) return "Off"
    if (n == 0) return "None yet"
    return n == 1 ? "1 trigger" : "${n} triggers"
}

def triggerHumanDuration(sec) {
    def n = null
    try { if (sec != null) n = sec.toString().toInteger() } catch (e) { n = null }
    if (n == 15) return "15 seconds"
    if (n == 30) return "30 seconds"
    if (n == 60) return "1 minute"
    if (n == 120) return "2 minutes"
    if (n == 300) return "5 minutes"
    if (n != null && n > 0) return "${n} seconds"
    return "the default time"
}

def triggerCameraDisplayName(cameraId) {
    def key = cameraId?.toString()?.trim()
    if (!key || key == "none") return null
    for (d in allCameraDevices()) {
        try {
            if (d?.id?.toString() == key) return d.displayName?.toString() ?: key
        } catch (e) {}
    }
    return "camera ${key}"
}

def triggerRuleLabel(r) {
    if (!(r instanceof Map)) return "Trigger"
    def name = r.name?.toString()?.trim()
    if (name) return name
    def dname = r.deviceName?.toString()?.trim()
    if (dname) return dname
    def kind = r.kind?.toString() ?: "trigger"
    return kind.substring(0, 1).toUpperCase() + kind.substring(1) + " trigger"
}

def triggerRuleSummary(r) {
    return triggerRuleStory(r)
}

def triggerWhenPhrase(kind, deviceName, button) {
    def dname = (deviceName ?: "that device").toString()
    def k = kind?.toString() ?: ""
    if (k == "contact") return "${dname} opens"
    if (k == "motion") return "motion on ${dname}"
    if (k == "button") return "${dname} button ${button ?: 1} is pressed"
    return dname
}

def triggerActionPhrases(cameraId, toneId, text, durationSec) {
    def actions = []
    def camName = triggerCameraDisplayName(cameraId)
    if (camName) {
        actions << "show ${camName} for ${triggerHumanDuration(durationSec)}"
    }
    def tone = toneId?.toString()
    if (tone && tone != "none") {
        if (tone == "chime") actions << "play a gentle chime"
        else if (tone == "alert") actions << "play an alert tone"
        else actions << "play a sound"
    }
    def msg = text?.toString()?.trim()
    if (msg) {
        def shortMsg = msg.length() > 48 ? (msg.substring(0, 45) + "…") : msg
        actions << "say \"${shortMsg}\""
    }
    return actions
}

def triggerJoinEnglish(parts) {
    if (!parts) return ""
    if (parts.size() == 1) return parts[0]
    if (parts.size() == 2) return parts[0] + " and " + parts[1]
    return parts[0..-2].join(", ") + ", and " + parts[-1]
}

def triggerRuleStory(r) {
    if (!(r instanceof Map)) return ""
    def whenBit = triggerWhenPhrase(r.kind, r.deviceName, r.button)
    def actions = triggerActionPhrases(r.cameraId, r.toneId, r.text, r.durationSec)
    if (!actions) return "When ${whenBit} — no actions configured yet"
    return "When ${whenBit} → ${triggerJoinEnglish(actions)}"
}

def triggerEditPreviewHtml() {
    def kind = trigEditKind?.toString() ?: "contact"
    def dev = triggerDeviceById(trigEditDevice)
    def dname = dev?.displayName?.toString()
    if (!dname) dname = trigEditDevice ? "the selected device" : "a device you choose"
    def button = 1
    try { if (trigEditButton != null) button = trigEditButton.toString().toInteger() } catch (e) { button = 1 }
    def whenBit = triggerWhenPhrase(kind, dname, button)
    def cam = trigEditCamera?.toString()?.trim()
    if (cam == "" || cam == "none") cam = null
    def tone = trigEditTone?.toString()?.trim()
    def text = trigEditText?.toString()?.trim() ?: ""
    def dur = parseOverlayDurationSec(trigEditDuration)
    def actions = triggerActionPhrases(cam, tone, text, dur)
    def enabled = (trigEditEnabled != false)
    def pauseNote = enabled ? "" : " <i>(currently paused)</i>"
    if (!actions) {
        return "When <b>${htmlEsc(whenBit)}</b>, your tablets will… <i>pick a camera, sound, or message below</i>.${pauseNote}"
    }
    return "When <b>${htmlEsc(whenBit)}</b>, your tablets will <b>${htmlEsc(triggerJoinEnglish(actions))}</b>.${pauseNote}"
}

def triggerContactDeviceList() {
    return asDeviceList(triggerContactDevices)
}

def triggerMotionDeviceList() {
    return asDeviceList(triggerMotionDevices)
}

def triggerButtonDeviceList() {
    return asDeviceList(triggerButtonDevices)
}

def triggerDeviceById(id) {
    def key = id?.toString()
    if (!key) return null
    for (list in [triggerContactDeviceList(), triggerMotionDeviceList(), triggerButtonDeviceList()]) {
        for (d in list) {
            try {
                if (d?.id?.toString() == key) return d
            } catch (e) {}
        }
    }
    return null
}

def triggerDeviceEnumOptions(kind) {
    def list = []
    if (kind == "motion") list = triggerMotionDeviceList()
    else if (kind == "button") list = triggerButtonDeviceList()
    else list = triggerContactDeviceList()
    def opts = []
    for (d in list) {
        try {
            opts << ["${d.id}": d.displayName?.toString() ?: d.id.toString()]
        } catch (e) {}
    }
    return opts
}

def triggerCameraEnumOptions() {
    def opts = [["none": "Don't show a camera"]]
    for (d in allCameraDevices()) {
        try {
            opts << ["${d.id}": d.displayName?.toString() ?: d.id.toString()]
        } catch (e) {}
    }
    return opts
}

def triggerNewRuleId() {
    def seq = (state.triggerRuleSeq instanceof Number) ? state.triggerRuleSeq.longValue() : 0L
    seq++
    state.triggerRuleSeq = seq
    return "tr_${now()}_${seq}"
}

def triggerNormalizeRule(Map raw, String existingId) {
    def kind = raw?.kind?.toString()?.trim()?.toLowerCase()
    if (kind != "contact" && kind != "motion" && kind != "button") {
        return [error: "Invalid trigger type"]
    }
    def deviceId = raw?.deviceId?.toString()?.trim()
    if (!deviceId) return [error: "Choose which device should start this trigger"]
    def dev = triggerDeviceById(deviceId)
    if (!dev) return [error: "That device isn't in your Dashboard triggers pickers — add it on the main settings page"]
    // Ensure device matches kind pickers.
    def okKind = false
    if (kind == "contact") okKind = (triggerContactDeviceList().find { it?.id?.toString() == deviceId } != null)
    else if (kind == "motion") okKind = (triggerMotionDeviceList().find { it?.id?.toString() == deviceId } != null)
    else if (kind == "button") okKind = (triggerButtonDeviceList().find { it?.id?.toString() == deviceId } != null)
    if (!okKind) return [error: "That device doesn't match the event type you picked"]

    def cameraId = raw?.cameraId?.toString()?.trim()
    if (cameraId == "" || cameraId == "none") cameraId = null
    if (cameraId && !validCameraIdSet().contains(cameraId)) {
        return [error: "That camera isn't configured in this app anymore — pick another or choose Don't show a camera"]
    }

    def toneId = raw?.toneId?.toString()?.trim()?.toLowerCase()
    if (!toneId || toneId == "none") toneId = null
    else if (toneId != "chime" && toneId != "alert") {
        return [error: "Pick a sound option from the list"]
    }

    def text = raw?.text?.toString()?.trim() ?: ""
    if (text.length() > maxTriggerTextLen()) text = text.substring(0, maxTriggerTextLen())
    if (!cameraId && !toneId && !text) {
        return [error: "Choose at least one action — a camera, a sound, or a message"]
    }

    def button = 1
    if (kind == "button") {
        try { button = (raw?.button != null) ? raw.button.toString().toInteger() : 1 } catch (e) { button = 1 }
        if (button < 1 || button > 20) return [error: "Button number should be between 1 and 20"]
    }

    def cooldownSec = 10
    try {
        if (raw?.cooldownSec != null) cooldownSec = raw.cooldownSec.toString().toInteger()
    } catch (e) { cooldownSec = 10 }
    if (cooldownSec < 1) cooldownSec = 1
    if (cooldownSec > 600) cooldownSec = 600

    def durationSec = null
    def rawDur = raw?.durationSec
    if (rawDur != null && rawDur.toString().trim()) {
        def lower = rawDur.toString().trim().toLowerCase()
        if (lower != "default" && lower != "use default" && lower != "use the app default" && lower != "none") {
            durationSec = parseOverlayDurationSec(rawDur)
            if (durationSec == null) return [error: "Pick a camera duration from the list"]
        }
    }

    def name = raw?.name?.toString()?.trim() ?: ""
    if (name.length() > 40) name = name.substring(0, 40)

    def id = existingId?.toString()?.trim()
    if (!id) id = triggerNewRuleId()
    def rule = [
        id: id,
        name: name,
        enabled: raw?.enabled != false,
        kind: kind,
        deviceId: deviceId,
        deviceName: dev.displayName?.toString() ?: "",
        button: (kind == "button") ? button : null,
        cameraId: cameraId,
        toneId: toneId,
        text: text,
        durationSec: durationSec,
        cooldownSec: cooldownSec
    ]
    return [rule: rule]
}

def triggerSaveRuleFromUi() {
    state.remove("triggerEditError")
    def existingId = state.triggerEditRuleId?.toString()?.trim() ?: ""
    def raw = [
        enabled: trigEditEnabled != false,
        name: trigEditName,
        kind: trigEditKind,
        deviceId: trigEditDevice,
        button: trigEditButton,
        cameraId: trigEditCamera,
        toneId: trigEditTone,
        text: trigEditText,
        durationSec: trigEditDuration,
        cooldownSec: trigEditCooldown
    ]
    def result = triggerNormalizeRule(raw, existingId)
    if (result.error) {
        state.triggerEditError = result.error
        return
    }
    def map = parseTriggerRulesMap()
    if (!existingId && map.size() >= maxTriggerRules()) {
        state.triggerEditError = "Rule limit reached (${maxTriggerRules()})"
        return
    }
    def rule = result.rule
    map[rule.id] = rule
    saveTriggerRulesMap(map)
    triggerCancelEdit()
    try { initializeTriggers() } catch (e) {}
}

def triggerDeleteRule(rid) {
    def id = rid?.toString()?.trim()
    if (!id) return
    def map = parseTriggerRulesMap()
    map.remove(id)
    saveTriggerRulesMap(map)
    def cool = parseTriggerCooldownMap()
    cool.remove(id)
    saveTriggerCooldownMap(cool)
    try { initializeTriggers() } catch (e) {}
}

def readAlertsArmed() {
    def sw = alertsArmSwitch
    // Optional switch: when unset, tones are always armed. When set, OFF shunts tones.
    if (!sw) return true
    try {
        return safeCurrent(sw, "switch") == "on"
    } catch (e) {
        return false
    }
}

def triggerSourceIdsJsonArray() {
    def ids = new LinkedHashSet()
    for (list in [triggerContactDeviceList(), triggerMotionDeviceList(), triggerButtonDeviceList()]) {
        for (d in list) {
            try { if (d?.id != null) ids.add(d.id.toString()) } catch (e) {}
        }
    }
    def out = new StringBuilder()
    out << "["
    boolean first = true
    for (id in ids) {
        if (!first) out << ","
        first = false
        out << jsonStr(id)
    }
    out << "]"
    return out.toString()
}

def initializeTriggers() {
    try { unsubscribe("triggerDeviceEvent") } catch (e) {}
    try { unsubscribe("alertsArmSwitchEvent") } catch (e) {}
    state.alertsArmed = readAlertsArmed()
    if (!triggersIsEnabled()) return
    def sw = alertsArmSwitch
    if (sw) {
        try { subscribe(sw, "switch", alertsArmSwitchEvent) } catch (e) {}
    }
    // Collect required attributes per device so combo sensors (contact+motion)
    // can subscribe to every attribute used by enabled rules.
    def attrsByDevice = [:]
    def deviceById = [:]
    parseTriggerRulesMap().each { rid, r ->
        if (!(r instanceof Map) || r.enabled == false) return
        def d = triggerDeviceById(r.deviceId)
        if (!d) return
        def key = null
        try { key = d.id?.toString() } catch (e) {}
        if (!key) return
        deviceById[key] = d
        def kind = r.kind?.toString()
        def attrs = attrsByDevice[key]
        if (!(attrs instanceof Set)) {
            attrs = new HashSet()
            attrsByDevice[key] = attrs
        }
        if (kind == "contact") attrs.add("contact")
        else if (kind == "motion") attrs.add("motion")
        else if (kind == "button") {
            attrs.add("pushed")
            attrs.add("button")
        }
    }
    attrsByDevice.each { key, attrs ->
        def d = deviceById[key]
        if (!d || !(attrs instanceof Set)) return
        for (attrName in attrs) {
            try { subscribe(d, attrName.toString(), triggerDeviceEvent) } catch (e) {}
        }
    }
}

def alertsArmSwitchEvent(evt) {
    state.alertsArmed = (evt?.value?.toString() == "on")
}

def triggerDeviceEvent(evt) {
    if (!triggersIsEnabled()) return
    def deviceId = null
    try { deviceId = evt?.deviceId?.toString() } catch (e) {}
    if (!deviceId) {
        try { deviceId = evt?.device?.id?.toString() } catch (e2) {}
    }
    if (!deviceId) return
    def attr = evt?.name?.toString()
    def value = evt?.value?.toString()
    if (!attr || value == null) return
    def nowMs = now()
    def cool = parseTriggerCooldownMap()
    def rules = parseTriggerRulesMap()
    rules.each { ridKey, r ->
        if (!(r instanceof Map) || r.enabled == false) return
        if (r.deviceId?.toString() != deviceId) return
        def kind = r.kind?.toString()
        def match = false
        if (kind == "contact" && attr == "contact" && value == "open") match = true
        else if (kind == "motion" && attr == "motion" && value == "active") match = true
        else if (kind == "button" && (attr == "pushed" || attr == "button")) {
            def want = 1
            try { if (r.button != null) want = r.button.toString().toInteger() } catch (e) { want = 1 }
            def got = 1
            try { got = value.toString().toInteger() } catch (e) {
                got = -1
            }
            if (got == want) match = true
        }
        if (!match) return
        def rid = (r.id ?: ridKey)?.toString()
        if (!rid) return
        def last = 0L
        try {
            if (cool[rid] != null) last = cool[rid].toString().toLong()
        } catch (e) { last = 0L }
        def cooldownMs = 10000L
        try {
            if (r.cooldownSec != null) cooldownMs = r.cooldownSec.toString().toInteger() * 1000L
        } catch (e) { cooldownMs = 10000L }
        if (cooldownMs < 1000L) cooldownMs = 1000L
        if ((nowMs - last) < cooldownMs) return
        cool[rid] = nowMs
        saveTriggerCooldownMap(cool)
        enqueueTriggerActionFromRule(r)
    }
}

def liveNotificationIdSet() {
    def ids = new HashSet()
    for (item in parseNotificationsState()) {
        def nid = item?.id?.toString()?.trim()
        if (nid) ids.add(nid)
    }
    return ids
}

def pruneTriggerActionsForNotification(notifId) {
    def key = notifId?.toString()?.trim()
    if (!key) return
    def list = parseTriggerActionsState()
    def next = []
    for (item in list) {
        if (!(item instanceof Map)) continue
        if (item.notificationId?.toString() != key) {
            next << item
            continue
        }
        // Text-only actions die with their notification.
        if (!item.cameraId && !item.toneId) continue
        // Keep live camera/tone actions; drop the dead notification link.
        next << [
            id: item.id,
            ts: item.ts,
            ruleId: item.ruleId,
            cameraId: item.cameraId,
            toneId: item.toneId,
            caption: item.caption ?: "",
            notificationId: null,
            cameraExpiresAt: item.cameraExpiresAt,
            toneExpiresAt: item.toneExpiresAt
        ]
    }
    persistTriggerActionsState(next)
}

def parseTriggerActionsState() {
    if (!state.triggerActionsJson) return []
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(state.triggerActionsJson.toString())
        if (!(parsed instanceof List)) return []
        def nowMs = now()
        def liveNotifs = null
        def out = []
        for (item in parsed) {
            if (!(item instanceof Map)) continue
            def id = item.id?.toString()?.trim()
            if (!id) continue
            def camExp = null
            def toneExp = null
            try { if (item.cameraExpiresAt != null) camExp = item.cameraExpiresAt.toString().toLong() } catch (e) {}
            try { if (item.toneExpiresAt != null) toneExp = item.toneExpiresAt.toString().toLong() } catch (e) {}
            // Drop fully expired entries.
            def camLive = (item.cameraId && camExp != null && camExp > nowMs)
            def toneLive = (item.toneId && toneExp != null && toneExp > nowMs)
            def notifId = item.notificationId?.toString()?.trim()
            def textOnly = (!item.cameraId && !item.toneId && notifId)
            if (textOnly) {
                // Drop orphaned text-only actions whose notification was already acked.
                if (liveNotifs == null) liveNotifs = liveNotificationIdSet()
                if (!liveNotifs.contains(notifId)) continue
            }
            if (!camLive && !toneLive && !textOnly) continue
            out << [
                id: id,
                ts: (item.ts instanceof Number) ? item.ts.longValue() : nowMs,
                ruleId: item.ruleId?.toString() ?: "",
                cameraId: item.cameraId?.toString(),
                toneId: item.toneId?.toString(),
                caption: item.caption?.toString() ?: "",
                notificationId: notifId,
                cameraExpiresAt: camExp,
                toneExpiresAt: toneExp
            ]
            if (out.size() >= maxTriggerQueue()) break
        }
        return out
    } catch (e) {
        return []
    }
}

def persistTriggerActionsState(list) {
    def capped = (list instanceof List) ? list.take(maxTriggerQueue()) : []
    state.triggerActionsJson = groovy.json.JsonOutput.toJson(capped)
}

def triggerActionListJson(list) {
    def out = new StringBuilder()
    out << "["
    boolean first = true
    def nowMs = now()
    for (item in list) {
        def camExp = item.cameraExpiresAt
        def toneExp = item.toneExpiresAt
        def camLive = (item.cameraId && camExp != null && camExp > nowMs)
        def toneLive = (item.toneId && toneExp != null && toneExp > nowMs)
        def textOnly = (!item.cameraId && !item.toneId && item.notificationId)
        if (!camLive && !toneLive && !textOnly) continue
        if (!first) out << ","
        first = false
        out << "{\"id\":" << jsonStr(item.id)
        out << ",\"ts\":" << (item.ts ?: 0)
        out << ",\"ruleId\":" << jsonStr(item.ruleId ?: "")
        if (item.cameraId && camLive) {
            out << ",\"cameraId\":" << jsonStr(item.cameraId)
            out << ",\"cameraExpiresAt\":" << camExp
        }
        if (item.toneId && toneLive) {
            out << ",\"toneId\":" << jsonStr(item.toneId)
            out << ",\"toneExpiresAt\":" << toneExp
        }
        out << ",\"caption\":" << jsonStr(item.caption ?: "")
        if (item.notificationId) out << ",\"notificationId\":" << jsonStr(item.notificationId)
        out << "}"
    }
    out << "]"
    return out.toString()
}

def enqueueTriggerActionFromRule(r) {
    if (!(r instanceof Map)) return
    def nowMs = now()
    def durationSec = triggerDefaultDurationSec()
    def overrideSec = parseOverlayDurationSec(r?.durationSec)
    if (overrideSec != null) durationSec = overrideSec
    def cameraId = r.cameraId?.toString()?.trim()
    if (cameraId == "" || cameraId == "none") cameraId = null
    if (cameraId && !validCameraIdSet().contains(cameraId)) cameraId = null
    def toneId = r.toneId?.toString()?.trim()
    if (!toneId || toneId == "none") toneId = null
    // Shunt silences tones only.
    if (toneId && !readAlertsArmed()) toneId = null
    def text = r.text?.toString()?.trim() ?: ""
    if (text.length() > maxTriggerTextLen()) text = text.substring(0, maxTriggerTextLen())
    if (!cameraId && !toneId && !text) return

    def notificationId = null
    if (text) {
        appendNotification(text, r.deviceId, r.deviceName ?: "")
        def list = parseNotificationsState()
        if (list) {
            def last = list[list.size() - 1]
            notificationId = last?.id?.toString()
        }
    }

    def list = parseTriggerActionsState()
    // Newest camera supersedes prior unacked camera actions.
    if (cameraId) {
        list = list.findAll { !(it.cameraId) }
    }
    def seq = (state.triggerActionSeq instanceof Number) ? state.triggerActionSeq.longValue() : 0L
    seq++
    state.triggerActionSeq = seq
    def id = "ta_${nowMs}_${seq}"
    def expireAt = cameraId ? (nowMs + ((durationSec as Long) * 1000L)) : null
    def entry = [
        id: id,
        ts: nowMs,
        ruleId: r.id?.toString() ?: "",
        cameraId: cameraId,
        toneId: toneId,
        caption: text,
        notificationId: notificationId,
        cameraExpiresAt: expireAt,
        toneExpiresAt: toneId ? (nowMs + defaultToneExpireMs()) : null
    ]
    list << entry
    while (list.size() > maxTriggerQueue()) {
        list.remove(0)
    }
    persistTriggerActionsState(list)
}

def triggerSendTestAction() {
    state.remove("triggerTestOk")
    state.remove("triggerTestError")
    if (!triggersIsEnabled()) {
        state.triggerTestError = "Enable dashboard triggers first"
        return
    }
    def cams = allCameraDevices()
    def cameraId = cams ? cams[0]?.id?.toString() : null
    def text = "mDash trigger test"
    def toneId = readAlertsArmed() ? "chime" : null
    def fake = [
        id: "test",
        cameraId: cameraId,
        toneId: toneId,
        text: text,
        durationSec: triggerDefaultDurationSec(),
        deviceId: null,
        deviceName: "Test"
    ]
    enqueueTriggerActionFromRule(fake)
    def dur = triggerDefaultDurationSec()
    state.triggerTestOk = cameraId ?
        "Queued test action (camera ${cameraId}, ${dur}s overlay${toneId ? ", tone" : ", no tone (shunted)"}, notification)." :
        "Queued test action (no camera configured; notification${toneId ? " + tone" : ""}; default overlay ${dur}s)."
}

def triggerActionsGet() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def list = parseTriggerActionsState()
    // Persist pruned list so expiry sticks.
    persistTriggerActionsState(list)
    def out = new StringBuilder()
    out << '{"ok":true,"alertsArmed":' << (readAlertsArmed() ? "true" : "false")
    out << ',"triggersEnabled":' << (triggersIsEnabled() ? "true" : "false")
    out << ',"triggerActions":' << triggerActionListJson(list)
    out << "}"
    return renderJsonNoStore(withAuthJson(out.toString()), 200)
}

def triggerActionsAckGet() {
    def id = params?.id
    if (!id?.toString()?.trim()) {
        return renderJsonNoStore('{"ok":false,"error":"missing id"}', 400)
    }
    return triggerActionsAckFromId(id.toString().trim())
}

def triggerActionsAck() {
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
    return triggerActionsAckFromId(id.toString().trim())
}

def triggerActionsAckFromId(id) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def list = parseTriggerActionsState()
    def next = list.findAll { it.id?.toString() != id }
    persistTriggerActionsState(next)
    def out = new StringBuilder()
    out << '{"ok":true,"id":' << jsonStr(id)
    out << ',"alertsArmed":' << (readAlertsArmed() ? "true" : "false")
    out << ',"triggerActions":' << triggerActionListJson(next)
    out << "}"
    return renderJsonNoStore(withAuthJson(out.toString()), 200)
}

def alertsArmGet() {
    def armed = params?.armed
    return alertsArmFromValue(armed)
}

def alertsArm() {
    def body = request?.JSON
    if (body == null) {
        try {
            def raw = request?.postBody ?: request?.content
            if (raw) body = new groovy.json.JsonSlurper().parseText(raw.toString())
        } catch (e) {}
    }
    def armed = body?.armed
    if (armed == null) armed = params?.armed
    return alertsArmFromValue(armed)
}

def alertsArmFromValue(armed) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def sw = alertsArmSwitch
    if (!sw) {
        return renderJsonNoStore('{"ok":false,"error":"no arm switch configured"}', 400)
    }
    def wantOn = false
    if (armed == true || armed?.toString() == "true" || armed?.toString() == "1" || armed?.toString()?.toLowerCase() == "on") {
        wantOn = true
    } else if (armed == false || armed?.toString() == "false" || armed?.toString() == "0" || armed?.toString()?.toLowerCase() == "off") {
        wantOn = false
    } else {
        return renderJsonNoStore('{"ok":false,"error":"missing armed"}', 400)
    }
    try {
        if (wantOn) sw.on()
        else sw.off()
        state.alertsArmed = wantOn
        def out = new StringBuilder()
        out << '{"ok":true,"alertsArmed":' << (wantOn ? "true" : "false")
        out << ',"alertsArmSwitchId":' << (sw.id != null ? sw.id.toString() : "null")
        out << "}"
        return renderJsonNoStore(withAuthJson(out.toString()), 200)
    } catch (e) {
        return renderJsonNoStore('{"ok":false,"error":"arm switch command failed"}', 500)
    }
}

// ---------------------------------------------------------------------------
// Virtual / Notification devices → dashboard popup queue
// ---------------------------------------------------------------------------
def maxNotificationQueue() { return 20 }
def maxNotificationTextLen() { return 1024 }

def notificationChildDni() {
    return "mld-notif-${app.id}"
}

def tileNotificationChildDni() {
    return "mld-tile-notif-${app.id}"
}

def getNotificationChildDevice() {
    try {
        return getChildDevice(notificationChildDni())
    } catch (e) {
        return null
    }
}

def getTileNotificationChildDevice() {
    try {
        return getChildDevice(tileNotificationChildDni())
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

def createTileNotificationChildDeviceFromUi() {
    state.remove("tileNotifDeviceCreateError")
    state.remove("tileNotifDeviceCreateOk")
    def existing = getTileNotificationChildDevice()
    if (existing) {
        state.tileNotifDeviceCreateOk = existing.displayName
        syncTileNotificationChildSelection()
        try { initializeNotifications() } catch (e) {}
        return
    }
    def label = tileNotifDeviceLabel?.toString()?.trim()
    if (!label) label = "Dashboard Notifications (Tile)"
    if (label.length() > 64) label = label.substring(0, 64)
    try {
        def child = addChildDevice(
            "mDash",
            "mDash Notifications",
            tileNotificationChildDni(),
            [
                name: "mDash Notifications",
                label: label,
                isComponent: false
            ]
        )
        state.tileNotifDeviceCreateOk = child?.displayName ?: label
        log.info "Modern Dashboard: created tile notification device ${state.tileNotifDeviceCreateOk}"
        syncTileNotificationChildSelection()
        try { initializeNotifications() } catch (e) {}
    } catch (e) {
        def msg = e?.message?.toString() ?: e?.toString() ?: "unknown error"
        state.tileNotifDeviceCreateError = msg
        log.warn "Modern Dashboard: could not create tile mDash Notifications device: ${msg}"
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

def tileNotificationDeviceIdList() {
    def ids = []
    def seen = new HashSet()
    def addId = { id ->
        def key = id?.toString()?.trim()
        if (!key || seen.contains(key)) return
        seen.add(key)
        ids << key
    }
    try {
        if (tileNotificationDevices instanceof List) {
            tileNotificationDevices.each { d -> addId(d?.id) }
        } else if (tileNotificationDevices) {
            addId(tileNotificationDevices?.id)
        }
    } catch (e) {}
    return ids
}

def popupNotificationDeviceIdSet() {
    return new HashSet(notificationDeviceIdList())
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

def syncTileNotificationChildSelection() {
    // Only from Create button — never from updated()/installed().
    def child = getTileNotificationChildDevice()
    if (!child) return
    def childId = child.id?.toString()?.trim()
    if (!childId) return
    def current = tileNotificationDeviceIdList()
    if (current.contains(childId)) return
    def next = current + [childId]
    try {
        app.updateSetting("tileNotificationDevices", [type: "capability.notification", value: next])
    } catch (e) {
        log.warn "Modern Dashboard: could not auto-select tile notification child device: ${e}"
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

def allTileNotificationDevices() {
    def out = []
    def seen = new HashSet()
    def popupIds = popupNotificationDeviceIdSet()
    def addDev = { d ->
        if (d == null) return
        def key = null
        try { key = d.id?.toString() } catch (e) {}
        if (!key || seen.contains(key) || popupIds.contains(key)) return
        seen.add(key)
        out << d
    }
    try {
        if (tileNotificationDevices instanceof List) tileNotificationDevices.each { addDev(it) }
        else if (tileNotificationDevices) addDev(tileNotificationDevices)
    } catch (e) {}
    return out
}

def allSubscribedNotificationDevices() {
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
    allNotificationDevices().each { addDev(it) }
    allTileNotificationDevices().each { addDev(it) }
    return out
}

def initializeNotifications() {
    // Drop all notification subscriptions (including removed picker devices).
    try { unsubscribe("notificationDeviceEvent") } catch (e) {}
    def devices = allSubscribedNotificationDevices()
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
    def deviceKey = deviceId?.toString() ?: ""
    def popupIds = popupNotificationDeviceIdSet()
    def tileIds = new HashSet(tileNotificationDeviceIdList())
    def isPopup = popupIds.contains(deviceKey)
    def isTile = !isPopup && tileIds.contains(deviceKey)
    if (!isPopup && !isTile) return
    // Some drivers fire multiple attributes for one notify (e.g. notificationText +
    // lastMessage). Collapse same device+text within a short window into one queue item.
    def nowMs = now()
    def channel = isPopup ? "popup" : "tile"
    def dedupeKey = "${channel}|${deviceId ?: ""}|${text}"
    def lastKey = state.notifDedupeKey?.toString()
    def lastAt = (state.notifDedupeAt instanceof Number) ? state.notifDedupeAt.longValue() : 0L
    if (dedupeKey == lastKey && (nowMs - lastAt) < 3000L) return
    state.notifDedupeKey = dedupeKey
    state.notifDedupeAt = nowMs
    if (isPopup) appendNotification(text, deviceId, deviceName)
    else appendTileNotification(text, deviceId, deviceName)
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

def parseTileNotificationsState() {
    if (!state.tileNotificationsJson) return []
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(state.tileNotificationsJson.toString())
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

def persistTileNotificationsState(list) {
    def capped = (list instanceof List) ? list.take(maxNotificationQueue()) : []
    state.tileNotificationsJson = groovy.json.JsonOutput.toJson(capped)
}

def appendTileNotification(text, deviceId, deviceName) {
    def list = parseTileNotificationsState()
    def seq = (state.tileNotifSeq instanceof Number) ? state.tileNotifSeq.longValue() : 0L
    seq++
    state.tileNotifSeq = seq
    def id = "tn_${now()}_${seq}"
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
    persistTileNotificationsState(list)
}

def notificationListJson(list) {
    def out = new StringBuilder()
    out << "["
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
    return out.toString()
}

def notificationsJsonFragment() {
    def list = parseNotificationsState()
    def tileList = parseTileNotificationsState()
    def out = new StringBuilder()
    out << ",\"notifications\":"
    out << notificationListJson(list)
    out << ",\"notificationDeviceIds\":["
    boolean first = true
    for (d in allNotificationDevices()) {
        if (!first) out << ","; first = false
        out << d.id
    }
    out << "]"
    out << ",\"tileNotifications\":"
    out << notificationListJson(tileList)
    out << ",\"tileNotificationDeviceIds\":["
    first = true
    for (d in allTileNotificationDevices()) {
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
    // Drop linked text-only trigger actions so they do not fill the queue forever.
    try { pruneTriggerActionsForNotification(id) } catch (e) {}
    def out = new StringBuilder()
    out << '{"ok":true,"id":' << jsonStr(id)
    out << ',"notifications":' << notificationListJson(next)
    out << "}"
    return renderJsonNoStore(withAuthJson(out.toString()), 200)
}

def tileNotificationsGet() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def out = new StringBuilder()
    out << '{"ok":true'
    def tileList = parseTileNotificationsState()
    out << ',"tileNotifications":' << notificationListJson(tileList)
    out << ',"tileNotificationDeviceIds":['
    boolean first = true
    for (d in allTileNotificationDevices()) {
        if (!first) out << ","; first = false
        out << d.id
    }
    out << "]}"
    return renderJsonNoStore(withAuthJson(out.toString()), 200)
}

def tileNotificationsAckGet() {
    def id = params?.id
    if (!id?.toString()?.trim()) {
        return renderJsonNoStore('{"ok":false,"error":"missing id"}', 400)
    }
    return tileNotificationsAckFromId(id.toString().trim())
}

def tileNotificationsAck() {
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
    return tileNotificationsAckFromId(id.toString().trim())
}

def tileNotificationsAckFromId(id) {
    if (!guardDashboardAccess()) return renderAuthRequired()
    def list = parseTileNotificationsState()
    def next = list.findAll { it.id?.toString() != id }
    persistTileNotificationsState(next)
    def out = new StringBuilder()
    out << '{"ok":true,"id":' << jsonStr(id)
    out << ',"tileNotifications":' << notificationListJson(next)
    out << "}"
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
    out << "],\"notificationCards\":["
    first = true
    for (card in parseNotificationCardsState()) {
        if (!first) out << ","; first = false
        out << "{\"id\":" << jsonStr(card.id)
        out << ",\"size\":" << jsonStr(card.size) << "}"
    }
    out << "]}"
    return renderJsonNoStore( withAuthJson(out.toString()), 200)
}

// ===========================================================================
// Simple Automation Rules → mDash schedule import (Hubitat App Export paste)
// Mirrors lib/sar-import.mjs — deterministic allowlist only.
// ===========================================================================

def schedImportConvertExport(text, lightIds, outletIds) {
    def parsed = schedImportParseExport(text)
    if (parsed.error) return [ok: [], skipped: [], error: parsed.error]
    def root = parsed.root
    def appData = root.appData ?: [:]
    def appReplacements = root.appReplacements ?: [:]
    def deviceMeta = root.deviceReplacements ?: [:]
    def ok = []
    def skipped = []
    appData.each { appId, data ->
        def meta = appReplacements[appId.toString()] ?: (appReplacements.containsKey(appId) ? appReplacements[appId] : [:])
        if (!(meta instanceof Map)) meta = [:]
        def typeName = meta.appTypeName?.toString() ?: ""
        def lowerType = typeName.trim().toLowerCase()
        // Parent container app — skip silently
        if (lowerType == "simple automation rules") {
            def hasHow = false
            def settingsList = data?.appSettings
            if (settingsList instanceof List) {
                settingsList.each { s ->
                    if (s?.name?.toString() == "howToTrigger") hasHow = true
                }
            }
            if (!hasHow) return
        }
        def result = schedImportConvertApp(appId.toString(), data, meta, deviceMeta, lightIds, outletIds)
        if (result.schedules) ok.addAll(result.schedules)
        if (result.skipped) skipped.addAll(result.skipped)
    }
    if (!ok && !skipped) {
        return [ok: [], skipped: [], error: "No Simple Automation Rules found in export"]
    }
    return [ok: ok, skipped: skipped, error: null]
}

def schedImportParseExport(text) {
    def raw = text?.toString()?.trim()
    if (!raw) return [error: "Paste is empty", root: null]
    def fixed = raw.replace("\\\\", "\\")
    def root = null
    try {
        root = new groovy.json.JsonSlurper().parseText(fixed)
    } catch (e1) {
        try {
            root = new groovy.json.JsonSlurper().parseText(raw.replace('\\"', '"').replace("\\\\", "\\"))
        } catch (e2) {
            return [error: "Invalid export JSON: ${e1.message ?: e1}", root: null]
        }
    }
    if (!(root instanceof Map)) return [error: "Export must be a JSON object", root: null]
    if (!(root.appData instanceof Map)) return [error: "Export has no appData", root: null]
    return [error: null, root: root]
}

def schedImportSettingsMap(appSettings) {
    def m = [:]
    if (!(appSettings instanceof List)) return m
    appSettings.each { s ->
        if (s?.name) m[s.name.toString()] = s
    }
    return m
}

def schedImportSettingValue(settings, name) {
    def s = settings[name]
    if (!s) return null
    def v = s.value
    if (v == null || v.toString().trim() == "") return null
    return v
}

def schedImportStripHtml(s) {
    return (s?.toString() ?: "").replaceAll(/<[^>]*>/, "").trim()
}

def schedImportIsSarApp(meta) {
    def t = (meta?.appTypeName?.toString() ?: meta?.appName?.toString() ?: "").trim().toLowerCase()
    return t.startsWith("simple automation rule")
}

def schedImportParseModes(raw) {
    if (raw == null || raw.toString().trim() == "") return []
    if (raw instanceof List) return raw.collect { it?.toString() }.findAll { it }
    def s = raw.toString().trim()
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(s)
        if (parsed instanceof List) return parsed.collect { it?.toString() }.findAll { it }
    } catch (e) {}
    if (s.startsWith("[") && s.endsWith("]")) {
        def inner = s.substring(1, s.length() - 1).trim()
        if (!inner) return []
        return inner.split(",").collect { p ->
            def t = p.trim()
            if ((t.startsWith("\"") && t.endsWith("\"")) || (t.startsWith("'") && t.endsWith("'"))) {
                if (t.length() >= 2) t = t.substring(1, t.length() - 1)
            }
            t
        }.findAll { it }
    }
    return [s]
}

def schedImportParseDays(raw) {
    if (raw == null || raw.toString().trim() == "") return []
    def list = raw
    if (raw instanceof String) {
        try {
            list = new groovy.json.JsonSlurper().parseText(raw)
        } catch (e) {
            list = raw.split(",").collect { it.trim() }.findAll { it }
        }
    }
    if (!(list instanceof List)) return []
    def valid = scheduleWeeklyDayNames() as Set
    return list.collect { d ->
        def s = d?.toString()?.trim()?.toUpperCase() ?: ""
        if (s.length() > 3) s = s.substring(0, 3)
        s
    }.findAll { valid.contains(it) }
}

def schedImportDeviceIds(settings) {
    def s = settings["lights"]
    if (!s) return []
    def dl = s.deviceList
    if (dl instanceof Map) return dl.keySet().collect { it.toString() }
    def v = s.value
    if (v instanceof List) return v.collect { it.toString() }
    if (v instanceof String && v.trim()) {
        try {
            def parsed = new groovy.json.JsonSlurper().parseText(v)
            if (parsed instanceof List) return parsed.collect { it.toString() }
        } catch (e) {
            return v.split(",").collect { it.trim() }.findAll { it }
        }
    }
    return []
}

def schedImportDeviceLabel(deviceMeta, id) {
    def d = null
    if (deviceMeta instanceof Map) {
        def sid = id.toString()
        if (deviceMeta.containsKey(sid)) d = deviceMeta[sid]
        else if (deviceMeta.containsKey(id)) d = deviceMeta[id]
    }
    return d?.deviceLabel?.toString() ?: d?.deviceName?.toString() ?: id.toString()
}

def schedImportParseClockTime(raw) {
    if (raw == null || raw.toString().trim() == "") return null
    def s = raw.toString().trim()
    // Hubitat time inputs are often "HH:MM" or an ISO-like string containing HH:MM.
    def m = (s =~ /(\d{1,2}):(\d{2})/)
    if (!m.find()) return null
    int hh
    int mm
    try {
        hh = m.group(1).toInteger()
        mm = m.group(2).toInteger()
    } catch (e) {
        return null
    }
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
    return String.format("%02d:%02d", hh, mm)
}

def schedImportParseOffset(raw) {
    if (raw == null || raw.toString().trim() == "") return 0
    try {
        def n = raw.toString().toInteger()
        return Math.max(-720, Math.min(720, n))
    } catch (e) {
        return 0
    }
}

def schedImportBuildTrigger(settings, slot) {
    def atTKey = (slot == "secondary") ? "at2T" : "atT"
    def atTimeKey = (slot == "secondary") ? "at2Time" : "atTime"
    def atT = schedImportSettingValue(settings, atTKey)?.toString()?.trim()?.toLowerCase() ?: ""
    if (!atT) {
        return (slot == "secondary") ? [trigger: null, error: null] : [trigger: null, error: "Missing time type (atT)"]
    }
    def days = schedImportParseDays(schedImportSettingValue(settings, "days"))
    def kind = days ? "weekly" : "daily"
    def trigger = [kind: kind]
    if (atT == "time") {
        def time = schedImportParseClockTime(schedImportSettingValue(settings, atTimeKey))
        if (!time) return [trigger: null, error: "Invalid or missing clock time (${atTimeKey})"]
        trigger.when = "clock"
        trigger.time = time
        trigger.offsetMin = 0
    } else if (atT == "sunrise" || atT == "sunset") {
        trigger.when = atT
        trigger.time = ""
        def off
        if (slot == "secondary") {
            off = schedImportSettingValue(settings, (atT == "sunrise") ? "sunrise2Offset" : "sunset2Offset")
        } else {
            off = schedImportSettingValue(settings, (atT == "sunrise") ? "sunriseOffset" : "sunsetOffset")
        }
        trigger.offsetMin = schedImportParseOffset(off)
    } else {
        return [trigger: null, error: "Unsupported time type: ${atT}"]
    }
    if (kind == "weekly") trigger.days = days
    return [trigger: trigger, error: null]
}

def schedImportSummary(s) {
    def tr = s.trigger ?: [:]
    if (tr.kind == "mode") {
        return ("Mode " + (tr.mode ?: "")).trim()
    }
    if (tr.kind == "daily" || tr.kind == "weekly") {
        def prefix = (tr.kind == "weekly") ? "Weekly ${(tr.days ?: []).join(',')}" : "Daily"
        if (tr.when == "sunrise" || tr.when == "sunset") {
            def off = (tr.offsetMin ?: 0) as int
            def offLabel = (off == 0) ? tr.when : "${tr.when} ${off > 0 ? '+' : ''}${off}"
            return "${prefix} ${offLabel}"
        }
        return "${prefix} ${tr.time ?: ''}"
    }
    return tr.kind?.toString() ?: "schedule"
}

def schedImportBuildModeTrigger(settings) {
    def mode = schedImportSettingValue(settings, "onMode")?.toString()?.trim() ?: ""
    if (!mode) return [trigger: null, error: "Mode Changes rule missing onMode"]
    def offMode = schedImportSettingValue(settings, "offMode")
    if (offMode == true || offMode?.toString()?.trim()?.equalsIgnoreCase("true")) {
        return [trigger: null, error: "Mode Changes with offMode (leave-mode action) is not imported — create manually if needed"]
    }
    return [trigger: [kind: "mode", mode: mode], error: null]
}

def schedImportConvertApp(appId, appData, appMeta, deviceMeta, lightIds, outletIds) {
    def skipped = []
    def settings = schedImportSettingsMap(appData?.appSettings ?: [])
    def name = schedImportStripHtml(appData?.state?.appName)
    if (!name) name = schedImportStripHtml(schedImportSettingValue(settings, "newName"))
    if (!name) name = schedImportStripHtml(appMeta?.appLabel)
    if (!name) name = "SAR ${appId}"

    if (!schedImportIsSarApp(appMeta)) {
        def typeName = appMeta?.appTypeName?.toString() ?: ""
        def lower = typeName.trim().toLowerCase()
        if (!lower.startsWith("simple automation rule")) {
            skipped << [appId: appId.toString(), name: name, reason: "Not a Simple Automation Rule (${typeName ?: 'unknown type'})"]
            return [schedules: [], skipped: skipped]
        }
    }

    def how = schedImportSettingValue(settings, "howToTrigger")?.toString()?.trim() ?: ""
    def timeTrigger = (how == "At a Specific Time")
    def modeTrigger = (how == "Mode Changes")
    if (!timeTrigger && !modeTrigger) {
        skipped << [appId: appId.toString(), name: name, reason: how ? "Unsupported trigger: ${how}" : "Missing howToTrigger"]
        return [schedules: [], skipped: skipped]
    }

    def action = schedImportSettingValue(settings, "action")?.toString()?.trim() ?: ""
    def allowed = ["Turn On", "Turn Off", "Turn On & Set Level", "Turn On & Set Temperature"] as Set
    if (!allowed.contains(action)) {
        skipped << [appId: appId.toString(), name: name, reason: action ? "Unsupported action: ${action}" : "Missing action"]
        return [schedules: [], skipped: skipped]
    }

    def onVal = (action != "Turn Off")
    def setLevel = (action == "Turn On & Set Level" || action == "Turn On & Set Temperature")
    def setCt = (action == "Turn On & Set Temperature")
    def level = null
    def ct = null
    if (setLevel || setCt) {
        if (setLevel) {
            try {
                def lv = schedImportSettingValue(settings, "level")?.toString()?.toInteger()
                if (lv != null && lv >= 0 && lv <= 100) level = lv
            } catch (e) {}
            if (action == "Turn On & Set Level" && level == null) {
                skipped << [appId: appId.toString(), name: name, reason: "Turn On & Set Level requires a valid level (0-100)"]
                return [schedules: [], skipped: skipped]
            }
        }
        if (setCt) {
            try {
                ct = schedImportSettingValue(settings, "temperature")?.toString()?.toInteger()
            } catch (e) { ct = null }
            if (ct == null || ct < 1500 || ct > 9000) {
                skipped << [appId: appId.toString(), name: name, reason: "Turn On & Set Temperature requires a valid color temperature (Kelvin)"]
                return [schedules: [], skipped: skipped]
            }
        }
    }

    def ids = schedImportDeviceIds(settings)
    if (!ids) {
        skipped << [appId: appId.toString(), name: name, reason: "No devices in rule"]
        return [schedules: [], skipped: skipped]
    }

    def lightSet = (lightIds ?: []).collect { it.toString() } as Set
    def outletSet = (outletIds ?: []).collect { it.toString() } as Set
    def lightDevs = []
    def outletDevs = []
    ids.each { id ->
        def sid = id.toString()
        if (outletSet.contains(sid)) outletDevs << sid
        else if (lightSet.contains(sid)) lightDevs << sid
        else {
            def label = schedImportDeviceLabel(deviceMeta, sid)
            skipped << [appId: appId.toString(), name: name,
                reason: "Partial: device ${sid} (${label}) is not in Lights/Outlets (other devices in this rule can still import)"]
        }
    }
    if (!lightDevs && !outletDevs) {
        skipped = skipped.findAll { row -> !(row?.reason?.toString()?.startsWith("Partial:")) }
        skipped << [appId: appId.toString(), name: name, reason: "No devices remain after filtering to Lights/Outlets pickers"]
        return [schedules: [], skipped: skipped]
    }

    def enabled = !(appData?.state?.disabled == true || appData?.state?.paused == true)
    def targets = []
    if (lightDevs) targets << [target: "lights", ids: lightDevs]
    if (outletDevs) targets << [target: "outlets", ids: outletDevs]
    def partialCount = skipped.findAll { row ->
        row?.appId?.toString() == appId.toString() && row?.reason?.toString()?.startsWith("Partial:")
    }.size()
    def partialNote = partialCount ? " (${partialCount} device(s) omitted)" : ""

    def schedules = []

    if (modeTrigger) {
        def built = schedImportBuildModeTrigger(settings)
        if (built.error) {
            skipped << [appId: appId.toString(), name: name, reason: built.error.toString()]
            return [schedules: [], skipped: skipped]
        }
        targets.each { t ->
            def states = t.ids.collect { id ->
                def sid = id.toString()
                def idVal = (sid ==~ /^\d+$/) ? sid.toInteger() : sid
                def o = [id: idVal, on: onVal]
                if (t.target == "lights" && onVal) {
                    if (setLevel && level != null) o.level = level
                    if (setCt && ct != null) o.ct = ct
                }
                o
            }
            def importKey = "sar-${appId}-${t.target}".toString()
            def draft = [
                name: name.toString(),
                enabled: enabled,
                importKey: importKey,
                onlyInModes: [],
                trigger: built.trigger,
                action: [target: t.target.toString(), states: states]
            ]
            def verr = schedulesValidateNormalized(schedulesNormalizePayload(draft))
            if (verr) {
                skipped << [appId: appId.toString(), name: name, reason: "Validation failed: ${verr}"]
                return
            }
            schedules << [
                importKey: importKey,
                name: name.toString(),
                summary: (schedImportSummary(draft) + partialNote).toString(),
                schedule: draft
            ]
        }
        if (!schedules && !skipped) {
            skipped << [appId: appId.toString(), name: name, reason: "Could not build a schedule"]
        }
        return [schedules: schedules, skipped: skipped]
    }

    def onlyInModes = schedImportParseModes(schedImportSettingValue(settings, "modes"))
    def at2T = schedImportSettingValue(settings, "at2T")?.toString()?.trim()?.toLowerCase() ?: ""
    def slots = ["primary"]
    // Non-empty at2T (time/sunrise/sunset) is the on/off cycle flag. Clock second
    // times are scheduled jobs, not doAntiAction subscriptions in App Export.
    // Leftover at2Time="00:00" / *2Offset with empty at2T is not a cycle.
    if (at2T == "time" || at2T == "sunrise" || at2T == "sunset") slots << "secondary"

    slots.each { slot ->
        def built = schedImportBuildTrigger(settings, slot)
        if (built.error == null && built.trigger == null) return
        if (built.error) {
            def errText = built.error.toString()
            skipped << [appId: appId.toString(), name: name,
                reason: (slot == "secondary") ? ("Secondary time: " + errText) : errText]
            return
        }
        def slotOn = (slot == "secondary") ? (!onVal) : onVal
        def slotLevel = (slot == "secondary") ? null : level
        def slotCt = (slot == "secondary") ? null : ct
        def slotName = (slot == "secondary") ? "${name} (${slotOn ? 'on' : 'off'})".toString() : name.toString()
        def keyMid = (slot == "secondary") ? "-2-" : "-"
        targets.each { t ->
            def states = t.ids.collect { id ->
                def sid = id.toString()
                def idVal = (sid ==~ /^\d+$/) ? sid.toInteger() : sid
                def o = [id: idVal, on: slotOn]
                if (t.target == "lights" && slotOn) {
                    if (setLevel && slotLevel != null) o.level = slotLevel
                    if (setCt && slotCt != null) o.ct = slotCt
                }
                o
            }
            def importKey = "sar-${appId}${keyMid}${t.target}".toString()
            def draft = [
                name: slotName,
                enabled: enabled,
                importKey: importKey,
                onlyInModes: onlyInModes.collect { it.toString() },
                trigger: built.trigger,
                action: [target: t.target.toString(), states: states]
            ]
            def verr = schedulesValidateNormalized(schedulesNormalizePayload(draft))
            if (verr) {
                skipped << [appId: appId.toString(), name: slotName, reason: "Validation failed: ${verr}"]
                return
            }
            def modesNote = onlyInModes ? (" [" + onlyInModes.join(", ") + "]") : ""
            schedules << [
                importKey: importKey,
                name: slotName,
                summary: (schedImportSummary(draft) + modesNote + partialNote).toString(),
                schedule: draft
            ]
        }
    }
    if (!schedules && !skipped) {
        skipped << [appId: appId.toString(), name: name, reason: "Could not build a schedule"]
    }
    return [schedules: schedules, skipped: skipped]
}

def schedImportApplyOk(okRows) {
    if (schedulerIsEnabled() != true) {
        return [error: "Scheduler is disabled in app settings", count: 0]
    }
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) {
        return [error: (parsed.error ?: "schedule store unreadable").toString(), count: 0]
    }
    def map = parsed.map ?: [:]
    def priorJson = state.schedulesJson
    def count = 0
    try {
        okRows.each { row ->
            def draft = row.schedule
            def s = schedulesNormalizePayload(draft)
            def verr = schedulesValidateNormalized(s)
            if (verr) throw new RuntimeException(verr.toString())
            def deviceErr = schedulesUnknownDeviceError(s)
            if (deviceErr) throw new RuntimeException(deviceErr.toString())
            def key = s.importKey?.toString()
            def priorLastFired = null
            if (key) {
                def removeIds = []
                map.each { k, v ->
                    if (v?.importKey?.toString() == key) {
                        if (priorLastFired == null && v?.lastFired != null) priorLastFired = v.lastFired
                        removeIds << k
                    }
                }
                removeIds.each { rid -> map.remove(rid) }
            }
            def id = scheduleNewId()
            s.id = id
            if (priorLastFired != null) s.lastFired = priorLastFired
            map[id] = s
            count++
        }
        def cycleErr = schedulesModeCycleError(map)
        if (cycleErr) throw new RuntimeException(cycleErr.toString())
        saveSchedulesMap(map)
        def rebuild = rebuildScheduledJobs()
        def failures = rebuild?.failures
        if (failures instanceof Map && failures) {
            if (priorJson != null) state.schedulesJson = priorJson
            else state.remove("schedulesJson")
            rebuildScheduledJobs()
            def first = "schedule registration failed"
            failures.each { k, v ->
                if (v && first == "schedule registration failed") first = v.toString()
            }
            return [error: first, count: 0]
        }
        return [error: null, count: count]
    } catch (e) {
        if (priorJson != null) state.schedulesJson = priorJson
        else state.remove("schedulesJson")
        try { rebuildScheduledJobs() } catch (e2) {}
        return [error: (e.message ?: e).toString(), count: 0]
    }
}

// ===========================================================================
// Scheduler
// ===========================================================================
// Schedules are stored as a JSON map id->schedule in state.schedulesJson.
// One shared handler `scheduledJobHandler(data)` runs each job, identified by
// the schedule id carried in the `data` map. `rebuildScheduledJobs()` applies
// the full job set after lifecycle/config changes (install, save/toggle/delete,
// sun-time events, midnight re-arm). Sun jobs re-arm individually after fire.
// ===========================================================================

def parseSchedulesMapResult() {
    if (!state.schedulesJson) return [ok: true, map: [:], error: null]
    try {
        def parsed = new groovy.json.JsonSlurper().parseText(state.schedulesJson.toString())
        if (parsed instanceof Map) return [ok: true, map: parsed, error: null]
        log.warn "Modern Dashboard: schedulesJson is not a map"
        return [ok: false, map: [:], error: "schedule store unreadable"]
    } catch (e) {
        log.warn "Modern Dashboard: schedulesJson parse failed: ${e}"
        return [ok: false, map: [:], error: "schedule store unreadable"]
    }
}

def parseSchedulesMap() {
    def parsed = parseSchedulesMapResult()
    return (parsed.map instanceof Map) ? parsed.map : [:]
}

def requireSchedulesMap() {
    def parsed = parseSchedulesMapResult()
    if (parsed.ok == true) return parsed.map instanceof Map ? parsed.map : [:]
    return null
}

def renderSchedulesStoreError(parsed) {
    def msg = (parsed?.error ?: "schedule store unreadable").toString()
    return renderJsonNoStore(("{\"ok\":false,\"error\":" + jsonStr(msg) + "}").toString(), 500)
}

def hubTimeZoneId() {
    try {
        def tz = location.timeZone
        if (tz?.ID) return tz.ID.toString()
    } catch (e) {}
    return ""
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
// Quartz requires exactly one of day-of-month / day-of-week to be "?".
def scheduleCronForTrigger(kind, time, days) {
    def parts = time?.toString()?.split(":")
    if (!parts || parts.length < 2) return null
    def hh
    def mm
    try {
        hh = parts[0]?.trim()?.toInteger()
        mm = parts[1]?.trim()?.toInteger()
    } catch (e) {
        return null
    }
    if (hh == null || mm == null || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
    def hhStr = String.format("%d", hh)
    def mmStr = String.format("%d", mm)
    if (kind == "weekly") {
        def valid = scheduleWeeklyDayNames() as Set
        def dowList = []
        if (days instanceof List) {
            for (d in days) {
                def name = d?.toString()?.trim()?.toUpperCase()
                if (name && valid.contains(name)) dowList << name
            }
        }
        if (!dowList) return null
        // sec min hour dom mon dow year — constrain DOW, leave DOM as "?"
        return "0 ${mmStr} ${hhStr} ? * ${dowList.join(',')} *".toString()
    }
    // Daily: constrain DOM with "*", leave DOW as "?"
    return "0 ${mmStr} ${hhStr} * * ? *".toString()
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
        def opts = [:]
        def off = (offsetMin ?: 0) as Integer
        if (which == "sunrise") opts.sunriseOffset = off
        else opts.sunsetOffset = off
        if (forDate) opts.date = forDate
        def rs = getSunriseAndSunset(opts)
        def d = (which == "sunrise") ? rs?.sunrise : rs?.sunset
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
    // Start with the previous solar day: a positive offset can cross midnight
    // (Monday sunset +7h is Tuesday 01:00) and still be today's next fire.
    cal.add(Calendar.DATE, -1)
    for (int i = 0; i < 371; i++) {
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
        def tz = location.timeZone
        def inFmt = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm")
        def outFmt = new java.text.SimpleDateFormat("MMM d, yyyy h:mm a", java.util.Locale.US)
        if (tz) {
            inFmt.setTimeZone(tz)
            outFmt.setTimeZone(tz)
        }
        def dt = inFmt.parse(iso)
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
    try { unschedule("schedulerSunRetry") } catch (e) {}
    try { unschedule("cleanupSchedules") } catch (e) {}
    try { unschedule("schedulerMidnightRearm") } catch (e) {}
    // Drop location subscriptions so updated()/installed() do not stack duplicates.
    // Do not unsubscribe hubSystemStart — reboot re-init must stay armed even when
    // the scheduler UI is hidden (other features still need systemStart).
    try { unsubscribe("schedulerSunTimeChanged") } catch (e) {}
    try { unsubscribe("schedulerModeChanged") } catch (e) {}
}

def guardSchedulerEnabled() {
    if (schedulerIsEnabled()) return true
    renderJsonNoStore('{"ok":false,"error":"scheduler disabled"}', 403)
    return false
}

def lastResultJson(s) {
    def lr = s?.lastResult
    if (!(lr instanceof Map)) return "null"
    try {
        return groovy.json.JsonOutput.toJson(lr)
    } catch (e) {
        return "null"
    }
}

def schedulesJsonFragment() {
    if (!schedulerIsEnabled()) return ',"schedules":[]'
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) {
        return ',"schedules":[],"schedulesError":' + jsonStr(parsed.error ?: "schedule store unreadable")
    }
    def map = parsed.map instanceof Map ? parsed.map : [:]
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
        out << ",\"lastResult\":" << lastResultJson(s)
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
    try { schedule("0 1 0 * * ?", "schedulerMidnightRearm") } catch (e) {}
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
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) {
        log.warn "Modern Dashboard: mode schedule skipped — schedule store unreadable"
        return
    }
    def map = parsed.map instanceof Map ? parsed.map : [:]
    def cycleErr = schedulesModeCycleError(map)
    if (cycleErr) {
        log.warn "Modern Dashboard: mode schedules skipped — ${cycleErr}"
        return
    }
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

def scheduleJobOptions(id) {
    return [data: [id: id.toString()], overwrite: false]
}

def rebuildScheduledJobs() {
    def result = [registered: 0, failures: [:]]
    if (!schedulerIsEnabled()) return result
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) {
        def storeErr = (parsed.error ?: "schedule store unreadable").toString()
        result.failures["_store"] = storeErr
        log.warn "Modern Dashboard: scheduler rebuild skipped — ${storeErr}"
        return result
    }
    try { unschedule("scheduledJobHandler") } catch (e) {}
    def map = parsed.map instanceof Map ? parsed.map : [:]
    def now = now()
    def updated = false
    for (id in map.keySet().toList()) {
        def s = map[id]
        if (!s) continue
        def enabled = (s?.enabled == true)
        def nextFire = null
        if (enabled) {
            nextFire = armEnabledSchedule(id, s, now, result)
        }
        if (s.nextFire != nextFire) {
            s.nextFire = nextFire
            updated = true
        }
    }
    if (updated) saveSchedulesMap(map)
    logDbg("scheduler rebuild — ${result.registered} jobs")
    return result
}

def armEnabledSchedule(id, s, long nowMs, result) {
    def tr = s?.trigger ?: [:]
    def kind = tr?.kind?.toString()
    def nextFire = null
    try {
        if (kind == "daily" || kind == "weekly") {
            def when = scheduleTriggerWhen(tr)
            if (when == "clock") {
                def cron = scheduleCronForTrigger(kind, tr?.time, tr?.days)
                if (cron) {
                    schedule(cron, "scheduledJobHandler", scheduleJobOptions(id))
                    result.registered++
                    def nf = cronNextFire(cron, nowMs)
                    if (nf != null) nextFire = nf
                    else result.failures[id.toString()] = "could not compute next run time"
                } else {
                    result.failures[id.toString()] = "invalid clock trigger"
                }
            } else {
                def nf = scheduleSunNextFire(tr, when, nowMs)
                if (nf != null && nf > nowMs) {
                    runOnce(new Date(nf), "scheduledJobHandler", scheduleJobOptions(id))
                    result.registered++
                    nextFire = nf
                } else {
                    result.failures[id.toString()] = "could not schedule next ${when}"
                }
            }
        } else if (kind == "once") {
            def atMs = scheduleOnceToMs(tr?.at)
            def how = onceScheduleDisposition(atMs, nowMs)
            if (how == "schedule") {
                runOnce(new Date(atMs as long), "scheduledJobHandler", scheduleJobOptions(id))
                result.registered++
                nextFire = atMs
            } else if (how == "catchup") {
                // A couple of seconds ahead so Hubitat does not drop a past runOnce.
                long catchAt = nowMs + 2000L
                runOnce(new Date(catchAt), "scheduledJobHandler", scheduleJobOptions(id))
                result.registered++
                nextFire = catchAt
            } else if (how == "drop") {
                nextFire = null
                result.failures[id.toString()] = "one-time schedule must be in the future"
            } else {
                result.failures[id.toString()] = "invalid one-time date"
            }
        } else if (kind == "mode") {
            nextFire = null
        }
    } catch (e) {
        log.warn "Modern Dashboard: schedule ${id} register failed: ${e}"
        result.failures[id.toString()] = (e?.message ?: e?.toString() ?: "register failed").toString()
    }
    return nextFire
}

def armSunScheduleNext(id, s, long fromMs) {
    def tr = s?.trigger
    def when = scheduleTriggerWhen(tr)
    def nf = scheduleSunNextFire(tr, when, fromMs)
    s.nextFire = null
    if (nf != null && nf > fromMs) {
        try {
            runOnce(new Date(nf), "scheduledJobHandler", scheduleJobOptions(id))
            s.nextFire = nf
            return true
        } catch (e) {
            log.warn "Modern Dashboard: schedule ${id} sun re-arm failed: ${e}"
        }
    }
    return false
}

def scheduleSunRetryLater(id, int attempt) {
    if (!id || attempt > 5) return
    int delaySec = Math.min(900, 60 * (1 << Math.max(0, attempt - 1)))
    try {
        runIn(delaySec, "schedulerSunRetry",
            [data: [id: id.toString(), attempt: attempt], overwrite: false])
    } catch (e) {
        log.warn "Modern Dashboard: schedule ${id} sun retry registration failed: ${e}"
    }
}

def schedulerSunRetry(data) {
    if (!schedulerIsEnabled()) return
    def id = data?.id?.toString()
    int attempt = 1
    try { attempt = (data?.attempt ?: 1) as Integer } catch (e) {}
    if (!id) return
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) return
    def map = parsed.map instanceof Map ? parsed.map : [:]
    def s = map[id]
    if (!s || s?.enabled != true) return
    def kind = s?.trigger?.kind?.toString()
    if (!(kind in ["daily", "weekly"])) return
    def when = scheduleTriggerWhen(s?.trigger)
    if (!(when in ["sunrise", "sunset"])) return
    try {
        if (s?.nextFire != null && s.nextFire.toLong() > now()) return
    } catch (e) {}
    if (armSunScheduleNext(id, s, now())) {
        saveSchedulesMap(map)
        return
    }
    saveSchedulesMap(map)
    scheduleSunRetryLater(id, attempt + 1)
}

def scheduleOnceCatchUpMs() {
    return 10L * 60L * 1000L
}

// "schedule" (future), "catchup" (up to 10 minutes late), "drop", or "invalid".
def onceScheduleDisposition(atMs, long nowMs) {
    if (atMs == null) return "invalid"
    long at
    try { at = atMs as Long } catch (e) { return "invalid" }
    if (at > nowMs) return "schedule"
    if (at >= nowMs - scheduleOnceCatchUpMs()) return "catchup"
    return "drop"
}

def scheduleOnceToMs(at) {
    if (at == null) return null
    try {
        String v = at.toString()?.trim()
        // Accept "yyyy-MM-ddTHH:mm" or "yyyy-MM-ddTHH:mm:ss"
        if (v ==~ /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/) {
            def tz = location.timeZone
            def fmt = new java.text.SimpleDateFormat(v.length() == 19 ? "yyyy-MM-dd'T'HH:mm:ss" : "yyyy-MM-dd'T'HH:mm")
            fmt.setLenient(false)
            if (tz) fmt.setTimeZone(tz)
            return fmt.parse(v).getTime()
        }
    } catch (e) {}
    return null
}

// Advance nextFire / re-arm after a trigger consumed (whether action ran or mode-skipped).
// Returns true if the schedule was removed (one-time).
def scheduleAdvanceAfterTrigger(id, s, map, boolean markFired) {
    def kind = s?.trigger?.kind?.toString()
    if (markFired) s.lastFired = now()
    if (kind == "once") {
        map.remove(id)
        saveSchedulesMap(map)
        return true
    }
    if (kind == "mode") {
        saveSchedulesMap(map)
        return false
    }
    try {
        def tr = s?.trigger
        if (kind == "daily" || kind == "weekly") {
            def when = scheduleTriggerWhen(tr)
            if (when == "clock") {
                def cron = scheduleCronForTrigger(kind, tr?.time, tr?.days)
                if (cron) s.nextFire = cronNextFire(cron, now())
                saveSchedulesMap(map)
            } else {
                if (!armSunScheduleNext(id, s, now())) scheduleSunRetryLater(id, 1)
                saveSchedulesMap(map)
            }
            return false
        }
    } catch (e) {
        log.warn "Modern Dashboard: schedule ${id} advance failed: ${e}"
        try {
            def when = scheduleTriggerWhen(s?.trigger)
            if (when == "sunrise" || when == "sunset") scheduleSunRetryLater(id?.toString(), 1)
        } catch (e2) {}
    }
    saveSchedulesMap(map)
    return false
}

def scheduledJobHandler(data) {
    if (!schedulerIsEnabled()) return
    def id = data?.id?.toString()
    if (!id) return
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) {
        log.warn "Modern Dashboard: schedule ${id} skipped — schedule store unreadable"
        return
    }
    def map = parsed.map instanceof Map ? parsed.map : [:]
    def s = map[id]
    if (!s) return
    if (s?.enabled != true) return
    def kind = s?.trigger?.kind?.toString()
    // A catch-up and a late cron can both see the same minute. One run is enough.
    if (kind != "mode") {
        long lastFiredMs = 0L
        try { if (s.lastFired != null) lastFiredMs = s.lastFired as long } catch (e) {}
        if (lastFiredMs > 0L && now() - lastFiredMs < 45000L) {
            log.info "Modern Dashboard: schedule skipped — ${scheduleLogName(id, s)} already ran"
            return
        }
    }
    // Mode condition applies to time-based schedules only (not mode triggers)
    if (kind != "mode") {
        def onlyInModes = s?.onlyInModes
        if (onlyInModes instanceof List && onlyInModes) {
            def cur = ""
            try { cur = location.mode?.toString() ?: "" } catch (e) {}
            def ok = false
            for (m in onlyInModes) { if (m?.toString() == cur) { ok = true; break } }
            if (!ok) {
                log.info "Modern Dashboard: schedule skipped — ${scheduleLogName(id, s)} (hub mode ${cur ?: '(none)'} not allowed)"
                // The slot is consumed. Catch-up must not run it if the mode changes later.
                s.lastResult = [ok: true, skipped: "mode", ts: now()]
                scheduleAdvanceAfterTrigger(id, s, map, true)
                return
            }
        }
    }
    log.info "Modern Dashboard: schedule ran — ${scheduleLogName(id, s)} · ${scheduleSummary(s)} · ${scheduleActionLogSummary(s?.action)}"
    def result = newScheduleActionResult()
    try {
        result = runScheduleAction(s?.action)
    } catch (e) {
        log.warn "Modern Dashboard: schedule ${id} action failed: ${e}"
        if (result) result.failed << (e?.message ?: e?.toString() ?: "action failed").toString()
    }
    try {
        s.lastResult = captureScheduleActionResult(result)
        if (result?.missing instanceof List && result.missing) {
            log.warn "Modern Dashboard: schedule ${id} missing device(s) — ${result.missing.join(', ')}"
        }
        if (result?.failed instanceof List && result.failed) {
            log.warn "Modern Dashboard: schedule ${id} failed device(s) — ${result.failed.join(', ')}"
        }
    } catch (e) {
        log.warn "Modern Dashboard: schedule ${id} result save failed: ${e}"
    }
    // The trigger already fired. Re-arm even when saving the result failed,
    // or a sunrise/sunset job would not be scheduled again.
    scheduleAdvanceAfterTrigger(id, s, map, true)
}

def scheduleLogName(id, s) {
    def name = s?.name?.toString()?.trim()
    if (name) return "${name} (${id})"
    return (id ?: "?").toString()
}

// Hubitat JSON may unwrap a one-item array to a scalar (devices: 37 instead of [37]).
// A states array, or one state object if the hub unwrapped a one-item list.
def scheduleStateList(raw) {
    if (raw == null) return []
    if (raw instanceof List) return raw.findAll { it instanceof Map }
    if (raw instanceof Map) return [raw]
    return []
}

def schedulePositionValue(v) {
    if (v == null || !v.toString().trim()) return [ok: true, value: null]
    if (!isNumberLike(v)) return [ok: false]
    int n = Math.round(new BigDecimal(v.toString()).doubleValue()) as Integer
    if (n < 1 || n > 100) return [ok: false]
    return [ok: true, value: n]
}

// Speeds a schedule may set. Numeric maps above 10 are dim levels, not fan speeds.
def scheduleFanSpeedChoices(dev) {
    def filtered = []
    for (tok in (fanSpeedTokens(dev) ?: [])) {
        def s = tok?.toString()?.trim()?.toLowerCase()
        if (!s || s == "off" || s == "on" || s == "auto") continue
        filtered << s
    }
    if (filtered) {
        boolean allNumeric = true
        double max = 0d
        for (s in filtered) {
            if (!(s ==~ /^\d+(\.\d+)?$/)) {
                allNumeric = false
                break
            }
            def n = new BigDecimal(s).doubleValue()
            if (n > max) max = n
        }
        if (allNumeric && max > 10d) return ["low", "medium", "high"]
        return filtered
    }
    return ["low", "medium", "high"]
}

def scheduleFanSpeedMatch(dev, speed) {
    def req = speed?.toString()?.trim()
    if (!req) return null
    def key = req.toLowerCase()
    if (key == "off") return null
    def aliases = [med: "medium", hi: "high", lo: "low"]
    def canonical = aliases.containsKey(key) ? aliases[key] : key
    for (choice in scheduleFanSpeedChoices(dev)) {
        if (choice.equalsIgnoreCase(canonical) || choice.equalsIgnoreCase(key)) return choice
    }
    return null
}

// Groovy treats 0 as false and 1 as true. Only a real boolean counts, so a
// missing or numeric value cannot unlock a door.
def scheduleBoolIs(v, boolean expected) {
    if (!(v instanceof Boolean)) return false
    return expected ? (v == true) : (v == false)
}

// Only boolean false unlocks. A closed shade drops position. Fan speed off means off.
// An open shade position outside 1-100 is kept so validation can reject it.
def scheduleNormalizeDeviceStates(String target, raw) {
    def out = []
    for (st in scheduleStateList(raw)) {
        def id = st?.id
        if (id == null || !id.toString().trim()) continue
        if (target == "locks") {
            out << [id: id, locked: !scheduleBoolIs(st?.locked, false)]
        } else if (target == "blinds") {
            def open = scheduleBoolIs(st?.open, true)
            def o = [id: id, open: open]
            if (open && st?.position != null && st.position.toString().trim()) {
                def parsed = schedulePositionValue(st.position)
                if (parsed.ok != true) {
                    o.position = st.position
                } else if (parsed.value != null) {
                    def dev = allWindowShades()?.find { it?.id?.toString() == id.toString() }
                    if (dev == null || shadeSupportsPosition(dev)) o.position = parsed.value
                }
            }
            out << o
        } else if (target == "fans") {
            def on = scheduleBoolIs(st?.on, true)
            def speed = st?.speed?.toString()?.trim()
            if (speed?.equalsIgnoreCase("off")) {
                on = false
                speed = null
            }
            def o = [id: id, on: on]
            if (on && speed) {
                def dev = ceilingFans?.find { it?.id?.toString() == id.toString() }
                def match = dev ? scheduleFanSpeedMatch(dev, speed) : null
                o.speed = match ?: speed
            }
            out << o
        }
    }
    return out
}

def scheduleThermostatIds(raw) {
    def out = []
    def seen = [] as Set
    if (raw instanceof List) {
        for (id in raw) {
            if (id == null) continue
            def s = id.toString().trim()
            if (!s || s == "null") continue
            if (seen.contains(s)) continue
            seen << s
            out << s
        }
    } else if (raw != null) {
        def s = raw.toString().trim()
        if (s && s != "null") out << s
    }
    return out
}

def scheduleActionLogSummary(action) {
    def target = action?.target?.toString()
    switch (target) {
        case "lights":
            def n = (action?.states instanceof List) ? action.states.size() : 0
            return "lights (${n} device(s))"
        case "outlets":
            def n = (action?.states instanceof List) ? action.states.size() : 0
            return "outlets (${n} device(s))"
        case "locks":
        case "blinds":
        case "fans":
            def count = scheduleStateList(action?.states).size()
            return "${target} (${count} device(s))"
        case "thermostats":
            def n = scheduleThermostatIds(action?.devices).size()
            def bits = ["thermostats (${n} device(s))"]
            if (action?.mode) bits << "mode=${action.mode}"
            if (action?.heat != null) bits << "heat=${action.heat}"
            if (action?.cool != null) bits << "cool=${action.cool}"
            if (action?.fanMode) bits << "fan=${action.fanMode}"
            return bits.join(" ")
        case "hubMode":
            return "hub mode → ${action?.mode ?: "?"}"
        default:
            return target ?: "no action"
    }
}

def newScheduleActionResult() {
    return [attempted: 0, succeeded: 0, missing: [], failed: []]
}

def captureScheduleActionResult(result) {
    def missing = []
    def failed = []
    if (result?.missing instanceof List) {
        for (x in result.missing) { if (x != null) missing << x.toString() }
    }
    if (result?.failed instanceof List) {
        for (x in result.failed) { if (x != null) failed << x.toString() }
    }
    int attempted = 0
    int succeeded = 0
    try { attempted = (result?.attempted ?: 0) as Integer } catch (e) {}
    try { succeeded = (result?.succeeded ?: 0) as Integer } catch (e) {}
    def ok = (attempted > 0 && succeeded == attempted && !missing && !failed)
    return [ok: ok, attempted: attempted, succeeded: succeeded, missing: missing, failed: failed, ts: now()]
}

def scheduleActionResultError(lastResult) {
    int missing = 0
    int failed = 0
    int succeeded = 0
    try { missing = (lastResult?.missing instanceof List) ? lastResult.missing.size() : 0 } catch (e) {}
    try { failed = (lastResult?.failed instanceof List) ? lastResult.failed.size() : 0 } catch (e) {}
    try { succeeded = (lastResult?.succeeded ?: 0) as Integer } catch (e) {}
    def bits = []
    if (missing) bits << "${missing} missing"
    if (failed) bits << "${failed} failed"
    if (!succeeded) bits << "no actions succeeded"
    return bits ? bits.join(", ") : "actions did not complete"
}

def runScheduleAction(action) {
    def result = newScheduleActionResult()
    if (!action) return result
    def target = action?.target?.toString()
    switch (target) {
        case "lights":
            return runScheduleLightAction(action, result)
        case "outlets":
            return runScheduleOnOffAction(action, outletSwitches, result)
        case "locks":
            return runScheduleLockAction(action, result)
        case "blinds":
            return runScheduleBlindAction(action, result)
        case "fans":
            return runScheduleFanAction(action, result)
        case "thermostats":
            return runScheduleThermostatAction(action, result)
        case "hubMode":
            def mode = action?.mode?.toString()?.trim()
            result.attempted++
            if (!mode) {
                result.missing << "mode"
                return result
            }
            try {
                long nowMs = now()
                long startedAt = 0L
                int transitions = 0
                try { startedAt = (state.schedulerModeCascadeStartedAt ?: 0) as Long } catch (e) {}
                try { transitions = (state.schedulerModeCascadeTransitions ?: 0) as Integer } catch (e) {}
                if (startedAt <= 0L || nowMs - startedAt > 10000L) {
                    startedAt = nowMs
                    transitions = 0
                }
                transitions++
                state.schedulerModeCascadeStartedAt = startedAt
                state.schedulerModeCascadeTransitions = transitions
                if (transitions > 8) {
                    log.warn "Modern Dashboard: hub mode action skipped — more than 8 scheduler transitions in 10 seconds"
                    result.failed << mode
                    return result
                }
                location.setMode(mode)
                logControl("automation", "hub mode → ${mode}")
                result.succeeded++
            } catch (e) {
                log.warn "Modern Dashboard: hub mode failed — ${mode}: ${e}"
                result.failed << mode
            }
            return result
        default:
            return result
    }
}

def runScheduleLockAction(action, result) {
    if (result == null) result = newScheduleActionResult()
    for (st in scheduleStateList(action?.states)) {
        def id = st?.id
        if (id == null) continue
        result.attempted++
        def dev = locks?.find { it?.id?.toString() == id.toString() }
        if (!dev) {
            result.missing << id.toString()
            continue
        }
        try {
            def unlock = scheduleBoolIs(st?.locked, false)
            logControl("automation", "${deviceLabel(dev)} ${unlock ? 'unlock' : 'lock'}")
            runLockCmd(dev, unlock ? "unlock" : "lock", null)
            result.succeeded++
        } catch (e) {
            log.warn "Modern Dashboard: schedule lock cmd failed for ${id}: ${e}"
            result.failed << id.toString()
        }
    }
    return result
}

def runScheduleBlindAction(action, result) {
    if (result == null) result = newScheduleActionResult()
    for (st in scheduleStateList(action?.states)) {
        def id = st?.id
        if (id == null) continue
        result.attempted++
        def dev = allWindowShades()?.find { it?.id?.toString() == id.toString() }
        if (!dev) {
            result.missing << id.toString()
            continue
        }
        try {
            def open = scheduleBoolIs(st?.open, true)
            if (open && st?.position != null && st.position.toString().trim() && shadeSupportsPosition(dev)) {
                logControl("automation", "${deviceLabel(dev)} setPosition=${st.position}")
                runShadeCmd(dev, "setPosition", st.position)
            } else {
                logControl("automation", "${deviceLabel(dev)} ${open ? 'open' : 'close'}")
                runShadeCmd(dev, open ? "open" : "close", null)
            }
            result.succeeded++
        } catch (e) {
            log.warn "Modern Dashboard: schedule blind cmd failed for ${id}: ${e}"
            result.failed << id.toString()
        }
    }
    return result
}

def runScheduleFanAction(action, result) {
    if (result == null) result = newScheduleActionResult()
    for (st in scheduleStateList(action?.states)) {
        def id = st?.id
        if (id == null) continue
        result.attempted++
        def dev = ceilingFans?.find { it?.id?.toString() == id.toString() }
        if (!dev) {
            result.missing << id.toString()
            continue
        }
        try {
            if (!scheduleBoolIs(st?.on, true)) {
                logControl("automation", "${deviceLabel(dev)} off")
                runFanCmd(dev, "off", null)
            } else if (st?.speed?.toString()?.trim()) {
                logControl("automation", "${deviceLabel(dev)} setSpeed=${st.speed}")
                runFanCmd(dev, "setSpeed", st.speed)
            } else {
                logControl("automation", "${deviceLabel(dev)} on")
                runFanCmd(dev, "on", null)
            }
            result.succeeded++
        } catch (e) {
            log.warn "Modern Dashboard: schedule fan cmd failed for ${id}: ${e}"
            result.failed << id.toString()
        }
    }
    return result
}

def runScheduleOnOffAction(action, deviceList, result) {
    if (result == null) result = newScheduleActionResult()
    def states = action?.states
    if (!(states instanceof List)) return result
    for (st in states) {
        def id = st?.id
        if (id == null) continue
        result.attempted++
        def dev = deviceList?.find { it.id.toString() == id.toString() }
        if (!dev) {
            result.missing << id.toString()
            continue
        }
        try {
            def cmd = (st?.on == true) ? "on" : "off"
            logControl("automation", "${deviceLabel(dev)} ${cmd}")
            if (st?.on == true) dev.on() else dev.off()
            result.succeeded++
        } catch (e) {
            log.warn "Modern Dashboard: schedule on/off cmd failed for ${id}: ${e}"
            result.failed << id.toString()
        }
    }
    return result
}

def runScheduleLightAction(action, result) {
    if (result == null) result = newScheduleActionResult()
    def states = action?.states
    if (!(states instanceof List)) return result
    for (st in states) {
        def id = st?.id
        if (id == null) continue
        result.attempted++
        def dev = lights?.find { it.id.toString() == id.toString() }
        if (!dev) {
            result.missing << id.toString()
            continue
        }
        try {
            def on = (st?.on == true)
            if (on) {
                def detail = "on"
                if (st?.level != null) detail += " level=${st.level}"
                if (st?.ct != null) detail += " ct=${st.ct}"
                logControl("automation", "${deviceLabel(dev)} ${detail}")
                dev.on()
                def lvl = st?.level
                if (lvl != null) {
                    if (!dev.hasCapability("SwitchLevel")) throw new RuntimeException("setLevel is unavailable")
                    int levelValue = Math.max(0, Math.min(100, lvl.toInteger()))
                    dev.setLevel(levelValue)
                }
                def ct = st?.ct
                if (ct != null) {
                    if (!dev.hasCapability("ColorTemperature")) throw new RuntimeException("setColorTemperature is unavailable")
                    int k = Math.max(2000, Math.min(6500, ct.toInteger()))
                    dev.setColorTemperature(k)
                }
            } else {
                logControl("automation", "${deviceLabel(dev)} off")
                dev.off()
            }
            result.succeeded++
        } catch (e) {
            log.warn "Modern Dashboard: schedule light cmd failed for ${id}: ${e}"
            result.failed << id.toString()
        }
    }
    return result
}

def runScheduleThermostatAction(action, result) {
    if (result == null) result = newScheduleActionResult()
    def ids = scheduleThermostatIds(action?.devices)
    for (id in ids) {
        if (id == null) continue
        result.attempted++
        def dev = thermostats?.find { it.id.toString() == id.toString() }
        if (!dev) {
            result.missing << id.toString()
            continue
        }
        if (runThermostatSetting(dev, action)) result.succeeded++
        else result.failed << id.toString()
    }
    return result
}

// Which setpoints a thermostat mode uses. No mode means the setting only changes setpoints.
def thermostatSetpointsForMode(mode) {
    def key = mode?.toString()?.toLowerCase()?.replaceAll(/[\s_-]+/, "") ?: ""
    if (!key) return [heat: true, cool: true]
    return [heat: key in ["heat", "emergencyheat", "auto"], cool: key in ["cool", "auto"]]
}

def thermostatSetpointValue(v) {
    if (v == null || v.toString().trim() == "" || !isNumberLike(v)) return null
    return Math.round(new BigDecimal(v.toString()).doubleValue()) as Integer
}

// Keeps only the fields a setting can use: the mode, the setpoints that mode uses, and a fan mode.
def thermostatSettingNormalized(raw) {
    def out = [:]
    def mode = raw?.mode?.toString()?.trim()
    if (mode) out.mode = mode
    def needs = thermostatSetpointsForMode(mode)
    def heat = needs.heat ? thermostatSetpointValue(raw?.heat) : null
    def cool = needs.cool ? thermostatSetpointValue(raw?.cool) : null
    if (heat != null) out.heat = heat
    if (cool != null) out.cool = cool
    def fan = raw?.fanMode?.toString()?.trim()
    if (fan) out.fanMode = fan
    return out
}

def thermostatDialRange(unit) {
    def key = unit?.toString()?.replace("°", "")?.trim()?.toUpperCase()
    if (key == "C") return [min: 10, max: 32]
    if (key == "F") return [min: 50, max: 90]
    return null
}

def thermostatTempUnit(dev) {
    def unit = "F"
    try {
        def st = dev?.currentState("temperature")
        def u = st?.unit?.toString()
        if (u) unit = u
    } catch (e) {}
    return thermostatDialRange(unit) ? unit.replace("°", "").trim().toUpperCase() : "F"
}

def thermostatSettingError(raw, String unit = null) {
    def mode = raw?.mode?.toString()?.trim()
    def needs = thermostatSetpointsForMode(mode)
    def heat = needs.heat ? thermostatSetpointValue(raw?.heat) : null
    def cool = needs.cool ? thermostatSetpointValue(raw?.cool) : null
    if (mode) {
        if (needs.heat && heat == null) return "enter a heat setpoint"
        if (needs.cool && cool == null) return "enter a cool setpoint"
    } else if (heat == null && cool == null && !raw?.fanMode?.toString()?.trim()) {
        return "choose a mode, setpoint, or fan mode"
    }
    if (heat != null && cool != null && heat >= cool) return "heat setpoint must be below cool setpoint"
    def range = thermostatDialRange(unit)
    if (range != null && heat != null && (heat < range.min || heat > range.max)) {
        return "heat setpoint must be between ${range.min} and ${range.max}".toString()
    }
    if (range != null && cool != null && (cool < range.min || cool > range.max)) {
        return "cool setpoint must be between ${range.min} and ${range.max}".toString()
    }
    return null
}

// Sends one setting to one thermostat. Returns false if any requested command failed.
def runThermostatSetting(dev, raw) {
    def setting = thermostatSettingNormalized(raw)
    def id = dev.id
    def mode = setting.mode
    def heat = setting.heat
    def cool = setting.cool
    def fanMode = setting.fanMode
    if (fanMode && !tstatSupportsFanMode(dev)) {
        if (debugLogActive()) log.debug "Modern Dashboard: ${deviceLabel(dev)} has no fan mode; skipped fan=${fanMode}"
        fanMode = null
    }
    def bits = []
    if (mode) bits << "mode=${mode}"
    if (heat != null) bits << "heat=${heat}"
    if (cool != null) bits << "cool=${cool}"
    if (fanMode) bits << "fan=${fanMode}"
    if (bits) logControl("automation", "${deviceLabel(dev)} ${bits.join(' ')}")
    boolean deviceFailed = false
    if (mode) {
        try { dev.setThermostatMode(mode) } catch (e) {
            deviceFailed = true
            log.warn "Modern Dashboard: schedule tstat mode failed for ${id}: ${e}"
        }
    }
    if (heat != null) {
        try { dev.setHeatingSetpoint(heat) } catch (e) {
            deviceFailed = true
            log.warn "Modern Dashboard: schedule tstat heat failed for ${id}: ${e}"
        }
    }
    if (cool != null) {
        try { dev.setCoolingSetpoint(cool) } catch (e) {
            deviceFailed = true
            log.warn "Modern Dashboard: schedule tstat cool failed for ${id}: ${e}"
        }
    }
    if (fanMode) {
        try {
            if (setThermostatFanModeCmd(dev, fanMode) != true) {
                deviceFailed = true
                log.warn "Modern Dashboard: schedule tstat fan failed for ${id}: no compatible fan command"
            }
        } catch (e) {
            deviceFailed = true
            log.warn "Modern Dashboard: schedule tstat fan failed for ${id}: ${e}"
        }
    }
    return !deviceFailed
}

// Clock time today if it already passed and is still inside the one-time catch-up window.
def scheduleRecentClockMs(s, long nowMs) {
    def tr = s?.trigger
    def kind = tr?.kind?.toString()
    if (!(kind in ["daily", "weekly"])) return null
    if (scheduleTriggerWhen(tr) != "clock") return null
    def parts = tr?.time?.toString()?.split(":")
    if (!parts || parts.length < 2) return null
    int hh
    int mm
    try {
        hh = parts[0].trim().toInteger()
        mm = parts[1].trim().toInteger()
    } catch (e) { return null }
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
    def tz = null
    try { tz = location?.timeZone } catch (e) {}
    def cal = Calendar.getInstance()
    if (tz) cal.setTimeZone(tz)
    cal.setTimeInMillis(nowMs)
    if (kind == "weekly" && !scheduleDayMatchesWeekly(tr, cal)) return null
    cal.set(Calendar.HOUR_OF_DAY, hh)
    cal.set(Calendar.MINUTE, mm)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    long at = cal.getTimeInMillis()
    if (at > nowMs || nowMs - at > scheduleOnceCatchUpMs()) return null
    return at
}

// Sunrise or sunset if it already passed and is still inside the catch-up window.
// Yesterday is included because a positive offset can land after midnight.
def scheduleRecentSunMs(s, long nowMs) {
    def tr = s?.trigger
    def kind = tr?.kind?.toString()
    if (!(kind in ["daily", "weekly"])) return null
    def when = scheduleTriggerWhen(tr)
    if (!(when in ["sunrise", "sunset"])) return null
    def tz = null
    try { tz = location?.timeZone } catch (e) {}
    def cal = Calendar.getInstance()
    if (tz) cal.setTimeZone(tz)
    cal.setTimeInMillis(nowMs)
    cal.set(Calendar.HOUR_OF_DAY, 0)
    cal.set(Calendar.MINUTE, 0)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    cal.add(Calendar.DATE, -1)
    Long best = null
    def offsetMin = scheduleOffsetMin(tr)
    for (int i = 0; i < 3; i++) {
        if (scheduleDayMatchesWeekly(tr, cal)) {
            def sunMs = scheduleSunMs(when, offsetMin, cal.getTime())
            if (sunMs != null) {
                long at = sunMs as long
                if (at <= nowMs && nowMs - at <= scheduleOnceCatchUpMs()) {
                    if (best == null || at > best) best = at
                }
            }
        }
        cal.add(Calendar.DATE, 1)
    }
    return best
}

def cleanupSchedules() {
    if (!schedulerIsEnabled()) return
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) {
        log.warn "Modern Dashboard: schedule cleanup skipped — schedule store unreadable"
        return
    }
    def map = parsed.map instanceof Map ? parsed.map : [:]
    def now = now()
    def changed = false
    def needsArm = false
    def clockCatchUp = []
    for (id in map.keySet().toList()) {
        def s = map[id]
        if (!s) continue
        def kind = s?.trigger?.kind?.toString()
        if (kind == "daily" || kind == "weekly") {
            if (s?.enabled == true) {
                def recent = scheduleRecentClockMs(s, now as long)
                if (recent == null) recent = scheduleRecentSunMs(s, now as long)
                long last = 0L
                try { if (s.lastFired != null) last = s.lastFired as long } catch (e) {}
                if (recent != null && last < (recent as long)) clockCatchUp << id.toString()
            }
            continue
        }
        if (kind != "once") continue
        def how = onceScheduleDisposition(scheduleOnceToMs(s?.trigger?.at), now as long)
        if (how == "drop" && s?.enabled == true) {
            map.remove(id)
            changed = true
        } else if (how == "catchup" && s?.enabled == true) {
            def nf = null
            try { if (s.nextFire != null) nf = (s.nextFire as Long) } catch (e) {}
            if (nf == null || nf <= now) needsArm = true
        }
    }
    if (changed) saveSchedulesMap(map)
    if (changed || needsArm) rebuildScheduledJobs()
    for (id in clockCatchUp) {
        try { scheduledJobHandler([id: id]) } catch (e) {
            log.warn "Modern Dashboard: schedule ${id} catch-up failed: ${e}"
        }
    }
}

// --- endpoints ---

def schedulesGet() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    if (!guardSchedulerEnabled()) return
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) return renderSchedulesStoreError(parsed)
    return renderJsonNoStore( withAuthJson(groovy.json.JsonOutput.toJson([ok: true, schedules: schedulesListForClient(parsed.map)])), 200)
}

def schedulesListForClient(mapIn = null) {
    def map = mapIn
    if (map == null) {
        def parsed = parseSchedulesMapResult()
        map = (parsed.ok == true && parsed.map instanceof Map) ? parsed.map : [:]
    }
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
            lastResult: (s?.lastResult instanceof Map) ? s.lastResult : null,
            trigger: s?.trigger,
            action: s?.action,
            onlyInModes: (s?.onlyInModes instanceof List) ? s.onlyInModes : [],
            ts: s?.ts
        ]
    }
    return out
}

def schedulesValidateNormalized(s) {
    if (!s) return "invalid schedule"
    def tr = s.trigger ?: [:]
    def kind = tr?.kind?.toString()
    if (!(kind in ["daily", "weekly", "once", "mode"])) return "unsupported trigger type"
    if (kind == "daily" || kind == "weekly") {
        def when = scheduleTriggerWhen(tr)
        if (when == "clock") {
            if (!scheduleCronForTrigger(kind, tr?.time, tr?.days)) return "invalid clock time or days"
        } else {
            def off = scheduleOffsetMin(tr)
            if (off < -720 || off > 720) return "offset must be between -720 and 720 minutes"
        }
        if (kind == "weekly") {
            def days = tr?.days
            if (!(days instanceof List) || !days) return "pick at least one day"
        }
    } else if (kind == "once") {
        def atMs = scheduleOnceToMs(tr?.at)
        if (atMs == null) return "invalid one-time date"
        if (atMs <= now()) return "one-time schedule must be in the future"
    } else if (kind == "mode") {
        if (!tr?.mode?.toString()?.trim()) return "pick a hub mode"
    }
    def ac = s.action ?: [:]
    def target = ac?.target?.toString()
    if (!(target in ["lights", "outlets", "locks", "blinds", "fans", "thermostats", "hubMode"])) return "unsupported action type"
    if (target == "lights" || target == "outlets") {
        if (!(ac?.states instanceof List) || !ac.states) return "select at least one device"
    } else if (target == "locks" || target == "blinds" || target == "fans") {
        if (!scheduleStateList(ac?.states)) return "select at least one device"
        if (target == "blinds") {
            for (st in scheduleStateList(ac?.states)) {
                if (scheduleBoolIs(st?.open, true) && st?.position != null && st.position.toString().trim()) {
                    if (schedulePositionValue(st.position).ok != true) return "position must be between 1 and 100"
                }
            }
        }
        if (target == "fans") {
            for (st in scheduleStateList(ac?.states)) {
                if (!scheduleBoolIs(st?.on, true)) continue
                def speed = st?.speed?.toString()?.trim()
                if (!speed) continue
                def dev = ceilingFans?.find { it?.id?.toString() == st?.id?.toString() }
                if (!dev) continue
                if (!scheduleFanSpeedMatch(dev, speed)) return "fan speed ${speed} is not supported".toString()
            }
        }
    } else if (target == "thermostats") {
        if (!scheduleThermostatIds(ac?.devices)) return "select at least one thermostat"
        def tstatErr = thermostatSettingError(ac)
        if (tstatErr) return tstatErr
        for (id in scheduleThermostatIds(ac?.devices)) {
            def dev = thermostats?.find { it.id.toString() == id.toString() }
            if (!dev) continue
            def rangeErr = thermostatSettingError(ac, thermostatTempUnit(dev))
            if (rangeErr) return rangeErr
        }
    } else if (target == "hubMode") {
        if (!ac?.mode?.toString()?.trim()) return "pick a hub mode"
    }
    return null
}

def schedulesUnknownDeviceError(s) {
    def ac = s?.action ?: [:]
    def target = ac?.target?.toString()
    if (target == "lights" || target == "outlets") {
        def states = ac?.states
        if (!(states instanceof List)) return null
        def deviceList = (target == "lights") ? lights : outletSwitches
        for (st in states) {
            def id = st?.id
            if (id == null) continue
            def dev = deviceList?.find { it.id.toString() == id.toString() }
            if (!dev) return "device ${id} is not available in the ${target} picker"
        }
    } else if (target == "thermostats") {
        def ids = scheduleThermostatIds(ac?.devices)
        for (id in ids) {
            def dev = thermostats?.find { it.id.toString() == id.toString() }
            if (!dev) return "thermostat ${id} is not available in the thermostats picker"
        }
    } else if (target == "locks" || target == "blinds" || target == "fans") {
        def deviceList = (target == "locks") ? locks : ((target == "blinds") ? allWindowShades() : ceilingFans)
        for (st in scheduleStateList(ac?.states)) {
            def id = st?.id
            if (id == null) continue
            def dev = deviceList?.find { it?.id?.toString() == id.toString() }
            if (!dev) return "device ${id} is not available in the ${target} picker"
        }
    }
    return null
}

def schedulesModeCycleError(map) {
    def graph = [:]
    def nodes = [] as Set
    if (!(map instanceof Map)) return null
    for (id in map.keySet()) {
        def s = map[id]
        if (!s || s.enabled != true) continue
        if (s?.trigger?.kind?.toString() != "mode") continue
        if (s?.action?.target?.toString() != "hubMode") continue
        def from = s?.trigger?.mode?.toString()?.trim()
        def to = s?.action?.mode?.toString()?.trim()
        if (!from || !to) continue
        if (from == to) return "mode trigger cannot set the same hub mode"
        if (!graph.containsKey(from)) graph[from] = [] as Set
        graph[from] << to
        nodes << from
        nodes << to
    }
    def visiting = [] as Set
    def seen = [] as Set
    def box = [found: false]
    def visit
    visit = { node ->
        if (box.found) return
        if (visiting.contains(node)) {
            box.found = true
            return
        }
        if (seen.contains(node)) return
        visiting << node
        def nexts = graph[node]
        if (nexts) {
            for (n in nexts) visit(n)
        }
        visiting.remove(node)
        seen << node
    }
    for (n in nodes) {
        visit(n)
        if (box.found) return "mode schedules form a hub-mode loop"
    }
    return null
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
            def valid = scheduleWeeklyDayNames() as Set
            def days = body?.trigger?.days
            if (days instanceof List) {
                tr.days = days.collect { it?.toString()?.trim()?.toUpperCase() }.findAll { valid.contains(it) }
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
    } else if (ac.target == "locks" || ac.target == "blinds" || ac.target == "fans") {
        ac.states = scheduleNormalizeDeviceStates(ac.target, body?.action?.states)
    } else if (ac.target == "thermostats") {
        ac.devices = scheduleThermostatIds(body?.action?.devices)
        ac.putAll(thermostatSettingNormalized(body?.action))
    } else if (ac.target == "hubMode") {
        ac.mode = body?.action?.mode?.toString()?.trim() ?: ""
    }
    s.action = ac
    def importKey = body?.importKey?.toString()?.trim()
    if (importKey) s.importKey = importKey
    s.ts = now()
    return s
}

def schedulesStageOne(Map map, Map s) {
    def validationError = schedulesValidateNormalized(s)
    if (validationError) return [ok: false, error: validationError]
    def deviceErr = schedulesUnknownDeviceError(s)
    if (deviceErr) return [ok: false, error: deviceErr]
    def id = s.id?.toString()?.trim()
    if (!id) id = scheduleNewId()
    s.id = id
    def existing = map[id]
    if (existing && existing.lastFired != null) s.lastFired = existing.lastFired
    if (existing && existing.lastResult instanceof Map) s.lastResult = existing.lastResult
    map[id] = s
    def cycleErr = schedulesModeCycleError(map)
    if (cycleErr) {
        if (existing != null) map[id] = existing
        else map.remove(id)
        return [ok: false, error: cycleErr]
    }
    return [ok: true, id: id.toString()]
}

def schedulesFinishSave(Map map, priorJson, List armedIds) {
    saveSchedulesMap(map)
    def rebuild = rebuildScheduledJobs()
    for (id in (armedIds ?: [])) {
        def reason = null
        try { reason = rebuild?.failures ? rebuild.failures[id.toString()] : null } catch (e) {}
        if (!reason) continue
        if (priorJson != null) state.schedulesJson = priorJson
        else state.remove("schedulesJson")
        rebuildScheduledJobs()
        return [ok: false, error: reason.toString()]
    }
    return [ok: true]
}

def schedulesSave() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    if (!guardSchedulerEnabled()) return
    def body = parseRequestJson()
    if (body == null) {
        return renderJsonNoStore( '{"ok":false,"error":"missing body"}', 400)
    }
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) return renderSchedulesStoreError(parsed)
    def s = schedulesNormalizePayload(body)
    def map = parsed.map instanceof Map ? parsed.map : [:]
    def priorJson = state.schedulesJson
    def staged = schedulesStageOne(map, s)
    if (staged.ok != true) {
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr(staged.error)}}".toString(), 422)
    }
    def armed = (s.enabled == true) ? [staged.id] : []
    def done = schedulesFinishSave(map, priorJson, armed)
    if (done.ok != true) {
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr(done.error)},\"schedules\":${groovy.json.JsonOutput.toJson(schedulesListForClient())}}".toString(), 422)
    }
    def out = new StringBuilder()
    out << "{\"ok\":true,\"id\":" << jsonStr(staged.id.toString())
    out << ",\"schedules\":" << groovy.json.JsonOutput.toJson(schedulesListForClient())
    out << "}"
    return renderJsonNoStore( withAuthJson(out.toString()), 200)
}

def schedulesBundleItems(body) {
    if (body instanceof List) return body
    if (body instanceof Map && body.schedules instanceof List) return body.schedules
    if (body instanceof Map && (body.trigger instanceof Map || body.action instanceof Map)) return [body]
    return null
}

def scheduleDeviceLabel(d) {
    try { return d?.displayName?.toString() ?: "" } catch (e) { return "" }
}

def scheduleResolveDeviceToken(token, devices) {
    def id = null
    def name = null
    if (token instanceof Map) {
        if (token.id != null && token.id.toString().trim()) id = token.id.toString().trim()
        else name = (token.name ?: token.label)?.toString()?.trim()
    } else {
        def text = token?.toString()?.trim()
        if (!text) return [error: "device needs a name or id"]
        if (text ==~ /^\d+$/) id = text
        else name = text
    }
    def list = devices ?: []
    if (id) {
        def dev = list.find { it?.id?.toString() == id }
        if (!dev) return [error: "device ${id} is not selected in this app"]
        return [id: dev.id]
    }
    if (!name) return [error: "device needs a name or id"]
    def exact = list.findAll { scheduleDeviceLabel(it) == name }
    if (exact.size() == 1) return [id: exact[0].id]
    def folded = list.findAll { scheduleDeviceLabel(it).equalsIgnoreCase(name) }
    if (folded.size() == 1) return [id: folded[0].id]
    def needle = name.toLowerCase()
    def partial = list.findAll { scheduleDeviceLabel(it).toLowerCase().contains(needle) }
    if (partial.size() == 1) return [id: partial[0].id]
    def pool = partial.size() ? partial : (folded.size() ? folded : exact)
    if (!pool.size()) return [error: "no device named ${name}"]
    def sample = pool.collect { scheduleDeviceLabel(it) }.findAll { it }.unique().take(8).join(", ")
    return [error: "more than one device matches ${name}: ${sample}"]
}

def schedulesApplyDeviceNames(Map body) {
    def action = body.action instanceof Map ? body.action : [:]
    def target = action.target?.toString()?.trim() ?: "lights"
    if (target == "lights" || target == "outlets") {
        def devices = (target == "lights") ? lights : outletSwitches
        def states = action.states
        if (!(states instanceof List)) return [ok: true]
        for (st in states) {
            if (!(st instanceof Map)) return [ok: false, error: "each device state must be an object"]
            def token = (st.id != null && st.id.toString().trim()) ? st.id : (st.name ?: st.label)
            def resolved = scheduleResolveDeviceToken(token, devices)
            if (resolved.error) return [ok: false, error: resolved.error]
            st.id = resolved.id
        }
    } else if (target == "thermostats") {
        def list = action.devices
        if (!(list instanceof List)) list = (list != null && list.toString().trim()) ? [list] : []
        def ids = []
        for (item in list) {
            def resolved = scheduleResolveDeviceToken(item, thermostats)
            if (resolved.error) return [ok: false, error: resolved.error]
            ids << resolved.id?.toString()
        }
        action.devices = ids
    } else if (target == "locks" || target == "blinds" || target == "fans") {
        def devices = (target == "locks") ? locks : ((target == "blinds") ? allWindowShades() : ceilingFans)
        def states = action.states
        if (states instanceof Map) states = [states]
        if (!(states instanceof List)) return [ok: true]
        for (st in states) {
            if (!(st instanceof Map)) return [ok: false, error: "each device state must be an object"]
            def token = (st.id != null && st.id.toString().trim()) ? st.id : (st.name ?: st.label)
            def resolved = scheduleResolveDeviceToken(token, devices)
            if (resolved.error) return [ok: false, error: resolved.error]
            st.id = resolved.id
        }
        action.states = states
    }
    body.action = action
    return [ok: true]
}

def schedulesMatchIdByName(map, name) {
    def want = name?.toString()?.trim()
    if (!want || !(map instanceof Map)) return [id: null]
    def hits = []
    for (id in map.keySet()) {
        def n = map[id]?.name?.toString()?.trim()
        if (n && n.equalsIgnoreCase(want)) hits << id.toString()
    }
    if (hits.size() > 1) return [error: "more than one schedule is named ${want}"]
    if (hits.size() == 1) return [id: hits[0]]
    return [id: null]
}

// matchName replaces an existing schedule with the same name.
// requireExisting refuses to create one when updating.
def schedulesPrepareUploadItem(raw, map, boolean matchName, boolean requireExisting) {
    if (!(raw instanceof Map)) return [ok: false, name: "", error: "each schedule must be an object"]
    def name = raw.name?.toString()?.trim() ?: ""
    def body = [
        name: name,
        trigger: raw.trigger instanceof Map ? raw.trigger : [:],
        onlyInModes: raw.onlyInModes,
        action: raw.action instanceof Map ? raw.action : [:]
    ]
    if (raw.containsKey("enabled")) {
        def en = raw.enabled
        body.enabled = (en == true || en?.toString()?.equalsIgnoreCase("true"))
    } else {
        body.enabled = true
    }
    def named = schedulesApplyDeviceNames(body)
    if (named.ok != true) return [ok: false, name: name, error: named.error]
    def id = raw.id?.toString()?.trim()
    if (!matchName) id = null
    if (id) {
        if (requireExisting && !(map instanceof Map && map.containsKey(id))) {
            return [ok: false, name: name, error: "schedule not found"]
        }
        body.id = id
    }
    else if (matchName && name) {
        def match = schedulesMatchIdByName(map, name)
        if (match.error) return [ok: false, name: name, error: match.error]
        if (match.id) body.id = match.id
        else if (requireExisting) return [ok: false, name: name, error: "no schedule named ${name}"]
    } else if (requireExisting) {
        return [ok: false, name: name, error: "schedule id is required"]
    }
    def schedule = schedulesNormalizePayload(body)
    return [ok: true, name: schedule.name ?: name, schedule: schedule]
}

def schedulesPreviewBundle(items) {
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) return [ok: [], skipped: [], error: parsed.error]
    def map = parsed.map instanceof Map ? parsed.map : [:]
    def okById = new LinkedHashMap()
    def skipped = []
    for (raw in (items ?: [])) {
        def prepared = schedulesPrepareUploadItem(raw, map, true, false)
        if (prepared.ok != true) {
            skipped << [name: prepared.name, error: prepared.error]
            continue
        }
        def priorId = prepared.schedule?.id?.toString()?.trim()
        boolean replaced = false
        if (priorId && map.containsKey(priorId)) replaced = true
        def staged = schedulesStageOne(map, prepared.schedule)
        if (staged.ok != true) skipped << [name: prepared.name, error: staged.error]
        else okById[staged.id] = [name: prepared.schedule?.name ?: prepared.name, summary: scheduleSummary(prepared.schedule), id: staged.id, replaced: replaced, enabled: prepared.schedule?.enabled == true]
    }
    return [ok: okById.isEmpty() ? [] : new ArrayList(okById.values()), skipped: skipped, error: null]
}

def schedulesCommitBundle(items) {
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) return [ok: false, error: parsed.error, imported: 0, skipped: [], schedules: []]
    def map = parsed.map instanceof Map ? parsed.map : [:]
    def priorJson = state.schedulesJson
    def importedIds = []
    def importedRowById = new LinkedHashMap()
    def armedIds = []
    def skipped = []
    for (raw in (items ?: [])) {
        def prepared = schedulesPrepareUploadItem(raw, map, true, false)
        if (prepared.ok != true) {
            skipped << [name: prepared.name, error: prepared.error]
            continue
        }
        def priorId = prepared.schedule?.id?.toString()?.trim()
        boolean replaced = false
        if (priorId && map.containsKey(priorId)) replaced = true
        def staged = schedulesStageOne(map, prepared.schedule)
        if (staged.ok != true) {
            skipped << [name: prepared.name, error: staged.error]
            continue
        }
        importedIds << staged.id
        importedRowById[staged.id] = [
            name: prepared.schedule?.name ?: prepared.name ?: "Untitled",
            summary: scheduleSummary(prepared.schedule),
            replaced: replaced == true,
            enabled: prepared.schedule?.enabled == true
        ]
        if (prepared.schedule?.enabled == true) armedIds << staged.id
    }
    if (!importedIds) {
        def err = skipped ? skipped[0].error : "nothing to import"
        return [ok: false, error: err, imported: 0, skipped: skipped, schedules: schedulesListForClient()]
    }
    def done = schedulesFinishSave(map, priorJson, armedIds)
    if (done.ok != true) {
        return [ok: false, error: done.error, imported: 0, skipped: skipped, schedules: schedulesListForClient()]
    }
    return [ok: true, imported: importedIds.unique().size(), skipped: skipped, importedRows: new ArrayList(importedRowById.values()), schedules: schedulesListForClient()]
}

def schedulesUpload() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    if (!guardSchedulerEnabled()) return
    def body = parseRequestJson()
    def items = schedulesBundleItems(body)
    if (items == null) return renderJsonNoStore('{"ok":false,"error":"expected a schedules array"}', 400)
    def result = schedulesCommitBundle(items)
    def status = result.ok == true ? 200 : 422
    return renderJsonNoStore(withAuthJson(groovy.json.JsonOutput.toJson(result)), status)
}

def schedulesRemoveById(String id) {
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) return [ok: false, error: parsed.error, schedules: []]
    def map = parsed.map instanceof Map ? parsed.map : [:]
    if (!map.containsKey(id)) return [ok: false, error: "not found", schedules: schedulesListForClient(map)]
    map.remove(id)
    saveSchedulesMap(map)
    rebuildScheduledJobs()
    return [ok: true, id: id, schedules: schedulesListForClient()]
}

def schedulesDelete() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    if (!guardSchedulerEnabled()) return
    def body = parseRequestJson()
    def id = body?.id?.toString()?.trim()
    if (!id) {
        return renderJsonNoStore( '{"ok":false,"error":"missing id"}', 400)
    }
    def removed = schedulesRemoveById(id)
    if (removed.ok != true && removed.error != "not found") {
        return renderSchedulesStoreError([error: removed.error])
    }
    def out = new StringBuilder()
    out << "{\"ok\":true,\"id\":" << jsonStr(id.toString())
    out << ",\"schedules\":" << groovy.json.JsonOutput.toJson(removed.schedules ?: schedulesListForClient())
    out << "}"
    return renderJsonNoStore( withAuthJson(out.toString()), 200)
}

def mcpSchedulesAllowed() {
    return mcpSchedulesEnabled == true && schedulerIsEnabled()
}

def mcpLocalOnly() {
    try { return request?.requestSource != "cloud" } catch (e) { return true }
}

def mcpJson(payload) {
    return groovy.json.JsonOutput.toJson(payload)
}

def mcpGet() {
    if (!mcpSchedulesAllowed()) return renderJsonNoStore('{"ok":false,"error":"schedule assistant is off"}', 404)
    if (!mcpLocalOnly()) return renderJsonNoStore('{"ok":false,"error":"schedule assistant is local only"}', 404)
    return renderNoStore("text/plain",
        "Modern Dashboard schedule assistant. POST JSON-RPC here from your home network.\n" +
        "Away from home, upload a schedule JSON file from the dashboard Scheduler.\n",
        405)
}

def mcpPost() {
    if (!mcpSchedulesAllowed()) return renderJsonNoStore('{"ok":false,"error":"schedule assistant is off"}', 404)
    if (!mcpLocalOnly()) return renderJsonNoStore('{"ok":false,"error":"schedule assistant is local only"}', 404)
    def body = parseRequestJson()
    if (body instanceof List) {
        def out = []
        boolean notesOnly = true
        for (item in body) {
            if (!(item instanceof Map) || !item.containsKey("id")) continue
            notesOnly = false
            out << mcpDispatch(item)
        }
        if (notesOnly) {
            render contentType: "application/json", data: "", status: 202
            return
        }
        return renderJsonNoStore(mcpJson(out), 200)
    }
    if (!(body instanceof Map)) return renderJsonNoStore(mcpJson([jsonrpc: "2.0", id: null, error: [code: -32700, message: "parse error"]]), 400)
    def method = body.method?.toString()
    if (!body.containsKey("id") || method?.startsWith("notifications/")) {
        render contentType: "application/json", data: "", status: 202
        return
    }
    return renderJsonNoStore(mcpJson(mcpDispatch(body)), 200)
}

def mcpDispatch(Map body) {
    def id = body.id
    def method = body.method?.toString()
    try {
        if (method == "initialize") return [jsonrpc: "2.0", id: id, result: mcpInitialize(body.params)]
        if (method == "ping") return [jsonrpc: "2.0", id: id, result: [:]]
        if (method == "tools/list") return [jsonrpc: "2.0", id: id, result: [tools: mcpToolDefs()]]
        if (method == "tools/call") return [jsonrpc: "2.0", id: id, result: mcpCallTool(body.params)]
        return [jsonrpc: "2.0", id: id, error: [code: -32601, message: "method not found"]]
    } catch (e) {
        return [jsonrpc: "2.0", id: id, error: [code: -32603, message: (e?.message ?: "internal error").toString()]]
    }
}

def mcpInitialize(params) {
    def requested = params?.protocolVersion?.toString()
    def version = (requested == "2025-06-18" || requested == "2025-03-26") ? requested : "2025-03-26"
    return [
        protocolVersion: version,
        capabilities: [tools: [listChanged: false]],
        serverInfo: [name: "Modern Dashboard", version: MLD_DEPLOYED_VERSION]
    ]
}

def mcpToolDefs() {
    def triggerHelp = "kind is daily, weekly, once, or mode. Clock: when=clock and time=HH:mm. Sun: when=sunrise or sunset and offsetMin (-720 to 720). Weekly days are MON,TUE,WED,THU,FRI,SAT,SUN. Once: at=yyyy-MM-ddTHH:mm in hub local time. Mode: mode is the hub mode name."
    def actionHelp = "target is lights, outlets, locks, blinds, fans, thermostats, or hubMode. Lights and outlets use states: [{name or id, on, level, ct}]. Locks use states: [{name or id, locked}]. locked false unlocks and does not ask for a PIN. Blinds use states: [{name or id, open, position}]. position is 1-100 only when open and that shade supports position. Fans use states: [{name or id, on, speed}]. speed is one reported for that fan. Omit speed to turn on. Thermostats use devices (name or id) plus mode, heat, cool, and fanMode. Hub mode uses mode."
    def scheduleProps = [
        name: [type: "string"],
        enabled: [type: "boolean"],
        trigger: [type: "object", description: triggerHelp],
        onlyInModes: [type: "array", items: [type: "string"]],
        action: [type: "object", description: actionHelp]
    ]
    return [
        [
            name: "list_schedule_context",
            description: "List selected lights, outlets, thermostats, locks, blinds, fans, hub modes, and current schedules. Call this before creating a schedule.",
            inputSchema: [type: "object", properties: [:]]
        ],
        [
            name: "create_schedule",
            description: "Create one dashboard schedule. Match devices by name from list_schedule_context. Omit enabled to leave the schedule on.",
            inputSchema: [type: "object", properties: scheduleProps, required: ["name", "trigger", "action"]]
        ],
        [
            name: "update_schedule",
            description: "Replace one schedule by id, or by name when only one schedule uses that name.",
            inputSchema: [type: "object", properties: scheduleProps + [id: [type: "string"]], required: ["trigger", "action"]]
        ],
        [
            name: "delete_schedule",
            description: "Delete one schedule by id or by a unique name.",
            inputSchema: [type: "object", properties: [id: [type: "string"], name: [type: "string"]]]
        ]
    ]
}

def mcpCallTool(params) {
    def name = params?.name?.toString()
    def args = params?.arguments instanceof Map ? params.arguments : [:]
    def payload
    if (name == "list_schedule_context") payload = mcpScheduleContext()
    else if (name == "create_schedule") payload = mcpCreateSchedule(args)
    else if (name == "update_schedule") payload = mcpUpdateSchedule(args)
    else if (name == "delete_schedule") payload = mcpDeleteSchedule(args)
    else return mcpToolResult("unknown tool", true)
    if (payload?.ok == false) return mcpToolResult((payload.error ?: "failed").toString(), true)
    return mcpToolResult(mcpJson(payload), false)
}

def mcpToolResult(String text, boolean isError) {
    return [content: [[type: "text", text: text]], isError: isError]
}

def mcpScheduleContext() {
    def catalog = scheduleDeviceCatalog()
    def schedules = []
    for (s in schedulesListForClient()) {
        schedules << [
            id: s.id, name: s.name, enabled: s.enabled, summary: s.summary,
            trigger: s.trigger, action: s.action, onlyInModes: s.onlyInModes
        ]
    }
    return [ok: true, devices: catalog.devices, hubModes: catalog.hubModes, schedules: schedules]
}

def scheduleDeviceRoom(d) {
    try { return d?.getRoomName()?.toString() ?: "" } catch (e) { return "" }
}

def scheduleListChoices(raw) {
    def out = []
    def seen = [] as Set
    for (tok in (normalizeListTokens(raw) ?: [])) {
        def s = tok?.toString()?.trim()
        if (!s) continue
        def key = s.toLowerCase()
        if (seen.contains(key)) continue
        seen << key
        out << s
    }
    return out
}

def scheduleThermostatFanModeChoices(dev) {
    def raw = null
    try { raw = safeCurrent(dev, "supportedThermostatFanModes") ?: safeCurrent(dev, "supportedFanModes") } catch (e) {}
    if (raw == null) return []
    return scheduleListChoices(raw)
}

// Devices selected in this app, and only the controls a schedule can set.
// target matches the schedule action target. controls are field names, not live status.
def scheduleDeviceCatalog() {
    def devices = []
    def add = { d, target, Map extra ->
        if (d == null) return
        def row = [
            id: d.id?.toString(),
            name: scheduleDeviceLabel(d),
            room: scheduleDeviceRoom(d),
            target: target
        ]
        if (extra) row.putAll(extra)
        devices << row
    }
    for (d in (lights ?: [])) {
        def controls = ["on"]
        def extra = [controls: controls]
        try {
            if (d.hasCapability("SwitchLevel") == true) {
                controls << "level"
                extra.level = [min: 0, max: 100]
            }
        } catch (e) {}
        try {
            if (d.hasCapability("ColorTemperature") == true) {
                controls << "ct"
                extra.ct = [min: 2000, max: 6500]
            }
        } catch (e) {}
        add(d, "lights", extra)
    }
    for (d in (outletSwitches ?: [])) add(d, "outlets", [controls: ["on"]])
    for (d in (locks ?: [])) add(d, "locks", [controls: ["locked"]])
    for (d in (allWindowShades() ?: [])) {
        def controls = ["open"]
        def extra = [controls: controls]
        try {
            if (shadeSupportsPosition(d) == true) {
                controls << "position"
                extra.position = [min: 1, max: 100]
            }
        } catch (e) {}
        add(d, "blinds", extra)
    }
    for (d in (ceilingFans ?: [])) {
        add(d, "fans", [controls: ["on", "speed"], speeds: scheduleFanSpeedChoices(d)])
    }
    for (d in (thermostats ?: [])) {
        def unit = "F"
        try { unit = thermostatTempUnit(d) } catch (e) {}
        def range = thermostatDialRange(unit) ?: [min: 50, max: 90]
        def extra = [unit: unit, setpointRange: range]
        def reportedModes = null
        try { reportedModes = safeCurrent(d, "supportedThermostatModes") } catch (e) {}
        def modes = (reportedModes == null) ? ["auto", "heat", "cool", "off"] : scheduleListChoices(reportedModes)
        if (modes) extra.modes = modes
        def fanModes = []
        try { fanModes = scheduleThermostatFanModeChoices(d) } catch (e) {}
        if (fanModes) extra.fanModes = fanModes
        add(d, "thermostats", extra)
    }
    def nameCounts = [:]
    for (row in devices) {
        def key = row.name?.toString()?.trim()?.toLowerCase()
        if (!key) continue
        nameCounts[key] = (nameCounts[key] ?: 0) + 1
    }
    for (row in devices) {
        def key = row.name?.toString()?.trim()?.toLowerCase()
        if (key && nameCounts[key] > 1) row.useId = true
    }
    def modes = []
    try {
        for (m in (location?.modes ?: [])) {
            def n = m?.name?.toString()
            if (n) modes << n
        }
    } catch (e) {}
    def catalogNote = "Devices selected in Modern Dashboard that a schedule can control. target is the schedule action target. controls are fields a schedule may set, not the device's current state. useId means another selected device has the same name, so put id in the schedule instead of name. speeds, modes, and fanModes are the only values a schedule may use for that device. This is not live status. Give this file to an assistant with the schedule schema."
    if (holidayModuleInstalled()) catalogNote += " The same names are used in a Shabbat and holidays file."
    return [
        description: catalogNote,
        hubModes: modes,
        devices: devices
    ]
}

def schedulesDevicesGet() {
    def headers = noStoreHeaders() + ["Content-Disposition": "attachment; filename=\"mdash-devices.json\""]
    def body = groovy.json.JsonOutput.prettyPrint(groovy.json.JsonOutput.toJson(scheduleDeviceCatalog()))
    render contentType: "application/json", data: body, status: 200, headers: headers
}

def schedulesSchemaGet() {
    def headers = noStoreHeaders() + ["Content-Disposition": "attachment; filename=\"mdash-schedule-schema.json\""]
    render contentType: "application/json", data: schedUploadSchema().trim(), status: 200, headers: headers
}

def holidaysSchemaGet() {
    if (!holidayModuleInstalled()) return renderJsonNoStore('{"ok":false,"error":"not found"}', 404)
    def headers = noStoreHeaders() + ["Content-Disposition": "attachment; filename=\"mdash-holiday-schema.json\""]
    render contentType: "application/json", data: holidayUploadSchema().trim(), status: 200, headers: headers
}

def mcpCreateSchedule(args) {
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) return [ok: false, error: parsed.error]
    def map = parsed.map instanceof Map ? parsed.map : [:]
    def priorJson = state.schedulesJson
    def prepared = schedulesPrepareUploadItem(args, map, false, false)
    if (prepared.ok != true) return [ok: false, error: prepared.error]
    def staged = schedulesStageOne(map, prepared.schedule)
    if (staged.ok != true) return [ok: false, error: staged.error]
    def armed = (prepared.schedule?.enabled == true) ? [staged.id] : []
    def done = schedulesFinishSave(map, priorJson, armed)
    if (done.ok != true) return [ok: false, error: done.error]
    try { log.info "Modern Dashboard: schedule assistant created ${prepared.schedule?.name}" } catch (e) {}
    return [ok: true, schedule: mcpScheduleRow(staged.id)]
}

def mcpUpdateSchedule(args) {
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) return [ok: false, error: parsed.error]
    def map = parsed.map instanceof Map ? parsed.map : [:]
    def priorJson = state.schedulesJson
    def prepared = schedulesPrepareUploadItem(args, map, true, true)
    if (prepared.ok != true) return [ok: false, error: prepared.error]
    def staged = schedulesStageOne(map, prepared.schedule)
    if (staged.ok != true) return [ok: false, error: staged.error]
    def armed = (prepared.schedule?.enabled == true) ? [staged.id] : []
    def done = schedulesFinishSave(map, priorJson, armed)
    if (done.ok != true) return [ok: false, error: done.error]
    try { log.info "Modern Dashboard: schedule assistant updated ${prepared.schedule?.name}" } catch (e) {}
    return [ok: true, schedule: mcpScheduleRow(staged.id)]
}

def mcpDeleteSchedule(args) {
    def id = args?.id?.toString()?.trim()
    if (!id) {
        def parsed = parseSchedulesMapResult()
        if (parsed.ok != true) return [ok: false, error: parsed.error]
        def match = schedulesMatchIdByName(parsed.map, args?.name)
        if (match.error) return [ok: false, error: match.error]
        id = match.id
    }
    if (!id) return [ok: false, error: "schedule not found"]
    def removed = schedulesRemoveById(id)
    if (removed.ok != true) return [ok: false, error: removed.error ?: "not found"]
    try { log.info "Modern Dashboard: schedule assistant deleted ${id}" } catch (e) {}
    return [ok: true, id: id]
}

def mcpScheduleRow(id) {
    for (s in schedulesListForClient()) {
        if (s?.id?.toString() == id?.toString()) {
            return [id: s.id, name: s.name, enabled: s.enabled, summary: s.summary, trigger: s.trigger, action: s.action, onlyInModes: s.onlyInModes]
        }
    }
    return [id: id]
}

def schedulesToggle() {
    if (!guardDashboardAccess()) return renderAuthRequired()
    if (!guardSchedulerEnabled()) return
    def body = parseRequestJson()
    def id = body?.id?.toString()?.trim()
    if (!id) {
        return renderJsonNoStore( '{"ok":false,"error":"missing id"}', 400)
    }
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) return renderSchedulesStoreError(parsed)
    def map = parsed.map instanceof Map ? parsed.map : [:]
    def s = map[id]
    if (!s) {
        return renderJsonNoStore( '{"ok":false,"error":"not found"}', 404)
    }
    def priorJson = state.schedulesJson
    s.enabled = (s.enabled != true)
    map[id] = s
    def cycleErr = schedulesModeCycleError(map)
    if (cycleErr) {
        s.enabled = (s.enabled != true)
        map[id] = s
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr(cycleErr)}}".toString(), 422)
    }
    saveSchedulesMap(map)
    def rebuild = rebuildScheduledJobs()
    def failReason = null
    try { failReason = rebuild?.failures ? rebuild.failures[id] : null } catch (e) {}
    if (failReason && s.enabled == true) {
        if (priorJson != null) state.schedulesJson = priorJson
        else state.remove("schedulesJson")
        rebuildScheduledJobs()
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr(failReason)},\"schedules\":${groovy.json.JsonOutput.toJson(schedulesListForClient())}}".toString(), 422)
    }
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
    def parsed = parseSchedulesMapResult()
    if (parsed.ok != true) return renderSchedulesStoreError(parsed)
    def map = parsed.map instanceof Map ? parsed.map : [:]
    def s = map[id]
    if (!s) {
        return renderJsonNoStore( '{"ok":false,"error":"not found"}', 404)
    }
    def result = newScheduleActionResult()
    try {
        log.info "Modern Dashboard: schedule test — ${scheduleLogName(id, s)} · ${scheduleActionLogSummary(s?.action)}"
        result = runScheduleAction(s?.action)
    } catch (e) {
        log.warn "Modern Dashboard: schedule ${id} test failed: ${e}"
        return renderJsonNoStore( "{\"ok\":false,\"error\":${jsonStr(e.message ?: e.toString())}}".toString(), 500)
    }
    def lastResult = captureScheduleActionResult(result)
    def ok = (lastResult?.ok == true)
    def response = [ok: ok, lastResult: lastResult]
    if (!ok) response.error = scheduleActionResultError(lastResult)
    return renderJsonNoStore( withAuthJson(groovy.json.JsonOutput.toJson(response)), 200)
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
    // Truncating seconds can land on the just-elapsed minute — step forward.
    if (cal.getTimeInMillis() <= fromMs) cal.add(Calendar.MINUTE, 1)
    // Cap iterations to ~2 years of minutes
    for (int i = 0; i < 366 * 24 * 60 * 2; i++) {
        int s = cal.get(Calendar.SECOND)
        int mi = cal.get(Calendar.MINUTE)
        int h = cal.get(Calendar.HOUR_OF_DAY)
        int d = cal.get(Calendar.DAY_OF_MONTH)
        int mo = cal.get(Calendar.MONTH) + 1
        int dw = cal.get(Calendar.DAY_OF_WEEK)  // 1=SUN .. 7=SAT
        if (sec.contains(s) && min.contains(mi) && hour.contains(h) && mon.contains(mo) && dom.contains(d) && dow.contains(dw)) {
            return cal.getTimeInMillis()
        }
        cal.add(Calendar.MINUTE, 1)
    }
    return null
}

def cronParseDayOrInt(String tok, Map dayNames) {
    if (dayNames != null) {
        def named = dayNames[tok?.toUpperCase()]
        if (named != null) return named as Integer
    }
    return Integer.parseInt(tok)
}

// Parse a single cron field into a Set of integers. Supports "*", numbers, ranges "a-b",
// steps "a/b" and "*/b", lists "a,b,c", and Quartz day names SUN–SAT when lo/hi is 1–7.
// '?' is treated as '*'.
def cronFieldValues(String field, int lo, int hi) {
    def out = new HashSet()
    if (field == null) return null
    String f = field.trim()
    if (f == "?" || f == "*") {
        for (int v = lo; v <= hi; v++) out.add(v)
        return out
    }
    def dayNames = null
    if (lo == 1 && hi == 7) {
        dayNames = [SUN: 1, MON: 2, TUE: 3, WED: 4, THU: 5, FRI: 6, SAT: 7]
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
                    plo = cronParseDayOrInt(p.substring(0, dash).trim(), dayNames)
                    phi = cronParseDayOrInt(p.substring(dash + 1).trim(), dayNames)
                } catch (e) { return null }
            } else {
                try {
                    plo = cronParseDayOrInt(p, dayNames)
                    phi = plo
                } catch (e) { return null }
            }
        }
        if (plo < lo) plo = lo
        if (phi > hi) phi = hi
        for (int v = plo; v <= phi; v += step) out.add(v)
    }
    if (out.isEmpty()) return null
    return out
}
