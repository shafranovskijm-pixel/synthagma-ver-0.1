-- Factual journals and server-filtered individual extracts. No historical backfill,
-- numbers, signatures, learning decisions, course content or existing grants change.
CREATE SCHEMA uc_education_journal_private;
REVOKE ALL ON SCHEMA uc_education_journal_private FROM PUBLIC,anon,authenticated,service_role;

-- Prospective metadata ledger: resetting mutable lesson progress must not erase
-- an already observed completion. No old history is reconstructed or backfilled.
CREATE TABLE public.uc_online_completion_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
 course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
 lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
 source_progress_id uuid NOT NULL,learning_progress_epoch bigint NOT NULL CHECK(learning_progress_epoch BETWEEN 0 AND 9007199254740991),
 lesson_label text NOT NULL,completed_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(enrollment_id,lesson_id,learning_progress_epoch,completed_at)
);
ALTER TABLE public.uc_online_completion_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uc_online_completion_events FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX uc_online_completion_events_org_subject ON public.uc_online_completion_events(organization_id,user_id,enrollment_id);
CREATE FUNCTION uc_education_journal_private.capture_completion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF NEW.completed IS TRUE AND NEW.completed_at IS NOT NULL THEN
  INSERT INTO public.uc_online_completion_events(organization_id,enrollment_id,user_id,course_id,lesson_id,source_progress_id,learning_progress_epoch,lesson_label,completed_at)
  SELECT c.organization_id,e.id,e.user_id,e.course_id,l.id,NEW.id,coalesce(e.learning_progress_epoch,0),left(coalesce(l.title,'Онлайн-урок'),2000),NEW.completed_at
  FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id JOIN public.lessons l ON l.course_id=c.id AND l.id=NEW.lesson_id
  JOIN public.profiles p ON p.user_id=e.user_id AND p.organization_id=c.organization_id
  WHERE e.user_id=NEW.user_id AND c.organization_id IS NOT NULL AND public.uc_identification_target_allowed(c.organization_id,e.user_id,false)
  ON CONFLICT(enrollment_id,lesson_id,learning_progress_epoch,completed_at) DO NOTHING;
 END IF;
 RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_capture_online_completion AFTER INSERT OR UPDATE OF completed,completed_at ON public.lesson_progress
 FOR EACH ROW EXECUTE FUNCTION uc_education_journal_private.capture_completion();

CREATE FUNCTION uc_education_journal_private.row_value(
 p_id text,p_type text,p_user uuid,p_person text,p_enrollment uuid,p_course uuid,p_course_label text,
 p_group uuid,p_group_label text,p_at timestamptz,p_title text,p_result text,p_source text,p_source_id text,p_revision bigint
) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('id',p_id,'journal_type',p_type,'student_user_id',p_user,'student_label',left(coalesce(p_person,'Организация / группа'),2000),
 'enrollment_id',p_enrollment,'course_id',p_course,'course_label',left(p_course_label,2000),'group_id',p_group,'group_label',left(p_group_label,2000),
 'event_at',p_at,'title',left(p_title,2000),'result',left(p_result,2000),'source_label',left(p_source,2000),'source_id',p_source_id,'source_revision',p_revision)
$fn$;

CREATE FUNCTION uc_education_journal_private.enrollments(p_org uuid,p_scope jsonb)
RETURNS TABLE(enrollment_id uuid,user_id uuid,course_id uuid,person_label text,course_label text,group_id uuid,group_label text,reset_at timestamptz,learning_epoch bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 WITH a AS MATERIALIZED(SELECT auth.uid() AS actor,
  p_scope->>'kind'='student' AND p_scope->>'student_user_id'=auth.uid()::text AS own,
  public.uc_document_teacher_limited(p_org) AS limited),
 selected_group AS(SELECT g.id,g.name,g.course_id FROM public.student_groups g WHERE g.organization_id=p_org AND g.id=(p_scope->>'group_id')::uuid)
 SELECT e.id,e.user_id,e.course_id,coalesce(nullif(btrim(p.full_name),''),'Имя не указано'),coalesce(c.title,'Курс'),g.id,g.name,e.learning_progress_reset_at,coalesce(e.learning_progress_epoch,0)
 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id AND c.organization_id=p_org
 JOIN public.profiles p ON p.user_id=e.user_id AND p.organization_id=p_org CROSS JOIN a LEFT JOIN selected_group g ON true
 WHERE (p_scope->>'kind'<>'student' OR e.user_id=(p_scope->>'student_user_id')::uuid)
 AND(p_scope->>'enrollment_id' IS NULL OR e.id=(p_scope->>'enrollment_id')::uuid)
 AND(p_scope->>'group_id' IS NULL OR(g.id IS NOT NULL AND(g.course_id IS NULL OR g.course_id=e.course_id)
  AND EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=g.id AND m.user_id=e.user_id)))
 AND public.uc_identification_target_allowed(p_org,e.user_id,false)
 AND(a.own OR NOT a.limited OR public.uc_document_record_scope(p_org,g.id,e.id,e.user_id,e.course_id))
$fn$;

-- Top-level permission is necessary but not sufficient: the same learner and
-- course can belong to two groups with different assigned teachers.
CREATE FUNCTION uc_education_journal_private.source_allowed(p_org uuid,p_scope jsonb,p_group uuid,p_enrollment uuid,p_user uuid,p_course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN p_scope->>'kind'='student' AND p_scope->>'student_user_id'=auth.uid()::text
 THEN p_user=auth.uid()
 WHEN public.uc_document_teacher_limited(p_org) THEN p_group IS NOT NULL AND
  CASE WHEN p_user IS NULL THEN public.uc_document_scope_allowed(p_org,p_group,NULL)
  ELSE public.uc_document_record_scope(p_org,p_group,p_enrollment,p_user,p_course) END
 ELSE true END
$fn$;

CREATE FUNCTION uc_education_journal_private.rows(p_org uuid,p_scope jsonb,p_type text DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 WITH e AS MATERIALIZED(SELECT * FROM uc_education_journal_private.enrollments(p_org,p_scope)),
 states AS MATERIALIZED(SELECT s.* FROM public.uc_learning_outcome_states s JOIN public.group_program_enrollment_snapshots sn
  ON sn.id=s.program_enrollment_snapshot_id AND sn.organization_id=s.organization_id AND sn.group_id=s.group_id
  AND sn.enrollment_id=s.enrollment_id AND sn.user_id=s.user_id AND sn.course_id=s.course_id AND sn.version_id=s.program_version_id WHERE s.organization_id=p_org),
 sessions AS MATERIALIZED(SELECT DISTINCT ON(v.session_id) v.* FROM public.uc_conducted_session_versions v
  WHERE v.organization_id=p_org ORDER BY v.session_id,v.revision DESC),
 personal_registry AS MATERIALIZED(SELECT r.*,p.user_id AS subject_id,coalesce(nullif(btrim(p.full_name),''),'Имя не указано') AS subject_label,
  ee.enrollment_id AS subject_enrollment,ee.course_id AS subject_course,ee.course_label AS subject_course_label
  FROM public.uc_document_registry_records r
  LEFT JOIN public.profiles p ON r.data->'subject'->>'kind'='student' AND p.user_id::text=r.data->'subject'->>'user_id' AND p.organization_id=p_org
  LEFT JOIN e ee ON ee.user_id=p.user_id AND ee.enrollment_id::text=r.context_binding->>'enrollment_id'
   AND ee.user_id::text=r.context_binding->>'user_id' AND ee.course_id::text=r.context_binding->>'course_id'
   AND r.context_binding->>'organization_id'=p_org::text
   AND r.data->'context'->>'kind' IN('enrollment','enrollment_contract') AND r.context_binding->>'kind'=r.data->'context'->>'kind' AND r.data->'context'->>'enrollment_id'=ee.enrollment_id::text
  WHERE r.organization_id=p_org AND NOT r.redacted
  AND(p_scope->>'group_id' IS NULL OR r.group_id=(p_scope->>'group_id')::uuid OR (p_scope->>'group_id')::uuid=ANY(r.scope_group_ids))
  AND((p_scope->>'kind'='student' AND p.user_id=(p_scope->>'student_user_id')::uuid AND public.uc_identification_target_allowed(p_org,p.user_id,false)
    AND(p_scope->>'enrollment_id' IS NULL OR ee.enrollment_id=(p_scope->>'enrollment_id')::uuid))
   OR(p_scope->>'kind'<>'student' AND((p.user_id IS NOT NULL AND public.uc_identification_target_allowed(p_org,p.user_id,false))
    OR(p.user_id IS NULL AND r.data->'subject'->>'kind'='none'))))
  AND uc_education_journal_private.source_allowed(p_org,p_scope,r.group_id,ee.enrollment_id,p.user_id,ee.course_id)),
 copies AS MATERIALIZED(SELECT r.*,p.user_id AS subject_id,coalesce(nullif(btrim(p.full_name),''),'Имя не указано') AS subject_label
  FROM public.uc_copy_registry_records r JOIN public.profiles p ON p.user_id::text=r.data->'subject'->>'user_id' AND p.organization_id=p_org
  WHERE r.organization_id=p_org AND NOT r.redacted AND r.data->'subject'->>'kind'='person'
  AND(p_scope->>'kind'<>'student' OR p.user_id=(p_scope->>'student_user_id')::uuid)
  AND(p_scope->>'group_id' IS NULL OR r.group_id=(p_scope->>'group_id')::uuid)
  AND public.uc_identification_target_allowed(p_org,p.user_id,false)
  AND uc_education_journal_private.source_allowed(p_org,p_scope,r.group_id,NULL,p.user_id,NULL))
 SELECT uc_education_journal_private.row_value('completion:'||a.id,'activity',e.user_id,e.person_label,e.enrollment_id,e.course_id,e.course_label,NULL,NULL,
  a.completed_at,a.lesson_label,'Зафиксировано завершение онлайн-урока; посещение и зачёт этим не подтверждаются',
  CASE WHEN a.learning_progress_epoch<e.learning_epoch OR(e.reset_at IS NOT NULL AND a.completed_at<e.reset_at) THEN 'Хронология онлайн-уроков · до последнего сброса обучения; группа события не зафиксирована' ELSE 'Хронология онлайн-уроков · событие сохранено автоматически; группа события не зафиксирована' END,a.id::text,a.learning_progress_epoch)
 FROM e JOIN public.uc_online_completion_events a ON a.organization_id=p_org AND a.enrollment_id=e.enrollment_id AND a.user_id=e.user_id AND a.course_id=e.course_id
 WHERE(p_type IS NULL OR p_type='activity')
 UNION ALL
 SELECT uc_education_journal_private.row_value('activity:'||lp.id,'activity',e.user_id,e.person_label,e.enrollment_id,e.course_id,e.course_label,NULL,NULL,
  lp.completed_at,l.title,'Урок завершён; посещение и зачёт этим не подтверждаются','Текущее состояние цифровой активности',lp.id::text,NULL)
 FROM e JOIN public.lessons l ON l.course_id=e.course_id JOIN public.lesson_progress lp ON lp.user_id=e.user_id AND lp.lesson_id=l.id
 WHERE(p_type IS NULL OR p_type='activity') AND lp.completed AND lp.completed_at IS NOT NULL AND(e.reset_at IS NULL OR lp.completed_at>=e.reset_at)
  AND NOT EXISTS(SELECT 1 FROM public.uc_online_completion_events a WHERE a.enrollment_id=e.enrollment_id AND a.lesson_id=l.id AND a.completed_at=lp.completed_at)
 UNION ALL
 SELECT uc_education_journal_private.row_value('test:'||t.id,'current_control',e.user_id,e.person_label,e.enrollment_id,e.course_id,e.course_label,tg.id,tg.name,
  t.completed_at,l.title,CASE WHEN t.passed IS TRUE THEN 'Тест пройден' WHEN t.passed IS FALSE THEN 'Тест не пройден' ELSE 'Результат не подтверждён' END
   ||' · '||coalesce(t.score::text,'—')||' / '||coalesce(t.max_score::text,'—'),
  CASE WHEN e.reset_at IS NOT NULL AND t.completed_at<e.reset_at THEN 'Сохранённая попытка до последнего сброса обучения' ELSE 'Сохранённая попытка теста' END
   ||CASE WHEN tc.session_id IS NULL THEN '; связь с группой не подтверждена' ELSE '; группа сохранённого контекста попытки' END,t.id::text,NULL)
 FROM e JOIN public.lessons l ON l.course_id=e.course_id JOIN public.test_attempts t ON t.user_id=e.user_id AND t.lesson_id=l.id
 LEFT JOIN public.uc_learning_attempt_contexts tc ON tc.session_id=t.session_id AND tc.binding_state='bound'
 LEFT JOIN public.student_groups tg ON tg.id::text=tc.scope->>'group_id' AND tg.organization_id=p_org AND tg.course_id=e.course_id
 WHERE(p_type IS NULL OR p_type='current_control') AND t.completed_at IS NOT NULL
  AND(tc.session_id IS NULL OR(tc.user_id=e.user_id AND tc.lesson_id=l.id AND tg.id IS NOT NULL
   AND(p_scope->>'group_id' IS NULL OR tg.id=(p_scope->>'group_id')::uuid)
   AND uc_education_journal_private.source_allowed(p_org,p_scope,tg.id,e.enrollment_id,e.user_id,e.course_id)))
 UNION ALL
 SELECT uc_education_journal_private.row_value('homework:'||h.id,'current_control',e.user_id,e.person_label,e.enrollment_id,e.course_id,e.course_label,NULL,NULL,
  coalesce(h.reviewed_at,h.submitted_at),l.title,
  CASE WHEN h.status='pending' THEN 'Задание отправлено; ожидает проверки' WHEN h.reviewed_at IS NULL THEN 'Результат проверки не подтверждён'
   WHEN h.status='approved' THEN 'Задание принято' WHEN h.status='revision' THEN 'Задание возвращено на доработку' WHEN h.status='rejected' THEN 'Задание отклонено' ELSE 'Сохранённое задание' END
   ||CASE WHEN h.score IS NOT NULL AND h.reviewed_at IS NOT NULL THEN ' · оценка '||h.score ELSE '' END,
  CASE WHEN h.learning_progress_epoch<e.learning_epoch OR(e.reset_at IS NOT NULL AND h.submitted_at<e.reset_at) THEN 'Сохранённое задание до последнего сброса обучения' ELSE 'Сдача и проверка задания' END||'; группа события не зафиксирована',h.id::text,h.learning_progress_epoch)
 FROM e JOIN public.lessons l ON l.course_id=e.course_id JOIN public.homework_submissions h ON h.organization_id=p_org AND h.student_id=e.user_id AND h.course_id=e.course_id AND h.lesson_id=l.id
 WHERE(p_type IS NULL OR p_type='current_control') AND h.submitted_at IS NOT NULL
 UNION ALL
 SELECT uc_education_journal_private.row_value('final:'||t.id,'final_tests',e.user_id,e.person_label,e.enrollment_id,e.course_id,e.course_label,s.group_id,g.name,
  t.completed_at,l.title,CASE WHEN t.passed IS TRUE THEN 'Основной тест пройден; решение об аттестации оформляется отдельно' WHEN t.passed IS FALSE THEN 'Основной тест не пройден' ELSE 'Результат не подтверждён' END,
  CASE WHEN e.reset_at IS NOT NULL AND t.completed_at<e.reset_at THEN 'Сохранённый основной тест до последнего сброса обучения' ELSE 'Основной тест подтверждённой версии критериев' END,t.id::text,cv.revision)
 FROM e JOIN states s ON s.enrollment_id=e.enrollment_id AND s.organization_id=p_org AND s.user_id=e.user_id AND s.course_id=e.course_id
 JOIN public.uc_learning_criteria_versions cv ON cv.id=s.criteria_id AND cv.organization_id=p_org AND cv.course_id=e.course_id AND cv.state='approved' AND NOT cv.redacted AND cv.program_version_id=s.program_version_id
 JOIN public.uc_learning_attempt_contexts ac ON ac.state_id=s.id AND ac.criteria_id=cv.id AND ac.binding_state='bound'
 JOIN public.test_attempts t ON t.session_id=ac.session_id AND t.user_id=e.user_id AND ac.user_id=e.user_id AND ac.lesson_id=t.lesson_id
 JOIN public.lessons l ON l.id=t.lesson_id AND l.course_id=e.course_id LEFT JOIN public.student_groups g ON g.id=s.group_id AND g.organization_id=p_org
 WHERE(p_type IS NULL OR p_type='final_tests') AND t.completed_at IS NOT NULL AND cv.definition->'main'->>'kind'='test'
  AND ac.scope=jsonb_build_object('organization_id',p_org,'group_id',s.group_id,'user_id',e.user_id,'course_id',e.course_id,'enrollment_id',e.enrollment_id,'program_enrollment_snapshot_id',s.program_enrollment_snapshot_id,'program_version_id',s.program_version_id)
  AND l.type='test' AND cv.definition->'main'->>'lesson_id'=l.id::text AND(p_scope->>'group_id' IS NULL OR s.group_id=(p_scope->>'group_id')::uuid)
  AND uc_education_journal_private.source_allowed(p_org,p_scope,s.group_id,e.enrollment_id,e.user_id,e.course_id)
 UNION ALL
 SELECT uc_education_journal_private.row_value('attestation:'||d.id,'attestation_decisions',e.user_id,e.person_label,e.enrollment_id,e.course_id,e.course_label,s.group_id,g.name,
  d.recorded_at,'Решение об аттестации',CASE d.outcome WHEN 'passed' THEN 'Аттестация пройдена' WHEN 'not_passed' THEN 'Аттестация не пройдена' WHEN 'deferred' THEN 'Решение отложено' ELSE 'Сохранённое решение' END
  ||CASE WHEN s.decision_id IS DISTINCT FROM d.id THEN ' · предыдущая редакция' ELSE '' END,'Решение уполномоченного сотрудника',d.id::text,d.revision_created)
 FROM e JOIN states s ON s.enrollment_id=e.enrollment_id AND s.organization_id=p_org AND s.user_id=e.user_id AND s.course_id=e.course_id
 JOIN public.uc_learning_attestation_decisions d ON d.state_id=s.id AND d.organization_id=p_org AND d.user_id=e.user_id AND NOT d.redacted
 LEFT JOIN public.student_groups g ON g.id=s.group_id AND g.organization_id=p_org
 WHERE(p_type IS NULL OR p_type='attestation_decisions') AND(p_scope->>'group_id' IS NULL OR s.group_id=(p_scope->>'group_id')::uuid)
  AND uc_education_journal_private.source_allowed(p_org,p_scope,s.group_id,e.enrollment_id,e.user_id,e.course_id)
 UNION ALL
 SELECT uc_education_journal_private.row_value('session:'||v.id||':'||e.user_id,'conducted_sessions',e.user_id,e.person_label,e.enrollment_id,e.course_id,e.course_label,s.group_id,g.name,
  v.starts_at,coalesce(l.title,'Проведённое занятие'),CASE a.value->>'status' WHEN 'present' THEN 'Присутствовал' WHEN 'absent' THEN 'Отсутствовал' WHEN 'excused' THEN 'Уважительная причина' ELSE 'Отметка не подтверждена' END,
  'Фактическое занятие: подтверждено сотрудником; редакция '||v.revision,v.id::text,v.revision)
 FROM e JOIN public.uc_conducted_sessions s ON s.course_id=e.course_id AND s.organization_id=p_org
 JOIN sessions v ON v.session_id=s.id CROSS JOIN LATERAL jsonb_array_elements(v.attendance) a(value)
 LEFT JOIN public.lessons l ON l.id=s.lesson_id LEFT JOIN public.student_groups g ON g.id=s.group_id AND g.organization_id=p_org
 WHERE(p_type IS NULL OR p_type='conducted_sessions') AND NOT v.redacted AND a.value->>'user_id'=e.user_id::text AND a.value->>'enrollment_id'=e.enrollment_id::text
  AND(p_scope->>'group_id' IS NULL OR s.group_id=(p_scope->>'group_id')::uuid)
  AND uc_education_journal_private.source_allowed(p_org,p_scope,s.group_id,e.enrollment_id,e.user_id,e.course_id)
 UNION ALL
 SELECT uc_education_journal_private.row_value('admission-draft:'||d.id,'admission_orders',e.user_id,e.person_label,e.enrollment_id,e.course_id,e.course_label,d.group_id,g.name,
  d.recorded_at,'Проект приказа о зачислении от '||to_char(d.document_date,'DD.MM.YYYY'),
  CASE WHEN (projection.value->>'registered_locked')::boolean THEN 'Есть зарегистрированный документ; проект не изменяет его'
   WHEN (projection.value->>'stale')::boolean THEN 'Исходные сведения изменились; проект требует обновления'
   WHEN d.status='prepared' THEN 'Проект: без подписи и регистрационного номера' WHEN d.status='disabled' THEN 'Автоподготовка отключена' ELSE 'Требуются сведения перед подготовкой' END,
  'Зачисление на курс; подготовка проекта приказа',d.id::text,d.revision)
 FROM e JOIN public.uc_automatic_admission_drafts d ON d.enrollment_id=e.enrollment_id AND d.organization_id=p_org AND d.user_id=e.user_id AND d.course_id=e.course_id
 LEFT JOIN public.student_groups g ON g.id=d.group_id AND g.organization_id=p_org
 CROSS JOIN LATERAL(SELECT public.uc_admission_draft_projection(d.id) AS value) projection
 WHERE(p_type IS NULL OR p_type='admission_orders') AND(p_scope->>'group_id' IS NULL OR d.group_id=(p_scope->>'group_id')::uuid)
  AND uc_education_journal_private.source_allowed(p_org,p_scope,d.group_id,e.enrollment_id,e.user_id,e.course_id)
 UNION ALL
 SELECT uc_education_journal_private.row_value('education:'||r.id,'education_documents',p.user_id,coalesce(nullif(btrim(p.full_name),''),'Имя не указано'),e.enrollment_id,coalesce(e.course_id,rc.id),coalesce(e.course_label,rc.title),r.group_id,g.name,
  r.created_at,CASE r.document_type WHEN 'certificate' THEN 'Удостоверение' WHEN 'diploma' THEN 'Диплом' WHEN 'qualification' THEN 'Свидетельство' ELSE 'Документ об обучении' END,
  coalesce(r.document_number,'Номер не указан')||' · '||CASE WHEN s.annulment IS NOT NULL THEN 'Аннулировано' WHEN s.record_id IS NULL THEN 'Прежняя запись; контролируемое подтверждение выдачи отсутствует' ELSE 'Запись контролируемого реестра' END,
  CASE WHEN s.record_id IS NULL THEN 'Прежний учёт документов' ELSE 'Контролируемый реестр документов об обучении' END,r.id::text,s.revision)
 FROM public.education_document_records r JOIN public.profiles p ON p.user_id=r.user_id AND p.organization_id=p_org
 LEFT JOIN e ON e.enrollment_id=r.enrollment_id AND e.user_id=r.user_id AND(r.course_id IS NULL OR r.course_id=e.course_id)
 LEFT JOIN public.courses rc ON rc.id=r.course_id AND rc.organization_id=p_org
 LEFT JOIN public.uc_education_issuance_states s ON s.record_id=r.id AND s.organization_id=p_org AND s.user_id=p.user_id
 LEFT JOIN public.student_groups g ON g.id=r.group_id AND g.organization_id=p_org
 WHERE(p_type IS NULL OR p_type='education_documents') AND r.organization_id=p_org AND r.deleted_at IS NULL AND NOT coalesce(s.redacted,false)
  AND public.uc_identification_target_allowed(p_org,p.user_id,false)
  AND(p_scope->>'kind'<>'student' OR p.user_id=(p_scope->>'student_user_id')::uuid)
  AND(p_scope->>'enrollment_id' IS NULL OR e.enrollment_id=(p_scope->>'enrollment_id')::uuid)
  AND(p_scope->>'group_id' IS NULL OR r.group_id=(p_scope->>'group_id')::uuid)
  AND uc_education_journal_private.source_allowed(p_org,p_scope,r.group_id,e.enrollment_id,p.user_id,coalesce(e.course_id,rc.id))
 UNION ALL
 SELECT uc_education_journal_private.row_value('registry:'||r.id,'document_registration',r.subject_id,r.subject_label,r.subject_enrollment,r.subject_course,r.subject_course_label,r.group_id,g.name,
  r.registered_at,CASE WHEN p_scope->>'kind'='student' THEN CASE r.data->>'document_type' WHEN 'enrollment_order' THEN 'Приказ о зачислении' WHEN 'expulsion_order' THEN 'Приказ об отчислении' ELSE 'Регистрация документа' END ELSE coalesce(r.data->>'title','Регистрация документа') END,
  'Регистрация № '||r.registration_id||CASE WHEN r.status='archived' THEN ' · в архиве' ELSE '' END,'Реестр регистрации документов',r.id::text,r.revision)
 FROM personal_registry r LEFT JOIN public.student_groups g ON g.id=r.group_id AND g.organization_id=p_org
 WHERE(p_type IS NULL OR p_type='document_registration')
 UNION ALL
 SELECT uc_education_journal_private.row_value('registered-admission:'||r.id,'admission_orders',r.subject_id,r.subject_label,r.subject_enrollment,r.subject_course,r.subject_course_label,r.group_id,g.name,
  r.registered_at,'Зарегистрированный приказ о зачислении','Регистрация № '||r.registration_id,'Зарегистрированный точный документ',r.id::text,r.revision)
 FROM personal_registry r LEFT JOIN public.student_groups g ON g.id=r.group_id AND g.organization_id=p_org
 WHERE(p_type IS NULL OR p_type='admission_orders') AND r.data->>'document_type'='enrollment_order'
 UNION ALL
 SELECT uc_education_journal_private.row_value('copy:'||r.id,'copies_duplicates',r.subject_id,r.subject_label,NULL,NULL,NULL,r.group_id,g.name,
  r.registered_at,CASE r.copy_type WHEN 'duplicate' THEN 'Дубликат документа' ELSE 'Копия документа' END,'Регистрация № '||r.registration_id||CASE WHEN r.archived THEN ' · в архиве' ELSE '' END,
  'Реестр копий и дубликатов',r.id::text,r.revision)
 FROM copies r LEFT JOIN public.student_groups g ON g.id=r.group_id AND g.organization_id=p_org
 WHERE(p_type IS NULL OR p_type='copies_duplicates') AND p_scope->>'enrollment_id' IS NULL
$fn$;

CREATE FUNCTION public.uc_read_education_journal_workspace(p_organization_id uuid,p_scope jsonb,p_query jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET TimeZone='UTC' AS $fn$
DECLARE v_actor uuid:=auth.uid();v_own boolean;v_group uuid;v_student uuid;v_enrollment uuid;v_context jsonb;v_base jsonb;v_rows jsonb;v_counts jsonb;v_snapshot text;v_type text;v_limit integer;v_offset integer:=0;v_total bigint;v_journals jsonb:='[]';v_scope_kind text;v_query_kind text;v_count bigint;v_observed timestamptz:=statement_timestamp();v_unknown bigint;v_tests bigint;v_human bigint;v_state text;v_reason text;
BEGIN
 IF p_scope IS NULL OR jsonb_typeof(p_scope)<>'object' OR p_query IS NULL OR jsonb_typeof(p_query)<>'object' OR p_organization_id IS NULL THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_INVALID_INPUT' USING ERRCODE='22023';END IF;
 v_scope_kind:=p_scope->>'kind';v_query_kind:=p_query->>'kind';
 IF v_scope_kind NOT IN('organization','group','student') OR v_query_kind NOT IN('summary','rows') OR v_scope_kind IS NULL OR v_query_kind IS NULL
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_scope) k WHERE k<>ALL(CASE v_scope_kind WHEN 'organization' THEN ARRAY['kind'] WHEN 'group' THEN ARRAY['kind','group_id'] ELSE ARRAY['kind','student_user_id','enrollment_id','group_id'] END))
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_query) k WHERE k<>ALL(CASE v_query_kind WHEN 'summary' THEN ARRAY['kind'] ELSE ARRAY['kind','journal_type','after','limit','snapshot_key'] END)) THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_INVALID_INPUT' USING ERRCODE='22023';END IF;
 IF v_scope_kind='group' AND(p_scope->>'group_id' IS NULL) OR v_scope_kind='student' AND(p_scope->>'student_user_id' IS NULL OR NOT(p_scope ?& ARRAY['enrollment_id','group_id'])) THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_INVALID_INPUT' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_scope->'kind')<>'string' OR jsonb_typeof(p_query->'kind')<>'string'
 OR(v_scope_kind='group' AND jsonb_typeof(p_scope->'group_id')<>'string')
 OR(v_scope_kind='student' AND(jsonb_typeof(p_scope->'student_user_id')<>'string' OR jsonb_typeof(p_scope->'enrollment_id')NOT IN('string','null') OR jsonb_typeof(p_scope->'group_id')NOT IN('string','null')))
 THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_INVALID_INPUT' USING ERRCODE='22023';END IF;
 v_group:=(p_scope->>'group_id')::uuid;v_student:=(p_scope->>'student_user_id')::uuid;v_enrollment:=(p_scope->>'enrollment_id')::uuid;
 v_own:=v_scope_kind='student' AND v_student=v_actor;
 IF auth.role() IS DISTINCT FROM 'authenticated' OR v_actor IS NULL OR public.account_deletion_access_allowed() IS NOT TRUE OR public.uc_identification_actor_allowed(v_actor,false) IS NOT TRUE OR public.is_user_blocked(v_actor) IS NOT FALSE THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF v_own THEN
  IF NOT public.uc_identification_target_allowed(p_organization_id,v_student,false) OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=v_student AND p.archived_at IS NOT NULL) THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 ELSE
  IF (public.can_access_organization(p_organization_id,'journals.read') AND public.can_access_organization(p_organization_id,'students.read') AND public.can_access_organization(p_organization_id,'documents.read')) IS NOT TRUE THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  IF v_student IS NOT NULL AND NOT(public.uc_identification_target_allowed(p_organization_id,v_student,false) AND public.uc_document_student_scope_allowed(p_organization_id,v_student)) THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 END IF;
 IF v_group IS NOT NULL AND(NOT EXISTS(SELECT 1 FROM public.student_groups g WHERE g.id=v_group AND g.organization_id=p_organization_id) OR
  (v_own AND NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_organization_id AND m.group_id=v_group AND m.user_id=v_student)) OR
  (NOT v_own AND NOT public.uc_document_scope_allowed(p_organization_id,v_group,NULL))) THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF v_enrollment IS NOT NULL AND NOT EXISTS(SELECT 1 FROM uc_education_journal_private.enrollments(p_organization_id,p_scope) e WHERE e.enrollment_id=v_enrollment AND e.user_id=v_student) THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_NOT_FOUND' USING ERRCODE='22023';END IF;
 SELECT jsonb_build_object('organization',jsonb_build_object('id',o.id,'label',left(o.name,2000)),
 'student',CASE WHEN v_student IS NULL THEN NULL ELSE(SELECT jsonb_build_object('user_id',p.user_id,'label',left(coalesce(nullif(btrim(p.full_name),''),'Имя не указано'),2000)) FROM public.profiles p WHERE p.user_id=v_student AND p.organization_id=p_organization_id)END,
 'group',CASE WHEN v_group IS NULL THEN NULL ELSE(SELECT jsonb_build_object('id',g.id,'label',left(g.name,2000)) FROM public.student_groups g WHERE g.id=v_group AND g.organization_id=p_organization_id)END,
 'enrollment',CASE WHEN v_enrollment IS NULL THEN NULL ELSE(SELECT jsonb_build_object('id',e.enrollment_id,'course_id',e.course_id,'course_label',left(e.course_label,2000)) FROM uc_education_journal_private.enrollments(p_organization_id,p_scope) e WHERE e.enrollment_id=v_enrollment)END) INTO v_context FROM public.organizations o WHERE o.id=p_organization_id;
 IF v_context IS NULL THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_NOT_FOUND' USING ERRCODE='22023';END IF;
 IF v_query_kind='rows' THEN
  IF jsonb_typeof(p_query->'journal_type')IS DISTINCT FROM'string' OR jsonb_typeof(p_query->'limit')IS DISTINCT FROM'number' OR p_query->>'limit'!~'^[0-9]{1,3}$'
  OR jsonb_typeof(p_query->'after')NOT IN('string','null') OR jsonb_typeof(p_query->'snapshot_key')NOT IN('string','null')
  OR length(p_query->>'snapshot_key')>128 OR length(p_query->>'after')>4096 THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_INVALID_INPUT' USING ERRCODE='22023';END IF;
  v_type:=p_query->>'journal_type';v_limit:=(p_query->>'limit')::integer;
  IF v_type IS NULL OR v_type<>ALL(ARRAY['activity','current_control','final_tests','attestation_decisions','conducted_sessions','admission_orders','education_documents','document_registration','copies_duplicates']) OR v_limit IS NULL OR v_limit NOT BETWEEN 1 AND 100 OR NOT(p_query ?& ARRAY['after','snapshot_key']) THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_INVALID_INPUT' USING ERRCODE='22023';END IF;
 END IF;
 IF v_query_kind='summary' THEN
  -- Summary only retains counts, not a complete organization-sized JSON array.
  SELECT coalesce(jsonb_object_agg(journal_type,n),'{}'::jsonb) INTO v_counts FROM(
   SELECT r.value->>'journal_type' AS journal_type,count(*) AS n FROM uc_education_journal_private.rows(p_organization_id,p_scope,NULL) r(value) GROUP BY 1) counts;
  v_snapshot:=md5(p_organization_id::text||p_scope::text||v_context::text||v_counts::text);
 ELSE
  SELECT coalesce(jsonb_agg(r.value ORDER BY coalesce(r.value->>'event_at','') DESC,r.value->>'id'),'[]'::jsonb),count(*) INTO v_rows,v_total
  FROM uc_education_journal_private.rows(p_organization_id,p_scope,v_type) r(value);
  v_snapshot:=md5(p_organization_id::text||p_scope::text||v_context::text||v_type||v_rows::text);
 END IF;
 v_base:=jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'scope',p_scope,'observed_at',v_observed,'snapshot_key',v_snapshot,'capabilities',jsonb_build_object('can_read',true,'can_export',true),'context',v_context);
 IF v_query_kind='summary' THEN
  WITH e AS MATERIALIZED(SELECT * FROM uc_education_journal_private.enrollments(p_organization_id,p_scope)),
  criteria AS(SELECT DISTINCT e.enrollment_id,cv.definition->'main'->>'kind' AS kind
   FROM e JOIN public.uc_learning_outcome_states s ON s.enrollment_id=e.enrollment_id AND s.organization_id=p_organization_id AND s.user_id=e.user_id AND s.course_id=e.course_id
   JOIN public.group_program_enrollment_snapshots sn ON sn.id=s.program_enrollment_snapshot_id AND sn.organization_id=s.organization_id AND sn.group_id=s.group_id AND sn.enrollment_id=s.enrollment_id AND sn.user_id=s.user_id AND sn.course_id=s.course_id AND sn.version_id=s.program_version_id
   JOIN public.uc_learning_criteria_versions cv ON cv.id=s.criteria_id AND cv.organization_id=p_organization_id AND cv.course_id=e.course_id AND cv.program_version_id=s.program_version_id AND cv.state='approved' AND NOT cv.redacted
   WHERE(p_scope->>'group_id' IS NULL OR s.group_id=v_group)
   AND uc_education_journal_private.source_allowed(p_organization_id,p_scope,s.group_id,e.enrollment_id,e.user_id,e.course_id)
   AND(cv.definition->'main'->>'kind'='human_assessment' OR(cv.definition->'main'->>'kind'='test' AND EXISTS(SELECT 1 FROM public.lessons l WHERE l.id::text=cv.definition->'main'->>'lesson_id' AND l.course_id=e.course_id AND l.type='test'))))
  SELECT(SELECT count(*) FROM e WHERE NOT EXISTS(SELECT 1 FROM criteria c WHERE c.enrollment_id=e.enrollment_id)),
   count(*) FILTER(WHERE kind='test'),count(*) FILTER(WHERE kind='human_assessment') INTO v_unknown,v_tests,v_human FROM criteria;
  FOR v_type IN SELECT unnest(ARRAY['activity','current_control','final_tests','attestation_decisions','conducted_sessions','admission_orders','education_documents','document_registration','copies_duplicates']) LOOP
   v_count:=coalesce((v_counts->>v_type)::bigint,0);
   v_state:='available';v_reason:=NULL;
   IF v_type='final_tests' THEN
    IF v_count=0 AND(v_unknown>0 OR(v_tests=0 AND v_human=0)) THEN v_state:='unavailable';v_reason:='Критерии итогового контроля не подтверждены. Все сохранённые попытки доступны в текущем контроле.';
    ELSIF v_count=0 AND v_tests=0 AND v_human>0 THEN v_state:='not_applicable';v_reason:='В подтверждённых критериях предусмотрена оценка сотрудником, а не итоговый онлайн-тест.';
    ELSE v_reason:=CASE WHEN v_unknown>0 THEN 'Показаны подтверждённые попытки. Для части зачислений критерии ещё не настроены.' ELSE 'Только основной тест подтверждённой программы; решение об аттестации учитывается отдельно.' END;END IF;
   ELSIF v_type='copies_duplicates' AND v_enrollment IS NOT NULL THEN v_state:='unavailable';v_reason:='У копий нет подтверждённой связи с конкретным зачислением. Выберите «Все курсы» для персонального реестра копий.';
   END IF;
   v_journals:=v_journals||jsonb_build_array(jsonb_build_object('journal_type',v_type,'title',CASE v_type WHEN 'activity' THEN 'Завершённые онлайн-уроки' WHEN 'current_control' THEN 'Текущий контроль' WHEN 'final_tests' THEN 'Итоговые тесты' WHEN 'attestation_decisions' THEN 'Решения об аттестации' WHEN 'conducted_sessions' THEN 'Проведённые занятия' WHEN 'admission_orders' THEN 'Приказы о зачислении' WHEN 'education_documents' THEN 'Документы об обучении' WHEN 'document_registration' THEN 'Регистрация документов' ELSE 'Копии и дубликаты документов' END,
    'record_count',CASE WHEN v_state='available' THEN v_count ELSE NULL END,'source_label',CASE v_type WHEN 'activity' THEN 'Новые завершения сохраняются в хронологии; прежние отметки — текущее состояние, не очная посещаемость' WHEN 'current_control' THEN 'Попытки тестов и проверка заданий; старые результаты не переоцениваются' WHEN 'final_tests' THEN 'Только основной тест подтверждённых критериев; не решение об аттестации' WHEN 'attestation_decisions' THEN 'Решения уполномоченных сотрудников, включая предыдущие редакции' WHEN 'conducted_sessions' THEN 'Фактические занятия, подтверждённые сотрудником' WHEN 'admission_orders' THEN 'Новые проекты и зарегистрированные персональные приказы; без автоматической подписи' WHEN 'education_documents' THEN 'Контролируемые и прежние записи с раздельным статусом' ELSE 'Сохранённые записи реестра с точной связью с субъектом' END,'automatic',true,'exportable',v_state='available','state',v_state,'reason',v_reason));
  END LOOP;
  RETURN v_base||jsonb_build_object('kind','summary','journals',v_journals);
 END IF;
 IF p_query->>'snapshot_key' IS NOT NULL AND p_query->>'snapshot_key'<>v_snapshot THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_SOURCE_CHANGED' USING ERRCODE='22023';END IF;
 IF p_query->>'after' IS NOT NULL THEN
  IF p_query->>'after'!~'^[0-9]{1,9}:[a-f0-9]{32}$' THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_INVALID_INPUT' USING ERRCODE='22023';END IF;
  IF split_part(p_query->>'after',':',2)<>v_snapshot THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_SOURCE_CHANGED' USING ERRCODE='22023';END IF;
  v_offset:=split_part(p_query->>'after',':',1)::integer;
  IF v_offset>v_total THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_SOURCE_CHANGED' USING ERRCODE='22023';END IF;
 END IF;
 RETURN v_base||jsonb_build_object('kind','rows','journal_type',v_type,'rows',coalesce((SELECT jsonb_agg(value ORDER BY ord) FROM jsonb_array_elements(v_rows) WITH ORDINALITY q(value,ord) WHERE ord>v_offset AND ord<=v_offset+v_limit),'[]'::jsonb),'total_count',v_total,'next_cursor',CASE WHEN v_offset+v_limit<v_total THEN(v_offset+v_limit)::text||':'||v_snapshot ELSE NULL END);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'UC_EDUCATION_JOURNAL_INVALID_INPUT' USING ERRCODE='22023';
END;$fn$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA uc_education_journal_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.uc_read_education_journal_workspace(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.uc_read_education_journal_workspace(uuid,jsonb,jsonb) TO authenticated;
COMMENT ON FUNCTION public.uc_read_education_journal_workspace(uuid,jsonb,jsonb) IS 'Readonly journal facts and exact subject projection. Does not certify a legal signing/attestation event or historical completeness.';
