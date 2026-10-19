// Loads the committed holiday app and the working copy with Hubitat stubs.
// Run from the repo root: groovy preview/verify-holidays.groovy

import groovy.json.JsonOutput
import groovy.transform.Field
import org.codehaus.groovy.control.CompilerConfiguration

@Field int failed = 0
@Field def oldApp = null
@Field def newApp = null

class CountingMap extends LinkedHashMap {
    int writes = 0
    @Override Object put(Object key, Object value) { writes++; return super.put(key, value) }
    @Override void putAll(Map m) { writes += (m?.size() ?: 0); super.putAll(m) }
}

class HolidayLocation {
    TimeZone timeZone = TimeZone.getTimeZone("America/New_York")
    def latitude = 40.71
    def longitude = -74.00
    String zipCode = "10001"
    String mode = "Home"
    List modes = ["Home", "Shabbat", "Away"]
    boolean setMode(String next) { mode = next?.toString() ?: mode; return true }
}

class HolidayHubStub extends Script {
    long clock = System.currentTimeMillis()
    int thermoCalls = 0
    int sunCalls = 0
    int parentSunCalls = 0
    boolean sunMissing = false
    int scheduleParses = 0
    int deviceRuns = 0
    int runOnceCalls = 0
    def debugLogging = false
    def app = [id: 41]
    def location = new HolidayLocation()
    def log = [info: { Object... a -> }, warn: { Object... a -> }, debug: { Object... a -> }, error: { Object... a -> }]
    def state = new CountingMap()
    def parent = null
    long now() { return clock }
    def unschedule(Object... args) {}
    def schedule(Object... args) {}
    def runOnce(Object... args) { runOnceCalls++ }
    def runIn(Object... args) {}
    def subscribe(Object... args) {}
    def unsubscribe(Object... args) {}
    def httpGet(Map m, Closure c) {}
    def definition(Map m) {}
    // The app's own sun lookup. Six in the morning and six in the evening, New York.
    def getSunriseAndSunset(Map opts) {
        sunCalls++
        if (sunMissing) return [sunrise: null, sunset: null]
        def day = opts?.date instanceof Date ? opts.date : new Date(clock)
        def at = { int hour ->
            def cal = Calendar.getInstance(TimeZone.getTimeZone("America/New_York"))
            cal.setTime(day)
            cal.set(Calendar.HOUR_OF_DAY, hour)
            cal.set(Calendar.MINUTE, 0)
            cal.set(Calendar.SECOND, 0)
            cal.set(Calendar.MILLISECOND, 0)
            return cal.getTime()
        }
        return [sunrise: at(6), sunset: at(18)]
    }
    def preferences(Closure c) { if (c) c.call() }
    def page(Map m) {}
    def section(Object... args) {}
    def dynamicPage(Map m, Closure c) {}
    def input(Object... args) {}
    def paragraph(Object... args) {}
    def href(Object... args) {}
    Object run() { null }
}

def check(boolean cond, String msg) {
    if (!cond) {
        failed++
        println "FAIL ${msg}"
    }
}

def root = new File(".").canonicalFile
if (!new File(root, "app/mDashHolidays.groovy").exists()) {
    println "Run from the repo root: groovy preview/verify-holidays.groovy"
    System.exit(1)
}

def show = ["git", "show", "HEAD:app/mDashHolidays.groovy"].execute(null, root)
def baselineText = show.in.getText("UTF-8")
def baselineErr = show.err.getText("UTF-8")
if (show.waitFor() != 0 || !baselineText.contains("def holidaysStatus")) {
    println "Could not read HEAD:app/mDashHolidays.groovy ${baselineErr}"
    System.exit(1)
}
def baseline = File.createTempFile("mDashHolidays-base", ".groovy")
baseline.deleteOnExit()
baseline.setText(baselineText, "UTF-8")

def loadApp(File file) {
    def cc = new CompilerConfiguration()
    cc.scriptBaseClass = HolidayHubStub.name
    def app = new GroovyShell(this.class.classLoader, new Binding(), cc).parse(file)
    app.run()
    def stub = app
    stub.parent = [
        holidaySupportedKinds: { ["light", "outlet", "blind", "fan", "lock", "thermostat"] },
        thermostatSettingNormalized: { s ->
            stub.thermoCalls++
            return [mode: s?.mode, heat: s?.heat, cool: s?.cool, fanMode: s?.fanMode]
        },
        thermostatSettingError: { s -> null },
        scheduleSunMs: { which, offset, date ->
            stub.sunCalls++
            stub.parentSunCalls++
            def cal = Calendar.getInstance(TimeZone.getTimeZone("America/New_York"))
            cal.setTime(date instanceof Date ? date : new Date(stub.clock))
            cal.set(Calendar.HOUR_OF_DAY, which?.toString() == "sunrise" ? 6 : 18)
            cal.set(Calendar.MINUTE, 0)
            cal.set(Calendar.SECOND, 0)
            cal.set(Calendar.MILLISECOND, 0)
            return cal.getTimeInMillis()
        },
        parseSchedulesMapResult: {
            stub.scheduleParses++
            return [ok: true, map: [:]]
        },
        holidayRunAction: { states ->
            stub.deviceRuns++
            return [attempted: (states ?: []).size(), succeeded: (states ?: []).size()]
        }
    ]
    return stub
}

oldApp = loadApp(baseline)
newApp = loadApp(new File(root, "app/mDashHolidays.groovy"))

long ms(String iso) { return java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli() }
def candles(String iso) { return [title: "Candle lighting", date: iso, category: "candles"] }
def havdalah(String iso) { return [title: "Havdalah", date: iso, category: "havdalah"] }
def hol(String date, String hdate) { return [title: "Holiday", date: date, hdate: hdate, category: "holiday"] }
def light(String id, boolean on) { return [id: id, kind: "light", on: on] }
def tstat() { return [id: "hall", kind: "thermostat", mode: "heat", heat: 68, cool: 74, fanMode: "auto"] }

def shabbatTemplate(List custom = null) {
    return [
        start: [states: [light("dining", true), tstat()], repeatLaterNights: false],
        night: [[time: "23:00", states: [light("dining", false)]]],
        morning: [[time: "08:00", states: [light("kitchen", true)]]],
        afternoon: [],
        evening: [[time: "19:30", states: [light("porch", true)]]],
        end: [states: [light("dining", false)]],
        custom: custom != null ? custom : [[anchor: "sunrise", value: 0, days: "every", states: [light("porch", true)]]]
    ]
}

def config(Map extra = [:]) {
    def settings = [
        holidayMode: "Shabbat", endMode: "Home", israel: false, doNotStartModes: ["Away"],
        candleMin: 18, havdalah: [type: "nightfall", minutes: 0], startEarlyMin: 0,
        earlyShabbat: [enabled: false, time: "19:00", sunsetBefore: "18:30"],
        earlyShabbatWeeks: [:], paused: false
    ]
    if (extra.settings instanceof Map) extra.settings.each { k, v -> settings[k] = v }
    return [
        settings: settings,
        templates: [shabbat: extra.template ?: shabbatTemplate()],
        occasions: [
            roshHashana: "shabbat", yomKippur: "shabbat", sukkot: "shabbat", shemini: "shabbat",
            pesachFirst: "shabbat", pesachLast: "shabbat", shavuot: "shabbat"
        ] + (extra.occasions instanceof Map ? extra.occasions : [:]),
        pausedOccasions: extra.pausedOccasions ?: [],
        spanOverrides: extra.spanOverrides ?: [:]
    ]
}

def seed(app, Map opts) {
    app.clock = opts.clock as long
    app.location.mode = opts.mode ?: "Home"
    app.thermoCalls = 0
    app.sunCalls = 0
    app.parentSunCalls = 0
    app.sunMissing = false
    app.scheduleParses = 0
    app.deviceRuns = 0
    app.runOnceCalls = 0
    try { app.holidayClearMemos() } catch (ignored) {}
    app.state.clear()
    app.state.writes = 0
    app.state.config = opts.config
    def boundaries = app.holidayBoundaries(opts.items)
    def holidays = app.holidayHolidayRows(opts.items)
    app.state.calendar = [
        boundaries: boundaries, holidays: holidays,
        query: app.holidayQueryKey(), fetchedAt: opts.clock, error: ""
    ]
    app.state.runtime = [
        revision: opts.revision ?: 1,
        doneIds: opts.doneIds ?: [:],
        skippedSpanIds: opts.skipped ?: [],
        history: opts.history ?: [],
        activeSpan: opts.activeSpan,
        parentHidden: false,
        changingMode: false,
        testSpan: opts.testSpan,
        replayHeld: opts.replayHeld
    ]
    app.state.writes = 0
}

def norm(value) {
    if (value instanceof Map) {
        def out = new TreeMap()
        value.each { k, v -> out[k == null ? "null" : k.toString()] = norm(v) }
        return out
    }
    if (value instanceof Collection) return value.collect { norm(it) }
    if (value instanceof Boolean || value == null) return value
    if (value instanceof Number) {
        try {
            def asLong = value as long
            def asDouble = value as double
            if (asDouble == asLong) return asLong
        } catch (ignored) {}
        return value.toString()
    }
    return value.toString()
}

def canon(value) { return JsonOutput.toJson(norm(value)) }

def slimSpan(span) {
    if (!(span instanceof Map)) return null
    def actions = []
    for (a in (span.actions ?: [])) {
        actions << [
            id: a?.id?.toString(), at: a?.at, kind: a?.kind?.toString(), question: a?.question?.toString(),
            skipped: a?.skipped == true, skipReason: a?.skipReason?.toString() ?: "",
            states: a?.states ?: []
        ]
    }
    return [
        id: span.id?.toString(), name: span.name?.toString(), start: span.start, end: span.end,
        occasion: span.occasion?.toString(), skipped: span.skipped == true, paused: span.paused == true,
        once: span.once == true, warnings: span.warnings ?: [], actions: actions
    ]
}

def snapshot(app) {
    def status = app.holidaysStatus()
    def later = app.holidaysLater()
    def spanId = later?.rows ? later.rows[0].spanId?.toString() : null
    def one = spanId ? app.holidaysLater(spanId) : [span: null]
    def preview = app.holidaysPreview([occasion: "shabbat"])
    def arm = app.holidayArm()
    return [
        rows: status?.rows,
        spans: (status?.spans ?: []).collect { slimSpan(it) },
        laterRows: later?.rows,
        laterCount: status?.laterCount,
        one: slimSpan(one?.span),
        preview: slimSpan(preview?.span),
        previewWarnings: preview?.warnings ?: [],
        arm: [scheduled: arm?.scheduled == true, when: arm?.when?.toString() ?: "", retry: arm?.retry == true],
        conflicts: status?.conflicts ?: []
    ]
}

def same(String label, oldValue, newValue) {
    def left = canon(oldValue)
    def right = canon(newValue)
    if (left == right) return
    failed++
    println "FAIL ${label}"
    int n = Math.min(left.length(), right.length())
    int i = 0
    while (i < n && left.charAt(i) == right.charAt(i)) i++
    println " at ${i}"
    println " OLD ${left.substring(Math.max(0, i - 80), Math.min(left.length(), i + 180))}"
    println " NEW ${right.substring(Math.max(0, i - 80), Math.min(right.length(), i + 180))}"
}

def runCase(String label, Map opts) {
    seed(oldApp, opts)
    seed(newApp, opts)
    def oldSnap = null
    def newSnap = null
    try { oldSnap = snapshot(oldApp) } catch (e) { failed++; println "FAIL ${label} old threw ${e}"; return }
    try { newSnap = snapshot(newApp) } catch (e) { failed++; println "FAIL ${label} new threw ${e}"; e.printStackTrace(); return }
    same(label, oldSnap, newSnap)
    check(newApp.parentSunCalls == 0, "${label} the new app asked the dashboard app for sun times")
    oldApp.thermoCalls = 0
    oldApp.sunCalls = 0
    oldApp.scheduleParses = 0
    newApp.thermoCalls = 0
    newApp.sunCalls = 0
    newApp.scheduleParses = 0
    oldApp.holidaysStatus()
    newApp.holidaysStatus()
    check(newApp.thermoCalls <= oldApp.thermoCalls, "${label} second status thermostat calls ${newApp.thermoCalls} > ${oldApp.thermoCalls}")
    check(newApp.sunCalls <= oldApp.sunCalls, "${label} second status sun calls ${newApp.sunCalls} > ${oldApp.sunCalls}")
    if (oldApp.thermoCalls > 0) check(newApp.thermoCalls == 0, "${label} cached status still normalized thermostats")
    if (oldApp.sunCalls > 0) check(newApp.sunCalls == 0, "${label} cached status still asked for sunrise")
    println "${label}: second status thermo old ${oldApp.thermoCalls} new ${newApp.thermoCalls}, sun old ${oldApp.sunCalls} new ${newApp.sunCalls}, schedules old ${oldApp.scheduleParses} new ${newApp.scheduleParses}"
}

def reconcile(String label, Map opts) {
    seed(oldApp, opts)
    seed(newApp, opts)
    try { oldApp.holidayReconcile(false) } catch (e) { failed++; println "FAIL ${label} old reconcile ${e}"; return }
    try { newApp.holidayReconcile(false) } catch (e) { failed++; println "FAIL ${label} new reconcile ${e}"; e.printStackTrace(); return }
    // A timer that calls into the dashboard app can wait on the poll that holds it.
    check(newApp.parentSunCalls == 0, "${label} the new app asked the dashboard app for sun times during a fire")
    def pack = { app ->
        def done = []
        (app.state.runtime?.doneIds instanceof Map ? app.state.runtime.doneIds.keySet() : []).each { done << it.toString() }
        done = done.sort()
        def active = app.state.runtime?.activeSpan
        return [
            mode: app.location.mode?.toString(),
            done: done,
            runs: app.deviceRuns,
            active: [
                id: active?.id?.toString(),
                held: active?.held == true,
                startRan: active?.startRan == true,
                ended: active?.ended == true
            ]
        ]
    }
    same(label, pack(oldApp), pack(newApp))
}

def rh = [
    candles("2026-09-11T18:53:00-04:00"),
    hol("2026-09-12", "1 Tishrei 5787"),
    candles("2026-09-12T19:51:00-04:00"),
    hol("2026-09-13", "2 Tishrei 5787"),
    havdalah("2026-09-13T19:49:00-04:00")
]
def twoWeeks = [
    candles("2026-09-18T18:40:00-04:00"),
    havdalah("2026-09-19T19:40:00-04:00"),
    candles("2026-09-25T18:30:00-04:00"),
    havdalah("2026-09-26T19:30:00-04:00")
]
def summer = [
    candles("2026-06-05T20:12:00-04:00"),
    havdalah("2026-06-06T21:15:00-04:00")
]
def dst = [
    candles("2026-03-06T17:40:00-05:00"),
    havdalah("2026-03-07T18:40:00-05:00"),
    candles("2026-03-13T19:10:00-04:00"),
    havdalah("2026-03-14T20:10:00-04:00")
]

runCase("before rosh hashana", [clock: ms("2026-09-10T12:00:00-04:00"), items: rh, config: config()])
runCase("during rosh hashana", [clock: ms("2026-09-12T10:00:00-04:00"), items: rh, config: config()])
runCase("after rosh hashana", [clock: ms("2026-09-14T12:00:00-04:00"), items: rh, config: config()])
runCase("early shabbat", [
    clock: ms("2026-06-04T12:00:00-04:00"), items: summer,
    config: config(settings: [earlyShabbat: [enabled: true, time: "19:00", sunsetBefore: "18:30"], startEarlyMin: 10])
])
runCase("before-end reaches backward", [
    clock: ms("2026-09-15T12:00:00-04:00"), items: twoWeeks,
    config: config(spanOverrides: ["2026-09-26": [
        start: [states: [light("dining", true)], repeatLaterNights: false],
        night: [], morning: [], afternoon: [], evening: [],
        end: [states: []],
        custom: [[anchor: "before-end", value: 14400, days: "last", states: [light("porch", true)]]]
    ]])
])
runCase("paused shabbat", [
    clock: ms("2026-06-04T12:00:00-04:00"), items: summer,
    config: config(pausedOccasions: ["shabbat"])
])
runCase("skipped week", [
    clock: ms("2026-06-04T12:00:00-04:00"), items: summer,
    config: config(), skipped: ["2026-06-06"]
])
runCase("dst weeks", [clock: ms("2026-03-05T12:00:00-05:00"), items: dst, config: config()])
runCase("test span", [
    clock: ms("2026-09-10T12:00:00-04:00"), items: rh, config: config(),
    testSpan: [id: "test", start: ms("2026-09-10T12:02:00-04:00"), end: ms("2026-09-10T12:12:00-04:00")]
])

reconcile("fire rosh hashana start", [clock: ms("2026-09-11T18:54:00-04:00"), items: rh, config: config()])
reconcile("hold for away", [
    clock: ms("2026-09-11T18:54:00-04:00"), items: rh, config: config(), mode: "Away"
])
reconcile("quiet afternoon", [clock: ms("2026-09-10T12:00:00-04:00"), items: rh, config: config()])

// A span can still be running after its date string has passed, when havdalah is after midnight.
// Prune then drops the week pin and the one-time edit. The cached timeline must not keep them.
def overnight = [
    candles("2026-06-05T20:12:00-04:00"),
    havdalah("2026-06-07T01:00:00-04:00")
]
def overnightConfig = config(
    settings: [earlyShabbat: [enabled: true, time: "19:00", sunsetBefore: "23:00"], earlyShabbatWeeks: ["2026-06-05": "on"]],
    spanOverrides: ["2026-06-06": [
        start: [states: [light("dining", true)], repeatLaterNights: false],
        night: [], morning: [], afternoon: [], evening: [],
        end: [states: [light("porch", true)]],
        custom: []
    ]]
)
seed(oldApp, [clock: ms("2026-06-04T12:00:00-04:00"), items: overnight, config: overnightConfig])
seed(newApp, [clock: ms("2026-06-04T12:00:00-04:00"), items: overnight, config: overnightConfig])
try { oldApp.holidaysStatus() } catch (e) { failed++; println "FAIL overnight cache old warm ${e}" }
try { newApp.holidaysStatus() } catch (e) { failed++; println "FAIL overnight cache new warm ${e}" }
oldApp.clock = ms("2026-06-07T00:30:00-04:00")
newApp.clock = ms("2026-06-07T00:30:00-04:00")
try { same("prune while the span is still running", snapshot(oldApp), snapshot(newApp)) } catch (e) { failed++; println "FAIL prune while the span is still running ${e}" }

seed(oldApp, [clock: ms("2026-09-10T12:00:00-04:00"), items: rh, config: config()])
seed(newApp, [clock: ms("2026-09-10T12:00:00-04:00"), items: rh, config: config()])
try { oldApp.holidaysStatus() } catch (e) { failed++; println "FAIL location cache old warm ${e}" }
try { newApp.holidaysStatus() } catch (e) { failed++; println "FAIL location cache new warm ${e}" }
oldApp.location.latitude = 0
oldApp.location.longitude = 0
oldApp.location.zipCode = "00000"
newApp.location.latitude = 0
newApp.location.longitude = 0
newApp.location.zipCode = "00000"
try { same("cleared hub location drops the calendar", snapshot(oldApp), snapshot(newApp)) } catch (e) { failed++; println "FAIL cleared hub location ${e}" }

// The timer fires at havdalah, which is the span's end. The old list dropped that
// span before the end actions could run, so nothing happened.
long candle = ms("2026-06-05T20:12:00-04:00")
long hav = ms("2026-06-06T21:15:00-04:00")
def endRuntime = [
    mode: "Shabbat",
    activeSpan: [id: "2026-06-06", start: candle, end: hav, held: false, overridden: false, startRan: true, ended: false],
    doneIds: ["2026-06-06|modeEnter": candle, "2026-06-06|d0|start|0": candle]
]
seed(oldApp, [clock: hav + 1000, items: summer, config: config()] + endRuntime)
seed(newApp, [clock: hav + 1000, items: summer, config: config()] + endRuntime)
try { oldApp.holidayReconcile(false) } catch (e) { failed++; println "FAIL old havdalah reconcile ${e}" }
try { newApp.holidayReconcile(false) } catch (e) { failed++; println "FAIL new havdalah reconcile ${e}"; e.printStackTrace() }
check(oldApp.deviceRuns == 0, "the previous app ran havdalah after the span had ended")
check(newApp.deviceRuns == 1, "havdalah actions run when the timer fires as the span ends")
check(newApp.location.mode == "Home", "havdalah returns the hub to the end mode")

long testStart = ms("2026-06-04T12:02:00-04:00")
long testEnd = testStart + 10 * 60 * 1000
seed(newApp, [clock: testEnd + 5 * 60 * 1000, items: summer, config: config(), mode: "Home", testSpan: [id: "test", start: testStart, end: testEnd]])
try { newApp.holidayReconcile(false) } catch (e) { failed++; println "FAIL late test span ${e}"; e.printStackTrace() }
check(newApp.deviceRuns >= 1, "a test span that already ended still runs its device actions")
check(newApp.location.mode == "Home", "a late test span does not leave the hub in the holiday mode")

seed(oldApp, [clock: hav + 2 * 60 * 1000, items: summer, config: config()] + endRuntime)
seed(newApp, [clock: hav + 2 * 60 * 1000, items: summer, config: config()] + endRuntime)
try { oldApp.holidayReconcile(false) } catch (e) { failed++; println "FAIL old late havdalah ${e}" }
try { newApp.holidayReconcile(false) } catch (e) { failed++; println "FAIL new late havdalah ${e}"; e.printStackTrace() }
check(oldApp.deviceRuns == 0, "the previous app ran havdalah a couple of minutes late")
check(newApp.deviceRuns == 1, "havdalah actions still run when the timer is a couple of minutes late")
check(newApp.location.mode == "Home", "a late havdalah still returns the hub to the end mode")
check(newApp.parentSunCalls == 0, "a late havdalah asked the dashboard app for sun times")
check(newApp.sunCalls > 0, "the holiday app did not read sun times from the hub itself")

// The hub can load candle lighting from a postal code while sunrise is unavailable.
// Expanding that custom used to throw and skip every action in the same run.
oldApp.parent.scheduleSunMs = { which, offset, date -> null }
seed(oldApp, [clock: candle + 1000, items: summer, config: config()])
seed(newApp, [clock: candle + 1000, items: summer, config: config()])
newApp.sunMissing = true
try { oldApp.holidayReconcile(false) } catch (e) { failed++; println "FAIL old missing sun ${e}" }
try { newApp.holidayReconcile(false) } catch (e) { failed++; println "FAIL new missing sun ${e}"; e.printStackTrace() }
check(oldApp.deviceRuns == 0, "the previous app ran candle lighting when sunrise was missing")
check(newApp.deviceRuns >= 1, "candle lighting still runs when sunrise is missing")
check(newApp.location.mode == "Shabbat", "candle lighting still sets the holiday mode when sunrise is missing")
newApp.sunMissing = false

// A dashboard page opened before a pause still carries paused: false in its copy of the settings.
seed(newApp, [clock: ms("2026-06-04T12:00:00-04:00"), items: summer, config: config(settings: [paused: true])])
check(newApp.holidayUserPaused() == true, "the pause flag reads the user's Pause button")
try { newApp.holidaysSave([settings: [paused: false, candleMin: 20]]) } catch (e) { failed++; println "FAIL stale settings save ${e}"; e.printStackTrace() }
check(newApp.state.config.settings.paused == true, "a settings save from the dashboard resumed a paused app")
check(newApp.state.config.settings.candleMin == 20, "a settings save from the dashboard dropped the other settings")
seed(newApp, [clock: ms("2026-06-04T12:00:00-04:00"), items: summer, config: config(settings: [paused: false])])
try { newApp.holidaysSave([settings: [paused: true, candleMin: 22]]) } catch (e) { failed++; println "FAIL stale settings save 2 ${e}"; e.printStackTrace() }
check(newApp.state.config.settings.paused == false, "a settings save from the dashboard paused a running app")
check(newApp.holidayUserPaused() == false, "the pause flag follows the stored setting")

if (failed) {
    println "${failed} holiday comparison failure(s)"
    System.exit(1)
}
println "holiday comparison ok"
