
-- Без политик RLS = полный запрет для anon/authenticated.
-- Доступ к таблице остаётся только через SECURITY DEFINER функции (_webinar_rate_check).
DROP POLICY IF EXISTS "deny all" ON public.webinar_rate_limits;
