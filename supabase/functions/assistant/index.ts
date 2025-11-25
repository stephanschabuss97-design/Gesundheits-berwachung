## 2️⃣ Supabase Edge Function: `supabase/functions/midas-assistant/index.ts`

### 2.1 Ordner anlegen

Im Projekt-Root (da wo `sql` und `docs` liegen):

```bash
# Wenn noch kein supabase Ordner existiert:
mkdir -p supabase/functions/midas-assistant

// supabase/functions/midas-assistant/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// CORS-Header (damit dein Browser von GitHub Pages / deiner Domain zugreifen darf)
const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*", // später gern einschränken auf deine Domain
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

// ---- Hilfsfunktion: System Prompt für MIDAS laden (Kurzversion) ----
const MIDAS_SYSTEM_PROMPT = `
Du bist MIDAS, der persönliche Gesundheits-Assistent von Stephan Schabuß.

- Du kennst seine Module: Intakes (Wasser, Salz, Protein), Blutdruck, Körperwerte, Termine, Training.
- Du arbeitest kurz, klar und pragmatisch – keine Romane.
- Dein Fokus: Eintragungen vorbereiten, Werte einordnen, einen nächsten sinnvollen Schritt vorschlagen.
- Du bist kein Arzt. Du gibst keine Diagnosen und keine Therapie-Anweisungen.
- Wenn nötig, erinnerst du Stephan daran, bei medizinischen Sorgen seine behandelnden Ärzt:innen zu kontaktieren.

Antwort-Format für den Client:
- "reply": kurzer deutscher Text für Stephan.
- Du kannst optional "actions" vorschlagen (z.B. add_intake_water, log_blood_pressure),
  aber in dieser ersten Version lassen wir die Aktionen noch leer.
`.trim();

// ---- Haupt-Handler der Edge Function ----
Deno.serve(async (req) => {
  // Preflight für CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed, use POST" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (!OPENAI_API_KEY) {
    console.error("[midas-assistant] OPENAI_API_KEY not set");
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = await req.json().catch(() => ({} as any));

    const {
      session_id = "unknown-session",
      mode = "text",
      messages = [],
      context = null,
    } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing 'messages' array" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ---- 1) OpenAI-Messages zusammenbauen ----
    const chatMessages: any[] = [];

    // System Prompt
    chatMessages.push({
      role: "system",
      content: MIDAS_SYSTEM_PROMPT,
    });

    // App-Kontext als zusätzliche System-Nachricht (falls vorhanden)
    if (context) {
      chatMessages.push({
        role: "system",
        content:
          "Hier ist der aktuelle MIDAS-Kontext als JSON. Verwende ihn für deine Einschätzung, aber wiederhole ihn nicht wörtlich:\n" +
          JSON.stringify(context),
      });
    }

    // User + Assistant Messages aus der Session
    for (const m of messages) {
      if (m && (m.role === "user" || m.role === "assistant")) {
        chatMessages.push({
          role: m.role,
          content: m.content,
        });
      }
    }

    // ---- 2) OpenAI Aufruf ----
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini", // später anpassbar
        messages: chatMessages,
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!openaiRes.ok) {
      const errorText = await openaiRes.text();
      console.error("[midas-assistant] OpenAI error:", errorText);
      return new Response(
        JSON.stringify({ error: "OpenAI request failed", details: errorText }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const completion = await openaiRes.json();
    const choice = completion.choices?.[0];
    const content = choice?.message?.content ?? "";

    const reply =
      typeof content === "string"
        ? content
        : Array.isArray(content)
        ? content.map((c: any) => c.text ?? "").join("\n")
        : "";

    const responsePayload = {
      reply,
      actions: [], // in dieser ersten Version noch leer – später füllen wir das mit echten Actions
      meta: {
        model: completion.model,
        finish_reason: choice?.finish_reason ?? null,
        session_id,
        mode,
      },
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[midas-assistant] Unexpected error:", err);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
