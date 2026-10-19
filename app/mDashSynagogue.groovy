// mDash Synagogue — optional child app. Phase 1: spaces, cues, and day programs.
// Calendar links are a later phase. Time rules are tested by preview/verify-synagogue.groovy.

import groovy.transform.Field

@Field static Map SYNAGOGUE_BUILT = new java.util.concurrent.ConcurrentHashMap()
@Field static Map SYNAGOGUE_ENSURED = new java.util.concurrent.ConcurrentHashMap()
@Field static Map SYNAGOGUE_ENSURE_RUN = new java.util.concurrent.ConcurrentHashMap()

definition(
    name: "mDash Synagogue",
    namespace: "mDash",
    author: "Ephrayim (evdev)",
    description: "Optional synagogue schedules for Modern Dashboard. Prayer times from HebCal, with lights, outlets, locks, and thermostats.",
    category: "My Apps",
    parent: "mDash:Modern Dashboard",
    singleThreaded: true,
    iconUrl: "",
    iconX2Url: "",
    iconX3Url: ""
)

preferences {
    page(name: "mainPage", title: "Synagogue", install: true, uninstall: true)
}

def mainPage() {
    dynamicPage(name: "mainPage", title: "Synagogue", install: true, uninstall: true) {
        section {
            paragraph synagogueStatusParagraph()
            input "debugLogging", "bool", title: "Debug logging", defaultValue: false, submitOnChange: true
            input "btnSynagogueRefresh", "button", title: "Refresh times"
            input "btnSynagoguePause", "button", title: state?.config?.settings?.paused == true ? "Resume" : "Pause"
            paragraph "<small>Times come from <a href=\"https://www.hebcal.com\" target=\"_blank\">HebCal</a>. Programs are edited in the Synagogue tab. Pausing stops future actions and leaves devices as they are.</small>"
        }
    }
}

def appButtonHandler(btn) {
    if (btn == "btnSynagogueRefresh") synagogueRefresh()
    else if (btn == "btnSynagoguePause") synagogueTogglePause()
}

def installed() { synagogueClearEnsured(); synagogueEnsureState(); initialize() }
def updated() { synagogueClearEnsured(); synagogueEnsureState(); initialize() }

def synagogueClearEnsured() {
    try { SYNAGOGUE_ENSURED.remove(synagogueAppId()) } catch (e) {}
    try { SYNAGOGUE_ENSURE_RUN.remove(synagogueAppId()) } catch (e) {}
}

def uninstalled() {
    synagogueClearEnsured()
    try { synagogueClearBuilt() } catch (e) {}
    try { unschedule() } catch (e) {}
    try { unsubscribe() } catch (e) {}
}

def initialize() {
    synagogueClearBuilt()
    synagogueEnsureState()
    try { unsubscribe() } catch (e) {}
    subscribe(location, "systemStart", synagogueSystemStart)
    subscribe(location, "mode", synagogueModeChanged)
    if (state.runtime?.hidden == true) {
        try { unschedule() } catch (e) {}
        return
    }
    synagogueScheduleJobs()
    synagogueShown()
}

def synagogueScheduleJobs() {
    schedule("0 15 0 * * ?", synagogueMidnight, [overwrite: true])
    schedule("0 5 * * * ?", synagogueWatch, [overwrite: true])
}

def synagogueApiVersion() { return 1 }

// The dashboard poll must not call this. The parent is single-threaded and this app
// calls back into it, so the poll would lock both. The parent syncs on its own call.
def synagogueIsHidden() {
    return state?.runtime?.hidden == true
}

def synagogueHidden() {
    synagogueEnsureState()
    def rt = synagogueCopy(state.runtime)
    rt.hidden = true
    state.runtime = rt
    try { unschedule() } catch (e) {}
    log.info "mDash Synagogue: stopped because its dashboard file was removed. Devices were left as they are."
}

def synagogueShown() {
    synagogueEnsureState()
    boolean wasHidden = state.runtime?.hidden == true
    def rt = synagogueCopy(state.runtime)
    rt.hidden = false
    state.runtime = rt
    synagogueScheduleJobs()
    if (wasHidden || !state.hebcal?.fetchedAt) synagogueFetch(false)
    synagogueArm()
}

def synagogueTogglePause() {
    synagogueEnsureState()
    boolean next = !(state.config?.settings?.paused == true)
    def body = [op: "pause", paused: next]
    def applied = synagogueApply(state.config, body)
    state.config = applied.config
    synagogueBump()
    if (next) {
        try { unschedule("synagogueFire") } catch (e) {}
        log.info "mDash Synagogue: paused. Devices were left as they are."
    } else {
        synagogueArm()
        log.info "mDash Synagogue: resumed."
    }
}

def synagogueRefresh() { synagogueClearBuilt(); synagogueFetch(true); synagogueArm() }
def synagogueSystemStart(evt) {
    if (state?.runtime?.hidden == true) return
    try { runIn(60, synagogueWatch, [overwrite: true]) } catch (e) {}
}
def synagogueModeChanged(evt) {
    if (state?.runtime?.hidden == true) return
    synagogueCatchUp()
    synagogueArm()
}
def synagogueMidnight() {
    if (state?.runtime?.hidden == true) return
    synagogueClearBuilt()
    synagogueFetch(true)
    synagogueArm()
}
def synagogueWatch() {
    if (state?.runtime?.hidden == true) return
    synagogueFetchCalendars(false)
    synagogueCatchUp()
    synagogueArm()
}

def synagogueDayCatalog() {
    return [
        [id: "sun", label: "Sunday", he: "יום ראשון", group: "Regular"],
        [id: "monThu", label: "Monday to Thursday", he: "", group: "Regular"],
        [id: "friday", label: "Friday", he: "ערב שבת", group: "Regular"],
        [id: "shabbat", label: "Shabbat", he: "שבת", group: "Regular"],
        [id: "shabbatRoshChodesh", label: "Shabbat Rosh Chodesh", he: "שבת ראש חודש", group: "Regular"],
        [id: "shabbatCholHaMoed", label: "Shabbat Chol HaMoed", he: "שבת חול המועד", group: "Regular"],
        [id: "roshHashana", label: "Rosh Hashana", he: "ראש השנה", group: "Tishrei"],
        [id: "fastGedaliah", label: "Fast of Gedaliah", he: "צום גדליה", group: "Tishrei"],
        [id: "yomKippur", label: "Yom Kippur", he: "יום כיפור", group: "Tishrei"],
        [id: "sukkot", label: "Sukkot", he: "סוכות", group: "Tishrei"],
        [id: "cholHaMoedSukkot", label: "Chol HaMoed Sukkot", he: "חול המועד סוכות", group: "Tishrei"],
        [id: "shemini", label: "Shemini Atzeret / Simchat Torah", he: "שמיני עצרת", group: "Tishrei"],
        [id: "chanukah", label: "Chanukah", he: "חנוכה", group: "Kislev and Tevet"],
        [id: "tenthTevet", label: "Tenth of Tevet", he: "עשרה בטבת", group: "Kislev and Tevet"],
        [id: "fastEsther", label: "Fast of Esther", he: "תענית אסתר", group: "Adar"],
        [id: "purim", label: "Purim", he: "פורים", group: "Adar"],
        [id: "pesachFirst", label: "Pesach, first days", he: "פסח, ימים ראשונים", group: "Nisan"],
        [id: "cholHaMoedPesach", label: "Chol HaMoed Pesach", he: "חול המועד פסח", group: "Nisan"],
        [id: "pesachLast", label: "Pesach, last days", he: "פסח, ימים אחרונים", group: "Nisan"],
        [id: "lagBaOmer", label: "Lag BaOmer", he: "ל\"ג בעומר", group: "Spring and summer"],
        [id: "shavuot", label: "Shavuot", he: "שבועות", group: "Spring and summer"],
        [id: "seventeenthTammuz", label: "Seventeenth of Tammuz", he: "י\"ז בתמוז", group: "Spring and summer"],
        [id: "tishaBav", label: "Tisha B'Av", he: "תשעה באב", group: "Spring and summer"],
        [id: "roshChodesh", label: "Rosh Chodesh", he: "ראש חודש", group: "Every month"],
        [id: "yomHaShoah", label: "Yom HaShoah", he: "יום השואה", group: "More"],
        [id: "yomHaAtzmaut", label: "Yom HaAtzmaut", he: "יום העצמאות", group: "More"],
        [id: "yomYerushalayim", label: "Yom Yerushalayim", he: "יום ירושלים", group: "More"]
    ]
}

def synagogueYomTovIds() {
    return ["roshHashana", "yomKippur", "sukkot", "shemini", "pesachFirst", "pesachLast", "shavuot"]
}

def synagogueZmanCatalog() {
    return [
        [id: "alotHaShachar", label: "Alot hashachar (dawn)"],
        [id: "misheyakir", label: "Misheyakir"],
        [id: "sunrise", label: "Netz (sunrise)"],
        [id: "sofZmanShma", label: "Latest Shema (Gra)"],
        [id: "sofZmanShmaMGA", label: "Latest Shema (Magen Avraham)"],
        [id: "sofZmanTfilla", label: "Latest Shacharis (Gra)"],
        [id: "sofZmanTfillaMGA", label: "Latest Shacharis (Magen Avraham)"],
        [id: "chatzot", label: "Chatzos (midday)"],
        [id: "minchaGedola", label: "Mincha gedola"],
        [id: "minchaKetana", label: "Mincha ketana"],
        [id: "plagHaMincha", label: "Plag hamincha"],
        [id: "sunset", label: "Shkiah (sunset)"],
        [id: "nightfall", label: "Tzeis (nightfall)"],
        [id: "tzeit42min", label: "Tzeis, 42 minutes"],
        [id: "tzeit50min", label: "Tzeis, 50 minutes"],
        [id: "tzeit72min", label: "Tzeis, 72 minutes"],
        [id: "tzeit85deg", label: "Tzeis, 8.5°"],
        [id: "candleLighting", label: "Candle lighting"],
        [id: "havdalah", label: "Havdalah"]
    ]
}

def synagogueDayLabel(String id) {
    for (row in synagogueDayCatalog()) if (row.id == id) return row.label
    return id ?: "Day"
}

def synagogueDefaultSettings() {
    return [paused: false, israel: false, candleMin: 18, havdalahMinutes: 50, nightfall: "tzeit50min", heldModes: [], setupDone: false]
}

def synagogueEmptyChanges() { return [disabled: [], patched: [:], added: []] }

def synagogueDefaultDay(String id) {
    if (id == "shabbatRoshChodesh" || id == "shabbatCholHaMoed") {
        return [source: "same", follows: "shabbat", entries: [], changes: synagogueEmptyChanges()]
    }
    if (id == "roshChodesh" || id == "lagBaOmer" || id == "yomHaShoah" || id == "yomHaAtzmaut" || id == "yomYerushalayim") {
        return [source: "normal", follows: "", entries: [], changes: synagogueEmptyChanges()]
    }
    if (id == "sun" || id == "monThu" || id == "friday" || id == "shabbat") {
        return [source: "own", follows: "", entries: [], changes: synagogueEmptyChanges()]
    }
    return [source: "unset", follows: "", entries: [], changes: synagogueEmptyChanges()]
}

def synagogueDefaultConfig() {
    def days = [:]
    for (row in synagogueDayCatalog()) days[row.id] = synagogueDefaultDay(row.id)
    return [settings: synagogueDefaultSettings(), spaces: [], days: days, dateOverrides: [:], skipped: [], overrides: [:], calendars: [], titleRules: [], bookings: []]
}

def synagogueEnsureState() {
    def appId = synagogueAppId()
    long runAt = 0L
    try { runAt = now() as long } catch (e) { runAt = 0L }
    if (runAt != 0L && SYNAGOGUE_ENSURE_RUN.get(appId) == runAt) return
    if (runAt != 0L) SYNAGOGUE_ENSURE_RUN.put(appId, runAt)
    def rev = 0
    try { rev = state?.runtime?.revision ?: 0 } catch (e) { rev = 0 }
    def today = ""
    try { today = synagogueDateOf(now() as long, synagogueHubTz()) } catch (e) { today = "" }
    def stamp = "${today}|${rev}"
    boolean shaped = false
    try {
        shaped = state.config instanceof Map &&
            state.config.settings instanceof Map &&
            state.config.days instanceof Map &&
            state.config.calendars instanceof List &&
            state.config.titleRules instanceof List &&
            state.config.bookings instanceof List &&
            state.runtime instanceof Map &&
            state.hebcal instanceof Map &&
            state.ical instanceof Map
    } catch (e) { shaped = false }
    if (shaped && today && SYNAGOGUE_ENSURED.get(appId)?.toString() == stamp) return
    if (!(state.config instanceof Map)) {
        def config = synagogueDefaultConfig()
        synagogueSeedHoliday(config)
        state.config = config
    }
    if (!(state.config.days instanceof Map)) {
        def config = synagogueCopy(state.config)
        config.days = synagogueDefaultConfig().days
        if (!(config.settings instanceof Map)) config.settings = synagogueDefaultSettings()
        state.config = config
    }
    if (!(state.config.calendars instanceof List) || !(state.config.titleRules instanceof List) || !(state.config.bookings instanceof List)) {
        def config = synagogueCopy(state.config)
        if (!(config.calendars instanceof List)) config.calendars = []
        if (!(config.titleRules instanceof List)) config.titleRules = []
        if (!(config.bookings instanceof List)) config.bookings = []
        state.config = config
    }
    if (!(state.runtime instanceof Map)) state.runtime = [revision: 0, hidden: false, fired: [:], history: []]
    if (!(state.hebcal instanceof Map)) state.hebcal = [zmanim: [:], flags: [:], fetchedAt: 0, error: "", query: ""]
    if (!(state.ical instanceof Map)) state.ical = [events: [], unsupported: [], fetchedAt: 0, error: ""]
    def todayAfter = ""
    try { todayAfter = synagogueDateOf(now() as long, synagogueHubTz()) } catch (e) { todayAfter = today }
    def revAfter = 0
    try { revAfter = state?.runtime?.revision ?: 0 } catch (e) { revAfter = rev }
    if (todayAfter) SYNAGOGUE_ENSURED.put(appId, "${todayAfter}|${revAfter}")
}

def synagogueCopy(obj) {
    if (obj == null) return null
    return new groovy.json.JsonSlurper().parseText(groovy.json.JsonOutput.toJson(obj))
}

def synagogueBump() {
    def rt = state.runtime instanceof Map ? synagogueCopy(state.runtime) : [:]
    rt.revision = ((rt.revision ?: 0) as long) + 1L
    state.runtime = rt
    return rt.revision
}

def synagogueStatusParagraph() {
    try { synagogueEnsureState() } catch (e) { return "Synagogue is installed." }
    if (state.runtime?.hidden == true) return "Synagogue is off because mld-synagogue.js is not in File Manager."
    if (state.config?.settings?.paused == true) return "Paused. Future actions will not run. Devices were left as they are."
    def err = state.hebcal?.error?.toString() ?: ""
    if (err) return err
    return "Open the Synagogue tab in Modern Dashboard to set up services."
}

def synagogueTzFrom(value) {
    if (value instanceof TimeZone) return value
    def id = value?.toString()?.trim()
    if (id) return TimeZone.getTimeZone(id)
    try { if (location?.timeZone) return location.timeZone } catch (e) {}
    return TimeZone.getDefault()
}

def synagogueHubTz() {
    try { if (location?.timeZone) return location.timeZone } catch (e) {}
    return TimeZone.getDefault()
}

def synagogueLong(value) {
    if (value == null) return null
    if (value instanceof Number) return (value as long)
    def text = value.toString().trim()
    if (!text) return null
    try { return Long.parseLong(text) } catch (e) {}
    try { return new BigDecimal(text).longValue() } catch (e) {}
    return null
}

def synagogueInt(value, Integer fallback) {
    if (value == null || value.toString().trim() == "") return fallback
    def n = synagogueLong(value)
    return n == null ? fallback : (n as int)
}

// Days since 1970-01-01. Civil dates only, so daylight-saving time does not shift the result.
def synagogueEpochDay(String date) {
    def p = (date ?: "1970-01-01").split("-")
    int y = p.length > 0 ? (p[0] as int) : 1970
    int m = p.length > 1 ? (p[1] as int) : 1
    int d = p.length > 2 ? (p[2] as int) : 1
    y -= (m <= 2 ? 1 : 0)
    int era = (y >= 0 ? y : y - 399).intdiv(400)
    int yoe = y - era * 400
    int doy = (153 * (m + (m > 2 ? -3 : 9)) + 2).intdiv(5) + d - 1
    int doe = yoe * 365 + yoe.intdiv(4) - yoe.intdiv(100) + doy
    return era * 146097 + doe - 719468
}

def synagogueDateFromEpoch(int epoch) {
    int z = epoch + 719468
    int era = (z >= 0 ? z : z - 146096).intdiv(146097)
    int doe = z - era * 146097
    int yoe = (doe - doe.intdiv(1460) + doe.intdiv(36524) - doe.intdiv(146096)).intdiv(365)
    int y = yoe + era * 400
    int doy = doe - (365 * yoe + yoe.intdiv(4) - yoe.intdiv(100))
    int mp = (5 * doy + 2).intdiv(153)
    int d = doy - (153 * mp + 2).intdiv(5) + 1
    int m = mp + (mp < 10 ? 3 : -9)
    y += (m <= 2 ? 1 : 0)
    return String.format("%04d-%02d-%02d", y, m, d)
}

def synagogueAddDays(String date, int n, TimeZone tz) {
    return synagogueDateFromEpoch(synagogueEpochDay(date) + n)
}

def synagogueDateOf(long ms, TimeZone tz) {
    Calendar cal = Calendar.getInstance(tz ?: TimeZone.getDefault())
    cal.setTimeInMillis(ms)
    return String.format("%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DATE))
}

def synagogueDow(String date, TimeZone tz) {
    // 1970-01-01 was Thursday. Calendar.SUNDAY is 1.
    return Math.floorMod(synagogueEpochDay(date) + 4, 7) + 1
}

def synagogueZonedMs(String date, String hhmm, TimeZone tz) {
    def p = (date ?: "").split("-")
    def hm = (hhmm ?: "00:00").split(":")
    Calendar cal = Calendar.getInstance(tz ?: TimeZone.getDefault())
    cal.set(Calendar.YEAR, p[0] as int)
    cal.set(Calendar.MONTH, (p[1] as int) - 1)
    cal.set(Calendar.DATE, p[2] as int)
    cal.set(Calendar.HOUR_OF_DAY, (hm[0] ?: "0") as int)
    cal.set(Calendar.MINUTE, hm.length > 1 ? (hm[1] as int) : 0)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    return cal.getTimeInMillis()
}

def synagogueRound5(long ms, TimeZone tz) {
    Calendar cal = Calendar.getInstance(tz ?: TimeZone.getDefault())
    cal.setTimeInMillis(ms)
    int total = cal.get(Calendar.MINUTE) * 60 + cal.get(Calendar.SECOND)
    int rounded = (int) Math.round(total / 300.0d) * 5
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    cal.set(Calendar.MINUTE, 0)
    cal.add(Calendar.MINUTE, rounded)
    return cal.getTimeInMillis()
}

def synagogueParseIso(String text) {
    if (!text?.trim()) return null
    for (pattern in ["yyyy-MM-dd'T'HH:mm:ssXXX", "yyyy-MM-dd'T'HH:mm:ssZ", "yyyy-MM-dd'T'HH:mmXXX"]) {
        try {
            def fmt = new java.text.SimpleDateFormat(pattern)
            fmt.setLenient(false)
            return fmt.parse(text.trim()).getTime()
        } catch (e) {}
    }
    return null
}

def synagogueClock(String value) {
    def text = (value ?: "").toString().trim()
    if (!(text ==~ /^([01]\d|2[0-3]):([0-5]\d)$/)) return ""
    return text
}

def synagogueTitleKey(String title) {
    return (title ?: "").toLowerCase().replace("’", "'").replace("\u2019", "'").trim()
}

def synagogueIdForItem(Map item) {
    def title = synagogueTitleKey(item?.title?.toString())
    def sub = (item?.subcat ?: item?.subCat ?: "").toString().toLowerCase()
    def cat = (item?.category ?: "").toString().toLowerCase()
    if (!title) return null
    if (cat == "parashat" || cat == "mevarchim" || cat == "zmanim") return null
    boolean rosh = cat == "roshchodesh" || sub == "roshchodesh" || title.startsWith("rosh chodesh")
    if (title.startsWith("erev ")) return rosh ? [kind: "roshChodesh"] : null
    if (rosh) return [kind: "roshChodesh"]
    if (title.contains("shushan") && title.contains("purim")) return null
    if (title.contains("pesach") && title.contains("sheni")) return null
    if (title.contains("yom kippur") && title.contains("katan")) return null
    boolean chol = title.contains("chol hamoed") || title.contains("ch''m") || title.contains("ch'm") || title.contains("hoshana raba") || title.contains("hoshana rabba")
    if (chol) {
        if (title.contains("pesach")) return [kind: "chol", id: "cholHaMoedPesach"]
        return [kind: "chol", id: "cholHaMoedSukkot"]
    }
    if (title.contains("rosh hashana")) return [kind: "yomTov", id: "roshHashana"]
    if (title.contains("yom kippur")) return [kind: "yomTov", id: "yomKippur"]
    if (title.contains("shemini") || title.contains("shmini") || title.contains("simchat torah")) return [kind: "yomTov", id: "shemini"]
    if (title.contains("shavuot")) return [kind: "yomTov", id: "shavuot"]
    if (title.contains("pesach viii") || title.contains("pesach vii") || title.contains("pesach 8") || title.contains("pesach 7")) {
        return [kind: "yomTov", id: "pesachLast"]
    }
    if (title.contains("pesach")) return [kind: "yomTov", id: "pesachFirst"]
    if (title.contains("sukkot")) return [kind: "yomTov", id: "sukkot"]
    if (title.contains("gedalia")) return [kind: "fast", id: "fastGedaliah"]
    if (title.contains("tevet") && (title.contains("asara") || title.contains("asarah") || title.contains("tenth"))) return [kind: "fast", id: "tenthTevet"]
    if (title.contains("esther")) return [kind: "fast", id: "fastEsther"]
    if (title.contains("tammuz")) return [kind: "fast", id: "seventeenthTammuz"]
    if (title.contains("tish'a") || title.contains("tisha") || title.contains("tishah")) return [kind: "fast", id: "tishaBav"]
    if (title.contains("chanukah") || title.contains("hanukkah")) return [kind: "minor", id: "chanukah"]
    if (title.contains("purim")) return [kind: "minor", id: "purim"]
    if (title.contains("lag baomer") || title.contains("lag b'omer") || title.contains("lag bomer")) return [kind: "minor", id: "lagBaOmer"]
    if (title.contains("shoah")) return [kind: "minor", id: "yomHaShoah"]
    if (title.contains("atzma")) return [kind: "minor", id: "yomHaAtzmaut"]
    if (title.contains("yerushalayim") || title.contains("yerushalaim")) return [kind: "minor", id: "yomYerushalayim"]
    return null
}

def synagogueDateOnly(String raw) {
    def text = raw?.toString() ?: ""
    def match = text =~ /^(\d{4}-\d{2}-\d{2})/
    return match ? match[0][1] : ""
}

def synagogueParseItems(List items) {
    def flags = [:]
    if (!(items instanceof List)) return flags
    for (item in items) {
        if (!(item instanceof Map)) continue
        def date = synagogueDateOnly(item.date?.toString())
        if (!date) continue
        def row = flags[date] instanceof Map ? synagogueCopy(flags[date]) : [:]
        boolean wrote = false
        def cat = (item.category ?: "").toString().toLowerCase()
        if (cat == "candles") {
            def at = synagogueParseIso(item.date?.toString())
            if (at != null) { row.candles = at; wrote = true }
        } else if (cat == "havdalah") {
            def at = synagogueParseIso(item.date?.toString())
            if (at != null) { row.havdalah = at; wrote = true }
        } else {
            def id = synagogueIdForItem(item)
            if (id?.kind == "yomTov") { row.yomTov = id.id; wrote = true }
            else if (id?.kind == "chol") { row.cholHaMoed = id.id; wrote = true }
            else if (id?.kind == "fast") { row.fast = id.id; wrote = true }
            else if (id?.kind == "minor") { row.minor = id.id; wrote = true }
            else if (id?.kind == "roshChodesh") { row.roshChodesh = true; wrote = true }
        }
        if (wrote || flags[date]) flags[date] = row
    }
    return flags
}

def synagogueParseZmanim(Map data) {
    def out = [:]
    def times = data?.times
    if (!(times instanceof Map)) return out
    def sunset = times.sunset
    if (sunset instanceof CharSequence || sunset instanceof String) {
        def date = synagogueDateOnly(data?.date?.toString() ?: sunset.toString())
        if (!date) return out
        def row = [:]
        times.each { key, value ->
            def at = synagogueParseIso(value?.toString())
            if (at != null) row[key.toString()] = at
        }
        out[date] = row
        return out
    }
    def dates = [] as Set
    times.each { key, value ->
        if (value instanceof Map) value.keySet().each { dates.add(it.toString()) }
    }
    for (date in dates) {
        def row = [:]
        times.each { key, value ->
            if (!(value instanceof Map)) return
            def at = synagogueParseIso(value[date]?.toString())
            if (at != null) row[key.toString()] = at
        }
        if (row) out[date] = row
    }
    return out
}

def synagogueWinner(String date, Map flags, TimeZone tz) {
    def f = flags?.get(date)
    if (!(f instanceof Map)) f = [:]
    int dow = synagogueDow(date, tz)
    if (f.yomTov) return f.yomTov.toString()
    boolean shabbat = dow == Calendar.SATURDAY
    if (shabbat && f.cholHaMoed) return "shabbatCholHaMoed"
    if (shabbat && (f.roshChodesh == true || f.roshChodesh?.toString() == "true")) return "shabbatRoshChodesh"
    if (shabbat) return "shabbat"
    if (f.cholHaMoed) return f.cholHaMoed.toString()
    if (f.roshChodesh == true || f.roshChodesh?.toString() == "true") return "roshChodesh"
    if (f.fast) return f.fast.toString()
    if (f.minor) return f.minor.toString()
    if (dow == Calendar.SUNDAY) return "sun"
    if (dow == Calendar.FRIDAY) return "friday"
    return "monThu"
}

def synagogueRegularId(String date, TimeZone tz) {
    int dow = synagogueDow(date, tz)
    if (dow == Calendar.SUNDAY) return "sun"
    if (dow == Calendar.FRIDAY) return "friday"
    if (dow == Calendar.SATURDAY) return "shabbat"
    return "monThu"
}

def synagogueResolveEntries(String dayId, String date, Map config, TimeZone tz, Set seen) {
    if (!dayId) return [entries: []]
    if (seen.contains(dayId) || seen.size() > 8) return [error: "A schedule can't follow itself.", entries: []]
    seen.add(dayId)
    def day = config?.days?.get(dayId)
    if (!(day instanceof Map)) return [entries: []]
    def source = day.source?.toString() ?: "unset"
    if (source == "unset" || source == "none") return [entries: []]
    if (source == "normal") return synagogueResolveEntries(synagogueRegularId(date, tz), date, config, tz, seen)
    if (source == "same" || source == "changes") {
        def follows = day.follows?.toString() ?: "shabbat"
        def base = synagogueResolveEntries(follows, date, config, tz, seen)
        if (base.error) return base
        if (source == "same") return [entries: base.entries]
        return [entries: synagogueApplyChanges(base.entries, day.changes)]
    }
    def own = day.entries instanceof List ? day.entries : []
    return [entries: own]
}

def synagogueApplyChanges(List base, changes) {
    def disabled = [] as Set
    if (changes?.disabled instanceof List) changes.disabled.each { if (it != null) disabled.add(it.toString()) }
    def patched = changes?.patched instanceof Map ? changes.patched : [:]
    def out = []
    for (entry in (base ?: [])) {
        def id = entry?.id?.toString()
        if (!id || disabled.contains(id)) continue
        def copy = synagogueCopy(entry)
        if (patched[id] instanceof Map) {
            patched[id].each { key, value ->
                if (key?.toString() != "id") copy[key.toString()] = synagogueCopy(value)
            }
        }
        out << copy
    }
    if (changes?.added instanceof List) {
        for (entry in changes.added) if (entry instanceof Map) out << synagogueCopy(entry)
    }
    return out
}

def synagogueCycleError(String dayId, Map config) {
    def seen = [] as Set
    def current = dayId
    int guard = 0
    while (current && guard < 12) {
        if (!seen.add(current)) return "A schedule can't follow itself."
        def day = config?.days?.get(current)
        def source = day?.source?.toString()
        if (source != "same" && source != "changes") return null
        def follows = day?.follows?.toString() ?: "shabbat"
        if (follows == current) return "A schedule can't follow itself."
        current = follows
        guard++
    }
    if (guard >= 12) return "That schedule follows too many others."
    return null
}

def synagogueZmanAt(String key, String date, Map config, Map ctx, Map estimated) {
    def settings = config?.settings instanceof Map ? config.settings : [:]
    def zmanim = ctx?.zmanim instanceof Map ? ctx.zmanim : [:]
    def flags = ctx?.flags instanceof Map ? ctx.flags : [:]
    def dayZ = zmanim[date] instanceof Map ? zmanim[date] : [:]
    def flag = flags[date] instanceof Map ? flags[date] : [:]
    def want = key ?: ""
    if (want == "nightfall") want = settings.nightfall?.toString() ?: "tzeit50min"
    if (want == "candleLighting") {
        def at = synagogueLong(flag.candles)
        if (at != null) return at
        def sunset = synagogueZmanAt("sunset", date, config, ctx, estimated)
        if (sunset == null) return null
        return sunset - synagogueInt(settings.candleMin, 18) * 60000L
    }
    if (want == "havdalah") {
        def at = synagogueLong(flag.havdalah)
        if (at != null) return at
        def sunset = synagogueZmanAt("sunset", date, config, ctx, estimated)
        if (sunset == null) return null
        return sunset + synagogueInt(settings.havdalahMinutes, 50) * 60000L
    }
    def at = synagogueLong(dayZ[want])
    if (at != null) return at
    if (want == "sunset" || want == "sunrise") {
        def sun = ctx?.sun instanceof Map ? ctx.sun[date] : null
        def fallback = sun instanceof Map ? synagogueLong(sun[want]) : null
        if (fallback != null) {
            estimated.yes = true
            return fallback
        }
    }
    return null
}

def synagogueCalendarEventId(Map ev) {
    return "ical|" + (ev?.calendarId ?: "") + "|" + (ev?.uid ?: "") + "|" + (synagogueLong(ev?.start) ?: 0L)
}

def synagogueNormalizeStart(Map start) {
    if (!(start instanceof Map)) return [type: "clock", time: "07:00"]
    if (start.type?.toString() != "calendar") return synagogueCopy(start)
    def fallback = start.fallback instanceof Map ? synagogueCopy(start.fallback) : [type: "zman", zman: "sunset", offsetMin: -15]
    if (fallback?.type?.toString() == "calendar") fallback = [type: "zman", zman: "sunset", offsetMin: -15]
    return [
        type: "calendar",
        contains: start.contains?.toString()?.trim() ?: "",
        ifMissing: start.ifMissing?.toString() == "fallback" ? "fallback" : "skip",
        fallback: fallback
    ]
}

def synagogueResolveCalendar(Map spec, String date, Map config, Map ctx, Map estimated, Set consumed) {
    def contains = synagogueTitleKey(spec?.contains?.toString())
    def tz = synagogueTzFrom(ctx?.tz)
    def label = spec?.contains?.toString()?.trim() ?: "event"
    def matches = []
    if (contains) {
        for (ev in (ctx?.events instanceof List ? ctx.events : [])) {
            if (!(ev instanceof Map) || ev.cancelled == true) continue
            long at = synagogueLong(ev.start) ?: 0L
            if (!at || synagogueDateOf(at, tz) != date) continue
            def title = synagogueTitleKey(ev.title?.toString())
            if (!title.contains(contains)) continue
            matches << ev
        }
    }
    def fallbackSpec = spec?.fallback instanceof Map && spec.fallback.type?.toString() != "calendar" ? spec.fallback : [type: "zman", zman: "sunset", offsetMin: -15]
    def fallbackAt = synagogueResolveWhen(fallbackSpec, date, 0L, config, ctx, estimated)
    if (!matches) {
        if (spec?.ifMissing?.toString() == "fallback" && fallbackAt != null) {
            return [start: fallbackAt, fromCalendar: false, warning: "No calendar " + label + ". Using the usual time."]
        }
        return [start: null, fromCalendar: false, warning: "No calendar " + label + ". Skipped."]
    }
    Map best = matches[0]
    if (matches.size() > 1) {
        long bestDist = Long.MAX_VALUE
        long bestStart = Long.MAX_VALUE
        for (ev in matches) {
            long at = synagogueLong(ev.start) ?: 0L
            long dist = fallbackAt == null ? at : Math.abs(at - (fallbackAt as long))
            if (dist < bestDist || (dist == bestDist && at < bestStart)) {
                bestDist = dist
                bestStart = at
                best = ev
            }
        }
    }
    if (consumed != null) consumed.add(synagogueCalendarEventId(best))
    return [start: synagogueLong(best.start), fromCalendar: true, warning: ""]
}

def synagogueResolveWhen(Map spec, String date, long startMs, Map config, Map ctx, Map estimated) {
    def type = spec?.type?.toString() ?: "clock"
    def tz = synagogueTzFrom(ctx?.tz)
    if (type == "duration") return startMs + synagogueInt(spec?.minutes, 60) * 60000L
    if (type == "clock") {
        def clock = synagogueClock(spec?.time?.toString())
        if (!clock) return null
        return synagogueZonedMs(date, clock, tz)
    }
    if (type == "zman") {
        def base = synagogueZmanAt(spec?.zman?.toString(), date, config, ctx, estimated)
        if (base == null) return null
        int offset = synagogueInt(spec?.offsetMin, 0)
        return base + (offset as long) * 60000L
    }
    return null
}

def synagogueWhyFor(Map spec, String date, Map config, Map ctx, Map estimated, boolean fromCalendar) {
    if (fromCalendar) return [kind: "calendar", contains: spec?.contains?.toString()?.trim() ?: ""]
    def used = spec
    if (spec?.type?.toString() == "calendar") used = spec?.fallback instanceof Map ? spec.fallback : [:]
    def type = used?.type?.toString() ?: ""
    if (type == "clock") return [kind: "clock", time: synagogueClock(used?.time?.toString()) ?: ""]
    if (type == "zman") {
        def base = synagogueZmanAt(used?.zman?.toString(), date, config, ctx, estimated)
        return [kind: "zman", zman: used?.zman?.toString() ?: "", offsetMin: synagogueInt(used?.offsetMin, 0), base: base]
    }
    return [:]
}

def synagogueMarkOverlap(List occurrences) {
    def bySpace = [:]
    for (occ in (occurrences ?: [])) {
        if (occ?.skipped == true) continue
        def key = occ?.spaceId?.toString() ?: ""
        if (!key) continue
        if (!(bySpace[key] instanceof List)) bySpace[key] = []
        bySpace[key] << occ
    }
    bySpace.each { spaceId, list ->
        list.sort { a, b -> (a.start as long) <=> (b.start as long) }
        for (int i = 0; i < list.size() - 1; i++) {
            def curr = list[i]
            def next = list[i + 1]
            if ((next.start as long) < (curr.end as long) && (next.start as long) > (curr.start as long)) {
                curr.overlap = true
                next.overlap = true
                if (!curr.warning) curr.warning = "Overlaps " + (next.name ?: "the next event") + "."
                if (!next.warning) next.warning = "Overlaps " + (curr.name ?: "the previous event") + "."
            }
        }
    }
}

def synagogueCueStates(Map control, Map cue) {
    def action = cue?.action?.toString() ?: ""
    def kind = control?.kind?.toString() ?: ""
    def devices = control?.devices instanceof List ? control.devices : []
    def states = []
    boolean missingPreset = false
    for (device in devices) {
        def id = device instanceof Map ? device.id?.toString() : device?.toString()
        if (!id) continue
        def deviceName = device instanceof Map ? device.name?.toString()?.trim() : ""
        boolean dimmer = device instanceof Map && (device.dimmer == true || device.dimmer?.toString() == "true")
        if (kind == "light") {
            def row = action == "off" ? [id: id, kind: "light", on: false] : (action == "level" && dimmer ? [id: id, kind: "light", on: true, level: synagogueInt(cue?.level, 100)] : [id: id, kind: "light", on: true])
            if (deviceName) row.name = deviceName
            states << row
        } else if (kind == "outlet") {
            def row = [id: id, kind: "outlet", on: action != "off"]
            if (deviceName) row.name = deviceName
            states << row
        } else if (kind == "lock") {
            def row = [id: id, kind: "lock", locked: action != "unlock"]
            if (deviceName) row.name = deviceName
            states << row
        } else if (kind == "thermostat") {
            def presetName = action == "setback" ? "setback" : "comfort"
            def preset = control[presetName]
            def setting = preset instanceof Map ? preset[id] : null
            if (!(setting instanceof Map) || !(setting.mode?.toString()?.trim())) {
                missingPreset = true
                continue
            }
            def row = [id: id, kind: "thermostat", mode: setting.mode.toString()]
            if (deviceName) row.name = deviceName
            if (setting.heat != null && setting.heat.toString().trim()) row.heat = synagogueInt(setting.heat, 0)
            if (setting.cool != null && setting.cool.toString().trim()) row.cool = synagogueInt(setting.cool, 0)
            if (setting.fanMode?.toString()?.trim()) row.fanMode = setting.fanMode.toString()
            states << row
        }
    }
    return [states: states, held: missingPreset && states.isEmpty(), incomplete: missingPreset && !states.isEmpty()]
}

def synagogueOffLike(Map cue) {
    def action = cue?.action?.toString() ?: ""
    return action == "off" || action == "lock" || action == "setback"
}

def synagogueApplies(Map cue, String entryId, String entryName) {
    def list = cue?.appliesTo
    if (!(list instanceof List) || list.isEmpty()) return true
    def name = entryName?.trim()?.toLowerCase()
    for (id in list) {
        def key = id?.toString()?.trim()?.toLowerCase()
        if (!key) continue
        if (key == entryId?.toString()?.toLowerCase() || (name && key == name)) return true
    }
    return false
}

def synagogueCueLabel(Map control, Map cue) {
    def name = control?.name?.toString() ?: "Device"
    def action = cue?.action?.toString() ?: "on"
    if (action == "comfort") return name + " comfort"
    if (action == "setback") return name + " setback"
    if (action == "level") return name + " " + synagogueInt(cue?.level, 100) + "%"
    if (action == "unlock") return name + " unlock"
    if (action == "lock") return name + " lock"
    if (action == "off") return name + " off"
    return name + " on"
}

def synagogueSpaceById(Map config, String id) {
    for (space in (config?.spaces instanceof List ? config.spaces : [])) {
        if (space?.id?.toString() == id) return space
    }
    return null
}

def synagogueEntriesFor(String winnerId, String date, String position, Map config, Map ctx, boolean firstOfSpan) {
    def tz = synagogueTzFrom(ctx?.tz)
    def resolved = synagogueResolveEntries(winnerId, date, config, tz, [] as Set)
    def out = []
    for (entry in (resolved.entries ?: [])) {
        def pos = entry?.position?.toString() ?: "day"
        if (position == "day" && pos == "evening") continue
        if (position == "evening" && pos != "evening") continue
        if (position == "day" && entry?.laterDays == false && !firstOfSpan) continue
        if (position == "evening" && entry?.laterEvenings == false && !firstOfSpan) continue
        out << entry
    }
    return out
}

def synagogueExpand(Map config, Map ctx) {
    def tz = synagogueTzFrom(ctx?.tz)
    long nowMs = synagogueLong(ctx?.now) ?: 0L
    def flags = ctx?.flags instanceof Map ? ctx.flags : [:]
    int horizon = synagogueInt(ctx?.horizon, 21)
    def warnings = []
    def occurrences = []
    def consumedEvents = [] as Set
    def today = synagogueDateOf(nowMs, tz)
    def skipped = [] as Set
    if (config?.skipped instanceof List) config.skipped.each { if (it != null) skipped.add(it.toString()) }
    def overrides = config?.overrides instanceof Map ? config.overrides : [:]
    def dateOverrides = config?.dateOverrides instanceof Map ? config.dateOverrides : [:]
    int epoch = synagogueEpochDay(today) - 2
    int dateCount = Math.max(horizon, -1) + 3
    def dates = new ArrayList(dateCount)
    def winners = [:]
    for (int n = 0; n < dateCount; n++) {
        def date = synagogueDateFromEpoch(epoch + n)
        dates << date
        winners[date] = synagogueWinner(date, flags, tz)
    }
    for (int i = -1; i < horizon; i++) {
        def date = dates[i + 2]
        def nextDate = dates[i + 3]
        def prevDate = dates[i + 1]
        def winner = winners[date]
        def nextWinner = winners[nextDate]
        boolean first = winners[prevDate] != winner
        boolean nextFirst = winner != nextWinner
        def dayList = []
        def eveList = []
        def dayOverride = dateOverrides[date]
        def nextOverride = dateOverrides[nextDate]
        if (dayOverride instanceof List) {
            for (entry in dayOverride) if ((entry?.position?.toString() ?: "day") != "evening") dayList << entry
        } else {
            dayList = synagogueEntriesFor(winner, date, "day", config, ctx, first)
        }
        if (nextOverride instanceof List) {
            for (entry in nextOverride) if (entry?.position?.toString() == "evening") eveList << entry
        } else {
            eveList = synagogueEntriesFor(nextWinner, nextDate, "evening", config, ctx, nextFirst)
        }
        def replacedIds = [] as Set
        for (entry in eveList) {
            def name = entry?.name?.toString()?.trim()?.toLowerCase()
            def spaceId = entry?.spaceId?.toString() ?: ""
            if (!name) continue
            for (dayEntry in dayList) {
                def daySpace = dayEntry?.spaceId?.toString() ?: ""
                if (daySpace != spaceId) continue
                if (dayEntry?.name?.toString()?.trim()?.toLowerCase() == name) replacedIds.add(dayEntry?.id?.toString())
            }
        }
        def ordered = []
        for (entry in dayList) {
            if (replacedIds.contains(entry?.id?.toString())) continue
            ordered << [entry: entry, position: "day", dayId: winner, fromOverride: dayOverride instanceof List]
        }
        for (entry in eveList) {
            def name = entry?.name?.toString()?.trim()?.toLowerCase()
            def spaceId = entry?.spaceId?.toString() ?: ""
            def replaced = ""
            for (dayEntry in dayList) {
                def daySpace = dayEntry?.spaceId?.toString() ?: ""
                if (daySpace != spaceId) continue
                if (dayEntry?.name?.toString()?.trim()?.toLowerCase() == name) replaced = "Replaces regular " + dayEntry.name
            }
            ordered << [entry: entry, position: "evening", dayId: nextWinner, fromOverride: nextOverride instanceof List, replaced: replaced]
        }
        for (item in ordered) {
            def entry = item.entry
            if (!(entry instanceof Map)) continue
            def entryId = entry.id?.toString() ?: ""
            def position = item.position
            def occDay = item.dayId?.toString()
            def occId = occDay + "|" + date + "|" + entryId + "|" + position
            def estimated = [yes: false]
            def startSpec = entry.start instanceof Map ? entry.start : [:]
            boolean fromCalendar = false
            def start
            if (startSpec?.type?.toString() == "calendar") {
                def found = synagogueResolveCalendar(startSpec, date, config, ctx, estimated, consumedEvents)
                if (found.warning) warnings << ((entry.name ?: "A service") + " on " + date + ": " + found.warning)
                if (found.start == null) continue
                start = found.start
                fromCalendar = found.fromCalendar == true
            } else {
                start = synagogueResolveWhen(startSpec, date, 0L, config, ctx, estimated)
                if (start == null) {
                    warnings << ((entry.name ?: "A service") + " on " + date + " has no time yet.")
                    continue
                }
            }
            def why = synagogueWhyFor(startSpec, date, config, ctx, estimated, fromCalendar)
            if (!fromCalendar && synagogueInt(entry.roundTo, 0) == 5) start = synagogueRound5(start as long, tz)
            def notBefore = synagogueClock(entry.notBefore?.toString())
            if (notBefore) {
                long floor = synagogueZonedMs(date, notBefore, tz)
                if ((start as long) < floor) start = floor
            }
            def notAfter = synagogueClock(entry.notAfter?.toString())
            if (notAfter) {
                long cap = synagogueZonedMs(date, notAfter, tz)
                if ((start as long) > cap) start = cap
            }
            def ov = overrides[occId] instanceof Map ? overrides[occId] : [:]
            if (ov.start) {
                def clock = synagogueClock(ov.start.toString())
                if (clock) start = synagogueZonedMs(date, clock, tz)
            }
            def end = synagogueResolveWhen(entry.end instanceof Map ? entry.end : [type: "duration", minutes: 60], date, start as long, config, ctx, estimated)
            if (ov.durationMin != null && ov.durationMin.toString().trim()) end = (start as long) + synagogueInt(ov.durationMin, 60) * 60000L
            if (ov.extendMin != null && ov.extendMin.toString().trim()) end = ((end ?: start) as long) + synagogueInt(ov.extendMin, 0) * 60000L
            if (end == null || (end as long) <= (start as long)) {
                warnings << ((entry.name ?: "A service") + " on " + date + " ends before it starts.")
                continue
            }
            def space = synagogueSpaceById(config, entry.spaceId?.toString())
            def cues = []
            boolean runCues = entry.runCues != false
            def cueSource = []
            if (runCues && space?.cues instanceof List) cueSource.addAll(space.cues)
            if (runCues && entry.extraCues instanceof List) cueSource.addAll(entry.extraCues)
            for (cue in cueSource) {
                if (!(cue instanceof Map) || !synagogueApplies(cue, entryId, entry.name?.toString())) continue
                def control = null
                if (space?.controls instanceof List) control = space.controls.find { it?.id?.toString() == cue.controlId?.toString() }
                if (!(control instanceof Map)) continue
                int offset = synagogueInt(cue.offsetMin, 0)
                long at = ((cue.anchor?.toString() == "end" ? end : start) as long) + (offset as long) * 60000L
                def built = synagogueCueStates(control, cue)
                if (built.held == true) {
                    def which = cue.action?.toString() == "setback" ? "Setback" : "Comfort"
                    warnings << ((space?.name ?: "A space") + " " + which + " has no temperature yet.")
                    continue
                }
                if (built.incomplete == true) warnings << ((space?.name ?: "A space") + " is missing a temperature for one thermostat.")
                cues << [
                    id: cue.id?.toString() ?: "cue",
                    at: at,
                    label: synagogueCueLabel(control, cue),
                    anchor: cue.anchor?.toString() == "end" ? "end" : "start",
                    offLike: synagogueOffLike(cue),
                    unlock: cue.action?.toString() == "unlock",
                    states: built.states,
                    suppressed: false
                ]
            }
            boolean changed = (ov.start || (ov.extendMin != null && ov.extendMin.toString().trim()) || (ov.durationMin != null && ov.durationMin.toString().trim())) ? true : false
            occurrences << [
                id: occId,
                name: entry.name?.toString() ?: "Service",
                entryId: entryId,
                dayId: occDay,
                dayLabel: synagogueDayLabel(occDay),
                date: date,
                position: position,
                start: start,
                end: end,
                spaceId: space?.id?.toString() ?: entry.spaceId?.toString(),
                spaceName: space?.name?.toString() ?: "",
                estimated: estimated.yes == true,
                skipped: skipped.contains(occId) || ov.cancel == true,
                cancelled: ov.cancel == true,
                changed: changed,
                dateChanged: item.fromOverride == true,
                replaced: item.replaced ?: "",
                stayOn: false,
                overlap: false,
                kind: "service",
                why: why,
                cues: cues,
                warning: ""
            ]
        }
    }
    synagogueAppendFeed(occurrences, warnings, config, ctx, consumedEvents)
    synagogueApplyStayOn(occurrences, config)
    synagogueMarkOverlap(occurrences)
    return [occurrences: occurrences, warnings: warnings.unique(), actions: synagogueActionsFrom(occurrences)]
}

// Read-only. Callers must copy before changing occurrences or actions.
def synagogueBuilt(Map ctx) {
    synagogueEnsureState()
    def slot = synagogueBuiltKey(ctx)
    def hit = SYNAGOGUE_BUILT.get(slot.appId)
    if (hit instanceof Map && hit.key == slot.text && hit.built instanceof Map) return hit.built
    synagogueFillSun(ctx)
    def built = synagogueExpand(state.config, ctx)
    if (!synagogueSunIncomplete(ctx)) SYNAGOGUE_BUILT.put(slot.appId, [key: slot.text, built: built])
    return built
}

def synagogueSunIncomplete(Map ctx) {
    def sun = ctx?.sun
    if (!(sun instanceof Map) || !sun) return false
    boolean missing = false
    sun.each { key, row ->
        if (!(row instanceof Map) || row.sunrise == null || row.sunset == null) missing = true
    }
    return missing
}

def synagogueClearBuilt() {
    try { SYNAGOGUE_BUILT.remove(synagogueAppId()) } catch (e) {}
}

def synagogueAppId() {
    try {
        def id = app?.id
        if (id != null && id.toString()) return id.toString()
    } catch (e) {}
    return "0"
}

def synagogueExtraStamp() {
    def extra = state?.hebcal?.extra
    long newest = 0L
    if (extra instanceof Map) {
        extra.each { key, row ->
            long at = synagogueLong(row?.at) ?: 0L
            if (at > newest) newest = at
        }
    }
    return newest
}

def synagogueBuiltKey(Map ctx) {
    def tz = synagogueTzFrom(ctx?.tz)
    long nowMs = synagogueLong(ctx?.now) ?: 0L
    def tzId = ""
    try { tzId = tz?.getID() ?: "" } catch (e) { tzId = "" }
    def text = [
        state?.runtime?.revision ?: 0,
        state?.hebcal?.fetchedAt ?: 0,
        state?.ical?.fetchedAt ?: 0,
        synagogueExtraStamp(),
        synagogueQueryKey(),
        tzId,
        synagogueDateOf(nowMs, tz),
        synagogueInt(ctx?.horizon, 21)
    ].join("|")
    return [appId: synagogueAppId(), text: text]
}

def synagogueNormalizeCalendarUrl(String raw) {
    def text = raw?.toString()?.trim() ?: ""
    def lower = text.toLowerCase()
    if (lower.startsWith("webcal://")) text = "https://" + text.substring("webcal://".length())
    else if (lower.startsWith("webcals://")) text = "https://" + text.substring("webcals://".length())
    if (!text.toLowerCase().startsWith("https://") || text.length() < 12) return [ok: false, error: "That address needs the secret iCal link, not the web page link."]
    return [ok: true, url: text]
}

def synagogueMaskSecret(String secret) {
    def text = secret?.toString() ?: ""
    if (text.length() <= 6) return "••••••"
    return "••••" + text.substring(text.length() - 6)
}

def synagoguePublicCalendars(Map config) {
    def out = []
    for (cal in (config?.calendars instanceof List ? config.calendars : [])) {
        out << [id: cal?.id?.toString() ?: "", name: cal?.name?.toString() ?: "Calendar", mask: synagogueMaskSecret(cal?.url?.toString())]
    }
    return out
}

def synagogueIcalLocation(Map vevent) {
    def text = vevent?.LOCATION?.value?.toString()?.replaceAll("\\s+", " ")?.trim() ?: ""
    if (text.length() > 80) text = text.substring(0, 80)
    return text
}

def synagogueRuleMatch(Map ev, rules) {
    def title = synagogueTitleKey(ev?.title?.toString() ?: "")
    def location = synagogueTitleKey(ev?.location?.toString() ?: "")
    if (!(rules instanceof List)) return [:]
    for (rule in rules) {
        def needle = synagogueTitleKey(rule?.contains?.toString() ?: "")
        if (!needle) continue
        def hay = rule?.field?.toString() == "location" ? location : title
        if (!hay || !hay.contains(needle)) continue
        if (rule?.ignore == true) return [ignore: true]
        return [spaceId: rule?.spaceId?.toString() ?: "", name: rule?.name?.toString()?.trim() ?: ""]
    }
    return [:]
}

def synagogueSpaceForTitle(String title, rules) {
    return synagogueRuleMatch([title: title], rules)?.spaceId?.toString() ?: ""
}

def synagogueUnfoldIcal(String text) {
    def lines = []
    def current = new StringBuilder()
    (text ?: "").replace("\r\n", "\n").replace("\r", "\n").split("\n").each { line ->
        if ((line.startsWith(" ") || line.startsWith("\t")) && current.length()) current.append(line.substring(1))
        else {
            if (current.length()) lines << current.toString()
            current = new StringBuilder(line)
        }
    }
    if (current.length()) lines << current.toString()
    return lines
}

def synagogueUnescapeIcal(String value) {
    def text = value ?: ""
    text = text.replace("\\\\", "\u0001")
    text = text.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\\;", ";")
    return text.replace("\u0001", "\\")
}

def synagogueIcalProp(String line) {
    int colon = line?.indexOf(":") ?: -1
    if (colon < 1) return null
    def left = line.substring(0, colon)
    def value = synagogueUnescapeIcal(line.substring(colon + 1))
    def parts = left.split(";")
    def params = [:]
    for (int i = 1; i < parts.length; i++) {
        def piece = parts[i]?.toString() ?: ""
        int eq = piece.indexOf("=")
        if (eq > 0) params[piece.substring(0, eq).toUpperCase()] = piece.substring(eq + 1).replace("\"", "")
    }
    return [name: parts[0].toUpperCase(), params: params, value: value]
}

def synagogueParseRrule(String value) {
    def map = [:]
    (value ?: "").split(";").each { part ->
        int eq = part.indexOf("=")
        if (eq > 0) map[part.substring(0, eq).trim().toUpperCase()] = part.substring(eq + 1).trim()
    }
    return map
}

def synagogueParseDuration(String value) {
    def matcher = java.util.regex.Pattern.compile("^P(?:(\\d+)D)?(?:T(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+)S)?)?\$").matcher(value ?: "")
    if (!matcher.matches()) return null
    long ms = 0L
    if (matcher.group(1)) ms += (matcher.group(1) as long) * 86400000L
    if (matcher.group(2)) ms += (matcher.group(2) as long) * 3600000L
    if (matcher.group(3)) ms += (matcher.group(3) as long) * 60000L
    if (matcher.group(4)) ms += (matcher.group(4) as long) * 1000L
    return ms > 0L ? ms : null
}

def synagogueParseByday(String token) {
    def matcher = java.util.regex.Pattern.compile("^(-?\\d)?(SU|MO|TU|WE|TH|FR|SA)\$").matcher(token ?: "")
    if (!matcher.matches()) return null
    int nth = matcher.group(1) ? synagogueInt(matcher.group(1), 0) : 0
    def days = [SU: Calendar.SUNDAY, MO: Calendar.MONDAY, TU: Calendar.TUESDAY, WE: Calendar.WEDNESDAY, TH: Calendar.THURSDAY, FR: Calendar.FRIDAY, SA: Calendar.SATURDAY]
    return [nth: nth, day: days[matcher.group(2)]]
}

def synagogueIcalInstant(Map prop, TimeZone hub) {
    def value = prop?.value?.toString()?.trim() ?: ""
    if (!value) return null
    boolean dateOnly = prop?.params?.VALUE?.toString()?.equalsIgnoreCase("DATE") || (value ==~ /^\d{8}$/)
    if (dateOnly) {
        if (value.length() < 8) return [allDay: true]
        def iso = value.substring(0, 4) + "-" + value.substring(4, 6) + "-" + value.substring(6, 8)
        return [allDay: true, ms: synagogueZonedMs(iso, "00:00", hub), tz: hub]
    }
    def tz = hub ?: TimeZone.getDefault()
    if (value.endsWith("Z")) {
        tz = TimeZone.getTimeZone("UTC")
        value = value.substring(0, value.length() - 1)
    } else if (prop?.params?.TZID?.toString()?.trim()) {
        def id = prop.params.TZID.toString().trim()
        def resolved = TimeZone.getTimeZone(id)
        if (resolved.getID() == "GMT" && !id.equalsIgnoreCase("GMT") && !id.equalsIgnoreCase("UTC")) resolved = tz
        tz = resolved
    }
    def pattern = value.length() >= 15 ? "yyyyMMdd'T'HHmmss" : "yyyyMMdd'T'HHmm"
    try {
        def fmt = new java.text.SimpleDateFormat(pattern)
        fmt.setLenient(false)
        fmt.setTimeZone(tz)
        return [allDay: false, ms: fmt.parse(value).getTime(), tz: tz]
    } catch (e) {
        return null
    }
}

def synagogueReadVevents(String text) {
    def events = []
    def current = null
    for (line in synagogueUnfoldIcal(text)) {
        def upper = line?.toUpperCase() ?: ""
        if (upper == "BEGIN:VEVENT") { current = [exdates: []]; continue }
        if (upper == "END:VEVENT") {
            if (current != null) events << current
            current = null
            continue
        }
        if (current == null) continue
        def prop = synagogueIcalProp(line)
        if (!prop) continue
        if (prop.name == "EXDATE") current.exdates << prop
        else if (current[prop.name] == null) current[prop.name] = prop
    }
    return events
}

def synagogueAddStart(List starts, long at, Integer count, Long until, long windowEnd) {
    if (until != null && at > until) return "stop"
    if (count != null && starts.size() >= count) return "stop"
    if (at > windowEnd) return "stop"
    starts << at
    return (count != null && starts.size() >= count) ? "stop" : "ok"
}

def synagogueMonthWeekday(Calendar month, int nth, int weekday) {
    Calendar c = Calendar.getInstance(month.getTimeZone())
    c.setTimeInMillis(month.getTimeInMillis())
    c.set(Calendar.DAY_OF_MONTH, 1)
    int monthIndex = c.get(Calendar.MONTH)
    if (nth > 0) {
        int delta = (weekday - c.get(Calendar.DAY_OF_WEEK) + 7) % 7
        c.add(Calendar.DATE, delta + (nth - 1) * 7)
        if (c.get(Calendar.MONTH) != monthIndex) return null
        return c
    }
    if (nth < 0) {
        c.set(Calendar.DAY_OF_MONTH, c.getActualMaximum(Calendar.DAY_OF_MONTH))
        int delta = (c.get(Calendar.DAY_OF_WEEK) - weekday + 7) % 7
        c.add(Calendar.DATE, -delta + (nth + 1) * 7)
        if (c.get(Calendar.MONTH) != monthIndex) return null
        return c
    }
    return null
}

def synagogueRruleStarts(long startMs, Map rule, TimeZone tz, long windowStart, long windowEnd) {
    def extra = false
    rule?.keySet()?.each { key ->
        if (!(key.toString() in ["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "WKST"])) extra = true
    }
    if (extra) return [error: "This repeat pattern is not supported yet."]
    def freq = rule?.FREQ?.toString()?.toUpperCase()
    if (!(freq in ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"])) return [error: "This repeat pattern is not supported yet."]
    int interval = Math.max(1, synagogueInt(rule?.INTERVAL, 1))
    Integer count = rule?.COUNT?.toString()?.trim() ? Math.max(1, synagogueInt(rule.COUNT, 1)) : null
    Long until = null
    if (rule?.UNTIL?.toString()?.trim()) {
        def at = synagogueIcalInstant([params: [:], value: rule.UNTIL.toString()], tz)
        if (at?.allDay && rule.UNTIL.toString().length() >= 8) {
            def raw = rule.UNTIL.toString()
            until = synagogueZonedMs(raw.substring(0, 4) + "-" + raw.substring(4, 6) + "-" + raw.substring(6, 8), "23:59", tz)
        } else if (at?.ms != null) until = at.ms as Long
    }
    def byday = []
    if (rule?.BYDAY?.toString()?.trim()) {
        for (token in rule.BYDAY.toString().toUpperCase().split(",")) {
            def parsed = synagogueParseByday(token.trim())
            if (!parsed) return [error: "This repeat pattern is not supported yet."]
            byday << parsed
        }
    }
    if (freq == "WEEKLY" && byday.any { it.nth != 0 }) return [error: "This repeat pattern is not supported yet."]
    if (freq != "MONTHLY" && byday.any { it.nth != 0 }) return [error: "This repeat pattern is not supported yet."]
    if (freq == "MONTHLY" && rule?.BYMONTHDAY && byday) return [error: "This repeat pattern is not supported yet."]
    Calendar seed = Calendar.getInstance(tz)
    seed.setTimeInMillis(startMs)
    int hour = seed.get(Calendar.HOUR_OF_DAY)
    int minute = seed.get(Calendar.MINUTE)
    int second = seed.get(Calendar.SECOND)
    def starts = []
    def stamp = { Calendar occ ->
        occ.set(Calendar.HOUR_OF_DAY, hour)
        occ.set(Calendar.MINUTE, minute)
        occ.set(Calendar.SECOND, second)
        occ.set(Calendar.MILLISECOND, 0)
        return occ.getTimeInMillis()
    }
    if (freq == "DAILY") {
        Calendar cursor = (Calendar) seed.clone()
        for (int i = 0; i < 15000; i++) {
            if (synagogueAddStart(starts, stamp(cursor), count, until, windowEnd) != "ok") break
            cursor.add(Calendar.DATE, interval)
        }
    } else if (freq == "WEEKLY") {
        int wkst = Calendar.SUNDAY
        if (rule?.WKST?.toString()?.trim()) {
            def parsed = synagogueParseByday(rule.WKST.toString().toUpperCase())
            if (parsed?.day) wkst = parsed.day as int
        }
        def days = byday ? byday.collect { it.day as int } : [seed.get(Calendar.DAY_OF_WEEK)]
        days = days.sort { a, b -> ((a - wkst + 7) % 7) <=> ((b - wkst + 7) % 7) }
        Calendar week = (Calendar) seed.clone()
        week.add(Calendar.DATE, -((week.get(Calendar.DAY_OF_WEEK) - wkst + 7) % 7))
        boolean stop = false
        for (int w = 0; w < 3000 && !stop; w += interval) {
            for (int day in days) {
                Calendar occ = (Calendar) week.clone()
                occ.add(Calendar.DATE, (w * 7) + ((day - wkst + 7) % 7))
                long at = stamp(occ)
                if (at < startMs) continue
                if (synagogueAddStart(starts, at, count, until, windowEnd) != "ok") { stop = true; break }
            }
        }
    } else if (freq == "MONTHLY" && byday) {
        boolean stop = false
        for (int i = 0; i < 600 && !stop; i += interval) {
            Calendar month = (Calendar) seed.clone()
            month.set(Calendar.DAY_OF_MONTH, 1)
            month.add(Calendar.MONTH, i)
            for (spec in byday) {
                def occs = []
                if ((spec.nth as int) == 0) {
                    Calendar cursor = synagogueMonthWeekday(month, 1, spec.day as int)
                    while (cursor != null && cursor.get(Calendar.MONTH) == month.get(Calendar.MONTH)) {
                        occs << (Calendar) cursor.clone()
                        cursor.add(Calendar.DATE, 7)
                        if (cursor.get(Calendar.MONTH) != month.get(Calendar.MONTH)) break
                    }
                } else {
                    def one = synagogueMonthWeekday(month, spec.nth as int, spec.day as int)
                    if (one) occs << one
                }
                for (occ in occs) {
                    long at = stamp(occ)
                    if (at < startMs) continue
                    if (synagogueAddStart(starts, at, count, until, windowEnd) != "ok") { stop = true; break }
                }
            }
        }
    } else if (freq == "MONTHLY" || freq == "YEARLY") {
        int dom = seed.get(Calendar.DAY_OF_MONTH)
        if (freq == "MONTHLY" && rule?.BYMONTHDAY?.toString()?.trim()) {
            if (!(rule.BYMONTHDAY.toString() ==~ /^-?\d{1,2}$/)) return [error: "This repeat pattern is not supported yet."]
            dom = synagogueInt(rule.BYMONTHDAY, dom)
        }
        int month = seed.get(Calendar.MONTH)
        int cap = freq == "YEARLY" ? 80 : 600
        for (int i = 0; i < cap; i += interval) {
            Calendar occ = (Calendar) seed.clone()
            occ.set(Calendar.DAY_OF_MONTH, 1)
            if (freq == "YEARLY") occ.add(Calendar.YEAR, i)
            else occ.add(Calendar.MONTH, i)
            if (freq == "YEARLY") occ.set(Calendar.MONTH, month)
            int max = occ.getActualMaximum(Calendar.DAY_OF_MONTH)
            int day = dom
            if (day < 0) day = max + day + 1
            if (day < 1 || day > max) continue
            occ.set(Calendar.DAY_OF_MONTH, day)
            long at = stamp(occ)
            if (at < startMs) continue
            if (synagogueAddStart(starts, at, count, until, windowEnd) != "ok") break
        }
    }
    return [starts: starts]
}

def synagogueExpandSeries(Map master, TimeZone hub, long windowStart, long windowEnd, List unsupported) {
    def startInfo = synagogueIcalInstant(master?.DTSTART instanceof Map ? master.DTSTART : [:], hub)
    if (startInfo == null || startInfo.allDay == true) return [allDay: true, instances: []]
    long startMs = startInfo.ms as long
    def zone = startInfo.tz instanceof TimeZone ? startInfo.tz : hub
    long dur = 60L * 60000L
    if (master?.DTEND instanceof Map) {
        def endInfo = synagogueIcalInstant(master.DTEND, hub)
        if (endInfo?.allDay == true) return [allDay: true, instances: []]
        if (endInfo?.ms != null && (endInfo.ms as long) > startMs) dur = (endInfo.ms as long) - startMs
    } else if (master?.DURATION instanceof Map) {
        def parsed = synagogueParseDuration(master.DURATION.value?.toString())
        if (parsed != null) dur = parsed as long
    }
    def title = (master?.SUMMARY?.value?.toString() ?: "Event").trim()
    if (!title) title = "Event"
    def uid = master?.UID?.value?.toString() ?: (title + "|" + startMs)
    boolean cancelled = master?.STATUS?.value?.toString()?.equalsIgnoreCase("CANCELLED")
    def starts = [startMs]
    if (master?.RRULE instanceof Map) {
        def built = synagogueRruleStarts(startMs, synagogueParseRrule(master.RRULE.value?.toString()), zone, windowStart, windowEnd)
        if (built.error) {
            unsupported << [title: title, reason: built.error.toString(), rule: master?.RRULE?.value?.toString() ?: ""]
            return [allDay: false, instances: [], uid: uid]
        }
        starts = built.starts instanceof List ? built.starts : []
    }
    def excluded = []
    def excludedDates = [] as Set
    for (prop in (master?.exdates instanceof List ? master.exdates : [])) {
        for (part in (prop?.value?.toString() ?: "").split(",")) {
            def piece = part?.trim()
            if (!piece) continue
            def at = synagogueIcalInstant([params: prop?.params ?: [:], value: piece], hub)
            if (at?.allDay == true && piece.length() >= 8) excludedDates << (piece.substring(0, 4) + "-" + piece.substring(4, 6) + "-" + piece.substring(6, 8))
            else if (at?.ms != null) excluded << (at.ms as long)
        }
    }
    def instances = []
    for (at in starts) {
        long when = at as long
        if (excluded.any { Math.abs((it as long) - when) < 1000L }) continue
        if (excludedDates.contains(synagogueDateOf(when, zone))) continue
        if (when + dur < windowStart || when > windowEnd) continue
        instances << [uid: uid, title: title, location: synagogueIcalLocation(master), start: when, end: when + dur, cancelled: cancelled]
    }
    return [allDay: false, instances: instances, uid: uid, duration: dur, title: title, cancelled: cancelled]
}

def synagogueParseIcal(String text, TimeZone hub, long nowMs) {
    def masters = []
    def overrides = []
    for (raw in synagogueReadVevents(text)) {
        if (raw["RECURRENCE-ID"]) overrides << raw
        else masters << raw
    }
    def events = []
    def unsupported = []
    long windowStart = nowMs - 36L * 60L * 60L * 1000L
    long windowEnd = nowMs + 90L * 24L * 60L * 60L * 1000L
    for (master in masters) {
        def built = synagogueExpandSeries(master, hub, windowStart, windowEnd, unsupported)
        if (built.allDay == true) continue
        def list = built.instances instanceof List ? built.instances : []
        for (ov in overrides) {
            if ((ov?.UID?.value?.toString() ?: "") != (built.uid?.toString() ?: "")) continue
            def rid = synagogueIcalInstant(ov["RECURRENCE-ID"] instanceof Map ? ov["RECURRENCE-ID"] : [:], hub)
            if (rid?.ms == null) continue
            list = list.findAll { Math.abs((it.start as long) - (rid.ms as long)) >= 1000L }
            def ovStart = synagogueIcalInstant(ov?.DTSTART instanceof Map ? ov.DTSTART : [:], hub)
            if (ovStart?.allDay == true || ovStart?.ms == null) continue
            long start = ovStart.ms as long
            long end = start + ((built.duration ?: 3600000L) as long)
            if (ov?.DTEND instanceof Map) {
                def ovEnd = synagogueIcalInstant(ov.DTEND, hub)
                if (ovEnd?.ms != null && (ovEnd.ms as long) > start) end = ovEnd.ms as long
            }
            if (start > windowEnd || end < windowStart) continue
            def title = (ov?.SUMMARY?.value?.toString() ?: "").trim()
            if (!title) title = built.title?.toString() ?: "Event"
            boolean cancelled = built.cancelled == true || ov?.STATUS?.value?.toString()?.equalsIgnoreCase("CANCELLED")
            def place = synagogueIcalLocation(ov) ?: synagogueIcalLocation(master)
            list << [uid: built.uid, title: title, location: place, start: start, end: end, cancelled: cancelled]
        }
        events.addAll(list)
    }
    events.sort { a, b -> (a.start as long) <=> (b.start as long) }
    if (events.size() > 500) events = events.take(500)
    return [events: events, unsupported: unsupported]
}

def synagogueIngestIcs(Map config, ics, TimeZone tz, long nowMs) {
    def events = []
    def unsupported = []
    def errors = []
    if (!(ics instanceof Map)) return [events: events, unsupported: unsupported, error: ""]
    for (cal in (config?.calendars instanceof List ? config.calendars : [])) {
        def text = ics[cal?.id?.toString()]
        if (text == null) text = ""
        text = text.toString()
        if (!text.trim()) {
            errors << ((cal?.name?.toString() ?: "Calendar") + " could not be read.")
            continue
        }
        if (text.length() > 1000000) text = text.substring(0, 1000000)
        def parsed = synagogueParseIcal(text, tz, nowMs)
        parsed.events.each { ev ->
            ev.calendarId = cal?.id?.toString()
            events << ev
        }
        parsed.unsupported.each { row ->
            row.calendarId = cal?.id?.toString()
            unsupported << row
        }
    }
    return [events: events, unsupported: unsupported, error: errors.join(" ")]
}

def synagogueCuesFor(Map space, String entryId, String entryName, long start, long end, boolean runCues, List warnings) {
    def cues = []
    if (!runCues || !(space?.cues instanceof List)) return cues
    for (cue in space.cues) {
        if (!(cue instanceof Map) || !synagogueApplies(cue, entryId, entryName)) continue
        def control = space?.controls instanceof List ? space.controls.find { it?.id?.toString() == cue.controlId?.toString() } : null
        if (!(control instanceof Map)) continue
        int offset = synagogueInt(cue.offsetMin, 0)
        long at = (cue.anchor?.toString() == "end" ? end : start) + (offset as long) * 60000L
        def built = synagogueCueStates(control, cue)
        if (built.held == true) {
            def which = cue.action?.toString() == "setback" ? "Setback" : "Comfort"
            warnings << ((space?.name ?: "A space") + " " + which + " has no temperature yet.")
            continue
        }
        if (built.incomplete == true) warnings << ((space?.name ?: "A space") + " is missing a temperature for one thermostat.")
        cues << [
            id: cue.id?.toString() ?: "cue",
            at: at,
            label: synagogueCueLabel(control, cue),
            anchor: cue.anchor?.toString() == "end" ? "end" : "start",
            offLike: synagogueOffLike(cue),
            unlock: cue.action?.toString() == "unlock",
            states: built.states,
            suppressed: false
        ]
    }
    return cues
}

def synagogueAppendFeed(List occurrences, List warnings, Map config, Map ctx, Set consumedEvents) {
    def tz = synagogueTzFrom(ctx?.tz)
    long nowMs = synagogueLong(ctx?.now) ?: 0L
    long feedStart = nowMs - 36L * 60L * 60L * 1000L
    long feedEnd = nowMs + 90L * 24L * 60L * 60L * 1000L
    def items = []
    for (booking in (config?.bookings instanceof List ? config.bookings : [])) {
        def date = synagogueDateOnly(booking?.date?.toString())
        def clock = synagogueClock(booking?.start?.toString())
        if (!date || !clock) continue
        long start = synagogueZonedMs(date, clock, tz)
        int minutes = Math.max(5, Math.min(720, synagogueInt(booking?.minutes, 60)))
        long end = start + minutes * 60000L
        if (end < feedStart || start > feedEnd) continue
        items << [
            id: "booking|" + booking?.id?.toString(),
            name: booking?.name?.toString() ?: "Booking",
            entryId: booking?.id?.toString() ?: "booking",
            kind: "booking",
            dayLabel: "Booking",
            spaceId: booking?.spaceId?.toString() ?: "",
            start: start,
            end: end,
            runCues: booking?.runCues != false,
            cancelled: false
        ]
    }
    for (ev in (ctx?.events instanceof List ? ctx.events : [])) {
        long start = synagogueLong(ev?.start) ?: 0L
        long end = synagogueLong(ev?.end) ?: 0L
        if (consumedEvents?.contains(synagogueCalendarEventId(ev))) continue
        def cal = null
        for (candidate in (config?.calendars instanceof List ? config.calendars : [])) {
            if (candidate?.id?.toString() == ev?.calendarId?.toString()) cal = candidate
        }
        def name = ev?.title?.toString() ?: "Event"
        def spaceId = ""
        if (ev?.cancelled != true) {
            if (cal?.bookAll == true && cal?.spaceId?.toString()?.trim()) {
                spaceId = cal.spaceId.toString()
            } else {
                def match = synagogueRuleMatch(ev, config?.titleRules)
                if (match?.ignore == true) continue
                spaceId = match?.spaceId?.toString() ?: ""
                if (match?.name) name = match.name.toString()
            }
        }
        items << [
            id: "ical|" + (ev?.calendarId ?: "") + "|" + (ev?.uid ?: "") + "|" + start,
            name: name,
            entryId: ev?.uid?.toString() ?: "event",
            kind: "calendar",
            dayLabel: "Calendar",
            spaceId: spaceId,
            start: start,
            end: end,
            runCues: ev?.cancelled != true,
            cancelled: ev?.cancelled == true
        ]
    }
    def skipped = [] as Set
    if (config?.skipped instanceof List) config.skipped.each { if (it != null) skipped.add(it.toString()) }
    def overrides = config?.overrides instanceof Map ? config.overrides : [:]
    for (item in items) {
        if ((item.end as long) <= (item.start as long)) continue
        def ov = overrides[item.id.toString()] instanceof Map ? overrides[item.id.toString()] : [:]
        long start = item.start as long
        long end = item.end as long
        if (ov.start) {
            def clock = synagogueClock(ov.start.toString())
            if (clock) {
                long dur = end - start
                start = synagogueZonedMs(synagogueDateOf(start, tz), clock, tz)
                end = start + dur
            }
        }
        if (ov.extendMin != null && ov.extendMin.toString().trim()) end += synagogueInt(ov.extendMin, 0) * 60000L
        boolean cancel = ov.cancel == true || skipped.contains(item.id.toString()) || item.cancelled == true
        def space = synagogueSpaceById(config, item.spaceId?.toString())
        def cues = (!cancel && space) ? synagogueCuesFor(space, item.entryId.toString(), item.name.toString(), start, end, item.runCues == true, warnings) : []
        def warning = (!item.spaceId && item.kind == "calendar" && item.cancelled != true) ? "This event has no space yet." : ""
        occurrences << [
            id: item.id.toString(),
            name: item.name,
            entryId: item.entryId,
            dayId: item.kind,
            dayLabel: item.dayLabel,
            date: synagogueDateOf(start, tz),
            position: "day",
            start: start,
            end: end,
            spaceId: space?.id?.toString() ?: "",
            spaceName: space?.name?.toString() ?: "",
            estimated: false,
            skipped: cancel,
            cancelled: item.cancelled == true || ov.cancel == true,
            changed: (ov.start || (ov.extendMin != null && ov.extendMin.toString().trim())) ? true : false,
            dateChanged: false,
            replaced: "",
            stayOn: false,
            kind: item.kind,
            cues: cues,
            warning: warning
        ]
    }
    for (row in (ctx?.unsupported instanceof List ? ctx.unsupported : [])) {
        def title = row?.title?.toString() ?: "An event"
        warnings << (title + ": " + (row?.reason?.toString() ?: "That repeat is not supported."))
    }
}

def synagogueCalendarMiss(String name, String id, List prior) {
    def hasPrior = prior?.any { it?.calendarId?.toString() == id }
    if (!hasPrior) return name + " could not be reached."
    long priorAt = synagogueLong(state?.ical?.fetchedAt) ?: 0L
    if (!priorAt) return name + " could not be reached. The last copy is still in use."
    long mins = Math.max(1L, ((now() - priorAt) / 60000L) as long)
    def ago = mins < 90L ? (mins + " minutes ago") : (Math.max(1L, (mins / 60L) as long) + " hours ago")
    return name + " could not be reached. Using events from " + ago + "."
}

def synagogueSeedHoliday(Map config) {
    try {
        def incoming = parent?.synagogueHolidayDefaults()
        if (!(incoming instanceof Map)) return
        if (incoming.candleMin != null) config.settings.candleMin = synagogueInt(incoming.candleMin, 18)
        if (incoming.havdalahMinutes != null) config.settings.havdalahMinutes = synagogueInt(incoming.havdalahMinutes, 50)
        if (incoming.containsKey("israel")) config.settings.israel = incoming.israel == true
    } catch (e) {}
}

def synagogueStoreFar(String date, Map times) {
    if (!date || !(times instanceof Map) || times.sunset == null) return
    synagogueEnsureState()
    def hebcal = state.hebcal instanceof Map ? synagogueCopy(state.hebcal) : [zmanim: [:], flags: [:], fetchedAt: 0, error: "", query: "", extra: [:]]
    if (!(hebcal.extra instanceof Map)) hebcal.extra = [:]
    if (!(hebcal.zmanim instanceof Map)) hebcal.zmanim = [:]
    hebcal.extra[date] = [at: now(), times: times]
    def ranked = []
    hebcal.extra.each { key, row ->
        long at = synagogueLong(row?.at) ?: 0L
        if (at <= 0L || now() - at > 3L * 24L * 60L * 60L * 1000L) return
        ranked << [date: key.toString(), at: at, row: row]
    }
    ranked.sort { a, b -> (b.at as long) <=> (a.at as long) }
    def kept = [:]
    ranked.take(8).each { kept[it.date] = it.row }
    hebcal.extra = kept
    hebcal.zmanim[date] = times
    state.hebcal = hebcal
}

def synagogueMergeExtraZmanim(Map ctx) {
    def extra = state?.hebcal?.extra
    if (!(extra instanceof Map) || !(ctx instanceof Map)) return
    if (!(ctx.zmanim instanceof Map)) ctx.zmanim = [:]
    extra.each { date, row ->
        long at = synagogueLong(row?.at) ?: 0L
        if (at > 0L && now() - at <= 3L * 24L * 60L * 60L * 1000L && row?.times instanceof Map) ctx.zmanim[date.toString()] = row.times
    }
}

def synagogueFetchFarZman(Map body) {
    synagogueEnsureState()
    def date = synagogueDateOnly(body?.date?.toString())
    if (!date) return [ok: false, error: "Choose a date."]
    def have = state.hebcal?.zmanim instanceof Map ? state.hebcal.zmanim[date] : null
    if (have instanceof Map && have.sunset != null) return [ok: true, date: date, zmanim: have]
    def place = synagogueHubPlace()
    def tz = place.tz ?: synagogueHubTz()
    def row = [:]
    if (!synagogueLocationProblem()) {
        try {
            String geo = synagogueCoordsOk(place) ? "geo=pos&latitude=${place.lat}&longitude=${place.lon}&tzid=${java.net.URLEncoder.encode(tz.getID(), 'UTF-8')}" : "geo=zip&zip=${place.zip}"
            httpGet([uri: "https://www.hebcal.com/zmanim?cfg=json&${geo}&date=${date}", timeout: 20]) { resp ->
                if (resp?.status == 200) {
                    def parsed = synagogueParseZmanim(resp.data instanceof Map ? resp.data : [:])
                    if (parsed[date] instanceof Map) row = parsed[date]
                }
            }
        } catch (e) {
            log.warn "mDash Synagogue: a far date could not be loaded"
        }
    }
    if (!(row instanceof Map) || row.sunset == null) return [ok: false, error: "Could not load times for that date."]
    synagogueStoreFar(date, row)
    return [ok: true, date: date, zmanim: row]
}

def synagogueCheckCalendar(Map body, ics) {
    def cal = body?.calendar instanceof Map ? body.calendar : [:]
    def id = cal.id?.toString() ?: ""
    def text = ""
    if (ics instanceof Map && id && ics[id] != null) text = ics[id].toString()
    if (!text.trim() && cal.url) {
        def norm = synagogueNormalizeCalendarUrl(cal.url.toString())
        if (norm.ok != true) return norm
        def box = [text: "", failed: false]
        try {
            httpGet([uri: norm.url, timeout: 30]) { resp ->
                def rendered = resp?.data?.toString() ?: ""
                if (rendered.contains("BEGIN:VCALENDAR")) box.text = rendered
            }
        } catch (e) {
            box.failed = true
            log.warn "mDash Synagogue: a calendar could not be reached"
        }
        if (box.failed || !box.text?.trim()) return [ok: false, error: "Google could not be reached."]
        text = box.text
    }
    def events = []
    def unsupported = []
    if (text.trim()) {
        if (text.length() > 1000000) text = text.substring(0, 1000000)
        if (!text.toUpperCase().contains("BEGIN:VCALENDAR")) return [ok: false, error: "That address needs the secret iCal link, not the web page link."]
        def parsed = synagogueParseIcal(text, synagogueHubTz(), now())
        events = parsed.events instanceof List ? parsed.events : []
        unsupported = parsed.unsupported instanceof List ? parsed.unsupported : []
    } else if (id && state?.ical?.events instanceof List) {
        events = state.ical.events.findAll { it?.calendarId?.toString() == id }
        unsupported = (state?.ical?.unsupported instanceof List ? state.ical.unsupported : []).findAll { it?.calendarId?.toString() == id }
    } else {
        return [ok: false, error: "That address needs the secret iCal link, not the web page link."]
    }
    def groups = [:]
    int count = 0
    for (ev in events) {
        if (ev?.cancelled == true) continue
        count++
        def title = ev?.title?.toString()?.trim() ?: "Event"
        if (!(groups[title] instanceof Map)) groups[title] = [title: title, count: 0, starts: []]
        groups[title].count = (groups[title].count as int) + 1
        groups[title].starts << ev.start
    }
    def list = []
    groups.each { key, group ->
        def starts = (group.starts instanceof List ? group.starts : []).sort()
        list << [title: group.title, count: group.count, next: starts.take(3)]
    }
    list.sort { a, b -> (b.count as int) <=> (a.count as int) }
    return [ok: true, count: count, groups: list, unsupported: unsupported]
}

def synagogueFetchCalendars(boolean force) {
    synagogueEnsureState()
    if (!force && state.ical?.fetchedAt) {
        long age = now() - (synagogueLong(state.ical.fetchedAt) ?: 0L)
        if (age >= 0L && age < 30L * 60L * 1000L) return
    }
    def calendars = state.config?.calendars instanceof List ? state.config.calendars : []
    if (!calendars) {
        state.ical = [events: [], unsupported: [], fetchedAt: now(), error: ""]
        return
    }
    def events = []
    def unsupported = []
    def errors = []
    def prior = state.ical?.events instanceof List ? state.ical.events : []
    for (cal in calendars) {
        def name = cal?.name?.toString() ?: "Calendar"
        def id = cal?.id?.toString()
        def keepPrior = {
            prior.findAll { it?.calendarId?.toString() == id }.each { events << it }
        }
        def norm = synagogueNormalizeCalendarUrl(cal?.url?.toString())
        if (norm.ok != true) {
            errors << (name + " needs the secret iCal link, not a web page link.")
            keepPrior()
            continue
        }
        def box = [text: "", status: 0, failed: false]
        try {
            httpGet([uri: norm.url, timeout: 30]) { resp ->
                box.status = resp?.status ?: 0
                def data = resp?.data
                def rendered = data?.toString() ?: ""
                if (data instanceof CharSequence || rendered.contains("BEGIN:VCALENDAR")) box.text = rendered
            }
        } catch (e) {
            box.failed = true
            log.warn "mDash Synagogue: a calendar could not be reached"
        }
        if (box.failed || box.status != 200 || !box.text?.trim()) {
            errors << synagogueCalendarMiss(name, id, prior)
            keepPrior()
            continue
        }
        def text = box.text
        if (text.length() > 1000000) text = text.substring(0, 1000000)
        if (!text.toUpperCase().contains("BEGIN:VCALENDAR")) {
            errors << (name + " needs the secret iCal link, not a web page link. The last copy is still in use.")
            keepPrior()
            continue
        }
        def parsed = synagogueParseIcal(text, synagogueHubTz(), now())
        parsed.events.each { ev ->
            ev.calendarId = cal?.id?.toString()
            events << ev
        }
        parsed.unsupported.each { row ->
            row.calendarId = cal?.id?.toString()
            unsupported << row
        }
    }
    if (events.size() > 500) {
        events.sort { a, b -> (synagogueLong(a.start) ?: 0L) <=> (synagogueLong(b.start) ?: 0L) }
        events = events.take(500)
    }
    state.ical = [events: events, unsupported: unsupported, fetchedAt: now(), error: errors.join(" ")]
    log.info "mDash Synagogue: calendars updated"
}

def synagogueApplyStayOn(List occurrences, Map config) {
    def bySpace = [:]
    def gapOf = [:]
    for (space in (config?.spaces instanceof List ? config.spaces : [])) gapOf[space?.id?.toString()] = synagogueInt(space?.stayOnGapMin, 45)
    for (occ in occurrences) {
        if (occ.skipped == true) continue
        def key = occ.spaceId?.toString() ?: ""
        if (!key) continue
        if (!(bySpace[key] instanceof List)) bySpace[key] = []
        bySpace[key] << occ
    }
    bySpace.each { spaceId, list ->
        list.sort { a, b -> (a.start as long) <=> (b.start as long) }
        long gap = (gapOf[spaceId] ?: 45) as long
        gap = gap * 60000L
        for (int i = 0; i < list.size() - 1; i++) {
            def curr = list[i]
            def next = list[i + 1]
            if ((next.start as long) <= (curr.end as long) + gap && (next.start as long) > (curr.start as long)) {
                curr.stayOn = true
                for (cue in curr.cues) {
                    if (cue.offLike == true && cue.anchor == "end") cue.suppressed = true
                }
            }
        }
    }
}

def synagogueActionsFrom(List occurrences) {
    def actions = []
    for (occ in occurrences) {
        if (occ.skipped == true) continue
        for (cue in (occ.cues instanceof List ? occ.cues : [])) {
            actions << [
                id: occ.id + "|" + cue.id + "|" + cue.anchor,
                at: cue.at,
                occId: occ.id,
                occName: occ.name,
                occStart: occ.start,
                occEnd: occ.end,
                anchor: cue.anchor,
                unlock: cue.unlock == true,
                suppressed: cue.suppressed == true,
                label: cue.label,
                states: cue.states ?: []
            ]
        }
    }
    actions.sort { a, b -> (a.at as long) <=> (b.at as long) }
    return actions
}

def synagogueDue(List actions, long nowMs, Map fired) {
    def due = []
    def started = [] as Set
    for (action in (actions ?: [])) {
        if (action.anchor?.toString() == "end") continue
        def id = action.id?.toString()
        if (id && fired instanceof Map && fired.containsKey(id)) started.add(action.occId?.toString())
    }
    for (action in (actions ?: [])) {
        if (action.suppressed == true) continue
        def id = action.id?.toString()
        if (!id || (fired instanceof Map && fired.containsKey(id))) continue
        long at = synagogueLong(action.at) ?: 0L
        if (at > nowMs) continue
        long end = synagogueLong(action.occEnd) ?: at
        boolean startAnchored = action.anchor?.toString() != "end"
        if (action.unlock == true && nowMs > at + 60000L) continue
        if (startAnchored) {
            if (nowMs < end) due << action
            continue
        }
        if (nowMs <= end + 30L * 60000L) {
            due << action
            continue
        }
        if (started.contains(action.occId?.toString())) due << action
    }
    return due
}

def synagogueNextAction(List actions, long nowMs, Map fired) {
    def next = null
    for (action in (actions ?: [])) {
        if (action.suppressed == true) continue
        def id = action.id?.toString()
        if (!id || (fired instanceof Map && fired.containsKey(id))) continue
        long at = synagogueLong(action.at) ?: 0L
        if (at <= nowMs + 3000L) continue
        if (next == null || at < (synagogueLong(next.at) ?: Long.MAX_VALUE)) next = action
    }
    return next
}

def synagogueQuietAt(long nowMs, Map ctx, Map config) {
    def tz = synagogueTzFrom(ctx?.tz)
    def flags = ctx?.flags instanceof Map ? ctx.flags : [:]
    def dates = [] as Set
    flags.keySet().each { dates.add(it.toString()) }
    def today = synagogueDateOf(nowMs, tz)
    for (int i = -2; i <= 3; i++) dates.add(synagogueAddDays(today, i, tz))
    for (date in dates.sort()) {
        def flag = flags[date] instanceof Map ? flags[date] : [:]
        boolean startsHoly = flag.yomTov || synagogueDow(date, tz) == Calendar.FRIDAY || flag.candles != null
        if (!startsHoly) continue
        def estimated = [yes: false]
        long candles = synagogueLong(flag.candles) ?: 0L
        if (!flag.candles) {
            if (!(flag.yomTov || synagogueDow(date, tz) == Calendar.FRIDAY)) continue
            def sunset = synagogueZmanAt("sunset", date, config, ctx, estimated)
            if (sunset == null) continue
            candles = sunset - synagogueInt(config?.settings?.candleMin, 18) * 60000L
        }
        Long hav = null
        for (int i = 0; i <= 3; i++) {
            def later = synagogueAddDays(date, i, tz)
            def laterFlag = flags[later] instanceof Map ? flags[later] : [:]
            def candidate = synagogueLong(laterFlag.havdalah)
            if (candidate != null && candidate > candles) { hav = candidate; break }
        }
        if (hav == null) {
            for (int i = 1; i <= 3; i++) {
                def later = synagogueAddDays(date, i, tz)
                int dow = synagogueDow(later, tz)
                def laterFlag = flags[later] instanceof Map ? flags[later] : [:]
                if (dow == Calendar.SATURDAY || laterFlag.yomTov) {
                    def sunset = synagogueZmanAt("sunset", later, config, ctx, estimated)
                    if (sunset != null) hav = sunset + synagogueInt(config?.settings?.havdalahMinutes, 50) * 60000L
                }
            }
        }
        if (hav != null && nowMs >= candles && nowMs < hav) return true
    }
    return false
}

def synagoguePhrase(Map day) {
    def source = day?.source?.toString() ?: "unset"
    def follows = synagogueDayLabel(day?.follows?.toString() ?: "shabbat")
    if (source == "unset") return "not set up"
    if (source == "none") return "no services"
    if (source == "normal") return "normal weekday"
    if (source == "same") return "uses " + follows
    if (source == "changes") {
        int n = 0
        if (day?.changes?.disabled instanceof List) n += day.changes.disabled.size()
        if (day?.changes?.patched instanceof Map) n += day.changes.patched.size()
        if (day?.changes?.added instanceof List) n += day.changes.added.size()
        return n ? ("uses " + follows + ", " + n + " changes") : ("uses " + follows)
    }
    if (source == "copy") return day?.follows ? ("based on " + follows) : "own schedule"
    int count = day?.entries instanceof List ? day.entries.size() : 0
    return count ? ("own schedule · " + count + " services") : "own schedule"
}

def synagogueMenu(Map config, Map ctx) {
    def tz = synagogueTzFrom(ctx?.tz)
    long nowMs = synagogueLong(ctx?.now) ?: 0L
    def today = synagogueDateOf(nowMs, tz)
    def flags = ctx?.flags instanceof Map ? ctx.flags : [:]
    def catalog = synagogueDayCatalog()
    def wanted = [] as Set
    for (row in catalog) wanted.add(row.id)
    def nextById = [:]
    int epoch = synagogueEpochDay(today)
    for (int i = 0; i < 400 && nextById.size() < wanted.size(); i++) {
        def date = synagogueDateFromEpoch(epoch + i)
        def id = synagogueWinner(date, flags, tz)
        if (wanted.contains(id) && !nextById.containsKey(id)) nextById[id] = date
    }
    def menu = []
    for (row in catalog) {
        def day = config?.days?.get(row.id) instanceof Map ? config.days[row.id] : synagogueDefaultDay(row.id)
        menu << [id: row.id, label: row.label, he: row.he, group: row.group, next: nextById[row.id] ?: "", phrase: synagoguePhrase(day), source: day.source?.toString() ?: "unset", follows: day.follows?.toString() ?: ""]
    }
    return menu
}

def synagogueNudges(List menu, long nowMs, TimeZone tz) {
    def out = []
    def today = synagogueDateOf(nowMs, tz)
    int todayEpoch = synagogueEpochDay(today)
    for (row in menu) {
        if (row.source != "unset" || !row.next) continue
        int days = synagogueEpochDay(row.next.toString()) - todayEpoch
        if (days >= 0 && days <= 30) out << [id: row.id, label: row.label, inDays: days, next: row.next]
    }
    return out
}

def synagogueResultFor(String occId, history) {
    if (!occId || !(history instanceof List)) return ""
    def hit = ""
    for (item in history) {
        if (item?.occId?.toString() != occId) continue
        def status = item?.status?.toString() ?: ""
        if (status in ["ran", "late", "failed"]) hit = status
    }
    return hit
}

def synagogueAgendaSpan(value) {
    int n = synagogueInt(value, 7)
    if (n == 14 || n == 21) return n
    return 7
}

def synagogueImpactMap(Map config) {
    def impact = [:]
    for (row in synagogueDayCatalog()) impact[row.id] = synagogueImpact(row.id, config)
    return impact
}

def synagogueImpact(String dayId, Map config) {
    def out = []
    for (row in synagogueDayCatalog()) {
        if (row.id == dayId) continue
        def seen = [] as Set
        def current = row.id
        int guard = 0
        boolean hit = false
        while (current && guard < 10) {
            if (!seen.add(current)) break
            def day = config?.days?.get(current)
            def source = day?.source?.toString()
            if (source != "same" && source != "changes") break
            def follows = day?.follows?.toString() ?: "shabbat"
            if (follows == dayId) { hit = true; break }
            current = follows
            guard++
        }
        if (hit) out << [id: row.id, label: row.label]
    }
    return out
}

def synagogueProject(Map config, Map ctx, Map built = null) {
    if (!(built instanceof Map)) built = synagogueExpand(config ?: synagogueDefaultConfig(), ctx ?: [:])
    def tz = synagogueTzFrom(ctx?.tz)
    long nowMs = synagogueLong(ctx?.now) ?: 0L
    def menu = synagogueMenu(config, ctx)
    def names = ctx?.scheduleNames instanceof Map ? ctx.scheduleNames : [:]
    def agenda = []
    for (occ in built.occurrences) {
        def copy = new LinkedHashMap(occ)
        def conflict = []
        for (cue in (copy.cues instanceof List ? copy.cues : [])) {
            for (st in (cue.states instanceof List ? cue.states : [])) {
                def name = names[st?.id?.toString()]
                if (name && !conflict.contains(name.toString())) conflict << name.toString()
            }
        }
        if (conflict) copy.warning = "Also changed by " + conflict.join(", ") + "."
        copy.result = synagogueResultFor(copy.id?.toString(), ctx?.history)
        agenda << copy
    }
    def feed = []
    for (occ in built.occurrences) {
        if (occ.kind != "booking" && occ.kind != "calendar") continue
        feed << [id: occ.id, name: occ.name, start: occ.start, end: occ.end, date: occ.date, spaceId: occ.spaceId, spaceName: occ.spaceName, kind: occ.kind, warning: occ.warning ?: "", cancelled: occ.cancelled == true, skipped: occ.skipped == true]
    }
    feed.sort { a, b -> (a.start as long) <=> (b.start as long) }
    if (feed.size() > 40) feed = feed.take(40)
    return [apiVersion: synagogueApiVersion(), occurrences: agenda, warnings: built.warnings, actions: built.actions, menu: menu, nudges: synagogueNudges(menu, nowMs, tz), feed: feed, unsupported: ctx?.unsupported instanceof List ? ctx.unsupported : []]
}

def synagogueNormalizeEntry(Map raw) {
    if (!(raw instanceof Map)) return null
    def name = raw.name?.toString()?.trim()
    if (!name) return null
    def start = synagogueNormalizeStart(raw.start instanceof Map ? raw.start : [:])
    def end = raw.end instanceof Map ? synagogueCopy(raw.end) : [type: "duration", minutes: 60]
    int offsetOk = 1
    return [
        id: raw.id?.toString()?.trim() ?: synagogueNewId("en"),
        name: name,
        spaceId: raw.spaceId?.toString() ?: "",
        position: raw.position?.toString() == "evening" ? "evening" : "day",
        start: start,
        end: end,
        roundTo: synagogueInt(raw.roundTo, 0) == 5 ? 5 : 0,
        notBefore: synagogueClock(raw.notBefore?.toString()),
        notAfter: synagogueClock(raw.notAfter?.toString()),
        laterDays: raw.laterDays == false ? false : true,
        laterEvenings: raw.laterEvenings == false ? false : true,
        runCues: raw.runCues == false ? false : true,
        extraCues: raw.extraCues instanceof List ? synagogueNormalizeCues(raw.extraCues) : []
    ]
}

def synagogueNormalizeCues(List raw) {
    def cues = []
    for (cue in (raw ?: [])) {
        if (!(cue instanceof Map)) continue
        int offset = synagogueInt(cue.offsetMin, 0)
        if (offset < -360) offset = -360
        if (offset > 180) offset = 180
        cues << [
            id: cue.id?.toString()?.trim() ?: synagogueNewId("cu"),
            anchor: cue.anchor?.toString() == "end" ? "end" : "start",
            offsetMin: offset,
            controlId: cue.controlId?.toString() ?: "",
            action: cue.action?.toString() ?: "on",
            level: (cue.level == null || cue.level.toString().trim() == "") ? null : synagogueInt(cue.level, 100),
            appliesTo: cue.appliesTo instanceof List ? cue.appliesTo.collect { it?.toString() }.findAll { it } : []
        ]
    }
    return cues
}

def synagogueNormalizeSpace(Map raw) {
    if (!(raw instanceof Map)) return null
    def name = raw.name?.toString()?.trim()
    if (!name) return null
    def controls = []
    for (control in (raw.controls instanceof List ? raw.controls : [])) {
        if (!(control instanceof Map)) continue
        def devices = []
        for (device in (control.devices instanceof List ? control.devices : [])) {
            def id = device instanceof Map ? device.id?.toString() : device?.toString()
            if (!id) continue
            def stored = [id: id, dimmer: device instanceof Map && (device.dimmer == true || device.dimmer?.toString() == "true")]
            def deviceName = device instanceof Map ? device.name?.toString()?.trim() : ""
            if (deviceName) stored.name = deviceName
            devices << stored
        }
        controls << [
            id: control.id?.toString()?.trim() ?: synagogueNewId("ct"),
            name: control.name?.toString()?.trim() ?: "Control",
            kind: control.kind?.toString() ?: "light",
            devices: devices,
            comfort: control.comfort instanceof Map ? synagogueCopy(control.comfort) : [:],
            setback: control.setback instanceof Map ? synagogueCopy(control.setback) : [:]
        ]
    }
    return [
        id: raw.id?.toString()?.trim() ?: synagogueNewId("sp"),
        name: name,
        stayOnGapMin: Math.max(0, Math.min(180, synagogueInt(raw.stayOnGapMin, 45))),
        controls: controls,
        cues: synagogueNormalizeCues(raw.cues instanceof List ? raw.cues : []).findAll { cue ->
            controls.any { it.id?.toString() == cue?.controlId?.toString() }
        }
    ]
}

def synagogueNewId(String prefix) {
    return prefix + "-" + System.currentTimeMillis() + "-" + Math.abs(new Random().nextInt() % 100000)
}

def synagogueEntryNames(Map day) {
    def names = [:]
    for (entry in (day?.entries instanceof List ? day.entries : [])) {
        if (entry?.id && entry?.name) names[entry.id.toString()] = entry.name.toString()
    }
    if (day?.changes?.patched instanceof Map) {
        day.changes.patched.each { key, entry ->
            if (entry instanceof Map && entry.name) names[key.toString()] = entry.name.toString()
        }
    }
    for (entry in (day?.changes?.added instanceof List ? day.changes.added : [])) {
        if (entry?.id && entry?.name) names[entry.id.toString()] = entry.name.toString()
    }
    return names
}

def synagogueRenameServices(Map config, Map before, Map after) {
    if (!(before instanceof Map) || !(after instanceof Map)) return
    after.each { id, name ->
        def old = before[id]?.toString()
        def next = name?.toString()
        if (!old || !next || old == next) return
        for (space in (config?.spaces instanceof List ? config.spaces : [])) {
            for (cue in (space?.cues instanceof List ? space.cues : [])) {
                if (!(cue?.appliesTo instanceof List)) continue
                cue.appliesTo = cue.appliesTo.collect { it?.toString() == old ? next : it }
            }
        }
    }
}

def synagogueSpaceUsers(Map config, String id) {
    if (!id) return []
    def names = []
    def push = { entry ->
        if (entry instanceof Map && entry.spaceId?.toString() == id && entry.name) names << entry.name.toString()
    }
    if (config?.days instanceof Map) {
        config.days.each { key, day ->
            if (!(day instanceof Map)) return
            (day.entries instanceof List ? day.entries : []).each { push(it) }
            (day.changes?.added instanceof List ? day.changes.added : []).each { push(it) }
            if (day.changes?.patched instanceof Map) day.changes.patched.each { k, v -> push(v) }
        }
    }
    if (config?.dateOverrides instanceof Map) {
        config.dateOverrides.each { date, entries ->
            if (entries instanceof List) entries.each { push(it) }
        }
    }
    for (rule in (config?.titleRules instanceof List ? config.titleRules : [])) {
        if (rule?.spaceId?.toString() == id) names << ("“" + (rule.contains ?: "a title") + "”")
    }
    for (booking in (config?.bookings instanceof List ? config.bookings : [])) {
        if (booking?.spaceId?.toString() == id && booking?.name) names << booking.name.toString()
    }
    for (cal in (config?.calendars instanceof List ? config.calendars : [])) {
        if (cal?.bookAll == true && cal?.spaceId?.toString() == id) names << (cal.name?.toString() ?: "A calendar")
    }
    return names.unique()
}

def synagogueApply(Map config, Map body) {
    def next = config instanceof Map ? synagogueCopy(config) : synagogueDefaultConfig()
    if (!(next.days instanceof Map)) next.days = synagogueDefaultConfig().days
    if (!(next.spaces instanceof List)) next.spaces = []
    if (!(next.settings instanceof Map)) next.settings = synagogueDefaultSettings()
    if (!(next.dateOverrides instanceof Map)) next.dateOverrides = [:]
    if (!(next.skipped instanceof List)) next.skipped = []
    if (!(next.overrides instanceof Map)) next.overrides = [:]
    if (!(next.calendars instanceof List)) next.calendars = []
    if (!(next.titleRules instanceof List)) next.titleRules = []
    if (!(next.bookings instanceof List)) next.bookings = []
    def op = body?.op?.toString() ?: ""
    if (op == "settings") {
        def incoming = body.settings instanceof Map ? body.settings : [:]
        ["paused", "israel", "candleMin", "havdalahMinutes", "nightfall", "heldModes", "setupDone"].each { key ->
            if (incoming.containsKey(key)) next.settings[key] = incoming[key]
        }
        def night = next.settings.nightfall?.toString()
        if (!(night in ["tzeit42min", "tzeit50min", "tzeit72min", "tzeit85deg"])) next.settings.nightfall = "tzeit50min"
    } else if (op == "pause") {
        next.settings.paused = body.paused == true
    } else if (op == "space") {
        def space = synagogueNormalizeSpace(body.space instanceof Map ? body.space : [:])
        if (!space) return [ok: false, error: "Name the space."]
        def list = []
        boolean found = false
        for (existing in next.spaces) {
            if (existing?.id?.toString() == space.id) { list << space; found = true }
            else list << existing
        }
        if (!found) list << space
        next.spaces = list
    } else if (op == "deleteSpace") {
        def id = body.id?.toString()
        def space = (next.spaces ?: []).find { it?.id?.toString() == id }
        def users = synagogueSpaceUsers(next, id)
        if (users) {
            def shown = users.take(3).join(", ")
            def more = users.size() > 3 ? " and " + (users.size() - 3) + " more" : ""
            return [ok: false, error: (space?.name ?: "This space") + " is still used by " + shown + more + "."]
        }
        next.spaces = (next.spaces ?: []).findAll { it?.id?.toString() != id }
    } else if (op == "day") {
        def id = body.dayId?.toString()
        if (!id) return [ok: false, error: "Choose a day."]
        def day = body.day instanceof Map ? synagogueCopy(body.day) : [:]
        day.entries = (day.entries instanceof List ? day.entries : []).collect { synagogueNormalizeEntry(it instanceof Map ? it : [:]) }.findAll { it }
        if (!(day.changes instanceof Map)) day.changes = synagogueEmptyChanges()
        if (day.changes.added instanceof List) {
            day.changes.added = day.changes.added.collect { synagogueNormalizeEntry(it instanceof Map ? it : [:]) }.findAll { it }
        }
        def beforeNames = synagogueEntryNames(next.days[id] instanceof Map ? next.days[id] : [:])
        next.days[id] = day
        synagogueRenameServices(next, beforeNames, synagogueEntryNames(day))
        def cycle = synagogueCycleError(id, next)
        if (cycle) return [ok: false, error: cycle]
    } else if (op == "bulk") {
        def ids = body.ids instanceof List ? body.ids : []
        for (id in ids) {
            def key = id?.toString()
            if (!key) continue
            def day = next.days[key] instanceof Map ? synagogueCopy(next.days[key]) : synagogueDefaultDay(key)
            day.source = body.source?.toString() ?: "same"
            if (body.follows != null) day.follows = body.follows.toString()
            next.days[key] = day
            def cycle = synagogueCycleError(key, next)
            if (cycle) return [ok: false, error: cycle]
        }
    } else if (op == "yomTovFromShabbat") {
        for (id in synagogueYomTovIds()) {
            def day = next.days[id] instanceof Map ? synagogueCopy(next.days[id]) : synagogueDefaultDay(id)
            day.source = "same"
            day.follows = "shabbat"
            next.days[id] = day
        }
    } else if (op == "skip") {
        def id = body.occurrenceId?.toString()
        if (!id) return [ok: false, error: "Choose a service."]
        def list = next.skipped.collect { it?.toString() }
        if (body.undo == true) list = list.findAll { it != id }
        else if (!list.contains(id)) list << id
        next.skipped = list
    } else if (op == "override") {
        def id = body.occurrenceId?.toString()
        if (!id) return [ok: false, error: "Choose a service."]
        if (body.clear == true) next.overrides.remove(id)
        else {
            def row = next.overrides[id] instanceof Map ? synagogueCopy(next.overrides[id]) : [:]
            if (body.containsKey("cancel")) row.cancel = body.cancel == true
            if (body.containsKey("extendMin")) row.extendMin = synagogueInt(body.extendMin, 0)
            if (body.start) row.start = synagogueClock(body.start.toString())
            if (body.containsKey("durationMin")) row.durationMin = synagogueInt(body.durationMin, 60)
            next.overrides[id] = row
        }
    } else if (op == "dateProgram") {
        def date = synagogueDateOnly(body.date?.toString())
        if (!date) return [ok: false, error: "Choose a date."]
        if (body.clear == true) next.dateOverrides.remove(date)
        else {
            next.dateOverrides[date] = (body.entries instanceof List ? body.entries : []).collect { synagogueNormalizeEntry(it instanceof Map ? it : [:]) }.findAll { it }
        }
    } else if (op == "setup") {
        def space = synagogueNormalizeSpace(body.space instanceof Map ? body.space : [:])
        if (!space) return [ok: false, error: "Name the space."]
        next.spaces = [space]
        if (body.week instanceof Map) {
            body.week.each { key, value ->
                def id = key?.toString()
                if (!(value instanceof Map)) return
                def day = next.days[id] instanceof Map ? synagogueCopy(next.days[id]) : synagogueDefaultDay(id)
                day.source = value.source?.toString() ?: "own"
                day.follows = value.follows?.toString() ?: ""
                day.entries = (value.entries instanceof List ? value.entries : []).collect { synagogueNormalizeEntry(it instanceof Map ? it : [:]) }.findAll { it }
                next.days[id] = day
            }
        }
        if (body.yomTov == true) {
            for (id in synagogueYomTovIds()) {
                def day = synagogueCopy(next.days[id])
                day.source = "same"
                day.follows = "shabbat"
                next.days[id] = day
            }
        }
        next.settings.setupDone = true
    } else if (op == "calendar") {
        def raw = body.calendar instanceof Map ? body.calendar : [:]
        def name = raw.name?.toString()?.trim()
        if (!name) return [ok: false, error: "Name the calendar."]
        def id = raw.id?.toString()?.trim() ?: synagogueNewId("cal")
        def existing = next.calendars.find { it?.id?.toString() == id }
        def url = raw.url?.toString()?.trim()
        if (!url && existing?.url) url = existing.url.toString()
        def norm = synagogueNormalizeCalendarUrl(url)
        if (norm.ok != true) return norm
        boolean bookAll = raw.containsKey("bookAll") ? raw.bookAll == true : existing?.bookAll == true
        def bookSpace = raw.containsKey("spaceId") ? raw.spaceId?.toString()?.trim() : existing?.spaceId?.toString()
        def row = [id: id, name: name, url: norm.url, bookAll: bookAll, spaceId: bookAll ? (bookSpace ?: "") : ""]
        def list = []
        boolean found = false
        for (cal in next.calendars) {
            if (cal?.id?.toString() == id) { list << row; found = true }
            else list << cal
        }
        if (!found) list << row
        next.calendars = list
    } else if (op == "deleteCalendar") {
        def id = body.id?.toString()
        next.calendars = (next.calendars ?: []).findAll { it?.id?.toString() != id }
    } else if (op == "titleRule") {
        def raw = body.rule instanceof Map ? body.rule : [:]
        def contains = raw.contains?.toString()?.trim()
        def spaceId = raw.spaceId?.toString()?.trim()
        if (!contains) return [ok: false, error: "Say what the title contains."]
        if (raw.ignore != true && !spaceId) return [ok: false, error: "Choose a space."]
        def id = raw.id?.toString()?.trim() ?: synagogueNewId("rule")
        def row = [
            id: id,
            contains: contains,
            spaceId: raw.ignore == true ? "" : spaceId,
            field: raw.field?.toString() == "location" ? "location" : "title",
            name: raw.name?.toString()?.trim() ?: "",
            ignore: raw.ignore == true
        ]
        def list = []
        boolean found = false
        for (rule in next.titleRules) {
            if (rule?.id?.toString() == id) { list << row; found = true }
            else list << rule
        }
        if (!found) list << row
        next.titleRules = list
    } else if (op == "deleteTitleRule") {
        def id = body.id?.toString()
        next.titleRules = (next.titleRules ?: []).findAll { it?.id?.toString() != id }
    } else if (op == "booking") {
        def raw = body.booking instanceof Map ? body.booking : [:]
        def name = raw.name?.toString()?.trim()
        def date = synagogueDateOnly(raw.date?.toString())
        def start = synagogueClock(raw.start?.toString())
        def spaceId = raw.spaceId?.toString()?.trim()
        if (!name) return [ok: false, error: "Name the booking."]
        if (!date || !start) return [ok: false, error: "Choose a date and a start time."]
        if (!spaceId) return [ok: false, error: "Choose a space."]
        int minutes = Math.max(5, Math.min(720, synagogueInt(raw.minutes, 60)))
        def id = raw.id?.toString()?.trim() ?: synagogueNewId("book")
        def row = [id: id, name: name, spaceId: spaceId, date: date, start: start, minutes: minutes, runCues: raw.runCues != false]
        def list = []
        boolean found = false
        for (booking in next.bookings) {
            if (booking?.id?.toString() == id) { list << row; found = true }
            else list << booking
        }
        if (!found) list << row
        next.bookings = list
    } else if (op == "deleteBooking") {
        def id = body.id?.toString()
        next.bookings = (next.bookings ?: []).findAll { it?.id?.toString() != id }
    } else {
        return [ok: false, error: "Unknown save."]
    }
    return [ok: true, config: next]
}

def synagogueContext(boolean withNames = false) {
    synagogueEnsureState()
    def hebcal = state.hebcal instanceof Map ? state.hebcal : [:]
    def ical = state.ical instanceof Map ? state.ical : [:]
    return [
        tz: synagogueHubTz(),
        now: now(),
        zmanim: hebcal.zmanim instanceof Map ? hebcal.zmanim : [:],
        flags: hebcal.flags instanceof Map ? hebcal.flags : [:],
        sun: [:],
        scheduleNames: withNames ? synagogueParentScheduleNames() : [:],
        horizon: 21,
        history: state.runtime?.history instanceof List ? state.runtime.history : [],
        events: ical.events instanceof List ? ical.events : [],
        unsupported: ical.unsupported instanceof List ? ical.unsupported : [],
        calendarError: ical.error?.toString() ?: ""
    ]
}

def synagogueParentScheduleNames() {
    try {
        def names = parent?.synagogueScheduleNames()
        if (names instanceof Map) return names
    } catch (e) {}
    return [:]
}

def synagogueModeHeld() {
    def modes = state.config?.settings?.heldModes
    if (!(modes instanceof List) || !modes) return false
    def current = ""
    try { current = location?.mode?.toString() ?: "" } catch (e) {}
    return modes.collect { it?.toString() }.contains(current)
}

def synagogueRemember(String text, String reason, String occId, String status) {
    def rt = synagogueCopy(state.runtime)
    def history = rt.history instanceof List ? rt.history : []
    history << [at: now(), text: text, reason: reason ?: "", occId: occId ?: "", status: status ?: ""]
    def cutoff = now() - 7L * 24 * 60 * 60 * 1000
    history = history.findAll { (synagogueLong(it?.at) ?: 0L) >= cutoff }
    if (history.size() > 80) history = history.drop(history.size() - 80) as List
    rt.history = history
    state.runtime = rt
}

def synagogueArm() {
    synagogueEnsureState()
    try { unschedule("synagogueFire") } catch (e) {}
    if (state.runtime?.hidden == true || state.config?.settings?.paused == true) return [scheduled: false]
    if (synagogueModeHeld()) return [scheduled: false, held: true]
    def ctx = synagogueContext()
    def built = synagogueBuilt(ctx)
    def fired = state.runtime?.fired instanceof Map ? state.runtime.fired : [:]
    def next = synagogueNextAction(built.actions, now(), fired)
    if (!next) return [scheduled: false]
    long at = (synagogueLong(next.at) ?: now()) 
    if (at < now() + 3000L) at = now() + 3000L
    try {
        runOnce(new Date(at), synagogueFire)
        if (debugLogging) log.debug "mDash Synagogue: next ${next.label}"
        return [scheduled: true, at: at, label: next.label]
    } catch (e) {
        log.warn "mDash Synagogue: could not arm the next action — ${e}"
        return [scheduled: false]
    }
}

def synagogueFillSun(Map ctx) {
    def zmanim = ctx.zmanim instanceof Map ? ctx.zmanim : [:]
    def tz = synagogueTzFrom(ctx.tz)
    def today = synagogueDateOf(synagogueLong(ctx.now) ?: now(), tz)
    def sun = [:]
    for (int i = 0; i < 21; i++) {
        def date = synagogueAddDays(today, i, tz)
        def row = zmanim[date] instanceof Map ? zmanim[date] : [:]
        if (row.sunset != null && row.sunrise != null) continue
        try {
            def parts = date.split("-")
            Calendar cal = Calendar.getInstance(tz)
            cal.set(Calendar.YEAR, parts[0] as int)
            cal.set(Calendar.MONTH, (parts[1] as int) - 1)
            cal.set(Calendar.DATE, parts[2] as int)
            cal.set(Calendar.HOUR_OF_DAY, 12)
            // Read from this app. A call into the dashboard app waits for whatever that
            // app is doing, and the dashboard app can be waiting on this one.
            def rs = getSunriseAndSunset([date: cal.getTime()])
            sun[date] = [sunrise: rs?.sunrise?.getTime(), sunset: rs?.sunset?.getTime()]
        } catch (e) {
            sun[date] = [sunrise: null, sunset: null]
        }
    }
    ctx.sun = sun
}

def synagogueCatchUp() {
    if (state.runtime?.hidden == true || state.config?.settings?.paused == true || synagogueModeHeld()) return
    def ctx = synagogueContext()
    def built = synagogueBuilt(ctx)
    def fired = state.runtime?.fired instanceof Map ? synagogueCopy(state.runtime.fired) : [:]
    long caught = now()
    for (action in synagogueDue(built.actions, caught, fired)) {
        boolean late = caught > ((synagogueLong(action.occEnd) ?: 0L) + 30L * 60000L)
        synagogueNoteLateStart(action, caught)
        synagogueRunAction(action, fired, late)
    }
    for (action in (built.actions ?: [])) {
        if (action.unlock != true || action.suppressed == true) continue
        def id = action.id?.toString()
        if (!id || fired.containsKey(id)) continue
        long at = synagogueLong(action.at) ?: 0L
        if (at > caught || caught <= at + 60000L) continue
        fired[id] = caught
        synagogueRemember((action.occName ?: "Service") + ": " + (action.label ?: "Unlock"), "unlock skipped, too late", action.occId?.toString() ?: "", "late")
    }
    def rt = synagogueCopy(state.runtime)
    rt.fired = synagogueTrimFired(fired)
    state.runtime = rt
}

def synagogueFire() { synagogueCatchUp(); synagogueArm() }

// An action that starts well after its time usually waited behind another call
// into this app, or was caught up after a restart.
def synagogueNoteLateStart(Map action, long caught) {
    try {
        long late = caught - (synagogueLong(action.at) ?: caught)
        if (late >= 5000L) log.warn "mDash Synagogue: ${action.label} started ${Math.round(late / 1000.0d)} s after its time"
    } catch (e) {}
}

def synagogueRunAction(Map action, Map fired, boolean late) {
    def id = action.id?.toString()
    if (!id || fired.containsKey(id)) return
    fired[id] = now()
    def states = action.states instanceof List ? action.states : []
    try {
        def result = parent?.holidayRunAction(states)
        def missing = result?.missing instanceof List ? result.missing.collect { it?.toString() }.findAll { it } : []
        def named = missing.collect { mid ->
            def st = states.find { it?.id?.toString() == mid }
            def label = st?.name?.toString()?.trim()
            return label ?: mid
        }
        def reason = late ? "ended late" : "ran"
        if (named) reason = reason + ", missing " + named.join(", ")
        log.info "mDash Synagogue: ${action.label} — ${reason}"
        synagogueRemember((action.occName ?: "Service") + ": " + action.label, reason, action.occId?.toString() ?: "", late ? "late" : "ran")
    } catch (e) {
        log.warn "mDash Synagogue: ${action.label} failed — ${e}"
        synagogueRemember((action.occName ?: "Service") + ": " + action.label, "failed", action.occId?.toString() ?: "", "failed")
    }
}

def synagogueTrimFired(Map fired) {
    long cutoff = now() - 8L * 24 * 60 * 60 * 1000L
    def out = [:]
    fired.each { key, value ->
        long at = synagogueLong(value) ?: 0L
        if (at >= cutoff) out[key.toString()] = at
    }
    return out
}

def synagogueRunEndNow(String occId) {
    def ctx = synagogueContext()
    def built = synagogueBuilt(ctx)
    def fired = state.runtime?.fired instanceof Map ? synagogueCopy(state.runtime.fired) : [:]
    int ran = 0
    for (action in built.actions) {
        if (action.occId?.toString() != occId || action.anchor?.toString() != "end") continue
        action = synagogueCopy(action)
        action.suppressed = false
        synagogueRunAction(action, fired, false)
        ran++
    }
    def rt = synagogueCopy(state.runtime)
    rt.fired = synagogueTrimFired(fired)
    state.runtime = rt
    return ran
}

def synagogueHubPlace() {
    def lat = null
    def lon = null
    def tz = null
    def zip = ""
    try { lat = location?.latitude } catch (e) {}
    try { lon = location?.longitude } catch (e) {}
    try { tz = location?.timeZone } catch (e) {}
    try { zip = location?.zipCode?.toString()?.trim() ?: "" } catch (e) {}
    return [lat: lat, lon: lon, tz: tz, zip: zip]
}

def synagogueCoordsOk(place) {
    try {
        if (!place?.tz) return false
        if (place.lat == null || place.lon == null || place.lat.toString().trim() == "" || place.lon.toString().trim() == "") return false
        def la = Double.parseDouble(place.lat.toString())
        def lo = Double.parseDouble(place.lon.toString())
        if (la == 0d && lo == 0d) return false
        return true
    } catch (e) { return false }
}

def synagogueLocationProblem() {
    def place = synagogueHubPlace()
    if (synagogueCoordsOk(place)) return ""
    def zip = place.zip?.toString() ?: ""
    if (zip ==~ /\d{5}(-\d{4})?/ && !(zip ==~ /0+(-\d+)?/)) return ""
    if (zip ==~ /0+(-\d+)?/) return "The hub postal code is still ${zip}, which is not a location. Enter your postal code under Settings, Hub Details, so prayer times can be loaded."
    return "Enter your postal code under Settings, Hub Details. Outside the United States, set the latitude, longitude, and time zone there instead."
}

def synagogueLocationNotice() {
    try { synagogueEnsureState() } catch (e) { return "" }
    return synagogueLocationProblem()
}

def synagogueQueryKey() {
    def s = state.config?.settings ?: [:]
    def place = synagogueHubPlace()
    return "${s.israel == true}|${s.candleMin}|${s.havdalahMinutes}|${place.lat}|${place.lon}|${place.tz?.getID()}|${place.zip}"
}

def synagogueFetch(boolean force) {
    synagogueEnsureState()
    def problem = synagogueLocationProblem()
    if (problem) {
        def hebcal = synagogueCopy(state.hebcal)
        hebcal.error = problem
        state.hebcal = hebcal
        synagogueFetchCalendars(force)
        return
    }
    if (!force && state.hebcal?.fetchedAt && !state.hebcal?.error && state.hebcal?.query?.toString() == synagogueQueryKey()) {
        if ((now() - (synagogueLong(state.hebcal.fetchedAt) ?: 0L)) < 20L * 60 * 60 * 1000L) {
            synagogueFetchCalendars(force)
            return
        }
    }
    def place = synagogueHubPlace()
    def tz = place.tz ?: synagogueHubTz()
    def s = state.config.settings
    Calendar cal = Calendar.getInstance(tz)
    cal.add(Calendar.DATE, -1)
    String start = String.format("%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DATE))
    Calendar endCal = (Calendar) cal.clone()
    endCal.add(Calendar.DATE, 22)
    String zEnd = String.format("%04d-%02d-%02d", endCal.get(Calendar.YEAR), endCal.get(Calendar.MONTH) + 1, endCal.get(Calendar.DATE))
    Calendar yearCal = (Calendar) cal.clone()
    yearCal.add(Calendar.DATE, 400)
    String hEnd = String.format("%04d-%02d-%02d", yearCal.get(Calendar.YEAR), yearCal.get(Calendar.MONTH) + 1, yearCal.get(Calendar.DATE))
    String geo = synagogueCoordsOk(place) ? "geo=pos&latitude=${place.lat}&longitude=${place.lon}&tzid=${java.net.URLEncoder.encode(tz.getID(), 'UTF-8')}" : "geo=zip&zip=${place.zip}"
    String candle = synagogueInt(s.candleMin, 18).toString()
    String hav = synagogueInt(s.havdalahMinutes, 50).toString()
    String israel = s.israel == true ? "on" : "off"
    String zUrl = "https://www.hebcal.com/zmanim?cfg=json&${geo}&start=${start}&end=${zEnd}"
    String hUrl = "https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&mf=on&ss=on&s=on&c=on&${geo}&start=${start}&end=${hEnd}&b=${candle}&m=${hav}&i=${israel}"
    def box = [zmanim: null, flags: null, error: ""]
    try {
        httpGet([uri: zUrl, timeout: 30]) { resp ->
            if (resp.status != 200) box.error = "HebCal returned ${resp.status}."
            else box.zmanim = synagogueParseZmanim(resp.data instanceof Map ? resp.data : [:])
        }
        if (!box.error) {
            httpGet([uri: hUrl, timeout: 30]) { resp ->
                if (resp.status != 200) box.error = "HebCal returned ${resp.status}."
                else box.flags = synagogueParseItems(resp.data?.items instanceof List ? resp.data.items : [])
            }
        }
    } catch (e) {
        box.error = "Could not reach HebCal."
        log.warn "mDash Synagogue: fetch failed — ${e}"
    }
    def hebcal = synagogueCopy(state.hebcal)
    if (box.zmanim instanceof Map && box.zmanim) {
        hebcal.zmanim = box.zmanim
        if (hebcal.extra instanceof Map) {
            hebcal.extra.each { date, row ->
                if (row?.times instanceof Map && !(hebcal.zmanim[date.toString()] instanceof Map)) hebcal.zmanim[date.toString()] = row.times
            }
        }
    }
    if (box.flags instanceof Map) hebcal.flags = box.flags
    if (!box.error) {
        hebcal.fetchedAt = now()
        hebcal.query = synagogueQueryKey()
        hebcal.error = ""
        log.info "mDash Synagogue: times updated"
    } else if (!hebcal.zmanim) {
        hebcal.error = box.error
    } else {
        hebcal.error = box.error
    }
    state.hebcal = hebcal
    synagogueFetchCalendars(force)
}

def synagogueAgendaWindow(List occurrences, String start, int days, TimeZone tz, Long nowMs = null) {
    def end = synagogueAddDays(start, days, tz)
    def yesterday = synagogueAddDays(start, -1, tz)
    return (occurrences ?: []).findAll { occ ->
        def date = occ?.date?.toString() ?: ""
        if (date >= start && date < end) return true
        if (nowMs == null || date != yesterday) return false
        long endAt = synagogueLong(occ?.end) ?: 0L
        return endAt >= ((nowMs as long) - 30L * 60000L)
    }
}

def synagogueStatusMap(Map projected, Map ctx, int days = 7) {
    def tz = synagogueTzFrom(ctx?.tz)
    long nowMs = synagogueLong(ctx?.now) ?: now()
    return [
        ok: true,
        apiVersion: synagogueApiVersion(),
        revision: state?.runtime?.revision ?: 0,
        paused: state?.config?.settings?.paused == true,
        hidden: state?.runtime?.hidden == true,
        locationProblem: "",
        quiet: synagogueQuietAt(nowMs, ctx, state?.config),
        hebcal: [fetchedAt: state?.hebcal?.fetchedAt ?: 0, error: state?.hebcal?.error ?: ""],
        settings: state?.config?.settings,
        spaces: state?.config?.spaces,
        days: state?.config?.days,
        dateOverrides: state?.config?.dateOverrides ?: [:],
        calendars: synagoguePublicCalendars(state?.config),
        titleRules: state?.config?.titleRules ?: [],
        bookings: state?.config?.bookings ?: [],
        feed: projected.feed ?: [],
        unsupported: projected.unsupported ?: [],
        calendarError: ctx?.calendarError?.toString() ?: "",
        menu: projected.menu,
        nudges: projected.nudges,
        agenda: synagogueAgendaWindow(projected.occurrences, synagogueDateOf(nowMs, tz), days, tz, nowMs),
        warnings: projected.warnings,
        history: state?.runtime?.history ?: [],
        zmanim: synagogueZmanCatalog(),
        impact: synagogueImpactMap(state?.config),
        impactShabbat: synagogueImpact("shabbat", state?.config),
        ical: [fetchedAt: state?.ical?.fetchedAt ?: 0, error: state?.ical?.error ?: ""]
    ]
}

def synagogueStatus(Object days = null) {
    synagogueEnsureState()
    def ctx = synagogueContext(true)
    def built = synagogueBuilt(ctx)
    def status = synagogueStatusMap(synagogueProject(state.config, ctx, built), ctx, synagogueAgendaSpan(days))
    status.locationProblem = synagogueLocationProblem()
    status.hebcal = [fetchedAt: state.hebcal?.fetchedAt ?: 0, error: state.hebcal?.error ?: ""]
    try { status.tz = synagogueHubTz().getID() } catch (e) { status.tz = "" }
    return status
}

def synagogueDays(String dayId) {
    def status = synagogueStatus()
    if (!dayId) return status
    status.dayId = dayId
    return status
}

def synagogueSave(Map body) {
    synagogueEnsureState()
    def rev = body?.revision
    if (rev != null && rev.toString() != (state.runtime?.revision ?: 0).toString()) {
        return [ok: false, error: "Changed on another device. Reload.", revision: state.runtime?.revision ?: 0]
    }
    if (body?.op?.toString() == "tryCue") {
        def ctx = synagogueContext()
        if (synagogueQuietAt(now(), ctx, state.config)) return [ok: false, error: "Try it now is off during Shabbat and Yom Tov.", revision: state.runtime?.revision ?: 0]
        def control = null
        def spaceName = "Space"
        for (space in (state.config?.spaces instanceof List ? state.config.spaces : [])) {
            control = (space.controls instanceof List ? space.controls : []).find { it?.id?.toString() == body.controlId?.toString() }
            if (control) { spaceName = space?.name?.toString() ?: spaceName; break }
        }
        if (!(control instanceof Map)) return [ok: false, error: "Choose a control.", revision: state.runtime?.revision ?: 0]
        def cue = [action: body.action?.toString() ?: "on", level: body.level]
        def built = synagogueCueStates(control, cue)
        if (built.held == true) return [ok: false, error: "Set a temperature for this control first.", revision: state.runtime?.revision ?: 0]
        try { parent?.holidayRunAction(built.states) } catch (e) {
            return [ok: false, error: "Could not run that control.", revision: state.runtime?.revision ?: 0]
        }
        synagogueRemember(spaceName + ": " + synagogueCueLabel(control, cue), "tried now", "", "")
        return [ok: true, revision: state.runtime?.revision ?: 0]
    }
    if (body?.op?.toString() == "endNow") {
        synagogueRunEndNow(body.occurrenceId?.toString())
        synagogueBump()
        def status = synagogueStatus()
        status.ok = true
        return status
    }
    def applied = synagogueApply(state.config, body ?: [:])
    if (applied.ok != true) {
        applied.revision = state.runtime?.revision ?: 0
        return applied
    }
    state.config = applied.config
    synagogueBump()
    if (body?.op?.toString() in ["settings", "pause"]) synagogueFetch(body?.op?.toString() == "settings")
    if (body?.op?.toString() in ["calendar", "deleteCalendar"]) synagogueFetchCalendars(true)
    def armed = synagogueArm()
    def status = synagogueStatus()
    status.ok = true
    status.scheduled = armed?.scheduled == true
    return status
}

def synagoguePreview(Map body) {
    synagogueEnsureState()
    def op = body?.op?.toString() ?: ""
    if (op == "checkCalendar") return synagogueCheckCalendar(body, null)
    if (op == "zmanim") return synagogueFetchFarZman(body)
    def applied = synagogueApply(synagogueCopy(state.config), body ?: [:])
    def config = applied.ok == true ? applied.config : state.config
    if (applied.ok != true && body?.op) return applied
    def ctx = synagogueContext()
    synagogueFillSun(ctx)
    def built = synagogueExpand(config, ctx)
    def entryId = body?.entryId?.toString()
    def rows = built.occurrences ?: []
    if (entryId) rows = rows.findAll { it?.entryId?.toString() == entryId }
    return [ok: true, apiVersion: synagogueApiVersion(), preview: rows.take(5), warnings: built.warnings, impact: body?.dayId ? synagogueImpact(body.dayId.toString(), config) : []]
}

def synagogueSkip(Map body) {
    def next = body instanceof Map ? new LinkedHashMap(body) : [:]
    next.op = "skip"
    return synagogueSave(next)
}

def synagogueDemoContext(String tzId, long nowMs) {
    def tz = synagogueTzFrom(tzId)
    def today = synagogueDateOf(nowMs, tz)
    def zmanim = [:]
    def flags = [:]
    boolean yom = false
    boolean chol = false
    boolean fast = false
    boolean rosh = false
    for (int i = 0; i < 40; i++) {
        def date = synagogueAddDays(today, i, tz)
        long rise = synagogueZonedMs(date, "06:30", tz)
        long set = synagogueZonedMs(date, "18:03", tz)
        zmanim[date] = [
            sunrise: rise,
            sunset: set,
            tzeit50min: set + 50L * 60000L,
            sofZmanShma: rise + 180L * 60000L,
            sofZmanTfilla: rise + 240L * 60000L
        ]
        int dow = synagogueDow(date, tz)
        def flag = [:]
        if (dow == Calendar.FRIDAY) flag.candles = set - 18L * 60000L
        if (dow == Calendar.SATURDAY) flag.havdalah = set + 50L * 60000L
        if (!yom && dow == Calendar.WEDNESDAY && i > 3) {
            yom = true
            flag.yomTov = "yomKippur"
            flag.candles = set - 18L * 60000L
        }
        if (yom && !flag.yomTov && synagogueWinner(synagogueAddDays(date, -1, tz), flags, tz) == "yomKippur") {
            flag.havdalah = set + 50L * 60000L
        }
        if (!chol && dow == Calendar.SATURDAY && i > 8) {
            chol = true
            flag.cholHaMoed = "cholHaMoedSukkot"
        }
        if (!fast && dow == Calendar.MONDAY && i > 1) {
            fast = true
            flag.fast = "fastGedaliah"
        }
        if (!rosh && dow == Calendar.SUNDAY && i > 1) {
            rosh = true
            flag.roshChodesh = true
        }
        if (flag) flags[date] = flag
    }
    return [tz: tz.getID(), now: nowMs, zmanim: zmanim, flags: flags, sun: [:], horizon: 21]
}

def synagogueCli(Map req) {
    def tz = req?.tz?.toString() ?: "America/New_York"
    long nowMs = synagogueLong(req?.now) ?: System.currentTimeMillis()
    def ctx = [tz: tz, now: nowMs, zmanim: req?.zmanim ?: [:], flags: req?.flags ?: [:], sun: req?.sun ?: [:], scheduleNames: req?.scheduleNames ?: [:], horizon: req?.horizon ?: 21]
    if (req?.demo == true) {
        def demo = synagogueDemoContext(tz, nowMs)
        ctx.zmanim = demo.zmanim
        ctx.flags = demo.flags
    }
    def config = req?.config instanceof Map ? req.config : synagogueDefaultConfig()
    def op = req?.op?.toString() ?: "status"
    def bodyOp = req?.body?.op?.toString() ?: ""
    if (req?.ics instanceof Map) {
        def ingested = synagogueIngestIcs(config, req.ics, synagogueTzFrom(tz), nowMs)
        ctx.events = ingested.events
        ctx.unsupported = ingested.unsupported
        ctx.calendarError = ingested.error
    }
    if (bodyOp == "checkCalendar" || op == "checkCalendar") return synagogueCheckCalendar(req?.body instanceof Map ? req.body : [:], req?.ics)
    if (bodyOp == "zmanim" || op == "zmanim") {
        def result = synagogueFetchFarZman(req?.body instanceof Map ? req.body : [:])
        if (!(result?.zmanim instanceof Map) || result.zmanim.sunset == null) {
            def date = synagogueDateOnly(req?.body?.date?.toString())
            def row = [sunrise: synagogueZonedMs(date, "06:30", synagogueTzFrom(tz)), sunset: synagogueZonedMs(date, "18:03", synagogueTzFrom(tz))]
            if (date) synagogueStoreFar(date, row)
            result = [ok: true, date: date, zmanim: row]
        }
        return result
    }
    synagogueMergeExtraZmanim(ctx)
    if (op == "save" || op == "skip" || op == "preview") {
        def applied = synagogueApply(op == "preview" ? synagogueCopy(config) : config, req?.body instanceof Map ? req.body : [:])
        if (applied.ok != true) return applied
        config = applied.config
        if (op == "preview") {
            def built = synagogueExpand(config, ctx)
            def entryId = req?.body?.entryId?.toString()
            def rows = built.occurrences ?: []
            if (entryId) rows = rows.findAll { it?.entryId?.toString() == entryId }
            return [ok: true, preview: rows.take(5), warnings: built.warnings, config: req?.config]
        }
    }
    def projected = synagogueProject(config, ctx)
    def status = [
        ok: true,
        apiVersion: synagogueApiVersion(),
        revision: synagogueLong(req?.revision) ?: 1,
        paused: config?.settings?.paused == true,
        hidden: false,
        locationProblem: "",
        quiet: synagogueQuietAt(nowMs, ctx, config),
        hebcal: [fetchedAt: nowMs, error: ""],
        settings: config.settings,
        spaces: config.spaces,
        days: config.days,
        dateOverrides: config.dateOverrides ?: [:],
        calendars: synagoguePublicCalendars(config),
        titleRules: config.titleRules ?: [],
        bookings: config.bookings ?: [],
        feed: projected.feed ?: [],
        unsupported: projected.unsupported ?: [],
        calendarError: ctx?.calendarError?.toString() ?: "",
        menu: projected.menu,
        nudges: projected.nudges,
        agenda: synagogueAgendaWindow(projected.occurrences, synagogueDateOf(nowMs, synagogueTzFrom(tz)), synagogueAgendaSpan(req?.agendaDays), synagogueTzFrom(tz), nowMs),
        warnings: projected.warnings,
        history: [],
        zmanim: synagogueZmanCatalog(),
        impact: synagogueImpactMap(config),
        impactShabbat: synagogueImpact("shabbat", config),
        ical: [fetchedAt: 0, error: ctx?.calendarError?.toString() ?: ""],
        tz: tz,
        config: config
    ]
    if (op == "expand" || op == "project") status.occurrences = projected.occurrences
    return status
}
