
BEGIN;

DROP POLICY IF EXISTS "Org or admin can view smtp"   ON public.org_smtp_settings;
DROP POLICY IF EXISTS "Org or admin can insert smtp" ON public.org_smtp_settings;
DROP POLICY IF EXISTS "Org or admin can update smtp" ON public.org_smtp_settings;
DROP POLICY IF EXISTS "Org or admin can delete smtp" ON public.org_smtp_settings;

CREATE POLICY "smtp_select_sales_read" ON public.org_smtp_settings
  FOR SELECT TO authenticated
  USING (public.can_access_organization(organization_id, 'sales.read'));

CREATE POLICY "smtp_insert_sales_write" ON public.org_smtp_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_organization(organization_id, 'sales.write'));

CREATE POLICY "smtp_update_sales_write" ON public.org_smtp_settings
  FOR UPDATE TO authenticated
  USING      (public.can_access_organization(organization_id, 'sales.write'))
  WITH CHECK (public.can_access_organization(organization_id, 'sales.write'));

CREATE POLICY "smtp_delete_sales_write" ON public.org_smtp_settings
  FOR DELETE TO authenticated
  USING (public.can_access_organization(organization_id, 'sales.write'));

DROP POLICY IF EXISTS "Campaigns visibility" ON public.email_campaigns;
DROP POLICY IF EXISTS "Campaigns insert"     ON public.email_campaigns;
DROP POLICY IF EXISTS "Campaigns update"     ON public.email_campaigns;
DROP POLICY IF EXISTS "Campaigns delete"     ON public.email_campaigns;

CREATE POLICY "campaigns_select" ON public.email_campaigns
  FOR SELECT TO authenticated
  USING (
    (scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
    OR (scope = 'org'   AND public.can_access_organization(organization_id, 'sales.read'))
  );

CREATE POLICY "campaigns_insert" ON public.email_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (
    (scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
    OR (scope = 'org'   AND public.can_access_organization(organization_id, 'sales.write'))
  );

CREATE POLICY "campaigns_update" ON public.email_campaigns
  FOR UPDATE TO authenticated
  USING (
    (scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
    OR (scope = 'org'   AND public.can_access_organization(organization_id, 'sales.write'))
  )
  WITH CHECK (
    (scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
    OR (scope = 'org'   AND public.can_access_organization(organization_id, 'sales.write'))
  );

CREATE POLICY "campaigns_delete" ON public.email_campaigns
  FOR DELETE TO authenticated
  USING (
    (scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
    OR (scope = 'org'   AND public.can_access_organization(organization_id, 'sales.write'))
  );

DROP POLICY IF EXISTS "Recipients visibility" ON public.email_campaign_recipients;
DROP POLICY IF EXISTS "Recipients insert"     ON public.email_campaign_recipients;
DROP POLICY IF EXISTS "Recipients update"     ON public.email_campaign_recipients;
DROP POLICY IF EXISTS "Recipients delete"     ON public.email_campaign_recipients;

CREATE POLICY "recipients_select" ON public.email_campaign_recipients
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_recipients.campaign_id
      AND (
        (c.scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
        OR (c.scope = 'org'   AND public.can_access_organization(c.organization_id, 'sales.read'))
      )
  ));

CREATE POLICY "recipients_insert" ON public.email_campaign_recipients
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_recipients.campaign_id
      AND (
        (c.scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
        OR (c.scope = 'org'   AND public.can_access_organization(c.organization_id, 'sales.write'))
      )
  ));

CREATE POLICY "recipients_update" ON public.email_campaign_recipients
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_recipients.campaign_id
      AND (
        (c.scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
        OR (c.scope = 'org'   AND public.can_access_organization(c.organization_id, 'sales.write'))
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_recipients.campaign_id
      AND (
        (c.scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
        OR (c.scope = 'org'   AND public.can_access_organization(c.organization_id, 'sales.write'))
      )
  ));

CREATE POLICY "recipients_delete" ON public.email_campaign_recipients
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_recipients.campaign_id
      AND (
        (c.scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
        OR (c.scope = 'org'   AND public.can_access_organization(c.organization_id, 'sales.write'))
      )
  ));

DROP POLICY IF EXISTS "Clicks: visible to campaign owner" ON public.email_campaign_clicks;

CREATE POLICY "clicks_select" ON public.email_campaign_clicks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_clicks.campaign_id
      AND (
        (c.scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
        OR (c.scope = 'org'   AND public.can_access_organization(c.organization_id, 'sales.read'))
      )
  ));

REVOKE ALL ON FUNCTION public.get_decrypted_org_smtp(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_decrypted_org_smtp(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_decrypted_org_smtp(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_decrypted_org_smtp(uuid) TO service_role;

COMMIT;
