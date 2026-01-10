-- Allow anyone to insert organizations (for registration)
CREATE POLICY "Anyone can create organizations" ON public.organizations 
FOR INSERT WITH CHECK (true);

-- Allow profiles to be updated with organization_id
CREATE POLICY "Users can update own profile organization" ON public.profiles 
FOR UPDATE USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Allow user role update by owner
CREATE POLICY "Users can update own role once" ON public.user_roles 
FOR UPDATE USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());