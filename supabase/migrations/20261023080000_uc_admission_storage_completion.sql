-- AD01 proposed native/source-only admission upload completion boundary; no ledger stamp.
DO $ad01$BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.uc_guard_admission_storage()'::regprocedure)IS DISTINCT FROM'9bcdefbfa7354c3696fa0d81d063fa82'THEN RAISE EXCEPTION'AD01_GUARD_PREIMAGE_CHANGED';END IF;END;$ad01$;
CREATE OR REPLACE FUNCTION public.uc_guard_admission_storage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE o jsonb:=CASE WHEN TG_OP='DELETE'THEN to_jsonb(OLD)ELSE to_jsonb(NEW)END;r public.uc_admission_evidence_reservations;c public.uc_admission_cases;size_text text;BEGIN
 IF TG_OP='UPDATE'AND(OLD.bucket_id='admission-case-evidence'OR NEW.bucket_id='admission-case-evidence')THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF o->>'bucket_id'<>'admission-case-evidence'THEN RETURN CASE WHEN TG_OP='DELETE'THEN OLD ELSE NEW END;END IF;
 IF TG_OP='INSERT'THEN
  IF auth.role()='authenticated'AND public.uc_admission_stage_allowed(NEW.bucket_id,NEW.name,true)AND coalesce(to_jsonb(NEW)->>'owner_id',to_jsonb(NEW)->>'owner')=auth.uid()::text THEN RETURN NEW;END IF;
  IF auth.role()='service_role'AND auth.uid()IS NULL THEN
   -- AD01: Storage may finish an already-authorized upload in a service context.
   -- The private prepared reservation remains the only authority for this path.
   SELECT q.* INTO r FROM public.uc_admission_evidence_reservations q
   WHERE q.source->>'kind'='upload'AND q.state='prepared'
    AND NEW.name=q.user_id::text||'/'||q.organization_id::text||'/'||q.case_id::text||'/staging/'||q.actor_id::text||'/'||q.id::text;
   IF r.id IS NOT NULL THEN
    SELECT ac.* INTO c FROM public.uc_admission_cases ac WHERE ac.id=r.case_id;
    IF c.id IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
    -- Reuse the existing subject/actor/responsible privacy and programme fences.
    -- No caller identity, global bypass or authenticated Storage policy changes.
    PERFORM public.uc_admission_lock(r.actor_id,r.organization_id,r.user_id,c.group_id,c.enrollment_id,c.responsible_id);
    SELECT ac.* INTO c FROM public.uc_admission_cases ac WHERE ac.id=r.case_id FOR SHARE;
    SELECT q.* INTO r FROM public.uc_admission_evidence_reservations q WHERE q.id=r.id FOR SHARE;
    size_text:=coalesce(NEW.metadata->>'size',NEW.metadata->>'contentLength');
    IF r.id IS NOT NULL AND c.id=r.case_id AND c.organization_id=r.organization_id AND c.user_id=r.user_id
     AND r.source->>'kind'='upload'AND r.state='prepared'AND r.expires_at>clock_timestamp()
     AND c.revision=r.expected_revision AND c.program_ref IS NOT DISTINCT FROM r.program_ref
     AND r.program_ref IS NOT DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)
     AND NEW.name=r.user_id::text||'/'||r.organization_id::text||'/'||r.case_id::text||'/staging/'||r.actor_id::text||'/'||r.id::text
     AND to_jsonb(NEW)->>'owner_id'=r.actor_id::text
     AND((to_jsonb(NEW)->>'owner')IS NULL OR to_jsonb(NEW)->>'owner'=r.actor_id::text)
     AND public.uc_admission_staff_allowed(r.actor_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,true)
     AND public.uc_admission_staff_allowed(r.actor_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.requirements) requirement WHERE requirement->>'id'=r.requirement_id::text)
     AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence ae WHERE ae.id=r.evidence_version_id)
     AND NOT EXISTS(SELECT 1 FROM storage.objects so WHERE so.bucket_id=NEW.bucket_id AND so.name=NEW.name)
     AND r.source->>'declared_mime'IN('application/pdf','image/jpeg','image/png')
     AND NEW.metadata->>'mimetype'IS NOT DISTINCT FROM r.source->>'declared_mime'
     AND(CASE WHEN coalesce(size_text,'')~'^[1-9][0-9]{0,7}$'AND coalesce(r.source->>'declared_size','')~'^[1-9][0-9]{0,7}$'
      THEN size_text::numeric BETWEEN 1 AND 20971520 AND size_text::numeric=(r.source->>'declared_size')::numeric ELSE false END)
    THEN RETURN NEW;END IF;
   END IF;
   SELECT * INTO r FROM public.uc_admission_evidence_reservations q WHERE NEW.name=q.user_id::text||'/'||q.organization_id::text||'/'||q.case_id::text||'/sealed/'||q.evidence_version_id::text AND q.state IN('prepared','sealed')AND q.expires_at>clock_timestamp();SELECT * INTO c FROM public.uc_admission_cases WHERE id=r.case_id;
   IF r.id IS NOT NULL AND c.revision=r.expected_revision AND public.uc_admission_staff_allowed(r.actor_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,true)AND public.uc_admission_staff_allowed(r.actor_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)AND c.program_ref=public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=r.evidence_version_id)THEN RETURN NEW;END IF;
  END IF;
 ELSIF TG_OP='DELETE'AND auth.role()='service_role'AND auth.uid()IS NULL THEN
  -- The confirmed job snapshot is the explicit exact file plan. Unlike a GUC,
  -- this private row remains valid for the separate Storage cleanup request.
  IF EXISTS(SELECT 1 FROM public.account_deletion_jobs j,jsonb_array_elements(j.files)f WHERE j.state='cleanup_pending'AND EXISTS(SELECT 1 FROM public.account_deletion_revocations v WHERE v.user_id=j.user_id)AND(split_part(OLD.name,'/',1)=j.user_id::text OR split_part(OLD.name,'/',4)='staging'AND split_part(OLD.name,'/',5)=j.user_id::text)AND f->>'bucket'=OLD.bucket_id AND f->>'path'=OLD.name AND f->>'objectId'=OLD.id::text AND(f->>'updatedAt')::timestamptz=OLD.updated_at)THEN RETURN OLD;END IF;
  IF NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.storage_object_id=OLD.id OR e.sealed_path=OLD.name)AND EXISTS(SELECT 1 FROM public.uc_admission_evidence_reservations q WHERE q.state<>'consumed'AND q.expires_at<=clock_timestamp()AND(OLD.name=q.user_id::text||'/'||q.organization_id::text||'/'||q.case_id::text||'/sealed/'||q.evidence_version_id::text OR OLD.name=q.user_id::text||'/'||q.organization_id::text||'/'||q.case_id::text||'/staging/'||q.actor_id::text||'/'||q.id::text))THEN RETURN OLD;END IF;
 END IF;PERFORM public.uc_admission_error('ACCESS_DENIED');RETURN NULL;END;$function$;

