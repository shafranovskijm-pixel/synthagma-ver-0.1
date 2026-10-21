import {expect} from 'vitest';
import {registerNativeCase, type NativeContext, type NativeConnection} from './group-education-native-harness';
import {createUcGroupEducationFixture, seedGroupEducationScenario, executeAsGroupEducationCaller} from '../../functions/_shared/uc-group-education-facts.fixture';

const first = async (db: NativeConnection, sql: string, args: any[] = []) => (await db.query(sql, args)).rows[0];
async function rejected(work: Promise<unknown>, code: string, message?: string) {
  let caught: any;
  try { await work; } catch (error) { caught = error; }
  expect(caught, 'Actual SQL operation must reject').toBeTruthy();
  expect(caught.code).toBe(code);
  if (message) expect(caught.message).toContain(message);
  return {code: caught.code, message: caught.message};
}
async function sourceInsert(c: NativeContext, conn: NativeConnection, user: string, group = c.ids.group) {
  return conn.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id)VALUES($1,$2,$3)', [c.ids.organization, group, user]);
}
async function createBoundGroup(c: NativeContext, group: string) {
  await c.source(c.monitor);
  await c.monitor.query("INSERT INTO student_groups(id,organization_id,course_id,name)VALUES($1,$2,$3,'Synthetic native bound group')", [group, c.ids.organization, c.ids.course]);
  await c.owner(c.b);
  await c.b.query('SELECT bind_group_program_version($1,$2,$3,$4,0,$5)', [c.ids.organization, group, c.ids.course, c.s.programVersion.id, c.uuid()]);
  await c.initialize(c.b, group);
}
async function tableHashes(c: NativeContext, names: string[]) {
  const hashes: any = {};
  for (const table of names) {
    if (!/^[a-z_]+$/.test(table)) throw Error('Fixed synthetic relation expected');
    hashes[table] = (await first(c.monitor, `SELECT md5(coalesce((SELECT jsonb_agg(row ORDER BY row::text)::text FROM(SELECT to_jsonb(t)row FROM public.${table} t)s),'[]'))hash`)).hash;
  }
  return hashes;
}

registerNativeCase('N01', 'untracked real writes and the relation barrier fail without partial private state', async c => {
  const [student] = await c.addStudents(1);
  await c.source(c.a);
  await c.a.exec('BEGIN');
  await sourceInsert(c, c.a, student);
  const before = await c.locks([await c.a.pid()]);
  expect(before.some(v => v.relation === 'student_group_memberships' && v.mode === 'RowExclusiveLock' && v.granted)).toBe(true);
  const failure = await rejected(c.initialize(c.b), '40001', 'GROUP_FACTS_SOURCE_CHANGED');
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM uc_group_education_states')).n).toBe(0);
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM uc_group_education_requests')).n).toBe(0);
  await c.a.exec('COMMIT');
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM student_group_memberships WHERE group_id=$1 AND user_id=$2', [c.ids.group, student])).n).toBe(1);
  for (const kind of ['primary', 'archive', 'enrollment'] as const) {
    if (kind === 'enrollment') await c.owner(c.a); else await c.source(c.a);
    await c.a.exec('BEGIN');
    if (kind === 'primary') await c.a.query('UPDATE profiles SET student_group_id=$1 WHERE user_id=$2', [c.ids.group, student]);
    else if (kind === 'archive') await c.a.query('UPDATE profiles SET archived_at=clock_timestamp() WHERE user_id=$1', [c.ids.student]);
    else expect((await first(c.a, 'SELECT cancel_course_assignment($1,$2)d', [c.ids.enrollment, c.ids.organization])).d.cancelled).toBe(true);
    const held = await c.locks([await c.a.pid()]);
    expect(held.some(v => v.locktype === 'relation' && v.mode === 'RowExclusiveLock' && v.granted)).toBe(true);
    await rejected(c.initialize(c.b), '40001', 'GROUP_FACTS_SOURCE_CHANGED');
    expect((await first(c.monitor, 'SELECT count(*)::int n FROM uc_group_education_states')).n).toBe(0);
    expect((await first(c.monitor, 'SELECT count(*)::int n FROM uc_group_education_requests')).n).toBe(0);
    await c.a.exec('ROLLBACK');
    c.note({actualUntrackedSourceKind: kind, sourceLocks: held, initializerRetryWithNoPrivateContext: true, sourceRollbackPreserved: true});
  }
  // Independent actual relation-holder control reaches SHARE NOWAIT without
  // assuming that an old source trigger did not already own an A/G fence.
  await c.a.exec('BEGIN;LOCK TABLE profiles IN ROW EXCLUSIVE MODE');
  const relationFailure = await rejected(c.initialize(c.b), '40001', 'GROUP_FACTS_SOURCE_CHANGED');
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM uc_group_education_states')).n).toBe(0);
  await c.a.exec('ROLLBACK');
  const initialized = await c.initialize(c.b);
  expect(initialized.envelope.state.coverage).toBe('complete_observed');
  expect((await c.roster()).rows.map((v: any) => v.user_id)).toContain(student);
  c.note({oldSourceLocks: before, preBarrierOrRelationFailure: failure, relationOnlyBarrierFailure: relationFailure, sourceCommitted: true, noPrivateStateBeforeRetry: true});
});

registerNativeCase('N02', 'fresh READ COMMITTED source observes initializer commit and rollback after the real relation wait', async c => {
  const users = await c.addStudents(2);
  await c.b.exec('BEGIN');
  await c.initialize(c.b);
  await c.source(c.a);
  await c.a.exec('BEGIN');
  const blocked = c.launch(sourceInsert(c, c.a, users[0]));
  const lock = await c.waitBlocked(c.a, c.b);
  expect(lock.locktype).toBe('relation');
  await c.b.exec('COMMIT');
  await c.resolve(blocked);
  await c.a.exec('COMMIT');
  const committed = await c.roster();
  expect(committed.coverage).toBe('complete_observed');
  expect(committed.rows.map((v: any) => v.user_id)).toContain(users[0]);
  await c.b.exec('BEGIN');
  await c.initialize(c.b, c.ids.otherGroup);
  await c.a.exec('BEGIN');
  const rollbackControl = c.launch(sourceInsert(c, c.a, users[1], c.ids.otherGroup));
  await c.waitBlocked(c.a, c.b);
  await c.b.exec('ROLLBACK');
  await c.resolve(rollbackControl);
  await c.a.exec('COMMIT');
  expect((await c.read(c.b, {kind: 'state'}, c.ids.otherGroup)).state).toBeNull();
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM uc_group_education_requests WHERE group_id=$1', [c.ids.otherGroup])).n).toBe(0);
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM student_group_memberships WHERE group_id=$1 AND user_id=$2', [c.ids.otherGroup, users[1]])).n).toBe(1);
  c.note({committedFreshSource: committed.rows.map((v: any) => v.user_id), rollbackControlHasNoTrackingState: true});
});

registerNativeCase('N03', 'stale REPEATABLE READ and SERIALIZABLE cannot write relevant source through an invisible no-state gate', async c => {
  const users = await c.addStudents(4);
  for (const [n, isolation] of ['REPEATABLE READ', 'SERIALIZABLE'].entries()) {
    const group = n === 0 ? c.ids.group : c.ids.otherGroup;
    await c.source(c.a);
    await c.a.exec('BEGIN ISOLATION LEVEL ' + isolation);
    expect((await first(c.a, 'SELECT count(*)::int n FROM uc_group_education_states WHERE group_id=$1', [group])).n).toBe(0);
    await c.initialize(c.b, group);
    await rejected(sourceInsert(c, c.a, users[n], group), '25000');
    await c.a.exec('ROLLBACK');
    expect((await first(c.monitor, 'SELECT count(*)::int n FROM student_group_memberships WHERE group_id=$1 AND user_id=$2', [group, users[n]])).n).toBe(0);
    await c.a.exec('BEGIN ISOLATION LEVEL ' + isolation);
    await c.a.query("UPDATE profiles SET full_name='Synthetic unrelated rename' WHERE user_id=$1", [users[n]]);
    await c.a.exec('COMMIT');
    c.note({isolation, relevantWriteRejected: '25000', unrelatedRenameCommitted: true});
  }
  // Relation-wait variant: the old snapshot exists before B holds SHARE.
  const group = c.id(9001);
  await c.monitor.query("INSERT INTO student_groups(id,organization_id,course_id,name)VALUES($1,$2,$3,'Synthetic relation wait')", [group, c.ids.organization, c.ids.course]);
  await c.b.query('SELECT bind_group_program_version($1,$2,$3,$4,0,$5)', [c.ids.organization, group, c.ids.course, c.s.programVersion.id, c.uuid()]);
  await c.a.exec('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await c.a.query('SELECT count(*) FROM uc_group_education_states WHERE group_id=$1', [group]);
  await c.b.exec('BEGIN');
  await c.initialize(c.b, group);
  const waiting = c.launch(sourceInsert(c, c.a, users[3], group));
  await c.waitBlocked(c.a, c.b);
  await c.b.exec('COMMIT');
  const outcome = await waiting.promise;
  expect(outcome.ok).toBe(false);
  expect((outcome as any).error.code).toBe('25000');
  await c.a.exec('ROLLBACK');
});

registerNativeCase('N04', 'partial account sets, old fences and mutable proof rows produce bounded retry without a new wait cycle', async c => {
  const [another] = await c.addStudents(1, 110000);
  await c.source(c.a);
  await c.a.query('UPDATE profiles SET student_group_id=$1 WHERE user_id=$2', [c.ids.group, another]);
  for (const [label, sql, args] of [
    ['account', 'SELECT pg_advisory_xact_lock(hashtextextended($1::text,42007))', [another]],
    ['organization', 'SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))', [c.ids.organization]],
    ['group', "SELECT pg_advisory_xact_lock(hashtextextended('uc_program_roster:'||$1::text,0))", [c.ids.group]],
  ] as const) {
    await c.a.exec('BEGIN');
    await c.a.query(sql, [...args]);
    const failure = await rejected(c.initialize(c.b), '40001', 'GROUP_FACTS_SOURCE_CHANGED');
    const locks = await c.locks([await c.b.pid()]);
    // The LEFT JOIN returns a null lock tuple for an idle backend holding no
    // locks. Only a real ungranted tuple or an observed Lock wait is waiting.
    expect(locks.some(v => v.granted === false || v.wait_event_type === 'Lock')).toBe(false);
    await c.a.exec('ROLLBACK');
    c.note({oldCallerFence: label, failure, noResidualWait: true});
  }
  await c.a.exec('BEGIN');
  await c.a.query('SELECT id FROM org_document_versions WHERE id=$1 FOR UPDATE', [c.s.file.version_id]);
  await rejected(c.initialize(c.b), '40001', 'GROUP_FACTS_SOURCE_CHANGED');
  await c.a.exec('ROLLBACK');
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM uc_group_education_states')).n).toBe(0);
  // The unchanged legacy source writer obtains its old fences through actual
  // source DML. A failed new initializer must release its partial A set so the
  // writer can proceed to another subject, rather than forming a cycle.
  const [second] = await c.addStudents(1, 111000);
  await c.source(c.a);
  await c.a.exec('BEGIN');
  await c.a.query('UPDATE profiles SET student_group_id=$1 WHERE user_id=$2', [c.ids.group, second]);
  await rejected(c.initialize(c.b), '40001', 'GROUP_FACTS_SOURCE_CHANGED');
  await c.a.query('UPDATE profiles SET student_group_id=$1 WHERE user_id=$2', [c.ids.group, another]);
  await c.a.exec('COMMIT');
  await c.initialize(c.b);
  expect((await c.roster()).rows.map((v: any) => v.user_id)).toEqual([c.ids.student, another, second].sort());
});

registerNativeCase('N06', 'the actual legacy maximum of 1000 learners by 50 groups preserves every technical membership', async c => {
  const users = [c.ids.student, ...await c.addStudents(999, 120000)];
  const groups = [c.ids.group, c.ids.otherGroup, ...Array.from({length: 48}, (_, n) => c.id(121000 + n))];
  await c.monitor.query("INSERT INTO student_groups(id,organization_id,course_id,name)SELECT u,$1,$2,'Synthetic max legacy group' FROM unnest($3::uuid[])u", [c.ids.organization, c.ids.course, groups.slice(2)]);
  await c.initialize(c.b);
  await c.initialize(c.b, c.ids.otherGroup);
  await c.publishCalendar(c.b);
  const before = await tableHashes(c, ['organization_usage', 'enrollments']);
  await c.a.exec('BEGIN');
  const result = await c.a.query('SELECT * FROM add_students_to_groups($1,$2,$3)', [c.ids.organization, users, groups]);
  expect(result.rows).toHaveLength(50000);
  expect((await c.roster()).count.exact_count).toBe(1);
  await rejected(c.capture(c.b), '40001');
  await c.a.exec('COMMIT');
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM student_group_memberships_effective WHERE organization_id=$1 AND group_id=ANY($2::uuid[]) AND user_id=ANY($3::uuid[])', [c.ids.organization, groups, users])).n).toBe(50000);
  const states = (await c.monitor.query('SELECT group_id,active_gap,revision,jsonb_array_length(source_rows)n FROM uc_group_education_states ORDER BY group_id')).rows;
  expect(states).toHaveLength(2);
  for (const state of states) {
    if (state.active_gap === null) expect(state.n).toBe(1000);
    else expect(state.active_gap).toHaveProperty('id');
  }
  expect((await first(c.monitor, "SELECT count(*)::int n FROM uc_group_education_requests WHERE group_id=ANY($1::uuid[]) AND row_kind IN('source_pending','source_detail','source_parent','erase_context')", [groups.slice(2)])).n).toBe(0);
  // Actual membership auto-enrollment may legitimately create course rows;
  // billing quota must remain the exact old source behavior, not 50x charged.
  const after = await tableHashes(c, ['organization_usage']);
  expect(after.organization_usage).toBe(before.organization_usage);
  c.note({legacyRowsReturned: result.rows.length, exactEffectiveMemberships: 50000, initializedStates: states, untrackedScopes: 48, quotaUnchanged: true});
});

registerNativeCase('N07', '1001 details and the actual 10000 transaction budget become gaps only for incomplete groups', async c => {
  const users = await c.addStudents(1001, 130000);
  await c.initialize(c.b);
  const original = await c.roster();
  await c.source(c.a);
  await c.a.exec('BEGIN');
  await c.a.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id)SELECT $1,$2,u FROM unnest($3::uuid[])u', [c.ids.organization, c.ids.group, users]);
  expect((await c.roster()).rows).toEqual(original.rows);
  await c.a.exec('COMMIT');
  const gap = await c.roster();
  expect(gap.coverage).toBe('unknown_gap');
  expect(gap.rows).toHaveLength(0);
  expect(gap.count.exact_count).toBeNull();
  const groups = Array.from({length: 11}, (_, n) => c.id(132000 + n));
  for (const group of groups) await createBoundGroup(c, group);
  await c.owner(c.a);
  await c.a.exec('BEGIN');
  await c.a.query('SELECT * FROM add_students_to_groups($1,$2,$3)', [c.ids.organization, users.slice(0, 1000), groups]);
  const preCommit = (await c.read(c.b, {kind: 'state'}, groups[0])).state;
  expect(preCommit.membership_count.exact_count).toBe(0);
  await c.a.exec('COMMIT');
  const states = (await c.monitor.query('SELECT group_id,active_gap,jsonb_array_length(source_rows)n FROM uc_group_education_states WHERE group_id=ANY($1::uuid[]) ORDER BY group_id', [groups])).rows;
  expect(states).toHaveLength(11);
  const complete = states.filter(v => v.active_gap === null);
  const incomplete = states.filter(v => v.active_gap !== null);
  expect(complete).toHaveLength(10);
  expect(incomplete).toHaveLength(1);
  expect(complete.every(v => v.n === 1000)).toBe(true);
  const budgets = (await c.monitor.query("SELECT context FROM uc_group_education_requests WHERE row_kind='source_transaction_budget' ORDER BY created_at")).rows;
  c.note({perGroupOverflowCoverage: gap.coverage, fullDiscoveredGroups: states, transactionBudgets: budgets, admittedBoundary: 10000, noPrefixUsedAsComplete: true});
});

registerNativeCase('N09', 'MAX_SAFE revision preserves source and records a gap without wrap or a false command receipt', async c => {
  const [student] = await c.addStudents(1, 140000);
  await c.initialize(c.b);
  // Explicit synthetic boundary fault injection, not a source/history seed.
  await c.monitor.query('UPDATE uc_group_education_states SET revision=9007199254740991 WHERE group_id=$1', [c.ids.group]);
  const baselineHash = await tableHashes(c, ['uc_group_education_events']);
  const state = (await c.read(c.b)).state;
  const request = c.uuid();
  await rejected(c.apply(c.b, state.revision, {action: 'save_calendar_version', base_version_id: null, expected_program_ref: state.program_ref, timezone: state.timezone, planned_start_date: '2026-10-19', planned_end_date: '2026-10-19', coverage: 'partial_plan', partial_reason: 'Synthetic revision boundary', lessons: [], reason: 'Synthetic boundary denial'}, request), 'P0001', 'LIMIT_EXCEEDED');
  await c.source(c.a);
  await sourceInsert(c, c.a, student);
  const after = (await c.read(c.b)).state;
  expect(after.revision).toBe(9007199254740991);
  expect(after.coverage).toBe('unknown_gap');
  expect(after.prerequisites.some((v: any) => v.code === 'HISTORY_REVISION_CAPACITY')).toBe(true);
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM uc_group_education_requests WHERE request_id=$1', [request])).n).toBe(0);
  expect(await tableHashes(c, ['uc_group_education_events'])).toEqual(baselineHash);
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM student_group_memberships WHERE group_id=$1 AND user_id=$2', [c.ids.group, student])).n).toBe(1);
  c.note({boundaryFaultInjection: 'Only private revision set to MAX_SAFE in isolated synthetic DB', finalRevision: after.revision, coverage: after.coverage, sourceCommitted: true});
});

registerNativeCase('N10', 'savepoint rollback removes overflow source, queue and gap before a later valid observation', async c => {
  const users = await c.addStudents(1002, 150000);
  await c.initialize(c.b);
  const before = await c.roster();
  await c.source(c.a);
  await c.a.exec('BEGIN');
  const requestSnapshotSql = "SELECT to_jsonb(r) AS item FROM uc_group_education_requests r WHERE backend_pid=pg_backend_pid() AND full_transaction_id=pg_current_xact_id()::text ORDER BY row_kind,organization_id,group_id,request_id";
  const beforeRequests = (await c.a.query(requestSnapshotSql)).rows;
  await c.a.exec('SAVEPOINT overflow_source');
  await c.a.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id)SELECT $1,$2,u FROM unnest($3::uuid[])u', [c.ids.organization, c.ids.group, users.slice(0, 1001)]);
  await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');
  expect((await first(c.a, 'SELECT active_gap FROM uc_group_education_states WHERE group_id=$1', [c.ids.group])).active_gap).not.toBeNull();
  expect((await c.roster()).rows).toEqual(before.rows);
  await c.a.exec('ROLLBACK TO overflow_source');
  expect((await first(c.a, 'SELECT active_gap FROM uc_group_education_states WHERE group_id=$1', [c.ids.group])).active_gap).toBeNull();
  expect((await c.a.query(requestSnapshotSql)).rows).toEqual(beforeRequests);
  await sourceInsert(c, c.a, users[1001]);
  await c.a.exec('COMMIT');
  const final = await c.roster();
  expect(final.coverage).toBe('complete_observed');
  expect(final.rows.map((v: any) => v.user_id)).toEqual([c.ids.student, users[1001]].sort());
  expect((await first(c.monitor, "SELECT count(*)::int n FROM uc_group_education_requests WHERE row_kind IN('source_pending','source_detail','source_parent','erase_context')")).n).toBe(0);
  c.note({sourceBefore: before.rows.map((v: any) => v.user_id), sourceAfter: final.rows.map((v: any) => v.user_id), rolledBackOverflowSubjects: 1001, measuredSavepointRollback: true});
});

registerNativeCase('N11', 'native parent cascades and exact cancellation preserve private parent transaction witnesses', async c => {
  await c.initialize(c.b);
  const historical = await tableHashes(c, ['org_documents', 'org_document_versions', 'program_fact_versions']);
  await c.source(c.a);
  const parentOutcomes = new Map<string, any>();
  const attemptParent = async (connection: NativeConnection, parent: 'student_groups' | 'courses') => {
    const parentId = parent === 'student_groups' ? c.ids.group : c.ids.course;
    try { await connection.query(`DELETE FROM ${parent} WHERE id=$1`, [parentId]); return {success: true}; }
    catch (error: any) { return {success: false, code: error.code, constraint: error.constraint_name ?? null, message: error.message}; }
  };
  for (const parent of ['student_groups', 'courses'] as const) {
    await c.a.exec('BEGIN');
    const outcome = await attemptParent(c.a, parent);
    parentOutcomes.set(parent, outcome);
    const current = await c.read(c.b);
    expect(current.state.scope.group_id).toBe(c.ids.group);
    const context = outcome.success ? (await c.a.query("SELECT row_kind,backend_pid,full_transaction_id,context FROM uc_group_education_requests WHERE row_kind='source_parent'")).rows : [];
    for (const witness of context) expect(witness.backend_pid).toBe(await c.a.pid());
    await c.a.exec('ROLLBACK');
    expect(await tableHashes(c, ['org_documents', 'org_document_versions', 'program_fact_versions'])).toEqual(historical);
    c.note({nativeParentDelete: parent, actualOutcome: outcome, rolledBackAtomically: true, exactContext: context});
  }
  // Keep the enrollment present for the authorization check. Calling after
  // its committed cancellation would exercise the original not-found path.
  await c.caller(c.a, c.ids.viewer);
  await c.a.exec('BEGIN');
  await c.a.query("SELECT set_config('app.uc_enrollment_parent_delete','true',true)");
  await rejected(c.a.query('SELECT cancel_course_assignment($1,$2)', [c.ids.enrollment, c.ids.organization]), '42501', 'enrollment_delete_access_denied');
  await c.a.exec('ROLLBACK');
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM enrollments WHERE id=$1', [c.ids.enrollment])).n).toBe(1);
  await c.owner(c.a);
  await c.a.exec('BEGIN');
  const cancelled = (await first(c.a, 'SELECT cancel_course_assignment($1,$2)d', [c.ids.enrollment, c.ids.organization])).d;
  expect(cancelled).toMatchObject({cancelled: true, enrollmentId: c.ids.enrollment});
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM enrollments WHERE id=$1', [c.ids.enrollment])).n).toBe(1);
  await c.a.exec('COMMIT');
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM enrollments WHERE id=$1', [c.ids.enrollment])).n).toBe(0);
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM uc_enrollment_delete_witnesses')).n).toBe(0);
  expect((await c.roster()).rows[0].association).toBe('no_exact_enrollment');
  const organizationAttempt = async (connection: NativeConnection) => {
    await connection.exec('RESET ROLE');
    await connection.query("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)");
    const admin = c.id(161000);
    await connection.query('INSERT INTO auth.users(id)VALUES($1)', [admin]);
    await connection.query("INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,'Synthetic organization-delete control')", [admin, c.ids.organization]);
    await connection.query("INSERT INTO user_roles(user_id,role)VALUES($1,'admin')", [admin]);
    await executeAsGroupEducationCaller(connection as any, admin);
    await connection.exec('BEGIN');
    let result: any;
    try { await connection.query('SELECT admin_delete_organization($1)', [c.ids.organization]); result = {success: true}; }
    catch (error: any) { result = {success: false, code: error.code, constraint: error.constraint_name ?? null, message: error.message}; }
    await connection.exec('ROLLBACK');
    return result;
  };
  const updatedOrganizationOutcome = await organizationAttempt(c.a);
  // A retained approved programme can impose an unchanged restrictive FK.
  // Compare the actual original workflow in a separate, sequential native DB;
  // do not weaken that FK just to produce a successful cascade assertion.
  await c.db.close();
  const old = await createUcGroupEducationFixture(false) as any;
  try {
    await seedGroupEducationScenario(old);
    const control = old.native.connect('n11_original_organization');
    await control.exec('RESET ROLE');
    await control.query("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)");
    for (const parent of ['student_groups', 'courses'] as const) {
      await control.exec('BEGIN');
      const original = await attemptParent(control, parent);
      await control.exec('ROLLBACK');
      expect(parentOutcomes.get(parent)).toEqual(original);
      c.note({parent, actualOldOutcome: original, unchangedNewOutcome: parentOutcomes.get(parent), retainedOriginalGuards: true});
    }
    await executeAsGroupEducationCaller(control as any, c.ids.owner);
    expect((await first(control, 'SELECT cancel_course_assignment($1,$2)d', [c.ids.enrollment, c.ids.organization])).d.cancelled).toBe(true);
    const originalOrganizationOutcome = await organizationAttempt(control);
    expect(updatedOrganizationOutcome).toEqual(originalOrganizationOutcome);
    c.note({organizationWorkflow: 'Actual original admin_delete_organization on the same retained programme fixture, measured before and after116', originalOrganizationOutcome, updatedOrganizationOutcome, noForeignKeyWeakened: true});
  } finally { await old.close(); }
});

registerNativeCase('N13', 'actual UC112 issuance and UC115 admission locks cannot invert new source fences', async c => {
  await c.initialize(c.b);
  const preserved = await tableHashes(c, ['student_frdo_data', 'video_identifications', 'enrollments']);
  await c.a.exec('BEGIN');
  const issued = (await c.a.query('SELECT * FROM issue_education_document_batch($1,$2,$3,$4)', [c.ids.organization, c.ids.group, c.ids.course, JSON.stringify([{user_id: c.ids.student, enrollment_id: c.ids.enrollment, document_type: 'certificate', issue_date: '2026-10-19', full_name: 'Synthetic native learner', birth_date: '1990-01-01', specialty_name: 'Caller must not override approved title'}])])).rows;
  expect(issued).toHaveLength(1);
  expect(issued[0].specialty_name).toBe(c.s.facts.full_title);
  await c.source(c.b);
  await rejected(c.b.query('UPDATE profiles SET archived_at=clock_timestamp() WHERE user_id=$1', [c.ids.student]), '40001');
  c.note({actualIssuerHeldLocks: await c.locks([await c.a.pid()]), issuedRows: issued.length});
  await c.a.exec('COMMIT');
  expect(await tableHashes(c, ['student_frdo_data', 'video_identifications', 'enrollments'])).toEqual(preserved);
  await c.owner(c.b);
  const admission = (await first(c.a, 'SELECT read_student_admission_case($1,$2,$3)d', [c.ids.organization, c.ids.student, JSON.stringify({mode: 'case', group_id: c.ids.group, enrollment_id: c.ids.enrollment})])).d;
  await c.a.exec('BEGIN');
  const applied = (await first(c.a, 'SELECT apply_student_admission_case_action($1,$2,$3,$4)d', [c.ids.organization, c.ids.student, c.uuid(), JSON.stringify({action: 'initialize', group_id: c.ids.group, enrollment_id: c.ids.enrollment, expected_program_ref: admission.program_ref, expected_revision: 0})])).d;
  expect(applied.state).not.toBeNull();
  await c.source(c.b);
  await rejected(c.b.query('UPDATE profiles SET archived_at=clock_timestamp() WHERE user_id=$1', [c.ids.student]), '40001');
  await c.a.exec('COMMIT');
  expect(await tableHashes(c, ['student_frdo_data', 'video_identifications', 'enrollments'])).toEqual(preserved);
  await c.owner(c.b);
  expect((await c.read(c.b)).state.coverage).toBe('complete_observed');
});

registerNativeCase('N14', 'trusted actual account erasure redacts copied labels while a competing publisher cannot resurrect them', async c => {
  await c.initialize(c.b);
  await c.publishCalendar(c.b);
  const retained = await c.capture(c.b);
  const subject = c.ids.teacher;
  const originalName = (await first(c.monitor, 'SELECT full_name FROM profiles WHERE user_id=$1', [subject])).full_name;
  const files = (await first(c.monitor, 'SELECT account_deletion_files($1)files', [subject])).files;
  await c.monitor.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)', [subject]);
  const job = c.uuid();
  await c.monitor.query("INSERT INTO account_deletion_jobs(id,receipt_hash,consent_version,state,user_id,snapshot,files,data_erased)VALUES($1,'synthetic-native116-erase','full-personal-data-v1','cleanup_pending',$2,'{}',$3,false)", [job, subject, JSON.stringify(files)]);
  await c.caller(c.a, null, 'service_role');
  await c.a.exec('BEGIN');
  expect((await first(c.a, "SELECT account_deletion_erase_data($1,'synthetic-native116-erase')d", [job])).d).toEqual({erased: true});
  const held = await c.locks([await c.a.pid()]);
  const keys = await c.monitor.query("SELECT user_id,hashtextextended(user_id::text,42007)::text key FROM(SELECT user_id FROM profiles UNION SELECT id FROM auth.users)accounts");
  for (const account of keys.rows.filter(v => v.user_id !== subject)) {
    const value = BigInt(account.key);
    expect(held.some(v => v.locktype === 'advisory' && v.granted && v.classid === String((value >> 32n) & 4294967295n) && v.objid === String(value & 4294967295n))).toBe(false);
  }
  await rejected(c.capture(c.b), '40001');
  await c.a.exec('COMMIT');
  for (const table of ['uc_group_education_states', 'uc_group_education_events', 'uc_group_calendar_versions', 'uc_group_roster_snapshots', 'uc_group_education_requests']) {
    const text = JSON.stringify((await c.monitor.query(`SELECT to_jsonb(t)d FROM ${table} t`)).rows);
    expect(text, table).not.toContain(subject);
    expect(text, table).not.toContain(originalName);
  }
  const snapshot = await c.read(c.b, {kind: 'snapshot', snapshot_id: retained.receipt.snapshot_id, after_user_id: null, limit: 100});
  expect(snapshot.header.available).toBe(false);
  // A retained calendar was redacted, so the canonical capture command must
  // reject its source before any teacher/roster can be reused.
  await rejected(c.capture(c.b), '40001', 'GROUP_FACTS_SOURCE_CHANGED');
  c.note({trustedJobValidated: true, erasedTeacher: subject, noForeignAccountFenceHeld: true, originalSnapshotUnavailable: true,
    lockEvidence: {totalTuples: held.length, advisory: held.filter(v => v.locktype === 'advisory'),
      modes: Object.fromEntries([...new Set(held.map(v => v.mode))].map(mode => [mode, held.filter(v => v.mode === mode).length]))}});
});

registerNativeCase('N16', 'actual capacity40001 rollback then the same UID retry charges the monthly usage once', async c => {
  await c.initialize(c.b);
  await c.publishCalendar(c.b);
  const user = c.id(160000);
  await c.monitor.query('INSERT INTO auth.users(id)VALUES($1)', [user]);
  const before = (await first(c.monitor, 'SELECT coalesce(sum(students_added_count),0)::int n FROM organization_usage WHERE organization_id=$1', [c.ids.organization])).n;
  await c.a.exec('BEGIN');
  const state = (await c.read(c.a)).state;
  const published = (await c.read(c.a, {kind: 'calendar', selection: {kind: 'current', view: 'published'}})).calendar;
  await c.apply(c.a, state.revision, {action: 'save_calendar_version', base_version_id: published.id, expected_program_ref: state.program_ref, timezone: published.timezone, planned_start_date: published.planned_start_date, planned_end_date: published.planned_end_date, coverage: published.coverage, partial_reason: published.partial_reason, lessons: published.lessons.map((v: any) => ({lesson_id: v.lesson_id, local_date: v.local_date, starts_at: v.starts_at, ends_at: v.ends_at, topic: v.topic, module_label: v.module_label, course_lesson_id: v.course_lesson_id, academic_hours: v.academic_hours, teacher_user_id: v.teacher_user_id, status: v.status, cancellation_reason: v.cancellation_reason})), reason: 'Synthetic lock holder'});
  await c.source(c.b);
  const args = [c.ids.organization, user, 'Synthetic capacity retry', null, null, null, null, c.ids.group, null];
  const sql = 'SELECT create_student_profile_with_capacity($1,$2,$3,$4,$5,$6,$7,$8,$9)d';
  await rejected(c.b.query(sql, args), '40001');
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM profiles WHERE user_id=$1', [user])).n).toBe(0);
  expect((await first(c.monitor, 'SELECT coalesce(sum(students_added_count),0)::int n FROM organization_usage WHERE organization_id=$1', [c.ids.organization])).n).toBe(before);
  await c.a.exec('COMMIT');
  const retried = (await first(c.b, sql, args)).d;
  expect(retried).toMatchObject({success: true, is_existing: false});
  const duplicate = (await first(c.b, sql, args)).d;
  expect(duplicate).toMatchObject({success: true, is_existing: true});
  expect((await first(c.monitor, 'SELECT coalesce(sum(students_added_count),0)::int n FROM organization_usage WHERE organization_id=$1', [c.ids.organization])).n).toBe(before + 1);
  expect((await first(c.monitor, 'SELECT count(*)::int n FROM profiles WHERE user_id=$1', [user])).n).toBe(1);
  c.note({nativeKnownRollbackCode: '40001', sameUidSameArgsRetry: true, usageDelta: 1, duplicateProfileCount: 1, boundary: 'Native SQL only; handler transport ambiguity/no-Auth-delete behavior is independently covered by actual-source injected SDK tests, not native HTTP/Auth.'});
});
