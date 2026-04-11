
CREATE OR REPLACE FUNCTION public.auto_complete_enrollment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.progress >= 100 AND NEW.status != 'completed' THEN
    NEW.status := 'completed';
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

CREATE TRIGGER trigger_auto_complete_enrollment
  BEFORE UPDATE ON public.enrollments
  FOR EACH ROW
  WHEN (NEW.progress >= 100 AND NEW.status != 'completed')
  EXECUTE FUNCTION public.auto_complete_enrollment();
