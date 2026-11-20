// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL role/RLS execution in an empty in-memory lab. Authority
// adapters are synthetic: this does not claim production OAuth acceptance.
const id = (value: number) => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;
const read = (path: string) => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');
const org = id(100), otherOrg = id(200), group = id(401), secondGroup = id(402), foreignGroup = id(403);
const learner = id(10), additional = id(11), archived = id(12), foreign = id(20), course = id(301);
let db: PGlite;
let beforeCatalog: unknown;
let beforeData: unknown;
let afterCatalog: unknown;
let afterData: unknown;

const baseSeed = `
 INSERT INTO student_groups VALUES('${group}','${org}',NULL),('${secondGroup}','${org}',NULL),
 ('${foreignGroup}','${otherOrg}','${id(303)}'),('${id(404)}','${org}',NULL);
 INSERT INTO courses VALUES('${course}','${org}','Current course','PRIVATE COURSE BODY'),
 ('${id(302)}','${org}','Second course','PRIVATE COURSE BODY'),('${id(303)}','${otherOrg}','Foreign course','PRIVATE');
 INSERT INTO profiles VALUES
 ('${learner}','${org}','${group}','Primary learner','own@example.invalid','primary','100',NULL,'Цех','PRIVATE PASSWORD','PRIVATE PROFILE'),
 ('${additional}','${org}','${secondGroup}','Additional learner','additional@example.invalid','additional','101',NULL,NULL,'PRIVATE PASSWORD','PRIVATE PROFILE'),
 ('${archived}','${org}','${group}','Archived learner',NULL,'archived',NULL,'2026-11-01',NULL,'PRIVATE PASSWORD','PRIVATE PROFILE'),
 ('${foreign}','${otherOrg}','${foreignGroup}','Foreign learner',NULL,'foreign',NULL,NULL,NULL,'PRIVATE PASSWORD','PRIVATE PROFILE');
 INSERT INTO student_group_memberships VALUES('${org}','${group}','${additional}'),('${org}','${group}','${learner}');
 INSERT INTO student_identity_documents VALUES
 ('${id(500)}','${learner}','${org}','passport','PRIVATE FILE URL',true),
 ('${id(501)}','${learner}','${otherOrg}','snils','FOREIGN PRIVATE FILE',true),
 ('${id(502)}','${learner}','${org}','passport','RLS HIDDEN FILE',false),
 ('${id(503)}','${additional}','${org}','passport','PRIVATE FILE URL',true);
 INSERT INTO org_contracts VALUES
 ('${id(600)}','${org}','${learner}','${group}','PRIVATE CONTRACT',true),
 ('${id(601)}','${org}','${additional}','${secondGroup}','PRIVATE CONTRACT',true),
 ('${id(602)}','${org}','${foreign}','${group}','GROUP ONLY CONTRACT',true),
 ('${id(603)}','${otherOrg}','${learner}','${foreignGroup}','FOREIGN CONTRACT',true);
 INSERT INTO test_attempts VALUES('${id(700)}','${learner}',88,'{"secret":"answers"}',true),
 ('${id(701)}','${learner}',0,'{"secret":"hidden"}',false),('${id(702)}','${foreign}',99,'{}',true);
 INSERT INTO enrollments VALUES
 ('${id(800)}','${learner}','${course}','completed',100,'2026-11-01','PRIVATE ENROLLMENT',true),
 ('${id(801)}','${additional}','${course}','active',20,NULL,'PRIVATE ENROLLMENT',true),
 ('${id(802)}','${learner}','${id(302)}','completed',100,'2026-10-01','PRIVATE ENROLLMENT',true),
 ('${id(803)}','${foreign}','${id(303)}','active',0,NULL,'FOREIGN ENROLLMENT',true),
 ('${id(804)}','${learner}','${id(303)}','active',0,NULL,'HIDDEN ENROLLMENT',false);
 INSERT INTO student_frdo_data(id,user_id,organization_id,last_name,first_name,snils,private_notes) VALUES
 ('${id(900)}','${learner}','${org}','Own','Learner','own-snils','PRIVATE FRDO NOTE'),
 ('${id(901)}','${learner}','${otherOrg}','Foreign','Record','foreign-snils','PRIVATE FRDO NOTE'),
 ('${id(902)}','${additional}','${org}','Additional','Learner',NULL,'PRIVATE FRDO NOTE');
`;

async function catalog() {
  return (await db.query(`SELECT jsonb_build_object(
   'views',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'def',pg_get_viewdef(c.oid,true),'options',c.reloptions,'acl',c.relacl::text) ORDER BY c.relname)
     FROM pg_class c WHERE c.oid IN ('student_group_profiles_effective'::regclass,'student_group_memberships_effective'::regclass)),
   'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public'),
   'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'acl',c.relacl::text,'owner',c.relowner,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity) ORDER BY c.relname)
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN
      ('profiles','student_groups','student_group_memberships','courses','enrollments','student_identity_documents','org_contracts','test_attempts','student_frdo_data')),
   'old_functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'def',md5(pg_get_functiondef(p.oid))) ORDER BY p.oid)
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'lab_%')
   ) AS value`)).rows[0];
}
async function tableData() {
  const result: Record<string, unknown> = {};
  for (const table of ['profiles', 'student_groups', 'student_group_memberships', 'courses', 'enrollments',
    'student_identity_documents', 'org_contracts', 'test_attempts', 'student_frdo_data']) {
    result[table] = (await db.query(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) AS hash FROM public.${table} t`)).rows[0];
  }
  return result;
}
async function actor(kind = 'owner', options: { org?: string; group?: string; subject?: string; hidden?: string; hiddenCourse?: string; actorId?: string } = {}) {
  await db.exec('RESET ROLE');
  for (const [key, value] of Object.entries({ actor: options.actorId ?? id(kind === 'admin' ? 2 : 1), kind,
    org: options.org ?? org, group: options.group ?? '', subject: options.subject ?? '', hidden_group: options.hidden ?? '',
    hidden_course: options.hiddenCourse ?? '', enrollment_error: '', identity_error: '' })) {
    await db.query('SELECT set_config($1,$2,false)', [`qa.${key}`, value]);
  }
  await db.exec('SET ROLE authenticated');
}
async function roster(groupId = group, organizationId = org): Promise<any> {
  return (await db.query('SELECT public.get_group_roster_metadata($1::uuid,$2::uuid) AS value', [organizationId, groupId])).rows[0].value;
}
async function details(users = [learner, additional], linked: string | null = null, groupId = group, organizationId = org): Promise<any> {
  return (await db.query('SELECT public.get_group_participant_metadata($1::uuid,$2::uuid,$3::uuid[],$4::uuid) AS value',
    [organizationId, groupId, `{${users.join(',')}}`, linked])).rows[0].value;
}
async function rejected(fn: () => Promise<unknown>, code: string) {
  await db.exec('SAVEPOINT expected_denial');
  try { await expect(fn()).rejects.toMatchObject({ code }); }
  finally { await db.exec('ROLLBACK TO SAVEPOINT expected_denial; RELEASE SAVEPOINT expected_denial'); }
}
async function ownerSql(sql: string) { await db.exec('RESET ROLE'); await db.exec(sql); }

beforeAll(async () => {
  db = new PGlite();
  await db.exec(await read('supabase/tests/group-folder-metadata/fixture.sql'));
  await db.exec(baseSeed);
  beforeCatalog = await catalog(); beforeData = await tableData();
  await db.exec(await read('supabase/migrations/20261120090000_group_folder_read_metadata.sql'));
  afterCatalog = await catalog(); afterData = await tableData();
}, 30_000);
beforeEach(async () => { await db.exec('RESET ROLE; BEGIN'); await actor(); });
afterEach(async () => { await db.exec('RESET ROLE; ROLLBACK'); });
afterAll(async () => { await db.close(); });

describe('group metadata ordinary SQL readers', () => {
  it('changes no old rows, views, policies, function bodies or grants', () => {
    expect(afterCatalog).toEqual(beforeCatalog);
    expect(afterData).toEqual(beforeData);
  });

  it('installs only ordinary stable invoker readers with authenticated execution and no anonymous/service execution', async () => {
    await db.exec('RESET ROLE');
    const rows = (await db.query(`SELECT proname,prosecdef,provolatile,proconfig,
      has_function_privilege('authenticated',p.oid,'EXECUTE') auth,
      has_function_privilege('anon',p.oid,'EXECUTE') anon,
      has_function_privilege('service_role',p.oid,'EXECUTE') service
      FROM pg_proc p WHERE proname IN ('get_group_roster_metadata','get_group_participant_metadata') ORDER BY proname`)).rows;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toMatchObject({ prosecdef: false, provolatile: 's', proconfig: ['search_path=pg_catalog'], auth: true, anon: false, service: false });
  });

  it('returns the complete effective primary/additional/archive roster once, with only seven metadata fields', async () => {
    const result = await roster();
    expect(result).toMatchObject({ version: 1, organization_id: org, group_id: group });
    expect(result.profiles.map((row: any) => row.user_id)).toEqual([learner, additional, archived]);
    for (const row of result.profiles) expect(Object.keys(row).sort()).toEqual(['user_id', 'full_name', 'email', 'login', 'phone', 'archived_at', 'department'].sort());
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|generated_password|file_path|private_notes/);
  });

  it('preserves caller-visible source filters while returning no file paths, answers, scores or course contents', async () => {
    await actor('admin');
    const result = await details();
    expect(result).toMatchObject({ version: 1, organization_id: org, group_id: group, user_ids: [learner, additional], linked_course_id: null, enrollment_error: false });
    expect(result.identity_rows).toEqual([
      { user_id: learner, organization_id: org, type: 'passport' },
      { user_id: learner, organization_id: otherOrg, type: 'snils' },
      { user_id: additional, organization_id: org, type: 'passport' },
    ]);
    expect(result.contract_rows).toEqual([{ id: id(600), student_user_id: learner }, { id: id(601), student_user_id: additional }]);
    expect(result.attempt_rows).toEqual([{ id: id(700), user_id: learner }]);
    expect(result.frdo_rows.map((row: any) => row.user_id)).toEqual([learner, additional]);
    expect(result.frdo_rows[0].snils).toBe('own-snils');
    expect(result.enrollment_rows.map((row: any) => row.course_id)).toEqual([course, course, id(302)]);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|file_path|answers|score|private_notes|foreign-snils|content/);
  });

  it('honors actual caller RLS on identities even when the same subject has another organization record', async () => {
    const result = await details();
    expect(result.identity_rows).toHaveLength(2);
    expect(result.identity_rows.every((row: any) => row.organization_id === org)).toBe(true);
  });

  it('keeps an assigned teacher limited to the caller-visible group and subjects', async () => {
    await actor('teacher', { group });
    expect((await roster()).profiles.map((row: any) => row.user_id)).toEqual([learner, additional, archived]);
    expect((await details()).user_ids).toEqual([learner, additional]);
    await rejected(() => roster(secondGroup), '42501');
    await rejected(() => details([learner, foreign]), '40001');
  });

  it('keeps a genuine SQL learner role context subject-only instead of leaking peers through aggregation', async () => {
    await actor('learner', { subject: learner });
    expect((await roster()).profiles.map((row: any) => row.user_id)).toEqual([learner]);
    expect((await details([learner])).user_ids).toEqual([learner]);
    await rejected(() => details([learner, additional]), '40001');
  });

  it('denies an invisible group even when the old additional membership view can expose its visible profile pair', async () => {
    await actor('owner', { hidden: group });
    const legacy = await db.query('SELECT user_id FROM public.student_group_profiles_effective WHERE organization_id=$1 AND group_id=$2', [org, group]);
    expect(legacy.rows.length).toBeGreaterThan(0);
    await rejected(() => roster(), '42501');
    await rejected(() => details(), '42501');
  });

  it('denies a foreign or nonexistent organization/group rather than returning false empty data', async () => {
    await rejected(() => roster(foreignGroup, otherOrg), '42501');
    await rejected(() => roster(id(999)), '42501');
  });

  it('rejects duplicate, null and foreign requested subjects rather than widening or silently dropping them', async () => {
    await rejected(() => details([learner, learner]), '22023');
    await rejected(() => db.query('SELECT public.get_group_participant_metadata($1::uuid,$2::uuid,NULL,NULL)', [org, group]), '22023');
    await rejected(() => db.query('SELECT public.get_group_participant_metadata($1::uuid,$2::uuid,ARRAY[NULL]::uuid[],NULL)', [org, group]), '22023');
    await rejected(() => details([learner, foreign]), '40001');
  });

  it('keeps a concurrent new member outside the completed roster snapshot without failing the existing load', async () => {
    const snapshot = (await roster()).profiles.filter((row: any) => !row.archived_at).map((row: any) => row.user_id);
    await ownerSql(`INSERT INTO profiles(user_id,organization_id,student_group_id,full_name) VALUES('${id(99)}','${org}','${group}','New concurrent learner')`);
    await actor();
    const result = await details(snapshot);
    expect(result.user_ids).toEqual([learner, additional]);
    expect(JSON.stringify(result)).not.toContain(id(99));
    expect((await roster()).profiles).toHaveLength(4);
  });

  it.each(['archive', 'remove'])('requests a reload when a snapshot subject is %s before details', async change => {
    await roster();
    await ownerSql(change === 'archive'
      ? `UPDATE profiles SET archived_at='2026-11-20' WHERE user_id='${additional}'`
      : `DELETE FROM student_group_memberships WHERE group_id='${group}' AND user_id='${additional}'`);
    await actor();
    await rejected(() => details(), '40001');
  });

  it('compares the current linked course rather than allowing a nullable/foreign argument to expand enrollment reads', async () => {
    await ownerSql(`UPDATE student_groups SET course_id='${course}' WHERE id='${group}'`);
    await actor();
    await rejected(() => details(), '40001');
    await rejected(() => details([learner, additional], id(303)), '40001');
    const result = await details([learner, additional], course);
    expect(result.enrollment_rows.map((row: any) => row.course_id)).toEqual([course, course]);
  });

  it('keeps participant metadata but never reads an inconsistent cross-organization linked course', async () => {
    await ownerSql(`UPDATE student_groups SET course_id='${id(303)}' WHERE id='${group}'`);
    await actor('admin');
    await db.query("SELECT set_config('qa.enrollment_error','cancel',false)");
    const result = await details([learner, additional], id(303));
    expect(result).toMatchObject({ enrollment_error: true, enrollment_rows: null });
    expect(result.attempt_rows).toEqual([{ id: id(700), user_id: learner }]);
  });

  it('preserves students-read access when a caller cannot read the linked course', async () => {
    await ownerSql(`UPDATE student_groups SET course_id='${course}' WHERE id='${group}'`);
    await actor('teacher', { group, hiddenCourse: course });
    expect((await db.query('SELECT id FROM courses WHERE id=$1', [course])).rows).toEqual([]);
    await db.query("SELECT set_config('qa.enrollment_error','cancel',false)");
    const result = await details([learner, additional], course);
    expect(result).toMatchObject({ enrollment_error: true, enrollment_rows: null, user_ids: [learner, additional] });
    expect(result.identity_rows).toHaveLength(2);
  });

  it('returns explicit unknown linked-course evidence on ordinary enrollment read failure, but fails inference', async () => {
    await db.query("SELECT set_config('qa.enrollment_error','permission',false)");
    await rejected(() => details(), '42501');
    await ownerSql(`UPDATE student_groups SET course_id='${course}' WHERE id='${group}'`);
    await actor();
    await db.query("SELECT set_config('qa.enrollment_error','permission',false)");
    const result = await details([learner, additional], course);
    expect(result.enrollment_error).toBe(true);
    expect(result.enrollment_rows).toBeNull();
    expect(result.attempt_rows).toHaveLength(1);
  });

  it('does not bypass statement cancellation or turn a broken detail dependency into empty metadata', async () => {
    await ownerSql(`UPDATE student_groups SET course_id='${course}' WHERE id='${group}'`);
    await actor();
    await db.query("SELECT set_config('qa.enrollment_error','cancel',false)");
    await rejected(() => details([learner, additional], course), '57014');
    await db.query("SELECT set_config('qa.enrollment_error','',false),set_config('qa.identity_error','dependency',false)");
    await rejected(() => details([learner, additional], course), '42883');
  });

  it('keeps an empty group distinct from unavailable scope and returns complete empty arrays', async () => {
    expect((await roster(id(404))).profiles).toEqual([]);
    const result = await details([], null, id(404));
    expect(result).toMatchObject({ user_ids: [], identity_rows: [], contract_rows: [], attempt_rows: [], frdo_rows: [], enrollment_rows: [], enrollment_error: false });
  });

  it('returns more than 1000 learners and attempts inside one complete JSON row without a hidden page cap', async () => {
    await ownerSql(`INSERT INTO profiles(user_id,organization_id,student_group_id,full_name)
      SELECT ('00000000-0000-0000-0000-'||lpad((10000+n)::text,12,'0'))::uuid,'${org}','${group}','Large synthetic learner '||n FROM generate_series(1,1303)n;
      INSERT INTO test_attempts(id,user_id,score,answers)
      SELECT ('00000000-0000-0000-0000-'||lpad((20000+n)::text,12,'0'))::uuid,'${learner}',100,'{}' FROM generate_series(1,1207)n;`);
    await actor();
    const result = await roster();
    expect(result.profiles).toHaveLength(1306);
    const snapshot = result.profiles.filter((row: any) => !row.archived_at).map((row: any) => row.user_id);
    expect((await details(snapshot)).attempt_rows).toHaveLength(1208);
  }, 30_000);

  it('observes a hold or revocation on the next call of the same ordinary reader', async () => {
    expect((await roster()).profiles).toHaveLength(3);
    await ownerSql(`INSERT INTO lab_holds VALUES('${org}')`); await actor();
    await rejected(() => roster(), '42501');
    await ownerSql(`DELETE FROM lab_holds; INSERT INTO lab_revocations VALUES('${id(1)}')`); await actor();
    await rejected(() => roster(), '42501');
  });

  it('retains anonymous execution denial and has no mutation authority through the new functions', async () => {
    await db.exec('RESET ROLE; SET ROLE anon');
    await rejected(() => roster(), '42501');
    await actor();
    await rejected(() => db.query('DELETE FROM public.profiles WHERE user_id=$1', [learner]), '42501');
  });
});
