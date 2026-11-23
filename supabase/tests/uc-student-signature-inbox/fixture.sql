-- Synthetic authorization adapters ONLY. Fresh isolated PostgreSQL/PGlite database.
-- This harness runs the NEW read RPC; it does not certify installed production authority helper bodies.
CREATE SCHEMA auth;
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')THEN CREATE ROLE anon;END IF;
IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')THEN CREATE ROLE authenticated;END IF;
IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')THEN CREATE ROLE service_role;END IF;END$$;
CREATE FUNCTION auth.uid()RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.inbox.actor',true),'')::uuid$$;
CREATE FUNCTION auth.role()RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('test.inbox.role',true)$$;
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE public.document_signatures(id uuid PRIMARY KEY,organization_id uuid,recipient_user_id uuid,
document_title text,document_type text,status text,sender_name text,expires_at timestamptz,signature_token text,
created_at timestamptz,signed_at timestamptz,viewed_at timestamptz,signed_document_path text,deleted_at timestamptz,
hidden_for_recipient boolean,current_revision_id uuid,document_html text);
CREATE TABLE public.signature_revisions(id uuid PRIMARY KEY,signature_id uuid,document_html text);
CREATE TABLE public.uc_signature_assurance_bindings(id uuid PRIMARY KEY,organization_id uuid,signature_id uuid,party_role text,revision integer,
document_snapshot_id uuid,policy_version_id uuid,policy_sha256 text,recipient_user_id uuid);
CREATE TABLE public.uc_signature_assurance_document_snapshots(id uuid PRIMARY KEY,organization_id uuid,signature_id uuid,party_role text,
document_revision_id uuid,html_sha256 text,recipient_user_id uuid);
CREATE TABLE public.uc_signature_assurance_events(id uuid PRIMARY KEY,organization_id uuid,signature_id uuid,stream_kind text,party_role text,
revision integer,kind text,binding_id uuid,document_snapshot_id uuid,policy_version_id uuid,actor_user_id uuid,payload jsonb,server_at timestamptz);
CREATE FUNCTION public.account_deletion_access_allowed()RETURNS boolean LANGUAGE sql STABLE AS $$SELECT coalesce(current_setting('test.inbox.active',true),'true')='true'$$;
CREATE FUNCTION public.uc_signature_actor_allowed(p_signature uuid,p_write boolean,p_recipient boolean)RETURNS boolean LANGUAGE sql STABLE AS $$
SELECT public.account_deletion_access_allowed()AND p_recipient AND EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature AND s.recipient_user_id=auth.uid()AND s.deleted_at IS NULL)$$;
CREATE FUNCTION public.inbox_test_assert(ok boolean,label text)RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'INBOX_ASSERT:%',label;END IF;END$$;
INSERT INTO public.profiles VALUES('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');
SELECT set_config('test.inbox.actor','00000000-0000-4000-8000-000000000001',false),set_config('test.inbox.role','authenticated',false),set_config('test.inbox.active','true',false);
