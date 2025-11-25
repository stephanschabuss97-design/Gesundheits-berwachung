'use strict';

/**
 * MODULE: app/modules/assistant/index.js
 * Entry point for the MIDAS in-app assistant module.
 *
 * Exposes a small factory to create session-based assistant instances.
 * UI, Voice, Supabase-Kontext & Actions werden von außen injiziert.
 */

import { createAssistantSession } from './session-agent.js';
import { dispatchAssistantActions } from './actions.js';

/**
 * Public factory für den Rest der App.
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
          // TODO: hier deine UI-Benachrichtigung anschließen (Toast, Snackbar, etc.)
          console.log(`[Assistant UI][${level || 'info'}] ${msg}`);
        },
        onError: (err) => {
          console.error('[MIDAS Assistant] Action error:', err);
          // Optional: hier könntest du einen Fehler-Toast triggern
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
