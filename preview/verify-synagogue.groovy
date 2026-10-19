// Loads app/mDashSynagogue.groovy with Hubitat stubs and checks phase 1 time rules.
// Run: groovy preview/verify-synagogue.groovy

import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import org.codehaus.groovy.control.CompilerConfiguration

class SynagogueHubStub extends Script {
    SynagogueHubStub() { super() }
    SynagogueHubStub(Binding binding) { super(binding) }
    def definition(Map m) {}
    def preferences(Closure c) { if (c) c.call() }
    def page(Map m) {}
    def section(Object... args) {}
    def dynamicPage(Map m, Closure c) {}
    def input(Object... args) {}
    def paragraph(Object... args) {}
    def href(Object... args) {}
    def log = [info: { }, warn: { }, debug: { }, error: { }]
    def state = [:]
    def location = [timeZone: TimeZone.getTimeZone("America/New_York"), latitude: 40.71, longitude: -74.0, zipCode: "10001", mode: "Day", modes: ["Day", "Night"]]
    int parentSunCalls = 0
    def parent = [
        holidayRunAction: { states -> [attempted: (states ?: []).size(), succeeded: (states ?: []).size(), missing: [], failed: []] },
        scheduleSunMs: { which, offset, date -> parentSunCalls++; null },
        synagogueScheduleNames: { [:] }
    ]
    // The app's own sun lookup. Six in the morning and six in the evening, New York.
    boolean sunMissing = false
    def getSunriseAndSunset(Map opts) {
        if (sunMissing) return [sunrise: null, sunset: null]
        def day = opts?.date instanceof Date ? opts.date : new Date()
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
    long now() { System.currentTimeMillis() }
    def httpGet(Map m, Closure c) {}
    def unschedule(Object... args) {}
    def schedule(Object... args) {}
    def runOnce(Object... args) {}
    def runIn(Object... args) {}
    def subscribe(Object... args) {}
    def unsubscribe(Object... args) {}
    Object run() { null }
}

def cc = new CompilerConfiguration()
cc.scriptBaseClass = SynagogueHubStub.name
def app = new GroovyShell(this.class.classLoader, new Binding(), cc).parse(new File("app/mDashSynagogue.groovy"))
app.run()

def scriptArgs = []
try { scriptArgs = args as List } catch (e) { scriptArgs = [] }
if (scriptArgs.contains("serve")) {
    def slurper = new JsonSlurper()
    System.in.newReader().eachLine { line ->
        if (!line?.trim()) return
        try {
            def req = slurper.parseText(line)
            println JsonOutput.toJson(app.synagogueCli(req instanceof Map ? req : [:]))
        } catch (err) {
            println JsonOutput.toJson([ok: false, error: err.message ?: err.toString()])
        }
        System.out.flush()
    }
    return
}

int failed = 0
def check = { boolean ok, String message ->
    if (!ok) {
        failed++
        println "FAIL " + message
    }
}

def tz = TimeZone.getTimeZone("America/New_York")
long friday = app.synagogueZonedMs("2026-03-06", "12:00", tz)
long sundayBefore = app.synagogueZonedMs("2026-03-07", "07:00", tz)
long sundayAfter = app.synagogueZonedMs("2026-03-08", "07:00", tz)
check(sundayAfter - sundayBefore == 23L * 60 * 60 * 1000, "7:00 stays 7:00 across the spring daylight-saving change")

def civilAdd = { String date, int n, TimeZone zone ->
    def p = date.split("-")
    Calendar cal = Calendar.getInstance(zone)
    cal.set(Calendar.YEAR, p[0] as int)
    cal.set(Calendar.MONTH, (p[1] as int) - 1)
    cal.set(Calendar.DATE, p[2] as int)
    cal.set(Calendar.HOUR_OF_DAY, 12)
    cal.set(Calendar.MINUTE, 0)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    cal.add(Calendar.DATE, n)
    return String.format("%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DATE))
}
def civilDow = { String date, TimeZone zone ->
    def p = date.split("-")
    Calendar cal = Calendar.getInstance(zone)
    cal.set(Calendar.YEAR, p[0] as int)
    cal.set(Calendar.MONTH, (p[1] as int) - 1)
    cal.set(Calendar.DATE, p[2] as int)
    cal.set(Calendar.HOUR_OF_DAY, 12)
    cal.set(Calendar.MINUTE, 0)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    return cal.get(Calendar.DAY_OF_WEEK)
}
for (zone in [tz, TimeZone.getTimeZone("Pacific/Auckland"), TimeZone.getTimeZone("Pacific/Honolulu")]) {
    for (date in ["1969-12-31", "1970-01-01", "2024-02-28", "2024-02-29", "2025-02-28", "2026-03-07", "2026-03-08", "2026-03-09", "2026-11-01", "2026-12-31", "2100-02-28"]) {
        check(app.synagogueDow(date, zone) == civilDow(date, zone), "weekday of " + date + " in " + zone.getID())
        for (n in [-400, -1, 0, 1, 40, 400]) {
            def got = app.synagogueAddDays(date, n, zone)
            def want = civilAdd(date, n, zone)
            check(got == want, "add " + n + " to " + date + " in " + zone.getID() + " got " + got + " want " + want)
        }
    }
}

def flags = app.synagogueParseItems([
    [title: "Erev Pesach", date: "2026-04-01", category: "holiday"],
    [title: "Pesach I", date: "2026-04-02", category: "holiday", yomtov: true],
    [title: "Pesach VII", date: "2026-04-08", category: "holiday", yomtov: true],
    [title: "Pesach VIII", date: "2026-04-09", category: "holiday", yomtov: true],
    [title: "Hoshana Rabbah", date: "2026-10-02", category: "holiday"],
    [title: "Chol HaMoed Sukkot", date: "2026-10-03", category: "holiday"],
    [title: "Shushan Purim", date: "2026-03-04", category: "holiday"],
    [title: "Purim", date: "2026-03-03", category: "holiday"],
    [title: "Fast of Gedaliah", date: "2026-09-14", category: "holiday"],
    [title: "Rosh Chodesh Cheshvan", date: "2026-10-11", category: "holiday", subcat: "roshchodesh"]
])
check(flags["2026-04-01"]?.yomTov == null, "Erev Pesach is not Pesach")
check(flags["2026-04-02"]?.yomTov == "pesachFirst", "Pesach I is the first days")
check(flags["2026-04-08"]?.yomTov == "pesachLast", "Pesach VII is the last days")
check(flags["2026-04-09"]?.yomTov == "pesachLast", "Pesach VIII is the last days")
check(flags["2026-10-02"]?.cholHaMoed == "cholHaMoedSukkot", "Hoshana Rabbah is Chol HaMoed Sukkot")
check(flags["2026-03-04"]?.minor == null, "Shushan Purim does not use the Purim row")
check(flags["2026-03-03"]?.minor == "purim", "Purim maps to Purim")
check(flags["2026-09-14"]?.fast == "fastGedaliah", "Fast of Gedaliah maps")
check(flags["2026-10-11"]?.roshChodesh == true, "Rosh Chodesh maps")

def sat = "2026-10-03"
check(app.synagogueDow(sat, tz) == Calendar.SATURDAY, "fixture Saturday")
flags["2026-10-03"] = [cholHaMoed: "cholHaMoedSukkot"]
check(app.synagogueWinner(sat, flags, tz) == "shabbatCholHaMoed", "Shabbat Chol HaMoed wins over Shabbat and Chol HaMoed")
check(app.synagogueWinner("2026-10-02", flags, tz) == "cholHaMoedSukkot", "weekday Chol HaMoed uses that row")
flags["2026-10-10"] = [yomTov: "yomKippur", candles: 1L, havdalah: 2L]
check(app.synagogueWinner("2026-10-10", flags, tz) == "yomKippur", "Yom Kippur wins on Shabbat")
flags["2026-10-17"] = [roshChodesh: true]
check(app.synagogueDow("2026-10-17", tz) == Calendar.SATURDAY, "Rosh Chodesh fixture is Saturday")
check(app.synagogueWinner("2026-10-17", flags, tz) == "shabbatRoshChodesh", "Shabbat Rosh Chodesh has its own row")
flags["2026-12-12"] = [minor: "chanukah"]
check(app.synagogueDow("2026-12-12", tz) == Calendar.SATURDAY, "Chanukah fixture is Saturday")
check(app.synagogueWinner("2026-12-12", flags, tz) == "shabbat", "Shabbat Chanukah stays on Shabbat")
flags["2026-10-02"] = [:]

def config = app.synagogueDefaultConfig()
check(config.days.fastGedaliah.source == "unset", "a fast starts unset")
check(config.days.chanukah.source == "unset", "Chanukah starts unset")
check(config.days.purim.source == "unset", "Purim starts unset")
check(config.days.cholHaMoedSukkot.source == "unset", "Chol HaMoed starts unset")
check(config.days.roshChodesh.source == "normal", "Rosh Chodesh starts as a normal weekday")
check(config.days.yomHaShoah.source == "normal", "a modern day starts as a normal weekday")
check(config.days.shabbatCholHaMoed.source == "same", "Shabbat Chol HaMoed starts from Shabbat")

config.days.shabbat.entries = [[
    id: "shacharis", name: "Shacharis", spaceId: "sanctuary", position: "day",
    start: [type: "clock", time: "08:30"], end: [type: "duration", minutes: 150], runCues: true
], [
    id: "mincha", name: "Mincha", spaceId: "sanctuary", position: "evening",
    start: [type: "zman", zman: "sunset", offsetMin: -15], end: [type: "duration", minutes: 30],
    roundTo: 5, notBefore: "13:30", runCues: true
]]
config.days.monThu.entries = [[
    id: "wd-mincha", name: "Mincha", spaceId: "sanctuary", position: "day",
    start: [type: "zman", zman: "sunset", offsetMin: -15], end: [type: "duration", minutes: 25], roundTo: 5, runCues: true
], [
    id: "wd-early", name: "Shacharis", spaceId: "sanctuary", position: "day",
    start: [type: "clock", time: "06:45"], end: [type: "duration", minutes: 45], runCues: true
], [
    id: "wd-late", name: "Shacharis", spaceId: "sanctuary", position: "day",
    start: [type: "clock", time: "08:00"], end: [type: "duration", minutes: 45], runCues: true
]]
config.days.friday.source = "same"
config.days.friday.follows = "monThu"
config.spaces = [[
    id: "sanctuary", name: "Sanctuary", stayOnGapMin: 45,
    controls: [
        [id: "lights", name: "Lights", kind: "light", devices: [[id: "1", dimmer: true], [id: "2", dimmer: false]]],
        [id: "chazan", name: "Chazan light", kind: "light", devices: [[id: "3", dimmer: true]]],
        [id: "heat", name: "Heat", kind: "thermostat", devices: [[id: "30"], [id: "31"]],
            comfort: ["30": [mode: "heat", heat: 70], "31": [mode: "auto", heat: 68, cool: 74]],
            setback: ["30": [mode: "heat", heat: 62], "31": [mode: "off"]]],
        [id: "door", name: "Door", kind: "lock", devices: [[id: "40"]]]
    ],
    cues: [
        [id: "heat-on", anchor: "start", offsetMin: -60, controlId: "heat", action: "comfort", appliesTo: []],
        [id: "lights-on", anchor: "start", offsetMin: -2, controlId: "lights", action: "level", level: 40, appliesTo: []],
        [id: "chazan-on", anchor: "start", offsetMin: 0, controlId: "chazan", action: "on", appliesTo: ["shacharis"]],
        [id: "lights-off", anchor: "end", offsetMin: 0, controlId: "lights", action: "off", appliesTo: []],
        [id: "heat-off", anchor: "end", offsetMin: 0, controlId: "heat", action: "setback", appliesTo: []],
        [id: "unlock", anchor: "start", offsetMin: 0, controlId: "door", action: "unlock", appliesTo: []]
    ]
]]

long nowMs = app.synagogueZonedMs("2026-10-02", "08:00", tz)
def zmanim = [:]
for (int i = 0; i < 8; i++) {
    def date = app.synagogueAddDays("2026-10-02", i, tz)
    long set = app.synagogueZonedMs(date, "18:03", tz)
    long rise = app.synagogueZonedMs(date, "06:30", tz)
    zmanim[date] = [sunset: set, sunrise: rise, tzeit50min: set + 50L * 60000L]
}
def ctx = [tz: tz, now: nowMs, zmanim: zmanim, flags: flags, horizon: 16]
def built = app.synagogueExpand(config, ctx)
def fridayMincha = built.occurrences.find { it.date == "2026-10-02" && it.name == "Mincha" && it.position == "evening" }
check(fridayMincha != null, "Friday night Mincha comes from Shabbat")
check(fridayMincha.replaced?.contains("Replaces regular"), "evening Mincha replaces the weekday Mincha")
check(fridayMincha.start == app.synagogueZonedMs("2026-10-02", "17:50", tz), "sunset 18:03 minus 15 rounds to 17:50")
def weekdayLeft = built.occurrences.findAll { it.date == "2026-10-02" && it.name == "Mincha" && it.position == "day" }
check(weekdayLeft.isEmpty(), "the replaced weekday Mincha does not also run")
def both = built.occurrences.findAll { it.date == "2026-10-05" && it.name == "Shacharis" }
check(both.size() == 2, "two daytime Shacharis services both run")

def shabbatShacharis = built.occurrences.find { it.date == "2026-10-03" && it.entryId == "shacharis" }
check(shabbatShacharis.dayId == "shabbatCholHaMoed", "Saturday of Chol HaMoed uses that Shabbat row")
def chazan = shabbatShacharis.cues.find { it.id == "chazan-on" }
def lights = shabbatShacharis.cues.find { it.id == "lights-on" }
def heat = shabbatShacharis.cues.find { it.id == "heat-on" }
check(chazan != null && chazan.at == shabbatShacharis.start, "chazan light is at the start")
check(lights.at == shabbatShacharis.start - 2L * 60000L, "lights are 2 minutes before")
check(heat.at == shabbatShacharis.start - 60L * 60000L, "heat is 60 minutes before")
def lightStates = lights.states
check(lightStates.find { it.id == "1" }?.level == 40, "a dimmer takes the level")
check(lightStates.find { it.id == "2" }?.level == null && lightStates.find { it.id == "2" }?.on == true, "a switch in that group only turns on")
check(heat.states.size() == 2, "Comfort stores each thermostat")
check(heat.states.find { it.id == "30" }?.heat == 70 && heat.states.find { it.id == "30" }?.cool == null, "a heat-only thermostat keeps its own setpoint")
check(heat.states.find { it.id == "31" }?.cool == 74, "a heat-and-cool thermostat keeps both setpoints")
def minchaCues = fridayMincha.cues.collect { it.id }
check(!minchaCues.contains("chazan-on"), "applies-to leaves the chazan light off Mincha")

def maariv = [
    id: "maariv", name: "Maariv", spaceId: "sanctuary", position: "evening",
    start: [type: "clock", time: "18:20"], end: [type: "duration", minutes: 20], runCues: true
]
config.days.shabbat.entries = config.days.shabbat.entries + [maariv]
built = app.synagogueExpand(config, ctx)
fridayMincha = built.occurrences.find { it.date == "2026-10-02" && it.entryId == "mincha" }
def fridayMaariv = built.occurrences.find { it.date == "2026-10-02" && it.entryId == "maariv" }
check(fridayMincha.stayOn == true, "back-to-back events keep the room on")
check(fridayMincha.cues.find { it.id == "lights-off" }?.suppressed == true, "the off cue is held for the next service")
config.skipped = [fridayMaariv.id]
built = app.synagogueExpand(config, ctx)
fridayMincha = built.occurrences.find { it.date == "2026-10-02" && it.entryId == "mincha" }
check(fridayMincha.cues.find { it.id == "lights-off" }?.suppressed != true, "a skipped following service lets the room turn off")
config.skipped = []

config.days.yomKippur.source = "same"
config.days.yomKippur.follows = "shabbat"
config.days.shabbat.entries.find { it.id == "shacharis" }.start.time = "09:00"
built = app.synagogueExpand(config, ctx)
def yk = built.occurrences.find { it.date == "2026-10-10" && it.entryId == "shacharis" }
check(yk != null && yk.start == app.synagogueZonedMs("2026-10-10", "09:00", tz), "editing Shabbat changes a day that uses it")
config.days.yomKippur.source = "changes"
config.days.yomKippur.changes = [disabled: [], patched: [shacharis: [start: [type: "clock", time: "08:00"]]], added: [[
    id: "kol-nidre", name: "Kol Nidre", spaceId: "sanctuary", position: "evening",
    start: [type: "clock", time: "18:15"], end: [type: "duration", minutes: 90], runCues: true
]]]
config.days.shabbat.entries.find { it.id == "shacharis" }.start.time = "09:15"
built = app.synagogueExpand(config, ctx)
yk = built.occurrences.find { it.date == "2026-10-10" && it.entryId == "shacharis" }
check(yk.start == app.synagogueZonedMs("2026-10-10", "08:00", tz), "a change survives a later edit to Shabbat")
check(built.occurrences.any { it.entryId == "kol-nidre" && it.date == "2026-10-09" }, "Kol Nidre lands the evening before")
config.days.shabbat.entries = config.days.shabbat.entries.findAll { it.id != "shacharis" }
built = app.synagogueExpand(config, ctx)
check(!built.occurrences.any { it.date == "2026-10-10" && it.entryId == "shacharis" }, "a deleted Shabbat service drops the change that pointed at it")

config.days.shemini.source = "copy"
config.days.shemini.follows = "shabbat"
config.days.shemini.entries = [[
    id: "shacharis", name: "Shacharis", spaceId: "sanctuary", position: "day",
    start: [type: "clock", time: "08:00"], end: [type: "duration", minutes: 120], runCues: true
]]
config.days.shabbat.entries << [
    id: "shacharis", name: "Shacharis", spaceId: "sanctuary", position: "day",
    start: [type: "clock", time: "10:00"], end: [type: "duration", minutes: 120], runCues: true
]
def copyResolved = app.synagogueResolveEntries("shemini", "2026-10-04", config, tz, [] as Set)
check(copyResolved.entries[0].start.time == "08:00", "a copy does not follow later Shabbat edits")

config.days.pesachLast.source = "same"
config.days.pesachLast.follows = "pesachFirst"
config.days.pesachFirst.source = "same"
config.days.pesachFirst.follows = "pesachLast"
def cycled = app.synagogueApply(config, [op: "day", dayId: "pesachLast", day: config.days.pesachLast])
check(cycled.ok == false, "a cycle is rejected")
config.days.pesachFirst.source = "unset"
config.days.pesachLast.source = "unset"

config.dateOverrides["2026-10-17"] = [[
    id: "bm-night", name: "Kabbalat Shabbat", spaceId: "sanctuary", position: "evening",
    start: [type: "clock", time: "18:10"], end: [type: "duration", minutes: 80], runCues: true
], [
    id: "bm-day", name: "Shacharis", spaceId: "sanctuary", position: "day",
    start: [type: "clock", time: "09:00"], end: [type: "duration", minutes: 180], runCues: true
]]
config.days.friday.entries = [[
    id: "fri-shacharis", name: "Shacharis", spaceId: "sanctuary", position: "day",
    start: [type: "clock", time: "07:00"], end: [type: "duration", minutes: 50], runCues: true
]]
config.days.friday.source = "own"
built = app.synagogueExpand(config, [tz: tz, now: app.synagogueZonedMs("2026-10-16", "06:00", tz), zmanim: zmanim, flags: flags, horizon: 4])
check(built.occurrences.any { it.date == "2026-10-16" && it.entryId == "fri-shacharis" }, "Friday Shacharis stays on a Shabbat override")
check(built.occurrences.any { it.date == "2026-10-16" && it.entryId == "bm-night" }, "the Shabbat override includes Friday night")
check(built.occurrences.any { it.date == "2026-10-17" && it.entryId == "bm-day" }, "the Shabbat override includes Saturday morning")
check(!built.occurrences.any { it.date == "2026-10-17" && it.entryId == "shacharis" && it.start == app.synagogueZonedMs("2026-10-17", "10:00", tz) }, "the regular Shabbat morning does not also run")

def emptyHeat = app.synagogueCopy(config.spaces[0])
emptyHeat.controls.find { it.id == "heat" }.comfort = [:]
def held = app.synagogueCueStates(emptyHeat.controls.find { it.id == "heat" }, [action: "comfort"])
check(held.held == true, "Comfort with no temperature does not run")
def offPreset = app.synagogueCueStates([kind: "thermostat", devices: [[id: "30"]], setback: ["30": [mode: "off"]]], [action: "setback"])
check(offPreset.held != true && offPreset.states[0].mode == "off", "Off counts as a filled preset")

long ykAfternoon = app.synagogueZonedMs("2026-10-10", "15:00", tz)
flags["2026-10-09"] = [candles: app.synagogueZonedMs("2026-10-09", "18:00", tz)]
flags["2026-10-10"] = [yomTov: "yomKippur", havdalah: app.synagogueZonedMs("2026-10-10", "19:00", tz)]
check(app.synagogueQuietAt(ykAfternoon, [tz: tz, flags: flags, zmanim: zmanim], config), "Yom Kippur afternoon is quiet")
check(!app.synagogueQuietAt(app.synagogueZonedMs("2026-10-08", "12:00", tz), [tz: tz, flags: flags, zmanim: zmanim], config), "a weekday before the candles is not quiet")

def menuCtx = [tz: tz, now: app.synagogueZonedMs("2026-09-01", "08:00", tz), flags: flags, zmanim: [:]]
def menu = app.synagogueMenu(config, menuCtx)
def nudge = app.synagogueNudges(menu, menuCtx.now, tz)
check(nudge.any { it.id == "fastGedaliah" }, "an upcoming unset fast is listed")

def zero = app.synagogueCueLabel([name: "Chazan light"], [action: "on", offsetMin: 0])
check(app.synagogueInt(0, 5) == 0, "a stored 0 is a real offset")
check(zero.contains("on"), "offset 0 still labels the cue")

def hebcalTitles = [
    [title: "Pesach III (CH\u2019\u2019M)", date: "2026-04-04", category: "holiday"],
    [title: "Sukkot VII (Hoshana Raba)", date: "2026-10-02", category: "holiday"],
    [title: "Shmini Atzeret", date: "2026-10-03", category: "holiday"],
    [title: "Pesach Sheni", date: "2026-05-01", category: "holiday"],
    [title: "Yom Kippur Katan", date: "2026-10-11", category: "holiday"],
    [title: "Rosh Chodesh Tevet", date: "2026-12-10", category: "roshchodesh"],
    [title: "Asara B\u2019Tevet", date: "2026-12-20", category: "holiday"],
    [title: "Parashat Noach", date: "2026-10-17", category: "parashat"],
    [title: "Ta\u2019anit Esther", date: "2026-03-02", category: "holiday"]
]
def parsedTitles = app.synagogueParseItems(hebcalTitles)
check(parsedTitles["2026-04-04"]?.cholHaMoed == "cholHaMoedPesach", "Pesach III (CH''M) is Chol HaMoed, not Yom Tov")
check(parsedTitles["2026-10-02"]?.cholHaMoed == "cholHaMoedSukkot", "Hoshana Raba is Chol HaMoed Sukkot")
check(parsedTitles["2026-10-02"]?.yomTov == null, "Hoshana Raba is not Sukkot Yom Tov")
check(parsedTitles["2026-10-03"]?.yomTov == "shemini", "Shmini Atzeret uses the Shemini Atzeret row")
check(parsedTitles["2026-05-01"] == null, "Pesach Sheni is not Pesach")
check(parsedTitles["2026-10-11"] == null, "Yom Kippur Katan is not Yom Kippur")
check(parsedTitles["2026-12-10"]?.roshChodesh == true && parsedTitles["2026-12-10"]?.fast == null, "Rosh Chodesh Tevet is not the Tenth of Tevet")
check(parsedTitles["2026-12-20"]?.fast == "tenthTevet", "Asara B'Tevet is the Tenth of Tevet")
check(parsedTitles["2026-10-17"] == null, "a Torah portion does not create a day flag")
check(parsedTitles["2026-03-02"]?.fast == "fastEsther", "Ta'anit Esther maps to the Fast of Esther")
check(app.synagogueParseIso("2026-10-14T18:17:00-04:00") != null, "HebCal timestamps parse")

def lateActions = [
    [id: "o|c|start", at: 1000L, occId: "o", occEnd: 5000L, anchor: "start", unlock: false, suppressed: false],
    [id: "o|off|end", at: 5000L, occId: "o", occEnd: 5000L, anchor: "end", unlock: false, suppressed: false],
    [id: "o|heat|end", at: 5000L, occId: "o", occEnd: 5000L, anchor: "end", unlock: false, suppressed: false]
]
check(app.synagogueDue(lateActions, 5000L + 31L * 60000L, [:]).isEmpty(), "end cues after 30 minutes do not run if the service never started")
def startedLate = app.synagogueDue(lateActions, 5000L + 31L * 60000L, ["o|c|start": 1000L])
check(startedLate.size() == 2 && startedLate.every { it.anchor == "end" }, "both end cues run once if the service started")

def cross = app.synagogueDefaultConfig()
cross.days.friday.source = "own"
cross.days.friday.entries = [[
    id: "late", name: "Maariv", spaceId: "s", position: "day",
    start: [type: "clock", time: "23:30"], end: [type: "duration", minutes: 70], runCues: true
]]
cross.spaces = [[id: "s", name: "S", stayOnGapMin: 45, controls: [], cues: []]]
def crossNow = app.synagogueZonedMs("2026-10-03", "00:20", tz)
def crossBuilt = app.synagogueExpand(cross, [tz: tz, now: crossNow, zmanim: [:], flags: [:], horizon: 2])
check(crossBuilt.occurrences.any { it.date == "2026-10-02" && it.entryId == "late" }, "a service that runs past midnight stays on the schedule")
def crossAgenda = app.synagogueAgendaWindow(crossBuilt.occurrences, "2026-10-03", 7, tz, crossNow)
check(crossAgenda.any { it.entryId == "late" }, "the agenda keeps a service that is still running after midnight")

def webcal = app.synagogueNormalizeCalendarUrl("webcal://calendar.google.com/basic.ics")
check(webcal.ok == true && webcal.url == "https://calendar.google.com/basic.ics", "webcal becomes https")
def plainHttp = app.synagogueNormalizeCalendarUrl("http://calendar.google.com/basic.ics")
check(plainHttp.ok != true, "plain http is refused")
def pub = app.synagoguePublicCalendars([calendars: [[id: "c", name: "Shul", url: "https://calendar.google.com/secret-token-abc123"]]])
check(pub[0].mask.endsWith("abc123") && pub[0].url == null, "a calendar link is masked to the last 6 characters")

def ics = """BEGIN:VCALENDAR
BEGIN:VEVENT
UID:board
SUMMARY:Board
  meeting
DTSTART;TZID=America/New_York:20261016T190000
DTEND;TZID=America/New_York:20261016T203000
RRULE:FREQ=WEEKLY;BYDAY=FR
EXDATE;TZID=America/New_York:20261023T190000
END:VEVENT
BEGIN:VEVENT
UID:board
RECURRENCE-ID;TZID=America/New_York:20261030T190000
DTSTART;TZID=America/New_York:20261030T200000
DTEND;TZID=America/New_York:20261030T210000
SUMMARY:Board meeting late
END:VEVENT
BEGIN:VEVENT
UID:allday
SUMMARY:Closed
DTSTART;VALUE=DATE:20261020
END:VEVENT
BEGIN:VEVENT
UID:hourly
SUMMARY:Chime
DTSTART;TZID=America/New_York:20261016T120000
DTEND;TZID=America/New_York:20261016T130000
RRULE:FREQ=HOURLY;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:utc
SUMMARY:UTC class
DTSTART:20261016T230000Z
DTEND:20261017T000000Z
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR"""
long feedNow = app.synagogueZonedMs("2026-10-14", "08:00", tz)
def parsed = app.synagogueParseIcal(ics, tz, feedNow)
check(parsed.events.any { it.title == "Board meeting" && it.start == app.synagogueZonedMs("2026-10-16", "19:00", tz) }, "a folded weekly event keeps Friday")
check(!parsed.events.any { it.start == app.synagogueZonedMs("2026-10-23", "19:00", tz) && it.uid == "board" }, "EXDATE removes that Friday")
check(parsed.events.any { it.title == "Board meeting late" && it.start == app.synagogueZonedMs("2026-10-30", "20:00", tz) }, "an override replaces one instance")
check(!parsed.events.any { it.uid == "board" && it.start == app.synagogueZonedMs("2026-10-30", "19:00", tz) }, "the overridden instance does not also run")
check(!parsed.events.any { it.title == "Closed" }, "all-day events are ignored")
check(parsed.unsupported.any { it.title == "Chime" }, "an hourly repeat is named and not expanded")
def utc = parsed.events.find { it.title == "UTC class" }
check(utc?.cancelled == true && utc.start == app.synagogueZonedMs("2026-10-16", "19:00", tz), "a UTC event is read in hub time and a cancelled event stays cancelled")

def feedConfig = app.synagogueDefaultConfig()
feedConfig.spaces = [[
    id: "sanctuary", name: "Sanctuary", stayOnGapMin: 45,
    controls: [[id: "lights", name: "Lights", kind: "light", devices: [[id: "1", name: "Sanctuary lights"]]]],
    cues: [
        [id: "on", anchor: "start", offsetMin: -2, controlId: "lights", action: "on", appliesTo: []],
        [id: "off", anchor: "end", offsetMin: 0, controlId: "lights", action: "off", appliesTo: []]
    ]
]]
feedConfig.days.monThu.entries = [[
    id: "mincha", name: "Mincha", spaceId: "sanctuary", position: "day",
    start: [type: "clock", time: "18:00"], end: [type: "duration", minutes: 30], runCues: true
]]
feedConfig.bookings = [[id: "rent", name: "Rental", spaceId: "sanctuary", date: "2026-10-14", start: "18:40", minutes: 60, runCues: true]]
feedConfig.titleRules = [[id: "r1", contains: "Board", spaceId: "sanctuary"]]
def feedBuilt = app.synagogueExpand(feedConfig, [tz: tz, now: feedNow, zmanim: [:], flags: [:], horizon: 21, events: parsed.events, unsupported: parsed.unsupported])
def feedMincha = feedBuilt.occurrences.find { it.entryId == "mincha" && it.date == "2026-10-14" }
check(feedMincha?.stayOn == true, "a booking inside the gap keeps the room on")
check(feedMincha?.cues?.find { it.id == "off" }?.suppressed == true, "the off cue waits for the booking")
check(feedBuilt.occurrences.any { it.id == "booking|rent" && it.cues.any { cue -> cue.id == "on" } }, "a booking uses the space cues")
check(feedBuilt.occurrences.any { it.name == "Board meeting" && it.spaceId == "sanctuary" && it.date == "2026-10-16" }, "a title rule puts the event in that space")
check(feedBuilt.warnings.any { it.toString().contains("Chime") }, "an unsupported repeat is named in the warnings")

def datedEx = """BEGIN:VCALENDAR
BEGIN:VEVENT
UID:dated
SUMMARY:Board meeting
DTSTART;TZID=America/New_York:20261016T190000
DTEND;TZID=America/New_York:20261016T200000
RRULE:FREQ=WEEKLY; BYDAY=FR
EXDATE;VALUE=DATE:20261023
END:VEVENT
END:VCALENDAR"""
def dated = app.synagogueParseIcal(datedEx, tz, feedNow)
check(dated.events.any { it.start == app.synagogueZonedMs("2026-10-16", "19:00", tz) }, "a spaced repeat rule still expands")
check(!dated.events.any { it.start == app.synagogueZonedMs("2026-10-23", "19:00", tz) }, "a date-only exclusion removes that day")

def oldStart = "20250822T190000"
def counted = """BEGIN:VCALENDAR
BEGIN:VEVENT
UID:counted
SUMMARY:Old board
DTSTART;TZID=America/New_York:${oldStart}
DTEND;TZID=America/New_York:20250822T200000
RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=61
END:VEVENT
END:VCALENDAR"""
def countedEvents = app.synagogueParseIcal(counted, tz, feedNow)
check(countedEvents.events.any { it.start == app.synagogueZonedMs("2026-10-16", "19:00", tz) }, "a long finite weekly repeat still reaches this week")
check(!countedEvents.events.any { it.start == app.synagogueZonedMs("2026-10-23", "19:00", tz) }, "the repeat stops when its count is used up")

def monthly = """BEGIN:VCALENDAR
BEGIN:VEVENT
UID:first-monday
SUMMARY:First Monday
DTSTART;TZID=America/New_York:20260302T190000
DTEND;TZID=America/New_York:20260302T200000
RRULE:FREQ=MONTHLY;BYDAY=1MO
END:VEVENT
END:VCALENDAR"""
def monthlyEvents = app.synagogueParseIcal(monthly, tz, app.synagogueZonedMs("2026-03-01", "08:00", tz))
check(monthlyEvents.events.any { it.start == app.synagogueZonedMs("2026-03-02", "19:00", tz) }, "the first Monday in March is kept")
check(monthlyEvents.events.any { it.start == app.synagogueZonedMs("2026-04-06", "19:00", tz) }, "the first Monday in April is the next one")

def calConfig = app.synagogueDefaultConfig()
calConfig.settings.candleMin = 20
calConfig.spaces = [[id: "sanctuary", name: "Sanctuary", stayOnGapMin: 45, controls: [], cues: []]]
calConfig.days.monThu.entries = [[
    id: "cal-mincha", name: "Mincha", spaceId: "sanctuary", position: "day",
    start: [type: "calendar", contains: "Mincha", ifMissing: "skip", fallback: [type: "zman", zman: "sunset", offsetMin: -15]],
    end: [type: "duration", minutes: 25], roundTo: 5, runCues: true
]]
calConfig.days.friday.source = "own"
calConfig.days.friday.entries = [[
    id: "fri-mincha", name: "Mincha", spaceId: "sanctuary", position: "day",
    start: [type: "zman", zman: "candleLighting", offsetMin: 0],
    end: [type: "duration", minutes: 30], roundTo: 0, runCues: true
]]
calConfig.days.shabbat.entries = []
def kept = app.synagogueNormalizeEntry([name: "Mincha", start: [type: "calendar", contains: " Mincha ", ifMissing: "fallback", fallback: [type: "zman", zman: "sunset", offsetMin: -10]]])
check(kept.start.contains == "Mincha", "calendar match text is trimmed")
check(kept.start.ifMissing == "fallback", "a calendar service can keep its usual time")
long calNow = app.synagogueZonedMs("2026-10-02", "08:00", tz)
def calZ = [:]
for (int i = 0; i < 8; i++) {
    def date = app.synagogueAddDays("2026-10-02", i, tz)
    calZ[date] = [sunset: app.synagogueZonedMs(date, "18:03", tz), sunrise: app.synagogueZonedMs(date, "06:30", tz)]
}
long early = app.synagogueZonedMs("2026-10-05", "12:00", tz)
long published = app.synagogueZonedMs("2026-10-05", "17:41", tz)
long board = app.synagogueZonedMs("2026-10-05", "19:00", tz)
def calEvents = [
    [calendarId: "cal", uid: "early", title: "Early Mincha", start: early, end: early + 3600000L, cancelled: false],
    [calendarId: "cal", uid: "mincha", title: "Weekday Mincha", start: published, end: published + 1800000L, cancelled: false],
    [calendarId: "cal", uid: "board", title: "Board meeting", start: board, end: board + 3600000L, cancelled: false]
]
def calBuilt = app.synagogueExpand(calConfig, [tz: tz, now: calNow, zmanim: calZ, flags: [:], horizon: 8, events: calEvents])
def mondayMincha = calBuilt.occurrences.find { it.date == "2026-10-05" && it.entryId == "cal-mincha" }
check(mondayMincha?.start == published, "a calendar Mincha uses the published time")
check(!calBuilt.occurrences.any { it.id == "ical|cal|mincha|" + published }, "the matched Mincha is not scheduled twice")
check(calBuilt.occurrences.any { it.id == "ical|cal|early|" + early }, "a different Mincha event still appears")
check(calBuilt.occurrences.any { it.kind == "calendar" && it.name == "Board meeting" }, "another calendar event still runs")
check(!calBuilt.occurrences.any { it.date == "2026-10-07" && it.entryId == "cal-mincha" }, "a day with no calendar Mincha is skipped")
check(calBuilt.warnings.any { it.toString().contains("2026-10-07") && it.toString().contains("Skipped") }, "a skipped calendar day is named")
long candle = app.synagogueZonedMs("2026-10-02", "18:03", tz) - 20L * 60000L
def fridayCandle = calBuilt.occurrences.find { it.date == "2026-10-02" && it.entryId == "fri-mincha" }
check(fridayCandle?.start == candle, "Friday night at candle lighting follows the candle-lighting minutes")
calConfig.days.monThu.entries[0].start.ifMissing = "fallback"
def fallbackBuilt = app.synagogueExpand(calConfig, [tz: tz, now: calNow, zmanim: calZ, flags: [:], horizon: 8, events: calEvents])
long usual = app.synagogueRound5(app.synagogueZonedMs("2026-10-07", "18:03", tz) - 15L * 60000L, tz)
def wednesday = fallbackBuilt.occurrences.find { it.date == "2026-10-07" && it.entryId == "cal-mincha" }
check(wednesday?.start == usual, "a missing calendar Mincha can use the usual time")

def guard = app.synagogueDefaultConfig()
guard.spaces = [[id: "s", name: "Sanctuary", stayOnGapMin: 45, controls: [], cues: [[id: "c", appliesTo: ["Mincha"], controlId: "lights", anchor: "start", offsetMin: 0, action: "on"]]]]
guard.days.monThu.source = "own"
guard.days.monThu.entries = [[id: "m", name: "Mincha", spaceId: "s", position: "day", start: [type: "clock", time: "18:00"], end: [type: "duration", minutes: 30]]]
def blocked = app.synagogueApply(guard, [op: "deleteSpace", id: "s"])
check(blocked.ok == false && blocked.error?.toString()?.contains("Sanctuary"), "a space in use cannot be removed")
def renamed = app.synagogueApply(guard, [op: "day", dayId: "monThu", day: [source: "own", entries: [[id: "m", name: "Afternoon Mincha", spaceId: "s", position: "day", start: [type: "clock", time: "18:00"], end: [type: "duration", minutes: 30]]]]])
check(renamed.ok == true && renamed.config.spaces[0].cues[0].appliesTo[0] == "Afternoon Mincha", "renaming a service keeps its cues")
def freed = app.synagogueApply(renamed.config, [op: "day", dayId: "monThu", day: [source: "own", entries: []]])
def removed = app.synagogueApply(freed.config, [op: "deleteSpace", id: "s"])
check(removed.ok == true && removed.config.spaces.isEmpty(), "an unused space can be removed")

def whyCfg = app.synagogueDefaultConfig()
whyCfg.spaces = [[id: "s", name: "Sanctuary", stayOnGapMin: 45, controls: [], cues: []]]
whyCfg.days.monThu.source = "own"
whyCfg.days.monThu.entries = [
    [id: "early", name: "Shacharis", spaceId: "s", position: "day", start: [type: "clock", time: "18:00"], end: [type: "duration", minutes: 90]],
    [id: "late", name: "Mincha", spaceId: "s", position: "day", start: [type: "zman", zman: "sunset", offsetMin: -15], end: [type: "duration", minutes: 30], roundTo: 5]
]
def whyBuilt = app.synagogueExpand(whyCfg, [tz: tz, now: calNow, zmanim: calZ, flags: [:], horizon: 8])
def whyMincha = whyBuilt.occurrences.find { it.entryId == "late" && it.date == "2026-10-05" }
check(whyMincha?.why?.kind == "zman" && whyMincha.why.offsetMin == -15 && whyMincha.why.base == app.synagogueZonedMs("2026-10-05", "18:03", tz), "a service says which sunset it used")
def overlapped = whyBuilt.occurrences.findAll { it.date == "2026-10-05" && it.overlap == true }
check(overlapped.size() == 2, "two services in the same room at once are marked")

app.synagogueEnsureState()
app.synagogueRemember("Mincha: Lights", "ran", "monThu|2026-10-05|late|day", "ran")
check(app.synagogueResultFor("monThu|2026-10-05|late|day", app.state.runtime.history) == "ran", "a ran service keeps that result")

def grouped = app.synagogueCheckCalendar([calendar: [id: "cal"]], [cal: ics])
check(grouped.ok == true && grouped.count >= 1 && grouped.groups.any { it.title == "Board meeting" && it.count >= 1 && it.next?.size() >= 1 }, "checking a calendar groups titles and the next times")
def webpage = app.synagogueCheckCalendar([calendar: [id: "bad", url: "https://calendar.google.com/calendar/u/0/r"]], [bad: "<html>calendar</html>"])
check(webpage.ok == false && webpage.error?.toString()?.contains("secret iCal link"), "a web page link is refused in plain words")

def bookCfg = app.synagogueDefaultConfig()
bookCfg.spaces = [[id: "hall", name: "Hall", stayOnGapMin: 45, controls: [], cues: []]]
bookCfg.calendars = [[id: "rentals", name: "Rentals", url: "https://calendar.google.com/secret-token-abc123", bookAll: true, spaceId: "hall"]]
def bookEvents = [[calendarId: "rentals", uid: "cohen", title: "Rental - Cohen", location: "Social hall", start: app.synagogueZonedMs("2026-10-18", "18:00", tz), end: app.synagogueZonedMs("2026-10-18", "20:00", tz), cancelled: false]]
def booked = app.synagogueExpand(bookCfg, [tz: tz, now: calNow, zmanim: [:], flags: [:], horizon: 21, events: bookEvents])
check(booked.occurrences.any { it.name == "Rental - Cohen" && it.spaceId == "hall" }, "a booking calendar uses its space for every event")

def locCfg = app.synagogueDefaultConfig()
locCfg.spaces = bookCfg.spaces
locCfg.titleRules = [[id: "loc", contains: "social hall", field: "location", spaceId: "hall", name: "Rental"]]
locCfg.calendars = [[id: "rentals", name: "Rentals", url: "https://calendar.google.com/secret-token-abc123"]]
def located = app.synagogueExpand(locCfg, [tz: tz, now: calNow, zmanim: [:], flags: [:], horizon: 21, events: bookEvents])
check(located.occurrences.any { it.name == "Rental" && it.spaceId == "hall" }, "a rule can match the event location and rename it")
locCfg.titleRules = [[id: "skip", contains: "cohen", field: "title", ignore: true]]
def ignored = app.synagogueExpand(locCfg, [tz: tz, now: calNow, zmanim: [:], flags: [:], horizon: 21, events: bookEvents])
check(!ignored.occurrences.any { it.name?.toString()?.contains("Cohen") }, "an ignored title is not scheduled")

app.synagogueStoreFar("2027-04-01", [sunset: 5L, sunrise: 1L])
check(app.state.hebcal.zmanim["2027-04-01"].sunset == 5L, "a far date's times are kept")
check(app.state.hebcal.extra.size() == 1, "only the recent far dates are kept")

def israel = app.synagogueParseItems([[title: "Shavuot I", date: "2026-05-22", category: "holiday"]])
check(israel["2026-05-22"]?.yomTov == "shavuot" && israel["2026-05-23"] == null, "an Israel one-day holiday does not invent a second day")

def second = app.synagogueDefaultConfig()
second.spaces = [[id: "s", name: "Sanctuary", stayOnGapMin: 45, controls: [], cues: []]]
second.days.yomKippur.source = "own"
second.days.yomKippur.entries = [[id: "yk-night", name: "Kol Nidre", spaceId: "s", position: "evening", start: [type: "zman", zman: "candleLighting", offsetMin: 0], end: [type: "duration", minutes: 40], roundTo: 0]]
def secondFlags = [
    "2026-10-02": [candles: app.synagogueZonedMs("2026-10-02", "18:00", tz)],
    "2026-10-03": [candles: app.synagogueZonedMs("2026-10-03", "19:10", tz)],
    "2026-10-04": [yomTov: "yomKippur"]
]
def secondBuilt = app.synagogueExpand(second, [tz: tz, now: calNow, zmanim: calZ, flags: secondFlags, horizon: 8])
def secondNight = secondBuilt.occurrences.find { it.entryId == "yk-night" }
check(secondNight?.date == "2026-10-03" && secondNight.start == app.synagogueZonedMs("2026-10-03", "19:10", tz), "the second night uses that evening's candle lighting")

def menuToday = app.synagogueDateOf(app.synagogueZonedMs("2026-09-01", "08:00", tz), tz)
def scannedNext = [:]
for (row in app.synagogueDayCatalog()) {
    def next = ""
    for (int i = 0; i < 400; i++) {
        def date = app.synagogueAddDays(menuToday, i, tz)
        if (app.synagogueWinner(date, flags, tz) == row.id) { next = date; break }
    }
    scannedNext[row.id] = next
}
def walkedMenu = app.synagogueMenu(app.synagogueDefaultConfig(), [tz: tz.getID(), now: app.synagogueZonedMs("2026-09-01", "08:00", tz), flags: flags])
check(walkedMenu.every { it.next == scannedNext[it.id] }, "the holiday menu matches a day-by-day scan")
def nudgeToday = "2026-10-01"
def soon = app.synagogueNudges([[id: "fastGedaliah", source: "unset", next: app.synagogueAddDays(nudgeToday, 10, tz), label: "Fast of Gedaliah"]], app.synagogueZonedMs(nudgeToday, "12:00", tz), tz)
check(soon.size() == 1 && soon[0].inDays == 10, "a nudge counts the days until the holiday")
def later = app.synagogueNudges([[id: "purim", source: "unset", next: app.synagogueAddDays(nudgeToday, 31, tz), label: "Purim"]], app.synagogueZonedMs(nudgeToday, "12:00", tz), tz)
check(later.isEmpty(), "a holiday more than 30 days out is not a nudge")

app.synagogueClearBuilt()
def cachedConfig = app.synagogueDefaultConfig()
cachedConfig.spaces = [[id: "s", name: "Sanctuary", stayOnGapMin: 45, controls: [], cues: []]]
cachedConfig.days.shabbat.source = "own"
cachedConfig.days.shabbat.entries = [[id: "sh", name: "Shacharis", spaceId: "s", position: "day", start: [type: "clock", time: "09:00"], end: [type: "duration", minutes: 60]]]
app.state.config = cachedConfig
app.state.runtime = [revision: 3, hidden: false, fired: [:], history: []]
def cacheNow = app.synagogueZonedMs("2026-10-16", "08:00", tz)
def cacheZ = [:]
def cacheToday = app.synagogueDateOf(cacheNow, tz)
for (int i = 0; i < 21; i++) {
    def date = app.synagogueAddDays(cacheToday, i, tz)
    cacheZ[date] = [sunrise: app.synagogueZonedMs(date, "06:30", tz), sunset: app.synagogueZonedMs(date, "18:03", tz)]
}
app.state.hebcal = [zmanim: cacheZ, flags: [:], fetchedAt: 10, error: "", query: "", extra: [:]]
app.state.ical = [events: [], unsupported: [], fetchedAt: 10, error: ""]
def cacheCtx = [tz: tz.getID(), now: cacheNow, zmanim: cacheZ, flags: [:], sun: [:], horizon: 4]
def firstBuilt = app.synagogueBuilt(cacheCtx)
def secondBuiltCache = app.synagogueBuilt(cacheCtx)
check(firstBuilt.is(secondBuiltCache), "a repeat schedule build is reused")
check(firstBuilt.occurrences.any { it.entryId == "sh" }, "the cached build still has the service")
def projectedCache = app.synagogueProject(cachedConfig, cacheCtx, firstBuilt)
def shown = projectedCache.occurrences.find { it.entryId == "sh" }
shown.warning = "touched"
check(app.synagogueBuilt(cacheCtx).occurrences.find { it.entryId == "sh" }.warning == "", "a status projection does not change the cached schedule")
app.state.runtime.revision = 4
def thirdBuilt = app.synagogueBuilt(cacheCtx)
check(!firstBuilt.is(thirdBuilt), "a new revision builds the schedule again")
app.synagogueClearBuilt()
def bareCtx = [tz: tz.getID(), now: cacheNow, zmanim: [:], flags: [:], sun: [:], horizon: 4]
app.sunMissing = true
def bareOne = app.synagogueBuilt(bareCtx)
def bareTwo = app.synagogueBuilt(bareCtx)
app.sunMissing = false
check(!bareOne.is(bareTwo), "a schedule with no sunrise or sunset is calculated again")
def oddFlags = [:]
for (int i = 0; i < 40; i++) oddFlags[app.synagogueAddDays("2026-09-01", i, tz)] = [yomTov: "notARealDay" + i]
def kippur = app.synagogueAddDays("2026-09-01", 60, tz)
oddFlags[kippur] = [yomTov: "yomKippur"]
def oddMenu = app.synagogueMenu(app.synagogueDefaultConfig(), [tz: tz.getID(), now: app.synagogueZonedMs("2026-09-01", "08:00", tz), flags: oddFlags])
check(oddMenu.find { it.id == "shabbat" }?.next == "2026-10-17", "unknown day ids do not hide the next Shabbat")
check(oddMenu.find { it.id == "yomKippur" }?.next == kippur, "unknown day ids do not hide a later holiday")

// A timer reads sunrise and sunset from this app. A call into the dashboard app waits
// for whatever that app is doing, and the dashboard app can be waiting on this one.
def sunCtx = [tz: tz.getID(), now: app.synagogueZonedMs("2026-10-16", "08:00", tz), zmanim: [:]]
app.synagogueFillSun(sunCtx)
check(sunCtx.sun.size() == 21, "a fire fills sun times for three weeks")
check(sunCtx.sun["2026-10-16"]?.sunrise == app.synagogueZonedMs("2026-10-16", "06:00", tz), "the app's own sunrise is used")
check(sunCtx.sun["2026-10-16"]?.sunset == app.synagogueZonedMs("2026-10-16", "18:00", tz), "the app's own sunset is used")
check(app.parentSunCalls == 0, "a fire asked the dashboard app for sun times")

if (failed) {
    println failed + " failed"
    System.exit(1)
}
println "synagogue phase 1 ok"
