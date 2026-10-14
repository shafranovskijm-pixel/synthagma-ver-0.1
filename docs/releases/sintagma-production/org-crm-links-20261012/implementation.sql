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
