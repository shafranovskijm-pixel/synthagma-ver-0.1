-- 1) email_templates
CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('platform','org')),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'custom',
  subject text NOT NULL,
  html_body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'platform' AND organization_id IS NULL) OR (scope = 'org' AND organization_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_email_templates_lookup ON public.email_templates(scope, organization_id, category) WHERE deleted_at IS NULL;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all templates" ON public.email_templates
  FOR ALL TO authenticated
  USING (has_role('admin'::app_role, auth.uid()))
  WITH CHECK (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users select their templates and platform" ON public.email_templates
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      scope = 'platform'
      OR (scope = 'org' AND organization_id = current_organization_id())
    )
  );

CREATE POLICY "Org users insert own templates" ON public.email_templates
  FOR INSERT TO authenticated
  WITH CHECK (scope = 'org' AND organization_id = current_organization_id());

CREATE POLICY "Org users update own templates" ON public.email_templates
  FOR UPDATE TO authenticated
  USING (scope = 'org' AND organization_id = current_organization_id())
  WITH CHECK (scope = 'org' AND organization_id = current_organization_id());

CREATE TRIGGER trg_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) org_services
CREATE TABLE IF NOT EXISTS public.org_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'шт',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_services_org ON public.org_services(organization_id);
ALTER TABLE public.org_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins all org_services" ON public.org_services
  FOR ALL TO authenticated
  USING (has_role('admin'::app_role, auth.uid()))
  WITH CHECK (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org members manage own services" ON public.org_services
  FOR ALL TO authenticated
  USING (organization_id = current_organization_id())
  WITH CHECK (organization_id = current_organization_id());

CREATE TRIGGER trg_org_services_updated_at
  BEFORE UPDATE ON public.org_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) org_contract_templates
CREATE TABLE IF NOT EXISTS public.org_contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  body_html text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_contract_templates_org ON public.org_contract_templates(organization_id);
ALTER TABLE public.org_contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins all contract templates" ON public.org_contract_templates
  FOR ALL TO authenticated
  USING (has_role('admin'::app_role, auth.uid()))
  WITH CHECK (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org members manage own contract templates" ON public.org_contract_templates
  FOR ALL TO authenticated
  USING (organization_id = current_organization_id())
  WITH CHECK (organization_id = current_organization_id());

CREATE TRIGGER trg_org_contract_templates_updated_at
  BEFORE UPDATE ON public.org_contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) commercial_proposals — расширение
ALTER TABLE public.commercial_proposals
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'platform' CHECK (scope IN ('platform','org')),
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS linked_signature_id uuid REFERENCES public.document_signatures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commercial_proposals_org ON public.commercial_proposals(organization_id) WHERE scope = 'org';

-- Org access policy (admin policies уже есть)
DROP POLICY IF EXISTS "Org members manage own proposals" ON public.commercial_proposals;
CREATE POLICY "Org members manage own proposals" ON public.commercial_proposals
  FOR ALL TO authenticated
  USING (scope = 'org' AND organization_id = current_organization_id())
  WITH CHECK (scope = 'org' AND organization_id = current_organization_id());

-- commercial_proposal_services — orgs могут править свои через JOIN
DROP POLICY IF EXISTS "Org members manage own proposal services" ON public.commercial_proposal_services;
CREATE POLICY "Org members manage own proposal services" ON public.commercial_proposal_services
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.commercial_proposals cp
      WHERE cp.id = commercial_proposal_services.proposal_id
        AND cp.scope = 'org'
        AND cp.organization_id = current_organization_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.commercial_proposals cp
      WHERE cp.id = commercial_proposal_services.proposal_id
        AND cp.scope = 'org'
        AND cp.organization_id = current_organization_id()
    )
  );

-- 5) email_campaigns.template_id
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL;

-- 6) org_smtp_settings.provider_daily_limit
ALTER TABLE public.org_smtp_settings
  ADD COLUMN IF NOT EXISTS provider_daily_limit int NOT NULL DEFAULT 500;

-- 7) document_signatures — трекинг + связь с КП
ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS email_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_open_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS linked_proposal_id uuid REFERENCES public.commercial_proposals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_document_signatures_open_token ON public.document_signatures(email_open_token);

-- 8) consume_email_quota — добавляем skip_warmup
DROP FUNCTION IF EXISTS public.consume_email_quota(text, int);
CREATE OR REPLACE FUNCTION public.consume_email_quota(
  p_scope_key text,
  p_count int,
  p_skip_warmup boolean DEFAULT false
)
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

  INSERT INTO public.email_warmup_state(scope_key, started_at, sent_today, sent_today_date, total_sent)
  VALUES (p_scope_key, v_today, 0, v_today, 0)
  ON CONFLICT (scope_key) DO NOTHING;

  SELECT * INTO v_state FROM public.email_warmup_state
  WHERE scope_key = p_scope_key FOR UPDATE;

  v_started := v_state.started_at;
  v_day := (v_today - v_started)::int + 1;
  IF v_day < 1 THEN v_day := 1; END IF;
  v_limit := _email_daily_limit(v_day);

  IF v_state.sent_today_date <> v_today THEN
    v_sent_today := 0;
  ELSE
    v_sent_today := v_state.sent_today;
  END IF;

  IF NOT p_skip_warmup AND (v_sent_today + p_count > v_limit) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'day', v_day,
      'daily_limit', v_limit,
      'sent_today', v_sent_today,
      'remaining', GREATEST(v_limit - v_sent_today, 0),
      'requested', p_count,
      'skip_warmup', false
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
    'remaining', GREATEST(v_limit - (v_sent_today + p_count), 0),
    'consumed', p_count,
    'total_sent', v_total,
    'skip_warmup', p_skip_warmup
  );
END;
$$;

-- 9) Триггер автоклонирования системных шаблонов
CREATE OR REPLACE FUNCTION public.clone_default_email_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.email_templates (scope, organization_id, name, category, subject, html_body, variables, is_default)
  SELECT 'org', NEW.id, name, category, subject, html_body, variables, false
  FROM public.email_templates
  WHERE scope = 'platform' AND is_default = true AND deleted_at IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_org_email_templates ON public.organizations;
CREATE TRIGGER seed_org_email_templates
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.clone_default_email_templates();

-- 10) Триггер: договор подписан → КП accepted
CREATE OR REPLACE FUNCTION public.mark_proposal_accepted_on_signing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed') AND NEW.linked_proposal_id IS NOT NULL THEN
    UPDATE public.commercial_proposals
    SET status = 'accepted', updated_at = now()
    WHERE id = NEW.linked_proposal_id AND status <> 'accepted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_signature_signed_update_proposal ON public.document_signatures;
CREATE TRIGGER on_signature_signed_update_proposal
  AFTER UPDATE ON public.document_signatures
  FOR EACH ROW EXECUTE FUNCTION public.mark_proposal_accepted_on_signing();

-- 11) Сидинг системных шаблонов (только если их ещё нет)
INSERT INTO public.email_templates (scope, organization_id, name, category, subject, html_body, variables, is_default)
SELECT * FROM (VALUES
  ('platform'::text, NULL::uuid, 'Знакомство — холодное'::text, 'cold'::text,
   'Добрый день, {{company}}!'::text,
   '<p>Здравствуйте, {{name}}!</p><p>Меня зовут {{sender_name}}, представляю компанию {{sender_company}}. Мы помогаем компаниям вашей сферы решать задачи обучения сотрудников.</p><p>Будет уместно созвониться на 10–15 минут на следующей неделе?</p><p>С уважением,<br>{{sender_name}}</p>'::text,
   '["name","company","sender_name","sender_company"]'::jsonb, true),
  ('platform', NULL, 'Отправка КП', 'proposal',
   'Коммерческое предложение для {{company}}',
   '<p>Здравствуйте, {{name}}!</p><p>Во вложении и по ссылке наше коммерческое предложение для компании {{company}}.</p><p><a href="{{proposal_url}}" style="display:inline-block;background:#0EA5A4;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Открыть КП</a></p><p>Готов ответить на любые вопросы.</p>',
   '["name","company","proposal_url","sender_name"]', true),
  ('platform', NULL, 'Напоминание после КП', 'followup',
   'Напоминание по нашему КП',
   '<p>Здравствуйте, {{name}}!</p><p>Несколько дней назад отправлял вам коммерческое предложение для {{company}}. Получилось ознакомиться?</p><p><a href="{{proposal_url}}">Ссылка на КП</a></p><p>Если есть вопросы — с радостью отвечу.</p>',
   '["name","company","proposal_url"]', true),
  ('platform', NULL, 'Отправка договора', 'contract',
   'Договор на подписание — {{document_title}}',
   '<p>Здравствуйте, {{name}}!</p><p>Направляю на подписание документ: <strong>{{document_title}}</strong>.</p><p><a href="{{signing_url}}" style="display:inline-block;background:#0EA5A4;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Открыть и подписать</a></p><p>Если потребуются правки — внесите комментарии прямо в форме подписания.</p>',
   '["name","document_title","signing_url","sender_name"]', true),
  ('platform', NULL, 'Договор подписан — благодарность', 'contract',
   'Спасибо! Договор подписан',
   '<p>Здравствуйте, {{name}}!</p><p>Подтверждаем подписание документа <strong>{{document_title}}</strong>. Копию можно скачать в личном кабинете.</p><p>Будем рады дальнейшему сотрудничеству!</p>',
   '["name","document_title"]', true),
  ('platform', NULL, 'Реактивация спящего клиента', 'cold',
   'Давно не общались — есть пара идей',
   '<p>Здравствуйте, {{name}}!</p><p>Давно не общались с {{company}}. У нас появилось несколько новых программ обучения, которые могут быть полезны вашим сотрудникам.</p><p>Удобно созвониться на 10 минут?</p>',
   '["name","company"]', true)
) AS t(scope, organization_id, name, category, subject, html_body, variables, is_default)
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates WHERE scope = 'platform' AND is_default = true
);