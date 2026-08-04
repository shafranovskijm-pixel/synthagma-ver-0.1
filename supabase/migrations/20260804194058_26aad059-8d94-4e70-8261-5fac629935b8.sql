ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS postal_address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS bank_bik text,
  ADD COLUMN IF NOT EXISTS bank_corr_account text,
  ADD COLUMN IF NOT EXISTS signatory_position text,
  ADD COLUMN IF NOT EXISTS signatory_name_genitive text,
  ADD COLUMN IF NOT EXISTS signatory_authority_clause text;

COMMENT ON COLUMN public.companies.address IS 'Юридический адрес заказчика';
COMMENT ON COLUMN public.companies.director IS 'Полное ФИО подписанта (именительный падеж)';
COMMENT ON COLUMN public.companies.signatory_name_genitive IS 'ФИО подписанта в родительном падеже (заполняется вручную, не выводится автоматически)';
COMMENT ON COLUMN public.companies.signatory_authority_clause IS 'Основание полномочий: например «Уставе» или «Доверенности № 1 от 01.01.2026»';

ALTER TABLE public.student_groups
  ADD COLUMN IF NOT EXISTS training_address text,
  ADD COLUMN IF NOT EXISTS schedule_text text;

COMMENT ON COLUMN public.student_groups.training_address IS 'Фактический адрес места обучения группы';
COMMENT ON COLUMN public.student_groups.schedule_text IS 'Реальный режим занятий группы (текст для договора)';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_position text;

COMMENT ON COLUMN public.profiles.job_position IS 'Должность ученика по месту работы (используется в договорах)';