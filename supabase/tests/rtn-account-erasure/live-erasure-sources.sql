-- SELECT-only production source capture 2026-11-14; installed ONLY in the disposable native fixture.
-- No customer rows, credentials, production JWTs or erasure invocation are included.

-- account_deletion_erase_data(uuid,text); body_md5=a13f74f6687fff498ac1628830458560; definition_md5=a496bbcd2154d994c9e83888313a84a3
CREATE OR REPLACE FUNCTION public.account_deletion_erase_data(p_request_id uuid, p_receipt_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE j public.account_deletion_jobs%ROWTYPE; u uuid; r record; v_org uuid; current_snapshot jsonb;
BEGIN
 SELECT * INTO j FROM public.account_deletion_jobs WHERE id=p_request_id AND receipt_hash=p_receipt_hash FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','INVALID_RECEIPT'); END IF;
 IF j.consent_version IS DISTINCT FROM 'full-personal-data-v1' THEN RETURN jsonb_build_object('code','CONSENT_REQUIRED'); END IF;
 IF j.state='deleted' THEN RETURN jsonb_build_object('erased',true); END IF;
 IF j.state<>'cleanup_pending' THEN RETURN jsonb_build_object('code','NOT_CONFIRMED'); END IF;
 u:=j.user_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,42007));
 IF jsonb_array_length(public.account_deletion_files(u))>0 OR EXISTS(SELECT 1 FROM storage.objects o JOIN jsonb_array_elements(j.files) f ON f->>'bucket'=o.bucket_id AND f->>'path'=o.name) THEN RETURN jsonb_build_object('code','DELETION_UNAVAILABLE'); END IF;
 current_snapshot:=public.account_deletion_snapshot(u);
 IF jsonb_array_length(current_snapshot->'blockers')>0 THEN RETURN jsonb_build_object('code','PLAN_CHANGED'); END IF;
 -- Delete the enrollment before lesson progress: the live progress trigger
 -- then has no enrollment to reset. CSZ/issued/shared cases failed in preview.
 PERFORM set_config('sintagma.account_deletion_erase_user',u::text,true);
 PERFORM public.uc_erase_group_education_facts(u);
 PERFORM public.uc_erase_admission_cases(u);
 PERFORM public.uc_erase_identification_data(u);
 DELETE FROM public.audit_logs WHERE entity_id=u::text OR (entity_type='enrollment' AND entity_id IN(SELECT id::text FROM public.enrollments WHERE user_id=u));
 UPDATE public.audit_logs SET user_id='00000000-0000-0000-0000-000000000000',user_name=NULL,ip_address=NULL,user_agent=NULL WHERE user_id=u;
 UPDATE public.role_audit_log SET performed_by=NULL,performed_by_name=NULL,details=CASE WHEN details->>'from_user_id'=u::text THEN details-'from_user_id' ELSE details END WHERE performed_by=u AND target_user_id IS DISTINCT FROM u;
 UPDATE public.student_deletion_log SET deleted_by=NULL,deleted_by_name=NULL,deleted_by_email=NULL WHERE deleted_by=u AND student_id IS DISTINCT FROM u;
 DELETE FROM public.final_test_photo_challenges WHERE user_id=u;
 DELETE FROM public.test_attempts WHERE user_id=u;
 DELETE FROM public.test_attempt_start_requests WHERE user_id=u;
 DELETE FROM public.test_attempt_sessions WHERE user_id=u;
 DELETE FROM public.homework_submissions WHERE student_id=u;
 DELETE FROM public.journal_entries WHERE user_id=u;
 DELETE FROM public.group_class_journal_marks WHERE user_id=u;
 DELETE FROM public.training_plans WHERE user_id=u;
 DELETE FROM public.student_group_memberships WHERE user_id=u;
 DELETE FROM public.student_roster_removals WHERE user_id=u;
 DELETE FROM public.enrollments WHERE user_id=u;
 DELETE FROM public.lesson_progress WHERE user_id=u;
 -- on_enrollment_delete inserts an event; remove it after that trigger.
 DELETE FROM public.enrollment_history WHERE user_id=u;
 DELETE FROM public.organization_monthly_student_assignments WHERE user_id=u;
 DELETE FROM public.organization_monthly_training_completions WHERE user_id=u;
 DELETE FROM public.student_deletion_log WHERE student_id=u;
 DELETE FROM public.support_messages WHERE conversation_id IN (SELECT id FROM public.support_conversations WHERE user_id=u) OR sender_user_id=u;
 DELETE FROM public.support_conversations WHERE user_id=u;
 DELETE FROM public.document_signatures WHERE (sender_user_id=u OR recipient_user_id=u) AND signed_at IS NULL AND sender_signed_at IS NULL AND status<>'signed';
 DELETE FROM public.consent_documents WHERE student_user_id=u;
 DELETE FROM public.org_contracts WHERE student_user_id=u AND approved_at IS NULL AND signed_at IS NULL AND status IN ('draft','cancelled');
 FOR r IN SELECT * FROM (VALUES
  ('admin_org_messages','sender_user_id'),
  ('admin_staff','user_id'),
  ('ai_prompt_templates','user_id'),
  ('ai_tutor_sessions','user_id'),
  ('ai_usage_log','user_id'),
  ('call_log_listens','listener_user_id'),
  ('chat_group_members','user_id'),
  ('chat_group_messages','sender_user_id'),
  ('chat_messages','user_id'),
  ('chat_notification_settings','user_id'),
  ('client_error_logs','user_id'),
  ('company_staff','user_id'),
  ('course_access_log','user_id'),
  ('course_reminders','user_id'),
  ('course_requests','user_id'),
  ('course_review_grants','user_id'),
  ('data_subject_requests','user_id'),
  ('exolve_sip_accounts','user_id'),
  ('final_test_photo_challenges','user_id'),
  ('module_access_overrides','user_id'),
  ('notification_preferences','user_id'),
  ('org_general_messages','sender_user_id'),
  ('org_notifications','user_id'),
  ('org_staff','user_id'),
  ('org_student_messages','sender_user_id'),
  ('org_student_messages','student_user_id'),
  ('organization_offer_acceptances','user_id'),
  ('partner_applications','user_id'),
  ('pending_enrollments','user_id'),
  ('pep_agreements','user_id'),
  ('pipeline_runs','user_id'),
  ('registration_attempts','user_id'),
  ('student_consents','user_id'),
  ('student_frdo_data','user_id'),
  ('student_identity_documents','user_id'),
  ('student_login_history','user_id'),
  ('student_login_tokens','user_id'),
  ('student_notifications','user_id'),
  ('support_requests','user_id'),
  ('testimonials','user_id'),
  ('user_achievements','user_id'),
  ('video_identifications','user_id'),
  ('webinar_participants','user_id')
 ) x(t,c) LOOP
  EXECUTE format('DELETE FROM public.%I WHERE %I=$1',r.t,r.c) USING u;
 END LOOP;
 -- Nullable author references are attribution, not ownership of client data.
 FOR r IN SELECT * FROM (VALUES
  ('admin_generated_documents','created_by'),
  ('ai_settings','updated_by'),
  ('app_settings','updated_by'),
  ('company_documents','uploaded_by'),
  ('consent_documents','created_by'),
  ('course_review_grants','revoked_by'),
  ('enrollment_history','performed_by'),
  ('exolve_sip_accounts','created_by'),
  ('landing_content','updated_by'),
  ('marketplace_settings','updated_by'),
  ('organization_comments','created_by'),
  ('organization_reminders','created_by'),
  ('platform_announcements','created_by'),
  ('sales_tasks','assigned_user_id'),
  ('skillspace_import_jobs','created_by'),
  ('staff_invitations','accepted_user_id'),
  ('student_login_tokens','created_by'),
  ('video_identifications','verified_by')
 ) x(t,c) LOOP
  EXECUTE format('UPDATE public.%I SET %I=NULL WHERE %I=$1',r.t,r.c,r.c) USING u;
 END LOOP;
 DELETE FROM public.user_roles WHERE user_id=u;
 DELETE FROM public.profiles WHERE user_id=u;
 -- org_staff DELETE creates a role-audit event: clear it after all staff/profile
 -- triggers; never leave the target UUID hidden in its own account history.
 DELETE FROM public.role_audit_log WHERE target_user_id=u;
 DELETE FROM public.audit_logs WHERE entity_id=u::text;
 IF (j.snapshot->>'emptyOrganization')::boolean THEN
  v_org:=(j.snapshot->>'organizationId')::uuid;
  -- Recheck under the organization lock; a concurrent invitation/registration
  -- must never be swept into this operation.
  PERFORM 1 FROM public.organizations WHERE id=v_org FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE organization_id=v_org AND user_id<>u) OR EXISTS(SELECT 1 FROM public.org_staff WHERE organization_id=v_org) THEN RAISE EXCEPTION 'Organization changed during deletion'; END IF;
  DELETE FROM public.organizations WHERE id=v_org;
 END IF;
 DELETE FROM public.uc_identification_write_contexts WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND kind IN('subject_erase','reviewer_erase') AND user_id=u;
 PERFORM public.uc_learning_erase_user(u);
 PERFORM public.uc_custom_journal_erase_user(u);
 PERFORM public.uc_session_erase_user(u);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(u)) n WHERE (n->>'count')::bigint>0) THEN RAISE EXCEPTION 'Personal data erasure is incomplete'; END IF;
 UPDATE public.account_deletion_jobs SET data_erased=true WHERE id=j.id;
 RETURN jsonb_build_object('erased',true);
END;$function$
;
ALTER FUNCTION public.account_deletion_erase_data(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_erase_data(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_erase_data(uuid,text) TO service_role,sandbox_exec_atxwvjxbqjgkbjlhsdch;

-- account_deletion_snapshot(uuid); body_md5=c6e55ea2001e24e7849875210d44baad; definition_md5=aaa5cc6d382e87fd1b513f0632f7ea2f
CREATE OR REPLACE FUNCTION public.account_deletion_snapshot(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE p public.profiles%ROWTYPE; v_org uuid; v_owner boolean:=false; v_education_outputs jsonb;v_education_unissued bigint;v_education_issued bigint;
 v_blockers jsonb:='[]'; v_categories jsonb:='[]'; v_files jsonb;
 v_count bigint; v_learning bigint; v_docs bigint:=0; v_shared bigint:=0; v_documentary bigint:=0;
 v_org_shared bigint:=0; v_courses bigint:=0; r record; v_fingerprint jsonb;
BEGIN
 SELECT coalesce(sum((archive_row->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_archive_personal_counts(p_user_id))archive_row;
 IF v_count>0 THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','ARCHIVE_RETENTION_REVIEW_REQUIRED','message','Сохранены архивные дела, основания, история, файлы или изолированные копии. Центру нужно отдельно проверить дальнейшее хранение; удаление аккаунта не начато.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','archive_retained_copies','label','Архивные дела, история, основания и копии: требуется проверка хранения','count',v_count,'action','block'));
 END IF;
 SELECT * INTO p FROM public.profiles WHERE user_id=p_user_id;
 v_org:=p.organization_id;
 IF v_org IS NOT NULL THEN v_owner:=public.is_org_owner(p_user_id,v_org); END IF;
 SELECT count(*) INTO v_learning FROM public.enrollments WHERE user_id=p_user_id;
 SELECT count(*)INTO v_count FROM public.uc_course_assignment_removal_events removal_event WHERE removal_event.user_id=p_user_id OR removal_event.actor_id=p_user_id;
 IF v_count>0 THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','Сохранена история отмены или повторного назначения курса. До удаления нужна отдельная проверка этих записей; назначение не удаляется физически.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','retained_assignment_removals','label','История отмен и повторных назначений: требуется проверка хранения','count',v_count,'action','retain'));
 END IF;
 IF public.uc_publication_personal_counts(p_user_id)<>'[]'::jsonb THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','Сохранены публичные редакции, проверки или календарные решения. До удаления нужна отдельная проверка хранения этих фактов.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','retained_publication_evidence','label','История публикаций и решений: требуется проверка хранения','count',(SELECT coalesce(sum((x->>'count')::bigint),0)FROM jsonb_array_elements(public.uc_publication_personal_counts(p_user_id))x),'action','retain'));
 END IF;
 IF public.uc_ng_personal_counts(p_user_id)<>'[]'::jsonb THEN
  SELECT coalesce(sum((ng_item->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_ng_personal_counts(p_user_id))ng_item;
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','NORMATIVE_RETENTION_REVIEW_REQUIRED','message','Сохранена история нормативного каталога и решений. До удаления требуется отдельная проверка дальнейшего хранения.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','normative_history_retained_copies','label','История нормативного каталога и решений: требуется проверка хранения','count',v_count,'action','block'));
 END IF;
 v_files:=public.account_deletion_files(p_user_id);
 -- Exact subject/document relationships; JSON checks are read-only detection,
 -- never commands to remove an organization-wide document.
 SELECT
   (SELECT count(*) FROM public.education_document_records WHERE user_id=p_user_id OR enrollment_id IN (SELECT id FROM public.enrollments WHERE user_id=p_user_id))+
   (SELECT count(*) FROM public.document_issuance_log WHERE user_id=p_user_id)+
   (SELECT count(*) FROM public.student_documents WHERE enrollment_id IN (SELECT id FROM public.enrollments WHERE user_id=p_user_id))+
   (SELECT count(*) FROM public.document_signatures WHERE (recipient_user_id=p_user_id OR sender_user_id=p_user_id) AND (signed_at IS NOT NULL OR sender_signed_at IS NOT NULL OR status='signed'))+
   (SELECT count(*) FROM public.org_contracts WHERE (student_user_id=p_user_id OR students::text LIKE '%'||p_user_id::text||'%') AND (approved_at IS NOT NULL OR signed_at IS NOT NULL OR status NOT IN ('draft','cancelled')))+
   (SELECT count(*) FROM public.group_documents WHERE (student_user_id=p_user_id OR variables::text LIKE '%'||p_user_id::text||'%' OR variables_snapshot::text LIKE '%'||p_user_id::text||'%') AND (file_path IS NOT NULL OR doc_status<>'draft'))
 INTO v_docs;
 IF v_docs>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','У аккаунта есть оформленные учебные или подписанные документы организации. Для этих записей требуется отдельная проверка возможности удаления; она не заменяется подтверждением удаления аккаунта.')); END IF;
 IF EXISTS(SELECT 1 FROM public.group_completion_decision_history WHERE user_id=p_user_id) OR EXISTS(SELECT 1 FROM public.group_completion_decisions WHERE user_id=p_user_id) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROTECTED_HISTORY_REVIEW_REQUIRED','message','Есть неизменяемая история итоговых решений организации. Их автоматическое удаление сейчас не поддержано без нарушения целостности общей истории; удаление не начато.'));
 END IF;
 -- CSZ preserves accepted homework by a dedicated immutable-history trigger.
 -- Do not bypass that guard just to scrub a personal free-text attachment.
 IF EXISTS(SELECT 1 FROM public.homework_submissions WHERE student_id=p_user_id AND course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a'))
 OR EXISTS(SELECT 1 FROM public.enrollments WHERE user_id=p_user_id AND course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a'))
 OR EXISTS(SELECT 1 FROM public.lesson_progress lp JOIN public.lessons l ON l.id=lp.lesson_id WHERE lp.user_id=p_user_id AND l.course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a')) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROTECTED_HISTORY_REVIEW_REQUIRED','message','Есть защищённые работы ЦСЗ. Их обработка требует отдельного решения; результаты обучения сейчас не изменяются.'));
 END IF;
 -- These records have other stakeholders or privileged ownership. Never let
 -- Auth FK cascades silently delete client call records, contracts or grants.
 FOR r IN SELECT * FROM (VALUES
  ('org_crm_clients','student_user_id'),
  ('ai_avatar_templates','created_by'),
  ('balance_transactions','performed_by'),
  ('call_logs','manager_user_id'),
  ('chat_groups','created_by'),
  ('checko_search_presets','created_by'),
  ('checko_search_runs','created_by'),
  ('commercial_proposals','created_by'),
  ('commercial_proposals','deleted_by'),
  ('companies','user_id'),
  ('company_documents','deleted_by'),
  ('company_staff','invited_by'),
  ('course_landing_history','created_by'),
  ('course_manual_credits','credited_by'),
  ('course_manual_credits','revoked_by'),
  ('course_payments','user_id'),
  ('course_review_grants','created_by'),
  ('course_review_grants','updated_by'),
  ('course_snapshots','created_by'),
  ('data_subject_requests','deleted_by'),
  ('data_subject_requests','resolved_by'),
  ('document_issuance_log','deleted_by'),
  ('document_signatures','deleted_by'),
  ('driving_audit','user_id'),
  ('driving_entries','created_by'),
  ('driving_entry_reversals','created_by'),
  ('driving_instructors','user_id'),
  ('driving_invites','created_by'),
  ('driving_lessons','created_by'),
  ('driving_memberships','user_id'),
  ('driving_schools','created_by'),
  ('driving_students','user_id'),
  ('education_document_records','deleted_by'),
  ('email_campaigns','created_by'),
  ('email_drip_sequences','created_by'),
  ('email_templates','created_by'),
  ('enrollment_requests','resolved_by'),
  ('enrollment_requests','user_id'),
  ('goreltech_document_operations','actor_id'),
  ('goreltech_enrollment_orders','actor_id'),
  ('group_class_journal_marks','updated_by'),
  ('group_completion_decisions','confirmed_by'),
  ('group_document_schedules','updated_by'),
  ('group_documents','created_by'),
  ('group_documents','student_user_id'),
  ('homework_submissions','reviewer_id'),
  ('incoming_documents','deleted_by'),
  ('labor_safety_enrollment_protocols','created_by'),
  ('labor_safety_enrollment_protocols','source_user_id'),
  ('labor_safety_enrollment_protocols','updated_by'),
  ('labor_safety_profiles','user_id'),
  ('library_documents','created_by'),
  ('mailing_deliverability_seeds','created_by'),
  ('mailing_report_links','created_by'),
  ('mailing_senders','created_by'),
  ('marketplace_course_comments','user_id'),
  ('marketplace_orders','buyer_user_id'),
  ('org_billing_documents','deleted_by'),
  ('org_contract_template_versions','created_by'),
  ('org_custom_roles','created_by'),
  ('org_document_share_links','created_by'),
  ('org_documents','deleted_by'),
  ('org_signatories','created_by'),
  ('platform_invoice_acts','created_by'),
  ('platform_updates','created_by'),
  ('proposal_presets','created_by'),
  ('referral_attribution_log','user_id'),
  ('referral_partners','user_id'),
  ('sales_demo_links','created_by'),
  ('sales_demo_sessions','user_id'),
  ('sales_managers','user_id'),
  ('sales_tasks','created_by'),
  ('signature_comments','author_user_id'),
  ('signature_comments','resolved_by'),
  ('signature_revisions','created_by'),
  ('training_plans','created_by'),
  ('webinar_polls','created_by'),
  ('webinars','created_by'),
  ('webinars','host_user_id')
 ) x(t,c) LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO v_count USING p_user_id;
  v_shared:=v_shared+v_count;
 END LOOP;
 v_shared:=v_shared+(SELECT count(*) FROM public.document_signatures WHERE (sender_user_id=p_user_id OR recipient_user_id=p_user_id) AND (sender_user_id IS DISTINCT FROM p_user_id OR recipient_user_id IS DISTINCT FROM p_user_id));
 v_shared:=v_shared+(SELECT count(*) FROM public.org_contracts WHERE student_user_id IS DISTINCT FROM p_user_id AND students::text LIKE '%'||p_user_id::text||'%');
 v_shared:=v_shared+(SELECT count(*) FROM public.group_documents WHERE student_user_id IS DISTINCT FROM p_user_id AND (variables::text LIKE '%'||p_user_id::text||'%' OR variables_snapshot::text LIKE '%'||p_user_id::text||'%'));
 IF v_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SHARED_DATA_REVIEW_REQUIRED','message','Аккаунт связан с общими рабочими записями. Сначала нужно передать ответственность за них; данные других пользователей не удаляются.')); END IF;
 IF EXISTS(SELECT 1 FROM storage.objects o WHERE (o.owner=p_user_id OR o.owner_id=p_user_id::text)
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_files) f WHERE f->>'bucket'=o.bucket_id AND f->>'path'=o.name)) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SHARED_FILES_REVIEW_REQUIRED','message','Есть загруженные аккаунтом файлы вне личных папок. Сначала нужно проверить их принадлежность организации.'));
 END IF;
 IF v_owner THEN
  -- Locking/revalidation occurs again in begin. A brand-new sole-owner
  -- organization may be removed with its default welcome course/templates.
  SELECT count(*) INTO v_org_shared FROM public.profiles WHERE organization_id=v_org AND user_id<>p_user_id;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE c.organization_id=v_org);
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.organizations WHERE id=v_org AND (balance<>0 OR is_paid OR paid_until IS NOT NULL));
  FOR r IN SELECT * FROM (VALUES
  ('org_crm_clients','organization_id'),
  ('org_crm_deals','organization_id'),
  ('org_crm_tasks','organization_id'),
  ('org_crm_activities','organization_id'),
  ('achievements','organization_id'),
  ('admin_generated_documents','sent_to_organization_id'),
  ('admin_org_messages','organization_id'),
  ('ai_avatar_templates','organization_id'),
  ('audit_logs','organization_id'),
  ('balance_transactions','organization_id'),
  ('chat_groups','organization_id'),
  ('checko_search_presets','organization_id'),
  ('commercial_proposals','organization_id'),
  ('companies','organization_id'),
  ('company_requests','organization_id'),
  ('consent_documents','organization_id'),
  ('course_landing_history','organization_id'),
  ('course_payments','organization_id'),
  ('course_reminders','organization_id'),
  ('course_requests','organization_id'),
  ('course_snapshots','organization_id'),
  ('data_subject_requests','organization_id'),
  ('document_issuance_log','organization_id'),
  ('document_number_sequences','organization_id'),
  ('document_signatures','organization_id'),
  ('driving_audit','organization_id'),
  ('driving_cars','organization_id'),
  ('driving_courses','organization_id'),
  ('driving_entries','organization_id'),
  ('driving_entry_reversals','organization_id'),
  ('driving_groups','organization_id'),
  ('driving_instructors','organization_id'),
  ('driving_invites','organization_id'),
  ('driving_lessons','organization_id'),
  ('driving_memberships','organization_id'),
  ('driving_operations','organization_id'),
  ('driving_programs','organization_id'),
  ('driving_schools','organization_id'),
  ('driving_shifts','organization_id'),
  ('driving_students','organization_id'),
  ('education_document_records','organization_id'),
  ('email_action_tokens','organization_id'),
  ('email_campaign_consent_log','organization_id'),
  ('email_campaigns','organization_id'),
  ('email_drip_subscribers','organization_id'),
  ('frdo_signed_documents','organization_id'),
  ('goreltech_document_operations','organization_id'),
  ('goreltech_enrollment_orders','organization_id'),
  ('group_class_journal_marks','organization_id'),
  ('group_completion_decision_history','organization_id'),
  ('group_completion_decisions','organization_id'),
  ('group_document_schedules','organization_id'),
  ('group_documents','organization_id'),
  ('homework_submissions','organization_id'),
  ('incoming_documents','organization_id'),
  ('journal_instances','organization_id'),
  ('kinescope_usage_cache','organization_id'),
  ('knowledge_bank','organization_id'),
  ('labor_safety_enrollment_protocols','organization_id'),
  ('labor_safety_groups','organization_id'),
  ('labor_safety_profiles','organization_id'),
  ('library_documents','organization_id'),
  ('library_folders','organization_id'),
  ('mailing_campaign_ledger','organization_id'),
  ('mailing_campaign_replies','organization_id'),
  ('mailing_contacts','organization_id'),
  ('mailing_deliverability_checks','organization_id'),
  ('mailing_deliverability_seeds','organization_id'),
  ('mailing_report_links','organization_id'),
  ('mailing_seed_ledger','organization_id'),
  ('mailing_senders','organization_id'),
  ('marketplace_courses','organization_id'),
  ('marketplace_orders','buyer_organization_id'),
  ('ordinary_mail_report_events','organization_id'),
  ('org_billing_documents','organization_id'),
  ('org_contract_template_versions','organization_id'),
  ('org_contract_templates','organization_id'),
  ('org_contracts','organization_id'),
  ('org_custom_roles','organization_id'),
  ('org_document_share_links','organization_id'),
  ('org_document_versions','organization_id'),
  ('org_documents','organization_id'),
  ('org_general_messages','organization_id'),
  ('org_payers','organization_id'),
  ('org_services','organization_id'),
  ('org_signatories','organization_id'),
  ('org_smtp_settings','organization_id'),
  ('org_staff','organization_id'),
  ('org_student_messages','organization_id'),
  ('organization_comments','organization_id'),
  ('organization_payment_settings','organization_id'),
  ('organization_reminders','organization_id'),
  ('pending_enrollments','organization_id'),
  ('platform_invoice_acts','organization_id'),
  ('program_categories','organization_id'),
  ('program_documents','organization_id'),
  ('program_folders','organization_id'),
  ('program_training_plans','organization_id'),
  ('proposal_presets','organization_id'),
  ('referral_attribution_log','organization_id'),
  ('referral_commissions','organization_id'),
  ('referral_registrations','organization_id'),
  ('registration_links','organization_id'),
  ('role_audit_log','organization_id'),
  ('sales_blacklist','organization_id'),
  ('sales_companies_db','organization_id'),
  ('sales_contracts','organization_id'),
  ('sales_demo_links','organization_id'),
  ('sales_demo_sessions','organization_id'),
  ('sales_lead_activities','organization_id'),
  ('sales_leads','organization_id'),
  ('sales_tasks','organization_id'),
  ('service_orders','organization_id'),
  ('skillspace_import_jobs','organization_id'),
  ('staff_invitations','organization_id'),
  ('student_deletion_log','organization_id'),
  ('student_group_memberships','organization_id'),
  ('student_groups','organization_id'),
  ('student_roster_removals','organization_id'),
  ('subscription_invoices','organization_id'),
  ('system_diagnostics','organization_id'),
  ('testimonials','organization_id'),
  ('training_plans','organization_id'),
  ('webinars','organization_id')
  ) x(t,c) LOOP
   EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO v_count USING v_org;
   v_org_shared:=v_org_shared+v_count;
  END LOOP;
  -- Only the audited seeded course is auto-removable in the first release.
  SELECT count(*) INTO v_courses FROM public.courses WHERE organization_id=v_org;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.courses WHERE organization_id=v_org AND system_key IS DISTINCT FROM 'welcome');
 v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_admission_cases WHERE organization_id=v_org);
 v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_group_education_states WHERE organization_id=v_org);
 IF v_org_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','OWNERSHIP_TRANSFER_REQUIRED','message','Организация содержит пользователей, обучение, платежи или рабочие записи. Сначала передайте управление организацией.','actionHref','/organization?tab=staff')); END IF;
 END IF;
 -- PEP is deletable only when it is the person's standalone agreement, not
 -- evidence attached to a document signature (the live FK is SET NULL).
 SELECT count(*) INTO v_documentary FROM public.pep_agreements pa
 WHERE pa.user_id=p_user_id AND EXISTS(SELECT 1 FROM public.document_signatures d WHERE d.pep_agreement_id=pa.id);
 -- An organization's offer acceptance belongs to the organization lifecycle.
 -- Remove it only together with the verified unused sole-owner organization.
 SELECT v_documentary+count(*) INTO v_documentary FROM public.organization_offer_acceptances a
 WHERE a.user_id=p_user_id AND NOT (v_owner AND v_org_shared=0 AND a.organization_id=v_org);
 IF v_documentary>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','DOCUMENTARY_RELATION_REVIEW_REQUIRED','message','Есть соглашение ПЭП, связанное с подписью документа, или акцепт оферты действующей организации. Эти общие документальные записи требуют отдельной обработки; удаление аккаунта не начато.')); END IF;
 v_education_outputs:=public.uc_education_saved_output_counts(p_user_id);v_education_unissued:=(v_education_outputs->>'unissued')::bigint;v_education_issued:=(v_education_outputs->>'issued')::bigint;
 IF v_education_unissued+v_education_issued>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','EDUCATION_ARTIFACT_RETENTION_REVIEW_REQUIRED','message','Сохранены файлы подготовки, ещё не выданные: '||v_education_unissued||'; архивы выданных документов: '||v_education_issued||'. Учебному центру нужно проверить черновики и основания дальнейшего хранения архива. Удаление аккаунта не начато.'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_frdo_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','FRDO_PACKET_RETENTION_REVIEW_REQUIRED','message','Сохранены персональные сведения и их копии в пакетах ФРДО, файлах, квитанциях или полномочиях оператора. Учебному центру нужно проверить основание и порядок дальнейшего хранения. Удаление аккаунта не начато.'));END IF;
 v_categories:=v_categories||jsonb_build_array(
  jsonb_build_object('key','account','label','Вход в аккаунт, пароль, профиль и личные настройки','count',1,'action','delete'),
  jsonb_build_object('key','private_files','label','Личные фотографии и загруженные документы','count',jsonb_array_length(v_files),'action','delete'),
  jsonb_build_object('key','learning_results','label','Назначения курсов, прогресс, попытки, ответы и результаты обучения','count',v_learning,'action','delete'),
  jsonb_build_object('key','institutional_documents','label','Оформленные документы','count',v_docs,'action',CASE WHEN v_docs>0 THEN 'block' ELSE 'delete' END));
 IF v_education_unissued+v_education_issued>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','education_artifact_outputs','label','Файлы подготовки и архив выданных документов: требуется проверка сохранения','count',v_education_unissued+v_education_issued,'action','block'));END IF;
 IF v_documentary>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','documentary_relations','label','Соглашения ПЭП и акцепты оферт, связанные с документами или действующей организацией','count',v_documentary,'action','block')); END IF;
 IF v_owner THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','empty_organization','label','Неиспользованная организация и ознакомительный курс','count',1,'action',CASE WHEN v_org_shared>0 THEN 'block' ELSE 'delete' END)); END IF;
 SELECT count(*) INTO v_count FROM public.audit_logs WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','common_audit','label','Общие события организации: запись события сохраняется, имя и ссылка на аккаунт удаляются','count',v_count,'action','anonymize')); END IF;
 SELECT count(*)INTO v_count FROM public.uc_admission_cases WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','admission_cases','label','Личные дела и их индивидуальные копии','count',v_count,'action','delete'));END IF;
 SELECT count(*)INTO v_count FROM public.uc_admission_case_events WHERE actor_id=p_user_id AND user_id<>p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','admission_review_attribution','label','Атрибуция внутренних проверок: удаляется ссылка на аккаунт и личный текст','count',v_count,'action','anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_frdo_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','frdo_retained_copies','label','Пакеты ФРДО, файлы, квитанции, источники и полномочия: требуется проверка хранения','count',v_count,'action','block'));END IF;
 v_categories:=v_categories||public.uc_group_education_deletion_preview(p_user_id);
 SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_learning_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','learning_outcomes','label','Результаты обучения и решения: личные строки удаляются, атрибуция обезличивается','count',v_count,'action','delete_or_anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_custom_journal_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','custom_journals','label','Собственные журналы: строки выбранного лица удаляются, авторские копии обезличиваются','count',v_count,'action','delete_or_anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_session_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','conducted_sessions','label','Проведённые занятия, посещение и черновики: личные сведения обезличиваются, редакции сохраняются','count',v_count,'action','anonymize'));END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record','label','Техническая запись запрета старого доступа и квитанция об удалении без имени и контактов','count',1,'action','retain'));
 SELECT coalesce(sum((x->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_signature_assurance_personal_counts(p_user_id)||public.uc_signature_assurance_file_proof_personal_counts(p_user_id))x;
 IF v_count>0 THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SIGNATURE_EVIDENCE_RETENTION_REVIEW_REQUIRED','message','Сохранены факты подтверждения, точные тексты соглашений или согласий, файлы и их копии. Учебному центру нужно отдельно проверить основание и порядок дальнейшего хранения. Удаление аккаунта не начато.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','signature_evidence_retained_copies','label','Подтверждения документов, тексты соглашений и согласий, файлы и копии: требуется проверка хранения','count',v_count,'action','block'));
 END IF;
 -- The snapshot is compared atomically just before the first mutation. Counts
 -- and manifest cover additions during the confirmation dialog; no PII stored.
 IF public.uc_self_examination_retained(p_user_id)THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','Сохранены черновики самообследования, подтверждения фактов или связанные источники. До удаления нужна отдельная проверка хранения; автоматическая очистка файлов не начинается.'));
  SELECT coalesce(sum(x.value::bigint),0)INTO v_count FROM jsonb_each_text(public.uc_self_examination_personal_counts(p_user_id))x;
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','retained_self_examination','label','Самообследование и его источники: требуется проверка хранения','count',v_count,'action','retain'));
 END IF;
 RETURN jsonb_build_object('organizationId',v_org,'emptyOrganization',v_owner AND v_org_shared=0,'learningCount',v_learning,
  'categories',v_categories,'blockers',v_blockers,'files',v_files,'sharedCount',v_shared,'personalRows',public.account_deletion_personal_row_counts(p_user_id),
  'profileRevision',p.updated_at,'role',(SELECT role::text FROM public.user_roles WHERE user_id=p_user_id LIMIT 1));
END;$function$
;
ALTER FUNCTION public.account_deletion_snapshot(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_snapshot(uuid) TO service_role,sandbox_exec_atxwvjxbqjgkbjlhsdch;

-- uc_scoped_journal_personal_counts(uuid); body_md5=f8f7b3be7cf578aafc26c66c46864ec9; definition_md5=4824a861df1f690d3c4e6b0e23a5832a
CREATE OR REPLACE FUNCTION public.uc_scoped_journal_personal_counts(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT(
 SELECT(
 SELECT(
 SELECT(
 SELECT(
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',count_row.table_name,'column',count_row.column_name,'count',count_row.n) ORDER BY count_row.table_name),'[]'::jsonb) FROM(
  SELECT 'uc_scoped_journal_contexts'::text table_name,'created_by'::text column_name,count(*) n FROM public.uc_scoped_journal_contexts c WHERE c.created_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_records','participant_ids',count(*) FROM public.uc_scoped_journal_records r WHERE p_user=ANY(r.participant_ids) OR r.subject_user_id=p_user OR r.recorded_by=p_user OR r.created_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_history','participant_ids',count(*) FROM public.uc_scoped_journal_history h WHERE p_user=ANY(h.participant_ids) OR h.subject_user_id=p_user OR h.recorded_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_requests','participant_ids',count(*) FROM public.uc_scoped_journal_requests request_row WHERE p_user=ANY(request_row.participant_ids) OR request_row.actor_id=p_user
  UNION ALL SELECT 'uc_scoped_journal_exports','participant_ids',count(*) FROM public.uc_scoped_journal_exports e WHERE p_user=ANY(e.participant_ids) OR e.recorded_by=p_user
 ) count_row WHERE count_row.n>0
)||public.uc_copy_registry_personal_counts(p_user)
)||public.uc_document_registry_personal_counts(p_user)
)||public.uc_education_personal_counts(p_user))||public.uc_frdo_personal_counts(p_user))||public.uc_signature_assurance_personal_counts(p_user)||public.uc_signature_assurance_file_proof_personal_counts(p_user)||public.uc_archive_personal_counts(p_user)||public.uc_publication_personal_counts(p_user)
||(SELECT coalesce(jsonb_agg(jsonb_build_object('table',x.key,'column','retained_self_examination','count',x.value::bigint)ORDER BY x.key),'[]'::jsonb)FROM jsonb_each_text(public.uc_self_examination_personal_counts(p_user))x WHERE x.value::bigint>0)
||public.uc_ng_personal_counts(p_user)
$function$
;
ALTER FUNCTION public.uc_scoped_journal_personal_counts(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.uc_scoped_journal_personal_counts(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- account_deletion_personal_row_counts(uuid); body_md5=705da9fbcd16a68fe1ea3a9dca90b52e; definition_md5=5b88dbf3ae72ae78fcd5c9f3dbca3872
CREATE OR REPLACE FUNCTION public.account_deletion_personal_row_counts(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE r record; n bigint; result jsonb:='[]';
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('admin_org_messages','sender_user_id'),
  ('admin_staff','user_id'),
  ('ai_prompt_templates','user_id'),
  ('ai_tutor_sessions','user_id'),
  ('ai_usage_log','user_id'),
  ('call_log_listens','listener_user_id'),
  ('chat_group_members','user_id'),
  ('chat_group_messages','sender_user_id'),
  ('chat_messages','user_id'),
  ('chat_notification_settings','user_id'),
  ('client_error_logs','user_id'),
  ('company_staff','user_id'),
  ('consent_documents','student_user_id'),
  ('course_access_log','user_id'),
  ('course_reminders','user_id'),
  ('course_requests','user_id'),
  ('course_review_grants','user_id'),
  ('data_subject_requests','user_id'),
  ('document_signatures','recipient_user_id'),
  ('document_signatures','sender_user_id'),
  ('organization_monthly_student_assignments','user_id'),
  ('organization_monthly_training_completions','user_id'),
  ('enrollment_history','user_id'),
  ('enrollments','user_id'),
  ('exolve_sip_accounts','user_id'),
  ('final_test_photo_challenges','user_id'),
  ('group_class_journal_marks','user_id'),
  ('group_completion_decision_history','user_id'),
  ('group_completion_decisions','user_id'),
  ('homework_submissions','student_id'),
  ('journal_entries','user_id'),
  ('lesson_progress','user_id'),
  ('module_access_overrides','user_id'),
  ('notification_preferences','user_id'),
  ('org_contracts','student_user_id'),
  ('org_general_messages','sender_user_id'),
  ('org_notifications','user_id'),
  ('org_staff','user_id'),
  ('org_student_messages','sender_user_id'),
  ('org_student_messages','student_user_id'),
  ('organization_offer_acceptances','user_id'),
  ('partner_applications','user_id'),
  ('pending_enrollments','user_id'),
  ('pep_agreements','user_id'),
  ('pipeline_runs','user_id'),
  ('profiles','user_id'),
  ('registration_attempts','user_id'),
  ('role_audit_log','target_user_id'),
  ('student_consents','user_id'),
  ('student_deletion_log','student_id'),
  ('student_frdo_data','user_id'),
  ('student_group_memberships','user_id'),
  ('student_identity_documents','user_id'),
  ('student_login_history','user_id'),
  ('student_login_tokens','user_id'),
  ('student_notifications','user_id'),
  ('student_roster_removals','user_id'),
  ('support_conversations','user_id'),
  ('support_messages','sender_user_id'),
  ('support_requests','user_id'),
  ('test_attempt_sessions','user_id'),
  ('test_attempt_start_requests','user_id'),
  ('test_attempts','user_id'),
  ('testimonials','user_id'),
  ('training_plans','user_id'),
  ('user_achievements','user_id'),
  ('user_roles','user_id'),
  ('uc_identification_records','user_id'),
  ('uc_identification_sources','user_id'),
  ('uc_identification_events','user_id'),
  ('uc_identification_records','decided_by'),
  ('uc_identification_events','actor_id'),
  ('uc_identification_requests','actor_id'),
  ('uc_admission_cases','user_id'),
  ('uc_admission_cases','responsible_id'),
  ('uc_admission_rule_sets','user_id'),
  ('uc_admission_rule_sets','reviewer_id'),
  ('uc_admission_case_events','user_id'),
  ('uc_admission_case_events','actor_id'),
  ('uc_admission_case_evidence','user_id'),
  ('uc_admission_case_evidence','captured_by'),
  ('uc_admission_evidence_reservations','user_id'),
  ('uc_admission_evidence_reservations','actor_id'),
  ('uc_admission_case_requests','user_id'),
  ('uc_admission_case_requests','actor_id'),
  ('video_identifications','user_id'),
  ('webinar_participants','user_id')
 ) x(t,c) LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO n USING p_user_id;
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table',r.t,'column',r.c,'count',n)); END IF;
 END LOOP;
 SELECT count(*)INTO n FROM public.uc_admission_cases WHERE reviews::text LIKE '%'||p_user_id::text||'%'OR decision::text LIKE '%'||p_user_id::text||'%'OR tasks::text LIKE '%'||p_user_id::text||'%';
 IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table','uc_admission_cases','column','review_attribution','count',n));END IF;
 result:=result||public.uc_group_education_personal_counts(p_user_id);
 result:=result||public.uc_learning_personal_counts(p_user_id);
 result:=result||public.uc_custom_journal_personal_counts(p_user_id);
 result:=result||public.uc_session_personal_counts(p_user_id);
 RETURN result;
END;$function$
;
ALTER FUNCTION public.account_deletion_personal_row_counts(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_personal_row_counts(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_personal_row_counts(uuid) TO service_role,sandbox_exec_atxwvjxbqjgkbjlhsdch;

-- uc_custom_journal_personal_counts(uuid); body_md5=bad19efdfe514c375a4f38cf8c064b01; definition_md5=bcbdd8666c91ff27ace8a3716d40153e
CREATE OR REPLACE FUNCTION public.uc_custom_journal_personal_counts(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE t text;c text;n bigint;result jsonb:='[]';BEGIN
 FOR t,c IN SELECT * FROM(VALUES('uc_custom_journals','created_by'),('uc_custom_journals','updated_by'),('uc_custom_journal_schemas','created_by'),('uc_custom_journal_records','subject_user_id'),('uc_custom_journal_records','recorded_by'),('uc_custom_journal_history','subject_user_id'),('uc_custom_journal_history','recorded_by'),('uc_custom_journal_requests','actor_id'),('uc_custom_journal_requests','subject_user_id'))x(t,c)LOOP
  EXECUTE format('SELECT count(*)FROM public.%I WHERE %I=$1',t,c)INTO n USING p_user;
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table',t,'column',c,'count',n));END IF;
 END LOOP;result:=result||public.uc_scoped_journal_personal_counts(p_user);RETURN result;
END;$function$
;
ALTER FUNCTION public.uc_custom_journal_personal_counts(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.uc_custom_journal_personal_counts(uuid) FROM PUBLIC,anon,authenticated,service_role;

