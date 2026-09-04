# CSZ structured import: release runbook

This runbook covers only the structured CSZ 178-hour course importer. It does
not authorize login, database changes, publishing, or production course
creation.

Required order after local tests pass: reconcile and dry-run the migration
history -> apply the database migration -> run the read-only database smoke
test -> publish the frontend -> verify the deployed preview. Creating the real
course is a separate, explicitly authorized action.

## Fixed targets from repository configuration

- Supabase project ref: `atxwvjxbqjgkbjlhsdch`
- Lovable project: `d57ddcdf-2d1b-42ec-8bfb-3484123b5ff2`
- Current documented live frontend: `https://synthagma-bloom.lovable.app`
- Library prerequisite: `supabase/migrations/20260903100000_csz_electronic_library_schema.sql`
- Import migration: `supabase/migrations/20260903110000_import_csz_course_draft_v2.sql`
- Excluded draft: `20260902090000_import_csz_course_draft_v1.sql` is not part
  of this candidate and must not be applied. Its lesson-metadata prerequisites
  are included idempotently in the v2 migration; v1 privilege revocation is
  conditional so v2 is safe whether or not an older target already has v1.
- Authenticated application route: `/course-import`
- Exact course title: `Деятельность по монтажу, техническому обслуживанию и ремонту средств обеспечения пожарной безопасности зданий и сооружений`

The Supabase ref is present in `supabase/config.toml`, the Lovable MCP
manifest, and the hostname configured in `.env`. Never print or commit the
public key or any access token while verifying the target.

The repository also contains copy-paste proxy templates for
`sintagma.com.ru` and `синтагма.рф`, but no Wrangler, Cloudflare, Timeweb,
or GitHub Actions deployment configuration. Those templates do not prove the
current DNS target or that a custom-domain deployment will update
automatically.

## Hard release gate: migration history

Do not run `supabase db push` until a fresh linked migration comparison is
clean and reviewed. The last repository audit recorded one remote-only version
(`20260808041330`) and three older local-only versions (`20260808101500`,
`20260808142000`, and `20260809223500`). A normal push is therefore not proven
to apply only the reviewed library/import pair.

From an authenticated workstation with the Supabase CLI installed, record the
CLI version and inspect the linked target:

```powershell
Set-Location -LiteralPath 'D:\Codex\ЗАДАЧИ\work\csz_main_integration_candidate_20260903'
supabase --version
supabase link --project-ref atxwvjxbqjgkbjlhsdch
supabase migration list --linked
supabase db push --dry-run
```

`supabase link` changes local linkage and the other linked commands contact the
remote project; run them only with release authorization. Stop if the output
contains any migration other than the reviewed reconciliation entries and
the exact `20260903100000`/`20260903110000` library/import pair. In particular,
stop if `20260902090000` appears as pending. Do not use `--include-all`, run the old data-transfer SQL
again, edit remote migration history, or use `migration repair` without a
separately reviewed reconciliation decision.

After the histories are reconciled and the dry-run contains exactly the
approved migration set, the database release command is:

```powershell
supabase db push
```

Save the command output in the release record. Do not deploy an Edge Function:
this feature is a PostgreSQL RPC called directly by the frontend.

## Migration smoke test before frontend publication

Run the following read-only checks in the target project's SQL editor after
the migration is recorded as applied. They do not create a course:

```sql
select
  to_regprocedure('public.import_csz_course_draft_v2(uuid,jsonb)') is not null
    as rpc_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lessons'
      and column_name = 'metadata'
      and data_type = 'jsonb'
  ) as lesson_metadata_exists,
  has_function_privilege(
    'authenticated',
    'public.import_csz_course_draft_v2(uuid,jsonb)',
    'EXECUTE'
  ) as authenticated_can_execute,
  has_function_privilege(
    'anon',
    'public.import_csz_course_draft_v2(uuid,jsonb)',
    'EXECUTE'
  ) as anon_can_execute,
  coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('public.import_csz_course_draft_v1(uuid,jsonb)'),
      'EXECUTE'
    ),
    false
  ) as obsolete_v1_authenticated_can_execute;
```

Expected: `rpc_exists=true`, `lesson_metadata_exists=true`,
`authenticated_can_execute=true`, `anon_can_execute=false`, and
`obsolete_v1_authenticated_can_execute=false`.

Also verify that the reviewed library and v2 import migrations appear on both sides of:

```powershell
supabase migration list --linked
```

An end-to-end RPC call creates a real draft course and is not a read-only smoke
test. Perform it only after explicit approval and only in the intended
organization. The RPC itself verifies `is_published=false`, the electronic-library
feature flag, 11 modules, 35 lessons, 67 questions, and 8 official resource
cards before committing. New cards are `needs_review` and learner-hidden;
activation is a separate factual link/edition check.

## Local frontend gate

Use the exact package HTML and run the targeted tests before the production
build:

```powershell
git branch --show-current
git status --short
git diff --check
$env:CSZ_COURSE_HTML = 'D:\Codex\ЗАДАЧИ\outputs\csz_refiling_20260903\02_для_ЭИОС\01_Курс_178ч_для_импорта_в_Синтагму.html'
$env:CSZ_COURSE_KEYS = 'D:\Codex\ЗАДАЧИ\outputs\csz_refiling_20260903\02_для_ЭИОС\04_Банк_вопросов_с_ключами_ЗАКРЫТЫЙ_ИМПОРТНЫЙ.json'
npm test -- src/utils/structuredCourseImport.test.ts src/api/structuredCourseImport.test.ts
npm exec -- tsc --noEmit
npm run build
Remove-Item Env:CSZ_COURSE_HTML
Remove-Item Env:CSZ_COURSE_KEYS
```

All commands must finish successfully. A successful build is not evidence that
the frontend was published. Review and commit the intended files before any
merge to `main`; do not publish from a dirty feature branch.

## Frontend release and verification

Repository history documents Lovable as the frontend host. Pushing the reviewed
commit to `main` syncs it into the Lovable project; publication itself is a
separate action in Lovable (`Share` -> `Publish`). Both are external actions and
require release authorization.

After publication:

1. Open a cache-busted live URL and verify the deployed asset is the new build.
2. Sign in as the intended organization user with `courses.write`.
3. Open `/course-import`, select the exact learner-safe CSZ HTML and its
   separate closed JSON key bank. Verify the preview reports 35 lessons; the
   validated payload must contain 11 modules, 67 questions, and 8 official
   resource links.
4. Do not press the final import action until production course creation is
   explicitly authorized.
5. After an authorized import, verify the returned course is a draft and that
   the two final-assessment lessons are in module 11.
