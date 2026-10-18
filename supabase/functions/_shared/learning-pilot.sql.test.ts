// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Real repository SQL, synthetic identities only. No network or production data.
// Fixture-only collaborators: organization permission rows and Storage metadata.
// This verifies transaction semantics, not multi-connection lock scheduling.
const db = new PGlite();
const read = (file: string) => readFile(new URL('../../../' + file, import.meta.url), 'utf8');
const migration = (file: string) => read('supabase/migrations/' + file);
const extract = (sql: string, name: string) => {
  const match = sql.match(new RegExp('CREATE OR REPLACE FUNCTION public\\.' + name + '\\([\\s\\S]*?\\n\\$(?:function)?\\$[^;]*;'));
  if (!match) throw new Error('Missing authoritative SQL: ' + name);
  return match[0];
};
const org = '10000000-0000-0000-0000-000000000001';
const otherOrg = '10000000-0000-0000-0000-000000000002';
const student = '20000000-0000-0000-0000-000000000001';
const otherStudent = '20000000-0000-0000-0000-000000000002';
const teacher = '20000000-0000-0000-0000-000000000003';
const otherTeacher = '20000000-0000-0000-0000-000000000004';
const course = '30000000-0000-0000-0000-000000000001';
const testLesson = '40000000-0000-0000-0000-000000000001';
const otherTest = '40000000-0000-0000-0000-000000000002';
const textLesson = '40000000-0000-0000-0000-000000000003';
const correct = { '50000000-0000-0000-0000-000000000001': 0, '50000000-0000-0000-0000-000000000002': 1 };
const wrong = { '50000000-0000-0000-0000-000000000001': 1, '50000000-0000-0000-0000-000000000002': 0 };
const asUser = async (id: string) => {
  await db.exec('SET LOCAL ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [id]);
};
const rpc = async (sql: string, args: unknown[] = []) => (await db.query<{ result: any }>('SELECT ' + sql + ' AS result', args)).rows[0].result;
const start = () => rpc('public.start_test_attempt($1,gen_random_uuid())', [testLesson]);
const submit = (id: string, answers = correct) => rpc('public.submit_test_attempt($1,$2::jsonb)', [id, JSON.stringify(answers)]);
const results = () => rpc('public.get_student_learning_results($1,$2)', [org, student]);
const deny = async (sql: string, args: unknown[], code: string) => {
  await db.exec('SAVEPOINT expected_denial');
  try { await expect(db.query(sql, args)).rejects.toMatchObject({ code }); }
  finally { await db.exec('ROLLBACK TO SAVEPOINT expected_denial; RELEASE SAVEPOINT expected_denial'); }
};

beforeAll(async () => {
  await db.exec((await read('supabase/tests/test_attempts_fixture.sql')).replace(/^\\set.*$/gm, ''));
  const access = await migration('20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql');
  await db.exec(extract(await migration('20260903100000_csz_electronic_library_schema.sql'), 'can_access_course_as_learner'));
  await db.exec(extract(access, 'can_access_course'));
  await db.exec(extract(access, 'can_access_lesson'));
  const modules = await migration('20260420080804_ca16ea37-4d96-4cf9-9502-755cdb89a198.sql');
  await db.exec(modules.match(/CREATE TABLE public\.course_modules[\s\S]*?\n\);/)![0]);
  await db.exec(`ALTER TABLE lessons ADD COLUMN module_id uuid REFERENCES course_modules(id);
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,owner_id text,created_at timestamptz DEFAULT clock_timestamp(),metadata jsonb,UNIQUE(bucket_id,name));
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;
    CREATE TABLE public.video_identifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,enrollment_id uuid,status text,photo_url text);`);
  await db.exec(await migration('20260907120000_test_attempt_sessions.sql'));
  await db.exec(await migration('20260907120001_course_manual_credits.sql'));
  await db.exec(await migration('20260929120000_final_test_photo.sql'));
  await db.exec(extract(await migration('20260411050701_9cfbacda-0aff-4236-ac06-a23468bea87e.sql'), 'auto_complete_enrollment'));
  // Includes the real recalculation + auto-completion triggers, not a mocked UPDATE.
  await db.exec(await migration('20260420031834_d630e3ba-9b81-4aab-93e7-2f02e3ece997.sql'));
  await db.exec(`CREATE TYPE public.app_role AS ENUM('admin','organization','student','company','sales_manager');
    ALTER TABLE user_roles ALTER COLUMN role TYPE public.app_role USING role::public.app_role;
    CREATE TABLE fixture_staff_permissions(user_id uuid,organization_id uuid,permissions text[]);
    CREATE FUNCTION public.get_org_staff_permissions(_user_id uuid,_organization_id uuid) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT permissions FROM fixture_staff_permissions WHERE user_id=_user_id AND organization_id=_organization_id $$;`);
  await db.exec(extract(await migration('20260429060323_9023b604-40d6-4551-bf02-4fc5315bdf0e.sql'), 'has_role'));
  await db.exec(extract(await migration('20260822122025_6be7e00b-82ec-44a9-8476-fac0e09cdd0c.sql'), 'is_org_owner'));
  await db.exec(extract(await migration('20260729092507_1963e085-8e9c-4a15-8b5f-69b86e0f6bf8.sql'), 'is_student_profile'));
  await db.exec(extract(access, 'normalize_org_staff_permission'));
  await db.exec(extract(access, 'has_org_staff_permission'));
  await db.exec(await migration('20261007101000_student_learning_results.sql'));
  await db.query('INSERT INTO org_staff VALUES ($1,$2,NULL),($3,$4,NULL)', [teacher, org, otherTeacher, otherOrg]);
  await db.query("INSERT INTO fixture_staff_permissions VALUES ($1,$2,ARRAY['students.read']),($3,$4,ARRAY['students.read'])", [teacher, org, otherTeacher, otherOrg]);
  await db.query("INSERT INTO lessons(id,course_id,title,type,order_index) VALUES ($1,$2,'Text lesson','text',0)", [textLesson, course]);
  await db.query('UPDATE lessons SET order_index=1 WHERE id=$1', [testLesson]);
}, 30_000);
beforeEach(() => db.exec('BEGIN'));
afterEach(() => db.exec('ROLLBACK'));
afterAll(() => db.close());

describe('learner grading → course completion → authorized teacher results', () => {
  it('persists the server grade and completes all lessons once, visible after changing to teacher', async () => {
    await asUser(student);
    await db.query('INSERT INTO lesson_progress(user_id,lesson_id,completed,completed_at) VALUES ($1,$2,true,now())', [student, textLesson]);
    const attempt = await start();
    expect(attempt.questions.every((q: any) => !('correct_answer' in q))).toBe(true);
    const grade = await submit(attempt.attemptId);
    expect(grade).toMatchObject({ score: 2, maxScore: 2, passed: true });
    const enrollment = (await db.query<{ id: string; status: string; progress: number; completed_at: string }>('SELECT id,status,progress,completed_at FROM enrollments WHERE user_id=$1 AND course_id=$2', [student, course])).rows[0];
    expect(enrollment).toMatchObject({ status: 'completed', progress: 100 });
    expect(enrollment.completed_at).not.toBeNull();
    const completion = await rpc('public.complete_own_course_enrollment($1)', [enrollment.id]);
    expect(completion.was_already_completed).toBe(true);
    expect(await submit(attempt.attemptId, wrong)).toMatchObject({ score: 2, passed: true });
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM test_attempts')).rows[0].count).toBe(1);
    await asUser(teacher);
    const summary = await results();
    expect(summary.courses).toHaveLength(1);
    expect(summary.courses[0]).toMatchObject({ course_id: course, status: 'completed', progress: 100 });
    expect(summary.courses[0].tests[0]).toMatchObject({ score: 2, max_score: 2, passed: true, attempts_used: 1 });
    expect(summary.courses[0].tests[0].completed_at).not.toBeNull();
  });

  it('a failed test remains failed for the teacher and does not complete the course', async () => {
    await asUser(student);
    const attempt = await start();
    expect(await submit(attempt.attemptId, wrong)).toMatchObject({ score: 0, passed: false });
    expect((await db.query('SELECT status,progress FROM enrollments WHERE user_id=$1', [student])).rows[0]).toMatchObject({ status: 'active', progress: 0 });
    await asUser(teacher);
    expect((await results()).courses[0].tests[0]).toMatchObject({ score: 0, passed: false, attempts_used: 1 });
  });

  it('passing the test alone cannot complete an unread text lesson', async () => {
    await asUser(student);
    const attempt = await start(); await submit(attempt.attemptId);
    const enrollment = (await db.query<{ id: string }>('SELECT id FROM enrollments WHERE user_id=$1', [student])).rows[0];
    await deny('SELECT public.complete_own_course_enrollment($1)', [enrollment.id], 'P0001');
    expect((await db.query('SELECT status,progress FROM enrollments WHERE id=$1', [enrollment.id])).rows[0]).toMatchObject({ status: 'active', progress: 50 });
  });

  it('grades the reserved question snapshot even if the source answer key changes', async () => {
    await asUser(student); const attempt = await start();
    await db.exec('RESET ROLE; UPDATE test_questions SET correct_answer=1-correct_answer');
    await asUser(student);
    expect(await submit(attempt.attemptId)).toMatchObject({ score: 2, passed: true });
  });

  it('rejects foreign-tenant attempts and teacher reads, and rejects learner access to the teacher RPC', async () => {
    await asUser(student); const attempt = await start();
    await deny('SELECT public.start_test_attempt($1,gen_random_uuid())', [otherTest], '42501');
    await deny('SELECT public.get_student_learning_results($1,$2)', [org, student], '42501');
    await asUser(otherStudent);
    await deny('SELECT public.submit_test_attempt($1,$2::jsonb)', [attempt.attemptId, JSON.stringify(correct)], '42501');
    await asUser(otherTeacher);
    await deny('SELECT public.get_student_learning_results($1,$2)', [org, student], '42501');
    await asUser(teacher);
    await deny('SELECT public.get_student_learning_results($1,$2)', [org, otherStudent], '42501');
  });

  it('requires a current teacher membership and students.read permission', async () => {
    await db.query("UPDATE org_staff SET expires_at=now()-interval '1 second' WHERE user_id=$1", [teacher]);
    await asUser(teacher);
    await deny('SELECT public.get_student_learning_results($1,$2)', [org, student], '42501');
    await db.exec('RESET ROLE');
    await db.query('UPDATE org_staff SET expires_at=NULL WHERE user_id=$1', [teacher]);
    await db.query("UPDATE fixture_staff_permissions SET permissions=ARRAY['courses.read'] WHERE user_id=$1", [teacher]);
    await asUser(teacher);
    await deny('SELECT public.get_student_learning_results($1,$2)', [org, student], '42501');
  });

  it('does not permit a learner to forge a stored test score directly', async () => {
    await asUser(student);
    await deny('INSERT INTO test_attempts(user_id,lesson_id,score,max_score) VALUES ($1,$2,2,2)', [student, testLesson], '42501');
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM test_attempts')).rows[0].count).toBe(0);
  });
});
