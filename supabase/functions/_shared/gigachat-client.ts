/**
 * Shared GigaChat client with OAuth token caching, TLS bypass, and Lovable AI fallback.
 */

// Cached OAuth token
let cachedToken: string | null = null;
let tokenExpiresAt = 0; // in seconds (unix)

/**
 * Create an HTTP client that bypasses TLS verification for Sber domains.
 * Returns undefined if Deno.createHttpClient is not available (older runtimes).
 */
function createInsecureClient(): Deno.HttpClient | undefined {
  try {
    // @ts-ignore — Deno.createHttpClient may not exist in all runtimes
    if (typeof Deno.createHttpClient === "function") {
      // @ts-ignore
      return Deno.createHttpClient({ caCerts: [], proxy: undefined });
    }
  } catch {
    // not available
  }
  return undefined;
}

const httpClient = createInsecureClient();

async function getGigaChatToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // Reuse token if valid for at least 5 more minutes
  if (cachedToken && tokenExpiresAt > now + 300) {
    return cachedToken;
  }

  const authKey = Deno.env.get("GIGACHAT_AUTH_KEY");
  if (!authKey) throw new Error("GIGACHAT_AUTH_KEY is not configured");

  const rquid = crypto.randomUUID();

  const fetchOpts: RequestInit & { client?: Deno.HttpClient } = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "RqUID": rquid,
      "Authorization": `Basic ${authKey}`,
    },
    body: "scope=GIGACHAT_API_PERS",
  };
  if (httpClient) (fetchOpts as any).client = httpClient;

  const response = await fetch(
    "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
    fetchOpts
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("GigaChat OAuth error:", response.status, errorText);
    throw new Error(`GigaChat OAuth failed: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  // BUGFIX: expires_at comes in MILLISECONDS from Sber API, convert to seconds
  tokenExpiresAt = Math.floor(data.expires_at / 1000);
  console.log(`[GigaChat] OAuth token obtained, expires in ${tokenExpiresAt - now}s`);
  return cachedToken!;
}

/**
 * Call GigaChat API directly.
 * Model options: GigaChat-2, GigaChat-2-Pro, GigaChat-2-Max
 */
export async function callGigaChat(
  messages: Array<{ role: string; content: string }>,
  model = "GigaChat-2-Pro",
  maxTokens = 4096
): Promise<string> {
  const token = await getGigaChatToken();

  const fetchOpts: RequestInit & { client?: Deno.HttpClient } = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  };
  if (httpClient) (fetchOpts as any).client = httpClient;

  const response = await fetch(
    "https://gigachat.devices.sberbank.ru/api/v1/chat/completions",
    fetchOpts
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("GigaChat API error:", response.status, errorText);
    if (response.status === 429) {
      throw new Error("GigaChat rate limit exceeded");
    }
    throw new Error(`GigaChat API error: ${response.status}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || "";
}

/**
 * Call Lovable AI Gateway (Gemini) as fallback.
 * Retries up to 3 times on transient errors, but surfaces 402/429 immediately.
 */
export async function callLovableAI(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 4096,
  model = "google/gemini-2.5-flash"
): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = attempt * 3000;
      console.log(`[LovableAI] retry ${attempt + 1}/${MAX_RETRIES}, waiting ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
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

/**
 * Call Lovable AI with tool calling support (for structured output).
 * Used by generate-course-content and generate-course-structure.
 */
export async function callLovableAIWithTools(
  messages: Array<{ role: string; content: string }>,
  tool?: any,
  model = "google/gemini-3-flash-preview"
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

/**
 * Universal AI caller: tries GigaChat first, falls back to Lovable AI.
 * Returns { text, model } so callers know which provider was used.
 */
export async function callAI(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 4096
): Promise<{ text: string; model: string }> {
  try {
    const text = await callGigaChat(messages, "GigaChat-2-Pro", maxTokens);
    return { text, model: "GigaChat-2-Pro" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[callAI] GigaChat unavailable, falling back to Lovable AI:", msg);
    const text = await callLovableAI(messages, maxTokens);
    return { text, model: "Gemini 2.5 Flash" };
  }
}

/**
 * Universal AI caller with tool support: tries GigaChat (text mode + JSON parse),
 * falls back to Lovable AI with proper tool calling.
 */
export async function callAIWithTools(
  messages: Array<{ role: string; content: string }>,
  tool?: any,
  gigachatModel = "GigaChat-2-Pro",
  lovableModel = "google/gemini-3-flash-preview"
): Promise<any> {
  // Try GigaChat first (no tool calling support, use JSON prompt)
  try {
    const systemMsg = messages.find(m => m.role === "system");
    const userMsg = messages.find(m => m.role === "user");
    
    const jsonHint = tool
      ? `\n\nОтветь СТРОГО в формате JSON, соответствующем следующей структуре: ${JSON.stringify(tool.function.parameters)}. Без markdown-обёртки, только JSON.`
      : "";

    const gcMessages = [
      { role: "system", content: (systemMsg?.content || "") + jsonHint },
      { role: "user", content: userMsg?.content || "" },
    ];

    const text = await callGigaChat(gcMessages, gigachatModel, 8192);
    
    // Parse JSON from GigaChat response
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
