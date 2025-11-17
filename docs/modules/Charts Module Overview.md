# Charts Module – Functional Overview

Dieses Dokument beschreibt das komplette SVG-Chart-Modul (Blutdruck- und Körperdiagramm) im Gesundheits-Logger. Es dient als Nachschlagewerk für Entwickler, damit klar ist, welche Dateien zusammenwirken, wie Daten fließen und welche UX/Diagnose-Eigenschaften implementiert sind.

---

## 1. Zielsetzung

Die Charts visualisieren Tageswerte (Blutdruck morgen/abend, Körpergewicht/Bauchumfang, Muskel-/Fettanteile) inklusive KPI-Leiste, interaktiven Tooltips und Trendpilot-Layern. Sie sollen:

- Messwerte eines Zeitraums (Standard: „Heute – 90 Tage“) aufbereiten.
- Hovers/Click auf jeden Messpunkt mit einem gemeinsamen Tooltip anzeigen (Sys/Dia/MAP/Pulsdruck beim BP-Chart, Gewicht/Bauch/Muskel/Fett beim Body-Chart).
- Accessibility (Keyboard, ARIA) gewährleisten.
- Besondere Zustände hervorheben (Pulse-Link, Trendpilot-Bänder, MAP/Pulsdruck-Indikatoren).
- Animiert aufgebaut werden (Stroke-dash, Fade/Scale) bei aktivem Feature-Flag.

---

## 2. Kernkomponenten & Dateien

| Datei | Zweck |
|-------|-------|
| `app/modules/charts/index.js` | Hauptmodul: Daten laden (`getFiltered`), Skalen berechnen, SVG rendern (Linien, Punkte, Bars, Trendpilot-Bänder), Tooltip-/Legend-Logik, Pulse-Link. |
| `app/modules/charts/chart.css` | Styling für Chart-Panel, KPI-Leiste, Tooltip, Punkte/Bars und Trendpilot-Bänder/Legende (wird über `app/app.css` importiert). |
| `assets/js/main.js` | Triggert Chart-Refresh via `requestUiRefresh({ chart: true })`, setzt Panel/Hooks (z.B. `setTab('doctor')`). |
| `app/modules/capture/index.js` | Stellt KPI-Werte (Wasser/Salz/Protein) bereit, so dass Chart-Daten/Panel mit Capture-Status synchronisiert sind. |
| `app/modules/trendpilot/index.js` | Liefert Trendpilot-Bänder (Warnung/Kritik) für das Chart (`chartPanel.loadTrendpilotBands`). |
| `app/modules/doctor/index.js` | Chart-Button im Arzt-Bereich (`#doctorChartBtn` öffnet das Chart-Panel mit gewähltem Zeitraum). |
| `app/core/config.js` | Enthält Flags (z.B. `SHOW_CHART_ANIMATIONS`, `TREND_PILOT_ENABLED`), die das Chart respektiert. |

---

## 3. Ablauf & Datenfluss

### 3.1 Datenbeschaffung (`chartPanel.getFiltered`)

1. Liest Zeitraum `from/to` aus der Arzt-Ansicht.
2. Falls Nutzer eingeloggt: `fetchDailyOverview(from, to)` (Supabase) – liefert strukturierte Tagesobjekte (`morning`, `evening`, `weight`, `notes`).
3. Transformiert in flache Einträge (`context` + `ts`) für Morgen/Abend + Tagessummary.
4. Offline-Fallback: `getAllEntries()` (IndexedDB) + Filter nach Datum.

### 3.2 Zeichnen (`chartPanel.draw`)

1. Auswahl `metricSel` (`bp` oder `weight`).
2. Nutzt `series`-Definitionen:
   - BP: `Sys/Dia` (Morgen/Abend) → Linien + Punkte, Pulse-Pressure und MAP berechnet.
   - Body: Gewicht/Bauchumfang → Linien; Muskel/Fett in `barSeries`.
3. Skalen & Layout: `x` (Datum, mit flex. Padding), `y` (dynamisch, optional Offsets).
4. Rendering:
   - Linien (`<path>`) + Punkte mit ARIA/Tooltip-Daten (`data-date`, `data-ctx`, `data-series-label`, `data-value-label`).
   - Body-Bars (Muskel/Fett) mit `chart-bar`-Klasse.
   - Pulse-Link: Bei BP-Hover wird das Messpaar (Sys/Dia) über `<line>` verbunden.
   - Zielbereiche („Goal Bands“) und Trendpilot-Bänder (`<rect class="trendpilot-band ...">`).
   - Grid/Achsen + Schwellenlinien (130/90 mmHg).
   - Legende: gilt für Linien/Bars + Trendpilot-Swatches.

### 3.3 Tooltip & Interaktion

1. Tooltip (`.chart-tip`) wird neben Maus/Fokus angezeigt; ARIA-Live-Region (`#chartAria`) liefert textliche Ausgabe.
2. BP-Tooltip zeigt Datum/Kontext, Sys+Dia, berechnete MAP + Pulsdruck, Kommentar/Notizen; MAP/Pulsdruck erhalten farbige Indikator-Kugeln.
3. Body-Tooltip kombiniert Gewicht, Bauchumfang, Muskel- und Fettwerte; highlightet alle Linien.
4. Keyboard: Punkte/Bars haben `tabindex=0`, `role=button`, `aria-label`.
5. Pulse-Link wird nur gezeichnet, wenn es für beide Messungen (Morning/Evening) valide Koordinaten gibt.
6. Trendpilot-Layer reagiert ebenfalls auf Hover (Pill/Legend), blockiert aber keine Pointer-Events (rects sind `pointer-events="none"`).

### 3.4 Animationen

- `chartPanel.applyChartAnimations`: setzt stroke-dashoffset/opacity/scale für Linien/Punkte/Bars.
- Aktiv, wenn `SHOW_CHART_ANIMATIONS && !prefers-reduced-motion`.

---

## 4. Feature-Liste

1. **BP-Chart**
   - ESC-2018 Tooltip-Hintergrund (optimal → Grad III).
   - MAP & Pulsdruck Indikatoren (Farben nach klinischen Schwellen).
   - Pulse-Link (verbindet Sys/Dia Jungen/Abend).
   - Tooltip + Live-Region zeigen Sys/Dia/MAP/Pulsdruck + Kommentare.
   - Trendpilot-Bänder hinter den Linien.

2. **Body-Chart**
   - Gewicht + Bauchumfang Linien, Muskeln/Fett Bars (relativ zu 75 kg Baseline).
   - Tooltip fasst alle vier Werte + Notiz zusammen.

3. **Legend & KPI Box**
   - Legend zeigt alle Serien (inkl. Trendpilot-Swatches).
   - KPI Box (top) berechnet Durchschnitt Sys/Dia/MAP/Pulsdruck bzw. BMI/WHtR (letzte Werte) je nach Metric.

4. **Accessibility**
   - Keyboard-fokusierbare Punkte/Balken.
   - ARIA-Live Region für Screenreader.
   - defensive Checks (kein Crosshair bei fehlenden `cx/cy`, `CSS.escape` bei Selektoren etc.).

---

## 5. Diagnostik

- `diag.add('[chart] ...')` an mehreren Stellen:
  - Trendpilot-Band-Load (`[chart] trendpilot bands failed ...`).
  - UI-Refresh (`[ui] refresh start/end reason=...` via `main.js`).
  - Touch-Log zeigt `trendpilot:latest`, `Pulse link errors`, `capture load errors` etc.
- Konsolenwarnungen, falls `CSS.escape`/`document` nicht verfügbar (Fallbacks).
- Animationsflag kann deaktiviert sein – Chart prüft Flag + `prefers-reduced-motion`.

---

## 6. Speicher-/Flow-Zusammenspiel

1. **Capture Tab** sammelt Tagesdaten → `fetchDailyOverview`.
2. **Doctor Tab** bestimmt Range + ruft Chart-Panel (Button) oder `setTab('doctor')`.
3. **Trendpilot** sendet Bänder per `loadTrendpilotBands`.
4. **Supabase** (via `supabase/index.js`) liefert API für `fetchDailyOverview` + `fetchSystemCommentsRange`.
5. **Config** (`config.js`) bestimmt Flags (Animations, Feature-Enable).

---

## 7. Erweiterungsideen

- Zusätzliche Metriken (z. B. Pulsdruck-Linie, MAP-Bars).
- Export-Funktion (SVG/PNG).
- Konfigurierbare Range-Selector (z. B. 30/60/180 Tage).
- Theme/Color-Adjustments mittels CSS Custom Properties.

---

Bei Änderungen am Chart (z. B. neue Serien, zusätzliche Tooltips) sollte diese Datei aktualisiert werden, damit zukünftige Arbeiten sich auf dieselbe Wissensbasis stützen können.

