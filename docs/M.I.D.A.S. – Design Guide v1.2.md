# 🩺 **M.I.D.A.S. – Design Guide v1.2 (Draft)**

**(Modern Minimal Care + Brand Harmony Extension)**  
**Unified Interface Specification für Capture, Doctor View & Charts**

---

## 🧭 0. Leitidee

**Ziel:**  
M.I.D.A.S. ist kein Lifestyle-Produkt, sondern ein Instrument der Präzision.  
Es soll Ruhe, Kontrolle und technische Reife ausstrahlen – wie ein Messgerät, dem man vertraut.

**Prinzip:**  
Reduktion als Haltung.  
Jedes visuelle Element dient einem Zweck.  
Alles ist gleichmäßig, ruhig, lesbar – so still, dass man sich darin entspannen kann.

**Erweiterung:**  
Das neue Logo bringt eine zusätzliche Ebene: *Licht und Tiefe*.  
Die visuelle Identität darf sanft strahlen – ohne laut zu werden.  
M.I.D.A.S. soll wirken wie ein präzises Gerät in einem dunklen Raum, das durch seine innere Energie leuchtet.

---

## ⚙️ 1. Farbphilosophie

**Ziel:**  
Farbe schafft Orientierung, nicht Emotion.  
Licht schafft Atmosphäre, nicht Ablenkung.

| Rolle           | Farbwert                 | Bedeutung                          |
| --------------- | ------------------------ | ---------------------------------- |
| Hintergrund     | `#101116`                | neutrales, leicht kühles Anthrazit |
| Panel Layer 1   | `#1C1E22`                | Haupt-Ebene                        |
| Panel Layer 2   | `#202225`                | Tiefenstaffelung                   |
| Akzent (Primär) | `#4D53FF`                | Interaktion / Highlight (Logo-Violett-Ton) |
| Erfolg          | `#2ECC71`                | positive Rückmeldung               |
| Warnung         | `#FF6B6B`                | dezent, warm statt aggressiv       |
| Text Primary    | `#E8EAEC`                | Haupttext                          |
| Text Secondary  | `#B0B3B8`                | Labels, Hinweise                   |
| Text Disabled   | `#6C6E70`                | neutrale Infos                     |
| Linien / Border | `rgba(255,255,255,0.06)` | feine Trennung                     |

**Regeln:**

* Keine harten Kontraste – nur Mikro-Unterschiede.  
* Blau-Violett = aktiv / bestätigt (statt reinem Blau).  
* Rot = Risiko, nie Alarm.  
* Erfolg = kurz sichtbares, sanftes Grün-Feedback.  
* Gold wird **ausschließlich für Branding**, nicht für UI-Elemente verwendet.  

---

### 🧪 1.1 Brand Harmony (neu)

**Ziel:**  
Die Energie des Logos in das Interface übertragen, ohne dessen Ruhe zu stören.

**Prinzip:**  
Das Branding lebt durch Licht, Tiefe und Subtilität – nicht durch Farbe.  

**Erweiterte Farb-Tokens:**
```css
:root {
  --accent-violet: #5B48F0;
  --accent-gold: #E7B859;
  --accent-deep: #0D1020;
  --surface-glow: rgba(80,60,255,0.1);
}
```

**Verwendung:**
- `--accent-violet` für Hover-, Focus- und Gloweffects  
- `--accent-gold` nur für Meta-Branding (Logo, Wordmark, Footer)  
- `--accent-deep` für Brandpanels, Splashscreen-Hintergründe  
- `--surface-glow` für subtile Umrandungen und Übergänge  

**Beispiel:**
```css
.btn-primary:focus-visible {
  outline: 2px solid var(--accent-violet);
  box-shadow: 0 0 12px var(--surface-glow);
}
.brand-footer {
  color: var(--accent-gold);
  opacity: 0.8;
}

/* Legacy Fallbacks */
--accent-blue: var(--accent-violet);

---

## 🔠 2. Typografie

**Ziel:**  
Lesbarkeit = Funktion.

**Systemschrift:** *Inter*, *SF Pro Text*, *Segoe UI*, *Roboto*.

| Ebene        | Größe    | Gewicht    | Farbe   | Beschreibung    |
| ------------ | -------- | ---------- | ------- | --------------- |
| Panel-Titel  | 1.1 rem  | 600        | #F5F6F8 | Abschnitt       |
| Label        | 0.9 rem  | 400        | #B0B3B8 | Feldbezeichnung |
| Input / Zahl | 1 rem    | 500        | #D7D9DC | Primärdaten     |
| Hinweis      | 0.85 rem | 400 italic | #8A8D90 | Zusatzinfo      |

**Parameter:**  
Zeilenhöhe 1.5 · Letter-Spacing 0.3 px · keine Versalien-Hervorhebung.  
**Branding-Schrift:** *Serif oder Semi-Serif für Wordmark* (z. B. „M.I.D.A.S.“).  
Diese darf im UI nur in Branding-Bereichen (Splash, Footer, PDF) verwendet werden.

---

## 📏 3. Layout & Spacing

**Takt:** Vertikal 24 px (12 px Halbschritt) · Horizontal 1.25 rem Padding.  
**Struktur jedes Panels:**  
1. Titel   2. Trennlinie   3. Content   4. Save-Zone (rechts unten, 1 rem Abstand).  
Keine Zufallsabstände. Alles folgt dem gleichen Rhythmus.  

**Erweiterung:**  
Branding-Elemente (Logo, Wordmark) sind **eigene Meta-Komponenten** mit fixem vertikalem 48 px Abstand, um Ruhe zu wahren.  

---

## 🧩 4. Komponenten

### Buttons

Radius 8 px · Höhe 38–42 px · Font 600
Hover brightness 1.15 · Active scale 0.98 (100 ms) · Disabled opacity 0.6

### Inputs

Background #181A1E · Text #D7D9DC · Placeholder #8A8D90
Border #2C2F33 · Focus-Glow #3A3DFF (soft fade 250 ms)

### Panels / Cards

Radius 8 px · Layer-Wechsel 1 / 2 · Shadow 0 1 4 rgba(0,0,0,0.2) · Transition 0.25 s ease.

### Accordions

Transition 200 ms ease-out · Icon Rotation 90° · Slide 3–4 px · Scroll smooth.

---

## 💡 5. Feedback & Interaktion

**Speichern:** kurzer Grün-Flash (#2ECC71, 400 ms) oder Border-Glow.  
**Fokus:** `--accent-violet` Glow (anstatt reinem Blau).  
**Keine Pop-Ups:** Feedback immer im Kontext.  

---

## 🧭 6. Navigation & Orientierung

Header-Bar immer sichtbar · Aktiver Tab = helleres Blau oder 2 px Unterstrich.
Scrollindikator = Schattenlinie nach oben.
Sticky-Untertitel (z. B. „Intake Daten“) führen den Kontext.

---

## 🎞️ 7. Animation & Motion

Bewegung unterstützt Wahrnehmung – nicht Show.

| Aktion               | Dauer  | Effekt      | Kommentar |
| -------------------- | ------ | ----------- | --------- |
| Accordion open/close | 200 ms | ease-out    | sanft     |
| Button click         | 100 ms | scale 0.98  | haptisch  |
| Save Feedback        | 400 ms | color flash | positiv   |
| Tooltip fade         | 150 ms | opacity → 1 | subtil    |
| **Brand Pulse (neu)** | 2000 ms | soft scale  | nur auf Splashscreen erlaubt |

**Keyframe:**  
```css
@keyframes brandPulse {
  0%,100% { opacity: 0.85; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.06); }
}
```

---

## 🪞 8. Visuelle Konsistenz

Einheitlicher Radius 8 px · linksbündige Texte · Icons line-based (1.5 px).  
**Verläufe nur in Branding-Kontexten** (Splash, PDF).  
Keine Text-Shadows oder metallischen Effekte im UI.  

---

## 📐 9. Responsives Verhalten

Bis 600 px → vertikales Stacking.
Bis 1024 px → 2-Spalten-Layout (Intake / Arzt).
Ab 1024 px → max-Width 1200 px, zentriert + 48 px Außen-Padding.

---

## 🧭 10. Ton & Markenwirkung

„Klug · Kontrolliert · Menschlich“  
→ Klug = strukturierte Layouts  
→ Kontrolliert = ruhige Farben  
→ Menschlich = weiche Kontraste + klare Sprache  

**Erweiterung:**  
„MIDAS darf spürbar strahlen – ruhig, präzise, würdevoll.“  
Das Branding strahlt wie ein Messgerät im Dunkeln: sichtbar, aber nie blendend.

---

## 🪶 11. Micro-Motion Design Principles

Motion follows Function – jede Bewegung hat einen Sinn.

**Leitgedanken:**
Feel it – don’t see it (< 400 ms) · Emotional Neutral · Direction as Meaning (auf/zu → oben/unten).

Technische Werte:
Accordion 200 ms ease-out · Button 100 ms ease-in · Save 350 ms ease-in-out · Input 250 ms Glow · Tooltip 150 ms Fade · Panel 300 ms Fade + 5 % Y.

---

## 🧾 12. Capture Experience Design

**Ziel:** Schnelle, störungsfreie Datenerfassung.

**Layout:**

* Header fix · Input-Panels im 24 px Rhythmus · Save-Zone unten rechts.
* Jeder Inputblock = Mini-Panel mit Titel + Feld + Kommentar.
* Erfolgsfeedback innerhalb des Panels.

**Interaktion:**

* Sofort-Feedback bei Validierung.
* Toast nur bei globalem Save.
* Farben entsprechend Guide (Grün Erfolg · Rot Warnung).

**Verhalten:**

* Panel merkt zuletzt bearbeiteten Bereich (Session-Memory).
* Keine Ablenkung durch Animation > 400 ms.

---

## 🩻 13. Doctor View Principles

**Ziel:** Schnelle, präzise Interpretation medizinischer Daten.

**Layout:**

* 2 Spalten ≥ 1024 px (links Patient Daten · rechts Messungen).
* Panels nach Kategorie (Blutdruck / Körper / Lab / Verlauf).
* 24 px vertikales Raster auch im Arzt-Layout.

**Interaktion:**

* Keine Editierfelder – rein analytische Ansicht.
* Hover highlight #3A3DFF (15 % Opacity) zur Fokussierung.
* Farbliche Konstanz zum Capture-View (wertgleiche Zustände = gleiche Farben).

**Text-Hirarchie:**
Titel 600 · Wert 500 · Kommentar 400 italic.

---

## 📊 14. Chart & Data Visualization Guidelines

**Ziel:** Trends sichtbar machen – nicht dramatisieren.

### Y-Achse (dynamisch)

* Auto-Scaling min/max mit ±5 % Luft.
* Smooth Transition 400–600 ms.
* Zielbereiche als halbtransparente Flächen.

### Linien & Balken
---

## 🪶 11. Micro-Motion Design Principles

Motion follows Function – jede Bewegung hat einen Sinn.

**Leitgedanken:**
Feel it – don’t see it (< 400 ms) · Emotional Neutral · Direction as Meaning (auf/zu → oben/unten).

Technische Werte:
Accordion 200 ms ease-out · Button 100 ms ease-in · Save 350 ms ease-in-out · Input 250 ms Glow · Tooltip 150 ms Fade · Panel 300 ms Fade + 5 % Y.

---

# 🩺 **Teil B – Kontextuelle Anwendungen**

---

## 🧾 12. Capture Experience Design

**Ziel:** Schnelle, störungsfreie Datenerfassung.

**Layout:**

* Header fix · Input-Panels im 24 px Rhythmus · Save-Zone unten rechts.
* Jeder Inputblock = Mini-Panel mit Titel + Feld + Kommentar.
* Erfolgsfeedback innerhalb des Panels.

**Interaktion:**

* Sofort-Feedback bei Validierung.
* Toast nur bei globalem Save.
* Farben entsprechend Guide (Grün Erfolg · Rot Warnung).

**Verhalten:**

* Panel merkt zuletzt bearbeiteten Bereich (Session-Memory).
* Keine Ablenkung durch Animation > 400 ms.

---

## 🩻 13. Doctor View Principles

**Ziel:** Schnelle, präzise Interpretation medizinischer Daten.

**Layout:**

* 2 Spalten ≥ 1024 px (links Patient Daten · rechts Messungen).
* Panels nach Kategorie (Blutdruck / Körper / Lab / Verlauf).
* 24 px vertikales Raster auch im Arzt-Layout.

**Interaktion:**

* Keine Editierfelder – rein analytische Ansicht.
* Hover highlight #3A3DFF (15 % Opacity) zur Fokussierung.
* Farbliche Konstanz zum Capture-View (wertgleiche Zustände = gleiche Farben).

**Text-Hirarchie:**
Titel 600 · Wert 500 · Kommentar 400 italic.

---

## 📊 14. Chart & Data Visualization Guidelines

**Ziel:** Trends sichtbar machen – nicht dramatisieren.

### Y-Achse (dynamisch)

* Auto-Scaling min/max mit ±5 % Luft.
* Smooth Transition 400–600 ms.
* Zielbereiche als halbtransparente Flächen.

### Linien & Balken

* Aufbau links → rechts per `stroke-dashoffset` oder `scaleY`.
* Gesamt-Dauer ≤ 1.5 s · gestaffelte Verzögerung 50–100 ms.
* Kein Bounce oder Overshoot.

### Farben

* Primär-Linie = #3A3DFF · Sekundär-Linie = #B0B3B8 · Erfolg = #2ECC71.
* Hover = brightness (1.1) für aktive Kurve.

### Tooltip Behavior

* Fade-in 150 ms · Fade-out 100 ms · Leichte Schattenlinie unter aktivem Punkt.

---

# 🧩 **Teil C – Implementierungs-Brücke für Codex**

---

## ⚙️ 15. Codex Alignment & Versioning Rules

1. **Kommentaranker:** `<!-- MODULE: ... -->` und `<!-- SUBMODULE: ... -->` immer beibehalten.
2. **Farb-Tokens:** verwende die Palette aus Kapitel 1 als `:root` CSS Variablen.
3. **Motion:** ausschließlich CSS Transitions oder Keyframes, keine JS-Animation-Libs.
4. **Struktur:** jede Komponente besteht aus Header, Body, Footer.
5. **Versionierung:** neue UI-Änderung = neue Minor-Version (v1.7.6 → v1.7.7).
6. **Commits:** immer Kommentar `// Refactored according to MIDAS De// Refactored according to MIDAS Design Guide v1.2 (Brand Harmony Extension).

---
* Aufbau links → rechts per `stroke-dashoffset` oder `scaleY`.
* Gesamt-Dauer ≤ 1.5 s · gestaffelte Verzögerung 50–100 ms.
* Kein Bounce oder Overshoot.

### Farben

* Primär-Linie = #3A3DFF · Sekundär-Linie = #B0B3B8 · Erfolg = #2ECC71.
* Hover = brightness (1.1) für aktive Kurve.

### Tooltip Behavior

* Fade-in 150 ms · Fade-out 100 ms · Leichte Schattenlinie unter aktivem Punkt.

---

## ⚙️ 15. Codex Alignment & Versioning Rules

1. **Kommentaranker:** `<!-- MODULE: ... -->` und `<!-- SUBMODULE: ... -->` immer beibehalten.
2. **Farb-Tokens:** verwende die Palette aus Kapitel 1 als `:root` CSS Variablen.
3. **Motion:** ausschließlich CSS Transitions oder Keyframes, keine JS-Animation-Libs.
4. **Struktur:** jede Komponente besteht aus Header, Body, Footer.
5. **Versionierung:** neue UI-Änderung = neue Minor-Version (v1.7.6 → v1.7.7).
6. **Commits:** immer Kommentar `// Refactored according to MIDAS Design Guide v1.2 (Brand Harmony Extension)`.

---
<!-- BRAND-LAYER: meta only / no UI interaction -->

## ✴️ 16. Branding & Logo Integration (neu)

**Ziel:**  
Markenidentität sichtbar machen, ohne funktionale Ruhe zu stören.

**Prinzip:**  
Branding ist Meta – nie Teil des Datenflusses.

| Ebene | Element | Verhalten |
|-------|----------|-----------|
| **Systemstart** | Symbol + Wordmark | Fade-In → Fade-Out in 2.5 s mit `brandPulse` |
| **Login View** | Symbol freigestellt (48 px) | zentriert, Opacity 0.9 |
| **Header** | Mini-Symbol (24 px) | links vom Titel, Farbe `--accent-gold` (kein Verlauf) |
| **Footer** | Wordmark-Text | `font-weight: 600; letter-spacing: 0.3em; color: --text-secondary` |
| **PDF / Export** | Symbol + Wordmark | zentriert, 75 % Skalierung, statisch |

**Verboten:**  
- Kein Logo innerhalb von Panels, Charts oder Eingabefeldern.  
- Kein animiertes Branding außerhalb des Splashscreens.  
- Kein metallischer oder reflektierender Effekt.  

---

## ✅ Zielbild (aktualisiert)

M.I.D.A.S. v1.2 vereint funktionale Präzision mit markanter Ruhe.  
Das System bleibt sachlich, doch das Branding verleiht ihm Tiefe und Identität.  
Jede Oberfläche spiegelt dieselbe Haltung wider:  
**Modern Minimal Care – mit Licht und Charakter.**
