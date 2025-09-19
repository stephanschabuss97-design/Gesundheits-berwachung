[QA_CHECKS.md](https://github.com/user-attachments/files/22433419/QA_CHECKS.md)
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
  - Flags covered: Training, Krank, < 2 L Wasser, > 5 g Salz, Protein ≥ 90 g, NSAR genommen, Valsartan/Forxiga vergessen, Medikamente.

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

