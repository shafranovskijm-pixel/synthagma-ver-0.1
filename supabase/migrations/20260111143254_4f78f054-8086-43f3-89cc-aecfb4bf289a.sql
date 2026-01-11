-- Add generated_password column to profiles for login-based students
-- This stores the auto-generated password so organizations can share it with students
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS generated_password TEXT;