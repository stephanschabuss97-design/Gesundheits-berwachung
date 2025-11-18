'use strict';
/**
 * MODULE: capture/entry.js
 * Description: Stellt gemeinsame Helfer bereit, um standardisierte Capture-Eintraege aufzubauen.
 * Exports:
 *  - createBaseEntry(date, time, contextLabel)
 */

(function (global) {
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;

  const FALLBACK_CONTEXT = 'Tag';

  const sanitizeDate = (value) => (value && typeof value === 'string' ? value : todayStr());
  const sanitizeTime = (value) => (value && typeof value === 'string' ? value : '12:00');

  const createBaseEntry = (date, time, contextLabel = FALLBACK_CONTEXT) => {
    const safeDate = sanitizeDate(date);
    const safeTime = sanitizeTime(time);
    const iso = new Date(`${safeDate}T${safeTime}`).toISOString();
    const ts = new Date(`${safeDate}T${safeTime}`).getTime();
    return {
      date: safeDate,
      time: safeTime,
      dateTime: iso,
      ts,
      context: contextLabel || FALLBACK_CONTEXT,
      sys: null,
      dia: null,
      pulse: null,
      weight: null,
      map: null,
      notes: (document.getElementById('notesDay')?.value || '').trim()
    };
  };

  const captureEntryApi = { createBaseEntry };
  appModules.captureEntry = Object.assign(appModules.captureEntry || {}, captureEntryApi);

  if (typeof global.createCaptureEntry === 'undefined') {
    global.createCaptureEntry = createBaseEntry;
  }
})(typeof window !== 'undefined' ? window : globalThis);
