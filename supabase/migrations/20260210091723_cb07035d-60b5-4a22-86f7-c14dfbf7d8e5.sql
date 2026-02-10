-- Fix: Set test_questions_for_students view to SECURITY INVOKER
-- This ensures RLS policies of the querying user are applied, not the view creator
ALTER VIEW public.test_questions_for_students SET (security_invoker = true);