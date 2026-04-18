-- Add fields for signature method, handwritten scan storage, and final signed PDF cache
ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS signature_method TEXT NOT NULL DEFAULT 'pep',
  ADD COLUMN IF NOT EXISTS handwritten_scan_path TEXT,
  ADD COLUMN IF NOT EXISTS signed_document_path TEXT;

-- Validation trigger (avoid CHECK on new column to allow safe rollback)
CREATE OR REPLACE FUNCTION public.validate_signature_method()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.signature_method NOT IN ('pep', 'handwritten_scan') THEN
    RAISE EXCEPTION 'Invalid signature_method: %', NEW.signature_method;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_signature_method_trg ON public.document_signatures;
CREATE TRIGGER validate_signature_method_trg
BEFORE INSERT OR UPDATE OF signature_method ON public.document_signatures
FOR EACH ROW EXECUTE FUNCTION public.validate_signature_method();