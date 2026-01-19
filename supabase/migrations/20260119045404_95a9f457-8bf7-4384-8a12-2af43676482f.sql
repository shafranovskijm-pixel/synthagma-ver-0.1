
-- Sync all student passwords from profiles.generated_password to auth.users
-- This ensures login credentials work correctly

-- student_93685
UPDATE auth.users SET encrypted_password = crypt('UnmT80MQXJ', gen_salt('bf'))
WHERE id = '8f3c4656-0801-41ee-813f-03f6b546eab9';

-- student_85152
UPDATE auth.users SET encrypted_password = crypt('hvV4S1Tqyc', gen_salt('bf'))
WHERE id = '9e376552-2ab3-434a-81d1-af18360fc45e';

-- student_78301
UPDATE auth.users SET encrypted_password = crypt('lr8OmzDEei', gen_salt('bf'))
WHERE id = '7d046d0b-213a-4ab3-a0c3-c75b9f8975ab';

-- student_68918
UPDATE auth.users SET encrypted_password = crypt('RmAwfXnVmw', gen_salt('bf'))
WHERE id = 'ba933234-20b6-4a52-892e-b85e8fd5df15';

-- student_95222
UPDATE auth.users SET encrypted_password = crypt('a2btT4CZi2', gen_salt('bf'))
WHERE id = '9896edd0-e3e7-4263-8899-fa372c497221';

-- student_76953
UPDATE auth.users SET encrypted_password = crypt('n4tks122', gen_salt('bf'))
WHERE id = '281a6bae-6c06-4ca0-bf1e-4617fd89a95a';

-- student_95671
UPDATE auth.users SET encrypted_password = crypt('svqn7ru0', gen_salt('bf'))
WHERE id = '2ea64eac-7e4a-4208-a1f3-447f5ca7deb5';

-- student_44054
UPDATE auth.users SET encrypted_password = crypt('k4dl0zpa', gen_salt('bf'))
WHERE id = '9b4518e6-fa3c-40d7-b2c4-b399f49c1f04';

-- student_84629
UPDATE auth.users SET encrypted_password = crypt('6yirw3s2', gen_salt('bf'))
WHERE id = '19154739-598f-4240-a380-563ef4d298bf';

-- student_81799
UPDATE auth.users SET encrypted_password = crypt('39bnjfkf', gen_salt('bf'))
WHERE id = 'd171f95b-8218-4a3b-b011-3ebf8ea75f83';

-- student_86120
UPDATE auth.users SET encrypted_password = crypt('wthej5v4', gen_salt('bf'))
WHERE id = '1510eb86-eae0-4be8-a9b0-35d68a59f2bf';

-- student_28523
UPDATE auth.users SET encrypted_password = crypt('av3sx5oc', gen_salt('bf'))
WHERE id = '61c210b5-8c51-452a-991e-829276b23eed';

-- student_92762
UPDATE auth.users SET encrypted_password = crypt('avzobmlt', gen_salt('bf'))
WHERE id = '481bdee3-8ed6-4aa4-9619-678979c7fb31';

-- student_16607
UPDATE auth.users SET encrypted_password = crypt('kt1pfzcv', gen_salt('bf'))
WHERE id = '2b90da44-e4c4-4b7a-844f-0f98e82fbe15';

-- student_42246
UPDATE auth.users SET encrypted_password = crypt('94i6dwyv', gen_salt('bf'))
WHERE id = 'cda88959-aeeb-461f-80aa-b3fc18fad7ee';

-- student_71536
UPDATE auth.users SET encrypted_password = crypt('17urw28b', gen_salt('bf'))
WHERE id = 'c67e17a8-84cf-434b-b2da-f958929ca7bf';

-- student_49235
UPDATE auth.users SET encrypted_password = crypt('9exe0p39', gen_salt('bf'))
WHERE id = '5c164022-dc52-4fe1-a27e-3cf6739b1c3b';

-- student_38601
UPDATE auth.users SET encrypted_password = crypt('edpdhksz', gen_salt('bf'))
WHERE id = 'ecc0b27c-1240-43f2-b9a5-c3ab41727bf0';

-- student_86604
UPDATE auth.users SET encrypted_password = crypt('0wa8830g', gen_salt('bf'))
WHERE id = 'd99dd89a-9cb9-4095-a3cf-fd9d773812f5';

-- student_65320
UPDATE auth.users SET encrypted_password = crypt('pyko9l73', gen_salt('bf'))
WHERE id = '0fd62269-96ec-42b7-ad63-9bb5fd70f84c';

-- student_29331
UPDATE auth.users SET encrypted_password = crypt('aqqvg9ic', gen_salt('bf'))
WHERE id = '152bcc52-f708-4ea1-baa4-d83bb2b6c88f';

-- student_31822
UPDATE auth.users SET encrypted_password = crypt('3dw0zjww', gen_salt('bf'))
WHERE id = 'b573a68b-4e65-4cce-96e0-d1bac8c20925';

-- student_64334
UPDATE auth.users SET encrypted_password = crypt('eb4j5zd8', gen_salt('bf'))
WHERE id = 'ebfae50c-c992-4d1e-9446-0e52f694ad90';

-- student_50422
UPDATE auth.users SET encrypted_password = crypt('84xixa9w', gen_salt('bf'))
WHERE id = 'bc4dae9b-98c1-4913-b5e9-0aaef27947a4';

-- student_20314
UPDATE auth.users SET encrypted_password = crypt('lEQAHyHuBB', gen_salt('bf'))
WHERE id = '5a5fb658-6fdd-4c0f-b696-4a7d2c2b4053';

-- student_23330
UPDATE auth.users SET encrypted_password = crypt('EfQIJwDQHQ', gen_salt('bf'))
WHERE id = 'f001d2f4-5787-45a5-b9eb-296709e14711';

-- student_87317
UPDATE auth.users SET encrypted_password = crypt('J74pxbR2o6', gen_salt('bf'))
WHERE id = '61846cd3-c731-4a39-80e2-91b60f6db0d2';
