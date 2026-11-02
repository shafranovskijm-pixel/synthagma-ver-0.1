-- Isolated PostgreSQL integration assertions. Synthetic rows, rolled back.
-- Run through scripts/test-support-read-sql.mjs, never against production.
BEGIN;
CREATE FUNCTION pg_temp.support_assert(ok boolean, description text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', description; END IF; END;
$$;
CREATE FUNCTION pg_temp.support_expect_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual = MESSAGE_TEXT; END;
  IF actual IS NULL OR strpos(actual, expected) = 0 THEN
    RAISE EXCEPTION 'EXPECTED ERROR %, GOT %', expected, actual;
  END IF;
END;
$$;

INSERT INTO auth.users(id,email) VALUES
  ('7c1987f0-0929-4000-8000-000000000001','support-admin@example.invalid'),
  ('7c1987f0-0929-4000-8000-000000000002','support-student@example.invalid');
INSERT INTO public.profiles(user_id,full_name,email,blocked_at) VALUES
  ('7c1987f0-0929-4000-8000-000000000001','Synthetic support admin','support-admin@example.invalid',NULL),
  ('7c1987f0-0929-4000-8000-000000000002','SUPPORT SQL FIX student','support-student@example.invalid',NULL)
  ON CONFLICT(user_id) DO UPDATE SET blocked_at = NULL;
INSERT INTO public.user_roles(user_id,role) VALUES
  ('7c1987f0-0929-4000-8000-000000000001','admin'),
  ('7c1987f0-0929-4000-8000-000000000002','student');
INSERT INTO public.organizations(id,name,email) VALUES
  ('7c1987f0-0929-4000-8000-000000000010','SUPPORT SQL FIX organization','support-org@example.invalid');
INSERT INTO public.support_conversations(id,user_id,guest_token,guest_name,guest_email,guest_phone,
  organization_id,title,status,created_at,updated_at,last_message_at) VALUES
  ('7c1987f0-0929-4000-8000-000000000020',NULL,'MUST_NOT_EXPOSE_GUEST_CAPABILITY','SUPPORT SQL FIX guest',
    'guest@example.invalid','+70000000000',NULL,'SUPPORT SQL FIX literal 100%_quoted','human',
    '2026-11-01 12:00:00Z','2026-11-01 12:00:00Z','2026-11-01 12:00:00Z'),
  ('7c1987f0-0929-4000-8000-000000000021','7c1987f0-0929-4000-8000-000000000002',NULL,NULL,NULL,NULL,
    '7c1987f0-0929-4000-8000-000000000010','SUPPORT SQL FIX authenticated','ai',
    '2026-11-01 12:00:00Z','2026-11-01 12:00:00Z','2026-11-01 12:00:00Z');
INSERT INTO public.support_messages(id,conversation_id,role,content,sender_user_id,sender_name,created_at) VALUES
  ('7c1987f0-0929-4000-8000-000000000040','7c1987f0-0929-4000-8000-000000000020','user',
    'First message, ordinary text',NULL,'Guest','2026-11-01 12:01:00Z'),
  ('7c1987f0-0929-4000-8000-000000000041','7c1987f0-0929-4000-8000-000000000020','operator',
    'Existing operator answer','7c1987f0-0929-4000-8000-000000000001','Operator','2026-11-01 12:01:00Z'),
  ('7c1987f0-0929-4000-8000-000000000042','7c1987f0-0929-4000-8000-000000000020','user',
    repeat('Long support message. ',900),NULL,'Guest','2026-11-01 12:02:00Z');
INSERT INTO public.support_requests(id,user_id,user_name,user_email,organization_id,description,
  admin_notes,status,page_url,error_logs,browser_info,screenshot_url,created_at,updated_at) VALUES
  ('7c1987f0-0929-4000-8000-000000000030','7c1987f0-0929-4000-8000-000000000002',
    'SUPPORT SQL FIX report author','report@example.invalid','7c1987f0-0929-4000-8000-000000000010',
    'SUPPORT SQL FIX report description',repeat('Internal note. ',900),'new',
    'https://example.invalid/course?access_token=MUST_NOT_EXPOSE_URL_TOKEN#secret',
    'MUST_NOT_EXPOSE_RAW_ERROR_LOG','MUST_NOT_EXPOSE_RAW_BROWSER_INFO',
    'https://storage.invalid/screenshot?token=MUST_NOT_EXPOSE_SCREENSHOT_TOKEN',
    '2026-11-01 12:00:00Z','2026-11-01 12:03:00Z');

CREATE TEMP TABLE support_before AS
SELECT 'conversations'::text AS source, md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) AS hash
FROM public.support_conversations t
UNION ALL SELECT 'messages',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM public.support_messages t
UNION ALL SELECT 'requests',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM public.support_requests t;

SELECT set_config('request.jwt.claim.sub','7c1987f0-0929-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE a jsonb; b jsonb; c jsonb; cursor jsonb;
BEGIN
  a := public.sintagma_support_search(p_query=>'SUPPORT SQL FIX',p_limit=>1);
  PERFORM pg_temp.support_assert(jsonb_array_length(a->'items')=1 AND (a->>'has_more')::boolean,'bounded page with has_more');
  PERFORM pg_temp.support_assert(a->'items'->0->>'source_kind'='problem_report','stable kind order for tied times');
  cursor := a->'next_cursor';
  b := public.sintagma_support_search(p_query=>'SUPPORT SQL FIX',p_before_created_at=>(cursor->>'created_at')::timestamptz,
    p_before_kind=>cursor->>'source_kind',p_before_id=>(cursor->>'source_id')::uuid,p_limit=>1);
  PERFORM pg_temp.support_assert(b->'items'->0->>'source_id'='7c1987f0-0929-4000-8000-000000000021','second tied timestamp row');
  cursor := b->'next_cursor';
  c := public.sintagma_support_search(p_query=>'SUPPORT SQL FIX',p_before_created_at=>(cursor->>'created_at')::timestamptz,
    p_before_kind=>cursor->>'source_kind',p_before_id=>(cursor->>'source_id')::uuid,p_limit=>1);
  PERFORM pg_temp.support_assert(c->'items'->0->>'source_id'='7c1987f0-0929-4000-8000-000000000020'
    AND c->>'has_more'='false' AND c->'next_cursor'='null'::jsonb,'third row and exhausted cursor without duplicate');
  PERFORM pg_temp.support_assert(c->'items'->0->'organization_id'='null'::jsonb,'guest without organization is retained');
  PERFORM pg_temp.support_assert(strpos((a||b||c)::text,'MUST_NOT_EXPOSE')=0,'search omits capability and diagnostic tokens');

  a := public.sintagma_support_search(p_source_kind=>'platform_chat',p_query=>'SUPPORT SQL FIX');
  PERFORM pg_temp.support_assert(jsonb_array_length(a->'items')=2,'source selector keeps chat sources');
  a := public.sintagma_support_search(p_source_kind=>'problem_report',p_query=>'SUPPORT SQL FIX');
  PERFORM pg_temp.support_assert(jsonb_array_length(a->'items')=1,'source selector keeps problem reports');
  a := public.sintagma_support_search(p_query=>'%',p_limit=>50);
  PERFORM pg_temp.support_assert(jsonb_array_length(a->'items')=1,'percent query is literal, not wildcard');
  a := public.sintagma_support_search(p_query=>'_quoted',p_limit=>50);
  PERFORM pg_temp.support_assert(jsonb_array_length(a->'items')=1,'underscore query is literal, not wildcard');
  a := public.sintagma_support_search(p_query=>''' OR true; DROP TABLE support_messages; --');
  PERFORM pg_temp.support_assert(jsonb_array_length(a->'items')=0,'SQL-looking text is data');
  a := public.sintagma_support_search(p_query=>'SUPPORT SQL FIX',p_organization_id=>'7c1987f0-0929-4000-8000-000000000010');
  PERFORM pg_temp.support_assert(jsonb_array_length(a->'items')=2,'organization filter is exact');
  a := public.sintagma_support_search(p_query=>'SUPPORT SQL FIX',p_user_id=>'7c1987f0-0929-4000-8000-000000000002');
  PERFORM pg_temp.support_assert(jsonb_array_length(a->'items')=2,'requester filter is exact');
  a := public.sintagma_support_search(p_query=>'SUPPORT SQL FIX',p_status=>'human');
  PERFORM pg_temp.support_assert(jsonb_array_length(a->'items')=1,'status filter does not change unrelated source statuses');
  a := public.sintagma_support_search(p_query=>'SUPPORT SQL FIX',p_updated_since=>'2099-01-01Z');
  PERFORM pg_temp.support_assert(jsonb_array_length(a->'items')=0,'updated-since filter applied');

  a := public.sintagma_support_detail('platform_chat','7c1987f0-0929-4000-8000-000000000020',p_message_limit=>1);
  PERFORM pg_temp.support_assert(a->'messages'->0->>'id'='7c1987f0-0929-4000-8000-000000000040'
    AND a->>'has_more_messages'='true','history begins chronologically and reports more');
  cursor := a->'next_message_cursor';
  b := public.sintagma_support_detail('platform_chat','7c1987f0-0929-4000-8000-000000000020',
    (cursor->>'created_at')::timestamptz,(cursor->>'id')::uuid,1);
  PERFORM pg_temp.support_assert(b->'messages'->0->>'role'='operator','same-time history uses UUID tie breaker');
  cursor := b->'next_message_cursor';
  c := public.sintagma_support_detail('platform_chat','7c1987f0-0929-4000-8000-000000000020',
    (cursor->>'created_at')::timestamptz,(cursor->>'id')::uuid,1);
  PERFORM pg_temp.support_assert(c->'messages'->0->>'content_truncated'='true'
    AND length(c->'messages'->0->>'content')=16000,'large message is bounded and marked');
  PERFORM pg_temp.support_assert(c->>'has_more_messages'='false' AND c->'next_message_cursor'='null'::jsonb,'history exhaustion');
  PERFORM pg_temp.support_assert(strpos((a||b||c)::text,'MUST_NOT_EXPOSE_GUEST_CAPABILITY')=0,'detail omits guest capability');

  a := public.sintagma_support_detail('problem_report','7c1987f0-0929-4000-8000-000000000030');
  PERFORM pg_temp.support_assert(a->'report'->>'page_url'='https://example.invalid/course','page URL query and fragment removed');
  PERFORM pg_temp.support_assert(a->'report'->>'has_diagnostics'='true' AND a->'report'->>'has_screenshot'='true','diagnostic existence only');
  PERFORM pg_temp.support_assert(a->'report'->>'admin_notes_truncated'='true'
    AND length(a->'report'->>'admin_notes')=8000,'notes are bounded and marked');
  PERFORM pg_temp.support_assert(strpos(a::text,'MUST_NOT_EXPOSE')=0,'raw diagnostics and screenshot URL omitted');
  PERFORM pg_temp.support_assert(a->'messages'='[]'::jsonb AND a->>'has_more_messages'='false','report is not invented chat');

  PERFORM pg_temp.support_expect_error('SELECT public.sintagma_support_search(p_limit=>0)','invalid_support_request');
  PERFORM pg_temp.support_expect_error('SELECT public.sintagma_support_search(p_source_kind=>''org_student'')','invalid_support_request');
  PERFORM pg_temp.support_expect_error('SELECT public.sintagma_support_search(p_query=>repeat(''a'',101))','invalid_support_request');
  PERFORM pg_temp.support_expect_error('SELECT public.sintagma_support_search(p_query=>''   '')','invalid_support_request');
  PERFORM pg_temp.support_expect_error('SELECT public.sintagma_support_search(p_updated_since=>''infinity'')','invalid_support_request');
  PERFORM pg_temp.support_expect_error('SELECT public.sintagma_support_search(p_before_kind=>''platform_chat'')','invalid_support_cursor');
  PERFORM pg_temp.support_expect_error('SELECT public.sintagma_support_search(''platform_chat'',p_before_created_at=>now(),p_before_kind=>''problem_report'',p_before_id=>''7c1987f0-0929-4000-8000-000000000030'')','invalid_support_cursor');
  PERFORM pg_temp.support_expect_error('SELECT public.sintagma_support_detail(''all'',''7c1987f0-0929-4000-8000-000000000020'')','invalid_support_request');
  PERFORM pg_temp.support_expect_error('SELECT public.sintagma_support_detail(''platform_chat'',''7c1987f0-0929-4000-8000-000000000020'',p_after_id=>''7c1987f0-0929-4000-8000-000000000040'')','invalid_support_cursor');
  PERFORM pg_temp.support_expect_error('SELECT public.sintagma_support_detail(''problem_report'',''7c1987f0-0929-4000-8000-000000000030'',now(),''7c1987f0-0929-4000-8000-000000000040'')','invalid_support_cursor');
  PERFORM pg_temp.support_expect_error('SELECT public.sintagma_support_detail(''platform_chat'',''7c1987f0-0929-4000-8000-000000000030'')','support_item_unavailable');
END;
$$;
RESET ROLE;

-- A new restrictive policy must still constrain the invoker RPC even for an
-- otherwise authorized administrator; this is a local model-only sentinel.
CREATE POLICY support_read_lab_hide_one ON public.support_conversations AS RESTRICTIVE
  FOR SELECT TO authenticated USING (id <> '7c1987f0-0929-4000-8000-000000000020'::uuid);
SET LOCAL ROLE authenticated;
SELECT pg_temp.support_assert(jsonb_array_length(public.sintagma_support_search(
  p_source_kind=>'platform_chat',p_query=>'SUPPORT SQL FIX')->'items')=1,'search retains caller RLS');
SELECT pg_temp.support_expect_error('SELECT public.sintagma_support_detail(''platform_chat'',''7c1987f0-0929-4000-8000-000000000020'')','support_item_unavailable');
RESET ROLE;
DROP POLICY support_read_lab_hide_one ON public.support_conversations;

-- Read calls preserve all source rows, counters, and timestamps.
SELECT pg_temp.support_assert(NOT EXISTS (
  (SELECT * FROM support_before EXCEPT
    (SELECT 'conversations',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM public.support_conversations t
     UNION ALL SELECT 'messages',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM public.support_messages t
     UNION ALL SELECT 'requests',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM public.support_requests t))
),'all rows, unread counts, timestamps unchanged by read API');

SELECT set_config('request.jwt.claim.sub','7c1987f0-0929-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.support_expect_error('SELECT public.sintagma_support_search()','platform_admin_required');
SELECT pg_temp.support_expect_error('SELECT public.sintagma_support_detail(''platform_chat'',''7c1987f0-0929-4000-8000-000000000020'')','platform_admin_required');
RESET ROLE;
UPDATE public.profiles SET blocked_at=now() WHERE user_id='7c1987f0-0929-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','7c1987f0-0929-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.support_expect_error('SELECT public.sintagma_support_search()','platform_admin_required');
RESET ROLE;
UPDATE public.profiles SET blocked_at=NULL WHERE user_id='7c1987f0-0929-4000-8000-000000000001';
INSERT INTO public.account_deletion_revocations(user_id) VALUES ('7c1987f0-0929-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.support_expect_error('SELECT public.sintagma_support_search()','platform_admin_required');
SELECT pg_temp.support_expect_error('SELECT public.sintagma_support_detail(''problem_report'',''7c1987f0-0929-4000-8000-000000000030'')','platform_admin_required');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.support_expect_error('SELECT public.sintagma_support_search()','platform_admin_required');

SELECT pg_temp.support_assert(NOT has_function_privilege('anon',
  'public.sintagma_support_search(text,text,text,uuid,uuid,timestamptz,timestamptz,text,uuid,integer)','EXECUTE'),'anon has no execute grant');
SELECT pg_temp.support_assert(NOT has_function_privilege('service_role',
  'public.sintagma_support_detail(text,uuid,timestamptz,uuid,integer)','EXECUTE'),'service role not used by support API');
SELECT pg_temp.support_assert((SELECT NOT p.prosecdef AND p.provolatile='s' AND p.proconfig @> ARRAY['row_security=on']
  FROM pg_proc p WHERE p.oid='public.sintagma_support_detail(text,uuid,timestamptz,uuid,integer)'::regprocedure),
  'detail is stable invoker with row security on');
ROLLBACK;
