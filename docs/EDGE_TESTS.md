# Edge Function tests

Executable shared Edge Function tests live in `supabase/tests/edge/`, outside the deployed `supabase/functions` source tree. Their subdirectories mirror the previous `_shared` layout. Production helpers, owned fonts, DOCX templates and the existing SQL/native fixture helpers retain their original paths.

Run one relocated test from the repository root:

```sh
npm test -- supabase/tests/edge/mailing-bundle.test.ts --maxWorkers=1
```

Run the education artifact worker suite with its existing Node environment and exact Zod alias:

```sh
node node_modules/vitest/vitest.mjs run --config supabase/functions/education-issuance-artifact/vitest.config.ts
```

The root Vitest configuration discovers `supabase/tests/edge/**/*.{test,spec}.ts` as well as the existing application and other function tests. Relative imports and `import.meta.url`/`__dirname` resource references in relocated tests still resolve to the same production modules, fixtures and template assets. No deployment-time source filtering or temporary directory rename is required.

Historical release reports and immutable verification manifests keep their original paths and hashes. When using an old report command for an executable `.test.ts` file, replace the prefix `supabase/functions/_shared/` with `supabase/tests/edge/`; keep the remaining path. Do not rewrite fixture/helper paths or historical proof files.

This layout change reduces the source uploaded by integrations that include every `_shared` file. A local byte projection is not a successful deployment or native worker acceptance; verify the actual deployment separately.
