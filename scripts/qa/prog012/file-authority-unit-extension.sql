-- LAB ONLY. Append after core48 on its exact disposable PG17.11 service.
-- No existing helper is replaced and no production/Auth-provider parity is claimed.
\set ON_ERROR_STOP on
DO $gate$ BEGIN
 IF current_database()<>'sintagma_pcr_v4_r2_lab_20261028' OR host(inet_server_addr())IS DISTINCT FROM '127.0.0.1'
 OR inet_server_port()<>5432 OR current_setting('server_version_num')<>'170011'
 OR lower(current_setting('data_directory'))<>lower('/var/lib/postgresql/data')
 OR current_setting('pcr.lab_authorized',true)IS DISTINCT FROM 'source-reviewed-root-run-only'
 THEN RAISE EXCEPTION 'PCF_EXACT_EXISTING_CI_UNIT_REQUIRED';END IF;
 IF to_regclass('public.platform_course_publication_review_events')IS NULL
 OR to_regclass('public.qa_retained_results')IS NULL OR to_regclass('storage.objects')IS NOT NULL
 THEN RAISE EXCEPTION 'PCF_CORE48_THEN_FRESH_FILE_STAGE_REQUIRED';END IF;
END;$gate$;
BEGIN;
-- Relevant typed columns are additive to the already accepted minimal unit;
-- they do not claim the entire UC/storage production schema or RLS policies.
ALTER TABLE public.courses ADD COLUMN is_published boolean DEFAULT false;
ALTER TABLE public.library_documents ADD COLUMN archived_at timestamptz,ADD COLUMN file_size bigint;
ALTER TABLE public.course_documents ADD COLUMN visible_to_students boolean NOT NULL DEFAULT true,ADD COLUMN allow_download boolean NOT NULL DEFAULT true;
ALTER TABLE public.lesson_attachments ADD COLUMN file_size bigint;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean NOT NULL DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),last_accessed_at timestamptz DEFAULT now(),
 metadata jsonb,path_tokens text[],version text,owner_id text,user_metadata jsonb,archived_at timestamptz,
 is_delete_marker boolean NOT NULL DEFAULT false,is_versioned boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");
CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");
CREATE UNIQUE INDEX idx_objects_current_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (archived_at IS NULL);
CREATE INDEX idx_objects_delete_markers ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE is_delete_marker;
CREATE UNIQUE INDEX idx_objects_null_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (NOT is_versioned);
CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);
CREATE UNIQUE INDEX objects_bucket_id_name_version_key ON storage.objects USING btree (bucket_id, name COLLATE "C", version) NULLS NOT DISTINCT;
CREATE TABLE public.org_documents(id uuid PRIMARY KEY,organization_id uuid NOT NULL,deleted_at timestamptz);
CREATE TABLE public.org_document_versions(id uuid PRIMARY KEY,document_id uuid NOT NULL REFERENCES public.org_documents(id),organization_id uuid NOT NULL,
 file_path text,storage_object_id uuid,file_size bigint,created_at timestamptz DEFAULT now());
REVOKE ALL ON storage.objects,storage.buckets,public.org_documents,public.org_document_versions FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
