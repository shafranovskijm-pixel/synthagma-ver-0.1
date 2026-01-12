-- Add additional fields from DaData to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS kpp TEXT,
ADD COLUMN IF NOT EXISTS ogrn TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS director TEXT;