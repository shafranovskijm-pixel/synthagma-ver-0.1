/**
 * Pure authorization decision for email-campaign / SMTP Edge Functions.
 * Extracted so it can be unit-tested without hitting Supabase or SMTP.
 *
 * Consumed by:
 *   - supabase/functions-pending-5c1a/run-email-campaign/index.ts
 *   - supabase/functions-pending-5c1a/test-org-smtp/index.ts
 *
 * The Edge Function is responsible for producing `AuthorizeInput` by
 *   1. detecting service-role bearer,
 *   2. calling auth.getUser(),
 *   3. running the two async permission checks (isAdmin, sales.write).
 *
 * The pure function below never leaks details about a resource the
 * caller cannot access — it only returns {ok,status,reason}.
 */

export type CampaignAction =
  | { kind: "run"; scope: "platform" | "org"; organizationId: string | null }
  | { kind: "test_platform_smtp" }
  | { kind: "test_org_smtp"; organizationId: string | null };

export interface AuthorizeInput {
  isServiceRole: boolean;
  hasUser: boolean;
  isAdmin: boolean;
  /** result of can_access_organization(orgId, 'sales.write') for the target org */
  hasSalesWrite: boolean;
}

export interface AuthorizeResult {
  ok: boolean;
  status: number;
  reason?: string;
}

const OK: AuthorizeResult = { ok: true, status: 200 };
const UNAUTH: AuthorizeResult = { ok: false, status: 401, reason: "Unauthorized" };
const FORBID: AuthorizeResult = { ok: false, status: 403, reason: "Forbidden" };
const BAD_REQ = (r: string): AuthorizeResult => ({ ok: false, status: 400, reason: r });

export function authorizeCampaignAction(
  input: AuthorizeInput,
  action: CampaignAction,
): AuthorizeResult {
  // Internal cron / server-to-server calls
  if (input.isServiceRole) return OK;
  if (!input.hasUser) return UNAUTH;

  // Platform-scope actions: admin only
  if (action.kind === "test_platform_smtp") {
    return input.isAdmin ? OK : FORBID;
  }
  if (action.kind === "run" && action.scope === "platform") {
    return input.isAdmin ? OK : FORBID;
  }

  // Org-scope actions
  const orgId =
    action.kind === "run" ? action.organizationId : action.organizationId;
  if (!orgId) return BAD_REQ("organizationId required");

  // Admin has global access; otherwise sales.write on that specific org
  return input.isAdmin || input.hasSalesWrite ? OK : FORBID;
}
