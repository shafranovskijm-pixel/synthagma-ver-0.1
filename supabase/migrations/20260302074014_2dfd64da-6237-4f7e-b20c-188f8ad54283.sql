
-- Table to track individual AI generation requests per user
CREATE TABLE public.ai_usage_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  function_name TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_ai_usage_log_org ON public.ai_usage_log(organization_id);
CREATE INDEX idx_ai_usage_log_user ON public.ai_usage_log(user_id);
CREATE INDEX idx_ai_usage_log_created ON public.ai_usage_log(created_at DESC);

-- Enable RLS
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read
CREATE POLICY "Admins can read all ai_usage_log"
ON public.ai_usage_log FOR SELECT
USING (public.has_role('admin'::app_role, auth.uid()));

-- Service role inserts via edge functions, so allow inserts for authenticated users for their own records
CREATE POLICY "Users can insert own ai_usage_log"
ON public.ai_usage_log FOR INSERT
WITH CHECK (auth.uid() = user_id);
