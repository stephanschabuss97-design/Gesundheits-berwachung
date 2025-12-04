---

# MIDAS – Voice Assistant, Butler & Foodcoach

**Roadmap (Dev View, v6 – Codex-ready)**

**Ziel:**
MIDAS wird ein modularer Gesundheits-Helper, der:

* per **Voice** Panels steuert, Wasser/Protein loggt und Zustände erklärt (Butler-Modus)
* per **Text & Foto** Mahlzeiten analysiert und beim Loggen unterstützt (Foodcoach)
* später sauber als **PWA/TWA** läuft – mit stabilem Auth & Persistent Login

**Wichtig für Codex:**
Diese Roadmap beschreibt *Phasen*, keine einzelnen Prompts.  
Jede Phase wird separat umgesetzt (eigener Branch / eigener Prompt).  
Innerhalb einer Phase nur an den explizit genannten Dateien/Modulen arbeiten und keine neuen Features aus anderen Phasen vorziehen.

---

## Phase 0 – Core Foundations / Bootstrap Layer

**Ziel:**
Vom Prototyp zur stabilen App: deterministischer Boot, klarer Auth-State, kein „halb initialisiert“.
**Wichtig:** Kein Persistent Login in dieser Phase, nur die Basis.

| Task                       | Status | Beschreibung |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| 0.1 Bootstrap Flow rebuild | ✅ | Neuer Bootfluss: `BOOT → AUTH_CHECK → INIT_CORE → INIT_MODULES → INIT_UI → IDLE`. UI bleibt geblockt, bis Supabase + Auth + Basis-Konfig bestätigt sind. Umsetzung primär in `index.html`, `app/core/boot-flow.js`, `assets/js/main.js`. |

Phase 0.1 Dateiliste

index.html:7,572-620 – Body und Script-Loader. ✅
- Ergänze data-boot-stage + aria-busy auf <body> sowie ein kleines <div id="bootScreen">, das Hub/Forms blockiert, bis Stage IDLE erreicht ist. Der Loader bekommt Platz dicht hinter <body> damit app/styles/base.css ihn per Klassen (body[data-boot-stage="boot"]) dimmen kann.
- Im Script-Block (Zeile 572ff.) muss app/core/boot-flow.js neu vor allen anderen Bundles eingebunden werden, damit AppModules.bootFlow verfügbar ist, bevor hub/index.js, boot-auth.js oder assets/js/main.js loslaufen.

app/styles/base.css (lines 98-111) (+ Anhänge in app/styles/auth.css) – Globale Sperr-States. ✅
- Zusätzlich zu body.auth-locked main brauchst du Selektoren für body[data-boot-stage] (z. B. body.boot-block main { pointer-events:none; opacity:.25; }) und Stile für #bootScreen (fixe Position, Spinner, Stage-Label). So bleibt der komplette Hub visuell blockiert, bis bootFlow auf IDLE wechselt.
- Ergänze Transition-Tokens (z. B. CSS-Variablen für Statusfarben), damit Stage-Text („BOOT“, „AUTH_CHECK“… ) sichtbar wird.

Neue Datei app/core/boot-flow.js. ✅
- Enthält die Stage-Definition (const STAGES = ['BOOT','AUTH_CHECK','INIT_CORE','INIT_MODULES','INIT_UI','IDLE']), setStage/whenStage/onStageChange APIs sowie DOM-Side-Effects (Body-Dataset, #bootScreen Text, Logging). Binde sie unter window.AppModules.bootFlow.
- Zuständig auch für Timeout/Fehlerhandling (falls Stage hängt → setConfigStatus('Boot hängt', 'error')).

assets/js/main.js (lines 1114-1495). ✅
- Zerlege main() nach Stage-Funktionen:
runBoot() (DOM ready, ensureModulesReady, diag.init),
runAuthCheck() (wartet auf waitForSupabaseApi, requireSession, afterLoginBoot, setupRealtime),
initCore() (DB/init, capture state seeds, AppModules.captureGlobals Reset),
initModules() (bind tabs/buttons, watchers, midnight/noon timers, bindAppLockButtons, config fetch),
initUiAndLiftLock() (erster requestUiRefresh, remove overlays, enable inputs).
Jede Phase ruft bootFlow.setStage(...).
- Entferne doppelte DOMContentLoaded-Warteblöcke (Zeile 1114-1119, 1483-1495) und ersetze sie durch bootFlow.whenStage.
- Die Failsafe-Schritte (z. B. Buttons wieder aktivieren, Onlinesync) bleiben, laufen aber nur nach INIT_UI.

assets/js/boot-auth.js (lines 1-40). ✅
- Statt sofort initAuth zu callen, registriert das Modul seine Hooks erst, wenn bootFlow.whenStage('AUTH_CHECK', ...) erreicht ist. Im Hook onStatus rufst du bootFlow.setStage('INIT_CORE'), sobald status !== 'unknown' (Supabase hat Auth entschieden). Außerdem liefert das Modul Status-Text an den Loader (bootFlow.report('Prüfe Session…')).

app/supabase/auth/core.js (lines 291-320). ✅
- Nach supabaseState.booted = true (Zeile 292) informieren wir den Boot-Flow, dass Auth fertig ist (AppModules.bootFlow?.markAuthReady()), damit INIT_CORE nicht vorzeitig durchläuft.
- In finalizeAuthState und requireSession sollte der neue Stage-Manager getriggert werden, wenn authState zu auth/unauth wechselt, damit UI-Block sauber aufgehoben wird und Fehler (kein Supabase-Client) direkt auf dem Bootscreen landen (setConfigStatusSafe + bootFlow.fail('Supabase Client fehlt')).

app/modules/hub/index.js (lines 1500-1504). ✅
- Der Hub initialisiert aktuell sofort nach DOM ready. Schieb activateHubLayout() hinter AppModules.bootFlow.whenStage('INIT_UI', activateHubLayout) und füge body[data-boot-stage!="IDLE"]-Checks in allen Orbit-Klick-Handlern hinzu (so bleiben Buttons inaktiv solange Stage < INIT_UI). Optional: BootFlow liefert lockReason → Zeige im Panel-Header „Hub lädt…“.

app/modules/doctor/index.js & app/modules/capture/index.js. ✅
- Beide Module greifen beim Laden bereits auf DOM zu. Ergänze am Anfang Guard-Code if (!AppModules.bootFlow?.isStageAtLeast('INIT_MODULES')) return; für Handler, die vom Boot-Overlay aus ausgelöst werden könnten, und registriere ihre globalen window.AppModules.* APIs erst nach INIT_CORE. Damit kollidiert der Stage-Lock nicht mit Legacy-Tab-Aufrufen.

app/core/config.js & assets/js/ui.js.✅
- config.js erhält optional einen Flag (window.BOOT_STAGE_DEBUG) plus body.dataset.bootStageDebug, womit QA bootFlow zwingen kann, im Loader zu verbleiben.
- ui.js (hier laufen setUnderlayInert, Help-Panel etc.) muss bootFlow.whenStage('INIT_UI', () => bindHelpPanel()) verwenden, damit Modals nicht starten, solange #bootScreen oben ist.

Diese Übersicht liefert dir eine roadmap, welche Stellen für den neuen deterministischen Boot-Prozess angefasst werden müssen. Sobald du loslegen willst, gehen wir Datei für Datei durch und setzen die beschriebenen Anpassungen um.

| 0.2 Cleanup Pass (Light)   | ✅  | Erste Runde: alte Logger/Workarounds raus, doppelte Listener/Guards entschärfen, dead code entfernen, `/core` minimal entschlacken. Nur offensichtliche Altlasten entfernen, keine tiefen Refactors (die kommen in Phase 6).         |

Hier ist die To-do-Liste für Phase 0.2 („Cleanup Pass Light“) mit konkreten Dateien und Arbeiten – exakt an diese Stellen müssen wir ran, bevor wir neue Features anpacken:

assets/js/main.js ✅
- Zeilen ~1500/1536: Es existieren zwei window.addEventListener('focus', …)-Handler (einer triggert Resume, einer maybeRefreshForTodayChange). Für den Cleanup müssen wir diese Listener zusammenführen, damit der Fokuswechsel nur genau einen Pfad auslöst (sonst laufen Resume + Day-Refresh doppelt und erzeugen unnötige Logs).
- Im Rahmen desselben Blocks prüfen wir, ob resumeEventHandler im Hidden-State laufen sollte (jetzt feuert jeder Focus auch mitten im Boot – ggf. eine Stage-Prüfung hinzufügen).
- Außerdem sollten wir den verbleibenden console.error('Boot failed', err); am Ende nur noch über diag.add loggen, sobald Phase 0 fertig ist.

assets/js/boot-auth.js ✅
- console.info("Auth status:", status) loggt bei jedem Statuswechsel, was wir laut Cleanup-Plan vermeiden wollen. Ziel: über diag loggen oder nur im Debug-Modus, damit Boot nicht von permanenten console-Spam begleitet wird.
- Prüfen, ob wir die Stage-Aktualisierung (aktueller Guard advanceStageToInitCore) kommentiert dokumentieren, damit keine Doppel-Transitions passieren.

app/modules/hub/index.js ✅
- Zwischen Zeile ~392 und ~1370 finden sich viele console.info-/console.warn-Statements (z. B. [assistant-chat] setupAssistantChat called, [midas-voice] Assistant reply). Für Phase 0.2 sollen wir diese offensichtlichen console.*-Spuren entfernen oder hinter einem Debug-Flag verstecken (z. B. if (AppModules.config?.DEV_ALLOW_DEFAULTS)), und die relevanten Ereignisse lieber an diag.add melden.
- Gleiches Modul hat jetzt Boot-Guards. Wir sollten kontrollieren, dass die console.warn('[hub] Supabase webhookKey missing …') Meldungen weiterhin Sinn ergeben; falls nicht, über diag.

app/modules/assistant/actions.js ✅
- Enthält über 20 console.log-/console.warn-Zeilen (Zeilen 195–400, 430ff). Für den Cleanup entweder über einen dedizierten assistantLogger laufen lassen oder auf diag.add umbauen. Ziel: Production-Konsole abschalten.
- Gleichzeitig prüfen, ob verwaiste Actions (z. B. TransitionToTextChat, ReadTouchlog) doppelt implementiert sind. Alles, was offensichtlich nie aufgerufen wird, markieren.

app/modules/assistant/index.js ✅
- Ähnlich wie oben: console.info für Panel-Events → auf diag/Debug umstellen.

assets/js/ui.js ✅
- Nach unserem letzten Update muss waitForInitUi sicherstellen, dass auch focusTrap / setUnderlayInert keine Logs werfen. Checken, ob hier noch console.warn (missing panel) sinnvoll oder per diag geloggt werden sollte.

assets/js/main.js (zweiter Punkt) ✅
- ensureModulesReady (Zeile ~800) hat noch eine generische DOM-Fehlermeldung. Für den Cleanup sollten wir den Text kürzen und console.error komplett durch UI-Banner & diag ersetzen, um Boot-Logs sauber zu halten.
- Zudem startBootProcess() ruft main().catch und loggt via console.error – auch hier diag.

app/core/diag.js ✅
- Enthält Fallback console.warn / console.info, wenn Diagnostics off sind. Wir sollten dokumentieren, dass das bewusst so bleibt, aber im Cleanup evtl. ein einheitliches Flag (if (global.DIAGNOSTICS_ENABLED)) nutzen und den Rest stumm schalten.

app/modules/capture/index.js & app/modules/doctor/index.js ✅
- Beide Dateien haben neue Boot-Guards. Für Phase 0.2 müssen wir prüfen, ob es noch alte, ungenutzte Funktionen/Listener gibt (z. B. bindLifestyle, resetCapturePanels), die nie aufgerufen werden – offensichtliche Dead-Ends rausnehmen oder markieren.
- Außerdem sicherstellen, dass window.AppModules.capture/doctor keine Legacy-Globals (global.renderDoctor) mehr doppelt registrieren – das war die Quelle vergangener Warnungen.

app/supabase/auth/core.js ✅
- console.info wird hier nicht verwendet, aber reportBootStatus()/markFailed() könnte noch console.* werfen, sobald Diagnostics deaktiviert sind. Im Cleanup verifizieren, dass Boot-Status ausschließlich über bootFlow.report > setConfigStatus kommuniziert wird.

assets/js/data-local.js ✅
- Enthält mehrere console.warn (z. B. bei fehlenden Indizes). Wir sollen diese nur noch im Dev-Flag ausgeben und sonst über diag/report. Prüfen, ob ensureDbReady bei Fehlern BootFlow bereits markiert – falls nein, in Phase 0.2 hinzufügen.

| 0.3 Auth Flow Fix          | ✅   | Pre-render Auth Gate: App rendert erst nach Supabase-Entscheid (`auth` / `unauth`). Kein klickbares UI im „auth unknown“. Klare `authState`-Übergänge in `app/supabase/auth/core.js` und `assets/js/boot-auth.js`.                     |

Phase 0.3 needs a tighter auth gate. Here’s the file-by-file plan:

assets/js/boot-auth.js ✅
Enforce pre‑render gate. Right now bootAuth() advances the boot stage as soon as onStatus fires with anything not strictly 'unknown', so the UI can unfreeze while Supabase is still checking. We need to let bootFlow know when status transitions to 'unknown', 'auth', or 'unauth', and only call setStage('INIT_CORE') after the first definite decision. While waiting, keep reporting “Prüfe Session …” so the loader stays up, and once a final state arrives, report “Session ok” or “Nicht angemeldet – Login erforderlich”. Also pass a flag (e.g. bootFlow.lockReason = 'auth-check') so other modules can block interactions until the stage flips.

app/supabase/auth/core.js ✅
Normalize authState transitions and UI locking. applyAuthUi only toggles the lock for true/false and skips 'unknown'. We need to treat 'unknown' as a locked state: set body.auth-locked, keep login overlay hidden but render a “Bitte warten” message, and surface the lock reason via bootFlow.report. During scheduleAuthGrace the UI should stay inert. Also ensure finalizeAuthState, scheduleAuthGrace, and requireSession all run through a single setAuthState(nextState) helper that notifies bootFlow and boot-auth.js of every state change. That keeps authHooks.onStatus consistent and avoids double transitions.

assets/js/main.js ✅
Gate boot stages to auth. runBootPhase currently goes straight from AUTH_CHECK to INIT_CORE once ensureModulesReady passes. Update it so runAuthCheckPhase waits for a resolved auth decision (maybe by awaiting a promise exposed by boot-auth.js or AppModules.supabase.authReady). Only after authState becomes 'auth' or 'unauth' should we call setBootStage('INIT_CORE'). Additionally, when authState is 'unknown', resume handlers and interaction logic should early-return to avoid clicks.

app/styles/base.css / app/styles/auth.css ✅
Visual lock for auth gate. Ensure there’s a style for body.auth-unknown (or reuse auth-locked) that keeps inputs inert and shows a short message on the boot overlay. We already dim via body.auth-locked, but for Phase 0.3 we need a distinct class so UX can show “Supabase prüft Session …”.

app/modules/hub/index.js, app/modules/capture/index.js, etc.
Honor the new auth gate. Each module that currently checks AppModules.bootFlow?.isStageAtLeast('INIT_UI') should also check supabaseState.authState !== 'unknown' (hooked via a helper exported from app/supabase/auth/core.js). For example, handleCaptureIntake, renderDoctor, hub button handlers, etc., should bail immediately when the new auth gate reports “unknown”.

docs/Voice Assistant roadmap.md / QA docs ✅
Document the new auth gate. Update the roadmap and QA checklist to mention that the app doesn’t render or accept input until Supabase returns auth/unauth, and add test steps (e.g., “simulate slow Supabase; UI stays locked, boot overlay shows status”).

Once these changes are in place, Phase 0.3’s requirements—pre-render auth gate, no clickable UI while auth status is unknown, and clarified state transitions in app/supabase/auth/core.js plus assets/js/boot-auth.js—will be satisfied.

| 0.4 Voice Safety Init      | ✅   | Voice-Nadel + VAD warten auf bootFlow=IDLE **und** eine entschiedene Supabase-Auth. Auth-Drops stoppen Aufnahme/TTS sofort, Orbit zeigt den Sperrstatus.          |

Phase 0.4 Abschluss:

- app/modules/hub/index.js : Voice-Gate-API (getVoiceGateStatus, isVoiceReady, onVoiceGateChange) blockt Needle/VAD/Resume solange Boot/Auth offen sind und loggt [voice] gate .... Bei Auth-Drop werden Recorder, Streams und Conversations beendet.
- app/modules/hub/vad/vad.js  + Worklet checken den Gate vor start() und stoppen sofort mit [vad] stop due to voice gate lock, wenn Auth zur?ck auf unknown f?llt.
- app/modules/assistant/session-agent.js  beendet Voice-Sessions automatisch, sobald der Gate schlie?t, und schreibt die Systemmeldung ?Voice deaktiviert ? bitte warten?, damit keine neuen Prompts starten.
- app/styles/hub.css liefert body.voice-locked + .hub-core-trigger.is-voice-locked (gedimmte Orbit/Rings, Tooltip ?Voice aktiviert sich nach dem Start?, pointer-events:none).
- assets/js/main.js pr?ft Voice-Gate pro Visibility/PageShow/Focus-Resume und ?berspringt 
esumeFromBackground, solange Voice/Boot/Auth blockiert sind.
- docs/QA_CHECKS.md, dieses Dokument und die Modul-Overviews (Hub, Assistant, VAD) enthalten jetzt die Voice-Safety-Guidelines + QA-Schritte (Slow Supabase, Mid-Session-Logout).

- 0.5: Touchlog Cleanup (Deterministic Event Trace)
Status: TODO
Beschreibung:
Der Touchlog wird bereinigt, dedupliziert und deterministisch gemacht. Ziel: Jeder User-Input wird genau einmal geloggt, in klarer Reihenfolge, ohne Doppel-Events durch parallele Listener oder frühe/late-Boot-Zustände. Alte Workarounds, doppelte Writes, überlagernde Pointer-/Mouse-/Touch-Handler werden entfernt oder vereinheitlicht. Logging läuft ausschließlich über touchLog.add() mit sauberem Event-Typ (tap, longpress, cancel, dragstart, …). Ergebnis: Ein stabiler, minimaler und nachvollziehbarer Input-Trace, der Debugging & QA deutlich vereinfacht.

| 0.5 Touchlog Cleanup (Deterministic Trace) | TODO | Reduziere Touch-Log auf eindeutige Events: keine doppelten [capture] loadIntakeToday, [conf] getConf, [auth] getUserId oder UI-Refresh-Bl?cke w?hrend Boot/Resume. Konzentriert sich auf Log-Pipeline und Guards, keine Feature-?nderungen. **QA-Hinweis:** In docs/QA_CHECKS.md stehen die neuen Smoke-Schritte (Boot, manuelles Refresh, Resume), die sicherstellen, dass pro Reason genau ein Start/Ende geloggt wird. |

Touchlog Cleanup Fokus:

assets/js/main.js ✅
- Boot/Resume Logging ([ui] refresh start/end, startBootProcess) l?uft derzeit mehrfach; f?ge eine Debounce/Guard-Ebene ein, damit jeder Reason nur einmal pro Boot/Resume protokolliert wird.
- Erg?nze einen kleinen Log-Deduper (logOncePerTick(key, message)) f?r Boot-Phase, damit identische Zeilen (z. B. [ui] step start doctor) nicht mehrfach erscheinen.

app/modules/hub/index.js ✅
- Debug-Ausgaben ([hub:debug] assistant-chat setup...) feuern in Bl?cken bei jedem init. Halte sie hinter einem Flag oder logge nur beim ersten Setup.
- Click-/State-Logs sollen nur Benutzeraktionen (Needle, Panels) erfassen, nicht Hintergrund-Retries.

app/modules/capture/index.js & app/modules/doctor/index.js ✅
- Boot- und Resume-Hooks rufen 
efreshCaptureIntake/
enderDoctor mehrfach; stelle sicher, dass [capture] loadIntakeToday start/done nur ausgegeben wird, wenn der Request tats?chlich anl?uft (kein zweites Mal mit identischem Reason).
- Erg?nze Reason-Tags (boot/resume/manual) und dedupe pro Reason.

app/supabase/auth/core.js ✅
- getUserId start/done, conf getConf start/done, [auth] request sbSelect... werden durch parallele Promises doppelt geloggt. F?hre eine in-flight Map ein, die Logs pro Key zusammenfasst (ein Start, ein Done, optional (+N) f?r Re-Runs).

app/core/diag.js ✅
- Implementiere Touchlog-Throttling: wenn dieselbe Message innerhalb weniger Millisekunden erneut auftaucht, erh?he einen Z?hler statt eine neue Zeile hinzuzuf?gen ([capture] loadIntakeToday done ... (x3)).

app/core/diag.js ✅
- central touch‑log renderer. Expand the throttle window (e.g. sliding 3‑5 s per message key), add reason-aware hashing, and support severity tags + per-event IDs so repeats render as (xN) even when spaced apart. Also add a small buffer for “summary” entries (boot done, resume done) that collapse multiple internal steps.

assets/js/main.js ✅
- still orchestrates boot/resume logs. Ensure startBootProcess, runBootPhase, runAuthCheckPhase, and resume handlers emit exactly one “start/end” pair per reason and push a high-level summary instead of step-by-step [ui] step start doctor. Consider moving detailed sub-step logs behind a DEBUG_TOUCHLOG flag.

app/modules/hub/index.js ✅
- hub debug spam ([hub:debug] assistant-chat …). Wrap all diagnostic chatter behind a runtime flag (e.g. AppModules.config?.LOG_HUB_DEBUG). Only user-facing actions (needle click, tab switch) should hit the touch log; retries/auto-setup should write to diag only when failing.

app/modules/capture/index.js & app/modules/doctor/index.js ✅
- they still log every refresh start/done. Add dedupe caches keyed by {reason, day} and emit a single [capture] refresh reason=boot … line with (xN) counters when the same refresh fires again before finishing. Similar treatment for doctor view refresh/render logs.

assets/js/data-local.js & app/supabase/auth/core.js ✅
- we already dedupe concurrent getConf/getUserId, but sequential reads still print each start. Add a per-boot cache: once a key has been read successfully, skip logging further “start” entries unless a new boot/resume cycle begins.

app/supabase/core/http.js ✅
- throttle [auth] request start/end … lines per tag; multiple identical requests inside boot should collapse into a single entry with (+N) plus timing stats. Include failure details only when status≠200.

docs/QA_CHECKS.md & module overview docs ✅
- document the new touch-log expectations (one entry per logical action, duplicates collapsed) so QA can verify the enterprise log criteria.
- roadmap.md (dieser Abschnitt) + docs/QA_CHECKS.md: erg?nze QA-Schritte (Boot einmal, Touchlog durchsichten ? keine Duplikate; Trigger manuelles Refresh ? h?chstens ein Log-Paar pro Reason). Aktualisiere ggf. Module Overviews (Capture, Doctor, Auth, Diagnostics) mit Hinweis auf deterministische Logs.

This pass should leave the touch log with concise, high-level events (boot start/end, auth decision, capture refresh reason, voice gate changes) while detailed retries stay hidden unless explicitly enabled for debugging.

**Codex-Hinweis (Phase 0):**

- 0.2: Nur in bereits existierenden Loggern/Guards und offensichtlichen Workarounds aufräumen (z. B. doppelte `DOMContentLoaded`-Listener, alte `console.log`-Spams). Keine neuen Features einbauen.
- 0.3: Auth-Flow vereinheitlichen, aber **kein** `persistSession` aktivieren; Persistent Login kommt erst in Phase 7.
- 0.4: Nur Voice/Hub-Modul absichern, keine neuen Voice-Features.

---

## Phase 1 – Frontend Voice Controller (DONE)

**Ziel:**
Voice-State-Machine im Hub: Aufnahme → Transcribe → Assistant → TTS → Playback.

Code-Schwerpunkt: `app/modules/hub/index.js` + zugehörige Styles/Skripte.

| Task                       | Status | Beschreibung                                                   |
| -------------------------- | ------ | -------------------------------------------------------------- |
| 1.1 Audio Capture Skeleton | ✅      | MediaRecorder, State-Handling, Blob-Logging.                   |
| 1.2 Transcribe Integration | ✅      | `/midas-transcribe`, `thinking`-State, Transcript-Logging.     |
| 1.3 Assistant Roundtrip    | ✅      | History → `/midas-assistant`; Reply + Actions werden geparst.  |
| 1.4 TTS Playback           | ✅      | `/midas-tts`, `<audio>`-Pipeline inkl. Interrupt/Retry.        |
| 1.5 Glow-Ring Animation    | ✅      | Idle/Listening/Thinking/Speaking/Error → Ring/Aura.            |
| 1.6 Needle Trigger Feedba. | ✅      | Button steuert Session, inkl. Press-Animation.                 |
| 1.7 Auto-stop via VAD      | ✅      | 1 s Stille stoppt Aufnahme (Worklet in `app/modules/hub/vad`). |
| 1.8 Conversation Loop End  | ✅      | Phrasen wie „nein danke“ beenden die Session sauber.           |

---

## Phase 2 – Backend – Supabase Edge Functions (DONE)

**Ziel:**
Stabile KI-Funktionen ohne Browser-Keys.

Code-Schwerpunkt: Supabase Edge Functions unter `supabase/functions/*`.

| Task               | Status | Beschreibung                                                                         |
| ------------------ | ------ | ------------------------------------------------------------------------------------ |
| `midas-transcribe` | ✅      | Whisper (`gpt-4o-transcribe`), FormData Upload, CORS, Logging.                       |
| `midas-assistant`  | ✅      | Responses API, System Prompt, Text & Voice Mode, liefert `{ reply, actions, meta }`. |
| `midas-tts`        | ✅      | `gpt-4o-mini-tts` (Voice „cedar“), liefert Base64 oder Raw Audio.                    |
| `midas-vision`     | ✅      | Foto-Proxy → `gpt-4.1-mini`, liefert Wasser/Salz/Protein + Empfehlung.               |

**Hinweis:**
In `midas-assistant` ist bereits eine feste System-Persona hinterlegt: MIDAS versteht sich als „Medical Incidents and Data Analysis Software“ und persönlicher Gesundheits-Assistent von Stephan (inkl. Voice/Text-Mode-Unterscheidung).  
Später greift diese Persona zusätzlich auf das Health-Profil aus Phase 4.4 zu (d. h. dort wird nur zusätzlicher Kontext + DB-Read ergänzt, keine komplette Neuschreibung).

---

## Phase 3 ? Assistant UI ? Textchat & Fotoanalyse

**Ziel:**
Textchat wird zur prim?ren Assistant-Oberfl?che. Beim ?ffnen des Panels l?dt MIDAS automatisch Intakes und Termine, damit jede Antwort ? inklusive Fotoanalysen ? den Tageskontext kennt. Voice bleibt als Long-Press-Shortcut verf?gbar, ist aber kein Hauptfeature mehr. Speichern findet in dieser Phase nicht statt.

UI-Schwerpunkt: pp/modules/hub/index.js (plus optionale Assistant-Templates/Styles).

| Task | Status | Beschreibung |
| --- | --- | --- |
| **3.1 Assistant Text UI** | ? | Hub-Center-Button (Short Press) ?ffnet ssistant-text. Panel l?dt still die heutigen Intake-Totals und (sobald verf?gbar) die n?chsten Termine, zeigt sie im Header und nutzt /midas-assistant f?r Antworten. |

Für 3.1 brauchen wir im Wesentlichen zwei Stränge: Frontend (Hub/Assistant-Panel) und die bereits vorhandenen Supabase Functions, die Antworten liefern. Hier die Datei- und Aufgabenübersicht:

index.html (Hub-Panel-Markup) ✅
- Panel assistant-text existiert bereits, muss aber um den Butler-Header erweitert werden (Intake-Pills + Termin-Teaser).
- Platz für Suggest/Confirm-Card vorbereiten (auch wenn Phase 5 erst speichert, brauchen wir hier die Slots).

app/modules/hub/index.js ✅
Enthält schon assistantChatCtrl, Buttons, Camera-Flow, Session-Handling.
Anpassungen:
Beim Öffnen des Panels (openPanelHandler('assistant-text')) still Intake- und Termin-Snapshot laden (z. B. via AppModules.capture + späteres Termin-Modul) und im Header speichern.
Neues renderAssistantHeader() das die Werte in DOM schreibt.
Sicherstellen, dass MIDAS_ENDPOINTS.assistant weiterhin genutzt wird, aber Voice-spezifische Teile nur noch beim Long-Press greifen.
Short/Long-Press-Mapping auf den Center-Button umsetzen (derzeit zwei Buttons [data-hub-module="assistant-text"]/assistant-voice).
Logging/diag-Hooks aktualisieren (Phase 0.5 Vorgaben beachten).

app/styles/hub.css / evtl. neue assistant-spezifische CSS ✅
Styles für Butler-Header (Pills + Terminliste), Chat-Bubbles, Buttons.
Responsive Verhalten (Panelbreite, Scroll).

assets/js/data-local.js & vorhandene Intake-Helper ✅
Für den Header brauchen wir einen leichtgewichtigen Helper fetchTodayIntakeTotals() (evtl. bereits in capture-Module) – prüfen, ob wir vorhandene AppModules.capture.refreshCaptureIntake oder AppModules.captureGlobals anzapfen können, ohne zusätzliche Requests zu verursachen.

Termin-Daten (Phase 4 Vorbereitung) ✅
Solange kein Terminmodul existiert, kann ein Platzhalter/Mock (z. B. AppModules.appointments?.getUpcoming(2)) eingebaut werden. Später gegen echte API austauschen.

app/modules/assistant/index.js / actions.js ✅
Falls zusätzliche Helper für Chat-/Fotoanzeige nötig sind (z. B. Formatierungen, Suggest-Card-Rendering), hier kapseln, damit der Hub-Code nicht weiter anwächst.

Supabase Functions (Backend, anderes Repo C:\Users\steph\Projekte\midas-backend\supabase\functions): ✅
midas-assistant/index.ts: Schon vorhanden, liefert { reply, actions, meta }. Für Phase 3.1 genügt Endpunkt wie er ist.
midas-vision/index.ts: Fotoanalyse-Endpunkt; Frontend muss nur Base64-Upload → Response darstellen.

Docs/QA (begleitend) ✅
docs/modules/Assistant Module Overview.md und docs/QA_CHECKS.md später anpassen, sobald UI final ist.
Damit haben wir die Ziel-Dateien und To-dos für 3.1 (reines UI/context building, keine Speichervorgänge) im Blick. Sobald wir loslegen, arbeiten wir nacheinander: Markup → Logic (Hub) → Styles → optionale Helpers → QA/Doku.

| **3.2 Foto-Analyse (UI)** | ? | Kamera/File ? Base64 ? /midas-vision ? Anzeige der Analyse (Wasser/Salz/Protein + Empfehlung) im selben Chat inkl. aktueller Intake-Pills. Reine Darstellung, kein Speichern. |

index.html (Assistant Panel) ✅
Kamera-/Upload-Button existiert schon (#assistantCameraBtn); prüfen, ob wir ein zweites Tool für „Datei wählen“ brauchen oder ob das bestehende Element beides abdeckt.
Platz für Foto-Previews innerhalb des Chatverlaufs einplanen (z. B. spezieller Bubble-Typ mit Thumbnail + Status „Analyse läuft …“).
Optional: kleine Statuszeile in der Suggest-Card reservieren, falls Vision-Empfehlungen dort landen sollen.

app/styles/hub.css ✅
Neue Styles für Foto-Bubbles (Thumbnail, Loading-State, Analyse-Resultbox).
Responsives Verhalten (Thumbnails nicht zu groß, Buttons bleiben klickbar).
Zustände für Fehler/Retry (z. B. rote Border, Hinweistext).

app/modules/hub/index.js
Bestehenden Kamera-Button (assistantChatCtrl.cameraBtn + verstecktes <input type="file">) verdrahten:
Aufnahme → lesen als Base64 (z. B. via FileReader).
Request an /api/midas-vision (bereits vorhandener Endpunkt).
Währenddessen Chat-Eintrag mit „Analyse läuft …“ anzeigen.
Response anzeigen (Texte + Werte), ohne etwas zu speichern.
Fehlerpfad loggen (diag.add('[assistant-vision] …')), UI mit Retry-Option versehen.
Sicherstellen, dass Intake-Pills nicht erneut abgefragt werden (wir nutzen die vorhandenen Snapshot-Helper).

app/modules/assistant/index.js und/oder actions.js
Helfer kapseln, um Vision-Messages in den Chat einzuschieben (z. B. assistantUi.addPhotoMessage({ imageUrl, status, results })).
Falls wir Formatierungen (z. B. „Wasser: 300 ml“) oder Empfehlungstexte brauchen, hier vorbereiten, damit hub/index.js nur die Daten liefert.
Optional: Handler für Suggest-Card-Befüllung, falls Vision später Speicherung triggert (Phase 5).

Hilfsfunktionen / Utilities
Falls noch nicht vorhanden: Base64-Konverter (kann in app/modules/assistant/index.js leben oder als kleiner Helper am Dateiende von hub/index.js).
Timeout-/Abort-Handling (z. B. AbortController) damit Abbrüche sauber laufen.

Backend-Verweis (separates Repo, keine Änderung nötig)
supabase/functions/midas-vision/index.ts bleibt wie er ist; nur sicherstellen, dass wir denselben Endpoint wie Phase 3.1 nutzen (MIDAS_ENDPOINTS.vision).

Dokumentation / QA
docs/modules/Assistant Module Overview.md: Abschnitt „Foto-Analyse“ ergänzen (Flow, erwartete Werte, keine Speicherung).
docs/QA_CHECKS.md: Testfälle aufnehmen (Foto hochladen, Analyse-Ergebnis erscheint im Chat, Fehlerfall zeigt Hinweis).

| **3.3 Diktiermodus (Input only)** | PLANNED | Web Speech API dient als optionaler Eingabehelfer und f?llt nur das Textfeld. Kein Voice-Loop, keine Aktionen. |
| **3.4 Hub Center Mapping** | TODO | Center-Button vereint beide Modi: **Short Press** ?ffnet Text, **Long Press (~700?ms)** startet den bestehenden Voice-Loop (Desktop/Touch identisch, inkl. Cancel bei fr?hem mouseup/	ouchend). |
| **3.5 Butler-Panel Header** | TODO | Kopfbereich zeigt Wasser/Salz/Protein-Pills und die n?chsten 1?2 Termine (read-only). Werte stammen aus bestehenden Tabellen und liefern Kontext f?r jede Antwort. |

> **Hinweis:** Kein Suggest-/Auto-Save in Phase?3. S?mtliche Schreibaktionen werden in Phase?5 umgesetzt.
## Phase 4 – Domain Features & Utilities

**Ziel:**
MIDAS als Alltags-Tool vollständig machen, bevor der Butler & Persistent Login kommen.

### 4.1 Copy Utilities

* **Ziel:** Daten aus Intakes/Doctor/Terminen schnell kopierbar machen (z. B. für Arztbesuch oder Chat).
* UI-Schwerpunkt: Panels, in denen Tages-/Zeitreihen angezeigt werden (z. B. Capture, Doctor, ggf. Intakes).

**Anforderungen:**

* Intake Copy Button im UI (z. B. in Capture/Doctor/Intakes-Ansicht).
* Formate:

  * Menschlich lesbarer Text (für Arzt/Chat/Notizen).
  * Parsebarer Einzeiler, z. B.:  
    `INTAKE|2025-11-28|13:05|water_ml=500|salt_g=2.1|protein_g=52`.

* **Codex-Hinweis:**  
  Nur bestehende Daten lesen und Formatstrings generieren. Keine neue Business-Logik und keine zusätzlichen DB-Tabellen.

---

### 4.2 Vitals & Doctor – Panel-Konsolidierung

**Ziel:**
Nur noch **ein** Hub-Entry für Blutdruck/Körper, aber schneller Einstieg in Arzt-Ansicht **und** Chart.

**Betroffene Module:**

* Hub-Layout (`app/modules/hub/index.js` oder Hub-Konfiguration).
* Vitals-/Body-Input-Panel (Capture/Vitals-Module, z. B. `app/modules/capture/*`).
* Doctor-View (`app/modules/doctor/index.js` + ggf. Charts-Modul).

**Anpassungen:**

* Hub:

  * **Vitals-Orbit-Button** ersetzt die Doppelstruktur Vitals/Doctor am Hub (ein Icon, ein Entry).

* Vitals-Panel:

  * Eingabe Blutdruck (Morgen/Abend).
  * Eingabe Körperdaten.
  * Button **„Arzt-Ansicht“**:

    * nutzt bestehende `requireDoctorUnlock()`-Logik.
    * öffnet Doctor-Ansicht klassisch (Werteliste, Trendpilot, Export, Delete).

  * Button **„Diagramm“**:

    * ebenfalls `requireDoctorUnlock()` nutzen (falls noch nicht freigeschaltet).
    * lädt intern die Doctor-Ansicht, springt aber direkt ins SVG-Chart (z. B. über einen Parameter oder speziellen Initialisierungs-Mode).
    * UX: Klick auf „Diagramm“ → Arzt sieht direkt das Chart.
    * Schließen (`X`) im Chart → zeigt **Doctor-Ansicht** statt Hub (also im medizinischen Kontext bleiben).

* Ziel-Flows:

  * Für den Arzt:

    * „Einzelwerte ansehen?“ → Button „Arzt-Ansicht“.
    * „Nur Verlauf/Chart?“ → Button „Diagramm“.

  * Beide Wege landen im gleichen „medizinischen Raum“, nur mit unterschiedlichem Einstiegspunkt.

**Codex-Hinweis:**

- Keine neue Tabelle, keine neuen Supabase-Funktionen.
- Nur Routing/Umschalten der bestehenden Panels und Views umbauen.

---

### 4.3 Termin- & Arztmodul (Termine + Übersicht)

**Ziel:**
Eigenständiges Terminmodul mit Eingabemaske und Übersicht, angelehnt an Doctor-UI, ohne den Hub zu überladen.

**Backend:**

* Neue Supabase-Tabelle, z. B. `appointments`:

  * `id`
  * `user_id`
  * `date` (oder `date + time`)
  * `title`
  * `type` (Privat / Arzttermin / Geburtstag / …)
  * `location` (optional)
  * `note` (optional)
  * `created_at`, `updated_at`

* RLS: wie bei anderen user-basierten Tabellen (nur eigener User sieht eigene Termine).

**Frontend:**

* **Termin-Eingabe-Panel (Orbit-Button „Termine“):**

  * Felder:

    * Datum
    * Uhrzeit
    * Titel
    * Typ (Privat / Arzttermin / Geburtstag / …)
    * Ort (optional)
    * Notiz (optional)

  * Button **„Termin speichern“** → schreibt in `appointments`.

  * Unterhalb der Maske:

    * Anzeige der nächsten **1–2 anstehenden Termine**
      (z. B. „So 08:30 – Geburtstag“, „Mo 09:00 – Nephro“).
    * Button **„Terminübersicht öffnen“** → öffnet Listenansicht.

* **Terminübersicht-Panel (Doctor-Style):**

  * Drei-Spalten-Layout:

    1. **Spalte 1:**
       * Datum
       * Uhrzeit
       * Lösch-Button

    2. **Spalte 2:**
       * Titel
       * Typ
       * Ort
       * (später) Alarm/Reminder-Info

    3. **Spalte 3 (optional):**
       * Notizen

  * Optional: Von/Bis-Filter ähnlich Doctor-Ansicht (für später).

* **Voice- und KI-Integration (Vorbereitung):**

  * Voice-/Text-Queries (Phase 5+), z. B.:

    * „Wann ist mein nächster Termin?“
    * „Zeig mir meine Arzttermine.“

  * `DoctorRouting`:

    * Deep Links in Maps/Telefon/Notizen für Arzttermine, abgesichert über bestehende Unlocks/Biometrie (nur Vorplanung, Umsetzung kann später kommen).

  * Assistant-Panel:

    * liefert dieselben Termin-Daten an den Butler-Header (Phase 3) und an Kontext-Abfragen des Textchats.

---

### 4.4 Health-Profil & Persona Layer (Supabase)

**Ziel:**
Stephan-spezifische Gesundheitsdaten und Limits zentral in Supabase halten, statt sie hart in Prompts zu kodieren.

**Supabase-Tabelle (z. B. `user_health_profile`):**

* Primärschlüssel via `user_id` (1:1-Beziehung zu Benutzer).
* Felder:

  * Fixdaten:

    * `birth_date`
    * `height_cm`
    * `sex` (falls benötigt)
    * evtl. `smoker_status` o. ä.

  * CKD/Diagnose-Status:

    * `ckd_stage` (z. B. `"G3a1"`)
    * Weitere relevante Diagnosen (Hypertonie, Dyslipidämie, etc.) als Flags/Felder.

  * Intake-Grenzen:

    * `salt_limit_g_per_day`
    * `protein_target_g_per_day_min`
    * `protein_target_g_per_day_max`
    * `water_target_ml_per_day` (optional)

  * Metadaten:

    * `updated_at`
    * `source` (z. B. „Nephro 2025-01“, „Eigenanpassung“)

**Verwendung in Edge Functions:**

* `midas-assistant`:

  * liest Health-Profil per `user_id` (aus Supabase Session / JWT).
  * injiziert Health-Kontext als **zusätzlichen System-Block** vor den Chat-Messages, z. B.:  
    „Stephan hat CKD G3a1, Salzlimit 5–6 g/Tag, Nichtraucher. Passe Empfehlungen entsprechend an und sei konservativ bei Salz-/Proteinvorschlägen.“

* `midas-vision`:

  * nutzt Health-Profil, um Foto-Empfehlungen zu contextualisieren (z. B. Hinweis bei hoher Salzlast).

**UI-Anbindung (später, minimal):**

* Einfaches Profil-Panel:

  * Eingabe/Änderung von CKD-Status, Limits, Lifestyle-Flags.
  * Jede Änderung erzeugt optional einen Eintrag in System-Notes (Audit).

**Vorteile:**

* Assistant muss Health-Kontext nicht in jedem Prompt neu erklärt bekommen.
* Änderungen (z. B. G3a1 → G3a2) sind mit einem Datensatz-Update erledigt.
* Voice & Text greifen auf denselben, sauberen Persona-/Health-Layer zu.

**Codex-Hinweis:**

- In dieser Phase nur Tabellen + Edge Function-Kontext erweitern.
- Keine neuen großen UI-Bereiche bauen – ein einfaches Profil-Panel reicht.

### .4 Hybrid Panel Animation (Hub Performance Mode)

Ziel:
Die Hub-Panels werden für Mobile/Tablet (Performance Mode) und Desktop (cineastisch, aber leicht) optimiert.
Basierend auf der eigenen „Panel Animation Performance Roadmap“.

Inhalt:
Neue Mobile Keyframes (zoom-in-mobile, zoom-out-mobile) – nur opacity + transform.
Media Query <1025px mit Overrides:
kein backdrop-filter auf Mobile
leichtere Panel-Shadows
neue Animationen nur für Mobile
vereinfachter Orbit/Aura-Effekt bei offenen Panels
Desktop ≥1025px:
cineastische Animation mit reduzierten Keyframes (Squash-Grow), ohne Shadow-Animation
Glow/Elevation via transition statt Keyframes
Panel-Open/Close über neue Desktop-Keyframes (zoom-in-desktop, zoom-out-desktop)
Zielwirkung:
Mobile: ultrasmooth & performant für Alltag
Desktop: edel, aber ohne teure Shadow-Repaints

---

## Phase 5 ? Actions & Flows ? Butler Layer

**Ziel:**
Aus dem beratenden Assistant wird ein Butler, der nach einer klaren "Ja/Nein"-Best?tigung Intakes (und sp?ter weitere Module) aktualisieren kann. Textchat bleibt der Hauptpfad, Voice nutzt dieselben Hooks via Long-Press. Alle ?nderungen laufen ?ber erlaubte Actions und einen gemeinsamen Confirm-Layer. 

---

### 5.1 Suggest & Confirm Layer

1. **Kontext bauen:** Beim ?ffnen des Panels l?dt Phase?3 bereits Intakes + Termine; Phase?5 erg?nzt eine Helper-API (ssistantSuggestStore o.??.), die den Snapshot f?r jede Antwort vorh?lt.
2. **Analyse:** Foto/Text landen bei /midas-vision bzw. /midas-assistant und liefern suggestIntake-Payloads (Wasser/Salz/Protein).
3. **UI-Card:** Ein wiederverwendbarer Block im Assistant-Panel zeigt ?gesch?tzte Werte? + Frage ?Soll ich das speichern??. Buttons/Tasten: **Ja** / **Nein** (plus optional Voice-Best?tigung).
4. **Confirm:**
   - Ja ? ruft IntakeSave (Allowed Action) mit Payload auf, aktualisiert lokale Header-Werte und protokolliert im Touch-Log.
   - Nein ? verwirft Suggestion, Option ?Nochmals analysieren??.
5. **Follow-up:** Nach erfolgreichem Save fragt der Butler: ?Willst du eine Empfehlung f?r den restlichen Tag?? ? Ja = generiert Text basierend auf Uhrzeit, Intakes und Terminen.

### 5.2 Allowed Actions & Guard Rails

* Whitelist bleibt bestehen (IntakeSave, OpenModule, ShowIntakeStatus, ?), aber wird nun zentral von executeAllowedAction() orchestriert ? unabh?ngig davon, ob der Trigger aus Text oder Voice kommt.
* Jede Aktion loggt in diag/touch-log, pr?ft Auth/Stage und bricht sauber ab, wenn der Gate (Phase?0/3) nicht ready ist.
* Keine Intent Engine n?tig: Textchat ruft Actions direkt nach best?tigten Buttons auf; Voice-Loop mappt nur Long-Press ? ??ffne Chat? oder ?best?tige Suggestion?.

### 5.3 Kontextuelle Empfehlungen

* Nach jedem Save werden Intakes + Termine aktualisiert und k?nnen als Mini-Report (z.?B. ?Noch 1,2?L Wasser ?brig, morgen Termin um 09:00?) ausgegeben werden.
* Ein generateDayPlan()-Helper b?ndelt Uhrzeit, Termine und Limits (aus Phase?4.4) und liefert Vorschl?ge/Warnings.
* Diese Antworten bleiben textbasiert; Voice liest sie lediglich vor, falls aktiv.

### 5.4 Optionaler Voice-Handschlag

* Long-Press kann weiterhin eine kurze Voice-Aufnahme starten, aber statt einer separaten Intent Engine wird das Ergebnis wie ein normaler Chat-Input behandelt (z.?B. ?Trag 300 ml Wasser ein? ? erscheint im Chat, Assistant antwortet und erzeugt eine Suggest-Card).
* Keine Always-On-Experimente, kein Streaming ? Voice ist nur eine bequeme Eingabehilfe, die die gleichen Confirm-Regeln respektiert.

> **Zusammenfassung:** Phase?5 konzentriert sich auf den zuverl?ssigen Suggest/Confirm-Pfad und den kontrollierten Einsatz von Allowed Actions. Voice bleibt sekund?r und nutzt exakt dieselben Mechanismen wie der Textchat.
## Phase 6 – Deep Cleanup & Refactor

**Ziel:**
Wenn alle Kernfeatures stehen, Code so aufräumen, dass er langfristig wartbar bleibt.

**Schwerpunkte:**

* Logger konsolidieren (`diag`, `touch-log`, `console`):

  * vereinheitlichte Logging-API, z. B. `diag.log/info/warn/error`.
  * Überflüssige `console.log`-Spuren aus Produktivcode entfernen (nur gezielte Debug-Punkte lassen).

* State-Layer weiter entschlacken (`/core/state`, Guards, Flags):

  * Überflüssige Flags entfernen.
  * Doppelte State-Pfade zusammenführen.
  * Guards dokumentieren (kurz: „wogegen schützt dieser Guard?“).

* Toter Code, verwaiste Helper, alte Experimente entfernen:

  * Nur klar identifizierbare Leichen – der systematische Scan kommt in Phase 6.5.

* Modul-Schnittstellen schärfen:

  * Public/Private-Exports in Kernmodulen dokumentieren (kurzer Header-Kommentar).
  * Unnötige Exports entfernen.

* Kommentare minimal, aber gezielt mit `// [anchor:...]` als Update-Marker.

**Codex-Hinweis:**

- In dieser Phase explizit **kein** neues Feature bauen.
- Fokus: Lesbarkeit, Konsistenz, kleinere Refactors.

---

## Phase 6.5 – Repo Audit & Dead Code Removal

**Ziel:**
Kompletten Codebaum systematisch auf Altlasten prüfen und verschlanken, bevor Persistent Login, PWA und TWA kommen.

**Inhalt:**

* Vollständiger Repo-Scan (Ordner für Ordner) mit Fokus auf:

  * ungenutzte Dateien (nie importiert / nie referenziert)
  * ungenutzte Funktionen, Konstanten, Helpers
  * verwaiste Imports
  * alte Prototypen und Monolith-Reste
  * doppelte Utilities / Duplikate
  * Debug-Fragmente, alte Test-Routen
  * dead paths (If-Zweige/Branches, die nie mehr ausgeführt werden)

* Ergebnis: Klassifizierung pro Datei/Funktion:

  * **A – Aktiv:** produktiv genutzt, bleibt.
  * **B – Fraglich:** verdächtig, aber evtl. noch referenziert → markieren.
  * **C – Tot:** sicher löschbar (keine Referenzen, kein Pfad, kein Import).

**Methode (für Codex):**

* Spezieller „Repo Audit“-Prompt:

  * Keine automatischen Codeänderungen.
  * Nur Analyse & Bericht erstellen.
  * Ordnerstruktur durchgehen (z. B. `/core`, `/modules/*`, `/app/styles`, Edge Functions).
  * Pro Ordner eine Liste erstellen, Dateien als A/B/C markieren.
  * Refactor-/Lösch-Empfehlungen formulieren.

**Output:**

* `REPO_AUDIT.md` mit:

  * Auflistung aller Ordner/Dateien.
  * A/B/C-Klassifizierung.
  * Liste „Safe to delete“.
  * Liste „Kandidat für Zusammenlegung/Refactor“.
  * Hinweisen auf doppelte Muster (z. B. ähnliche Helpers in mehreren Modulen).

**Warum vor Phase 7–9:**

* Persistent Login (Phase 7) profitiert von:

  * weniger alten Auth-/Guard-Resten.
  * weniger versteckten Event-Handlern.
  * weniger Seiteneffekten aus alten Flows.

* PWA/TWA (Phase 8/9) profitieren von:

  * schlankeren Bundles.
  * weniger unnötigen Assets.
  * klareren Caching-Grenzen.

---

## Phase 7 – Session & Performance Layer (Persistent Login)

**Ziel:**
Stabile Sessions und gutes Startverhalten im Browser – Vorbereitung für PWA/TWA.

**Code-Schwerpunkt:**  
`app/supabase/auth/core.js`, Bootflow (`boot-flow.js`, `main.js`), Guards im UI.

| Task                      | Status | Beschreibung                                                                                                                                                                                   |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 Persistent Login Mode | TODO   | `persistSession: true`, Silent Refresh für Google OAuth, Session Restore beim Boot. App öffnet eingeloggt, sofern Session gültig – ohne erzwungenen Re-Login.                                  |
| 7.2 Session/Guard QA Pass | TODO   | Sicherstellen, dass `authState`, Guards und Doctor-Unlock deterministisch sind (kein „missing session“, kein Doppel-Login). Resume-/Background-Flow definieren (Tab-Wechsel, Reload, Timeout). |
| 7.3 Performance Pass      | TODO   | Nicht-kritische Module lazy laden. Charts/Vision/Doctor/Trendpilot erst nach Idle oder on-demand booten. Ziel: schneller First Paint, „fühlt sich wie native App an“.                          |

### 7.4 Wearable/Remote API Readiness

**Ziel:**
MIDAS so vorbereiten, dass spätere Wearables (DIY-Watch, AR-Brille, Kommunikator) sich wie ein schlanker Remote-Client verhalten können, ohne die App-Architektur umzubauen.

**Backend-Konzept:**

* Definierte, schmale Endpunkte (z. B. als neue Edge Function oder API-Route):

  * `GET /api/midas-remote-status` → kompakter Snapshot:

    * heutige Intakes (Summen Wasser/Salz/Protein),
    * nächster Termin,
    * kurzer Health-Profil-Auszug.

  * `POST /api/midas-remote-intake` → einfacher Intake-Write:

    * Payload nur mit Basisfeldern (`water_ml`, `protein_g`, `salt_g`, `timestamp`).

  * `GET /api/midas-remote-ping` → Healthcheck/Version für Client.

* Auth:

  * token-basiert (z. B. Device-Token oder API-Key, gebunden an Stephans Account).
  * Kein vollständiger OAuth-Flow am Wearable.

**Verwendung:**

* Externe Clients (z. B. DIY-Uhr) können:

  * aktuellen Intake-Status abfragen („wie weit bin ich heute?“),
  * kleine Intakes eintragen („+20 g Protein“, „+300 ml Wasser“),
  * später Termine anzeigen („nächster Arzttermin“).

**Abgrenzung:**

* Keine KI direkt im Wearable – weiterhin über Edge Functions.
* Kein neues UI in MIDAS selbst in dieser Phase, nur API-Schicht + Doku (`Wearable_API.md`).

---

## Phase 8 – PWA Packaging

**Ziel:**
MIDAS als saubere Progressive Web App bereitstellen – installierbar auf Desktop/Android mit Offline-Grundfunktionalität.

**Files:**  
`manifest.json`, `sw.js`, evtl. PWA-spezifische Notes.

### 8.1 Manifest

* `manifest.json`:

  * `name`, `short_name`, `description`
  * `start_url`, `scope`
  * `display: "standalone"`
  * `theme_color`, `background_color`
  * Icons (mind. 192x192, 512x512)

### 8.2 Service Worker – Basis

* `sw.js`:

  * Install/Activate Events
  * Caching für statische Assets (`app.css`, JS, Icons)
  * Optionale Offline-Fallback-Seite

### 8.3 Caching-Strategie

* `cache-first` für statische Ressourcen
* `network-first` für Supabase/API-Calls
* Cache-Versionierung (z. B. `midas-static-v1`)
* Bewusst: keine sensiblen API-Responses cachen

### 8.4 Installability & UX

* Lighthouse-Check (PWA-Kriterien).
* Optionaler „Installieren“-Hinweis im Hub, wenn `beforeinstallprompt` möglich.
* Tests:

  * Chrome/Edge Desktop
  * Chrome Android (Add to Home Screen)

### 8.5 PWA QA

* Online/Offline-Tests
* App-Start im Offline-Modus
* Verhalten bei Reload im Offline-Zustand
* Dokumentation in `PWA_NOTES.md` (z. B. „Ohne Internet kein KI-Assistant“).

### 8.6 Push-Reminder (Vorbereitung)

**Ziel:**
PWA/Service Worker so vorbereiten, dass später Web-Push für Wasser-/Intake-/Termin-Reminder möglich ist.

* Konzept für Web-Push-Benachrichtigungen:

  * Wasser-/Intake-Reminder.
  * Termin-Erinnerungen (z. B. „Übermorgen Nephro um 09:00“).

* Technische Vorbereitung:

  * Klären, wie Push im Backend angebunden wird (eigener Push-Service oder Browser-Push).
  * Sicherstellen, dass Notifications so gestaltet sind, dass spätere Wearables sie als System-Notifications mitnutzen können (Uhr liest Handy-Notifications).

> Umsetzung der Push-Logik (Zeitpläne, CRON, Notification-Texte) kann später in eine eigene Phase ausgelagert werden; hier geht es primär um PWA-Readiness für Push.

---

## Phase 9 – TWA Packaging (Android-App-Hülle)

**Ziel:**
MIDAS als Trusted Web Activity für Android bereitstellen, auf Basis der stabilen PWA.

### 9.1 TWA-Projekt

* Bubblewrap oder Android Studio TWA-Projekt erstellen.
* Package-Name festlegen (z. B. `at.schabuss.midas`).
* App-Namen, Icons, Orientation, Theme konfigurieren.

### 9.2 Asset Links / Vertrauensanker

* `assetlinks.json` unter `/.well-known/assetlinks.json` auf deiner Domain.
* TWA so konfigurieren, dass nur deine Origin genutzt wird.

### 9.3 Android Manifest (TWA)

* TWA Activity:

  * Launch-URL = PWA-Start-URL
  * MAIN/LAUNCHER Intent
  * Orientation, Theme

### 9.4 Build & Signing

* Release-Build (AAB/APK) erstellen.
* Keystore anlegen oder bestehenden verwenden, dokumentieren.
* Versionierung (SemVer + Buildnummer) pflegen.

### 9.5 Device-Tests

* Echtes Android-Gerät:

  * Kaltstart/Warmstart
  * Back-Button-Verhalten
  * Offline-Verhalten (zusammen mit Phase 8)
  * Voice/Mic-Freigabe im TWA-Kontext

### 9.6 Play Store (optional)

* Listing (Titel, Beschreibung, Screenshots, Icon).
* Datenschutzangaben (Supabase/OpenAI/Cloud).
* Interner Test-Track (auch wenn du einziger Nutzer bist).

---

## Laufende Leitplanken

* Jede Phase = eigener Branch + Commit-Gruppe mit:

  * Kurzbeschreibung
  * CHANGELOG-Update
  * Mini-QA (Smoke Tests)

* Feature-Flags für Assistant/Voice beibehalten, um bei Bedarf schnell deaktivieren zu können.

* KI-nahe Module (`voice-intent.js`, Assistant-Panel, Edge-Functions) möglichst gekapselt halten, damit Codex-Refactors nicht in Boot/Auth/Session eingreifen.

* **Text-Assistant bleibt der primäre Interaktionsmodus** (Analyse, Foodcoach, Vorschläge); der Voice-Butler ist ein ergänzender Hands-free-Kanal für Shortcuts, Status & einfache Intakes.

---
