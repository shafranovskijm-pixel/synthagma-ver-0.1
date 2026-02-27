
-- Create lesson_attachments table
CREATE TABLE public.lesson_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  category TEXT NOT NULL DEFAULT 'material',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookup by lesson
CREATE INDEX idx_lesson_attachments_lesson_id ON public.lesson_attachments(lesson_id);

-- Enable RLS
ALTER TABLE public.lesson_attachments ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user can read attachments
CREATE POLICY "Authenticated users can read lesson attachments"
ON public.lesson_attachments FOR SELECT
TO authenticated
USING (true);

-- Insert: organization owners can add attachments to their course lessons
CREATE POLICY "Organization owners can insert lesson attachments"
ON public.lesson_attachments FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.lessons l
    JOIN public.courses c ON c.id = l.course_id
    WHERE l.id = lesson_id
      AND c.organization_id = public.current_organization_id()
  )
);

-- Update: organization owners can update their attachments
CREATE POLICY "Organization owners can update lesson attachments"
ON public.lesson_attachments FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lessons l
    JOIN public.courses c ON c.id = l.course_id
    WHERE l.id = lesson_id
      AND c.organization_id = public.current_organization_id()
  )
);

-- Delete: organization owners can delete their attachments
CREATE POLICY "Organization owners can delete lesson attachments"
ON public.lesson_attachments FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lessons l
    JOIN public.courses c ON c.id = l.course_id
    WHERE l.id = lesson_id
      AND c.organization_id = public.current_organization_id()
  )
);
