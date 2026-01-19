
-- Fix existing students' auth emails to match login@student.local pattern
-- This ensures login-based authentication works correctly

-- Student 1: student_95222
UPDATE auth.users 
SET email = 'student_95222@student.local'
WHERE id = '9896edd0-e3e7-4263-8899-fa372c497221';

-- Student 2: student_20314
UPDATE auth.users 
SET email = 'student_20314@student.local'
WHERE id = '5a5fb658-6fdd-4c0f-b696-4a7d2c2b4053';

-- Student 3: student_23330
UPDATE auth.users 
SET email = 'student_23330@student.local'
WHERE id = 'f001d2f4-5787-45a5-b9eb-296709e14711';

-- Student 4: student_87317
UPDATE auth.users 
SET email = 'student_87317@student.local'
WHERE id = '61846cd3-c731-4a39-80e2-91b60f6db0d2';

-- Also update auth.identities table
UPDATE auth.identities
SET 
  identity_data = jsonb_set(identity_data, '{email}', '"student_95222@student.local"')
WHERE user_id = '9896edd0-e3e7-4263-8899-fa372c497221' AND provider = 'email';

UPDATE auth.identities
SET 
  identity_data = jsonb_set(identity_data, '{email}', '"student_20314@student.local"')
WHERE user_id = '5a5fb658-6fdd-4c0f-b696-4a7d2c2b4053' AND provider = 'email';

UPDATE auth.identities
SET 
  identity_data = jsonb_set(identity_data, '{email}', '"student_23330@student.local"')
WHERE user_id = 'f001d2f4-5787-45a5-b9eb-296709e14711' AND provider = 'email';

UPDATE auth.identities
SET 
  identity_data = jsonb_set(identity_data, '{email}', '"student_87317@student.local"')
WHERE user_id = '61846cd3-c731-4a39-80e2-91b60f6db0d2' AND provider = 'email';
