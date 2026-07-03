ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS review_flag text NOT NULL DEFAULT 'none'
    CHECK (review_flag IN ('none','important','example','dispute','complaint')),
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_call_logs_review_flag
  ON public.call_logs (review_flag)
  WHERE review_flag <> 'none';

CREATE INDEX IF NOT EXISTS idx_call_logs_started_desc
  ON public.call_logs (started_at DESC);

DROP POLICY IF EXISTS "call_logs_admin_review_update" ON public.call_logs;
CREATE POLICY "call_logs_admin_review_update"
  ON public.call_logs FOR UPDATE
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));