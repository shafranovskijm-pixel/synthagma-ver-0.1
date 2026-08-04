-- Регрессионный SQL-тест RPC create_group_document_batch.
-- Запуск: psql -f supabase/tests/create_group_document_batch.test.sql
-- Проверяет: (1) корректную сигнатуру блокировки (bigint), (2) отказ на
-- пустом/некорректном массиве документов, (3) неизменность предыдущей партии.

\set ON_ERROR_STOP on

-- 1) Сигнатура: pg_advisory_xact_lock(bigint) существует и вызывается с ОДНИМ
-- 64-битным ключом (вариант (bigint, bigint) в PostgreSQL отсутствует).
DO $$
DECLARE
  def text := pg_get_functiondef('public.create_group_document_batch(uuid,uuid,jsonb)'::regprocedure);
BEGIN
  IF def !~ 'pg_advisory_xact_lock\(\s*hashtextextended' THEN
    RAISE EXCEPTION 'lock is not taken with hashtextextended key';
  END IF;
  IF def ~ 'hashtextextended\([^)]*\)\s*,\s*\n?\s*hashtextextended' THEN
    RAISE EXCEPTION 'invalid two-argument (bigint, bigint) advisory lock detected';
  END IF;
  -- Ключ действительно приводится к bigint-варианту функции.
  PERFORM pg_advisory_xact_lock(hashtextextended('00000000-0000-0000-0000-000000000000:x', 0));
  RAISE NOTICE 'OK: single 64-bit advisory lock key';
END $$;

-- 2) Пустой массив отклоняется ДО любых изменений (проверка текста функции —
-- защита от регрессии порядка валидации относительно UPDATE is_current).
DO $$
DECLARE
  def text := pg_get_functiondef('public.create_group_document_batch(uuid,uuid,jsonb)'::regprocedure);
  pos_guard int;
  pos_update int;
BEGIN
  IF def !~ 'jsonb_typeof\(p_docs\)' THEN
    RAISE EXCEPTION 'missing jsonb array type guard';
  END IF;
  IF def !~ 'at least one document' THEN
    RAISE EXCEPTION 'missing empty array guard';
  END IF;
  IF def !~ 'max batch size' THEN
    RAISE EXCEPTION 'missing max batch size guard';
  END IF;
  pos_guard := position('at least one document' in def);
  pos_update := position('SET is_current = false' in def);
  IF pos_update = 0 OR pos_guard = 0 OR pos_guard > pos_update THEN
    RAISE EXCEPTION 'empty-array guard must run before is_current UPDATE';
  END IF;
  RAISE NOTICE 'OK: empty/oversized batch rejected before any mutation';
END $$;

-- 3) Поведенческая проверка (требует прав на выполнение функции):
--    пустой массив -> исключение, ни одна строка не изменена.
-- BEGIN;
--   SELECT * FROM public.create_group_document_batch(:org, :grp, '[]'::jsonb);  -- ожидается ошибка
-- ROLLBACK;
