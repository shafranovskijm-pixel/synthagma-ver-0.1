
-- Allow 'sales' invitation_type for staff_invitations
ALTER TABLE public.staff_invitations DROP CONSTRAINT IF EXISTS staff_invitations_invitation_type_check;
ALTER TABLE public.staff_invitations ADD CONSTRAINT staff_invitations_invitation_type_check CHECK (invitation_type IN ('admin','organization','company','sales'));

-- RLS: admins manage sales invitations
DROP POLICY IF EXISTS "Admins manage sales invitations" ON public.staff_invitations;
CREATE POLICY "Admins manage sales invitations" ON public.staff_invitations
  FOR ALL TO authenticated
  USING (invitation_type = 'sales' AND public.has_role('admin'::app_role, auth.uid()))
  WITH CHECK (invitation_type = 'sales' AND public.has_role('admin'::app_role, auth.uid()));

-- Ensure sales.test user has a sales_managers record (idempotent)
INSERT INTO public.sales_managers (user_id, full_name, is_active)
SELECT u.id, COALESCE(p.full_name, 'Тестовый менеджер'), true
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE u.email = 'sales.test@sintagma.com.ru'
ON CONFLICT (user_id) DO NOTHING;
