-- Additive bounded document-chain projection. Reads existing facts only.
-- No table rows, old functions, signatures, numbers or business policies change.
DO $preflight$ BEGIN
 IF current_user<>'postgres' OR to_regprocedure('public.uc_read_education_journal_workspace(uuid,jsonb,jsonb)') IS NULL
 OR to_regprocedure('uc_education_journal_private.enrollments(uuid,jsonb)') IS NULL
 OR to_regprocedure('uc_education_journal_private.source_allowed(uuid,jsonb,uuid,uuid,uuid,uuid)') IS NULL
 OR to_regprocedure('public.uc_admission_document_source(uuid,uuid)') IS NULL
 OR to_regprocedure('public.uc_document_action_allowed(uuid,text,uuid,uuid)') IS NULL
 OR to_regprocedure('public.uc_admission_draft_projection(uuid)') IS NULL
 OR to_regprocedure('public.uc_document_registry_source(uuid,jsonb,boolean,boolean)') IS NULL
 OR to_regprocedure('public.uc_document_registry_caps(uuid,uuid)') IS NULL
 OR to_regprocedure('public.uc_education_issue_can(uuid,uuid,uuid,uuid,uuid,text)') IS NULL
 OR to_regprocedure('public.uc_education_issue_source(uuid,jsonb,boolean)') IS NULL
 OR to_regclass('public.uc_automatic_admission_drafts') IS NULL
 OR to_regclass('public.uc_education_issuance_states') IS NULL THEN
  RAISE EXCEPTION 'UC_DOCUMENT_CHAIN_DEPENDENCY_UNAVAILABLE' USING ERRCODE='55000';
 END IF;
 IF to_regprocedure('public.uc_read_document_chain(uuid,jsonb,jsonb)') IS NOT NULL OR to_regnamespace('uc_document_chain_private') IS NOT NULL THEN
  RAISE EXCEPTION 'UC_DOCUMENT_CHAIN_ALREADY_INSTALLED_READBACK_REQUIRED' USING ERRCODE='55000';
 END IF;
END;$preflight$;
CREATE SCHEMA uc_document_chain_private;
REVOKE ALL ON SCHEMA uc_document_chain_private FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION uc_document_chain_private.fail(p_code text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION '%','UC_DOCUMENT_CHAIN_'||p_code USING ERRCODE=CASE p_code WHEN 'ACCESS_DENIED' THEN '42501' WHEN 'SOURCE_CHANGED' THEN 'PT409' WHEN 'NOT_FOUND' THEN 'PT404' ELSE '22023' END;END;$fn$;
CREATE FUNCTION uc_document_chain_private.slot(p_kind text,p_state text,p_code text,p_why text,p_number text,p_date date,p_source jsonb,p_open boolean,p_action jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('kind',p_kind,'state',p_state,'why_code',p_code,'why',left(p_why,2000),'number',left(nullif(p_number,''),200),'document_date',p_date,
 'source',p_source,'capabilities',jsonb_build_object('can_open',coalesce(p_open,false),'can_continue',p_action IS NOT NULL),'next_action',p_action)
$fn$;
-- An order belongs to this exact educational subject only through the retained
-- enrollment context. Participant arrays or a shared group are not such proof.
CREATE FUNCTION uc_document_chain_private.registry_matches(p_org uuid,p_scope jsonb,p_enrollment uuid,p_user uuid,p_course uuid,p_group uuid,p_record public.uc_document_registry_records)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT coalesce(p_record.organization_id=p_org AND NOT p_record.redacted
 AND p_record.data->'subject'->>'kind'='student' AND p_record.data->'subject'->>'user_id'=p_user::text
 AND p_record.context_binding->>'organization_id'=p_org::text AND p_record.context_binding->>'enrollment_id'=p_enrollment::text
 AND p_record.context_binding->>'user_id'=p_user::text AND p_record.context_binding->>'course_id'=p_course::text
 AND p_record.context_binding->>'kind' IN('enrollment','enrollment_contract')
 AND p_record.data->'context'->>'kind'=p_record.context_binding->>'kind' AND p_record.data->'context'->>'enrollment_id'=p_enrollment::text
 AND(p_group IS NULL OR p_record.group_id=p_group OR p_group=ANY(p_record.scope_group_ids))
 AND uc_education_journal_private.source_allowed(p_org,p_scope,p_record.group_id,p_enrollment,p_user,p_course),false)
$fn$;
CREATE FUNCTION uc_document_chain_private.row_value(p_org uuid,p_scope jsonb,p_enrollment uuid,p_group uuid,p_self boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET TimeZone='UTC' AS $fn$
DECLARE e record;g uuid;gname text;association text:='unavailable';association_why text;facts jsonb;missing jsonb;
 d public.uc_automatic_admission_drafts;projection jsonb;r public.uc_document_registry_records;issued public.education_document_records;issue_state public.uc_education_issuance_states;
 source jsonb;proof jsonb;can_open boolean;can_manage boolean;admission jsonb;completion jsonb;education jsonb;action jsonb;typ text;state text;why text;code text;number text;dt date;
BEGIN
 SELECT * INTO e FROM uc_education_journal_private.enrollments(p_org,p_scope||jsonb_build_object('enrollment_id',p_enrollment)) x WHERE x.enrollment_id=p_enrollment;
 IF NOT FOUND THEN RETURN NULL;END IF;
 facts:=public.uc_admission_document_source(e.enrollment_id,p_group);
 IF facts IS NOT NULL THEN g:=(facts->>'group_id')::uuid;missing:=facts->'missing_facts';END IF;
 IF p_group IS NOT NULL AND g IS DISTINCT FROM p_group THEN RETURN NULL;END IF;
 IF g IS NOT NULL AND NOT uc_education_journal_private.source_allowed(p_org,p_scope,g,e.enrollment_id,e.user_id,e.course_id) THEN
  g:=NULL;facts:=NULL;
 END IF;
 SELECT left(name,2000) INTO gname FROM public.student_groups WHERE id=g AND organization_id=p_org;
 IF facts IS NULL THEN association_why:='Не удалось подтвердить связь обучения с группой и программой.';
 ELSIF missing ? 'ambiguous_group' THEN association:='choose_group';association_why:='Выберите группу для этого обучения.';
 ELSIF missing ? 'group_not_selected' THEN association:='group_missing';association_why:='Добавьте ученика в подходящую группу.';
 ELSIF missing ? 'group_course_not_bound' THEN association:='course_unbound';association_why:='Уточните программу и основание зачисления для этого обучения.';
 ELSIF missing ? 'program_not_confirmed' THEN association:='program_unconfirmed';association_why:='Подтвердите программу обучения для этой группы.';
 ELSE association:='confirmed';association_why:=NULL;END IF;
 can_manage:=NOT p_self AND public.uc_document_action_allowed(p_org,'write',g,e.enrollment_id);
 FOR typ IN SELECT unnest(ARRAY['enrollment_order','expulsion_order']) LOOP
  source:=NULL;proof:=NULL;can_open:=false;number:=NULL;dt:=NULL;action:=NULL;state:='not_created';code:='ORDER_NOT_CREATED';
  why:=CASE typ WHEN 'enrollment_order' THEN 'Приказ о зачислении ещё не оформлен.' ELSE 'Приказ об отчислении ещё не оформлен; требуется основание завершения или досрочного прекращения обучения.' END;
  SELECT x.* INTO r FROM public.uc_document_registry_records x WHERE x.organization_id=p_org AND NOT x.redacted AND x.context_binding->>'enrollment_id'=e.enrollment_id::text AND x.data->>'document_type'=typ
   AND uc_document_chain_private.registry_matches(p_org,p_scope,e.enrollment_id,e.user_id,e.course_id,p_group,x)
   ORDER BY x.registered_at DESC,x.id DESC LIMIT 1;
  IF FOUND THEN
   number:=r.registration_id;dt:=(r.data->>'document_date')::date;
   IF r.legacy_claim IS NOT NULL AND r.legacy_claim<>'null'::jsonb THEN state:='legacy_unverified';code:='LEGACY_ORDER_UNVERIFIED';why:='Сохранена прежняя запись; её происхождение не подтверждено этой цепочкой.';
   ELSE state:='registered';code:=NULL;why:=NULL;END IF;
   IF public.uc_custom_journal_shape(r.data->'source',ARRAY['kind','document_id','version_id','content_hash'])
    AND r.data->'source'->>'kind'='org_document_version' AND public.uc_custom_journal_uuid(r.data->'source'->'document_id') AND public.uc_custom_journal_uuid(r.data->'source'->'version_id') THEN
    source:=jsonb_build_object('kind','registry_record','id',r.id,'revision',r.revision,'document_id',r.data->'source'->'document_id','version_id',r.data->'source'->'version_id');
    IF NOT p_self THEN
     proof:=public.uc_document_registry_source(p_org,r.data->'source',false,false);
     can_open:=proof IS NOT NULL AND coalesce((public.uc_document_registry_caps(p_org,r.group_id)->>'can_open_file')::boolean,false);
    END IF;
   END IF;
   IF p_self THEN code:='INDIVIDUAL_EXTRACT_UNAVAILABLE';why:='Приказ зарегистрирован. Индивидуальная выписка пока недоступна; обратитесь в учебный центр.';
   ELSIF NOT can_open THEN code:='SOURCE_UNAVAILABLE';why:='Запись сохранена; точный файл сейчас недоступен по текущим правам или состоянию источника.';END IF;
  ELSIF typ='enrollment_order' THEN
   SELECT x.* INTO d FROM public.uc_automatic_admission_drafts x WHERE x.organization_id=p_org AND x.enrollment_id=e.enrollment_id AND x.user_id=e.user_id AND x.course_id=e.course_id;
   IF FOUND AND(p_group IS NULL OR d.group_id=p_group) AND uc_education_journal_private.source_allowed(p_org,p_scope,d.group_id,e.enrollment_id,e.user_id,e.course_id) THEN
    projection:=public.uc_admission_draft_projection(d.id);dt:=d.document_date;
    source:=jsonb_build_object('kind','admission_draft','id',d.id,'revision',d.revision,'enrollment_id',e.enrollment_id,'group_id',d.group_id);
    IF d.status<>'disabled' AND coalesce((projection->>'stale')::boolean,true) IS FALSE AND coalesce((projection->>'registered_locked')::boolean,true) IS FALSE THEN
     state:=CASE WHEN d.status='prepared' THEN 'draft' ELSE 'needs_information' END;
     code:=CASE WHEN d.status='prepared' THEN 'DRAFT_NOT_APPROVED' ELSE 'DRAFT_NEEDS_INFORMATION' END;
     why:=CASE WHEN d.status='prepared' THEN 'Подготовлен проект; подпись и регистрационный номер ещё не оформлены.' ELSE 'Проект сохранён; перед оформлением нужно уточнить сведения о программе и приёме.' END;can_open:=NOT p_self;
    ELSE state:='needs_information';code:=CASE WHEN d.status='disabled' THEN 'PREPARATION_DISABLED' WHEN coalesce((projection->>'stale')::boolean,true) THEN 'DRAFT_SOURCE_CHANGED' ELSE 'DRAFT_NEEDS_INFORMATION' END;
     why:=CASE WHEN d.status='disabled' THEN 'Автоподготовка проекта отключена в настройках.' WHEN coalesce((projection->>'stale')::boolean,true) THEN 'Исходные сведения изменились; обновите проект в настройках зачисления.' ELSE 'Перед подготовкой проекта нужны сведения о группе и программе.' END;END IF;
    IF p_self THEN code:='INDIVIDUAL_DRAFT_EXPORT_UNAVAILABLE';why:='Проект приказа подготовлен или требует сведений. Оформленную персональную выписку предоставляет учебный центр.';END IF;
   END IF;
  END IF;
  IF can_manage AND typ='enrollment_order' AND state IN('needs_information','not_created') THEN
   action:=CASE WHEN association IN('choose_group','group_missing') THEN jsonb_build_object('kind','choose_group','enrollment_id',e.enrollment_id)
    WHEN association='program_unconfirmed' AND g IS NOT NULL THEN jsonb_build_object('kind','review_group_program','group_id',g)
    ELSE jsonb_build_object('kind','review_admission_draft','enrollment_id',e.enrollment_id,'group_id',g) END;
  ELSIF source IS NOT NULL AND can_open THEN action:=jsonb_build_object('kind','open_source','source',source);
  ELSIF can_manage THEN action:=CASE WHEN typ='enrollment_order' THEN jsonb_build_object('kind','review_admission_draft','enrollment_id',e.enrollment_id,'group_id',g) ELSE jsonb_build_object('kind','review_completion','enrollment_id',e.enrollment_id,'group_id',g) END;END IF;
  IF typ='enrollment_order' THEN admission:=uc_document_chain_private.slot('admission_order',state,code,why,number,dt,source,can_open,action);
  ELSE completion:=uc_document_chain_private.slot('completion_order',state,code,why,number,dt,source,can_open,action);END IF;
 END LOOP;
 source:=NULL;can_open:=false;state:='not_created';code:='EDUCATION_DOCUMENT_NOT_ISSUED';why:='Итоговый документ ещё не выдан. Проверьте программу, аттестацию и условия выдачи.';number:=NULL;dt:=NULL;
 SELECT x.* INTO issued FROM public.education_document_records x WHERE x.organization_id=p_org AND x.enrollment_id=e.enrollment_id AND x.user_id=e.user_id
  AND(x.course_id IS NULL OR x.course_id=e.course_id) AND x.deleted_at IS NULL AND(p_group IS NULL OR x.group_id=p_group)
  AND uc_education_journal_private.source_allowed(p_org,p_scope,x.group_id,e.enrollment_id,e.user_id,e.course_id)
  AND NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_states z WHERE z.record_id=x.id AND z.redacted)
  ORDER BY x.issue_date DESC,x.created_at DESC,x.id DESC LIMIT 1;
 IF FOUND THEN
  number:=issued.document_number;dt:=issued.issue_date;
  SELECT * INTO issue_state FROM public.uc_education_issuance_states s WHERE s.record_id=issued.id AND s.organization_id=p_org AND s.user_id=e.user_id
   AND s.enrollment_id=e.enrollment_id AND s.course_id=e.course_id AND NOT s.redacted;
  IF NOT FOUND OR issued.course_id IS DISTINCT FROM e.course_id OR issue_state.group_id IS DISTINCT FROM issued.group_id OR issue_state.proof IS NULL OR issue_state.proof='null'::jsonb THEN state:='legacy_unverified';code:='LEGACY_ISSUANCE_UNVERIFIED';why:='Сохранена прежняя запись. Контролируемое основание выдачи этой цепочкой не подтверждено.';
  ELSE
   state:=CASE WHEN issue_state.annulment IS NOT NULL THEN 'annulled' ELSE 'issued' END;code:=NULL;why:=CASE WHEN issue_state.annulment IS NOT NULL THEN 'Документ аннулирован; прежняя запись сохранена.' ELSE NULL END;
   source:=jsonb_build_object('kind','education_record','id',issued.id,'revision',issue_state.revision,'enrollment_id',e.enrollment_id);
   IF NOT p_self THEN can_open:=public.uc_education_issue_can(p_org,issued.group_id,e.enrollment_id,e.user_id,e.course_id,'read')
    AND public.uc_education_issue_source(p_org,issue_state.artifact->'source',false) IS NOT NULL;END IF;
   IF p_self THEN code:='OWN_CONTROLLED_DOWNLOAD_UNAVAILABLE';why:='Документ учтён. Персональная загрузка этого оформленного файла пока недоступна в данном разделе.';
   ELSIF NOT can_open THEN code:='SOURCE_UNAVAILABLE';why:='Выдача сохранена; точный оформленный файл сейчас недоступен.';END IF;
  END IF;
 END IF;
 action:=CASE WHEN source IS NOT NULL AND can_open THEN jsonb_build_object('kind','open_source','source',source) WHEN can_manage THEN jsonb_build_object('kind','review_issuance','enrollment_id',e.enrollment_id,'course_id',e.course_id,'group_id',g) ELSE NULL END;
 education:=uc_document_chain_private.slot('education_document',state,code,why,number,dt,source,can_open,action);
 RETURN jsonb_build_object('enrollment_id',e.enrollment_id,'student_user_id',e.user_id,'student_label',left(coalesce(nullif(e.person_label,''),'Имя не указано'),2000),
 'course_id',e.course_id,'course_label',left(coalesce(nullif(e.course_label,''),'Курс'),2000),'group_id',g,'group_label',gname,
 'association_state',association,'association_why',association_why,'admission_order',admission,'completion_order',completion,'education_document',education,'journals_available',true);
END;$fn$;
CREATE FUNCTION uc_document_chain_private.resolve_source(p_org uuid,p_scope jsonb,p_enrollment uuid,p_group uuid,p_source jsonb,p_self boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET TimeZone='UTC' AS $fn$
DECLARE e record;d public.uc_automatic_admission_drafts;r public.uc_document_registry_records;s public.uc_education_issuance_states;i public.education_document_records;projection jsonb;target jsonb;why text;kind text:=p_source->>'kind';
BEGIN
 IF jsonb_typeof(p_source) IS DISTINCT FROM 'object' OR jsonb_typeof(p_source->'kind') IS DISTINCT FROM 'string' THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
 IF kind<>'org_document_version' THEN
  IF jsonb_typeof(p_source->'revision') IS DISTINCT FROM 'number' OR coalesce(p_source->>'revision','')!~'^[1-9][0-9]{0,15}$' THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
  IF(p_source->>'revision')::numeric>9007199254740991 THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
 END IF;
 SELECT * INTO e FROM uc_education_journal_private.enrollments(p_org,p_scope||jsonb_build_object('enrollment_id',p_enrollment)) x WHERE x.enrollment_id=p_enrollment;
 IF NOT FOUND THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
 IF kind='admission_draft' THEN
  IF NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','id','revision','enrollment_id','group_id']) OR NOT public.uc_custom_journal_uuid(p_source->'id')
  OR p_source->>'enrollment_id' IS DISTINCT FROM p_enrollment::text OR jsonb_typeof(p_source->'group_id') NOT IN('string','null') THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
  SELECT * INTO d FROM public.uc_automatic_admission_drafts WHERE id=(p_source->>'id')::uuid AND organization_id=p_org AND enrollment_id=e.enrollment_id AND user_id=e.user_id AND course_id=e.course_id;
  IF NOT FOUND OR(p_group IS NOT NULL AND d.group_id IS DISTINCT FROM p_group) OR NOT uc_education_journal_private.source_allowed(p_org,p_scope,d.group_id,e.enrollment_id,e.user_id,e.course_id) THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  IF d.revision::text IS DISTINCT FROM p_source->>'revision' OR d.group_id::text IS DISTINCT FROM p_source->>'group_id' THEN PERFORM uc_document_chain_private.fail('SOURCE_CHANGED');END IF;
  projection:=public.uc_admission_draft_projection(d.id);
  IF p_self THEN why:='Индивидуальный экспорт проекта здесь недоступен. Оформленную выписку предоставляет учебный центр.';
  ELSIF d.status='disabled' OR coalesce((projection->>'stale')::boolean,true) OR coalesce((projection->>'registered_locked')::boolean,true) THEN why:='Исходные сведения проекта изменились или приказ уже оформлен. Откройте актуальное состояние зачисления.';
  ELSE target:=jsonb_build_object('kind','admission_draft','draft',projection,'enrollment_id',e.enrollment_id,'group_id',d.group_id);END IF;
 ELSIF kind='registry_record' THEN
  IF NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','id','revision','document_id','version_id']) OR NOT public.uc_custom_journal_uuid(p_source->'id') OR NOT public.uc_custom_journal_uuid(p_source->'document_id') OR NOT public.uc_custom_journal_uuid(p_source->'version_id') THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
  SELECT * INTO r FROM public.uc_document_registry_records x WHERE x.id=(p_source->>'id')::uuid AND x.data->>'document_type' IN('enrollment_order','expulsion_order')
   AND uc_document_chain_private.registry_matches(p_org,p_scope,e.enrollment_id,e.user_id,e.course_id,p_group,x);
  IF NOT FOUND THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  IF r.revision::text IS DISTINCT FROM p_source->>'revision' OR r.data->'source'->>'document_id' IS DISTINCT FROM p_source->>'document_id' OR r.data->'source'->>'version_id' IS DISTINCT FROM p_source->>'version_id' THEN PERFORM uc_document_chain_private.fail('SOURCE_CHANGED');END IF;
  IF p_self THEN why:='Полный приказ может содержать данные других учеников. Индивидуальная выписка пока недоступна.';
  ELSIF public.uc_document_registry_source(p_org,r.data->'source',false,false) IS NULL OR NOT coalesce((public.uc_document_registry_caps(p_org,r.group_id)->>'can_open_file')::boolean,false) THEN why:='Точный файл сейчас недоступен по текущим правам или состоянию источника.';
  ELSE target:=jsonb_build_object('kind','registry_record','record_id',r.id,'revision',r.revision);END IF;
 ELSIF kind='education_record' THEN
  IF NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','id','revision','enrollment_id']) OR NOT public.uc_custom_journal_uuid(p_source->'id') OR p_source->>'enrollment_id' IS DISTINCT FROM p_enrollment::text THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
  SELECT x.* INTO i FROM public.education_document_records x WHERE x.id=(p_source->>'id')::uuid AND x.organization_id=p_org AND x.enrollment_id=e.enrollment_id AND x.user_id=e.user_id AND(x.course_id IS NULL OR x.course_id=e.course_id) AND x.deleted_at IS NULL
   AND(p_group IS NULL OR x.group_id=p_group) AND uc_education_journal_private.source_allowed(p_org,p_scope,x.group_id,e.enrollment_id,e.user_id,e.course_id);
  SELECT * INTO s FROM public.uc_education_issuance_states WHERE record_id=i.id AND organization_id=p_org AND user_id=e.user_id AND enrollment_id=e.enrollment_id AND course_id=e.course_id AND NOT redacted;
  IF i.id IS NULL OR i.course_id IS DISTINCT FROM e.course_id OR s.group_id IS DISTINCT FROM i.group_id OR s.record_id IS NULL OR s.proof IS NULL OR s.proof='null'::jsonb THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  IF s.revision::text IS DISTINCT FROM p_source->>'revision' THEN PERFORM uc_document_chain_private.fail('SOURCE_CHANGED');END IF;
  IF p_self THEN why:='Персональная загрузка оформленного файла пока недоступна в данном разделе.';
  ELSIF NOT public.uc_education_issue_can(p_org,i.group_id,e.enrollment_id,e.user_id,e.course_id,'read') OR public.uc_education_issue_source(p_org,s.artifact->'source',false) IS NULL THEN why:='Точный оформленный файл сейчас недоступен.';
  ELSE target:=jsonb_build_object('kind','education_record','record_id',i.id,'revision',s.revision,'enrollment_id',e.enrollment_id);END IF;
 ELSIF kind='org_document_version' THEN
  IF NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','document_id','version_id','proof_hash']) OR NOT public.uc_custom_journal_uuid(p_source->'document_id') OR NOT public.uc_custom_journal_uuid(p_source->'version_id') OR coalesce(p_source->>'proof_hash','')!~'^[a-f0-9]{64}$' THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
  SELECT x.* INTO r FROM public.uc_document_registry_records x WHERE uc_document_chain_private.registry_matches(p_org,p_scope,e.enrollment_id,e.user_id,e.course_id,p_group,x)
   AND x.data->'source'=jsonb_build_object('kind','org_document_version','document_id',p_source->'document_id','version_id',p_source->'version_id','content_hash',p_source->'proof_hash') ORDER BY x.registered_at DESC,x.id DESC LIMIT 1;
  IF NOT FOUND THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  IF p_self THEN why:='Полная версия документа организации недоступна ученику. Нужна отдельная персональная выписка.';
  ELSIF public.uc_document_registry_source(p_org,r.data->'source',false,false) IS NULL OR NOT coalesce((public.uc_document_registry_caps(p_org,r.group_id)->>'can_open_file')::boolean,false) THEN why:='Точная версия источника сейчас недоступна.';
  ELSE target:=p_source;END IF;
 ELSE PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
 RETURN jsonb_build_object('availability',CASE WHEN target IS NULL THEN 'unavailable' ELSE 'available' END,'why',why,'source',p_source,'target',target,
 'context',jsonb_build_object('organization_id',p_org,'student_user_id',e.user_id,'enrollment_id',e.enrollment_id,'course_id',e.course_id,'group_id',p_group));
END;$fn$;

CREATE FUNCTION uc_document_chain_private.resolve_journal(p_org uuid,p_scope jsonb,p_query jsonb,p_group uuid,p_self boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET TimeZone='UTC' AS $fn$
DECLARE typ text:=p_query->>'journal_type';rowid text:=p_query->>'row_id';sourceid uuid;requested uuid:=(p_query->>'enrollment_id')::uuid;
 r public.uc_document_registry_records;d public.uc_automatic_admission_drafts;i public.education_document_records;s public.uc_education_issuance_states;
 e record;subject uuid;enrollment uuid;course uuid;source jsonb;why text;ctx jsonb;resolved jsonb;rev bigint;actual_group uuid;
BEGIN
 ctx:=jsonb_build_object('organization_id',p_org,'student_user_id',null,'enrollment_id',null,'course_id',null,'group_id',p_group);
 IF typ NOT IN('admission_orders','document_registration','education_documents') THEN
  RETURN jsonb_build_object('availability','unavailable','why','Открытие первичного документа для этого вида записей здесь не поддерживается. Используйте исходный журнал.','source',NULL,'context',ctx,'target',NULL);
 END IF;
 IF NOT public.uc_custom_journal_uuid(to_jsonb(p_query->>'source_id')) THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
 sourceid:=(p_query->>'source_id')::uuid;
 IF (typ='document_registration' AND rowid='registry:'||sourceid)
 OR (typ='admission_orders' AND rowid='registered-admission:'||sourceid) THEN
  SELECT * INTO r FROM public.uc_document_registry_records x WHERE x.id=sourceid AND x.organization_id=p_org AND NOT x.redacted
   AND(typ<>'admission_orders' OR x.data->>'document_type'='enrollment_order')
   AND(p_group IS NULL OR x.group_id=p_group OR p_group=ANY(x.scope_group_ids));
  IF NOT FOUND THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  IF r.data->'subject'->>'kind'='student' AND public.uc_custom_journal_uuid(r.data->'subject'->'user_id') THEN subject:=(r.data->'subject'->>'user_id')::uuid;END IF;
  IF p_scope->>'kind'='student' AND subject::text IS DISTINCT FROM p_scope->>'student_user_id' THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  IF subject IS NOT NULL AND NOT public.uc_identification_target_allowed(p_org,subject,false) THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  IF r.revision::text IS DISTINCT FROM p_query->>'source_revision' THEN PERFORM uc_document_chain_private.fail('SOURCE_CHANGED');END IF;
  actual_group:=r.group_id;
  IF public.uc_custom_journal_uuid(r.context_binding->'enrollment_id') THEN enrollment:=(r.context_binding->>'enrollment_id')::uuid;END IF;
  IF enrollment IS NOT NULL THEN
   SELECT * INTO e FROM uc_education_journal_private.enrollments(p_org,p_scope||jsonb_build_object('enrollment_id',enrollment)) x WHERE x.enrollment_id=enrollment AND x.user_id=subject;
   IF NOT FOUND OR NOT uc_document_chain_private.registry_matches(p_org,p_scope,enrollment,subject,e.course_id,p_group,r) THEN enrollment:=NULL;
   ELSE course:=e.course_id;END IF;
  END IF;
  IF NOT uc_education_journal_private.source_allowed(p_org,p_scope,r.group_id,enrollment,subject,course) THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  IF public.uc_custom_journal_shape(r.data->'source',ARRAY['kind','document_id','version_id','content_hash'])
   AND r.data->'source'->>'kind'='org_document_version' AND public.uc_custom_journal_uuid(r.data->'source'->'document_id') AND public.uc_custom_journal_uuid(r.data->'source'->'version_id') THEN
   source:=jsonb_build_object('kind','registry_record','id',r.id,'revision',r.revision,'document_id',r.data->'source'->'document_id','version_id',r.data->'source'->'version_id');
  END IF;
 ELSIF typ='admission_orders' AND rowid='admission-draft:'||sourceid THEN
  SELECT * INTO d FROM public.uc_automatic_admission_drafts x WHERE x.id=sourceid AND x.organization_id=p_org AND(p_group IS NULL OR x.group_id=p_group);
  IF NOT FOUND THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  subject:=d.user_id;enrollment:=d.enrollment_id;course:=d.course_id;actual_group:=d.group_id;
  SELECT * INTO e FROM uc_education_journal_private.enrollments(p_org,p_scope||jsonb_build_object('enrollment_id',enrollment)) x WHERE x.enrollment_id=enrollment AND x.user_id=subject AND x.course_id=course;
  IF NOT FOUND OR NOT uc_education_journal_private.source_allowed(p_org,p_scope,d.group_id,enrollment,subject,course) THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  IF d.revision::text IS DISTINCT FROM p_query->>'source_revision' THEN PERFORM uc_document_chain_private.fail('SOURCE_CHANGED');END IF;
  source:=jsonb_build_object('kind','admission_draft','id',d.id,'revision',d.revision,'enrollment_id',enrollment,'group_id',d.group_id);
 ELSIF typ='education_documents' AND rowid='education:'||sourceid THEN
  SELECT * INTO i FROM public.education_document_records x WHERE x.id=sourceid AND x.organization_id=p_org AND x.deleted_at IS NULL AND(p_group IS NULL OR x.group_id=p_group);
  IF NOT FOUND THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  subject:=i.user_id;enrollment:=i.enrollment_id;course:=i.course_id;actual_group:=i.group_id;
  IF p_scope->>'kind'='student' AND subject::text IS DISTINCT FROM p_scope->>'student_user_id' THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  IF NOT public.uc_identification_target_allowed(p_org,subject,false) THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  IF NOT uc_education_journal_private.source_allowed(p_org,p_scope,i.group_id,enrollment,subject,course) THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  SELECT * INTO s FROM public.uc_education_issuance_states WHERE record_id=i.id AND organization_id=p_org AND user_id=subject AND NOT redacted;
  IF s.record_id IS NULL AND EXISTS(SELECT 1 FROM public.uc_education_issuance_states WHERE record_id=i.id AND redacted) THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  IF s.revision::text IS DISTINCT FROM p_query->>'source_revision' THEN PERFORM uc_document_chain_private.fail('SOURCE_CHANGED');END IF;
  IF enrollment IS NOT NULL THEN
   SELECT * INTO e FROM uc_education_journal_private.enrollments(p_org,p_scope||jsonb_build_object('enrollment_id',enrollment)) x WHERE x.enrollment_id=enrollment AND x.user_id=subject AND(i.course_id IS NULL OR x.course_id=i.course_id);
   IF NOT FOUND THEN enrollment:=NULL;
   ELSE course:=e.course_id;END IF;
  END IF;
  IF s.record_id IS NOT NULL AND i.course_id=course AND s.group_id IS NOT DISTINCT FROM i.group_id AND s.proof IS NOT NULL AND s.proof<>'null'::jsonb AND s.enrollment_id=enrollment AND s.course_id=course THEN
   source:=jsonb_build_object('kind','education_record','id',i.id,'revision',s.revision,'enrollment_id',enrollment);
  END IF;
 ELSE PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
 IF requested IS NOT NULL AND requested IS DISTINCT FROM enrollment THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
 IF p_scope->>'enrollment_id' IS NOT NULL AND p_scope->>'enrollment_id' IS DISTINCT FROM enrollment::text THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
 IF enrollment IS NULL OR source IS NULL THEN
  RETURN jsonb_build_object('availability','unavailable','why','Запись журнала сохранена; точная связь с индивидуальным обучением или оформленным источником не подтверждена.','source',NULL,
   'context',jsonb_build_object('organization_id',p_org,'student_user_id',subject,'enrollment_id',enrollment,'course_id',course,'group_id',p_group),'target',NULL);
 END IF;
 -- Resolve exactly this historic/current record, not the latest slot in a row.
 RETURN uc_document_chain_private.resolve_source(p_org,p_scope,enrollment,p_group,source,p_self);
END;$fn$;
CREATE FUNCTION public.uc_read_document_chain(p_organization_id uuid,p_scope jsonb,p_query jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET TimeZone='UTC' AS $fn$
DECLARE actor uuid:=auth.uid();own boolean;sk text;qk text;g uuid;student uuid;scoped_enrollment uuid;requested uuid;query_group uuid;effective_scope jsonb;
 v_limit integer;after_id uuid;n integer:=0;more boolean:=false;last_id uuid;e record;row jsonb;rows jsonb:='[]';base jsonb;resolved jsonb;
BEGIN
 IF p_organization_id IS NULL OR jsonb_typeof(p_scope) IS DISTINCT FROM 'object' OR jsonb_typeof(p_query) IS DISTINCT FROM 'object' THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
 sk:=p_scope->>'kind';qk:=p_query->>'kind';
 IF sk IS NULL OR qk IS NULL OR sk NOT IN('organization','group','student') OR qk NOT IN('list','detail','source','journal_source')
 OR jsonb_typeof(p_scope->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(p_query->'kind') IS DISTINCT FROM 'string' THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
 IF sk='organization' THEN
  IF NOT public.uc_custom_journal_shape(p_scope,ARRAY['kind']) THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
 ELSIF sk='group' THEN
  IF NOT public.uc_custom_journal_shape(p_scope,ARRAY['kind','group_id']) OR NOT public.uc_custom_journal_uuid(p_scope->'group_id') THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
 ELSE
  IF NOT public.uc_custom_journal_shape(p_scope,ARRAY['kind','student_user_id','enrollment_id','group_id']) OR NOT public.uc_custom_journal_uuid(p_scope->'student_user_id')
   OR NOT(p_scope->'enrollment_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_scope->'enrollment_id'))
   OR NOT(p_scope->'group_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_scope->'group_id')) THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
 END IF;
 g:=(p_scope->>'group_id')::uuid;student:=(p_scope->>'student_user_id')::uuid;scoped_enrollment:=(p_scope->>'enrollment_id')::uuid;
 own:=sk='student' AND student=actor;
 -- Exact installed journal authority composition, without its unbounded rows or summary.
 IF auth.role() IS DISTINCT FROM 'authenticated' OR actor IS NULL OR public.account_deletion_access_allowed() IS NOT TRUE
 OR public.uc_identification_actor_allowed(actor,false) IS NOT TRUE OR public.is_user_blocked(actor) IS NOT FALSE THEN PERFORM uc_document_chain_private.fail('ACCESS_DENIED');END IF;
 IF own THEN
  IF NOT public.uc_identification_target_allowed(p_organization_id,student,false) OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=student AND p.archived_at IS NOT NULL) THEN PERFORM uc_document_chain_private.fail('ACCESS_DENIED');END IF;
 ELSE
  IF(public.can_access_organization(p_organization_id,'journals.read') AND public.can_access_organization(p_organization_id,'students.read') AND public.can_access_organization(p_organization_id,'documents.read')) IS NOT TRUE THEN PERFORM uc_document_chain_private.fail('ACCESS_DENIED');END IF;
  IF student IS NOT NULL AND NOT(public.uc_identification_target_allowed(p_organization_id,student,false) AND public.uc_document_student_scope_allowed(p_organization_id,student)) THEN PERFORM uc_document_chain_private.fail('ACCESS_DENIED');END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id) THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
 IF qk='list' THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','after_enrollment_id','limit']) OR NOT(p_query->'after_enrollment_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'after_enrollment_id'))
   OR jsonb_typeof(p_query->'limit') IS DISTINCT FROM 'number' OR coalesce(p_query->>'limit','')!~'^[0-9]{1,2}$' THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
  v_limit:=(p_query->>'limit')::integer;after_id:=(p_query->>'after_enrollment_id')::uuid;
  IF v_limit NOT BETWEEN 1 AND 50 THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
 ELSIF qk IN('detail','source') THEN
  IF NOT public.uc_custom_journal_shape(p_query,CASE qk WHEN 'detail' THEN ARRAY['kind','enrollment_id','group_id'] ELSE ARRAY['kind','enrollment_id','group_id','source'] END)
   OR NOT public.uc_custom_journal_uuid(p_query->'enrollment_id') OR NOT(p_query->'group_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'group_id')) THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
  requested:=(p_query->>'enrollment_id')::uuid;query_group:=(p_query->>'group_id')::uuid;
 ELSE
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','journal_type','row_id','source_id','source_revision','enrollment_id','group_id'])
   OR jsonb_typeof(p_query->'journal_type') IS DISTINCT FROM 'string' OR p_query->>'journal_type' NOT IN('activity','current_control','final_tests','attestation_decisions','conducted_sessions','admission_orders','education_documents','document_registration','copies_duplicates')
   OR jsonb_typeof(p_query->'row_id') IS DISTINCT FROM 'string' OR length(p_query->>'row_id') NOT BETWEEN 1 AND 240
   OR jsonb_typeof(p_query->'source_id') IS DISTINCT FROM 'string' OR length(p_query->>'source_id') NOT BETWEEN 1 AND 240
   OR NOT(p_query->'enrollment_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'enrollment_id')) OR NOT(p_query->'group_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'group_id'))
   OR NOT(p_query->'source_revision'='null'::jsonb OR(jsonb_typeof(p_query->'source_revision')='number' AND p_query->>'source_revision'~'^[0-9]{1,16}$' AND(p_query->>'source_revision')::numeric<=9007199254740991)) THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
  requested:=(p_query->>'enrollment_id')::uuid;query_group:=(p_query->>'group_id')::uuid;
 END IF;
 IF g IS NOT NULL AND query_group IS NOT NULL AND g<>query_group OR scoped_enrollment IS NOT NULL AND requested IS NOT NULL AND scoped_enrollment<>requested THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;
 g:=coalesce(g,query_group);effective_scope:=CASE WHEN g IS NULL THEN p_scope ELSE p_scope||jsonb_build_object('group_id',g) END;
 -- organization scopes cannot gain an unvalidated extra key in the response;
 -- the internal enrollment filter intentionally accepts the selected group.
 IF g IS NOT NULL AND(NOT EXISTS(SELECT 1 FROM public.student_groups x WHERE x.id=g AND x.organization_id=p_organization_id)
 OR(own AND NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_organization_id AND m.group_id=g AND m.user_id=student))
 OR(NOT own AND NOT public.uc_document_scope_allowed(p_organization_id,g,NULL))) THEN PERFORM uc_document_chain_private.fail('ACCESS_DENIED');END IF;
 IF scoped_enrollment IS NOT NULL AND NOT EXISTS(SELECT 1 FROM uc_education_journal_private.enrollments(p_organization_id,effective_scope) x WHERE x.enrollment_id=scoped_enrollment AND x.user_id=student) THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
 IF requested IS NOT NULL AND NOT EXISTS(SELECT 1 FROM uc_education_journal_private.enrollments(p_organization_id,effective_scope||jsonb_build_object('enrollment_id',requested)) x WHERE x.enrollment_id=requested) THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
 base:=jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'scope',p_scope,'observed_at',statement_timestamp(),'viewer',CASE WHEN own THEN 'self' ELSE 'staff' END,
  'capabilities',jsonb_build_object('can_read',true,'can_open_sources',NOT own,'can_open_journals',true));
 IF qk='list' THEN
  FOR e IN SELECT x.enrollment_id FROM uc_education_journal_private.enrollments(p_organization_id,effective_scope) x WHERE after_id IS NULL OR x.enrollment_id>after_id ORDER BY x.enrollment_id LIMIT(v_limit+1) LOOP
   n:=n+1;IF n>v_limit THEN more:=true;EXIT;END IF;
   row:=uc_document_chain_private.row_value(p_organization_id,effective_scope,e.enrollment_id,g,own);
   IF row IS NOT NULL THEN rows:=rows||jsonb_build_array(row);last_id:=e.enrollment_id;END IF;
  END LOOP;
  RETURN base||jsonb_build_object('kind','list','availability','available','why',NULL,'rows',rows,'next_after_enrollment_id',CASE WHEN more THEN last_id ELSE NULL END,'total_count',NULL);
 ELSIF qk='detail' THEN
  row:=uc_document_chain_private.row_value(p_organization_id,effective_scope,requested,g,own);
  IF row IS NULL THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;
  RETURN base||jsonb_build_object('kind','detail','availability','available','why',NULL,'row',row);
 ELSIF qk='source' THEN resolved:=uc_document_chain_private.resolve_source(p_organization_id,effective_scope,requested,g,p_query->'source',own);
 ELSE resolved:=uc_document_chain_private.resolve_journal(p_organization_id,effective_scope,p_query,g,own);END IF;
 RETURN base||jsonb_build_object('kind',qk)||resolved;
END;$fn$;
DO $acl$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='uc_document_chain_private' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END;$acl$;
REVOKE ALL ON FUNCTION public.uc_read_document_chain(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.uc_read_document_chain(uuid,jsonb,jsonb) TO authenticated;
-- Restrict this new RPC's explicit ACL despite provider-specific public defaults.
-- Existing functions, roles, memberships and default privileges are unchanged.
DO $new_rpc_acl$
DECLARE target_signature constant text:='public.uc_read_document_chain(uuid,jsonb,jsonb)';target_owner oid;grantee_oid oid;
BEGIN
 SELECT proowner INTO STRICT target_owner FROM pg_proc WHERE oid=target_signature::regprocedure;
 FOR grantee_oid IN SELECT DISTINCT a.grantee FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
  WHERE p.oid=target_signature::regprocedure AND a.grantee NOT IN(target_owner,'authenticated'::regrole)
 LOOP
  IF grantee_oid=0 THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',target_signature);
  ELSE EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',target_signature,pg_get_userbyid(grantee_oid));END IF;
 END LOOP;
 EXECUTE format('REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION %s FROM authenticated',target_signature);
END;$new_rpc_acl$;
COMMENT ON FUNCTION public.uc_read_document_chain(uuid,jsonb,jsonb) IS 'Bounded readonly document-chain projection with exact personal sources and historic journal resolution; does not create, sign, register or hand over documents.';
