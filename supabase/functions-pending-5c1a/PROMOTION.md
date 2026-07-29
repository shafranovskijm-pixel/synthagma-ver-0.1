# Phase 5C.1.a — Promotion procedure (do not deploy yet)

These files live outside `supabase/functions/` so Lovable does not
auto-deploy them. When Phase 5C.1.a is ready to ship, promote them
in the exact order below.

## Safe deploy order

1. **Deploy new Edge Functions first** (they still work against the
   current, permissive RLS). Do this *before* applying the RLS
   migration, so no window exists where cron/service-role calls run
   against tighter RLS with the old code.
2. **Verify** the new functions in production: run a platform test as
   admin, an org test as owner and as sales.write staff, confirm that
   sales.read and student callers get 403.
3. **Apply RLS migration** `20260729_email_rls_hardening.sql`.
4. **Verify again** end-to-end: campaign launch, recipients CRUD,
   SMTP test, cron `email-ab-pick-winner`.
5. Delete `supabase/functions-pending-5c1a/` and the pending SQL file
   after everything is green.

## File-by-file promotion

### `run-email-campaign`

Copy contents of
`supabase/functions-pending-5c1a/run-email-campaign/index.ts`
into
`supabase/functions/run-email-campaign/index.ts`.

**Import paths:** no changes required — this function does not import
from `_shared`.

### `test-org-smtp`

Copy contents of
`supabase/functions-pending-5c1a/test-org-smtp/index.ts`
into
`supabase/functions/test-org-smtp/index.ts`.

**Import path — REQUIRED REWRITE:**

```
- import { sendSmtpEmail, sendPlatformEmail, getPlatformSmtpConfig } from "../../functions/_shared/smtp-sender.ts";
+ import { sendSmtpEmail, sendPlatformEmail, getPlatformSmtpConfig } from "../_shared/smtp-sender.ts";
```

The pending file uses `../../functions/_shared/...` because it
physically sits in `supabase/functions-pending-5c1a/test-org-smtp/`,
which is two levels above the `_shared` folder. After promotion the
file sits in `supabase/functions/test-org-smtp/`, one level above
`_shared`, so the path becomes `../_shared/smtp-sender.ts`. Deploying
without this rewrite yields a `Module not found` error at cold start.

### Migration

`supabase/migrations-pending-5c1a/20260729_email_rls_hardening.sql`
→ move to `supabase/migrations/` only after step 2 above.

## Pre-deploy checks

Run these on the promoted, deploy-ready copies:

```
# TS/type checks over the whole repo
bunx tsgo --noEmit

# Unit + contract tests
bunx vitest run

# Deno check on each promoted Edge Function
deno check supabase/functions/run-email-campaign/index.ts
deno check supabase/functions/test-org-smtp/index.ts
```

Any failure → abort promotion and fix in the pending directory first.
