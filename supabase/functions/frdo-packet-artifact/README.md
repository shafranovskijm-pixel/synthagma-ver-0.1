# UC020 persisted FRDO packets

The HTTP entry is `index.ts`; it imports only `runtime.bundle.js`. The generated ESM bundle contains the same canonical J mapper, official donor workbooks, writer, complete readback, strict XML adapter and actual HTTP/REST orchestration. The manifest records the exact source and dependency hashes. No runtime npm download or second exporter is used. Keep the deployed entry, bundle and manifest in this function directory rather than `_shared`. The permanent build source for the exact embedded donors lives in `supabase/build/frdo-packet-artifact/ownedDonors.ts`; its bytes are compiled into the bundle and are not duplicated inside the deployed function directory.

## Build

Use the repository's locked dependencies and an independently unpacked `@xmldom/xmldom@0.9.12` package. Its official archive integrity and all 15 package-file hashes are fixed in `xml-package-integrity.json`. The builder refuses another package/version/byte set, esbuild version, external import or bundle above 4,500,000 bytes. It does not install packages, access the network or read provider secrets.

`node scripts/build-frdo-packet-function.mjs --xmldom-dir ABSOLUTE_ISOLATED_XMLDOM_0_9_12_DIRECTORY`

Commit the generated `index.ts`, `runtime.bundle.js` and `bundle-source-manifest.json` together with their inputs. The manifest records the current measured bundle size and digest; rebuild and inspect it whenever an input changes. The XML adapter refuses every parser diagnostic and DTD/entity declarations; it never replaces a global DOM implementation.

## Authority and lifecycle

The handler authenticates the original bearer, validates closed request/response schemas and rechecks the current organization, scope, every retained subject and exact source/CAS state. Fixed service operations derive authority from the stored original actor and request; caller-supplied actor/service fields are rejected. Do not expose internal service RPCs as a general impersonation API.

Preview and freeze do not allocate an official number or approve law. Reviewed actual training dates are explicit sourced supplement facts; planned calendar dates and document issue dates are not substitutes. Unknown issuer regime stays unconfirmed. Joint issuance is unsupported. A checksum alone is never authority.

Generated files are private, immutable, exact-byte read back and linked to a captured packet. Historical artifacts remain separate from current source state. Internal handover, an operator-declared external upload fact and an imported result receipt are separate actions. This function does not submit to FIS FRDO. Workbook `signing.status` remains `not_verified`; no cryptographic signature or legal approval is implied.

## Reproducible isolated Deno smoke

The portable smoke source is `supabase/tests/edge/frdo-packet-artifact.deno-smoke.mjs`. Build its test-only canonical fixtures with:

`node scripts/build-frdo-packet-smoke.mjs ABSOLUTE_REPOSITORY ABSOLUTE_ISOLATED_XMLDOM_0_9_12_DIRECTORY ABSOLUTE_EXISTING_OUTPUT_DIRECTORY`

The output is `fixtures.bundle.mjs` plus its source manifest. It is a test artifact, not part of the deployed function. Run `deno check --no-config --no-remote --no-npm supabase/functions/frdo-packet-artifact/index.ts`. Run the smoke with `deno run --no-config --no-prompt --no-remote --no-npm`, permission for the three `SUPABASE_*` environment names used by the entry, `--allow-net=127.0.0.1`, read permission limited to the function and test-output directories, and the smoke path followed by two local file URLs: the production `runtime.bundle.js` and test `fixtures.bundle.mjs`.

The actual isolated Deno 2.5.4 run passed all 11 cases: real loopback cold boot/method/auth boundaries and original-bearer REST transport, provider-denial/foreign-actor rejection, official DPO/PO canonical writer/readback, changed bytes, hostile XML and revoked operation guard. External Auth/database/storage dependencies in this smoke are explicit fixed test ports. The loopback server and owned processes closed and all source pins stayed exact. This establishes local Deno compatibility, not provider deployment, cloud SQL/Storage access, customer acceptance or FIS submission. Production release still requires its guarded current-database rehearsal and real hosted end-to-end QA.
