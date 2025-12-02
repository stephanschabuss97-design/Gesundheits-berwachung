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
    logWarn('Supabase API not available, skipping actions.');
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
    logWarn('Invalid action payload');
    return;
  }

  const type = action.type;
  const payload = action.payload || {};

  switch (type) {
    // -----------------------------------------------------------------------
    // CORE
    // -----------------------------------------------------------------------
    case 'intake_save':
      await handleIntakeSave(payload, sb, notify);
      break;

    // -----------------------------------------------------------------------
    // UI
    // -----------------------------------------------------------------------
    case 'open_module':
      await handleOpenModule(payload, sb, notify);
      break;

    case 'show_status':
      await handleShowStatus(payload, sb, notify);
      break;

    case 'highlight':
      await handleHighlight(payload, sb, notify);
      break;

    // -----------------------------------------------------------------------
    // CONVERSATION FLOW
    // -----------------------------------------------------------------------
    case 'ask_confirmation':
      await handleAskConfirmation(payload, sb, notify);
      break;

    case 'close_conversation':
      await handleCloseConversation(payload, sb, notify);
      break;

    case 'transition_to_photo_mode':
      await handleTransitionToPhotoMode(payload, sb, notify);
      break;

    case 'transition_to_text_chat':
      // Placeholder – UI wiring folgt in Phase 3.x
      await handleTransitionToTextChat(payload, sb, notify);
      break;

    // -----------------------------------------------------------------------
    // FOODCOACH / VISION
    // -----------------------------------------------------------------------
    case 'suggest_intake':
      await handleSuggestIntake(payload, sb, notify);
      break;

    case 'confirm_intake':
      await handleConfirmIntake(payload, sb, notify);
      break;

    // -----------------------------------------------------------------------
    // SYSTEM AWARENESS
    // -----------------------------------------------------------------------
    case 'system_status':
      await handleSystemStatus(payload, sb, notify);
      break;

    case 'read_touchlog':
      // Debug-only, nur bei DEV_ALLOW_DEFAULTS sinnvoll
      await handleReadTouchlog(payload, sb, notify);
      break;

    case 'read_diagnostics':
      // Debug-only, nur bei DEV_ALLOW_DEFAULTS sinnvoll
      await handleReadDiagnostics(payload, sb, notify);
      break;

    case 'read_bootstrap_status':
      // Debug-only, nur bei DEV_ALLOW_DEFAULTS sinnvoll
      await handleReadBootstrapStatus(payload, sb, notify);
      break;

    // -----------------------------------------------------------------------
    // GENERIC INFO / LEGACY
    // -----------------------------------------------------------------------
    case 'show_info_message':
      handleShowInfoMessage(payload, notify);
      break;

    default:
      logWarn(`Unknown action type: ${type}`);
      break;
  }
}

// ---------------------------------------------------------------------------
// Action Handlers – CORE
// ---------------------------------------------------------------------------

async function handleIntakeSave(payload, sb, notify) {
  const hasWater = payload.water_ml != null && payload.water_ml !== '';
  const hasSalt = payload.salt_g != null && payload.salt_g !== '';
  const hasProtein = payload.protein_g != null && payload.protein_g !== '';

  const waterMl = hasWater ? safeNumber(payload.water_ml, NaN) : null;
  const saltG = hasSalt ? safeNumber(payload.salt_g, NaN) : null;
  const proteinG = hasProtein ? safeNumber(payload.protein_g, NaN) : null;

  const label = (payload.label || '').trim() || null;
  const note = (payload.note || '').trim() || null;

  if (!hasWater && !hasSalt && !hasProtein) {
    logWarn('intake_save – no metrics provided');
    return;
  }

  if (hasWater && (!Number.isFinite(waterMl) || waterMl <= 0)) {
    logWarn('intake_save – invalid water_ml');
  }

  if (hasSalt && !Number.isFinite(saltG)) {
    logWarn('intake_save – invalid salt_g');
  }

  if (hasProtein && !Number.isFinite(proteinG)) {
    logWarn('intake_save – invalid protein_g');
  }

  logInfo('IntakeSave requested');

  // TODO: Hier deine echte Intake-Speicherlogik verdrahten (Supabase / RPCs).
  // z. B.: await sb.intake.saveAssistantIntake({ waterMl, saltG, proteinG, label, note });

  const parts = [];
  if (Number.isFinite(waterMl) && waterMl > 0) parts.push(`${waterMl} ml Wasser`);
  if (Number.isFinite(saltG)) parts.push(`${saltG} g Salz`);
  if (Number.isFinite(proteinG)) parts.push(`${proteinG} g Protein`);

  const summary = parts.length ? parts.join(', ') : 'deinen Eintrag';

  notify(`Ich habe ${summary} für heute vorgemerkt (Assist-Action).`, 'success');
}

// ---------------------------------------------------------------------------
// Action Handlers – UI
// ---------------------------------------------------------------------------

async function handleOpenModule(payload, _sb, notify) {
  const target = (payload.target || payload.module || '').trim();

  if (!target) {
    logWarn('open_module – missing target');
    return;
  }

  logInfo('OpenModule requested');

  // TODO: Hier echtes UI-Routing verdrahten (z. B. AppModules.hub.openPanel(target)).
  notify(`Ich öffne das Modul "${target}".`, 'info');
}

async function handleShowStatus(payload, sb, notify) {
  const kind = (payload.kind || '').trim() || 'intake_today';

  logInfo('ShowStatus requested');

  try {
    notify('Ich pr?fe deinen aktuellen Status.', 'info');
  } catch (err) {
    logError('show_status failed', err);
    notify('Beim Lesen deines Status ist ein Fehler aufgetreten.', 'warning');
  }
}

async function handleHighlight(payload, _sb, notify) {
  const target = (payload.target || '').trim();
  if (!target) {
    logWarn('highlight ? missing target');
    return;
  }

  logInfo('Highlight requested');

  // TODO: Hier echtes UI-Highlighting verdrahten (CSS-Klasse, kurze Animation o.ä.).
  notify(`Ich markiere den Bereich "${target}".`, 'info');
}

// ---------------------------------------------------------------------------
// Action Handlers – Conversation Flow
// ---------------------------------------------------------------------------

async function handleAskConfirmation(payload, _sb, notify) {
  // Diese Action dient vor allem der Klarheit im Flow; die eigentliche
  // Frage stellt der Assistant bereits in seiner Text-/Voice-Antwort.
  logInfo('AskConfirmation');
  // Kein direktes notify nötig – der sprachliche Teil kommt aus der KI.
}

async function handleCloseConversation(payload, _sb, notify) {
  logInfo('CloseConversation');
  // TODO: Hier kannst du später den Voice-Loop explizit schließen (State reset etc.).
  notify('Das Gespräch ist beendet. Ich bin bereit, wenn du mich wieder brauchst.', 'info');
}

async function handleTransitionToPhotoMode(payload, _sb, notify) {
  logInfo('TransitionToPhotoMode');
  // TODO: Textchat-Panel + Kamera öffnen.
  notify('Wechsle in den Foto-Modus. Mach ein Bild deiner Mahlzeit.', 'info');
}

async function handleTransitionToTextChat(payload, _sb, notify) {
  logInfo('TransitionToTextChat');
  // TODO: Assistant-Textchat-Panel öffnen.
  notify('Wechsle in den Text-Chat.', 'info');
}

// ---------------------------------------------------------------------------
// Action Handlers – Foodcoach / Vision
// ---------------------------------------------------------------------------

async function handleSuggestIntake(payload, _sb, notify) {
  // Diese Action kommt typischerweise aus /midas-vision (Fotoanalyse).
  const waterMl = payload.water_ml != null ? safeNumber(payload.water_ml, NaN) : null;
  const saltG = payload.salt_g != null ? safeNumber(payload.salt_g, NaN) : null;
  const proteinG = payload.protein_g != null ? safeNumber(payload.protein_g, NaN) : null;
  const label = (payload.label || '').trim() || 'Mahlzeit';
  const confidence = payload.confidence != null ? safeNumber(payload.confidence, NaN) : null;

  logInfo(
    `SuggestIntake received for ${label} (water=${Number.isFinite(waterMl) ? waterMl : '-'} ml, ` +
      `salt=${Number.isFinite(saltG) ? saltG : '-'} g, protein=${Number.isFinite(proteinG) ? proteinG : '-'} g)`
  );

  // Die eigentliche Frage ("Soll ich das loggen?") stellt der Assistant,
  // hier geben wir nur optional ein kleines UI-Signal.
  notify(`Ich habe einen Vorschlag für "${label}" vorbereitet.`, 'info');
}

async function handleConfirmIntake(payload, sb, notify) {
  // ConfirmIntake ist ein Wrapper um IntakeSave – entweder übernimmt er
  // direkt die Werte oder er greift auf den letzten Vorschlag zurück.
  logInfo('ConfirmIntake');

  // Standardfall: Payload enthält bereits intake_save-kompatible Felder.
  await handleIntakeSave(payload, sb, notify);
}

// ---------------------------------------------------------------------------
// Action Handlers – System Awareness
// ---------------------------------------------------------------------------

async function handleSystemStatus(payload, sb, notify) {
  logInfo('SystemStatus requested');

  const online = typeof navigator !== 'undefined' ? navigator.onLine : null;
  const hasSupabase = !!sb;

  const touchlog = readLatestTouchlogSnapshot();
  const diag = readDiagnosticsSnapshot();
  const bootstrap = readBootstrapLogSnapshot();

  const parts = [];

  if (online != null) {
    parts.push(online ? 'Online-Verbindung vorhanden' : 'Der Browser ist aktuell offline');
  } else {
    parts.push('Netzwerkstatus nicht verfügbar');
  }

  parts.push(hasSupabase ? 'Supabase-Client aktiv' : 'Supabase-Client nicht verfügbar');

  if (touchlog) parts.push('Touchlog-Daten vorhanden');
  if (bootstrap) parts.push('Bootstrap-Log vorhanden');
  if (diag) parts.push('Diagnosedaten verfügbar');

  if (!parts.length) {
    parts.push('Keine Systemdaten verfügbar.');
  }

  notify(parts.join(' · '), 'info');
}

async function handleReadTouchlog(payload, _sb, notify) {
  logInfo('ReadTouchlog requested');

  const snapshot = readLatestTouchlogSnapshot();
  if (!snapshot) {
    notify('Ich habe keinen Touchlog gefunden.', 'info');
    return;
  }

  logInfo('Touchlog snapshot read');
  notify('Ich habe den Touchlog geprüft.', 'info');
}

async function handleReadDiagnostics(payload, _sb, notify) {
  logInfo('ReadDiagnostics requested');

  const diag = readDiagnosticsSnapshot();
  if (!diag) {
    notify('Ich habe keine Diagnosedaten gefunden.', 'info');
    return;
  }

  logInfo('Diagnostics snapshot read');
  notify('Ich habe die Diagnosedaten geprüft.', 'info');
}

async function handleReadBootstrapStatus(payload, _sb, notify) {
  logInfo('ReadBootstrapStatus requested');

  const bootstrap = readBootstrapLogSnapshot();
  if (!bootstrap) {
    notify('Es liegen keine Bootstrap-Informationen vor.', 'info');
    return;
  }

  logInfo('Bootstrap snapshot read');
  notify('Ich habe den Bootstrap-Status geprüft.', 'info');
}

// ---------------------------------------------------------------------------
// Generic Info Handler
// ---------------------------------------------------------------------------

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

function defaultSupabaseAccessor() {
  if (typeof window === 'undefined') return null;
  return window.AppModules && window.AppModules.supabase
    ? window.AppModules.supabase
    : null;
}

function defaultNotify(msg, level = 'info') {
  // Später kannst du das mit deinem echten UI-Toast verbinden.
  logInfo(`[assistant-notify][${level}] ${msg}`);
}

function defaultOnError(err) {
  logError('Action dispatch error', err);
}

// ---------------------------------------------------------------------------
// System Snapshot Helpers (Touchlog / Diagnostics / Bootstrap)
// ---------------------------------------------------------------------------

function readLatestTouchlogSnapshot() {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  try {
    const keys = Object.keys(window.localStorage)
      .filter((k) => k.startsWith('midas_touchlog'));

    if (keys.length === 0) return null;

    keys.sort(); // letzte Version = "höchster" Key
    const raw = window.localStorage.getItem(keys[keys.length - 1]);
    if (!raw) return null;

    return tryParseJson(raw);
  } catch (err) {
    logWarn('Failed to read touchlog from localStorage');
    return null;
  }
}

function readBootstrapLogSnapshot() {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  try {
    const keys = Object.keys(window.localStorage)
      .filter((k) => k.startsWith('midas_bootlog'));

    if (keys.length === 0) return null;

    keys.sort();
    const raw = window.localStorage.getItem(keys[keys.length - 1]);
    if (!raw) return null;

    return tryParseJson(raw);
  } catch (err) {
    logWarn('Failed to read bootstrap log from localStorage');
    return null;
  }
}

function readDiagnosticsSnapshot() {
  if (typeof window === 'undefined') return null;

  try {
    const appModules = window.AppModules || {};
    const diagnostics = appModules.diagnostics;

    if (diagnostics && typeof diagnostics.getSnapshot === 'function') {
      return diagnostics.getSnapshot();
    }

    // Fallback: global Diag-Objekt, falls vorhanden.
    if (window.__MIDAS_DIAG__) {
      return window.__MIDAS_DIAG__;
    }

    return null;
  } catch (err) {
    logWarn('Failed to read diagnostics snapshot');
    return null;
  }
}

function tryParseJson(raw) {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// Diagnostics logging helpers
// ---------------------------------------------------------------------------

const DEBUG_LOGS_ENABLED = (() => {
  try {
    if (typeof window === 'undefined') return false;
    return !!window.AppModules?.config?.DEV_ALLOW_DEFAULTS;
  } catch {
    return false;
  }
})();

function getDiagLogger() {
  if (typeof window === 'undefined') return null;
  const w = window;
  return w.AppModules?.diagnostics?.diag || w.diag || null;
}

function formatError(err) {
  if (!err) return '';
  if (err instanceof Error) {
    return `${err.message}${err.stack ? `\n${err.stack}` : ''}`;
  }
  if (typeof err === 'object') {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

function logWithLevel(level, message, err) {
  const suffix = err ? ` ${formatError(err)}` : '';
  const text = `[assistant-actions][${level}] ${message}${suffix}`;
  const diagLogger = getDiagLogger();
  diagLogger?.add?.(text);
  if (!DEBUG_LOGS_ENABLED) return;
  const consoleFn =
    level === 'error'
      ? console?.error?.bind(console)
      : level === 'warn'
        ? console?.warn?.bind(console)
        : console?.info?.bind(console);
  consoleFn?.(text, err);
}

function logInfo(message) {
  logWithLevel('info', message);
}

function logWarn(message) {
  logWithLevel('warn', message);
}

function logError(message, err) {
  logWithLevel('error', message, err);
}
