
-- Create auth user for organization ООО "СИГМА"
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  raw_app_meta_data,
  raw_user_meta_data
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'authenticated',
  'authenticated',
  '24@24zxc.ru',
  crypt('sigma2024', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}'
);

-- Create identity entry
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  created_at,
  updated_at,
  last_sign_in_at
)
VALUES (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  '{"sub":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","email":"24@24zxc.ru","email_verified":true}',
  'email',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  NOW(),
  NOW(),
  NOW()
);
