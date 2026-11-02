-- New-only, atomic imports. No existing courses, attempts, programme approvals,
-- subscriptions or publication states are updated by this entrypoint.
BEGIN;
CREATE TABLE public.original_course_import_receipts (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  package_id uuid NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  module_count integer NOT NULL,
  lesson_count integer NOT NULL,
  question_count integer NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, package_id)
);
ALTER TABLE public.original_course_import_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.original_course_import_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.original_course_import_receipts TO authenticated;
CREATE POLICY original_course_import_receipts_editor_read
  ON public.original_course_import_receipts FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND public.can_access_organization(organization_id, 'courses.write'));

CREATE FUNCTION public.import_original_course_draft_v1(p_organization_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_package uuid;
  v_hash text;
  v_receipt public.original_course_import_receipts%ROWTYPE;
  v_modules jsonb; v_lessons jsonb; v_sources jsonb;
  v_m jsonb; v_l jsonb; v_q jsonb; v_s jsonb;
  v_course uuid; v_module uuid; v_lesson uuid;
  v_map jsonb := '{}'::jsonb;
  v_qkeys text[] := ARRAY[]::text[];
  v_source_ids text[] := ARRAY[]::text[];
  v_modkeys text[] := ARRAY[]::text[];
  v_lkeys text[] := ARRAY[]::text[];
  v_order integer; v_qorder integer; v_qtotal integer := 0;
  v_type text; v_content text; v_key text; v_modsum numeric := 0;
  v_sum numeric; v_hours numeric;
BEGIN
  IF v_actor IS NULL OR p_organization_id IS NULL
     OR NOT public.can_access_organization(p_organization_id, 'courses.write') THEN
    RAISE EXCEPTION 'Insufficient permission to import course' USING ERRCODE='42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR octet_length(p_payload::text) > 10*1024*1024
     OR p_payload - ARRAY['schema_version','source_kind','package_id','title','description','code','version','hours','approval_status','sources','modules','lessons'] <> '{}'::jsonb
     OR p_payload->'schema_version' IS DISTINCT FROM '1'::jsonb
     OR p_payload->>'source_kind' IS DISTINCT FROM 'original-private-course'
     OR p_payload->>'approval_status' IS DISTINCT FROM 'unconfirmed'
     OR coalesce(p_payload->>'package_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'Invalid original course package' USING ERRCODE='22023';
  END IF;
  FOR v_key IN SELECT unnest(ARRAY['title','description','code','version']) LOOP
    IF jsonb_typeof(p_payload->v_key) IS DISTINCT FROM 'string'
       OR length(btrim(p_payload->>v_key)) NOT BETWEEN 1 AND (CASE WHEN v_key='description' THEN 12000 ELSE 600 END) THEN
      RAISE EXCEPTION 'Invalid course label' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF jsonb_typeof(p_payload->'hours') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Invalid course hours' USING ERRCODE='22023';
  END IF;
  v_hours := (p_payload->>'hours')::numeric;
  IF v_hours <= 0 OR v_hours > 3000 THEN RAISE EXCEPTION 'Invalid hours' USING ERRCODE='22023'; END IF;
  v_modules:=p_payload->'modules'; v_lessons:=p_payload->'lessons'; v_sources:=p_payload->'sources';
  IF jsonb_typeof(v_modules) IS DISTINCT FROM 'array' OR jsonb_typeof(v_lessons) IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_sources) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid course arrays' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(v_modules) NOT BETWEEN 1 AND 100 OR jsonb_array_length(v_lessons) NOT BETWEEN 1 AND 500
     OR jsonb_array_length(v_sources) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid course array sizes' USING ERRCODE='22023';
  END IF;
  FOR v_s IN SELECT value FROM jsonb_array_elements(v_sources) LOOP
    IF jsonb_typeof(v_s) <> 'object' OR v_s - ARRAY['id','title','url','locator'] <> '{}'::jsonb
       OR coalesce(v_s->>'id','') !~ '^[a-zA-Z0-9_-]{1,100}$'
       OR v_s->>'id'=ANY(v_source_ids)
       OR jsonb_typeof(v_s->'title') IS DISTINCT FROM 'string' OR length(btrim(v_s->>'title')) NOT BETWEEN 1 AND 600
       OR jsonb_typeof(v_s->'locator') IS DISTINCT FROM 'string' OR length(btrim(v_s->>'locator')) NOT BETWEEN 1 AND 600
       OR (v_s ? 'url' AND (jsonb_typeof(v_s->'url') IS DISTINCT FROM 'string' OR v_s->>'url' !~ '^https://[^[:space:]<>]+$')) THEN
      RAISE EXCEPTION 'Invalid source' USING ERRCODE='22023';
    END IF;
    v_source_ids:=array_append(v_source_ids,v_s->>'id');
  END LOOP;
  FOR v_m IN SELECT value FROM jsonb_array_elements(v_modules) LOOP
    IF jsonb_typeof(v_m) <> 'object' OR v_m - ARRAY['key','title','hours'] <> '{}'::jsonb
       OR coalesce(v_m->>'key','') !~ '^[a-zA-Z0-9_-]{1,100}$' OR v_m->>'key'=ANY(v_modkeys)
       OR jsonb_typeof(v_m->'title') IS DISTINCT FROM 'string' OR length(btrim(v_m->>'title')) NOT BETWEEN 1 AND 600
       OR jsonb_typeof(v_m->'hours') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid module' USING ERRCODE='22023';
    END IF;
    IF (v_m->>'hours')::numeric NOT BETWEEN 0 AND 3000 THEN RAISE EXCEPTION 'Invalid module hours' USING ERRCODE='22023'; END IF;
    v_modkeys:=array_append(v_modkeys,v_m->>'key'); v_modsum:=v_modsum+(v_m->>'hours')::numeric;
  END LOOP;
  IF abs(v_modsum-v_hours)>0.000001 THEN RAISE EXCEPTION 'Course hours mismatch' USING ERRCODE='23514'; END IF;
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_lessons) LOOP
    IF jsonb_typeof(v_l) <> 'object' OR v_l - ARRAY['key','module_key','title','type','hours','content','final_assessment','questions'] <> '{}'::jsonb
       OR coalesce(v_l->>'key','') !~ '^[a-zA-Z0-9_-]{1,100}$' OR v_l->>'key'=ANY(v_lkeys)
       OR coalesce(v_l->>'module_key','') <> ALL(v_modkeys)
       OR jsonb_typeof(v_l->'title') IS DISTINCT FROM 'string' OR length(btrim(v_l->>'title')) NOT BETWEEN 1 AND 600
       OR jsonb_typeof(v_l->'hours') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_l->'content') IS DISTINCT FROM 'string' OR length(v_l->>'content')>500000
       OR jsonb_typeof(v_l->'final_assessment') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(v_l->'questions') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid lesson' USING ERRCODE='22023';
    END IF;
    v_lkeys:=array_append(v_lkeys,v_l->>'key');
    v_type:=v_l->>'type'; v_content:=v_l->>'content';
    IF v_type IS NULL OR v_type NOT IN ('text','homework','test') OR (v_l->>'hours')::numeric NOT BETWEEN 0 AND 3000
       OR jsonb_array_length(v_l->'questions')>300 THEN
      RAISE EXCEPTION 'Invalid lesson type or size' USING ERRCODE='22023';
    END IF;
    IF (v_type='test' AND (v_content<>'' OR jsonb_array_length(v_l->'questions')=0))
       OR (v_type<>'test' AND (length(btrim(v_content))=0 OR jsonb_array_length(v_l->'questions')<>0))
       OR (v_type='homework' AND v_content ~ '[<>]')
       OR (v_type='text' AND regexp_replace(v_content,'</?(h[1-6]|p|ul|ol|li|strong|b|em|i|u|s|table|thead|tbody|tfoot|tr|th|td|caption|blockquote|pre|code|br|hr)\s*/?>','','gi') ~ '[<>]') THEN
      RAISE EXCEPTION 'Invalid or active lesson content' USING ERRCODE='22023';
    END IF;
    FOR v_q IN SELECT value FROM jsonb_array_elements(v_l->'questions') LOOP
      IF jsonb_typeof(v_q) <> 'object' OR v_q - ARRAY['key','question','options','correct_answer','explanation','source_ref'] <> '{}'::jsonb
         OR coalesce(v_q->>'key','') !~ '^[a-zA-Z0-9_-]{1,100}$' OR v_q->>'key'=ANY(v_qkeys)
         OR jsonb_typeof(v_q->'question') IS DISTINCT FROM 'string' OR length(btrim(v_q->>'question')) NOT BETWEEN 1 AND 600
         OR jsonb_typeof(v_q->'explanation') IS DISTINCT FROM 'string' OR length(btrim(v_q->>'explanation')) NOT BETWEEN 1 AND 12000
         OR jsonb_typeof(v_q->'source_ref') IS DISTINCT FROM 'string' OR length(v_q->>'source_ref') NOT BETWEEN 1 AND 600
         OR split_part(v_q->>'source_ref',' :: ',1) <> ALL(v_source_ids)
         OR jsonb_typeof(v_q->'correct_answer') IS DISTINCT FROM 'number'
         OR coalesce(v_q->>'correct_answer','') !~ '^[0-9]{1,2}$'
         OR jsonb_typeof(v_q->'options') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Invalid closed question or missing explicit key' USING ERRCODE='22023';
      END IF;
      IF jsonb_array_length(v_q->'options') NOT BETWEEN 2 AND 8 OR (v_q->>'correct_answer')::integer>=jsonb_array_length(v_q->'options')
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_q->'options') o WHERE jsonb_typeof(o)<>'object'
           OR o-ARRAY['text']<>'{}'::jsonb OR jsonb_typeof(o->'text') IS DISTINCT FROM 'string' OR length(btrim(o->>'text')) NOT BETWEEN 1 AND 600)
         OR (SELECT count(DISTINCT o->>'text') FROM jsonb_array_elements(v_q->'options') o)<>jsonb_array_length(v_q->'options') THEN
        RAISE EXCEPTION 'Invalid question options' USING ERRCODE='22023';
      END IF;
      v_qkeys:=array_append(v_qkeys,v_q->>'key'); v_qtotal:=v_qtotal+1;
    END LOOP;
  END LOOP;
  FOR v_m IN SELECT value FROM jsonb_array_elements(v_modules) LOOP
    SELECT sum((l->>'hours')::numeric) INTO v_sum FROM jsonb_array_elements(v_lessons) l WHERE l->>'module_key'=v_m->>'key';
    IF v_sum IS NULL OR abs(v_sum-(v_m->>'hours')::numeric)>0.000001 THEN RAISE EXCEPTION 'Module hours mismatch' USING ERRCODE='23514'; END IF;
  END LOOP;
  v_package:=(p_payload->>'package_id')::uuid;
  v_hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('original-import:'||p_organization_id::text||':'||v_package::text,0));
  SELECT * INTO v_receipt FROM public.original_course_import_receipts WHERE organization_id=p_organization_id AND package_id=v_package;
  IF FOUND THEN
    IF v_receipt.payload_sha256<>v_hash OR v_receipt.course_id IS NULL
       OR NOT EXISTS(SELECT 1 FROM public.courses WHERE id=v_receipt.course_id AND organization_id=p_organization_id) THEN
      RAISE EXCEPTION 'Package already imported with different content or course removed' USING ERRCODE='23514';
    END IF;
    RETURN jsonb_build_object('course_id',v_receipt.course_id,'package_id',v_package,'payload_sha256',v_hash,'is_published',false,
      'module_count',v_receipt.module_count,'lesson_count',v_receipt.lesson_count,'question_count',v_receipt.question_count,'replayed',true);
  END IF;
  -- Existing course-limit and content triggers remain enabled and authoritative.
  INSERT INTO public.courses(organization_id,title,description,is_published,landing_content)
  VALUES(p_organization_id,btrim(p_payload->>'title'),btrim(p_payload->>'description'),false,
    jsonb_build_object('preparation',jsonb_build_object('kind','original-private-course','code',p_payload->>'code','version',p_payload->>'version',
      'hours',v_hours,'approval_status','unconfirmed','sources',v_sources))) RETURNING id INTO v_course;
  v_order:=0;
  FOR v_m IN SELECT value FROM jsonb_array_elements(v_modules) LOOP
    INSERT INTO public.course_modules(course_id,title,order_index) VALUES(v_course,btrim(v_m->>'title'),v_order) RETURNING id INTO v_module;
    v_map:=v_map||jsonb_build_object(v_m->>'key',v_module::text); v_order:=v_order+1;
  END LOOP;
  v_order:=0;
  FOR v_l IN SELECT value FROM jsonb_array_elements(v_lessons) LOOP
    INSERT INTO public.lessons(course_id,module_id,title,type,content,order_index,test_passing_score,test_questions_count,test_show_answers,is_locked,metadata)
    VALUES(v_course,(v_map->>(v_l->>'module_key'))::uuid,btrim(v_l->>'title'),v_l->>'type',NULLIF(v_l->>'content',''),v_order,70,
      CASE WHEN v_l->>'type'='test' THEN jsonb_array_length(v_l->'questions') ELSE NULL END,false,false,
      jsonb_build_object('academic_hours',(v_l->>'hours')::numeric,'final_assessment',(v_l->>'final_assessment')::boolean,
        'authoring_status','unconfirmed','teacher_review_required',v_l->>'type'='homework')) RETURNING id INTO v_lesson;
    v_qorder:=0;
    FOR v_q IN SELECT value FROM jsonb_array_elements(v_l->'questions') LOOP
      INSERT INTO public.test_questions(lesson_id,question,options,correct_answer,order_index,explanation,is_bank_question)
      VALUES(v_lesson,btrim(v_q->>'question'),v_q->'options',(v_q->>'correct_answer')::integer,v_qorder,
        btrim(v_q->>'explanation')||E'\nИсточник: '||(v_q->>'source_ref'),false);
      v_qorder:=v_qorder+1;
    END LOOP;
    v_order:=v_order+1;
  END LOOP;
  INSERT INTO public.original_course_import_receipts(organization_id,package_id,course_id,payload_sha256,module_count,lesson_count,question_count,created_by)
  VALUES(p_organization_id,v_package,v_course,v_hash,jsonb_array_length(v_modules),jsonb_array_length(v_lessons),v_qtotal,v_actor);
  RETURN jsonb_build_object('course_id',v_course,'package_id',v_package,'payload_sha256',v_hash,'is_published',false,
    'module_count',jsonb_array_length(v_modules),'lesson_count',jsonb_array_length(v_lessons),'question_count',v_qtotal,'replayed',false);
END
$function$;
REVOKE ALL ON FUNCTION public.import_original_course_draft_v1(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_original_course_draft_v1(uuid,jsonb) TO authenticated;
COMMENT ON FUNCTION public.import_original_course_draft_v1(uuid,jsonb) IS
  'Imports a complete original course as an unpublished draft with explicit closed keys; rechecks real editor access and existing quota; never approves or overwrites courses.';
COMMIT;
