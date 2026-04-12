-- Add access limitation columns to enrollments
ALTER TABLE public.enrollments 
  ADD COLUMN IF NOT EXISTS access_days integer,
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

-- Trigger to auto-calculate expires_at when access_days is set
CREATE OR REPLACE FUNCTION public.calc_enrollment_expires_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.access_days IS NOT NULL AND NEW.access_days > 0 THEN
    NEW.expires_at := NEW.started_at + (NEW.access_days || ' days')::interval;
  ELSIF NEW.access_days IS NULL THEN
    NEW.expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calc_enrollment_expires
  BEFORE INSERT OR UPDATE OF access_days, started_at
  ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.calc_enrollment_expires_at();