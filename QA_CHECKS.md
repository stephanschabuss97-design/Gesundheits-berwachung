[QA_CHECKS.md](https://github.com/user-attachments/files/22473900/QA_CHECKS.md)
QA Checklist for v1.1.0 Protein Flag

- UI
  - Day toggle shows only "Protein = 90 g".
  - Button has id `proteinHighToggle` at runtime and toggles correctly.
  - Doctor view badge shows "Protein = 90 g".
  - "Bad day" logic includes the protein flag.
  - Protein toggle label includes a meat icon (🍗) in normal and active state.

- JS
  - `toHealthEvents` writes `protein_high90` in payload.
  - `joinViewsToDaily` maps `protein_high90` → `day.flags.protein_ge90`.
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
  - Flags covered: Training, Krank, < 2 L Wasser, > 5 g Salz, 🍗 Protein ≥ 90 g, NSAR genommen, Valsartan/Forxiga vergessen, Medikamente.

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
  - On changing the date field, toggles refresh to that day’s flags.

- Idempotence
  - Re-saving the same flags without change causes no error; backend performs a no-op update.
  - Non-flag changes (e.g., adding BP later) do not duplicate flags.


QA Checklist for v1.3.0 Lifestyle Intake

- Database / Supabase
  - `public.health_events` accepts `type='intake'` inserts; constraint check includes `'intake'`.
  - Trigger `trg_events_validate` validiert Keys/Zahlenbereiche (0–6000 ml, 0–30 g, 0–300 g) ohne `jsonb_object_length` Fehler.
  - Unique Index `uq_events_intake_per_day` verhindert zweite Intake-Zeile pro Tag/User (POST→409→PATCH funktioniert).
  - Admin Checks (Dupes/Range/Unknown Keys) erkennen Intake korrekt.

- API / Fehlerbehandlung
  - Lifestyle-POST liefert 200/201; bei 409 erfolgt automatischer PATCH (Status 204/200) ohne Fehltoast.
  - Touch-Log zeigt detaillierte Meldung, falls POST fehlschlägt (Config/Key/JWT/Supabase Diagnose).
  - `getHeaders()` meldet: fehlenden Key, service_role Block, fehlende Session.

- UI / UX
  - BP-Speichern erfordert Sys+Dia (Puls optional) – kein Backend-400 mehr.
  - Lifestyle-Inputs aktualisieren Balken sofort; Realtime-Refresh lädt Werte nach Login.
  - Progress-Balken Farben:
    - Wasser: <50 % rot, 50–89 % gelb, ≥90 % grün.
    - Salz: ≤4.9 g grün, 5–6 g gelb, >6 g rot.
    - Protein: <78 g neutral, 78–90 g grün, >90 g rot.
  - Label-Texte bleiben lesbar (dunkle/helle Schrift je Zustand) und zeigen Status („niedrig“, „Warnung“, „Zielbereich“, „über Ziel“).

- Regression
  - Capture/Doctor Tabs weiterhin funktionsfähig (kein Einfluss auf bestehende Flags/BP/Charts).
  - Default-Key/URL Initialisierung funktioniert, Logging beeinflusst keine Produktionsfunktion.

QA Checklist for v1.4.0 Doctor Unlock (Arzt-Ansicht)

- Login/Start
  - Beim Laden ohne Session erscheint nur das Google-Login-Overlay (#loginOverlay), nicht das App-Lock (#appLock).
  - Nach Google-Login bleibt die App frei bedienbar (Capture/Lifestyle); kein globaler App-Lock wird automatisch gezeigt.

- Arzt-Ansicht Guard
  - Klick auf Arzt-Tab ruft keinen Tab-Wechsel aus, solange nicht entsperrt; stattdessen erscheint das Entsperr-Overlay (#appLock).
  - 
enderDoctor() zeigt den Hinweis "Bitte Arzt-Ansicht kurz entsperren.", aber nur wenn die Arzt-Ansicht aktiv (#doctor.active) ist.
  - Abbruch des Entsperrens bel�sst die App in der bisherigen Ansicht (typisch: Capture).

- Entsperren
  - "Per Passkey entsperren" f�hrt zu WebAuthn-Prompt; bei Erfolg wird __doctorUnlocked = true gesetzt, Overlay schlie�t, die Arzt-Ansicht wird aktiviert.
  - PIN-Entsperren verh�lt sich identisch (setzt __doctorUnlocked = true, schlie�t Overlay, wechselt zur Arzt-Ansicht).

- Gated Aktionen
  - "Werte anzeigen" (Charts) ist ohne Unlock blockiert (Overlay erscheint); nach Unlock �ffnet das Chart-Panel ohne weiteren Prompt.
  - "Export JSON" ist ohne Unlock blockiert; nach Unlock l�dt die Datei wie erwartet.

- Code-Hygiene
  - Keine Aufrufe von ensureAppLock() im Login-/Boot-Pfad (nur Definition verbleibt).
  - Guards pr�fen __doctorUnlocked an drei Stellen: Tab-Wechsel, Charts-Button, Export-Button.
  - Overlay-Steuerung: lockUi(true/false) toggelt ody.app-locked und #appLock sauber.

- Versionierung
  - Impact MINOR. Version: v1.4.0.
