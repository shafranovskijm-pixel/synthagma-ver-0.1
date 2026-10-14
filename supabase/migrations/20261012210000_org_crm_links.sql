-- S-049: explicit company/student CRM links and permission-filtered factual chronology.
DO $preflight$
DECLARE r jsonb; t text;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.org_crm_clients'::regclass AND attname IN('company_id','student_user_id','linked_at') AND NOT attisdropped) THEN RAISE EXCEPTION 'CRM subject columns already exist'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY['org_crm_resolve_subject','org_crm_link_subject','org_crm_context'])) THEN RAISE EXCEPTION 'CRM subject functions already exist'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements('[{"signature":"account_deletion_access_allowed()","body_md5":"6c078d0f1aa1f6b5af15485f0eaccb2a","definition_md5":"64b0a90b7db9813950ccca6dff208f3a","acl":["anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"account_deletion_snapshot(uuid)","body_md5":"1f973f5048873db00cf52e0293f14b71","definition_md5":"d78150e2f8544eb726a56c63f32c40ad","acl":["postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"can_access_organization(uuid,text)","body_md5":"ad720ba20dc32362ed009b2917cc2d9c","definition_md5":"2e11495f3d3e6ca261af8a08ed874269","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"get_org_staff_permissions(uuid,uuid)","body_md5":"f8d82709ae27730782dc4f455b35b7de","definition_md5":"c0ea40b20bbd1a71aa31cdbcbb7fc0b3","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"has_org_staff_permission(uuid,uuid,text)","body_md5":"b9c87ca03c3e95a57baf9122753792e2","definition_md5":"3d1fedafe94778fa19dd47acb71a3782","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"has_role(app_role,uuid)","body_md5":"5457df2171dee5cee3641e64285928f2","definition_md5":"20c46f708cc2e7fa51b640290151a59e","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"has_role(uuid,app_role)","body_md5":"4e852b30ef52ba5263c4e11d1aec8cf0","definition_md5":"82a7fa1cd06301bb83b010bc315aee0b","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"is_org_owner(uuid,uuid)","body_md5":"5894db724b2a3cbc52701cabfb2cf73c","definition_md5":"362aca6afc26c775be594843258b2ab2","acl":["anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"is_student_profile(uuid,uuid)","body_md5":"84081e97d17f223d9e2ffa4145bf8949","definition_md5":"92c79c1ec4600ef54941dc9590b39aa8","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"normalize_org_staff_permission(text)","body_md5":"2d47924fe022372f2dc128a979d56a53","definition_md5":"bb385c2b288bb966297a8504df1696ea","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"org_crm_access_allowed(uuid,text)","body_md5":"395b7dd7b17fd70aa2d3a48b62bc689c","definition_md5":"cffa1ca2a147ed968f3470edf1aac164","acl":["authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"org_crm_add_activity(uuid,uuid,uuid,text,text)","body_md5":"2501e3eb2daf97693e8f697c8a5c48f8","definition_md5":"3a012e860f3c70dae2e124cca34240e4","acl":["authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"org_crm_require_write(uuid,jsonb,text[])","body_md5":"25068d464680549eb8c22fc6adf18122","definition_md5":"ab99e5e0103b9d5fa85aca9d49d52674","acl":["postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"org_crm_save_client(uuid,uuid,jsonb,timestamp with time zone)","body_md5":"7b134fb064cfd07b023afdc4a442206a","definition_md5":"0ff79938766aab87e700655a739fc3a3","acl":["authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"org_crm_save_deal(uuid,uuid,jsonb,timestamp with time zone)","body_md5":"ace205eaf6b7c7c02cf8d0e82cfc03fe","definition_md5":"02f514e4efe5a2650b96031b330c4d61","acl":["authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"org_crm_save_task(uuid,uuid,jsonb,timestamp with time zone)","body_md5":"ca55d6b06d228f9360b02a3a07bbd496","definition_md5":"8ea971887f88e759151d28bae9e5083d","acl":["authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"org_crm_snapshot(uuid)","body_md5":"bd2671fa878f290896ffda1f51e3f85c","definition_md5":"4950d9dcf9aaffc89ee235ea9f330baa","acl":["authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"org_crm_task_assignees(uuid)","body_md5":"87030d81a62da2191aca264eea8c5fff","definition_md5":"3673680fa2cf49768124353bf92848ce","acl":["postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"org_role_default_permissions(text)","body_md5":"2e440ec2b8552f215d00bd88ad7af166","definition_md5":"f2b39953a0c439d75079d72d5e103247","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]}]'::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||(r->>'signature')) AND md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=r->>'body_md5'
   AND md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))=r->>'definition_md5'
   AND COALESCE((SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(p.proacl)a),'null'::jsonb)=r->'acl') THEN RAISE EXCEPTION 'CRM links helper drift: %',r->>'signature'; END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements('[{"table":"organizations","name":"id","type":"uuid"},{"table":"organizations","name":"subscription_plan","type":"text"},{"table":"profiles","name":"id","type":"uuid"},{"table":"profiles","name":"user_id","type":"uuid"},{"table":"profiles","name":"organization_id","type":"uuid"},{"table":"profiles","name":"company_id","type":"uuid"},{"table":"profiles","name":"full_name","type":"text"},{"table":"companies","name":"id","type":"uuid"},{"table":"companies","name":"organization_id","type":"uuid"},{"table":"companies","name":"name","type":"text"},{"table":"companies","name":"inn","type":"text"},{"table":"student_roster_removals","name":"organization_id","type":"uuid"},{"table":"student_roster_removals","name":"user_id","type":"uuid"},{"table":"account_deletion_revocations","name":"user_id","type":"uuid"},{"table":"enrollments","name":"id","type":"uuid"},{"table":"enrollments","name":"user_id","type":"uuid"},{"table":"enrollments","name":"course_id","type":"uuid"},{"table":"enrollments","name":"started_at","type":"timestamp with time zone"},{"table":"enrollments","name":"completed_at","type":"timestamp with time zone"},{"table":"courses","name":"id","type":"uuid"},{"table":"courses","name":"organization_id","type":"uuid"},{"table":"courses","name":"title","type":"text"},{"table":"course_access_log","name":"id","type":"uuid"},{"table":"course_access_log","name":"user_id","type":"uuid"},{"table":"course_access_log","name":"course_id","type":"uuid"},{"table":"course_access_log","name":"organization_id","type":"uuid"},{"table":"course_access_log","name":"accessed_at","type":"timestamp with time zone"},{"table":"student_login_history","name":"id","type":"uuid"},{"table":"student_login_history","name":"user_id","type":"uuid"},{"table":"student_login_history","name":"organization_id","type":"uuid"},{"table":"student_login_history","name":"logged_in_at","type":"timestamp with time zone"},{"table":"company_documents","name":"id","type":"uuid"},{"table":"company_documents","name":"company_id","type":"uuid"},{"table":"company_documents","name":"uploaded_at","type":"timestamp with time zone"},{"table":"company_documents","name":"name","type":"text"},{"table":"company_documents","name":"deleted_at","type":"timestamp with time zone"},{"table":"student_documents","name":"id","type":"uuid"},{"table":"student_documents","name":"enrollment_id","type":"uuid"},{"table":"student_documents","name":"name","type":"text"},{"table":"student_documents","name":"created_at","type":"timestamp with time zone"},{"table":"education_document_records","name":"id","type":"uuid"},{"table":"education_document_records","name":"organization_id","type":"uuid"},{"table":"education_document_records","name":"user_id","type":"uuid"},{"table":"education_document_records","name":"enrollment_id","type":"uuid"},{"table":"education_document_records","name":"document_type","type":"text"},{"table":"education_document_records","name":"document_number","type":"text"},{"table":"education_document_records","name":"issue_date","type":"date"},{"table":"education_document_records","name":"created_at","type":"timestamp with time zone"},{"table":"education_document_records","name":"deleted_at","type":"timestamp with time zone"},{"table":"org_crm_clients","name":"id","type":"uuid"},{"table":"org_crm_clients","name":"organization_id","type":"uuid"},{"table":"org_crm_clients","name":"org_name","type":"text"},{"table":"org_crm_clients","name":"inn","type":"text"},{"table":"org_crm_clients","name":"created_by","type":"uuid"},{"table":"org_crm_clients","name":"created_at","type":"timestamp with time zone"},{"table":"org_crm_clients","name":"updated_at","type":"timestamp with time zone"},{"table":"org_crm_deals","name":"id","type":"uuid"},{"table":"org_crm_deals","name":"organization_id","type":"uuid"},{"table":"org_crm_deals","name":"client_id","type":"uuid"},{"table":"org_crm_deals","name":"title","type":"text"},{"table":"org_crm_deals","name":"created_at","type":"timestamp with time zone"},{"table":"org_crm_tasks","name":"id","type":"uuid"},{"table":"org_crm_tasks","name":"organization_id","type":"uuid"},{"table":"org_crm_tasks","name":"client_id","type":"uuid"},{"table":"org_crm_tasks","name":"title","type":"text"},{"table":"org_crm_tasks","name":"created_at","type":"timestamp with time zone"},{"table":"org_crm_tasks","name":"completed_at","type":"timestamp with time zone"},{"table":"org_crm_tasks","name":"status","type":"text"},{"table":"org_crm_activities","name":"id","type":"uuid"},{"table":"org_crm_activities","name":"organization_id","type":"uuid"},{"table":"org_crm_activities","name":"client_id","type":"uuid"},{"table":"org_crm_activities","name":"activity_type","type":"text"},{"table":"org_crm_activities","name":"description","type":"text"},{"table":"org_crm_activities","name":"created_at","type":"timestamp with time zone"}]'::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||(r->>'table')) AND a.attname=r->>'name' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)=r->>'type') THEN RAISE EXCEPTION 'CRM links column drift: %.%',r->>'table',r->>'name'; END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['org_crm_clients','org_crm_deals','org_crm_tasks','org_crm_activities'] LOOP
  IF NOT(SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass) OR NOT has_table_privilege('authenticated','public.'||t,'SELECT')
   OR has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE') OR has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'CRM links table access drift: %',t; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t)<>2 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='org_crm_read' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND qual='org_crm_access_allowed(organization_id, ''sales.read''::text)')
   OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='account_deletion_no_revoked_access' AND permissive='RESTRICTIVE') THEN RAISE EXCEPTION 'CRM links policy drift: %',t; END IF;
 END LOOP;
END $preflight$;

-- Explicit, optional links to existing organization records. Reads never create CRM data.
ALTER TABLE public.org_crm_clients
 ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
 ADD COLUMN student_user_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
 ADD COLUMN linked_at timestamptz,
 ADD CONSTRAINT org_crm_clients_one_subject CHECK(num_nonnulls(company_id,student_user_id)<=1),
 ADD CONSTRAINT org_crm_clients_link_timestamp CHECK((company_id IS NULL AND student_user_id IS NULL) OR linked_at IS NOT NULL);
CREATE UNIQUE INDEX org_crm_clients_company_subject ON public.org_crm_clients(organization_id,company_id) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX org_crm_clients_student_subject ON public.org_crm_clients(organization_id,student_user_id) WHERE student_user_id IS NOT NULL;

-- Private resolver checks current source membership, not names, copied labels or profile-first org.
CREATE FUNCTION public.org_crm_resolve_subject(p_organization_id uuid,p_entity_type text,p_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN RAISE EXCEPTION 'crm_forbidden' USING ERRCODE='42501'; END IF;
 IF p_entity_type='company' THEN
  IF NOT COALESCE(public.can_access_organization(p_organization_id,'companies.read'),false) THEN RAISE EXCEPTION 'crm_source_forbidden' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('type','company','id',c.id,'name',c.name,'profile_id',NULL,'inn',c.inn,'company_id',NULL)
   INTO result FROM public.companies c WHERE c.id=p_entity_id AND c.organization_id=p_organization_id;
 ELSIF p_entity_type='student' THEN
  IF NOT COALESCE(public.can_access_organization(p_organization_id,'students.read'),false) THEN RAISE EXCEPTION 'crm_source_forbidden' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('type','student','id',p.user_id,'name',COALESCE(NULLIF(btrim(p.full_name),''),'Ученик'),'profile_id',p.id,'inn',NULL,'company_id',p.company_id)
   INTO result FROM public.profiles p WHERE p.user_id=p_entity_id AND p.organization_id=p_organization_id
    AND public.is_student_profile(p.user_id,p_organization_id)
    AND NOT EXISTS(SELECT 1 FROM public.student_roster_removals x WHERE x.organization_id=p_organization_id AND x.user_id=p.user_id)
    AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations x WHERE x.user_id=p.user_id);
 ELSE RAISE EXCEPTION 'crm_invalid_subject_type' USING ERRCODE='22023';
 END IF;
 IF result IS NULL THEN RAISE EXCEPTION 'crm_subject_not_found' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.org_crm_resolve_subject(uuid,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.org_crm_link_subject(p_organization_id uuid,p_entity_type text,p_entity_id uuid,p_client_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE subject jsonb; existing public.org_crm_clients%ROWTYPE; target public.org_crm_clients%ROWTYPE;
BEGIN
 IF NOT COALESCE(public.org_crm_access_allowed(p_organization_id,'sales.write'),false) THEN RAISE EXCEPTION 'crm_forbidden' USING ERRCODE='42501'; END IF;
 subject:=public.org_crm_resolve_subject(p_organization_id,p_entity_type,p_entity_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('org-crm-subject:'||p_organization_id::text||':'||p_entity_type||':'||p_entity_id::text,0));
 -- Keep source membership stable until the explicit link is committed.
 IF p_entity_type='company' THEN
  PERFORM 1 FROM public.companies WHERE id=p_entity_id AND organization_id=p_organization_id FOR SHARE;
 ELSE
  PERFORM 1 FROM public.profiles WHERE user_id=p_entity_id AND organization_id=p_organization_id FOR SHARE;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'crm_subject_not_found' USING ERRCODE='P0002'; END IF;
 subject:=public.org_crm_resolve_subject(p_organization_id,p_entity_type,p_entity_id);
 SELECT * INTO existing FROM public.org_crm_clients WHERE organization_id=p_organization_id
  AND ((p_entity_type='company' AND company_id=p_entity_id) OR (p_entity_type='student' AND student_user_id=p_entity_id)) FOR UPDATE;
 IF FOUND THEN
  IF p_client_id IS NOT NULL AND p_client_id<>existing.id THEN RAISE EXCEPTION 'crm_subject_already_linked' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('id',existing.id,'updated_at',existing.updated_at);
 END IF;
 IF p_client_id IS NULL THEN
  INSERT INTO public.org_crm_clients(organization_id,org_name,inn,created_by,company_id,student_user_id,linked_at)
   VALUES(p_organization_id,left(subject->>'name',300),CASE WHEN p_entity_type='company' THEN left(NULLIF(btrim(subject->>'inn'),''),32) END,auth.uid(),
    CASE WHEN p_entity_type='company' THEN p_entity_id END,CASE WHEN p_entity_type='student' THEN p_entity_id END,clock_timestamp()) RETURNING * INTO target;
 ELSE
  SELECT * INTO target FROM public.org_crm_clients WHERE id=p_client_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'crm_not_found' USING ERRCODE='P0002'; END IF;
  IF target.linked_at IS NOT NULL OR target.company_id IS NOT NULL OR target.student_user_id IS NOT NULL THEN RAISE EXCEPTION 'crm_client_already_linked' USING ERRCODE='23505'; END IF;
  UPDATE public.org_crm_clients SET company_id=CASE WHEN p_entity_type='company' THEN p_entity_id END,
   student_user_id=CASE WHEN p_entity_type='student' THEN p_entity_id END,linked_at=clock_timestamp(),
   updated_at=GREATEST(clock_timestamp(),target.updated_at+interval '1 microsecond') WHERE id=target.id RETURNING * INTO target;
 END IF;
 RETURN jsonb_build_object('id',target.id,'updated_at',target.updated_at);
END $fn$;
REVOKE ALL ON FUNCTION public.org_crm_link_subject(uuid,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.org_crm_link_subject(uuid,text,uuid,uuid) TO authenticated,service_role;

CREATE FUNCTION public.org_crm_context(p_organization_id uuid,p_entity_type text,p_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE subject jsonb; linked public.org_crm_clients%ROWTYPE; counts jsonb; crm jsonb; timeline jsonb;
 related jsonb:=NULL; docs_allowed boolean; restrictions jsonb:='[]'::jsonb;
BEGIN
 IF NOT COALESCE(public.org_crm_access_allowed(p_organization_id,'sales.read'),false) THEN RAISE EXCEPTION 'crm_forbidden' USING ERRCODE='42501'; END IF;
 subject:=public.org_crm_resolve_subject(p_organization_id,p_entity_type,p_entity_id);
 SELECT * INTO linked FROM public.org_crm_clients WHERE organization_id=p_organization_id
  AND ((p_entity_type='company' AND company_id=p_entity_id) OR (p_entity_type='student' AND student_user_id=p_entity_id));
 IF p_entity_type='student' AND COALESCE(public.can_access_organization(p_organization_id,'companies.read'),false) THEN
  SELECT jsonb_build_object('id',c.id,'name',c.name,'client_id',x.id) INTO related FROM public.companies c
   LEFT JOIN public.org_crm_clients x ON x.company_id=c.id AND x.organization_id=p_organization_id
   WHERE c.id=(subject->>'company_id')::uuid AND c.organization_id=p_organization_id;
 END IF;
 SELECT jsonb_build_object('clients',CASE WHEN linked.id IS NULL THEN 0 ELSE 1 END,
  'deals',(SELECT count(*) FROM public.org_crm_deals WHERE organization_id=p_organization_id AND client_id=linked.id),
  'tasks',(SELECT count(*) FROM public.org_crm_tasks WHERE organization_id=p_organization_id AND client_id=linked.id),
  'activities',(SELECT count(*) FROM public.org_crm_activities WHERE organization_id=p_organization_id AND client_id=linked.id)) INTO counts;
 crm:=jsonb_build_object('clients',CASE WHEN linked.id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(to_jsonb(linked)-'created_by') END,
  'deals',COALESCE((SELECT jsonb_agg(to_jsonb(d)-'created_by' ORDER BY d.updated_at DESC,d.id) FROM(SELECT * FROM public.org_crm_deals WHERE organization_id=p_organization_id AND client_id=linked.id ORDER BY updated_at DESC,id LIMIT 1000)d),'[]'::jsonb),
  'tasks',COALESCE((SELECT jsonb_agg(to_jsonb(t)-'created_by' ORDER BY t.due_date,t.id) FROM(SELECT * FROM public.org_crm_tasks WHERE organization_id=p_organization_id AND client_id=linked.id ORDER BY due_date,id LIMIT 1000)t),'[]'::jsonb),
  'activities',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC,a.id) FROM(SELECT * FROM public.org_crm_activities WHERE organization_id=p_organization_id AND client_id=linked.id ORDER BY created_at DESC,id LIMIT 500)a),'[]'::jsonb),
  'assignees',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.full_name,a.user_id) FROM public.org_crm_task_assignees(p_organization_id)a),'[]'::jsonb),
  'counts',counts,'truncated',jsonb_build_object('clients',false,'deals',(counts->>'deals')::bigint>1000,'tasks',(counts->>'tasks')::bigint>1000,'activities',(counts->>'activities')::bigint>500));
 docs_allowed:=COALESCE(public.can_access_organization(p_organization_id,'documents.read'),false);
 IF NOT docs_allowed THEN restrictions:=restrictions||jsonb_build_array('documents'); END IF;
 WITH events(id,occurred_at,source,kind,title,description) AS (
  SELECT 'crm-client:'||linked.id,linked.created_at,'crm','client_created','Добавлена карточка CRM',linked.org_name WHERE linked.id IS NOT NULL
  UNION ALL SELECT 'crm-deal:'||d.id,d.created_at,'crm','deal_created','Создана сделка',d.title FROM public.org_crm_deals d WHERE d.organization_id=p_organization_id AND d.client_id=linked.id
  UNION ALL SELECT 'crm-task:'||t.id,t.created_at,'crm','task_created','Создана задача',t.title FROM public.org_crm_tasks t WHERE t.organization_id=p_organization_id AND t.client_id=linked.id
  UNION ALL SELECT 'crm-task-done:'||t.id,t.completed_at,'crm','task_completed','Задача отмечена выполненной',t.title FROM public.org_crm_tasks t WHERE t.organization_id=p_organization_id AND t.client_id=linked.id AND t.status='done' AND t.completed_at IS NOT NULL
  UNION ALL SELECT 'crm-activity:'||a.id,a.created_at,'crm',a.activity_type,
   CASE a.activity_type WHEN 'call' THEN 'Добавлена заметка о звонке' WHEN 'email' THEN 'Добавлена заметка о письме' WHEN 'meeting' THEN 'Добавлена заметка о встрече' ELSE 'Добавлена заметка' END,a.description
   FROM public.org_crm_activities a WHERE a.organization_id=p_organization_id AND a.client_id=linked.id
  UNION ALL SELECT 'enrollment-start:'||e.id,e.started_at,'learning','enrollment_started','Начало обучения: дата в записи курса',c.title
   FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id AND c.organization_id=p_organization_id
   WHERE p_entity_type='student' AND e.user_id=p_entity_id AND e.started_at IS NOT NULL
  UNION ALL SELECT 'enrollment-complete:'||e.id,e.completed_at,'learning','enrollment_completed','Завершение обучения: дата в записи курса',c.title
   FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id AND c.organization_id=p_organization_id
   WHERE p_entity_type='student' AND e.user_id=p_entity_id AND e.completed_at IS NOT NULL
  UNION ALL SELECT 'course-access:'||a.id,a.accessed_at,'activity','course_access','Зафиксирован доступ к курсу',c.title
   FROM public.course_access_log a JOIN public.courses c ON c.id=a.course_id AND c.organization_id=p_organization_id
   WHERE p_entity_type='student' AND a.user_id=p_entity_id AND a.organization_id=p_organization_id
  UNION ALL SELECT 'student-login:'||l.id,l.logged_in_at,'activity','student_login','Зафиксирован вход ученика',NULL::text
   FROM public.student_login_history l WHERE p_entity_type='student' AND l.user_id=p_entity_id AND l.organization_id=p_organization_id
  UNION ALL SELECT 'company-document:'||d.id,d.uploaded_at,'documents','company_document_added','Добавлен документ компании',d.name
   FROM public.company_documents d JOIN public.companies c ON c.id=d.company_id AND c.organization_id=p_organization_id
   WHERE docs_allowed AND p_entity_type='company' AND d.company_id=p_entity_id AND d.deleted_at IS NULL
  UNION ALL SELECT 'student-document:'||d.id,d.created_at,'documents','student_document_added','Добавлен документ ученика',d.name
   FROM public.student_documents d JOIN public.enrollments e ON e.id=d.enrollment_id
   JOIN public.courses c ON c.id=e.course_id AND c.organization_id=p_organization_id
   WHERE docs_allowed AND p_entity_type='student' AND e.user_id=p_entity_id
  UNION ALL SELECT 'education-document:'||d.id,d.created_at,'documents','education_document_registered','Добавлена запись учебного документа',d.document_type||' № '||d.document_number||'; дата выдачи в записи: '||d.issue_date::text
   FROM public.education_document_records d WHERE docs_allowed AND p_entity_type='student' AND d.organization_id=p_organization_id AND d.deleted_at IS NULL
    AND (d.user_id=p_entity_id OR (d.user_id IS NULL AND EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id AND c.organization_id=p_organization_id WHERE e.id=d.enrollment_id AND e.user_id=p_entity_id)))
 ), usable AS (SELECT * FROM events WHERE occurred_at IS NOT NULL AND isfinite(occurred_at)), recent AS (SELECT * FROM usable ORDER BY occurred_at DESC,id LIMIT 500)
 SELECT jsonb_build_object('events',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY occurred_at DESC,id) FROM recent e),'[]'::jsonb),
  'total',(SELECT count(*) FROM usable),'truncated',(SELECT count(*)>500 FROM usable),'restricted_sources',restrictions,'unavailable_sources','[]'::jsonb) INTO timeline;
 RETURN jsonb_build_object('subject',subject-'inn'-'company_id','client',CASE WHEN linked.id IS NULL THEN NULL ELSE to_jsonb(linked)-'created_by' END,
  'related_company',related,'crm',crm,'timeline',timeline);
END $fn$;
REVOKE ALL ON FUNCTION public.org_crm_context(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.org_crm_context(uuid,text,uuid) TO authenticated,service_role;

-- Keep copied student identity behind the existing shared-data deletion review.
CREATE OR REPLACE FUNCTION public.account_deletion_snapshot(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE p public.profiles%ROWTYPE; v_org uuid; v_owner boolean:=false;
 v_blockers jsonb:='[]'; v_categories jsonb:='[]'; v_files jsonb;
 v_count bigint; v_learning bigint; v_docs bigint:=0; v_shared bigint:=0; v_documentary bigint:=0;
 v_org_shared bigint:=0; v_courses bigint:=0; r record; v_fingerprint jsonb;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE user_id=p_user_id;
 v_org:=p.organization_id;
 IF v_org IS NOT NULL THEN v_owner:=public.is_org_owner(p_user_id,v_org); END IF;
 SELECT count(*) INTO v_learning FROM public.enrollments WHERE user_id=p_user_id;
 v_files:=public.account_deletion_files(p_user_id);
 -- Exact subject/document relationships; JSON checks are read-only detection,
 -- never commands to remove an organization-wide document.
 SELECT
   (SELECT count(*) FROM public.education_document_records WHERE user_id=p_user_id OR enrollment_id IN (SELECT id FROM public.enrollments WHERE user_id=p_user_id))+
   (SELECT count(*) FROM public.document_issuance_log WHERE user_id=p_user_id)+
   (SELECT count(*) FROM public.student_documents WHERE enrollment_id IN (SELECT id FROM public.enrollments WHERE user_id=p_user_id))+
   (SELECT count(*) FROM public.document_signatures WHERE (recipient_user_id=p_user_id OR sender_user_id=p_user_id) AND (signed_at IS NOT NULL OR sender_signed_at IS NOT NULL OR status='signed'))+
   (SELECT count(*) FROM public.org_contracts WHERE (student_user_id=p_user_id OR students::text LIKE '%'||p_user_id::text||'%') AND (approved_at IS NOT NULL OR signed_at IS NOT NULL OR status NOT IN ('draft','cancelled')))+
   (SELECT count(*) FROM public.group_documents WHERE (student_user_id=p_user_id OR variables::text LIKE '%'||p_user_id::text||'%' OR variables_snapshot::text LIKE '%'||p_user_id::text||'%') AND (file_path IS NOT NULL OR doc_status<>'draft'))
 INTO v_docs;
 IF v_docs>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','У аккаунта есть оформленные учебные или подписанные документы организации. Для этих записей требуется отдельная проверка возможности удаления; она не заменяется подтверждением удаления аккаунта.')); END IF;
 IF EXISTS(SELECT 1 FROM public.group_completion_decision_history WHERE user_id=p_user_id) OR EXISTS(SELECT 1 FROM public.group_completion_decisions WHERE user_id=p_user_id) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROTECTED_HISTORY_REVIEW_REQUIRED','message','Есть неизменяемая история итоговых решений организации. Их автоматическое удаление сейчас не поддержано без нарушения целостности общей истории; удаление не начато.'));
 END IF;
 -- CSZ preserves accepted homework by a dedicated immutable-history trigger.
 -- Do not bypass that guard just to scrub a personal free-text attachment.
 IF EXISTS(SELECT 1 FROM public.homework_submissions WHERE student_id=p_user_id AND course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a'))
 OR EXISTS(SELECT 1 FROM public.enrollments WHERE user_id=p_user_id AND course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a'))
 OR EXISTS(SELECT 1 FROM public.lesson_progress lp JOIN public.lessons l ON l.id=lp.lesson_id WHERE lp.user_id=p_user_id AND l.course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a')) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROTECTED_HISTORY_REVIEW_REQUIRED','message','Есть защищённые работы ЦСЗ. Их обработка требует отдельного решения; результаты обучения сейчас не изменяются.'));
 END IF;
 -- These records have other stakeholders or privileged ownership. Never let
 -- Auth FK cascades silently delete client call records, contracts or grants.
 FOR r IN SELECT * FROM (VALUES
  ('org_crm_clients','student_user_id'),
  ('ai_avatar_templates','created_by'),
  ('balance_transactions','performed_by'),
  ('call_logs','manager_user_id'),
  ('chat_groups','created_by'),
  ('checko_search_presets','created_by'),
  ('checko_search_runs','created_by'),
  ('commercial_proposals','created_by'),
  ('commercial_proposals','deleted_by'),
  ('companies','user_id'),
  ('company_documents','deleted_by'),
  ('company_staff','invited_by'),
  ('course_landing_history','created_by'),
  ('course_manual_credits','credited_by'),
  ('course_manual_credits','revoked_by'),
  ('course_payments','user_id'),
  ('course_review_grants','created_by'),
  ('course_review_grants','updated_by'),
  ('course_snapshots','created_by'),
  ('data_subject_requests','deleted_by'),
  ('data_subject_requests','resolved_by'),
  ('document_issuance_log','deleted_by'),
  ('document_signatures','deleted_by'),
  ('driving_audit','user_id'),
  ('driving_entries','created_by'),
  ('driving_entry_reversals','created_by'),
  ('driving_instructors','user_id'),
  ('driving_invites','created_by'),
  ('driving_lessons','created_by'),
  ('driving_memberships','user_id'),
  ('driving_schools','created_by'),
  ('driving_students','user_id'),
  ('education_document_records','deleted_by'),
  ('email_campaigns','created_by'),
  ('email_drip_sequences','created_by'),
  ('email_templates','created_by'),
  ('enrollment_requests','resolved_by'),
  ('enrollment_requests','user_id'),
  ('goreltech_document_operations','actor_id'),
  ('goreltech_enrollment_orders','actor_id'),
  ('group_class_journal_marks','updated_by'),
  ('group_completion_decisions','confirmed_by'),
  ('group_document_schedules','updated_by'),
  ('group_documents','created_by'),
  ('group_documents','student_user_id'),
  ('homework_submissions','reviewer_id'),
  ('incoming_documents','deleted_by'),
  ('labor_safety_enrollment_protocols','created_by'),
  ('labor_safety_enrollment_protocols','source_user_id'),
  ('labor_safety_enrollment_protocols','updated_by'),
  ('labor_safety_profiles','user_id'),
  ('library_documents','created_by'),
  ('mailing_deliverability_seeds','created_by'),
  ('mailing_report_links','created_by'),
  ('mailing_senders','created_by'),
  ('marketplace_course_comments','user_id'),
  ('marketplace_orders','buyer_user_id'),
  ('org_billing_documents','deleted_by'),
  ('org_contract_template_versions','created_by'),
  ('org_custom_roles','created_by'),
  ('org_document_share_links','created_by'),
  ('org_documents','deleted_by'),
  ('org_signatories','created_by'),
  ('platform_invoice_acts','created_by'),
  ('platform_updates','created_by'),
  ('proposal_presets','created_by'),
  ('referral_attribution_log','user_id'),
  ('referral_partners','user_id'),
  ('sales_demo_links','created_by'),
  ('sales_demo_sessions','user_id'),
  ('sales_managers','user_id'),
  ('sales_tasks','created_by'),
  ('signature_comments','author_user_id'),
  ('signature_comments','resolved_by'),
  ('signature_revisions','created_by'),
  ('training_plans','created_by'),
  ('webinar_polls','created_by'),
  ('webinars','created_by'),
  ('webinars','host_user_id')
 ) x(t,c) LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO v_count USING p_user_id;
  v_shared:=v_shared+v_count;
 END LOOP;
 v_shared:=v_shared+(SELECT count(*) FROM public.document_signatures WHERE (sender_user_id=p_user_id OR recipient_user_id=p_user_id) AND (sender_user_id IS DISTINCT FROM p_user_id OR recipient_user_id IS DISTINCT FROM p_user_id));
 v_shared:=v_shared+(SELECT count(*) FROM public.org_contracts WHERE student_user_id IS DISTINCT FROM p_user_id AND students::text LIKE '%'||p_user_id::text||'%');
 v_shared:=v_shared+(SELECT count(*) FROM public.group_documents WHERE student_user_id IS DISTINCT FROM p_user_id AND (variables::text LIKE '%'||p_user_id::text||'%' OR variables_snapshot::text LIKE '%'||p_user_id::text||'%'));
 IF v_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SHARED_DATA_REVIEW_REQUIRED','message','Аккаунт связан с общими рабочими записями. Сначала нужно передать ответственность за них; данные других пользователей не удаляются.')); END IF;
 IF EXISTS(SELECT 1 FROM storage.objects o WHERE (o.owner=p_user_id OR o.owner_id=p_user_id::text)
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_files) f WHERE f->>'bucket'=o.bucket_id AND f->>'path'=o.name)) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SHARED_FILES_REVIEW_REQUIRED','message','Есть загруженные аккаунтом файлы вне личных папок. Сначала нужно проверить их принадлежность организации.'));
 END IF;
 IF v_owner THEN
  -- Locking/revalidation occurs again in begin. A brand-new sole-owner
  -- organization may be removed with its default welcome course/templates.
  SELECT count(*) INTO v_org_shared FROM public.profiles WHERE organization_id=v_org AND user_id<>p_user_id;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE c.organization_id=v_org);
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.organizations WHERE id=v_org AND (balance<>0 OR is_paid OR paid_until IS NOT NULL));
  FOR r IN SELECT * FROM (VALUES
  ('org_crm_clients','organization_id'),
  ('org_crm_deals','organization_id'),
  ('org_crm_tasks','organization_id'),
  ('org_crm_activities','organization_id'),
  ('achievements','organization_id'),
  ('admin_generated_documents','sent_to_organization_id'),
  ('admin_org_messages','organization_id'),
  ('ai_avatar_templates','organization_id'),
  ('audit_logs','organization_id'),
  ('balance_transactions','organization_id'),
  ('chat_groups','organization_id'),
  ('checko_search_presets','organization_id'),
  ('commercial_proposals','organization_id'),
  ('companies','organization_id'),
  ('company_requests','organization_id'),
  ('consent_documents','organization_id'),
  ('course_landing_history','organization_id'),
  ('course_payments','organization_id'),
  ('course_reminders','organization_id'),
  ('course_requests','organization_id'),
  ('course_snapshots','organization_id'),
  ('data_subject_requests','organization_id'),
  ('document_issuance_log','organization_id'),
  ('document_number_sequences','organization_id'),
  ('document_signatures','organization_id'),
  ('driving_audit','organization_id'),
  ('driving_cars','organization_id'),
  ('driving_courses','organization_id'),
  ('driving_entries','organization_id'),
  ('driving_entry_reversals','organization_id'),
  ('driving_groups','organization_id'),
  ('driving_instructors','organization_id'),
  ('driving_invites','organization_id'),
  ('driving_lessons','organization_id'),
  ('driving_memberships','organization_id'),
  ('driving_operations','organization_id'),
  ('driving_programs','organization_id'),
  ('driving_schools','organization_id'),
  ('driving_shifts','organization_id'),
  ('driving_students','organization_id'),
  ('education_document_records','organization_id'),
  ('email_action_tokens','organization_id'),
  ('email_campaign_consent_log','organization_id'),
  ('email_campaigns','organization_id'),
  ('email_drip_subscribers','organization_id'),
  ('frdo_signed_documents','organization_id'),
  ('goreltech_document_operations','organization_id'),
  ('goreltech_enrollment_orders','organization_id'),
  ('group_class_journal_marks','organization_id'),
  ('group_completion_decision_history','organization_id'),
  ('group_completion_decisions','organization_id'),
  ('group_document_schedules','organization_id'),
  ('group_documents','organization_id'),
  ('homework_submissions','organization_id'),
  ('incoming_documents','organization_id'),
  ('journal_instances','organization_id'),
  ('kinescope_usage_cache','organization_id'),
  ('knowledge_bank','organization_id'),
  ('labor_safety_enrollment_protocols','organization_id'),
  ('labor_safety_groups','organization_id'),
  ('labor_safety_profiles','organization_id'),
  ('library_documents','organization_id'),
  ('library_folders','organization_id'),
  ('mailing_campaign_ledger','organization_id'),
  ('mailing_campaign_replies','organization_id'),
  ('mailing_contacts','organization_id'),
  ('mailing_deliverability_checks','organization_id'),
  ('mailing_deliverability_seeds','organization_id'),
  ('mailing_report_links','organization_id'),
  ('mailing_seed_ledger','organization_id'),
  ('mailing_senders','organization_id'),
  ('marketplace_courses','organization_id'),
  ('marketplace_orders','buyer_organization_id'),
  ('ordinary_mail_report_events','organization_id'),
  ('org_billing_documents','organization_id'),
  ('org_contract_template_versions','organization_id'),
  ('org_contract_templates','organization_id'),
  ('org_contracts','organization_id'),
  ('org_custom_roles','organization_id'),
  ('org_document_share_links','organization_id'),
  ('org_document_versions','organization_id'),
  ('org_documents','organization_id'),
  ('org_general_messages','organization_id'),
  ('org_payers','organization_id'),
  ('org_services','organization_id'),
  ('org_signatories','organization_id'),
  ('org_smtp_settings','organization_id'),
  ('org_staff','organization_id'),
  ('org_student_messages','organization_id'),
  ('organization_comments','organization_id'),
  ('organization_payment_settings','organization_id'),
  ('organization_reminders','organization_id'),
  ('pending_enrollments','organization_id'),
  ('platform_invoice_acts','organization_id'),
  ('program_categories','organization_id'),
  ('program_documents','organization_id'),
  ('program_folders','organization_id'),
  ('program_training_plans','organization_id'),
  ('proposal_presets','organization_id'),
  ('referral_attribution_log','organization_id'),
  ('referral_commissions','organization_id'),
  ('referral_registrations','organization_id'),
  ('registration_links','organization_id'),
  ('role_audit_log','organization_id'),
  ('sales_blacklist','organization_id'),
  ('sales_companies_db','organization_id'),
  ('sales_contracts','organization_id'),
  ('sales_demo_links','organization_id'),
  ('sales_demo_sessions','organization_id'),
  ('sales_lead_activities','organization_id'),
  ('sales_leads','organization_id'),
  ('sales_tasks','organization_id'),
  ('service_orders','organization_id'),
  ('skillspace_import_jobs','organization_id'),
  ('staff_invitations','organization_id'),
  ('student_deletion_log','organization_id'),
  ('student_group_memberships','organization_id'),
  ('student_groups','organization_id'),
  ('student_roster_removals','organization_id'),
  ('subscription_invoices','organization_id'),
  ('system_diagnostics','organization_id'),
  ('testimonials','organization_id'),
  ('training_plans','organization_id'),
  ('webinars','organization_id')
  ) x(t,c) LOOP
   EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO v_count USING v_org;
   v_org_shared:=v_org_shared+v_count;
  END LOOP;
  -- Only the audited seeded course is auto-removable in the first release.
  SELECT count(*) INTO v_courses FROM public.courses WHERE organization_id=v_org;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.courses WHERE organization_id=v_org AND system_key IS DISTINCT FROM 'welcome');
 IF v_org_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','OWNERSHIP_TRANSFER_REQUIRED','message','Организация содержит пользователей, обучение, платежи или рабочие записи. Сначала передайте управление организацией.','actionHref','/organization?tab=staff')); END IF;
 END IF;
 -- PEP is deletable only when it is the person's standalone agreement, not
 -- evidence attached to a document signature (the live FK is SET NULL).
 SELECT count(*) INTO v_documentary FROM public.pep_agreements pa
 WHERE pa.user_id=p_user_id AND EXISTS(SELECT 1 FROM public.document_signatures d WHERE d.pep_agreement_id=pa.id);
 -- An organization's offer acceptance belongs to the organization lifecycle.
 -- Remove it only together with the verified unused sole-owner organization.
 SELECT v_documentary+count(*) INTO v_documentary FROM public.organization_offer_acceptances a
 WHERE a.user_id=p_user_id AND NOT (v_owner AND v_org_shared=0 AND a.organization_id=v_org);
 IF v_documentary>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','DOCUMENTARY_RELATION_REVIEW_REQUIRED','message','Есть соглашение ПЭП, связанное с подписью документа, или акцепт оферты действующей организации. Эти общие документальные записи требуют отдельной обработки; удаление аккаунта не начато.')); END IF;
 v_categories:=jsonb_build_array(
  jsonb_build_object('key','account','label','Вход в аккаунт, пароль, профиль и личные настройки','count',1,'action','delete'),
  jsonb_build_object('key','private_files','label','Личные фотографии и загруженные документы','count',jsonb_array_length(v_files),'action','delete'),
  jsonb_build_object('key','learning_results','label','Назначения курсов, прогресс, попытки, ответы и результаты обучения','count',v_learning,'action','delete'),
  jsonb_build_object('key','institutional_documents','label','Оформленные документы','count',v_docs,'action',CASE WHEN v_docs>0 THEN 'block' ELSE 'delete' END));
 IF v_documentary>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','documentary_relations','label','Соглашения ПЭП и акцепты оферт, связанные с документами или действующей организацией','count',v_documentary,'action','block')); END IF;
 IF v_owner THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','empty_organization','label','Неиспользованная организация и ознакомительный курс','count',1,'action',CASE WHEN v_org_shared>0 THEN 'block' ELSE 'delete' END)); END IF;
 SELECT count(*) INTO v_count FROM public.audit_logs WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','common_audit','label','Общие события организации: запись события сохраняется, имя и ссылка на аккаунт удаляются','count',v_count,'action','anonymize')); END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record','label','Техническая запись запрета старого доступа и квитанция об удалении без имени и контактов','count',1,'action','retain'));
 -- The snapshot is compared atomically just before the first mutation. Counts
 -- and manifest cover additions during the confirmation dialog; no PII stored.
 RETURN jsonb_build_object('organizationId',v_org,'emptyOrganization',v_owner AND v_org_shared=0,'learningCount',v_learning,
  'categories',v_categories,'blockers',v_blockers,'files',v_files,'sharedCount',v_shared,'personalRows',public.account_deletion_personal_row_counts(p_user_id),
  'profileRevision',p.updated_at,'role',(SELECT role::text FROM public.user_roles WHERE user_id=p_user_id LIMIT 1));
END;$function$
;
