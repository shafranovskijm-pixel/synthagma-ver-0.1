-- Exact post609 privacy sequence; preserve full in-database pg_proc metadata exceptprosrc.
DO $uc013_privacy_1$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_erase_data(uuid,text)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC013';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM '725f8d0d90273d393989e39f10c176b4' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC013';END IF;
 v_patched:=v_original;
 v_needle:=$uc013_privacy_1_needle_0$ PERFORM set_config('sintagma.account_deletion_erase_user',u::text,true);
$uc013_privacy_1_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC013';END IF;
 v_patched:=replace(v_patched,v_needle,$uc013_privacy_1_replacement_0$ PERFORM set_config('sintagma.account_deletion_erase_user',u::text,true);
 PERFORM public.uc_erase_group_education_facts(u);
$uc013_privacy_1_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM 'a10c73088117f3422b4eb2ec708dd0ad' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC013';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC013';END IF;
END;
$uc013_privacy_1$;

DO $uc013_privacy_2$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_personal_row_counts(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC013';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM '6213c0e6f96a92f65e081976af522e74' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC013';END IF;
 v_patched:=v_original;
 v_needle:=$uc013_privacy_2_needle_0$ RETURN result;$uc013_privacy_2_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC013';END IF;
 v_patched:=replace(v_patched,v_needle,$uc013_privacy_2_replacement_0$ result:=result||public.uc_group_education_personal_counts(p_user_id);
 RETURN result;$uc013_privacy_2_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM '52ed26a701debe2c9f9299c04b9db8bb' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC013';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC013';END IF;
END;
$uc013_privacy_2$;

DO $uc013_privacy_3$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_snapshot(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC013';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM '7238852e3da99d7b769e61d65a95dccb' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC013';END IF;
 v_patched:=v_original;
 v_needle:=$uc013_privacy_3_needle_0$ v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_admission_cases WHERE organization_id=v_org);$uc013_privacy_3_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC013';END IF;
 v_patched:=replace(v_patched,v_needle,$uc013_privacy_3_replacement_0$ v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_admission_cases WHERE organization_id=v_org);
 v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_group_education_states WHERE organization_id=v_org);$uc013_privacy_3_replacement_0$);
 v_needle:=$uc013_privacy_3_needle_1$ v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc013_privacy_3_needle_1$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC013';END IF;
 v_patched:=replace(v_patched,v_needle,$uc013_privacy_3_replacement_1$ v_categories:=v_categories||public.uc_group_education_deletion_preview(p_user_id);
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc013_privacy_3_replacement_1$);
 IF md5(v_patched) IS DISTINCT FROM '7725e2a24c177164694f8266cbf344ba' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC013';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC013';END IF;
END;
$uc013_privacy_3$;

-- Exact post609 privacy sequence; preserve full in-database pg_proc metadata exceptprosrc.
DO $uc014_privacy_1$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_personal_row_counts(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC014';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM '52ed26a701debe2c9f9299c04b9db8bb' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC014';END IF;
 v_patched:=v_original;
 v_needle:=$uc014_privacy_1_needle_0$ RETURN result;$uc014_privacy_1_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC014';END IF;
 v_patched:=replace(v_patched,v_needle,$uc014_privacy_1_replacement_0$ result:=result||public.uc_learning_personal_counts(p_user_id);
 RETURN result;$uc014_privacy_1_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM 'd263532fd944bf09e2adec1f0eac9fee' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC014';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC014';END IF;
END;
$uc014_privacy_1$;

DO $uc014_privacy_2$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_snapshot(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC014';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM '7725e2a24c177164694f8266cbf344ba' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC014';END IF;
 v_patched:=v_original;
 v_needle:=$uc014_privacy_2_needle_0$ v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc014_privacy_2_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC014';END IF;
 v_patched:=replace(v_patched,v_needle,$uc014_privacy_2_replacement_0$ SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_learning_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','learning_outcomes','label','Результаты обучения и решения: личные строки удаляются, атрибуция обезличивается','count',v_count,'action','delete_or_anonymize'));END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc014_privacy_2_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM 'dce5ffea181b5136a9eb82490438f962' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC014';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC014';END IF;
END;
$uc014_privacy_2$;

DO $uc014_privacy_3$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_erase_data(uuid,text)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC014';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM 'a10c73088117f3422b4eb2ec708dd0ad' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC014';END IF;
 v_patched:=v_original;
 v_needle:=$uc014_privacy_3_needle_0$ IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(u)) n WHERE (n->>'count')::bigint>0)$uc014_privacy_3_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC014';END IF;
 v_patched:=replace(v_patched,v_needle,$uc014_privacy_3_replacement_0$ PERFORM public.uc_learning_erase_user(u);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(u)) n WHERE (n->>'count')::bigint>0)$uc014_privacy_3_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM '8b2de268a017d85ee99eb3acee4c87a5' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC014';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC014';END IF;
END;
$uc014_privacy_3$;

-- Exact post609 privacy sequence; preserve full in-database pg_proc metadata exceptprosrc.
DO $uc015_privacy_1$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_personal_row_counts(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC015';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM 'd263532fd944bf09e2adec1f0eac9fee' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC015';END IF;
 v_patched:=v_original;
 v_needle:=$uc015_privacy_1_needle_0$ RETURN result;$uc015_privacy_1_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC015';END IF;
 v_patched:=replace(v_patched,v_needle,$uc015_privacy_1_replacement_0$ result:=result||public.uc_custom_journal_personal_counts(p_user_id);
 RETURN result;$uc015_privacy_1_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM 'bf7c8c1cb09cfdfe35b3c67ecc653ff3' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC015';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC015';END IF;
END;
$uc015_privacy_1$;

DO $uc015_privacy_2$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_snapshot(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC015';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM 'dce5ffea181b5136a9eb82490438f962' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC015';END IF;
 v_patched:=v_original;
 v_needle:=$uc015_privacy_2_needle_0$ v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc015_privacy_2_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC015';END IF;
 v_patched:=replace(v_patched,v_needle,$uc015_privacy_2_replacement_0$ SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_custom_journal_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','custom_journals','label','Собственные журналы: строки выбранного лица удаляются, авторские копии обезличиваются','count',v_count,'action','delete_or_anonymize'));END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc015_privacy_2_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM 'f3100b7f572115c4b22c84a82690a584' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC015';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC015';END IF;
END;
$uc015_privacy_2$;

DO $uc015_privacy_3$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_erase_data(uuid,text)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC015';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM '8b2de268a017d85ee99eb3acee4c87a5' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC015';END IF;
 v_patched:=v_original;
 v_needle:=$uc015_privacy_3_needle_0$ PERFORM public.uc_learning_erase_user(u);$uc015_privacy_3_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC015';END IF;
 v_patched:=replace(v_patched,v_needle,$uc015_privacy_3_replacement_0$ PERFORM public.uc_learning_erase_user(u);
 PERFORM public.uc_custom_journal_erase_user(u);$uc015_privacy_3_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM '96a99f5bbe4c1389ef920dcdc82ce82b' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC015';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC015';END IF;
END;
$uc015_privacy_3$;

-- Exact post609 privacy sequence; preserve full in-database pg_proc metadata exceptprosrc.
DO $uc017_privacy_1$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_personal_row_counts(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC017';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM 'bf7c8c1cb09cfdfe35b3c67ecc653ff3' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC017';END IF;
 v_patched:=v_original;
 v_needle:=$uc017_privacy_1_needle_0$ RETURN result;$uc017_privacy_1_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC017';END IF;
 v_patched:=replace(v_patched,v_needle,$uc017_privacy_1_replacement_0$ result:=result||public.uc_session_personal_counts(p_user_id);
 RETURN result;$uc017_privacy_1_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM '5b88dbf3ae72ae78fcd5c9f3dbca3872' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC017';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC017';END IF;
END;
$uc017_privacy_1$;

DO $uc017_privacy_2$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_snapshot(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC017';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM 'f3100b7f572115c4b22c84a82690a584' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC017';END IF;
 v_patched:=v_original;
 v_needle:=$uc017_privacy_2_needle_0$ v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc017_privacy_2_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC017';END IF;
 v_patched:=replace(v_patched,v_needle,$uc017_privacy_2_replacement_0$ SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_session_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','conducted_sessions','label','Проведённые занятия, посещение и черновики: личные сведения обезличиваются, редакции сохраняются','count',v_count,'action','anonymize'));END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc017_privacy_2_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM 'bd5bd6dd7079951d1712d51fe2b4d3b1' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC017';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC017';END IF;
END;
$uc017_privacy_2$;

DO $uc017_privacy_3$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_erase_data(uuid,text)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC017';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM '96a99f5bbe4c1389ef920dcdc82ce82b' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC017';END IF;
 v_patched:=v_original;
 v_needle:=$uc017_privacy_3_needle_0$ IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(u)) n WHERE (n->>'count')::bigint>0)$uc017_privacy_3_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC017';END IF;
 v_patched:=replace(v_patched,v_needle,$uc017_privacy_3_replacement_0$ PERFORM public.uc_session_erase_user(u);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(u)) n WHERE (n->>'count')::bigint>0)$uc017_privacy_3_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM 'a496bbcd2154d994c9e83888313a84a3' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC017';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC017';END IF;
END;
$uc017_privacy_3$;
