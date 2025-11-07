'use strict';
/**
 * MODULE: supabase/realtime/index.js
 * intent: Delegations-Wrapper für Realtime-Setup, Teardown und Background-Resume
 * exports: setupRealtime, teardownRealtime, resumeFromBackground, toEventsUrl
 * version: 1.8.2
 * compat: Browser / PWA / TWA
 * notes:
 *   - Leitet Realtime-Funktionen an globale Implementierungen (window.setupRealtime etc.) weiter
 *   - Erlaubt modulare Überschreibung ohne Import-Zirkularität
 *   - Nutzt fallback-safe defaults (no-op) für nicht initialisierte Realtime-Umgebungen
 * author: System Integration Layer (M.I.D.A.S. v1.8)
 */

// SUBMODULE: globals @internal - globale Referenz und Fallback-Implementierungen
const globalWindow = typeof window !== 'undefined' ? window : undefined;

const defaultSetupRealtime = async () => undefined;
const defaultTeardownRealtime = () => undefined;
const defaultResumeFromBackground = async () => undefined;

// SUBMODULE: captured handlers @internal - referenzierte oder fallbackende Realtime-Funktionen
const capturedSetup =
  typeof globalWindow?.setupRealtime === 'function'
    ? globalWindow.setupRealtime
    : defaultSetupRealtime;

const capturedTeardown =
  typeof globalWindow?.teardownRealtime === 'function'
    ? globalWindow.teardownRealtime
    : defaultTeardownRealtime;

const capturedResume =
  typeof globalWindow?.resumeFromBackground === 'function'
    ? globalWindow.resumeFromBackground
    : defaultResumeFromBackground;

// SUBMODULE: exported wrappers @public - API-kompatible Wrapper-Funktionen
export async function setupRealtime(...args) {
  return capturedSetup(...args);
}

export function teardownRealtime(...args) {
  return capturedTeardown(...args);
}

export async function resumeFromBackground(...args) {
  return capturedResume(...args);
}

// SUBMODULE: utils @public - Hilfsfunktion zur Konvertierung der REST-URL in Event-Endpunkte
export function toEventsUrl(restUrl) {
  try {
    const url = String(restUrl || '').trim();
    if (!url) return null;
    return url.replace(/(\/rest\/v1\/)[^/?#]+/i, '$1health_events');
  } catch (_) {
    return null;
  }
}
