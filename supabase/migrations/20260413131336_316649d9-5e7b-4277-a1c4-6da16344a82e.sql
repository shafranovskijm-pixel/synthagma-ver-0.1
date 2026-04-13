CREATE TABLE public.course_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(course_id, achievement_id)
);

ALTER TABLE public.course_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view course achievements"
ON public.course_achievements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Organization users can manage course achievements"
ON public.course_achievements FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM courses c
    JOIN profiles p ON p.organization_id = c.organization_id
    WHERE c.id = course_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Organization users can delete course achievements"
ON public.course_achievements FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM courses c
    JOIN profiles p ON p.organization_id = c.organization_id
    WHERE c.id = course_id AND p.user_id = auth.uid()
  )
);