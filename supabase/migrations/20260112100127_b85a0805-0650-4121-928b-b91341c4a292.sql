-- Change default value of frdo_enabled to true
ALTER TABLE public.organizations ALTER COLUMN frdo_enabled SET DEFAULT true;

-- Update all existing organizations to have frdo_enabled = true
UPDATE public.organizations SET frdo_enabled = true WHERE frdo_enabled = false;