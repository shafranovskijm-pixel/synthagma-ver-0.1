/**
 * Shared GigaChat client with OAuth token caching, Russian CA certs,
 * slot-based parallel request pool, and Lovable AI fallback.
 */

import { createSberHttpClient } from "./russian-ca.ts";
import { logAiOperation, readAiResponseJson, parseAiToolJson, fetchAiResponse, readAiResponseText } from "./ai-observability.ts";

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
  }

  // Add third slot only if the key is configured
  const key3 = Deno.env.get("GIGACHAT_AUTH_KEY_3");
  if (key3) {
    slots.push({
      name: "slot-2",
      authKeyEnv: "GIGACHAT_AUTH_KEY_3",
      cachedToken: null,
      tokenExpiresAt: 0,
      lock: Promise.resolve(),
      releaseLock: null,
      busy: false,
    });
  }

  logAiOperation("log", "pool_ready");

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

  const response = await fetchAiResponse(
    "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
    fetchOpts,
  );

  if (!response.ok) {
    const errorText = await readAiResponseText(response);
    logAiOperation("error", "oauth_failed", response.status);
    throw new Error(`GigaChat OAuth failed: ${response.status}`);
  }

  const data = await readAiResponseJson(response);
  slot.cachedToken = data.access_token;
  slot.tokenExpiresAt = Math.floor(data.expires_at / 1000);
  logAiOperation("log", "oauth_ready");
  return slot.cachedToken!;
}

// ═══════════════════════════════════════════════════════════
// Raw GigaChat API call (uses a specific slot)
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// Moderation response detection
// ═══════════════════════════════════════════════════════════
const MODERATION_PATTERNS = [
  "чувствительн",
  "временно ограничен",
  "языковая модель",
  "генеративные языковые модели",
  "некорректные ответы",
  "неправильного толкования",
  "не обладает собственным мнением",
  "не могу помочь с этим",
  "разговоры на некоторые темы",
  "потенциально опасн",
];

function isModerationResponse(text: string): boolean {
  if (!text || text.length < 20) return false;
  const lower = text.toLowerCase();
  const matchCount = MODERATION_PATTERNS.filter(p => lower.includes(p.toLowerCase())).length;
  // 2+ pattern matches = moderation response
  return matchCount >= 2;
}

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

  const response = await fetchAiResponse(
    "https://gigachat.devices.sberbank.ru/api/v1/chat/completions",
    fetchOpts,
  );

  if (!response.ok) {
    const errorText = await readAiResponseText(response);
    logAiOperation("error", "request_failed", response.status);
    if (response.status === 402) {
      throw new Error("GigaChat 402: Payment required — tokens exhausted");
    }
    if (response.status === 429) {
      throw new Error("GigaChat rate limit exceeded (429)");
    }
    throw new Error(`GigaChat API error: ${response.status}`);
  }

  const result = await readAiResponseJson(response);
  const content = result.choices?.[0]?.message?.content || "";

  // Detect moderation responses (GigaChat returns HTTP 200 but with refusal text)
  if (isModerationResponse(content)) {
    logAiOperation("warn", "content_moderated");
    throw new Error("[MODERATION] GigaChat content moderation triggered");
  }

  return content;
}

// ═══════════════════════════════════════════════════════════
// GigaChat with slot pool + 429 retry + model fallback chain
// ═══════════════════════════════════════════════════════════
const GIGACHAT_MODEL_CHAIN = ["GigaChat-Max", "GigaChat-Pro", "GigaChat"];

export async function callGigaChatOnSlot(
  slotIdx: number,
  messages: Array<{ role: string; content: string }>,
  model = "GigaChat-Pro",
  maxTokens = 4096,
): Promise<string> {
  const slot = slots[slotIdx];
  const modelsToTry = [model, ...GIGACHAT_MODEL_CHAIN.filter((m) => m !== model)];

  let rateLimitRetries = 0;
  const MAX_RATE_RETRIES = 3;

  for (const m of modelsToTry) {
    try {
      logAiOperation("log", "request_started");
      const result = await _rawCallGigaChat(slot, messages, m, maxTokens);
      logAiOperation("log", "request_succeeded");
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logAiOperation("warn", "request_failed");

      // Moderation: don't try other models, immediately propagate
      if (msg.includes("[MODERATION]")) {
        logAiOperation("warn", "content_moderated");
        throw err;
      }

      if (msg.includes("402")) {
        logAiOperation("log", "request_started");
        continue;
      }

      if (msg.includes("429")) {
        rateLimitRetries++;
        const waitTime = Math.min(15000 * rateLimitRetries, 45000);
        logAiOperation("log", "rate_limited");
        await new Promise((r) => setTimeout(r, waitTime));
        if (rateLimitRetries < MAX_RATE_RETRIES) {
          // Retry same model after waiting
          modelsToTry.splice(modelsToTry.indexOf(m), 0, m);
        }
        continue;
      }
      continue;
    }
  }

  throw new Error(`All GigaChat models exhausted on ${slot.name}`);
}

export async function callGigaChat(
  messages: Array<{ role: string; content: string }>,
  model = "GigaChat-Pro",
  maxTokens = 4096,
): Promise<string> {
  const slotIdx = await acquireSlot();
  logAiOperation("log", "request_started");

  try {
    return await callGigaChatOnSlot(slotIdx, messages, model, maxTokens);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Moderation: don't try other slots, propagate immediately for Lovable AI fallback
    if (msg.includes("[MODERATION]")) {
      throw err;
    }

    // If all models on this slot are exhausted, try remaining slots
    if (msg.includes("exhausted") && slots.length > 1) {
      releaseSlot(slotIdx, 0);
      const triedIndices = new Set<number>([slotIdx]);
      logAiOperation("log", "request_failed");

      while (triedIndices.size < slots.length) {
        const retryIdx = await acquireSlot();
        if (triedIndices.has(retryIdx)) {
          releaseSlot(retryIdx);
          // All slots tried
          break;
        }
        triedIndices.add(retryIdx);
        logAiOperation("log", "request_started");
        try {
          const result = await callGigaChatOnSlot(retryIdx, messages, model, maxTokens);
          releaseSlot(retryIdx);
          return result;
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          releaseSlot(retryIdx, 0);
          if (!retryMsg.includes("exhausted")) {
            throw retryErr;
          }
          logAiOperation("log", "request_failed");
        }
      }
      throw err;
    }

    throw err;
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
      logAiOperation("log", "retry_wait");
      await new Promise((r) => setTimeout(r, delay));
    }

    let response: Response;
    try {
      response = await fetchAiResponse("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens }),
      });
    } catch (fetchErr) {
      logAiOperation("warn", "network_failed");
      if (attempt === MAX_RETRIES - 1) throw new Error("AI gateway: network error after retries");
      continue;
    }

    if (response.status === 402) {
      try { await readAiResponseText(response); } catch {}
      throw new Error("Требуется пополнение баланса ИИ-кредитов (402)");
    }
    if (response.status === 429) {
      try { await readAiResponseText(response); } catch {}
      throw new Error("AI rate limit exceeded (429)");
    }

    let text: string;
    try {
      text = await readAiResponseText(response);
    } catch (bodyErr) {
      logAiOperation("warn", "read_failed");
      if (attempt === MAX_RETRIES - 1) throw new Error("AI gateway: failed to read response body");
      continue;
    }

    if (!response.ok) {
      logAiOperation("error", "request_failed", response.status);
      if (attempt === MAX_RETRIES - 1) throw new Error(`AI gateway error: ${response.status}`);
      continue;
    }

    if (!text || text.trim() === "") {
      logAiOperation("warn", "empty_response");
      if (attempt === MAX_RETRIES - 1) throw new Error("AI gateway returned empty response");
      continue;
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      logAiOperation("error", "invalid_response");
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

  const response = await fetchAiResponse("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
    const errorText = await readAiResponseText(response);
    logAiOperation("error", "request_failed", response.status);
    throw new Error(`AI error: ${response.status}`);
  }

  const result = await readAiResponseJson(response);

  if (tool) {
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");
    return parseAiToolJson(toolCall.function.arguments);
  } else {
    return { content: result.choices?.[0]?.message?.content || "" };
  }
}

// ═══════════════════════════════════════════════════════════
// Universal AI caller: Lovable AI first → GigaChat fallback
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// Round-Robin distribution across all providers
// ═══════════════════════════════════════════════════════════
let rrCounter = 0;

// Helper: wait for a specific slot to become free, then use it directly
async function useSlotDirect(
  slotIdx: number,
  msgs: Array<{ role: string; content: string }>,
  model: string,
  maxTokens: number,
): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (slots[slotIdx].busy) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Slot ${slotIdx} busy timeout (30s)`);
    await Promise.race([
      slots[slotIdx].lock,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Slot ${slotIdx} busy timeout (30s)`)), remaining)),
    ]);
  }
  slots[slotIdx].busy = true;
  const prev = slots[slotIdx].lock;
  slots[slotIdx].lock = new Promise<void>((resolve) => {
    slots[slotIdx].releaseLock = resolve;
  });
  await prev;
  try {
    return await callGigaChatOnSlot(slotIdx, msgs, model, maxTokens);
  } finally {
    releaseSlot(slotIdx);
  }
}

export async function callAIRoundRobin(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 4096,
  gigachatModel?: string,
  lovableModel?: string,
  taskIndex?: number,
): Promise<{ text: string; model: string }> {
  const gcModel = gigachatModel || "GigaChat-Pro";
  const lModel = lovableModel || "google/gemini-2.5-flash";

  // Build channels dynamically — only GigaChat slots for round-robin, Lovable AI as last fallback
  const channels: Array<{
    name: string;
    call: (msgs: Array<{ role: string; content: string }>, mt: number) => Promise<{ text: string; model: string }>;
  }> = [];

  // GigaChat slots first — primary channels for 3-slot round-robin
  channels.push({
    name: `GigaChat slot-0 (${gcModel})`,
    call: async (msgs, mt) => {
      const text = await useSlotDirect(0, msgs, gcModel, mt);
      return { text, model: `${gcModel} (slot-0)` };
    },
  });

  if (slots.length > 1) {
    channels.push({
      name: `GigaChat slot-1 (${gcModel})`,
      call: async (msgs, mt) => {
        const text = await useSlotDirect(1, msgs, gcModel, mt);
        return { text, model: `${gcModel} (slot-1)` };
      },
    });
  }

  if (slots.length > 2) {
    channels.push({
      name: `GigaChat slot-2 (${gcModel})`,
      call: async (msgs, mt) => {
        const text = await useSlotDirect(2, msgs, gcModel, mt);
        return { text, model: `${gcModel} (slot-2)` };
      },
    });
  }

  // Lovable AI as last fallback only
  channels.push({
    name: `Lovable AI (${lModel})`,
    call: async (msgs, mt) => {
      const text = await callLovableAI(msgs, mt, lModel);
      return { text, model: lModel };
    },
  });

  // Deterministic routing across GigaChat slots only (exclude Lovable AI fallback)
  const gcSlotCount = Math.min(slots.length, 3);
  const startIdx = taskIndex !== undefined ? (taskIndex % gcSlotCount) : (rrCounter++ % gcSlotCount);
  const taskLabel = taskIndex !== undefined ? `task#${taskIndex}` : `rr#${rrCounter - 1}`;
  let count402 = 0;
  let lastError: Error | null = null;

  logAiOperation("log", "request_started");

  for (let attempt = 0; attempt < channels.length; attempt++) {
    const chIdx = (startIdx + attempt) % channels.length;
    const channel = channels[chIdx];
    try {
      logAiOperation("log", "provider_fallback");
      const result = await channel.call(messages, maxTokens);
      if (attempt > 0) {
        logAiOperation("log", "request_succeeded");
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const reason = msg.includes("402") ? "402 (tokens exhausted)"
        : msg.includes("429") ? "429 (rate limited)"
        : msg.includes("[MODERATION]") ? "moderation"
        : msg.includes("exhausted") ? "all-models-exhausted"
        : "other";
      logAiOperation("warn", "request_failed");
      lastError = err instanceof Error ? err : new Error(msg);
      if (msg.includes("402")) count402++;

      // Moderation: skip remaining GigaChat slots, jump to Lovable AI fallback
      if (msg.includes("[MODERATION]")) {
        logAiOperation("warn", "content_moderated");
        // Find Lovable AI channel (last one) and try it directly
        const lovableChannel = channels[channels.length - 1];
        if (lovableChannel.name.includes("Lovable AI")) {
          try {
            logAiOperation("log", "provider_fallback");
            return await lovableChannel.call(messages, maxTokens);
          } catch (lovErr) {
            logAiOperation("error", "request_failed");
            throw lovErr;
          }
        }
        throw err;
      }

      // 429 — короткая пауза перед переключением на следующий канал, чтобы не штормить пул
      if (msg.includes("429") && attempt < channels.length - 1) {
        logAiOperation("log", "rate_limited");
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  if (count402 === channels.length) {
    throw new Error("402: All AI channels exhausted — tokens depleted on all providers");
  }
  throw lastError || new Error("All AI channels exhausted (round-robin)");
}

export async function callAI(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 4096,
  preferredProvider?: string,
  gigachatModel?: string,
  lovableModel?: string,
  taskIndex?: number,
): Promise<{ text: string; model: string }> {
  const gcModel = gigachatModel || "GigaChat-Max";
  const lModel = lovableModel || "google/gemini-2.5-pro";

  if (preferredProvider === "lovable_ai") {
    try {
      const text = await callLovableAI(messages, maxTokens, lModel);
      return { text, model: lModel };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logAiOperation("warn", "request_failed");
      const text = await callGigaChat(messages, gcModel, maxTokens);
      return { text, model: gcModel };
    }
  }

  if (preferredProvider === "round_robin") {
    return callAIRoundRobin(messages, maxTokens, gigachatModel, lovableModel, taskIndex);
  }

  if (preferredProvider === "gigachat") {
    try {
      // Deterministic slot routing when taskIndex is provided
      if (taskIndex !== undefined && slots.length > 1) {
        const slotIdx = taskIndex % slots.length;
        logAiOperation("log", "request_started");
        const text = await useSlotDirect(slotIdx, messages, gcModel, maxTokens);
        return { text, model: `${gcModel} (slot-${slotIdx})` };
      }
      const text = await callGigaChat(messages, gcModel, maxTokens);
      return { text, model: gcModel };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logAiOperation("warn", "request_failed");
      const text = await callLovableAI(messages, maxTokens, lModel);
      return { text, model: lModel };
    }
  }

  // Default: Lovable AI first, GigaChat as fallback
  try {
    const text = await callLovableAI(messages, maxTokens, lModel);
    return { text, model: lModel };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logAiOperation("warn", "provider_fallback");
    const text = await callGigaChat(messages, gcModel, maxTokens);
    return { text, model: gcModel };
  }
}

// ═══════════════════════════════════════════════════════════
// Universal AI caller with tool support
// ═══════════════════════════════════════════════════════════
export async function callAIWithTools(
  messages: Array<{ role: string; content: string }>,
  tool?: any,
  gigachatModel = "GigaChat-Max",
  lovableModel = "google/gemini-2.5-pro",
  preferredProvider?: string,
  taskIndex?: number,
): Promise<any> {
  const jsonHint = tool
    ? `\n\nОтветь СТРОГО в формате JSON, соответствующем следующей структуре: ${JSON.stringify(tool.function.parameters)}. Без markdown-обёртки, только JSON.`
    : "";

  const makeGcMessages = () => {
    const systemMsg = messages.find((m) => m.role === "system");
    const userMsg = messages.find((m) => m.role === "user");
    return [
      { role: "system", content: (systemMsg?.content || "") + jsonHint },
      { role: "user", content: userMsg?.content || "" },
    ];
  };

  const parseGcResponse = (text: string) => {
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    if (!tool) {
      return { content: cleaned || text };
    }

    const tryParse = (value: string) => {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    };

    const direct = tryParse(cleaned);
    if (direct !== null) return direct;

    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      const extracted = tryParse(objectMatch[0]);
      if (extracted !== null) return extracted;
    }

    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const extracted = tryParse(arrayMatch[0]);
      if (extracted !== null) return extracted;
    }

    throw new SyntaxError("AI_TOOL_RESPONSE_INVALID");
  };

  // Round-robin mode: distribute across 3 GigaChat API slots only
  if (taskIndex !== undefined && preferredProvider !== "gigachat") {
    // Build channels: [GigaChat slot-0, slot-1, slot-2] — strictly 3 streams
    type Channel = { name: string; call: () => Promise<any> };
    const channels: Channel[] = [];
    for (let si = 0; si < slots.length; si++) {
      const slotIdx = si;
      channels.push({
        name: `GigaChat slot-${slotIdx} (${gigachatModel})`,
        call: async () => {
          const text = await useSlotDirect(slotIdx, makeGcMessages(), gigachatModel, 8192);
          return parseGcResponse(text);
        },
      });
    }

    const startIdx = taskIndex % channels.length;
    const taskLabel = `toolsRR-task#${taskIndex}`;
    logAiOperation("log", "request_started");

    for (let attempt = 0; attempt < channels.length; attempt++) {
      const chIdx = (startIdx + attempt) % channels.length;
      const channel = channels[chIdx];
      try {
        logAiOperation("log", "provider_fallback");
        return await channel.call();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logAiOperation("warn", "request_failed");

        // Moderation: skip remaining GigaChat slots, go to Lovable AI
        if (msg.includes("[MODERATION]")) {
          logAiOperation("warn", "content_moderated");
          break;
        }
      }
    }

    // Last resort: try Lovable AI if all GigaChat slots failed
    try {
      logAiOperation("log", "provider_fallback");
      return await callLovableAIWithTools(messages, tool, lovableModel);
    } catch (fallbackErr) {
      const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      logAiOperation("error", "request_failed");
    }
    throw new Error("All AI channels exhausted in callAIWithTools round-robin");
  }

  if (preferredProvider === "gigachat") {
    try {
      if (taskIndex !== undefined && slots.length > 1) {
        const slotIdx = taskIndex % slots.length;
        logAiOperation("log", "request_started");
        const text = await useSlotDirect(slotIdx, makeGcMessages(), gigachatModel, 8192);
        return parseGcResponse(text);
      }
      const text = await callGigaChat(makeGcMessages(), gigachatModel, 8192);
      return parseGcResponse(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logAiOperation("warn", "request_failed");
      return await callLovableAIWithTools(messages, tool, lovableModel);
    }
  }

  // Default: Lovable AI first, GigaChat as fallback
  try {
    return await callLovableAIWithTools(messages, tool, lovableModel);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logAiOperation("warn", "request_failed");
    try {
      const text = await callGigaChat(makeGcMessages(), gigachatModel, 8192);
      return parseGcResponse(text);
    } catch (gcErr) {
      throw gcErr;
    }
  }
}
