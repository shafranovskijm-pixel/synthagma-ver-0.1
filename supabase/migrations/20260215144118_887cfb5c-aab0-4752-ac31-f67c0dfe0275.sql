
-- Add ai_generations_count to organization_usage for tracking AI usage per month
ALTER TABLE public.organization_usage ADD COLUMN IF NOT EXISTS ai_generations_count integer NOT NULL DEFAULT 0;
