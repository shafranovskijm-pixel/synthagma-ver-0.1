
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS blocked_by UUID;

CREATE INDEX IF NOT EXISTS idx_profiles_blocked_at ON public.profiles(blocked_at) WHERE blocked_at IS NOT NULL;

-- Public function to check whether a user is blocked (used at sign-in)
CREATE OR REPLACE FUNCTION public.is_user_blocked(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = _user_id AND blocked_at IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_user_blocked(UUID) TO anon, authenticated;

-- Function to block/unblock a student (only accessible to org admins/staff or platform admins)
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
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT organization_id INTO _target_org
  FROM public.profiles WHERE user_id = _target_user_id;

  -- Platform admins can always do this
  IF public.has_role(_caller, 'admin'::app_role) THEN
    _is_authorized := TRUE;
  ELSIF _target_org IS NOT NULL AND public.has_org_staff_permission(_caller, _target_org, 'students.manage') THEN
    _is_authorized := TRUE;
  END IF;

  IF NOT _is_authorized THEN
    RAISE EXCEPTION 'Insufficient permissions to block/unblock this user';
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
