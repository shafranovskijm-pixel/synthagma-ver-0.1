-- Create org_notifications table for storing notifications
CREATE TABLE public.org_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  type TEXT NOT NULL, -- 'video_identification', 'consent_signed', 'document_issued', etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  related_id UUID, -- ID of related record (student_consent, video_identification, etc.)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.org_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for org_notifications
CREATE POLICY "Org users can view their notifications"
ON public.org_notifications
FOR SELECT
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can update their notifications"
ON public.org_notifications
FOR UPDATE
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "System can insert notifications"
ON public.org_notifications
FOR INSERT
WITH CHECK (true);

-- Create document_issuance_log for tracking issued documents
CREATE TABLE public.document_issuance_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES public.enrollments(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  document_type TEXT NOT NULL, -- 'certificate', 'protocol', 'diploma', etc.
  document_name TEXT NOT NULL,
  reg_number TEXT,
  issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  send_method TEXT, -- 'email', 'mail', 'handed', etc.
  send_number TEXT, -- tracking number or email
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.document_issuance_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for document_issuance_log
CREATE POLICY "Org users can manage document issuance logs"
ON public.document_issuance_log
FOR ALL
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

-- Add index for faster queries
CREATE INDEX idx_org_notifications_org_id ON public.org_notifications(organization_id);
CREATE INDEX idx_org_notifications_created_at ON public.org_notifications(created_at DESC);
CREATE INDEX idx_document_issuance_org_id ON public.document_issuance_log(organization_id);
CREATE INDEX idx_document_issuance_issued_at ON public.document_issuance_log(issued_at DESC);