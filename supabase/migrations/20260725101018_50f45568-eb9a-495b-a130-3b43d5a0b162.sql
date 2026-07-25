
-- 1. Дедуп-лог для уведомлений
CREATE TABLE IF NOT EXISTS public.notification_dedup_log (
  key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.notification_dedup_log TO service_role;
ALTER TABLE public.notification_dedup_log ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated/anon — только service_role пишет/читает.
CREATE POLICY "service_role manages dedup log"
  ON public.notification_dedup_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_notif_dedup_created_at ON public.notification_dedup_log(created_at);

-- 2. Контактный email в профиле (для учеников с login@student.local)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- 3. Расширенная авторизация в set_student_blocked
CREATE OR REPLACE FUNCTION public.set_student_blocked(
  _target_user_id UUID,
  _blocked BOOLEAN,
  _reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller UUID := auth.uid();
  _target_org UUID;
  _is_authorized BOOLEAN := FALSE;
  _caller_role app_role;
  _caller_org UUID;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Не авторизован' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id INTO _target_org
  FROM public.profiles WHERE user_id = _target_user_id;

  -- Platform admin
  IF public.has_role(_caller, 'admin'::app_role) THEN
    _is_authorized := TRUE;
  END IF;

  -- Org owner (профиль с ролью 'organization' и той же организацией)
  IF NOT _is_authorized AND _target_org IS NOT NULL THEN
    SELECT ur.role, p.organization_id INTO _caller_role, _caller_org
      FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
     WHERE ur.user_id = _caller
     LIMIT 1;
    IF _caller_role = 'organization'::app_role AND _caller_org = _target_org THEN
      _is_authorized := TRUE;
    END IF;
  END IF;

  -- Org staff с правом students.manage
  IF NOT _is_authorized AND _target_org IS NOT NULL
     AND public.has_org_staff_permission(_caller, _target_org, 'students.manage') THEN
    _is_authorized := TRUE;
  END IF;

  IF NOT _is_authorized THEN
    RAISE EXCEPTION 'Недостаточно прав для блокировки этого пользователя'
      USING ERRCODE = '42501';
  END IF;

  IF _blocked THEN
    UPDATE public.profiles
       SET blocked_at = now(),
           blocked_reason = _reason,
           blocked_by = _caller,
           updated_at = now()
     WHERE user_id = _target_user_id;
  ELSE
    UPDATE public.profiles
       SET blocked_at = NULL,
           blocked_reason = NULL,
           blocked_by = NULL,
           updated_at = now()
     WHERE user_id = _target_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_student_blocked(UUID, BOOLEAN, TEXT) TO authenticated;

-- 4. Idempotent claim helper — атомарно возвращает true, если ключ был свободен
CREATE OR REPLACE FUNCTION public.claim_notification_dedup(_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted BOOLEAN;
BEGIN
  INSERT INTO public.notification_dedup_log(key)
  VALUES (_key)
  ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS _inserted = ROW_COUNT;
  RETURN _inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_notification_dedup(TEXT) TO service_role;
