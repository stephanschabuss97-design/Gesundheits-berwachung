# Capture Hub Layout Spec (UI-First)

## 1. Hero / Sprite
- **Asset:** MIDAS-Logo (PNG/SVG) + kreisförmiger Glow.
- **States (UI-only):**
  - `idle`: statisches Logo mit Soft-Glow (CSS animation).
  - `thinking`: leicht pulsierender Glow (CSS keyframes).
  - `voice`: Oszillationsringe (CSS gradient, keine Audio-Funktion).
- **Container:** `section.hub-hero` (flex column, center, min-height 240px).

## 2. MIDAS Schriftzug
- Typo: `var(--font-heading, 'Montserrat', sans-serif)` in uppercase.
- Farbe: `#F5F7FF`, letter-spacing 0.4em, margin-top 16px.
- ARIA: `<h1>` mit `aria-label="MIDAS Assistant"`.

## 3. Modul-Icon-Bar
- Icons (SVG 32px) + Labels (sr-only).
  1. Intake
  2. Blutdruck
  3. Körper
  4. Arzt-Ansicht
  5. Charts
  6. Termine (disabled placeholder)
  7. Training (disabled placeholder)
- Layout: grid (auto-fit min 56px). Buttons = `button.hub-icon`.
- State: `button[aria-pressed="true"]` für aktives Modul.
- Keyboard: Arrow navigation (roving tabindex).

## 4. Chat Panel (Placeholder)
- Container `div.hub-chat`.
- Elements:
  - Text input (`type="text"`, placeholder „How can I assist you?“).
  - Secondary mic button (icon).
  - Send button (icon).
- Accessibility: `aria-label` für Buttons, input mit `aria-describedby="hub-chat-hint"`.
- No backend/submit – buttons trigger `console.info` stub.

## 5. Layout Guidelines
- Background: `#05060a` gradient, max width 960px, center.
- Spacing: 48px vertical between hero, icons, chat.
- Use CSS variables (`--hub-primary`, `--hub-secondary`, `--hub-glow`) für konsistente Farben.

## 6. Feature Flag
- Config key: `CAPTURE_HUB_V2` (default `false`).
- Hub markup nur rendern, wenn Flag true (fallback = altes Capture).

## 7. Next Steps
- Phase 2: CSS/HTML für hero, icons, chat implementieren.
- Phase 3: Buttons an bestehende Module hängen, Flag togglen, QA.
