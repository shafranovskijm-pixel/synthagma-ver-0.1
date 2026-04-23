/**
 * Shared GigaChat client with OAuth token caching, Russian CA certs,
 * slot-based parallel request pool, and Lovable AI fallback.
 */

import { createSberHttpClient } from "./russian-ca.ts";

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

  console.log(`[GigaChat] Pool initialized with ${slots.length} slot(s)`);

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
  const content = result.choices?.[0]?.message?.content || "";

  // Detect moderation responses (GigaChat returns HTTP 200 but with refusal text)
  if (isModerationResponse(content)) {
    console.warn(`[GigaChat][${slot.name}] [MODERATION] Detected moderation response for model ${model}: "${content.substring(0, 150)}..."`);
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
      console.log(`[GigaChat][${slot.name}] Trying model: ${m}`);
      const result = await _rawCallGigaChat(slot, messages, m, maxTokens);
      console.log(`[GigaChat][${slot.name}] Success with model: ${m}`);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[GigaChat][${slot.name}] Model ${m} failed: ${msg}`);

      // Moderation: don't try other models, immediately propagate
      if (msg.includes("[MODERATION]")) {
        console.warn(`[GigaChat][${slot.name}] Moderation detected — skipping all remaining GigaChat models`);
        throw err;
      }

      if (msg.includes("402")) {
        console.log(`[GigaChat][${slot.name}] Model ${m} has no tokens (402), trying next model...`);
        continue;
      }

      if (msg.includes("429")) {
        rateLimitRetries++;
        const waitTime = Math.min(15000 * rateLimitRetries, 45000);
        console.log(`[GigaChat][${slot.name}] Rate limited on ${m}, waiting ${waitTime / 1000}s (attempt ${rateLimitRetries}/${MAX_RATE_RETRIES})...`);
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
  console.log(`[GigaChat] Acquired ${slots[slotIdx].name}`);

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
      console.log(`[GigaChat] Slot ${slots[slotIdx].name} exhausted, trying remaining ${slots.length - 1} slots...`);

      while (triedIndices.size < slots.length) {
        const retryIdx = await acquireSlot();
        if (triedIndices.has(retryIdx)) {
          releaseSlot(retryIdx);
          // All slots tried
          break;
        }
        triedIndices.add(retryIdx);
        console.log(`[GigaChat] Retry on ${slots[retryIdx].name} (${triedIndices.size}/${slots.length})`);
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
          console.log(`[GigaChat] Slot ${slots[retryIdx].name} also exhausted`);
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

  console.log(`[AI-RR] ${taskLabel} → startChannel=${startIdx}/${channels.length} (${channels[startIdx].name})`);

  for (let attempt = 0; attempt < channels.length; attempt++) {
    const chIdx = (startIdx + attempt) % channels.length;
    const channel = channels[chIdx];
    try {
      console.log(`[AI-RR] ${taskLabel} → ${channel.name}${attempt > 0 ? ` (fallback after slot-${(startIdx + attempt - 1) % channels.length})` : ""}`);
      const result = await channel.call(messages, maxTokens);
      if (attempt > 0) {
        console.log(`[AI-RR] ${taskLabel} ✓ recovered on ${channel.name} after ${attempt} failed channel(s)`);
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const reason = msg.includes("402") ? "402 (tokens exhausted)"
        : msg.includes("429") ? "429 (rate limited)"
        : msg.includes("[MODERATION]") ? "moderation"
        : msg.includes("exhausted") ? "all-models-exhausted"
        : "other";
      console.warn(`[AI-RR] ${taskLabel} ✗ ${channel.name} failed: ${reason} — ${msg.substring(0, 200)}`);
      lastError = err instanceof Error ? err : new Error(msg);
      if (msg.includes("402")) count402++;

      // Moderation: skip remaining GigaChat slots, jump to Lovable AI fallback
      if (msg.includes("[MODERATION]")) {
        console.warn(`[AI-RR] ${taskLabel} Moderation detected — skipping to Lovable AI fallback`);
        // Find Lovable AI channel (last one) and try it directly
        const lovableChannel = channels[channels.length - 1];
        if (lovableChannel.name.includes("Lovable AI")) {
          try {
            console.log(`[AI-RR] ${taskLabel} → ${lovableChannel.name} (moderation fallback)`);
            return await lovableChannel.call(messages, maxTokens);
          } catch (lovErr) {
            console.error(`[AI-RR] Lovable AI moderation fallback also failed:`, lovErr);
            throw lovErr;
          }
        }
        throw err;
      }

      // 429 — короткая пауза перед переключением на следующий канал, чтобы не штормить пул
      if (msg.includes("429") && attempt < channels.length - 1) {
        console.log(`[AI-RR] ${taskLabel} 429 backoff: waiting 1s before next channel`);
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
      console.warn("[callAI] Lovable AI (preferred) failed, falling back to GigaChat:", msg);
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
        console.log(`[callAI] GigaChat deterministic routing: taskIndex=${taskIndex} → slot-${slotIdx}`);
        const text = await useSlotDirect(slotIdx, messages, gcModel, maxTokens);
        return { text, model: `${gcModel} (slot-${slotIdx})` };
      }
      const text = await callGigaChat(messages, gcModel, maxTokens);
      return { text, model: gcModel };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[callAI] GigaChat failed, falling back to Lovable AI:", msg);
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
    console.warn("[callAI] Lovable AI unavailable, falling back to GigaChat:", msg);
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

    throw new SyntaxError(`AI returned non-JSON content for tool call: ${cleaned.slice(0, 200)}`);
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
    console.log(`[callAIWithTools-RR] ${taskLabel} → startChannel=${startIdx}/${channels.length} (${channels[startIdx].name})`);

    for (let attempt = 0; attempt < channels.length; attempt++) {
      const chIdx = (startIdx + attempt) % channels.length;
      const channel = channels[chIdx];
      try {
        console.log(`[callAIWithTools-RR] ${taskLabel} → ${channel.name}${attempt > 0 ? " (fallback)" : ""}`);
        return await channel.call();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[callAIWithTools-RR] ${channel.name} failed: ${msg}`);

        // Moderation: skip remaining GigaChat slots, go to Lovable AI
        if (msg.includes("[MODERATION]")) {
          console.warn(`[callAIWithTools-RR] ${taskLabel} Moderation detected — jumping to Lovable AI`);
          break;
        }
      }
    }

    // Last resort: try Lovable AI if all GigaChat slots failed
    try {
      console.log(`[callAIWithTools-RR] ${taskLabel} → Lovable AI (last fallback)`);
      return await callLovableAIWithTools(messages, tool, lovableModel);
    } catch (fallbackErr) {
      const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      console.error(`[callAIWithTools-RR] Lovable AI fallback also failed: ${msg}`);
    }
    throw new Error("All AI channels exhausted in callAIWithTools round-robin");
  }

  if (preferredProvider === "gigachat") {
    try {
      if (taskIndex !== undefined && slots.length > 1) {
        const slotIdx = taskIndex % slots.length;
        console.log(`[callAIWithTools] GigaChat deterministic routing: taskIndex=${taskIndex} → slot-${slotIdx}`);
        const text = await useSlotDirect(slotIdx, makeGcMessages(), gigachatModel, 8192);
        return parseGcResponse(text);
      }
      const text = await callGigaChat(makeGcMessages(), gigachatModel, 8192);
      return parseGcResponse(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[callAIWithTools] GigaChat failed, falling back to Lovable AI:", msg);
      return await callLovableAIWithTools(messages, tool, lovableModel);
    }
  }

  // Default: Lovable AI first, GigaChat as fallback
  try {
    return await callLovableAIWithTools(messages, tool, lovableModel);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[callAIWithTools] Lovable AI failed, falling back to GigaChat:", msg);
    try {
      const text = await callGigaChat(makeGcMessages(), gigachatModel, 8192);
      return parseGcResponse(text);
    } catch (gcErr) {
      throw gcErr;
    }
  }
}
