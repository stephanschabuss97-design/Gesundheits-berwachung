[QA_CHECKS.md](https://github.com/user-attachments/files/22564048/QA_CHECKS.md)
QA Checklist for v1.5.0 Cleanup

- Smoke
  - Google-Login, BP/Body/Flags speichern, Arzt-Ansicht und Export pruefen.
- Sanity
  - Panel-Save leert nur sein Panel; nach Speichern refresht Arzt sofort, Chart nur bei offenem Panel.
- Regression Top-5
  - Realtime-Events triggern einen koordinierten Refresh ohne Doppel-Render.
  - Unlock-Intents (Doctor, Chart, Export) laufen weiter ueber requestUiRefresh.
  - Flag/BP Kommentare behalten 409-Fallbacks; Datumwechsel setzt Capture sauber.
  - Offline Pending Sync laeuft nach Reconnect ohne UI-Blockaden.
- Integration
  - Komplettflow: Login -> Capture (BP+Kommentar) -> Flags (Kommentar) -> Arzt-Zeitraum -> Chart oeffnen.
QA Checklist for v1.4.9 Refresh Flow

- Refresh Orchestrator
  - Panel-Saves (BP, Body, Flags) triggern requestUiRefresh und aktualisieren die Arzt-Ansicht sofort.
  - Diagramm wird nur neu gezeichnet, wenn das Chart-Panel offen ist (vor Save oeffnen und Verhalten pruefen).
  - Range-Apply, Delete-Day und Tab-Arzt nutzen denselben Flow; keine doppelten Render im Touch-Log.

- Realtime/Boot
  - Realtime-Events feuern genau einen koaleszierten Refresh (Doctor immer, Chart nur bei offenem Panel).
  - Login/Reload mit bestehender Session zeigt nach Boot sofort aktuelle Daten ohne manuelle Aktualisierung.

- Regression
  - Unlock/Chart-Export-Flows bleiben unveraendert (Unlock fuehrt ggf. direkten Chart-Draw aus).
  - Capture-Resets und ESC/Enter-Hotkeys verhalten sich unveraendert; keine blockierten Buttons nach Save.
QA Checklist for v1.4.8 Panel Reset & UX

- Initialzustand
  - Capture oeffnet leer: BP-Felder & Kommentare leer, Koerper-Felder leer, alle Flags deaktiviert.
  - Wechsel auf Capture oder Datumaenderung setzt denselben Ausgangszustand; kein Sync-Vorfuellen.

- Panel-Saves
  - Blutdruck-Dropdown (M/A) speichert korrekt, leert nur den aktiven Block und fokussiert `sys`; anderer Block bleibt unveraendert.
  - Koerper-Save leert Gewicht/Taille und fokussiert Gewicht; Flags-Save leert ausschliesslich Flags-Toggles und Kommentar.
  - Erfolgsfeedback (`flashButtonOk`) erscheint pro Panel; kein globaler Button mehr.

- Keyboard/UX
  - Enter in aktiven Feldern loest den jeweiligen Panel-Save aus; ESC leert nur dieses Panel.
  - Fokusmanagement funktioniert nach Save/Reset (insbesondere bei Flags-Kommentar).

- Regression
  - Arzt-Ansicht & Charts aktualisieren nach Panel-Saves; Offline/Pending-Saves bleiben funktional.
  - Globaler Ctrl/Cmd+S existiert nicht mehr, kein versehentliches Speichern kompletter Eingaben.
QA Checklist for v1.4.7.1 BP Dropdown

- Blutdruck
  - Dropdown startet auf "M" und blendet jeweils nur den aktiven Messblock ein.
  - Speichern nutzt den Dropdown-Kontext (M/A), legt Messung korrekt an und leert das passende Kommentarfeld.
  - Kommentar-Pflicht greift nur bei hohen Werten ohne Kommentar; rote Umrandung verschwindet nach erfolgreichem Speichern.
  - Panel-Button zeigt Erfolgsflash (check) und aktualisiert Arzt-Ansicht sowie Charts.

- Koerper
  - Allgemeines Kommentarfeld ist entfernt; Body-Button speichert Gewicht/Taille ohne Flags-Kommentar zu loeschen.
  - Erfolgsflash erscheint nach Body-Save; globaler Button liefert identische Daten.

- Flags
  - Flags-Button speichert Toggles und Kommentar; Kommentar wird nur hier geleert.
  - Erfolgsflash sichtbar; Mehrfachspeichern erzeugt keine Duplikate.

- Regression
  - Globaler Speichern-Button bleibt funktionsgleich (Dropdown-Eingaben + Flags/Aerzte-Ansicht).
  - Accordion-Expand/Collapse funktioniert weiterhin; Panel-Buttons bleiben im eingeklappten Zustand erreichbar.
QA Checklist for v1.4.7 Panel Save Buttons

- Buttons
  - Blutdruck-, Koerper- und Flags-Panel besitzen je einen Speichern-Button (ghost-Style).
  - Buttons sind nur fuer ihren Bereich aktiv (kein Leerlauf ohne Eingaben; Fehlerhinweise passend).

- Verhalten
  - Panel-Speichern schreibt die gleichen Daten wie der globale Button (inkl. Notizen/Flags).
  - Globaler Speichern-Button funktioniert weiterhin unveraendert.
  - Mehrfaches Speichern fuehrt nicht zu Duplikaten; Kommentare werden korrekt angehaengt.

- Regression
  - Accordion Expand/Collapse bleibt intakt; Buttons reagieren auch im eingeklappten Zustand.
  - Arzt-Ansicht und Charts aktualisieren nach Panel-Save wie gewohnt.
QA Checklist for v1.4.6 Accordion Capture

- Panels
  - Drei Details-Panels (Blutdruck, Koerper & Kommentar, Flags) sind initial offen und lassen sich einklappen.
  - Inhalte bleiben unveraendert bedienbar (Input IDs/Buttons wie zuvor).

- Interaktion
  - Expand/Collapse funktioniert per Klick auf den Summary-Bereich (Chevron dreht sich).
  - Mobile Darstellung: Panels passen sich an, keine haengenden Abstaende oder abgeschnittene Inhalte.

- Regression
  - Speichern (mit/ohne Messwerte, mit Kommentaren) arbeitet wie in v1.4.5.
  - Flags/Kommentare werden weiterhin synchronisiert und nach Datumwechsel geleert.
QA Checklist for v1.4.5 BP Comments

- Capture
  - Morgens- und Abends-Karten zeigen je ein Kommentar-Feld (#bpCommentM, #bpCommentA).
  - Speichern mit Kommentar erzeugt eine Note mit Prefix [Morgens] bzw. [Abends] und leert das Feld.
  - Speichern ohne Kommentar beeinflusst die bestehenden Werte nicht (MAP, Charts unveraendert).

- Kombinationen
  - BP-Kommentare koennen gemeinsam mit Flag-Kommentaren gespeichert werden; Arzt-Ansicht zeigt alle Praefixe in Reihenfolge.
  - Mehrfaches Speichern am gleichen Tag fuegt weitere Prefix-Notizen hinzu ohne Duplikate bei den Messwerten.

- Regression
  - BP-Validierung (Sys/Dia-Pflicht, Puls nur mit BP) bleibt unveraendert.
  - Flag-Kommentar- und Tageskommentar-Felder werden beim Datumwechsel zurueckgesetzt.
QA Checklist for v1.1.0 Protein Flag

- UI
  - Day toggle shows only "Protein = 90 g".
  - Button has id `proteinHighToggle` at runtime and toggles correctly.
  - Doctor view badge shows "Protein = 90 g".
  - "Bad day" logic includes the protein flag.
  - Protein toggle label includes a meat icon () in normal and active state.

- JS
  - `toHealthEvents` writes `protein_high90` in payload.
  - `joinViewsToDaily` maps `protein_high90`  `day.flags.protein_ge90`.
  - Save flows use `proteinHigh` and persist `protein_high90`.
  - Chart overlay aggregates use `protein` bucket instead of `sugar`.

- Charts
  - Flags overlay renders even if a day has no BP measurements (flags-only days are included).
  - Flags overlay renders for weight metric as well (not BP-only).
  - X-domain extends to include all flagged days; chart does not show "Keine darstellbaren Werte" when flags exist.

- SQL
  - `day_flags` trigger validation keys contain `protein_high90` (no `sugar_high`).
  - `v_events_day_flags` exposes `protein_high90`.
  - Admin checks "unknown keys" list contains `protein_high90` and not `sugar_high`.

- Cross-Consistency
  - UI id: `proteinHighToggle`; SQL key: `protein_high90`; Badge text: "Protein = 90 g".
  - Full-text search shows no `sugar_high` across codebase.

- Versioning
  - Impact MINOR. Next version: v1.1.0.


QA Checklist for v1.2.0 Chart Tooltips

- UI/Behavior
  - Tooltip on hover/tap shows only same-day flags (no neighbor aggregation).
  - Tooltip combines optional "Notiz" and a list "Flags:" below.
  - Flags covered: Training, Krank, < 2 L Wasser, > 5 g Salz,  Protein  90 g, NSAR genommen, Valsartan/Forxiga vergessen, Medikamente.

- Accessibility
  - Points (.pt) are focusable via keyboard (tabindex="0", role="button").
  - Enter/Space toggles the tooltip sticky state; ESC closes it.
  - Aria live region announces a concise summary (date, ctx, flags, note present).

- Data Consistency
  - Flags shown in tooltip match Arzt-Ansicht semantics and labels.
  - For cloud data, day flags (including meds details) appear in tooltip.

- Regressions
  - No changes to lines/axes/KPIs rendering.
  - Overlay still renders for BP and Weight; flags-only days still included.

QA Checklist for v1.2.1 Flags Upsert

- Save behavior
  - Saving day with flags already present does not produce 409; flags are updated via PATCH.
  - Other events for the same save (BP/Body/Note) are inserted successfully after flags update.
  - No need to delete the full day to adjust flags.

- Capture sync
  - On opening capture tab, toggles reflect current cloud flags for the selected date.
  - On changing the date field, toggles refresh to that days flags.

- Idempotence
  - Re-saving the same flags without change causes no error; backend performs a no-op update.
  - Non-flag changes (e.g., adding BP later) do not duplicate flags.


QA Checklist for v1.3.0 Lifestyle Intake

- Database / Supabase
  - `public.health_events` accepts `type='intake'` inserts; constraint check includes `'intake'`.
  - Trigger `trg_events_validate` validiert Keys/Zahlenbereiche (0-6000 ml, 0-30 g, 0-300 g) ohne `jsonb_object_length` Fehler.
  - Unique Index `uq_events_intake_per_day` verhindert zweite Intake-Zeile pro Tag/User (POST409PATCH funktioniert).
  - Admin Checks (Dupes/Range/Unknown Keys) erkennen Intake korrekt.

- API / Fehlerbehandlung
  - Lifestyle-POST liefert 200/201; bei 409 erfolgt automatischer PATCH (Status 204/200) ohne Fehltoast.
  - Touch-Log zeigt detaillierte Meldung, falls POST fehlschlaegt (Config/Key/JWT/Supabase Diagnose).
  - `getHeaders()` meldet: fehlenden Key, service_role Block, fehlende Session.

- UI / UX
  - BP-Speichern erfordert Sys+Dia (Puls optional) - kein Backend-400 mehr.
  - Lifestyle-Inputs aktualisieren Balken sofort; Realtime-Refresh laedt Werte nach Login.
  - Progress-Balken Farben:
    - Wasser: <50 % rot, 50-89 % gelb, 90 % gruen.
    - Salz: 4.9 g gruen, 5-6 g gelb, >6 g rot.
    - Protein: <78 g neutral, 78-90 g gruen, >90 g rot.
  - Label-Texte bleiben lesbar (dunkle/helle Schrift je Zustand) und zeigen Status ("niedrig", "Warnung", "Zielbereich", "ueber Ziel").

- Regression
  - Capture/Doctor Tabs weiterhin funktionsfaehig (kein Einfluss auf bestehende Flags/BP/Charts).
  - Default-Key/URL Initialisierung funktioniert, Logging beeinflusst keine Produktionsfunktion.

QA Checklist for v1.4.0 Doctor Unlock (Arzt-Ansicht)

- Login/Start
  - Beim Laden ohne Session erscheint nur das Google-Login-Overlay (#loginOverlay), nicht das App-Lock (#appLock).
  - Nach Google-Login bleibt die App frei bedienbar (Capture/Lifestyle); kein globaler App-Lock wird automatisch gezeigt.

- Arzt-Ansicht Guard
  - Klick auf Arzt-Tab ruft keinen Tab-Wechsel aus, solange nicht entsperrt; stattdessen erscheint das Entsperr-Overlay (#appLock).
  - 
enderDoctor() zeigt den Hinweis "Bitte Arzt-Ansicht kurz entsperren.", aber nur wenn die Arzt-Ansicht aktiv (#doctor.active) ist.
  - Abbruch des Entsperrens belsst die App in der bisherigen Ansicht (typisch: Capture).

- Entsperren
  - "Per Passkey entsperren" fhrt zu WebAuthn-Prompt; bei Erfolg wird __doctorUnlocked = true gesetzt, Overlay schliet, die Arzt-Ansicht wird aktiviert.
  - PIN-Entsperren verhlt sich identisch (setzt __doctorUnlocked = true, schliet Overlay, wechselt zur Arzt-Ansicht).

- Gated Aktionen
  - "Werte anzeigen" (Charts) ist ohne Unlock blockiert (Overlay erscheint); nach Unlock ffnet das Chart-Panel ohne weiteren Prompt.
  - "Export JSON" ist ohne Unlock blockiert; nach Unlock ldt die Datei wie erwartet.

- Code-Hygiene
  - Keine Aufrufe von ensureAppLock() im Login-/Boot-Pfad (nur Definition verbleibt).
  - Guards prfen __doctorUnlocked an drei Stellen: Tab-Wechsel, Charts-Button, Export-Button.
  - Overlay-Steuerung: lockUi(true/false) toggelt ody.app-locked und #appLock sauber.

- Versionierung
  - Impact MINOR. Version: v1.4.0.

QA Checklist for v1.4.1 App-Lock UX

- Overlay Handling
  - App-Lock laesst sich via ESC, Abbrechen-Button und Klick auf das Overlay schliessen.
  - Beim Wechsel in andere Tabs (Capture/Lifestyle) oder Apps (sichtbarer Wechsel) verschwindet der Lock; Buttons bleiben bedienbar.
  - Beim Oeffnen fokussiert das PIN-Feld (falls vorhanden) sonst der Passkey-Button.

- Intent Resume
  - Arzt-Tab: Nach Entsperren landet die Ansicht direkt im Arzt-Tab.
  - Chart-Button: Nach Entsperren oeffnet sich das Chart-Panel automatisch.
  - Export JSON: Nach Entsperren startet der Download ohne zweiten Klick.

- Regression
  - Bereits entsperrte Sitzungen (Chart/Export) funktionieren ohne erneute Abfrage.
  - Abbrechen/ESC setzt __pendingAfterUnlock zurueck; erneute Aktionen funktionieren sofort.

QA Checklist for v1.4.2 Passkey Auto-Unlock

- Auto Prompt
  - Mit hinterlegtem Passkey oeffnet sich beim Wechsel in die Arzt-Ansicht direkt der WebAuthn-Prompt (kein Overlay).
  - Abgebrochene Passkey-Bestaetigung zeigt danach das Overlay mit Hinweis und laesst erneutes Entsperren/PIN zu.

- Overlay States
  - Ohne Passkey: Overlay hebt 'Passkey einrichten' hervor, Passkey-Button bleibt deaktiviert bis Registrierung.
  - Kein WebAuthn verfuegbar: Passkey-Button ist deaktiviert/ausgegraut, Hinweis verweist auf PIN.
  - PIN-Feld akzeptiert Enter als Bestaetigung; ESC/Abbrechen/Overlay-Klick schliessen weiterhin.

- Regression
  - Intent-Resume (Doctor/Chart/Export) funktioniert weiterhin nach automatischem Passkey-Entsperren und nach Overlay-Flow.
  - Passkey-Setup aktualisiert den Dialog sofort (Button wird aktiv, Hinweis aktualisiert sich).
QA Checklist for v1.4.4 Flags Comments

- Capture
  - Flags-Bereich zeigt das neue Kommentarfeld `#flagsComment` (leer bei Datumswechsel oder nach Speicherung).
  - Speichern mit Flag-Kommentar legt ein separates Note-Event mit Praefix `[Flags]` an.
  - Speichern ohne Kommentar erzeugt keine zusaetzliche Notiz.
  - Mehrfaches Speichern desselben Tages fuegt weitere `[Flags]`-Notizen in chronologischer Reihenfolge hinzu.

- Validation
  - Speichern nur mit Flag-Kommentar (keine aktivierten Flags) funktioniert und erstellt einen Note-Eintrag.
  - Nach erfolgreichem Speichern wird das Kommentarfeld geleert.

- Regression
  - Flag-Toggles, Tageskommentar (#notesDay) und bestehende Save-Flows bleiben unveraendert.
  - Export/Doctor-Ansicht zeigen alle Flag-Kommentare zusammengefasst wie erwartet.
QA Checklist for v1.4.3 Notes Aggregation

- Arzt-Ansicht
  - Mehrere Note-Events an einem Tag erscheinen in chronologischer Reihenfolge als ein zusammenhaengender Kommentar.
  - Einzelne Kommentare bleiben unveraendert (keine doppelten Leerzeichen, keine Prefex-Verluste).
  - Tage ohne Notiz zeigen weiterhin den Platzhalter ("-" bzw. leer) wie zuvor.

- Datenpfad
  - Supabase-Query fuer ``type=note`` liefert Eintraege aufsteigend per Timestamp (`order: ts.asc`).
  - Aggregation setzt den juengsten Timestamp (``ts``) des Tages fuer die Ausgabe; Diagnose-Log zeigt konsistente Reihenfolge.

- Regression
  - Erfassen-Tageskommentar (Textarea) speichert weiterhin wie in v1.4.2.
  - JSON-/CSV-Export nutzt den zusammengefassten Kommentar ohne weitere Strukturaenderungen.
  - Charts, Flags und andere Tagesdaten bleiben unveraendert.




