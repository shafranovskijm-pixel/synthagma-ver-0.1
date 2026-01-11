-- Create table for tracking organization usage
CREATE TABLE public.organization_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_bytes BIGINT NOT NULL DEFAULT 0,
  ai_tokens_used BIGINT NOT NULL DEFAULT 0,
  month_start DATE NOT NULL DEFAULT date_trunc('month', now())::date,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, month_start)
);

-- Enable RLS
ALTER TABLE public.organization_usage ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can view all organization usage" 
ON public.organization_usage 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_roles.user_id = auth.uid() 
  AND user_roles.role = 'admin'
));

CREATE POLICY "Admins can update organization usage" 
ON public.organization_usage 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_roles.user_id = auth.uid() 
  AND user_roles.role = 'admin'
));

CREATE POLICY "Organizations can view their own usage" 
ON public.organization_usage 
FOR SELECT 
USING (organization_id IN (
  SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_organization_usage_updated_at
BEFORE UPDATE ON public.organization_usage
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();