# QA Checklists

## v0.1.0 - Prototype

**Smoke**
- Tabs "Erfassen"/"Arzt-Ansicht" sichtbar; SVG-Chart rendert.
- Hilfe-/Diagnose-Panels Ã¶ffnen per Header/FAB.

**Sanity**
- Konfiguration erlaubt REST-Endpoint und API-Key; Speichern ruft `syncWebhook(entry)` (POST JSON, optionaler Authorization-Header) auf.
- Diagnose-Log protokolliert Benutzeraktionen (z. B. Toggle/Speichern).

**Regression**
- Keine Realtime/Auth/RLS; kein IndexedDB.
- UI bleibt responsiv, Sync-Fehler werden im Log angezeigt.

---

## v0.2.0 - Sync stabil

**Smoke**
- Button "Sync mit Supabase" lÃ¶st 4-Schritte-Dialog aus (CSV-Backup, Pending-Push, lokales Wipe, Reimport via REST); Busy-Overlay blockiert UI.
- CSV-Backup (`dl`) wird vor dem Sync erzeugt; Export CSV/JSON funktionieren weiter.
- "Alle lokal lÃ¶schen" entfernt EintrÃ¤ge aus IndexedDB nach BestÃ¤tigung.

**Sanity**
- `syncWebhook(entry, localId)` trÃ¤gt `remote_id` nach erfolgreichem POST ein; Pending ohne `remote_id` bleibt erhalten.
- `getHeaders` generiert Bearer-Header aus Konfiguration; `pushPendingToRemote`/`pullAllFromRemote` nutzen ihn.
- Diagnose-Log zeigt Sync-Schritte (Backup/Pending/Reload) sowie Fehler (fehlende Konfiguration etc.).

**Regression**
- Daily-Capture-Saves funktionieren offline weiter; Busy-Overlay verschwindet nach dem Sync.
- Toggle-Buttons setzen `aria-pressed`; "Krank" deaktiviert den Forxiga-Toggle.

---

## v0.3.0 - Befund Capture

**Smoke**
- Segment-Buttons "Erfassen â€“ Daily/Befund" schalten die Karten; Befund-Panel zeigt Felder fÃ¼r Datum, Kreatinin, eGFR, uACR, Kalium, Notiz.
- "Befund speichern" legt einen Eintrag im IndexedDB-Store `reports` an (Button-Flash, Felder werden geleert).
- Konfiguration speichert `webhookUrlMr`; Speichern bestÃ¤tigt mit "Gespeichert".

**Sanity**
- IndexedDB Version 3 beinhaltet den Store `reports` mit Index `byDate`; `addReport`/`updateReport`/`getAllReports` behalten `remote_id`.
- `syncReportWebhook(report, localId)` nutzt `webhookUrlMr` + `getHeaders`; Erfolg -> Log "Befund: Webhook OK", Fehler -> "Befund: Netzwerkfehler".
- Daily-Erfassung bleibt funktionsfÃ¤hig; Segment-Umschaltung beeinflusst Tagesfelder nicht.

**Regression**
- Manueller Daily-Sync (CSV/Pending/Wipe/Reload) arbeitet wie in v0.2.0; Busy-Overlay verschwindet danach.
- Export CSV/JSON liefert weiterhin Daily-EintrÃ¤ge; Offline-Saves bleiben mÃ¶glich.
- Toggle-Logik ("Krank" deaktiviert Forxiga) unverÃ¤ndert.

---

## v0.3.1 - Befundliste & Delete

**Smoke**
- "Erfassen"-Segment bleibt identisch; Liste-Tab besitzt Segment "Daily/Befund" und zeigt im Befund-Modus Tabelle `#tblReports` inkl. Sync-Status und Delete-Aktion.
- Sync-Status-Icon ("(sync)") sichtbar, sobald `remote_id` gesetzt ist; Delete-Button zeigt Busy/DONE wÃ¤hrend der AusfÃ¼hrung.
- Befund-Liste reagiert auf Segmentwechsel; Daily-Liste bleibt unverÃ¤ndert.

**Sanity**
- `loadAndRenderReports()` sortiert `reports` absteigend nach `ts`; Segmentwechsel ruft `loadAndRender()` bzw. `loadAndRenderReports()`.
- Delete-Flow: `deleteReportLocal` entfernt IDB-Eintrag; mit `remote_id` wird REST-DELETE versucht (Log "Befund-LÃ¶schung: Server + lokal OK" bzw. Fehlerhinweis).
- Konfiguration speichert weiterhin `webhookUrlMr`; Daily-Sync/Export bleiben verfÃ¼gbar.

**Regression**
- Daily-Capture/Saves arbeiten wie in v0.3.0; Busy-Overlay fÃ¼r Daily-Sync unverÃ¤ndert.
- Befund-Save (Segment "Erfassen â€“ Befund") funktioniert weiterhin; Felder leeren sich nach dem Speichern.
- CSV/JSON-Export liefert weiterhin Daily-Events; Befunddaten werden nicht versehentlich exportiert.

---

## v0.4.0 - Arzt-Ansicht Befunde

**Smoke**
- Segment "Daily/Befund" in der Arzt-Ansicht blendet Tabelle `#doctorTable` bzw. `#doctorReportsTable` korrekt ein/aus.
- Button "Werte anzeigen" Ã¶ffnet das passende Diagramm (Daily vs. Befunde); `chartReportsPanel` respektiert Metrik-Auswahl, GlÃ¤tten und PNG-Export.
- Befund-Charts zeigen Werte (Kreatinin/eGFR/uACR/Kalium); bei leeren ZeitrÃ¤umen erscheint der Placeholder.

**Sanity**
- `renderDoctorViewForMode()` und `loadAndRenderReports()` filtern nach Von/Bis und sortieren nach Datum/TS.
- `chartReportsPanel.getFiltered()` nutzt dieselben Filter; Range-Apply aktualisiert Tabellen und Diagramme (Daily/Befund).
- Segment "Liste â€“ Daily/Befund" lÃ¤dt weiterhin Daily bzw. Befunddaten on demand.

**Regression**
- Daily-Capture, Sync und Export behalten ihr Verhalten (Busy-Overlay, CSV/JSON, wipe) â€“ inkl. Refresh der aktiven Doctor-Ansicht und Charts.
- Befund-Save funktioniert wie in v0.3.0; Daily-Ansicht bleibt unverÃ¤ndert.
- Diagnose-Logs (Befund-Sync/LÃ¶schung) erscheinen weiterhin ("Befund-LÃ¶schung: Server + lokal OK" etc.).

---

## v0.5.0 - Realtime & Auto-Sync

**Smoke**
- `initialAutoSync()` lÃ¤uft beim Start: Busy-Overlay aktiv, Pending wird gepusht, Daily/Befunde (Liste & Arzt) werden ohne Wipe neu geladen.
- Realtime-Client (`setupRealtime()`) verbindet nach Konfig-Save; Logs zeigen "Supabase Realtime: Client initialisiert" bzw. "... subscribed".
- Online-Ereignis (`window.addEventListener('online', ...)`) triggert Pending-Push und `reconcileFromRemote()`/`reconcileReportsFromRemote()`; Listen/Charts aktualisieren sich.

**Sanity**
- Insert/Update aus Realtime upsertet Daily/Befund-DatensÃ¤tze; Delete entfernt den lokalen Eintrag (`deleteEntryLocal`/`deleteReportLocal`).
- Busy-Overlay (`setBusy`) wird bei Auto-Sync, manuellen Syncs und Realtime-Aktionen korrekt gesetzt/gelÃ¶st.
- Von/Bis-Range aktualisiert Daily- und Befund-Charts (`chartPanel`/`chartReportsPanel`), egal ob Realtime aktiv ist.

**Regression**
- Manueller Sync (Backup/Wipe/Reload) funktioniert weiterhin; Realtime bleibt danach aktiv.
- Offline-Saves bleiben mÃ¶glich, Pending wird beim nÃ¤chsten Online-Event verarbeitet.
- Diagnose-Log zeigt Realtime-Events (INSERT/UPDATE/DELETE) und Auto-Sync-Ergebnisse.

---

## v0.6.0 - Auth & Realtime

**Smoke**
- `initialAutoSync()` lÃ¤uft beim Start: Busy-Overlay aktiv, Pending wird gepusht, Daily/Befunde (Liste & Arzt) werden ohne Wipe neu geladen.
- Realtime-Client (`setupRealtime()`) verbindet nach Konfig-Save; Logs zeigen "Supabase Realtime: Client initialisiert" bzw. "... subscribed".
- Online-Handler (`window.addEventListener('online', ...)`) triggert Pending-Push plus `reconcileFromRemote()`/`reconcileReportsFromRemote()`; Listen und Charts aktualisieren sich.

**Sanity**
- Insert/Update aus Realtime upsertet Daily- und Befund-DatensÃ¤tze; Delete entfernt lokale EintrÃ¤ge (`deleteEntryLocal`/`deleteReportLocal`).
- Busy-Overlay (`setBusy`) wird bei Auto-Sync, manuellen Syncs und Realtime-Aktionen sauber gesetzt/gelÃ¶st.
- Von/Bis-Range aktualisiert sowohl Daily- als auch Befund-Charts (`chartPanel`/`chartReportsPanel`), auch nach Realtime-Events.

**Regression**
- Manueller Daily-Sync (Backup/Wipe/Reload) funktioniert weiterhin; Realtime bleibt danach aktiv.
- Offline-Saves bleiben mÃ¶glich, Pending wird beim nÃ¤chsten Online-/Realtime-Ereignis verarbeitet.
- Diagnose-Log zeigt Realtime-Events (INSERT/UPDATE/DELETE) sowie Auto-Sync-Ergebnisse.

---


**Smoke**
Capture-Panel enthaelt neue Toggles #saltHighToggle (> 5 g Salz) und #sugarHighToggle (> 10 g Zucker); Button-Flash + Reset bleiben erhalten.\n- Liste/Arzt-Ansicht zeigen zusaetzliche Spalten fuer Salz/Zucker; Chart-Panels (Daily/Befund) oeffnen im breiteren Layout (panel chart).\n- CSV-Export enthaelt Spalten Salz_ueber_5g und Zucker_ueber_10g.

**Sanity**
Save-Flow (saveBlock) uebermittelt salt_high/sugar_high; toggle-Status wird beim Laden aus der Cloud wiederhergestellt. Von/Bis-Filter aktualisieren Tabellen/Charts mit den neuen Werten; Placeholder-Text und Legenden bleiben korrekt. Delete-/Sync-Logik (lokal + remote) behandelt Eintraege weiterhin konsistent.

**Regression** 

---

## v0.8.0 - Arzt Daily Layout & Print

**Smoke**
- Druckansicht blendet UI-Chrome (Tabs/Charts/Diag) aus und druckt Arzt-/Befundansichten (Tabellen + TagesblÃ¶cke) mit korrekten RÃ¤ndern.
- TastenkÃ¼rzel: Strg/Cmd+S speichert den aktuellen Daily-Eintrag (Browser-Speichern wird verhindert, visuelles Feedback bleibt).

**Sanity**
- Notizen clampen nicht im Druck; Zahlen werden nicht abgeschnitten (min-width fÃ¼r numerische Felder).
- CSV-Header enthÃ¤lt `Salz_ueber_5g`/`Zucker_ueber_10g`; â€žArtâ€œ zeigt Messung/Training/Tageszusammenfassung korrekt, Zeitlabel enthÃ¤lt Kontext (Morgens/Abends/Tag).
- Service-Role-Guard in der Konfiguration warnt vor `service_role`-Keys; nach gÃ¼ltiger ANON-Konfig initialisiert Supabase-Client und Realtime.

**Regression**
- Realtime/Auto-Sync (v0.6.0) funktioniert unverÃ¤ndert; Pending Push, Reconcile (Daily/Befunde), Busy-Overlay.
- Export CSV/JSON unverÃ¤ndert auÃŸer zusÃ¤tzlichen Spalten aus v0.7.0; Delete-/Save-Flows (Daily/Befund) bleiben stabil.

---

## v0.9.0 - Print & Hard Reset

**Smoke**
- Print-Button (`#printBtn`) Ã¶ffnet den System-Druckdialog und nutzt die Print-CSS (Tabs/Charts/Diag ausgeblendet, saubere Tabellen/RÃ¤nder).
- Hard-Reset (`#hardResetBtn`) zeigt Confirm, entfernt Service Worker, Caches, Local/Session Storage und Cookies, lÃ¤dt frisch.
- Tastatur-Fokus ist sichtbar (Outline via `:focus-visible`) auf interaktiven Controls.

**Sanity**
- Nach Hard-Reset ist lokale Konfiguration entfernt; nach erneutem Speichern der Webhook-/Key-Werte initialisieren sich Supabase-Client und Realtime erneut.
- CSV/JSON-Export bleibt inhaltlich identisch zu v0.8.0; â€žArtâ€œ/Zeitlabels unverÃ¤ndert korrekt.

**Regression**
- Realtime/Auto-Sync (v0.6.0) bleibt stabil; Pending/Busy/Range-Updates funktionieren.
- Capture/List/Doctor Segments funktionieren unverÃ¤ndert; Speichern (inkl. Strg/Cmd+S) lÃ¶st weiterhin Save aus.

---

## v1.0.0 - App-Lock, KPIs, Waist/Protein

**Smoke**
- App-Lock: Nach Login/Boot erscheint bei aktivierter Sperre das Lock-Overlay; Entsperren via â€žPer Passkey entsperrenâ€œ oder PIN funktioniert, UI dimmt (`body.auth-locked`) und wird nach Unlock freigegeben.
- Diagramm-KPIs: BP zeigt Durchschnitt Sys/Dia/MAP; Gewichtsdiagramm zeigt Gewicht+Bauchumfang (2 Serien) und KPI-Leiste blendet BMI/WHtR (letzte Werte) ein.

**Sanity**
- Lock-Flows: Passkey-Registrierung speichert Credential-ID lokal; Unlock via Passkey/PIN setzt App frei; Buttons sind gebunden (`bindAppLockButtons`).
- KPI-Umschaltung: Bei Metric â€žbpâ€œ sind BMI/WHtR ausgeblendet; bei â€žweightâ€œ sind Sys/Dia/MAP ausgeblendet. `layoutKpis()` positioniert die Leiste korrekt.
- Kommentarpflicht: Bei Ã¼berschrittenen BP-Grenzen markiert `#notesDay` per Outline, bis Text vorhanden ist; reagiert live auf Eingaben in Sys/Dia Feldern und Notes.

**Regression**
- Realtime/Auth bleibt stabil: Nach gÃ¼ltiger Konfiguration + Login laufen `afterLoginBoot` â†’ `ensureAppLock` â†’ `setupRealtime`; UI-Refresh erfolgt bei Events.
- Export JSON funktioniert (Doctor-Toolbar). CSV/JSON-Exports auÃŸerhalb Doctor bleiben wie zuvor funktionsfÃ¤hig, sofern vorhanden.

---

## v1.1.0 - Kommentarpflicht (BP) & Save-Flow

**Smoke**
- Ãœberschreitet ein BP-Wert die Schwelle (Sys>130 oder Dia>90; morgens oder abends), verhindert â€žSpeichernâ€œ den Save, zeigt einen Alert und markiert `#notesDay` mit roter Outline; Fokus springt ins Kommentarfeld.
- Nach Eingabe eines Kommentars lÃ¤sst sich speichern; ohne GrenzwertÃ¼berschreitung ist Speichern unverÃ¤ndert mÃ¶glich.

**Sanity**
- SchwellenprÃ¼fung berÃ¼cksichtigt vier Felder: `#sysM/#diaM/#sysA/#diaA`. Leeren/Anpassen der Werte aktualisiert die Pflicht korrekt; Outline-Reset funktioniert.
- Save-Flow: Blocked vor `saveBlock("M")/saveBlock("A")/saveDaySummary()`, d. h. es werden keine Teil-EintrÃ¤ge gespeichert, solange Kommentar fehlt.
- Arzt-Ansicht Styles enthalten `.doctor-view .num.alert` fÃ¼r spÃ¤tere Hervorhebungen; bestehende Zahlenformatierung (tabular-nums, min-width) bleibt erhalten.

**Regression**
- Realtime/Auto-Sync, Export-Funktionen und Toggles verhalten sich wie in v1.0.0.

---


**Smoke**
- KPI-Leiste zeigt farbige Punkte: BPâ€‘Durchschnittswerte in Blau; beim Gewichtsâ€‘Diagramm werden BMI/WHtR farblich (WHOâ€‘Schema) markiert; genau ein Separator zwischen Items.
- Liveâ€‘Region `#err` zeigt Fehler/Infos sichtbar und verschwindet automatisch; Screenreader kÃ¼ndigen Ã„nderungen (ariaâ€‘live) an.

**Sanity**
- WHOâ€‘Farblogik: BMI <18.5 blau, 18.5â€“<25 grÃ¼n, 25â€“<30 amber, â‰¥30 rot; WHtR <0.5 grÃ¼n, â‰¤0.6 amber, >0.6 rot. Farbâ€‘Dots stehen vor den KPIâ€‘Spans; keine doppelten Separatoren.
- Chartâ€‘Layout: SVG fÃ¼llt HÃ¶he (preserveAspectRatio="none", height:100%), Legende zeigt farbige Dots + Labels; KPIâ€‘Leiste ist `inline-flex` ausgerichtet.
- Saveâ€‘Flow: Meldung â€žKeine Daten eingegeben â€“ nichts zu speichernâ€œ erscheint korrekt, wenn weder M/A noch Tageszusammenfassung Daten enthÃ¤lt; M/Aâ€‘Saves enthalten kein Gewicht mehr.

**Regression**
- Bestehende Flows aus v1.1.0 (Kommentarpflicht), v1.0.0 (Appâ€‘Lock/KPIs/Badges/Weist/Protein), sowie Realtime/Exports bleiben funktionsfÃ¤hig.

---

## v1.3.0 - Lifestyle Intake & Fullscreen Chart

**Smoke**
- Lifestyle-Tab sichtbar. â€ž+ Mengeâ€œ fÃ¼r Wasser/Salz/Protein erhÃ¶ht die Totals; Fortschrittsbalken (Wasser/Salz/Protein) aktualisieren Breite, Label und Farbe.
- UngÃ¼ltige Eingaben (leer/0/negativ) zeigen `uiError` in `#err`; gÃ¼ltige Updates zeigen `uiInfo` (â€žâ€¦ aktualisiertâ€œ).
- Nach Login/Refresh lÃ¤dt `renderLifestyle()` die Tagesâ€‘Totals vom Server und aktualisiert die Balken; Hinweistext zeigt Ziele korrekt.
- â€žWerte anzeigenâ€œ Ã¶ffnet das Chart im Vollbild; Header bleibt sichtbar, SchlieÃŸen funktioniert.

**Sanity**
- Ziele/Schwellen: Wasserâ€‘ZustÃ¤nde (<50% rot, 50â€“89% gelb, â‰¥90% grÃ¼n); Salz (0â€“4.9 g grÃ¼n, 5â€“6 g gelb, >6 g rot); Protein (<78 neutral, 78â€“90 grÃ¼n, >90 rot). Labels zeigen Statusâ€‘Text.
- Kappung: Wasser bis 6000 ml, Salz bis 30 g, Protein bis 300 g; Prozentbreiten â‰¤100%.
- Persistenz: `saveIntakeTotals()` POST auf `health_events` mit `type:"intake"`, Fallback PATCH bei Konflikt; `cleanupOldIntake()` lÃ¶scht Intakeâ€‘EintrÃ¤ge Ã¤lter als heute.

**Regression**
- Capture/Doctor weiter stabil (App-Lock, KPIs, Badges, Kommentarpflicht). Realtime/Autoâ€‘Sync fÃ¼r Dailyâ€‘Events unverÃ¤ndert.
- JSONâ€‘Export, Rangeâ€‘Filter und Charts (BP/Weight) verhalten sich wie in v1.2.0; KPIâ€‘Leiste bleibt funktionsfÃ¤hig.

---


**Smoke**
- KPIâ€‘Leiste enthÃ¤lt die nÃ¶tigen Spans (Sys/Dia/MAP bzw. BMI/WHtR) auch nach Refresh; Farben/Dots bleiben sichtbar wie in v1.2.0.

**Sanity**
- KPIâ€‘Fallback: Falls KPIâ€‘Spans fehlen, erzeugt der Code sie (dataâ€‘k= sys/dia/map/bmi/whtr) mit Labels; keine doppelten Separatoren oder Layoutâ€‘SprÃ¼nge.

**Regression**
- Lifestyleâ€‘Tab, Arztâ€‘Ansicht und Kommentarpflicht verhalten sich wie in v1.3.0/v1.1.0; KPIâ€‘Farbregeln (WHO) und Legende bleiben unverÃ¤ndert.
- Realtime/Autoâ€‘Sync, JSONâ€‘Export und Rangeâ€‘Filter funktionieren weiterhin.

---


**Smoke**
- Bei fehlenden Messwerten greift der Xâ€‘Fallback (letzte 7 Tage); Achsen/Legende bleiben sichtbar.

**Sanity**

**Regression**
- Lifestyleâ€‘Tab, Kommentarpflicht, Realtime/Exports unverÃ¤ndert.

---

## v1.4.2 - Chart A11y & Labels

**Smoke**
- Chartâ€‘Deko ist stummgeschaltet (`aria-hidden` auf dekorativen Separators/Elementen); KPIâ€‘Separatoren stÃ¶ren Screenreader nicht.

**Sanity**
- Liveâ€‘Regionen: `#err` und KPIâ€‘Leiste setzen `aria-live="polite"`; Updates werden angekÃ¼ndigt, ohne Fokus zu stehlen.
- Toggles aktualisieren `aria-pressed` korrekt (true/false) bei Klick/Statuswechsel.
- Auswahlfeld fÃ¼r Metrik trÃ¤gt ein verstÃ¤ndliches `aria-label` (z.â€¯B. â€žMessgrÃ¶ÃŸe auswÃ¤hlenâ€œ).

**Regression**
- Lifestyleâ€‘Tab, WHOâ€‘KPIâ€‘Farben, Kommentarpflicht, Realtime/Exports weiterhin stabil.

---

## v1.4.3 - Chart Grid & Weekly Ticks

**Smoke**
- Dailyâ€‘Chart zeigt horizontale Rasterlinien mit Yâ€‘Labels (grobe 10 Ticks); Werte sind gut lesbar auf dunklem Hintergrund.
- Vertikale Wochenâ€‘Linien (gestrichelt) inkl. Datumslables am unteren Rand sind sichtbar und mittig zu den Linien ausgerichtet.

**Sanity**
- Yâ€‘Ticks: Es werden ~10 gleichmÃ¤ÃŸig verteilte Linien/Labels gezeichnet; Labels sind gerundet (ohne Dezimalstellen) und schneiden nicht ins Chart.
- Xâ€‘Wochenâ€‘Raster: Start wird anhand `xmin` ausgerichtet; Linien liegen innerhalb [xmin, xmax], Labels verwenden Format `DD.MM.` und sind mittig positioniert.
- Skalen/Padding: 2% Xâ€‘Padding und 8% Yâ€‘Padding (mind. 1 Einheit) sind aktiv; Mappingâ€‘Funktionen `x(t)`/`y(v)` berÃ¼cksichtigen `innerW/innerH` korrekt.

**Regression**
- KPIâ€‘Leiste (Dots/Separatoren) und Lifestyleâ€‘Tab verhalten sich weiterhin stabil.

---

## v1.4.4 - Encoding & Emoji Entities

**Smoke**
- Toggleâ€‘Buttons zeigen Emojiâ€‘Symbole korrekt (Training/krank/Medikamente/Wasser/Salz/Zucker) per HTMLâ€‘Entities; keine  ?/Tofuâ€‘Glyphen.
- `metricSel` besitzt ein verstÃ¤ndliches ASCIIâ€‘`aria-label` (z.â€¯B. â€žMessgroesse auswaehlenâ€œ); Auswahl per Tastatur/Screenreader funktioniert.
- KPIâ€‘Separatoren werden als dekorative Zeichen (z.â€¯B. â€ž*â€œ) dargestellt und sind `aria-hidden`, stÃ¶ren Screenreader nicht.

**Sanity**
- A11yâ€‘Attribute bleiben konsistent: `aria-pressed` auf Toggles, `role="img"`/`aria-label` auf Chartâ€‘SVG, Liveâ€‘Regionen (`#err`, KPIâ€‘Leiste) mit `aria-live="polite"`.
- Titel/Buttons im Lock/Loginâ€‘Overlays behalten ihre Rollen/Labels (role="dialog", `aria-labelledby`).

**Regression**
- Lifestyleâ€‘Tab, Kommentarpflicht, Realtime/Export weiterhin stabil.

---


**Smoke**
- Morgens/Abends besitzen je ein Kommentar-Feld (`#bpCommentM`/`#bpCommentA`); Speichern funktioniert auch bei Kommentarâ€‘only (ohne Werte) fÃ¼r den jeweiligen Block.
- Validierung: Bei nur einem BPâ€‘Wert (Sys oder Dia) erscheint eine Fehlermeldung; bei eingegebenem Puls ohne beide BPâ€‘Werte ebenfalls.

**Sanity**
- `blockHasData(which)` berÃ¼cksichtigt `sys/dia/pulse` sowie den Blockâ€‘Kommentar; `hasM`/`hasA` werden korrekt ermittelt.
- `saveBlock` setzt Defaultâ€‘Zeiten (M=07:00, A=22:00); bei gemischten Eingaben werden BPâ€‘Paarâ€‘Regeln eingehalten (kein Puls ohne Sys+Dia, kein einzelner BPâ€‘Wert).
- Chartâ€‘Fullscreen: HeaderhÃ¶he 44px, Inhalt `calc(100dvh - 44px - 2px)` mit Safeâ€‘Areaâ€‘Padding; kein Inhalt hinter Notch abgeschnitten.

**Regression**
- Emojis/Entities (v1.4.4) werden korrekt dargestellt; A11yâ€‘Attribute (ariaâ€‘pressed, ariaâ€‘labels, Liveâ€‘Regionen) bleiben konsistent.

---


**Smoke**

**Sanity**
- Accessibility/Markup: Summary ohne Marker (`::-webkit-details-marker` entfernt); Chevron ist `aria-hidden`; Tastatur (Enter/Space) toggelt das Accordion.
- Layout: `card-nested` AbstÃ¤nde/Polsterung korrekt; auf Mobil geringere Padding-Werte greifen; kein Layout-Sprung beim Umschalten.

**Regression**
- Fullscreen-Chart (Header 44px, Safe-Area-Padding), Emojis/Entities (v1.4.4) und A11y-Attribute bleiben konsistent.

---

## v1.4.7 - Chart Controls Layout & SVG Height

**Smoke**
- Chartâ€‘Controls layouten responsiv: Elemente teilen sich den Raum (`#chart .controls > * { flex:1 }`), Halfâ€‘Breite funktioniert (`.half` â‰ˆ 50%).
- Chartâ€‘SVG fÃ¼llt die verfÃ¼gbare HÃ¶he vollstÃ¤ndig (`height:100%`, minâ€‘height 160px) innerhalb des Fullscreenâ€‘Panels; keine abgeschnittenen Bereiche.

**Sanity**
- Wrap/Spacing: Controls umbrechen sauber (flexâ€‘wrap), AbstÃ¤nde bleiben konsistent; keine Ãœberlappung mit Legende/Buttons.
- Safeâ€‘Areaâ€‘Padding im Panelâ€‘Content bleibt aktiv; Scroll verlÃ¤uft innerhalb des Contents, Header bleibt fix.

**Regression**

---


**Smoke**

**Sanity**
- Datumâ€‘Wechsel in Capture (`#date` change) lÃ¤dt Toggles des gewÃ¤hlten Tages  setzt Panels zurÃ¼ck (`resetCapturePanels()`), aktualisiert Warnhinweise (`updateBpCommentWarnings`).

**Regression**
- Bisherige Toggles/Bindings (inkl. `#proteinHighToggle`) funktionieren; Applyâ€‘Range (`#applyRange`) rendert Arztâ€‘Ansicht/Chart wie gewohnt.

---

## v1.4.9 - BP Panel Save, Unlockâ€‘Flow, UIâ€‘Refresh

**Smoke**
- BPâ€‘Panel besitzt eigene Saveâ€‘Aktionen je Block (Morgens/Abends); Speichern zeigt Feedback (â€žâœ… Blutdruck gespeichertâ€œ), Button wÃ¤hrenddessen im Busyâ€‘State.
- Chart/Export hinter Doctorâ€‘Unlock: Klick auf â€žWerte anzeigenâ€œ/â€žExport JSONâ€œ fordert ggf. Entsperren; nach erfolgreichem Unlock lÃ¤uft die Aktion fort.
- ESC entsperrt bei aktivem Appâ€‘Lock ohne Pendingâ€‘Aktion; Sichtbarkeitswechsel (zurÃ¼ck in die App) rÃ¤umt Locks auf, sofern nicht in der Arztâ€‘Ansicht.

**Sanity**
- BPâ€‘Kommentarpflichten/Warnhinweise aktualisieren sich nach BPâ€‘Save (`updateBpCommentWarnings()`), Panel wird zurÃ¼ckgesetzt (`resetBpPanel(which)`).
- Dateâ€‘Change in Capture lÃ¤dt Toggles  setzt Panels zurÃ¼ck (`resetCapturePanels()`), aktualisiert BPâ€‘Warnungen.

**Regression**

---


## v1.5.0  ?" Panel Saves & Refresh

Siehe ursprÇ¬gliche Checks (panelweises Speichern, `requestUiRefresh` orchestration, Legacy Cleanup).

---

## v1.5.1  ?" Visibility Resume

Siehe ursprÇ¬ngliche Checks (Overlay schlie Yt, Passkey/PIN nach Resume, Capture erreichbar).

---

## v1.5.2  ?" Resume Tabs

Siehe ursprÇ¬ngliche Checks (Tabs nach App-/Tab-Wechsel, Unlock-Intent).

---

## v1.5.3  ?" Fast Login

Siehe v1.5.4 Erg  nzung: Fokus auf Timeout-Fixes und Session-Fallback (Smoke/Sanity/Regression analog).

---

## v1.5.4  ?" Cleanup

**Smoke**
- Schnelltest: Tabs nach Resume bleiben klickbar; kein `session-timeout` im Log.

**Sanity**

**Regression**
- `isLoggedInFast` weiterhin fallback-f  hig; Unlock/Intent-Flows stabil.

---

## v1.5.5  ?" Intake Accordion

**Smoke**
- Capture-Accordion  ?zFlÇ¬ssigkeit & Intake ?o   ffnet/schlie Yt; Buttons speichern in Supabase + IndexedDB.

**Sanity**
- Zeitstempel = `<day>T12:00:00Z`; REST PATCH/POST funktioniert.

**Regression**
- Reconnect nur bei vorhandenem `reconcileFromRemote`   ' keine Fehler.

---

## v1.5.6  ?" Intake UI Refresh

**Smoke**
- Fortschrittsbalken zeigen Gradient + Glow; Pill-Farben stimmen mit Zielbereich.

**Sanity**
- `refreshCaptureIntake` und `handleCaptureIntake` verfÇ¬gbar (window Scope).

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
- Termin speichern (z. ? B. Nephrologe)   ' Badge aktualisiert sich, Done setzt Badge zurÇ¬ck.

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
- Midnight Refresh setzt Kontext zurÇ¬ck auf Morgens.

---

## v1.6.6  ?" Body-Views Backend

**Smoke**
- View `v_events_body` liefert `kg/cm/fat_pct/muscle_pct/fat_kg/muscle_kg` fÇ¬r Testdaten.

**Sanity**
- RLS: Query mit fremder `user_id`   ' 0 Zeilen.
- Index-Plan: `health_events` (user_id, type, ts) genutzt.

**Regression**
- Bestehende Auswertungen (Gewicht ohne Prozente) kommen unver  ndert zurÇ¬ck.

---

## v1.6.8  ?" K  rper-Chart Balken

**Smoke**
- Mit Kompositionsdaten: Muskel-/Fettbalken (kg) rendern nebeneinander; Bars verschwinden ohne Daten.
- Legende erg  nzt  ?zMuskelmasse/Fettmasse ?o nur bei aktiven Werten.

**Sanity**

**Regression**
- Chart-Tooltip, KPI-Anzeige, Zoom/Resize funktionieren unver  ndert.

---

## v1.6.9  ?" A11y & Micro Polish

**Smoke**
- Intake-Pills fokusieren   ' Screenreader-Ansage  ?zTagesaufnahme:  ?Ýƒ?o.
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
- Unlock-Flows (Passkey/PIN) funktionieren; Telemetrie-Log erzeugt keine Fehlermeldungen.

## v1.7.1  ?" Patch

**Smoke**
- Diagramm-Perf-Log: drawChart mehrfach triggern (z. B. Chart oeffnen/resize, ~50x). Erwartung: Logzeile `[perf] drawChart ...` erscheint nur bei jedem 25. Aufruf.

**Sanity**
- Keine verbleibenden Referenzen auf `sugarHighToggle` im Markup/JS (Suche im Projekt).

**Regression**
- Header-Telemetrie (`header_intake`, `header_appt`) unveraendert: p50/p90/p95 werden wie zuvor periodisch geloggt, keine zusaetzliche Spam-Frequenz.

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


## v1.7.3.7 â€“ Intake RPC + Tages-Reset (Hook)

**Smoke**
- Intake-Save (Wasser/Salz/Protein) erzeugt genau 1 Request an `/rest/v1/rpc/upsert_intake` mit Prefer `return=representation`.
- Logs enthalten: `[capture] fetch start intake:rpc` â†’ `[capture] save network ok`.
- Wenn RPC fehlt (404/405): einmaliger Fallback-Log `[capture] rpc missing, fallback to legacy` und Save funktioniert dennoch.

**Sanity**
- RLS: signed-in User kann nur eigene Intake-Zeilen erstellen/aktualisieren; fremdes JWT â†’ 0 Zeilen.
- Reset-Hook: Bei Tageswechsel/Resume wird einmalig `upsert_intake` mit 0â€‘Totals gesendet; Logs zeigen Start/Ende.
- Kein Reset, wenn im UI bewusst ein anderer Tag ausgewÃ¤hlt ist (Pin bleibt bestehen).

**Regression**
- UI bleibt responsiv (Save/Reset sind Fireâ€‘andâ€‘Forget); `requestUiRefresh` bleibt entkoppelt.
- Keine Duplikate dank Unique-Index `(user_id, day, type='intake')`.

## v1.7.3.8 â€“ Day-basierte Reads

**Smoke**
- `loadIntakeToday()` liest Intake ausschlieÃŸlich via `day=eq.<YYYY-MM-DD>` (keine `ts`-Range).

**Sanity**
- Arzt-/Views-Loader verwenden weiterhin `day gte/lte`-Filter (ZeitrÃ¤ume) und liefern korrekte Daten.

**Regression**
- Intake-Header (Pills/Balken) zeigt korrekte Werte nach Refresh/Resume.

## v1.7.3.9 â€“ Stabilisierung

**Smoke**
- Keine Nutzerâ€‘sichtbaren Ã„nderungen; Logging & Fallbacks bleiben stabil.

**Sanity**
- Resume/Realtime/Refresh verhalten sich wie in 1.7.3.7/1.7.3.8.

**Regression**
- Keine Ã„nderung an Auth-/Cache-Mechanik; Save bleibt 1 Request (RPC-first, einmaliger Legacy-Fallback).

## v1.7.4 Cleanup & Vereinheitlichung

**Smoke**
- Legacy-Fallback setzt `ts` auf lokales Mitternacht (Europe/Vienna) und patcht via `day=eq` statt Zeitfenster.
- `loadIntakeToday()` nutzt `day=eq` (final), Intake-Pills werden am neuen Tag automatisch auf 0 gesetzt (einmal/Tag).

**Sanity**
- Reset-Guards: Inâ€‘Memory + `localStorage` verhindern Doppel-Resets; Reset triggert asynchrones `refreshCaptureIntake()`.
- Logging: Reset `[capture] reset intake start/end`; Save `[capture] fetch start intake:rpc` â†’ `[capture] save network ok`.

**Regression**
- Keine AbhÃ¤ngigkeiten zu Doctor-/Appointment-Modulen; UI bleibt responsiv.
- RLS/Unique-Index verhindern Duplikate/Datenverlust; `user_id` wird im RPC serverseitig gesetzt.

## v1.7.5 - Arzt DESC & Koerper-Bar-Hover

**Smoke**
- Arzt-Ansicht zeigt neuesten Tag oben (DESC).
- Scrollposition bleibt nach Refresh/Range-Apply/Entsperren erhalten.
- Chart "Gewicht": Muskel-/Fett-Balken sind klick-/fokussierbar; Tooltip erscheint; Legend-/Series-Highlight reagiert auf Hover/Klick.

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
- index v1.7.5.html enthï¿½lt MODULE-/SUBMODULE-Kommentare; App startet, Capture/Doctor/Charts funktionieren unverï¿½ndert.
- FUTURE-Block (placeholders) am Dateiende ist rein dokumentarisch.

**Sanity**
- Keine DOM/JS/CSS-ï¿½nderungen auï¿½er Kommentaren/Whitespace.
- W3C/ARIA bleiben unverï¿½ndert grï¿½n; keine neuen Logs/Side-Effects.

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
- Capture Accordion geï¿½ffnet: Titel/Divider/Save-Zone folgen dem 24px Raster, Buttons rechtsbï¿½ndig.
- Fokus-Test: Wasser/Salz/Protein-Felder zeigen MIDAS Fokus-Glow (#3A3DFF, 250 ms), Placeholder lesbar.
- Save-Flow: +1 ml Wasser speichert und aktualisiert Pills ohne Layout-Shift.

**Sanity**
- Palette/Tokens wirken global (Panels, Pills, Buttons) ohne DOM-ï¿½nderungen.
- Capture-Panel nutzt Layer2-Flï¿½che, Border-Subtle, neue Pills (ok/warn/bad/neutral).
- Variante V1.7.5.3 Name sichtbar (Header + Title) fï¿½r Release-Trace.

**Regression**
- Realtime-Update auf Capture aktiv (siehe V1.7.5.2 Realtime Check).
- Keine JS/Logic-Changes; Supabase/Save-Pfade unverï¿½ndert.

## v1.7.5.4 - Design Guide Alignment (Buttons & Motion)

**Smoke**
- Buttons (ghost/primary/toggle) alle 40px hoch, Radius 8px, Fokus-Ring #3A3DFF.
- Tabs: Hover/Fokus sichtbar, aktiver Tab = Accent-Block.
- Accordions ï¿½ffnen/schlieï¿½en in 200 ms mit Chevron-Rotation.

**Sanity**
- Inputs (global) verwenden Layer2 + Placeholder-Farbton; Fokus-Glow greift ï¿½berall.
- Panel-Actions rechtsbï¿½ndig, Save-Buttons min. 160px.
- Accordion-Body hat konsistentes 24px-Raster.

**Regression**
- Capture/Doctor/Charts weiterhin bedienbar (Buttons/Inputs unverï¿½ndert funktional).
- Touch/Keyboard: Space/Enter auf Buttons & Summary funktioniert wie zuvor.
- Keine JS-Anpassungen; Realtime & Saves bleiben stabil.

## v1.7.5.5 - Navigation & Save Feedback

**Smoke**
- Tabs: Capture ? Doctor ? Capture zeigt aktive Markierung (Accent-Unterstrich, Farbwechsel).
- Scroll wenige Pixel: Header/Tabs erhalten soften Shadow; top = shadow weg.

**Sanity**
- flashButtonOk triggert panel-flash (0.45s) ohne doppelte Klassen.
- aria-current wird nur am aktiven Tab gesetzt; Keyboard-Fokus sichtbar.
- Shadow-Listener arbeitet passiv (kein Lag beim Scrollen).

**Regression**
- Capture/Doctor/Charts Fluss unverï¿½ndert; Buttons bleiben klickbar.
- Kein Einfluss auf Realtime/GUIs; Panel Flash endet automatisch.
- Header bleibt sticky; nav layout ohne Jumping (padding angepasst).

## v1.7.5.6 - Charts & Tooltip Polish

**Smoke**
- BP-Chart zeigt helle Zielbï¿½nder (Sys 110-130, Dia 70-85) hinter den Linien.
- Tooltip erscheint mit Fade-In, versteckt sich weich (Fade-Out) bei MouseOut/ESC.
- Chart-Refresh (Metric-Wechsel) animiert sanft (ca. 0.5 s) ohne harte Sprï¿½nge.

**Sanity**
- Serienfarben folgen Palette: Sys Accents, Dia Pink, Gewicht/Leiste gedeckte Tï¿½ne.
- Body-Bars nutzen Accent/Grau + Legende aktualisiert Farben.
- Tooltip bleibt pointer-events none; Inhalt/ARIA aktualisieren wie gehabt.

**Regression**
- Gewicht/Body-Bars + Hits klickbar; Zielbï¿½nder greifen nur bei BP.
- Keine ï¿½nderung an Datenberechnung oder Realtime.

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
- App bootet Ã¼ber `ensureModulesReady()` nur nach erfolgreichem Laden aller Skripte; Login-Overlay und `main()` starten ohne Console-Errors.
- Supabase-Login/Logout (Google) funktioniert; Capture- und Arzt-Ansicht lassen sich bedienen, inklusive Tabs/Charts nach Modul-Auslagerung.
- Chart-Panel lÃ¤sst sich wiederholt Ã¶ffnen/schlieÃŸen, ResizeObserver und Pointer-Listener werden bereinigt (keine Memory-Warnungen).
- Boot bleibt stabil, auch wenn einzelne Module (z. B. `ui-layout.js`) verzÃ¶gert laden â€“ Fallback-Meldung im Overlay anstatt Crash.

**Sanity**
- `SupabaseAPI`-Singleton liefert Client/Auth-Status Ã¼ber `ensureSupabaseClient()`, `watchAuthState()`, `requireSession()`; Header-Cache (`getHeaders()`) erneuert Tokens nur einmal parallel (Promise-Lock).
- `cleanupOldIntake()` nutzt die normalisierte Events-URL (`toEventsUrl()`), toleriert 404-Responses und bleibt idempotent.
- `ensureModulesReady()` prÃ¼ft alle benÃ¶tigten Globals (`bindAuthButtons`, `watchAuthState`, `updateStickyOffsets`, `fmtDE`, `initDB`, `fetchWithAuth`, `ensureSupabaseClient`) und zeigt Fehler erst nach DOMContentLoaded an.
- PII-Logs: `diag.add()` zeigt keine vollstÃ¤ndigen UIDs mehr; `debugLogPii = true` gibt Original-IDs aus, `false` nur Hash/Mask.

**Regression**
- Alle extrahierten Module (`data-local`, `diagnostics`, `format`, `supabase`, `ui`, `ui-errors`, `ui-layout`, `ui-tabs`, `utils`) exportieren ihre Ã¶ffentlichen APIs Ã¼ber `window.AppModules.*`; Legacy-Aufrufer finden weiterhin die erwarteten Globs.
- Capture-Save/Load, Doctor-Refresh und Appointments-Calls liefern identische Ergebnisse wie in v1.7.5.7.
- Inline-Kommentare (`@refactor`) erscheinen nicht mehr im sichtbaren UI; Script-Lade-Reihenfolge (`diagnostics` â†’ `ui` â†’ `ui-layout`) bleibt stabil.

**Integrity**
- Supabase.js enthÃ¤lt keine doppelten Funktionsdefinitionen (`grep -n "function withRetry"` â†’ max. 1 Treffer).
- Singleton/Encapsulation-Test: Mehrfacher `getHeaders()`-Aufruf liefert konsistente Ergebnisse ohne Race-Conditions.
- Memory-Leak-Test: Mehrfaches `chartPanel.init()`/`destroy()` verÃ¤ndert Listener-Zahl (`getEventListeners(window)`) nicht.
- Boot-Validation-Test: Entfernen einzelner Module verhindert Start von `main()` und zeigt klaren Hinweis *â€žCritical module missingâ€œ*.
- Defer-Order-Test: Alle Module laden synchron oder konsistent deferred; Inline-App-Code lÃ¤uft erst nach `DOMContentLoaded`.

**Smoke**
- `<script type="module" src="assets/js/supabase.js">` lädt ohne Fehler; `window.AppModules.supabase` ist definiert und listet Core-Keys wie `withRetry` und `ensureSupabaseClient`.
- Console-Check `console.info("Supabase Core ready:", Object.keys(window.AppModules.supabase));` zeigt erwartete Funktionen (HTTP, Client, State) an.

**Sanity**
- `ensureSupabaseClient()` nutzt weiterhin gespeicherte REST/Key-Konfiguration und liefert denselben Client (kein mehrfaches Re-Init).
- `fetchWithAuth()` führt Requests durch und verwendet weiterhin den Header-Cache (401-Refresh, Timeout-Handling) über `SupabaseAPI`.
- `baseUrlFromRest`, `maskUid`, Header-Cache-Helfer (`cacheHeaders` etc.) bleiben via `SupabaseAPI` und globale Window-Bindings erreichbar.

## v1.8.0 – Supabase Refactor (Phase 1–2)
## v1.8.1 � Supabase API + Realtime Refactor

Smoke
- `assets/js/supabase/index.js` b�ndelt core/auth/api/realtime; Browser l�dt Barrel via `type="module"`.
- `Object.keys(window.AppModules.supabase)` zeigt Intake/Vitals/Notes/Realtime-Funktionen (`loadIntakeToday`, `fetchDailyOverview`, `setupRealtime`).
- `SupabaseAPI.setupRealtime()` und `SupabaseAPI.resumeFromBackground()` verwenden vorhandene Legacy-Hooks oder fallbacken sauber.
- `SupabaseAPI.fetchWithAuth()` und `SupabaseAPI.loadIntakeToday()` funktionieren nach dem Modul-Split unver�ndert.

Sanity
- `supabase.js` delegiert Sync-/Intake-/Vitals-/Notes-Funktionen ausschlie�lich an die neuen Module; keine doppelten Implementierungen mehr.
- Realtime-Barrel konserviert alte Browser-Funktionen (`window.setupRealtime/teardownRealtime/resumeFromBackground`) �ber captured Fallbacks.
- Barrel `index.js` merged Legacy-SupabaseAPI mit Modulen, sodass Zusatzfunktionen (`afterLoginBoot`) bestehen bleiben.

Regression
- Alle bisherigen Globals (`loadIntakeToday`, `saveIntakeTotalsRpc`, `deleteRemoteDay`, `appendNoteRemote`) bleiben via `window` erreichbar.
- `cleanupOldIntake()` nutzt `toEventsUrl` aus dem Realtime-Modul; keine direkten Zugriffe mehr auf inkonsistente Helper.
- `SupabaseAPI` enth�lt weiter Auth-Funktionen (`requireSession`, `watchAuthState`, `bindAuthButtons`) plus neue API/Realtime-Methoden ohne Name-Clashes.
- Keine Business-Logik �nderungen; neue Dateien speichern UTF-8, Header-Kommentare dokumentieren Herkunft.

## v1.8.2 - Guard/Resume Cleanup

Smoke
- `Object.keys(window.AppModules.supabase)` listet Guard-Funktionen (`requireDoctorUnlock`, `resumeAfterUnlock`, `bindAppLockButtons`, `authGuardState`, `lockUi`) sowie Realtime `resumeFromBackground`.
- Sichtbarkeits-/PageShow-/Focus-Events triggern `SupabaseAPI.resumeFromBackground()`; keine Inline-Funktion mehr in `index.html`.
- App-Lock-Buttons werden ausschlie�lich �ber `SupabaseAPI.bindAppLockButtons()` initialisiert; Inline-Duplikate entfernt.

Sanity
- Chart/Export-Flows setzen Freigabe �ber `SupabaseAPI.authGuardState` (pending + unlock), Doctor-Tab bleibt gesperrt bis Guard-API Erfolg meldet.
- ESC-Schlie�en des Lock-Overlays ruft `SupabaseAPI.lockUi(false)` (Fallback: DOM-Hide) und setzt Pending-Intents zur�ck.
- Realtime-Resume in `assets/js/supabase/realtime/index.js` f�hrt Refresh/Realtime-Setup/Focus-Fix identisch zum vormals inline Code aus.

Regression
- `bindAppLockButtons`, `requireDoctorUnlock` & Co. bleiben via `window` verf�gbar (Legacy Scripts wie `ui-tabs.js`).
- Diag-Logs (`[resume] ...`) erscheinen weiter bei Visibility/Focus-Resume; Cooldown/Race-Gates verhindern Doppel-Resume.
- Guard/Resume-APIs nutzen weiterhin `scheduleAuthGrace`, `requestUiRefresh`, `setupRealtime` etc., so dass bestehende Flows unver�ndert bleiben.
