-- Нормализуем возможные дубли is_default внутри (organization_id, counterparty_type):
-- default остаётся у самого свежего шаблона, остальные просто теряют признак (не удаляются).
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY organization_id, counterparty_type
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM public.org_contract_templates
  WHERE is_default AND archived_at IS NULL
)
UPDATE public.org_contract_templates t
SET is_default = false
FROM ranked r
WHERE t.id = r.id AND r.rn > 1;

-- Пересоздаём partial unique index уже на нормализованных данных.
DROP INDEX IF EXISTS public.uq_org_contract_templates_default;
CREATE UNIQUE INDEX uq_org_contract_templates_default
  ON public.org_contract_templates(organization_id, counterparty_type)
  WHERE is_default AND archived_at IS NULL;