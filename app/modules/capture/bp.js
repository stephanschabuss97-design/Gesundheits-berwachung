'use strict';
/**
 * MODULE: bp.js
 * Description: Verwaltet Blutdruck-Erfassung, Validierung und Persistierung inkl. Kommentar-Pflicht, Panel-Reset und Datensynchronisation.
 * Submodules:
 *  - requiresBpComment (public, Kommentar-Pflichtprüfung)
 *  - updateBpCommentWarnings (public, UI-Hinweislogik)
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
  const BP_SYS_THRESHOLD = 130;
  const BP_DIA_THRESHOLD = 90;

  const normalizeContext = (ctx) => {
    if (ctx === 'A' || ctx === 'M') return ctx;
    throw new Error(`Invalid BP context "${ctx}"`);
  };

const getCommentElementUnsafe = (normalizedCtx) => {
  return document.getElementById(bpFieldId('bpComment', normalizedCtx));
};

  const getCommentElement = (ctx) => {
    const normalized = normalizeContext(ctx);
    return getCommentElementUnsafe(normalized);
  };

  function requiresBpComment(which) {
    let ctx;
    try {
      ctx = normalizeContext(which);
    } catch (_) {
      return false;
    }
    const sys = Number($(bpSelector('sys', ctx))?.value);
    const dia = Number($(bpSelector('dia', ctx))?.value);
    const el = getCommentElement(ctx);
    const comment = (el?.value || "").trim();
    const sysHigh = Number.isFinite(sys) && sys > BP_SYS_THRESHOLD;
    const diaHigh = Number.isFinite(dia) && dia > BP_DIA_THRESHOLD;
    if (!sysHigh && !diaHigh) return false;
    return comment.length === 0;
  }

  function updateBpCommentWarnings() {
    BP_CONTEXTS.forEach(which => {
      let needs = false;
      try {
        needs = requiresBpComment(which);
      } catch (_) {
        needs = false;
      }
      const el = getCommentElement(which);
      if (!el) return;
      if (needs) {
        el.style.outline = "2px solid var(--danger)";
        el.setAttribute("aria-invalid", "true");
      } else {
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
    let ctx;
    try {
      ctx = normalizeContext(which);
    } catch (_) {
      ctx = 'M';
    }
    ['sys','dia','pulse','bpComment'].forEach(id => {
      const el = document.getElementById(bpFieldId(id, ctx));
      if (el) el.value = '';
    });
    updateBpCommentWarnings();
    if (focus) {
      const target = document.getElementById(bpFieldId('sys', ctx));
      if (target) target.focus();
    }
  }

  // SUBMODULE: blockHasData @internal - detects if BP panel has any input before saving
  function blockHasData(which){
    let ctx;
    try {
      ctx = normalizeContext(which);
    } catch (_) {
      return false;
    }
    const getVal = (sel) => document.querySelector(sel)?.value?.trim();
    const sys = getVal(bpSelector('sys', ctx));
    const dia = getVal(`#dia${ctx}`);
    const pulse = getVal(`#pulse${ctx}`);
    const commentEl = getCommentElement(ctx);
    const comment = (commentEl?.value || "").trim();
    return !!(sys || dia || pulse || comment);
  }

  // SUBMODULE: saveBlock @internal - persists BP measurements and optional comments
  async function saveBlock(contextLabel, which, includeWeight=false, force=false){
  let ctx;
  try {
    ctx = normalizeContext(which);
  } catch (err) {
    try {
      diag.add?.(`[bp] invalid context "${which}": ${err?.message || err}`);
    } catch (_) { /* noop */ }
    uiError?.('Ungültiger Messkontext – bitte morgens oder abends auswählen.');
    return false;
  }
  const date = $("#date").value || todayStr();
  const time = ctx === 'M' ? '07:00' : '22:00';

  const sys   = $(bpSelector('sys', ctx)).value   ? toNumDE($(bpSelector('sys', ctx)).value)   : null;
  const dia   = $(`#dia${ctx}`).value   ? toNumDE($(`#dia${ctx}`).value)   : null;
  const pulse = $(`#pulse${ctx}`).value ? toNumDE($(`#pulse${ctx}`).value) : null;

  const commentEl = getCommentElement(ctx);
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
      await appendNote(date, ctx === 'M' ? '[Morgens] ' : '[Abends] ', comment);
      if (commentEl) commentEl.value = '';
      updateBpCommentWarnings();
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
    requiresBpComment,
    updateBpCommentWarnings,
    resetBpPanel,
    blockHasData,
    saveBlock
  };
  appModules.bp = Object.assign(appModules.bp || {}, bpApi);
  global.AppModules.bp = appModules.bp;
})(typeof window !== 'undefined' ? window : globalThis);
