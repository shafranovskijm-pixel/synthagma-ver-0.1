CREATE OR REPLACE FUNCTION public.sync_storage_limit_on_plan_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan THEN
    NEW.storage_limit_bytes := CASE NEW.subscription_plan
      WHEN 'free' THEN 104857600
      WHEN 'start' THEN 3221225472
      WHEN 'standard' THEN 10737418240
      WHEN 'professional' THEN 21474836480
      WHEN 'maximum' THEN 107374182400
      ELSE 104857600
    END;
  END IF;
  RETURN NEW;
END;
$function$;