-- READ ONLY: usable before/after the guarded operation. No customer rows or secret values.
SELECT jsonb_build_object(
  'checked_at_utc',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'ledger_count',(SELECT count(*) FROM supabase_migrations.schema_migrations),
  'target_ledger',(SELECT jsonb_build_object('version',version,'name',name,'statement_count',cardinality(statements),'raw_sha256',encode(pg_catalog.sha256(convert_to(statements[1],'UTF8')),'hex')) FROM supabase_migrations.schema_migrations WHERE version='20261023010000'),
  'public_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p')),
  'all_public_auth_storage_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth','storage') AND c.relkind IN('r','p')),
  'new_registry_tables',(SELECT array_agg(c.relname ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(ARRAY['uc_education_issuance_contexts','uc_education_issuance_events','uc_education_issuance_preparation_items','uc_education_issuance_preparations','uc_education_issuance_requests','uc_education_issuance_states','uc_enrollment_withdrawal_events','uc_enrollment_withdrawal_states']) AND c.relkind IN('r','p')),
  'read_rpc',to_regprocedure('public.read_education_issuance(uuid,jsonb,jsonb)')::text,
  'worker_context_rpc',to_regprocedure('public.uc_education_artifact_context(uuid,uuid,uuid,bigint,uuid)')::text,
  'private_staging_bucket',(SELECT jsonb_build_object('id',id,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) FROM storage.buckets WHERE id='education-issuance-staging'),
  'legacy_batch_body_md5',(SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)')),
  'legacy_batch_authenticated_execute',has_function_privilege('authenticated','public.issue_education_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE'),
  'legacy_batch_service_execute',has_function_privilege('service_role','public.issue_education_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
) AS uc019_fresh_state;
