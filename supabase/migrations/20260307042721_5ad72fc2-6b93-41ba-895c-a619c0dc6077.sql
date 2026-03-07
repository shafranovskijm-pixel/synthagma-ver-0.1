
-- Table for tracking server-side pipeline runs
CREATE TABLE public.pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  course_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_index INTEGER NOT NULL DEFAULT 0,
  total_courses INTEGER NOT NULL DEFAULT 0,
  current_phase TEXT DEFAULT '',
  completed_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB DEFAULT NULL,
  enable_verification BOOLEAN DEFAULT FALSE,
  prompts JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "admin_all_pipeline_runs" ON public.pipeline_runs
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()))
  WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

-- Users can see their own runs
CREATE POLICY "own_pipeline_runs_select" ON public.pipeline_runs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Enable realtime for polling
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_runs;
