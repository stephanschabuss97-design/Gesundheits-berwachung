[CHANGELOG.md](https://github.com/user-attachments/files/22564041/CHANGELOG.md)
## v1.5.0 (PATCH)

Changed:
- Entfernt letzte Reste des globalen Speicherns (Ctrl/Cmd+S und alte Handler); Capture arbeitet ausschliesslich panelweise.
- requestUiRefresh orchestriert jetzt auch Chart-Aufrufe nach Unlock und Tab-Buttons; direkte renderDoctor/chartPanel.draw Aufrufe wurden entfernt.
- Kommentare und Diagnose-Logs aufgeraeumt; Legacy sugar->protein Migration bleibt als markierte Runtime-Sicherung.
- README und QA-Checks ergaenzt (Capture Panels, Refresh-Verhalten, ASCII-Hinweis).
## v1.4.9 (PATCH)

Changed:
- Neuer requestUiRefresh-Orchestrator buendelt Render-Aufrufe fuer Arzt-, Lifestyle- und Chart-Ansicht.
- Panel-Saves, Range-Apply und Tab-Wechsel rufen nur noch den Orchestrator; Doctor-View refresht stets, das Diagramm nur bei geoeffnetem Panel.
- Realtime-Events werden koalesziert (keine doppelten Render), Boot- und Login-Flows nutzen denselben Refresh-Pfad.
## v1.4.8 (PATCH)

Changed:
- Entfernt den globalen "Speichern"-Button sowie Hotkeys; Erfassung erfolgt nur noch panelweise.
- Capture-Felder werden beim Laden, Tab-Wechsel oder Datumswechsel automatisch geleert; Flags starten deaktiviert.
- Panel-Saves setzen nur ihr eigenes Panel zurueck (inkl. Fokus), ohne andere Eingaben zu beeinflussen.
- Eingabefelder haben Auto-Fokus und ESC-Reset je Panel; Enter loest den jeweiligen Speichern-Button aus.
- Capture greift nicht mehr auf Cloud-Vorbelegung zurueck, gespeicherte Werte sind ausschliesslich in der Arzt-Ansicht sichtbar.
## v1.4.7.1 (PATCH)

Added:
- Blutdruck-Panel besitzt nun ein Dropdown fuer Morgens/Abends und einen gemeinsamen Speichern-Button.
- Koerper- und Flags-Panel zeigen eigene primare Buttons (linksbuendig, blau) mit direktem Feedback.

Changed:
- Kommentar-Pflicht prueft die jeweiligen BP-Kommentare statt der Tagesnotiz; allgemeines Koerper-Kommentarfeld entfaellt.
- Panel-Save leert Flags-Kommentare nur beim Flags-Button und nutzt flashButtonOk fuer sichtbares Erfolgsfeedback.
## v1.4.7 (PATCH)

Added:
- Capture-Accordion erhaelt eigene Speichern-Buttons je Panel (Blutdruck, Koerper, Flags).

Changed:
- Panel-Buttons rufen die bestehenden Speicherroutinen auf; globaler Speichern-Button bleibt als Fallback aktiv.
## v1.4.6 (PATCH)

Changed:
- Capture-Ansicht nutzt jetzt drei einklappbare Panels fuer Blutdruck, Koerper und Flags (Accordion).
- Accordion-UI bringt klare Abgrenzung, bleibt initial offen und veraendert keine Speicherlogik.
## v1.4.5 (PATCH)

Added:
- Blutdruck-Morgens/Abends erhaelt eigene Kommentar-Felder; Speichern legt Notes mit Prefix [Morgens] bzw. [Abends] an.

Changed:
- Capture-Sync leert BP- und Flag-Kommentarfelder beim Datumwechsel.
## v1.4.4 (PATCH)

Added:
- Flags-Bereich enthaelt jetzt ein eigenes Kommentarfeld; Speichern legt separate Note-Events mit Praefix [Flags] an.

Changed:
- Flag-Kommentare werden nach dem Speichern und bei Datumwechsel im Capture-Tab zurueckgesetzt; Arzt-Ansicht zeigt mehrere Flag-Notizen pro Tag in Reihenfolge.
## v1.4.3 (PATCH)

Changed:
- Arzt-Ansicht: Tagesnotizen werden zusammengefasst. Alle Note-Events eines Tages werden zeitlich sortiert und als ein zusammenhaengender Kommentar angezeigt.
- Notes-Lader sortiert health_events `type=note` aufsteigend per Timestamp, fasst Texte zusammen und liefert den juengsten Zeitstempel fuer die Tageskarte.
## v1.1.0 (MINOR)

- Replace sugar flag with protein flag across UI/DB/Admin.
- UI: introduce `protein_high90` (Protein aper-mille 90 g) toggle and badge.
- JS: rename internal day flag to `protein_ge90`; add runtime migration from legacy `sugarHighToggle` to `proteinHighToggle` to avoid layout breakage.
- SQL: update `day_flags` validation keys and `v_events_day_flags` view to use `protein_high90`.
- Admin checks: allow `protein_high90` and drop `sugar_high`.
- Charts (SVG): day flags overlay now renders even without BP measurements; flagged-only days extend the X-domain; overlay is available for all metrics (bp, weight).
- UI: Protein toggle label shows a meat icon (Y-) for clarity.

Notes:
- Backward compatibility: existing events with `sugar_high` are not referenced anymore; new events use `protein_high90`.
  If historical data exists, consider a one-off migration.
## v1.2.0 (MINOR)

Added:
- SVG-Tooltips zeigen Tages-Flags pro Datenpunkt (Hover/Tap), ohne Nachbarwerte.
- Accessibility: Punkte sind fokussierbar (tabindex, role); Tooltip hat aria-live Region; Enter/Space Affnet, ESC schlieAYt.

Changed:
- Chart baut Flags-Lookup pro Tag und zeigt Flags im Tooltip (Training, Krank, < 2 L Wasser, > 5 g Salz, Y- Protein aper-mille90 g, NSAR, Valsartan/Forxiga vergessen, Medikamente).



## v1.2.1 (PATCH)

Fixed:
- Save: day_flags duplicate (409) handled with PATCH upsert fallback; other events are inserted afterward. Kein Voll-LAschen des Tages nAtig.

Improved:
- Capture: Flag-Toggles synchronisieren sich beim A-ffnen/Datumwechsel mit bestehenden Tages-Flags aus der Cloud.
- UX: Nach Sync sind bereits gesetzte Flags sichtbar, um Doppel-Speichern zu vermeiden.

## v1.3.0 (MINOR)

Added:
- Supabase Schema: `health_events` akzeptiert neuen Typ `intake`; Trigger/Checks validieren Wasser/Salz/Protein, Unique-Index pro Tag/User.
- Admin Checks: Intake in Duplikat-/Range-/Unknown-Key-PrA14fungen aufgenommen.
- UI: Lifestyle-Tab speichert Tageswerte zu Wasser/Salz/Protein A14ber REST (POST/PATCH) inkl. Realtime-Refresh.
- Progress Bars zeigen Zielstatus mit Farblogik (Wasser: Aufholphasea"Ziel, Salz: Warn-/Aberbereich, Protein: Zielkorridor 78aEUR"90 g).

Changed:
- Save-Flow blockt BP-EintrAge ohne Sys+Dia (verhindert 400er vom Trigger).
- Fehlerdiagnose: Detail-Logging bei misslungenen Lifestyle-POSTs, Config/Key-Status im Touch-Log, `getHeaders()` liefert prAzise Hinweise.
- Labels der Lifestyle-Balken enthalten Status-Texte und nutzen kontrastreiche Schriftfarben.

Fixed:
- Trigger entfernt Aufruf von `jsonb_object_length` (nicht verfA14gbar auf Supabase), damit Intake-Insert kein 404/42883 mehr auslAst.

## v1.4.2 (PATCH)

Changed:
- Arzt-Ansicht: Passkey wird automatisch abgefragt, das App-Lock-Overlay erscheint nur noch, wenn kein Passkey vorhanden oder WebAuthn nicht verfuegbar ist.
- Overlay weist auf fehlende Passkey-Unterstuetzung hin, deaktiviert den Passkey-Button bei Bedarf und erlaubt PIN-Entsperren per Enter-Taste.

Improved:
- Passkey-Setup aktualisiert den Dialogzustand direkt nach erfolgreicher Registrierung.

## v1.4.1 (PATCH)

Fixed:
- Arzt-Ansicht: App-Lock laesst sich nach App-/Tab-Wechsel oder Abbruch wieder schliessen (Esc/Overlay-Klick/Abbrechen).
- Step-up Intent: Nach Entsperren wird die urspruenglich angeforderte Aktion (Tab, Chart, Export) automatisch fortgesetzt.

Improved:
- App-Lock fokussiert Eingabe/Buttons und blendet sich beim Verlassen der Arzt-Ansicht automatisch aus.
- Sichtbarkeitswechsel (z. B. Fensterwechsel) schliesst den Lock, solange die Arzt-Ansicht nicht aktiv ist.

## v1.4.0 (MINOR)

Changed:
- Auth/UX: Biometrie/PIN-Lock nur fA14r Arzt-Ansicht (Vault) statt global nach Login.
- Arzt-Tab, Charts und Exporte prA14fen lokal per Passkey/PIN; normale Erfassung bleibt ohne extra Schritt.

Notes:
- Keine serverseitige Step-up-Session; Entsperren ist rein clientseitig. Login weiterhin A14ber Google (Supabase OAuth).






