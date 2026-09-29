/** PostgreSQL/PGlite behavior tests. No network, production data or Storage HTTP.
 * PGLITE_MODULE_PATH may point to an existing PGlite installation on D:.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const repo = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const modulePath = process.env.PGLITE_MODULE_PATH || require.resolve('@electric-sql/pglite');
const { PGlite } = await import(pathToFileURL(modulePath).href);
let assertions = 0;
const db = new PGlite();
const onNotice = notice => {
  if (notice.message.startsWith('PASS:')) { assertions++; console.log(notice.message); }
};
const read = name => readFile(path.join(repo, name), 'utf8');
const extract = (text, expression) => {
  const match = text.match(expression)?.[0];
  if (!match) throw new Error(`Missing authoritative SQL ${expression}`);
  return match;
};
try {
  await db.exec((await read('supabase/tests/test_attempts_fixture.sql')).replace(/^\\set.*$/gm, ''));
  // Use the real access helpers, not the fixture's equivalent definitions.
  const library = await read('supabase/migrations/20260903100000_csz_electronic_library_schema.sql');
  const permissions = await read('supabase/migrations/20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql');
  await db.exec(extract(library, /CREATE OR REPLACE FUNCTION public\.can_access_course_as_learner\([\s\S]*?\$function\$;/));
  await db.exec(extract(permissions, /CREATE OR REPLACE FUNCTION public\.can_access_course\([\s\S]*?\$\$;/));
  await db.exec(extract(permissions, /CREATE OR REPLACE FUNCTION public\.can_access_lesson\([\s\S]*?\$\$;/));
  const modules = await read('supabase/migrations/20260420080804_ca16ea37-4d96-4cf9-9502-755cdb89a198.sql');
  await db.exec(extract(modules, /CREATE TABLE public\.course_modules[\s\S]*?\n\);/));
  await db.exec(`ALTER TABLE public.lessons ADD COLUMN module_id uuid REFERENCES public.course_modules(id) ON DELETE SET NULL;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean DEFAULT false,
      file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,owner_id text,
      created_at timestamptz DEFAULT clock_timestamp(),metadata jsonb,UNIQUE(bucket_id,name));
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;
    -- Deliberately broad old policy: the new restrictive guard must still win.
    CREATE POLICY fixture_old_broad_storage_policy ON storage.objects FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
    CREATE TABLE public.video_identifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,enrollment_id uuid,status text,photo_url text);
  `);
  await db.exec(await read('supabase/migrations/20260907120000_test_attempt_sessions.sql'));
  await db.exec(await read('supabase/migrations/20260907120001_course_manual_credits.sql'));
  await db.exec(await read('supabase/migrations/20260929120000_final_test_photo.sql'));
  await db.exec(await read('supabase/tests/final_test_photo.test.sql'), { onNotice });
  if (assertions < 60) throw new Error(`Unexpected assertion count: ${assertions}`);
  console.log(`PASS: ${assertions} final-test photo assertions; synthetic transaction rolled back.`);
  console.log('Not exercised: multi-connection races, real Storage HTTP/JPEG bytes, camera hardware or deployed migration.');
} catch (error) {
  console.error(error.code || '', error.message, error.where || '');
  process.exitCode = 1;
} finally { await db.close(); }
