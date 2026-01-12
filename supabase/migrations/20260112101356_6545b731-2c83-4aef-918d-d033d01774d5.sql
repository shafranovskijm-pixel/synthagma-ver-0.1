-- Create table for storing consent documents
CREATE TABLE public.consent_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('individual', 'organization')),
  
  -- For individual consents
  full_name TEXT,
  passport_data TEXT,
  address TEXT,
  
  -- For organization consents
  company_name TEXT,
  company_inn TEXT,
  company_director TEXT,
  company_address TEXT,
  
  -- Generated content
  content_html TEXT NOT NULL,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.consent_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Org users can view their consent documents"
ON public.consent_documents
FOR SELECT
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can insert consent documents"
ON public.consent_documents
FOR INSERT
WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can delete their consent documents"
ON public.consent_documents
FOR DELETE
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

-- Index for faster queries
CREATE INDEX idx_consent_documents_org ON public.consent_documents(organization_id);
CREATE INDEX idx_consent_documents_created ON public.consent_documents(created_at DESC);