# MIDAS Assistant Endpoint Spec (`midas-assistant` – Supabase Edge Function)

## URL & Method

- **URL (Beispiel):** `https://<DEIN_PROJECT>.supabase.co/functions/v1/midas-assistant`
- **Method:** `POST`
- **Auth:** später via Supabase-JWT oder Service-Key (TODO)

---

## Request (vom MIDAS-Frontend / Session-Agent)

Content-Type: `application/json`

```jsonc
{
  "session_id": "midas-session-123",
  "mode": "text",               // oder "voice"
  "messages": [
    { "role": "user", "content": "Trag 500 ml Wasser ein" },
    { "role": "assistant", "content": "…" }
  ],
  "context": {
    "today": {
      "water_ml": 1130,
      "salt_g": 2.4,
      "protein_g": 53.4
    },
    "latest_bp": {
      "systolic": 128,
      "diastolic": 82,
      "pulse": 68
    }
  }
}
session_id → ID der aktuellen Assistenten-Session.

mode → "text" oder "voice" (nur Info für die KI).

messages → Verlauf dieser Session (User + Assistant).

context → optionaler App-Kontext (heutige Werte etc.).

Response (zurück an Session-Agent)
jsonc
Copy code
{
  "reply": "Alles klar, ich habe 500 ml Wasser für heute eingeplant.",
  "actions": [
    {
      "type": "add_intake_water",
      "payload": {
        "amount_ml": 500,
        "timestamp": "2025-11-25T06:45:00Z",
        "source": "assistant"
      }
    }
  ],
  "meta": {
    "model": "gpt-4.1-mini",
    "finish_reason": "stop",
    "session_id": "midas-session-123",
    "mode": "text"
  }
}
reply → Was MIDAS im UI/Voice sagen soll.

actions → Liste von Aktionen, die dein actions.js dann ausführt.

meta → Debug / Infos, optional.

Bei Fehler:

jsonc
Copy code
{
  "error": "Something went wrong",
  "details": "..."
}
yaml
Copy code

Damit ist dokumentiert, was dein Frontend schickt und was es zurückbekommt.