# Novofon Classic recipient regression

Run from the repository root with installed project dependencies:

```sh
node node_modules/vitest/vitest.mjs run --config supabase/tests/edge/novofon-recipient/vitest.config.ts --configLoader native
```

This ordinary Vitest profile executes the real whole shared Novofon module with synthetic environment and fetch ports. Three Deno std URL imports use local Node encoding/MD5 equivalents; actual production WebCrypto HMAC is checked against independent Node goldens. No vendor request, phone call, real secret, SDK constructor or database is used.

The explicit acceptance.ts suite and its dedicated configuration avoid changing the application's default Vitest configuration or interpreting Deno imports in unrelated tests. Fourteen cases cover exact primary GET/POST signing and results, same-host credential order, forbidden second host, redirects and URL-origin changes, fixed Classic errors and unchanged CallAPI/DataAPI requests. Other JSON-RPC error handling, inbound webhook authentication and SIP/WebRTC provider configuration are outside this fix.
