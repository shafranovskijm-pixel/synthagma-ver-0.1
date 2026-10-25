# Novofon handler authority regressions

Run with the project's installed dependencies from repository root:

```sh
node node_modules/vitest/vitest.mjs run --config supabase/tests/edge/novofon-authority/vitest.config.ts --configLoader native
```

This ordinary one-worker profile executes four actual handlers and the actual shared active-user, platform-sales and caller-RLS boundaries. Explicit local serve, Supabase and Novofon ports trace synthetic requests. No real SDK constructor, vendor request, telephone call, secret or database is used. The acceptance filename keeps this dedicated native-function profile outside the application's default test glob.

Forty-seven cases cover missing/invalid/revoked/blocked original users, operation denial and SDK errors before credential/provider effects, strict permission booleans, foreign recording and lead visibility, trusted row fields, manager-own legacy recording access, ordinary admin/sales success paths, and closed errors/logs. Provider protocol behavior is independently covered by the Classic recipient regression. Inbound webhook signature and SIP/WebRTC recipient configuration remain separate gaps.
