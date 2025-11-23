# Module Update Plan

Alle Modul-Overviews unter `docs/modules/` sollen auf den aktuellen Stand gebracht werden, bevor wir die Supabase-Proxy-Schicht anfassen. Nachfolgend eine Liste aller vorhandenen Modul-Dokumente mit dem Fokus der Aktualisierung.

| Modul-Dokument | Schwerpunkt | Update-Notizen |
| --- | --- | --- |
| `modules/Assistant Module Overview.md` | Chat/Assistant UI | Prüfen, ob Routing/UX noch dem neuen Hub entspricht. |
| `modules/Auth Module Overview.md` | Login & Guard Flows | Guard-Änderungen (Doctor Unlock) einpflegen. |
| `modules/Capture Module Overview.md` | Intake+Vitals Erfassung | Neue Hub-Panels, Overlay-Logik dokumentieren. |
| `modules/Charts Module Overview.md` | Trendpilot/Diagramme | Abgleichen mit aktuellem Zustand (noch Tabs?). |
| `modules/Diagnostics Module Overview.md` | Diag/Log Panel | Check: Integration in neuen Hub, Buttons abgeschaltet? |
| `modules/Doctor View Module Overview.md` | Arzt-Ansicht | Neue Overlay-Logik + Guard Handling ergänzen. |
| `modules/Hub Module Overview.md` | Orbit/Aura Panels | *Bereits aktualisiert* (23.11.2025). Nur quer-check. |
| `modules/Intake Module Overview.md` | Flüssigkeit & Intake | ✅ Panel UI + Hub-Pills beschrieben (25.11.2025). |
| `modules/Main Router Flow Overview.md` | Legacy Tab Router | ✅ Stand 25.11.2025: beschreibt Hub/Refresh-Orchestrator. |
| `modules/State Layer Overview.md` | App State/Store | ✅ Stand 25.11.2025 – Hub-/Guard-States dokumentiert. |
| `modules/Supabase Core Overview.md` | Supabase Proxy/Core | ✅ Stand 25.11.2025 – Barrel & Guard-State beschrieben. |
| `modules/Trendpilot Module Overview.md` | Trendpilot Features | ✅ Stand 25.11.2025 – Hub/Doctor/Chart Integration beschrieben. |
| `modules/Unlock Flow Overview.md` | Doctor Unlock/AppLock | ✅ Stand 25.11.2025 – Hub Doctor Flow & Guard-State beschrieben. |

**Vorgehen**
1. Jedes Dokument öffnen, gegen aktuellen Code/UI abgleichen und fehlende Bereiche ergänzen.
2. Nach Abschluss jeweils Änderungsdatum im Dokument anpassen (z. B. im Kopfteil).
3. Abschließend einen kurzen Abschnitt im CHANGELOG hinzufügen, sobald alle Module aktualisiert sind.
