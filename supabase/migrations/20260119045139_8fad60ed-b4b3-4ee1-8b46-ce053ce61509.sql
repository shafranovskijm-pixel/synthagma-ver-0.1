
-- Reset password for student_20314 to lEQAHyHuBB
UPDATE auth.users 
SET encrypted_password = crypt('lEQAHyHuBB', gen_salt('bf'))
WHERE id = '5a5fb658-6fdd-4c0f-b696-4a7d2c2b4053';
