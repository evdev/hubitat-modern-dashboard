function renderCalendars() {
  const box = ce("div");
  if (!(model.calendars || []).length && !checkResult) {
    box.appendChild(note("Paste the secret iCal link from Google Calendar. In Google Calendar, open the calendar's settings and copy the secret address in iCal format. The hub stores it and does not show it again."));
  }
  for (const cal of model.calendars || []) {
    const card = ce("div", "sched-row");
    const head = ce("div", "synagogue-name-row");
    const title = ce("strong");
    title.textContent = cal.name || "Calendar";
    head.appendChild(title);
    card.appendChild(head);
    card.appendChild(noteLine((cal.mask || "••••••") + (model.ical?.fetchedAt ? " · Updated " + ago(model.ical.fetchedAt) : "") + (cal.bookAll ? " · Every event is a booking" : "")));
    card.appendChild(ghost("Remove", () => {
      const previous = { ...cal };
      offerUndo("Removed " + (cal.name || "that calendar") + ".", () => saveOp({ op: "calendar", calendar: previous }));
      saveOp({ op: "deleteCalendar", id: cal.id });
    }, true));
    box.appendChild(card);
  }
  box.appendChild(sectionTitle("Add a calendar"));
  box.appendChild(field("Calendar name", "text", calendarDraft.name, (v) => { calendarDraft.name = v; }, "cal-name"));
  const link = field("Secret link", "password", calendarDraft.url, (v) => { calendarDraft.url = v; }, "cal-url");
  const input = link.querySelector("input");
  if (input) { input.placeholder = "https or webcal link"; input.autocomplete = "off"; }
  box.appendChild(link);
  box.appendChild(checkField("Treat everything on this calendar as a booking", calendarDraft.bookAll, (on) => { calendarDraft.bookAll = on; render(); }));
  if (calendarDraft.bookAll) {
    const space = ce("label", "synagogue-field");
    space.appendChild(text("Space"));
    const sel = ce("select");
    spaceChoices(sel, calendarDraft.spaceId);
    sel.addEventListener("change", () => { calendarDraft.spaceId = sel.value; });
    space.appendChild(sel);
    box.appendChild(space);
  }
  box.appendChild(ghost("Check link", () => checkLink()));
  if (checkResult?.error) box.appendChild(banner(checkResult.error));
  if (checkResult?.ok) {
    box.appendChild(note("Found " + checkResult.count + " events in the next 90 days."));
    for (const group of checkResult.groups || []) {
      const card = ce("div", "sched-row");
      const choice = groupChoice(group.title);
      card.appendChild(note(group.title + " ×" + group.count));
      const times = (group.next || []).map((ms) => fmtDate(isoFromMs(ms)) + " " + fmtTime(ms)).join(" · ");
      if (times) card.appendChild(noteLine(times));
      if (!calendarDraft.bookAll) {
        card.appendChild(checkField("Ignore", choice.ignore, (on) => { choice.ignore = on; }));
        if (!choice.ignore) {
          const space = ce("label", "synagogue-field");
          space.appendChild(text("Space"));
          const sel = ce("select");
          spaceChoices(sel, choice.spaceId);
          sel.addEventListener("change", () => { choice.spaceId = sel.value; });
          space.appendChild(sel);
          card.appendChild(space);
          card.appendChild(field("Show it as", "text", choice.name, (v) => { choice.name = v; }, "as-" + group.title));
        }
      }
      box.appendChild(card);
    }
    for (const row of checkResult.unsupported || []) {
      box.appendChild(note((row.title || "An event") + ": " + (row.reason || "This repeat pattern is not supported yet.")));
    }
  }
  box.appendChild(primary("Save calendar", () => saveCalendar()));
  box.appendChild(sectionTitle("Title to space"));
  box.appendChild(note("If a calendar title or location contains this text, it uses that space. Ignored titles are left off the schedule."));
  for (const rule of model.titleRules || []) {
    const space = (model.spaces || []).find((item) => item.id === rule.spaceId);
    const card = ce("div", "sched-row");
    card.appendChild(note((rule.ignore ? "Ignore " : "") + (rule.field === "location" ? "Location" : "Title") + " “" + rule.contains + "”" + (rule.ignore ? "" : " uses " + (space?.name || "a space")) + (rule.name ? " as " + rule.name : "")));
    card.appendChild(ghost("Remove", () => saveOp({ op: "deleteTitleRule", id: rule.id }), true));
    box.appendChild(card);
  }
  box.appendChild(chips([["title", "Title"], ["location", "Location"]], ruleDraft.field, (id) => { ruleDraft.field = id; render(); }));
  box.appendChild(field("Contains", "text", ruleDraft.contains, (v) => { ruleDraft.contains = v; }, "rule"));
  box.appendChild(checkField("Ignore these", ruleDraft.ignore, (on) => { ruleDraft.ignore = on; render(); }));
  if (!ruleDraft.ignore) {
    const space = ce("label", "synagogue-field");
    space.appendChild(text("Space"));
    const sel = ce("select");
    spaceChoices(sel, ruleDraft.spaceId);
    sel.addEventListener("change", () => { ruleDraft.spaceId = sel.value; });
    space.appendChild(sel);
    box.appendChild(space);
    box.appendChild(field("Show it as", "text", ruleDraft.name, (v) => { ruleDraft.name = v; }, "rule-name"));
  }
  box.appendChild(ghost("Save title rule", () => saveOp({ op: "titleRule", rule: { ...ruleDraft } })));
  box.appendChild(sectionTitle("One-time bookings"));
  for (const booking of model.bookings || []) {
    const space = (model.spaces || []).find((item) => item.id === booking.spaceId);
    const card = ce("div", "sched-row");
    card.appendChild(note(booking.name + " · " + fmtDate(booking.date) + " " + booking.start + " · " + (space?.name || "")));
    card.appendChild(ghost("Remove", () => {
      offerUndo("Removed " + booking.name + ".", () => saveOp({ op: "booking", booking }));
      saveOp({ op: "deleteBooking", id: booking.id });
    }, true));
    box.appendChild(card);
  }
  box.appendChild(field("Booking name", "text", bookingDraft.name, (v) => { bookingDraft.name = v; }, "book"));
  const bookSpace = ce("label", "synagogue-field");
  bookSpace.appendChild(text("Space"));
  const bookSel = ce("select");
  spaceChoices(bookSel, bookingDraft.spaceId);
  bookSel.addEventListener("change", () => { bookingDraft.spaceId = bookSel.value; });
  bookSpace.appendChild(bookSel);
  box.appendChild(bookSpace);
  box.appendChild(field("Date", "date", bookingDraft.date, (v) => { bookingDraft.date = v; }));
  box.appendChild(field("Start", "time", bookingDraft.start, (v) => { bookingDraft.start = v; }));
  box.appendChild(field("Lasts minutes", "number", bookingDraft.minutes, (v) => { bookingDraft.minutes = v; }));
  box.appendChild(primary("Add booking", () => saveOp({
    op: "booking",
    booking: { name: bookingDraft.name, spaceId: bookingDraft.spaceId || bookSel.value, date: bookingDraft.date, start: bookingDraft.start, minutes: Number(bookingDraft.minutes) || 60 },
  })));
  return box;
}

function groupChoice(title) {
  if (!checkResult.choices) checkResult.choices = {};
  if (!checkResult.choices[title]) checkResult.choices[title] = { spaceId: (model.spaces || [])[0]?.id || "", name: "", ignore: false };
  return checkResult.choices[title];
}
function isoFromMs(ms) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Number(ms))); }
  catch (e) { return ""; }
}
async function checkLink() {
  if (!calendarDraft.url.trim()) { flash("Paste the secret iCal link.", true); return; }
  const id = "cal-" + Date.now();
  calendarDraft.id = id;
  try {
    const res = await post("synagogue/preview", { op: "checkCalendar", revision: model.revision, calendar: { id, name: calendarDraft.name, url: calendarDraft.url } });
    checkResult = res;
    render();
  } catch (e) {
    checkResult = { error: e.message };
    render();
  }
}
async function saveCalendar() {
  const calendar = { id: calendarDraft.id || ("cal-" + Date.now()), name: calendarDraft.name, url: calendarDraft.url, bookAll: !!calendarDraft.bookAll, spaceId: calendarDraft.spaceId };
  const ok = await saveOp({ op: "calendar", calendar });
  if (!ok) return;
  if (!calendar.bookAll && checkResult?.groups) {
    for (const group of checkResult.groups) {
      const choice = checkResult.choices?.[group.title];
      if (!choice) continue;
      await saveOp({ op: "titleRule", rule: { contains: group.title, spaceId: choice.spaceId, field: "title", name: choice.name, ignore: !!choice.ignore } });
    }
  }
  calendarDraft = { name: "", url: "", bookAll: false, spaceId: "" };
  checkResult = null;
  render();
}
