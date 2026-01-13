-- Create audit log table for tracking user actions
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_name TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create system diagnostics results table
CREATE TABLE public.system_diagnostics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL,
  check_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'warning', 'error')),
  message TEXT,
  details JSONB,
  executed_by UUID,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_diagnostics ENABLE ROW LEVEL SECURITY;

-- RLS policies for audit_logs
CREATE POLICY "Org users can view their audit logs"
ON public.audit_logs
FOR SELECT
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

-- RLS policies for system_diagnostics
CREATE POLICY "Org users can view their diagnostics"
ON public.system_diagnostics
FOR SELECT
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can manage their diagnostics"
ON public.system_diagnostics
FOR ALL
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

-- Indexes for performance
CREATE INDEX idx_audit_logs_org ON public.audit_logs(organization_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_system_diagnostics_org ON public.system_diagnostics(organization_id);
CREATE INDEX idx_system_diagnostics_executed ON public.system_diagnostics(executed_at DESC);