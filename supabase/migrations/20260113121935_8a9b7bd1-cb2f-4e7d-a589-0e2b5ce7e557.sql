-- Create education document records table
CREATE TABLE public.education_document_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reg_number TEXT NOT NULL,
  full_name TEXT NOT NULL,
  birth_date DATE,
  document_type TEXT NOT NULL CHECK (document_type IN ('certificate', 'diploma', 'qualification')),
  document_series TEXT,
  document_number TEXT NOT NULL,
  issue_date DATE NOT NULL,
  specialty_name TEXT NOT NULL,
  qualification_name TEXT,
  protocol_number TEXT,
  protocol_date DATE,
  order_number TEXT,
  order_date DATE,
  document_status TEXT NOT NULL DEFAULT 'original' CHECK (document_status IN ('original', 'duplicate')),
  original_document_data TEXT,
  delivery_method TEXT NOT NULL DEFAULT 'personal' CHECK (delivery_method IN ('personal', 'representative', 'postal')),
  delivery_details TEXT,
  notes TEXT,
  enrollment_id UUID REFERENCES public.enrollments(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.education_document_records ENABLE ROW LEVEL SECURITY;

-- RLS policies for organization access
CREATE POLICY "Org users can view their education documents"
ON public.education_document_records
FOR SELECT
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can insert education documents"
ON public.education_document_records
FOR INSERT
WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can update their education documents"
ON public.education_document_records
FOR UPDATE
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can delete their education documents"
ON public.education_document_records
FOR DELETE
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

-- Index for faster queries
CREATE INDEX idx_education_document_records_org ON public.education_document_records(organization_id);
CREATE INDEX idx_education_document_records_type ON public.education_document_records(document_type);
CREATE INDEX idx_education_document_records_issue_date ON public.education_document_records(issue_date);

-- Trigger for updated_at
CREATE TRIGGER update_education_document_records_updated_at
BEFORE UPDATE ON public.education_document_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();