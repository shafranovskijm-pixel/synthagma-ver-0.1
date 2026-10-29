-- EXPLICIT LOCAL-ONLY SYNTHETIC COUNTER FIXTURE. NOT real Supabase/Cloud history.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$BEGIN
 IF current_database()<>'sintagma_pcf_current_context_lab_20261029'OR current_user<>'postgres'OR session_user<>'postgres'
 OR inet_server_addr()IS DISTINCT FROM'127.0.0.1'::inet OR inet_server_port()<>5432
 OR current_setting('server_version_num')<>'170011'OR current_setting('data_directory')<>'/var/lib/postgresql/data'
 OR current_setting('pcr.lab_authorized',true)IS DISTINCT FROM'source-reviewed-root-run-only'
 OR to_regnamespace('supabase_migrations')IS NOT NULL
 THEN RAISE EXCEPTION 'CFM_LOCAL_ONLY_NEW_PRIVATE_LEDGER_FIXTURE_REQUIRED';END IF;
END;$guard$;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(
 version text PRIMARY KEY CHECK(version~'^LOCAL_ONLY_[0-9]{4}$'),
 name text NOT NULL CHECK(name='LOCAL_ONLY_SYNTHETIC_NOT_CLOUD_HISTORY'),
 local_fixture_marker text NOT NULL CHECK(local_fixture_marker='CFM_NEW_PRIVATE_PG1711_ONLY'));
INSERT INTO supabase_migrations.schema_migrations(version,name,local_fixture_marker)
 SELECT 'LOCAL_ONLY_'||lpad(i::text,4,'0'),'LOCAL_ONLY_SYNTHETIC_NOT_CLOUD_HISTORY','CFM_NEW_PRIVATE_PG1711_ONLY' FROM generate_series(1,653)i;
REVOKE ALL ON SCHEMA supabase_migrations FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE supabase_migrations.schema_migrations FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
