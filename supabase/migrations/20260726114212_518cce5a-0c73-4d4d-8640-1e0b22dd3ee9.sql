CREATE OR REPLACE FUNCTION public._admin_set_lesson_content(_lesson_id uuid, _content text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lessons SET content = _content WHERE id = _lesson_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public._admin_set_lesson_content(uuid, text) TO authenticated, service_role, anon;