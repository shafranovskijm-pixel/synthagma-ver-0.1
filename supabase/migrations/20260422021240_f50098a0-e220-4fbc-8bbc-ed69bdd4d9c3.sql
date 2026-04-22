-- 1. Trigger: auto-add to document_issuance_log when education document is created
CREATE OR REPLACE FUNCTION public.auto_log_document_issuance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_doc_name text;
BEGIN
  -- Try to resolve user_id via enrollment
  IF NEW.enrollment_id IS NOT NULL THEN
    SELECT e.user_id INTO v_user_id FROM enrollments e WHERE e.id = NEW.enrollment_id LIMIT 1;
  END IF;

  v_doc_name := CASE NEW.document_type
    WHEN 'certificate' THEN 'Удостоверение'
    WHEN 'diploma' THEN 'Диплом'
    WHEN 'qualification' THEN 'Свидетельство'
    ELSE 'Документ'
  END || ' № ' || COALESCE(NEW.document_number, NEW.reg_number);

  INSERT INTO public.document_issuance_log (
    organization_id, enrollment_id, user_id, user_name,
    document_type, document_name, reg_number,
    issued_at, send_method
  ) VALUES (
    NEW.organization_id, NEW.enrollment_id,
    COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    NEW.full_name,
    NEW.document_type, v_doc_name, NEW.reg_number,
    COALESCE(NEW.issue_date::timestamptz, now()),
    NEW.delivery_method
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_log_document_issuance ON public.education_document_records;
CREATE TRIGGER trg_auto_log_document_issuance
AFTER INSERT ON public.education_document_records
FOR EACH ROW EXECUTE FUNCTION public.auto_log_document_issuance();

-- 2. Template versions table
CREATE TABLE IF NOT EXISTS public.org_contract_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.org_contract_templates(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version int NOT NULL,
  name text NOT NULL,
  body_html text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  change_summary text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_octv_template ON public.org_contract_template_versions (template_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_octv_org ON public.org_contract_template_versions (organization_id);

ALTER TABLE public.org_contract_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage own template versions"
ON public.org_contract_template_versions
FOR ALL TO authenticated
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

-- 3. Trigger to snapshot template on each update
CREATE OR REPLACE FUNCTION public.snapshot_contract_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_user_name text;
  v_next_version int;
BEGIN
  v_user := auth.uid();
  IF v_user IS NOT NULL THEN
    SELECT COALESCE(full_name, email) INTO v_user_name FROM profiles WHERE user_id = v_user LIMIT 1;
  END IF;

  -- Skip snapshot when only updated_at/version changed
  IF TG_OP = 'UPDATE' AND OLD.body_html = NEW.body_html AND OLD.name = NEW.name THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
  FROM org_contract_template_versions
  WHERE template_id = NEW.id;

  -- Bump version on the template itself
  NEW.version := v_next_version;

  INSERT INTO org_contract_template_versions (
    template_id, organization_id, version, name, body_html, variables,
    created_by, created_by_name
  ) VALUES (
    NEW.id, NEW.organization_id, v_next_version, NEW.name, NEW.body_html, NEW.variables,
    v_user, v_user_name
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_contract_template ON public.org_contract_templates;
CREATE TRIGGER trg_snapshot_contract_template
BEFORE INSERT OR UPDATE ON public.org_contract_templates
FOR EACH ROW EXECUTE FUNCTION public.snapshot_contract_template_version();

-- 4. Link signed contract to specific template version
ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS template_version_id uuid REFERENCES public.org_contract_template_versions(id) ON DELETE SET NULL;

-- 5. Incoming documents from counterparties
CREATE TABLE IF NOT EXISTS public.incoming_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'contract' CHECK (doc_type IN ('contract','act','invoice','other')),
  title text NOT NULL,
  counterparty_name text,
  counterparty_inn text,
  doc_number text,
  doc_date date,
  file_url text NOT NULL,
  file_path text,
  file_size bigint,
  notes text,
  related_signature_id uuid REFERENCES public.document_signatures(id) ON DELETE SET NULL,
  related_billing_doc_id uuid REFERENCES public.org_billing_documents(id) ON DELETE SET NULL,
  related_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incoming_docs_org ON public.incoming_documents (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incoming_docs_inn ON public.incoming_documents (counterparty_inn);
CREATE INDEX IF NOT EXISTS idx_incoming_docs_signature ON public.incoming_documents (related_signature_id);

ALTER TABLE public.incoming_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage own incoming documents"
ON public.incoming_documents
FOR ALL TO authenticated
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE TRIGGER trg_incoming_docs_updated_at
BEFORE UPDATE ON public.incoming_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Storage bucket for incoming documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('incoming-documents', 'incoming-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Org members read own incoming docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'incoming-documents'
  AND (
    has_role('admin'::app_role, auth.uid())
    OR (storage.foldername(name))[1] = current_organization_id()::text
  )
);

CREATE POLICY "Org members upload incoming docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'incoming-documents'
  AND (
    has_role('admin'::app_role, auth.uid())
    OR (storage.foldername(name))[1] = current_organization_id()::text
  )
);

CREATE POLICY "Org members delete own incoming docs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'incoming-documents'
  AND (
    has_role('admin'::app_role, auth.uid())
    OR (storage.foldername(name))[1] = current_organization_id()::text
  )
);