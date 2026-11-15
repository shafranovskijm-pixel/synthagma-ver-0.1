SET ROLE postgres;
SELECT lab.check('reconciliation restores exact canonical catalog including all function ACLs and OIDs',
 lab.ctx('reconciliation_canonical_catalog')=(SELECT jsonb_agg(to_jsonb(p)ORDER BY p.oid)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','rtn_private')));
SELECT lab.check('reconciliation leaves existing course attempts and financial rows unchanged',
 lab.ctx('old_data')=(SELECT jsonb_build_array((SELECT jsonb_agg(c)FROM public.courses c),(SELECT jsonb_agg(t)FROM public.test_attempts t),(SELECT jsonb_agg(i)FROM public.subscription_invoices i))));
SELECT lab.check('reconciliation preserves provider default grants and old unrelated overload',
 lab.ctx('provider_function_defaults')=(SELECT jsonb_agg(to_jsonb(d)ORDER BY d.oid)FROM pg_default_acl d WHERE d.defaclrole='postgres'::regrole)
 AND lab.ctx('preexisting_rtn_overload')=(SELECT to_jsonb(p)FROM pg_proc p WHERE oid='public.get_rtn_workspace(text,integer)'::regprocedure));
SELECT lab.check('reconciliation restores privacy230 and freshness240 source pins',
 (SELECT md5(prosrc)='97aae32458ab9586a0132b9847b2bdf9'FROM pg_proc WHERE oid='public.save_rtn_settings(uuid,boolean,boolean)'::regprocedure)
 AND(SELECT md5(prosrc)='409b1667afb34808dce69499898d3578'FROM pg_proc WHERE oid='public.get_rtn_workspace(uuid)'::regprocedure));
SELECT lab.check('reconciliation preserves quota220 RTN source pins',
 (SELECT md5(prosrc)='6a27abd99e95a77b90baf2469c22ddaf'FROM pg_proc WHERE oid='public.assign_rtn_training(uuid,uuid,uuid[],uuid)'::regprocedure)
 AND(SELECT md5(prosrc)='e342394b02cbf5739118496e084573af'FROM pg_proc WHERE oid='public.start_rtn_attempt(uuid)'::regprocedure)
 AND(SELECT md5(prosrc)='c75593683e5eca9c88e1ec734b4b2fde'FROM pg_proc WHERE oid='public.submit_rtn_attempt(uuid,jsonb)'::regprocedure));
