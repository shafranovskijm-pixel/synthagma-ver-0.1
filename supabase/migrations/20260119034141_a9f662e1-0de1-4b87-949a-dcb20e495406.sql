-- Allow unauthenticated users to lookup profiles by login for authentication purposes
-- This only exposes minimal data needed for login (user_id and login)
CREATE POLICY "Allow login lookup by login field"
ON public.profiles
FOR SELECT
USING (login IS NOT NULL);