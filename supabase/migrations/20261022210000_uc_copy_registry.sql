-- UC016 shared copies/duplicates registry. Additive618; no official issuance or signing.
-- Runtime has no migration-ledger guard. Reviewed production wrapper owns that precondition.
CREATE TABLE public.uc_copy_registry_heads(organization_id uuid PRIMARY KEY,revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0));
CREATE TABLE public.uc_copy_registry_counters(organization_id uuid NOT NULL,copy_type text NOT NULL CHECK(copy_type IN('copy','duplicate')),sequence_year integer NOT NULL CHECK(sequence_year BETWEEN 1900 AND 9999),last_number bigint NOT NULL CHECK(last_number>0),PRIMARY KEY(organization_id,copy_type,sequence_year));
CREATE TABLE public.uc_copy_registry_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,group_id uuid,registration_id text NOT NULL,copy_type text NOT NULL CHECK(copy_type IN('copy','duplicate')),sequence_year integer NOT NULL,sequence_number bigint NOT NULL CHECK(sequence_number>0),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),data jsonb NOT NULL,latest_transfer jsonb,participant_ids uuid[] NOT NULL,registered_by uuid,registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by uuid,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),archived boolean NOT NULL DEFAULT false,redacted boolean NOT NULL DEFAULT false,import_source_digest text,UNIQUE(organization_id,registration_id),UNIQUE(organization_id,copy_type,sequence_year,sequence_number));
CREATE UNIQUE INDEX uc_copy_registry_import_digest ON public.uc_copy_registry_records(organization_id,import_source_digest) WHERE import_source_digest IS NOT NULL;
CREATE INDEX uc_copy_registry_scope ON public.uc_copy_registry_records(organization_id,group_id,id);
CREATE TABLE public.uc_copy_registry_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,record_id uuid NOT NULL REFERENCES public.uc_copy_registry_records(id) ON DELETE RESTRICT,revision bigint NOT NULL,action text NOT NULL CHECK(action IN('create','update','archive','transfer','import')),reason text NOT NULL,snapshot jsonb NOT NULL,participant_ids uuid[] NOT NULL,recorded_by uuid,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),redacted boolean NOT NULL DEFAULT false,UNIQUE(record_id,revision));
CREATE INDEX uc_copy_registry_history_org ON public.uc_copy_registry_history(organization_id,record_id,revision);
CREATE TABLE public.uc_copy_registry_requests(actor_id uuid NOT NULL,request_id uuid NOT NULL,organization_id uuid NOT NULL,scope jsonb NOT NULL,payload_hash text NOT NULL,result jsonb NOT NULL,participant_ids uuid[] NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,request_id));
CREATE TABLE public.uc_copy_registry_imports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,created_by uuid,source_raw text NOT NULL,source_sha256 text NOT NULL,preview_hash text NOT NULL,registry_revision bigint NOT NULL,status text NOT NULL CHECK(status IN('preview','applied')),rows jsonb NOT NULL,report jsonb,participant_ids uuid[] NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX uc_copy_registry_imports_org ON public.uc_copy_registry_imports(organization_id,id);
CREATE TABLE public.uc_copy_registry_exports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,scope jsonb NOT NULL,registry_revision bigint NOT NULL,created_by uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),record_count integer NOT NULL,history_count integer NOT NULL,manifest_json text NOT NULL,manifest_bytes bigint NOT NULL,manifest_sha256 text NOT NULL,html text NOT NULL,html_bytes bigint NOT NULL,html_sha256 text NOT NULL,participant_ids uuid[] NOT NULL,CHECK(manifest_bytes=octet_length(manifest_json)),CHECK(html_bytes=octet_length(html)));
CREATE INDEX uc_copy_registry_exports_org ON public.uc_copy_registry_exports(organization_id,id);

CREATE FUNCTION public.uc_copy_registry_error(p_code text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'COPY_REGISTRY_%',p_code USING ERRCODE=CASE p_code WHEN'ACCESS_DENIED'THEN'42501' WHEN'INVALID_INPUT'THEN'22023' WHEN'REVISION_CONFLICT'THEN'PT409' ELSE'P0001'END;END;$fn$;
CREATE FUNCTION public.uc_copy_registry_hash(p text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$ SELECT encode(sha256(convert_to(p,'UTF8')),'hex') $fn$;
CREATE FUNCTION public.uc_copy_registry_scope(p_org uuid,p_scope jsonb,p_write boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE g uuid;BEGIN
 IF public.uc_custom_journal_shape(p_scope,ARRAY['kind']) AND p_scope->>'kind'='organization' THEN g:=NULL;
 ELSIF public.uc_custom_journal_shape(p_scope,ARRAY['kind','group_id']) AND p_scope->>'kind'='group' AND public.uc_custom_journal_uuid(p_scope->'group_id') THEN g:=(p_scope->>'group_id')::uuid;
 ELSE PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;
 IF NOT public.uc_scoped_journal_permission(p_org,g,p_write) OR(g IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.student_groups WHERE id=g AND organization_id=p_org)) THEN PERFORM public.uc_copy_registry_error('ACCESS_DENIED');END IF;RETURN g;END;$fn$;
CREATE FUNCTION public.uc_copy_registry_fence(p_org uuid,p_group uuid,p_people uuid[],p_write boolean DEFAULT false,p_request uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE person_id uuid;BEGIN
 IF cardinality(coalesce(p_people,'{}'))>20000 THEN PERFORM public.uc_copy_registry_error('LIMIT_EXCEEDED');END IF;
 FOR person_id IN SELECT DISTINCT x FROM unnest(array_append(coalesce(p_people,'{}'),auth.uid()))x WHERE x IS NOT NULL ORDER BY x LOOP
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(person_id::text,42007)) THEN PERFORM public.uc_copy_registry_error('REVISION_CONFLICT');END IF;
  IF NOT public.uc_custom_journal_person(person_id) THEN PERFORM public.uc_copy_registry_error('SOURCE_UNAVAILABLE');END IF;
 END LOOP;
 LOCK TABLE public.organizations,public.org_staff,public.org_staff_document_groups,public.user_roles,public.admin_staff IN ROW SHARE MODE NOWAIT;
 PERFORM 1 FROM public.organizations WHERE id=p_org FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_staff WHERE organization_id=p_org AND user_id=auth.uid() ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_staff_document_groups a JOIN public.org_staff s ON s.id=a.staff_id WHERE a.organization_id=p_org AND a.group_id=p_group AND s.user_id=auth.uid() ORDER BY a.staff_id FOR SHARE OF a NOWAIT;
 PERFORM 1 FROM public.user_roles WHERE user_id=auth.uid() FOR SHARE NOWAIT;PERFORM 1 FROM public.admin_staff WHERE user_id=auth.uid() FOR SHARE NOWAIT;
 IF NOT public.uc_scoped_journal_permission(p_org,p_group,p_write) THEN PERFORM public.uc_copy_registry_error('ACCESS_DENIED');END IF;
 IF p_write AND NOT pg_try_advisory_xact_lock(hashtextextended('uc_copy_registry:'||p_org::text,0)) THEN PERFORM public.uc_copy_registry_error('REVISION_CONFLICT');END IF;
 IF p_request IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended('uc_copy_registry_request:'||auth.uid()::text||':'||p_request::text,0)) THEN PERFORM public.uc_copy_registry_error('REVISION_CONFLICT');END IF;
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_copy_registry_error('REVISION_CONFLICT');END;$fn$;
CREATE FUNCTION public.uc_copy_registry_date(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
BEGIN IF jsonb_typeof(p) IS DISTINCT FROM'string' OR(p#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false;END IF;RETURN to_char((p#>>'{}')::date,'YYYY-MM-DD')=p#>>'{}';EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;END;$fn$;
CREATE FUNCTION public.uc_copy_registry_label(p_user uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT left(coalesce(nullif(btrim(p.full_name),''),'Участник'),500) FROM public.profiles p WHERE p.user_id=p_user LIMIT 1 $fn$;
CREATE FUNCTION public.uc_copy_registry_file_permission(p_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(NOT public.uc_document_teacher_limited(p_org) AND public.uc_document_action_allowed(p_org,'read',NULL,NULL),false) $fn$;

CREATE FUNCTION public.uc_copy_registry_object_matches(p public.org_document_versions) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(p.storage_object_id IS NOT NULL AND p.file_path IS NOT NULL AND jsonb_typeof(p.storage_metadata)='object' AND(p.storage_metadata->>'size')~'^[0-9]{1,18}$'
 AND nullif(btrim(btrim(coalesce(p.storage_metadata->>'eTag',p.storage_metadata->>'etag')),'"'),'')IS NOT NULL AND nullif(lower(btrim(p.storage_metadata->>'mimetype')),'')IS NOT NULL
 AND EXISTS(SELECT 1 FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id WHERE o.id=p.storage_object_id AND o.bucket_id='org-documents' AND NOT b.public AND o.name=p.file_path
  AND(o.metadata->>'size')~'^[0-9]{1,18}$'AND(CASE WHEN(o.metadata->>'size')~'^[0-9]{1,18}$'THEN(o.metadata->>'size')::bigint END)=(CASE WHEN(p.storage_metadata->>'size')~'^[0-9]{1,18}$'THEN(p.storage_metadata->>'size')::bigint END) AND(p.file_size IS NULL OR p.file_size=(CASE WHEN(o.metadata->>'size')~'^[0-9]{1,18}$'THEN(o.metadata->>'size')::bigint END))
  AND btrim(btrim(coalesce(o.metadata->>'eTag',o.metadata->>'etag')),'"')=btrim(btrim(coalesce(p.storage_metadata->>'eTag',p.storage_metadata->>'etag')),'"')
  AND lower(btrim(o.metadata->>'mimetype'))=lower(btrim(p.storage_metadata->>'mimetype'))),false) $fn$;
CREATE FUNCTION public.uc_copy_registry_source(p_org uuid,p_ref jsonb,p_unresolved boolean DEFAULT false,p_required boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $fn$
DECLARE v public.org_document_versions;d public.org_documents;proof jsonb;people uuid[];available boolean:=false;
BEGIN
 IF p_unresolved AND public.uc_custom_journal_shape(p_ref,ARRAY['kind','document_type','document_number','issue_date','explanation']) AND p_ref->>'kind'='unresolved'
  AND public.uc_custom_journal_text(p_ref->'document_type',100) AND public.uc_custom_journal_text(p_ref->'document_number',120) AND public.uc_custom_journal_text(p_ref->'issue_date',80) AND public.uc_custom_journal_text(p_ref->'explanation',2000) THEN RETURN jsonb_build_object('participants','[]'::jsonb,'label',NULL,'verified',false);END IF;
 IF NOT public.uc_custom_journal_shape(p_ref,ARRAY['kind','document_id','version_id','content_hash']) OR p_ref->>'kind' IS DISTINCT FROM'org_document_version' OR NOT public.uc_custom_journal_uuid(p_ref->'document_id') OR NOT public.uc_custom_journal_uuid(p_ref->'version_id') OR coalesce(p_ref->>'content_hash','')!~'^[a-f0-9]{64}$' THEN
  IF p_required THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;RETURN NULL;END IF;
 IF public.uc_copy_registry_file_permission(p_org) THEN
  SELECT x.* INTO d FROM public.org_documents x WHERE x.id=(p_ref->>'document_id')::uuid AND x.organization_id=p_org AND x.deleted_at IS NULL AND coalesce(to_jsonb(x)->>'status','active') NOT IN('archived','expired');
  SELECT x.* INTO v FROM public.org_document_versions x WHERE x.id=(p_ref->>'version_id')::uuid AND x.document_id=d.id AND x.organization_id=p_org;
  IF v.id IS NOT NULL AND public.uc_copy_registry_object_matches(v) THEN
   proof:=jsonb_build_object('document_id',v.document_id,'version_id',v.id,'version_number',v.version_number,'file_path',v.file_path,'file_size',v.file_size,'file_name',v.file_name,'storage_object_id',v.storage_object_id,'storage_metadata',v.storage_metadata,'document_metadata',v.document_metadata);
   available:=public.uc_copy_registry_hash(proof::text)=p_ref->>'content_hash' AND(v.uploaded_by IS NULL OR public.uc_custom_journal_person(v.uploaded_by));
  END IF;
 END IF;
 IF NOT available THEN IF p_required THEN PERFORM public.uc_copy_registry_error('SOURCE_UNAVAILABLE');END IF;RETURN NULL;END IF;
 people:=array_remove(ARRAY[v.uploaded_by],NULL);RETURN jsonb_build_object('participants',to_jsonb(people),'label',left(d.name||' · версия '||v.version_number,500),'verified',true);
END;$fn$;
CREATE FUNCTION public.uc_copy_registry_data(p_org uuid,p_group uuid,p_data jsonb,p_historical boolean DEFAULT false) RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE people uuid[]:='{}';who uuid;part jsonb;k text;ctx jsonb:=jsonb_build_object('kind',CASE WHEN p_group IS NULL THEN'organization'ELSE'group'END,'group_id',p_group);
BEGIN
 IF NOT public.uc_custom_journal_shape(p_data,ARRAY['copy_type','declared_number','document_date','original','subject','recipient','basis','notes']) OR NOT coalesce(p_data->>'copy_type' IN('copy','duplicate'),false) OR NOT public.uc_copy_registry_date(p_data->'document_date')
  OR NOT(p_data->'declared_number'='null'::jsonb OR public.uc_custom_journal_text(p_data->'declared_number',120,true)) OR NOT public.uc_custom_journal_text(p_data->'notes',4000,true) THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;
 part:=public.uc_copy_registry_source(p_org,p_data->'original',p_historical,true);SELECT coalesce(array_agg(x::uuid),'{}') INTO people FROM jsonb_array_elements_text(part->'participants')x;
 IF public.uc_custom_journal_shape(p_data->'subject',ARRAY['kind']) AND p_data->'subject'->>'kind'='none' THEN NULL;
 ELSIF public.uc_custom_journal_shape(p_data->'subject',ARRAY['kind','user_id']) AND p_data->'subject'->>'kind'='person' AND public.uc_custom_journal_uuid(p_data->'subject'->'user_id') THEN
  who:=(p_data->'subject'->>'user_id')::uuid;IF NOT public.uc_scoped_journal_subject(p_org,ctx,who) THEN PERFORM public.uc_copy_registry_error('SOURCE_UNAVAILABLE');END IF;people:=array_append(people,who);
 ELSE PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;
 IF public.uc_custom_journal_shape(p_data->'recipient',ARRAY['kind','user_id']) AND p_data->'recipient'->>'kind'='person' AND public.uc_custom_journal_uuid(p_data->'recipient'->'user_id') THEN
  who:=(p_data->'recipient'->>'user_id')::uuid;IF NOT public.uc_scoped_journal_subject(p_org,ctx,who) THEN PERFORM public.uc_copy_registry_error('SOURCE_UNAVAILABLE');END IF;people:=array_append(people,who);
 ELSIF public.uc_custom_journal_shape(p_data->'recipient',ARRAY['kind','name','capacity']) AND p_data->'recipient'->>'kind'='external' AND public.uc_custom_journal_text(p_data->'recipient'->'name',300) AND coalesce(p_data->'recipient'->>'capacity' IN('self','representative','organization','other'),false) THEN NULL;
 ELSE PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;
 IF NOT public.uc_custom_journal_shape(p_data->'basis',ARRAY['reason','note','evidence']) OR NOT coalesce(p_data->'basis'->>'reason' IN('lost','damaged','name_change','employer_request','archive','other'),false) OR NOT public.uc_custom_journal_text(p_data->'basis'->'note',2000) THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;
 IF p_data->'basis'->'evidence'<>'null'::jsonb THEN part:=public.uc_copy_registry_source(p_org,p_data->'basis'->'evidence',false,true);people:=people||ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(part->'participants')x);END IF;
 RETURN ARRAY(SELECT DISTINCT x FROM unnest(people)x WHERE x IS NOT NULL ORDER BY x);END;$fn$;
CREATE FUNCTION public.uc_copy_registry_visible(p_group uuid,p_record_group uuid) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$ SELECT p_group IS NULL OR p_record_group=p_group $fn$;
CREATE FUNCTION public.uc_copy_registry_base(p_org uuid,p_scope jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE g uuid;w boolean;BEGIN g:=public.uc_copy_registry_scope(p_org,p_scope,false);w:=public.uc_scoped_journal_permission(p_org,g,true);RETURN jsonb_build_object('schema_version',1,'organization_id',p_org,'scope',p_scope,'registry_revision',coalesce((SELECT revision FROM public.uc_copy_registry_heads WHERE organization_id=p_org),0),'capabilities',jsonb_build_object('can_read',true,'can_write',w,'can_create',w AND public.uc_copy_registry_file_permission(p_org),'can_import',w AND g IS NULL,'can_inventory_local',g IS NULL,'can_export',true));END;$fn$;
CREATE FUNCTION public.uc_copy_registry_record_json(p public.uc_copy_registry_records) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $fn$
DECLARE src jsonb;can_write boolean;BEGIN
 src:=public.uc_copy_registry_source(p.organization_id,p.data->'original',p.import_source_digest IS NOT NULL,false);can_write:=public.uc_scoped_journal_permission(p.organization_id,p.group_id,true);
 RETURN jsonb_build_object('id',p.id,'group_id',p.group_id,'registration_id',p.registration_id,'sequence_year',p.sequence_year,'sequence_number',p.sequence_number,'revision',p.revision,'archived',p.archived,'redacted',false,'data',p.data,'registered_at',p.registered_at,'recorded_by',p.registered_by,'updated_at',p.updated_at,'latest_transfer',p.latest_transfer,
 'subject_label',CASE WHEN p.data->'subject'->>'kind'='person' THEN public.uc_copy_registry_label((p.data->'subject'->>'user_id')::uuid) ELSE NULL END,
 'recipient_label',CASE WHEN p.data->'recipient'->>'kind'='person' THEN coalesce(public.uc_copy_registry_label((p.data->'recipient'->>'user_id')::uuid),'Участник') ELSE p.data->'recipient'->>'name'END,
 'original_label',src->'label','original_available',src IS NOT NULL AND coalesce((src->>'verified')::boolean,false),'recorded_by_label',public.uc_copy_registry_label(p.registered_by),
 'can_edit',can_write AND NOT p.archived AND src IS NOT NULL,'can_archive',can_write AND NOT p.archived,'can_transfer',can_write AND NOT p.archived AND src IS NOT NULL);
END;$fn$;
CREATE FUNCTION public.uc_copy_registry_history_json(p public.uc_copy_registry_history) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $fn$
 SELECT jsonb_build_object('id',p.id,'record_id',p.record_id,'revision',p.revision,'action',p.action,'reason',p.reason,'snapshot',p.snapshot,'recorded_at',p.recorded_at,'recorded_by',p.recorded_by,'recorded_by_label',public.uc_copy_registry_label(p.recorded_by)) $fn$;
CREATE FUNCTION public.uc_copy_registry_export_summary(p public.uc_copy_registry_exports) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog SET TimeZone='UTC' AS $fn$
 SELECT jsonb_build_object('id',p.id,'registry_revision',p.registry_revision,'created_at',p.created_at,'created_by',p.created_by,'record_count',p.record_count,'history_count',p.history_count,'manifest_bytes',p.manifest_bytes,'manifest_sha256',p.manifest_sha256,'html_bytes',p.html_bytes,'html_sha256',p.html_sha256) $fn$;
CREATE FUNCTION public.uc_copy_registry_import_json(p public.uc_copy_registry_imports,p_full boolean DEFAULT true) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog SET TimeZone='UTC' AS $fn$
 SELECT jsonb_build_object('id',p.id,'source_sha256',p.source_sha256,'preview_hash',p.preview_hash,'registry_revision',p.registry_revision,'status',p.status,'created_at',p.created_at,'row_count',jsonb_array_length(p.rows))||CASE WHEN p_full THEN jsonb_build_object('source_raw',p.source_raw,'rows',p.rows,'report',p.report) ELSE jsonb_build_object('report_counts',CASE WHEN p.report IS NULL THEN NULL ELSE p.report- 'decisions'END)END $fn$;

CREATE FUNCTION public.uc_copy_registry_original_ref(p public.org_document_versions) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog SET TimeZone='UTC' AS $fn$
 SELECT jsonb_build_object('kind','org_document_version','document_id',p.document_id,'version_id',p.id,'content_hash',public.uc_copy_registry_hash(jsonb_build_object('document_id',p.document_id,'version_id',p.id,'version_number',p.version_number,'file_path',p.file_path,'file_size',p.file_size,'file_name',p.file_name,'storage_object_id',p.storage_object_id,'storage_metadata',p.storage_metadata,'document_metadata',p.document_metadata)::text)) $fn$;
CREATE FUNCTION public.read_copy_registry(p_org uuid,p_scope jsonb,p_query jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $fn$
DECLARE g uuid;kind text;lim integer;after_id uuid;record_id uuid;after_revision bigint;items jsonb:='[]';people uuid[]:='{}';row public.uc_copy_registry_records;h public.uc_copy_registry_history;v public.org_document_versions;imp public.uc_copy_registry_imports;ex public.uc_copy_registry_exports;obj jsonb;result jsonb;base jsonb;more boolean:=false;last_id uuid;last_revision bigint;src jsonb;who uuid;label text;ctx jsonb;
BEGIN
 g:=public.uc_copy_registry_scope(p_org,p_scope,false);PERFORM public.uc_copy_registry_fence(p_org,g,'{}',false,NULL);base:=public.uc_copy_registry_base(p_org,p_scope);
 IF jsonb_typeof(p_query) IS DISTINCT FROM'object' OR octet_length(p_query::text)>4096 THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;kind:=p_query->>'kind';ctx:=jsonb_build_object('kind',CASE WHEN g IS NULL THEN'organization'ELSE'group'END,'group_id',g);
 IF kind IN('list','originals','people','imports','exports') THEN
  IF NOT public.uc_custom_journal_shape(p_query,CASE WHEN kind='list'THEN ARRAY['kind','after_id','limit','archived']ELSE ARRAY['kind','after_id','limit']END) OR NOT(p_query->'after_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'after_id')) OR jsonb_typeof(p_query->'limit') IS DISTINCT FROM'number' OR(p_query->>'limit')!~'^[1-9][0-9]{0,2}$' THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;lim:=(p_query->>'limit')::integer;IF lim>100 THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;after_id:=(p_query->>'after_id')::uuid;
  IF kind='list' THEN
   IF jsonb_typeof(p_query->'archived') IS DISTINCT FROM'boolean' THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;
   FOR row IN SELECT r.* FROM public.uc_copy_registry_records r WHERE r.organization_id=p_org AND NOT r.redacted AND public.uc_copy_registry_visible(g,r.group_id) AND((p_query->>'archived')::boolean OR NOT r.archived) AND(after_id IS NULL OR r.id>after_id) ORDER BY r.id LIMIT lim+1 LOOP
    IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;items:=items||jsonb_build_array(public.uc_copy_registry_record_json(row));people:=people||row.participant_ids;last_id:=row.id;END LOOP;result:=jsonb_build_object('records',items);
  ELSIF kind='originals' THEN
   IF public.uc_copy_registry_file_permission(p_org) THEN
    FOR v IN SELECT x.* FROM public.org_document_versions x JOIN public.org_documents d ON d.id=x.document_id AND d.organization_id=x.organization_id WHERE x.organization_id=p_org AND d.deleted_at IS NULL AND coalesce(to_jsonb(d)->>'status','active') NOT IN('archived','expired') AND(after_id IS NULL OR x.id>after_id) AND public.uc_copy_registry_object_matches(x) AND(x.uploaded_by IS NULL OR public.uc_custom_journal_person(x.uploaded_by)) ORDER BY x.id LIMIT lim+1 LOOP
     IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;obj:=public.uc_copy_registry_original_ref(v);src:=public.uc_copy_registry_source(p_org,obj,false,false);IF src IS NULL THEN CONTINUE;END IF;items:=items||jsonb_build_array(jsonb_build_object('label',src->'label','original',obj));people:=array_append(people,v.uploaded_by);last_id:=v.id;END LOOP;END IF;result:=jsonb_build_object('originals',items);
  ELSIF kind='people' THEN
   FOR who IN WITH candidates AS(SELECT p.user_id FROM public.profiles p WHERE p.organization_id=p_org UNION SELECT s.user_id FROM public.org_staff s WHERE s.organization_id=p_org AND(s.expires_at IS NULL OR s.expires_at>now()) UNION SELECT e.user_id FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE c.organization_id=p_org AND e.status NOT IN('cancelled','revoked'))SELECT user_id FROM candidates WHERE(after_id IS NULL OR user_id>after_id) AND public.uc_scoped_journal_subject(p_org,ctx,user_id) ORDER BY user_id LIMIT lim+1 LOOP
    IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;items:=items||jsonb_build_array(jsonb_build_object('user_id',who,'label',coalesce(public.uc_copy_registry_label(who),'Участник')));people:=array_append(people,who);last_id:=who;END LOOP;result:=jsonb_build_object('people',items);
  ELSIF kind='imports' THEN
   IF g IS NOT NULL THEN PERFORM public.uc_copy_registry_error('ACCESS_DENIED');END IF;FOR imp IN SELECT i.* FROM public.uc_copy_registry_imports i WHERE i.organization_id=p_org AND(after_id IS NULL OR i.id>after_id) ORDER BY i.id LIMIT lim+1 LOOP
    IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;items:=items||jsonb_build_array(public.uc_copy_registry_import_json(imp,false));people:=people||imp.participant_ids;last_id:=imp.id;END LOOP;result:=jsonb_build_object('imports',items);
  ELSE
   FOR ex IN SELECT e.* FROM public.uc_copy_registry_exports e WHERE e.organization_id=p_org AND(g IS NULL OR e.scope=p_scope) AND(after_id IS NULL OR e.id>after_id) ORDER BY e.id LIMIT lim+1 LOOP
    IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;items:=items||jsonb_build_array(public.uc_copy_registry_export_summary(ex));people:=people||ex.participant_ids;last_id:=ex.id;END LOOP;result:=jsonb_build_object('exports',items);
  END IF;result:=result||jsonb_build_object('next_after_id',CASE WHEN more THEN last_id ELSE NULL END);
 ELSIF kind IN('detail','history') THEN
  IF NOT public.uc_custom_journal_uuid(p_query->'record_id') OR NOT public.uc_custom_journal_shape(p_query,CASE WHEN kind='detail'THEN ARRAY['kind','record_id']ELSE ARRAY['kind','record_id','after_revision','limit']END) THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;record_id:=(p_query->>'record_id')::uuid;SELECT r.* INTO row FROM public.uc_copy_registry_records r WHERE r.id=record_id AND r.organization_id=p_org AND NOT r.redacted AND public.uc_copy_registry_visible(g,r.group_id);IF row.id IS NULL THEN PERFORM public.uc_copy_registry_error('NOT_FOUND');END IF;people:=row.participant_ids;
  IF kind='detail' THEN result:=jsonb_build_object('record',public.uc_copy_registry_record_json(row));
  ELSE
   IF NOT(p_query->'after_revision'='null'::jsonb OR(jsonb_typeof(p_query->'after_revision')='number'AND(p_query->>'after_revision')~'^(0|[1-9][0-9]{0,14})$')) OR jsonb_typeof(p_query->'limit') IS DISTINCT FROM'number' OR(p_query->>'limit')!~'^[1-9][0-9]{0,2}$'THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;after_revision:=(p_query->>'after_revision')::bigint;lim:=(p_query->>'limit')::integer;IF lim>100 THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;
   FOR h IN SELECT x.* FROM public.uc_copy_registry_history x WHERE x.record_id=row.id AND x.organization_id=p_org AND NOT x.redacted AND(after_revision IS NULL OR x.revision>after_revision) ORDER BY x.revision LIMIT lim+1 LOOP
    IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;items:=items||jsonb_build_array(public.uc_copy_registry_history_json(h));people:=people||h.participant_ids;last_revision:=h.revision;END LOOP;result:=jsonb_build_object('history',items,'next_after_revision',CASE WHEN more THEN last_revision ELSE NULL END);
  END IF;
 ELSIF kind='import' THEN
  IF g IS NOT NULL THEN PERFORM public.uc_copy_registry_error('ACCESS_DENIED');END IF;IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','import_id']) OR NOT public.uc_custom_journal_uuid(p_query->'import_id') THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;SELECT i.* INTO imp FROM public.uc_copy_registry_imports i WHERE i.id=(p_query->>'import_id')::uuid AND i.organization_id=p_org;IF imp.id IS NULL THEN PERFORM public.uc_copy_registry_error('NOT_FOUND');END IF;people:=imp.participant_ids;result:=jsonb_build_object('import',public.uc_copy_registry_import_json(imp,true));
 ELSIF kind='export' THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','export_id']) OR NOT public.uc_custom_journal_uuid(p_query->'export_id') THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;SELECT e.* INTO ex FROM public.uc_copy_registry_exports e WHERE e.id=(p_query->>'export_id')::uuid AND e.organization_id=p_org AND(g IS NULL OR e.scope=p_scope);IF ex.id IS NULL THEN PERFORM public.uc_copy_registry_error('NOT_FOUND');END IF;people:=ex.participant_ids;
  IF public.uc_copy_registry_hash(ex.manifest_json)<>ex.manifest_sha256 OR public.uc_copy_registry_hash(ex.html)<>ex.html_sha256 THEN PERFORM public.uc_copy_registry_error('DEPENDENCY_UNAVAILABLE');END IF;result:=jsonb_build_object('export',public.uc_copy_registry_export_summary(ex)||jsonb_build_object('manifest_json',ex.manifest_json,'html',ex.html));
 ELSE PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;
 PERFORM public.uc_copy_registry_fence(p_org,g,ARRAY(SELECT DISTINCT x FROM unnest(people)x WHERE x IS NOT NULL),false,NULL);RETURN base||jsonb_build_object('kind',kind)||result;
EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_copy_registry_error('REVISION_CONFLICT');END;$fn$;


CREATE FUNCTION public.uc_copy_registry_preview(p_org uuid,p_raw text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE source jsonb;r jsonb;candidate jsonb;rows jsonb:='[]';conflicts jsonb;unknown jsonb;digest text;legacy text;existing uuid;idx integer:=0;valid boolean;reason text;rawsha text:=public.uc_copy_registry_hash(p_raw);
BEGIN
 IF p_raw IS NULL OR octet_length(p_raw)>2097152 THEN PERFORM public.uc_copy_registry_error('LIMIT_EXCEEDED');END IF;
 BEGIN source:=p_raw::jsonb;EXCEPTION WHEN invalid_text_representation THEN RETURN jsonb_build_array(jsonb_build_object('index',0,'source_digest',rawsha,'legacy_id',NULL,'conflicts',jsonb_build_array('INVALID_JSON'),'valid',false,'existing_id',NULL,'candidate',NULL,'unknown_fields','[]'::jsonb));WHEN untranslatable_character OR numeric_value_out_of_range THEN RETURN jsonb_build_array(jsonb_build_object('index',0,'source_digest',rawsha,'legacy_id',NULL,'conflicts',jsonb_build_array('UNSUPPORTED_FORMAT'),'valid',false,'existing_id',NULL,'candidate',NULL,'unknown_fields','[]'::jsonb));END;
 IF jsonb_typeof(source) IS DISTINCT FROM'array' THEN RETURN jsonb_build_array(jsonb_build_object('index',0,'source_digest',rawsha,'legacy_id',NULL,'conflicts',jsonb_build_array('UNSUPPORTED_FORMAT'),'valid',false,'existing_id',NULL,'candidate',NULL,'unknown_fields','[]'::jsonb));END IF;
 IF jsonb_array_length(source)>1000 THEN PERFORM public.uc_copy_registry_error('LIMIT_EXCEEDED');END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(source) LOOP
  conflicts:='[]';unknown:='[]';candidate:=NULL;existing:=NULL;legacy:=NULL;digest:=public.uc_copy_registry_hash(r::text);valid:=true;
  IF jsonb_typeof(r)='object' THEN
   IF public.uc_custom_journal_text(r->'id',120) THEN legacy:=r->>'id';END IF;
   SELECT coalesce(jsonb_agg(k ORDER BY k),'[]') INTO unknown FROM jsonb_object_keys(r)k WHERE k<>ALL(ARRAY['id','reg_number','recipient_name','original_document_type','original_document_number','original_issue_date','copy_type','issue_date','issue_reason','notes']);
   IF jsonb_array_length(unknown)>0 THEN conflicts:=conflicts||jsonb_build_array('UNKNOWN_FIELDS');END IF;
   IF jsonb_array_length(unknown)>1000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(unknown)k WHERE NOT public.uc_custom_journal_text(k.value,1000,true))THEN valid:=false;unknown:='[]';conflicts:=conflicts||jsonb_build_array('UNKNOWN_FIELD_LIMIT_EXCEEDED');END IF;
   IF legacy IS NOT NULL AND(SELECT count(*)FROM jsonb_array_elements(source)x WHERE x.value->>'id'=legacy)>1 THEN conflicts:=conflicts||jsonb_build_array('DUPLICATE_LOCAL_ID');END IF;
   IF NOT valid OR NOT coalesce(r->>'copy_type' IN('copy','duplicate'),false) OR NOT public.uc_custom_journal_text(r->'reg_number',120) OR NOT public.uc_custom_journal_text(r->'recipient_name',300) OR NOT public.uc_custom_journal_text(r->'original_document_type',100) OR NOT public.uc_custom_journal_text(r->'original_document_number',120) OR NOT public.uc_custom_journal_text(r->'original_issue_date',80) OR NOT public.uc_custom_journal_text(r->'issue_date',80) OR NOT public.uc_copy_registry_date(to_jsonb(left(r->>'issue_date',10))) OR NOT(r->'notes'='null'::jsonb OR public.uc_custom_journal_text(r->'notes',4000,true)) OR NOT public.uc_custom_journal_text(r->'issue_reason',100) THEN valid:=false;
   ELSE
    reason:=CASE WHEN r->>'issue_reason' IN('lost','damaged','name_change','employer_request','archive','other')THEN r->>'issue_reason'ELSE'other'END;
    candidate:=jsonb_build_object('copy_type',r->'copy_type','declared_number',r->'reg_number','document_date',left(r->>'issue_date',10),
     'original',jsonb_build_object('kind','unresolved','document_type',r->'original_document_type','document_number',r->'original_document_number','issue_date',r->'original_issue_date','explanation','Непроверенное историческое утверждение из сохранённого браузерного журнала; связь с оригиналом не установлена.'),
     'subject',jsonb_build_object('kind','none'),'recipient',jsonb_build_object('kind','external','name',r->'recipient_name','capacity','other'),
     'basis',jsonb_build_object('reason',reason,'note','Основание из исторической записи: '||(r->>'issue_reason')||'. Документальное подтверждение не проверено.','evidence',NULL),'notes',coalesce(r->>'notes',''));
    conflicts:=conflicts||jsonb_build_array('UNRESOLVED_ORIGINAL','UNRESOLVED_RECIPIENT');
    IF(SELECT count(DISTINCT public.uc_copy_registry_hash(x.value::text)) FROM jsonb_array_elements(source)x WHERE x.value->>'reg_number'=r->>'reg_number' AND left(x.value->>'issue_date',4)=left(r->>'issue_date',4))>1 THEN conflicts:=conflicts||jsonb_build_array('NUMBER_CLAIM_CONFLICT');END IF;
    IF EXISTS(SELECT 1 FROM public.uc_copy_registry_records x WHERE x.organization_id=p_org AND NOT x.redacted AND x.data->>'declared_number'=r->>'reg_number' AND left(x.data->>'document_date',4)=left(r->>'issue_date',4) AND x.import_source_digest IS DISTINCT FROM digest) THEN conflicts:=conflicts||jsonb_build_array('NUMBER_CLAIM_CONFLICT');END IF;
   END IF;
  ELSE valid:=false;END IF;
  SELECT x.id INTO existing FROM public.uc_copy_registry_records x WHERE x.organization_id=p_org AND x.import_source_digest=digest AND NOT x.redacted;IF existing IS NOT NULL THEN conflicts:=conflicts||jsonb_build_array('ALREADY_IMPORTED');END IF;
  IF NOT valid THEN candidate:=NULL;conflicts:=conflicts||jsonb_build_array('INVALID_ROW');END IF;
  rows:=rows||jsonb_build_array(jsonb_build_object('index',idx,'source_digest',digest,'legacy_id',legacy,'conflicts',conflicts,'valid',valid,'existing_id',existing,'candidate',candidate,'unknown_fields',unknown));idx:=idx+1;
 END LOOP;RETURN rows;END;$fn$;
CREATE FUNCTION public.uc_copy_registry_new(p_org uuid,p_group uuid,p_data jsonb,p_people uuid[],p_kind text,p_reason text,p_import_digest text DEFAULT NULL) RETURNS public.uc_copy_registry_records LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $fn$
DECLARE r public.uc_copy_registry_records;y integer:=extract(year FROM timezone('Europe/Moscow',clock_timestamp()))::integer;n bigint;
BEGIN
 INSERT INTO public.uc_copy_registry_counters(organization_id,copy_type,sequence_year,last_number)VALUES(p_org,p_data->>'copy_type',y,1)ON CONFLICT(organization_id,copy_type,sequence_year)DO UPDATE SET last_number=uc_copy_registry_counters.last_number+1 RETURNING last_number INTO n;
 INSERT INTO public.uc_copy_registry_records(organization_id,group_id,registration_id,copy_type,sequence_year,sequence_number,data,participant_ids,registered_by,updated_by,import_source_digest)VALUES(p_org,p_group,(CASE WHEN p_data->>'copy_type'='copy'THEN'КОП'ELSE'ДУБ'END)||'-'||y||'/'||lpad(n::text,6,'0'),p_data->>'copy_type',y,n,p_data,ARRAY(SELECT DISTINCT x FROM unnest(array_append(p_people,auth.uid()))x WHERE x IS NOT NULL ORDER BY x),auth.uid(),auth.uid(),p_import_digest)RETURNING*INTO r;
 INSERT INTO public.uc_copy_registry_history(organization_id,record_id,revision,action,reason,snapshot,participant_ids,recorded_by)VALUES(p_org,r.id,r.revision,p_kind,p_reason,jsonb_build_object('data',r.data,'archived',false,'latest_transfer',NULL),r.participant_ids,auth.uid());RETURN r;END;$fn$;
CREATE FUNCTION public.uc_copy_registry_escape(p text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT replace(replace(replace(replace(replace(coalesce(p,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),chr(39),'&#39;') $fn$;

CREATE FUNCTION public.uc_copy_registry_html_data(p_data jsonb,p_transfer jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE original text;recipient text;basis text;transfer text;BEGIN
 original:=CASE WHEN p_data->'original'->>'kind'='unresolved' THEN'Историческое утверждение, не проверено: '||(p_data->'original'->>'document_type')||' №'||(p_data->'original'->>'document_number')||' от '||(p_data->'original'->>'issue_date')||'. '||(p_data->'original'->>'explanation')ELSE'Связь с файлом: '||(p_data->'original'->>'document_id')||'; версия '||(p_data->'original'->>'version_id')END;
 recipient:=CASE WHEN p_data->'recipient'->>'kind'='external'THEN(p_data->'recipient'->>'name')||' (заявленный получатель)'ELSE'Участник '||(p_data->'recipient'->>'user_id')END;basis:=(p_data->'basis'->>'reason')||': '||(p_data->'basis'->>'note');
 transfer:=CASE WHEN p_transfer IS NULL OR p_transfer='null'::jsonb THEN'Передача не зарегистрирована'ELSE'Заявленная дата: '||(p_transfer->>'reported_date')||'; способ: '||(p_transfer->>'method')||'; '||(p_transfer->>'note')||'. Внесено: '||(p_transfer->>'recorded_at')END;
 RETURN'<dl><dt>Получатель</dt><dd>'||public.uc_copy_registry_escape(recipient)||'</dd><dt>Оригинал</dt><dd>'||public.uc_copy_registry_escape(original)||'</dd><dt>Заявленный номер</dt><dd>'||public.uc_copy_registry_escape(coalesce(p_data->>'declared_number','—'))||'</dd><dt>Заявленная дата документа</dt><dd>'||public.uc_copy_registry_escape(p_data->>'document_date')||'</dd><dt>Основание</dt><dd>'||public.uc_copy_registry_escape(basis)||'</dd><dt>Передача</dt><dd>'||public.uc_copy_registry_escape(transfer)||'</dd><dt>Примечание</dt><dd>'||public.uc_copy_registry_escape(p_data->>'notes')||'</dd></dl>';END;$fn$;
CREATE FUNCTION public.uc_copy_registry_html(p_manifest jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE html text;r jsonb;h jsonb;original text;transfer text;BEGIN
 html:='<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Реестр копий и дубликатов</title><style>body{font:14px system-ui;margin:28px;color:#182433}h1{font-size:24px}h2{margin-top:32px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cbd5e1;padding:8px;vertical-align:top;text-align:left;overflow-wrap:anywhere}th{background:#f1f5f9}dl{margin:0}dt{font-weight:600;margin-top:5px}dd{margin:0 0 5px}.muted{color:#536477}@media print{thead{display:table-header-group}tr{break-inside:avoid}body{margin:10mm}}</style></head><body><h1>Реестр копий и дубликатов</h1><p class="muted">Внутренний учёт. Этот снимок не подтверждает официальную выдачу или подпись. Заявленные исторические даты и основания приведены как сведения оператора.</p><p>Снимок: '||public.uc_copy_registry_escape(p_manifest->>'captured_at')||'. Записей: '||(p_manifest->'counts'->>'records')||'; версий истории: '||(p_manifest->'counts'->>'history')||'.</p><table><thead><tr><th>Внутренний № / вид</th><th>Получатель / дата</th><th>Оригинал, основание и передача</th><th>Учёт</th></tr></thead><tbody>';
 FOR r IN SELECT value FROM jsonb_array_elements(p_manifest->'records')LOOP
  html:=html||'<tr data-record-id="'||public.uc_copy_registry_escape(r->>'id')||'"><td>'||public.uc_copy_registry_escape(r->>'registration_id')||'<br>'||CASE WHEN r->'data'->>'copy_type'='copy'THEN'Копия'ELSE'Дубликат'END||'</td><td>'||public.uc_copy_registry_escape(r->>'recipient_label')||'<br>'||public.uc_copy_registry_escape(r->'data'->>'document_date')||'</td><td>'||public.uc_copy_registry_html_data(r->'data',r->'latest_transfer')||'</td><td>Ревизия '||public.uc_copy_registry_escape(r->>'revision')||CASE WHEN(r->>'archived')::boolean THEN'; в архиве'ELSE'; активна'END||'<br>Внёс: '||public.uc_copy_registry_escape(coalesce(r->>'recorded_by_label','Сотрудник'))||'<br>'||public.uc_copy_registry_escape(r->>'registered_at')||'</td></tr>';
 END LOOP;html:=html||'</tbody></table><h2>История изменений</h2><table><thead><tr><th>Запись / ревизия</th><th>Действие / основание</th><th>Сохранённое содержание</th><th>Кто и когда внёс</th></tr></thead><tbody>';
 FOR h IN SELECT value FROM jsonb_array_elements(p_manifest->'history')LOOP
  html:=html||'<tr data-history-id="'||public.uc_copy_registry_escape(h->>'id')||'"><td>'||public.uc_copy_registry_escape(h->>'record_id')||'<br>Ревизия '||public.uc_copy_registry_escape(h->>'revision')||'</td><td>'||public.uc_copy_registry_escape(CASE h->>'action'WHEN'create'THEN'Регистрация'WHEN'import'THEN'Импорт исторической записи'WHEN'update'THEN'Исправление'WHEN'transfer'THEN'Запись о передаче'ELSE'Архивирование'END)||'<br>'||public.uc_copy_registry_escape(h->>'reason')||'</td><td>'||public.uc_copy_registry_html_data(h->'snapshot'->'data',h->'snapshot'->'latest_transfer')||'</td><td>'||public.uc_copy_registry_escape(coalesce(h->>'recorded_by_label','Сотрудник'))||'<br>'||public.uc_copy_registry_escape(h->>'recorded_at')||'</td></tr>';
 END LOOP;RETURN html||'</tbody></table><p class="muted">Полный технический снимок, ссылки и контрольные суммы сохранены в отдельном JSON-файле. Названия и пути закрытых файлов в этот снимок не включаются.</p></body></html>';END;$fn$;

CREATE FUNCTION public.apply_copy_registry_action(p_org uuid,p_scope jsonb,p_expected_revision bigint,p_request_id uuid,p_action jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $fn$
<<registry_apply>>
DECLARE g uuid;op text;head_revision bigint;payload_hash text;oldreq public.uc_copy_registry_requests;row public.uc_copy_registry_records;imp public.uc_copy_registry_imports;ex public.uc_copy_registry_exports;people uuid[]:='{}';more_people uuid[];data jsonb;reason text;transfer jsonb;result jsonb;rows jsonb;obj jsonb;decision jsonb;decisions jsonb;preview_hash text;source_sha text;imported integer:=0;reused integer:=0;skipped integer:=0;newrow public.uc_copy_registry_records;record_items jsonb:='[]';history_items jsonb:='[]';h public.uc_copy_registry_history;manifest jsonb;manifest_text text;html text;captured timestamptz;src jsonb;idx integer;choice text;
BEGIN
 op:=p_action->>'action';g:=public.uc_copy_registry_scope(p_org,p_scope,op IS DISTINCT FROM'capture_export');IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>9007199254740991 OR p_request_id IS NULL OR jsonb_typeof(p_action) IS DISTINCT FROM'object' OR octet_length(p_action::text)>8388608 THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;
 PERFORM public.uc_copy_registry_fence(p_org,g,'{}',(op IS DISTINCT FROM'capture_export'),p_request_id);INSERT INTO public.uc_copy_registry_heads(organization_id)VALUES(p_org)ON CONFLICT DO NOTHING;SELECT revision INTO head_revision FROM public.uc_copy_registry_heads WHERE organization_id=p_org FOR UPDATE NOWAIT;
 payload_hash:=public.uc_copy_registry_hash(jsonb_build_object('organization_id',p_org,'scope',p_scope,'expected_revision',p_expected_revision,'action',p_action)::text);
 SELECT q.* INTO oldreq FROM public.uc_copy_registry_requests q WHERE q.actor_id=auth.uid() AND q.request_id=p_request_id;
 IF oldreq.request_id IS NOT NULL THEN
  IF oldreq.organization_id<>p_org OR oldreq.scope<>p_scope OR oldreq.payload_hash<>payload_hash THEN PERFORM public.uc_copy_registry_error('REQUEST_MISMATCH');END IF;PERFORM public.uc_copy_registry_fence(p_org,g,oldreq.participant_ids,(op IS DISTINCT FROM'capture_export'),p_request_id);result:=oldreq.result;
  -- Cached operation facts stay fixed; current file access never comes from a stale response.
  IF result?'record' THEN src:=public.uc_copy_registry_source(p_org,result->'record'->'data'->'original',true,false);result:=jsonb_set(result,'{record,original_label}',coalesce(src->'label','null'));result:=jsonb_set(result,'{record,original_available}',to_jsonb(src IS NOT NULL AND coalesce((src->>'verified')::boolean,false)));END IF;
  RETURN public.uc_copy_registry_base(p_org,p_scope)||result||jsonb_build_object('request_id',p_request_id,'replayed',true);
 END IF;
 op:=p_action->>'action';people:=ARRAY[auth.uid()];
 IF op='create' THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','data']) OR p_expected_revision<>0 THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;data:=p_action->'data';people:=people||public.uc_copy_registry_data(p_org,g,data,false);PERFORM public.uc_copy_registry_fence(p_org,g,people,(op IS DISTINCT FROM'capture_export'),p_request_id);PERFORM public.uc_copy_registry_data(p_org,g,data,false);row:=public.uc_copy_registry_new(p_org,g,data,people,'create',data->'basis'->>'note',NULL);result:=jsonb_build_object('record',public.uc_copy_registry_record_json(row));
 ELSIF op IN('update','archive','transfer') THEN
  IF NOT public.uc_custom_journal_shape(p_action,CASE op WHEN'update'THEN ARRAY['action','record_id','data','reason'] WHEN'transfer'THEN ARRAY['action','record_id','transfer','reason']ELSE ARRAY['action','record_id','reason']END) OR NOT public.uc_custom_journal_uuid(p_action->'record_id') OR NOT public.uc_custom_journal_text(p_action->'reason',2000) THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;
  SELECT r.* INTO row FROM public.uc_copy_registry_records r WHERE r.id=(p_action->>'record_id')::uuid AND r.organization_id=p_org AND NOT r.redacted AND public.uc_copy_registry_visible(g,r.group_id) FOR UPDATE NOWAIT;IF row.id IS NULL THEN PERFORM public.uc_copy_registry_error('NOT_FOUND');END IF;
  IF row.revision<>p_expected_revision THEN PERFORM public.uc_copy_registry_error('REVISION_CONFLICT');END IF;IF row.archived THEN PERFORM public.uc_copy_registry_error('SOURCE_UNAVAILABLE');END IF;reason:=p_action->>'reason';people:=people||row.participant_ids;data:=row.data;transfer:=row.latest_transfer;
  IF op='update' THEN data:=p_action->'data';IF data->>'copy_type' IS DISTINCT FROM row.copy_type THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;people:=people||public.uc_copy_registry_data(p_org,row.group_id,data,row.import_source_digest IS NOT NULL);
  ELSIF op='transfer' THEN
   people:=people||public.uc_copy_registry_data(p_org,row.group_id,data,row.import_source_digest IS NOT NULL);transfer:=p_action->'transfer';
   IF NOT public.uc_custom_journal_shape(transfer,ARRAY['method','reported_date','note','evidence']) OR NOT coalesce(transfer->>'method' IN('in_person','mail','electronic','other'),false) OR NOT public.uc_copy_registry_date(transfer->'reported_date') OR(transfer->>'reported_date')::date>timezone('Europe/Moscow',clock_timestamp())::date OR NOT public.uc_custom_journal_text(transfer->'note',2000) THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;
   IF transfer->'evidence'<>'null'::jsonb THEN src:=public.uc_copy_registry_source(p_org,transfer->'evidence',false,true);people:=people||ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(src->'participants')x);END IF;transfer:=transfer||jsonb_build_object('recorded_at',clock_timestamp(),'recorded_by',auth.uid());
  END IF;
  people:=ARRAY(SELECT DISTINCT x FROM unnest(people)x WHERE x IS NOT NULL ORDER BY x);PERFORM public.uc_copy_registry_fence(p_org,g,people,(op IS DISTINCT FROM'capture_export'),p_request_id);
  IF op<>'archive' THEN PERFORM public.uc_copy_registry_data(p_org,row.group_id,data,row.import_source_digest IS NOT NULL);END IF;
  UPDATE public.uc_copy_registry_records SET data=registry_apply.data,latest_transfer=transfer,participant_ids=people,revision=row.revision+1,archived=(op='archive'),updated_by=auth.uid(),updated_at=clock_timestamp() WHERE id=row.id RETURNING*INTO row;
  INSERT INTO public.uc_copy_registry_history(organization_id,record_id,revision,action,reason,snapshot,participant_ids,recorded_by)VALUES(p_org,row.id,row.revision,op,reason,jsonb_build_object('data',row.data,'archived',row.archived,'latest_transfer',row.latest_transfer),people,auth.uid());result:=jsonb_build_object('record',public.uc_copy_registry_record_json(row));
 ELSIF op='preview_import' THEN
  IF g IS NOT NULL THEN PERFORM public.uc_copy_registry_error('ACCESS_DENIED');END IF;IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','source_raw','source_sha256']) OR p_expected_revision<>0 OR jsonb_typeof(p_action->'source_raw') IS DISTINCT FROM'string' OR coalesce(p_action->>'source_sha256','')!~'^[a-f0-9]{64}$' THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;
  source_sha:=public.uc_copy_registry_hash(p_action->>'source_raw');IF source_sha<>p_action->>'source_sha256' THEN PERFORM public.uc_copy_registry_error('IMPORT_CONFLICT');END IF;rows:=public.uc_copy_registry_preview(p_org,p_action->>'source_raw');preview_hash:=public.uc_copy_registry_hash(jsonb_build_object('source_sha256',source_sha,'registry_revision',head_revision,'rows',rows)::text);
  INSERT INTO public.uc_copy_registry_imports(organization_id,created_by,source_raw,source_sha256,preview_hash,registry_revision,status,rows,participant_ids)VALUES(p_org,auth.uid(),p_action->>'source_raw',source_sha,preview_hash,head_revision,'preview',rows,people)RETURNING*INTO imp;result:=jsonb_build_object('import',public.uc_copy_registry_import_json(imp,true));
 ELSIF op='apply_import' THEN
  IF g IS NOT NULL THEN PERFORM public.uc_copy_registry_error('ACCESS_DENIED');END IF;IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','import_id','source_sha256','preview_hash','decisions']) OR NOT public.uc_custom_journal_uuid(p_action->'import_id') OR coalesce(p_action->>'source_sha256','')!~'^[a-f0-9]{64}$' OR coalesce(p_action->>'preview_hash','')!~'^[a-f0-9]{64}$' OR jsonb_typeof(p_action->'decisions') IS DISTINCT FROM'array' THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;
  SELECT i.* INTO imp FROM public.uc_copy_registry_imports i WHERE i.id=(p_action->>'import_id')::uuid AND i.organization_id=p_org FOR UPDATE NOWAIT;IF imp.id IS NULL THEN PERFORM public.uc_copy_registry_error('NOT_FOUND');END IF;
  IF imp.source_sha256<>p_action->>'source_sha256' OR imp.preview_hash<>p_action->>'preview_hash' OR public.uc_copy_registry_hash(imp.source_raw)<>imp.source_sha256 THEN PERFORM public.uc_copy_registry_error('IMPORT_CONFLICT');END IF;
  IF imp.status='applied' THEN
   IF imp.report->'decisions' IS DISTINCT FROM p_action->'decisions' THEN PERFORM public.uc_copy_registry_error('IMPORT_CONFLICT');END IF;PERFORM public.uc_copy_registry_fence(p_org,g,imp.participant_ids,(op IS DISTINCT FROM'capture_export'),p_request_id);people:=people||imp.participant_ids;result:=jsonb_build_object('import',public.uc_copy_registry_import_json(imp,true));
  ELSE
   IF head_revision<>p_expected_revision OR imp.registry_revision<>head_revision THEN PERFORM public.uc_copy_registry_error('REVISION_CONFLICT');END IF;decisions:=p_action->'decisions';IF jsonb_array_length(decisions)<>jsonb_array_length(imp.rows) THEN PERFORM public.uc_copy_registry_error('IMPORT_CONFLICT');END IF;people:=people||imp.participant_ids;
   -- Validate every explicit decision before allocating any number or writing any record.
   FOR obj IN SELECT value FROM jsonb_array_elements(imp.rows) LOOP
    idx:=(obj->>'index')::integer;IF(SELECT count(*)FROM jsonb_array_elements(decisions)d WHERE jsonb_typeof(d.value->'index')='number' AND d.value->>'index'=idx::text)<>1 THEN PERFORM public.uc_copy_registry_error('IMPORT_CONFLICT');END IF;SELECT d.value INTO decision FROM jsonb_array_elements(decisions)d WHERE d.value->>'index'=idx::text;
    IF NOT public.uc_custom_journal_shape(decision,ARRAY['index','choice','reason','existing_id']) OR NOT public.uc_custom_journal_text(decision->'reason',2000) OR NOT coalesce(decision->>'choice'IN('import','skip','reuse'),false) OR NOT(decision->'existing_id'='null'::jsonb OR public.uc_custom_journal_uuid(decision->'existing_id'))THEN PERFORM public.uc_copy_registry_error('IMPORT_CONFLICT');END IF;choice:=decision->>'choice';
    IF choice='import' THEN
     IF(obj->>'valid')::boolean IS NOT TRUE OR obj->'candidate'='null'::jsonb OR obj->'existing_id'<>'null'::jsonb OR decision->'existing_id'<>'null'::jsonb OR EXISTS(SELECT 1 FROM public.uc_copy_registry_records r WHERE r.organization_id=p_org AND r.import_source_digest=obj->>'source_digest') THEN PERFORM public.uc_copy_registry_error('IMPORT_CONFLICT');END IF;people:=people||public.uc_copy_registry_data(p_org,NULL,obj->'candidate',true);
    ELSIF choice='reuse' THEN
     SELECT r.* INTO newrow FROM public.uc_copy_registry_records r WHERE r.organization_id=p_org AND r.id=(decision->>'existing_id')::uuid AND r.import_source_digest=obj->>'source_digest' AND NOT r.redacted;IF newrow.id IS NULL THEN PERFORM public.uc_copy_registry_error('IMPORT_CONFLICT');END IF;people:=people||newrow.participant_ids;
    ELSIF decision->'existing_id'<>'null'::jsonb THEN PERFORM public.uc_copy_registry_error('IMPORT_CONFLICT');END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(imp.rows)r JOIN jsonb_array_elements(decisions)d ON d.value->>'index'=r.value->>'index' WHERE d.value->>'choice'='import' GROUP BY r.value->>'source_digest' HAVING count(*)>1)THEN PERFORM public.uc_copy_registry_error('IMPORT_CONFLICT');END IF;
   people:=ARRAY(SELECT DISTINCT x FROM unnest(people)x WHERE x IS NOT NULL ORDER BY x);PERFORM public.uc_copy_registry_fence(p_org,g,people,(op IS DISTINCT FROM'capture_export'),p_request_id);
   FOR obj IN SELECT value FROM jsonb_array_elements(imp.rows) LOOP
    SELECT d.value INTO decision FROM jsonb_array_elements(decisions)d WHERE d.value->>'index'=obj->>'index';choice:=decision->>'choice';
    IF choice='import' THEN PERFORM public.uc_copy_registry_data(p_org,NULL,obj->'candidate',true);newrow:=public.uc_copy_registry_new(p_org,NULL,obj->'candidate',people,'import',decision->>'reason',obj->>'source_digest');imported:=imported+1;
    ELSIF choice='reuse'THEN reused:=reused+1;ELSE skipped:=skipped+1;END IF;
   END LOOP;
   UPDATE public.uc_copy_registry_imports SET status='applied',report=jsonb_build_object('decisions',decisions,'imported',imported,'reused',reused,'skipped',skipped),participant_ids=people WHERE id=imp.id RETURNING*INTO imp;result:=jsonb_build_object('import',public.uc_copy_registry_import_json(imp,true));
  END IF;
 ELSIF op='capture_export' THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action']) THEN PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;IF head_revision<>p_expected_revision THEN PERFORM public.uc_copy_registry_error('REVISION_CONFLICT');END IF;
  IF(SELECT count(*)FROM public.uc_copy_registry_records r WHERE r.organization_id=p_org AND NOT r.redacted AND public.uc_copy_registry_visible(g,r.group_id))>1000 OR(SELECT count(*)FROM public.uc_copy_registry_history history_row JOIN public.uc_copy_registry_records r ON r.id=history_row.record_id WHERE r.organization_id=p_org AND history_row.organization_id=p_org AND NOT r.redacted AND NOT history_row.redacted AND public.uc_copy_registry_visible(g,r.group_id))>10000 THEN PERFORM public.uc_copy_registry_error('LIMIT_EXCEEDED');END IF;
  FOR row IN SELECT r.* FROM public.uc_copy_registry_records r WHERE r.organization_id=p_org AND NOT r.redacted AND public.uc_copy_registry_visible(g,r.group_id) ORDER BY r.id LOOP
   obj:=public.uc_copy_registry_record_json(row)||jsonb_build_object('original_label',NULL,'original_available',false,'can_edit',false,'can_archive',false,'can_transfer',false);record_items:=record_items||jsonb_build_array(obj);people:=people||row.participant_ids;
  END LOOP;
  FOR h IN SELECT history_row.* FROM public.uc_copy_registry_history history_row JOIN public.uc_copy_registry_records r ON r.id=history_row.record_id WHERE r.organization_id=p_org AND history_row.organization_id=p_org AND NOT r.redacted AND NOT history_row.redacted AND public.uc_copy_registry_visible(g,r.group_id) ORDER BY history_row.record_id,history_row.revision LOOP history_items:=history_items||jsonb_build_array(public.uc_copy_registry_history_json(h));people:=people||h.participant_ids;END LOOP;
  people:=ARRAY(SELECT DISTINCT x FROM unnest(people)x WHERE x IS NOT NULL ORDER BY x);PERFORM public.uc_copy_registry_fence(p_org,g,people,(op IS DISTINCT FROM'capture_export'),p_request_id);captured:=clock_timestamp();manifest:=jsonb_build_object('schema_version',1,'organization_id',p_org,'scope',p_scope,'registry_revision',head_revision,'captured_at',captured,'captured_by',auth.uid(),'records',record_items,'history',history_items,'counts',jsonb_build_object('records',jsonb_array_length(record_items),'history',jsonb_array_length(history_items)));manifest_text:=manifest::text;
  html:=public.uc_copy_registry_html(manifest);
  IF octet_length(manifest_text)+octet_length(html)>8388608 THEN PERFORM public.uc_copy_registry_error('LIMIT_EXCEEDED');END IF;
  INSERT INTO public.uc_copy_registry_exports(organization_id,scope,registry_revision,created_by,created_at,record_count,history_count,manifest_json,manifest_bytes,manifest_sha256,html,html_bytes,html_sha256,participant_ids)VALUES(p_org,p_scope,head_revision,auth.uid(),captured,jsonb_array_length(record_items),jsonb_array_length(history_items),manifest_text,octet_length(manifest_text),public.uc_copy_registry_hash(manifest_text),html,octet_length(html),public.uc_copy_registry_hash(html),people)RETURNING*INTO ex;result:=jsonb_build_object('export',public.uc_copy_registry_export_summary(ex));
 ELSE PERFORM public.uc_copy_registry_error('INVALID_INPUT');END IF;
 IF op IN('create','update','archive','transfer') OR(op='apply_import'AND imported>0)THEN UPDATE public.uc_copy_registry_heads SET revision=revision+1 WHERE organization_id=p_org;END IF;
 people:=ARRAY(SELECT DISTINCT x FROM unnest(people)x WHERE x IS NOT NULL ORDER BY x);result:=jsonb_build_object('kind',op)||result;INSERT INTO public.uc_copy_registry_requests(actor_id,request_id,organization_id,scope,payload_hash,result,participant_ids)VALUES(auth.uid(),p_request_id,p_org,p_scope,payload_hash,result,people);RETURN public.uc_copy_registry_base(p_org,p_scope)||result||jsonb_build_object('request_id',p_request_id,'replayed',false);
EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_copy_registry_error('REVISION_CONFLICT');END;$fn$;

-- SOURCE ONLY proposal; parent integrates after review. No engines/provider execution.
-- Subject identity is ONLY structured current/historical subject/recipient.
-- Actor/uploader membership is NOT evidence that customer document content belongs to that person.
CREATE FUNCTION public.uc_copy_registry_privacy_targets(p_user uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 WITH records AS MATERIALIZED (
  SELECT r.id,r.organization_id,r.import_source_digest FROM public.uc_copy_registry_records r
  WHERE (r.data->'subject'->>'kind'='person' AND r.data->'subject'->>'user_id'=p_user::text)
   OR (r.data->'recipient'->>'kind'='person' AND r.data->'recipient'->>'user_id'=p_user::text)
   OR EXISTS(SELECT 1 FROM public.uc_copy_registry_history h WHERE h.record_id=r.id AND h.organization_id=r.organization_id
    AND ((h.snapshot->'data'->'subject'->>'kind'='person' AND h.snapshot->'data'->'subject'->>'user_id'=p_user::text)
      OR (h.snapshot->'data'->'recipient'->>'kind'='person' AND h.snapshot->'data'->'recipient'->>'user_id'=p_user::text)))
 ), imports AS MATERIALIZED (
  SELECT i.id,i.organization_id FROM public.uc_copy_registry_imports i
  WHERE EXISTS(SELECT 1 FROM records r CROSS JOIN LATERAL jsonb_array_elements(i.rows)x
   WHERE r.organization_id=i.organization_id AND r.import_source_digest IS NOT NULL AND x.value->>'source_digest'=r.import_source_digest)
 ), exports AS MATERIALIZED (
  SELECT e.id,e.organization_id FROM public.uc_copy_registry_exports e
  WHERE e.created_by=p_user OR e.manifest_json::jsonb->>'captured_by'=p_user::text
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(e.manifest_json::jsonb->'records')x
    WHERE x.value->>'recorded_by'=p_user::text OR x.value->>'updated_by'=p_user::text OR x.value->'latest_transfer'->>'recorded_by'=p_user::text
     OR EXISTS(SELECT 1 FROM records r WHERE r.organization_id=e.organization_id AND x.value->>'id'=r.id::text))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(e.manifest_json::jsonb->'history')x
    WHERE x.value->>'recorded_by'=p_user::text OR x.value->'snapshot'->'latest_transfer'->>'recorded_by'=p_user::text)
 ), histories AS MATERIALIZED (
  SELECT h.id FROM public.uc_copy_registry_history h WHERE EXISTS(SELECT 1 FROM records r WHERE r.id=h.record_id AND r.organization_id=h.organization_id)
 ), requests AS MATERIALIZED (
  SELECT q.actor_id,q.request_id FROM public.uc_copy_registry_requests q
  WHERE q.actor_id=p_user OR q.result->'record'->>'recorded_by'=p_user::text OR q.result->'record'->>'updated_by'=p_user::text
   OR q.result->'record'->'latest_transfer'->>'recorded_by'=p_user::text
   OR EXISTS(SELECT 1 FROM records r WHERE r.organization_id=q.organization_id AND q.result->'record'->>'id'=r.id::text)
   OR EXISTS(SELECT 1 FROM imports i WHERE i.organization_id=q.organization_id AND q.result->'import'->>'id'=i.id::text)
   OR EXISTS(SELECT 1 FROM exports e WHERE e.organization_id=q.organization_id AND q.result->'export'->>'id'=e.id::text)
 )
 SELECT jsonb_build_object(
 'records',coalesce((SELECT jsonb_agg(id ORDER BY id)FROM records),'[]'),
 'histories',coalesce((SELECT jsonb_agg(id ORDER BY id)FROM histories),'[]'),
 'imports',coalesce((SELECT jsonb_agg(id ORDER BY id)FROM imports),'[]'),
 'exports',coalesce((SELECT jsonb_agg(id ORDER BY id)FROM exports),'[]'),
 'requests',coalesce((SELECT jsonb_agg(jsonb_build_object('actor_id',actor_id,'request_id',request_id)ORDER BY actor_id,request_id)FROM requests),'[]')) $fn$;
CREATE FUNCTION public.uc_copy_registry_personal_counts(p_user uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 WITH target AS MATERIALIZED(SELECT public.uc_copy_registry_privacy_targets(p_user)j), counts AS (
 SELECT 'uc_copy_registry_records'::text t,count(*) n FROM public.uc_copy_registry_records r CROSS JOIN target
  WHERE r.id IN(SELECT x::uuid FROM jsonb_array_elements_text(j->'records')x)
   OR p_user=ANY(r.participant_ids) OR r.registered_by=p_user OR r.updated_by=p_user OR r.latest_transfer->>'recorded_by'=p_user::text
 UNION ALL SELECT 'uc_copy_registry_history',count(*) FROM public.uc_copy_registry_history h CROSS JOIN target
  WHERE h.id IN(SELECT x::uuid FROM jsonb_array_elements_text(j->'histories')x)
   OR p_user=ANY(h.participant_ids) OR h.recorded_by=p_user OR h.snapshot->'latest_transfer'->>'recorded_by'=p_user::text
 UNION ALL SELECT 'uc_copy_registry_imports',count(*) FROM public.uc_copy_registry_imports i CROSS JOIN target
  WHERE i.id IN(SELECT x::uuid FROM jsonb_array_elements_text(j->'imports')x) OR p_user=ANY(i.participant_ids) OR i.created_by=p_user
 UNION ALL SELECT 'uc_copy_registry_exports',count(*) FROM public.uc_copy_registry_exports e CROSS JOIN target
  WHERE e.id IN(SELECT x::uuid FROM jsonb_array_elements_text(j->'exports')x) OR p_user=ANY(e.participant_ids) OR e.created_by=p_user
 UNION ALL SELECT 'uc_copy_registry_requests',count(*) FROM public.uc_copy_registry_requests q CROSS JOIN target
  WHERE p_user=ANY(q.participant_ids) OR q.actor_id=p_user
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(j->'requests')x WHERE q.actor_id::text=x.value->>'actor_id'AND q.request_id::text=x.value->>'request_id')
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('table',t,'column','subject_closure_or_actor_attribution','count',n)ORDER BY t),'[]'::jsonb)FROM counts WHERE n>0 $fn$;
CREATE FUNCTION public.uc_copy_registry_erase_user(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE targets jsonb;BEGIN
 IF auth.role() IS DISTINCT FROM'service_role' OR current_setting('sintagma.account_deletion_erase_user',true) IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user) THEN PERFORM public.uc_copy_registry_error('ACCESS_DENIED');END IF;
 targets:=public.uc_copy_registry_privacy_targets(p_user);
 -- Delete immutable artifacts only if they contain a subject-linked copy or printed actor attribution.
 DELETE FROM public.uc_copy_registry_exports WHERE id IN(SELECT x::uuid FROM jsonb_array_elements_text(targets->'exports')x);
 DELETE FROM public.uc_copy_registry_requests q WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(targets->'requests')x WHERE q.actor_id::text=x.value->>'actor_id'AND q.request_id::text=x.value->>'request_id');
 DELETE FROM public.uc_copy_registry_imports WHERE id IN(SELECT x::uuid FROM jsonb_array_elements_text(targets->'imports')x);
 -- A known subject/recipient owns the copied content, including prior unknown raw/digest history.
 UPDATE public.uc_copy_registry_history SET snapshot='{}',reason='',recorded_by=NULL,participant_ids='{}',redacted=true WHERE id IN(SELECT x::uuid FROM jsonb_array_elements_text(targets->'histories')x);
 UPDATE public.uc_copy_registry_records SET data='{}',latest_transfer=NULL,registered_by=NULL,updated_by=NULL,participant_ids='{}',redacted=true,archived=true WHERE id IN(SELECT x::uuid FROM jsonb_array_elements_text(targets->'records')x);
 -- Attribution alone never authorizes redacting customer content, history or source_raw.
 UPDATE public.uc_copy_registry_records SET
  registered_by=CASE WHEN registered_by=p_user THEN NULL ELSE registered_by END,
  updated_by=CASE WHEN updated_by=p_user THEN NULL ELSE updated_by END,
  latest_transfer=CASE WHEN latest_transfer->>'recorded_by'=p_user::text THEN jsonb_set(latest_transfer,'{recorded_by}','null'::jsonb) ELSE latest_transfer END,
  participant_ids=array_remove(participant_ids,p_user)
 WHERE registered_by=p_user OR updated_by=p_user OR latest_transfer->>'recorded_by'=p_user::text OR p_user=ANY(participant_ids);
 UPDATE public.uc_copy_registry_history SET
  recorded_by=CASE WHEN recorded_by=p_user THEN NULL ELSE recorded_by END,
  snapshot=CASE WHEN snapshot->'latest_transfer'->>'recorded_by'=p_user::text THEN jsonb_set(snapshot,'{latest_transfer,recorded_by}','null'::jsonb) ELSE snapshot END,
  participant_ids=array_remove(participant_ids,p_user)
 WHERE recorded_by=p_user OR snapshot->'latest_transfer'->>'recorded_by'=p_user::text OR p_user=ANY(participant_ids);
 UPDATE public.uc_copy_registry_imports SET created_by=CASE WHEN created_by=p_user THEN NULL ELSE created_by END,participant_ids=array_remove(participant_ids,p_user)
 WHERE created_by=p_user OR p_user=ANY(participant_ids);
 UPDATE public.uc_copy_registry_exports SET participant_ids=array_remove(participant_ids,p_user) WHERE p_user=ANY(participant_ids);
 UPDATE public.uc_copy_registry_requests SET participant_ids=array_remove(participant_ids,p_user) WHERE p_user=ANY(participant_ids);
 IF public.uc_copy_registry_personal_counts(p_user)<>'[]'::jsonb THEN PERFORM public.uc_copy_registry_error('DEPENDENCY_UNAVAILABLE');END IF;END;$fn$;

DO $copy_registry_privacy_bridge$
DECLARE sig text;p pg_proc;oldbody text;newbody text;definition text;before_meta jsonb;after_meta jsonb;pin record;
BEGIN
 FOR pin IN SELECT*FROM(VALUES('public.uc_scoped_journal_personal_counts(uuid)','fc3059c27bf36ae67370123b95b92d33','990d91cfef61c08fa87a10c90ce2f3d7'),('public.uc_scoped_journal_erase_user(uuid)','957c7edf1bb3796e9ae72ef41dc396ae','20e51ce5c3233d472ca94884ad3ad4c7'))x(signature,old_md5,new_md5)LOOP
  SELECT*INTO p FROM pg_proc WHERE oid=to_regprocedure(pin.signature);IF p.oid IS NULL OR md5(p.prosrc)<>pin.old_md5 OR p.proowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres') OR NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] THEN RAISE EXCEPTION'COPY_REGISTRY_UNREVIEWED_PRIVACY_PREDECESSOR %',pin.signature;END IF;before_meta:=to_jsonb(p);oldbody:=p.prosrc;
  IF pin.signature='public.uc_scoped_journal_personal_counts(uuid)' THEN newbody:=E'\n SELECT('||oldbody||E')||public.uc_copy_registry_personal_counts(p_user)\n';
  ELSE IF(length(oldbody)-length(replace(oldbody,' -- Every copied personal export','')))<>length(' -- Every copied personal export')THEN RAISE EXCEPTION'COPY_REGISTRY_PRIVACY_BRIDGE_ANCHOR';END IF;newbody:=replace(oldbody,' -- Every copied personal export',E' PERFORM public.uc_copy_registry_erase_user(p_user);\n -- Every copied personal export');END IF;
  IF md5(newbody)<>pin.new_md5 THEN RAISE EXCEPTION'COPY_REGISTRY_PRIVACY_NEW_BODY_MISMATCH';END IF;definition:=pg_get_functiondef(p.oid);IF(length(definition)-length(replace(definition,oldbody,'')))<>length(oldbody)THEN RAISE EXCEPTION'COPY_REGISTRY_PRIVACY_AMBIGUOUS_BODY';END IF;EXECUTE replace(definition,oldbody,newbody);
  SELECT to_jsonb(q)INTO after_meta FROM pg_proc q WHERE q.oid=p.oid;IF(before_meta-'prosrc')IS DISTINCT FROM(after_meta-'prosrc')OR md5(after_meta->>'prosrc')<>pin.new_md5 THEN RAISE EXCEPTION'COPY_REGISTRY_PRIVACY_METADATA_CHANGED';END IF;
 END LOOP;END;$copy_registry_privacy_bridge$;
DO $copy_registry_private_acl$
DECLARE r record;a record;
BEGIN
 FOR r IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND left(c.relname,17)='uc_copy_registry_'AND c.relkind IN('r','p')LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.relname);
  FOR a IN SELECT DISTINCT grantee FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid=r.oid),acldefault('r',(SELECT relowner FROM pg_class WHERE oid=r.oid))))WHERE grantee<>(SELECT relowner FROM pg_class WHERE oid=r.oid)LOOP
   EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %s CASCADE',r.relname,CASE WHEN a.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(a.grantee))END);END LOOP;
 END LOOP;
 FOR r IN SELECT p.oid,p.oid::regprocedure::text signature,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(left(p.proname,17)='uc_copy_registry_'OR p.proname IN('read_copy_registry','apply_copy_registry_action'))LOOP
  FOR a IN SELECT DISTINCT grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=r.oid),acldefault('f',r.proowner)))WHERE grantee<>r.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s CASCADE',r.signature,CASE WHEN a.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(a.grantee))END);END LOOP;
 END LOOP;END;$copy_registry_private_acl$;
GRANT EXECUTE ON FUNCTION public.read_copy_registry(uuid,jsonb,jsonb),public.apply_copy_registry_action(uuid,jsonb,bigint,uuid,jsonb) TO authenticated;
