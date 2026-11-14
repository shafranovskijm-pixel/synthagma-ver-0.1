-- Reconcile only the two independently verified provider whitespace changes.
-- The already-applied core is never replayed and its ledger is not changed.
-- Canonical bodies are a no-op; every unknown body or authority fails closed.
-- The provider supplies the atomic transaction around this single payload.
DO $rtn_core_whitespace$
DECLARE expected record;before_function pg_proc%ROWTYPE;after_function pg_proc%ROWTYPE;
 definition text;body text;before_metadata jsonb;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'RTN_CORE_RECONCILIATION_REQUIRES_POSTGRES';END IF;
 FOR expected IN SELECT * FROM(VALUES
  (1,'public.save_rtn_settings(uuid,boolean,boolean)',
   '97aae32458ab9586a0132b9847b2bdf9','785506ee20900baaf24388ad8831e91f','v',
   E'\n  ON CONFLICT(organization_id) DO UPDATE SET notify_updates=excluded.notify_updates,show_archived_releases=excluded.show_archived_releases,updated_by=excluded.updated_by,updated_at=excluded.updated_at;',
   E'\n ON CONFLICT(organization_id) DO UPDATE SET notify_updates=excluded.notify_updates,show_archived_releases=excluded.show_archived_releases,updated_by=excluded.updated_by,updated_at=excluded.updated_at;'),
  (2,'public.get_rtn_workspace(uuid)',
   '409b1667afb34808dce69499898d3578','1da1b4c3931c2d6d861aac56de5b4f5a','s',
   E'\n     CASE WHEN b.parent_bank_id IS NOT NULL AND latest_parent.id IS DISTINCT FROM br.parent_bank_revision_id THEN ''unreviewed''',
   E'\n    CASE WHEN b.parent_bank_id IS NOT NULL AND latest_parent.id IS DISTINCT FROM br.parent_bank_revision_id THEN ''unreviewed''')
 )x(ordinal,signature,canonical_md5,provider_md5,volatility,provider_fragment,canonical_fragment) ORDER BY ordinal LOOP
  SELECT * INTO before_function FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  IF before_function.oid IS NULL OR pg_get_userbyid(before_function.proowner)<>'postgres'
   OR before_function.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
   OR before_function.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']
   OR NOT before_function.prosecdef OR before_function.provolatile::text<>expected.volatility
  THEN RAISE EXCEPTION 'RTN_CORE_RECONCILIATION_AUTHORITY_CHANGED:%',expected.signature;END IF;
  before_metadata:=to_jsonb(before_function)-'prosrc';
  IF md5(before_function.prosrc)=expected.provider_md5 THEN
   IF(length(before_function.prosrc)-length(replace(before_function.prosrc,expected.provider_fragment,'')))/length(expected.provider_fragment)<>1
   THEN RAISE EXCEPTION 'RTN_CORE_RECONCILIATION_FRAGMENT_CHANGED:%',expected.signature;END IF;
   body:=replace(before_function.prosrc,expected.provider_fragment,expected.canonical_fragment);
   IF md5(body)<>expected.canonical_md5 THEN RAISE EXCEPTION 'RTN_CORE_RECONCILIATION_CANONICAL_BODY_MISMATCH:%',expected.signature;END IF;
   definition:=pg_get_functiondef(before_function.oid);
   IF(length(definition)-length(replace(definition,before_function.prosrc,'')))/length(before_function.prosrc)<>1
   THEN RAISE EXCEPTION 'RTN_CORE_RECONCILIATION_DEFINITION_CHANGED:%',expected.signature;END IF;
   EXECUTE replace(definition,before_function.prosrc,body);
  ELSIF md5(before_function.prosrc)<>expected.canonical_md5 THEN
   RAISE EXCEPTION 'RTN_CORE_RECONCILIATION_UNKNOWN_BODY:%',expected.signature;
  END IF;
  SELECT * INTO after_function FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  IF after_function.oid IS DISTINCT FROM before_function.oid
   OR md5(after_function.prosrc) IS DISTINCT FROM expected.canonical_md5
   OR to_jsonb(after_function)-'prosrc' IS DISTINCT FROM before_metadata
  THEN RAISE EXCEPTION 'RTN_CORE_RECONCILIATION_POSTCONDITION_FAILED:%',expected.signature;END IF;
 END LOOP;
END;$rtn_core_whitespace$;
