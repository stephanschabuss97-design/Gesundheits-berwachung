# Hub Module – Functional Overview

Dieses Dokument beschreibt das MIDAS-Hub-Modul, den zentralen Einstiegspunkt für das Orbit-Interface. Ziel ist eine klare Referenz zu Aufbau, Zuständigkeiten und Erweiterungen nach den jüngsten UI-Änderungen (Aura statt Energy-Orb, zentrierte Panels, Panel-Lock).

---

## 1. Scope & Entry Points

| Typ            | Datei/Beschreibung |
| -------------- | ------------------ |
| Entry Script   | `app/modules/hub/index.js` – aktiviert Hub-Layout, bindet Buttons, steuert Panels |
| Stylesheet     | `app/styles/hub.css` – Orbit-Größen, Aura/Ring-Overlays, Button-States, Panel-Look |
| Markup-Anker   | `<section class="hub" id="captureHub">` in `index.html` mit Orbit-Buttons + Panels |

Das Hub ersetzt die klassische Tab-Navigation und dient als Launcher für Intake-, Vitals-, Doctor-Panel sowie künftige KI-Module.

---

## 2. Verantwortlichkeiten

1. **Orbit-Aktivierung**
   - Setzt `hub-mode` auf `<body>` (versteckt alte Capture-Header).
   - Verschiebt Intake-Status-Pills in den Hero (`moveIntakePillsToHub`).
2. **Panel-Steuerung**
   - Buttons mit `data-hub-module` öffnen Panels (`hub-panel` Sektionen).
   - `setupIconBar()` synchronisiert `aria-pressed`, handhabt Click/ESC, schließt auf Animation-Ende.
3. **Orbit-Hotspots**
   - `setupOrbitHotspots()` berechnet Button-Positionen radial per JS.
   - Radius-Faktoren: Desktop 0.72, Mobile 0.76; via `ResizeObserver` + `matchMedia` (keine festen CSS-Offsets).
4. **Datum & Status**
   - Date-Pill bleibt Single Source of Truth (`#date` Input); Vitals zeigt Inline-Datepicker.
   - Intake-Pills zeigen nur Werte (keine Ampelfarben), geliefert vom Capture-Modul.
5. **Modal/Accessibility**
   - Panels behalten Fokus, ESC schließt.
   - Buttons sind echte `<button>`-Elemente mit ARIA-Labels; sichtbare "??" wurden entfernt.

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
- JS schreibt Pixelwerte nach `style.left/top`; CSS hält Buttons initial bei `50%/50%`.  
- Basisradius wird pro Viewport neu berechnet (ResizeObserver), daher identisches Verhalten auf Desktop/Mobile ohne Nachjustierung.

---

## 4. Panel-Verhalten

| Panel      | Markup                                             | Trigger                     | Besonderheit                        |
| ---------- | -------------------------------------------------- | --------------------------- | ----------------------------------- |
| Intake     | `<section id="hubIntakePanel" data-hub-panel="intake">` | `data-hub-module="intake"`  | Migration des alten Accordions      |
| Vitals     | `data-hub-panel="vitals"`                          | `data-hub-module="vitals"`  | Datum + BP/Körper Formulare inline  |
| Doctor     | `data-hub-panel="doctor"`                          | `data-hub-module="doctor"`  | Biometrie-Check (`ensureDoctorUnlocked`) |
| Placeholders | `disabled` Buttons + Icons                       | `data-orbit-pos` (ne,se,w,sw etc.) | Reserviert für KI, Training, Termine |

Panels bleiben im DOM; das Hub blendet sie nur ein/aus. Panels öffnen/ schließen mit Zoom-Animation, bleiben bis Animation-Ende sichtbar.

---

## 5. Styling Highlights (hub.css)

- **Background**: freigestelltes PNG `assets/img/midas_background.PNG` in `.hub-orb-bg`; kein Energy-Orb/Box-Shadow mehr.
- **Aura/Ring Overlays**: `.midas-aura-flow` (conic gradient, dreht langsam) und `.midas-ring-gold` (subtiler Ring-Glow). Beide nutzen CSS-Variablen.
- **Orbit Icons**: sichtbarer Kreis entfernt; Buttons bleiben klickbar (haptisches Feedback über Aura/Boost), Placeholder-"??" ausgeblendet.
- **Orbit Size**: `--hub-orb-size` skaliert den Hero (`clamp(320px, 92vw, 920px)`; Mobile override 94vw/520px).
- **Panel Look**: zentrierte Overlays mit Zoom-In/Out (`hub-panel-zoom-in/out`), Milchglas-Lock via `body:has(.hub-panel.is-visible)`.
- **Locking**: Aktiviertes Panel dimmt Orbit, blockt Buttons, verhindert Page-Scroll via `body:has(...)`.

### Voice Safety Gate (Phase 0.4)

- JS (`app/modules/hub/index.js`) stellt `AppModules.hub.getVoiceGateStatus/isVoiceReady/onVoiceGateChange` bereit. Gate ist offen, sobald `bootFlow.isStageAtLeast('IDLE') && supabaseState.authState !== 'unknown'`.
- CSS nutzt `body.voice-locked` + `.hub-core-trigger.is-voice-locked`, um die Nadel zu dimmen, Pointer-Events zu blockieren und den Hinweis „Voice aktiviert sich nach dem Start“ einzublenden.
- Falls Auth während einer Session zurück auf `unknown` fällt, der Gate Listener stoppt Recorder, VAD, Streams und schreibt `[voice] gate locked` in `diag`.

---

## 6. Datenabhängigkeiten

- **Intake State** – Pills & Tageswerte kommen aus dem Capture-Modul (keine extra API).
- **Vitals/Doctor** – Reuse der Module; Hub koordiniert nur UI.
- **Datum** – einziges Input `#date`; Orbit-Pill entfernt, Vitals zeigt Inline-Datepicker.
- **Keine direkten Supabase-Calls** – Hub leitet nur zu bestehenden Modulen weiter.

---

## 7. Erweiterungen & TODOs

1. **Speichen komplettieren** – KI Voice, Training, Termine sollen echte Panels bekommen.  
2. **Spriting/States** – spätere Idle/Thinking/Voice-Sprites können über `.hub-orb-fg` ergänzt werden.  
3. **Konfigurierbare Orbit-Buttons** – z. B. JSON-Config, um Reihenfolge auszutauschen.  
4. **A11y** – Fokus-Ring + ARIA-States für Panels (z. B. `aria-expanded`).  
5. **SVG-Option** – Mit echtem SVG des Logos könnte der Radial-Algorithmus Pfad-Koordinaten nutzen.

---

## 8. Quickstart für Änderungen

1. **Buttons hinzufügen** – in `index.html` neuen `<button>` mit `data-hub-module` + `data-orbit-pos` anlegen.  
2. **Panel bauen** – neue `<section class="hub-panel" data-hub-panel="...">` anlegen.  
3. **Script erweitern** – in `setupIconBar` Handler registrieren, optional `ORBIT_BUTTONS` ergänzen.  
4. **Styles anpassen** – `hub.css` für neue Icons/States pflegen (Aura-Boost nur via CSS-Variablen).  

Damit ist das Hub-Modul dokumentiert; neue Entwickler finden damit schnell Einstieg und Kontext.
