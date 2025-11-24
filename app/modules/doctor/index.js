﻿'use strict';
/**
 * MODULE: app/doctor.js
 * Description: Steuert die Arzt-Ansicht – lädt Tagesdaten, verwaltet Sperrlogik (Unlock), Scrollstatus und Exportfunktionen.
 * Submodules:
 *  - globals (AppModules, diag, Scroll-State)
 *  - access-control (Doctor-Unlock-Logik und Fehlerbehandlung)
 *  - renderDoctor (Haupt-Renderer mit Zugriffsschutz, Scrollwiederherstellung und Lösch-Handling)
 *  - renderDoctorDay (Template-Funktion für Tageskarten)
 *  - exportDoctorJson (Exportfunktion für alle Gesundheitsdaten als JSON)
 *  - doctorApi (Registrierung im global.AppModules-Namespace)
 */

// SUBMODULE: globals @internal - Initialisierung globaler Handles & State
(function(global){
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;
  let __doctorScrollSnapshot = { top: 0, ratio: 0 };
  const getSupabaseApi = () => global.AppModules?.supabase || {};
  const toast = global.toast || appModules.ui?.toast || ((msg) => console.info('[doctor]', msg));
  const escapeAttr = (value = '') =>
    String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
  const TRENDPILOT_SEVERITY_META = {
    warning: { label: 'Warnung', className: 'is-warning' },
    critical: { label: 'Kritisch', className: 'is-critical' }
  };
  const TRENDPILOT_STATUS_LABELS = {
    none: 'Kein Arzt-Status',
    planned: 'Arztabklärung geplant',
    done: 'Arztabklärung erledigt'
  };
  const getDoctorStatusLabel = (status) =>
    TRENDPILOT_STATUS_LABELS[status] || TRENDPILOT_STATUS_LABELS.none;
  const getSeverityMeta = (severity) =>
    TRENDPILOT_SEVERITY_META[severity] || { label: 'Info', className: 'is-info' };

  // SUBMODULE: access-control @internal - Unlock- und Authentifizierungslogik
  const fallbackRequireDoctorUnlock = async () => {
    diag.add?.('[doctor] requireDoctorUnlock missing – blocking access');
    console.warn('[doctor] requireDoctorUnlock not available; denying unlock');
    return false;
  };
  const getAuthGuardState = () => {
    const api = global.AppModules?.supabase;
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

  const resolveTrendpilotFetcher = () => {
    const api = getSupabaseApi();
    return typeof api.fetchSystemCommentsRange === 'function' ? api.fetchSystemCommentsRange : null;
  };

  const resolveTrendpilotStatusSetter = () => {
    const api = getSupabaseApi();
    return typeof api.setSystemCommentDoctorStatus === 'function'
      ? api.setSystemCommentDoctorStatus
      : null;
  };

  const renderTrendpilotActionButton = (status, current) => {
    const isActive = status === (current || 'none');
    const label =
      status === 'planned'
        ? 'Arztabklärung geplant'
        : status === 'done'
          ? 'Erledigt'
          : 'Zurücksetzen';
    return `<button class="btn ghost ${isActive ? 'is-active' : ''}" data-doctor-status="${status}">${label}</button>`;
  };

  const renderTrendpilotRow = (entry, fmtDateDE) => {
    const severity = getSeverityMeta(entry.severity);
    const ackLabel = entry.ack ? 'Bestätigt' : 'Offen';
    const ackClass = entry.ack ? 'is-ack' : 'is-open';
    const safeText = entry.text
      ? escapeAttr(entry.text)
      : 'Trendpilot-Hinweis';
    const dateLabel = fmtDateDE(entry.day);
    const currentStatus = entry.doctorStatus || 'none';
    return `
<article class="tp-row" data-trendpilot-id="${escapeAttr(entry.id || '')}" data-day="${escapeAttr(entry.day || '')}" data-doctor-status="${escapeAttr(currentStatus)}">
  <div class="tp-meta">
    <span class="tp-date">${dateLabel}</span>
    <span class="tp-badge ${severity.className}">${severity.label}</span>
    <span class="tp-ack ${ackClass}">${ackLabel}</span>
  </div>
  <div class="tp-text">${safeText}</div>
  <div class="tp-status" data-status-label>${getDoctorStatusLabel(currentStatus)}</div>
  <div class="tp-actions" role="group" aria-label="Trendpilot-Aktion">
    ${renderTrendpilotActionButton('planned', currentStatus)}
    ${renderTrendpilotActionButton('done', currentStatus)}
    ${renderTrendpilotActionButton('none', currentStatus)}
  </div>
</article>`;
  };

  const renderTrendpilotSection = (host, entries, fmtDateDE, { unavailable = false } = {}) => {
    if (!host) return;
    const countText = `${entries?.length || 0} Hinweis${entries?.length === 1 ? '' : 'e'}`;
    let inner = `<div class="doctor-trendpilot-head"><strong>Trendpilot-Hinweise</strong><span class="small">${countText}</span></div>`;
    if (unavailable) {
      inner += `<div class="doctor-trendpilot-empty">Trendpilot-Hinweise momentan nicht verfügbar.</div>`;
    } else if (!entries?.length) {
      inner += `<div class="doctor-trendpilot-empty">Keine Trendpilot-Hinweise in diesem Zeitraum.</div>`;
    } else {
      const rows = entries.map((entry) => renderTrendpilotRow(entry, fmtDateDE)).join('');
      inner += `<div class="doctor-trendpilot-list">${rows}</div>`;
    }
    host.innerHTML = inner;
  };

  const updateTrendpilotStatusUi = (row, status) => {
    if (!row) return;
    row.querySelectorAll('[data-doctor-status]').forEach((btn) => {
      const btnStatus = btn.getAttribute('data-doctor-status');
      btn.classList.toggle('is-active', btnStatus === status);
    });
    const labelEl = row.querySelector('[data-status-label]');
    if (labelEl) labelEl.textContent = getDoctorStatusLabel(status);
  };

  async function loadTrendpilotEntries(from, to) {
    const fetcher = resolveTrendpilotFetcher();
    if (typeof fetcher !== 'function') return [];
    const result = await fetcher({ from, to, metric: 'bp', order: 'day.desc' });
    return Array.isArray(result) ? result : [];
  }

  async function onTrendpilotAction(event) {
    const btn = event.target.closest('[data-doctor-status]');
    if (!btn) return;
    const row = btn.closest('[data-trendpilot-id]');
    if (!row) return;
    const nextStatus = btn.getAttribute('data-doctor-status');
    if (!nextStatus) return;
    const currentStatus = row.getAttribute('data-doctor-status') || 'none';
    if (nextStatus === currentStatus) return;
    const setter = resolveTrendpilotStatusSetter();
    if (typeof setter !== 'function') {
      toast('Trendpilot-Status kann nicht aktualisiert werden.');
      return;
    }
    const id = row.getAttribute('data-trendpilot-id');
    if (!id) return;
    row.classList.add('is-loading');
    btn.disabled = true;
    try {
      await setter({ id, doctorStatus: nextStatus });
      row.setAttribute('data-doctor-status', nextStatus);
      updateTrendpilotStatusUi(row, nextStatus);
      toast(`Trendpilot: ${getDoctorStatusLabel(nextStatus)}.`);
    } catch (err) {
      logDoctorError('trendpilot status update failed', err);
      uiError?.('Trendpilot-Status konnte nicht aktualisiert werden.');
    } finally {
      row.classList.remove('is-loading');
      btn.disabled = false;
    }
  }

/* ===== Doctor view ===== */

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
    host.innerHTML = `<div class="small u-doctor-placeholder">Bitte anmelden, um die Arzt-Ansicht zu sehen.</div>`;
    if (scroller) scroller.scrollTop = 0;
    __doctorScrollSnapshot = { top: 0, ratio: 0 };
    return;
  }
  // Nur sperren, wenn die Arzt-Ansicht wirklich aktiv angezeigt wird
  const doctorSection = document.getElementById('doctor');
  const isActive = !!doctorSection && doctorSection.classList.contains('active');
  if (!isDoctorUnlockedSafe()){
    if (isActive){
      host.innerHTML = `<div class="small u-doctor-placeholder">Bitte Arzt-Ansicht kurz entsperren.</div>`;
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
  const fmtDateDE = (iso) => {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("de-AT", { weekday:"short", day:"2-digit", month:"2-digit", year:"numeric" });
  };

  // Zeitraum lesen
  const from = $("#from").value;
  const to   = $("#to").value;
  if (!from || !to){
    host.innerHTML = `<div class="small u-doctor-placeholder">Bitte Zeitraum waehlen.</div>`;
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
    host.innerHTML = `<div class="small u-doctor-placeholder" data-error="doctor-fetch-failed">Fehler beim Laden aus der Cloud.</div>`;
    if (scroller) scroller.scrollTop = 0;
    __doctorScrollSnapshot = { top: 0, ratio: 0 };
    return;
  }

  daysArr.sort((a,b)=> b.date.localeCompare(a.date));

  const trendpilotWrap = document.getElementById('doctorTrendpilot');
  if (trendpilotWrap) {
    let trendpilotEntries = [];
    let trendpilotUnavailable = false;
    try {
      trendpilotEntries = await loadTrendpilotEntries(from, to);
    } catch (err) {
      trendpilotUnavailable = true;
      logDoctorError('trendpilot fetch failed', err);
    }
    renderTrendpilotSection(trendpilotWrap, trendpilotEntries, fmtDateDE, { unavailable: trendpilotUnavailable });
    if (!trendpilotWrap.dataset.tpBound) {
      trendpilotWrap.addEventListener('click', onTrendpilotAction);
      trendpilotWrap.dataset.tpBound = '1';
    }
  }

  const formatNotesHtml = (notes) => {
    const raw = (notes || '').trim();
    if (!raw) return '-';
    const escaped = escapeAttr(raw);
    if (typeof nl2br === 'function') {
      return nl2br(escaped);
    }
    return escaped.replace(/\r?\n/g, '<br>');
  };

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
      <button class="btn ghost" data-del-day="${day.date}">Loeschen</button>
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

    <div class="notes">${safeNotes}</div>
  </div>
</section>
`;
  };

  // Rendern / Leerzustand
  if (!daysArr.length){
    host.innerHTML = `<div class="small u-doctor-placeholder">Keine Eintraege im Zeitraum</div>`;
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
// SUBMODULE: doctorApi @internal - registriert öffentliche API-Funktionen im globalen Namespace
  const doctorApi = {
    renderDoctor,
    exportDoctorJson
  };
  appModules.doctor = Object.assign({}, appModules.doctor, doctorApi);
  global.AppModules = appModules;
  global.renderDoctor = renderDoctor;
  global.exportDoctorJson = exportDoctorJson;
})(typeof window !== 'undefined' ? window : globalThis);
