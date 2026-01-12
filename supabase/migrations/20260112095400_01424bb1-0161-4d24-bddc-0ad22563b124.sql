-- Add FRDO feature toggle to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS frdo_enabled BOOLEAN NOT NULL DEFAULT false;