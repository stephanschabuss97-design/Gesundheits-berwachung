
---

## 2️⃣ JS-Dispatcher: `app/modules/assistant/actions.js`

Jetzt der Client-Teil, der diese Actions entgegen nimmt und (später) Supabase-Funktionen ruft.

```js
'use strict';

/**
 * MODULE: app/modules/assistant/actions.js
 *
 * Dispatches assistant actions (coming from the backend) to the actual
 * MIDAS data layer (Supabase) and/or UI.
 *
 * This module is intentionally conservative:
 *  - validates payloads
 *  - logs unknown actions
 *  - tries to avoid destructive operations
 */

/**
 * @typedef {Object} AssistantAction
 * @property {string} type
 * @property {Object} [payload]
 */

/**
 * @typedef {Object} AssistantActionsOptions
 * @property {() => any} [getSupabaseApi]  // returns AppModules.supabase or similar
 * @property {(msg: string, level?: 'info'|'success'|'warning'|'error') => void} [notify]
 * @property {(err: any) => void} [onError]
 */

/**
 * Main entry: dispatch a list of actions.
 *
 * @param {AssistantAction[]} actions
 * @param {AssistantActionsOptions} [options]
 * @returns {Promise<void>}
 */
export async function dispatchAssistantActions(actions, options = {}) {
  if (!Array.isArray(actions) || actions.length === 0) return;

  const {
    getSupabaseApi = defaultSupabaseAccessor,
    notify = defaultNotify,
    onError = defaultOnError
  } = options;

  const sb = getSupabaseApi();
  if (!sb) {
    console.warn('[MIDAS Assistant] Supabase API not available, skipping actions.');
    return;
  }

  for (const action of actions) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await handleSingleAction(action, sb, notify);
    } catch (err) {
      onError(err);
    }
  }
}

/**
 * Handles a single action.
 *
 * @param {AssistantAction} action
 * @param {any} sb   // SupabaseAPI surface (AppModules.supabase)
 * @param {(msg: string, level?: 'info'|'success'|'warning'|'error') => void} notify
 * @returns {Promise<void>}
 */
async function handleSingleAction(action, sb, notify) {
  if (!action || typeof action.type !== 'string') {
    console.warn('[MIDAS Assistant] Invalid action:', action);
    return;
  }

  const payload = action.payload || {};

  switch (action.type) {
    case 'add_intake_water':
      await handleAddIntakeWater(payload, sb, notify);
      break;

    case 'add_intake_custom':
      await handleAddIntakeCustom(payload, sb, notify);
      break;

    case 'log_blood_pressure':
      await handleLogBloodPressure(payload, sb, notify);
      break;

    case 'log_body_metrics':
      await handleLogBodyMetrics(payload, sb, notify);
      break;

    case 'add_note':
      await handleAddNote(payload, sb, notify);
      break;

    case 'schedule_appointment':
      await handleScheduleAppointment(payload, sb, notify);
      break;

    case 'show_info_message':
      handleShowInfoMessage(payload, notify);
      break;

    default:
      console.warn('[MIDAS Assistant] Unknown action type:', action.type, action);
      break;
  }
}

// ---------------------------------------------------------------------------
// Action Handlers
// ---------------------------------------------------------------------------

async function handleAddIntakeWater(payload, sb, notify) {
  const amount = Number(payload.amount_ml);
  if (!Number.isFinite(amount) || amount <= 0) {
    console.warn('[MIDAS Assistant] add_intake_water – invalid amount_ml:', payload.amount_ml);
    return;
  }

  // TODO: Hier deine echte Intake-Logik verdrahten:
  // 1) loadIntakeToday()
  // 2) Wasser um `amount` erhöhen
  // 3) saveIntakeTotals() oder saveIntakeTotalsRpc() aufrufen

  console.log('[MIDAS Assistant] Would add water intake (ml):', amount, payload.note);

  notify(`Ich habe ${amount} ml Wasser für heute vorgemerkt (Assist-Action).`, 'success');
}

async function handleAddIntakeCustom(payload, sb, notify) {
  const label = (payload.label || '').trim();
  if (!label) {
    console.warn('[MIDAS Assistant] add_intake_custom – missing label:', payload);
    return;
  }

  const waterMl = safeNumber(payload.water_ml);
  const saltG = safeNumber(payload.salt_g);
  const proteinG = safeNumber(payload.protein_g);
  const carbsG = safeNumber(payload.carbs_g);
  const fatG = safeNumber(payload.fat_g);

  // TODO: Hier Intake-Eintrag ins Tagesmodell integrieren (z. B. als "Meal Item")
  console.log('[MIDAS Assistant] Would add custom intake:', {
    label,
    waterMl,
    saltG,
    proteinG,
    carbsG,
    fatG,
    category: payload.category,
    note: payload.note
  });

  notify(`Ich habe "${label}" als Intake-Eintrag vorgemerkt.`, 'success');
}

async function handleLogBloodPressure(payload, sb, notify) {
  const sys = safeNumber(payload.systolic);
  const dia = safeNumber(payload.diastolic);
  const hr = payload.heart_rate != null ? safeNumber(payload.heart_rate) : null;

  if (!isValidBp(sys, dia)) {
    console.warn('[MIDAS Assistant] log_blood_pressure – invalid BP values:', payload);
    return;
  }

  // TODO: Hier deine vitals-Logik integrieren:
  // z. B. sb.logBp({ systolic: sys, diastolic: dia, heart_rate: hr, ... })

  console.log('[MIDAS Assistant] Would log blood pressure:', {
    systolic: sys,
    diastolic: dia,
    heart_rate: hr,
    context: payload.context,
    note: payload.note
  });

  notify(`Blutdruck ${sys}/${dia}${hr ? ` (Puls ${hr})` : ''} gespeichert (Assist-Action).`, 'success');
}

async function handleLogBodyMetrics(payload, sb, notify) {
  const weight = payload.weight_kg != null ? safeNumber(payload.weight_kg) : null;
  const waist = payload.waist_cm != null ? safeNumber(payload.waist_cm) : null;
  const bodyFat = payload.body_fat_pct != null ? safeNumber(payload.body_fat_pct) : null;
  const muscle = payload.muscle_pct != null ? safeNumber(payload.muscle_pct) : null;

  if (weight == null && waist == null && bodyFat == null && muscle == null) {
    console.warn('[MIDAS Assistant] log_body_metrics – no metrics provided:', payload);
    return;
  }

  // TODO: Hier supabase/api/vitals.js für Body-Insert nutzen.
  console.log('[MIDAS Assistant] Would log body metrics:', {
    weight,
    waist,
    bodyFat,
    muscle,
    note: payload.note
  });

  notify('Körperdaten gespeichert (Assist-Action).', 'success');
}

async function handleAddNote(payload, sb, notify) {
  const title = (payload.title || '').trim();
  const text = (payload.text || '').trim();
  const category = (payload.category || 'info').trim();

  if (!title && !text) {
    console.warn('[MIDAS Assistant] add_note – empty note payload:', payload);
    return;
  }

  // TODO: sb.appendNoteRemote(...) nutzen, um Notiz in Supabase zu schreiben.
  console.log('[MIDAS Assistant] Would add note:', {
    category,
    title,
    text,
    severity: payload.severity
  });

  notify('Notiz gespeichert (Assist-Action).', 'success');
}

async function handleScheduleAppointment(payload, sb, notify) {
  const date = (payload.date || '').trim();
  const label = (payload.label || payload.kind || '').trim();

  if (!date || !label) {
    console.warn('[MIDAS Assistant] schedule_appointment – missing date/label:', payload);
    return;
  }

  // TODO: Hier deine Appointments-Logik andocken (sql/03_Appointments.sql etc.)
  console.log('[MIDAS Assistant] Would schedule appointment:', {
    date,
    time: payload.time,
    kind: payload.kind,
    label,
    note: payload.note
  });

  notify(`Termin "${label}" am ${date} vorgemerkt (Assist-Action).`, 'success');
}

function handleShowInfoMessage(payload, notify) {
  const text = (payload.text || '').trim();
  if (!text) return;
  const level = payload.level === 'warning' || payload.level === 'error' || payload.level === 'success'
    ? payload.level
    : 'info';

  notify(text, level);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeNumber(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function isValidBp(sys, dia) {
  if (!Number.isFinite(sys) || !Number.isFinite(dia)) return false;
  if (sys <= 50 || sys >= 260) return false;
  if (dia <= 30 || dia >= 160) return false;
  return true;
}

function defaultSupabaseAccessor() {
  if (typeof window === 'undefined') return null;
  return window.AppModules && window.AppModules.supabase
    ? window.AppModules.supabase
    : null;
}

function defaultNotify(msg, level = 'info') {
  // Später kannst du das mit deinem echten UI-Toast verbinden.
  console.log(`[MIDAS Notify][${level}] ${msg}`);
}

function defaultOnError(err) {
  console.error('[MIDAS Assistant] Action dispatch error:', err);
}
