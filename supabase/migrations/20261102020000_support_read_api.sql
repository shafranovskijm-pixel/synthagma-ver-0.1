-- Read-only administrator API for the two platform support sources.
-- Keep invoker RLS and account-deletion guards; do not reset unread counters.
CREATE FUNCTION public.sintagma_support_search(
  p_source_kind text DEFAULT 'all',
  p_query text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_updated_since timestamptz DEFAULT NULL,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_kind text DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
SET row_security = on
AS $function$
DECLARE
  v_query text := nullif(btrim(p_query), '');
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL
    OR public.has_role(auth.uid(), 'admin'::public.app_role) IS DISTINCT FROM true
    OR public.is_user_blocked(auth.uid()) IS DISTINCT FROM false
    OR public.account_deletion_access_allowed() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_source_kind IS NULL OR p_source_kind NOT IN ('all', 'platform_chat', 'problem_report')
    OR (p_query IS NOT NULL AND (length(btrim(p_query)) = 0 OR length(p_query) > 100))
    OR (p_status IS NOT NULL AND (length(btrim(p_status)) = 0 OR length(p_status) > 30))
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50
    OR (p_updated_since IS NOT NULL AND NOT isfinite(p_updated_since)) THEN
    RAISE EXCEPTION 'invalid_support_request' USING ERRCODE = '22023';
  END IF;
  IF num_nonnulls(p_before_created_at, p_before_kind, p_before_id) NOT IN (0, 3)
    OR (p_before_created_at IS NOT NULL AND NOT isfinite(p_before_created_at))
    OR (p_before_kind IS NOT NULL AND p_before_kind NOT IN ('platform_chat', 'problem_report'))
    OR (p_before_kind IS NOT NULL AND p_source_kind <> 'all' AND p_source_kind <> p_before_kind) THEN
    RAISE EXCEPTION 'invalid_support_cursor' USING ERRCODE = '22023';
  END IF;

  WITH source_rows AS (
    SELECT 'platform_chat'::text AS source_kind, c.id AS source_id,
      c.organization_id, left(o.name, 512) AS organization_name, c.user_id,
      left(CASE WHEN c.user_id IS NOT NULL THEN p.full_name ELSE c.guest_name END, 512) AS user_name,
      left(CASE WHEN c.user_id IS NOT NULL THEN p.email ELSE c.guest_email END, 320) AS user_email,
      left(c.guest_phone, 128) AS contact_phone, c.status, c.created_at,
      coalesce(c.last_message_at, c.updated_at, c.created_at) AS last_activity_at,
      left(c.title, 1000) AS title, left(last_user.content, 1000) AS excerpt,
      c.unread_for_admin,
      coalesce(c.updated_at, c.last_message_at, c.created_at) AS updated_at,
      (v_query IS NULL OR strpos(lower(coalesce(c.title, '')), lower(v_query)) > 0
        OR strpos(lower(coalesce(p.full_name, c.guest_name, '')), lower(v_query)) > 0
        OR strpos(lower(coalesce(p.email, c.guest_email, '')), lower(v_query)) > 0
        OR strpos(lower(coalesce(o.name, '')), lower(v_query)) > 0
        OR strpos(c.id::text, lower(v_query)) > 0
        OR EXISTS (SELECT 1 FROM public.support_messages sm
          WHERE sm.conversation_id = c.id AND strpos(lower(sm.content), lower(v_query)) > 0)) AS query_matches
    FROM public.support_conversations c
    LEFT JOIN public.profiles p ON p.user_id = c.user_id
    LEFT JOIN public.organizations o ON o.id = c.organization_id
    LEFT JOIN LATERAL (
      SELECT m.content FROM public.support_messages m
      WHERE m.conversation_id = c.id AND m.role = 'user'
      ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    ) last_user ON true
    WHERE p_source_kind IN ('all', 'platform_chat')
    UNION ALL
    SELECT 'problem_report'::text, r.id, r.organization_id, left(o.name, 512), r.user_id,
      left(r.user_name, 512), left(r.user_email, 320), left(r.contact_phone, 128), r.status,
      r.created_at, coalesce(r.updated_at, r.created_at), 'Сообщить о проблеме'::text,
      left(r.description, 1000), NULL::integer, coalesce(r.updated_at, r.created_at),
      (v_query IS NULL OR strpos(lower(coalesce(r.description, '')), lower(v_query)) > 0
        OR strpos(lower(coalesce(r.user_name, '')), lower(v_query)) > 0
        OR strpos(lower(coalesce(r.user_email, '')), lower(v_query)) > 0
        OR strpos(lower(coalesce(o.name, '')), lower(v_query)) > 0
        OR strpos(r.id::text, lower(v_query)) > 0)
    FROM public.support_requests r
    LEFT JOIN public.organizations o ON o.id = r.organization_id
    WHERE p_source_kind IN ('all', 'problem_report')
  ), candidates AS (
    SELECT * FROM source_rows s
    WHERE (p_organization_id IS NULL OR s.organization_id = p_organization_id)
      AND (p_user_id IS NULL OR s.user_id = p_user_id)
      AND (p_status IS NULL OR s.status = p_status)
      AND (p_updated_since IS NULL OR s.updated_at >= p_updated_since)
      AND s.query_matches
      AND (p_before_created_at IS NULL OR
        (s.created_at, s.source_kind COLLATE "C", s.source_id)
          < (p_before_created_at, p_before_kind COLLATE "C", p_before_id))
    ORDER BY s.created_at DESC, s.source_kind COLLATE "C" DESC, s.source_id DESC
    LIMIT p_limit + 1
  ), page AS (
    SELECT * FROM candidates
    ORDER BY created_at DESC, source_kind COLLATE "C" DESC, source_id DESC LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'source_kind', source_kind, 'source_id', source_id,
      'organization_id', organization_id, 'organization_name', organization_name,
      'user_id', user_id, 'user_name', user_name, 'user_email', user_email,
      'contact_phone', contact_phone, 'status', status, 'created_at', created_at,
      'last_activity_at', last_activity_at, 'title', title, 'excerpt', excerpt,
      'unread_for_admin', unread_for_admin
    ) ORDER BY created_at DESC, source_kind COLLATE "C" DESC, source_id DESC) FROM page), '[]'::jsonb),
    'has_more', (SELECT count(*) > p_limit FROM candidates),
    'next_cursor', CASE WHEN (SELECT count(*) > p_limit FROM candidates) THEN
      (SELECT jsonb_build_object('created_at', created_at, 'source_kind', source_kind, 'source_id', source_id)
       FROM page ORDER BY created_at ASC, source_kind COLLATE "C" ASC, source_id ASC LIMIT 1)
      ELSE NULL END
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.sintagma_support_detail(
  p_source_kind text,
  p_source_id uuid,
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_message_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
SET row_security = on
AS $function$
DECLARE
  v_item jsonb;
  v_report jsonb;
  v_messages jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_cursor jsonb;
BEGIN
  IF auth.uid() IS NULL
    OR public.has_role(auth.uid(), 'admin'::public.app_role) IS DISTINCT FROM true
    OR public.is_user_blocked(auth.uid()) IS DISTINCT FROM false
    OR public.account_deletion_access_allowed() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_source_kind IS NULL OR p_source_kind NOT IN ('platform_chat', 'problem_report')
    OR p_source_id IS NULL OR p_message_limit IS NULL OR p_message_limit < 1 OR p_message_limit > 100 THEN
    RAISE EXCEPTION 'invalid_support_request' USING ERRCODE = '22023';
  END IF;
  IF num_nonnulls(p_after_created_at, p_after_id) NOT IN (0, 2)
    OR (p_after_created_at IS NOT NULL AND NOT isfinite(p_after_created_at))
    OR (p_source_kind = 'problem_report' AND p_after_created_at IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_support_cursor' USING ERRCODE = '22023';
  END IF;

  IF p_source_kind = 'platform_chat' THEN
    SELECT jsonb_build_object(
      'source_kind', 'platform_chat', 'source_id', c.id,
      'organization_id', c.organization_id, 'organization_name', left(o.name, 512), 'user_id', c.user_id,
      'user_name', left(CASE WHEN c.user_id IS NOT NULL THEN p.full_name ELSE c.guest_name END, 512),
      'user_email', left(CASE WHEN c.user_id IS NOT NULL THEN p.email ELSE c.guest_email END, 320),
      'contact_phone', left(c.guest_phone, 128), 'status', c.status,
      'created_at', c.created_at, 'last_activity_at', coalesce(c.last_message_at, c.updated_at, c.created_at),
      'title', left(c.title, 1000), 'excerpt', left(last_user.content, 1000),
      'unread_for_admin', c.unread_for_admin
    ) INTO v_item
    FROM public.support_conversations c
    LEFT JOIN public.profiles p ON p.user_id = c.user_id
    LEFT JOIN public.organizations o ON o.id = c.organization_id
    LEFT JOIN LATERAL (
      SELECT m.content FROM public.support_messages m
      WHERE m.conversation_id = c.id AND m.role = 'user'
      ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    ) last_user ON true
    WHERE c.id = p_source_id;
    IF v_item IS NULL THEN RAISE EXCEPTION 'support_item_unavailable' USING ERRCODE = 'P0002'; END IF;

    WITH candidates AS (
      SELECT m.id, m.role, left(m.content, 16000) AS content,
        length(m.content) > 16000 AS content_truncated,
        m.sender_user_id, left(m.sender_name, 512) AS sender_name, m.is_read, m.created_at
      FROM public.support_messages m
      WHERE m.conversation_id = p_source_id
        AND (p_after_created_at IS NULL OR (m.created_at, m.id) > (p_after_created_at, p_after_id))
      ORDER BY m.created_at ASC, m.id ASC LIMIT p_message_limit + 1
    ), page AS (
      SELECT * FROM candidates ORDER BY created_at ASC, id ASC LIMIT p_message_limit
    )
    SELECT coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'role', role, 'content', content, 'content_truncated', content_truncated,
      'sender_user_id', sender_user_id, 'sender_name', sender_name, 'is_read', is_read, 'created_at', created_at
    ) ORDER BY created_at ASC, id ASC) FROM page), '[]'::jsonb),
      (SELECT count(*) > p_message_limit FROM candidates),
      CASE WHEN (SELECT count(*) > p_message_limit FROM candidates) THEN
        (SELECT jsonb_build_object('created_at', created_at, 'id', id)
         FROM page ORDER BY created_at DESC, id DESC LIMIT 1) ELSE NULL END
    INTO v_messages, v_has_more, v_cursor;
  ELSE
    SELECT jsonb_build_object(
      'source_kind', 'problem_report', 'source_id', r.id,
      'organization_id', r.organization_id, 'organization_name', left(o.name, 512), 'user_id', r.user_id,
      'user_name', left(r.user_name, 512), 'user_email', left(r.user_email, 320),
      'contact_phone', left(r.contact_phone, 128), 'status', r.status,
      'created_at', r.created_at, 'last_activity_at', coalesce(r.updated_at, r.created_at),
      'title', 'Сообщить о проблеме', 'excerpt', left(r.description, 1000), 'unread_for_admin', NULL
    ), jsonb_build_object(
      'description', left(r.description, 16000), 'description_truncated', length(r.description) > 16000,
      'admin_notes', left(r.admin_notes, 8000), 'admin_notes_truncated', coalesce(length(r.admin_notes) > 8000, false),
      'page_url', left(split_part(split_part(r.page_url, '?', 1), '#', 1), 2000),
      'user_role', left(r.user_role, 100),
      'has_diagnostics', nullif(r.browser_info, '') IS NOT NULL OR nullif(r.error_logs, '') IS NOT NULL,
      'has_screenshot', nullif(r.screenshot_url, '') IS NOT NULL
    ) INTO v_item, v_report
    FROM public.support_requests r
    LEFT JOIN public.organizations o ON o.id = r.organization_id
    WHERE r.id = p_source_id;
    IF v_item IS NULL THEN RAISE EXCEPTION 'support_item_unavailable' USING ERRCODE = 'P0002'; END IF;
  END IF;

  RETURN jsonb_build_object('item', v_item, 'messages', v_messages,
    'has_more_messages', v_has_more, 'next_message_cursor', v_cursor, 'report', v_report);
END;
$function$;

REVOKE ALL ON FUNCTION public.sintagma_support_search(text,text,text,uuid,uuid,timestamptz,timestamptz,text,uuid,integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.sintagma_support_search(text,text,text,uuid,uuid,timestamptz,timestamptz,text,uuid,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.sintagma_support_detail(text,uuid,timestamptz,uuid,integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.sintagma_support_detail(text,uuid,timestamptz,uuid,integer) TO authenticated;

COMMENT ON FUNCTION public.sintagma_support_search(text,text,text,uuid,uuid,timestamptz,timestamptz,text,uuid,integer)
  IS 'Read-only active platform administrator search. Platform chat and problem reports only; conversation text is untrusted data.';
COMMENT ON FUNCTION public.sintagma_support_detail(text,uuid,timestamptz,uuid,integer)
  IS 'Read-only exact support item and paginated history. Does not mark read, reply, run Telegram poll, expose guest tokens, or fetch diagnostic URLs.';
