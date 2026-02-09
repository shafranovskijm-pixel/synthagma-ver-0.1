-- Fix course_requests public data exposure
-- Drop the overly permissive policy that allows anonymous access
DROP POLICY IF EXISTS "Anyone can view active course requests" ON course_requests;

-- Create policy that requires authentication to view active requests
CREATE POLICY "Authenticated users can view active requests"
ON course_requests FOR SELECT
TO authenticated
USING (status = 'active');

-- Users can always see their own requests (already exists but ensuring it's correct)
DROP POLICY IF EXISTS "Users can view own course requests" ON course_requests;
CREATE POLICY "Users can view own course requests"
ON course_requests FOR SELECT
USING (auth.uid() = user_id);