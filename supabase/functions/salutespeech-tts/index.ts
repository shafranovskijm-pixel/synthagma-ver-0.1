import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// === Russian Trusted Root CA (Минцифры России) ===
const RUSSIAN_TRUSTED_ROOT_CA = `-----BEGIN CERTIFICATE-----
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

const RUSSIAN_TRUSTED_SUB_CA = `-----BEGIN CERTIFICATE-----
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
        caCerts: [RUSSIAN_TRUSTED_ROOT_CA, RUSSIAN_TRUSTED_SUB_CA],
      });
    }
  } catch (e) {
    console.warn("[SaluteSpeech] Failed to create HTTP client with Russian CA certs:", e);
  }
  return undefined;
}

const httpClient = createSberHttpClient();

// SaluteSpeech voices (Russian)
const VOICES: Record<string, string> = {
  "Natalya_24000": "Nec_24000",
  "Boris_24000": "Bys_24000",
  "Marfa_24000": "May_24000",
  "Taras_24000": "Tur_24000",
  "Alexandra_24000": "Ost_24000",
  "Sergey_24000": "Pon_24000",
  "Kira_24000": "Kin_24000",
  natalya: "Nec_24000",
  boris: "Bys_24000",
  marfa: "May_24000",
  taras: "Tur_24000",
  alexandr: "Ost_24000",
  sergey: "Pon_24000",
  kira: "Kin_24000",
};

// === Slot-based token pool (dual-key support) ===

interface TokenSlot {
  authKey: string;
  cachedToken: string | null;
  tokenExpiresAt: number; // epoch ms
  busy: boolean;
  slotIndex: number;
}

const TOKEN_TTL_MS = 28 * 60 * 1000; // 28 min (tokens live 30 min, refresh early)

function buildSlots(): TokenSlot[] {
  const slots: TokenSlot[] = [];
  const key1 = Deno.env.get("SALUTESPEECH_AUTH_KEY");
  const key2 = Deno.env.get("SALUTESPEECH_AUTH_KEY_2");
  const key3 = Deno.env.get("SALUTESPEECH_AUTH_KEY_3");
  if (key1) slots.push({ authKey: key1, cachedToken: null, tokenExpiresAt: 0, busy: false, slotIndex: 0 });
  if (key2) slots.push({ authKey: key2, cachedToken: null, tokenExpiresAt: 0, busy: false, slotIndex: 1 });
  if (key3) slots.push({ authKey: key3, cachedToken: null, tokenExpiresAt: 0, busy: false, slotIndex: 2 });
  return slots;
}

const slots = buildSlots();
let roundRobinCounter = 0;
function pickSlot(streamIndex?: number): TokenSlot | null {
  if (slots.length === 0) return null;
  if (slots.length === 1) return slots[0];
  if (typeof streamIndex === 'number') return slots[streamIndex % slots.length];
  const idx = roundRobinCounter % slots.length;
  roundRobinCounter++;
  return slots[idx];
}

async function getAccessToken(slot: TokenSlot): Promise<string> {
  const now = Date.now();
  if (slot.cachedToken && now < slot.tokenExpiresAt) {
    return slot.cachedToken;
  }

  const rqUID = crypto.randomUUID();
  const fetchOpts: RequestInit & { client?: Deno.HttpClient } = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      RqUID: rqUID,
      Authorization: `Basic ${slot.authKey}`,
    },
    body: "scope=SALUTE_SPEECH_PERS",
  };
  if (httpClient) (fetchOpts as any).client = httpClient;

  const response = await fetch("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", fetchOpts);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[SaluteSpeech] Auth error slot ${slot.slotIndex}:`, response.status, errorText);
    throw new Error(`SaluteSpeech auth failed (slot ${slot.slotIndex}): ${response.status}`);
  }

  const data = await response.json();
  slot.cachedToken = data.access_token;
  slot.tokenExpiresAt = now + TOKEN_TTL_MS;
  console.log(`[SaluteSpeech] Token refreshed for slot ${slot.slotIndex}`);
  return data.access_token;
}

async function synthesizeWithSlot(
  slot: TokenSlot,
  text: string,
  voiceParam: string,
  audioFormat: string
): Promise<ArrayBuffer> {
  slot.busy = true;
  try {
    const accessToken = await getAccessToken(slot);

    const synthFetchOpts: RequestInit & { client?: Deno.HttpClient } = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/text",
      },
      body: text,
    };
    if (httpClient) (synthFetchOpts as any).client = httpClient;

    const synthesisResponse = await fetch(
      `https://smartspeech.sber.ru/rest/v1/text:synthesize?voice=${encodeURIComponent(voiceParam)}&format=${encodeURIComponent(audioFormat)}`,
      synthFetchOpts
    );

    if (!synthesisResponse.ok) {
      const errorText = await synthesisResponse.text();
      console.error(`[SaluteSpeech] Synthesis error slot ${slot.slotIndex}:`, synthesisResponse.status, errorText);
      // Invalidate token on 401
      if (synthesisResponse.status === 401) {
        slot.cachedToken = null;
        slot.tokenExpiresAt = 0;
      }
      throw new Error(`Synthesis failed (slot ${slot.slotIndex}): ${synthesisResponse.status} ${errorText}`);
    }

    console.log(`[SaluteSpeech] Synthesis OK via slot ${slot.slotIndex}`);
    return await synthesisResponse.arrayBuffer();
  } finally {
    slot.busy = false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice = "natalya", format = "opus", stream_index } = await req.json();

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

    if (slots.length === 0) {
      throw new Error("SALUTESPEECH_AUTH_KEY is not configured");
    }

    const voiceParam = VOICES[voice] || VOICES.natalya;
    const audioFormat = format === "wav16" ? "wav16" : format === "pcm16" ? "pcm16" : "opus";
    const contentType = format === "wav16"
      ? "audio/x-wav"
      : format === "pcm16"
        ? "audio/x-pcm;bit=16;rate=24000"
        : "audio/ogg;codecs=opus";

    console.log(`[SaluteSpeech] voice=${voice} -> ${voiceParam}, slots=${slots.length}`);

    // Try primary slot, fallback to secondary
    const primarySlot = pickSlot(stream_index)!;
    let audioBuffer: ArrayBuffer = new ArrayBuffer(0);

    try {
      audioBuffer = await synthesizeWithSlot(primarySlot, text, voiceParam, audioFormat);
    } catch (primaryError) {
      // Try remaining slots as fallback
      const fallbackSlots = slots.filter(s => s.slotIndex !== primarySlot.slotIndex);
      if (fallbackSlots.length === 0) throw primaryError;

      let lastError = primaryError;
      let success = false;
      for (const fallbackSlot of fallbackSlots) {
        try {
          console.warn(`[SaluteSpeech] Slot ${primarySlot.slotIndex} failed, trying slot ${fallbackSlot.slotIndex}`);
          audioBuffer = await synthesizeWithSlot(fallbackSlot, text, voiceParam, audioFormat);
          success = true;
          break;
        } catch (fbErr) {
          lastError = fbErr;
        }
      }
      if (!success) throw lastError;
    }

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
