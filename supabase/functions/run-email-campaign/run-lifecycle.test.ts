import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dispatchOrdinaryBatch, requireQuotaDecision, reserveOrdinarySenderBatch } from "./run-lifecycle";

const recipients = [{ id: "one" }, { id: "two" }];
const wait = async () => {};

describe("selected organization sender bounded reservation", () => {
  it("reserves at most 25 and keeps its exact ledger", async () => {
    const reserve = vi.fn().mockResolvedValue({ data: [{ allowed: true, ledger_id: "ledger" }], error: null });
    expect(await reserveOrdinarySenderBatch(1000, reserve)).toMatchObject({ batchSize: 25, ledgerId: "ledger" });
    expect(reserve).toHaveBeenCalledExactlyOnceWith(25);
  });
  it("retries only once with an explicitly unconsumed daily remainder", async () => {
    const reserve = vi.fn().mockResolvedValueOnce({ data: [{ allowed: false, reason: "daily_limit", remaining: 7 }], error: null })
      .mockResolvedValueOnce({ data: [{ allowed: true, ledger_id: "ledger" }], error: null });
    expect((await reserveOrdinarySenderBatch(100, reserve)).batchSize).toBe(7);
    expect(reserve.mock.calls).toEqual([[25], [7]]);
  });
  it("does not retry again if another campaign consumes the reported remainder", async () => {
    const reserve = vi.fn().mockResolvedValue({ data: [{ allowed: false, reason: "daily_limit", remaining: 7 }], error: null });
    expect((await reserveOrdinarySenderBatch(100, reserve)).batchSize).toBe(0);
    expect(reserve).toHaveBeenCalledTimes(2);
  });
  it.each([
    { data: null, error: new Error("timeout") }, { data: null, error: null },
    { data: [{ allowed: true }], error: null }, { data: [{}], error: null },
  ])("never retries an unknown or unconfirmed reservation %j", async result => {
    const reserve = vi.fn().mockResolvedValue(result);
    await expect(reserveOrdinarySenderBatch(100, reserve)).rejects.toThrow();
    expect(reserve).toHaveBeenCalledOnce();
  });
  it("does not dispatch or retry with zero available quota", async () => {
    const reserve = vi.fn().mockResolvedValue({ data: [{ allowed: false, reason: "daily_limit", remaining: 0 }], error: null });
    expect((await reserveOrdinarySenderBatch(100, reserve)).batchSize).toBe(0);
    expect(reserve).toHaveBeenCalledOnce();
  });
});

describe("ordinary run fail-closed batching", () => {
  it.each([undefined, null, {}, { allowed: "true" }])("rejects unknown quota %s", (quota) => {
    expect(() => requireQuotaDecision(quota)).toThrow("quota_result_unknown");
  });
  it.each([true, false])("accepts an explicit quota decision %s", (allowed) => {
    expect(() => requireQuotaDecision({ allowed })).not.toThrow();
  });
  it("counts only explicit recorded outcomes, including known failures", async () => {
    const invoke = vi.fn().mockResolvedValueOnce({ data: { success: true, recorded: true, state: "sent" } })
      .mockResolvedValueOnce({ data: { success: false, recorded: true, state: "failed" } });
    expect(await dispatchOrdinaryBatch(recipients, { invoke, wait })).toEqual({ sent: 1, failed: 1, uncertain: false });
  });
  it.each([
    { error: new Error("timeout") }, {}, { data: { success: true } },
    { data: { success: false, recorded: true, state: "uncertain" } },
    { data: { success: false, recorded: false, state: "claimed" } },
    { data: { success: false, recorded: true, state: "sent" } },
  ])("halts without retry/next-recipient on uncertain response %s", async (response) => {
    const invoke = vi.fn().mockResolvedValue(response);
    expect((await dispatchOrdinaryBatch(recipients, { invoke, wait })).uncertain).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("stops when invocation rejects", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("transport"));
    expect((await dispatchOrdinaryBatch(recipients, { invoke, wait })).uncertain).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe("handler integration guards", () => {
  const source = readFileSync(resolve(__dirname, "index.ts"), "utf8");
  it("preflights the platform sender before claim, materialization and quota", () => {
    const preflight = source.indexOf("platformSmtp(pool");
    const claim = source.indexOf('admin.rpc("claim_ordinary_campaign_run"');
    const resolver = source.indexOf('"resolve_campaign_recipients",');
    const quota = source.indexOf('admin.rpc("consume_email_quota"');
    expect(preflight).toBeGreaterThan(0);
    expect(claim).toBeGreaterThan(preflight);
    expect(resolver).toBeGreaterThan(claim);
    expect(quota).toBeGreaterThan(resolver);
    expect(source).toContain("p_expected_updated_at: campaign.updated_at");
  });
  it("never reclaims a five-minute sending run or writes raw campaign status", () => {
    expect(source).not.toContain("5 * 60 * 1000");
    expect(source).not.toMatch(/\.update\(\{\s*status:/);
    expect(source).toContain("body: { campaignId, recipientId, runToken }");
  });
  it.each(["process-scheduled-campaigns", "process-paused-campaigns"])("%s only delegates, checks auth and nested result", (handler) => {
    const cron = readFileSync(resolve(__dirname, `../${handler}/index.ts`), "utf8");
    expect(cron).not.toContain(".update(");
    expect(cron).toContain("bearer !== SERVICE_KEY");
    expect(cron).toContain("data?.ok === true && data?.started > 0");
  });
});
