-- Function to update labor safety record status when course is completed
CREATE OR REPLACE FUNCTION public.update_labor_safety_on_course_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only process when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
    -- Find labor safety profile for this user
    -- and update the linked labor_safety_record
    UPDATE labor_safety_records lsr
    SET is_passed = true,
        exam_date = COALESCE(lsr.exam_date, CURRENT_DATE::text)
    FROM labor_safety_profiles lsp
    WHERE lsp.user_id = NEW.user_id
      AND lsp.record_id = lsr.id
      AND lsr.is_passed = false;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on enrollments table
DROP TRIGGER IF EXISTS on_course_completion_update_labor_safety ON enrollments;

CREATE TRIGGER on_course_completion_update_labor_safety
  AFTER UPDATE ON enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_labor_safety_on_course_completion();