-- Root-only NEW forward correction. Does not replay any installed migration.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL search_path=pg_catalog,public;
DO $scope_owner$
DECLARE
 canonical constant text:=$scope_canonical$-- Forward-only retained admission-draft scope correction. Do not replay 1300-1800.
-- The stored draft/history, current group, dates, actions and all grants are preserved.
-- A retained draft from another resolved group is unavailable in this current row.
BEGIN;
SET LOCAL search_path=pg_catalog,public;
DO $scope_forward$
DECLARE
 target_oid oid:=to_regprocedure('uc_document_chain_private.row_value(uuid,jsonb,uuid,uuid,boolean)');
 patch jsonb:=$scope_patch${"identity":"uc_document_chain_private.row_value(uuid,jsonb,uuid,uuid,boolean)","before_md5":"7a0a04e4587c1fda6172ef781910e140","after_md5":"343a7508d39857f94665cb8cca1c8092","old":"    source:=jsonb_build_object('kind','admission_draft','id',d.id,'revision',d.revision,'enrollment_id',e.enrollment_id,'group_id',d.group_id);\n    IF d.status<>'disabled' AND coalesce((projection->>'stale')::boolean,true) IS FALSE AND coalesce((projection->>'registered_locked')::boolean,true) IS FALSE THEN\n     state:=CASE WHEN d.status='prepared' THEN 'draft' ELSE 'needs_information' END;\n     code:=CASE WHEN d.status='prepared' THEN 'DRAFT_NOT_APPROVED' ELSE 'DRAFT_NEEDS_INFORMATION' END;\n     why:=CASE WHEN d.status='prepared' THEN 'Подготовлен проект; подпись и регистрационный номер ещё не оформлены.' ELSE 'Проект сохранён; перед оформлением нужно уточнить сведения о программе и приёме.' END;can_open:=NOT p_self;\n    ELSE state:='needs_information';code:=CASE WHEN d.status='disabled' THEN 'PREPARATION_DISABLED' WHEN coalesce((projection->>'stale')::boolean,true) THEN 'DRAFT_SOURCE_CHANGED' ELSE 'DRAFT_NEEDS_INFORMATION' END;\n     why:=CASE WHEN d.status='disabled' THEN 'Автоподготовка проекта отключена в настройках.' WHEN coalesce((projection->>'stale')::boolean,true) THEN 'Исходные сведения изменились; обновите проект в настройках зачисления.' ELSE 'Перед подготовкой проекта нужны сведения о группе и программе.' END;END IF;\n","next":"    IF d.group_id IS DISTINCT FROM g THEN\n     source:=NULL;can_open:=false;state:='needs_information';code:='DRAFT_SOURCE_CHANGED';\n     why:='Исходные сведения изменились; обновите проект в настройках зачисления.';\n    ELSE\n    source:=jsonb_build_object('kind','admission_draft','id',d.id,'revision',d.revision,'enrollment_id',e.enrollment_id,'group_id',d.group_id);\n    IF d.status<>'disabled' AND coalesce((projection->>'stale')::boolean,true) IS FALSE AND coalesce((projection->>'registered_locked')::boolean,true) IS FALSE THEN\n     state:=CASE WHEN d.status='prepared' THEN 'draft' ELSE 'needs_information' END;\n     code:=CASE WHEN d.status='prepared' THEN 'DRAFT_NOT_APPROVED' ELSE 'DRAFT_NEEDS_INFORMATION' END;\n     why:=CASE WHEN d.status='prepared' THEN 'Подготовлен проект; подпись и регистрационный номер ещё не оформлены.' ELSE 'Проект сохранён; перед оформлением нужно уточнить сведения о программе и приёме.' END;can_open:=NOT p_self;\n    ELSE state:='needs_information';code:=CASE WHEN d.status='disabled' THEN 'PREPARATION_DISABLED' WHEN coalesce((projection->>'stale')::boolean,true) THEN 'DRAFT_SOURCE_CHANGED' ELSE 'DRAFT_NEEDS_INFORMATION' END;\n     why:=CASE WHEN d.status='disabled' THEN 'Автоподготовка проекта отключена в настройках.' WHEN coalesce((projection->>'stale')::boolean,true) THEN 'Исходные сведения изменились; обновите проект в настройках зачисления.' ELSE 'Перед подготовкой проекта нужны сведения о группе и программе.' END;END IF;\n    END IF;\n"}$scope_patch$::jsonb;
 old_body text;new_body text;old_definition text;new_definition text;
 old_metadata jsonb;actual_metadata jsonb;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres' OR target_oid IS NULL
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_DEPENDENCY_UNAVAILABLE';END IF;
 SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc'
 INTO STRICT old_body,old_definition,old_metadata FROM pg_proc p WHERE p.oid=target_oid;
 IF (old_metadata->>'proowner')::oid IS DISTINCT FROM 'postgres'::regrole::oid
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_OWNER_CHANGED';END IF;
 IF md5(old_body) IS DISTINCT FROM patch->>'before_md5'
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_PREIMAGE_CHANGED';END IF;
 IF length(patch->>'old')=0 OR
  (length(old_body)-length(replace(old_body,patch->>'old','')))/length(patch->>'old')<>1
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_UNIQUE_NEEDLE_CHANGED';END IF;
 new_body:=replace(old_body,patch->>'old',patch->>'next');
 IF md5(new_body) IS DISTINCT FROM patch->>'after_md5'
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_EXPECTED_POSTIMAGE_CHANGED';END IF;
 IF length(old_body)=0 OR
  (length(old_definition)-length(replace(old_definition,old_body,'')))/length(old_body)<>1
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_UNIQUE_DEFINITION_BODY_CHANGED';END IF;
 new_definition:=replace(old_definition,old_body,new_body);
 EXECUTE new_definition;
 SELECT to_jsonb(p)-'prosrc' INTO STRICT actual_metadata FROM pg_proc p WHERE p.oid=target_oid;
 IF actual_metadata IS DISTINCT FROM old_metadata
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_EXISTING_METADATA_AUTHORITY_CHANGED';END IF;
 IF (SELECT p.prosrc FROM pg_proc p WHERE p.oid=target_oid) IS DISTINCT FROM new_body
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_ACTUAL_POSTIMAGE_CHANGED';END IF;
END;$scope_forward$;
COMMIT;
$scope_canonical$;
 before_catalog jsonb; before_business jsonb; before_ledger jsonb; receipt jsonb;
 qualification constant jsonb:=$scope_binding$null$scope_binding$::jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(23190000);
 IF current_user<>'postgres' OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261123190000') OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='uc_document_chain_private.row_value(uuid,jsonb,uuid,uuid,boolean)'::regprocedure) IS DISTINCT FROM '7a0a04e4587c1fda6172ef781910e140' THEN RAISE EXCEPTION 'UC_SCOPE_REQUIRE_UNINSTALLED_EXACT_CURRENT_SOURCE'; END IF;
 IF encode(sha256(convert_to(canonical,'UTF8')),'hex')<>'95ffe446fde157e7ed7d3341a6a14e529d785e5b50ac42719852895b3a706272' THEN RAISE EXCEPTION 'UC_SCOPE_CANONICAL_BYTES';END IF;
 before_catalog:=(SELECT jsonb_build_object(
 'functions',(SELECT md5(coalesce(string_agg(md5((CASE WHEN p.oid='uc_document_chain_private.row_value(uuid,jsonb,uuid,uuid,boolean)'::regprocedure THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text),'' ORDER BY p.oid),'')) FROM pg_proc p),
 'namespaces',(SELECT md5(coalesce(string_agg(md5(to_jsonb(n)::text),'' ORDER BY n.oid),'')) FROM pg_namespace n),
 'classes_security',(SELECT md5(coalesce(string_agg(md5(jsonb_build_array(c.oid,c.relname,c.relnamespace,c.relowner,c.relkind,c.relacl,c.relrowsecurity,c.relforcerowsecurity)::text),'' ORDER BY c.oid),'')) FROM pg_class c),
 'policies',(SELECT md5(coalesce(string_agg(md5(to_jsonb(p)::text),'' ORDER BY p.oid),'')) FROM pg_policy p),
 'default_acl',(SELECT md5(coalesce(string_agg(md5(to_jsonb(d)::text),'' ORDER BY d.oid),'')) FROM pg_default_acl d),
 'role_membership',(SELECT md5(coalesce(string_agg(md5(to_jsonb(a)::text),'' ORDER BY a.roleid,a.member,a.grantor),'')) FROM pg_auth_members a)
));before_business:=(SELECT jsonb_agg(jsonb_build_object('table',s.t,'count',s.n,'hash',s.h) ORDER BY s.t) FROM (SELECT 'public.uc_automatic_admission_drafts' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM public.uc_automatic_admission_drafts r WHERE r.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b
UNION ALL
SELECT 'public.uc_document_registry_records' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM public.uc_document_registry_records r WHERE r.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b
UNION ALL
SELECT 'public.education_document_records' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM public.education_document_records r WHERE r.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b
UNION ALL
SELECT 'public.org_documents' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM public.org_documents r WHERE r.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b
UNION ALL
SELECT 'public.org_document_versions' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM public.org_document_versions r WHERE r.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b
UNION ALL
SELECT 'uc_individual_orders_private.orders' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM uc_individual_orders_private.orders r WHERE r.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b
UNION ALL
SELECT 'public.courses' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM public.courses r WHERE r.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b
UNION ALL
SELECT 'public.enrollments' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM public.enrollments r JOIN public.courses c ON c.id=r.course_id WHERE c.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b) s);before_ledger:=(SELECT jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY version),''))) FROM supabase_migrations.schema_migrations t);
 IF (qualification IS NOT NULL AND qualification<>'null'::jsonb AND qualification->>'kind'='UC_SCOPE_QUALIFIED_ROLLBACK' AND qualification->>'source_sha256'='95ffe446fde157e7ed7d3341a6a14e529d785e5b50ac42719852895b3a706272' AND qualification->>'after_body_md5'='343a7508d39857f94665cb8cca1c8092' AND qualification->'forced_rollback'='true'::jsonb AND qualification->'old_source_restored'='true'::jsonb) IS DISTINCT FROM true OR qualification->'catalog_before' IS DISTINCT FROM before_catalog OR qualification->'business_before' IS DISTINCT FROM before_business OR qualification->'ledger_before' IS DISTINCT FROM before_ledger THEN RAISE EXCEPTION 'UC_SCOPE_ACTUAL_QUALIFICATION_BINDING_REQUIRED';END IF;
 EXECUTE $scope_payload$SET LOCAL search_path=pg_catalog,public;
DO $scope_forward$
DECLARE
 target_oid oid:=to_regprocedure('uc_document_chain_private.row_value(uuid,jsonb,uuid,uuid,boolean)');
 patch jsonb:=$scope_patch${"identity":"uc_document_chain_private.row_value(uuid,jsonb,uuid,uuid,boolean)","before_md5":"7a0a04e4587c1fda6172ef781910e140","after_md5":"343a7508d39857f94665cb8cca1c8092","old":"    source:=jsonb_build_object('kind','admission_draft','id',d.id,'revision',d.revision,'enrollment_id',e.enrollment_id,'group_id',d.group_id);\n    IF d.status<>'disabled' AND coalesce((projection->>'stale')::boolean,true) IS FALSE AND coalesce((projection->>'registered_locked')::boolean,true) IS FALSE THEN\n     state:=CASE WHEN d.status='prepared' THEN 'draft' ELSE 'needs_information' END;\n     code:=CASE WHEN d.status='prepared' THEN 'DRAFT_NOT_APPROVED' ELSE 'DRAFT_NEEDS_INFORMATION' END;\n     why:=CASE WHEN d.status='prepared' THEN 'Подготовлен проект; подпись и регистрационный номер ещё не оформлены.' ELSE 'Проект сохранён; перед оформлением нужно уточнить сведения о программе и приёме.' END;can_open:=NOT p_self;\n    ELSE state:='needs_information';code:=CASE WHEN d.status='disabled' THEN 'PREPARATION_DISABLED' WHEN coalesce((projection->>'stale')::boolean,true) THEN 'DRAFT_SOURCE_CHANGED' ELSE 'DRAFT_NEEDS_INFORMATION' END;\n     why:=CASE WHEN d.status='disabled' THEN 'Автоподготовка проекта отключена в настройках.' WHEN coalesce((projection->>'stale')::boolean,true) THEN 'Исходные сведения изменились; обновите проект в настройках зачисления.' ELSE 'Перед подготовкой проекта нужны сведения о группе и программе.' END;END IF;\n","next":"    IF d.group_id IS DISTINCT FROM g THEN\n     source:=NULL;can_open:=false;state:='needs_information';code:='DRAFT_SOURCE_CHANGED';\n     why:='Исходные сведения изменились; обновите проект в настройках зачисления.';\n    ELSE\n    source:=jsonb_build_object('kind','admission_draft','id',d.id,'revision',d.revision,'enrollment_id',e.enrollment_id,'group_id',d.group_id);\n    IF d.status<>'disabled' AND coalesce((projection->>'stale')::boolean,true) IS FALSE AND coalesce((projection->>'registered_locked')::boolean,true) IS FALSE THEN\n     state:=CASE WHEN d.status='prepared' THEN 'draft' ELSE 'needs_information' END;\n     code:=CASE WHEN d.status='prepared' THEN 'DRAFT_NOT_APPROVED' ELSE 'DRAFT_NEEDS_INFORMATION' END;\n     why:=CASE WHEN d.status='prepared' THEN 'Подготовлен проект; подпись и регистрационный номер ещё не оформлены.' ELSE 'Проект сохранён; перед оформлением нужно уточнить сведения о программе и приёме.' END;can_open:=NOT p_self;\n    ELSE state:='needs_information';code:=CASE WHEN d.status='disabled' THEN 'PREPARATION_DISABLED' WHEN coalesce((projection->>'stale')::boolean,true) THEN 'DRAFT_SOURCE_CHANGED' ELSE 'DRAFT_NEEDS_INFORMATION' END;\n     why:=CASE WHEN d.status='disabled' THEN 'Автоподготовка проекта отключена в настройках.' WHEN coalesce((projection->>'stale')::boolean,true) THEN 'Исходные сведения изменились; обновите проект в настройках зачисления.' ELSE 'Перед подготовкой проекта нужны сведения о группе и программе.' END;END IF;\n    END IF;\n"}$scope_patch$::jsonb;
 old_body text;new_body text;old_definition text;new_definition text;
 old_metadata jsonb;actual_metadata jsonb;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres' OR target_oid IS NULL
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_DEPENDENCY_UNAVAILABLE';END IF;
 SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc'
 INTO STRICT old_body,old_definition,old_metadata FROM pg_proc p WHERE p.oid=target_oid;
 IF (old_metadata->>'proowner')::oid IS DISTINCT FROM 'postgres'::regrole::oid
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_OWNER_CHANGED';END IF;
 IF md5(old_body) IS DISTINCT FROM patch->>'before_md5'
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_PREIMAGE_CHANGED';END IF;
 IF length(patch->>'old')=0 OR
  (length(old_body)-length(replace(old_body,patch->>'old','')))/length(patch->>'old')<>1
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_UNIQUE_NEEDLE_CHANGED';END IF;
 new_body:=replace(old_body,patch->>'old',patch->>'next');
 IF md5(new_body) IS DISTINCT FROM patch->>'after_md5'
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_EXPECTED_POSTIMAGE_CHANGED';END IF;
 IF length(old_body)=0 OR
  (length(old_definition)-length(replace(old_definition,old_body,'')))/length(old_body)<>1
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_UNIQUE_DEFINITION_BODY_CHANGED';END IF;
 new_definition:=replace(old_definition,old_body,new_body);
 EXECUTE new_definition;
 SELECT to_jsonb(p)-'prosrc' INTO STRICT actual_metadata FROM pg_proc p WHERE p.oid=target_oid;
 IF actual_metadata IS DISTINCT FROM old_metadata
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_EXISTING_METADATA_AUTHORITY_CHANGED';END IF;
 IF (SELECT p.prosrc FROM pg_proc p WHERE p.oid=target_oid) IS DISTINCT FROM new_body
 THEN RAISE EXCEPTION 'UC_CHAIN_DRAFT_SCOPE_ACTUAL_POSTIMAGE_CHANGED';END IF;
END;$scope_forward$;$scope_payload$;
 IF (SELECT jsonb_build_object(
 'functions',(SELECT md5(coalesce(string_agg(md5((CASE WHEN p.oid='uc_document_chain_private.row_value(uuid,jsonb,uuid,uuid,boolean)'::regprocedure THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text),'' ORDER BY p.oid),'')) FROM pg_proc p),
 'namespaces',(SELECT md5(coalesce(string_agg(md5(to_jsonb(n)::text),'' ORDER BY n.oid),'')) FROM pg_namespace n),
 'classes_security',(SELECT md5(coalesce(string_agg(md5(jsonb_build_array(c.oid,c.relname,c.relnamespace,c.relowner,c.relkind,c.relacl,c.relrowsecurity,c.relforcerowsecurity)::text),'' ORDER BY c.oid),'')) FROM pg_class c),
 'policies',(SELECT md5(coalesce(string_agg(md5(to_jsonb(p)::text),'' ORDER BY p.oid),'')) FROM pg_policy p),
 'default_acl',(SELECT md5(coalesce(string_agg(md5(to_jsonb(d)::text),'' ORDER BY d.oid),'')) FROM pg_default_acl d),
 'role_membership',(SELECT md5(coalesce(string_agg(md5(to_jsonb(a)::text),'' ORDER BY a.roleid,a.member,a.grantor),'')) FROM pg_auth_members a)
)) IS DISTINCT FROM before_catalog OR (SELECT jsonb_agg(jsonb_build_object('table',s.t,'count',s.n,'hash',s.h) ORDER BY s.t) FROM (SELECT 'public.uc_automatic_admission_drafts' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM public.uc_automatic_admission_drafts r WHERE r.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b
UNION ALL
SELECT 'public.uc_document_registry_records' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM public.uc_document_registry_records r WHERE r.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b
UNION ALL
SELECT 'public.education_document_records' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM public.education_document_records r WHERE r.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b
UNION ALL
SELECT 'public.org_documents' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM public.org_documents r WHERE r.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b
UNION ALL
SELECT 'public.org_document_versions' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM public.org_document_versions r WHERE r.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b
UNION ALL
SELECT 'uc_individual_orders_private.orders' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM uc_individual_orders_private.orders r WHERE r.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b
UNION ALL
SELECT 'public.courses' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM public.courses r WHERE r.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b
UNION ALL
SELECT 'public.enrollments' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (SELECT to_jsonb(r)::text AS row_value FROM public.enrollments r JOIN public.courses c ON c.id=r.course_id WHERE c.organization_id=ANY(ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[])) b) s) IS DISTINCT FROM before_business OR (SELECT jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY version),''))) FROM supabase_migrations.schema_migrations t) IS DISTINCT FROM before_ledger THEN RAISE EXCEPTION 'UC_SCOPE_UNAUTHORIZED_CATALOG_BUSINESS_OR_LEDGER_CHANGE'; END IF;
 receipt:=jsonb_build_object('kind','UC_SCOPE_ACTUAL_INSTALL','source_sha256','95ffe446fde157e7ed7d3341a6a14e529d785e5b50ac42719852895b3a706272','source_bytes',octet_length(convert_to(canonical,'UTF8')),'catalog_before',before_catalog,'business_before',before_business,'ledger_before',before_ledger,'before_body_md5','7a0a04e4587c1fda6172ef781910e140','after_body_md5',(SELECT md5(prosrc) FROM pg_proc WHERE oid='uc_document_chain_private.row_value(uuid,jsonb,uuid,uuid,boolean)'::regprocedure),'observed_at',clock_timestamp(),'no_business_rpcs_or_auth_claim_changes',true);
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261123190000','uc_document_chain_draft_scope',ARRAY[canonical]);
 receipt:=receipt||jsonb_build_object('installed',true,'ledger_after',(SELECT jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY version),''))) FROM supabase_migrations.schema_migrations t));
 PERFORM set_config('uc.scope_owner_receipt',receipt::text,true);
END;$scope_owner$;
SELECT current_setting('uc.scope_owner_receipt')::jsonb AS result;
COMMIT;
