
-- Reset password for organization user to sigma2024
UPDATE auth.users 
SET encrypted_password = crypt('sigma2024', gen_salt('bf'))
WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
