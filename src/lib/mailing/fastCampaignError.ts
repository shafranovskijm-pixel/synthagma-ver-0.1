export interface FastCampaignErrorDetails {
  code: string;
  requestId?: string;
}

interface FunctionErrorLike {
  message?: string;
  context?: {
    clone?: () => {
      json?: () => Promise<unknown>;
      text?: () => Promise<string>;
    };
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
  };
}

function detailsFromPayload(payload: unknown): FastCampaignErrorDetails | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const code = typeof record.error === "string" ? record.error.trim() : "";
  if (!code) return null;
  const requestId = typeof record.request_id === "string" ? record.request_id.trim() : "";
  return { code, ...(requestId ? { requestId } : {}) };
}

export async function resolveFastCampaignError(
  data: unknown,
  error: FunctionErrorLike | null | undefined,
): Promise<FastCampaignErrorDetails> {
  const direct = detailsFromPayload(data);
  if (direct) return direct;

  const context = error?.context;
  if (context) {
    const readable = typeof context.clone === "function" ? context.clone() : context;
    try {
      if (typeof readable.json === "function") {
        const parsed = detailsFromPayload(await readable.json());
        if (parsed) return parsed;
      }
    } catch {
      // Some gateways return text even when the function response is JSON.
    }

    const textReadable = typeof context.clone === "function" ? context.clone() : context;
    try {
      if (typeof textReadable.text === "function") {
        const raw = await textReadable.text();
        const parsed = detailsFromPayload(JSON.parse(raw));
        if (parsed) return parsed;
      }
    } catch {
      // Fall through to the SDK error message.
    }
  }

  return { code: String(error?.message || "prepare_fast_campaign_failed") };
}
