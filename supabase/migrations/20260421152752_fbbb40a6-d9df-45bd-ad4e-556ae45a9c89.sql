-- 1) search_path для _email_daily_limit
CREATE OR REPLACE FUNCTION public._email_daily_limit(_day int)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _day <= 1 THEN 10
    WHEN _day = 2 THEN 20
    WHEN _day = 3 THEN 40
    WHEN _day = 4 THEN 70
    WHEN _day = 5 THEN 100
    WHEN _day = 6 THEN 150
    WHEN _day = 7 THEN 200
    WHEN _day = 8 THEN 300
    WHEN _day = 9 THEN 400
    WHEN _day = 10 THEN 500
    WHEN _day = 11 THEN 700
    WHEN _day = 12 THEN 1000
    WHEN _day = 13 THEN 1500
    ELSE 2000
  END;
$$;

-- 2) Заменяем политику warmup_no_direct (FOR ALL с false) на одну SELECT-политику
-- При RLS=ON и отсутствии политик для INSERT/UPDATE/DELETE — операции запрещены по умолчанию.
DROP POLICY IF EXISTS "warmup_no_direct" ON public.email_warmup_state;

CREATE POLICY "warmup_select_blocked"
ON public.email_warmup_state FOR SELECT
USING (false);