-- Separate current authoritative lesson progress from retained test history.
-- No enrollment, historical attempt, grade, homework or document is rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE OR REPLACE FUNCTION public.lpr_complete_own_course_enrollment(p_enrollment_id uuid, p_expected_epoch text, p_legacy boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_enrollment public.enrollments%ROWTYPE;
  v_total integer;
  v_completed integer;
  v_was_completed boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_enrollment:=public.lpr_lock_own_enrollment(p_enrollment_id,p_expected_epoch,p_legacy);
  SELECT *
  INTO v_enrollment
  FROM public.enrollments e
  WHERE e.id = p_enrollment_id
    AND e.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF public.uc_enrollment_is_withdrawn(v_enrollment.id) THEN RAISE EXCEPTION 'retained_enrollment_learning_denied' USING ERRCODE='42501';END IF;
  v_was_completed := v_enrollment.status = 'completed';

  -- Historical grades remain evidence only. Current submissions persist their grade
  -- and lesson_progress atomically; a history read/reset must never recreate LP.
  SELECT COUNT(*) INTO v_total
  FROM public.lessons l
  WHERE l.course_id = v_enrollment.course_id;

  SELECT COUNT(*) INTO v_completed
  FROM public.lesson_progress lp
  JOIN public.lessons l ON l.id = lp.lesson_id
  WHERE l.course_id = v_enrollment.course_id
    AND lp.user_id = v_user_id
    AND lp.completed = true;

  IF v_total = 0 OR v_completed < v_total THEN
    RAISE EXCEPTION 'course_incomplete:%/%', v_completed, v_total USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.enrollments e
  SET progress = 100,
      status = 'completed',
      completed_at = COALESCE(e.completed_at, now())
  WHERE e.id = p_enrollment_id
  RETURNING * INTO v_enrollment;

  RETURN jsonb_build_object(
    'id', v_enrollment.id,
    'status', v_enrollment.status,
    'progress', v_enrollment.progress,
    'completed_at', v_enrollment.completed_at,
    'was_already_completed', v_was_completed,
    'learning_progress_epoch',v_enrollment.learning_progress_epoch::text,
    'learning_progress_reset_at',v_enrollment.learning_progress_reset_at
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.lpr_get_student_test_state(p_lesson_id uuid,p_expected_epoch text,p_legacy boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $history_state$
DECLARE
  a public.test_attempts%ROWTYPE;
  e public.enrollments;
  v_active uuid;
  v_state jsonb;
  v_feedback jsonb;
  v_questions jsonb := '[]'::jsonb;
  v_used jsonb;
  v_show boolean;
  v_passing integer;
  v_current_completed boolean;
  v_manual_credit jsonb;
BEGIN
  e:=public.lpr_lock_own_lesson(p_lesson_id,p_expected_epoch,p_legacy);
  PERFORM public._assert_test_learner_access(p_lesson_id);
  SELECT test_show_answers, test_passing_score INTO v_show, v_passing FROM public.lessons WHERE id = p_lesson_id;
  SELECT EXISTS(SELECT 1 FROM public.lesson_progress lp WHERE lp.user_id=e.user_id AND lp.lesson_id=p_lesson_id AND lp.completed)INTO v_current_completed;
  v_manual_credit:=public._test_manual_credit(p_lesson_id);
  v_state := public._test_attempt_limits(p_lesson_id, auth.uid()) || jsonb_build_object(
    'hasAttempt', false, 'activeAttempt', NULL, 'showAnswers', v_show,
    'passingScore', v_passing, 'manualCredit', CASE WHEN v_current_completed THEN v_manual_credit ELSE NULL END,
    'historicalManualCreditAvailable',v_manual_credit IS NOT NULL AND NOT v_current_completed,
    'historyOnlyResultAvailable',v_manual_credit IS NOT NULL AND NOT v_current_completed,
    'photoRequired', public._final_test_photo_required(p_lesson_id),
    'currentCompleted', v_current_completed,
    'learning_progress_epoch',e.learning_progress_epoch::text,'learning_progress_reset_at',e.learning_progress_reset_at);
  SELECT id INTO v_active FROM public.test_attempt_sessions
    WHERE user_id = auth.uid() AND lesson_id = p_lesson_id AND status = 'in_progress'
      AND(e.learning_progress_reset_at IS NULL OR started_at>=e.learning_progress_reset_at);
  IF v_active IS NOT NULL AND v_manual_credit IS NULL THEN
    v_state := v_state || jsonb_build_object('activeAttempt', public._test_session_payload(v_active));
  END IF;
  SELECT coalesce(jsonb_agg(DISTINCT q), '[]'::jsonb) INTO v_used
    FROM public.test_attempts t CROSS JOIN LATERAL jsonb_array_elements(t.shown_question_ids) q
    WHERE t.user_id = auth.uid() AND t.lesson_id = p_lesson_id
      AND(e.learning_progress_reset_at IS NULL OR EXISTS(SELECT 1 FROM public.test_attempt_sessions ss
        WHERE ss.id=t.session_id AND ss.started_at>=e.learning_progress_reset_at));
  v_state := v_state || jsonb_build_object('usedQuestionIds', v_used);
  SELECT * INTO a FROM public.test_attempts
    WHERE user_id = auth.uid() AND lesson_id = p_lesson_id
      AND(e.learning_progress_reset_at IS NULL OR EXISTS(SELECT 1 FROM public.test_attempt_sessions ss
        WHERE ss.id=test_attempts.session_id AND ss.started_at>=e.learning_progress_reset_at))
      ORDER BY completed_at DESC, id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN v_state; END IF;
  -- Old clients must not promote retained/unknown grades into current LP.
  -- Raw outcome, answers and immutable snapshots remain available only through history.
  IF NOT v_current_completed AND a.passed IS DISTINCT FROM false THEN
    RETURN v_state||jsonb_build_object('hasAttempt',false,'passed',NULL,'attempt',NULL,'historyOnlyResultAvailable',true);
  END IF;
  IF a.session_id IS NOT NULL THEN
    v_feedback := public._test_grade_payload(a.session_id);
    SELECT public._test_public_questions(questions_snapshot, v_show AND show_answers)
      INTO v_questions FROM public.test_attempt_sessions WHERE id = a.session_id;
  ELSE
    -- Historical starts, question versions, and passing threshold are unknown.
    v_feedback := jsonb_build_object('correctAnswers', '{}'::jsonb, 'explanations', '{}'::jsonb,
      'scorePercent', CASE WHEN a.max_score > 0 THEN round(a.score * 100.0 / a.max_score)::integer ELSE 0 END,
      'passed', a.passed, 'passingScore', a.passing_score);
  END IF;
  RETURN v_state || v_feedback || jsonb_build_object('hasAttempt', true,
    'attempt', to_jsonb(a) || jsonb_build_object('questions', v_questions, 'legacy', a.session_id IS NULL));
END;
$history_state$;

CREATE FUNCTION public.get_own_course_learning_history(p_course_id uuid,p_expected_epoch text,
 p_cursor_ts timestamptz DEFAULT NULL,p_cursor_kind text DEFAULT NULL,p_cursor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $history$
DECLARE e public.enrollments;eid uuid;attempt_rows jsonb;reset_rows jsonb;credit_rows jsonb;lesson_rows jsonb;
 attempt_total bigint;reset_total bigint;credit_total bigint;more boolean;next_cursor jsonb;valid_cursor boolean;
BEGIN
 SELECT id INTO eid FROM public.enrollments WHERE user_id=auth.uid()AND course_id=p_course_id;
 -- The checked lock serializes history/LP/epoch with reset and current submit.
 e:=public.lpr_lock_own_enrollment(eid,p_expected_epoch,false);
 IF num_nonnulls(p_cursor_ts,p_cursor_kind,p_cursor_id)NOT IN(0,3)
  OR(p_cursor_kind IS NOT NULL AND p_cursor_kind NOT IN('attempt','reset','manual_credit'))
  THEN RAISE EXCEPTION 'history_cursor_not_available' USING ERRCODE='22023';END IF;
 IF p_cursor_kind IS NOT NULL THEN
  -- A cursor is an exact record of THIS authorized course, not a foreign row probe.
  IF p_cursor_kind='attempt'THEN
   SELECT EXISTS(SELECT 1 FROM public.test_attempts a JOIN public.lessons l ON l.id=a.lesson_id
    WHERE a.id=p_cursor_id AND a.completed_at=p_cursor_ts AND a.user_id=e.user_id AND l.course_id=e.course_id)INTO valid_cursor;
  ELSIF p_cursor_kind='reset'THEN
   SELECT EXISTS(SELECT 1 FROM public.course_learning_progress_resets r
    WHERE r.id=p_cursor_id AND r.reset_at=p_cursor_ts AND r.enrollment_id=e.id AND r.user_id=e.user_id AND r.course_id=e.course_id)INTO valid_cursor;
  ELSE
   SELECT EXISTS(SELECT 1 FROM public.course_manual_credits c
    WHERE c.id=p_cursor_id AND coalesce(c.revoked_at,c.credited_at)=p_cursor_ts AND c.enrollment_id=e.id)INTO valid_cursor;
  END IF;
  IF NOT valid_cursor THEN RAISE EXCEPTION 'history_cursor_not_available' USING ERRCODE='22023';END IF;
 END IF;
 SELECT count(*)INTO attempt_total FROM public.test_attempts a JOIN public.lessons l ON l.id=a.lesson_id
 WHERE a.user_id=e.user_id AND l.course_id=e.course_id;
 SELECT count(*)INTO reset_total FROM public.course_learning_progress_resets r
 WHERE r.enrollment_id=e.id AND r.user_id=e.user_id AND r.course_id=e.course_id;
 SELECT count(*)INTO credit_total FROM public.course_manual_credits WHERE enrollment_id=e.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('lesson_id',l.id,'current_completed',coalesce(lp.completed,false))
 ORDER BY l.order_index NULLS LAST,l.id),'[]'::jsonb)INTO lesson_rows
 FROM public.lessons l LEFT JOIN public.lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=e.user_id
 WHERE l.course_id=e.course_id;
 WITH attempt_metadata AS(
  SELECT a.id,a.lesson_id,l.title AS lesson_title,a.completed_at,a.score,a.max_score,
   coalesce(a.passing_score,s.passing_score)AS passing_score,
   coalesce(a.passed,CASE WHEN a.max_score>0 AND coalesce(a.passing_score,s.passing_score)IS NOT NULL THEN round(a.score::numeric*100/a.max_score)>=coalesce(a.passing_score,s.passing_score)ELSE NULL END)AS passed,
   coalesce(s.started_at,a.started_at)AS started_at,coalesce(lp.completed,false)AS current_completed
  FROM public.test_attempts a JOIN public.lessons l ON l.id=a.lesson_id
  LEFT JOIN public.test_attempt_sessions s ON s.id=a.session_id AND s.user_id=a.user_id AND s.lesson_id=a.lesson_id
  LEFT JOIN public.lesson_progress lp ON lp.user_id=e.user_id AND lp.lesson_id=l.id
  WHERE a.user_id=e.user_id AND l.course_id=e.course_id
 ), classified AS(
  SELECT a.*,
   CASE WHEN a.started_at IS NULL THEN NULL
    ELSE coalesce((SELECT r.learning_progress_epoch::text FROM public.course_learning_progress_resets r
     WHERE r.enrollment_id=e.id AND r.reset_at<=a.started_at ORDER BY r.reset_at DESC,r.learning_progress_epoch DESC LIMIT 1),'0')END AS run_epoch,
   a.started_at IS NOT NULL AND e.learning_progress_reset_at IS NOT NULL AS historical_boundary_known,
   CASE WHEN a.started_at IS NULL THEN false
    WHEN e.learning_progress_reset_at IS NULL THEN a.current_completed
    ELSE a.started_at>=e.learning_progress_reset_at END AS is_current_run
  FROM attempt_metadata a
 ), all_events AS(
  SELECT 'attempt'::text AS kind,completed_at AS occurred_at,id,jsonb_build_object(
   'id',id,'lesson_id',lesson_id,'lesson_title',lesson_title,'started_at',started_at,'completed_at',completed_at,
   'score',score,'max_score',max_score,'passed',passed,'passing_score',passing_score,'run_epoch',run_epoch,
   'historical_boundary_known',historical_boundary_known,'is_current_run',is_current_run,
   'is_counted_in_current_run',coalesce(passed,false) AND current_completed AND is_current_run)AS payload FROM classified
  UNION ALL
  SELECT 'reset',r.reset_at,r.id,jsonb_build_object('id',r.id,'previous_epoch',r.previous_epoch::text,
   'learning_progress_epoch',r.learning_progress_epoch::text,'reset_at',r.reset_at,
   'previous_progress',coalesce((r.before_enrollment->>'progress')::integer,0),
   'previous_status',r.before_enrollment->>'status')
  FROM public.course_learning_progress_resets r WHERE r.enrollment_id=e.id AND r.user_id=e.user_id AND r.course_id=e.course_id
  UNION ALL
  SELECT 'manual_credit',coalesce(c.revoked_at,c.credited_at),c.id,
   jsonb_build_object('id',c.id,'credited_at',c.credited_at,'revoked_at',c.revoked_at)
  FROM public.course_manual_credits c WHERE c.enrollment_id=e.id
 ), page_plus AS MATERIALIZED(
  SELECT * FROM all_events WHERE p_cursor_ts IS NULL
   OR(occurred_at,kind COLLATE "C",id)<(p_cursor_ts,p_cursor_kind COLLATE "C",p_cursor_id)
  ORDER BY occurred_at DESC,kind COLLATE "C" DESC,id DESC LIMIT 101
 ), page AS MATERIALIZED(
  SELECT * FROM page_plus ORDER BY occurred_at DESC,kind COLLATE "C" DESC,id DESC LIMIT 100
 )
 SELECT coalesce(jsonb_agg(payload ORDER BY occurred_at,id)FILTER(WHERE kind='attempt'),'[]'::jsonb),
  coalesce(jsonb_agg(payload ORDER BY occurred_at,id)FILTER(WHERE kind='reset'),'[]'::jsonb),
  coalesce(jsonb_agg(payload ORDER BY occurred_at,id)FILTER(WHERE kind='manual_credit'),'[]'::jsonb),
  (SELECT count(*)>100 FROM page_plus),
  CASE WHEN(SELECT count(*)>100 FROM page_plus)THEN(
   SELECT jsonb_build_object('ts',occurred_at,'kind',kind,'id',id)FROM page
   ORDER BY occurred_at,kind COLLATE "C",id LIMIT 1)ELSE NULL END
 INTO attempt_rows,reset_rows,credit_rows,more,next_cursor FROM page;
 RETURN jsonb_build_object('course_id',e.course_id,'enrollment_id',e.id,
  'learning_progress_epoch',e.learning_progress_epoch::text,'learning_progress_reset_at',e.learning_progress_reset_at,
  'lessons',lesson_rows,'attempts',attempt_rows,'resets',reset_rows,'manual_credits',credit_rows,
  'counts',jsonb_build_object('attempts_total',attempt_total,'resets_total',reset_total,'manual_credits_total',credit_total),
  'has_more',more,'next_cursor',next_cursor,'per_page_limit',100);
END;$history$;
REVOKE ALL ON FUNCTION public.get_own_course_learning_history(uuid,text,timestamptz,text,uuid)FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_own_course_learning_history(uuid,text,timestamptz,text,uuid)TO authenticated;

CREATE OR REPLACE FUNCTION public.get_student_learning_results(p_organization_id uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $summary$
DECLARE v_result jsonb;
BEGIN
 IF auth.uid()IS NULL OR public.account_deletion_access_allowed()IS NOT TRUE
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid()AND blocked_at IS NULL)
  OR NOT coalesce((
   public.has_role(auth.uid(),'admin'::public.app_role)
   OR public.is_org_owner(auth.uid(),p_organization_id)
   OR(EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=auth.uid()
    AND s.organization_id=p_organization_id AND(s.expires_at IS NULL OR s.expires_at>now()))
    AND public.has_org_staff_permission(auth.uid(),p_organization_id,'students.read'))
  ),false)THEN RAISE EXCEPTION 'student_results_forbidden' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user_id
  AND p.organization_id=p_organization_id AND public.is_student_profile(p.user_id,p_organization_id))
  THEN RAISE EXCEPTION 'student_not_in_organization' USING ERRCODE='42501';END IF;
 WITH course_results AS(
  SELECT e.id AS enrollment_id,e.course_id,c.title AS course_title,
   coalesce(e.progress,0)AS progress,e.status,e.started_at,e.completed_at,
   coalesce(e.time_spent,0)AS time_spent,CASE WHEN mc.credited_at IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.lessons ml WHERE ml.course_id=e.course_id)
    AND NOT EXISTS(SELECT 1 FROM public.lessons ml LEFT JOIN public.lesson_progress mp ON mp.lesson_id=ml.id AND mp.user_id=e.user_id
     WHERE ml.course_id=e.course_id AND NOT coalesce(mp.completed,false))THEN mc.credited_at ELSE NULL END AS manual_credited_at,
   e.learning_progress_epoch::text AS learning_progress_epoch,e.learning_progress_reset_at,
   coalesce(t.tests,'[]'::jsonb)AS tests
  FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id AND c.organization_id=p_organization_id
  LEFT JOIN public.course_manual_credits mc ON mc.enrollment_id=e.id AND mc.revoked_at IS NULL
  LEFT JOIN LATERAL(
   SELECT jsonb_agg(jsonb_build_object(
    'lesson_id',l.id,'lesson_title',l.title,'score',a.score,'max_score',a.max_score,
    'percent',CASE WHEN a.max_score>0 THEN round(a.score::numeric*100/a.max_score)::integer ELSE NULL END,
    'passing_score',CASE WHEN a.id IS NULL THEN coalesce(l.test_passing_score,70)ELSE a.passing_score END,
    'passed',CASE WHEN mc.credited_at IS NOT NULL AND coalesce(lp.completed,false)THEN true WHEN a.id IS NULL THEN NULL
     WHEN NOT coalesce(lp.completed,false)AND coalesce(a.passed,CASE WHEN a.max_score>0 AND a.passing_score IS NOT NULL THEN round(a.score::numeric*100/a.max_score)>=a.passing_score ELSE NULL END)THEN NULL
     ELSE coalesce(a.passed,CASE WHEN a.max_score>0 AND a.passing_score IS NOT NULL THEN round(a.score::numeric*100/a.max_score)>=a.passing_score ELSE NULL END)END,
    'attempts_used',counts.total_count,'completed_at',a.completed_at,
    'manual_credited_at',CASE WHEN coalesce(lp.completed,false)THEN mc.credited_at ELSE NULL END,
    'current_run_attempts_used',counts.current_count,
    'current_completed',coalesce(lp.completed,false),'historical_attempts_used',counts.total_count,
    'last_historical_attempt_at',counts.last_at
   )ORDER BY l.order_index NULLS LAST,l.id)AS tests
   FROM public.lessons l
   LEFT JOIN public.lesson_progress lp ON lp.user_id=p_user_id AND lp.lesson_id=l.id
   LEFT JOIN LATERAL(
    SELECT ta.id,ta.score,ta.max_score,ta.passed,coalesce(ta.passing_score,ss.passing_score)AS passing_score,ta.completed_at
    FROM public.test_attempts ta LEFT JOIN public.test_attempt_sessions ss ON ss.id=ta.session_id
     AND ss.user_id=ta.user_id AND ss.lesson_id=ta.lesson_id
    WHERE ta.user_id=p_user_id AND ta.lesson_id=l.id
     AND((e.learning_progress_epoch=0 AND coalesce(lp.completed,false))
       OR(e.learning_progress_reset_at IS NOT NULL AND ss.started_at>=e.learning_progress_reset_at))
    ORDER BY ta.completed_at DESC NULLS LAST,ta.id DESC LIMIT 1
   )a ON true
   CROSS JOIN LATERAL(
    SELECT count(*)AS total_count,max(ta.completed_at)AS last_at,
     count(*)FILTER(WHERE(e.learning_progress_epoch=0 AND coalesce(lp.completed,false))
      OR(e.learning_progress_reset_at IS NOT NULL AND ss.started_at>=e.learning_progress_reset_at))AS current_count
    FROM public.test_attempts ta LEFT JOIN public.test_attempt_sessions ss ON ss.id=ta.session_id
     AND ss.user_id=ta.user_id AND ss.lesson_id=ta.lesson_id
    WHERE ta.user_id=p_user_id AND ta.lesson_id=l.id
   )counts
   WHERE l.course_id=e.course_id AND l.type='test'
  )t ON true
  WHERE e.user_id=p_user_id
 )
 SELECT coalesce(jsonb_agg(to_jsonb(r)ORDER BY r.course_title,r.course_id),'[]'::jsonb)
 INTO v_result FROM course_results r;
 RETURN jsonb_build_object('organization_id',p_organization_id,'user_id',p_user_id,'courses',v_result);
END;$summary$;

-- CREATE OR REPLACE retains the existing callers/ABI; internal helper stays private.
REVOKE ALL ON FUNCTION public.lpr_get_student_test_state(uuid,text,boolean),
 public.lpr_complete_own_course_enrollment(uuid,text,boolean)FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_student_learning_results(uuid,uuid)FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_student_learning_results(uuid,uuid)TO authenticated;
COMMIT;
