
-- 1. One-time sync: copy credentials from labor_safety_profiles to profiles where missing
UPDATE profiles p
SET login = lsp.login,
    generated_password = lsp.generated_password
FROM labor_safety_profiles lsp
WHERE lsp.user_id = p.user_id
  AND p.login IS NULL
  AND lsp.login IS NOT NULL;

-- 2. Trigger function for ongoing sync
CREATE OR REPLACE FUNCTION public.sync_labor_credentials_to_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.login IS NOT NULL AND NEW.user_id IS NOT NULL THEN
    UPDATE profiles
    SET login = NEW.login,
        generated_password = COALESCE(NEW.generated_password, profiles.generated_password)
    WHERE user_id = NEW.user_id
      AND (login IS NULL OR login != NEW.login);
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Trigger on labor_safety_profiles
CREATE TRIGGER trg_sync_labor_credentials
AFTER INSERT OR UPDATE OF login, generated_password
ON public.labor_safety_profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_labor_credentials_to_profiles();
