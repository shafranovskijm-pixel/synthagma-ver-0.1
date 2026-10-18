# UC-001–006: inventory of deployed document functions (read-only)

## Repository (checked 18.10.2026, around 06:55 UTC)
- Local HEAD is `dacbbd52…`. Main `293b34f1…` is an ancestor of it. Nothing in the 7 functions, their `_shared` imports or `config.toml` differs from main.
- SHA-256 of workspace files, identical to main:

| Function | index.ts SHA-256 | Local imports | verify_jwt (config) |
|---|---|---|---|
| finalize-signature | 763cae68…cb193 | none | no entry, so default true |
| public-verify-document | 33fe0de9…997f5 | none | false |
| generate-signature-certificate | 939f09c4…e06b9? see note | _shared/privileged-access.ts (b42d27ae…597b0) | no entry, so default true |
| html-to-pdf | 69b16387…e06b9 | none | no entry, so default true |
| generate-self-examination-report | 789812e4…9ca612 | _shared/gigachat-client.ts (0c40ab34…69355), which imports russian-ca.ts | false |
| org-create-contract-signature | d8c1bbdc…dbac3 | _shared/smtp-sender.ts (a3e08210…2cca1e), which imports rate-limiter.ts and smtp-protocol.ts | no entry, so default true |
| send-signing-email | de56b5e6…51344 | _shared/smtp-sender.ts (same) | no entry, so default true |

Note: the full hash for generate-signature-certificate is `939f09c4e9f2ad91882602f8a88731a0414e38693c5c35010e0f5120abc3440b`. config.toml is `82431c8a…d4e1f3`.

## Deployed versions: not available
- My tools cannot read deployed source, version, deployment id, update time, live verify_jwt or bundle hash for a function that is already live. So I cannot confirm whether production matches main. The only hint is that the logs show function boot events.
- A package checksum is returned only when I deploy something myself. I have not deployed any of these 7 functions in this chat, so I have no checksum for them.
- I did not call any document endpoint and sent no emails.

## Native tooling for the release after merge
- `supabase--deploy_edge_functions(function_names=[...])` deploys from **current workspace files**: the function folder, `_shared` and `config.toml`. It cannot target a commit. It returns success plus a package checksum, but no version or id.
- Process: sync the workspace to the merged SHA, check the SHA-256 of each file against the reviewed manifest, deploy one function at a time, then run safe unauthenticated checks (status code plus a revision header, if the code sets one).
- Other tools: `supabase--edge_function_logs` (boot and errors), `supabase--curl_edge_functions` and `supabase--test_edge_functions`, which I would use only with your approval.
- Recommendation: add an `X-Sintagma-Function-Revision` header to each of the 7 functions in the PR. That gives you after-deploy proof that the right revision is live.

No changes have been made. A deploy would need a separate explicit command.
