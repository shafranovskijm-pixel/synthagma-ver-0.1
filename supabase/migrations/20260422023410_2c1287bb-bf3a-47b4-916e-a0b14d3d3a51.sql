-- 1) Добавляем deleted_at и deleted_by в ключевые таблицы документов
ALTER TABLE public.education_document_records
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

ALTER TABLE public.org_documents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

ALTER TABLE public.company_documents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

ALTER TABLE public.data_subject_requests
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

ALTER TABLE public.incoming_documents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

ALTER TABLE public.document_issuance_log
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

ALTER TABLE public.commercial_proposals
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- 2) Индексы для быстрой фильтрации
CREATE INDEX IF NOT EXISTS idx_edu_docs_deleted_at ON public.education_document_records(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_docs_deleted_at ON public.org_documents(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_docs_deleted_at ON public.company_documents(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_doc_sigs_deleted_at ON public.document_signatures(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pd_req_deleted_at ON public.data_subject_requests(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incoming_deleted_at ON public.incoming_documents(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_iss_log_deleted_at ON public.document_issuance_log(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_deleted_at ON public.commercial_proposals(deleted_at) WHERE deleted_at IS NOT NULL;

-- 3) Функция-обёртка для soft delete (security definer для проверки роли)
CREATE OR REPLACE FUNCTION public.soft_delete_document(
  p_table TEXT,
  p_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_query TEXT;
  v_allowed_tables TEXT[] := ARRAY[
    'education_document_records',
    'org_documents',
    'company_documents',
    'document_signatures',
    'data_subject_requests',
    'incoming_documents',
    'document_issuance_log',
    'commercial_proposals'
  ];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT (p_table = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % not allowed for soft-delete', p_table;
  END IF;

  v_query := format(
    'UPDATE public.%I SET deleted_at = now(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL',
    p_table
  );
  EXECUTE v_query USING v_user, p_id;
  RETURN FOUND;
END;
$$;

-- 4) Функция восстановления
CREATE OR REPLACE FUNCTION public.restore_document(
  p_table TEXT,
  p_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_query TEXT;
  v_allowed_tables TEXT[] := ARRAY[
    'education_document_records',
    'org_documents',
    'company_documents',
    'document_signatures',
    'data_subject_requests',
    'incoming_documents',
    'document_issuance_log',
    'commercial_proposals'
  ];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT (p_table = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % not allowed', p_table;
  END IF;

  v_query := format(
    'UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL WHERE id = $1',
    p_table
  );
  EXECUTE v_query USING p_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_document(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_document(TEXT, UUID) TO authenticated;

-- 5) Очистка корзины старше 30 дней (вызывается из cron при необходимости)
CREATE OR REPLACE FUNCTION public.purge_recycle_bin_30d()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_tmp INTEGER;
BEGIN
  DELETE FROM public.education_document_records WHERE deleted_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;
  DELETE FROM public.org_documents WHERE deleted_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;
  DELETE FROM public.company_documents WHERE deleted_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;
  DELETE FROM public.document_signatures WHERE deleted_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;
  DELETE FROM public.data_subject_requests WHERE deleted_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;
  DELETE FROM public.incoming_documents WHERE deleted_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;
  DELETE FROM public.document_issuance_log WHERE deleted_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;
  DELETE FROM public.commercial_proposals WHERE deleted_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_count := v_count + v_tmp;
  RETURN v_count;
END;
$$;