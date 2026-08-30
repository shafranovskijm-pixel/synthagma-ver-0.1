-- claim_notification_dedup is a SECURITY DEFINER helper used only by trusted
-- Edge Functions. PostgreSQL grants EXECUTE on new functions to PUBLIC by
-- default, so an explicit service-role-only boundary is required.
REVOKE EXECUTE ON FUNCTION public.claim_notification_dedup(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_notification_dedup(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_notification_dedup(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_dedup(TEXT) TO service_role;
