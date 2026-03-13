CREATE TABLE public.generation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  course_title text NOT NULL,
  action text NOT NULL,
  details text,
  items_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.generation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage generation_history"
  ON public.generation_history FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);