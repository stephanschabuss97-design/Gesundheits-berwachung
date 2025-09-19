## v1.1.0 (MINOR)

- Replace sugar flag with protein flag across UI/DB/Admin.
- UI: introduce `protein_high90` (Protein ≥ 90 g) toggle and badge.
- JS: rename internal day flag to `protein_ge90`; add runtime migration from legacy `sugarHighToggle` to `proteinHighToggle` to avoid layout breakage.
- SQL: update `day_flags` validation keys and `v_events_day_flags` view to use `protein_high90`.
- Admin checks: allow `protein_high90` and drop `sugar_high`.

Notes:
- Backward compatibility: existing events with `sugar_high` are not referenced anymore; new events use `protein_high90`.
  If historical data exists, consider a one-off migration.
