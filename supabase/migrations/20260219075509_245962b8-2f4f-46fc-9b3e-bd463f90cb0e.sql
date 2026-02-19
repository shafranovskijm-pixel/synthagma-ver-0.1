
-- 1. Trigger function to sync storage_limit_bytes on plan change
CREATE OR REPLACE FUNCTION sync_storage_limit_on_plan_change()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_storage_limit
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION sync_storage_limit_on_plan_change();

-- 2. Fix all existing organizations
UPDATE public.organizations SET storage_limit_bytes = CASE subscription_plan
  WHEN 'free' THEN 104857600
  WHEN 'start' THEN 1073741824
  WHEN 'standard' THEN 5368709120
  WHEN 'professional' THEN 21474836480
  WHEN 'maximum' THEN 107374182400
  ELSE 104857600
END;

-- 3. Update default for new orgs (free plan default)
ALTER TABLE public.organizations ALTER COLUMN storage_limit_bytes SET DEFAULT 104857600;
