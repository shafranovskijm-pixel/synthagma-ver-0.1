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

async function generateWithLovableAI(prompt: string, imageUrl: string | undefined, model: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const isEditing = !!imageUrl;
  const messageContent = isEditing
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageUrl } },
      ]
    : `Generate an image: ${prompt}. Make it high quality, clean, and suitable for an educational course.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: messageContent }],
      modalities: ["image", "text"],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw { status: 429, message: "Превышен лимит запросов, попробуйте позже" };
    if (response.status === 402) throw { status: 402, message: "Недостаточно средств для генерации" };
    const text = await response.text();
    console.error("AI gateway error:", response.status, text);
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const data = await response.json();
  const generatedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!generatedImageUrl) throw new Error("No image generated");
  return generatedImageUrl;
}

async function generateWithGigaChat(prompt: string, keySlot?: string) {
  // GigaChat uses its own auth flow to get an access token, then calls the image generation endpoint
  const envKey = keySlot === "KEY_2" ? "GIGACHAT_AUTH_KEY_2" : keySlot === "KEY_3" ? "GIGACHAT_AUTH_KEY_3" : "GIGACHAT_AUTH_KEY";
  const authKey = Deno.env.get(envKey);
  if (!authKey) throw new Error(`${envKey} is not configured`);

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

  const tokenRes = await fetch("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", tokenFetchOpts);

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("GigaChat auth error:", tokenRes.status, text);
    throw new Error(`GigaChat auth error: ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // Step 2: Ask GigaChat to generate an image via chat completions
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
          content: `Нарисуй изображение: ${prompt}. Сделай качественно, чисто, подходящее для образовательного курса.`,
        },
      ],
      function_call: "auto",
    }),
  };
  if (sberHttpClient) (chatFetchOpts as any).client = sberHttpClient;

  const chatRes = await fetch("https://gigachat.devices.sberbank.ru/api/v1/chat/completions", chatFetchOpts);

  if (!chatRes.ok) {
    const text = await chatRes.text();
    console.error("GigaChat generation error:", chatRes.status, text);
    throw new Error(`GigaChat generation error: ${chatRes.status}`);
  }

  const chatData = await chatRes.json();
  const content = chatData.choices?.[0]?.message?.content || "";

  // Extract image file_id from the response (format: <img src="file_id" .../>)
  const fileIdMatch = content.match(/<img\s+src="([^"]+)"/);
  if (!fileIdMatch) {
    console.error("GigaChat response has no image:", content);
    throw new Error("GigaChat не сгенерировал изображение");
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

  const imageRes = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${fileId}/content`, imgFetchOpts);

  if (!imageRes.ok) {
    throw new Error(`GigaChat image download error: ${imageRes.status}`);
  }

  const imageBytes = new Uint8Array(await imageRes.arrayBuffer());
  // Return as base64 data URL — use chunked encoding to avoid stack overflow on large images
  let binary = "";
  for (let i = 0; i < imageBytes.length; i++) {
    binary += String.fromCharCode(imageBytes[i]);
  }
  const base64 = btoa(binary);
  return `data:image/jpeg;base64,${base64}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, imageUrl, provider, model, gigachat_key, slotIndex } = await req.json();
    if (!prompt) throw new Error("Prompt is required");

    const selectedProvider = provider || "gigachat";
    console.log(`Generating image with provider: ${selectedProvider}, prompt: ${prompt}, slotIndex: ${slotIndex}`);

    let generatedImageUrl: string;
    let usedProvider = selectedProvider;

    if (selectedProvider === "gigachat") {
      // True round-robin: start from slotIndex, fallback to others
      const allSlots: (string | undefined)[] = ["KEY", "KEY_2", "KEY_3"];
      const startSlot = typeof slotIndex === "number" ? (slotIndex % allSlots.length) : 0;
      let success = false;
      for (let attempt = 0; attempt < allSlots.length; attempt++) {
        const si = (startSlot + attempt) % allSlots.length;
        try {
          console.log(`[generate-image] Trying GigaChat slot ${allSlots[si]} (attempt ${attempt}, startSlot=${startSlot})`);
          generatedImageUrl = await generateWithGigaChat(prompt, allSlots[si]);
          success = true;
          break;
        } catch (e: any) {
          console.warn(`[generate-image] GigaChat slot ${allSlots[si]} failed:`, e?.message);
        }
      }
      if (!success) {
        console.log("[generate-image] All GigaChat slots failed, falling back to Lovable AI");
        try {
          generatedImageUrl = await generateWithLovableAI(prompt, imageUrl, model);
          usedProvider = "lovable_ai";
        } catch (fallbackErr: any) {
          console.error("[generate-image] Lovable AI fallback also failed:", fallbackErr?.message);
          throw { status: fallbackErr?.status || 500, message: fallbackErr?.message || "Все провайдеры изображений недоступны" };
        }
      }
    } else {
      generatedImageUrl = await generateWithLovableAI(prompt, imageUrl, model);
    }

    // Convert base64 to binary and upload to storage
    const base64Data = generatedImageUrl.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const ext = usedProvider === "gigachat" ? "jpg" : "png";
    const fileName = `block-images/ai-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("course-files")
      .upload(fileName, binaryData, {
        contentType: `image/${ext === "jpg" ? "jpeg" : "png"}`,
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/course-files/${fileName}`;

    return new Response(JSON.stringify({ url: publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-image error:", e);
    const status = e?.status || 500;
    const message = e?.message || (e instanceof Error ? e.message : "Unknown error");
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
