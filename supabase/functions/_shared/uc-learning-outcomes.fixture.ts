import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { createUcAdmissionFixture } from './uc-admission-cases.fixture';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
export const learningOutcomeMigration = () => read('supabase/migrations/20261020140000_uc_learning_outcome_foundation.sql');
export const learningOutcomeId = (n: number) => `f0000114-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const lo = Object.freeze({ org: learningOutcomeId(1), foreign: learningOutcomeId(2), owner: learningOutcomeId(3), reviewer: learningOutcomeId(4),
  student: learningOutcomeId(5), otherStudent: learningOutcomeId(6), teacher: learningOutcomeId(7), reader: learningOutcomeId(8),
  viewer: learningOutcomeId(9), sales: learningOutcomeId(10), course: learningOutcomeId(20), group: learningOutcomeId(21), otherGroup: learningOutcomeId(22),
  document: learningOutcomeId(23), program: learningOutcomeId(24), test: learningOutcomeId(25), otherTest: learningOutcomeId(26), module: learningOutcomeId(27),
  textLesson: learningOutcomeId(28), secondTextLesson: learningOutcomeId(29), teacherStaff: learningOutcomeId(30), component: learningOutcomeId(31), moduleComponent: learningOutcomeId(32) });
const q = (s: string) => '"' + s.replace(/"/g, '""') + '"';
async function installLearningSql(db: PGlite, sql: string, stage: string) {
  try { await db.exec(sql); }
  catch (caught) {
    const error = caught as { message?: string; code?: string; position?: string; internalQuery?: string; where?: string };
    const position = Number(error.position);
    throw new Error(JSON.stringify({ stage, message: error.message, code: error.code, position: error.position,
      where: error.where?.slice(0, 1500), internalQuery: error.internalQuery?.slice(0, 1500),
      nearbyDDL: Number.isFinite(position) && position > 0 ? sql.slice(Math.max(0, position - 151), position + 150) : undefined }));
  }
}
export const learningRow = async <T = any>(db: PGlite, sql: string, args: any[] = []): Promise<T> => (await db.query<T>(sql, args)).rows[0];
export async function learningAs(db: PGlite, user: string | null, role = 'authenticated') {
  if (!['authenticated', 'anon', 'service_role'].includes(role)) throw new Error('Unknown synthetic role');
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [user ?? '', role]);
  await db.exec('SET ROLE ' + role);
}

/** Actual UC100..115 helpers and selected production session/grade bodies.
 * This is a synthetic PGlite semantics fixture, not real Auth/native concurrency,
 * production role-ACL completeness, billing/achievements or photo-media proof.
 * The existing foundational fixture has documented lookup adapters. The new
 * outcome authorization is real SQL and never replaced by an allow stub. */
export async function createLearningOutcomeFixture(apply = true) {
  const db = await createUcAdmissionFixture();
  const session = JSON.parse(read('supabase/tests/fixtures/uc-learning-outcomes-baseline.json'));
  const source = JSON.parse(read('supabase/tests/fixtures/uc-learning-outcomes-source-metadata.json')).metadata;
  const paid = JSON.parse(read('supabase/tests/fixtures/uc-learning-outcomes-paid-access.json')).functions;
  await db.exec(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT false;
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS require_final_test_photo boolean DEFAULT false;
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS source_course_id uuid;
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS source_order_id uuid;
    ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS expires_at timestamptz;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
    INSERT INTO storage.buckets(id,name,public)VALUES('final-test-photos','final-test-photos',false)ON CONFLICT(id)DO NOTHING;
    CREATE TABLE IF NOT EXISTS test_questions(id uuid PRIMARY KEY,lesson_id uuid,question text,options jsonb,correct_answer integer,
      order_index integer,explanation text,image_url text,is_bank_question boolean DEFAULT false);`);
  const relations = [...source.relations, ...session.relations];
  for (const relation of relations) {
    const exists = await learningRow(db, 'SELECT to_regclass($1) id', ['public.' + relation.name]);
    if (!exists.id) await db.exec(`CREATE TABLE public.${q(relation.name)}(${relation.columns.map((c: any) => `${q(c.name)} ${c.type}`).join(',')})`);
    for (const c of relation.columns) {
      await db.exec(`ALTER TABLE public.${q(relation.name)} ADD COLUMN IF NOT EXISTS ${q(c.name)} ${c.type}`);
      if (c.default) await db.exec(`ALTER TABLE public.${q(relation.name)} ALTER COLUMN ${q(c.name)} SET DEFAULT ${c.default}`);
      if (c.not_null) await db.exec(`ALTER TABLE public.${q(relation.name)} ALTER COLUMN ${q(c.name)} SET NOT NULL`);
    }
  }
  // Every referenced captured PK/UNIQUE must exist before cross-table FKs.
  // Definitions are copied unchanged; only fixture installation order changes.
  for (const foreign of [false, true]) for (const relation of relations) for (const c of relation.constraints ?? []) {
    if (/^FOREIGN KEY\b/.test(c.definition) !== foreign) continue;
    const prior = await learningRow(db, 'SELECT pg_get_constraintdef(oid,true) definition FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2', ['public.' + relation.name, c.name]);
    if (prior && prior.definition !== c.definition) throw new Error('Captured constraint differs: ' + c.name);
    if (!prior) await db.exec(`ALTER TABLE public.${q(relation.name)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  }
  // SQL-language access functions must be created in dependency order.
  const projection = JSON.parse(read('supabase/tests/fixtures/uc-learning-outcomes-question-projection.json')).function;
  const photoObject = JSON.parse(read('supabase/tests/fixtures/uc-learning-outcomes-photo-object.json')).function;
  const functions = [photoObject, projection, paid.find((f: any) => f.signature === '_paid_20260922_original_ids()'),
    paid.find((f: any) => f.signature === '_paid_20260922_course_scope(uuid)'),
    source.functions.find((f: any) => f.signature === 'can_access_course_as_learner(uuid)'),
    paid.find((f: any) => f.signature === '_paid_20260922_course_read(uuid,boolean)'),
    ...source.functions.filter((f: any) => f.signature !== 'can_access_course_as_learner(uuid)')];
  for (const f of functions) {
    if (!f || createHash('md5').update(f.definition).digest('hex') !== f.definition_md5) throw new Error('Captured test/access source missing or corrupt');
    await installLearningSql(db, f.definition, 'captured ' + f.signature);
    await db.exec(`REVOKE ALL ON FUNCTION public.${f.signature} FROM PUBLIC,anon,authenticated,service_role`);
    if (/[{,]=X\//.test(f.acl ?? '')) await db.exec(`GRANT EXECUTE ON FUNCTION public.${f.signature} TO PUBLIC`);
    for (const role of ['anon', 'authenticated', 'service_role']) if ((f.acl ?? '').includes(role + '=X/')) await db.exec(`GRANT EXECUTE ON FUNCTION public.${f.signature} TO ${role}`);
  }
  for (const r of session.relations) for (const t of r.triggers) if (!t.internal && t.name === 'account_deletion_subject_fence') {
    await db.exec(`DROP TRIGGER IF EXISTS ${q(t.name)} ON public.${q(r.name)}`);
    await db.exec(t.definition);
  }
  for (const r of session.relations) {
    await db.exec(`REVOKE ALL ON public.${q(r.name)} FROM PUBLIC,anon,authenticated,service_role`);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const privileges = r.effective_acl.filter((a: any) => a.grantee === role).map((a: any) => a.privilege);
      if (privileges.length) await db.exec(`GRANT ${privileges.join(',')} ON public.${q(r.name)} TO ${role}`);
    }
  }
  if (apply) await installLearningSql(db, learningOutcomeMigration(), 'new UC014 migration');
  return db;
}

export function learningDefinition(extra: Record<string, unknown> = {}) {
  return { schema_version: 1, main: { kind: 'test', component_id: lo.component, lesson_id: lo.test,
    retake_policy: 'best_percent', pass_rule: { kind: 'percent', threshold_basis_points: 7500, rounding: 'none' } },
    requirements: [], reviewer_id: lo.reviewer, independent_review_required: true, eligible_decider_ids: [lo.owner, lo.teacher],
    recognition_component_ids: [], recognition_file_version_ids: [], review_note: 'Synthetic organization explicitly selected these criteria.', ...extra };
}

/** All programme/file associations are established through actual public APIs.
 * Only synthetic identity, content and current-condition progress are fixture writes. */
export async function seedLearningScenario(db: PGlite) {
  let counter = 1000;
  const request = () => learningOutcomeId(++counter);
  const row = (sql: string, args: any[] = []) => learningRow(db, sql, args);
  await learningAs(db, null, 'service_role'); await db.exec('RESET ROLE');
  await db.query("INSERT INTO organizations(id,name)VALUES($1,'Synthetic UC014'),($2,'Synthetic foreign')", [lo.org, lo.foreign]);
  for (const [user, name] of [[lo.owner, 'Synthetic owner'], [lo.reviewer, 'Synthetic reviewer'], [lo.student, 'Synthetic learner'], [lo.otherStudent, 'Synthetic other learner'], [lo.teacher, 'Synthetic teacher'], [lo.reader, 'Synthetic reader'], [lo.viewer, 'Synthetic viewer'], [lo.sales, 'Synthetic sales']]) {
    await db.query('INSERT INTO auth.users(id)VALUES($1)', [user]);
    await db.query('INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,$3)', [user, lo.org, name]);
  }
  await db.query("INSERT INTO user_roles(user_id,role)VALUES($1,'organization'),($2,'student'),($3,'student'),($4,'admin'),($5,'sales_manager')", [lo.owner, lo.student, lo.otherStudent, lo.viewer, lo.sales]);
  await db.query("INSERT INTO admin_staff(user_id,role)VALUES($1,'viewer')", [lo.viewer]);
  await db.query(`INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES
    ($1,$2,$3,'custom','["students.read","students.write","documents.read","documents.write"]'),
    ($4,$5,$3,'teacher','["students.read","students.write","documents.read","documents.write"]'),
    ($6,$7,$3,'custom','["students.read","documents.read"]')`, [learningOutcomeId(40), lo.reviewer, lo.org, lo.teacherStaff, lo.teacher, learningOutcomeId(41), lo.reader]);
  await db.query("INSERT INTO courses(id,organization_id,title,is_published)VALUES($1,$2,'Synthetic outcome course',true)", [lo.course, lo.org]);
  await db.query("INSERT INTO student_groups(id,organization_id,course_id,name)VALUES($1,$2,$3,'Synthetic exact group'),($4,$2,$3,'Synthetic other group')", [lo.group, lo.org, lo.course, lo.otherGroup]);
  await learningAs(db, lo.owner);
  await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)', [lo.org, lo.teacherStaff, [lo.group]]);
  await db.query("INSERT INTO org_documents(id,organization_id,name,type,status)VALUES($1,$2,'Synthetic reviewed programme','program_approval','active')", [lo.document, lo.org]);
  const upload = request(), path = `${lo.org}/versions/${lo.document}/${upload}.pdf`;
  await db.exec('RESET ROLE'); await db.query("INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('org-documents',$1,'{\"size\":42,\"etag\":\"uc014-file\",\"mimetype\":\"application/pdf\"}')", [path]);
  await learningAs(db, lo.owner);
  const document = (await row('SELECT commit_org_document_version($1,$2,$3,0,$4,NULL,$5) d', [lo.document, lo.org, upload, JSON.stringify({ file_path: path, file_name: 'Synthetic.pdf', file_size: 42, change_summary: 'Synthetic exact programme file' }), JSON.stringify({ status: 'active' })])).d;
  const docRevision = document.revision ?? document.document_revision ?? (await row('SELECT document_revision FROM org_documents WHERE id=$1', [lo.document])).document_revision;
  let review = (await row("SELECT save_org_document_review_draft($1,$2,$3,0,$4,$5,'[]',$6)d", [lo.document, document.version_id, docRevision, lo.owner, lo.reviewer, request()])).d;
  review = (await row("SELECT transition_org_document_review($1,$2,$3,'submit',NULL,NULL,NULL,$4)d", [review.id, review.revision, docRevision, request()])).d;
  await learningAs(db, lo.reviewer); await row("SELECT transition_org_document_review($1,$2,$3,'approve',NULL,'SYNTHETIC-014','2026-10-20',$4)d", [review.id, review.revision, docRevision, request()]);
  await learningAs(db, lo.owner);
  const facts = { schema_version: 1, full_title: 'Synthetic reviewed programme', program_type: 'dpo_upskilling', academic_hours: 16, training_form: 'part_time', uses_elearning: true, uses_distance_learning: true, duration_calendar: 'Synthetic two days', attestation_form: 'Organization-selected assessment', attestation_criteria: 'Explicit versioned criteria; no universal passing percentage', qualification: null, profession: null };
  let program = (await row('SELECT create_program_facts_version($1,$2,$3,NULL,$4,$5,$6,0,$7)d', [lo.org, lo.program, 'Synthetic programme', document.version_id, lo.reviewer, JSON.stringify(facts), request()])).d;
  program = (await row("SELECT transition_program_facts_version($1,$2,'submit',NULL,$3)d", [program.id, program.revision, request()])).d;
  await learningAs(db, lo.reviewer); program = (await row("SELECT transition_program_facts_version($1,$2,'approve',NULL,$3)d", [program.id, program.revision, request()])).d;
  await learningAs(db, lo.owner);
  await row('SELECT bind_course_program_version($1,$2,$3,0,$4)d', [lo.org, lo.course, program.id, request()]);
  await row('SELECT bind_group_program_version($1,$2,$3,$4,0,$5)d', [lo.org, lo.group, lo.course, program.id, request()]);
  await db.exec('RESET ROLE');
  await db.query("INSERT INTO course_modules(id,course_id,title,order_index)VALUES($1,$2,'Synthetic required module',0)", [lo.module, lo.course]);
  for (const [id, title, type, module] of [[lo.test, 'Explicit main test', 'test', null], [lo.otherTest, 'Another final-looking test', 'test', null], [lo.textLesson, 'Required text', 'text', lo.module], [lo.secondTextLesson, 'Required next text', 'text', lo.module]]) {
    await db.query('INSERT INTO lessons(id,course_id,title,type,order_index,module_id,test_max_attempts,test_max_attempts_per_day,test_questions_to_show,test_passing_score,test_show_answers)VALUES($1,$2,$3,$4,$5,$6,100,100,20,60,false)', [id, lo.course, title, type, id === lo.test ? 0 : 1, module]);
  }
  for (let n = 0; n < 20; n++) await db.query("INSERT INTO test_questions(id,lesson_id,question,options,correct_answer,order_index)VALUES($1,$2,$3,'[\"yes\",\"no\"]',0,$4)", [learningOutcomeId(100 + n), lo.test, 'Synthetic question ' + n, n]);
  await db.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id)VALUES($1,$2,$3)', [lo.org, lo.group, lo.student]);
  const enrollment = await row("INSERT INTO enrollments(id,user_id,course_id,status,progress,time_spent)VALUES($1,$2,$3,'active',0,0)RETURNING id", [learningOutcomeId(50), lo.student, lo.course]);
  const snapshot = await row('SELECT id FROM group_program_enrollment_snapshots WHERE enrollment_id=$1 AND group_id=$2', [enrollment.id, lo.group]);
  await learningAs(db, lo.owner);
  const scope = { organization_id: lo.org, group_id: lo.group, user_id: lo.student, course_id: lo.course, enrollment_id: enrollment.id, program_enrollment_snapshot_id: snapshot.id, program_version_id: program.id };
  const action = async (command: Record<string, unknown>, requestId = request()) => (await row('SELECT apply_learning_outcome_action($1,$2,$3)d', [lo.org, requestId, JSON.stringify(command)])).d;
  const readOutcome = async () => (await row('SELECT read_learning_outcome($1,$2)d', [lo.org, JSON.stringify({ kind: 'outcome', scope })])).d;
  const criteria = async (definition = learningDefinition()) => {
    await learningAs(db, lo.owner);
    const saved = await action({ action: 'save_criteria_version', course_id: lo.course, program_version_id: program.id, draft_id: null, expected_revision: 0, definition, reason: 'Synthetic explicit criteria draft' });
    const draft = saved.current.versions.find((v: any) => v.id === saved.receipt.event_id);
    await learningAs(db, lo.reviewer);
    await action({ action: 'approve_criteria_version', version_id: draft.id, expected_revision: draft.revision, expected_content_hash: draft.content_hash, reason: 'Synthetic actual reviewer approval' });
    await learningAs(db, lo.owner); return draft.id;
  };
  const attempt = async (correct: number, total = 20, requestId = request()) => {
    await db.exec('RESET ROLE'); await db.query('UPDATE lessons SET test_questions_to_show=$1 WHERE id=$2', [total, lo.test]);
    await learningAs(db, lo.student); const started = (await row('SELECT start_test_attempt($1,$2)d', [lo.test, requestId])).d;
    await db.exec('RESET ROLE'); const session = await row('SELECT questions_snapshot FROM test_attempt_sessions WHERE id=$1', [started.attemptId]);
    const answers = Object.fromEntries(session.questions_snapshot.map((q: any, index: number) => [q.id, index < correct ? 0 : 1]));
    await learningAs(db, lo.student); const grade = (await row('SELECT submit_test_attempt($1,$2)d', [started.attemptId, JSON.stringify(answers)])).d;
    return { started, grade };
  };
  const capture = async () => {
    const current = await readOutcome();
    return action({ action: 'capture_machine_result', scope, expected_revision: current.revision, expected_criteria_ref: current.criteria_ref, reason: 'Synthetic requested technical snapshot' });
  };
  return { db, scope, program, fileVersion: document.version_id, request, action, readOutcome, criteria, attempt, capture };
}
