-- 1. Удаляем Яндекс-таблицы
DROP TABLE IF EXISTS public.yandex_identities CASCADE;
DROP TABLE IF EXISTS public.yandex_oauth_nonces CASCADE;

-- 2. Меняем дефолт источника вебинара на livekit
ALTER TABLE public.webinars ALTER COLUMN source_type SET DEFAULT 'livekit';

-- 3. Таблица сессий ИИ-преподавателя
CREATE TABLE public.ai_tutor_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID,
  room_name TEXT NOT NULL,
  topic TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  max_duration_seconds INTEGER NOT NULL DEFAULT 1500,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_tutor_sessions_user ON public.ai_tutor_sessions(user_id, started_at DESC);
CREATE INDEX idx_ai_tutor_sessions_org ON public.ai_tutor_sessions(organization_id, started_at DESC);

ALTER TABLE public.ai_tutor_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ai tutor sessions"
ON public.ai_tutor_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own ai tutor sessions"
ON public.ai_tutor_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own ai tutor sessions"
ON public.ai_tutor_sessions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Org managers view org ai tutor sessions"
ON public.ai_tutor_sessions FOR SELECT
USING (
  has_role('organization'::app_role, auth.uid())
  AND organization_id IS NOT NULL
  AND organization_id = current_organization_id()
);

CREATE POLICY "Admins view all ai tutor sessions"
ON public.ai_tutor_sessions FOR SELECT
USING (has_role('admin'::app_role, auth.uid()));

CREATE TRIGGER update_ai_tutor_sessions_updated_at
BEFORE UPDATE ON public.ai_tutor_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();