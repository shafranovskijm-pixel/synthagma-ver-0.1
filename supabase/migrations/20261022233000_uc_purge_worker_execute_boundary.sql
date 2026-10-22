-- Containment only: a 30-day trash age is not a lawful retention or destruction decision.
-- Do not execute the purge or restart any scheduler. Keep existing trusted grants unchanged.
REVOKE EXECUTE ON FUNCTION public.purge_recycle_bin_30d() FROM PUBLIC, anon, authenticated;
