
CREATE OR REPLACE FUNCTION public.sync_training_plan_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE training_plans
    SET status = 'enrolled'
    WHERE user_id = NEW.user_id
      AND course_id = NEW.course_id
      AND status = 'planned';
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
      UPDATE training_plans
      SET status = 'completed'
      WHERE user_id = NEW.user_id
        AND course_id = NEW.course_id
        AND status IN ('planned', 'enrolled');
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_training_plan_on_enroll
AFTER INSERT ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.sync_training_plan_status();

CREATE TRIGGER sync_training_plan_on_complete
AFTER UPDATE OF status ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.sync_training_plan_status();
