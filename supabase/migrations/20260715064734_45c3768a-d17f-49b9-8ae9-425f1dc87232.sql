
UPDATE public.user_roles ur
SET role = 'organization'
WHERE ur.role = 'student'
  AND EXISTS (SELECT 1 FROM public.org_staff o WHERE o.user_id = ur.user_id);
