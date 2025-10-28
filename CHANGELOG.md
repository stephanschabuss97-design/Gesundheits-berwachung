[CHANGELOG.md](https://github.com/user-attachments/files/23197047/CHANGELOG.md)
## v1.7.5.7 (PATCH)

Added:
- Koerper-Chart erhaelt eigene Farbcodes pro Serie (Gewicht Indigo-Soft, Bauchumfang Grau, Muskel Accent-Blau, Fett Ocker) inklusive abgestimmter Legend-/Tooltip-Stile.
- Chart-Control-Bar nutzt nun Surface-Layer mit besserem Kontrast und Hover-States gemaess Design Guide.

Changed:
- Gewicht-/Koerper-Metrik verwendet eine dynamische "tight" Y-Skalierung (mindestens 6 Einheiten Range) statt 0-110 Fixbereich; Zielbaender bleiben unveraendert.
- Capture-Savebuttons stehen linksbuendig, wirken dezenter (weniger Brightness) und doppelte Zwischenueberschriften in Koerper/Intake-Accordion wurden entfernt.
- Arzttermine-Panel richtet Save/Done-Buttons gleich breit untereinander aus; Meta-Zeilen folgen dem neuen Layer-Layout.

Notes:
- Reine UI-Anpassungen (CSS + bestehende JS-Hooks); Datenmodelle, Realtime und Speicherroutinen bleiben unveraendert.

## v1.7.5.6 (PATCH)

Added:
- Chart-Tooltip mit Fade (150/100 ms) und ruhigem Hintergrund.
- BP-Zielb�nder (Sys 110-130, Dia 70-85) als halbtransparente Fl�chen.

Changed:
- Serienfarben konsolidiert (Accent-Blau, Muted-Lila, Dia-Rot, Bars in Accent/Grau).
- Chart-Refresh animiert (0.48 s Translation/Fade) statt harter Spr�nge.
- Legende/Hover setzen Brightness 1.12 statt dicker Linienst�rke.

Notes:
- Nur CSS/JS leichte Anpassungen; keine Rechenlogik ge�ndert.

## v1.7.5.5 (PATCH)

Added:
- Header/Tabs erhalten Scroll-Indikator (is-elevated Shadow) und aktive Tab-Markierung mit Unterstrich.
- Panel-Flash Animation (0.45s) f�r Save-Feedback via flashButtonOk.

Changed:
- Navigation Buttons: Ghost/Primary-Staaten verfeinert, aria-current wird gesetzt.
- Tabs erhalten helleres Accent-Band statt Vollfl�che.

Notes:
- Funktional unver�ndert; Scroll-Listener rein CSS/JS-light.

## v1.7.5.4 (PATCH)

Added:
- Globale Button-Styles nach MIDAS (40px, Radius 8px, Fokus-Ring #3A3DFF).
- Formularfelder erhalten Guide-Palette (Layer, Placeholder, Fokus-Glow).

Changed:
- Accordions nutzen weiche Motion (200 ms ease-out, Chevron-Rotation).
- Tabs erhalten neues Ghost/Primary-Design inkl. Hover-/Focus-Staaten.
- Panel-Save-Zonen sind einheitlich rechts ausgerichtet.

Notes:
- Reine CSS-Anpassungen; keine Funktions-/DOM-�nderungen.

## v1.7.5.3 (PATCH)

Added:
- MIDAS Design Tokens (Farbpalette, Border-Subtle, 24px Vertical Rhythm) eingef�hrt.
- Capture-Panel (#cap-intake-wrap) auf Guide-Struktur gehoben (Titel/Divider/Save-Zone, neue Pills).

Changed:
- Karten (.card, .card-nested) nutzen einheitlichen Radius 8px, Layer2-Farben und weiche Schatten.
- Capture-Inputs mit Fokus-Glow #3A3DFF, Platzhalterfarbton gem�� Guide.

Fixed:
- Layout der Capture-Save-Zone bleibt stabil (Buttons rechts, konsistentes Grid).

Notes:
- Version auf V1.7.5.3 hochgezogen; keine Funktions�nderungen.

## v1.7.5.2 (PATCH)

Added:
- PIN-Speicher verwendet nun PBKDF2 (SHA-256, 120000 Iterationen) mit 16-Byte-Salt pro Geraet.
- Automatische Migration alter SHA-256 PIN-Hashes beim ersten erfolgreichen Entsperren.
- Login-Overlay merkt Benutzer-Eingaben fuer REST-Endpoint/ANON-Key und bewahrt sie bei Fensterwechsel.
- Supabase-Advisor: Funktionsearchpath fixiert (set_current_timestamp_updated_at, upsert_intake).

Changed:
- `setPinInteractive` speichert Salt/Hash/Iteration separat (`lock_pin_salt`, `lock_pin_kdf`, `lock_pin_iter`); Legacy-Schluessel wird auf null gesetzt.
- `unlockWithPin` prueft PBKDF2 und migriert Legacy-Hashes transparent.
- Content-Security-Policy fuer Inline-Skripte auf pragmatische Option C zurueckgestellt (`script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'`); Realtime (https/wss *.supabase.co) und SRI bleiben aktiv.
- RLS-Policies (user_profile/health_events/appointments) nutzen nun (select auth.uid()) fuer InitPlan-Optimierung.

Fixed:
- Realtime-Websockets (wss://*.supabase.co) explizit in der CSP erlaubt.
- Konfigurationsformular verliert Eingaben nicht mehr beim Fenster-/Tabwechsel.

Notes:
- Inline-Skripte bleiben bewusst inline; weitergehende CSP-Haertung (Nonces/Externalisierung) ist nach dem Feature-Freeze vorgesehen.
- OTP/Passwort-Provider deaktiviert (Google OAuth only); Postgres-Update v17.6.1.025 geplant.\n- Capture-Tab aktualisiert IntakeTotals sofort nach health_events Realtime-Events.

## v1.7.5.1 (PATCH)

Removed:
- Hartkodierte Supabase-Defaults (URL/ANON-Key); Konfiguration nur noch ueber Overlay.

Added:
- jsDelivr SRI + crossorigin fuer Supabase UMD-Script.

Changed:
- `DEV_ALLOW_DEFAULTS` akzeptiert ausschliesslich localhost/127.0.0.1/*.local; Query-/LocalStorage-Schalter entfernt.
- Dialog-/UI-Strings von Kodierungsartefakten bereinigt.

Notes:
- `ensureSupabaseClient` blockt service_role Keys und meldet Config-Fehler im Overlay; App-Verhalten ansonsten unveraendert.
## v1.7.5 (PATCH)

Added:
- Chart (Koerper): Interaktive Muskel-/Fettbalken (Hit-Zone je Tag) mit Tooltip, Tastaturfokus und Legend-Highlight; sanfte Hover-/Click-Animationen.
- Chart (allgemein): Serien mit `data-series`-Keys ermoeglichen synchrones Highlight von Linie/Punkten/Bars und Legende.

Changed:
- Arzt-Ansicht: Standard-Sortierung auf absteigend (neuester Tag oben). Scroll-Position bleibt bei Refresh/Range-Apply/Entsperren erhalten.
- Capture � Koerper: Nach Speichern werden Eingabefelder geleert; optionales Log `[body] cleared`. Prefill bleibt bei Datum-Wechsel erhalten.
- Chart (Koerper): Kompositionsbalken sind klick-/fokussierbar und verhalten sich analog zu BP-Flag-Overlays. Hover dimmt andere Serien.

Fixed:
- Arzt-Ansicht: Scroll-Snapshot am korrekten Scroll-Container `#doctorDailyWrap` angebunden (zuvor am falschen Node).

Notes:
- `joinViewsToDaily()` liefert Tagesobjekte nun newest-first; die Chart-Flattening-Logik sortiert intern fuer die X-Achse aufsteigend.

## v1.7.5 (docs addendum)

Docs:
- Structural annotations in index v1.7.5.html: MODULE/SUBMODULE headers, @extract-candidate markers, and FUTURE placeholders block.
- No functional changes; serves refactor navigation only.

## v1.7.4 (PATCH)

Changed:
- Vereinheitlichung auf Day-basierte Logik: Legacy-Fallback patcht Intake via `day=eq`, Timestamp wird auf lokales Mitternacht (Europe/Vienna) gesetzt.
- `loadIntakeToday()` final via `day=eq`.

Notes:
- Reset-Flow: 1× pro Tag, ausgelöst bei Mitternacht/erstem Resume; Logs: `[capture] reset intake start/end`.

## v1.7.3.9 (PATCH)

Changed:
- Stabilisierung und Logs; keine funktionalen Änderungen für Endnutzer.

## v1.7.3.8 (PATCH)

Changed:
- `loadIntakeToday()` liest Intake über `day=eq.<YYYY-MM-DD>` statt Zeitfenster auf `ts`.

## v1.7.3.7 (PATCH)

Added:
- RPC `public.upsert_intake(day, water_ml, salt_g, protein_g)` (RLS, Unique-Index-Konfliktbehandlung, return=representation).
- Client-Helper `saveIntakeTotalsRpc` nutzt RPC atomar (genau 1 Request pro Save) inkl. Logging.
- Einmaliger Fallback (404/405) auf Legacy POST→PATCH mit Log `[capture] rpc missing, fallback to legacy`.
- Tages-Reset-Hook: setzt Intake-Totals beim Tageswechsel automatisch auf 0 (einmal/Tag, lokal gesteuert), Fire-and-Forget.

## v1.7.3.6 (PATCH)

Added/Changed:
- Auth-Robustheit: Soft-Timeouts (UID/Headers/Request) + Header-Cache Fallback; Save/Refresh blockieren nicht mehr nach Resume.
- UI-Refresh: Mutex/Queue + Zeitlimit pro Sub-Step, Start/End-Logging.
- Capture-Saves: Entkoppelt,  save network ok  sofort nach Request, Busy-State im finally.

## v1.7.3.5 (PATCH)

Added:
- Diagnostik an Save-Pipeline-Stationen (getConf/getUserId/fetch start) zur Ursachenanalyse.

## v1.7.3.4 (PATCH)

Changed:
- Resume-Refresh entkoppelt (fire-and-forget) und Reihenfolge beibehalten (Day-Refresh ? UI-Refresh).

## v1.7.3.3 (PATCH)

Changed:
- requestUiRefresh mit Mutex/Timeouts/Always-resolve; per-Step Logging doctor/appointments/lifestyle/chart.

## v1.7.3.2 (PATCH)

Changed:
- Save-Flows entkoppelt (kein Await auf requestUiRefresh); Busy-State sicher im finally.

## v1.7.3.1 (PATCH)

Added:
- fetchWithAuth-Wrapper (401/403-Refresh 1x, 5xx-Retry begrenzt) und Umstellung der Save-Routinen.

## v1.7.3 (PATCH)

Added/Changed:
- Supabase-Setup: Dev-Defaults nur noch in lokalen Umgebungen; Login-Overlay enthaelt Felder fuer REST-Endpoint & ANON-Key inkl. Validierung.
- Termin-Badge: Grace-Zeit fuer vergangene Termine, konsistente Europe/Vienna Formatierung und robustere Next/Last-Auswahl.
- Fehlerfeedback: Einheitliche REST-Fehlermeldungen (401/403/409/422/5xx) mit klaren Nutzerhinweisen.

## v1.7.2 (PATCH)

Changed:
- Dialoge & Overlays: Fokusfalle mit Rueckfokus, `aria-modal` und Hintergrund-Inertisierung fuer Hilfe-, Log- und Chart-Panels sowie Login/App-Lock.
- Live-Regionen: Intake-Status und Termin-Badge Updates sind entprellt (debounce), Ansagen wurden konsistenter formuliert.
- Tastatur-UX: ESC schliesst nun priorisiert (Chart → Hilfe → Log → App-Lock → Login); Capture-Header behält die Tab-Reihenfolge Datum → Pills → Akkordeons.
- Dialog/Overlays: Korrekte A11y-Dialogbehandlung mit Fokusfalle und Rueckfokus; Hintergrund wird waehrend geoeffneter Dialoge per `inert` + `aria-hidden` unzugaenglich.
- Live-Regionen: Intake-Status und Termin-Badge Updates werden nun entprellt (debounce), um Screenreader-Ansagen zu reduzieren; Texte konsistent formuliert.
- Keyboard-UX: Einheitliches ESC-Verhalten schliesst zunaechst Panels (Chart/Help/Diag), danach Overlays (App-Lock/Login). Tab-Reihenfolge im Capture-Header bleibt Date → Pills → Akkordeons.

Fixed:
- Login-Overlay und Touch-Log liesen sich nicht mehr anzeigen; Fokusfalle + Inert-Reset korrigiert das Overlay-Verhalten (Login/App-Lock/Diag).

## v1.7.1 (PATCH)

Changed:
- Diagramm: drawChart-Telemetrie wird nur noch alle 25 Aufrufe ins Diagnose-Log geschrieben (p50/p90/p95), um Log-Spam zu vermeiden.
- Capture: Tastatur-Shortcuts (Enter/Escape) fuer BP-, Koerper- und Flags-Panels sind global aktiv (addCapturePanelKeys in main gebunden).
- Flags-UI: Markup nutzt direkt `proteinHighToggle`; die Legacy-Runtime-Migration von `sugarHighToggle` wurde entfernt.

Fixed:
- SQL: Doppelte Definition der View `v_events_day_flags` in `01_Health Schema.sql` entfernt (eine create or replace-Definition bleibt bestehen).

## v1.7.0 (RELEASE)

Changed:
- Abschluss-Integrationspass: Intake-Header und Arzttermin-Badge besitzen konsistente ARIA-Labels, Live-Regionen und sind fokussierbar.
- Tooltip im Diagramm (Darkmode) erhält höhere Lesbarkeit; KPI-Dots sind größer und mit Glow versehen.
- Feature-Flag `SHOW_BODY_COMP_BARS` steuert Muskel-/Fettbalken im Körper-Chart.
- Header-Telemetrie erfasst p50/p90/p95 für Intake- und Termin-Updates; Diagnoselog meldet Schwellen regelmäßig.
- Flags-Overlay bleiben exklusiv im Blutdruck-Chart; Fallback „Kein Termin geplant“ finalisiert.

## v1.6.9 (PATCH)

Added:
- ARIA-Optimierung für Intake-Pills (Statusgruppe, Screenreader-Texte) und Arzttermin-Badge.
- Fokusreihenfolge Date-Input → Intake-Zeile → Akkordeons.

Changed:
- Tooltip-Hintergrund in Darkmode mit besserem Kontrast; KPI-Dots minimal größer.
- Header-Refresh misst Laufzeit und schreibt Telemetrie in `perfStats`.

## v1.6.8 (PATCH)

Added:
- Körper-Chart: Muskel- und Fettmasse werden als Balken (kg) gerendert; optional deaktivierbar.

Changed:
- Flag-Overlay entfällt im Körper-Chart, bleibt für Blutdruck aktiv.

## v1.6.7 (PATCH)

Added:
- Capture „Körper“: Eingabefelder für Prozent Fett/Muskel inkl. Validierung.

Changed:
- Fetch/Views liefern `fat_pct`, `muscle_pct`, `fat_kg`, `muscle_kg`; Arzt-Ansicht zeigt Werte.

## v1.6.6 (PATCH)

Added:
- Backend-View `v_events_body` erweitert um Kompositionswerte (`fat_kg`, `muscle_kg`).

Changed:
- RLS/Indices geprüft; Body-Daten stehen dem Client als kg-Werte bereit.

## v1.6.5 (PATCH)

Added:
- BP-Kontext schaltet automatisch: 00:00 → Morgens, 12:05 → Abends inkl. User-Override.

Changed:
- Visibility-/Timer-Hooks synchronisieren Datum, Kontext und Intake.

## v1.6.4 (PATCH)

Added:
- Intake-Pills & Arzttermin-Badge im Capture-Header (Zeitzone Europe/Vienna, Live-Updates).

Changed:
- Header-Layout: Pills vor Termin, mobiler Umbruch.

## v1.6.0 (MINOR)

Added:
- Capture-Panel „Arzttermine“ für sechs Rollen mit PATCH-first-Workflow und Realtime-Updates.
- Accessibility: aria-live Feedback, Done-Button konditional.

Changed:
- Em dash (`—`) für leere Terminwerte; `requestUiRefresh` lädt appointments gezielt.

Notes:
- Termine nutzen Browserzeit beim Erfassen, speichern als ISO/UTC.
- RLS + Partial-Unique Index erlauben je Rolle einen geplanten Termin.

## v1.5.7 (PATCH)

Changed:
- Lifestyle-Tab entfällt; Intake-Balken/Pills liegen direkt im Capture-Accordion.
- CSS-Selektoren decken Capture-Bereich ab, Refresh koppelt Bars & Pills.

## v1.5.6 (PATCH)

Fixed:
- Intake-Helfer global erreichbar, kein Scope-Fehler mehr.

Changed:
- Fortschrittsbalken modernisiert (Gradient/Glow), Intake-Pills farbcodiert.

## v1.5.5 (PATCH)

Added:
- Capture-Accordion „Flüssigkeit & Intake“ mit Add-Buttons für Wasser/Salz/Protein.

Changed:
- Intake-Zeitstempel auf Tagesmitte (12:00 UTC) vereinheitlicht.

Fixed:
- Online-Reconnect triggert nur `reconcileFromRemote`, wenn verfügbar.

## v1.5.4 (PATCH)

Fixed:
- `isLoggedInFast()` räumt Timeout auf; keine späten session-timeout Fehler.
- `resetFlagsPanel` entfernt Legacy-Aufruf `setSugarHigh()`.
- Ungenutztes `__t0` (performance.now) gelöscht; is-busy Klassen entfallen.
- Bootstrap-Logger (F9) entfernt, Diagnosepanel übernimmt Logging.

## v1.5.3 (PATCH)

Fixed:
- Login-Gating blockierte Tabs nach Resume – Timeout + Session-Fallback eingeführt.
- Session-Status wird zwischengespeichert (`__lastLoggedIn`).

## v1.5.2 (PATCH)

Fixed:
- Tabs nach App-/Tab-Wechsel: Session-Re-Validation, Tab-Buttons aktiv, Lock-Overlay schließt korrekt.

## v1.5.1 (PATCH)

Fixed:
- Sichtwechsel trennt Lock-Overlay, Tabs bleiben klickbar; gesperrte Arzt-Ansicht springt auf Capture.

## v1.5.0 (PATCH)

Changed:
- Entfernt globale Speicher-Shortcuts; Capture speichert panelweise.
- `requestUiRefresh` orchestriert Unlock-/Tab-/Chart-Aufrufe einheitlich.
- Kommentare/Diagnose-Logs aufgeräumt; sugar→protein Migration markiert.

## v1.4.9 (PATCH)

Changed:
- Neuer `requestUiRefresh`-Orchestrator bündelt Arzt-/Lifestyle-/Chart-Render.
- Panel-Saves & Tab-Wechsel rufen nur noch den Orchestrator, Chart zeichnet nur bei Bedarf.
- Realtime-Events werden koalesziert; Boot-/Login-Flows teilen denselben Refresh-Pfad.

## v1.4.8 (PATCH)

Changed:
- Globalen „Speichern“-Button & Hotkeys entfernt; Erfassung ausschließlich panelweise.
- Capture-Felder resetten bei Laden/Tab-/Datum-Wechsel.
- Panel-Saves beeinflussen nur ihr Panel; ESC/Enter-Shortcuts je Panel.
- Keine Cloud-Vorbelegung im Capture – Sicht nur Arzt-Ansicht.

## v1.4.7.1 (PATCH)

Added:
- Blutdruck-Panel: Dropdown Morgens/Abends + gemeinsamer Speichern-Button.
- Körper-/Flags-Panel: eigene primäre Buttons mit Feedback.

Changed:
- Kommentarpflicht prüft Panel-Kommentare, Flags-Kommentar nur im Flags-Save.

## v1.4.7 (PATCH)

Added:
- Capture-Accordion erhält eigene Save-Buttons je Panel.

Changed:
- Buttons nutzen bestehende Speicherroutinen; globaler Save bleibt Fallback.

## v1.4.6 (PATCH)

Changed:
- Capture-Ansicht nutzt dreiteiliges Accordion (BP/Körper/Flags).

## v1.4.5 (PATCH)

Added:
- BP-Kommentare pro Kontext (Morgens/Abends) mit Note-Prefix.

Changed:
- Datumwechsel leert BP-/Flags-Kommentarfelder.

## v1.4.4 (PATCH)

Added:
- Flags-Bereich erhält Kommentarfeld; speichert Notes mit Präfix `[Flags]`.

Changed:
- Flag-Kommentare werden nach Save/Datumwechsel geleert; Arzt-Ansicht fasst Notes.

## v1.4.3 (PATCH)

Changed:
- Arzt-Ansicht fasst Tagesnotizen zusammen; Notes loader sortiert/aggregiert.

## v1.4.2 (PATCH)

Changed:
- Arzt-Ansicht fordert Passkey automatisch an, Overlay nur bei Bedarf.

Improved:
- Passkey-Setup aktualisiert Dialogzustand direkt.

## v1.4.1 (PATCH)

Fixed:
- App-Lock lässt sich nach Wechsel/Abbruch schließen; Step-up Intent setzt Aktionen fort.

Improved:
- App-Lock fokussiert Eingabe, blendet beim Verlassen aus; Visibility-Wechsel schließt Lock.

## v1.4.0 (MINOR)

Changed:
- Auth/UX: Biometrie/PIN-Lock ausschließlich für Arzt-Ansicht.
- Tab/Chart/Export prüfen Passkey/PIN lokal; Capture bleibt frei zugänglich.

Notes:
- Entsperren vollständig clientseitig; Login via Google OAuth bleibt Basis.


## v1.3.0 (PREVIEW)

Added:
- Neuer Tab „Lifestyle“ (heute): Wasser (ml), Salz (g), Protein (g) erfassen über +Menge‑Buttons; Fortschrittsbalken mit Zuständen (ok/warn/bad/neutral) und Ziel‑Labels.
- Persistenz/Synchronisation: Tages‑Totals werden als `type: "intake"` in `health_events` gespeichert (RLS per `user_id`); Laden der aktuellen Tages‑Totals beim Start; automatisches Aufräumen älterer Intake‑Events.
- Chart (Daily) im Vollbild: Panel füllt den Screen (`inset: 0`, `100dvh`) für bessere mobile Nutzung.

Changed:
- Arzt‑Ansicht „Kommentar“: als Kopf+Wert gestaltet (Pseudo‑Label „Kommentar“), bleibt sichtbar (auch leer) und bricht mobil auf 4 Zeilen um.
- Chart‑Panel Layout: Header fixiert, Inhalt flex‑basiert; KPI‑Select kompakter (`.compact`).

Fixed:
- (keine)

Notes:
- Lifestyle‑Ziele: Wasser 2000 ml (≥90% grün), Salz max. 6 g (≥5 g warn, >6 g rot), Protein Ziel 90 g (78–90 g grün, >90 g rot). Eingaben werden gekappt (Wasser bis 6000 ml, Salz bis 30 g, Protein bis 300 g).

## v1.2.0 (PREVIEW)

Added:
- Chart-KPIs: Farbige Punkte vor KPI‑Werten mit WHO‑basiertem Farbschema für BMI und WHtR; neutrale Blau‑Punkte für BP‑Durchschnitte. Dynamische Separatoren zwischen KPIs.
- Chart-UX: Alert‑Marker für BP‑Serien; Chart bricht nicht mehr ab, wenn nur Flags vorhanden sind (zeigt dennoch Achsen/Legende).
- A11y: `#err` als Live‑Region (`role="status"`, `aria-live="polite"`) für Fehler/Infos; neue `uiError/uiInfo`‑Helfer.
- Datenquellen: `fetchDailyOverview()` nutzt DB‑Views; Flags enthalten Detail‑Medikamentenfelder (Valsartan/Forxiga/NSAR) für Tooltips.

Changed:
- Chart‑Layout: SVG füllt die verfügbare Höhe (`height:100%`, `preserveAspectRatio="none"`), KPI‑Leiste wird programmatisch aufgebaut und ausgerichtet.
- Zeichenlogik: X‑Bereich wird bei Flags stets erweitert; Legende wird konsistent mit farbigen Dots aufgebaut.
- Save‑Flow: Zeigt Hinweis „Keine Daten eingegeben – nichts zu speichern“, wenn nichts zu persistieren ist; M/A‑Saves enthalten kein Gewicht mehr (nur Tageszusammenfassung).

Fixed:
- Stabilerer Umgang mit leeren Datenreihen (Flags‑only) im Chart; keine leere Darstellung mehr.

Notes:
- KPI‑Farben: BMI <18.5 blau, 18.5–<25 grün, 25–<30 amber, ≥30 rot; WHtR <0.5 grün, ≤0.6 amber, >0.6 rot. Tooltips können detaillierte Meds‑Flags anzeigen.

## v1.1.0 (PREVIEW)

Added:
- Kommentarpflicht bei Grenzwerten: Speichern erfordert einen Kommentar, wenn Blutdruck über Schwelle liegt; UI zeigt Hinweis (Alert) und markiert das Kommentarfeld.
- Arzt-Ansicht: CSS-Regel `.doctor-view .num.alert` für visuelle Hervorhebung von Grenzwertwerten (Vorbereitung für Highlights).

Changed:
- Save-Flow blockiert das Speichern, solange bei Grenzwertüberschreitung kein Kommentar vorhanden ist; Fokus springt ins Kommentarfeld, Outline in Rot.

Fixed:
- Verhindert unvollständige Tages-Einträge ohne erforderlichen Kommentar bei hohen Blutdruckwerten.

Notes:
- Grenzwerte: Sys > 130 mmHg oder Dia > 90 mmHg (Morgens wie Abends) verlangen einen Kommentar; Prüfung erfolgt vor `saveBlock`/`saveDaySummary` und bricht den Speichervorgang ab.

## v1.0.0 (PREVIEW)

Added:
- App-Lock: Passkey (WebAuthn, Finger/Face) und PIN als lokaler Sperrmechanismus. Lock-Overlay mit Buttons zum Entsperren; `body.auth-locked main` dimmt die App.
- Arzt-Toolbar: Mittig gruppierte Controls (Von/Bis/Anwenden/Werte anzeigen/Export JSON) und Badges rechts (Trainingstage, Tage mit Bad‑Flag).
- Chart KPIs: Neben dem Metric‑Dropdown zeigt die KPI‑Leiste Durchschnittswerte für Blutdruck (Sys/Dia/MAP) bzw. BMI und WHtR beim Gewichts‑Diagramm.
- Bauchumfang (cm): Neues Tagesfeld `waist_cm`; wird in „Tageszusammenfassung“, Arzt‑Ansicht (Waist‑Zeile) und im Gewichts‑Diagramm (zweite Serie) berücksichtigt.
- Protein‑Flag: Neuer Toggle `#proteinHighToggle` (Protein ≥ 90 g) und Datensatzfeld `protein_high90` inkl. Anzeige in der Arzt‑Ansicht.

Changed:
- Arzt‑Layout (Daily, Spalte „Spezial“) neu aufgeteilt: Gewicht und Bauchumfang als eigene Zeilen, Flags daneben, Notizen rechts; stabilere Zahlenbreiten (tabular‑nums, min‑width).
- Arzt‑Badges: Zähler für Trainingstage und „Bad‑Flag“‑Tage im gewählten Zeitraum.

Fixed:
- Live‑Hinweis bei Grenzwertüberschreitung: Kommentar‑Feld markiert (rote Outline), solange ein Kommentar gefordert ist und leer bleibt.

Notes:
- Nach Login: `ensureAppLock()` prüft Sperrstatus; Realtime wird anschließend gesetzt. Flags in Arzt‑KPIs: `water_lt2`, `salt_gt5`, `protein_ge90`, `sick`, `meds`, `training`.

## v0.9.0 (PREVIEW)

Added:
- Print-Button in der Arzt-Ansicht (`#printBtn`) zum direkten Drucken der aktuellen Ansicht (nutzt die optimierte Print-CSS).
- Hard-Reset-Button (`#hardResetBtn`): Leert Service Worker, Caches, Local/Session Storage und Cookies; lädt die Seite frisch.
- Accessibility: Sichtbarer Fokusrahmen für Tastatur-Navigation (`:focus-visible`).

Changed:
- Arzt-Ansicht (Daily) Layout verfeinert: stabilere Zahlenbreiten (`min-width`/tabular-nums) und optimiertes Flags-Grid‑Wrapping (mehr Spalten auf Desktop, kompakter auf Mobil).

Fixed:
- Verhindert abgeschnittene Dezimalstellen im Arzt‑Layout; Flags/Notizen brechen sinnvoll um.

Notes:
- Hard‑Reset entfernt lokale Konfiguration (Webhook/OAuth); nach erneuter Konfiguration initialisiert sich Realtime wie in v0.6.0.

## v0.8.0 (PREVIEW)

Added:
- Arzt-Ansicht (Daily) als kompaktes 3‑Spalten‑Layout je Tag: A) Datum, B) Messungen (Morgens/Abends) mit sauberer Ausrichtung, C) „Spezial“ mit Gewicht‑Zeile, Flags‑Grid und Notizen.
- Flags‑Grid in Arzt-Ansicht: Visualisierung für `<2L`, `Salz >5g`, `Zucker >10g`, `krank`, `Medikamente`, `Training` (aktiv/inaktiv über Flag‑Box). Day‑Summary erscheint bei Gewicht/Notiz/Flag.
- Tastenkürzel: Strg/Cmd+S löst Speichern des Daily‑Eintrags aus.

Changed:
- Print‑Optimierung: Druck legt saubere Tabellen/Ränder an, blendet UI‑Chrome (Tabs/Charts/Diag) aus; „notes“ clampen nicht, Farben korrekt (`print-color-adjust`).
- CSV „Art“-Logik: Tageszusammenfassung als eigener Typ („Tageszusammenfassung“) mit Kontextlabel im Zeitfeld.

Fixed:
- Import/Reload berücksichtigt `salt_high`/`sugar_high` aus Remote‑Daten in lokalen Einträgen.

Notes:
- Flag‑Ableitungen in Arzt‑Ansicht: `low_intake→water_lt2`, `salt_high→salt_gt5`, `sugar_high→sugar_gt10`, `sick→sick`, `training→training`, `(valsartan_missed|forxiga_missed|nsar_taken)→meds`.

## v0.7.0 (PREVIEW)

Added:
- Neue Daily-Flags: Toggles `#saltHighToggle` (> 5 g Salz) und `#sugarHighToggle` (> 10 g Zucker) inkl. Button-Flash/Reset. Save-Flow persistiert `salt_high`/`sugar_high` und stellt sie beim Laden wieder her.
- Liste/Arzt-Ansicht: Zusätzliche Spalten/Anzeigen für Salz/Zucker (zeigt „Ja“ bei gesetztem Flag).
- CSV-Export: Ergänzt um Spalten `Salz_ueber_5g` und `Zucker_ueber_10g`.

Changed:
- Diagramm-Panels (Daily/Befunde) öffnen im breiteren Layout (`.panel.chart { width: min(92vw, 820px) }`).

Fixed:
- (keine)

Notes:
- Datenfelder in Einträgen: `salt_high` und `sugar_high`. Realtime/Auto‑Sync (aus v0.6.0) bleiben unverändert aktiv; Flags werden mitgesendet und im UI/Export berücksichtigt.

## v0.6.0 (PREVIEW)

Added:
- Supabase OAuth: `ensureSupabaseClient()` initialisiert den Client (keine service_role Keys), Google-Login (`signInWithOAuth`) und Logout (``signOut``) steuern Realtime/Offline-Zustand.
- Auto-Sync beim Boot (`initialAutoSync`) inklusive Befund-Abgleich (
econcileReportsFromRemote), Busy-Overlay schützt währenddessen die UI.
- Realtime erneut eingerichtet über 	rackChannel: Daily- und Befund-Events (INSERT/UPDATE/DELETE) werden lokal upsert/gelöscht und im Diagnose-Log protokolliert.

Changed:
- Von/Bis-Filter und Online-Handler aktualisieren nun beide Datenpfade (Liste/Arzt + Charts) auch nach Realtime-/Auto-Sync-Ereignissen.

Fixed:
- (keine)

Notes:
- Realtime/Auto-Sync benötigen `window.supabase`, webhookUrl/webhookUrlMr sowie gültige OAuth-Session; Pending-Speicher wird bei Online-Events automatisch abgearbeitet.

## v0.5.0 (PREVIEW)

Added:
- Supabase-Realtime: `setupRealtime()` lauscht auf `health_entries`/`medical_reports` (INSERT/UPDATE → upsert, DELETE → lokal entfernen) und loggt Statusmeldungen.
- Auto-Sync beim Start (``initialAutoSync``): Pending pushen, 
econcileFromRemote()/
econcileReportsFromRemote() ohne Wipe; Busy-Overlay schützt UI.

Changed:
- Von/Bis-Filter aktualisieren jetzt beide Diagramm-Panels (`chartPanel`/`chartReportsPanel`) synchron.

Fixed:
- (keine)

Notes:
- Realtime/AutoSync setzen ``window.supabase`` und webhookUrl/webhookUrlMr voraus; Online-Event pusht Pending und lädt Daten nach.

## v0.4.0 (PREVIEW)

Added:
- Arzt-Ansicht-Segment "Daily/Befunde" mit neuer Tabelle #doctorReportsTable für Befunde.
- Befund-Diagramm (`chartReportsPanel`) inkl. Metrik-Auswahl, Glätten, PNG-Export; "Werte anzeigen" öffnet nun das passende Panel.

Changed:
- renderDoctorViewForMode orchestriert Daily/Befund-Ansichten (Tabellen + Charts) gemaess Von/Bis; Range-Apply aktualisiert beide Modi.

Fixed:
- (keine)

Notes:
- Daily-Capture/Sicherungs-Workflow unverändert; Befund-Sync weiterhin über webhookUrlMr.

## v0.3.1 (PREVIEW)

Added:
- Listen-Segment \"Daily/Befund\" mit Tabelle #tblReports (Datum, Kreatinin, eGFR, UACR, Kalium, Notiz) inkl. Sync-Status-Icon und Delete-Aktion.
- Delete-Workflow für Befunde: deleteReportLocal, REST-DELETE bei gesetzter 
emote_id, Diagnose-Logs (\"Befund-Löschung: Server + lokal OK\").

Changed:
- loadAndRenderReports() und Segmentwechsel (Liste) laden Befunddaten on demand; Daily-Ansicht bleibt unverändert.

Fixed:
- (keine)

Notes:
- Befund-Sync nutzt weiterhin webhookUrlMr; Daily-Sync/Export bleiben unverändert.

## v0.3.0 (PREVIEW)

Added:
- Capture-Segment "Erfassen - Daily/Befund"; neues Befund-Panel mit Feldern fuer Datum, Kreatinin, eGFR, UACR, Kalium, Notiz sowie Button-Flash nach Save.
- IndexedDB Schema-Version 3 mit Store `reports` (Index `byDate`) und Helfern `addReport`/`updateReport`/`getAllReports`; `saveReport` legt Eintraege offline an.
- Remote-Sync fuer Befunde: Konfig-Feld `webhookUrlMr`, `syncReportWebhook(report, localId)` inkl. `remote_id`-Update und Diagnose-Logs.

Changed:
- Config-Speicher persistiert `webhookUrlMr`; Segment-Umschaltung blendet Daily- bzw. Befund-Panel ein/aus.

Fixed:
- (keine)

Notes:
- Daily-Sync/Export unveraendert; Befund-Sync erfordert separate REST-URL.

## v0.2.0 (PREVIEW)

Added:
- Busy-Overlay (`#busy`) und manueller Sync-Workflow (Button "Sync mit Supabase"): CSV-Backup, Pending-Push, lokales Wipe, Reimport via REST.
- Remote-Sync-Helfer: `getHeaders`, `pushPendingToRemote`, `pullAllFromRemote`; `syncWebhook(entry, localId)` aktualisiert `remote_id` in IndexedDB.

Changed:
- Toggle-Handler setzen `aria-pressed`, aktualisieren aktive Beschriftungen und sperren den Forxiga-Toggle bei "Krank".
- Hilfe-Panel auf Kernhinweise verkürzt.

Fixed:
- (keine)

Notes:
- Diagnose-Log protokolliert Sync-Schritte (Backup/Pending/Reload) und Fehler; ohne REST-Konfiguration laufen Sync-Aktionen kontrolliert ins Log.

## v0.1.0 (PREVIEW)

Added:
- Erste App-Struktur mit Tabs "Erfassen" und "Arzt-Ansicht" sowie einfachem SVG-Chart.
- Tages-Flags (Training, Krank, Valsartan/Forxiga vergessen, NSAR) inklusive Hilfe- und Diagnose-Panel.
- Backend-Konfiguration (REST-URL, API-Key) und einfacher `syncWebhook(entry)` POST mit optionalem Authorization-Header.

Changed:
- (keine)

Fixed:
- (keine)

Notes:
- Kein Auth/Realtime/RLS, kein IndexedDB; Fehler erscheinen nur im Diagnose-Log.



