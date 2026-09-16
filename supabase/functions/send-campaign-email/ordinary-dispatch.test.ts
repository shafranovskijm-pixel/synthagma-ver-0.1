import { describe, expect, it, vi } from "vitest";
import { OrdinaryDispatch, type OrdinaryAttemptIdentity, type OrdinaryAttemptStore, type OrdinaryState } from "./ordinary-dispatch";
import { SmtpDeliveryError } from "../_shared/smtp-sender";

vi.mock("../_shared/rate-limiter.ts", () => ({ checkRateLimit: vi.fn() }));

const identity: OrdinaryAttemptIdentity = {
  campaignId: "00000000-0000-4000-8000-000000000001",
  recipientId: "00000000-0000-4000-8000-000000000002",
  runToken: "00000000-0000-4000-8000-000000000003",
  attemptToken: "00000000-0000-4000-8000-000000000004",
};

function ledger() {
  let row: { identity: OrdinaryAttemptIdentity; state: OrdinaryState; messageId: string | null } | null = null;
  const events: string[] = [];
  const claim = vi.fn(async (id: OrdinaryAttemptIdentity) => {
    if (id.runToken !== identity.runToken || id.campaignId !== identity.campaignId || id.recipientId !== identity.recipientId) {
      return { claimed: false, reason: "run_mismatch" };
    }
    if (row) return { claimed: false, state: row.state, reason: "attempt_exists" };
    row = { identity: id, state: "claimed", messageId: null };
    events.push("claimed");
    return { claimed: true, attempt_token: id.attemptToken, state: "claimed" };
  });
  const transition = vi.fn(async (id: OrdinaryAttemptIdentity, state: OrdinaryState, messageId: string | null, category: string | null) => {
    if (!row || JSON.stringify(row.identity) !== JSON.stringify(id)) return { transitioned: false, reason: "claim_mismatch" };
    const allowed = row.state === "claimed" ? ["dispatching", "failed"] : row.state === "dispatching" ? ["sent", "uncertain", ...(category === "smtp_rejected" ? ["failed"] : [])] : [];
    if (!allowed.includes(state)) return { transitioned: false, state: row.state, reason: "terminal_attempt" };
    if (state === "dispatching") row.messageId = messageId;
    row.state = state;
    events.push(state);
    return { transitioned: true, state, smtp_message_id: row.messageId };
  });
  return { store: { claim, transition } as OrdinaryAttemptStore, claim, transition, events, row: () => row };
}

describe("ordinary dispatch durable safety boundary", () => {
  it("two simultaneous dispatch requests cause exactly one SMTP call", async () => {
    const db = ledger();
    const first = new OrdinaryDispatch(identity, db.store);
    const second = new OrdinaryDispatch({ ...identity, attemptToken: "00000000-0000-4000-8000-000000000005" }, db.store);
    const transport = vi.fn(async () => undefined);
    const outcomes = await Promise.all([first, second].map(async attempt => {
      const rejected = await attempt.claim();
      return rejected || attempt.dispatch(transport);
    }));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(outcomes.filter(value => value.recorded && value.state === "sent")).toHaveLength(1);
    expect(db.events).toEqual(["claimed", "dispatching", "sent"]);
  });

  it("persists a stable Message-ID before the first transport call", async () => {
    const db = ledger();
    const attempt = new OrdinaryDispatch(identity, db.store);
    await attempt.claim();
    const result = await attempt.dispatch(async messageId => {
      expect(db.row()).toMatchObject({ state: "dispatching", messageId });
      expect(messageId).toBe(`<sintagma.ordinary.${identity.attemptToken}@sintagma.com.ru>`);
    });
    expect(result).toEqual({ success: true, recorded: true, state: "sent" });
    expect((await attempt.dispatch(vi.fn())).recorded).toBe(false);
  });

  it("missing run token rejects without even calling the store", async () => {
    const db = ledger();
    const attempt = new OrdinaryDispatch({ ...identity, runToken: "" }, db.store);
    expect(await attempt.claim()).toMatchObject({ recorded: false, error_category: "invalid_claim" });
    expect(await attempt.failBeforeSmtp("arbitrary")).toMatchObject({ recorded: false });
    expect(db.claim).not.toHaveBeenCalled();
    expect(db.transition).not.toHaveBeenCalled();
  });

  it.each(["runToken", "campaignId", "recipientId"] as const)("mismatched %s cannot mutate another recipient", async key => {
    const db = ledger();
    const attempt = new OrdinaryDispatch({ ...identity, [key]: "00000000-0000-4000-8000-000000000099" }, db.store);
    expect(await attempt.claim()).toMatchObject({ recorded: false, error_category: "run_mismatch" });
    const transport = vi.fn();
    expect(await attempt.dispatch(transport)).toMatchObject({ recorded: false });
    expect(db.row()).toBeNull();
    expect(db.transition).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it("known pre-SMTP rejection finalizes once without invoking transport", async () => {
    const db = ledger();
    const attempt = new OrdinaryDispatch(identity, db.store);
    await attempt.claim();
    expect(await attempt.failBeforeSmtp("suppression_lookup_failed")).toMatchObject({ recorded: true, state: "failed", error_category: "suppression_lookup_failed" });
    expect(db.events).toEqual(["claimed", "failed"]);
    expect(await attempt.dispatch(vi.fn())).toMatchObject({ recorded: false });
  });

  it("only typed transport proof permits dispatching to failed", async () => {
    const db = ledger();
    const attempt = new OrdinaryDispatch(identity, db.store);
    await attempt.claim();
    const result = await attempt.dispatch(async () => { throw new SmtpDeliveryError("RCPT rejected", "not_sent"); });
    expect(result).toMatchObject({ recorded: true, state: "failed", error_category: "smtp_rejected" });
    expect(db.events).toEqual(["claimed", "dispatching", "failed"]);
  });

  it.each([new SmtpDeliveryError("DATA reply lost", "unknown"), new Error("SMTP rejected maybe")])("uncertain/untyped transport errors never become failed or automatically resend", async error => {
    const db = ledger();
    const attempt = new OrdinaryDispatch(identity, db.store);
    await attempt.claim();
    const transport = vi.fn(async () => { throw error; });
    expect(await attempt.dispatch(transport)).toMatchObject({ recorded: true, state: "uncertain" });
    const retry = new OrdinaryDispatch(identity, db.store);
    expect(await retry.claim()).toMatchObject({ recorded: false, state: "uncertain" });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(db.events).toEqual(["claimed", "dispatching", "uncertain"]);
  });

  it("SMTP acceptance followed by failed durable finalization becomes uncertain, never failed", async () => {
    const db = ledger();
    const original = db.store.transition;
    db.store.transition = async (...args) => {
      if (args[1] === "sent") throw new Error("DB unavailable after 250");
      return original(...args);
    };
    const attempt = new OrdinaryDispatch(identity, db.store);
    await attempt.claim();
    expect(await attempt.dispatch(async () => undefined)).toMatchObject({ success: false, recorded: true, state: "uncertain", error_category: "accepted_storage_unconfirmed" });
    expect(db.events).toEqual(["claimed", "dispatching", "uncertain"]);
  });

  it("lost finalization acknowledgement cannot overwrite a committed sent result", async () => {
    const db = ledger();
    const original = db.store.transition;
    db.store.transition = async (...args) => {
      const result = await original(...args);
      if (args[1] === "sent") throw new Error("response lost");
      return result;
    };
    const attempt = new OrdinaryDispatch(identity, db.store);
    await attempt.claim();
    expect(await attempt.dispatch(async () => undefined)).toMatchObject({ success: false, recorded: false, state: "sent" });
    expect(db.row()?.state).toBe("sent");
    expect(db.events).toEqual(["claimed", "dispatching", "sent"]);
  });

  it("uncertain dispatch-transition acknowledgement makes zero SMTP calls", async () => {
    const db = ledger();
    const attempt = new OrdinaryDispatch(identity, db.store);
    await attempt.claim();
    db.store.transition = async () => { throw new Error("write outcome unavailable"); };
    const transport = vi.fn();
    expect(await attempt.dispatch(transport)).toMatchObject({ recorded: false, state: "uncertain" });
    expect(transport).not.toHaveBeenCalled();
  });
});
