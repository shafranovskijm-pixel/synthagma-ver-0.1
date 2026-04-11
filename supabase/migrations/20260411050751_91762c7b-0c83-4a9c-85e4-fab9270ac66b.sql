
CREATE OR REPLACE FUNCTION public.update_labor_safety_on_course_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
    UPDATE labor_safety_records lsr
    SET is_passed = true,
        exam_date = CASE WHEN lsr.exam_date IS NULL THEN CURRENT_DATE::text ELSE lsr.exam_date END
    FROM labor_safety_profiles lsp
    WHERE lsp.user_id = NEW.user_id
      AND lsp.record_id = lsr.id
      AND lsr.is_passed = false;
  END IF;
  RETURN NEW;
END;
$function$;
