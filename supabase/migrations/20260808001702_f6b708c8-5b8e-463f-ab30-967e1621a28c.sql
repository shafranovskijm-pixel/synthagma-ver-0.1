-- Keep issuance callable only from authenticated application sessions and service jobs.
REVOKE EXECUTE ON FUNCTION public.issue_education_document_batch(uuid, uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.issue_education_document_batch(uuid, uuid, uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.issue_education_document_batch(uuid, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_education_document_batch(uuid, uuid, uuid, jsonb) TO service_role;