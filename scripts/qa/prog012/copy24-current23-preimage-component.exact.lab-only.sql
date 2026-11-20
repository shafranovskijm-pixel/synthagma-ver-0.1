DO $copy24_component$DECLARE r record;p record;BEGIN
 FOR r IN SELECT * FROM(VALUES
 ('public.account_deletion_access_allowed()','d2771ddc0a8ec9e0b9467fb7072313da89fa104664e206adbff53b40aeb76031',true),
 ('public.can_access_course_as_learner(uuid)','c331839711b91a3c1d332cb11f630cf8a717fc50de62ca79a279af76812ccbd9',true),
 ('public.can_access_course(uuid,text)','0e8df0e7c5f4af75144134f3137b4ef7923311e8bba9c502f227753be767b0e8',true),
 ('public.can_manage_course_files_org(uuid,text)','06c9a52d3dd34fdef7bfa94df81d2e6892ab0a38bd706d38950cf815fc7def5e',true),
 ('public.can_read_electronic_library_document(uuid)','ccf7cd2f66bdf75b1a7dac521f8162d883fdb4c6bf14e9c090977b36d59aca40',true),
 ('public.can_read_lesson_attachment(uuid)','ff1055812391017ac89a6911f2ec710e8fb949796b4b28c571959412799a81da',true),
 ('public.get_course_electronic_library_shell(uuid)','e4a9008592327f7e0e166bf762465c9d4768a1fb814d90a8873df4220e952f55',true),
 ('public.purchase_marketplace_course(uuid,uuid,text,integer,text)','4de50d3f8eb18c254172c3edac34c63087d5c8398119db45b595d90991acfe36',true),
 ('public.uc_enrollment_is_withdrawn(uuid)','565cb7347e955511694c82608d7c8985723b77462ba7a54822a05cda915c81ad',true),
 ('public._paid_20260922_course_read(uuid,boolean)','1639b82b90f6316afc59544960166e8ddcf79d58f4608360aca785167bd3e077',true),
 ('public._paid_20260922_lesson_read(uuid,boolean,boolean)','727aae1cdb02ed6544588d94c7a4096abb4110aaf8773b8f6891d1af37921779',true),
 ('public.paid_umk_20260922_can_read_assignment(uuid,uuid,boolean)','f4e4a5cae4c3182bb1f177f95503aee6205b74aa180aba8ec2d5b89fe2f667a1',true),
 ('public.paid_umk_20260922_can_read_document(uuid)','38537ece3ae9b4a6d3207a7ab0e0808605b3267960130f3184de3ec120b39f15',true),
 ('public.paid_umk_20260922_protect_assignment()','03b7f98380643f233003fa5a960ce267c534b830f6e069c732e539bd9eaf45c2',true),
 ('public.validate_course_library_assignment_scope()','37c7d3111ad621865d1606f7d0a414cb805e90b15e780ee18ac5f5effb862e55',true),
 ('public._paid_20260922_course_scope(uuid)','5c157baaa48b7601b0d10a55b4ed68cf6c173aa62ffefb5416a8c979c93a483b',true),
 ('public._paid_20260922_original_ids()','eefe323ef70a0199f117f8a0fc4322a090fd6ea96a9001840ee0f712df9f1c53',false),
 ('public.can_access_lesson(uuid,text)','d382a4b9c36e32124db4138e594b83c90e30f98ca00341adfd957fb04b72fbba',true),
 ('public.can_access_organization(uuid,text)','fd092f3f561990ca552a15220eaaf1d77a1521115b06103a7ce528cfb3bda54c',true),
 ('public.guard_marketplace_order_delivery()','c3ea69b5188cce1770248c7e51d74a85281ec898d55de0b0ef34c3111021b563',true),
 ('public.paid_umk_20260922_deliver()','a632931029760cc1566e9465f03e6eec28862cb6e35d775ff9604152d2be94a3',true),
 ('public.paid_umk_20260922_is_asset(uuid)','f3a6ee4d34f66fe3376c3743e2ec177d0f894f2cf2f82c5342c4f5dcaceebd55',true),
 ('public.paid_umk_20260922_valid_grant(uuid,uuid)','2c3763a03049bcd7b8a4639269db9377d2c02b426b58976350cf5d1ed7ff7dd4',true)
 )v(signature,definition_sha256,security_definer) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.signature);
  IF p.oid IS NULL OR pg_get_userbyid(p.proowner)<>'postgres' OR p.prosecdef IS DISTINCT FROM r.security_definer
   OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') IS DISTINCT FROM r.definition_sha256 THEN
   RAISE EXCEPTION 'PCC_CURRENT_COPY_OR_ACCESS_PREIMAGE_DRIFT: %',r.signature;END IF;
 END LOOP;
END;$copy24_component$;
