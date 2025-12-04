# Diagnostics Module – Functional Overview

Dieses Dokument beschreibt das Diagnostics-Layer des Gesundheits-Loggers. Es umfasst das UI-Diagnosepanel, die Logging-/Perf-Sampler sowie das neue Layer unter `app/diagnostics/*`, das künftig Dev-/QA-Features (Logger, Monitor, Perf) bündelt und via Feature-Flag gesteuert wird.

---

## 1. Zielsetzung

Diagnostics liefert sicht- und unsichtbare Hilfen für Entwickler/QA:
- Touch-Log/Diag-Panel im UI mit `diag.add`-Stream.
- Einheitliche Fehler-/Info-Anzeigen via `uiError` / `uiInfo`.
- Performance-Sampling (z. B. Draw-/Header-Metriken) für Charts/Capture.
- Monitoring-Herzschlag & Logger-History für zukünftige Remote-Debugging-Fälle.

Alle Komponenten lassen sich über `DIAGNOSTICS_ENABLED` deaktivieren (z. B. produktive Deployments ohne Logger).

---

## 2. Kernkomponenten & Dateien

| Datei | Zweck |
|-------|-------|
| `app/core/config.js` | Stellt `DIAGNOSTICS_ENABLED` bereit (Flags von Config/LocalStorage/data-Attr). |
| `app/core/diag.js` | Layer-Orchestrator: Touch-Log UI, `diag.add`, `uiError`, `uiInfo`, global `perfStats`-Proxy. |
| `app/diagnostics/logger.js` | Ringpuffer für Logs, API `diagnosticsLayer.logger.add/flush`. |
| `app/diagnostics/perf.js` | Performance-Sampler (Bucket-Store, `record`, `addDelta`, `snapshot`). |
| `app/diagnostics/monitor.js` | Heartbeat/Toggle-API für zukünftige Overlays, steuert `diagnosticsLayer.monitor`. |
| `index.html` | Lädt Config → `app/core/diag.js` → `app/diagnostics/{logger,perf,monitor}.js` in dieser Reihenfolge (aktueller Hub-Stand). |
| `docs/QA_CHECKS.md` | Enthält die Diagnostics-Layer-Checks/Flags (Phase 4 Abschnitt). |

---

## 3. Ablauf / Datenfluss

### 3.1 Boot & Feature-Flag

1. `app/core/config.js` liest `DIAGNOSTICS_ENABLED` aus `window`, `localStorage` oder `data-diagnostics-enabled`.
2. `app/core/diag.js` prüft das Flag:
   - **AN**: baut das UI-Modul auf, richtet `diag.add`, `uiError`, `uiInfo`, global `perfStats` ein und bindet das Diagnostics-Layer (Forwarding).
   - **AUS**: liefert Stub-API (No-Op Logger, Warnungen nur in der Konsole).
3. `app/diagnostics/logger.js` bootet und registriert `diagnosticsLayer.logger`, optional mit `DOMContentLoaded`-Logeintrag.
4. `app/diagnostics/perf.js` stellt `diagnosticsLayer.perf` bereit; `app/core/diag.js` ruft bei jedem `recordPerfStat` → `perf.record`.
5. `app/diagnostics/monitor.js` liefert Heartbeats (`monitor.heartbeat()`) und Toggle-State (`monitor.toggle()`), die vom diag-Panel genutzt werden.

### 3.2 Logging / Touch-Panel

- `diag.add(msg)`:
  1. schreibt in `this.lines` (max 80 Einträge) und aktualisiert `#diagLog`.
  2. forwarded zu `diagnosticsLayer.logger.add` mit Kontext (`{ source: 'diag.add' }`).
  3. sendet Heartbeat via `diagnosticsLayer.monitor.heartbeat('diag-add')`.
- UI-Interaktionen (`diag.show()`, `diag.hide()`) toggeln `diagnosticsLayer.monitor`.
- Globale Fehler:
  - `unhandledrejection` Listener injiziert UI-Fehler (`errBox`) oder loggt in der Konsole.
  - `uiError` (Visueller Fehler) + `uiInfo` (Statusmeldungen) schreiben in DOM oder fallbacken auf Console.

### 3.3 Performance-Sampling

- Alte Calls (`perfStats.add`, `perfStats.snap`, `recordPerfStat`) bleiben bestehen, delegieren aber an `diagnosticsLayer.perf`.
- `diagnosticsLayer.perf.record(key, startedAt)` berechnet `performance.now() - startedAt`, validiert Keys und legt Samples ab.
- `diagnosticsLayer.perf.snapshot(key)` liefert `count`, `p50`, `p90`, `p99` – wird von Charts/Capture genutzt (`perfStats.snap('drawChart')` etc.).

### 3.4 Monitor & Heartbeats

- `diagnosticsLayer.monitor` hält `isActive` + `lastHeartbeat`.
- `monitor.heartbeat(reason)` landet im Logger (z. B. `diagnostics heartbeat`).
- `monitor.toggle(state)` protokolliert Panel-Öffnungen / künftige Overlays; diag.show/hide nutzt diese API.

### 3.5 Boot-Error Overlay

- `app/core/boot-flow.js` schreibt Boot-Phasen weiter in das Touch-Log und pflegt zusätzlich einen Fehlerzustand (`setBootErrorState`).
- Sobald `bootFlow.markFailed()` oder der Stage-Hang-Timer greift, blendet der Bootscreen eine Fehlertafel ein (`#bootErrorPanel`), die automatisch den letzten `diag.add`-Text und Detailhinweis übernimmt.
- Der Button „Touch-Log öffnen“ im Panel verwendet direkt `diag.show()`, damit QA auch bei blockierter UI sofort die Diagnose-Liste sieht.
- Damit ist das Diagnostics-Layer jetzt sowohl über den Hub als auch über den Bootscreen erreichbar; QA muss nicht mehr auf `INIT_UI` warten, um Logeinträge zu prüfen.

---

## 4. Diagnose / QA Checks

- `DIAGNOSTICS_ENABLED=false` → Stub-API (nur Warnungen), Logger-Ready-Event; QA siehe `docs/QA_CHECKS.md`.
- Diagnostics-Layer forwarding (QA-Punkt):
- Touchlog Phase 0.5: `app/core/diag.js` aggregiert identische Messages ?ber ein 4?s-Fenster und bietet Summary-Entries (`Boot: ?`, `Resume: ?`). QA pr?ft, dass nur noch ein Start/Ende pro Reason erscheint und `(xN)` ausschlie?lich am zusammengefassten Eintrag h?ngt.
  - `diag.add` sollte `diagnosticsLayer.logger.history` füllen.
  - `recordPerfStat('drawChart', start)` erzeugt `diagnosticsLayer.perf.snapshot('drawChart')` mit steigender `count`.
  - Öffnen/Schließen des diag-Panels toggelt `diagnosticsLayer.monitor` und erzeugt Heartbeats.
- Edge-Case: Bei fehlenden Layern (fehlerhafte Script-Reihenfolge) protokolliert `app/core/diag.js` Warnungen.

---

## 5. Sicherheits-/Edge Cases

- Feature-Flag kann per `data-diagnostics-enabled="false"` oder LocalStorage deaktiviert werden (auch für Prod).
- Logger-Puffer (100 Einträge) schützt vor Memory-Stau; `flush()` verfügbar für zukünftige Uploads.
- Performance-Buckets begrenzt (max 20 Keys, 50 Samples pro Key) – überschüssige Keys werden verworfen.
- `perfStats` Proxy verhindert Brüche für Legacy-Skripte (`assets/js/main.js`, Charts-Bundles).
- Heartbeat-Interval aus `monitor` (10s) läuft nur, wenn Flag aktiv ist → kein Idle-Noise in Prod.

---

## 6. Erweiterungsvorschläge

- Remote-Diagnostics: Logger-/Perf-Dumps via Supabase Function hochladen.
- UI-Overlay für `diagnosticsLayer.monitor` (Visualisierung von Heartbeats, Perf-Snapshots).
- Konfigurierbare Perf-Buckets (z. B. `CONFIG.DIAGNOSTICS_PERF_KEYS`).
- CLI/DevTools-Befehle (`window.AppModules.diagnosticsLayer.*`) für schnelles QA-Debugging.

---

Bei Änderungen am Diagnostics-Layer (z. B. zusätzliche Module, neue Flags, Remote-Streaming) sollte dieses Dokument aktualisiert werden, damit alle Beteiligten wissen, wie Touch-Log, Perf-Sampler und Monitor zusammenspielen.
