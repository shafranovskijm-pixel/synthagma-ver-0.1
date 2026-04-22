-- Add public access columns to webinars
ALTER TABLE public.webinars
  ADD COLUMN IF NOT EXISTS public_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS allow_guests BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS guest_password TEXT;

-- Trigger to auto-generate public_token
CREATE OR REPLACE FUNCTION public.set_webinar_public_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.public_token IS NULL OR NEW.public_token = '' THEN
    NEW.public_token := encode(gen_random_bytes(16), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_webinar_public_token ON public.webinars;
CREATE TRIGGER trg_set_webinar_public_token
  BEFORE INSERT ON public.webinars
  FOR EACH ROW
  EXECUTE FUNCTION public.set_webinar_public_token();

-- Backfill existing rows
UPDATE public.webinars
SET public_token = encode(gen_random_bytes(16), 'hex')
WHERE public_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_webinars_public_token ON public.webinars(public_token);