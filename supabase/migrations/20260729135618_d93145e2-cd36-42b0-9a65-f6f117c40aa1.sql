DROP TRIGGER IF EXISTS trg_org_course_completion_notify ON public.enrollments;

CREATE TRIGGER trg_org_course_completion_notify
AFTER INSERT OR UPDATE ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.create_org_course_completion_notification();