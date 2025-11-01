/**
 * MODULE: UTILITIES
 * intent: generische DOM/Format Helper fuer das Monolith-Skript
 * exports: $, $$, fmtNum, pad2, todayStr, timeStr, esc, nl2br
 * notes: Logik unveraendert aus index.html extrahiert
 */

// SUBMODULE: query helpers @internal - schnelle DOM-Shortcuts
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// SUBMODULE: formatting helpers @internal - Zahlen/Datum formatieren
const fmtNum = (n, d = 1) =>
  n === null || n === undefined || Number.isNaN(Number(n))
    ? ''
    : Number(n).toFixed(d);

const pad2 = n => n.toString().padStart(2, '0');

const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const timeStr = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// SUBMODULE: string escape helpers @internal - escaped HTML und Zeilenumbrueche
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function nl2br(s) {
  return esc(s).replace(/\n/g, '<br>');
}

