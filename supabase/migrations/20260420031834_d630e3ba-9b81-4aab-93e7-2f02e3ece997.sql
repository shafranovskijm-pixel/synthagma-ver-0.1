-- 1. Функция автоматического пересчёта прогресса по lesson_progress
CREATE OR REPLACE FUNCTION public.recalc_enrollment_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
  v_user_id uuid;
  v_total int;
  v_done int;
  v_progress int;
BEGIN
  -- Определяем урок (для DELETE берём OLD)
  IF TG_OP = 'DELETE' THEN
    SELECT course_id INTO v_course_id FROM lessons WHERE id = OLD.lesson_id;
    v_user_id := OLD.user_id;
  ELSE
    SELECT course_id INTO v_course_id FROM lessons WHERE id = NEW.lesson_id;
    v_user_id := NEW.user_id;
  END IF;

  IF v_course_id IS NULL OR v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Считаем общее количество уроков и пройденных
  SELECT COUNT(*) INTO v_total FROM lessons WHERE course_id = v_course_id;
  IF v_total = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*) INTO v_done
  FROM lesson_progress lp
  JOIN lessons l ON l.id = lp.lesson_id
  WHERE l.course_id = v_course_id
    AND lp.user_id = v_user_id
    AND lp.completed = true;

  v_progress := LEAST(100, GREATEST(0, (v_done * 100) / v_total));

  -- Обновляем enrollment, если он существует и прогресс изменился в большую сторону
  -- (не уменьшаем прогресс автоматически, чтобы не откатывать ручные правки)
  UPDATE enrollments
  SET progress = v_progress
  WHERE user_id = v_user_id
    AND course_id = v_course_id
    AND progress < v_progress;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2. Триггер на lesson_progress
DROP TRIGGER IF EXISTS trg_recalc_enrollment_progress ON public.lesson_progress;
CREATE TRIGGER trg_recalc_enrollment_progress
AFTER INSERT OR UPDATE OR DELETE ON public.lesson_progress
FOR EACH ROW
EXECUTE FUNCTION public.recalc_enrollment_progress();

-- 3. Расширяем auto_complete_enrollment, чтобы работал и на INSERT
DROP TRIGGER IF EXISTS trigger_auto_complete_enrollment ON public.enrollments;
CREATE TRIGGER trigger_auto_complete_enrollment
BEFORE INSERT OR UPDATE ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.auto_complete_enrollment();

-- 4. Бэкфилл: пересчёт прогресса для всех активных зачислений
WITH calc AS (
  SELECT
    e.id AS enrollment_id,
    e.progress AS old_progress,
    CASE WHEN COUNT(l.id) = 0 THEN 0
         ELSE LEAST(100, (COUNT(lp.id) FILTER (WHERE lp.completed = true) * 100) / COUNT(l.id))
    END AS new_progress
  FROM enrollments e
  JOIN lessons l ON l.course_id = e.course_id
  LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = e.user_id
  WHERE e.status != 'completed'
  GROUP BY e.id, e.progress
)
UPDATE enrollments e
SET progress = calc.new_progress
FROM calc
WHERE e.id = calc.enrollment_id
  AND calc.new_progress > calc.old_progress;