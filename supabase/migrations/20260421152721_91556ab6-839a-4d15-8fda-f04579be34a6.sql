-- ===========================
-- 1) SMTP-настройки организаций
-- ===========================
CREATE TABLE IF NOT EXISTS public.org_smtp_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  host text NOT NULL,
  port int NOT NULL DEFAULT 587,
  username text NOT NULL,
  password_encrypted text NOT NULL,
  from_email text NOT NULL,
  from_name text,
  encryption text NOT NULL DEFAULT 'tls',
  is_verified boolean NOT NULL DEFAULT false,
  last_test_at timestamptz,
  last_test_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_smtp_settings ENABLE ROW LEVEL SECURITY;

-- Триггер шифрования (как trigger_encrypt_org_cred_password)
CREATE OR REPLACE FUNCTION public.trigger_encrypt_smtp_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.password_encrypted IS NOT NULL AND NEW.password_encrypted <> '' AND NOT (NEW.password_encrypted LIKE 'ENC:%') THEN
    NEW.password_encrypted = encrypt_password(NEW.password_encrypted);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encrypt_smtp_password_trg ON public.org_smtp_settings;
CREATE TRIGGER encrypt_smtp_password_trg
BEFORE INSERT OR UPDATE OF password_encrypted ON public.org_smtp_settings
FOR EACH ROW EXECUTE FUNCTION public.trigger_encrypt_smtp_password();

DROP TRIGGER IF EXISTS update_org_smtp_settings_updated_at ON public.org_smtp_settings;
CREATE TRIGGER update_org_smtp_settings_updated_at
BEFORE UPDATE ON public.org_smtp_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS политики
DROP POLICY IF EXISTS "Org or admin can view smtp" ON public.org_smtp_settings;
CREATE POLICY "Org or admin can view smtp"
ON public.org_smtp_settings FOR SELECT
USING (
  has_role('admin'::app_role, auth.uid())
  OR organization_id = current_organization_id()
);

DROP POLICY IF EXISTS "Org or admin can insert smtp" ON public.org_smtp_settings;
CREATE POLICY "Org or admin can insert smtp"
ON public.org_smtp_settings FOR INSERT
WITH CHECK (
  has_role('admin'::app_role, auth.uid())
  OR organization_id = current_organization_id()
);

DROP POLICY IF EXISTS "Org or admin can update smtp" ON public.org_smtp_settings;
CREATE POLICY "Org or admin can update smtp"
ON public.org_smtp_settings FOR UPDATE
USING (
  has_role('admin'::app_role, auth.uid())
  OR organization_id = current_organization_id()
);

DROP POLICY IF EXISTS "Org or admin can delete smtp" ON public.org_smtp_settings;
CREATE POLICY "Org or admin can delete smtp"
ON public.org_smtp_settings FOR DELETE
USING (
  has_role('admin'::app_role, auth.uid())
  OR organization_id = current_organization_id()
);

-- RPC расшифровки SMTP-пароля (только админ или своя организация)
CREATE OR REPLACE FUNCTION public.get_decrypted_org_smtp(p_organization_id uuid)
RETURNS TABLE(host text, port int, username text, password text, from_email text, from_name text, encryption text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role('admin'::app_role, auth.uid())
    OR current_organization_id() = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT s.host, s.port, s.username,
         decrypt_password(s.password_encrypted) AS password,
         s.from_email, s.from_name, s.encryption
  FROM public.org_smtp_settings s
  WHERE s.organization_id = p_organization_id;
END;
$$;

-- ===========================
-- 2) Кампании рассылок
-- ===========================
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('platform','org')),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL,
  from_name text,
  reply_to text,
  recipient_source text NOT NULL CHECK (recipient_source IN ('students','companies','organizations','companies_db','manual')),
  recipient_filter jsonb,
  manual_emails text[],
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','completed','failed','paused')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  total_recipients int NOT NULL DEFAULT 0,
  sent_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  open_count int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_scope_org ON public.email_campaigns(scope, organization_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON public.email_campaigns(status);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_email_campaigns_updated_at ON public.email_campaigns;
CREATE TRIGGER update_email_campaigns_updated_at
BEFORE UPDATE ON public.email_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Campaigns visibility" ON public.email_campaigns;
CREATE POLICY "Campaigns visibility"
ON public.email_campaigns FOR SELECT
USING (
  has_role('admin'::app_role, auth.uid())
  OR (scope = 'org' AND organization_id = current_organization_id())
);

DROP POLICY IF EXISTS "Campaigns insert" ON public.email_campaigns;
CREATE POLICY "Campaigns insert"
ON public.email_campaigns FOR INSERT
WITH CHECK (
  (has_role('admin'::app_role, auth.uid()) AND scope = 'platform')
  OR (scope = 'org' AND organization_id = current_organization_id())
);

DROP POLICY IF EXISTS "Campaigns update" ON public.email_campaigns;
CREATE POLICY "Campaigns update"
ON public.email_campaigns FOR UPDATE
USING (
  has_role('admin'::app_role, auth.uid())
  OR (scope = 'org' AND organization_id = current_organization_id())
);

DROP POLICY IF EXISTS "Campaigns delete" ON public.email_campaigns;
CREATE POLICY "Campaigns delete"
ON public.email_campaigns FOR DELETE
USING (
  has_role('admin'::app_role, auth.uid())
  OR (scope = 'org' AND organization_id = current_organization_id())
);

-- ===========================
-- 3) Получатели кампаний
-- ===========================
CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  email text NOT NULL,
  recipient_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','bounced','opened')),
  error text,
  sent_at timestamptz,
  opened_at timestamptz,
  open_token uuid NOT NULL DEFAULT gen_random_uuid()
);

CREATE INDEX IF NOT EXISTS idx_ecr_campaign_status ON public.email_campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_ecr_open_token ON public.email_campaign_recipients(open_token);

ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recipients visibility" ON public.email_campaign_recipients;
CREATE POLICY "Recipients visibility"
ON public.email_campaign_recipients FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_recipients.campaign_id
      AND (
        has_role('admin'::app_role, auth.uid())
        OR (c.scope = 'org' AND c.organization_id = current_organization_id())
      )
  )
);

DROP POLICY IF EXISTS "Recipients insert" ON public.email_campaign_recipients;
CREATE POLICY "Recipients insert"
ON public.email_campaign_recipients FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_recipients.campaign_id
      AND (
        has_role('admin'::app_role, auth.uid())
        OR (c.scope = 'org' AND c.organization_id = current_organization_id())
      )
  )
);

DROP POLICY IF EXISTS "Recipients update" ON public.email_campaign_recipients;
CREATE POLICY "Recipients update"
ON public.email_campaign_recipients FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_recipients.campaign_id
      AND (
        has_role('admin'::app_role, auth.uid())
        OR (c.scope = 'org' AND c.organization_id = current_organization_id())
      )
  )
);

DROP POLICY IF EXISTS "Recipients delete" ON public.email_campaign_recipients;
CREATE POLICY "Recipients delete"
ON public.email_campaign_recipients FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_recipients.campaign_id
      AND (
        has_role('admin'::app_role, auth.uid())
        OR (c.scope = 'org' AND c.organization_id = current_organization_id())
      )
  )
);

-- ===========================
-- 4) Состояние прогрева
-- ===========================
CREATE TABLE IF NOT EXISTS public.email_warmup_state (
  scope_key text PRIMARY KEY,
  started_at date NOT NULL DEFAULT CURRENT_DATE,
  sent_today int NOT NULL DEFAULT 0,
  sent_today_date date NOT NULL DEFAULT CURRENT_DATE,
  total_sent int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_warmup_state ENABLE ROW LEVEL SECURITY;

-- Никто напрямую не имеет доступа — только через RPC SECURITY DEFINER
DROP POLICY IF EXISTS "warmup_no_direct" ON public.email_warmup_state;
CREATE POLICY "warmup_no_direct"
ON public.email_warmup_state FOR ALL
USING (false) WITH CHECK (false);

-- Helper: лимит на день N (1-based)
CREATE OR REPLACE FUNCTION public._email_daily_limit(_day int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _day <= 1 THEN 10
    WHEN _day = 2 THEN 20
    WHEN _day = 3 THEN 40
    WHEN _day = 4 THEN 70
    WHEN _day = 5 THEN 100
    WHEN _day = 6 THEN 150
    WHEN _day = 7 THEN 200
    WHEN _day = 8 THEN 300
    WHEN _day = 9 THEN 400
    WHEN _day = 10 THEN 500
    WHEN _day = 11 THEN 700
    WHEN _day = 12 THEN 1000
    WHEN _day = 13 THEN 1500
    ELSE 2000
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_warmup_status(p_scope_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state RECORD;
  v_today date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_day int;
  v_limit int;
  v_sent_today int;
BEGIN
  -- Доступ: админ или своя организация (scope_key = org_id::text)
  IF NOT (
    has_role('admin'::app_role, auth.uid())
    OR p_scope_key = COALESCE(current_organization_id()::text, '___no_org___')
    OR (p_scope_key = 'platform' AND has_role('admin'::app_role, auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_state FROM public.email_warmup_state WHERE scope_key = p_scope_key;

  IF v_state IS NULL THEN
    -- ещё не отправляли — день 1, 0 отправлено
    RETURN jsonb_build_object(
      'day', 1,
      'daily_limit', _email_daily_limit(1),
      'sent_today', 0,
      'remaining', _email_daily_limit(1),
      'total_sent', 0,
      'started_at', null
    );
  END IF;

  v_day := (v_today - v_state.started_at)::int + 1;
  IF v_day < 1 THEN v_day := 1; END IF;
  v_limit := _email_daily_limit(v_day);
  v_sent_today := CASE WHEN v_state.sent_today_date = v_today THEN v_state.sent_today ELSE 0 END;

  RETURN jsonb_build_object(
    'day', v_day,
    'daily_limit', v_limit,
    'sent_today', v_sent_today,
    'remaining', GREATEST(v_limit - v_sent_today, 0),
    'total_sent', v_state.total_sent,
    'started_at', v_state.started_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_email_quota(p_scope_key text, p_count int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state RECORD;
  v_today date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_day int;
  v_limit int;
  v_sent_today int;
  v_started date;
  v_total int;
BEGIN
  IF p_count <= 0 THEN
    RAISE EXCEPTION 'Count must be > 0';
  END IF;

  -- Заводим строку, если не было
  INSERT INTO public.email_warmup_state(scope_key, started_at, sent_today, sent_today_date, total_sent)
  VALUES (p_scope_key, v_today, 0, v_today, 0)
  ON CONFLICT (scope_key) DO NOTHING;

  -- Лочим строку
  SELECT * INTO v_state FROM public.email_warmup_state
  WHERE scope_key = p_scope_key FOR UPDATE;

  v_started := v_state.started_at;
  v_day := (v_today - v_started)::int + 1;
  IF v_day < 1 THEN v_day := 1; END IF;
  v_limit := _email_daily_limit(v_day);

  -- Сброс счётчика на новый день
  IF v_state.sent_today_date <> v_today THEN
    v_sent_today := 0;
  ELSE
    v_sent_today := v_state.sent_today;
  END IF;

  IF v_sent_today + p_count > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'day', v_day,
      'daily_limit', v_limit,
      'sent_today', v_sent_today,
      'remaining', GREATEST(v_limit - v_sent_today, 0),
      'requested', p_count
    );
  END IF;

  v_total := v_state.total_sent + p_count;

  UPDATE public.email_warmup_state
  SET sent_today = v_sent_today + p_count,
      sent_today_date = v_today,
      total_sent = v_total,
      updated_at = now()
  WHERE scope_key = p_scope_key;

  RETURN jsonb_build_object(
    'allowed', true,
    'day', v_day,
    'daily_limit', v_limit,
    'sent_today', v_sent_today + p_count,
    'remaining', v_limit - (v_sent_today + p_count),
    'consumed', p_count,
    'total_sent', v_total
  );
END;
$$;

-- ===========================
-- Grants для аутентифицированных
-- ===========================
GRANT EXECUTE ON FUNCTION public.get_decrypted_org_smtp(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_warmup_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_email_quota(text, int) TO authenticated;