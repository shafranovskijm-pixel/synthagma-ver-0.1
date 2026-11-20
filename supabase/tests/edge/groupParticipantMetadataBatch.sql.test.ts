// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL roles/RLS in an empty local lab, using the same explicitly
// synthetic authority adapters as the original metadata-reader SQL tests.
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const org = id(100), group = id(401), learner = id(10), additional = id(11);
const original = 'public.get_group_participant_metadata(uuid,uuid,uuid[],uuid)';
const quarantine = 'public.get_group_participant_metadata_quarantined_20261120(uuid,uuid,uuid[],uuid)';
const batch = 'public.get_group_participant_metadata_batch(uuid,uuid,uuid[],uuid)';
const read = async (path: string) => (await readFile(new URL(`../../../${path}`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
let db: PGlite;
let migration: string;

async function actor(kind = 'owner', subject = '') {
  await db.exec('RESET ROLE');
  for (const [key, value] of Object.entries({ actor: id(1), kind, org, subject,
    group: '', hidden_group: '', hidden_course: '', enrollment_error: '', identity_error: '' })) {
    await db.query('SELECT set_config($1,$2,false)', [`qa.${key}`, value]);
  }
  await db.exec('SET ROLE authenticated');
}
async function metadata(signature = original) {
  await db.exec('RESET ROLE');
  return (await db.query(`SELECT p.oid,md5(p.prosrc) AS body,
    to_jsonb(p)-ARRAY['proname','prosrc','proargdefaults'] AS unchanged,
    pg_get_expr(p.proargdefaults,0) AS default_expression,
    has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
    has_function_privilege('anon',p.oid,'EXECUTE') anon,
    has_function_privilege('service_role',p.oid,'EXECUTE') service
    FROM pg_proc p WHERE p.oid=$1::regprocedure`, [signature])).rows[0];
}
async function install() { await db.exec('RESET ROLE'); await db.exec(migration); }
async function call(name = 'get_group_participant_metadata_batch', users = [learner, additional]): Promise<any> {
  return (await db.query(`SELECT public.${name}($1::uuid,$2::uuid,$3::uuid[],NULL) AS value`,
    [org, group, `{${users.join(',')}}`])).rows[0].value;
}
async function rejected(fn: () => Promise<unknown>, code = '55000', message?: string) {
  await db.exec('SAVEPOINT expected_denial');
  try {
    await expect(fn()).rejects.toMatchObject({ code, ...(message ? { message } : {}) });
  } finally { await db.exec('ROLLBACK TO SAVEPOINT expected_denial; RELEASE SAVEPOINT expected_denial'); }
}
async function unchangedDataAndAuthority() {
  await db.exec('RESET ROLE');
  return (await db.query(`SELECT jsonb_build_object(
   'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY user_id) FROM profiles p),
   'members',(SELECT jsonb_agg(to_jsonb(m) ORDER BY user_id,group_id) FROM student_group_memberships m),
   'attempts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM test_attempts a),
   'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public'),
   'tables',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'owner',c.relowner,'acl',c.relacl::text,
      'options',c.reloptions,'rls',c.relrowsecurity,'force',c.relforcerowsecurity) ORDER BY c.oid)
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','v')),
   'views',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'def',pg_get_viewdef(c.oid,true)) ORDER BY c.relname)
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v'),
   'roster_function',(SELECT to_jsonb(p) FROM pg_proc p WHERE p.oid='public.get_group_roster_metadata(uuid,uuid)'::regprocedure)
  ) AS value`)).rows[0].value;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(await read('supabase/tests/group-folder-metadata/fixture.sql'));
  // Git's canonical LF body is the pinned production preimage; Windows CRLF
  // checkout normalization here is explicit and not a second allowed body.
  const oldSource = await read('supabase/migrations/20261120090000_group_folder_read_metadata.sql');
  expect(createHash('sha256').update(oldSource).digest('hex')).toBe('1bbab32997433af06301efad2aa39d58837d5cecfc39de7843bddb38906f3112');
  await db.exec(oldSource);
  await db.exec(`
   INSERT INTO student_groups VALUES('${group}','${org}',NULL),('${id(402)}','${org}',NULL),('${id(403)}','${id(200)}',NULL);
   INSERT INTO profiles(user_id,organization_id,student_group_id,full_name) VALUES
    ('${learner}','${org}','${group}','Primary'),('${additional}','${org}','${id(402)}','Additional'),
    ('${id(20)}','${id(200)}','${id(403)}','Foreign');
   INSERT INTO student_group_memberships VALUES('${org}','${group}','${additional}');
   INSERT INTO courses VALUES('${id(301)}','${org}','Course','PRIVATE COURSE');
   INSERT INTO enrollments(id,user_id,course_id,status,progress) VALUES('${id(800)}','${learner}','${id(301)}','active',40);
   INSERT INTO student_identity_documents VALUES('${id(500)}','${learner}','${org}','passport','PRIVATE FILE',true),
    ('${id(501)}','${learner}','${id(200)}','snils','FOREIGN FILE',true);
   INSERT INTO test_attempts VALUES('${id(700)}','${learner}',88,'{"private":"answers"}',true),
    ('${id(701)}','${learner}',0,'{"private":"hidden"}',false);
  `);
  const raw = await read('supabase/migrations/20261120100000_group_participant_metadata_batch.sql');
  expect(raw.match(/^BEGIN;$/gm)).toHaveLength(1);
  expect(raw.match(/^COMMIT;$/gm)).toHaveLength(1);
  migration = raw.replace(/^BEGIN;\n/m, '').replace(/^COMMIT;\n?$/m, '');
}, 30_000);
beforeEach(async () => { await db.exec('RESET ROLE; BEGIN'); });
afterEach(async () => { await db.exec('RESET ROLE; ROLLBACK'); });
afterAll(async () => { await db.close(); });

describe('versioned group participant packet reader migration', () => {
  it.each(['original', 'quarantined'])('atomically migrates the %s preimage without changing OID, owner, ACL, default or other authority metadata', async source => {
    const before = await metadata();
    const authority = await unchangedDataAndAuthority();
    if (source === 'quarantined') await db.exec(`ALTER FUNCTION ${original} RENAME TO get_group_participant_metadata_quarantined_20261120`);
    await install();
    const after = await metadata(batch);
    expect(after.oid).toBe(before.oid);
    expect(after.unchanged).toEqual(before.unchanged);
    expect(after.default_expression).toBe(before.default_expression);
    expect(after).toMatchObject({ body: 'f3a22d80a3ccc6639e492d45abf46a23', authenticated: true, anon: false, service: false });
    expect((await db.query('SELECT to_regprocedure($1) AS original,to_regprocedure($2) AS quarantine', [original, quarantine])).rows[0]).toEqual({ original: null, quarantine: null });
    expect(await unchangedDataAndAuthority()).toEqual(authority);
  });

  it('rejects replay without changing the already installed packet reader', async () => {
    await install();
    const before = await metadata(batch);
    await rejected(install);
    expect(await metadata(batch)).toEqual(before);
  });

  it('rejects ambiguous original plus quarantined names and leaves both untouched', async () => {
    await db.exec(`CREATE FUNCTION ${quarantine} RETURNS jsonb LANGUAGE sql AS $$SELECT NULL::jsonb$$`);
    const before = await metadata();
    await rejected(install);
    expect(await metadata()).toEqual(before);
    expect((await db.query('SELECT to_regprocedure($1)::text AS packet', [batch])).rows[0].packet).toBeNull();
  });

  it('rejects a missing preimage instead of creating a new authority path', async () => {
    await db.exec(`ALTER FUNCTION ${original} RENAME TO unrelated_local_test_name`);
    await rejected(install);
    expect((await db.query('SELECT to_regprocedure($1)::text AS packet', [batch])).rows[0].packet).toBeNull();
  });

  it.each(['path', 'definer', 'public_execute'])('fails closed for unexpected %s authority metadata', async field => {
    if (field === 'path') await db.exec(`ALTER FUNCTION ${original} SET search_path=public`);
    if (field === 'definer') await db.exec(`ALTER FUNCTION ${original} SECURITY DEFINER`);
    if (field === 'public_execute') await db.exec(`GRANT EXECUTE ON FUNCTION ${original} TO PUBLIC`);
    const before = await metadata();
    await rejected(install);
    expect(await metadata()).toEqual(before);
    expect((await db.query('SELECT to_regprocedure($1)::text AS packet', [batch])).rows[0].packet).toBeNull();
  });

  it('rejects a changed function body even with the expected original name', async () => {
    await db.exec(`CREATE OR REPLACE FUNCTION public.get_group_participant_metadata(
     p_organization_id uuid,p_group_id uuid,p_user_ids uuid[],p_linked_course_id uuid DEFAULT NULL)
     RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$BEGIN RETURN NULL;END;$$`);
    const before = await metadata();
    await rejected(install);
    expect(await metadata()).toEqual(before);
  });

  it.each(['owner', 'admin', 'learner'])('retains the exact old caller-RLS metadata for a supported %s packet', async kind => {
    await actor(kind, kind === 'learner' ? learner : '');
    const users = kind === 'learner' ? [learner] : [learner, additional];
    const old = await call('get_group_participant_metadata', users);
    await install(); await actor(kind, kind === 'learner' ? learner : '');
    const current = await call('get_group_participant_metadata_batch', users);
    expect(current).toEqual(old);
    expect(JSON.stringify(current)).not.toMatch(/PRIVATE|file_path|score|answers/);
    await rejected(() => call('get_group_participant_metadata_batch', [learner, id(20)]), '40001');
  });

  it('rejects a 101-subject packet before reading even the group table', async () => {
    await install();
    await db.exec('REVOKE SELECT ON student_groups FROM authenticated');
    await actor();
    const users = Array.from({ length: 101 }, (_, i) => id(1000+i));
    await rejected(() => call('get_group_participant_metadata_batch', users), '22023', 'group_metadata_packet_too_large');
    await rejected(() => call('get_group_participant_metadata_batch', users.slice(0, 100)), '42501');
  });

  it('reads every member of a group larger than 100 in permitted packets rather than imposing a group quota', async () => {
    await db.exec(`INSERT INTO profiles(user_id,organization_id,student_group_id,full_name)
     SELECT ('00000000-0000-0000-0000-'||lpad((1000+n)::text,12,'0'))::uuid,'${org}','${group}','Large learner '||n FROM generate_series(1,250)n`);
    await install(); await actor();
    const roster = (await db.query('SELECT public.get_group_roster_metadata($1,$2) AS value', [org, group])).rows[0].value as any;
    const ids = roster.profiles.filter((row: any) => !row.archived_at).map((row: any) => row.user_id);
    expect(ids).toHaveLength(252);
    const results: string[] = [];
    for (let offset=0; offset<ids.length; offset+=100) results.push(...(await call('get_group_participant_metadata_batch', ids.slice(offset, offset+100))).user_ids);
    expect(results).toEqual(ids);
  });

  it('retains anonymous execution denial after the rename and replacement', async () => {
    await install();
    await db.exec('SET ROLE anon');
    await rejected(() => call(), '42501');
  });
});
