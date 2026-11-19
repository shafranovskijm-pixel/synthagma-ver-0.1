-- Automatic preparation intents, not admission decisions, signed orders or registration.
-- Existing enrollments are not backfilled. Only new inserts and explicit commands.
DO $preflight$ BEGIN
 IF to_regprocedure('public.uc_document_action_allowed(uuid,text,uuid,uuid)') IS NULL
 OR to_regprocedure('public.uc_document_scope_allowed(uuid,uuid,uuid)') IS NULL
 OR to_regprocedure('public.uc_document_record_scope(uuid,uuid,uuid,uuid,uuid)') IS NULL
 OR to_regprocedure('public.uc_platform_document_action_allowed(uuid,text)') IS NULL
 OR to_regprocedure('public.uc_admission_program(uuid,uuid,uuid,uuid)') IS NULL
 OR to_regprocedure('public.uc_identification_actor_allowed(uuid,boolean)') IS NULL
 OR to_regprocedure('public.uc_identification_target_allowed(uuid,uuid,boolean)') IS NULL
 OR to_regclass('public.uc_document_registry_records') IS NULL
 OR to_regclass('public.student_group_memberships_effective') IS NULL THEN
  RAISE EXCEPTION 'ADMISSION_AUTOMATION_DEPENDENCY_UNAVAILABLE';
 END IF;
 IF to_regclass('public.uc_automatic_admission_drafts') IS NOT NULL THEN
  RAISE EXCEPTION 'ADMISSION_AUTOMATION_ALREADY_INSTALLED';
 END IF;
END;$preflight$;

CREATE TABLE public.uc_admission_document_preferences(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 scope_key text NOT NULL, scope_kind text NOT NULL CHECK(scope_kind IN('organization','group','enrollment')),
 group_id uuid REFERENCES public.student_groups(id) ON DELETE CASCADE,
 enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE CASCADE,
 user_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 enabled boolean, document_date date, effective_admission_date date, timezone text,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
 UNIQUE(organization_id,scope_key),
 CHECK((scope_kind='organization' AND group_id IS NULL AND enrollment_id IS NULL AND user_id IS NULL)
 OR(scope_kind='group' AND group_id IS NOT NULL AND enrollment_id IS NULL AND user_id IS NULL)
 OR(scope_kind='enrollment' AND group_id IS NOT NULL AND enrollment_id IS NOT NULL AND user_id IS NOT NULL)),
 CHECK(scope_kind='organization' OR timezone IS NULL),
 CHECK(scope_kind<>'organization' OR(document_date IS NULL AND effective_admission_date IS NULL))
);
CREATE TABLE public.uc_automatic_admission_drafts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 enrollment_id uuid NOT NULL UNIQUE REFERENCES public.enrollments(id) ON DELETE CASCADE,
 course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
 observed_group_id uuid REFERENCES public.student_groups(id) ON DELETE SET NULL,
 group_id uuid REFERENCES public.student_groups(id) ON DELETE SET NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
 document_date date NOT NULL,effective_admission_date date NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL CHECK(status IN('prepared','needs_information','disabled')),
 preparation_mode text NOT NULL DEFAULT 'automatic' CHECK(preparation_mode IN('automatic','manual')),
 missing_facts text[] NOT NULL DEFAULT '{}',source_revision bigint NOT NULL,
 program_ref jsonb,policy_revisions jsonb NOT NULL
);
CREATE INDEX uc_automatic_admission_drafts_group ON public.uc_automatic_admission_drafts(organization_id,group_id,enrollment_id);
CREATE INDEX uc_automatic_admission_drafts_subject ON public.uc_automatic_admission_drafts(user_id);
CREATE TABLE public.uc_admission_document_preference_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 preference_id uuid NOT NULL REFERENCES public.uc_admission_document_preferences(id) ON DELETE CASCADE,
 revision bigint NOT NULL,reason text NOT NULL CHECK(reason IN('manual_settings','inherit_reset')),
 preferences jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,UNIQUE(preference_id,revision)
);
CREATE TABLE public.uc_admission_document_requests(
 actor_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,request_id uuid NOT NULL,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE CASCADE,
 user_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE,
 payload_hash text NOT NULL,result jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,request_id)
);
DO $acl$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['uc_admission_document_preferences','uc_automatic_admission_drafts','uc_admission_document_preference_events','uc_admission_document_requests'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',name);
 END LOOP;
END;$acl$;

CREATE FUNCTION public.uc_admission_document_error(code text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION USING MESSAGE='ADMISSION_AUTOMATION_'||code,
 ERRCODE=CASE WHEN code='ACCESS_DENIED' THEN '42501' WHEN code IN('REVISION_CONFLICT','REQUEST_MISMATCH','SOURCE_CHANGED','REGISTERED_DOCUMENT') THEN '40001' ELSE '22023' END; END;$fn$;

CREATE FUNCTION public.uc_admission_document_scope(p_org uuid,p_scope jsonb,p_write boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE kind text:=p_scope->>'kind';g uuid;e uuid;u uuid;co uuid;key text;existing_group uuid;has_draft boolean;BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL OR NOT public.account_deletion_access_allowed()
 OR NOT public.uc_platform_document_action_allowed(auth.uid(),CASE WHEN p_write THEN 'write' ELSE 'read' END)
 OR NOT public.uc_identification_actor_allowed(auth.uid(),p_write) OR public.is_user_blocked(auth.uid())
 OR NOT coalesce(public.can_access_organization(p_org,CASE WHEN p_write THEN 'documents.write' ELSE 'documents.read' END),false)
 OR jsonb_typeof(p_scope) IS DISTINCT FROM 'object' THEN PERFORM public.uc_admission_document_error('ACCESS_DENIED');END IF;
 IF kind='organization' AND p_scope=jsonb_build_object('kind','organization') THEN
  IF NOT coalesce(public.can_access_organization(p_org,CASE WHEN p_write THEN 'settings.write' ELSE 'settings.read' END),false)
  OR NOT public.uc_document_scope_allowed(p_org,NULL,NULL) THEN PERFORM public.uc_admission_document_error('ACCESS_DENIED');END IF;
  key:='organization';
 ELSIF kind='group' AND public.uc_custom_journal_shape(p_scope,ARRAY['kind','group_id']) AND public.uc_custom_journal_uuid(p_scope->'group_id') THEN
  g:=(p_scope->>'group_id')::uuid;key:='group:'||g;
  IF NOT public.uc_document_action_allowed(p_org,CASE WHEN p_write THEN 'write' ELSE 'read' END,g,NULL) THEN PERFORM public.uc_admission_document_error('ACCESS_DENIED');END IF;
 ELSIF kind='enrollment' AND public.uc_custom_journal_shape(p_scope,ARRAY['kind','enrollment_id','group_id'])
 AND public.uc_custom_journal_uuid(p_scope->'enrollment_id') AND(p_scope->'group_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_scope->'group_id')) THEN
  e:=(p_scope->>'enrollment_id')::uuid;g:=(p_scope->>'group_id')::uuid;
  SELECT x.user_id,x.course_id INTO u,co FROM public.enrollments x JOIN public.courses c ON c.id=x.course_id WHERE x.id=e AND c.organization_id=p_org;
  IF NOT FOUND OR auth.uid()=u OR NOT coalesce(public.uc_identification_target_allowed(p_org,u,p_write),false) OR NOT public.uc_document_action_allowed(p_org,CASE WHEN p_write THEN 'write' ELSE 'read' END,NULL,e) THEN PERFORM public.uc_admission_document_error('ACCESS_DENIED');END IF;
  IF g IS NOT NULL AND (NOT public.uc_document_scope_allowed(p_org,g,NULL) OR NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m JOIN public.student_groups s ON s.id=m.group_id AND s.organization_id=m.organization_id
   WHERE m.organization_id=p_org AND m.group_id=g AND m.user_id=u AND(s.course_id=co OR s.course_id IS NULL))) THEN PERFORM public.uc_admission_document_error('ACCESS_DENIED');END IF;
  IF p_write THEN
   SELECT d.group_id,true INTO existing_group,has_draft FROM public.uc_automatic_admission_drafts d WHERE d.enrollment_id=e AND d.organization_id=p_org;
   IF has_draft AND NOT public.uc_document_action_allowed(p_org,'write',existing_group,e)THEN PERFORM public.uc_admission_document_error('ACCESS_DENIED');END IF;
  END IF;
  key:='enrollment:'||e||':group:'||coalesce(g::text,'none');
 ELSE PERFORM public.uc_admission_document_error('INVALID_INPUT');END IF;
 IF kind<>'organization' AND NOT coalesce(public.can_access_organization(p_org,CASE WHEN p_write THEN 'students.write' ELSE 'students.read' END),false) THEN PERFORM public.uc_admission_document_error('ACCESS_DENIED');END IF;
 RETURN jsonb_build_object('kind',kind,'key',key,'group_id',g,'enrollment_id',e,'user_id',u);
END;$fn$;

CREATE FUNCTION public.uc_admission_document_effective(p_org uuid,p_group uuid,p_enrollment uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE orgp public.uc_admission_document_preferences;gp public.uc_admission_document_preferences;ep public.uc_admission_document_preferences;observed timestamptz;zone text;BEGIN
 SELECT * INTO orgp FROM public.uc_admission_document_preferences WHERE organization_id=p_org AND scope_key='organization';
 SELECT * INTO gp FROM public.uc_admission_document_preferences WHERE organization_id=p_org AND scope_key='group:'||p_group;
 SELECT * INTO ep FROM public.uc_admission_document_preferences WHERE organization_id=p_org AND scope_key='enrollment:'||p_enrollment||':group:'||coalesce(p_group::text,'none');
 -- The technical intent records when the system observed assignment. Lesson
 -- started_at is nullable and is never substituted for a legal admission date.
 IF p_enrollment IS NOT NULL THEN SELECT coalesce((SELECT recorded_at FROM public.uc_automatic_admission_drafts WHERE enrollment_id=p_enrollment),statement_timestamp()) INTO observed;END IF;
 zone:=coalesce(orgp.timezone,'Europe/Moscow');
 RETURN jsonb_build_object('enabled',coalesce(ep.enabled,gp.enabled,orgp.enabled,true),
 'document_date',coalesce(ep.document_date,gp.document_date,(observed AT TIME ZONE zone)::date),
 'effective_admission_date',coalesce(ep.effective_admission_date,gp.effective_admission_date,(observed AT TIME ZONE zone)::date),'timezone',zone,
 'sources',jsonb_build_object('enabled',CASE WHEN ep.enabled IS NOT NULL THEN 'enrollment' WHEN gp.enabled IS NOT NULL THEN 'group' WHEN orgp.enabled IS NOT NULL THEN 'organization' ELSE 'default' END,
 'document_date',CASE WHEN ep.document_date IS NOT NULL THEN 'enrollment' WHEN gp.document_date IS NOT NULL THEN 'group' ELSE 'enrollment_event' END,
 'effective_admission_date',CASE WHEN ep.effective_admission_date IS NOT NULL THEN 'enrollment' WHEN gp.effective_admission_date IS NOT NULL THEN 'group' ELSE 'enrollment_event' END),
 'policy_revisions',jsonb_build_object('organization',coalesce(orgp.revision,0),'group',coalesce(gp.revision,0),'enrollment',coalesce(ep.revision,0)));
END;$fn$;

CREATE FUNCTION public.uc_admission_document_registered(p_enrollment uuid,p_group uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 -- participant_ids include staff and erasure actors, not educational subjects.
 -- A group document without an exact retained subject bridge is not guessed.
 SELECT EXISTS(SELECT 1 FROM public.uc_document_registry_records r
 JOIN public.enrollments e ON e.id=p_enrollment JOIN public.courses c ON c.id=e.course_id
 WHERE r.organization_id=c.organization_id AND NOT r.redacted AND r.data->>'document_type'='enrollment_order'
 AND r.data->'subject'->>'kind'='student' AND r.data->'subject'->>'user_id'=e.user_id::text
 AND r.context_binding->>'enrollment_id'=e.id::text AND r.context_binding->>'user_id'=e.user_id::text
 AND r.context_binding->>'course_id'=e.course_id::text AND r.context_binding->>'organization_id'=c.organization_id::text
 AND r.context_binding->>'kind' IN('enrollment','enrollment_contract')
 AND r.data->'context'->>'kind'=r.context_binding->>'kind' AND r.data->'context'->>'enrollment_id'=e.id::text)
$fn$;

CREATE FUNCTION public.uc_admission_document_source(p_enrollment uuid,p_selected_group uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE e public.enrollments;org uuid;primary_group uuid;choices uuid[];chosen uuid;g public.student_groups;program jsonb;missing text[]:='{}';eff jsonb;BEGIN
 SELECT * INTO e FROM public.enrollments WHERE id=p_enrollment;
 SELECT organization_id INTO org FROM public.courses WHERE id=e.course_id;
 IF e.id IS NULL OR org IS NULL OR NOT coalesce(public.uc_identification_target_allowed(org,e.user_id,false),false) THEN RETURN NULL;END IF;
 SELECT student_group_id INTO primary_group FROM public.profiles WHERE user_id=e.user_id AND organization_id=org;
 SELECT array_agg(s.id ORDER BY s.id) INTO choices FROM public.student_groups s JOIN public.student_group_memberships_effective m ON m.group_id=s.id AND m.organization_id=s.organization_id
 WHERE s.organization_id=org AND m.user_id=e.user_id AND(s.course_id=e.course_id OR s.course_id IS NULL);
 IF NOT coalesce(primary_group=ANY(choices),false) THEN primary_group:=NULL;END IF;
 IF p_selected_group IS NOT NULL AND p_selected_group=ANY(choices) THEN chosen:=p_selected_group;
 ELSIF coalesce(cardinality(choices),0)=1 THEN chosen:=choices[1];END IF;
 IF chosen IS NULL THEN missing:=array_append(missing,CASE WHEN coalesce(cardinality(choices),0)>1 THEN 'ambiguous_group' ELSE 'group_not_selected' END);
 ELSE
  SELECT * INTO g FROM public.student_groups WHERE id=chosen AND organization_id=org;
  IF g.course_id IS DISTINCT FROM e.course_id THEN missing:=array_append(missing,'group_course_not_bound');END IF;
  program:=public.uc_admission_program(org,e.user_id,chosen,e.id);
  IF program IS NULL THEN missing:=array_append(missing,'program_not_confirmed');END IF;
 END IF;
 IF e.status IN('cancelled','revoked') THEN missing:=array_append(missing,'enrollment_cancelled');END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE user_id=e.user_id AND archived_at IS NOT NULL) THEN missing:=array_append(missing,'student_archived');END IF;
 eff:=public.uc_admission_document_effective(org,chosen,e.id);
 RETURN jsonb_build_object('organization_id',org,'enrollment_id',e.id,'course_id',e.course_id,'user_id',e.user_id,'observed_group_id',primary_group,'group_id',chosen,
 'source_revision',e.document_facts_revision,'program_ref',program,'missing_facts',to_jsonb(missing),'effective',eff);
END;$fn$;

CREATE FUNCTION public.uc_admission_draft_projection(p_draft uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d public.uc_automatic_admission_drafts;s jsonb;stale boolean;BEGIN
 SELECT * INTO d FROM public.uc_automatic_admission_drafts WHERE id=p_draft;
 IF d.id IS NULL THEN RETURN NULL;END IF;
 s:=public.uc_admission_document_source(d.enrollment_id,d.group_id);
 stale:=s IS NULL OR(s->>'group_id')::uuid IS DISTINCT FROM d.group_id OR(s->>'source_revision')::bigint IS DISTINCT FROM d.source_revision
 OR s->'program_ref' IS DISTINCT FROM coalesce(d.program_ref,'null'::jsonb)
 OR s#>'{effective,policy_revisions}' IS DISTINCT FROM d.policy_revisions
 OR(s#>>'{effective,document_date}')::date IS DISTINCT FROM d.document_date OR(s#>>'{effective,effective_admission_date}')::date IS DISTINCT FROM d.effective_admission_date
 OR s->'missing_facts' IS DISTINCT FROM to_jsonb(d.missing_facts);
 RETURN to_jsonb(d)||jsonb_build_object('stale',coalesce(stale,true),'registered_locked',public.uc_admission_document_registered(d.enrollment_id,d.group_id),'live_missing_facts',coalesce(s->'missing_facts','[]'));
END;$fn$;

CREATE FUNCTION public.uc_prepare_automatic_admission_draft(p_enrollment uuid,p_selected_group uuid DEFAULT NULL,p_manual boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s jsonb;d public.uc_automatic_admission_drafts;v_status text;g uuid;mode text;observed timestamptz:=statement_timestamp();BEGIN
 SELECT * INTO d FROM public.uc_automatic_admission_drafts WHERE enrollment_id=p_enrollment FOR UPDATE;
 g:=coalesce(p_selected_group,d.group_id);
 s:=public.uc_admission_document_source(p_enrollment,g);
 IF s IS NULL THEN RETURN NULL;END IF;
 IF d.id IS NOT NULL AND public.uc_admission_document_registered(p_enrollment,d.group_id) THEN RETURN d.id;END IF;
 mode:=CASE WHEN p_manual OR d.preparation_mode='manual' THEN 'manual' ELSE 'automatic' END;
 v_status:=CASE WHEN mode='automatic' AND NOT(s#>>'{effective,enabled}')::boolean THEN 'disabled' WHEN jsonb_array_length(s->'missing_facts')>0 THEN 'needs_information' ELSE 'prepared' END;
 IF d.id IS NULL THEN
  INSERT INTO public.uc_automatic_admission_drafts(organization_id,enrollment_id,course_id,user_id,observed_group_id,group_id,document_date,effective_admission_date,recorded_at,status,preparation_mode,missing_facts,source_revision,program_ref,policy_revisions)
  VALUES((s->>'organization_id')::uuid,p_enrollment,(s->>'course_id')::uuid,(s->>'user_id')::uuid,(s->>'observed_group_id')::uuid,(s->>'group_id')::uuid,
  (s#>>'{effective,document_date}')::date,(s#>>'{effective,effective_admission_date}')::date,observed,v_status,mode,ARRAY(SELECT jsonb_array_elements_text(s->'missing_facts')),(s->>'source_revision')::bigint,nullif(s->'program_ref','null'::jsonb),s#>'{effective,policy_revisions}')
  ON CONFLICT(enrollment_id) DO NOTHING RETURNING * INTO d;
  IF d.id IS NULL THEN SELECT * INTO d FROM public.uc_automatic_admission_drafts WHERE enrollment_id=p_enrollment;END IF;
 ELSIF public.uc_admission_draft_projection(d.id)->>'stale'='true' OR d.group_id IS DISTINCT FROM(s->>'group_id')::uuid OR d.status<>v_status OR d.preparation_mode<>mode THEN
  UPDATE public.uc_automatic_admission_drafts SET observed_group_id=(s->>'observed_group_id')::uuid,group_id=(s->>'group_id')::uuid,revision=revision+1,
   document_date=(s#>>'{effective,document_date}')::date,effective_admission_date=(s#>>'{effective,effective_admission_date}')::date,status=v_status,preparation_mode=mode,
   missing_facts=ARRAY(SELECT jsonb_array_elements_text(s->'missing_facts')),source_revision=(s->>'source_revision')::bigint,program_ref=nullif(s->'program_ref','null'::jsonb),policy_revisions=s#>'{effective,policy_revisions}',updated_at=clock_timestamp()
   WHERE id=d.id RETURNING * INTO d;
 END IF;
 RETURN d.id;
END;$fn$;
CREATE FUNCTION public.uc_enrollment_admission_intent_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.uc_prepare_automatic_admission_draft(NEW.id,NULL);RETURN NEW;END;$fn$;
CREATE TRIGGER uc_enrollment_admission_intent AFTER INSERT ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.uc_enrollment_admission_intent_trigger();

CREATE FUNCTION public.read_admission_document_settings(p_organization_id uuid,p_scope jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s jsonb;p public.uc_admission_document_preferences;g uuid;e uuid;d uuid;groups jsonb:='[]';write_ok boolean:=false;BEGIN
 s:=public.uc_admission_document_scope(p_organization_id,p_scope,false);g:=(s->>'group_id')::uuid;e:=(s->>'enrollment_id')::uuid;
 BEGIN PERFORM public.uc_admission_document_scope(p_organization_id,p_scope,true);write_ok:=true;EXCEPTION WHEN insufficient_privilege THEN write_ok:=false;END;
 SELECT * INTO p FROM public.uc_admission_document_preferences WHERE organization_id=p_organization_id AND scope_key=s->>'key';
 IF e IS NOT NULL THEN
  SELECT id INTO d FROM public.uc_automatic_admission_drafts WHERE enrollment_id=e AND organization_id=p_organization_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name)ORDER BY x.name,x.id),'[]') INTO groups FROM public.student_groups x JOIN public.student_group_memberships_effective m ON m.group_id=x.id AND m.organization_id=x.organization_id
  JOIN public.enrollments en ON en.id=e AND en.user_id=m.user_id WHERE x.organization_id=p_organization_id AND(x.course_id=en.course_id OR x.course_id IS NULL)AND public.uc_document_scope_allowed(p_organization_id,x.id,NULL);
 END IF;
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'scope',p_scope,'revision',coalesce(p.revision,0),
 'preferences',jsonb_build_object('enabled',p.enabled,'document_date',p.document_date,'effective_admission_date',p.effective_admission_date,'timezone',p.timezone),
 'effective',public.uc_admission_document_effective(p_organization_id,g,e),'groups',groups,'draft',CASE WHEN d IS NULL OR EXISTS(SELECT 1 FROM public.uc_automatic_admission_drafts x WHERE x.id=d AND public.uc_document_record_scope(p_organization_id,x.group_id,x.enrollment_id,x.user_id,x.course_id))THEN public.uc_admission_draft_projection(d)ELSE NULL END,
 'individual_date_overrides',CASE WHEN s->>'kind'='group' THEN(SELECT count(*)FROM public.uc_admission_document_preferences x JOIN public.enrollments en ON en.id=x.enrollment_id WHERE x.organization_id=p_organization_id AND x.group_id=g AND x.scope_kind='enrollment' AND(en.status IS NULL OR en.status NOT IN('cancelled','revoked'))AND(x.document_date IS NOT NULL OR x.effective_admission_date IS NOT NULL))ELSE NULL END,
 'capabilities',jsonb_build_object('can_read',true,'can_write',write_ok AND(e IS NULL OR g IS NOT NULL),'can_prepare',write_ok AND e IS NOT NULL,'can_apply_current',write_ok AND e IS NULL));
END;$fn$;

CREATE FUNCTION public.apply_admission_document_settings(p_organization_id uuid,p_scope jsonb,p_expected_revision bigint,p_request_id uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s jsonb;p public.uc_admission_document_preferences;act text:=p_command->>'action';payload text;old_request public.uc_admission_document_requests;result jsonb;v_values jsonb;g uuid;e uuid;u uuid;zone text;dd date;ad date;en boolean;after_id uuid;last_id uuid;row record;processed integer:=0;more boolean:=false;BEGIN
 s:=public.uc_admission_document_scope(p_organization_id,p_scope,true);g:=(s->>'group_id')::uuid;e:=(s->>'enrollment_id')::uuid;u:=(s->>'user_id')::uuid;
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR jsonb_typeof(p_command)IS DISTINCT FROM'object' THEN PERFORM public.uc_admission_document_error('INVALID_INPUT');END IF;
 payload:=md5(jsonb_build_object('org',p_organization_id,'scope',p_scope,'revision',p_expected_revision,'command',p_command)::text);
 PERFORM 1 FROM public.organizations WHERE id=p_organization_id FOR UPDATE;
 -- Recheck current authority after waiting for the serialization fence.
 s:=public.uc_admission_document_scope(p_organization_id,p_scope,true);
 SELECT * INTO old_request FROM public.uc_admission_document_requests WHERE actor_id=auth.uid()AND request_id=p_request_id;
 IF FOUND THEN IF old_request.payload_hash<>payload THEN PERFORM public.uc_admission_document_error('REQUEST_MISMATCH');END IF;RETURN old_request.result||jsonb_build_object('replayed',true,'state',public.read_admission_document_settings(p_organization_id,p_scope));END IF;
 SELECT * INTO p FROM public.uc_admission_document_preferences WHERE organization_id=p_organization_id AND scope_key=s->>'key' FOR UPDATE;
 IF coalesce(p.revision,0)<>p_expected_revision THEN PERFORM public.uc_admission_document_error('REVISION_CONFLICT');END IF;
 IF act IN('save','reset') THEN
  IF e IS NOT NULL AND(g IS NULL OR public.uc_admission_document_registered(e,g))THEN PERFORM public.uc_admission_document_error(CASE WHEN g IS NULL THEN 'INVALID_INPUT' ELSE 'REGISTERED_DOCUMENT' END);END IF;
  IF act='save' THEN
   IF NOT public.uc_custom_journal_shape(p_command,ARRAY['action','enabled','document_date','effective_admission_date','timezone','reason']) OR p_command->>'reason'<>'manual_settings'
   OR jsonb_typeof(p_command->'enabled')NOT IN('boolean','null') OR jsonb_typeof(p_command->'document_date')NOT IN('string','null') OR jsonb_typeof(p_command->'effective_admission_date')NOT IN('string','null') OR jsonb_typeof(p_command->'timezone')NOT IN('string','null') THEN PERFORM public.uc_admission_document_error('INVALID_INPUT');END IF;
   BEGIN dd:=(p_command->>'document_date')::date;ad:=(p_command->>'effective_admission_date')::date;EXCEPTION WHEN OTHERS THEN PERFORM public.uc_admission_document_error('INVALID_INPUT');END;
   IF dd IS NOT NULL AND(dd::text<>p_command->>'document_date' OR length(p_command->>'document_date')<>10)OR ad IS NOT NULL AND(ad::text<>p_command->>'effective_admission_date' OR length(p_command->>'effective_admission_date')<>10)THEN PERFORM public.uc_admission_document_error('INVALID_INPUT');END IF;
   en:=(p_command->>'enabled')::boolean;zone:=p_command->>'timezone';
   IF(s->>'kind'='organization' AND(dd IS NOT NULL OR ad IS NOT NULL))OR(s->>'kind'<>'organization' AND zone IS NOT NULL)OR(zone IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone))THEN PERFORM public.uc_admission_document_error('INVALID_INPUT');END IF;
  ELSE
   IF p_command<>jsonb_build_object('action','reset','reason','inherit_reset')THEN PERFORM public.uc_admission_document_error('INVALID_INPUT');END IF;
   dd:=NULL;ad:=NULL;en:=NULL;zone:=NULL;
  END IF;
  v_values:=jsonb_build_object('enabled',en,'document_date',dd,'effective_admission_date',ad,'timezone',zone);
  IF p.id IS NULL THEN
   INSERT INTO public.uc_admission_document_preferences(organization_id,scope_key,scope_kind,group_id,enrollment_id,user_id,revision,enabled,document_date,effective_admission_date,timezone,updated_by)
   VALUES(p_organization_id,s->>'key',s->>'kind',g,e,u,1,en,dd,ad,zone,auth.uid())RETURNING * INTO p;
  ELSIF jsonb_build_object('enabled',p.enabled,'document_date',p.document_date,'effective_admission_date',p.effective_admission_date,'timezone',p.timezone)IS DISTINCT FROM v_values THEN
   UPDATE public.uc_admission_document_preferences SET revision=revision+1,enabled=en,document_date=dd,effective_admission_date=ad,timezone=zone,updated_at=clock_timestamp(),updated_by=auth.uid()WHERE id=p.id RETURNING * INTO p;
  END IF;
  INSERT INTO public.uc_admission_document_preference_events(organization_id,preference_id,revision,reason,preferences,actor_id)VALUES(p_organization_id,p.id,p.revision,p_command->>'reason',v_values,auth.uid())ON CONFLICT(preference_id,revision)DO NOTHING;
  IF e IS NOT NULL AND EXISTS(SELECT 1 FROM public.uc_automatic_admission_drafts WHERE enrollment_id=e)THEN PERFORM public.uc_prepare_automatic_admission_draft(e,g);END IF;
 ELSIF act='prepare_existing' THEN
  IF e IS NULL OR p_command<>jsonb_build_object('action','prepare_existing','reason','prepare_existing')THEN PERFORM public.uc_admission_document_error('INVALID_INPUT');END IF;
  IF public.uc_admission_document_registered(e,g)THEN PERFORM public.uc_admission_document_error('REGISTERED_DOCUMENT');END IF;
  PERFORM public.uc_prepare_automatic_admission_draft(e,g,true);
 ELSIF act='apply_current' THEN
  IF e IS NOT NULL OR NOT public.uc_custom_journal_shape(p_command,ARRAY['action','after_enrollment_id','reason'])OR p_command->>'reason'<>'apply_to_pending'
  OR NOT(p_command->'after_enrollment_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_command->'after_enrollment_id'))THEN PERFORM public.uc_admission_document_error('INVALID_INPUT');END IF;
  after_id:=(p_command->>'after_enrollment_id')::uuid;
  FOR row IN SELECT x.enrollment_id,x.group_id FROM public.uc_automatic_admission_drafts x WHERE x.organization_id=p_organization_id AND(g IS NULL OR x.group_id=g)AND(after_id IS NULL OR x.enrollment_id>after_id)ORDER BY x.enrollment_id LIMIT 101 LOOP
   IF processed=100 THEN more:=true;EXIT;END IF;
   IF public.uc_document_action_allowed(p_organization_id,'write',row.group_id,row.enrollment_id)AND NOT public.uc_admission_document_registered(row.enrollment_id,row.group_id)THEN PERFORM public.uc_prepare_automatic_admission_draft(row.enrollment_id,row.group_id);END IF;
   processed:=processed+1;last_id:=row.enrollment_id;
  END LOOP;
 ELSE PERFORM public.uc_admission_document_error('INVALID_INPUT');END IF;
 result:=jsonb_build_object('schema_version',1,'request_id',p_request_id,'replayed',false,'processed',processed,'next_after_enrollment_id',CASE WHEN more THEN last_id ELSE NULL END);
 INSERT INTO public.uc_admission_document_requests(actor_id,request_id,organization_id,enrollment_id,user_id,payload_hash,result)VALUES(auth.uid(),p_request_id,p_organization_id,e,u,payload,result);
 RETURN result||jsonb_build_object('state',public.read_admission_document_settings(p_organization_id,p_scope));
END;$fn$;

CREATE FUNCTION public.read_automatic_admission_draft(p_organization_id uuid,p_enrollment_id uuid,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d public.uc_automatic_admission_drafts;projection jsonb;org_name text;student_name text;course_title text;group_name text;program_title text;BEGIN
 SELECT * INTO d FROM public.uc_automatic_admission_drafts WHERE organization_id=p_organization_id AND enrollment_id=p_enrollment_id;
 IF d.id IS NULL THEN PERFORM public.uc_admission_document_error('INVALID_INPUT');END IF;
 PERFORM public.uc_admission_document_scope(p_organization_id,jsonb_build_object('kind','enrollment','enrollment_id',p_enrollment_id,'group_id',d.group_id),false);
 projection:=public.uc_admission_draft_projection(d.id);
 IF d.revision IS DISTINCT FROM p_expected_revision OR(projection->>'stale')::boolean THEN PERFORM public.uc_admission_document_error('SOURCE_CHANGED');END IF;
 IF(projection->>'registered_locked')::boolean THEN PERFORM public.uc_admission_document_error('REGISTERED_DOCUMENT');END IF;
 IF d.status='disabled' THEN PERFORM public.uc_admission_document_error('INVALID_INPUT');END IF;
 SELECT name INTO org_name FROM public.organizations WHERE id=p_organization_id;
 SELECT full_name INTO student_name FROM public.profiles WHERE user_id=d.user_id;
 SELECT title INTO course_title FROM public.courses WHERE id=d.course_id;
 SELECT name INTO group_name FROM public.student_groups WHERE id=d.group_id;
 SELECT facts->>'full_title' INTO program_title FROM public.program_fact_versions WHERE id=(d.program_ref->>'version_id')::uuid;
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'enrollment_id',d.enrollment_id,'draft_id',d.id,'revision',d.revision,
 'document_date',d.document_date,'effective_admission_date',d.effective_admission_date,'recorded_at',d.recorded_at,'status',d.status,'missing_facts',to_jsonb(d.missing_facts),
 'organization_name',coalesce(org_name,''),'student_name',coalesce(student_name,''),'course_title',coalesce(course_title,''),'group_name',group_name,'program_title',program_title);
END;$fn$;

DO $functions_acl$ DECLARE row record;BEGIN
 FOR row IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(p.proname LIKE 'uc_admission_document_%'OR p.proname IN('uc_admission_draft_projection','uc_prepare_automatic_admission_draft','uc_enrollment_admission_intent_trigger','read_admission_document_settings','apply_admission_document_settings','read_automatic_admission_draft'))LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',row.signature);
 END LOOP;
END;$functions_acl$;
GRANT EXECUTE ON FUNCTION public.read_admission_document_settings(uuid,jsonb),public.apply_admission_document_settings(uuid,jsonb,bigint,uuid,jsonb),public.read_automatic_admission_draft(uuid,uuid,bigint) TO authenticated;
