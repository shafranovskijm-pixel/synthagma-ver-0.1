-- ============ 1) КОНТАКТЫ РАССЫЛОК ============
CREATE TABLE IF NOT EXISTS public.mailing_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  first_name text,
  last_name text,
  organization text,
  position text,
  city text,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mailing_contacts TO authenticated;
GRANT ALL ON public.mailing_contacts TO service_role;

ALTER TABLE public.mailing_contacts ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS mailing_contacts_org_email_uniq
  ON public.mailing_contacts (organization_id, lower(email));
CREATE INDEX IF NOT EXISTS mailing_contacts_org_idx
  ON public.mailing_contacts (organization_id, created_at DESC);

DROP POLICY IF EXISTS "mailing_contacts_select" ON public.mailing_contacts;
CREATE POLICY "mailing_contacts_select" ON public.mailing_contacts
FOR SELECT TO authenticated
USING (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id());

DROP POLICY IF EXISTS "mailing_contacts_insert" ON public.mailing_contacts;
CREATE POLICY "mailing_contacts_insert" ON public.mailing_contacts
FOR INSERT TO authenticated
WITH CHECK (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id());

DROP POLICY IF EXISTS "mailing_contacts_update" ON public.mailing_contacts;
CREATE POLICY "mailing_contacts_update" ON public.mailing_contacts
FOR UPDATE TO authenticated
USING (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id())
WITH CHECK (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id());

DROP POLICY IF EXISTS "mailing_contacts_delete" ON public.mailing_contacts;
CREATE POLICY "mailing_contacts_delete" ON public.mailing_contacts
FOR DELETE TO authenticated
USING (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id());

DROP TRIGGER IF EXISTS mailing_contacts_updated_at ON public.mailing_contacts;
CREATE TRIGGER mailing_contacts_updated_at
BEFORE UPDATE ON public.mailing_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 2) ОТПРАВИТЕЛИ ============
CREATE TABLE IF NOT EXISTS public.mailing_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  from_name text,
  from_email text NOT NULL,
  smtp_host text NOT NULL,
  smtp_port int NOT NULL DEFAULT 465,
  smtp_security text NOT NULL DEFAULT 'ssl',
  smtp_username text NOT NULL,
  password_encrypted text,
  imap_host text,
  imap_port int DEFAULT 993,
  imap_security text DEFAULT 'ssl',
  imap_username text,
  smtp_status text NOT NULL DEFAULT 'untested',
  imap_status text NOT NULL DEFAULT 'untested',
  last_tested_at timestamptz,
  last_error text,
  daily_limit int NOT NULL DEFAULT 200,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- пароль намеренно исключён из SELECT-грантов: клиент не может его прочитать
GRANT SELECT (
  id, organization_id, label, from_name, from_email,
  smtp_host, smtp_port, smtp_security, smtp_username,
  imap_host, imap_port, imap_security, imap_username,
  smtp_status, imap_status, last_tested_at, last_error,
  daily_limit, is_active, created_by, created_at, updated_at
) ON public.mailing_senders TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.mailing_senders TO authenticated;
GRANT ALL ON public.mailing_senders TO service_role;

ALTER TABLE public.mailing_senders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS mailing_senders_org_idx ON public.mailing_senders (organization_id);

DROP POLICY IF EXISTS "mailing_senders_select" ON public.mailing_senders;
CREATE POLICY "mailing_senders_select" ON public.mailing_senders
FOR SELECT TO authenticated
USING (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id());

DROP POLICY IF EXISTS "mailing_senders_insert" ON public.mailing_senders;
CREATE POLICY "mailing_senders_insert" ON public.mailing_senders
FOR INSERT TO authenticated
WITH CHECK (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id());

DROP POLICY IF EXISTS "mailing_senders_update" ON public.mailing_senders;
CREATE POLICY "mailing_senders_update" ON public.mailing_senders
FOR UPDATE TO authenticated
USING (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id())
WITH CHECK (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id());

DROP POLICY IF EXISTS "mailing_senders_delete" ON public.mailing_senders;
CREATE POLICY "mailing_senders_delete" ON public.mailing_senders
FOR DELETE TO authenticated
USING (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id());

CREATE OR REPLACE FUNCTION public.trigger_encrypt_mailing_sender_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.password_encrypted IS NOT NULL AND NEW.password_encrypted <> ''
     AND NOT (NEW.password_encrypted LIKE 'ENC:%') THEN
    NEW.password_encrypted = encrypt_password(NEW.password_encrypted);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encrypt_mailing_sender_password_trg ON public.mailing_senders;
CREATE TRIGGER encrypt_mailing_sender_password_trg
BEFORE INSERT OR UPDATE OF password_encrypted ON public.mailing_senders
FOR EACH ROW EXECUTE FUNCTION public.trigger_encrypt_mailing_sender_password();

DROP TRIGGER IF EXISTS mailing_senders_updated_at ON public.mailing_senders;
CREATE TRIGGER mailing_senders_updated_at
BEFORE UPDATE ON public.mailing_senders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 3) ПУБЛИЧНЫЕ ССЫЛКИ НА ОТЧЁТ ============
CREATE TABLE IF NOT EXISTS public.mailing_report_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  view_count int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mailing_report_links TO authenticated;
GRANT ALL ON public.mailing_report_links TO service_role;

ALTER TABLE public.mailing_report_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS mailing_report_links_campaign_idx
  ON public.mailing_report_links (campaign_id);

DROP POLICY IF EXISTS "mailing_report_links_select" ON public.mailing_report_links;
CREATE POLICY "mailing_report_links_select" ON public.mailing_report_links
FOR SELECT TO authenticated
USING (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id());

DROP POLICY IF EXISTS "mailing_report_links_insert" ON public.mailing_report_links;
CREATE POLICY "mailing_report_links_insert" ON public.mailing_report_links
FOR INSERT TO authenticated
WITH CHECK (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id());

DROP POLICY IF EXISTS "mailing_report_links_update" ON public.mailing_report_links;
CREATE POLICY "mailing_report_links_update" ON public.mailing_report_links
FOR UPDATE TO authenticated
USING (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id())
WITH CHECK (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id());

DROP POLICY IF EXISTS "mailing_report_links_delete" ON public.mailing_report_links;
CREATE POLICY "mailing_report_links_delete" ON public.mailing_report_links
FOR DELETE TO authenticated
USING (has_role('admin'::app_role, auth.uid()) OR organization_id = current_organization_id());

DROP TRIGGER IF EXISTS mailing_report_links_updated_at ON public.mailing_report_links;
CREATE TRIGGER mailing_report_links_updated_at
BEFORE UPDATE ON public.mailing_report_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 4) ДОП. ПОЛЯ КАМПАНИИ (additive) ============
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES public.mailing_senders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS test_mode boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS seed_emails text[];

-- ============ 5) ИМПОРТ КОНТАКТОВ (дедупликация на сервере) ============
CREATE OR REPLACE FUNCTION public.import_mailing_contacts(
  p_organization_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_email text;
  v_added int := 0;
  v_dupes int := 0;
  v_invalid int := 0;
  v_seen text[] := ARRAY[]::text[];
  v_inserted uuid;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;
  IF NOT (has_role('admin'::app_role, auth.uid()) OR p_organization_id = current_organization_id()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a json array';
  END IF;
  IF jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object('added', 0, 'duplicates', 0, 'invalid', 0);
  END IF;
  IF jsonb_array_length(p_rows) > 5000 THEN
    RAISE EXCEPTION 'too many rows in one import (max 5000)';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_email := lower(btrim(coalesce(v_row->>'email', '')));
    IF v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      v_invalid := v_invalid + 1;
      CONTINUE;
    END IF;
    IF v_email = ANY (v_seen) THEN
      v_dupes := v_dupes + 1;
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_email);

    INSERT INTO public.mailing_contacts (
      organization_id, email, first_name, last_name, organization, position, city, custom_fields, source
    ) VALUES (
      p_organization_id,
      v_email,
      nullif(btrim(coalesce(v_row->>'first_name','')), ''),
      nullif(btrim(coalesce(v_row->>'last_name','')), ''),
      nullif(btrim(coalesce(v_row->>'organization','')), ''),
      nullif(btrim(coalesce(v_row->>'position','')), ''),
      nullif(btrim(coalesce(v_row->>'city','')), ''),
      coalesce(v_row->'custom_fields', '{}'::jsonb),
      coalesce(nullif(btrim(coalesce(v_row->>'source','')), ''), 'import')
    )
    ON CONFLICT (organization_id, lower(email)) DO NOTHING
    RETURNING id INTO v_inserted;

    IF v_inserted IS NULL THEN
      v_dupes := v_dupes + 1;
    ELSE
      v_added := v_added + 1;
    END IF;
    v_inserted := NULL;
  END LOOP;

  RETURN jsonb_build_object('added', v_added, 'duplicates', v_dupes, 'invalid', v_invalid);
END;
$$;

REVOKE ALL ON FUNCTION public.import_mailing_contacts(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_mailing_contacts(uuid, jsonb) TO authenticated;

-- ============ 6) ПУБЛИЧНЫЙ ОТЧЁТ ПО ТОКЕНУ (только агрегаты) ============
CREATE OR REPLACE FUNCTION public.get_mailing_report_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.mailing_report_links;
  v_c public.email_campaigns;
  v_bounced int;
  v_sent int;
  v_failed int;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_link FROM public.mailing_report_links WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid');
  END IF;
  IF v_link.is_active = false THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'disabled');
  END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  SELECT * INTO v_c FROM public.email_campaigns WHERE id = v_link.campaign_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid');
  END IF;

  SELECT
    count(*) FILTER (WHERE status IN ('sent','opened','clicked')),
    count(*) FILTER (WHERE status = 'failed'),
    count(*) FILTER (WHERE status = 'bounced')
  INTO v_sent, v_failed, v_bounced
  FROM public.email_campaign_recipients
  WHERE campaign_id = v_link.campaign_id;

  RETURN jsonb_build_object(
    'valid', true,
    'campaign_name', v_c.name,
    'subject', v_c.subject,
    'status', v_c.status,
    'started_at', v_c.started_at,
    'completed_at', v_c.completed_at,
    'total_recipients', coalesce(v_c.total_recipients, 0),
    'accepted', coalesce(v_sent, 0),
    'failed', coalesce(v_failed, 0),
    'bounced', coalesce(v_bounced, 0),
    'opened', coalesce(v_c.open_count, 0),
    'clicked', coalesce(v_c.click_count, 0),
    'unsubscribed', coalesce(v_c.unsubscribe_count, 0),
    'expires_at', v_link.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_mailing_report_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mailing_report_by_token(text) TO anon, authenticated;