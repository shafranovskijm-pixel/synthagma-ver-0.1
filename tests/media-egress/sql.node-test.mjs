import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Actual repository migrations; synthetic identities and disposable in-memory
// data only. This deliberately tests invoker RLS rather than a privileged mock
// of the metadata queries. It does not contact a deployed backend.
const migrations = [
  '20261118090000_media_library_usage_metadata.sql',
  '20261118091000_slider_lesson_metadata.sql',
];
const UID_A = '10000000-0000-0000-0000-000000000001';
const UID_B = '10000000-0000-0000-0000-000000000002';
const ORG_A = '20000000-0000-0000-0000-000000000001';
const ORG_B = '20000000-0000-0000-0000-000000000002';
const COURSE_A = '30000000-0000-0000-0000-000000000001';
const COURSE_B = '30000000-0000-0000-0000-000000000002';
const COURSE_HIDDEN = '30000000-0000-0000-0000-000000000003';
const literalName = 'literal%_\\name.png';
const lessonId = n => `40000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('media egress metadata migrations retain caller authority and old candidate window', { timeout: 120_000 }, async t => {
  const db = new PGlite();
  const query = async (sql, args = []) => (await db.query(sql, args)).rows;
  const asUser = async (uid = UID_A, role = 'authenticated', revoked = false) => {
    await db.exec('RESET ROLE');
    await query("SELECT set_config('fixture.user_id', $1, false), set_config('fixture.revoked', $2, false)", [uid || '', String(revoked)]);
    await db.exec(`SET ROLE ${role}`);
  };
  const usage = (org, names) => query('SELECT * FROM public.get_media_library_usage_metadata($1::uuid,$2::text[])', [org, names]);
  const sliders = () => query('SELECT * FROM public.list_slider_lesson_metadata()');
  const deny = async (run, code) => {
    await assert.rejects(run, error => error?.code === code, `Expected SQLSTATE ${code}`);
  };
  const insertLesson = (n, course, title, type, content, visibleTo = [UID_A], when = '2026-11-01T00:00:00Z') =>
    query('INSERT INTO public.lessons VALUES($1,$2,$3,$4,$5,$6,$7::uuid[])', [lessonId(n), course, title, type, content, when, visibleTo]);
  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('fixture.user_id', true), '')::uuid
      $$;
      CREATE TABLE public.courses (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, title text,
        visible_to uuid[] NOT NULL
      );
      CREATE TABLE public.lessons (
        id uuid PRIMARY KEY, course_id uuid NOT NULL, title text, type text,
        content text, created_at timestamptz NOT NULL, visible_to uuid[] NOT NULL
      );
      ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON public.courses,public.lessons TO authenticated;
      CREATE POLICY fixture_course_read ON public.courses FOR SELECT TO authenticated
        USING (auth.uid() = ANY(visible_to));
      CREATE POLICY fixture_lesson_read ON public.lessons FOR SELECT TO authenticated
        USING (auth.uid() = ANY(visible_to));
      CREATE POLICY fixture_course_revoked ON public.courses AS RESTRICTIVE FOR SELECT TO authenticated
        USING (coalesce(current_setting('fixture.revoked',true),'false') <> 'true');
      CREATE POLICY fixture_lesson_revoked ON public.lessons AS RESTRICTIVE FOR SELECT TO authenticated
        USING (coalesce(current_setting('fixture.revoked',true),'false') <> 'true');
    `);
    await query('INSERT INTO public.courses VALUES ($1,$2,$3,$4::uuid[]),($5,$6,$7,$8::uuid[]),($9,$6,$10,$8::uuid[])', [
      COURSE_A, ORG_A, 'Course A', [UID_A], COURSE_B, ORG_B, 'Private B', [UID_B], COURSE_HIDDEN, 'Hidden course title',
    ]);
    const heavy = 'data:image/png;base64,' + 'A'.repeat(262_144);
    await insertLesson(1, COURSE_A, 'Usage title', 'text', `Text contains ${literalName} and plain.png`);
    await insertLesson(2, COURSE_A, 'Array presentation', 'slider', JSON.stringify([{ url: heavy }, { url: 'two.png' }]));
    await insertLesson(3, COURSE_A, 'Object presentation', 'slider', JSON.stringify({ slides: [{ url: 'one.png' }, {}, {}] }));
    await insertLesson(4, COURSE_A, 'Invalid JSON', 'slider', '{broken');
    await insertLesson(5, COURSE_A, 'Empty array', 'slider', '[]');
    await insertLesson(6, COURSE_A, 'SQL NULL', 'slider', null);
    await insertLesson(7, COURSE_A, 'JSON null', 'slider', 'null');
    await insertLesson(8, COURSE_A, 'JSON scalar', 'slider', '7');
    await insertLesson(9, COURSE_A, 'Invalid slides shape', 'slider', '{"slides":"not-an-array"}');
    await insertLesson(10, COURSE_B, 'Private B lesson', 'slider', '[{"url":"secret-b.png"}]', [UID_B]);
    await insertLesson(11, COURSE_A, 'Empty title is still used', 'text', 'empty-title.png');
    await query('UPDATE public.lessons SET title=NULL WHERE id=$1', [lessonId(11)]);
    // The historical PostgREST embedded courses relation is a left relation:
    // a visible lesson must not disappear solely because its parent is hidden.
    await insertLesson(12, COURSE_HIDDEN, 'Visible lesson / hidden parent', 'slider', '[{}]');
    await insertLesson(13, COURSE_A, 'Independently hidden lesson', 'text', 'hidden-in-own-course.png', [UID_B]);
    await insertLesson(14, COURSE_A, 'Escaped NUL in JSON array', 'slider', '{"slides":["\\u0000"]}');
    await insertLesson(15, COURSE_A, 'Large JSON number in array', 'slider', '{"slides":[1e1000000]}');
    await insertLesson(16, COURSE_A, 'Unpaired surrogate in JSON array', 'slider', '{"slides":["\\uD800"]}');
    await insertLesson(17, COURSE_A, 'Escaped ASCII property name', 'slider', '{"sli\\u0064es":[{},{}]}');
    await insertLesson(18, COURSE_A, 'Literal backslash-u text', 'slider', '{"slides":["\\\\u0000",{},{}]}');
    await insertLesson(19, COURSE_A, 'NUL in unrelated field', 'slider', '{"title":"\\u0000","slides":[{},{}]}');
    await insertLesson(20, COURSE_A, 'Last duplicate property wins', 'slider', '{"slides":[{}],"slides":[{},{}]}');
    for (const file of migrations) {
      await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }
    const baseline = (await query('SELECT md5(string_agg(row_to_json(l)::text,\'\' ORDER BY l.id)) AS hash FROM public.lessons l'))[0].hash;

    await t.test('functions are stable invokers with fixed lookup path and no anonymous execute', async () => {
      const functions = await query(`SELECT p.proname,p.prosecdef,p.provolatile,p.proconfig,
        has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
        has_function_privilege('anon',p.oid,'EXECUTE') AS anonymous_execute
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname IN ('get_media_library_usage_metadata','list_slider_lesson_metadata') ORDER BY p.proname`);
      assert.equal(functions.length, 2);
      for (const fn of functions) {
        assert.equal(fn.prosecdef, false);
        assert.equal(fn.provolatile, 's');
        assert.deepEqual(fn.proconfig, ['search_path=pg_catalog']);
        assert.equal(fn.authenticated_execute, true);
        assert.equal(fn.anonymous_execute, false);
      }
    });
    await t.test('media usage returns bounded metadata, preserving literal percent/underscore/backslash names', async () => {
      await asUser();
      const rows = await usage(ORG_A, [literalName, 'literalZZname.png', 'plain.png', literalName, 'unused.png']);
      assert.equal(rows.length, 4);
      const byName = new Map(rows.map(row => [row.file_name, row]));
      assert.deepEqual(byName.get(literalName), { file_name: literalName, is_used: true, lesson_title: 'Usage title' });
      assert.equal(byName.get('literalZZname.png').is_used, false);
      assert.equal(byName.get('plain.png').is_used, true);
      assert.equal(byName.get('unused.png').is_used, false);
      assert.ok(rows.every(row => Object.keys(row).sort().join(',') === 'file_name,is_used,lesson_title'));
    });
    await t.test('matched lesson with null title remains used; empty input does not read content into output', async () => {
      await asUser();
      assert.deepEqual(await usage(ORG_A, ['empty-title.png']), [{ file_name: 'empty-title.png', is_used: true, lesson_title: null }]);
      assert.deepEqual(await usage(ORG_A, []), []);
    });
    await t.test('foreign private org and lesson RLS are not bypassed by either RPC', async () => {
      await asUser();
      assert.deepEqual(await usage(ORG_B, ['secret-b.png']), [{ file_name: 'secret-b.png', is_used: false, lesson_title: null }]);
      assert.deepEqual(await usage(ORG_A, ['hidden-in-own-course.png']), [{ file_name: 'hidden-in-own-course.png', is_used: false, lesson_title: null }]);
      assert.ok(!(await sliders()).some(row => row.lesson_id === lessonId(10)));
      await asUser(UID_B);
      assert.equal((await usage(ORG_B, ['secret-b.png']))[0].lesson_title, 'Private B lesson');
      assert.equal((await sliders()).length, 1);
    });
    await t.test('an independent restrictive revocation remains effective on both tables', async () => {
      await asUser(UID_A, 'authenticated', true);
      assert.equal((await usage(ORG_A, ['plain.png']))[0].is_used, false);
      assert.deepEqual(await sliders(), []);
    });
    await t.test('anonymous callers and authenticated sessions without a user are rejected', async () => {
      await asUser(null, 'anon');
      await deny(() => usage(ORG_A, ['plain.png']), '42501');
      await deny(sliders, '42501');
      await asUser(null);
      await deny(() => usage(ORG_A, ['plain.png']), '42501');
      await deny(sliders, '42501');
    });
    await t.test('invalid request batches fail explicitly instead of claiming no usage', async () => {
      await asUser();
      await deny(() => usage(null, ['plain.png']), '22023');
      await deny(() => usage(ORG_A, ['']), '22023');
      await deny(() => usage(ORG_A, [null]), '22023');
      await deny(() => usage(ORG_A, Array.from({ length: 101 }, (_, i) => `file-${i}.png`)), '22023');
    });
    await t.test('slider metadata counts real arrays/objects and skips malformed, empty and primitive content', async () => {
      await asUser();
      const rows = await sliders();
      const byId = new Map(rows.map(row => [row.lesson_id, row]));
      assert.equal(rows.length, 10);
      assert.equal(byId.get(lessonId(2)).slides_count, 2);
      assert.equal(byId.get(lessonId(3)).slides_count, 3);
      assert.equal(byId.get(lessonId(12)).course_title, '');
      assert.equal(byId.get(lessonId(14)).slides_count, 1);
      assert.equal(byId.get(lessonId(15)).slides_count, 1);
      assert.equal(byId.get(lessonId(16)).slides_count, 1);
      assert.equal(byId.get(lessonId(17)).slides_count, 2);
      assert.equal(byId.get(lessonId(18)).slides_count, 3);
      assert.equal(byId.get(lessonId(19)).slides_count, 2);
      assert.equal(byId.get(lessonId(20)).slides_count, 2);
      assert.ok(rows.every(row => Object.keys(row).sort().join(',') === 'course_title,created_at,lesson_id,lesson_title,slides_count'));
      assert.ok(!JSON.stringify(rows).includes(heavy));
    });
    await t.test('metadata response is smaller while the selected original body remains byte-identical', async sub => {
      await asUser();
      const old = await query("SELECT l.id,l.title,l.content,l.created_at,l.course_id,json_build_object('title',c.title) AS courses FROM public.lessons l LEFT JOIN public.courses c ON c.id=l.course_id WHERE l.type='slider' AND l.content IS NOT NULL ORDER BY l.created_at DESC LIMIT 200");
      const metadata = await sliders();
      const selected = await query('SELECT content FROM public.lessons WHERE id=$1 AND type=\'slider\'', [lessonId(2)]);
      assert.equal(selected.length, 1);
      assert.equal(selected[0].content, JSON.stringify([{ url: heavy }, { url: 'two.png' }]));
      assert.ok(Buffer.byteLength(JSON.stringify(metadata)) * 50 < Buffer.byteLength(JSON.stringify(old)));
      sub.diagnostic(JSON.stringify({ syntheticLogicalJsonBytes: {
        oldSliderList: Buffer.byteLength(JSON.stringify(old)),
        newMetadataList: Buffer.byteLength(JSON.stringify(metadata)),
        selectedContent: Buffer.byteLength(selected[0].content),
      }, wireOrProductionBillingMeasurement: false }));
      // This is logical JSON body size in a synthetic fixture, not network
      // compression, billing GB or a forecast of credits saved in production.
    });
    await t.test('metadata reads do not mutate any stored lesson row', async () => {
      await db.exec('RESET ROLE');
      const after = (await query('SELECT md5(string_agg(row_to_json(l)::text,\'\' ORDER BY l.id)) AS hash FROM public.lessons l'))[0].hash;
      assert.equal(after, baseline);
    });
    await t.test('latest-200 window precedes validity filtering and does not backfill old rows', async () => {
      await db.exec('RESET ROLE');
      for (let n = 100; n < 315; n++) {
        await insertLesson(n, COURSE_A, `Window ${n}`, 'slider', n === 314 ? '{broken' : '[{}]', [UID_A], new Date(Date.UTC(2026, 10, 2, 0, 0, n)).toISOString());
      }
      await asUser();
      const rows = await sliders();
      assert.equal(rows.length, 199);
      assert.ok(!rows.some(row => row.lesson_id === lessonId(2)));
      assert.ok(!rows.some(row => row.lesson_id === lessonId(114)));
      assert.ok(rows.some(row => row.lesson_id === lessonId(115)));
      assert.ok(!rows.some(row => row.lesson_id === lessonId(314)));
    });
    await t.test('ten-megabyte lesson / hundred-name batch completes without returning its body', async sub => {
      await db.exec('RESET ROLE');
      const content = 'x'.repeat(10 * 1024 * 1024);
      await insertLesson(500, COURSE_A, 'Large body stress fixture', 'text', content);
      await insertLesson(501, COURSE_A, 'Large slider stress fixture', 'slider', JSON.stringify([{ src: content }]), [UID_A], '2026-11-17T00:00:00Z');
      await asUser();
      const names = Array.from({ length: 100 }, (_, i) => `missing-${String(i).padStart(3, '0')}.png`);
      const started = performance.now();
      const rows = await usage(ORG_A, names);
      const elapsedMs = performance.now() - started;
      assert.equal(rows.length, 100);
      assert.ok(rows.every(row => row.is_used === false && row.lesson_title === null));
      assert.ok(Buffer.byteLength(JSON.stringify(rows)) < 10_000);
      const sliderStarted = performance.now();
      const sliderRows = await sliders();
      const sliderElapsedMs = performance.now() - sliderStarted;
      assert.equal(sliderRows.find(row => row.lesson_id === lessonId(501))?.slides_count, 1);
      assert.ok(!JSON.stringify(sliderRows).includes(content));
      sub.diagnostic(JSON.stringify({ syntheticStress: {
        lessonContentBytes: Buffer.byteLength(content) * 2, names: names.length,
        elapsedMs: Math.round(elapsedMs * 100) / 100,
        logicalMetadataBytes: Buffer.byteLength(JSON.stringify(rows)),
        largeSliderListElapsedMs: Math.round(sliderElapsedMs * 100) / 100,
      }, productionPerformanceClaim: false }));
    });
  } finally {
    await db.close();
  }
});
