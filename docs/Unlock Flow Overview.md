# Unlock Flow – Functional Overview

Dieses Dokument beschreibt den App-Lock / Unlock-Mechanismus (Passkey/PIN) im Gesundheits-Logger. Es erklärt UI, State und APIs (`requireDoctorUnlock`, `authGuardState`, `AppModules.lockUi`), damit spätere Anpassungen nachvollziehbar bleiben.

---

## 1. Zielsetzung

- Schutz sensitiver Bereiche (v. a. „Arzt-Ansicht“) durch manuelle Freigabe.
- Unterstützung von Passkey (WebAuthn), optional PIN als Fallback.
- Automatisches Sperren bei Tab-Wechsel, Timeout oder Logout.
- Integration mit `requestUiRefresh`, sodass Pending-Tasks nach Unlock fortgesetzt werden.

---

## 2. Kernkomponenten & Dateien

| Datei | Zweck |
|-------|-------|
| `assets/js/guard.js` (oder entsprechendes Modul im Supabase-Auth-Space) | Implementiert `requireDoctorUnlock`, Passkey/PIN Handlers, `authGuardState`. |
| `assets/js/main.js` | Ruft `requireDoctorUnlock` beim Tab-Wechsel, triggert Pending Actions (`setAuthPendingAfterUnlock`). |
| `app/supabase/index.js` | Exportiert Guard-Funktionen (`requireDoctorUnlock`, `bindAppLockButtons`, `lockUi`, `authGuardState`). |
| `assets/js/ui-tabs.js` | Stellt Tab-Switch-Events, ruft Unlock-Flow. |
| `app/styles/auth.css` | Styling für Lock-Overlay (`#appLock`). |
| `index.html` | Enthält Lock-Overlay HTML (Titel, Buttons). |

---

## 3. State & Flags

- `authGuardState` (Supabase):  
  - `doctorUnlocked` – bool, ob Arztbereich aktuell freigegeben ist.  
  - `pendingAfterUnlock` – String/Flag, welche Aktion nach Unlock ausgeführt werden soll (`doctor`, `export`, etc.).
- `AppModules.lockUi(on/off)` – UI-Busy/Disable (z. B. Buttons `pointer-events`).
- `setAuthPendingAfterUnlock(value)` – Utility in `main.js`, setzt `authGuardState.pendingAfterUnlock`.

---

## 4. UI-Flow

1. **Trigger** – Tabwechsel zu „Arzt“, Export-Button oder Chart-Panel prüfen `isDoctorUnlocked()`.  
   - Falls `false`: Lock-Overlay (`#appLock`) wird gezeigt, restliche UI behindert (`lockUi(true)`).

2. **Overlay Buttons**
   - `unlockPasskeyBtn`: WebAuthn (via Supabase `auth.signInWithOtp` oder passkeys).  
   - `unlockPinBtn`: Öffnet PIN-Eingabe (z. B. Input + Button).  
   - Setup-Buttons: `setupPasskeyBtn`, `setPinBtn`.

3. **Erfolg**
   - `authGuardState.doctorUnlocked = true`.  
   - `setAuthPendingAfterUnlock(null)` + `lockUi(false)` + Overlay hide.  
   - Wenn `pendingAfterUnlock` gesetzt war, wird sie ausgeführt (z. B. `requestUiRefresh({ doctor: true })`).

4. **Fehler / Abbruch**
   - Logs (`diag.add('[guard] ...')`, Touch-Log: `[guard] passkey failed`).  
   - UI zeigt Fehlermeldung (z. B. `uiError('PIN falsch')`).

---

## 5. Integration mit Resume/Logout

- Beim Logout bzw. `watchAuthState` => `doctorUnlocked = false`, Overlay bleibt aktiv, bis User neu entsperrt.
- `resumeFromBackground` kann optional `lockUi(true)` aktivieren (abhängig von Timeout/Policy).

---

## 6. Diagnose & Logging

- `diag.add` / Touch-Log-Einträge:
  - `[doctor] requireDoctorUnlock missing - blocking access`
  - `[guard] passkey success/fail`
  - `[auth] request start ...` (falls Unlock API Supabase nutzt).
- `lockUi` kann man im Log erkennen („LOCK UI ON/OFF“), falls Logging aktiviert wird.

---

## 7. Sicherheitshinweise

- Passkey/PIN werden clientseitig nur nach Supabase-Flow verarbeitet (z. B. OTP/Edge API).
- PIN sollte eventuell serverseitig validiert werden; derzeit Fallback.
- `doctorUnlocked` sollte bei Tab-Verlassen/Timeout zurückgesetzt werden (Policy definieren).
- UI muss verhindern, dass man `doctor` Tab sieht, solange `doctorUnlocked=false`.

---

## 8. Erweiterungsideen

- Timeout-Overlay (z. B. nach X Minuten Inaktivität).
- Multi-User-Support (z. B. pro Patient/Arzt).
- Audit-Log für Unlock/Lock-Ereignisse.
- Biometrie-Status-Anzeige (z. B. „zuletzt mit FaceID entsperrt“).

---

Aktualisiere dieses Dokument, sobald der Unlock-Flow neue Buttons, APIs oder Policies erhält.
