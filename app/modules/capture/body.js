'use strict';
/**
 * MODULE: body.js
 * Description: Verarbeitet Körperdaten und Tageszusammenfassungen inkl. Validierung und automatischer UI-Synchronisierung.
 * Submodules:
 *  - resetBodyPanel (UI-Reset)
 *  - saveDaySummary (Body-Logik)
 *  - prefillBodyInputs (UI-Vorbelegung)
 *  - API export & global attach
 */

// SUBMODULE: namespace init @internal - initialisiert globales Modul-Objekt
(function(global){
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;

  // SUBMODULE: resetBodyPanel @internal - leert Body-Eingaben und stellt optional den Fokus wieder her
  function resetBodyPanel(opts = {}) {
    const { focus = true } = opts;
    const weightEl = document.getElementById('weightDay');
    const waistEl = document.getElementById('input-waist-cm');
    const fatEl = document.getElementById('fatPctDay');
    const muscleEl = document.getElementById('musclePctDay');
    if (weightEl) weightEl.value = '';
    if (waistEl) waistEl.value = '';
    if (fatEl) { fatEl.value = ''; clearFieldError(fatEl); }
    if (muscleEl) { muscleEl.value = ''; clearFieldError(muscleEl); }
    if (focus && weightEl) weightEl.focus();
  }

  // SUBMODULE: saveDaySummary @internal - validates and saves body summary
  async function saveDaySummary(options = {}){
    const { includeBody = true } = options;
    const date = $("#date")?.value || todayStr();
    const time = "12:00";

    const entry = baseEntry(date, time, "Tag");
    let validationFailed = false;

    const notesRaw = ($("#notesDay")?.value || "").trim();
    if (includeBody){
      entry.notes = notesRaw;
      const w = $("#weightDay")?.value?.trim();
      entry.weight = w ? Number((w||"").replace(',', '.')) : null;
      const waistRaw = $("#input-waist-cm")?.value?.trim();
      entry.waist_cm = waistRaw ? toNumDE(waistRaw) : null;

      const fatPctEl = document.getElementById('fatPctDay');
      const musclePctEl = document.getElementById('musclePctDay');
      const parsePct = (el, label) => {
        if (!el) return null;
        const raw = (el.value || '').trim();
        if (!raw){
          clearFieldError(el);
          return null;
        }
        const pct = toNumDE(raw);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100){
          setFieldError(el);
          uiError(`Bitte gueltigen Wert fuer ${label} (0-100 %) eingeben.`);
          if (!validationFailed) el.focus();
          validationFailed = true;
          return null;
        }
        clearFieldError(el);
        return pct;
      };

      const fatPct = parsePct(fatPctEl, 'Fett');
      const musclePct = parsePct(musclePctEl, 'Muskel');
      entry.fat_pct = fatPct;
      entry.muscle_pct = musclePct;
    } else {
      entry.notes = '';
      entry.weight = null;
      entry.waist_cm = null;
      entry.fat_pct = null;
      entry.muscle_pct = null;
      clearFieldError(document.getElementById('fatPctDay'));
      clearFieldError(document.getElementById('musclePctDay'));
    }

    if (validationFailed) return false;

  let saved = false;

  const hasBodyContent =
    includeBody &&
    ((entry.weight != null) ||
      (entry.waist_cm != null) ||
      (entry.fat_pct != null) ||
      (entry.muscle_pct != null) ||
      !!entry.notes);

  if (hasBodyContent){
    const localId = await addEntry(entry);
    await syncWebhook(entry, localId);
    saved = true;
  }

  return saved;
  }

  // SUBMODULE: prefillBodyInputs @internal - lädt letzte Körperwerte und füllt Eingabefelder vor
  async function prefillBodyInputs(){
    const weightEl = document.getElementById('weightDay');
    const waistEl = document.getElementById('input-waist-cm');
    const fatEl = document.getElementById('fatPctDay');
    const muscleEl = document.getElementById('musclePctDay');
    const applyValues = (row) => {
      if (weightEl) weightEl.value = row?.kg != null ? fmtNum(row.kg, 1) : '';
      if (waistEl) waistEl.value = row?.cm != null ? fmtNum(row.cm, 1).replace('.', ',') : '';
      if (fatEl) {
        clearFieldError(fatEl);
        fatEl.value = row?.fat_pct != null ? fmtNum(row.fat_pct, 1).replace('.', ',') : '';
      }
      if (muscleEl) {
        clearFieldError(muscleEl);
        muscleEl.value = row?.muscle_pct != null ? fmtNum(row.muscle_pct, 1).replace('.', ',') : '';
      }
    };

    const dateEl = document.getElementById('date');
    const dayIso = dateEl?.value || todayStr();
    try {
      const uid = await getUserId();
      if (!uid) {
        applyValues(null);
        return;
      }
      const rows = await loadBodyFromView({ user_id: uid, from: dayIso, to: dayIso });
      const row = Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null;
      applyValues(row);
    } catch(err) {
      try {
        diag.add?.(`[body] prefillBodyInputs failed for ${dayIso}: ${err?.message || err}`);
      } catch (_) { /* noop */ }
      console.error('prefillBodyInputs failed', { dayIso, error: err });
      applyValues(null);
    }
  }
  
  // SUBMODULE: API export & global attach @internal - registriert öffentliche Methoden und erweitert AppModules.body
  const bodyApi = {
    resetBodyPanel: resetBodyPanel,
    saveDaySummary: saveDaySummary,
    prefillBodyInputs: prefillBodyInputs
  };
  appModules.body = Object.assign(appModules.body || {}, bodyApi);
  global.AppModules.body = appModules.body;
  Object.entries(bodyApi).forEach(([name, fn]) => {
    if (typeof global[name] === 'undefined') {
      global[name] = fn;
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
