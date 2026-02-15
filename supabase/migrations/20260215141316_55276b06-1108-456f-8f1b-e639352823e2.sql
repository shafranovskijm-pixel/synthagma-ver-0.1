
CREATE TABLE public.marketplace_course_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_course_id uuid NOT NULL REFERENCES public.marketplace_courses(id) ON DELETE CASCADE,
  user_id uuid,
  author_name text NOT NULL DEFAULT 'Платформа Синтагма',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE marketplace_course_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view comments"
  ON marketplace_course_comments FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can add comments"
  ON marketplace_course_comments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete comments"
  ON marketplace_course_comments FOR DELETE
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Seed initial platform comment on all existing marketplace courses
INSERT INTO marketplace_course_comments (marketplace_course_id, author_name, content)
SELECT id, 'Платформа Синтагма', 'Могу доработать — пишите Ваши пожелания на каждый курс!'
FROM marketplace_courses;
