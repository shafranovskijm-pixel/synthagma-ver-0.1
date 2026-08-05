ALTER TABLE public.mailing_senders
  ADD COLUMN IF NOT EXISTS preset_key text,
  ADD COLUMN IF NOT EXISTS smtp_error_category text,
  ADD COLUMN IF NOT EXISTS imap_error_category text,
  ADD COLUMN IF NOT EXISTS smtp_latency_ms int,
  ADD COLUMN IF NOT EXISTS imap_latency_ms int,
  ADD COLUMN IF NOT EXISTS imap_last_tested_at timestamptz;

GRANT SELECT (
  preset_key, smtp_error_category, imap_error_category,
  smtp_latency_ms, imap_latency_ms, imap_last_tested_at
) ON public.mailing_senders TO authenticated;

CREATE OR REPLACE FUNCTION public.get_mailing_sender_secret(p_sender_id uuid)
RETURNS TABLE(
  organization_id uuid,
  from_email text,
  from_name text,
  smtp_host text,
  smtp_port int,
  smtp_security text,
  smtp_username text,
  imap_host text,
  imap_port int,
  imap_security text,
  imap_username text,
  secret text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    s.organization_id,
    s.from_email,
    s.from_name,
    s.smtp_host,
    s.smtp_port,
    s.smtp_security,
    s.smtp_username,
    s.imap_host,
    s.imap_port,
    s.imap_security,
    COALESCE(NULLIF(s.imap_username, ''), s.smtp_username),
    CASE
      WHEN s.password_encrypted IS NULL OR s.password_encrypted = '' THEN NULL
      ELSE public.decrypt_password(s.password_encrypted)
    END
  FROM public.mailing_senders s
  WHERE s.id = p_sender_id;
$$;

REVOKE ALL ON FUNCTION public.get_mailing_sender_secret(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_mailing_sender_secret(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_mailing_sender_secret(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_mailing_sender_secret(uuid) TO service_role;