'use strict';
/**
 * MODULE: captureGlobals
 * intent: Capture/Lifestyle defaults, timers, and helper utilities shared across legacy code
 * exports: LS_WATER_GOAL, LS_SALT_MAX, LS_PROTEIN_GOAL, LS_INTAKE_RESET_DONE_KEY,
 *          captureIntakeState, __lsTotals, __dateUserSelected, __lastKnownToday,
 *          __bpUserOverride, __midnightTimer, __noonTimer, __dayHeartbeat,
 *          __intakeResetDoneFor, __bpPanesCache, __lastUserId, setBusy, sleep, softWarnRange
 * compat: Loaded as classic script; globals match previous inline definitions.
 */

var LS_WATER_GOAL = 3000; // Milliliter Zielbereich
var LS_SALT_MAX = 10; // Gramm obere Grenze
var LS_PROTEIN_GOAL = 120; // Gramm Zielbereich
var LS_INTAKE_RESET_DONE_KEY = 'healthlog_intake_reset_done';

var captureIntakeState = {
  logged: false,
  dayIso: todayStr(),
  totals: { water_ml: 0, salt_g: 0, protein_g: 0 }
};
var __lsTotals = { water_ml: 0, salt_g: 0, protein_g: 0 };
var __dateUserSelected = false;
var __lastKnownToday = todayStr();
var __bpUserOverride = false;
var __midnightTimer = null;
var __noonTimer = null;
var __dayHeartbeat = null;
var __intakeResetDoneFor = null; // Tag, fuer den Reset bereits gelaufen ist (pro Tab)
var __bpPanesCache = null;
var __lastUserId = null;

function setBusy(on) {
  const b = document.getElementById('busy');
  if (b) b.style.display = on ? 'flex' : 'none';
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function softWarnRange(el, min, max) {
  const v = Number(el.value);
  if (!isNaN(v) && (v < min || v > max)) {
    el.style.outline = '2px solid var(--warn)';
  } else {
    el.style.outline = '';
  }
}

window.AppModules = window.AppModules || {};
window.AppModules.captureGlobals = {
  LS_WATER_GOAL,
  LS_SALT_MAX,
  LS_PROTEIN_GOAL,
  LS_INTAKE_RESET_DONE_KEY,
  captureIntakeState,
  __lsTotals,
  __dateUserSelected,
  __lastKnownToday,
  __bpUserOverride,
  __midnightTimer,
  __noonTimer,
  __dayHeartbeat,
  __intakeResetDoneFor,
  __bpPanesCache,
  __lastUserId,
  setBusy,
  sleep,
  softWarnRange
};
