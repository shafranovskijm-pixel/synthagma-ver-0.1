-- Таблица версий документов организации
CREATE TABLE IF NOT EXISTS public.org_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.org_documents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  file_url text,
  file_path text,
  file_size bigint,
  file_name text,
  change_summary text,
  uploaded_by uuid,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_org_doc_versions_doc ON public.org_document_versions(document_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_org_doc_versions_org ON public.org_document_versions(organization_id);

ALTER TABLE public.org_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view document versions"
ON public.org_document_versions FOR SELECT
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org members insert document versions"
ON public.org_document_versions FOR INSERT
WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org members delete document versions"
ON public.org_document_versions FOR DELETE
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Таблица публичных ссылок на документы
CREATE TABLE IF NOT EXISTS public.org_document_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.org_documents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz,
  password_hash text,
  max_downloads integer,
  download_count integer NOT NULL DEFAULT 0,
  last_accessed_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_doc_share_token ON public.org_document_share_links(token) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_org_doc_share_doc ON public.org_document_share_links(document_id);
CREATE INDEX IF NOT EXISTS idx_org_doc_share_org ON public.org_document_share_links(organization_id);

ALTER TABLE public.org_document_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage share links"
ON public.org_document_share_links FOR ALL
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Публичный доступ к активным ссылкам по токену (для страницы скачивания)
CREATE POLICY "Public read active share links by token"
ON public.org_document_share_links FOR SELECT
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Функция для безопасной валидации токена и инкремента счётчика
CREATE OR REPLACE FUNCTION public.validate_and_track_share_link(_token text)
RETURNS TABLE (
  document_id uuid,
  organization_id uuid,
  is_valid boolean,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link record;
BEGIN
  SELECT * INTO v_link FROM public.org_document_share_links WHERE token = _token LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, false, 'not_found'::text;
    RETURN;
  END IF;
  
  IF NOT v_link.is_active THEN
    RETURN QUERY SELECT v_link.document_id, v_link.organization_id, false, 'inactive'::text;
    RETURN;
  END IF;
  
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN QUERY SELECT v_link.document_id, v_link.organization_id, false, 'expired'::text;
    RETURN;
  END IF;
  
  IF v_link.max_downloads IS NOT NULL AND v_link.download_count >= v_link.max_downloads THEN
    RETURN QUERY SELECT v_link.document_id, v_link.organization_id, false, 'limit_reached'::text;
    RETURN;
  END IF;
  
  UPDATE public.org_document_share_links
  SET download_count = download_count + 1,
      last_accessed_at = now()
  WHERE id = v_link.id;
  
  RETURN QUERY SELECT v_link.document_id, v_link.organization_id, true, 'ok'::text;
END;
$$;