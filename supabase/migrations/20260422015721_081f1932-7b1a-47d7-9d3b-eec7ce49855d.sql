-- 1. org_documents: сроки и статус
ALTER TABLE public.org_documents
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS expires_at date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS responsible_person text,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_documents_status_check') THEN
    ALTER TABLE public.org_documents
      ADD CONSTRAINT org_documents_status_check CHECK (status IN ('active','archived','expired'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_org_documents_expires_at
  ON public.org_documents (organization_id, expires_at)
  WHERE expires_at IS NOT NULL;

-- 2. Серверная нумерация
CREATE TABLE IF NOT EXISTS public.document_number_sequences (
  organization_id uuid NOT NULL,
  doc_type text NOT NULL,
  year int NOT NULL,
  last_number int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, doc_type, year)
);

ALTER TABLE public.document_number_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_seq" ON public.document_number_sequences
  FOR ALL USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.next_reg_number(
  p_org uuid,
  p_doc_type text,
  p_year int DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int;
  v_next int;
  v_lock_key bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM now())::int);

  v_lock_key := abs(hashtextextended(p_org::text || ':' || p_doc_type || ':' || v_year::text, 0));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
  VALUES (p_org, p_doc_type, v_year, 1)
  ON CONFLICT (organization_id, doc_type, year)
  DO UPDATE SET last_number = document_number_sequences.last_number + 1,
                updated_at = now()
  RETURNING last_number INTO v_next;

  RETURN v_next;
END;
$$;

-- 3. Версионирование шаблонов
ALTER TABLE public.org_contract_templates
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 4. Подписанты организации
CREATE TABLE IF NOT EXISTS public.org_signatories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  position text,
  basis text,
  valid_from date,
  valid_to date,
  is_default boolean NOT NULL DEFAULT false,
  signature_url text,
  stamp_url text,
  doc_types text[] DEFAULT ARRAY[]::text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.org_signatories ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_org_signatories_org ON public.org_signatories(organization_id);

CREATE POLICY "org_signatories_select_own_org" ON public.org_signatories
  FOR SELECT TO authenticated
  USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "org_signatories_insert_own_org" ON public.org_signatories
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "org_signatories_update_own_org" ON public.org_signatories
  FOR UPDATE TO authenticated
  USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "org_signatories_delete_own_org" ON public.org_signatories
  FOR DELETE TO authenticated
  USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE TRIGGER trg_org_signatories_updated_at
  BEFORE UPDATE ON public.org_signatories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. student_consents под 152-ФЗ
ALTER TABLE public.student_consents
  ADD COLUMN IF NOT EXISTS policy_version text,
  ADD COLUMN IF NOT EXISTS policy_url text,
  ADD COLUMN IF NOT EXISTS purposes text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_reason text;

-- 6. data_subject_requests (152-ФЗ ст. 14, 21)
CREATE TABLE IF NOT EXISTS public.data_subject_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('access','deletion','withdrawal','correction')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','resolved','rejected')),
  description text,
  response text,
  contact_email text,
  attachment_urls text[],
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

CREATE OR REPLACE FUNCTION public.set_dsr_due_date()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.due_date IS NULL THEN
    NEW.due_date := (NEW.created_at + interval '30 days')::date;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dsr_due_date
  BEFORE INSERT ON public.data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_dsr_due_date();

CREATE TRIGGER trg_dsr_updated_at
  BEFORE UPDATE ON public.data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dsr_org ON public.data_subject_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_dsr_user ON public.data_subject_requests(user_id);

CREATE POLICY "dsr_select_own" ON public.data_subject_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR organization_id = current_organization_id()
    OR has_role('admin'::app_role, auth.uid())
  );

CREATE POLICY "dsr_insert_own" ON public.data_subject_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "dsr_update_org_or_admin" ON public.data_subject_requests
  FOR UPDATE TO authenticated
  USING (
    organization_id = current_organization_id()
    OR has_role('admin'::app_role, auth.uid())
  );

-- 7. Bucket для подписанных PDF и сертификатов подписи
INSERT INTO storage.buckets (id, name, public)
VALUES ('signed-documents', 'signed-documents', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'signed_docs_select_own_org'
  ) THEN
    CREATE POLICY "signed_docs_select_own_org" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'signed-documents'
        AND (
          has_role('admin'::app_role, auth.uid())
          OR (storage.foldername(name))[1] = current_organization_id()::text
          OR (storage.foldername(name))[1] = auth.uid()::text
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'signed_docs_insert_org'
  ) THEN
    CREATE POLICY "signed_docs_insert_org" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'signed-documents'
        AND (
          has_role('admin'::app_role, auth.uid())
          OR (storage.foldername(name))[1] = current_organization_id()::text
        )
      );
  END IF;
END $$;