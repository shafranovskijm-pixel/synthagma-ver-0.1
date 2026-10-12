# S-004 mailing beta: sender management and staff permissions

Active employees with `sales.write` were rejected by email endpoints using the nonexistent `email.manage` permission. Several mailing tables instead relied on the organization in the user's profile, allowing ordinary learners or staff without write permission through a different path. Sender settings also lacked an edit RPC and a consistent invalidation rule for successful connection tests.

## Result

- Twenty-three existing mailing policies now separate `sales.read` from `sales.write`; ten restrictive account-deletion policies remain intact. Existing campaign, campaign-recipient and organization-SMTP policies are preserved.
- Seven existing mailing RPCs use the same write permission and reject revoked accounts. Contact import and report-link mutations are included. No scheduler, cron, campaign status or existing business row is changed by the migration.
- `save_mailing_sender(p_sender_id uuid, p_organization_id uuid, p_settings jsonb, p_password text default null)` returns only `{id}`. A null sender creates an inactive draft; a null password during editing retains the stored password. Settings are whitelisted; verification fields and arbitrary keys are rejected. IMAP currently requires SSL/TLS when configured, matching the actual client implementation.
- `set_mailing_sender_active(p_sender_id uuid, p_organization_id uuid, p_is_active boolean)` returns `{id,is_active}`. Activation requires successful SMTP and IMAP checks. Disabling also pauses warmup.
- A table trigger covers RPC and older direct writes. SMTP-setting changes reset SMTP verification; IMAP-setting changes reset IMAP verification; shared-password changes reset both. Such changes deactivate the sender and pause warmup. Cosmetic edits retain verification. Existing service-only verification writes remain possible.
- Table SELECT grants that overrode secret-column isolation are removed for `authenticated`, `anon` and PUBLIC on `mailing_senders`, `mailing_deliverability_seeds` and `org_smtp_settings`. Authenticated users retain SELECT for every known non-secret column. Service-role access and existing non-SELECT grants are preserved.

Six Edge endpoints use caller-scoped authorization and reject non-POST requests before database work: `mailing-sender-test`, `mailing-deliverability-worker`, `test-org-smtp`, `mailing-deliverability-seed-test`, `mailing-seed-send`, `prepare-fast-campaign`. The existing cron/service paths are retained. Response revision: `X-Sintagma-Function-Revision: s004-mailing-beta-20261012`.

Sender, seed and organization-SMTP tests save verification only if `updated_at` still matches the configuration tested. The auth-only SMTP client now handles split multiline replies, partial writes and STARTTLS, with bounded network operations. It never issues MAIL FROM, RCPT TO or DATA. A late socket connection resolving after the connection timeout may still need cleanup; no claim of comprehensive transport testing is made.

## Local evidence

`validation-atomic.json`: 47 assertions passed against disposable in-memory PostgreSQL using saved production catalog definitions and synthetic rows. The exact transaction passed 50 asserting postchecks, recorded the exact migration source, rejected replay, and rolled back policy/function/ACL changes after an injected ledger error. Synthetic business mutations were rolled back. The encryption primitive is an explicit deterministic test stub; the real trigger/RPC call path is used, but production encryption is not attested by this fixture.

Six Deno tests passed for write authorization, tenant mismatch, revocation, denied lookups, fragmented SMTP replies, partial writes, STARTTLS and secret-free error messages. `deno check` passed for all six endpoints. A small existing TypeScript control-flow problem in `fast-campaign-schedule.ts` was corrected by iterating the same pairs with `for...of`; scheduling rules are unchanged.

```powershell
node supabase/tests/prepare-mailing-beta.mjs CATALOG_JSON CONTACT_REPORT_RPC_JSON
node supabase/tests/test-mailing-beta-access.mjs CATALOG_JSON CONTACT_REPORT_RPC_JSON --bundle
deno test supabase/functions/_shared/mailing-authorization.test.ts supabase/functions/_shared/smtp-auth-only.test.ts
```

The two metadata inputs are saved read-only catalog results outside the repository. The generator never connects to production. It checks exact existing function definitions, policy definitions and secret-table ACLs before replacing anything.

## Release gates

1. Save `backup-before.sql` and `backup-contact-report-rpcs.sql` catalog outputs. Run `preflight.sql`; any drift is a stop condition for review, not a reason to weaken a guard.
2. Apply all of `release-transaction.sql` in **one** SQL-editor request. The transaction takes release/ledger locks, rejects an existing version, validates the exact source, applies the migration, records it in the existing migration ledger, runs all assertions and commits. A failure must roll back the whole request.
3. Save `release_result`: `committed=true`, `checks_passed=50`, `ledger_source_match=true`, `preserved_security=true`. Run `postcheck.sql` independently and compare the exact ledger source. Verify staff visibility without changing real sender rows or launching warmup.
4. Deploy the six Edge endpoints with their shared imports and the frontend separately. The SQL package alone does not deploy them. Safe GET/OPTIONS checks establish revision and method guards; actual account connection and message delivery are separate acceptance gates.

Migration normalized MD5: `73551f845a2946581879961f4676fb3a`.

Atomic transaction SHA-256: `5bf1609873f2f1ac9f304ecff1045bc18222d269d0fde550b52cadc6a7978f13`.

At preparation time no production migration, mail send, warmup activation or cron change was performed by this package's author. Root release coordination owns application and live verification.
