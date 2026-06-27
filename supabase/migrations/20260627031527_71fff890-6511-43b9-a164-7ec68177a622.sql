
-- ============================================================
-- 1) SIP-аккаунты Exolve для менеджеров
-- ============================================================
CREATE TABLE public.exolve_sip_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  sip_username    text NOT NULL,
  sip_password_enc bytea NOT NULL,
  caller_id_number text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exolve_sip_accounts TO authenticated;
GRANT ALL ON public.exolve_sip_accounts TO service_role;

ALTER TABLE public.exolve_sip_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exolve_sip_owner_select"
  ON public.exolve_sip_accounts FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "exolve_sip_admin_all"
  ON public.exolve_sip_accounts FOR ALL
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- 2) Журнал звонков
-- ============================================================
CREATE TABLE public.call_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction        text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  from_number      text,
  to_number        text NOT NULL,
  company_inn      text,
  company_name     text,
  lead_id          uuid,
  proposal_id      uuid,
  contract_id      uuid,
  status           text NOT NULL DEFAULT 'dialing' CHECK (status IN ('dialing','ringing','answered','no_answer','busy','failed','completed','canceled')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  answered_at      timestamptz,
  ended_at         timestamptz,
  duration_sec     integer,
  exolve_call_id   text,
  has_recording    boolean NOT NULL DEFAULT false,
  recording_duration_sec integer,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_logs_manager ON public.call_logs(manager_user_id, started_at DESC);
CREATE INDEX idx_call_logs_inn ON public.call_logs(company_inn, started_at DESC);
CREATE INDEX idx_call_logs_exolve_id ON public.call_logs(exolve_call_id) WHERE exolve_call_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_logs TO authenticated;
GRANT ALL ON public.call_logs TO service_role;

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_logs_manager_select"
  ON public.call_logs FOR SELECT
  USING (auth.uid() = manager_user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "call_logs_manager_insert"
  ON public.call_logs FOR INSERT
  WITH CHECK (auth.uid() = manager_user_id);

CREATE POLICY "call_logs_manager_update"
  ON public.call_logs FOR UPDATE
  USING (auth.uid() = manager_user_id OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = manager_user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "call_logs_admin_delete"
  ON public.call_logs FOR DELETE
  USING (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- 3) Аудит прослушиваний
-- ============================================================
CREATE TABLE public.call_log_listens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id     uuid NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  listener_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listened_at     timestamptz NOT NULL DEFAULT now(),
  user_agent      text
);

CREATE INDEX idx_call_log_listens_log ON public.call_log_listens(call_log_id, listened_at DESC);

GRANT SELECT, INSERT ON public.call_log_listens TO authenticated;
GRANT ALL ON public.call_log_listens TO service_role;

ALTER TABLE public.call_log_listens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_log_listens_admin_select"
  ON public.call_log_listens FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR listener_user_id = auth.uid());

CREATE POLICY "call_log_listens_insert"
  ON public.call_log_listens FOR INSERT
  WITH CHECK (listener_user_id = auth.uid());

-- ============================================================
-- 4) Триггер updated_at
-- ============================================================
CREATE TRIGGER trg_exolve_sip_accounts_updated
  BEFORE UPDATE ON public.exolve_sip_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_call_logs_updated
  BEFORE UPDATE ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5) Шифрование SIP-пароля
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_exolve_sip_credentials(
  _user_id uuid,
  _sip_username text,
  _sip_password text,
  _caller_id_number text DEFAULT NULL,
  _is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
  _id  uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  _key := current_setting('app.settings.encryption_key', true);
  IF _key IS NULL OR length(_key) = 0 THEN
    _key := 'sintagma-default-encryption-key-change-me';
  END IF;

  INSERT INTO public.exolve_sip_accounts (user_id, sip_username, sip_password_enc, caller_id_number, is_active, created_by)
  VALUES (_user_id, _sip_username, pgp_sym_encrypt(_sip_password, _key), _caller_id_number, _is_active, auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET sip_username = EXCLUDED.sip_username,
        sip_password_enc = EXCLUDED.sip_password_enc,
        caller_id_number = EXCLUDED.caller_id_number,
        is_active = EXCLUDED.is_active,
        updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_exolve_sip_credentials(_user_id uuid)
RETURNS TABLE (
  sip_username text,
  sip_password text,
  caller_id_number text,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
BEGIN
  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _key := current_setting('app.settings.encryption_key', true);
  IF _key IS NULL OR length(_key) = 0 THEN
    _key := 'sintagma-default-encryption-key-change-me';
  END IF;

  RETURN QUERY
  SELECT a.sip_username,
         pgp_sym_decrypt(a.sip_password_enc, _key)::text AS sip_password,
         a.caller_id_number,
         a.is_active
    FROM public.exolve_sip_accounts a
   WHERE a.user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_exolve_sip_credentials(uuid,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_exolve_sip_credentials(uuid,text,text,text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.get_exolve_sip_credentials(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exolve_sip_credentials(uuid) TO authenticated, service_role;

-- ============================================================
-- 6) Realtime для call_logs
-- ============================================================
ALTER TABLE public.call_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
