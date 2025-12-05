'use strict';

/**
 * assistantSuggestStore
 * Verwaltet Kontext-Snapshots (Intake/Termine/Profil) und Suggestion-Queue
 * für den Butler-Layer.
 */

const DEFAULT_EVENT_TARGET =
  typeof window !== 'undefined' ? window : { dispatchEvent() {}, addEventListener() {} };

const createStore = () => {
  let currentSnapshot = null;
  let suggestionQueue = [];
  let activeSuggestion = null;

  const dispatch = (type, detail) => {
    DEFAULT_EVENT_TARGET.dispatchEvent(
      new CustomEvent(type, {
        bubbles: false,
        cancelable: false,
        detail,
      }),
    );
  };

  const getSnapshot = () => (currentSnapshot ? { ...currentSnapshot } : null);

  const setSnapshot = (snapshot, { reason = 'unknown' } = {}) => {
    if (!snapshot || typeof snapshot !== 'object') return;
    currentSnapshot = {
      ...snapshot,
      updatedAt: snapshot.updatedAt || Date.now(),
    };
    dispatch('assistant:snapshot-updated', { snapshot: getSnapshot(), reason });
  };

  const buildSuggestion = (payload = {}) => {
    const id = payload.id || `suggest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return {
      id,
      title: payload.title || 'Vorschlag',
      body: payload.body || '',
      metrics: payload.metrics || {},
      recommendation: payload.recommendation || null,
      actions: payload.actions || [],
      confidence: payload.confidence ?? null,
      source: payload.source || 'analysis',
      createdAt: Date.now(),
      contextSnapshot: payload.contextSnapshot || getSnapshot(),
      meta: payload.meta || {},
    };
  };

  const setActiveSuggestion = (suggestion, { reason = 'update' } = {}) => {
    activeSuggestion = suggestion;
    dispatch('assistant:suggest-updated', {
      suggestion: suggestion ? { ...suggestion } : null,
      queueLength: suggestionQueue.length,
      reason,
    });
  };

  const queueSuggestion = (payload, { reason = 'enqueue' } = {}) => {
    if (!payload) return null;
    const suggestion = buildSuggestion(payload);
    suggestionQueue.push(suggestion);
    if (!activeSuggestion) {
      setActiveSuggestion(suggestion, { reason });
    } else {
      dispatch('assistant:suggest-queued', {
        suggestion: { ...suggestion },
        queueLength: suggestionQueue.length,
      });
    }
    return suggestion;
  };

  const dequeueNext = ({ reason = 'advance' } = {}) => {
    if (!suggestionQueue.length) {
      setActiveSuggestion(null, { reason });
      return null;
    }
    const [next, ...rest] = suggestionQueue;
    suggestionQueue = rest;
    setActiveSuggestion(next, { reason });
    return next;
  };

  const clearSuggestions = ({ reason = 'clear' } = {}) => {
    suggestionQueue = [];
    setActiveSuggestion(null, { reason });
  };

  const dismissCurrent = ({ reason = 'dismiss' } = {}) => {
    if (!activeSuggestion) return;
    const dismissed = activeSuggestion;
    dequeueNext({ reason });
    dispatch('assistant:suggest-dismissed', { suggestion: dismissed, reason });
  };

  const getState = () => ({
    snapshot: getSnapshot(),
    activeSuggestion: activeSuggestion ? { ...activeSuggestion } : null,
    queueLength: suggestionQueue.length,
  });

  return {
    getState,
    getSnapshot,
    setSnapshot,
    queueSuggestion,
    dismissCurrent,
    advance: dequeueNext,
    clear: clearSuggestions,
    getActiveSuggestion: () => (activeSuggestion ? { ...activeSuggestion } : null),
  };
};

export const assistantSuggestStore = createStore();

if (typeof window !== 'undefined') {
  window.AppModules = window.AppModules || {};
  window.AppModules.assistantSuggestStore = assistantSuggestStore;
}

export default assistantSuggestStore;
