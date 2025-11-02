/** MODULE: supabase/auth/guard.js — Access Control @v1.8.1 */

import { isLoggedInFast } from './core.js';
import { showLoginOverlay } from './ui.js';

const globalWindow = typeof window !== 'undefined' ? window : undefined;

const diag =
  (globalWindow?.diag ||
    globalWindow?.AppModules?.diag ||
    globalWindow?.AppModules?.diagnostics ||
    { add() {} });

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

let __doctorUnlocked = false;
let __pendingAfterUnlock = null;

const u8 = (len) => {
  const a = new Uint8Array(len);
  globalWindow?.crypto?.getRandomValues?.(a);
  return a;
};

const b64u = {
  enc: (buf) =>
    globalWindow?.btoa
      ? globalWindow.btoa(String.fromCharCode(...new Uint8Array(buf)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')
      : '',
  dec: (str) =>
    Uint8Array.from(
      (globalWindow?.atob?.(str.replace(/-/g, '+').replace(/_/g, '/')) || '').split(''),
      (c) => c.charCodeAt(0)
    )
};

const LOCK_ENABLED_KEY = 'app_lock_enabled';
const LOCK_CRED_ID_KEY = 'lock_cred_id';
const LOCK_PIN_HASH_KEY = 'lock_pin_hash';
const LOCK_PIN_KDF_KEY = 'lock_pin_kdf';
const LOCK_PIN_SALT_KEY = 'lock_pin_salt';
const LOCK_PIN_ITER_KEY = 'lock_pin_iter';
const LOCK_LAST_OK_KEY = 'lock_last_ok';
const LOCK_PIN_DEFAULT_ITER = 120000;

const isWebAuthnAvailable = async () => {
  if (!globalWindow?.PublicKeyCredential) return false;
  try {
    return await globalWindow.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (_) {
    return false;
  }
};

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
      : 'Passkey/WebAuthn nicht verfügbar.';
  }
  const setupBtn = document.getElementById('setupPasskeyBtn');
  if (setupBtn) {
    setupBtn.disabled = !webAuthnAvailable;
    setupBtn.style.display = webAuthnAvailable ? 'block' : 'none';
    setupBtn.classList.toggle('flash', !!highlightSetup && webAuthnAvailable);
  }
  setLockMsg(message);
};

const lockUi = (on) => {
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
};

const sha256 = async (text) => {
  const enc = new TextEncoder().encode(text);
  const buf = await globalWindow?.crypto?.subtle?.digest('SHA-256', enc);
  return buf ? b64u.enc(buf) : '';
};

const derivePinHash = async (pin, saltBytes, iterations) => {
  const material = await globalWindow?.crypto?.subtle?.importKey(
    'raw',
    new TextEncoder().encode('pin:' + pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await globalWindow?.crypto?.subtle?.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    material,
    256
  );
  return bits ? b64u.enc(bits) : '';
};

export function setDoctorAccess(enabled) {
  const tabBtn = document.getElementById('tab-doctor');
  if (tabBtn) {
    tabBtn.disabled = !enabled;
    tabBtn.classList.toggle('ghost', !enabled);
    tabBtn.title = enabled ? '' : 'Bitte zuerst anmelden';
  }
  const chartBtn = document.getElementById('doctorChartBtn');
  if (chartBtn) {
    chartBtn.disabled = !enabled;
    chartBtn.title = enabled ? 'Werte als Grafik' : 'Bitte zuerst anmelden';
  }
}

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
      message: 'Entsperren abgebrochen – du kannst Passkey erneut versuchen oder PIN nutzen.'
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
    message: 'Passkey / Windows Hello ist nicht verfügbar. Bitte PIN verwenden.'
  });
  lockUi(true);
  return false;
}

export async function resumeAfterUnlock(intent) {
  const target = intent || __pendingAfterUnlock || 'doctor';
  __pendingAfterUnlock = null;
  if (target === 'chart') {
    await globalWindow?.setTab?.('doctor');
    globalWindow?.setDocBadges?.({ visible: true });
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

const registerPasskey = async () => {
  try {
    const rpId = location.hostname;
    const challenge = u8(32);
    const userId = u8(16);
    const cred = await globalWindow?.navigator?.credentials?.create({
      publicKey: {
        challenge,
        rp: { name: 'Gesundheits-Logger', id: rpId },
        user: { id: userId, name: 'local-user', displayName: 'Local User' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 }
        ],
        timeout: 60000,
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'preferred',
          residentKey: 'preferred'
        },
        attestation: 'none'
      }
    });
    if (!cred) throw new Error('Keine Antwort vom Authenticator.');
    const idB64 = b64u.enc(cred.rawId);
    await putConf(LOCK_CRED_ID_KEY, idB64);
    await putConf(LOCK_ENABLED_KEY, true);
    const waAvailable = await isWebAuthnAvailable();
    configureLockOverlay({
      hasPasskey: true,
      webAuthnAvailable: waAvailable,
      message: 'Passkey eingerichtet - bitte kurz entsperren.'
    });
    setLockMsg('Passkey eingerichtet.');
    return true;
  } catch (e) {
    setLockMsg('Passkey-Setup fehlgeschlagen: ' + (e?.message || e));
    return false;
  }
};

const unlockWithPasskey = async () => {
  try {
    const credId = await getConf(LOCK_CRED_ID_KEY);
    if (!credId) {
      setLockMsg('Noch kein Passkey eingerichtet.');
      return false;
    }
    const allow = [{ type: 'public-key', id: b64u.dec(credId) }];
    const challenge = u8(32);
    const assertion = await globalWindow?.navigator?.credentials?.get({
      publicKey: {
        challenge,
        rpId: location.hostname,
        timeout: 60000,
        allowCredentials: allow,
        userVerification: 'preferred'
      }
    });
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

const setPinInteractive = async () => {
  const pin = prompt('Neue PIN (4-10 Ziffern):') || '';
  if (!/^\d{4,10}$/.test(pin)) {
    alert('Ungültige PIN.');
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

const unlockWithPin = async () => {
  const input = document.getElementById('pinInput');
  const pin = (input?.value || '').trim();
  if (!pin) {
    setLockMsg('PIN eingeben.');
    return false;
  }
  const storedHash = await getConf(LOCK_PIN_KDF_KEY);
  const storedSaltB64 = await getConf(LOCK_PIN_SALT_KEY);
  const storedIter = await getConf(LOCK_PIN_ITER_KEY);
  let ok = false;
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
      console.error('PIN derive error', err);
      ok = false;
    }
  } else {
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
  }
  if (!ok) {
    setLockMsg('PIN falsch.');
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
