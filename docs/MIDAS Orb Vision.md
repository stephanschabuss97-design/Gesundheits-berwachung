# MIDAS Orb Experience

## Leitidee
MIDAS soll sich wie ein intelligentes Gerät anfühlen – kein klassisches Formular-UI. Im Zentrum steht das MIDAS-Logo als „Orb-Reaktor“. Acht Speichen (Kompassrose) repräsentieren Module und KI-Platzhalter:
1) Intake (Wasser/Salz/Protein)  
2) Vitals (Blutdruck + Körper)  
3) Doctor View  
4) Training (placeholder)  
5) Termine/Calendar (placeholder)  
6) GPT Voice Chat (Center Button, später KI)  
7) Open Chat + Dictate / Camera (placeholder)  
8) Optional: Log/Hilfe oder zukünftige Funktion  
Zentrum: GPT Voice Chat Trigger

Der Orb pulsiert im Idle-State. Ein Speichen-Button schrumpft den Orb leicht, die Spitze leuchtet, und das Panel wächst aus dieser Richtung heraus. Beim Schließen kollabiert das Panel zurück; keine Tabs oder Sidebars bewegen sich.

## Aktueller Stand (Phase 0)
- Intake/Vitals/Doctor sind als eigenständige Cards eingebunden (Stage entfernt).  
- Dokumentation und Roadmaps aktualisiert.  
- Desktop + Android getestet.  
- Datum: Single Source of Truth `#date`, inline im Vitals-Panel.  
- Intake-Pills: nur Werte, keine Ampelfarben; Pill-Header liegt im Hero.  
- Orbit: Buttons werden per JS (sin/cos) positioniert, Radius automatisch (Desktop 0.45, Mobile 0.50), keine fixen CSS-Offsets.

## Zielzustand
1. **Orb + Speichen**  
   - Hotspots mit ARIA-Labels, adaptive Layouts (Portrait/Landscape).  
   - Radiale Positionierung bleibt automatisch gekoppelt an die Orb-Größe.
2. **Panel Morphing**  
   - Intake, Vitals, Doctor etc. als eigenständige Cards.  
   - Transform-Origin aus Speichen-Position; Animationen (scale/opacity, optional Clip/Mask).  
   - Close-Button + ESC, Panels revertieren ohne Tab-Wechsel.
3. **State Management**  
   - Kein Stage-Slot; `currentModule` steuert Sichtbarkeit.  
   - Doctor bleibt hinter Biometrie (`ensureDoctorUnlocked`).  
   - Intake/Vitals behalten bestehende Save-Flows.
4. **Future Hooks**  
   - Center-Button für Voice Chat/KI-States (Idle/Thinking/Voice).  
   - Platzhalter für Training, Termine, Camera/Dictate gefüllt, sobald Features bereit sind.

## Umsetzungspfad
### Phase 0 – Status quo sichern (erledigt)
- Panels konsistent, Stage entfernt, Datum inline.  
- Doku/Specs aktualisiert; Tests auf Desktop & Android.

### Phase 1 – Orb Layout ohne Morph
- orbit + Speichen in flexiblen Container; Panels inline triggern.  
- Hilfe/Log bleiben außerhalb des Orbs (sekundäre Buttons).

### Phase 2 – Morph Engine
- Hotspots definiert (Winkel, aria-labels).  
- JS setzt Startpunkt (`--origin-x/y`), CSS animiert expand/collapse.  
- ESC/Close revertiert das Panel.

### Phase 3 – KI/Voice
- Center-Button + Orb-State-Machine (Idle/Thinking/Voice).  
- Audio/Chat-Buttons anbinden, KI später steuert Panels.

### Phase 4 – Fine Tuning
- Responsives Verhalten, reduced-motion, Performance.  
- Supabase/Docs Updates nachziehen.

## Offene Fragen
- Morph per CSS oder SVG-Path-Animation?  
- Wie koppeln wir KI-States (Idle/Thinking/Voice) in Echtzeit?  
- Welche Speichen sind MVP-aktiv (aktuell Intake, Vitals, Doctor, Hilfe, Log)?

## Nächste Schritte
1. Orbit/Speichen Layout weiter verfeinern (Buttons/Icons finalisieren).  
2. Panel-Morph vorbereiten (CSS/JS Hooks).  
3. A11y/Fokus testen, reduced-motion berücksichtigen.  
4. Docs synchron halten (Layout Spec, Module Overviews).

