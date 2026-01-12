-- Add payment status to company_documents
ALTER TABLE public.company_documents
ADD COLUMN is_paid boolean DEFAULT false,
ADD COLUMN paid_at timestamp with time zone,
ADD COLUMN amount numeric(12, 2),
ADD COLUMN contract_number text;

-- Create index for faster payment status queries  
CREATE INDEX idx_company_documents_is_paid ON public.company_documents(is_paid) WHERE type IN ('contract', 'invoice');
CREATE INDEX idx_company_documents_type ON public.company_documents(type);