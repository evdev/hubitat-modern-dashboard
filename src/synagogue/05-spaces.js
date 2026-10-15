function renderSpaces() {
  const box = ce("div");
  if (!(model.spaces || []).length) box.appendChild(note("Add a room, then choose the lights, locks, and thermostats it should run."));
  for (const space of model.spaces || []) {
    const b = ce("button", "sched-row");
    b.type = "button";
    const head = ce("div", "synagogue-name-row");
    const name = ce("span", "sched-row-name");
    name.textContent = space.name;
    head.appendChild(name);
    b.appendChild(head);
    b.appendChild(noteLine(spaceSummary(space)));
    b.addEventListener("click", () => { editingSpace = structuredClone(space); view = "space"; render(); });
    box.appendChild(b);
  }
  box.appendChild(primary("Add a space", () => {
    editingSpace = { id: "sp-" + Date.now(), name: "", stayOnGapMin: 45, controls: [], cues: [] };
    view = "space";
    render();
  }));
  return box;
}

function spaceSummary(space) {
  const counts = {};
  for (const control of space.controls || []) counts[control.kind] = (counts[control.kind] || 0) + (control.devices || []).length;
  const bits = [];
  for (const [kind, n] of Object.entries(counts)) bits.push(n + " " + (n === 1 ? KIND_LABEL[kind].toLowerCase() : KIND_LABEL[kind].toLowerCase() + "s"));
  const cues = (space.cues || []).length;
  const users = spaceUserNames(space.id).length;
  return (bits.join(", ") || "No devices") + " · " + cues + (cues === 1 ? " cue" : " cues") + " · " + users + (users === 1 ? " service" : " services");
}
function spaceUserNames(id) {
  const names = [];
  for (const row of model.menu || []) {
    for (const entry of resolvedEntries(row.id)) if (entry.spaceId === id && entry.name) names.push(entry.name);
  }
  for (const booking of model.bookings || []) if (booking.spaceId === id) names.push(booking.name);
  for (const rule of model.titleRules || []) if (rule.spaceId === id && !rule.ignore) names.push(rule.contains);
  return names;
}

function renderSpace() {
  const space = editingSpace;
  const box = ce("div");
  box.appendChild(field("Name", "text", space.name, (v) => { space.name = v; }, "space-name"));
  box.appendChild(field("Stay on if the next event is within minutes", "number", String(space.stayOnGapMin ?? 45), (v) => { space.stayOnGapMin = Number(v); }));
  box.appendChild(note("If the next event in this room starts within that many minutes, the lights stay on."));
  box.appendChild(sectionTitle("Devices"));
  box.appendChild(spaceDevicePicker());
  box.appendChild(sectionTitle("Controls"));
  if (!(space.controls || []).length) box.appendChild(note("Choose a device above. Lights stay together until you give one its own control."));
  for (const control of space.controls || []) box.appendChild(controlCard(control));
  box.appendChild(sectionTitle("Standard setup"));
  box.appendChild(cueTimeline(space));
  for (const cue of space.cues || []) box.appendChild(cueCard(cue));
  box.appendChild(ghost("Add cue", () => {
    const control = (space.controls || [])[0];
    if (!control) { flash("Choose a device first", true); return; }
    space.cues.push({ id: "cu-" + Date.now(), anchor: "start", offsetMin: -2, controlId: control.id, action: control.kind === "thermostat" ? "comfort" : "on", appliesTo: [] });
    render();
  }));
  const bar = ce("div", "synagogue-bar");
  bar.appendChild(ghost("Back", () => { view = "spaces"; render(); }));
  if ((model.spaces || []).some((item) => item.id === space.id)) bar.appendChild(ghost("Remove", () => removeSpace(space), true));
  bar.appendChild(primary("Save space", () => saveOp({ op: "space", space }, "spaces")));
  box.appendChild(bar);
  return box;
}

function removeSpace(space) {
  const users = spaceUserNames(space.id);
  if (users.length) {
    openSheet(space.name + " is still in use", (box) => {
      box.appendChild(note("Move these off " + space.name + " first: " + users.slice(0, 6).join(", ") + "."));
    });
    return;
  }
  const previous = structuredClone(space);
  offerUndo("Removed " + (space.name || "that space") + ".", () => saveOp({ op: "space", space: previous }, "spaces"));
  saveOp({ op: "deleteSpace", id: space.id }, "spaces");
}

function controlCard(control) {
  const card = ce("div", "sched-row");
  card.appendChild(field("Control name", "text", control.name, (v) => { control.name = v; }, "ctl-" + control.id));
  for (const device of control.devices || []) {
    const row = ce("div", "synagogue-name-row");
    row.appendChild(text(device.name || "Device"));
    if ((control.devices || []).length > 1) row.appendChild(ghost("Its own control", () => splitDevice(control, device)));
    else if ((editingSpace.controls || []).filter((c) => c.kind === control.kind).length > 1) row.appendChild(ghost("Combine", () => combineDevice(control, device)));
    card.appendChild(row);
  }
  return card;
}
function splitDevice(control, device) {
  control.devices = control.devices.filter((d) => d.id !== device.id);
  const created = { id: "ct-" + Date.now(), name: device.name || "Control", kind: control.kind, devices: [device], comfort: {}, setback: {} };
  if (control.comfort?.[device.id]) created.comfort[device.id] = control.comfort[device.id];
  if (control.setback?.[device.id]) created.setback[device.id] = control.setback[device.id];
  editingSpace.controls.push(created);
  if (!control.devices.length) {
    editingSpace.cues = (editingSpace.cues || []).map((cue) => cue.controlId === control.id ? { ...cue, controlId: created.id } : cue);
    editingSpace.controls = editingSpace.controls.filter((c) => c !== control);
  }
  render();
}
function combineDevice(control, device) {
  const main = (editingSpace.controls || []).find((c) => c !== control && c.kind === control.kind);
  if (!main) return;
  main.devices.push(device);
  if (control.comfort?.[device.id]) { main.comfort = main.comfort || {}; main.comfort[device.id] = control.comfort[device.id]; }
  if (control.setback?.[device.id]) { main.setback = main.setback || {}; main.setback[device.id] = control.setback[device.id]; }
  editingSpace.cues = (editingSpace.cues || []).map((cue) => cue.controlId === control.id ? { ...cue, controlId: main.id } : cue);
  editingSpace.controls = editingSpace.controls.filter((c) => c !== control);
  render();
}

function cueTimeline(space) {
  const bar = ce("div", "synagogue-timeline");
  (space.cues || []).forEach((cue, index) => {
    const mark = ce("button", "synagogue-mark");
    mark.type = "button";
    mark.style.left = cueLeft(cue) + "%";
    mark.title = cueSentence(cue);
    mark.setAttribute("aria-label", cueSentence(cue));
    mark.addEventListener("click", () => {
      const row = hostEl.querySelector('[data-cue="' + cue.id + '"]');
      row?.scrollIntoView({ block: "center" });
    });
    bar.appendChild(mark);
  });
  return bar;
}
function cueLeft(cue) {
  const raw = cue.anchor === "end" ? 80 + Math.max(-40, Math.min(40, Number(cue.offsetMin) || 0)) / 2 : 40 + Math.max(-120, Math.min(120, Number(cue.offsetMin) || 0)) / 4;
  return Math.max(6, Math.min(94, raw));
}
function cueSentence(cue) {
  const control = (editingSpace.controls || []).find((c) => c.id === cue.controlId);
  const mins = Math.abs(Number(cue.offsetMin) || 0);
  const when = mins ? mins + " min " + (Number(cue.offsetMin) < 0 ? "before " : "after ") : "At ";
  const edge = cue.anchor === "end" ? "end" : "start";
  return when + edge + " → " + (control?.name || "Control") + " → " + actionLabel(cue.action);
}
function actionLabel(action) {
  return { on: "On", off: "Off", level: "Dim", comfort: "Comfort", setback: "Setback", lock: "Lock", unlock: "Unlock" }[action] || action || "On";
}

function cueCard(cue) {
  const card = ce("div", "sched-row");
  card.dataset.cue = cue.id;
  card.appendChild(note(cueSentence(cue)));
  const control = (editingSpace.controls || []).find((c) => c.id === cue.controlId);
  const names = (editingSpace.controls || []).map((c) => [c.id, c.name]);
  if (names.length) {
    card.appendChild(chips(names, cue.controlId, (id) => { cue.controlId = id; render(); }));
  }
  card.appendChild(chips([["start", "Start"], ["end", "End"]], cue.anchor || "start", (id) => { cue.anchor = id; render(); }));
  card.appendChild(chips([["before", "Before"], ["after", "After"]], Number(cue.offsetMin) < 0 ? "before" : Number(cue.offsetMin) > 0 ? "after" : "", (id) => {
    const amount = Math.abs(Number(cue.offsetMin) || 0);
    cue.offsetMin = id === "before" ? -amount : amount;
    render();
  }));
  const amount = Math.abs(Number(cue.offsetMin) || 0);
  card.appendChild(chips([["2", "2"], ["5", "5"], ["10", "10"], ["15", "15"], ["30", "30"], ["60", "60"], ["90", "90"], ["120", "120"]], ["2", "5", "10", "15", "30", "60", "90", "120"].includes(String(amount)) ? String(amount) : "", (id) => {
    cue.offsetMin = Number(cue.offsetMin) < 0 ? -Number(id) : Number(id);
    render();
  }));
  card.appendChild(field("Other minutes", "number", String(amount), (v) => {
    const n = Math.abs(Number(v) || 0);
    cue.offsetMin = Number(cue.offsetMin) < 0 ? -n : n;
  }, "cue-" + cue.id));
  const actions = control?.kind === "thermostat" ? [["comfort", "Comfort"], ["setback", "Setback"]]
    : control?.kind === "lock" ? [["unlock", "Unlock"], ["lock", "Lock"]]
    : [["on", "On"], ["off", "Off"], ["level", "Dim"]];
  card.appendChild(chips(actions, cue.action || actions[0][0], (id) => { cue.action = id; render(); }));
  if (cue.action === "level") card.appendChild(field("Level", "number", String(cue.level ?? 100), (v) => { cue.level = Number(v); }));
  const namesOfServices = serviceNames();
  card.appendChild(sectionTitle("Applies to"));
  card.appendChild(chips([["", "Every event"]].concat(namesOfServices.map((name) => [name, name])), (cue.appliesTo || [])[0] || "", (id) => {
    cue.appliesTo = id ? [id] : [];
    render();
  }));
  card.appendChild(ghost("Remove cue", () => { editingSpace.cues = editingSpace.cues.filter((item) => item !== cue); render(); }, true));
  return card;
}
function serviceNames() {
  const names = [];
  for (const row of model.menu || []) {
    for (const entry of resolvedEntries(row.id)) if (entry.name && !names.includes(entry.name)) names.push(entry.name);
  }
  if (!names.length) names.push("Shacharis", "Mincha", "Maariv");
  return names;
}

function spaceDevicePicker() {
  const box = ce("div");
  const selected = new Set((editingSpace.controls || []).flatMap((c) => (c.devices || []).map((d) => String(d.id))));
  box.appendChild(roomDevicePicker(
    (item) => selected.has(String(item.device.i)),
    (item, on) => { applyDeviceSelection(item.device, item.kind, on); render(); },
  ));
  if (model.quiet) box.appendChild(note("Try it now is off during Shabbat and Yom Tov."));
  const thermostats = catalog().thermostats || [];
  for (const control of (editingSpace.controls || []).filter((c) => c.kind === "thermostat")) {
    for (const device of control.devices || []) {
      const t = thermostats.find((item) => String(item.i) === String(device.id));
      box.appendChild(presetFields(control, device.id, t));
    }
    box.appendChild(ghost("Try comfort now", () => tryControl(control, "comfort")));
  }
  for (const kind of ["light", "outlet", "lock"]) {
    for (const control of (editingSpace.controls || []).filter((c) => c.kind === kind)) {
      const onLabel = kind === "lock" ? "unlock" : "on";
      const offLabel = kind === "lock" ? "lock" : "off";
      box.appendChild(ghost("Try " + onLabel + " now", () => tryControl(control, onLabel)));
      box.appendChild(ghost("Try " + offLabel + " now", () => tryControl(control, offLabel)));
    }
  }
  return box;
}

function applyDeviceSelection(device, kind, on) {
  const space = editingSpace;
  space.controls = space.controls || [];
  if (!on) {
    for (const control of space.controls) {
      if (control.kind !== kind) continue;
      control.devices = (control.devices || []).filter((d) => String(d.id) !== String(device.i));
    }
    const live = new Set(space.controls.filter((c) => (c.devices || []).length).map((c) => c.id));
    space.controls = space.controls.filter((c) => live.has(c.id));
    space.cues = (space.cues || []).filter((cue) => live.has(cue.controlId));
    return;
  }
  if (space.controls.some((c) => (c.devices || []).some((d) => String(d.id) === String(device.i)))) return;
  let control = space.controls.find((c) => c.kind === kind && (kind !== "light" || c.name === "Lights"));
  if (!control) {
    control = { id: "ct-" + kind + "-" + Date.now(), name: kind === "light" ? "Lights" : kind === "thermostat" ? "Heating and cooling" : kind === "lock" ? "Door" : "Outlets", kind, devices: [], comfort: {}, setback: {} };
    space.controls.push(control);
  }
  control.devices.push({ id: String(device.i), dimmer: device.d === 1, name: device.n || "" });
}

const KIND_LABEL = { light: "Light", outlet: "Outlet", lock: "Lock", thermostat: "Thermostat" };
const KIND_ORDER = { light: 0, outlet: 1, lock: 2, thermostat: 3 };

function deviceCatalogItems() {
  const cat = catalog();
  const items = [];
  for (const device of cat.lights || []) items.push({ device, kind: "light" });
  for (const device of cat.outlets || []) items.push({ device, kind: "outlet" });
  for (const device of cat.locks || []) items.push({ device, kind: "lock" });
  for (const device of cat.thermostats || []) items.push({ device, kind: "thermostat" });
  return items;
}
function roomKey(device) {
  if (device?.r == null || device.r === "" || Number(device.r) === -1) return "none";
  return String(device.r);
}
function roomDevicePicker(isOn, setOn) {
  const items = deviceCatalogItems();
  const box = ce("div", "sched-light-picker");
  if (!items.length) { box.appendChild(note("Add lights, outlets, locks, or thermostats in Modern Dashboard first.")); return box; }
  const byRoom = new Map();
  for (const item of items) {
    const rid = roomKey(item.device);
    if (!byRoom.has(rid)) byRoom.set(rid, []);
    byRoom.get(rid).push(item);
  }
  for (const list of byRoom.values()) list.sort((a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || String(a.device.n || "").localeCompare(String(b.device.n || "")));
  const rooms = catalog().rooms || [];
  const used = new Set();
  const paint = (rid, name, list) => { used.add(rid); box.appendChild(roomDeviceBlock(name, list, isOn, setOn)); };
  for (const room of rooms) {
    const list = byRoom.get(String(room.id));
    if (list?.length) paint(String(room.id), room.name || "Room", list);
  }
  for (const [rid, list] of byRoom) {
    if (used.has(rid) || rid === "none") continue;
    paint(rid, rooms.find((r) => String(r.id) === rid)?.name || "Room", list);
  }
  if (byRoom.get("none")?.length) paint("none", "No room", byRoom.get("none"));
  return box;
}
function roomDeviceBlock(name, list, isOn, setOn) {
  const frag = document.createDocumentFragment();
  const counts = new Map();
  for (const item of list) counts.set(item.kind, (counts.get(item.kind) || 0) + 1);
  let usual = "";
  let usualCount = 0;
  let tied = false;
  for (const [kind, count] of counts) {
    if (count > usualCount) { usual = kind; usualCount = count; tied = false; }
    else if (count === usualCount) tied = true;
  }
  if (tied) usual = "";
  const hdr = ce("div", "sched-room-header sched-pick-room");
  const check = pickCheck(list.every((item) => isOn(item)), () => {
    const turnOn = !list.every((item) => isOn(item));
    for (const item of list) setOn(item, turnOn);
  });
  hdr.appendChild(check);
  const nm = ce("div", "sched-room-name");
  nm.textContent = name;
  hdr.appendChild(nm);
  hdr.addEventListener("click", (e) => { if (!e.target.closest("button")) check.click(); });
  frag.appendChild(hdr);
  for (const item of list) {
    const row = ce("div", "sched-light-toggle-row sched-pick-row");
    const cbtn = pickCheck(isOn(item), () => setOn(item, !isOn(item)));
    row.appendChild(cbtn);
    const dnm = ce("div", "sched-light-name");
    dnm.textContent = item.device.n || "Device";
    row.appendChild(dnm);
    if (item.kind !== usual) {
      const kind = ce("span", "synagogue-kind");
      kind.textContent = KIND_LABEL[item.kind] || "";
      row.appendChild(kind);
    }
    row.addEventListener("click", (e) => { if (!e.target.closest("button")) cbtn.click(); });
    frag.appendChild(row);
  }
  return frag;
}
function pickCheck(on, toggle) {
  const check = ce("button", "sched-check" + (on ? " is-on" : ""));
  check.type = "button";
  check.textContent = on ? "\u2713" : "";
  check.setAttribute("aria-pressed", on ? "true" : "false");
  check.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
  return check;
}
function presetFields(control, id, device) {
  const box = ce("div");
  const modes = modeList(device);
  const fans = fanList(device);
  control.comfort = control.comfort || {};
  control.setback = control.setback || {};
  if (!control.comfort[id]) control.comfort[id] = { mode: modes.includes("heat") ? "heat" : modes[0] || "off", heat: 70, cool: 74 };
  if (!control.setback[id]) control.setback[id] = { mode: modes.includes("off") ? "off" : modes[0] || "off", heat: 62, cool: 78 };
  box.appendChild(note((device?.n || "Thermostat") + " comfort and setback"));
  for (const [key, label] of [["comfort", "Comfort"], ["setback", "Setback"]]) {
    const sel = ce("select");
    for (const mode of modes) {
      const o = ce("option");
      o.value = mode;
      o.textContent = label + " " + mode;
      if (control[key][id].mode === mode) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => { control[key][id].mode = sel.value; render(); });
    box.appendChild(sel);
    const mode = control[key][id].mode;
    if (mode === "heat" || mode === "auto" || mode === "emergency heat") box.appendChild(field(label + " heat", "number", String(control[key][id].heat ?? 70), (v) => { control[key][id].heat = Number(v); }));
    if (mode === "cool" || mode === "auto") box.appendChild(field(label + " cool", "number", String(control[key][id].cool ?? 74), (v) => { control[key][id].cool = Number(v); }));
    if (fans.length) {
      const fan = ce("select");
      for (const modeName of fans) {
        const o = ce("option");
        o.value = modeName;
        o.textContent = label + " fan " + modeName;
        if ((control[key][id].fanMode || fans[0]) === modeName) o.selected = true;
        fan.appendChild(o);
      }
      fan.addEventListener("change", () => { control[key][id].fanMode = fan.value; });
      box.appendChild(fan);
    }
  }
  return box;
}
function modeList(device) {
  const raw = device?.supM;
  const list = Array.isArray(raw) ? raw : String(raw || "heat,cool,auto,off").split(",");
  const modes = list.map((m) => String(m).trim().toLowerCase()).filter(Boolean);
  return modes.length ? modes : ["off"];
}
function fanList(device) {
  if (!device?.hasFm) return [];
  const raw = device.supFM;
  const list = Array.isArray(raw) ? raw : String(raw || "").split(",");
  return list.map((m) => String(m).trim().toLowerCase()).filter(Boolean);
}
function spaceChoices(select, selected) {
  for (const space of model.spaces || []) {
    const o = ce("option");
    o.value = space.id;
    o.textContent = space.name;
    if (selected === space.id) o.selected = true;
    select.appendChild(o);
  }
}
