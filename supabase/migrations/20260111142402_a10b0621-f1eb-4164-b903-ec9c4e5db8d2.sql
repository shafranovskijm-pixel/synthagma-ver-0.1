-- Add login column to profiles for username-based authentication
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS login TEXT UNIQUE;

-- Create index for faster login lookups
CREATE INDEX IF NOT EXISTS idx_profiles_login ON public.profiles(login) WHERE login IS NOT NULL;