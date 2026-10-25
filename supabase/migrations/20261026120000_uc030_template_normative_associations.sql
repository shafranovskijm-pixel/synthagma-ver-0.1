-- UC030: factual, version-pinned custom-template/source associations.
-- No backfill, template edits, source approval, publication or centre decision.
-- Contract version rows are mutable: a content pin is checked again at read/write.
BEGIN;
CREATE TABLE public.uc_normative_template_links(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 revision bigint NOT NULL CHECK(revision>0),expected_revision bigint NOT NULL CHECK(expected_revision=revision-1),
 target_kind text NOT NULL CHECK(target_kind IN('contract_template_version','org_document_version')),
 target_version_id uuid NOT NULL,target_parent_id uuid NOT NULL,target_version_number integer NOT NULL CHECK(target_version_number>0),
 target_sha256 text NOT NULL CHECK(target_sha256~'^[0-9a-f]{64}$'),
 hash_scope text NOT NULL CHECK(hash_scope IN('contract_name_html_variables','document_metadata_reference_not_file_bytes')),
 manifest_id uuid NOT NULL REFERENCES public.uc_normative_manifests(id) ON DELETE RESTRICT,
 manifest_sha256 text NOT NULL CHECK(manifest_sha256~'^[0-9a-f]{64}$'),source_id text NOT NULL CHECK(source_id~'^[A-Za-z0-9_.:-]{1,200}$'),
 source_sha256 text NOT NULL CHECK(source_sha256~'^[0-9a-f]{64}$'),action text NOT NULL CHECK(action IN('link','unlink')),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),actor_id uuid NOT NULL,occurred_at timestamptz NOT NULL,
 request_id uuid NOT NULL UNIQUE,request_sha256 text NOT NULL CHECK(request_sha256~'^[0-9a-f]{64}$'),UNIQUE(organization_id,revision),
 CHECK((target_kind='contract_template_version')=(hash_scope='contract_name_html_variables'))
);
CREATE INDEX uc_nt_latest ON public.uc_normative_template_links(organization_id,target_kind,target_version_id,source_id,revision DESC);
CREATE INDEX uc_nt_actor ON public.uc_normative_template_links(actor_id);
CREATE TRIGGER uc_nt_immutable BEFORE UPDATE OR DELETE ON public.uc_normative_template_links FOR EACH ROW EXECUTE FUNCTION public.uc_ng_immutable();
ALTER TABLE public.uc_normative_template_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uc_normative_template_links FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.uc_normative_template_links IS 'Append-only factual source/version links. Draft source permitted; never legal approval. Document metadata reference hash is not a file-byte hash. No inheritance/backfill to new template versions.';

CREATE FUNCTION public.uc_nt_fence(p_org uuid,p_write boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE actor uuid;person uuid;
BEGIN
 actor:=public.uc_ng_fence(p_org,p_write,false);
 FOR person IN SELECT DISTINCT actor_id FROM public.uc_normative_template_links WHERE organization_id=p_org LOOP
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(person::text,42007)) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_TEMPLATE_CONFLICT';END IF;
 END LOOP;
 RETURN actor;
END;$f$;

CREATE FUNCTION public.uc_nt_scope(p_org uuid,p_kind text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
 SELECT CASE WHEN p_kind='contract_template_version' THEN coalesce(p_org=public.current_organization_id() OR public.has_role(auth.uid(),'admin'::public.app_role),false)
 WHEN p_kind='org_document_version' THEN coalesce(public.uc_copy_registry_file_permission(p_org),false) ELSE false END
$f$;

-- Internal descriptor: no HTML, variables, storage paths, signed URLs or file bytes leave this helper.
CREATE FUNCTION public.uc_nt_target(p_org uuid,p_kind text,p_version uuid,p_lock boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $f$
DECLARE c public.org_contract_template_versions;v public.org_document_versions;d public.org_documents;pin text;
 result jsonb:=jsonb_build_object('kind',p_kind,'versionId',p_version,'parentId',NULL,'versionNumber',NULL,'label',NULL,'contentSha256',NULL,
 'hashScope',CASE WHEN p_kind='contract_template_version' THEN 'contract_name_html_variables' ELSE 'document_metadata_reference_not_file_bytes' END,'availability','unavailable');
BEGIN
 IF coalesce(p_kind,'') NOT IN('contract_template_version','org_document_version') OR p_version IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_TEMPLATE_INPUT_INVALID';END IF;
 IF p_kind='contract_template_version' THEN
  -- Mirror the actual legacy version policy in addition to the current document-action fence.
  IF NOT public.uc_nt_scope(p_org,p_kind) THEN RETURN result;END IF;
  IF p_lock THEN SELECT * INTO c FROM public.org_contract_template_versions WHERE organization_id=p_org AND id=p_version FOR SHARE NOWAIT;
  ELSE SELECT * INTO c FROM public.org_contract_template_versions WHERE organization_id=p_org AND id=p_version;END IF;
  IF c.id IS NULL THEN RETURN result;END IF;
  pin:=public.uc_ng_hash(public.uc_ng_canonical(jsonb_build_object('kind',p_kind,'organizationId',c.organization_id,'templateId',c.template_id,'versionId',c.id,'version',c.version,'name',c.name,'bodyHtml',c.body_html,'variables',c.variables)));
  RETURN result||jsonb_build_object('parentId',c.template_id,'versionNumber',c.version,'label',left(c.name,400),'contentSha256',pin,'availability','available');
 END IF;
 IF NOT public.uc_nt_scope(p_org,p_kind) THEN RETURN result;END IF;
 IF p_lock THEN
  SELECT * INTO v FROM public.org_document_versions WHERE organization_id=p_org AND id=p_version FOR SHARE NOWAIT;
  SELECT * INTO d FROM public.org_documents WHERE organization_id=p_org AND id=v.document_id AND deleted_at IS NULL FOR SHARE NOWAIT;
 ELSE
  SELECT * INTO v FROM public.org_document_versions WHERE organization_id=p_org AND id=p_version;
  SELECT * INTO d FROM public.org_documents WHERE organization_id=p_org AND id=v.document_id AND deleted_at IS NULL;
 END IF;
 IF v.id IS NULL OR d.id IS NULL OR NOT coalesce(public.uc_copy_registry_object_matches(v),false) THEN RETURN result;END IF;
 pin:=public.uc_copy_registry_original_ref(v)->>'content_hash';
 IF pin IS NULL OR pin!~'^[0-9a-f]{64}$' THEN RETURN result;END IF;
 RETURN result||jsonb_build_object('parentId',v.document_id,'versionNumber',v.version_number,'label',left(coalesce(v.file_name,d.name,'Документ'),400),'contentSha256',pin,'availability','available');
END;$f$;

CREATE FUNCTION public.uc_nt_manifest(p_id uuid,p_sha text DEFAULT NULL) RETURNS public.uc_normative_manifests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE m public.uc_normative_manifests;
BEGIN
 SELECT * INTO m FROM public.uc_normative_manifests WHERE id=p_id FOR SHARE NOWAIT;
 IF m.id IS NULL OR (p_sha IS NOT NULL AND m.body_sha256 IS DISTINCT FROM p_sha) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_TEMPLATE_SOURCE_CHANGED';END IF;
 PERFORM public.uc_ng_validate_manifest(m.canonical_body,m.body_sha256);
 RETURN m;
END;$f$;

CREATE FUNCTION public.uc_nt_link_view(p_link public.uc_normative_template_links,p_selected public.uc_normative_manifests,p_changed jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE target jsonb;current_source text;
BEGIN
 target:=public.uc_nt_target(p_link.organization_id,p_link.target_kind,p_link.target_version_id,false);
 SELECT s->>'sha256' INTO current_source FROM jsonb_array_elements(p_selected.canonical_body::jsonb->'sources')s WHERE s->>'id'=p_link.source_id;
 RETURN jsonb_build_object('id',p_link.id,'revision',p_link.revision,'target',target,'pinnedParentId',p_link.target_parent_id,'pinnedVersionNumber',p_link.target_version_number,
 'pinnedTargetSha256',p_link.target_sha256,'manifestId',p_link.manifest_id,'manifestSha256',p_link.manifest_sha256,'sourceId',p_link.source_id,'sourceSha256',p_link.source_sha256,
 'action',p_link.action,'reason',p_link.reason,'actorId',p_link.actor_id,'occurredAt',p_link.occurred_at,
 'targetState',CASE WHEN target->>'availability'<>'available' THEN 'unavailable' WHEN target->>'contentSha256'=p_link.target_sha256 THEN 'matching' ELSE 'changed' END,
 'sourceState',CASE WHEN current_source IS NULL THEN 'removed' WHEN current_source=p_link.source_sha256 THEN 'matching' ELSE 'changed' END,
 'impacted',p_link.action='link' AND (p_changed?p_link.source_id OR current_source IS DISTINCT FROM p_link.source_sha256),
 'sourceStatus',jsonb_build_object('checked',EXISTS(SELECT 1 FROM public.uc_normative_events e WHERE e.manifest_id=p_link.manifest_id AND e.kind='source_checked' AND e.body->>'sourceId'=p_link.source_id AND e.body->>'sourceSha256'=p_link.source_sha256),
 'legalReviewed',EXISTS(SELECT 1 FROM public.uc_normative_events e WHERE e.manifest_id=p_link.manifest_id AND e.kind='legal_reviewed'),
 'published',EXISTS(SELECT 1 FROM public.uc_normative_events e WHERE e.manifest_id=p_link.manifest_id AND e.kind='published')),'legalComplianceConfirmed',false);
END;$f$;

CREATE FUNCTION public.read_normative_template_associations(p_organization_id uuid,p_manifest_id uuid,p_query jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE actor uuid;m public.uc_normative_manifests;prior public.uc_normative_manifests;changed jsonb;kind text;v_target_kind text;target_id uuid;after_id uuid;after_revision bigint;lim integer;
 items jsonb:='[]';row_record record;link public.uc_normative_template_links;target jsonb;total bigint;more boolean:=false;last_id uuid;last_revision bigint;seq bigint;keys text[];
BEGIN
 actor:=public.uc_nt_fence(p_organization_id,false);
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('uc030:templates:'||p_organization_id::text,30031)) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_TEMPLATE_CONFLICT';END IF;
 m:=public.uc_nt_manifest(p_manifest_id,NULL);
 SELECT * INTO prior FROM public.uc_normative_manifests WHERE id=m.predecessor_id;
 WITH a AS(SELECT value FROM jsonb_array_elements(coalesce(prior.canonical_body::jsonb->'sources','[]'))),b AS(SELECT value FROM jsonb_array_elements(m.canonical_body::jsonb->'sources'))
 SELECT coalesce(jsonb_agg(to_jsonb(id) ORDER BY id),'[]') INTO changed FROM(SELECT coalesce(a.value->>'id',b.value->>'id')id FROM a FULL JOIN b ON a.value->>'id'=b.value->>'id' WHERE a.value->>'sha256' IS DISTINCT FROM b.value->>'sha256')x;
 IF jsonb_typeof(p_query) IS DISTINCT FROM 'object' OR octet_length(p_query::text)>2048 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_TEMPLATE_INPUT_INVALID';END IF;
 kind:=p_query->>'kind';
 keys:=CASE WHEN kind='versions' THEN ARRAY['kind','targetKind','afterId','limit'] WHEN kind IN('links','history') THEN ARRAY['kind','targetKind','targetVersionId','afterRevision','limit'] WHEN kind='impacts' THEN ARRAY['kind','afterRevision','limit'] ELSE NULL END;
 IF keys IS NULL OR NOT coalesce(public.uc_ng_closed(p_query,keys),false) OR jsonb_typeof(p_query->'limit') IS DISTINCT FROM 'number' OR (p_query->>'limit')!~'^[1-9][0-9]?$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_TEMPLATE_INPUT_INVALID';END IF;
 lim:=(p_query->>'limit')::integer;IF lim>25 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_TEMPLATE_INPUT_INVALID';END IF;
 SELECT coalesce(max(revision),0) INTO seq FROM public.uc_normative_template_links WHERE organization_id=p_organization_id;
 IF kind='versions' THEN
  v_target_kind:=p_query->>'targetKind';
  IF coalesce(v_target_kind,'') NOT IN('contract_template_version','org_document_version') OR NOT(p_query->'afterId'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'afterId')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_TEMPLATE_INPUT_INVALID';END IF;
  after_id:=(p_query->>'afterId')::uuid;
  IF NOT public.uc_nt_scope(p_organization_id,v_target_kind) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NORMATIVE_TEMPLATE_ACCESS_DENIED';END IF;
  FOR row_record IN SELECT id FROM(SELECT c.id FROM public.org_contract_template_versions c WHERE v_target_kind='contract_template_version' AND c.organization_id=p_organization_id UNION ALL SELECT v.id FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id AND d.organization_id=v.organization_id WHERE v_target_kind='org_document_version' AND v.organization_id=p_organization_id AND d.deleted_at IS NULL)q WHERE after_id IS NULL OR id<after_id ORDER BY id DESC LIMIT lim+1 LOOP
   IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;
   target:=public.uc_nt_target(p_organization_id,v_target_kind,row_record.id,false);
   SELECT count(*) INTO total FROM(SELECT DISTINCT ON(source_id) action FROM public.uc_normative_template_links WHERE organization_id=p_organization_id AND target_kind=v_target_kind AND target_version_id=row_record.id ORDER BY source_id,revision DESC)x WHERE action='link';
   items:=items||jsonb_build_array(target||jsonb_build_object('activeLinks',total));last_id:=row_record.id;
  END LOOP;
 ELSE
  IF NOT(p_query->'afterRevision'='null'::jsonb OR jsonb_typeof(p_query->'afterRevision')='number' AND(p_query->>'afterRevision')~'^[1-9][0-9]{0,15}$') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_TEMPLATE_INPUT_INVALID';END IF;
  after_revision:=(p_query->>'afterRevision')::bigint;
  IF after_revision>9007199254740991 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_TEMPLATE_INPUT_INVALID';END IF;
  IF kind='impacts' AND NOT(public.uc_nt_scope(p_organization_id,'contract_template_version') AND public.uc_nt_scope(p_organization_id,'org_document_version')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NORMATIVE_TEMPLATE_ACCESS_DENIED';END IF;
  IF kind IN('links','history') THEN
   v_target_kind:=p_query->>'targetKind';IF coalesce(v_target_kind,'') NOT IN('contract_template_version','org_document_version') OR NOT public.uc_custom_journal_uuid(p_query->'targetVersionId') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_TEMPLATE_INPUT_INVALID';END IF;target_id:=(p_query->>'targetVersionId')::uuid;
   IF NOT public.uc_nt_scope(p_organization_id,v_target_kind) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NORMATIVE_TEMPLATE_ACCESS_DENIED';END IF;
   -- A missing target may still have a factual retained association history in this organization.
   IF public.uc_nt_target(p_organization_id,v_target_kind,target_id,false)->>'availability'<>'available' AND NOT EXISTS(SELECT 1 FROM public.uc_normative_template_links WHERE organization_id=p_organization_id AND target_version_id=target_id AND uc_normative_template_links.target_kind=v_target_kind) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NORMATIVE_TEMPLATE_ACCESS_DENIED';END IF;
  END IF;
  FOR link IN WITH latest AS(SELECT DISTINCT ON(l.target_kind,l.target_version_id,l.source_id) l.* FROM public.uc_normative_template_links l WHERE l.organization_id=p_organization_id ORDER BY l.target_kind,l.target_version_id,l.source_id,l.revision DESC),candidates AS(SELECT * FROM public.uc_normative_template_links WHERE kind='history' AND organization_id=p_organization_id UNION ALL SELECT * FROM latest WHERE kind<>'history')
   SELECT l.* FROM candidates l WHERE (after_revision IS NULL OR l.revision<after_revision) AND (kind='impacts' AND l.action='link' AND(changed?l.source_id OR l.source_sha256 IS DISTINCT FROM(SELECT s->>'sha256' FROM jsonb_array_elements(m.canonical_body::jsonb->'sources')s WHERE s->>'id'=l.source_id)) OR kind IN('links','history') AND l.target_kind=v_target_kind AND l.target_version_id=target_id) ORDER BY l.revision DESC LIMIT lim+1 LOOP
   IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;
   items:=items||jsonb_build_array(public.uc_nt_link_view(link,m,changed));last_revision:=link.revision;
  END LOOP;
 END IF;
 RETURN jsonb_build_object('schemaVersion',1,'organizationId',p_organization_id,'actorId',actor,'manifestId',m.id,'manifestSha256',m.body_sha256,'revision',seq,'kind',kind,'items',items,'complete',NOT more,
 'nextAfterId',CASE WHEN more AND kind='versions' THEN last_id ELSE NULL END,'nextAfterRevision',CASE WHEN more AND kind<>'versions' THEN last_revision ELSE NULL END,'changedSourceIds',changed,
 'legacySettingsCoverage','unknown_no_backfill','legalComplianceConfirmed',false);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_TEMPLATE_CONFLICT';
END;$f$;

CREATE FUNCTION public.record_normative_template_association(p_organization_id uuid,p_expected_revision bigint,p_request_id uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE actor uuid;seq bigint;req_hash text;m public.uc_normative_manifests;source jsonb;target jsonb;old public.uc_normative_template_links;replay public.uc_normative_template_links;item public.uc_normative_template_links;
BEGIN
 actor:=public.uc_nt_fence(p_organization_id,true);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc030:templates:'||p_organization_id::text,30031)) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_TEMPLATE_CONFLICT';END IF;
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>9007199254740990 OR NOT coalesce(public.uc_ng_closed(p_command,ARRAY['action','targetKind','targetVersionId','targetSha256','manifestId','manifestSha256','sourceId','sourceSha256','reason']),false)
 OR octet_length(p_command::text)>6000 OR coalesce(p_command->>'action','') NOT IN('link','unlink') OR coalesce(p_command->>'targetKind','') NOT IN('contract_template_version','org_document_version')
 OR NOT public.uc_custom_journal_uuid(p_command->'targetVersionId') OR NOT public.uc_custom_journal_uuid(p_command->'manifestId')
 OR coalesce(p_command->>'targetSha256','')!~'^[0-9a-f]{64}$' OR coalesce(p_command->>'manifestSha256','')!~'^[0-9a-f]{64}$' OR coalesce(p_command->>'sourceSha256','')!~'^[0-9a-f]{64}$'
 OR coalesce(p_command->>'sourceId','')!~'^[A-Za-z0-9_.:-]{1,200}$' OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_command->>'reason')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_TEMPLATE_INPUT_INVALID';END IF;
 IF NOT public.uc_nt_scope(p_organization_id,p_command->>'targetKind') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NORMATIVE_TEMPLATE_ACCESS_DENIED';END IF;
 req_hash:=public.uc_ng_hash(public.uc_ng_canonical(jsonb_build_object('organizationId',p_organization_id,'actorId',actor,'expectedRevision',p_expected_revision,'command',p_command)));
 SELECT * INTO replay FROM public.uc_normative_template_links WHERE request_id=p_request_id FOR SHARE NOWAIT;
 IF replay.id IS NOT NULL THEN
  IF replay.organization_id IS DISTINCT FROM p_organization_id OR replay.actor_id IS DISTINCT FROM actor OR replay.request_sha256 IS DISTINCT FROM req_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_TEMPLATE_REQUEST_REUSED';END IF;
  RETURN jsonb_build_object('receipt',jsonb_build_object('id',replay.id,'organizationId',replay.organization_id,'actorId',actor,'requestId',p_request_id,'revision',replay.revision,'targetKind',replay.target_kind,'targetVersionId',replay.target_version_id,'sourceId',replay.source_id,'action',replay.action));
 END IF;
 SELECT coalesce(max(revision),0) INTO seq FROM public.uc_normative_template_links WHERE organization_id=p_organization_id;
 IF seq<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_TEMPLATE_CONFLICT';END IF;
 m:=public.uc_nt_manifest((p_command->>'manifestId')::uuid,p_command->>'manifestSha256');
 SELECT s INTO source FROM jsonb_array_elements(m.canonical_body::jsonb->'sources')s WHERE s->>'id'=p_command->>'sourceId' AND s->>'sha256'=p_command->>'sourceSha256';
 IF source IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_TEMPLATE_SOURCE_CHANGED';END IF;
 SELECT * INTO old FROM public.uc_normative_template_links WHERE organization_id=p_organization_id AND target_kind=p_command->>'targetKind' AND target_version_id=(p_command->>'targetVersionId')::uuid AND source_id=p_command->>'sourceId' ORDER BY revision DESC LIMIT 1;
 IF p_command->>'action'='link' THEN
  target:=public.uc_nt_target(p_organization_id,p_command->>'targetKind',(p_command->>'targetVersionId')::uuid,true);
  IF target->>'availability'<>'available' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NORMATIVE_TEMPLATE_ACCESS_DENIED';END IF;
  IF target->>'contentSha256' IS DISTINCT FROM p_command->>'targetSha256' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_TEMPLATE_TARGET_CHANGED';END IF;
 ELSE
  IF old.id IS NULL OR old.action<>'link' OR old.manifest_id IS DISTINCT FROM m.id OR old.manifest_sha256 IS DISTINCT FROM m.body_sha256 OR old.source_sha256 IS DISTINCT FROM source->>'sha256' OR old.target_sha256 IS DISTINCT FROM p_command->>'targetSha256' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_TEMPLATE_CONFLICT';END IF;
  target:=jsonb_build_object('parentId',old.target_parent_id,'versionNumber',old.target_version_number,'hashScope',old.hash_scope);
 END IF;
 INSERT INTO public.uc_normative_template_links VALUES(gen_random_uuid(),p_organization_id,seq+1,seq,p_command->>'targetKind',(p_command->>'targetVersionId')::uuid,(target->>'parentId')::uuid,(target->>'versionNumber')::integer,p_command->>'targetSha256',target->>'hashScope',m.id,m.body_sha256,source->>'id',source->>'sha256',p_command->>'action',btrim(p_command->>'reason'),actor,clock_timestamp(),p_request_id,req_hash) RETURNING * INTO item;
 RETURN jsonb_build_object('receipt',jsonb_build_object('id',item.id,'organizationId',item.organization_id,'actorId',actor,'requestId',p_request_id,'revision',item.revision,'targetKind',item.target_kind,'targetVersionId',item.target_version_id,'sourceId',item.source_id,'action',item.action));
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_TEMPLATE_CONFLICT';
END;$f$;

-- Preserve both existing branches; include new actor references in the existing retention blocker.
CREATE OR REPLACE FUNCTION public.uc_ng_personal_counts(p_user uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',t,'column','normative_review_required','count',n) ORDER BY t),'[]') FROM(
 SELECT 'uc_normative_manifests' t,count(*) n FROM public.uc_normative_manifests WHERE created_by=p_user
 UNION ALL SELECT 'uc_normative_events',count(*) FROM public.uc_normative_events WHERE actor_id=p_user
 UNION ALL SELECT 'uc_normative_template_links',count(*) FROM public.uc_normative_template_links WHERE actor_id=p_user
 )c WHERE n>0
$f$;

-- Remove inherited default ACLs, then expose only the scoped authenticated RPCs.
DO $acl$
DECLARE p record;a record;v_grantee text;column_row record;role_name text;
 names text[]:=ARRAY['uc_nt_fence','uc_nt_scope','uc_nt_target','uc_nt_manifest','uc_nt_link_view','read_normative_template_associations','record_normative_template_association'];
BEGIN
 FOR p IN SELECT x.oid,x.proowner,x.proacl,x.oid::regprocedure signature,x.proname FROM pg_proc x JOIN pg_namespace n ON n.oid=x.pronamespace WHERE n.nspname='public' AND x.proname=ANY(names) LOOP
  FOR a IN SELECT DISTINCT grantee FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) WHERE grantee<>p.proowner LOOP
   v_grantee:=CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END;EXECUTE 'REVOKE ALL ON FUNCTION '||p.signature||' FROM '||v_grantee;
  END LOOP;
  IF p.proname IN('read_normative_template_associations','record_normative_template_association') THEN EXECUTE 'GRANT EXECUTE ON FUNCTION '||p.signature||' TO authenticated';END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','authenticator','supabase_auth_admin'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) AND has_function_privilege(role_name,p.oid,'EXECUTE') IS DISTINCT FROM(role_name='authenticated' AND p.proname IN('read_normative_template_associations','record_normative_template_association')) THEN RAISE EXCEPTION 'NORMATIVE_TEMPLATE_FUNCTION_ACL';END IF;
  END LOOP;
 END LOOP;
 FOR p IN SELECT oid,relowner,relacl FROM pg_class WHERE oid='public.uc_normative_template_links'::regclass LOOP
  FOR a IN SELECT DISTINCT grantee FROM aclexplode(coalesce(p.relacl,acldefault('r',p.relowner))) WHERE grantee<>p.relowner LOOP
   v_grantee:=CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END;EXECUTE 'REVOKE ALL ON TABLE public.uc_normative_template_links FROM '||v_grantee;
  END LOOP;
  FOR column_row IN SELECT attname,attacl FROM pg_attribute WHERE attrelid=p.oid AND attnum>0 AND NOT attisdropped AND coalesce(array_length(attacl,1),0)>0 LOOP
   FOR a IN SELECT DISTINCT grantee FROM aclexplode(column_row.attacl) WHERE grantee<>p.relowner LOOP
    v_grantee:=CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END;EXECUTE format('REVOKE ALL (%I) ON public.uc_normative_template_links FROM %s',column_row.attname,v_grantee);
   END LOOP;
  END LOOP;
 END LOOP;
END;$acl$;
COMMIT;
