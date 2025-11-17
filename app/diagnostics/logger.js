'use strict';
/**
 * MODULE: diagnostics/logger.js
 * Description: Leichtgewichtiger Logger f�r das neue Diagnostics-Layer; sammelt Events, bevor die UI das neue Modul konsumiert.
 * Submodules:
 *  - buffer setup (Ringpuffer f�r Logs)
 *  - logEvent helper (normiert Nachrichten)
 *  - diagnosticsLayer export (AppModules.diagnosticsLayer.logger)
 */

(function (global) {
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;
  const config = appModules.config || {};
  const diagnosticsLayer = (appModules.diagnosticsLayer = appModules.diagnosticsLayer || {});
  const loggerEnabled = config.DIAGNOSTICS_ENABLED !== false;
  const MAX_BUFFER = 100;
  const buffer = [];

  const logEvent = (event, context) => {
    const ts = new Date().toISOString();
    const entry =
      typeof event === 'string'
        ? { message: event, ts, context: context || null }
        : { ...(event || {}), ts };
    buffer.unshift(entry);
    if (buffer.length > MAX_BUFFER) buffer.pop();
    return entry;
  };

  const loggerApi = {
    enabled: loggerEnabled,
    history: buffer,
    add(event, context) {
      const entry = logEvent(event, context);
      if (loggerEnabled) {
        console.debug('[diagnostics/logger]', entry.message || entry, entry.context || '');
      }
      return entry;
    },
    flush() {
      const entries = buffer.slice().reverse();
      buffer.length = 0;
      return entries;
    }
  };

  diagnosticsLayer.logger = loggerApi;

  if (!loggerEnabled) return;

  const bootstrap = () =>
    loggerApi.add('diagnostics/logger ready', { reason: 'bootstrap', level: 'info' });

  if (global.document?.readyState === 'complete') {
    bootstrap();
  } else {
    global.document?.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  }
})(typeof window !== 'undefined' ? window : globalThis);
