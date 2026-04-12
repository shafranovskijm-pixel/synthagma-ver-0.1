ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS custom_max_courses integer;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS custom_max_students integer;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS custom_max_trained_per_month integer;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS custom_ai_generations_limit integer;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS custom_storage_limit_bytes bigint;