'use strict';

import { assistantSuggestStore } from './suggest-store.js';

(function attachAssistantSuggestUi(global, store) {
  if (typeof document === 'undefined') return;
  const doc = document;
  const resolvedStore =
    store ||
    global.AppModules?.assistantSuggestStore ||
    global.assistantSuggestStore ||
    null;
  if (!resolvedStore) return;

  const chatContainer = doc.getElementById('assistantChat');
  if (!chatContainer) return;

  const legacyCard = doc.getElementById('assistantSuggestCard');
  if (legacyCard) {
    legacyCard.hidden = true;
    legacyCard.setAttribute('aria-hidden', 'true');
  }

  const escapeSelector = (value = '') => {
    if (global.CSS?.escape) return global.CSS.escape(value);
    return String(value).replace(/"/g, '\"');
  };

  let currentBlock = null;
  let currentSuggestionId = null;
  let currentButtons = { yes: null, no: null };

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
    return parts.join(' • ');
  };

  const removeBlock = () => {
    if (currentBlock?.parentElement) {
      currentBlock.parentElement.removeChild(currentBlock);
    }
    currentBlock = null;
    currentSuggestionId = null;
    currentButtons = { yes: null, no: null };
  };

  const setBusyState = (isBusy) => {
    if (!currentBlock) return;
    currentBlock.classList.toggle('is-busy', !!isBusy);
    if (currentButtons.yes) {
      currentButtons.yes.disabled = !!isBusy;
    }
    if (currentButtons.no) {
      currentButtons.no.disabled = !!isBusy;
    }
  };

  const findBubbleForSuggestion = (suggestion) => {
    const messageId =
      suggestion?.messageId ||
      suggestion?.meta?.messageId ||
      null;
    if (!messageId) return null;
    return doc.querySelector(
      `[data-assistant-message-id="${escapeSelector(messageId)}"]`,
    );
  };

  const renderSuggestion = () => {
    removeBlock();
    const state = resolvedStore.getState();
    const suggestion = state.activeSuggestion;
    if (!suggestion) {
      return;
    }
    attachInlineConfirm(suggestion);
  };

  const attachInlineConfirm = (suggestion) => {
    const targetBubble = findBubbleForSuggestion(suggestion) || chatContainer;
    if (!targetBubble) return;

    const block = doc.createElement('div');
    block.className = 'assistant-confirm-block';
    block.dataset.suggestionId = suggestion.id;

    const text = doc.createElement('p');
    text.className = 'assistant-confirm-text';
    const metricsText = formatMetrics(suggestion.metrics);
    const recText = suggestion.recommendation || suggestion.body || '';
    const lines = [];
    if (metricsText) lines.push(metricsText);
    if (recText) lines.push(recText);
    text.textContent = lines.join(' • ') || 'Analyse verfügbar.';

    const actions = doc.createElement('div');
    actions.className = 'assistant-confirm-actions';
    const noBtn = doc.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'btn ghost';
    noBtn.textContent = 'Nein';
    const yesBtn = doc.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'btn primary';
    yesBtn.textContent = 'Ja, speichern';

    actions.appendChild(noBtn);
    actions.appendChild(yesBtn);
    block.appendChild(text);
    block.appendChild(actions);

    noBtn.addEventListener('click', () => handleAnswer(false));
    yesBtn.addEventListener('click', () => handleAnswer(true));

    currentBlock = block;
    currentSuggestionId = suggestion.id;
    currentButtons = { yes: yesBtn, no: noBtn };

    targetBubble.appendChild(block);
    targetBubble.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  const handleAnswer = (accepted) => {
    const state = resolvedStore.getState();
    const suggestion = state.activeSuggestion;
    if (!suggestion || suggestion.id !== currentSuggestionId) return;
    if (accepted) {
      setBusyState(true);
      global.dispatchEvent(
        new CustomEvent('assistant:suggest-confirm', {
          detail: { suggestion },
        }),
      );
      return;
    }
    global.dispatchEvent(
      new CustomEvent('assistant:suggest-answer', {
        detail: {
          accepted: false,
          suggestion,
        },
      }),
    );
    resolvedStore.dismissCurrent({ reason: 'user-dismiss' });
  };

  global.addEventListener('assistant:suggest-updated', renderSuggestion);
  renderSuggestion();
})(typeof window !== 'undefined' ? window : globalThis, assistantSuggestStore);