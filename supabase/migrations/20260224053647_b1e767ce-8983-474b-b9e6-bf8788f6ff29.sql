
CREATE OR REPLACE FUNCTION public.increment_lesson_time(
  p_lesson_id uuid,
  p_user_id uuid,
  p_seconds int
) RETURNS void AS $$
BEGIN
  IF p_seconds <= 0 THEN RETURN; END IF;
  
  INSERT INTO public.lesson_progress (lesson_id, user_id, time_spent, completed)
  VALUES (p_lesson_id, p_user_id, p_seconds, false)
  ON CONFLICT (lesson_id, user_id)
  DO UPDATE SET time_spent = COALESCE(lesson_progress.time_spent, 0) + p_seconds;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE OR REPLACE FUNCTION public.recalc_enrollment_time(
  p_enrollment_id uuid
) RETURNS void AS $$
BEGIN
  UPDATE public.enrollments e
  SET time_spent = COALESCE((
    SELECT SUM(lp.time_spent)
    FROM public.lesson_progress lp
    JOIN public.lessons l ON l.id = lp.lesson_id
    WHERE l.course_id = e.course_id AND lp.user_id = e.user_id
  ), 0)
  WHERE e.id = p_enrollment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
