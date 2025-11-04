'use strict';

/**
 * MODULE: UTILITIES (v1.2)
 * intent: generische DOM/Format Helper für den M.I.D.A.S.-Monolith
 * exports: $, $$, fmtNum, pad2, todayStr, timeStr, esc, nl2br
 * compat: 100 % rückwärtskompatibel zu window.AppModules.utils
 */

// === DOM QUERY HELPERS ===
// Schnelle, sichere DOM-Abfragen
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// === NUMBER / DATE FORMATTING ===
/**
 * Formatiert eine Zahl auf d Nachkommastellen.
 * Gibt '' zurück, wenn Wert ungültig ist.
 */
const fmtNum = (n, d = 1) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(d) : '';
};

/** Füllt Zahl links mit 0 auf zwei Stellen */
const pad2 = n => String(n).padStart(2, '0');

/** Liefert aktuelles Datum als YYYY-MM-DD */
const todayStr = (date = new Date()) => {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
};

/** Liefert aktuelle Uhrzeit als HH:MM */
const timeStr = (date = new Date()) =>
  `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

// === STRING ESCAPE HELPERS ===
/** Ersetzt HTML-kritische Zeichen durch Entitäten */
const esc = s =>
  String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

/** Wandelt Zeilenumbrüche in <br> um (nach Escape) */
const nl2br = s => esc(s).replace(/\n/g, '<br>');

// === EXPORT / GLOBAL REGISTRATION ===
(() => {
  const utilsApi = { $, $$, fmtNum, pad2, todayStr, timeStr, esc, nl2br };

  // Namespace sichern
  window.AppModules = window.AppModules || {};
  window.AppModules.utils = utilsApi;

  // Globale Shortcuts nur setzen, wenn noch nicht vorhanden
  Object.entries(utilsApi).forEach(([key, fn]) => {
    if (!(key in window)) window[key] = fn;
  });

  // Debug-Ausgabe (optional, auskommentieren im Release)
  // console.debug('[Utils] geladen:', Object.keys(utilsApi).join(', '));
})();
