-- Update role from organization to admin for 24@24zxc.ru
UPDATE public.user_roles 
SET role = 'admin' 
WHERE user_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';