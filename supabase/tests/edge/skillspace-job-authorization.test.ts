// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
const directory=new URL('../../migrations/',import.meta.url);
const read=(name:string)=>readFile(new URL(name,directory),'utf8');
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
let db:PGlite;
let oldForgerySucceeded=false;
let preservedReadPolicy:unknown;
async function actor(user:number|null,role='authenticated') {
  await db.exec(`RESET ROLE; SET LOCAL ROLE ${role}; SELECT set_config('request.jwt.claim.role','${role}',true);
    SELECT set_config('request.jwt.claim.sub','${user===null?'':id(user)}',true);`);
}
async function scalar(query:string,params:unknown[]=[]) { return (await db.query<{value:unknown}>(query,params)).rows[0]?.value; }
async function denied(query:string,params:unknown[]=[],message=/row-level security|administrator|immutable|reconciliation|permission denied/i) {
  await db.exec('SAVEPOINT denial'); await expect(db.query(query,params)).rejects.toThrow(message);
  await db.exec('ROLLBACK TO SAVEPOINT denial; RELEASE SAVEPOINT denial');
}
const insert=(creator:number|null,marker:string|null=null)=>db.query(`INSERT INTO public.skillspace_import_jobs
  (organization_id,batch_id,url,login,password,created_by,authorization_verified_at)
  VALUES($1,$2,'https://fixture.skillspace.ru/course/1','synthetic-login','synthetic-password',$3,$4) RETURNING id,authorization_verified_at`,
  [id(100),id(400),creator===null?null:id(creator),marker]);
const policy=async()=> (await db.query(`SELECT policyname,roles,qual,with_check FROM pg_policies
  WHERE schemaname='public' AND tablename='skillspace_import_jobs' AND cmd='SELECT' ORDER BY policyname`)).rows;

beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.role',true),'') $$;
    CREATE TYPE public.app_role AS ENUM('admin','organization','student');
    CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE public.organizations(id uuid PRIMARY KEY);
    CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
    CREATE TABLE public.profiles(user_id uuid,organization_id uuid);
    CREATE TABLE public.account_deletion_revocations(user_id uuid PRIMARY KEY);
    CREATE FUNCTION public.has_role(_role public.app_role,_user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER
      AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
    CREATE FUNCTION public.current_organization_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER
      AS $$ SELECT organization_id FROM public.profiles WHERE user_id=auth.uid() $$;
    CREATE FUNCTION public.account_deletion_access_allowed() RETURNS boolean LANGUAGE sql SECURITY DEFINER
      AS $$ SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid()) $$;
    CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now();RETURN NEW;END $$;
    -- Encryption itself is outside this authorization test; verify the real
    -- credential trigger still executes using a deterministic synthetic cipher.
    CREATE FUNCTION public.encrypt_password(value text) RETURNS text LANGUAGE sql AS $$ SELECT 'ENC:'||value $$;
  `);
  const original=await read('20260412063855_ce2177f0-1d1d-492b-9964-1ad8c59ce9be.sql');
  await db.exec(original.replace('ALTER PUBLICATION supabase_realtime ADD TABLE public.skillspace_import_jobs;',''));
  await db.exec(`DROP POLICY "Org users can view own import jobs" ON public.skillspace_import_jobs;
    CREATE POLICY account_deletion_no_revoked_access ON public.skillspace_import_jobs AS RESTRICTIVE FOR ALL TO authenticated
      USING(public.account_deletion_access_allowed()) WITH CHECK(public.account_deletion_access_allowed());
    GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.skillspace_import_jobs TO authenticated,anon,service_role;
    INSERT INTO public.organizations VALUES('${id(100)}');
    INSERT INTO auth.users SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,7)n;
    INSERT INTO public.user_roles SELECT id,CASE WHEN right(id::text,1) IN('4','5','6') THEN 'admin'::app_role ELSE 'student'::app_role END FROM auth.users;
    INSERT INTO public.profiles SELECT id,'${id(100)}' FROM auth.users;
    INSERT INTO public.account_deletion_revocations VALUES('${id(5)}');
    INSERT INTO public.skillspace_import_jobs(id,organization_id,batch_id,url,login,password,created_by)
      VALUES('${id(300)}','${id(100)}','${id(400)}','https://fixture.skillspace.ru/course/1','synthetic-login','synthetic-password','${id(4)}');`);
  await db.exec('BEGIN');
  await actor(1);
  await db.query(`INSERT INTO public.skillspace_import_jobs(organization_id,batch_id,url,login,password,created_by)
    VALUES($1,$2,'https://fixture.skillspace.ru/course/2','synthetic','synthetic',$3)`,[id(100),id(400),id(4)]);
  oldForgerySucceeded=true;
  await db.exec('ROLLBACK');
  preservedReadPolicy=await policy();
  const migration=await read('20261016150000_skillspace_job_authorization.sql');
  await db.exec('CREATE POLICY unknown_worker_update ON public.skillspace_import_jobs FOR UPDATE USING(true)');
  await expect(db.exec(migration)).rejects.toThrow('unexpected permissive policies');
  await db.exec('ROLLBACK; DROP POLICY unknown_worker_update ON public.skillspace_import_jobs');
  await db.exec('ALTER POLICY "Admins can view all import jobs" ON public.skillspace_import_jobs USING(true)');
  await expect(db.exec(migration)).rejects.toThrow('admin-only SELECT policy requires review');
  await db.exec(`ROLLBACK; ALTER POLICY "Admins can view all import jobs" ON public.skillspace_import_jobs USING(public.has_role('admin'::app_role,auth.uid()))`);
  const forced=migration.replace("NOTIFY pgrst,'reload schema';",()=>"DO $$ BEGIN RAISE EXCEPTION 'fixture_rollback'; END $$;");
  await expect(db.exec(forced)).rejects.toThrow('fixture_rollback');
  await db.exec('ROLLBACK');
  expect(await scalar(`SELECT count(*)::int value FROM information_schema.columns WHERE table_schema='public' AND table_name='skillspace_import_jobs' AND column_name='authorization_verified_at'`)).toBe(0);
  await db.exec(migration);
},30000);
beforeEach(async()=>{await db.exec('BEGIN');});
afterEach(async()=>{await db.exec('ROLLBACK');});
afterAll(async()=>{await db?.close();});

describe('SkillSpace job authorization migration',()=>{
  it('reproduces old forged creator insertion and preserves admin-only reads, old jobs and credential encryption',async()=>{
    expect(oldForgerySucceeded).toBe(true); expect(await policy()).toEqual(preservedReadPolicy);
    const record=(await db.query('SELECT created_by,authorization_verified_at,login,password FROM public.skillspace_import_jobs WHERE id=$1',[id(300)])).rows[0];
    expect(record).toEqual({created_by:id(4),authorization_verified_at:null,login:'ENC:synthetic-login',password:'ENC:synthetic-password'});
    expect(await scalar(`SELECT count(*)::int value FROM pg_policies WHERE tablename='skillspace_import_jobs' AND cmd IN('UPDATE','DELETE','ALL') AND permissive='PERMISSIVE'`)).toBe(0);
  });
  it.each([1,2,3,5,7])('denies nonadmin/revoked actor %i even with a forged administrator creator and batch',async user=>{
    await actor(user); await db.exec('SAVEPOINT denial');
    await expect(insert(4,'2020-01-01')).rejects.toThrow(/administrator|row-level security/i);
    await db.exec('ROLLBACK TO SAVEPOINT denial; RELEASE SAVEPOINT denial');
    expect((await db.query('SELECT id FROM public.skillspace_import_jobs')).rows).toEqual([]);
    expect((await db.query("UPDATE public.skillspace_import_jobs SET status='done' RETURNING id")).rows).toEqual([]);
    expect((await db.query('DELETE FROM public.skillspace_import_jobs RETURNING id')).rows).toEqual([]);
  });
  it('allows an active admin to create only under its own identity and stamps the server time',async()=>{
    await actor(4); const result=await insert(4,'2020-01-01');
    expect(new Date(String(result.rows[0].authorization_verified_at)).getUTCFullYear()).toBeGreaterThan(2020);
    await denied(`INSERT INTO public.skillspace_import_jobs(organization_id,url,login,password,created_by) VALUES($1,'url','login','password',$2)`,[id(100),id(6)]);
    await denied(`INSERT INTO public.skillspace_import_jobs(organization_id,url,login,password) VALUES($1,'url','login','password')`,[id(100)]);
  });
  it('allows the service worker to create for an active admin and update results without changing provenance',async()=>{
    await actor(null,'service_role'); const result=await insert(4); const jobId=result.rows[0].id;
    expect(result.rows[0].authorization_verified_at).not.toBeNull();
    await db.query("UPDATE public.skillspace_import_jobs SET status='done',result='{}' WHERE id=$1",[jobId]);
    expect(await scalar('SELECT status value FROM public.skillspace_import_jobs WHERE id=$1',[jobId])).toBe('done');
    for(const change of [`created_by='${id(6)}'`,`organization_id='${id(200)}'`,`batch_id='${id(401)}'`,`id='${id(301)}'`]) {
      await denied(`UPDATE public.skillspace_import_jobs SET ${change} WHERE id=$1`,[jobId]);
    }
  });
  it.each([null,1,5])('service insertion still rejects absent/nonadmin/revoked creator %s',async creator=>{
    await actor(null,'service_role'); await db.exec('SAVEPOINT denial');
    await expect(insert(creator)).rejects.toThrow('Active administrator creator required');
    await db.exec('ROLLBACK TO SAVEPOINT denial; RELEASE SAVEPOINT denial');
  });
  it('does not authorize historical jobs through status updates; reconciliation is deliberate and once only',async()=>{
    await actor(null,'service_role');
    await db.query("UPDATE public.skillspace_import_jobs SET status='processing' WHERE id=$1",[id(300)]);
    expect(await scalar('SELECT authorization_verified_at value FROM public.skillspace_import_jobs WHERE id=$1',[id(300)])).toBeNull();
    await db.query('UPDATE public.skillspace_import_jobs SET authorization_verified_at=$1 WHERE id=$2',['2020-01-01',id(300)]);
    expect(new Date(String(await scalar('SELECT authorization_verified_at value FROM public.skillspace_import_jobs WHERE id=$1',[id(300)]))).getUTCFullYear()).toBeGreaterThan(2020);
    await denied('UPDATE public.skillspace_import_jobs SET authorization_verified_at=NULL WHERE id=$1',[id(300)]);
  });
  it('closes anonymous creation and direct trigger execution',async()=>{
    await actor(null,'anon');
    await denied(`INSERT INTO public.skillspace_import_jobs(organization_id,url,login,password,created_by) VALUES($1,'url','login','password',$2)`,[id(100),id(4)]);
    await actor(4); await denied('SELECT public.verify_skillspace_job_authorization()');
  });
});
