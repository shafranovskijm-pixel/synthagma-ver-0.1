BEGIN;

-- Retire the legacy auth hook that granted roles from fixed demo identities.
DROP TRIGGER IF EXISTS on_demo_account_created ON auth.users;

-- Neutralize the function first. If another unknown dependency still refers to
-- it, that dependency becomes a harmless no-op instead of retaining role writes.
CREATE OR REPLACE FUNCTION public.assign_demo_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;

-- Prefer removing the retired function. Unexpected dependencies must remain
-- visible for a follow-up migration, while the function is fail-closed above.
DO $containment$
BEGIN
  BEGIN
    DROP FUNCTION IF EXISTS public.assign_demo_role();
  EXCEPTION
    WHEN dependent_objects_still_exist THEN
      RAISE NOTICE 'assign_demo_role retained as a no-op because dependencies remain';
  END;
END;
$containment$;

COMMIT;
