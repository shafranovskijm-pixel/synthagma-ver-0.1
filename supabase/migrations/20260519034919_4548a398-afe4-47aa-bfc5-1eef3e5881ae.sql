-- =========================
-- client_error_logs: автологирование сетевых ошибок клиентов
-- =========================

CREATE TABLE IF NOT EXISTS public.client_error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Request info
  method TEXT,
  url_host TEXT,
  url_path TEXT,
  status INTEGER,
  error_kind TEXT NOT NULL, -- 'http_4xx' | 'http_5xx' | 'network_error' | 'cors_error' | 'timeout' | 'aborted'
  error_message TEXT,
  response_snippet TEXT,
  response_content_type TEXT,
  duration_ms INTEGER,

  -- Context
  user_id UUID,
  organization_id UUID,
  page_url TEXT,
  page_route TEXT,
  user_agent TEXT,
  proxy_used BOOLEAN DEFAULT false,
  app_version TEXT,
  client_ip TEXT,

  -- Dedup
  occurrence_count INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_occurred_at ON public.client_error_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_error_logs_error_kind ON public.client_error_logs (error_kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_error_logs_status ON public.client_error_logs (status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_error_logs_organization ON public.client_error_logs (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_error_logs_user ON public.client_error_logs (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_error_logs_host ON public.client_error_logs (url_host, occurred_at DESC);

ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;

-- INSERT только через edge function (service role) — клиентам запрещено
CREATE POLICY "client_error_logs_admin_select"
  ON public.client_error_logs
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_admin_staff_role(auth.uid(), 'super_admin')
    OR public.has_admin_staff_role(auth.uid(), 'admin')
  );

-- Очистка старше 30 дней
CREATE OR REPLACE FUNCTION public.cleanup_client_error_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.client_error_logs
  WHERE occurred_at < now() - INTERVAL '30 days';
$$;

COMMENT ON TABLE public.client_error_logs IS 'Автологирование сетевых ошибок клиентов (CORS, 4xx/5xx, network failures). Заполняется edge function log-client-error. Хранится 30 дней.';