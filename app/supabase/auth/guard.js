'use strict';
/**
 * MODULE: supabase/auth/guard.js
 * Description: Verwaltet AppLock, PIN-/Passkey-Handling und Doctor-Unlock-Mechanismen inkl. Secure Crypto und UI-Integration.
 * Submodules:
 *  - imports (Core + UI Overlay)
 *  - globals (Diagnostics + Window)
 *  - config accessors (getConf / putConf)
 *  - state (interne Lock-Flags)
 *  - random utils (sichere Zufallsbytes)
 *  - base64 utils (Base64- und URL-Enc/Dec)
 *  - constants (Lock-Keys & Parameter)
 *  - WebAuthn helpers (RP-Domain + Availability)
 *  - UI helpers (Overlay-Steuerung & Messages)
 *  - promptForPin (Interaktiver PIN-Dialog)
 *  - crypto utils (SHA-256, PBKDF2, SubtleCrypto)
 *  - setDoctorAccess (Arztbereich aktivieren/deaktivieren)
 *  - requireDoctorUnlock (Login-/Entsperr-Workflow)
 *  - resumeAfterUnlock (Nach-Entsperrungs-Aktion)
 *  - registerPasskey (WebAuthn-Setup)
 *  - unlockWithPasskey (Passkey-Entsperrung)
 *  - setPinInteractive (PIN-Erstellung)
 *  - unlockWithPin (PIN-Entsperrung)
 *  - bindAppLockButtons (UI-Eventbindungen)
 *  - authGuardState (Getter/Setter für Lock-Status)
 */


// SUBMODULE: imports @internal - Auth Core & UI Overlay
import { isLoggedInFast } from './core.js';
import { showLoginOverlay } from './ui.js';

// SUBMODULE: globals @internal - Diagnosezugang & Window-Hilfen
const globalWindow = typeof window !== 'undefined' ? window : undefined;

const diag =
  (globalWindow?.diag ||
    globalWindow?.AppModules?.diag ||
    globalWindow?.AppModules?.diagnostics ||
    { add() {} });

// SUBMODULE: config accessors @internal - Wrapper für getConf / putConf aus globalWindow
const getConf = (...args) => {
  const fn = globalWindow?.getConf;
  if (typeof fn !== 'function') {
    return Promise.reject(new Error('Supabase guard: getConf not available'));
  }
  try {
    return Promise.resolve(fn(...args));
  } catch (err) {
    return Promise.reject(err);
  }
};

const putConf = (...args) => {
  const fn = globalWindow?.putConf;
  if (typeof fn !== 'function') {
    return Promise.reject(new Error('Supabase guard: putConf not available'));
  }
  try {
    return Promise.resolve(fn(...args));
  } catch (err) {
    return Promise.reject(err);
  }
};

// SUBMODULE: state @internal - interne Flags für Lock-Zustände
let __doctorUnlocked = false;
let __pendingAfterUnlock = null;

// SUBMODULE: random utils @internal - sichere Zufallsbytes
const u8 = (len) => {
  if (!Number.isInteger(len) || len <= 0) {
    throw new Error('Supabase guard: invalid byte length for random data');
  }
  const arr = new Uint8Array(len);
  const webCrypto = globalWindow?.crypto;
  let filled = false;
  if (webCrypto?.getRandomValues) {
    try {
      webCrypto.getRandomValues(arr);
      filled = true;
    } catch (err) {
      diag.add?.('Supabase guard: getRandomValues failed - ' + (err?.message || err));
      filled = false;
    }
  }
  if (!filled) {
    try {
      const nodeCrypto =
        (typeof globalThis !== 'undefined' && globalThis.crypto?.randomFillSync)
          ? globalThis.crypto
          : typeof require === 'function'
            ? require('crypto')
            : null;
      if (nodeCrypto?.randomFillSync) {
        nodeCrypto.randomFillSync(arr);
        filled = true;
      }
    } catch (err) {
      diag.add?.('Supabase guard: randomFillSync fallback failed - ' + (err?.message || err));
      filled = false;
    }
  }
  if (!filled) {
    throw new Error('Supabase guard: secure random generator unavailable');
  }
  const allZero = arr.every((byte) => byte === 0);
  if (allZero) {
    throw new Error('Supabase guard: secure random generator returned zero-filled buffer');
  }
  return arr;
};

// SUBMODULE: base64 utils @internal - Basis- und URL-sichere Codierung
const base64Encode = (binary) => {
  if (typeof binary !== 'string') {
    throw new Error('Supabase guard: base64 encode expects binary string');
  }
  if (typeof globalWindow?.btoa === 'function') {
    try {
      return globalWindow.btoa(binary);
    } catch (err) {
      throw new Error('Supabase guard: base64 encode failed - ' + (err?.message || err));
    }
  }
  if (typeof Buffer !== 'undefined') {
    try {
      return Buffer.from(binary, 'binary').toString('base64');
    } catch (err) {
      throw new Error('Supabase guard: base64 encode failed - ' + (err?.message || err));
    }
  }
  throw new Error('Supabase guard: base64 encode not supported in this environment');
};

const base64Decode = (b64) => {
  if (typeof b64 !== 'string' || !b64.length) {
    throw new Error('Supabase guard: base64 decode expects non-empty string');
  }
  if (typeof globalWindow?.atob === 'function') {
    try {
      return globalWindow.atob(b64);
    } catch (err) {
      throw new Error('Supabase guard: base64 decode failed - ' + (err?.message || err));
    }
  }
  if (typeof Buffer !== 'undefined') {
    try {
      return Buffer.from(b64, 'base64').toString('binary');
    } catch (err) {
      throw new Error('Supabase guard: base64 decode failed - ' + (err?.message || err));
    }
  }
  throw new Error('Supabase guard: base64 decode not supported in this environment');
};

const b64u = {
  enc: (buf) => {
    const view =
      buf instanceof Uint8Array
        ? buf
        : buf instanceof ArrayBuffer
          ? new Uint8Array(buf)
          : null;
    if (!view) {
      throw new Error('Supabase guard: base64 encode expects ArrayBuffer or Uint8Array');
    }
    let binary = '';
    for (let i = 0; i < view.byteLength; i += 1) {
      binary += String.fromCharCode(view[i]);
    }
    return base64Encode(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec: (str) => {
    const normalized = str.replace(/\s+/g, '');
    const binary = base64Decode(normalized.replace(/-/g, '+').replace(/_/g, '/'));
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      arr[i] = binary.charCodeAt(i);
    }
    return arr;
  }
};

// SUBMODULE: constants @internal - interne Schlüssel & Parameter für Lock-State
const LOCK_ENABLED_KEY = 'app_lock_enabled';
const LOCK_CRED_ID_KEY = 'lock_cred_id';
const LOCK_PIN_HASH_KEY = 'lock_pin_hash';
const LOCK_PIN_KDF_KEY = 'lock_pin_kdf';
const LOCK_PIN_SALT_KEY = 'lock_pin_salt';
const LOCK_PIN_ITER_KEY = 'lock_pin_iter';
const LOCK_LAST_OK_KEY = 'lock_last_ok';
const LOCK_PIN_DEFAULT_ITER = 120000;

// SUBMODULE: WebAuthn helpers @internal - Prüft Verfügbarkeit & Domainauflösung
const isWebAuthnAvailable = async () => {
  if (!globalWindow?.PublicKeyCredential) return false;
  try {
    return await globalWindow.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (_) {
    return false;
  }
};

const resolveRpId = () => {
  if (typeof location === 'undefined') return null;
  const hostname = (location.hostname || '').trim();
  if (!hostname) return null;
  const lower = hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '::1'].includes(lower)) return null;
  const ipv4Pattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Pattern = /^[0-9a-f:]+$/i;
  if (ipv4Pattern.test(hostname) || ipv6Pattern.test(hostname)) return null;
  return hostname;
};

const buildRp = () => {
  const rp = { name: 'Gesundheits-Logger' };
  const rpId = resolveRpId();
  if (rpId) {
    rp.id = rpId;
  }
  return rp;
};

const textEncoder =
  typeof TextEncoder !== 'undefined'
    ? new TextEncoder()
    : (() => {
        if (typeof require !== 'function') return null;
        try {
          const { TextEncoder: NodeTextEncoder } = require('util');
          return NodeTextEncoder ? new NodeTextEncoder() : null;
        } catch (_) {
          return null;
        }
      })();

const toUserHandleBytes = (value) => {
  if (value === undefined || value === null || value === '') {
    throw new Error('Supabase guard: user handle missing');
  }
  const normalized = String(value);
  if (textEncoder) {
    const encoded = textEncoder.encode(normalized);
    if (encoded.length >= 64) {
      return encoded.slice(0, 64);
    }
    const padded = new Uint8Array(64);
    padded.set(encoded);
    return padded;
  }
  const result = new Uint8Array(64);
  const len = Math.min(64, normalized.length);
  for (let i = 0; i < len; i++) {
    result[i] = normalized.charCodeAt(i) & 0xff;
  }
  return result;
};

const getSessionUser = async () => {
  const client = globalWindow?.sbClient;
  const auth = client?.auth;
  if (!auth?.getSession) return null;
  try {
    const { data } = await auth.getSession();
    return data?.session?.user || null;
  } catch (err) {
    diag.add?.('[guard] session lookup failed: ' + (err?.message || err));
    return null;
  }
};

// SUBMODULE: UI helpers @internal - Overlay-Steuerung & Statusanzeige
const setLockMsg = (msg) => {
  const el = document.getElementById('lockMsg');
  if (el) el.textContent = msg || '';
};

const configureLockOverlay = ({
  hasPasskey = false,
  webAuthnAvailable = false,
  message = '',
  highlightSetup = false
} = {}) => {
  const passBtn = document.getElementById('unlockPasskeyBtn');
  if (passBtn) {
    const enable = webAuthnAvailable && hasPasskey;
    passBtn.disabled = !enable;
    passBtn.title = enable
      ? ''
      : webAuthnAvailable
      ? 'Bitte zuerst Passkey einrichten.'
      : 'Passkey/WebAuthn nicht verfuegbar.';
  }
  const setupBtn = document.getElementById('setupPasskeyBtn');
  if (setupBtn) {
    setupBtn.disabled = !webAuthnAvailable;
    setupBtn.style.display = webAuthnAvailable ? 'block' : 'none';
    setupBtn.classList.toggle('flash', !!highlightSetup && webAuthnAvailable);
  }
  setLockMsg(message);
};

export function lockUi(on) {
  document.body.classList.toggle('app-locked', !!on);
  const ov = document.getElementById('appLock');
  if (!ov) return;
  const dialog = ov.querySelector('[role="dialog"]') || ov;
  ov.style.display = on ? 'flex' : 'none';
  if (on) {
    globalWindow?.focusTrap?.activate?.(dialog);
    requestAnimationFrame(() => {
      const pin = document.getElementById('pinInput');
      const pass = document.getElementById('unlockPasskeyBtn');
      if (pin && typeof pin.focus === 'function') {
        pin.focus();
        pin.select?.();
        return;
      }
      if (pass && !pass.disabled && typeof pass.focus === 'function') {
        pass.focus();
      }
    });
  } else {
    globalWindow?.focusTrap?.deactivate?.();
    const pin = document.getElementById('pinInput');
    if (pin && typeof pin.blur === 'function') pin.blur();
  }
}

// SUBMODULE: promptForPin @internal - modaler PIN-Eingabedialog
const focusableSelectors =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  // SUBMODULE: promptForPin @internal - erzeugt interaktives PIN-Eingabedialog-Overlay
const promptForPin = () =>
  new Promise((resolve) => {
    const previousActive = document.activeElement;
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);z-index:2147483600;';
    overlay.setAttribute('data-supabase-pin-overlay', 'true');

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'supabase-pin-title');
    dialog.setAttribute('aria-describedby', 'supabase-pin-desc');
    dialog.style.cssText =
      'background:#fff;color:#111;min-width:280px;max-width:360px;padding:24px;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:16px;';

    const title = document.createElement('h2');
    title.id = 'supabase-pin-title';
    title.textContent = 'PIN festlegen';
    title.style.margin = '0';
    title.style.fontSize = '1.1rem';

    const desc = document.createElement('p');
    desc.id = 'supabase-pin-desc';
    desc.textContent = 'Bitte eine 4 bis 10-stellige PIN festlegen. Die PIN wird verschluesselt gespeichert.';
    desc.style.margin = '0';
    desc.style.fontSize = '.95rem';
    desc.style.color = '#374151';

    const form = document.createElement('form');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '12px';

    const label = document.createElement('label');
    label.textContent = 'Neue PIN';
    label.setAttribute('for', 'supabase-pin-input');
    label.style.fontWeight = '600';

    const input = document.createElement('input');
    input.id = 'supabase-pin-input';
    input.type = 'password';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.pattern = '\\d{4,10}';
    input.maxLength = 10;
    input.required = true;
    input.style.cssText =
      'padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:1rem;';

    const error = document.createElement('div');
    error.style.cssText = 'color:#b91c1c;font-size:.85rem;min-height:1em;';

    const buttonRow = document.createElement('div');
    buttonRow.style.display = 'flex';
    buttonRow.style.justifyContent = 'flex-end';
    buttonRow.style.gap = '8px';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Abbrechen';
    cancelBtn.style.cssText =
      'padding:8px 14px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#111;font-size:.95rem;cursor:pointer;';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'submit';
    confirmBtn.textContent = 'Speichern';
    confirmBtn.style.cssText =
      'padding:8px 14px;border-radius:8px;border:none;background:#2563eb;color:#fff;font-size:.95rem;cursor:pointer;';

    const trapFocus = (event) => {
      if (event.key !== 'Tab') return;
      const focusable = dialog.querySelectorAll(focusableSelectors);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const close = (result) => {
      overlay.removeEventListener('keydown', trapFocus);
      overlay.remove();
      if (previousActive && typeof previousActive.focus === 'function') {
        previousActive.focus();
      }
      resolve(result);
    };

    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
      }
    });
    overlay.addEventListener('keydown', trapFocus);

    cancelBtn.addEventListener('click', () => close(null));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        close(null);
      }
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!/^\d{4,10}$/.test(value)) {
        error.textContent = 'PIN muss 4 bis 10 Ziffern enthalten.';
        input.focus();
        return;
      }
      error.textContent = '';
      close(value);
    });

    buttonRow.append(cancelBtn, confirmBtn);
    form.append(label, input, error, buttonRow);
    dialog.append(title, desc, form);
    overlay.append(dialog);
    document.body.append(overlay);
    input.focus();
  });

// SUBMODULE: crypto utils @internal - SubtleCrypto, SHA-256 & PBKDF2-basierte Hashingfunktionen
const getSubtleCrypto = () => {
  const cryptoObj =
    globalWindow?.crypto ||
    (typeof globalThis !== 'undefined' ? globalThis.crypto : undefined);
  if (!cryptoObj?.subtle) {
    throw new Error('Supabase guard: crypto.subtle not available');
  }
  return cryptoObj.subtle;
};

const sha256 = async (text) => {
  if (typeof text !== 'string') {
    throw new TypeError('Supabase guard: sha256 input must be a string');
  }
  if (typeof TextEncoder !== 'function') {
    throw new Error('Supabase guard: TextEncoder not available for sha256');
  }
  const subtle = getSubtleCrypto();
  try {
    const enc = new TextEncoder().encode(text);
    const buf = await subtle.digest('SHA-256', enc);
    if (!(buf instanceof ArrayBuffer) || buf.byteLength === 0) {
      throw new Error('Supabase guard: sha256 produced empty result');
    }
    return b64u.enc(buf);
  } catch (err) {
    throw new Error('Supabase guard: sha256 failed - ' + (err?.message || err));
  }
};

const derivePinHash = async (pin, saltBytes, iterations) => {
  if (typeof pin !== 'string' || !/^\d{4,10}$/.test(pin)) {
    throw new Error('Supabase guard: derivePinHash requires 4-10 digit PIN');
  }
  if (!(saltBytes instanceof Uint8Array) || saltBytes.byteLength === 0) {
    throw new Error('Supabase guard: derivePinHash requires Uint8Array salt');
  }
  if (!Number.isFinite(iterations) || iterations <= 0) {
    throw new Error('Supabase guard: derivePinHash requires positive iteration count');
  }
  if (typeof TextEncoder !== 'function') {
    throw new Error('Supabase guard: TextEncoder not available for derivePinHash');
  }
  const subtle = getSubtleCrypto();
  try {
    const material = await subtle.importKey(
      'raw',
      new TextEncoder().encode('pin:' + pin),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations: Math.floor(iterations), hash: 'SHA-256' },
      material,
      256
    );
    if (!(bits instanceof ArrayBuffer) || bits.byteLength === 0) {
      throw new Error('Supabase guard: derivePinHash produced empty result');
    }
    return b64u.enc(bits);
  } catch (err) {
    throw new Error('Supabase guard: derivePinHash failed - ' + (err?.message || err));
  }
};

// SUBMODULE: setDoctorAccess @public - aktiviert/deaktiviert Arzt-UI-Elemente
export function setDoctorAccess(enabled) {
  const chartBtn = document.getElementById('doctorChartBtn');
  if (chartBtn) {
    chartBtn.disabled = !enabled;
    chartBtn.title = enabled ? 'Werte als Grafik' : 'Bitte zuerst anmelden';
  }
}

// SUBMODULE: requireDoctorUnlock @public - prüft Login & startet Entsperr-Workflow (PIN/Passkey)
export async function requireDoctorUnlock() {
  if (!(await isLoggedInFast())) {
    showLoginOverlay();
    return false;
  }
  if (__doctorUnlocked) return true;

  let credId = null;
  try {
    credId = await getConf(LOCK_CRED_ID_KEY);
  } catch (_) {
    credId = null;
  }
  const hasPasskey = !!credId;
  const webAuthnAvailable = await isWebAuthnAvailable();

  if (hasPasskey && webAuthnAvailable) {
    const ok = await unlockWithPasskey();
    if (ok) return true;

    configureLockOverlay({
      hasPasskey: true,
      webAuthnAvailable: true,
      message: 'Entsperren abgebrochen - du kannst Passkey erneut versuchen oder PIN nutzen.'
    });
    lockUi(true);
    return false;
  }

  if (!hasPasskey && webAuthnAvailable) {
    configureLockOverlay({
      hasPasskey: false,
      webAuthnAvailable: true,
      message: 'Kein Passkey eingerichtet. Bitte Passkey einrichten oder PIN nutzen.',
      highlightSetup: true
    });
    lockUi(true);
    return false;
  }

  configureLockOverlay({
    hasPasskey,
    webAuthnAvailable: false,
    message: 'Passkey / Windows Hello ist nicht verfuegbar - bitte PIN verwenden.'
  });
  lockUi(true);
  return false;
}

// SUBMODULE: resumeAfterUnlock @public - führt nach Entsperrung die vorgesehene Aktion aus
export async function resumeAfterUnlock(intent) {
  const target = intent || __pendingAfterUnlock || 'doctor';
  __pendingAfterUnlock = null;
  if (target === 'chart') {
    await globalWindow?.setTab?.('doctor');
    globalWindow?.chartPanel?.show?.();
    await globalWindow?.requestUiRefresh?.({ reason: 'unlock:chart', chart: true });
    return;
  }
  if (target === 'export') {
    await globalWindow?.setTab?.('doctor');
    const all = await globalWindow?.getAllEntries?.();
    const dl = globalWindow?.dl;
    if (all && typeof dl === 'function') {
      dl('gesundheitslog.json', JSON.stringify(all, null, 2), 'application/json');
    }
    return;
  }
  await globalWindow?.setTab?.('doctor');
}

// SUBMODULE: registerPasskey @internal - registriert neuen Passkey via WebAuthn
const buildPublicKeyOptions = ({ challenge, rp, user, residentKeyMode }) => ({
  challenge,
  rp,
  user,
  pubKeyCredParams: [
    { type: 'public-key', alg: -7 },
    { type: 'public-key', alg: -257 }
  ],
  timeout: 60000,
  authenticatorSelection: {
    authenticatorAttachment: 'platform',
    userVerification: 'required',
    residentKey: residentKeyMode
  },
  attestation: 'none'
});

const createPasskeyWithFallback = async (options) => {
  const navigatorCreds = globalWindow?.navigator?.credentials;
  if (!navigatorCreds?.create) {
    throw new Error('WebAuthn nicht verfuegbar.');
  }
  const tryCreate = async (residentKeyMode) => {
    const pkOptions = buildPublicKeyOptions({
      ...options,
      residentKeyMode
    });
    return navigatorCreds.create({ publicKey: pkOptions });
  };
  const preferredMode = options.residentKeyMode || 'required';
  try {
    return await tryCreate(preferredMode);
  } catch (err) {
    const name = err?.name || '';
    const unsupported = name === 'NotSupportedError' || name === 'InvalidStateError';
    if (!unsupported || preferredMode === 'preferred') {
      throw err;
    }
    diag.add?.(`[guard] residentKey required failed (${name}), retrying with preferred`);
    setLockMsg('Geraet unterstuetzt keinen plattformweiten Passkey - versuche Standardmodus...');
    return tryCreate('preferred');
  }
};

const registerPasskey = async () => {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id || !sessionUser?.email) {
      setLockMsg('Bitte zuerst bei Supabase anmelden.');
      showLoginOverlay();
      return false;
    }
    const navigatorCreds = globalWindow?.navigator?.credentials;
    if (!navigatorCreds?.create || !globalWindow?.PublicKeyCredential) {
      setLockMsg('WebAuthn wird von diesem Gerät nicht unterstützt.');
      return false;
    }
    const uvPlatformAvailable = await isWebAuthnAvailable();
    const residentKeyMode = uvPlatformAvailable ? 'required' : 'preferred';
    if (!uvPlatformAvailable) {
      diag.add?.('[guard] platform authenticator not available - using residentKey preferred');
    }
    const challenge = u8(32);
    const rp = buildRp();
    const displayName = sessionUser.email.split('@')[0] || sessionUser.email;
    const user = {
      id: toUserHandleBytes(sessionUser.id),
      name: sessionUser.email,
      displayName
    };
    const cred = await createPasskeyWithFallback({
      challenge,
      rp,
      user,
      residentKeyMode
    });
    if (!cred) throw new Error('Keine Antwort vom Authenticator.');
    const idB64 = b64u.enc(cred.rawId);
    await putConf(LOCK_CRED_ID_KEY, idB64);
    await putConf(LOCK_ENABLED_KEY, true);
    configureLockOverlay({
      hasPasskey: true,
      webAuthnAvailable: uvPlatformAvailable,
      message: `Passkey eingerichtet - angemeldet als ${displayName}.`
    });
    setLockMsg('Passkey eingerichtet.');
    return true;
  } catch (e) {
    const errName = e?.name || '';
    if (errName === 'NotAllowedError') {
      setLockMsg('Passkey-Setup abgebrochen.');
    } else {
      setLockMsg('Passkey-Setup fehlgeschlagen: ' + (e?.message || e));
    }
    return false;
  }
};

// SUBMODULE: unlockWithPasskey @internal - Entsperrung via WebAuthn
const unlockWithPasskey = async () => {
  try {
    const credId = await getConf(LOCK_CRED_ID_KEY);
    if (!credId) {
      setLockMsg('Noch kein Passkey eingerichtet.');
      return false;
    }
    const challenge = u8(32);
    const publicKey = {
      challenge,
      timeout: 60000,
      userVerification: 'required'
    };
    const rpId = resolveRpId();
    if (rpId) {
      publicKey.rpId = rpId;
    }
    const assertion = await globalWindow?.navigator?.credentials?.get({ publicKey });
    if (!assertion) throw new Error('Abgebrochen.');
    await putConf(LOCK_LAST_OK_KEY, Date.now());
    __doctorUnlocked = true;
    lockUi(false);
    try {
      await resumeAfterUnlock();
    } catch (_) {}
    return true;
  } catch (e) {
    setLockMsg('Passkey fehlgeschlagen: ' + (e?.message || e));
    return false;
  }
};

// SUBMODULE: setPinInteractive @internal - Interaktive PIN-Erstellung
const setPinInteractive = async () => {
  const pin = await promptForPin();
  if (!pin) {
    return false;
  }
  const saltBytes = u8(16);
  const hash = await derivePinHash(pin, saltBytes, LOCK_PIN_DEFAULT_ITER);
  await putConf(LOCK_PIN_KDF_KEY, hash);
  await putConf(LOCK_PIN_SALT_KEY, b64u.enc(saltBytes));
  await putConf(LOCK_PIN_ITER_KEY, LOCK_PIN_DEFAULT_ITER);
  await putConf(LOCK_PIN_HASH_KEY, null);
  await putConf(LOCK_ENABLED_KEY, true);
  setLockMsg('PIN gesetzt');
  return true;
};

// SUBMODULE: unlockWithPin @internal - Entsperrung via lokaler PIN
const unlockWithPin = async () => {
  const input = document.getElementById('pinInput');
  const pin = (input?.value || '').trim();
  if (!pin) {
    setLockMsg('PIN eingeben.');
    return false;
  }
  if (!/^\d{4,10}$/.test(pin)) {
    setLockMsg('PIN muss 4 bis 10 Ziffern enthalten.');
    input?.focus?.();
    return false;
  }
  const storedHash = await getConf(LOCK_PIN_KDF_KEY);
  const storedSaltB64 = await getConf(LOCK_PIN_SALT_KEY);
  const storedIter = await getConf(LOCK_PIN_ITER_KEY);
  let ok = false;
  let verificationError = false;
  if (storedHash && storedSaltB64 && storedIter) {
    try {
      const saltBytes = b64u.dec(storedSaltB64);
      const derived = await derivePinHash(
        pin,
        saltBytes,
        Number(storedIter) || LOCK_PIN_DEFAULT_ITER
      );
      ok = derived === storedHash;
    } catch (err) {
      diag.add?.('PIN derive error: ' + (err?.message || err));
      setLockMsg('PIN konnte nicht verifiziert werden.');
      verificationError = true;
      ok = false;
    }
  } else {
    try {
      const legacy = await getConf(LOCK_PIN_HASH_KEY);
      if (!legacy) {
        setLockMsg('Keine PIN hinterlegt.');
        return false;
      }
      const legacyHash = await sha256('pin:' + pin);
      ok = legacyHash === legacy;
      if (ok) {
        const saltBytes = u8(16);
        const newHash = await derivePinHash(pin, saltBytes, LOCK_PIN_DEFAULT_ITER);
        await putConf(LOCK_PIN_KDF_KEY, newHash);
        await putConf(LOCK_PIN_SALT_KEY, b64u.enc(saltBytes));
        await putConf(LOCK_PIN_ITER_KEY, LOCK_PIN_DEFAULT_ITER);
        await putConf(LOCK_PIN_HASH_KEY, null);
      }
    } catch (err) {
      diag.add?.('Legacy PIN verification error: ' + (err?.message || err));
      setLockMsg('PIN konnte nicht verifiziert werden.');
      verificationError = true;
      ok = false;
    }
  }
  if (!ok) {
    if (!verificationError) {
      setLockMsg('PIN falsch.');
    }
    return false;
  }
  await putConf(LOCK_LAST_OK_KEY, Date.now());
  if (input) input.value = '';
  __doctorUnlocked = true;
  lockUi(false);
  try {
    await resumeAfterUnlock();
  } catch (_) {}
  return true;
};

// SUBMODULE: bindAppLockButtons @public - Initialisiert UI-Buttons und Events
export function bindAppLockButtons() {
  const btnPass = document.getElementById('unlockPasskeyBtn');
  const btnPin = document.getElementById('unlockPinBtn');
  const btnSetPass = document.getElementById('setupPasskeyBtn');
  const btnSetPin = document.getElementById('setPinBtn');
  if (btnPass) btnPass.addEventListener('click', unlockWithPasskey);
  if (btnPin) btnPin.addEventListener('click', unlockWithPin);
  if (btnSetPass) btnSetPass.addEventListener('click', registerPasskey);
  if (btnSetPin) btnSetPin.addEventListener('click', setPinInteractive);

  const pinInput = document.getElementById('pinInput');
  if (pinInput) {
    pinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        unlockWithPin();
      }
    });
  }

  const overlay = document.getElementById('appLock');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        __pendingAfterUnlock = null;
        lockUi(false);
        try {
          document
            .querySelectorAll('details[open]')
            .forEach((d) => d.removeAttribute('open'));
        } catch (_) {}
      }
    });
  }

  const cancelBtn = document.getElementById('lockCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      __pendingAfterUnlock = null;
      lockUi(false);
      try {
        document
          .querySelectorAll('details[open]')
          .forEach((d) => d.removeAttribute('open'));
      } catch (_) {}
    });
  }
}

// SUBMODULE: authGuardState @public - Getter/Setter für Lock-Zustände
export const authGuardState = {
  get doctorUnlocked() {
    return __doctorUnlocked;
  },
  set doctorUnlocked(val) {
    __doctorUnlocked = !!val;
  },
  get pendingAfterUnlock() {
    return __pendingAfterUnlock;
  },
  set pendingAfterUnlock(val) {
    __pendingAfterUnlock = val;
  }
};
