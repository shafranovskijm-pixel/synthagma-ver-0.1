
-- Sync password for student_23330 with current value from profiles.generated_password
UPDATE auth.users 
SET encrypted_password = crypt('nw9PiFUjuu', gen_salt('bf'))
WHERE id = 'f001d2f4-5787-45a5-b9eb-296709e14711';
