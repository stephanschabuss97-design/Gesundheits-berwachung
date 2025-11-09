'use strict';
(function(global){
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;
  let __doctorScrollSnapshot = { top: 0, ratio: 0 };
  const fallbackRequireDoctorUnlock = async () => {
    diag.add?.('[doctor] requireDoctorUnlock missing – blocking access');
    console.warn('[doctor] requireDoctorUnlock not available; denying unlock');
    return false;
  };
  const getAuthGuardState = () => {
    const api = global.SupabaseAPI || global.AppModules?.supabase;
    const state = api?.authGuardState;
    return state && typeof state === 'object' ? state : null;
  };
  const isDoctorUnlockedSafe = () => {
    if (typeof global.__doctorUnlocked !== 'undefined') {
      return !!global.__doctorUnlocked;
    }
    return !!getAuthGuardState()?.doctorUnlocked;
  };
  const requestDoctorUnlock = async () => {
    const unlockFn = global.requireDoctorUnlock;
    if (typeof unlockFn === 'function') {
      return unlockFn();
    }
    return fallbackRequireDoctorUnlock();
  };
  const logDoctorError = (msg, err) => {
    const detail = err?.message || err;
    diag.add?.(`[doctor] ${msg}: ${detail}`);
    if (err) {
      console.error(`[doctor] ${msg}`, err);
    } else {
      console.error(`[doctor] ${msg}`);
    }
  };

/* ===== Doctor view ===== */
// SUBMODULE: setDocBadges @internal - updates toolbar KPI badges for training/bad days
function setDocBadges({ training, bad, visible } = {}) {
  const t = document.getElementById('docTrainCnt');
  const b = document.getElementById('docBadCnt');
  if (!t || !b) return;
  const tVal = t.querySelector('.val');
  const bVal = b.querySelector('.val');

  if (training !== undefined && tVal) tVal.textContent = String(training);
  if (bad !== undefined && bVal)      bVal.textContent = String(bad);

  if (visible !== undefined) {
    t.classList.toggle('hidden', !visible);
    b.classList.toggle('hidden', !visible);
  }
}

const __t0 = performance.now();
// SUBMODULE: renderDoctor @extract-candidate - orchestrates gated render flow, fetches days, manages scroll state
async function renderDoctor(){
  const host = $("#doctorView");
  if (!host) return;

  const scroller = document.getElementById('doctorDailyWrap') || host.parentElement || host;
  if (!scroller.dataset.scrollWatcher) {
    scroller.addEventListener('scroll', () => {
      const h = scroller.scrollHeight || 1;
      __doctorScrollSnapshot.top = scroller.scrollTop;
      __doctorScrollSnapshot.ratio = h ? Math.min(1, scroller.scrollTop / h) : 0;
    }, { passive: true });
    scroller.dataset.scrollWatcher = "1";
  }

  if (!(await isLoggedIn())){
    host.innerHTML = `<div class="small" data-style="doctor-placeholder">Bitte anmelden, um die Arzt-Ansicht zu sehen.</div>`;
    setDocBadges({ visible: false });
    if (scroller) scroller.scrollTop = 0;
    __doctorScrollSnapshot = { top: 0, ratio: 0 };
    return;
  }
  // Nur sperren, wenn die Arzt-Ansicht wirklich aktiv angezeigt wird
  const doctorSection = document.getElementById('doctor');
  const isActive = !!doctorSection && doctorSection.classList.contains('active');
  if (!isDoctorUnlockedSafe()){
    if (isActive){
      host.innerHTML = `<div class="small" data-style="doctor-placeholder">Bitte Arzt-Ansicht kurz entsperren.</div>`;
      setDocBadges({ visible: false });
      try {
        await requestDoctorUnlock();
      } catch(err) {
        logDoctorError('Failed to requireDoctorUnlock', err);
      }
      if (!isDoctorUnlockedSafe()) return;
    } else {
      return;
    }
  }

  const prevScrollTop = (__doctorScrollSnapshot?.top ?? scroller.scrollTop ?? 0) || 0;
  const prevScrollRatio = (__doctorScrollSnapshot?.ratio ?? 0) || 0;
  host.innerHTML = "";

  // Anzeige-Helper
  const dash = v => (v === null || v === undefined || v === "" ? "-" : String(v));
  const onClass = b => (b ? "on" : "");
  const fmtDateDE = (iso) => {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("de-AT", { weekday:"short", day:"2-digit", month:"2-digit", year:"numeric" });
  };

  // Zeitraum lesen
  const from = $("#from").value;
  const to   = $("#to").value;
  if (!from || !to){
    host.innerHTML = `<div class="small" data-style="doctor-placeholder">Bitte Zeitraum waehlen.</div>`;
    setDocBadges({ visible: false });
    if (scroller) scroller.scrollTop = 0;
    __doctorScrollSnapshot = { top: 0, ratio: 0 };
    return;
  }

  //  Server lesen  Tagesobjekte
  let daysArr = [];
  try{
    daysArr = await fetchDailyOverview(from, to);
  }catch(err){
    logDoctorError('fetchDailyOverview failed', err);
    host.innerHTML = `<div class="small" data-style="doctor-placeholder" data-error="doctor-fetch-failed">Fehler beim Laden aus der Cloud.</div>`;
    setDocBadges({ visible: false });
    if (scroller) scroller.scrollTop = 0;
    __doctorScrollSnapshot = { top: 0, ratio: 0 };
    return;
  }

  daysArr.sort((a,b)=> b.date.localeCompare(a.date));

  // KPIs
  const trainingDays = daysArr.filter(d => !!d.flags.training).length;
  const badDays = daysArr.filter(d => {
    const f = d.flags;
    return !!(f.water_lt2 || f.salt_gt5 || f.protein_ge90 || f.sick || f.meds);
  }).length;
  setDocBadges({ training: trainingDays, bad: badDays, visible: true });

  const formatNotesHtml = (notes) => {
    const raw = (notes || '').trim();
    if (!raw) return '-';
    const escapeFallbackMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const rawEscaped = typeof esc === 'function'
      ? esc(raw)
      : raw.replace(/[&<>"']/g, (c) => escapeFallbackMap[c] || c);
    const escaped = rawEscaped;
    if (typeof nl2br === 'function') {
      return nl2br(escaped);
    }
    return escaped.replace(/\r?\n/g, '<br>');
  };

  // Renderer je Tag
  // SUBMODULE: renderDoctorDay @internal - templates per-day HTML card for doctor view
  const renderDoctorDay = (day) => {
    const safeNotes = formatNotesHtml(day.notes);
    return `
<section class="doctor-day" data-date="${day.date}">
  <div class="col-date">
    <div class="date-top">
      <span class="date-label">${fmtDateDE(day.date)}</span>
      <span class="date-cloud" title="In Cloud gespeichert?">${day.hasCloud ? "&#9729;&#65039;" : ""}</span>
    </div>
    <div class="date-actions">
      <button class="btn ghost btn-xs" data-del-day="${day.date}">Loeschen</button>
    </div>
  </div>

  <div class="col-measure">
    <div class="measure-head">
      <div></div>
      <div>Sys</div><div>Dia</div><div>Puls</div><div>MAP</div>
    </div>
    <div class="measure-grid">
      <div class="measure-row">
        <div class="label">morgens</div>
        <div class="num ${ (day.morning.sys!=null && day.morning.sys>130) ? 'alert' : '' }">${dash(day.morning.sys)}</div>
        <div class="num ${ (day.morning.dia!=null && day.morning.dia>90)  ? 'alert' : '' }">${dash(day.morning.dia)}</div>
        <div class="num">${dash(day.morning.pulse)}</div>
        <div class="num ${ (day.morning.map!=null && day.morning.map>100) ? 'alert' : '' }">${dash(fmtNum(day.morning.map))}</div>
      </div>
      <div class="measure-row">
        <div class="label">abends</div>
        <div class="num ${ (day.evening.sys!=null && day.evening.sys>130) ? 'alert' : '' }">${dash(day.evening.sys)}</div>
        <div class="num ${ (day.evening.dia!=null && day.evening.dia>90)  ? 'alert' : '' }">${dash(day.evening.dia)}</div>
        <div class="num">${dash(day.evening.pulse)}</div>
        <div class="num ${ (day.evening.map!=null && day.evening.map>100) ? 'alert' : '' }">${dash(fmtNum(day.evening.map))}</div>
      </div>
    </div>
  </div>

  <div class="col-special">
    <div class="weight-line">
      <div>Gewicht</div>
      <div class="num">${dash(fmtNum(day.weight))}</div>
    </div>

    <div class="waist-line">
      <div>Bauchumfang (cm)</div>
      <div class="num">${dash(fmtNum(day.waist_cm))}</div>
    </div>

    <div class="flags">
      <div class="flag"><span class="flag-box ${onClass(day.flags.water_lt2)}"></span><span>&lt;2L Wasser</span></div>
      <div class="flag"><span class="flag-box ${onClass(day.flags.salt_gt5)}"></span><span>Salz &gt;5g</span></div>
      <div class="flag"><span class="flag-box ${onClass(day.flags.protein_ge90)}"></span><span>Protein &ge; 90 g</span></div>
      <div class="flag"><span class="flag-box ${onClass(day.flags.sick)}"></span><span>Krank</span></div>
      <div class="flag"><span class="flag-box ${onClass(day.flags.meds)}"></span><span>Medikamente</span></div>
      <div class="flag"><span class="flag-box ${onClass(day.flags.training)}"></span><span>Training</span></div>
    </div>

    <div class="notes">${safeNotes}</div>
  </div>
</section>
`;
  };

  // Rendern / Leerzustand
  if (!daysArr.length){
    host.innerHTML = `<div class="small" data-style="doctor-placeholder">Keine Eintraege im Zeitraum</div>`;
    if (scroller) scroller.scrollTop = 0;
    __doctorScrollSnapshot = { top: 0, ratio: 0 };
  } else {
    host.innerHTML = daysArr.map(renderDoctorDay).join("");

    const restoreScroll = () => {
      const targetEl = scroller || host;
      const height = targetEl.scrollHeight || 1;
      const maxScroll = Math.max(0, height - targetEl.clientHeight);
      const fromTop = Math.max(0, Math.min(prevScrollTop, maxScroll));
      const fromRatio = Math.max(0, Math.min(Math.round(prevScrollRatio * height), maxScroll));
      const target = prevScrollTop ? fromTop : fromRatio;
      targetEl.scrollTop = target;
      const h = targetEl.scrollHeight || 1;
      __doctorScrollSnapshot.top = targetEl.scrollTop;
      __doctorScrollSnapshot.ratio = h ? Math.min(1, targetEl.scrollTop / h) : 0;
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(restoreScroll);
    } else {
      setTimeout(restoreScroll, 0);
    }

    //  Loeschen: alle Server-Events des Tages entfernen
    host.querySelectorAll('[data-del-day]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const date = btn.getAttribute('data-del-day');
        if (!date) return;
        if (!confirm(`Alle Eintraege in der Cloud fuer ${date} loeschen?`)) return;

        btn.disabled = true;
        const old = btn.textContent;
        btn.textContent = 'Loesche...';
        try{
          const r = await deleteRemoteDay(date);
          if (!r.ok){
            alert(`Server-Loeschung fehlgeschlagen (${r.status||"?"}).`);
            return;
          }
          await requestUiRefresh({ reason: 'doctor:delete' });
        } catch(err) {
          logDoctorError('deleteRemoteDay failed', err);
          alert('Server-Loeschung fehlgeschlagen (Fehler siehe Konsole).');
        } finally {
          btn.disabled = false; btn.textContent = old;
        }
      });
    });
  }
}


// --- Arzt-Export ---
// SUBMODULE: exportDoctorJson @internal - triggers download (future: route via buildDoctorSummaryJson @extract-candidate @public)
async function exportDoctorJson(){
  try {
    const logged = await isLoggedInFast();
    if (!logged) {
      diag.add?.('[doctor] export while auth unknown');
      // Diagnostics only: export still runs so auth wrapper can trigger re-login if needed.
    }
  } catch(err) {
    console.error('isLoggedInFast check failed', err);
  }
  if (!isDoctorUnlockedSafe()) {
    setAuthPendingAfterUnlock('export');
    const ok = await requestDoctorUnlock();
    if (!ok) return;
    setAuthPendingAfterUnlock(null);
  }
  const all = await getAllEntries();
  dl("gesundheitslog.json", JSON.stringify(all, null, 2), "application/json");
}
  const doctorApi = {
    renderDoctor,
    setDocBadges,
    exportDoctorJson
  };
  appModules.doctor = Object.assign({}, appModules.doctor, doctorApi);
  global.AppModules = appModules;
  global.setDocBadges = setDocBadges;
  global.renderDoctor = renderDoctor;
  global.exportDoctorJson = exportDoctorJson;
})(typeof window !== 'undefined' ? window : globalThis);

