import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Russian Trusted Root CA (Минцифры)
const RUSSIAN_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIFwjCCA6qgAwIBAgICEAAwDQYJKoZIhvcNAQELBQAwcDELMAkGA1UEBhMCUlUx
PzA9BgNVBAoMNlRoZSBNaW5pc3RyeSBvZiBEaWdpdGFsIERldmVsb3BtZW50IGFu
ZCBDb21tdW5pY2F0aW9uczEgMB4GA1UEAwwXUnVzc2lhbiBUcnVzdGVkIFJvb3Qg
Q0EwHhcNMjIwMzAxMjEwNDE1WhcNMzIwMjI3MjEwNDE1WjBwMQswCQYDVQQGEwJS
VTE/MD0GA1UECgw2VGhlIE1pbmlzdHJ5IG9mIERpZ2l0YWwgRGV2ZWxvcG1lbnQg
YW5kIENvbW11bmljYXRpb25zMSAwHgYDVQQDDBdSdXNzaWFuIFRydXN0ZWQgUm9v
dCBDQTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAMfFOZ8pUAL3+r2n
qqE0Zp52selXsKGFYoG0GM5bwz1bSFtCt+AZQMhkWQheI3poZAToYJu69pHLKS6Q
XBiwBC1cvzYmUYKMYZC7jE5YhEU2bSL0mX7NaMxMDmH2/NwuOVRj8OImVa5s1F4U
zn4Kv3PFlDBjjSjXKVY9kmjUBsXQrIHeaqmUIsPIlNWUnimXS0I0abExqkbdrXbX
YwCOXhOO2pDUx3ckmJlCMUGacUTnylyQW2VsJIyIGA8V0xzdaeUXg0VZ6ZmNUr5Y
Ber/EAOLPb8NYpsAhJe2mXjMB/J9HNsoFMBFJ0lLOT/+dQvjbdRZoOT8eqJpWnVD
U+QL/qEZnz57N88OWM3rabJkRNdU/Z7x5SFIM9FrqtN8xewsiBWBI0K6XFuOBOTD
4V08o4TzJ8+Ccq5XlCUW2L48pZNCYuBDfBh7FxkB7qDgGDiaftEkZZfApRg2E+M9
G8wkNKTPLDc4wH0FDTijhgxR3Y4PiS1HL2Zhw7bD3CbslmEGgfnnZojNkJtcLeBH
BLa52/dSwNU4WWLubaYSiAmA9IUMX1/RpfpxOxd4Ykmhz97oFbUaDJFipIggx5sX
ePAlkTdWnv+RWBxlJwMQ25oEHmRguNYf4Zr/Rxr9cS93Y+mdXIZaBEE0KS2iLRqa
OiWBki9IMQU4phqPOBAaG7A+eP8PAgMBAAGjZjBkMB0GA1UdDgQWBBTh0YHlzlpf
BKrS6badZrHF+qwshzAfBgNVHSMEGDAWgBTh0YHlzlpfBKrS6badZrHF+qwshzAS
BgNVHRMBAf8ECDAGAQH/AgEEMA4GA1UdDwEB/wQEAwIBhjANBgkqhkiG9w0BAQsF
AAOCAgEAALIY1wkilt/urfEVM5vKzr6utOeDWCUczmWX/RX4ljpRdgF+5fAIS4vH
tmXkqpSCOVeWUrJV9QvZn6L227ZwuE15cWi8DCDal3Ue90WgAJJZMfTshN4OI8cq
W9E4EG9wglbEtMnObHlms8F3CHmrw3k6KmUkWGoa+/ENmcVl68u/cMRl1JbW2bM+
/3A+SAg2c6iPDlehczKx2oa95QW0SkPPWGuNA/CE8CpyANIhu9XFrj3RQ3EqeRcS
AQQod1RNuHpfETLU/A2gMmvn/w/sx7TB3W5BPs6rprOA37tutPq9u6FTZOcG1Oqj
C/B7yTqgI7rbyvox7DEXoX7rIiEqyNNUguTk/u3SZ4VXE2kmxdmSh3TQvybfbnXV
4JbCZVaqiZraqc7oZMnRoWrXRG3ztbnbes/9qhRGI7PqXqeKJBztxRTEVj8ONs1d
WN5szTwaPIvhkhO3CO5ErU2rVdUr89wKpNXbBODFKRtgxUT70YpmJ46VVaqdAhOZ
D9EUUn4YaeLaS8AjSF/h7UkjOibNc4qVDiPP+rkehFWM66PVnP1Msh93tc+taIfC
EYVMxjh8zNbFuoc7fzvvrFILLe7ifvEIUqSVIC/AzplM/Jxw7buXFeGP1qVCBEHq
391d/9RAfaZ12zkwFsl+IKwE/OZxW8AHa9i1p4GO0YSNuczzEm4=
-----END CERTIFICATE-----`;

const RUSSIAN_SUB_CA = `-----BEGIN CERTIFICATE-----
MIIHQjCCBSqgAwIBAgICEAIwDQYJKoZIhvcNAQELBQAwcDELMAkGA1UEBhMCUlUx
PzA9BgNVBAoMNlRoZSBNaW5pc3RyeSBvZiBEaWdpdGFsIERldmVsb3BtZW50IGFu
ZCBDb21tdW5pY2F0aW9uczEgMB4GA1UEAwwXUnVzc2lhbiBUcnVzdGVkIFJvb3Qg
Q0EwHhcNMjIwMzAyMTEyNTE5WhcNMjcwMzA2MTEyNTE5WjBvMQswCQYDVQQGEwJS
VTE/MD0GA1UECgw2VGhlIE1pbmlzdHJ5IG9mIERpZ2l0YWwgRGV2ZWxvcG1lbnQg
YW5kIENvbW11bmljYXRpb25zMR8wHQYDVQQDDBZSdXNzaWFuIFRydXN0ZWQgU3Vi
IENBMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA9YPqBKOk19NFymrE
wehzrhBEgT2atLezpduB24mQ7CiOa/HVpFCDRZzdxqlh8drku408/tTmWzlNH/br
HuQhZ/miWKOf35lpKzjyBd6TPM23uAfJvEOQ2/dnKGGJbsUo1/udKSvxQwVHpVv3
S80OlluKfhWPDEXQpgyFqIzPoxIQTLZ0deirZwMVHarZ5u8HqHetRuAtmO2ZDGQn
vVOJYAjls+Hiueq7Lj7Oce7CQsTwVZeP+XQx28PAaEZ3y6sQEt6rL06ddpSdoTMp
BnCqTbxW+eWMyjkIn6t9GBtUV45yB1EkHNnj2Ex4GwCiN9T84QQjKSr+8f0psGrZ
vPbCbQAwNFJjisLixnjlGPLKa5vOmNwIh/LAyUW5DjpkCx004LPDuqPpFsKXNKpa
L2Dm6uc0x4Jo5m+gUTVORB6hOSzWnWDj2GWfomLzzyjG81DRGFBpco/O93zecsIN
3SL2Ysjpq1zdoS01CMYxie//9zWvYwzI25/OZigtnpCIrcd2j1Y6dMUFQAzAtHE+
qsXflSL8HIS+IJEFIQobLlYhHkoE3avgNx5jlu+OLYe0dF0Ykx1PGNjbwqvTX37R
Cn32NMjlotW2QcGEZhDKj+3urZizp5xdTPZitA+aEjZM/Ni71VOdiOP0igbw6asZ
2fxdozZ1TnSSYNYvNATwthNmZysCAwEAAaOCAeUwggHhMBIGA1UdEwEB/wQIMAYB
Af8CAQAwDgYDVR0PAQH/BAQDAgGGMB0GA1UdDgQWBBTR4XENCy2BTm6KSo9MI7NM
XqtpCzAfBgNVHSMEGDAWgBTh0YHlzlpfBKrS6badZrHF+qwshzCBxwYIKwYBBQUH
AQEEgbowgbcwOwYIKwYBBQUHMAKGL2h0dHA6Ly9yb3N0ZWxlY29tLnJ1L2NkcC9y
b290Y2Ffc3NsX3JzYTIwMjIuY3J0MDsGCCsGAQUFBzAChi9odHRwOi8vY29tcGFu
eS5ydC5ydS9jZHAvcm9vdGNhX3NzbF9yc2EyMDIyLmNydDA7BggrBgEFBQcwAoYv
aHR0cDovL3JlZXN0ci1wa2kucnUvY2RwL3Jvb3RjYV9zc2xfcnNhMjAyMi5jcnQw
gbAGA1UdHwSBqDCBpTA1oDOgMYYvaHR0cDovL3Jvc3RlbGVjb20ucnUvY2RwL3Jv
b3RjYV9zc2xfcnNhMjAyMi5jcmwwNaAzoDGGL2h0dHA6Ly9jb21wYW55LnJ0LnJ1
L2NkcC9yb290Y2Ffc3NsX3JzYTIwMjIuY3JsMDWgM6Axhi9odHRwOi8vcmVlc3Ry
LXBraS5ydS9jZHAvcm9vdGNhX3NzbF9yc2EyMDIyLmNybDANBgkqhkiG9w0BAQsF
AAOCAgEARBVzZls79AdiSCpar15dA5Hr/rrT4WbrOfzlpI+xrLeRPrUG6eUWIW4v
Sui1yx3iqGLCjPcKb+HOTwoRMbI6ytP/ndp3TlYua2advYBEhSvjs+4vDZNwXr/D
anbwIWdurZmViQRBDFebpkvnIvru/RpWud/5r624Wp8voZMRtj/cm6aI9LtvBfT9
cfzhOaexI/99c14dyiuk1+6QhdwKaCRTc1mdfNQmnfWNRbfWhWBlK3h4GGE9JK33
Gk8ZS8DMrkdAh0xby4xAQ/mSWAfWrBmfzlOqGyoB1U47WTOeqNbWkkoAP2ys94+s
Jg4NTkiDVtXRF6nr6fYi0bSOvOFg0IQrMXO2Y8gyg9ARdPJwKtvWX8VPADCYMiWH
h4n8bZokIrImVKLDQKHY4jCsND2HHdJfnrdL2YJw1qFskNO4cSNmZydw0Wkgjv9k
F+KxqrDKlB8MZu2Hclph6v/CZ0fQ9YuE8/lsHZ0Qc2HyiSMnvjgK5fDc3TD4fa8F
E8gMNurM+kV8PT8LNIM+4Zs+LKEV8nqRWBaxkIVJGekkVKO8xDBOG/aN62AZKHOe
GcyIdu7yNMMRihGVZCYr8rYiJoKiOzDqOkPkLOPdhtVlgnhowzHDxMHND/E2WA5p
ZHuNM/m0TXt2wTTPL7JH2YC0gPz/BvvSzjksgzU5rLbRyUKQkgU=
-----END CERTIFICATE-----`;

function createSberHttpClient(): Deno.HttpClient | undefined {
  try {
    // @ts-ignore
    if (typeof Deno.createHttpClient === "function") {
      // @ts-ignore
      return Deno.createHttpClient({
        caCerts: [RUSSIAN_ROOT_CA, RUSSIAN_SUB_CA],
      });
    }
  } catch (e) {
    console.warn("[generate-image] Failed to create HTTP client with Russian CA:", e);
  }
  return undefined;
}

const sberHttpClient = createSberHttpClient();

// --- Timeout-aware fetch wrapper ---
async function fetchWithTimeout(url: string, opts: RequestInit & { client?: any }, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function generateWithGigaChat(prompt: string, keySlot?: string) {
  const envKey = keySlot === "KEY_2" ? "GIGACHAT_AUTH_KEY_2" : keySlot === "KEY_3" ? "GIGACHAT_AUTH_KEY_3" : "GIGACHAT_AUTH_KEY";
  const authKey = Deno.env.get(envKey);
  if (!authKey) throw { status: 500, message: `${envKey} is not configured` };

  const STEP_TIMEOUT = 45000; // 45s per network step (auth + image download)

  // Step 1: Get access token
  const tokenFetchOpts: RequestInit & { client?: Deno.HttpClient } = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${authKey}`,
      RqUID: crypto.randomUUID(),
    },
    body: "scope=GIGACHAT_API_PERS",
  };
  if (sberHttpClient) (tokenFetchOpts as any).client = sberHttpClient;

  const tokenRes = await fetchWithTimeout("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", tokenFetchOpts, STEP_TIMEOUT);

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("GigaChat auth error:", tokenRes.status, text);
    throw { status: tokenRes.status, message: `GigaChat auth error: ${tokenRes.status}` };
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    throw { status: 502, message: "GigaChat auth error: no access token" };
  }

  // Step 2: Ask GigaChat to generate an image via chat completions (longer timeout — generation is slow)
  const chatFetchOpts: RequestInit & { client?: Deno.HttpClient } = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      model: "GigaChat",
      messages: [
        {
          role: "user",
          content: `Нарисуй фотореалистичное изображение: ${prompt}. Требования: БЕЗ текста и надписей на изображении, один главный объект или сцена, чистая композиция, высокое качество, подходящее для учебного материала.`,
        },
      ],
      function_call: "auto",
    }),
  };
  if (sberHttpClient) (chatFetchOpts as any).client = sberHttpClient;

  const chatRes = await fetchWithTimeout("https://gigachat.devices.sberbank.ru/api/v1/chat/completions", chatFetchOpts, 120000);

  if (!chatRes.ok) {
    const text = await chatRes.text();
    console.error("GigaChat generation error:", chatRes.status, text);
    throw { status: chatRes.status, message: `GigaChat generation error: ${chatRes.status}` };
  }

  const chatData = await chatRes.json();
  const content = chatData.choices?.[0]?.message?.content || "";

  // Extract image file_id from the response (format: <img src="file_id" .../>)
  const fileIdMatch = content.match(/<img\s+src="([^"]+)"/);
  if (!fileIdMatch) {
    console.error("GigaChat response has no image:", content);
    throw { status: 502, message: "GigaChat не сгенерировал изображение" };
  }

  const fileId = fileIdMatch[1];

  // Step 3: Download the image by file_id
  const imgFetchOpts: RequestInit & { client?: Deno.HttpClient } = {
    headers: {
      Accept: "application/jpg",
      Authorization: `Bearer ${accessToken}`,
    },
  };
  if (sberHttpClient) (imgFetchOpts as any).client = sberHttpClient;

  const imageRes = await fetchWithTimeout(`https://gigachat.devices.sberbank.ru/api/v1/files/${fileId}/content`, imgFetchOpts, STEP_TIMEOUT);

  if (!imageRes.ok) {
    throw { status: imageRes.status, message: `GigaChat image download error: ${imageRes.status}` };
  }

  const imageBytes = new Uint8Array(await imageRes.arrayBuffer());
  const CHUNK = 8192;
  const parts: string[] = [];
  for (let i = 0; i < imageBytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...imageBytes.subarray(i, i + CHUNK)));
  }
  const base64 = btoa(parts.join(""));
  return `data:image/jpeg;base64,${base64}`;
}

// Lovable AI fallback for image generation (Gemini Nano Banana 2)
async function generateWithLovableAI(prompt: string): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw { status: 500, message: "LOVABLE_API_KEY is not configured" };

  console.log("[generate-image] Falling back to Lovable AI (gemini-3.1-flash-image-preview)");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image-preview",
      messages: [{
        role: "user",
        content: `Generate an educational illustration for: ${prompt}. Style: clean, professional, suitable for educational materials. High quality, detailed. NO text or labels in the image.`,
      }],
      modalities: ["image", "text"],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("[generate-image] Lovable AI error:", resp.status, text);
    if (resp.status === 402) throw { status: 402, message: "Lovable AI: payment required" };
    if (resp.status === 429) throw { status: 429, message: "Lovable AI: rate limited", retryable: true };
    throw { status: resp.status, message: `Lovable AI error: ${resp.status}` };
  }

  const result = await resp.json();
  const imageDataUrl = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageDataUrl) {
    throw { status: 502, message: "Lovable AI did not return an image" };
  }
  return imageDataUrl;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, imageUrl, provider, model, slotIndex } = await req.json();
    if (!prompt) throw new Error("Prompt is required");

    const selectedProvider = provider || "gigachat";
    console.log(`[generate-image] provider=${selectedProvider}, slotIndex=${slotIndex}, prompt="${prompt.slice(0, 80)}..."`);

    let generatedImageUrl = "";
    let usedSlot = -1;
    let usedProvider = selectedProvider;

    if (selectedProvider === "gigachat") {
      // Build available slots based on which keys are actually configured
      const allSlots = (["KEY", "KEY_2", "KEY_3"] as const).filter((s) => {
        const env = s === "KEY_2" ? "GIGACHAT_AUTH_KEY_2" : s === "KEY_3" ? "GIGACHAT_AUTH_KEY_3" : "GIGACHAT_AUTH_KEY";
        return !!Deno.env.get(env);
      });

      if (allSlots.length === 0) {
        throw { status: 500, message: "GigaChat keys not configured" };
      }

      // SLOT CYCLING: slotIndex is just a STARTING offset — we cycle through
      // remaining slots on 402 / 5xx / non-retryable errors.
      const parsedSlotIndex = typeof slotIndex === "number" ? slotIndex : Number(slotIndex);
      const startSlot = Number.isFinite(parsedSlotIndex)
        ? Math.abs(parsedSlotIndex) % allSlots.length
        : crypto.getRandomValues(new Uint8Array(1))[0] % allSlots.length;

      let success = false;
      let lastErr: any = null;
      let allExhausted = true; // becomes false if any slot fails for a non-402/exhaustion reason

      for (let slotAttempt = 0; slotAttempt < allSlots.length; slotAttempt++) {
        const slotIdx = (startSlot + slotAttempt) % allSlots.length;
        const slotName = allSlots[slotIdx];

        // Per-slot retry on 429 only (max 2 attempts), then move to next slot
        const MAX_RATE_RETRIES = 2;
        let slotSucceeded = false;

        for (let attempt = 0; attempt < MAX_RATE_RETRIES; attempt++) {
          if (attempt > 0) {
            const backoffMs = 15000 + Math.floor(Math.random() * 5000);
            console.log(`[generate-image] [${slotName}] 429 retry ${attempt + 1}/${MAX_RATE_RETRIES} after ${backoffMs}ms`);
            await new Promise((r) => setTimeout(r, backoffMs));
          }

          try {
            console.log(`[generate-image] [${slotName}] attempt ${attempt + 1}/${MAX_RATE_RETRIES} (slot ${slotAttempt + 1}/${allSlots.length})`);
            generatedImageUrl = await generateWithGigaChat(prompt, slotName);
            usedSlot = slotIdx;
            success = true;
            slotSucceeded = true;
            break;
          } catch (e: any) {
            lastErr = e;
            const status = e?.status || 500;
            const msg = e?.message || "";
            console.warn(`[generate-image] [${slotName}] attempt ${attempt + 1} failed: status=${status}, ${msg}`);

            if (status === 429) {
              // retry same slot
              continue;
            }

            // 402 / exhausted / 5xx / 4xx — stop retrying same slot, move to next
            if (status === 402 || /402|exhausted|payment/i.test(msg)) {
              console.log(`[generate-image] [${slotName}] tokens exhausted (402) → switching to next slot`);
            } else {
              allExhausted = false;
              console.log(`[generate-image] [${slotName}] non-retryable error → switching to next slot`);
            }
            break;
          }
        }

        if (slotSucceeded) break;
      }

      // If all GigaChat slots failed — try Lovable AI as final fallback
      if (!success) {
        console.warn(`[generate-image] All ${allSlots.length} GigaChat slots failed (lastErr status=${lastErr?.status}), trying Lovable AI fallback...`);
        try {
          generatedImageUrl = await generateWithLovableAI(prompt);
          usedProvider = "lovable_ai";
          success = true;
        } catch (lovErr: any) {
          console.error("[generate-image] Lovable AI fallback also failed:", lovErr);
          const status = lastErr?.status || lovErr?.status || 503;
          const msg = lastErr?.message || lovErr?.message || "All image providers unavailable";
          throw {
            status,
            message: msg,
            retryable: lastErr?.status === 429 || lovErr?.status === 429,
          };
        }
      }
    } else {
      throw { status: 400, message: "Неподдерживаемый провайдер. Используйте gigachat." };
    }

    // Convert base64 to binary and upload to storage
    const base64Data = generatedImageUrl.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fileName = `block-images/ai-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("course-files")
      .upload(fileName, binaryData, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/course-files/${fileName}`;

    return new Response(JSON.stringify({ url: publicUrl, slot: usedSlot, provider: usedProvider }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-image error:", e);
    const status = e?.status || 500;
    const message = e?.message || (e instanceof Error ? e.message : "Unknown error");
    return new Response(JSON.stringify({ error: message, retryable: !!e?.retryable, slot: e?.slot }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
