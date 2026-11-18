-- Read-only usage enrichment for the media library. The caller keeps exactly
-- its existing course/lesson RLS visibility; full lesson content is never sent.
CREATE OR REPLACE FUNCTION public.get_media_library_usage_metadata(
  p_organization_id uuid,
  p_file_names text[]
)
RETURNS TABLE (file_name text, is_used boolean, lesson_title text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $media_usage$
DECLARE
  v_names text[];
  v_used boolean[];
  v_titles text[];
  v_lesson record;
  v_content text;
  v_index integer;
  v_remaining integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL
    OR cardinality(p_file_names) > 100
    OR EXISTS (SELECT 1 FROM unnest(p_file_names) AS n(name) WHERE n.name IS NULL OR n.name = '') THEN
    RAISE EXCEPTION 'Invalid media usage metadata request' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT n.name ORDER BY n.name) INTO v_names
  FROM unnest(p_file_names) AS n(name);
  v_remaining := coalesce(cardinality(v_names), 0);
  IF v_remaining = 0 THEN RETURN; END IF;
  v_used := array_fill(false, ARRAY[v_remaining]);
  v_titles := array_fill(NULL::text, ARRAY[v_remaining]);

  -- One visible-lesson scan per batch, rather than one scan per file name.
  -- text concatenation gives this loop its own flat text value, so repeated
  -- strpos calls do not repeatedly detoast a table value containing slides.
  FOR v_lesson IN
    SELECT l.id, l.title, l.content
    FROM public.lessons AS l
    JOIN public.courses AS c ON c.id = l.course_id
    WHERE c.organization_id = p_organization_id AND l.content IS NOT NULL
    ORDER BY l.id
  LOOP
    v_content := v_lesson.content || '';
    FOR v_index IN 1..cardinality(v_names) LOOP
      -- Keep the old literal includes(file.name) match, not SQL wildcards.
      IF NOT v_used[v_index] AND strpos(v_content, v_names[v_index]) > 0 THEN
        v_used[v_index] := true;
        v_titles[v_index] := v_lesson.title;
        v_remaining := v_remaining - 1;
      END IF;
    END LOOP;
    EXIT WHEN v_remaining = 0;
  END LOOP;

  RETURN QUERY SELECT v_names[n.i], v_used[n.i], v_titles[n.i]
  FROM generate_subscripts(v_names, 1) AS n(i)
  ORDER BY n.i;
END;
$media_usage$;

REVOKE ALL ON FUNCTION public.get_media_library_usage_metadata(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_media_library_usage_metadata(uuid, text[]) TO authenticated;

COMMENT ON FUNCTION public.get_media_library_usage_metadata(uuid, text[]) IS
  'Read-only media usage metadata under caller RLS; batch up to 100 names, no lesson bodies or authority escalation.';
