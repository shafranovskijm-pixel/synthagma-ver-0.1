DO $inverse_guard$ DECLARE r record;p record;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'PCC_TRUSTED_INSTALLER_REQUIRED';END IF;
 -- Serialize the empty check, function restore and DROP with every history INSERT in this SAME transaction.
 BEGIN
  LOCK TABLE public.platform_course_copy_file_bindings,public.platform_course_copy_file_cohorts IN ACCESS EXCLUSIVE MODE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCC_COPY_HISTORY_BUSY_FORWARD_REPAIR_REQUIRED' USING ERRCODE='40001';END;
 IF EXISTS(SELECT 1 FROM public.platform_course_copy_file_cohorts) OR EXISTS(SELECT 1 FROM public.platform_course_copy_file_bindings) THEN
  RAISE EXCEPTION 'PCC_RECORDED_COPY_HISTORY_FORWARD_REPAIR_REQUIRED';END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.purchase_marketplace_course(uuid,uuid,text,integer,text)'::regprocedure),'UTF8')),'hex')<>'13bb3f1acfba66ef5de19d53e8f80addfdb75b77df09282f6a3266bd1bf1c39a' THEN
  RAISE EXCEPTION 'PCC_PURCHASE_AFTERIMAGE_DRIFT';END IF;
 FOR r IN SELECT * FROM(VALUES
 ('public.pcc_v1_immutable()','7a1631d4891e31398a013875e8075123f9fd0b258e3395c2e32555934ba6339f',false),
 ('public.pcc_v1_actor()','51ae9c29eaf12a7c9d637a4fb47882e5b3c34ce57dc26af16fa34535945dc25a',true),
 ('public.pcc_v1_source_context(uuid,uuid)','06e1310f8f4dcea7b6f3b14cfcfd0f5564cbe4fbbba9cd29ac5c1f78f949a77c',true),
 ('public.pcc_v1_module_ready(uuid,uuid,uuid)','9c31bb8856c7bdc24458385b8499eebe12b0286dbe0259fc497a0c82daed5d0a',true),
 ('public.pcc_v1_learner_lesson_ready(uuid,uuid,uuid)','76eb69037a3ab7d4628aba03bcdf94dd5a9c3bd96a326e327627270973f3429f',true),
 ('public.pcc_v1_reference_row(uuid,text,uuid)','e88b6fa99d78003d38b9584dd998827e99000fb7c929ba533f8973f13c4936a0',true),
 ('public.pcc_v1_authorized_reference(uuid,text,uuid,text,text)','aaf68700afb154dc2f4249ac7b4a1bfa97ac8facb154bff64ead62f5b7a13cc3',true),
 ('public.pcc_v1_copy_binding_payload(uuid,jsonb)','aaadad497dbffab5af1282d522b09876fd2d70fe7ea650bbe756f2454c4f829a',true),
 ('public.read_course_exact_file_delivery_context(uuid,text,uuid,text,text)','c729e29c7f5a9853801587c3e8ff16458c8ca4aca2e6d13d6c584e93fe1aaedb',true),
 ('public.read_copied_course_exact_file(uuid,text,uuid,text,text,uuid,uuid)','438512230a77b2e0004179c83b2a7114f3b82849d38280a028014d74058f62a7',true),
 ('public.pcc_v1_add_new_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb)','801c710dcc16dcbbf5f9661b39ffd150591d0c2e485da09a7d63c6b380953670',true),
 ('public.pcc_v1_seal_new_copy(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)','f7ded2e7101ea3f0a5811af8d53860768bb66638a525df7d531ac83c8266a5f4',true),
 ('public.read_course_exact_file_delivery_mode(uuid,text)','f8b793bbc836893d29bb1657487aade3ccaec09dc6f9c72897c6163d98c91f1e',true)
 )v(signature,body_sha256,security_definer) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.signature);
  IF p.oid IS NULL OR pg_get_userbyid(p.proowner)<>'postgres' OR p.prosecdef IS DISTINCT FROM r.security_definer
   OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>r.body_sha256 THEN RAISE EXCEPTION 'PCC_FUNCTION_AFTERIMAGE_DRIFT';END IF;
 END LOOP;
END;$inverse_guard$;
