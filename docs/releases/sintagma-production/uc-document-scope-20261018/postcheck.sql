-- Read-only deployment acceptance. Assignment/stage emptiness is checked only inside the release.
SELECT
 (SELECT count(*)=4 FROM supabase_migrations.schema_migrations WHERE (version='20261018104000' AND name='uc_document_staff_scope' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='c5d0538638fbaf0343612c13e7583510') OR (version='20261018105000' AND name='uc_document_action_permissions' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='6563e5305b0ea46bfead8f8098af4e3f') OR (version='20261018106000' AND name='uc_gorel_draft_caller' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='8e953d5f20050d66ead5454349445b7a') OR (version='20261018107000' AND name='uc_document_reminder_scheduler' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='612d9b242bae5289b34b8598fc1361e4')) AS exact_stage2_ledger,
 (SELECT count(*)=29 FROM pg_policies WHERE policyname='uc_document_assigned_read' AND permissive='RESTRICTIVE') AS assigned_read_boundaries,
 (SELECT count(*)=4 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'uc_document_assigned_storage_%' AND permissive='RESTRICTIVE') AS assigned_storage_boundaries,
 (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('student_group_memberships_effective','student_group_profiles_effective') AND 'security_invoker=true'=ANY(c.reloptions)) AS membership_views_invoker,
 (SELECT count(*)=14 FROM pg_trigger WHERE tgname='uc_document_action_guard' AND NOT tgisinternal AND tgenabled='O') AS document_action_guards,
 NOT has_table_privilege('authenticated','public.org_staff_document_groups','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('authenticated','public.uc_goreltech_document_stages','SELECT,INSERT,UPDATE,DELETE') AS private_assignment_and_stage_state,
 NOT has_function_privilege('anon','public.get_next_document_number(uuid,text,integer)','EXECUTE')
 AND NOT has_function_privilege('anon','public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 AND NOT has_function_privilege('service_role','public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.register_goreltech_group_document_stage(uuid,uuid,uuid,jsonb)','EXECUTE') AS caller_and_compiler_separated,
 (SELECT count(*)=1 AND bool_and(NOT active AND md5(command)='2d7b7e801492efbdf6bfac7f29731273') FROM cron.job WHERE jobname='process-document-expiry-reminders-daily') AS unsafe_reminder_paused;
