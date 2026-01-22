-- Fix students with NULL login but valid auth email in student_XXXXX@student.local format
-- Extract login from auth email and update profiles

UPDATE profiles p
SET login = REPLACE(au.email, '@student.local', '')
FROM auth.users au
JOIN user_roles ur ON ur.user_id = au.id
WHERE p.user_id = au.id
  AND ur.role = 'student'
  AND p.login IS NULL
  AND au.email LIKE '%@student.local';

-- Also fix cases where email field contains auth email instead of real email
UPDATE profiles p
SET email = NULL
FROM auth.users au
WHERE p.user_id = au.id
  AND p.email = au.email
  AND au.email LIKE '%@student.local';