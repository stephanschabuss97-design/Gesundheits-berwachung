[CHANGELOG.md](https://github.com/user-attachments/files/22473891/CHANGELOG.md)
## v1.1.0 (MINOR)

- Replace sugar flag with protein flag across UI/DB/Admin.
- UI: introduce `protein_high90` (Protein ≥ 90 g) toggle and badge.
- JS: rename internal day flag to `protein_ge90`; add runtime migration from legacy `sugarHighToggle` to `proteinHighToggle` to avoid layout breakage.
- SQL: update `day_flags` validation keys and `v_events_day_flags` view to use `protein_high90`.
- Admin checks: allow `protein_high90` and drop `sugar_high`.
- Charts (SVG): day flags overlay now renders even without BP measurements; flagged-only days extend the X-domain; overlay is available for all metrics (bp, weight).
- UI: Protein toggle label shows a meat icon (🍗) for clarity.

Notes:
- Backward compatibility: existing events with `sugar_high` are not referenced anymore; new events use `protein_high90`.
  If historical data exists, consider a one-off migration.
## v1.2.0 (MINOR)

Added:
- SVG-Tooltips zeigen Tages-Flags pro Datenpunkt (Hover/Tap), ohne Nachbarwerte.
- Accessibility: Punkte sind fokussierbar (tabindex, role); Tooltip hat aria-live Region; Enter/Space öffnet, ESC schließt.

Changed:
- Chart baut Flags-Lookup pro Tag und zeigt Flags im Tooltip (Training, Krank, < 2 L Wasser, > 5 g Salz, 🍗 Protein ≥90 g, NSAR, Valsartan/Forxiga vergessen, Medikamente).



## v1.2.1 (PATCH)

Fixed:
- Save: day_flags duplicate (409) handled with PATCH upsert fallback; other events are inserted afterward. Kein Voll-Löschen des Tages nötig.

Improved:
- Capture: Flag-Toggles synchronisieren sich beim Öffnen/Datumwechsel mit bestehenden Tages-Flags aus der Cloud.
- UX: Nach Sync sind bereits gesetzte Flags sichtbar, um Doppel-Speichern zu vermeiden.

## v1.3.0 (MINOR)

Added:
- Supabase Schema: `health_events` akzeptiert neuen Typ `intake`; Trigger/Checks validieren Wasser/Salz/Protein, Unique-Index pro Tag/User.
- Admin Checks: Intake in Duplikat-/Range-/Unknown-Key-Prüfungen aufgenommen.
- UI: Lifestyle-Tab speichert Tageswerte zu Wasser/Salz/Protein über REST (POST/PATCH) inkl. Realtime-Refresh.
- Progress Bars zeigen Zielstatus mit Farblogik (Wasser: Aufholphase→Ziel, Salz: Warn-/Überbereich, Protein: Zielkorridor 78–90 g).

Changed:
- Save-Flow blockt BP-Einträge ohne Sys+Dia (verhindert 400er vom Trigger).
- Fehlerdiagnose: Detail-Logging bei misslungenen Lifestyle-POSTs, Config/Key-Status im Touch-Log, `getHeaders()` liefert präzise Hinweise.
- Labels der Lifestyle-Balken enthalten Status-Texte und nutzen kontrastreiche Schriftfarben.

Fixed:
- Trigger entfernt Aufruf von `jsonb_object_length` (nicht verfügbar auf Supabase), damit Intake-Insert kein 404/42883 mehr auslöst.

## v1.4.0 (MINOR)

Changed:
- Auth/UX: Biometrie/PIN-Lock nur für Arzt-Ansicht (Vault) statt global nach Login.
- Arzt-Tab, Charts und Exporte prüfen lokal per Passkey/PIN; normale Erfassung bleibt ohne extra Schritt.

Notes:
- Keine serverseitige Step-up-Session; Entsperren ist rein clientseitig. Login weiterhin über Google (Supabase OAuth).
