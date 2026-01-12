-- Add organization requisites fields for contracts, invoices, and acts
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS kpp TEXT,
ADD COLUMN IF NOT EXISTS ogrn TEXT,
ADD COLUMN IF NOT EXISTS legal_address TEXT,
ADD COLUMN IF NOT EXISTS actual_address TEXT,
ADD COLUMN IF NOT EXISTS director_name TEXT,
ADD COLUMN IF NOT EXISTS director_position TEXT,
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS bank_bik TEXT,
ADD COLUMN IF NOT EXISTS bank_account TEXT,
ADD COLUMN IF NOT EXISTS bank_corr_account TEXT;