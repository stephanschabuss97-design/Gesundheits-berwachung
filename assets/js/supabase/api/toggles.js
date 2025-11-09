'use strict';
/**
 * MODULE: supabase/api/toggles.js
 * intent: Syncs capture toggle states with day flags fetched from Supabase
 * exports: syncCaptureToggles
 */

import { getUserId } from '../auth/core.js';
import { loadFlagsFromView } from './vitals.js';

const globalWindow = typeof window !== 'undefined' ? window : undefined;
const diag =
  globalWindow?.diag ||
  globalWindow?.AppModules?.diag ||
  globalWindow?.AppModules?.diagnostics ||
  { add() {} };

const getTodayIso = () => {
  const fn = globalWindow?.todayStr;
  if (typeof fn === 'function') return fn();
  try {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } catch {
    return '';
  }
};

const setFlag = (name, value) => {
  const captureModule = globalWindow?.AppModules?.capture;
  if (captureModule && typeof captureModule[name] === 'function') {
    captureModule[name](value);
    return true;
  }
  if (typeof globalWindow?.[name] === 'function') {
    globalWindow[name](value);
    return true;
  }
  return false;
};

export async function syncCaptureToggles() {
  try {
    const uid = await getUserId();
    const dayIso = document.getElementById('date')?.value || getTodayIso();
    if (!uid || !dayIso) return;
    const rows = await loadFlagsFromView({ user_id: uid, from: dayIso, to: dayIso });
    const record = Array.isArray(rows) && rows.length ? rows[0] : null;
    const f =
      record || {
        training: false,
        sick: false,
        low_intake: false,
        salt_high: false,
        protein_high90: false,
        valsartan_missed: false,
        forxiga_missed: false,
        nsar_taken: false
      };
    const failedFlags = [];
    if (!setFlag('setTraining', !!f.training)) failedFlags.push('training');
    if (!setFlag('setSick', !!f.sick)) failedFlags.push('sick');
    if (!setFlag('setLowIntake', !!f.low_intake)) failedFlags.push('low_intake');
    if (!setFlag('setSaltHigh', !!f.salt_high)) failedFlags.push('salt_high');
    if (!setFlag('setProteinHigh', !!f.protein_high90)) failedFlags.push('protein_high90');
    if (!setFlag('setValsartanMiss', !!f.valsartan_missed)) failedFlags.push('valsartan_missed');
    if (!setFlag('setForxigaMiss', !!f.forxiga_missed)) failedFlags.push('forxiga_missed');
    if (!setFlag('setNsar', !!f.nsar_taken)) failedFlags.push('nsar_taken');
    if (failedFlags.length) {
      diag.add?.(`[toggles] failed to set: ${failedFlags.join(', ')}`);
    }
    const flagsCommentEl = document.getElementById('flagsComment');
    if (flagsCommentEl) flagsCommentEl.value = '';
  } catch (err) {
    diag.add?.('[toggles] sync failed: ' + (err?.message || err));
    console.error?.('[toggles] sync failed', err);
  }
}
