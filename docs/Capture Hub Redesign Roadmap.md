# Capture Hub Redesign Roadmap

Ziel: Das bestehende Capture-/Hub-Layout in die neue „MIDAS“-Optik überführen, inklusive Sprite-Icon, zentralem Modul-Navigator und Chat-Eingabe. Funktionalität (Intake, BP, Körper, Arzt, Charts) bleibt unverändert; OpenAI-Integration folgt später.

---

## Phase 1 – Konzept & Struktur

1. **Design-Spezifikation**
   - Sprite-Logik definieren (Idle, Thinking, Voice).
   - Modul-Icons festlegen (Intake, BP, Körper, Arzt, Chart, Termin, Training).
   - Chat/Voice-Panel Layout skizzieren (Textfeld + Mic-Button).

2. **Template & Routing**
   - Neues Hub-Template erstellen (HTML/CSS).
   - Bestehende Views (Capture, Doctor, Charts) per Router/Slots einbetten.
   - Responsives Grid und Theme-Tokens vorbereiten (Dark Mode).

Deliverables: Mockups/Skizzen, CSS/HTML Skeleton, Sprite-Konzept.

---

## Phase 2 – Umsetzung (UI only)

1. **Sprite-Icon**
   - Idle-Animation als Sprite/Canvas.
   - Hooks für Thinking/Voice (noch ohne echte KI-Logik).

2. **Navigation/Icons**
   - Buttons für Intake, BP, Körper, Arzt, Charts, Termin, Training (letztere vorerst deaktiviert).
   - Keyboard-/Screenreader-Support (ARIA, Fokusreihenfolge).

3. **Chat-Panel**
   - Textfeld & Mic-Button im GPT-Stil.
   - Dummy-Hinweise („How can I assist you?“), noch ohne Backend.

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

Deliverables: Hub v2 in Produktion (ohne KI/OpenAI), Feature-Flag Toggle.

---

## Future (separat)

- OpenAI/Assistant anbinden (Chat+Voice).
- Animierte Sprite-States mit echten KI-Ereignissen verknüpfen.
- Termin/Training-Module implementieren.
