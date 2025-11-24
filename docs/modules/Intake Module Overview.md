# Intake Module – Functional Overview

Dieses Dokument beschreibt das Intake-Modul (Wasser/Salz/Protein) im aktuellen MIDAS Hub. Ziel ist eine vollständige Referenz, welche Dateien beteiligt sind, wie Daten gespeichert werden und welche UX-/Diagnosefunktionen existieren.

---

## 1. Zielsetzung

Das Intake-Modul erlaubt das tägliche Erfassen von Wasser (ml), Salz (g) und Protein (g), inklusive:
- Schnellbuttons zum Hinzufügen von Mengen
- Tagesübersicht (Totals + Pills im Hub-Header)
- Speicherung via Supabase-RPC inklusive Offline-Fallback
- Automatische Resets (Mitternacht/Noon) und Warnlogik

---

## 2. Kernkomponenten & Dateien

| Datei | Zweck |
|-------|-------|
| `app/modules/hub/index.js` | Orchestriert den Orbit-Button, öffnet/schließt das Intake-Panel (`openIntakeOverlay`) und verschiebt die Pills in den Hub-Header. |
| `app/modules/capture/index.js` | Enthält die komplette Intake-Fachlogik: Inputs, Validierungen, RPC-Aufrufe, Timer (Mitternacht/Noon) und Warnungen. |
| `app/core/capture-globals.js` | Shared State (Totals, Timer, Flags), Getter/Setter sowie Helper (`softWarnRange`, `setBusy`). |
| `app/styles/hub.css` | Styles für Hub-Orbit, Panel-Layout, Pills und Overlay-Effekte. |
| `app/supabase/api/intake.js` | RPCs `loadIntakeToday`, `saveIntakeTotalsRpc`, `cleanupOldIntake`. |
| `docs/QA_CHECKS.md` | Testplan für Capture-Flow, Accessibility und Fehlerfälle. |

---

## 3. Ablauf / Flow

### 3.1 UI-Struktur (Hub-Panel)
- Der Orbit-Button „Intake“ ruft `openIntakeOverlay` auf und zeigt das Panel mittig im Hub.
- Die drei Eingabereihen stammen weiterhin aus `capture/index.js` und werden in das Panel gerendert:
  1. Wasser (ml, `cap-water-add`, Button `cap-water-add-btn`).
  2. Salz (g, `cap-salt-add`, Button `cap-salt-add-btn`).
  3. Protein (g, `cap-protein-add`, Button `cap-protein-add-btn`).
- Hinweise zu zuletzt hinzugefügten Mengen stehen direkt unter dem jeweiligen Feld.
- Die Tages-Pills (`#cap-intake-status-top`) werden beim Hub-Init in den Header-Bereich eingebettet (`moveIntakePillsToHub`).

### 3.2 Status & Speicherung
1. `captureIntakeState` hält `dayIso`, `totals` und `logged`.
2. Beim Öffnen ruft `refreshCaptureIntake()` `loadIntakeToday({ user_id, dayIso })` auf.
3. Buttons (`handleCaptureIntake(kind)`) validieren Eingaben, addieren zur laufenden Summe und rufen `saveIntakeTotalsRpc`.
4. Nach erfolgreichem Save: `clearCaptureIntakeInputs`, Pill-Update, optional `requestUiRefresh` für abhängige Module.
5. Ohne Login werden Inputs deaktiviert (`setCaptureIntakeDisabled`) und das Panel weist auf „Bitte anmelden“ hin.

### 3.3 Status-Pills
- `prepareIntakeStatusHeader()` stellt sicher, dass `cap-intake-status-top` existiert.
- `hub/index.js` hängt das Element in den Hub-Header (neben Datum und Vital-Pills).
- `updateCaptureIntakeStatus()` berechnet Wasser/Salz/Protein-Farben (OK/Warn/Bad) und optional Trendpilot-Warnungen.

### 3.4 Timer & Reset
- `scheduleMidnightRefresh()` ? `maybeRefreshForTodayChange({ source: 'midnight' })` setzt den State zurück.
- `scheduleNoonSwitch()` toggelt `bp:auto` (morgens/abends) und resettet abendspezifische Felder.
- `maybeResetIntakeForToday()` schützt vor Doppel-Resets (`__intakeResetDoneFor`).

### 3.5 Warnungen & UX
- `softWarnRange` erzeugt Eingabewarnungen bei ungewöhnlichen Mengen.
- BP-Kommentarpflicht (`bp.js`) informiert den Intake-Flow via `updateBpCommentWarnings`.
- Fehler (Netzwerk, RPC, Validierung) werden über `diag.add` und `uiError` gemeldet.

---

## 4. Supabase Flow
1. `loadIntakeToday` liest Tageswerte aus der View/Funktion `health_intake_today`.
2. `saveIntakeTotalsRpc` persisted Totals serverseitig; Hub-UI refresh passiert über `refreshCaptureIntake`.
3. `cleanupOldIntake` entfernt alte Datensätze (Cron / Maintenance).
4. Netzwerkfehler ? `diag.add('capture intake save error', …)` + UI-Hinweis „Speichern fehlgeschlagen“.

---

## 5. Diagnostik
- Touch-Log: `[capture] loadIntakeToday start/done`, `[capture] click water/salt/protein`.
- `diag.add` protokolliert Saves, Warnungen und RPC-Fehler.
- QA-Dokument listet Tests für Offline, Timer, Trendpilot-Hinweise und Panel-Verhalten im Hub.

---

## 6. Abhängigkeiten & Zusammenspiel
- `hub/index.js` steuert Orbit-Button, Panel-Animation, Pill-Migration und Panel-Lock.
- `capture/index.js` + `capture-globals.js` liefern sämtliche Business-Logik, RPC-Aufrufe und Timer.
- `doctor`-Panel ruft nach Biometrics ebenfalls `refreshCaptureIntake()` auf, damit Totals synchron bleiben.
- Trendpilot, Charts und Diagnostics beziehen ihren Intake-Status über den gemeinsamen State.

---

## 7. Erweiterungsideen
- Weitere Makros (Kalorien, Kohlenhydrate) einführen und im gleichen Panel erfassen.
- Historische Intake-Charts (analog Trendpilot) direkt im Hub.
- Reminder/Push-Notifications bei zu wenig Wasser.
- Benutzerdefinierte Ziele (per Settings) statt fixer Grenzwerte.

---

Aktualisiere dieses Dokument, sobald Felder, RPCs oder der Hub-Flow angepasst werden.
