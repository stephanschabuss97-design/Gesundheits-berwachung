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

const assistantUiHelpers = createAssistantUiHelpers();

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
  const assistantNamespace = window.AppModules.assistant || {};
  assistantNamespace.createSession = createMidasAssistantSession;
  assistantNamespace.ui = assistantUiHelpers;
  window.AppModules.assistant = assistantNamespace;
  window.AppModules.assistantUi = assistantUiHelpers;
}

export { assistantUiHelpers as assistantUi };

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

function createAssistantUiHelpers() {
  const DEFAULT_PHOTO_RESULT_TEXT = 'Noch kein Ergebnis.';
  const DEFAULT_SUMMARY_TEXT = 'Analyse abgeschlossen.';

  function createPhotoMessageModel({ imageData, fileName }) {
    return {
      type: 'photo',
      status: 'processing',
      resultText: DEFAULT_PHOTO_RESULT_TEXT,
      imageData: imageData || '',
      meta: fileName ? { fileName } : {},
      retryPayload: {
        base64: imageData || '',
        fileName: fileName || ''
      },
      retryable: false
    };
  }

  function formatVisionResultText(result, options = {}) {
    const { includeReply = true } = options;
    if (!result) return DEFAULT_SUMMARY_TEXT;
    const analysis = result.analysis || {};
    const metrics = [];
    const pushMetric = (label, value, suffix, digits = 1) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return;
      metrics.push(`${label}: ${num.toFixed(digits)} ${suffix}`);
    };
    pushMetric('Wasser', analysis.water_ml, 'ml', 0);
    pushMetric('Salz', analysis.salt_g, 'g');
    pushMetric('Protein', analysis.protein_g, 'g');

    const reply = (result.reply || '').trim();
    const base = metrics.length ? metrics.join(' • ') : DEFAULT_SUMMARY_TEXT;
    if (includeReply && reply) {
      return metrics.length ? `${base} • ${reply}` : reply;
    }
    return base;
  }

  const parseMetricValue = (value) => {
    if (value == null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.replace(',', '.');
      const match = normalized.match(/-?\d+(?:\.\d+)?/);
      if (match) {
        const parsed = Number(match[0]);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return null;
  };

  function buildVisionSuggestPayload(result) {
    if (!result) return null;
    const analysis = result.analysis || {};
    const metrics = {
      water_ml: parseMetricValue(analysis.water_ml),
      salt_g: parseMetricValue(analysis.salt_g),
      protein_g: parseMetricValue(analysis.protein_g)
    };
    const hasMetrics = Object.values(metrics).some((value) =>
      Number.isFinite(value),
    );
    if (!hasMetrics && !result.reply) return null;
    return {
      title: 'Analyse verfügbar',
      body: formatVisionResultText(result),
      metrics,
      recommendation: (result.reply || '').trim() || null
    };
  }

  return {
    createPhotoMessageModel,
    formatVisionResultText,
    buildVisionSuggestPayload
  };
}

