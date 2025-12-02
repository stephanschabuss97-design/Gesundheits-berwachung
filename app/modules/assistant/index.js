'use strict';

/**
 * MODULE: app/modules/assistant/index.js
 * Entry point for the MIDAS in-app assistant module.
 *
 * Exposes a small factory to create session-based assistant instances.
 * UI, Voice, Supabase-Kontext & Actions werden von aussen injiziert.
 */

import { createAssistantSession } from './session-agent.js';
import { dispatchAssistantActions } from './actions.js';

/**
 * Public factory fuer den Rest der App.
 *
 * @param {import('./session-agent.js').AssistantSessionOptions} options
 * @returns {import('./session-agent.js').AssistantSession}
 */
export function createMidasAssistantSession(options = {}) {
  const session = createAssistantSession({
    ...options,
    dispatchActions: async (actions, state) => {
      await dispatchAssistantActions(actions, {
        getSupabaseApi: () => window.AppModules?.supabase,
        notify: (msg, level) => {
          // TODO: hier deine UI-Benachrichtigung anschliessen (Toast, Snackbar, etc.)
          logAssistantInfo(`[assistant-ui][${level || 'info'}] ${msg}`);
        },
        onError: (err) => {
          logAssistantError('Action error', err);
          // Optional: hier kannst du einen Fehler-Toast triggern
        }
      });
    }
  });

  return session;
}

// Optional: Expose via AppModules for global/legacy access.
if (typeof window !== 'undefined') {
  window.AppModules = window.AppModules || {};
  window.AppModules.assistant = {
    createSession: createMidasAssistantSession
  };
}

const DEBUG_LOGS_ENABLED = (() => {
  if (typeof window === 'undefined') return false;
  try {
    return !!window.AppModules?.config?.DEV_ALLOW_DEFAULTS;
  } catch {
    return false;
  }
})();

function getDiagLogger() {
  if (typeof window === 'undefined') return null;
  return window.AppModules?.diagnostics?.diag || window.diag || null;
}

function logAssistantInfo(message) {
  const text = `[assistant] ${message}`;
  getDiagLogger()?.add?.(text);
  if (DEBUG_LOGS_ENABLED) {
    console.info(text);
  }
}

function logAssistantError(message, err) {
  const diagMessage = `[assistant] ${message}${err ? ` ${formatError(err)}` : ''}`;
  getDiagLogger()?.add?.(diagMessage);
  if (DEBUG_LOGS_ENABLED) {
    console.error(diagMessage, err);
  }
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
