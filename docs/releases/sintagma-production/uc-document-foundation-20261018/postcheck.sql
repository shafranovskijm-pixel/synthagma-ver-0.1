-- Read-only metadata acceptance. No claims, issuance, signing or Storage writes.
SELECT
 (SELECT count(*)=4 FROM supabase_migrations.schema_migrations WHERE (version='20261018100000' AND name='uc_document_access_boundaries' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='455f5c4069200f225124bfd58adc948c') OR (version='20261018101000' AND name='uc_signature_integrity' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='1a7d1d39332388314cc8ebf0eaaef885') OR (version='20261018102000' AND name='uc_document_versions' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='485580713e67f5bbf40210836f757a8b') OR (version='20261018103000' AND name='uc_document_cleanup_scheduler' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='5d690c2e4284a79f12901a7deabdf736')) AS exact_migration_ledger,
 NOT has_function_privilege('anon','public.get_next_document_number(uuid,text,integer)','EXECUTE')
 AND NOT has_function_privilege('anon','public.issue_education_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 AND NOT has_function_privilege('anon','public.create_group_document_batch(uuid,uuid,jsonb)','EXECUTE') AS no_anonymous_document_rpc,
 NOT has_function_privilege('authenticated','public.uc_finalize_signature(text,text,jsonb,text,uuid,boolean,text,text,text,text,text,text,text)','EXECUTE') AS service_only_finalize,
 NOT has_table_privilege('authenticated','public.org_document_versions','INSERT')
 AND NOT has_table_privilege('authenticated','public.org_document_versions','UPDATE')
 AND NOT has_table_privilege('authenticated','public.org_document_versions','DELETE') AS versions_immutable,
 (SELECT count(*)=7 FROM pg_trigger WHERE tgname IN('uc_signature_integrity','uc_signature_revision_integrity','uc_pep_evidence_integrity','uc_signature_comment_integrity','uc_document_versions_write_guard','uc_document_pointer_guard','uc_document_initial_snapshot') AND NOT tgisinternal AND tgenabled='O') AS triggers_enabled,
 (SELECT count(*)=11 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND permissive='RESTRICTIVE'
   AND policyname IN('uc_document_objects_read_guard','uc_document_objects_insert_guard','uc_document_objects_update_guard','uc_document_objects_delete_guard','uc_billing_document_upload_guard',
    'uc_signature_file_read_boundary','uc_signature_file_insert_boundary','uc_signature_file_update_boundary','uc_signature_file_delete_boundary','uc_org_document_blob_no_overwrite','uc_org_document_blob_no_delete')) AS storage_boundaries,
 (SELECT count(*)=6 FROM storage.buckets WHERE id IN('student-documents','company-documents','billing-documents','org-documents','signed-documents','external-contracts') AND NOT public) AS buckets_private,
 NOT EXISTS(SELECT 1 FROM public.org_document_write_tokens) AS no_durable_write_token,
 (SELECT count(*)=1 AND bool_and(NOT active AND md5(command)='954edfdd26f6b685ed3d0977f26bf5e7') FROM cron.job WHERE jobname='purge-recycle-bin-storage-daily') AS unsafe_cleanup_paused;
