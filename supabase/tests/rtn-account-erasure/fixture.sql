-- ISOLATED LAB ONLY: empty shape adapters for unrelated legacy erasure domains.
-- The actual captured erase/snapshot/count function bodies remain unchanged.
-- No production account, credential, storage file or erasure request is used.
CREATE TABLE public.account_deletion_jobs(id uuid PRIMARY KEY,user_id uuid NOT NULL,receipt_hash text NOT NULL,state text NOT NULL,consent_version text,files jsonb NOT NULL DEFAULT '[]',snapshot jsonb NOT NULL DEFAULT '{}',data_erased boolean NOT NULL DEFAULT false);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS owner uuid,ADD COLUMN IF NOT EXISTS owner_id text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0;
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.organization_offer_acceptances ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id text,ADD COLUMN IF NOT EXISTS entity_type text,ADD COLUMN IF NOT EXISTS user_name text,ADD COLUMN IF NOT EXISTS ip_address text,ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.role_audit_log ADD COLUMN IF NOT EXISTS performed_by_name text,ADD COLUMN IF NOT EXISTS details jsonb;
ALTER TABLE public.student_deletion_log ADD COLUMN IF NOT EXISTS deleted_by_name text,ADD COLUMN IF NOT EXISTS deleted_by_email text;
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE public.document_signatures ADD COLUMN IF NOT EXISTS signed_at timestamptz,ADD COLUMN IF NOT EXISTS sender_signed_at timestamptz,ADD COLUMN IF NOT EXISTS status text,ADD COLUMN IF NOT EXISTS pep_agreement_id uuid;
ALTER TABLE public.org_contracts ADD COLUMN IF NOT EXISTS approved_at timestamptz,ADD COLUMN IF NOT EXISTS signed_at timestamptz,ADD COLUMN IF NOT EXISTS status text,ADD COLUMN IF NOT EXISTS students jsonb;
ALTER TABLE public.group_documents ADD COLUMN IF NOT EXISTS variables jsonb,ADD COLUMN IF NOT EXISTS variables_snapshot jsonb,ADD COLUMN IF NOT EXISTS file_path text,ADD COLUMN IF NOT EXISTS doc_status text;
ALTER TABLE public.education_document_records ADD COLUMN IF NOT EXISTS enrollment_id uuid;
ALTER TABLE public.student_documents ADD COLUMN IF NOT EXISTS enrollment_id uuid;
ALTER TABLE public.homework_submissions ADD COLUMN IF NOT EXISTS course_id uuid;
ALTER TABLE public.lesson_progress ADD COLUMN IF NOT EXISTS lesson_id uuid;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS course_id uuid;
ALTER TABLE public.uc_admission_cases ADD COLUMN IF NOT EXISTS reviews jsonb,ADD COLUMN IF NOT EXISTS decision jsonb,ADD COLUMN IF NOT EXISTS tasks jsonb;
ALTER TABLE public.uc_admission_cases ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.uc_group_education_states ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.uc_identification_write_contexts ADD COLUMN IF NOT EXISTS backend_pid integer,ADD COLUMN IF NOT EXISTS transaction_id bigint,ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.uc_scoped_journal_records ADD COLUMN IF NOT EXISTS participant_ids uuid[];
ALTER TABLE public.uc_scoped_journal_history ADD COLUMN IF NOT EXISTS participant_ids uuid[];
ALTER TABLE public.uc_scoped_journal_requests ADD COLUMN IF NOT EXISTS participant_ids uuid[];
ALTER TABLE public.uc_scoped_journal_exports ADD COLUMN IF NOT EXISTS participant_ids uuid[];
CREATE FUNCTION public.is_org_owner(p_user uuid,p_org uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.user_id WHERE p.user_id=p_user AND p.organization_id=p_org AND r.role='organization')$$;
-- These old-domain adapters are intentionally empty. This suite proves the RTN
-- integration/order/ACLs, not correctness of pre-existing UC erasure domains.
CREATE FUNCTION public.uc_self_examination_retained(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
CREATE FUNCTION public.uc_self_examination_personal_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{}'::jsonb$$;
CREATE FUNCTION public.uc_education_saved_output_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{"unissued":0,"issued":0}'::jsonb$$;
