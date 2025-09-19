[CHANGELOG.md](https://github.com/user-attachments/files/22433029/CHANGELOG.md)
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
