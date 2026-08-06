-- ============================================================================
-- ПОДГОТОВЛЕНО, НО НЕ ПРИМЕНЕНО.
-- Устранение 6 критических storage findings (cross-tenant доступ):
--   chat_attachments_unrestricted
--   external_contracts_signed_folder_unrestricted
--   frdo_documents_upload_unrestricted
--   library_program_files_write_unrestricted
--   org_documents_storage_unrestricted
--   signed_documents_storage_broad_read
--
-- Принципы:
--   * Идемпотентность: DROP POLICY IF EXISTS + пересоздание, CREATE OR REPLACE FUNCTION.
--   * service_role не затрагивается (BYPASSRLS) — Edge Functions продолжают работать.
--   * Удаляются ТОЛЬКО перечисленные явно известные широкие legacy policies.
--   * Реальные пути приложения:
--       chat-attachments     {org_id}/{student_user_id}/...
--       frdo-documents       {org_id}/...
--       library-files        library/{org_id}/...
--       program-files        programs/{org_id}/...
--       org-documents        {org_id}/...
--       external-contracts   signed/{signature_id}_{hash}.pdf
--       signed-documents     {org_id}/... либо {auth.uid()}/...
-- ============================================================================

-- Безопасный каст сегмента пути в uuid.
CREATE OR REPLACE FUNCTION public.storage_try_uuid(_value text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF _value IS NULL THEN RETURN NULL; END IF;
  RETURN _value::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.storage_try_uuid(text) IS
  'Безопасный каст сегмента storage-пути в uuid; NULL если сегмент не uuid.';

REVOKE ALL ON FUNCTION public.storage_try_uuid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_try_uuid(text) TO authenticated, service_role;

-- Проверки предпосылок.
DO $$
BEGIN
  IF to_regclass('public.document_signatures') IS NULL THEN
    RAISE EXCEPTION 'public.document_signatures отсутствует — миграция прервана';
  END IF;
  IF to_regprocedure('public.can_access_organization(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'public.can_access_organization(uuid,text) отсутствует — миграция прервана';
  END IF;
  IF to_regprocedure('public.current_organization_id()') IS NULL THEN
    RAISE EXCEPTION 'public.current_organization_id() отсутствует — миграция прервана';
  END IF;
END $$;

-- Авторизация файла signed/{signature_id}_{hash}.pdf по document_signatures.
CREATE OR REPLACE FUNCTION public.can_access_signed_contract_object(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.document_signatures ds
    WHERE ds.id = public.storage_try_uuid(left(regexp_replace(_object_name, '^.*/', ''), 36))
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR ds.sender_user_id = auth.uid()
        OR ds.recipient_user_id = auth.uid()
        OR public.can_access_organization(ds.organization_id, 'documents.read')
      )
  )
$$;

COMMENT ON FUNCTION public.can_access_signed_contract_object(text) IS
  'Права на signed/{signature_id}_{hash}.pdf: admin, отправитель, получатель или сотрудник организации подписи.';

REVOKE ALL ON FUNCTION public.can_access_signed_contract_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_signed_contract_object(text) TO authenticated, service_role;

-- ============================================================================
-- 1. chat-attachments  →  {org_id}/{student_user_id}/...
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can view chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_update" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_delete" ON storage.objects;

CREATE POLICY "chat_attachments_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (
    (
      (storage.foldername(name))[2] = auth.uid()::text
      AND public.current_organization_id() IS NOT NULL
      AND (storage.foldername(name))[1] = public.current_organization_id()::text
    )
    OR public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[1]), 'students.read')
  )
);

CREATE POLICY "chat_attachments_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (
    (
      (storage.foldername(name))[2] = auth.uid()::text
      AND public.current_organization_id() IS NOT NULL
      AND (storage.foldername(name))[1] = public.current_organization_id()::text
    )
    OR public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[1]), 'students.write')
  )
);

CREATE POLICY "chat_attachments_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (
    (
      (storage.foldername(name))[2] = auth.uid()::text
      AND public.current_organization_id() IS NOT NULL
      AND (storage.foldername(name))[1] = public.current_organization_id()::text
    )
    OR public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[1]), 'students.write')
  )
)
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (
    (
      (storage.foldername(name))[2] = auth.uid()::text
      AND public.current_organization_id() IS NOT NULL
      AND (storage.foldername(name))[1] = public.current_organization_id()::text
    )
    OR public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[1]), 'students.write')
  )
);

CREATE POLICY "chat_attachments_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (
    (
      (storage.foldername(name))[2] = auth.uid()::text
      AND public.current_organization_id() IS NOT NULL
      AND (storage.foldername(name))[1] = public.current_organization_id()::text
    )
    OR public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[1]), 'students.write')
  )
);

-- ============================================================================
-- 2. external-contracts  →  signed/{signature_id}_{hash}.pdf
-- ============================================================================
DROP POLICY IF EXISTS "external_contracts_signed_select" ON storage.objects;
DROP POLICY IF EXISTS "external_contracts_signed_insert" ON storage.objects;
DROP POLICY IF EXISTS "external_contracts_signed_update" ON storage.objects;
DROP POLICY IF EXISTS "external_contracts_signed_delete" ON storage.objects;

CREATE POLICY "external_contracts_signed_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'external-contracts'
  AND (storage.foldername(name))[1] = 'signed'
  AND public.can_access_signed_contract_object(name)
);

CREATE POLICY "external_contracts_signed_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'external-contracts'
  AND (storage.foldername(name))[1] = 'signed'
  AND public.can_access_signed_contract_object(name)
);

CREATE POLICY "external_contracts_signed_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'external-contracts'
  AND (storage.foldername(name))[1] = 'signed'
  AND public.can_access_signed_contract_object(name)
)
WITH CHECK (
  bucket_id = 'external-contracts'
  AND (storage.foldername(name))[1] = 'signed'
  AND public.can_access_signed_contract_object(name)
);

CREATE POLICY "external_contracts_signed_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'external-contracts'
  AND (storage.foldername(name))[1] = 'signed'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- ============================================================================
-- 3. frdo-documents  →  {org_id}/...  (INSERT был открыт любому авторизованному)
-- ============================================================================
DROP POLICY IF EXISTS "Org users can upload frdo docs" ON storage.objects;
DROP POLICY IF EXISTS "frdo_documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "frdo_documents_update" ON storage.objects;
DROP POLICY IF EXISTS "frdo_documents_delete" ON storage.objects;

CREATE POLICY "frdo_documents_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'frdo-documents'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[1]), 'documents.write')
);

CREATE POLICY "frdo_documents_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'frdo-documents'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[1]), 'documents.write')
)
WITH CHECK (
  bucket_id = 'frdo-documents'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[1]), 'documents.write')
);

CREATE POLICY "frdo_documents_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'frdo-documents'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[1]), 'documents.write')
);

-- ============================================================================
-- 4a. library-files  →  library/{org_id}/...
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can upload library files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update library files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete library files" ON storage.objects;
DROP POLICY IF EXISTS "library_files_insert" ON storage.objects;
DROP POLICY IF EXISTS "library_files_update" ON storage.objects;
DROP POLICY IF EXISTS "library_files_delete" ON storage.objects;

CREATE POLICY "library_files_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'library-files'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[2]), 'documents.write')
);

CREATE POLICY "library_files_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'library-files'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[2]), 'documents.write')
)
WITH CHECK (
  bucket_id = 'library-files'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[2]), 'documents.write')
);

CREATE POLICY "library_files_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'library-files'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[2]), 'documents.write')
);

-- ============================================================================
-- 4b. program-files  →  programs/{org_id}/...
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can upload program files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update program files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete program files" ON storage.objects;
DROP POLICY IF EXISTS "program_files_insert" ON storage.objects;
DROP POLICY IF EXISTS "program_files_update" ON storage.objects;
DROP POLICY IF EXISTS "program_files_delete" ON storage.objects;

CREATE POLICY "program_files_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'program-files'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[2]), 'documents.write')
);

CREATE POLICY "program_files_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'program-files'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[2]), 'documents.write')
)
WITH CHECK (
  bucket_id = 'program-files'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[2]), 'documents.write')
);

CREATE POLICY "program_files_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'program-files'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[2]), 'documents.write')
);

-- ============================================================================
-- 5. org-documents  →  {org_id}/...
-- ============================================================================
DROP POLICY IF EXISTS "org_documents_select" ON storage.objects;
DROP POLICY IF EXISTS "org_documents_upload" ON storage.objects;
DROP POLICY IF EXISTS "org_documents_update" ON storage.objects;
DROP POLICY IF EXISTS "org_documents_delete" ON storage.objects;
DROP POLICY IF EXISTS "Org users can view org documents" ON storage.objects;
DROP POLICY IF EXISTS "Org users can upload org documents" ON storage.objects;
DROP POLICY IF EXISTS "Org users can delete org documents" ON storage.objects;

CREATE POLICY "org_documents_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'org-documents'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[1]), 'documents.read')
);

CREATE POLICY "org_documents_upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'org-documents'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[1]), 'documents.write')
);

CREATE POLICY "org_documents_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'org-documents'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[1]), 'documents.write')
)
WITH CHECK (
  bucket_id = 'org-documents'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[1]), 'documents.write')
);

CREATE POLICY "org_documents_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'org-documents'
  AND public.can_access_organization(public.storage_try_uuid((storage.foldername(name))[1]), 'documents.write')
);

-- ============================================================================
-- 6. signed-documents  →  admin | current_organization_id | auth.uid()
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can read signed-documents in their org" ON storage.objects;
DROP POLICY IF EXISTS "signed_docs_select_own_org" ON storage.objects;
DROP POLICY IF EXISTS "signed_docs_insert_org" ON storage.objects;
DROP POLICY IF EXISTS "signed_documents_select" ON storage.objects;
DROP POLICY IF EXISTS "signed_documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "signed_documents_update" ON storage.objects;
DROP POLICY IF EXISTS "signed_documents_delete" ON storage.objects;

CREATE POLICY "signed_documents_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'signed-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR (public.current_organization_id() IS NOT NULL
        AND (storage.foldername(name))[1] = public.current_organization_id()::text)
  )
);

CREATE POLICY "signed_documents_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'signed-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR (public.current_organization_id() IS NOT NULL
        AND (storage.foldername(name))[1] = public.current_organization_id()::text)
  )
);

CREATE POLICY "signed_documents_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'signed-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR (public.current_organization_id() IS NOT NULL
        AND (storage.foldername(name))[1] = public.current_organization_id()::text)
  )
)
WITH CHECK (
  bucket_id = 'signed-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR (public.current_organization_id() IS NOT NULL
        AND (storage.foldername(name))[1] = public.current_organization_id()::text)
  )
);

CREATE POLICY "signed_documents_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'signed-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (public.current_organization_id() IS NOT NULL
        AND (storage.foldername(name))[1] = public.current_organization_id()::text)
  )
);

-- Существующие tenant-scoped ALL-policies по signed-documents (admin / own org)
-- сохраняются: они не входят в перечень находок.
