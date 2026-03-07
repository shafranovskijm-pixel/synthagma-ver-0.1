import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// SaluteSpeech voices (Russian)
const VOICES: Record<string, string> = {
  natalya: "Nec_24000",   // Наталья — женский, нейтральный
  boris: "Bys_24000",     // Борис — мужской, нейтральный  
  marfa: "May_24000",     // Марфа — женский, молодой
  taras: "Tur_24000",     // Тарас — мужской, молодой
  alexandr: "Ost_24000",  // Александр — мужской, старший
  sergey: "Pon_24000",    // Сергей — мужской
  kira: "Kir_24000",      // Кира — женский
};

async function getAccessToken(authKey: string): Promise<string> {
  const rqUID = crypto.randomUUID();

  const response = await fetch("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      RqUID: rqUID,
      Authorization: `Basic ${authKey}`,
    },
    body: "scope=SALUTE_SPEECH_PERS",
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Auth error:", response.status, errorText);
    throw new Error(`SaluteSpeech auth failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice = "natalya", format = "opus" } = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (text.length > 4000) {
      return new Response(JSON.stringify({ error: "Text exceeds 4000 character limit" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authKey = Deno.env.get("SALUTESPEECH_AUTH_KEY");
    if (!authKey) {
      throw new Error("SALUTESPEECH_AUTH_KEY is not configured");
    }

    // Step 1: Get access token
    const accessToken = await getAccessToken(authKey);

    // Step 2: Synthesize speech
    const voiceParam = VOICES[voice] || VOICES.natalya;
    
    const contentType = format === "wav16" 
      ? "audio/x-wav" 
      : format === "pcm16" 
        ? "audio/x-pcm;bit=16;rate=24000" 
        : "audio/ogg;codecs=opus";

    const synthesisResponse = await fetch(
      "https://smartspeech.sber.ru/rest/v1/text:synthesize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/text",
          "Audio-Encoding": format === "wav16" ? "wav16" : format === "pcm16" ? "pcm16" : "opus",
          "Voice-Name": voiceParam,
        },
        body: text,
      }
    );

    if (!synthesisResponse.ok) {
      const errorText = await synthesisResponse.text();
      console.error("Synthesis error:", synthesisResponse.status, errorText);
      return new Response(JSON.stringify({ error: "Speech synthesis failed", details: errorText }), {
        status: synthesisResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audioBuffer = await synthesisResponse.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("SaluteSpeech TTS error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
