
# Zeus Feedback-Engine — Funktionsspezifikation

## 1) Zielbild & Scope

* **Ziel:** Bei jeder **Abendmessung** (BP) automatisch Trends erkennen und unmittelbar Feedback geben.
* **Nicht-Ziel:** Starre Grenz-Polizei. Stattdessen **Trend-Detektion** + schwellenbasierte *Warnungen/Kritisch* mit Kontext.
* **Drei Ebenen der Wirkung:**

  1. **Capture:** Sofortiges Feedback (Banner/Toast). Bei Warnung/Kritisch Pflicht-Interaktion.
  2. **Arztansicht:** „System-Kommentare“ als eigene Zeilen mit Status („geplant“, „erledigt“).
  3. **Chart:** Zeitliche Markierung via **Balkenlayer** (gelb/rot), die den Zeitraum der Beobachtung visualisieren.

---

## 2) Datenmodell & Speicherstrategie

### 2.1 Bestehendes Schema (Supabase)

* Tabelle: `health_events`
* relevante Felder:

  * `id` (PK), `user_id`, `ts` (ISO), `day` (YYYY-MM-DD), `type`, `payload` (JSON), `ctx` (optional, z. B. „Morgen/Abend“)

### 2.2 Neuer Event-Typ

* **`type: "system_comment"`**
  Systemisch erzeugter Kommentar aus *Zeus*. Kein eigener Table nötig.

**JSON-Schema (Payload):**

```json
{
  "text": "⚠️ Leichter Aufwärtstrend – bitte beobachten.",
  "severity": "info|warning|critical|resolved",
  "ack": false,
  "doctorStatus": "none|planned|done",
  "metric": "bp",
  "context": {
    "window_days": 180,
    "method": "robust_baseline_hpfilter",
    "delta_sys": 6.5,
    "delta_dia": 3.2,
    "evidence": {
      "mean_sys_then": 122.1,
      "mean_sys_now": 128.6,
      "mean_dia_then": 79.9,
      "mean_dia_now": 83.1,
      "n_points": 48
    }
  }
}
```

> **Hinweis:** Keine dauerhafte „Trend-Label“-Spalte in der DB. Nur ein *Kommentar* wird geschrieben (oder aktualisiert), wenn es etwas zu sagen gibt. Bei **stable** -> optional nur UI-Feedback, kein DB-Eintrag.

---

## 3) Trigger & Workflow (Abendmessung)

**Nur** bei **Abend**-Messungen (`ctx === "Abend"`) wird die Analyse ausgeführt:

1. **User speichert BP-Abendmessung** (sys/dia/pulse, evtl. Gewicht, Kommentar).
2. **Normaler Save-Flow** → `health_events` wird geschrieben.
3. **Zeus-Analyse startet** (asynchron, aber im UI sichtbar; max. 2–3 s Budget):

   * Holt die letzten **180 Tage** BP-Daten (nur Messungen, keine Notes).
   * Reduziert auf **Wochenrepräsentanten** (z. B. Median pro Woche & Tageszeit) wegen seltener Messfrequenz (1–2/Woche).
   * Berechnet **robuste Baseline** + **Trend** (Details siehe Abschnitt 4).
   * Klassifiziert: `info | warning | critical`.
4. **Feedback erzeugen:**

   * `info` → optional „Alles gut 👌“ (UI-Toast), **kein** DB-Eintrag.
   * `warning` → System-Dialog + DB-`system_comment` (severity=`warning`, ack=false, doctorStatus=`none`).
   * `critical` → wie `warning`, aber severity=`critical`.
5. **User bestätigt** (Button „Zur Kenntnis genommen“):

   * `ack: true` Patch des selben `system_comment`.
6. **Später in Arztansicht:**

   * Buttons: **„Arztabklärung geplant“** (`doctorStatus: "planned"`), **„Abgeklärt“** (`doctorStatus: "done"`, `severity: "resolved"`).

---

## 4) Trend-Detektion (angepasst an 1–2/Woche)

### 4.1 Preprocessing

* Filter: letzte **180 Tage**, nur **Abend** (gleiches Kontextfenster wie Trigger).
* Grouping: **Woche** (ISO-Woche) × **ctx=Abend**
* Aggregation je Woche: **Median** von `sys` und `dia` (robust ggü. Ausreißern).
* Validierungsregeln:

  * mindestens **8 Wochen** mit Datenpunkten → sonst *no-op* (nur „info“ möglich).
  * letzte **2–3 Wochen** dürfen nicht komplett leer sein, sonst *info* (zu wenig Evidenz).

### 4.2 Baseline & Drift

* **Baseline**: robuste Regression auf 12–16 Wochen (Huber/LAD-ähnlich) **oder** HP-Filter (λ moderat), Ergebnis: *Baseline-Kurve*.
* **Aktueller Zustand**: Median der letzten 2 Wochen (oder letzte Messung, falls nur ein Punkt)
* **Drift**: `delta_sys = current_sys - baseline_sys_at_current`
  `delta_dia = current_dia - baseline_dia_at_current`

### 4.3 Klassifikation (konfigurierbar)

* `info` (stable): `delta_sys < +5` **UND** `delta_dia < +3`
* `warning`: `delta_sys ∈ [5, 10)` **ODER** `delta_dia ∈ [3, 6)`
* `critical`: `delta_sys ≥ 10` **ODER** `delta_dia ≥ 6`
* **Hysterese:** Eskalieren nur, wenn **2 aufeinanderfolgende Wochen** die Schwelle tragen; De-Eskalation erst nach **2 Wochen** unterer Klasse. Verhindert „Flip-Flop“.

> **Hinweis:** Starre ESC-Grenzen bleiben als **visuelle Referenz** (rote, gestrichelte 130/90), beeinflussen aber die Trend-Logik nicht direkt. Punkte oberhalb werden rot gerendert (wie bisher).

---

## 5) UI/UX-Verhalten

### 5.1 Capture (nach Save)

* **info:** unobtrusiver Toast („Stabil – weitermachen.“)
* **warning:** Dialog mit Text + Button „Zur Kenntnis genommen“ (schreibt `system_comment` mit `ack=true`)
* **critical:** gleich wie warning, aber farblich deutlicher; zusätzlicher Button „Arzttermin planen“ (öffnet Juno, optional)

### 5.2 Arztansicht (Liste)

* Eigene Zeilen für `type=system_comment`:

  * Linke Spalte: Datum + Löschen-Icon
  * Mittlere Spalte: Text + Badge (warning/critical/resolved)
  * Rechte Spalte: **Buttons**

    * „Arztabklärung geplant“ → `doctorStatus="planned"`, `ack=true`
    * „Abgeklärt“ → `doctorStatus="done"`, `severity="resolved"`
    * „Löschen“ → löscht *nur* den `system_comment`
* Filter/Sort: Standard wie Messungen; `system_comment` bleiben normal sortierbar.

### 5.3 Chart (SVG/Canvas)

* **Balkenlayer** über voller Breite für Zeiträume:

  * `warning`: gelb (semtransparent)
  * `critical`: rot (semtransparent)
  * `resolved`: grünlich, transparent
* **Punktfarbe** bleibt wie bisher (ausgewähltes Theme), bei Überschreitung ESC-Linien → Punkt rot.
* Tooltip-Erweiterung beim Hover:

  * zeigt Sys/Dia/MAP + Kommentar (falls am selben Tag existiert)
  * zeigt drift-Info: `Δsys=+6, Δdia=+3` (optional)

---

## 6) Zeus-Antworten (LLM-Seite)

### 6.1 Eingabe (Prompt an Zeus)

```json
{
  "user_id": "<uuid>",
  "day": "2025-11-13",
  "ctx": "Abend",
  "current": { "sys": 129, "dia": 83 },
  "series": [
    { "day": "2025-07-01", "sys": 120, "dia": 78 },
    ...
  ],
  "params": { "window_days": 180, "class_thresholds": { "sys": [5,10], "dia": [3,6] } }
}
```

### 6.2 Ausgabe (LLM-Response, direkt verwendbar)

```json
{
  "severity": "warning",
  "short_msg": "Leichter Aufwärtstrend erkennbar.",
  "long_msg": "Über 180 Tage zeigt SYS +6, DIA +3 gegenüber der robusten Basislinie. Empfehlung: beobachten, in 2–3 Wochen gegenchecken.",
  "context": {
    "window_days": 180,
    "delta_sys": 6,
    "delta_dia": 3,
    "confidence": 0.74
  }
}
```

* **UI-Text-Mapping:**

  * `info`: „Alles stabil. Gute Arbeit.“
  * `warning`: „Leichter Aufwärtstrend – bitte im Auge behalten.“
  * `critical`: „Deutlicher Anstieg – ärztliche Abklärung empfohlen.“

> **Wichtig:** Auch ohne LLM kann die Basis-Klassifikation lokal erfolgen. LLM ist für *formuliertes Feedback* & „soft“-Kontext nützlich.

---

## 7) API-Calls & Flows (Supabase)

### 7.1 Event anlegen (POST)

* Wenn `warning`/`critical`:
  `POST /rest/v1/health_events` mit `type="system_comment"`
  Body: oben beschriebenes Payload
* Wenn `info`: kein DB-Write (nur UI-Feedback)

### 7.2 Patch bei Statuswechsel

* `PATCH /rest/v1/health_events?id=eq.<system_comment_id>`
  Änderungen: `ack`, `doctorStatus`, ggf. `severity="resolved"` beim Abschluss

### 7.3 Fehlerfälle

* 409 Duplicate: Bei gleichem `day` schon `system_comment`? → **aktualisieren** (PATCH) statt POST.
* Netzwerkfehler: UI-Warnung, *kein* Blocken der normalen Messung.

---

## 8) Pseudocode (Speichern-Hook)

```js
async function onSaveEveningBp({ sys, dia, day }) {
  // 1) Normal speichern
  await saveHealthEvent({ type: 'bp', ctx: 'Abend', day, payload: { sys, dia } });

  // 2) Analyse-Daten holen
  const series = await fetchBpSeries({ from: dayMinus(180), to: day, ctx: 'Abend' });

  // 3) Trend berechnen
  const trend = computeTrend(series, { windowDays: 180 });
  const severity = classify(trend.deltaSys, trend.deltaDia);

  // 4) UI + DB-Reaktion
  if (severity === 'info') {
    toast('Stabil – weiter so.');
    return;
  }

  const text = severity === 'warning'
    ? 'Leichter Aufwärtstrend – bitte beobachten.'
    : 'Deutlicher Anstieg – ärztliche Abklärung empfohlen.';

  // create or update system_comment
  const existing = await findSystemCommentForDay(day);
  if (existing) {
    await patchSystemComment(existing.id, { payload: { ...existing.payload, text, severity, ack: false } });
  } else {
    await postSystemComment({
      day,
      payload: {
        text, severity, ack: false, doctorStatus: 'none',
        metric: 'bp',
        context: {
          window_days: 180,
          method: 'robust_baseline_hpfilter',
          delta_sys: trend.deltaSys,
          delta_dia: trend.deltaDia,
          evidence: trend.evidence
        }
      }
    });
  }

  // Pflicht-Dialog
  await showAckDialog({ text, severity }); // setzt ack=true bei Bestätigung
}
```

---

## 9) Konfigurierbarkeit

* **Fenstergröße**: `window_days` (default 180)
* **Schwellen**: `sys: [5,10]`, `dia: [3,6]`
* **Hysterese**: `confirm_weeks=2`
* **LLM on/off**: `zeus.enabled`
* **Feedback bei „info“**: `zeus.info_feedback = minimal|none`

---

## 10) Performance & Robustheit

* Serienabruf *nur* 180 Tage, *nur Abend*.
* Aggregation auf Wochen reduziert Datenpunkte stark.
* Trendfunktion idempotent, defensiv bei fehlenden Daten → `info`.
* **Timeouts:** LLM max. 1500 ms; fällt zurück auf lokale Klassifikation.

---

## 11) Privacy & Security

* Keine PII im LLM-Prompt (nur interne IDs/Maskierung).
* `system_comment` klar als `origin: "Zeus"` markiert (Transparenz).
* Nutzer kann `system_comment` **löschen**; Messwerte bleiben unangetastet.

---

## 12) Tests & QA (Kurz)

* Unit: `computeTrend`, `classify`, Hysterese-Logik.
* Integration: „Abend speichern“ → `system_comment` entsteht/patcht.
* UI: Dialogpflicht, Buttons in Arztansicht, Chart-Balken-Layer.
* Edge Cases: wenig Daten (<8 Wochen), LLM-Timeout, doppelte Kommentare am selben Tag.

---

## 13) Roadmap-Haken

* Umsetzung **nach** OpenAI-API-Einbindung.
* Start nur für **BP**; spätere Ausweitung für Apollon (Trainings-Trends) optional.
* Flags/Termin-Altlasten sind bereits auf dem Entfern-Pfad → sauberes Feld.

---

### Kurzfazit

Du bekommst ein **smartes, sanftes Frühwarnsystem**: Es **warnt**, **fordert Interaktion**, **lässt dich den Arztweg dokumentieren** und **zeichnet die Story** im Chart nach. Keine starren Keulen, sondern kontextbezogene Hilfe — genau so, wie du’s wolltest.
