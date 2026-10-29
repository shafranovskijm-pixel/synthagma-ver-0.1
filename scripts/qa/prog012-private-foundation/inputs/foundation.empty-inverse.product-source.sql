-- SOURCE REVIEW ONLY: destructive inverse allowed ONLY before either new store has a row.
-- No CASCADE, old record deletion or history cleanup. Not a production run instruction.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.platform_private_file_delivery_v2_current,public.platform_private_file_delivery_v2_events IN ACCESS EXCLUSIVE MODE NOWAIT;
DO $pfd_empty_inverse$
DECLARE v_expected jsonb:=$pfd_inverse_bodies$[{"signature":"public.pfd_v2_material_shape(jsonb,uuid,uuid)","bodySha256":"598b4e07bd52233a84a28139c655b7e74bd3960eb96a44547e2fe3bbb98dba01","config":["search_path=pg_catalog, public, pg_temp"],"volatility":"i"},{"signature":"public.pfd_v2_history_immutable()","bodySha256":"20e6d88adde957c8e4568b5e2033dac6f0eb1c9df85234a1792b7b234a759ac8","config":["search_path=pg_catalog, public, pg_temp"],"volatility":"v"},{"signature":"public.pfd_v2_rollout_lock(uuid,boolean)","bodySha256":"0b9589cab5e0470442f0c8a01d8756ce926331c40f27a1ccd497f9b5dc00db7c","config":["search_path=pg_catalog, public, pg_temp","lock_timeout=3s"],"volatility":"v"},{"signature":"public.pfd_v2_own_source_fence(uuid,text,boolean)","bodySha256":"e074cbb41c3e48f48eafb78eab87e582633e3c624aec924f798adcefc8b0d1f9","config":["search_path=pg_catalog, public, pg_temp","lock_timeout=3s"],"volatility":"v"}]$pfd_inverse_bodies$::jsonb;v_entry jsonb;v_proc pg_proc;v_rel oid;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres' OR auth.uid() IS NOT NULL OR auth.role() IS NOT NULL THEN RAISE EXCEPTION 'PFD_INVERSE_OWNER_NO_SUBJECT_REQUIRED';END IF;
 IF public.pcf_v1_enforcement_stamp() IS DISTINCT FROM '5d8e867d99288c8e1372c1f7e49c4ca07341ce2fb197b5aa2ff593529095aee6' THEN RAISE EXCEPTION 'PFD_INVERSE_EXISTING_CAPTURE_DRIFT';END IF;
 -- AX NOWAIT was acquired on BOTH stores before this emptiness check, in this same transaction.
 IF EXISTS(SELECT 1 FROM public.platform_private_file_delivery_v2_current) OR EXISTS(SELECT 1 FROM public.platform_private_file_delivery_v2_events) THEN
  RAISE EXCEPTION 'PFD_INVERSE_REQUIRES_EMPTY_NEW_HISTORY' USING ERRCODE='55000';END IF;
 FOR v_entry IN SELECT value FROM jsonb_array_elements(v_expected) LOOP
  SELECT * INTO v_proc FROM pg_proc catalog_proc WHERE catalog_proc.oid=to_regprocedure(v_entry->>'signature');
  IF v_proc.oid IS NULL OR v_proc.proowner IS DISTINCT FROM 'postgres'::regrole OR NOT v_proc.prosecdef
   OR v_proc.provolatile::text IS DISTINCT FROM v_entry->>'volatility'
   OR to_jsonb(v_proc.proconfig) IS DISTINCT FROM v_entry->'config'
   OR encode(sha256(convert_to(v_proc.prosrc,'UTF8')),'hex') IS DISTINCT FROM v_entry->>'bodySha256'
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(v_proc.proacl,acldefault('f',v_proc.proowner))) privilege_row WHERE privilege_row.grantee<>v_proc.proowner) THEN
   RAISE EXCEPTION 'PFD_INVERSE_NEW_FUNCTION_DRIFT: %',v_entry->>'signature';END IF;
 END LOOP;
 FOREACH v_rel IN ARRAY ARRAY['public.platform_private_file_delivery_v2_current'::regclass::oid,'public.platform_private_file_delivery_v2_events'::regclass::oid] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class catalog_relation WHERE catalog_relation.oid=v_rel AND catalog_relation.relowner='postgres'::regrole
    AND catalog_relation.relnamespace='public'::regnamespace AND catalog_relation.relkind='r' AND catalog_relation.relrowsecurity)
   OR EXISTS(SELECT 1 FROM pg_constraint catalog_constraint WHERE catalog_constraint.contype='f' AND(catalog_constraint.conrelid=v_rel OR catalog_constraint.confrelid=v_rel))
   OR EXISTS(SELECT 1 FROM pg_class catalog_relation CROSS JOIN LATERAL aclexplode(coalesce(catalog_relation.relacl,acldefault('r',catalog_relation.relowner))) privilege_row
    WHERE catalog_relation.oid=v_rel AND privilege_row.grantee<>catalog_relation.relowner) THEN RAISE EXCEPTION 'PFD_INVERSE_NEW_TABLE_DRIFT';END IF;
 END LOOP;
END;$pfd_empty_inverse$;
DROP TABLE public.platform_private_file_delivery_v2_events;
DROP TABLE public.platform_private_file_delivery_v2_current;
DROP FUNCTION public.pfd_v2_own_source_fence(uuid,text,boolean);
DROP FUNCTION public.pfd_v2_rollout_lock(uuid,boolean);
DROP FUNCTION public.pfd_v2_history_immutable();
DROP FUNCTION public.pfd_v2_material_shape(jsonb,uuid,uuid);
DO $pfd_inverse_post$
BEGIN
 IF public.pcf_v1_enforcement_stamp() IS DISTINCT FROM '5d8e867d99288c8e1372c1f7e49c4ca07341ce2fb197b5aa2ff593529095aee6' THEN RAISE EXCEPTION 'PFD_INVERSE_OLD_CAPTURE_CHANGED';END IF;
END;$pfd_inverse_post$;
COMMIT;
