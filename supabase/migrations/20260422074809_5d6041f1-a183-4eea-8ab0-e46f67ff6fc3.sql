
-- Закрываем утечку: убираем публичный доступ к КП.
-- Сейчас политика разрешает анонимам читать ВСЕ proposals в статусе 'sent' — утечка ИНН/сумм/контактов.
-- В таблице нет public_token, поэтому самый безопасный вариант — удалить политику.
-- Если в будущем понадобится публичный просмотр КП по ссылке, нужно будет добавить public_token и edge-функцию.
DROP POLICY IF EXISTS "Public can view sent proposals" ON public.commercial_proposals;

-- Флаг ручной паузы для рассылок: cron не должен возобновлять кампании,
-- которые пользователь поставил на паузу вручную.
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS user_paused boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_email_campaigns_paused_resume
  ON public.email_campaigns(status, user_paused)
  WHERE status = 'paused';
