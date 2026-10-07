-- S-042 self-account deletion. Live schema audited 2026-10-07. The fixed
-- identifiers below are an allow-list, never a name/regex-based delete sweep.
-- Issued/signed institutional documents and unreviewed shared data fail closed.
BEGIN;
CREATE TABLE public.account_deletion_revocations (
 user_id uuid PRIMARY KEY, revoked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.account_deletion_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
 plan_hash text UNIQUE NOT NULL CHECK(length(plan_hash)=64),
 receipt_hash text NOT NULL CHECK(length(receipt_hash)=64),
 consent_version text NOT NULL,
 state text NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','cleanup_pending','deleted','superseded')),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '10 minutes',
 snapshot jsonb NOT NULL, files jsonb NOT NULL DEFAULT '[]',
 data_erased boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz
);
CREATE UNIQUE INDEX account_deletion_one_active ON public.account_deletion_jobs(user_id) WHERE state='cleanup_pending';
ALTER TABLE public.account_deletion_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_revocations,public.account_deletion_jobs FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.account_deletion_access_allowed() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid());
$fn$;
REVOKE ALL ON FUNCTION public.account_deletion_access_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_deletion_access_allowed() TO anon,authenticated,service_role;
CREATE FUNCTION public.account_deletion_request_guard() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT public.account_deletion_access_allowed() THEN
  RAISE EXCEPTION 'Account access revoked' USING ERRCODE='42501';
 END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.account_deletion_request_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_deletion_request_guard() TO anon,authenticated,service_role;
-- Never replace an unrelated pre-request hook. The live preflight found none.
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_db_role_setting s CROSS JOIN LATERAL unnest(s.setconfig) v
   WHERE v LIKE 'pgrst.db_pre_request=%' AND v NOT IN ('pgrst.db_pre_request=','pgrst.db_pre_request=public.account_deletion_request_guard')) THEN
   RAISE EXCEPTION 'Existing PostgREST hook needs explicit composition';
 END IF;
END;$guard$;
ALTER ROLE authenticator SET pgrst.db_pre_request='public.account_deletion_request_guard';
NOTIFY pgrst,'reload config';

-- Fixed table list from the audited catalog is appended below. Restrictive
-- policies also cover Realtime and Storage, which do not use db_pre_request.
CREATE POLICY account_deletion_no_revoked_access ON public."achievements" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."admin_branding" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."admin_generated_documents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."admin_notifications" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."admin_org_messages" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."admin_staff" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."ai_avatar_templates" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."ai_prompt_templates" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."ai_settings" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."ai_tutor_sessions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."ai_usage_log" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."app_settings" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."audit_logs" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."balance_transactions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."blog_posts" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."broadcast_companies_db" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."call_log_listens" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."call_logs" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."chat_group_members" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."chat_group_messages" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."chat_groups" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."chat_messages" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."chat_notification_settings" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."checko_api_usage" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."checko_pending_inns" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."checko_search_presets" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."checko_search_runs" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."checko_settings" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."client_error_logs" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."commercial_proposal_services" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."commercial_proposals" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."companies" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."company_documents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."company_requests" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."company_staff" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."consent_documents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."contract_template_registry" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."course_access_log" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."course_achievements" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."course_categories" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."course_documents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."course_landing_history" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."course_manual_credits" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."course_modules" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."course_payments" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."course_promo_codes" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."course_reminders" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."course_requests" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."course_review_grants" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."course_snapshots" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."courses" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."data_subject_requests" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."document_issuance_log" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."document_number_sequences" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."document_signatures" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_audit" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_cars" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_courses" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_entries" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_entry_reversals" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_groups" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_instructors" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_invites" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_lessons" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_memberships" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_operations" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_programs" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_schools" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_shifts" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."driving_students" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."education_document_records" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_action_tokens" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_campaign_clicks" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_campaign_consent_log" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_campaign_recipients" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_campaigns" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_conversations" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_drip_sends" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_drip_sequences" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_drip_steps" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_drip_subscribers" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_messages" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_sender_pool" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_suppressions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_templates" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_warmup_pings" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."email_warmup_state" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."enrollment_history" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."enrollment_requests" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."enrollments" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."exolve_sip_accounts" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."final_test_photo_challenges" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."frdo_signed_documents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."generation_history" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."goreltech_document_operations" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."goreltech_enrollment_orders" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."group_class_journal_marks" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."group_completion_decision_history" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."group_completion_decisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."group_document_schedules" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."group_documents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."homework_submissions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."incoming_documents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."journal_entries" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."journal_instances" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."kinescope_usage_cache" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."knowledge_bank" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."labor_safety_enrollment_protocols" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."labor_safety_groups" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."labor_safety_profiles" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."labor_safety_records" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."landing_content" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."landing_popups" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."lesson_attachments" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."lesson_progress" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."lessons" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."library_documents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."library_folders" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."mailing_campaign_ledger" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."mailing_campaign_replies" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."mailing_contacts" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."mailing_deliverability_checks" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."mailing_deliverability_seeds" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."mailing_reply_scan_state" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."mailing_report_links" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."mailing_seed_ledger" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."mailing_send_jobs" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."mailing_senders" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."marketplace_course_comments" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."marketplace_courses" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."marketplace_import_catalog" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."marketplace_orders" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."marketplace_settings" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."module_access_overrides" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."module_access_schedules" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."newsletter_subscribers" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."notification_dedup_log" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."notification_preferences" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."ordinary_campaign_attempts" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."ordinary_campaign_messages" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."ordinary_campaign_runs" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."ordinary_inbox_receipts" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."ordinary_inbox_scan_state" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."ordinary_mail_report_events" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_billing_documents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_contract_template_versions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_contract_templates" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_contracts" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_custom_roles" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_document_share_links" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_document_versions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_documents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_general_messages" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_notifications" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_payers" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_services" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_signatories" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_smtp_settings" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_staff" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."org_student_messages" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."organization_comments" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."organization_credentials" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."organization_feature_categories" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."organization_feature_usage" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."organization_features" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."organization_offer_acceptances" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."organization_payment_settings" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."organization_reminders" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."organization_usage" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."organizations" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."paid_umk_20260922_assets" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."paid_umk_20260922_grants" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."partner_applications" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."partner_monthly_stats" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."pending_enrollments" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."pep_agreements" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."pipeline_runs" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."plan_requests" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."platform_announcements" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."platform_invoice_acts" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."platform_updates" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."profiles" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."program_categories" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."program_documents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."program_folders" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."program_training_plans" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."promo_codes" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."proposal_presets" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."radio_stations" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."referral_attribution_log" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."referral_commissions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."referral_partners" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."referral_payouts" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."referral_promo_materials" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."referral_registrations" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."registration_attempt_rate_limits" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."registration_attempts" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."registration_failure_alert_claims" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."registration_links" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."role_audit_log" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."sales_blacklist" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."sales_companies_db" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."sales_contracts" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."sales_demo_links" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."sales_demo_sessions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."sales_lead_activities" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."sales_leads" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."sales_managers" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."sales_services" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."sales_tasks" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."service_orders" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."signature_comments" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."signature_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."skillspace_import_jobs" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."staff_invitations" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."student_consents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."student_deletion_log" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."student_documents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."student_frdo_data" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."student_group_memberships" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."student_groups" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."student_identity_documents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."student_login_history" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."student_login_tokens" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."student_notifications" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."student_roster_removals" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."subscription_invoices" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."subscription_requests" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."support_conversations" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."support_messages" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."support_requests" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."support_telegram_state" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."system_diagnostics" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."system_feature_categories" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."system_features" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."system_patches" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."system_settings" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."telegram_domain_rate_limits" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."test_attempt_sessions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."test_attempt_start_requests" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."test_attempts" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."test_questions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."testimonials" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."training_plans" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."user_achievements" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."user_roles" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."video_identifications" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."webinar_chat_messages" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."webinar_participants" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."webinar_poll_votes" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."webinar_polls" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."webinar_questions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."webinar_rate_limits" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON public."webinars" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));
CREATE POLICY account_deletion_no_revoked_access ON storage.objects AS RESTRICTIVE
 FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()));

-- Serialize personal-folder writes with confirmation. This protects against
-- a different active organization actor uploading to the deleting learner's
-- folder, and also applies to service-role/signed-upload metadata writes.
-- DELETE remains permitted for the Storage API cleanup worker.
CREATE FUNCTION public.account_deletion_storage_write_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE target_text text; target_id uuid;
BEGIN
 IF NEW.bucket_id IN ('avatars','student-documents','final-test-photos') THEN
  target_text:=split_part(NEW.name,'/',1);
  IF NEW.bucket_id='student-documents' AND target_text='avatars' THEN
   target_text:=split_part(split_part(NEW.name,'/',2),'.',1);
  END IF;
 ELSIF NEW.bucket_id='chat-attachments' THEN target_text:=split_part(NEW.name,'/',2);
 ELSE RETURN NEW; END IF;
 IF target_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NEW; END IF;
 target_id:=target_text::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(target_id::text,42007));
 IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=target_id) THEN
  RAISE EXCEPTION 'Account personal uploads are closed' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.account_deletion_storage_write_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER account_deletion_reject_revoked_upload BEFORE INSERT OR UPDATE ON storage.objects
 FOR EACH ROW EXECUTE FUNCTION public.account_deletion_storage_write_guard();

CREATE FUNCTION public.account_deletion_files(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name,'objectId',o.id,'updatedAt',o.updated_at) ORDER BY o.bucket_id,o.name),'[]'::jsonb)
 FROM storage.objects o WHERE
  (o.bucket_id IN ('avatars','student-documents','final-test-photos') AND split_part(o.name,'/',1)=p_user_id::text)
  OR (o.bucket_id='student-documents' AND o.name LIKE 'avatars/'||p_user_id::text||'.%')
  OR (o.bucket_id='chat-attachments' AND split_part(o.name,'/',2)=p_user_id::text
    AND (EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user_id AND split_part(o.name,'/',1)=p.organization_id::text)
      OR EXISTS(SELECT 1 FROM public.account_deletion_jobs j WHERE j.user_id=p_user_id AND j.state='cleanup_pending' AND split_part(o.name,'/',1)=j.snapshot->>'organizationId')));
$fn$;

CREATE FUNCTION public.account_deletion_personal_row_counts(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
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
  ('video_identifications','user_id'),
  ('webinar_participants','user_id')
 ) x(t,c) LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO n USING p_user_id;
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table',r.t,'column',r.c,'count',n)); END IF;
 END LOOP;
 RETURN result;
END;$fn$;

CREATE FUNCTION public.account_deletion_subject_write_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE column_name text; target_id uuid; targets uuid[];
BEGIN
 -- Sort locks to avoid deadlocks in two-person message rows.
 -- UPDATE may not move a revoked subject's data outside the deletion scope.
 SELECT array_agg(DISTINCT subject_id::uuid ORDER BY subject_id::uuid) INTO targets
 FROM unnest(TG_ARGV) c CROSS JOIN LATERAL (
  VALUES (to_jsonb(NEW)->>c),
         (CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->>c END)
 ) subjects(subject_id) WHERE subject_id IS NOT NULL;
 FOREACH target_id IN ARRAY coalesce(targets,'{}'::uuid[]) LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(target_id::text,42007));
  IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=target_id) THEN
   -- Only these two real DELETE-trigger event rows may be generated during
   -- service cleanup. The same transaction erases them at the tail. The flag
   -- is transaction-local and never bypasses profile/learning/document writes.
   IF TG_OP='INSERT' AND TG_TABLE_NAME IN ('enrollment_history','role_audit_log')
    AND auth.role()='service_role'
    AND current_setting('sintagma.account_deletion_erase_user',true)=target_id::text THEN CONTINUE; END IF;
   RAISE EXCEPTION 'Account personal data writes are closed' USING ERRCODE='42501';
  END IF;
 END LOOP;
 RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.account_deletion_subject_write_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."admin_org_messages" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('sender_user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."admin_staff" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."ai_prompt_templates" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."ai_tutor_sessions" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."ai_usage_log" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."call_log_listens" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('listener_user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."chat_group_members" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."chat_group_messages" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('sender_user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."chat_messages" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."chat_notification_settings" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."client_error_logs" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."company_staff" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."consent_documents" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('student_user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."course_access_log" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."course_reminders" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."course_requests" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."course_review_grants" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."data_subject_requests" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."document_issuance_log" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."document_signatures" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('recipient_user_id','sender_user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."education_document_records" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."enrollment_history" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."enrollments" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."exolve_sip_accounts" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."final_test_photo_challenges" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."group_class_journal_marks" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."group_completion_decision_history" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."group_completion_decisions" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."group_documents" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('student_user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."homework_submissions" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('student_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."journal_entries" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."lesson_progress" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."module_access_overrides" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."notification_preferences" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."org_contracts" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('student_user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."org_general_messages" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('sender_user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."org_notifications" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."org_staff" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."org_student_messages" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('sender_user_id','student_user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."organization_offer_acceptances" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."partner_applications" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."pending_enrollments" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."pep_agreements" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."pipeline_runs" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."profiles" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."registration_attempts" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."role_audit_log" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('target_user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."student_consents" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."student_deletion_log" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('student_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."student_frdo_data" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."student_group_memberships" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."student_identity_documents" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."student_login_history" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."student_login_tokens" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."student_notifications" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."student_roster_removals" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."support_conversations" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."support_messages" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('sender_user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."support_requests" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."test_attempt_sessions" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."test_attempt_start_requests" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."test_attempts" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."testimonials" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."training_plans" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."user_achievements" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."user_roles" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."video_identifications" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public."webinar_participants" FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');

-- Returns counts/identifiers only. Institutional documents are a concrete
-- temporary blocker until the operator approves their treatment; merely being
-- enrolled or having test results is never itself a blocker.
CREATE FUNCTION public.account_deletion_snapshot(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE p public.profiles%ROWTYPE; v_org uuid; v_owner boolean:=false;
 v_blockers jsonb:='[]'; v_categories jsonb:='[]'; v_files jsonb;
 v_count bigint; v_learning bigint; v_docs bigint:=0; v_shared bigint:=0;
 v_org_shared bigint:=0; v_courses bigint:=0; r record; v_fingerprint jsonb;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE user_id=p_user_id;
 v_org:=p.organization_id;
 IF v_org IS NOT NULL THEN v_owner:=public.is_org_owner(p_user_id,v_org); END IF;
 SELECT count(*) INTO v_learning FROM public.enrollments WHERE user_id=p_user_id;
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
  IF v_org_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','OWNERSHIP_TRANSFER_REQUIRED','message','Организация содержит пользователей, обучение, платежи или рабочие записи. Сначала передайте управление организацией.','actionHref','/organization?tab=staff')); END IF;
 END IF;
 v_categories:=jsonb_build_array(
  jsonb_build_object('key','account','label','Вход в аккаунт, пароль, профиль и личные настройки','count',1,'action','delete'),
  jsonb_build_object('key','private_files','label','Личные фотографии и загруженные документы','count',jsonb_array_length(v_files),'action','delete'),
  jsonb_build_object('key','learning_results','label','Назначения курсов, прогресс, попытки, ответы и результаты обучения','count',v_learning,'action','delete'),
  jsonb_build_object('key','institutional_documents','label','Оформленные документы','count',v_docs,'action',CASE WHEN v_docs>0 THEN 'block' ELSE 'delete' END));
 IF v_owner THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','empty_organization','label','Неиспользованная организация и ознакомительный курс','count',1,'action',CASE WHEN v_org_shared>0 THEN 'block' ELSE 'delete' END)); END IF;
 SELECT count(*) INTO v_count FROM public.audit_logs WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','common_audit','label','Общие события организации: запись события сохраняется, имя и ссылка на аккаунт удаляются','count',v_count,'action','anonymize')); END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record','label','Техническая запись запрета старого доступа и квитанция об удалении без имени и контактов','count',1,'action','retain'));
 -- The snapshot is compared atomically just before the first mutation. Counts
 -- and manifest cover additions during the confirmation dialog; no PII stored.
 RETURN jsonb_build_object('organizationId',v_org,'emptyOrganization',v_owner AND v_org_shared=0,'learningCount',v_learning,
  'categories',v_categories,'blockers',v_blockers,'files',v_files,'sharedCount',v_shared,'personalRows',public.account_deletion_personal_row_counts(p_user_id),
  'profileRevision',p.updated_at,'role',(SELECT role::text FROM public.user_roles WHERE user_id=p_user_id LIMIT 1));
END;$fn$;

CREATE FUNCTION public.account_deletion_prepare(p_user_id uuid,p_plan_hash text,p_receipt_hash text,p_consent_version text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s jsonb; j public.account_deletion_jobs%ROWTYPE;
BEGIN
 IF p_consent_version IS DISTINCT FROM 'full-personal-data-v1' THEN RETURN jsonb_build_object('code','CONSENT_REQUIRED'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,42007));
 IF length(p_plan_hash)<>64 OR length(p_receipt_hash)<>64 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RETURN jsonb_build_object('code','DELETION_UNAVAILABLE'); END IF;
 IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user_id) THEN RETURN jsonb_build_object('code','DELETION_UNAVAILABLE'); END IF;
 UPDATE public.account_deletion_jobs SET state='superseded',user_id=NULL,snapshot='{}',files='[]' WHERE user_id=p_user_id AND state='planned';
 s:=public.account_deletion_snapshot(p_user_id);
 IF jsonb_array_length(s->'blockers')>0 THEN RETURN jsonb_build_object('canDelete',false,'requestId',NULL,'expiresAt',NULL,'categories',s->'categories','blockers',s->'blockers'); END IF;
 INSERT INTO public.account_deletion_jobs(user_id,plan_hash,receipt_hash,consent_version,snapshot,files) VALUES(p_user_id,p_plan_hash,p_receipt_hash,p_consent_version,s,s->'files') RETURNING * INTO j;
 RETURN jsonb_build_object('canDelete',true,'requestId',j.id,'expiresAt',j.expires_at,'categories',s->'categories','blockers',s->'blockers');
END;$fn$;
CREATE FUNCTION public.account_deletion_begin(p_user_id uuid,p_plan_hash text,p_consent_version text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE j public.account_deletion_jobs%ROWTYPE; s jsonb;
BEGIN
 IF p_consent_version IS DISTINCT FROM 'full-personal-data-v1' THEN RETURN jsonb_build_object('code','CONSENT_REQUIRED'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,42007));
 SELECT * INTO j FROM public.account_deletion_jobs WHERE user_id=p_user_id AND plan_hash=p_plan_hash FOR UPDATE;
 IF FOUND AND j.consent_version IS DISTINCT FROM p_consent_version THEN RETURN jsonb_build_object('code','CONSENT_REQUIRED'); END IF;
 IF NOT FOUND OR j.state<>'planned' OR j.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('code','PLAN_EXPIRED'); END IF;
 PERFORM 1 FROM auth.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','PLAN_CHANGED'); END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=p_user_id FOR UPDATE;
 PERFORM 1 FROM public.organizations WHERE id=(j.snapshot->>'organizationId')::uuid FOR UPDATE;
 s:=public.account_deletion_snapshot(p_user_id);
 IF s IS DISTINCT FROM j.snapshot OR jsonb_array_length(s->'blockers')>0 THEN RETURN jsonb_build_object('code','PLAN_CHANGED'); END IF;
 INSERT INTO public.account_deletion_revocations(user_id) VALUES(p_user_id);
 DELETE FROM public.student_login_tokens WHERE user_id=p_user_id;
 UPDATE public.account_deletion_jobs SET state='cleanup_pending' WHERE id=j.id;
 RETURN jsonb_build_object('requestId',j.id,'receiptHash',j.receipt_hash);
END;$fn$;
CREATE FUNCTION public.account_deletion_status(p_request_id uuid,p_receipt_hash text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE j public.account_deletion_jobs%ROWTYPE;
BEGIN
 SELECT * INTO j FROM public.account_deletion_jobs WHERE id=p_request_id AND receipt_hash=p_receipt_hash;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','INVALID_RECEIPT'); END IF;
 RETURN jsonb_strip_nulls(jsonb_build_object('requestId',j.id,'status',CASE WHEN j.state='superseded' THEN 'planned' ELSE j.state END,'completedAt',j.completed_at,'consentVersion',j.consent_version));
END;$fn$;
CREATE FUNCTION public.account_deletion_work(p_request_id uuid,p_receipt_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE j public.account_deletion_jobs%ROWTYPE; manifest jsonb; remaining jsonb;
BEGIN
 SELECT * INTO j FROM public.account_deletion_jobs WHERE id=p_request_id AND receipt_hash=p_receipt_hash FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','INVALID_RECEIPT'); END IF;
 IF j.consent_version IS DISTINCT FROM 'full-personal-data-v1' THEN RETURN jsonb_build_object('code','CONSENT_REQUIRED'); END IF;
 IF j.state='deleted' THEN RETURN public.account_deletion_status(p_request_id,p_receipt_hash); END IF;
 IF j.state<>'cleanup_pending' THEN RETURN jsonb_build_object('code','NOT_CONFIRMED'); END IF;
 -- A late in-flight upload to the same audited personal folder is still part
 -- of the confirmed deletion. Persist it before attempting Storage removal.
 SELECT coalesce(jsonb_agg(DISTINCT f),'[]') INTO manifest
 FROM jsonb_array_elements(j.files||public.account_deletion_files(j.user_id)) f;
 UPDATE public.account_deletion_jobs SET files=manifest WHERE id=j.id;
 -- Completed paths do not consume the next retry's time budget. Process at
 -- most 100 remaining objects, so large accounts converge across retries.
 SELECT coalesce(jsonb_agg(f),'[]') INTO remaining FROM (
  SELECT f FROM jsonb_array_elements(manifest) f
  WHERE EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=f->>'bucket' AND o.name=f->>'path') LIMIT 100
 ) batch;
 RETURN jsonb_build_object('status',j.state,'userId',j.user_id,'files',remaining);
END;$fn$;

CREATE FUNCTION public.account_deletion_erase_data(p_request_id uuid,p_receipt_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
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
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(u)) n WHERE (n->>'count')::bigint>0) THEN RAISE EXCEPTION 'Personal data erasure is incomplete'; END IF;
 UPDATE public.account_deletion_jobs SET data_erased=true WHERE id=j.id;
 RETURN jsonb_build_object('erased',true);
END;$fn$;
CREATE FUNCTION public.account_deletion_complete(p_request_id uuid,p_receipt_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE j public.account_deletion_jobs%ROWTYPE;
BEGIN
 SELECT * INTO j FROM public.account_deletion_jobs WHERE id=p_request_id AND receipt_hash=p_receipt_hash FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','INVALID_RECEIPT'); END IF;
 IF j.consent_version IS DISTINCT FROM 'full-personal-data-v1' THEN RETURN jsonb_build_object('code','CONSENT_REQUIRED'); END IF;
 IF j.state='deleted' THEN RETURN public.account_deletion_status(p_request_id,p_receipt_hash); END IF;
 IF j.state<>'cleanup_pending' OR NOT j.data_erased OR EXISTS(SELECT 1 FROM auth.users WHERE id=j.user_id)
  OR EXISTS(SELECT 1 FROM storage.objects o JOIN jsonb_array_elements(j.files) f ON f->>'bucket'=o.bucket_id AND f->>'path'=o.name)
  OR jsonb_array_length(public.account_deletion_files(j.user_id))>0
  OR EXISTS(SELECT 1 FROM storage.objects WHERE owner=j.user_id OR owner_id=j.user_id::text)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(j.user_id)) n WHERE (n->>'count')::bigint>0)
  OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=j.user_id)
  OR EXISTS(SELECT 1 FROM public.student_login_tokens WHERE user_id=j.user_id) THEN RETURN jsonb_build_object('code','DELETION_UNAVAILABLE'); END IF;
 UPDATE public.account_deletion_jobs SET state='deleted',completed_at=clock_timestamp(),user_id=NULL,snapshot='{}',files='[]' WHERE id=j.id;
 RETURN public.account_deletion_status(p_request_id,p_receipt_hash);
END;$fn$;

REVOKE ALL ON FUNCTION public.account_deletion_files(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_files(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.account_deletion_snapshot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_snapshot(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.account_deletion_personal_row_counts(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_personal_row_counts(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.account_deletion_prepare(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_prepare(uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.account_deletion_begin(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_begin(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.account_deletion_status(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_status(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.account_deletion_work(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_work(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.account_deletion_erase_data(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_erase_data(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.account_deletion_complete(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_complete(uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
