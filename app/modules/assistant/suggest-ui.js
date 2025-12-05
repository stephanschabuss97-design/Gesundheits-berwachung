'use strict';

(function attachAssistantSuggestUi(global) {
  if (typeof document === 'undefined') return;
  const doc = document;
  const store =
    global.AppModules?.assistantSuggestStore ||
    global.assistantSuggestStore ||
    null;
  if (!store) return;

  const card = doc.getElementById('assistantSuggestCard');
  if (!card) return;

  const titleEl = doc.getElementById('assistantSuggestTitle');
  const bodyEl = doc.getElementById('assistantSuggestBody');
  const yesBtn = doc.getElementById('assistantSuggestYesBtn');
  const noBtn = doc.getElementById('assistantSuggestNoBtn');
  const dismissBtn = doc.getElementById('assistantSuggestDismiss');

  const setVisibility = (visible) => {
    card.hidden = !visible;
    card.setAttribute('aria-hidden', String(!visible));
  };

  const formatMetrics = (metrics = {}) => {
    const parts = [];
    if (Number.isFinite(metrics.water_ml)) {
      parts.push(`Wasser ${metrics.water_ml.toFixed(0)} ml`);
    }
    if (Number.isFinite(metrics.salt_g)) {
      parts.push(`Salz ${metrics.salt_g.toFixed(1)} g`);
    }
    if (Number.isFinite(metrics.protein_g)) {
      parts.push(`Protein ${metrics.protein_g.toFixed(1)} g`);
    }
    return parts.join(' · ');
  };

  const renderSuggestion = () => {
    const state = store.getState();
    const suggestion = state.activeSuggestion;
    if (!suggestion) {
      setVisibility(false);
      return;
    }
    setVisibility(true);
    if (titleEl) {
      titleEl.textContent = suggestion.title || 'Vorschlag';
    }
    if (bodyEl) {
      const metricsText = formatMetrics(suggestion.metrics);
      const recText = suggestion.recommendation || suggestion.body || '';
      const lines = [];
      if (metricsText) lines.push(metricsText);
      if (recText) lines.push(recText);
      bodyEl.textContent = lines.join(' · ');
    }
  };

  const handleAnswer = (accepted) => {
    const suggestion = store.getState().activeSuggestion;
    if (!suggestion) return;
    global.dispatchEvent(
      new CustomEvent('assistant:suggest-answer', {
        detail: {
          accepted,
          suggestion,
        },
      }),
    );
    if (!accepted) {
      store.dismissCurrent({ reason: 'user-dismiss' });
    }
  };

  noBtn?.addEventListener('click', () => handleAnswer(false));
  dismissBtn?.addEventListener('click', () => handleAnswer(false));

  yesBtn?.addEventListener('click', () => {
    const suggestion = store.getState().activeSuggestion;
    if (!suggestion) return;
    global.dispatchEvent(
      new CustomEvent('assistant:suggest-confirm', {
        detail: { suggestion },
      }),
    );
  });

  global.addEventListener('assistant:suggest-updated', renderSuggestion);
  renderSuggestion();
})(typeof window !== 'undefined' ? window : globalThis);
