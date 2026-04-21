
-- 1. enrollment_requests: добавить поля для UTM, источника лида и кастомных значений из формы
ALTER TABLE public.enrollment_requests
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS utm jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_fields jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS landing_referrer text;

-- 2. organizations: добавить поля Telegram-уведомлений (без передачи токена в открытом виде)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS telegram_notify_chat_id text,
  ADD COLUMN IF NOT EXISTS telegram_notify_enabled boolean NOT NULL DEFAULT false;

-- 3. profiles: добавить телефон и метаинформацию о лиде (если нет)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS lead_utm jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.telegram_notify_chat_id IS 'Чат-ID пользователя или группы для уведомлений через @SintagmaNotificationsBot';
COMMENT ON COLUMN public.enrollment_requests.extra_fields IS 'Дополнительные значения из кастомизированной формы лендинга';
