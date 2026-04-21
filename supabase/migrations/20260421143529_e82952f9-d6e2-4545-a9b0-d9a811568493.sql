UPDATE public.webinars
SET created_by = (
  SELECT user_id FROM public.user_roles WHERE role = 'admin' LIMIT 1
)
WHERE id = 'b6f98111-5047-4637-8d50-ac5064bde1a1';