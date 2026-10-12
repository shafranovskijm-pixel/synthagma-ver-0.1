/** No SDK or SMTP dependencies: exercise the actual batching decision in tests. */
export function requireQuotaDecision(value: unknown): asserts value is { allowed: boolean } {
  if (!value || typeof value !== "object" || typeof (value as any).allowed !== "boolean") {
    throw new Error("quota_result_unknown");
  }
}

// A bounded SMTP batch fits comfortably within one Edge invocation. Recipient
// ownership remains with the existing durable run/attempt claims.
export const ORDINARY_SENDER_BATCH_SIZE = 25;

export async function reserveOrdinarySenderBatch(
  pendingCount: number,
  reserve: (count: number) => Promise<{ data: any; error: unknown }>,
) {
  let count = Math.min(ORDINARY_SENDER_BATCH_SIZE, pendingCount);
  if (!Number.isInteger(count) || count < 1) throw new Error("invalid_batch_size");
  // Only an explicit denial proves that no quota was consumed. Transport or
  // malformed responses must retain the uncertain run for manual review.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await reserve(count);
    if (result.error) throw new Error("quota_unknown");
    const payload = Array.isArray(result.data) ? result.data[0] : result.data;
    requireQuotaDecision(payload);
    const quota = payload as { allowed: boolean; ledger_id?: unknown; reason?: unknown; remaining?: unknown };
    if (quota.allowed) {
      if (typeof quota.ledger_id !== "string" || !quota.ledger_id) throw new Error("quota_ledger_unknown");
      return { quota, ledgerId: quota.ledger_id as string, batchSize: count };
    }
    if (attempt === 0 && quota.reason === "daily_limit" && typeof quota.remaining === "number" && Number.isInteger(quota.remaining)
      && quota.remaining > 0 && quota.remaining < count) {
      count = quota.remaining;
      continue;
    }
    return { quota, ledgerId: null, batchSize: 0 };
  }
  throw new Error("quota_unknown");
}

export async function dispatchOrdinaryBatch(
  recipients: Array<{ id: string }>,
  effects: {
    invoke(id: string): Promise<{ data?: any; error?: unknown }>;
    wait(): Promise<void>;
  },
) {
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      const { data, error } = await effects.invoke(recipient.id);
      if (error || data?.recorded !== true || !["sent", "failed"].includes(data?.state)) {
        return { sent, failed, uncertain: true };
      }
      if (data.state === "sent" && data.success === true) sent++;
      else if (data.state === "failed" && data.success === false) failed++;
      else return { sent, failed, uncertain: true };
      await effects.wait();
    } catch {
      return { sent, failed, uncertain: true };
    }
  }
  return { sent, failed, uncertain: false };
}
