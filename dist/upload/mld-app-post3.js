(() => {
  "use strict";
  const M = globalThis.__MLD;
  if (!M) {
    console.error("Modern Dashboard: upload mld-app-post2.js before mld-app-post3.js");
    return;
  }
// ---------- scheduler module (ships as mld-app-post3.js) ----------
  let schedules = [];

  function applySchedulesFromData(data) {
    if (!data || !Array.isArray(data.schedules)) return;
    schedules = data.schedules;
  }

  function schedulerHasContent() {
    return false;
  }

  function renderSchedulerView() {
    const popup = M.ensureQuickPopup();
    M.syncQuickPopupRef(popup);
    popup.classList.remove("quick-popup-wide", "quick-popup-hub-mode");
    const body = M.currentBody();
    body.className = "quick-body quick-body-scheduler" + (M.inTabView() ? " tab-body" : "");
    body.innerHTML = "";
    const msg = ce("p", "scheduler-placeholder");
    msg.textContent = "Scheduler coming soon.";
    body.appendChild(msg);
  }

  Object.assign(M, { applySchedulesFromData, schedulerHasContent, renderSchedulerView });
})();
