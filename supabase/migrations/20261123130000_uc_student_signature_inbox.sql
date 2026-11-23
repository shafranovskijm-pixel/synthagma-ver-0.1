-- Own-recipient inbox metadata. No old rows, policies, status, signatures or documents are rewritten.
-- Existing legacy facts remain distinct from exact-bound versioned confirmations.
DO $preflight$
BEGIN
 IF current_user<>'postgres' OR to_regclass('public.document_signatures') IS NULL
  OR to_regclass('public.uc_signature_assurance_bindings') IS NULL
  OR to_regclass('public.uc_signature_assurance_document_snapshots') IS NULL
  OR to_regclass('public.uc_signature_assurance_events') IS NULL
  OR to_regprocedure('public.uc_signature_actor_allowed(uuid,boolean,boolean)') IS NULL
  OR to_regprocedure('public.account_deletion_access_allowed()') IS NULL
 THEN RAISE EXCEPTION 'UC_STUDENT_SIGNATURE_INBOX_REQUIRES_INSTALLED_SIGNATURE_ENGINE';END IF;
 IF to_regprocedure('public.read_student_document_inbox(uuid,timestamp with time zone,uuid,integer)') IS NOT NULL
 THEN RAISE EXCEPTION 'UC_STUDENT_SIGNATURE_INBOX_ALREADY_INSTALLED_READBACK_REQUIRED';END IF;
END;$preflight$;
CREATE FUNCTION public.read_student_document_inbox(
 p_organization_id uuid,p_after_created_at timestamptz DEFAULT NULL,p_after_id uuid DEFAULT NULL,p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $fn$
DECLARE actor uuid:=auth.uid();observed timestamptz:=statement_timestamp();answer jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR actor IS NULL OR p_organization_id IS NULL
  OR public.account_deletion_access_allowed() IS NOT TRUE
  OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=actor AND p.organization_id=p_organization_id)
 THEN RETURN jsonb_build_object('version',1,'ok',false,'code','ACCESS_DENIED');END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
  OR (p_after_created_at IS NULL)<>(p_after_id IS NULL)
  OR p_after_created_at IS NOT NULL AND NOT isfinite(p_after_created_at)
 THEN RETURN jsonb_build_object('version',1,'ok',false,'code','INVALID_INPUT');END IF;
 WITH visible AS MATERIALIZED(
  SELECT s.id,s.organization_id,s.recipient_user_id,s.document_title,s.document_type,s.status,s.sender_name,s.expires_at,s.signature_token,s.created_at,s.signed_at,s.viewed_at,s.signed_document_path,s.current_revision_id FROM public.document_signatures s
  WHERE s.organization_id=p_organization_id AND s.recipient_user_id=actor
   AND s.deleted_at IS NULL AND s.hidden_for_recipient IS FALSE AND s.status NOT IN('draft','pending')
   AND public.uc_signature_actor_allowed(s.id,false,true)
 ), metadata AS MATERIALIZED(
  SELECT s.id,s.organization_id,s.recipient_user_id,s.document_title,s.document_type,s.status,s.sender_name,s.expires_at,s.signature_token,s.created_at,s.signed_at,s.viewed_at,s.signed_document_path,s.current_revision_id,b.id AS binding_id,b.revision AS binding_revision,b.document_snapshot_id,b.recipient_user_id AS bound_recipient,
   b.policy_version_id,b.policy_sha256,d.id AS snapshot_id,d.document_revision_id AS bound_document_revision_id,d.html_sha256 AS snapshot_html_hash,d.recipient_user_id AS snapshot_recipient,
   ev.id AS evidence_id,ev.revision AS evidence_revision,ev.kind AS evidence_kind,ev.binding_id AS evidence_binding_id,
   ev.document_snapshot_id AS evidence_snapshot_id,ev.policy_version_id AS evidence_policy_version_id,ev.actor_user_id AS evidence_actor,
   ev.payload->>'conclusion' AS evidence_conclusion,ev.payload->>'document_html_sha256' AS evidence_html_hash,
   ev.payload->'document_revision_id' AS evidence_document_revision,ev.payload->>'policy_sha256' AS evidence_policy_hash,
   ev.server_at AS evidence_at,
   EXISTS(SELECT 1 FROM public.uc_signature_assurance_events terminal
    WHERE terminal.organization_id=p_organization_id AND terminal.signature_id=s.id AND terminal.stream_kind='signature'
     AND terminal.party_role='recipient' AND terminal.kind IN('account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked')) AS terminal_exists
  FROM visible s
  LEFT JOIN LATERAL(SELECT b.* FROM public.uc_signature_assurance_bindings b
   WHERE b.organization_id=p_organization_id AND b.signature_id=s.id AND b.party_role='recipient' ORDER BY b.revision DESC LIMIT 1)b ON true
  LEFT JOIN public.uc_signature_assurance_document_snapshots d ON d.id=b.document_snapshot_id
   AND d.organization_id=p_organization_id AND d.signature_id=s.id AND d.party_role='recipient'
  LEFT JOIN LATERAL(SELECT e.* FROM public.uc_signature_assurance_events e
   WHERE e.organization_id=p_organization_id AND e.signature_id=s.id AND e.stream_kind='signature'AND e.party_role='recipient'
   ORDER BY e.revision DESC LIMIT 1)ev ON true
 ), candidates AS MATERIALIZED(
  SELECT * FROM metadata m WHERE p_after_created_at IS NULL OR(m.created_at,m.id)<(p_after_created_at,p_after_id)
  ORDER BY m.created_at DESC,m.id DESC LIMIT(p_limit+1)
 ), selected_page AS MATERIALIZED(SELECT * FROM candidates ORDER BY created_at DESC,id DESC LIMIT p_limit),
 hash_candidates AS MATERIALIZED(
  -- Archive growth must not rehash every old document for the bell count.
  -- A current page needs exact source state. Outside the page, only an active
  -- bound invitation without a terminal event can possibly remain pending.
  SELECT id FROM selected_page
  UNION
  SELECT id FROM metadata WHERE binding_id IS NOT NULL AND status IN('sent','viewed','in_review')
   AND signed_at IS NULL AND(expires_at IS NULL OR expires_at>observed)AND NOT terminal_exists
 ), current_sources AS MATERIALIZED(
  SELECT m.id,
   CASE WHEN m.current_revision_id IS NULL THEN s.document_html ELSE r.document_html END IS NOT NULL
    AND octet_length(CASE WHEN m.current_revision_id IS NULL THEN s.document_html ELSE r.document_html END)<=1000000 AS current_source_available,
   CASE WHEN m.binding_id IS NOT NULL AND CASE WHEN m.current_revision_id IS NULL THEN s.document_html ELSE r.document_html END IS NOT NULL
    AND octet_length(CASE WHEN m.current_revision_id IS NULL THEN s.document_html ELSE r.document_html END)<=1000000
   THEN encode(sha256(convert_to(CASE WHEN m.current_revision_id IS NULL THEN s.document_html ELSE r.document_html END,'UTF8')),'hex')ELSE NULL END AS current_html_hash
  FROM hash_candidates h JOIN metadata m ON m.id=h.id
  JOIN public.document_signatures s ON s.id=m.id AND s.organization_id=p_organization_id AND s.recipient_user_id=actor
  LEFT JOIN public.signature_revisions r ON r.id=m.current_revision_id AND r.signature_id=m.id
 ), facts AS MATERIALIZED(
  SELECT m.*,coalesce(c.current_source_available,false)AS current_source_available,c.current_html_hash
  FROM metadata m LEFT JOIN current_sources c ON c.id=m.id
 ), matched AS MATERIALIZED(
  SELECT h.*,coalesce(h.binding_id IS NOT NULL AND h.snapshot_id IS NOT NULL AND h.current_html_hash IS NOT NULL
   AND h.bound_document_revision_id IS NOT DISTINCT FROM h.current_revision_id
   AND h.snapshot_html_hash=h.current_html_hash AND h.bound_recipient=actor AND h.snapshot_recipient=actor,false) AS exact_source
  FROM facts h
 ), classified AS MATERIALIZED(
  SELECT m.*,coalesce(m.exact_source AND m.evidence_binding_id=m.binding_id AND m.evidence_snapshot_id=m.document_snapshot_id
   AND m.evidence_policy_version_id=m.policy_version_id AND m.evidence_policy_hash=m.policy_sha256
   AND m.evidence_html_hash=m.current_html_hash
   AND m.evidence_document_revision IS NOT DISTINCT FROM coalesce(to_jsonb(m.current_revision_id),'null'::jsonb)
   AND (m.evidence_kind<>'account_confirmed'OR m.evidence_actor=actor),false)AS exact_event
  FROM matched m
 ), projected AS MATERIALIZED(
  SELECT c.*,CASE
   WHEN c.status='revoked' OR c.evidence_kind='invitation_revoked' THEN 'revoked'
   WHEN c.status='rejected' OR c.evidence_kind='recipient_rejected' THEN 'rejected'
   WHEN c.binding_id IS NOT NULL AND(c.snapshot_id IS NULL OR c.current_source_available IS NOT TRUE OR c.current_html_hash IS NULL)THEN 'source_unavailable'
   WHEN c.binding_id IS NOT NULL AND NOT c.exact_source THEN 'source_changed'
   WHEN c.exact_event AND c.evidence_kind IN('account_confirmed','bearer_confirmed','scan_received')
    AND c.evidence_conclusion IN('factual_confirmation','policy_eligible_account_confirmation','scan_received')THEN 'confirmed'
   WHEN c.signed_at IS NOT NULL OR c.status='signed'THEN 'signed'
   WHEN c.status='expired' OR c.expires_at IS NOT NULL AND c.expires_at<=observed THEN 'expired'
   WHEN c.terminal_exists THEN 'closed'
   WHEN c.status IN('sent','viewed','in_review')THEN 'pending' ELSE 'closed' END AS state,
   CASE WHEN c.exact_event AND c.evidence_conclusion IN('not_confirmed','factual_confirmation','policy_eligible_account_confirmation','scan_received','graphic_prepared','legacy_unknown')
    THEN c.evidence_conclusion WHEN c.signed_at IS NOT NULL OR c.status='signed'THEN 'legacy_unknown' ELSE 'not_confirmed'END AS current_conclusion
  FROM classified c
 ), page AS MATERIALIZED(SELECT p.* FROM projected p JOIN selected_page s ON s.id=p.id)
 SELECT jsonb_build_object('version',1,'ok',true,'organization_id',p_organization_id,'recipient_user_id',actor,'observed_at',observed,
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',p.id,'organization_id',p.organization_id,'document_title',p.document_title,'document_type',p.document_type,'legacy_status',p.status,
   'sender_name',p.sender_name,'expires_at',p.expires_at,'signature_token',p.signature_token,'created_at',p.created_at,
   'signed_at',p.signed_at,'viewed_at',p.viewed_at,'signed_document_path',p.signed_document_path,'state',p.state,'pending',p.state='pending',
   'assurance',jsonb_build_object('binding_id',p.binding_id,'binding_revision',p.binding_revision,'document_revision_id',p.current_revision_id,
    'document_html_sha256',p.current_html_hash,'conclusion',p.current_conclusion,'event_id',p.evidence_id,'event_revision',p.evidence_revision,
    'confirmed_at',CASE WHEN p.exact_event AND p.evidence_kind IN('account_confirmed','bearer_confirmed','scan_received')
     AND p.current_conclusion IN('factual_confirmation','policy_eligible_account_confirmation','scan_received')THEN p.evidence_at ELSE NULL END,
    'source_current',p.exact_source))ORDER BY p.created_at DESC,p.id DESC)FROM page p),'[]'::jsonb),
  'pending_count',(SELECT count(*)FROM projected WHERE state='pending'),'total_count',(SELECT count(*)FROM projected),
  'next_cursor',CASE WHEN(SELECT count(*)FROM candidates)>p_limit THEN(SELECT jsonb_build_object('created_at',created_at,'id',id)FROM page ORDER BY created_at,id LIMIT 1)ELSE NULL END)INTO answer;
 RETURN answer;
EXCEPTION WHEN insufficient_privilege THEN RETURN jsonb_build_object('version',1,'ok',false,'code','ACCESS_DENIED');
 WHEN OTHERS THEN RETURN jsonb_build_object('version',1,'ok',false,'code','DEPENDENCY_UNAVAILABLE');
END;$fn$;
REVOKE ALL ON FUNCTION public.read_student_document_inbox(uuid,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_student_document_inbox(uuid,timestamptz,uuid,integer) TO authenticated;
-- Restrict this new RPC's explicit ACL despite provider-specific public defaults.
-- Existing functions, roles, memberships and default privileges are unchanged.
DO $new_rpc_acl$
DECLARE target_signature constant text:='public.read_student_document_inbox(uuid,timestamptz,uuid,integer)';target_owner oid;grantee_oid oid;
BEGIN
 SELECT proowner INTO STRICT target_owner FROM pg_proc WHERE oid=target_signature::regprocedure;
 FOR grantee_oid IN SELECT DISTINCT a.grantee FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
  WHERE p.oid=target_signature::regprocedure AND a.grantee NOT IN(target_owner,'authenticated'::regrole)
 LOOP
  IF grantee_oid=0 THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',target_signature);
  ELSE EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',target_signature,pg_get_userbyid(grantee_oid));END IF;
 END LOOP;
 EXECUTE format('REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION %s FROM authenticated',target_signature);
END;$new_rpc_acl$;
COMMENT ON FUNCTION public.read_student_document_inbox(uuid,timestamptz,uuid,integer) IS 'Own-recipient metadata only; exact-bound new confirmations do not rewrite legacy signature facts. Token is returned only to its real recipient for the existing signing route.';
