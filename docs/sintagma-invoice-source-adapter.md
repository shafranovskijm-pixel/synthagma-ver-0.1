# Read-only SINTAGMA invoice source

This change adds `search_sintagma_invoices` and `get_sintagma_invoice_export` to the existing MCP definition in `src/lib/mcp/index.ts`. It does not import records into 24ZXC, generate new invoices, send email, or change any source record.

Base commit: `212bddcd5de5ff1bc3c317d3e3d473fe613ac4ef`. Work was isolated on `codex/documents-export`; existing uncommitted changes from the source checkout were not copied.

The coordinating agent verified the authenticated Lovable Settings > Git screen on 2026-09-28: `ORIGINAL SINTAGMA`, project `d57ddcdf-2d1b-42ec-8bfb-3484123b5ff2`, is connected to `shafranovskijm-pixel/synthagma-ver-0.1`, branch `main`, and displayed `In sync` at the same source commit. The local `supabase/config.toml` identifies database project `atxwvjxbqjgkbjlhsdch`. This verifies the repository connection; it does not establish deployment or live operation of these new tools. The old `synthagma-ai-learn` URL in the repository README is not the verified current Git connection.

## Tool contract

Both tools require `source_kind` and `organization_id` (UUID). The accepted source kinds are:

| Kind | Source | Additional scope | Artifact |
| --- | --- | --- | --- |
| `subscription_invoice` | `subscription_invoices` and `organizations` | `company_id` must be absent | Always `artifact_missing`; this table stores invoice data, not the issued original file. |
| `org_billing_document` | `org_billing_documents` and `organizations` | `company_id` must be absent | Signed URL only for an invoice row with an approved `billing-documents` object key. |
| `company_document` | `company_documents` and `companies` | `company_id` required; must belong to `organization_id` | Signed URL only for an invoice row with an approved `documents` object key. |

`search_sintagma_invoices` accepts an optional literal substring `query` (1–100 characters), `limit` (1–50, default 20), and `offset` (0–10000, default 0). It searches invoice numbers for subscription records and stored names for file records. It returns `next_offset` when another page exists. It does not issue download links during search.

`get_sintagma_invoice_export` additionally requires `source_id` (UUID). Example:

```json
{
  "source_kind": "org_billing_document",
  "organization_id": "10000000-0000-4000-8000-000000000001",
  "source_id": "30000000-0000-4000-8000-000000000001"
}
```

The UUIDs above are fictional examples, not client identifiers. For a company document, also supply its `company_id`.

The result includes an allowlisted `client` and `invoice`. A client here is the linked source organization/company, **not a verified email recipient or payer**. Subscription buyer overrides are returned separately. Invoice number/date are `null` for file records because those tables do not have reliable invoice-number/date fields; names are not parsed to invent them. Missing amounts remain `null`. Currency, MIME type and SHA-256 remain `null`: this adapter does not infer them or download/inspect bytes. `created_at` is record creation/upload time, not an inferred invoice date.

For an accepted file key, `artifact.status` is `download_link_issued`, `expires_in_seconds` is 120, and `bytes_verified` is false. Link issuance is not proof that a document is legally correct, unchanged, delivered to CRM, or sent to a client. The downstream importer must download the original bytes, inspect the actual media type, compute its checksum, and persist a source key `(source_system, source_kind, source_id)` for duplicate prevention.

## Authorization and storage boundary

- Existing MCP OAuth authenticates the caller. Tool execution also requires an authenticated context and nonempty user token.
- Supabase is created with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and that user's `Authorization: Bearer …`. Service-role keys are not used.
- Every read checks `can_access_organization(organization_id, 'documents.read')`. The actual table/storage RLS remains active. A role with invoice access but without this permission is intentionally denied until its access model is reviewed.
- Queries filter the exact organization; company IDs are checked against the requested organization before reading documents. File records require invoice type and `deleted_at IS NULL`.
- Projections exclude secrets, passwords and unrelated organization fields. Source database/storage error details are not returned.
- Storage accepts only `billing-documents/{organization_id}/…`, `billing-documents/organizations/{organization_id}/…`, or `documents/company-documents/{company_id}/…` (bucket shown separately from object key). URL strings, traversal, encoded segments, foreign tenants and malformed paths are rejected.
- Historical absolute `file_url` values are not fetched or guessed into storage keys. Unsupported/missing locations return `artifact_missing`; this does not mean the source document never existed.
- Signed URLs are short-lived bearer links and should not be placed in public logs. Source content is data, not instructions to the assistant.

## Local verification

Use the existing locked dependencies:

```powershell
npm exec -- vitest run --config vitest.invoice-source.config.ts
npm exec -- tsc -p tsconfig.invoice-source.json --noEmit
npm run typecheck
```

The dedicated test configuration loads no application Vite plugins and does not regenerate the compiled MCP function. Tests use a fake Supabase query client and prohibit `fetch`; they cover authorization, caller JWT configuration, exact organization/company scope, allowlisted output, soft deletion/type filters, literal query escaping, pagination, missing original artifacts and invalid storage paths.

Local results on 2026-09-28: 27/27 source/SDK-generation tests passed; the scoped MCP TypeScript check passed; `git diff --check` passed. The full application TypeScript check stops at the unchanged `src/utils/__tests__/credentialPrivacy.test.ts:75`: its `String.replaceAll` is not available under the repository's ES2020 library setting. That unrelated baseline file/configuration was left unchanged.

## Generated artifacts and Windows SDK correction

The checked-in `supabase/functions/mcp/index.ts` and `.lovable/mcp/manifest.json` were regenerated locally with the installed SDK 0.23.0. Both contain the original `whoami`/`get_my_profile` tools and the two new invoice tools; the issuer is `https://atxwvjxbqjgkbjlhsdch.supabase.co/auth/v1` and the MCP path is `/functions/v1/mcp`.

The SDK 0.23.0 stock Windows resolver incorrectly treated an absolute drive path as a bare npm package, producing `import mcp from "npm:D:..."` despite an extraction exit code of zero. `scripts/mcp-sdk-windows.mjs` fixes that exact, version-guarded resolver condition for both ESM/CJS files in a private SDK copy under `/.codex-temp/`. It never patches shared `node_modules`. The async Vite config loads this helper before importing the MCP plugin, so build, dev and the direct extraction CLI use the same correction. Non-Windows execution uses the standard plugin. Guard tests reject unexpected source/version changes rather than guessing another patch.

Regenerate without copying secrets or starting the application:

```powershell
$env:VITE_SUPABASE_PROJECT_ID='atxwvjxbqjgkbjlhsdch'
node .\node_modules\@lovable.dev\mcp-js\dist\cli\extract-manifest.cjs
```

The SDK emits type-erased JavaScript into an `.ts` filename. Direct `deno check` reports implicit-any/literal-inference errors on that generated output, while the authored source passes the scoped TypeScript check. Do not hand-edit the generated output to suppress those errors or mistake extraction exit zero for runtime verification.

The actual generated artifact also passed `supabase/tests/mcp_runtime.test.ts` in Deno 2.2.12 with `--no-check --allow-env --deny-net`: the test captures the handler instead of starting a server, imports the compiled bundle, and verifies HTTP 401 plus the OAuth discovery challenge for an unauthenticated request. This is a runtime/authentication-boundary smoke check, not authenticated invoice-export acceptance.

```powershell
$env:DENO_DIR='D:\Codex\cache\deno'
& 'D:\Codex\tools\deno-2.2.12\bin\deno.exe' test --no-config --no-lock --no-check --allow-env --deny-net supabase/tests/mcp_runtime.test.ts
```

No deployment, OAuth discovery, actual user login, live RLS check, source-file download, CRM import or email delivery is claimed by local generation/tests. The historical `documents` bucket's public/private setting was not changed or verified on production.
