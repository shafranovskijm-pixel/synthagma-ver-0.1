
DROP POLICY "System can insert registrations" ON public.referral_registrations;

CREATE POLICY "System insert via security definer" ON public.referral_registrations
  FOR INSERT WITH CHECK (has_role('admin'::app_role, auth.uid()));
