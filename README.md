[README.md](https://github.com/user-attachments/files/22867088/README.md)
# Gesundheits-Logger

Der Gesundheits-Logger ist eine offlinefaehige Web-App zur Erfassung, Auswertung und Synchronisation von Gesundheitsdaten. Die Anwendung laeuft komplett im Browser, speichert Daten in IndexedDB und kann optional ueber Supabase mit der Cloud synchronisieren.

---

## Kernfunktionen

- **Capture (Tageserfassung)**
  - Blutdruck Morgens/Abends inkl. Kommentarpflicht bei Grenzwerten.
  - Koerperwerte: Gewicht, Taille sowie optional Prozent Fett und Prozent Muskel.
  - Freitext-Kommentar fuer Tagesereignisse direkt im Body-Panel.
  - Intake-Accordion fuer Wasser, Salz und Protein mit Tages-Pills und Fortschrittsbalken.
  - Trendpilot-Pill im Header verlinkt auf aktuelle Warnungen/Kritik (inkl. Chart-/Doctor-Verknuepfung).

- **Header-Status (v1.6.4 bis v1.7.0)**
  - Intake-Pills und Termin-Badge direkt unter dem Datumsfeld.
  - Vollstaendige ARIA-Labels, fokusierbar, Live-Region fuer Screenreader.
  - Telemetrie misst Render-Zeiten (p50/p90/p95) und schreibt in das Diagnose-Log.

- **Arzt-Ansicht**
  - Tageskarten mit Datum/Cloud-Status, Messungen, Gewicht und Kommentar.
  - Cloud-Loeschung einzelner Tage, Export als JSON.
  - Zugriff nur nach lokalem Unlock (Passkey oder PIN).

- **Diagramm (Daily)**
  - SVG-Chart fuer Blutdruck und Koerperdaten, inklusive Tastatur- und Tooltip-Unterstuetzung.
  - Muskel- und Fettbalken (kg) hinter dem Gewicht-Chart (v1.6.8), per Feature-Flag deaktivierbar.
  - Trendpilot-Baender plus Legenden-Swatches (Warnung/Kritisch).

- **Synchronisation, Diagnostics und Logging**
  - Google OAuth (anon Key) + Supabase REST/Realtime.
  - Diagnosepanel (Touch-Log) zeigt Keys, Fehler und Performance-Metriken.
  - Diagnostics-Layer (`app/diagnostics/{logger,perf,monitor}.js`) mit Feature-Flag `DIAGNOSTICS_ENABLED`.

- **Readiness (Phase 4)**
  - Assistant-Modul vorbereitet (`app/modules/assistant/` + Doc).
  - PWA/TWA-Struktur unter `public/` vorhanden (SW/TWA folgen separat).
  - Capture-Hub V2 Layout (MIDAS UI) per Flag `CAPTURE_HUB_V2` testbar.

- **Export**
  - JSON-Export (gesundheitslog.json) fuer Aerztinnen und Aerzte.

---

## Schnellstart

1. Repository klonen oder ZIP entpacken.
2. `index.html` im Browser oeffnen (kein Build notwendig; Bundle liegt unter `app/`).
3. Daten werden automatisch in IndexedDB gespeichert.
4. Optional Supabase konfigurieren (Konsole → `putConf`):
   - `webhookUrl = https://<project-ref>.supabase.co/rest/v1/health_events`
   - `webhookKey = Bearer <ANON_KEY>` (service_role wird clientseitig blockiert)
5. Mit Google anmelden → Capture- und Termin-Daten synchronisieren sich, Realtime aktualisiert die UI.

### Arzt-Ansicht entsperren

- Beim ersten Wechsel erscheint ein lokales Entsperr-Overlay.
- Empfehlung: Passkey (Windows Hello, Touch ID, Face ID). Alternativ lokale PIN setzen.
- Unlock gilt fuer Arzt-Ansicht, Diagramm und Export; Capture bleibt frei verfuegbar.

---

## Bedienhinweise

- **BP-Kontext Auto-Switch (v1.6.5)**: 00:00 → Morgens, 12:05 → Abends. Manuelle Auswahl bleibt bis Tageswechsel bestehen.
- **Intake-Pills & Termin-Badge**: Screenreader hoeren "Tagesaufnahme: Wasser 1800 ml (Warnung) ..." bzw. "Kein Termin geplant".
- **Koerper-Chart**: Muskel- und Fettbalken erscheinen nur bei vorhandenen kg-Werten. Flag `SHOW_BODY_COMP_BARS` kann deaktiviert werden.
- **Diagnosepanel**: `perfStats` Eintraege (z. B. `header_intake`, `header_appt`, `drawChart`) geben Hinweise auf Performance und QA-Messungen.

---

## Supabase & Sicherheit

- Nur anon Keys erlaubt; service_role wird clientseitig blockiert.
- REST-Aufrufe laufen gegen RLS-geschuetzte Tabellen/Views (`health_events`, `appointments`, `v_events_*`).
- Sessions und Keys verbleiben in IndexedDB; keine sensiblen Daten im Quellcode.
- Keine externen Server ausser Supabase: Die App verarbeitet Daten vollständig im Browser.

---

## Troubleshooting & QA

- Detailierte Testfaelle befinden sich in `QA_CHECKS.md`.
- Typische Hinweise:
  - Badge zeigt "Kein Termin geplant": Done-Button bleibt ausgeblendet (erwartet).
  - Capture-Save bricht ab: Fehlermeldung in `#err` und Diagnosepanel pruefen.
  - Netzwerkprobleme: Telemetrieeintraege und REST-Logs im Diagnosepanel betrachten.

## QA & Smoke-Tests

- **Headless DOM Check:** `msedge --headless --disable-gpu --dump-dom file:///.../index.html`.
- **Static-Server Probe:** `python -m http.server 8765` und `Invoke-WebRequest http://127.0.0.1:8765/app/app.css`.
- **Flag-Checks:** `localStorage.setItem('DIAGNOSTICS_ENABLED','false')` testet den Stub-Modus.
- Weitere Szenarien (Capture, Doctor, Chart, Trendpilot, Offline) siehe `docs/QA_CHECKS.md`.

---

## Versionierung

Semantic Versioning, Highlights:

- **1.7.0** – Integrationspass, A11y/Telemetry, Feature-Freeze.
- **1.6.x** – Arzttermine, Intake-Header, BP-Auto-Switch, Koerper-Komposition.
- **1.5.x** – Panelisierte Capture-Workflows, Intake-Accordion, Resume-/Timeout-Fixes.

Komplette Historie siehe `CHANGELOG.md`.

---

## Beitrag & Feedback

Pull Requests, Issues und Ideen sind willkommen. Bitte ASCII (ae/oe/ue) verwenden und Patches knapp kommentieren. Viel Erfolg mit dem Gesundheits-Logger!
