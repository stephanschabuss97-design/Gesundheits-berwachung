# Assistant Appointments Proto Overview

**Status**: Phase 3.1 prototype  
**Scope**: Context-only appointment teaser for the Assistant panel. No write actions.

## Purpose
- Provide quick context in the new Assistant Butler header.
- Mimic the upcoming appointments module until the real Phase 4 implementation lands.
- Feed the Assistant text chat with the same context that MIDAS reads when preparing meal suggestions.

## UI Surface
- Lives in the Assistant panel (`assistant-appointments` block).
- Shows up to 2 items, each rendered as `Label • Datum/Zeit`.
- Falls back to “Keine Termine geladen.” when nothing is available.

## Data Flow
1. `AppModules.hub.refreshAssistantContext()` calls `fetchAssistantAppointments({ limit:2 })`.
2. The helper looks for:
   - `AppModules.appointments.getUpcoming(limit, { reason })`
   - `AppModules.appointments.getUpcomingAppointments(...)`
   - `AppModules.appointments.upcoming` (`Array`)
   - `AppModules.appointments.mockUpcoming` (`Array`)
3. Returned entries are normalized (`{ id, label, detail }`). Invalid entries are skipped.
4. If no data source is available, a mock list is generated:
   - `Hausarzt – Kontrolle` (nächster Tag, 07:45)
   - `Nephrologie – Blutdruck` (drei Tage später, 13:30)

## Integration Hooks
- Hook point for future module: expose `window.AppModules.appointments.getUpcoming(limit, context)` which resolves to an array of `{ id, label, detail?, start?, date? }`.
- No network requests are triggered from the hub if a snapshot already exists. The real module should own caching and freshness.
- To disable mocks (once live data exists) simply return a non-empty array from `getUpcoming`.

## Diagnostics / QA
- Touch log entries appear as `[assistant-context] appointments fetch failed …` only when fetches break.
- QA expectations:
  - Assistant panel opening shows 0–2 appointments without duplicate log spam.
  - When the backend module provides data, mocks disappear automatically.

## Next Steps (Phase 4+)
- Replace mock with REST/Realtime backed appointments service.
- Extend the context so the Assistant can auto-suggest rescheduling or prepping for visits.
- Wire up a “Termin-Teaser” action chip (tap → opens Doctor/Historie Panel once available).
