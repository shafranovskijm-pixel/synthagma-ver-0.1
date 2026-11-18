-- List presentation metadata without transferring inline images or lesson bodies.
-- SECURITY INVOKER retains exactly the caller's table grants and row policies.
CREATE OR REPLACE FUNCTION public.list_slider_lesson_metadata()
RETURNS TABLE (
  lesson_id uuid,
  lesson_title text,
  course_title text,
  slides_count integer,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  candidate record;
  parsed json;
  slides json;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Preserve the existing latest-200 candidate window before invalid/empty
  -- presentations are skipped. Both tables remain subject to caller RLS.
  FOR candidate IN
    SELECT l.id, l.title, l.content, l.created_at, c.title AS parent_title
    FROM public.lessons l
    LEFT JOIN public.courses c ON c.id = l.course_id
    WHERE l.type = 'slider' AND l.content IS NOT NULL
    ORDER BY l.created_at DESC
    LIMIT 200
  LOOP
    BEGIN
      -- Validate the original JSON first; never repair malformed stored input.
      parsed := candidate.content::json;
      BEGIN
        slides := CASE WHEN json_typeof(parsed) = 'array' THEN parsed
                       WHEN json_typeof(parsed) = 'object' THEN parsed->'slides'
                       ELSE NULL END;
        IF json_typeof(slides) IS DISTINCT FROM 'array' THEN CONTINUE; END IF;
        slides_count := json_array_length(slides);
      EXCEPTION WHEN untranslatable_character OR invalid_text_representation THEN
        -- JSON.parse accepts escaped NUL/unpaired UTF-16 surrogates that
        -- PostgreSQL cannot de-escape. Replace those escapes in a temporary
        -- metadata-only copy. JSON structure and the ASCII "slides" key stay
        -- intact; neither stored content nor selected original bytes change.
        parsed := regexp_replace(
          candidate.content,
          $unicode$\\u(0000|[dD][89aAbBcCdDeEfF][0-9a-fA-F]{2})$unicode$,
          $replacement$\\uFFFD$replacement$,
          'g'
        )::json;
        slides := CASE WHEN json_typeof(parsed) = 'array' THEN parsed
                       WHEN json_typeof(parsed) = 'object' THEN parsed->'slides'
                       ELSE NULL END;
        IF json_typeof(slides) IS DISTINCT FROM 'array' THEN CONTINUE; END IF;
        slides_count := json_array_length(slides);
      END;
      IF slides_count = 0 THEN CONTINUE; END IF;
    EXCEPTION WHEN invalid_text_representation OR untranslatable_character OR numeric_value_out_of_range THEN
      CONTINUE;
    END;

    lesson_id := candidate.id;
    lesson_title := candidate.title;
    course_title := COALESCE(candidate.parent_title, '');
    created_at := candidate.created_at;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_slider_lesson_metadata() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_slider_lesson_metadata() TO authenticated;

COMMENT ON FUNCTION public.list_slider_lesson_metadata() IS
  'Read-only presentation list: title, course, date and slide count; no lesson content. Caller grants/RLS remain in force.';
