SELECT cron.schedule(
  'cleanup-client-error-logs-daily',
  '0 4 * * *',
  $$SELECT public.cleanup_client_error_logs();$$
);