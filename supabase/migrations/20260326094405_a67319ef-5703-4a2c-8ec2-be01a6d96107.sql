
-- Update apply_plan_features_on_change: enable ALL categories for ALL plans
CREATE OR REPLACE FUNCTION public.apply_plan_features_on_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  all_categories TEXT[] := ARRAY['courses','students','companies','documents',
    'journals','frdo','links','library','services','settings','student_cabinet','labor_safety','webinars'];
  cat TEXT;
BEGIN
  IF NEW.subscription_plan IS NOT DISTINCT FROM OLD.subscription_plan THEN
    RETURN NEW;
  END IF;

  -- All categories enabled for all plans
  FOREACH cat IN ARRAY all_categories LOOP
    INSERT INTO organization_feature_categories (organization_id, category_id, is_enabled)
    VALUES (NEW.id, cat, true)
    ON CONFLICT (organization_id, category_id)
    DO UPDATE SET is_enabled = true;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Update apply_free_plan_features: enable ALL categories
CREATE OR REPLACE FUNCTION public.apply_free_plan_features(org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  all_categories TEXT[] := ARRAY['courses','students','companies','documents',
    'journals','frdo','links','library','services','settings','student_cabinet','labor_safety','webinars'];
  cat TEXT;
BEGIN
  FOREACH cat IN ARRAY all_categories LOOP
    INSERT INTO public.organization_feature_categories (organization_id, category_id, is_enabled)
    VALUES (org_id, cat, true)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$function$;

-- Fix existing organizations: enable all categories
UPDATE organization_feature_categories SET is_enabled = true;
