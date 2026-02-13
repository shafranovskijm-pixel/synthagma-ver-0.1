
-- 1. Add subscription_plan column to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'free';

-- 2. Create apply_free_plan_features function
CREATE OR REPLACE FUNCTION public.apply_free_plan_features(org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  categories TEXT[] := ARRAY['courses', 'students', 'companies', 'documents', 'journals', 'frdo', 'links', 'library', 'services', 'settings', 'student_cabinet'];
  enabled_cats TEXT[] := ARRAY['courses', 'students', 'settings', 'student_cabinet'];
  cat TEXT;
BEGIN
  -- Insert feature categories for free plan
  FOREACH cat IN ARRAY categories LOOP
    INSERT INTO public.organization_feature_categories (organization_id, category_id, is_enabled)
    VALUES (org_id, cat, cat = ANY(enabled_cats))
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Disable AI generation feature
  INSERT INTO public.organization_features (organization_id, feature_id, category_id, is_enabled)
  VALUES (org_id, 'courses_ai', 'courses', false)
  ON CONFLICT DO NOTHING;
END;
$function$;

-- 3. Update create_organization (5 params version)
CREATE OR REPLACE FUNCTION public.create_organization(p_name text, p_email text, p_phone text DEFAULT NULL::text, p_inn text DEFAULT NULL::text, p_contact_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'User already belongs to an organization';
  END IF;

  INSERT INTO public.organizations (name, email, phone, inn, contact_name, subscription_plan, tariff_type, is_paid, ai_enabled, storage_limit_bytes, ai_tokens_limit)
  VALUES (p_name, p_email, p_phone, p_inn, p_contact_name, 'free', 'free', false, false, 104857600, 0)
  RETURNING id INTO new_id;

  PERFORM apply_free_plan_features(new_id);
  
  RETURN new_id;
END;
$function$;

-- 4. Update create_organization (9 params version)
CREATE OR REPLACE FUNCTION public.create_organization(p_name text, p_email text, p_phone text DEFAULT NULL::text, p_inn text DEFAULT NULL::text, p_contact_name text DEFAULT NULL::text, p_kpp text DEFAULT NULL::text, p_ogrn text DEFAULT NULL::text, p_legal_address text DEFAULT NULL::text, p_director_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'User already belongs to an organization';
  END IF;

  INSERT INTO public.organizations (name, email, phone, inn, contact_name, kpp, ogrn, legal_address, director_name, subscription_plan, tariff_type, is_paid, ai_enabled, storage_limit_bytes, ai_tokens_limit)
  VALUES (p_name, p_email, p_phone, p_inn, p_contact_name, p_kpp, p_ogrn, p_legal_address, p_director_name, 'free', 'free', false, false, 104857600, 0)
  RETURNING id INTO new_id;

  PERFORM apply_free_plan_features(new_id);
  
  RETURN new_id;
END;
$function$;
