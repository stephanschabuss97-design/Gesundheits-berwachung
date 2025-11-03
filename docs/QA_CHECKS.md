# QA Checklists

## v0.1.0 - Prototype

**Smoke**
- Tabs "Erfassen"/"Arzt-Ansicht" sichtbar; SVG-Chart rendert.
- Hilfe-/Diagnose-Panels ÃƒÂ¶ffnen per Header/FAB.
- Tages-Flags (Training, Krank, Valsartan/Forxiga vergessen, NSAR) sind klickbar.

**Sanity**
- Konfiguration erlaubt REST-Endpoint und API-Key; Speichern ruft `syncWebhook(entry)` (POST JSON, optionaler Authorization-Header) auf.
- Diagnose-Log protokolliert Benutzeraktionen (z. B. Toggle/Speichern).

**Regression**
- Keine Realtime/Auth/RLS; kein IndexedDB.
- UI bleibt responsiv, Sync-Fehler werden im Log angezeigt.

---

## v0.2.0 - Sync stabil

**Smoke**
- Button "Sync mit Supabase" lÃƒÂ¶st 4-Schritte-Dialog aus (CSV-Backup, Pending-Push, lokales Wipe, Reimport via REST); Busy-Overlay blockiert UI.
- CSV-Backup (`dl`) wird vor dem Sync erzeugt; Export CSV/JSON funktionieren weiter.
- "Alle lokal lÃƒÂ¶schen" entfernt EintrÃƒÂ¤ge aus IndexedDB nach BestÃƒÂ¤tigung.

**Sanity**
- `syncWebhook(entry, localId)` trÃƒÂ¤gt `remote_id` nach erfolgreichem POST ein; Pending ohne `remote_id` bleibt erhalten.
- `getHeaders` generiert Bearer-Header aus Konfiguration; `pushPendingToRemote`/`pullAllFromRemote` nutzen ihn.
- Diagnose-Log zeigt Sync-Schritte (Backup/Pending/Reload) sowie Fehler (fehlende Konfiguration etc.).

**Regression**
- Daily-Capture-Saves funktionieren offline weiter; Busy-Overlay verschwindet nach dem Sync.
- Toggle-Buttons setzen `aria-pressed`; "Krank" deaktiviert den Forxiga-Toggle.

---

## v0.3.0 - Befund Capture

**Smoke**
- Segment-Buttons "Erfassen Ã¢â‚¬â€œ Daily/Befund" schalten die Karten; Befund-Panel zeigt Felder fÃƒÂ¼r Datum, Kreatinin, eGFR, uACR, Kalium, Notiz.
- "Befund speichern" legt einen Eintrag im IndexedDB-Store `reports` an (Button-Flash, Felder werden geleert).
- Konfiguration speichert `webhookUrlMr`; Speichern bestÃƒÂ¤tigt mit "Gespeichert".

**Sanity**
- IndexedDB Version 3 beinhaltet den Store `reports` mit Index `byDate`; `addReport`/`updateReport`/`getAllReports` behalten `remote_id`.
- `syncReportWebhook(report, localId)` nutzt `webhookUrlMr` + `getHeaders`; Erfolg -> Log "Befund: Webhook OK", Fehler -> "Befund: Netzwerkfehler".
- Daily-Erfassung bleibt funktionsfÃƒÂ¤hig; Segment-Umschaltung beeinflusst Tagesfelder nicht.

**Regression**
- Manueller Daily-Sync (CSV/Pending/Wipe/Reload) arbeitet wie in v0.2.0; Busy-Overlay verschwindet danach.
- Export CSV/JSON liefert weiterhin Daily-EintrÃƒÂ¤ge; Offline-Saves bleiben mÃƒÂ¶glich.
- Toggle-Logik ("Krank" deaktiviert Forxiga) unverÃƒÂ¤ndert.

---

## v0.3.1 - Befundliste & Delete

**Smoke**
- "Erfassen"-Segment bleibt identisch; Liste-Tab besitzt Segment "Daily/Befund" und zeigt im Befund-Modus Tabelle `#tblReports` inkl. Sync-Status und Delete-Aktion.
- Sync-Status-Icon ("(sync)") sichtbar, sobald `remote_id` gesetzt ist; Delete-Button zeigt Busy/DONE wÃƒÂ¤hrend der AusfÃƒÂ¼hrung.
- Befund-Liste reagiert auf Segmentwechsel; Daily-Liste bleibt unverÃƒÂ¤ndert.

**Sanity**
- `loadAndRenderReports()` sortiert `reports` absteigend nach `ts`; Segmentwechsel ruft `loadAndRender()` bzw. `loadAndRenderReports()`.
- Delete-Flow: `deleteReportLocal` entfernt IDB-Eintrag; mit `remote_id` wird REST-DELETE versucht (Log "Befund-LÃƒÂ¶schung: Server + lokal OK" bzw. Fehlerhinweis).
- Konfiguration speichert weiterhin `webhookUrlMr`; Daily-Sync/Export bleiben verfÃƒÂ¼gbar.

**Regression**
- Daily-Capture/Saves arbeiten wie in v0.3.0; Busy-Overlay fÃƒÂ¼r Daily-Sync unverÃƒÂ¤ndert.
- Befund-Save (Segment "Erfassen Ã¢â‚¬â€œ Befund") funktioniert weiterhin; Felder leeren sich nach dem Speichern.
- CSV/JSON-Export liefert weiterhin Daily-Events; Befunddaten werden nicht versehentlich exportiert.

---

## v0.4.0 - Arzt-Ansicht Befunde

**Smoke**
- Segment "Daily/Befund" in der Arzt-Ansicht blendet Tabelle `#doctorTable` bzw. `#doctorReportsTable` korrekt ein/aus.
- Button "Werte anzeigen" ÃƒÂ¶ffnet das passende Diagramm (Daily vs. Befunde); `chartReportsPanel` respektiert Metrik-Auswahl, GlÃƒÂ¤tten und PNG-Export.
- Befund-Charts zeigen Werte (Kreatinin/eGFR/uACR/Kalium); bei leeren ZeitrÃƒÂ¤umen erscheint der Placeholder.

**Sanity**
- `renderDoctorViewForMode()` und `loadAndRenderReports()` filtern nach Von/Bis und sortieren nach Datum/TS.
- `chartReportsPanel.getFiltered()` nutzt dieselben Filter; Range-Apply aktualisiert Tabellen und Diagramme (Daily/Befund).
- Segment "Liste Ã¢â‚¬â€œ Daily/Befund" lÃƒÂ¤dt weiterhin Daily bzw. Befunddaten on demand.

**Regression**
- Daily-Capture, Sync und Export behalten ihr Verhalten (Busy-Overlay, CSV/JSON, wipe) Ã¢â‚¬â€œ inkl. Refresh der aktiven Doctor-Ansicht und Charts.
- Befund-Save funktioniert wie in v0.3.0; Daily-Ansicht bleibt unverÃƒÂ¤ndert.
- Diagnose-Logs (Befund-Sync/LÃƒÂ¶schung) erscheinen weiterhin ("Befund-LÃƒÂ¶schung: Server + lokal OK" etc.).

---

## v0.5.0 - Realtime & Auto-Sync

**Smoke**
- `initialAutoSync()` lÃƒÂ¤uft beim Start: Busy-Overlay aktiv, Pending wird gepusht, Daily/Befunde (Liste & Arzt) werden ohne Wipe neu geladen.
- Realtime-Client (`setupRealtime()`) verbindet nach Konfig-Save; Logs zeigen "Supabase Realtime: Client initialisiert" bzw. "... subscribed".
- Online-Ereignis (`window.addEventListener('online', ...)`) triggert Pending-Push und `reconcileFromRemote()`/`reconcileReportsFromRemote()`; Listen/Charts aktualisieren sich.

**Sanity**
- Insert/Update aus Realtime upsertet Daily/Befund-DatensÃƒÂ¤tze; Delete entfernt den lokalen Eintrag (`deleteEntryLocal`/`deleteReportLocal`).
- Busy-Overlay (`setBusy`) wird bei Auto-Sync, manuellen Syncs und Realtime-Aktionen korrekt gesetzt/gelÃƒÂ¶st.
- Von/Bis-Range aktualisiert Daily- und Befund-Charts (`chartPanel`/`chartReportsPanel`), egal ob Realtime aktiv ist.

**Regression**
- Manueller Sync (Backup/Wipe/Reload) funktioniert weiterhin; Realtime bleibt danach aktiv.
- Offline-Saves bleiben mÃƒÂ¶glich, Pending wird beim nÃƒÂ¤chsten Online-Event verarbeitet.
- Diagnose-Log zeigt Realtime-Events (INSERT/UPDATE/DELETE) und Auto-Sync-Ergebnisse.

---

## v0.6.0 - Auth & Realtime

**Smoke**
- `initialAutoSync()` lÃƒÂ¤uft beim Start: Busy-Overlay aktiv, Pending wird gepusht, Daily/Befunde (Liste & Arzt) werden ohne Wipe neu geladen.
- Realtime-Client (`setupRealtime()`) verbindet nach Konfig-Save; Logs zeigen "Supabase Realtime: Client initialisiert" bzw. "... subscribed".
- Online-Handler (`window.addEventListener('online', ...)`) triggert Pending-Push plus `reconcileFromRemote()`/`reconcileReportsFromRemote()`; Listen und Charts aktualisieren sich.

**Sanity**
- Insert/Update aus Realtime upsertet Daily- und Befund-DatensÃƒÂ¤tze; Delete entfernt lokale EintrÃƒÂ¤ge (`deleteEntryLocal`/`deleteReportLocal`).
- Busy-Overlay (`setBusy`) wird bei Auto-Sync, manuellen Syncs und Realtime-Aktionen sauber gesetzt/gelÃƒÂ¶st.
- Von/Bis-Range aktualisiert sowohl Daily- als auch Befund-Charts (`chartPanel`/`chartReportsPanel`), auch nach Realtime-Events.

**Regression**
- Manueller Daily-Sync (Backup/Wipe/Reload) funktioniert weiterhin; Realtime bleibt danach aktiv.
- Offline-Saves bleiben mÃƒÂ¶glich, Pending wird beim nÃƒÂ¤chsten Online-/Realtime-Ereignis verarbeitet.
- Diagnose-Log zeigt Realtime-Events (INSERT/UPDATE/DELETE) sowie Auto-Sync-Ergebnisse.

---

## v0.7.0 - Salz/Zucker Flags

**Smoke**
Capture-Panel enthaelt neue Toggles #saltHighToggle (> 5 g Salz) und #sugarHighToggle (> 10 g Zucker); Button-Flash + Reset bleiben erhalten.\n- Liste/Arzt-Ansicht zeigen zusaetzliche Spalten fuer Salz/Zucker; Chart-Panels (Daily/Befund) oeffnen im breiteren Layout (panel chart).\n- CSV-Export enthaelt Spalten Salz_ueber_5g und Zucker_ueber_10g.

**Sanity**
Save-Flow (saveBlock) uebermittelt salt_high/sugar_high; toggle-Status wird beim Laden aus der Cloud wiederhergestellt. Von/Bis-Filter aktualisieren Tabellen/Charts mit den neuen Werten; Placeholder-Text und Legenden bleiben korrekt. Delete-/Sync-Logik (lokal + remote) behandelt Eintraege weiterhin konsistent.

**Regression** 
Bestehende Flags (Training, Krank, NSAR usw.) funktionieren unveraendert. Auto-Sync/Realtime (aus v0.6.0) bleibt stabil Ã¢â‚¬â€œ Pending Save und Delete werden weiterhin abgefangen.- Export JSON / Backup CSV liefern vollstaendige Datensaetze (inkl. neuer Felder).

---

## v0.8.0 - Arzt Daily Layout & Print

**Smoke**
- Arzt-Ansicht (Daily) zeigt pro Tag 3 Spalten: Datum, Messungen (Morgens/Abends) und Ã¢â‚¬Å¾SpezialÃ¢â‚¬Å“ (Gewicht-Zeile, Flags-Grid, Notizen).
- Flags-Grid zeigt ZustÃƒÂ¤nde fÃƒÂ¼r <2L, Salz >5g, Zucker >10g, Krank, Medikamente, Training (sichtbares Ã¢â‚¬Å¾onÃ¢â‚¬Å“-Styling ÃƒÂ¼ber Flag-Box).
- Ã¢â‚¬Å¾TageszusammenfassungÃ¢â‚¬Å“ erscheint, wenn Gewicht/Notiz/irgendein Flag gesetzt ist; CSV-Export weist dann Art Ã¢â‚¬Å¾TageszusammenfassungÃ¢â‚¬Å“ aus.
- Druckansicht blendet UI-Chrome (Tabs/Charts/Diag) aus und druckt Arzt-/Befundansichten (Tabellen + TagesblÃƒÂ¶cke) mit korrekten RÃƒÂ¤ndern.
- TastenkÃƒÂ¼rzel: Strg/Cmd+S speichert den aktuellen Daily-Eintrag (Browser-Speichern wird verhindert, visuelles Feedback bleibt).

**Sanity**
- Flag-Ableitungen in Arzt-Ansicht: `low_intake -> flags.water_lt2`, `salt_high -> flags.salt_gt5`, `sugar_high -> flags.sugar_gt10`, `sick -> flags.sick`, `training -> flags.training`, `(valsartan_missed|forxiga_missed|nsar_taken) -> flags.meds`.
- Responsive Layout: 3 Spalten Ã¢â€°Â¥900px, 2 Spalten 600Ã¢â‚¬â€œ899px (Grid-Areas), 1 Spalte <600px; Flags-Grid bricht sinnvoll um (Desktop 5, Mobil 3 Spalten).
- Notizen clampen nicht im Druck; Zahlen werden nicht abgeschnitten (min-width fÃƒÂ¼r numerische Felder).
- CSV-Header enthÃƒÂ¤lt `Salz_ueber_5g`/`Zucker_ueber_10g`; Ã¢â‚¬Å¾ArtÃ¢â‚¬Å“ zeigt Messung/Training/Tageszusammenfassung korrekt, Zeitlabel enthÃƒÂ¤lt Kontext (Morgens/Abends/Tag).
- Service-Role-Guard in der Konfiguration warnt vor `service_role`-Keys; nach gÃƒÂ¼ltiger ANON-Konfig initialisiert Supabase-Client und Realtime.

**Regression**
- Realtime/Auto-Sync (v0.6.0) funktioniert unverÃƒÂ¤ndert; Pending Push, Reconcile (Daily/Befunde), Busy-Overlay.
- Manuelle Daily-Sync-Pipeline (Backup CSV Ã¢â€ â€™ Pending Push Ã¢â€ â€™ Wipe Ã¢â€ â€™ Reload) bleibt funktional; Salz/Zucker-Flags erscheinen weiterhin in Liste/Arzt-Ansicht.
- Export CSV/JSON unverÃƒÂ¤ndert auÃƒÅ¸er zusÃƒÂ¤tzlichen Spalten aus v0.7.0; Delete-/Save-Flows (Daily/Befund) bleiben stabil.

---

## v0.9.0 - Print & Hard Reset

**Smoke**
- Print-Button (`#printBtn`) ÃƒÂ¶ffnet den System-Druckdialog und nutzt die Print-CSS (Tabs/Charts/Diag ausgeblendet, saubere Tabellen/RÃƒÂ¤nder).
- Hard-Reset (`#hardResetBtn`) zeigt Confirm, entfernt Service Worker, Caches, Local/Session Storage und Cookies, lÃƒÂ¤dt frisch.
- Tastatur-Fokus ist sichtbar (Outline via `:focus-visible`) auf interaktiven Controls.

**Sanity**
- Nach Hard-Reset ist lokale Konfiguration entfernt; nach erneutem Speichern der Webhook-/Key-Werte initialisieren sich Supabase-Client und Realtime erneut.
- Arzt-Layout: Zahlen werden nicht abgeschnitten (tabular-nums, min-width), Flags-Grid wrappt auf Desktop in mehr Spalten (6) und mobil kompakt (3/5 je nach Breakpoint).
- CSV/JSON-Export bleibt inhaltlich identisch zu v0.8.0; Ã¢â‚¬Å¾ArtÃ¢â‚¬Å“/Zeitlabels unverÃƒÂ¤ndert korrekt.

**Regression**
- Realtime/Auto-Sync (v0.6.0) bleibt stabil; Pending/Busy/Range-Updates funktionieren.
- Capture/List/Doctor Segments funktionieren unverÃƒÂ¤ndert; Speichern (inkl. Strg/Cmd+S) lÃƒÂ¶st weiterhin Save aus.
- Salz/Zucker-Flags erscheinen weiterhin korrekt in Liste/Arzt-Ansicht und im CSV.

---

## v1.0.0 - App-Lock, KPIs, Waist/Protein

**Smoke**
- App-Lock: Nach Login/Boot erscheint bei aktivierter Sperre das Lock-Overlay; Entsperren via Ã¢â‚¬Å¾Per Passkey entsperrenÃ¢â‚¬Å“ oder PIN funktioniert, UI dimmt (`body.auth-locked`) und wird nach Unlock freigegeben.
- Arzt-Toolbar: Mittig Von/Bis + Anwenden + Werte anzeigen + Export JSON; rechts Badges Ã¢â‚¬Å¾TrainingstageÃ¢â‚¬Å“ und Ã¢â‚¬Å¾Tage mit Bad-FlagÃ¢â‚¬Å“ werden angezeigt und aktualisiert.
- Diagramm-KPIs: BP zeigt Durchschnitt Sys/Dia/MAP; Gewichtsdiagramm zeigt Gewicht+Bauchumfang (2 Serien) und KPI-Leiste blendet BMI/WHtR (letzte Werte) ein.
- Tageszusammenfassung: Neues Feld Bauchumfang (cm) wird gespeichert (Day-Entry) und in der Arzt-Ansicht angezeigt; Protein-Flag (Ã¢â€°Â¥90g) ist als Toggle vorhanden und erscheint in Arzt-Flags.

**Sanity**
- Lock-Flows: Passkey-Registrierung speichert Credential-ID lokal; Unlock via Passkey/PIN setzt App frei; Buttons sind gebunden (`bindAppLockButtons`).
- KPI-Umschaltung: Bei Metric Ã¢â‚¬Å¾bpÃ¢â‚¬Å“ sind BMI/WHtR ausgeblendet; bei Ã¢â‚¬Å¾weightÃ¢â‚¬Å“ sind Sys/Dia/MAP ausgeblendet. `layoutKpis()` positioniert die Leiste korrekt.
- Doctor-Badges zÃƒÂ¤hlen korrekt: Trainingstage = Anzahl Tage mit `training`; Bad-Flag-Tage, wenn eines von `water_lt2|salt_gt5|protein_ge90|sick|meds` gesetzt ist.
- Day-Summary deaktiviert Vitalfelder (Sys/Dia/Puls), falls Gewicht/Bauch/Notes/Flags gesetzt sind; Re-Enable bei leeren Feldern.
- Kommentarpflicht: Bei ÃƒÂ¼berschrittenen BP-Grenzen markiert `#notesDay` per Outline, bis Text vorhanden ist; reagiert live auf Eingaben in Sys/Dia Feldern und Notes.

**Regression**
- Realtime/Auth bleibt stabil: Nach gÃƒÂ¼ltiger Konfiguration + Login laufen `afterLoginBoot` Ã¢â€ â€™ `ensureAppLock` Ã¢â€ â€™ `setupRealtime`; UI-Refresh erfolgt bei Events.
- Export JSON funktioniert (Doctor-Toolbar). CSV/JSON-Exports auÃƒÅ¸erhalb Doctor bleiben wie zuvor funktionsfÃƒÂ¤hig, sofern vorhanden.
- Bestehende Toggles/Flows (Training, Krank, <2L, Salz >5g, Medikamente) bleiben funktionsfÃƒÂ¤hig; neue Protein-Flag ergÃƒÂ¤nzt nur Darstellung/Export.

---

## v1.1.0 - Kommentarpflicht (BP) & Save-Flow

**Smoke**
- ÃƒÅ“berschreitet ein BP-Wert die Schwelle (Sys>130 oder Dia>90; morgens oder abends), verhindert Ã¢â‚¬Å¾SpeichernÃ¢â‚¬Å“ den Save, zeigt einen Alert und markiert `#notesDay` mit roter Outline; Fokus springt ins Kommentarfeld.
- Nach Eingabe eines Kommentars lÃƒÂ¤sst sich speichern; ohne GrenzwertÃƒÂ¼berschreitung ist Speichern unverÃƒÂ¤ndert mÃƒÂ¶glich.

**Sanity**
- SchwellenprÃƒÂ¼fung berÃƒÂ¼cksichtigt vier Felder: `#sysM/#diaM/#sysA/#diaA`. Leeren/Anpassen der Werte aktualisiert die Pflicht korrekt; Outline-Reset funktioniert.
- Save-Flow: Blocked vor `saveBlock("M")/saveBlock("A")/saveDaySummary()`, d. h. es werden keine Teil-EintrÃƒÂ¤ge gespeichert, solange Kommentar fehlt.
- Arzt-Ansicht Styles enthalten `.doctor-view .num.alert` fÃƒÂ¼r spÃƒÂ¤tere Hervorhebungen; bestehende Zahlenformatierung (tabular-nums, min-width) bleibt erhalten.

**Regression**
- Capture- und Arzt-Ansicht bleiben ansonsten unverÃƒÂ¤ndert (App-Lock, KPIs, Badges, Waist/Protein-Flag, JSON-Export).
- Realtime/Auto-Sync, Export-Funktionen und Toggles verhalten sich wie in v1.0.0.

---

## v1.2.0 - KPI-Farben, Flags-only Chart, A11y

**Smoke**
- KPI-Leiste zeigt farbige Punkte: BPÃ¢â‚¬â€˜Durchschnittswerte in Blau; beim GewichtsÃ¢â‚¬â€˜Diagramm werden BMI/WHtR farblich (WHOÃ¢â‚¬â€˜Schema) markiert; genau ein Separator zwischen Items.
- Chart rendert auch bei Ã¢â‚¬Å¾nur FlagsÃ¢â‚¬Å“ (keine Messungen), inkl. Achsen und Legende; AlertÃ¢â‚¬â€˜Marker erscheinen bei BPÃ¢â‚¬â€˜Serien.
- LiveÃ¢â‚¬â€˜Region `#err` zeigt Fehler/Infos sichtbar und verschwindet automatisch; Screenreader kÃƒÂ¼ndigen Ãƒâ€žnderungen (ariaÃ¢â‚¬â€˜live) an.

**Sanity**
- WHOÃ¢â‚¬â€˜Farblogik: BMI <18.5 blau, 18.5Ã¢â‚¬â€œ<25 grÃƒÂ¼n, 25Ã¢â‚¬â€œ<30 amber, Ã¢â€°Â¥30 rot; WHtR <0.5 grÃƒÂ¼n, Ã¢â€°Â¤0.6 amber, >0.6 rot. FarbÃ¢â‚¬â€˜Dots stehen vor den KPIÃ¢â‚¬â€˜Spans; keine doppelten Separatoren.
- ChartÃ¢â‚¬â€˜Layout: SVG fÃƒÂ¼llt HÃƒÂ¶he (preserveAspectRatio="none", height:100%), Legende zeigt farbige Dots + Labels; KPIÃ¢â‚¬â€˜Leiste ist `inline-flex` ausgerichtet.
- Datenquelle: `fetchDailyOverview()` lÃƒÂ¤dt aus Views; Flags enthalten detailierte MedsÃ¢â‚¬â€˜Booleans (Valsartan/Forxiga/NSAR) fÃƒÂ¼r Tooltips.
- SaveÃ¢â‚¬â€˜Flow: Meldung Ã¢â‚¬Å¾Keine Daten eingegeben Ã¢â‚¬â€œ nichts zu speichernÃ¢â‚¬Å“ erscheint korrekt, wenn weder M/A noch Tageszusammenfassung Daten enthÃƒÂ¤lt; M/AÃ¢â‚¬â€˜Saves enthalten kein Gewicht mehr.

**Regression**
- Bestehende Flows aus v1.1.0 (Kommentarpflicht), v1.0.0 (AppÃ¢â‚¬â€˜Lock/KPIs/Badges/Weist/Protein), sowie Realtime/Exports bleiben funktionsfÃƒÂ¤hig.

---

## v1.3.0 - Lifestyle Intake & Fullscreen Chart

**Smoke**
- Lifestyle-Tab sichtbar. Ã¢â‚¬Å¾+ MengeÃ¢â‚¬Å“ fÃƒÂ¼r Wasser/Salz/Protein erhÃƒÂ¶ht die Totals; Fortschrittsbalken (Wasser/Salz/Protein) aktualisieren Breite, Label und Farbe.
- UngÃƒÂ¼ltige Eingaben (leer/0/negativ) zeigen `uiError` in `#err`; gÃƒÂ¼ltige Updates zeigen `uiInfo` (Ã¢â‚¬Å¾Ã¢â‚¬Â¦ aktualisiertÃ¢â‚¬Å“).
- Nach Login/Refresh lÃƒÂ¤dt `renderLifestyle()` die TagesÃ¢â‚¬â€˜Totals vom Server und aktualisiert die Balken; Hinweistext zeigt Ziele korrekt.
- Ã¢â‚¬Å¾Werte anzeigenÃ¢â‚¬Å“ ÃƒÂ¶ffnet das Chart im Vollbild; Header bleibt sichtbar, SchlieÃƒÅ¸en funktioniert.

**Sanity**
- Ziele/Schwellen: WasserÃ¢â‚¬â€˜ZustÃƒÂ¤nde (<50% rot, 50Ã¢â‚¬â€œ89% gelb, Ã¢â€°Â¥90% grÃƒÂ¼n); Salz (0Ã¢â‚¬â€œ4.9 g grÃƒÂ¼n, 5Ã¢â‚¬â€œ6 g gelb, >6 g rot); Protein (<78 neutral, 78Ã¢â‚¬â€œ90 grÃƒÂ¼n, >90 rot). Labels zeigen StatusÃ¢â‚¬â€˜Text.
- Kappung: Wasser bis 6000 ml, Salz bis 30 g, Protein bis 300 g; Prozentbreiten Ã¢â€°Â¤100%.
- Persistenz: `saveIntakeTotals()` POST auf `health_events` mit `type:"intake"`, Fallback PATCH bei Konflikt; `cleanupOldIntake()` lÃƒÂ¶scht IntakeÃ¢â‚¬â€˜EintrÃƒÂ¤ge ÃƒÂ¤lter als heute.
- ArztÃ¢â‚¬â€˜Ansicht Ã¢â‚¬Å¾KommentarÃ¢â‚¬Å“: Kopf Ã¢â‚¬Å¾KommentarÃ¢â‚¬Å“ sichtbar, Text clamp (3 Zeilen Desktop, 4 mobil); Flags/Spalten verhalten sich responsiv.

**Regression**
- Capture/Doctor weiter stabil (App-Lock, KPIs, Badges, Kommentarpflicht). Realtime/AutoÃ¢â‚¬â€˜Sync fÃƒÂ¼r DailyÃ¢â‚¬â€˜Events unverÃƒÂ¤ndert.
- JSONÃ¢â‚¬â€˜Export, RangeÃ¢â‚¬â€˜Filter und Charts (BP/Weight) verhalten sich wie in v1.2.0; KPIÃ¢â‚¬â€˜Leiste bleibt funktionsfÃƒÂ¤hig.

---

## v1.4.0 - Chart Flags & KPI Robustness

**Smoke**
- Chart (Daily) zeigt FlagÃ¢â‚¬â€˜Overlay auch an Tagen ohne Messwerte (nur Flags); keine leere Darstellung mehr im Zeitraum mit reinen FlagÃ¢â‚¬â€˜Tagen.
- KPIÃ¢â‚¬â€˜Leiste enthÃƒÂ¤lt die nÃƒÂ¶tigen Spans (Sys/Dia/MAP bzw. BMI/WHtR) auch nach Refresh; Farben/Dots bleiben sichtbar wie in v1.2.0.
- Tooltips/Infos zu Flags enthalten DetailÃ¢â‚¬â€˜Meds (Valsartan/Forxiga/NSAR), Training, Krank, <2L, Salz, Protein Ã¢â‚¬â€œ pro Tag konsistent.

**Sanity**
- Flattening/Ordering: Daten fÃƒÂ¼r Morgen/Abend sowie Body (Gewicht/Bauch) erscheinen chronologisch (12:00 Body, 19:00 Abend); reine FlagÃ¢â‚¬â€˜Tage werden ergÃƒÂ¤nzt und sortiert.
- KPIÃ¢â‚¬â€˜Fallback: Falls KPIÃ¢â‚¬â€˜Spans fehlen, erzeugt der Code sie (dataÃ¢â‚¬â€˜k= sys/dia/map/bmi/whtr) mit Labels; keine doppelten Separatoren oder LayoutÃ¢â‚¬â€˜SprÃƒÂ¼nge.
- FlagÃ¢â‚¬â€˜Aggregation fÃƒÂ¼r Overlay: Tage zÃƒÂ¤hlen Ã¢â‚¬Å¾badÃ¢â‚¬Å“ korrekt (water/salt/protein/sick/meds); `flagsByDate` fasst die DetailÃ¢â‚¬â€˜Booleans pro Datum korrekt zusammen.

**Regression**
- LifestyleÃ¢â‚¬â€˜Tab, ArztÃ¢â‚¬â€˜Ansicht und Kommentarpflicht verhalten sich wie in v1.3.0/v1.1.0; KPIÃ¢â‚¬â€˜Farbregeln (WHO) und Legende bleiben unverÃƒÂ¤ndert.
- Realtime/AutoÃ¢â‚¬â€˜Sync, JSONÃ¢â‚¬â€˜Export und RangeÃ¢â‚¬â€˜Filter funktionieren weiterhin.

---

## v1.4.1 - Chart Range & Flags Helper

**Smoke**
- DailyÃ¢â‚¬â€˜Chart umfasst per XÃ¢â‚¬â€˜Achse auch reine FlagÃ¢â‚¬â€˜Tage (Union mit FlagÃ¢â‚¬â€˜Timestamps); keine abgeschnittenen FlagÃ¢â‚¬â€˜Marker am Rand.
- Bei fehlenden Messwerten greift der XÃ¢â‚¬â€˜Fallback (letzte 7 Tage); Achsen/Legende bleiben sichtbar.

**Sanity**
- `hasFlagsForDate(dayIso)` liefert true, wenn irgendein Flag (training/sick/low_intake/salt_high/protein_high90/valsartan_missed/forxiga_missed/nsar_taken/meds) fÃƒÂ¼r das Datum gesetzt ist.
- XÃ¢â‚¬â€˜Padding von ca. 2% wird angewendet (links/rechts), Skalen berechnen sich robust auch mit FlagsÃ¢â‚¬â€˜only.
- `flagsByDate` bleibt konsistent zur OverlayÃ¢â‚¬â€˜Darstellung (DetailÃ¢â‚¬â€˜Meds/Water/Salt/Protein/Sick/Training aggregiert).

**Regression**
- KPIÃ¢â‚¬â€˜Leiste/WHOÃ¢â‚¬â€˜Farben, FlagÃ¢â‚¬â€˜OverlayÃ¢â‚¬â€˜Aggregation und Sortierung (Morgen/Abend/Body/Flags) verhalten sich wie in v1.4.0.
- LifestyleÃ¢â‚¬â€˜Tab, Kommentarpflicht, Realtime/Exports unverÃƒÂ¤ndert.

---

## v1.4.2 - Chart A11y & Labels

**Smoke**
- ChartÃ¢â‚¬â€˜Deko ist stummgeschaltet (`aria-hidden` auf dekorativen Separators/Elementen); KPIÃ¢â‚¬â€˜Separatoren stÃƒÂ¶ren Screenreader nicht.
- Interaktive TrefferflÃƒÂ¤chen (z.Ã¢â‚¬Â¯B. NotizÃ¢â‚¬â€˜Trigger/FlagÃ¢â‚¬â€˜Hits) besitzen `role="button"`, `tabindex="0"` und sprechende `aria-label` (inkl. Ã¢â‚¬Å¾Flags: Ã¢â‚¬Â¦Ã¢â‚¬Å“ bzw. NotizÃ¢â‚¬â€˜Kurztext + Titel).

**Sanity**
- LiveÃ¢â‚¬â€˜Regionen: `#err` und KPIÃ¢â‚¬â€˜Leiste setzen `aria-live="polite"`; Updates werden angekÃƒÂ¼ndigt, ohne Fokus zu stehlen.
- Toggles aktualisieren `aria-pressed` korrekt (true/false) bei Klick/Statuswechsel.
- Auswahlfeld fÃƒÂ¼r Metrik trÃƒÂ¤gt ein verstÃƒÂ¤ndliches `aria-label` (z.Ã¢â‚¬Â¯B. Ã¢â‚¬Å¾MessgrÃƒÂ¶ÃƒÅ¸e auswÃƒÂ¤hlenÃ¢â‚¬Å“).

**Regression**
- XÃ¢â‚¬â€˜AchsenÃ¢â‚¬â€˜Union/Ã¢â‚¬â€˜Padding mit FlagÃ¢â‚¬â€˜Tagen bleibt wie in v1.4.1; FlagsÃ¢â‚¬â€˜Overlay/`flagsByDate`/`hasFlagsForDate` funktionieren unverÃƒÂ¤ndert.
- LifestyleÃ¢â‚¬â€˜Tab, WHOÃ¢â‚¬â€˜KPIÃ¢â‚¬â€˜Farben, Kommentarpflicht, Realtime/Exports weiterhin stabil.

---

## v1.4.3 - Chart Grid & Weekly Ticks

**Smoke**
- DailyÃ¢â‚¬â€˜Chart zeigt horizontale Rasterlinien mit YÃ¢â‚¬â€˜Labels (grobe 10 Ticks); Werte sind gut lesbar auf dunklem Hintergrund.
- Vertikale WochenÃ¢â‚¬â€˜Linien (gestrichelt) inkl. Datumslables am unteren Rand sind sichtbar und mittig zu den Linien ausgerichtet.

**Sanity**
- YÃ¢â‚¬â€˜Ticks: Es werden ~10 gleichmÃƒÂ¤ÃƒÅ¸ig verteilte Linien/Labels gezeichnet; Labels sind gerundet (ohne Dezimalstellen) und schneiden nicht ins Chart.
- XÃ¢â‚¬â€˜WochenÃ¢â‚¬â€˜Raster: Start wird anhand `xmin` ausgerichtet; Linien liegen innerhalb [xmin, xmax], Labels verwenden Format `DD.MM.` und sind mittig positioniert.
- Skalen/Padding: 2% XÃ¢â‚¬â€˜Padding und 8% YÃ¢â‚¬â€˜Padding (mind. 1 Einheit) sind aktiv; MappingÃ¢â‚¬â€˜Funktionen `x(t)`/`y(v)` berÃƒÂ¼cksichtigen `innerW/innerH` korrekt.

**Regression**
- FlagsÃ¢â‚¬â€˜Union/Overlay, `flagsByDate`/`hasFlagsForDate` und A11yÃ¢â‚¬â€˜Attribute bleiben unverÃƒÂ¤ndert (siehe v1.4.1/1.4.2).
- KPIÃ¢â‚¬â€˜Leiste (Dots/Separatoren) und LifestyleÃ¢â‚¬â€˜Tab verhalten sich weiterhin stabil.

---

## v1.4.4 - Encoding & Emoji Entities

**Smoke**
- ToggleÃ¢â‚¬â€˜Buttons zeigen EmojiÃ¢â‚¬â€˜Symbole korrekt (Training/krank/Medikamente/Wasser/Salz/Zucker) per HTMLÃ¢â‚¬â€˜Entities; keine  ?/TofuÃ¢â‚¬â€˜Glyphen.
- `metricSel` besitzt ein verstÃƒÂ¤ndliches ASCIIÃ¢â‚¬â€˜`aria-label` (z.Ã¢â‚¬Â¯B. Ã¢â‚¬Å¾Messgroesse auswaehlenÃ¢â‚¬Å“); Auswahl per Tastatur/Screenreader funktioniert.
- KPIÃ¢â‚¬â€˜Separatoren werden als dekorative Zeichen (z.Ã¢â‚¬Â¯B. Ã¢â‚¬Å¾*Ã¢â‚¬Å“) dargestellt und sind `aria-hidden`, stÃƒÂ¶ren Screenreader nicht.

**Sanity**
- Alle UIÃ¢â‚¬â€˜Labels sind ASCIIÃ¢â‚¬â€˜safe (keine kaputten Umlaute); Tooltips/Texte bleiben lesbar (Ã¢â‚¬Å¾KommentarÃ¢â‚¬Å“, Flags, Tabs).
- A11yÃ¢â‚¬â€˜Attribute bleiben konsistent: `aria-pressed` auf Toggles, `role="img"`/`aria-label` auf ChartÃ¢â‚¬â€˜SVG, LiveÃ¢â‚¬â€˜Regionen (`#err`, KPIÃ¢â‚¬â€˜Leiste) mit `aria-live="polite"`.
- Titel/Buttons im Lock/LoginÃ¢â‚¬â€˜Overlays behalten ihre Rollen/Labels (role="dialog", `aria-labelledby`).

**Regression**
- ChartÃ¢â‚¬â€˜Raster/WeeklyÃ¢â‚¬â€˜Ticks (v1.4.3), FlagsÃ¢â‚¬â€˜Overlay/Union und WHOÃ¢â‚¬â€˜KPIÃ¢â‚¬â€˜Farben bleiben unverÃƒÂ¤ndert.
- LifestyleÃ¢â‚¬â€˜Tab, Kommentarpflicht, Realtime/Export weiterhin stabil.

---

## v1.4.5 - BP-Kommentare, Flags-Kommentar, Save-Validierung

**Smoke**
- Morgens/Abends besitzen je ein Kommentar-Feld (`#bpCommentM`/`#bpCommentA`); Speichern funktioniert auch bei KommentarÃ¢â‚¬â€˜only (ohne Werte) fÃƒÂ¼r den jeweiligen Block.
- Tagesbereich hat Ã¢â‚¬Å¾Kommentar zu FlagsÃ¢â‚¬Å“ (`#flagsComment`); nach Speichern wird der FlagsÃ¢â‚¬â€˜Kommentar als Note persistiert und das Feld geleert (Diag: Ã¢â‚¬Å¾FlagsÃ¢â‚¬â€˜Kommentar gespeichertÃ¢â‚¬Å“).
- Validierung: Bei nur einem BPÃ¢â‚¬â€˜Wert (Sys oder Dia) erscheint eine Fehlermeldung; bei eingegebenem Puls ohne beide BPÃ¢â‚¬â€˜Werte ebenfalls.

**Sanity**
- `blockHasData(which)` berÃƒÂ¼cksichtigt `sys/dia/pulse` sowie den BlockÃ¢â‚¬â€˜Kommentar; `hasM`/`hasA` werden korrekt ermittelt.
- `saveBlock` setzt DefaultÃ¢â‚¬â€˜Zeiten (M=07:00, A=22:00); bei gemischten Eingaben werden BPÃ¢â‚¬â€˜PaarÃ¢â‚¬â€˜Regeln eingehalten (kein Puls ohne Sys+Dia, kein einzelner BPÃ¢â‚¬â€˜Wert).
- `saveDaySummary` berÃƒÂ¼cksichtigt `flagsComment`; nach erfolgreichem Speichern wird `#flagsComment` geleert.
- ChartÃ¢â‚¬â€˜Fullscreen: HeaderhÃƒÂ¶he 44px, Inhalt `calc(100dvh - 44px - 2px)` mit SafeÃ¢â‚¬â€˜AreaÃ¢â‚¬â€˜Padding; kein Inhalt hinter Notch abgeschnitten.

**Regression**
- Emojis/Entities (v1.4.4) werden korrekt dargestellt; A11yÃ¢â‚¬â€˜Attribute (ariaÃ¢â‚¬â€˜pressed, ariaÃ¢â‚¬â€˜labels, LiveÃ¢â‚¬â€˜Regionen) bleiben konsistent.
- WeeklyÃ¢â‚¬â€˜Ticks/YÃ¢â‚¬â€˜Raster (v1.4.3) und FlagsÃ¢â‚¬â€˜Overlay/Union (v1.4.1/1.4.2) funktionieren unverÃƒÂ¤ndert; LifestyleÃ¢â‚¬â€˜Tab stabil.

---

## v1.4.6 - Flags-Accordion & UX

**Smoke**
- Flags-Bereich ist als aufklappbares Accordion (`<details class="accordion">`) umgesetzt, initial geÃƒÂ¶ffnet; Summary (Ã¢â‚¬Å¾Ã°Å¸Å¡Â© FlagsÃ¢â‚¬Å“) ist sichtbar, Chevron rotiert beim Ãƒâ€“ffnen.
- Alle Flag-Toggles funktionieren innerhalb des Accordions wie zuvor; Ã¢â‚¬Å¾Kommentar zu FlagsÃ¢â‚¬Å“ speichert weiterhin und leert das Feld danach (Diag-Hinweis sichtbar).

**Sanity**
- Accessibility/Markup: Summary ohne Marker (`::-webkit-details-marker` entfernt); Chevron ist `aria-hidden`; Tastatur (Enter/Space) toggelt das Accordion.
- Layout: `card-nested` AbstÃƒÂ¤nde/Polsterung korrekt; auf Mobil geringere Padding-Werte greifen; kein Layout-Sprung beim Umschalten.
- Save-Flow: `flagsComment` wird weiterhin berÃƒÂ¼cksichtigt (Day-Summary), `hasAnyFlag`/Toggles unverÃƒÂ¤ndert; keine doppelten Saves.

**Regression**
- Fullscreen-Chart (Header 44px, Safe-Area-Padding), Emojis/Entities (v1.4.4) und A11y-Attribute bleiben konsistent.
- Weekly-Ticks/Y-Raster und Flags-Overlay/Union funktionieren wie in v1.4.3/v1.4.1Ã¢â‚¬â€œ1.4.2; Lifestyle-Tab stabil.

---

## v1.4.7 - Chart Controls Layout & SVG Height

**Smoke**
- ChartÃ¢â‚¬â€˜Controls layouten responsiv: Elemente teilen sich den Raum (`#chart .controls > * { flex:1 }`), HalfÃ¢â‚¬â€˜Breite funktioniert (`.half` Ã¢â€°Ë† 50%).
- ChartÃ¢â‚¬â€˜SVG fÃƒÂ¼llt die verfÃƒÂ¼gbare HÃƒÂ¶he vollstÃƒÂ¤ndig (`height:100%`, minÃ¢â‚¬â€˜height 160px) innerhalb des FullscreenÃ¢â‚¬â€˜Panels; keine abgeschnittenen Bereiche.

**Sanity**
- Wrap/Spacing: Controls umbrechen sauber (flexÃ¢â‚¬â€˜wrap), AbstÃƒÂ¤nde bleiben konsistent; keine ÃƒÅ“berlappung mit Legende/Buttons.
- FlagsÃ¢â‚¬â€˜Overlay bleibt klickbar (`#chartSvg .flags { pointer-events:auto }`), Interaktionen funktionieren wie zuvor (Tooltips/ARIAÃ¢â‚¬â€˜Labels unverÃƒÂ¤ndert).
- SafeÃ¢â‚¬â€˜AreaÃ¢â‚¬â€˜Padding im PanelÃ¢â‚¬â€˜Content bleibt aktiv; Scroll verlÃƒÂ¤uft innerhalb des Contents, Header bleibt fix.

**Regression**
- Accordion/Flags (v1.4.6), Emojis/Entities (v1.4.4) und A11yÃ¢â‚¬â€˜Attribute bleiben konsistent.
- WeeklyÃ¢â‚¬â€˜Ticks/YÃ¢â‚¬â€˜Raster (v1.4.3), FlagsÃ¢â‚¬â€˜Union (v1.4.1/1.4.2), SaveÃ¢â‚¬â€˜Flows und LifestyleÃ¢â‚¬â€˜Tab unverÃƒÂ¤ndert.

---

## v1.4.8 - Getrennte Saves (Body/Flags) & DatumÃ¢â‚¬â€˜Sync

**Smoke**
- Im FlagsÃ¢â‚¬â€˜Accordion existieren separate Buttons: Ã¢â‚¬Å¾Speichern (KÃƒÂ¶rper)Ã¢â‚¬Å“ und Ã¢â‚¬Å¾Speichern (Flags)Ã¢â‚¬Å“; jeweils nur der entsprechende Teil wird gespeichert.
- ErfolgsÃ¢â‚¬â€˜Feedback: Button zeigt HakenÃ¢â‚¬â€˜Text (z.Ã¢â‚¬Â¯B. Ã¢â‚¬Å¾Ã¢Å“â€¦ KÃƒÂ¶rper gespeichertÃ¢â‚¬Å“/Ã¢â‚¬Å¾Ã¢Å“â€¦ Flags gespeichertÃ¢â‚¬Å“); Buttons werden wÃƒÂ¤hrend des Speicherns per BusyÃ¢â‚¬â€˜State deaktiviert.
- FehlerfÃƒÂ¤lle: Ohne Eingaben zeigen die Buttons `uiError` (Ã¢â‚¬Å¾Keine Koerperdaten eingegeben.Ã¢â‚¬Å“ bzw. Ã¢â‚¬Å¾Keine FlagÃ¢â‚¬â€˜Daten eingegeben.Ã¢â‚¬Å“).

**Sanity**
- FlagsÃ¢â‚¬â€˜Save: nutzt `saveDaySummary({ includeBody:false, includeFlags:true, includeFlagsComment:true })`, leert `#flagsComment` via Reset und hÃƒÂ¤lt andere Eingaben unverÃƒÂ¤ndert.
- BodyÃ¢â‚¬â€˜Save: nutzt `saveDaySummary({ includeBody:true, includeFlags:false, includeFlagsComment:false })`, setzt nur Gewicht/Bauchumfang; Flags/Kommentare bleiben unberÃƒÂ¼hrt.
- Nach Erfolg werden ArztÃ¢â‚¬â€˜Ansicht/Chart aktualisiert (`renderDoctor()` + ggf. `chartPanel.draw()`), anschlieÃƒÅ¸end wird das jeweilige Panel via `resetFlagsPanel()`/`resetBodyPanel()` zurÃƒÂ¼ckgesetzt.
- DatumÃ¢â‚¬â€˜Wechsel in Capture (`#date` change) lÃƒÂ¤dt Toggles des gewÃƒÂ¤hlten Tages (`syncCaptureToggles()`), setzt Panels zurÃƒÂ¼ck (`resetCapturePanels()`), aktualisiert Warnhinweise (`updateBpCommentWarnings`).

**Regression**
- Bisherige Toggles/Bindings (inkl. `#proteinHighToggle`) funktionieren; ApplyÃ¢â‚¬â€˜Range (`#applyRange`) rendert ArztÃ¢â‚¬â€˜Ansicht/Chart wie gewohnt.
- Layout/Accessibility bleiben konsistent (Accordion/Controls/FullscreenÃ¢â‚¬â€˜Chart, WHOÃ¢â‚¬â€˜KPIÃ¢â‚¬â€˜Farben, FlagsÃ¢â‚¬â€˜Overlay, LiveÃ¢â‚¬â€˜Regionen); LifestyleÃ¢â‚¬â€˜Tab unverÃƒÂ¤ndert.

---

## v1.4.9 - BP Panel Save, UnlockÃ¢â‚¬â€˜Flow, UIÃ¢â‚¬â€˜Refresh

**Smoke**
- BPÃ¢â‚¬â€˜Panel besitzt eigene SaveÃ¢â‚¬â€˜Aktionen je Block (Morgens/Abends); Speichern zeigt Feedback (Ã¢â‚¬Å¾Ã¢Å“â€¦ Blutdruck gespeichertÃ¢â‚¬Å“), Button wÃƒÂ¤hrenddessen im BusyÃ¢â‚¬â€˜State.
- Chart/Export hinter DoctorÃ¢â‚¬â€˜Unlock: Klick auf Ã¢â‚¬Å¾Werte anzeigenÃ¢â‚¬Å“/Ã¢â‚¬Å¾Export JSONÃ¢â‚¬Å“ fordert ggf. Entsperren; nach erfolgreichem Unlock lÃƒÂ¤uft die Aktion fort.
- ESC entsperrt bei aktivem AppÃ¢â‚¬â€˜Lock ohne PendingÃ¢â‚¬â€˜Aktion; Sichtbarkeitswechsel (zurÃƒÂ¼ck in die App) rÃƒÂ¤umt Locks auf, sofern nicht in der ArztÃ¢â‚¬â€˜Ansicht.

**Sanity**
- SaveÃ¢â‚¬â€˜Flows verwenden `requestUiRefresh({ reason })` (z.Ã¢â‚¬Â¯B. panel:body/panel:flags/doctor:range/boot:initial) statt direktem Render; UI aktualisiert sich (Arzt + Chart, wenn offen).
- BPÃ¢â‚¬â€˜Kommentarpflichten/Warnhinweise aktualisieren sich nach BPÃ¢â‚¬â€˜Save (`updateBpCommentWarnings()`), Panel wird zurÃƒÂ¼ckgesetzt (`resetBpPanel(which)`).
- DateÃ¢â‚¬â€˜Change in Capture lÃƒÂ¤dt Toggles (`syncCaptureToggles()`), setzt Panels zurÃƒÂ¼ck (`resetCapturePanels()`), aktualisiert BPÃ¢â‚¬â€˜Warnungen.

**Regression**
- Getrennte Saves fÃƒÂ¼r KÃƒÂ¶rper/Flags (v1.4.8) bleiben funktionsfÃƒÂ¤hig; FlagsÃ¢â‚¬â€˜Kommentar wird weiterhin geleert nach Save.
- Layout/A11y stabil (Accordion/Controls/FullscreenÃ¢â‚¬â€˜Chart, WHOÃ¢â‚¬â€˜KPIÃ¢â‚¬â€˜Farben, FlagsÃ¢â‚¬â€˜Overlay); LifestyleÃ¢â‚¬â€˜Tab unverÃƒÂ¤ndert.

---


## v1.5.0  ?" Panel Saves & Refresh

Siehe ursprÃ‡Â¬gliche Checks (panelweises Speichern, `requestUiRefresh` orchestration, Legacy Cleanup).

---

## v1.5.1  ?" Visibility Resume

Siehe ursprÃ‡Â¬ngliche Checks (Overlay schlie Yt, Passkey/PIN nach Resume, Capture erreichbar).

---

## v1.5.2  ?" Resume Tabs

Siehe ursprÃ‡Â¬ngliche Checks (Tabs nach App-/Tab-Wechsel, Unlock-Intent).

---

## v1.5.3  ?" Fast Login

Siehe v1.5.4 Erg  nzung: Fokus auf Timeout-Fixes und Session-Fallback (Smoke/Sanity/Regression analog).

---

## v1.5.4  ?" Cleanup

**Smoke**
- Schnelltest: Tabs nach Resume bleiben klickbar; kein `session-timeout` im Log.

**Sanity**
- Flags-Panel Reset ohne Legacy-Aufruf; Busy/Timeout Cleanups greifen.

**Regression**
- `isLoggedInFast` weiterhin fallback-f  hig; Unlock/Intent-Flows stabil.

---

## v1.5.5  ?" Intake Accordion

**Smoke**
- Capture-Accordion  ?zFlÃ‡Â¬ssigkeit & Intake ?o   ffnet/schlie Yt; Buttons speichern in Supabase + IndexedDB.

**Sanity**
- Zeitstempel = `<day>T12:00:00Z`; REST PATCH/POST funktioniert.

**Regression**
- Reconnect nur bei vorhandenem `reconcileFromRemote`   ' keine Fehler.

---

## v1.5.6  ?" Intake UI Refresh

**Smoke**
- Fortschrittsbalken zeigen Gradient + Glow; Pill-Farben stimmen mit Zielbereich.

**Sanity**
- `refreshCaptureIntake` und `handleCaptureIntake` verfÃ‡Â¬gbar (window Scope).

**Regression**
- Add-Buttons, Save-Flows, Tabs unver  ndert.

---

## v1.5.7  ?" Intake im Capture

**Smoke**
- Intake/Add-Buttons (Wasser/Salz/Protein) aktualisieren Pill + Balken.
- Lifestyle-Tab entfernt  ?" alle Werte im Capture sichtbar.

**Sanity**
- Datumswechsel aktualisiert __lsTotals und Bars; Realtime-Sync intakt.

**Regression**
- Flags/Body/BP Panels unbeeinflusst; Keine Duplicate-Events.

---

## v1.6.0  ?" Arzttermine

**Smoke**
- Pro Rolle Termin speichern, Seite neu laden   '  ?zN  chster Termin ?o zeigt Wert,  ?zLetzter Termin ?o nach Done.
- Zweite Session: Realtime aktualisiert UI ohne Reload.

**Sanity**
- Done-Button nur sichtbar, wenn geplanter Termin existiert; Tastaturfokus bleibt sinnvoll.
- Datum/Uhrzeit Validierung (leer/Format/409) zeigt passende Fehlermeldungen.

**Regression**
- `requestUiRefresh` orchestriert Arzt/Lifestyle/Chart ohne Doppel-Render.
- Login/Logout/App-Lock funktionieren unver  ndert mit neuem Panel.

---

## v1.6.4  ?" Header Intake & Termin-Badge

**Smoke**
- Nach Login: Header zeigt Wasser/Salz/Protein + Badge  ?zKein Termin geplant ?o.
- Termin speichern (z. ? B. Nephrologe)   ' Badge aktualisiert sich, Done setzt Badge zurÃ‡Â¬ck.

**Sanity**
- Mobile ( %  414 ? px): Pills umbrechen, Badge bleibt sichtbar.
- Zeitzone Europe/Vienna: Anzeige + Vergleiche korrekt (12h/24h Test).

**Regression**
- Capture-Speichern, Tab-Wechsel und Realtime unver  ndert.
- Intake-Pills im Accordion behalten Style/Interaktion.

---

## v1.6.5  ?" Blutdruck Kontext Auto-Switch

**Smoke**
- Auto-Switch triggert um 12:05 (plus Grace); erkennbar an Dropdown + aktivem Panel.
- Mit manueller Auswahl (User-Override) bleibt gesetzter Kontext bis Tageswechsel.

**Sanity**
- Sichtwechsel (Visibility API) refresht Datum + Kontext ohne Flackern.
- Diagnose-Log meldet  ?zbp:auto (source) -> A/M ?o.

**Regression**
- BP-Save, Kommentare, Warnung bei Grenzwert bleiben unver  ndert.
- Midnight Refresh setzt Kontext zurÃ‡Â¬ck auf Morgens.

---

## v1.6.6  ?" Body-Views Backend

**Smoke**
- View `v_events_body` liefert `kg/cm/fat_pct/muscle_pct/fat_kg/muscle_kg` fÃ‡Â¬r Testdaten.

**Sanity**
- RLS: Query mit fremder `user_id`   ' 0 Zeilen.
- Index-Plan: `health_events` (user_id, type, ts) genutzt.

**Regression**
- Bestehende Auswertungen (Gewicht ohne Prozente) kommen unver  ndert zurÃ‡Â¬ck.

---

## v1.6.8  ?" K  rper-Chart Balken

**Smoke**
- Mit Kompositionsdaten: Muskel-/Fettbalken (kg) rendern nebeneinander; Bars verschwinden ohne Daten.
- Legende erg  nzt  ?zMuskelmasse/Fettmasse ?o nur bei aktiven Werten.

**Sanity**
- Flags-Overlay bleibt im BP-Chart verfÃ‡Â¬gbar; keine Klickblocker im K  rper-Chart.
- Feature-Flag `SHOW_BODY_COMP_BARS` = false   ' Bars verschwinden vollst  ndig.

**Regression**
- Arzt-Ansicht (t  gliche Karten) zeigt weiterhin Gewicht/Flags korrekt.
- Chart-Tooltip, KPI-Anzeige, Zoom/Resize funktionieren unver  ndert.

---

## v1.6.9  ?" A11y & Micro Polish

**Smoke**
- Intake-Pills fokusieren   ' Screenreader-Ansage  ?zTagesaufnahme:  ?ÃÆ’?o.
- Termin-Badge ist per Tab erreichbar und hat korrektes aria-label.
- Tooltip bleibt lesbar, KPI-Dots sichtbar (Darkmode, 100 ? %/125 ? % Zoom).

**Sanity**
- `perfStats.snap('header_intake')` und `'header_appt'` zeigen p50/p90/p95 nach mehrfachem Refresh.
- Keine Layout-Verschiebungen in Capture-Header bei kleinen Viewports.

**Regression**
- Intake/Add-Buttons, Termin-Speichern/Done arbeiten wie in 1.6.8.
- drawChart() Performance-Log erscheint h  chstens alle ~25 Aufrufe (kein spam).

## v1.7.0  ?" Release Freeze

**Smoke**
- Capture-Header zeigt Intake-Pills + Termin-Badge nach Login < 50 ? ms; Werte passen zum gew  hlten Datum.
- Diagramm (K  rper) ohne %Werte   ' keine Bars; mit Werten   ' Muskel-/Fettbalken erscheinen hinter den Linien.
- BP-Auto-Switch: vor 12:05   ' Morgens, nach 12:05   ' Abends, User-Override bleibt bis Tageswechsel.

**Sanity**
- Screenreader liest Intake-Gruppe und Pill-Status korrekt (NVDA/VoiceOver Quickcheck).
- Termin-Badge reagiert auf Termin- "nderung (Speichern/Done) via Realtime.
- Tooltip Darkmode-Kontrast ausreichend (WCAG ~AAA) auf Desktop + Mobile.

**Regression**
- Flags-Overlay erscheint nur im Blutdruck-Chart (Daily & Arzt-Ansicht unver  ndert).
- Unlock-Flows (Passkey/PIN) funktionieren; Telemetrie-Log erzeugt keine Fehlermeldungen.

## v1.7.1  ?" Patch

**Smoke**
- Diagramm-Perf-Log: drawChart mehrfach triggern (z. B. Chart oeffnen/resize, ~50x). Erwartung: Logzeile `[perf] drawChart ...` erscheint nur bei jedem 25. Aufruf.
- Capture-Shortcuts: In BP-/Koerper-/Flags-Panels Enter speichert den jeweiligen Block, ESC setzt die Felder des Panels zurueck (Warnlogik fuer BP-Kommentare bleibt aktiv).
- Flags-UI: Button  ?zProtein >= 90 g ?o sichtbar, toggelbar, Statuswechsel im UI klar erkennbar.

**Sanity**
- SQL-View: Schema anwenden und sicherstellen, dass `v_events_day_flags` genau einmal definiert ist (kein Duplikat). Bestehende Queries aus der Arzt-Ansicht funktionieren unveraendert.
- Keine verbleibenden Referenzen auf `sugarHighToggle` im Markup/JS (Suche im Projekt).

**Regression**
- Header-Telemetrie (`header_intake`, `header_appt`) unveraendert: p50/p90/p95 werden wie zuvor periodisch geloggt, keine zusaetzliche Spam-Frequenz.
- Diagramm (BP/Koerper) rendert unveraendert; KPI-/Tooltip-Verhalten und Flags-Overlay bleiben korrekt.

## v1.7.2 - Patch

**Smoke**
- Help/Log/Chart panels: open (incl. FAB) -> focus stays inside the dialog, background carries `inert`/`aria-hidden`; ESC or the close button dismisses.
- Login/App-Lock: call `showLoginOverlay(true)` or `lockUi(true)` -> dialog autofocuses, ESC closes, background re-enabled.
- Live regions: trigger multiple intake/appointment updates -> announcements arrive debounced (no spam bursts).

**Sanity**
- Focus restore: after closing, focus returns to the triggering control (Help/Log/Chart/Login/App-Lock).
- Capture header tab order: Date input -> Pills -> Accordions (visible focus order confirmed).
- Background attributes: after closing dialogs, header/nav/main/fab elements have no `aria-hidden` or `inert` (verify via DevTools).

**Regression**
- Charts, capture flows and telemetry remain unchanged; Enter/Escape shortcuts from V1.7.1 still work.
- Touch-Log/Help/Chart toggles via header buttons or FAB behave as before.
- Login and unlock flows (Google, Passkey, PIN) unchanged; ESC only reacts when overlays are visible.

## v1.7.3 - Patch

**Smoke**
- Supabase-Setup speichern: REST-Endpoint & ANON-Key eingeben -> Validierung greift, Statusmeldung erscheint, Client initialisiert.
- Google-Login ohne Konfiguration: Button zeigt Setup-Hinweis statt Fehler; nach erfolgreicher Konfiguration startet OAuth.
- Termin-Badge: Termine knapp (<5 min) in der Vergangenheit wandern in die Gruppe 'Letzte Termine'; Badge zeigt naechsten Termin mit korrektem AT-Format.

**Sanity**
- Guard: Auf nicht-dev Hosts werden keine Dev-Defaults gesetzt; Login-Overlay fordert Konfiguration.
- Fehlerfeedback: REST-Fehler (401/403/409/422/5xx) liefern konsistente Meldungen inkl. Retry-Hinweis.
- Terminliste: refreshAppointments aggregiert Next/Last korrekt bei gemischten scheduled/done Eintraegen (Grace = 5 min).

**Regression**
- Live-Region Debounce (V1.7.2) unveraendert aktiv; Fokusfallen fuer Dialoge funktionieren weiterhin.
- Capture/Lifestyle-Updates (saveIntakeTotals) liefern passende Erfolg-/Fehlermeldungen; keine doppelten Toasts.
- Realtime/Sync (ensureSupabaseClient, setupRealtime) startet nach Konfiguration weiterhin stabil.

## v1.7.3.1   Auth Wrapper (Grundlage)

**Smoke**
- fetchWithAuth kapselt 401/403-Refresh (einmalig) + 5xx-Retry (begrenzt).
- Save-Flows (Intake/Notes/Flags/Appointments) benutzen fetchWithAuth.

**Sanity**
- Bei 401/403 erscheint Login-Overlay; bei 5xx kurzer Retry.
- Headers werden korrekt via getHeaders() erzeugt (apikey+JWT).

**Regression**
- Vorherige Saves/Reads liefern identische Resultate (nur Pfad ge ndert).

## v1.7.3.2   Save entkoppelt / UI-Refresh

**Smoke**
- Capture-Save blockiert UI nicht mehr: Busy f llt im finally; kein Await auf requestUiRefresh.
-  save network ok  wird direkt nach erfolgreichem Request geloggt.

**Sanity**
- UI-Refresh l uft parallel (Doctor/Lifestyle/Chart) und endet stets.

**Regression**
- Keine Doppel-Listener auf Capture-Buttons; Clone-Bindung bleibt idempotent.

## v1.7.3.3   requestUiRefresh Mutex/Timeouts

**Smoke**
- Mehrere Refresh-Anst  e werden koalesziert (nur ein Durchlauf aktiv).
- Pro Sub-Step (doctor/appointments/lifestyle/chart) Timeout (~8s) ? Log + Weiterlauf.

**Sanity**
- Start/Ende-Logs mit Dauer vorhanden; Promise resolved immer.

**Regression**
- Chart zeichnet nur, wenn offen; Appointments werden gezielt geladen.

## v1.7.3.4   Resume entkoppelt

**Smoke**
- Nach Fensterwechsel: Interaktion sofort m glich; Resume-Refresh per setTimeout(0) fire-and-forget.

**Sanity**
- Reihenfolge bleibt: maybeRefreshForTodayChange ? entkoppelter UI-Refresh.

**Regression**
- Debounce/Skip-Logs vorhanden; keine doppelten Realtime-Setups.

## v1.7.3.5   Diagnostik & Stabilisierung

**Smoke**
- Diagnose-Logs an Save-Pipeline-Stationen (getConf/getUserId/fetch start) sichtbar.
- Keine h ngenden Saves bei langsamer Appointment-API/Doctor-Refresh.

**Sanity**
- Fehlerlogs sind kompakt; UI-Busy wird immer aufgehoben.

**Regression**
- Bestehende A11y/Overlay-Flows unver ndert.

## v1.7.3.6   Auth-Timeouts & Header-Cache (Resume-Fix)

**Smoke**
- getUserId Soft-Timeout (~2s) mit UID-Fallback; getHeaders Soft-Timeout (~2s) mit Header-Cache-Fallback; fetchWithAuth Request-Timeout (~10s).
- Nach Resume: Save erzeugt sofort einen Request (ggf. mit  headers cache hit ).

**Sanity**
- Bei 401/403 genau ein Refresh+Retry; sonst Toast + Log; kein H ngen mehr.
- requestUiRefresh Start/Ende + per-Step Logs; immer resolve.

**Regression**
- Keine Doppel-Writes (Unique-Constraints greifen); Save-Flows bleiben idempotent.


## v1.7.3.7 Ã¢â‚¬â€œ Intake RPC + Tages-Reset (Hook)

**Smoke**
- Intake-Save (Wasser/Salz/Protein) erzeugt genau 1 Request an `/rest/v1/rpc/upsert_intake` mit Prefer `return=representation`.
- Logs enthalten: `[capture] fetch start intake:rpc` Ã¢â€ â€™ `[capture] save network ok`.
- Wenn RPC fehlt (404/405): einmaliger Fallback-Log `[capture] rpc missing, fallback to legacy` und Save funktioniert dennoch.

**Sanity**
- RLS: signed-in User kann nur eigene Intake-Zeilen erstellen/aktualisieren; fremdes JWT Ã¢â€ â€™ 0 Zeilen.
- Reset-Hook: Bei Tageswechsel/Resume wird einmalig `upsert_intake` mit 0Ã¢â‚¬â€˜Totals gesendet; Logs zeigen Start/Ende.
- Kein Reset, wenn im UI bewusst ein anderer Tag ausgewÃƒÂ¤hlt ist (Pin bleibt bestehen).

**Regression**
- UI bleibt responsiv (Save/Reset sind FireÃ¢â‚¬â€˜andÃ¢â‚¬â€˜Forget); `requestUiRefresh` bleibt entkoppelt.
- Keine Duplikate dank Unique-Index `(user_id, day, type='intake')`.

## v1.7.3.8 Ã¢â‚¬â€œ Day-basierte Reads

**Smoke**
- `loadIntakeToday()` liest Intake ausschlieÃƒÅ¸lich via `day=eq.<YYYY-MM-DD>` (keine `ts`-Range).

**Sanity**
- Arzt-/Views-Loader verwenden weiterhin `day gte/lte`-Filter (ZeitrÃƒÂ¤ume) und liefern korrekte Daten.

**Regression**
- Intake-Header (Pills/Balken) zeigt korrekte Werte nach Refresh/Resume.

## v1.7.3.9 Ã¢â‚¬â€œ Stabilisierung

**Smoke**
- Keine NutzerÃ¢â‚¬â€˜sichtbaren Ãƒâ€žnderungen; Logging & Fallbacks bleiben stabil.

**Sanity**
- Resume/Realtime/Refresh verhalten sich wie in 1.7.3.7/1.7.3.8.

**Regression**
- Keine Ãƒâ€žnderung an Auth-/Cache-Mechanik; Save bleibt 1 Request (RPC-first, einmaliger Legacy-Fallback).

## v1.7.4 Cleanup & Vereinheitlichung

**Smoke**
- Legacy-Fallback setzt `ts` auf lokales Mitternacht (Europe/Vienna) und patcht via `day=eq` statt Zeitfenster.
- `loadIntakeToday()` nutzt `day=eq` (final), Intake-Pills werden am neuen Tag automatisch auf 0 gesetzt (einmal/Tag).

**Sanity**
- Reset-Guards: InÃ¢â‚¬â€˜Memory + `localStorage` verhindern Doppel-Resets; Reset triggert asynchrones `refreshCaptureIntake()`.
- Logging: Reset `[capture] reset intake start/end`; Save `[capture] fetch start intake:rpc` Ã¢â€ â€™ `[capture] save network ok`.

**Regression**
- Keine AbhÃƒÂ¤ngigkeiten zu Doctor-/Appointment-Modulen; UI bleibt responsiv.
- RLS/Unique-Index verhindern Duplikate/Datenverlust; `user_id` wird im RPC serverseitig gesetzt.

## v1.7.5 - Arzt DESC & Koerper-Bar-Hover

**Smoke**
- Arzt-Ansicht zeigt neuesten Tag oben (DESC).
- Scrollposition bleibt nach Refresh/Range-Apply/Entsperren erhalten.
- Chart "Gewicht": Muskel-/Fett-Balken sind klick-/fokussierbar; Tooltip erscheint; Legend-/Series-Highlight reagiert auf Hover/Klick.
- BP-Flags-Overlay weiterhin klickbar mit Tooltip.

**Sanity**
- Hit-Zonen besitzen `role="button"`, `tabindex="0"` und sinnvolle `aria-label`s (Muskel/Fett + optional Gewicht/Datum).
- Hover-State dimmt andere Serien; Farben je Datentyp konsistent.
- Capture Koerper: Nach Save Felder leer; optionales Log `[body] cleared`; bei Datum-Wechsel weiterhin Prefill.

**Regression**
- fetchDailyOverview/joinViewsToDaily kompatibel; Chart rendert BP/Weight weiterhin korrekt; KPI-Boxen bleiben stabil.
- Loeschen eines Tages, Login/App-Lock/Unlock-Flows funktionieren unveraendert.
- Performance: Hover/Click-Animationen ohne spuerbare Lags.


## v1.7.5 - Annotations (Docs only)

**Smoke**
- index v1.7.5.html enthÃ¯Â¿Â½lt MODULE-/SUBMODULE-Kommentare; App startet, Capture/Doctor/Charts funktionieren unverÃ¯Â¿Â½ndert.
- FUTURE-Block (placeholders) am Dateiende ist rein dokumentarisch.

**Sanity**
- Keine DOM/JS/CSS-Ã¯Â¿Â½nderungen auÃ¯Â¿Â½er Kommentaren/Whitespace.
- W3C/ARIA bleiben unverÃ¯Â¿Â½ndert grÃ¯Â¿Â½n; keine neuen Logs/Side-Effects.

**Regression**
- Realtime/Auth/Save-Flows und UI-Refresh verhalten sich wie zuvor.
- Diagramme/Arzt-Ansicht zeigen identische Werte; keine Layout-Diffs.
---

## v1.7.5.1 - Security Hotfix (Konfiguration & SRI)

**Smoke**
- Login-Overlay zeigt Google-Login und "Erweiterte Einstellungen" (REST-Endpoint + ANON-Key); keine stillen Dev-Defaults mehr.
- Supabase UMD laedt mit SRI + crossorigin weiterhin korrekt; keine CSP-Warnungen.
- Capture/Doctor/Charts verhalten sich wie in v1.7.5.

**Sanity**
- `ensureSupabaseClient` startet nur mit gespeicherter Konfiguration und blockt service_role Keys (Overlay-Fehler + Log).
- `DEV_ALLOW_DEFAULTS` akzeptiert ausschliesslich localhost/127.0.0.1/*.local; Query-/LocalStorage-Schalter entfernt.
- UI-Texte frei von Kodierungsartefakten (keine "g?ltigen" Strings).

**Regression**
- Bestehende Konfigurationen funktionieren weiter; `getConf`/`putConf` unveraendert.
- Realtime/Auth/Sync laufen wie zuvor, sofern Konfiguration gesetzt ist.
- Hilfe-/Diagnose-/Login-Overlays behalten Fokusfalle und Inert-Handling.

---

## v1.7.5.2 - PBKDF2+Salt (PIN) & CSP Option C

**Smoke**
- PIN setzen/entsperren funktioniert; falsche PIN gibt "PIN falsch" aus.
- Content-Security-Policy Option C aktiv (`script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'`; connect-src erlaubt https/wss *.supabase.co); App startet ohne CSP-Verletzung.
- Config-Overlay behaelt manuell eingegebene REST-/ANON-Werte auch nach Fenster-/Tabwechsel.
- Capture/Doctor/Charts inkl. Realtime laufen unveraendert.

**Sanity**
- `setPinInteractive` speichert Salt (16 Byte), PBKDF2-Hash (120000 Iterationen) und Iterationszaehler; Legacy-SHA256 wird auf null gesetzt.
- `unlockWithPin` nutzt PBKDF2 und migriert Legacy-Hashes automatisch beim ersten erfolgreichen Unlock.
- Prefill-Schutz: `showLoginOverlay`/`prefillSupabaseConfigForm` ueberschreiben vorhandene Feldwerte nicht; SRI fuer Supabase-js bleibt gesetzt.

**Sanity (Fortsetzung)**
- SQL Patch 06_Security_v1.7.5.3 ausgefuehrt: search_path fixiert (Trigger-Funktion, Intake-RPC).
- RLS-Policies pruefen auth.uid() via (select ...) ohne per-row InitPlan.
- Nach Advisor-Run: nur noch zwei Sicherheitswarnungen (Leaked PW Protection, DB Patch).

**Regression**
- Passkey-/App-Lock-Flows unveraendert (focusTrap, Buttons, Cancel-Schliessen).
- Supabase-Client-Setup/Auth-Watcher/Realtime arbeiten wie in v1.7.5.1.
- Keine Externalisierung: Inline-JS/CSS bleiben; DOM/IDs unveraendert.

**Regression (Ergaenzung)**
- Intake-RPC (upsert_intake) speichert weiterhin korrekt (Smoke-Test Wasser +1ml).
- Appointments CRUD unveraendert (Trigger aktualisiert updated_at).
- Advisor Performance Warnungen verschwunden (Nachweis fuer Policy-Aenderungen).\n**Realtime**\n- Capture-Tab spiegelt Intake-Updates aus parallelen Clients innerhalb weniger Sekunden (health_events Channel).

## v1.7.5.3 - Design Guide Alignment (Capture)

**Smoke**
- Capture Accordion geÃ¯Â¿Â½ffnet: Titel/Divider/Save-Zone folgen dem 24px Raster, Buttons rechtsbÃ¯Â¿Â½ndig.
- Fokus-Test: Wasser/Salz/Protein-Felder zeigen MIDAS Fokus-Glow (#3A3DFF, 250 ms), Placeholder lesbar.
- Save-Flow: +1 ml Wasser speichert und aktualisiert Pills ohne Layout-Shift.

**Sanity**
- Palette/Tokens wirken global (Panels, Pills, Buttons) ohne DOM-Ã¯Â¿Â½nderungen.
- Capture-Panel nutzt Layer2-FlÃ¯Â¿Â½che, Border-Subtle, neue Pills (ok/warn/bad/neutral).
- Variante V1.7.5.3 Name sichtbar (Header + Title) fÃ¯Â¿Â½r Release-Trace.

**Regression**
- Realtime-Update auf Capture aktiv (siehe V1.7.5.2 Realtime Check).
- Panels auÃ¯Â¿Â½erhalb Capture unverÃ¯Â¿Â½ndert (Doctor/Charts/Flags).
- Keine JS/Logic-Changes; Supabase/Save-Pfade unverÃ¯Â¿Â½ndert.

## v1.7.5.4 - Design Guide Alignment (Buttons & Motion)

**Smoke**
- Buttons (ghost/primary/toggle) alle 40px hoch, Radius 8px, Fokus-Ring #3A3DFF.
- Tabs: Hover/Fokus sichtbar, aktiver Tab = Accent-Block.
- Accordions Ã¯Â¿Â½ffnen/schlieÃ¯Â¿Â½en in 200 ms mit Chevron-Rotation.

**Sanity**
- Inputs (global) verwenden Layer2 + Placeholder-Farbton; Fokus-Glow greift Ã¯Â¿Â½berall.
- Panel-Actions rechtsbÃ¯Â¿Â½ndig, Save-Buttons min. 160px.
- Accordion-Body hat konsistentes 24px-Raster.

**Regression**
- Capture/Doctor/Charts weiterhin bedienbar (Buttons/Inputs unverÃ¯Â¿Â½ndert funktional).
- Touch/Keyboard: Space/Enter auf Buttons & Summary funktioniert wie zuvor.
- Keine JS-Anpassungen; Realtime & Saves bleiben stabil.

## v1.7.5.5 - Navigation & Save Feedback

**Smoke**
- Tabs: Capture ? Doctor ? Capture zeigt aktive Markierung (Accent-Unterstrich, Farbwechsel).
- Scroll wenige Pixel: Header/Tabs erhalten soften Shadow; top = shadow weg.
- Save-Buttons (Capture/Flags/Body/BP) lÃ¯Â¿Â½sen grÃ¯Â¿Â½nen Panel-Flash aus.

**Sanity**
- flashButtonOk triggert panel-flash (0.45s) ohne doppelte Klassen.
- aria-current wird nur am aktiven Tab gesetzt; Keyboard-Fokus sichtbar.
- Shadow-Listener arbeitet passiv (kein Lag beim Scrollen).

**Regression**
- Capture/Doctor/Charts Fluss unverÃ¯Â¿Â½ndert; Buttons bleiben klickbar.
- Kein Einfluss auf Realtime/GUIs; Panel Flash endet automatisch.
- Header bleibt sticky; nav layout ohne Jumping (padding angepasst).

## v1.7.5.6 - Charts & Tooltip Polish

**Smoke**
- BP-Chart zeigt helle ZielbÃ¯Â¿Â½nder (Sys 110-130, Dia 70-85) hinter den Linien.
- Tooltip erscheint mit Fade-In, versteckt sich weich (Fade-Out) bei MouseOut/ESC.
- Chart-Refresh (Metric-Wechsel) animiert sanft (ca. 0.5 s) ohne harte SprÃ¯Â¿Â½nge.

**Sanity**
- Serienfarben folgen Palette: Sys Accents, Dia Pink, Gewicht/Leiste gedeckte TÃ¯Â¿Â½ne.
- Body-Bars nutzen Accent/Grau + Legende aktualisiert Farben.
- Tooltip bleibt pointer-events none; Inhalt/ARIA aktualisieren wie gehabt.

**Regression**
- Flags/Alert-Dots weiter sichtbar; Hover hebt Serie (Brightness) statt nur Dicke.
- Gewicht/Body-Bars + Hits klickbar; ZielbÃ¯Â¿Â½nder greifen nur bei BP.
- Keine Ã¯Â¿Â½nderung an Datenberechnung oder Realtime.

## v1.7.5.7 - Koerper-Chart Palette & Capture Layout

**Smoke**
- Koerper-Chart (Metric "weight") zeigt neue Farben: Gewicht Indigo-Soft, Umfang Grau, Muskel Accent-Blau, Fett Ocker; Legende/Tooltip stimmen visuell ueberein.
- Wechsel zwischen BP/Koerper sorgt fuer kontrastreiche Control-Bar (Surface-Layer) ohne Lesbarkeitsprobleme; Hover bleibt dezent.
- Capture-Panels (Koerper, Intake) besitzen keine doppelten Ueberschriften mehr; Save-Buttons stehen linksbuendig und loesen weiterhin den Gruen-Flash aus.
- Arzttermine-Karte zeigt Save/Done-Buttons gleich breit untereinander (Desktop & Mobil).

**Sanity**
- Y-Skalierung fuer Koerperdaten zieht sich auf min/max +-3 zusammen (mindestens 6 Einheiten Range, Obergrenze <= max+3); keine negativen Werte bei realistischen Inputs.
- Tooltip-Farben nutzen neue Palette (Weight/Waist/Muscle/Fat) und respektieren Hover/Focus-States; KPI-Leiste bleibt synchron.
- Buttons verwenden abgeschwaechte Brightness (hover ~1.08); kein Einfluss auf aria-Attribute oder Fokus-Ring.

**Regression**
- BP-Chart, Realtime-Update und Save-Flows funktionieren unveraendert.
- Arzttermine CRUD + Flash-Feedback unveraendert; Done/Speichern stoeren einander nicht.
- Keine DOM-ID-Aenderungen; Tests/Bookmarks bleiben gueltig.

## v1.7.6 - Modul-Refactor & Supabase Guards

**Smoke**
- App bootet ÃƒÂ¼ber `ensureModulesReady()` nur nach erfolgreichem Laden aller Skripte; Login-Overlay und `main()` starten ohne Console-Errors.
- Supabase-Login/Logout (Google) funktioniert; Capture- und Arzt-Ansicht lassen sich bedienen, inklusive Tabs/Charts nach Modul-Auslagerung.
- Chart-Panel lÃƒÂ¤sst sich wiederholt ÃƒÂ¶ffnen/schlieÃƒÅ¸en, ResizeObserver und Pointer-Listener werden bereinigt (keine Memory-Warnungen).
- Boot bleibt stabil, auch wenn einzelne Module (z. B. `ui-layout.js`) verzÃƒÂ¶gert laden Ã¢â‚¬â€œ Fallback-Meldung im Overlay anstatt Crash.

**Sanity**
- `SupabaseAPI`-Singleton liefert Client/Auth-Status ÃƒÂ¼ber `ensureSupabaseClient()`, `watchAuthState()`, `requireSession()`; Header-Cache (`getHeaders()`) erneuert Tokens nur einmal parallel (Promise-Lock).
- `cleanupOldIntake()` nutzt die normalisierte Events-URL (`toEventsUrl()`), toleriert 404-Responses und bleibt idempotent.
- `ensureModulesReady()` prÃƒÂ¼ft alle benÃƒÂ¶tigten Globals (`bindAuthButtons`, `watchAuthState`, `updateStickyOffsets`, `fmtDE`, `initDB`, `fetchWithAuth`, `ensureSupabaseClient`) und zeigt Fehler erst nach DOMContentLoaded an.
- PII-Logs: `diag.add()` zeigt keine vollstÃƒÂ¤ndigen UIDs mehr; `debugLogPii = true` gibt Original-IDs aus, `false` nur Hash/Mask.

**Regression**
- Alle extrahierten Module (`data-local`, `diagnostics`, `format`, `supabase`, `ui`, `ui-errors`, `ui-layout`, `ui-tabs`, `utils`) exportieren ihre ÃƒÂ¶ffentlichen APIs ÃƒÂ¼ber `window.AppModules.*`; Legacy-Aufrufer finden weiterhin die erwarteten Globs.
- Capture-Save/Load, Doctor-Refresh und Appointments-Calls liefern identische Ergebnisse wie in v1.7.5.7.
- Inline-Kommentare (`@refactor`) erscheinen nicht mehr im sichtbaren UI; Script-Lade-Reihenfolge (`diagnostics` Ã¢â€ â€™ `ui` Ã¢â€ â€™ `ui-layout`) bleibt stabil.

**Integrity**
- Supabase.js enthÃƒÂ¤lt keine doppelten Funktionsdefinitionen (`grep -n "function withRetry"` Ã¢â€ â€™ max. 1 Treffer).
- Singleton/Encapsulation-Test: Mehrfacher `getHeaders()`-Aufruf liefert konsistente Ergebnisse ohne Race-Conditions.
- Memory-Leak-Test: Mehrfaches `chartPanel.init()`/`destroy()` verÃƒÂ¤ndert Listener-Zahl (`getEventListeners(window)`) nicht.
- Boot-Validation-Test: Entfernen einzelner Module verhindert Start von `main()` und zeigt klaren Hinweis *Ã¢â‚¬Å¾Critical module missingÃ¢â‚¬Å“*.
- Defer-Order-Test: Alle Module laden synchron oder konsistent deferred; Inline-App-Code lÃƒÂ¤uft erst nach `DOMContentLoaded`.

**Smoke**
- `<script type="module" src="assets/js/supabase.js">` lÃ¤dt ohne Fehler; `window.AppModules.supabase` ist definiert und listet Core-Keys wie `withRetry` und `ensureSupabaseClient`.
- Console-Check `console.info("Supabase Core ready:", Object.keys(window.AppModules.supabase));` zeigt erwartete Funktionen (HTTP, Client, State) an.

**Sanity**
- `ensureSupabaseClient()` nutzt weiterhin gespeicherte REST/Key-Konfiguration und liefert denselben Client (kein mehrfaches Re-Init).
- `fetchWithAuth()` fÃ¼hrt Requests durch und verwendet weiterhin den Header-Cache (401-Refresh, Timeout-Handling) Ã¼ber `SupabaseAPI`.
- `baseUrlFromRest`, `maskUid`, Header-Cache-Helfer (`cacheHeaders` etc.) bleiben via `SupabaseAPI` und globale Window-Bindings erreichbar.

## v1.8.0 â€“ Supabase Refactor (Phase 1â€“2)
## v1.8.1 – Supabase API + Realtime Refactor

Smoke
- `assets/js/supabase/index.js` bündelt core/auth/api/realtime; Browser lädt Barrel via `type="module"`.
- `Object.keys(window.AppModules.supabase)` zeigt Intake/Vitals/Notes/Realtime-Funktionen (`loadIntakeToday`, `fetchDailyOverview`, `setupRealtime`).
- `SupabaseAPI.setupRealtime()` und `SupabaseAPI.resumeFromBackground()` verwenden vorhandene Legacy-Hooks oder fallbacken sauber.
- `SupabaseAPI.fetchWithAuth()` und `SupabaseAPI.loadIntakeToday()` funktionieren nach dem Modul-Split unverändert.

Sanity
- `supabase.js` delegiert Sync-/Intake-/Vitals-/Notes-Funktionen ausschließlich an die neuen Module; keine doppelten Implementierungen mehr.
- `syncCaptureToggles()` und `prefillBodyInputs()` nutzen die proxied `loadFlagsFromView`/`loadBodyFromView` Varianten aus den API-Modulen.
- Realtime-Barrel konserviert alte Browser-Funktionen (`window.setupRealtime/teardownRealtime/resumeFromBackground`) über captured Fallbacks.
- Barrel `index.js` merged Legacy-SupabaseAPI mit Modulen, sodass Zusatzfunktionen (`syncCaptureToggles`, `afterLoginBoot`) bestehen bleiben.

Regression
- Alle bisherigen Globals (`loadIntakeToday`, `saveIntakeTotalsRpc`, `deleteRemoteDay`, `appendNoteRemote`) bleiben via `window` erreichbar.
- `cleanupOldIntake()` nutzt `toEventsUrl` aus dem Realtime-Modul; keine direkten Zugriffe mehr auf inkonsistente Helper.
- `SupabaseAPI` enthält weiter Auth-Funktionen (`requireSession`, `watchAuthState`, `bindAuthButtons`) plus neue API/Realtime-Methoden ohne Name-Clashes.
- Keine Business-Logik Änderungen; neue Dateien speichern UTF-8, Header-Kommentare dokumentieren Herkunft.
