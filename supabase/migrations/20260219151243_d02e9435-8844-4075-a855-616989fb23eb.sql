
-- 1. Trigger function to sync feature categories on plan change
CREATE OR REPLACE FUNCTION public.apply_plan_features_on_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  plan_categories TEXT[];
  all_categories TEXT[] := ARRAY['courses','students','companies','documents',
    'journals','frdo','links','library','services','settings','student_cabinet','labor_safety'];
  cat TEXT;
BEGIN
  IF NEW.subscription_plan IS NOT DISTINCT FROM OLD.subscription_plan THEN
    RETURN NEW;
  END IF;

  plan_categories := CASE NEW.subscription_plan
    WHEN 'free' THEN ARRAY['courses','students','services','settings','student_cabinet']
    WHEN 'start' THEN ARRAY['courses','students','companies','links','services','settings','student_cabinet']
    WHEN 'standard' THEN ARRAY['courses','students','companies','links','services','settings','student_cabinet']
    WHEN 'professional' THEN ARRAY['courses','students','companies','documents','journals','links','library','services','settings','student_cabinet','labor_safety']
    WHEN 'maximum' THEN ARRAY['courses','students','companies','documents','journals','frdo','links','library','services','settings','student_cabinet','labor_safety']
    ELSE ARRAY['courses','students','settings','student_cabinet']
  END;

  FOREACH cat IN ARRAY all_categories LOOP
    INSERT INTO organization_feature_categories (organization_id, category_id, is_enabled)
    VALUES (NEW.id, cat, cat = ANY(plan_categories))
    ON CONFLICT (organization_id, category_id)
    DO UPDATE SET is_enabled = (cat = ANY(plan_categories));
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_plan_features
  AFTER UPDATE OF subscription_plan ON organizations
  FOR EACH ROW EXECUTE FUNCTION apply_plan_features_on_change();

-- 2. One-time fix: sync all existing organizations
DO $$
DECLARE
  org RECORD;
  plan_categories TEXT[];
  all_categories TEXT[] := ARRAY['courses','students','companies','documents',
    'journals','frdo','links','library','services','settings','student_cabinet','labor_safety'];
  cat TEXT;
BEGIN
  FOR org IN SELECT id, COALESCE(subscription_plan, 'free') as plan FROM organizations LOOP
    plan_categories := CASE org.plan
      WHEN 'free' THEN ARRAY['courses','students','services','settings','student_cabinet']
      WHEN 'start' THEN ARRAY['courses','students','companies','links','services','settings','student_cabinet']
      WHEN 'standard' THEN ARRAY['courses','students','companies','links','services','settings','student_cabinet']
      WHEN 'professional' THEN ARRAY['courses','students','companies','documents','journals','links','library','services','settings','student_cabinet','labor_safety']
      WHEN 'maximum' THEN ARRAY['courses','students','companies','documents','journals','frdo','links','library','services','settings','student_cabinet','labor_safety']
      ELSE ARRAY['courses','students','settings','student_cabinet']
    END;

    FOREACH cat IN ARRAY all_categories LOOP
      INSERT INTO organization_feature_categories (organization_id, category_id, is_enabled)
      VALUES (org.id, cat, cat = ANY(plan_categories))
      ON CONFLICT (organization_id, category_id)
      DO UPDATE SET is_enabled = (cat = ANY(plan_categories));
    END LOOP;
  END LOOP;
END;
$$;
