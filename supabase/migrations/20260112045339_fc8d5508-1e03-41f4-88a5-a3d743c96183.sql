-- Add stamp and signature columns to organizations
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS stamp_url text,
ADD COLUMN IF NOT EXISTS signature_url text;

-- Add stamp and signature columns to companies
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS stamp_url text,
ADD COLUMN IF NOT EXISTS signature_url text;