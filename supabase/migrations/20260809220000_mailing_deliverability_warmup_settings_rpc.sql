-- Keep SMTP/IMAP verification state service-role-only while allowing an
-- authorized organization operator to change only the safe warmup controls.

CREATE OR REPLACE FUNCTION public.set_mailing_sender_warmup(
  p_sender_id uuid,
  p_enabled boolean DEFAULT NULL,
  p_daily_target integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
BEGIN
  SELECT organization_id
  INTO v_organization_id
  FROM public.mailing_senders
  WHERE id = p_sender_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sender_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_organization(v_organization_id, 'email.manage')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_enabled IS NULL AND p_daily_target IS NULL THEN
    RAISE EXCEPTION 'no_settings_supplied' USING ERRCODE = '22023';
  END IF;

  IF p_daily_target IS NOT NULL AND (p_daily_target < 1 OR p_daily_target > 10) THEN
    RAISE EXCEPTION 'daily_target_out_of_range' USING ERRCODE = '22023';
  END IF;

  UPDATE public.mailing_senders
  SET
    warmup_enabled = COALESCE(p_enabled, warmup_enabled),
    warmup_daily_target = COALESCE(p_daily_target, warmup_daily_target),
    warmup_started_at = CASE
      WHEN p_enabled IS TRUE THEN COALESCE(warmup_started_at, now())
      ELSE warmup_started_at
    END,
    warmup_paused_reason = CASE
      WHEN p_enabled IS TRUE THEN NULL
      ELSE warmup_paused_reason
    END
  WHERE id = p_sender_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_mailing_sender_warmup(uuid, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_mailing_sender_warmup(uuid, boolean, integer) TO authenticated;
