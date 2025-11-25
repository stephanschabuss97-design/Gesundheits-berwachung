1️ Spec: docs/assistant/Assistant_Actions_Spec.md

Pack das z. B. in docs/assistant/Assistant_Actions_Spec.md:

# MIDAS Assistant – Actions Spec (v0.1)

Dieses Dokument definiert, welche Aktionen die In-App-KI auslösen darf
und wie das JSON-Format aussieht, das der Backend-Endpoint an den Client zurückgibt.

Der Assistant-Endpoint (`/api/midas-assistant`) antwortet immer im Format:

```json
{
  "reply": "Kurze natürliche Antwort an Stephan.",
  "actions": [
    {
      "type": "add_intake_water",
      "payload": { "amount_ml": 350 }
    }
  ],
  "meta": {
    "session_id": "…",
    "model": "…"
  }
}


actions ist optional. Wenn keine Aktionen nötig sind, kann es fehlen oder ein leeres Array sein.

1. Action-Grundschema
{
  "type": "<string>",
  "payload": { /* action-spezifisch */ }
}


type: Name der Aktion (snake_case)

payload: Objekt mit den benötigten Parametern

Alle Actions sind idempotent gedacht – doppelte Ausführung sollte nach Möglichkeit nicht gefährlich sein
(z. B. eher „ein zusätzliches Intake-Item“ als „bestehende Tageswerte hart überschreiben“).

2. Unterstützte Actions (v0.1)
2.1 add_intake_water

Zweck: Wasser-Intake für heute ergänzen.

{
  "type": "add_intake_water",
  "payload": {
    "amount_ml": 350,
    "note": "optional, Freitext"
  }
}


amount_ml (Number, required) – positive Menge in Millilitern

note (String, optional) – kurzer Kommentar (z. B. „mit Mittagessen“)

2.2 add_intake_custom

Zweck: Beliebigen Intake-Eintrag hinzufügen (z. B. Mahlzeit, Snack).

{
  "type": "add_intake_custom",
  "payload": {
    "label": "Hühnersalat mit Brot",
    "water_ml": 0,
    "salt_g": 1.2,
    "protein_g": 35,
    "carbs_g": 20,
    "fat_g": 10,
    "category": "dinner",          
    "note": "optional"
  }
}


Alle Felder außer label sind optional; nicht gesetzte Werte werden als 0 behandelt.

2.3 log_blood_pressure

Zweck: Blutdruck-Eintrag speichern.

{
  "type": "log_blood_pressure",
  "payload": {
    "systolic": 122,
    "diastolic": 78,
    "heart_rate": 68,
    "context": "morning_rest",      
    "note": "nach dem Aufstehen"
  }
}


systolic (Number, required)

diastolic (Number, required)

heart_rate (Number, optional)

context (String, optional, z. B. morning_rest, evening, post_exercise)

note (String, optional)

2.4 log_body_metrics

Zweck: Körperdaten (Gewicht etc.) speichern.

{
  "type": "log_body_metrics",
  "payload": {
    "weight_kg": 83.4,
    "waist_cm": 94,
    "body_fat_pct": 22.1,
    "muscle_pct": 36.5,
    "note": "8-Punkt-BIA, nüchtern"
  }
}


Alle Felder optional; wenigstens ein Messwert sollte vorhanden sein.

2.5 add_note

Zweck: Freie Notiz / Ereignis (z. B. Stress, Symptom, Remark).

{
  "type": "add_note",
  "payload": {
    "category": "symptom",        
    "title": "Kurzes Herzstolpern",
    "text": "Beim Stiegensteigen kurz Herzklopfen bemerkt.",
    "severity": "low"             
  }
}


category: symptom | stress | info | other

severity: optional, z. B. low, medium, high

2.6 schedule_appointment

Zweck: Einen neuen Termin in MIDAS anlegen (z. B. Arztbesuch).

{
  "type": "schedule_appointment",
  "payload": {
    "date": "2025-01-16",
    "time": "08:30",
    "kind": "internist_checkup",
    "label": "Gesundenuntersuchung",
    "note": "Laborwerte mitnehmen"
  }
}

2.7 show_info_message (rein UI, keine Datenänderung)

Zweck: Der KI erlauben, nur eine Info / Bestätigung als „System-Toast“ oder Banner zu setzen.

{
  "type": "show_info_message",
  "payload": {
    "level": "info",
    "text": "Ich habe deine Werte gespeichert. Schau dir im Trendpilot die Entwicklung der letzten Woche an."
  }
}


level: info | success | warning | error

3. Fehlerfall

Wenn der Client eine Action nicht kennt oder nicht ausführen kann, sollte er:

nichts kaputtmachen

einen internen Log-Eintrag schreiben

optional eine neutrale Rückmeldung anzeigen („Aktion konnte nicht ausgeführt werden“)

4. Zukunft

Später können wir weitere Action-Typen ergänzen:

suggest_intake_adjustment

suggest_training_session

flag_value_for_doctor

compute_weekly_summary

Wichtig: bestehende Action-Namen nicht brechen – lieber neue Typen einführen.