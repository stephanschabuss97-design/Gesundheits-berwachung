'use strict';
/**
 * MODULE: bp.js
 * Description: Verwaltet Blutdruck-Erfassung, Validierung und Persistierung inkl. Kommentar-Pflicht, Panel-Reset und Datensynchronisation.
 * Submodules:
 *  - requiresBpComment (public, Kommentar-Pflichtprüfung)
 *  - clearBpCommentWarnings (public, UI-Hinweislogik)
 *  - bpFieldId / bpSelector (internal, ID-Mapping)
 *  - resetBpPanel (public, Panel-Reset)
 *  - blockHasData (internal, Eingabe-Erkennung)
 *  - saveBlock (public, Messwert-Speicherung)
 *  - baseEntry (internal, Standard-Eintrag)
 *  - appendNote (internal, Zusatz-Notizen)
 *  - allocateNoteTimestamp (internal, Zeitstempel-Generator)
 *  - API export & global attach (internal)
 */

// SUBMODULE: namespace init @internal - initialisiert globales Modul-Objekt
(function(global){
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;
  const BP_CONTEXTS = Object.freeze(['M','A']);

  function requiresBpComment(which) {
    const ctx = which === 'A' ? 'A' : 'M';
    const sys = Number($(bpSelector('sys', ctx))?.value);
    const dia = Number($(bpSelector('dia', ctx))?.value);
    const el = document.getElementById(ctx === 'M' ? 'bpCommentM' : 'bpCommentA');
    const comment = (el?.value || "").trim();
    const sysHigh = Number.isFinite(sys) && sys > 130;
    const diaHigh = Number.isFinite(dia) && dia > 90;
    if (!sysHigh && !diaHigh) return false;
    return comment.length === 0;
  }

  function clearBpCommentWarnings() {
    BP_CONTEXTS.forEach(which => {
      const el = document.getElementById(which === "M" ? "bpCommentM" : "bpCommentA");
      if (el) {
        el.style.outline = "";
        el.removeAttribute("aria-invalid");
      }
    });
  }

  // SUBMODULE: bpFieldId @internal - maps BP field ids for capture contexts
  function bpFieldId(base, ctx){
    if (base === 'sys' && ctx === 'M') return 'captureAmount';
    return base + ctx;
  }

  // SUBMODULE: bpSelector @internal - resolves selector for BP inputs
  function bpSelector(base, ctx){
    return base === 'sys' && ctx === 'M' ? '#captureAmount' : `#${base}${ctx}`;
  }

  // SUBMODULE: resetBpPanel @internal - clears BP inputs per context
  function resetBpPanel(which, opts = {}) {
    const { focus = true } = opts;
    const ctx = which === 'A' ? 'A' : 'M';
    ['sys','dia','pulse','bpComment'].forEach(id => {
      const el = document.getElementById(bpFieldId(id, ctx));
      if (el) el.value = '';
    });
    clearBpCommentWarnings();
    if (focus) {
      const target = document.getElementById(bpFieldId('sys', ctx));
      if (target) target.focus();
    }
  }

  // SUBMODULE: blockHasData @internal - detects if BP panel has any input before saving
  function blockHasData(which){
    const getVal = (sel) => document.querySelector(sel)?.value?.trim();
    const sys = getVal(bpSelector('sys', which));
    const dia = getVal(`#dia${which}`);
    const pulse = getVal(`#pulse${which}`);
    const commentEl = document.getElementById(which === "M" ? "bpCommentM" : "bpCommentA");
    const comment = (commentEl?.value || "").trim();
    return !!(sys || dia || pulse || comment);
  }

  // SUBMODULE: saveBlock @internal - persists BP measurements and optional comments
  async function saveBlock(contextLabel, which, includeWeight=false, force=false){
  const date = $("#date").value || todayStr();
  const time = which === 'M' ? '07:00' : '22:00';

  const sys   = $(bpSelector('sys', which)).value   ? toNumDE($(bpSelector('sys', which)).value)   : null;
  const dia   = $(`#dia${which}`).value   ? toNumDE($(`#dia${which}`).value)   : null;
  const pulse = $(`#pulse${which}`).value ? toNumDE($(`#pulse${which}`).value) : null;

  const commentEl = document.getElementById(which === 'M' ? 'bpCommentM' : 'bpCommentA');
  const comment = (commentEl?.value || '').trim();

  const hasAny = (sys != null) || (dia != null) || (pulse != null);
  const hasComment = comment.length > 0;

  if (!force && !hasAny && !hasComment) return false;

  if (hasAny){
    if ((sys != null && dia == null) || (dia != null && sys == null)){
      uiError('Bitte beide Blutdruck-Werte (Sys und Dia) eingeben.');
      return false;
    }
    if (pulse != null && (sys == null || dia == null)){
      uiError('Puls kann nur mit Sys und Dia zusammen gespeichert werden.');
      return false;
    }

    const entry = baseEntry(date, time, contextLabel);    entry.sys = sys;
    entry.dia = dia;
    entry.pulse = pulse;
    entry.map = (sys!=null && dia!=null) ? calcMAP(sys, dia) : null;
    entry.notes = '';

    const localId = await addEntry(entry);
    await syncWebhook(entry, localId);
  }

  if (hasComment){
    try {
      await appendNote(date, which === 'M' ? '[Morgens] ' : '[Abends] ', comment);
      if (commentEl) commentEl.value = '';
      clearBpCommentWarnings();
    } catch(err) {
      diag.add?.('BP-Kommentar Fehler: ' + (err?.message || err));
    }
  }

  return hasAny || hasComment;
  }

  // SUBMODULE: baseEntry @internal - composes canonical intake/bp entry skeleton
  function baseEntry(date, time, contextLabel){
    const iso = new Date(date + "T" + time).toISOString();
    const ts = new Date(date + "T" + time).getTime();
    return {
      date,
      time,
      dateTime: iso,
      ts,
      context: contextLabel,
      sys: null,
      dia: null,
      pulse: null,
      weight: null,
      map: null,
      notes: ($("#notesDay")?.value || "").trim()
    };
  }

  // SUBMODULE: appendNote @internal - stores supplemental note entries for BP comments
  async function appendNote(date, prefix, text){
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    const stamp = allocateNoteTimestamp(date);
    const entry = baseEntry(date, stamp.time, 'Tag');
    entry.dateTime = stamp.iso;
    entry.ts = stamp.ts;
    entry.notes = prefix + trimmed;
    const localId = await addEntry(entry);
    await syncWebhook(entry, localId);
  }

  // SUBMODULE: allocateNoteTimestamp @internal - generates staggered timestamps for notes
  function allocateNoteTimestamp(date){
    const base = new Date(date + "T22:30:00");
    const now = Date.now();
    const minuteOffset = now % 60;
    const secondOffset = Math.floor(now / 1000) % 60;
    base.setMinutes(base.getMinutes() + minuteOffset);
    base.setSeconds(base.getSeconds() + secondOffset);
    const iso = base.toISOString();
    return { iso, ts: base.getTime(), time: iso.slice(11,16) };
  }

// SUBMODULE: API export & global attach @internal - registriert öffentliche Methoden unter AppModules.bp
  const bpApi = {
    requiresBpComment: requiresBpComment,
    clearBpCommentWarnings: clearBpCommentWarnings,
    bpFieldId: bpFieldId,
    bpSelector: bpSelector,
    resetBpPanel: resetBpPanel,
    blockHasData: blockHasData,
    saveBlock: saveBlock,
    baseEntry: baseEntry,
    appendNote: appendNote,
    allocateNoteTimestamp: allocateNoteTimestamp
  };
  appModules.bp = Object.assign(appModules.bp || {}, bpApi);
  Object.entries(bpApi).forEach(([name, fn]) => {
    if (typeof global[name] === 'undefined') {
      global[name] = fn;
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
