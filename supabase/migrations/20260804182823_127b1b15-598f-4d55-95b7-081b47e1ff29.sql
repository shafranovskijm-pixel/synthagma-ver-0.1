-- 1. Реестр встроенных (bundled) шаблонов договоров: только чтение из приложения.
CREATE TABLE public.contract_template_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  name text NOT NULL,
  counterparty_type text NOT NULL CHECK (counterparty_type IN ('individual','legal')),
  template_format text NOT NULL DEFAULT 'docx_ooxml' CHECK (template_format IN ('docx_ooxml','html')),
  source_path text NOT NULL,
  manifest jsonb NOT NULL,
  source_sha256 text NOT NULL,
  template_sha256 text NOT NULL,
  version_label text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated','approved','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.contract_template_registry TO authenticated;
GRANT ALL ON public.contract_template_registry TO service_role;

ALTER TABLE public.contract_template_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read template registry"
  ON public.contract_template_registry FOR SELECT TO authenticated USING (true);

CREATE POLICY "Global admins manage template registry"
  ON public.contract_template_registry FOR ALL TO authenticated
  USING (has_role('admin'::app_role, auth.uid()))
  WITH CHECK (has_role('admin'::app_role, auth.uid()));

CREATE TRIGGER update_contract_template_registry_updated_at
  BEFORE UPDATE ON public.contract_template_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Формат шаблонов организации (HTML-поток остаётся по умолчанию).
ALTER TABLE public.org_contract_templates
  ADD COLUMN IF NOT EXISTS template_format text NOT NULL DEFAULT 'html'
    CHECK (template_format IN ('html','docx_ooxml')),
  ADD COLUMN IF NOT EXISTS registry_template_key text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('draft','validated','approved','retired'));

-- 3. Результат генерации договора: DOCX/PDF, снимки шаблона и данных, жизненный цикл.
ALTER TABLE public.org_contracts
  ADD COLUMN IF NOT EXISTS template_format text NOT NULL DEFAULT 'html'
    CHECK (template_format IN ('html','docx_ooxml')),
  ADD COLUMN IF NOT EXISTS template_registry_key text,
  ADD COLUMN IF NOT EXISTS template_version_label text,
  ADD COLUMN IF NOT EXISTS template_sha256 text,
  ADD COLUMN IF NOT EXISTS template_manifest jsonb,
  ADD COLUMN IF NOT EXISTS variables_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS docx_path text,
  ADD COLUMN IF NOT EXISTS docx_sha256 text,
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS pdf_status text NOT NULL DEFAULT 'unavailable'
    CHECK (pdf_status IN ('unavailable','pending','ready')),
  ADD COLUMN IF NOT EXISTS generation_status text NOT NULL DEFAULT 'draft'
    CHECK (generation_status IN ('draft','generated','failed')),
  ADD COLUMN IF NOT EXISTS generation_error text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_org_contracts_registry_key
  ON public.org_contracts (template_registry_key);

-- 4. Неизменяемость утверждённых и подписанных договоров.
CREATE OR REPLACE FUNCTION public.org_contracts_enforce_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('approved','signed') THEN
      RAISE EXCEPTION 'Договор в статусе % нельзя удалить', OLD.status;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('approved','signed') THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'approved' AND NEW.status IN ('signed','cancelled')) OR
        (OLD.status = 'signed' AND NEW.status = 'cancelled')
      ) THEN
        RAISE EXCEPTION 'Недопустимый переход статуса договора: % -> %', OLD.status, NEW.status;
      END IF;
    END IF;

    IF (to_jsonb(NEW) - 'status' - 'updated_at' - 'approved_at' - 'signed_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'status' - 'updated_at' - 'approved_at' - 'signed_at') THEN
      RAISE EXCEPTION 'Договор в статусе % неизменяем: создайте новую версию', OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_contracts_immutability ON public.org_contracts;
CREATE TRIGGER org_contracts_immutability
  BEFORE UPDATE OR DELETE ON public.org_contracts
  FOR EACH ROW EXECUTE FUNCTION public.org_contracts_enforce_immutability();

-- 5. Регистрация встроенного шаблона ГОРЭЛТЕХ (компания).
INSERT INTO public.contract_template_registry (
  template_key, name, counterparty_type, template_format, source_path,
  manifest, source_sha256, template_sha256, version_label, status
) VALUES (
  'goreltech.company.paid_education',
  'Договор возмездного оказания образовательных услуг (ГОРЭЛТЕХ)',
  'legal',
  'docx_ooxml',
  'contract-templates/goreltech/company/v1/template.docx',
  '{"schema_version":1,"template_id":"goreltech.company.paid_education","template_version":"1.0.0-draft","scenario":"legal_entity_customer","bundled":true}'::jsonb,
  '72149D57D254CCDAF5A636ACCE7F45763D8194BBEA022E1C2287A0F1629F1A99',
  '919475270A42A7CE7BCDDEB73A1D58E865EF62FE7939FFB48692100275BEAF2D',
  '1.0.0-draft',
  'draft'
) ON CONFLICT (template_key) DO NOTHING;