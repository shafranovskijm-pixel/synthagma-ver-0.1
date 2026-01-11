-- Add limits columns to organizations table
ALTER TABLE public.organizations 
ADD COLUMN storage_limit_bytes BIGINT NOT NULL DEFAULT 1073741824, -- 1 GB default
ADD COLUMN ai_tokens_limit BIGINT NOT NULL DEFAULT 100000; -- 100K tokens default

-- Add notification settings
ALTER TABLE public.organizations 
ADD COLUMN notify_on_limit_80 BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN notify_on_limit_exceeded BOOLEAN NOT NULL DEFAULT true;