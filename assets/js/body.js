'use strict';
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

  /** MODULE: BODY (Koerperwerte)
   * intent: verarbeitet Tageszusammenfassung, Flags und Body-Werte Validierung
   * contracts: nutzt DATA ACCESS.saveDaySummary/saveFlagsCommentNote, CAPTURE Toggles
   * exports: saveDaySummary, saveFlagsCommentNote
   * notes: Body- und Flag-Eintraege konsistent dokumentieren; nur Kommentare
   */
  // SUBMODULE: saveDaySummary @internal - validates and saves body/flags daily summary
  async function saveDaySummary(options = {}){
    const { includeBody = true, includeFlags = true, includeFlagsComment = true } = options;
    const date = $("#date")?.value || todayStr();
    const time = "12:00";

    const entry = baseEntry(date, time, "Tag");
    let validationFailed = false;
    const snapshotFn = global.getCaptureFlagsStateSnapshot;
    const flags = typeof snapshotFn === "function" ? snapshotFn() : {
      trainingActive: false,
      lowIntakeActive: false,
      sickActive: false,
      valsartanMissed: false,
      forxigaMissed: false,
      nsarTaken: false,
      saltHigh: false,
      proteinHigh: false
    };

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

    if (includeFlags){
      entry.training = flags.trainingActive;
      entry.low_intake = flags.lowIntakeActive;
    entry.sick = flags.sickActive;
    entry.valsartan_missed = flags.valsartanMissed;
    entry.forxiga_missed = flags.forxigaMissed;
    entry.nsar_taken = flags.nsarTaken;
    entry.salt_high = flags.saltHigh;
    entry.protein_high90 = flags.proteinHigh;
  } else {
    entry.training = null;
    entry.low_intake = null;
    entry.sick = null;
    entry.valsartan_missed = null;
    entry.forxiga_missed = null;
    entry.nsar_taken = null;
    entry.salt_high = null;
    entry.protein_high90 = null;
  }

    const flagsComment = includeFlagsComment ? ($("#flagsComment")?.value || "").trim() : "";
  let saved = false;

  const hasBodyContent = includeBody && ((entry.weight != null) || (entry.waist_cm != null) || !!entry.notes);
  const hasFlagContent = includeFlags && !!(flags.trainingActive || flags.lowIntakeActive || flags.sickActive ||
    flags.valsartanMissed || flags.forxigaMissed || flags.nsarTaken ||
    flags.saltHigh || flags.proteinHigh);

  if (hasBodyContent || hasFlagContent){
    const localId = await addEntry(entry);
    await syncWebhook(entry, localId);
    saved = true;
  }

  if (includeFlagsComment && flagsComment){
    const savedNote = await saveFlagsCommentNote(date, flagsComment);
    if (savedNote){
      const el = document.getElementById('flagsComment');
      if (el) el.value = '';
      diag.add('Flags-Kommentar gespeichert');
      saved = true;
    }
  }

  return saved;
  }

  /** END MODULE */

  async function saveFlagsCommentNote(date, text){
    const trimmed = (text || '').trim();
    if (!trimmed) return false;
    await appendNote(date, '[Flags] ', trimmed);
    return true;
  }

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
    } catch(_) {
      applyValues(null);
    }
  }
  const bodyApi = {
    resetBodyPanel: resetBodyPanel,
    saveDaySummary: saveDaySummary,
    saveFlagsCommentNote: saveFlagsCommentNote,
    prefillBodyInputs: prefillBodyInputs
  };
  appModules.body = Object.assign(appModules.body || {}, bodyApi);
  Object.entries(bodyApi).forEach(([name, fn]) => {
    if (typeof global[name] === 'undefined') {
      global[name] = fn;
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
