// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installCanonicalQuotaFunctions, postpaidAccessFixture } from '../../functions/_shared/postpaid-access.fixture';

const migration = readFileSync('supabase/migrations/20261016162000_postpaid_access.sql', 'utf8');
const org = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const owner = '20000000-0000-0000-0000-000000000001';
const staff = '20000000-0000-0000-0000-000000000002';
const student = '20000000-0000-0000-0000-000000000003';
const company = '30000000-0000-0000-0000-000000000001';
const today = `(now() AT TIME ZONE 'Europe/Moscow')::date`;
const month = `(date_trunc('month',now() AT TIME ZONE 'Europe/Moscow'))::date`;
let db: PGlite;
const row = async (sql: string) => (await db.query<any>(sql)).rows[0];
const capacity = async (target=org) => row(`SELECT * FROM get_organization_student_capacity('${target}',1000000)`);
const create = async () => (await row(`SELECT create_student_profile_with_capacity('${org}','${student}','Student','','','',NULL,NULL,'') result`)).result;
const active = async () => db.exec(`INSERT INTO organization_billing_agreements VALUES('${org}',${today}-1,NULL)`);
const service = async () => db.exec("SELECT set_config('request.jwt.claim.role','service_role',false); SET ROLE service_role");
const captureFunctions = async () => (await db.query(`SELECT oid,prosrc,proacl,proowner,prosecdef,proconfig,provolatile FROM pg_proc
  WHERE proname IN('get_organization_student_capacity','create_student_profile_with_capacity','enforce_course_insert_limit') ORDER BY proname`)).rows;

beforeAll(async()=>{
  db=new PGlite();
  await db.exec(postpaidAccessFixture);
  await installCanonicalQuotaFunctions(db);
  await db.exec(`REVOKE ALL ON FUNCTION get_organization_student_capacity(uuid,integer) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION get_organization_student_capacity(uuid,integer) TO authenticated,service_role,legacy_capacity_reader;
    REVOKE ALL ON FUNCTION create_student_profile_with_capacity(uuid,uuid,text,text,text,text,uuid,uuid,text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION create_student_profile_with_capacity(uuid,uuid,text,text,text,text,uuid,uuid,text) TO service_role;
    REVOKE ALL ON FUNCTION enforce_course_insert_limit() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION enforce_course_insert_limit() TO authenticated,service_role;
    CREATE TRIGGER enforce_course_insert_limit BEFORE INSERT OR UPDATE OF organization_id,system_key ON courses
    FOR EACH ROW EXECUTE FUNCTION enforce_course_insert_limit();`);
  const before=await captureFunctions();
  await db.exec(migration);
  const after=await captureFunctions();
  expect(after.map(({prosrc,...attributes}:any)=>attributes)).toEqual(before.map(({prosrc,...attributes}:any)=>attributes));
  expect(after.every((f:any,i)=>f.prosrc!==before[i].prosrc)).toBe(true);
},30000);
beforeEach(async()=>{
  await db.exec(`RESET ROLE; TRUNCATE organization_billing_agreements,organization_usage,companies,company_staff,org_staff,profiles,user_roles,courses,organizations;
    INSERT INTO organizations VALUES('${org}','free',NULL,NULL),('${other}','free',NULL,NULL);
    INSERT INTO profiles(user_id,organization_id) VALUES('${owner}','${org}');
    INSERT INTO user_roles VALUES('${owner}','organization');
    INSERT INTO organization_usage VALUES('${org}',${month},10);
    INSERT INTO courses(organization_id,title) SELECT '${org}','Existing' FROM generate_series(1,3);
    SELECT set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub','${owner}',false);`);
});
afterAll(async()=>db?.close());

describe('actual canonical quota functions with postpaid migration',()=>{
  it('keeps a full prepaid free account limited for reads, student admission and course admission',async()=>{
    expect(await capacity()).toMatchObject({max_students:10,current_students:10,can_add:false,limit_source:'plan'});
    await expect(db.exec(`INSERT INTO courses(organization_id) VALUES('${org}')`)).rejects.toThrow('maximum course limit');
    await service();
    expect(await create()).toMatchObject({success:false,code:'STUDENT_LIMIT_EXCEEDED'});
  });
  it('removes both active postpaid admission limits while keeping the free plan and usage counter',async()=>{
    await active();
    await db.exec(`UPDATE organizations SET custom_max_students=0,custom_max_courses=0 WHERE id='${org}'; SET ROLE authenticated`);
    expect(await capacity()).toMatchObject({max_students:-1,current_students:10,can_add:true,is_unlimited:true,remaining_students:-1,subscription_plan:'free',limit_source:'postpaid'});
    await db.exec(`INSERT INTO courses(organization_id) SELECT '${org}' FROM generate_series(1,20)`);
    await service();
    expect(await create()).toMatchObject({success:true,is_existing:false,current_students:11,max_students:-1,limit_source:'postpaid'});
    expect(await create()).toMatchObject({success:true,is_existing:true,current_students:11});
    await db.exec('RESET ROLE');
    expect(await row('SELECT students_added_count FROM organization_usage')).toEqual({students_added_count:11});
    expect(await row(`SELECT subscription_plan FROM organizations WHERE id='${org}'`)).toEqual({subscription_plan:'free'});
    expect(Number((await row('SELECT count(*) n FROM courses')).n)).toBe(23);
  });
  it.each([
    ['future',`${today}+1`,'NULL',false], ['expires today',`${today}-1`,today,false],
    ['starts today',today,'NULL',true], ['expires tomorrow',`${today}-1`,`${today}+1`,true],
  ])('uses Moscow date boundaries: %s',async(_label,start,end,isActive)=>{
    await db.exec(`INSERT INTO organization_billing_agreements VALUES('${org}',${start},${end})`);
    expect((await capacity()).is_unlimited).toBe(isActive);
    if(isActive) await db.exec(`INSERT INTO courses(organization_id) VALUES('${org}')`);
    else await expect(db.exec(`INSERT INTO courses(organization_id) VALUES('${org}')`)).rejects.toThrow('maximum course limit');
    await service();
    expect((await create()).success).toBe(isActive);
  });
  it('keeps canonical tenant read authorization and existing course RLS under unlimited postpayment',async()=>{
    await active();
    await db.exec(`INSERT INTO organization_billing_agreements VALUES('${other}',${today},NULL); SET ROLE authenticated`);
    await expect(capacity(other)).rejects.toThrow('access denied');
    await expect(db.exec(`INSERT INTO courses(organization_id) VALUES('${other}')`)).rejects.toThrow('row-level security');
    await expect(create()).rejects.toThrow('permission denied');
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${staff}',false); SET ROLE authenticated`);
    await expect(capacity()).rejects.toThrow('access denied');
  });
  it('retains legacy company viewer access without giving it student-write rights',async()=>{
    await active();
    await db.exec(`INSERT INTO companies VALUES('${company}',NULL,'${org}'); INSERT INTO company_staff VALUES('${staff}','${company}');
      SELECT set_config('request.jwt.claim.sub','${staff}',false); SET ROLE authenticated`);
    expect(await capacity()).toMatchObject({can_add:true,limit_source:'postpaid'});
    await expect(create()).rejects.toThrow('permission denied');
  });
  it.each([['read',['students.read'],false],['write',['students.write'],false],['expired',['students.read'],true],['unrelated',['courses.write'],false]])
    ('retains staff permission and expiry checks: %s',async(_label,permissions,expired)=>{
      await active();
      const allowed=permissions[0]!=='courses.write'&&!expired;
      await db.exec(`INSERT INTO org_staff VALUES('${staff}','${org}',${expired?"now()-interval '1 second'":'NULL'},ARRAY['${permissions[0]}']);
        SELECT set_config('request.jwt.claim.sub','${staff}',false); SET ROLE authenticated`);
      if(allowed) expect((await capacity()).is_unlimited).toBe(true);
      else await expect(capacity()).rejects.toThrow('access denied');
    });
  it('keeps archived and foreign profile safeguards even with unlimited admission',async()=>{
    await active();
    await db.exec(`INSERT INTO profiles(user_id,organization_id,archived_at) VALUES('${student}','${org}',now())`);
    await service();
    expect(await create()).toMatchObject({success:false,code:'STUDENT_ARCHIVED'});
    await db.exec(`RESET ROLE; UPDATE profiles SET organization_id='${other}',archived_at=NULL WHERE user_id='${student}'`);
    await service();
    expect(await create()).toMatchObject({success:false,code:'PROFILE_IN_OTHER_ORG'});
    await db.exec('RESET ROLE');
    expect((await row('SELECT students_added_count FROM organization_usage')).students_added_count).toBe(10);
  });
  it('does not grant anonymous execution or bypass the service JWT check',async()=>{
    await active(); await db.exec('SET ROLE anon');
    await expect(capacity()).rejects.toThrow('permission denied');
    await db.exec('RESET ROLE'); // Function owner can execute, but still must supply the service claim.
    await expect(create()).rejects.toThrow('service role required');
  });
  it('preserves the trusted system-course quota exemption',async()=>{
    await db.exec(`INSERT INTO courses(organization_id,system_key) VALUES('${org}','welcome')`);
    await expect(db.exec(`INSERT INTO courses(organization_id) VALUES('${org}')`)).rejects.toThrow('maximum course limit');
  });
  it('fails closed on replay without changing data or function definitions',async()=>{
    const functions=await captureFunctions();
    const usage=await row('SELECT * FROM organization_usage');
    await expect(db.exec(migration)).rejects.toThrow('canonical function drift');
    await db.exec('ROLLBACK');
    expect(await captureFunctions()).toEqual(functions);
    expect(await row('SELECT * FROM organization_usage')).toEqual(usage);
  });
  it('rolls back earlier patches if a later canonical function has drifted',async()=>{
    const isolated=new PGlite();
    try {
      await isolated.exec(postpaidAccessFixture); await installCanonicalQuotaFunctions(isolated);
      await isolated.exec(`CREATE OR REPLACE FUNCTION enforce_course_insert_limit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$`);
      const before=(await isolated.query('SELECT prosrc FROM pg_proc WHERE proname=\'get_organization_student_capacity\'')).rows;
      await expect(isolated.exec(migration)).rejects.toThrow('canonical function drift');
      await isolated.exec('ROLLBACK');
      expect((await isolated.query('SELECT prosrc FROM pg_proc WHERE proname=\'get_organization_student_capacity\'')).rows).toEqual(before);
    } finally {await isolated.close();}
  });
});
