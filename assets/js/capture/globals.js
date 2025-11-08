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

// Getter / Setter helpers for mutable primitives so external callers
// always observe the current value even when re-assigned later.
function getDateUserSelected() { return __dateUserSelected; }
function setDateUserSelected(v) { __dateUserSelected = !!v; }

function getLastKnownToday() { return __lastKnownToday; }
function setLastKnownToday(v) { __lastKnownToday = String(v || ''); }

function getBpUserOverride() { return __bpUserOverride; }
function setBpUserOverride(v) { __bpUserOverride = !!v; }

function getMidnightTimer() { return __midnightTimer; }
function setMidnightTimer(val) { __midnightTimer = val; }

function getNoonTimer() { return __noonTimer; }
function setNoonTimer(val) { __noonTimer = val; }

function getDayHeartbeat() { return __dayHeartbeat; }
function setDayHeartbeat(val) { __dayHeartbeat = val; }

function getIntakeResetDoneFor() { return __intakeResetDoneFor; }
function setIntakeResetDoneFor(val) { __intakeResetDoneFor = val; }

function getBpPanesCache() { return __bpPanesCache; }
function setBpPanesCache(val) { __bpPanesCache = val; }

function getLastUserId() { return __lastUserId; }
function setLastUserId(val) { __lastUserId = val; }

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
  // accessors for mutable primitives/timers (use getters to read current value)
  getDateUserSelected,
  setDateUserSelected,
  getLastKnownToday,
  setLastKnownToday,
  getBpUserOverride,
  setBpUserOverride,
  getMidnightTimer,
  setMidnightTimer,
  getNoonTimer,
  setNoonTimer,
  getDayHeartbeat,
  setDayHeartbeat,
  getIntakeResetDoneFor,
  setIntakeResetDoneFor,
  getBpPanesCache,
  setBpPanesCache,
  getLastUserId,
  setLastUserId,
  setBusy,
  sleep,
  softWarnRange
};
