-- Forward-only retained admission-draft scope correction. Do not replay 1300-1800.
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
