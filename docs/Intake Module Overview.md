# Intake Module – Functional Overview

Dieses Dokument beschreibt das Intake-Modul (Wasser/Salz/Protein) des Gesundheits-Loggers. Ziel ist eine vollständige Referenz, wie das Modul aufgebaut ist, welche Dateien beteiligt sind, wie Daten gespeichert werden und welche UX-/Diagnosefunktionen existieren.

---

## 1. Zielsetzung

Das Intake-Modul erlaubt das tägliche Erfassen von Wasser (ml), Salz (g) und Protein (g), inklusive:
- Schnellbuttons zum Hinzufügen von Mengen.
- Tagesübersicht (Totals, Pill-Anzeige im Header).
- RPC-Speicherung in Supabase + lokale Fallbacks.
- Abhängige Features wie Lifestyle-Bars oder Reset um Mitternacht.

---

## 2. Kernkomponenten & Dateien

| Datei | Zweck |
|-------|-------|
| `assets/js/capture/index.js` | Hauptmodul für Intake-UI: Buttons, Inputs, Status-Pills, RPC-Aufrufe, Timer (Mitternacht/Noon), Warnungen. |
| `assets/js/capture/globals.js` | Shared State (Totals, Timer, Flags), Getter/Setter, Hilfsfunktionen `softWarnRange`, `setBusy`. |
| `assets/css/capture.css` | Layout der Accordions/Buttons, Pill-Styling, Responsiveness. |
| `assets/js/main.js` | Bindet Tab-/Unlock-Events, `requestUiRefresh`, setzt Standarddatum und reagiert auf Intake-Status (z.B. `bp:auto`). |
| `assets/js/supabase/api/intake.js` | RPCs: `loadIntakeToday`, `saveIntakeTotalsRpc`, `cleanupOldIntake`. |
| `docs/QA_CHECKS.md` | Tests für Capture-Flow, Accessibility, Reset und RPC-Fehler. |

---

## 3. Ablauf / Flow

### 3.1 UI-Struktur

- Accordion „Flüssigkeit & Intake“ mit drei Eingabereihen:
  1. Wasser (ml, `cap-water-add`), Button `cap-water-add-btn`.
  2. Salz (g, Textfeld mit `toNumDE`), Button `cap-salt-add-btn`.
  3. Protein (g, Textfeld), Button `cap-protein-add-btn`.
- Infos/Hint (hinzugefügter Wert, Zielhinweis).
- Capture-Pills im Header (`#cap-intake-status-top`) zeigen Tagesstatus.

### 3.2 Status & Speicherung

1. `captureIntakeState` (globals) hält `dayIso`, `totals` und `logged` (bool).
2. Beim Öffnen: `refreshCaptureIntake()` lädt Tagesdaten via `loadIntakeToday({ user_id, dayIso })`.
3. Buttons (`handleCaptureIntake(kind)`) validieren Eingabe, addieren Wert zu Totals, rufen `saveIntakeTotalsRpc`.
4. Nach erfolgreichem Save: UI-Reset (`clearCaptureIntakeInputs`), Update der Pills, optional `requestUiRefresh`.
5. Offline/Not Logged In: Eingaben disabled (`setCaptureIntakeDisabled`), Pill zeigt Hinweis „Bitte anmelden“.

### 3.3 Status-Pills

- `prepareIntakeStatusHeader()` sorgt dafür, dass `cap-intake-status-top` existiert.
- `updateCaptureIntakeStatus()` berechnet:
  - Wasser-Ratio (OK/Warn/Bad vs. `MAX_WATER_ML`).
  - Salz-Ratio (Warn ab 5 g, Bad > MAX_SALT_G).
  - Protein (OK zwischen 78 g und MAX).
- Ergebnis: `<span class="pill {ok|warn|bad}">Label: Wert</span>` + ARIA-Live.
- Seit Trendpilot-Integration: Zusätzliche Pill optional (Trendpilot-Warnung).

### 3.4 Timer & Reset

- `scheduleMidnightRefresh()` → ruft `maybeRefreshForTodayChange({ source: 'midnight' })` und setzt Totals zurück.
- `scheduleNoonSwitch()` → toggelt BP-Kontext, resettet „Abends“-Pane.
- `maybeResetIntakeForToday()` markiert, ob Tagesreset schon lief (`__intakeResetDoneFor`).

### 3.5 Warnungen

- Eingabewarnungen (Wasser/Salz/Protein) via `softWarnRange`.
- BP-Kommentarpflicht (`bp.js`) interagiert mit Intake-Panel über `updateBpCommentWarnings`.
- `diag.add` für Fehler (`capture intake load error`, `save start`, `save network ok` etc.).

---

## 4. Supabase Flow

1. `loadIntakeToday` ruft Stored Function/SQL View, liefert TagesTotals.
2. `saveIntakeTotalsRpc` speichert Totals serverseitig (RPC).
3. `cleanupOldIntake` optional (Cron), um alte Tage zu bereinigen.
4. Netzwerkfehler → diag + UI-Message „Speichern fehlgeschlagen“.

---

## 5. Diagnostik

- Touch-Log: `[capture] loadIntakeToday start/done`, `[capture] click water/salt/protein`.
- `diag.add` protokolliert Save-Status, RPC-Fehler, Auto-Refresh.
- UI meldet Fehler mit `uiError('Bitte gültige ...')` oder `uiError('Speichern fehlgeschlagen...')`.

---

## 6. Abhängigkeiten & Zusammenspiel

- `main.js`: Synchronisiert Datum, Reset, `bp:auto`, Unlock/Tab.
- `capture/globals.js`: Teilt State mit anderen Modulen (z.B. Chart, Lifestyle).
- `doctor/index.js`: Zeigt Totals (Wasser/Salt/Protein) nicht direkt, aber reagiert auf `refreshCaptureIntake`.
- `Trendpilot`: Pill im Header kann Trendpilot-Hinweise anzeigen (Erweiterung in `capture/index.js`).

---

## 7. Erweiterungsideen

- Zusätzliche Metrics (z. B. Kalorien, Kohlenhydrate).
- Historische Intake Charts (Analog Trendpilot, nur für Wasser/Salz/Protein).
- Reminder/Push-Notifications bei zu wenig Wasser.
- Konfigurierbare Ziele (per User-Settings).

---

Aktualisiere dieses Dokument, falls Inputs, RPCs oder UI-Flow geändert werden (z. B. neue Felder, andere Grenzwerte). So bleibt das Intake-Modul transparent für alle Mitwirkenden.
