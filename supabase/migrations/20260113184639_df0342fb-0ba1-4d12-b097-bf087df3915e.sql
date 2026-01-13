-- Allow unauthenticated users to lookup profiles by login for authentication purposes
CREATE POLICY "Anyone can lookup profiles by login"
ON public.profiles
FOR SELECT
USING (login IS NOT NULL);
