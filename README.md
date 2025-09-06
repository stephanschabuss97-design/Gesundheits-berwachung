# 🩺 Gesundheits-Logger

Der **Gesundheits-Logger** ist eine **offlinefähige Web-App** zur Erfassung, Auswertung und Synchronisierung von Gesundheitsdaten – speziell entwickelt für den persönlichen Alltag und für Ärzt:innen-Gespräche.  
Die App läuft **komplett clientseitig im Browser** (keine Installation nötig) und speichert Daten in **IndexedDB**, mit optionaler **Supabase-Realtime-Synchronisation**.

---

## ✨ Features

### Erfassung (Capture)
- Eingabe von:
  - **Morgen-/Abend-Blutdruck** (Sys, Dia, Puls, automatische MAP-Berechnung).
  - **Gewicht** (in kg).
  - **Kommentar** (freie Notizen).
- **Flags** zur Tagescharakterisierung:
  - 🏋️ Training heute  
  - 🤒 Krank (Forxiga pausiert)  
  - 💊 Valsartan vergessen  
  - 💊 Forxiga vergessen  
  - 🚰 Weniger als 2 L getrunken  
  - 🧂 Mehr als 5 g Salz  
  - 🍬 Mehr als 10 g Zucker  
  - ⚠️ NSAR genommen  
- Speicherung per **IndexedDB** + optionaler **Webhook zu Supabase**.

### Arzt-Ansicht
- Tägliche Übersicht im **3-Spalten-Layout**:
  - 📅 Datum (mit Cloud-Status & Löschfunktion).  
  - 📊 Messungen (morgens/abends, inkl. Grenzwert-Highlighting: Sys >130, Dia >90, MAP >100).  
  - ⚖️ Gewicht, 🚩 Flags, 📝 Kommentar.  
- **KPIs als Badges**:
  - Anzahl Trainingstage im Zeitraum.  
  - Anzahl Tage mit mindestens einem Bad-Flag.  
- **Filterung nach Zeitraum** (Von/Bis).  
- **Cloud-Sync Status** (☁️ Icon).  
- **Tageslöschung** inkl. Remote-Delete.  

### Diagramm (SVG-Chart)
- Dynamischer Verlauf über den gewählten Zeitraum.  
- Auswahl der Metrik:
  - Blutdruck (Sys/Dia, Morgen/Abend getrennt).  
  - Puls.  
  - Gewicht.  
- **Durchschnittswerte (Ø)** werden automatisch berechnet und angezeigt.  
- Schwellenlinien (Sys 130, Dia 90).  
- Wochenlinien mit Datum unten eingeblendet.  
- Voll responsiv (Mobile/Desktop).

### Export
- **Export JSON** (Arzt-Ansicht): vollständiger Dump aller Einträge.  
- Datenformat: JSON mit Datum, Uhrzeit, Messwerten, Flags, Notizen und Cloud-IDs.  

### Synchronisation (Supabase)
- **Google OAuth Login** integriert.  
- **Realtime-Events** (INSERT, UPDATE, DELETE) aus Supabase werden sofort lokal übernommen.  
- **Auto-Sync** beim Start und beim Wieder-Online-Gehen:
  - Neue lokale Einträge → automatisch hochgeladen.  
  - Server-Änderungen → abgeglichen.  
- Schutz vor falscher Konfiguration:
  - **service_role** Keys werden geblockt.  
  - Nur **anon keys** werden akzeptiert.  

### Sonstiges
- **Offline-First**: volle Funktionalität ohne Internet, Sync erfolgt später automatisch.  
- **Mobile-Optimiert**: Touch-friendly Buttons, Layout passt sich an (1–3 Spalten je nach Display).  
- **Accessibility**: Aria-Rollen, Labels, Tastensteuerung (Speichern auch mit `Ctrl+S` / `Cmd+S`).  
- **Fehlerbehandlung**: sichtbare Statusbox (`#err`) bei Netzwerk- oder Sync-Problemen.  
- **Debug-Panel**: Touch-Log (`Log`-Button) für technische Abläufe & Performance.  

---

## 🚀 Nutzung

### Start
1. Repo klonen oder ZIP herunterladen.  
2. `index.html` im Browser öffnen.  
   - Keine Installation, kein Server, keine Build-Chain nötig.  
   - Läuft sofort lokal (auch auf Mobile).  

### Speicherung
- Alle Eingaben werden in **IndexedDB** lokal gespeichert.  
- Optional: automatische Übertragung an **Supabase REST-API** (wenn Webhook konfiguriert).  

### Export
- Arzt-Ansicht → **Export JSON** → vollständiger Dump als `gesundheitslog.json`.  
- Daten können später in andere Tools importiert oder direkt mit Ärzt:innen geteilt werden.  

---

## 🔒 Sicherheit

- **Keine sensitiven Keys im Code**: nur `anon`-Keys werden gespeichert.  
- **service_role Keys** werden aktiv blockiert (Frontend prüft beim Start).  
- **OAuth** über Google → sauberes User-Mapping.  
- App läuft vollständig clientseitig, keine zentralen Server von Dritten.  

---

## 📌 Versionierung

Dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).  

- **1.0.0** – Initial Stable Release  
  - Entfernung der alten „Liste“-Ansicht & aller Tools.  
  - Fokus auf 2 Haupt-Views: Erfassung & Arzt-Ansicht.  
  - Chart-Panel & JSON-Export nur noch in der Arzt-Ansicht.  
  - IndexedDB + Supabase Realtime vollständig integriert.  
  - Mobile-First Layout & Accessibility verbessert.  

- **1.0.x** – Bugfixes & kleine Verbesserungen.  
- **1.x.0** – neue Features, rückwärtskompatibel.  
- **2.0.0** – größere Umbauten, Breaking Changes.  

---

## 🧭 Roadmap

- 📄 **PDF-Export** (Arzt-freundlich mit Logo & Diagramm).  
- 🎨 **Theme-Switcher** (Dark/Light Mode).  
- ⚙️ **Settings-Tab** (Webhook-Verwaltung, Sprache, etc.).  
- 📊 **Multi-Metrik-Charts** (z. B. Blutdruck + Puls kombiniert).  
- 📱 **Progressive Web App (PWA)** für Offline-Nutzung mit Icon/Installation.  

---

## 🤝 Beitrag & Feedback

Dies ist ein **persönliches Projekt**, aber Pull Requests, Issues & Ideen sind willkommen.  

- Fehler melden → GitHub Issues.  
- Ideen oder Feedback → gerne per Issue oder Diskussion.  
- Code folgt KISS-Prinzip: **Keep It Simple & Straightforward**.  

---

## 📜 Lizenz

*(Hier kannst du deine gewünschte Lizenz eintragen – z. B. MIT, falls du Open Source willst.)*

---

# 🩺 Gesundheits-Logger

Der **Gesundheits-Logger** ist eine **offlinefähige Web-App** zur Erfassung, Auswertung und Synchronisierung von Gesundheitsdaten – speziell entwickelt für den persönlichen Alltag und für Ärzt:innen-Gespräche.  
Die App läuft **komplett clientseitig im Browser** (keine Installation nötig) und speichert Daten in **IndexedDB**, mit optionaler **Supabase-Realtime-Synchronisation**.

---

## ✨ Features

### Erfassung (Capture)
- Eingabe von:
  - **Morgen-/Abend-Blutdruck** (Sys, Dia, Puls, automatische MAP-Berechnung).
  - **Gewicht** (in kg).
  - **Kommentar** (freie Notizen).
- **Flags** zur Tagescharakterisierung:
  - 🏋️ Training heute  
  - 🤒 Krank (Forxiga pausiert)  
  - 💊 Valsartan vergessen  
  - 💊 Forxiga vergessen  
  - 🚰 Weniger als 2 L getrunken  
  - 🧂 Mehr als 5 g Salz  
  - 🍬 Mehr als 10 g Zucker  
  - ⚠️ NSAR genommen  
- Speicherung per **IndexedDB** + optionaler **Webhook zu Supabase**.

### Arzt-Ansicht
- Tägliche Übersicht im **3-Spalten-Layout**:
  - 📅 Datum (mit Cloud-Status & Löschfunktion).  
  - 📊 Messungen (morgens/abends, inkl. Grenzwert-Highlighting: Sys >130, Dia >90, MAP >100).  
  - ⚖️ Gewicht, 🚩 Flags, 📝 Kommentar.  
- **KPIs als Badges**:
  - Anzahl Trainingstage im Zeitraum.  
  - Anzahl Tage mit mindestens einem Bad-Flag.  
- **Filterung nach Zeitraum** (Von/Bis).  
- **Cloud-Sync Status** (☁️ Icon).  
- **Tageslöschung** inkl. Remote-Delete.  

### Diagramm (SVG-Chart)
- Dynamischer Verlauf über den gewählten Zeitraum.  
- Auswahl der Metrik:
  - Blutdruck (Sys/Dia, Morgen/Abend getrennt).  
  - Puls.  
  - Gewicht.  
- **Durchschnittswerte (Ø)** werden automatisch berechnet und angezeigt.  
- Schwellenlinien (Sys 130, Dia 90).  
- Wochenlinien mit Datum unten eingeblendet.  
- Voll responsiv (Mobile/Desktop).

### Export
- **Export JSON** (Arzt-Ansicht): vollständiger Dump aller Einträge.  
- Datenformat: JSON mit Datum, Uhrzeit, Messwerten, Flags, Notizen und Cloud-IDs.  

### Synchronisation (Supabase)
- **Google OAuth Login** integriert.  
- **Realtime-Events** (INSERT, UPDATE, DELETE) aus Supabase werden sofort lokal übernommen.  
- **Auto-Sync** beim Start und beim Wieder-Online-Gehen:
  - Neue lokale Einträge → automatisch hochgeladen.  
  - Server-Änderungen → abgeglichen.  
- Schutz vor falscher Konfiguration:
  - **service_role** Keys werden geblockt.  
  - Nur **anon keys** werden akzeptiert.  

### Sonstiges
- **Offline-First**: volle Funktionalität ohne Internet, Sync erfolgt später automatisch.  
- **Mobile-Optimiert**: Touch-friendly Buttons, Layout passt sich an (1–3 Spalten je nach Display).  
- **Accessibility**: Aria-Rollen, Labels, Tastensteuerung (Speichern auch mit `Ctrl+S` / `Cmd+S`).  
- **Fehlerbehandlung**: sichtbare Statusbox (`#err`) bei Netzwerk- oder Sync-Problemen.  
- **Debug-Panel**: Touch-Log (`Log`-Button) für technische Abläufe & Performance.  

---

## 🚀 Nutzung

### Start
1. Repo klonen oder ZIP herunterladen.  
2. `index.html` im Browser öffnen.  
   - Keine Installation, kein Server, keine Build-Chain nötig.  
   - Läuft sofort lokal (auch auf Mobile).  

### Speicherung
- Alle Eingaben werden in **IndexedDB** lokal gespeichert.  
- Optional: automatische Übertragung an **Supabase REST-API** (wenn Webhook konfiguriert).  

### Export
- Arzt-Ansicht → **Export JSON** → vollständiger Dump als `gesundheitslog.json`.  
- Daten können später in andere Tools importiert oder direkt mit Ärzt:innen geteilt werden.  

---

## 🔒 Sicherheit

- **Keine sensitiven Keys im Code**: nur `anon`-Keys werden gespeichert.  
- **service_role Keys** werden aktiv blockiert (Frontend prüft beim Start).  
- **OAuth** über Google → sauberes User-Mapping.  
- App läuft vollständig clientseitig, keine zentralen Server von Dritten.  

---

## 📌 Versionierung

Dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).  

- **1.0.0** – Initial Stable Release  
  - Entfernung der alten „Liste“-Ansicht & aller Tools.  
  - Fokus auf 2 Haupt-Views: Erfassung & Arzt-Ansicht.  
  - Chart-Panel & JSON-Export nur noch in der Arzt-Ansicht.  
  - IndexedDB + Supabase Realtime vollständig integriert.  
  - Mobile-First Layout & Accessibility verbessert.  

- **1.0.x** – Bugfixes & kleine Verbesserungen.  
- **1.x.0** – neue Features, rückwärtskompatibel.  
- **2.0.0** – größere Umbauten, Breaking Changes.  

---

## 🤝 Beitrag & Feedback

Dies ist ein **persönliches Projekt**, aber Pull Requests, Issues & Ideen sind willkommen.  

- Fehler melden → GitHub Issues.  
- Ideen oder Feedback → gerne per Issue oder Diskussion.  
- Code folgt KISS-Prinzip: **Keep It Simple & Straightforward**.  

---

