-- Add company_id to registration_links to allow company-specific invitation links
ALTER TABLE public.registration_links
ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_registration_links_company_id ON public.registration_links(company_id);