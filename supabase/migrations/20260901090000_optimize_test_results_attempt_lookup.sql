-- The test-results RPC finds the latest attempt for every (user, lesson) pair
-- and also groups attempts by the same keys. The earlier two-column index
-- omitted lesson_id, forcing extra sorting/scanning as an organization report
-- traversed multiple courses.
CREATE INDEX IF NOT EXISTS idx_test_attempts_user_lesson_completed
  ON public.test_attempts (user_id, lesson_id, completed_at DESC);
