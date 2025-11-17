'use strict';
/**
 * MODULE: assistant/index.js
 * Description: Placeholder für das zukünftige KI-Modul (Zeus). Regelt später Routing, Prompt-Handling, Supabase Hooks.
 * Notes:
 *  - Phase 4 Readiness: nur Struktur + Flags, keine Implementierung.
 *  - Hookt später an Supabase Functions / OpenAI API.
 */

(function (global) {
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;

  const assistantApi = {
    init() {
      console.info('[assistant] readiness placeholder initialized');
    }
  };

  appModules.assistant = assistantApi;
})(typeof window !== 'undefined' ? window : globalThis);
