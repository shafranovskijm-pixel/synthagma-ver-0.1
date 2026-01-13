-- Add payment and tariff tracking fields to organizations
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS paid_until timestamp with time zone,
ADD COLUMN IF NOT EXISTS tariff_type text DEFAULT 'trial' CHECK (tariff_type IN ('trial', 'monthly', 'yearly')),
ADD COLUMN IF NOT EXISTS monthly_price numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS enabled_features jsonb DEFAULT '[]'::jsonb;

-- Create table to track feature usage statistics
CREATE TABLE IF NOT EXISTS public.organization_feature_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_id text NOT NULL,
  usage_count integer NOT NULL DEFAULT 0,
  last_used_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(organization_id, feature_id)
);

-- Enable RLS
ALTER TABLE public.organization_feature_usage ENABLE ROW LEVEL SECURITY;

-- RLS policies for organization_feature_usage
CREATE POLICY "Admins can manage all feature usage"
ON public.organization_feature_usage
FOR ALL
USING (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Organizations can view their feature usage"
ON public.organization_feature_usage
FOR SELECT
USING (organization_id = current_organization_id());