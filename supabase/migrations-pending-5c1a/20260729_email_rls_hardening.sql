-- =====================================================================
-- Phase 5C.1.a — Email RLS hardening (PENDING, DO NOT APPLY YET)
-- =====================================================================
-- Safe apply order (future):
--   1) Deploy new Edge Functions run-email-campaign and test-org-smtp
--      from supabase/functions-pending-5c1a/. Old callers keep working
--      because the SQL below is not applied yet.
--   2) Apply this migration. New policies use can_access_organization
--      (sales.read / sales.write) instead of current_organization_id().
--   3) get_decrypted_org_smtp becomes service_role only — Edge Functions
--      already read it via SERVICE_ROLE_KEY, browser callers get 42501.
--
-- Rollback: recreate previous policies (dumped in the audit report of
-- phase 5C.1.a) and re-grant EXECUTE on get_decrypted_org_smtp(uuid) to
-- authenticated/anon. No data changes here.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- org_smtp_settings
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Org or admin can view smtp"   ON public.org_smtp_settings;
DROP POLICY IF EXISTS "Org or admin can insert smtp" ON public.org_smtp_settings;
DROP POLICY IF EXISTS "Org or admin can update smtp" ON public.org_smtp_settings;
DROP POLICY IF EXISTS "Org or admin can delete smtp" ON public.org_smtp_settings;

CREATE POLICY "smtp_select_sales_read"
  ON public.org_smtp_settings
  FOR SELECT TO authenticated
  USING (public.can_access_organization(organization_id, 'sales.read'));

CREATE POLICY "smtp_insert_sales_write"
  ON public.org_smtp_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_organization(organization_id, 'sales.write'));

CREATE POLICY "smtp_update_sales_write"
  ON public.org_smtp_settings
  FOR UPDATE TO authenticated
  USING      (public.can_access_organization(organization_id, 'sales.write'))
  WITH CHECK (public.can_access_organization(organization_id, 'sales.write'));

CREATE POLICY "smtp_delete_sales_write"
  ON public.org_smtp_settings
  FOR DELETE TO authenticated
  USING (public.can_access_organization(organization_id, 'sales.write'));

-- ---------------------------------------------------------------------
-- email_campaigns
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Campaigns visibility" ON public.email_campaigns;
DROP POLICY IF EXISTS "Campaigns insert"     ON public.email_campaigns;
DROP POLICY IF EXISTS "Campaigns update"     ON public.email_campaigns;
DROP POLICY IF EXISTS "Campaigns delete"     ON public.email_campaigns;

CREATE POLICY "campaigns_select"
  ON public.email_campaigns
  FOR SELECT TO authenticated
  USING (
    (scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
    OR (scope = 'org'   AND public.can_access_organization(organization_id, 'sales.read'))
  );

CREATE POLICY "campaigns_insert"
  ON public.email_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (
    (scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
    OR (scope = 'org'   AND public.can_access_organization(organization_id, 'sales.write'))
  );

-- UPDATE: both USING and WITH CHECK, so a row can't be moved to another org.
CREATE POLICY "campaigns_update"
  ON public.email_campaigns
  FOR UPDATE TO authenticated
  USING (
    (scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
    OR (scope = 'org'   AND public.can_access_organization(organization_id, 'sales.write'))
  )
  WITH CHECK (
    (scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
    OR (scope = 'org'   AND public.can_access_organization(organization_id, 'sales.write'))
  );

CREATE POLICY "campaigns_delete"
  ON public.email_campaigns
  FOR DELETE TO authenticated
  USING (
    (scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
    OR (scope = 'org'   AND public.can_access_organization(organization_id, 'sales.write'))
  );

-- ---------------------------------------------------------------------
-- email_campaign_recipients (auth via parent campaign)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Recipients visibility" ON public.email_campaign_recipients;
DROP POLICY IF EXISTS "Recipients insert"     ON public.email_campaign_recipients;
DROP POLICY IF EXISTS "Recipients update"     ON public.email_campaign_recipients;
DROP POLICY IF EXISTS "Recipients delete"     ON public.email_campaign_recipients;

CREATE POLICY "recipients_select"
  ON public.email_campaign_recipients
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_recipients.campaign_id
      AND (
        (c.scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
        OR (c.scope = 'org'   AND public.can_access_organization(c.organization_id, 'sales.read'))
      )
  ));

CREATE POLICY "recipients_insert"
  ON public.email_campaign_recipients
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_recipients.campaign_id
      AND (
        (c.scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
        OR (c.scope = 'org'   AND public.can_access_organization(c.organization_id, 'sales.write'))
      )
  ));

CREATE POLICY "recipients_update"
  ON public.email_campaign_recipients
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

CREATE POLICY "recipients_delete"
  ON public.email_campaign_recipients
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_recipients.campaign_id
      AND (
        (c.scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
        OR (c.scope = 'org'   AND public.can_access_organization(c.organization_id, 'sales.write'))
      )
  ));

-- ---------------------------------------------------------------------
-- email_campaign_clicks (read-only reporting; writes are done by
-- email-click-redirect via service_role, so no INSERT policy is needed)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Clicks: visible to campaign owner" ON public.email_campaign_clicks;

CREATE POLICY "clicks_select"
  ON public.email_campaign_clicks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_clicks.campaign_id
      AND (
        (c.scope = 'platform' AND public.has_role('admin'::app_role, auth.uid()))
        OR (c.scope = 'org'   AND public.can_access_organization(c.organization_id, 'sales.read'))
      )
  ));

-- ---------------------------------------------------------------------
-- get_decrypted_org_smtp — service_role only
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_decrypted_org_smtp(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_decrypted_org_smtp(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_decrypted_org_smtp(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_decrypted_org_smtp(uuid) TO service_role;

COMMIT;
