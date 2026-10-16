// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
const migration=readFileSync('supabase/migrations/20261016163000_secure_billing_scheduler.sql','utf8');
async function fixture(headers=true) {
  const db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA vault; CREATE SCHEMA cron; CREATE SCHEMA net;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
    CREATE TABLE vault.secrets(id uuid DEFAULT gen_random_uuid(),name text UNIQUE,secret text,description text);
    CREATE VIEW vault.decrypted_secrets AS SELECT name,secret AS decrypted_secret FROM vault.secrets;
    CREATE FUNCTION vault.create_secret(new_secret text,new_name text,new_description text) RETURNS uuid LANGUAGE plpgsql AS $$
      DECLARE result uuid; BEGIN INSERT INTO vault.secrets(name,secret,description) VALUES(new_name,new_secret,new_description) RETURNING id INTO result; RETURN result; END$$;
    CREATE TABLE cron.job(jobid bigint PRIMARY KEY,jobname text UNIQUE,schedule text,command text,active boolean);
    CREATE FUNCTION cron.alter_job(job_id bigint,command text) RETURNS void LANGUAGE sql AS $$UPDATE cron.job j SET command=$2 WHERE jobid=$1$$;
    CREATE TABLE fixture_http(headers jsonb,timeout_ms integer,url text);
    CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer DEFAULT 1000) RETURNS bigint LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO fixture_http VALUES(headers,timeout_milliseconds,url);RETURN 1;END$$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;`);
  await db.query('INSERT INTO cron.job VALUES(2,$1,$2,$3,true)',['check-subscription-expiry-daily','0 9 * * *',
    `SELECT net.http_post(url:='https://atxwvjxbqjgkbjlhsdch.supabase.co/functions/v1/check-subscription-expiry',headers:='{"Content-Type":"application/json","Authorization":"Bearer ${headers?'eyJ.fixture.signature':'changed'}"}'::jsonb,body:='{}'::jsonb) AS request_id;`]);
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
      await db.exec('RESET ROLE');
      await expect(db.exec(migration)).rejects.toThrow('already exists');await db.exec('ROLLBACK');
      expect((await db.query<any>('SELECT count(*) n FROM cron.job')).rows[0].n).toBe(1);
    } finally {await db.close();}
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
