# Hub Module – Functional Overview

Dieses Dokument beschreibt das MIDAS-Hub-Modul, den zentralen Einstiegspunkt für das neue Orbit-Interface. Ziel ist eine Referenz, die Aufbau, Zuständigkeiten und Erweiterungsoptionen abbildet.

---

## 1. Scope & Entry Points

| Typ | Datei/Beschreibung |
| --- | --- |
| Entry Script | `app/modules/hub/index.js` – aktiviert das Hub-Layout, bindet Buttons, steuert Panels |
| Stylesheet | `app/styles/hub.css` – Orb-Größen, Glow, Button-States, Panel-Look |
| Markup-Anker | `<section class="hub" id="captureHub">` in `index.html` mit Orbit-Buttons + Panels |

Das Hub ersetzt die klassische Tab-Navigation und dient als Launcher für Intake-, Vitals-, Doctor-Panel sowie zukünftige KI-Module.

---

## 2. Verantwortlichkeiten

1. **Orbit-Aktivierung**  
   - Setzt `hub-mode` auf `<body>` (versteckt alte Capture-Header).  
   - Verschiebt Intake-Status-Pills in den Hero (`moveIntakePillsToHub`).

2. **Panel-Steuerung**  
   - Buttons mit `data-hub-module` öffnen Panels (`hub-panel` Sektionen).  
   - `setupIconBar()` synchronisiert `aria-pressed`, kümmert sich um Touch/Click, ESC schließt.

3. **Orbit-Hotspots**  
   - `setupOrbitHotspots()` berechnet Button-Positionen radialsymmetrisch.  
   - Berücksichtigt Desktop/Mobile Radius (0.45 / 0.50) via `ResizeObserver`.

4. **Datum & Status**  
   - Date-Pill bleibt Single Source of Truth (`#date` Input).  
   - Vitals-Panel zeigt Inline-Datepicker; Änderungen triggern restliche Module.

5. **Modal/Accessibility**  
   - Panels behalten Fokus, ESC schließt.  
   - Buttons sind echte `<button>`-Elemente mit ARIA-Labels.

---

## 3. Orbit-System im Detail

```js
const ORBIT_BUTTONS = {
  north: { angle: -90 },
  ne:    { angle: -45, radiusScale: 0.88 },
  e:     { angle: 0 },
  ...
};
```

- **Angle** in Grad, 0° = Osten.  
- **radiusScale** optional (z. B. diagonale Buttons etwas näher am Zentrum).  
- Radius-Basisfaktor:  
  - Desktop `0.45 * (Orb-Durchmesser/2)`  
  - Mobile `0.5 * ...`  
- JS schreibt die berechneten Pixelwerte nach `style.left/top`; CSS hält Buttons zunächst bei `50%/50%`.

Damit reagieren Buttons automatisch auf symbolgröße und Viewport, ohne manuelles Feintuning.

---

## 4. Panel-Verhalten

| Panel | Markup | Trigger | Besonderheit |
| --- | --- | --- | --- |
| Intake | `<section id="hubIntakePanel" data-hub-panel="intake">` | `data-hub-module="intake"` | Direkte Migration des alten Accordions |
| Vitals | `data-hub-panel="vitals"` | `data-hub-module="vitals"` | Enthält Datum + BP/Körper Formulare |
| Doctor | `data-hub-panel="doctor"` | `data-hub-module="doctor"` | Biometrie-Check (`ensureDoctorUnlocked`) |
| Placeholders | Buttons mit `disabled` + Icons | `data-orbit-pos` (ne,se,w,…) | Reserviert für KI, Training, Termine |

Panels bleiben im DOM; das Hub blendet sie nur ein/aus und legt sie visuell unter den Orbit.

---

## 5. Styling Highlights

- `--hub-orb-size` skaliert den gesamten Hero (440px – 820px).  
- Buttons: 92px (Desktop) / 74px (Mobile) mit Glow (Shadow + inner glow).  
- `hub-panel` benutzt radialen Hintergrund + runde Close-Buttons.  
- intake/vitals/doctor Panels nutzen die bestehenden Modul-Styles (`capture.css`, `doctor.css`), werden jedoch ohne Tabs gezeigt.

---

## 6. Datenabhängigkeiten

- **Intake State** – Pills & Tageswerte kommen weiterhin aus `capture`-Modul (keine extra API).  
- **Vitals/Doctor** – Reuse der Module; Hub koordiniert nur UI.  
- **Datum** – einziges Input `#date`; Vitals zeigt es inline, Orbit-Pill wurde entfernt.  
- **Keine direkten Supabase-Calls** – Hub leitet nur zu bestehenden Modulen weiter.

---

## 7. Erweiterungen & TODOs

1. **Speichen komplettieren** – KI Voice, Training, Termine sollen echte Panels bekommen.  
2. **Orb-Animationen** – Idle vs. Thinking vs. Voice (Sprite/Data-State).  
3. **Konfigurierbare Orbit-Buttons** – z. B. JSON-Config, damit Reihenfolge ohne Code-Änderung anpassbar ist.  
4. **A11y** – Fokus-Ring + ARIA-States für Panels ausbauen (z. B. `aria-expanded`).  
5. **Symbolwechsel** – Sobald ein echtes SVG des Logos vorliegt, kann der Radial-Algorithmus optional Pfad-Koordinaten nutzen.

---

## 8. Quickstart für Änderungen

1. **Buttons hinzufügen** – in `index.html` neuen `<button>` mit `data-hub-module` und `data-orbit-pos` einfügen.  
2. **Panel bauen** – neue `<section class="hub-panel" data-hub-panel="...">` anlegen.  
3. **Script erweitern** – in `setupIconBar` Handler registrieren, optional `ORBIT_BUTTONS` erweitern.  
4. **Styles anpassen** – `hub.css` für neue Icons/States pflegen.

Mit diesen Schritten ist das Hub-Modul komplett dokumentiert und neue Entwickler finden schnell Einstieg.

