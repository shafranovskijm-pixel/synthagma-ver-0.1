import { SmtpDeliveryError } from "../_shared/smtp-sender.ts";

export interface OrdinaryAttemptIdentity {
  campaignId: string;
  recipientId: string;
  runToken: string;
  attemptToken: string;
}

export type OrdinaryState = "claimed" | "dispatching" | "sent" | "failed" | "uncertain";
export interface OrdinaryClaimResult {
  claimed: boolean;
  reason?: string;
  attempt_token?: string;
  state?: string;
}
export interface OrdinaryTransitionResult {
  transitioned: boolean;
  reason?: string;
  state?: string;
}
export interface OrdinaryAttemptStore {
  claim(identity: OrdinaryAttemptIdentity): Promise<OrdinaryClaimResult>;
  transition(identity: OrdinaryAttemptIdentity, state: OrdinaryState, messageId: string | null, category: string | null): Promise<OrdinaryTransitionResult>;
}
export interface OrdinaryDispatchResult {
  success: boolean;
  recorded: boolean;
  state: string;
  error_category?: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validOrdinaryIdentity(value: OrdinaryAttemptIdentity): boolean {
  return [value.campaignId, value.recipientId, value.runToken, value.attemptToken]
    .every(token => typeof token === "string" && uuid.test(token));
}

/** One request owns at most one durable attempt. No retry or stale claim recovery. */
export class OrdinaryDispatch {
  private phase: "unclaimed" | OrdinaryState = "unclaimed";
  private ownsClaim = false;
  readonly messageId: string;

  constructor(private readonly identity: OrdinaryAttemptIdentity, private readonly store: OrdinaryAttemptStore) {
    this.messageId = `<sintagma.ordinary.${identity.attemptToken}@sintagma.com.ru>`;
  }

  async claim(): Promise<OrdinaryDispatchResult | null> {
    if (!validOrdinaryIdentity(this.identity) || this.ownsClaim) {
      return { success: false, recorded: false, state: this.phase, error_category: "invalid_claim" };
    }
    const result = await this.store.claim(this.identity);
    if (!result.claimed || result.attempt_token !== this.identity.attemptToken) {
      return { success: false, recorded: false, state: result.state || "unclaimed", error_category: result.reason || "claim_rejected" };
    }
    this.ownsClaim = true;
    this.phase = "claimed";
    return null;
  }

  private async record(state: OrdinaryState, category: string | null): Promise<OrdinaryDispatchResult> {
    if (!this.ownsClaim) return { success: false, recorded: false, state: this.phase, error_category: "claim_required" };
    const result = await this.store.transition(this.identity, state,
      state === "dispatching" ? this.messageId : null, category);
    if (!result.transitioned || result.state !== state) {
      return { success: false, recorded: false, state: result.state || this.phase, error_category: result.reason || "transition_rejected" };
    }
    this.phase = state;
    return { success: state === "sent", recorded: true, state, ...(category ? { error_category: category } : {}) };
  }

  /** Only errors before dispatch/transport can take this path. */
  async failBeforeSmtp(category: string): Promise<OrdinaryDispatchResult> {
    if (this.phase !== "claimed") return { success: false, recorded: false, state: this.phase, error_category: category };
    try {
      return await this.record("failed", category);
    } catch {
      return { success: false, recorded: false, state: this.phase, error_category: "finalization_unavailable" };
    }
  }

  private async settleTransportFailure(error: unknown): Promise<OrdinaryDispatchResult> {
    const definite = error instanceof SmtpDeliveryError && error.delivery === "not_sent";
    try {
      return await this.record(definite ? "failed" : "uncertain", definite ? "smtp_rejected" : "smtp_outcome_unknown");
    } catch {
      return { success: false, recorded: false, state: "uncertain", error_category: "finalization_unavailable" };
    }
  }

  async dispatch(transport: (messageId: string) => Promise<unknown>): Promise<OrdinaryDispatchResult> {
    if (this.phase !== "claimed") return { success: false, recorded: false, state: this.phase, error_category: "claim_required" };
    let transition: OrdinaryDispatchResult;
    try {
      // Stable Message-ID is durable before the first SMTP call.
      transition = await this.record("dispatching", null);
    } catch {
      // The DB may have accepted the transition even when its response was lost.
      return { success: false, recorded: false, state: "uncertain", error_category: "dispatch_transition_unavailable" };
    }
    if (!transition.recorded) return transition;
    try {
      await transport(this.messageId);
    } catch (error) {
      return this.settleTransportFailure(error);
    }
    try {
      const sent = await this.record("sent", null);
      if (sent.recorded) return sent;
    } catch { /* accepted SMTP + unavailable durable result is not a failed send */ }
    try {
      const uncertain = await this.record("uncertain", "accepted_storage_unconfirmed");
      return { ...uncertain, success: false };
    } catch {
      return { success: false, recorded: false, state: "uncertain", error_category: "accepted_storage_unconfirmed" };
    }
  }
}
