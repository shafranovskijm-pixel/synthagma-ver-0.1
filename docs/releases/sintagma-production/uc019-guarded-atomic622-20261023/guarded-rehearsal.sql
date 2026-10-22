BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL search_path=pg_catalog,public;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL standard_conforming_strings=on;
SET LOCAL statement_timeout='90s';
SET LOCAL lock_timeout='5s';
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE uc019_body_allowlist(signature text PRIMARY KEY,old_md5 text NOT NULL,new_md5 text NOT NULL) ON COMMIT DROP;
INSERT INTO uc019_body_allowlist VALUES ('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)','692c93d809266565da3ec8a93668ad42','a685ded5aeaf0b819b630ea03b4ffdb5'),
('public.commit_org_document_version(uuid,uuid,uuid,bigint,jsonb,uuid,jsonb)','73ff967e0f7ff97c3d96f8d3f14191fd','ecfec664bb82c4fd3e8f74d07b4b1b70'),
('public.auto_create_education_document()','2ca349325b86d9a43bdb9ea52b63b94c','60f8049d6c880a3a1e56ba7dd7d955cb'),
('public.uc_guard_program_issuance()','05b362d516a0676bea8b48b1d2b40e7d','5d899185d5b31c279741f70e99f1d5a6'),
('public.uc_record_program_issuance()','357fd09f67deb7e838a314a6b60d60b2','ed5ec4865ca78c073b8525956f7c89f0'),
('public.cancel_course_assignment(uuid,uuid)','5216588e67f76fe3ae30ddab3837dcae','de0b5bb0df7a962f405296678b256cdc'),
('public.uc_guard_enrollment_delete()','695e59b918eaedb9aacbb4e808b503df','b30af6d239ef4e960c79563943c4d7bc'),
('public.account_deletion_files(uuid)','6edb02b4091de45199ae7f6f0749956d','2c6b6cc3785592a1783f0da78d9903b0'),
('public.account_deletion_snapshot(uuid)','fe1fbb5670a69d58c5a846dd93296ede','c2bc791637e1c8328c4f75d31f789066'),
('public.uc_admission_requirements_digest(uuid)','c9e1ca698f744ff7a67465ac1a9950e8','b44e0f51eade068990d21b0d76ddb936'),
('public.uc_admission_state(uuid,uuid,boolean)','dea3e9b40160f26adb28cfdfe2bc3e54','f8de974736b7c11f290bddd6da567cfb'),
('public.uc_admission_event(uuid,uuid,uuid,text,uuid,text,text)','3e81ed477945abdc48aafbc7bb08752a','bc1d89d8db30e4db62ec276f287f5df6'),
('public.uc_admission_validate_action(jsonb)','cd55430ab20af655fea869e9ebb3031e','380acd4fc60b5fde6d81cb31aa8db492'),
('public.apply_student_admission_case_action(uuid,uuid,uuid,jsonb)','085703a16eb2795cbc018b87ca232893','7516522496a8713c03ccec72b8f978bb'),
('public.can_access_course_as_learner(uuid)','ac874288fd237b9a70850c9108d7fbcf','438bc129bc68ae71e2d39589ed69a81f'),
('public.read_learning_outcome(uuid,jsonb)','b156cdaed9f6e4de74500d96d035191e','452078dd221b08f51db99aefd69d7f78'),
('public.uc_learning_access(uuid,jsonb,boolean)','8906d1848181831ba04d823913f02658','8bcb093fc00c9675d05e32f80bf52314'),
('public.uc_scoped_journal_personal_counts(uuid)','63476fea68407b8f0a09a0ace1e2030a','270bb950847dc091c2323fd8e5c51b53'),
('public.uc_scoped_journal_erase_user(uuid)','eeab1ccbbf78c67ad8035420aa9e2ff7','4114bd6e72cd005e809ab2d6c4e52f48'),
('public.recalc_enrollment_time(uuid)','debd68026dbe4ab127ba954878b9c096','58011a57e517024aae9488a53b4a2428'),
('public.recalc_enrollment_progress()','6e08194130c44ad1009ea42c73e0bdd0','e2b82a145b65ddcf28dcb0c59ac391df'),
('public.complete_own_course_enrollment(uuid)','cf2e185eea26424a64407615da3f84fc','09f53643f86673bbc6d791eeb1bb3bc8'),
('public.auto_complete_enrollment()','7975b82096da4f518bd429d14011208a','71e0da45470e84f05a89f5b90de98a92');
CREATE TEMP TABLE uc019_new_function_allowlist(signature text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO uc019_new_function_allowlist VALUES ('public.apply_education_issuance_action(uuid,jsonb,uuid,jsonb)'),
('public.prepare_education_issuance_artifacts(uuid,jsonb,uuid,jsonb)'),
('public.read_education_issuance(uuid,jsonb,jsonb)'),
('public.uc_attest_education_issuance_artifact(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)'),
('public.uc_attest_education_issuance_staging(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)'),
('public.uc_education_actor_json(jsonb,uuid,boolean)'),
('public.uc_education_actor_org_permission(uuid,uuid,text)'),
('public.uc_education_admission_conditions(uuid)'),
('public.uc_education_admission_definition_shape(jsonb,text)'),
('public.uc_education_admission_digest(jsonb,uuid,jsonb,jsonb)'),
('public.uc_education_admission_evidence_shape(jsonb)'),
('public.uc_education_admission_review_check(uuid,uuid,jsonb,jsonb)'),
('public.uc_education_admission_reviews(uuid)'),
('public.uc_education_artifact_actor(uuid,uuid,uuid,uuid,uuid)'),
('public.uc_education_artifact_attest_shape(jsonb,boolean)'),
('public.uc_education_artifact_context(uuid,uuid,uuid,bigint,uuid)'),
('public.uc_education_artifact_context_json(uuid,uuid,uuid,bigint,uuid)'),
('public.uc_education_artifact_final(uuid,uuid,jsonb)'),
('public.uc_education_artifact_live(uuid,uuid,uuid,bigint,boolean)'),
('public.uc_education_artifact_saved_source(uuid)'),
('public.uc_education_artifact_service_request(uuid,uuid,uuid,uuid,bigint,uuid)'),
('public.uc_education_canonical_boundary()'),
('public.uc_education_change_apply(uuid,uuid,jsonb,text)'),
('public.uc_education_change_preview(uuid,uuid,jsonb)'),
('public.uc_education_erase_user(uuid)'),
('public.uc_education_frdo_snapshot(uuid,uuid,jsonb,jsonb,text,jsonb,boolean)'),
('public.uc_education_handover_check(uuid,uuid,jsonb)'),
('public.uc_education_html(text)'),
('public.uc_education_issue_actor()'),
('public.uc_education_issue_admission(uuid,uuid,uuid,jsonb,text)'),
('public.uc_education_issue_artifact_projection(uuid,jsonb,boolean)'),
('public.uc_education_issue_basis_projection(uuid,jsonb)'),
('public.uc_education_issue_block(text)'),
('public.uc_education_issue_can(uuid,uuid,uuid,uuid,uuid,text)'),
('public.uc_education_issue_candidate(uuid,uuid,uuid,boolean)'),
('public.uc_education_issue_caps(uuid,uuid,uuid,uuid,uuid)'),
('public.uc_education_issue_enrollment_fence(uuid,boolean)'),
('public.uc_education_issue_error(text)'),
('public.uc_education_issue_event(uuid)'),
('public.uc_education_issue_export(uuid,jsonb,jsonb)'),
('public.uc_education_issue_fence(uuid,uuid,uuid[],text)'),
('public.uc_education_issue_handover_projection(uuid,jsonb)'),
('public.uc_education_issue_one(uuid,jsonb,text)'),
('public.uc_education_issue_preview(uuid,uuid,jsonb,boolean)'),
('public.uc_education_issue_proof_visible(jsonb)'),
('public.uc_education_issue_record(uuid,uuid,uuid)'),
('public.uc_education_issue_scope(uuid,jsonb)'),
('public.uc_education_issue_source(uuid,jsonb,boolean)'),
('public.uc_education_issue_source_lock(uuid,jsonb)'),
('public.uc_education_issue_source_projection(uuid,jsonb)'),
('public.uc_education_issue_state_hash(uuid)'),
('public.uc_education_mutation_result(uuid,jsonb,jsonb,boolean)'),
('public.uc_education_number_witness(uuid,date)'),
('public.uc_education_output_approval(uuid)'),
('public.uc_education_output_slot(uuid,uuid,uuid,bigint,jsonb,uuid,jsonb)'),
('public.uc_education_output_storage_guard()'),
('public.uc_education_personal_counts(uuid)'),
('public.uc_education_preparation_access(uuid,boolean,uuid)'),
('public.uc_education_preparation_item_json(uuid)'),
('public.uc_education_preparation_json(uuid)'),
('public.uc_education_prospective_numbers(jsonb,integer,date,text)'),
('public.uc_education_render_variables(uuid,jsonb,jsonb,jsonb,jsonb,text)'),
('public.uc_education_replacement_identity(uuid,boolean)'),
('public.uc_education_retained_learning_summary(uuid,jsonb)'),
('public.uc_education_saved_output_counts(uuid)'),
('public.uc_education_staging_storage_guard()'),
('public.uc_education_template(uuid,jsonb,boolean)'),
('public.uc_education_template_current(uuid,jsonb,jsonb)'),
('public.uc_education_trusted_erasure(uuid)'),
('public.uc_education_withdraw_apply(uuid,uuid,jsonb,text,jsonb,text)'),
('public.uc_education_withdraw_can(uuid,uuid,uuid,boolean)'),
('public.uc_education_withdraw_event(uuid)'),
('public.uc_education_withdraw_intent(uuid,uuid,jsonb)'),
('public.uc_education_withdraw_state(uuid,uuid,uuid)'),
('public.uc_enrollment_is_withdrawn(uuid)'),
('public.uc_guard_retained_enrollment()'),
('public.uc_guard_retained_learner_activity()');
CREATE TEMP TABLE uc019_expected_catalog(value jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO uc019_expected_catalog VALUES ('{"schema_version":1,"status":"SOURCE_REVIEW_REQUIRED_NATIVE_COMPONENTS_PASSED_NOT_PRODUCTION_RELEASE","migration":"20261023010000_uc_education_issuance_lifecycle.sql","version":"20261023010000","rawSHA256":"73a44f8fb32c51682962c02211f24439e574132e06cb9f325e2407082fc48bc6","expectedLedger":621,"expectedPublicTables":344,"expectedAllTableSets":379,"expectedPriorMigration":{"created_by_null":true,"idempotency_key_null":true,"name":"uc_purge_worker_execute_boundary","raw_bytes":277,"raw_sha256":"70041ce415855b204808f94efb5e1f3179019cf38bb784ed217a5bbc67bf2cd1","rollback_null":true,"statement_count":1,"version":"20261022233000"},"newTables":["uc_education_issuance_contexts","uc_education_issuance_events","uc_education_issuance_preparation_items","uc_education_issuance_preparations","uc_education_issuance_requests","uc_education_issuance_states","uc_enrollment_withdrawal_events","uc_enrollment_withdrawal_states"],"newFunctions":["public.apply_education_issuance_action(uuid,jsonb,uuid,jsonb)","public.prepare_education_issuance_artifacts(uuid,jsonb,uuid,jsonb)","public.read_education_issuance(uuid,jsonb,jsonb)","public.uc_attest_education_issuance_artifact(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)","public.uc_attest_education_issuance_staging(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)","public.uc_education_actor_json(jsonb,uuid,boolean)","public.uc_education_actor_org_permission(uuid,uuid,text)","public.uc_education_admission_conditions(uuid)","public.uc_education_admission_definition_shape(jsonb,text)","public.uc_education_admission_digest(jsonb,uuid,jsonb,jsonb)","public.uc_education_admission_evidence_shape(jsonb)","public.uc_education_admission_review_check(uuid,uuid,jsonb,jsonb)","public.uc_education_admission_reviews(uuid)","public.uc_education_artifact_actor(uuid,uuid,uuid,uuid,uuid)","public.uc_education_artifact_attest_shape(jsonb,boolean)","public.uc_education_artifact_context(uuid,uuid,uuid,bigint,uuid)","public.uc_education_artifact_context_json(uuid,uuid,uuid,bigint,uuid)","public.uc_education_artifact_final(uuid,uuid,jsonb)","public.uc_education_artifact_live(uuid,uuid,uuid,bigint,boolean)","public.uc_education_artifact_saved_source(uuid)","public.uc_education_artifact_service_request(uuid,uuid,uuid,uuid,bigint,uuid)","public.uc_education_canonical_boundary()","public.uc_education_change_apply(uuid,uuid,jsonb,text)","public.uc_education_change_preview(uuid,uuid,jsonb)","public.uc_education_erase_user(uuid)","public.uc_education_frdo_snapshot(uuid,uuid,jsonb,jsonb,text,jsonb,boolean)","public.uc_education_handover_check(uuid,uuid,jsonb)","public.uc_education_html(text)","public.uc_education_issue_actor()","public.uc_education_issue_admission(uuid,uuid,uuid,jsonb,text)","public.uc_education_issue_artifact_projection(uuid,jsonb,boolean)","public.uc_education_issue_basis_projection(uuid,jsonb)","public.uc_education_issue_block(text)","public.uc_education_issue_can(uuid,uuid,uuid,uuid,uuid,text)","public.uc_education_issue_candidate(uuid,uuid,uuid,boolean)","public.uc_education_issue_caps(uuid,uuid,uuid,uuid,uuid)","public.uc_education_issue_enrollment_fence(uuid,boolean)","public.uc_education_issue_error(text)","public.uc_education_issue_event(uuid)","public.uc_education_issue_export(uuid,jsonb,jsonb)","public.uc_education_issue_fence(uuid,uuid,uuid[],text)","public.uc_education_issue_handover_projection(uuid,jsonb)","public.uc_education_issue_one(uuid,jsonb,text)","public.uc_education_issue_preview(uuid,uuid,jsonb,boolean)","public.uc_education_issue_proof_visible(jsonb)","public.uc_education_issue_record(uuid,uuid,uuid)","public.uc_education_issue_scope(uuid,jsonb)","public.uc_education_issue_source(uuid,jsonb,boolean)","public.uc_education_issue_source_lock(uuid,jsonb)","public.uc_education_issue_source_projection(uuid,jsonb)","public.uc_education_issue_state_hash(uuid)","public.uc_education_mutation_result(uuid,jsonb,jsonb,boolean)","public.uc_education_number_witness(uuid,date)","public.uc_education_output_approval(uuid)","public.uc_education_output_slot(uuid,uuid,uuid,bigint,jsonb,uuid,jsonb)","public.uc_education_output_storage_guard()","public.uc_education_personal_counts(uuid)","public.uc_education_preparation_access(uuid,boolean,uuid)","public.uc_education_preparation_item_json(uuid)","public.uc_education_preparation_json(uuid)","public.uc_education_prospective_numbers(jsonb,integer,date,text)","public.uc_education_render_variables(uuid,jsonb,jsonb,jsonb,jsonb,text)","public.uc_education_replacement_identity(uuid,boolean)","public.uc_education_retained_learning_summary(uuid,jsonb)","public.uc_education_saved_output_counts(uuid)","public.uc_education_staging_storage_guard()","public.uc_education_template(uuid,jsonb,boolean)","public.uc_education_template_current(uuid,jsonb,jsonb)","public.uc_education_trusted_erasure(uuid)","public.uc_education_withdraw_apply(uuid,uuid,jsonb,text,jsonb,text)","public.uc_education_withdraw_can(uuid,uuid,uuid,boolean)","public.uc_education_withdraw_event(uuid)","public.uc_education_withdraw_intent(uuid,uuid,jsonb)","public.uc_education_withdraw_state(uuid,uuid,uuid)","public.uc_enrollment_is_withdrawn(uuid)","public.uc_guard_retained_enrollment()","public.uc_guard_retained_learner_activity()"],"newFunctionCount":77,"oldFunctionBodyAllowlist":[{"signature":"public.issue_education_document_batch(uuid,uuid,uuid,jsonb)","old_md5":"692c93d809266565da3ec8a93668ad42","new_md5":"a685ded5aeaf0b819b630ea03b4ffdb5","old_acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","old_owner":"postgres","old_config":["search_path=public"],"old_security_definer":true,"old_volatility":"v"},{"signature":"public.commit_org_document_version(uuid,uuid,uuid,bigint,jsonb,uuid,jsonb)","old_md5":"73ff967e0f7ff97c3d96f8d3f14191fd","new_md5":"ecfec664bb82c4fd3e8f74d07b4b1b70","old_acl":"{postgres=X/postgres,authenticated=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public"],"old_security_definer":true,"old_volatility":"v"},{"signature":"public.auto_create_education_document()","old_md5":"2ca349325b86d9a43bdb9ea52b63b94c","new_md5":"60f8049d6c880a3a1e56ba7dd7d955cb","old_acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","old_owner":"postgres","old_config":["search_path=public"],"old_security_definer":true,"old_volatility":"v"},{"signature":"public.uc_guard_program_issuance()","old_md5":"05b362d516a0676bea8b48b1d2b40e7d","new_md5":"5d899185d5b31c279741f70e99f1d5a6","old_acl":"{postgres=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public"],"old_security_definer":true,"old_volatility":"v"},{"signature":"public.uc_record_program_issuance()","old_md5":"357fd09f67deb7e838a314a6b60d60b2","new_md5":"ed5ec4865ca78c073b8525956f7c89f0","old_acl":"{postgres=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public"],"old_security_definer":true,"old_volatility":"v"},{"signature":"public.cancel_course_assignment(uuid,uuid)","old_md5":"5216588e67f76fe3ae30ddab3837dcae","new_md5":"de0b5bb0df7a962f405296678b256cdc","old_acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public","lock_timeout=3s"],"old_security_definer":true,"old_volatility":"v"},{"signature":"public.uc_guard_enrollment_delete()","old_md5":"695e59b918eaedb9aacbb4e808b503df","new_md5":"b30af6d239ef4e960c79563943c4d7bc","old_acl":"{postgres=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public"],"old_security_definer":true,"old_volatility":"v"},{"signature":"public.account_deletion_files(uuid)","old_md5":"6edb02b4091de45199ae7f6f0749956d","new_md5":"2c6b6cc3785592a1783f0da78d9903b0","old_acl":"{postgres=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public, storage"],"old_security_definer":true,"old_volatility":"s"},{"signature":"public.account_deletion_snapshot(uuid)","old_md5":"fe1fbb5670a69d58c5a846dd93296ede","new_md5":"c2bc791637e1c8328c4f75d31f789066","old_acl":"{postgres=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public, storage"],"old_security_definer":true,"old_volatility":"s"},{"signature":"public.uc_admission_requirements_digest(uuid)","old_md5":"c9e1ca698f744ff7a67465ac1a9950e8","new_md5":"b44e0f51eade068990d21b0d76ddb936","old_acl":"{postgres=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public"],"old_security_definer":true,"old_volatility":"s"},{"signature":"public.uc_admission_state(uuid,uuid,boolean)","old_md5":"dea3e9b40160f26adb28cfdfe2bc3e54","new_md5":"f8de974736b7c11f290bddd6da567cfb","old_acl":"{postgres=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public"],"old_security_definer":true,"old_volatility":"s"},{"signature":"public.uc_admission_event(uuid,uuid,uuid,text,uuid,text,text)","old_md5":"3e81ed477945abdc48aafbc7bb08752a","new_md5":"bc1d89d8db30e4db62ec276f287f5df6","old_acl":"{postgres=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public"],"old_security_definer":true,"old_volatility":"v"},{"signature":"public.uc_admission_validate_action(jsonb)","old_md5":"cd55430ab20af655fea869e9ebb3031e","new_md5":"380acd4fc60b5fde6d81cb31aa8db492","old_acl":"{postgres=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public"],"old_security_definer":false,"old_volatility":"i"},{"signature":"public.apply_student_admission_case_action(uuid,uuid,uuid,jsonb)","old_md5":"085703a16eb2795cbc018b87ca232893","new_md5":"7516522496a8713c03ccec72b8f978bb","old_acl":"{postgres=X/postgres,authenticated=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public"],"old_security_definer":true,"old_volatility":"v"},{"signature":"public.can_access_course_as_learner(uuid)","old_md5":"ac874288fd237b9a70850c9108d7fbcf","new_md5":"438bc129bc68ae71e2d39589ed69a81f","old_acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","old_owner":"postgres","old_config":["search_path=public"],"old_security_definer":true,"old_volatility":"s"},{"signature":"public.read_learning_outcome(uuid,jsonb)","old_md5":"b156cdaed9f6e4de74500d96d035191e","new_md5":"452078dd221b08f51db99aefd69d7f78","old_acl":"{postgres=X/postgres,authenticated=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public"],"old_security_definer":true,"old_volatility":"s"},{"signature":"public.uc_learning_access(uuid,jsonb,boolean)","old_md5":"8906d1848181831ba04d823913f02658","new_md5":"8bcb093fc00c9675d05e32f80bf52314","old_acl":"{postgres=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public"],"old_security_definer":true,"old_volatility":"s"},{"signature":"public.uc_scoped_journal_personal_counts(uuid)","old_md5":"63476fea68407b8f0a09a0ace1e2030a","new_md5":"270bb950847dc091c2323fd8e5c51b53","old_acl":"{postgres=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public"],"old_security_definer":true,"old_volatility":"s"},{"signature":"public.uc_scoped_journal_erase_user(uuid)","old_md5":"eeab1ccbbf78c67ad8035420aa9e2ff7","new_md5":"4114bd6e72cd005e809ab2d6c4e52f48","old_acl":"{postgres=X/postgres}","old_owner":"postgres","old_config":["search_path=pg_catalog, public"],"old_security_definer":true,"old_volatility":"v"},{"signature":"public.recalc_enrollment_time(uuid)","old_md5":"debd68026dbe4ab127ba954878b9c096","new_md5":"58011a57e517024aae9488a53b4a2428","old_acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","old_owner":"postgres","old_config":["search_path=public"],"old_security_definer":true,"old_volatility":"v"},{"signature":"public.recalc_enrollment_progress()","old_md5":"6e08194130c44ad1009ea42c73e0bdd0","new_md5":"e2b82a145b65ddcf28dcb0c59ac391df","old_acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","old_owner":"postgres","old_config":["search_path=public"],"old_security_definer":true,"old_volatility":"v"},{"signature":"public.complete_own_course_enrollment(uuid)","old_md5":"cf2e185eea26424a64407615da3f84fc","new_md5":"09f53643f86673bbc6d791eeb1bb3bc8","old_acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","old_owner":"postgres","old_config":["search_path=public"],"old_security_definer":true,"old_volatility":"v"},{"signature":"public.auto_complete_enrollment()","old_md5":"7975b82096da4f518bd429d14011208a","new_md5":"71e0da45470e84f05a89f5b90de98a92","old_acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","old_owner":"postgres","old_config":["search_path=public"],"old_security_definer":true,"old_volatility":"v"}],"exactOldBatchACL":{"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","body_md5":"692c93d809266565da3ec8a93668ad42","oid":"197802"},"oldACLChange":{"signature":"public.issue_education_document_batch(uuid,uuid,uuid,jsonb)","revokeOnly":["PUBLIC","anon","authenticated","service_role"],"preserveAllOtherPreexistingGrants":true},"oldConstraintPreImage":{"pretty":"CHECK (delivery_method = ANY (ARRAY[''personal''::text, ''representative''::text, ''postal''::text]))","raw":"CHECK ((delivery_method = ANY (ARRAY[''personal''::text, ''representative''::text, ''postal''::text])))","tuple":{"conbin":"{SCALARARRAYOPEXPR :opno 98 :opfuncid 67 :hashfuncid 0 :negfuncid 0 :useOr true :inputcollid 100 :args ({VAR :varno 1 :varattno 18 :vartype 25 :vartypmod -1 :varcollid 100 :varnullingrels (b) :varlevelsup 0 :varnosyn 1 :varattnosyn 18 :location -1} {ARRAYEXPR :array_typeid 1009 :array_collid 100 :element_typeid 25 :elements ({CONST :consttype 25 :consttypmod -1 :constcollid 100 :constlen -1 :constbyval false :constisnull false :location -1 :constvalue 12 [ 48 0 0 0 112 101 114 115 111 110 97 108 ]} {CONST :consttype 25 :consttypmod -1 :constcollid 100 :constlen -1 :constbyval false :constisnull false :location -1 :constvalue 18 [ 72 0 0 0 114 101 112 114 101 115 101 110 116 97 116 105 118 101 ]} {CONST :consttype 25 :consttypmod -1 :constcollid 100 :constlen -1 :constbyval false :constisnull false :location -1 :constvalue 10 [ 40 0 0 0 112 111 115 116 97 108 ]}) :multidims false :location -1}) :location -1}","condeferrable":false,"condeferred":false,"conexclop":null,"confdelsetcols":null,"confdeltype":" ","conffeqop":null,"confkey":null,"confmatchtype":" ","confrelid":"0","confupdtype":" ","conindid":"0","coninhcount":0,"conislocal":true,"conkey":[18],"conname":"education_document_records_delivery_method_check","connamespace":"2200","connoinherit":false,"conparentid":"0","conpfeqop":null,"conppeqop":null,"conrelid":"21935","contype":"c","contypid":"0","convalidated":true,"oid":"21945"}},"newConstraint":{"name":"education_document_records_delivery_method_check","validated":true,"definition":"CHECK (delivery_method = ANY (ARRAY[''personal''::text, ''representative''::text, ''postal''::text, ''not_recorded''::text]))"},"newOldTableGuards":[{"args":"","name":"uc_retained_activity_write","type":31,"table":"ai_tutor_sessions","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR DELETE OR UPDATE ON ai_tutor_sessions FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_learner_activity()"},{"args":"","name":"uc_retained_activity_write","type":31,"table":"course_access_log","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR DELETE OR UPDATE ON course_access_log FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_learner_activity()"},{"args":"","name":"uc_retained_activity_write","type":31,"table":"course_manual_credits","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR DELETE OR UPDATE ON course_manual_credits FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_learner_activity()"},{"args":"","name":"uc_education_issuance_guard","type":31,"table":"education_document_records","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_education_issuance_guard BEFORE INSERT OR DELETE OR UPDATE ON education_document_records FOR EACH ROW EXECUTE FUNCTION uc_education_canonical_boundary()"},{"args":"","name":"uc_retained_enrollment_write","type":19,"table":"enrollments","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_enrollment_write BEFORE UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_enrollment()"},{"args":"","name":"uc_retained_activity_write","type":31,"table":"homework_submissions","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR DELETE OR UPDATE ON homework_submissions FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_learner_activity()"},{"args":"","name":"uc_retained_activity_write","type":31,"table":"lesson_progress","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR DELETE OR UPDATE ON lesson_progress FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_learner_activity()"},{"args":"","name":"uc_retained_activity_write","type":31,"table":"test_attempt_sessions","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR DELETE OR UPDATE ON test_attempt_sessions FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_learner_activity()"},{"args":"","name":"uc_retained_activity_write","type":31,"table":"test_attempts","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR DELETE OR UPDATE ON test_attempts FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_learner_activity()"},{"args":"","name":"uc_education_staging_object_boundary","type":31,"table":"objects","schema":"storage","enabled":"O","definition":"CREATE TRIGGER uc_education_staging_object_boundary BEFORE INSERT OR DELETE OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION uc_education_staging_storage_guard()"},{"args":"","name":"zz_uc_education_output_object_boundary","type":23,"table":"objects","schema":"storage","enabled":"O","definition":"CREATE TRIGGER zz_uc_education_output_object_boundary BEFORE INSERT OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION uc_education_output_storage_guard()"}],"nativeParentFKTriggers":[],"newBucket":{"id":"education-issuance-staging","name":"education-issuance-staging","public":false,"file_size_limit":20971520,"allowed_mime_types":["application/pdf"]},"newStoragePolicy":{"cmd":"ALL","qual":"(bucket_id <> ''education-issuance-staging''::text)","roles":["anon","authenticated"],"tablename":"objects","permissive":"RESTRICTIVE","policyname":"uc_education_staging_private_boundary","schemaname":"storage","with_check":"(bucket_id <> ''education-issuance-staging''::text)"},"nativePortableCatalog":{"tables":[{"acl":"{postgres=arwdDxtm/postgres}","rls":true,"kind":"r","name":"uc_education_issuance_contexts","owner":"postgres","columns":[{"acl":null,"name":"id","type":"uuid","number":1,"default":"gen_random_uuid()","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"transaction_id","type":"bigint","number":2,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"backend_pid","type":"integer","number":3,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"actor_id","type":"uuid","number":4,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"organization_id","type":"uuid","number":5,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"mode","type":"text","number":6,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":"pg_catalog.default","generated":"","compression":""},{"acl":null,"name":"enrollment_id","type":"uuid","number":7,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"user_id","type":"uuid","number":8,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"course_id","type":"uuid","number":9,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"group_id","type":"uuid","number":10,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"original_record_id","type":"uuid","number":11,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"proof","type":"jsonb","number":12,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"source_snapshot","type":"jsonb","number":13,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"official_identity","type":"jsonb","number":14,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"created_at","type":"timestamp with time zone","number":15,"default":"clock_timestamp()","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""}],"indexes":[{"live":true,"name":"uc_education_issuance_contexts_pkey","ready":true,"valid":true,"unique":true,"primary":true,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE UNIQUE INDEX uc_education_issuance_contexts_pkey ON public.uc_education_issuance_contexts USING btree (id)"}],"options":null,"policies":[],"triggers":[],"force_rls":false,"partition":false,"constraints":[{"name":"uc_education_issuance_contexts_mode_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (mode = ANY (ARRAY[''original''::text, ''duplicate''::text]))","inherit_count":0},{"name":"uc_education_issuance_contexts_pkey","type":"p","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":true,"validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","inherit_count":0}],"persistence":"p","replica_identity":"d","direct_client_privilege":false},{"acl":"{postgres=arwdDxtm/postgres}","rls":true,"kind":"r","name":"uc_education_issuance_events","owner":"postgres","columns":[{"acl":null,"name":"id","type":"uuid","number":1,"default":"gen_random_uuid()","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"record_id","type":"uuid","number":2,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"organization_id","type":"uuid","number":3,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"user_id","type":"uuid","number":4,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"revision","type":"bigint","number":5,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"kind","type":"text","number":6,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":"pg_catalog.default","generated":"","compression":""},{"acl":null,"name":"actor_id","type":"uuid","number":7,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"reason","type":"text","number":8,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":"pg_catalog.default","generated":"","compression":""},{"acl":null,"name":"previous_state_hash","type":"text","number":9,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":"pg_catalog.default","generated":"","compression":""},{"acl":null,"name":"state_hash","type":"text","number":10,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":"pg_catalog.default","generated":"","compression":""},{"acl":null,"name":"payload","type":"jsonb","number":11,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"participant_ids","type":"uuid[]","number":12,"default":"''{}''::uuid[]","options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"redacted","type":"boolean","number":13,"default":"false","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"recorded_at","type":"timestamp with time zone","number":14,"default":"clock_timestamp()","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""}],"indexes":[{"live":true,"name":"uc_education_issuance_events_pkey","ready":true,"valid":true,"unique":true,"primary":true,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE UNIQUE INDEX uc_education_issuance_events_pkey ON public.uc_education_issuance_events USING btree (id)"},{"live":true,"name":"uc_education_issuance_events_record_id_revision_key","ready":true,"valid":true,"unique":true,"primary":false,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE UNIQUE INDEX uc_education_issuance_events_record_id_revision_key ON public.uc_education_issuance_events USING btree (record_id, revision)"},{"live":true,"name":"uc_education_issuance_history","ready":true,"valid":true,"unique":false,"primary":false,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE INDEX uc_education_issuance_history ON public.uc_education_issuance_events USING btree (organization_id, record_id, revision DESC)"}],"options":null,"policies":[],"triggers":[],"force_rls":false,"partition":false,"constraints":[{"name":"uc_education_issuance_events_kind_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (kind = ANY (ARRAY[''issued''::text, ''metadata_corrected''::text, ''handover_recorded''::text, ''handover_voided''::text, ''duplicate_issued''::text, ''annulled''::text]))","inherit_count":0},{"name":"uc_education_issuance_events_pkey","type":"p","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":true,"validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","inherit_count":0},{"name":"uc_education_issuance_events_previous_state_hash_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (previous_state_hash ~ ''^[a-f0-9]{64}$''::text)","inherit_count":0},{"name":"uc_education_issuance_events_reason_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (length(reason) <= 2000)","inherit_count":0},{"name":"uc_education_issuance_events_record_id_revision_key","type":"u","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":true,"validated":true,"deferrable":false,"definition":"UNIQUE (record_id, revision)","inherit_count":0},{"name":"uc_education_issuance_events_revision_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (revision >= 1 AND revision <= ''9007199254740991''::bigint)","inherit_count":0},{"name":"uc_education_issuance_events_state_hash_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (state_hash ~ ''^[a-f0-9]{64}$''::text)","inherit_count":0}],"persistence":"p","replica_identity":"d","direct_client_privilege":false},{"acl":"{postgres=arwdDxtm/postgres}","rls":true,"kind":"r","name":"uc_education_issuance_preparation_items","owner":"postgres","columns":[{"acl":null,"name":"id","type":"uuid","number":1,"default":"gen_random_uuid()","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"preparation_id","type":"uuid","number":2,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"organization_id","type":"uuid","number":3,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"enrollment_id","type":"uuid","number":4,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"user_id","type":"uuid","number":5,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"course_id","type":"uuid","number":6,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"group_id","type":"uuid","number":7,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"input_revision","type":"bigint","number":8,"default":"1","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"number_plan","type":"jsonb","number":9,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"eligibility_ref","type":"jsonb","number":10,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"source_snapshot","type":"jsonb","number":11,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"official_identity","type":"jsonb","number":12,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"frdo_facts","type":"jsonb","number":13,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"render_variables","type":"jsonb","number":14,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"render_input_hash","type":"text","number":15,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":"pg_catalog.default","generated":"","compression":""},{"acl":null,"name":"output_document_id","type":"uuid","number":16,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"output_request_id","type":"uuid","number":17,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"retained_subject_user_id","type":"uuid","number":18,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"staging_proof","type":"jsonb","number":19,"default":null,"options":null,"storage":"x","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"artifact","type":"jsonb","number":20,"default":null,"options":null,"storage":"x","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"final_record_id","type":"uuid","number":21,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"participant_ids","type":"uuid[]","number":22,"default":"''{}''::uuid[]","options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"redacted","type":"boolean","number":23,"default":"false","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""}],"indexes":[{"live":true,"name":"uc_education_issuance_preparat_preparation_id_enrollment_id_key","ready":true,"valid":true,"unique":true,"primary":false,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE UNIQUE INDEX uc_education_issuance_preparat_preparation_id_enrollment_id_key ON public.uc_education_issuance_preparation_items USING btree (preparation_id, enrollment_id)"},{"live":true,"name":"uc_education_issuance_preparation_items_output_document_id_key","ready":true,"valid":true,"unique":true,"primary":false,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE UNIQUE INDEX uc_education_issuance_preparation_items_output_document_id_key ON public.uc_education_issuance_preparation_items USING btree (output_document_id)"},{"live":true,"name":"uc_education_issuance_preparation_items_output_request_id_key","ready":true,"valid":true,"unique":true,"primary":false,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE UNIQUE INDEX uc_education_issuance_preparation_items_output_request_id_key ON public.uc_education_issuance_preparation_items USING btree (output_request_id)"},{"live":true,"name":"uc_education_issuance_preparation_items_pkey","ready":true,"valid":true,"unique":true,"primary":true,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE UNIQUE INDEX uc_education_issuance_preparation_items_pkey ON public.uc_education_issuance_preparation_items USING btree (id)"},{"live":true,"name":"uc_education_preparation_subject","ready":true,"valid":true,"unique":false,"primary":false,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE INDEX uc_education_preparation_subject ON public.uc_education_issuance_preparation_items USING btree (organization_id, user_id, preparation_id)"}],"options":null,"policies":[],"triggers":[],"force_rls":false,"partition":false,"constraints":[{"name":"uc_education_issuance_preparat_preparation_id_enrollment_id_key","type":"u","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":true,"validated":true,"deferrable":false,"definition":"UNIQUE (preparation_id, enrollment_id)","inherit_count":0},{"name":"uc_education_issuance_preparation_items_input_revision_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (input_revision >= 1 AND input_revision <= ''9007199254740991''::bigint)","inherit_count":0},{"name":"uc_education_issuance_preparation_items_output_document_id_key","type":"u","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":true,"validated":true,"deferrable":false,"definition":"UNIQUE (output_document_id)","inherit_count":0},{"name":"uc_education_issuance_preparation_items_output_request_id_key","type":"u","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":true,"validated":true,"deferrable":false,"definition":"UNIQUE (output_request_id)","inherit_count":0},{"name":"uc_education_issuance_preparation_items_pkey","type":"p","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":true,"validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","inherit_count":0},{"name":"uc_education_issuance_preparation_items_render_input_hash_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (render_input_hash ~ ''^[a-f0-9]{64}$''::text)","inherit_count":0}],"persistence":"p","replica_identity":"d","direct_client_privilege":false},{"acl":"{postgres=arwdDxtm/postgres}","rls":true,"kind":"r","name":"uc_education_issuance_preparations","owner":"postgres","columns":[{"acl":null,"name":"id","type":"uuid","number":1,"default":"gen_random_uuid()","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"organization_id","type":"uuid","number":2,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"actor_id","type":"uuid","number":3,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"scope","type":"jsonb","number":4,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"kind","type":"text","number":5,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":"pg_catalog.default","generated":"","compression":""},{"acl":null,"name":"plan","type":"jsonb","number":6,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"intent_hash","type":"text","number":7,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":"pg_catalog.default","generated":"","compression":""},{"acl":null,"name":"template","type":"jsonb","number":8,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"template_storage","type":"jsonb","number":9,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"template_byte_sha256","type":"text","number":10,"default":null,"options":null,"storage":"x","identity":"","not_null":false,"collation":"pg_catalog.default","generated":"","compression":""},{"acl":null,"name":"number_witness","type":"jsonb","number":11,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"participant_ids","type":"uuid[]","number":12,"default":"''{}''::uuid[]","options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"redacted","type":"boolean","number":13,"default":"false","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"created_at","type":"timestamp with time zone","number":14,"default":"clock_timestamp()","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""}],"indexes":[{"live":true,"name":"uc_education_issuance_preparations_pkey","ready":true,"valid":true,"unique":true,"primary":true,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE UNIQUE INDEX uc_education_issuance_preparations_pkey ON public.uc_education_issuance_preparations USING btree (id)"},{"live":true,"name":"uc_education_preparations_creator","ready":true,"valid":true,"unique":false,"primary":false,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE INDEX uc_education_preparations_creator ON public.uc_education_issuance_preparations USING btree (organization_id, actor_id, id)"}],"options":null,"policies":[],"triggers":[],"force_rls":false,"partition":false,"constraints":[{"name":"uc_education_issuance_preparations_intent_hash_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (intent_hash ~ ''^[a-f0-9]{64}$''::text)","inherit_count":0},{"name":"uc_education_issuance_preparations_kind_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (kind = ANY (ARRAY[''original''::text, ''duplicate''::text]))","inherit_count":0},{"name":"uc_education_issuance_preparations_pkey","type":"p","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":true,"validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","inherit_count":0},{"name":"uc_education_issuance_preparations_template_byte_sha256_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (template_byte_sha256 ~ ''^[a-f0-9]{64}$''::text)","inherit_count":0}],"persistence":"p","replica_identity":"d","direct_client_privilege":false},{"acl":"{postgres=arwdDxtm/postgres}","rls":true,"kind":"r","name":"uc_education_issuance_requests","owner":"postgres","columns":[{"acl":null,"name":"actor_id","type":"uuid","number":1,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"request_id","type":"uuid","number":2,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"organization_id","type":"uuid","number":3,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"scope","type":"jsonb","number":4,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"action","type":"text","number":5,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":"pg_catalog.default","generated":"","compression":""},{"acl":null,"name":"payload_hash","type":"text","number":6,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":"pg_catalog.default","generated":"","compression":""},{"acl":null,"name":"receipt","type":"jsonb","number":7,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"participant_ids","type":"uuid[]","number":8,"default":"''{}''::uuid[]","options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""}],"indexes":[{"live":true,"name":"uc_education_issuance_requests_pkey","ready":true,"valid":true,"unique":true,"primary":true,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE UNIQUE INDEX uc_education_issuance_requests_pkey ON public.uc_education_issuance_requests USING btree (actor_id, request_id)"}],"options":null,"policies":[],"triggers":[],"force_rls":false,"partition":false,"constraints":[{"name":"uc_education_issuance_requests_action_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (action = ANY (ARRAY[''issue_batch''::text, ''apply_change''::text, ''withdraw_enrollments''::text, ''prepare_artifacts''::text, ''render_artifact''::text]))","inherit_count":0},{"name":"uc_education_issuance_requests_payload_hash_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (payload_hash ~ ''^[a-f0-9]{64}$''::text)","inherit_count":0},{"name":"uc_education_issuance_requests_pkey","type":"p","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":true,"validated":true,"deferrable":false,"definition":"PRIMARY KEY (actor_id, request_id)","inherit_count":0}],"persistence":"p","replica_identity":"d","direct_client_privilege":false},{"acl":"{postgres=arwdDxtm/postgres}","rls":true,"kind":"r","name":"uc_education_issuance_states","owner":"postgres","columns":[{"acl":null,"name":"record_id","type":"uuid","number":1,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"organization_id","type":"uuid","number":2,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"user_id","type":"uuid","number":3,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"course_id","type":"uuid","number":4,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"enrollment_id","type":"uuid","number":5,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"group_id","type":"uuid","number":6,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"revision","type":"bigint","number":7,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"original_record_id","type":"uuid","number":8,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"registry_record_id","type":"uuid","number":9,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"proof","type":"jsonb","number":10,"default":null,"options":null,"storage":"x","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"artifact","type":"jsonb","number":11,"default":null,"options":null,"storage":"x","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"frdo_facts","type":"jsonb","number":12,"default":null,"options":null,"storage":"x","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"notes","type":"text","number":13,"default":"''''::text","options":null,"storage":"x","identity":"","not_null":true,"collation":"pg_catalog.default","generated":"","compression":""},{"acl":null,"name":"annulment","type":"jsonb","number":14,"default":null,"options":null,"storage":"x","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"latest_handover","type":"jsonb","number":15,"default":null,"options":null,"storage":"x","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"recorded_by","type":"uuid","number":16,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"updated_by","type":"uuid","number":17,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"participant_ids","type":"uuid[]","number":18,"default":"''{}''::uuid[]","options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"redacted","type":"boolean","number":19,"default":"false","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"created_at","type":"timestamp with time zone","number":20,"default":"clock_timestamp()","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"updated_at","type":"timestamp with time zone","number":21,"default":"clock_timestamp()","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""}],"indexes":[{"live":true,"name":"uc_education_issuance_scope","ready":true,"valid":true,"unique":false,"primary":false,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE INDEX uc_education_issuance_scope ON public.uc_education_issuance_states USING btree (organization_id, record_id)"},{"live":true,"name":"uc_education_issuance_states_pkey","ready":true,"valid":true,"unique":true,"primary":true,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE UNIQUE INDEX uc_education_issuance_states_pkey ON public.uc_education_issuance_states USING btree (record_id)"}],"options":null,"policies":[],"triggers":[],"force_rls":false,"partition":false,"constraints":[{"name":"uc_education_issuance_states_notes_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (length(notes) <= 4000)","inherit_count":0},{"name":"uc_education_issuance_states_pkey","type":"p","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":true,"validated":true,"deferrable":false,"definition":"PRIMARY KEY (record_id)","inherit_count":0},{"name":"uc_education_issuance_states_revision_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (revision >= 1 AND revision <= ''9007199254740991''::bigint)","inherit_count":0}],"persistence":"p","replica_identity":"d","direct_client_privilege":false},{"acl":"{postgres=arwdDxtm/postgres}","rls":true,"kind":"r","name":"uc_enrollment_withdrawal_events","owner":"postgres","columns":[{"acl":null,"name":"id","type":"uuid","number":1,"default":"gen_random_uuid()","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"enrollment_id","type":"uuid","number":2,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"organization_id","type":"uuid","number":3,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"user_id","type":"uuid","number":4,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"revision","type":"bigint","number":5,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"actor_id","type":"uuid","number":6,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"reason","type":"text","number":7,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":"pg_catalog.default","generated":"","compression":""},{"acl":null,"name":"effective_date","type":"date","number":8,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"basis","type":"jsonb","number":9,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"before_state","type":"jsonb","number":10,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"after_state","type":"jsonb","number":11,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"participant_ids","type":"uuid[]","number":12,"default":"''{}''::uuid[]","options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"redacted","type":"boolean","number":13,"default":"false","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"recorded_at","type":"timestamp with time zone","number":14,"default":"clock_timestamp()","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""}],"indexes":[{"live":true,"name":"uc_enrollment_withdrawal_events_enrollment_id_revision_key","ready":true,"valid":true,"unique":true,"primary":false,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE UNIQUE INDEX uc_enrollment_withdrawal_events_enrollment_id_revision_key ON public.uc_enrollment_withdrawal_events USING btree (enrollment_id, revision)"},{"live":true,"name":"uc_enrollment_withdrawal_events_pkey","ready":true,"valid":true,"unique":true,"primary":true,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE UNIQUE INDEX uc_enrollment_withdrawal_events_pkey ON public.uc_enrollment_withdrawal_events USING btree (id)"}],"options":null,"policies":[],"triggers":[],"force_rls":false,"partition":false,"constraints":[{"name":"uc_enrollment_withdrawal_events_enrollment_id_revision_key","type":"u","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":true,"validated":true,"deferrable":false,"definition":"UNIQUE (enrollment_id, revision)","inherit_count":0},{"name":"uc_enrollment_withdrawal_events_pkey","type":"p","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":true,"validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","inherit_count":0},{"name":"uc_enrollment_withdrawal_events_reason_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (length(reason) <= 2000)","inherit_count":0},{"name":"uc_enrollment_withdrawal_events_revision_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (revision >= 1 AND revision <= ''9007199254740991''::bigint)","inherit_count":0}],"persistence":"p","replica_identity":"d","direct_client_privilege":false},{"acl":"{postgres=arwdDxtm/postgres}","rls":true,"kind":"r","name":"uc_enrollment_withdrawal_states","owner":"postgres","columns":[{"acl":null,"name":"enrollment_id","type":"uuid","number":1,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"organization_id","type":"uuid","number":2,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"user_id","type":"uuid","number":3,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"course_id","type":"uuid","number":4,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"group_id","type":"uuid","number":5,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"revision","type":"bigint","number":6,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"effective_date","type":"date","number":7,"default":null,"options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"basis","type":"jsonb","number":8,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"technical_snapshot","type":"jsonb","number":9,"default":null,"options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"recorded_by","type":"uuid","number":10,"default":null,"options":null,"storage":"p","identity":"","not_null":false,"collation":null,"generated":"","compression":""},{"acl":null,"name":"participant_ids","type":"uuid[]","number":11,"default":"''{}''::uuid[]","options":null,"storage":"x","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"redacted","type":"boolean","number":12,"default":"false","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""},{"acl":null,"name":"recorded_at","type":"timestamp with time zone","number":13,"default":"clock_timestamp()","options":null,"storage":"p","identity":"","not_null":true,"collation":null,"generated":"","compression":""}],"indexes":[{"live":true,"name":"uc_enrollment_withdrawal_scope","ready":true,"valid":true,"unique":false,"primary":false,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE INDEX uc_enrollment_withdrawal_scope ON public.uc_enrollment_withdrawal_states USING btree (organization_id, enrollment_id)"},{"live":true,"name":"uc_enrollment_withdrawal_states_pkey","ready":true,"valid":true,"unique":true,"primary":true,"clustered":false,"exclusion":false,"immediate":true,"replident":false,"definition":"CREATE UNIQUE INDEX uc_enrollment_withdrawal_states_pkey ON public.uc_enrollment_withdrawal_states USING btree (enrollment_id)"}],"options":null,"policies":[],"triggers":[],"force_rls":false,"partition":false,"constraints":[{"name":"uc_enrollment_withdrawal_states_pkey","type":"p","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":true,"validated":true,"deferrable":false,"definition":"PRIMARY KEY (enrollment_id)","inherit_count":0},{"name":"uc_enrollment_withdrawal_states_revision_check","type":"c","local":true,"match":" ","delete":" ","update":" ","deferred":false,"noinherit":false,"validated":true,"deferrable":false,"definition":"CHECK (revision >= 1 AND revision <= ''9007199254740991''::bigint)","inherit_count":0}],"persistence":"p","replica_identity":"d","direct_client_privilege":false}],"functions":[{"portable":{"acl":"{postgres=X/postgres,authenticated=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC","lock_timeout=2000ms"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_organization_id","p_scope","p_request_id","p_action"],"full_args":"p_organization_id uuid, p_scope jsonb, p_request_id uuid, p_action jsonb","leakproof":false,"volatility":"v","identity_args":"p_organization_id uuid, p_scope jsonb, p_request_id uuid, p_action jsonb","set_returning":false,"security_definer":true},"signature":"public.apply_education_issuance_action(uuid,jsonb,uuid,jsonb)","source_md5":"6f9628ea2bea741ac1bf68dd79809679"},{"portable":{"acl":"{postgres=X/postgres,authenticated=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC","lock_timeout=2000ms"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_organization_id","p_scope","p_request_id","p_plan"],"full_args":"p_organization_id uuid, p_scope jsonb, p_request_id uuid, p_plan jsonb","leakproof":false,"volatility":"v","identity_args":"p_organization_id uuid, p_scope jsonb, p_request_id uuid, p_plan jsonb","set_returning":false,"security_definer":true},"signature":"public.prepare_education_issuance_artifacts(uuid,jsonb,uuid,jsonb)","source_md5":"fbe617ffc636d572248b13b1185a98a6"},{"portable":{"acl":"{postgres=X/postgres,authenticated=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC","lock_timeout=2000ms"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_organization_id","p_scope","p_query"],"full_args":"p_organization_id uuid, p_scope jsonb, p_query jsonb","leakproof":false,"volatility":"v","identity_args":"p_organization_id uuid, p_scope jsonb, p_query jsonb","set_returning":false,"security_definer":true},"signature":"public.read_education_issuance(uuid,jsonb,jsonb)","source_md5":"f03cf43f952e0d1191943f4c9b2c8808"},{"portable":{"acl":"{postgres=X/postgres,service_role=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public, storage","lock_timeout=2000ms"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_actor_id","p_organization_id","p_preparation_id","p_item_id","p_input_revision","p_request_id","p_proof"],"full_args":"p_actor_id uuid, p_organization_id uuid, p_preparation_id uuid, p_item_id uuid, p_input_revision bigint, p_request_id uuid, p_proof jsonb","leakproof":false,"volatility":"v","identity_args":"p_actor_id uuid, p_organization_id uuid, p_preparation_id uuid, p_item_id uuid, p_input_revision bigint, p_request_id uuid, p_proof jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_attest_education_issuance_artifact(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)","source_md5":"39932eebba2cf6bce9d69a784f7f2274"},{"portable":{"acl":"{postgres=X/postgres,service_role=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public, storage","lock_timeout=2000ms"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_actor_id","p_organization_id","p_preparation_id","p_item_id","p_input_revision","p_request_id","p_proof"],"full_args":"p_actor_id uuid, p_organization_id uuid, p_preparation_id uuid, p_item_id uuid, p_input_revision bigint, p_request_id uuid, p_proof jsonb","leakproof":false,"volatility":"v","identity_args":"p_actor_id uuid, p_organization_id uuid, p_preparation_id uuid, p_item_id uuid, p_input_revision bigint, p_request_id uuid, p_proof jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_attest_education_issuance_staging(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)","source_md5":"5ab740788a1661a29a933b64db944fc2"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_json","p_user","p_redact"],"full_args":"p_json jsonb, p_user uuid, p_redact boolean DEFAULT false","leakproof":false,"volatility":"i","identity_args":"p_json jsonb, p_user uuid, p_redact boolean","set_returning":false,"security_definer":false},"signature":"public.uc_education_actor_json(jsonb,uuid,boolean)","source_md5":"d7f8a489ec930dcfd4394d09bbbf3b53"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"boolean","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_actor","p_org","p_permission"],"full_args":"p_actor uuid, p_org uuid, p_permission text","leakproof":false,"volatility":"s","identity_args":"p_actor uuid, p_org uuid, p_permission text","set_returning":false,"security_definer":true},"signature":"public.uc_education_actor_org_permission(uuid,uuid,text)","source_md5":"3b00f8587eb56ae9a609ffc73d07051b"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_case"],"full_args":"p_case uuid","leakproof":false,"volatility":"s","identity_args":"p_case uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_admission_conditions(uuid)","source_md5":"85e562d9f9eb95d8f287fe8dd5433f03"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"boolean","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_definition","p_program_type"],"full_args":"p_definition jsonb, p_program_type text","leakproof":false,"volatility":"i","identity_args":"p_definition jsonb, p_program_type text","set_returning":false,"security_definer":false},"signature":"public.uc_education_admission_definition_shape(jsonb,text)","source_md5":"9ba16edd72656700aedc7b88437a1359"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"text","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_requirements","p_rule","p_program","p_reviews"],"full_args":"p_requirements jsonb, p_rule uuid, p_program jsonb, p_reviews jsonb","leakproof":false,"volatility":"i","identity_args":"p_requirements jsonb, p_rule uuid, p_program jsonb, p_reviews jsonb","set_returning":false,"security_definer":false},"signature":"public.uc_education_admission_digest(jsonb,uuid,jsonb,jsonb)","source_md5":"7e5af9f300d8300491d53fc4455b2a7a"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"boolean","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_evidence"],"full_args":"p_evidence jsonb","leakproof":false,"volatility":"i","identity_args":"p_evidence jsonb","set_returning":false,"security_definer":false},"signature":"public.uc_education_admission_evidence_shape(jsonb)","source_md5":"29176d10a12b5c396f768f835fe23b4d"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"void","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_case","p_requirement","p_evidence","p_selected"],"full_args":"p_case uuid, p_requirement uuid, p_evidence jsonb, p_selected jsonb","leakproof":false,"volatility":"s","identity_args":"p_case uuid, p_requirement uuid, p_evidence jsonb, p_selected jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_admission_review_check(uuid,uuid,jsonb,jsonb)","source_md5":"1cff9c0af0c7ef6f9d6440735f6185c0"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_case"],"full_args":"p_case uuid","leakproof":false,"volatility":"s","identity_args":"p_case uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_admission_reviews(uuid)","source_md5":"0552d3ee6f36d26f92af68a0c7550c00"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"boolean","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_actor","p_org","p_group","p_user","p_enrollment"],"full_args":"p_actor uuid, p_org uuid, p_group uuid, p_user uuid, p_enrollment uuid","leakproof":false,"volatility":"s","identity_args":"p_actor uuid, p_org uuid, p_group uuid, p_user uuid, p_enrollment uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_artifact_actor(uuid,uuid,uuid,uuid,uuid)","source_md5":"fc4226c1d46d54099d2853ef46e8faf7"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"boolean","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_proof","p_stage"],"full_args":"p_proof jsonb, p_stage boolean","leakproof":false,"volatility":"i","identity_args":"p_proof jsonb, p_stage boolean","set_returning":false,"security_definer":false},"signature":"public.uc_education_artifact_attest_shape(jsonb,boolean)","source_md5":"6332a42a07e8b541bf51dfd92cb042b8"},{"portable":{"acl":"{postgres=X/postgres,authenticated=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","lock_timeout=2000ms"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_organization_id","p_preparation_id","p_item_id","p_input_revision","p_request_id"],"full_args":"p_organization_id uuid, p_preparation_id uuid, p_item_id uuid, p_input_revision bigint, p_request_id uuid","leakproof":false,"volatility":"v","identity_args":"p_organization_id uuid, p_preparation_id uuid, p_item_id uuid, p_input_revision bigint, p_request_id uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_artifact_context(uuid,uuid,uuid,bigint,uuid)","source_md5":"ddc0278814424d95d2ed1518d02a077c"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_actor","p_preparation","p_item","p_revision","p_request"],"full_args":"p_actor uuid, p_preparation uuid, p_item uuid, p_revision bigint, p_request uuid","leakproof":false,"volatility":"v","identity_args":"p_actor uuid, p_preparation uuid, p_item uuid, p_revision bigint, p_request uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_artifact_context_json(uuid,uuid,uuid,bigint,uuid)","source_md5":"aace7284c5c74a799a43de915788782c"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"uc_education_issuance_preparation_items","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_group","p_ref"],"full_args":"p_org uuid, p_group uuid, p_ref jsonb","leakproof":false,"volatility":"v","identity_args":"p_org uuid, p_group uuid, p_ref jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_artifact_final(uuid,uuid,jsonb)","source_md5":"6e9b5ffcdebd7bed25d78d4041067b56"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"uc_education_issuance_preparation_items","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_actor","p_preparation","p_item","p_revision","p_fresh"],"full_args":"p_actor uuid, p_preparation uuid, p_item uuid, p_revision bigint, p_fresh boolean DEFAULT true","leakproof":false,"volatility":"v","identity_args":"p_actor uuid, p_preparation uuid, p_item uuid, p_revision bigint, p_fresh boolean","set_returning":false,"security_definer":true},"signature":"public.uc_education_artifact_live(uuid,uuid,uuid,bigint,boolean)","source_md5":"8676afb303a386c3471b387352c25cc9"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public, storage"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_item"],"full_args":"p_item uuid","leakproof":false,"volatility":"s","identity_args":"p_item uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_artifact_saved_source(uuid)","source_md5":"16cae234ac4139cf6efef626fad9a2cf"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"uc_education_issuance_preparation_items","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_actor","p_org","p_preparation","p_item","p_revision","p_request"],"full_args":"p_actor uuid, p_org uuid, p_preparation uuid, p_item uuid, p_revision bigint, p_request uuid","leakproof":false,"volatility":"v","identity_args":"p_actor uuid, p_org uuid, p_preparation uuid, p_item uuid, p_revision bigint, p_request uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_artifact_service_request(uuid,uuid,uuid,uuid,bigint,uuid)","source_md5":"29821b36db08621ece25d6d8e7df7736"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"trigger","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":null,"full_args":"","leakproof":false,"volatility":"v","identity_args":"","set_returning":false,"security_definer":true},"signature":"public.uc_education_canonical_boundary()","source_md5":"acd5ceb5a484fe347bfd372717166c5e"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_group","p_change","p_preview_hash"],"full_args":"p_org uuid, p_group uuid, p_change jsonb, p_preview_hash text","leakproof":false,"volatility":"v","identity_args":"p_org uuid, p_group uuid, p_change jsonb, p_preview_hash text","set_returning":false,"security_definer":true},"signature":"public.uc_education_change_apply(uuid,uuid,jsonb,text)","source_md5":"a5b1716d09fa3f4d2ab0d2c435ede1c8"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_group","p_change"],"full_args":"p_org uuid, p_group uuid, p_change jsonb","leakproof":false,"volatility":"v","identity_args":"p_org uuid, p_group uuid, p_change jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_change_preview(uuid,uuid,jsonb)","source_md5":"94c822cc3b4786763dc4558ac498ee88"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public, storage"],"result":"void","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_user"],"full_args":"p_user uuid","leakproof":false,"volatility":"v","identity_args":"p_user uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_erase_user(uuid)","source_md5":"b638a8d2661637357e49efc223ea926d"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_user","p_facts","p_numbers","p_document_type","p_original","p_correct"],"full_args":"p_org uuid, p_user uuid, p_facts jsonb, p_numbers jsonb, p_document_type text, p_original jsonb DEFAULT NULL::jsonb, p_correct boolean DEFAULT false","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_user uuid, p_facts jsonb, p_numbers jsonb, p_document_type text, p_original jsonb, p_correct boolean","set_returning":false,"security_definer":true},"signature":"public.uc_education_frdo_snapshot(uuid,uuid,jsonb,jsonb,text,jsonb,boolean)","source_md5":"c0b0c5b2ef9f829f8c8df58dd94db7be"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"void","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_record","p_handover"],"full_args":"p_org uuid, p_record uuid, p_handover jsonb","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_record uuid, p_handover jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_handover_check(uuid,uuid,jsonb)","source_md5":"b8c73109a92c5b6dae925f54d9b3f094"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog"],"result":"text","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p"],"full_args":"p text","leakproof":false,"volatility":"i","identity_args":"p text","set_returning":false,"security_definer":false},"signature":"public.uc_education_html(text)","source_md5":"638a30a5d5af552186d016af1e0c714b"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"boolean","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":null,"full_args":"","leakproof":false,"volatility":"s","identity_args":"","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_actor()","source_md5":"b875d94eb9a2b8b3887878f10a28f1d7"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_group","p_enrollment","p_program","p_program_type"],"full_args":"p_org uuid, p_group uuid, p_enrollment uuid, p_program jsonb, p_program_type text","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_group uuid, p_enrollment uuid, p_program jsonb, p_program_type text","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_admission(uuid,uuid,uuid,jsonb,text)","source_md5":"64d25d09dc9db74df8299f21a64d0b06"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_artifact","p_legacy"],"full_args":"p_org uuid, p_artifact jsonb, p_legacy boolean","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_artifact jsonb, p_legacy boolean","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_artifact_projection(uuid,jsonb,boolean)","source_md5":"e178ee114fd30d691d418a08b6bfbeef"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_org","p_basis"],"full_args":"p_org uuid, p_basis jsonb","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_basis jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_basis_projection(uuid,jsonb)","source_md5":"ec43ba1a7e016275a20674be332b23df"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog"],"result":"jsonb","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_code"],"full_args":"p_code text","leakproof":false,"volatility":"i","identity_args":"p_code text","set_returning":false,"security_definer":false},"signature":"public.uc_education_issue_block(text)","source_md5":"4df8eec4813da2cacf5752f3ced9fbd1"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"boolean","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_org","p_group","p_enrollment","p_user","p_course","p_action"],"full_args":"p_org uuid, p_group uuid, p_enrollment uuid, p_user uuid, p_course uuid, p_action text","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_group uuid, p_enrollment uuid, p_user uuid, p_course uuid, p_action text","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_can(uuid,uuid,uuid,uuid,uuid,text)","source_md5":"2e4d0bdd84db01522b2eedbf8b1ff19f"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_scope_group","p_enrollment","p_lock"],"full_args":"p_org uuid, p_scope_group uuid, p_enrollment uuid, p_lock boolean DEFAULT false","leakproof":false,"volatility":"v","identity_args":"p_org uuid, p_scope_group uuid, p_enrollment uuid, p_lock boolean","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_candidate(uuid,uuid,uuid,boolean)","source_md5":"7879fa190e882172e5f69708fca206cd"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_org","p_group","p_enrollment","p_user","p_course"],"full_args":"p_org uuid, p_group uuid, p_enrollment uuid DEFAULT NULL::uuid, p_user uuid DEFAULT NULL::uuid, p_course uuid DEFAULT NULL::uuid","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_group uuid, p_enrollment uuid, p_user uuid, p_course uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_caps(uuid,uuid,uuid,uuid,uuid)","source_md5":"76ddcfac4d7de4bb5d5278a3e759521f"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"void","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_enrollment","p_exclusive"],"full_args":"p_enrollment uuid, p_exclusive boolean DEFAULT false","leakproof":false,"volatility":"v","identity_args":"p_enrollment uuid, p_exclusive boolean","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_enrollment_fence(uuid,boolean)","source_md5":"f20dbd34624126bf56c5e85e60145199"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog"],"result":"void","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_code"],"full_args":"p_code text","leakproof":false,"volatility":"v","identity_args":"p_code text","set_returning":false,"security_definer":false},"signature":"public.uc_education_issue_error(text)","source_md5":"da7723938ae60c3a14d2290bd0633719"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_event"],"full_args":"p_event uuid","leakproof":false,"volatility":"s","identity_args":"p_event uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_event(uuid)","source_md5":"4757cf7d5e28324179dcd2642ea3e384"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_scope","p_selection"],"full_args":"p_org uuid, p_scope jsonb, p_selection jsonb","leakproof":false,"volatility":"v","identity_args":"p_org uuid, p_scope jsonb, p_selection jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_export(uuid,jsonb,jsonb)","source_md5":"a08c3588e0d19f673e1faa32c4550e70"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"void","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_group","p_people","p_key"],"full_args":"p_org uuid, p_group uuid, p_people uuid[], p_key text DEFAULT NULL::text","leakproof":false,"volatility":"v","identity_args":"p_org uuid, p_group uuid, p_people uuid[], p_key text","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_fence(uuid,uuid,uuid[],text)","source_md5":"cecccf8091969662a8ea856e5d981cf9"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_handover"],"full_args":"p_org uuid, p_handover jsonb","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_handover jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_handover_projection(uuid,jsonb)","source_md5":"9a4d60109abd36ad9332b4490313040e"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_item","p_artifact","p_reason"],"full_args":"p_item uuid, p_artifact jsonb, p_reason text","leakproof":false,"volatility":"v","identity_args":"p_item uuid, p_artifact jsonb, p_reason text","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_one(uuid,jsonb,text)","source_md5":"5ded5548b6acc55a49785d1fa5b3ac47"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_group","p_intent","p_lock"],"full_args":"p_org uuid, p_group uuid, p_intent jsonb, p_lock boolean DEFAULT false","leakproof":false,"volatility":"v","identity_args":"p_org uuid, p_group uuid, p_intent jsonb, p_lock boolean","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_preview(uuid,uuid,jsonb,boolean)","source_md5":"8705b7045c7902128255707199ef9aa1"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"boolean","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_proof"],"full_args":"p_proof jsonb","leakproof":false,"volatility":"s","identity_args":"p_proof jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_proof_visible(jsonb)","source_md5":"da9c61b4a9970471760df97dd0bd7791"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_scope_group","p_record"],"full_args":"p_org uuid, p_scope_group uuid, p_record uuid","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_scope_group uuid, p_record uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_record(uuid,uuid,uuid)","source_md5":"2f84909e7a396ecfc4ddccac1232cd78"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"uuid","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_scope"],"full_args":"p_org uuid, p_scope jsonb","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_scope jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_scope(uuid,jsonb)","source_md5":"c2013a1044c89701e9db6537a5f3c896"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_source","p_required"],"full_args":"p_org uuid, p_source jsonb, p_required boolean DEFAULT true","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_source jsonb, p_required boolean","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_source(uuid,jsonb,boolean)","source_md5":"499f0a410d6184b2eaecb8126bf29d7b"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"void","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_source"],"full_args":"p_org uuid, p_source jsonb","leakproof":false,"volatility":"v","identity_args":"p_org uuid, p_source jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_source_lock(uuid,jsonb)","source_md5":"00fe9b178b294f0bd5e64d70e3af9537"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_org","p_source"],"full_args":"p_org uuid, p_source jsonb","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_source jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_source_projection(uuid,jsonb)","source_md5":"9f11c79a82981cadcdd0ff08eb3bc7d4"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"text","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_record"],"full_args":"p_record uuid","leakproof":false,"volatility":"s","identity_args":"p_record uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_issue_state_hash(uuid)","source_md5":"d162b5869bfdf01efd3d8d7bd9008d8c"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_scope","p_receipt","p_replayed"],"full_args":"p_org uuid, p_scope jsonb, p_receipt jsonb, p_replayed boolean","leakproof":false,"volatility":"v","identity_args":"p_org uuid, p_scope jsonb, p_receipt jsonb, p_replayed boolean","set_returning":false,"security_definer":true},"signature":"public.uc_education_mutation_result(uuid,jsonb,jsonb,boolean)","source_md5":"c6ae3805bbeb6a2baa1c5282fc0d37c6"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_org","p_date"],"full_args":"p_org uuid, p_date date","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_date date","set_returning":false,"security_definer":true},"signature":"public.uc_education_number_witness(uuid,date)","source_md5":"4ee1b6ed2c57cf4b54a1610e22d49e3f"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_item"],"full_args":"p_item uuid","leakproof":false,"volatility":"s","identity_args":"p_item uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_output_approval(uuid)","source_md5":"616a3a5debe65842c5fdf8e6d34e755a"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"void","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_document","p_org","p_request","p_expected","p_upload","p_restore","p_document_data"],"full_args":"p_document uuid, p_org uuid, p_request uuid, p_expected bigint, p_upload jsonb, p_restore uuid, p_document_data jsonb","leakproof":false,"volatility":"v","identity_args":"p_document uuid, p_org uuid, p_request uuid, p_expected bigint, p_upload jsonb, p_restore uuid, p_document_data jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_output_slot(uuid,uuid,uuid,bigint,jsonb,uuid,jsonb)","source_md5":"50c74d24e723f49464cfcc09ca9891c5"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public, storage"],"result":"trigger","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":null,"full_args":"","leakproof":false,"volatility":"v","identity_args":"","set_returning":false,"security_definer":true},"signature":"public.uc_education_output_storage_guard()","source_md5":"9bea20917d0fb5aa3cf33ca0b4bfcd3b"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_user"],"full_args":"p_user uuid","leakproof":false,"volatility":"s","identity_args":"p_user uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_personal_counts(uuid)","source_md5":"f9f3714b1a4f68352dafe5ff4c9a9241"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"uc_education_issuance_preparations","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_preparation","p_fresh","p_item"],"full_args":"p_preparation uuid, p_fresh boolean DEFAULT false, p_item uuid DEFAULT NULL::uuid","leakproof":false,"volatility":"v","identity_args":"p_preparation uuid, p_fresh boolean, p_item uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_preparation_access(uuid,boolean,uuid)","source_md5":"f1c6860d9c167200f8a61206820d7d63"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_item"],"full_args":"p_item uuid","leakproof":false,"volatility":"s","identity_args":"p_item uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_preparation_item_json(uuid)","source_md5":"ee1817af47da0c25ccfa4be46d1c561b"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_preparation"],"full_args":"p_preparation uuid","leakproof":false,"volatility":"v","identity_args":"p_preparation uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_preparation_json(uuid)","source_md5":"e0e4a277ac400559dc1a958e8c213b16"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_witness","p_index","p_date","p_series"],"full_args":"p_witness jsonb, p_index integer, p_date date, p_series text","leakproof":false,"volatility":"i","identity_args":"p_witness jsonb, p_index integer, p_date date, p_series text","set_returning":false,"security_definer":false},"signature":"public.uc_education_prospective_numbers(jsonb,integer,date,text)","source_md5":"4315eaa3dd92ab14067339d668af72b0"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_identity","p_facts","p_numbers","p_proof","p_document_type"],"full_args":"p_org uuid, p_identity jsonb, p_facts jsonb, p_numbers jsonb, p_proof jsonb, p_document_type text","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_identity jsonb, p_facts jsonb, p_numbers jsonb, p_proof jsonb, p_document_type text","set_returning":false,"security_definer":true},"signature":"public.uc_education_render_variables(uuid,jsonb,jsonb,jsonb,jsonb,text)","source_md5":"b016e6cface8ba34d30fb02628cb390a"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_record","p_correct"],"full_args":"p_record uuid, p_correct boolean","leakproof":false,"volatility":"s","identity_args":"p_record uuid, p_correct boolean","set_returning":false,"security_definer":true},"signature":"public.uc_education_replacement_identity(uuid,boolean)","source_md5":"cdb2fa58228f32f8c95dddc21c8078bf"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_query"],"full_args":"p_org uuid, p_query jsonb","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_query jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_retained_learning_summary(uuid,jsonb)","source_md5":"ccd9961300c9ae7038af18934d2b6b23"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public, storage"],"result":"jsonb","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_user"],"full_args":"p_user uuid","leakproof":false,"volatility":"s","identity_args":"p_user uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_saved_output_counts(uuid)","source_md5":"28eb5534310944fca6ef06c1b42869c3"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public, storage"],"result":"trigger","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":null,"full_args":"","leakproof":false,"volatility":"v","identity_args":"","set_returning":false,"security_definer":true},"signature":"public.uc_education_staging_storage_guard()","source_md5":"8de79d18585969871be55cd96be3e706"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_template","p_lock"],"full_args":"p_org uuid, p_template jsonb, p_lock boolean DEFAULT false","leakproof":false,"volatility":"v","identity_args":"p_org uuid, p_template jsonb, p_lock boolean","set_returning":false,"security_definer":true},"signature":"public.uc_education_template(uuid,jsonb,boolean)","source_md5":"17ae6b0243754479b21ddffee8b82ce8"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public, storage"],"result":"boolean","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_org","p_template","p_storage"],"full_args":"p_org uuid, p_template jsonb, p_storage jsonb","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_template jsonb, p_storage jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_template_current(uuid,jsonb,jsonb)","source_md5":"46ac4a0cc8acd45cdd405e0941048391"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"boolean","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_user"],"full_args":"p_user uuid","leakproof":false,"volatility":"s","identity_args":"p_user uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_trusted_erasure(uuid)","source_md5":"bca9d0e2a77f29d5e717affb2d515af7"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_group","p_intent","p_preview_hash","p_refs","p_reason"],"full_args":"p_org uuid, p_group uuid, p_intent jsonb, p_preview_hash text, p_refs jsonb, p_reason text","leakproof":false,"volatility":"v","identity_args":"p_org uuid, p_group uuid, p_intent jsonb, p_preview_hash text, p_refs jsonb, p_reason text","set_returning":false,"security_definer":true},"signature":"public.uc_education_withdraw_apply(uuid,uuid,jsonb,text,jsonb,text)","source_md5":"f484bddcdee91f32818bc51e04438588"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"boolean","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_org","p_group","p_enrollment","p_write"],"full_args":"p_org uuid, p_group uuid, p_enrollment uuid, p_write boolean DEFAULT false","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_group uuid, p_enrollment uuid, p_write boolean","set_returning":false,"security_definer":true},"signature":"public.uc_education_withdraw_can(uuid,uuid,uuid,boolean)","source_md5":"20de052965767e76af967d8580eb9441"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_event"],"full_args":"p_event uuid","leakproof":false,"volatility":"s","identity_args":"p_event uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_withdraw_event(uuid)","source_md5":"0d8835e6dec342b7affb9a55e12677e0"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_group","p_intent"],"full_args":"p_org uuid, p_group uuid, p_intent jsonb","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_group uuid, p_intent jsonb","set_returning":false,"security_definer":true},"signature":"public.uc_education_withdraw_intent(uuid,uuid,jsonb)","source_md5":"0565b8918b8799be72c4487ae90a260a"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public","TimeZone=UTC"],"result":"jsonb","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":["p_org","p_group","p_enrollment"],"full_args":"p_org uuid, p_group uuid, p_enrollment uuid","leakproof":false,"volatility":"s","identity_args":"p_org uuid, p_group uuid, p_enrollment uuid","set_returning":false,"security_definer":true},"signature":"public.uc_education_withdraw_state(uuid,uuid,uuid)","source_md5":"86459790c2c706e1fa626c7cda7677ef"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"boolean","schema":"public","strict":false,"language":"sql","parallel":"u","arg_names":["p_enrollment"],"full_args":"p_enrollment uuid","leakproof":false,"volatility":"s","identity_args":"p_enrollment uuid","set_returning":false,"security_definer":true},"signature":"public.uc_enrollment_is_withdrawn(uuid)","source_md5":"90ce19257149ae1d77a87b59531c7609"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"trigger","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":null,"full_args":"","leakproof":false,"volatility":"v","identity_args":"","set_returning":false,"security_definer":true},"signature":"public.uc_guard_retained_enrollment()","source_md5":"00ed27541ac0f6dbc7e129ef5fe98d62"},{"portable":{"acl":"{postgres=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","config":["search_path=pg_catalog, public"],"result":"trigger","schema":"public","strict":false,"language":"plpgsql","parallel":"u","arg_names":null,"full_args":"","leakproof":false,"volatility":"v","identity_args":"","set_returning":false,"security_definer":true},"signature":"public.uc_guard_retained_learner_activity()","source_md5":"79001411cedf06b2b343a383811edf18"}],"new_bucket":{"id":"education-issuance-staging","name":"education-issuance-staging","public":false,"file_size_limit":20971520,"allowed_mime_types":["application/pdf"]},"storage_policy":{"cmd":"ALL","qual":"(bucket_id <> ''education-issuance-staging''::text)","roles":["anon","authenticated"],"tablename":"objects","permissive":"RESTRICTIVE","policyname":"uc_education_staging_private_boundary","schemaname":"storage","with_check":"(bucket_id <> ''education-issuance-staging''::text)"},"delivery_constraint":{"name":"education_document_records_delivery_method_check","validated":true,"definition":"CHECK (delivery_method = ANY (ARRAY[''personal''::text, ''representative''::text, ''postal''::text, ''not_recorded''::text]))"},"new_old_table_guards":[{"args":"","name":"uc_retained_activity_write","type":31,"table":"ai_tutor_sessions","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR DELETE OR UPDATE ON ai_tutor_sessions FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_learner_activity()"},{"args":"","name":"uc_retained_activity_write","type":31,"table":"course_access_log","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR DELETE OR UPDATE ON course_access_log FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_learner_activity()"},{"args":"","name":"uc_retained_activity_write","type":31,"table":"course_manual_credits","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR DELETE OR UPDATE ON course_manual_credits FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_learner_activity()"},{"args":"","name":"uc_education_issuance_guard","type":31,"table":"education_document_records","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_education_issuance_guard BEFORE INSERT OR DELETE OR UPDATE ON education_document_records FOR EACH ROW EXECUTE FUNCTION uc_education_canonical_boundary()"},{"args":"","name":"uc_retained_enrollment_write","type":19,"table":"enrollments","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_enrollment_write BEFORE UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_enrollment()"},{"args":"","name":"uc_retained_activity_write","type":31,"table":"homework_submissions","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR DELETE OR UPDATE ON homework_submissions FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_learner_activity()"},{"args":"","name":"uc_retained_activity_write","type":31,"table":"lesson_progress","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR DELETE OR UPDATE ON lesson_progress FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_learner_activity()"},{"args":"","name":"uc_retained_activity_write","type":31,"table":"test_attempt_sessions","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR DELETE OR UPDATE ON test_attempt_sessions FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_learner_activity()"},{"args":"","name":"uc_retained_activity_write","type":31,"table":"test_attempts","schema":"public","enabled":"O","definition":"CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR DELETE OR UPDATE ON test_attempts FOR EACH ROW EXECUTE FUNCTION uc_guard_retained_learner_activity()"},{"args":"","name":"uc_education_staging_object_boundary","type":31,"table":"objects","schema":"storage","enabled":"O","definition":"CREATE TRIGGER uc_education_staging_object_boundary BEFORE INSERT OR DELETE OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION uc_education_staging_storage_guard()"},{"args":"","name":"zz_uc_education_output_object_boundary","type":23,"table":"objects","schema":"storage","enabled":"O","definition":"CREATE TRIGGER zz_uc_education_output_object_boundary BEFORE INSERT OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION uc_education_output_storage_guard()"}]},"portableCatalogSQLSHA256":"d95927b285b93d445cd2a5feb42bd3919d69ba4b0f5c28ecce8f685a1598188b","nativeMainResult":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/pg-lab-uc013-20261019/results/uc-full-cycle-native-linux-20261022T190817Z-607ac594/result.json","bytes":5882,"sha256":"91652cbb71b4399c6f7dbd121e53a9ad2752777c93cbbc63e43bfdd5c6ba7d3d"},"nativeCatalog":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/pg-lab-uc013-20261019/results/uc-full-cycle-native-linux-20261022T195703Z-0c0ecf87/uc019-post-append-native-metadata.json","bytes":319989,"sha256":"640290622a58401fa96ab2540298a21d4a6fc975d2525da549aafbf8b86a4d7d"},"actualPreflight":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/uc019-issuance-lifecycle-evidence-20261022/ACTUAL621_PRE622_GUARD_PREFLIGHT.json","bytes":2678,"sha256":"d370f51e4ca914d8de979925df19a07cd535b92cd0085cdc2a2e99fbe9c9bb9f"},"releaseLimits":["Separate PO01 and COR01 still required before generalrelease","No actual Browserless or StorageHTTP claim from synthetic native bytes","Native privacy proofs distinguish genuine plan blockers and bounded privatecomponent; not fullaccount erasure","Every production oldrow/metadata/ACL/roles/ledger capture must be read inside one atomic transaction, all preexisting rows preserved except explicit new bucket append"],"engines":0,"productionWrites":0,"nativeValidationProvenance":{"mainNine":{"raw":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/uc019-issuance-lifecycle-evidence-20261022/backend-source-j/20261023010000_uc_education_issuance_lifecycle.sql","bytes":297334,"sha256":"95e10a5b52f8bc2d300751292bd9fad6ebe6b7f1d94120af7d5815b7092dc13c"},"manifest":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/uc019-issuance-native-v21-20261023/profile/linux-full-cycle-manifest.json","bytes":602971,"sha256":"d5df0703a97dde2a72c258b02e129cf31e954c319cde30613344709c23d3bdd0"},"result":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/pg-lab-uc013-20261019/results/uc-full-cycle-native-linux-20261022T190817Z-607ac594/result.json","bytes":5882,"sha256":"91652cbb71b4399c6f7dbd121e53a9ad2752777c93cbbc63e43bfdd5c6ba7d3d"},"cases":9,"mandatoryChecks":23,"actualStatus":"PASS"},"professionalTraining":{"raw":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/uc019-issuance-lifecycle-evidence-20261022/backend-source-j/20261023010000_uc_education_issuance_lifecycle.sql","bytes":297334,"sha256":"95e10a5b52f8bc2d300751292bd9fad6ebe6b7f1d94120af7d5815b7092dc13c"},"manifest":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/uc019-po-correction-native-v4-20261023/profile/linux-full-cycle-manifest.json","bytes":616095,"sha256":"e762e39bf1e42bbb4fbe610351bcffe8ba5b3d5eb0027a1218cbac0038580e32"},"result":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/pg-lab-uc013-20261019/results/uc-full-cycle-native-linux-20261022T194315Z-eb726a50/result.json","bytes":2133,"sha256":"7e3b8b3fd04e867b48e5a3079f9ace94110965b13a98161f1ba409c718cc241c"},"caseEvidence":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/pg-lab-uc013-20261019/results/uc-full-cycle-native-linux-20261022T194315Z-eb726a50/education-issuance-supplemental-cases.json","bytes":87555,"sha256":"9cc2d2776380ac3db31b20174911e0df18b98e6fa61992ab24a037b0f56cae92"},"acceptedCaseID":"PO01","acceptedCaseStatus":"PASS","overallSuiteStatusRemains":"FAIL","failedCaseID":"COR01","failureWasStrictMessageExpectationAtEarlierCAS":true},"correctionAndExactProviderACL":{"raw":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/uc019-issuance-lifecycle-evidence-20261022/backend-source-k/20261023010000_uc_education_issuance_lifecycle.sql","bytes":302641,"sha256":"73a44f8fb32c51682962c02211f24439e574132e06cb9f325e2407082fc48bc6"},"manifest":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/uc019-correction-native-v5-20261023/profile/linux-full-cycle-manifest.json","bytes":628112,"sha256":"9301dcc2fb34db63ec0b292d939b570b80e88a9c08acc75504b330f60901b77e"},"result":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/pg-lab-uc013-20261019/results/uc-full-cycle-native-linux-20261022T195703Z-0c0ecf87/result.json","bytes":5485,"sha256":"07b3410fe3457772d3b000afc3cd3d9844a2961372e6d35828ede0035130b87a"},"caseEvidence":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/pg-lab-uc013-20261019/results/uc-full-cycle-native-linux-20261022T195703Z-0c0ecf87/education-issuance-supplemental-cases.json","bytes":53935,"sha256":"9534bec10fb34ba18c9fff793816187a6456c9c3b283d2754763047b41e03402"},"actualStatus":"PASS","cases":1,"caseID":"COR01","mandatoryChecks":15,"actualDefaultSource":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/uc019-correction-native-v5-20261023/suite/uc019-provider-default-acl-actual621.json","bytes":1622,"sha256":"3f7e74a4f506451b4af7590f6e47c37699bc93d0e9090ea4f0f7d138288ebc92"},"all100FunctionBodiesUnchangedJ":true,"noProviderLoginMembershipParityClaim":true},"allPriorFAILsRetained":true,"noSingleElevenCaseRunClaim":true,"noProductionOrRealRendererAcceptanceClaim":true},"providerDefaultACLFix":{"roles":["sandbox_exec_atxwvjxbqjgkbjlhsdch","sandbox_exec"],"targetsOnlyNewFunctions":77,"targetsOnlyNewTables":8,"all100FunctionBodiesByteExactJ":true,"actualDifferenceEvidence":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/uc019-issuance-lifecycle-evidence-20261022/atomic622/j-main9-v4/ACTUAL_PORTABLE_CATALOG_DIFF.json","bytes":16464,"sha256":"196b6cdd6d312fa13d5e4b5acdff59681cf41b98a6643157431149030f0dcd9a"},"actualFreshRollbackAndDefaults":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/uc019-issuance-lifecycle-evidence-20261022/atomic622/j-main9-v4/ACTUAL_FRESH_ROLLBACK_AND_DEFAULT_ACL.json","bytes":23674,"sha256":"defac44e5363d9967b61ded1cb8cfee9cf6b564781d4ab8163fb84911c4f4913"},"KSourceProof":{"path":"C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/uc019-issuance-lifecycle-evidence-20261022/backend-source-k/FINITE_PROVIDER_NEW_OBJECT_ACL_BYTE_PROOF_V2.json","bytes":12480,"sha256":"edda9c69cc749acbf12b8d1e85a7acdfe58c8c6ac8f5f104ce8c7c67ec4b9647"},"globalDefaultACLUntouched":true,"allOldGrantsRetained":true}}'::jsonb);
CREATE FUNCTION pg_temp.uc019_capture_new_catalog() RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $portable$
SELECT jsonb_build_object(
'functions',(SELECT jsonb_agg(jsonb_build_object('signature','public.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),', ',',')||')','source_md5',md5(p.prosrc),'portable',jsonb_build_object('owner',pg_get_userbyid(p.proowner),'schema',n.nspname,'language',l.lanname,'kind',p.prokind,'security_definer',p.prosecdef,'leakproof',p.proleakproof,'strict',p.proisstrict,'set_returning',p.proretset,'volatility',p.provolatile,'parallel',p.proparallel,'cost',p.procost,'rows',p.prorows,'config',p.proconfig,'arg_names',p.proargnames,'identity_args',pg_get_function_identity_arguments(p.oid),'full_args',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'acl',p.proacl::text))ORDER BY p.proname)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public'AND p.proname=ANY(ARRAY['uc_education_issue_error','uc_enrollment_is_withdrawn','uc_education_issue_actor','uc_education_issue_scope','uc_education_issue_can','uc_education_withdraw_can','uc_education_issue_caps','uc_education_issue_fence','uc_education_issue_source','uc_education_issue_source_projection','uc_education_issue_basis_projection','uc_education_number_witness','uc_education_prospective_numbers','uc_education_issue_source_lock','uc_education_template','uc_education_admission_definition_shape','uc_education_admission_evidence_shape','uc_education_admission_reviews','uc_education_admission_digest','uc_education_admission_review_check','uc_education_admission_conditions','uc_education_trusted_erasure','uc_education_withdraw_state','uc_education_withdraw_intent','uc_guard_retained_enrollment','uc_guard_retained_learner_activity','uc_education_retained_learning_summary','uc_education_issue_admission','uc_education_issue_block','uc_education_issue_candidate','uc_education_issue_enrollment_fence','uc_education_issue_proof_visible','uc_education_issue_handover_projection','uc_education_issue_artifact_projection','uc_education_issue_state_hash','uc_education_issue_record','uc_education_issue_event','uc_education_actor_org_permission','uc_education_artifact_actor','uc_education_template_current','uc_education_withdraw_apply','uc_education_issue_preview','uc_education_replacement_identity','uc_education_handover_check','uc_education_change_preview','uc_education_frdo_snapshot','uc_education_render_variables','uc_education_canonical_boundary','uc_education_saved_output_counts','uc_education_staging_storage_guard','uc_education_preparation_access','uc_education_output_approval','uc_education_preparation_item_json','uc_education_preparation_json','prepare_education_issuance_artifacts','uc_education_artifact_live','uc_education_artifact_saved_source','uc_education_artifact_context_json','uc_education_artifact_context','uc_education_artifact_service_request','uc_education_artifact_attest_shape','uc_attest_education_issuance_staging','uc_attest_education_issuance_artifact','uc_education_artifact_final','uc_education_issue_one','uc_education_change_apply','uc_education_mutation_result','apply_education_issuance_action','uc_education_withdraw_event','uc_education_html','uc_education_issue_export','read_education_issuance','uc_education_output_slot','uc_education_output_storage_guard','uc_education_actor_json','uc_education_personal_counts','uc_education_erase_user'])),
'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'persistence',c.relpersistence,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'replica_identity',c.relreplident,'partition',c.relispartition,'options',c.reloptions,'acl',coalesce(c.relacl,acldefault('r',c.relowner))::text,
'columns',(SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text,'options',a.attoptions,'storage',a.attstorage,'compression',a.attcompression,'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE cn.nspname||'.'||co.collname END)ORDER BY a.attnum)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',x.conname,'type',x.contype,'definition',pg_get_constraintdef(x.oid,true),'deferrable',x.condeferrable,'deferred',x.condeferred,'validated',x.convalidated,'noinherit',x.connoinherit,'local',x.conislocal,'inherit_count',x.coninhcount,'update',x.confupdtype,'delete',x.confdeltype,'match',x.confmatchtype)ORDER BY x.conname),'[]')FROM pg_constraint x WHERE x.conrelid=c.oid),
'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',ic.relname,'definition',pg_get_indexdef(x.indexrelid),'unique',x.indisunique,'primary',x.indisprimary,'exclusion',x.indisexclusion,'immediate',x.indimmediate,'clustered',x.indisclustered,'valid',x.indisvalid,'ready',x.indisready,'live',x.indislive,'replident',x.indisreplident)ORDER BY ic.relname),'[]')FROM pg_index x JOIN pg_class ic ON ic.oid=x.indexrelid WHERE x.indrelid=c.oid),
'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p)ORDER BY p.policyname),'[]')FROM pg_policies p WHERE p.schemaname='public'AND p.tablename=c.relname),
'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid,true),'internal',t.tgisinternal,'enabled',t.tgenabled,'type',t.tgtype,'args',encode(t.tgargs,'hex'),'deferrable',t.tgdeferrable,'deferred',t.tginitdeferred)ORDER BY t.tgname),'[]')FROM pg_trigger t WHERE t.tgrelid=c.oid),
'direct_client_privilege',EXISTS(SELECT 1 FROM unnest(ARRAY['authenticated','anon','service_role'])r WHERE has_table_privilege(r,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')OR has_any_column_privilege(r,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))
)ORDER BY c.relname)FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(ARRAY['uc_education_issuance_states','uc_education_issuance_events','uc_enrollment_withdrawal_states','uc_enrollment_withdrawal_events','uc_education_issuance_requests','uc_education_issuance_contexts','uc_education_issuance_preparations','uc_education_issuance_preparation_items'])),
'new_bucket',(SELECT jsonb_build_object('id',id,'name',name,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)FROM storage.buckets WHERE id='education-issuance-staging'),
'storage_policy',(SELECT to_jsonb(p)FROM pg_policies p WHERE p.schemaname='storage'AND p.tablename='objects'AND p.policyname='uc_education_staging_private_boundary'),
'delivery_constraint',(SELECT jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid,true),'validated',convalidated)FROM pg_constraint WHERE conrelid='public.education_document_records'::regclass AND conname='education_document_records_delivery_method_check'),
'new_old_table_guards',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled,'type',t.tgtype,'args',encode(t.tgargs,'hex'))ORDER BY n.nspname,c.relname,t.tgname)FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND t.tgname IN('uc_education_issuance_guard','uc_education_staging_object_boundary','zz_uc_education_output_object_boundary','uc_retained_activity_write','uc_retained_enrollment_write'))
)AS catalog;

$portable$;
DO $pre$ BEGIN
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>621
 OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p'))<>344
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261023010000')
 OR EXISTS(SELECT 1 FROM uc019_body_allowlist a LEFT JOIN pg_proc p ON p.oid=to_regprocedure(a.signature) WHERE p.oid IS NULL OR md5(p.prosrc)<>a.old_md5)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements((SELECT value->'oldFunctionBodyAllowlist'FROM uc019_expected_catalog))a LEFT JOIN pg_proc p ON p.oid=to_regprocedure(a->>'signature')WHERE p.oid IS NULL OR pg_get_userbyid(p.proowner)IS DISTINCT FROM a->>'old_owner'OR to_jsonb(p.proconfig)IS DISTINCT FROM a->'old_config'OR p.prosecdef IS DISTINCT FROM(a->>'old_security_definer')::boolean OR p.provolatile::text IS DISTINCT FROM a->>'old_volatility'OR p.proacl::text IS DISTINCT FROM a->>'old_acl')
 OR EXISTS(SELECT 1 FROM uc019_new_function_allowlist a WHERE to_regprocedure(a.signature) IS NOT NULL)
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(ARRAY['uc_education_issuance_contexts','uc_education_issuance_events','uc_education_issuance_preparation_items','uc_education_issuance_preparations','uc_education_issuance_requests','uc_education_issuance_states','uc_enrollment_withdrawal_events','uc_enrollment_withdrawal_states']))
 THEN RAISE EXCEPTION 'UC019_PRE622_BASELINE_MISMATCH';END IF;
 IF(SELECT count(*)FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth','storage')AND c.relkind IN('r','p'))<>379
 OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261022233000'AND name='uc_purge_worker_execute_boundary'AND cardinality(statements)=1 AND encode(sha256(convert_to(statements[1],'UTF8')),'hex')='70041ce415855b204808f94efb5e1f3179019cf38bb784ed217a5bbc67bf2cd1'AND created_by IS NULL AND idempotency_key IS NULL AND rollback IS NULL)
 OR(SELECT to_jsonb(c)FROM pg_constraint c WHERE c.oid=(SELECT(value->'oldConstraintPreImage'->'tuple'->>'oid')::oid FROM uc019_expected_catalog))IS DISTINCT FROM(SELECT value->'oldConstraintPreImage'->'tuple'FROM uc019_expected_catalog)
 OR(SELECT p.proacl::text FROM pg_proc p WHERE p.oid=to_regprocedure('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)'))IS DISTINCT FROM(SELECT value#>>'{exactOldBatchACL,acl}'FROM uc019_expected_catalog)
 OR(SELECT p.oid::text FROM pg_proc p WHERE p.oid=to_regprocedure('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)'))IS DISTINCT FROM(SELECT value#>>'{exactOldBatchACL,oid}'FROM uc019_expected_catalog)
 OR EXISTS(SELECT 1 FROM storage.buckets WHERE id='education-issuance-staging')
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polname='uc_education_staging_private_boundary'AND polrelid='storage.objects'::regclass)
 OR EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN jsonb_array_elements((SELECT value->'newOldTableGuards'FROM uc019_expected_catalog))g ON n.nspname=g->>'schema'AND c.relname=g->>'table'AND t.tgname=g->>'name')
 THEN RAISE EXCEPTION 'UC019_EXACT_621_ROWS_LEDGER_CHECK_ACL_PREIMAGE_MISMATCH';END IF;
END $pre$;
-- Inventory predates all new application objects. Existing object bodies, ACL,
-- identities and definition tuples remain compared by exact existing OID.
CREATE TEMP TABLE uc019_old_classes ON COMMIT DROP AS SELECT c.oid,n.nspname,c.relname,c.relkind,(SELECT string_agg(quote_ident(a.attname),',' ORDER BY a.attnum)FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)projection FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth','storage');
CREATE TEMP TABLE uc019_old_procs ON COMMIT DROP AS SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_(toast_)?temp_';
CREATE TEMP TABLE uc019_old_types ON COMMIT DROP AS SELECT t.oid FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_(toast_)?temp_';
CREATE TEMP TABLE uc019_old_constraints ON COMMIT DROP AS SELECT c.oid FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname !~ '^pg_(toast_)?temp_';
CREATE TEMP TABLE uc019_old_triggers ON COMMIT DROP AS SELECT t.oid FROM pg_trigger t JOIN uc019_old_classes c ON c.oid=t.tgrelid;
CREATE TEMP TABLE uc019_old_policies ON COMMIT DROP AS SELECT p.oid FROM pg_policy p JOIN uc019_old_classes c ON c.oid=p.polrelid;
CREATE TEMP TABLE uc019_old_defaults ON COMMIT DROP AS SELECT d.oid FROM pg_attrdef d JOIN uc019_old_classes c ON c.oid=d.adrelid;
CREATE TEMP TABLE uc019_old_namespaces ON COMMIT DROP AS SELECT oid FROM pg_namespace WHERE nspname IN('public','auth','storage','supabase_migrations');
CREATE TEMP TABLE uc019_allowed_parent_fks(constraint_name text PRIMARY KEY,child_table text,parent_table text) ON COMMIT DROP;
-- No allowed new FK references to existing tables: any addition is refused below.
CREATE FUNCTION pg_temp.uc019_capture_guard() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $capture$
DECLARE guard_table record;guard_count bigint;guard_sha text;guard_data jsonb:='{}';guard_result jsonb;
BEGIN
 FOR guard_table IN SELECT * FROM uc019_old_classes WHERE relkind IN('r','p') ORDER BY oid LOOP
  EXECUTE format('SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(row_hash,%L ORDER BY row_hash COLLATE "C"),%L),%L)),%L) FROM (SELECT encode(sha256(convert_to(to_jsonb(guard_r)::text,%L)),%L) row_hash FROM (SELECT %s FROM %I.%I%s) guard_r) guard_hashed','','','UTF8','hex','UTF8','hex',guard_table.projection,guard_table.nspname,guard_table.relname,CASE WHEN guard_table.nspname='storage'AND guard_table.relname='buckets'THEN format(' WHERE id<>%L','education-issuance-staging')ELSE ''END) INTO guard_count,guard_sha;
  guard_data:=guard_data||jsonb_build_object(guard_table.nspname||'.'||guard_table.relname,jsonb_build_object('rows',guard_count,'sha256',guard_sha));
 END LOOP;
 SELECT jsonb_build_object(
 'data',guard_data,
 'classes',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid)::text,''),'UTF8')),'hex') FROM pg_class c JOIN uc019_old_classes o ON o.oid=c.oid),
 'attributes',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attcollation,a.attisdropped,a.attacl::text,a.attoptions,a.attfdwoptions,a.atthasdef,a.attstorage,a.attcompression,a.attmissingval::text) ORDER BY a.attrelid,a.attnum)::text,''),'UTF8')),'hex') FROM pg_attribute a JOIN uc019_old_classes o ON o.oid=a.attrelid),
 'defaults',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid)::text,''),'UTF8')),'hex') FROM pg_attrdef d JOIN uc019_old_defaults o ON o.oid=d.oid),
 'constraints',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid)::text,''),'UTF8')),'hex') FROM pg_constraint c JOIN uc019_old_constraints o ON o.oid=c.oid WHERE c.oid<>(SELECT(value->'oldConstraintPreImage'->'tuple'->>'oid')::oid FROM uc019_expected_catalog)),
 'triggers',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid)::text,''),'UTF8')),'hex') FROM pg_trigger t JOIN uc019_old_triggers o ON o.oid=t.oid),
 'policies',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(p)ORDER BY p.oid)::text,''),'UTF8')),'hex')FROM pg_policy p JOIN uc019_old_policies o ON o.oid=p.oid),
 'indexes',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid)::text,''),'UTF8')),'hex') FROM pg_index i JOIN uc019_old_classes o ON o.oid=i.indexrelid),
 'functions',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg((CASE WHEN p.oid=to_regprocedure('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)')THEN(to_jsonb(p)-'prosrc'-'proacl')||jsonb_build_object('proacl','__EXACT_BATCH_REVOKE_ONLY__')ELSE to_jsonb(p)-'prosrc'END)||jsonb_build_object('source_sha256',CASE WHEN EXISTS(SELECT 1 FROM uc019_body_allowlist a WHERE p.oid=to_regprocedure(a.signature)) THEN '__EXACT_23_BODY_ALLOWLIST__' ELSE encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') END) ORDER BY p.oid)::text,''),'UTF8')),'hex') FROM pg_proc p JOIN uc019_old_procs o ON o.oid=p.oid),
 'roles',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.oid)::text,''),'UTF8')),'hex') FROM pg_roles r),
 'role_memberships',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.roleid,a.member,a.grantor)::text,''),'UTF8')),'hex') FROM pg_auth_members a),
 'role_settings',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.setdatabase,a.setrole)::text,''),'UTF8')),'hex') FROM pg_db_role_setting a),
 'default_acl',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.oid)::text,''),'UTF8')),'hex') FROM pg_default_acl a),
 'types',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid)::text,''),'UTF8')),'hex') FROM pg_type t JOIN uc019_old_types o ON o.oid=t.oid),
 'enum_values',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.enumtypid,e.enumsortorder,e.oid)::text,''),'UTF8')),'hex') FROM pg_enum e JOIN uc019_old_types o ON o.oid=e.enumtypid),
 'range_definitions',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.rngtypid)::text,''),'UTF8')),'hex') FROM pg_range r JOIN uc019_old_types o ON o.oid=r.rngtypid),
 'schemas',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.oid)::text,''),'UTF8')),'hex') FROM pg_namespace n WHERE n.nspname !~ '^pg_(toast_)?temp_'),
 'extensions',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.oid)::text,''),'UTF8')),'hex') FROM pg_extension e),
 'event_triggers',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.oid)::text,''),'UTF8')),'hex') FROM pg_event_trigger e),
 'ledger_count',(SELECT count(*) FROM supabase_migrations.schema_migrations),
 'ledger_sha256',(SELECT encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex'),'' ORDER BY m.version COLLATE "C"),''),'UTF8')),'hex') FROM supabase_migrations.schema_migrations m)
 ) INTO guard_result;RETURN guard_result;
END $capture$;
CREATE TEMP TABLE uc019_guard_before ON COMMIT DROP AS SELECT pg_temp.uc019_capture_guard() value;
-- Exact actual621 function preimages; no ledger-count assumptions in raw migration.
DO $preimage$DECLARE n integer;h text;BEGIN
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='uc_admission_requirements_digest'AND pg_get_function_identity_arguments(p.oid)='p_case uuid';IF n<>1 OR h IS DISTINCT FROM'c9e1ca698f744ff7a67465ac1a9950e8'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: uc_admission_requirements_digest' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='uc_admission_state'AND pg_get_function_identity_arguments(p.oid)='p_case uuid, p_actor uuid, p_learner boolean';IF n<>1 OR h IS DISTINCT FROM'dea3e9b40160f26adb28cfdfe2bc3e54'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: uc_admission_state' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='uc_admission_event'AND pg_get_function_identity_arguments(p.oid)='p_case uuid, p_actor uuid, p_event uuid, p_kind text, p_request uuid, p_payload_digest text, p_reason text';IF n<>1 OR h IS DISTINCT FROM'3e81ed477945abdc48aafbc7bb08752a'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: uc_admission_event' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='uc_admission_validate_action'AND pg_get_function_identity_arguments(p.oid)='p_command jsonb';IF n<>1 OR h IS DISTINCT FROM'cd55430ab20af655fea869e9ebb3031e'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: uc_admission_validate_action' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='apply_student_admission_case_action'AND pg_get_function_identity_arguments(p.oid)='p_organization_id uuid, p_student_user_id uuid, p_request_id uuid, p_command jsonb';IF n<>1 OR h IS DISTINCT FROM'085703a16eb2795cbc018b87ca232893'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: apply_student_admission_case_action' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='can_access_course_as_learner'AND pg_get_function_identity_arguments(p.oid)='_course_id uuid';IF n<>1 OR h IS DISTINCT FROM'ac874288fd237b9a70850c9108d7fbcf'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: can_access_course_as_learner' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='auto_complete_enrollment'AND pg_get_function_identity_arguments(p.oid)='';IF n<>1 OR h IS DISTINCT FROM'7975b82096da4f518bd429d14011208a'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: auto_complete_enrollment' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='complete_own_course_enrollment'AND pg_get_function_identity_arguments(p.oid)='p_enrollment_id uuid';IF n<>1 OR h IS DISTINCT FROM'cf2e185eea26424a64407615da3f84fc'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: complete_own_course_enrollment' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='recalc_enrollment_progress'AND pg_get_function_identity_arguments(p.oid)='';IF n<>1 OR h IS DISTINCT FROM'6e08194130c44ad1009ea42c73e0bdd0'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: recalc_enrollment_progress' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='recalc_enrollment_time'AND pg_get_function_identity_arguments(p.oid)='p_enrollment_id uuid';IF n<>1 OR h IS DISTINCT FROM'debd68026dbe4ab127ba954878b9c096'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: recalc_enrollment_time' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='uc_learning_access'AND pg_get_function_identity_arguments(p.oid)='p_org uuid, p_scope jsonb, p_write boolean';IF n<>1 OR h IS DISTINCT FROM'8906d1848181831ba04d823913f02658'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: uc_learning_access' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='auto_create_education_document'AND pg_get_function_identity_arguments(p.oid)='';IF n<>1 OR h IS DISTINCT FROM'2ca349325b86d9a43bdb9ea52b63b94c'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: auto_create_education_document' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='uc_guard_enrollment_delete'AND pg_get_function_identity_arguments(p.oid)='';IF n<>1 OR h IS DISTINCT FROM'695e59b918eaedb9aacbb4e808b503df'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: uc_guard_enrollment_delete' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='cancel_course_assignment'AND pg_get_function_identity_arguments(p.oid)='p_enrollment_id uuid, p_organization_id uuid';IF n<>1 OR h IS DISTINCT FROM'5216588e67f76fe3ae30ddab3837dcae'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: cancel_course_assignment' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='read_learning_outcome'AND pg_get_function_identity_arguments(p.oid)='p_organization_id uuid, p_query jsonb';IF n<>1 OR h IS DISTINCT FROM'b156cdaed9f6e4de74500d96d035191e'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: read_learning_outcome' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='issue_education_document_batch'AND pg_get_function_identity_arguments(p.oid)='p_organization_id uuid, p_group_id uuid, p_course_id uuid, p_items jsonb';IF n<>1 OR h IS DISTINCT FROM'692c93d809266565da3ec8a93668ad42'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: issue_education_document_batch' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='commit_org_document_version'AND pg_get_function_identity_arguments(p.oid)='p_document_id uuid, p_organization_id uuid, p_request_id uuid, p_expected_revision bigint, p_upload jsonb, p_restore_version_id uuid, p_document jsonb';IF n<>1 OR h IS DISTINCT FROM'73ff967e0f7ff97c3d96f8d3f14191fd'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: commit_org_document_version' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='account_deletion_snapshot'AND pg_get_function_identity_arguments(p.oid)='p_user_id uuid';IF n<>1 OR h IS DISTINCT FROM'fe1fbb5670a69d58c5a846dd93296ede'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: account_deletion_snapshot' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='account_deletion_files'AND pg_get_function_identity_arguments(p.oid)='p_user_id uuid';IF n<>1 OR h IS DISTINCT FROM'6edb02b4091de45199ae7f6f0749956d'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: account_deletion_files' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='uc_guard_program_issuance'AND pg_get_function_identity_arguments(p.oid)='';IF n<>1 OR h IS DISTINCT FROM'05b362d516a0676bea8b48b1d2b40e7d'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: uc_guard_program_issuance' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='uc_record_program_issuance'AND pg_get_function_identity_arguments(p.oid)='';IF n<>1 OR h IS DISTINCT FROM'357fd09f67deb7e838a314a6b60d60b2'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: uc_record_program_issuance' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='uc_scoped_journal_personal_counts'AND pg_get_function_identity_arguments(p.oid)='p_user uuid';IF n<>1 OR h IS DISTINCT FROM'63476fea68407b8f0a09a0ace1e2030a'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: uc_scoped_journal_personal_counts' USING ERRCODE='55000';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public'AND p.proname='uc_scoped_journal_erase_user'AND pg_get_function_identity_arguments(p.oid)='p_user uuid';IF n<>1 OR h IS DISTINCT FROM'eeab1ccbbf78c67ad8035420aa9e2ff7'THEN RAISE EXCEPTION 'UC019 actual621 preimage mismatch: uc_scoped_journal_erase_user' USING ERRCODE='55000';END IF;
END;$preimage$;
-- UC019: controlled official issuance, factual delivery and retained withdrawal.
-- Additive private state; no backfill, old-row updates, new number engine or quota rewrite.
CREATE TABLE public.uc_education_issuance_states(
 record_id uuid PRIMARY KEY,organization_id uuid NOT NULL,user_id uuid,course_id uuid,enrollment_id uuid,group_id uuid,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),original_record_id uuid,registry_record_id uuid,proof jsonb,artifact jsonb,frdo_facts jsonb,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),annulment jsonb,latest_handover jsonb,
 recorded_by uuid,updated_by uuid,participant_ids uuid[] NOT NULL DEFAULT '{}',redacted boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.uc_education_issuance_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),record_id uuid NOT NULL,organization_id uuid NOT NULL,user_id uuid,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 kind text NOT NULL CHECK(kind IN('issued','metadata_corrected','handover_recorded','handover_voided','duplicate_issued','annulled')),actor_id uuid,reason text NOT NULL CHECK(length(reason)<=2000),
 previous_state_hash text NOT NULL CHECK(previous_state_hash~'^[a-f0-9]{64}$'),state_hash text NOT NULL CHECK(state_hash~'^[a-f0-9]{64}$'),payload jsonb NOT NULL,
 participant_ids uuid[] NOT NULL DEFAULT '{}',redacted boolean NOT NULL DEFAULT false,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(record_id,revision)
);
CREATE TABLE public.uc_enrollment_withdrawal_states(
 enrollment_id uuid PRIMARY KEY,organization_id uuid NOT NULL,user_id uuid,course_id uuid NOT NULL,group_id uuid,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 effective_date date NOT NULL,basis jsonb NOT NULL,technical_snapshot jsonb NOT NULL,recorded_by uuid,participant_ids uuid[] NOT NULL DEFAULT '{}',redacted boolean NOT NULL DEFAULT false,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.uc_enrollment_withdrawal_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),enrollment_id uuid NOT NULL,organization_id uuid NOT NULL,user_id uuid,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 actor_id uuid,reason text NOT NULL CHECK(length(reason)<=2000),effective_date date NOT NULL,basis jsonb NOT NULL,before_state jsonb NOT NULL,after_state jsonb NOT NULL,participant_ids uuid[] NOT NULL DEFAULT '{}',redacted boolean NOT NULL DEFAULT false,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(enrollment_id,revision)
);
CREATE TABLE public.uc_education_issuance_requests(
 actor_id uuid NOT NULL,request_id uuid NOT NULL,organization_id uuid NOT NULL,scope jsonb NOT NULL,action text NOT NULL CHECK(action IN('issue_batch','apply_change','withdraw_enrollments','prepare_artifacts','render_artifact')),
 payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),receipt jsonb NOT NULL,participant_ids uuid[] NOT NULL DEFAULT '{}',PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE public.uc_education_issuance_contexts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),transaction_id bigint NOT NULL,backend_pid integer NOT NULL,actor_id uuid NOT NULL,organization_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN('original','duplicate')),enrollment_id uuid NOT NULL,user_id uuid NOT NULL,course_id uuid NOT NULL,group_id uuid NOT NULL,
 original_record_id uuid,proof jsonb NOT NULL,source_snapshot jsonb NOT NULL,official_identity jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX uc_education_issuance_scope ON public.uc_education_issuance_states(organization_id,record_id);
CREATE INDEX uc_education_issuance_history ON public.uc_education_issuance_events(organization_id,record_id,revision DESC);
CREATE INDEX uc_enrollment_withdrawal_scope ON public.uc_enrollment_withdrawal_states(organization_id,enrollment_id);
DO $private$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['uc_education_issuance_states','uc_education_issuance_events','uc_enrollment_withdrawal_states','uc_enrollment_withdrawal_events','uc_education_issuance_requests','uc_education_issuance_contexts']LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END;$private$;
CREATE FUNCTION public.uc_education_issue_error(p_code text)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'EDUCATION_ISSUANCE_%',p_code USING ERRCODE=CASE p_code WHEN 'ACCESS_DENIED'THEN '42501'WHEN 'INVALID_INPUT'THEN '22023'WHEN 'REVISION_CONFLICT'THEN 'PT409'WHEN 'REQUEST_CONFLICT'THEN 'PT409'WHEN 'SOURCE_CHANGED'THEN 'PT409'WHEN 'NUMBER_PLAN_STALE'THEN 'PT409'ELSE 'P0001'END;END;$fn$;
CREATE FUNCTION public.uc_enrollment_is_withdrawn(p_enrollment uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.uc_enrollment_withdrawal_states s WHERE s.enrollment_id=p_enrollment AND NOT s.redacted) $fn$;
CREATE FUNCTION public.uc_education_issue_actor()RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated'AND auth.uid()IS NOT NULL AND public.uc_custom_journal_person(auth.uid())AND public.account_deletion_access_allowed(),false) $fn$;
CREATE FUNCTION public.uc_education_issue_scope(p_org uuid,p_scope jsonb)RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN IF NOT public.uc_education_issue_actor()OR p_org IS NULL THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 IF public.uc_admission_shape(p_scope,ARRAY['kind'])AND p_scope->>'kind'='organization'THEN RETURN NULL;
 ELSIF public.uc_admission_shape(p_scope,ARRAY['kind','group_id'])AND p_scope->>'kind'='group'AND public.uc_admission_uuid(p_scope->'group_id')AND EXISTS(SELECT 1 FROM public.student_groups g WHERE g.id=(p_scope->>'group_id')::uuid AND g.organization_id=p_org)THEN RETURN(p_scope->>'group_id')::uuid;
 ELSE PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;END;$fn$;
CREATE FUNCTION public.uc_education_issue_can(p_org uuid,p_group uuid,p_enrollment uuid,p_user uuid,p_course uuid,p_action text)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_education_issue_actor()AND public.uc_document_has_action(p_org,p_action)AND public.uc_document_record_scope(p_org,p_group,p_enrollment,p_user,p_course),false) $fn$;
CREATE FUNCTION public.uc_education_withdraw_can(p_org uuid,p_group uuid,p_enrollment uuid,p_write boolean DEFAULT false)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_education_issue_actor()AND EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=p_enrollment AND c.organization_id=p_org
 AND(CASE WHEN p_write THEN public.uc_student_frdo_staff_org_allowed(auth.uid(),p_org,'students.write')ELSE public.uc_platform_document_action_allowed(auth.uid(),'read')AND public.can_access_organization(p_org,'students.read')END)
 AND public.uc_document_scope_allowed(p_org,p_group,e.id)AND(p_group IS NULL OR EXISTS(SELECT 1 FROM public.student_groups g JOIN public.student_group_memberships_effective m ON m.group_id=g.id AND m.organization_id=g.organization_id WHERE g.id=p_group AND g.organization_id=p_org AND g.course_id=e.course_id AND m.user_id=e.user_id))),false) $fn$;
CREATE FUNCTION public.uc_education_issue_caps(p_org uuid,p_group uuid,p_enrollment uuid DEFAULT NULL,p_user uuid DEFAULT NULL,p_course uuid DEFAULT NULL)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('can_read',r,'can_issue',i,'can_write_metadata',w,'can_record_handover',w,'can_annul',a,'can_issue_duplicate',i,'can_export',r,
 'can_read_withdrawal',CASE WHEN p_enrollment IS NOT NULL THEN public.uc_education_withdraw_can(p_org,p_group,p_enrollment,false)ELSE public.uc_education_issue_actor()AND public.uc_platform_document_action_allowed(auth.uid(),'read')AND public.can_access_organization(p_org,'students.read')END,
 'can_withdraw',CASE WHEN p_enrollment IS NOT NULL THEN public.uc_education_withdraw_can(p_org,p_group,p_enrollment,true)ELSE public.uc_education_issue_actor()AND public.uc_student_frdo_staff_org_allowed(auth.uid(),p_org,'students.write')END)FROM(SELECT public.uc_education_issue_can(p_org,p_group,p_enrollment,p_user,p_course,'read')r,public.uc_education_issue_can(p_org,p_group,p_enrollment,p_user,p_course,'issue')AND coalesce((public.uc_document_registry_caps(p_org,p_group)->>'can_register')::boolean,false)i,public.uc_education_issue_can(p_org,p_group,p_enrollment,p_user,p_course,'issue')a,public.uc_education_issue_can(p_org,p_group,p_enrollment,p_user,p_course,'write')w)x $fn$;
CREATE FUNCTION public.uc_education_issue_fence(p_org uuid,p_group uuid,p_people uuid[],p_key text DEFAULT NULL)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE u uuid;BEGIN
 FOR u IN SELECT DISTINCT id FROM unnest(array_append(coalesce(p_people,'{}'),auth.uid()))id WHERE id IS NOT NULL ORDER BY id LOOP
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(u::text,42007))THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;
 IF EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=u)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;END LOOP;
 IF p_key IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended('uc_education:'||p_org::text||':'||p_key,0))THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;
END;$fn$;
CREATE FUNCTION public.uc_education_issue_source(p_org uuid,p_source jsonb,p_required boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v jsonb;BEGIN v:=public.uc_document_registry_source(p_org,p_source,false,false);IF v IS NULL AND p_required THEN PERFORM public.uc_education_issue_error('SOURCE_UNAVAILABLE');END IF;RETURN v;END;$fn$;
CREATE FUNCTION public.uc_education_issue_source_projection(p_org uuid,p_source jsonb)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('source',CASE WHEN public.uc_education_issue_source(p_org,p_source,false)IS NOT NULL THEN p_source END,'availability',CASE WHEN public.uc_education_issue_source(p_org,p_source,false)IS NOT NULL THEN 'available'ELSE 'currently_unavailable'END) $fn$;
CREATE FUNCTION public.uc_education_issue_basis_projection(p_org uuid,p_basis jsonb)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT(p_basis-'source')||jsonb_build_object('source',CASE WHEN public.uc_education_issue_source(p_org,p_basis->'source',false)IS NOT NULL THEN p_basis->'source'END,'source_availability',CASE WHEN public.uc_education_issue_source(p_org,p_basis->'source',false)IS NOT NULL THEN 'available'ELSE 'currently_unavailable'END) $fn$;

DO $delivery$DECLARE def text;BEGIN SELECT pg_get_constraintdef(oid,true)INTO def FROM pg_constraint WHERE conrelid='public.education_document_records'::regclass AND conname='education_document_records_delivery_method_check';IF def IS DISTINCT FROM 'CHECK (delivery_method = ANY (ARRAY[''personal''::text, ''representative''::text, ''postal''::text]))'THEN RAISE EXCEPTION 'UC019 unexpected delivery constraint' USING ERRCODE='55000';END IF;END;$delivery$;
ALTER TABLE public.education_document_records DROP CONSTRAINT education_document_records_delivery_method_check;
ALTER TABLE public.education_document_records ADD CONSTRAINT education_document_records_delivery_method_check CHECK(delivery_method=ANY(ARRAY['personal'::text,'representative'::text,'postal'::text,'not_recorded'::text]));

CREATE TABLE public.uc_education_issuance_preparations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,actor_id uuid,scope jsonb NOT NULL,kind text NOT NULL CHECK(kind IN('original','duplicate')),plan jsonb NOT NULL,
 intent_hash text NOT NULL CHECK(intent_hash~'^[a-f0-9]{64}$'),template jsonb NOT NULL,template_storage jsonb NOT NULL,template_byte_sha256 text CHECK(template_byte_sha256~'^[a-f0-9]{64}$'),number_witness jsonb NOT NULL,
 participant_ids uuid[]NOT NULL DEFAULT '{}',redacted boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.uc_education_issuance_preparation_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),preparation_id uuid NOT NULL,organization_id uuid NOT NULL,enrollment_id uuid NOT NULL,user_id uuid,course_id uuid NOT NULL,group_id uuid NOT NULL,input_revision bigint NOT NULL DEFAULT 1 CHECK(input_revision BETWEEN 1 AND 9007199254740991),
 number_plan jsonb NOT NULL,eligibility_ref jsonb NOT NULL,source_snapshot jsonb NOT NULL,official_identity jsonb NOT NULL,frdo_facts jsonb NOT NULL,render_variables jsonb NOT NULL,render_input_hash text NOT NULL CHECK(render_input_hash~'^[a-f0-9]{64}$'),
 output_document_id uuid NOT NULL UNIQUE,output_request_id uuid NOT NULL UNIQUE,retained_subject_user_id uuid,staging_proof jsonb,artifact jsonb,final_record_id uuid,participant_ids uuid[]NOT NULL DEFAULT '{}',redacted boolean NOT NULL DEFAULT false,UNIQUE(preparation_id,enrollment_id));
ALTER TABLE public.uc_education_issuance_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uc_education_issuance_preparation_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.uc_education_issuance_preparations,public.uc_education_issuance_preparation_items FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX uc_education_preparations_creator ON public.uc_education_issuance_preparations(organization_id,actor_id,id);
CREATE INDEX uc_education_preparation_subject ON public.uc_education_issuance_preparation_items(organization_id,user_id,preparation_id);
CREATE FUNCTION public.uc_education_number_witness(p_org uuid,p_date date)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('year',extract(year FROM p_date)::integer,'seq_doc',(SELECT last_number FROM public.document_number_sequences WHERE organization_id=p_org AND doc_type='edu_doc'AND year=extract(year FROM p_date)::integer),'seq_reg',(SELECT last_number FROM public.document_number_sequences WHERE organization_id=p_org AND doc_type='edu_reg'AND year=extract(year FROM p_date)::integer),
 'max_doc',(SELECT coalesce(max(substring(r.document_number FROM'([0-9]+)$')::integer),0)FROM public.education_document_records r WHERE organization_id=p_org AND extract(year FROM issue_date)=extract(year FROM p_date)AND deleted_at IS NULL),
 'max_reg',(SELECT coalesce(max(substring(r.reg_number FROM'([0-9]+)$')::integer),0)FROM public.education_document_records r WHERE organization_id=p_org AND extract(year FROM issue_date)=extract(year FROM p_date)AND deleted_at IS NULL))$fn$;
CREATE FUNCTION public.uc_education_prospective_numbers(p_witness jsonb,p_index integer,p_date date,p_series text)RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE doc_n bigint;reg_n bigint;yr text:=p_witness->>'year';BEGIN IF p_index NOT BETWEEN 1 AND 100 THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 doc_n:=greatest(coalesce((p_witness->>'seq_doc')::bigint,0)+1,(p_witness->>'max_doc')::bigint+1)+p_index-1;reg_n:=greatest(coalesce((p_witness->>'seq_reg')::bigint,0)+1,(p_witness->>'max_reg')::bigint+1)+p_index-1;
 IF doc_n>2147483647 OR reg_n>2147483647 THEN PERFORM public.uc_education_issue_error('LIMIT_EXCEEDED');END IF;
 RETURN jsonb_build_object('state','prospective_unreserved','document_number',yr||'/'||lpad(doc_n::text,greatest(6,length(doc_n::text)),'0'),'reg_number','ДОК-'||yr||'/'||lpad(reg_n::text,greatest(4,length(reg_n::text)),'0'),'document_series',p_series,'issue_date',p_date);END;$fn$;
CREATE FUNCTION public.uc_education_issue_source_lock(p_org uuid,p_source jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.uc_education_issue_source(p_org,p_source,true);
 PERFORM 1 FROM public.org_documents WHERE id=(p_source->>'document_id')::uuid AND organization_id=p_org FOR SHARE;
 PERFORM 1 FROM public.org_document_versions WHERE id=(p_source->>'version_id')::uuid AND organization_id=p_org FOR SHARE;
 PERFORM 1 FROM storage.objects WHERE id=(SELECT storage_object_id FROM public.org_document_versions WHERE id=(p_source->>'version_id')::uuid AND organization_id=p_org)FOR SHARE;
 PERFORM public.uc_education_issue_source(p_org,p_source,true);END;$fn$;
CREATE FUNCTION public.uc_education_template(p_org uuid,p_template jsonb,p_lock boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE v public.org_document_versions;d public.org_documents;r public.org_document_reviews;o storage.objects;storage jsonb;BEGIN
 IF NOT public.uc_admission_shape(p_template,ARRAY['source','review_id','review_revision'])OR NOT public.uc_admission_uuid(p_template->'review_id')OR jsonb_typeof(p_template->'review_revision')IS DISTINCT FROM'number'THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 PERFORM public.uc_education_issue_source(p_org,p_template->'source',true);IF p_lock THEN PERFORM public.uc_education_issue_source_lock(p_org,p_template->'source');END IF;
 SELECT *INTO v FROM public.org_document_versions WHERE id=(p_template->'source'->>'version_id')::uuid AND document_id=(p_template->'source'->>'document_id')::uuid AND organization_id=p_org;
 SELECT *INTO d FROM public.org_documents WHERE id=v.document_id AND organization_id=p_org;
 IF p_lock THEN PERFORM 1 FROM public.org_document_reviews WHERE id=(p_template->>'review_id')::uuid FOR SHARE;END IF;
 SELECT *INTO r FROM public.org_document_reviews WHERE id=(p_template->>'review_id')::uuid AND document_id=d.id AND version_id=v.id AND organization_id=p_org;
 SELECT *INTO o FROM storage.objects WHERE id=v.storage_object_id;
 IF r.id IS NULL OR r.state<>'approved'OR r.revision<>(p_template->>'review_revision')::bigint OR d.current_version_id IS DISTINCT FROM v.id OR NOT public.uc_program_file_proof(p_org,v.id)OR EXISTS(SELECT 1 FROM public.org_document_review_comments c WHERE c.review_id=r.id AND c.resolution_status='accepted'AND c.position_anchor->>'kind'IN('insert','delete','replace'))OR lower(split_part(v.storage_metadata->>'mimetype',';',1))<>'text/html'OR v.file_size NOT BETWEEN 1 AND 1048576 THEN PERFORM public.uc_education_issue_error('ARTIFACT_REVIEW_REQUIRED');END IF;
 storage:=jsonb_build_object('bucket','org-documents','path',v.file_path,'object_id',o.id,'updated_at',o.updated_at,'byte_size',v.file_size,'mime_type','text/html','metadata_hash',p_template->'source'->'content_hash','known_sha256',NULL);
 RETURN jsonb_build_object('ref',p_template,'storage',storage);END;$fn$;

CREATE FUNCTION public.uc_education_admission_definition_shape(p_definition jsonb,p_program_type text)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE x jsonb:=p_definition->'issuance_condition';keys text[]:=ARRAY['key','kind','staff_label','source_version_ids','provision','exception_policy'];BEGIN
 IF p_definition?'issuance_condition'THEN keys:=keys||ARRAY['issuance_condition'];END IF;IF NOT public.uc_admission_shape(p_definition,keys)THEN RETURN false;END IF;
 IF NOT p_definition?'issuance_condition'THEN RETURN true;END IF;IF p_definition->>'kind'<>'education_basis'THEN RETURN false;END IF;
 IF public.uc_admission_shape(x,ARRAY['kind','education_levels','concurrent_study_admission_allowed'])AND x->>'kind'='primary_education_before_qualification'AND x->'education_levels'='["spo","vo"]'::jsonb AND jsonb_typeof(x->'concurrent_study_admission_allowed')='boolean'THEN RETURN true;END IF;
 RETURN coalesce(public.uc_admission_shape(x,ARRAY['kind','reason'])AND x->>'kind'='no_separate_primary_education_condition'AND public.uc_admission_text(x->'reason',1000)AND p_program_type='professional_training',false);END;$fn$;
CREATE FUNCTION public.uc_education_admission_evidence_shape(p_evidence jsonb)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT p_evidence='null'::jsonb OR coalesce(public.uc_admission_shape(p_evidence,ARRAY['kind','education_level','evidence_version_ids'])AND p_evidence->>'kind'='completed_primary_education'AND p_evidence->>'education_level'IN('spo','vo')AND public.uc_admission_ids(p_evidence->'evidence_version_ids',1,20),false) $fn$;
CREATE FUNCTION public.uc_education_admission_reviews(p_case uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;r public.uc_admission_rule_sets;d jsonb;q jsonb;identity jsonb;items jsonb:='[]';BEGIN
 SELECT *INTO c FROM public.uc_admission_cases WHERE id=p_case;SELECT *INTO r FROM public.uc_admission_rule_sets WHERE id=c.rule_set_id;
 FOR d IN SELECT value FROM jsonb_array_elements(coalesce(r.definitions,'[]'))WHERE value?'issuance_condition'LOOP identity:=c.reviews->'identities'->(d->>'key');q:=c.reviews->'requirements'->(identity->>'id');
 IF public.uc_admission_uuid(q->'event_id')THEN items:=items||jsonb_build_array(jsonb_build_object('requirement_id',identity->'id','requirement_revision',q->'requirement_revision','event_id',q->'event_id','actor_id',q->'actor_id','condition',d->'issuance_condition','evidence',q->'issuance_evidence'));END IF;END LOOP;RETURN items;END;$fn$;
CREATE FUNCTION public.uc_education_admission_digest(p_requirements jsonb,p_rule uuid,p_program jsonb,p_reviews jsonb)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_program_hash(jsonb_build_object('requirements',p_requirements,'rule_set_id',p_rule,'program_ref',p_program)||CASE WHEN jsonb_array_length(coalesce(p_reviews,'[]'))>0 THEN jsonb_build_object('issuance_reviews',p_reviews)ELSE '{}'::jsonb END) $fn$;
CREATE FUNCTION public.uc_education_admission_review_check(p_case uuid,p_requirement uuid,p_evidence jsonb,p_selected jsonb)RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;d jsonb;e jsonb;v jsonb;BEGIN IF p_evidence IS NULL OR p_evidence='null'::jsonb THEN RETURN;END IF;
 IF NOT public.uc_education_admission_evidence_shape(p_evidence)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;SELECT *INTO c FROM public.uc_admission_cases WHERE id=p_case;
 SELECT def INTO d FROM public.uc_admission_rule_sets r,jsonb_array_elements(r.definitions)def WHERE r.id=c.rule_set_id AND def->>'kind'='education_basis'AND c.reviews->'identities'->(def->>'key')->>'id'=p_requirement::text;
 IF d->'issuance_condition'->>'kind'IS DISTINCT FROM 'primary_education_before_qualification'THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p_evidence->'evidence_version_ids')LOOP
 IF NOT p_selected@>jsonb_build_array(e)OR NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence x WHERE x.id=(e#>>'{}')::uuid AND x.case_id=c.id AND x.requirement_id=p_requirement AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=x.id))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 v:=public.uc_admission_evidence_dto((e#>>'{}')::uuid,auth.uid());IF v->>'availability'IS DISTINCT FROM 'available'OR v->>'review'IS DISTINCT FROM 'accepted'OR v->'can_read_bytes'IS DISTINCT FROM 'true'::jsonb THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;END LOOP;END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_admission_requirements_digest(p_case uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT public.uc_education_admission_digest(requirements,rule_set_id,program_ref,public.uc_education_admission_reviews(id))FROM public.uc_admission_cases WHERE id=p_case
$function$;

CREATE FUNCTION public.uc_education_admission_conditions(p_case uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;r public.uc_admission_rule_sets;d jsonb;identity jsonb;items jsonb:='[]';BEGIN
 SELECT *INTO c FROM public.uc_admission_cases WHERE id=p_case;SELECT *INTO r FROM public.uc_admission_rule_sets WHERE id=c.rule_set_id;
 FOR d IN SELECT value FROM jsonb_array_elements(coalesce(r.definitions,'[]'))WHERE value?'issuance_condition'LOOP identity:=c.reviews->'identities'->(d->>'key');
 IF public.uc_admission_uuid(identity->'id')AND jsonb_typeof(identity->'revision')='number'AND(identity->>'revision')::bigint>0 THEN items:=items||jsonb_build_array(jsonb_build_object('requirement_id',identity->'id','requirement_revision',identity->'revision','condition',d->'issuance_condition'));END IF;END LOOP;RETURN items;END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_admission_state(p_case uuid, p_actor uuid, p_learner boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE c public.uc_admission_cases;d jsonb;tasks jsonb;changed boolean;derived jsonb;BEGIN SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case;
 IF c.id IS NULL OR NOT public.uc_admission_can_read(p_actor,c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 derived:=public.uc_admission_derive(c.id,p_actor);changed:=c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)OR NOT coalesce(public.uc_admission_rules_current(c.id),false)OR derived->'requirements'IS DISTINCT FROM c.requirements;
 d:=c.decision;IF d IS NOT NULL THEN d:=jsonb_set(d,'{later_review_required}',to_jsonb(changed OR coalesce((d->>'case_revision')::bigint<c.revision,false)));END IF;
 IF p_learner THEN
 IF p_actor<>c.user_id THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t->'id','public_label',t->'public_label','next_action',CASE WHEN t->>'kind'='supply_evidence'THEN 'upload_own_attachment'ELSE 'contact_staff'END,'status',t->'status')),'[]')INTO tasks FROM jsonb_array_elements(derived->'tasks')t;
 RETURN jsonb_build_object('id',c.id,'scope',public.uc_admission_scope(c.id),'revision',c.revision,'program_title',c.program_title,'outcome',coalesce(d->>'outcome','not_reviewed'),'outcome_recorded_at',d->'recorded_at','later_review_required',d IS NOT NULL AND(d->>'later_review_required')::boolean,'tasks',tasks);END IF;
 IF NOT public.uc_admission_staff_allowed(p_actor,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 RETURN jsonb_build_object('id',c.id,'scope',public.uc_admission_scope(c.id),'revision',c.revision,'program_ref',c.program_ref,'program_title',c.program_title,'program_type',c.program_type,'responsible_id',c.responsible_id,'rule_set_id',c.rule_set_id,'requirements',derived->'requirements',
 'issuance_reviews',public.uc_education_admission_reviews(c.id),'issuance_conditions',public.uc_education_admission_conditions(c.id),'evidence',public.uc_admission_current_evidence(c.id,p_actor),'tasks',derived->'tasks','decision',d,'prerequisites',public.uc_admission_prerequisites(c.organization_id,c.user_id,c.group_id,c.enrollment_id,NOT coalesce(public.uc_admission_rules_current(c.id),false)),
 'capabilities',public.uc_admission_capabilities(p_actor,c.organization_id,c.user_id,c.group_id,c.enrollment_id,c.id),'rule_set_digest',(SELECT digest FROM public.uc_admission_rule_sets WHERE id=c.rule_set_id),'requirements_digest',public.uc_education_admission_digest(derived->'requirements',c.rule_set_id,c.program_ref,public.uc_education_admission_reviews(c.id)));END;$function$;

CREATE OR REPLACE FUNCTION public.uc_admission_event(p_case uuid, p_actor uuid, p_event uuid, p_kind text, p_request uuid, p_payload_digest text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE c public.uc_admission_cases;r public.uc_admission_rule_sets;payload jsonb;receipt jsonb;all_evidence jsonb;authority jsonb;BEGIN SELECT * INTO STRICT c FROM public.uc_admission_cases WHERE id=p_case;SELECT * INTO r FROM public.uc_admission_rule_sets WHERE id=c.rule_set_id;authority:=public.uc_admission_authority(c.id,p_actor);
 IF p_kind='record_decision'THEN UPDATE public.uc_admission_cases SET decision=jsonb_set(decision,'{authority_snapshot_hash}',to_jsonb(public.uc_program_hash(authority)))WHERE id=c.id RETURNING * INTO c;END IF;
 SELECT coalesce(jsonb_agg(e.id ORDER BY e.id),'[]')INTO all_evidence FROM public.uc_admission_case_evidence e WHERE e.case_id=c.id AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.supersedes_id=e.id AND n.case_id=c.id);
 payload:=jsonb_build_object('reason',p_reason,'program_ref',c.program_ref,'responsible_id',c.responsible_id,'rule_set_id',c.rule_set_id,'rule_set_digest',r.digest,'requirements_digest',public.uc_admission_requirements_digest(c.id),'requirements',c.requirements,'evidence_version_ids',all_evidence,'evidence',public.uc_admission_current_evidence(c.id,p_actor),'tasks',c.tasks,'decision',c.decision,'issuance_reviews',public.uc_education_admission_reviews(c.id),'local_sources',coalesce(r.sources,'[]'),'local_requirements',coalesce(r.definitions,'[]'));
 INSERT INTO public.uc_admission_case_events(id,case_id,organization_id,user_id,case_revision,kind,actor_id,authority_hash,authority_snapshot,payload)VALUES(p_event,c.id,c.organization_id,c.user_id,c.revision,p_kind,p_actor,public.uc_program_hash(authority),authority,payload);
 receipt:=jsonb_build_object('schema_version',1,'request_id',p_request,'case_id',c.id,'revision',c.revision,'event_id',p_event,'kind',p_kind,'payload_digest',p_payload_digest);
 INSERT INTO public.uc_admission_case_requests(actor_id,request_id,case_id,organization_id,user_id,kind,payload_digest,receipt)VALUES(p_actor,p_request,c.id,c.organization_id,c.user_id,p_kind,p_payload_digest,receipt);RETURN receipt;END;$function$;

CREATE OR REPLACE FUNCTION public.uc_admission_validate_action(p_command jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE action text:=p_command->>'action';keys text[];k text;x jsonb;BEGIN
 keys:=CASE action WHEN 'initialize'THEN ARRAY['action','group_id','enrollment_id','expected_program_ref','expected_revision']WHEN 'assign_responsible'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','responsible_id','reason']WHEN 'review_local_rules'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','sources','requirements','review_reason']WHEN 'review_requirement'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','requirement_id','expected_requirement_revision','applicability','evidence_version_ids','reason','exception']WHEN 'review_evidence'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','requirement_id','expected_requirement_revision','evidence_version_id','byte_sha256','outcome','reason']WHEN 'record_decision'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','rule_set_id','rule_set_digest','requirements_digest','evidence_version_ids','outcome','reason']ELSE NULL END;
 IF action='review_requirement'AND p_command?'issuance_evidence'THEN keys:=keys||ARRAY['issuance_evidence'];IF NOT public.uc_education_admission_evidence_shape(p_command->'issuance_evidence')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;END IF;
 IF keys IS NULL OR NOT public.uc_admission_shape(p_command,keys)OR NOT public.uc_admission_ref_valid(p_command->'expected_program_ref')OR jsonb_typeof(p_command->'expected_revision')IS DISTINCT FROM 'number'OR p_command->>'expected_revision'!~'^[0-9]{1,16}$'OR(p_command->>'expected_revision')::numeric>9007199254740991 OR(action='initialize')IS DISTINCT FROM(p_command->>'expected_revision'='0')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 FOREACH k IN ARRAY keys LOOP IF k~'_id$'AND NOT public.uc_admission_uuid(p_command->k)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;END LOOP;
 IF p_command?'reason'AND NOT public.uc_admission_text(p_command->'reason')OR p_command?'review_reason'AND NOT public.uc_admission_text(p_command->'review_reason')OR p_command?'expected_requirement_revision'AND(jsonb_typeof(p_command->'expected_requirement_revision')IS DISTINCT FROM 'number'OR p_command->>'expected_requirement_revision'!~'^[1-9][0-9]{0,15}$'OR(p_command->>'expected_requirement_revision')::numeric>9007199254740991)OR p_command?'evidence_version_ids'AND NOT public.uc_admission_ids(p_command->'evidence_version_ids')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 IF action='review_requirement'THEN
  IF coalesce(p_command->>'applicability'IN('unknown','applicable','not_applicable'),false)=false THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  x:=p_command->'exception';IF x<>'null'::jsonb AND(NOT public.uc_admission_shape(x,ARRAY['rule_id','reason','evidence_version_ids'])OR NOT public.uc_admission_uuid(x->'rule_id')OR NOT public.uc_admission_text(x->'reason')OR NOT public.uc_admission_ids(x->'evidence_version_ids',1))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 ELSIF action='review_evidence'AND coalesce(p_command->>'outcome'IN('accepted','rejected')AND jsonb_typeof(p_command->'byte_sha256')='string'AND p_command->>'byte_sha256'~'^[a-f0-9]{64}$',false)=false OR action='record_decision'AND coalesce(p_command->>'outcome'IN('needs_information','admitted','not_admitted')AND jsonb_typeof(p_command->'rule_set_digest')='string'AND jsonb_typeof(p_command->'requirements_digest')='string'AND p_command->>'rule_set_digest'~'^[a-f0-9]{64}$'AND p_command->>'requirements_digest'~'^[a-f0-9]{64}$',false)=false THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
END;$function$;

CREATE OR REPLACE FUNCTION public.apply_student_admission_case_action(p_organization_id uuid, p_student_user_id uuid, p_request_id uuid, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE a uuid:=auth.uid();act text:=p_command->>'action';c public.uc_admission_cases;prior public.uc_admission_case_requests;scope jsonb;ref jsonb;reqid uuid;ctx uuid;event uuid:=gen_random_uuid();receipt jsonb;payload_digest text;source jsonb;sources jsonb:='[]';defs jsonb;d jsonb;q jsonb;reqs jsonb:='[]';review jsonb;identities jsonb;identity jsonb;new_rule uuid;digest text;reason text;eid uuid;rid uuid;rev bigint;BEGIN
 IF auth.role()IS DISTINCT FROM 'authenticated'OR a IS NULL OR p_request_id IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_admission_validate_action(p_command);payload_digest:=public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'user_id',p_student_user_id,'command',p_command));
 IF act='initialize'THEN scope:=public.uc_admission_association(p_organization_id,p_student_user_id,(p_command->>'group_id')::uuid,(p_command->>'enrollment_id')::uuid);
 ELSE SELECT * INTO c FROM public.uc_admission_cases WHERE id=(p_command->>'case_id')::uuid AND organization_id=p_organization_id AND user_id=p_student_user_id;scope:=public.uc_admission_scope(c.id);END IF;
 IF scope IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_admission_lock(a,p_organization_id,p_student_user_id,(scope->>'group_id')::uuid,(scope->>'enrollment_id')::uuid,CASE WHEN act='assign_responsible'THEN(p_command->>'responsible_id')::uuid ELSE c.responsible_id END);
 PERFORM pg_advisory_xact_lock(hashtextextended('uc_admission_request:'||a::text||':'||p_request_id::text,0));
 IF act<>'initialize'THEN SELECT * INTO c FROM public.uc_admission_cases WHERE id=(p_command->>'case_id')::uuid;
  IF act IN('review_local_rules','review_requirement','review_evidence','record_decision')AND c.responsible_id IS DISTINCT FROM a THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  IF act='review_local_rules'AND NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  IF act='assign_responsible'AND NOT public.uc_admission_staff_allowed((p_command->>'responsible_id')::uuid,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 END IF;
 SELECT * INTO prior FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id;
 IF prior.actor_id IS NOT NULL THEN IF prior.payload_digest<>payload_digest OR prior.organization_id<>p_organization_id OR prior.user_id<>p_student_user_id OR prior.kind<>act THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;RETURN public.uc_admission_result(prior.case_id,a,prior.receipt,true);END IF;
 IF act='initialize'THEN
  ref:=public.uc_admission_program(p_organization_id,p_student_user_id,(scope->>'group_id')::uuid,(scope->>'enrollment_id')::uuid);IF ref IS NULL THEN PERFORM public.uc_admission_error('PREREQUISITE_MISSING');END IF;
  IF ref IS DISTINCT FROM p_command->'expected_program_ref'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  IF EXISTS(SELECT 1 FROM public.uc_admission_cases WHERE organization_id=p_organization_id AND group_id=(scope->>'group_id')::uuid AND enrollment_id=(scope->>'enrollment_id')::uuid)THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
  INSERT INTO public.uc_admission_cases(organization_id,user_id,group_id,enrollment_id,course_id,program_ref,program_title,program_type,revision)SELECT p_organization_id,p_student_user_id,(scope->>'group_id')::uuid,(scope->>'enrollment_id')::uuid,(scope->>'course_id')::uuid,ref,public.uc_admission_trim(v.facts->>'full_title'),v.facts->>'program_type',1 FROM public.program_fact_versions v WHERE v.id=(ref->>'version_id')::uuid RETURNING * INTO c;
  ctx:=public.uc_admission_context(c.id,a,'mutation');
 ELSE
  SELECT * INTO c FROM public.uc_admission_cases WHERE id=c.id FOR UPDATE;
  IF c.revision<>(p_command->>'expected_revision')::bigint THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
  IF c.revision>=9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
  IF c.program_ref IS DISTINCT FROM p_command->'expected_program_ref'OR c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  IF act IN('review_local_rules','review_requirement','review_evidence','record_decision')AND c.responsible_id IS DISTINCT FROM a THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  ctx:=public.uc_admission_context(c.id,a,'mutation');
  UPDATE public.uc_admission_cases SET revision=revision+1,updated_at=clock_timestamp()WHERE id=c.id RETURNING * INTO c;
  reason:=coalesce(p_command->>'reason',p_command->>'review_reason');
  IF act='assign_responsible'THEN
   IF NOT public.uc_admission_staff_allowed((p_command->>'responsible_id')::uuid,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
   UPDATE public.uc_admission_cases SET responsible_id=(p_command->>'responsible_id')::uuid WHERE id=c.id;
  ELSIF act='review_local_rules'THEN
   IF NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
   IF jsonb_typeof(p_command->'sources')IS DISTINCT FROM 'array'OR jsonb_array_length(p_command->'sources')NOT BETWEEN 1 AND 3 OR jsonb_typeof(p_command->'requirements')IS DISTINCT FROM 'array'OR jsonb_array_length(p_command->'requirements')NOT BETWEEN 3 AND 50 THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   FOR source IN SELECT x FROM jsonb_array_elements(p_command->'sources')x LOOP
    IF NOT public.uc_admission_shape(source,ARRAY['document_id','version_id','review_id'])OR NOT public.uc_admission_uuid(source->'document_id')OR NOT public.uc_admission_uuid(source->'version_id')OR NOT public.uc_admission_uuid(source->'review_id')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
    PERFORM public.uc_admission_lock_rules(jsonb_build_array(source));d:=public.uc_admission_local_source(c.organization_id,source);IF d IS NULL THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;sources:=sources||jsonb_build_array(d);END LOOP;
   IF(SELECT count(DISTINCT x->>'document_id')FROM jsonb_array_elements(p_command->'sources')x)<>jsonb_array_length(sources)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   defs:=p_command->'requirements';IF(SELECT count(DISTINCT x->>'key')FROM jsonb_array_elements(defs)x)<>jsonb_array_length(defs)OR EXISTS(SELECT 1 FROM unnest(ARRAY['education_basis','application','contract_or_funding'])k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(defs)x WHERE x->>'kind'=k))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   FOR d IN SELECT x FROM jsonb_array_elements(defs)x LOOP
    IF NOT public.uc_education_admission_definition_shape(d,c.program_type)OR coalesce(jsonb_typeof(d->'key')='string'AND d->>'key'~'^[a-z0-9_]{1,64}$'AND d->>'kind'IN('education_basis','application','contract_or_funding','other_reviewed')AND d->>'exception_policy'IN('not_defined','local_reasoned_exception'),false)=false OR NOT public.uc_admission_text(d->'staff_label',160)OR NOT public.uc_admission_text(d->'provision',1000)OR NOT public.uc_admission_ids(d->'source_version_ids',1,3)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'source_version_ids')v WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sources)s WHERE s->'version_id'=v))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(defs)def WHERE def?'issuance_condition')AND(SELECT count(*)FROM jsonb_array_elements(defs)def WHERE def->>'kind'='education_basis')<>1 THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   new_rule:=gen_random_uuid();digest:=public.uc_program_hash(jsonb_build_object('program_ref',c.program_ref,'source_snapshots',sources,'definitions',defs));identities:=coalesce(c.reviews->'identities','{}');
   FOR d IN SELECT x FROM jsonb_array_elements(defs)x LOOP
    identity:=identities->(d->>'key');reqid:=coalesce((identity->>'id')::uuid,gen_random_uuid());rev:=coalesce((identity->>'revision')::bigint,0)+1;
    IF rev>9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;identities:=identities||jsonb_build_object(d->>'key',jsonb_build_object('id',reqid,'revision',rev));
    reqs:=reqs||jsonb_build_array(jsonb_build_object('id',reqid,'revision',rev,'rule_id',gen_random_uuid(),'rule_set_id',new_rule,'rule_set_digest',digest,'label',d->'staff_label','applicability','unknown','review_event_id',NULL,'evidence_version_ids','[]'::jsonb,'current_state','unknown','public_next_action','Обратитесь к ответственному сотруднику'));END LOOP;
   source:=public.uc_admission_authority(c.id,a);INSERT INTO public.uc_admission_rule_sets(id,case_id,organization_id,user_id,program_ref,digest,sources,source_snapshots,definitions,reviewer_id,authority_hash,authority_snapshot,review_reason)VALUES(new_rule,c.id,c.organization_id,c.user_id,c.program_ref,digest,p_command->'sources',sources,defs,a,public.uc_program_hash(source),source,reason);
   UPDATE public.uc_admission_cases SET rule_set_id=new_rule,requirements=reqs,reviews=jsonb_build_object('identities',identities,'requirements','{}'::jsonb,'evidence','{}'::jsonb)WHERE id=c.id;
  ELSIF act IN('review_requirement','review_evidence')THEN
   SELECT x INTO q FROM jsonb_array_elements(c.requirements)x WHERE x->>'id'=p_command->>'requirement_id';IF q IS NULL OR(q->>'revision')::bigint<>(p_command->>'expected_requirement_revision')::bigint THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
   IF NOT public.uc_admission_rules_current(c.id)THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
   IF act='review_requirement'THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_command->'evidence_version_ids')x WHERE NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=(x#>>'{}')::uuid AND e.case_id=c.id AND e.requirement_id=(q->>'id')::uuid AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id)))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
    IF p_command->'exception'<>'null'::jsonb THEN
     IF p_command->>'applicability'<>'applicable'OR p_command->'exception'->>'rule_id'<>q->>'rule_id'OR NOT EXISTS(SELECT 1 FROM public.uc_admission_rule_sets rs,jsonb_array_elements(rs.definitions)AS rule_definition(definition) WHERE rs.id=c.rule_set_id AND rule_definition.definition->>'exception_policy'='local_reasoned_exception'AND c.reviews->'identities'->(rule_definition.definition->>'key')->>'id'=q->>'id')OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_command->'exception'->'evidence_version_ids')x WHERE NOT p_command->'evidence_version_ids'@>jsonb_build_array(x))THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;END IF;
    SELECT coalesce(jsonb_agg(CASE WHEN x->>'id'=q->>'id'THEN x||jsonb_build_object('applicability',p_command->'applicability','review_event_id',event)ELSE x END),'[]')INTO reqs FROM jsonb_array_elements(c.requirements)x;
    PERFORM public.uc_education_admission_review_check(c.id,(q->>'id')::uuid,p_command->'issuance_evidence',p_command->'evidence_version_ids');
    review:=jsonb_build_object('actor_id',a,'reason',reason,'exception',p_command->'exception','event_id',event,'requirement_revision',q->'revision');
    IF EXISTS(SELECT 1 FROM public.uc_admission_rule_sets rs,jsonb_array_elements(rs.definitions)def WHERE rs.id=c.rule_set_id AND def?'issuance_condition'AND c.reviews->'identities'->(def->>'key')->>'id'=q->>'id')THEN review:=review||jsonb_build_object('issuance_evidence',p_command->'issuance_evidence');END IF;
    UPDATE public.uc_admission_cases SET requirements=reqs,reviews=jsonb_set(reviews,ARRAY['requirements',q->>'id'],review,true)WHERE id=c.id;
   ELSE
    eid:=(p_command->>'evidence_version_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=eid AND e.case_id=c.id AND e.requirement_id=(q->>'id')::uuid AND e.byte_sha256=p_command->>'byte_sha256'AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id))OR public.uc_admission_evidence_dto(eid,a)->>'availability'<>'available'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
    review:=jsonb_build_object('actor_id',a,'reason',reason,'event_id',event,'outcome',p_command->'outcome','requirement_revision',q->'revision');UPDATE public.uc_admission_cases SET reviews=jsonb_set(reviews,ARRAY['evidence',eid::text],review,true)WHERE id=c.id;
   END IF;
  ELSIF act='record_decision'THEN
   PERFORM public.uc_admission_lock_rules((SELECT rs.sources FROM public.uc_admission_rule_sets rs WHERE rs.id=c.rule_set_id));PERFORM public.uc_admission_refresh(c.id);SELECT * INTO c FROM public.uc_admission_cases WHERE id=c.id;
   IF c.rule_set_id IS DISTINCT FROM(p_command->>'rule_set_id')::uuid OR(SELECT rs.digest FROM public.uc_admission_rule_sets rs WHERE rs.id=c.rule_set_id)IS DISTINCT FROM p_command->>'rule_set_digest'OR public.uc_admission_requirements_digest(c.id)IS DISTINCT FROM p_command->>'requirements_digest'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
   IF NOT public.uc_admission_rules_current(c.id)THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
   IF p_command->>'outcome'='admitted'AND(jsonb_array_length(c.requirements)<3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.requirements)x WHERE x->>'applicability'='unknown'OR x->>'current_state'NOT IN('satisfied','exception_recorded')))THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
   SELECT coalesce(jsonb_agg(e.id ORDER BY e.id),'[]')INTO d FROM public.uc_admission_case_evidence e WHERE e.case_id=c.id AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id);
   IF public.uc_program_hash(d)<>public.uc_program_hash((SELECT coalesce(jsonb_agg(x ORDER BY x),'[]')FROM jsonb_array_elements(p_command->'evidence_version_ids')x))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
   UPDATE public.uc_admission_cases SET decision=jsonb_build_object('event_id',event,'case_revision',revision,'outcome',p_command->'outcome','recorded_at',clock_timestamp(),'responsible_id',a,'reason',reason,'program_ref',program_ref,'rule_set_id',rule_set_id,'requirements_digest',p_command->'requirements_digest','evidence_version_ids',p_command->'evidence_version_ids','authority_snapshot_hash',public.uc_program_hash(jsonb_build_array(a,public.uc_admission_scope(c.id),true)),'later_review_required',false)WHERE id=c.id;
  END IF;
 END IF;
 PERFORM public.uc_admission_refresh(c.id);receipt:=public.uc_admission_event(c.id,a,event,act,p_request_id,payload_digest,reason);
 DELETE FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=ctx AND kind='_context';RETURN public.uc_admission_result(c.id,a,receipt,false);
END;$function$;

CREATE FUNCTION public.uc_education_trusted_erasure(p_user uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='service_role'AND auth.uid()IS NULL AND current_setting('sintagma.account_deletion_erase_user',true)=p_user::text AND EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=p_user),false) $fn$;
CREATE FUNCTION public.uc_education_withdraw_state(p_org uuid,p_group uuid,p_enrollment uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE e public.enrollments;h public.uc_enrollment_withdrawal_states;ref jsonb;technical jsonb;groups jsonb;issued jsonb:='[]';g uuid;BEGIN
 IF NOT public.uc_education_withdraw_can(p_org,p_group,p_enrollment,false)AND NOT public.uc_education_withdraw_can(p_org,p_group,p_enrollment,true)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 SELECT x.*INTO STRICT e FROM public.enrollments x JOIN public.courses c ON c.id=x.course_id WHERE x.id=p_enrollment AND c.organization_id=p_org;SELECT *INTO h FROM public.uc_enrollment_withdrawal_states WHERE enrollment_id=e.id AND NOT redacted;
 SELECT coalesce(jsonb_agg(m.group_id ORDER BY m.group_id),'[]')INTO groups FROM public.student_group_memberships_effective m JOIN public.student_groups sg ON sg.id=m.group_id AND sg.organization_id=m.organization_id WHERE m.organization_id=p_org AND m.user_id=e.user_id AND sg.course_id=e.course_id;
 g:=p_group;IF g IS NULL AND jsonb_array_length(groups)=1 THEN g:=(groups->>0)::uuid;END IF;
 technical:=jsonb_build_object('status',e.status,'progress',e.progress,'time_spent',e.time_spent,'completed_at',e.completed_at,'started_at',e.started_at,'access_days',e.access_days,'expires_at',e.expires_at,'manual_credits',(SELECT coalesce(jsonb_agg(to_jsonb(c)ORDER BY c.id),'[]')FROM public.course_manual_credits c WHERE c.enrollment_id=e.id));
 ref:=jsonb_build_object('organization_id',p_org,'enrollment_id',e.id,'user_id',e.user_id,'course_id',e.course_id,'group_id',g,'revision',coalesce(h.revision,0),'source_hash',public.uc_program_hash(jsonb_build_object('organization_id',p_org,'scope_group_id',p_group,'enrollment_id',e.id,'user_id',e.user_id,'course_id',e.course_id,'groups',groups,'revision',coalesce(h.revision,0),'technical',technical)));
 IF public.uc_education_issue_can(p_org,p_group,e.id,e.user_id,e.course_id,'read')THEN SELECT coalesce(jsonb_agg(id ORDER BY id),'[]')INTO issued FROM public.education_document_records WHERE organization_id=p_org AND enrollment_id=e.id AND document_status='original';END IF;
 RETURN jsonb_build_object('ref',ref,'state',CASE WHEN h.enrollment_id IS NULL THEN 'active'ELSE 'withdrawn'END,'effective_date',h.effective_date,'recorded_at',h.recorded_at,'recorded_by',h.recorded_by,'basis',CASE WHEN h.enrollment_id IS NOT NULL THEN public.uc_education_issue_basis_projection(p_org,h.basis)END,
 'technical_status',e.status,'technical_progress',e.progress,'technical_completed_at',e.completed_at,'technical_time_spent',e.time_spent,'manual_credit_retained',EXISTS(SELECT 1 FROM public.course_manual_credits c WHERE c.enrollment_id=e.id AND c.revoked_at IS NULL),'original_record_ids',issued,'can_withdraw',h.enrollment_id IS NULL AND public.uc_education_withdraw_can(p_org,p_group,e.id,true));END;$fn$;
CREATE FUNCTION public.uc_education_withdraw_intent(p_org uuid,p_group uuid,p_intent jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE x jsonb;basis jsonb:=p_intent->'basis';items jsonb:='[]';state jsonb;ready boolean:=true;BEGIN
 IF NOT public.uc_admission_shape(p_intent,ARRAY['enrollment_ids','effective_date','basis'])OR NOT public.uc_admission_ids(p_intent->'enrollment_ids',1,100)OR NOT public.uc_copy_registry_date(p_intent->'effective_date')OR(p_intent->>'effective_date')::date>CURRENT_DATE OR NOT public.uc_admission_shape(basis,ARRAY['kind','source','provision','reason'])OR coalesce(basis->>'kind'IN('learner_request','organization_decision','contract_termination','other_reviewed'),false)=false OR NOT public.uc_admission_text(basis->'provision',1000)OR NOT public.uc_admission_text(basis->'reason',2000)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 PERFORM public.uc_education_issue_source(p_org,basis->'source',true);FOR x IN SELECT value FROM jsonb_array_elements(p_intent->'enrollment_ids')ORDER BY value LOOP state:=public.uc_education_withdraw_state(p_org,p_group,(x#>>'{}')::uuid);items:=items||jsonb_build_array(state);ready:=ready AND(state->>'can_withdraw')::boolean;END LOOP;
 RETURN jsonb_build_object('intent',p_intent,'preview_hash',public.uc_program_hash(jsonb_build_object('organization_id',p_org,'scope_group_id',p_group,'intent',p_intent,'refs',(SELECT coalesce(jsonb_agg(y->'ref'ORDER BY y->'ref'->>'enrollment_id'),'[]')FROM jsonb_array_elements(items)y))),'items',items,'ready',ready);END;$fn$;
CREATE FUNCTION public.uc_guard_retained_enrollment()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN IF public.uc_education_trusted_erasure(OLD.user_id)THEN RETURN NEW;END IF;
 PERFORM public.uc_education_issue_enrollment_fence(OLD.id,false);
 IF public.uc_enrollment_is_withdrawn(OLD.id)AND(to_jsonb(OLD)-'document_facts_revision')IS DISTINCT FROM(to_jsonb(NEW)-'document_facts_revision')THEN RAISE EXCEPTION 'retained_enrollment_is_immutable' USING ERRCODE='42501';END IF;RETURN NEW;END;$fn$;
CREATE TRIGGER uc_retained_enrollment_write BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.uc_guard_retained_enrollment();
CREATE FUNCTION public.uc_guard_retained_learner_activity()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE row_data jsonb;u uuid;c uuid;enrollment uuid;old_data jsonb;new_data jsonb;BEGIN
 IF TG_OP<>'INSERT'THEN old_data:=to_jsonb(OLD);END IF;IF TG_OP<>'DELETE'THEN new_data:=to_jsonb(NEW);END IF;
 FOR row_data IN SELECT x FROM unnest(ARRAY[old_data,new_data])x WHERE x IS NOT NULL LOOP
 IF TG_TABLE_NAME='course_manual_credits'THEN enrollment:=(row_data->>'enrollment_id')::uuid;SELECT user_id,course_id INTO u,c FROM public.enrollments WHERE id=enrollment;
 ELSE u:=coalesce(row_data->>'user_id',row_data->>'student_id')::uuid;c:=(row_data->>'course_id')::uuid;IF c IS NULL AND row_data->>'lesson_id'IS NOT NULL THEN SELECT course_id INTO c FROM public.lessons WHERE id=(row_data->>'lesson_id')::uuid;END IF;SELECT id INTO enrollment FROM public.enrollments WHERE user_id=u AND course_id=c;END IF;
 IF enrollment IS NOT NULL AND NOT public.uc_education_trusted_erasure(u)THEN PERFORM public.uc_education_issue_enrollment_fence(enrollment,false);END IF;
 IF enrollment IS NOT NULL AND public.uc_enrollment_is_withdrawn(enrollment)AND NOT public.uc_education_trusted_erasure(u)THEN
  -- Existing homework guard still validates reviewer authority. This is only
  -- a narrow exception for a non-self reviewer changing review fields.
  IF TG_TABLE_NAME='homework_submissions'AND TG_OP='UPDATE'AND auth.uid()IS DISTINCT FROM u AND auth.uid()IS NOT NULL
   AND(old_data-ARRAY['score','reviewer_id','reviewer_comment','status','reviewed_at'])=(new_data-ARRAY['score','reviewer_id','reviewer_comment','status','reviewed_at'])THEN CONTINUE;END IF;
  RAISE EXCEPTION 'retained_enrollment_learning_denied' USING ERRCODE='42501';END IF;END LOOP;
 IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;END;$fn$;
DO $guards$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['lesson_progress','test_attempts','test_attempt_sessions','homework_submissions','course_manual_credits','ai_tutor_sessions','course_access_log']LOOP
 EXECUTE format('CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_guard_retained_learner_activity()',t);END LOOP;END;$guards$;

CREATE OR REPLACE FUNCTION public.can_access_course_as_learner(_course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    JOIN public.profiles p
      ON p.user_id = e.user_id
     AND p.organization_id = c.organization_id
    WHERE e.user_id = auth.uid()
      AND e.course_id = _course_id
      AND e.status IN ('active', 'completed')
      AND NOT public.uc_enrollment_is_withdrawn(e.id)
      -- Keep the existing SINTAGMA enrollment contract: completion preserves
      -- course access even when the original access period has elapsed.
      AND (
        e.expires_at IS NULL
        OR e.expires_at > now()
        OR e.status = 'completed'
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.auto_complete_enrollment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.progress >= 100 AND NEW.status = 'active' AND NOT public.uc_enrollment_is_withdrawn(NEW.id) THEN
    NEW.status := 'completed';
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_own_course_enrollment(p_enrollment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_enrollment public.enrollments%ROWTYPE;
  v_total integer;
  v_completed integer;
  v_was_completed boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_enrollment
  FROM public.enrollments e
  WHERE e.id = p_enrollment_id
    AND e.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF public.uc_enrollment_is_withdrawn(v_enrollment.id) THEN RAISE EXCEPTION 'retained_enrollment_learning_denied' USING ERRCODE='42501';END IF;
  v_was_completed := v_enrollment.status = 'completed';

  -- Recover a passed test whose attempt was saved before progress failed.
  INSERT INTO public.lesson_progress (
    user_id, lesson_id, completed, completed_at
  )
  SELECT
    v_user_id, l.id, true, COALESCE(MAX(ta.completed_at), now())
  FROM public.lessons l
  JOIN public.test_attempts ta
    ON ta.lesson_id = l.id
   AND ta.user_id = v_user_id
   AND ta.max_score > 0
   AND COALESCE(ta.passed, (ta.score::numeric * 100 / ta.max_score::numeric) >= COALESCE(ta.passing_score, l.test_passing_score, 60))
  WHERE l.course_id = v_enrollment.course_id
    AND l.type = 'test'
  GROUP BY l.id
  ON CONFLICT (user_id, lesson_id)
  DO UPDATE SET
    completed = true,
    completed_at = COALESCE(public.lesson_progress.completed_at, EXCLUDED.completed_at);

  SELECT COUNT(*) INTO v_total
  FROM public.lessons l
  WHERE l.course_id = v_enrollment.course_id;

  SELECT COUNT(*) INTO v_completed
  FROM public.lesson_progress lp
  JOIN public.lessons l ON l.id = lp.lesson_id
  WHERE l.course_id = v_enrollment.course_id
    AND lp.user_id = v_user_id
    AND lp.completed = true;

  IF v_total = 0 OR v_completed < v_total THEN
    RAISE EXCEPTION 'course_incomplete:%/%', v_completed, v_total USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.enrollments e
  SET progress = 100,
      status = 'completed',
      completed_at = COALESCE(e.completed_at, now())
  WHERE e.id = p_enrollment_id
  RETURNING * INTO v_enrollment;

  RETURN jsonb_build_object(
    'id', v_enrollment.id,
    'status', v_enrollment.status,
    'progress', v_enrollment.progress,
    'completed_at', v_enrollment.completed_at,
    'was_already_completed', v_was_completed
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_enrollment_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_course_id uuid;
  v_user_id uuid;
  v_total int;
  v_done int;
  v_progress int;
BEGIN
  -- Определяем урок (для DELETE берём OLD)
  IF TG_OP = 'DELETE' THEN
    SELECT course_id INTO v_course_id FROM lessons WHERE id = OLD.lesson_id;
    v_user_id := OLD.user_id;
  ELSE
    SELECT course_id INTO v_course_id FROM lessons WHERE id = NEW.lesson_id;
    v_user_id := NEW.user_id;
  END IF;

  IF v_course_id IS NULL OR v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Считаем общее количество уроков и пройденных
  SELECT COUNT(*) INTO v_total FROM lessons WHERE course_id = v_course_id;
  IF v_total = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*) INTO v_done
  FROM lesson_progress lp
  JOIN lessons l ON l.id = lp.lesson_id
  WHERE l.course_id = v_course_id
    AND lp.user_id = v_user_id
    AND lp.completed = true;

  v_progress := LEAST(100, GREATEST(0, (v_done * 100) / v_total));

  -- Обновляем enrollment, если он существует и прогресс изменился в большую сторону
  -- (не уменьшаем прогресс автоматически, чтобы не откатывать ручные правки)
  UPDATE enrollments
  SET progress = v_progress
  WHERE user_id = v_user_id
    AND course_id = v_course_id
    AND progress < v_progress
    AND NOT public.uc_enrollment_is_withdrawn(enrollments.id);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_enrollment_time(p_enrollment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.enrollments e
  SET time_spent = COALESCE((
    SELECT SUM(lp.time_spent)
    FROM public.lesson_progress lp
    JOIN public.lessons l ON l.id = lp.lesson_id
    WHERE l.course_id = e.course_id AND lp.user_id = e.user_id
  ), 0)
  WHERE e.id = p_enrollment_id AND NOT public.uc_enrollment_is_withdrawn(e.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.uc_learning_access(p_org uuid, p_scope jsonb, p_write boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE u uuid:=auth.uid();BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.uc_learning_person(u) OR NOT public.account_deletion_access_allowed() OR NOT public.uc_learning_scope_valid(p_org,p_scope) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 IF p_write AND public.uc_enrollment_is_withdrawn((p_scope->>'enrollment_id')::uuid)THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 IF NOT p_write AND u=(p_scope->>'user_id')::uuid THEN
  IF NOT coalesce(public.can_access_course_as_learner((p_scope->>'course_id')::uuid),false) OR NOT coalesce(public._paid_20260922_course_read((p_scope->>'course_id')::uuid,true),false) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
  RETURN 'learner';
 END IF;
 IF u=(p_scope->>'user_id')::uuid OR NOT public.uc_learning_staff(u,p_org,(p_scope->>'group_id')::uuid,p_write) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 RETURN 'staff';
END;$function$;

CREATE OR REPLACE FUNCTION public.auto_create_education_document()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 -- Technical completion is not an attestation or an official issuance action.
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.uc_guard_enrollment_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF public.uc_education_trusted_erasure(OLD.user_id)THEN RETURN OLD;END IF;
 RAISE EXCEPTION 'enrollment_retained_withdrawal_required' USING ERRCODE='42501';
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_course_assignment(p_enrollment_id uuid, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET lock_timeout TO '3s'
AS $function$
BEGIN
 RAISE EXCEPTION 'enrollment_retained_withdrawal_required' USING ERRCODE='42501';
END;
$function$;

CREATE FUNCTION public.uc_education_retained_learning_summary(p_org uuid,p_query jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE u uuid:=auth.uid();e public.enrollments;w public.uc_enrollment_withdrawal_states;d record;items jsonb:='[]';after_id uuid;last_id uuid;n integer:=0;lim integer;BEGIN
 IF NOT public.uc_learning_shape(p_query,ARRAY['kind','enrollment_id','after_decision_id','limit'])OR p_query->>'kind'<>'retained_summary'OR NOT public.uc_learning_uuid(p_query->'enrollment_id')OR NOT(p_query->'after_decision_id'='null'::jsonb OR public.uc_learning_uuid(p_query->'after_decision_id'))OR jsonb_typeof(p_query->'limit')IS DISTINCT FROM 'number'OR p_query->>'limit'!~'^[1-9][0-9]?$'THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;lim:=(p_query->>'limit')::integer;IF lim>50 THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;after_id:=(p_query->>'after_decision_id')::uuid;
 IF auth.role()IS DISTINCT FROM 'authenticated'OR NOT public.uc_learning_person(u)OR NOT public.account_deletion_access_allowed()THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_education_issue_fence(p_org,NULL,ARRAY[u],NULL);
 SELECT x.*INTO e FROM public.enrollments x JOIN public.courses c ON c.id=x.course_id JOIN public.profiles p ON p.user_id=x.user_id AND p.organization_id=c.organization_id WHERE x.id=(p_query->>'enrollment_id')::uuid AND x.user_id=u AND c.organization_id=p_org;
 SELECT *INTO w FROM public.uc_enrollment_withdrawal_states WHERE enrollment_id=e.id AND user_id=u AND organization_id=p_org AND NOT redacted;
 IF e.id IS NULL OR w.enrollment_id IS NULL THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 -- Stored personal summary only: no live evaluation, licensed material or proof refs.
 FOR d IN SELECT a.id,a.outcome,a.learner_summary,a.recorded_at,a.supersedes_id FROM public.uc_learning_attestation_decisions a JOIN public.uc_learning_outcome_states s ON s.id=a.state_id WHERE s.organization_id=p_org AND s.enrollment_id=e.id AND s.user_id=u AND s.course_id=e.course_id AND a.organization_id=p_org AND a.user_id=u AND NOT a.redacted AND(after_id IS NULL OR a.id>after_id)ORDER BY a.id LIMIT lim+1 LOOP n:=n+1;EXIT WHEN n>lim;items:=items||jsonb_build_array(to_jsonb(d));last_id:=d.id;END LOOP;
 RETURN jsonb_build_object('schema_version',1,'kind','retained_summary','organization_id',p_org,'user_id',u,'enrollment_id',e.id,'course_id',e.course_id,'withdrawal',jsonb_build_object('effective_date',w.effective_date,'recorded_at',w.recorded_at),'technical',jsonb_build_object('status',e.status,'progress',e.progress,'completed_at',e.completed_at),'decisions',items,'next_after_decision_id',CASE WHEN n>lim THEN last_id END);END;$fn$;

CREATE OR REPLACE FUNCTION public.read_learning_outcome(p_organization_id uuid, p_query jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE u uuid:=auth.uid();target uuid;course uuid;enrollment uuid;after_id uuid;lim integer;sn record;rows jsonb:='[]';n integer:=0;last_id uuid;proof jsonb;versions jsonb;BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.uc_learning_person(u) OR NOT public.account_deletion_access_allowed() THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 IF p_query->>'kind'='retained_summary'THEN RETURN public.uc_education_retained_learning_summary(p_organization_id,p_query);
 ELSIF p_query->>'kind'='outcome' THEN
  IF NOT public.uc_learning_shape(p_query,ARRAY['kind','scope']) THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  RETURN public.uc_learning_envelope(p_organization_id,p_query->'scope');
 ELSIF p_query->>'kind'='associations' THEN
  IF NOT public.uc_learning_shape(p_query,ARRAY['kind','user_id','course_id','enrollment_id','after_snapshot_id','limit']) OR NOT public.uc_learning_uuid(p_query->'user_id') OR NOT public.uc_learning_uuid(p_query->'course_id') OR NOT public.uc_learning_uuid(p_query->'enrollment_id') OR NOT(p_query->'after_snapshot_id'='null'::jsonb OR public.uc_learning_uuid(p_query->'after_snapshot_id')) OR jsonb_typeof(p_query->'limit') IS DISTINCT FROM 'number' OR p_query->>'limit'!~'^[1-9][0-9]?$' THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  lim:=(p_query->>'limit')::integer;IF lim>50 THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  target:=(p_query->>'user_id')::uuid;course:=(p_query->>'course_id')::uuid;enrollment:=(p_query->>'enrollment_id')::uuid;after_id:=(p_query->>'after_snapshot_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=enrollment AND e.user_id=target AND e.course_id=course AND c.organization_id=p_organization_id AND e.status NOT IN('cancelled','revoked'))
   OR NOT(target=u AND public.can_access_course_as_learner(course) AND public._paid_20260922_course_read(course,true) OR target<>u AND(public.uc_learning_staff(u,p_organization_id,NULL,false) OR EXISTS(SELECT 1 FROM public.student_group_memberships_effective g WHERE g.user_id=target AND g.organization_id=p_organization_id AND public.uc_learning_staff(u,p_organization_id,g.group_id,false)))) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
  FOR sn IN SELECT s.id,public.uc_learning_scope(s.id)scope FROM public.group_program_enrollment_snapshots s
   WHERE s.organization_id=p_organization_id AND s.enrollment_id=enrollment AND s.user_id=target AND s.course_id=course AND(after_id IS NULL OR s.id>after_id)
    AND public.uc_learning_scope_valid(p_organization_id,public.uc_learning_scope(s.id)) AND(target=u OR public.uc_learning_staff(u,p_organization_id,s.group_id,false)) ORDER BY s.id LIMIT lim+1
  LOOP
   n:=n+1;EXIT WHEN n>lim;rows:=rows||jsonb_build_array(public.uc_learning_envelope(p_organization_id,sn.scope));last_id:=sn.id;
  END LOOP;
  RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'user_id',target,'course_id',course,'enrollment_id',enrollment,'associations',rows,'next_after_snapshot_id',CASE WHEN n>lim THEN last_id END);
 ELSIF p_query->>'kind'='criteria' THEN
  IF NOT public.uc_learning_shape(p_query,ARRAY['kind','course_id','program_version_id']) OR NOT public.uc_learning_uuid(p_query->'course_id') OR NOT public.uc_learning_uuid(p_query->'program_version_id') THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  IF NOT public.uc_learning_staff(u,p_organization_id,NULL,false) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
  course:=(p_query->>'course_id')::uuid;target:=(p_query->>'program_version_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=course AND organization_id=p_organization_id) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
  proof:=public.uc_learning_programme_proof(p_organization_id,target);
  IF(SELECT count(*) FROM public.uc_learning_criteria_versions WHERE organization_id=p_organization_id AND course_id=course AND program_version_id=target AND NOT redacted)>50 THEN PERFORM public.uc_learning_error('LIMIT_EXCEEDED');END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(v)-'participant_ids' ORDER BY v.created_at DESC,v.id DESC),'[]') INTO versions FROM public.uc_learning_criteria_versions v WHERE v.organization_id=p_organization_id AND v.course_id=course AND v.program_version_id=target AND NOT v.redacted;
  RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'course_id',course,'program_version_id',target,'programme_proof',proof,'versions',versions,'capabilities',jsonb_build_object('can_save',public.uc_learning_staff(u,p_organization_id,NULL,true)));
 ELSIF p_query->>'kind' IN('options','decision_options') THEN RETURN public.uc_learning_options(p_organization_id,p_query);
 ELSE PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
END;$function$;

CREATE FUNCTION public.uc_education_issue_admission(p_org uuid,p_group uuid,p_enrollment uuid,p_program jsonb,p_program_type text)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;s jsonb;rs public.uc_admission_rule_sets;def jsonb;q jsonb;review jsonb;dto jsonb;e jsonb;refs jsonb:='[]';final_refs jsonb:='[]';final_proof jsonb;ref jsonb;req uuid;BEGIN
 SELECT *INTO c FROM public.uc_admission_cases WHERE organization_id=p_org AND group_id=p_group AND enrollment_id=p_enrollment;
 IF c.id IS NULL OR NOT public.uc_admission_staff_allowed(auth.uid(),p_org,c.user_id,p_group,p_enrollment,false)THEN RETURN jsonb_build_object('code','ADMISSION_UNAVAILABLE','ref',NULL);END IF;
 s:=public.uc_admission_state(c.id,auth.uid(),false);IF c.program_ref IS DISTINCT FROM p_program THEN RETURN jsonb_build_object('code','ADMISSION_REVIEW_REQUIRED','ref',NULL);END IF;
 IF s->'decision'IS NULL OR s->'decision'='null'::jsonb OR s->'decision'->>'outcome'IS DISTINCT FROM 'admitted'THEN RETURN jsonb_build_object('code','ADMISSION_NOT_CONFIRMED','ref',NULL);END IF;
 IF s->'decision'->'later_review_required'IS DISTINCT FROM 'false'::jsonb OR NOT public.uc_admission_rules_current(c.id)THEN RETURN jsonb_build_object('code','ADMISSION_REVIEW_REQUIRED','ref',NULL);END IF;
 SELECT *INTO rs FROM public.uc_admission_rule_sets WHERE id=c.rule_set_id AND NOT authority_redacted;
 IF rs.id IS NULL OR(SELECT count(*)FROM jsonb_array_elements(rs.definitions)x WHERE x->>'kind'='education_basis')<>1 THEN RETURN jsonb_build_object('code','FINAL_ISSUANCE_CONDITION_UNCONFIRMED','ref',NULL);END IF;
 SELECT x INTO def FROM jsonb_array_elements(rs.definitions)x WHERE x->>'kind'='education_basis';req:=(c.reviews->'identities'->(def->>'key')->>'id')::uuid;SELECT x INTO q FROM jsonb_array_elements(s->'requirements')x WHERE x->>'id'=req::text;review:=c.reviews->'requirements'->req::text;
 IF NOT def?'issuance_condition'OR NOT public.uc_education_admission_definition_shape(def,p_program_type)OR(p_program_type IN('dpo_upskilling','dpo_retraining')AND def->'issuance_condition'->>'kind'IS DISTINCT FROM 'primary_education_before_qualification')THEN RETURN jsonb_build_object('code','FINAL_ISSUANCE_CONDITION_UNCONFIRMED','ref',NULL);END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(c.decision->'evidence_version_ids')ORDER BY value LOOP
  dto:=public.uc_admission_evidence_dto((e#>>'{}')::uuid,auth.uid());IF dto->>'case_id'IS DISTINCT FROM c.id::text OR dto->>'availability'IS DISTINCT FROM 'available'OR dto->>'review'IS DISTINCT FROM 'accepted'OR dto->'can_read_bytes'IS DISTINCT FROM 'true'::jsonb OR NOT public.uc_admission_uuid(dto->'review_event_id')OR EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=(e#>>'{}')::uuid)THEN RETURN jsonb_build_object('code','ADMISSION_SOURCE_UNAVAILABLE','ref',NULL);END IF;
  refs:=refs||jsonb_build_array(jsonb_build_object('evidence_id',dto->'id','requirement_id',dto->'requirement_id','review_event_id',dto->'review_event_id','byte_sha256',dto->'byte_sha256','byte_size',dto->'byte_size'));END LOOP;
 IF def->'issuance_condition'->>'kind'='primary_education_before_qualification'THEN
  IF review->'issuance_evidence'IS NULL OR review->'issuance_evidence'='null'::jsonb OR NOT public.uc_education_admission_evidence_shape(review->'issuance_evidence')OR review->'requirement_revision'IS DISTINCT FROM q->'revision'OR NOT public.uc_admission_uuid(review->'event_id')THEN RETURN jsonb_build_object('code','PRIMARY_EDUCATION_EVIDENCE_REQUIRED','ref',NULL);END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(review->'issuance_evidence'->'evidence_version_ids')ORDER BY value LOOP SELECT x INTO dto FROM jsonb_array_elements(refs)x WHERE x->'evidence_id'=e AND x->>'requirement_id'=req::text;IF dto IS NULL THEN RETURN jsonb_build_object('code','PRIMARY_EDUCATION_EVIDENCE_REQUIRED','ref',NULL);END IF;final_refs:=final_refs||jsonb_build_array(dto);END LOOP;
  final_proof:=jsonb_build_object('requirement_id',req,'requirement_revision',q->'revision','review_event_id',review->'event_id','education_level',review->'issuance_evidence'->'education_level','evidence_refs',final_refs);
 END IF;
 ref:=jsonb_build_object('case_id',c.id,'scope',public.uc_admission_scope(c.id),'revision',c.revision,'decision_event_id',c.decision->'event_id','decision_case_revision',c.decision->'case_revision','program_ref',c.program_ref,'rule_set_id',c.rule_set_id,'rule_set_digest',rs.digest,'requirements_digest',public.uc_admission_requirements_digest(c.id),'evidence_refs',refs,'final_education_proof',final_proof);
 RETURN jsonb_build_object('code',NULL,'ref',ref||jsonb_build_object('source_hash',public.uc_program_hash(ref)));END;$fn$;
CREATE FUNCTION public.uc_education_issue_block(p_code text)RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('code',p_code,'label',CASE p_code WHEN 'WITHDRAWN'THEN 'Обучение прекращено; прошлые результаты сохранены'WHEN 'ALREADY_ISSUED'THEN 'Документ уже существует; используйте его историю или дубликат'WHEN 'PRIMARY_EDUCATION_EVIDENCE_REQUIRED'THEN 'До выдачи нужен проверенный документ о завершённом СПО или ВО'WHEN 'FINAL_ISSUANCE_CONDITION_UNCONFIRMED'THEN 'Условия выдачи по основанию образования ещё не подтверждены'WHEN 'ATTESTATION_NOT_PASSED'THEN 'Нет действующего положительного решения итоговой аттестации'WHEN 'IDENTITY_DETAILS_INCOMPLETE'THEN 'Проверьте ФИО и дату рождения в личном деле'ELSE 'Нужно подтвердить текущую программу, допуск и итоговый результат'END,
 'next_action',CASE WHEN p_code IN('ADMISSION_UNAVAILABLE','ADMISSION_NOT_CONFIRMED','ADMISSION_REVIEW_REQUIRED','ADMISSION_SOURCE_UNAVAILABLE')THEN 'open_admission'WHEN p_code IN('PRIMARY_EDUCATION_EVIDENCE_REQUIRED','FINAL_ISSUANCE_CONDITION_UNCONFIRMED')THEN 'review_final_education'WHEN p_code='IDENTITY_DETAILS_INCOMPLETE'THEN 'review_registration'WHEN p_code='ALREADY_ISSUED'THEN 'open_existing_record'WHEN p_code IN('OUTCOME_UNAVAILABLE','ATTESTATION_NOT_PASSED','ATTESTATION_REVIEW_REQUIRED')THEN 'open_outcome'WHEN p_code IN('PROGRAM_UNCONFIRMED','PROGRAM_CHANGED')THEN 'confirm_programme'WHEN p_code='ASSOCIATION_UNAVAILABLE'THEN 'select_exact_association'ELSE 'contact_authorized_staff'END) $fn$;
CREATE FUNCTION public.uc_education_issue_candidate(p_org uuid,p_scope_group uuid,p_enrollment uuid,p_lock boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE e public.enrollments;g uuid;groups uuid[];program jsonb;facts jsonb;program_type text;doc_type text;existing uuid;num_existing integer;code text;outcome_scope jsonb;outcome jsonb;outcome_ref jsonb;admission jsonb;identity_ref jsonb;ref jsonb;full_name text;birth date;label text;BEGIN
 SELECT x.*INTO e FROM public.enrollments x JOIN public.courses c ON c.id=x.course_id WHERE x.id=p_enrollment AND c.organization_id=p_org;IF e.id IS NULL THEN RETURN NULL;END IF;
 SELECT array_agg(m.group_id ORDER BY m.group_id)INTO groups FROM public.student_group_memberships_effective m JOIN public.student_groups sg ON sg.id=m.group_id AND sg.organization_id=m.organization_id WHERE m.organization_id=p_org AND m.user_id=e.user_id AND sg.course_id=e.course_id AND(p_scope_group IS NULL OR m.group_id=p_scope_group);
 IF p_scope_group IS NOT NULL THEN IF NOT p_scope_group=ANY(coalesce(groups,'{}'))THEN RETURN NULL;END IF;g:=p_scope_group;ELSIF cardinality(groups)=1 THEN g:=groups[1];END IF;
 IF NOT public.uc_education_issue_can(p_org,p_scope_group,e.id,e.user_id,e.course_id,'read')OR NOT public.uc_education_issue_can(p_org,p_scope_group,e.id,e.user_id,e.course_id,'issue')THEN RETURN NULL;END IF;
 IF p_lock THEN PERFORM public.uc_education_issue_enrollment_fence(e.id,true);PERFORM 1 FROM public.enrollments WHERE id=e.id FOR UPDATE;PERFORM 1 FROM public.profiles WHERE user_id=e.user_id AND organization_id=p_org FOR SHARE;PERFORM 1 FROM public.student_frdo_data WHERE user_id=e.user_id AND organization_id=p_org FOR SHARE;END IF;
 SELECT nullif(btrim(p.full_name),'')INTO full_name FROM public.profiles p WHERE p.user_id=e.user_id AND p.organization_id=p_org;SELECT d.birth_date INTO birth FROM public.student_frdo_data d WHERE d.user_id=e.user_id AND d.organization_id=p_org;label:=coalesce(full_name,'Ученик');
 IF public.uc_enrollment_is_withdrawn(e.id)THEN code:='WITHDRAWN';ELSIF g IS NULL THEN code:='ASSOCIATION_UNAVAILABLE';END IF;
 SELECT count(*)::integer,min(id::text)::uuid INTO num_existing,existing FROM public.education_document_records WHERE organization_id=p_org AND enrollment_id=e.id AND document_status='original';IF num_existing>1 THEN existing:=NULL;END IF;IF code IS NULL AND num_existing>0 THEN code:='ALREADY_ISSUED';END IF;
 IF code IS NULL THEN program:=public.uc_admission_program(p_org,e.user_id,g,e.id);IF program IS NULL THEN code:='PROGRAM_UNCONFIRMED';ELSE SELECT f.facts INTO facts FROM public.program_fact_versions f WHERE f.id=(program->>'version_id')::uuid;program_type:=facts->>'program_type';doc_type:=CASE program_type WHEN 'dpo_upskilling'THEN 'certificate'WHEN 'dpo_retraining'THEN 'diploma'WHEN 'professional_training'THEN 'qualification'ELSE NULL END;IF doc_type IS NULL THEN code:='UNSUPPORTED_PROGRAM_TYPE';END IF;END IF;END IF;
 IF code IS NULL AND p_lock THEN
  PERFORM public.uc_program_issuance_source(p_org,g,e.id,e.user_id,e.course_id);
  PERFORM 1 FROM public.uc_admission_cases WHERE organization_id=p_org AND group_id=g AND enrollment_id=e.id FOR SHARE;
  PERFORM 1 FROM public.uc_admission_rule_sets WHERE case_id IN(SELECT id FROM public.uc_admission_cases WHERE organization_id=p_org AND group_id=g AND enrollment_id=e.id)FOR SHARE;
  PERFORM 1 FROM public.uc_admission_case_evidence WHERE case_id IN(SELECT id FROM public.uc_admission_cases WHERE organization_id=p_org AND group_id=g AND enrollment_id=e.id)FOR SHARE;
  PERFORM 1 FROM public.uc_learning_outcome_states WHERE program_enrollment_snapshot_id=(program->>'enrollment_snapshot_id')::uuid FOR SHARE;
  PERFORM 1 FROM public.uc_learning_criteria_versions WHERE id IN(SELECT criteria_id FROM public.uc_learning_outcome_states WHERE program_enrollment_snapshot_id=(program->>'enrollment_snapshot_id')::uuid)FOR SHARE;
  PERFORM 1 FROM public.uc_learning_attestation_decisions WHERE id IN(SELECT decision_id FROM public.uc_learning_outcome_states WHERE program_enrollment_snapshot_id=(program->>'enrollment_snapshot_id')::uuid)FOR SHARE;
 END IF;
 IF code IS NULL THEN
  outcome_scope:=jsonb_build_object('organization_id',p_org,'group_id',g,'user_id',e.user_id,'course_id',e.course_id,'enrollment_id',e.id,'program_enrollment_snapshot_id',program->'enrollment_snapshot_id','program_version_id',program->'version_id');
  BEGIN outcome:=public.uc_learning_envelope(p_org,outcome_scope);EXCEPTION WHEN insufficient_privilege THEN outcome:=NULL;END;
  IF outcome IS NULL THEN code:='OUTCOME_UNAVAILABLE';ELSIF outcome->'last_decision'IS NULL OR outcome->'last_decision'='null'::jsonb OR outcome->'last_decision'->>'outcome'IS DISTINCT FROM 'passed'THEN code:='ATTESTATION_NOT_PASSED';
  ELSIF outcome->>'decision_relation'IS DISTINCT FROM 'current_inputs'OR outcome->'machine'IS NULL OR outcome->'machine'='null'::jsonb OR outcome->'machine'->'source_fresh'IS DISTINCT FROM 'true'::jsonb OR outcome->'last_decision'->'machine_result_id'IS DISTINCT FROM outcome->'machine'->'id'THEN code:='ATTESTATION_REVIEW_REQUIRED';
  ELSIF outcome->'last_decision'->>'basis'='machine'AND outcome->'machine'->>'eligibility'IS DISTINCT FROM 'eligible'THEN code:='ATTESTATION_NOT_PASSED';
  ELSE outcome_ref:=jsonb_build_object('scope',outcome_scope,'revision',outcome->'revision','criteria_ref',outcome->'criteria_ref','machine_result_id',outcome->'machine'->'id','machine_input_hash',outcome->'machine'->'input_hash','decision_id',outcome->'last_decision'->'id','decision_basis',outcome->'last_decision'->'basis');outcome_ref:=outcome_ref||jsonb_build_object('source_hash',public.uc_program_hash(outcome_ref));END IF;
 END IF;
 IF code IS NULL THEN admission:=public.uc_education_issue_admission(p_org,g,e.id,program,program_type);code:=admission->>'code';END IF;
 IF code IS NULL AND(full_name IS NULL OR birth IS NULL)THEN code:='IDENTITY_DETAILS_INCOMPLETE';END IF;
 IF code IS NULL THEN identity_ref:=jsonb_build_object('user_id',e.user_id,'registration_hash',public.uc_program_hash(jsonb_build_object('organization_id',p_org,'user_id',e.user_id,'full_name',full_name,'birth_date',birth)),'source','current_student_registration');
 ref:=jsonb_build_object('organization_id',p_org,'group_id',g,'enrollment_id',e.id,'user_id',e.user_id,'course_id',e.course_id,'program_ref',program,'outcome_ref',outcome_ref,'admission_ref',admission->'ref','identity_ref',identity_ref,'withdrawal_revision',0);ref:=ref||jsonb_build_object('source_hash',public.uc_program_hash(ref));END IF;
 RETURN jsonb_build_object('enrollment_id',e.id,'user_id',e.user_id,'course_id',e.course_id,'group_id',g,'learner_label',left(label,500),'technical_status',e.status,'technical_progress',e.progress,'withdrawal_revision',(SELECT coalesce(max(revision),0)FROM public.uc_enrollment_withdrawal_states WHERE enrollment_id=e.id AND NOT redacted),'withdrawn',public.uc_enrollment_is_withdrawn(e.id),'document_type',doc_type,'existing_original_record_id',existing,'eligibility_ref',ref,'blockers',CASE WHEN code IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(public.uc_education_issue_block(code))END);END;$fn$;

CREATE FUNCTION public.uc_education_issue_enrollment_fence(p_enrollment uuid,p_exclusive boolean DEFAULT false)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ok boolean;BEGIN IF p_enrollment IS NULL THEN RETURN;END IF;IF p_exclusive THEN ok:=pg_try_advisory_xact_lock(hashtextextended('uc_education_enrollment:'||p_enrollment::text,0));ELSE ok:=pg_try_advisory_xact_lock_shared(hashtextextended('uc_education_enrollment:'||p_enrollment::text,0));END IF;IF NOT ok THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;END;$fn$;

CREATE FUNCTION public.uc_education_issue_proof_visible(p_proof jsonb)RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a jsonb:=p_proof->'admission_ref';c public.uc_admission_cases;e jsonb;dto jsonb;BEGIN
 IF p_proof IS NULL OR p_proof='null'::jsonb OR NOT public.uc_education_issue_actor()THEN RETURN false;END IF;
 SELECT *INTO c FROM public.uc_admission_cases WHERE id=(a->>'case_id')::uuid AND organization_id=(p_proof->>'organization_id')::uuid AND user_id=(p_proof->>'user_id')::uuid AND group_id=(p_proof->>'group_id')::uuid AND enrollment_id=(p_proof->>'enrollment_id')::uuid;
 IF c.id IS NULL OR NOT public.uc_admission_staff_allowed(auth.uid(),c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)OR NOT public.uc_learning_staff(auth.uid(),c.organization_id,c.group_id,false)THEN RETURN false;END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(a->'evidence_refs')LOOP dto:=public.uc_admission_evidence_dto((e->>'evidence_id')::uuid,auth.uid());IF dto IS NULL OR dto->>'case_id'IS DISTINCT FROM c.id::text OR dto->'can_read_bytes'IS DISTINCT FROM 'true'::jsonb OR dto->>'availability'IS DISTINCT FROM 'available'OR dto->'byte_sha256'IS DISTINCT FROM e->'byte_sha256'OR dto->'byte_size'IS DISTINCT FROM e->'byte_size'THEN RETURN false;END IF;END LOOP;
 RETURN true;END;$fn$;
CREATE FUNCTION public.uc_education_issue_handover_projection(p_org uuid,p_handover jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE out jsonb:=p_handover;BEGIN IF p_handover IS NULL OR p_handover='null'::jsonb THEN RETURN NULL;END IF;
 IF p_handover?'evidence'THEN out:=jsonb_set(out,'{evidence}',public.uc_education_issue_source_projection(p_org,p_handover->'evidence'));END IF;
 IF p_handover?'authorization'THEN out:=jsonb_set(out,'{authorization}',public.uc_education_issue_source_projection(p_org,p_handover->'authorization'));END IF;RETURN out;END;$fn$;
CREATE FUNCTION public.uc_education_issue_artifact_projection(p_org uuid,p_artifact jsonb,p_legacy boolean)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN IF p_legacy OR p_artifact IS NULL OR p_artifact='null'::jsonb THEN RETURN jsonb_build_object('artifact',NULL,'availability','legacy_unverified');END IF;
 IF public.uc_education_issue_source(p_org,p_artifact->'source',false)IS NULL THEN RETURN jsonb_build_object('artifact',NULL,'availability','currently_unavailable');END IF;
 RETURN jsonb_build_object('artifact',p_artifact,'availability','available');END;$fn$;
CREATE FUNCTION public.uc_education_issue_state_hash(p_record uuid)RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE r public.education_document_records;s public.uc_education_issuance_states;BEGIN SELECT *INTO r FROM public.education_document_records WHERE id=p_record;IF r.id IS NULL THEN RETURN NULL;END IF;SELECT *INTO s FROM public.uc_education_issuance_states WHERE record_id=r.id;
 RETURN public.uc_program_hash(jsonb_build_object('official',to_jsonb(r)-'deleted_by','revision',coalesce(s.revision,0),'original_record_id',s.original_record_id,'proof',s.proof,'artifact',s.artifact,'frdo_facts',s.frdo_facts,'notes',coalesce(s.notes,r.notes,''),'annulment',s.annulment-'actor_id','latest_handover',s.latest_handover-'recorded_by'));END;$fn$;
CREATE FUNCTION public.uc_education_issue_record(p_org uuid,p_scope_group uuid,p_record uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE r public.education_document_records;s public.uc_education_issuance_states;caps jsonb;proof jsonb;proof_available boolean;handover jsonb;annulment jsonb;legacy boolean;BEGIN
 SELECT *INTO r FROM public.education_document_records WHERE id=p_record AND organization_id=p_org AND deleted_at IS NULL;
 IF r.id IS NULL OR(p_scope_group IS NOT NULL AND r.group_id IS NULL AND r.enrollment_id IS NULL)OR(p_scope_group IS NOT NULL AND r.group_id IS NOT NULL AND r.group_id<>p_scope_group)OR NOT public.uc_education_issue_can(p_org,coalesce(p_scope_group,r.group_id),r.enrollment_id,r.user_id,r.course_id,'read')THEN RETURN NULL;END IF;
 SELECT *INTO s FROM public.uc_education_issuance_states WHERE record_id=r.id;IF coalesce(s.redacted,false)THEN RETURN NULL;END IF;
 legacy:=s.proof IS NULL;proof_available:=NOT legacy AND public.uc_education_issue_proof_visible(s.proof);IF proof_available THEN proof:=s.proof;END IF;
 caps:=public.uc_education_issue_caps(p_org,coalesce(p_scope_group,r.group_id),r.enrollment_id,r.user_id,r.course_id);
 caps:=caps||jsonb_build_object('can_issue_duplicate',NOT legacy AND r.document_status='original'AND s.annulment IS NULL AND public.uc_education_issue_source(p_org,s.artifact->'source',false)IS NOT NULL AND(caps->>'can_issue_duplicate')::boolean,'can_record_handover',s.annulment IS NULL AND(caps->>'can_record_handover')::boolean,'can_annul',s.annulment IS NULL AND(caps->>'can_annul')::boolean);
 IF s.latest_handover IS NOT NULL THEN handover:=jsonb_set(s.latest_handover,'{fact}',public.uc_education_issue_handover_projection(p_org,s.latest_handover->'fact'));END IF;
 IF s.annulment IS NOT NULL THEN annulment:=jsonb_set(s.annulment,'{basis}',public.uc_education_issue_basis_projection(p_org,s.annulment->'basis'));END IF;
 RETURN jsonb_build_object('official',to_jsonb(r)-'deleted_by','revision',coalesce(s.revision,0),'state_hash',public.uc_education_issue_state_hash(r.id),'provenance',CASE WHEN legacy THEN 'legacy_unverified'ELSE 'controlled_issuance'END,'lifecycle',CASE WHEN s.annulment IS NULL THEN 'active'ELSE 'annulled'END,'original_record_id',s.original_record_id,'artifact',public.uc_education_issue_artifact_projection(p_org,s.artifact,legacy),'frdo_facts',s.frdo_facts,'proof',proof,'proof_availability',CASE WHEN legacy THEN 'legacy_unverified'WHEN proof_available THEN 'captured'ELSE 'currently_unavailable'END,'notes',coalesce(s.notes,r.notes,''),'latest_handover',handover,'annulment',annulment,'capabilities',caps);END;$fn$;
CREATE FUNCTION public.uc_education_issue_event(p_event uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE e public.uc_education_issuance_events;payload jsonb;ok boolean;BEGIN SELECT *INTO e FROM public.uc_education_issuance_events WHERE id=p_event AND NOT redacted;IF e.id IS NULL THEN RETURN NULL;END IF;payload:=e.payload;
 IF e.kind='issued'THEN ok:=public.uc_education_issue_proof_visible(payload->'proof');payload:=payload||jsonb_build_object('proof',CASE WHEN ok THEN payload->'proof'ELSE NULL END,'proof_availability',CASE WHEN ok THEN 'captured'ELSE 'currently_unavailable'END,'artifact',public.uc_education_issue_artifact_projection(e.organization_id,payload->'artifact',false));
 ELSIF e.kind='handover_recorded'THEN payload:=jsonb_set(payload,'{handover}',public.uc_education_issue_handover_projection(e.organization_id,payload->'handover'));
 ELSIF e.kind='annulled'THEN payload:=jsonb_set(payload,'{basis}',public.uc_education_issue_basis_projection(e.organization_id,payload->'basis'));
 ELSIF e.kind='duplicate_issued'THEN payload:=jsonb_set(payload,'{basis,basis}',public.uc_education_issue_basis_projection(e.organization_id,payload->'basis'->'basis'));END IF;
 RETURN jsonb_build_object('id',e.id,'record_id',e.record_id,'revision',e.revision,'kind',e.kind,'recorded_at',e.recorded_at,'actor_id',e.actor_id,'reason',e.reason,'previous_state_hash',e.previous_state_hash,'state_hash',e.state_hash,'payload',payload);END;$fn$;

CREATE FUNCTION public.uc_education_actor_org_permission(p_actor uuid,p_org uuid,p_permission text)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(p_actor IS NOT NULL AND p_org IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)AND(public.has_role(p_actor,'admin'::public.app_role)
 OR EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.profiles p ON p.user_id=ur.user_id WHERE ur.user_id=p_actor AND ur.role='organization'::public.app_role AND p.organization_id=p_org AND NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org))
 OR(p_permission IS NOT NULL AND EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org AND(s.expires_at IS NULL OR s.expires_at>now()))AND public.has_org_staff_permission(p_actor,p_org,p_permission))),false)$fn$;
CREATE FUNCTION public.uc_education_artifact_actor(p_actor uuid,p_org uuid,p_group uuid,p_user uuid,p_enrollment uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_custom_journal_person(p_actor)AND public.uc_platform_document_action_allowed(p_actor,'read')AND public.uc_platform_document_action_allowed(p_actor,'write')AND public.uc_platform_document_action_allowed(p_actor,'issue')
 AND public.uc_education_actor_org_permission(p_actor,p_org,'documents.read')AND public.uc_education_actor_org_permission(p_actor,p_org,'documents.write')AND public.uc_education_actor_org_permission(p_actor,p_org,'documents.issue')AND public.uc_education_actor_org_permission(p_actor,p_org,'journals.read')AND public.uc_education_actor_org_permission(p_actor,p_org,'journals.write')
 AND NOT public.has_role(p_actor,'sales_manager'::public.app_role)AND NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.organization_id=p_org AND s.user_id=p_actor AND s.role IN('viewer','sales_manager'))
 AND(public.has_role(p_actor,'admin'::public.app_role)OR public.is_org_owner(p_actor,p_org)OR NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.role='teacher')OR EXISTS(SELECT 1 FROM public.org_staff s WHERE s.organization_id=p_org AND s.user_id=p_actor AND s.role<>'teacher'AND(s.expires_at IS NULL OR s.expires_at>now())))
 AND public.uc_admission_staff_allowed(p_actor,p_org,p_user,p_group,p_enrollment,false)AND public.uc_learning_staff(p_actor,p_org,p_group,false),false)$fn$;
CREATE FUNCTION public.uc_education_template_current(p_org uuid,p_template jsonb,p_storage jsonb)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
 SELECT coalesce(EXISTS(SELECT 1 FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id AND d.organization_id=v.organization_id JOIN public.org_document_reviews r ON r.id=(p_template->>'review_id')::uuid AND r.document_id=d.id AND r.version_id=v.id AND r.organization_id=p_org JOIN storage.objects o ON o.id=v.storage_object_id
 WHERE v.organization_id=p_org AND v.id=(p_template->'source'->>'version_id')::uuid AND d.id=(p_template->'source'->>'document_id')::uuid AND d.deleted_at IS NULL AND coalesce(d.status,'active')NOT IN('archived','expired')AND d.current_version_id=v.id AND public.uc_copy_registry_original_ref(v)=p_template->'source'AND public.uc_copy_registry_object_matches(v)AND r.state='approved'AND r.revision=(p_template->>'review_revision')::bigint
 AND NOT EXISTS(SELECT 1 FROM public.org_document_review_comments c WHERE c.review_id=r.id AND c.resolution_status='accepted'AND c.position_anchor->>'kind'IN('insert','delete','replace'))
 AND o.id=(p_storage->>'object_id')::uuid AND o.updated_at=(p_storage->>'updated_at')::timestamptz AND o.bucket_id='org-documents'AND o.name=p_storage->>'path'AND v.file_size=(p_storage->>'byte_size')::bigint AND v.file_size BETWEEN 1 AND 1048576 AND lower(split_part(v.storage_metadata->>'mimetype',';',1))='text/html'
 AND p_template->'source'->>'content_hash'=p_storage->>'metadata_hash'),false)$fn$;

CREATE OR REPLACE FUNCTION public.issue_education_document_batch(p_organization_id uuid, p_group_id uuid, p_course_id uuid, p_items jsonb)
 RETURNS SETOF education_document_records
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_user_id uuid;
  v_enrollment_id uuid;
  v_doc_type text;
  v_issue_date date;
  v_year int;
  v_doc_n int;
  v_reg_n int;
  v_max_doc int;
  v_max_reg int;
  v_doc_number text;
  v_reg_number text;
  v_new_id uuid;
  v_existing_id uuid;
  v_group_course_id uuid;
  v_ids uuid[] := '{}';
  v_items_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id is required'; END IF;
  IF p_course_id IS NULL THEN RAISE EXCEPTION 'exact course_id is required'; END IF;
  IF NOT public.uc_document_has_action(p_organization_id,'issue') THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a non-empty array';
  END IF;
  v_items_count := jsonb_array_length(p_items);
  IF v_items_count = 0 THEN RAISE EXCEPTION 'items must be a non-empty array'; END IF;
  IF v_items_count > 500 THEN RAISE EXCEPTION 'items exceed max batch size (500)'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = p_course_id AND c.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'course % does not belong to organization', p_course_id;
  END IF;
  IF p_group_id IS NOT NULL THEN
    SELECT g.course_id INTO v_group_course_id FROM public.student_groups g
    WHERE g.id = p_group_id AND g.organization_id = p_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'group % does not belong to organization', p_group_id; END IF;
    IF v_group_course_id IS NULL OR v_group_course_id <> p_course_id THEN
      RAISE EXCEPTION 'group % is not linked to exact course %', p_group_id, p_course_id;
    END IF;
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=p_organization_id AND c.course_id=p_course_id AND c.group_id=p_group_id)THEN RAISE EXCEPTION 'verified_issuance_context_required' USING ERRCODE='42501';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_user_id := NULLIF(v_item->>'user_id', '')::uuid;
    v_enrollment_id := NULLIF(v_item->>'enrollment_id', '')::uuid;
    IF NOT public.uc_document_action_allowed(p_organization_id,'issue',p_group_id,v_enrollment_id) THEN RAISE EXCEPTION 'Issuance scope denied' USING ERRCODE='42501'; END IF;
    v_doc_type := NULLIF(btrim(v_item->>'document_type'), '');
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'user_id is required for every item'; END IF;
    IF v_enrollment_id IS NULL THEN RAISE EXCEPTION 'enrollment_id is required for every item'; END IF;
    IF v_doc_type NOT IN ('certificate', 'diploma', 'qualification') THEN
      RAISE EXCEPTION 'document_type must be certificate, diploma or qualification';
    END IF;
    IF NULLIF(v_item->>'issue_date', '') IS NULL THEN RAISE EXCEPTION 'issue_date is required for every item'; END IF;
    v_issue_date := (v_item->>'issue_date')::date;
    v_year := EXTRACT(YEAR FROM v_issue_date)::int;

    IF NOT EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.user_id = v_user_id AND pr.organization_id = p_organization_id
        AND (p_group_id IS NULL OR EXISTS (SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id = pr.organization_id AND m.user_id = pr.user_id AND m.group_id = p_group_id))
    ) THEN RAISE EXCEPTION 'student % is not a member of the specified organization/group', v_user_id; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id = e.course_id
      WHERE e.id = v_enrollment_id AND e.user_id = v_user_id AND e.course_id = p_course_id
        AND c.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'enrollment % does not belong to student %/exact course %', v_enrollment_id, v_user_id, p_course_id;
    END IF;

    -- One enrollment has one original education document. Re-export returns it.
    SELECT r.id INTO v_existing_id
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND r.enrollment_id = v_enrollment_id
      AND lower(btrim(r.document_status)) IN ('original', 'оригинал') AND r.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=p_organization_id AND c.enrollment_id=v_enrollment_id AND c.user_id=v_user_id AND c.mode='duplicate'AND v_item->>'document_status'='duplicate'AND c.original_record_id=r.id)
    ORDER BY r.created_at, r.id LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      IF EXISTS(SELECT 1 FROM public.education_document_program_sources ps WHERE ps.record_id=v_existing_id
       AND (ps.snapshot->>'group_id')::uuid IS DISTINCT FROM p_group_id) THEN
       RAISE EXCEPTION 'original_document_belongs_to_other_program_association' USING ERRCODE='22023'; END IF;
      v_ids := array_append(v_ids, v_existing_id); CONTINUE;
    END IF;

    SELECT COALESCE(MAX((substring(r.document_number FROM '([0-9]+)$'))::int), 0) INTO v_max_doc
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND EXTRACT(YEAR FROM r.issue_date) = v_year AND r.deleted_at IS NULL;
    INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
    VALUES (p_organization_id, 'edu_doc', v_year, v_max_doc + 1)
    ON CONFLICT (organization_id, doc_type, year)
    DO UPDATE SET last_number = GREATEST(document_number_sequences.last_number + 1, v_max_doc + 1), updated_at = now()
    RETURNING last_number INTO v_doc_n;

    SELECT COALESCE(MAX((substring(r.reg_number FROM '([0-9]+)$'))::int), 0) INTO v_max_reg
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND EXTRACT(YEAR FROM r.issue_date) = v_year AND r.deleted_at IS NULL;
    INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
    VALUES (p_organization_id, 'edu_reg', v_year, v_max_reg + 1)
    ON CONFLICT (organization_id, doc_type, year)
    DO UPDATE SET last_number = GREATEST(document_number_sequences.last_number + 1, v_max_reg + 1), updated_at = now()
    RETURNING last_number INTO v_reg_n;

    v_doc_number := v_year::text || '/' || lpad(v_doc_n::text, GREATEST(6,length(v_doc_n::text)), '0');
    v_reg_number := 'ДОК-' || v_year::text || '/' || lpad(v_reg_n::text, GREATEST(4,length(v_reg_n::text)), '0');
    INSERT INTO public.education_document_records (
      organization_id, user_id, course_id, group_id, enrollment_id,
      reg_number, document_number, document_series, document_type,
      full_name, birth_date, issue_date, specialty_name, qualification_name,
      document_status, delivery_method, education_result, notes, original_document_data
    ) VALUES (
      p_organization_id, v_user_id, p_course_id, p_group_id, v_enrollment_id,
      v_reg_number, v_doc_number, NULLIF(v_item->>'document_series', ''), v_doc_type,
      COALESCE(NULLIF(v_item->>'full_name', ''), ''), NULLIF(v_item->>'birth_date', '')::date,
      v_issue_date, COALESCE(NULLIF(v_item->>'specialty_name', ''), ''),
      NULLIF(v_item->>'qualification_name', ''), COALESCE(NULLIF(v_item->>'document_status', ''), 'original'),
      'not_recorded',
      NULLIF(v_item->>'education_result', ''), NULLIF(v_item->>'notes', ''), NULLIF(v_item->>'original_document_data','')
    ) RETURNING id INTO v_new_id;
    v_ids := array_append(v_ids, v_new_id);
  END LOOP;

  RETURN QUERY SELECT * FROM public.education_document_records r
  WHERE r.id = ANY(v_ids) ORDER BY array_position(v_ids, r.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.commit_org_document_version(p_document_id uuid, p_organization_id uuid, p_request_id uuid, p_expected_revision bigint, p_upload jsonb DEFAULT NULL::jsonb, p_restore_version_id uuid DEFAULT NULL::uuid, p_document jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN

DECLARE
  d public.org_documents%ROWTYPE;
  v public.org_document_versions%ROWTYPE;
  source_version public.org_document_versions%ROWTYPE;
  payload jsonb;
  meta jsonb;
  v_id uuid;
  next_number integer;
  v_path text; v_url text; v_name text; v_size bigint; v_summary text;
  actor_name text;
  v_origin text;
  v_object_id uuid;
  v_storage_metadata jsonb;
  v_actual_size bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed()
    OR NOT public.can_access_organization(p_organization_id,'documents.write') THEN
    RAISE EXCEPTION 'Document write permission required' USING ERRCODE='42501';
  END IF;
  IF p_document_id IS NULL OR p_organization_id IS NULL OR p_request_id IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision<0
    OR jsonb_typeof(p_document) IS DISTINCT FROM 'object'
    OR (p_upload IS NULL) = (p_restore_version_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid version operation' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_document) k
    WHERE k NOT IN ('name','type','issue_date','expires_at','responsible_person','status')) THEN
    RAISE EXCEPTION 'Unsupported document field' USING ERRCODE='22023';
  END IF;
  IF p_document ? 'status' AND (p_document->>'status') NOT IN ('active','archived','expired') THEN
    RAISE EXCEPTION 'Invalid document status' USING ERRCODE='22023';
  END IF;
  PERFORM public.uc_education_output_slot(p_document_id,p_organization_id,p_request_id,p_expected_revision,p_upload,p_restore_version_id,p_document);
  payload:=jsonb_build_object('document_id',p_document_id,'organization_id',p_organization_id,
    'expected_revision',p_expected_revision,'upload',p_upload,'restore_version_id',p_restore_version_id,'document',p_document);
  -- Serialize a request before checking replay, then serialize the document.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,610181020));
  SELECT * INTO v FROM public.org_document_versions WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v.organization_id<>p_organization_id OR v.document_id<>p_document_id OR v.request_payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION 'Request identifier already used for another operation' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('document_id',v.document_id,'revision',v.result_revision,
      'version_id',v.id,'version_number',v.version_number,'replayed',true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_document_id::text,610181021));
  SELECT * INTO d FROM public.org_documents WHERE id=p_document_id FOR UPDATE;
  IF FOUND THEN
    IF d.organization_id<>p_organization_id THEN RAISE EXCEPTION 'Document organization mismatch' USING ERRCODE='42501'; END IF;
    IF d.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Document is in the recycle bin' USING ERRCODE='22023'; END IF;
    IF d.document_revision<>p_expected_revision THEN RAISE EXCEPTION 'Document changed; reload before replacing it' USING ERRCODE='40001'; END IF;
    IF p_document ? 'type' AND p_document->>'type' IS DISTINCT FROM d.type THEN
      RAISE EXCEPTION 'Document type cannot be changed during replacement' USING ERRCODE='22023';
    END IF;
  ELSE
    IF p_expected_revision<>0 OR p_restore_version_id IS NOT NULL
      OR nullif(btrim(p_document->>'name'),'') IS NULL OR nullif(btrim(p_document->>'type'),'') IS NULL THEN
      RAISE EXCEPTION 'New document name and type are required' USING ERRCODE='22023';
    END IF;
    -- Required catalogue rows are single-current-entry types. No destructive
    -- unique backfill: existing duplicates remain visible for manual review.
    IF p_document->>'type' IN ('charter','license','registration','admission_rules','edu_activity_order',
      'attestation_rules','edu_relations','expulsion_rules','program_dev_rules','vsoko','elearning_rules',
      'practice_rules','qualification_issuance','credit_rules','salary_rules','pedagogical_council',
      'paid_services','personal_data','electronic_docs_rules','program_approval','schedule_approval',
      'commission_orders','doc_forms_approval','electronic_docs_order','self_examination_report') THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||(p_document->>'type'),610181022));
      IF EXISTS(SELECT 1 FROM public.org_documents WHERE organization_id=p_organization_id
        AND type=p_document->>'type' AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Document already exists; reload before replacing it' USING ERRCODE='40001';
      END IF;
    END IF;
    INSERT INTO public.org_documents(id,organization_id,name,type,file_url)
      VALUES(p_document_id,p_organization_id,p_document->>'name',p_document->>'type',NULL) RETURNING * INTO d;
  END IF;
  meta:=jsonb_build_object('name',d.name,'type',d.type,'issue_date',d.issue_date,
    'expires_at',d.expires_at,'responsible_person',d.responsible_person);
  IF p_restore_version_id IS NOT NULL THEN
    SELECT * INTO source_version FROM public.org_document_versions
      WHERE id=p_restore_version_id AND document_id=d.id AND organization_id=d.organization_id;
    IF NOT FOUND OR nullif(btrim(source_version.file_url),'') IS NULL THEN
      RAISE EXCEPTION 'Restorable version not found' USING ERRCODE='22023';
    END IF;
    v_path:=source_version.file_path;v_url:=source_version.file_url;v_name:=source_version.file_name;v_size:=source_version.file_size;
    v_object_id:=source_version.storage_object_id;v_storage_metadata:=source_version.storage_metadata;
    v_summary:='Восстановлен файл версии №'||source_version.version_number;
    meta:=meta||coalesce(source_version.document_metadata,'{}'::jsonb);
  ELSE
    IF jsonb_typeof(p_upload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Upload details required' USING ERRCODE='22023'; END IF;
    v_path:=p_upload->>'file_path';v_name:=p_upload->>'file_name';
    v_size:=(p_upload->>'file_size')::bigint;v_summary:=nullif(btrim(p_upload->>'change_summary'),'');
    -- PostgREST supplies claims from the verified user JWT, not a request body.
    v_origin:=auth.jwt()->>'iss';
    IF v_origin IS NULL OR v_origin !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?/auth/v1/?$' THEN
      RAISE EXCEPTION 'Verified Storage origin unavailable' USING ERRCODE='22023';
    END IF;
    v_origin:=regexp_replace(v_origin,'/auth/v1/?$','');
    v_url:=v_origin||'/storage/v1/object/public/org-documents/'||v_path;
    IF v_path IS NULL OR v_path !~ ('^'||p_organization_id::text||'/versions/'||p_document_id::text||'/'||p_request_id::text||'\.[a-z0-9]{1,12}$')
      OR v_size IS NULL OR v_size<0 OR nullif(btrim(v_name),'') IS NULL THEN
      RAISE EXCEPTION 'Invalid staged file' USING ERRCODE='22023';
    END IF;
    SELECT id,metadata INTO v_object_id,v_storage_metadata FROM storage.objects
      WHERE bucket_id='org-documents' AND name=v_path FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Staged file not found' USING ERRCODE='22023';
    END IF;
    IF coalesce(v_storage_metadata->>'size','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Staged file size unavailable' USING ERRCODE='22023';
    END IF;
    v_actual_size:=(v_storage_metadata->>'size')::bigint;
    IF v_size<>v_actual_size THEN RAISE EXCEPTION 'Staged file size mismatch' USING ERRCODE='22023'; END IF;
    v_storage_metadata:=jsonb_build_object('size',v_actual_size,'etag',coalesce(v_storage_metadata->>'eTag',v_storage_metadata->>'etag'),
      'mimetype',v_storage_metadata->>'mimetype');
  END IF;
  meta:=meta||(p_document-'status');
  IF nullif(btrim(meta->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Document name required' USING ERRCODE='22023'; END IF;
  IF nullif(meta->>'expires_at','')::date < nullif(meta->>'issue_date','')::date THEN
    RAISE EXCEPTION 'Expiry precedes issue date' USING ERRCODE='22023';
  END IF;
  SELECT full_name INTO actor_name FROM public.profiles WHERE user_id=auth.uid() LIMIT 1;
  INSERT INTO public.org_document_write_tokens VALUES(d.id,txid_current());
  SELECT coalesce(max(version_number),0)+1 INTO next_number FROM public.org_document_versions WHERE document_id=d.id;
  IF d.current_version_id IS NULL AND nullif(btrim(d.file_url),'') IS NOT NULL THEN
    INSERT INTO public.org_document_versions(document_id,organization_id,version_number,file_url,event_kind,change_summary,
      uploaded_by,uploaded_by_name,document_metadata)
    VALUES(d.id,d.organization_id,next_number,d.file_url,'baseline',
      'Снимок предыдущего файла на дату операции. Исходная дата и автор загрузки неизвестны.',auth.uid(),actor_name,
      jsonb_build_object('name',d.name,'type',d.type,'issue_date',d.issue_date,'expires_at',d.expires_at,'responsible_person',d.responsible_person));
    next_number:=next_number+1;
  END IF;
  INSERT INTO public.org_document_versions(document_id,organization_id,version_number,file_url,file_path,file_name,file_size,
    change_summary,uploaded_by,uploaded_by_name,event_kind,restored_from_version_id,request_id,request_payload,result_revision,document_metadata,storage_object_id,storage_metadata)
  VALUES(d.id,d.organization_id,next_number,v_url,v_path,v_name,v_size,v_summary,auth.uid(),actor_name,
    CASE WHEN p_restore_version_id IS NULL THEN 'upload' ELSE 'restore' END,p_restore_version_id,p_request_id,
    payload,d.document_revision+1,meta,v_object_id,v_storage_metadata) RETURNING id INTO v_id;
  UPDATE public.org_documents SET file_url=v_url,current_version_id=v_id,document_revision=d.document_revision+1,
    name=meta->>'name',issue_date=nullif(meta->>'issue_date','')::date,expires_at=nullif(meta->>'expires_at','')::date,
    responsible_person=nullif(btrim(meta->>'responsible_person'),''),
    status=coalesce(p_document->>'status',d.status,'active'),reminder_sent_at=NULL
    WHERE id=d.id;
  DELETE FROM public.org_document_write_tokens WHERE document_id=d.id AND transaction_id=txid_current();
  RETURN jsonb_build_object('document_id',d.id,'revision',d.document_revision+1,
    'version_id',v_id,'version_number',next_number,'replayed',false);
END ;
EXCEPTION WHEN serialization_failure THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE=SQLERRM;
END;
$function$;

CREATE FUNCTION public.uc_education_withdraw_apply(p_org uuid,p_group uuid,p_intent jsonb,p_preview_hash text,p_refs jsonb,p_reason text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
<<withdraw_apply>>
DECLARE id uuid;e public.enrollments;preview jsonb;x jsonb;before_state jsonb;after_state jsonb;people uuid[];event_id uuid;out_states jsonb:='[]';events jsonb:='[]';enrollments jsonb:='[]';technical jsonb;BEGIN
 IF NOT public.uc_admission_text(to_jsonb(p_reason),2000)OR jsonb_typeof(p_refs)IS DISTINCT FROM'array'OR jsonb_array_length(p_refs)NOT BETWEEN 1 AND 100 OR p_preview_hash!~'^[a-f0-9]{64}$'THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_refs)LOOP
 IF NOT public.uc_admission_shape(x,ARRAY['organization_id','enrollment_id','user_id','course_id','group_id','revision','source_hash'])OR NOT public.uc_admission_uuid(x->'organization_id')OR x->>'organization_id'<>p_org::text OR NOT public.uc_admission_uuid(x->'enrollment_id')OR NOT public.uc_admission_uuid(x->'user_id')OR NOT public.uc_admission_uuid(x->'course_id')OR(x->'group_id'<>'null'::jsonb AND NOT public.uc_admission_uuid(x->'group_id'))OR jsonb_typeof(x->'revision')IS DISTINCT FROM'number'OR(x->>'revision')::numeric NOT BETWEEN 0 AND 9007199254740991 OR coalesce(x->>'source_hash','')!~'^[a-f0-9]{64}$'THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;END LOOP;
 IF(SELECT count(DISTINCT value->>'enrollment_id')FROM jsonb_array_elements(p_refs))<>jsonb_array_length(p_refs)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 preview:=public.uc_education_withdraw_intent(p_org,p_group,p_intent);
 SELECT array_agg(DISTINCT(t->'ref'->>'user_id')::uuid ORDER BY(t->'ref'->>'user_id')::uuid)INTO people FROM jsonb_array_elements(preview->'items')t;
 PERFORM public.uc_education_issue_fence(p_org,p_group,people,'withdraw');
 FOR id IN SELECT(value->'ref'->>'enrollment_id')::uuid FROM jsonb_array_elements(preview->'items')ORDER BY value->'ref'->>'enrollment_id'LOOP
  PERFORM public.uc_education_issue_enrollment_fence(id,true);PERFORM 1 FROM public.enrollments e0 WHERE e0.id=withdraw_apply.id FOR UPDATE;
  PERFORM 1 FROM public.course_manual_credits c0 WHERE c0.enrollment_id=withdraw_apply.id FOR SHARE;
 END LOOP;
 PERFORM public.uc_education_issue_source_lock(p_org,p_intent->'basis'->'source');preview:=public.uc_education_withdraw_intent(p_org,p_group,p_intent);
 IF preview->>'preview_hash'IS DISTINCT FROM p_preview_hash OR(SELECT jsonb_agg(value ORDER BY value->>'enrollment_id')FROM jsonb_array_elements(p_refs))IS DISTINCT FROM(SELECT jsonb_agg(value->'ref'ORDER BY value->'ref'->>'enrollment_id')FROM jsonb_array_elements(preview->'items'))THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;
 IF preview->'ready'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('PREREQUISITE_MISSING');END IF;
 FOR before_state IN SELECT value FROM jsonb_array_elements(preview->'items')ORDER BY value->'ref'->>'enrollment_id'LOOP
  id:=(before_state->'ref'->>'enrollment_id')::uuid;IF NOT public.uc_education_withdraw_can(p_org,p_group,id,true)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
  SELECT e0.*INTO e FROM public.enrollments e0 WHERE e0.id=withdraw_apply.id;
  technical:=jsonb_build_object('status',e.status,'progress',e.progress,'time_spent',e.time_spent,'completed_at',e.completed_at,'started_at',e.started_at,'expires_at',e.expires_at,'access_days',e.access_days,'manual_credit_hash',public.uc_program_hash((SELECT coalesce(jsonb_agg(to_jsonb(c)ORDER BY c.id),'[]')FROM public.course_manual_credits c WHERE c.enrollment_id=e.id)));
  INSERT INTO public.uc_enrollment_withdrawal_states(enrollment_id,organization_id,user_id,course_id,group_id,revision,effective_date,basis,technical_snapshot,recorded_by,participant_ids)VALUES(e.id,p_org,e.user_id,e.course_id,(before_state->'ref'->>'group_id')::uuid,1,(p_intent->>'effective_date')::date,p_intent->'basis',technical,auth.uid(),ARRAY[e.user_id,auth.uid()]);
  after_state:=public.uc_education_withdraw_state(p_org,p_group,e.id);
  INSERT INTO public.uc_enrollment_withdrawal_events(enrollment_id,organization_id,user_id,revision,actor_id,reason,effective_date,basis,before_state,after_state,participant_ids)VALUES(e.id,p_org,e.user_id,1,auth.uid(),p_reason,(p_intent->>'effective_date')::date,p_intent->'basis',before_state,after_state,ARRAY[e.user_id,auth.uid()])RETURNING uc_enrollment_withdrawal_events.id INTO event_id;
  out_states:=out_states||jsonb_build_array(after_state);events:=events||jsonb_build_array(event_id);enrollments:=enrollments||jsonb_build_array(e.id);
 END LOOP;
 RETURN jsonb_build_object('withdrawals',out_states,'record_ids','[]'::jsonb,'enrollment_ids',enrollments,'event_ids',events);END;$fn$;

CREATE FUNCTION public.uc_education_issue_preview(p_org uuid,p_group uuid,p_intent jsonb,p_lock boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE x jsonb;c jsonb;items jsonb:='[]';ready boolean:=true;BEGIN
 IF NOT public.uc_admission_shape(p_intent,ARRAY['course_id','enrollment_ids','issue_date','document_series'])OR NOT public.uc_admission_uuid(p_intent->'course_id')OR NOT public.uc_admission_ids(p_intent->'enrollment_ids',1,100)OR NOT public.uc_copy_registry_date(p_intent->'issue_date')OR(p_intent->>'issue_date')::date>CURRENT_DATE OR(p_intent->'document_series'<>'null'::jsonb AND(jsonb_typeof(p_intent->'document_series')IS DISTINCT FROM'string'OR length(p_intent->>'document_series')>120))THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_intent->'enrollment_ids')ORDER BY value LOOP c:=public.uc_education_issue_candidate(p_org,p_group,(x#>>'{}')::uuid,p_lock);
 IF c IS NULL OR c->'course_id'IS DISTINCT FROM p_intent->'course_id'THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 IF NOT coalesce((public.uc_education_issue_caps(p_org,p_group,(c->>'enrollment_id')::uuid,(c->>'user_id')::uuid,(c->>'course_id')::uuid)->>'can_issue')::boolean,false)THEN c:=c||jsonb_build_object('eligibility_ref',NULL,'blockers',jsonb_build_array(public.uc_education_issue_block('ISSUANCE_AUTHORITY_REQUIRED')));END IF;
 ready:=ready AND c->'eligibility_ref'<>'null'::jsonb;items:=items||jsonb_build_array(c);END LOOP;
 RETURN jsonb_build_object('intent',p_intent,'preview_hash',public.uc_program_hash(jsonb_build_object('organization_id',p_org,'scope_group_id',p_group,'intent',p_intent,'candidates',items)),'candidates',items,'ready',ready);END;$fn$;
CREATE FUNCTION public.uc_education_replacement_identity(p_record uuid,p_correct boolean)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.education_document_records;s public.uc_education_issuance_states;name text;birth date;BEGIN SELECT *INTO r FROM public.education_document_records WHERE id=p_record;SELECT *INTO s FROM public.uc_education_issuance_states WHERE record_id=p_record;
 IF p_correct THEN SELECT nullif(btrim(p.full_name),'')INTO name FROM public.profiles p WHERE p.user_id=r.user_id AND p.organization_id=r.organization_id;SELECT d.birth_date INTO birth FROM public.student_frdo_data d WHERE d.user_id=r.user_id AND d.organization_id=r.organization_id;
 ELSE name:=r.full_name;birth:=r.birth_date;END IF;
 IF name IS NULL OR birth IS NULL THEN PERFORM public.uc_education_issue_error('PREREQUISITE_MISSING');END IF;
 RETURN jsonb_build_object('user_id',r.user_id,'full_name',name,'birth_date',birth,'registration_hash',public.uc_program_hash(jsonb_build_object('organization_id',r.organization_id,'user_id',r.user_id,'full_name',name,'birth_date',birth)),'source',CASE WHEN p_correct THEN 'current_student_registration'ELSE 'original_issued_snapshot'END);END;$fn$;
CREATE FUNCTION public.uc_education_handover_check(p_org uuid,p_record uuid,p_handover jsonb)RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE kind text:=p_handover->>'kind';s public.uc_education_issuance_states;BEGIN
 IF kind='personal'THEN IF NOT public.uc_admission_shape(p_handover,ARRAY['kind','occurred_at','recipient','evidence'])OR p_handover->'recipient'<>'{"kind":"learner"}'::jsonb THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 ELSIF kind='representative'THEN IF NOT public.uc_admission_shape(p_handover,ARRAY['kind','occurred_at','recipient','authorization','evidence'])OR NOT public.uc_admission_shape(p_handover->'recipient',ARRAY['kind','full_name'])OR p_handover->'recipient'->>'kind'<>'representative'OR NOT public.uc_admission_text(p_handover->'recipient'->'full_name',300)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;PERFORM public.uc_education_issue_source(p_org,p_handover->'authorization',true);
 ELSIF kind='postal_dispatched'THEN IF NOT public.uc_admission_shape(p_handover,ARRAY['kind','occurred_at','carrier','tracking_number','recipient','evidence'])OR NOT public.uc_admission_shape(p_handover->'recipient',ARRAY['kind','postal_address'])OR p_handover->'recipient'->>'kind'<>'learner'OR NOT public.uc_admission_text(p_handover->'recipient'->'postal_address',1000)OR NOT public.uc_admission_text(p_handover->'carrier',200)OR NOT public.uc_admission_text(p_handover->'tracking_number',200)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 ELSIF kind='postal_delivered'THEN IF NOT public.uc_admission_shape(p_handover,ARRAY['kind','occurred_at','dispatch_event_id','evidence'])OR NOT public.uc_admission_uuid(p_handover->'dispatch_event_id')THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 SELECT *INTO s FROM public.uc_education_issuance_states WHERE record_id=p_record AND NOT redacted;
 IF s.latest_handover->>'event_id'IS DISTINCT FROM p_handover->>'dispatch_event_id'OR s.latest_handover->'fact'->>'kind'IS DISTINCT FROM'postal_dispatched'THEN PERFORM public.uc_education_issue_error('PREREQUISITE_MISSING');END IF;
 ELSE PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 IF jsonb_typeof(p_handover->'occurred_at')IS DISTINCT FROM'string'OR length(p_handover->>'occurred_at')>64 OR(p_handover->>'occurred_at')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'OR NOT isfinite((p_handover->>'occurred_at')::timestamptz)OR(p_handover->>'occurred_at')::timestamptz>clock_timestamp()THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;PERFORM public.uc_education_issue_source(p_org,p_handover->'evidence',true);END;$fn$;
CREATE FUNCTION public.uc_education_change_preview(p_org uuid,p_group uuid,p_change jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE r jsonb;op text:=p_change->>'action';identity jsonb;caps jsonb;BEGIN
 IF NOT public.uc_admission_uuid(p_change->'record_id')OR NOT public.uc_admission_text(p_change->'reason',2000)OR jsonb_typeof(p_change->'expected_revision')IS DISTINCT FROM'number'OR coalesce(p_change->>'expected_state_hash','')!~'^[a-f0-9]{64}$'THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 r:=public.uc_education_issue_record(p_org,p_group,(p_change->>'record_id')::uuid);IF r IS NULL THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;caps:=r->'capabilities';
 IF r->'revision'IS DISTINCT FROM p_change->'expected_revision'OR r->>'state_hash'IS DISTINCT FROM p_change->>'expected_state_hash'THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;
 IF op='correct_metadata'THEN IF NOT public.uc_admission_shape(p_change,ARRAY['action','record_id','expected_revision','expected_state_hash','patch','reason'])OR NOT public.uc_admission_shape(p_change->'patch',ARRAY['notes'])OR jsonb_typeof(p_change->'patch'->'notes')IS DISTINCT FROM'string'OR length(p_change->'patch'->>'notes')>4000 THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;IF caps->'can_write_metadata'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 ELSIF op='record_handover'THEN IF NOT public.uc_admission_shape(p_change,ARRAY['action','record_id','expected_revision','expected_state_hash','handover','reason'])THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;IF caps->'can_record_handover'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;PERFORM public.uc_education_handover_check(p_org,(p_change->>'record_id')::uuid,p_change->'handover');
 ELSIF op='void_handover'THEN IF NOT public.uc_admission_shape(p_change,ARRAY['action','record_id','expected_revision','expected_state_hash','event_id','reason'])OR NOT public.uc_admission_uuid(p_change->'event_id')THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;IF caps->'can_record_handover'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;IF r->'latest_handover'->>'event_id'IS DISTINCT FROM p_change->>'event_id'THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;
 ELSIF op='annul'THEN IF NOT public.uc_admission_shape(p_change,ARRAY['action','record_id','expected_revision','expected_state_hash','basis','reason'])OR NOT public.uc_admission_shape(p_change->'basis',ARRAY['source','provision','reason'])OR NOT public.uc_admission_text(p_change->'basis'->'provision',1000)OR NOT public.uc_admission_text(p_change->'basis'->'reason',2000)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;IF caps->'can_annul'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;PERFORM public.uc_education_issue_source(p_org,p_change->'basis'->'source',true);
 ELSIF op='issue_duplicate'THEN IF NOT public.uc_admission_shape(p_change,ARRAY['action','record_id','expected_revision','expected_state_hash','issue_date','document_series','basis','reason'])OR NOT public.uc_copy_registry_date(p_change->'issue_date')OR(p_change->>'issue_date')::date>CURRENT_DATE OR(p_change->'document_series'<>'null'::jsonb AND(jsonb_typeof(p_change->'document_series')IS DISTINCT FROM'string'OR length(p_change->>'document_series')>120))OR NOT public.uc_admission_shape(p_change->'basis',ARRAY['kind','basis'])OR p_change->'basis'->>'kind'NOT IN('lost','damaged','correction_replacement')OR NOT public.uc_admission_shape(p_change->'basis'->'basis',ARRAY['source','provision','reason'])OR NOT public.uc_admission_text(p_change->'basis'->'basis'->'provision',1000)OR NOT public.uc_admission_text(p_change->'basis'->'basis'->'reason',2000)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 IF caps->'can_issue_duplicate'IS DISTINCT FROM'true'::jsonb OR r->>'proof_availability'<>'captured'THEN PERFORM public.uc_education_issue_error('PREREQUISITE_MISSING');END IF;PERFORM public.uc_education_issue_source(p_org,p_change->'basis'->'basis'->'source',true);identity:=public.uc_education_replacement_identity((p_change->>'record_id')::uuid,p_change->'basis'->>'kind'='correction_replacement');
 ELSE PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 RETURN jsonb_build_object('change',p_change,'preview_hash',public.uc_program_hash(jsonb_build_object('organization_id',p_org,'scope_group_id',p_group,'change',p_change,'state_hash',r->'state_hash','replacement_identity',identity)),'record',r,'ready',true,'blockers','[]'::jsonb);END;$fn$;

CREATE FUNCTION public.uc_education_frdo_snapshot(p_org uuid,p_user uuid,p_facts jsonb,p_numbers jsonb,p_document_type text,p_original jsonb DEFAULT NULL,p_correct boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d public.student_frdo_data;out jsonb;missing jsonb:='[]';BEGIN
 IF p_original IS NOT NULL AND NOT p_correct THEN out:=p_original;
 ELSE SELECT *INTO d FROM public.student_frdo_data WHERE organization_id=p_org AND user_id=p_user;
 out:=jsonb_build_object('schema_version',1,'source','issuance_preparation_snapshot','last_name',nullif(btrim(d.last_name),''),'first_name',nullif(btrim(d.first_name),''),'middle_name',nullif(btrim(d.middle_name),''),'birth_date',d.birth_date,'program_title',p_facts->'full_title','program_type',p_facts->'program_type','academic_hours',p_facts->'academic_hours','qualification_name',p_facts->'qualification','profession',p_facts->'profession','training_start_date',CASE WHEN p_original IS NOT NULL THEN p_original->'training_start_date'END,'training_end_date',CASE WHEN p_original IS NOT NULL THEN p_original->'training_end_date'END);END IF;
 out:=out||jsonb_build_object('document_type',p_document_type,'document_series',p_numbers->'document_series','document_number',p_numbers->'document_number','reg_number',p_numbers->'reg_number','issue_date',p_numbers->'issue_date');
 IF out->'last_name'='null'::jsonb THEN missing:=missing||jsonb_build_array('LAST_NAME');END IF;IF out->'first_name'='null'::jsonb THEN missing:=missing||jsonb_build_array('FIRST_NAME');END IF;IF out->'birth_date'='null'::jsonb THEN missing:=missing||jsonb_build_array('BIRTH_DATE');END IF;IF out->'training_start_date'='null'::jsonb THEN missing:=missing||jsonb_build_array('TRAINING_START_DATE');END IF;IF out->'training_end_date'='null'::jsonb THEN missing:=missing||jsonb_build_array('TRAINING_END_DATE');END IF;
 RETURN out||jsonb_build_object('missing',missing);END;$fn$;
CREATE FUNCTION public.uc_education_render_variables(p_org uuid,p_identity jsonb,p_facts jsonb,p_numbers jsonb,p_proof jsonb,p_document_type text)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE o public.organizations;recorded timestamptz;out jsonb;BEGIN SELECT *INTO o FROM public.organizations WHERE id=p_org;SELECT recorded_at INTO recorded FROM public.uc_learning_attestation_decisions WHERE id=(p_proof->'outcome_ref'->>'decision_id')::uuid;
 IF o.id IS NULL OR recorded IS NULL THEN PERFORM public.uc_education_issue_error('SOURCE_UNAVAILABLE');END IF;
 out:=jsonb_build_object('organization_name',o.name,'organization_inn',coalesce(o.inn,''),'organization_ogrn',coalesce(o.ogrn,''),'organization_director_name',coalesce(o.director_name,''),'organization_director_position',coalesce(o.director_position,''),'organization_director_authority','',
 'full_name',p_identity->'full_name','birth_date',to_char((p_identity->>'birth_date')::date,'DD.MM.YYYY'),'document_type_label',CASE p_document_type WHEN'certificate'THEN'Удостоверение'WHEN'diploma'THEN'Диплом'WHEN'qualification'THEN'Свидетельство'END,'document_series',coalesce(p_numbers->>'document_series',''),'document_number',p_numbers->'document_number','reg_number',p_numbers->'reg_number','issue_date',to_char((p_numbers->>'issue_date')::date,'DD.MM.YYYY'),
 'program_title',p_facts->'full_title','program_type_label',CASE p_facts->>'program_type'WHEN'dpo_upskilling'THEN'Повышение квалификации'WHEN'dpo_retraining'THEN'Профессиональная переподготовка'WHEN'professional_training'THEN'Профессиональное обучение'END,'academic_hours',p_facts->>'academic_hours','qualification_name',coalesce(p_facts->>'qualification',''),'profession',coalesce(p_facts->>'profession',''),'attestation_outcome','Итоговая аттестация пройдена','attestation_recorded_date',to_char(recorded AT TIME ZONE'UTC','DD.MM.YYYY'));
 IF EXISTS(SELECT 1 FROM jsonb_each_text(out)x WHERE x.value IS NULL OR length(x.value)>CASE x.key WHEN'organization_inn'THEN 20 WHEN'organization_ogrn'THEN 20 WHEN'full_name'THEN 500 WHEN'organization_director_name'THEN 500 WHEN'organization_director_position'THEN 300 WHEN'birth_date'THEN 10 WHEN'issue_date'THEN 10 WHEN'attestation_recorded_date'THEN 10 WHEN'document_type_label'THEN 100 WHEN'document_series'THEN 120 WHEN'document_number'THEN 120 WHEN'reg_number'THEN 120 WHEN'program_type_label'THEN 200 WHEN'academic_hours'THEN 40 WHEN'attestation_outcome'THEN 100 WHEN'program_title'THEN 4000 WHEN'qualification_name'THEN 4000 WHEN'profession'THEN 4000 ELSE 1000 END)THEN PERFORM public.uc_education_issue_error('LIMIT_EXCEEDED');END IF;
 RETURN out;END;$fn$;

CREATE FUNCTION public.uc_education_canonical_boundary()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_education_issuance_contexts;identity jsonb;BEGIN
 IF TG_OP<>'INSERT'THEN IF public.uc_education_trusted_erasure(OLD.user_id)THEN IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;RAISE EXCEPTION 'controlled_issuance_lifecycle_required' USING ERRCODE='42501';END IF;
 SELECT *INTO c FROM public.uc_education_issuance_contexts WHERE transaction_id=txid_current()AND backend_pid=pg_backend_pid()AND actor_id=auth.uid()AND organization_id=NEW.organization_id AND enrollment_id=NEW.enrollment_id AND user_id=NEW.user_id AND course_id=NEW.course_id AND group_id=NEW.group_id;
 IF c.id IS NULL OR NOT public.uc_education_issue_actor()OR NOT public.uc_education_artifact_actor(c.actor_id,c.organization_id,c.group_id,c.user_id,c.enrollment_id)THEN RAISE EXCEPTION 'verified_issuance_context_required' USING ERRCODE='42501';END IF;identity:=c.official_identity;
 IF NEW.delivery_method IS DISTINCT FROM 'not_recorded' OR NEW.delivery_details IS NOT NULL OR NEW.document_status IS DISTINCT FROM c.mode OR NEW.document_number IS DISTINCT FROM identity->>'document_number'OR NEW.reg_number IS DISTINCT FROM identity->>'reg_number'OR NEW.document_series IS DISTINCT FROM identity->>'document_series'OR NEW.issue_date IS DISTINCT FROM(identity->>'issue_date')::date OR NEW.document_type IS DISTINCT FROM identity->>'document_type'OR NEW.full_name IS DISTINCT FROM identity->>'full_name'OR NEW.birth_date IS DISTINCT FROM(identity->>'birth_date')::date OR NEW.original_document_data IS DISTINCT FROM identity->>'original_document_data'THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 IF EXISTS(SELECT 1 FROM public.education_document_records r WHERE r.organization_id=NEW.organization_id AND r.deleted_at IS NULL AND(r.reg_number=NEW.reg_number OR r.document_number=NEW.document_number))THEN PERFORM public.uc_education_issue_error('NUMBER_PLAN_STALE');END IF;RETURN NEW;END;$fn$;
CREATE TRIGGER uc_education_issuance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.education_document_records FOR EACH ROW EXECUTE FUNCTION public.uc_education_canonical_boundary();

CREATE FUNCTION public.uc_education_saved_output_counts(p_user uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
 SELECT jsonb_build_object('unissued',count(*)FILTER(WHERE i.final_record_id IS NULL),'issued',count(*)FILTER(WHERE i.final_record_id IS NOT NULL))FROM public.uc_education_issuance_preparation_items i JOIN storage.objects o ON o.bucket_id='org-documents'AND o.name=i.organization_id::text||'/versions/'||i.output_document_id::text||'/'||i.output_request_id::text||'.pdf'WHERE i.user_id=p_user OR i.retained_subject_user_id=p_user $fn$;

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
 v_categories:=jsonb_build_array(
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
 v_categories:=v_categories||public.uc_group_education_deletion_preview(p_user_id);
 SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_learning_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','learning_outcomes','label','Результаты обучения и решения: личные строки удаляются, атрибуция обезличивается','count',v_count,'action','delete_or_anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_custom_journal_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','custom_journals','label','Собственные журналы: строки выбранного лица удаляются, авторские копии обезличиваются','count',v_count,'action','delete_or_anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_session_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','conducted_sessions','label','Проведённые занятия, посещение и черновики: личные сведения обезличиваются, редакции сохраняются','count',v_count,'action','anonymize'));END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record','label','Техническая запись запрета старого доступа и квитанция об удалении без имени и контактов','count',1,'action','retain'));
 -- The snapshot is compared atomically just before the first mutation. Counts
 -- and manifest cover additions during the confirmation dialog; no PII stored.
 RETURN jsonb_build_object('organizationId',v_org,'emptyOrganization',v_owner AND v_org_shared=0,'learningCount',v_learning,
  'categories',v_categories,'blockers',v_blockers,'files',v_files,'sharedCount',v_shared,'personalRows',public.account_deletion_personal_row_counts(p_user_id),
  'profileRevision',p.updated_at,'role',(SELECT role::text FROM public.user_roles WHERE user_id=p_user_id LIMIT 1));
END;$function$;

CREATE OR REPLACE FUNCTION public.account_deletion_files(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
 SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name,'objectId',o.id,'updatedAt',o.updated_at) ORDER BY o.bucket_id,o.name),'[]'::jsonb)
 FROM storage.objects o WHERE
  (o.bucket_id IN ('avatars','student-documents','final-test-photos','student-identification-media','admission-case-evidence','education-issuance-staging') AND split_part(o.name,'/',1)=p_user_id::text)
  OR (o.bucket_id='student-documents' AND o.name LIKE 'avatars/'||p_user_id::text||'.%')
  OR (o.bucket_id='admission-case-evidence'AND split_part(o.name,'/',4)='staging'AND split_part(o.name,'/',5)=p_user_id::text)
  OR (o.bucket_id='chat-attachments' AND split_part(o.name,'/',2)=p_user_id::text
    AND (EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user_id AND split_part(o.name,'/',1)=p.organization_id::text)
      OR EXISTS(SELECT 1 FROM public.account_deletion_jobs j WHERE j.user_id=p_user_id AND j.state='cleanup_pending' AND split_part(o.name,'/',1)=j.snapshot->>'organizationId')));
$function$;

DO $bucket$BEGIN IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='education-issuance-staging')THEN RAISE EXCEPTION 'UC019 staging bucket already exists; review actual baseline' USING ERRCODE='55000';END IF;END;$bucket$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)VALUES('education-issuance-staging','education-issuance-staging',false,20971520,ARRAY['application/pdf']);
CREATE POLICY uc_education_staging_private_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated,anon USING(bucket_id<>'education-issuance-staging')WITH CHECK(bucket_id<>'education-issuance-staging');
CREATE FUNCTION public.uc_education_staging_storage_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE item public.uc_education_issuance_preparation_items;prep public.uc_education_issuance_preparations;parts text[];target uuid;meta jsonb;size_text text;BEGIN
 IF TG_OP='DELETE'THEN IF OLD.bucket_id<>'education-issuance-staging'THEN RETURN OLD;END IF;
  IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL THEN RAISE EXCEPTION 'private_staging_service_required' USING ERRCODE='42501';END IF;parts:=string_to_array(OLD.name,'/');
  IF array_length(parts,1)<>5 OR parts[1]!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'THEN RAISE EXCEPTION 'private_staging_path_invalid' USING ERRCODE='42501';END IF;target:=parts[1]::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=target)OR NOT EXISTS(SELECT 1 FROM public.account_deletion_jobs j WHERE j.user_id=target AND j.state='cleanup_pending')THEN RAISE EXCEPTION 'personal_staging_cleanup_review_required' USING ERRCODE='42501';END IF;RETURN OLD;
 END IF;
 IF TG_OP='UPDATE'THEN IF OLD.bucket_id='education-issuance-staging'OR NEW.bucket_id='education-issuance-staging'THEN RAISE EXCEPTION 'private_staging_object_is_immutable' USING ERRCODE='42501';END IF;RETURN NEW;END IF;
 IF NEW.bucket_id<>'education-issuance-staging'THEN RETURN NEW;END IF;
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR NEW.owner IS NOT NULL OR nullif(NEW.owner_id,'')IS NOT NULL THEN RAISE EXCEPTION 'private_staging_service_required' USING ERRCODE='42501';END IF;
 meta:=NEW.user_metadata;IF NOT public.uc_admission_shape(meta,ARRAY['preparation_id','item_id','render_input_hash','template_byte_sha256','html_sha256','byte_sha256','renderer','renderer_revision'])OR NOT public.uc_admission_uuid(meta->'preparation_id')OR NOT public.uc_admission_uuid(meta->'item_id')OR meta->>'renderer'IS DISTINCT FROM'browserless'OR meta->>'renderer_revision'IS DISTINCT FROM'uc019-v1'OR coalesce(meta->>'render_input_hash','')!~'^[a-f0-9]{64}$'OR coalesce(meta->>'template_byte_sha256','')!~'^[a-f0-9]{64}$'OR coalesce(meta->>'html_sha256','')!~'^[a-f0-9]{64}$'OR coalesce(meta->>'byte_sha256','')!~'^[a-f0-9]{64}$'THEN RAISE EXCEPTION 'private_staging_provenance_invalid' USING ERRCODE='42501';END IF;
 SELECT *INTO item FROM public.uc_education_issuance_preparation_items WHERE id=(meta->>'item_id')::uuid AND preparation_id=(meta->>'preparation_id')::uuid AND NOT redacted;
 SELECT *INTO prep FROM public.uc_education_issuance_preparations WHERE id=item.preparation_id AND NOT redacted;
 IF item.id IS NULL OR prep.id IS NULL OR item.final_record_id IS NOT NULL OR NEW.name IS DISTINCT FROM item.user_id::text||'/'||item.organization_id::text||'/'||prep.id::text||'/'||item.id::text||'/'||item.render_input_hash||'.pdf'OR meta->>'render_input_hash'IS DISTINCT FROM item.render_input_hash OR NOT public.uc_education_artifact_actor(prep.actor_id,item.organization_id,item.group_id,item.user_id,item.enrollment_id)THEN RAISE EXCEPTION 'private_staging_context_unavailable' USING ERRCODE='42501';END IF;
 PERFORM public.uc_education_issue_fence(item.organization_id,item.group_id,ARRAY[item.user_id,prep.actor_id]);
 size_text:=coalesce(NEW.metadata->>'size',NEW.metadata->>'contentLength');IF size_text IS NULL OR size_text!~'^[0-9]+$'OR size_text::numeric NOT BETWEEN 1 AND 20971520 OR NEW.metadata->>'mimetype'IS DISTINCT FROM'application/pdf'THEN RAISE EXCEPTION 'private_staging_metadata_invalid' USING ERRCODE='22023';END IF;
 -- Ordinary Storage upload permission probes run INSERT triggers with metadata
 -- contentLength/version1, then roll back. Only the real final object is attested.
 RETURN NEW;END;$fn$;
CREATE TRIGGER uc_education_staging_object_boundary BEFORE INSERT OR UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.uc_education_staging_storage_guard();

CREATE FUNCTION public.uc_education_preparation_access(p_preparation uuid,p_fresh boolean DEFAULT false,p_item uuid DEFAULT NULL)RETURNS public.uc_education_issuance_preparations LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE prep public.uc_education_issuance_preparations;i public.uc_education_issuance_preparation_items;g uuid;c jsonb;r jsonb;identity jsonb;vars jsonb;frdo jsonb;correct boolean;BEGIN
 SELECT *INTO prep FROM public.uc_education_issuance_preparations WHERE id=p_preparation AND actor_id=auth.uid()AND NOT redacted;
 IF prep.id IS NULL OR NOT public.uc_education_issue_actor()THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;g:=public.uc_education_issue_scope(prep.organization_id,prep.scope);
 IF NOT coalesce((public.uc_document_registry_caps(prep.organization_id,g)->>'can_register')::boolean,false)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_education_issue_source(prep.organization_id,prep.template->'source',true);
 FOR i IN SELECT *FROM public.uc_education_issuance_preparation_items WHERE preparation_id=prep.id AND(p_item IS NULL OR id=p_item)ORDER BY id LOOP
 IF i.redacted OR i.user_id IS NULL OR NOT public.uc_education_artifact_actor(prep.actor_id,i.organization_id,i.group_id,i.user_id,i.enrollment_id)OR NOT public.uc_education_issue_proof_visible(i.eligibility_ref)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_education_issue_fence(i.organization_id,i.group_id,ARRAY[i.user_id,prep.actor_id]);
 IF i.artifact IS NOT NULL THEN PERFORM public.uc_education_issue_source(i.organization_id,i.artifact->'source',true);END IF;
 IF p_fresh AND i.final_record_id IS NULL THEN
 IF NOT public.uc_education_template_current(prep.organization_id,prep.template,prep.template_storage)THEN PERFORM public.uc_education_issue_error('ARTIFACT_REVIEW_REQUIRED');END IF;
 IF public.uc_education_number_witness(prep.organization_id,(i.number_plan->>'issue_date')::date)IS DISTINCT FROM prep.number_witness THEN PERFORM public.uc_education_issue_error('NUMBER_PLAN_STALE');END IF;
 correct:=prep.kind='duplicate'AND prep.plan->'change'->'basis'->>'kind'='correction_replacement';
 IF prep.kind='original'THEN c:=public.uc_education_issue_candidate(i.organization_id,g,i.enrollment_id,false);IF c IS NULL OR c->'eligibility_ref'IS DISTINCT FROM i.eligibility_ref THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 ELSE r:=public.uc_education_issue_record(i.organization_id,g,(prep.plan->'change'->>'record_id')::uuid);IF r IS NULL OR r->'revision'IS DISTINCT FROM prep.plan->'change'->'expected_revision'OR r->>'state_hash'IS DISTINCT FROM prep.plan->'change'->>'expected_state_hash'OR r->'capabilities'->'can_issue_duplicate'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 identity:=public.uc_education_replacement_identity((prep.plan->'change'->>'record_id')::uuid,correct);IF identity IS DISTINCT FROM i.official_identity THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;END IF;
 vars:=public.uc_education_render_variables(i.organization_id,i.official_identity,i.source_snapshot->'program_snapshot'->'facts',i.number_plan,i.eligibility_ref,i.frdo_facts->>'document_type');
 IF vars IS DISTINCT FROM i.render_variables THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 IF prep.kind='original'OR correct THEN frdo:=public.uc_education_frdo_snapshot(i.organization_id,i.user_id,i.source_snapshot->'program_snapshot'->'facts',i.number_plan,i.frdo_facts->>'document_type',CASE WHEN correct THEN i.frdo_facts END,correct);IF frdo IS DISTINCT FROM i.frdo_facts THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;END IF;
 END IF;END LOOP;
 IF p_item IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_preparation_items x WHERE x.id=p_item AND x.preparation_id=prep.id)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;RETURN prep;END;$fn$;
CREATE FUNCTION public.uc_education_output_approval(p_item uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('id',r.id,'revision',r.revision)FROM public.uc_education_issuance_preparation_items i JOIN public.org_document_versions v ON v.document_id=i.output_document_id AND v.request_id=i.output_request_id AND v.organization_id=i.organization_id JOIN public.org_documents d ON d.id=v.document_id AND d.current_version_id=v.id AND d.deleted_at IS NULL AND coalesce(d.status,'active')NOT IN('archived','expired')JOIN public.org_document_reviews r ON r.document_id=d.id AND r.version_id=v.id AND r.organization_id=i.organization_id AND r.state='approved'
 WHERE i.id=p_item AND public.uc_copy_registry_object_matches(v)AND NOT EXISTS(SELECT 1 FROM public.org_document_review_comments c WHERE c.review_id=r.id AND c.resolution_status='accepted'AND c.position_anchor->>'kind'IN('insert','delete','replace'))$fn$;
CREATE FUNCTION public.uc_education_preparation_item_json(p_item uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;artifact jsonb;review jsonb;state text;BEGIN SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item;SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF i.artifact IS NOT NULL THEN review:=public.uc_education_output_approval(i.id);artifact:=i.artifact||jsonb_build_object('output_review',review);END IF;
 state:=CASE WHEN i.final_record_id IS NOT NULL THEN'consumed'WHEN NOT public.uc_education_template_current(p.organization_id,p.template,p.template_storage)OR public.uc_education_number_witness(p.organization_id,(i.number_plan->>'issue_date')::date)IS DISTINCT FROM p.number_witness THEN'stale'WHEN artifact IS NOT NULL AND review IS NOT NULL THEN'approved_unissued'WHEN artifact IS NOT NULL THEN'rendered_unissued'ELSE'prepared'END;
 RETURN jsonb_build_object('id',i.id,'enrollment_id',i.enrollment_id,'user_id',i.user_id,'course_id',i.course_id,'group_id',i.group_id,'input_revision',i.input_revision,'status',state,'number_plan',i.number_plan,'render_input_hash',i.render_input_hash,'artifact',artifact,'final_record_id',i.final_record_id);END;$fn$;
CREATE FUNCTION public.uc_education_preparation_json(p_preparation uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE p public.uc_education_issuance_preparations;items jsonb;BEGIN p:=public.uc_education_preparation_access(p_preparation,false,NULL);
 SELECT jsonb_agg(public.uc_education_preparation_item_json(i.id)ORDER BY i.enrollment_id)INTO items FROM public.uc_education_issuance_preparation_items i WHERE i.preparation_id=p.id;
 RETURN jsonb_build_object('id',p.id,'organization_id',p.organization_id,'scope',p.scope,'kind',p.kind,'created_at',p.created_at,'created_by',p.actor_id,'intent_hash',p.intent_hash,'plan',p.plan,'template',p.template,'items',items);END;$fn$;

CREATE FUNCTION public.prepare_education_issuance_artifacts(p_organization_id uuid,p_scope jsonb,p_request_id uuid,p_plan jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'SET lock_timeout='2000ms' AS $fn$
<<prepare_issuance>>
DECLARE g uuid;a uuid:=auth.uid();payload_hash text;req public.uc_education_issuance_requests;preview jsonb;selected jsonb;item jsonb;candidate jsonb;source jsonb;proof jsonb;identity jsonb;facts jsonb;frdo jsonb;vars jsonb;numbers jsonb;template jsonb;witness jsonb;date_value date;series text;people uuid[];prep_id uuid:=gen_random_uuid();item_id uuid;document_id uuid;upload_request uuid;idx integer:=0;old_record public.education_document_records;old_state public.uc_education_issuance_states;correct boolean:=false;receipt jsonb;reason text;BEGIN
 g:=public.uc_education_issue_scope(p_organization_id,p_scope);IF p_request_id IS NULL OR NOT coalesce((public.uc_education_issue_caps(p_organization_id,g)->>'can_issue')::boolean,false)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 IF p_plan->>'kind'='original'THEN
 IF NOT public.uc_admission_shape(p_plan,ARRAY['kind','intent','preview_hash','items','template','reason'])OR NOT public.uc_admission_text(p_plan->'reason',2000)OR jsonb_typeof(p_plan->'items')IS DISTINCT FROM'array'OR jsonb_array_length(p_plan->'items')NOT BETWEEN 1 AND 100 THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 preview:=public.uc_education_issue_preview(p_organization_id,g,p_plan->'intent',false);reason:=p_plan->>'reason';selected:=preview->'candidates';date_value:=(p_plan->'intent'->>'issue_date')::date;series:=p_plan->'intent'->>'document_series';
 FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'items')LOOP IF NOT public.uc_admission_shape(item,ARRAY['enrollment_id','expected_eligibility_ref'])OR NOT public.uc_admission_uuid(item->'enrollment_id')THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;END LOOP;
 IF(SELECT count(DISTINCT value->>'enrollment_id')FROM jsonb_array_elements(p_plan->'items'))<>jsonb_array_length(p_plan->'items')OR(SELECT jsonb_agg(value->'enrollment_id'ORDER BY value->>'enrollment_id')FROM jsonb_array_elements(p_plan->'items'))IS DISTINCT FROM(SELECT jsonb_agg(value->'enrollment_id'ORDER BY value->>'enrollment_id')FROM jsonb_array_elements(selected))THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 ELSIF p_plan->>'kind'='duplicate'THEN
 IF NOT public.uc_admission_shape(p_plan,ARRAY['kind','change','preview_hash','template'])OR p_plan->'change'->>'action'IS DISTINCT FROM'issue_duplicate'THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 preview:=public.uc_education_change_preview(p_organization_id,g,p_plan->'change');SELECT *INTO old_record FROM public.education_document_records WHERE id=(p_plan->'change'->>'record_id')::uuid;SELECT *INTO old_state FROM public.uc_education_issuance_states WHERE record_id=old_record.id;
 selected:=jsonb_build_array(jsonb_build_object('enrollment_id',old_record.enrollment_id,'user_id',old_record.user_id,'course_id',old_record.course_id,'group_id',old_record.group_id));date_value:=(p_plan->'change'->>'issue_date')::date;series:=p_plan->'change'->>'document_series';reason:=p_plan->'change'->>'reason';correct:=p_plan->'change'->'basis'->>'kind'='correction_replacement';
 ELSE PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 IF coalesce(p_plan->>'preview_hash','')!~'^[a-f0-9]{64}$'THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 payload_hash:=public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'scope',p_scope,'plan',p_plan));
 SELECT array_agg(DISTINCT(value->>'user_id')::uuid ORDER BY(value->>'user_id')::uuid)INTO people FROM jsonb_array_elements(selected);
 PERFORM public.uc_education_issue_fence(p_organization_id,g,people,'prepare:'||a::text||':'||p_request_id::text);
 SELECT *INTO req FROM public.uc_education_issuance_requests WHERE actor_id=a AND request_id=p_request_id;
 IF req.request_id IS NOT NULL THEN IF req.organization_id<>p_organization_id OR req.scope IS DISTINCT FROM p_scope OR req.action<>'prepare_artifacts'OR req.payload_hash<>payload_hash THEN PERFORM public.uc_education_issue_error('REQUEST_CONFLICT');END IF;
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'scope',p_scope,'capabilities',public.uc_education_issue_caps(p_organization_id,g),'receipt',req.receipt||jsonb_build_object('replayed',true),'preparation',public.uc_education_preparation_json((req.receipt->>'preparation_id')::uuid));END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_organization_id::text,0))THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;PERFORM 1 FROM public.organizations o WHERE o.id=p_organization_id FOR SHARE;
 template:=public.uc_education_template(p_organization_id,p_plan->'template',true);witness:=public.uc_education_number_witness(p_organization_id,date_value);
 IF p_plan->>'kind'='original'THEN preview:=public.uc_education_issue_preview(p_organization_id,g,p_plan->'intent',true);selected:=preview->'candidates';
 IF preview->'ready'IS DISTINCT FROM'true'::jsonb OR preview->>'preview_hash'IS DISTINCT FROM p_plan->>'preview_hash'THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;
 FOR candidate IN SELECT value FROM jsonb_array_elements(selected)LOOP SELECT value INTO item FROM jsonb_array_elements(p_plan->'items')WHERE value->'enrollment_id'=candidate->'enrollment_id';IF item->'expected_eligibility_ref'IS DISTINCT FROM candidate->'eligibility_ref'THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;END LOOP;
 ELSE PERFORM public.uc_education_issue_enrollment_fence(old_record.enrollment_id,true);PERFORM 1 FROM public.education_document_records r WHERE r.id=old_record.id FOR UPDATE;PERFORM 1 FROM public.uc_education_issuance_states s WHERE s.record_id=old_record.id FOR UPDATE;
 PERFORM public.uc_education_issue_source_lock(p_organization_id,p_plan->'change'->'basis'->'basis'->'source');preview:=public.uc_education_change_preview(p_organization_id,g,p_plan->'change');IF preview->>'preview_hash'IS DISTINCT FROM p_plan->>'preview_hash'THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;
 END IF;
 INSERT INTO public.uc_education_issuance_preparations(id,organization_id,actor_id,scope,kind,plan,intent_hash,template,template_storage,number_witness,participant_ids)VALUES(prep_id,p_organization_id,a,p_scope,p_plan->>'kind',p_plan,payload_hash,p_plan->'template',template->'storage',witness,array_append(people,a));
 FOR candidate IN SELECT value FROM jsonb_array_elements(selected)ORDER BY value->>'enrollment_id'LOOP idx:=idx+1;item_id:=gen_random_uuid();document_id:=gen_random_uuid();upload_request:=gen_random_uuid();numbers:=public.uc_education_prospective_numbers(witness,idx,date_value,series);
 IF p_plan->>'kind'='original'THEN proof:=candidate->'eligibility_ref';source:=to_jsonb(public.uc_program_issuance_source(p_organization_id,(candidate->>'group_id')::uuid,(candidate->>'enrollment_id')::uuid,(candidate->>'user_id')::uuid,(candidate->>'course_id')::uuid));
 SELECT jsonb_build_object('user_id',p.user_id,'full_name',btrim(p.full_name),'birth_date',d.birth_date,'registration_hash',proof->'identity_ref'->'registration_hash','source','current_student_registration')INTO identity FROM public.profiles p JOIN public.student_frdo_data d ON d.user_id=p.user_id AND d.organization_id=p.organization_id WHERE p.user_id=(candidate->>'user_id')::uuid AND p.organization_id=p_organization_id;
 ELSE proof:=old_state.proof;SELECT snapshot INTO source FROM public.education_document_program_sources WHERE record_id=old_record.id;identity:=public.uc_education_replacement_identity(old_record.id,correct);
 IF correct THEN proof:=jsonb_set(proof-'source_hash','{identity_ref}',jsonb_build_object('user_id',old_record.user_id,'registration_hash',identity->'registration_hash','source','current_student_registration'));proof:=proof||jsonb_build_object('source_hash',public.uc_program_hash(proof));END IF;
 END IF;
 facts:=source->'program_snapshot'->'facts';IF source IS NULL OR facts IS NULL THEN PERFORM public.uc_education_issue_error('SOURCE_UNAVAILABLE');END IF;
 frdo:=public.uc_education_frdo_snapshot(p_organization_id,(candidate->>'user_id')::uuid,facts,numbers,CASE WHEN p_plan->>'kind'='original'THEN candidate->>'document_type'ELSE old_record.document_type END,CASE WHEN p_plan->>'kind'='duplicate'THEN old_state.frdo_facts END,correct);
 vars:=public.uc_education_render_variables(p_organization_id,identity,facts,numbers,proof,frdo->>'document_type');
 INSERT INTO public.uc_education_issuance_preparation_items(id,preparation_id,organization_id,enrollment_id,user_id,course_id,group_id,number_plan,eligibility_ref,source_snapshot,official_identity,frdo_facts,render_variables,render_input_hash,output_document_id,output_request_id,participant_ids)
 VALUES(item_id,prep_id,p_organization_id,(candidate->>'enrollment_id')::uuid,(candidate->>'user_id')::uuid,(candidate->>'course_id')::uuid,(candidate->>'group_id')::uuid,numbers,proof,source,identity,frdo,vars,public.uc_program_hash(jsonb_build_object('preparation_id',prep_id,'item_id',item_id,'plan_hash',payload_hash,'template',template,'proof',proof,'source',source,'identity',identity,'frdo_facts',frdo,'numbers',numbers,'variables',vars)),document_id,upload_request,ARRAY[(candidate->>'user_id')::uuid,a]);END LOOP;
 receipt:=jsonb_build_object('request_id',p_request_id,'action','prepare_artifacts','payload_hash',payload_hash,'preparation_id',prep_id,'applied_at',clock_timestamp(),'replayed',false);
 INSERT INTO public.uc_education_issuance_requests(actor_id,request_id,organization_id,scope,action,payload_hash,receipt,participant_ids)VALUES(a,p_request_id,p_organization_id,p_scope,'prepare_artifacts',payload_hash,receipt,array_append(people,a));
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'scope',p_scope,'capabilities',public.uc_education_issue_caps(p_organization_id,g),'receipt',receipt,'preparation',public.uc_education_preparation_json(prep_id));
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN RAISE EXCEPTION 'EDUCATION_ISSUANCE_REVISION_CONFLICT' USING ERRCODE='PT409';WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END;$fn$;

CREATE FUNCTION public.uc_education_artifact_live(p_actor uuid,p_preparation uuid,p_item uuid,p_revision bigint,p_fresh boolean DEFAULT true)RETURNS public.uc_education_issuance_preparation_items LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;c public.uc_admission_cases;s public.uc_learning_outcome_states;m public.uc_learning_machine_results;d public.uc_learning_attestation_decisions;proof jsonb;a jsonb;e jsonb;dto jsonb;identity jsonb;facts jsonb;correct boolean;BEGIN
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item AND preparation_id=p_preparation AND input_revision=p_revision AND NOT redacted;
 SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=p_preparation AND actor_id=p_actor AND NOT redacted;
 IF i.id IS NULL OR p.id IS NULL OR i.organization_id<>p.organization_id OR i.user_id IS NULL OR NOT public.uc_education_artifact_actor(p_actor,i.organization_id,i.group_id,i.user_id,i.enrollment_id)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_education_issue_fence(i.organization_id,i.group_id,ARRAY[p_actor,i.user_id]);proof:=i.eligibility_ref;a:=proof->'admission_ref';
 SELECT *INTO c FROM public.uc_admission_cases WHERE id=(a->>'case_id')::uuid AND organization_id=i.organization_id AND user_id=i.user_id AND group_id=i.group_id AND enrollment_id=i.enrollment_id;
 IF c.id IS NULL THEN PERFORM public.uc_education_issue_error('SOURCE_UNAVAILABLE');END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(a->'evidence_refs')LOOP dto:=public.uc_admission_evidence_dto((e->>'evidence_id')::uuid,p_actor);IF dto IS NULL OR dto->>'case_id'IS DISTINCT FROM c.id::text OR dto->'can_read_bytes'IS DISTINCT FROM'true'::jsonb OR dto->>'availability'IS DISTINCT FROM'available'OR dto->'byte_sha256'IS DISTINCT FROM e->'byte_sha256'OR dto->'byte_size'IS DISTINCT FROM e->'byte_size'THEN PERFORM public.uc_education_issue_error('SOURCE_UNAVAILABLE');END IF;END LOOP;
 IF p_fresh AND i.final_record_id IS NULL THEN
 IF NOT public.uc_education_template_current(p.organization_id,p.template,p.template_storage)THEN PERFORM public.uc_education_issue_error('ARTIFACT_REVIEW_REQUIRED');END IF;
 IF public.uc_education_number_witness(i.organization_id,(i.number_plan->>'issue_date')::date)IS DISTINCT FROM p.number_witness THEN PERFORM public.uc_education_issue_error('NUMBER_PLAN_STALE');END IF;
 IF p.kind='original'THEN
 IF public.uc_enrollment_is_withdrawn(i.enrollment_id)OR public.uc_admission_program(i.organization_id,i.user_id,i.group_id,i.enrollment_id)IS DISTINCT FROM proof->'program_ref'OR c.revision<>(a->>'revision')::bigint OR c.decision->'event_id'IS DISTINCT FROM a->'decision_event_id'OR c.decision->>'outcome'IS DISTINCT FROM'admitted'OR c.decision->'later_review_required'IS DISTINCT FROM'false'::jsonb OR NOT public.uc_admission_rules_current(c.id)OR public.uc_admission_requirements_digest(c.id)IS DISTINCT FROM a->>'requirements_digest'THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 SELECT *INTO s FROM public.uc_learning_outcome_states WHERE program_enrollment_snapshot_id=(proof->'program_ref'->>'enrollment_snapshot_id')::uuid AND organization_id=i.organization_id AND enrollment_id=i.enrollment_id;
 SELECT *INTO m FROM public.uc_learning_machine_results WHERE id=s.machine_id AND state_id=s.id;SELECT *INTO d FROM public.uc_learning_attestation_decisions WHERE id=s.decision_id AND state_id=s.id;
 IF s.id IS NULL OR m.id IS NULL OR d.id IS NULL OR s.revision<>(proof->'outcome_ref'->>'revision')::bigint OR s.machine_id IS DISTINCT FROM(proof->'outcome_ref'->>'machine_result_id')::uuid OR s.decision_id IS DISTINCT FROM(proof->'outcome_ref'->>'decision_id')::uuid OR d.redacted OR d.outcome<>'passed'OR d.machine_result_id IS DISTINCT FROM m.id OR m.input_hash IS DISTINCT FROM public.uc_learning_evaluate(s)->>'input_hash'OR(d.basis='machine'AND m.evaluation->>'eligibility'<>'eligible')OR(d.basis='recognition'AND d.source_proof->'recognition_proof'IS DISTINCT FROM public.uc_learning_recognition_proof(i.organization_id,(d.source_proof->>'recognition_file_version_id')::uuid))THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 SELECT jsonb_build_object('user_id',pr.user_id,'full_name',btrim(pr.full_name),'birth_date',f.birth_date,'registration_hash',proof->'identity_ref'->'registration_hash','source','current_student_registration')INTO identity FROM public.profiles pr JOIN public.student_frdo_data f ON f.user_id=pr.user_id AND f.organization_id=pr.organization_id WHERE pr.user_id=i.user_id AND pr.organization_id=i.organization_id;
 IF identity IS DISTINCT FROM i.official_identity THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM public.education_document_records r JOIN public.uc_education_issuance_states x ON x.record_id=r.id WHERE r.id=(p.plan->'change'->>'record_id')::uuid AND r.organization_id=i.organization_id AND r.user_id=i.user_id AND r.enrollment_id=i.enrollment_id AND r.document_status='original'AND r.deleted_at IS NULL AND x.revision=(p.plan->'change'->>'expected_revision')::bigint AND x.annulment IS NULL AND NOT x.redacted AND public.uc_education_issue_state_hash(r.id)=p.plan->'change'->>'expected_state_hash')THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 correct:=p.plan->'change'->'basis'->>'kind'='correction_replacement';IF public.uc_education_replacement_identity((p.plan->'change'->>'record_id')::uuid,correct)IS DISTINCT FROM i.official_identity THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 END IF;
 facts:=i.source_snapshot->'program_snapshot'->'facts';IF public.uc_education_render_variables(i.organization_id,i.official_identity,facts,i.number_plan,proof,i.frdo_facts->>'document_type')IS DISTINCT FROM i.render_variables THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 IF p.kind='original'OR p.plan->'change'->'basis'->>'kind'='correction_replacement'THEN IF public.uc_education_frdo_snapshot(i.organization_id,i.user_id,facts,i.number_plan,i.frdo_facts->>'document_type',CASE WHEN p.kind='duplicate'THEN i.frdo_facts END,p.kind='duplicate')IS DISTINCT FROM i.frdo_facts THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;END IF;
 END IF;RETURN i;END;$fn$;
CREATE FUNCTION public.uc_education_artifact_saved_source(p_item uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;v public.org_document_versions;d public.org_documents;o storage.objects;payload jsonb;name text;path text;BEGIN
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item;SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 SELECT *INTO v FROM public.org_document_versions WHERE organization_id=i.organization_id AND document_id=i.output_document_id AND request_id=i.output_request_id;
 IF v.id IS NULL THEN RETURN NULL;END IF;SELECT *INTO d FROM public.org_documents WHERE id=v.document_id AND organization_id=i.organization_id;SELECT *INTO o FROM storage.objects WHERE id=v.storage_object_id;
 name:='Проверенный документ — выдача ещё не зарегистрирована';path:=i.organization_id::text||'/versions/'||i.output_document_id::text||'/'||i.output_request_id::text||'.pdf';
 payload:=jsonb_build_object('document_id',i.output_document_id,'organization_id',i.organization_id,'expected_revision',0,'upload',jsonb_build_object('file_path',path,'file_name','education-document.pdf','file_size',i.staging_proof->'byte_size','change_summary','Сформирован проверенный PDF; выдача ещё не зарегистрирована.'),'restore_version_id',NULL,'document',jsonb_build_object('name',name,'type','other','issue_date',i.number_plan->'issue_date','status','active'));
 IF i.staging_proof IS NULL OR v.request_payload IS DISTINCT FROM payload OR v.uploaded_by IS DISTINCT FROM p.actor_id OR v.version_number<>1 OR v.result_revision<>1 OR d.current_version_id IS DISTINCT FROM v.id OR d.deleted_at IS NOT NULL OR coalesce(d.status,'active')IN('archived','expired')OR v.file_path IS DISTINCT FROM path OR v.file_name IS DISTINCT FROM'education-document.pdf'OR v.file_size IS DISTINCT FROM(i.staging_proof->>'byte_size')::bigint OR v.storage_metadata->>'mimetype'IS DISTINCT FROM'application/pdf'OR NOT public.uc_copy_registry_object_matches(v)THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('source',public.uc_copy_registry_original_ref(v),'object',jsonb_build_object('object_id',o.id,'updated_at',o.updated_at));END;$fn$;
CREATE FUNCTION public.uc_education_artifact_context_json(p_actor uuid,p_preparation uuid,p_item uuid,p_revision bigint,p_request uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;saved jsonb;artifact jsonb;mode text;path text;BEGIN
 i:=public.uc_education_artifact_live(p_actor,p_preparation,p_item,p_revision,true);SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=p_preparation;saved:=public.uc_education_artifact_saved_source(i.id);
 IF i.artifact IS NOT NULL THEN artifact:=i.artifact||jsonb_build_object('output_review',public.uc_education_output_approval(i.id));END IF;
 mode:=CASE WHEN i.final_record_id IS NOT NULL THEN'consumed'WHEN artifact IS NOT NULL THEN'rendered'WHEN i.staging_proof IS NOT NULL THEN'staged'ELSE'prepared'END;
 path:=i.organization_id::text||'/versions/'||i.output_document_id::text||'/'||i.output_request_id::text||'.pdf';
 RETURN jsonb_build_object('schema_version',1,'organization_id',i.organization_id,'preparation_id',p.id,'item_id',i.id,'input_revision',i.input_revision,'request_id',p_request,'user_id',p_actor,'subject_user_id',i.user_id,'scope',p.scope,'mode',mode,'final_record_id',i.final_record_id,'render_input_hash',i.render_input_hash,
 'template',jsonb_build_object('ref',p.template,'storage',p.template_storage),'variables',i.render_variables,'staging',jsonb_build_object('bucket','education-issuance-staging','path',i.user_id::text||'/'||i.organization_id::text||'/'||p.id::text||'/'||i.id::text||'/'||i.render_input_hash||'.pdf','proof',i.staging_proof),
 'output',jsonb_build_object('document_id',i.output_document_id,'upload_request_id',i.output_request_id,'expected_revision',0,'file_path',path,'file_name','education-document.pdf','document',jsonb_build_object('name','Проверенный документ — выдача ещё не зарегистрирована','type','other','issue_date',i.number_plan->'issue_date','status','active'),'source',saved->'source','object',saved->'object','artifact',artifact));END;$fn$;
CREATE FUNCTION public.uc_education_artifact_context(p_organization_id uuid,p_preparation_id uuid,p_item_id uuid,p_input_revision bigint,p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms' AS $fn$
DECLARE p public.uc_education_issuance_preparations;i public.uc_education_issuance_preparation_items;h text;req public.uc_education_issuance_requests;BEGIN
 IF p_request_id IS NULL OR p_input_revision IS NULL OR p_input_revision<1 THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 p:=public.uc_education_preparation_access(p_preparation_id,true,p_item_id);IF p.organization_id IS DISTINCT FROM p_organization_id THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 i:=public.uc_education_artifact_live(auth.uid(),p.id,p_item_id,p_input_revision,true);h:=public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'preparation_id',p_preparation_id,'item_id',p_item_id,'input_revision',p_input_revision));
 PERFORM public.uc_education_issue_fence(p.organization_id,i.group_id,ARRAY[auth.uid(),i.user_id],'render:'||auth.uid()::text||':'||p_request_id::text);
 SELECT *INTO req FROM public.uc_education_issuance_requests WHERE actor_id=auth.uid()AND request_id=p_request_id;
 IF req.request_id IS NOT NULL THEN IF req.organization_id<>p.organization_id OR req.scope IS DISTINCT FROM p.scope OR req.action<>'render_artifact'OR req.payload_hash<>h THEN PERFORM public.uc_education_issue_error('REQUEST_CONFLICT');END IF;
 ELSE INSERT INTO public.uc_education_issuance_requests(actor_id,request_id,organization_id,scope,action,payload_hash,receipt,participant_ids)VALUES(auth.uid(),p_request_id,p.organization_id,p.scope,'render_artifact',h,jsonb_build_object('preparation_id',p.id,'item_id',i.id,'input_revision',i.input_revision),ARRAY[auth.uid(),i.user_id]);END IF;
 RETURN public.uc_education_artifact_context_json(auth.uid(),p.id,i.id,i.input_revision,p_request_id);
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN RAISE EXCEPTION 'EDUCATION_ISSUANCE_REVISION_CONFLICT' USING ERRCODE='PT409';WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END;$fn$;

CREATE FUNCTION public.uc_education_artifact_service_request(p_actor uuid,p_org uuid,p_preparation uuid,p_item uuid,p_revision bigint,p_request uuid)RETURNS public.uc_education_issuance_preparation_items LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;h text;BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR p_actor IS NULL OR p_request IS NULL THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=p_preparation AND organization_id=p_org AND actor_id=p_actor AND NOT redacted FOR UPDATE;
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item AND preparation_id=p_preparation AND organization_id=p_org AND input_revision=p_revision AND NOT redacted FOR UPDATE;
 IF p.id IS NULL OR i.id IS NULL THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 h:=public.uc_program_hash(jsonb_build_object('organization_id',p_org,'preparation_id',p_preparation,'item_id',p_item,'input_revision',p_revision));
 IF NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_requests r WHERE r.actor_id=p_actor AND r.request_id=p_request AND r.organization_id=p_org AND r.scope=p.scope AND r.action='render_artifact'AND r.payload_hash=h)THEN PERFORM public.uc_education_issue_error('REQUEST_CONFLICT');END IF;
 PERFORM 1 FROM public.org_documents WHERE id=(p.template->'source'->>'document_id')::uuid AND organization_id=p_org FOR SHARE;
 PERFORM 1 FROM public.org_document_versions WHERE id=(p.template->'source'->>'version_id')::uuid AND organization_id=p_org FOR SHARE;
 PERFORM 1 FROM public.org_document_reviews WHERE id=(p.template->>'review_id')::uuid AND organization_id=p_org FOR SHARE;
 PERFORM 1 FROM storage.objects WHERE id=(p.template_storage->>'object_id')::uuid FOR SHARE;
 i:=public.uc_education_artifact_live(p_actor,p_preparation,p_item,p_revision,true);RETURN i;END;$fn$;
CREATE FUNCTION public.uc_education_artifact_attest_shape(p_proof jsonb,p_stage boolean)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE k text;keys text[];BEGIN keys:=CASE WHEN p_stage THEN ARRAY['render_input_hash','template_source_hash','template_object_id','template_updated_at','template_byte_sha256','html_sha256','staged_object_id','staged_updated_at','byte_sha256','byte_size','mime_type','renderer','renderer_revision']ELSE ARRAY['render_input_hash','staged_object_id','staged_updated_at','source','output_object_id','output_updated_at','byte_sha256','byte_size','mime_type','renderer','renderer_revision']END;
 IF NOT public.uc_admission_shape(p_proof,keys)OR p_proof->>'mime_type'IS DISTINCT FROM'application/pdf'OR p_proof->>'renderer'IS DISTINCT FROM'browserless'OR p_proof->>'renderer_revision'IS DISTINCT FROM'uc019-v1'OR coalesce(p_proof->>'byte_size','')!~'^[0-9]+$'OR(p_proof->>'byte_size')::numeric NOT BETWEEN 1 AND 20971520 THEN RETURN false;END IF;
 FOREACH k IN ARRAY CASE WHEN p_stage THEN ARRAY['render_input_hash','template_source_hash','template_byte_sha256','html_sha256','byte_sha256']ELSE ARRAY['render_input_hash','byte_sha256']END LOOP IF jsonb_typeof(p_proof->k)IS DISTINCT FROM'string'OR p_proof->>k!~'^[a-f0-9]{64}$'THEN RETURN false;END IF;END LOOP;
 FOREACH k IN ARRAY CASE WHEN p_stage THEN ARRAY['template_object_id','staged_object_id']ELSE ARRAY['staged_object_id','output_object_id']END LOOP IF NOT public.uc_admission_uuid(p_proof->k)THEN RETURN false;END IF;END LOOP;
 FOREACH k IN ARRAY CASE WHEN p_stage THEN ARRAY['template_updated_at','staged_updated_at']ELSE ARRAY['staged_updated_at','output_updated_at']END LOOP IF jsonb_typeof(p_proof->k)IS DISTINCT FROM'string'OR length(p_proof->>k)>64 OR p_proof->>k!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'THEN RETURN false;END IF;END LOOP;RETURN true;END;$fn$;
CREATE FUNCTION public.uc_attest_education_issuance_staging(p_actor_id uuid,p_organization_id uuid,p_preparation_id uuid,p_item_id uuid,p_input_revision bigint,p_request_id uuid,p_proof jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage SET lock_timeout='2000ms' AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;o storage.objects;proof jsonb;meta jsonb;BEGIN
 i:=public.uc_education_artifact_service_request(p_actor_id,p_organization_id,p_preparation_id,p_item_id,p_input_revision,p_request_id);SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF NOT public.uc_education_artifact_attest_shape(p_proof,true)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 IF p_proof->>'render_input_hash'IS DISTINCT FROM i.render_input_hash OR p_proof->>'template_source_hash'IS DISTINCT FROM p.template->'source'->>'content_hash'OR p_proof->'template_object_id'IS DISTINCT FROM p.template_storage->'object_id'OR(p_proof->>'template_updated_at')::timestamptz IS DISTINCT FROM(p.template_storage->>'updated_at')::timestamptz OR(p.template_byte_sha256 IS NOT NULL AND p.template_byte_sha256 IS DISTINCT FROM p_proof->>'template_byte_sha256')THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 SELECT *INTO o FROM storage.objects WHERE id=(p_proof->>'staged_object_id')::uuid AND bucket_id='education-issuance-staging'AND name=i.user_id::text||'/'||i.organization_id::text||'/'||p.id::text||'/'||i.id::text||'/'||i.render_input_hash||'.pdf'FOR SHARE;
 meta:=jsonb_build_object('preparation_id',p.id,'item_id',i.id,'render_input_hash',i.render_input_hash,'template_byte_sha256',p_proof->'template_byte_sha256','html_sha256',p_proof->'html_sha256','byte_sha256',p_proof->'byte_sha256','renderer','browserless','renderer_revision','uc019-v1');
 IF o.id IS NULL OR o.owner IS NOT NULL OR nullif(o.owner_id,'')IS NOT NULL OR o.user_metadata IS DISTINCT FROM meta OR o.updated_at IS DISTINCT FROM(p_proof->>'staged_updated_at')::timestamptz OR coalesce(o.metadata->>'size','')!~'^[0-9]+$'OR(o.metadata->>'size')::bigint IS DISTINCT FROM(p_proof->>'byte_size')::bigint OR o.metadata->>'mimetype'IS DISTINCT FROM'application/pdf'THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 proof:=jsonb_build_object('object_id',o.id,'updated_at',o.updated_at,'byte_sha256',p_proof->'byte_sha256','byte_size',(p_proof->>'byte_size')::bigint,'template_byte_sha256',p_proof->'template_byte_sha256','html_sha256',p_proof->'html_sha256','renderer','browserless','renderer_revision','uc019-v1');
 IF i.staging_proof IS NOT NULL AND i.staging_proof IS DISTINCT FROM proof THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 UPDATE public.uc_education_issuance_preparations SET template_byte_sha256=p_proof->>'template_byte_sha256'WHERE id=p.id;
 UPDATE public.uc_education_issuance_preparation_items SET staging_proof=proof WHERE id=i.id;
 PERFORM public.uc_education_artifact_live(p_actor_id,p.id,i.id,i.input_revision,true);
 RETURN jsonb_build_object('schema_version',1,'kind','staging_attested','organization_id',i.organization_id,'preparation_id',p.id,'item_id',i.id,'input_revision',i.input_revision,'render_input_hash',i.render_input_hash,'byte_sha256',proof->'byte_sha256','byte_size',proof->'byte_size','object_id',o.id,'updated_at',o.updated_at);
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN RAISE EXCEPTION 'EDUCATION_ISSUANCE_REVISION_CONFLICT' USING ERRCODE='PT409';WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END;$fn$;
CREATE FUNCTION public.uc_attest_education_issuance_artifact(p_actor_id uuid,p_organization_id uuid,p_preparation_id uuid,p_item_id uuid,p_input_revision bigint,p_request_id uuid,p_proof jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage SET lock_timeout='2000ms' AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;saved jsonb;o storage.objects;stage storage.objects;v_artifact jsonb;BEGIN
 i:=public.uc_education_artifact_service_request(p_actor_id,p_organization_id,p_preparation_id,p_item_id,p_input_revision,p_request_id);SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF NOT public.uc_education_artifact_attest_shape(p_proof,false)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 IF i.staging_proof IS NULL OR p_proof->>'render_input_hash'IS DISTINCT FROM i.render_input_hash OR p_proof->'byte_sha256'IS DISTINCT FROM i.staging_proof->'byte_sha256'OR p_proof->'byte_size'IS DISTINCT FROM i.staging_proof->'byte_size'OR p_proof->'staged_object_id'IS DISTINCT FROM i.staging_proof->'object_id'OR(p_proof->>'staged_updated_at')::timestamptz IS DISTINCT FROM(i.staging_proof->>'updated_at')::timestamptz THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 SELECT *INTO stage FROM storage.objects WHERE id=(i.staging_proof->>'object_id')::uuid AND bucket_id='education-issuance-staging'FOR SHARE;IF stage.id IS NULL OR stage.updated_at IS DISTINCT FROM(i.staging_proof->>'updated_at')::timestamptz OR stage.owner IS NOT NULL OR nullif(stage.owner_id,'')IS NOT NULL THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 PERFORM 1 FROM public.org_documents WHERE id=i.output_document_id AND organization_id=i.organization_id FOR SHARE;PERFORM 1 FROM public.org_document_versions WHERE document_id=i.output_document_id AND request_id=i.output_request_id AND organization_id=i.organization_id FOR SHARE;
 saved:=public.uc_education_artifact_saved_source(i.id);IF saved IS NULL OR saved->'source'IS DISTINCT FROM p_proof->'source'OR saved->'object'->'object_id'IS DISTINCT FROM p_proof->'output_object_id'OR(saved->'object'->>'updated_at')::timestamptz IS DISTINCT FROM(p_proof->>'output_updated_at')::timestamptz THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 SELECT *INTO o FROM storage.objects WHERE id=(p_proof->>'output_object_id')::uuid FOR SHARE;
 IF o.id IS NULL OR o.updated_at IS DISTINCT FROM(p_proof->>'output_updated_at')::timestamptz OR(o.metadata->>'size')::bigint IS DISTINCT FROM(p_proof->>'byte_size')::bigint OR o.metadata->>'mimetype'IS DISTINCT FROM'application/pdf'THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 v_artifact:=jsonb_build_object('source',p_proof->'source','byte_sha256',p_proof->'byte_sha256','byte_size',(p_proof->>'byte_size')::bigint,'render_input_hash',i.render_input_hash,'template_byte_sha256',i.staging_proof->'template_byte_sha256','html_sha256',i.staging_proof->'html_sha256','renderer','browserless','renderer_revision','uc019-v1','output_review',NULL);
 IF i.artifact IS NOT NULL AND i.artifact IS DISTINCT FROM v_artifact THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 UPDATE public.uc_education_issuance_preparation_items SET artifact=v_artifact WHERE id=i.id;
 PERFORM public.uc_education_artifact_live(p_actor_id,p.id,i.id,i.input_revision,true);
 RETURN jsonb_build_object('schema_version',1,'kind','artifact_attested','organization_id',i.organization_id,'preparation_id',p.id,'item_id',i.id,'input_revision',i.input_revision,'render_input_hash',i.render_input_hash,'byte_sha256',v_artifact->'byte_sha256','byte_size',v_artifact->'byte_size','object_id',o.id,'updated_at',o.updated_at);
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN RAISE EXCEPTION 'EDUCATION_ISSUANCE_REVISION_CONFLICT' USING ERRCODE='PT409';WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_guard_program_issuance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE s public.group_program_enrollment_snapshots;f jsonb;t text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF public.uc_program_issuance_lifecycle(to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM public.education_document_program_sources WHERE record_id=OLD.id) THEN RAISE EXCEPTION 'issued_program_source_is_immutable' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT (jsonb_populate_record(NULL::public.group_program_enrollment_snapshots,c.source_snapshot)).* INTO s FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=NEW.organization_id AND c.enrollment_id=NEW.enrollment_id AND c.user_id=NEW.user_id AND c.course_id=NEW.course_id AND c.group_id=NEW.group_id AND c.mode='duplicate';
 IF s.id IS NULL THEN s:=public.uc_program_issuance_source(NEW.organization_id,NEW.group_id,NEW.enrollment_id,NEW.user_id,NEW.course_id);END IF;
 f:=s.program_snapshot->'facts';t:=CASE f->>'program_type' WHEN 'dpo_upskilling' THEN 'certificate' WHEN 'dpo_retraining' THEN 'diploma' WHEN 'professional_training' THEN 'qualification' END;
 IF t IS NULL OR NEW.document_type IS DISTINCT FROM t THEN RAISE EXCEPTION 'education_document_type_program_mismatch' USING ERRCODE='22023'; END IF;
 -- These fields are server-derived; neither a live course title nor a caller's export row is authoritative.
 NEW.specialty_name:=f->>'full_title';NEW.qualification_name:=coalesce(f->>'qualification',f->>'profession');
 RETURN NEW;
END;$function$;

CREATE OR REPLACE FUNCTION public.uc_record_program_issuance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE s public.group_program_enrollment_snapshots;
BEGIN
 IF TG_OP='UPDATE' AND public.uc_program_issuance_lifecycle(to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
 SELECT (jsonb_populate_record(NULL::public.group_program_enrollment_snapshots,c.source_snapshot)).* INTO s FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=NEW.organization_id AND c.enrollment_id=NEW.enrollment_id AND c.user_id=NEW.user_id AND c.course_id=NEW.course_id AND c.group_id=NEW.group_id AND c.mode='duplicate';
 IF s.id IS NULL THEN s:=public.uc_program_issuance_source(NEW.organization_id,NEW.group_id,NEW.enrollment_id,NEW.user_id,NEW.course_id);END IF;
 INSERT INTO public.education_document_program_sources(record_id,organization_id,enrollment_snapshot_id,snapshot,recorded_by)
 VALUES(NEW.id,NEW.organization_id,s.id,to_jsonb(s),auth.uid());RETURN NEW;
END;$function$;

CREATE FUNCTION public.uc_education_artifact_final(p_org uuid,p_group uuid,p_ref jsonb)RETURNS public.uc_education_issuance_preparation_items LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;review jsonb;expected jsonb;BEGIN
 IF NOT public.uc_admission_shape(p_ref,ARRAY['preparation_id','item_id','input_revision','source','byte_sha256','byte_size','render_input_hash','template_byte_sha256','html_sha256','renderer','renderer_revision','output_review_id','output_review_revision'])OR NOT public.uc_admission_uuid(p_ref->'preparation_id')OR NOT public.uc_admission_uuid(p_ref->'item_id')OR coalesce(p_ref->>'input_revision','')!~'^[0-9]+$'THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 p:=public.uc_education_preparation_access((p_ref->>'preparation_id')::uuid,true,(p_ref->>'item_id')::uuid);IF p.organization_id<>p_org OR p.scope IS DISTINCT FROM (CASE WHEN p_group IS NULL THEN jsonb_build_object('kind','organization')ELSE jsonb_build_object('kind','group','group_id',p_group)END) THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 PERFORM 1 FROM public.uc_education_issuance_preparations WHERE id=p.id FOR UPDATE;SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=(p_ref->>'item_id')::uuid AND preparation_id=p.id FOR UPDATE;
 IF i.final_record_id IS NOT NULL OR i.input_revision<>(p_ref->>'input_revision')::bigint OR i.artifact IS NULL THEN PERFORM public.uc_education_issue_error('ARTIFACT_UNAVAILABLE');END IF;
 PERFORM public.uc_education_issue_source_lock(p_org,p.template->'source');PERFORM 1 FROM public.org_document_reviews WHERE id=(p.template->>'review_id')::uuid AND organization_id=p_org FOR SHARE;
 PERFORM public.uc_education_issue_source_lock(p_org,i.artifact->'source');review:=public.uc_education_output_approval(i.id);
 IF review IS NULL THEN PERFORM public.uc_education_issue_error('ARTIFACT_REVIEW_REQUIRED');END IF;PERFORM 1 FROM public.org_document_reviews WHERE id=(review->>'id')::uuid AND organization_id=p_org FOR SHARE;
 expected:=(i.artifact-'output_review')||jsonb_build_object('preparation_id',p.id,'item_id',i.id,'input_revision',i.input_revision,'output_review_id',review->'id','output_review_revision',review->'revision');
 IF p_ref IS DISTINCT FROM expected THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 PERFORM public.uc_education_artifact_live(auth.uid(),p.id,i.id,i.input_revision,true);RETURN i;END;$fn$;
CREATE FUNCTION public.uc_education_issue_one(p_item uuid,p_artifact jsonb,p_reason text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;r public.education_document_records;s public.uc_education_issuance_states;original public.education_document_records;old public.uc_education_issuance_states;official jsonb;item jsonb;source jsonb;context_id uuid;registry jsonb;context jsonb;data jsonb;event_id uuid:=gen_random_uuid();duplicate_event uuid;before_hash text;after_hash text;mode text;original_data text;BEGIN
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item FOR UPDATE;SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF p.actor_id IS DISTINCT FROM auth.uid()OR i.final_record_id IS NOT NULL OR i.redacted OR p.redacted THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 mode:=CASE p.kind WHEN'original'THEN'original'ELSE'duplicate'END;
 IF mode='duplicate'THEN SELECT *INTO original FROM public.education_document_records WHERE id=(p.plan->'change'->>'record_id')::uuid;SELECT *INTO old FROM public.uc_education_issuance_states WHERE record_id=original.id;before_hash:=public.uc_education_issue_state_hash(original.id);
 original_data:=jsonb_build_object('record_id',original.id,'document_number',original.document_number,'reg_number',original.reg_number,'issue_date',original.issue_date)::text;END IF;
 official:=i.official_identity||i.number_plan||jsonb_build_object('document_type',i.frdo_facts->'document_type','original_document_data',original_data);
 INSERT INTO public.uc_education_issuance_contexts(transaction_id,backend_pid,actor_id,organization_id,mode,enrollment_id,user_id,course_id,group_id,original_record_id,proof,source_snapshot,official_identity)
 VALUES(txid_current(),pg_backend_pid(),auth.uid(),i.organization_id,mode,i.enrollment_id,i.user_id,i.course_id,i.group_id,original.id,i.eligibility_ref,i.source_snapshot,official)RETURNING id INTO context_id;
 item:=jsonb_build_object('user_id',i.user_id,'enrollment_id',i.enrollment_id,'document_type',i.frdo_facts->'document_type','issue_date',i.number_plan->'issue_date','document_series',i.number_plan->'document_series','full_name',i.official_identity->'full_name','birth_date',i.official_identity->'birth_date','document_status',mode,'original_document_data',original_data,'notes','');
 SELECT *INTO r FROM public.issue_education_document_batch(i.organization_id,i.group_id,i.course_id,jsonb_build_array(item));
 DELETE FROM public.uc_education_issuance_contexts WHERE id=context_id;
 IF r.id IS NULL OR r.document_number IS DISTINCT FROM i.number_plan->>'document_number'OR r.reg_number IS DISTINCT FROM i.number_plan->>'reg_number'OR r.delivery_method IS DISTINCT FROM'not_recorded'OR r.document_status<>mode THEN PERFORM public.uc_education_issue_error('NUMBER_PLAN_STALE');END IF;
 context:=public.uc_document_registry_context(i.organization_id,CASE WHEN p.scope->>'kind'='group'THEN(p.scope->>'group_id')::uuid END,jsonb_build_object('kind','student','user_id',i.user_id),jsonb_build_object('kind','enrollment','enrollment_id',i.enrollment_id,'binding_hash',repeat('0',64)),false)->'context';
 data:=jsonb_build_object('direction','outgoing','document_type',r.document_type,'title',CASE r.document_type WHEN'certificate'THEN'Удостоверение'WHEN'diploma'THEN'Диплом'ELSE'Свидетельство'END||' № '||r.document_number,'document_date',r.issue_date,'declared_document_number',r.document_number,'source',p_artifact->'source','sender',jsonb_build_object('kind','organization','organization_id',i.organization_id),'recipient',jsonb_build_object('kind','student','user_id',i.user_id),'subject',jsonb_build_object('kind','student','user_id',i.user_id),'context',context,'origin',jsonb_build_object('kind','org_document'),'notes','Зарегистрирован проверенный файл выданного документа. Факт передачи фиксируется отдельно.');
 registry:=public.apply_document_registry_action(i.organization_id,p.scope,0,gen_random_uuid(),jsonb_build_object('action','register','data',data,'reason',p_reason));
 IF registry->'record'->>'id'IS NULL THEN PERFORM public.uc_education_issue_error('DEPENDENCY_UNAVAILABLE');END IF;
 INSERT INTO public.uc_education_issuance_states(record_id,organization_id,user_id,course_id,enrollment_id,group_id,revision,original_record_id,registry_record_id,proof,artifact,frdo_facts,notes,recorded_by,updated_by,participant_ids)
 VALUES(r.id,i.organization_id,i.user_id,i.course_id,i.enrollment_id,i.group_id,1,original.id,(registry->'record'->>'id')::uuid,i.eligibility_ref,p_artifact,i.frdo_facts,'',auth.uid(),auth.uid(),ARRAY[i.user_id,auth.uid()]);
 after_hash:=public.uc_education_issue_state_hash(r.id);
 INSERT INTO public.uc_education_issuance_events(id,record_id,organization_id,user_id,revision,kind,actor_id,reason,previous_state_hash,state_hash,payload,participant_ids)
 VALUES(event_id,r.id,i.organization_id,i.user_id,1,'issued',auth.uid(),p_reason,public.uc_program_hash(jsonb_build_object('record_id',r.id,'revision',0)),after_hash,jsonb_build_object('kind','issued','official',to_jsonb(r)-'deleted_by','proof',i.eligibility_ref,'proof_availability','captured','artifact',p_artifact,'frdo_facts',i.frdo_facts),ARRAY[i.user_id,auth.uid()]);
 UPDATE public.uc_education_issuance_preparation_items SET final_record_id=r.id WHERE id=i.id;
 IF mode='duplicate'THEN
 IF old.revision>=9007199254740991 THEN PERFORM public.uc_education_issue_error('LIMIT_EXCEEDED');END IF;duplicate_event:=gen_random_uuid();
 UPDATE public.uc_education_issuance_states SET revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp(),participant_ids=array_append(participant_ids,auth.uid())WHERE record_id=original.id;
 INSERT INTO public.uc_education_issuance_events(id,record_id,organization_id,user_id,revision,kind,actor_id,reason,previous_state_hash,state_hash,payload,participant_ids)
 VALUES(duplicate_event,original.id,i.organization_id,i.user_id,old.revision+1,'duplicate_issued',auth.uid(),p_reason,before_hash,public.uc_education_issue_state_hash(original.id),jsonb_build_object('kind','duplicate_issued','original_record_id',original.id,'duplicate_record_id',r.id,'basis',p.plan->'change'->'basis'),ARRAY[i.user_id,auth.uid()]);
 END IF;
 RETURN jsonb_build_object('record_id',r.id,'original_record_id',original.id,'event_ids',CASE WHEN duplicate_event IS NULL THEN jsonb_build_array(event_id)ELSE jsonb_build_array(event_id,duplicate_event)END,'enrollment_id',i.enrollment_id);END;$fn$;

CREATE FUNCTION public.uc_education_change_apply(p_org uuid,p_group uuid,p_change jsonb,p_preview_hash text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE r public.education_document_records;s public.uc_education_issuance_states;preview jsonb;op text:=p_change->>'action';eid uuid:=gen_random_uuid();payload jsonb;kind text;old_notes text;prior text;BEGIN
 SELECT *INTO r FROM public.education_document_records WHERE id=(p_change->>'record_id')::uuid AND organization_id=p_org FOR UPDATE;
 IF r.id IS NULL THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;PERFORM public.uc_education_issue_fence(p_org,p_group,ARRAY[r.user_id,auth.uid()]);
 SELECT *INTO s FROM public.uc_education_issuance_states WHERE record_id=r.id FOR UPDATE;
 preview:=public.uc_education_change_preview(p_org,p_group,p_change);IF preview->>'preview_hash'IS DISTINCT FROM p_preview_hash THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;
 IF op='issue_duplicate'THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;prior:=public.uc_education_issue_state_hash(r.id);old_notes:=coalesce(s.notes,r.notes,'');
 IF coalesce(s.revision,0)>=9007199254740991 THEN PERFORM public.uc_education_issue_error('LIMIT_EXCEEDED');END IF;
 IF op='record_handover'THEN PERFORM public.uc_education_issue_source_lock(p_org,p_change->'handover'->'evidence');IF p_change->'handover'?'authorization'THEN PERFORM public.uc_education_issue_source_lock(p_org,p_change->'handover'->'authorization');END IF;
 ELSIF op='annul'THEN PERFORM public.uc_education_issue_source_lock(p_org,p_change->'basis'->'source');END IF;
 IF s.record_id IS NULL THEN INSERT INTO public.uc_education_issuance_states(record_id,organization_id,user_id,course_id,enrollment_id,group_id,revision,notes,recorded_by,updated_by,participant_ids)VALUES(r.id,p_org,r.user_id,r.course_id,r.enrollment_id,r.group_id,1,old_notes,auth.uid(),auth.uid(),array_remove(ARRAY[r.user_id,auth.uid()],NULL));
 ELSE UPDATE public.uc_education_issuance_states SET revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp(),participant_ids=array_append(participant_ids,auth.uid())WHERE record_id=r.id;END IF;
 IF op='correct_metadata'THEN kind:='metadata_corrected';payload:=jsonb_build_object('kind',kind,'before_notes',old_notes,'after_notes',p_change->'patch'->'notes');UPDATE public.uc_education_issuance_states SET notes=p_change->'patch'->>'notes'WHERE record_id=r.id;
 ELSIF op='record_handover'THEN kind:='handover_recorded';payload:=jsonb_build_object('kind',kind,'handover',p_change->'handover');UPDATE public.uc_education_issuance_states SET latest_handover=jsonb_build_object('event_id',eid,'fact',p_change->'handover','recorded_at',clock_timestamp(),'recorded_by',auth.uid())WHERE record_id=r.id;
 ELSIF op='void_handover'THEN kind:='handover_voided';payload:=jsonb_build_object('kind',kind,'event_id',p_change->'event_id');UPDATE public.uc_education_issuance_states SET latest_handover=NULL WHERE record_id=r.id;
 ELSIF op='annul'THEN kind:='annulled';payload:=jsonb_build_object('kind',kind,'basis',p_change->'basis');UPDATE public.uc_education_issuance_states SET annulment=jsonb_build_object('event_id',eid,'recorded_at',clock_timestamp(),'actor_id',auth.uid(),'basis',p_change->'basis','reason',p_change->'reason')WHERE record_id=r.id;
 ELSE PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 SELECT *INTO s FROM public.uc_education_issuance_states WHERE record_id=r.id;
 INSERT INTO public.uc_education_issuance_events(id,record_id,organization_id,user_id,revision,kind,actor_id,reason,previous_state_hash,state_hash,payload,participant_ids)VALUES(eid,r.id,p_org,r.user_id,s.revision,kind,auth.uid(),p_change->>'reason',prior,public.uc_education_issue_state_hash(r.id),payload,array_remove(ARRAY[r.user_id,auth.uid()],NULL));
 RETURN jsonb_build_object('record_ids',jsonb_build_array(r.id),'enrollment_ids',CASE WHEN r.enrollment_id IS NULL THEN'[]'::jsonb ELSE jsonb_build_array(r.enrollment_id)END,'event_ids',jsonb_build_array(eid));END;$fn$;
CREATE FUNCTION public.uc_education_mutation_result(p_org uuid,p_scope jsonb,p_receipt jsonb,p_replayed boolean)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE g uuid;id jsonb;record jsonb;records jsonb:='[]';withdrawals jsonb:='[]';BEGIN g:=public.uc_education_issue_scope(p_org,p_scope);
 FOR id IN SELECT value FROM jsonb_array_elements(p_receipt->'record_ids')LOOP record:=public.uc_education_issue_record(p_org,g,(id#>>'{}')::uuid);IF record IS NULL THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;records:=records||jsonb_build_array(record);END LOOP;
 IF p_receipt->>'action'='withdraw_enrollments'THEN FOR id IN SELECT value FROM jsonb_array_elements(p_receipt->'enrollment_ids')LOOP withdrawals:=withdrawals||jsonb_build_array(public.uc_education_withdraw_state(p_org,g,(id#>>'{}')::uuid));END LOOP;END IF;
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_org,'scope',p_scope,'capabilities',public.uc_education_issue_caps(p_org,g),'receipt',p_receipt||jsonb_build_object('replayed',p_replayed),'records',records,'withdrawals',withdrawals);END;$fn$;
CREATE FUNCTION public.apply_education_issuance_action(p_organization_id uuid,p_scope jsonb,p_request_id uuid,p_action jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
<<issuance_apply>>
DECLARE g uuid;a uuid:=auth.uid();op text:=p_action->>'action';h text;req public.uc_education_issuance_requests;caps jsonb;preview jsonb;prep public.uc_education_issuance_preparations;i public.uc_education_issuance_preparation_items;x jsonb;change jsonb;result jsonb;receipt jsonb;records jsonb:='[]';enrollments jsonb:='[]';events jsonb:='[]';prep_id uuid;selected jsonb;people uuid[];BEGIN
 g:=public.uc_education_issue_scope(p_organization_id,p_scope);caps:=public.uc_education_issue_caps(p_organization_id,g);
 IF p_request_id IS NULL OR jsonb_typeof(p_action)IS DISTINCT FROM'object'OR octet_length(p_action::text)>2097152 OR op NOT IN('issue_batch','apply_change','withdraw_enrollments')THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 IF(op='issue_batch'AND caps->'can_issue'IS DISTINCT FROM'true'::jsonb)OR(op='withdraw_enrollments'AND caps->'can_withdraw'IS DISTINCT FROM'true'::jsonb)OR(op='apply_change'AND(CASE p_action->'change'->>'action'WHEN'correct_metadata'THEN caps->'can_write_metadata'WHEN'record_handover'THEN caps->'can_record_handover'WHEN'void_handover'THEN caps->'can_record_handover'WHEN'annul'THEN caps->'can_annul'WHEN'issue_duplicate'THEN caps->'can_issue_duplicate'END)IS DISTINCT FROM'true'::jsonb)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 h:=public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'scope',p_scope,'action',p_action));PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[a],'request:'||a::text||':'||p_request_id::text);
 SELECT *INTO req FROM public.uc_education_issuance_requests WHERE actor_id=a AND request_id=p_request_id;
 IF req.request_id IS NOT NULL THEN IF req.organization_id<>p_organization_id OR req.scope IS DISTINCT FROM p_scope OR req.action<>op OR req.payload_hash<>h THEN PERFORM public.uc_education_issue_error('REQUEST_CONFLICT');END IF;
 PERFORM public.uc_education_issue_fence(p_organization_id,g,req.participant_ids);RETURN public.uc_education_mutation_result(p_organization_id,p_scope,req.receipt,true);END IF;
 IF op='withdraw_enrollments'THEN IF NOT public.uc_admission_shape(p_action,ARRAY['action','intent','preview_hash','items','reason'])THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 result:=public.uc_education_withdraw_apply(p_organization_id,g,p_action->'intent',p_action->>'preview_hash',p_action->'items',p_action->>'reason');records:=result->'record_ids';enrollments:=result->'enrollment_ids';events:=result->'event_ids';
 ELSIF op='apply_change'AND p_action->'change'->>'action'<>'issue_duplicate'THEN
 IF NOT public.uc_admission_shape(p_action,ARRAY['action','preview_hash','change'])THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;result:=public.uc_education_change_apply(p_organization_id,g,p_action->'change',p_action->>'preview_hash');records:=result->'record_ids';enrollments:=result->'enrollment_ids';events:=result->'event_ids';
 ELSE
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_organization_id::text,0))THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;
 IF op='issue_batch'THEN
 IF NOT public.uc_admission_shape(p_action,ARRAY['action','intent','preview_hash','items','reason'])OR NOT public.uc_admission_text(p_action->'reason',2000)OR jsonb_typeof(p_action->'items')IS DISTINCT FROM'array'OR jsonb_array_length(p_action->'items')NOT BETWEEN 1 AND 100 THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 preview:=public.uc_education_issue_preview(p_organization_id,g,p_action->'intent',true);IF preview->'ready'IS DISTINCT FROM'true'::jsonb OR preview->>'preview_hash'IS DISTINCT FROM p_action->>'preview_hash'THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;
 IF(SELECT count(DISTINCT value->>'enrollment_id')FROM jsonb_array_elements(p_action->'items'))<>jsonb_array_length(p_action->'items')OR(SELECT jsonb_agg(value->'enrollment_id'ORDER BY value->>'enrollment_id')FROM jsonb_array_elements(p_action->'items'))IS DISTINCT FROM(SELECT jsonb_agg(value->'enrollment_id'ORDER BY value->>'enrollment_id')FROM jsonb_array_elements(preview->'candidates'))THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_action->'items')ORDER BY value->>'enrollment_id'LOOP
 IF NOT public.uc_admission_shape(x,ARRAY['enrollment_id','expected_eligibility_ref','artifact'])OR NOT public.uc_admission_uuid(x->'enrollment_id')THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 SELECT value INTO selected FROM jsonb_array_elements(preview->'candidates')WHERE value->'enrollment_id'=x->'enrollment_id';IF selected->'eligibility_ref'IS DISTINCT FROM x->'expected_eligibility_ref'THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;
 i:=public.uc_education_artifact_final(p_organization_id,g,x->'artifact');IF i.enrollment_id IS DISTINCT FROM(x->>'enrollment_id')::uuid OR i.eligibility_ref IS DISTINCT FROM x->'expected_eligibility_ref'OR(prep_id IS NOT NULL AND prep_id<>i.preparation_id)THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;prep_id:=i.preparation_id;
 END LOOP;
 SELECT *INTO prep FROM public.uc_education_issuance_preparations WHERE id=prep_id;
 IF prep.kind<>'original'OR prep.plan->'intent'IS DISTINCT FROM p_action->'intent'OR prep.plan->>'preview_hash'IS DISTINCT FROM p_action->>'preview_hash'OR prep.plan->'reason'IS DISTINCT FROM p_action->'reason'OR(SELECT count(*)FROM public.uc_education_issuance_preparation_items WHERE preparation_id=prep.id)<>jsonb_array_length(p_action->'items')THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_action->'items')ORDER BY value->>'enrollment_id'LOOP result:=public.uc_education_issue_one((x->'artifact'->>'item_id')::uuid,x->'artifact',p_action->>'reason');records:=records||jsonb_build_array(result->'record_id');enrollments:=enrollments||jsonb_build_array(result->'enrollment_id');events:=events||(result->'event_ids');END LOOP;
 ELSE
 IF NOT public.uc_admission_shape(p_action,ARRAY['action','preview_hash','change'])OR NOT public.uc_admission_shape(p_action->'change',ARRAY['action','record_id','expected_revision','expected_state_hash','issue_date','document_series','basis','reason','artifact'])THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 change:=p_action->'change';PERFORM 1 FROM public.education_document_records WHERE id=(change->>'record_id')::uuid AND organization_id=p_organization_id FOR UPDATE;PERFORM 1 FROM public.uc_education_issuance_states WHERE record_id=(change->>'record_id')::uuid FOR UPDATE;
 preview:=public.uc_education_change_preview(p_organization_id,g,change-'artifact');IF preview->>'preview_hash'IS DISTINCT FROM p_action->>'preview_hash'THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;
 PERFORM public.uc_education_issue_source_lock(p_organization_id,change->'basis'->'basis'->'source');i:=public.uc_education_artifact_final(p_organization_id,g,change->'artifact');SELECT *INTO prep FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF prep.kind<>'duplicate'OR prep.plan->'change'IS DISTINCT FROM(change-'artifact')OR prep.plan->>'preview_hash'IS DISTINCT FROM p_action->>'preview_hash'THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 result:=public.uc_education_issue_one(i.id,change->'artifact',change->>'reason');records:=jsonb_build_array(result->'original_record_id',result->'record_id');enrollments:=jsonb_build_array(result->'enrollment_id');events:=result->'event_ids';
 END IF;END IF;
 SELECT coalesce(array_agg(DISTINCT e.user_id ORDER BY e.user_id),'{}')INTO people FROM public.enrollments e WHERE e.id IN(SELECT enrollment_value.value::uuid FROM jsonb_array_elements_text(enrollments)AS enrollment_value(value));PERFORM public.uc_education_issue_fence(p_organization_id,g,people);
 receipt:=jsonb_build_object('request_id',p_request_id,'action',op,'scope_hash',public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'scope',p_scope)),'payload_hash',h,'record_ids',records,'enrollment_ids',enrollments,'event_ids',events,'applied_at',clock_timestamp(),'replayed',false);
 INSERT INTO public.uc_education_issuance_requests(actor_id,request_id,organization_id,scope,action,payload_hash,receipt,participant_ids)VALUES(a,p_request_id,p_organization_id,p_scope,op,h,receipt,array_append(people,a));RETURN public.uc_education_mutation_result(p_organization_id,p_scope,receipt,false);
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN RAISE EXCEPTION 'EDUCATION_ISSUANCE_REVISION_CONFLICT' USING ERRCODE='PT409';WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END;$fn$;

CREATE FUNCTION public.uc_education_withdraw_event(p_event uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE e public.uc_enrollment_withdrawal_events;before jsonb;after jsonb;BEGIN SELECT *INTO e FROM public.uc_enrollment_withdrawal_events WHERE id=p_event AND NOT redacted;IF e.id IS NULL THEN RETURN NULL;END IF;
 before:=e.before_state;after:=e.after_state;IF before->'basis'IS NOT NULL AND before->'basis'<>'null'::jsonb THEN before:=jsonb_set(before,'{basis}',public.uc_education_issue_basis_projection(e.organization_id,before->'basis'));END IF;IF after->'basis'IS NOT NULL AND after->'basis'<>'null'::jsonb THEN after:=jsonb_set(after,'{basis}',public.uc_education_issue_basis_projection(e.organization_id,after->'basis'));END IF;
 RETURN jsonb_build_object('id',e.id,'enrollment_id',e.enrollment_id,'revision',e.revision,'kind','withdrawn','recorded_at',e.recorded_at,'actor_id',e.actor_id,'reason',e.reason,'basis',public.uc_education_issue_basis_projection(e.organization_id,e.basis),'effective_date',e.effective_date,'before',before,'after',after);END;$fn$;
CREATE FUNCTION public.uc_education_html(p text)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$SELECT replace(replace(replace(replace(replace(coalesce(p,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;')$fn$;
CREATE FUNCTION public.uc_education_issue_export(p_org uuid,p_scope jsonb,p_selection jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE g uuid;id jsonb;r jsonb;records jsonb:='[]';history jsonb:='[]';missing jsonb:='[]';selected uuid[]:='{}';matches uuid[];candidate uuid;current public.education_document_records;e public.uc_education_issuance_events;snapshot jsonb;snapshot_text text;html text;size bigint;BEGIN
 g:=public.uc_education_issue_scope(p_org,p_scope);IF NOT coalesce((public.uc_education_issue_caps(p_org,g)->>'can_export')::boolean,false)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 IF p_selection->>'kind'='records'THEN IF NOT public.uc_admission_shape(p_selection,ARRAY['kind','record_ids'])OR NOT public.uc_admission_ids(p_selection->'record_ids',1,1000)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;SELECT array_agg(x::uuid ORDER BY x::uuid)INTO selected FROM jsonb_array_elements_text(p_selection->'record_ids')x;
 ELSIF p_selection->>'kind'='enrollments'THEN
 IF NOT public.uc_admission_shape(p_selection,ARRAY['kind','course_id','enrollment_ids'])OR NOT public.uc_admission_uuid(p_selection->'course_id')OR NOT public.uc_admission_ids(p_selection->'enrollment_ids',1,1000)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR id IN SELECT value FROM jsonb_array_elements(p_selection->'enrollment_ids')ORDER BY value LOOP
 IF NOT EXISTS(SELECT 1 FROM public.enrollments en JOIN public.courses c ON c.id=en.course_id WHERE en.id=(id#>>'{}')::uuid AND en.course_id=(p_selection->>'course_id')::uuid AND c.organization_id=p_org AND public.uc_education_issue_can(p_org,g,en.id,en.user_id,en.course_id,'read'))THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 SELECT array_agg(x.id ORDER BY x.id)INTO matches FROM public.education_document_records x WHERE x.organization_id=p_org AND x.enrollment_id=(id#>>'{}')::uuid AND x.deleted_at IS NULL;
 IF cardinality(matches)>1 THEN PERFORM public.uc_education_issue_error('REVIEW_REQUIRED');END IF;
 IF coalesce(cardinality(matches),0)=0 THEN missing:=missing||jsonb_build_array(jsonb_build_object('enrollment_id',id,'code','NOT_ISSUED'));ELSE r:=public.uc_education_issue_record(p_org,g,matches[1]);IF r IS NULL THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;IF r->>'lifecycle'='annulled'THEN missing:=missing||jsonb_build_array(jsonb_build_object('enrollment_id',id,'code','ANNULLED_ONLY'));ELSE selected:=array_append(selected,matches[1]);END IF;END IF;END LOOP;
 ELSE PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOREACH candidate IN ARRAY selected LOOP SELECT *INTO current FROM public.education_document_records WHERE public.education_document_records.id=candidate;PERFORM public.uc_education_issue_fence(p_org,g,ARRAY[current.user_id]);r:=public.uc_education_issue_record(p_org,g,candidate);IF r IS NULL THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;records:=records||jsonb_build_array(r);
 FOR e IN SELECT *FROM public.uc_education_issuance_events WHERE record_id=candidate AND organization_id=p_org AND NOT redacted ORDER BY revision LOOP history:=history||jsonb_build_array(public.uc_education_issue_event(e.id));IF jsonb_array_length(history)>10000 THEN PERFORM public.uc_education_issue_error('LIMIT_EXCEEDED');END IF;END LOOP;END LOOP;
 snapshot:=jsonb_build_object('schema_version',1,'kind','education_issuance_snapshot','organization_id',p_org,'scope',p_scope,'captured_at',clock_timestamp(),'captured_by',auth.uid(),'records',records,'history',history,'missing',missing,'not_official_submission',true);snapshot_text:=snapshot::text;
 html:='<!doctype html><html lang="ru"><meta charset="utf-8"><title>Реестр документов об обучении</title><style>body{font:14px Arial,sans-serif;color:#19222e}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd1d8;padding:7px;text-align:left;vertical-align:top}small{color:#556070}</style><h1>Реестр документов об обучении</h1><p>Снимок регистрационных фактов. Не является подачей в ФИС ФРДО. Передача подтверждается отдельным событием и основанием.</p><table><thead><tr><th>Документ</th><th>Получатель</th><th>Программа</th><th>Состояние</th><th>Передача</th></tr></thead><tbody>';
 FOR r IN SELECT value FROM jsonb_array_elements(records)LOOP html:=html||'<tr><td>'||public.uc_education_html(r->'official'->>'document_number')||'<br>'||public.uc_education_html(r->'official'->>'reg_number')||'<br>'||public.uc_education_html(r->'official'->>'issue_date')||'</td><td>'||public.uc_education_html(r->'official'->>'full_name')||'</td><td>'||public.uc_education_html(r->'official'->>'specialty_name')||'</td><td>'||public.uc_education_html(CASE r->>'lifecycle'WHEN'annulled'THEN'Аннулирован'ELSE'Действует'END)||'</td><td>'||public.uc_education_html(CASE WHEN r->'latest_handover'IS NULL OR r->'latest_handover'='null'::jsonb THEN'Передача не зафиксирована'ELSE r->'latest_handover'->'fact'->>'kind'END)||'</td></tr>';END LOOP;
 html:=html||'</tbody></table><h2>История событий</h2><table><thead><tr><th>Запись / версия</th><th>Время</th><th>Событие</th><th>Основание</th></tr></thead><tbody>';
 FOR r IN SELECT value FROM jsonb_array_elements(history)LOOP html:=html||'<tr><td>'||public.uc_education_html(r->>'record_id')||' / '||public.uc_education_html(r->>'revision')||'</td><td>'||public.uc_education_html(r->>'recorded_at')||'</td><td>'||public.uc_education_html(r->>'kind')||'</td><td>'||public.uc_education_html(r->>'reason')||'</td></tr>';END LOOP;html:=html||'</tbody></table></html>';
 size:=octet_length(snapshot_text)+octet_length(html);IF size>8388608 THEN PERFORM public.uc_education_issue_error('LIMIT_EXCEEDED');END IF;
 RETURN jsonb_build_object('snapshot_json',snapshot_text,'snapshot_sha256',encode(pg_catalog.sha256(convert_to(snapshot_text,'UTF8')),'hex'),'html',html,'html_sha256',encode(pg_catalog.sha256(convert_to(html,'UTF8')),'hex'),'utf8_bytes',size);END;$fn$;
CREATE FUNCTION public.read_education_issuance(p_organization_id uuid,p_scope jsonb,p_query jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'SET lock_timeout='2000ms' AS $fn$
<<issuance_read>>
DECLARE g uuid;kind text:=p_query->>'kind';caps jsonb;base jsonb;lim integer;items jsonb:='[]';r jsonb;id uuid;next_id uuid;ceiling bigint;next_revision bigint;before_value bigint;v public.org_document_versions;rv public.org_document_reviews;d public.org_documents;prep public.uc_education_issuance_preparations;summary jsonb;c public.education_document_records;en public.enrollments;event record;filter text;count_items integer;BEGIN
 g:=public.uc_education_issue_scope(p_organization_id,p_scope);PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[auth.uid()]);caps:=public.uc_education_issue_caps(p_organization_id,g);base:=jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'scope',p_scope,'capabilities',caps,'kind',kind);
 IF jsonb_typeof(p_query)IS DISTINCT FROM'object'OR octet_length(p_query::text)>131072 THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 IF kind IN('withdrawal','withdrawal_preview','withdrawal_history')THEN IF caps->'can_read_withdrawal'IS DISTINCT FROM'true'::jsonb AND caps->'can_withdraw'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 ELSE IF caps->'can_read'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;END IF;
 IF kind IN('templates','preparations','candidates','records','history','withdrawal_history')THEN IF jsonb_typeof(p_query->'limit')IS DISTINCT FROM'number'OR coalesce(p_query->>'limit','')!~'^[0-9]+$'THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;lim:=(p_query->>'limit')::integer;IF lim NOT BETWEEN 1 AND (CASE WHEN kind='preparations'THEN 50 ELSE 100 END) THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;END IF;
 IF kind='preparation'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','preparation_id'])OR NOT public.uc_admission_uuid(p_query->'preparation_id')THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;prep:=public.uc_education_preparation_access((p_query->>'preparation_id')::uuid);IF prep.organization_id<>p_organization_id OR prep.scope IS DISTINCT FROM p_scope THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;RETURN base||jsonb_build_object('preparation',public.uc_education_preparation_json(prep.id));
 ELSIF kind='preparations'THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY['kind','after_id','limit','filter'])OR NOT(p_query->'after_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'after_id'))OR p_query->>'filter'NOT IN('all','open','consumed')OR caps->'can_issue'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR prep IN SELECT *FROM public.uc_education_issuance_preparations WHERE organization_id=p_organization_id AND actor_id=auth.uid()AND scope=p_scope AND NOT redacted AND(p_query->'after_id'='null'::jsonb OR public.uc_education_issuance_preparations.id>(p_query->>'after_id')::uuid)ORDER BY public.uc_education_issuance_preparations.id LOOP
 summary:=NULL;SELECT jsonb_build_object('id',prep.id,'kind',prep.kind,'created_at',prep.created_at,'item_count',count(*),'prepared_count',count(*)FILTER(WHERE j->>'status'='prepared'),'rendered_unissued_count',count(*)FILTER(WHERE j->>'status'='rendered_unissued'),'approved_unissued_count',count(*)FILTER(WHERE j->>'status'='approved_unissued'),'consumed_count',count(*)FILTER(WHERE j->>'status'='consumed'),'stale_count',count(*)FILTER(WHERE j->>'status'='stale'))INTO summary FROM public.uc_education_issuance_preparation_items i CROSS JOIN LATERAL(SELECT public.uc_education_preparation_item_json(i.id)j)x WHERE preparation_id=prep.id AND NOT i.redacted;
 IF(summary->>'item_count')::integer=0 OR(p_query->>'filter'='open'AND summary->'consumed_count'=summary->'item_count')OR(p_query->>'filter'='consumed'AND summary->'consumed_count'<>summary->'item_count')THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->>'id')::uuid;EXIT;END IF;items:=items||jsonb_build_array(summary);END LOOP;RETURN base||jsonb_build_object('items',items,'next_after_id',next_id);
 ELSIF kind='templates'THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY['kind','after_version_id','limit'])OR NOT(p_query->'after_version_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'after_version_id'))OR caps->'can_issue'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR v IN SELECT x.*FROM public.org_document_versions x JOIN public.org_documents y ON y.id=x.document_id AND y.current_version_id=x.id AND y.organization_id=x.organization_id WHERE x.organization_id=p_organization_id AND y.deleted_at IS NULL AND coalesce(y.status,'active')NOT IN('archived','expired')AND x.file_size BETWEEN 1 AND 1048576 AND lower(split_part(x.storage_metadata->>'mimetype',';',1))='text/html'AND public.uc_copy_registry_object_matches(x)AND(p_query->'after_version_id'='null'::jsonb OR x.id>(p_query->>'after_version_id')::uuid)ORDER BY x.id LOOP
 SELECT *INTO rv FROM public.org_document_reviews WHERE document_id=v.document_id AND version_id=v.id AND organization_id=p_organization_id AND state='approved';IF rv.id IS NULL OR EXISTS(SELECT 1 FROM public.org_document_review_comments x WHERE x.review_id=rv.id AND x.resolution_status='accepted'AND x.position_anchor->>'kind'IN('insert','delete','replace'))OR public.uc_education_issue_source(p_organization_id,public.uc_copy_registry_original_ref(v),false)IS NULL THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->'template'->'source'->>'version_id')::uuid;EXIT;END IF;SELECT *INTO d FROM public.org_documents WHERE public.org_documents.id=v.document_id;items:=items||jsonb_build_array(jsonb_build_object('label',left(d.name,1000),'template',jsonb_build_object('source',public.uc_copy_registry_original_ref(v),'review_id',rv.id,'review_revision',rv.revision)));END LOOP;RETURN base||jsonb_build_object('items',items,'next_after_version_id',next_id);
 ELSIF kind='preview_issue'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','intent'])THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;RETURN base||jsonb_build_object('preview',public.uc_education_issue_preview(p_organization_id,g,p_query->'intent'));
 ELSIF kind='preview_change'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','change'])THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;RETURN base||jsonb_build_object('preview',public.uc_education_change_preview(p_organization_id,g,p_query->'change'));
 ELSIF kind='candidates'THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY['kind','course_id','after_enrollment_id','limit','filter'])OR NOT public.uc_admission_uuid(p_query->'course_id')OR NOT(p_query->'after_enrollment_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'after_enrollment_id'))OR p_query->>'filter'NOT IN('all','ready','blocked','already_issued')OR NOT EXISTS(SELECT 1 FROM public.courses WHERE public.courses.id=(p_query->>'course_id')::uuid AND organization_id=p_organization_id)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR en IN SELECT *FROM public.enrollments WHERE course_id=(p_query->>'course_id')::uuid AND(p_query->'after_enrollment_id'='null'::jsonb OR public.enrollments.id>(p_query->>'after_enrollment_id')::uuid)ORDER BY public.enrollments.id LOOP
 IF NOT public.uc_education_issue_can(p_organization_id,g,en.id,en.user_id,en.course_id,'read')THEN CONTINUE;END IF;PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[en.user_id]);r:=public.uc_education_issue_candidate(p_organization_id,g,en.id);IF r IS NULL OR(p_query->>'filter'='ready'AND r->'eligibility_ref'='null'::jsonb)OR(p_query->>'filter'='blocked'AND r->'eligibility_ref'<>'null'::jsonb)OR(p_query->>'filter'='already_issued'AND r->'existing_original_record_id'='null'::jsonb)THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->>'enrollment_id')::uuid;EXIT;END IF;items:=items||jsonb_build_array(r);END LOOP;RETURN base||jsonb_build_object('course_id',p_query->'course_id','items',items,'next_after_enrollment_id',next_id);
 ELSIF kind='records'THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY['kind','course_id','after_id','limit','filter'])OR NOT(p_query->'course_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'course_id'))OR NOT(p_query->'after_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'after_id'))OR p_query->>'filter'NOT IN('all','active','annulled','legacy_unverified')THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR c IN SELECT *FROM public.education_document_records WHERE organization_id=p_organization_id AND deleted_at IS NULL AND(p_query->'course_id'='null'::jsonb OR course_id=(p_query->>'course_id')::uuid)AND(p_query->'after_id'='null'::jsonb OR public.education_document_records.id>(p_query->>'after_id')::uuid)ORDER BY public.education_document_records.id LOOP
 IF NOT public.uc_education_issue_can(p_organization_id,coalesce(g,c.group_id),c.enrollment_id,c.user_id,c.course_id,'read')THEN CONTINUE;END IF;PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[c.user_id]);r:=public.uc_education_issue_record(p_organization_id,g,c.id);IF r IS NULL OR(p_query->>'filter'IN('active','annulled')AND r->>'lifecycle'<>p_query->>'filter')OR(p_query->>'filter'='legacy_unverified'AND r->>'provenance'<>'legacy_unverified')THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->'official'->>'id')::uuid;EXIT;END IF;items:=items||jsonb_build_array(r);END LOOP;RETURN base||jsonb_build_object('items',items,'next_after_id',next_id);
 ELSIF kind IN('record','history')THEN
 IF NOT public.uc_admission_uuid(p_query->'record_id')OR NOT(CASE WHEN kind='record'THEN public.uc_admission_shape(p_query,ARRAY['kind','record_id'])ELSE public.uc_admission_shape(p_query,ARRAY['kind','record_id','ceiling_revision','before_revision','limit'])END)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;id:=(p_query->>'record_id')::uuid;r:=public.uc_education_issue_record(p_organization_id,g,id);IF r IS NULL THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[(r->'official'->>'user_id')::uuid]);
 IF kind='record'THEN RETURN base||jsonb_build_object('record',r);END IF;
 ceiling:=(r->>'revision')::bigint;IF p_query->'ceiling_revision'<>'null'::jsonb THEN IF coalesce(p_query->>'ceiling_revision','')!~'^[0-9]+$'OR(p_query->>'ceiling_revision')::bigint>ceiling THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;ceiling:=(p_query->>'ceiling_revision')::bigint;END IF;
 IF p_query->'before_revision'<>'null'::jsonb THEN IF coalesce(p_query->>'before_revision','')!~'^[0-9]+$'OR(p_query->>'before_revision')::bigint<1 THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;before_value:=(p_query->>'before_revision')::bigint;END IF;
 FOR event IN SELECT x.id,x.revision FROM public.uc_education_issuance_events x WHERE x.organization_id=p_organization_id AND x.record_id=issuance_read.id AND NOT x.redacted AND x.revision<=ceiling AND(before_value IS NULL OR x.revision<before_value)ORDER BY x.revision DESC LIMIT lim+1 LOOP IF jsonb_array_length(items)=lim THEN next_revision:=(items->-1->>'revision')::bigint;EXIT;END IF;items:=items||jsonb_build_array(public.uc_education_issue_event(event.id));END LOOP;
 RETURN base||jsonb_build_object('record_id',id,'ceiling_revision',ceiling,'items',items,'next_before_revision',next_revision);
 ELSIF kind IN('withdrawal','withdrawal_preview','withdrawal_history')THEN
 IF kind='withdrawal_preview'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','intent'])THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;RETURN base||jsonb_build_object('preview',public.uc_education_withdraw_intent(p_organization_id,g,p_query->'intent'));END IF;
 IF NOT public.uc_admission_uuid(p_query->'enrollment_id')OR NOT(CASE WHEN kind='withdrawal'THEN public.uc_admission_shape(p_query,ARRAY['kind','enrollment_id'])ELSE public.uc_admission_shape(p_query,ARRAY['kind','enrollment_id','ceiling_revision','before_revision','limit'])END)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;id:=(p_query->>'enrollment_id')::uuid;r:=public.uc_education_withdraw_state(p_organization_id,g,id);PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[(r->'ref'->>'user_id')::uuid]);IF kind='withdrawal'THEN RETURN base||jsonb_build_object('state',r);END IF;
 ceiling:=(r->'ref'->>'revision')::bigint;IF p_query->'ceiling_revision'<>'null'::jsonb THEN IF coalesce(p_query->>'ceiling_revision','')!~'^[0-9]+$'OR(p_query->>'ceiling_revision')::bigint>ceiling THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;ceiling:=(p_query->>'ceiling_revision')::bigint;END IF;
 IF p_query->'before_revision'<>'null'::jsonb THEN IF coalesce(p_query->>'before_revision','')!~'^[0-9]+$'OR(p_query->>'before_revision')::bigint<1 THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;before_value:=(p_query->>'before_revision')::bigint;END IF;
 FOR event IN SELECT x.id,x.revision FROM public.uc_enrollment_withdrawal_events x WHERE x.organization_id=p_organization_id AND x.enrollment_id=issuance_read.id AND NOT x.redacted AND x.revision<=ceiling AND(before_value IS NULL OR x.revision<before_value)ORDER BY x.revision DESC LIMIT lim+1 LOOP IF jsonb_array_length(items)=lim THEN next_revision:=(items->-1->>'revision')::bigint;EXIT;END IF;items:=items||jsonb_build_array(public.uc_education_withdraw_event(event.id));END LOOP;RETURN base||jsonb_build_object('enrollment_id',id,'ceiling_revision',ceiling,'items',items,'next_before_revision',next_revision);
 ELSIF kind='export'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','selection','format'])OR p_query->>'format'IS DISTINCT FROM'canonical_snapshot'THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;RETURN base||jsonb_build_object('artifact',public.uc_education_issue_export(p_organization_id,p_scope,p_query->'selection'));
 ELSE PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN RAISE EXCEPTION 'EDUCATION_ISSUANCE_REVISION_CONFLICT' USING ERRCODE='PT409';WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END;$fn$;

CREATE FUNCTION public.uc_education_output_slot(p_document uuid,p_org uuid,p_request uuid,p_expected bigint,p_upload jsonb,p_restore uuid,p_document_data jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;expected jsonb;BEGIN
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE output_document_id=p_document;
 IF i.id IS NULL THEN RETURN;END IF;SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF i.redacted OR p.redacted OR i.user_id IS NULL OR p.actor_id IS DISTINCT FROM auth.uid()OR i.organization_id IS DISTINCT FROM p_org OR i.output_request_id IS DISTINCT FROM p_request OR p_expected IS DISTINCT FROM 0 OR p_restore IS NOT NULL OR i.staging_proof IS NULL OR NOT public.uc_education_artifact_actor(auth.uid(),p_org,i.group_id,i.user_id,i.enrollment_id)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_education_issue_fence(p_org,i.group_id,ARRAY[i.user_id,p.actor_id]);
 expected:=jsonb_build_object('file_path',p_org::text||'/versions/'||i.output_document_id::text||'/'||i.output_request_id::text||'.pdf','file_name','education-document.pdf','file_size',i.staging_proof->'byte_size','change_summary','Сформирован проверенный PDF; выдача ещё не зарегистрирована.');
 IF p_upload IS DISTINCT FROM expected OR p_document_data IS DISTINCT FROM jsonb_build_object('name','Проверенный документ — выдача ещё не зарегистрирована','type','other','issue_date',i.number_plan->'issue_date','status','active')THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;END;$fn$;
-- The provider computes path_tokens after BEFORE triggers, and its existing
-- timestamp trigger runs before the final protected-output guard. Neither
-- derived path tokens nor read bookkeeping may replace a frozen byte witness.
DO $output_storage_preimage$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='storage.objects'::regclass AND a.attname='path_tokens'AND NOT a.attisdropped AND a.attgenerated='s'AND a.attidentity=''AND NOT a.attnotnull AND format_type(a.atttypid,a.atttypmod)='text[]'AND pg_get_expr(d.adbin,d.adrelid)='string_to_array(name, ''/''::text)')
 OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='storage.update_updated_at_column()'::regprocedure AND md5(p.prosrc)='7596e66a7698d5a6b5129c5ce9b24c5f'AND NOT p.prosecdef AND p.proconfig IS NULL AND l.lanname='plpgsql')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='storage.objects'::regclass AND t.tgname='update_objects_updated_at'AND NOT t.tgisinternal AND t.tgenabled='O'AND t.tgtype=19 AND pg_get_triggerdef(t.oid,true)='CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column()')
 THEN RAISE EXCEPTION 'EDUCATION_OUTPUT_STORAGE_PREIMAGE_CHANGED' USING ERRCODE='55000';END IF;
END;
$output_storage_preimage$;
CREATE FUNCTION public.uc_education_output_storage_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;size_text text;BEGIN
 IF TG_OP='UPDATE'THEN
 IF EXISTS(SELECT 1 FROM public.uc_education_issuance_preparation_items x WHERE(OLD.bucket_id='org-documents'AND OLD.name=x.organization_id::text||'/versions/'||x.output_document_id::text||'/'||x.output_request_id::text||'.pdf')OR(NEW.bucket_id='org-documents'AND NEW.name=x.organization_id::text||'/versions/'||x.output_document_id::text||'/'||x.output_request_id::text||'.pdf'))THEN IF(to_jsonb(OLD)-ARRAY['last_accessed_at','updated_at','path_tokens'])IS NOT DISTINCT FROM(to_jsonb(NEW)-ARRAY['last_accessed_at','updated_at','path_tokens'])THEN NEW.updated_at:=OLD.updated_at;RETURN NEW;END IF;RAISE EXCEPTION 'prepared_education_output_is_immutable' USING ERRCODE='42501';END IF;RETURN NEW;END IF;
 IF NEW.bucket_id<>'org-documents'THEN RETURN NEW;END IF;
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items x WHERE NEW.name=x.organization_id::text||'/versions/'||x.output_document_id::text||'/'||x.output_request_id::text||'.pdf';IF i.id IS NULL THEN RETURN NEW;END IF;
 SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 -- Opaque output slot IDs survive redaction so an already in-flight issuer
 -- cannot recreate a subject's PDF after its privacy transaction committed.
 IF i.redacted OR p.redacted OR i.user_id IS NULL OR i.final_record_id IS NOT NULL OR i.staging_proof IS NULL OR auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS DISTINCT FROM p.actor_id OR NOT public.uc_education_artifact_actor(p.actor_id,i.organization_id,i.group_id,i.user_id,i.enrollment_id)THEN RAISE EXCEPTION 'prepared_education_output_context_unavailable' USING ERRCODE='42501';END IF;
 PERFORM public.uc_education_issue_fence(i.organization_id,i.group_id,ARRAY[i.user_id,p.actor_id]);
 size_text:=coalesce(NEW.metadata->>'size',NEW.metadata->>'contentLength');IF size_text IS NULL OR size_text!~'^[0-9]+$'OR size_text::numeric IS DISTINCT FROM(i.staging_proof->>'byte_size')::numeric OR NEW.metadata->>'mimetype'IS DISTINCT FROM'application/pdf'THEN RAISE EXCEPTION 'prepared_education_output_metadata_mismatch' USING ERRCODE='22023';END IF;RETURN NEW;END;$fn$;
CREATE TRIGGER zz_uc_education_output_object_boundary BEFORE INSERT OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.uc_education_output_storage_guard();

CREATE FUNCTION public.uc_education_actor_json(p_json jsonb,p_user uuid,p_redact boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE out jsonb;entry record;v jsonb;BEGIN IF p_json IS NULL THEN RETURN NULL;END IF;
 IF jsonb_typeof(p_json)='object'THEN out:='{}';FOR entry IN SELECT key,value FROM jsonb_each(p_json)LOOP
 IF entry.key=ANY(ARRAY['actor_id','recorded_by','created_by','updated_by','approved_by','reviewer_user_id','captured_by','uploaded_by'])AND entry.value=to_jsonb(p_user)THEN IF p_redact THEN v:='null';ELSE RETURN'true';END IF;
 ELSE v:=public.uc_education_actor_json(entry.value,p_user,p_redact);IF NOT p_redact AND v='true'::jsonb THEN RETURN'true';END IF;END IF;
 IF p_redact THEN out:=out||jsonb_build_object(entry.key,v);END IF;END LOOP;RETURN CASE WHEN p_redact THEN out ELSE'false'::jsonb END;
 ELSIF jsonb_typeof(p_json)='array'THEN out:='[]';FOR v IN SELECT value FROM jsonb_array_elements(p_json)LOOP v:=public.uc_education_actor_json(v,p_user,p_redact);IF NOT p_redact AND v='true'::jsonb THEN RETURN'true';END IF;IF p_redact THEN out:=out||jsonb_build_array(v);END IF;END LOOP;RETURN CASE WHEN p_redact THEN out ELSE'false'::jsonb END;
 ELSE RETURN CASE WHEN p_redact THEN p_json ELSE'false'::jsonb END;END IF;END;$fn$;
CREATE FUNCTION public.uc_education_personal_counts(p_user uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',t,'column',c,'count',n)ORDER BY t,c),'[]'::jsonb)FROM(
 SELECT'uc_education_issuance_states'::text t,'subject_or_actor_attribution'::text c,count(*)n FROM public.uc_education_issuance_states s WHERE s.user_id=p_user OR s.recorded_by=p_user OR s.updated_by=p_user OR p_user=ANY(s.participant_ids)OR public.uc_education_actor_json(s.latest_handover,p_user)='true'::jsonb OR public.uc_education_actor_json(s.annulment,p_user)='true'::jsonb
 UNION ALL SELECT'uc_education_issuance_events','subject_or_actor_attribution',count(*)FROM public.uc_education_issuance_events e WHERE e.user_id=p_user OR e.actor_id=p_user OR p_user=ANY(e.participant_ids)OR public.uc_education_actor_json(e.payload,p_user)='true'::jsonb
 UNION ALL SELECT'uc_enrollment_withdrawal_states','subject_or_actor_attribution',count(*)FROM public.uc_enrollment_withdrawal_states w WHERE w.user_id=p_user OR w.recorded_by=p_user OR p_user=ANY(w.participant_ids)OR public.uc_education_actor_json(w.technical_snapshot,p_user)='true'::jsonb
 UNION ALL SELECT'uc_enrollment_withdrawal_events','subject_or_actor_attribution',count(*)FROM public.uc_enrollment_withdrawal_events e WHERE e.user_id=p_user OR e.actor_id=p_user OR p_user=ANY(e.participant_ids)OR public.uc_education_actor_json(e.before_state,p_user)='true'::jsonb OR public.uc_education_actor_json(e.after_state,p_user)='true'::jsonb
 UNION ALL SELECT'uc_education_issuance_requests','subject_or_actor_attribution',count(*)FROM public.uc_education_issuance_requests r WHERE r.actor_id=p_user OR p_user=ANY(r.participant_ids)
 UNION ALL SELECT'uc_education_issuance_contexts','subject_or_actor_attribution',count(*)FROM public.uc_education_issuance_contexts x WHERE x.user_id=p_user OR x.actor_id=p_user OR public.uc_education_actor_json(x.source_snapshot,p_user)='true'::jsonb
 UNION ALL SELECT'uc_education_issuance_preparations','subject_or_actor_attribution',count(*)FROM public.uc_education_issuance_preparations p WHERE p.actor_id=p_user OR p_user=ANY(p.participant_ids)OR public.uc_education_actor_json(p.plan,p_user)='true'::jsonb
 UNION ALL SELECT'uc_education_issuance_preparation_items','subject_or_actor_attribution',count(*)FROM public.uc_education_issuance_preparation_items i WHERE i.user_id=p_user OR p_user=ANY(i.participant_ids)OR public.uc_education_actor_json(i.source_snapshot,p_user)='true'::jsonb
 UNION ALL SELECT'uc_education_issuance_preparation_items','retained_subject_output_reference_review_required',count(*)FROM public.uc_education_issuance_preparation_items i WHERE i.retained_subject_user_id=p_user
 )counts WHERE n>0 $fn$;
CREATE FUNCTION public.uc_education_erase_user(p_user uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE prep_ids uuid[];record_ids uuid[];remaining jsonb;BEGIN
 IF NOT public.uc_education_trusted_erasure(p_user)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_user::text,42007))THEN PERFORM public.uc_education_issue_error('REVISION_CONFLICT');END IF;
 SELECT coalesce(array_agg(DISTINCT preparation_id),'{}')INTO prep_ids FROM public.uc_education_issuance_preparation_items WHERE user_id=p_user OR retained_subject_user_id=p_user;
 SELECT coalesce(array_agg(DISTINCT record_id),'{}')INTO record_ids FROM public.uc_education_issuance_states WHERE user_id=p_user;
 DELETE FROM public.uc_education_issuance_requests WHERE actor_id=p_user OR p_user=ANY(participant_ids);
 DELETE FROM public.uc_education_issuance_contexts WHERE user_id=p_user OR actor_id=p_user;
 UPDATE public.uc_education_issuance_events SET user_id=NULL,actor_id=NULL,reason='',payload='{}',participant_ids='{}',redacted=true WHERE user_id=p_user OR record_id=ANY(record_ids);
 UPDATE public.uc_education_issuance_states SET user_id=NULL,proof=NULL,artifact=NULL,frdo_facts=NULL,notes='',annulment=NULL,latest_handover=NULL,recorded_by=NULL,updated_by=NULL,participant_ids='{}',redacted=true WHERE user_id=p_user;
 UPDATE public.uc_enrollment_withdrawal_events SET user_id=NULL,actor_id=NULL,reason='',basis='{}',before_state='{}',after_state='{}',participant_ids='{}',redacted=true WHERE user_id=p_user;
 UPDATE public.uc_enrollment_withdrawal_states SET user_id=NULL,basis='{}',technical_snapshot='{}',recorded_by=NULL,participant_ids='{}',redacted=true WHERE user_id=p_user;
 -- Keep only the exact typed output subject binding when a real object still
 -- exists. This is a retained personal reference requiring UC024 review, never
 -- an anonymous or fully erased file. Opaque path IDs always survive to deny
 -- late uploads; no bytes, retention basis or duration are invented here.
 UPDATE public.uc_education_issuance_preparation_items i SET retained_subject_user_id=CASE WHEN EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='org-documents'AND o.name=i.organization_id::text||'/versions/'||i.output_document_id::text||'/'||i.output_request_id::text||'.pdf')THEN coalesce(i.retained_subject_user_id,i.user_id)END,user_id=NULL,eligibility_ref='{}',source_snapshot='{}',official_identity='{}',frdo_facts='{}',render_variables='{}',staging_proof=NULL,artifact=NULL,participant_ids='{}',redacted=true WHERE preparation_id=ANY(prep_ids);
 UPDATE public.uc_education_issuance_preparations SET actor_id=NULL,plan='{}',template='{}',template_storage='{}',template_byte_sha256=NULL,number_witness='{}',participant_ids='{}',redacted=true WHERE id=ANY(prep_ids);
 -- Actor-only deletion preserves every other pupil's registration, source,
 -- numbers, artifact bytes and factual result; only attribution is removed.
 UPDATE public.uc_education_issuance_states SET recorded_by=CASE WHEN recorded_by=p_user THEN NULL ELSE recorded_by END,updated_by=CASE WHEN updated_by=p_user THEN NULL ELSE updated_by END,participant_ids=array_remove(participant_ids,p_user),latest_handover=public.uc_education_actor_json(latest_handover,p_user,true),annulment=public.uc_education_actor_json(annulment,p_user,true)WHERE recorded_by=p_user OR updated_by=p_user OR p_user=ANY(participant_ids)OR public.uc_education_actor_json(latest_handover,p_user)='true'::jsonb OR public.uc_education_actor_json(annulment,p_user)='true'::jsonb;
 UPDATE public.uc_education_issuance_events SET actor_id=CASE WHEN actor_id=p_user THEN NULL ELSE actor_id END,participant_ids=array_remove(participant_ids,p_user),payload=public.uc_education_actor_json(payload,p_user,true)WHERE actor_id=p_user OR p_user=ANY(participant_ids)OR public.uc_education_actor_json(payload,p_user)='true'::jsonb;
 UPDATE public.uc_enrollment_withdrawal_states SET recorded_by=CASE WHEN recorded_by=p_user THEN NULL ELSE recorded_by END,participant_ids=array_remove(participant_ids,p_user),technical_snapshot=public.uc_education_actor_json(technical_snapshot,p_user,true)WHERE recorded_by=p_user OR p_user=ANY(participant_ids)OR public.uc_education_actor_json(technical_snapshot,p_user)='true'::jsonb;
 UPDATE public.uc_enrollment_withdrawal_events SET actor_id=CASE WHEN actor_id=p_user THEN NULL ELSE actor_id END,participant_ids=array_remove(participant_ids,p_user),before_state=public.uc_education_actor_json(before_state,p_user,true),after_state=public.uc_education_actor_json(after_state,p_user,true)WHERE actor_id=p_user OR p_user=ANY(participant_ids)OR public.uc_education_actor_json(before_state,p_user)='true'::jsonb OR public.uc_education_actor_json(after_state,p_user)='true'::jsonb;
 UPDATE public.uc_education_issuance_preparations SET actor_id=CASE WHEN actor_id=p_user THEN NULL ELSE actor_id END,participant_ids=array_remove(participant_ids,p_user),plan=public.uc_education_actor_json(plan,p_user,true)WHERE actor_id=p_user OR p_user=ANY(participant_ids)OR public.uc_education_actor_json(plan,p_user)='true'::jsonb;
 UPDATE public.uc_education_issuance_preparation_items SET participant_ids=array_remove(participant_ids,p_user),source_snapshot=public.uc_education_actor_json(source_snapshot,p_user,true)WHERE p_user=ANY(participant_ids)OR public.uc_education_actor_json(source_snapshot,p_user)='true'::jsonb;
 remaining:=public.uc_education_personal_counts(p_user);IF EXISTS(SELECT 1 FROM jsonb_array_elements(remaining)x WHERE x->>'column'<>'retained_subject_output_reference_review_required')THEN PERFORM public.uc_education_issue_error('DEPENDENCY_UNAVAILABLE');END IF;END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_scoped_journal_personal_counts(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
)||public.uc_education_personal_counts(p_user)
$function$;

CREATE OR REPLACE FUNCTION public.uc_scoped_journal_erase_user(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR current_setting('sintagma.account_deletion_erase_user',true) IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations rev WHERE rev.user_id=p_user) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_education_erase_user(p_user);
 PERFORM public.uc_copy_registry_erase_user(p_user);
 PERFORM public.uc_document_registry_erase_user(p_user);
 -- Every copied personal export is invalidated, never silently re-rendered under an old hash.
 DELETE FROM public.uc_scoped_journal_exports e WHERE e.recorded_by=p_user OR p_user=ANY(e.participant_ids);
 DELETE FROM public.uc_scoped_journal_requests request_row WHERE request_row.actor_id=p_user OR p_user=ANY(request_row.participant_ids);
 DELETE FROM public.uc_scoped_journal_history h WHERE h.subject_user_id=p_user;
 DELETE FROM public.uc_scoped_journal_records r WHERE r.subject_user_id=p_user;
 -- Conservatively redact an entire attributed copy, including nonpersonal-author text.
 -- No universal discovery of undeclared third-party personal data in free text is claimed.
 UPDATE public.uc_scoped_journal_history SET recorded_by=NULL,subject_user_id=NULL,subject_label=NULL,field_values='{}',source='{"kind":"none"}',reason='',participant_ids='{}',redacted=true
  WHERE recorded_by=p_user OR p_user=ANY(participant_ids);
 UPDATE public.uc_scoped_journal_records SET recorded_by=NULL,created_by=NULL,subject_user_id=NULL,subject_label=NULL,field_values='{}',source='{"kind":"none"}',participant_ids='{}',redacted=true
  WHERE recorded_by=p_user OR created_by=p_user OR p_user=ANY(participant_ids);
 UPDATE public.uc_scoped_journal_contexts SET created_by=NULL WHERE created_by=p_user;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.uc_education_personal_counts(p_user))x WHERE x->>'column'='retained_subject_output_reference_review_required')THEN RAISE EXCEPTION 'EDUCATION_ARTIFACT_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
 IF public.uc_scoped_journal_personal_counts(p_user)<>'[]'::jsonb THEN PERFORM public.uc_custom_journal_error('DEPENDENCY_UNAVAILABLE');END IF;
END;$function$;

-- Every new helper is private even under hostile default grants.
DO $acl$DECLARE f record;BEGIN FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(ARRAY['uc_education_issue_error','uc_enrollment_is_withdrawn','uc_education_issue_actor','uc_education_issue_scope','uc_education_issue_can','uc_education_withdraw_can','uc_education_issue_caps','uc_education_issue_fence','uc_education_issue_source','uc_education_issue_source_projection','uc_education_issue_basis_projection','uc_education_number_witness','uc_education_prospective_numbers','uc_education_issue_source_lock','uc_education_template','uc_education_admission_definition_shape','uc_education_admission_evidence_shape','uc_education_admission_reviews','uc_education_admission_digest','uc_education_admission_review_check','uc_education_admission_conditions','uc_education_trusted_erasure','uc_education_withdraw_state','uc_education_withdraw_intent','uc_guard_retained_enrollment','uc_guard_retained_learner_activity','uc_education_retained_learning_summary','uc_education_issue_admission','uc_education_issue_block','uc_education_issue_candidate','uc_education_issue_enrollment_fence','uc_education_issue_proof_visible','uc_education_issue_handover_projection','uc_education_issue_artifact_projection','uc_education_issue_state_hash','uc_education_issue_record','uc_education_issue_event','uc_education_actor_org_permission','uc_education_artifact_actor','uc_education_template_current','uc_education_withdraw_apply','uc_education_issue_preview','uc_education_replacement_identity','uc_education_handover_check','uc_education_change_preview','uc_education_frdo_snapshot','uc_education_render_variables','uc_education_canonical_boundary','uc_education_saved_output_counts','uc_education_staging_storage_guard','uc_education_preparation_access','uc_education_output_approval','uc_education_preparation_item_json','uc_education_preparation_json','prepare_education_issuance_artifacts','uc_education_artifact_live','uc_education_artifact_saved_source','uc_education_artifact_context_json','uc_education_artifact_context','uc_education_artifact_service_request','uc_education_artifact_attest_shape','uc_attest_education_issuance_staging','uc_attest_education_issuance_artifact','uc_education_artifact_final','uc_education_issue_one','uc_education_change_apply','uc_education_mutation_result','apply_education_issuance_action','uc_education_withdraw_event','uc_education_html','uc_education_issue_export','read_education_issuance','uc_education_output_slot','uc_education_output_storage_guard','uc_education_actor_json','uc_education_personal_counts','uc_education_erase_user'])LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.oid::regprocedure);END LOOP;END;$acl$;
GRANT EXECUTE ON FUNCTION public.read_education_issuance(uuid,jsonb,jsonb),public.apply_education_issuance_action(uuid,jsonb,uuid,jsonb),public.prepare_education_issuance_artifacts(uuid,jsonb,uuid,jsonb),public.uc_education_artifact_context(uuid,uuid,uuid,bigint,uuid)TO authenticated;
GRANT EXECUTE ON FUNCTION public.uc_attest_education_issuance_staging(uuid,uuid,uuid,uuid,bigint,uuid,jsonb),public.uc_attest_education_issuance_artifact(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)TO service_role;
REVOKE EXECUTE ON FUNCTION public.issue_education_document_batch(uuid,uuid,uuid,jsonb)FROM PUBLIC,anon,authenticated,service_role;

-- Provider default grants are inherited at CREATE time. Close only these new
-- private objects; preserve every old object grant and global default ACL.
DO $provider_acl$
DECLARE provider_role text;target_signature text;target_table text;BEGIN
 FOREACH provider_role IN ARRAY ARRAY['sandbox_exec_atxwvjxbqjgkbjlhsdch','sandbox_exec']LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=provider_role)THEN
   FOREACH target_signature IN ARRAY ARRAY['public.apply_education_issuance_action(uuid,jsonb,uuid,jsonb)','public.prepare_education_issuance_artifacts(uuid,jsonb,uuid,jsonb)','public.read_education_issuance(uuid,jsonb,jsonb)','public.uc_attest_education_issuance_artifact(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)','public.uc_attest_education_issuance_staging(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)','public.uc_education_actor_json(jsonb,uuid,boolean)','public.uc_education_actor_org_permission(uuid,uuid,text)','public.uc_education_admission_conditions(uuid)','public.uc_education_admission_definition_shape(jsonb,text)','public.uc_education_admission_digest(jsonb,uuid,jsonb,jsonb)','public.uc_education_admission_evidence_shape(jsonb)','public.uc_education_admission_review_check(uuid,uuid,jsonb,jsonb)','public.uc_education_admission_reviews(uuid)','public.uc_education_artifact_actor(uuid,uuid,uuid,uuid,uuid)','public.uc_education_artifact_attest_shape(jsonb,boolean)','public.uc_education_artifact_context(uuid,uuid,uuid,bigint,uuid)','public.uc_education_artifact_context_json(uuid,uuid,uuid,bigint,uuid)','public.uc_education_artifact_final(uuid,uuid,jsonb)','public.uc_education_artifact_live(uuid,uuid,uuid,bigint,boolean)','public.uc_education_artifact_saved_source(uuid)','public.uc_education_artifact_service_request(uuid,uuid,uuid,uuid,bigint,uuid)','public.uc_education_canonical_boundary()','public.uc_education_change_apply(uuid,uuid,jsonb,text)','public.uc_education_change_preview(uuid,uuid,jsonb)','public.uc_education_erase_user(uuid)','public.uc_education_frdo_snapshot(uuid,uuid,jsonb,jsonb,text,jsonb,boolean)','public.uc_education_handover_check(uuid,uuid,jsonb)','public.uc_education_html(text)','public.uc_education_issue_actor()','public.uc_education_issue_admission(uuid,uuid,uuid,jsonb,text)','public.uc_education_issue_artifact_projection(uuid,jsonb,boolean)','public.uc_education_issue_basis_projection(uuid,jsonb)','public.uc_education_issue_block(text)','public.uc_education_issue_can(uuid,uuid,uuid,uuid,uuid,text)','public.uc_education_issue_candidate(uuid,uuid,uuid,boolean)','public.uc_education_issue_caps(uuid,uuid,uuid,uuid,uuid)','public.uc_education_issue_enrollment_fence(uuid,boolean)','public.uc_education_issue_error(text)','public.uc_education_issue_event(uuid)','public.uc_education_issue_export(uuid,jsonb,jsonb)','public.uc_education_issue_fence(uuid,uuid,uuid[],text)','public.uc_education_issue_handover_projection(uuid,jsonb)','public.uc_education_issue_one(uuid,jsonb,text)','public.uc_education_issue_preview(uuid,uuid,jsonb,boolean)','public.uc_education_issue_proof_visible(jsonb)','public.uc_education_issue_record(uuid,uuid,uuid)','public.uc_education_issue_scope(uuid,jsonb)','public.uc_education_issue_source(uuid,jsonb,boolean)','public.uc_education_issue_source_lock(uuid,jsonb)','public.uc_education_issue_source_projection(uuid,jsonb)','public.uc_education_issue_state_hash(uuid)','public.uc_education_mutation_result(uuid,jsonb,jsonb,boolean)','public.uc_education_number_witness(uuid,date)','public.uc_education_output_approval(uuid)','public.uc_education_output_slot(uuid,uuid,uuid,bigint,jsonb,uuid,jsonb)','public.uc_education_output_storage_guard()','public.uc_education_personal_counts(uuid)','public.uc_education_preparation_access(uuid,boolean,uuid)','public.uc_education_preparation_item_json(uuid)','public.uc_education_preparation_json(uuid)','public.uc_education_prospective_numbers(jsonb,integer,date,text)','public.uc_education_render_variables(uuid,jsonb,jsonb,jsonb,jsonb,text)','public.uc_education_replacement_identity(uuid,boolean)','public.uc_education_retained_learning_summary(uuid,jsonb)','public.uc_education_saved_output_counts(uuid)','public.uc_education_staging_storage_guard()','public.uc_education_template(uuid,jsonb,boolean)','public.uc_education_template_current(uuid,jsonb,jsonb)','public.uc_education_trusted_erasure(uuid)','public.uc_education_withdraw_apply(uuid,uuid,jsonb,text,jsonb,text)','public.uc_education_withdraw_can(uuid,uuid,uuid,boolean)','public.uc_education_withdraw_event(uuid)','public.uc_education_withdraw_intent(uuid,uuid,jsonb)','public.uc_education_withdraw_state(uuid,uuid,uuid)','public.uc_enrollment_is_withdrawn(uuid)','public.uc_guard_retained_enrollment()','public.uc_guard_retained_learner_activity()']LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',target_signature,provider_role);
   END LOOP;
   FOREACH target_table IN ARRAY ARRAY['uc_education_issuance_contexts','uc_education_issuance_events','uc_education_issuance_preparation_items','uc_education_issuance_preparations','uc_education_issuance_requests','uc_education_issuance_states','uc_enrollment_withdrawal_events','uc_enrollment_withdrawal_states']LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',target_table,provider_role);
   END LOOP;
  END IF;
 END LOOP;
END;$provider_acl$;

DO $post$ DECLARE guard_before jsonb;guard_after jsonb;guard_new_table text;guard_new_rows boolean;BEGIN
 IF(SELECT(to_jsonb(c)-'oid'-'conbin')FROM pg_constraint c WHERE c.conrelid='public.education_document_records'::regclass AND c.conname='education_document_records_delivery_method_check')IS DISTINCT FROM(SELECT(value->'oldConstraintPreImage'->'tuple')-'oid'-'conbin'FROM uc019_expected_catalog)
 OR(SELECT pg_get_constraintdef(c.oid,true)FROM pg_constraint c WHERE c.conrelid='public.education_document_records'::regclass AND c.conname='education_document_records_delivery_method_check')IS DISTINCT FROM(SELECT value->'newConstraint'->>'definition'FROM uc019_expected_catalog)
 THEN RAISE EXCEPTION 'UC019_EXACT_ONE_CHECK_FOURTH_LITERAL_MISMATCH';END IF;
 IF(SELECT jsonb_agg(to_jsonb(a)ORDER BY a.grantee,a.grantor,a.privilege_type,a.is_grantable)FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl)a WHERE p.oid=to_regprocedure('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)'))IS DISTINCT FROM(SELECT jsonb_agg(to_jsonb(a)ORDER BY a.grantee,a.grantor,a.privilege_type,a.is_grantable)FROM uc019_expected_catalog e CROSS JOIN LATERAL aclexplode((e.value#>>'{exactOldBatchACL,acl}')::aclitem[])a WHERE a.grantee<>0 AND a.grantee<>ALL(ARRAY[(SELECT oid FROM pg_roles WHERE rolname='anon'),(SELECT oid FROM pg_roles WHERE rolname='authenticated'),(SELECT oid FROM pg_roles WHERE rolname='service_role')]))
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role'])role_name WHERE has_function_privilege(role_name,to_regprocedure('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)'),'EXECUTE'))
 THEN RAISE EXCEPTION 'UC019_EXACT_OLD_BATCH_REVOKE_ONLY_MISMATCH';END IF;
 IF pg_temp.uc019_capture_new_catalog()IS DISTINCT FROM(SELECT value->'nativePortableCatalog'FROM uc019_expected_catalog)THEN RAISE EXCEPTION 'UC019_EXACT_PORTABLE_NEW_FUNCTION_TABLE_CATALOG_MISMATCH';END IF;
 IF EXISTS(SELECT 1 FROM uc019_old_classes o LEFT JOIN pg_class c ON c.oid=o.oid WHERE c.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc019_old_procs o LEFT JOIN pg_proc p ON p.oid=o.oid WHERE p.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc019_old_types o LEFT JOIN pg_type t ON t.oid=o.oid WHERE t.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc019_old_triggers o LEFT JOIN pg_trigger t ON t.oid=o.oid WHERE t.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc019_old_policies o LEFT JOIN pg_policy p ON p.oid=o.oid WHERE p.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc019_old_defaults o LEFT JOIN pg_attrdef d ON d.oid=o.oid WHERE d.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc019_old_constraints o LEFT JOIN pg_constraint c ON c.oid=o.oid WHERE c.oid IS NULL AND o.oid<>(SELECT(value->'oldConstraintPreImage'->'tuple'->>'oid')::oid FROM uc019_expected_catalog))
 THEN RAISE EXCEPTION 'UC019_UNDECLARED_OLD_OBJECT_DISAPPEARED';END IF;
 SELECT value INTO STRICT guard_before FROM uc019_guard_before;guard_after:=pg_temp.uc019_capture_guard();
 IF guard_before IS DISTINCT FROM guard_after THEN RAISE EXCEPTION 'UC019_PRESERVATION_FAILED: %',(SELECT jsonb_agg(k) FROM jsonb_object_keys(guard_before)k WHERE guard_before->k IS DISTINCT FROM guard_after->k);END IF;
 IF EXISTS(SELECT 1 FROM uc019_body_allowlist a LEFT JOIN pg_proc p ON p.oid=to_regprocedure(a.signature) WHERE p.oid IS NULL OR md5(p.prosrc)<>a.new_md5)THEN RAISE EXCEPTION 'UC019_EXACT_NEW_BODY_MISMATCH';END IF;
 IF(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND NOT EXISTS(SELECT 1 FROM uc019_old_classes o WHERE o.oid=c.oid))<>8
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND NOT EXISTS(SELECT 1 FROM uc019_old_classes o WHERE o.oid=c.oid)AND(c.relname<>ALL(ARRAY['uc_education_issuance_contexts','uc_education_issuance_events','uc_education_issuance_preparation_items','uc_education_issuance_preparations','uc_education_issuance_requests','uc_education_issuance_states','uc_enrollment_withdrawal_events','uc_enrollment_withdrawal_states'])OR NOT c.relrowsecurity OR c.relforcerowsecurity OR c.relowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres')OR EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)OR EXISTS(SELECT 1 FROM aclexplode(NULLIF(coalesce(c.relacl,acldefault('r',c.relowner)),'{}'::aclitem[]))a WHERE a.grantee<>c.relowner)))
 THEN RAISE EXCEPTION 'UC019_NEW_TABLE_ACL_OR_INVENTORY_MISMATCH';END IF;
 IF EXISTS(SELECT 1 FROM uc019_new_function_allowlist a WHERE to_regprocedure(a.signature) IS NULL)
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_(toast_)?temp_'AND NOT EXISTS(SELECT 1 FROM uc019_old_procs o WHERE o.oid=p.oid)AND NOT EXISTS(SELECT 1 FROM uc019_new_function_allowlist a WHERE n.nspname='public'AND to_regprocedure(a.signature)=p.oid))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN uc019_new_function_allowlist f ON p.oid=to_regprocedure(f.signature)WHERE p.proowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres')OR EXISTS(SELECT 1 FROM aclexplode(NULLIF(coalesce(p.proacl,acldefault('f',p.proowner)),'{}'::aclitem[]))a WHERE a.grantee<>p.proowner AND NOT((p.oid=ANY(ARRAY['public.read_education_issuance(uuid,jsonb,jsonb)'::regprocedure::oid,'public.apply_education_issuance_action(uuid,jsonb,uuid,jsonb)'::regprocedure::oid,'public.prepare_education_issuance_artifacts(uuid,jsonb,uuid,jsonb)'::regprocedure::oid,'public.uc_education_artifact_context(uuid,uuid,uuid,bigint,uuid)'::regprocedure::oid])AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='authenticated')OR p.oid=ANY(ARRAY['public.uc_attest_education_issuance_staging(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)'::regprocedure::oid,'public.uc_attest_education_issuance_artifact(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)'::regprocedure::oid])AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role'))AND a.privilege_type='EXECUTE'AND NOT a.is_grantable)))
 OR EXISTS(SELECT 1 FROM(SELECT unnest(ARRAY['public.read_education_issuance(uuid,jsonb,jsonb)'::regprocedure::oid,'public.apply_education_issuance_action(uuid,jsonb,uuid,jsonb)'::regprocedure::oid,'public.prepare_education_issuance_artifacts(uuid,jsonb,uuid,jsonb)'::regprocedure::oid,'public.uc_education_artifact_context(uuid,uuid,uuid,bigint,uuid)'::regprocedure::oid])rpc_oid,'authenticated'::text role_name UNION ALL SELECT unnest(ARRAY['public.uc_attest_education_issuance_staging(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)'::regprocedure::oid,'public.uc_attest_education_issuance_artifact(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)'::regprocedure::oid]),'service_role')rpc WHERE NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(NULLIF(coalesce(p.proacl,acldefault('f',p.proowner)),'{}'::aclitem[]))a WHERE p.oid=rpc.rpc_oid AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname=rpc.role_name)AND a.privilege_type='EXECUTE'AND NOT a.is_grantable))
 THEN RAISE EXCEPTION 'UC019_NEW_FUNCTION_ACL_OR_INVENTORY_MISMATCH';END IF;
 IF EXISTS(SELECT 1 FROM uc019_new_function_allowlist f CROSS JOIN unnest(ARRAY['authenticated','anon','service_role'])role_name WHERE has_function_privilege(role_name,to_regprocedure(f.signature),'EXECUTE')IS DISTINCT FROM(role_name='authenticated'AND to_regprocedure(f.signature)::oid=ANY(ARRAY['public.read_education_issuance(uuid,jsonb,jsonb)'::regprocedure::oid,'public.apply_education_issuance_action(uuid,jsonb,uuid,jsonb)'::regprocedure::oid,'public.prepare_education_issuance_artifacts(uuid,jsonb,uuid,jsonb)'::regprocedure::oid,'public.uc_education_artifact_context(uuid,uuid,uuid,bigint,uuid)'::regprocedure::oid])OR role_name='service_role'AND to_regprocedure(f.signature)::oid=ANY(ARRAY['public.uc_attest_education_issuance_staging(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)'::regprocedure::oid,'public.uc_attest_education_issuance_artifact(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)'::regprocedure::oid])))
 THEN RAISE EXCEPTION 'UC019_NEW_FUNCTION_EFFECTIVE_EXECUTE_MISMATCH';END IF;
 -- No additions to an old relation can hide behind the old-OID snapshots.
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('auth','storage')AND NOT EXISTS(SELECT 1 FROM uc019_old_classes o WHERE o.oid=c.oid))
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND NOT EXISTS(SELECT 1 FROM uc019_old_classes o WHERE o.oid=c.oid)AND NOT(c.relkind IN('r','p')AND c.relname=ANY(ARRAY['uc_education_issuance_contexts','uc_education_issuance_events','uc_education_issuance_preparation_items','uc_education_issuance_preparations','uc_education_issuance_requests','uc_education_issuance_states','uc_enrollment_withdrawal_events','uc_enrollment_withdrawal_states'])OR c.relkind IN('i','I')AND EXISTS(SELECT 1 FROM pg_index i JOIN pg_class r ON r.oid=i.indrelid JOIN pg_namespace rn ON rn.oid=r.relnamespace WHERE i.indexrelid=c.oid AND rn.nspname='public'AND r.relname=ANY(ARRAY['uc_education_issuance_contexts','uc_education_issuance_events','uc_education_issuance_preparation_items','uc_education_issuance_preparations','uc_education_issuance_requests','uc_education_issuance_states','uc_enrollment_withdrawal_events','uc_enrollment_withdrawal_states']))))
 OR EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname !~ '^pg_(toast_)?temp_'AND NOT EXISTS(SELECT 1 FROM uc019_old_constraints o WHERE o.oid=c.oid)AND NOT EXISTS(SELECT 1 FROM pg_class r JOIN pg_namespace rn ON rn.oid=r.relnamespace WHERE r.oid=c.conrelid AND rn.nspname='public'AND r.relname=ANY(ARRAY['uc_education_issuance_contexts','uc_education_issuance_events','uc_education_issuance_preparation_items','uc_education_issuance_preparations','uc_education_issuance_requests','uc_education_issuance_states','uc_enrollment_withdrawal_events','uc_enrollment_withdrawal_states']))AND NOT(c.conrelid='public.education_document_records'::regclass AND c.conname='education_document_records_delivery_method_check'))
 OR EXISTS(SELECT 1 FROM pg_policy p JOIN uc019_old_classes r ON r.oid=p.polrelid WHERE NOT EXISTS(SELECT 1 FROM uc019_old_policies o WHERE o.oid=p.oid)AND NOT(p.polrelid='storage.objects'::regclass AND p.polname='uc_education_staging_private_boundary'))
 OR EXISTS(SELECT 1 FROM pg_attrdef d JOIN uc019_old_classes r ON r.oid=d.adrelid WHERE NOT EXISTS(SELECT 1 FROM uc019_old_defaults o WHERE o.oid=d.oid))
 OR EXISTS(SELECT 1 FROM pg_index i JOIN uc019_old_classes r ON r.oid=i.indrelid WHERE NOT EXISTS(SELECT 1 FROM uc019_old_classes o WHERE o.oid=i.indexrelid))
 OR EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_(toast_)?temp_'AND NOT EXISTS(SELECT 1 FROM uc019_old_types o WHERE o.oid=t.oid)AND NOT EXISTS(SELECT 1 FROM pg_class r JOIN pg_namespace rn ON rn.oid=r.relnamespace JOIN pg_type rt ON rt.oid=r.reltype WHERE rn.nspname='public'AND r.relname=ANY(ARRAY['uc_education_issuance_contexts','uc_education_issuance_events','uc_education_issuance_preparation_items','uc_education_issuance_preparations','uc_education_issuance_requests','uc_education_issuance_states','uc_enrollment_withdrawal_events','uc_enrollment_withdrawal_states'])AND t.oid IN(r.reltype,rt.typarray)))
 THEN RAISE EXCEPTION 'UC019_UNDECLARED_ADDITIVE_CATALOG_OBJECT';END IF;
 IF(SELECT count(*)FROM pg_trigger t JOIN uc019_old_classes o ON o.oid=t.tgrelid WHERE NOT EXISTS(SELECT 1 FROM uc019_old_triggers x WHERE x.oid=t.oid))<>11
 OR EXISTS(SELECT 1 FROM pg_trigger t JOIN uc019_old_classes o ON o.oid=t.tgrelid WHERE NOT EXISTS(SELECT 1 FROM uc019_old_triggers x WHERE x.oid=t.oid)AND(t.tgisinternal OR t.tgconstraint<>0 OR t.tgconstrrelid<>0 OR t.tgconstrindid<>0 OR t.tgdeferrable OR t.tginitdeferred OR t.tgqual IS NOT NULL OR t.tgattr<>''::int2vector OR t.tgoldtable IS NOT NULL OR t.tgnewtable IS NOT NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements((SELECT value->'newOldTableGuards'FROM uc019_expected_catalog))g WHERE g->>'schema'=o.nspname AND g->>'table'=o.relname AND g->>'name'=t.tgname AND g->>'definition'=pg_get_triggerdef(t.oid,true)AND g->>'enabled'=t.tgenabled::text AND(g->>'type')::int=t.tgtype AND g->>'args'=encode(t.tgargs,'hex'))))
 THEN RAISE EXCEPTION 'UC019_EXACT_ELEVEN_OLD_TABLE_GUARDS_MISMATCH';END IF;

 FOREACH guard_new_table IN ARRAY ARRAY['uc_education_issuance_contexts','uc_education_issuance_events','uc_education_issuance_preparation_items','uc_education_issuance_preparations','uc_education_issuance_requests','uc_education_issuance_states','uc_enrollment_withdrawal_events','uc_enrollment_withdrawal_states'] LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',guard_new_table) INTO guard_new_rows;
  IF guard_new_rows THEN RAISE EXCEPTION 'UC019_NEW_TABLE_NOT_EMPTY: %',guard_new_table;END IF;
 END LOOP;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key,rollback)VALUES('20261023010000','uc_education_issuance_lifecycle',ARRAY['-- Exact actual621 function preimages; no ledger-count assumptions in raw migration.
DO $preimage$DECLARE n integer;h text;BEGIN
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''uc_admission_requirements_digest''AND pg_get_function_identity_arguments(p.oid)=''p_case uuid'';IF n<>1 OR h IS DISTINCT FROM''c9e1ca698f744ff7a67465ac1a9950e8''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: uc_admission_requirements_digest'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''uc_admission_state''AND pg_get_function_identity_arguments(p.oid)=''p_case uuid, p_actor uuid, p_learner boolean'';IF n<>1 OR h IS DISTINCT FROM''dea3e9b40160f26adb28cfdfe2bc3e54''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: uc_admission_state'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''uc_admission_event''AND pg_get_function_identity_arguments(p.oid)=''p_case uuid, p_actor uuid, p_event uuid, p_kind text, p_request uuid, p_payload_digest text, p_reason text'';IF n<>1 OR h IS DISTINCT FROM''3e81ed477945abdc48aafbc7bb08752a''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: uc_admission_event'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''uc_admission_validate_action''AND pg_get_function_identity_arguments(p.oid)=''p_command jsonb'';IF n<>1 OR h IS DISTINCT FROM''cd55430ab20af655fea869e9ebb3031e''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: uc_admission_validate_action'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''apply_student_admission_case_action''AND pg_get_function_identity_arguments(p.oid)=''p_organization_id uuid, p_student_user_id uuid, p_request_id uuid, p_command jsonb'';IF n<>1 OR h IS DISTINCT FROM''085703a16eb2795cbc018b87ca232893''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: apply_student_admission_case_action'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''can_access_course_as_learner''AND pg_get_function_identity_arguments(p.oid)=''_course_id uuid'';IF n<>1 OR h IS DISTINCT FROM''ac874288fd237b9a70850c9108d7fbcf''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: can_access_course_as_learner'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''auto_complete_enrollment''AND pg_get_function_identity_arguments(p.oid)='''';IF n<>1 OR h IS DISTINCT FROM''7975b82096da4f518bd429d14011208a''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: auto_complete_enrollment'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''complete_own_course_enrollment''AND pg_get_function_identity_arguments(p.oid)=''p_enrollment_id uuid'';IF n<>1 OR h IS DISTINCT FROM''cf2e185eea26424a64407615da3f84fc''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: complete_own_course_enrollment'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''recalc_enrollment_progress''AND pg_get_function_identity_arguments(p.oid)='''';IF n<>1 OR h IS DISTINCT FROM''6e08194130c44ad1009ea42c73e0bdd0''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: recalc_enrollment_progress'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''recalc_enrollment_time''AND pg_get_function_identity_arguments(p.oid)=''p_enrollment_id uuid'';IF n<>1 OR h IS DISTINCT FROM''debd68026dbe4ab127ba954878b9c096''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: recalc_enrollment_time'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''uc_learning_access''AND pg_get_function_identity_arguments(p.oid)=''p_org uuid, p_scope jsonb, p_write boolean'';IF n<>1 OR h IS DISTINCT FROM''8906d1848181831ba04d823913f02658''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: uc_learning_access'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''auto_create_education_document''AND pg_get_function_identity_arguments(p.oid)='''';IF n<>1 OR h IS DISTINCT FROM''2ca349325b86d9a43bdb9ea52b63b94c''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: auto_create_education_document'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''uc_guard_enrollment_delete''AND pg_get_function_identity_arguments(p.oid)='''';IF n<>1 OR h IS DISTINCT FROM''695e59b918eaedb9aacbb4e808b503df''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: uc_guard_enrollment_delete'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''cancel_course_assignment''AND pg_get_function_identity_arguments(p.oid)=''p_enrollment_id uuid, p_organization_id uuid'';IF n<>1 OR h IS DISTINCT FROM''5216588e67f76fe3ae30ddab3837dcae''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: cancel_course_assignment'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''read_learning_outcome''AND pg_get_function_identity_arguments(p.oid)=''p_organization_id uuid, p_query jsonb'';IF n<>1 OR h IS DISTINCT FROM''b156cdaed9f6e4de74500d96d035191e''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: read_learning_outcome'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''issue_education_document_batch''AND pg_get_function_identity_arguments(p.oid)=''p_organization_id uuid, p_group_id uuid, p_course_id uuid, p_items jsonb'';IF n<>1 OR h IS DISTINCT FROM''692c93d809266565da3ec8a93668ad42''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: issue_education_document_batch'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''commit_org_document_version''AND pg_get_function_identity_arguments(p.oid)=''p_document_id uuid, p_organization_id uuid, p_request_id uuid, p_expected_revision bigint, p_upload jsonb, p_restore_version_id uuid, p_document jsonb'';IF n<>1 OR h IS DISTINCT FROM''73ff967e0f7ff97c3d96f8d3f14191fd''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: commit_org_document_version'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''account_deletion_snapshot''AND pg_get_function_identity_arguments(p.oid)=''p_user_id uuid'';IF n<>1 OR h IS DISTINCT FROM''fe1fbb5670a69d58c5a846dd93296ede''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: account_deletion_snapshot'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''account_deletion_files''AND pg_get_function_identity_arguments(p.oid)=''p_user_id uuid'';IF n<>1 OR h IS DISTINCT FROM''6edb02b4091de45199ae7f6f0749956d''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: account_deletion_files'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''uc_guard_program_issuance''AND pg_get_function_identity_arguments(p.oid)='''';IF n<>1 OR h IS DISTINCT FROM''05b362d516a0676bea8b48b1d2b40e7d''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: uc_guard_program_issuance'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''uc_record_program_issuance''AND pg_get_function_identity_arguments(p.oid)='''';IF n<>1 OR h IS DISTINCT FROM''357fd09f67deb7e838a314a6b60d60b2''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: uc_record_program_issuance'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''uc_scoped_journal_personal_counts''AND pg_get_function_identity_arguments(p.oid)=''p_user uuid'';IF n<>1 OR h IS DISTINCT FROM''63476fea68407b8f0a09a0ace1e2030a''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: uc_scoped_journal_personal_counts'' USING ERRCODE=''55000'';END IF;
 SELECT count(*),min(md5(p.prosrc))INTO n,h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname=''public''AND p.proname=''uc_scoped_journal_erase_user''AND pg_get_function_identity_arguments(p.oid)=''p_user uuid'';IF n<>1 OR h IS DISTINCT FROM''eeab1ccbbf78c67ad8035420aa9e2ff7''THEN RAISE EXCEPTION ''UC019 actual621 preimage mismatch: uc_scoped_journal_erase_user'' USING ERRCODE=''55000'';END IF;
END;$preimage$;
-- UC019: controlled official issuance, factual delivery and retained withdrawal.
-- Additive private state; no backfill, old-row updates, new number engine or quota rewrite.
CREATE TABLE public.uc_education_issuance_states(
 record_id uuid PRIMARY KEY,organization_id uuid NOT NULL,user_id uuid,course_id uuid,enrollment_id uuid,group_id uuid,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),original_record_id uuid,registry_record_id uuid,proof jsonb,artifact jsonb,frdo_facts jsonb,
 notes text NOT NULL DEFAULT '''' CHECK(length(notes)<=4000),annulment jsonb,latest_handover jsonb,
 recorded_by uuid,updated_by uuid,participant_ids uuid[] NOT NULL DEFAULT ''{}'',redacted boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.uc_education_issuance_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),record_id uuid NOT NULL,organization_id uuid NOT NULL,user_id uuid,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 kind text NOT NULL CHECK(kind IN(''issued'',''metadata_corrected'',''handover_recorded'',''handover_voided'',''duplicate_issued'',''annulled'')),actor_id uuid,reason text NOT NULL CHECK(length(reason)<=2000),
 previous_state_hash text NOT NULL CHECK(previous_state_hash~''^[a-f0-9]{64}$''),state_hash text NOT NULL CHECK(state_hash~''^[a-f0-9]{64}$''),payload jsonb NOT NULL,
 participant_ids uuid[] NOT NULL DEFAULT ''{}'',redacted boolean NOT NULL DEFAULT false,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(record_id,revision)
);
CREATE TABLE public.uc_enrollment_withdrawal_states(
 enrollment_id uuid PRIMARY KEY,organization_id uuid NOT NULL,user_id uuid,course_id uuid NOT NULL,group_id uuid,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 effective_date date NOT NULL,basis jsonb NOT NULL,technical_snapshot jsonb NOT NULL,recorded_by uuid,participant_ids uuid[] NOT NULL DEFAULT ''{}'',redacted boolean NOT NULL DEFAULT false,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.uc_enrollment_withdrawal_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),enrollment_id uuid NOT NULL,organization_id uuid NOT NULL,user_id uuid,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 actor_id uuid,reason text NOT NULL CHECK(length(reason)<=2000),effective_date date NOT NULL,basis jsonb NOT NULL,before_state jsonb NOT NULL,after_state jsonb NOT NULL,participant_ids uuid[] NOT NULL DEFAULT ''{}'',redacted boolean NOT NULL DEFAULT false,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(enrollment_id,revision)
);
CREATE TABLE public.uc_education_issuance_requests(
 actor_id uuid NOT NULL,request_id uuid NOT NULL,organization_id uuid NOT NULL,scope jsonb NOT NULL,action text NOT NULL CHECK(action IN(''issue_batch'',''apply_change'',''withdraw_enrollments'',''prepare_artifacts'',''render_artifact'')),
 payload_hash text NOT NULL CHECK(payload_hash~''^[a-f0-9]{64}$''),receipt jsonb NOT NULL,participant_ids uuid[] NOT NULL DEFAULT ''{}'',PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE public.uc_education_issuance_contexts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),transaction_id bigint NOT NULL,backend_pid integer NOT NULL,actor_id uuid NOT NULL,organization_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN(''original'',''duplicate'')),enrollment_id uuid NOT NULL,user_id uuid NOT NULL,course_id uuid NOT NULL,group_id uuid NOT NULL,
 original_record_id uuid,proof jsonb NOT NULL,source_snapshot jsonb NOT NULL,official_identity jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX uc_education_issuance_scope ON public.uc_education_issuance_states(organization_id,record_id);
CREATE INDEX uc_education_issuance_history ON public.uc_education_issuance_events(organization_id,record_id,revision DESC);
CREATE INDEX uc_enrollment_withdrawal_scope ON public.uc_enrollment_withdrawal_states(organization_id,enrollment_id);
DO $private$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY[''uc_education_issuance_states'',''uc_education_issuance_events'',''uc_enrollment_withdrawal_states'',''uc_enrollment_withdrawal_events'',''uc_education_issuance_requests'',''uc_education_issuance_contexts'']LOOP
 EXECUTE format(''ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY'',t);EXECUTE format(''REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role'',t);END LOOP;END;$private$;
CREATE FUNCTION public.uc_education_issue_error(p_code text)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION ''EDUCATION_ISSUANCE_%'',p_code USING ERRCODE=CASE p_code WHEN ''ACCESS_DENIED''THEN ''42501''WHEN ''INVALID_INPUT''THEN ''22023''WHEN ''REVISION_CONFLICT''THEN ''PT409''WHEN ''REQUEST_CONFLICT''THEN ''PT409''WHEN ''SOURCE_CHANGED''THEN ''PT409''WHEN ''NUMBER_PLAN_STALE''THEN ''PT409''ELSE ''P0001''END;END;$fn$;
CREATE FUNCTION public.uc_enrollment_is_withdrawn(p_enrollment uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.uc_enrollment_withdrawal_states s WHERE s.enrollment_id=p_enrollment AND NOT s.redacted) $fn$;
CREATE FUNCTION public.uc_education_issue_actor()RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()=''authenticated''AND auth.uid()IS NOT NULL AND public.uc_custom_journal_person(auth.uid())AND public.account_deletion_access_allowed(),false) $fn$;
CREATE FUNCTION public.uc_education_issue_scope(p_org uuid,p_scope jsonb)RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN IF NOT public.uc_education_issue_actor()OR p_org IS NULL THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 IF public.uc_admission_shape(p_scope,ARRAY[''kind''])AND p_scope->>''kind''=''organization''THEN RETURN NULL;
 ELSIF public.uc_admission_shape(p_scope,ARRAY[''kind'',''group_id''])AND p_scope->>''kind''=''group''AND public.uc_admission_uuid(p_scope->''group_id'')AND EXISTS(SELECT 1 FROM public.student_groups g WHERE g.id=(p_scope->>''group_id'')::uuid AND g.organization_id=p_org)THEN RETURN(p_scope->>''group_id'')::uuid;
 ELSE PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;END;$fn$;
CREATE FUNCTION public.uc_education_issue_can(p_org uuid,p_group uuid,p_enrollment uuid,p_user uuid,p_course uuid,p_action text)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_education_issue_actor()AND public.uc_document_has_action(p_org,p_action)AND public.uc_document_record_scope(p_org,p_group,p_enrollment,p_user,p_course),false) $fn$;
CREATE FUNCTION public.uc_education_withdraw_can(p_org uuid,p_group uuid,p_enrollment uuid,p_write boolean DEFAULT false)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_education_issue_actor()AND EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=p_enrollment AND c.organization_id=p_org
 AND(CASE WHEN p_write THEN public.uc_student_frdo_staff_org_allowed(auth.uid(),p_org,''students.write'')ELSE public.uc_platform_document_action_allowed(auth.uid(),''read'')AND public.can_access_organization(p_org,''students.read'')END)
 AND public.uc_document_scope_allowed(p_org,p_group,e.id)AND(p_group IS NULL OR EXISTS(SELECT 1 FROM public.student_groups g JOIN public.student_group_memberships_effective m ON m.group_id=g.id AND m.organization_id=g.organization_id WHERE g.id=p_group AND g.organization_id=p_org AND g.course_id=e.course_id AND m.user_id=e.user_id))),false) $fn$;
CREATE FUNCTION public.uc_education_issue_caps(p_org uuid,p_group uuid,p_enrollment uuid DEFAULT NULL,p_user uuid DEFAULT NULL,p_course uuid DEFAULT NULL)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object(''can_read'',r,''can_issue'',i,''can_write_metadata'',w,''can_record_handover'',w,''can_annul'',a,''can_issue_duplicate'',i,''can_export'',r,
 ''can_read_withdrawal'',CASE WHEN p_enrollment IS NOT NULL THEN public.uc_education_withdraw_can(p_org,p_group,p_enrollment,false)ELSE public.uc_education_issue_actor()AND public.uc_platform_document_action_allowed(auth.uid(),''read'')AND public.can_access_organization(p_org,''students.read'')END,
 ''can_withdraw'',CASE WHEN p_enrollment IS NOT NULL THEN public.uc_education_withdraw_can(p_org,p_group,p_enrollment,true)ELSE public.uc_education_issue_actor()AND public.uc_student_frdo_staff_org_allowed(auth.uid(),p_org,''students.write'')END)FROM(SELECT public.uc_education_issue_can(p_org,p_group,p_enrollment,p_user,p_course,''read'')r,public.uc_education_issue_can(p_org,p_group,p_enrollment,p_user,p_course,''issue'')AND coalesce((public.uc_document_registry_caps(p_org,p_group)->>''can_register'')::boolean,false)i,public.uc_education_issue_can(p_org,p_group,p_enrollment,p_user,p_course,''issue'')a,public.uc_education_issue_can(p_org,p_group,p_enrollment,p_user,p_course,''write'')w)x $fn$;
CREATE FUNCTION public.uc_education_issue_fence(p_org uuid,p_group uuid,p_people uuid[],p_key text DEFAULT NULL)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE u uuid;BEGIN
 FOR u IN SELECT DISTINCT id FROM unnest(array_append(coalesce(p_people,''{}''),auth.uid()))id WHERE id IS NOT NULL ORDER BY id LOOP
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(u::text,42007))THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;
 IF EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=u)THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;END LOOP;
 IF p_key IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended(''uc_education:''||p_org::text||'':''||p_key,0))THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;
END;$fn$;
CREATE FUNCTION public.uc_education_issue_source(p_org uuid,p_source jsonb,p_required boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v jsonb;BEGIN v:=public.uc_document_registry_source(p_org,p_source,false,false);IF v IS NULL AND p_required THEN PERFORM public.uc_education_issue_error(''SOURCE_UNAVAILABLE'');END IF;RETURN v;END;$fn$;
CREATE FUNCTION public.uc_education_issue_source_projection(p_org uuid,p_source jsonb)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object(''source'',CASE WHEN public.uc_education_issue_source(p_org,p_source,false)IS NOT NULL THEN p_source END,''availability'',CASE WHEN public.uc_education_issue_source(p_org,p_source,false)IS NOT NULL THEN ''available''ELSE ''currently_unavailable''END) $fn$;
CREATE FUNCTION public.uc_education_issue_basis_projection(p_org uuid,p_basis jsonb)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT(p_basis-''source'')||jsonb_build_object(''source'',CASE WHEN public.uc_education_issue_source(p_org,p_basis->''source'',false)IS NOT NULL THEN p_basis->''source''END,''source_availability'',CASE WHEN public.uc_education_issue_source(p_org,p_basis->''source'',false)IS NOT NULL THEN ''available''ELSE ''currently_unavailable''END) $fn$;

DO $delivery$DECLARE def text;BEGIN SELECT pg_get_constraintdef(oid,true)INTO def FROM pg_constraint WHERE conrelid=''public.education_document_records''::regclass AND conname=''education_document_records_delivery_method_check'';IF def IS DISTINCT FROM ''CHECK (delivery_method = ANY (ARRAY[''''personal''''::text, ''''representative''''::text, ''''postal''''::text]))''THEN RAISE EXCEPTION ''UC019 unexpected delivery constraint'' USING ERRCODE=''55000'';END IF;END;$delivery$;
ALTER TABLE public.education_document_records DROP CONSTRAINT education_document_records_delivery_method_check;
ALTER TABLE public.education_document_records ADD CONSTRAINT education_document_records_delivery_method_check CHECK(delivery_method=ANY(ARRAY[''personal''::text,''representative''::text,''postal''::text,''not_recorded''::text]));

CREATE TABLE public.uc_education_issuance_preparations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,actor_id uuid,scope jsonb NOT NULL,kind text NOT NULL CHECK(kind IN(''original'',''duplicate'')),plan jsonb NOT NULL,
 intent_hash text NOT NULL CHECK(intent_hash~''^[a-f0-9]{64}$''),template jsonb NOT NULL,template_storage jsonb NOT NULL,template_byte_sha256 text CHECK(template_byte_sha256~''^[a-f0-9]{64}$''),number_witness jsonb NOT NULL,
 participant_ids uuid[]NOT NULL DEFAULT ''{}'',redacted boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.uc_education_issuance_preparation_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),preparation_id uuid NOT NULL,organization_id uuid NOT NULL,enrollment_id uuid NOT NULL,user_id uuid,course_id uuid NOT NULL,group_id uuid NOT NULL,input_revision bigint NOT NULL DEFAULT 1 CHECK(input_revision BETWEEN 1 AND 9007199254740991),
 number_plan jsonb NOT NULL,eligibility_ref jsonb NOT NULL,source_snapshot jsonb NOT NULL,official_identity jsonb NOT NULL,frdo_facts jsonb NOT NULL,render_variables jsonb NOT NULL,render_input_hash text NOT NULL CHECK(render_input_hash~''^[a-f0-9]{64}$''),
 output_document_id uuid NOT NULL UNIQUE,output_request_id uuid NOT NULL UNIQUE,retained_subject_user_id uuid,staging_proof jsonb,artifact jsonb,final_record_id uuid,participant_ids uuid[]NOT NULL DEFAULT ''{}'',redacted boolean NOT NULL DEFAULT false,UNIQUE(preparation_id,enrollment_id));
ALTER TABLE public.uc_education_issuance_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uc_education_issuance_preparation_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.uc_education_issuance_preparations,public.uc_education_issuance_preparation_items FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX uc_education_preparations_creator ON public.uc_education_issuance_preparations(organization_id,actor_id,id);
CREATE INDEX uc_education_preparation_subject ON public.uc_education_issuance_preparation_items(organization_id,user_id,preparation_id);
CREATE FUNCTION public.uc_education_number_witness(p_org uuid,p_date date)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object(''year'',extract(year FROM p_date)::integer,''seq_doc'',(SELECT last_number FROM public.document_number_sequences WHERE organization_id=p_org AND doc_type=''edu_doc''AND year=extract(year FROM p_date)::integer),''seq_reg'',(SELECT last_number FROM public.document_number_sequences WHERE organization_id=p_org AND doc_type=''edu_reg''AND year=extract(year FROM p_date)::integer),
 ''max_doc'',(SELECT coalesce(max(substring(r.document_number FROM''([0-9]+)$'')::integer),0)FROM public.education_document_records r WHERE organization_id=p_org AND extract(year FROM issue_date)=extract(year FROM p_date)AND deleted_at IS NULL),
 ''max_reg'',(SELECT coalesce(max(substring(r.reg_number FROM''([0-9]+)$'')::integer),0)FROM public.education_document_records r WHERE organization_id=p_org AND extract(year FROM issue_date)=extract(year FROM p_date)AND deleted_at IS NULL))$fn$;
CREATE FUNCTION public.uc_education_prospective_numbers(p_witness jsonb,p_index integer,p_date date,p_series text)RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE doc_n bigint;reg_n bigint;yr text:=p_witness->>''year'';BEGIN IF p_index NOT BETWEEN 1 AND 100 THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 doc_n:=greatest(coalesce((p_witness->>''seq_doc'')::bigint,0)+1,(p_witness->>''max_doc'')::bigint+1)+p_index-1;reg_n:=greatest(coalesce((p_witness->>''seq_reg'')::bigint,0)+1,(p_witness->>''max_reg'')::bigint+1)+p_index-1;
 IF doc_n>2147483647 OR reg_n>2147483647 THEN PERFORM public.uc_education_issue_error(''LIMIT_EXCEEDED'');END IF;
 RETURN jsonb_build_object(''state'',''prospective_unreserved'',''document_number'',yr||''/''||lpad(doc_n::text,greatest(6,length(doc_n::text)),''0''),''reg_number'',''ДОК-''||yr||''/''||lpad(reg_n::text,greatest(4,length(reg_n::text)),''0''),''document_series'',p_series,''issue_date'',p_date);END;$fn$;
CREATE FUNCTION public.uc_education_issue_source_lock(p_org uuid,p_source jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.uc_education_issue_source(p_org,p_source,true);
 PERFORM 1 FROM public.org_documents WHERE id=(p_source->>''document_id'')::uuid AND organization_id=p_org FOR SHARE;
 PERFORM 1 FROM public.org_document_versions WHERE id=(p_source->>''version_id'')::uuid AND organization_id=p_org FOR SHARE;
 PERFORM 1 FROM storage.objects WHERE id=(SELECT storage_object_id FROM public.org_document_versions WHERE id=(p_source->>''version_id'')::uuid AND organization_id=p_org)FOR SHARE;
 PERFORM public.uc_education_issue_source(p_org,p_source,true);END;$fn$;
CREATE FUNCTION public.uc_education_template(p_org uuid,p_template jsonb,p_lock boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
DECLARE v public.org_document_versions;d public.org_documents;r public.org_document_reviews;o storage.objects;storage jsonb;BEGIN
 IF NOT public.uc_admission_shape(p_template,ARRAY[''source'',''review_id'',''review_revision''])OR NOT public.uc_admission_uuid(p_template->''review_id'')OR jsonb_typeof(p_template->''review_revision'')IS DISTINCT FROM''number''THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 PERFORM public.uc_education_issue_source(p_org,p_template->''source'',true);IF p_lock THEN PERFORM public.uc_education_issue_source_lock(p_org,p_template->''source'');END IF;
 SELECT *INTO v FROM public.org_document_versions WHERE id=(p_template->''source''->>''version_id'')::uuid AND document_id=(p_template->''source''->>''document_id'')::uuid AND organization_id=p_org;
 SELECT *INTO d FROM public.org_documents WHERE id=v.document_id AND organization_id=p_org;
 IF p_lock THEN PERFORM 1 FROM public.org_document_reviews WHERE id=(p_template->>''review_id'')::uuid FOR SHARE;END IF;
 SELECT *INTO r FROM public.org_document_reviews WHERE id=(p_template->>''review_id'')::uuid AND document_id=d.id AND version_id=v.id AND organization_id=p_org;
 SELECT *INTO o FROM storage.objects WHERE id=v.storage_object_id;
 IF r.id IS NULL OR r.state<>''approved''OR r.revision<>(p_template->>''review_revision'')::bigint OR d.current_version_id IS DISTINCT FROM v.id OR NOT public.uc_program_file_proof(p_org,v.id)OR EXISTS(SELECT 1 FROM public.org_document_review_comments c WHERE c.review_id=r.id AND c.resolution_status=''accepted''AND c.position_anchor->>''kind''IN(''insert'',''delete'',''replace''))OR lower(split_part(v.storage_metadata->>''mimetype'','';'',1))<>''text/html''OR v.file_size NOT BETWEEN 1 AND 1048576 THEN PERFORM public.uc_education_issue_error(''ARTIFACT_REVIEW_REQUIRED'');END IF;
 storage:=jsonb_build_object(''bucket'',''org-documents'',''path'',v.file_path,''object_id'',o.id,''updated_at'',o.updated_at,''byte_size'',v.file_size,''mime_type'',''text/html'',''metadata_hash'',p_template->''source''->''content_hash'',''known_sha256'',NULL);
 RETURN jsonb_build_object(''ref'',p_template,''storage'',storage);END;$fn$;

CREATE FUNCTION public.uc_education_admission_definition_shape(p_definition jsonb,p_program_type text)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE x jsonb:=p_definition->''issuance_condition'';keys text[]:=ARRAY[''key'',''kind'',''staff_label'',''source_version_ids'',''provision'',''exception_policy''];BEGIN
 IF p_definition?''issuance_condition''THEN keys:=keys||ARRAY[''issuance_condition''];END IF;IF NOT public.uc_admission_shape(p_definition,keys)THEN RETURN false;END IF;
 IF NOT p_definition?''issuance_condition''THEN RETURN true;END IF;IF p_definition->>''kind''<>''education_basis''THEN RETURN false;END IF;
 IF public.uc_admission_shape(x,ARRAY[''kind'',''education_levels'',''concurrent_study_admission_allowed''])AND x->>''kind''=''primary_education_before_qualification''AND x->''education_levels''=''["spo","vo"]''::jsonb AND jsonb_typeof(x->''concurrent_study_admission_allowed'')=''boolean''THEN RETURN true;END IF;
 RETURN coalesce(public.uc_admission_shape(x,ARRAY[''kind'',''reason''])AND x->>''kind''=''no_separate_primary_education_condition''AND public.uc_admission_text(x->''reason'',1000)AND p_program_type=''professional_training'',false);END;$fn$;
CREATE FUNCTION public.uc_education_admission_evidence_shape(p_evidence jsonb)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT p_evidence=''null''::jsonb OR coalesce(public.uc_admission_shape(p_evidence,ARRAY[''kind'',''education_level'',''evidence_version_ids''])AND p_evidence->>''kind''=''completed_primary_education''AND p_evidence->>''education_level''IN(''spo'',''vo'')AND public.uc_admission_ids(p_evidence->''evidence_version_ids'',1,20),false) $fn$;
CREATE FUNCTION public.uc_education_admission_reviews(p_case uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;r public.uc_admission_rule_sets;d jsonb;q jsonb;identity jsonb;items jsonb:=''[]'';BEGIN
 SELECT *INTO c FROM public.uc_admission_cases WHERE id=p_case;SELECT *INTO r FROM public.uc_admission_rule_sets WHERE id=c.rule_set_id;
 FOR d IN SELECT value FROM jsonb_array_elements(coalesce(r.definitions,''[]''))WHERE value?''issuance_condition''LOOP identity:=c.reviews->''identities''->(d->>''key'');q:=c.reviews->''requirements''->(identity->>''id'');
 IF public.uc_admission_uuid(q->''event_id'')THEN items:=items||jsonb_build_array(jsonb_build_object(''requirement_id'',identity->''id'',''requirement_revision'',q->''requirement_revision'',''event_id'',q->''event_id'',''actor_id'',q->''actor_id'',''condition'',d->''issuance_condition'',''evidence'',q->''issuance_evidence''));END IF;END LOOP;RETURN items;END;$fn$;
CREATE FUNCTION public.uc_education_admission_digest(p_requirements jsonb,p_rule uuid,p_program jsonb,p_reviews jsonb)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_program_hash(jsonb_build_object(''requirements'',p_requirements,''rule_set_id'',p_rule,''program_ref'',p_program)||CASE WHEN jsonb_array_length(coalesce(p_reviews,''[]''))>0 THEN jsonb_build_object(''issuance_reviews'',p_reviews)ELSE ''{}''::jsonb END) $fn$;
CREATE FUNCTION public.uc_education_admission_review_check(p_case uuid,p_requirement uuid,p_evidence jsonb,p_selected jsonb)RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;d jsonb;e jsonb;v jsonb;BEGIN IF p_evidence IS NULL OR p_evidence=''null''::jsonb THEN RETURN;END IF;
 IF NOT public.uc_education_admission_evidence_shape(p_evidence)THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;SELECT *INTO c FROM public.uc_admission_cases WHERE id=p_case;
 SELECT def INTO d FROM public.uc_admission_rule_sets r,jsonb_array_elements(r.definitions)def WHERE r.id=c.rule_set_id AND def->>''kind''=''education_basis''AND c.reviews->''identities''->(def->>''key'')->>''id''=p_requirement::text;
 IF d->''issuance_condition''->>''kind''IS DISTINCT FROM ''primary_education_before_qualification''THEN PERFORM public.uc_admission_error(''REVIEW_REQUIRED'');END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p_evidence->''evidence_version_ids'')LOOP
 IF NOT p_selected@>jsonb_build_array(e)OR NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence x WHERE x.id=(e#>>''{}'')::uuid AND x.case_id=c.id AND x.requirement_id=p_requirement AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=x.id))THEN PERFORM public.uc_admission_error(''SOURCE_CHANGED'');END IF;
 v:=public.uc_admission_evidence_dto((e#>>''{}'')::uuid,auth.uid());IF v->>''availability''IS DISTINCT FROM ''available''OR v->>''review''IS DISTINCT FROM ''accepted''OR v->''can_read_bytes''IS DISTINCT FROM ''true''::jsonb THEN PERFORM public.uc_admission_error(''REVIEW_REQUIRED'');END IF;END LOOP;END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_admission_requirements_digest(p_case uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public''
AS $function$
 SELECT public.uc_education_admission_digest(requirements,rule_set_id,program_ref,public.uc_education_admission_reviews(id))FROM public.uc_admission_cases WHERE id=p_case
$function$;

CREATE FUNCTION public.uc_education_admission_conditions(p_case uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;r public.uc_admission_rule_sets;d jsonb;identity jsonb;items jsonb:=''[]'';BEGIN
 SELECT *INTO c FROM public.uc_admission_cases WHERE id=p_case;SELECT *INTO r FROM public.uc_admission_rule_sets WHERE id=c.rule_set_id;
 FOR d IN SELECT value FROM jsonb_array_elements(coalesce(r.definitions,''[]''))WHERE value?''issuance_condition''LOOP identity:=c.reviews->''identities''->(d->>''key'');
 IF public.uc_admission_uuid(identity->''id'')AND jsonb_typeof(identity->''revision'')=''number''AND(identity->>''revision'')::bigint>0 THEN items:=items||jsonb_build_array(jsonb_build_object(''requirement_id'',identity->''id'',''requirement_revision'',identity->''revision'',''condition'',d->''issuance_condition''));END IF;END LOOP;RETURN items;END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_admission_state(p_case uuid, p_actor uuid, p_learner boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public''
AS $function$
DECLARE c public.uc_admission_cases;d jsonb;tasks jsonb;changed boolean;derived jsonb;BEGIN SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case;
 IF c.id IS NULL OR NOT public.uc_admission_can_read(p_actor,c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error(''ACCESS_DENIED'');END IF;
 derived:=public.uc_admission_derive(c.id,p_actor);changed:=c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)OR NOT coalesce(public.uc_admission_rules_current(c.id),false)OR derived->''requirements''IS DISTINCT FROM c.requirements;
 d:=c.decision;IF d IS NOT NULL THEN d:=jsonb_set(d,''{later_review_required}'',to_jsonb(changed OR coalesce((d->>''case_revision'')::bigint<c.revision,false)));END IF;
 IF p_learner THEN
 IF p_actor<>c.user_id THEN PERFORM public.uc_admission_error(''ACCESS_DENIED'');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(''id'',t->''id'',''public_label'',t->''public_label'',''next_action'',CASE WHEN t->>''kind''=''supply_evidence''THEN ''upload_own_attachment''ELSE ''contact_staff''END,''status'',t->''status'')),''[]'')INTO tasks FROM jsonb_array_elements(derived->''tasks'')t;
 RETURN jsonb_build_object(''id'',c.id,''scope'',public.uc_admission_scope(c.id),''revision'',c.revision,''program_title'',c.program_title,''outcome'',coalesce(d->>''outcome'',''not_reviewed''),''outcome_recorded_at'',d->''recorded_at'',''later_review_required'',d IS NOT NULL AND(d->>''later_review_required'')::boolean,''tasks'',tasks);END IF;
 IF NOT public.uc_admission_staff_allowed(p_actor,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error(''ACCESS_DENIED'');END IF;
 RETURN jsonb_build_object(''id'',c.id,''scope'',public.uc_admission_scope(c.id),''revision'',c.revision,''program_ref'',c.program_ref,''program_title'',c.program_title,''program_type'',c.program_type,''responsible_id'',c.responsible_id,''rule_set_id'',c.rule_set_id,''requirements'',derived->''requirements'',
 ''issuance_reviews'',public.uc_education_admission_reviews(c.id),''issuance_conditions'',public.uc_education_admission_conditions(c.id),''evidence'',public.uc_admission_current_evidence(c.id,p_actor),''tasks'',derived->''tasks'',''decision'',d,''prerequisites'',public.uc_admission_prerequisites(c.organization_id,c.user_id,c.group_id,c.enrollment_id,NOT coalesce(public.uc_admission_rules_current(c.id),false)),
 ''capabilities'',public.uc_admission_capabilities(p_actor,c.organization_id,c.user_id,c.group_id,c.enrollment_id,c.id),''rule_set_digest'',(SELECT digest FROM public.uc_admission_rule_sets WHERE id=c.rule_set_id),''requirements_digest'',public.uc_education_admission_digest(derived->''requirements'',c.rule_set_id,c.program_ref,public.uc_education_admission_reviews(c.id)));END;$function$;

CREATE OR REPLACE FUNCTION public.uc_admission_event(p_case uuid, p_actor uuid, p_event uuid, p_kind text, p_request uuid, p_payload_digest text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public''
AS $function$
DECLARE c public.uc_admission_cases;r public.uc_admission_rule_sets;payload jsonb;receipt jsonb;all_evidence jsonb;authority jsonb;BEGIN SELECT * INTO STRICT c FROM public.uc_admission_cases WHERE id=p_case;SELECT * INTO r FROM public.uc_admission_rule_sets WHERE id=c.rule_set_id;authority:=public.uc_admission_authority(c.id,p_actor);
 IF p_kind=''record_decision''THEN UPDATE public.uc_admission_cases SET decision=jsonb_set(decision,''{authority_snapshot_hash}'',to_jsonb(public.uc_program_hash(authority)))WHERE id=c.id RETURNING * INTO c;END IF;
 SELECT coalesce(jsonb_agg(e.id ORDER BY e.id),''[]'')INTO all_evidence FROM public.uc_admission_case_evidence e WHERE e.case_id=c.id AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.supersedes_id=e.id AND n.case_id=c.id);
 payload:=jsonb_build_object(''reason'',p_reason,''program_ref'',c.program_ref,''responsible_id'',c.responsible_id,''rule_set_id'',c.rule_set_id,''rule_set_digest'',r.digest,''requirements_digest'',public.uc_admission_requirements_digest(c.id),''requirements'',c.requirements,''evidence_version_ids'',all_evidence,''evidence'',public.uc_admission_current_evidence(c.id,p_actor),''tasks'',c.tasks,''decision'',c.decision,''issuance_reviews'',public.uc_education_admission_reviews(c.id),''local_sources'',coalesce(r.sources,''[]''),''local_requirements'',coalesce(r.definitions,''[]''));
 INSERT INTO public.uc_admission_case_events(id,case_id,organization_id,user_id,case_revision,kind,actor_id,authority_hash,authority_snapshot,payload)VALUES(p_event,c.id,c.organization_id,c.user_id,c.revision,p_kind,p_actor,public.uc_program_hash(authority),authority,payload);
 receipt:=jsonb_build_object(''schema_version'',1,''request_id'',p_request,''case_id'',c.id,''revision'',c.revision,''event_id'',p_event,''kind'',p_kind,''payload_digest'',p_payload_digest);
 INSERT INTO public.uc_admission_case_requests(actor_id,request_id,case_id,organization_id,user_id,kind,payload_digest,receipt)VALUES(p_actor,p_request,c.id,c.organization_id,c.user_id,p_kind,p_payload_digest,receipt);RETURN receipt;END;$function$;

CREATE OR REPLACE FUNCTION public.uc_admission_validate_action(p_command jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''pg_catalog'', ''public''
AS $function$
DECLARE action text:=p_command->>''action'';keys text[];k text;x jsonb;BEGIN
 keys:=CASE action WHEN ''initialize''THEN ARRAY[''action'',''group_id'',''enrollment_id'',''expected_program_ref'',''expected_revision'']WHEN ''assign_responsible''THEN ARRAY[''action'',''case_id'',''expected_revision'',''expected_program_ref'',''responsible_id'',''reason'']WHEN ''review_local_rules''THEN ARRAY[''action'',''case_id'',''expected_revision'',''expected_program_ref'',''sources'',''requirements'',''review_reason'']WHEN ''review_requirement''THEN ARRAY[''action'',''case_id'',''expected_revision'',''expected_program_ref'',''requirement_id'',''expected_requirement_revision'',''applicability'',''evidence_version_ids'',''reason'',''exception'']WHEN ''review_evidence''THEN ARRAY[''action'',''case_id'',''expected_revision'',''expected_program_ref'',''requirement_id'',''expected_requirement_revision'',''evidence_version_id'',''byte_sha256'',''outcome'',''reason'']WHEN ''record_decision''THEN ARRAY[''action'',''case_id'',''expected_revision'',''expected_program_ref'',''rule_set_id'',''rule_set_digest'',''requirements_digest'',''evidence_version_ids'',''outcome'',''reason'']ELSE NULL END;
 IF action=''review_requirement''AND p_command?''issuance_evidence''THEN keys:=keys||ARRAY[''issuance_evidence''];IF NOT public.uc_education_admission_evidence_shape(p_command->''issuance_evidence'')THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;END IF;
 IF keys IS NULL OR NOT public.uc_admission_shape(p_command,keys)OR NOT public.uc_admission_ref_valid(p_command->''expected_program_ref'')OR jsonb_typeof(p_command->''expected_revision'')IS DISTINCT FROM ''number''OR p_command->>''expected_revision''!~''^[0-9]{1,16}$''OR(p_command->>''expected_revision'')::numeric>9007199254740991 OR(action=''initialize'')IS DISTINCT FROM(p_command->>''expected_revision''=''0'')THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;
 FOREACH k IN ARRAY keys LOOP IF k~''_id$''AND NOT public.uc_admission_uuid(p_command->k)THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;END LOOP;
 IF p_command?''reason''AND NOT public.uc_admission_text(p_command->''reason'')OR p_command?''review_reason''AND NOT public.uc_admission_text(p_command->''review_reason'')OR p_command?''expected_requirement_revision''AND(jsonb_typeof(p_command->''expected_requirement_revision'')IS DISTINCT FROM ''number''OR p_command->>''expected_requirement_revision''!~''^[1-9][0-9]{0,15}$''OR(p_command->>''expected_requirement_revision'')::numeric>9007199254740991)OR p_command?''evidence_version_ids''AND NOT public.uc_admission_ids(p_command->''evidence_version_ids'')THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;
 IF action=''review_requirement''THEN
  IF coalesce(p_command->>''applicability''IN(''unknown'',''applicable'',''not_applicable''),false)=false THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;
  x:=p_command->''exception'';IF x<>''null''::jsonb AND(NOT public.uc_admission_shape(x,ARRAY[''rule_id'',''reason'',''evidence_version_ids''])OR NOT public.uc_admission_uuid(x->''rule_id'')OR NOT public.uc_admission_text(x->''reason'')OR NOT public.uc_admission_ids(x->''evidence_version_ids'',1))THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;
 ELSIF action=''review_evidence''AND coalesce(p_command->>''outcome''IN(''accepted'',''rejected'')AND jsonb_typeof(p_command->''byte_sha256'')=''string''AND p_command->>''byte_sha256''~''^[a-f0-9]{64}$'',false)=false OR action=''record_decision''AND coalesce(p_command->>''outcome''IN(''needs_information'',''admitted'',''not_admitted'')AND jsonb_typeof(p_command->''rule_set_digest'')=''string''AND jsonb_typeof(p_command->''requirements_digest'')=''string''AND p_command->>''rule_set_digest''~''^[a-f0-9]{64}$''AND p_command->>''requirements_digest''~''^[a-f0-9]{64}$'',false)=false THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;
END;$function$;

CREATE OR REPLACE FUNCTION public.apply_student_admission_case_action(p_organization_id uuid, p_student_user_id uuid, p_request_id uuid, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public''
AS $function$
DECLARE a uuid:=auth.uid();act text:=p_command->>''action'';c public.uc_admission_cases;prior public.uc_admission_case_requests;scope jsonb;ref jsonb;reqid uuid;ctx uuid;event uuid:=gen_random_uuid();receipt jsonb;payload_digest text;source jsonb;sources jsonb:=''[]'';defs jsonb;d jsonb;q jsonb;reqs jsonb:=''[]'';review jsonb;identities jsonb;identity jsonb;new_rule uuid;digest text;reason text;eid uuid;rid uuid;rev bigint;BEGIN
 IF auth.role()IS DISTINCT FROM ''authenticated''OR a IS NULL OR p_request_id IS NULL THEN PERFORM public.uc_admission_error(''ACCESS_DENIED'');END IF;
 PERFORM public.uc_admission_validate_action(p_command);payload_digest:=public.uc_program_hash(jsonb_build_object(''organization_id'',p_organization_id,''user_id'',p_student_user_id,''command'',p_command));
 IF act=''initialize''THEN scope:=public.uc_admission_association(p_organization_id,p_student_user_id,(p_command->>''group_id'')::uuid,(p_command->>''enrollment_id'')::uuid);
 ELSE SELECT * INTO c FROM public.uc_admission_cases WHERE id=(p_command->>''case_id'')::uuid AND organization_id=p_organization_id AND user_id=p_student_user_id;scope:=public.uc_admission_scope(c.id);END IF;
 IF scope IS NULL THEN PERFORM public.uc_admission_error(''ACCESS_DENIED'');END IF;
 PERFORM public.uc_admission_lock(a,p_organization_id,p_student_user_id,(scope->>''group_id'')::uuid,(scope->>''enrollment_id'')::uuid,CASE WHEN act=''assign_responsible''THEN(p_command->>''responsible_id'')::uuid ELSE c.responsible_id END);
 PERFORM pg_advisory_xact_lock(hashtextextended(''uc_admission_request:''||a::text||'':''||p_request_id::text,0));
 IF act<>''initialize''THEN SELECT * INTO c FROM public.uc_admission_cases WHERE id=(p_command->>''case_id'')::uuid;
  IF act IN(''review_local_rules'',''review_requirement'',''review_evidence'',''record_decision'')AND c.responsible_id IS DISTINCT FROM a THEN PERFORM public.uc_admission_error(''ACCESS_DENIED'');END IF;
  IF act=''review_local_rules''AND NOT public.uc_document_action_allowed(c.organization_id,''read'',NULL,NULL)THEN PERFORM public.uc_admission_error(''ACCESS_DENIED'');END IF;
  IF act=''assign_responsible''AND NOT public.uc_admission_staff_allowed((p_command->>''responsible_id'')::uuid,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error(''ACCESS_DENIED'');END IF;
 END IF;
 SELECT * INTO prior FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id;
 IF prior.actor_id IS NOT NULL THEN IF prior.payload_digest<>payload_digest OR prior.organization_id<>p_organization_id OR prior.user_id<>p_student_user_id OR prior.kind<>act THEN PERFORM public.uc_admission_error(''REVISION_CONFLICT'');END IF;RETURN public.uc_admission_result(prior.case_id,a,prior.receipt,true);END IF;
 IF act=''initialize''THEN
  ref:=public.uc_admission_program(p_organization_id,p_student_user_id,(scope->>''group_id'')::uuid,(scope->>''enrollment_id'')::uuid);IF ref IS NULL THEN PERFORM public.uc_admission_error(''PREREQUISITE_MISSING'');END IF;
  IF ref IS DISTINCT FROM p_command->''expected_program_ref''THEN PERFORM public.uc_admission_error(''SOURCE_CHANGED'');END IF;
  IF EXISTS(SELECT 1 FROM public.uc_admission_cases WHERE organization_id=p_organization_id AND group_id=(scope->>''group_id'')::uuid AND enrollment_id=(scope->>''enrollment_id'')::uuid)THEN PERFORM public.uc_admission_error(''REVISION_CONFLICT'');END IF;
  INSERT INTO public.uc_admission_cases(organization_id,user_id,group_id,enrollment_id,course_id,program_ref,program_title,program_type,revision)SELECT p_organization_id,p_student_user_id,(scope->>''group_id'')::uuid,(scope->>''enrollment_id'')::uuid,(scope->>''course_id'')::uuid,ref,public.uc_admission_trim(v.facts->>''full_title''),v.facts->>''program_type'',1 FROM public.program_fact_versions v WHERE v.id=(ref->>''version_id'')::uuid RETURNING * INTO c;
  ctx:=public.uc_admission_context(c.id,a,''mutation'');
 ELSE
  SELECT * INTO c FROM public.uc_admission_cases WHERE id=c.id FOR UPDATE;
  IF c.revision<>(p_command->>''expected_revision'')::bigint THEN PERFORM public.uc_admission_error(''REVISION_CONFLICT'');END IF;
  IF c.revision>=9007199254740991 THEN PERFORM public.uc_admission_error(''LIMIT_REACHED'');END IF;
  IF c.program_ref IS DISTINCT FROM p_command->''expected_program_ref''OR c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error(''SOURCE_CHANGED'');END IF;
  IF act IN(''review_local_rules'',''review_requirement'',''review_evidence'',''record_decision'')AND c.responsible_id IS DISTINCT FROM a THEN PERFORM public.uc_admission_error(''ACCESS_DENIED'');END IF;
  ctx:=public.uc_admission_context(c.id,a,''mutation'');
  UPDATE public.uc_admission_cases SET revision=revision+1,updated_at=clock_timestamp()WHERE id=c.id RETURNING * INTO c;
  reason:=coalesce(p_command->>''reason'',p_command->>''review_reason'');
  IF act=''assign_responsible''THEN
   IF NOT public.uc_admission_staff_allowed((p_command->>''responsible_id'')::uuid,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error(''ACCESS_DENIED'');END IF;
   UPDATE public.uc_admission_cases SET responsible_id=(p_command->>''responsible_id'')::uuid WHERE id=c.id;
  ELSIF act=''review_local_rules''THEN
   IF NOT public.uc_document_action_allowed(c.organization_id,''read'',NULL,NULL)THEN PERFORM public.uc_admission_error(''ACCESS_DENIED'');END IF;
   IF jsonb_typeof(p_command->''sources'')IS DISTINCT FROM ''array''OR jsonb_array_length(p_command->''sources'')NOT BETWEEN 1 AND 3 OR jsonb_typeof(p_command->''requirements'')IS DISTINCT FROM ''array''OR jsonb_array_length(p_command->''requirements'')NOT BETWEEN 3 AND 50 THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;
   FOR source IN SELECT x FROM jsonb_array_elements(p_command->''sources'')x LOOP
    IF NOT public.uc_admission_shape(source,ARRAY[''document_id'',''version_id'',''review_id''])OR NOT public.uc_admission_uuid(source->''document_id'')OR NOT public.uc_admission_uuid(source->''version_id'')OR NOT public.uc_admission_uuid(source->''review_id'')THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;
    PERFORM public.uc_admission_lock_rules(jsonb_build_array(source));d:=public.uc_admission_local_source(c.organization_id,source);IF d IS NULL THEN PERFORM public.uc_admission_error(''SOURCE_CHANGED'');END IF;sources:=sources||jsonb_build_array(d);END LOOP;
   IF(SELECT count(DISTINCT x->>''document_id'')FROM jsonb_array_elements(p_command->''sources'')x)<>jsonb_array_length(sources)THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;
   defs:=p_command->''requirements'';IF(SELECT count(DISTINCT x->>''key'')FROM jsonb_array_elements(defs)x)<>jsonb_array_length(defs)OR EXISTS(SELECT 1 FROM unnest(ARRAY[''education_basis'',''application'',''contract_or_funding''])k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(defs)x WHERE x->>''kind''=k))THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;
   FOR d IN SELECT x FROM jsonb_array_elements(defs)x LOOP
    IF NOT public.uc_education_admission_definition_shape(d,c.program_type)OR coalesce(jsonb_typeof(d->''key'')=''string''AND d->>''key''~''^[a-z0-9_]{1,64}$''AND d->>''kind''IN(''education_basis'',''application'',''contract_or_funding'',''other_reviewed'')AND d->>''exception_policy''IN(''not_defined'',''local_reasoned_exception''),false)=false OR NOT public.uc_admission_text(d->''staff_label'',160)OR NOT public.uc_admission_text(d->''provision'',1000)OR NOT public.uc_admission_ids(d->''source_version_ids'',1,3)THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->''source_version_ids'')v WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sources)s WHERE s->''version_id''=v))THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(defs)def WHERE def?''issuance_condition'')AND(SELECT count(*)FROM jsonb_array_elements(defs)def WHERE def->>''kind''=''education_basis'')<>1 THEN PERFORM public.uc_admission_error(''INVALID_INPUT'');END IF;
   new_rule:=gen_random_uuid();digest:=public.uc_program_hash(jsonb_build_object(''program_ref'',c.program_ref,''source_snapshots'',sources,''definitions'',defs));identities:=coalesce(c.reviews->''identities'',''{}'');
   FOR d IN SELECT x FROM jsonb_array_elements(defs)x LOOP
    identity:=identities->(d->>''key'');reqid:=coalesce((identity->>''id'')::uuid,gen_random_uuid());rev:=coalesce((identity->>''revision'')::bigint,0)+1;
    IF rev>9007199254740991 THEN PERFORM public.uc_admission_error(''LIMIT_REACHED'');END IF;identities:=identities||jsonb_build_object(d->>''key'',jsonb_build_object(''id'',reqid,''revision'',rev));
    reqs:=reqs||jsonb_build_array(jsonb_build_object(''id'',reqid,''revision'',rev,''rule_id'',gen_random_uuid(),''rule_set_id'',new_rule,''rule_set_digest'',digest,''label'',d->''staff_label'',''applicability'',''unknown'',''review_event_id'',NULL,''evidence_version_ids'',''[]''::jsonb,''current_state'',''unknown'',''public_next_action'',''Обратитесь к ответственному сотруднику''));END LOOP;
   source:=public.uc_admission_authority(c.id,a);INSERT INTO public.uc_admission_rule_sets(id,case_id,organization_id,user_id,program_ref,digest,sources,source_snapshots,definitions,reviewer_id,authority_hash,authority_snapshot,review_reason)VALUES(new_rule,c.id,c.organization_id,c.user_id,c.program_ref,digest,p_command->''sources'',sources,defs,a,public.uc_program_hash(source),source,reason);
   UPDATE public.uc_admission_cases SET rule_set_id=new_rule,requirements=reqs,reviews=jsonb_build_object(''identities'',identities,''requirements'',''{}''::jsonb,''evidence'',''{}''::jsonb)WHERE id=c.id;
  ELSIF act IN(''review_requirement'',''review_evidence'')THEN
   SELECT x INTO q FROM jsonb_array_elements(c.requirements)x WHERE x->>''id''=p_command->>''requirement_id'';IF q IS NULL OR(q->>''revision'')::bigint<>(p_command->>''expected_requirement_revision'')::bigint THEN PERFORM public.uc_admission_error(''REVISION_CONFLICT'');END IF;
   IF NOT public.uc_admission_rules_current(c.id)THEN PERFORM public.uc_admission_error(''REVIEW_REQUIRED'');END IF;
   IF act=''review_requirement''THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_command->''evidence_version_ids'')x WHERE NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=(x#>>''{}'')::uuid AND e.case_id=c.id AND e.requirement_id=(q->>''id'')::uuid AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id)))THEN PERFORM public.uc_admission_error(''SOURCE_CHANGED'');END IF;
    IF p_command->''exception''<>''null''::jsonb THEN
     IF p_command->>''applicability''<>''applicable''OR p_command->''exception''->>''rule_id''<>q->>''rule_id''OR NOT EXISTS(SELECT 1 FROM public.uc_admission_rule_sets rs,jsonb_array_elements(rs.definitions)AS rule_definition(definition) WHERE rs.id=c.rule_set_id AND rule_definition.definition->>''exception_policy''=''local_reasoned_exception''AND c.reviews->''identities''->(rule_definition.definition->>''key'')->>''id''=q->>''id'')OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_command->''exception''->''evidence_version_ids'')x WHERE NOT p_command->''evidence_version_ids''@>jsonb_build_array(x))THEN PERFORM public.uc_admission_error(''REVIEW_REQUIRED'');END IF;END IF;
    SELECT coalesce(jsonb_agg(CASE WHEN x->>''id''=q->>''id''THEN x||jsonb_build_object(''applicability'',p_command->''applicability'',''review_event_id'',event)ELSE x END),''[]'')INTO reqs FROM jsonb_array_elements(c.requirements)x;
    PERFORM public.uc_education_admission_review_check(c.id,(q->>''id'')::uuid,p_command->''issuance_evidence'',p_command->''evidence_version_ids'');
    review:=jsonb_build_object(''actor_id'',a,''reason'',reason,''exception'',p_command->''exception'',''event_id'',event,''requirement_revision'',q->''revision'');
    IF EXISTS(SELECT 1 FROM public.uc_admission_rule_sets rs,jsonb_array_elements(rs.definitions)def WHERE rs.id=c.rule_set_id AND def?''issuance_condition''AND c.reviews->''identities''->(def->>''key'')->>''id''=q->>''id'')THEN review:=review||jsonb_build_object(''issuance_evidence'',p_command->''issuance_evidence'');END IF;
    UPDATE public.uc_admission_cases SET requirements=reqs,reviews=jsonb_set(reviews,ARRAY[''requirements'',q->>''id''],review,true)WHERE id=c.id;
   ELSE
    eid:=(p_command->>''evidence_version_id'')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=eid AND e.case_id=c.id AND e.requirement_id=(q->>''id'')::uuid AND e.byte_sha256=p_command->>''byte_sha256''AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id))OR public.uc_admission_evidence_dto(eid,a)->>''availability''<>''available''THEN PERFORM public.uc_admission_error(''SOURCE_CHANGED'');END IF;
    review:=jsonb_build_object(''actor_id'',a,''reason'',reason,''event_id'',event,''outcome'',p_command->''outcome'',''requirement_revision'',q->''revision'');UPDATE public.uc_admission_cases SET reviews=jsonb_set(reviews,ARRAY[''evidence'',eid::text],review,true)WHERE id=c.id;
   END IF;
  ELSIF act=''record_decision''THEN
   PERFORM public.uc_admission_lock_rules((SELECT rs.sources FROM public.uc_admission_rule_sets rs WHERE rs.id=c.rule_set_id));PERFORM public.uc_admission_refresh(c.id);SELECT * INTO c FROM public.uc_admission_cases WHERE id=c.id;
   IF c.rule_set_id IS DISTINCT FROM(p_command->>''rule_set_id'')::uuid OR(SELECT rs.digest FROM public.uc_admission_rule_sets rs WHERE rs.id=c.rule_set_id)IS DISTINCT FROM p_command->>''rule_set_digest''OR public.uc_admission_requirements_digest(c.id)IS DISTINCT FROM p_command->>''requirements_digest''THEN PERFORM public.uc_admission_error(''SOURCE_CHANGED'');END IF;
   IF NOT public.uc_admission_rules_current(c.id)THEN PERFORM public.uc_admission_error(''REVIEW_REQUIRED'');END IF;
   IF p_command->>''outcome''=''admitted''AND(jsonb_array_length(c.requirements)<3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.requirements)x WHERE x->>''applicability''=''unknown''OR x->>''current_state''NOT IN(''satisfied'',''exception_recorded'')))THEN PERFORM public.uc_admission_error(''REVIEW_REQUIRED'');END IF;
   SELECT coalesce(jsonb_agg(e.id ORDER BY e.id),''[]'')INTO d FROM public.uc_admission_case_evidence e WHERE e.case_id=c.id AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id);
   IF public.uc_program_hash(d)<>public.uc_program_hash((SELECT coalesce(jsonb_agg(x ORDER BY x),''[]'')FROM jsonb_array_elements(p_command->''evidence_version_ids'')x))THEN PERFORM public.uc_admission_error(''SOURCE_CHANGED'');END IF;
   UPDATE public.uc_admission_cases SET decision=jsonb_build_object(''event_id'',event,''case_revision'',revision,''outcome'',p_command->''outcome'',''recorded_at'',clock_timestamp(),''responsible_id'',a,''reason'',reason,''program_ref'',program_ref,''rule_set_id'',rule_set_id,''requirements_digest'',p_command->''requirements_digest'',''evidence_version_ids'',p_command->''evidence_version_ids'',''authority_snapshot_hash'',public.uc_program_hash(jsonb_build_array(a,public.uc_admission_scope(c.id),true)),''later_review_required'',false)WHERE id=c.id;
  END IF;
 END IF;
 PERFORM public.uc_admission_refresh(c.id);receipt:=public.uc_admission_event(c.id,a,event,act,p_request_id,payload_digest,reason);
 DELETE FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=ctx AND kind=''_context'';RETURN public.uc_admission_result(c.id,a,receipt,false);
END;$function$;

CREATE FUNCTION public.uc_education_trusted_erasure(p_user uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()=''service_role''AND auth.uid()IS NULL AND current_setting(''sintagma.account_deletion_erase_user'',true)=p_user::text AND EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=p_user),false) $fn$;
CREATE FUNCTION public.uc_education_withdraw_state(p_org uuid,p_group uuid,p_enrollment uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
DECLARE e public.enrollments;h public.uc_enrollment_withdrawal_states;ref jsonb;technical jsonb;groups jsonb;issued jsonb:=''[]'';g uuid;BEGIN
 IF NOT public.uc_education_withdraw_can(p_org,p_group,p_enrollment,false)AND NOT public.uc_education_withdraw_can(p_org,p_group,p_enrollment,true)THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 SELECT x.*INTO STRICT e FROM public.enrollments x JOIN public.courses c ON c.id=x.course_id WHERE x.id=p_enrollment AND c.organization_id=p_org;SELECT *INTO h FROM public.uc_enrollment_withdrawal_states WHERE enrollment_id=e.id AND NOT redacted;
 SELECT coalesce(jsonb_agg(m.group_id ORDER BY m.group_id),''[]'')INTO groups FROM public.student_group_memberships_effective m JOIN public.student_groups sg ON sg.id=m.group_id AND sg.organization_id=m.organization_id WHERE m.organization_id=p_org AND m.user_id=e.user_id AND sg.course_id=e.course_id;
 g:=p_group;IF g IS NULL AND jsonb_array_length(groups)=1 THEN g:=(groups->>0)::uuid;END IF;
 technical:=jsonb_build_object(''status'',e.status,''progress'',e.progress,''time_spent'',e.time_spent,''completed_at'',e.completed_at,''started_at'',e.started_at,''access_days'',e.access_days,''expires_at'',e.expires_at,''manual_credits'',(SELECT coalesce(jsonb_agg(to_jsonb(c)ORDER BY c.id),''[]'')FROM public.course_manual_credits c WHERE c.enrollment_id=e.id));
 ref:=jsonb_build_object(''organization_id'',p_org,''enrollment_id'',e.id,''user_id'',e.user_id,''course_id'',e.course_id,''group_id'',g,''revision'',coalesce(h.revision,0),''source_hash'',public.uc_program_hash(jsonb_build_object(''organization_id'',p_org,''scope_group_id'',p_group,''enrollment_id'',e.id,''user_id'',e.user_id,''course_id'',e.course_id,''groups'',groups,''revision'',coalesce(h.revision,0),''technical'',technical)));
 IF public.uc_education_issue_can(p_org,p_group,e.id,e.user_id,e.course_id,''read'')THEN SELECT coalesce(jsonb_agg(id ORDER BY id),''[]'')INTO issued FROM public.education_document_records WHERE organization_id=p_org AND enrollment_id=e.id AND document_status=''original'';END IF;
 RETURN jsonb_build_object(''ref'',ref,''state'',CASE WHEN h.enrollment_id IS NULL THEN ''active''ELSE ''withdrawn''END,''effective_date'',h.effective_date,''recorded_at'',h.recorded_at,''recorded_by'',h.recorded_by,''basis'',CASE WHEN h.enrollment_id IS NOT NULL THEN public.uc_education_issue_basis_projection(p_org,h.basis)END,
 ''technical_status'',e.status,''technical_progress'',e.progress,''technical_completed_at'',e.completed_at,''technical_time_spent'',e.time_spent,''manual_credit_retained'',EXISTS(SELECT 1 FROM public.course_manual_credits c WHERE c.enrollment_id=e.id AND c.revoked_at IS NULL),''original_record_ids'',issued,''can_withdraw'',h.enrollment_id IS NULL AND public.uc_education_withdraw_can(p_org,p_group,e.id,true));END;$fn$;
CREATE FUNCTION public.uc_education_withdraw_intent(p_org uuid,p_group uuid,p_intent jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
DECLARE x jsonb;basis jsonb:=p_intent->''basis'';items jsonb:=''[]'';state jsonb;ready boolean:=true;BEGIN
 IF NOT public.uc_admission_shape(p_intent,ARRAY[''enrollment_ids'',''effective_date'',''basis''])OR NOT public.uc_admission_ids(p_intent->''enrollment_ids'',1,100)OR NOT public.uc_copy_registry_date(p_intent->''effective_date'')OR(p_intent->>''effective_date'')::date>CURRENT_DATE OR NOT public.uc_admission_shape(basis,ARRAY[''kind'',''source'',''provision'',''reason''])OR coalesce(basis->>''kind''IN(''learner_request'',''organization_decision'',''contract_termination'',''other_reviewed''),false)=false OR NOT public.uc_admission_text(basis->''provision'',1000)OR NOT public.uc_admission_text(basis->''reason'',2000)THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 PERFORM public.uc_education_issue_source(p_org,basis->''source'',true);FOR x IN SELECT value FROM jsonb_array_elements(p_intent->''enrollment_ids'')ORDER BY value LOOP state:=public.uc_education_withdraw_state(p_org,p_group,(x#>>''{}'')::uuid);items:=items||jsonb_build_array(state);ready:=ready AND(state->>''can_withdraw'')::boolean;END LOOP;
 RETURN jsonb_build_object(''intent'',p_intent,''preview_hash'',public.uc_program_hash(jsonb_build_object(''organization_id'',p_org,''scope_group_id'',p_group,''intent'',p_intent,''refs'',(SELECT coalesce(jsonb_agg(y->''ref''ORDER BY y->''ref''->>''enrollment_id''),''[]'')FROM jsonb_array_elements(items)y))),''items'',items,''ready'',ready);END;$fn$;
CREATE FUNCTION public.uc_guard_retained_enrollment()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN IF public.uc_education_trusted_erasure(OLD.user_id)THEN RETURN NEW;END IF;
 PERFORM public.uc_education_issue_enrollment_fence(OLD.id,false);
 IF public.uc_enrollment_is_withdrawn(OLD.id)AND(to_jsonb(OLD)-''document_facts_revision'')IS DISTINCT FROM(to_jsonb(NEW)-''document_facts_revision'')THEN RAISE EXCEPTION ''retained_enrollment_is_immutable'' USING ERRCODE=''42501'';END IF;RETURN NEW;END;$fn$;
CREATE TRIGGER uc_retained_enrollment_write BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.uc_guard_retained_enrollment();
CREATE FUNCTION public.uc_guard_retained_learner_activity()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE row_data jsonb;u uuid;c uuid;enrollment uuid;old_data jsonb;new_data jsonb;BEGIN
 IF TG_OP<>''INSERT''THEN old_data:=to_jsonb(OLD);END IF;IF TG_OP<>''DELETE''THEN new_data:=to_jsonb(NEW);END IF;
 FOR row_data IN SELECT x FROM unnest(ARRAY[old_data,new_data])x WHERE x IS NOT NULL LOOP
 IF TG_TABLE_NAME=''course_manual_credits''THEN enrollment:=(row_data->>''enrollment_id'')::uuid;SELECT user_id,course_id INTO u,c FROM public.enrollments WHERE id=enrollment;
 ELSE u:=coalesce(row_data->>''user_id'',row_data->>''student_id'')::uuid;c:=(row_data->>''course_id'')::uuid;IF c IS NULL AND row_data->>''lesson_id''IS NOT NULL THEN SELECT course_id INTO c FROM public.lessons WHERE id=(row_data->>''lesson_id'')::uuid;END IF;SELECT id INTO enrollment FROM public.enrollments WHERE user_id=u AND course_id=c;END IF;
 IF enrollment IS NOT NULL AND NOT public.uc_education_trusted_erasure(u)THEN PERFORM public.uc_education_issue_enrollment_fence(enrollment,false);END IF;
 IF enrollment IS NOT NULL AND public.uc_enrollment_is_withdrawn(enrollment)AND NOT public.uc_education_trusted_erasure(u)THEN
  -- Existing homework guard still validates reviewer authority. This is only
  -- a narrow exception for a non-self reviewer changing review fields.
  IF TG_TABLE_NAME=''homework_submissions''AND TG_OP=''UPDATE''AND auth.uid()IS DISTINCT FROM u AND auth.uid()IS NOT NULL
   AND(old_data-ARRAY[''score'',''reviewer_id'',''reviewer_comment'',''status'',''reviewed_at''])=(new_data-ARRAY[''score'',''reviewer_id'',''reviewer_comment'',''status'',''reviewed_at''])THEN CONTINUE;END IF;
  RAISE EXCEPTION ''retained_enrollment_learning_denied'' USING ERRCODE=''42501'';END IF;END LOOP;
 IF TG_OP=''DELETE''THEN RETURN OLD;END IF;RETURN NEW;END;$fn$;
DO $guards$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY[''lesson_progress'',''test_attempts'',''test_attempt_sessions'',''homework_submissions'',''course_manual_credits'',''ai_tutor_sessions'',''course_access_log'']LOOP
 EXECUTE format(''CREATE TRIGGER uc_retained_activity_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_guard_retained_learner_activity()'',t);END LOOP;END;$guards$;

CREATE OR REPLACE FUNCTION public.can_access_course_as_learner(_course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''public''
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    JOIN public.profiles p
      ON p.user_id = e.user_id
     AND p.organization_id = c.organization_id
    WHERE e.user_id = auth.uid()
      AND e.course_id = _course_id
      AND e.status IN (''active'', ''completed'')
      AND NOT public.uc_enrollment_is_withdrawn(e.id)
      -- Keep the existing SINTAGMA enrollment contract: completion preserves
      -- course access even when the original access period has elapsed.
      AND (
        e.expires_at IS NULL
        OR e.expires_at > now()
        OR e.status = ''completed''
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.auto_complete_enrollment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''public''
AS $function$
BEGIN
  IF NEW.progress >= 100 AND NEW.status = ''active'' AND NOT public.uc_enrollment_is_withdrawn(NEW.id) THEN
    NEW.status := ''completed'';
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_own_course_enrollment(p_enrollment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''public''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_enrollment public.enrollments%ROWTYPE;
  v_total integer;
  v_completed integer;
  v_was_completed boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION ''authentication_required'' USING ERRCODE = ''42501'';
  END IF;

  SELECT *
  INTO v_enrollment
  FROM public.enrollments e
  WHERE e.id = p_enrollment_id
    AND e.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION ''enrollment_not_found'' USING ERRCODE = ''P0002'';
  END IF;

  IF public.uc_enrollment_is_withdrawn(v_enrollment.id) THEN RAISE EXCEPTION ''retained_enrollment_learning_denied'' USING ERRCODE=''42501'';END IF;
  v_was_completed := v_enrollment.status = ''completed'';

  -- Recover a passed test whose attempt was saved before progress failed.
  INSERT INTO public.lesson_progress (
    user_id, lesson_id, completed, completed_at
  )
  SELECT
    v_user_id, l.id, true, COALESCE(MAX(ta.completed_at), now())
  FROM public.lessons l
  JOIN public.test_attempts ta
    ON ta.lesson_id = l.id
   AND ta.user_id = v_user_id
   AND ta.max_score > 0
   AND COALESCE(ta.passed, (ta.score::numeric * 100 / ta.max_score::numeric) >= COALESCE(ta.passing_score, l.test_passing_score, 60))
  WHERE l.course_id = v_enrollment.course_id
    AND l.type = ''test''
  GROUP BY l.id
  ON CONFLICT (user_id, lesson_id)
  DO UPDATE SET
    completed = true,
    completed_at = COALESCE(public.lesson_progress.completed_at, EXCLUDED.completed_at);

  SELECT COUNT(*) INTO v_total
  FROM public.lessons l
  WHERE l.course_id = v_enrollment.course_id;

  SELECT COUNT(*) INTO v_completed
  FROM public.lesson_progress lp
  JOIN public.lessons l ON l.id = lp.lesson_id
  WHERE l.course_id = v_enrollment.course_id
    AND lp.user_id = v_user_id
    AND lp.completed = true;

  IF v_total = 0 OR v_completed < v_total THEN
    RAISE EXCEPTION ''course_incomplete:%/%'', v_completed, v_total USING ERRCODE = ''P0001'';
  END IF;

  UPDATE public.enrollments e
  SET progress = 100,
      status = ''completed'',
      completed_at = COALESCE(e.completed_at, now())
  WHERE e.id = p_enrollment_id
  RETURNING * INTO v_enrollment;

  RETURN jsonb_build_object(
    ''id'', v_enrollment.id,
    ''status'', v_enrollment.status,
    ''progress'', v_enrollment.progress,
    ''completed_at'', v_enrollment.completed_at,
    ''was_already_completed'', v_was_completed
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_enrollment_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''public''
AS $function$
DECLARE
  v_course_id uuid;
  v_user_id uuid;
  v_total int;
  v_done int;
  v_progress int;
BEGIN
  -- Определяем урок (для DELETE берём OLD)
  IF TG_OP = ''DELETE'' THEN
    SELECT course_id INTO v_course_id FROM lessons WHERE id = OLD.lesson_id;
    v_user_id := OLD.user_id;
  ELSE
    SELECT course_id INTO v_course_id FROM lessons WHERE id = NEW.lesson_id;
    v_user_id := NEW.user_id;
  END IF;

  IF v_course_id IS NULL OR v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Считаем общее количество уроков и пройденных
  SELECT COUNT(*) INTO v_total FROM lessons WHERE course_id = v_course_id;
  IF v_total = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*) INTO v_done
  FROM lesson_progress lp
  JOIN lessons l ON l.id = lp.lesson_id
  WHERE l.course_id = v_course_id
    AND lp.user_id = v_user_id
    AND lp.completed = true;

  v_progress := LEAST(100, GREATEST(0, (v_done * 100) / v_total));

  -- Обновляем enrollment, если он существует и прогресс изменился в большую сторону
  -- (не уменьшаем прогресс автоматически, чтобы не откатывать ручные правки)
  UPDATE enrollments
  SET progress = v_progress
  WHERE user_id = v_user_id
    AND course_id = v_course_id
    AND progress < v_progress
    AND NOT public.uc_enrollment_is_withdrawn(enrollments.id);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_enrollment_time(p_enrollment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''public''
AS $function$
BEGIN
  UPDATE public.enrollments e
  SET time_spent = COALESCE((
    SELECT SUM(lp.time_spent)
    FROM public.lesson_progress lp
    JOIN public.lessons l ON l.id = lp.lesson_id
    WHERE l.course_id = e.course_id AND lp.user_id = e.user_id
  ), 0)
  WHERE e.id = p_enrollment_id AND NOT public.uc_enrollment_is_withdrawn(e.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.uc_learning_access(p_org uuid, p_scope jsonb, p_write boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public''
AS $function$
DECLARE u uuid:=auth.uid();BEGIN
 IF auth.role() IS DISTINCT FROM ''authenticated'' OR NOT public.uc_learning_person(u) OR NOT public.account_deletion_access_allowed() OR NOT public.uc_learning_scope_valid(p_org,p_scope) THEN PERFORM public.uc_learning_error(''ACCESS_DENIED'');END IF;
 IF p_write AND public.uc_enrollment_is_withdrawn((p_scope->>''enrollment_id'')::uuid)THEN PERFORM public.uc_learning_error(''ACCESS_DENIED'');END IF;
 IF NOT p_write AND u=(p_scope->>''user_id'')::uuid THEN
  IF NOT coalesce(public.can_access_course_as_learner((p_scope->>''course_id'')::uuid),false) OR NOT coalesce(public._paid_20260922_course_read((p_scope->>''course_id'')::uuid,true),false) THEN PERFORM public.uc_learning_error(''ACCESS_DENIED'');END IF;
  RETURN ''learner'';
 END IF;
 IF u=(p_scope->>''user_id'')::uuid OR NOT public.uc_learning_staff(u,p_org,(p_scope->>''group_id'')::uuid,p_write) THEN PERFORM public.uc_learning_error(''ACCESS_DENIED'');END IF;
 RETURN ''staff'';
END;$function$;

CREATE OR REPLACE FUNCTION public.auto_create_education_document()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''public''
AS $function$
BEGIN
 -- Technical completion is not an attestation or an official issuance action.
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.uc_guard_enrollment_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public''
AS $function$
BEGIN
 IF public.uc_education_trusted_erasure(OLD.user_id)THEN RETURN OLD;END IF;
 RAISE EXCEPTION ''enrollment_retained_withdrawal_required'' USING ERRCODE=''42501'';
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_course_assignment(p_enrollment_id uuid, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public''
 SET lock_timeout TO ''3s''
AS $function$
BEGIN
 RAISE EXCEPTION ''enrollment_retained_withdrawal_required'' USING ERRCODE=''42501'';
END;
$function$;

CREATE FUNCTION public.uc_education_retained_learning_summary(p_org uuid,p_query jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE u uuid:=auth.uid();e public.enrollments;w public.uc_enrollment_withdrawal_states;d record;items jsonb:=''[]'';after_id uuid;last_id uuid;n integer:=0;lim integer;BEGIN
 IF NOT public.uc_learning_shape(p_query,ARRAY[''kind'',''enrollment_id'',''after_decision_id'',''limit''])OR p_query->>''kind''<>''retained_summary''OR NOT public.uc_learning_uuid(p_query->''enrollment_id'')OR NOT(p_query->''after_decision_id''=''null''::jsonb OR public.uc_learning_uuid(p_query->''after_decision_id''))OR jsonb_typeof(p_query->''limit'')IS DISTINCT FROM ''number''OR p_query->>''limit''!~''^[1-9][0-9]?$''THEN PERFORM public.uc_learning_error(''INVALID_INPUT'');END IF;lim:=(p_query->>''limit'')::integer;IF lim>50 THEN PERFORM public.uc_learning_error(''INVALID_INPUT'');END IF;after_id:=(p_query->>''after_decision_id'')::uuid;
 IF auth.role()IS DISTINCT FROM ''authenticated''OR NOT public.uc_learning_person(u)OR NOT public.account_deletion_access_allowed()THEN PERFORM public.uc_learning_error(''ACCESS_DENIED'');END IF;
 PERFORM public.uc_education_issue_fence(p_org,NULL,ARRAY[u],NULL);
 SELECT x.*INTO e FROM public.enrollments x JOIN public.courses c ON c.id=x.course_id JOIN public.profiles p ON p.user_id=x.user_id AND p.organization_id=c.organization_id WHERE x.id=(p_query->>''enrollment_id'')::uuid AND x.user_id=u AND c.organization_id=p_org;
 SELECT *INTO w FROM public.uc_enrollment_withdrawal_states WHERE enrollment_id=e.id AND user_id=u AND organization_id=p_org AND NOT redacted;
 IF e.id IS NULL OR w.enrollment_id IS NULL THEN PERFORM public.uc_learning_error(''ACCESS_DENIED'');END IF;
 -- Stored personal summary only: no live evaluation, licensed material or proof refs.
 FOR d IN SELECT a.id,a.outcome,a.learner_summary,a.recorded_at,a.supersedes_id FROM public.uc_learning_attestation_decisions a JOIN public.uc_learning_outcome_states s ON s.id=a.state_id WHERE s.organization_id=p_org AND s.enrollment_id=e.id AND s.user_id=u AND s.course_id=e.course_id AND a.organization_id=p_org AND a.user_id=u AND NOT a.redacted AND(after_id IS NULL OR a.id>after_id)ORDER BY a.id LIMIT lim+1 LOOP n:=n+1;EXIT WHEN n>lim;items:=items||jsonb_build_array(to_jsonb(d));last_id:=d.id;END LOOP;
 RETURN jsonb_build_object(''schema_version'',1,''kind'',''retained_summary'',''organization_id'',p_org,''user_id'',u,''enrollment_id'',e.id,''course_id'',e.course_id,''withdrawal'',jsonb_build_object(''effective_date'',w.effective_date,''recorded_at'',w.recorded_at),''technical'',jsonb_build_object(''status'',e.status,''progress'',e.progress,''completed_at'',e.completed_at),''decisions'',items,''next_after_decision_id'',CASE WHEN n>lim THEN last_id END);END;$fn$;

CREATE OR REPLACE FUNCTION public.read_learning_outcome(p_organization_id uuid, p_query jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public''
AS $function$
DECLARE u uuid:=auth.uid();target uuid;course uuid;enrollment uuid;after_id uuid;lim integer;sn record;rows jsonb:=''[]'';n integer:=0;last_id uuid;proof jsonb;versions jsonb;BEGIN
 IF auth.role() IS DISTINCT FROM ''authenticated'' OR NOT public.uc_learning_person(u) OR NOT public.account_deletion_access_allowed() THEN PERFORM public.uc_learning_error(''ACCESS_DENIED'');END IF;
 IF p_query->>''kind''=''retained_summary''THEN RETURN public.uc_education_retained_learning_summary(p_organization_id,p_query);
 ELSIF p_query->>''kind''=''outcome'' THEN
  IF NOT public.uc_learning_shape(p_query,ARRAY[''kind'',''scope'']) THEN PERFORM public.uc_learning_error(''INVALID_INPUT'');END IF;
  RETURN public.uc_learning_envelope(p_organization_id,p_query->''scope'');
 ELSIF p_query->>''kind''=''associations'' THEN
  IF NOT public.uc_learning_shape(p_query,ARRAY[''kind'',''user_id'',''course_id'',''enrollment_id'',''after_snapshot_id'',''limit'']) OR NOT public.uc_learning_uuid(p_query->''user_id'') OR NOT public.uc_learning_uuid(p_query->''course_id'') OR NOT public.uc_learning_uuid(p_query->''enrollment_id'') OR NOT(p_query->''after_snapshot_id''=''null''::jsonb OR public.uc_learning_uuid(p_query->''after_snapshot_id'')) OR jsonb_typeof(p_query->''limit'') IS DISTINCT FROM ''number'' OR p_query->>''limit''!~''^[1-9][0-9]?$'' THEN PERFORM public.uc_learning_error(''INVALID_INPUT'');END IF;
  lim:=(p_query->>''limit'')::integer;IF lim>50 THEN PERFORM public.uc_learning_error(''INVALID_INPUT'');END IF;
  target:=(p_query->>''user_id'')::uuid;course:=(p_query->>''course_id'')::uuid;enrollment:=(p_query->>''enrollment_id'')::uuid;after_id:=(p_query->>''after_snapshot_id'')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=enrollment AND e.user_id=target AND e.course_id=course AND c.organization_id=p_organization_id AND e.status NOT IN(''cancelled'',''revoked''))
   OR NOT(target=u AND public.can_access_course_as_learner(course) AND public._paid_20260922_course_read(course,true) OR target<>u AND(public.uc_learning_staff(u,p_organization_id,NULL,false) OR EXISTS(SELECT 1 FROM public.student_group_memberships_effective g WHERE g.user_id=target AND g.organization_id=p_organization_id AND public.uc_learning_staff(u,p_organization_id,g.group_id,false)))) THEN PERFORM public.uc_learning_error(''ACCESS_DENIED'');END IF;
  FOR sn IN SELECT s.id,public.uc_learning_scope(s.id)scope FROM public.group_program_enrollment_snapshots s
   WHERE s.organization_id=p_organization_id AND s.enrollment_id=enrollment AND s.user_id=target AND s.course_id=course AND(after_id IS NULL OR s.id>after_id)
    AND public.uc_learning_scope_valid(p_organization_id,public.uc_learning_scope(s.id)) AND(target=u OR public.uc_learning_staff(u,p_organization_id,s.group_id,false)) ORDER BY s.id LIMIT lim+1
  LOOP
   n:=n+1;EXIT WHEN n>lim;rows:=rows||jsonb_build_array(public.uc_learning_envelope(p_organization_id,sn.scope));last_id:=sn.id;
  END LOOP;
  RETURN jsonb_build_object(''schema_version'',1,''organization_id'',p_organization_id,''user_id'',target,''course_id'',course,''enrollment_id'',enrollment,''associations'',rows,''next_after_snapshot_id'',CASE WHEN n>lim THEN last_id END);
 ELSIF p_query->>''kind''=''criteria'' THEN
  IF NOT public.uc_learning_shape(p_query,ARRAY[''kind'',''course_id'',''program_version_id'']) OR NOT public.uc_learning_uuid(p_query->''course_id'') OR NOT public.uc_learning_uuid(p_query->''program_version_id'') THEN PERFORM public.uc_learning_error(''INVALID_INPUT'');END IF;
  IF NOT public.uc_learning_staff(u,p_organization_id,NULL,false) THEN PERFORM public.uc_learning_error(''ACCESS_DENIED'');END IF;
  course:=(p_query->>''course_id'')::uuid;target:=(p_query->>''program_version_id'')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=course AND organization_id=p_organization_id) THEN PERFORM public.uc_learning_error(''ACCESS_DENIED'');END IF;
  proof:=public.uc_learning_programme_proof(p_organization_id,target);
  IF(SELECT count(*) FROM public.uc_learning_criteria_versions WHERE organization_id=p_organization_id AND course_id=course AND program_version_id=target AND NOT redacted)>50 THEN PERFORM public.uc_learning_error(''LIMIT_EXCEEDED'');END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(v)-''participant_ids'' ORDER BY v.created_at DESC,v.id DESC),''[]'') INTO versions FROM public.uc_learning_criteria_versions v WHERE v.organization_id=p_organization_id AND v.course_id=course AND v.program_version_id=target AND NOT v.redacted;
  RETURN jsonb_build_object(''schema_version'',1,''organization_id'',p_organization_id,''course_id'',course,''program_version_id'',target,''programme_proof'',proof,''versions'',versions,''capabilities'',jsonb_build_object(''can_save'',public.uc_learning_staff(u,p_organization_id,NULL,true)));
 ELSIF p_query->>''kind'' IN(''options'',''decision_options'') THEN RETURN public.uc_learning_options(p_organization_id,p_query);
 ELSE PERFORM public.uc_learning_error(''INVALID_INPUT'');END IF;
END;$function$;

CREATE FUNCTION public.uc_education_issue_admission(p_org uuid,p_group uuid,p_enrollment uuid,p_program jsonb,p_program_type text)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;s jsonb;rs public.uc_admission_rule_sets;def jsonb;q jsonb;review jsonb;dto jsonb;e jsonb;refs jsonb:=''[]'';final_refs jsonb:=''[]'';final_proof jsonb;ref jsonb;req uuid;BEGIN
 SELECT *INTO c FROM public.uc_admission_cases WHERE organization_id=p_org AND group_id=p_group AND enrollment_id=p_enrollment;
 IF c.id IS NULL OR NOT public.uc_admission_staff_allowed(auth.uid(),p_org,c.user_id,p_group,p_enrollment,false)THEN RETURN jsonb_build_object(''code'',''ADMISSION_UNAVAILABLE'',''ref'',NULL);END IF;
 s:=public.uc_admission_state(c.id,auth.uid(),false);IF c.program_ref IS DISTINCT FROM p_program THEN RETURN jsonb_build_object(''code'',''ADMISSION_REVIEW_REQUIRED'',''ref'',NULL);END IF;
 IF s->''decision''IS NULL OR s->''decision''=''null''::jsonb OR s->''decision''->>''outcome''IS DISTINCT FROM ''admitted''THEN RETURN jsonb_build_object(''code'',''ADMISSION_NOT_CONFIRMED'',''ref'',NULL);END IF;
 IF s->''decision''->''later_review_required''IS DISTINCT FROM ''false''::jsonb OR NOT public.uc_admission_rules_current(c.id)THEN RETURN jsonb_build_object(''code'',''ADMISSION_REVIEW_REQUIRED'',''ref'',NULL);END IF;
 SELECT *INTO rs FROM public.uc_admission_rule_sets WHERE id=c.rule_set_id AND NOT authority_redacted;
 IF rs.id IS NULL OR(SELECT count(*)FROM jsonb_array_elements(rs.definitions)x WHERE x->>''kind''=''education_basis'')<>1 THEN RETURN jsonb_build_object(''code'',''FINAL_ISSUANCE_CONDITION_UNCONFIRMED'',''ref'',NULL);END IF;
 SELECT x INTO def FROM jsonb_array_elements(rs.definitions)x WHERE x->>''kind''=''education_basis'';req:=(c.reviews->''identities''->(def->>''key'')->>''id'')::uuid;SELECT x INTO q FROM jsonb_array_elements(s->''requirements'')x WHERE x->>''id''=req::text;review:=c.reviews->''requirements''->req::text;
 IF NOT def?''issuance_condition''OR NOT public.uc_education_admission_definition_shape(def,p_program_type)OR(p_program_type IN(''dpo_upskilling'',''dpo_retraining'')AND def->''issuance_condition''->>''kind''IS DISTINCT FROM ''primary_education_before_qualification'')THEN RETURN jsonb_build_object(''code'',''FINAL_ISSUANCE_CONDITION_UNCONFIRMED'',''ref'',NULL);END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(c.decision->''evidence_version_ids'')ORDER BY value LOOP
  dto:=public.uc_admission_evidence_dto((e#>>''{}'')::uuid,auth.uid());IF dto->>''case_id''IS DISTINCT FROM c.id::text OR dto->>''availability''IS DISTINCT FROM ''available''OR dto->>''review''IS DISTINCT FROM ''accepted''OR dto->''can_read_bytes''IS DISTINCT FROM ''true''::jsonb OR NOT public.uc_admission_uuid(dto->''review_event_id'')OR EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=(e#>>''{}'')::uuid)THEN RETURN jsonb_build_object(''code'',''ADMISSION_SOURCE_UNAVAILABLE'',''ref'',NULL);END IF;
  refs:=refs||jsonb_build_array(jsonb_build_object(''evidence_id'',dto->''id'',''requirement_id'',dto->''requirement_id'',''review_event_id'',dto->''review_event_id'',''byte_sha256'',dto->''byte_sha256'',''byte_size'',dto->''byte_size''));END LOOP;
 IF def->''issuance_condition''->>''kind''=''primary_education_before_qualification''THEN
  IF review->''issuance_evidence''IS NULL OR review->''issuance_evidence''=''null''::jsonb OR NOT public.uc_education_admission_evidence_shape(review->''issuance_evidence'')OR review->''requirement_revision''IS DISTINCT FROM q->''revision''OR NOT public.uc_admission_uuid(review->''event_id'')THEN RETURN jsonb_build_object(''code'',''PRIMARY_EDUCATION_EVIDENCE_REQUIRED'',''ref'',NULL);END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(review->''issuance_evidence''->''evidence_version_ids'')ORDER BY value LOOP SELECT x INTO dto FROM jsonb_array_elements(refs)x WHERE x->''evidence_id''=e AND x->>''requirement_id''=req::text;IF dto IS NULL THEN RETURN jsonb_build_object(''code'',''PRIMARY_EDUCATION_EVIDENCE_REQUIRED'',''ref'',NULL);END IF;final_refs:=final_refs||jsonb_build_array(dto);END LOOP;
  final_proof:=jsonb_build_object(''requirement_id'',req,''requirement_revision'',q->''revision'',''review_event_id'',review->''event_id'',''education_level'',review->''issuance_evidence''->''education_level'',''evidence_refs'',final_refs);
 END IF;
 ref:=jsonb_build_object(''case_id'',c.id,''scope'',public.uc_admission_scope(c.id),''revision'',c.revision,''decision_event_id'',c.decision->''event_id'',''decision_case_revision'',c.decision->''case_revision'',''program_ref'',c.program_ref,''rule_set_id'',c.rule_set_id,''rule_set_digest'',rs.digest,''requirements_digest'',public.uc_admission_requirements_digest(c.id),''evidence_refs'',refs,''final_education_proof'',final_proof);
 RETURN jsonb_build_object(''code'',NULL,''ref'',ref||jsonb_build_object(''source_hash'',public.uc_program_hash(ref)));END;$fn$;
CREATE FUNCTION public.uc_education_issue_block(p_code text)RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object(''code'',p_code,''label'',CASE p_code WHEN ''WITHDRAWN''THEN ''Обучение прекращено; прошлые результаты сохранены''WHEN ''ALREADY_ISSUED''THEN ''Документ уже существует; используйте его историю или дубликат''WHEN ''PRIMARY_EDUCATION_EVIDENCE_REQUIRED''THEN ''До выдачи нужен проверенный документ о завершённом СПО или ВО''WHEN ''FINAL_ISSUANCE_CONDITION_UNCONFIRMED''THEN ''Условия выдачи по основанию образования ещё не подтверждены''WHEN ''ATTESTATION_NOT_PASSED''THEN ''Нет действующего положительного решения итоговой аттестации''WHEN ''IDENTITY_DETAILS_INCOMPLETE''THEN ''Проверьте ФИО и дату рождения в личном деле''ELSE ''Нужно подтвердить текущую программу, допуск и итоговый результат''END,
 ''next_action'',CASE WHEN p_code IN(''ADMISSION_UNAVAILABLE'',''ADMISSION_NOT_CONFIRMED'',''ADMISSION_REVIEW_REQUIRED'',''ADMISSION_SOURCE_UNAVAILABLE'')THEN ''open_admission''WHEN p_code IN(''PRIMARY_EDUCATION_EVIDENCE_REQUIRED'',''FINAL_ISSUANCE_CONDITION_UNCONFIRMED'')THEN ''review_final_education''WHEN p_code=''IDENTITY_DETAILS_INCOMPLETE''THEN ''review_registration''WHEN p_code=''ALREADY_ISSUED''THEN ''open_existing_record''WHEN p_code IN(''OUTCOME_UNAVAILABLE'',''ATTESTATION_NOT_PASSED'',''ATTESTATION_REVIEW_REQUIRED'')THEN ''open_outcome''WHEN p_code IN(''PROGRAM_UNCONFIRMED'',''PROGRAM_CHANGED'')THEN ''confirm_programme''WHEN p_code=''ASSOCIATION_UNAVAILABLE''THEN ''select_exact_association''ELSE ''contact_authorized_staff''END) $fn$;
CREATE FUNCTION public.uc_education_issue_candidate(p_org uuid,p_scope_group uuid,p_enrollment uuid,p_lock boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
DECLARE e public.enrollments;g uuid;groups uuid[];program jsonb;facts jsonb;program_type text;doc_type text;existing uuid;num_existing integer;code text;outcome_scope jsonb;outcome jsonb;outcome_ref jsonb;admission jsonb;identity_ref jsonb;ref jsonb;full_name text;birth date;label text;BEGIN
 SELECT x.*INTO e FROM public.enrollments x JOIN public.courses c ON c.id=x.course_id WHERE x.id=p_enrollment AND c.organization_id=p_org;IF e.id IS NULL THEN RETURN NULL;END IF;
 SELECT array_agg(m.group_id ORDER BY m.group_id)INTO groups FROM public.student_group_memberships_effective m JOIN public.student_groups sg ON sg.id=m.group_id AND sg.organization_id=m.organization_id WHERE m.organization_id=p_org AND m.user_id=e.user_id AND sg.course_id=e.course_id AND(p_scope_group IS NULL OR m.group_id=p_scope_group);
 IF p_scope_group IS NOT NULL THEN IF NOT p_scope_group=ANY(coalesce(groups,''{}''))THEN RETURN NULL;END IF;g:=p_scope_group;ELSIF cardinality(groups)=1 THEN g:=groups[1];END IF;
 IF NOT public.uc_education_issue_can(p_org,p_scope_group,e.id,e.user_id,e.course_id,''read'')OR NOT public.uc_education_issue_can(p_org,p_scope_group,e.id,e.user_id,e.course_id,''issue'')THEN RETURN NULL;END IF;
 IF p_lock THEN PERFORM public.uc_education_issue_enrollment_fence(e.id,true);PERFORM 1 FROM public.enrollments WHERE id=e.id FOR UPDATE;PERFORM 1 FROM public.profiles WHERE user_id=e.user_id AND organization_id=p_org FOR SHARE;PERFORM 1 FROM public.student_frdo_data WHERE user_id=e.user_id AND organization_id=p_org FOR SHARE;END IF;
 SELECT nullif(btrim(p.full_name),'''')INTO full_name FROM public.profiles p WHERE p.user_id=e.user_id AND p.organization_id=p_org;SELECT d.birth_date INTO birth FROM public.student_frdo_data d WHERE d.user_id=e.user_id AND d.organization_id=p_org;label:=coalesce(full_name,''Ученик'');
 IF public.uc_enrollment_is_withdrawn(e.id)THEN code:=''WITHDRAWN'';ELSIF g IS NULL THEN code:=''ASSOCIATION_UNAVAILABLE'';END IF;
 SELECT count(*)::integer,min(id::text)::uuid INTO num_existing,existing FROM public.education_document_records WHERE organization_id=p_org AND enrollment_id=e.id AND document_status=''original'';IF num_existing>1 THEN existing:=NULL;END IF;IF code IS NULL AND num_existing>0 THEN code:=''ALREADY_ISSUED'';END IF;
 IF code IS NULL THEN program:=public.uc_admission_program(p_org,e.user_id,g,e.id);IF program IS NULL THEN code:=''PROGRAM_UNCONFIRMED'';ELSE SELECT f.facts INTO facts FROM public.program_fact_versions f WHERE f.id=(program->>''version_id'')::uuid;program_type:=facts->>''program_type'';doc_type:=CASE program_type WHEN ''dpo_upskilling''THEN ''certificate''WHEN ''dpo_retraining''THEN ''diploma''WHEN ''professional_training''THEN ''qualification''ELSE NULL END;IF doc_type IS NULL THEN code:=''UNSUPPORTED_PROGRAM_TYPE'';END IF;END IF;END IF;
 IF code IS NULL AND p_lock THEN
  PERFORM public.uc_program_issuance_source(p_org,g,e.id,e.user_id,e.course_id);
  PERFORM 1 FROM public.uc_admission_cases WHERE organization_id=p_org AND group_id=g AND enrollment_id=e.id FOR SHARE;
  PERFORM 1 FROM public.uc_admission_rule_sets WHERE case_id IN(SELECT id FROM public.uc_admission_cases WHERE organization_id=p_org AND group_id=g AND enrollment_id=e.id)FOR SHARE;
  PERFORM 1 FROM public.uc_admission_case_evidence WHERE case_id IN(SELECT id FROM public.uc_admission_cases WHERE organization_id=p_org AND group_id=g AND enrollment_id=e.id)FOR SHARE;
  PERFORM 1 FROM public.uc_learning_outcome_states WHERE program_enrollment_snapshot_id=(program->>''enrollment_snapshot_id'')::uuid FOR SHARE;
  PERFORM 1 FROM public.uc_learning_criteria_versions WHERE id IN(SELECT criteria_id FROM public.uc_learning_outcome_states WHERE program_enrollment_snapshot_id=(program->>''enrollment_snapshot_id'')::uuid)FOR SHARE;
  PERFORM 1 FROM public.uc_learning_attestation_decisions WHERE id IN(SELECT decision_id FROM public.uc_learning_outcome_states WHERE program_enrollment_snapshot_id=(program->>''enrollment_snapshot_id'')::uuid)FOR SHARE;
 END IF;
 IF code IS NULL THEN
  outcome_scope:=jsonb_build_object(''organization_id'',p_org,''group_id'',g,''user_id'',e.user_id,''course_id'',e.course_id,''enrollment_id'',e.id,''program_enrollment_snapshot_id'',program->''enrollment_snapshot_id'',''program_version_id'',program->''version_id'');
  BEGIN outcome:=public.uc_learning_envelope(p_org,outcome_scope);EXCEPTION WHEN insufficient_privilege THEN outcome:=NULL;END;
  IF outcome IS NULL THEN code:=''OUTCOME_UNAVAILABLE'';ELSIF outcome->''last_decision''IS NULL OR outcome->''last_decision''=''null''::jsonb OR outcome->''last_decision''->>''outcome''IS DISTINCT FROM ''passed''THEN code:=''ATTESTATION_NOT_PASSED'';
  ELSIF outcome->>''decision_relation''IS DISTINCT FROM ''current_inputs''OR outcome->''machine''IS NULL OR outcome->''machine''=''null''::jsonb OR outcome->''machine''->''source_fresh''IS DISTINCT FROM ''true''::jsonb OR outcome->''last_decision''->''machine_result_id''IS DISTINCT FROM outcome->''machine''->''id''THEN code:=''ATTESTATION_REVIEW_REQUIRED'';
  ELSIF outcome->''last_decision''->>''basis''=''machine''AND outcome->''machine''->>''eligibility''IS DISTINCT FROM ''eligible''THEN code:=''ATTESTATION_NOT_PASSED'';
  ELSE outcome_ref:=jsonb_build_object(''scope'',outcome_scope,''revision'',outcome->''revision'',''criteria_ref'',outcome->''criteria_ref'',''machine_result_id'',outcome->''machine''->''id'',''machine_input_hash'',outcome->''machine''->''input_hash'',''decision_id'',outcome->''last_decision''->''id'',''decision_basis'',outcome->''last_decision''->''basis'');outcome_ref:=outcome_ref||jsonb_build_object(''source_hash'',public.uc_program_hash(outcome_ref));END IF;
 END IF;
 IF code IS NULL THEN admission:=public.uc_education_issue_admission(p_org,g,e.id,program,program_type);code:=admission->>''code'';END IF;
 IF code IS NULL AND(full_name IS NULL OR birth IS NULL)THEN code:=''IDENTITY_DETAILS_INCOMPLETE'';END IF;
 IF code IS NULL THEN identity_ref:=jsonb_build_object(''user_id'',e.user_id,''registration_hash'',public.uc_program_hash(jsonb_build_object(''organization_id'',p_org,''user_id'',e.user_id,''full_name'',full_name,''birth_date'',birth)),''source'',''current_student_registration'');
 ref:=jsonb_build_object(''organization_id'',p_org,''group_id'',g,''enrollment_id'',e.id,''user_id'',e.user_id,''course_id'',e.course_id,''program_ref'',program,''outcome_ref'',outcome_ref,''admission_ref'',admission->''ref'',''identity_ref'',identity_ref,''withdrawal_revision'',0);ref:=ref||jsonb_build_object(''source_hash'',public.uc_program_hash(ref));END IF;
 RETURN jsonb_build_object(''enrollment_id'',e.id,''user_id'',e.user_id,''course_id'',e.course_id,''group_id'',g,''learner_label'',left(label,500),''technical_status'',e.status,''technical_progress'',e.progress,''withdrawal_revision'',(SELECT coalesce(max(revision),0)FROM public.uc_enrollment_withdrawal_states WHERE enrollment_id=e.id AND NOT redacted),''withdrawn'',public.uc_enrollment_is_withdrawn(e.id),''document_type'',doc_type,''existing_original_record_id'',existing,''eligibility_ref'',ref,''blockers'',CASE WHEN code IS NULL THEN ''[]''::jsonb ELSE jsonb_build_array(public.uc_education_issue_block(code))END);END;$fn$;

CREATE FUNCTION public.uc_education_issue_enrollment_fence(p_enrollment uuid,p_exclusive boolean DEFAULT false)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ok boolean;BEGIN IF p_enrollment IS NULL THEN RETURN;END IF;IF p_exclusive THEN ok:=pg_try_advisory_xact_lock(hashtextextended(''uc_education_enrollment:''||p_enrollment::text,0));ELSE ok:=pg_try_advisory_xact_lock_shared(hashtextextended(''uc_education_enrollment:''||p_enrollment::text,0));END IF;IF NOT ok THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;END;$fn$;

CREATE FUNCTION public.uc_education_issue_proof_visible(p_proof jsonb)RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a jsonb:=p_proof->''admission_ref'';c public.uc_admission_cases;e jsonb;dto jsonb;BEGIN
 IF p_proof IS NULL OR p_proof=''null''::jsonb OR NOT public.uc_education_issue_actor()THEN RETURN false;END IF;
 SELECT *INTO c FROM public.uc_admission_cases WHERE id=(a->>''case_id'')::uuid AND organization_id=(p_proof->>''organization_id'')::uuid AND user_id=(p_proof->>''user_id'')::uuid AND group_id=(p_proof->>''group_id'')::uuid AND enrollment_id=(p_proof->>''enrollment_id'')::uuid;
 IF c.id IS NULL OR NOT public.uc_admission_staff_allowed(auth.uid(),c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)OR NOT public.uc_learning_staff(auth.uid(),c.organization_id,c.group_id,false)THEN RETURN false;END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(a->''evidence_refs'')LOOP dto:=public.uc_admission_evidence_dto((e->>''evidence_id'')::uuid,auth.uid());IF dto IS NULL OR dto->>''case_id''IS DISTINCT FROM c.id::text OR dto->''can_read_bytes''IS DISTINCT FROM ''true''::jsonb OR dto->>''availability''IS DISTINCT FROM ''available''OR dto->''byte_sha256''IS DISTINCT FROM e->''byte_sha256''OR dto->''byte_size''IS DISTINCT FROM e->''byte_size''THEN RETURN false;END IF;END LOOP;
 RETURN true;END;$fn$;
CREATE FUNCTION public.uc_education_issue_handover_projection(p_org uuid,p_handover jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE out jsonb:=p_handover;BEGIN IF p_handover IS NULL OR p_handover=''null''::jsonb THEN RETURN NULL;END IF;
 IF p_handover?''evidence''THEN out:=jsonb_set(out,''{evidence}'',public.uc_education_issue_source_projection(p_org,p_handover->''evidence''));END IF;
 IF p_handover?''authorization''THEN out:=jsonb_set(out,''{authorization}'',public.uc_education_issue_source_projection(p_org,p_handover->''authorization''));END IF;RETURN out;END;$fn$;
CREATE FUNCTION public.uc_education_issue_artifact_projection(p_org uuid,p_artifact jsonb,p_legacy boolean)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN IF p_legacy OR p_artifact IS NULL OR p_artifact=''null''::jsonb THEN RETURN jsonb_build_object(''artifact'',NULL,''availability'',''legacy_unverified'');END IF;
 IF public.uc_education_issue_source(p_org,p_artifact->''source'',false)IS NULL THEN RETURN jsonb_build_object(''artifact'',NULL,''availability'',''currently_unavailable'');END IF;
 RETURN jsonb_build_object(''artifact'',p_artifact,''availability'',''available'');END;$fn$;
CREATE FUNCTION public.uc_education_issue_state_hash(p_record uuid)RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
DECLARE r public.education_document_records;s public.uc_education_issuance_states;BEGIN SELECT *INTO r FROM public.education_document_records WHERE id=p_record;IF r.id IS NULL THEN RETURN NULL;END IF;SELECT *INTO s FROM public.uc_education_issuance_states WHERE record_id=r.id;
 RETURN public.uc_program_hash(jsonb_build_object(''official'',to_jsonb(r)-''deleted_by'',''revision'',coalesce(s.revision,0),''original_record_id'',s.original_record_id,''proof'',s.proof,''artifact'',s.artifact,''frdo_facts'',s.frdo_facts,''notes'',coalesce(s.notes,r.notes,''''),''annulment'',s.annulment-''actor_id'',''latest_handover'',s.latest_handover-''recorded_by''));END;$fn$;
CREATE FUNCTION public.uc_education_issue_record(p_org uuid,p_scope_group uuid,p_record uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
DECLARE r public.education_document_records;s public.uc_education_issuance_states;caps jsonb;proof jsonb;proof_available boolean;handover jsonb;annulment jsonb;legacy boolean;BEGIN
 SELECT *INTO r FROM public.education_document_records WHERE id=p_record AND organization_id=p_org AND deleted_at IS NULL;
 IF r.id IS NULL OR(p_scope_group IS NOT NULL AND r.group_id IS NULL AND r.enrollment_id IS NULL)OR(p_scope_group IS NOT NULL AND r.group_id IS NOT NULL AND r.group_id<>p_scope_group)OR NOT public.uc_education_issue_can(p_org,coalesce(p_scope_group,r.group_id),r.enrollment_id,r.user_id,r.course_id,''read'')THEN RETURN NULL;END IF;
 SELECT *INTO s FROM public.uc_education_issuance_states WHERE record_id=r.id;IF coalesce(s.redacted,false)THEN RETURN NULL;END IF;
 legacy:=s.proof IS NULL;proof_available:=NOT legacy AND public.uc_education_issue_proof_visible(s.proof);IF proof_available THEN proof:=s.proof;END IF;
 caps:=public.uc_education_issue_caps(p_org,coalesce(p_scope_group,r.group_id),r.enrollment_id,r.user_id,r.course_id);
 caps:=caps||jsonb_build_object(''can_issue_duplicate'',NOT legacy AND r.document_status=''original''AND s.annulment IS NULL AND public.uc_education_issue_source(p_org,s.artifact->''source'',false)IS NOT NULL AND(caps->>''can_issue_duplicate'')::boolean,''can_record_handover'',s.annulment IS NULL AND(caps->>''can_record_handover'')::boolean,''can_annul'',s.annulment IS NULL AND(caps->>''can_annul'')::boolean);
 IF s.latest_handover IS NOT NULL THEN handover:=jsonb_set(s.latest_handover,''{fact}'',public.uc_education_issue_handover_projection(p_org,s.latest_handover->''fact''));END IF;
 IF s.annulment IS NOT NULL THEN annulment:=jsonb_set(s.annulment,''{basis}'',public.uc_education_issue_basis_projection(p_org,s.annulment->''basis''));END IF;
 RETURN jsonb_build_object(''official'',to_jsonb(r)-''deleted_by'',''revision'',coalesce(s.revision,0),''state_hash'',public.uc_education_issue_state_hash(r.id),''provenance'',CASE WHEN legacy THEN ''legacy_unverified''ELSE ''controlled_issuance''END,''lifecycle'',CASE WHEN s.annulment IS NULL THEN ''active''ELSE ''annulled''END,''original_record_id'',s.original_record_id,''artifact'',public.uc_education_issue_artifact_projection(p_org,s.artifact,legacy),''frdo_facts'',s.frdo_facts,''proof'',proof,''proof_availability'',CASE WHEN legacy THEN ''legacy_unverified''WHEN proof_available THEN ''captured''ELSE ''currently_unavailable''END,''notes'',coalesce(s.notes,r.notes,''''),''latest_handover'',handover,''annulment'',annulment,''capabilities'',caps);END;$fn$;
CREATE FUNCTION public.uc_education_issue_event(p_event uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
DECLARE e public.uc_education_issuance_events;payload jsonb;ok boolean;BEGIN SELECT *INTO e FROM public.uc_education_issuance_events WHERE id=p_event AND NOT redacted;IF e.id IS NULL THEN RETURN NULL;END IF;payload:=e.payload;
 IF e.kind=''issued''THEN ok:=public.uc_education_issue_proof_visible(payload->''proof'');payload:=payload||jsonb_build_object(''proof'',CASE WHEN ok THEN payload->''proof''ELSE NULL END,''proof_availability'',CASE WHEN ok THEN ''captured''ELSE ''currently_unavailable''END,''artifact'',public.uc_education_issue_artifact_projection(e.organization_id,payload->''artifact'',false));
 ELSIF e.kind=''handover_recorded''THEN payload:=jsonb_set(payload,''{handover}'',public.uc_education_issue_handover_projection(e.organization_id,payload->''handover''));
 ELSIF e.kind=''annulled''THEN payload:=jsonb_set(payload,''{basis}'',public.uc_education_issue_basis_projection(e.organization_id,payload->''basis''));
 ELSIF e.kind=''duplicate_issued''THEN payload:=jsonb_set(payload,''{basis,basis}'',public.uc_education_issue_basis_projection(e.organization_id,payload->''basis''->''basis''));END IF;
 RETURN jsonb_build_object(''id'',e.id,''record_id'',e.record_id,''revision'',e.revision,''kind'',e.kind,''recorded_at'',e.recorded_at,''actor_id'',e.actor_id,''reason'',e.reason,''previous_state_hash'',e.previous_state_hash,''state_hash'',e.state_hash,''payload'',payload);END;$fn$;

CREATE FUNCTION public.uc_education_actor_org_permission(p_actor uuid,p_org uuid,p_permission text)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(p_actor IS NOT NULL AND p_org IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)AND(public.has_role(p_actor,''admin''::public.app_role)
 OR EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.profiles p ON p.user_id=ur.user_id WHERE ur.user_id=p_actor AND ur.role=''organization''::public.app_role AND p.organization_id=p_org AND NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org))
 OR(p_permission IS NOT NULL AND EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org AND(s.expires_at IS NULL OR s.expires_at>now()))AND public.has_org_staff_permission(p_actor,p_org,p_permission))),false)$fn$;
CREATE FUNCTION public.uc_education_artifact_actor(p_actor uuid,p_org uuid,p_group uuid,p_user uuid,p_enrollment uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_custom_journal_person(p_actor)AND public.uc_platform_document_action_allowed(p_actor,''read'')AND public.uc_platform_document_action_allowed(p_actor,''write'')AND public.uc_platform_document_action_allowed(p_actor,''issue'')
 AND public.uc_education_actor_org_permission(p_actor,p_org,''documents.read'')AND public.uc_education_actor_org_permission(p_actor,p_org,''documents.write'')AND public.uc_education_actor_org_permission(p_actor,p_org,''documents.issue'')AND public.uc_education_actor_org_permission(p_actor,p_org,''journals.read'')AND public.uc_education_actor_org_permission(p_actor,p_org,''journals.write'')
 AND NOT public.has_role(p_actor,''sales_manager''::public.app_role)AND NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.organization_id=p_org AND s.user_id=p_actor AND s.role IN(''viewer'',''sales_manager''))
 AND(public.has_role(p_actor,''admin''::public.app_role)OR public.is_org_owner(p_actor,p_org)OR NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.role=''teacher'')OR EXISTS(SELECT 1 FROM public.org_staff s WHERE s.organization_id=p_org AND s.user_id=p_actor AND s.role<>''teacher''AND(s.expires_at IS NULL OR s.expires_at>now())))
 AND public.uc_admission_staff_allowed(p_actor,p_org,p_user,p_group,p_enrollment,false)AND public.uc_learning_staff(p_actor,p_org,p_group,false),false)$fn$;
CREATE FUNCTION public.uc_education_template_current(p_org uuid,p_template jsonb,p_storage jsonb)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
 SELECT coalesce(EXISTS(SELECT 1 FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id AND d.organization_id=v.organization_id JOIN public.org_document_reviews r ON r.id=(p_template->>''review_id'')::uuid AND r.document_id=d.id AND r.version_id=v.id AND r.organization_id=p_org JOIN storage.objects o ON o.id=v.storage_object_id
 WHERE v.organization_id=p_org AND v.id=(p_template->''source''->>''version_id'')::uuid AND d.id=(p_template->''source''->>''document_id'')::uuid AND d.deleted_at IS NULL AND coalesce(d.status,''active'')NOT IN(''archived'',''expired'')AND d.current_version_id=v.id AND public.uc_copy_registry_original_ref(v)=p_template->''source''AND public.uc_copy_registry_object_matches(v)AND r.state=''approved''AND r.revision=(p_template->>''review_revision'')::bigint
 AND NOT EXISTS(SELECT 1 FROM public.org_document_review_comments c WHERE c.review_id=r.id AND c.resolution_status=''accepted''AND c.position_anchor->>''kind''IN(''insert'',''delete'',''replace''))
 AND o.id=(p_storage->>''object_id'')::uuid AND o.updated_at=(p_storage->>''updated_at'')::timestamptz AND o.bucket_id=''org-documents''AND o.name=p_storage->>''path''AND v.file_size=(p_storage->>''byte_size'')::bigint AND v.file_size BETWEEN 1 AND 1048576 AND lower(split_part(v.storage_metadata->>''mimetype'','';'',1))=''text/html''
 AND p_template->''source''->>''content_hash''=p_storage->>''metadata_hash''),false)$fn$;

CREATE OR REPLACE FUNCTION public.issue_education_document_batch(p_organization_id uuid, p_group_id uuid, p_course_id uuid, p_items jsonb)
 RETURNS SETOF education_document_records
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''public''
AS $function$
DECLARE
  v_item jsonb;
  v_user_id uuid;
  v_enrollment_id uuid;
  v_doc_type text;
  v_issue_date date;
  v_year int;
  v_doc_n int;
  v_reg_n int;
  v_max_doc int;
  v_max_reg int;
  v_doc_number text;
  v_reg_number text;
  v_new_id uuid;
  v_existing_id uuid;
  v_group_course_id uuid;
  v_ids uuid[] := ''{}'';
  v_items_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION ''Auth required''; END IF;
  IF p_organization_id IS NULL THEN RAISE EXCEPTION ''organization_id is required''; END IF;
  IF p_course_id IS NULL THEN RAISE EXCEPTION ''exact course_id is required''; END IF;
  IF NOT public.uc_document_has_action(p_organization_id,''issue'') THEN
    RAISE EXCEPTION ''not authorized for this organization'';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> ''array'' THEN
    RAISE EXCEPTION ''items must be a non-empty array'';
  END IF;
  v_items_count := jsonb_array_length(p_items);
  IF v_items_count = 0 THEN RAISE EXCEPTION ''items must be a non-empty array''; END IF;
  IF v_items_count > 500 THEN RAISE EXCEPTION ''items exceed max batch size (500)''; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = p_course_id AND c.organization_id = p_organization_id) THEN
    RAISE EXCEPTION ''course % does not belong to organization'', p_course_id;
  END IF;
  IF p_group_id IS NOT NULL THEN
    SELECT g.course_id INTO v_group_course_id FROM public.student_groups g
    WHERE g.id = p_group_id AND g.organization_id = p_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION ''group % does not belong to organization'', p_group_id; END IF;
    IF v_group_course_id IS NULL OR v_group_course_id <> p_course_id THEN
      RAISE EXCEPTION ''group % is not linked to exact course %'', p_group_id, p_course_id;
    END IF;
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=p_organization_id AND c.course_id=p_course_id AND c.group_id=p_group_id)THEN RAISE EXCEPTION ''verified_issuance_context_required'' USING ERRCODE=''42501'';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_user_id := NULLIF(v_item->>''user_id'', '''')::uuid;
    v_enrollment_id := NULLIF(v_item->>''enrollment_id'', '''')::uuid;
    IF NOT public.uc_document_action_allowed(p_organization_id,''issue'',p_group_id,v_enrollment_id) THEN RAISE EXCEPTION ''Issuance scope denied'' USING ERRCODE=''42501''; END IF;
    v_doc_type := NULLIF(btrim(v_item->>''document_type''), '''');
    IF v_user_id IS NULL THEN RAISE EXCEPTION ''user_id is required for every item''; END IF;
    IF v_enrollment_id IS NULL THEN RAISE EXCEPTION ''enrollment_id is required for every item''; END IF;
    IF v_doc_type NOT IN (''certificate'', ''diploma'', ''qualification'') THEN
      RAISE EXCEPTION ''document_type must be certificate, diploma or qualification'';
    END IF;
    IF NULLIF(v_item->>''issue_date'', '''') IS NULL THEN RAISE EXCEPTION ''issue_date is required for every item''; END IF;
    v_issue_date := (v_item->>''issue_date'')::date;
    v_year := EXTRACT(YEAR FROM v_issue_date)::int;

    IF NOT EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.user_id = v_user_id AND pr.organization_id = p_organization_id
        AND (p_group_id IS NULL OR EXISTS (SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id = pr.organization_id AND m.user_id = pr.user_id AND m.group_id = p_group_id))
    ) THEN RAISE EXCEPTION ''student % is not a member of the specified organization/group'', v_user_id; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id = e.course_id
      WHERE e.id = v_enrollment_id AND e.user_id = v_user_id AND e.course_id = p_course_id
        AND c.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION ''enrollment % does not belong to student %/exact course %'', v_enrollment_id, v_user_id, p_course_id;
    END IF;

    -- One enrollment has one original education document. Re-export returns it.
    SELECT r.id INTO v_existing_id
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND r.enrollment_id = v_enrollment_id
      AND lower(btrim(r.document_status)) IN (''original'', ''оригинал'') AND r.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=p_organization_id AND c.enrollment_id=v_enrollment_id AND c.user_id=v_user_id AND c.mode=''duplicate''AND v_item->>''document_status''=''duplicate''AND c.original_record_id=r.id)
    ORDER BY r.created_at, r.id LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      IF EXISTS(SELECT 1 FROM public.education_document_program_sources ps WHERE ps.record_id=v_existing_id
       AND (ps.snapshot->>''group_id'')::uuid IS DISTINCT FROM p_group_id) THEN
       RAISE EXCEPTION ''original_document_belongs_to_other_program_association'' USING ERRCODE=''22023''; END IF;
      v_ids := array_append(v_ids, v_existing_id); CONTINUE;
    END IF;

    SELECT COALESCE(MAX((substring(r.document_number FROM ''([0-9]+)$''))::int), 0) INTO v_max_doc
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND EXTRACT(YEAR FROM r.issue_date) = v_year AND r.deleted_at IS NULL;
    INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
    VALUES (p_organization_id, ''edu_doc'', v_year, v_max_doc + 1)
    ON CONFLICT (organization_id, doc_type, year)
    DO UPDATE SET last_number = GREATEST(document_number_sequences.last_number + 1, v_max_doc + 1), updated_at = now()
    RETURNING last_number INTO v_doc_n;

    SELECT COALESCE(MAX((substring(r.reg_number FROM ''([0-9]+)$''))::int), 0) INTO v_max_reg
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND EXTRACT(YEAR FROM r.issue_date) = v_year AND r.deleted_at IS NULL;
    INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
    VALUES (p_organization_id, ''edu_reg'', v_year, v_max_reg + 1)
    ON CONFLICT (organization_id, doc_type, year)
    DO UPDATE SET last_number = GREATEST(document_number_sequences.last_number + 1, v_max_reg + 1), updated_at = now()
    RETURNING last_number INTO v_reg_n;

    v_doc_number := v_year::text || ''/'' || lpad(v_doc_n::text, GREATEST(6,length(v_doc_n::text)), ''0'');
    v_reg_number := ''ДОК-'' || v_year::text || ''/'' || lpad(v_reg_n::text, GREATEST(4,length(v_reg_n::text)), ''0'');
    INSERT INTO public.education_document_records (
      organization_id, user_id, course_id, group_id, enrollment_id,
      reg_number, document_number, document_series, document_type,
      full_name, birth_date, issue_date, specialty_name, qualification_name,
      document_status, delivery_method, education_result, notes, original_document_data
    ) VALUES (
      p_organization_id, v_user_id, p_course_id, p_group_id, v_enrollment_id,
      v_reg_number, v_doc_number, NULLIF(v_item->>''document_series'', ''''), v_doc_type,
      COALESCE(NULLIF(v_item->>''full_name'', ''''), ''''), NULLIF(v_item->>''birth_date'', '''')::date,
      v_issue_date, COALESCE(NULLIF(v_item->>''specialty_name'', ''''), ''''),
      NULLIF(v_item->>''qualification_name'', ''''), COALESCE(NULLIF(v_item->>''document_status'', ''''), ''original''),
      ''not_recorded'',
      NULLIF(v_item->>''education_result'', ''''), NULLIF(v_item->>''notes'', ''''), NULLIF(v_item->>''original_document_data'','''')
    ) RETURNING id INTO v_new_id;
    v_ids := array_append(v_ids, v_new_id);
  END LOOP;

  RETURN QUERY SELECT * FROM public.education_document_records r
  WHERE r.id = ANY(v_ids) ORDER BY array_position(v_ids, r.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.commit_org_document_version(p_document_id uuid, p_organization_id uuid, p_request_id uuid, p_expected_revision bigint, p_upload jsonb DEFAULT NULL::jsonb, p_restore_version_id uuid DEFAULT NULL::uuid, p_document jsonb DEFAULT ''{}''::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public''
AS $function$
BEGIN

DECLARE
  d public.org_documents%ROWTYPE;
  v public.org_document_versions%ROWTYPE;
  source_version public.org_document_versions%ROWTYPE;
  payload jsonb;
  meta jsonb;
  v_id uuid;
  next_number integer;
  v_path text; v_url text; v_name text; v_size bigint; v_summary text;
  actor_name text;
  v_origin text;
  v_object_id uuid;
  v_storage_metadata jsonb;
  v_actual_size bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed()
    OR NOT public.can_access_organization(p_organization_id,''documents.write'') THEN
    RAISE EXCEPTION ''Document write permission required'' USING ERRCODE=''42501'';
  END IF;
  IF p_document_id IS NULL OR p_organization_id IS NULL OR p_request_id IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision<0
    OR jsonb_typeof(p_document) IS DISTINCT FROM ''object''
    OR (p_upload IS NULL) = (p_restore_version_id IS NULL) THEN
    RAISE EXCEPTION ''Invalid version operation'' USING ERRCODE=''22023'';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_document) k
    WHERE k NOT IN (''name'',''type'',''issue_date'',''expires_at'',''responsible_person'',''status'')) THEN
    RAISE EXCEPTION ''Unsupported document field'' USING ERRCODE=''22023'';
  END IF;
  IF p_document ? ''status'' AND (p_document->>''status'') NOT IN (''active'',''archived'',''expired'') THEN
    RAISE EXCEPTION ''Invalid document status'' USING ERRCODE=''22023'';
  END IF;
  PERFORM public.uc_education_output_slot(p_document_id,p_organization_id,p_request_id,p_expected_revision,p_upload,p_restore_version_id,p_document);
  payload:=jsonb_build_object(''document_id'',p_document_id,''organization_id'',p_organization_id,
    ''expected_revision'',p_expected_revision,''upload'',p_upload,''restore_version_id'',p_restore_version_id,''document'',p_document);
  -- Serialize a request before checking replay, then serialize the document.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,610181020));
  SELECT * INTO v FROM public.org_document_versions WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v.organization_id<>p_organization_id OR v.document_id<>p_document_id OR v.request_payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION ''Request identifier already used for another operation'' USING ERRCODE=''22023'';
    END IF;
    RETURN jsonb_build_object(''document_id'',v.document_id,''revision'',v.result_revision,
      ''version_id'',v.id,''version_number'',v.version_number,''replayed'',true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_document_id::text,610181021));
  SELECT * INTO d FROM public.org_documents WHERE id=p_document_id FOR UPDATE;
  IF FOUND THEN
    IF d.organization_id<>p_organization_id THEN RAISE EXCEPTION ''Document organization mismatch'' USING ERRCODE=''42501''; END IF;
    IF d.deleted_at IS NOT NULL THEN RAISE EXCEPTION ''Document is in the recycle bin'' USING ERRCODE=''22023''; END IF;
    IF d.document_revision<>p_expected_revision THEN RAISE EXCEPTION ''Document changed; reload before replacing it'' USING ERRCODE=''40001''; END IF;
    IF p_document ? ''type'' AND p_document->>''type'' IS DISTINCT FROM d.type THEN
      RAISE EXCEPTION ''Document type cannot be changed during replacement'' USING ERRCODE=''22023'';
    END IF;
  ELSE
    IF p_expected_revision<>0 OR p_restore_version_id IS NOT NULL
      OR nullif(btrim(p_document->>''name''),'''') IS NULL OR nullif(btrim(p_document->>''type''),'''') IS NULL THEN
      RAISE EXCEPTION ''New document name and type are required'' USING ERRCODE=''22023'';
    END IF;
    -- Required catalogue rows are single-current-entry types. No destructive
    -- unique backfill: existing duplicates remain visible for manual review.
    IF p_document->>''type'' IN (''charter'',''license'',''registration'',''admission_rules'',''edu_activity_order'',
      ''attestation_rules'',''edu_relations'',''expulsion_rules'',''program_dev_rules'',''vsoko'',''elearning_rules'',
      ''practice_rules'',''qualification_issuance'',''credit_rules'',''salary_rules'',''pedagogical_council'',
      ''paid_services'',''personal_data'',''electronic_docs_rules'',''program_approval'',''schedule_approval'',
      ''commission_orders'',''doc_forms_approval'',''electronic_docs_order'',''self_examination_report'') THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text||'':''||(p_document->>''type''),610181022));
      IF EXISTS(SELECT 1 FROM public.org_documents WHERE organization_id=p_organization_id
        AND type=p_document->>''type'' AND deleted_at IS NULL) THEN
        RAISE EXCEPTION ''Document already exists; reload before replacing it'' USING ERRCODE=''40001'';
      END IF;
    END IF;
    INSERT INTO public.org_documents(id,organization_id,name,type,file_url)
      VALUES(p_document_id,p_organization_id,p_document->>''name'',p_document->>''type'',NULL) RETURNING * INTO d;
  END IF;
  meta:=jsonb_build_object(''name'',d.name,''type'',d.type,''issue_date'',d.issue_date,
    ''expires_at'',d.expires_at,''responsible_person'',d.responsible_person);
  IF p_restore_version_id IS NOT NULL THEN
    SELECT * INTO source_version FROM public.org_document_versions
      WHERE id=p_restore_version_id AND document_id=d.id AND organization_id=d.organization_id;
    IF NOT FOUND OR nullif(btrim(source_version.file_url),'''') IS NULL THEN
      RAISE EXCEPTION ''Restorable version not found'' USING ERRCODE=''22023'';
    END IF;
    v_path:=source_version.file_path;v_url:=source_version.file_url;v_name:=source_version.file_name;v_size:=source_version.file_size;
    v_object_id:=source_version.storage_object_id;v_storage_metadata:=source_version.storage_metadata;
    v_summary:=''Восстановлен файл версии №''||source_version.version_number;
    meta:=meta||coalesce(source_version.document_metadata,''{}''::jsonb);
  ELSE
    IF jsonb_typeof(p_upload) IS DISTINCT FROM ''object'' THEN RAISE EXCEPTION ''Upload details required'' USING ERRCODE=''22023''; END IF;
    v_path:=p_upload->>''file_path'';v_name:=p_upload->>''file_name'';
    v_size:=(p_upload->>''file_size'')::bigint;v_summary:=nullif(btrim(p_upload->>''change_summary''),'''');
    -- PostgREST supplies claims from the verified user JWT, not a request body.
    v_origin:=auth.jwt()->>''iss'';
    IF v_origin IS NULL OR v_origin !~ ''^https://[a-zA-Z0-9.-]+(:[0-9]+)?/auth/v1/?$'' THEN
      RAISE EXCEPTION ''Verified Storage origin unavailable'' USING ERRCODE=''22023'';
    END IF;
    v_origin:=regexp_replace(v_origin,''/auth/v1/?$'','''');
    v_url:=v_origin||''/storage/v1/object/public/org-documents/''||v_path;
    IF v_path IS NULL OR v_path !~ (''^''||p_organization_id::text||''/versions/''||p_document_id::text||''/''||p_request_id::text||''\.[a-z0-9]{1,12}$'')
      OR v_size IS NULL OR v_size<0 OR nullif(btrim(v_name),'''') IS NULL THEN
      RAISE EXCEPTION ''Invalid staged file'' USING ERRCODE=''22023'';
    END IF;
    SELECT id,metadata INTO v_object_id,v_storage_metadata FROM storage.objects
      WHERE bucket_id=''org-documents'' AND name=v_path FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION ''Staged file not found'' USING ERRCODE=''22023'';
    END IF;
    IF coalesce(v_storage_metadata->>''size'','''') !~ ''^[0-9]+$'' THEN
      RAISE EXCEPTION ''Staged file size unavailable'' USING ERRCODE=''22023'';
    END IF;
    v_actual_size:=(v_storage_metadata->>''size'')::bigint;
    IF v_size<>v_actual_size THEN RAISE EXCEPTION ''Staged file size mismatch'' USING ERRCODE=''22023''; END IF;
    v_storage_metadata:=jsonb_build_object(''size'',v_actual_size,''etag'',coalesce(v_storage_metadata->>''eTag'',v_storage_metadata->>''etag''),
      ''mimetype'',v_storage_metadata->>''mimetype'');
  END IF;
  meta:=meta||(p_document-''status'');
  IF nullif(btrim(meta->>''name''),'''') IS NULL THEN RAISE EXCEPTION ''Document name required'' USING ERRCODE=''22023''; END IF;
  IF nullif(meta->>''expires_at'','''')::date < nullif(meta->>''issue_date'','''')::date THEN
    RAISE EXCEPTION ''Expiry precedes issue date'' USING ERRCODE=''22023'';
  END IF;
  SELECT full_name INTO actor_name FROM public.profiles WHERE user_id=auth.uid() LIMIT 1;
  INSERT INTO public.org_document_write_tokens VALUES(d.id,txid_current());
  SELECT coalesce(max(version_number),0)+1 INTO next_number FROM public.org_document_versions WHERE document_id=d.id;
  IF d.current_version_id IS NULL AND nullif(btrim(d.file_url),'''') IS NOT NULL THEN
    INSERT INTO public.org_document_versions(document_id,organization_id,version_number,file_url,event_kind,change_summary,
      uploaded_by,uploaded_by_name,document_metadata)
    VALUES(d.id,d.organization_id,next_number,d.file_url,''baseline'',
      ''Снимок предыдущего файла на дату операции. Исходная дата и автор загрузки неизвестны.'',auth.uid(),actor_name,
      jsonb_build_object(''name'',d.name,''type'',d.type,''issue_date'',d.issue_date,''expires_at'',d.expires_at,''responsible_person'',d.responsible_person));
    next_number:=next_number+1;
  END IF;
  INSERT INTO public.org_document_versions(document_id,organization_id,version_number,file_url,file_path,file_name,file_size,
    change_summary,uploaded_by,uploaded_by_name,event_kind,restored_from_version_id,request_id,request_payload,result_revision,document_metadata,storage_object_id,storage_metadata)
  VALUES(d.id,d.organization_id,next_number,v_url,v_path,v_name,v_size,v_summary,auth.uid(),actor_name,
    CASE WHEN p_restore_version_id IS NULL THEN ''upload'' ELSE ''restore'' END,p_restore_version_id,p_request_id,
    payload,d.document_revision+1,meta,v_object_id,v_storage_metadata) RETURNING id INTO v_id;
  UPDATE public.org_documents SET file_url=v_url,current_version_id=v_id,document_revision=d.document_revision+1,
    name=meta->>''name'',issue_date=nullif(meta->>''issue_date'','''')::date,expires_at=nullif(meta->>''expires_at'','''')::date,
    responsible_person=nullif(btrim(meta->>''responsible_person''),''''),
    status=coalesce(p_document->>''status'',d.status,''active''),reminder_sent_at=NULL
    WHERE id=d.id;
  DELETE FROM public.org_document_write_tokens WHERE document_id=d.id AND transaction_id=txid_current();
  RETURN jsonb_build_object(''document_id'',d.id,''revision'',d.document_revision+1,
    ''version_id'',v_id,''version_number'',next_number,''replayed'',false);
END ;
EXCEPTION WHEN serialization_failure THEN RAISE EXCEPTION USING ERRCODE=''PT409'',MESSAGE=SQLERRM;
END;
$function$;

CREATE FUNCTION public.uc_education_withdraw_apply(p_org uuid,p_group uuid,p_intent jsonb,p_preview_hash text,p_refs jsonb,p_reason text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
<<withdraw_apply>>
DECLARE id uuid;e public.enrollments;preview jsonb;x jsonb;before_state jsonb;after_state jsonb;people uuid[];event_id uuid;out_states jsonb:=''[]'';events jsonb:=''[]'';enrollments jsonb:=''[]'';technical jsonb;BEGIN
 IF NOT public.uc_admission_text(to_jsonb(p_reason),2000)OR jsonb_typeof(p_refs)IS DISTINCT FROM''array''OR jsonb_array_length(p_refs)NOT BETWEEN 1 AND 100 OR p_preview_hash!~''^[a-f0-9]{64}$''THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_refs)LOOP
 IF NOT public.uc_admission_shape(x,ARRAY[''organization_id'',''enrollment_id'',''user_id'',''course_id'',''group_id'',''revision'',''source_hash''])OR NOT public.uc_admission_uuid(x->''organization_id'')OR x->>''organization_id''<>p_org::text OR NOT public.uc_admission_uuid(x->''enrollment_id'')OR NOT public.uc_admission_uuid(x->''user_id'')OR NOT public.uc_admission_uuid(x->''course_id'')OR(x->''group_id''<>''null''::jsonb AND NOT public.uc_admission_uuid(x->''group_id''))OR jsonb_typeof(x->''revision'')IS DISTINCT FROM''number''OR(x->>''revision'')::numeric NOT BETWEEN 0 AND 9007199254740991 OR coalesce(x->>''source_hash'','''')!~''^[a-f0-9]{64}$''THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;END LOOP;
 IF(SELECT count(DISTINCT value->>''enrollment_id'')FROM jsonb_array_elements(p_refs))<>jsonb_array_length(p_refs)THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 preview:=public.uc_education_withdraw_intent(p_org,p_group,p_intent);
 SELECT array_agg(DISTINCT(t->''ref''->>''user_id'')::uuid ORDER BY(t->''ref''->>''user_id'')::uuid)INTO people FROM jsonb_array_elements(preview->''items'')t;
 PERFORM public.uc_education_issue_fence(p_org,p_group,people,''withdraw'');
 FOR id IN SELECT(value->''ref''->>''enrollment_id'')::uuid FROM jsonb_array_elements(preview->''items'')ORDER BY value->''ref''->>''enrollment_id''LOOP
  PERFORM public.uc_education_issue_enrollment_fence(id,true);PERFORM 1 FROM public.enrollments e0 WHERE e0.id=withdraw_apply.id FOR UPDATE;
  PERFORM 1 FROM public.course_manual_credits c0 WHERE c0.enrollment_id=withdraw_apply.id FOR SHARE;
 END LOOP;
 PERFORM public.uc_education_issue_source_lock(p_org,p_intent->''basis''->''source'');preview:=public.uc_education_withdraw_intent(p_org,p_group,p_intent);
 IF preview->>''preview_hash''IS DISTINCT FROM p_preview_hash OR(SELECT jsonb_agg(value ORDER BY value->>''enrollment_id'')FROM jsonb_array_elements(p_refs))IS DISTINCT FROM(SELECT jsonb_agg(value->''ref''ORDER BY value->''ref''->>''enrollment_id'')FROM jsonb_array_elements(preview->''items''))THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;
 IF preview->''ready''IS DISTINCT FROM''true''::jsonb THEN PERFORM public.uc_education_issue_error(''PREREQUISITE_MISSING'');END IF;
 FOR before_state IN SELECT value FROM jsonb_array_elements(preview->''items'')ORDER BY value->''ref''->>''enrollment_id''LOOP
  id:=(before_state->''ref''->>''enrollment_id'')::uuid;IF NOT public.uc_education_withdraw_can(p_org,p_group,id,true)THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
  SELECT e0.*INTO e FROM public.enrollments e0 WHERE e0.id=withdraw_apply.id;
  technical:=jsonb_build_object(''status'',e.status,''progress'',e.progress,''time_spent'',e.time_spent,''completed_at'',e.completed_at,''started_at'',e.started_at,''expires_at'',e.expires_at,''access_days'',e.access_days,''manual_credit_hash'',public.uc_program_hash((SELECT coalesce(jsonb_agg(to_jsonb(c)ORDER BY c.id),''[]'')FROM public.course_manual_credits c WHERE c.enrollment_id=e.id)));
  INSERT INTO public.uc_enrollment_withdrawal_states(enrollment_id,organization_id,user_id,course_id,group_id,revision,effective_date,basis,technical_snapshot,recorded_by,participant_ids)VALUES(e.id,p_org,e.user_id,e.course_id,(before_state->''ref''->>''group_id'')::uuid,1,(p_intent->>''effective_date'')::date,p_intent->''basis'',technical,auth.uid(),ARRAY[e.user_id,auth.uid()]);
  after_state:=public.uc_education_withdraw_state(p_org,p_group,e.id);
  INSERT INTO public.uc_enrollment_withdrawal_events(enrollment_id,organization_id,user_id,revision,actor_id,reason,effective_date,basis,before_state,after_state,participant_ids)VALUES(e.id,p_org,e.user_id,1,auth.uid(),p_reason,(p_intent->>''effective_date'')::date,p_intent->''basis'',before_state,after_state,ARRAY[e.user_id,auth.uid()])RETURNING uc_enrollment_withdrawal_events.id INTO event_id;
  out_states:=out_states||jsonb_build_array(after_state);events:=events||jsonb_build_array(event_id);enrollments:=enrollments||jsonb_build_array(e.id);
 END LOOP;
 RETURN jsonb_build_object(''withdrawals'',out_states,''record_ids'',''[]''::jsonb,''enrollment_ids'',enrollments,''event_ids'',events);END;$fn$;

CREATE FUNCTION public.uc_education_issue_preview(p_org uuid,p_group uuid,p_intent jsonb,p_lock boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
DECLARE x jsonb;c jsonb;items jsonb:=''[]'';ready boolean:=true;BEGIN
 IF NOT public.uc_admission_shape(p_intent,ARRAY[''course_id'',''enrollment_ids'',''issue_date'',''document_series''])OR NOT public.uc_admission_uuid(p_intent->''course_id'')OR NOT public.uc_admission_ids(p_intent->''enrollment_ids'',1,100)OR NOT public.uc_copy_registry_date(p_intent->''issue_date'')OR(p_intent->>''issue_date'')::date>CURRENT_DATE OR(p_intent->''document_series''<>''null''::jsonb AND(jsonb_typeof(p_intent->''document_series'')IS DISTINCT FROM''string''OR length(p_intent->>''document_series'')>120))THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_intent->''enrollment_ids'')ORDER BY value LOOP c:=public.uc_education_issue_candidate(p_org,p_group,(x#>>''{}'')::uuid,p_lock);
 IF c IS NULL OR c->''course_id''IS DISTINCT FROM p_intent->''course_id''THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 IF NOT coalesce((public.uc_education_issue_caps(p_org,p_group,(c->>''enrollment_id'')::uuid,(c->>''user_id'')::uuid,(c->>''course_id'')::uuid)->>''can_issue'')::boolean,false)THEN c:=c||jsonb_build_object(''eligibility_ref'',NULL,''blockers'',jsonb_build_array(public.uc_education_issue_block(''ISSUANCE_AUTHORITY_REQUIRED'')));END IF;
 ready:=ready AND c->''eligibility_ref''<>''null''::jsonb;items:=items||jsonb_build_array(c);END LOOP;
 RETURN jsonb_build_object(''intent'',p_intent,''preview_hash'',public.uc_program_hash(jsonb_build_object(''organization_id'',p_org,''scope_group_id'',p_group,''intent'',p_intent,''candidates'',items)),''candidates'',items,''ready'',ready);END;$fn$;
CREATE FUNCTION public.uc_education_replacement_identity(p_record uuid,p_correct boolean)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.education_document_records;s public.uc_education_issuance_states;name text;birth date;BEGIN SELECT *INTO r FROM public.education_document_records WHERE id=p_record;SELECT *INTO s FROM public.uc_education_issuance_states WHERE record_id=p_record;
 IF p_correct THEN SELECT nullif(btrim(p.full_name),'''')INTO name FROM public.profiles p WHERE p.user_id=r.user_id AND p.organization_id=r.organization_id;SELECT d.birth_date INTO birth FROM public.student_frdo_data d WHERE d.user_id=r.user_id AND d.organization_id=r.organization_id;
 ELSE name:=r.full_name;birth:=r.birth_date;END IF;
 IF name IS NULL OR birth IS NULL THEN PERFORM public.uc_education_issue_error(''PREREQUISITE_MISSING'');END IF;
 RETURN jsonb_build_object(''user_id'',r.user_id,''full_name'',name,''birth_date'',birth,''registration_hash'',public.uc_program_hash(jsonb_build_object(''organization_id'',r.organization_id,''user_id'',r.user_id,''full_name'',name,''birth_date'',birth)),''source'',CASE WHEN p_correct THEN ''current_student_registration''ELSE ''original_issued_snapshot''END);END;$fn$;
CREATE FUNCTION public.uc_education_handover_check(p_org uuid,p_record uuid,p_handover jsonb)RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE kind text:=p_handover->>''kind'';s public.uc_education_issuance_states;BEGIN
 IF kind=''personal''THEN IF NOT public.uc_admission_shape(p_handover,ARRAY[''kind'',''occurred_at'',''recipient'',''evidence''])OR p_handover->''recipient''<>''{"kind":"learner"}''::jsonb THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 ELSIF kind=''representative''THEN IF NOT public.uc_admission_shape(p_handover,ARRAY[''kind'',''occurred_at'',''recipient'',''authorization'',''evidence''])OR NOT public.uc_admission_shape(p_handover->''recipient'',ARRAY[''kind'',''full_name''])OR p_handover->''recipient''->>''kind''<>''representative''OR NOT public.uc_admission_text(p_handover->''recipient''->''full_name'',300)THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;PERFORM public.uc_education_issue_source(p_org,p_handover->''authorization'',true);
 ELSIF kind=''postal_dispatched''THEN IF NOT public.uc_admission_shape(p_handover,ARRAY[''kind'',''occurred_at'',''carrier'',''tracking_number'',''recipient'',''evidence''])OR NOT public.uc_admission_shape(p_handover->''recipient'',ARRAY[''kind'',''postal_address''])OR p_handover->''recipient''->>''kind''<>''learner''OR NOT public.uc_admission_text(p_handover->''recipient''->''postal_address'',1000)OR NOT public.uc_admission_text(p_handover->''carrier'',200)OR NOT public.uc_admission_text(p_handover->''tracking_number'',200)THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 ELSIF kind=''postal_delivered''THEN IF NOT public.uc_admission_shape(p_handover,ARRAY[''kind'',''occurred_at'',''dispatch_event_id'',''evidence''])OR NOT public.uc_admission_uuid(p_handover->''dispatch_event_id'')THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 SELECT *INTO s FROM public.uc_education_issuance_states WHERE record_id=p_record AND NOT redacted;
 IF s.latest_handover->>''event_id''IS DISTINCT FROM p_handover->>''dispatch_event_id''OR s.latest_handover->''fact''->>''kind''IS DISTINCT FROM''postal_dispatched''THEN PERFORM public.uc_education_issue_error(''PREREQUISITE_MISSING'');END IF;
 ELSE PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 IF jsonb_typeof(p_handover->''occurred_at'')IS DISTINCT FROM''string''OR length(p_handover->>''occurred_at'')>64 OR(p_handover->>''occurred_at'')!~''^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$''OR NOT isfinite((p_handover->>''occurred_at'')::timestamptz)OR(p_handover->>''occurred_at'')::timestamptz>clock_timestamp()THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;PERFORM public.uc_education_issue_source(p_org,p_handover->''evidence'',true);END;$fn$;
CREATE FUNCTION public.uc_education_change_preview(p_org uuid,p_group uuid,p_change jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
DECLARE r jsonb;op text:=p_change->>''action'';identity jsonb;caps jsonb;BEGIN
 IF NOT public.uc_admission_uuid(p_change->''record_id'')OR NOT public.uc_admission_text(p_change->''reason'',2000)OR jsonb_typeof(p_change->''expected_revision'')IS DISTINCT FROM''number''OR coalesce(p_change->>''expected_state_hash'','''')!~''^[a-f0-9]{64}$''THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 r:=public.uc_education_issue_record(p_org,p_group,(p_change->>''record_id'')::uuid);IF r IS NULL THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;caps:=r->''capabilities'';
 IF r->''revision''IS DISTINCT FROM p_change->''expected_revision''OR r->>''state_hash''IS DISTINCT FROM p_change->>''expected_state_hash''THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;
 IF op=''correct_metadata''THEN IF NOT public.uc_admission_shape(p_change,ARRAY[''action'',''record_id'',''expected_revision'',''expected_state_hash'',''patch'',''reason''])OR NOT public.uc_admission_shape(p_change->''patch'',ARRAY[''notes''])OR jsonb_typeof(p_change->''patch''->''notes'')IS DISTINCT FROM''string''OR length(p_change->''patch''->>''notes'')>4000 THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;IF caps->''can_write_metadata''IS DISTINCT FROM''true''::jsonb THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 ELSIF op=''record_handover''THEN IF NOT public.uc_admission_shape(p_change,ARRAY[''action'',''record_id'',''expected_revision'',''expected_state_hash'',''handover'',''reason''])THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;IF caps->''can_record_handover''IS DISTINCT FROM''true''::jsonb THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;PERFORM public.uc_education_handover_check(p_org,(p_change->>''record_id'')::uuid,p_change->''handover'');
 ELSIF op=''void_handover''THEN IF NOT public.uc_admission_shape(p_change,ARRAY[''action'',''record_id'',''expected_revision'',''expected_state_hash'',''event_id'',''reason''])OR NOT public.uc_admission_uuid(p_change->''event_id'')THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;IF caps->''can_record_handover''IS DISTINCT FROM''true''::jsonb THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;IF r->''latest_handover''->>''event_id''IS DISTINCT FROM p_change->>''event_id''THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;
 ELSIF op=''annul''THEN IF NOT public.uc_admission_shape(p_change,ARRAY[''action'',''record_id'',''expected_revision'',''expected_state_hash'',''basis'',''reason''])OR NOT public.uc_admission_shape(p_change->''basis'',ARRAY[''source'',''provision'',''reason''])OR NOT public.uc_admission_text(p_change->''basis''->''provision'',1000)OR NOT public.uc_admission_text(p_change->''basis''->''reason'',2000)THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;IF caps->''can_annul''IS DISTINCT FROM''true''::jsonb THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;PERFORM public.uc_education_issue_source(p_org,p_change->''basis''->''source'',true);
 ELSIF op=''issue_duplicate''THEN IF NOT public.uc_admission_shape(p_change,ARRAY[''action'',''record_id'',''expected_revision'',''expected_state_hash'',''issue_date'',''document_series'',''basis'',''reason''])OR NOT public.uc_copy_registry_date(p_change->''issue_date'')OR(p_change->>''issue_date'')::date>CURRENT_DATE OR(p_change->''document_series''<>''null''::jsonb AND(jsonb_typeof(p_change->''document_series'')IS DISTINCT FROM''string''OR length(p_change->>''document_series'')>120))OR NOT public.uc_admission_shape(p_change->''basis'',ARRAY[''kind'',''basis''])OR p_change->''basis''->>''kind''NOT IN(''lost'',''damaged'',''correction_replacement'')OR NOT public.uc_admission_shape(p_change->''basis''->''basis'',ARRAY[''source'',''provision'',''reason''])OR NOT public.uc_admission_text(p_change->''basis''->''basis''->''provision'',1000)OR NOT public.uc_admission_text(p_change->''basis''->''basis''->''reason'',2000)THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 IF caps->''can_issue_duplicate''IS DISTINCT FROM''true''::jsonb OR r->>''proof_availability''<>''captured''THEN PERFORM public.uc_education_issue_error(''PREREQUISITE_MISSING'');END IF;PERFORM public.uc_education_issue_source(p_org,p_change->''basis''->''basis''->''source'',true);identity:=public.uc_education_replacement_identity((p_change->>''record_id'')::uuid,p_change->''basis''->>''kind''=''correction_replacement'');
 ELSE PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 RETURN jsonb_build_object(''change'',p_change,''preview_hash'',public.uc_program_hash(jsonb_build_object(''organization_id'',p_org,''scope_group_id'',p_group,''change'',p_change,''state_hash'',r->''state_hash'',''replacement_identity'',identity)),''record'',r,''ready'',true,''blockers'',''[]''::jsonb);END;$fn$;

CREATE FUNCTION public.uc_education_frdo_snapshot(p_org uuid,p_user uuid,p_facts jsonb,p_numbers jsonb,p_document_type text,p_original jsonb DEFAULT NULL,p_correct boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d public.student_frdo_data;out jsonb;missing jsonb:=''[]'';BEGIN
 IF p_original IS NOT NULL AND NOT p_correct THEN out:=p_original;
 ELSE SELECT *INTO d FROM public.student_frdo_data WHERE organization_id=p_org AND user_id=p_user;
 out:=jsonb_build_object(''schema_version'',1,''source'',''issuance_preparation_snapshot'',''last_name'',nullif(btrim(d.last_name),''''),''first_name'',nullif(btrim(d.first_name),''''),''middle_name'',nullif(btrim(d.middle_name),''''),''birth_date'',d.birth_date,''program_title'',p_facts->''full_title'',''program_type'',p_facts->''program_type'',''academic_hours'',p_facts->''academic_hours'',''qualification_name'',p_facts->''qualification'',''profession'',p_facts->''profession'',''training_start_date'',CASE WHEN p_original IS NOT NULL THEN p_original->''training_start_date''END,''training_end_date'',CASE WHEN p_original IS NOT NULL THEN p_original->''training_end_date''END);END IF;
 out:=out||jsonb_build_object(''document_type'',p_document_type,''document_series'',p_numbers->''document_series'',''document_number'',p_numbers->''document_number'',''reg_number'',p_numbers->''reg_number'',''issue_date'',p_numbers->''issue_date'');
 IF out->''last_name''=''null''::jsonb THEN missing:=missing||jsonb_build_array(''LAST_NAME'');END IF;IF out->''first_name''=''null''::jsonb THEN missing:=missing||jsonb_build_array(''FIRST_NAME'');END IF;IF out->''birth_date''=''null''::jsonb THEN missing:=missing||jsonb_build_array(''BIRTH_DATE'');END IF;IF out->''training_start_date''=''null''::jsonb THEN missing:=missing||jsonb_build_array(''TRAINING_START_DATE'');END IF;IF out->''training_end_date''=''null''::jsonb THEN missing:=missing||jsonb_build_array(''TRAINING_END_DATE'');END IF;
 RETURN out||jsonb_build_object(''missing'',missing);END;$fn$;
CREATE FUNCTION public.uc_education_render_variables(p_org uuid,p_identity jsonb,p_facts jsonb,p_numbers jsonb,p_proof jsonb,p_document_type text)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
DECLARE o public.organizations;recorded timestamptz;out jsonb;BEGIN SELECT *INTO o FROM public.organizations WHERE id=p_org;SELECT recorded_at INTO recorded FROM public.uc_learning_attestation_decisions WHERE id=(p_proof->''outcome_ref''->>''decision_id'')::uuid;
 IF o.id IS NULL OR recorded IS NULL THEN PERFORM public.uc_education_issue_error(''SOURCE_UNAVAILABLE'');END IF;
 out:=jsonb_build_object(''organization_name'',o.name,''organization_inn'',coalesce(o.inn,''''),''organization_ogrn'',coalesce(o.ogrn,''''),''organization_director_name'',coalesce(o.director_name,''''),''organization_director_position'',coalesce(o.director_position,''''),''organization_director_authority'','''',
 ''full_name'',p_identity->''full_name'',''birth_date'',to_char((p_identity->>''birth_date'')::date,''DD.MM.YYYY''),''document_type_label'',CASE p_document_type WHEN''certificate''THEN''Удостоверение''WHEN''diploma''THEN''Диплом''WHEN''qualification''THEN''Свидетельство''END,''document_series'',coalesce(p_numbers->>''document_series'',''''),''document_number'',p_numbers->''document_number'',''reg_number'',p_numbers->''reg_number'',''issue_date'',to_char((p_numbers->>''issue_date'')::date,''DD.MM.YYYY''),
 ''program_title'',p_facts->''full_title'',''program_type_label'',CASE p_facts->>''program_type''WHEN''dpo_upskilling''THEN''Повышение квалификации''WHEN''dpo_retraining''THEN''Профессиональная переподготовка''WHEN''professional_training''THEN''Профессиональное обучение''END,''academic_hours'',p_facts->>''academic_hours'',''qualification_name'',coalesce(p_facts->>''qualification'',''''),''profession'',coalesce(p_facts->>''profession'',''''),''attestation_outcome'',''Итоговая аттестация пройдена'',''attestation_recorded_date'',to_char(recorded AT TIME ZONE''UTC'',''DD.MM.YYYY''));
 IF EXISTS(SELECT 1 FROM jsonb_each_text(out)x WHERE x.value IS NULL OR length(x.value)>CASE x.key WHEN''organization_inn''THEN 20 WHEN''organization_ogrn''THEN 20 WHEN''full_name''THEN 500 WHEN''organization_director_name''THEN 500 WHEN''organization_director_position''THEN 300 WHEN''birth_date''THEN 10 WHEN''issue_date''THEN 10 WHEN''attestation_recorded_date''THEN 10 WHEN''document_type_label''THEN 100 WHEN''document_series''THEN 120 WHEN''document_number''THEN 120 WHEN''reg_number''THEN 120 WHEN''program_type_label''THEN 200 WHEN''academic_hours''THEN 40 WHEN''attestation_outcome''THEN 100 WHEN''program_title''THEN 4000 WHEN''qualification_name''THEN 4000 WHEN''profession''THEN 4000 ELSE 1000 END)THEN PERFORM public.uc_education_issue_error(''LIMIT_EXCEEDED'');END IF;
 RETURN out;END;$fn$;

CREATE FUNCTION public.uc_education_canonical_boundary()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_education_issuance_contexts;identity jsonb;BEGIN
 IF TG_OP<>''INSERT''THEN IF public.uc_education_trusted_erasure(OLD.user_id)THEN IF TG_OP=''DELETE''THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;RAISE EXCEPTION ''controlled_issuance_lifecycle_required'' USING ERRCODE=''42501'';END IF;
 SELECT *INTO c FROM public.uc_education_issuance_contexts WHERE transaction_id=txid_current()AND backend_pid=pg_backend_pid()AND actor_id=auth.uid()AND organization_id=NEW.organization_id AND enrollment_id=NEW.enrollment_id AND user_id=NEW.user_id AND course_id=NEW.course_id AND group_id=NEW.group_id;
 IF c.id IS NULL OR NOT public.uc_education_issue_actor()OR NOT public.uc_education_artifact_actor(c.actor_id,c.organization_id,c.group_id,c.user_id,c.enrollment_id)THEN RAISE EXCEPTION ''verified_issuance_context_required'' USING ERRCODE=''42501'';END IF;identity:=c.official_identity;
 IF NEW.delivery_method IS DISTINCT FROM ''not_recorded'' OR NEW.delivery_details IS NOT NULL OR NEW.document_status IS DISTINCT FROM c.mode OR NEW.document_number IS DISTINCT FROM identity->>''document_number''OR NEW.reg_number IS DISTINCT FROM identity->>''reg_number''OR NEW.document_series IS DISTINCT FROM identity->>''document_series''OR NEW.issue_date IS DISTINCT FROM(identity->>''issue_date'')::date OR NEW.document_type IS DISTINCT FROM identity->>''document_type''OR NEW.full_name IS DISTINCT FROM identity->>''full_name''OR NEW.birth_date IS DISTINCT FROM(identity->>''birth_date'')::date OR NEW.original_document_data IS DISTINCT FROM identity->>''original_document_data''THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 IF EXISTS(SELECT 1 FROM public.education_document_records r WHERE r.organization_id=NEW.organization_id AND r.deleted_at IS NULL AND(r.reg_number=NEW.reg_number OR r.document_number=NEW.document_number))THEN PERFORM public.uc_education_issue_error(''NUMBER_PLAN_STALE'');END IF;RETURN NEW;END;$fn$;
CREATE TRIGGER uc_education_issuance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.education_document_records FOR EACH ROW EXECUTE FUNCTION public.uc_education_canonical_boundary();

CREATE FUNCTION public.uc_education_saved_output_counts(p_user uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
 SELECT jsonb_build_object(''unissued'',count(*)FILTER(WHERE i.final_record_id IS NULL),''issued'',count(*)FILTER(WHERE i.final_record_id IS NOT NULL))FROM public.uc_education_issuance_preparation_items i JOIN storage.objects o ON o.bucket_id=''org-documents''AND o.name=i.organization_id::text||''/versions/''||i.output_document_id::text||''/''||i.output_request_id::text||''.pdf''WHERE i.user_id=p_user OR i.retained_subject_user_id=p_user $fn$;

CREATE OR REPLACE FUNCTION public.account_deletion_snapshot(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public'', ''storage''
AS $function$
DECLARE p public.profiles%ROWTYPE; v_org uuid; v_owner boolean:=false; v_education_outputs jsonb;v_education_unissued bigint;v_education_issued bigint;
 v_blockers jsonb:=''[]''; v_categories jsonb:=''[]''; v_files jsonb;
 v_count bigint; v_learning bigint; v_docs bigint:=0; v_shared bigint:=0; v_documentary bigint:=0;
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
   (SELECT count(*) FROM public.document_signatures WHERE (recipient_user_id=p_user_id OR sender_user_id=p_user_id) AND (signed_at IS NOT NULL OR sender_signed_at IS NOT NULL OR status=''signed''))+
   (SELECT count(*) FROM public.org_contracts WHERE (student_user_id=p_user_id OR students::text LIKE ''%''||p_user_id::text||''%'') AND (approved_at IS NOT NULL OR signed_at IS NOT NULL OR status NOT IN (''draft'',''cancelled'')))+
   (SELECT count(*) FROM public.group_documents WHERE (student_user_id=p_user_id OR variables::text LIKE ''%''||p_user_id::text||''%'' OR variables_snapshot::text LIKE ''%''||p_user_id::text||''%'') AND (file_path IS NOT NULL OR doc_status<>''draft''))
 INTO v_docs;
 IF v_docs>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(''code'',''RETENTION_POLICY_REQUIRED'',''message'',''У аккаунта есть оформленные учебные или подписанные документы организации. Для этих записей требуется отдельная проверка возможности удаления; она не заменяется подтверждением удаления аккаунта.'')); END IF;
 IF EXISTS(SELECT 1 FROM public.group_completion_decision_history WHERE user_id=p_user_id) OR EXISTS(SELECT 1 FROM public.group_completion_decisions WHERE user_id=p_user_id) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(''code'',''PROTECTED_HISTORY_REVIEW_REQUIRED'',''message'',''Есть неизменяемая история итоговых решений организации. Их автоматическое удаление сейчас не поддержано без нарушения целостности общей истории; удаление не начато.''));
 END IF;
 -- CSZ preserves accepted homework by a dedicated immutable-history trigger.
 -- Do not bypass that guard just to scrub a personal free-text attachment.
 IF EXISTS(SELECT 1 FROM public.homework_submissions WHERE student_id=p_user_id AND course_id IN (''7630559a-6caf-42e7-97f9-1cd0e4598c39'',''7e5bc4e6-0629-4186-9745-a821cbe7255a''))
 OR EXISTS(SELECT 1 FROM public.enrollments WHERE user_id=p_user_id AND course_id IN (''7630559a-6caf-42e7-97f9-1cd0e4598c39'',''7e5bc4e6-0629-4186-9745-a821cbe7255a''))
 OR EXISTS(SELECT 1 FROM public.lesson_progress lp JOIN public.lessons l ON l.id=lp.lesson_id WHERE lp.user_id=p_user_id AND l.course_id IN (''7630559a-6caf-42e7-97f9-1cd0e4598c39'',''7e5bc4e6-0629-4186-9745-a821cbe7255a'')) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(''code'',''PROTECTED_HISTORY_REVIEW_REQUIRED'',''message'',''Есть защищённые работы ЦСЗ. Их обработка требует отдельного решения; результаты обучения сейчас не изменяются.''));
 END IF;
 -- These records have other stakeholders or privileged ownership. Never let
 -- Auth FK cascades silently delete client call records, contracts or grants.
 FOR r IN SELECT * FROM (VALUES
  (''org_crm_clients'',''student_user_id''),
  (''ai_avatar_templates'',''created_by''),
  (''balance_transactions'',''performed_by''),
  (''call_logs'',''manager_user_id''),
  (''chat_groups'',''created_by''),
  (''checko_search_presets'',''created_by''),
  (''checko_search_runs'',''created_by''),
  (''commercial_proposals'',''created_by''),
  (''commercial_proposals'',''deleted_by''),
  (''companies'',''user_id''),
  (''company_documents'',''deleted_by''),
  (''company_staff'',''invited_by''),
  (''course_landing_history'',''created_by''),
  (''course_manual_credits'',''credited_by''),
  (''course_manual_credits'',''revoked_by''),
  (''course_payments'',''user_id''),
  (''course_review_grants'',''created_by''),
  (''course_review_grants'',''updated_by''),
  (''course_snapshots'',''created_by''),
  (''data_subject_requests'',''deleted_by''),
  (''data_subject_requests'',''resolved_by''),
  (''document_issuance_log'',''deleted_by''),
  (''document_signatures'',''deleted_by''),
  (''driving_audit'',''user_id''),
  (''driving_entries'',''created_by''),
  (''driving_entry_reversals'',''created_by''),
  (''driving_instructors'',''user_id''),
  (''driving_invites'',''created_by''),
  (''driving_lessons'',''created_by''),
  (''driving_memberships'',''user_id''),
  (''driving_schools'',''created_by''),
  (''driving_students'',''user_id''),
  (''education_document_records'',''deleted_by''),
  (''email_campaigns'',''created_by''),
  (''email_drip_sequences'',''created_by''),
  (''email_templates'',''created_by''),
  (''enrollment_requests'',''resolved_by''),
  (''enrollment_requests'',''user_id''),
  (''goreltech_document_operations'',''actor_id''),
  (''goreltech_enrollment_orders'',''actor_id''),
  (''group_class_journal_marks'',''updated_by''),
  (''group_completion_decisions'',''confirmed_by''),
  (''group_document_schedules'',''updated_by''),
  (''group_documents'',''created_by''),
  (''group_documents'',''student_user_id''),
  (''homework_submissions'',''reviewer_id''),
  (''incoming_documents'',''deleted_by''),
  (''labor_safety_enrollment_protocols'',''created_by''),
  (''labor_safety_enrollment_protocols'',''source_user_id''),
  (''labor_safety_enrollment_protocols'',''updated_by''),
  (''labor_safety_profiles'',''user_id''),
  (''library_documents'',''created_by''),
  (''mailing_deliverability_seeds'',''created_by''),
  (''mailing_report_links'',''created_by''),
  (''mailing_senders'',''created_by''),
  (''marketplace_course_comments'',''user_id''),
  (''marketplace_orders'',''buyer_user_id''),
  (''org_billing_documents'',''deleted_by''),
  (''org_contract_template_versions'',''created_by''),
  (''org_custom_roles'',''created_by''),
  (''org_document_share_links'',''created_by''),
  (''org_documents'',''deleted_by''),
  (''org_signatories'',''created_by''),
  (''platform_invoice_acts'',''created_by''),
  (''platform_updates'',''created_by''),
  (''proposal_presets'',''created_by''),
  (''referral_attribution_log'',''user_id''),
  (''referral_partners'',''user_id''),
  (''sales_demo_links'',''created_by''),
  (''sales_demo_sessions'',''user_id''),
  (''sales_managers'',''user_id''),
  (''sales_tasks'',''created_by''),
  (''signature_comments'',''author_user_id''),
  (''signature_comments'',''resolved_by''),
  (''signature_revisions'',''created_by''),
  (''training_plans'',''created_by''),
  (''webinar_polls'',''created_by''),
  (''webinars'',''created_by''),
  (''webinars'',''host_user_id'')
 ) x(t,c) LOOP
  EXECUTE format(''SELECT count(*) FROM public.%I WHERE %I=$1'',r.t,r.c) INTO v_count USING p_user_id;
  v_shared:=v_shared+v_count;
 END LOOP;
 v_shared:=v_shared+(SELECT count(*) FROM public.document_signatures WHERE (sender_user_id=p_user_id OR recipient_user_id=p_user_id) AND (sender_user_id IS DISTINCT FROM p_user_id OR recipient_user_id IS DISTINCT FROM p_user_id));
 v_shared:=v_shared+(SELECT count(*) FROM public.org_contracts WHERE student_user_id IS DISTINCT FROM p_user_id AND students::text LIKE ''%''||p_user_id::text||''%'');
 v_shared:=v_shared+(SELECT count(*) FROM public.group_documents WHERE student_user_id IS DISTINCT FROM p_user_id AND (variables::text LIKE ''%''||p_user_id::text||''%'' OR variables_snapshot::text LIKE ''%''||p_user_id::text||''%''));
 IF v_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(''code'',''SHARED_DATA_REVIEW_REQUIRED'',''message'',''Аккаунт связан с общими рабочими записями. Сначала нужно передать ответственность за них; данные других пользователей не удаляются.'')); END IF;
 IF EXISTS(SELECT 1 FROM storage.objects o WHERE (o.owner=p_user_id OR o.owner_id=p_user_id::text)
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_files) f WHERE f->>''bucket''=o.bucket_id AND f->>''path''=o.name)) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(''code'',''SHARED_FILES_REVIEW_REQUIRED'',''message'',''Есть загруженные аккаунтом файлы вне личных папок. Сначала нужно проверить их принадлежность организации.''));
 END IF;
 IF v_owner THEN
  -- Locking/revalidation occurs again in begin. A brand-new sole-owner
  -- organization may be removed with its default welcome course/templates.
  SELECT count(*) INTO v_org_shared FROM public.profiles WHERE organization_id=v_org AND user_id<>p_user_id;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE c.organization_id=v_org);
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.organizations WHERE id=v_org AND (balance<>0 OR is_paid OR paid_until IS NOT NULL));
  FOR r IN SELECT * FROM (VALUES
  (''org_crm_clients'',''organization_id''),
  (''org_crm_deals'',''organization_id''),
  (''org_crm_tasks'',''organization_id''),
  (''org_crm_activities'',''organization_id''),
  (''achievements'',''organization_id''),
  (''admin_generated_documents'',''sent_to_organization_id''),
  (''admin_org_messages'',''organization_id''),
  (''ai_avatar_templates'',''organization_id''),
  (''audit_logs'',''organization_id''),
  (''balance_transactions'',''organization_id''),
  (''chat_groups'',''organization_id''),
  (''checko_search_presets'',''organization_id''),
  (''commercial_proposals'',''organization_id''),
  (''companies'',''organization_id''),
  (''company_requests'',''organization_id''),
  (''consent_documents'',''organization_id''),
  (''course_landing_history'',''organization_id''),
  (''course_payments'',''organization_id''),
  (''course_reminders'',''organization_id''),
  (''course_requests'',''organization_id''),
  (''course_snapshots'',''organization_id''),
  (''data_subject_requests'',''organization_id''),
  (''document_issuance_log'',''organization_id''),
  (''document_number_sequences'',''organization_id''),
  (''document_signatures'',''organization_id''),
  (''driving_audit'',''organization_id''),
  (''driving_cars'',''organization_id''),
  (''driving_courses'',''organization_id''),
  (''driving_entries'',''organization_id''),
  (''driving_entry_reversals'',''organization_id''),
  (''driving_groups'',''organization_id''),
  (''driving_instructors'',''organization_id''),
  (''driving_invites'',''organization_id''),
  (''driving_lessons'',''organization_id''),
  (''driving_memberships'',''organization_id''),
  (''driving_operations'',''organization_id''),
  (''driving_programs'',''organization_id''),
  (''driving_schools'',''organization_id''),
  (''driving_shifts'',''organization_id''),
  (''driving_students'',''organization_id''),
  (''education_document_records'',''organization_id''),
  (''email_action_tokens'',''organization_id''),
  (''email_campaign_consent_log'',''organization_id''),
  (''email_campaigns'',''organization_id''),
  (''email_drip_subscribers'',''organization_id''),
  (''frdo_signed_documents'',''organization_id''),
  (''goreltech_document_operations'',''organization_id''),
  (''goreltech_enrollment_orders'',''organization_id''),
  (''group_class_journal_marks'',''organization_id''),
  (''group_completion_decision_history'',''organization_id''),
  (''group_completion_decisions'',''organization_id''),
  (''group_document_schedules'',''organization_id''),
  (''group_documents'',''organization_id''),
  (''homework_submissions'',''organization_id''),
  (''incoming_documents'',''organization_id''),
  (''journal_instances'',''organization_id''),
  (''kinescope_usage_cache'',''organization_id''),
  (''knowledge_bank'',''organization_id''),
  (''labor_safety_enrollment_protocols'',''organization_id''),
  (''labor_safety_groups'',''organization_id''),
  (''labor_safety_profiles'',''organization_id''),
  (''library_documents'',''organization_id''),
  (''library_folders'',''organization_id''),
  (''mailing_campaign_ledger'',''organization_id''),
  (''mailing_campaign_replies'',''organization_id''),
  (''mailing_contacts'',''organization_id''),
  (''mailing_deliverability_checks'',''organization_id''),
  (''mailing_deliverability_seeds'',''organization_id''),
  (''mailing_report_links'',''organization_id''),
  (''mailing_seed_ledger'',''organization_id''),
  (''mailing_senders'',''organization_id''),
  (''marketplace_courses'',''organization_id''),
  (''marketplace_orders'',''buyer_organization_id''),
  (''ordinary_mail_report_events'',''organization_id''),
  (''org_billing_documents'',''organization_id''),
  (''org_contract_template_versions'',''organization_id''),
  (''org_contract_templates'',''organization_id''),
  (''org_contracts'',''organization_id''),
  (''org_custom_roles'',''organization_id''),
  (''org_document_share_links'',''organization_id''),
  (''org_document_versions'',''organization_id''),
  (''org_documents'',''organization_id''),
  (''org_general_messages'',''organization_id''),
  (''org_payers'',''organization_id''),
  (''org_services'',''organization_id''),
  (''org_signatories'',''organization_id''),
  (''org_smtp_settings'',''organization_id''),
  (''org_staff'',''organization_id''),
  (''org_student_messages'',''organization_id''),
  (''organization_comments'',''organization_id''),
  (''organization_payment_settings'',''organization_id''),
  (''organization_reminders'',''organization_id''),
  (''pending_enrollments'',''organization_id''),
  (''platform_invoice_acts'',''organization_id''),
  (''program_categories'',''organization_id''),
  (''program_documents'',''organization_id''),
  (''program_folders'',''organization_id''),
  (''program_training_plans'',''organization_id''),
  (''proposal_presets'',''organization_id''),
  (''referral_attribution_log'',''organization_id''),
  (''referral_commissions'',''organization_id''),
  (''referral_registrations'',''organization_id''),
  (''registration_links'',''organization_id''),
  (''role_audit_log'',''organization_id''),
  (''sales_blacklist'',''organization_id''),
  (''sales_companies_db'',''organization_id''),
  (''sales_contracts'',''organization_id''),
  (''sales_demo_links'',''organization_id''),
  (''sales_demo_sessions'',''organization_id''),
  (''sales_lead_activities'',''organization_id''),
  (''sales_leads'',''organization_id''),
  (''sales_tasks'',''organization_id''),
  (''service_orders'',''organization_id''),
  (''skillspace_import_jobs'',''organization_id''),
  (''staff_invitations'',''organization_id''),
  (''student_deletion_log'',''organization_id''),
  (''student_group_memberships'',''organization_id''),
  (''student_groups'',''organization_id''),
  (''student_roster_removals'',''organization_id''),
  (''subscription_invoices'',''organization_id''),
  (''system_diagnostics'',''organization_id''),
  (''testimonials'',''organization_id''),
  (''training_plans'',''organization_id''),
  (''webinars'',''organization_id'')
  ) x(t,c) LOOP
   EXECUTE format(''SELECT count(*) FROM public.%I WHERE %I=$1'',r.t,r.c) INTO v_count USING v_org;
   v_org_shared:=v_org_shared+v_count;
  END LOOP;
  -- Only the audited seeded course is auto-removable in the first release.
  SELECT count(*) INTO v_courses FROM public.courses WHERE organization_id=v_org;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.courses WHERE organization_id=v_org AND system_key IS DISTINCT FROM ''welcome'');
 v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_admission_cases WHERE organization_id=v_org);
 v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_group_education_states WHERE organization_id=v_org);
 IF v_org_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(''code'',''OWNERSHIP_TRANSFER_REQUIRED'',''message'',''Организация содержит пользователей, обучение, платежи или рабочие записи. Сначала передайте управление организацией.'',''actionHref'',''/organization?tab=staff'')); END IF;
 END IF;
 -- PEP is deletable only when it is the person''s standalone agreement, not
 -- evidence attached to a document signature (the live FK is SET NULL).
 SELECT count(*) INTO v_documentary FROM public.pep_agreements pa
 WHERE pa.user_id=p_user_id AND EXISTS(SELECT 1 FROM public.document_signatures d WHERE d.pep_agreement_id=pa.id);
 -- An organization''s offer acceptance belongs to the organization lifecycle.
 -- Remove it only together with the verified unused sole-owner organization.
 SELECT v_documentary+count(*) INTO v_documentary FROM public.organization_offer_acceptances a
 WHERE a.user_id=p_user_id AND NOT (v_owner AND v_org_shared=0 AND a.organization_id=v_org);
 IF v_documentary>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(''code'',''DOCUMENTARY_RELATION_REVIEW_REQUIRED'',''message'',''Есть соглашение ПЭП, связанное с подписью документа, или акцепт оферты действующей организации. Эти общие документальные записи требуют отдельной обработки; удаление аккаунта не начато.'')); END IF;
 v_education_outputs:=public.uc_education_saved_output_counts(p_user_id);v_education_unissued:=(v_education_outputs->>''unissued'')::bigint;v_education_issued:=(v_education_outputs->>''issued'')::bigint;
 IF v_education_unissued+v_education_issued>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(''code'',''EDUCATION_ARTIFACT_RETENTION_REVIEW_REQUIRED'',''message'',''Сохранены файлы подготовки, ещё не выданные: ''||v_education_unissued||''; архивы выданных документов: ''||v_education_issued||''. Учебному центру нужно проверить черновики и основания дальнейшего хранения архива. Удаление аккаунта не начато.''));END IF;
 v_categories:=jsonb_build_array(
  jsonb_build_object(''key'',''account'',''label'',''Вход в аккаунт, пароль, профиль и личные настройки'',''count'',1,''action'',''delete''),
  jsonb_build_object(''key'',''private_files'',''label'',''Личные фотографии и загруженные документы'',''count'',jsonb_array_length(v_files),''action'',''delete''),
  jsonb_build_object(''key'',''learning_results'',''label'',''Назначения курсов, прогресс, попытки, ответы и результаты обучения'',''count'',v_learning,''action'',''delete''),
  jsonb_build_object(''key'',''institutional_documents'',''label'',''Оформленные документы'',''count'',v_docs,''action'',CASE WHEN v_docs>0 THEN ''block'' ELSE ''delete'' END));
 IF v_education_unissued+v_education_issued>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''education_artifact_outputs'',''label'',''Файлы подготовки и архив выданных документов: требуется проверка сохранения'',''count'',v_education_unissued+v_education_issued,''action'',''block''));END IF;
 IF v_documentary>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''documentary_relations'',''label'',''Соглашения ПЭП и акцепты оферт, связанные с документами или действующей организацией'',''count'',v_documentary,''action'',''block'')); END IF;
 IF v_owner THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''empty_organization'',''label'',''Неиспользованная организация и ознакомительный курс'',''count'',1,''action'',CASE WHEN v_org_shared>0 THEN ''block'' ELSE ''delete'' END)); END IF;
 SELECT count(*) INTO v_count FROM public.audit_logs WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''common_audit'',''label'',''Общие события организации: запись события сохраняется, имя и ссылка на аккаунт удаляются'',''count'',v_count,''action'',''anonymize'')); END IF;
 SELECT count(*)INTO v_count FROM public.uc_admission_cases WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''admission_cases'',''label'',''Личные дела и их индивидуальные копии'',''count'',v_count,''action'',''delete''));END IF;
 SELECT count(*)INTO v_count FROM public.uc_admission_case_events WHERE actor_id=p_user_id AND user_id<>p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''admission_review_attribution'',''label'',''Атрибуция внутренних проверок: удаляется ссылка на аккаунт и личный текст'',''count'',v_count,''action'',''anonymize''));END IF;
 v_categories:=v_categories||public.uc_group_education_deletion_preview(p_user_id);
 SELECT coalesce(sum((v->>''count'')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_learning_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''learning_outcomes'',''label'',''Результаты обучения и решения: личные строки удаляются, атрибуция обезличивается'',''count'',v_count,''action'',''delete_or_anonymize''));END IF;
 SELECT coalesce(sum((v->>''count'')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_custom_journal_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''custom_journals'',''label'',''Собственные журналы: строки выбранного лица удаляются, авторские копии обезличиваются'',''count'',v_count,''action'',''delete_or_anonymize''));END IF;
 SELECT coalesce(sum((v->>''count'')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_session_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''conducted_sessions'',''label'',''Проведённые занятия, посещение и черновики: личные сведения обезличиваются, редакции сохраняются'',''count'',v_count,''action'',''anonymize''));END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''security_record'',''label'',''Техническая запись запрета старого доступа и квитанция об удалении без имени и контактов'',''count'',1,''action'',''retain''));
 -- The snapshot is compared atomically just before the first mutation. Counts
 -- and manifest cover additions during the confirmation dialog; no PII stored.
 RETURN jsonb_build_object(''organizationId'',v_org,''emptyOrganization'',v_owner AND v_org_shared=0,''learningCount'',v_learning,
  ''categories'',v_categories,''blockers'',v_blockers,''files'',v_files,''sharedCount'',v_shared,''personalRows'',public.account_deletion_personal_row_counts(p_user_id),
  ''profileRevision'',p.updated_at,''role'',(SELECT role::text FROM public.user_roles WHERE user_id=p_user_id LIMIT 1));
END;$function$;

CREATE OR REPLACE FUNCTION public.account_deletion_files(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public'', ''storage''
AS $function$
 SELECT coalesce(jsonb_agg(jsonb_build_object(''bucket'',o.bucket_id,''path'',o.name,''objectId'',o.id,''updatedAt'',o.updated_at) ORDER BY o.bucket_id,o.name),''[]''::jsonb)
 FROM storage.objects o WHERE
  (o.bucket_id IN (''avatars'',''student-documents'',''final-test-photos'',''student-identification-media'',''admission-case-evidence'',''education-issuance-staging'') AND split_part(o.name,''/'',1)=p_user_id::text)
  OR (o.bucket_id=''student-documents'' AND o.name LIKE ''avatars/''||p_user_id::text||''.%'')
  OR (o.bucket_id=''admission-case-evidence''AND split_part(o.name,''/'',4)=''staging''AND split_part(o.name,''/'',5)=p_user_id::text)
  OR (o.bucket_id=''chat-attachments'' AND split_part(o.name,''/'',2)=p_user_id::text
    AND (EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user_id AND split_part(o.name,''/'',1)=p.organization_id::text)
      OR EXISTS(SELECT 1 FROM public.account_deletion_jobs j WHERE j.user_id=p_user_id AND j.state=''cleanup_pending'' AND split_part(o.name,''/'',1)=j.snapshot->>''organizationId'')));
$function$;

DO $bucket$BEGIN IF EXISTS(SELECT 1 FROM storage.buckets WHERE id=''education-issuance-staging'')THEN RAISE EXCEPTION ''UC019 staging bucket already exists; review actual baseline'' USING ERRCODE=''55000'';END IF;END;$bucket$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)VALUES(''education-issuance-staging'',''education-issuance-staging'',false,20971520,ARRAY[''application/pdf'']);
CREATE POLICY uc_education_staging_private_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated,anon USING(bucket_id<>''education-issuance-staging'')WITH CHECK(bucket_id<>''education-issuance-staging'');
CREATE FUNCTION public.uc_education_staging_storage_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE item public.uc_education_issuance_preparation_items;prep public.uc_education_issuance_preparations;parts text[];target uuid;meta jsonb;size_text text;BEGIN
 IF TG_OP=''DELETE''THEN IF OLD.bucket_id<>''education-issuance-staging''THEN RETURN OLD;END IF;
  IF auth.role()IS DISTINCT FROM''service_role''OR auth.uid()IS NOT NULL THEN RAISE EXCEPTION ''private_staging_service_required'' USING ERRCODE=''42501'';END IF;parts:=string_to_array(OLD.name,''/'');
  IF array_length(parts,1)<>5 OR parts[1]!~''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''THEN RAISE EXCEPTION ''private_staging_path_invalid'' USING ERRCODE=''42501'';END IF;target:=parts[1]::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=target)OR NOT EXISTS(SELECT 1 FROM public.account_deletion_jobs j WHERE j.user_id=target AND j.state=''cleanup_pending'')THEN RAISE EXCEPTION ''personal_staging_cleanup_review_required'' USING ERRCODE=''42501'';END IF;RETURN OLD;
 END IF;
 IF TG_OP=''UPDATE''THEN IF OLD.bucket_id=''education-issuance-staging''OR NEW.bucket_id=''education-issuance-staging''THEN RAISE EXCEPTION ''private_staging_object_is_immutable'' USING ERRCODE=''42501'';END IF;RETURN NEW;END IF;
 IF NEW.bucket_id<>''education-issuance-staging''THEN RETURN NEW;END IF;
 IF auth.role()IS DISTINCT FROM''service_role''OR auth.uid()IS NOT NULL OR NEW.owner IS NOT NULL OR nullif(NEW.owner_id,'''')IS NOT NULL THEN RAISE EXCEPTION ''private_staging_service_required'' USING ERRCODE=''42501'';END IF;
 meta:=NEW.user_metadata;IF NOT public.uc_admission_shape(meta,ARRAY[''preparation_id'',''item_id'',''render_input_hash'',''template_byte_sha256'',''html_sha256'',''byte_sha256'',''renderer'',''renderer_revision''])OR NOT public.uc_admission_uuid(meta->''preparation_id'')OR NOT public.uc_admission_uuid(meta->''item_id'')OR meta->>''renderer''IS DISTINCT FROM''browserless''OR meta->>''renderer_revision''IS DISTINCT FROM''uc019-v1''OR coalesce(meta->>''render_input_hash'','''')!~''^[a-f0-9]{64}$''OR coalesce(meta->>''template_byte_sha256'','''')!~''^[a-f0-9]{64}$''OR coalesce(meta->>''html_sha256'','''')!~''^[a-f0-9]{64}$''OR coalesce(meta->>''byte_sha256'','''')!~''^[a-f0-9]{64}$''THEN RAISE EXCEPTION ''private_staging_provenance_invalid'' USING ERRCODE=''42501'';END IF;
 SELECT *INTO item FROM public.uc_education_issuance_preparation_items WHERE id=(meta->>''item_id'')::uuid AND preparation_id=(meta->>''preparation_id'')::uuid AND NOT redacted;
 SELECT *INTO prep FROM public.uc_education_issuance_preparations WHERE id=item.preparation_id AND NOT redacted;
 IF item.id IS NULL OR prep.id IS NULL OR item.final_record_id IS NOT NULL OR NEW.name IS DISTINCT FROM item.user_id::text||''/''||item.organization_id::text||''/''||prep.id::text||''/''||item.id::text||''/''||item.render_input_hash||''.pdf''OR meta->>''render_input_hash''IS DISTINCT FROM item.render_input_hash OR NOT public.uc_education_artifact_actor(prep.actor_id,item.organization_id,item.group_id,item.user_id,item.enrollment_id)THEN RAISE EXCEPTION ''private_staging_context_unavailable'' USING ERRCODE=''42501'';END IF;
 PERFORM public.uc_education_issue_fence(item.organization_id,item.group_id,ARRAY[item.user_id,prep.actor_id]);
 size_text:=coalesce(NEW.metadata->>''size'',NEW.metadata->>''contentLength'');IF size_text IS NULL OR size_text!~''^[0-9]+$''OR size_text::numeric NOT BETWEEN 1 AND 20971520 OR NEW.metadata->>''mimetype''IS DISTINCT FROM''application/pdf''THEN RAISE EXCEPTION ''private_staging_metadata_invalid'' USING ERRCODE=''22023'';END IF;
 -- Ordinary Storage upload permission probes run INSERT triggers with metadata
 -- contentLength/version1, then roll back. Only the real final object is attested.
 RETURN NEW;END;$fn$;
CREATE TRIGGER uc_education_staging_object_boundary BEFORE INSERT OR UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.uc_education_staging_storage_guard();

CREATE FUNCTION public.uc_education_preparation_access(p_preparation uuid,p_fresh boolean DEFAULT false,p_item uuid DEFAULT NULL)RETURNS public.uc_education_issuance_preparations LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE prep public.uc_education_issuance_preparations;i public.uc_education_issuance_preparation_items;g uuid;c jsonb;r jsonb;identity jsonb;vars jsonb;frdo jsonb;correct boolean;BEGIN
 SELECT *INTO prep FROM public.uc_education_issuance_preparations WHERE id=p_preparation AND actor_id=auth.uid()AND NOT redacted;
 IF prep.id IS NULL OR NOT public.uc_education_issue_actor()THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;g:=public.uc_education_issue_scope(prep.organization_id,prep.scope);
 IF NOT coalesce((public.uc_document_registry_caps(prep.organization_id,g)->>''can_register'')::boolean,false)THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 PERFORM public.uc_education_issue_source(prep.organization_id,prep.template->''source'',true);
 FOR i IN SELECT *FROM public.uc_education_issuance_preparation_items WHERE preparation_id=prep.id AND(p_item IS NULL OR id=p_item)ORDER BY id LOOP
 IF i.redacted OR i.user_id IS NULL OR NOT public.uc_education_artifact_actor(prep.actor_id,i.organization_id,i.group_id,i.user_id,i.enrollment_id)OR NOT public.uc_education_issue_proof_visible(i.eligibility_ref)THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 PERFORM public.uc_education_issue_fence(i.organization_id,i.group_id,ARRAY[i.user_id,prep.actor_id]);
 IF i.artifact IS NOT NULL THEN PERFORM public.uc_education_issue_source(i.organization_id,i.artifact->''source'',true);END IF;
 IF p_fresh AND i.final_record_id IS NULL THEN
 IF NOT public.uc_education_template_current(prep.organization_id,prep.template,prep.template_storage)THEN PERFORM public.uc_education_issue_error(''ARTIFACT_REVIEW_REQUIRED'');END IF;
 IF public.uc_education_number_witness(prep.organization_id,(i.number_plan->>''issue_date'')::date)IS DISTINCT FROM prep.number_witness THEN PERFORM public.uc_education_issue_error(''NUMBER_PLAN_STALE'');END IF;
 correct:=prep.kind=''duplicate''AND prep.plan->''change''->''basis''->>''kind''=''correction_replacement'';
 IF prep.kind=''original''THEN c:=public.uc_education_issue_candidate(i.organization_id,g,i.enrollment_id,false);IF c IS NULL OR c->''eligibility_ref''IS DISTINCT FROM i.eligibility_ref THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 ELSE r:=public.uc_education_issue_record(i.organization_id,g,(prep.plan->''change''->>''record_id'')::uuid);IF r IS NULL OR r->''revision''IS DISTINCT FROM prep.plan->''change''->''expected_revision''OR r->>''state_hash''IS DISTINCT FROM prep.plan->''change''->>''expected_state_hash''OR r->''capabilities''->''can_issue_duplicate''IS DISTINCT FROM''true''::jsonb THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 identity:=public.uc_education_replacement_identity((prep.plan->''change''->>''record_id'')::uuid,correct);IF identity IS DISTINCT FROM i.official_identity THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;END IF;
 vars:=public.uc_education_render_variables(i.organization_id,i.official_identity,i.source_snapshot->''program_snapshot''->''facts'',i.number_plan,i.eligibility_ref,i.frdo_facts->>''document_type'');
 IF vars IS DISTINCT FROM i.render_variables THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 IF prep.kind=''original''OR correct THEN frdo:=public.uc_education_frdo_snapshot(i.organization_id,i.user_id,i.source_snapshot->''program_snapshot''->''facts'',i.number_plan,i.frdo_facts->>''document_type'',CASE WHEN correct THEN i.frdo_facts END,correct);IF frdo IS DISTINCT FROM i.frdo_facts THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;END IF;
 END IF;END LOOP;
 IF p_item IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_preparation_items x WHERE x.id=p_item AND x.preparation_id=prep.id)THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;RETURN prep;END;$fn$;
CREATE FUNCTION public.uc_education_output_approval(p_item uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object(''id'',r.id,''revision'',r.revision)FROM public.uc_education_issuance_preparation_items i JOIN public.org_document_versions v ON v.document_id=i.output_document_id AND v.request_id=i.output_request_id AND v.organization_id=i.organization_id JOIN public.org_documents d ON d.id=v.document_id AND d.current_version_id=v.id AND d.deleted_at IS NULL AND coalesce(d.status,''active'')NOT IN(''archived'',''expired'')JOIN public.org_document_reviews r ON r.document_id=d.id AND r.version_id=v.id AND r.organization_id=i.organization_id AND r.state=''approved''
 WHERE i.id=p_item AND public.uc_copy_registry_object_matches(v)AND NOT EXISTS(SELECT 1 FROM public.org_document_review_comments c WHERE c.review_id=r.id AND c.resolution_status=''accepted''AND c.position_anchor->>''kind''IN(''insert'',''delete'',''replace''))$fn$;
CREATE FUNCTION public.uc_education_preparation_item_json(p_item uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;artifact jsonb;review jsonb;state text;BEGIN SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item;SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF i.artifact IS NOT NULL THEN review:=public.uc_education_output_approval(i.id);artifact:=i.artifact||jsonb_build_object(''output_review'',review);END IF;
 state:=CASE WHEN i.final_record_id IS NOT NULL THEN''consumed''WHEN NOT public.uc_education_template_current(p.organization_id,p.template,p.template_storage)OR public.uc_education_number_witness(p.organization_id,(i.number_plan->>''issue_date'')::date)IS DISTINCT FROM p.number_witness THEN''stale''WHEN artifact IS NOT NULL AND review IS NOT NULL THEN''approved_unissued''WHEN artifact IS NOT NULL THEN''rendered_unissued''ELSE''prepared''END;
 RETURN jsonb_build_object(''id'',i.id,''enrollment_id'',i.enrollment_id,''user_id'',i.user_id,''course_id'',i.course_id,''group_id'',i.group_id,''input_revision'',i.input_revision,''status'',state,''number_plan'',i.number_plan,''render_input_hash'',i.render_input_hash,''artifact'',artifact,''final_record_id'',i.final_record_id);END;$fn$;
CREATE FUNCTION public.uc_education_preparation_json(p_preparation uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
DECLARE p public.uc_education_issuance_preparations;items jsonb;BEGIN p:=public.uc_education_preparation_access(p_preparation,false,NULL);
 SELECT jsonb_agg(public.uc_education_preparation_item_json(i.id)ORDER BY i.enrollment_id)INTO items FROM public.uc_education_issuance_preparation_items i WHERE i.preparation_id=p.id;
 RETURN jsonb_build_object(''id'',p.id,''organization_id'',p.organization_id,''scope'',p.scope,''kind'',p.kind,''created_at'',p.created_at,''created_by'',p.actor_id,''intent_hash'',p.intent_hash,''plan'',p.plan,''template'',p.template,''items'',items);END;$fn$;

CREATE FUNCTION public.prepare_education_issuance_artifacts(p_organization_id uuid,p_scope jsonb,p_request_id uuid,p_plan jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''SET lock_timeout=''2000ms'' AS $fn$
<<prepare_issuance>>
DECLARE g uuid;a uuid:=auth.uid();payload_hash text;req public.uc_education_issuance_requests;preview jsonb;selected jsonb;item jsonb;candidate jsonb;source jsonb;proof jsonb;identity jsonb;facts jsonb;frdo jsonb;vars jsonb;numbers jsonb;template jsonb;witness jsonb;date_value date;series text;people uuid[];prep_id uuid:=gen_random_uuid();item_id uuid;document_id uuid;upload_request uuid;idx integer:=0;old_record public.education_document_records;old_state public.uc_education_issuance_states;correct boolean:=false;receipt jsonb;reason text;BEGIN
 g:=public.uc_education_issue_scope(p_organization_id,p_scope);IF p_request_id IS NULL OR NOT coalesce((public.uc_education_issue_caps(p_organization_id,g)->>''can_issue'')::boolean,false)THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 IF p_plan->>''kind''=''original''THEN
 IF NOT public.uc_admission_shape(p_plan,ARRAY[''kind'',''intent'',''preview_hash'',''items'',''template'',''reason''])OR NOT public.uc_admission_text(p_plan->''reason'',2000)OR jsonb_typeof(p_plan->''items'')IS DISTINCT FROM''array''OR jsonb_array_length(p_plan->''items'')NOT BETWEEN 1 AND 100 THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 preview:=public.uc_education_issue_preview(p_organization_id,g,p_plan->''intent'',false);reason:=p_plan->>''reason'';selected:=preview->''candidates'';date_value:=(p_plan->''intent''->>''issue_date'')::date;series:=p_plan->''intent''->>''document_series'';
 FOR item IN SELECT value FROM jsonb_array_elements(p_plan->''items'')LOOP IF NOT public.uc_admission_shape(item,ARRAY[''enrollment_id'',''expected_eligibility_ref''])OR NOT public.uc_admission_uuid(item->''enrollment_id'')THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;END LOOP;
 IF(SELECT count(DISTINCT value->>''enrollment_id'')FROM jsonb_array_elements(p_plan->''items''))<>jsonb_array_length(p_plan->''items'')OR(SELECT jsonb_agg(value->''enrollment_id''ORDER BY value->>''enrollment_id'')FROM jsonb_array_elements(p_plan->''items''))IS DISTINCT FROM(SELECT jsonb_agg(value->''enrollment_id''ORDER BY value->>''enrollment_id'')FROM jsonb_array_elements(selected))THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 ELSIF p_plan->>''kind''=''duplicate''THEN
 IF NOT public.uc_admission_shape(p_plan,ARRAY[''kind'',''change'',''preview_hash'',''template''])OR p_plan->''change''->>''action''IS DISTINCT FROM''issue_duplicate''THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 preview:=public.uc_education_change_preview(p_organization_id,g,p_plan->''change'');SELECT *INTO old_record FROM public.education_document_records WHERE id=(p_plan->''change''->>''record_id'')::uuid;SELECT *INTO old_state FROM public.uc_education_issuance_states WHERE record_id=old_record.id;
 selected:=jsonb_build_array(jsonb_build_object(''enrollment_id'',old_record.enrollment_id,''user_id'',old_record.user_id,''course_id'',old_record.course_id,''group_id'',old_record.group_id));date_value:=(p_plan->''change''->>''issue_date'')::date;series:=p_plan->''change''->>''document_series'';reason:=p_plan->''change''->>''reason'';correct:=p_plan->''change''->''basis''->>''kind''=''correction_replacement'';
 ELSE PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 IF coalesce(p_plan->>''preview_hash'','''')!~''^[a-f0-9]{64}$''THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 payload_hash:=public.uc_program_hash(jsonb_build_object(''organization_id'',p_organization_id,''scope'',p_scope,''plan'',p_plan));
 SELECT array_agg(DISTINCT(value->>''user_id'')::uuid ORDER BY(value->>''user_id'')::uuid)INTO people FROM jsonb_array_elements(selected);
 PERFORM public.uc_education_issue_fence(p_organization_id,g,people,''prepare:''||a::text||'':''||p_request_id::text);
 SELECT *INTO req FROM public.uc_education_issuance_requests WHERE actor_id=a AND request_id=p_request_id;
 IF req.request_id IS NOT NULL THEN IF req.organization_id<>p_organization_id OR req.scope IS DISTINCT FROM p_scope OR req.action<>''prepare_artifacts''OR req.payload_hash<>payload_hash THEN PERFORM public.uc_education_issue_error(''REQUEST_CONFLICT'');END IF;
 RETURN jsonb_build_object(''schema_version'',1,''organization_id'',p_organization_id,''scope'',p_scope,''capabilities'',public.uc_education_issue_caps(p_organization_id,g),''receipt'',req.receipt||jsonb_build_object(''replayed'',true),''preparation'',public.uc_education_preparation_json((req.receipt->>''preparation_id'')::uuid));END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_organization_id::text,0))THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;PERFORM 1 FROM public.organizations o WHERE o.id=p_organization_id FOR SHARE;
 template:=public.uc_education_template(p_organization_id,p_plan->''template'',true);witness:=public.uc_education_number_witness(p_organization_id,date_value);
 IF p_plan->>''kind''=''original''THEN preview:=public.uc_education_issue_preview(p_organization_id,g,p_plan->''intent'',true);selected:=preview->''candidates'';
 IF preview->''ready''IS DISTINCT FROM''true''::jsonb OR preview->>''preview_hash''IS DISTINCT FROM p_plan->>''preview_hash''THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;
 FOR candidate IN SELECT value FROM jsonb_array_elements(selected)LOOP SELECT value INTO item FROM jsonb_array_elements(p_plan->''items'')WHERE value->''enrollment_id''=candidate->''enrollment_id'';IF item->''expected_eligibility_ref''IS DISTINCT FROM candidate->''eligibility_ref''THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;END LOOP;
 ELSE PERFORM public.uc_education_issue_enrollment_fence(old_record.enrollment_id,true);PERFORM 1 FROM public.education_document_records r WHERE r.id=old_record.id FOR UPDATE;PERFORM 1 FROM public.uc_education_issuance_states s WHERE s.record_id=old_record.id FOR UPDATE;
 PERFORM public.uc_education_issue_source_lock(p_organization_id,p_plan->''change''->''basis''->''basis''->''source'');preview:=public.uc_education_change_preview(p_organization_id,g,p_plan->''change'');IF preview->>''preview_hash''IS DISTINCT FROM p_plan->>''preview_hash''THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;
 END IF;
 INSERT INTO public.uc_education_issuance_preparations(id,organization_id,actor_id,scope,kind,plan,intent_hash,template,template_storage,number_witness,participant_ids)VALUES(prep_id,p_organization_id,a,p_scope,p_plan->>''kind'',p_plan,payload_hash,p_plan->''template'',template->''storage'',witness,array_append(people,a));
 FOR candidate IN SELECT value FROM jsonb_array_elements(selected)ORDER BY value->>''enrollment_id''LOOP idx:=idx+1;item_id:=gen_random_uuid();document_id:=gen_random_uuid();upload_request:=gen_random_uuid();numbers:=public.uc_education_prospective_numbers(witness,idx,date_value,series);
 IF p_plan->>''kind''=''original''THEN proof:=candidate->''eligibility_ref'';source:=to_jsonb(public.uc_program_issuance_source(p_organization_id,(candidate->>''group_id'')::uuid,(candidate->>''enrollment_id'')::uuid,(candidate->>''user_id'')::uuid,(candidate->>''course_id'')::uuid));
 SELECT jsonb_build_object(''user_id'',p.user_id,''full_name'',btrim(p.full_name),''birth_date'',d.birth_date,''registration_hash'',proof->''identity_ref''->''registration_hash'',''source'',''current_student_registration'')INTO identity FROM public.profiles p JOIN public.student_frdo_data d ON d.user_id=p.user_id AND d.organization_id=p.organization_id WHERE p.user_id=(candidate->>''user_id'')::uuid AND p.organization_id=p_organization_id;
 ELSE proof:=old_state.proof;SELECT snapshot INTO source FROM public.education_document_program_sources WHERE record_id=old_record.id;identity:=public.uc_education_replacement_identity(old_record.id,correct);
 IF correct THEN proof:=jsonb_set(proof-''source_hash'',''{identity_ref}'',jsonb_build_object(''user_id'',old_record.user_id,''registration_hash'',identity->''registration_hash'',''source'',''current_student_registration''));proof:=proof||jsonb_build_object(''source_hash'',public.uc_program_hash(proof));END IF;
 END IF;
 facts:=source->''program_snapshot''->''facts'';IF source IS NULL OR facts IS NULL THEN PERFORM public.uc_education_issue_error(''SOURCE_UNAVAILABLE'');END IF;
 frdo:=public.uc_education_frdo_snapshot(p_organization_id,(candidate->>''user_id'')::uuid,facts,numbers,CASE WHEN p_plan->>''kind''=''original''THEN candidate->>''document_type''ELSE old_record.document_type END,CASE WHEN p_plan->>''kind''=''duplicate''THEN old_state.frdo_facts END,correct);
 vars:=public.uc_education_render_variables(p_organization_id,identity,facts,numbers,proof,frdo->>''document_type'');
 INSERT INTO public.uc_education_issuance_preparation_items(id,preparation_id,organization_id,enrollment_id,user_id,course_id,group_id,number_plan,eligibility_ref,source_snapshot,official_identity,frdo_facts,render_variables,render_input_hash,output_document_id,output_request_id,participant_ids)
 VALUES(item_id,prep_id,p_organization_id,(candidate->>''enrollment_id'')::uuid,(candidate->>''user_id'')::uuid,(candidate->>''course_id'')::uuid,(candidate->>''group_id'')::uuid,numbers,proof,source,identity,frdo,vars,public.uc_program_hash(jsonb_build_object(''preparation_id'',prep_id,''item_id'',item_id,''plan_hash'',payload_hash,''template'',template,''proof'',proof,''source'',source,''identity'',identity,''frdo_facts'',frdo,''numbers'',numbers,''variables'',vars)),document_id,upload_request,ARRAY[(candidate->>''user_id'')::uuid,a]);END LOOP;
 receipt:=jsonb_build_object(''request_id'',p_request_id,''action'',''prepare_artifacts'',''payload_hash'',payload_hash,''preparation_id'',prep_id,''applied_at'',clock_timestamp(),''replayed'',false);
 INSERT INTO public.uc_education_issuance_requests(actor_id,request_id,organization_id,scope,action,payload_hash,receipt,participant_ids)VALUES(a,p_request_id,p_organization_id,p_scope,''prepare_artifacts'',payload_hash,receipt,array_append(people,a));
 RETURN jsonb_build_object(''schema_version'',1,''organization_id'',p_organization_id,''scope'',p_scope,''capabilities'',public.uc_education_issue_caps(p_organization_id,g),''receipt'',receipt,''preparation'',public.uc_education_preparation_json(prep_id));
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN RAISE EXCEPTION ''EDUCATION_ISSUANCE_REVISION_CONFLICT'' USING ERRCODE=''PT409'';WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END;$fn$;

CREATE FUNCTION public.uc_education_artifact_live(p_actor uuid,p_preparation uuid,p_item uuid,p_revision bigint,p_fresh boolean DEFAULT true)RETURNS public.uc_education_issuance_preparation_items LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;c public.uc_admission_cases;s public.uc_learning_outcome_states;m public.uc_learning_machine_results;d public.uc_learning_attestation_decisions;proof jsonb;a jsonb;e jsonb;dto jsonb;identity jsonb;facts jsonb;correct boolean;BEGIN
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item AND preparation_id=p_preparation AND input_revision=p_revision AND NOT redacted;
 SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=p_preparation AND actor_id=p_actor AND NOT redacted;
 IF i.id IS NULL OR p.id IS NULL OR i.organization_id<>p.organization_id OR i.user_id IS NULL OR NOT public.uc_education_artifact_actor(p_actor,i.organization_id,i.group_id,i.user_id,i.enrollment_id)THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 PERFORM public.uc_education_issue_fence(i.organization_id,i.group_id,ARRAY[p_actor,i.user_id]);proof:=i.eligibility_ref;a:=proof->''admission_ref'';
 SELECT *INTO c FROM public.uc_admission_cases WHERE id=(a->>''case_id'')::uuid AND organization_id=i.organization_id AND user_id=i.user_id AND group_id=i.group_id AND enrollment_id=i.enrollment_id;
 IF c.id IS NULL THEN PERFORM public.uc_education_issue_error(''SOURCE_UNAVAILABLE'');END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(a->''evidence_refs'')LOOP dto:=public.uc_admission_evidence_dto((e->>''evidence_id'')::uuid,p_actor);IF dto IS NULL OR dto->>''case_id''IS DISTINCT FROM c.id::text OR dto->''can_read_bytes''IS DISTINCT FROM''true''::jsonb OR dto->>''availability''IS DISTINCT FROM''available''OR dto->''byte_sha256''IS DISTINCT FROM e->''byte_sha256''OR dto->''byte_size''IS DISTINCT FROM e->''byte_size''THEN PERFORM public.uc_education_issue_error(''SOURCE_UNAVAILABLE'');END IF;END LOOP;
 IF p_fresh AND i.final_record_id IS NULL THEN
 IF NOT public.uc_education_template_current(p.organization_id,p.template,p.template_storage)THEN PERFORM public.uc_education_issue_error(''ARTIFACT_REVIEW_REQUIRED'');END IF;
 IF public.uc_education_number_witness(i.organization_id,(i.number_plan->>''issue_date'')::date)IS DISTINCT FROM p.number_witness THEN PERFORM public.uc_education_issue_error(''NUMBER_PLAN_STALE'');END IF;
 IF p.kind=''original''THEN
 IF public.uc_enrollment_is_withdrawn(i.enrollment_id)OR public.uc_admission_program(i.organization_id,i.user_id,i.group_id,i.enrollment_id)IS DISTINCT FROM proof->''program_ref''OR c.revision<>(a->>''revision'')::bigint OR c.decision->''event_id''IS DISTINCT FROM a->''decision_event_id''OR c.decision->>''outcome''IS DISTINCT FROM''admitted''OR c.decision->''later_review_required''IS DISTINCT FROM''false''::jsonb OR NOT public.uc_admission_rules_current(c.id)OR public.uc_admission_requirements_digest(c.id)IS DISTINCT FROM a->>''requirements_digest''THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 SELECT *INTO s FROM public.uc_learning_outcome_states WHERE program_enrollment_snapshot_id=(proof->''program_ref''->>''enrollment_snapshot_id'')::uuid AND organization_id=i.organization_id AND enrollment_id=i.enrollment_id;
 SELECT *INTO m FROM public.uc_learning_machine_results WHERE id=s.machine_id AND state_id=s.id;SELECT *INTO d FROM public.uc_learning_attestation_decisions WHERE id=s.decision_id AND state_id=s.id;
 IF s.id IS NULL OR m.id IS NULL OR d.id IS NULL OR s.revision<>(proof->''outcome_ref''->>''revision'')::bigint OR s.machine_id IS DISTINCT FROM(proof->''outcome_ref''->>''machine_result_id'')::uuid OR s.decision_id IS DISTINCT FROM(proof->''outcome_ref''->>''decision_id'')::uuid OR d.redacted OR d.outcome<>''passed''OR d.machine_result_id IS DISTINCT FROM m.id OR m.input_hash IS DISTINCT FROM public.uc_learning_evaluate(s)->>''input_hash''OR(d.basis=''machine''AND m.evaluation->>''eligibility''<>''eligible'')OR(d.basis=''recognition''AND d.source_proof->''recognition_proof''IS DISTINCT FROM public.uc_learning_recognition_proof(i.organization_id,(d.source_proof->>''recognition_file_version_id'')::uuid))THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 SELECT jsonb_build_object(''user_id'',pr.user_id,''full_name'',btrim(pr.full_name),''birth_date'',f.birth_date,''registration_hash'',proof->''identity_ref''->''registration_hash'',''source'',''current_student_registration'')INTO identity FROM public.profiles pr JOIN public.student_frdo_data f ON f.user_id=pr.user_id AND f.organization_id=pr.organization_id WHERE pr.user_id=i.user_id AND pr.organization_id=i.organization_id;
 IF identity IS DISTINCT FROM i.official_identity THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM public.education_document_records r JOIN public.uc_education_issuance_states x ON x.record_id=r.id WHERE r.id=(p.plan->''change''->>''record_id'')::uuid AND r.organization_id=i.organization_id AND r.user_id=i.user_id AND r.enrollment_id=i.enrollment_id AND r.document_status=''original''AND r.deleted_at IS NULL AND x.revision=(p.plan->''change''->>''expected_revision'')::bigint AND x.annulment IS NULL AND NOT x.redacted AND public.uc_education_issue_state_hash(r.id)=p.plan->''change''->>''expected_state_hash'')THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 correct:=p.plan->''change''->''basis''->>''kind''=''correction_replacement'';IF public.uc_education_replacement_identity((p.plan->''change''->>''record_id'')::uuid,correct)IS DISTINCT FROM i.official_identity THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 END IF;
 facts:=i.source_snapshot->''program_snapshot''->''facts'';IF public.uc_education_render_variables(i.organization_id,i.official_identity,facts,i.number_plan,proof,i.frdo_facts->>''document_type'')IS DISTINCT FROM i.render_variables THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 IF p.kind=''original''OR p.plan->''change''->''basis''->>''kind''=''correction_replacement''THEN IF public.uc_education_frdo_snapshot(i.organization_id,i.user_id,facts,i.number_plan,i.frdo_facts->>''document_type'',CASE WHEN p.kind=''duplicate''THEN i.frdo_facts END,p.kind=''duplicate'')IS DISTINCT FROM i.frdo_facts THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;END IF;
 END IF;RETURN i;END;$fn$;
CREATE FUNCTION public.uc_education_artifact_saved_source(p_item uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;v public.org_document_versions;d public.org_documents;o storage.objects;payload jsonb;name text;path text;BEGIN
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item;SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 SELECT *INTO v FROM public.org_document_versions WHERE organization_id=i.organization_id AND document_id=i.output_document_id AND request_id=i.output_request_id;
 IF v.id IS NULL THEN RETURN NULL;END IF;SELECT *INTO d FROM public.org_documents WHERE id=v.document_id AND organization_id=i.organization_id;SELECT *INTO o FROM storage.objects WHERE id=v.storage_object_id;
 name:=''Проверенный документ — выдача ещё не зарегистрирована'';path:=i.organization_id::text||''/versions/''||i.output_document_id::text||''/''||i.output_request_id::text||''.pdf'';
 payload:=jsonb_build_object(''document_id'',i.output_document_id,''organization_id'',i.organization_id,''expected_revision'',0,''upload'',jsonb_build_object(''file_path'',path,''file_name'',''education-document.pdf'',''file_size'',i.staging_proof->''byte_size'',''change_summary'',''Сформирован проверенный PDF; выдача ещё не зарегистрирована.''),''restore_version_id'',NULL,''document'',jsonb_build_object(''name'',name,''type'',''other'',''issue_date'',i.number_plan->''issue_date'',''status'',''active''));
 IF i.staging_proof IS NULL OR v.request_payload IS DISTINCT FROM payload OR v.uploaded_by IS DISTINCT FROM p.actor_id OR v.version_number<>1 OR v.result_revision<>1 OR d.current_version_id IS DISTINCT FROM v.id OR d.deleted_at IS NOT NULL OR coalesce(d.status,''active'')IN(''archived'',''expired'')OR v.file_path IS DISTINCT FROM path OR v.file_name IS DISTINCT FROM''education-document.pdf''OR v.file_size IS DISTINCT FROM(i.staging_proof->>''byte_size'')::bigint OR v.storage_metadata->>''mimetype''IS DISTINCT FROM''application/pdf''OR NOT public.uc_copy_registry_object_matches(v)THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 RETURN jsonb_build_object(''source'',public.uc_copy_registry_original_ref(v),''object'',jsonb_build_object(''object_id'',o.id,''updated_at'',o.updated_at));END;$fn$;
CREATE FUNCTION public.uc_education_artifact_context_json(p_actor uuid,p_preparation uuid,p_item uuid,p_revision bigint,p_request uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;saved jsonb;artifact jsonb;mode text;path text;BEGIN
 i:=public.uc_education_artifact_live(p_actor,p_preparation,p_item,p_revision,true);SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=p_preparation;saved:=public.uc_education_artifact_saved_source(i.id);
 IF i.artifact IS NOT NULL THEN artifact:=i.artifact||jsonb_build_object(''output_review'',public.uc_education_output_approval(i.id));END IF;
 mode:=CASE WHEN i.final_record_id IS NOT NULL THEN''consumed''WHEN artifact IS NOT NULL THEN''rendered''WHEN i.staging_proof IS NOT NULL THEN''staged''ELSE''prepared''END;
 path:=i.organization_id::text||''/versions/''||i.output_document_id::text||''/''||i.output_request_id::text||''.pdf'';
 RETURN jsonb_build_object(''schema_version'',1,''organization_id'',i.organization_id,''preparation_id'',p.id,''item_id'',i.id,''input_revision'',i.input_revision,''request_id'',p_request,''user_id'',p_actor,''subject_user_id'',i.user_id,''scope'',p.scope,''mode'',mode,''final_record_id'',i.final_record_id,''render_input_hash'',i.render_input_hash,
 ''template'',jsonb_build_object(''ref'',p.template,''storage'',p.template_storage),''variables'',i.render_variables,''staging'',jsonb_build_object(''bucket'',''education-issuance-staging'',''path'',i.user_id::text||''/''||i.organization_id::text||''/''||p.id::text||''/''||i.id::text||''/''||i.render_input_hash||''.pdf'',''proof'',i.staging_proof),
 ''output'',jsonb_build_object(''document_id'',i.output_document_id,''upload_request_id'',i.output_request_id,''expected_revision'',0,''file_path'',path,''file_name'',''education-document.pdf'',''document'',jsonb_build_object(''name'',''Проверенный документ — выдача ещё не зарегистрирована'',''type'',''other'',''issue_date'',i.number_plan->''issue_date'',''status'',''active''),''source'',saved->''source'',''object'',saved->''object'',''artifact'',artifact));END;$fn$;
CREATE FUNCTION public.uc_education_artifact_context(p_organization_id uuid,p_preparation_id uuid,p_item_id uuid,p_input_revision bigint,p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout=''2000ms'' AS $fn$
DECLARE p public.uc_education_issuance_preparations;i public.uc_education_issuance_preparation_items;h text;req public.uc_education_issuance_requests;BEGIN
 IF p_request_id IS NULL OR p_input_revision IS NULL OR p_input_revision<1 THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 p:=public.uc_education_preparation_access(p_preparation_id,true,p_item_id);IF p.organization_id IS DISTINCT FROM p_organization_id THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 i:=public.uc_education_artifact_live(auth.uid(),p.id,p_item_id,p_input_revision,true);h:=public.uc_program_hash(jsonb_build_object(''organization_id'',p_organization_id,''preparation_id'',p_preparation_id,''item_id'',p_item_id,''input_revision'',p_input_revision));
 PERFORM public.uc_education_issue_fence(p.organization_id,i.group_id,ARRAY[auth.uid(),i.user_id],''render:''||auth.uid()::text||'':''||p_request_id::text);
 SELECT *INTO req FROM public.uc_education_issuance_requests WHERE actor_id=auth.uid()AND request_id=p_request_id;
 IF req.request_id IS NOT NULL THEN IF req.organization_id<>p.organization_id OR req.scope IS DISTINCT FROM p.scope OR req.action<>''render_artifact''OR req.payload_hash<>h THEN PERFORM public.uc_education_issue_error(''REQUEST_CONFLICT'');END IF;
 ELSE INSERT INTO public.uc_education_issuance_requests(actor_id,request_id,organization_id,scope,action,payload_hash,receipt,participant_ids)VALUES(auth.uid(),p_request_id,p.organization_id,p.scope,''render_artifact'',h,jsonb_build_object(''preparation_id'',p.id,''item_id'',i.id,''input_revision'',i.input_revision),ARRAY[auth.uid(),i.user_id]);END IF;
 RETURN public.uc_education_artifact_context_json(auth.uid(),p.id,i.id,i.input_revision,p_request_id);
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN RAISE EXCEPTION ''EDUCATION_ISSUANCE_REVISION_CONFLICT'' USING ERRCODE=''PT409'';WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END;$fn$;

CREATE FUNCTION public.uc_education_artifact_service_request(p_actor uuid,p_org uuid,p_preparation uuid,p_item uuid,p_revision bigint,p_request uuid)RETURNS public.uc_education_issuance_preparation_items LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;h text;BEGIN
 IF auth.role()IS DISTINCT FROM''service_role''OR auth.uid()IS NOT NULL OR p_actor IS NULL OR p_request IS NULL THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=p_preparation AND organization_id=p_org AND actor_id=p_actor AND NOT redacted FOR UPDATE;
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item AND preparation_id=p_preparation AND organization_id=p_org AND input_revision=p_revision AND NOT redacted FOR UPDATE;
 IF p.id IS NULL OR i.id IS NULL THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 h:=public.uc_program_hash(jsonb_build_object(''organization_id'',p_org,''preparation_id'',p_preparation,''item_id'',p_item,''input_revision'',p_revision));
 IF NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_requests r WHERE r.actor_id=p_actor AND r.request_id=p_request AND r.organization_id=p_org AND r.scope=p.scope AND r.action=''render_artifact''AND r.payload_hash=h)THEN PERFORM public.uc_education_issue_error(''REQUEST_CONFLICT'');END IF;
 PERFORM 1 FROM public.org_documents WHERE id=(p.template->''source''->>''document_id'')::uuid AND organization_id=p_org FOR SHARE;
 PERFORM 1 FROM public.org_document_versions WHERE id=(p.template->''source''->>''version_id'')::uuid AND organization_id=p_org FOR SHARE;
 PERFORM 1 FROM public.org_document_reviews WHERE id=(p.template->>''review_id'')::uuid AND organization_id=p_org FOR SHARE;
 PERFORM 1 FROM storage.objects WHERE id=(p.template_storage->>''object_id'')::uuid FOR SHARE;
 i:=public.uc_education_artifact_live(p_actor,p_preparation,p_item,p_revision,true);RETURN i;END;$fn$;
CREATE FUNCTION public.uc_education_artifact_attest_shape(p_proof jsonb,p_stage boolean)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE k text;keys text[];BEGIN keys:=CASE WHEN p_stage THEN ARRAY[''render_input_hash'',''template_source_hash'',''template_object_id'',''template_updated_at'',''template_byte_sha256'',''html_sha256'',''staged_object_id'',''staged_updated_at'',''byte_sha256'',''byte_size'',''mime_type'',''renderer'',''renderer_revision'']ELSE ARRAY[''render_input_hash'',''staged_object_id'',''staged_updated_at'',''source'',''output_object_id'',''output_updated_at'',''byte_sha256'',''byte_size'',''mime_type'',''renderer'',''renderer_revision'']END;
 IF NOT public.uc_admission_shape(p_proof,keys)OR p_proof->>''mime_type''IS DISTINCT FROM''application/pdf''OR p_proof->>''renderer''IS DISTINCT FROM''browserless''OR p_proof->>''renderer_revision''IS DISTINCT FROM''uc019-v1''OR coalesce(p_proof->>''byte_size'','''')!~''^[0-9]+$''OR(p_proof->>''byte_size'')::numeric NOT BETWEEN 1 AND 20971520 THEN RETURN false;END IF;
 FOREACH k IN ARRAY CASE WHEN p_stage THEN ARRAY[''render_input_hash'',''template_source_hash'',''template_byte_sha256'',''html_sha256'',''byte_sha256'']ELSE ARRAY[''render_input_hash'',''byte_sha256'']END LOOP IF jsonb_typeof(p_proof->k)IS DISTINCT FROM''string''OR p_proof->>k!~''^[a-f0-9]{64}$''THEN RETURN false;END IF;END LOOP;
 FOREACH k IN ARRAY CASE WHEN p_stage THEN ARRAY[''template_object_id'',''staged_object_id'']ELSE ARRAY[''staged_object_id'',''output_object_id'']END LOOP IF NOT public.uc_admission_uuid(p_proof->k)THEN RETURN false;END IF;END LOOP;
 FOREACH k IN ARRAY CASE WHEN p_stage THEN ARRAY[''template_updated_at'',''staged_updated_at'']ELSE ARRAY[''staged_updated_at'',''output_updated_at'']END LOOP IF jsonb_typeof(p_proof->k)IS DISTINCT FROM''string''OR length(p_proof->>k)>64 OR p_proof->>k!~''^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$''THEN RETURN false;END IF;END LOOP;RETURN true;END;$fn$;
CREATE FUNCTION public.uc_attest_education_issuance_staging(p_actor_id uuid,p_organization_id uuid,p_preparation_id uuid,p_item_id uuid,p_input_revision bigint,p_request_id uuid,p_proof jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage SET lock_timeout=''2000ms'' AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;o storage.objects;proof jsonb;meta jsonb;BEGIN
 i:=public.uc_education_artifact_service_request(p_actor_id,p_organization_id,p_preparation_id,p_item_id,p_input_revision,p_request_id);SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF NOT public.uc_education_artifact_attest_shape(p_proof,true)THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 IF p_proof->>''render_input_hash''IS DISTINCT FROM i.render_input_hash OR p_proof->>''template_source_hash''IS DISTINCT FROM p.template->''source''->>''content_hash''OR p_proof->''template_object_id''IS DISTINCT FROM p.template_storage->''object_id''OR(p_proof->>''template_updated_at'')::timestamptz IS DISTINCT FROM(p.template_storage->>''updated_at'')::timestamptz OR(p.template_byte_sha256 IS NOT NULL AND p.template_byte_sha256 IS DISTINCT FROM p_proof->>''template_byte_sha256'')THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 SELECT *INTO o FROM storage.objects WHERE id=(p_proof->>''staged_object_id'')::uuid AND bucket_id=''education-issuance-staging''AND name=i.user_id::text||''/''||i.organization_id::text||''/''||p.id::text||''/''||i.id::text||''/''||i.render_input_hash||''.pdf''FOR SHARE;
 meta:=jsonb_build_object(''preparation_id'',p.id,''item_id'',i.id,''render_input_hash'',i.render_input_hash,''template_byte_sha256'',p_proof->''template_byte_sha256'',''html_sha256'',p_proof->''html_sha256'',''byte_sha256'',p_proof->''byte_sha256'',''renderer'',''browserless'',''renderer_revision'',''uc019-v1'');
 IF o.id IS NULL OR o.owner IS NOT NULL OR nullif(o.owner_id,'''')IS NOT NULL OR o.user_metadata IS DISTINCT FROM meta OR o.updated_at IS DISTINCT FROM(p_proof->>''staged_updated_at'')::timestamptz OR coalesce(o.metadata->>''size'','''')!~''^[0-9]+$''OR(o.metadata->>''size'')::bigint IS DISTINCT FROM(p_proof->>''byte_size'')::bigint OR o.metadata->>''mimetype''IS DISTINCT FROM''application/pdf''THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 proof:=jsonb_build_object(''object_id'',o.id,''updated_at'',o.updated_at,''byte_sha256'',p_proof->''byte_sha256'',''byte_size'',(p_proof->>''byte_size'')::bigint,''template_byte_sha256'',p_proof->''template_byte_sha256'',''html_sha256'',p_proof->''html_sha256'',''renderer'',''browserless'',''renderer_revision'',''uc019-v1'');
 IF i.staging_proof IS NOT NULL AND i.staging_proof IS DISTINCT FROM proof THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 UPDATE public.uc_education_issuance_preparations SET template_byte_sha256=p_proof->>''template_byte_sha256''WHERE id=p.id;
 UPDATE public.uc_education_issuance_preparation_items SET staging_proof=proof WHERE id=i.id;
 PERFORM public.uc_education_artifact_live(p_actor_id,p.id,i.id,i.input_revision,true);
 RETURN jsonb_build_object(''schema_version'',1,''kind'',''staging_attested'',''organization_id'',i.organization_id,''preparation_id'',p.id,''item_id'',i.id,''input_revision'',i.input_revision,''render_input_hash'',i.render_input_hash,''byte_sha256'',proof->''byte_sha256'',''byte_size'',proof->''byte_size'',''object_id'',o.id,''updated_at'',o.updated_at);
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN RAISE EXCEPTION ''EDUCATION_ISSUANCE_REVISION_CONFLICT'' USING ERRCODE=''PT409'';WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END;$fn$;
CREATE FUNCTION public.uc_attest_education_issuance_artifact(p_actor_id uuid,p_organization_id uuid,p_preparation_id uuid,p_item_id uuid,p_input_revision bigint,p_request_id uuid,p_proof jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage SET lock_timeout=''2000ms'' AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;saved jsonb;o storage.objects;stage storage.objects;v_artifact jsonb;BEGIN
 i:=public.uc_education_artifact_service_request(p_actor_id,p_organization_id,p_preparation_id,p_item_id,p_input_revision,p_request_id);SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF NOT public.uc_education_artifact_attest_shape(p_proof,false)THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 IF i.staging_proof IS NULL OR p_proof->>''render_input_hash''IS DISTINCT FROM i.render_input_hash OR p_proof->''byte_sha256''IS DISTINCT FROM i.staging_proof->''byte_sha256''OR p_proof->''byte_size''IS DISTINCT FROM i.staging_proof->''byte_size''OR p_proof->''staged_object_id''IS DISTINCT FROM i.staging_proof->''object_id''OR(p_proof->>''staged_updated_at'')::timestamptz IS DISTINCT FROM(i.staging_proof->>''updated_at'')::timestamptz THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 SELECT *INTO stage FROM storage.objects WHERE id=(i.staging_proof->>''object_id'')::uuid AND bucket_id=''education-issuance-staging''FOR SHARE;IF stage.id IS NULL OR stage.updated_at IS DISTINCT FROM(i.staging_proof->>''updated_at'')::timestamptz OR stage.owner IS NOT NULL OR nullif(stage.owner_id,'''')IS NOT NULL THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 PERFORM 1 FROM public.org_documents WHERE id=i.output_document_id AND organization_id=i.organization_id FOR SHARE;PERFORM 1 FROM public.org_document_versions WHERE document_id=i.output_document_id AND request_id=i.output_request_id AND organization_id=i.organization_id FOR SHARE;
 saved:=public.uc_education_artifact_saved_source(i.id);IF saved IS NULL OR saved->''source''IS DISTINCT FROM p_proof->''source''OR saved->''object''->''object_id''IS DISTINCT FROM p_proof->''output_object_id''OR(saved->''object''->>''updated_at'')::timestamptz IS DISTINCT FROM(p_proof->>''output_updated_at'')::timestamptz THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 SELECT *INTO o FROM storage.objects WHERE id=(p_proof->>''output_object_id'')::uuid FOR SHARE;
 IF o.id IS NULL OR o.updated_at IS DISTINCT FROM(p_proof->>''output_updated_at'')::timestamptz OR(o.metadata->>''size'')::bigint IS DISTINCT FROM(p_proof->>''byte_size'')::bigint OR o.metadata->>''mimetype''IS DISTINCT FROM''application/pdf''THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 v_artifact:=jsonb_build_object(''source'',p_proof->''source'',''byte_sha256'',p_proof->''byte_sha256'',''byte_size'',(p_proof->>''byte_size'')::bigint,''render_input_hash'',i.render_input_hash,''template_byte_sha256'',i.staging_proof->''template_byte_sha256'',''html_sha256'',i.staging_proof->''html_sha256'',''renderer'',''browserless'',''renderer_revision'',''uc019-v1'',''output_review'',NULL);
 IF i.artifact IS NOT NULL AND i.artifact IS DISTINCT FROM v_artifact THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 UPDATE public.uc_education_issuance_preparation_items SET artifact=v_artifact WHERE id=i.id;
 PERFORM public.uc_education_artifact_live(p_actor_id,p.id,i.id,i.input_revision,true);
 RETURN jsonb_build_object(''schema_version'',1,''kind'',''artifact_attested'',''organization_id'',i.organization_id,''preparation_id'',p.id,''item_id'',i.id,''input_revision'',i.input_revision,''render_input_hash'',i.render_input_hash,''byte_sha256'',v_artifact->''byte_sha256'',''byte_size'',v_artifact->''byte_size'',''object_id'',o.id,''updated_at'',o.updated_at);
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN RAISE EXCEPTION ''EDUCATION_ISSUANCE_REVISION_CONFLICT'' USING ERRCODE=''PT409'';WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_guard_program_issuance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public''
AS $function$
DECLARE s public.group_program_enrollment_snapshots;f jsonb;t text;
BEGIN
 IF TG_OP=''UPDATE'' THEN
  IF public.uc_program_issuance_lifecycle(to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM public.education_document_program_sources WHERE record_id=OLD.id) THEN RAISE EXCEPTION ''issued_program_source_is_immutable'' USING ERRCODE=''42501''; END IF;
 END IF;
 SELECT (jsonb_populate_record(NULL::public.group_program_enrollment_snapshots,c.source_snapshot)).* INTO s FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=NEW.organization_id AND c.enrollment_id=NEW.enrollment_id AND c.user_id=NEW.user_id AND c.course_id=NEW.course_id AND c.group_id=NEW.group_id AND c.mode=''duplicate'';
 IF s.id IS NULL THEN s:=public.uc_program_issuance_source(NEW.organization_id,NEW.group_id,NEW.enrollment_id,NEW.user_id,NEW.course_id);END IF;
 f:=s.program_snapshot->''facts'';t:=CASE f->>''program_type'' WHEN ''dpo_upskilling'' THEN ''certificate'' WHEN ''dpo_retraining'' THEN ''diploma'' WHEN ''professional_training'' THEN ''qualification'' END;
 IF t IS NULL OR NEW.document_type IS DISTINCT FROM t THEN RAISE EXCEPTION ''education_document_type_program_mismatch'' USING ERRCODE=''22023''; END IF;
 -- These fields are server-derived; neither a live course title nor a caller''s export row is authoritative.
 NEW.specialty_name:=f->>''full_title'';NEW.qualification_name:=coalesce(f->>''qualification'',f->>''profession'');
 RETURN NEW;
END;$function$;

CREATE OR REPLACE FUNCTION public.uc_record_program_issuance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public''
AS $function$
DECLARE s public.group_program_enrollment_snapshots;
BEGIN
 IF TG_OP=''UPDATE'' AND public.uc_program_issuance_lifecycle(to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
 SELECT (jsonb_populate_record(NULL::public.group_program_enrollment_snapshots,c.source_snapshot)).* INTO s FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=NEW.organization_id AND c.enrollment_id=NEW.enrollment_id AND c.user_id=NEW.user_id AND c.course_id=NEW.course_id AND c.group_id=NEW.group_id AND c.mode=''duplicate'';
 IF s.id IS NULL THEN s:=public.uc_program_issuance_source(NEW.organization_id,NEW.group_id,NEW.enrollment_id,NEW.user_id,NEW.course_id);END IF;
 INSERT INTO public.education_document_program_sources(record_id,organization_id,enrollment_snapshot_id,snapshot,recorded_by)
 VALUES(NEW.id,NEW.organization_id,s.id,to_jsonb(s),auth.uid());RETURN NEW;
END;$function$;

CREATE FUNCTION public.uc_education_artifact_final(p_org uuid,p_group uuid,p_ref jsonb)RETURNS public.uc_education_issuance_preparation_items LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;review jsonb;expected jsonb;BEGIN
 IF NOT public.uc_admission_shape(p_ref,ARRAY[''preparation_id'',''item_id'',''input_revision'',''source'',''byte_sha256'',''byte_size'',''render_input_hash'',''template_byte_sha256'',''html_sha256'',''renderer'',''renderer_revision'',''output_review_id'',''output_review_revision''])OR NOT public.uc_admission_uuid(p_ref->''preparation_id'')OR NOT public.uc_admission_uuid(p_ref->''item_id'')OR coalesce(p_ref->>''input_revision'','''')!~''^[0-9]+$''THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 p:=public.uc_education_preparation_access((p_ref->>''preparation_id'')::uuid,true,(p_ref->>''item_id'')::uuid);IF p.organization_id<>p_org OR p.scope IS DISTINCT FROM (CASE WHEN p_group IS NULL THEN jsonb_build_object(''kind'',''organization'')ELSE jsonb_build_object(''kind'',''group'',''group_id'',p_group)END) THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 PERFORM 1 FROM public.uc_education_issuance_preparations WHERE id=p.id FOR UPDATE;SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=(p_ref->>''item_id'')::uuid AND preparation_id=p.id FOR UPDATE;
 IF i.final_record_id IS NOT NULL OR i.input_revision<>(p_ref->>''input_revision'')::bigint OR i.artifact IS NULL THEN PERFORM public.uc_education_issue_error(''ARTIFACT_UNAVAILABLE'');END IF;
 PERFORM public.uc_education_issue_source_lock(p_org,p.template->''source'');PERFORM 1 FROM public.org_document_reviews WHERE id=(p.template->>''review_id'')::uuid AND organization_id=p_org FOR SHARE;
 PERFORM public.uc_education_issue_source_lock(p_org,i.artifact->''source'');review:=public.uc_education_output_approval(i.id);
 IF review IS NULL THEN PERFORM public.uc_education_issue_error(''ARTIFACT_REVIEW_REQUIRED'');END IF;PERFORM 1 FROM public.org_document_reviews WHERE id=(review->>''id'')::uuid AND organization_id=p_org FOR SHARE;
 expected:=(i.artifact-''output_review'')||jsonb_build_object(''preparation_id'',p.id,''item_id'',i.id,''input_revision'',i.input_revision,''output_review_id'',review->''id'',''output_review_revision'',review->''revision'');
 IF p_ref IS DISTINCT FROM expected THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 PERFORM public.uc_education_artifact_live(auth.uid(),p.id,i.id,i.input_revision,true);RETURN i;END;$fn$;
CREATE FUNCTION public.uc_education_issue_one(p_item uuid,p_artifact jsonb,p_reason text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;r public.education_document_records;s public.uc_education_issuance_states;original public.education_document_records;old public.uc_education_issuance_states;official jsonb;item jsonb;source jsonb;context_id uuid;registry jsonb;context jsonb;data jsonb;event_id uuid:=gen_random_uuid();duplicate_event uuid;before_hash text;after_hash text;mode text;original_data text;BEGIN
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item FOR UPDATE;SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF p.actor_id IS DISTINCT FROM auth.uid()OR i.final_record_id IS NOT NULL OR i.redacted OR p.redacted THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 mode:=CASE p.kind WHEN''original''THEN''original''ELSE''duplicate''END;
 IF mode=''duplicate''THEN SELECT *INTO original FROM public.education_document_records WHERE id=(p.plan->''change''->>''record_id'')::uuid;SELECT *INTO old FROM public.uc_education_issuance_states WHERE record_id=original.id;before_hash:=public.uc_education_issue_state_hash(original.id);
 original_data:=jsonb_build_object(''record_id'',original.id,''document_number'',original.document_number,''reg_number'',original.reg_number,''issue_date'',original.issue_date)::text;END IF;
 official:=i.official_identity||i.number_plan||jsonb_build_object(''document_type'',i.frdo_facts->''document_type'',''original_document_data'',original_data);
 INSERT INTO public.uc_education_issuance_contexts(transaction_id,backend_pid,actor_id,organization_id,mode,enrollment_id,user_id,course_id,group_id,original_record_id,proof,source_snapshot,official_identity)
 VALUES(txid_current(),pg_backend_pid(),auth.uid(),i.organization_id,mode,i.enrollment_id,i.user_id,i.course_id,i.group_id,original.id,i.eligibility_ref,i.source_snapshot,official)RETURNING id INTO context_id;
 item:=jsonb_build_object(''user_id'',i.user_id,''enrollment_id'',i.enrollment_id,''document_type'',i.frdo_facts->''document_type'',''issue_date'',i.number_plan->''issue_date'',''document_series'',i.number_plan->''document_series'',''full_name'',i.official_identity->''full_name'',''birth_date'',i.official_identity->''birth_date'',''document_status'',mode,''original_document_data'',original_data,''notes'','''');
 SELECT *INTO r FROM public.issue_education_document_batch(i.organization_id,i.group_id,i.course_id,jsonb_build_array(item));
 DELETE FROM public.uc_education_issuance_contexts WHERE id=context_id;
 IF r.id IS NULL OR r.document_number IS DISTINCT FROM i.number_plan->>''document_number''OR r.reg_number IS DISTINCT FROM i.number_plan->>''reg_number''OR r.delivery_method IS DISTINCT FROM''not_recorded''OR r.document_status<>mode THEN PERFORM public.uc_education_issue_error(''NUMBER_PLAN_STALE'');END IF;
 context:=public.uc_document_registry_context(i.organization_id,CASE WHEN p.scope->>''kind''=''group''THEN(p.scope->>''group_id'')::uuid END,jsonb_build_object(''kind'',''student'',''user_id'',i.user_id),jsonb_build_object(''kind'',''enrollment'',''enrollment_id'',i.enrollment_id,''binding_hash'',repeat(''0'',64)),false)->''context'';
 data:=jsonb_build_object(''direction'',''outgoing'',''document_type'',r.document_type,''title'',CASE r.document_type WHEN''certificate''THEN''Удостоверение''WHEN''diploma''THEN''Диплом''ELSE''Свидетельство''END||'' № ''||r.document_number,''document_date'',r.issue_date,''declared_document_number'',r.document_number,''source'',p_artifact->''source'',''sender'',jsonb_build_object(''kind'',''organization'',''organization_id'',i.organization_id),''recipient'',jsonb_build_object(''kind'',''student'',''user_id'',i.user_id),''subject'',jsonb_build_object(''kind'',''student'',''user_id'',i.user_id),''context'',context,''origin'',jsonb_build_object(''kind'',''org_document''),''notes'',''Зарегистрирован проверенный файл выданного документа. Факт передачи фиксируется отдельно.'');
 registry:=public.apply_document_registry_action(i.organization_id,p.scope,0,gen_random_uuid(),jsonb_build_object(''action'',''register'',''data'',data,''reason'',p_reason));
 IF registry->''record''->>''id''IS NULL THEN PERFORM public.uc_education_issue_error(''DEPENDENCY_UNAVAILABLE'');END IF;
 INSERT INTO public.uc_education_issuance_states(record_id,organization_id,user_id,course_id,enrollment_id,group_id,revision,original_record_id,registry_record_id,proof,artifact,frdo_facts,notes,recorded_by,updated_by,participant_ids)
 VALUES(r.id,i.organization_id,i.user_id,i.course_id,i.enrollment_id,i.group_id,1,original.id,(registry->''record''->>''id'')::uuid,i.eligibility_ref,p_artifact,i.frdo_facts,'''',auth.uid(),auth.uid(),ARRAY[i.user_id,auth.uid()]);
 after_hash:=public.uc_education_issue_state_hash(r.id);
 INSERT INTO public.uc_education_issuance_events(id,record_id,organization_id,user_id,revision,kind,actor_id,reason,previous_state_hash,state_hash,payload,participant_ids)
 VALUES(event_id,r.id,i.organization_id,i.user_id,1,''issued'',auth.uid(),p_reason,public.uc_program_hash(jsonb_build_object(''record_id'',r.id,''revision'',0)),after_hash,jsonb_build_object(''kind'',''issued'',''official'',to_jsonb(r)-''deleted_by'',''proof'',i.eligibility_ref,''proof_availability'',''captured'',''artifact'',p_artifact,''frdo_facts'',i.frdo_facts),ARRAY[i.user_id,auth.uid()]);
 UPDATE public.uc_education_issuance_preparation_items SET final_record_id=r.id WHERE id=i.id;
 IF mode=''duplicate''THEN
 IF old.revision>=9007199254740991 THEN PERFORM public.uc_education_issue_error(''LIMIT_EXCEEDED'');END IF;duplicate_event:=gen_random_uuid();
 UPDATE public.uc_education_issuance_states SET revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp(),participant_ids=array_append(participant_ids,auth.uid())WHERE record_id=original.id;
 INSERT INTO public.uc_education_issuance_events(id,record_id,organization_id,user_id,revision,kind,actor_id,reason,previous_state_hash,state_hash,payload,participant_ids)
 VALUES(duplicate_event,original.id,i.organization_id,i.user_id,old.revision+1,''duplicate_issued'',auth.uid(),p_reason,before_hash,public.uc_education_issue_state_hash(original.id),jsonb_build_object(''kind'',''duplicate_issued'',''original_record_id'',original.id,''duplicate_record_id'',r.id,''basis'',p.plan->''change''->''basis''),ARRAY[i.user_id,auth.uid()]);
 END IF;
 RETURN jsonb_build_object(''record_id'',r.id,''original_record_id'',original.id,''event_ids'',CASE WHEN duplicate_event IS NULL THEN jsonb_build_array(event_id)ELSE jsonb_build_array(event_id,duplicate_event)END,''enrollment_id'',i.enrollment_id);END;$fn$;

CREATE FUNCTION public.uc_education_change_apply(p_org uuid,p_group uuid,p_change jsonb,p_preview_hash text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
DECLARE r public.education_document_records;s public.uc_education_issuance_states;preview jsonb;op text:=p_change->>''action'';eid uuid:=gen_random_uuid();payload jsonb;kind text;old_notes text;prior text;BEGIN
 SELECT *INTO r FROM public.education_document_records WHERE id=(p_change->>''record_id'')::uuid AND organization_id=p_org FOR UPDATE;
 IF r.id IS NULL THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;PERFORM public.uc_education_issue_fence(p_org,p_group,ARRAY[r.user_id,auth.uid()]);
 SELECT *INTO s FROM public.uc_education_issuance_states WHERE record_id=r.id FOR UPDATE;
 preview:=public.uc_education_change_preview(p_org,p_group,p_change);IF preview->>''preview_hash''IS DISTINCT FROM p_preview_hash THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;
 IF op=''issue_duplicate''THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;prior:=public.uc_education_issue_state_hash(r.id);old_notes:=coalesce(s.notes,r.notes,'''');
 IF coalesce(s.revision,0)>=9007199254740991 THEN PERFORM public.uc_education_issue_error(''LIMIT_EXCEEDED'');END IF;
 IF op=''record_handover''THEN PERFORM public.uc_education_issue_source_lock(p_org,p_change->''handover''->''evidence'');IF p_change->''handover''?''authorization''THEN PERFORM public.uc_education_issue_source_lock(p_org,p_change->''handover''->''authorization'');END IF;
 ELSIF op=''annul''THEN PERFORM public.uc_education_issue_source_lock(p_org,p_change->''basis''->''source'');END IF;
 IF s.record_id IS NULL THEN INSERT INTO public.uc_education_issuance_states(record_id,organization_id,user_id,course_id,enrollment_id,group_id,revision,notes,recorded_by,updated_by,participant_ids)VALUES(r.id,p_org,r.user_id,r.course_id,r.enrollment_id,r.group_id,1,old_notes,auth.uid(),auth.uid(),array_remove(ARRAY[r.user_id,auth.uid()],NULL));
 ELSE UPDATE public.uc_education_issuance_states SET revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp(),participant_ids=array_append(participant_ids,auth.uid())WHERE record_id=r.id;END IF;
 IF op=''correct_metadata''THEN kind:=''metadata_corrected'';payload:=jsonb_build_object(''kind'',kind,''before_notes'',old_notes,''after_notes'',p_change->''patch''->''notes'');UPDATE public.uc_education_issuance_states SET notes=p_change->''patch''->>''notes''WHERE record_id=r.id;
 ELSIF op=''record_handover''THEN kind:=''handover_recorded'';payload:=jsonb_build_object(''kind'',kind,''handover'',p_change->''handover'');UPDATE public.uc_education_issuance_states SET latest_handover=jsonb_build_object(''event_id'',eid,''fact'',p_change->''handover'',''recorded_at'',clock_timestamp(),''recorded_by'',auth.uid())WHERE record_id=r.id;
 ELSIF op=''void_handover''THEN kind:=''handover_voided'';payload:=jsonb_build_object(''kind'',kind,''event_id'',p_change->''event_id'');UPDATE public.uc_education_issuance_states SET latest_handover=NULL WHERE record_id=r.id;
 ELSIF op=''annul''THEN kind:=''annulled'';payload:=jsonb_build_object(''kind'',kind,''basis'',p_change->''basis'');UPDATE public.uc_education_issuance_states SET annulment=jsonb_build_object(''event_id'',eid,''recorded_at'',clock_timestamp(),''actor_id'',auth.uid(),''basis'',p_change->''basis'',''reason'',p_change->''reason'')WHERE record_id=r.id;
 ELSE PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 SELECT *INTO s FROM public.uc_education_issuance_states WHERE record_id=r.id;
 INSERT INTO public.uc_education_issuance_events(id,record_id,organization_id,user_id,revision,kind,actor_id,reason,previous_state_hash,state_hash,payload,participant_ids)VALUES(eid,r.id,p_org,r.user_id,s.revision,kind,auth.uid(),p_change->>''reason'',prior,public.uc_education_issue_state_hash(r.id),payload,array_remove(ARRAY[r.user_id,auth.uid()],NULL));
 RETURN jsonb_build_object(''record_ids'',jsonb_build_array(r.id),''enrollment_ids'',CASE WHEN r.enrollment_id IS NULL THEN''[]''::jsonb ELSE jsonb_build_array(r.enrollment_id)END,''event_ids'',jsonb_build_array(eid));END;$fn$;
CREATE FUNCTION public.uc_education_mutation_result(p_org uuid,p_scope jsonb,p_receipt jsonb,p_replayed boolean)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE g uuid;id jsonb;record jsonb;records jsonb:=''[]'';withdrawals jsonb:=''[]'';BEGIN g:=public.uc_education_issue_scope(p_org,p_scope);
 FOR id IN SELECT value FROM jsonb_array_elements(p_receipt->''record_ids'')LOOP record:=public.uc_education_issue_record(p_org,g,(id#>>''{}'')::uuid);IF record IS NULL THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;records:=records||jsonb_build_array(record);END LOOP;
 IF p_receipt->>''action''=''withdraw_enrollments''THEN FOR id IN SELECT value FROM jsonb_array_elements(p_receipt->''enrollment_ids'')LOOP withdrawals:=withdrawals||jsonb_build_array(public.uc_education_withdraw_state(p_org,g,(id#>>''{}'')::uuid));END LOOP;END IF;
 RETURN jsonb_build_object(''schema_version'',1,''organization_id'',p_org,''scope'',p_scope,''capabilities'',public.uc_education_issue_caps(p_org,g),''receipt'',p_receipt||jsonb_build_object(''replayed'',p_replayed),''records'',records,''withdrawals'',withdrawals);END;$fn$;
CREATE FUNCTION public.apply_education_issuance_action(p_organization_id uuid,p_scope jsonb,p_request_id uuid,p_action jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC'' SET lock_timeout=''2000ms''AS $fn$
<<issuance_apply>>
DECLARE g uuid;a uuid:=auth.uid();op text:=p_action->>''action'';h text;req public.uc_education_issuance_requests;caps jsonb;preview jsonb;prep public.uc_education_issuance_preparations;i public.uc_education_issuance_preparation_items;x jsonb;change jsonb;result jsonb;receipt jsonb;records jsonb:=''[]'';enrollments jsonb:=''[]'';events jsonb:=''[]'';prep_id uuid;selected jsonb;people uuid[];BEGIN
 g:=public.uc_education_issue_scope(p_organization_id,p_scope);caps:=public.uc_education_issue_caps(p_organization_id,g);
 IF p_request_id IS NULL OR jsonb_typeof(p_action)IS DISTINCT FROM''object''OR octet_length(p_action::text)>2097152 OR op NOT IN(''issue_batch'',''apply_change'',''withdraw_enrollments'')THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 IF(op=''issue_batch''AND caps->''can_issue''IS DISTINCT FROM''true''::jsonb)OR(op=''withdraw_enrollments''AND caps->''can_withdraw''IS DISTINCT FROM''true''::jsonb)OR(op=''apply_change''AND(CASE p_action->''change''->>''action''WHEN''correct_metadata''THEN caps->''can_write_metadata''WHEN''record_handover''THEN caps->''can_record_handover''WHEN''void_handover''THEN caps->''can_record_handover''WHEN''annul''THEN caps->''can_annul''WHEN''issue_duplicate''THEN caps->''can_issue_duplicate''END)IS DISTINCT FROM''true''::jsonb)THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 h:=public.uc_program_hash(jsonb_build_object(''organization_id'',p_organization_id,''scope'',p_scope,''action'',p_action));PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[a],''request:''||a::text||'':''||p_request_id::text);
 SELECT *INTO req FROM public.uc_education_issuance_requests WHERE actor_id=a AND request_id=p_request_id;
 IF req.request_id IS NOT NULL THEN IF req.organization_id<>p_organization_id OR req.scope IS DISTINCT FROM p_scope OR req.action<>op OR req.payload_hash<>h THEN PERFORM public.uc_education_issue_error(''REQUEST_CONFLICT'');END IF;
 PERFORM public.uc_education_issue_fence(p_organization_id,g,req.participant_ids);RETURN public.uc_education_mutation_result(p_organization_id,p_scope,req.receipt,true);END IF;
 IF op=''withdraw_enrollments''THEN IF NOT public.uc_admission_shape(p_action,ARRAY[''action'',''intent'',''preview_hash'',''items'',''reason''])THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 result:=public.uc_education_withdraw_apply(p_organization_id,g,p_action->''intent'',p_action->>''preview_hash'',p_action->''items'',p_action->>''reason'');records:=result->''record_ids'';enrollments:=result->''enrollment_ids'';events:=result->''event_ids'';
 ELSIF op=''apply_change''AND p_action->''change''->>''action''<>''issue_duplicate''THEN
 IF NOT public.uc_admission_shape(p_action,ARRAY[''action'',''preview_hash'',''change''])THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;result:=public.uc_education_change_apply(p_organization_id,g,p_action->''change'',p_action->>''preview_hash'');records:=result->''record_ids'';enrollments:=result->''enrollment_ids'';events:=result->''event_ids'';
 ELSE
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_organization_id::text,0))THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;
 IF op=''issue_batch''THEN
 IF NOT public.uc_admission_shape(p_action,ARRAY[''action'',''intent'',''preview_hash'',''items'',''reason''])OR NOT public.uc_admission_text(p_action->''reason'',2000)OR jsonb_typeof(p_action->''items'')IS DISTINCT FROM''array''OR jsonb_array_length(p_action->''items'')NOT BETWEEN 1 AND 100 THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 preview:=public.uc_education_issue_preview(p_organization_id,g,p_action->''intent'',true);IF preview->''ready''IS DISTINCT FROM''true''::jsonb OR preview->>''preview_hash''IS DISTINCT FROM p_action->>''preview_hash''THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;
 IF(SELECT count(DISTINCT value->>''enrollment_id'')FROM jsonb_array_elements(p_action->''items''))<>jsonb_array_length(p_action->''items'')OR(SELECT jsonb_agg(value->''enrollment_id''ORDER BY value->>''enrollment_id'')FROM jsonb_array_elements(p_action->''items''))IS DISTINCT FROM(SELECT jsonb_agg(value->''enrollment_id''ORDER BY value->>''enrollment_id'')FROM jsonb_array_elements(preview->''candidates''))THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_action->''items'')ORDER BY value->>''enrollment_id''LOOP
 IF NOT public.uc_admission_shape(x,ARRAY[''enrollment_id'',''expected_eligibility_ref'',''artifact''])OR NOT public.uc_admission_uuid(x->''enrollment_id'')THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 SELECT value INTO selected FROM jsonb_array_elements(preview->''candidates'')WHERE value->''enrollment_id''=x->''enrollment_id'';IF selected->''eligibility_ref''IS DISTINCT FROM x->''expected_eligibility_ref''THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;
 i:=public.uc_education_artifact_final(p_organization_id,g,x->''artifact'');IF i.enrollment_id IS DISTINCT FROM(x->>''enrollment_id'')::uuid OR i.eligibility_ref IS DISTINCT FROM x->''expected_eligibility_ref''OR(prep_id IS NOT NULL AND prep_id<>i.preparation_id)THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;prep_id:=i.preparation_id;
 END LOOP;
 SELECT *INTO prep FROM public.uc_education_issuance_preparations WHERE id=prep_id;
 IF prep.kind<>''original''OR prep.plan->''intent''IS DISTINCT FROM p_action->''intent''OR prep.plan->>''preview_hash''IS DISTINCT FROM p_action->>''preview_hash''OR prep.plan->''reason''IS DISTINCT FROM p_action->''reason''OR(SELECT count(*)FROM public.uc_education_issuance_preparation_items WHERE preparation_id=prep.id)<>jsonb_array_length(p_action->''items'')THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_action->''items'')ORDER BY value->>''enrollment_id''LOOP result:=public.uc_education_issue_one((x->''artifact''->>''item_id'')::uuid,x->''artifact'',p_action->>''reason'');records:=records||jsonb_build_array(result->''record_id'');enrollments:=enrollments||jsonb_build_array(result->''enrollment_id'');events:=events||(result->''event_ids'');END LOOP;
 ELSE
 IF NOT public.uc_admission_shape(p_action,ARRAY[''action'',''preview_hash'',''change''])OR NOT public.uc_admission_shape(p_action->''change'',ARRAY[''action'',''record_id'',''expected_revision'',''expected_state_hash'',''issue_date'',''document_series'',''basis'',''reason'',''artifact''])THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 change:=p_action->''change'';PERFORM 1 FROM public.education_document_records WHERE id=(change->>''record_id'')::uuid AND organization_id=p_organization_id FOR UPDATE;PERFORM 1 FROM public.uc_education_issuance_states WHERE record_id=(change->>''record_id'')::uuid FOR UPDATE;
 preview:=public.uc_education_change_preview(p_organization_id,g,change-''artifact'');IF preview->>''preview_hash''IS DISTINCT FROM p_action->>''preview_hash''THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;
 PERFORM public.uc_education_issue_source_lock(p_organization_id,change->''basis''->''basis''->''source'');i:=public.uc_education_artifact_final(p_organization_id,g,change->''artifact'');SELECT *INTO prep FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF prep.kind<>''duplicate''OR prep.plan->''change''IS DISTINCT FROM(change-''artifact'')OR prep.plan->>''preview_hash''IS DISTINCT FROM p_action->>''preview_hash''THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;
 result:=public.uc_education_issue_one(i.id,change->''artifact'',change->>''reason'');records:=jsonb_build_array(result->''original_record_id'',result->''record_id'');enrollments:=jsonb_build_array(result->''enrollment_id'');events:=result->''event_ids'';
 END IF;END IF;
 SELECT coalesce(array_agg(DISTINCT e.user_id ORDER BY e.user_id),''{}'')INTO people FROM public.enrollments e WHERE e.id IN(SELECT enrollment_value.value::uuid FROM jsonb_array_elements_text(enrollments)AS enrollment_value(value));PERFORM public.uc_education_issue_fence(p_organization_id,g,people);
 receipt:=jsonb_build_object(''request_id'',p_request_id,''action'',op,''scope_hash'',public.uc_program_hash(jsonb_build_object(''organization_id'',p_organization_id,''scope'',p_scope)),''payload_hash'',h,''record_ids'',records,''enrollment_ids'',enrollments,''event_ids'',events,''applied_at'',clock_timestamp(),''replayed'',false);
 INSERT INTO public.uc_education_issuance_requests(actor_id,request_id,organization_id,scope,action,payload_hash,receipt,participant_ids)VALUES(a,p_request_id,p_organization_id,p_scope,op,h,receipt,array_append(people,a));RETURN public.uc_education_mutation_result(p_organization_id,p_scope,receipt,false);
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN RAISE EXCEPTION ''EDUCATION_ISSUANCE_REVISION_CONFLICT'' USING ERRCODE=''PT409'';WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END;$fn$;

CREATE FUNCTION public.uc_education_withdraw_event(p_event uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE e public.uc_enrollment_withdrawal_events;before jsonb;after jsonb;BEGIN SELECT *INTO e FROM public.uc_enrollment_withdrawal_events WHERE id=p_event AND NOT redacted;IF e.id IS NULL THEN RETURN NULL;END IF;
 before:=e.before_state;after:=e.after_state;IF before->''basis''IS NOT NULL AND before->''basis''<>''null''::jsonb THEN before:=jsonb_set(before,''{basis}'',public.uc_education_issue_basis_projection(e.organization_id,before->''basis''));END IF;IF after->''basis''IS NOT NULL AND after->''basis''<>''null''::jsonb THEN after:=jsonb_set(after,''{basis}'',public.uc_education_issue_basis_projection(e.organization_id,after->''basis''));END IF;
 RETURN jsonb_build_object(''id'',e.id,''enrollment_id'',e.enrollment_id,''revision'',e.revision,''kind'',''withdrawn'',''recorded_at'',e.recorded_at,''actor_id'',e.actor_id,''reason'',e.reason,''basis'',public.uc_education_issue_basis_projection(e.organization_id,e.basis),''effective_date'',e.effective_date,''before'',before,''after'',after);END;$fn$;
CREATE FUNCTION public.uc_education_html(p text)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$SELECT replace(replace(replace(replace(replace(coalesce(p,''''),''&'',''&amp;''),''<'',''&lt;''),''>'',''&gt;''),''"'',''&quot;''),'''''''',''&#39;'')$fn$;
CREATE FUNCTION public.uc_education_issue_export(p_org uuid,p_scope jsonb,p_selection jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''AS $fn$
DECLARE g uuid;id jsonb;r jsonb;records jsonb:=''[]'';history jsonb:=''[]'';missing jsonb:=''[]'';selected uuid[]:=''{}'';matches uuid[];candidate uuid;current public.education_document_records;e public.uc_education_issuance_events;snapshot jsonb;snapshot_text text;html text;size bigint;BEGIN
 g:=public.uc_education_issue_scope(p_org,p_scope);IF NOT coalesce((public.uc_education_issue_caps(p_org,g)->>''can_export'')::boolean,false)THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 IF p_selection->>''kind''=''records''THEN IF NOT public.uc_admission_shape(p_selection,ARRAY[''kind'',''record_ids''])OR NOT public.uc_admission_ids(p_selection->''record_ids'',1,1000)THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;SELECT array_agg(x::uuid ORDER BY x::uuid)INTO selected FROM jsonb_array_elements_text(p_selection->''record_ids'')x;
 ELSIF p_selection->>''kind''=''enrollments''THEN
 IF NOT public.uc_admission_shape(p_selection,ARRAY[''kind'',''course_id'',''enrollment_ids''])OR NOT public.uc_admission_uuid(p_selection->''course_id'')OR NOT public.uc_admission_ids(p_selection->''enrollment_ids'',1,1000)THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 FOR id IN SELECT value FROM jsonb_array_elements(p_selection->''enrollment_ids'')ORDER BY value LOOP
 IF NOT EXISTS(SELECT 1 FROM public.enrollments en JOIN public.courses c ON c.id=en.course_id WHERE en.id=(id#>>''{}'')::uuid AND en.course_id=(p_selection->>''course_id'')::uuid AND c.organization_id=p_org AND public.uc_education_issue_can(p_org,g,en.id,en.user_id,en.course_id,''read''))THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 SELECT array_agg(x.id ORDER BY x.id)INTO matches FROM public.education_document_records x WHERE x.organization_id=p_org AND x.enrollment_id=(id#>>''{}'')::uuid AND x.deleted_at IS NULL;
 IF cardinality(matches)>1 THEN PERFORM public.uc_education_issue_error(''REVIEW_REQUIRED'');END IF;
 IF coalesce(cardinality(matches),0)=0 THEN missing:=missing||jsonb_build_array(jsonb_build_object(''enrollment_id'',id,''code'',''NOT_ISSUED''));ELSE r:=public.uc_education_issue_record(p_org,g,matches[1]);IF r IS NULL THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;IF r->>''lifecycle''=''annulled''THEN missing:=missing||jsonb_build_array(jsonb_build_object(''enrollment_id'',id,''code'',''ANNULLED_ONLY''));ELSE selected:=array_append(selected,matches[1]);END IF;END IF;END LOOP;
 ELSE PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 FOREACH candidate IN ARRAY selected LOOP SELECT *INTO current FROM public.education_document_records WHERE public.education_document_records.id=candidate;PERFORM public.uc_education_issue_fence(p_org,g,ARRAY[current.user_id]);r:=public.uc_education_issue_record(p_org,g,candidate);IF r IS NULL THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;records:=records||jsonb_build_array(r);
 FOR e IN SELECT *FROM public.uc_education_issuance_events WHERE record_id=candidate AND organization_id=p_org AND NOT redacted ORDER BY revision LOOP history:=history||jsonb_build_array(public.uc_education_issue_event(e.id));IF jsonb_array_length(history)>10000 THEN PERFORM public.uc_education_issue_error(''LIMIT_EXCEEDED'');END IF;END LOOP;END LOOP;
 snapshot:=jsonb_build_object(''schema_version'',1,''kind'',''education_issuance_snapshot'',''organization_id'',p_org,''scope'',p_scope,''captured_at'',clock_timestamp(),''captured_by'',auth.uid(),''records'',records,''history'',history,''missing'',missing,''not_official_submission'',true);snapshot_text:=snapshot::text;
 html:=''<!doctype html><html lang="ru"><meta charset="utf-8"><title>Реестр документов об обучении</title><style>body{font:14px Arial,sans-serif;color:#19222e}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd1d8;padding:7px;text-align:left;vertical-align:top}small{color:#556070}</style><h1>Реестр документов об обучении</h1><p>Снимок регистрационных фактов. Не является подачей в ФИС ФРДО. Передача подтверждается отдельным событием и основанием.</p><table><thead><tr><th>Документ</th><th>Получатель</th><th>Программа</th><th>Состояние</th><th>Передача</th></tr></thead><tbody>'';
 FOR r IN SELECT value FROM jsonb_array_elements(records)LOOP html:=html||''<tr><td>''||public.uc_education_html(r->''official''->>''document_number'')||''<br>''||public.uc_education_html(r->''official''->>''reg_number'')||''<br>''||public.uc_education_html(r->''official''->>''issue_date'')||''</td><td>''||public.uc_education_html(r->''official''->>''full_name'')||''</td><td>''||public.uc_education_html(r->''official''->>''specialty_name'')||''</td><td>''||public.uc_education_html(CASE r->>''lifecycle''WHEN''annulled''THEN''Аннулирован''ELSE''Действует''END)||''</td><td>''||public.uc_education_html(CASE WHEN r->''latest_handover''IS NULL OR r->''latest_handover''=''null''::jsonb THEN''Передача не зафиксирована''ELSE r->''latest_handover''->''fact''->>''kind''END)||''</td></tr>'';END LOOP;
 html:=html||''</tbody></table><h2>История событий</h2><table><thead><tr><th>Запись / версия</th><th>Время</th><th>Событие</th><th>Основание</th></tr></thead><tbody>'';
 FOR r IN SELECT value FROM jsonb_array_elements(history)LOOP html:=html||''<tr><td>''||public.uc_education_html(r->>''record_id'')||'' / ''||public.uc_education_html(r->>''revision'')||''</td><td>''||public.uc_education_html(r->>''recorded_at'')||''</td><td>''||public.uc_education_html(r->>''kind'')||''</td><td>''||public.uc_education_html(r->>''reason'')||''</td></tr>'';END LOOP;html:=html||''</tbody></table></html>'';
 size:=octet_length(snapshot_text)+octet_length(html);IF size>8388608 THEN PERFORM public.uc_education_issue_error(''LIMIT_EXCEEDED'');END IF;
 RETURN jsonb_build_object(''snapshot_json'',snapshot_text,''snapshot_sha256'',encode(pg_catalog.sha256(convert_to(snapshot_text,''UTF8'')),''hex''),''html'',html,''html_sha256'',encode(pg_catalog.sha256(convert_to(html,''UTF8'')),''hex''),''utf8_bytes'',size);END;$fn$;
CREATE FUNCTION public.read_education_issuance(p_organization_id uuid,p_scope jsonb,p_query jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC''SET lock_timeout=''2000ms'' AS $fn$
<<issuance_read>>
DECLARE g uuid;kind text:=p_query->>''kind'';caps jsonb;base jsonb;lim integer;items jsonb:=''[]'';r jsonb;id uuid;next_id uuid;ceiling bigint;next_revision bigint;before_value bigint;v public.org_document_versions;rv public.org_document_reviews;d public.org_documents;prep public.uc_education_issuance_preparations;summary jsonb;c public.education_document_records;en public.enrollments;event record;filter text;count_items integer;BEGIN
 g:=public.uc_education_issue_scope(p_organization_id,p_scope);PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[auth.uid()]);caps:=public.uc_education_issue_caps(p_organization_id,g);base:=jsonb_build_object(''schema_version'',1,''organization_id'',p_organization_id,''scope'',p_scope,''capabilities'',caps,''kind'',kind);
 IF jsonb_typeof(p_query)IS DISTINCT FROM''object''OR octet_length(p_query::text)>131072 THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 IF kind IN(''withdrawal'',''withdrawal_preview'',''withdrawal_history'')THEN IF caps->''can_read_withdrawal''IS DISTINCT FROM''true''::jsonb AND caps->''can_withdraw''IS DISTINCT FROM''true''::jsonb THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 ELSE IF caps->''can_read''IS DISTINCT FROM''true''::jsonb THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;END IF;
 IF kind IN(''templates'',''preparations'',''candidates'',''records'',''history'',''withdrawal_history'')THEN IF jsonb_typeof(p_query->''limit'')IS DISTINCT FROM''number''OR coalesce(p_query->>''limit'','''')!~''^[0-9]+$''THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;lim:=(p_query->>''limit'')::integer;IF lim NOT BETWEEN 1 AND (CASE WHEN kind=''preparations''THEN 50 ELSE 100 END) THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;END IF;
 IF kind=''preparation''THEN IF NOT public.uc_admission_shape(p_query,ARRAY[''kind'',''preparation_id''])OR NOT public.uc_admission_uuid(p_query->''preparation_id'')THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;prep:=public.uc_education_preparation_access((p_query->>''preparation_id'')::uuid);IF prep.organization_id<>p_organization_id OR prep.scope IS DISTINCT FROM p_scope THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;RETURN base||jsonb_build_object(''preparation'',public.uc_education_preparation_json(prep.id));
 ELSIF kind=''preparations''THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY[''kind'',''after_id'',''limit'',''filter''])OR NOT(p_query->''after_id''=''null''::jsonb OR public.uc_admission_uuid(p_query->''after_id''))OR p_query->>''filter''NOT IN(''all'',''open'',''consumed'')OR caps->''can_issue''IS DISTINCT FROM''true''::jsonb THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 FOR prep IN SELECT *FROM public.uc_education_issuance_preparations WHERE organization_id=p_organization_id AND actor_id=auth.uid()AND scope=p_scope AND NOT redacted AND(p_query->''after_id''=''null''::jsonb OR public.uc_education_issuance_preparations.id>(p_query->>''after_id'')::uuid)ORDER BY public.uc_education_issuance_preparations.id LOOP
 summary:=NULL;SELECT jsonb_build_object(''id'',prep.id,''kind'',prep.kind,''created_at'',prep.created_at,''item_count'',count(*),''prepared_count'',count(*)FILTER(WHERE j->>''status''=''prepared''),''rendered_unissued_count'',count(*)FILTER(WHERE j->>''status''=''rendered_unissued''),''approved_unissued_count'',count(*)FILTER(WHERE j->>''status''=''approved_unissued''),''consumed_count'',count(*)FILTER(WHERE j->>''status''=''consumed''),''stale_count'',count(*)FILTER(WHERE j->>''status''=''stale''))INTO summary FROM public.uc_education_issuance_preparation_items i CROSS JOIN LATERAL(SELECT public.uc_education_preparation_item_json(i.id)j)x WHERE preparation_id=prep.id AND NOT i.redacted;
 IF(summary->>''item_count'')::integer=0 OR(p_query->>''filter''=''open''AND summary->''consumed_count''=summary->''item_count'')OR(p_query->>''filter''=''consumed''AND summary->''consumed_count''<>summary->''item_count'')THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->>''id'')::uuid;EXIT;END IF;items:=items||jsonb_build_array(summary);END LOOP;RETURN base||jsonb_build_object(''items'',items,''next_after_id'',next_id);
 ELSIF kind=''templates''THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY[''kind'',''after_version_id'',''limit''])OR NOT(p_query->''after_version_id''=''null''::jsonb OR public.uc_admission_uuid(p_query->''after_version_id''))OR caps->''can_issue''IS DISTINCT FROM''true''::jsonb THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 FOR v IN SELECT x.*FROM public.org_document_versions x JOIN public.org_documents y ON y.id=x.document_id AND y.current_version_id=x.id AND y.organization_id=x.organization_id WHERE x.organization_id=p_organization_id AND y.deleted_at IS NULL AND coalesce(y.status,''active'')NOT IN(''archived'',''expired'')AND x.file_size BETWEEN 1 AND 1048576 AND lower(split_part(x.storage_metadata->>''mimetype'','';'',1))=''text/html''AND public.uc_copy_registry_object_matches(x)AND(p_query->''after_version_id''=''null''::jsonb OR x.id>(p_query->>''after_version_id'')::uuid)ORDER BY x.id LOOP
 SELECT *INTO rv FROM public.org_document_reviews WHERE document_id=v.document_id AND version_id=v.id AND organization_id=p_organization_id AND state=''approved'';IF rv.id IS NULL OR EXISTS(SELECT 1 FROM public.org_document_review_comments x WHERE x.review_id=rv.id AND x.resolution_status=''accepted''AND x.position_anchor->>''kind''IN(''insert'',''delete'',''replace''))OR public.uc_education_issue_source(p_organization_id,public.uc_copy_registry_original_ref(v),false)IS NULL THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->''template''->''source''->>''version_id'')::uuid;EXIT;END IF;SELECT *INTO d FROM public.org_documents WHERE public.org_documents.id=v.document_id;items:=items||jsonb_build_array(jsonb_build_object(''label'',left(d.name,1000),''template'',jsonb_build_object(''source'',public.uc_copy_registry_original_ref(v),''review_id'',rv.id,''review_revision'',rv.revision)));END LOOP;RETURN base||jsonb_build_object(''items'',items,''next_after_version_id'',next_id);
 ELSIF kind=''preview_issue''THEN IF NOT public.uc_admission_shape(p_query,ARRAY[''kind'',''intent''])THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;RETURN base||jsonb_build_object(''preview'',public.uc_education_issue_preview(p_organization_id,g,p_query->''intent''));
 ELSIF kind=''preview_change''THEN IF NOT public.uc_admission_shape(p_query,ARRAY[''kind'',''change''])THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;RETURN base||jsonb_build_object(''preview'',public.uc_education_change_preview(p_organization_id,g,p_query->''change''));
 ELSIF kind=''candidates''THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY[''kind'',''course_id'',''after_enrollment_id'',''limit'',''filter''])OR NOT public.uc_admission_uuid(p_query->''course_id'')OR NOT(p_query->''after_enrollment_id''=''null''::jsonb OR public.uc_admission_uuid(p_query->''after_enrollment_id''))OR p_query->>''filter''NOT IN(''all'',''ready'',''blocked'',''already_issued'')OR NOT EXISTS(SELECT 1 FROM public.courses WHERE public.courses.id=(p_query->>''course_id'')::uuid AND organization_id=p_organization_id)THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 FOR en IN SELECT *FROM public.enrollments WHERE course_id=(p_query->>''course_id'')::uuid AND(p_query->''after_enrollment_id''=''null''::jsonb OR public.enrollments.id>(p_query->>''after_enrollment_id'')::uuid)ORDER BY public.enrollments.id LOOP
 IF NOT public.uc_education_issue_can(p_organization_id,g,en.id,en.user_id,en.course_id,''read'')THEN CONTINUE;END IF;PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[en.user_id]);r:=public.uc_education_issue_candidate(p_organization_id,g,en.id);IF r IS NULL OR(p_query->>''filter''=''ready''AND r->''eligibility_ref''=''null''::jsonb)OR(p_query->>''filter''=''blocked''AND r->''eligibility_ref''<>''null''::jsonb)OR(p_query->>''filter''=''already_issued''AND r->''existing_original_record_id''=''null''::jsonb)THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->>''enrollment_id'')::uuid;EXIT;END IF;items:=items||jsonb_build_array(r);END LOOP;RETURN base||jsonb_build_object(''course_id'',p_query->''course_id'',''items'',items,''next_after_enrollment_id'',next_id);
 ELSIF kind=''records''THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY[''kind'',''course_id'',''after_id'',''limit'',''filter''])OR NOT(p_query->''course_id''=''null''::jsonb OR public.uc_admission_uuid(p_query->''course_id''))OR NOT(p_query->''after_id''=''null''::jsonb OR public.uc_admission_uuid(p_query->''after_id''))OR p_query->>''filter''NOT IN(''all'',''active'',''annulled'',''legacy_unverified'')THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 FOR c IN SELECT *FROM public.education_document_records WHERE organization_id=p_organization_id AND deleted_at IS NULL AND(p_query->''course_id''=''null''::jsonb OR course_id=(p_query->>''course_id'')::uuid)AND(p_query->''after_id''=''null''::jsonb OR public.education_document_records.id>(p_query->>''after_id'')::uuid)ORDER BY public.education_document_records.id LOOP
 IF NOT public.uc_education_issue_can(p_organization_id,coalesce(g,c.group_id),c.enrollment_id,c.user_id,c.course_id,''read'')THEN CONTINUE;END IF;PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[c.user_id]);r:=public.uc_education_issue_record(p_organization_id,g,c.id);IF r IS NULL OR(p_query->>''filter''IN(''active'',''annulled'')AND r->>''lifecycle''<>p_query->>''filter'')OR(p_query->>''filter''=''legacy_unverified''AND r->>''provenance''<>''legacy_unverified'')THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->''official''->>''id'')::uuid;EXIT;END IF;items:=items||jsonb_build_array(r);END LOOP;RETURN base||jsonb_build_object(''items'',items,''next_after_id'',next_id);
 ELSIF kind IN(''record'',''history'')THEN
 IF NOT public.uc_admission_uuid(p_query->''record_id'')OR NOT(CASE WHEN kind=''record''THEN public.uc_admission_shape(p_query,ARRAY[''kind'',''record_id''])ELSE public.uc_admission_shape(p_query,ARRAY[''kind'',''record_id'',''ceiling_revision'',''before_revision'',''limit''])END)THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;id:=(p_query->>''record_id'')::uuid;r:=public.uc_education_issue_record(p_organization_id,g,id);IF r IS NULL THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[(r->''official''->>''user_id'')::uuid]);
 IF kind=''record''THEN RETURN base||jsonb_build_object(''record'',r);END IF;
 ceiling:=(r->>''revision'')::bigint;IF p_query->''ceiling_revision''<>''null''::jsonb THEN IF coalesce(p_query->>''ceiling_revision'','''')!~''^[0-9]+$''OR(p_query->>''ceiling_revision'')::bigint>ceiling THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;ceiling:=(p_query->>''ceiling_revision'')::bigint;END IF;
 IF p_query->''before_revision''<>''null''::jsonb THEN IF coalesce(p_query->>''before_revision'','''')!~''^[0-9]+$''OR(p_query->>''before_revision'')::bigint<1 THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;before_value:=(p_query->>''before_revision'')::bigint;END IF;
 FOR event IN SELECT x.id,x.revision FROM public.uc_education_issuance_events x WHERE x.organization_id=p_organization_id AND x.record_id=issuance_read.id AND NOT x.redacted AND x.revision<=ceiling AND(before_value IS NULL OR x.revision<before_value)ORDER BY x.revision DESC LIMIT lim+1 LOOP IF jsonb_array_length(items)=lim THEN next_revision:=(items->-1->>''revision'')::bigint;EXIT;END IF;items:=items||jsonb_build_array(public.uc_education_issue_event(event.id));END LOOP;
 RETURN base||jsonb_build_object(''record_id'',id,''ceiling_revision'',ceiling,''items'',items,''next_before_revision'',next_revision);
 ELSIF kind IN(''withdrawal'',''withdrawal_preview'',''withdrawal_history'')THEN
 IF kind=''withdrawal_preview''THEN IF NOT public.uc_admission_shape(p_query,ARRAY[''kind'',''intent''])THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;RETURN base||jsonb_build_object(''preview'',public.uc_education_withdraw_intent(p_organization_id,g,p_query->''intent''));END IF;
 IF NOT public.uc_admission_uuid(p_query->''enrollment_id'')OR NOT(CASE WHEN kind=''withdrawal''THEN public.uc_admission_shape(p_query,ARRAY[''kind'',''enrollment_id''])ELSE public.uc_admission_shape(p_query,ARRAY[''kind'',''enrollment_id'',''ceiling_revision'',''before_revision'',''limit''])END)THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;id:=(p_query->>''enrollment_id'')::uuid;r:=public.uc_education_withdraw_state(p_organization_id,g,id);PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[(r->''ref''->>''user_id'')::uuid]);IF kind=''withdrawal''THEN RETURN base||jsonb_build_object(''state'',r);END IF;
 ceiling:=(r->''ref''->>''revision'')::bigint;IF p_query->''ceiling_revision''<>''null''::jsonb THEN IF coalesce(p_query->>''ceiling_revision'','''')!~''^[0-9]+$''OR(p_query->>''ceiling_revision'')::bigint>ceiling THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;ceiling:=(p_query->>''ceiling_revision'')::bigint;END IF;
 IF p_query->''before_revision''<>''null''::jsonb THEN IF coalesce(p_query->>''before_revision'','''')!~''^[0-9]+$''OR(p_query->>''before_revision'')::bigint<1 THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;before_value:=(p_query->>''before_revision'')::bigint;END IF;
 FOR event IN SELECT x.id,x.revision FROM public.uc_enrollment_withdrawal_events x WHERE x.organization_id=p_organization_id AND x.enrollment_id=issuance_read.id AND NOT x.redacted AND x.revision<=ceiling AND(before_value IS NULL OR x.revision<before_value)ORDER BY x.revision DESC LIMIT lim+1 LOOP IF jsonb_array_length(items)=lim THEN next_revision:=(items->-1->>''revision'')::bigint;EXIT;END IF;items:=items||jsonb_build_array(public.uc_education_withdraw_event(event.id));END LOOP;RETURN base||jsonb_build_object(''enrollment_id'',id,''ceiling_revision'',ceiling,''items'',items,''next_before_revision'',next_revision);
 ELSIF kind=''export''THEN IF NOT public.uc_admission_shape(p_query,ARRAY[''kind'',''selection'',''format''])OR p_query->>''format''IS DISTINCT FROM''canonical_snapshot''THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;RETURN base||jsonb_build_object(''artifact'',public.uc_education_issue_export(p_organization_id,p_scope,p_query->''selection''));
 ELSE PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END IF;
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN RAISE EXCEPTION ''EDUCATION_ISSUANCE_REVISION_CONFLICT'' USING ERRCODE=''PT409'';WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_education_issue_error(''INVALID_INPUT'');END;$fn$;

CREATE FUNCTION public.uc_education_output_slot(p_document uuid,p_org uuid,p_request uuid,p_expected bigint,p_upload jsonb,p_restore uuid,p_document_data jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;expected jsonb;BEGIN
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE output_document_id=p_document;
 IF i.id IS NULL THEN RETURN;END IF;SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF i.redacted OR p.redacted OR i.user_id IS NULL OR p.actor_id IS DISTINCT FROM auth.uid()OR i.organization_id IS DISTINCT FROM p_org OR i.output_request_id IS DISTINCT FROM p_request OR p_expected IS DISTINCT FROM 0 OR p_restore IS NOT NULL OR i.staging_proof IS NULL OR NOT public.uc_education_artifact_actor(auth.uid(),p_org,i.group_id,i.user_id,i.enrollment_id)THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 PERFORM public.uc_education_issue_fence(p_org,i.group_id,ARRAY[i.user_id,p.actor_id]);
 expected:=jsonb_build_object(''file_path'',p_org::text||''/versions/''||i.output_document_id::text||''/''||i.output_request_id::text||''.pdf'',''file_name'',''education-document.pdf'',''file_size'',i.staging_proof->''byte_size'',''change_summary'',''Сформирован проверенный PDF; выдача ещё не зарегистрирована.'');
 IF p_upload IS DISTINCT FROM expected OR p_document_data IS DISTINCT FROM jsonb_build_object(''name'',''Проверенный документ — выдача ещё не зарегистрирована'',''type'',''other'',''issue_date'',i.number_plan->''issue_date'',''status'',''active'')THEN PERFORM public.uc_education_issue_error(''SOURCE_CHANGED'');END IF;END;$fn$;
-- The provider computes path_tokens after BEFORE triggers, and its existing
-- timestamp trigger runs before the final protected-output guard. Neither
-- derived path tokens nor read bookkeeping may replace a frozen byte witness.
DO $output_storage_preimage$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=''storage.objects''::regclass AND a.attname=''path_tokens''AND NOT a.attisdropped AND a.attgenerated=''s''AND a.attidentity=''''AND NOT a.attnotnull AND format_type(a.atttypid,a.atttypmod)=''text[]''AND pg_get_expr(d.adbin,d.adrelid)=''string_to_array(name, ''''/''''::text)'')
 OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=''storage.update_updated_at_column()''::regprocedure AND md5(p.prosrc)=''7596e66a7698d5a6b5129c5ce9b24c5f''AND NOT p.prosecdef AND p.proconfig IS NULL AND l.lanname=''plpgsql'')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=''storage.objects''::regclass AND t.tgname=''update_objects_updated_at''AND NOT t.tgisinternal AND t.tgenabled=''O''AND t.tgtype=19 AND pg_get_triggerdef(t.oid,true)=''CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column()'')
 THEN RAISE EXCEPTION ''EDUCATION_OUTPUT_STORAGE_PREIMAGE_CHANGED'' USING ERRCODE=''55000'';END IF;
END;
$output_storage_preimage$;
CREATE FUNCTION public.uc_education_output_storage_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;size_text text;BEGIN
 IF TG_OP=''UPDATE''THEN
 IF EXISTS(SELECT 1 FROM public.uc_education_issuance_preparation_items x WHERE(OLD.bucket_id=''org-documents''AND OLD.name=x.organization_id::text||''/versions/''||x.output_document_id::text||''/''||x.output_request_id::text||''.pdf'')OR(NEW.bucket_id=''org-documents''AND NEW.name=x.organization_id::text||''/versions/''||x.output_document_id::text||''/''||x.output_request_id::text||''.pdf''))THEN IF(to_jsonb(OLD)-ARRAY[''last_accessed_at'',''updated_at'',''path_tokens''])IS NOT DISTINCT FROM(to_jsonb(NEW)-ARRAY[''last_accessed_at'',''updated_at'',''path_tokens''])THEN NEW.updated_at:=OLD.updated_at;RETURN NEW;END IF;RAISE EXCEPTION ''prepared_education_output_is_immutable'' USING ERRCODE=''42501'';END IF;RETURN NEW;END IF;
 IF NEW.bucket_id<>''org-documents''THEN RETURN NEW;END IF;
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items x WHERE NEW.name=x.organization_id::text||''/versions/''||x.output_document_id::text||''/''||x.output_request_id::text||''.pdf'';IF i.id IS NULL THEN RETURN NEW;END IF;
 SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 -- Opaque output slot IDs survive redaction so an already in-flight issuer
 -- cannot recreate a subject''s PDF after its privacy transaction committed.
 IF i.redacted OR p.redacted OR i.user_id IS NULL OR i.final_record_id IS NOT NULL OR i.staging_proof IS NULL OR auth.role()IS DISTINCT FROM''authenticated''OR auth.uid()IS DISTINCT FROM p.actor_id OR NOT public.uc_education_artifact_actor(p.actor_id,i.organization_id,i.group_id,i.user_id,i.enrollment_id)THEN RAISE EXCEPTION ''prepared_education_output_context_unavailable'' USING ERRCODE=''42501'';END IF;
 PERFORM public.uc_education_issue_fence(i.organization_id,i.group_id,ARRAY[i.user_id,p.actor_id]);
 size_text:=coalesce(NEW.metadata->>''size'',NEW.metadata->>''contentLength'');IF size_text IS NULL OR size_text!~''^[0-9]+$''OR size_text::numeric IS DISTINCT FROM(i.staging_proof->>''byte_size'')::numeric OR NEW.metadata->>''mimetype''IS DISTINCT FROM''application/pdf''THEN RAISE EXCEPTION ''prepared_education_output_metadata_mismatch'' USING ERRCODE=''22023'';END IF;RETURN NEW;END;$fn$;
CREATE TRIGGER zz_uc_education_output_object_boundary BEFORE INSERT OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.uc_education_output_storage_guard();

CREATE FUNCTION public.uc_education_actor_json(p_json jsonb,p_user uuid,p_redact boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE out jsonb;entry record;v jsonb;BEGIN IF p_json IS NULL THEN RETURN NULL;END IF;
 IF jsonb_typeof(p_json)=''object''THEN out:=''{}'';FOR entry IN SELECT key,value FROM jsonb_each(p_json)LOOP
 IF entry.key=ANY(ARRAY[''actor_id'',''recorded_by'',''created_by'',''updated_by'',''approved_by'',''reviewer_user_id'',''captured_by'',''uploaded_by''])AND entry.value=to_jsonb(p_user)THEN IF p_redact THEN v:=''null'';ELSE RETURN''true'';END IF;
 ELSE v:=public.uc_education_actor_json(entry.value,p_user,p_redact);IF NOT p_redact AND v=''true''::jsonb THEN RETURN''true'';END IF;END IF;
 IF p_redact THEN out:=out||jsonb_build_object(entry.key,v);END IF;END LOOP;RETURN CASE WHEN p_redact THEN out ELSE''false''::jsonb END;
 ELSIF jsonb_typeof(p_json)=''array''THEN out:=''[]'';FOR v IN SELECT value FROM jsonb_array_elements(p_json)LOOP v:=public.uc_education_actor_json(v,p_user,p_redact);IF NOT p_redact AND v=''true''::jsonb THEN RETURN''true'';END IF;IF p_redact THEN out:=out||jsonb_build_array(v);END IF;END LOOP;RETURN CASE WHEN p_redact THEN out ELSE''false''::jsonb END;
 ELSE RETURN CASE WHEN p_redact THEN p_json ELSE''false''::jsonb END;END IF;END;$fn$;
CREATE FUNCTION public.uc_education_personal_counts(p_user uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object(''table'',t,''column'',c,''count'',n)ORDER BY t,c),''[]''::jsonb)FROM(
 SELECT''uc_education_issuance_states''::text t,''subject_or_actor_attribution''::text c,count(*)n FROM public.uc_education_issuance_states s WHERE s.user_id=p_user OR s.recorded_by=p_user OR s.updated_by=p_user OR p_user=ANY(s.participant_ids)OR public.uc_education_actor_json(s.latest_handover,p_user)=''true''::jsonb OR public.uc_education_actor_json(s.annulment,p_user)=''true''::jsonb
 UNION ALL SELECT''uc_education_issuance_events'',''subject_or_actor_attribution'',count(*)FROM public.uc_education_issuance_events e WHERE e.user_id=p_user OR e.actor_id=p_user OR p_user=ANY(e.participant_ids)OR public.uc_education_actor_json(e.payload,p_user)=''true''::jsonb
 UNION ALL SELECT''uc_enrollment_withdrawal_states'',''subject_or_actor_attribution'',count(*)FROM public.uc_enrollment_withdrawal_states w WHERE w.user_id=p_user OR w.recorded_by=p_user OR p_user=ANY(w.participant_ids)OR public.uc_education_actor_json(w.technical_snapshot,p_user)=''true''::jsonb
 UNION ALL SELECT''uc_enrollment_withdrawal_events'',''subject_or_actor_attribution'',count(*)FROM public.uc_enrollment_withdrawal_events e WHERE e.user_id=p_user OR e.actor_id=p_user OR p_user=ANY(e.participant_ids)OR public.uc_education_actor_json(e.before_state,p_user)=''true''::jsonb OR public.uc_education_actor_json(e.after_state,p_user)=''true''::jsonb
 UNION ALL SELECT''uc_education_issuance_requests'',''subject_or_actor_attribution'',count(*)FROM public.uc_education_issuance_requests r WHERE r.actor_id=p_user OR p_user=ANY(r.participant_ids)
 UNION ALL SELECT''uc_education_issuance_contexts'',''subject_or_actor_attribution'',count(*)FROM public.uc_education_issuance_contexts x WHERE x.user_id=p_user OR x.actor_id=p_user OR public.uc_education_actor_json(x.source_snapshot,p_user)=''true''::jsonb
 UNION ALL SELECT''uc_education_issuance_preparations'',''subject_or_actor_attribution'',count(*)FROM public.uc_education_issuance_preparations p WHERE p.actor_id=p_user OR p_user=ANY(p.participant_ids)OR public.uc_education_actor_json(p.plan,p_user)=''true''::jsonb
 UNION ALL SELECT''uc_education_issuance_preparation_items'',''subject_or_actor_attribution'',count(*)FROM public.uc_education_issuance_preparation_items i WHERE i.user_id=p_user OR p_user=ANY(i.participant_ids)OR public.uc_education_actor_json(i.source_snapshot,p_user)=''true''::jsonb
 UNION ALL SELECT''uc_education_issuance_preparation_items'',''retained_subject_output_reference_review_required'',count(*)FROM public.uc_education_issuance_preparation_items i WHERE i.retained_subject_user_id=p_user
 )counts WHERE n>0 $fn$;
CREATE FUNCTION public.uc_education_erase_user(p_user uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE prep_ids uuid[];record_ids uuid[];remaining jsonb;BEGIN
 IF NOT public.uc_education_trusted_erasure(p_user)THEN PERFORM public.uc_education_issue_error(''ACCESS_DENIED'');END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_user::text,42007))THEN PERFORM public.uc_education_issue_error(''REVISION_CONFLICT'');END IF;
 SELECT coalesce(array_agg(DISTINCT preparation_id),''{}'')INTO prep_ids FROM public.uc_education_issuance_preparation_items WHERE user_id=p_user OR retained_subject_user_id=p_user;
 SELECT coalesce(array_agg(DISTINCT record_id),''{}'')INTO record_ids FROM public.uc_education_issuance_states WHERE user_id=p_user;
 DELETE FROM public.uc_education_issuance_requests WHERE actor_id=p_user OR p_user=ANY(participant_ids);
 DELETE FROM public.uc_education_issuance_contexts WHERE user_id=p_user OR actor_id=p_user;
 UPDATE public.uc_education_issuance_events SET user_id=NULL,actor_id=NULL,reason='''',payload=''{}'',participant_ids=''{}'',redacted=true WHERE user_id=p_user OR record_id=ANY(record_ids);
 UPDATE public.uc_education_issuance_states SET user_id=NULL,proof=NULL,artifact=NULL,frdo_facts=NULL,notes='''',annulment=NULL,latest_handover=NULL,recorded_by=NULL,updated_by=NULL,participant_ids=''{}'',redacted=true WHERE user_id=p_user;
 UPDATE public.uc_enrollment_withdrawal_events SET user_id=NULL,actor_id=NULL,reason='''',basis=''{}'',before_state=''{}'',after_state=''{}'',participant_ids=''{}'',redacted=true WHERE user_id=p_user;
 UPDATE public.uc_enrollment_withdrawal_states SET user_id=NULL,basis=''{}'',technical_snapshot=''{}'',recorded_by=NULL,participant_ids=''{}'',redacted=true WHERE user_id=p_user;
 -- Keep only the exact typed output subject binding when a real object still
 -- exists. This is a retained personal reference requiring UC024 review, never
 -- an anonymous or fully erased file. Opaque path IDs always survive to deny
 -- late uploads; no bytes, retention basis or duration are invented here.
 UPDATE public.uc_education_issuance_preparation_items i SET retained_subject_user_id=CASE WHEN EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=''org-documents''AND o.name=i.organization_id::text||''/versions/''||i.output_document_id::text||''/''||i.output_request_id::text||''.pdf'')THEN coalesce(i.retained_subject_user_id,i.user_id)END,user_id=NULL,eligibility_ref=''{}'',source_snapshot=''{}'',official_identity=''{}'',frdo_facts=''{}'',render_variables=''{}'',staging_proof=NULL,artifact=NULL,participant_ids=''{}'',redacted=true WHERE preparation_id=ANY(prep_ids);
 UPDATE public.uc_education_issuance_preparations SET actor_id=NULL,plan=''{}'',template=''{}'',template_storage=''{}'',template_byte_sha256=NULL,number_witness=''{}'',participant_ids=''{}'',redacted=true WHERE id=ANY(prep_ids);
 -- Actor-only deletion preserves every other pupil''s registration, source,
 -- numbers, artifact bytes and factual result; only attribution is removed.
 UPDATE public.uc_education_issuance_states SET recorded_by=CASE WHEN recorded_by=p_user THEN NULL ELSE recorded_by END,updated_by=CASE WHEN updated_by=p_user THEN NULL ELSE updated_by END,participant_ids=array_remove(participant_ids,p_user),latest_handover=public.uc_education_actor_json(latest_handover,p_user,true),annulment=public.uc_education_actor_json(annulment,p_user,true)WHERE recorded_by=p_user OR updated_by=p_user OR p_user=ANY(participant_ids)OR public.uc_education_actor_json(latest_handover,p_user)=''true''::jsonb OR public.uc_education_actor_json(annulment,p_user)=''true''::jsonb;
 UPDATE public.uc_education_issuance_events SET actor_id=CASE WHEN actor_id=p_user THEN NULL ELSE actor_id END,participant_ids=array_remove(participant_ids,p_user),payload=public.uc_education_actor_json(payload,p_user,true)WHERE actor_id=p_user OR p_user=ANY(participant_ids)OR public.uc_education_actor_json(payload,p_user)=''true''::jsonb;
 UPDATE public.uc_enrollment_withdrawal_states SET recorded_by=CASE WHEN recorded_by=p_user THEN NULL ELSE recorded_by END,participant_ids=array_remove(participant_ids,p_user),technical_snapshot=public.uc_education_actor_json(technical_snapshot,p_user,true)WHERE recorded_by=p_user OR p_user=ANY(participant_ids)OR public.uc_education_actor_json(technical_snapshot,p_user)=''true''::jsonb;
 UPDATE public.uc_enrollment_withdrawal_events SET actor_id=CASE WHEN actor_id=p_user THEN NULL ELSE actor_id END,participant_ids=array_remove(participant_ids,p_user),before_state=public.uc_education_actor_json(before_state,p_user,true),after_state=public.uc_education_actor_json(after_state,p_user,true)WHERE actor_id=p_user OR p_user=ANY(participant_ids)OR public.uc_education_actor_json(before_state,p_user)=''true''::jsonb OR public.uc_education_actor_json(after_state,p_user)=''true''::jsonb;
 UPDATE public.uc_education_issuance_preparations SET actor_id=CASE WHEN actor_id=p_user THEN NULL ELSE actor_id END,participant_ids=array_remove(participant_ids,p_user),plan=public.uc_education_actor_json(plan,p_user,true)WHERE actor_id=p_user OR p_user=ANY(participant_ids)OR public.uc_education_actor_json(plan,p_user)=''true''::jsonb;
 UPDATE public.uc_education_issuance_preparation_items SET participant_ids=array_remove(participant_ids,p_user),source_snapshot=public.uc_education_actor_json(source_snapshot,p_user,true)WHERE p_user=ANY(participant_ids)OR public.uc_education_actor_json(source_snapshot,p_user)=''true''::jsonb;
 remaining:=public.uc_education_personal_counts(p_user);IF EXISTS(SELECT 1 FROM jsonb_array_elements(remaining)x WHERE x->>''column''<>''retained_subject_output_reference_review_required'')THEN PERFORM public.uc_education_issue_error(''DEPENDENCY_UNAVAILABLE'');END IF;END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_scoped_journal_personal_counts(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public''
AS $function$
 SELECT(
 SELECT(
 SELECT(
 SELECT coalesce(jsonb_agg(jsonb_build_object(''table'',count_row.table_name,''column'',count_row.column_name,''count'',count_row.n) ORDER BY count_row.table_name),''[]''::jsonb) FROM(
  SELECT ''uc_scoped_journal_contexts''::text table_name,''created_by''::text column_name,count(*) n FROM public.uc_scoped_journal_contexts c WHERE c.created_by=p_user
  UNION ALL SELECT ''uc_scoped_journal_records'',''participant_ids'',count(*) FROM public.uc_scoped_journal_records r WHERE p_user=ANY(r.participant_ids) OR r.subject_user_id=p_user OR r.recorded_by=p_user OR r.created_by=p_user
  UNION ALL SELECT ''uc_scoped_journal_history'',''participant_ids'',count(*) FROM public.uc_scoped_journal_history h WHERE p_user=ANY(h.participant_ids) OR h.subject_user_id=p_user OR h.recorded_by=p_user
  UNION ALL SELECT ''uc_scoped_journal_requests'',''participant_ids'',count(*) FROM public.uc_scoped_journal_requests request_row WHERE p_user=ANY(request_row.participant_ids) OR request_row.actor_id=p_user
  UNION ALL SELECT ''uc_scoped_journal_exports'',''participant_ids'',count(*) FROM public.uc_scoped_journal_exports e WHERE p_user=ANY(e.participant_ids) OR e.recorded_by=p_user
 ) count_row WHERE count_row.n>0
)||public.uc_copy_registry_personal_counts(p_user)
)||public.uc_document_registry_personal_counts(p_user)
)||public.uc_education_personal_counts(p_user)
$function$;

CREATE OR REPLACE FUNCTION public.uc_scoped_journal_erase_user(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''pg_catalog'', ''public''
AS $function$
BEGIN
 IF auth.role() IS DISTINCT FROM ''service_role'' OR current_setting(''sintagma.account_deletion_erase_user'',true) IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations rev WHERE rev.user_id=p_user) THEN PERFORM public.uc_custom_journal_error(''ACCESS_DENIED'');END IF;
 PERFORM public.uc_education_erase_user(p_user);
 PERFORM public.uc_copy_registry_erase_user(p_user);
 PERFORM public.uc_document_registry_erase_user(p_user);
 -- Every copied personal export is invalidated, never silently re-rendered under an old hash.
 DELETE FROM public.uc_scoped_journal_exports e WHERE e.recorded_by=p_user OR p_user=ANY(e.participant_ids);
 DELETE FROM public.uc_scoped_journal_requests request_row WHERE request_row.actor_id=p_user OR p_user=ANY(request_row.participant_ids);
 DELETE FROM public.uc_scoped_journal_history h WHERE h.subject_user_id=p_user;
 DELETE FROM public.uc_scoped_journal_records r WHERE r.subject_user_id=p_user;
 -- Conservatively redact an entire attributed copy, including nonpersonal-author text.
 -- No universal discovery of undeclared third-party personal data in free text is claimed.
 UPDATE public.uc_scoped_journal_history SET recorded_by=NULL,subject_user_id=NULL,subject_label=NULL,field_values=''{}'',source=''{"kind":"none"}'',reason='''',participant_ids=''{}'',redacted=true
  WHERE recorded_by=p_user OR p_user=ANY(participant_ids);
 UPDATE public.uc_scoped_journal_records SET recorded_by=NULL,created_by=NULL,subject_user_id=NULL,subject_label=NULL,field_values=''{}'',source=''{"kind":"none"}'',participant_ids=''{}'',redacted=true
  WHERE recorded_by=p_user OR created_by=p_user OR p_user=ANY(participant_ids);
 UPDATE public.uc_scoped_journal_contexts SET created_by=NULL WHERE created_by=p_user;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.uc_education_personal_counts(p_user))x WHERE x->>''column''=''retained_subject_output_reference_review_required'')THEN RAISE EXCEPTION ''EDUCATION_ARTIFACT_RETENTION_REVIEW_REQUIRED'' USING ERRCODE=''P0001'';END IF;
 IF public.uc_scoped_journal_personal_counts(p_user)<>''[]''::jsonb THEN PERFORM public.uc_custom_journal_error(''DEPENDENCY_UNAVAILABLE'');END IF;
END;$function$;

-- Every new helper is private even under hostile default grants.
DO $acl$DECLARE f record;BEGIN FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=''public''AND p.proname=ANY(ARRAY[''uc_education_issue_error'',''uc_enrollment_is_withdrawn'',''uc_education_issue_actor'',''uc_education_issue_scope'',''uc_education_issue_can'',''uc_education_withdraw_can'',''uc_education_issue_caps'',''uc_education_issue_fence'',''uc_education_issue_source'',''uc_education_issue_source_projection'',''uc_education_issue_basis_projection'',''uc_education_number_witness'',''uc_education_prospective_numbers'',''uc_education_issue_source_lock'',''uc_education_template'',''uc_education_admission_definition_shape'',''uc_education_admission_evidence_shape'',''uc_education_admission_reviews'',''uc_education_admission_digest'',''uc_education_admission_review_check'',''uc_education_admission_conditions'',''uc_education_trusted_erasure'',''uc_education_withdraw_state'',''uc_education_withdraw_intent'',''uc_guard_retained_enrollment'',''uc_guard_retained_learner_activity'',''uc_education_retained_learning_summary'',''uc_education_issue_admission'',''uc_education_issue_block'',''uc_education_issue_candidate'',''uc_education_issue_enrollment_fence'',''uc_education_issue_proof_visible'',''uc_education_issue_handover_projection'',''uc_education_issue_artifact_projection'',''uc_education_issue_state_hash'',''uc_education_issue_record'',''uc_education_issue_event'',''uc_education_actor_org_permission'',''uc_education_artifact_actor'',''uc_education_template_current'',''uc_education_withdraw_apply'',''uc_education_issue_preview'',''uc_education_replacement_identity'',''uc_education_handover_check'',''uc_education_change_preview'',''uc_education_frdo_snapshot'',''uc_education_render_variables'',''uc_education_canonical_boundary'',''uc_education_saved_output_counts'',''uc_education_staging_storage_guard'',''uc_education_preparation_access'',''uc_education_output_approval'',''uc_education_preparation_item_json'',''uc_education_preparation_json'',''prepare_education_issuance_artifacts'',''uc_education_artifact_live'',''uc_education_artifact_saved_source'',''uc_education_artifact_context_json'',''uc_education_artifact_context'',''uc_education_artifact_service_request'',''uc_education_artifact_attest_shape'',''uc_attest_education_issuance_staging'',''uc_attest_education_issuance_artifact'',''uc_education_artifact_final'',''uc_education_issue_one'',''uc_education_change_apply'',''uc_education_mutation_result'',''apply_education_issuance_action'',''uc_education_withdraw_event'',''uc_education_html'',''uc_education_issue_export'',''read_education_issuance'',''uc_education_output_slot'',''uc_education_output_storage_guard'',''uc_education_actor_json'',''uc_education_personal_counts'',''uc_education_erase_user''])LOOP EXECUTE format(''REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role'',f.oid::regprocedure);END LOOP;END;$acl$;
GRANT EXECUTE ON FUNCTION public.read_education_issuance(uuid,jsonb,jsonb),public.apply_education_issuance_action(uuid,jsonb,uuid,jsonb),public.prepare_education_issuance_artifacts(uuid,jsonb,uuid,jsonb),public.uc_education_artifact_context(uuid,uuid,uuid,bigint,uuid)TO authenticated;
GRANT EXECUTE ON FUNCTION public.uc_attest_education_issuance_staging(uuid,uuid,uuid,uuid,bigint,uuid,jsonb),public.uc_attest_education_issuance_artifact(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)TO service_role;
REVOKE EXECUTE ON FUNCTION public.issue_education_document_batch(uuid,uuid,uuid,jsonb)FROM PUBLIC,anon,authenticated,service_role;

-- Provider default grants are inherited at CREATE time. Close only these new
-- private objects; preserve every old object grant and global default ACL.
DO $provider_acl$
DECLARE provider_role text;target_signature text;target_table text;BEGIN
 FOREACH provider_role IN ARRAY ARRAY[''sandbox_exec_atxwvjxbqjgkbjlhsdch'',''sandbox_exec'']LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=provider_role)THEN
   FOREACH target_signature IN ARRAY ARRAY[''public.apply_education_issuance_action(uuid,jsonb,uuid,jsonb)'',''public.prepare_education_issuance_artifacts(uuid,jsonb,uuid,jsonb)'',''public.read_education_issuance(uuid,jsonb,jsonb)'',''public.uc_attest_education_issuance_artifact(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)'',''public.uc_attest_education_issuance_staging(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)'',''public.uc_education_actor_json(jsonb,uuid,boolean)'',''public.uc_education_actor_org_permission(uuid,uuid,text)'',''public.uc_education_admission_conditions(uuid)'',''public.uc_education_admission_definition_shape(jsonb,text)'',''public.uc_education_admission_digest(jsonb,uuid,jsonb,jsonb)'',''public.uc_education_admission_evidence_shape(jsonb)'',''public.uc_education_admission_review_check(uuid,uuid,jsonb,jsonb)'',''public.uc_education_admission_reviews(uuid)'',''public.uc_education_artifact_actor(uuid,uuid,uuid,uuid,uuid)'',''public.uc_education_artifact_attest_shape(jsonb,boolean)'',''public.uc_education_artifact_context(uuid,uuid,uuid,bigint,uuid)'',''public.uc_education_artifact_context_json(uuid,uuid,uuid,bigint,uuid)'',''public.uc_education_artifact_final(uuid,uuid,jsonb)'',''public.uc_education_artifact_live(uuid,uuid,uuid,bigint,boolean)'',''public.uc_education_artifact_saved_source(uuid)'',''public.uc_education_artifact_service_request(uuid,uuid,uuid,uuid,bigint,uuid)'',''public.uc_education_canonical_boundary()'',''public.uc_education_change_apply(uuid,uuid,jsonb,text)'',''public.uc_education_change_preview(uuid,uuid,jsonb)'',''public.uc_education_erase_user(uuid)'',''public.uc_education_frdo_snapshot(uuid,uuid,jsonb,jsonb,text,jsonb,boolean)'',''public.uc_education_handover_check(uuid,uuid,jsonb)'',''public.uc_education_html(text)'',''public.uc_education_issue_actor()'',''public.uc_education_issue_admission(uuid,uuid,uuid,jsonb,text)'',''public.uc_education_issue_artifact_projection(uuid,jsonb,boolean)'',''public.uc_education_issue_basis_projection(uuid,jsonb)'',''public.uc_education_issue_block(text)'',''public.uc_education_issue_can(uuid,uuid,uuid,uuid,uuid,text)'',''public.uc_education_issue_candidate(uuid,uuid,uuid,boolean)'',''public.uc_education_issue_caps(uuid,uuid,uuid,uuid,uuid)'',''public.uc_education_issue_enrollment_fence(uuid,boolean)'',''public.uc_education_issue_error(text)'',''public.uc_education_issue_event(uuid)'',''public.uc_education_issue_export(uuid,jsonb,jsonb)'',''public.uc_education_issue_fence(uuid,uuid,uuid[],text)'',''public.uc_education_issue_handover_projection(uuid,jsonb)'',''public.uc_education_issue_one(uuid,jsonb,text)'',''public.uc_education_issue_preview(uuid,uuid,jsonb,boolean)'',''public.uc_education_issue_proof_visible(jsonb)'',''public.uc_education_issue_record(uuid,uuid,uuid)'',''public.uc_education_issue_scope(uuid,jsonb)'',''public.uc_education_issue_source(uuid,jsonb,boolean)'',''public.uc_education_issue_source_lock(uuid,jsonb)'',''public.uc_education_issue_source_projection(uuid,jsonb)'',''public.uc_education_issue_state_hash(uuid)'',''public.uc_education_mutation_result(uuid,jsonb,jsonb,boolean)'',''public.uc_education_number_witness(uuid,date)'',''public.uc_education_output_approval(uuid)'',''public.uc_education_output_slot(uuid,uuid,uuid,bigint,jsonb,uuid,jsonb)'',''public.uc_education_output_storage_guard()'',''public.uc_education_personal_counts(uuid)'',''public.uc_education_preparation_access(uuid,boolean,uuid)'',''public.uc_education_preparation_item_json(uuid)'',''public.uc_education_preparation_json(uuid)'',''public.uc_education_prospective_numbers(jsonb,integer,date,text)'',''public.uc_education_render_variables(uuid,jsonb,jsonb,jsonb,jsonb,text)'',''public.uc_education_replacement_identity(uuid,boolean)'',''public.uc_education_retained_learning_summary(uuid,jsonb)'',''public.uc_education_saved_output_counts(uuid)'',''public.uc_education_staging_storage_guard()'',''public.uc_education_template(uuid,jsonb,boolean)'',''public.uc_education_template_current(uuid,jsonb,jsonb)'',''public.uc_education_trusted_erasure(uuid)'',''public.uc_education_withdraw_apply(uuid,uuid,jsonb,text,jsonb,text)'',''public.uc_education_withdraw_can(uuid,uuid,uuid,boolean)'',''public.uc_education_withdraw_event(uuid)'',''public.uc_education_withdraw_intent(uuid,uuid,jsonb)'',''public.uc_education_withdraw_state(uuid,uuid,uuid)'',''public.uc_enrollment_is_withdrawn(uuid)'',''public.uc_guard_retained_enrollment()'',''public.uc_guard_retained_learner_activity()'']LOOP
    EXECUTE format(''REVOKE ALL ON FUNCTION %s FROM %I'',target_signature,provider_role);
   END LOOP;
   FOREACH target_table IN ARRAY ARRAY[''uc_education_issuance_contexts'',''uc_education_issuance_events'',''uc_education_issuance_preparation_items'',''uc_education_issuance_preparations'',''uc_education_issuance_requests'',''uc_education_issuance_states'',''uc_enrollment_withdrawal_events'',''uc_enrollment_withdrawal_states'']LOOP
    EXECUTE format(''REVOKE ALL ON TABLE public.%I FROM %I'',target_table,provider_role);
   END LOOP;
  END IF;
 END LOOP;
END;$provider_acl$;
'],NULL,NULL,NULL);
 IF(SELECT count(*)FROM supabase_migrations.schema_migrations)<>622
 OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261023010000'AND name='uc_education_issuance_lifecycle'AND cardinality(statements)=1 AND encode(sha256(convert_to(statements[1],'UTF8')),'hex')='73a44f8fb32c51682962c02211f24439e574132e06cb9f325e2407082fc48bc6'AND created_by IS NULL AND idempotency_key IS NULL AND rollback IS NULL)
 OR(SELECT encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex'),''ORDER BY m.version COLLATE "C"),''),'UTF8')),'hex')FROM supabase_migrations.schema_migrations m WHERE version<>'20261023010000')IS DISTINCT FROM guard_before->>'ledger_sha256'
 THEN RAISE EXCEPTION 'UC019_EXACT_LEDGER_MISMATCH';END IF;
END $post$;
SELECT jsonb_build_object('status','PASS','kind','UC019_ATOMIC622_PRESERVATION','migration','20261023010000','raw_sha256','73a44f8fb32c51682962c02211f24439e574132e06cb9f325e2407082fc48bc6','ledger_before',621,'ledger_inside',622,'old_public_table_sets',344,'old_auth_storage_public_table_sets',(SELECT count(*)FROM jsonb_object_keys((SELECT value->'data'FROM uc019_guard_before))),'all_old_rows_metadata_acl_roles_and_ledger_preserved',true,'allowed_body_changes',(SELECT jsonb_agg(jsonb_build_object('signature',a.signature,'old_md5',a.old_md5,'new_md5',a.new_md5)ORDER BY a.signature)FROM uc019_body_allowlist a),'data_digest',(SELECT encode(sha256(convert_to((value->'data')::text,'UTF8')),'hex')FROM uc019_guard_before),'preservation_before',(SELECT value-'data'FROM uc019_guard_before))AS uc019_release;

ROLLBACK;
