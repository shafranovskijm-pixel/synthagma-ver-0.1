import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Split text into chunks at sentence boundaries, each ≤ maxLen characters.
 */
function splitTextIntoChunks(text: string, maxLen = 4500): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Find the last sentence-ending punctuation within maxLen
    let splitAt = -1;
    for (let i = maxLen; i >= maxLen * 0.5; i--) {
      const ch = remaining[i];
      if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
        splitAt = i + 1;
        break;
      }
    }

    // Fallback: split at last space
    if (splitAt === -1) {
      for (let i = maxLen; i >= maxLen * 0.5; i--) {
        if (remaining[i] === ' ') {
          splitAt = i + 1;
          break;
        }
      }
    }

    // Last resort: hard cut
    if (splitAt === -1) splitAt = maxLen;

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Generate TTS audio for a single chunk, with optional stitching context.
 */
async function generateChunk(
  text: string,
  voiceId: string,
  apiKey: string,
  previousText?: string,
  nextText?: string,
): Promise<ArrayBuffer> {
  const body: Record<string, unknown> = {
    text,
    model_id: "eleven_multilingual_v2",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
      speed: 1.0,
    },
  };

  // Request stitching: provide context from adjacent chunks
  if (previousText) body.previous_text = previousText.slice(-300);
  if (nextText) body.next_text = nextText.slice(0, 300);

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("ElevenLabs chunk error:", response.status, errorText);

    if (response.status === 401 && errorText.includes("detected_unusual_activity")) {
      throw new Error("UNUSUAL_ACTIVITY");
    }
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  return response.arrayBuffer();
}

/**
 * Concatenate multiple MP3 buffers.
 * MP3 frames are independently decodable, so simple concatenation works.
 */
function concatBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLen = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const buf of buffers) {
    result.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return result.buffer;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceId = "JBFqnCBsd6RMkjVDRZzb" } = await req.json();
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

    if (!ELEVENLABS_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_API_KEY не настроен" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Текст для озвучки не указан" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const chunks = splitTextIntoChunks(text.trim(), 4500);
    console.log(`TTS: ${text.length} chars → ${chunks.length} chunk(s)`);

    if (chunks.length === 1) {
      // Single chunk — simple path, no stitching needed
      const audioBuffer = await generateChunk(chunks[0], voiceId, ELEVENLABS_API_KEY);
      return new Response(audioBuffer, {
        headers: { ...corsHeaders, "Content-Type": "audio/mpeg" },
      });
    }

    // Multiple chunks — generate sequentially with stitching context
    const audioBuffers: ArrayBuffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const prev = i > 0 ? chunks[i - 1] : undefined;
      const next = i < chunks.length - 1 ? chunks[i + 1] : undefined;
      console.log(`TTS chunk ${i + 1}/${chunks.length}: ${chunks[i].length} chars`);
      const buf = await generateChunk(chunks[i], voiceId, ELEVENLABS_API_KEY, prev, next);
      audioBuffers.push(buf);
    }

    const combined = concatBuffers(audioBuffers);
    console.log(`TTS: combined ${audioBuffers.length} chunks → ${combined.byteLength} bytes`);

    return new Response(combined, {
      headers: { ...corsHeaders, "Content-Type": "audio/mpeg" },
    });
  } catch (error) {
    console.error("TTS error:", error);

    if (error instanceof Error && error.message === "UNUSUAL_ACTIVITY") {
      return new Response(
        JSON.stringify({
          error:
            "Озвучка временно недоступна: ElevenLabs отключил Free Tier (detected_unusual_activity). Попробуйте без VPN/прокси или используйте платный тариф.",
          provider_status: 401,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Неизвестная ошибка" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
