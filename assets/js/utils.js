'use strict';
/**
 * MODULE: assets/js/utils.js
 * Description: Stellt universelle DOM-, Formatierungs- und Download-Helfer für M.I.D.A.S. bereit.
 * Submodules:
 *  - DOM Query Helpers ($, $$)
 *  - Number/Date Formatting (fmtNum, pad2, todayStr, timeStr)
 *  - String Escaping (esc, nl2br)
 *  - Download Utility (dl, ensureDownloadLink, normalizeDownloadName)
 * Notes:
 *  - Vollständig rückwärtskompatibel zu window.AppModules.utils
 *  - Keine externen Abhängigkeiten; sicher für Monolith- und Modularbetrieb.
 */

// SUBMODULE: domQuery @public - schnelle DOM-Selektoren im Stil von jQuery
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// SUBMODULE: fmtNum @public - formatiert Zahlen auf definierte Nachkommastellen
const fmtNum = (n, d = 1) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(d) : '';
};

// SUBMODULE: pad2 @public - füllt Zahlen links auf zwei Stellen mit Nullen
const pad2 = n => String(n).padStart(2, '0');

// SUBMODULE: todayStr @public - liefert heutiges Datum im Format YYYY-MM-DD
const todayStr = (date = new Date()) => {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
};

// SUBMODULE: timeStr @public - liefert aktuelle Uhrzeit im Format HH:MM
const timeStr = (date = new Date()) =>
  `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

// SUBMODULE: esc @public - ersetzt HTML-Sonderzeichen durch sichere Entitäten
const esc = s =>
  String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

// SUBMODULE: nl2br @public - ersetzt Zeilenumbrüche durch <br>-Tags nach Escape
const nl2br = s => esc(s).replace(/\n/g, '<br>');

// === DOWNLOAD HELPER ===
let sharedDownloadLink = null;

// SUBMODULE: normalizeDownloadName @internal - validiert und erweitert Dateinamen
const normalizeDownloadName = (name = '') => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'download.bin';
  if (/\.[A-Za-z0-9]+$/.test(trimmed) && trimmed.includes('.')) return trimmed;
  return `${trimmed}.bin`;
};

// SUBMODULE: ensureDownloadLink @internal - erstellt/verwendet unsichtbares <a>-Element zum Download
const ensureDownloadLink = () => {
  if (typeof document === 'undefined' || !document.body) return null;
  if (sharedDownloadLink && sharedDownloadLink.isConnected) return sharedDownloadLink;
  sharedDownloadLink = document.createElement('a');
  Object.assign(sharedDownloadLink.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(100%)',
    opacity: '0',
    pointerEvents: 'none'
  });
  document.body.appendChild(sharedDownloadLink);
  return sharedDownloadLink;
};

// SUBMODULE: dl @public - generiert Download aus String/Binary-Content via Blob-Link
const dl = (filename, content, mime = 'application/octet-stream') => {
  try {
    const link = ensureDownloadLink();
    if (!link) {
      console.error('[utils] dl failed: document unavailable');
      return;
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = normalizeDownloadName(filename);
    link.click();
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
      try {
        link.removeAttribute('href');
        link.removeAttribute('download');
      } catch (_) {}
    }, 200);
  } catch (err) {
    console.error('[utils] dl failed', err);
  }
};

// SUBMODULE: export @internal - registriert utils-API unter AppModules und als globale Fallbacks
(() => {
  const utilsApi = { $, $$, fmtNum, pad2, todayStr, timeStr, esc, nl2br, dl };
  window.AppModules = window.AppModules || {};
  window.AppModules.utils = utilsApi;
  Object.entries(utilsApi).forEach(([key, fn]) => {
    if (!(key in window)) window[key] = fn;
  });
})();
