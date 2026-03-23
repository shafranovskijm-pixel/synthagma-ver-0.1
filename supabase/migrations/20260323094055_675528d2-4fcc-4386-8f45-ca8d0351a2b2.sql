
-- 1. Fix apply_free_plan_features: add 'services' to enabled_cats
CREATE OR REPLACE FUNCTION public.apply_free_plan_features(org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  categories TEXT[] := ARRAY['courses', 'students', 'companies', 'documents', 'journals', 'frdo', 'links', 'library', 'services', 'settings', 'student_cabinet'];
  enabled_cats TEXT[] := ARRAY['courses', 'students', 'services', 'settings', 'student_cabinet'];
  cat TEXT;
BEGIN
  FOREACH cat IN ARRAY categories LOOP
    INSERT INTO public.organization_feature_categories (organization_id, category_id, is_enabled)
    VALUES (org_id, cat, cat = ANY(enabled_cats))
    ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public.organization_features (organization_id, feature_id, category_id, is_enabled)
  VALUES (org_id, 'courses_ai', 'courses', false)
  ON CONFLICT DO NOTHING;
END;
$function$;

-- 2. Enable 'services' for ALL existing organizations
UPDATE public.organization_feature_categories
SET is_enabled = true
WHERE category_id = 'services';
