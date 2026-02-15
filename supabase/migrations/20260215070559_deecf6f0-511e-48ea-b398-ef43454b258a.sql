-- Fix: add WITH CHECK to the ALL policy for lesson_progress
DROP POLICY IF EXISTS "Users can manage own progress" ON public.lesson_progress;

CREATE POLICY "Users can manage own progress"
ON public.lesson_progress
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());