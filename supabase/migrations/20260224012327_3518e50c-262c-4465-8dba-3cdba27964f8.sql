
-- Fix: Set search_path on sync_storage_limit_on_plan_change function
CREATE OR REPLACE FUNCTION public.sync_storage_limit_on_plan_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan THEN
    NEW.storage_limit_bytes := CASE NEW.subscription_plan
      WHEN 'free' THEN 104857600
      WHEN 'start' THEN 1073741824
      WHEN 'standard' THEN 5368709120
      WHEN 'professional' THEN 21474836480
      WHEN 'maximum' THEN 107374182400
      ELSE 104857600
    END;
  END IF;
  RETURN NEW;
END;
$function$;
