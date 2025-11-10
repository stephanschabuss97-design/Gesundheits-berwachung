'use strict';
/**
 * MODULE: supabase/auth/ui.js
 * Description: Steuert Authentifizierungs-UI (Login-Overlay, Config-Formular, Google-OAuth) und verwaltet gespeicherte REST-/Key-Konfiguration.
 * Submodules:
 *  - imports (Core-State, Client, Auth-Core)
 *  - globals (Window-Handle & Diagnostics)
 *  - config accessors (Wrapper für getConf / putConf)
 *  - restErrorMessage (Fallback für REST-Fehlermeldungen)
 *  - uiCore (Focus-Trap-Integration)
 *  - prefillSupabaseConfigForm (Initialwert-Handling für REST/Key-Felder)
 *  - setConfigStatus (UI-Statusanzeige)
 *  - toggleLoginOverlay (Overlay-Steuerung)
 *  - show/hide overlay (öffentliche Steuerfunktionen)
 *  - setUserUi (Anzeige angemeldeter Benutzer)
 *  - bindAuthButtons (Button-Bindings für Config & Google-OAuth)
 */

// SUBMODULE: imports @internal - Supabase Core-State & Auth-Helpers
import { supabaseState } from '../core/state.js';
import { ensureSupabaseClient, isServiceRoleKey } from '../core/client.js';
import { requireSession } from './core.js';

// SUBMODULE: globals @internal - globale Handles & Diagnose-Hooks
const globalWindow = typeof window !== 'undefined' ? window : undefined;
const diag =
  (globalWindow?.diag ||
    globalWindow?.AppModules?.diag ||
    globalWindow?.AppModules?.diagnostics ||
    { add() {} });

// SUBMODULE: config accessors @internal - sichere Wrapper für getConf / putConf
const getConf = (...args) => {
  const fn = globalWindow?.getConf;
  if (typeof fn !== 'function') return Promise.resolve(null);
  try {
    return Promise.resolve(fn(...args));
  } catch (err) {
    return Promise.reject(err);
  }
};

const putConf = (...args) => {
  const fn = globalWindow?.putConf;
  if (typeof fn !== 'function') return Promise.resolve(null);
  try {
    return Promise.resolve(fn(...args));
  } catch (err) {
    return Promise.reject(err);
  }
};

// SUBMODULE: restErrorMessage @internal - generiert REST-Fehlermeldung oder nutzt globalen Fallback
const restErrorMessage = (...args) => {
  const fn = globalWindow?.restErrorMessage;
  if (typeof fn === 'function') {
    return fn(...args);
  }
  const [status, details] = args;
  return `REST-Fehler (${status || '?'}): ${details || ''}`.trim();
};

// SUBMODULE: uiCore @internal - Zugriff auf Fokussteuerung (Focus Trap)
const getUiCore = () => (globalWindow?.AppModules && globalWindow.AppModules.uiCore) || {};

const activateFocusTrap = (root) => {
  const trap = getUiCore().focusTrap;
  if (trap && typeof trap.activate === 'function') {
    trap.activate(root);
  }
};

const deactivateFocusTrap = () => {
  const trap = getUiCore().focusTrap;
  if (trap && typeof trap.deactivate === 'function') {
    trap.deactivate();
  }
};

// SUBMODULE: prefillSupabaseConfigForm @public - liest gespeicherte REST/Key-Werte ein und befüllt das Formular
export async function prefillSupabaseConfigForm() {
  try {
    setConfigStatus('', 'info');
    const restInput = document.getElementById('configRestUrl');
    const keyInput = document.getElementById('configAnonKey');
    const adv = document.getElementById('configAdv');
    const rest = await getConf('webhookUrl');
    const keyStored = await getConf('webhookKey');
    const restStored = rest && String(rest).trim() ? String(rest).trim() : '';
    const keyClean =
      keyStored && String(keyStored).trim()
        ? String(keyStored).replace(/^Bearer\s+/i, '').trim()
        : '';
    if (restInput) {
      const hasUserText = !!(restInput.value && restInput.value.trim());
      if (!hasUserText && restStored) {
        restInput.value = restStored;
      }
    }
    if (keyInput) {
      const hasUserText = !!(keyInput.value && keyInput.value.trim());
      if (!hasUserText && keyClean) {
        keyInput.value = keyClean;
      }
    }
    if (adv) {
      const hasRest = !!restStored;
      const hasKey = !!keyClean;
      adv.open = !(hasRest && hasKey);
    }
  } catch (_) {
    /* ignore prefill errors */
  }
}

// SUBMODULE: setConfigStatus @public - zeigt Statusnachrichten in der UI an
export function setConfigStatus(msg, tone = 'info') {
  const el = document.getElementById('configStatus');
  if (!el) return;
  el.textContent = msg || '';
  const colors = { error: '#f87171', success: '#34d399', info: '#9aa3af' };
  el.style.color = colors[tone] || colors.info;
}

// SUBMODULE: toggleLoginOverlay @internal - zeigt/versteckt das Login-Overlay
const toggleLoginOverlay = (show) => {
  const ov = document.getElementById('loginOverlay');
  if (!ov) return;
  const dialog = ov.querySelector('[role="dialog"]') || ov;
  if (show) {
    const alreadyVisible = ov.style.display === 'flex';
    ov.style.display = 'flex';
    if (!alreadyVisible) {
      prefillSupabaseConfigForm();
    }
    activateFocusTrap(dialog);
  } else {
    ov.style.display = 'none';
    deactivateFocusTrap();
  }
};

// SUBMODULE: show/hide overlay @public - steuert Sichtbarkeit des Login-Overlays
export function showLoginOverlay() {
  toggleLoginOverlay(true);
}

export function hideLoginOverlay() {
  toggleLoginOverlay(false);
}

// SUBMODULE: setUserUi @public - aktualisiert die Anzeige des eingeloggten Benutzers
export function setUserUi(email) {
  const who = document.getElementById('whoAmI');
  if (who) who.textContent = email ? `Angemeldet als: ${email}` : '';
}

// SUBMODULE: bindAuthButtons @public - verbindet UI-Buttons mit Save-/OAuth-Aktionen
export function bindAuthButtons() {
  const googleBtn = document.getElementById('googleLoginBtn');
  const saveBtn = document.getElementById('configSaveBtn');

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const restInput = document.getElementById('configRestUrl');
      const keyInput = document.getElementById('configAnonKey');
      const rawRest = (restInput?.value || '').trim();
      const rawKey = (keyInput?.value || '').trim();
      if (!rawRest || !rawKey) {
        setConfigStatus('Bitte REST-Endpoint und ANON-Key eingeben.', 'error');
        return;
      }
      if (!/\/rest\/v1\//i.test(rawRest)) {
        setConfigStatus('REST-Endpoint muss /rest/v1/ enthalten.', 'error');
        return;
      }
      if (!/\/rest\/v1\/health_events(?:[/?#]|$)/i.test(rawRest)) {
        setConfigStatus('Endpoint muss auf /rest/v1/health_events zeigen.', 'error');
        return;
      }
      try {
        new URL(rawRest);
      } catch {
        setConfigStatus('REST-Endpoint ist keine gueltige URL.', 'error');
        return;
      }
      let anonKey = rawKey.startsWith('Bearer ') ? rawKey : `Bearer ${rawKey}`;
      if (isServiceRoleKey(anonKey)) {
        setConfigStatus('service_role Schluessel sind nicht erlaubt.', 'error');
        return;
      }
      try {
        setConfigStatus('Speichere Konfiguration ...', 'info');
        await putConf('webhookUrl', rawRest);
        await putConf('webhookKey', anonKey);
        supabaseState.sbClient = null;
        await ensureSupabaseClient();
        await requireSession();
        setConfigStatus('Konfiguration gespeichert.', 'success');
      } catch (e) {
        const message = restErrorMessage(e?.status || 0, e?.details || e?.message || '');
        setConfigStatus(message, 'error');
      }
    });
  }

  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      const supa = await ensureSupabaseClient();
      if (!supa) {
        setConfigStatus(
          'Konfiguration fehlt - bitte REST-Endpoint und ANON-Key speichern.',
          'error'
        );
        const adv = document.getElementById('configAdv');
        if (adv) adv.open = true;
        const restField = document.getElementById('configRestUrl');
        if (restField) {
          restField.focus();
          restField.select?.();
        }
        return;
      }
      const { error } = await supa.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${window.location.pathname}` }
      });
      if (error) {
        setConfigStatus('Google-Login fehlgeschlagen: ' + error.message, 'error');
      }
    });
  }
}
