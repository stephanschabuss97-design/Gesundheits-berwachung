'use strict';

/**
 * SESSION AGENT — Core logic for the in-app MIDAS assistant.
 *
 * Responsibilities:
 *  - Manage a short-lived assistant session (one interaction, ggf. 1–2 Rückfragen).
 *  - Send user messages + optional context to a backend endpoint.
 *  - Receive assistant reply + optional actions from backend.
 *  - Forward actions to a configurable dispatcher (z. B. Supabase-Writes).
 *  - Keep NO persistent history beyond this JS object – caller entscheidet, wann wegwerfen.
 *
 * This module is UI-agnostic: no DOM, no event listeners, no rendering.
 */

const globalObject =
  typeof window !== 'undefined'
    ? window
    : typeof globalThis !== 'undefined'
    ? globalThis
    : undefined;

/**
 * @typedef {Object} AssistantMessage
 * @property {'user'|'assistant'|'system'} role
 * @property {string} content
 * @property {number} ts  // unix ms timestamp
 */

/**
 * @typedef {Object} AssistantState
 * @property {string} id
 * @property {'idle'|'thinking'|'error'|'ended'} status
 * @property {AssistantMessage[]} messages
 * @property {string|null} lastReply
 * @property {string|null} lastError
 * @property {'text'|'voice'} mode
 */

/**
 * @typedef {Object} AssistantAction
 * @property {string} type     // e.g. "add_intake_water", "log_bp"
 * @property {Object} [payload] // action-specific payload, defined in Actions-Spec
 */

/**
 * @typedef {Object} AssistantSessionOptions
 * @property {'text'|'voice'} [mode]               // how the session was triggered
 * @property {string} [apiUrl]                     // backend endpoint for the assistant
 * @property {(state: AssistantState) => void} [onUpdate] // called whenever state changes
 * @property {() => Promise<any>|any} [getContext] // optional: snapshot of current app context (intakes, vitals, etc.)
 * @property {(actions: AssistantAction[], state: AssistantState) => Promise<void>|void} [dispatchActions]
 * @property {() => boolean} [isVoiceReady]        // optional gate: returns true when voice UI may run
 * @property {{ onVoiceGateChange?: (fn: (status: {allowed:boolean, reason?:string}) => void) => () => void }} [voiceGateApi]
 */

/**
 * A short-lived assistant session.
 * One instance = one active interaction (Text oder Voice).
 */
export class AssistantSession {
  /**
   * @param {AssistantSessionOptions} options
   */
  constructor(options = {}) {
    const {
      mode = 'text',
      apiUrl = '/api/midas-assistant', // TODO: an deinen tatsächlichen Backend-Endpoint anpassen
      onUpdate = null,
      getContext = null,
      dispatchActions = null
    } = options;

    /** @type {AssistantState} */
    this.state = {
      id: generateSessionId(),
      status: 'idle',
      messages: [],
      lastReply: null,
      lastError: null,
      mode
    };

    this.apiUrl = apiUrl;
    this.onUpdate = typeof onUpdate === 'function' ? onUpdate : null;
    this.getContext = typeof getContext === 'function' ? getContext : null;
    this.dispatchActions = typeof dispatchActions === 'function' ? dispatchActions : null;
    this.voiceGateApi = resolveVoiceGateApi(options.voiceGateApi);
    this.isVoiceReadyFn =
      typeof options.isVoiceReady === 'function' ? options.isVoiceReady : deriveVoiceReadyFn(this.voiceGateApi);
    this.voiceGateUnsub = null;
    this.voiceLockMessage = 'Voice deaktiviert – bitte warten';

    this._isSending = false;
    this._isEnded = false;

    if (this.state.mode === 'voice') {
      this._bindVoiceGate();
    }

    this._emit();
  }

  /**
   * Returns a read-only snapshot of current session state.
   * @returns {AssistantState}
   */
  getState() {
    // shallow clone to avoid externals mutating internals
    return {
      ...this.state,
      messages: [...this.state.messages]
    };
  }

  /**
   * Send a user message into this session.
   * Will:
   *  - append message to state
   *  - call backend
   *  - append assistant reply
   *  - optionally dispatch actions
   *
   * @param {string} text
   * @returns {Promise<void>}
   */
  async sendUserMessage(text) {
    if (this._isEnded) {
      console.warn('[MIDAS Assistant] sendUserMessage called on ended session – ignoring.');
      return;
    }
    if (this.state.mode === 'voice' && !this._isVoiceReady()) {
      this._handleVoiceGateLock();
      return;
    }

    const trimmed = (text || '').trim();
    if (!trimmed) return;

    if (this._isSending) {
      console.warn('[MIDAS Assistant] sendUserMessage while request pending – ignoring.');
      return;
    }

    // 1) append user message
    this.state.messages.push({
      role: 'user',
      content: trimmed,
      ts: Date.now()
    });

    this.state.status = 'thinking';
    this.state.lastError = null;
    this._emit();

    this._isSending = true;

    try {
      // 2) optional context (e.g. today’s intake, last BP, etc.)
      let context = null;
      if (this.getContext) {
        try {
          context = await this.getContext();
        } catch (ctxErr) {
          console.warn('[MIDAS Assistant] getContext failed:', ctxErr);
          context = null;
        }
      }

      // 3) build payload for backend
      const payload = {
        session_id: this.state.id,
        mode: this.state.mode,
        messages: this.state.messages.map(({ role, content }) => ({ role, content })),
        context // can be null; backend decides how to use it
      };

      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // KEIN API-Key hier! Backend ist der Proxy zum OpenAI-Service.
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const textErr = await safeReadText(res);
        throw new Error(`Assistant API error (${res.status}): ${textErr || res.statusText}`);
      }

      /** @type {{ reply: string, actions?: AssistantAction[], meta?: any }} */
      const data = await res.json();

      const replyText = (data && typeof data.reply === 'string')
        ? data.reply.trim()
        : '';

      if (replyText) {
        this.state.messages.push({
          role: 'assistant',
          content: replyText,
          ts: Date.now()
        });
        this.state.lastReply = replyText;
      }

      this.state.status = 'idle';
      this._emit();

      // 4) optional actions (e.g. add_intake_water, log_blood_pressure)
      if (Array.isArray(data.actions) && data.actions.length && this.dispatchActions) {
        try {
          await this.dispatchActions(data.actions, this.getState());
        } catch (actionErr) {
          console.error('[MIDAS Assistant] dispatchActions failed:', actionErr);
          this.state.status = 'error';
          this.state.lastError = 'Interne Aktion konnte nicht ausgeführt werden.';
          this._emit();
        }
      }
    } catch (err) {
      console.error('[MIDAS Assistant] sendUserMessage failed:', err);
      this.state.status = 'error';
      this.state.lastError = err && err.message
        ? err.message
        : 'Unbekannter Fehler im Assistant.';
      this._emit();
    } finally {
      this._isSending = false;
    }
  }

  /**
   * Mark the session as ended.
   * This does NOT call the backend – it’s purely local.
   * Caller can drop the reference afterwards, und GC erledigt den Rest.
   */
  end() {
    this._isEnded = true;
    this.state.status = 'ended';
    this._emit();
    this._cleanupVoiceGate();
  }

  /**
   * Internal helper to notify listeners about state changes.
   * (one-way data flow – UI subscribed über onUpdate)
   * @private
   */
  _emit() {
    if (this.onUpdate) {
      try {
        this.onUpdate(this.getState());
      } catch (err) {
        console.error('[MIDAS Assistant] onUpdate handler failed:', err);
      }
    }
  }

  _isVoiceReady() {
    if (this.state.mode !== 'voice') return true;
    try {
      if (typeof this.isVoiceReadyFn === 'function') {
        return !!this.isVoiceReadyFn();
      }
    } catch (err) {
      console.warn('[MIDAS Assistant] voiceReady check failed', err);
    }
    return true;
  }

  _bindVoiceGate() {
    if (this.state.mode !== 'voice') return;
    if (!this._isVoiceReady()) {
      this._handleVoiceGateLock();
    }
    const api = this.voiceGateApi;
    if (api && typeof api.onVoiceGateChange === 'function') {
      try {
        this.voiceGateUnsub = api.onVoiceGateChange((status) => {
          if (!status?.allowed) {
            this._handleVoiceGateLock(status?.reason);
          }
        });
      } catch (err) {
        console.warn('[MIDAS Assistant] voice gate subscription failed', err);
      }
    }
  }

  _cleanupVoiceGate() {
    if (typeof this.voiceGateUnsub === 'function') {
      try {
        this.voiceGateUnsub();
      } catch (_) {
        /* ignore */
      }
      this.voiceGateUnsub = null;
    }
  }

  _handleVoiceGateLock(reason = '') {
    if (this._isEnded) return;
    this.state.status = 'error';
    this.state.lastError = this.voiceLockMessage;
    this.state.messages.push({
      role: 'system',
      content: this.voiceLockMessage + (reason ? ` (${reason})` : ''),
      ts: Date.now()
    });
    this._emit();
    this._cleanupVoiceGate();
    this._isEnded = true;
  }
}

/**
 * Factory helper – nice for external callers.
 * @param {AssistantSessionOptions} options
 * @returns {AssistantSession}
 */
export function createAssistantSession(options = {}) {
  return new AssistantSession(options);
}

/**
 * Generates a simple session id (not security-critical, nur für Korrelation).
 * @returns {string}
 */
function generateSessionId() {
  const rand = Math.random().toString(16).slice(2);
  const ts = Date.now().toString(16);
  return `midas-session-${ts}-${rand}`;
}

/**
 * Safely tries to read response text. Falls back to empty string.
 * @param {Response} res
 * @returns {Promise<string>}
 */
async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function resolveVoiceGateApi(explicitApi) {
  if (explicitApi) return explicitApi;
  return globalObject?.AppModules?.hub || null;
}

function deriveVoiceReadyFn(api) {
  if (!api) {
    return () => true;
  }
  if (typeof api.isVoiceReady === 'function') {
    return () => {
      try {
        return !!api.isVoiceReady();
      } catch {
        return true;
      }
    };
  }
  if (typeof api.getVoiceGateStatus === 'function') {
    return () => {
      try {
        return !!api.getVoiceGateStatus()?.allowed;
      } catch {
        return true;
      }
    };
  }
  return () => true;
}
