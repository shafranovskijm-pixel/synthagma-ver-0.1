-- Catalog definitions only; does not execute any RPC or read contacts/report tokens.
SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
 'body_md5',md5(replace(p.prosrc,chr(13)||chr(10),chr(10))),'owner',p.proowner::regrole::text,'acl',p.proacl)
 ORDER BY p.oid::regprocedure::text) AS contact_report_rpc_backup
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('import_mailing_contacts','create_mailing_report_link','revoke_mailing_report_link');
