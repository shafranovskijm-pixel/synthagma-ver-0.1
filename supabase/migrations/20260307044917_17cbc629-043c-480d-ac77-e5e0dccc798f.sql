ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'gigachat';

DO $$ BEGIN
  ALTER TABLE public.organizations ADD CONSTRAINT organizations_ai_provider_check CHECK (ai_provider IN ('gigachat', 'lovable_ai'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;