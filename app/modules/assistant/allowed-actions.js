'use strict';

/**
 * MODULE: assistant/allowed-actions.js
 * Zentraler Helper für KI-Actions (Whitelist + Guard Rails + Touchlog).
 */

const getDiag = () =>
  typeof window !== 'undefined' ? window.AppModules?.diagnostics?.diag || window.diag : null;
const getTouchLogger = () =>
  typeof window !== 'undefined' ? window.AppModules?.touchlog || null : null;
const getSupabaseApiDefault = () =>
  typeof window !== 'undefined' ? window.AppModules?.supabase || null : null;
const getBootFlow = () =>
  typeof window !== 'undefined' ? window.AppModules?.bootFlow || null : null;
const getSupabaseState = () =>
  typeof window !== 'undefined' ? window.AppModules?.supabase?.supabaseState || null : null;
const getDispatchAssistantActions = () =>
  typeof window !== 'undefined'
    ? window.AppModules?.assistantActions?.dispatchAssistantActions || null
    : null;

const DEFAULT_OPTIONS = {
  getSupabaseApi: getSupabaseApiDefault,
  diag: getDiag,
  touchLogger: getTouchLogger,
  notify: (msg, level = 'info') => {
    const diag = getDiag();
    diag?.add?.(`[assistant-allowed][${level}] ${msg}`);
  },
};

const WHITELIST = new Set([
  'intake_save',
  'open_module',
  'show_status',
  'highlight',
  'ask_confirmation',
  'close_conversation',
  'transition_to_photo_mode',
  'transition_to_text_chat',
  'suggest_intake',
  'confirm_intake',
]);

export async function executeAllowedAction(type, payload = {}, options = {}) {
  const mergedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const diag = mergedOptions.diag?.();
  const source = options.source || mergedOptions.source || 'unknown';
  if (!WHITELIST.has(type)) {
    diag?.add?.(`[assistant-allowed] blocked unknown action ${type}`);
    logTouch('blocked', type, 'unknown-action', mergedOptions, source);
    return false;
  }
  if (!isStageReady()) {
    diag?.add?.(`[assistant-allowed] blocked stage not ready action=${type}`);
    logTouch('blocked', type, 'stage-not-ready', mergedOptions, source);
    return false;
  }
  if (!isAuthReady()) {
    diag?.add?.(`[assistant-allowed] blocked auth unknown action=${type}`);
    logTouch('blocked', type, 'auth-unknown', mergedOptions, source);
    return false;
  }
  const supabaseApi = mergedOptions.getSupabaseApi?.();
  if (!supabaseApi) {
    diag?.add?.('[assistant-allowed] Supabase API missing');
    logTouch('blocked', type, 'supabase-missing', mergedOptions, source);
    return false;
  }
  logTouch('start', type, null, mergedOptions, source);
  try {
    const dispatcher = getDispatchAssistantActions();
    if (typeof dispatcher !== 'function') {
      diag?.add?.('[assistant-allowed] dispatcher missing');
      logTouch('error', type, 'dispatcher-missing', mergedOptions, source);
      return false;
    }
    await dispatcher([{ type, payload }], {
      getSupabaseApi: () => supabaseApi,
      notify: mergedOptions.notify,
      onError: (err) => diag?.add?.(`[assistant-allowed] dispatch error ${err?.message || err}`),
    });
    logTouch('success', type, null, mergedOptions, source);
    return true;
  } catch (err) {
    diag?.add?.(`[assistant-allowed] failed action=${type} err=${err?.message || err}`);
    logTouch('error', type, err?.message || 'unknown', mergedOptions, source);
    return false;
  }
}

const isStageReady = () => {
  if (typeof document === 'undefined') return true;
  const bootFlow = getBootFlow();
  if (bootFlow?.isStageAtLeast) {
    return bootFlow.isStageAtLeast('INIT_UI');
  }
  const stage = (document.body?.dataset?.bootStage || '').toUpperCase();
  return stage === 'INIT_UI' || stage === 'IDLE';
};

const isAuthReady = () => {
  const authState = getSupabaseState()?.authState;
  if (!authState) return true;
  return authState !== 'unknown';
};

const logTouch = (status, action, info, options, source = 'unknown') => {
  if (typeof document === 'undefined') return;
  const detail = `[assistant-allowed] ${status} action=${action} source=${source}${
    info ? ` info=${info}` : ''
  }`;
  const diag = options.diag?.();
  const touch = options.touchLogger?.();
  diag?.add?.(detail);
  touch?.add?.(detail);
};

if (typeof window !== 'undefined') {
  window.AppModules = window.AppModules || {};
  window.AppModules.assistantAllowedActions = {
    executeAllowedAction,
  };
}

export default executeAllowedAction;
