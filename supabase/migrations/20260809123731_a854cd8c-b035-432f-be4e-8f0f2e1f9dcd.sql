-- Supabase may retain an explicit function grant for anon even after the
-- PUBLIC grant is revoked. Keep this settings RPC authenticated-only.

REVOKE EXECUTE ON FUNCTION public.set_mailing_sender_warmup(uuid, boolean, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_mailing_sender_warmup(uuid, boolean, integer) FROM anon;