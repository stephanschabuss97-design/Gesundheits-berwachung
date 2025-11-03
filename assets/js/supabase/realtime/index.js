/** MODULE: supabase/realtime/index.js — extracted from supabase.js @v1.8.1 */

const globalWindow = typeof window !== 'undefined' ? window : undefined;

const defaultSetupRealtime = async () => undefined;
const defaultTeardownRealtime = () => undefined;
const defaultResumeFromBackground = async () => undefined;

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

export async function setupRealtime(...args) {
  return capturedSetup(...args);
}

export function teardownRealtime(...args) {
  return capturedTeardown(...args);
}

export async function resumeFromBackground(...args) {
  return capturedResume(...args);
}

export function toEventsUrl(restUrl) {
  try {
    const url = String(restUrl || '').trim();
    if (!url) return null;
    return url.replace(/(\/rest\/v1\/)[^/?#]+/i, '$1health_events');
  } catch (_) {
    return restUrl;
  }
}

