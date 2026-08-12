-- Keep reply monitoring visibility aligned with the existing mailing tables.
-- Organization users who can already see a sender must also be able to see
-- that sender's baseline and campaign replies.

DROP POLICY IF EXISTS mailing_reply_scan_state_select
  ON public.mailing_reply_scan_state;
CREATE POLICY mailing_reply_scan_state_select
ON public.mailing_reply_scan_state
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.mailing_senders s
    WHERE s.id = mailing_reply_scan_state.sender_id
      AND (
        public.has_role('admin'::public.app_role, auth.uid())
        OR s.organization_id = public.current_organization_id()
        OR public.can_access_organization(s.organization_id, 'email.manage')
      )
  )
);

DROP POLICY IF EXISTS mailing_campaign_replies_select
  ON public.mailing_campaign_replies;
CREATE POLICY mailing_campaign_replies_select
ON public.mailing_campaign_replies
FOR SELECT TO authenticated
USING (
  public.has_role('admin'::public.app_role, auth.uid())
  OR organization_id = public.current_organization_id()
  OR public.can_access_organization(organization_id, 'email.manage')
);

DROP POLICY IF EXISTS mailing_campaign_replies_update
  ON public.mailing_campaign_replies;
CREATE POLICY mailing_campaign_replies_update
ON public.mailing_campaign_replies
FOR UPDATE TO authenticated
USING (
  public.has_role('admin'::public.app_role, auth.uid())
  OR organization_id = public.current_organization_id()
  OR public.can_access_organization(organization_id, 'email.manage')
)
WITH CHECK (
  public.has_role('admin'::public.app_role, auth.uid())
  OR organization_id = public.current_organization_id()
  OR public.can_access_organization(organization_id, 'email.manage')
);