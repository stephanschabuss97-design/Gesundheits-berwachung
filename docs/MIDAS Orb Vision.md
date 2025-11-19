# MIDAS Orb Experience

## Leitidee

MIDAS soll sich wie ein intelligentes Gerät anfühlen – kein klassisches Formular-UI. Im Zentrum steht das MIDAS-Logo als „Orb-Reaktor“. Acht Speichen (Kompassrose) repräsentieren die Module:

1. Intake (Wasser/Salz/Protein)
2. Vitals (Blutdruck + Körper)
3. Doctor View
4. Training (placeholder)
5. Termine/Calendar (placeholder)
6. GPT Voice Chat (Center Button, später KI)
7. Open Chat + Dictate / Camera (placeholder)
8. Placeholder (z. B. Log/Hilfe oder zukünftige Funktion)
9. Zentrum = GPT Voice Chat Trigger

Der Orb pulsiert im Idle-State. Sobald ein Speichen-Button berührt wird, schrumpft der Orb leicht, die ausgewählte Spitze leuchtet und genau aus dieser Richtung „wächst“ das entsprechende Panel organisch heraus. Beim Schließen kollabiert das Panel zurück in die Spitze und der Orb atmet wieder auf volle Größe, ohne dass sich Tabs oder Sidebars bewegen.

## Warum?

- **Ikonisches UI**: Einzigartige visuelle Identität, kein Tab-Chaos.
- **Modular**: Jeder Hotspot vertritt genau ein Modul; KI kann später Panels automatisch öffnen.
- **Mobile-first**: Kein Platzverlust für Leisten; alles beginnt im Orb.
- **Zukunftssicher**: Animationen für Idle/Thinking/Voice können direkt am Orb stattfinden.

## Zielzustand

1. **Orb + Speichen**  
   - SVG/Canvas oder CSS-Pseudo-Elemente für die acht Hotspots.  
   - Fokus- und Screenreader-Beschriftung pro Speiche.  
   - Adaptive Layouts (Portrait/ Landscape).

2. **Panel Morphing**  
   - Intake, Vitals, Doctor View usw. als eigenständige „Panels“ (Cards).  
   - Transform-Origin + Translate berechnen sich aus der Speichen-Position.  
   - Animationen: `scale` 0.2 → 1.0, `opacity` 0 → 1, optional Mask/Clip für echten Morph.  
   - Panel enthält Close-Button + ESC Support; beim Schließen revertet alles.

3. **State Management**  
   - Kein Stage-Slot mehr. Stattdessen `currentModule`.  
   - Doctor Speiche löst weiterhin `ensureDoctorUnlocked()` aus, bevor Panel entsteht.  
   - Intake/Vitals behalten ihre Submits, nur UI bewegt sich.

4. **Future Hooks**  
   - Center button für Voice Chat (später: KI Idle/Thinking/Voice Animations).  
   - Placeholder-Speichen (Training, Camera, Termine) haben schon Interaktionsfläche.

## Umsetzungspfad

### Vorarbeiten (laufende Aufgaben)

1. **Stage-Altlasten entfernen**  
   - Panels (Intake, Vitals, Doctor) wieder als eigenständige Cards betreiben; keine abgeschnittenen Hintergründe oder doppelten Scrollbereiche.  
   - Mobile/Zoom-Bugs fixen (Android + Desktop 100 %).  
   - Sicherstellen, dass Close/ESC/Fokus bereits jetzt sauber funktionieren.
2. **Datum & Formular-Logik bereinigen**  
   - Die globale Datumspille bleibt die „Single Source of Truth“, wird aber zusätzlich direkt in der Vitals-Card angezeigt, damit Blutdruck/Körper dort zugänglich ist.  
   - Intake/Vitals/Doctor speichern unverändert, inklusive Biometrie-Gate.

### Phase 0 – Status quo sichern
- Intake/Vitals/Doctor Panels optisch konsistent (bereits erledigt).  
- Dokumentation & Roadmaps aktualisiert.  
- Tests auf Desktop + Android durchgeführt.

### Phase 1 – Orb Layout ohne Morph
- Stage entfernen, Panels wieder eigenständig unterhalb des Orbs anzeigen.  
- Orb + Speichen in einem flexiblen Container layouten.  
- Buttons triggern Panels inline (vorerst ohne Animations-Magie) – Funktionalität sicherstellen.  
- Hilfe/Log bleiben außerhalb des Orbs (z. B. sekundäre Buttons).

### Phase 2 – Morph Engine
- Speichen als absolute Hotspots definieren (Position + aria labels).  
- JS: `openModule(id)` berechnet Startpunkt (BoundingClientRect) und setzt CSS-Variablen (`--origin-x/y`).  
- CSS: Keyframes für expand/collapse; Panel pseudo-Container für Glow.  
- Close-Button + ESC revertieren, Panel verschwindet wieder im Orb.

### Phase 3 – KI/Voice Vorbereitung
- Center-Button und Orb-State-Machine (Idle, Thinking, Voice).  
- Audio/Chat Buttons verlinken, falls Module existieren.  
- Placeholder-Strahlen mit Dummy-Panels (z. B. „Training – Coming soon“).

### Phase 4 – Fine Tuning
- Responsives Verhalten testen (Desktop, Tablet, Android).  
- Performance-Optimierung (reduced-motion respektieren, minimal Layout thrash).  
- Supabase/Docs Updates passend zur UX.

## Offene Fragen

- Wird die Morph-Geometrie rein per CSS transformiert oder benötigen wir SVG-Path-Animation?  
- Wie koppeln wir KI-States (Idle/Thinking/Voice) in Echtzeit an den Orb?  
- Welche Strahlen werden im MVP aktiv? (aktuell: Intake, Vitals, Doctor, Hilfe, Log.)

## Nächste Schritte

1. Stage entfernen und Module wieder in eigenständige Panels überführen.  
2. Orb/Speichen Layout definieren und in `hub.css` verankern.  
3. Panel-Trigger + Close-Logik refactoren (`app/modules/hub/index.js`).  
4. Animationen hinzufügen und mobile Tests durchführen.  
5. Docs (Layout Spec, Module Overview) synchron halten.
