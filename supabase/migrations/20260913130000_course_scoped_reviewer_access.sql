-- Temporary, course-scoped access for an authenticated external reviewer.
--
-- The grant does not enroll the reviewer, does not change app_role or
-- organization staff permissions, and does not make a draft public.  Review
-- data is available only through the two allowlisted SECURITY DEFINER RPCs.

CREATE TABLE IF NOT EXISTS public.course_review_grants (
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  PRIMARY KEY (course_id, user_id),
  CONSTRAINT course_review_grants_expiry_after_creation
    CHECK (expires_at > created_at),
  CONSTRAINT course_review_grants_revocation_after_creation
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_course_review_grants_active_lookup
  ON public.course_review_grants (user_id, course_id, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.course_review_grants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.course_review_grants FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.course_review_grants TO service_role;

COMMENT ON TABLE public.course_review_grants IS
  'Temporary exact user/course grants used only by allowlisted read-only reviewer RPCs.';

CREATE OR REPLACE FUNCTION public.can_review_course(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.course_review_grants grant_row
      JOIN public.courses course_row ON course_row.id = grant_row.course_id
      WHERE grant_row.course_id = p_course_id
        AND grant_row.user_id = auth.uid()
        AND grant_row.revoked_at IS NULL
        AND grant_row.expires_at > now()
        AND course_row.is_published IS FALSE
    )
$function$;

REVOKE ALL ON FUNCTION public.can_review_course(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_course(uuid) TO service_role;

COMMENT ON FUNCTION public.can_review_course(uuid) IS
  'Internal fail-closed predicate for a current, unrevoked exact user/course draft-review grant.';

-- Options are deliberately converted to a string array.  This strips answer
-- flags which may be embedded in legacy JSON option objects, in addition to
-- excluding test_questions.correct_answer and explanation from the RPC type.
CREATE OR REPLACE FUNCTION public.course_review_safe_options(p_options jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_options jsonb := p_options;
  v_result jsonb;
BEGIN
  IF jsonb_typeof(v_options) = 'string' THEN
    BEGIN
      v_options := (v_options #>> '{}')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RETURN '[]'::jsonb;
    END;
  END IF;

  IF jsonb_typeof(v_options) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(
        CASE
          WHEN jsonb_typeof(option_row.value) = 'object' THEN
            COALESCE(
              CASE WHEN jsonb_typeof(option_row.value->'text') = 'string'
                THEN NULLIF(option_row.value->>'text', '') END,
              CASE WHEN jsonb_typeof(option_row.value->'label') = 'string'
                THEN NULLIF(option_row.value->>'label', '') END,
              CASE WHEN jsonb_typeof(option_row.value->'value') = 'string'
                THEN NULLIF(option_row.value->>'value', '') END,
              'Вариант ' || option_row.ordinality::text
            )
          WHEN jsonb_typeof(option_row.value) = 'string'
            THEN COALESCE(option_row.value #>> '{}', 'Вариант ' || option_row.ordinality::text)
          ELSE 'Вариант ' || option_row.ordinality::text
        END
      )
      ORDER BY option_row.ordinality
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM jsonb_array_elements(v_options) WITH ORDINALITY AS option_row(value, ordinality);

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.course_review_safe_options(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.course_review_safe_options(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.course_review_json_string(p_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE WHEN jsonb_typeof(p_value) = 'string' THEN p_value ELSE NULL END
$function$;

CREATE OR REPLACE FUNCTION public.course_review_json_boolean(p_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE WHEN jsonb_typeof(p_value) = 'boolean' THEN p_value ELSE NULL END
$function$;

CREATE OR REPLACE FUNCTION public.course_review_json_number(p_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE WHEN jsonb_typeof(p_value) = 'number' THEN p_value ELSE NULL END
$function$;

CREATE OR REPLACE FUNCTION public.course_review_safe_table_rows(p_rows jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(jsonb_agg(row_data.cells ORDER BY row_data.ordinality), '[]'::jsonb)
  FROM (
    SELECT row_item.ordinality, COALESCE((
      SELECT jsonb_agg(
        CASE WHEN jsonb_typeof(cell_item.value) = 'string'
          THEN cell_item.value ELSE to_jsonb(''::text) END
        ORDER BY cell_item.ordinality
      )
      FROM jsonb_array_elements(row_item.value)
        WITH ORDINALITY AS cell_item(value, ordinality)
    ), '[]'::jsonb) AS cells
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_rows) = 'array' THEN p_rows ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS row_item(value, ordinality)
    WHERE jsonb_typeof(row_item.value) = 'array'
  ) row_data
$function$;

CREATE OR REPLACE FUNCTION public.course_review_safe_slider_slides(p_slides jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'id', public.course_review_json_string(slide_item.value->'id'),
      'title', public.course_review_json_string(slide_item.value->'title'),
      'content', public.course_review_json_string(slide_item.value->'content'),
      'imageUrl', public.course_review_json_string(slide_item.value->'imageUrl')
    )) ORDER BY slide_item.ordinality
  ), '[]'::jsonb)
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_slides) = 'array' THEN p_slides ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS slide_item(value, ordinality)
  WHERE jsonb_typeof(slide_item.value) = 'object'
$function$;

REVOKE ALL ON FUNCTION public.course_review_json_string(jsonb),
  public.course_review_json_boolean(jsonb),
  public.course_review_json_number(jsonb),
  public.course_review_safe_table_rows(jsonb),
  public.course_review_safe_slider_slides(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.course_review_json_string(jsonb),
  public.course_review_json_boolean(jsonb),
  public.course_review_json_number(jsonb),
  public.course_review_safe_table_rows(jsonb),
  public.course_review_safe_slider_slides(jsonb)
  TO service_role;

-- Course block JSON can contain editor mini-quizzes whose options carry an
-- `isCorrect` flag. The reviewer receives the question and option text but no
-- flag, explanation or pending editor action. Plain text/Markdown is unchanged.
CREATE OR REPLACE FUNCTION public.course_review_safe_lesson_content(p_content text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_blocks jsonb;
  v_result jsonb;
  v_normalized text;
  v_ecmascript_trim_chars constant text :=
    E' \t\n\r\f'
    || chr(11) || chr(160) || chr(5760)
    || chr(8192) || chr(8193) || chr(8194) || chr(8195)
    || chr(8196) || chr(8197) || chr(8198) || chr(8199)
    || chr(8200) || chr(8201) || chr(8202)
    || chr(8232) || chr(8233) || chr(8239)
    || chr(8287) || chr(12288) || chr(65279);
BEGIN
  IF p_content IS NULL THEN
    RETURN p_content;
  END IF;

  -- Match the ECMAScript WhiteSpace and LineTerminator set used by
  -- JavaScript String.trim(), including NBSP, Unicode spaces and BOM.
  v_normalized := ltrim(p_content, v_ecmascript_trim_chars);
  IF v_normalized = '' THEN
    RETURN p_content;
  END IF;

  -- A JSON object is not a supported lesson document. Do not render it as
  -- plain text because an unsupported object could carry an answer key.
  IF left(v_normalized, 1) = '{' THEN
    BEGIN
      PERFORM v_normalized::jsonb;
      RETURN NULL;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  END IF;

  IF left(v_normalized, 1) <> '[' THEN
    RETURN p_content;
  END IF;

  BEGIN
    v_blocks := v_normalized::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF jsonb_typeof(v_blocks) <> 'array' THEN
    RETURN NULL;
  END IF;

  -- Rebuild every supported content block from an explicit field allowlist.
  -- This is intentionally stricter than subtracting known secret fields:
  -- newly added editor-only keys cannot cross this reviewer boundary by
  -- accident. Nested quiz options and slider slides are rebuilt as well.
  SELECT COALESCE(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'id', public.course_review_json_string(block_row.value->'id'),
      'type', public.course_review_json_string(block_row.value->'type'),
      'content', public.course_review_json_string(block_row.value->'content'),
      'accordionTitle', public.course_review_json_string(block_row.value->'accordionTitle'),
      'accordionOpen', public.course_review_json_boolean(block_row.value->'accordionOpen'),
      'calloutTitle', public.course_review_json_string(block_row.value->'calloutTitle'),
      'quizQuestion', CASE WHEN block_row.value->>'type' = 'quiz'
        THEN public.course_review_json_string(block_row.value->'quizQuestion') ELSE NULL END,
      'quizOptions', CASE WHEN block_row.value->>'type' = 'quiz' THEN COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object('text', option_row.value #>> '{}')
          ORDER BY option_row.ordinality
        )
        FROM jsonb_array_elements(
          public.course_review_safe_options(block_row.value->'quizOptions')
        ) WITH ORDINALITY AS option_row(value, ordinality)
      ), '[]'::jsonb) ELSE NULL END,
      'imageSrc', public.course_review_json_string(block_row.value->'imageSrc'),
      'imageAlt', public.course_review_json_string(block_row.value->'imageAlt'),
      'videoUrl', public.course_review_json_string(block_row.value->'videoUrl'),
      'audioUrl', public.course_review_json_string(block_row.value->'audioUrl'),
      'documentUrl', public.course_review_json_string(block_row.value->'documentUrl'),
      'documentName', public.course_review_json_string(block_row.value->'documentName'),
      'sliderSlides', CASE WHEN block_row.value->>'type' = 'slider'
        THEN public.course_review_safe_slider_slides(block_row.value->'sliderSlides') ELSE NULL END,
      'tableRows', CASE WHEN block_row.value->>'type' = 'table'
        THEN public.course_review_safe_table_rows(block_row.value->'tableRows') ELSE NULL END,
      'tableHasHeader', public.course_review_json_boolean(block_row.value->'tableHasHeader'),
      'tableCellsHtml', public.course_review_json_boolean(block_row.value->'tableCellsHtml'),
      'listStart', public.course_review_json_number(block_row.value->'listStart'),
      'buttonLabel', public.course_review_json_string(block_row.value->'buttonLabel'),
      'buttonUrl', public.course_review_json_string(block_row.value->'buttonUrl'),
      'buttonVariant', public.course_review_json_string(block_row.value->'buttonVariant'),
      'buttonAlign', public.course_review_json_string(block_row.value->'buttonAlign'),
      'embedUrl', public.course_review_json_string(block_row.value->'embedUrl'),
      'embedHeight', public.course_review_json_number(block_row.value->'embedHeight'),
      'codeLanguage', public.course_review_json_string(block_row.value->'codeLanguage'),
      'formulaDisplayMode', public.course_review_json_string(block_row.value->'formulaDisplayMode'),
      'textAlign', public.course_review_json_string(block_row.value->'textAlign'),
      'bgColor', public.course_review_json_string(block_row.value->'bgColor'),
      'textSize', public.course_review_json_string(block_row.value->'textSize'),
      'bold', public.course_review_json_boolean(block_row.value->'bold'),
      'italic', public.course_review_json_boolean(block_row.value->'italic'),
      'strikethrough', public.course_review_json_boolean(block_row.value->'strikethrough'),
      'underline', public.course_review_json_boolean(block_row.value->'underline'),
      'uppercase', public.course_review_json_boolean(block_row.value->'uppercase'),
      'textColor', public.course_review_json_string(block_row.value->'textColor'),
      'lineHeight', public.course_review_json_string(block_row.value->'lineHeight'),
      'fontFamily', public.course_review_json_string(block_row.value->'fontFamily'),
      'borderStyle', public.course_review_json_string(block_row.value->'borderStyle'),
      'borderRadius', public.course_review_json_string(block_row.value->'borderRadius')
    )) ORDER BY block_row.ordinality
  ), '[]'::jsonb)
  INTO v_result
  FROM jsonb_array_elements(v_blocks) WITH ORDINALITY AS block_row(value, ordinality);

  RETURN v_result::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.course_review_safe_lesson_content(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.course_review_safe_lesson_content(text) TO service_role;

COMMENT ON FUNCTION public.course_review_safe_lesson_content(text) IS
  'Removes embedded mini-quiz answer flags and explanations before reviewer delivery.';

CREATE OR REPLACE FUNCTION public.get_course_review_snapshot(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.can_review_course(p_course_id) THEN
    RAISE EXCEPTION 'Course review is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'course', jsonb_build_object(
      'id', course_row.id,
      'title', course_row.title,
      'description', course_row.description,
      'duration', course_row.duration,
      'is_published', course_row.is_published,
      'cover_image_url', course_row.cover_image_url
    ),
    'grant_expires_at', grant_row.expires_at,
    'counts', jsonb_build_object(
      'modules', (SELECT count(*) FROM public.course_modules m WHERE m.course_id = course_row.id),
      'elements', (SELECT count(*) FROM public.lessons l WHERE l.course_id = course_row.id),
      'homework', (SELECT count(*) FROM public.lessons l WHERE l.course_id = course_row.id AND l.type = 'homework'),
      'tests', (SELECT count(*) FROM public.lessons l WHERE l.course_id = course_row.id AND l.type = 'test'),
      'questions', (
        SELECT count(*)
        FROM public.test_questions q
        JOIN public.lessons l ON l.id = q.lesson_id
        WHERE l.course_id = course_row.id
      )
    ),
    'modules', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', module_row.id,
          'title', module_row.title,
          'order_index', module_row.order_index
        )
        ORDER BY module_row.order_index, module_row.id
      )
      FROM public.course_modules module_row
      WHERE module_row.course_id = course_row.id
    ), '[]'::jsonb),
    'lessons', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', lesson_row.id,
          'module_id', lesson_row.module_id,
          'title', lesson_row.title,
          'type', lesson_row.type,
          'order_index', lesson_row.order_index,
          'is_locked', lesson_row.is_locked,
          'test_passing_score', lesson_row.test_passing_score,
          'test_questions_count', (
            SELECT count(*)
            FROM public.test_questions question_row
            WHERE question_row.lesson_id = lesson_row.id
          ),
          'module_number', CASE
            WHEN lesson_row.metadata->>'module_number' ~ '^[0-9]+$'
              THEN (lesson_row.metadata->>'module_number')::integer
            ELSE NULL
          END,
          'final_assessment', CASE
            WHEN lower(lesson_row.metadata->>'final_assessment') IN ('true', 'false')
              THEN (lesson_row.metadata->>'final_assessment')::boolean
            ELSE NULL
          END,
          'source_article_id', lesson_row.metadata->>'source_article_id'
        )
        ORDER BY
          (lesson_module.id IS NULL),
          lesson_module.order_index,
          lesson_module.id,
          lesson_row.order_index,
          lesson_row.id
      )
      FROM public.lessons lesson_row
      LEFT JOIN public.course_modules lesson_module
        ON lesson_module.id = lesson_row.module_id
       AND lesson_module.course_id = lesson_row.course_id
      WHERE lesson_row.course_id = course_row.id
    ), '[]'::jsonb),
    'library', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', course_document.id,
          'module_id', course_document.module_id,
          'name', course_document.name,
          'type', course_document.type,
          'description', course_document.description,
          'sort_order', course_document.sort_order,
          'visible_to_students', course_document.visible_to_students,
          'allow_download', course_document.allow_download,
          'library_category', course_document.library_category,
          'source_name', library_document.source_name,
          'resource_url', CASE
            WHEN course_document.library_document_id IS NULL THEN course_document.file_url
            ELSE library_document.external_url
          END,
          'storage_path', library_document.storage_path,
          'original_filename', library_document.original_filename,
          'mime_type', library_document.mime_type,
          'edition_label', library_document.edition_label,
          'last_checked_at', library_document.last_checked_at,
          'usage_basis', library_document.usage_basis,
          'library_status', library_document.library_status
        )
        ORDER BY course_document.sort_order, course_document.created_at, course_document.id
      )
      FROM public.course_documents course_document
      LEFT JOIN public.library_documents library_document
        ON library_document.id = course_document.library_document_id
      WHERE course_document.course_id = course_row.id
        AND course_document.visible_to_students IS TRUE
        AND (
          course_document.library_document_id IS NULL
          OR library_document.library_status = 'active'
        )
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.courses course_row
  JOIN public.course_review_grants grant_row
    ON grant_row.course_id = course_row.id
   AND grant_row.user_id = auth.uid()
   AND grant_row.revoked_at IS NULL
   AND grant_row.expires_at > now()
  WHERE course_row.id = p_course_id
    AND course_row.is_published IS FALSE;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Course review is unavailable' USING ERRCODE = '42501';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_course_review_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_review_snapshot(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_course_review_snapshot(uuid) IS
  'Allowlisted draft course shell for an exact active reviewer grant; returns no lesson body or answer key.';

CREATE OR REPLACE FUNCTION public.get_course_review_lesson(
  p_course_id uuid,
  p_lesson_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_lesson public.lessons%ROWTYPE;
  v_result jsonb;
BEGIN
  IF NOT public.can_review_course(p_course_id) THEN
    RAISE EXCEPTION 'Course review is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT lesson_row.*
  INTO v_lesson
  FROM public.lessons lesson_row
  WHERE lesson_row.id = p_lesson_id
    AND lesson_row.course_id = p_course_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course review is unavailable' USING ERRCODE = '42501';
  END IF;

  v_result := jsonb_build_object(
    'lesson', jsonb_build_object(
      'id', v_lesson.id,
      'course_id', v_lesson.course_id,
      'module_id', v_lesson.module_id,
      'title', v_lesson.title,
      'type', v_lesson.type,
      'content', public.course_review_safe_lesson_content(v_lesson.content),
      'order_index', v_lesson.order_index,
      'is_locked', v_lesson.is_locked,
      'test_passing_score', v_lesson.test_passing_score,
      'test_questions_count', (
        SELECT count(*) FROM public.test_questions q WHERE q.lesson_id = v_lesson.id
      ),
      'module_number', CASE
        WHEN v_lesson.metadata->>'module_number' ~ '^[0-9]+$'
          THEN (v_lesson.metadata->>'module_number')::integer
        ELSE NULL
      END,
      'final_assessment', CASE
        WHEN lower(v_lesson.metadata->>'final_assessment') IN ('true', 'false')
          THEN (v_lesson.metadata->>'final_assessment')::boolean
        ELSE NULL
      END,
      'source_article_id', v_lesson.metadata->>'source_article_id'
    ),
    'attachments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', attachment.id,
          'name', attachment.name,
          'file_url', attachment.file_url,
          'file_type', attachment.file_type,
          'file_size', attachment.file_size,
          'category', attachment.category,
          'order_index', attachment.order_index
        )
        ORDER BY attachment.order_index, attachment.id
      )
      FROM public.lesson_attachments attachment
      WHERE attachment.lesson_id = v_lesson.id
    ), '[]'::jsonb),
    'questions', CASE WHEN v_lesson.type = 'test' THEN COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', question_row.id,
          'question', question_row.question,
          'options', public.course_review_safe_options(question_row.options),
          'order_index', question_row.order_index,
          'image_url', question_row.image_url
        )
        ORDER BY question_row.order_index, question_row.id
      )
      FROM public.test_questions question_row
      WHERE question_row.lesson_id = v_lesson.id
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_course_review_lesson(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_review_lesson(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_course_review_lesson(uuid, uuid) IS
  'Allowlisted read-only lesson payload. Test options are strings; correct_answer and explanation are never returned.';

CREATE OR REPLACE FUNCTION public.admin_upsert_course_review_grant(
  p_course_id uuid,
  p_user_identifier text,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_identifier text := lower(btrim(COALESCE(p_user_identifier, '')));
  v_user_id uuid;
  v_candidate_count integer;
  v_is_published boolean;
  v_row public.course_review_grants%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role('admin'::public.app_role, v_actor) THEN
    RAISE EXCEPTION 'Course review administration is unavailable' USING ERRCODE = '42501';
  END IF;

  IF v_identifier = '' THEN
    RAISE EXCEPTION 'Reviewer account identifier is required' USING ERRCODE = '22023';
  END IF;

  IF p_expires_at IS NULL
     OR p_expires_at <= now()
     OR p_expires_at > now() + interval '30 days'
  THEN
    RAISE EXCEPTION 'Reviewer expiry must be within the next 30 days' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), (array_agg(candidate.user_id ORDER BY candidate.user_id))[1]
  INTO v_candidate_count, v_user_id
  FROM (
    SELECT DISTINCT auth_user.id AS user_id
    FROM auth.users auth_user
    LEFT JOIN public.profiles profile_row ON profile_row.user_id = auth_user.id
    WHERE auth_user.deleted_at IS NULL
      AND (
        lower(COALESCE(auth_user.email, '')) = v_identifier
        OR lower(COALESCE(profile_row.email, '')) = v_identifier
        OR lower(COALESCE(profile_row.login, '')) = v_identifier
      )
  ) candidate;

  IF v_candidate_count <> 1 OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Reviewer account identifier did not resolve uniquely'
      USING ERRCODE = '22023';
  END IF;

  SELECT course_row.is_published
  INTO v_is_published
  FROM public.courses course_row
  WHERE course_row.id = p_course_id;

  IF NOT FOUND OR v_is_published IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'Course is unavailable for draft review' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.course_review_grants (
    course_id, user_id, expires_at, created_by, updated_by
  ) VALUES (
    p_course_id, v_user_id, p_expires_at, v_actor, v_actor
  )
  ON CONFLICT (course_id, user_id) DO UPDATE
  SET expires_at = EXCLUDED.expires_at,
      revoked_at = NULL,
      revoked_by = NULL,
      updated_at = now(),
      updated_by = v_actor
  WHERE course_review_grants.expires_at IS DISTINCT FROM EXCLUDED.expires_at
     OR course_review_grants.revoked_at IS NOT NULL;

  SELECT grant_row.*
  INTO v_row
  FROM public.course_review_grants grant_row
  WHERE grant_row.course_id = p_course_id
    AND grant_row.user_id = v_user_id;

  RETURN jsonb_build_object(
    'course_id', v_row.course_id,
    'user_id', v_row.user_id,
    'expires_at', v_row.expires_at,
    'revoked_at', v_row.revoked_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_upsert_course_review_grant(uuid, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_course_review_grant(uuid, text, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.admin_upsert_course_review_grant(uuid, text, timestamptz) IS
  'Admin-only idempotent grant action. Resolves exactly one existing auth user by profile login/email or auth email; never requires a guessed uid.';

CREATE OR REPLACE FUNCTION public.admin_revoke_course_review_grant(
  p_course_id uuid,
  p_user_identifier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_identifier text := lower(btrim(COALESCE(p_user_identifier, '')));
  v_user_id uuid;
  v_candidate_count integer;
  v_row public.course_review_grants%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role('admin'::public.app_role, v_actor) THEN
    RAISE EXCEPTION 'Course review administration is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT count(*), (array_agg(candidate.user_id ORDER BY candidate.user_id))[1]
  INTO v_candidate_count, v_user_id
  FROM (
    SELECT DISTINCT auth_user.id AS user_id
    FROM auth.users auth_user
    LEFT JOIN public.profiles profile_row ON profile_row.user_id = auth_user.id
    WHERE auth_user.deleted_at IS NULL
      AND (
        lower(COALESCE(auth_user.email, '')) = v_identifier
        OR lower(COALESCE(profile_row.email, '')) = v_identifier
        OR lower(COALESCE(profile_row.login, '')) = v_identifier
      )
  ) candidate;

  IF v_candidate_count <> 1 OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Reviewer account identifier did not resolve uniquely'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.course_review_grants grant_row
  SET revoked_at = COALESCE(grant_row.revoked_at, now()),
      revoked_by = COALESCE(grant_row.revoked_by, v_actor),
      updated_at = CASE WHEN grant_row.revoked_at IS NULL THEN now() ELSE grant_row.updated_at END,
      updated_by = CASE WHEN grant_row.revoked_at IS NULL THEN v_actor ELSE grant_row.updated_by END
  WHERE grant_row.course_id = p_course_id
    AND grant_row.user_id = v_user_id
  RETURNING grant_row.* INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course review grant was not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'course_id', v_row.course_id,
    'user_id', v_row.user_id,
    'expires_at', v_row.expires_at,
    'revoked_at', v_row.revoked_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_revoke_course_review_grant(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_course_review_grant(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.admin_revoke_course_review_grant(uuid, text) IS
  'Admin-only idempotent revocation for an exact course and uniquely resolved existing user.';
