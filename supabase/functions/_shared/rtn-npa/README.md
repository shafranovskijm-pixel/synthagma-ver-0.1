# Managed normative-source checks

The user endpoint requires a genuine `getUser` and the caller's ordinary queue
RPC before a service-only lease can run. The separate cron endpoint imports the
existing generated `cron-auth.ts` unchanged. `verify_jwt=false` permits those
explicit server checks; it does not grant browser/service authority.

HTTP202 is only a durable queued/running receipt. The client reloads the actual
workspace outcome. Unknown, unsupported, incomplete or changed sources never
invent a renewal; PostgreSQL computes admission/expiry. No new answer keys are
approved by these workers, and old learning snapshots/results remain immutable.

The initial adapter supports exact116-ФЗ and the A1 industrial question PDF.
The source verifier starts at the live fixed official service page, uses the
existing unique-link parsers through the latest catalog/A1 section, and saves
exact PDF bytes to a run-bound immutable private object. Old claim URLs are not
fetch targets. The three catalog HTML responses are processed but not archived
in v1. Other question families/adapters remain unknown/partial, not proven.

Whole observation cap90s; source chain35s within it; HTTP/private upload15s;
separate completion RPC10s. Actual response bodies and storage transports are
aborted, not only outer promises. An uncertain completion is never hidden by a
second completion. Public official transport carries no project credentials;
credentialed SDK traffic cannot leave the configured project API origin/paths.

The official current-text service advertises plain HTTP:8000. Hashes preserve
exact decoded UTF8 legal text, not a signature/TLS assertion. Runtime egress is
an actual fixed identity/current-date request when connected; no connected
official transport means false/deny. Real production egress is a separate gate.

## Portable isolated checks

Node22, no dependency installation:

```sh
node supabase/functions/_shared/rtn-npa/tests/run-node-tests.mjs
```

Deno2.1.4 with the pinned actual SDK (use a private `DENO_DIR` cache):

```sh
deno check --no-config --no-lock --node-modules-dir=none \
  supabase/functions/rtn-npa-check/index.ts \
  supabase/functions/rtn-npa-cron/index.ts \
  supabase/functions/_shared/rtn-npa/tests/deno-import.test.ts
deno test --no-config --no-lock --node-modules-dir=none --deny-env --deny-net \
  supabase/functions/_shared/rtn-npa/tests/deno-import.test.ts
```

The145 Node cases use explicit synthetic adapters and offline public-law/
publication fixtures; no graded bank or private answers are included. The two
Deno tests load the real SDK2.90.1 and execute synthetic auth/RPC/private PDF
upload transports with environment/network permission denied. These tests do
not prove actual OAuth, regional egress, real bucket/SQL acceptance or a managed
schedule. The prospective separate hourly cron is configured during release,
not by importing these modules. Shared package/lock/dependency files are unchanged.
