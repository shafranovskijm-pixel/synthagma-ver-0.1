import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type TelegramDomainAction =
  | "special_offer_request"
  | "organization_registration"
  | "support_request"
  | "organization_telegram_test"
  | "subscription_upgrade";

export type TelegramDomainDelivery =
  | "sent"
  | "pending"
  | "duplicate"
  | "rate_limited"
  | "configuration_error";

interface DeliveryInput {
  action: TelegramDomainAction;
  entityId: string;
  actorKey: string;
  maxRequests: number;
  windowSeconds: number;
  targetChatId: string;
  message: string;
  photoUrl?: string | null;
}

const CHAT_ID_PATTERN = /^-?\d{5,20}$/;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function supportTelegramChatId(): string {
  return Deno.env.get("TELEGRAM_SUPPORT_CHAT_ID")?.trim() || "";
}

export function clientAddress(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return req.headers.get("cf-connecting-ip")?.trim()
    || req.headers.get("x-real-ip")?.trim()
    || forwarded
    || "unknown";
}

export function isTrustedSupabaseStorageUrl(url: string | null, supabaseUrl: string): boolean {
  if (!url || !supabaseUrl) return false;
  try {
    const candidate = new URL(url);
    const expected = new URL(supabaseUrl);
    return candidate.origin === expected.origin && candidate.pathname.startsWith("/storage/v1/object/");
  } catch {
    return false;
  }
}

export async function deliverTelegramDomainNotification(
  admin: SupabaseClient,
  input: DeliveryInput,
): Promise<TelegramDomainDelivery> {
  const targetChatId = input.targetChatId.trim();
  if (!CHAT_ID_PATTERN.test(targetChatId) || !input.message.trim()) {
    return "configuration_error";
  }

  const actorHash = await sha256(`${input.action}:${input.actorKey}`);
  const dedupKey = `telegram-domain:${input.action}:${input.entityId}`;
  const { data: claim, error: claimError } = await admin.rpc(
    "claim_telegram_domain_delivery",
    {
      _dedup_key: dedupKey,
      _action: input.action,
      _actor_hash: actorHash,
      _max_requests: input.maxRequests,
      _window_seconds: input.windowSeconds,
    },
  );

  if (claimError) {
    console.error("telegram domain delivery claim failed", {
      action: input.action,
      code: claimError.code || "unknown",
    });
    return "pending";
  }
  if (claim === "duplicate") return "duplicate";
  if (claim === "rate_limited") return "rate_limited";
  if (claim !== "claimed") return "pending";

  try {
    const body: Record<string, string> = {
      chat_id: targetChatId,
      message: input.message,
    };
    if (input.photoUrl) body.photo_url = input.photoUrl;

    const { data, error } = await admin.functions.invoke(
      "send-telegram-notification",
      { body },
    );
    if (
      !error &&
      data &&
      typeof data === "object" &&
      (data as Record<string, unknown>).success === true
    ) {
      return "sent";
    }
  } catch {
    // Once the relay was invoked, its outcome may be ambiguous. The durable
    // claim remains and blocks automatic duplicates.
  }

  return "pending";
}
