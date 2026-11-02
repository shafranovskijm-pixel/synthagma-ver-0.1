-- TEST MODEL ONLY: this fake Vault stores generated lab-only bytes in plaintext.
-- It is not used in production, is not a real Vault encryption acceptance, and
-- never contains existing user keys, OAuth secrets or application content.
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA vault;
CREATE TABLE vault.secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text UNIQUE,secret text,description text);
CREATE VIEW vault.decrypted_secrets AS SELECT id,name,secret AS decrypted_secret FROM vault.secrets;
CREATE FUNCTION vault.create_secret(new_secret text,new_name text DEFAULT NULL,new_description text DEFAULT NULL,new_key_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN INSERT INTO vault.secrets(name,secret,description) VALUES(new_name,new_secret,new_description) RETURNING id INTO v; RETURN v; END; $$;
CREATE SCHEMA net;
CREATE TABLE net.http_request_queue(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,url text,body jsonb,params jsonb,headers jsonb,timeout_milliseconds integer);
-- Deliberately model the observed broad queue ACL. Candidate does not alter it.
GRANT USAGE ON SCHEMA net TO PUBLIC;
GRANT ALL ON net.http_request_queue TO PUBLIC;
CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}'::jsonb,params jsonb DEFAULT '{}'::jsonb,
 headers jsonb DEFAULT '{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds integer DEFAULT 5000)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
 IF current_setting('support_events_lab.fail_net',true)='1' THEN RAISE EXCEPTION 'synthetic queue failure'; END IF;
 INSERT INTO net.http_request_queue(url,body,params,headers,timeout_milliseconds) VALUES(url,body,params,headers,timeout_milliseconds) RETURNING id INTO v;
 RETURN v;
END; $$;
CREATE SCHEMA cron;
CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,jobname text UNIQUE,schedule text,command text);
CREATE FUNCTION cron.schedule(job_name text,schedule text,command text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN INSERT INTO cron.job(jobname,schedule,command) VALUES(job_name,schedule,command) RETURNING jobid INTO v; RETURN v; END; $$;
