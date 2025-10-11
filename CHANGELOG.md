[CHANGELOG.md](https://github.com/user-attachments/files/22867079/CHANGELOG.md)
## v1.7.0 (RELEASE)

Changed:
- Abschluss-Integrationspass: Intake-Header und Arzttermin-Badge besitzen konsistente ARIA-Labels, Live-Regionen und sind fokussierbar.
- Tooltip im Diagramm (Darkmode) erhält höhere Lesbarkeit; KPI-Dots sind größer und mit Glow versehen.
- Feature-Flag `SHOW_BODY_COMP_BARS` steuert Muskel-/Fettbalken im Körper-Chart.
- Header-Telemetrie erfasst p50/p90/p95 für Intake- und Termin-Updates; Diagnoselog meldet Schwellen regelmäßig.
- Flags-Overlay bleiben exklusiv im Blutdruck-Chart; Fallback „Kein Termin geplant“ finalisiert.

## v1.6.9 (PATCH)

Added:
- ARIA-Optimierung für Intake-Pills (Statusgruppe, Screenreader-Texte) und Arzttermin-Badge.
- Fokusreihenfolge Date-Input → Intake-Zeile → Akkordeons.

Changed:
- Tooltip-Hintergrund in Darkmode mit besserem Kontrast; KPI-Dots minimal größer.
- Header-Refresh misst Laufzeit und schreibt Telemetrie in `perfStats`.

## v1.6.8 (PATCH)

Added:
- Körper-Chart: Muskel- und Fettmasse werden als Balken (kg) gerendert; optional deaktivierbar.

Changed:
- Flag-Overlay entfällt im Körper-Chart, bleibt für Blutdruck aktiv.

## v1.6.7 (PATCH)

Added:
- Capture „Körper“: Eingabefelder für Prozent Fett/Muskel inkl. Validierung.

Changed:
- Fetch/Views liefern `fat_pct`, `muscle_pct`, `fat_kg`, `muscle_kg`; Arzt-Ansicht zeigt Werte.

## v1.6.6 (PATCH)

Added:
- Backend-View `v_events_body` erweitert um Kompositionswerte (`fat_kg`, `muscle_kg`).

Changed:
- RLS/Indices geprüft; Body-Daten stehen dem Client als kg-Werte bereit.

## v1.6.5 (PATCH)

Added:
- BP-Kontext schaltet automatisch: 00:00 → Morgens, 12:05 → Abends inkl. User-Override.

Changed:
- Visibility-/Timer-Hooks synchronisieren Datum, Kontext und Intake.

## v1.6.4 (PATCH)

Added:
- Intake-Pills & Arzttermin-Badge im Capture-Header (Zeitzone Europe/Vienna, Live-Updates).

Changed:
- Header-Layout: Pills vor Termin, mobiler Umbruch.

## v1.6.0 (MINOR)

Added:
- Capture-Panel „Arzttermine“ für sechs Rollen mit PATCH-first-Workflow und Realtime-Updates.
- Accessibility: aria-live Feedback, Done-Button konditional.

Changed:
- Em dash (`—`) für leere Terminwerte; `requestUiRefresh` lädt appointments gezielt.

Notes:
- Termine nutzen Browserzeit beim Erfassen, speichern als ISO/UTC.
- RLS + Partial-Unique Index erlauben je Rolle einen geplanten Termin.

## v1.5.7 (PATCH)

Changed:
- Lifestyle-Tab entfällt; Intake-Balken/Pills liegen direkt im Capture-Accordion.
- CSS-Selektoren decken Capture-Bereich ab, Refresh koppelt Bars & Pills.

## v1.5.6 (PATCH)

Fixed:
- Intake-Helfer global erreichbar, kein Scope-Fehler mehr.

Changed:
- Fortschrittsbalken modernisiert (Gradient/Glow), Intake-Pills farbcodiert.

## v1.5.5 (PATCH)

Added:
- Capture-Accordion „Flüssigkeit & Intake“ mit Add-Buttons für Wasser/Salz/Protein.

Changed:
- Intake-Zeitstempel auf Tagesmitte (12:00 UTC) vereinheitlicht.

Fixed:
- Online-Reconnect triggert nur `reconcileFromRemote`, wenn verfügbar.

## v1.5.4 (PATCH)

Fixed:
- `isLoggedInFast()` räumt Timeout auf; keine späten session-timeout Fehler.
- `resetFlagsPanel` entfernt Legacy-Aufruf `setSugarHigh()`.
- Ungenutztes `__t0` (performance.now) gelöscht; is-busy Klassen entfallen.
- Bootstrap-Logger (F9) entfernt, Diagnosepanel übernimmt Logging.

## v1.5.3 (PATCH)

Fixed:
- Login-Gating blockierte Tabs nach Resume – Timeout + Session-Fallback eingeführt.
- Session-Status wird zwischengespeichert (`__lastLoggedIn`).

## v1.5.2 (PATCH)

Fixed:
- Tabs nach App-/Tab-Wechsel: Session-Re-Validation, Tab-Buttons aktiv, Lock-Overlay schließt korrekt.

## v1.5.1 (PATCH)

Fixed:
- Sichtwechsel trennt Lock-Overlay, Tabs bleiben klickbar; gesperrte Arzt-Ansicht springt auf Capture.

## v1.5.0 (PATCH)

Changed:
- Entfernt globale Speicher-Shortcuts; Capture speichert panelweise.
- `requestUiRefresh` orchestriert Unlock-/Tab-/Chart-Aufrufe einheitlich.
- Kommentare/Diagnose-Logs aufgeräumt; sugar→protein Migration markiert.

## v1.4.9 (PATCH)

Changed:
- Neuer `requestUiRefresh`-Orchestrator bündelt Arzt-/Lifestyle-/Chart-Render.
- Panel-Saves & Tab-Wechsel rufen nur noch den Orchestrator, Chart zeichnet nur bei Bedarf.
- Realtime-Events werden koalesziert; Boot-/Login-Flows teilen denselben Refresh-Pfad.

## v1.4.8 (PATCH)

Changed:
- Globalen „Speichern“-Button & Hotkeys entfernt; Erfassung ausschließlich panelweise.
- Capture-Felder resetten bei Laden/Tab-/Datum-Wechsel.
- Panel-Saves beeinflussen nur ihr Panel; ESC/Enter-Shortcuts je Panel.
- Keine Cloud-Vorbelegung im Capture – Sicht nur Arzt-Ansicht.

## v1.4.7.1 (PATCH)

Added:
- Blutdruck-Panel: Dropdown Morgens/Abends + gemeinsamer Speichern-Button.
- Körper-/Flags-Panel: eigene primäre Buttons mit Feedback.

Changed:
- Kommentarpflicht prüft Panel-Kommentare, Flags-Kommentar nur im Flags-Save.

## v1.4.7 (PATCH)

Added:
- Capture-Accordion erhält eigene Save-Buttons je Panel.

Changed:
- Buttons nutzen bestehende Speicherroutinen; globaler Save bleibt Fallback.

## v1.4.6 (PATCH)

Changed:
- Capture-Ansicht nutzt dreiteiliges Accordion (BP/Körper/Flags).

## v1.4.5 (PATCH)

Added:
- BP-Kommentare pro Kontext (Morgens/Abends) mit Note-Prefix.

Changed:
- Datumwechsel leert BP-/Flags-Kommentarfelder.

## v1.4.4 (PATCH)

Added:
- Flags-Bereich erhält Kommentarfeld; speichert Notes mit Präfix `[Flags]`.

Changed:
- Flag-Kommentare werden nach Save/Datumwechsel geleert; Arzt-Ansicht fasst Notes.

## v1.4.3 (PATCH)

Changed:
- Arzt-Ansicht fasst Tagesnotizen zusammen; Notes loader sortiert/aggregiert.

## v1.4.2 (PATCH)

Changed:
- Arzt-Ansicht fordert Passkey automatisch an, Overlay nur bei Bedarf.

Improved:
- Passkey-Setup aktualisiert Dialogzustand direkt.

## v1.4.1 (PATCH)

Fixed:
- App-Lock lässt sich nach Wechsel/Abbruch schließen; Step-up Intent setzt Aktionen fort.

Improved:
- App-Lock fokussiert Eingabe, blendet beim Verlassen aus; Visibility-Wechsel schließt Lock.

## v1.4.0 (MINOR)

Changed:
- Auth/UX: Biometrie/PIN-Lock ausschließlich für Arzt-Ansicht.
- Tab/Chart/Export prüfen Passkey/PIN lokal; Capture bleibt frei zugänglich.

Notes:
- Entsperren vollständig clientseitig; Login via Google OAuth bleibt Basis.
