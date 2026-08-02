CREATE OR REPLACE FUNCTION public.sync_frdo_name_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
  new_last text;
  new_first text;
  new_middle text;
  old_parts text[];
  old_last text;
  old_first text;
  old_middle text;
BEGIN
  IF NEW.full_name IS NULL OR btrim(NEW.full_name) = '' THEN
    RETURN NEW;
  END IF;
  IF OLD.full_name IS NOT DISTINCT FROM NEW.full_name THEN
    RETURN NEW;
  END IF;

  parts := regexp_split_to_array(btrim(NEW.full_name), '\s+');
  new_last := COALESCE(parts[1], '');
  new_first := COALESCE(parts[2], '');
  new_middle := COALESCE(parts[3], '');

  old_parts := regexp_split_to_array(btrim(COALESCE(OLD.full_name, '')), '\s+');
  old_last := COALESCE(old_parts[1], '');
  old_first := COALESCE(old_parts[2], '');
  old_middle := COALESCE(old_parts[3], '');

  UPDATE public.student_frdo_data f
  SET
    last_name = CASE WHEN COALESCE(f.last_name, '') IN ('', old_last) THEN new_last ELSE f.last_name END,
    first_name = CASE WHEN COALESCE(f.first_name, '') IN ('', old_first) THEN new_first ELSE f.first_name END,
    middle_name = CASE WHEN COALESCE(f.middle_name, '') IN ('', old_middle) THEN new_middle ELSE f.middle_name END,
    updated_at = now()
  WHERE f.user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_frdo_name_from_profile ON public.profiles;
CREATE TRIGGER trg_sync_frdo_name_from_profile
AFTER UPDATE OF full_name ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_frdo_name_from_profile();