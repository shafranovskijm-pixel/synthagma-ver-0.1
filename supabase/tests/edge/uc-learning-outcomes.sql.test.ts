// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { createLearningOutcomeFixture, seedLearningScenario, learningAs, learningRow, learningDefinition, learningOutcomeMigration, learningOutcomeId as id, lo } from '../../functions/_shared/uc-learning-outcomes.fixture';
import { outcomeEnvelopeSchema, outcomeMutationSchema, learningCriteriaEnvelopeSchema, learningCriteriaMutationSchema, learningDecisionOptionsSchema } from '../../../src/lib/learningOutcomes/contract';

// Synthetic SQL semantics. No network, paid API, real learner writes, native
// concurrency, full production Auth or UC013/N07 acceptance is claimed here.
const tables = ['uc_learning_criteria_versions', 'uc_learning_outcome_states', 'uc_learning_attempt_contexts', 'uc_learning_machine_results', 'uc_learning_attestation_decisions', 'uc_learning_outcome_requests'];
let db: PGlite, s: Awaited<ReturnType<typeof seedLearningScenario>>;
const row = <T = any>(sql: string, args: any[] = []) => learningRow<T>(db, sql, args);
const as = (actor: string | null, role = 'authenticated') => learningAs(db, actor, role);
async function denied(run: () => Promise<unknown>, message: string) {
  await db.exec('SAVEPOINT uc014_denial');
  try { await expect(run()).rejects.toMatchObject({ message }); }
  finally { await db.exec('ROLLBACK TO SAVEPOINT uc014_denial;RELEASE SAVEPOINT uc014_denial'); }
}
async function privateDenied(sql: string) {
  await db.exec('SAVEPOINT uc014_private');
  try { await expect(db.query(sql)).rejects.toMatchObject({ code: '42501' }); }
  finally { await db.exec('ROLLBACK TO SAVEPOINT uc014_private;RELEASE SAVEPOINT uc014_private'); }
}
const readQuery = async (query: unknown) => (await row('SELECT read_learning_outcome($1,$2)d', [lo.org, JSON.stringify(query)])).d;
const draft = async (definition = learningDefinition()) => s.action({ action: 'save_criteria_version', course_id: lo.course, program_version_id: s.program.id, draft_id: null, expected_revision: 0, definition, reason: 'Synthetic explicit draft' });
const approve = async (result: any) => {
  const version = result.current.versions.find((v: any) => v.id === result.receipt.event_id);
  return s.action({ action: 'approve_criteria_version', version_id: version.id, expected_revision: version.revision, expected_content_hash: version.content_hash, reason: 'Synthetic explicit approval' });
};
const decide = (current: any, extra: Record<string, unknown> = {}) => ({ action: current.last_decision ? 'supersede_decision' : 'record_attestation_decision', scope: s.scope,
  expected_revision: current.revision, criteria_ref: current.criteria_ref, machine_result_id: current.machine.id, expected_machine_input_hash: current.machine.input_hash,
  expected_decision_id: current.last_decision?.id ?? null, outcome: 'passed', basis: 'machine', staff_reason: 'Synthetic human considered the actual sources.',
  learner_summary: 'Synthetic authorized assessment decision.', reviewed_current_component_ids: [], recognized_component_ids: [], recognition_file_version_id: null, ...extra });
async function evaluated(definition = learningDefinition(), correct = 16, total = 20) {
  await s.criteria(definition); const attempt = await s.attempt(correct, total); await as(lo.owner); const result = await s.capture();
  expect(outcomeMutationSchema.parse(result)).toEqual(result); return { attempt, result, current: result.current };
}
const modules = [{ kind: 'module_completion', component_id: lo.moduleComponent, module_id: lo.module }];
async function completeModule() {
  await db.exec('RESET ROLE');
  await db.query("INSERT INTO lesson_progress(user_id,lesson_id,completed,completed_at)VALUES($1,$2,true,now()),($1,$3,true,now()) ON CONFLICT(user_id,lesson_id)DO UPDATE SET completed=true,completed_at=EXCLUDED.completed_at", [lo.student, lo.textLesson, lo.secondTextLesson]);
  await as(lo.owner);
}
async function legacyBusinessSnapshot() {
  await db.exec('RESET ROLE'); const snapshot: Record<string, unknown> = {};
  for (const table of ['enrollments', 'lesson_progress', 'test_attempt_sessions', 'test_attempts', 'course_manual_credits', 'org_documents']) {
    snapshot[table] = (await row(`SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY to_jsonb(x)::text),'[]')d FROM ${table} x`)).d;
  }
  await as(lo.owner); return snapshot;
}

beforeAll(async () => { db = await createLearningOutcomeFixture(); }, 60000);
beforeEach(async () => { await db.exec('RESET ROLE;BEGIN'); s = await seedLearningScenario(db); }, 30000);
afterEach(async () => { await db?.exec('ROLLBACK;RESET ROLE'); });
afterAll(async () => { await db?.close(); });

it('has six private RLS relations, owner-only helpers and exactly two authenticated APIs', async () => {
  await db.exec('RESET ROLE');
  const relations = (await db.query<any>("SELECT c.relname,c.relrowsecurity,count(*)FILTER(WHERE a.grantee<>c.relowner)::int nonowner FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE c.oid=ANY(SELECT to_regclass('public.'||x)FROM unnest($1::text[])x) GROUP BY c.oid ORDER BY c.relname", [tables])).rows;
  expect(relations).toHaveLength(6); for (const relation of relations) { expect(relation.relrowsecurity).toBe(true); expect(relation.nonowner).toBe(0); }
  const grants = (await db.query<any>("SELECT p.proname,CASE WHEN a.grantee=0 THEN 'PUBLIC'ELSE pg_get_userbyid(a.grantee)END role,a.privilege_type,a.is_grantable FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE n.nspname='public'AND(p.proname LIKE 'uc_learning_%'OR p.proname IN('read_learning_outcome','apply_learning_outcome_action'))AND a.grantee<>p.proowner ORDER BY p.proname")).rows;
  expect(grants).toEqual(['apply_learning_outcome_action', 'read_learning_outcome'].map(proname => ({ proname, role: 'authenticated', privilege_type: 'EXECUTE', is_grantable: false })));
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await as(lo.owner, role);
    for (const table of tables) { await privateDenied(`SELECT * FROM public.${table}`); await privateDenied(`INSERT INTO public.${table} DEFAULT VALUES`); }
    await privateDenied("SELECT public.uc_learning_person('" + lo.owner + "')");
  }
});

it('normalizes unexpected default grants only on new objects and preserves old ACLs/defaults', async () => {
  const extra = await createLearningOutcomeFixture(false);
  const snapshot = async () => (await learningRow<any>(extra, "SELECT jsonb_build_object('relations',(SELECT jsonb_agg(jsonb_build_array(c.oid,c.relowner,c.relacl::text)ORDER BY c.oid)FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage')AND c.relname NOT LIKE 'uc_learning_%'),'functions',(SELECT jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl::text)ORDER BY p.oid)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname NOT LIKE 'uc_learning_%'AND p.proname NOT IN('read_learning_outcome','apply_learning_outcome_action')),'defaults',(SELECT jsonb_agg(to_jsonb(x)ORDER BY x.oid)FROM pg_default_acl x))d")).d;
  try {
    await extra.exec('CREATE ROLE uc014_unexpected NOLOGIN;GRANT USAGE ON SCHEMA public TO uc014_unexpected;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO uc014_unexpected WITH GRANT OPTION;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO uc014_unexpected WITH GRANT OPTION');
    const before = await snapshot(); await extra.exec(learningOutcomeMigration()); expect(await snapshot()).toEqual(before);
    expect((await learningRow<any>(extra, "SELECT count(*)::int n FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE c.relname LIKE 'uc_learning_%'AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='uc014_unexpected')")).n).toBe(0);
    expect((await learningRow<any>(extra, "SELECT count(*)::int n FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE(p.proname LIKE 'uc_learning_%'OR p.proname IN('read_learning_outcome','apply_learning_outcome_action'))AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='uc014_unexpected')")).n).toBe(0);
  } finally { await extra.close(); }
}, 60000);

it('keeps incomplete organizational choices draft and adds no implicit pass percentage or reviewer', async () => {
  const result = await draft(learningDefinition({ main: null, reviewer_id: null, eligible_decider_ids: [] }));
  expect(learningCriteriaMutationSchema.parse(result)).toEqual(result);
  const version = result.current.versions[0]; expect(version.state).toBe('draft'); expect(version.definition.main).toBeNull(); expect(version.definition.reviewer_id).toBeNull();
  await denied(() => approve(result), 'LEARNING_OUTCOME_ACCESS_DENIED');
  expect((await s.readOutcome()).machine).toBeNull();
});

it('requires the actual independent reviewer and freezes an approved criterion version', async () => {
  const result = await draft(); await denied(() => approve(result), 'LEARNING_OUTCOME_ACCESS_DENIED');
  await as(lo.reviewer); const approved = await approve(result); expect(learningCriteriaMutationSchema.parse(approved)).toEqual(approved);
  expect(approved.current.versions.find((v: any) => v.id === result.receipt.event_id).state).toBe('approved');
  await db.exec('RESET ROLE');
  await denied(() => db.query("UPDATE uc_learning_criteria_versions SET definition='{}',revision=revision+1 WHERE id=$1", [result.receipt.event_id]), 'LEARNING_OUTCOME_ACCESS_DENIED');
});

it('keeps actual test snapshots and original grade separate from the approved 75% criterion', async () => {
  const { current, attempt } = await evaluated(learningDefinition(), 14);
  expect(current.machine.eligibility).toBe('not_eligible');
  expect(current.machine.components[0].original_grade).toMatchObject({ score: 14, max_score: 20, original_passed: true, original_passing_score: 60 });
  await db.exec('RESET ROLE'); await db.query('UPDATE lessons SET test_passing_score=99 WHERE id=$1', [lo.test]); await as(lo.owner);
  const after = await s.readOutcome(); expect(after.machine.source_fresh).toBe(true); expect(after.machine.components[0].original_grade).toEqual(current.machine.components[0].original_grade);
  await as(lo.student); const replay = (await row('SELECT submit_test_attempt($1,$2)d', [attempt.started.attemptId, '{}'])).d; expect(replay).toEqual(attempt.grade);
});

it('selects best normalized percentage, so 7/10 beats 8/20 instead of comparing raw scores', async () => {
  await s.criteria(); await s.attempt(8, 20); const second = await s.attempt(7, 10); await as(lo.owner);
  const current = (await s.capture()).current; expect(current.machine.components[0].original_grade).toMatchObject({ session_id: second.started.attemptId, score: 7, max_score: 10 });
  expect(current.machine.eligibility).toBe('not_eligible');
});

it('uses explicit latest-completed retake policy and retains the earlier successful original grade', async () => {
  const definition = learningDefinition(); definition.main.retake_policy = 'latest_completed';
  await s.criteria(definition); const first = await s.attempt(20); const second = await s.attempt(1); await as(lo.owner);
  const current = (await s.capture()).current; expect(current.machine.components[0].original_grade.session_id).toBe(second.started.attemptId); expect(current.machine.eligibility).toBe('not_eligible');
  await db.exec('RESET ROLE'); expect((await row('SELECT passed FROM test_attempts WHERE session_id=$1', [first.started.attemptId])).passed).toBe(true);
});

it.each([['none', 'not_eligible'], ['nearest_integer_half_up', 'eligible']])('evaluates explicit %s rounding at 66.5%% without changing the original session rule', async (rounding, eligibility) => {
  await db.exec('RESET ROLE');
  for (let n = 20; n < 200; n++) await db.query("INSERT INTO test_questions(id,lesson_id,question,options,correct_answer,order_index)VALUES($1,$2,'Synthetic rounding question','[\"yes\",\"no\"]',0,$3)", [id(100 + n), lo.test, n]);
  await as(lo.owner); const definition = learningDefinition(); definition.main.pass_rule = { kind: 'percent', threshold_basis_points: 6700, rounding } as typeof definition.main.pass_rule;
  const { current } = await evaluated(definition, 133, 200); expect(current.machine.eligibility).toBe(eligibility);
  expect(current.machine.components[0].original_grade).toMatchObject({ score: 133, max_score: 200, original_passed: true, original_passing_score: 60 });
});

it('treats module completion as current observed condition and invalidates a changed pinned module', async () => {
  const { current } = await evaluated(learningDefinition({ requirements: modules })); expect(current.machine.eligibility).toBe('incomplete');
  const originalId = current.machine.id; await completeModule(); const completed = (await s.capture()).current;
  expect(completed.machine.eligibility).toBe('eligible'); expect(completed.machine.components[1]).toMatchObject({ provenance: 'current_condition_observed', reason_code: 'CURRENT_MODULE_CONDITION_OBSERVED', original_grade: null });
  await db.exec('RESET ROLE'); await db.query("INSERT INTO lessons(id,course_id,title,type,order_index,module_id)VALUES($1,$2,'New module content','text',2,$3)", [id(900), lo.course, lo.module]); await as(lo.owner);
  expect((await s.readOutcome()).machine.source_fresh).toBe(false); const changed = (await s.capture()).current;
  expect(changed.machine.eligibility).toBe('unknown'); expect(changed.machine.components[1].reason_code).toBe('MODULE_CONTENT_CHANGED');
  await db.exec('RESET ROLE'); expect((await row('SELECT evaluation FROM uc_learning_machine_results WHERE id=$1', [originalId])).evaluation.eligibility).toBe('incomplete');
});

it('technical capture and human decision never complete enrollments, rewrite grades or issue legacy documents', async () => {
  await s.criteria(); await s.attempt(20); await as(lo.owner); const before = await legacyBusinessSnapshot();
  const captured = (await s.capture()).current; expect(captured.machine.eligibility).toBe('eligible'); expect(captured.last_decision).toBeNull();
  const decided = await s.action(decide(captured)); expect(decided.current.last_decision.outcome).toBe('passed'); expect(outcomeMutationSchema.parse(decided)).toEqual(decided);
  expect(await legacyBusinessSnapshot()).toEqual(before);
});

it('observes a genuine manual-credit record separately and does not promote it into a grade or attestation', async () => {
  const { current } = await evaluated(learningDefinition(), 2); expect(current.machine.eligibility).toBe('not_eligible');
  await db.exec('RESET ROLE'); await db.query('INSERT INTO course_manual_credits(enrollment_id,credited_by,credited_at)VALUES($1,$2,clock_timestamp())', [s.scope.enrollment_id, lo.owner]); await as(lo.owner);
  const observed = (await s.capture()).current; expect(observed.technical_observation.manual_credited_at).not.toBeNull();
  expect(observed.machine.eligibility).toBe('not_eligible'); expect(observed.last_decision).toBeNull();
  expect(observed.machine.components[0].original_grade).toMatchObject({ score: 2, max_score: 20, original_passed: false });
  await db.exec('RESET ROLE'); await db.query('UPDATE course_manual_credits SET revoked_at=clock_timestamp(),revoked_by=$1 WHERE enrollment_id=$2', [lo.owner, s.scope.enrollment_id]); await as(lo.owner);
  expect((await s.readOutcome()).machine.source_fresh).toBe(false); expect((await s.readOutcome()).last_decision).toBeNull();
});

it('requires explicit current-module review and separates deferred human decision from machine unknown', async () => {
  await evaluated(learningDefinition({ requirements: modules })); await completeModule(); const current = (await s.capture()).current;
  await denied(() => s.action(decide(current)), 'LEARNING_OUTCOME_PREREQUISITE_MISSING');
  const result = await s.action(decide(current, { reviewed_current_component_ids: [lo.moduleComponent] })); expect(result.current.last_decision.outcome).toBe('passed');
  await denied(() => s.action(decide(result.current, { outcome: 'not_passed', reviewed_current_component_ids: [] })), 'LEARNING_OUTCOME_PREREQUISITE_MISSING');
});

it('checks the current exact-group teacher assignment at decision and at receipt replay', async () => {
  const { current } = await evaluated(); await as(lo.teacher); const requestId = s.request(); const command = decide(current);
  const result = await s.action(command, requestId); expect(result.current.last_decision.actor_id).toBe(lo.teacher);
  await as(lo.owner); await row('SELECT set_org_staff_document_groups($1,$2,$3,1)', [lo.org, lo.teacherStaff, [lo.otherGroup]]);
  await as(lo.teacher); await denied(() => s.action(command, requestId), 'LEARNING_OUTCOME_ACCESS_DENIED');
});

it.each(['reader', 'viewer', 'sales', 'student', 'otherStudent'] as const)('rejects %s as a human decision writer even with a known exact scope and valid result', async actor => {
  const { current } = await evaluated(); await as(lo[actor]); await denied(() => s.action(decide(current)), 'LEARNING_OUTCOME_ACCESS_DENIED');
});

it.each(['expired', 'revoked', 'foreign'] as const)('fails closed for a formerly eligible actor with %s access', async scenario => {
  const { current } = await evaluated(); await db.exec('RESET ROLE');
  if (scenario === 'expired') {
    await db.query("UPDATE org_staff SET expires_at=now()-interval '1 day'WHERE user_id=$1 AND organization_id=$2", [lo.teacher, lo.org]);
  } else if (scenario === 'revoked') await db.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)', [lo.owner]);
  else await db.query('UPDATE profiles SET organization_id=$1 WHERE user_id=$2', [lo.foreign, lo.owner]);
  await as(scenario === 'expired' ? lo.teacher : lo.owner); await denied(() => s.action(decide(current)), 'LEARNING_OUTCOME_ACCESS_DENIED');
});

it('projects only the learner-safe human result and does not authorize learner attestation writes', async () => {
  const { current } = await evaluated(); await s.action(decide(current, { staff_reason: 'PRIVATE STAFF REASON' })); await as(lo.student);
  const learner = await s.readOutcome(); expect(outcomeEnvelopeSchema.parse(learner)).toEqual(learner); expect(learner.audience).toBe('learner');
  expect(learner.last_decision).not.toHaveProperty('staff_reason'); expect(learner.last_decision).not.toHaveProperty('actor_id'); expect(learner.capabilities.can_decide).toBe(false);
  expect(JSON.stringify(learner)).not.toContain('PRIVATE STAFF REASON'); await denied(() => s.action(decide(learner)), 'LEARNING_OUTCOME_ACCESS_DENIED');
});

it('rechecks original learner access expiry even when the exact programme snapshot is still known', async () => {
  await evaluated(); await db.exec('RESET ROLE'); await db.query("UPDATE enrollments SET expires_at=now()-interval '1 day'WHERE id=$1", [s.scope.enrollment_id]);
  await as(lo.student); await denied(() => s.readOutcome(), 'LEARNING_OUTCOME_ACCESS_DENIED');
  await as(lo.owner); expect((await s.readOutcome()).audience).toBe('staff');
});

it('never binds service-inserted sessions merely because a learner sub claim is present', async () => {
  await s.criteria(); await as(lo.student, 'service_role');
  const session = await row("INSERT INTO test_attempt_sessions(user_id,lesson_id,request_id,started_at,questions_snapshot,passing_score,show_answers,requires_final_test_photo)VALUES($1,$2,$3,clock_timestamp(),'[]',60,false,false)RETURNING id", [lo.student, lo.test, s.request()]);
  await db.exec('RESET ROLE'); const context = await row('SELECT binding_state,state_id,criteria_id,scope FROM uc_learning_attempt_contexts WHERE session_id=$1', [session.id]);
  expect(context).toEqual({ binding_state: 'system_unbound', state_id: null, criteria_id: null, scope: null });
  expect((await row('SELECT count(*)::int n FROM uc_learning_outcome_states')).n).toBe(0);
});

it('does not choose an arbitrary first group when a new session has two genuine programme associations', async () => {
  await s.criteria(); await as(lo.owner);
  await row('SELECT bind_group_program_version($1,$2,$3,$4,0,$5)d', [lo.org, lo.otherGroup, lo.course, s.program.id, s.request()]);
  await db.exec('RESET ROLE'); await db.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id)VALUES($1,$2,$3)', [lo.org, lo.otherGroup, lo.student]);
  // The installed UC111 membership observer creates the second real snapshot.
  expect((await row('SELECT count(*)::int n FROM group_program_enrollment_snapshots WHERE enrollment_id=$1', [s.scope.enrollment_id])).n).toBe(2);
  const attempt = await s.attempt(20); await db.exec('RESET ROLE');
  expect((await row('SELECT binding_state FROM uc_learning_attempt_contexts WHERE session_id=$1', [attempt.started.attemptId])).binding_state).toBe('ambiguous');
  expect((await row('SELECT count(*)::int n FROM uc_learning_outcome_states')).n).toBe(0);
});

it('keeps a pre-criteria session unbound across resume and never retroactively grades it under new criteria', async () => {
  const requestId = s.request(); await as(lo.student); const old = (await row('SELECT start_test_attempt($1,$2)d', [lo.test, requestId])).d;
  await as(lo.owner); await s.criteria(); await as(lo.student); const resumed = (await row('SELECT start_test_attempt($1,$2)d', [lo.test, s.request()])).d; expect(resumed.attemptId).toBe(old.attemptId);
  await s.attempt(20); await db.exec('RESET ROLE'); expect((await row('SELECT binding_state FROM uc_learning_attempt_contexts WHERE session_id=$1', [old.attemptId])).binding_state).toBe('unconfigured');
  await as(lo.owner); expect((await s.readOutcome()).criteria_ref).toBeNull();
  await denied(() => s.capture(), 'LEARNING_OUTCOME_SOURCE_CHANGED');
  await s.attempt(20); await as(lo.owner); const current = (await s.capture()).current; expect(current.machine.eligibility).toBe('eligible'); expect(current.machine.components[0].original_grade.session_id).not.toBe(old.attemptId);
});

it('pins existing test contexts to their approved criteria while later criteria apply prospectively', async () => {
  const criterionA = await s.criteria(); await s.attempt(16); await as(lo.owner); const first = (await s.capture()).current;
  const criterionB = await s.criteria(learningDefinition({ main: { kind: 'test', component_id: lo.component, lesson_id: lo.test, retake_policy: 'latest_completed', pass_rule: { kind: 'percent', threshold_basis_points: 10000, rounding: 'none' } } }));
  expect(criterionB).not.toBe(criterionA); const after = await s.readOutcome(); expect(after.criteria_ref.id).toBe(criterionA); expect(after.machine).toEqual(first.machine);
});

it('starts a human assessment only with the actual latest approved criterion and keeps its technical grade unknown', async () => {
  const definition = learningDefinition({ main: { kind: 'human_assessment', component_id: lo.component, label: 'Organization-selected oral assessment' } });
  await s.criteria(definition); const first = await s.readOutcome(); expect(first.machine).toBeNull();
  await s.criteria({ ...definition, review_note: 'A distinct explicitly approved subsequent revision.' });
  await denied(() => s.action({ action: 'capture_machine_result', scope: s.scope, expected_revision: 0, expected_criteria_ref: first.criteria_ref, reason: 'Stale criterion must not be chosen' }), 'LEARNING_OUTCOME_SOURCE_CHANGED');
  const current = (await s.capture()).current; expect(current.machine.eligibility).toBe('unknown'); expect(current.machine.components[0]).toMatchObject({ kind: 'human_assessment', original_grade: null, reason_code: 'HUMAN_ASSESSMENT_REQUIRED' });
  await denied(() => s.action(decide(current)), 'LEARNING_OUTCOME_PREREQUISITE_MISSING');
  const deferred = await s.action(decide(current, { outcome: 'deferred' })); expect(deferred.current.last_decision.outcome).toBe('deferred');
});

it('checks request identity, current authority and CAS before accepting retries', async () => {
  await s.criteria(); await s.attempt(20); await as(lo.owner); const initial = await s.readOutcome(); const requestId = s.request();
  const command = { action: 'capture_machine_result', scope: s.scope, expected_revision: initial.revision, expected_criteria_ref: initial.criteria_ref, reason: 'One exact captured request' };
  const captured = await s.action(command, requestId); const replay = await s.action(command, requestId);
  expect(replay.receipt).toEqual({ ...captured.receipt, replayed: true }); expect(replay.current).toEqual(captured.current);
  await denied(() => s.action({ ...command, reason: 'Changed same request' }, requestId), 'LEARNING_OUTCOME_REQUEST_CONFLICT');
  await denied(() => s.action(command), 'LEARNING_OUTCOME_REVISION_CONFLICT');
  await db.exec('RESET ROLE'); expect((await row('SELECT count(*)::int n FROM uc_learning_machine_results')).n).toBe(1);
});

it('requires explicit approved recognition evidence, retains failed original grades and rejects a stale-evidence receipt replay', async () => {
  const definition = learningDefinition({ recognition_component_ids: [lo.component], recognition_file_version_ids: [s.fileVersion] });
  const { current } = await evaluated(definition, 2); expect(current.machine.eligibility).toBe('not_eligible'); const requestId = s.request();
  const command = decide(current, { basis: 'recognition', recognized_component_ids: [lo.component], recognition_file_version_id: s.fileVersion });
  const result = await s.action(command, requestId); expect(result.current.last_decision.outcome).toBe('passed');
  expect(result.current.machine.components[0].original_grade.original_passed).toBe(false);
  const options = await readQuery({ kind: 'decision_options', scope: s.scope }); expect(learningDecisionOptionsSchema.parse(options)).toEqual(options); expect(options.files.map((f: any) => f.version_id)).toContain(s.fileVersion);
  await db.exec('RESET ROLE'); await db.query("UPDATE org_documents SET deleted_at=clock_timestamp() WHERE id=$1", [lo.document]); await as(lo.owner);
  const stale = await s.readOutcome(); expect(stale.machine.source_fresh).toBe(true); expect(stale.decision_relation).toBe('source_changed'); expect(stale.last_decision.outcome).toBe('passed');
  await denied(() => s.action(command, requestId), 'LEARNING_OUTCOME_SOURCE_CHANGED');
});

it('bounds decision-option labels before returning a strict DTO, and preserves valid padded display labels', async () => {
  await evaluated(learningDefinition({ recognition_component_ids: [lo.component], recognition_file_version_ids: [s.fileVersion] }));
  await db.exec('RESET ROLE'); await db.query('UPDATE org_documents SET name=$1 WHERE id=$2', ['  Existing padded title  ', lo.document]); await as(lo.owner);
  expect(learningDecisionOptionsSchema.parse(await readQuery({ kind: 'decision_options', scope: s.scope })).files[0].document_name).toBe('  Existing padded title  ');
  await db.exec('RESET ROLE'); await db.query('UPDATE org_documents SET name=$1 WHERE id=$2', ['x'.repeat(1001), lo.document]); await as(lo.owner);
  await denied(() => readQuery({ kind: 'decision_options', scope: s.scope }), 'LEARNING_OUTCOME_LIMIT_EXCEEDED');
});

it('checks exact source pins and preserves old access/start/grade/photo definitions', async () => {
  const baseline = JSON.parse(readFileSync('supabase/tests/fixtures/uc-learning-outcomes-source-metadata.json', 'utf8')).metadata.functions;
  const paid = JSON.parse(readFileSync('supabase/tests/fixtures/uc-learning-outcomes-paid-access.json', 'utf8')).functions;
  const projection = JSON.parse(readFileSync('supabase/tests/fixtures/uc-learning-outcomes-question-projection.json', 'utf8')).function;
  const photoObject = JSON.parse(readFileSync('supabase/tests/fixtures/uc-learning-outcomes-photo-object.json', 'utf8')).function;
  await db.exec('RESET ROLE');
  for (const source of [...baseline, ...paid, projection, photoObject]) {
    expect(createHash('md5').update(source.definition).digest('hex')).toBe(source.definition_md5);
    expect((await row('SELECT md5(pg_get_functiondef(to_regprocedure($1)))hash', ['public.' + source.signature])).hash).toBe(source.definition_md5);
  }
  await as(lo.owner); expect(learningCriteriaEnvelopeSchema.parse(await readQuery({ kind: 'criteria', course_id: lo.course, program_version_id: s.program.id }))).toMatchObject({ schema_version: 1 });
});

it('uses the actual closed photo-object helper and refuses an object with forged ownership', async () => {
  await db.exec('RESET ROLE');
  const challenge = s.request(), object = s.request(), requestId = s.request(), objectPath = `${lo.student}/${challenge}/capture.jpg`;
  await db.query("INSERT INTO storage.objects(id,bucket_id,name,owner_id,created_at,metadata)VALUES($1,'final-test-photos',$2,$3,clock_timestamp(),'{\"size\":42,\"mimetype\":\"image/jpeg\"}')", [object, objectPath, lo.otherStudent]);
  await db.query("INSERT INTO final_test_photo_challenges(id,user_id,lesson_id,course_id,enrollment_id,request_id,object_path,created_at,expires_at,completed_at,storage_object_id)VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 minute',clock_timestamp(),$8)", [challenge, lo.student, lo.test, lo.course, s.scope.enrollment_id, requestId, objectPath, object]);
  expect((await row('SELECT _final_test_photo_object_valid($1)valid', [challenge])).valid).toBe(false);
  await db.query('UPDATE storage.objects SET owner_id=$1 WHERE id=$2', [lo.student, object]);
  expect((await row('SELECT _final_test_photo_object_valid($1)valid', [challenge])).valid).toBe(true);
  await as(lo.owner); await privateDenied("SELECT _final_test_photo_object_valid('" + challenge + "')");
});

it('supports validated private erasure of a decision actor without corrupting the remaining learner projection', async () => {
  const { current } = await evaluated(); await s.action(decide(current, { staff_reason: 'PERSONAL STAFF TEXT', learner_summary: 'PERSONAL LEARNER SUMMARY' }));
  await db.exec('RESET ROLE'); await db.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)', [lo.owner]);
  await db.query("SELECT set_config('request.jwt.claim.role','service_role',false),set_config('sintagma.account_deletion_erase_user',$1,true)", [lo.owner]);
  await db.query('SELECT uc_learning_erase_user($1)', [lo.owner]);
  expect((await row('SELECT uc_learning_personal_counts($1)d', [lo.owner])).d).toEqual([]);
  await as(lo.student); const remaining = await s.readOutcome(); expect(outcomeEnvelopeSchema.parse(remaining)).toEqual(remaining);
  expect(remaining.decision_relation).toBe('source_changed'); expect(remaining.last_decision.outcome).toBe('passed'); expect(JSON.stringify(remaining)).not.toMatch(/PERSONAL STAFF TEXT|PERSONAL LEARNER SUMMARY/);
  // This isolates the validated private erase extension. Full account deletion
  // consent/job/worker and native concurrent interleavings remain separate gates.
});

it('rejects missing/null action and padded authority text without creating requests', async () => {
  await denied(() => s.action({ action: null, expected_revision: 0 }), 'LEARNING_OUTCOME_INVALID_INPUT');
  await denied(() => draft(learningDefinition({ review_note: ' padded policy ' })), 'LEARNING_OUTCOME_INVALID_INPUT');
  await db.exec('RESET ROLE'); expect((await row('SELECT count(*)::int n FROM uc_learning_outcome_requests')).n).toBe(0);
});

it('aborts before new DDL when an original protected test body no longer matches its captured source', async () => {
  const extra = await createLearningOutcomeFixture(false);
  try {
    const f = await learningRow<any>(extra, "SELECT pg_get_functiondef('public.start_test_attempt(uuid,uuid)'::regprocedure)d");
    await extra.exec(f.d.replace('BEGIN\n', 'BEGIN\n -- Synthetic changed dependency must fail preflight.\n'));
    await extra.exec('BEGIN'); await expect(extra.exec(learningOutcomeMigration())).rejects.toMatchObject({ message: 'LEARNING_OUTCOME_DEPENDENCY_UNAVAILABLE' }); await extra.exec('ROLLBACK');
    expect((await learningRow<any>(extra, "SELECT to_regclass('public.uc_learning_outcome_states')id")).id).toBeNull();
  } finally { await extra.close(); }
}, 60000);

it('prepared empty-only rollback restores exact predecessor bodies/ACLs and leaves every old ledger row unchanged', async () => {
  const extra = await createLearningOutcomeFixture(false);
  const old = async () => (await learningRow<any>(extra, "SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid))ORDER BY p.oid)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname NOT LIKE 'uc_learning_%'AND p.proname NOT IN('read_learning_outcome','apply_learning_outcome_action')),'ledger',(SELECT jsonb_agg(to_jsonb(m)ORDER BY version)FROM supabase_migrations.schema_migrations m))d")).d;
  try {
    const before = await old(); await extra.exec(learningOutcomeMigration());
    const rollback = readFileSync('docs/releases/sintagma-production/uc-learning-outcome-foundation-20261020/rollback-empty-foundation.sql', 'utf8').replace(/\r\n/g, '\n');
    await extra.exec(rollback); expect(await old()).toEqual(before);
    expect((await learningRow<any>(extra, "SELECT to_regclass('public.uc_learning_outcome_states')id")).id).toBeNull();
  } finally { await extra.close(); }
}, 60000);

it('prepared rollback refuses a populated foundation before deleting or restoring any business facts', async () => {
  const extra = await createLearningOutcomeFixture();
  try {
    const populated = await seedLearningScenario(extra);
    await learningAs(extra, lo.owner);
    await extra.query('SELECT apply_learning_outcome_action($1,$2,$3)', [lo.org, id(9999), JSON.stringify({ action: 'save_criteria_version', course_id: lo.course, program_version_id: populated.program.id, draft_id: null, expected_revision: 0, definition: learningDefinition(), reason: 'Synthetic populated rollback refusal' })]);
    await extra.exec('RESET ROLE'); const before = await learningRow<any>(extra, 'SELECT count(*)::int n FROM uc_learning_criteria_versions'); expect(before.n).toBe(1);
    const rollback = readFileSync('docs/releases/sintagma-production/uc-learning-outcome-foundation-20261020/rollback-empty-foundation.sql', 'utf8').replace(/\r\n/g, '\n');
    await expect(extra.exec(rollback)).rejects.toMatchObject({ message: 'UC014_ROLLBACK_POPULATED_REFUSED' }); await extra.exec('ROLLBACK');
    expect((await learningRow<any>(extra, 'SELECT count(*)::int n FROM uc_learning_criteria_versions')).n).toBe(1);
    expect((await learningRow<any>(extra, "SELECT pg_get_functiondef('public.account_deletion_personal_row_counts(uuid)'::regprocedure)d")).d).toContain('public.uc_learning_personal_counts');
  } finally { await extra.close(); }
}, 60000);
