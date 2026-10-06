// mDash Shabbat and Holidays — optional child app.
// Calendar and time rules match lib/holiday-core.mjs (HOLIDAY_API_VERSION 2).
// Occasions: shabbat; Tishrei 1,2 roshHashana; 10 yomKippur; 15,16 sukkot; 22,23 shemini;
// Nisan 15,16 pesachFirst; 21,22 pesachLast; Sivan 6,7 shavuot.

definition(
    name: "mDash Shabbat and Holidays",
    namespace: "mDash",
    author: "Ephrayim (evdev)",
    description: "Optional Shabbat and Yom Tov schedules for Modern Dashboard. Lights, outlets, blinds, ceiling fans, locks, thermostats, and hub mode from HebCal candle-lighting and havdalah times.",
    category: "My Apps",
    parent: "mDash:Modern Dashboard",
    iconUrl: "",
    iconX2Url: "",
    iconX3Url: ""
)

preferences {
    page(name: "mainPage", title: "Shabbat & holidays", install: true, uninstall: true)
}

def mainPage() {
    dynamicPage(name: "mainPage", title: "Shabbat & holidays", install: true, uninstall: true) {
        section {
            paragraph holidayStatusParagraph()
            input "debugLogging", "bool", title: "Debug logging", defaultValue: false, submitOnChange: true
            input "btnHolidayRefresh", "button", title: "Refresh calendar"
            input "btnHolidayPause", "button", title: state?.config?.settings?.paused == true ? "Resume" : "Pause"
            input "btnHolidayTest", "button", title: "Run a test span"
            paragraph "<small>The test span starts in 2 minutes and lasts 10 minutes. It uses the Shabbat start and end actions and the real hub modes. Reboot during it to check the 60-second delay and the two-hour replay.</small>"
            paragraph "<small>Times come from <a href=\"https://www.hebcal.com\" target=\"_blank\">HebCal</a>. If Shabbat and Holiday Scheduler is also installed, turn off its mode switching so the hub is not switched twice. Rule Machine and motion rules should be limited to non-holiday modes.</small>"
        }
    }
}

def appButtonHandler(btn) {
    if (btn == "btnHolidayRefresh") holidayRefresh()
    else if (btn == "btnHolidayPause") holidayTogglePause()
    else if (btn == "btnHolidayTest") holidayStartTestSpan()
}

def installed() {
    holidayEnsureState()
    initialize()
}

def updated() {
    holidayEnsureState()
    initialize()
}

def uninstalled() {
    unschedule()
    try { unsubscribe() } catch (e) {}
}

def initialize() {
    holidayEnsureState()
    try { unsubscribe() } catch (e) {}
    subscribe(location, "mode", holidayModeChanged)
    subscribe(location, "systemStart", holidaySystemStart)
    schedule("0 15 0 * * ?", holidayMidnight, [overwrite: true])
    holidayArm()
}

def holidayParentPause(boolean hidden) {
    holidayEnsureState()
    state.runtime.parentHidden = hidden
    if (hidden) {
        try { unschedule("holidayFire") } catch (e) {}
        log.info "mDash Holidays: paused because the scheduler is hidden. The hub mode was left as it is."
    } else {
        holidayMarkPassedDone()
        holidayArm()
    }
}

def holidayTogglePause() {
    holidayEnsureState()
    boolean next = !(state.config.settings.paused == true)
    state.config.settings.paused = next
    state.runtime.revision = (state.runtime.revision ?: 0) + 1
    if (next) {
        try { unschedule("holidayFire") } catch (e) {}
        log.info "mDash Holidays: paused. The hub mode was left as it is."
    } else {
        holidayMarkPassedDone()
        holidayArm()
        log.info "mDash Holidays: resumed. Past actions were not replayed."
    }
}

def holidayStartTestSpan() {
    holidayEnsureState()
    long start = now() + 2 * 60 * 1000
    state.runtime.testSpan = [id: "test", start: start, end: start + 10 * 60 * 1000]
    holidayArm()
    log.info "mDash Holidays: test span armed for 2 minutes from now"
}

def holidayRefresh() {
    holidayFetch(true)
}

def holidaySystemStart(evt) {
    runIn(60, holidayCatchUp)
}

def holidayMidnight() {
    holidayFetch(false)
    holidayArm()
}

def holidayModeChanged(evt) {
    if (state?.runtime?.changingMode == true) return
    def mode = evt?.value?.toString()
    if (!mode) return
    holidayEnsureState()
    def span = holidayActiveSpan(now())
    if (!span) return
    def rt = state.runtime
    def active = rt.activeSpan
    if (!active || active.id?.toString() != span.id?.toString()) return
    def holidayMode = state.config.settings.holidayMode?.toString()
    if (active.held == true && mode == holidayMode) {
        active.held = false
        active.startRan = true
        state.runtime.activeSpan = active
        log.info "mDash Holidays: holiday mode set manually — continuing this span"
        holidayCatchUp()
        return
    }
    if (active.held == true) return
    if (active.startRan == true && active.ended != true && mode != holidayMode) {
        active.overridden = true
        state.runtime.activeSpan = active
        log.info "mDash Holidays: mode left the holiday mode — this span will not be forced back"
    }
}

// --- dashboard API (called by the parent) ---

def holidaysStatus() {
    holidayEnsureState()
    def nowMs = now()
    def built = holidayBuild(nowMs)
    return [
        ok: true,
        apiVersion: 2,
        deviceKinds: holidayDeviceKinds(),
        tz: holidayTzId(),
        now: nowMs,
        revision: state.runtime.revision ?: 0,
        paused: holidayPaused(),
        preflight: holidayPreflight(),
        settings: state.config.settings,
        occasions: state.config.occasions,
        templates: state.config.templates,
        calendar: [
            fetchedAt: state.calendar?.fetchedAt,
            error: state.calendar?.error,
            query: state.calendar?.query
        ],
        rows: built.rows,
        spans: built.spans,
        conflicts: holidayConflicts(),
        modes: holidayModeNames()
    ]
}

def holidaysPreview(body) {
    holidayEnsureState()
    def draft = holidayConfigCopy()
    if (body?.settings) draft.settings = holidayMergeSettings(draft.settings, body.settings)
    if (body?.occasion) {
        def id = body.occasion.toString()
        if (body.choice) draft.occasions[id] = body.choice.toString()
        if (body.template) draft.templates[id] = body.template
    }
    def errors = holidayTemplateErrors(body?.template)
    def built = holidayBuildFrom(draft, now())
    def span = null
    if (body?.occasion) {
        span = built.spans.find { s -> holidaySpanHasOccasion(s, body.occasion.toString()) }
    }
    if (!span && built.spans) span = built.spans[0]
    return [ok: errors.size() == 0, errors: errors, warnings: span?.warnings ?: [], span: span, apiVersion: 2, tz: holidayTzId()]
}

def holidaysSave(body) {
    holidayEnsureState()
    def rev = body?.revision
    if (rev != null && rev.toString() != (state.runtime.revision ?: 0).toString()) {
        return [ok: false, error: "Changed on another device — reload.", revision: state.runtime.revision ?: 0]
    }
    if (body?.template) {
        def errs = holidayTemplateErrors(body.template)
        if (errs) return [ok: false, error: holidayErrorMessage(errs), errors: errs, revision: state.runtime.revision ?: 0]
    }
    if (body?.settings) state.config.settings = holidayMergeSettings(state.config.settings, body.settings)
    if (body?.pauseOccasion) holidayTogglePause(body.pauseOccasion.toString())
    if (body?.occasion) {
        def id = body.occasion.toString()
        if (body.choice) state.config.occasions[id] = body.choice.toString()
        if (body.template) state.config.templates[id] = body.template
    }
    state.runtime.revision = (state.runtime.revision ?: 0) + 1
    holidayMarkPassedDone()
    if (holidayQueryChanged()) holidayFetch(true)
    else holidayArm()
    def status = holidaysStatus()
    status.ok = true
    return status
}

def holidaysSkip(body) {
    holidayEnsureState()
    def id = body?.spanId?.toString()
    if (!id) return [ok: false, error: "missing span"]
    def list = state.runtime.skippedSpanIds ?: []
    if (body?.undo == true) list = list.findAll { it?.toString() != id }
    else if (!list.contains(id)) list << id
    state.runtime.skippedSpanIds = list
    def active = state.runtime.activeSpan
    if (body?.undo != true && active?.id?.toString() == id) {
        active.ended = true
        active.held = true
        state.runtime.activeSpan = active
        try { unschedule("holidayFire") } catch (e) {}
        log.info "mDash Holidays: skipped the rest of this span. The hub mode was left as it is."
    }
    state.runtime.revision = (state.runtime.revision ?: 0) + 1
    holidayArm()
    def status = holidaysStatus()
    status.ok = true
    return status
}

def holidaysTest(body) {
    holidayEnsureState()
    def which = body?.which?.toString()
    def occasion = body?.occasion?.toString() ?: "shabbat"
    def template = holidayResolveTemplate(occasion, state.config) ?: state.config.templates?.shabbat
    def raw = which == "end" ? template?.end?.states : template?.start?.states
    def states = holidayCloneStates(raw)
    def result = parent.holidayRunAction(states)
    log.info "mDash Holidays: test ${which ?: 'start'} — ${result}"
    return [ok: true, lastResult: result, apiVersion: 2]
}

// --- state ---

def holidayEnsureState() {
    if (!(state.config instanceof Map)) {
        state.config = [
            settings: holidayDefaultSettings(),
            templates: [shabbat: holidayEmptyTemplate()],
            occasions: holidayDefaultOccasions()
        ]
    }
    if (!(state.config.settings instanceof Map)) state.config.settings = holidayDefaultSettings()
    if (!(state.config.templates instanceof Map)) state.config.templates = [shabbat: holidayEmptyTemplate()]
    if (!(state.config.occasions instanceof Map)) state.config.occasions = holidayDefaultOccasions()
    if (!(state.config.pausedOccasions instanceof List)) state.config.pausedOccasions = []
    if (!(state.calendar instanceof Map)) state.calendar = [boundaries: [], holidays: [], query: "", fetchedAt: 0, error: ""]
    if (!(state.runtime instanceof Map)) {
        state.runtime = [revision: 0, doneIds: [:], skippedSpanIds: [], history: [], activeSpan: null, parentHidden: false, changingMode: false, testSpan: null]
    }
    if (!(state.runtime.doneIds instanceof Map)) state.runtime.doneIds = [:]
    if (!(state.runtime.skippedSpanIds instanceof List)) state.runtime.skippedSpanIds = []
}

def holidayDefaultSettings() {
    return [
        holidayMode: "", endMode: "", israel: false, doNotStartModes: [],
        candleMin: 18, havdalah: [type: "nightfall", minutes: 42], startEarlyMin: 0,
        earlyFriday: [type: "off", value: ""], fridayOverrideDate: "", paused: false
    ]
}

def holidayDefaultOccasions() {
    return [roshHashana: "shabbat", yomKippur: "shabbat", sukkot: "shabbat", shemini: "shabbat", pesachFirst: "shabbat", pesachLast: "shabbat", shavuot: "shabbat"]
}

def holidayEmptyTemplate() {
    return [
        start: [states: [], repeatLaterNights: false],
        night: [], morning: [], afternoon: [], evening: [],
        end: [states: []], custom: []
    ]
}

def holidayConfigCopy() {
    def raw = groovy.json.JsonOutput.toJson(state.config)
    return new groovy.json.JsonSlurper().parseText(raw)
}

def holidayMergeSettings(current, incoming) {
    def next = current instanceof Map ? new LinkedHashMap(current) : holidayDefaultSettings()
    incoming.each { k, v -> next[k] = v }
    return next
}

def holidayPaused() {
    return state.config?.settings?.paused == true || state.runtime?.parentHidden == true
}

def holidayTogglePause(String occasion) {
    if (!occasion) return
    def list = (state.config.pausedOccasions ?: []).collect { it?.toString() }.findAll { it }
    if (list.contains(occasion)) list = list.findAll { it != occasion }
    else list << occasion
    state.config.pausedOccasions = list
}

def holidaySpanPaused(span, config) {
    def id = span?.occasion?.toString()
    if (!id) return false
    return ((config?.pausedOccasions ?: []).collect { it?.toString() }).contains(id)
}

def holidayIsAvailable() {
    holidayEnsureState()
    return !holidayPaused()
}

def holidayTz() {
    try { return location?.timeZone } catch (e) { return TimeZone.getDefault() }
}

def holidayTzId() {
    def tz = holidayTz()
    return tz?.getID() ?: ""
}

def holidayModeNames() {
    def out = []
    try {
        for (m in (location?.modes ?: [])) out << m?.toString()
    } catch (e) {}
    return out
}

def holidayPreflight() {
    def errors = []
    def tz = holidayTzId()
    def lat = null
    def lon = null
    try { lat = location?.latitude; lon = location?.longitude } catch (e) {}
    if (lat == null || lon == null || !tz) errors << "Set the hub latitude, longitude, and time zone."
    def holiday = state.config.settings.holidayMode?.toString()?.trim()
    def end = state.config.settings.endMode?.toString()?.trim()
    if (!holiday || !end) errors << "Choose the holiday mode and the mode to return to."
    else if (holiday == end) errors << "The holiday mode and the end mode must be different."
    def modes = holidayModeNames()
    if (holiday && modes && !modes.contains(holiday)) errors << "The holiday mode is not on this hub."
    if (end && modes && !modes.contains(end)) errors << "The end mode is not on this hub."
    return [ok: errors.size() == 0, errors: errors]
}

def holidayStatusParagraph() {
    holidayEnsureState()
    def pf = holidayPreflight()
    def cal = state.calendar?.error ? "Calendar: ${state.calendar.error}" : "Calendar fetched."
    def next = ""
    try {
        def built = holidayBuild(now())
        if (built.rows) next = "Next: ${built.rows[0].name}."
    } catch (e) { next = "" }
    def pause = holidayPaused() ? " Paused — the hub mode was left as it is." : ""
    def pfText = pf.ok ? "" : " ${pf.errors.join(' ')}"
    return "${cal} ${next}${pause}${pfText}"
}

// --- HebCal ---

def holidayQueryKey() {
    def s = state.config.settings
    def hav = s.havdalah ?: [:]
    def lat = ""
    def lon = ""
    try { lat = location?.latitude?.toString() ?: ""; lon = location?.longitude?.toString() ?: "" } catch (e) {}
    return "${s.israel == true ? 'il' : 'diaspora'}|${s.candleMin ?: 18}|${hav.type ?: 'nightfall'}|${hav.minutes ?: ''}|${lat}|${lon}|${holidayTzId()}"
}

def holidayQueryChanged() {
    return holidayQueryKey() != state.calendar?.query?.toString()
}

def holidayFetch(boolean force) {
    holidayEnsureState()
    if (!force && state.calendar?.fetchedAt && (now() - (state.calendar.fetchedAt as long)) < 6L * 24 * 60 * 60 * 1000 && !state.calendar?.error && !holidayQueryChanged()) {
        return
    }
    def tz = holidayTz()
    def lat = null
    def lon = null
    def zip = null
    try {
        lat = location?.latitude
        lon = location?.longitude
        zip = location?.zipCode
    } catch (e) {}
    if ((lat == null || lon == null || !tz) && !zip) {
        state.calendar.error = "Hub location is not set."
        return
    }
    def s = state.config.settings
    def hav = s.havdalah ?: [:]
    Calendar cal = Calendar.getInstance(tz ?: TimeZone.getDefault())
    String start = String.format("%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DATE))
    cal.add(Calendar.DATE, 400)
    String end = String.format("%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DATE))
    String geo = (lat != null && lon != null && tz) ? "geo=pos&latitude=${lat}&longitude=${lon}&tzid=${tz.getID()}" : "geo=zip&zip=${zip}"
    String havdalah = (hav.type?.toString() == "minutes") ? "m=${hav.minutes ?: 42}" : "M=on"
    String url = "https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=off&mod=off&nx=off&ss=off&mf=off&s=off&c=on&${geo}&start=${start}&end=${end}&b=${s.candleMin ?: 18}&${havdalah}&i=${s.israel == true ? 'on' : 'off'}"
    if (debugLogging) log.debug "mDash Holidays: fetch ${url}"
    try {
        httpGet([uri: url, timeout: 30]) { resp ->
            if (resp.status != 200) {
                state.calendar.error = "HebCal returned ${resp.status}."
                runIn(6 * 60 * 60, holidayFetchRetry)
                return
            }
            def data = resp.data
            def items = data?.items
            if (!(items instanceof List)) {
                state.calendar.error = "HebCal response had no items."
                runIn(6 * 60 * 60, holidayFetchRetry)
                return
            }
            state.calendar.boundaries = holidayBoundaries(items)
            state.calendar.holidays = holidayHolidayRows(items)
            state.calendar.query = holidayQueryKey()
            state.calendar.fetchedAt = now()
            state.calendar.error = ""
            log.info "mDash Holidays: calendar updated (${state.calendar.holidays.size()} holiday days)"
            holidayArm()
        }
    } catch (e) {
        state.calendar.error = "Could not reach HebCal."
        log.warn "mDash Holidays: fetch failed — ${e}"
        try { runIn(6 * 60 * 60, holidayFetchRetry) } catch (ignored) {}
    }
}

def holidayFetchRetry() { holidayFetch(true) }

def holidayBoundaries(items) {
    def out = []
    for (item in items) {
        def cat = item?.category?.toString()?.toLowerCase()
        if (cat != "candles" && cat != "havdalah") continue
        def at = holidayParseIso(item?.date?.toString())
        if (at == null) continue
        out << [at: at, kind: cat]
    }
    out.sort { a, b -> (a.at as long) <=> (b.at as long) }
    return out
}

def holidayHolidayRows(items) {
    def out = []
    for (item in items) {
        if (item?.category?.toString()?.toLowerCase() != "holiday") continue
        def occasion = holidayOccasionForHdate(item?.hdate?.toString())
        if (!occasion) continue
        def date = item?.date?.toString()
        if (!date || date.length() < 10) continue
        out << [date: date.substring(0, 10), hdate: item.hdate.toString(), occasion: occasion]
    }
    return out
}

def holidayParseIso(String value) {
    if (!value) return null
    try { return Date.parse("yyyy-MM-dd'T'HH:mm:ssX", value).getTime() } catch (e) {}
    def m = value =~ /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})([+-]\d{2}):(\d{2})/
    if (m.find()) {
        try { return Date.parse("yyyy-MM-dd'T'HH:mm:ssZ", "${m.group(1)}${m.group(2)}${m.group(3)}").getTime() } catch (e) {}
    }
    return null
}

def holidayOccasionForHdate(String hdate) {
    def m = (hdate ?: "") =~ /^(\d+)\s+([A-Za-z]+)\s+(\d+)/
    if (!m.find()) return null
    int day = m.group(1) as int
    String month = m.group(2)
    if (month == "Tishrei" && (day == 1 || day == 2)) return "roshHashana"
    if (month == "Tishrei" && day == 10) return "yomKippur"
    if (month == "Tishrei" && (day == 15 || day == 16)) return "sukkot"
    if (month == "Tishrei" && (day == 22 || day == 23)) return "shemini"
    if (month == "Nisan" && (day == 15 || day == 16)) return "pesachFirst"
    if (month == "Nisan" && (day == 21 || day == 22)) return "pesachLast"
    if (month == "Sivan" && (day == 6 || day == 7)) return "shavuot"
    return null
}

// --- expansion (mirrors holiday-core) ---

def holidayResolveTemplate(String occasionId, config, Set seen = null) {
    if (!occasionId) return null
    if (seen == null) seen = new HashSet()
    if (seen.contains(occasionId)) return null
    seen.add(occasionId)
    def stored = config?.occasions?.get(occasionId)?.toString()
    def choice = stored ? stored : (occasionId == "shabbat" ? "own" : "skip")
    if (choice == "skip") return null
    if (choice == "shabbat") return config?.templates?.shabbat ?: holidayEmptyTemplate()
    if (choice == "pesachFirst") return holidayResolveTemplate("pesachFirst", config, seen)
    return config?.templates?.get(occasionId) ?: config?.templates?.shabbat ?: holidayEmptyTemplate()
}

def holidayBuild(long nowMs) {
    return holidayBuildFrom(state.config, nowMs)
}

def holidayBuildFrom(config, long nowMs) {
    def days = holidayObservedDays(config)
    def spans = holidaySpans(days)
    long nearCut = nowMs + 17L * 24 * 60 * 60 * 1000
    def future = spans.findAll { s -> (s.end as long) > nowMs }.sort { a, b -> (a.start as long) <=> (b.start as long) }
    def nearSpans = future.findAll { s -> (s.start as long) < nearCut }
    def shown = new HashSet()
    for (s in nearSpans) holidaySpanOccasions(s).each { shown.add(it) }
    def extra = []
    for (span in future) {
        def ids = holidaySpanOccasions(span).findAll { it != "shabbat" }
        if (!ids || ids.every { shown.contains(it) }) continue
        extra << span
        ids.each { shown.add(it) }
    }
    def kept = (nearSpans + extra).sort { a, b -> (a.start as long) <=> (b.start as long) }
    def test = state.runtime?.testSpan
    if (test?.start && (test.end as long) > nowMs) {
        kept = [[id: "test", name: "Test span", start: test.start as long, end: test.end as long, occasion: "shabbat", days: [[date: "test", occasion: "shabbat", index: 0, isFirst: true, isLast: true, start: test.start as long, end: test.end as long]]]] + kept
    }
    def skipped = new HashSet((state.runtime?.skippedSpanIds ?: []).collect { it?.toString() })
    def rows = []
    def outSpans = []
    for (span in kept) {
        boolean isSkipped = skipped.contains(span.id?.toString())
        boolean isPaused = span.id?.toString() != "test" && holidaySpanPaused(span, config)
        def actions = (span.id == "test") ? holidayTestActions(span, config) : holidayExpandSpan(span, config)
        def warning = ""
        if (state.calendar?.error && span.id != "test") warning = state.calendar.error.toString()
        def missed = holidayMissedNote(span.id?.toString())
        if (missed) warning = warning ? "${warning} ${missed}" : missed
        boolean inProgress = (span.start as long) <= nowMs && (span.end as long) > nowMs
        rows << [
            spanId: span.id, name: span.name, start: span.start, end: span.end,
            occasion: span.occasion, badge: isSkipped ? "skipped" : holidayBadge(span, config),
            inProgress: inProgress, warning: warning, skipped: isSkipped, paused: isPaused
        ]
        outSpans << [
            id: span.id, name: span.name, start: span.start, end: span.end, occasion: span.occasion,
            days: span.days, actions: actions, warnings: holidaySameMinute(actions),
            skipped: isSkipped, paused: isPaused
        ]
    }
    rows.sort { a, b -> (a.start as long) <=> (b.start as long) }
    return [rows: rows, spans: outSpans]
}

def holidayBadge(span, config) {
    def id = span?.days ? span.days[0].occasion?.toString() : span?.occasion?.toString()
    if (!id || id == "shabbat" || id == "test") return "own schedule"
    def choice = config?.occasions?.get(id)?.toString() ?: "skip"
    if (choice == "shabbat") return "uses Shabbat"
    if (choice == "copy") return "based on Shabbat"
    if (choice == "pesachFirst") return "uses Pesach first days"
    if (choice == "own") return "own schedule"
    return "skipped"
}

def holidaySpanOccasions(span) {
    def ids = []
    for (d in (span?.days ?: [])) {
        def id = d?.occasion?.toString()
        if (id && !ids.contains(id)) ids << id
    }
    def top = span?.occasion?.toString()
    if (top && !ids.contains(top)) ids << top
    return ids
}

def holidaySpanHasOccasion(span, String occasion) {
    for (d in (span?.days ?: [])) if (d?.occasion?.toString() == occasion) return true
    return span?.occasion?.toString() == occasion
}

def holidayObservedDays(config) {
    def tz = holidayTz()
    def boundaries = state.calendar?.boundaries ?: []
    def yom = []
    def yomDates = new HashSet()
    for (h in (state.calendar?.holidays ?: [])) {
        if (!holidayResolveTemplate(h.occasion?.toString(), config)) continue
        def start = holidayCandlesBeforeNoon(boundaries, h.date.toString(), tz)
        def end = start == null ? null : holidayNextBoundary(boundaries, start as long)
        if (start == null || end == null) continue
        yom << [date: h.date, hdate: h.hdate, occasion: h.occasion, yomTov: true, start: start, end: end]
        yomDates.add(h.date.toString())
    }
    def days = []
    days.addAll(yom)
    def settings = config?.settings ?: [:]
    for (b in boundaries) {
        if (b.kind != "candles") continue
        def parts = holidayParts(b.at as long, tz)
        if (parts.weekday != "Fri") continue
        def saturday = holidayAddDays(parts.date, 1)
        if (yomDates.contains(saturday)) continue
        def end = holidayNextBoundary(boundaries, b.at as long)
        if (end == null) continue
        long start = b.at as long
        if (!yomDates.contains(parts.date)) start = holidayEarlyFriday(parts.date, start, settings, tz)
        days << [date: saturday, hdate: "", occasion: "shabbat", yomTov: false, start: start, end: end, fridayDate: parts.date]
    }
    days.sort { a, b -> (a.start as long) <=> (b.start as long) }
    return days
}

def holidayEarlyFriday(String friday, long candlesAt, settings, TimeZone tz) {
    def early = settings?.earlyFriday ?: [:]
    def type = early.type?.toString() ?: "off"
    if (type == "off") return candlesAt
    if (settings?.fridayOverrideDate?.toString() == friday) return candlesAt
    Long at = null
    if (type == "time" && early.value) at = holidayZonedMs(friday, early.value.toString(), tz)
    else if (type == "minutes") at = candlesAt - ((early.value ?: 0) as long) * 60000L
    if (at == null) return candlesAt
    return at < candlesAt ? at : candlesAt
}

def holidaySpans(days) {
    def spans = []
    Map cur = null
    for (day in days) {
        if (cur && Math.abs((cur.days[-1].end as long) - (day.start as long)) < 60000L) {
            cur.days << day
            cur.end = day.end
        } else {
            cur = [start: day.start, end: day.end, days: [day]]
            spans << cur
        }
    }
    for (span in spans) {
        def dates = []
        def names = []
        int i = 0
        for (d in span.days) {
            dates << d.date
            d.index = i
            d.isFirst = i == 0
            d.isLast = i == span.days.size() - 1
            def label = holidayOccasionLabel(d.occasion?.toString())
            if (!names.contains(label)) names << label
            i++
        }
        span.id = dates.join("+")
        span.name = names.join(" · ")
        span.occasion = span.days[0].occasion
    }
    return spans
}

def holidayOccasionLabel(String id) {
    switch (id) {
        case "shabbat": return "Shabbat"
        case "roshHashana": return "Rosh Hashana"
        case "yomKippur": return "Yom Kippur"
        case "sukkot": return "Sukkot"
        case "shemini": return "Shemini Atzeret / Simchat Torah"
        case "pesachFirst": return "Pesach, first days"
        case "pesachLast": return "Pesach, last days"
        case "shavuot": return "Shavuot"
        default: return id ?: "Holiday"
    }
}

def holidayExpandSpan(span, config) {
    def tz = holidayTz()
    def settings = config?.settings ?: [:]
    def actions = []
    long early = holidayStartEarly(span.start as long, settings)
    def frozen = state.runtime?.activeSpan
    if (frozen?.id?.toString() == span.id?.toString() && frozen.startRan == true && frozen.end) {
        // A running span keeps the end it started with.
    }
    actions << [id: "${span.id}|modeEnter", at: early, kind: "modeEnter", spanId: span.id, question: "modeEnter", groupIndex: 0, states: [], skipped: false, mode: settings.holidayMode?.toString() ?: ""]
    for (day in span.days) {
        def template = holidayResolveTemplate(day.occasion?.toString(), config) ?: holidayEmptyTemplate()
        long startAt = holidayStartEarly(day.start as long, settings)
        if (day.isFirst == true || template?.start?.repeatLaterNights == true) {
            def states = holidayCloneStates(template?.start?.states)
            if (states) actions << holidayDeviceAction(span, day, "start", 0, startAt, states, false, "")
        }
        for (bucket in ["night", "morning", "afternoon", "evening"]) {
            def groups = template[bucket]
            if (!(groups instanceof List)) continue
            int gi = 0
            for (group in groups) {
                def states = holidayCloneStates(group?.states)
                if (states && group?.time) {
                    Long at = holidayPlace(day, group.time.toString(), bucket, tz)
                    boolean outside = at == null || at < (day.start as long) || at >= (day.end as long)
                    actions << holidayDeviceAction(span, day, bucket, gi, at, states, outside, outside ? "outside this day" : "")
                }
                gi++
            }
        }
        def custom = template?.custom
        if (custom instanceof List) {
            int ci = 0
            for (entry in custom) {
                def states = holidayCloneStates(entry?.states)
                if (states) {
                    def placed = holidayCustomAt(entry, day, tz)
                    boolean skip = placed.skip == true
                    Long at = placed.at as Long
                    boolean outside = !skip && (at == null || (entry?.anchor?.toString() != "after-end" && (at < (day.start as long) || at >= (day.end as long))))
                    if (!skip) actions << holidayDeviceAction(span, day, "custom", ci, at, states, outside, outside ? "outside this day" : "")
                }
                ci++
            }
        }
    }
    def last = span.days[-1]
    def endTemplate = holidayResolveTemplate(last.occasion?.toString(), config) ?: holidayEmptyTemplate()
    def endStates = holidayCloneStates(endTemplate?.end?.states)
    if (endStates) {
        long endAt = span.end as long
        if (frozen?.id?.toString() == span.id?.toString() && frozen.startRan == true && frozen.end) endAt = frozen.end as long
        actions << holidayDeviceAction(span, last, "end", 0, endAt, endStates, false, "")
    }
    long exitAt = span.end as long
    if (frozen?.id?.toString() == span.id?.toString() && frozen.startRan == true && frozen.end) exitAt = frozen.end as long
    actions << [id: "${span.id}|modeExit", at: exitAt, kind: "modeExit", spanId: span.id, question: "modeExit", groupIndex: 0, states: [], skipped: false, mode: settings.endMode?.toString() ?: ""]
    actions.sort { a, b ->
        long d = (a.at ?: 0L) - (b.at ?: 0L)
        if (d != 0) return d <=> 0
        return holidayQuestionOrder(a.question) <=> holidayQuestionOrder(b.question)
    }
    return actions
}

def holidayTestActions(span, config) {
    def template = holidayResolveTemplate("shabbat", config) ?: holidayEmptyTemplate()
    def settings = config?.settings ?: [:]
    def day = span.days[0]
    def actions = []
    actions << [id: "test|modeEnter", at: span.start, kind: "modeEnter", spanId: "test", question: "modeEnter", groupIndex: 0, states: [], skipped: false, mode: settings.holidayMode?.toString() ?: ""]
    def startStates = holidayCloneStates(template?.start?.states)
    if (startStates) actions << holidayDeviceAction(span, day, "start", 0, span.start as long, startStates, false, "")
    def endStates = holidayCloneStates(template?.end?.states)
    if (endStates) actions << holidayDeviceAction(span, day, "end", 0, span.end as long, endStates, false, "")
    actions << [id: "test|modeExit", at: span.end, kind: "modeExit", spanId: "test", question: "modeExit", groupIndex: 0, states: [], skipped: false, mode: settings.endMode?.toString() ?: ""]
    return actions
}

def holidayDeviceAction(span, day, String question, int groupIndex, Long at, states, boolean skipped, String reason) {
    return [
        id: "${span.id}|d${day.index}|${question}|${groupIndex}",
        at: at, kind: "devices", spanId: span.id, dayDate: day.date, dayIndex: day.index,
        occasion: day.occasion, question: question, groupIndex: groupIndex,
        states: states, skipped: skipped, skipReason: reason
    ]
}

def holidayQuestionOrder(String q) {
    if (q == "modeEnter") return 0
    if (q == "start") return 1
    if (q == "end") return 8
    if (q == "modeExit") return 9
    return 4
}

def holidayStartEarly(long at, settings) {
    long n = 0
    try { n = (settings?.startEarlyMin ?: 0) as long } catch (e) { n = 0 }
    return at - n * 60000L
}

def holidayPlace(day, String hhmm, String bucket, TimeZone tz) {
    if (bucket == "night") {
        def parts = holidayParts(day.start as long, tz)
        def date = parts.date
        long at = holidayZonedMs(date, hhmm, tz)
        if (at <= (day.start as long)) {
            date = holidayAddDays(date, 1)
            at = holidayZonedMs(date, hhmm, tz)
        }
        if (at - (day.start as long) > 12L * 60 * 60 * 1000) return null
        return at
    }
    return holidayZonedMs(day.date.toString(), hhmm, tz)
}

def holidayCustomAt(entry, day, TimeZone tz) {
    def anchor = entry?.anchor?.toString() ?: "clock-day"
    def days = entry?.days?.toString() ?: "every"
    if (days == "first" && day.isFirst != true) return [skip: true]
    if (days == "last" && day.isLast != true) return [skip: true]
    if (anchor == "clock-night") return [at: holidayPlace(day, entry.value?.toString() ?: "00:00", "night", tz)]
    if (anchor == "clock-day") return [at: holidayZonedMs(day.date.toString(), entry.value?.toString() ?: "12:00", tz)]
    long mins = 0
    try { mins = (entry?.value ?: 0) as long } catch (e) { mins = 0 }
    if (anchor == "after-start") return [at: (day.start as long) + mins * 60000L]
    if (anchor == "before-end") return [at: (day.end as long) - mins * 60000L]
    if (anchor == "after-end") return [at: (day.end as long) + mins * 60000L]
    def sun = holidaySun(day.date.toString())
    if (!sun) return [at: null]
    long base = anchor == "sunrise" ? (sun.sunrise as long) : (sun.sunset as long)
    return [at: base + mins * 60000L]
}

def holidaySun(String date) {
    try {
        def parts = date.split("-")
        Calendar cal = Calendar.getInstance(holidayTz())
        cal.set(Calendar.YEAR, parts[0] as int)
        cal.set(Calendar.MONTH, (parts[1] as int) - 1)
        cal.set(Calendar.DATE, parts[2] as int)
        cal.set(Calendar.HOUR_OF_DAY, 12)
        def when = cal.getTime()
        return [
            sunrise: parent.scheduleSunMs("sunrise", 0, when),
            sunset: parent.scheduleSunMs("sunset", 0, when)
        ]
    } catch (e) { return null }
}

def holidayDeviceKinds() {
    try {
        def kinds = parent.holidaySupportedKinds()
        if (kinds instanceof List && kinds) return kinds.collect { it?.toString() }.findAll { it }
    } catch (e) {}
    return ["light", "outlet"]
}

def holidayWhole(v, int min, int max) {
    if (v == null) return null
    def text = v.toString().trim()
    if (!text) return null
    try {
        int n = Math.round(Double.parseDouble(text)) as int
        if (n < min) n = min
        if (n > max) n = max
        return n
    } catch (e) { return null }
}

def holidayThermostatFields(s) {
    try {
        def n = parent.thermostatSettingNormalized(s)
        if (n instanceof Map) return n
    } catch (e) {}
    def mode = s?.mode?.toString()?.trim()
    def fan = s?.fanMode?.toString()?.trim()
    return [mode: mode ?: null, heat: s?.heat, cool: s?.cool, fanMode: fan ?: null]
}

def holidayCloneStates(raw) {
    def out = []
    if (!(raw instanceof List)) return out
    for (s in raw) {
        def id = s?.id?.toString()
        if (!id) continue
        def kind = s?.kind?.toString()
        if (kind == "blind") {
            out << [id: id, kind: "blind", open: s?.open == true, position: s?.open == true ? holidayWhole(s?.position, 1, 100) : null]
        } else if (kind == "fan") {
            def speed = s?.speed?.toString()?.trim()
            out << [id: id, kind: "fan", on: s?.on == true, speed: (s?.on == true && speed) ? speed : null]
        } else if (kind == "lock") {
            out << [id: id, kind: "lock", locked: s?.locked != false]
        } else if (kind == "thermostat") {
            def n = holidayThermostatFields(s)
            out << [id: id, kind: "thermostat", mode: n?.mode, heat: n?.heat, cool: n?.cool, fanMode: n?.fanMode]
        } else if (!kind || kind == "light" || kind == "outlet") {
            out << [id: id, kind: kind == "outlet" ? "outlet" : "light", on: s?.on == true, level: s?.level, ct: s?.ct]
        }
    }
    return out
}

def holidayCommandSig(s) {
    def kind = s?.kind?.toString() ?: "light"
    if (kind == "blind") return "blind|${s.open == true}|${s.position}"
    if (kind == "fan") return "fan|${s.on == true}|${s.speed}"
    if (kind == "lock") return "lock|${s.locked != false}"
    if (kind == "thermostat") return "tstat|${s.mode}|${s.heat}|${s.cool}|${s.fanMode}"
    return "${kind}|${s.on == true}|${s.level}|${s.ct}"
}

def holidayTemplateSlots(template) {
    def slots = []
    if (!(template instanceof Map)) return slots
    slots << [label: "start", states: template?.start?.states]
    for (bucket in ["night", "morning", "afternoon", "evening"]) {
        def groups = template[bucket]
        if (!(groups instanceof List)) continue
        int i = 0
        for (g in groups) {
            i++
            slots << [label: "${bucket} ${i}", states: g?.states]
        }
    }
    slots << [label: "end", states: template?.end?.states]
    def custom = template?.custom
    if (custom instanceof List) {
        int i = 0
        for (c in custom) {
            i++
            slots << [label: "custom ${i}", states: c?.states]
        }
    }
    return slots
}

def holidayErrorMessage(errs) {
    for (err in (errs ?: [])) {
        if (err?.error) return err.error.toString()
    }
    return "A device is listed twice with different commands."
}

def holidayTemplateErrors(template) {
    if (!(template instanceof Map)) return []
    def errors = []
    def allowed = new HashSet(holidayDeviceKinds())
    for (slot in holidayTemplateSlots(template)) {
        def seen = [:]
        def both = []
        def states = holidayCloneStates(slot.states)
        for (s in states) {
            def sig = holidayCommandSig(s)
            if (seen.containsKey(s.id)) {
                if (seen[s.id] != sig && !both.contains(s.id)) both << s.id
            } else seen[s.id] = sig
            if (!allowed.contains(s.kind?.toString() ?: "light")) {
                errors << [label: slot.label, ids: [s.id], error: "Update Modern Dashboard to schedule this device."]
            }
            if (s.kind?.toString() == "thermostat") {
                def err = null
                try { err = parent.thermostatSettingError(s) } catch (e) { err = null }
                if (err) errors << [label: slot.label, ids: [s.id], error: err]
            }
        }
        if (both) errors << [label: slot.label, ids: both]
    }
    return errors
}

def holidaySameMinute(actions) {
    def buckets = [:]
    for (a in actions) {
        if (a.kind != "devices" || a.skipped == true || a.at == null) continue
        long minute = ((a.at as long) / 60000L) as long
        for (s in holidayCloneStates(a.states ?: [])) {
            def key = "${minute}|${s.id}"
            if (!buckets[key]) buckets[key] = new HashSet()
            buckets[key].add(holidayCommandSig(s))
        }
    }
    def ids = []
    buckets.each { key, set ->
        if (set.size() > 1) ids << key.toString().split("\\|")[1]
    }
    return ids.unique()
}

def holidayCandlesBeforeNoon(boundaries, String date, TimeZone tz) {
    long noon = holidayZonedMs(date, "12:00", tz)
    Long best = null
    for (b in boundaries) {
        if (b.kind != "candles") continue
        long at = b.at as long
        if (at < noon && (best == null || at > best)) best = at
    }
    return best
}

def holidayNextBoundary(boundaries, long at) {
    for (b in boundaries) if ((b.at as long) > at) return b.at as long
    return null
}

def holidayParts(long ms, TimeZone tz) {
    Calendar cal = Calendar.getInstance(tz ?: TimeZone.getDefault())
    cal.setTimeInMillis(ms)
    String date = String.format("%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DATE))
    int dow = cal.get(Calendar.DAY_OF_WEEK)
    String weekday = ["", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow]
    return [date: date, hour: cal.get(Calendar.HOUR_OF_DAY), minute: cal.get(Calendar.MINUTE), weekday: weekday]
}

def holidayAddDays(String date, int n) {
    def p = date.split("-")
    Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
    cal.set(Calendar.YEAR, p[0] as int)
    cal.set(Calendar.MONTH, (p[1] as int) - 1)
    cal.set(Calendar.DATE, (p[2] as int) + n)
    cal.set(Calendar.HOUR_OF_DAY, 12)
    return String.format("%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DATE))
}

def holidayZonedMs(String date, String hhmm, TimeZone tz) {
    def p = date.split("-")
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

// --- runtime ---

def holidayActiveSpan(long nowMs) {
    def built = holidayBuild(nowMs)
    for (span in built.spans) {
        if (span.skipped == true || span.paused == true) continue
        if ((span.start as long) <= nowMs && (span.end as long) > nowMs) return span
    }
    return null
}

def holidayArm() {
    holidayEnsureState()
    try { unschedule("holidayFire") } catch (e) {}
    if (holidayPaused()) return
    if (!holidayPreflight().ok && !state.runtime?.testSpan) return
    if (!state.calendar?.boundaries && !state.runtime?.testSpan) {
        holidayFetch(false)
        return
    }
    def built = holidayBuild(now())
    long nowMs = now()
    Long nextAt = null
    def done = state.runtime.doneIds ?: [:]
    for (span in built.spans) {
        if (span.skipped == true || span.paused == true) continue
        for (a in (span.actions ?: [])) {
            if (a.skipped == true) continue
            if (done[a.id?.toString()] != null) continue
            long at = (a.at ?: 0L) as long
            if (at <= nowMs) continue
            if (nextAt == null || at < nextAt) nextAt = at
        }
    }
    if (nextAt != null) {
        runOnce(new Date(nextAt), holidayFire)
        if (debugLogging) log.debug "mDash Holidays: next action ${new Date(nextAt)}"
    }
}

def holidayFire() {
    holidayReconcile(false)
}

def holidayCatchUp() {
    holidayReconcile(true)
}

def holidayReconcile(boolean fromBoot) {
    holidayEnsureState()
    if (holidayPaused()) return
    long nowMs = now()
    holidayPruneDone(nowMs)
    def built = holidayBuild(nowMs)
    def done = state.runtime.doneIds ?: [:]
    def due = []
    for (span in built.spans) {
        if (span.skipped == true || span.paused == true) continue
        due.addAll(span.actions ?: [])
    }
    due = due.findAll { a -> a.skipped != true && a.at != null && done[a.id?.toString()] == null }
    due.sort { a, b ->
        int byTime = (a.at as long) <=> (b.at as long)
        if (byTime != 0) return byTime
        return holidayQuestionOrder(a.question?.toString()) <=> holidayQuestionOrder(b.question?.toString())
    }
    long twoHours = 2L * 60 * 60 * 1000
    def onTime = []
    def missed = []
    for (a in due) {
        long at = a.at as long
        if (at > nowMs + 15000L) continue
        if (at >= nowMs - 20000L) onTime << a
        else if (a.kind == "devices" && (nowMs - at) <= twoHours) missed << a
        else holidayMarkDone(a.id?.toString(), nowMs, "skipped")
    }
    for (a in onTime) holidayExecute(a, nowMs)
    def doneNow = state.runtime.doneIds ?: [:]
    def latest = [:]
    for (a in missed) {
        if (doneNow[a.id?.toString()] != null) continue
        for (s in (a.states ?: [])) latest["${s.kind}:${s.id}"] = [id: a.id, at: a.at, state: s]
    }
    holidayFixMode(built, nowMs)
    def replay = []
    def ran = new HashSet()
    for (row in latest.values().sort { a, b -> (a.at as long) <=> (b.at as long) }) {
        if (row.state?.kind?.toString() == "lock" && row.state?.locked == false) {
            log.info "mDash Holidays: skipped a late unlock for ${row.state?.id}"
        } else {
            replay << row.state
            ran.add(row.id.toString())
        }
    }
    for (a in missed) {
        if (ran.contains(a.id?.toString())) continue
        def states = a.states ?: []
        def onlyUnlocks = states && states.every { it?.kind?.toString() == "lock" && it?.locked == false }
        holidayMarkDone(a.id?.toString(), nowMs, onlyUnlocks ? "skipped" : "collapsed")
    }
    boolean held = state.runtime.activeSpan?.held == true
    if (replay && !held && holidayCurrentMode() == state.config.settings.holidayMode?.toString()) {
        parent.holidayRunAction(replay)
        for (id in ran) holidayMarkDone(id, nowMs, "replayed")
        holidayRemember("", fromBoot ? "replayed after restart" : "replayed after delay")
    }
    holidayArm()
}

def holidayExecute(a, long nowMs) {
    def settings = state.config.settings
    def holidayMode = settings.holidayMode?.toString()
    def endMode = settings.endMode?.toString()
    def current = holidayCurrentMode()
    def active = state.runtime.activeSpan ?: [:]
    if (a.kind == "modeEnter") {
        if (holidayDoNotStart(current)) {
            state.runtime.activeSpan = [id: a.spanId, start: a.at, end: holidaySpanEnd(a.spanId), held: true, overridden: false, startRan: false, ended: false]
            holidayMarkDone(a.id?.toString(), nowMs, "held")
            log.info "mDash Holidays: held — hub is ${current}"
            return
        }
        holidaySetMode(holidayMode)
        state.runtime.activeSpan = [id: a.spanId, start: a.at, end: holidaySpanEnd(a.spanId), held: false, overridden: false, startRan: true, ended: false]
        holidayMarkDone(a.id?.toString(), nowMs, "mode")
        return
    }
    if (a.kind == "modeExit") {
        if (active.held != true && active.overridden != true && holidayCurrentMode() == holidayMode) holidaySetMode(endMode)
        if (active instanceof Map) { active.ended = true; state.runtime.activeSpan = active }
        if (a.spanId?.toString() == "test") state.runtime.testSpan = null
        holidayMarkDone(a.id?.toString(), nowMs, "mode")
        holidayRemember(a.spanId?.toString(), "ended")
        return
    }
    if (state.runtime.activeSpan?.held == true) {
        holidayMarkDone(a.id?.toString(), nowMs, "held")
        return
    }
    if (holidayCurrentMode() != holidayMode) {
        holidayMarkDone(a.id?.toString(), nowMs, "skipped")
        log.info "mDash Holidays: skipped ${a.id} — hub is not in ${holidayMode}"
        return
    }
    def result = parent.holidayRunAction(a.states ?: [])
    holidayMarkDone(a.id?.toString(), nowMs, "ran")
    log.info "mDash Holidays: ran ${a.question} — ${result}"
    holidayRemember(a.spanId?.toString(), "ran ${a.question}")
}

def holidayFixMode(built, long nowMs) {
    def active = state.runtime.activeSpan
    def settings = state.config.settings
    def holidayMode = settings.holidayMode?.toString()
    def current = holidayCurrentMode()
    def span = null
    for (s in built.spans) {
        if (s.paused == true || s.skipped == true) continue
        if ((s.start as long) <= nowMs && (s.end as long) > nowMs) { span = s; break }
    }
    if (active?.held == true) return
    if (active?.overridden == true) return
    if (span && (active == null || active.id?.toString() != span.id?.toString() || active.startRan != true)) {
        if (holidayDoNotStart(current)) {
            state.runtime.activeSpan = [id: span.id, start: span.start, end: span.end, held: true, overridden: false, startRan: false, ended: false]
            return
        }
        holidaySetMode(holidayMode)
        state.runtime.activeSpan = [id: span.id, start: span.start, end: span.end, held: false, overridden: false, startRan: true, ended: false]
        return
    }
    if (active?.startRan == true && span && active.id?.toString() == span.id?.toString() && current != holidayMode) {
        holidaySetMode(holidayMode)
        return
    }
    for (s in built.spans) {
        if (s.paused == true || s.skipped == true) continue
        if ((s.end as long) <= nowMs && (s.end as long) > nowMs - 36L * 60 * 60 * 1000) {
            if (current == holidayMode && active?.id?.toString() == s.id?.toString() && active?.ended != true && active?.held != true && active?.overridden != true) {
                holidaySetMode(settings.endMode?.toString())
                active.ended = true
                state.runtime.activeSpan = active
            }
        }
    }
}

def holidayDoNotStart(String mode) {
    def list = state.config?.settings?.doNotStartModes
    if (!(list instanceof List)) return false
    for (m in list) if (m?.toString() == mode) return true
    return false
}

def holidaySpanEnd(spanId) {
    def built = holidayBuild(now())
    for (s in built.spans) if (s.id?.toString() == spanId?.toString()) return s.end
    return null
}

def holidaySetMode(String mode) {
    if (!mode) return
    if (holidayCurrentMode() == mode) return
    try {
        state.runtime.changingMode = true
        location.setMode(mode)
        log.info "mDash Holidays: mode → ${mode}"
    } catch (e) {
        log.warn "mDash Holidays: mode change failed — ${e}"
    } finally {
        state.runtime.changingMode = false
    }
}

def holidayCurrentMode() {
    try { return location?.mode?.toString() ?: "" } catch (e) { return "" }
}

def holidayMarkDone(String id, long ts, String how) {
    if (!id) return
    if (!(state.runtime.doneIds instanceof Map)) state.runtime.doneIds = [:]
    state.runtime.doneIds[id] = ts
}

def holidayMarkPassedDone() {
    long nowMs = now()
    try {
        def built = holidayBuild(nowMs)
        for (span in built.spans) {
            for (a in (span.actions ?: [])) {
                if (a.skipped == true || a.at == null) continue
                if ((a.at as long) <= nowMs) holidayMarkDone(a.id?.toString(), nowMs, "passed")
            }
        }
    } catch (e) {
        log.warn "mDash Holidays: could not mark past actions — ${e}"
    }
}

def holidayPruneDone(long nowMs) {
    def next = [:]
    (state.runtime.doneIds ?: [:]).each { id, ts ->
        long t = 0
        try { t = ts as long } catch (e) { t = 0 }
        if (nowMs - t < 4L * 24 * 60 * 60 * 1000) next[id] = ts
    }
    state.runtime.doneIds = next
}

def holidayRemember(String spanId, String note) {
    def hist = state.runtime.history instanceof List ? state.runtime.history : []
    hist << [spanId: spanId, note: note, ts: now()]
    if (hist.size() > 10) hist = hist[-10..-1]
    state.runtime.history = hist
}

def holidayMissedNote(String spanId) {
    def notes = []
    for (h in (state.runtime.history ?: [])) {
        if (h?.spanId?.toString() == spanId && h?.note?.toString()?.contains("skipped")) notes << "Missed while the hub was offline"
    }
    return notes ? notes[0] : ""
}

def holidayConflicts() {
    def mode = state.config?.settings?.holidayMode?.toString() ?: ""
    def out = []
    try {
        def parsed = parent.parseSchedulesMapResult()
        def map = parsed?.map instanceof Map ? parsed.map : [:]
        map.each { id, s ->
            if (!s || s.enabled == false) return
            def only = s.onlyInModes instanceof List ? s.onlyInModes : []
            boolean triggerMode = s?.trigger?.kind?.toString() == "mode" && s?.trigger?.mode?.toString() == mode
            boolean setsMode = s?.action?.target?.toString() == "hubMode" && s?.action?.mode?.toString() == mode
            boolean unrestricted = !only && s?.trigger?.kind?.toString() != "mode"
            boolean restricted = false
            for (m in only) if (m?.toString() == mode) restricted = true
            if (triggerMode || setsMode || unrestricted || restricted) {
                def devices = []
                if (s?.action?.states instanceof List) {
                    for (st in s.action.states) if (st?.id != null) devices << st.id.toString()
                }
                if (s?.action?.target?.toString() == "thermostats" && s?.action?.devices instanceof List) {
                    for (devId in s.action.devices) if (devId != null && !devices.contains(devId.toString())) devices << devId.toString()
                }
                out << [id: id.toString(), name: s?.name?.toString() ?: "Untitled schedule", devices: devices]
            }
        }
    } catch (e) {}
    return out
}
