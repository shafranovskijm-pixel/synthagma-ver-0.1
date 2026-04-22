
-- =========================================================================
-- ИТЕРАЦИЯ 1: безопасность вебинаров
-- =========================================================================

-- ---- 1. Перепишем INSERT-политики для anon (chat / questions / poll_votes) ----

-- chat
DROP POLICY IF EXISTS "Guests can chat in public webinars" ON public.webinar_chat_messages;
CREATE POLICY "Guests can chat in public webinars"
ON public.webinar_chat_messages
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.webinars w
    WHERE w.id = webinar_chat_messages.webinar_id
      AND w.allow_guests = true
      AND w.status = 'live'
  )
  AND is_guest = true
  AND is_host = false
);

-- questions
DROP POLICY IF EXISTS "Anon can ask in public webinars" ON public.webinar_questions;
CREATE POLICY "Anon can ask in public webinars"
ON public.webinar_questions
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.webinars w
    WHERE w.id = webinar_questions.webinar_id
      AND w.allow_guests = true
      AND w.status = 'live'
  )
  AND answered = false
);

-- poll votes
DROP POLICY IF EXISTS "Anon can vote in public polls" ON public.webinar_poll_votes;
CREATE POLICY "Anon can vote in public polls"
ON public.webinar_poll_votes
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.webinar_polls p
    JOIN public.webinars w ON w.id = p.webinar_id
    WHERE p.id = webinar_poll_votes.poll_id
      AND p.status = 'open'
      AND w.allow_guests = true
      AND w.status = 'live'
  )
);

-- Авторизованным голосовать в закрытом опросе тоже нельзя
DROP POLICY IF EXISTS "Auth can vote in accessible polls" ON public.webinar_poll_votes;
CREATE POLICY "Auth can vote in accessible polls"
ON public.webinar_poll_votes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.webinar_polls p
    JOIN public.webinars w ON w.id = p.webinar_id
    WHERE p.id = webinar_poll_votes.poll_id
      AND p.status = 'open'
      AND (
        has_role('admin'::app_role, auth.uid())
        OR w.organization_id = current_organization_id()
        OR EXISTS (SELECT 1 FROM public.webinar_participants wp WHERE wp.webinar_id = w.id AND wp.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.enrollments e WHERE e.course_id = w.course_id AND e.user_id = auth.uid())
      )
  )
);

-- ---- 2. UNIQUE для голосов: один identity = один голос в опросе ----
-- Сначала чистим возможные дубли (оставляем самый ранний)
DELETE FROM public.webinar_poll_votes a
USING public.webinar_poll_votes b
WHERE a.poll_id = b.poll_id
  AND a.voter_identity = b.voter_identity
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS webinar_poll_votes_poll_voter_uniq
ON public.webinar_poll_votes (poll_id, voter_identity);

-- ---- 3. Шифрование webinars.guest_password ----
-- Триггер шифрования по тому же стандарту ENC:
CREATE OR REPLACE FUNCTION public.trigger_encrypt_webinar_guest_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.guest_password IS NOT NULL AND NEW.guest_password <> '' AND NOT (NEW.guest_password LIKE 'ENC:%') THEN
    NEW.guest_password := encrypt_password(NEW.guest_password);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encrypt_webinar_guest_password_trg ON public.webinars;
CREATE TRIGGER encrypt_webinar_guest_password_trg
BEFORE INSERT OR UPDATE OF guest_password ON public.webinars
FOR EACH ROW
EXECUTE FUNCTION public.trigger_encrypt_webinar_guest_password();

-- Зашифровать существующие открытые пароли
UPDATE public.webinars
SET guest_password = encrypt_password(guest_password)
WHERE guest_password IS NOT NULL
  AND guest_password <> ''
  AND guest_password NOT LIKE 'ENC:%';

-- RPC для проверки пароля гостя из edge-функции
CREATE OR REPLACE FUNCTION public.verify_webinar_guest_password(p_public_token text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored text;
BEGIN
  SELECT guest_password INTO v_stored
  FROM public.webinars
  WHERE public_token = p_public_token
  LIMIT 1;

  IF v_stored IS NULL OR v_stored = '' THEN
    RETURN true; -- пароль не задан — пускаем
  END IF;

  RETURN decrypt_password(v_stored) = COALESCE(p_password, '');
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_webinar_guest_password(text, text) TO anon, authenticated, service_role;

-- ---- 4. Rate-limit для чата и вопросов ----
CREATE TABLE IF NOT EXISTS public.webinar_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id uuid NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  identity text NOT NULL,
  action text NOT NULL,                      -- 'chat' | 'question'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webinar_rate_limits_window_idx
ON public.webinar_rate_limits (webinar_id, identity, action, created_at DESC);

ALTER TABLE public.webinar_rate_limits ENABLE ROW LEVEL SECURITY;

-- Никто из клиентов не должен напрямую читать/писать — всё через SECURITY DEFINER функции
DROP POLICY IF EXISTS "deny all" ON public.webinar_rate_limits;
CREATE POLICY "deny all" ON public.webinar_rate_limits
FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);

-- Функция проверки и инкремента лимита
CREATE OR REPLACE FUNCTION public._webinar_rate_check(
  p_webinar_id uuid,
  p_identity text,
  p_action text,
  p_max integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.webinar_rate_limits
  WHERE webinar_id = p_webinar_id
    AND identity = p_identity
    AND action = p_action
    AND created_at > now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO public.webinar_rate_limits (webinar_id, identity, action)
  VALUES (p_webinar_id, p_identity, p_action);

  -- мягкая чистка старых записей (5 мин)
  DELETE FROM public.webinar_rate_limits
  WHERE webinar_id = p_webinar_id
    AND identity = p_identity
    AND action = p_action
    AND created_at < now() - interval '5 minutes';

  RETURN true;
END;
$$;

-- RPC для отправки сообщения в чат с лимитом 10 / 60с
CREATE OR REPLACE FUNCTION public.webinar_post_chat(
  p_webinar_id uuid,
  p_sender_identity text,
  p_sender_name text,
  p_content text,
  p_is_guest boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_allowed boolean;
  v_webinar RECORD;
BEGIN
  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION 'Empty message';
  END IF;
  IF length(p_content) > 2000 THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  SELECT id, allow_guests, status, organization_id, course_id
  INTO v_webinar FROM public.webinars WHERE id = p_webinar_id;
  IF v_webinar.id IS NULL THEN RAISE EXCEPTION 'Webinar not found'; END IF;

  -- Гости — только публичные live
  IF p_is_guest THEN
    IF NOT v_webinar.allow_guests OR v_webinar.status <> 'live' THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  ELSE
    -- Авторизованные: должен иметь доступ
    IF NOT (
      has_role('admin'::app_role, auth.uid())
      OR v_webinar.organization_id = current_organization_id()
      OR EXISTS (SELECT 1 FROM public.webinar_participants wp WHERE wp.webinar_id = v_webinar.id AND wp.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.enrollments e WHERE e.course_id = v_webinar.course_id AND e.user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  v_allowed := public._webinar_rate_check(p_webinar_id, p_sender_identity, 'chat', 10, 60);
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Rate limit: too many messages';
  END IF;

  INSERT INTO public.webinar_chat_messages
    (webinar_id, sender_identity, sender_name, is_host, is_guest, content)
  VALUES
    (p_webinar_id, p_sender_identity, COALESCE(NULLIF(trim(p_sender_name), ''), 'Гость'),
     false, COALESCE(p_is_guest, true), trim(p_content))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.webinar_post_chat(uuid, text, text, text, boolean) TO anon, authenticated;

-- RPC для вопроса с лимитом 5 / 60с
CREATE OR REPLACE FUNCTION public.webinar_post_question(
  p_webinar_id uuid,
  p_author_identity text,
  p_author_name text,
  p_question text,
  p_is_guest boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_allowed boolean;
  v_webinar RECORD;
BEGIN
  IF p_question IS NULL OR length(trim(p_question)) = 0 THEN
    RAISE EXCEPTION 'Empty question';
  END IF;
  IF length(p_question) > 1000 THEN
    RAISE EXCEPTION 'Question too long';
  END IF;

  SELECT id, allow_guests, status, organization_id, course_id
  INTO v_webinar FROM public.webinars WHERE id = p_webinar_id;
  IF v_webinar.id IS NULL THEN RAISE EXCEPTION 'Webinar not found'; END IF;

  IF p_is_guest THEN
    IF NOT v_webinar.allow_guests OR v_webinar.status <> 'live' THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  ELSE
    IF NOT (
      has_role('admin'::app_role, auth.uid())
      OR v_webinar.organization_id = current_organization_id()
      OR EXISTS (SELECT 1 FROM public.webinar_participants wp WHERE wp.webinar_id = v_webinar.id AND wp.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.enrollments e WHERE e.course_id = v_webinar.course_id AND e.user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  v_allowed := public._webinar_rate_check(p_webinar_id, p_author_identity, 'question', 5, 60);
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Rate limit: too many questions';
  END IF;

  INSERT INTO public.webinar_questions
    (webinar_id, author_identity, author_name, question, upvotes, answered)
  VALUES
    (p_webinar_id, p_author_identity, COALESCE(NULLIF(trim(p_author_name), ''), 'Гость'),
     trim(p_question), 0, false)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.webinar_post_question(uuid, text, text, text, boolean) TO anon, authenticated;

-- ---- 5. Realtime publication ----
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_chat_messages;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_questions;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_polls;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_poll_votes;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
