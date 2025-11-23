# Assistant Module – Readiness Overview

Dieses Dokument skizziert das geplante Assistant/KI-Modul (Codename „Zeus“). Phase 4 verlangt lediglich Struktur & Readiness: Es wird noch keine KI- oder API-Logik implementiert, sondern nur Verzeichnisse, Flags und Schnittstellen vorbereitet.

---

## 1. Zielsetzung

Das Assistant-Modul soll zukünftig:
- Patient:innenfragen beantworten (Chat/KI-Assistent).
- Prompts mit Vitaldaten verknüpfen (Supabase + Functions/OpenAI).
- Diagnose-/Trendpilot-Empfehlungen ergänzen.

Aktueller Stand (Phase 4): Nur Ordner & Minimal-API (`appModules.assistant`) existieren, damit weitere Schritte geplant werden können.

---

## 2. Kernkomponenten & Dateien (Readiness)

| Datei | Zweck |
|-------|-------|
| `app/modules/assistant/index.js` | Platzhalter mit MODULE-Header, exportiert `AppModules.assistant` + `init()` stub. |
| `app/core/config.js` | Wird später ein Flag `ASSISTANT_ENABLED` o. Ä. aufnehmen (noch nicht gesetzt). |
| `docs/modules/Assistant Module Overview.md` | Dieses Dokument: beschreibt Ziel, Struktur, nächste Schritte. |
| `docs/Module Update Plan.md` | Enthält den aktuellen Pflegeplan für alle Modul-Dokumente inkl. Assistant. |

---

## 3. Struktur / Datenfluss (geplant)

1. **Ordner:** `app/modules/assistant/` reserviert. Spätere Unterordner: `services/`, `ui/`, `prompts/`.
2. **Einbindung:** `index.html` wird erst angepasst, sobald echte Logic existiert (derzeit kein `<script>`-Tag).
3. **API:** `AppModules.assistant` steht bereit für zukünftige Hooks (`init`, `ask`, `abort`, `setContext`).
4. **Supabase Hooks:** Modul wird Supabase Functions/Edge/Realtime nutzen; Readiness-Vermerk in `docs/modules/Supabase Core Overview.md` nötig, sobald konkrete Pfade definiert sind.

---

## 4. Readiness Checklist (Phase 4)

- [x] Ordner `app/modules/assistant/` angelegt.
- [x] Platzhalterdatei mit MODULE-/Notes-Header vorhanden.
- [ ] Feature-Flag/eigene Config-Einträge (geplant für Implementierungsphase).
- [ ] QA-Plan für KI-Module (z. B. `docs/QA_CHECKS.md` Abschnitt) → folgt mit echter Logik.

---

## 5. Sicherheits-/Edge Cases (zukünftig)

- KI/Prompt-Safety (PHI, Datenminimierung).
- Rate-Limits/Timeouts bei Supabase/OpenAI.
- Offline-Fallback (Assistent deaktiviert).
- UI/Accessibility (Chat-Interface, Screenreader).

---

## 6. Nächste Schritte

1. Spezifikation für Prompts/Flows (z. B. in `docs/Zeus Technical Notes.md`).
2. Config-Flag + Router-Anbindung (z. B. eigener Tab/Panel).
3. Implementation in separatem PR/Phase.

Bis dahin dient dieses Dokument als Ankerpunkt, damit Contributor wissen, dass das Assistant-Modul bewusst „leer“ ist und später befüllt wird.
