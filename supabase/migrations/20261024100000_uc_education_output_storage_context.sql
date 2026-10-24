-- Narrow UC019 output Storage final-write context compatibility.
-- Only the existing exact prepared output guard changes; no row, role, policy,
-- byte/MIME check, staging proof, immutable history or issuance decision is changed.
BEGIN;
CREATE OR REPLACE FUNCTION public.uc_education_output_storage_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;size_text text;BEGIN
 IF TG_OP='UPDATE'THEN
 IF EXISTS(SELECT 1 FROM public.uc_education_issuance_preparation_items x WHERE(OLD.bucket_id='org-documents'AND OLD.name=x.organization_id::text||'/versions/'||x.output_document_id::text||'/'||x.output_request_id::text||'.pdf')OR(NEW.bucket_id='org-documents'AND NEW.name=x.organization_id::text||'/versions/'||x.output_document_id::text||'/'||x.output_request_id::text||'.pdf'))THEN IF(to_jsonb(OLD)-ARRAY['last_accessed_at','updated_at','path_tokens'])IS NOT DISTINCT FROM(to_jsonb(NEW)-ARRAY['last_accessed_at','updated_at','path_tokens'])THEN NEW.updated_at:=OLD.updated_at;RETURN NEW;END IF;RAISE EXCEPTION 'prepared_education_output_is_immutable' USING ERRCODE='42501';END IF;RETURN NEW;END IF;
 IF NEW.bucket_id<>'org-documents'THEN RETURN NEW;END IF;
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items x WHERE NEW.name=x.organization_id::text||'/versions/'||x.output_document_id::text||'/'||x.output_request_id::text||'.pdf';IF i.id IS NULL THEN RETURN NEW;END IF;
 SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 -- Opaque output slot IDs survive redaction so an already in-flight issuer
 -- cannot recreate a subject's PDF after its privacy transaction committed.
 IF i.redacted OR p.redacted OR i.user_id IS NULL OR i.final_record_id IS NOT NULL OR i.staging_proof IS NULL OR NOT coalesce(
   (auth.role()IS NOT DISTINCT FROM'authenticated'AND auth.uid()IS NOT DISTINCT FROM p.actor_id)
   OR(SESSION_USER='supabase_storage_admin'AND auth.role()IS NOT DISTINCT FROM'service_role'AND auth.uid()IS NULL
    AND p.actor_id IS NOT NULL AND NEW.owner_id IS NOT DISTINCT FROM p.actor_id::text
    AND(NEW.owner IS NULL OR NEW.owner=p.actor_id)),false) OR NOT public.uc_education_artifact_actor(p.actor_id,i.organization_id,i.group_id,i.user_id,i.enrollment_id)THEN RAISE EXCEPTION 'prepared_education_output_context_unavailable' USING ERRCODE='42501';END IF;
 PERFORM public.uc_education_issue_fence(i.organization_id,i.group_id,ARRAY[i.user_id,p.actor_id]);
 size_text:=coalesce(NEW.metadata->>'size',NEW.metadata->>'contentLength');IF size_text IS NULL OR size_text!~'^[0-9]+$'OR size_text::numeric IS DISTINCT FROM(i.staging_proof->>'byte_size')::numeric OR NEW.metadata->>'mimetype'IS DISTINCT FROM'application/pdf'THEN RAISE EXCEPTION 'prepared_education_output_metadata_mismatch' USING ERRCODE='22023';END IF;RETURN NEW;END;$function$
;
COMMIT;
