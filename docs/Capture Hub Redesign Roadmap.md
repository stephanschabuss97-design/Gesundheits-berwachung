# Capture Hub Redesign Roadmap

Ziel: Das bestehende Capture-/Hub-Layout in die neue „MIDAS“-Optik überführen, inklusive Sprite-Icon, zentralem Modul-Navigator und Chat-Eingabe. Funktionalität (Intake, BP, Körper, Arzt, Charts) bleibt unverändert; OpenAI-Integration folgt später.

---

## Phase 1 – Konzept & Struktur

1. **Design-Spezifikation (UI-only)**
   - Layout für Sprite/Logo, MIDAS-Schriftzug und Modul-Icon-Leiste (Intake, BP, Körper, Arzt, Chart, Termin, Training).
   - Chat-Panel optisch planen (Textfeld + Buttons), aber ohne KI-Backend.
   - Farbpalette/Glow/Typografie festlegen.

2. **Template & Routing**
   - Hub-Template in HTML/CSS aufsetzen (Dark Mode, responsive Grid).
   - Capture/Doctor/Charts in Slots/Routing integrieren (Funktionalität unverändert).
   - Feature-Flag für das neue Hub aktivieren (z. B. `CAPTURE_HUB_V2`).

Deliverables: Mockups/Skizzen, CSS/HTML Skeleton, Navigation/Flag-Konzept.

---

## Phase 2 – Umsetzung (UI only)

1. **Sprite/Logo & Animation (nur Platzhalter)**
   - Idle-Visual als Sprite oder CSS-Animation.
   - Thinking/Voice-Stati vorerst als statische Varianten dokumentieren (Animation folgt später mit KI).

2. **Navigation/Icons**
   - Buttons für Intake, BP, Körper, Arzt, Charts, Termin, Training (letztere vorerst deaktiviert).
   - Keyboard-/Screenreader-Support (ARIA, Fokusreihenfolge).

3. **Chat-Panel**
   - Textfeld & Mic-Button im GPT-Stil.
   - Dummy-Hinweise („How can I assist you?“), **kein** Backend/KI.

Deliverables: Fertiges Hub-Layout, modulare CSS/JS, QA-Checks (Layout/Scroll/Responsive).

---

## Phase 3 – Funktionale Anbindung

1. **Routing Hooks**
   - Buttons triggern bestehende Capture/Doctor/Charts Views.
   - State-Persistence (ausgewähltes Modul, Fokus).

2. **Diagnostics & Flags**
   - New Feature Flag (z. B. `CAPTURE_HUB_V2`) für kontrollierten Rollout.
   - Touch-Log-Einträge für Navigation & Sprite-States.

3. **Testing & Rollout**
   - QA: Desktop/Mobile, Accessibility, Smoke-Tests.
   - README/Docs aktualisieren (neues Layout).

Deliverables: Hub v2 in Produktion (UI-only, ohne KI/OpenAI), Feature-Flag Toggle.

---

## Future (separat)

- OpenAI/Assistant anbinden (Chat+Voice).
- Animierte Sprite-States mit echten KI-Ereignissen verknüpfen.
- Termin/Training-Module implementieren.
