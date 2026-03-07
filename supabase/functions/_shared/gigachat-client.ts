/**
 * Shared GigaChat client with OAuth token caching, Russian CA certs,
 * slot-based parallel request pool, and Lovable AI fallback.
 */

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

// === Russian Trusted Sub CA (Минцифры России) ===
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

// ═══════════════════════════════════════════════════════════
// HTTP client with Russian CA certs
// ═══════════════════════════════════════════════════════════
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
    console.warn("[GigaChat] Failed to create HTTP client with Russian CA certs:", e);
  }
  return undefined;
}

const httpClient = createSberHttpClient();

// ═══════════════════════════════════════════════════════════
// Slot-based parallel request pool
// ═══════════════════════════════════════════════════════════

interface GigaChatSlot {
  name: string;
  authKeyEnv: string;
  cachedToken: string | null;
  tokenExpiresAt: number;
  lock: Promise<void>;
  releaseLock: (() => void) | null;
  busy: boolean;
}

function createSlots(): GigaChatSlot[] {
  const slots: GigaChatSlot[] = [
    {
      name: "slot-0",
      authKeyEnv: "GIGACHAT_AUTH_KEY",
      cachedToken: null,
      tokenExpiresAt: 0,
      lock: Promise.resolve(),
      releaseLock: null,
      busy: false,
    },
  ];

  // Add second slot only if the key is configured
  const key2 = Deno.env.get("GIGACHAT_AUTH_KEY_2");
  if (key2) {
    slots.push({
      name: "slot-1",
      authKeyEnv: "GIGACHAT_AUTH_KEY_2",
      cachedToken: null,
      tokenExpiresAt: 0,
      lock: Promise.resolve(),
      releaseLock: null,
      busy: false,
    });
    console.log("[GigaChat] Pool initialized with 2 slots (parallel mode)");
  } else {
    console.log("[GigaChat] Pool initialized with 1 slot (single key mode)");
  }

  return slots;
}

const slots = createSlots();

/**
 * Acquire the first free slot, or wait for any to become free.
 * Returns the slot index.
 */
async function acquireSlot(): Promise<number> {
  // Fast path: find a free slot
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i].busy) {
      slots[i].busy = true;
      const prev = slots[i].lock;
      slots[i].lock = new Promise<void>((resolve) => {
        slots[i].releaseLock = resolve;
      });
      await prev;
      return i;
    }
  }

  // All busy: race on all locks, then retry
  await Promise.race(slots.map((s) => s.lock));
  return acquireSlot();
}

function releaseSlot(idx: number, postDelayMs = 3000): void {
  // Cooldown then release
  setTimeout(() => {
    slots[idx].busy = false;
    slots[idx].releaseLock?.();
  }, postDelayMs);
}

// ═══════════════════════════════════════════════════════════
// OAuth token (per-slot)
// ═══════════════════════════════════════════════════════════
async function getSlotToken(slot: GigaChatSlot): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (slot.cachedToken && slot.tokenExpiresAt > now + 300) {
    return slot.cachedToken;
  }

  const authKey = Deno.env.get(slot.authKeyEnv);
  if (!authKey) throw new Error(`${slot.authKeyEnv} is not configured`);

  const rquid = crypto.randomUUID();

  const fetchOpts: RequestInit & { client?: Deno.HttpClient } = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      RqUID: rquid,
      Authorization: `Basic ${authKey}`,
    },
    body: "scope=GIGACHAT_API_PERS",
  };
  if (httpClient) (fetchOpts as any).client = httpClient;

  const response = await fetch(
    "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
    fetchOpts,
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[GigaChat][${slot.name}] OAuth error:`, response.status, errorText);
    throw new Error(`GigaChat OAuth failed: ${response.status}`);
  }

  const data = await response.json();
  slot.cachedToken = data.access_token;
  slot.tokenExpiresAt = Math.floor(data.expires_at / 1000);
  console.log(`[GigaChat][${slot.name}] OAuth token obtained, expires in ${slot.tokenExpiresAt - now}s`);
  return slot.cachedToken!;
}

// ═══════════════════════════════════════════════════════════
// Raw GigaChat API call (uses a specific slot)
// ═══════════════════════════════════════════════════════════
async function _rawCallGigaChat(
  slot: GigaChatSlot,
  messages: Array<{ role: string; content: string }>,
  model: string,
  maxTokens: number,
): Promise<string> {
  const token = await getSlotToken(slot);

  const fetchOpts: RequestInit & { client?: Deno.HttpClient } = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens }),
  };
  if (httpClient) (fetchOpts as any).client = httpClient;

  const response = await fetch(
    "https://gigachat.devices.sberbank.ru/api/v1/chat/completions",
    fetchOpts,
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[GigaChat][${slot.name}] API error:`, response.status, errorText);
    if (response.status === 402) {
      throw new Error("GigaChat 402: Payment required — tokens exhausted");
    }
    if (response.status === 429) {
      throw new Error("GigaChat rate limit exceeded (429)");
    }
    throw new Error(`GigaChat API error: ${response.status}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || "";
}

// ═══════════════════════════════════════════════════════════
// GigaChat with slot pool + 429 retry + model fallback chain
// ═══════════════════════════════════════════════════════════
const GIGACHAT_MODEL_CHAIN = ["GigaChat-Pro", "GigaChat"];

export async function callGigaChat(
  messages: Array<{ role: string; content: string }>,
  model = "GigaChat-Pro",
  maxTokens = 4096,
): Promise<string> {
  const slotIdx = await acquireSlot();
  const slot = slots[slotIdx];
  console.log(`[GigaChat] Acquired ${slot.name}`);

  try {
    const modelsToTry = [model, ...GIGACHAT_MODEL_CHAIN.filter((m) => m !== model)];

    for (const m of modelsToTry) {
      try {
        console.log(`[GigaChat][${slot.name}] Trying model: ${m}`);
        const result = await _rawCallGigaChat(slot, messages, m, maxTokens);
        console.log(`[GigaChat][${slot.name}] Success with model: ${m}`);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[GigaChat][${slot.name}] Model ${m} failed: ${msg}`);

        if (msg.includes("402")) throw err;

        if (msg.includes("429")) {
          console.log(`[GigaChat][${slot.name}] Rate limited on ${m}, waiting 10s...`);
          await new Promise((r) => setTimeout(r, 10000));
          continue;
        }
        continue;
      }
    }

    throw new Error("All GigaChat models exhausted");
  } finally {
    releaseSlot(slotIdx);
  }
}

// ═══════════════════════════════════════════════════════════
// Lovable AI Gateway (Gemini) — fallback
// ═══════════════════════════════════════════════════════════
export async function callLovableAI(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 4096,
  model = "google/gemini-2.5-flash",
): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = attempt * 3000;
      console.log(`[LovableAI] retry ${attempt + 1}/${MAX_RETRIES}, waiting ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }

    let response: Response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens }),
      });
    } catch (fetchErr) {
      console.warn(`[LovableAI] fetch error attempt ${attempt + 1}:`, fetchErr);
      if (attempt === MAX_RETRIES - 1) throw new Error("AI gateway: network error after retries");
      continue;
    }

    if (response.status === 402) {
      try { await response.text(); } catch {}
      throw new Error("Требуется пополнение баланса ИИ-кредитов (402)");
    }
    if (response.status === 429) {
      try { await response.text(); } catch {}
      throw new Error("AI rate limit exceeded (429)");
    }

    let text: string;
    try {
      text = await response.text();
    } catch (bodyErr) {
      console.warn(`[LovableAI] body read error attempt ${attempt + 1}:`, bodyErr);
      if (attempt === MAX_RETRIES - 1) throw new Error("AI gateway: failed to read response body");
      continue;
    }

    if (!response.ok) {
      console.error("Lovable AI error:", response.status, text);
      if (attempt === MAX_RETRIES - 1) throw new Error(`AI gateway error: ${response.status}`);
      continue;
    }

    if (!text || text.trim() === "") {
      console.warn(`[LovableAI] empty response attempt ${attempt + 1}`);
      if (attempt === MAX_RETRIES - 1) throw new Error("AI gateway returned empty response");
      continue;
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      console.error("Failed to parse AI response:", text.substring(0, 500));
      if (attempt === MAX_RETRIES - 1) throw new Error("AI gateway returned invalid JSON");
      continue;
    }

    return result.choices?.[0]?.message?.content || "";
  }

  throw new Error("AI gateway: all retries exhausted");
}

// ═══════════════════════════════════════════════════════════
// Lovable AI with tool calling support
// ═══════════════════════════════════════════════════════════
export async function callLovableAIWithTools(
  messages: Array<{ role: string; content: string }>,
  tool?: any,
  model = "google/gemini-3-flash-preview",
): Promise<any> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const body: any = { model, messages };
  if (tool) {
    body.tools = [tool];
    body.tool_choice = { type: "function", function: { name: tool.function.name } };
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limit exceeded");
    if (response.status === 402) throw new Error("Payment required, please add credits");
    const errorText = await response.text();
    console.error("AI error:", response.status, errorText);
    throw new Error(`AI error: ${response.status}`);
  }

  const result = await response.json();

  if (tool) {
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");
    return JSON.parse(toolCall.function.arguments);
  } else {
    return { content: result.choices?.[0]?.message?.content || "" };
  }
}

// ═══════════════════════════════════════════════════════════
// Universal AI caller: GigaChat first → Lovable AI fallback
// ═══════════════════════════════════════════════════════════
export async function callAI(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 4096,
  preferredProvider?: string,
): Promise<{ text: string; model: string }> {
  if (preferredProvider === "lovable_ai") {
    const text = await callLovableAI(messages, maxTokens);
    return { text, model: "Lovable AI (Gemini)" };
  }

  try {
    const text = await callGigaChat(messages, "GigaChat-Pro", maxTokens);
    return { text, model: "GigaChat-Pro" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[callAI] GigaChat unavailable, falling back to Lovable AI:", msg);
    const text = await callLovableAI(messages, maxTokens);
    return { text, model: "Gemini 2.5 Flash" };
  }
}

// ═══════════════════════════════════════════════════════════
// Universal AI caller with tool support
// ═══════════════════════════════════════════════════════════
export async function callAIWithTools(
  messages: Array<{ role: string; content: string }>,
  tool?: any,
  gigachatModel = "GigaChat-Pro",
  lovableModel = "google/gemini-3-flash-preview",
  preferredProvider?: string,
): Promise<any> {
  if (preferredProvider === "lovable_ai") {
    return await callLovableAIWithTools(messages, tool, lovableModel);
  }

  try {
    const systemMsg = messages.find((m) => m.role === "system");
    const userMsg = messages.find((m) => m.role === "user");

    const jsonHint = tool
      ? `\n\nОтветь СТРОГО в формате JSON, соответствующем следующей структуре: ${JSON.stringify(tool.function.parameters)}. Без markdown-обёртки, только JSON.`
      : "";

    const gcMessages = [
      { role: "system", content: (systemMsg?.content || "") + jsonHint },
      { role: "user", content: userMsg?.content || "" },
    ];

    const text = await callGigaChat(gcMessages, gigachatModel, 8192);

    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    console.log("[callAIWithTools] GigaChat succeeded");
    return tool ? parsed : { content: text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[callAIWithTools] GigaChat failed, falling back to Lovable AI:", msg);
    return await callLovableAIWithTools(messages, tool, lovableModel);
  }
}
