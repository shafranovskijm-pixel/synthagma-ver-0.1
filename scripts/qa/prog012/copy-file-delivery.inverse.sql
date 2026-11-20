-- SOURCE ONLY. Never erase copy history; a nonempty deployment requires a forward repair.
-- Revert dependent frontend callers first. This is not authorization to run rollback.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=pg_catalog,public,pg_temp;
DO $inverse_guard$ DECLARE r record;p record;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'PCC_TRUSTED_INSTALLER_REQUIRED';END IF;
 -- Serialize the empty check, function restore and DROP with every history INSERT in this SAME transaction.
 BEGIN
  LOCK TABLE public.platform_course_copy_file_bindings,public.platform_course_copy_file_cohorts IN ACCESS EXCLUSIVE MODE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCC_COPY_HISTORY_BUSY_FORWARD_REPAIR_REQUIRED' USING ERRCODE='40001';END;
 IF EXISTS(SELECT 1 FROM public.platform_course_copy_file_cohorts) OR EXISTS(SELECT 1 FROM public.platform_course_copy_file_bindings) THEN
  RAISE EXCEPTION 'PCC_RECORDED_COPY_HISTORY_FORWARD_REPAIR_REQUIRED';END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.purchase_marketplace_course(uuid,uuid,text,integer,text)'::regprocedure),'UTF8')),'hex')<>'13bb3f1acfba66ef5de19d53e8f80addfdb75b77df09282f6a3266bd1bf1c39a' THEN
  RAISE EXCEPTION 'PCC_PURCHASE_AFTERIMAGE_DRIFT';END IF;
 FOR r IN SELECT * FROM(VALUES
 ('public.pcc_v1_immutable()','7a1631d4891e31398a013875e8075123f9fd0b258e3395c2e32555934ba6339f',false),
 ('public.pcc_v1_actor()','51ae9c29eaf12a7c9d637a4fb47882e5b3c34ce57dc26af16fa34535945dc25a',true),
 ('public.pcc_v1_source_context(uuid,uuid)','06e1310f8f4dcea7b6f3b14cfcfd0f5564cbe4fbbba9cd29ac5c1f78f949a77c',true),
 ('public.pcc_v1_module_ready(uuid,uuid,uuid)','9c31bb8856c7bdc24458385b8499eebe12b0286dbe0259fc497a0c82daed5d0a',true),
 ('public.pcc_v1_learner_lesson_ready(uuid,uuid,uuid)','76eb69037a3ab7d4628aba03bcdf94dd5a9c3bd96a326e327627270973f3429f',true),
 ('public.pcc_v1_reference_row(uuid,text,uuid)','e88b6fa99d78003d38b9584dd998827e99000fb7c929ba533f8973f13c4936a0',true),
 ('public.pcc_v1_authorized_reference(uuid,text,uuid,text,text)','aaf68700afb154dc2f4249ac7b4a1bfa97ac8facb154bff64ead62f5b7a13cc3',true),
 ('public.pcc_v1_copy_binding_payload(uuid,jsonb)','aaadad497dbffab5af1282d522b09876fd2d70fe7ea650bbe756f2454c4f829a',true),
 ('public.read_course_exact_file_delivery_context(uuid,text,uuid,text,text)','c729e29c7f5a9853801587c3e8ff16458c8ca4aca2e6d13d6c584e93fe1aaedb',true),
 ('public.read_copied_course_exact_file(uuid,text,uuid,text,text,uuid,uuid)','438512230a77b2e0004179c83b2a7114f3b82849d38280a028014d74058f62a7',true),
 ('public.pcc_v1_add_new_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb)','801c710dcc16dcbbf5f9661b39ffd150591d0c2e485da09a7d63c6b380953670',true),
 ('public.pcc_v1_seal_new_copy(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)','f7ded2e7101ea3f0a5811af8d53860768bb66638a525df7d531ac83c8266a5f4',true),
 ('public.read_course_exact_file_delivery_mode(uuid,text)','f8b793bbc836893d29bb1657487aade3ccaec09dc6f9c72897c6163d98c91f1e',true)
 )v(signature,body_sha256,security_definer) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.signature);
  IF p.oid IS NULL OR pg_get_userbyid(p.proowner)<>'postgres' OR p.prosecdef IS DISTINCT FROM r.security_definer
   OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>r.body_sha256 THEN RAISE EXCEPTION 'PCC_FUNCTION_AFTERIMAGE_DRIFT';END IF;
 END LOOP;
END;$inverse_guard$;

CREATE OR REPLACE FUNCTION public.purchase_marketplace_course(p_marketplace_course_id uuid, p_target_organization_id uuid, p_buyer_type text DEFAULT 'organization'::text, p_students_count integer DEFAULT 1, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_listing public.marketplace_courses%ROWTYPE;
  v_source public.courses%ROWTYPE;
  v_order_id uuid;
  v_new_course_id uuid;
  v_new_module_id uuid;
  v_new_lesson_id uuid;
  v_price numeric;
  v_balance numeric;
  v_module_map jsonb := '{}'::jsonb;
  v_module record;
  v_lesson record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_marketplace_course_id IS NULL OR p_target_organization_id IS NULL THEN
    RAISE EXCEPTION 'Marketplace course and target organization are required'
      USING ERRCODE = '22023';
  END IF;

  -- The current product delivers a cloned course to an organization. A future
  -- student-specific delivery flow must use its own atomic enrollment RPC.
  IF p_buyer_type IS DISTINCT FROM 'organization' THEN
    RAISE EXCEPTION 'Only organization marketplace purchases are supported'
      USING ERRCODE = '22023';
  END IF;

  IF p_students_count IS NULL OR p_students_count < 1 THEN
    RAISE EXCEPTION 'Students count must be positive' USING ERRCODE = '22023';
  END IF;

  -- This helper excludes ordinary students while preserving platform admins,
  -- organization owners and org_staff with courses.write.
  IF NOT public.can_manage_course_files_org(
    p_target_organization_id,
    'courses.write'
  ) THEN
    RAISE EXCEPTION 'Insufficient permission to purchase a course for this organization'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize balance changes for this buyer before the quota trigger locks
  -- the same organization row. This preserves the global organization-row
  -- first lock order and prevents two concurrent purchases overspending it.
  SELECT o.balance
    INTO v_balance
  FROM public.organizations o
  WHERE o.id = p_target_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target organization not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT mc.*
    INTO v_listing
  FROM public.marketplace_courses mc
  WHERE mc.id = p_marketplace_course_id
    AND mc.is_active = true
    AND mc.is_validated = true
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active marketplace course not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.*
    INTO v_source
  FROM public.courses c
  WHERE c.id = v_listing.course_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marketplace source course not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_listing.organization_id IS DISTINCT FROM v_source.organization_id
     AND NOT (
       v_listing.organization_id IS NULL
       AND v_source.organization_id = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
     )
  THEN
    RAISE EXCEPTION 'Marketplace listing tenant does not own its source course'
      USING ERRCODE = 'P0002';
  END IF;

  -- Never trust a client-supplied price.
  v_price := v_listing.price_organization;

  IF v_price < 0 THEN
    RAISE EXCEPTION 'Marketplace price cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF v_balance < v_price THEN
    RAISE EXCEPTION 'Insufficient organization balance'
      USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO public.marketplace_orders (
    marketplace_course_id,
    buyer_user_id,
    buyer_organization_id,
    buyer_type,
    status,
    price,
    students_count,
    notes,
    payment_method,
    paid_at
  )
  VALUES (
    v_listing.id,
    v_user_id,
    p_target_organization_id,
    'organization',
    'pending',
    v_price,
    p_students_count,
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    'balance',
    NULL
  )
  RETURNING id INTO v_order_id;

  IF v_price > 0 THEN
    INSERT INTO public.balance_transactions (
      organization_id,
      amount,
      type,
      description,
      related_order_id,
      performed_by
    )
    VALUES (
      p_target_organization_id,
      -v_price,
      'marketplace_purchase',
      'Покупка курса «' || v_source.title || '»',
      v_order_id,
      v_user_id
    );

    UPDATE public.organizations
    SET balance = balance - v_price
    WHERE id = p_target_organization_id;
  END IF;

  INSERT INTO public.courses (
    accent_color,
    allow_materials_download,
    allow_video_seek,
    catalog_order,
    category_id,
    completion_notify_emails,
    cover_image_url,
    default_access_days,
    description,
    duration,
    frdo_document_type,
    frdo_duration_hours,
    frdo_education_form,
    frdo_financing_source,
    frdo_profession_name,
    frdo_professional_area,
    frdo_program_type,
    frdo_qualification_name,
    frdo_qualification_rank,
    frdo_specialty_group,
    generation_progress,
    hidden_from_catalog,
    is_published,
    landing_content,
    notify_on_completion,
    organization_id,
    price,
    reminder_advance_days,
    require_enrollment_approval,
    retraining_period_months,
    sequential_lessons,
    skip_video_identification,
    slug,
    source_course_id,
    source_order_id,
    title,
    training_form
  )
  VALUES (
    v_source.accent_color,
    v_source.allow_materials_download,
    v_source.allow_video_seek,
    v_source.catalog_order,
    NULL,
    -- Extra notification recipients belong to the seller tenant. The buyer
    -- may configure its own recipients without receiving seller addresses.
    NULL,
    v_source.cover_image_url,
    v_source.default_access_days,
    v_source.description,
    v_source.duration,
    v_source.frdo_document_type,
    v_source.frdo_duration_hours,
    v_source.frdo_education_form,
    v_source.frdo_financing_source,
    v_source.frdo_profession_name,
    v_source.frdo_professional_area,
    v_source.frdo_program_type,
    v_source.frdo_qualification_name,
    v_source.frdo_qualification_rank,
    v_source.frdo_specialty_group,
    v_source.generation_progress,
    v_source.hidden_from_catalog,
    v_source.is_published,
    v_source.landing_content,
    v_source.notify_on_completion,
    p_target_organization_id,
    v_source.price,
    v_source.reminder_advance_days,
    v_source.require_enrollment_approval,
    v_source.retraining_period_months,
    v_source.sequential_lessons,
    v_source.skip_video_identification,
    NULL,
    v_source.id,
    v_order_id,
    v_source.title,
    v_source.training_form
  )
  RETURNING id INTO v_new_course_id;

  INSERT INTO public.course_documents (
    course_id,
    name,
    type,
    description,
    file_url
  )
  SELECT
    v_new_course_id,
    d.name,
    d.type,
    d.description,
    d.file_url
  FROM public.course_documents d
  WHERE d.course_id = v_source.id;

  FOR v_module IN
    SELECT m.id, m.title, m.order_index
    FROM public.course_modules m
    WHERE m.course_id = v_source.id
    ORDER BY m.order_index, m.id
  LOOP
    INSERT INTO public.course_modules (course_id, title, order_index)
    VALUES (v_new_course_id, v_module.title, v_module.order_index)
    RETURNING id INTO v_new_module_id;

    v_module_map := v_module_map || jsonb_build_object(
      v_module.id::text,
      v_new_module_id::text
    );
  END LOOP;

  -- module_access_schedules/module_access_overrides are intentionally reset.
  -- Their absolute dates and per-user exceptions belong to the seller tenant;
  -- the buyer configures a new schedule for the cloned modules when needed.
  FOR v_lesson IN
    SELECT l.*
    FROM public.lessons l
    WHERE l.course_id = v_source.id
    ORDER BY l.order_index, l.id
  LOOP
    IF v_lesson.module_id IS NOT NULL
       AND NOT (v_module_map ? v_lesson.module_id::text)
    THEN
      RAISE EXCEPTION 'Marketplace source lesson % references a module outside the source course',
        v_lesson.id
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.lessons (
      ai_avatar_allow_interruptions,
      ai_avatar_greeting,
      ai_avatar_image_url,
      ai_avatar_language,
      ai_avatar_llm_model,
      ai_avatar_llm_provider,
      ai_avatar_model,
      ai_avatar_name,
      ai_avatar_session_minutes,
      ai_avatar_stt_model,
      ai_avatar_stt_provider,
      ai_avatar_style,
      ai_avatar_subject,
      ai_avatar_system_prompt,
      ai_avatar_tts_provider,
      ai_avatar_tts_voice,
      ai_avatar_voice_id,
      content,
      course_id,
      is_locked,
      module_id,
      order_index,
      test_max_attempts,
      test_passing_score,
      test_questions_count,
      test_questions_to_show,
      test_show_answers,
      title,
      type
    )
    VALUES (
      v_lesson.ai_avatar_allow_interruptions,
      v_lesson.ai_avatar_greeting,
      v_lesson.ai_avatar_image_url,
      v_lesson.ai_avatar_language,
      v_lesson.ai_avatar_llm_model,
      v_lesson.ai_avatar_llm_provider,
      v_lesson.ai_avatar_model,
      v_lesson.ai_avatar_name,
      v_lesson.ai_avatar_session_minutes,
      v_lesson.ai_avatar_stt_model,
      v_lesson.ai_avatar_stt_provider,
      v_lesson.ai_avatar_style,
      v_lesson.ai_avatar_subject,
      v_lesson.ai_avatar_system_prompt,
      v_lesson.ai_avatar_tts_provider,
      v_lesson.ai_avatar_tts_voice,
      v_lesson.ai_avatar_voice_id,
      v_lesson.content,
      v_new_course_id,
      v_lesson.is_locked,
      CASE
        WHEN v_lesson.module_id IS NULL THEN NULL
        ELSE (v_module_map ->> v_lesson.module_id::text)::uuid
      END,
      v_lesson.order_index,
      v_lesson.test_max_attempts,
      v_lesson.test_passing_score,
      v_lesson.test_questions_count,
      v_lesson.test_questions_to_show,
      v_lesson.test_show_answers,
      v_lesson.title,
      v_lesson.type
    )
    RETURNING id INTO v_new_lesson_id;

    INSERT INTO public.test_questions (
      lesson_id,
      question,
      options,
      correct_answer,
      explanation,
      image_url,
      is_bank_question,
      order_index
    )
    SELECT
      v_new_lesson_id,
      q.question,
      q.options,
      q.correct_answer,
      q.explanation,
      q.image_url,
      q.is_bank_question,
      q.order_index
    FROM public.test_questions q
    WHERE q.lesson_id = v_lesson.id;

    INSERT INTO public.lesson_attachments (
      lesson_id,
      name,
      file_url,
      file_type,
      file_size,
      category,
      order_index
    )
    SELECT
      v_new_lesson_id,
      a.name,
      a.file_url,
      a.file_type,
      a.file_size,
      a.category,
      a.order_index
    FROM public.lesson_attachments a
    WHERE a.lesson_id = v_lesson.id;
  END LOOP;

  UPDATE public.marketplace_orders
  SET status = 'paid', paid_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'course_id', v_new_course_id,
    'price', v_price
  );
END
$function$
;
DROP FUNCTION public.read_course_exact_file_delivery_mode(uuid,text);
DROP FUNCTION public.read_copied_course_exact_file(uuid,text,uuid,text,text,uuid,uuid);
DROP FUNCTION public.read_course_exact_file_delivery_context(uuid,text,uuid,text,text);
DROP FUNCTION public.pcc_v1_seal_new_copy(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb);
DROP FUNCTION public.pcc_v1_add_new_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb);
DROP FUNCTION public.pcc_v1_copy_binding_payload(uuid,jsonb);
DROP FUNCTION public.pcc_v1_authorized_reference(uuid,text,uuid,text,text);
DROP FUNCTION public.pcc_v1_reference_row(uuid,text,uuid);
DROP FUNCTION public.pcc_v1_learner_lesson_ready(uuid,uuid,uuid);
DROP FUNCTION public.pcc_v1_module_ready(uuid,uuid,uuid);
DROP FUNCTION public.pcc_v1_source_context(uuid,uuid);
DROP FUNCTION public.pcc_v1_actor();
DROP TABLE public.platform_course_copy_file_bindings;
DROP TABLE public.platform_course_copy_file_cohorts;
DROP FUNCTION public.pcc_v1_immutable();
COMMIT;
