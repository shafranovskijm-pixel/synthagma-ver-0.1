// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
const migration=readFileSync('supabase/migrations/20261016163000_secure_billing_scheduler.sql','utf8');
async function fixture(headers=true) {
  const db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE ROLE fixture_release NOSUPERUSER; CREATE ROLE fixture_extension_owner NOSUPERUSER;
    CREATE SCHEMA auth; CREATE SCHEMA vault; CREATE SCHEMA cron; CREATE SCHEMA net;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
    CREATE TABLE vault.secrets(id uuid DEFAULT gen_random_uuid(),name text UNIQUE,secret text,description text);
    CREATE VIEW vault.decrypted_secrets AS SELECT name,secret AS decrypted_secret FROM vault.secrets;
    CREATE FUNCTION vault.create_secret(new_secret text,new_name text DEFAULT NULL,new_description text DEFAULT '',new_key_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
      DECLARE result uuid; BEGIN INSERT INTO vault.secrets(name,secret,description) VALUES(new_name,new_secret,new_description) RETURNING id INTO result; RETURN result; END$$;
    CREATE TABLE cron.job(jobid bigint PRIMARY KEY,jobname text UNIQUE,schedule text,command text,active boolean,username text DEFAULT 'fixture_release',database text DEFAULT current_database());
    -- A definer stub models the C extension's internal owner switch. The actual
    -- hosted API is LANGUAGE c, not a SQL SECURITY DEFINER function.
    CREATE FUNCTION cron.alter_job(job_id bigint,schedule text DEFAULT NULL,command text DEFAULT NULL,database text DEFAULT NULL,username text DEFAULT NULL,active boolean DEFAULT NULL)
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
      BEGIN
        IF schedule IS NULL AND command IS NULL AND database IS NULL AND username IS NULL AND active IS NULL THEN RAISE EXCEPTION 'no updates specified'; END IF;
        UPDATE cron.job j SET command=coalesce($3,j.command),active=coalesce($6,j.active),schedule=coalesce($2,j.schedule),database=coalesce($4,j.database),username=coalesce($5,j.username)
          WHERE j.jobid=$1 AND j.username=coalesce(nullif(current_setting('role'),'none'),session_user);
        IF NOT FOUND THEN RAISE EXCEPTION 'Job does not exist or you do not own it'; END IF;
      END$$;
    CREATE TABLE fixture_http(headers jsonb,timeout_ms integer,url text);
    CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer DEFAULT 1000) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
      BEGIN INSERT INTO fixture_http VALUES(headers,timeout_milliseconds,url);RETURN 1;END$$;
    ALTER TABLE cron.job OWNER TO fixture_extension_owner;
    ALTER TABLE vault.secrets OWNER TO fixture_extension_owner;
    ALTER VIEW vault.decrypted_secrets OWNER TO fixture_extension_owner;
    ALTER FUNCTION cron.alter_job(bigint,text,text,text,text,boolean) OWNER TO fixture_extension_owner;
    ALTER FUNCTION vault.create_secret(text,text,text,uuid) OWNER TO fixture_extension_owner;
    GRANT USAGE ON SCHEMA cron,vault TO fixture_extension_owner,fixture_release;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role,fixture_release;
    GRANT CREATE ON SCHEMA public TO fixture_release;
    GRANT SELECT ON cron.job,vault.secrets,vault.decrypted_secrets,fixture_http TO fixture_release;
    GRANT DELETE ON vault.secrets TO fixture_release;
    GRANT USAGE ON SCHEMA net TO fixture_release;
    REVOKE ALL ON FUNCTION cron.alter_job(bigint,text,text,text,text,boolean),vault.create_secret(text,text,text,uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION cron.alter_job(bigint,text,text,text,text,boolean),vault.create_secret(text,text,text,uuid) TO fixture_release;`);
  await db.query('INSERT INTO cron.job(jobid,jobname,schedule,command,active) VALUES(2,$1,$2,$3,true)',['check-subscription-expiry-daily','0 9 * * *',
    `SELECT net.http_post(url:='https://atxwvjxbqjgkbjlhsdch.supabase.co/functions/v1/check-subscription-expiry',headers:='{"Content-Type":"application/json","Authorization":"Bearer ${headers?'eyJ.fixture.signature':'changed'}"}'::jsonb,body:='{}'::jsonb) AS request_id;`]);
  await db.exec('SET ROLE fixture_release');
  return db;
}
describe('actual secure billing scheduler migration',()=>{
  it('keeps one daily job, sends the Vault secret at runtime and protects verification',async()=>{
    const db=await fixture();
    try {
      await db.exec(migration);
      const job=(await db.query<any>('SELECT * FROM cron.job')).rows[0];
      expect(job).toMatchObject({jobname:'check-subscription-expiry-daily',schedule:'0 9 * * *',active:true});
      const secret=(await db.query<any>('SELECT secret FROM vault.secrets')).rows[0].secret;
      expect(secret).toHaveLength(64);expect(job.command).not.toContain(secret);
      await db.exec(job.command);
      const request=(await db.query<any>('SELECT * FROM fixture_http')).rows[0];
      expect(request.headers['x-billing-cron-secret']).toBe(secret);
      expect(request.headers.Authorization).toBe('Bearer eyJ.fixture.signature');expect(request.timeout_ms).toBe(10000);
      await db.exec("SELECT set_config('request.jwt.claim.role','service_role',false); SET ROLE service_role");
      expect((await db.query<any>('SELECT verify_billing_cron_secret($1) ok',[secret])).rows[0].ok).toBe(true);
      expect((await db.query<any>('SELECT verify_billing_cron_secret($1) ok',['a'.repeat(64)])).rows[0].ok).toBe(false);
      await db.exec('RESET ROLE; SET ROLE authenticated');
      await expect(db.query('SELECT verify_billing_cron_secret($1)',[secret])).rejects.toThrow('permission denied');
      await db.exec('RESET ROLE; SET ROLE fixture_release');
      await expect(db.exec(migration)).rejects.toThrow('already exists');await db.exec('ROLLBACK');
      expect((await db.query<any>('SELECT count(*) n FROM cron.job')).rows[0].n).toBe(1);
    } finally {await db.close();}
  },30000);
  it('uses extension APIs under a non-superuser with hosted table permissions',async()=>{
    const db=await fixture();
    try {
      expect((await db.query<any>("SELECT has_table_privilege(current_user,'cron.job','UPDATE') cron_update,has_table_privilege(current_user,'vault.secrets','INSERT') vault_insert")).rows[0]).toEqual({cron_update:false,vault_insert:false});
      await expect(db.exec('UPDATE cron.job SET active=false')).rejects.toThrow('permission denied');
      await expect(db.exec('BEGIN; LOCK TABLE cron.job IN SHARE ROW EXCLUSIVE MODE')).rejects.toThrow('permission denied');
      await db.exec('ROLLBACK');
      await db.exec(migration);
      expect((await db.query<any>('SELECT count(*) n FROM vault.secrets')).rows[0].n).toBe(1);
      expect((await db.query<any>('SELECT active FROM cron.job')).rows[0].active).toBe(true);
    }finally{await db.close();}
  },30000);
  it('rejects read-committed wrappers before any Vault or scheduler mutation',async()=>{
    const db=await fixture();
    try {
      await expect(db.exec(migration.replace('BEGIN ISOLATION LEVEL REPEATABLE READ;','BEGIN;'))).rejects.toThrow('repeatable-read release transaction');
      await db.exec('ROLLBACK');
      expect((await db.query<any>('SELECT count(*) n FROM vault.secrets')).rows[0].n).toBe(0);
    }finally{await db.close();}
  },30000);
  it('fails before mutation when the supported API grant or job ownership is absent',async()=>{
    for(const absent of ['api','owner']) {
      const db=await fixture();
      try {
        await db.exec('RESET ROLE');
        await db.exec(absent==='api' ? 'REVOKE EXECUTE ON FUNCTION cron.alter_job(bigint,text,text,text,text,boolean) FROM fixture_release' : "UPDATE cron.job SET username='another_owner'");
        await db.exec('SET ROLE fixture_release');
        await expect(db.exec(migration)).rejects.toThrow(absent==='api'?'API execution is not permitted':'belong to the release role');
        await db.exec('ROLLBACK');
        expect((await db.query<any>('SELECT count(*) n FROM vault.secrets')).rows[0].n).toBe(0);
      }finally{await db.close();}
    }
  },30000);
  it('rolls back the secret and definitions if the existing job has drifted',async()=>{
    const db=await fixture(false);
    try {
      await expect(db.exec(migration)).rejects.toThrow('Unexpected billing scheduler headers');await db.exec('ROLLBACK');
      expect((await db.query<any>('SELECT count(*) n FROM vault.secrets')).rows[0].n).toBe(0);
      expect((await db.query<any>("SELECT to_regprocedure('public.verify_billing_cron_secret(text)') fn")).rows[0].fn).toBeNull();
    }finally{await db.close();}
  },30000);
});
