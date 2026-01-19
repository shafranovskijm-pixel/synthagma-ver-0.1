
-- Fix the user record that has NULL in email_change column
UPDATE auth.users 
SET 
  email_change = '',
  email_change_token_new = '',
  email_change_token_current = '',
  email_change_confirm_status = 0,
  phone = '',
  phone_change = '',
  phone_change_token = '',
  phone_confirmed_at = NULL,
  reauthentication_token = '',
  is_sso_user = false,
  deleted_at = NULL
WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
