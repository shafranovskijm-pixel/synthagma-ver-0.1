-- UC015-A: separate typed journals. No legacy journal DML, attendance decision,
-- legal signature, issuance, backfill or invented retention exception.
-- Release requires accepted UC013 then exact held UC014. SOURCE ONLY until review.
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND(p.proname LIKE 'uc_custom_journal_%' OR p.proname IN('read_custom_journals','apply_custom_journal_action')))
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('uc_custom_journals','uc_custom_journal_schemas','uc_custom_journal_records','uc_custom_journal_history','uc_custom_journal_requests')) THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_DEPENDENCY_UNAVAILABLE';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES
 ('public.account_deletion_personal_row_counts(uuid)','d263532fd944bf09e2adec1f0eac9fee'),
 ('public.account_deletion_snapshot(uuid)','dce5ffea181b5136a9eb82490438f962'),
 ('public.account_deletion_erase_data(uuid,text)','8b2de268a017d85ee99eb3acee4c87a5'),
 ('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)','f38189a9960f714e43a3ebcbc60f336e'),
 ('public.can_access_organization(uuid,text)','2e11495f3d3e6ca261af8a08ed874269'),
 ('public.has_org_staff_permission(uuid,uuid,text)','3d1fedafe94778fa19dd47acb71a3782'),
 ('public.get_org_staff_permissions(uuid,uuid)','c0ea40b20bbd1a71aa31cdbcbb7fc0b3'),
 ('public.org_role_default_permissions(text)','7aeb1012822cfe0013409ce5b1df1771'),
 ('public.normalize_org_staff_permission(text)','bb385c2b288bb966297a8504df1696ea'),
 ('public.has_role(uuid,public.app_role)','82a7fa1cd06301bb83b010bc315aee0b'),
 ('public.has_role(public.app_role,uuid)','20c46f708cc2e7fa51b640290151a59e'),
 ('public.is_org_owner(uuid,uuid)','362aca6afc26c775be594843258b2ab2'),
 ('public.uc_document_teacher_limited(uuid)','72cdbafda69c66500e0d9ae87e8ae403'),
 ('public.account_deletion_access_allowed()','64b0a90b7db9813950ccca6dff208f3a')
 )x(signature,digest)WHERE to_regprocedure(signature)IS NULL OR md5(pg_get_functiondef(to_regprocedure(signature)))<>digest)
 OR to_regprocedure('public.uc_platform_document_action_allowed(uuid,text)')IS NULL
 OR to_regprocedure('public.uc_document_teacher_limited(uuid)')IS NULL
 OR to_regprocedure('public.uc_program_hash(jsonb)')IS NULL
 OR to_regclass('public.uc_learning_outcome_states')IS NULL THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_DEPENDENCY_UNAVAILABLE';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES('public.uc_learning_personal_counts(uuid)','2b053046c665058e61289f154d51b0a0','s'),('public.uc_learning_erase_user(uuid)','cb4104f8eb7c7bd0242c11875b35bbff','v'))x(signature,body_md5,volatility)LEFT JOIN pg_proc p ON p.oid=to_regprocedure(x.signature)WHERE p.oid IS NULL OR md5(p.prosrc)<>x.body_md5 OR p.provolatile::text<>x.volatility OR NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']OR p.proowner<>(SELECT proowner FROM pg_proc WHERE oid='public.account_deletion_erase_data(uuid,text)'::regprocedure)OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_DEPENDENCY_UNAVAILABLE';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES('public.uc_platform_document_action_allowed(uuid,text)','66d5c98cf1725e74034967aee1d64a39','s',true,ARRAY['search_path=pg_catalog, public']),('public.uc_program_hash(jsonb)','93ce1b36e222f54bac71a0b5b8a0f6b7','i',false,ARRAY['search_path=pg_catalog']))x(signature,body_md5,volatility,definer,configuration)LEFT JOIN pg_proc p ON p.oid=to_regprocedure(x.signature)WHERE p.oid IS NULL OR md5(p.prosrc)<>x.body_md5 OR p.provolatile::text<>x.volatility OR p.prosecdef<>x.definer OR p.proconfig IS DISTINCT FROM x.configuration)THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_DEPENDENCY_UNAVAILABLE';END IF;
END;$preflight$;

CREATE TABLE public.uc_custom_journals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 title text NOT NULL,description text NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 archived boolean NOT NULL DEFAULT false,current_schema_id uuid NOT NULL,legacy_id text,legacy_source_hash text,
 created_by uuid,updated_by uuid,redacted boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,organization_id),UNIQUE(organization_id,legacy_id),CHECK((legacy_id IS NULL)=(legacy_source_hash IS NULL))
);
CREATE INDEX uc_custom_journals_page ON public.uc_custom_journals(organization_id,id);
CREATE INDEX uc_custom_journals_creator ON public.uc_custom_journals(created_by)WHERE created_by IS NOT NULL;
CREATE INDEX uc_custom_journals_updater ON public.uc_custom_journals(updated_by)WHERE updated_by IS NOT NULL;
CREATE TABLE public.uc_custom_journal_schemas(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),journal_id uuid NOT NULL,organization_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),hash text NOT NULL CHECK(hash~'^[a-f0-9]{64}$'),
 fields jsonb NOT NULL,field_identities jsonb NOT NULL,title text NOT NULL,description text NOT NULL,archived boolean NOT NULL,
 action text NOT NULL CHECK(action IN('create','save_schema','archive_journal','import_definition')),reason text NOT NULL,
 created_by uuid,redacted boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(journal_id,version),UNIQUE(id,journal_id,organization_id),
 FOREIGN KEY(journal_id,organization_id)REFERENCES public.uc_custom_journals(id,organization_id)DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE public.uc_custom_journals ADD CONSTRAINT uc_custom_journals_current_schema FOREIGN KEY(current_schema_id,id,organization_id)REFERENCES public.uc_custom_journal_schemas(id,journal_id,organization_id)DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX uc_custom_journal_schemas_creator ON public.uc_custom_journal_schemas(created_by)WHERE created_by IS NOT NULL;
CREATE TABLE public.uc_custom_journal_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),journal_id uuid NOT NULL,organization_id uuid NOT NULL,schema_version_id uuid NOT NULL,
 subject_user_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),field_values jsonb NOT NULL,
 archived boolean NOT NULL DEFAULT false,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),recorded_by uuid,redacted boolean NOT NULL DEFAULT false,
 UNIQUE(id,journal_id,organization_id),FOREIGN KEY(schema_version_id,journal_id,organization_id)REFERENCES public.uc_custom_journal_schemas(id,journal_id,organization_id)
);
CREATE INDEX uc_custom_journal_records_page ON public.uc_custom_journal_records(organization_id,journal_id,id);
CREATE INDEX uc_custom_journal_records_subject ON public.uc_custom_journal_records(subject_user_id);
CREATE INDEX uc_custom_journal_records_actor ON public.uc_custom_journal_records(recorded_by)WHERE recorded_by IS NOT NULL;
CREATE TABLE public.uc_custom_journal_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),record_id uuid NOT NULL,journal_id uuid NOT NULL,organization_id uuid NOT NULL,
 schema_version_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 action text NOT NULL CHECK(action IN('save_record','archive_record')),reason text NOT NULL,field_values jsonb NOT NULL,
 subject_user_id uuid NOT NULL,archived boolean NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),recorded_by uuid,redacted boolean NOT NULL DEFAULT false,
 UNIQUE(record_id,revision),FOREIGN KEY(record_id,journal_id,organization_id)REFERENCES public.uc_custom_journal_records(id,journal_id,organization_id),
 FOREIGN KEY(schema_version_id,journal_id,organization_id)REFERENCES public.uc_custom_journal_schemas(id,journal_id,organization_id)
);
CREATE INDEX uc_custom_journal_history_subject ON public.uc_custom_journal_history(subject_user_id);
CREATE INDEX uc_custom_journal_history_actor ON public.uc_custom_journal_history(recorded_by)WHERE recorded_by IS NOT NULL;
CREATE TABLE public.uc_custom_journal_requests(
 actor_id uuid NOT NULL,request_id uuid NOT NULL,organization_id uuid NOT NULL,journal_id uuid NOT NULL,record_id uuid,
 subject_user_id uuid,payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),receipt jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,request_id)
);
CREATE INDEX uc_custom_journal_requests_subject ON public.uc_custom_journal_requests(subject_user_id)WHERE subject_user_id IS NOT NULL;
-- No authenticated/service direct table access, including inherited host defaults.
DO $table_acl$ DECLARE t text;g record;BEGIN
 FOREACH t IN ARRAY ARRAY['uc_custom_journals','uc_custom_journal_schemas','uc_custom_journal_records','uc_custom_journal_history','uc_custom_journal_requests']LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  FOR g IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE c.oid=format('public.%I',t)::regclass AND a.grantee<>c.relowner LOOP
   EXECUTE format('REVOKE ALL ON public.%I FROM %s CASCADE',t,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee))END);
  END LOOP;
 END LOOP;
END;$table_acl$;

CREATE FUNCTION public.uc_custom_journal_error(p_code text)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'CUSTOM_JOURNAL_%',p_code USING ERRCODE=CASE p_code WHEN 'ACCESS_DENIED'THEN '42501' WHEN 'INVALID_INPUT'THEN '22023' WHEN 'REVISION_CONFLICT'THEN '40001' ELSE 'P0001'END;END;$fn$;
CREATE FUNCTION public.uc_custom_journal_shape(p jsonb,p_keys text[])RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
BEGIN IF jsonb_typeof(p)IS DISTINCT FROM 'object'THEN RETURN false;END IF;RETURN coalesce(p?&p_keys AND(SELECT count(*)FROM jsonb_object_keys(p))=cardinality(p_keys),false);END;$fn$;
CREATE FUNCTION public.uc_custom_journal_uuid(p jsonb)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(jsonb_typeof(p)='string' AND p#>>'{}'~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false)
$fn$;
CREATE FUNCTION public.uc_custom_journal_text_units(p_text text)RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 -- JavaScript/Zod string bounds count UTF16 units; PostgreSQL length counts
 -- Unicode codepoints. Splitting once keeps this linear, including emoji.
 SELECT coalesce(sum(CASE WHEN ascii(ch)>65535 THEN 2 ELSE 1 END),0)::integer FROM regexp_split_to_table(coalesce(p_text,''),'')ch WHERE ch<>''
$fn$;
CREATE FUNCTION public.uc_custom_journal_text(p jsonb,p_max integer,p_empty boolean DEFAULT false)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(jsonb_typeof(p)='string' AND public.uc_custom_journal_text_units(p#>>'{}')<=p_max AND(p_empty OR p#>>'{}'~'[^[:space:]]'),false)
$fn$;
CREATE FUNCTION public.uc_custom_journal_person(p_user uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(p_user IS NOT NULL AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_user AND to_jsonb(u)->>'deleted_at'IS NULL AND coalesce((to_jsonb(u)->>'banned_until')::timestamptz<=now(),true))
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND to_jsonb(p)->>'blocked_at'IS NOT NULL),false)
$fn$;
CREATE FUNCTION public.uc_custom_journal_allowed(p_org uuid,p_write boolean)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated' AND public.uc_custom_journal_person(auth.uid()) AND public.account_deletion_access_allowed()
 AND EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org)
 AND public.uc_platform_document_action_allowed(auth.uid(),CASE WHEN p_write THEN 'write'ELSE 'read'END)
 AND public.can_access_organization(p_org,'journals.read') AND(NOT p_write OR public.can_access_organization(p_org,'journals.write'))
 AND NOT public.uc_document_teacher_limited(p_org)
 AND(NOT p_write OR NOT public.has_role(auth.uid(),'sales_manager'::public.app_role))
 AND(NOT p_write OR NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=auth.uid() AND s.organization_id=p_org AND s.role IN('viewer','sales_manager'))),false)
$fn$;
CREATE FUNCTION public.uc_custom_journal_subject(p_org uuid,p_user uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_custom_journal_person(p_user)AND(EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.organization_id=p_org)
 OR EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_user AND s.organization_id=p_org AND(s.expires_at IS NULL OR s.expires_at>now()))
 OR EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.user_id=p_user AND c.organization_id=p_org AND e.status NOT IN('cancelled','revoked')))
$fn$;
CREATE FUNCTION public.uc_custom_journal_fields(p jsonb)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE f jsonb;typ text;sem text;ids text[]:='{}';BEGIN
 IF jsonb_typeof(p)IS DISTINCT FROM 'array'THEN RETURN false;END IF;
 IF jsonb_array_length(p)NOT BETWEEN 1 AND 32 THEN RETURN false;END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(p)LOOP
  typ:=f->>'type';sem:=f->>'semantic';
  IF NOT public.uc_custom_journal_shape(f,CASE WHEN typ='select'THEN ARRAY['id','label','type','semantic','options']ELSE ARRAY['id','label','type','semantic']END)
  OR NOT public.uc_custom_journal_text(f->'id',80)OR NOT public.uc_custom_journal_text(f->'label',120)
  OR NOT coalesce(typ IN('text','long_text','date','time','decimal','integer','boolean','select'),false)
  OR f->>'id'=ANY(ids)THEN RETURN false;END IF;
  ids:=array_append(ids,f->>'id');
  IF sem='custom'THEN IF NOT public.uc_custom_journal_uuid(f->'id')THEN RETURN false;END IF;
  ELSIF NOT coalesce(sem=ANY(ARRAY['full_name','phone','email','position','organization','doc_number','doc_date','doc_type','event_date','event_time','location','topic','result','grade','notes','signature']),false)
  OR f->>'id'<>sem OR typ<>(CASE WHEN sem IN('doc_date','event_date')THEN 'date'WHEN sem='event_time'THEN 'time'WHEN sem='grade'THEN 'decimal'WHEN sem='notes'THEN 'long_text'ELSE 'text'END) THEN RETURN false;END IF;
  IF typ='select'THEN
   IF jsonb_typeof(f->'options')IS DISTINCT FROM 'array'THEN RETURN false;END IF;
   IF jsonb_array_length(f->'options')NOT BETWEEN 1 AND 50 OR EXISTS(SELECT 1 FROM jsonb_array_elements(f->'options')x WHERE NOT public.uc_custom_journal_text(x,80))
   OR(SELECT count(DISTINCT x)FROM jsonb_array_elements(f->'options')x)<>jsonb_array_length(f->'options')THEN RETURN false;END IF;
  END IF;
 END LOOP;RETURN true;
END;$fn$;
CREATE FUNCTION public.uc_custom_journal_values(p_fields jsonb,p_values jsonb)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE kv record;f jsonb;typ text;v text;d date;BEGIN
 IF NOT public.uc_custom_journal_fields(p_fields)OR jsonb_typeof(p_values)IS DISTINCT FROM 'object'OR octet_length(p_values::text)>32768 THEN RETURN false;END IF;
 FOR kv IN SELECT key,value FROM jsonb_each(p_values)LOOP
  SELECT value INTO f FROM jsonb_array_elements(p_fields)WHERE value->>'id'=kv.key;
  IF NOT FOUND THEN RETURN false;END IF;IF kv.value='null'::jsonb THEN CONTINUE;END IF;
  typ:=f->>'type';v:=kv.value#>>'{}';
  IF typ='boolean'THEN IF jsonb_typeof(kv.value)<>'boolean'THEN RETURN false;END IF;
  ELSIF typ='integer'THEN
   IF jsonb_typeof(kv.value)<>'number'OR v!~'^-?(0|[1-9][0-9]*)$'OR length(v)>17 THEN RETURN false;END IF;
   IF abs(v::numeric)>9007199254740991 THEN RETURN false;END IF;
  ELSE
   IF jsonb_typeof(kv.value)<>'string'OR public.uc_custom_journal_text_units(v)>4000 THEN RETURN false;END IF;
   IF typ='decimal'AND v!~'^-?(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'THEN RETURN false;END IF;
   IF typ='date'THEN
    IF v!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'OR left(v,4)='0000'THEN RETURN false;END IF;
    BEGIN d:=make_date(left(v,4)::integer,substring(v,6,2)::integer,right(v,2)::integer);EXCEPTION WHEN datetime_field_overflow THEN RETURN false;END;
   END IF;
   IF typ='time'AND v!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'THEN RETURN false;END IF;
   IF typ='select'AND NOT(f->'options'?v)THEN RETURN false;END IF;
  END IF;
 END LOOP;RETURN true;
END;$fn$;
CREATE FUNCTION public.uc_custom_journal_legacy(p jsonb)RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE k text;fs jsonb:='[]';labels jsonb:='{"full_name":"ФИО","phone":"Телефон","email":"Email","position":"Должность","organization":"Организация","doc_number":"Номер документа","doc_date":"Дата документа","doc_type":"Тип документа","event_date":"Дата события","event_time":"Время","location":"Место","topic":"Тема/Название","result":"Результат","grade":"Оценка/Балл","notes":"Примечания","signature":"Подпись"}';BEGIN
 IF NOT public.uc_custom_journal_shape(p,CASE WHEN p?'createdAt'THEN ARRAY['id','title','description','fields','createdAt']ELSE ARRAY['id','title','description','fields']END)
 OR NOT public.uc_custom_journal_text(p->'id',200)OR p->>'id'!~'^custom_[A-Za-z0-9_-]+$'OR NOT public.uc_custom_journal_text(p->'title',200)
 OR NOT public.uc_custom_journal_text(p->'description',2000,true)OR(p?'createdAt'AND NOT public.uc_custom_journal_text(p->'createdAt',100,true))
 OR jsonb_typeof(p->'fields')IS DISTINCT FROM 'array'THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 IF jsonb_array_length(p->'fields')NOT BETWEEN 1 AND 16 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'fields')x WHERE jsonb_typeof(x)IS DISTINCT FROM 'string'OR NOT coalesce(labels?(x#>>'{}'),false))OR(SELECT count(DISTINCT x)FROM jsonb_array_elements(p->'fields')x)<>jsonb_array_length(p->'fields')THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 FOR k IN SELECT value#>>'{}'FROM jsonb_array_elements(p->'fields')LOOP
  IF NOT coalesce(labels?k,false)THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  fs:=fs||jsonb_build_array(jsonb_build_object('id',k,'label',labels->>k,'semantic',k,'type',CASE WHEN k IN('doc_date','event_date')THEN 'date'WHEN k='event_time'THEN 'time'WHEN k='grade'THEN 'decimal'WHEN k='notes'THEN 'long_text'ELSE 'text'END));
 END LOOP;
 IF NOT public.uc_custom_journal_fields(fs)THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 -- createdAt is an unverified browser claim, never an authoritative server date.
 RETURN jsonb_build_object('id',p->>'id','title',p->>'title','description',p->>'description','fields',fs);
END;$fn$;
CREATE FUNCTION public.uc_custom_journal_identities(p_fields jsonb)RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(jsonb_object_agg(f->>'id',public.uc_program_hash(f-'label')),'{}')FROM jsonb_array_elements(p_fields)f
$fn$;
CREATE FUNCTION public.uc_custom_journal_schema_json(p_id uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('id',id,'journal_id',journal_id,'version',version,'hash',hash,'fields',CASE WHEN redacted THEN '[]'::jsonb ELSE fields END,'created_at',created_at,'created_by',created_by,'redacted',redacted)FROM public.uc_custom_journal_schemas WHERE id=p_id
$fn$;
CREATE FUNCTION public.uc_custom_journal_detail(p_id uuid,p_full boolean DEFAULT true)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('id',id,'title',title,'description',description,'revision',revision,'archived',archived,'current_schema_id',current_schema_id,'legacy_id',legacy_id,'redacted',redacted)
 ||CASE WHEN p_full THEN jsonb_build_object('current_schema',public.uc_custom_journal_schema_json(current_schema_id))ELSE '{}'::jsonb END FROM public.uc_custom_journals WHERE id=p_id
$fn$;
CREATE FUNCTION public.uc_custom_journal_record_json(p_id uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('id',r.id,'journal_id',r.journal_id,'schema_version_id',r.schema_version_id,'revision',r.revision,'subject_user_id',r.subject_user_id,'values',CASE WHEN r.redacted OR s.redacted THEN '{}'::jsonb ELSE r.field_values END,'archived',r.archived,'recorded_at',r.recorded_at,'recorded_by',r.recorded_by,'redacted',r.redacted,'schema',public.uc_custom_journal_schema_json(s.id))FROM public.uc_custom_journal_records r JOIN public.uc_custom_journal_schemas s ON s.id=r.schema_version_id WHERE r.id=p_id
$fn$;
CREATE FUNCTION public.uc_custom_journal_base(p_org uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('schema_version',1,'organization_id',p_org,'capabilities',jsonb_build_object('can_read',public.uc_custom_journal_allowed(p_org,false),'can_write',public.uc_custom_journal_allowed(p_org,true)))
$fn$;
CREATE FUNCTION public.uc_custom_journal_preview(p_org uuid,p_definition jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d jsonb:=public.uc_custom_journal_legacy(p_definition);j public.uc_custom_journals;ic bigint;ec bigint;state text;BEGIN
 SELECT * INTO j FROM public.uc_custom_journals WHERE organization_id=p_org AND legacy_id=d->>'id';
 state:=CASE WHEN j.id IS NULL THEN 'ready'WHEN j.redacted THEN 'conflict'WHEN j.legacy_source_hash=public.uc_program_hash(d)THEN 'already_imported'ELSE 'conflict'END;
 SELECT count(*)INTO ic FROM public.journal_instances WHERE organization_id=p_org AND journal_type=d->>'id';
 SELECT count(*)INTO ec FROM public.journal_entries e JOIN public.journal_instances i ON i.id=e.journal_id WHERE i.organization_id=p_org AND i.journal_type=d->>'id';
 RETURN jsonb_build_object('state',state,'reason',CASE WHEN state='conflict'THEN 'Серверное определение с этим идентификатором уже отличается или обезличено.'ELSE ''END,'server_legacy_instance_count',ic,'server_legacy_entry_count',ec,'journal_id',j.id);
END;$fn$;

CREATE FUNCTION public.read_custom_journals(p_organization_id uuid,p_query jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE kind text:=p_query->>'kind';lim integer;after_id uuid;jid uuid;rid uuid;after_rev bigint;rows jsonb:='[]';n integer:=0;last_id uuid;last_rev bigint;rec record;base jsonb;BEGIN
 IF NOT public.uc_custom_journal_allowed(p_organization_id,false)THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 IF jsonb_typeof(p_query)IS DISTINCT FROM 'object'OR octet_length(p_query::text)>32768 THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 base:=public.uc_custom_journal_base(p_organization_id)||jsonb_build_object('kind',kind);
 IF kind='journal'THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','journal_id'])OR NOT public.uc_custom_journal_uuid(p_query->'journal_id')THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  jid:=(p_query->>'journal_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.uc_custom_journals WHERE id=jid AND organization_id=p_organization_id)THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
  RETURN base||jsonb_build_object('journal',public.uc_custom_journal_detail(jid));
 ELSIF kind='preview_legacy'THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','definition'])THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  RETURN base||jsonb_build_object('legacy_id',p_query->'definition'->>'id','preview',public.uc_custom_journal_preview(p_organization_id,p_query->'definition'));
 ELSIF kind='legacy_inventory'THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','after_legacy_id','limit'])OR NOT(p_query->'after_legacy_id'='null'::jsonb OR public.uc_custom_journal_text(p_query->'after_legacy_id',200)AND p_query->>'after_legacy_id'~'^custom_[A-Za-z0-9_-]+$')OR jsonb_typeof(p_query->'limit')IS DISTINCT FROM 'number'OR coalesce(p_query->>'limit','')!~'^[1-9][0-9]?$'THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  lim:=(p_query->>'limit')::integer;IF lim>50 THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  FOR rec IN SELECT i.journal_type,count(DISTINCT i.id)instance_count,count(e.id)entry_count FROM public.journal_instances i LEFT JOIN public.journal_entries e ON e.journal_id=i.id WHERE i.organization_id=p_organization_id AND i.journal_type~'^custom_[A-Za-z0-9_-]+$'AND length(i.journal_type)<=200 AND(p_query->>'after_legacy_id'IS NULL OR i.journal_type>p_query->>'after_legacy_id')GROUP BY i.journal_type ORDER BY i.journal_type LIMIT lim+1 LOOP
   n:=n+1;IF n>lim THEN EXIT;END IF;rows:=rows||jsonb_build_array(jsonb_build_object('legacy_id',rec.journal_type,'instance_count',rec.instance_count,'entry_count',rec.entry_count));
   base:=base||jsonb_build_object('next_after_legacy_id',rec.journal_type);
  END LOOP;RETURN(base-'next_after_legacy_id')||jsonb_build_object('legacy_journals',rows,'next_after_legacy_id',CASE WHEN n>lim THEN base->>'next_after_legacy_id'END);
 ELSIF kind='history'THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','journal_id','record_id','after_revision','limit'])OR NOT public.uc_custom_journal_uuid(p_query->'journal_id')OR NOT public.uc_custom_journal_uuid(p_query->'record_id')
  OR jsonb_typeof(p_query->'after_revision')IS DISTINCT FROM 'number'OR coalesce(p_query->>'after_revision','')!~'^(0|[1-9][0-9]{0,15})$'OR(p_query->>'after_revision')::numeric>9007199254740991 THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  jid:=(p_query->>'journal_id')::uuid;rid:=(p_query->>'record_id')::uuid;after_rev:=(p_query->>'after_revision')::bigint;
  IF NOT EXISTS(SELECT 1 FROM public.uc_custom_journal_records WHERE id=rid AND journal_id=jid AND organization_id=p_organization_id)THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
 ELSE
  IF kind='list'THEN
   IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','after_id','limit','include_archived'])OR jsonb_typeof(p_query->'include_archived')IS DISTINCT FROM 'boolean'THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  ELSIF kind='records'THEN
   IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','journal_id','after_id','limit'])OR NOT public.uc_custom_journal_uuid(p_query->'journal_id')THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
   jid:=(p_query->>'journal_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM public.uc_custom_journals WHERE id=jid AND organization_id=p_organization_id)THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
  ELSIF kind='subjects'THEN
   IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','after_id','limit'])THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  ELSIF kind='legacy_records'THEN
   IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','legacy_id','after_id','limit'])OR NOT public.uc_custom_journal_text(p_query->'legacy_id',200)OR p_query->>'legacy_id'!~'^custom_[A-Za-z0-9_-]+$'THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  ELSE PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  IF NOT(p_query->'after_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'after_id'))THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  after_id:=(p_query->>'after_id')::uuid;
 END IF;
 IF jsonb_typeof(p_query->'limit')IS DISTINCT FROM 'number'OR coalesce(p_query->>'limit','')!~'^[1-9][0-9]?$'THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 lim:=(p_query->>'limit')::integer;IF lim>(CASE WHEN kind IN('list','subjects')THEN 50 ELSE 25 END) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 IF kind='list'THEN
  FOR rec IN SELECT id FROM public.uc_custom_journals WHERE organization_id=p_organization_id AND(after_id IS NULL OR id>after_id)AND((p_query->>'include_archived')::boolean OR NOT archived)ORDER BY id LIMIT lim+1 LOOP
   n:=n+1;IF n>lim THEN EXIT;END IF;rows:=rows||jsonb_build_array(public.uc_custom_journal_detail(rec.id,false));last_id:=rec.id;
  END LOOP;RETURN base||jsonb_build_object('journals',rows,'next_after_id',CASE WHEN n>lim THEN last_id END);
 ELSIF kind='records'THEN
  FOR rec IN SELECT id FROM public.uc_custom_journal_records WHERE organization_id=p_organization_id AND journal_id=jid AND(after_id IS NULL OR id>after_id)ORDER BY id LIMIT lim+1 LOOP
   n:=n+1;IF n>lim THEN EXIT;END IF;rows:=rows||jsonb_build_array(public.uc_custom_journal_record_json(rec.id));last_id:=rec.id;
  END LOOP;RETURN base||jsonb_build_object('journal_id',jid,'records',rows,'next_after_id',CASE WHEN n>lim THEN last_id END);
 ELSIF kind='history'THEN
  FOR rec IN SELECT h.*,s.redacted schema_redacted FROM public.uc_custom_journal_history h JOIN public.uc_custom_journal_schemas s ON s.id=h.schema_version_id WHERE h.organization_id=p_organization_id AND h.journal_id=jid AND h.record_id=rid AND h.revision>after_rev ORDER BY h.revision LIMIT lim+1 LOOP
   n:=n+1;IF n>lim THEN EXIT;END IF;rows:=rows||jsonb_build_array(jsonb_build_object('id',rec.id,'record_id',rec.record_id,'revision',rec.revision,'action',rec.action,'reason',rec.reason,'recorded_at',rec.recorded_at,'recorded_by',rec.recorded_by,'schema',public.uc_custom_journal_schema_json(rec.schema_version_id),'values',CASE WHEN rec.redacted OR rec.schema_redacted THEN '{}'::jsonb ELSE rec.field_values END,'subject_user_id',rec.subject_user_id,'archived',rec.archived,'redacted',rec.redacted));last_rev:=rec.revision;
  END LOOP;RETURN base||jsonb_build_object('journal_id',jid,'record_id',rid,'history',rows,'next_after_revision',CASE WHEN n>lim THEN last_rev END);
 ELSIF kind='subjects'THEN
  FOR rec IN WITH candidates AS(SELECT user_id FROM public.profiles WHERE organization_id=p_organization_id UNION SELECT user_id FROM public.org_staff WHERE organization_id=p_organization_id AND(expires_at IS NULL OR expires_at>now())UNION SELECT e.user_id FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE c.organization_id=p_organization_id AND e.status NOT IN('cancelled','revoked'))SELECT u.id,left(coalesce(nullif(p.full_name,''),'Пользователь '||left(u.id::text,8)),120)label FROM candidates c JOIN auth.users u ON u.id=c.user_id LEFT JOIN public.profiles p ON p.user_id=u.id WHERE(after_id IS NULL OR u.id>after_id)AND public.uc_custom_journal_person(u.id)ORDER BY u.id LIMIT lim+1 LOOP
   n:=n+1;IF n>lim THEN EXIT;END IF;rows:=rows||jsonb_build_array(jsonb_build_object('user_id',rec.id,'label',rec.label));last_id:=rec.id;
  END LOOP;RETURN base||jsonb_build_object('subjects',rows,'next_after_id',CASE WHEN n>lim THEN last_id END);
 ELSE
  FOR rec IN SELECT e.*,i.title journal_title,i.course_id FROM public.journal_entries e JOIN public.journal_instances i ON i.id=e.journal_id WHERE i.organization_id=p_organization_id AND i.journal_type=p_query->>'legacy_id'AND(after_id IS NULL OR e.id>after_id)AND(i.course_id IS NULL OR EXISTS(SELECT 1 FROM public.courses c WHERE c.id=i.course_id AND c.organization_id=p_organization_id))ORDER BY e.id LIMIT lim+1 LOOP
   n:=n+1;IF n>lim THEN EXIT;END IF;rows:=rows||jsonb_build_array(jsonb_build_object('id',rec.id,'journal_id',rec.journal_id,'journal_title',rec.journal_title,'course_id',rec.course_id,'user_id',rec.user_id,'entry_date',rec.entry_date,'entry_type',rec.entry_type,'value',rec.value,'notes',rec.notes,'created_at',rec.created_at,'updated_at',rec.updated_at));last_id:=rec.id;
  END LOOP;RETURN base||jsonb_build_object('legacy_id',p_query->>'legacy_id','records',rows,'next_after_id',CASE WHEN n>lim THEN last_id END);
 END IF;
END;$fn$;

CREATE FUNCTION public.apply_custom_journal_action(p_organization_id uuid,p_expected_revision bigint,p_request_id uuid,p_action jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid:=auth.uid();op text:=p_action->>'action';jid uuid;rid uuid;subject uuid;uid uuid;people uuid[];d jsonb;new_fields jsonb;sid uuid;reason text:='';payload_hash text;receipt jsonb;outcome text:='applied';
 j public.uc_custom_journals;r public.uc_custom_journal_records;s public.uc_custom_journal_schemas;oldreq public.uc_custom_journal_requests;nextrev bigint;oldfields jsonb;BEGIN
 IF NOT public.uc_custom_journal_allowed(p_organization_id,true)THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740990 OR jsonb_typeof(p_action)IS DISTINCT FROM 'object'OR octet_length(p_action::text)>65536 THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 IF op='create'THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','title','description','fields'])THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 ELSIF op='import_definition'THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','definition'])THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  d:=public.uc_custom_journal_legacy(p_action->'definition');
 ELSIF op='save_schema'THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','journal_id','title','description','fields','reason'])THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 ELSIF op='archive_journal'THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','journal_id','archived','reason'])OR jsonb_typeof(p_action->'archived')IS DISTINCT FROM 'boolean'THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 ELSIF op='save_record'THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','journal_id','record_id','schema_version_id','subject_user_id','values','reason'])OR NOT public.uc_custom_journal_uuid(p_action->'schema_version_id')OR NOT public.uc_custom_journal_uuid(p_action->'subject_user_id')OR NOT(p_action->'record_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_action->'record_id'))OR NOT public.uc_custom_journal_text(p_action->'reason',1000,true)THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  rid:=(p_action->>'record_id')::uuid;subject:=(p_action->>'subject_user_id')::uuid;
 ELSIF op='archive_record'THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','journal_id','record_id','archived','reason'])OR NOT public.uc_custom_journal_uuid(p_action->'record_id')OR jsonb_typeof(p_action->'archived')IS DISTINCT FROM 'boolean'THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;rid:=(p_action->>'record_id')::uuid;
 ELSE PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 IF op IN('create','save_schema')THEN
  IF NOT public.uc_custom_journal_text(p_action->'title',200)OR NOT public.uc_custom_journal_text(p_action->'description',2000,true)OR NOT public.uc_custom_journal_fields(p_action->'fields')THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;new_fields:=p_action->'fields';
 END IF;
 IF op NOT IN('create','import_definition')THEN
  IF NOT public.uc_custom_journal_uuid(p_action->'journal_id')THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;jid:=(p_action->>'journal_id')::uuid;
  SELECT * INTO j FROM public.uc_custom_journals WHERE id=jid AND organization_id=p_organization_id;
  IF NOT FOUND THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
 END IF;
 IF op IN('save_schema','archive_journal','archive_record')OR op='save_record'AND rid IS NOT NULL THEN
  IF NOT public.uc_custom_journal_text(p_action->'reason',1000)THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 END IF;reason:=coalesce(p_action->>'reason','');
 IF rid IS NOT NULL THEN
  SELECT * INTO r FROM public.uc_custom_journal_records WHERE id=rid AND journal_id=jid AND organization_id=p_organization_id;
  IF NOT FOUND THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
  IF subject IS NOT NULL AND subject<>r.subject_user_id THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;subject:=r.subject_user_id;
 END IF;
 IF subject IS NOT NULL AND NOT public.uc_custom_journal_subject(p_organization_id,subject)THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 -- Sorted erasure fence before request/entity locks. Re-read and CAS afterwards.
 SELECT array_agg(DISTINCT x ORDER BY x)INTO people FROM unnest(ARRAY[actor,subject,j.created_by,j.updated_by,r.recorded_by])x WHERE x IS NOT NULL;
 FOR uid IN SELECT unnest(people)LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(uid::text,42007))THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
  IF NOT public.uc_custom_journal_person(uid)THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
 END LOOP;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc015_request:'||actor::text||':'||p_request_id::text,0))THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
 IF NOT public.uc_custom_journal_allowed(p_organization_id,true)OR(subject IS NOT NULL AND NOT public.uc_custom_journal_subject(p_organization_id,subject))THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 payload_hash:=public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'expected_revision',p_expected_revision,'action',p_action));
 SELECT * INTO oldreq FROM public.uc_custom_journal_requests WHERE actor_id=actor AND request_id=p_request_id;
 IF FOUND THEN
  IF oldreq.payload_hash<>payload_hash OR oldreq.organization_id<>p_organization_id THEN PERFORM public.uc_custom_journal_error('REQUEST_CONFLICT');END IF;
  IF oldreq.subject_user_id IS NOT NULL AND NOT public.uc_custom_journal_subject(p_organization_id,oldreq.subject_user_id)THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
  receipt:=oldreq.receipt||jsonb_build_object('replayed',true);
  RETURN public.uc_custom_journal_base(p_organization_id)||jsonb_build_object('receipt',receipt,'journal',public.uc_custom_journal_detail(oldreq.journal_id),'record',public.uc_custom_journal_record_json(oldreq.record_id));
 END IF;
 IF op IN('create','import_definition')THEN
  IF p_expected_revision<>0 THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
  IF op='import_definition'THEN
   IF NOT pg_try_advisory_xact_lock(hashtextextended('uc015_legacy:'||p_organization_id::text||':'||(d->>'id'),0))THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
   SELECT * INTO j FROM public.uc_custom_journals WHERE organization_id=p_organization_id AND legacy_id=d->>'id'FOR UPDATE NOWAIT;
   IF FOUND THEN
    IF j.redacted OR j.legacy_source_hash<>public.uc_program_hash(d)THEN PERFORM public.uc_custom_journal_error('IMPORT_CONFLICT');END IF;jid:=j.id;outcome:='import_existing';nextrev:=j.revision;
   ELSE new_fields:=d->'fields';END IF;
  END IF;
  IF jid IS NULL THEN
   jid:=gen_random_uuid();sid:=gen_random_uuid();nextrev:=1;
   INSERT INTO public.uc_custom_journals(id,organization_id,title,description,revision,current_schema_id,legacy_id,legacy_source_hash,created_by,updated_by)VALUES(jid,p_organization_id,CASE WHEN op='import_definition'THEN d->>'title'ELSE p_action->>'title'END,CASE WHEN op='import_definition'THEN d->>'description'ELSE p_action->>'description'END,1,sid,CASE WHEN op='import_definition'THEN d->>'id'END,CASE WHEN op='import_definition'THEN public.uc_program_hash(d)END,actor,actor)RETURNING * INTO j;
   INSERT INTO public.uc_custom_journal_schemas(id,journal_id,organization_id,version,hash,fields,field_identities,title,description,archived,action,reason,created_by)VALUES(sid,jid,p_organization_id,1,public.uc_program_hash(new_fields),new_fields,public.uc_custom_journal_identities(new_fields),j.title,j.description,false,op,'',actor);
  END IF;
 ELSE
  SELECT * INTO j FROM public.uc_custom_journals WHERE id=jid AND organization_id=p_organization_id FOR UPDATE NOWAIT;
  IF j.created_by IS NOT NULL AND NOT(j.created_by=ANY(people))OR j.updated_by IS NOT NULL AND NOT(j.updated_by=ANY(people))THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
  IF j.redacted THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
  SELECT * INTO s FROM public.uc_custom_journal_schemas WHERE id=j.current_schema_id;
  IF s.redacted THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
  IF op IN('save_schema','archive_journal')THEN
   IF j.revision<>p_expected_revision THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
   IF op='save_schema'AND j.archived THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
   IF op='save_schema'AND EXISTS(SELECT 1 FROM public.uc_custom_journal_schemas v CROSS JOIN LATERAL jsonb_array_elements(new_fields)newf WHERE v.journal_id=jid AND v.field_identities?(newf->>'id')AND v.field_identities->>(newf->>'id')<>public.uc_program_hash(newf-'label'))THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
   IF op='archive_journal'AND j.archived=(p_action->>'archived')::boolean THEN outcome:='unchanged';nextrev:=j.revision;
   ELSE
    sid:=gen_random_uuid();nextrev:=j.revision+1;
    INSERT INTO public.uc_custom_journal_schemas(id,journal_id,organization_id,version,hash,fields,field_identities,title,description,archived,action,reason,created_by)VALUES(sid,jid,p_organization_id,nextrev,public.uc_program_hash(CASE WHEN op='save_schema'THEN new_fields ELSE s.fields END),CASE WHEN op='save_schema'THEN new_fields ELSE s.fields END,CASE WHEN op='save_schema'THEN public.uc_custom_journal_identities(new_fields)ELSE s.field_identities END,CASE WHEN op='save_schema'THEN p_action->>'title'ELSE j.title END,CASE WHEN op='save_schema'THEN p_action->>'description'ELSE j.description END,CASE WHEN op='archive_journal'THEN(p_action->>'archived')::boolean ELSE j.archived END,op,reason,actor);
    UPDATE public.uc_custom_journals SET revision=nextrev,current_schema_id=sid,title=CASE WHEN op='save_schema'THEN p_action->>'title'ELSE title END,description=CASE WHEN op='save_schema'THEN p_action->>'description'ELSE description END,archived=CASE WHEN op='archive_journal'THEN(p_action->>'archived')::boolean ELSE archived END,updated_by=actor WHERE id=jid;
   END IF;
  ELSE
   IF j.archived THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
   IF rid IS NOT NULL THEN
    SELECT * INTO r FROM public.uc_custom_journal_records WHERE id=rid AND journal_id=jid AND organization_id=p_organization_id FOR UPDATE NOWAIT;
    IF r.revision<>p_expected_revision THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
    IF r.redacted OR r.subject_user_id<>subject OR r.recorded_by IS DISTINCT FROM(SELECT x FROM unnest(people)x WHERE x=r.recorded_by)THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
   ELSIF p_expected_revision<>0 THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
   IF op='save_record'THEN
    IF r.archived OR(p_action->>'schema_version_id')::uuid<>j.current_schema_id THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
    IF NOT public.uc_custom_journal_values(s.fields,p_action->'values')THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
    IF rid IS NULL THEN
     rid:=gen_random_uuid();nextrev:=1;
     INSERT INTO public.uc_custom_journal_records(id,journal_id,organization_id,schema_version_id,subject_user_id,revision,field_values,recorded_by)VALUES(rid,jid,p_organization_id,s.id,subject,1,p_action->'values',actor)RETURNING * INTO r;
    ELSE nextrev:=r.revision+1;UPDATE public.uc_custom_journal_records SET revision=nextrev,schema_version_id=s.id,field_values=p_action->'values',recorded_at=clock_timestamp(),recorded_by=actor WHERE id=rid RETURNING * INTO r;END IF;
   ELSE
    IF r.archived=(p_action->>'archived')::boolean THEN outcome:='unchanged';nextrev:=r.revision;
    ELSE nextrev:=r.revision+1;UPDATE public.uc_custom_journal_records SET revision=nextrev,archived=(p_action->>'archived')::boolean,recorded_at=clock_timestamp(),recorded_by=actor WHERE id=rid RETURNING * INTO r;END IF;
   END IF;
   IF outcome='applied'THEN INSERT INTO public.uc_custom_journal_history(record_id,journal_id,organization_id,schema_version_id,revision,action,reason,field_values,subject_user_id,archived,recorded_at,recorded_by)VALUES(rid,jid,p_organization_id,r.schema_version_id,r.revision,op,reason,r.field_values,subject,r.archived,r.recorded_at,actor);END IF;
  END IF;
 END IF;
 receipt:=jsonb_build_object('request_id',p_request_id,'action',op,'journal_id',jid,'entity_id',coalesce(rid,jid),'revision_applied',nextrev,'outcome',outcome,'replayed',false);
 INSERT INTO public.uc_custom_journal_requests(actor_id,request_id,organization_id,journal_id,record_id,subject_user_id,payload_hash,receipt)VALUES(actor,p_request_id,p_organization_id,jid,rid,subject,payload_hash,receipt);
 RETURN public.uc_custom_journal_base(p_organization_id)||jsonb_build_object('receipt',receipt,'journal',public.uc_custom_journal_detail(jid),'record',public.uc_custom_journal_record_json(rid));
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');RETURN NULL;
END;$fn$;

CREATE FUNCTION public.uc_custom_journal_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE erased uuid:=nullif(current_setting('sintagma.account_deletion_erase_user',true),'')::uuid;j jsonb;BEGIN
 IF TG_OP<>'INSERT'AND auth.role()='service_role'AND erased IS NOT NULL AND EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=erased)
 AND erased::text=ANY(ARRAY[to_jsonb(OLD)->>'subject_user_id',to_jsonb(OLD)->>'recorded_by',to_jsonb(OLD)->>'created_by',to_jsonb(OLD)->>'updated_by',to_jsonb(OLD)->>'actor_id'])THEN RETURN CASE WHEN TG_OP='DELETE'THEN OLD ELSE NEW END;END IF;
 IF TG_OP='DELETE'OR TG_OP='UPDATE'AND TG_TABLE_NAME IN('uc_custom_journal_schemas','uc_custom_journal_history','uc_custom_journal_requests')THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 IF TG_OP='UPDATE'THEN
  IF TG_TABLE_NAME='uc_custom_journals'THEN
   IF NEW.revision<>OLD.revision+1 OR(to_jsonb(OLD)-ARRAY['title','description','revision','current_schema_id','archived','updated_by'])IS DISTINCT FROM(to_jsonb(NEW)-ARRAY['title','description','revision','current_schema_id','archived','updated_by'])THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
  ELSE
   IF NEW.revision<>OLD.revision+1 OR(to_jsonb(OLD)-ARRAY['revision','schema_version_id','field_values','archived','recorded_at','recorded_by'])IS DISTINCT FROM(to_jsonb(NEW)-ARRAY['revision','schema_version_id','field_values','archived','recorded_at','recorded_by'])THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
  END IF;
 END IF;
 RETURN NEW;
END;$fn$;
DO $triggers$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['uc_custom_journals','uc_custom_journal_schemas','uc_custom_journal_records','uc_custom_journal_history','uc_custom_journal_requests']LOOP EXECUTE format('CREATE TRIGGER uc_custom_journal_private_history BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_custom_journal_guard()',t);END LOOP;END;$triggers$;
CREATE FUNCTION public.uc_custom_journal_personal_counts(p_user uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE t text;c text;n bigint;result jsonb:='[]';BEGIN
 FOR t,c IN SELECT * FROM(VALUES('uc_custom_journals','created_by'),('uc_custom_journals','updated_by'),('uc_custom_journal_schemas','created_by'),('uc_custom_journal_records','subject_user_id'),('uc_custom_journal_records','recorded_by'),('uc_custom_journal_history','subject_user_id'),('uc_custom_journal_history','recorded_by'),('uc_custom_journal_requests','actor_id'),('uc_custom_journal_requests','subject_user_id'))x(t,c)LOOP
  EXECUTE format('SELECT count(*)FROM public.%I WHERE %I=$1',t,c)INTO n USING p_user;
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table',t,'column',c,'count',n));END IF;
 END LOOP;RETURN result;
END;$fn$;
CREATE FUNCTION public.uc_custom_journal_erase_user(p_user uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.role()IS DISTINCT FROM 'service_role'OR current_setting('sintagma.account_deletion_erase_user',true)IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 DELETE FROM public.uc_custom_journal_requests WHERE actor_id=p_user OR subject_user_id=p_user;
 DELETE FROM public.uc_custom_journal_history WHERE subject_user_id=p_user;
 DELETE FROM public.uc_custom_journal_records WHERE subject_user_id=p_user;
 -- Conservatively remove the erased author's entire attributed free-text copy.
 -- This is exact-reference erasure, not discovery of third-party PII in arbitrary text.
 UPDATE public.uc_custom_journal_history SET recorded_by=NULL,field_values='{}',reason='',redacted=true WHERE recorded_by=p_user;
 UPDATE public.uc_custom_journal_records SET recorded_by=NULL,field_values='{}',redacted=true WHERE recorded_by=p_user;
 UPDATE public.uc_custom_journal_schemas SET created_by=NULL,fields='[]',title='',description='',reason='',redacted=true WHERE created_by=p_user;
 UPDATE public.uc_custom_journals SET created_by=NULL,updated_by=NULL,title='',description='',redacted=true WHERE created_by=p_user OR updated_by=p_user;
 IF public.uc_custom_journal_personal_counts(p_user)<>'[]'::jsonb THEN PERFORM public.uc_custom_journal_error('DEPENDENCY_UNAVAILABLE');END IF;
END;$fn$;
-- Only the post-UC014/held116 erasure definitions are accepted, not released115.
-- Exact post609 privacy sequence; preserve full in-database pg_proc metadata exceptprosrc.
DO $uc015_privacy_1$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_personal_row_counts(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC015';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM 'd263532fd944bf09e2adec1f0eac9fee' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC015';END IF;
 v_patched:=v_original;
 v_needle:=$uc015_privacy_1_needle_0$ RETURN result;$uc015_privacy_1_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC015';END IF;
 v_patched:=replace(v_patched,v_needle,$uc015_privacy_1_replacement_0$ result:=result||public.uc_custom_journal_personal_counts(p_user_id);
 RETURN result;$uc015_privacy_1_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM 'bf7c8c1cb09cfdfe35b3c67ecc653ff3' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC015';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC015';END IF;
END;
$uc015_privacy_1$;

DO $uc015_privacy_2$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_snapshot(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC015';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM 'dce5ffea181b5136a9eb82490438f962' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC015';END IF;
 v_patched:=v_original;
 v_needle:=$uc015_privacy_2_needle_0$ v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc015_privacy_2_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC015';END IF;
 v_patched:=replace(v_patched,v_needle,$uc015_privacy_2_replacement_0$ SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_custom_journal_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','custom_journals','label','Собственные журналы: строки выбранного лица удаляются, авторские копии обезличиваются','count',v_count,'action','delete_or_anonymize'));END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc015_privacy_2_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM 'f3100b7f572115c4b22c84a82690a584' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC015';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC015';END IF;
END;
$uc015_privacy_2$;

DO $uc015_privacy_3$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_erase_data(uuid,text)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC015';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM '8b2de268a017d85ee99eb3acee4c87a5' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC015';END IF;
 v_patched:=v_original;
 v_needle:=$uc015_privacy_3_needle_0$ PERFORM public.uc_learning_erase_user(u);$uc015_privacy_3_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC015';END IF;
 v_patched:=replace(v_patched,v_needle,$uc015_privacy_3_replacement_0$ PERFORM public.uc_learning_erase_user(u);
 PERFORM public.uc_custom_journal_erase_user(u);$uc015_privacy_3_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM '96a99f5bbe4c1389ef920dcdc82ce82b' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC015';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC015';END IF;
END;
$uc015_privacy_3$;

DO $function_acl$ DECLARE f record;g record;BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(p.proname LIKE 'uc_custom_journal_%'OR p.proname IN('read_custom_journals','apply_custom_journal_action'))LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.oid=f.oid AND a.grantee<>p.proowner LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s CASCADE',f.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC'ELSE quote_ident(pg_get_userbyid(g.grantee))END);END LOOP;
 END LOOP;
END;$function_acl$;
GRANT EXECUTE ON FUNCTION public.read_custom_journals(uuid,jsonb),public.apply_custom_journal_action(uuid,bigint,uuid,jsonb)TO authenticated;
