# Module Update Plan

Alle Modul-Overviews unter `docs/modules/` sollen auf den aktuellen Stand gebracht werden, bevor wir die Supabase-Proxy-Schicht anfassen. Nachfolgend eine Liste aller vorhandenen Modul-Dokumente mit dem Fokus der Aktualisierung.

| Modul-Dokument | Schwerpunkt | Update-Notizen |
| --- | --- | --- |
| done `modules/Assistant Module Overview.md` | Chat/Assistant UI | Prüfen, ob Routing/UX noch dem neuen Hub entspricht. |
| done `modules/Auth Module Overview.md` | Login & Guard Flows | Guard-Änderungen (Doctor Unlock) einpflegen. |
| done `modules/Capture Module Overview.md` | Intake+Vitals Erfassung | Neue Hub-Panels, Overlay-Logik dokumentieren. |
| done `modules/Charts Module Overview.md` | Trendpilot/Diagramme | Abgleichen mit aktuellem Zustand (noch Tabs?). |
| done `modules/Diagnostics Module Overview.md` | Diag/Log Panel | Check: Integration in neuen Hub, Buttons abgeschaltet? |
| done `modules/Doctor View Module Overview.md` | Arzt-Ansicht | Neue Overlay-Logik + Guard Handling ergänzen. |
| done `modules/Hub Module Overview.md` | Orbit/Aura Panels | *Bereits aktualisiert* (23.11.2025). Nur quer-check. |
| done `modules/Intake Module Overview.md` | Flüssigkeit & Intake | Panel UI statt Accordion dokumentieren. |
| done `modules/Main Router Flow Overview.md` | Legacy Tab Router | Evtl. als „legacy“ markieren oder neuen Flow beschreiben. |
| done `modules/State Layer Overview.md` | App State/Store | Sicherstellen, dass Hub States korrekt beschrieben sind. |
| done `modules/Supabase Core Overview.md` | Supabase Proxy/Core | Nach Proxy-Refactor unbedingt aktualisieren. |
| done `modules/Trendpilot Module Overview.md` | Trendpilot Features | Deckungsgleich mit geplantem Redesign prüfen. |
| done `modules/Unlock Flow Overview.md` | Doctor Unlock/AppLock | Neue Biometrics + `resumeAfterUnlock` Verhalten dokumentieren. |

**Vorgehen**
1. Jedes Dokument öffnen, gegen aktuellen Code/UI abgleichen und fehlende Bereiche ergänzen.
2. Nach Abschluss jeweils Änderungsdatum im Dokument anpassen (z. B. im Kopfteil).
3. Abschließend einen kurzen Abschnitt im CHANGELOG hinzufügen, sobald alle Module aktualisiert sind.

