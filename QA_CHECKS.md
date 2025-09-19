[QA_CHECKS.md](https://github.com/user-attachments/files/22433030/QA_CHECKS.md)
QA Checklist for v1.1.0 Protein Flag

- UI
  - Day toggle shows only “Protein ≥ 90 g”.
  - Button has id `proteinHighToggle` at runtime and toggles correctly.
  - Doctor view badge shows “Protein ≥ 90 g”.
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
  - Admin checks “unknown keys” list contains `protein_high90` and not `sugar_high`.

- Cross-Consistency
  - UI id: `proteinHighToggle`; SQL key: `protein_high90`; Badge text: “Protein ≥ 90 g”.
  - Full-text search shows no `sugar_high` across codebase.

- Versioning
  - Impact MINOR. Next version: v1.1.0.
