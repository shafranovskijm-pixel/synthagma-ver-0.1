
-- Таблица связей с Яндекс ID
CREATE TABLE IF NOT EXISTS public.yandex_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  yandex_id TEXT NOT NULL UNIQUE,
  yandex_email TEXT,
  yandex_login TEXT,
  yandex_display_name TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.yandex_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own yandex identity"
  ON public.yandex_identities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own yandex identity"
  ON public.yandex_identities FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all yandex identities"
  ON public.yandex_identities FOR SELECT
  USING (has_role('admin'::app_role, auth.uid()));

-- Таблица одноразовых nonce для OAuth state
CREATE TABLE IF NOT EXISTS public.yandex_oauth_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('login', 'link', 'signup-org', 'signup-student')),
  current_user_id UUID,
  redirect_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ
);

ALTER TABLE public.yandex_oauth_nonces ENABLE ROW LEVEL SECURITY;

-- Только сервисный ключ работает с этой таблицей; пользовательских политик нет.

CREATE INDEX IF NOT EXISTS idx_yandex_nonces_nonce ON public.yandex_oauth_nonces(nonce);
CREATE INDEX IF NOT EXISTS idx_yandex_nonces_expires ON public.yandex_oauth_nonces(expires_at);
CREATE INDEX IF NOT EXISTS idx_yandex_identities_yandex_id ON public.yandex_identities(yandex_id);
