[README.md](https://github.com/user-attachments/files/22440723/README.md)
# Gesundheits-Logger

Der Gesundheits-Logger ist eine offlinefaehige Web-App zur Erfassung, Auswertung und Synchronisierung von Gesundheitsdaten - optimiert fuer Alltag und Gespraeche mit Aerztinnen und Aerzten. Die Anwendung laeuft komplett im Browser, speichert Daten in IndexedDB und kann optional ueber Supabase synchronisieren.

---

## Funktionsueberblick

### Erfassung (Capture)
- Eingabe von morgendlichen/abendlichen Blutdruckwerten (Sys, Dia, Puls inkl. MAP-Berechnung).
- Erfassung von Gewicht (kg) und freien Kommentaren.
- Tages-Flags fuer Training, Krankheit, Medikamentenausfaelle, Wasser <2 L, Salz >5 g, Protein >=90 g, NSAR usw.
- Speicherung lokal in IndexedDB; optionaler Push zur Supabase-REST-API.

### Lifestyle Intake (neu in v1.3.0)
- Kumulierte Tageswerte fuer Wasser, Salz und Protein.
- REST-Workflow (POST/PATCH) mit Realtime-Refresh, sobald Supabase konfiguriert ist.
- Fortschrittsbalken mit Ziel-Visualisierung:
  - Wasser: Rot (<50 %), Gelb (50-89 %), Gruen (>=90 %).
  - Salz: Gruen (<=4.9 g), Gelb (5-6 g), Rot (>6 g).
  - Protein: Neutral (<78 g), Gruen (78-90 g), Rot (>90 g).
  - Labels greifen die Zustandsfarbe auf und bleiben kontrastreich lesbar.

### Arzt-Ansicht
- Taegliche Uebersicht im 3-Spalten-Layout (Datum mit Cloud-Status, Messungen inkl. Grenzwerte, Gewicht/Flags/Kommentar).
- KPIs als Badges: Trainingstage, Tage mit mindestens einem Bad-Flag.
- Zeitraumfilter (Von/Bis), Cloud-Loeschung einzelner Tage.

### Diagramm (SVG)
- Verlaufsdarstellung fuer Blutdruck, Puls und Gewicht.
- Durchschnittswerte, Warnschwellen (Sys 130, Dia 90), Wochenraster.
- Voll responsiv inkl. Tooltip-/Keyboard-Unterstuetzung und Flag-Overlay.

### Export
- JSON-Export der Arzt-Ansicht (gesundheitslog.json) mit allen Messwerten, Flags, Notizen und Cloud-IDs.

### Synchronisation & Logging
- Google OAuth Anmeldung.
- Realtime-Events (INSERT/UPDATE/DELETE) von Supabase werden lokal gespiegelt.
- Diagnoselog (Log-Panel) zeigt aktive REST-Konfiguration, Key-Typen und Fehlerdetails bei POST/PATCH.

---

## Nutzung & Setup

1. Repository klonen oder ZIP entpacken.
2. index.html im Browser oeffnen - keine Installation, kein Build noetig.
3. Daten werden automatisch lokal in IndexedDB gespeichert.
4. Optional Supabase konfigurieren (Konsole -> putConf):
   - webhookUrl = https://<project-ref>.supabase.co/rest/v1/health_events
   - webhookKey = Bearer <ANON_KEY>
5. Anmelden via Google OAuth, Lifestyle- und Capture-Daten werden anschliessend synchronisiert.

Export: In der Arzt-Ansicht Export JSON klicken; die Datei kann direkt mit Aerztinnen/Aerzten geteilt werden.

---

## Sicherheit

- Es werden ausschliesslich anon-Keys akzeptiert; service_role wird clientseitig blockiert.
- Keys bleiben in IndexedDB; keine sensiblen Daten im Quellcode.
- Die App verarbeitet Daten vollstaendig im Browser - kein fremder Server.
- Touch-Log zeigt REST-URL, Key-Typ und Session-Status zur schnellen Diagnose.

---

## Versionierung (Auszug)

Dieses Projekt folgt Semantic Versioning.

- **1.0.0** - initialer stabiler Release mit Capture + Arzt-Ansicht, Realtime, JSON-Export.
- **1.2.x** - verbesserte Chart-Tooltips, Flag-Upsert via PATCH, Capture-Sync.
- **1.3.0** - Lifestyle Intake (Wasser/Salz/Protein), REST-/Trigger-Updates, Diagnose-Logging, BP-Validierung.
- Weitere Versionen siehe CHANGELOG.md.

---

## Beitrag & Feedback

Pull Requests, Issues und Ideen sind willkommen. Bitte Fehler oder Wuensche ueber GitHub Issues melden. Der Code folgt dem KISS-Prinzip - Keep It Simple & Straightforward - und bleibt bewusst build-frei.

Viel Freude mit dem Gesundheits-Logger!
