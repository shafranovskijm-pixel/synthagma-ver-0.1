import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { callAIWithTools, callLovableAIWithTools } from "../_shared/gigachat-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Lesson {
  title: string;
  type: "lesson" | "test";
  order_index: number;
}

interface TestQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
}

interface ContentBlock {
  type: string;
  content: string;
}

// Uses shared AI client: GigaChat first → Lovable AI fallback
async function generateWithAI(prompt: string, systemPrompt: string, tool?: any): Promise<any> {
  return await callAIWithTools(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ],
    tool
  );
}

async function generateCourseStructure(courseTitle: string): Promise<Lesson[]> {
  const systemPrompt = `Ты эксперт по созданию учебных программ. Создай структуру курса с уроками и тестами.
Правила:
1. Создай от 5 до 8 уроков
2. После каждых 2-3 уроков добавь тест
3. В конце обязательно итоговый тест
4. Уроки должны логически следовать друг за другом`;

  const tool = {
    type: "function",
    function: {
      name: "create_course_structure",
      description: "Создает структуру курса",
      parameters: {
        type: "object",
        properties: {
          lessons: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                type: { type: "string", enum: ["lesson", "test"] }
              },
              required: ["title", "type"],
              additionalProperties: false
            }
          }
        },
        required: ["lessons"],
        additionalProperties: false
      }
    }
  };

  const result = await generateWithAI(
    `Создай структуру курса: "${courseTitle}"`,
    systemPrompt,
    tool
  );

  return (result.lessons || []).map((l: any, i: number) => ({
    title: l.title,
    type: l.type,
    order_index: i
  }));
}

async function generateLessonContent(lessonTitle: string, courseTitle: string): Promise<ContentBlock[]> {
  const systemPrompt = `Ты эксперт по созданию образовательного контента. Создай подробный учебный материал.
Правила:
1. Контент должен быть структурированным и понятным
2. Используй заголовки, списки, примеры
3. Минимум 500 слов
4. Практические примеры обязательны
5. Проверяй актуальность нормативно-правовых документов и законов. Ссылайся только на действующие редакции НПА, приказов, постановлений и ГОСТов. Если документ отменён или заменён — используй актуальную версию.
6. Актуализируй информацию: перепроверяй себя, не используй устаревшие данные, нормы и формулировки.`;

  const tool = {
    type: "function",
    function: {
      name: "create_lesson_content",
      parameters: {
        type: "object",
        properties: {
          blocks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["heading1", "heading2", "paragraph", "bulletList", "numberedList"] },
                content: { type: "string" }
              },
              required: ["type", "content"],
              additionalProperties: false
            }
          }
        },
        required: ["blocks"],
        additionalProperties: false
      }
    }
  };

  const result = await generateWithAI(
    `Создай подробный учебный материал для урока "${lessonTitle}" курса "${courseTitle}"`,
    systemPrompt,
    tool
  );

  return result.blocks || [];
}

async function generateTestQuestions(lessonTitle: string, courseTitle: string): Promise<TestQuestion[]> {
  const systemPrompt = `Ты эксперт по созданию тестов. Создай тестовые вопросы.
Правила:
1. 5-10 вопросов
2. 4 варианта ответа на каждый
3. Только один правильный ответ
4. Разная сложность вопросов`;

  const tool = {
    type: "function",
    function: {
      name: "create_test_questions",
      parameters: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                options: { type: "array", items: { type: "string" } },
                correctAnswer: { type: "number" }
              },
              required: ["question", "options", "correctAnswer"],
              additionalProperties: false
            }
          }
        },
        required: ["questions"],
        additionalProperties: false
      }
    }
  };

  const result = await generateWithAI(
    `Создай тестовые вопросы для теста "${lessonTitle}" курса "${courseTitle}"`,
    systemPrompt,
    tool
  );

  return result.questions || [];
}

// ═══════════════════════════════════════════════════════════
// Image generation: Lovable AI → GigaChat 2-slot fallback
// ═══════════════════════════════════════════════════════════

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

function createImageHttpClient(): Deno.HttpClient | undefined {
  try {
    // @ts-ignore
    if (typeof Deno.createHttpClient === "function") {
      // @ts-ignore
      return Deno.createHttpClient({ caCerts: [RUSSIAN_ROOT_CA, RUSSIAN_SUB_CA] });
    }
  } catch (e) {
    console.warn("[generate-image] Failed to create HTTP client with Russian CA:", e);
  }
  return undefined;
}

const imageHttpClient = createImageHttpClient();

// GigaChat image generation keys (3 slots)
const GIGACHAT_IMAGE_KEYS = [
  Deno.env.get("GIGACHAT_AUTH_KEY"),
  Deno.env.get("GIGACHAT_AUTH_KEY_2"),
  Deno.env.get("GIGACHAT_AUTH_KEY_3"),
].filter(Boolean) as string[];

/**
 * Возвращает изображение в виде data-URL.
 * Бросает ошибку с признаком dead=true, если слот исчерпан (402) — чтобы
 * внешний цикл больше не возвращался к этому слоту в рамках текущего запуска.
 */
async function generateImageWithGigaChat(prompt: string, keyIndex: number): Promise<string | null> {
  const authKey = GIGACHAT_IMAGE_KEYS[keyIndex];
  if (!authKey) return null;

  const slotName = `img-slot-${keyIndex}`;
  console.log(`[GigaChat][${slotName}] Generating image for: ${prompt}`);

  // Step 1: Get OAuth token
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
  if (imageHttpClient) (tokenFetchOpts as any).client = imageHttpClient;

  const tokenRes = await fetch("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", tokenFetchOpts);
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error(`[GigaChat][${slotName}] OAuth error:`, tokenRes.status, text);
    if (tokenRes.status === 402 || /payment|exhausted|insufficient/i.test(text)) {
      throw { dead: true, status: 402, message: `[${slotName}] OAuth 402: tokens exhausted` };
    }
    return null;
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // Step 2: Generate image via chat completions
  const chatFetchOpts: RequestInit & { client?: Deno.HttpClient } = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      model: "GigaChat",
      messages: [{ role: "user", content: `Нарисуй изображение: ${prompt}. Сделай качественно, подходящее для образовательного курса.` }],
      function_call: "auto",
    }),
  };
  if (imageHttpClient) (chatFetchOpts as any).client = imageHttpClient;

  const chatRes = await fetch("https://gigachat.devices.sberbank.ru/api/v1/chat/completions", chatFetchOpts);
  if (!chatRes.ok) {
    const text = await chatRes.text();
    console.error(`[GigaChat][${slotName}] Generation error:`, chatRes.status, text);
    if (chatRes.status === 402 || /payment|exhausted|insufficient/i.test(text)) {
      throw { dead: true, status: 402, message: `[${slotName}] 402: tokens exhausted` };
    }
    if (chatRes.status === 429) {
      // 429 — слот не «мертв», но временно недоступен. Не зачисляем как dead.
      throw { dead: false, status: 429, message: `[${slotName}] 429: rate limited` };
    }
    return null;
  }

  const chatData = await chatRes.json();
  const content = chatData.choices?.[0]?.message?.content || "";

  // Extract image file_id
  const fileIdMatch = content.match(/<img\s+src="([^"]+)"/);
  if (!fileIdMatch) {
    console.error(`[GigaChat][${slotName}] No image in response:`, content.substring(0, 200));
    return null;
  }

  const fileId = fileIdMatch[1];

  // Step 3: Download image
  const imgFetchOpts: RequestInit & { client?: Deno.HttpClient } = {
    headers: { Accept: "application/jpg", Authorization: `Bearer ${accessToken}` },
  };
  if (imageHttpClient) (imgFetchOpts as any).client = imageHttpClient;

  const imageRes = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${fileId}/content`, imgFetchOpts);
  if (!imageRes.ok) {
    console.error(`[GigaChat][${slotName}] Image download error:`, imageRes.status);
    return null;
  }

  const imageBytes = new Uint8Array(await imageRes.arrayBuffer());
  let binary = "";
  for (let i = 0; i < imageBytes.length; i++) {
    binary += String.fromCharCode(imageBytes[i]);
  }
  const base64 = btoa(binary);
  console.log(`[GigaChat][${slotName}] Image generated successfully`);
  return `data:image/jpeg;base64,${base64}`;
}

let gigaChatImageSlotCounter = 0;
// Слоты, которые в рамках текущей сессии edge-функции исчерпали токены (402).
// Edge-функции в Supabase живут от запроса до запроса коротко, поэтому это
// эффективно работает как "мёртвый на этот запуск генерации курса".
const deadImageSlots = new Set<number>();

async function generateImage(prompt: string): Promise<string | null> {
  // Try GigaChat first with round-robin across all live slots
  if (GIGACHAT_IMAGE_KEYS.length > 0) {
    const liveSlots = GIGACHAT_IMAGE_KEYS
      .map((_, i) => i)
      .filter((i) => !deadImageSlots.has(i));

    if (liveSlots.length === 0) {
      console.warn(`[Image] All ${GIGACHAT_IMAGE_KEYS.length} GigaChat slots are dead in this run, skipping to Lovable AI`);
    } else {
      const startSlot = gigaChatImageSlotCounter++ % liveSlots.length;
      for (let attempt = 0; attempt < liveSlots.length; attempt++) {
        const slotIdx = liveSlots[(startSlot + attempt) % liveSlots.length];
        try {
          const result = await generateImageWithGigaChat(prompt, slotIdx);
          if (result) {
            console.log(`[Image] GigaChat slot-${slotIdx} success`);
            return result;
          }
        } catch (e: any) {
          if (e?.dead) {
            deadImageSlots.add(slotIdx);
            console.warn(`[Image] GigaChat slot-${slotIdx} marked DEAD for this run (402). Live slots left: ${GIGACHAT_IMAGE_KEYS.length - deadImageSlots.size}`);
          } else {
            console.warn(`[Image] GigaChat slot-${slotIdx} transient failure:`, e?.message || e);
          }
        }
      }
    }
  }

  // Fallback: Lovable AI
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (LOVABLE_API_KEY) {
    try {
      console.log("[Image] Falling back to Lovable AI for:", prompt);
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [{
            role: "user",
            content: `Generate an educational illustration for: ${prompt}. Style: clean, professional, suitable for educational materials. High quality, detailed.`
          }],
          modalities: ["image", "text"]
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const imageUrl = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (imageUrl) {
          console.log("[Image] Lovable AI fallback success");
          return imageUrl;
        }
      } else {
        console.warn("[Image] Lovable AI error:", response.status, await response.text());
      }
    } catch (e) {
      console.warn("[Image] Lovable AI failed:", e);
    }
  }

  console.error("[Image] All providers failed for:", prompt);
  return null;
}

async function generateSlides(topic: string, courseTitle: string): Promise<any[]> {
  const systemPrompt = `Ты эксперт по созданию презентаций. Создай структуру слайдов.
Правила:
1. 5-8 слайдов
2. Каждый слайд с заголовком и контентом
3. Логическая структура: введение, основная часть, заключение
4. Ключевые тезисы и примеры
5. Для каждого слайда укажи описание изображения для генерации`;

  const tool = {
    type: "function",
    function: {
      name: "create_slides",
      parameters: {
        type: "object",
        properties: {
          slides: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                content: { type: "string" },
                imagePrompt: { type: "string", description: "Description for AI image generation" }
              },
              required: ["title", "content", "imagePrompt"],
              additionalProperties: false
            }
          }
        },
        required: ["slides"],
        additionalProperties: false
      }
    }
  };

  const result = await generateWithAI(
    `Создай презентацию на тему "${topic}" для курса "${courseTitle}"`,
    systemPrompt,
    tool
  );

  const slides = result.slides || [];
  
  // Generate images for slides
  const slidesWithImages = [];
  for (const s of slides) {
    let imageUrl = null;
    if (s.imagePrompt) {
      try {
        imageUrl = await generateImage(s.imagePrompt);
        await new Promise(r => setTimeout(r, 1500)); // Rate limit delay
      } catch (e) {
        console.error("Failed to generate image for slide:", e);
      }
    }
    slidesWithImages.push({
      id: crypto.randomUUID(),
      title: s.title,
      content: s.content,
      imageUrl: imageUrl
    });
  }

  return slidesWithImages;
}

async function generateTextContent(topic: string, courseTitle: string): Promise<string> {
  const systemPrompt = `Ты эксперт по созданию образовательного контента. Напиши подробный текст для лекции.
Правила:
1. Структурированный текст с заголовками
2. Минимум 300 слов
3. Практические примеры
4. Понятный язык`;

  const result = await generateWithAI(
    `Напиши лекцию на тему "${topic}" для курса "${courseTitle}"`,
    systemPrompt
  );

  return result.content || "";
}

async function generateVideoScript(topic: string, courseTitle: string): Promise<string> {
  const systemPrompt = `Ты эксперт по созданию образовательных видео. Напиши сценарий для короткого обучающего видео (1-2 минуты).
Правила:
1. Чёткая структура: вступление, основная часть, заключение
2. Визуальные указания для каждой сцены
3. Текст для озвучки
4. Длительность каждой сцены
5. Практичный и понятный язык`;

  const result = await generateWithAI(
    `Напиши сценарий короткого обучающего видео на тему "${topic}" для курса "${courseTitle}"`,
    systemPrompt
  );

  return result.content || "";
}

function blocksToMarkdown(blocks: ContentBlock[]): string {
  return blocks.map(block => {
    switch (block.type) {
      case "heading1": return `# ${block.content}\n`;
      case "heading2": return `## ${block.content}\n`;
      case "paragraph": return `${block.content}\n`;
      case "bulletList": return block.content.split('\n').map(item => `- ${item}`).join('\n') + '\n';
      case "numberedList": return block.content.split('\n').map((item, i) => `${i + 1}. ${item}`).join('\n') + '\n';
      default: return `${block.content}\n`;
    }
  }).join('\n');
}

async function setProgress(
  supabase: any,
  courseId: string,
  step: "structure" | "lesson" | "test" | "done" | "error",
  current: number,
  total: number,
  message: string,
) {
  try {
    await supabase
      .from("courses")
      .update({
        generation_progress: {
          step,
          current,
          total,
          message,
          updated_at: new Date().toISOString(),
        },
      })
      .eq("id", courseId);
  } catch (e) {
    console.error("setProgress failed:", e);
  }
}

async function processOneCourse(supabase: any, courseId: string, courseTitle: string) {
  console.log(`Starting generation for course: ${courseTitle}`);

  try {
    await setProgress(supabase, courseId, "structure", 0, 1, "Создаём структуру курса…");
    const lessons = await generateCourseStructure(courseTitle);
    console.log(`Generated ${lessons.length} lessons for ${courseTitle}`);

    const total = lessons.length;
    let current = 0;

    for (const lesson of lessons) {
      current += 1;
      await setProgress(
        supabase,
        courseId,
        lesson.type === "test" ? "test" : "lesson",
        current,
        total,
        `${lesson.type === "test" ? "Тест" : "Урок"} ${current} из ${total}: ${lesson.title}`,
      );

      const { data: lessonData, error: lessonError } = await supabase
        .from("lessons")
        .insert({
          course_id: courseId,
          title: lesson.title,
          type: lesson.type,
          order_index: lesson.order_index,
          content: null
        })
        .select()
        .single();

      if (lessonError) {
        console.error(`Error inserting lesson: ${lessonError.message}`);
        continue;
      }

      await new Promise(r => setTimeout(r, 2000));

      if (lesson.type === "lesson") {
        const blocks = await generateLessonContent(lesson.title, courseTitle);
        const markdown = blocksToMarkdown(blocks);

        await supabase
          .from("lessons")
          .update({ content: markdown })
          .eq("id", lessonData.id);

        console.log(`Generated content for lesson: ${lesson.title}`);
      } else {
        const questions = await generateTestQuestions(lesson.title, courseTitle);

        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          await supabase.from("test_questions").insert({
            lesson_id: lessonData.id,
            question: q.question,
            options: q.options,
            correct_answer: q.correctAnswer,
            order_index: i
          });
        }

        await supabase
          .from("lessons")
          .update({ test_questions_count: questions.length })
          .eq("id", lessonData.id);

        console.log(`Generated ${questions.length} questions for test: ${lesson.title}`);
      }

      await new Promise(r => setTimeout(r, 3000));
    }

    await setProgress(supabase, courseId, "done", total, total, "Генерация завершена");
    console.log(`Completed generation for course: ${courseTitle}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await setProgress(supabase, courseId, "error", 0, 0, `Ошибка: ${msg}`);
    console.error(`Error processing course ${courseTitle}:`, error);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create authenticated client to verify the caller
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user identity
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has appropriate role (organization or admin)
    const { data: roleData } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || (roleData.role !== 'organization' && roleData.role !== 'admin')) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions. Organization or admin role required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get caller's organization for authorization
    const { data: callerProfile } = await supabaseAuth
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    // Rate limiting: 10 AI generation requests per minute per user
    const rl = checkRateLimit(`ai:${user.id}`, { maxRequests: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      return rateLimitResponse(rl, corsHeaders);
    }

    const body = await req.json();
    const { courseId, organizationId, lessonTitle, courseTitle, courseDescription, contentType, existingContent } = body;
    const contextSuffix = existingContent ? `\n\nВАЖНО: В уроке уже есть следующий контент, НЕ ПОВТОРЯЙ его и не дублируй идеи:\n---\n${existingContent.slice(0, 1500)}\n---` : "";

    // Handle description generation
    if (contentType === "description" && courseTitle) {
      console.log(`Generating description for course: ${courseTitle} (user: ${user.id})`);
      const systemPrompt = `Ты эксперт по созданию описаний учебных курсов. Напиши привлекательное и информативное описание курса.
Правила:
1. 2-4 абзаца
2. Опиши цели курса, для кого он подходит, что студент получит
3. Профессиональный тон
4. На русском языке`;
      const result = await generateWithAI(
        `Напиши описание для курса: "${courseTitle}"`,
        systemPrompt
      );
      return new Response(
        JSON.stringify({ success: true, content: result.content || "" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle short description generation
    if (contentType === "short_description" && courseTitle) {
      console.log(`Generating short description for course: ${courseTitle} (user: ${user.id})`);
      const systemPrompt = `Ты эксперт по маркетингу образовательных курсов. Напиши краткое, цепляющее описание курса для каталога.
Правила:
1. Максимум 2-3 предложения
2. Ёмко и привлекательно
3. Подчеркни ключевую ценность курса
4. На русском языке`;
      const prompt = courseDescription
        ? `Напиши краткое описание для каталога. Курс: "${courseTitle}". Полное описание: "${courseDescription}"`
        : `Напиши краткое описание для каталога. Курс: "${courseTitle}"`;
      const result = await generateWithAI(prompt, systemPrompt);
      return new Response(
        JSON.stringify({ success: true, content: result.content || "" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle individual content generation requests
    if (contentType && lessonTitle) {
      console.log(`Generating ${contentType} for: ${lessonTitle} (user: ${user.id})`);
      
      switch (contentType) {
        case "test": {
          const questions = await generateTestQuestions(lessonTitle, courseTitle || "Курс");
          return new Response(
            JSON.stringify({ 
              success: true, 
              content: JSON.stringify(questions) 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        case "slides": {
          const slides = await generateSlides(lessonTitle, courseTitle || "Курс");
          return new Response(
            JSON.stringify({ 
              success: true, 
              content: JSON.stringify(slides) 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        case "text":
        case "lesson": {
          const content = await generateTextContent(lessonTitle, courseTitle || "Курс");
          return new Response(
            JSON.stringify({ 
              success: true, 
              content 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        case "paragraph_text": {
          const customPrompt = body.customPrompt || "";
          const paragraphSystemPrompt = `Ты эксперт по созданию образовательного контента. Напиши развёрнутый текст для блока урока.
Правила:
1. ОБЪЁМ: не менее 700 слов (это жёсткое требование). Раскрой тему глубоко, с примерами, пояснениями, деталями и практическими нюансами.
2. Структура: 5–8 содержательных абзацев, каждый абзац развивает отдельный аспект темы.
3. Подходит для образовательного контекста: понятный язык, логичные переходы между абзацами.
4. На русском языке.
5. Без главного заголовка — только текст (можно выделять подтемы <strong> внутри текста).
6. Используй HTML-форматирование: <p>, <strong>, <em>, <ul>, <li> для выделения ключевых моментов и списков.
7. Без «воды» — каждое предложение должно нести смысл, но раскрывай тему максимально полно.`;

          const prompt = customPrompt
            ? `Напиши развёрнутый текст (минимум 700 слов) по запросу: "${customPrompt}". Контекст: урок "${lessonTitle}" курса "${courseTitle || "Курс"}".${contextSuffix}`
            : `Напиши развёрнутый информативный текстовый блок (минимум 700 слов) по теме "${lessonTitle}" для курса "${courseTitle || "Курс"}". Раскрой тему глубоко: определения, ключевые принципы, примеры применения, типичные ошибки и практические рекомендации.${contextSuffix}`;

          const result = await generateWithAI(prompt, paragraphSystemPrompt);
          return new Response(
            JSON.stringify({ success: true, content: result.content || "" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        case "image": {
          const imageUrl = await generateImage(`${lessonTitle}. Context: ${courseTitle || "educational course"}`);
          return new Response(
            JSON.stringify({ 
              success: true, 
              imageUrl: imageUrl,
              content: imageUrl || ""
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        case "video_script": {
          const script = await generateVideoScript(lessonTitle, courseTitle || "Курс");
          return new Response(
            JSON.stringify({ 
              success: true, 
              content: script
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        case "quiz": {
          const quizSystemPrompt = `Ты эксперт по созданию образовательных мини-квизов. Создай один вопрос с вариантами ответов для проверки понимания материала.
Правила:
1. Один чёткий вопрос по теме
2. 3-4 варианта ответа
3. Только один правильный ответ
4. Краткое пояснение почему ответ правильный
5. На русском языке`;

          const quizTool = {
            type: "function",
            function: {
              name: "create_quiz",
              description: "Создает мини-квиз с вопросом и вариантами ответов",
              parameters: {
                type: "object",
                properties: {
                  question: { type: "string", description: "Вопрос квиза" },
                  options: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        isCorrect: { type: "boolean" }
                      },
                      required: ["text", "isCorrect"],
                      additionalProperties: false
                    }
                  },
                  explanation: { type: "string", description: "Пояснение к правильному ответу" }
                },
                required: ["question", "options", "explanation"],
                additionalProperties: false
              }
            }
          };

          const quizResult = await generateWithAI(
            `Создай мини-квиз по теме "${lessonTitle}" для курса "${courseTitle || "Курс"}"${contextSuffix}`,
            quizSystemPrompt,
            quizTool
          );

          return new Response(
            JSON.stringify({ 
              success: true, 
              quiz: quizResult
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        case "callout": {
          const calloutType = body.calloutType || "info";
          const typeLabels: Record<string, string> = { "callout-info": "информационный блок", "callout-warning": "предупреждение", "callout-tip": "полезный совет" };
          const label = typeLabels[calloutType] || "информационный блок";
          const calloutPrompt = `Ты эксперт по образовательному контенту. Напиши краткий ${label} (1-3 предложения) по теме "${lessonTitle}" для курса "${courseTitle || "Курс"}". Только текст, без заголовков и форматирования. На русском языке.${contextSuffix}`;
          const result = await generateWithAI(calloutPrompt, "Ты пишешь образовательный контент на русском языке.");
          return new Response(
            JSON.stringify({ success: true, content: result.content || "" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        case "quote": {
          const quotePrompt = `Найди или составь вдохновляющую цитату известного человека, связанную с темой "${lessonTitle}" курса "${courseTitle || "Курс"}". Формат: "Текст цитаты" — Автор. На русском языке.${contextSuffix}`;
          const result = await generateWithAI(quotePrompt, "Ты эксперт по образовательному контенту.");
          return new Response(
            JSON.stringify({ success: true, content: result.content || "" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        case "accordion": {
          const accordionTool = {
            type: "function",
            function: {
              name: "create_accordion",
              description: "Создает сворачиваемую секцию с заголовком и содержимым",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Краткий заголовок секции" },
                  content: { type: "string", description: "Подробное содержимое секции" }
                },
                required: ["title", "content"],
                additionalProperties: false
              }
            }
          };
          const accordionResult = await generateWithAI(
            `Создай сворачиваемую секцию с дополнительной информацией по теме "${lessonTitle}" для курса "${courseTitle || "Курс"}". Заголовок должен быть кратким и интригующим, содержимое — подробным и полезным. На русском языке.${contextSuffix}`,
            "Ты эксперт по созданию образовательного контента.",
            accordionTool
          );
          return new Response(
            JSON.stringify({ success: true, accordion: accordionResult }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        default:
          return new Response(
            JSON.stringify({ error: `Unknown content type: ${contentType}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
      }
    }

    // Handle full course generation - verify authorization
    const targetOrgId = organizationId || callerProfile?.organization_id;
    
    // SECURITY: Verify the caller has access to the target organization
    if (roleData.role !== 'admin' && callerProfile?.organization_id !== targetOrgId) {
      return new Response(
        JSON.stringify({ error: "You can only generate content for your own organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let coursesToProcess: Array<{ id: string; title: string }> = [];

    if (courseId) {
      // Verify the course belongs to the caller's organization
      const { data: course } = await supabase
        .from("courses")
        .select("id, title, organization_id")
        .eq("id", courseId)
        .single();
      
      if (course) {
        if (roleData.role !== 'admin' && course.organization_id !== callerProfile?.organization_id) {
          return new Response(
            JSON.stringify({ error: "You can only generate content for courses in your organization" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        coursesToProcess = [{ id: course.id, title: course.title }];
      }
    } else if (targetOrgId) {
      const { data: courses } = await supabase
        .from("courses")
        .select("id, title")
        .eq("organization_id", targetOrgId);

      if (courses) {
        for (const course of courses) {
          const { count } = await supabase
            .from("lessons")
            .select("*", { count: "exact", head: true })
            .eq("course_id", course.id);
          
          if (count === 0) {
            coursesToProcess.push(course);
          }
        }
      }
    }

    if (coursesToProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Нет курсов для обработки" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const backgroundTask = async () => {
      for (const course of coursesToProcess) {
        await processOneCourse(supabase, course.id, course.title);
        await new Promise(r => setTimeout(r, 5000));
      }
      console.log(`Completed processing all ${coursesToProcess.length} courses for user ${user.id}`);
    };

    (globalThis as any).EdgeRuntime?.waitUntil?.(backgroundTask());

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Запущена генерация контента для ${coursesToProcess.length} курсов`,
        courses: coursesToProcess.map(c => c.title)
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
