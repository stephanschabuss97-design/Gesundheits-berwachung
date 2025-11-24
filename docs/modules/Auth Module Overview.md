# Auth Module – Functional Overview

Dieses Dokument fasst das Authentifizierungs- und Unlock-System des Gesundheits-Loggers zusammen. Es beschreibt die beteiligten Dateien, Flüsse (Login, Session-Refresh, App-Lock) und Diagnose-Hooks.

---

## 1. Zielsetzung

Das Auth-Modul stellt sowohl die klassische Supabase-Auth (Login, Token-Refresh) als auch App-spezifische Guards bereit:

- Anmelden via Supabase (Google, Mail, etc.).
- Bewahren und erneuern von Session/JWT (inkl. Header-Cache).
- App-Lock/Unlock (Passkey/PIN), insbesondere für Doctor-Ansicht.
- Unlock-After-Resume, sowie Logging für sicherheitsrelevante Aktionen.

---

## 2. Kernkomponenten & Dateien

| Datei | Zweck |
|-------|-------|
| `app/supabase/auth/index.js` | Kapselt Supabase-Auth (Login, Logout, token change). |
| `app/supabase/index.js` | Aggregiert Auth-Exports (`requireSession`, `watchAuthState`, `afterLoginBoot`). |
| `assets/js/main.js` | Nutzt Auth-Wrapper (`createSupabaseFn`), steuert UI/Router nach Login. |
| `assets/js/boot-auth.js` | Entry-Point beim Laden: setzt Auth-Status, bindet Buttons. |
| `app/supabase/auth/guard.js` | App-Lock/Unlock (Passkey, PIN), `requireDoctorUnlock`, `resumeAfterUnlock`. |
| `app/core/config.js` | Flag `DEV_ALLOW_DEFAULTS` steuert, ob Default-Config angezeigt werden darf. |
| UI-Dateien (`index.html`, `app/styles/auth.css`) | Login-Overlay, Buttons, Fehleranzeigen. |

---

## 3. Auth-Fluss (Supabase)

1. **Boot (`boot-auth.js`)**  
   - Liest initialen Status (`Auth status: auth` etc., siehe Console-Logs).  
   - Bindet Buttons („Mit Google anmelden“, Konfig speichern).

2. **login / requireSession**  
   - `createSupabaseFn('requireSession')` -> ensures Supabase session.  
   - Fehler -> Login-Overlay (`#loginOverlay`).  
   - Nach Erfolg: `afterLoginBoot` (z. B. Prefill, Realtime-Verbindung).

3. **watchAuthState**  
   - Reagiert auf Supabase-Events (`SIGNED_IN`, `TOKEN_REFRESHED`, `SIGNED_OUT`).  
   - `authGuardState` speichert `doctorUnlocked`, `pendingAfterUnlock`.  
   - `app/modules/hub/index.js` liest diesen State aus, um die Doctor-Ansicht nach einem erfolgreichen Biometrics-/Passkey-Unlock sofort zu öffnen (kein zweiter Klick nötig).

4. **Header-Cache**  
   - `getHeaders()` ruft `fetchWithAuth` (mit Timeout, Cached).  
   - Logging `[headers] cache hit/await inflight` etc.

5. **Logout/Unlock**  
   - `bindAuthButtons` verbindet UI-Buttons (Logout, Refresh, etc.).  
   - Beim Logout: App-Lock aktivieren.

---

## 4. Unlock-Flow (Passkey/PIN)

1. `requireDoctorUnlock()` (in `guard.js` bzw. Supabase-Layer) prüft, ob `doctorUnlocked` true ist.  
   - Falls nein, zeigt `#appLock` (Overlay) mit Buttons:
     - Passkey (`unlockPasskeyBtn`), PIN (`unlockPinBtn`), Setup (`setupPasskeyBtn`).  
     - Logging im Touch-Log `[guard] passkey success/fail`.

2. Nach erfolgreichem Unlock:  
   - `authGuardState.doctorUnlocked = true`.  
   - Event `pendingAfterUnlock` → z. B. Chart/Doctor-Refresh `requestUiRefresh`.

3. App-Lock kann erzwungen werden (z. B. beim Tab-Wechsel oder Timeout).  
   - `lockUi(true)` disablet Buttons/Panel (z. B. `setBusy`-ähnlich), `lockUi(false)` reaktiviert.  
   - Das Hub-Modul nutzt `requireDoctorUnlock` + `resumeAfterUnlock`, damit das Doctor-Panel schon beim ersten Klick nach der erfolgreichen Entsperrung erscheint.

---

## 5. Router / Tabs (Zusammenspiel mit `main.js`)

- `setTab('doctor')` ruft zuerst `requireDoctorUnlock`.  
- Capture/Intake darf auch ohne Unlock laufen, aber einzelne Funktionen (z. B. Body-Panel) prüfen `isLoggedInFast`.  
- `requestUiRefresh` ist Guarded: bevor UI-Tasks starten, `waitForSupabaseApi` checkt, ob `SupabaseAPI` existiert, und `ensureModulesReady` prüft Required Globals (z. B. `diag`, `SupabaseAPI.fetchDailyOverview`).

---

## 6. Diagnose & Logging

- Konsole: `[auth] request start ...`, `[auth] getUserId start/done`, `[auth] request supabase` etc.
- Touch-Log: `[resume] loggedFast=true`, `[doctor] unlock`, `[guard] passkey`.
- `diag.add` Einträge, z. B. `[panel] bp save while auth unknown`, `[auth] getSession timeout`.
- `uiError` (z. B. „Bitte anmelden“) bei Save-Buttons, wenn nicht eingeloggt.

---

## 7. Sicherheitsaspekte / Edge Cases

- **Anonymous Mode:** `DEV_ALLOW_DEFAULTS` erlaubt Demos ohne Supabase, aber produktiv muss Config (URL/Key) gesetzt werden.  
- **Token Refresh:** `fetchWithAuth` hat `maxAttempts`, 401 -> Refresh -> Retry.  
- **Lock State:** App-Lock verhindert Zugriff auf Doctor-Ansicht bei `doctorUnlocked=false`.  
- **Supabase `supabase:ready`** muss feuern, bevor Trendpilot/Doctor-Module Supabase-Exports nutzen.

---

## 8. Erweiterungsoptionen

- MFA/Passkey-Setup im UI (z. B. QR-Code).  
- Session-Timeout-Banner (z. B. „Session läuft ab“).  
- Audit-Log (z. B. `logAuthEvent`).  
- Offline-Mode/Read-Only (z. B. App lockt automatisch, wenn keine Connection).

---

Dieses Dokument sollte gepflegt werden, sobald neue Auth-Features hinzukommen (z. B. PWA-spezifische Guards oder Supabase-Rollenänderungen).
