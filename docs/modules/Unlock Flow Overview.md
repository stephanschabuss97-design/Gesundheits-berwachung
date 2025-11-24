# Unlock Flow – Functional Overview

Dieses Dokument beschreibt den aktuellen App-Lock / Unlock-Mechanismus (Biometrie/PIN) im Gesundheits-Logger. Fokus: Guard-State (`authGuardState`), Supabase-Funktionen (`requireDoctorUnlock`, `setAuthPendingAfterUnlock`), Hub-Integration und Diagnose.

---

## 1. Zielsetzung

- Schutz sensitiver Bereiche (v.?a. Arzt-Ansicht / Trendpilot-Daten) durch biometrischen Unlock.
- Unterstützung von Passkey (WebAuthn) + optionaler PIN als Fallback.
- Automatisches Sperren bei Tab-/Panel-Wechsel, Timeout oder Logout.
- Integration mit Hub/`requestUiRefresh`, damit Pending-Tasks nach Unlock fortgesetzt werden.

---

## 2. Kernkomponenten & Dateien

| Datei | Zweck |
|-------|-------|
| `app/supabase/auth/guard.js` | Implementiert Guard-Flow: `requireDoctorUnlock`, Passkey/PIN Handler, `authGuardState`, `lockUi`, `setAuthPendingAfterUnlock`. |
| `app/modules/hub/index.js` | Hub-Orbit ruft `requireDoctorUnlock` wenn die Doctor-Spitze aktiviert wird; nach Erfolg wird das Panel direkt geöffnet. |
| `assets/js/main.js` | Fängt Tab-/Button-Aktionen ab, ruft `requireDoctorUnlock`, setzt Pending Actions (`setAuthPendingAfterUnlock`). |
| `assets/js/ui-tabs.js` | Legacy Tab-Switch (Capture/Doctor) ruft `requireDoctorUnlock` weiter; Hub nutzt dieselben Helper. |
| `app/styles/auth.css` | Styling für Lock-Overlay (`#appLock`). |
| `index.html` | Enthält Lock-Overlay-HTML (Titel, Buttons, Passkey/PIN-Flows). |

---

## 3. State & Flags

- `authGuardState` (Supabase Guard):
  - `doctorUnlocked` – bool, ob Arztbereiche aktuell freigegeben sind.
  - `pendingAfterUnlock` – String/Flag, welche Aktion nach Unlock ausgeführt werden soll (`doctor`, `export`, …).
  - `biometricSupported`, `pinSupported` – Helferflags (Guard Modul).
- `AppModules.lockUi(on/off)` – blockiert Hub-Orbit + Panels während des Unlocks (setzt `pointer-events: none`, blur etc.).
- `setAuthPendingAfterUnlock(value)` – Utility in Guard/Hauptmodulen, setzt pending Action.

---

## 4. UI-Flow

1. **Trigger** – Orbit-Spitze „Doctor“, Export-Button oder Chart-Panel prüft `isDoctorUnlocked()`.
   - Falls `false`: `requireDoctorUnlock()` ? Lock-Overlay wird angezeigt, restliche UI gesperrt (`lockUi(true)`).
2. **Overlay Buttons**
   - `unlockPasskeyBtn`: WebAuthn/Passkey via Supabase (`auth.signInWithOtp`, `auth.verifyOtp`).
   - `unlockPinBtn`: PIN-Eingabe (lokale Eingabe + Supabase-Check).
   - Setup Buttons (`setupPasskeyBtn`, `setupPinBtn`) optional.
3. **Erfolg**
   - Guard setzt `authGuardState.doctorUnlocked = true`.
   - `setAuthPendingAfterUnlock(null)`, `lockUi(false)`, Overlay hide.
   - Falls `pendingAfterUnlock` gesetzt war (z.?B. „doctor“), wird sie ausgeführt (`requestUiRefresh({ doctor: true, reason: 'unlock:doctor' })`). Hub öffnet direkt das gewünschte Panel.
4. **Fehler/Abbruch**
   - `diag.add('[guard] passkey failed', …)` + `uiError('PIN falsch')` etc.
   - Lock bleibt aktiv, bis Nutzer erneut versucht oder abbricht.

---

## 5. Integration mit Hub / Resume / Logout

- **Hub Doctor Panel**: `hub/index.js` ruft `ensureDoctorUnlocked()` bevor das Overlay gerendert wird; nach Erfolg wird `openDoctorOverlay()` sofort ausgeführt.
- **Logout / Auth-Changes**: `watchAuthState` (Guard) setzt `doctorUnlocked = false`. `main.js` sorgt dafür, dass Pending Actions gelöscht werden.
- **ResumeFromBackground**: optionaler Hook (`resumeFromBackground` ? `lockUi(true)`), abhängig von Policy; derzeit manuell nach Timeout/Logout.

---

## 6. Diagnose & Logging

- Touch-Log-Einträge:
  - `[doctor] requireDoctorUnlock missing - blocking access` (wenn Guard nicht geladen).
  - `[guard] passkey success/fail`, `[guard] pin success/fail`.
  - `[unlock] pending action doctor` etc.
- `diag.add` für Exceptions, WebAuthn-Fehler oder API-Fehler.

---

## 7. Sicherheitshinweise

- Passkey/PIN werden über Supabase auth-Flows abgewickelt (kein direkter Client-Hash).
- `doctorUnlocked` sollte bei Tab-Verlassen/Timeout auf `false` gesetzt werden (Guard erledigt das).
- UI muss verhindern, dass Doctor-Panel sichtbar ist, solange `doctorUnlocked=false` (Hub prüft vor dem Öffnen und sperrt Buttons).
- `pendingAfterUnlock` sollte nach Ausführung gelöscht werden, damit keine veralteten Aktionen laufen.

---

## 8. Erweiterungsideen

- Automatischer Timeout-Lock (z.?B. nach X Minuten Inaktivität im Hub).
- Audit-Log für Unlock/Lock-Ereignisse (Supabase-Tabellen).
- Multi-User-Support (verschiedene Ärzte/Patienten).
- Biometrie-Status-Anzeige direkt auf dem Hub (z.?B. „Zuletzt vor 5 min entsperrt“).

---

Aktualisiere dieses Dokument, sobald der Unlock-Flow neue Buttons, APIs oder Policies erhält (z.?B. KI-Freigaben, PWA-spezifische Locks).
