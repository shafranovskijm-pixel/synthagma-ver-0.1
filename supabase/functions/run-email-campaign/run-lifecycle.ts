/** No SDK or SMTP dependencies: exercise the actual batching decision in tests. */
export function requireQuotaDecision(value: unknown): asserts value is { allowed: boolean } {
  if (!value || typeof value !== "object" || typeof (value as any).allowed !== "boolean") {
    throw new Error("quota_result_unknown");
  }
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
