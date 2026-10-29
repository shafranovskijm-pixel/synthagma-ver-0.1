-- SOURCE ONLY. Fresh dedicated synthetic SQL model, no Auth provider or Storage HTTP.
\set ON_ERROR_STOP on
DO $guard$ BEGIN
 IF current_database()<>'sintagma_pcf_current_context_lab_20261029'OR current_user<>'postgres'OR session_user<>'postgres'
 OR inet_server_addr()IS DISTINCT FROM'127.0.0.1'::inet OR inet_server_port()<>5432
 OR current_setting('server_version_num')<>'170011'OR current_setting('data_directory')<>'/var/lib/postgresql/data'
 OR current_setting('pcr.lab_authorized',true)IS DISTINCT FROM'source-reviewed-root-run-only'
 OR to_regnamespace('auth')IS NOT NULL OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated'AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcanlogin)
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon'AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcanlogin)
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role'AND NOT rolcanlogin)
 THEN RAISE EXCEPTION 'COPY24_EXACT_FRESH_PRIVATE_PG1711_MODEL_REQUIRED';END IF;
END;$guard$;
BEGIN;
CREATE SCHEMA auth;CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
REVOKE CREATE ON SCHEMA public,auth FROM PUBLIC,anon,authenticated;
CREATE TYPE public.app_role AS ENUM('admin','organization','student','sales_manager','company');
CREATE FUNCTION auth.uid()RETURNS uuid LANGUAGE sql STABLE AS $f$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$f$;
CREATE FUNCTION auth.role()RETURNS text LANGUAGE sql STABLE AS $f$SELECT current_setting('request.jwt.claim.role',true)$f$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
CREATE TABLE public.organizations(id uuid PRIMARY KEY,balance numeric NOT NULL DEFAULT 100000);
CREATE TABLE public.course_categories(id uuid PRIMARY KEY);
CREATE TABLE public.library_folders(id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE public.companies(id uuid PRIMARY KEY,user_id uuid,organization_id uuid);
CREATE TABLE public.student_groups(id uuid PRIMARY KEY,organization_id uuid,course_id uuid);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,organization_id uuid,company_id uuid,student_group_id uuid,blocked_at timestamptz,archived_at timestamptz);
CREATE TABLE public.user_roles(user_id uuid,role public.app_role,PRIMARY KEY(user_id,role));
CREATE TABLE public.admin_staff(user_id uuid,role text,expires_at timestamptz);
CREATE TABLE public.org_staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,role text,sections_access jsonb DEFAULT'[]',expires_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE public.org_staff_document_groups(staff_id uuid,organization_id uuid,group_id uuid);
CREATE TABLE public.student_group_memberships_effective(organization_id uuid,group_id uuid,user_id uuid);
CREATE TABLE public.account_deletion_revocations(user_id uuid PRIMARY KEY);
CREATE TABLE public.pep_agreements(id uuid PRIMARY KEY,user_id uuid);
CREATE TABLE public.uc_enrollment_withdrawal_states(enrollment_id uuid,redacted boolean NOT NULL DEFAULT false);
CREATE TABLE public.uc_course_assignment_removal_events(id uuid DEFAULT gen_random_uuid(),enrollment_id uuid,revision bigint,state text);
CREATE TABLE public.uc_enrollment_delete_witnesses(transaction_id bigint,backend_pid integer,actor_id uuid,enrollment_id uuid,user_id uuid,course_id uuid);
CREATE TABLE public.lesson_progress(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lesson_id uuid,user_id uuid,completed boolean NOT NULL DEFAULT false,completed_at timestamptz,time_spent integer DEFAULT 0,video_duration real,video_position real);
CREATE TABLE public.test_questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lesson_id uuid,question text,options jsonb,correct_answer integer,explanation text,image_url text,is_bank_question boolean DEFAULT false,order_index integer DEFAULT 0);
CREATE TABLE public.balance_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,amount numeric,type text,description text,related_order_id uuid,performed_by uuid);
CREATE TABLE public.qa_retained_results(id integer PRIMARY KEY,source_course_id uuid,score integer,answers jsonb);

-- Typed columns/defaults and applicable constraints from exact metadata.
CREATE TABLE public."course_documents"(
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "course_id" uuid NOT NULL,
 "name" text NOT NULL,
 "type" text DEFAULT 'material'::text NOT NULL,
 "description" text,
 "file_url" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "library_document_id" uuid,
 "module_id" uuid,
 "library_category" text,
 "sort_order" integer DEFAULT 0 NOT NULL,
 "visible_to_students" boolean DEFAULT true NOT NULL,
 "allow_download" boolean DEFAULT true NOT NULL
);
CREATE TABLE public."course_modules"(
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "course_id" uuid NOT NULL,
 "title" text DEFAULT 'Новый модуль'::text NOT NULL,
 "order_index" integer DEFAULT 0 NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."courses"(
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "organization_id" uuid NOT NULL,
 "category_id" uuid,
 "title" text NOT NULL,
 "description" text,
 "duration" text,
 "is_published" boolean DEFAULT false NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "skip_video_identification" boolean DEFAULT true,
 "sequential_lessons" boolean DEFAULT false NOT NULL,
 "allow_video_seek" boolean DEFAULT true NOT NULL,
 "frdo_program_type" text,
 "frdo_document_type" text,
 "frdo_professional_area" text,
 "frdo_specialty_group" text,
 "frdo_qualification_name" text,
 "frdo_profession_name" text,
 "frdo_qualification_rank" text,
 "training_form" text DEFAULT 'Очная'::text,
 "frdo_duration_hours" integer,
 "frdo_financing_source" text,
 "frdo_education_form" text,
 "retraining_period_months" integer,
 "reminder_advance_days" integer DEFAULT 30 NOT NULL,
 "notify_on_completion" boolean DEFAULT false NOT NULL,
 "completion_notify_emails" text,
 "source_order_id" uuid,
 "source_course_id" uuid,
 "price" numeric DEFAULT 0 NOT NULL,
 "cover_image_url" text,
 "landing_content" jsonb DEFAULT '{}'::jsonb,
 "slug" text,
 "accent_color" text,
 "catalog_order" integer DEFAULT 0 NOT NULL,
 "allow_materials_download" boolean DEFAULT true NOT NULL,
 "default_access_days" integer,
 "require_enrollment_approval" boolean DEFAULT true NOT NULL,
 "hidden_from_catalog" boolean DEFAULT false NOT NULL,
 "generation_progress" jsonb,
 "system_key" text,
 "require_final_test_photo" boolean DEFAULT false NOT NULL
);
CREATE TABLE public."enrollments"(
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "user_id" uuid NOT NULL,
 "course_id" uuid NOT NULL,
 "progress" integer DEFAULT 0 NOT NULL,
 "time_spent" integer DEFAULT 0 NOT NULL,
 "status" text DEFAULT 'active'::text NOT NULL,
 "started_at" timestamp with time zone DEFAULT now() NOT NULL,
 "completed_at" timestamp with time zone,
 "access_days" integer,
 "expires_at" timestamp with time zone,
 "document_facts_revision" bigint DEFAULT 0 NOT NULL
);
CREATE TABLE public."lesson_attachments"(
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "lesson_id" uuid NOT NULL,
 "name" text NOT NULL,
 "file_url" text NOT NULL,
 "file_type" text,
 "file_size" bigint,
 "category" text DEFAULT 'material'::text NOT NULL,
 "order_index" integer DEFAULT 0 NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."lessons"(
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "course_id" uuid NOT NULL,
 "title" text NOT NULL,
 "type" text DEFAULT 'text'::text NOT NULL,
 "content" text,
 "order_index" integer DEFAULT 0 NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "test_questions_count" integer DEFAULT 5,
 "test_passing_score" integer DEFAULT 60 NOT NULL,
 "test_questions_to_show" integer,
 "is_locked" boolean DEFAULT false NOT NULL,
 "ai_avatar_name" text,
 "ai_avatar_image_url" text,
 "ai_avatar_voice_id" text DEFAULT 'Nec_24000'::text,
 "ai_avatar_system_prompt" text,
 "ai_avatar_greeting" text,
 "ai_avatar_subject" text,
 "ai_avatar_style" text DEFAULT 'friendly'::text,
 "ai_avatar_session_minutes" integer DEFAULT 5,
 "ai_avatar_model" text DEFAULT 'google/gemini-3-flash-preview'::text,
 "ai_avatar_stt_provider" text DEFAULT 'deepgram'::text,
 "ai_avatar_stt_model" text DEFAULT 'nova-2'::text,
 "ai_avatar_llm_provider" text DEFAULT 'openai'::text,
 "ai_avatar_llm_model" text DEFAULT 'gpt-4o-mini'::text,
 "ai_avatar_tts_provider" text DEFAULT 'elevenlabs'::text,
 "ai_avatar_tts_voice" text DEFAULT 'EXAVITQu4vr4xnSDxMaL'::text,
 "ai_avatar_language" text DEFAULT 'ru'::text,
 "ai_avatar_allow_interruptions" boolean DEFAULT true,
 "module_id" uuid,
 "test_max_attempts" integer,
 "test_show_answers" boolean DEFAULT true NOT NULL,
 "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "test_max_attempts_per_day" integer
);
CREATE TABLE public."library_documents"(
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "organization_id" uuid NOT NULL,
 "name" text NOT NULL,
 "type" text DEFAULT 'document'::text NOT NULL,
 "description" text,
 "file_url" text,
 "file_size" bigint,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "folder_id" uuid,
 "source_name" text,
 "external_url" text,
 "storage_path" text,
 "original_filename" text,
 "mime_type" text,
 "edition_label" text,
 "last_checked_at" timestamp with time zone,
 "usage_basis" text,
 "library_status" text,
 "created_by" uuid,
 "archived_at" timestamp with time zone,
 "archived_by" uuid
);
CREATE TABLE public."marketplace_courses"(
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "course_id" uuid NOT NULL,
 "organization_id" uuid,
 "price_student" numeric DEFAULT 0 NOT NULL,
 "price_organization" numeric DEFAULT 0 NOT NULL,
 "is_active" boolean DEFAULT true NOT NULL,
 "description_short" text,
 "preview_image_url" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "is_validated" boolean DEFAULT false NOT NULL
);
CREATE TABLE public."marketplace_orders"(
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "marketplace_course_id" uuid NOT NULL,
 "buyer_user_id" uuid,
 "buyer_organization_id" uuid,
 "buyer_type" text NOT NULL,
 "status" text DEFAULT 'pending'::text NOT NULL,
 "price" numeric NOT NULL,
 "students_count" integer DEFAULT 1,
 "notes" text,
 "payment_method" text,
 "paid_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."module_access_overrides"(
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "module_id" uuid NOT NULL,
 "user_id" uuid NOT NULL,
 "unlock_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."module_access_schedules"(
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "module_id" uuid NOT NULL,
 "course_id" uuid NOT NULL,
 "unlock_at" timestamp with time zone NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."org_document_versions"(
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "document_id" uuid NOT NULL,
 "organization_id" uuid NOT NULL,
 "version_number" integer NOT NULL,
 "file_url" text,
 "file_path" text,
 "file_size" bigint,
 "file_name" text,
 "change_summary" text,
 "uploaded_by" uuid,
 "uploaded_by_name" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "event_kind" text,
 "restored_from_version_id" uuid,
 "request_id" uuid,
 "request_payload" jsonb,
 "result_revision" bigint,
 "storage_object_id" uuid,
 "storage_metadata" jsonb,
 "document_metadata" jsonb
);
CREATE TABLE public."org_documents"(
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "organization_id" uuid NOT NULL,
 "name" text NOT NULL,
 "type" text NOT NULL,
 "file_url" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "issue_date" date,
 "expires_at" date,
 "status" text DEFAULT 'active'::text NOT NULL,
 "responsible_person" text,
 "reminder_sent_at" timestamp with time zone,
 "deleted_at" timestamp with time zone,
 "deleted_by" uuid,
 "document_revision" bigint DEFAULT 0 NOT NULL,
 "current_version_id" uuid
);
CREATE TABLE public."paid_umk_20260922_assets"(
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "source_course_id" uuid NOT NULL,
 "library_document_id" uuid NOT NULL,
 "audience" text NOT NULL,
 "release_version" text DEFAULT '2026-09-22.v1'::text NOT NULL,
 "sha256" text NOT NULL,
 "size_bytes" bigint NOT NULL,
 "enabled" boolean DEFAULT true NOT NULL
);
CREATE TABLE public."paid_umk_20260922_grants"(
 "buyer_course_id" uuid NOT NULL,
 "asset_id" uuid NOT NULL,
 "order_id" uuid NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "revoked_at" timestamp with time zone
);
ALTER TABLE public."course_documents" ADD CONSTRAINT "course_documents_library_category_check" CHECK (((library_category IS NULL) OR (library_category = ANY (ARRAY['legal_acts'::text, 'educational_materials'::text, 'manufacturer_guides'::text, 'additional_resources'::text])))) NOT VALID;
ALTER TABLE public."course_documents" ADD CONSTRAINT "course_documents_link_category_check" CHECK (((library_document_id IS NULL) OR (library_category IS NOT NULL))) NOT VALID;
ALTER TABLE public."course_documents" ADD CONSTRAINT "course_documents_pkey" PRIMARY KEY (id);
ALTER TABLE public."course_documents" ADD CONSTRAINT "course_documents_sort_order_check" CHECK ((sort_order >= 0)) NOT VALID;
ALTER TABLE public."course_modules" ADD CONSTRAINT "course_modules_pkey" PRIMARY KEY (id);
ALTER TABLE public."courses" ADD CONSTRAINT "courses_pkey" PRIMARY KEY (id);
ALTER TABLE public."courses" ADD CONSTRAINT "courses_slug_key" UNIQUE (slug);
ALTER TABLE public."courses" ADD CONSTRAINT "courses_system_key_check" CHECK (((system_key IS NULL) OR (system_key = 'welcome'::text)));
ALTER TABLE public."enrollments" ADD CONSTRAINT "enrollments_document_facts_revision_check" CHECK ((document_facts_revision >= 0));
ALTER TABLE public."enrollments" ADD CONSTRAINT "enrollments_pkey" PRIMARY KEY (id);
ALTER TABLE public."enrollments" ADD CONSTRAINT "enrollments_user_id_course_id_key" UNIQUE (user_id, course_id);
ALTER TABLE public."lesson_attachments" ADD CONSTRAINT "lesson_attachments_pkey" PRIMARY KEY (id);
ALTER TABLE public."lessons" ADD CONSTRAINT "lessons_metadata_is_object" CHECK ((jsonb_typeof(metadata) = 'object'::text));
ALTER TABLE public."lessons" ADD CONSTRAINT "lessons_pkey" PRIMARY KEY (id);
ALTER TABLE public."lessons" ADD CONSTRAINT "lessons_test_max_attempts_per_day_positive" CHECK (((test_max_attempts_per_day IS NULL) OR (test_max_attempts_per_day > 0)));
ALTER TABLE public."library_documents" ADD CONSTRAINT "library_documents_active_resource_complete_check" CHECK (((library_status IS DISTINCT FROM 'active'::text) OR ((NULLIF(btrim(source_name), ''::text) IS NOT NULL) AND (usage_basis IS NOT NULL) AND (last_checked_at IS NOT NULL) AND (num_nonnulls(external_url, storage_path) = 1) AND (NULLIF(btrim(edition_label), ''::text) IS NOT NULL)))) NOT VALID;
ALTER TABLE public."library_documents" ADD CONSTRAINT "library_documents_https_url_check" CHECK (((external_url IS NULL) OR ((external_url ~* '^https://[^[:space:]]+$'::text) AND (external_url !~* '^https://[^/[:space:]]*@'::text)))) NOT VALID;
ALTER TABLE public."library_documents" ADD CONSTRAINT "library_documents_library_status_check" CHECK (((library_status IS NULL) OR (library_status = ANY (ARRAY['active'::text, 'needs_review'::text, 'archive'::text])))) NOT VALID;
ALTER TABLE public."library_documents" ADD CONSTRAINT "library_documents_pkey" PRIMARY KEY (id);
ALTER TABLE public."library_documents" ADD CONSTRAINT "library_documents_single_source_check" CHECK ((num_nonnulls(external_url, storage_path) <= 1)) NOT VALID;
ALTER TABLE public."library_documents" ADD CONSTRAINT "library_documents_storage_path_scope_check" CHECK (((storage_path IS NULL) OR (storage_path ~ (('^library/'::text || (organization_id)::text) || '/[^/]+$'::text)))) NOT VALID;
ALTER TABLE public."library_documents" ADD CONSTRAINT "library_documents_usage_basis_check" CHECK (((usage_basis IS NULL) OR (usage_basis = ANY (ARRAY['official_open_source'::text, 'own_material'::text, 'rights_holder_permission'::text])))) NOT VALID;
ALTER TABLE public."marketplace_courses" ADD CONSTRAINT "marketplace_courses_course_id_key" UNIQUE (course_id);
ALTER TABLE public."marketplace_courses" ADD CONSTRAINT "marketplace_courses_pkey" PRIMARY KEY (id);
ALTER TABLE public."marketplace_orders" ADD CONSTRAINT "marketplace_orders_buyer_type_check" CHECK ((buyer_type = ANY (ARRAY['student'::text, 'organization'::text])));
ALTER TABLE public."marketplace_orders" ADD CONSTRAINT "marketplace_orders_payment_method_check" CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['invoice'::text, 'online'::text, 'balance'::text]))));
ALTER TABLE public."marketplace_orders" ADD CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY (id);
ALTER TABLE public."marketplace_orders" ADD CONSTRAINT "marketplace_orders_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'paid'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public."module_access_overrides" ADD CONSTRAINT "module_access_overrides_module_id_user_id_key" UNIQUE (module_id, user_id);
ALTER TABLE public."module_access_overrides" ADD CONSTRAINT "module_access_overrides_pkey" PRIMARY KEY (id);
ALTER TABLE public."module_access_schedules" ADD CONSTRAINT "module_access_schedules_module_id_key" UNIQUE (module_id);
ALTER TABLE public."module_access_schedules" ADD CONSTRAINT "module_access_schedules_pkey" PRIMARY KEY (id);
ALTER TABLE public."org_document_versions" ADD CONSTRAINT "org_document_versions_document_id_version_number_key" UNIQUE (document_id, version_number);
ALTER TABLE public."org_document_versions" ADD CONSTRAINT "org_document_versions_file_size_check" CHECK (((file_size IS NULL) OR (file_size >= 0))) NOT VALID;
ALTER TABLE public."org_document_versions" ADD CONSTRAINT "org_document_versions_pkey" PRIMARY KEY (id);
ALTER TABLE public."org_documents" ADD CONSTRAINT "org_documents_pkey" PRIMARY KEY (id);
ALTER TABLE public."org_documents" ADD CONSTRAINT "org_documents_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'expired'::text])));
ALTER TABLE public."paid_umk_20260922_assets" ADD CONSTRAINT "paid_umk_20260922_assets_audience_check" CHECK ((audience = ANY (ARRAY['learner'::text, 'staff'::text])));
ALTER TABLE public."paid_umk_20260922_assets" ADD CONSTRAINT "paid_umk_20260922_assets_library_document_id_key" UNIQUE (library_document_id);
ALTER TABLE public."paid_umk_20260922_assets" ADD CONSTRAINT "paid_umk_20260922_assets_pkey" PRIMARY KEY (id);
ALTER TABLE public."paid_umk_20260922_assets" ADD CONSTRAINT "paid_umk_20260922_assets_release_version_check" CHECK ((release_version = '2026-09-22.v1'::text));
ALTER TABLE public."paid_umk_20260922_assets" ADD CONSTRAINT "paid_umk_20260922_assets_sha256_check" CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE public."paid_umk_20260922_assets" ADD CONSTRAINT "paid_umk_20260922_assets_size_bytes_check" CHECK (((size_bytes > 0) AND (size_bytes <= 104857600)));
ALTER TABLE public."paid_umk_20260922_assets" ADD CONSTRAINT "paid_umk_20260922_assets_source_course_id_audience_key" UNIQUE (source_course_id, audience);
ALTER TABLE public."paid_umk_20260922_assets" ADD CONSTRAINT "paid_umk_20260922_assets_source_course_id_check" CHECK ((source_course_id = ANY (ARRAY['8ae9739f-e87b-5397-94a5-86bfe99b0d77'::uuid, '26e65ccb-609f-5b3d-b59a-f280c9feae5b'::uuid, '271f5a00-3c75-5bc4-95d3-0bfb571af830'::uuid, 'c54775d6-4fa6-5074-9fe4-0ee0e43e3d20'::uuid, 'eee04ed8-712a-516b-b424-f4d3f2914789'::uuid, 'da8f53b1-aeb3-554a-a6e3-c47cd38bb974'::uuid, 'b17642a3-5640-58d5-88c0-42da3c7993c3'::uuid, '3ffe2add-d573-5e85-a0d9-e605bfb38cc4'::uuid, '5b36a622-2bef-55f6-8e07-4e3ed6ac5359'::uuid, '6956ec2f-a3bf-50fb-a26f-bb34f7d22686'::uuid, '8f2649d4-7344-571c-b949-d3b17c0b6570'::uuid, '43875168-01df-5f6e-bab2-05429690b670'::uuid, '0ee6a051-f5e9-5261-a7c8-50d1c8557c95'::uuid, '0dd53774-189b-5f79-afe1-e6a2f8ccf670'::uuid, '556bdc4e-ca55-5e0e-b5bc-aabd06fb70e0'::uuid, 'c227f730-78f1-58e3-b911-a46cf70af792'::uuid, '28d29085-e03a-53d3-815b-a2c8492b5fae'::uuid, 'a49a8b3b-94c2-5741-9a24-bee66feb72d0'::uuid, '9012ac05-33f2-5543-a06c-dff399f718e3'::uuid, 'd6cee67d-d16d-56ba-a17d-0ecc4f187fab'::uuid, 'f913a85b-8b88-5e6c-9943-ee9fefaeea1f'::uuid, '39d4ed6c-c726-5974-be26-2ed2ae4ce548'::uuid, 'ab68a4cb-a24d-56a8-aedb-d797c2185797'::uuid, '88407039-1664-5804-9750-9136c008287c'::uuid, 'f09e8ae0-078f-519c-9025-f3c7b98d46f5'::uuid])));
ALTER TABLE public."paid_umk_20260922_grants" ADD CONSTRAINT "paid_umk_20260922_grants_pkey" PRIMARY KEY (buyer_course_id, asset_id);
ALTER TABLE public."course_documents" ADD CONSTRAINT "course_documents_course_id_fkey" FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE public."course_documents" ADD CONSTRAINT "course_documents_library_document_id_fkey" FOREIGN KEY (library_document_id) REFERENCES library_documents(id) ON DELETE RESTRICT;
ALTER TABLE public."course_documents" ADD CONSTRAINT "course_documents_module_id_fkey" FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE SET NULL;
ALTER TABLE public."course_modules" ADD CONSTRAINT "course_modules_course_id_fkey" FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE public."courses" ADD CONSTRAINT "courses_category_id_fkey" FOREIGN KEY (category_id) REFERENCES course_categories(id) ON DELETE SET NULL;
ALTER TABLE public."courses" ADD CONSTRAINT "courses_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public."courses" ADD CONSTRAINT "courses_source_course_id_fkey" FOREIGN KEY (source_course_id) REFERENCES courses(id);
ALTER TABLE public."courses" ADD CONSTRAINT "courses_source_order_id_fkey" FOREIGN KEY (source_order_id) REFERENCES marketplace_orders(id);
ALTER TABLE public."enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE public."lesson_attachments" ADD CONSTRAINT "lesson_attachments_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE;
ALTER TABLE public."lessons" ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE public."lessons" ADD CONSTRAINT "lessons_module_id_fkey" FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE SET NULL;
ALTER TABLE public."library_documents" ADD CONSTRAINT "library_documents_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE SET NULL;
ALTER TABLE public."library_documents" ADD CONSTRAINT "library_documents_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public."marketplace_courses" ADD CONSTRAINT "marketplace_courses_course_id_fkey" FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE public."marketplace_courses" ADD CONSTRAINT "marketplace_courses_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public."marketplace_orders" ADD CONSTRAINT "marketplace_orders_buyer_organization_id_fkey" FOREIGN KEY (buyer_organization_id) REFERENCES organizations(id);
ALTER TABLE public."marketplace_orders" ADD CONSTRAINT "marketplace_orders_marketplace_course_id_fkey" FOREIGN KEY (marketplace_course_id) REFERENCES marketplace_courses(id) ON DELETE CASCADE;
ALTER TABLE public."module_access_overrides" ADD CONSTRAINT "module_access_overrides_module_id_fkey" FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE;
ALTER TABLE public."module_access_schedules" ADD CONSTRAINT "module_access_schedules_course_id_fkey" FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE public."module_access_schedules" ADD CONSTRAINT "module_access_schedules_module_id_fkey" FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE;
ALTER TABLE public."org_document_versions" ADD CONSTRAINT "org_document_versions_document_id_fkey" FOREIGN KEY (document_id) REFERENCES org_documents(id) ON DELETE CASCADE;
ALTER TABLE public."org_document_versions" ADD CONSTRAINT "org_document_versions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public."org_document_versions" ADD CONSTRAINT "org_document_versions_restored_from_version_id_fkey" FOREIGN KEY (restored_from_version_id) REFERENCES org_document_versions(id);
ALTER TABLE public."org_documents" ADD CONSTRAINT "org_documents_current_version_fk" FOREIGN KEY (current_version_id) REFERENCES org_document_versions(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."org_documents" ADD CONSTRAINT "org_documents_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public."paid_umk_20260922_assets" ADD CONSTRAINT "paid_umk_20260922_assets_library_document_id_fkey" FOREIGN KEY (library_document_id) REFERENCES library_documents(id) ON DELETE RESTRICT;
ALTER TABLE public."paid_umk_20260922_assets" ADD CONSTRAINT "paid_umk_20260922_assets_source_course_id_fkey" FOREIGN KEY (source_course_id) REFERENCES courses(id) ON DELETE RESTRICT;
ALTER TABLE public."paid_umk_20260922_grants" ADD CONSTRAINT "paid_umk_20260922_grants_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES paid_umk_20260922_assets(id) ON DELETE RESTRICT;
ALTER TABLE public."paid_umk_20260922_grants" ADD CONSTRAINT "paid_umk_20260922_grants_buyer_course_id_fkey" FOREIGN KEY (buyer_course_id) REFERENCES courses(id) ON DELETE RESTRICT;
ALTER TABLE public."paid_umk_20260922_grants" ADD CONSTRAINT "paid_umk_20260922_grants_order_id_fkey" FOREIGN KEY (order_id) REFERENCES marketplace_orders(id) ON DELETE RESTRICT;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean NOT NULL DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),last_accessed_at timestamptz DEFAULT now(),
 metadata jsonb,path_tokens text[],version text,owner_id text,user_metadata jsonb,archived_at timestamptz,
 is_delete_marker boolean NOT NULL DEFAULT false,is_versioned boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");
CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");
CREATE UNIQUE INDEX idx_objects_current_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (archived_at IS NULL);
CREATE INDEX idx_objects_delete_markers ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE is_delete_marker;
CREATE UNIQUE INDEX idx_objects_null_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (NOT is_versioned);
CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);
CREATE UNIQUE INDEX objects_bucket_id_name_version_key ON storage.objects USING btree (bucket_id, name COLLATE "C", version) NULLS NOT DISTINCT;

-- SQL/PL dependencies are all installed before validation/use; no allow stubs.
SET LOCAL check_function_bodies=off;
-- EXACT CURRENT metadata definition: account_deletion_access_allowed()
CREATE OR REPLACE FUNCTION public.account_deletion_access_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid());
$function$;

-- EXACT CURRENT metadata definition: can_access_course_as_learner(uuid)
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

-- EXACT CURRENT metadata definition: can_access_course(uuid,text)
CREATE OR REPLACE FUNCTION public.can_access_course(_course_id uuid, _permission text DEFAULT 'courses.read'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = _course_id
      AND public.can_access_organization(c.organization_id, _permission)
  )
$function$;

-- EXACT CURRENT metadata definition: can_manage_course_files_org(uuid,text)
CREATE OR REPLACE FUNCTION public.can_manage_course_files_org(_organization_id uuid, _permission text DEFAULT 'courses.write'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _organization_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND (
      public.has_role('admin'::public.app_role, auth.uid())
      OR (
        public.has_role('organization'::public.app_role, auth.uid())
        AND public.current_organization_id() = _organization_id
      )
      OR public.has_org_staff_permission(auth.uid(), _organization_id, _permission)
    )
$function$;

-- EXACT CURRENT metadata definition: can_read_electronic_library_document(uuid)
CREATE OR REPLACE FUNCTION public.can_read_electronic_library_document(_library_document_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.paid_umk_20260922_assets a WHERE a.library_document_id = _library_document_id)
    THEN public.paid_umk_20260922_can_read_document(_library_document_id)
    ELSE auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.library_documents ld
    WHERE ld.id = _library_document_id
      AND (
        -- Only library writers may review draft and archived cards. A teacher
        -- with read-only access must see exactly the active linked set that a
        -- learner sees for a course.
        public.can_access_organization(ld.organization_id, 'library.write')
        OR (
          -- Teachers and learners receive only active resources that are
          -- actually assigned to a course they may read.
          ld.library_status = 'active'
          AND EXISTS (
            SELECT 1
            FROM public.course_documents cd
            JOIN public.courses c ON c.id = cd.course_id
            WHERE cd.library_document_id = ld.id
              AND cd.visible_to_students
              AND COALESCE(
                c.landing_content @> '{"electronic_library":{"enabled":true}}'::jsonb,
                false
              )
              AND (
                public.can_access_course(cd.course_id, 'courses.read')
                OR public.can_access_course_as_learner(cd.course_id)
              )
          )
        )
      )
  ) END
$function$;

-- EXACT CURRENT metadata definition: can_read_lesson_attachment(uuid)
CREATE OR REPLACE FUNCTION public.can_read_lesson_attachment(_lesson_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role('admin'::public.app_role, auth.uid())
    OR public.can_access_lesson(_lesson_id, 'courses.read')
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      WHERE l.id = _lesson_id
        AND (
          -- зачисление напрямую
          EXISTS (
            SELECT 1 FROM public.enrollments e
            WHERE e.user_id = auth.uid()
              AND e.course_id = c.id
              AND e.status IN ('active', 'completed')
              AND (e.expires_at IS NULL OR e.expires_at > now())
          )
          -- назначение через учебную группу
          OR EXISTS (
            SELECT 1
            FROM public.profiles pr
            JOIN public.student_groups sg ON sg.id = pr.student_group_id
            WHERE pr.user_id = auth.uid()
              AND sg.course_id = c.id
          )
          -- сотрудники/владелец организации покрыты can_access_lesson выше
        )
    )
  )
$function$;

-- EXACT CURRENT metadata definition: get_course_electronic_library_shell(uuid)
CREATE OR REPLACE FUNCTION public.get_course_electronic_library_shell(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_course record;
  v_modules jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_course_id IS NULL THEN
    RAISE EXCEPTION 'Electronic library access denied'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.id, c.title, c.is_published
  INTO v_course
  FROM public.courses c
  WHERE c.id = p_course_id
    AND COALESCE(
      c.landing_content @> '{"electronic_library":{"enabled":true}}'::jsonb,
      false
    );

  IF NOT FOUND OR NOT (
    public.can_access_course(p_course_id, 'courses.read')
    OR public.can_access_course_as_learner(p_course_id)
  ) THEN
    -- Deliberately use the same response for missing, disabled and forbidden
    -- courses so the RPC cannot be used to enumerate draft course ids.
    RAISE EXCEPTION 'Electronic library access denied'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', cm.id,
        'title', cm.title,
        'order_index', cm.order_index
      )
      ORDER BY cm.order_index, cm.id
    ),
    '[]'::jsonb
  )
  INTO v_modules
  FROM public.course_modules cm
  WHERE cm.course_id = p_course_id;

  RETURN jsonb_build_object(
    'course_id', v_course.id,
    'title', v_course.title,
    'library_only', NOT v_course.is_published,
    'modules', v_modules
  );
END;
$function$;

-- EXACT CURRENT metadata definition: purchase_marketplace_course(uuid,uuid,text,integer,text)
CREATE OR REPLACE FUNCTION public.purchase_marketplace_course(p_marketplace_course_id uuid, p_target_organization_id uuid, p_buyer_type text DEFAULT 'organization'::text, p_students_count integer DEFAULT 1, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_listing public.marketplace_courses%ROWTYPE;
  v_source public.courses%ROWTYPE;
  v_order_id uuid;
  v_new_course_id uuid;
  v_new_module_id uuid;
  v_new_lesson_id uuid;
  v_price numeric;
  v_balance numeric;
  v_module_map jsonb := '{}'::jsonb;
  v_module record;
  v_lesson record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_marketplace_course_id IS NULL OR p_target_organization_id IS NULL THEN
    RAISE EXCEPTION 'Marketplace course and target organization are required'
      USING ERRCODE = '22023';
  END IF;

  -- The current product delivers a cloned course to an organization. A future
  -- student-specific delivery flow must use its own atomic enrollment RPC.
  IF p_buyer_type IS DISTINCT FROM 'organization' THEN
    RAISE EXCEPTION 'Only organization marketplace purchases are supported'
      USING ERRCODE = '22023';
  END IF;

  IF p_students_count IS NULL OR p_students_count < 1 THEN
    RAISE EXCEPTION 'Students count must be positive' USING ERRCODE = '22023';
  END IF;

  -- This helper excludes ordinary students while preserving platform admins,
  -- organization owners and org_staff with courses.write.
  IF NOT public.can_manage_course_files_org(
    p_target_organization_id,
    'courses.write'
  ) THEN
    RAISE EXCEPTION 'Insufficient permission to purchase a course for this organization'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize balance changes for this buyer before the quota trigger locks
  -- the same organization row. This preserves the global organization-row
  -- first lock order and prevents two concurrent purchases overspending it.
  SELECT o.balance
    INTO v_balance
  FROM public.organizations o
  WHERE o.id = p_target_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target organization not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT mc.*
    INTO v_listing
  FROM public.marketplace_courses mc
  WHERE mc.id = p_marketplace_course_id
    AND mc.is_active = true
    AND mc.is_validated = true
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active marketplace course not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.*
    INTO v_source
  FROM public.courses c
  WHERE c.id = v_listing.course_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marketplace source course not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_listing.organization_id IS DISTINCT FROM v_source.organization_id
     AND NOT (
       v_listing.organization_id IS NULL
       AND v_source.organization_id = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
     )
  THEN
    RAISE EXCEPTION 'Marketplace listing tenant does not own its source course'
      USING ERRCODE = 'P0002';
  END IF;

  -- Never trust a client-supplied price.
  v_price := v_listing.price_organization;

  IF v_price < 0 THEN
    RAISE EXCEPTION 'Marketplace price cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF v_balance < v_price THEN
    RAISE EXCEPTION 'Insufficient organization balance'
      USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO public.marketplace_orders (
    marketplace_course_id,
    buyer_user_id,
    buyer_organization_id,
    buyer_type,
    status,
    price,
    students_count,
    notes,
    payment_method,
    paid_at
  )
  VALUES (
    v_listing.id,
    v_user_id,
    p_target_organization_id,
    'organization',
    'pending',
    v_price,
    p_students_count,
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    'balance',
    NULL
  )
  RETURNING id INTO v_order_id;

  IF v_price > 0 THEN
    INSERT INTO public.balance_transactions (
      organization_id,
      amount,
      type,
      description,
      related_order_id,
      performed_by
    )
    VALUES (
      p_target_organization_id,
      -v_price,
      'marketplace_purchase',
      'Покупка курса «' || v_source.title || '»',
      v_order_id,
      v_user_id
    );

    UPDATE public.organizations
    SET balance = balance - v_price
    WHERE id = p_target_organization_id;
  END IF;

  INSERT INTO public.courses (
    accent_color,
    allow_materials_download,
    allow_video_seek,
    catalog_order,
    category_id,
    completion_notify_emails,
    cover_image_url,
    default_access_days,
    description,
    duration,
    frdo_document_type,
    frdo_duration_hours,
    frdo_education_form,
    frdo_financing_source,
    frdo_profession_name,
    frdo_professional_area,
    frdo_program_type,
    frdo_qualification_name,
    frdo_qualification_rank,
    frdo_specialty_group,
    generation_progress,
    hidden_from_catalog,
    is_published,
    landing_content,
    notify_on_completion,
    organization_id,
    price,
    reminder_advance_days,
    require_enrollment_approval,
    retraining_period_months,
    sequential_lessons,
    skip_video_identification,
    slug,
    source_course_id,
    source_order_id,
    title,
    training_form
  )
  VALUES (
    v_source.accent_color,
    v_source.allow_materials_download,
    v_source.allow_video_seek,
    v_source.catalog_order,
    NULL,
    -- Extra notification recipients belong to the seller tenant. The buyer
    -- may configure its own recipients without receiving seller addresses.
    NULL,
    v_source.cover_image_url,
    v_source.default_access_days,
    v_source.description,
    v_source.duration,
    v_source.frdo_document_type,
    v_source.frdo_duration_hours,
    v_source.frdo_education_form,
    v_source.frdo_financing_source,
    v_source.frdo_profession_name,
    v_source.frdo_professional_area,
    v_source.frdo_program_type,
    v_source.frdo_qualification_name,
    v_source.frdo_qualification_rank,
    v_source.frdo_specialty_group,
    v_source.generation_progress,
    v_source.hidden_from_catalog,
    v_source.is_published,
    v_source.landing_content,
    v_source.notify_on_completion,
    p_target_organization_id,
    v_source.price,
    v_source.reminder_advance_days,
    v_source.require_enrollment_approval,
    v_source.retraining_period_months,
    v_source.sequential_lessons,
    v_source.skip_video_identification,
    NULL,
    v_source.id,
    v_order_id,
    v_source.title,
    v_source.training_form
  )
  RETURNING id INTO v_new_course_id;

  INSERT INTO public.course_documents (
    course_id,
    name,
    type,
    description,
    file_url
  )
  SELECT
    v_new_course_id,
    d.name,
    d.type,
    d.description,
    d.file_url
  FROM public.course_documents d
  WHERE d.course_id = v_source.id;

  FOR v_module IN
    SELECT m.id, m.title, m.order_index
    FROM public.course_modules m
    WHERE m.course_id = v_source.id
    ORDER BY m.order_index, m.id
  LOOP
    INSERT INTO public.course_modules (course_id, title, order_index)
    VALUES (v_new_course_id, v_module.title, v_module.order_index)
    RETURNING id INTO v_new_module_id;

    v_module_map := v_module_map || jsonb_build_object(
      v_module.id::text,
      v_new_module_id::text
    );
  END LOOP;

  -- module_access_schedules/module_access_overrides are intentionally reset.
  -- Their absolute dates and per-user exceptions belong to the seller tenant;
  -- the buyer configures a new schedule for the cloned modules when needed.
  FOR v_lesson IN
    SELECT l.*
    FROM public.lessons l
    WHERE l.course_id = v_source.id
    ORDER BY l.order_index, l.id
  LOOP
    IF v_lesson.module_id IS NOT NULL
       AND NOT (v_module_map ? v_lesson.module_id::text)
    THEN
      RAISE EXCEPTION 'Marketplace source lesson % references a module outside the source course',
        v_lesson.id
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.lessons (
      ai_avatar_allow_interruptions,
      ai_avatar_greeting,
      ai_avatar_image_url,
      ai_avatar_language,
      ai_avatar_llm_model,
      ai_avatar_llm_provider,
      ai_avatar_model,
      ai_avatar_name,
      ai_avatar_session_minutes,
      ai_avatar_stt_model,
      ai_avatar_stt_provider,
      ai_avatar_style,
      ai_avatar_subject,
      ai_avatar_system_prompt,
      ai_avatar_tts_provider,
      ai_avatar_tts_voice,
      ai_avatar_voice_id,
      content,
      course_id,
      is_locked,
      module_id,
      order_index,
      test_max_attempts,
      test_passing_score,
      test_questions_count,
      test_questions_to_show,
      test_show_answers,
      title,
      type
    )
    VALUES (
      v_lesson.ai_avatar_allow_interruptions,
      v_lesson.ai_avatar_greeting,
      v_lesson.ai_avatar_image_url,
      v_lesson.ai_avatar_language,
      v_lesson.ai_avatar_llm_model,
      v_lesson.ai_avatar_llm_provider,
      v_lesson.ai_avatar_model,
      v_lesson.ai_avatar_name,
      v_lesson.ai_avatar_session_minutes,
      v_lesson.ai_avatar_stt_model,
      v_lesson.ai_avatar_stt_provider,
      v_lesson.ai_avatar_style,
      v_lesson.ai_avatar_subject,
      v_lesson.ai_avatar_system_prompt,
      v_lesson.ai_avatar_tts_provider,
      v_lesson.ai_avatar_tts_voice,
      v_lesson.ai_avatar_voice_id,
      v_lesson.content,
      v_new_course_id,
      v_lesson.is_locked,
      CASE
        WHEN v_lesson.module_id IS NULL THEN NULL
        ELSE (v_module_map ->> v_lesson.module_id::text)::uuid
      END,
      v_lesson.order_index,
      v_lesson.test_max_attempts,
      v_lesson.test_passing_score,
      v_lesson.test_questions_count,
      v_lesson.test_questions_to_show,
      v_lesson.test_show_answers,
      v_lesson.title,
      v_lesson.type
    )
    RETURNING id INTO v_new_lesson_id;

    INSERT INTO public.test_questions (
      lesson_id,
      question,
      options,
      correct_answer,
      explanation,
      image_url,
      is_bank_question,
      order_index
    )
    SELECT
      v_new_lesson_id,
      q.question,
      q.options,
      q.correct_answer,
      q.explanation,
      q.image_url,
      q.is_bank_question,
      q.order_index
    FROM public.test_questions q
    WHERE q.lesson_id = v_lesson.id;

    INSERT INTO public.lesson_attachments (
      lesson_id,
      name,
      file_url,
      file_type,
      file_size,
      category,
      order_index
    )
    SELECT
      v_new_lesson_id,
      a.name,
      a.file_url,
      a.file_type,
      a.file_size,
      a.category,
      a.order_index
    FROM public.lesson_attachments a
    WHERE a.lesson_id = v_lesson.id;
  END LOOP;

  UPDATE public.marketplace_orders
  SET status = 'paid', paid_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'course_id', v_new_course_id,
    'price', v_price
  );
END
$function$;

-- EXACT CURRENT metadata definition: uc_enrollment_is_withdrawn(uuid)
CREATE OR REPLACE FUNCTION public.uc_enrollment_is_withdrawn(p_enrollment uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.uc_enrollment_withdrawal_states s WHERE s.enrollment_id=p_enrollment AND NOT s.redacted)
 OR EXISTS(SELECT 1 FROM public.uc_course_assignment_removal_events e WHERE e.enrollment_id=p_enrollment AND e.state='cancelled'AND NOT EXISTS(SELECT 1 FROM public.uc_course_assignment_removal_events later WHERE later.enrollment_id=e.enrollment_id AND later.revision>e.revision))
$function$;

-- EXACT CURRENT metadata definition: _paid_20260922_course_read(uuid,boolean)
CREATE OR REPLACE FUNCTION public._paid_20260922_course_read(p_course_id uuid, p_allow_learner boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE v_course public.courses%ROWTYPE; v_valid boolean;
BEGIN
 -- Legacy must remain neutral to every existing permissive/restrictive policy.
 IF NOT public._paid_20260922_course_scope(p_course_id) THEN RETURN true; END IF;
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.blocked_at IS NOT NULL) THEN
   RETURN false;
 END IF;
 SELECT c.* INTO v_course FROM public.courses c WHERE c.id=p_course_id;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Platform administration retains inspection of pending/invalid deliveries.
 IF public.has_role(auth.uid(),'admin'::public.app_role) THEN RETURN true; END IF;
 IF p_course_id=ANY(public._paid_20260922_original_ids()) THEN
   RETURN v_course.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
      AND COALESCE(public.can_access_course(p_course_id,'courses.read'),false);
 END IF;
 -- Every descendant hop requires its own order tied to that parent listing.
 -- UNION (not UNION ALL) terminates cycles; scoped anchors cannot be reparented.
 WITH RECURSIVE ancestry AS (
   SELECT c.id,c.organization_id,c.source_course_id,c.source_order_id FROM public.courses c WHERE c.id=p_course_id
   UNION
   SELECT p.id,p.organization_id,p.source_course_id,p.source_order_id FROM public.courses p
   JOIN ancestry a ON p.id=a.source_course_id
 )
 SELECT EXISTS (
   SELECT 1 FROM ancestry a WHERE a.id=ANY(public._paid_20260922_original_ids())
     AND a.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
     AND a.source_course_id IS NULL AND a.source_order_id IS NULL
 ) AND NOT EXISTS (
   SELECT 1 FROM ancestry a
   WHERE NOT a.id=ANY(public._paid_20260922_original_ids())
     AND NOT EXISTS (
       SELECT 1 FROM public.marketplace_orders mo
       JOIN public.marketplace_courses mc ON mc.id=mo.marketplace_course_id
       JOIN public.courses parent ON parent.id=a.source_course_id
       WHERE mo.id=a.source_order_id AND mo.buyer_type='organization'
         AND mo.status IN ('paid','completed') AND mo.paid_at IS NOT NULL
         AND mo.buyer_organization_id=a.organization_id
         AND mc.course_id=a.source_course_id
         AND (mc.organization_id=parent.organization_id OR
              (mc.organization_id IS NULL AND parent.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid))
     )
 ) INTO v_valid;
 IF NOT COALESCE(v_valid,false) THEN RETURN false; END IF;
 IF public.can_access_course(p_course_id,'courses.read') THEN RETURN true; END IF;
 RETURN COALESCE(p_allow_learner,false) AND v_course.is_published IS TRUE
   AND COALESCE(public.can_access_course_as_learner(p_course_id),false);
END
$function$;

-- EXACT CURRENT metadata definition: _paid_20260922_lesson_read(uuid,boolean,boolean)
CREATE OR REPLACE FUNCTION public._paid_20260922_lesson_read(p_lesson_id uuid, p_allow_demo boolean, p_allow_learner boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE v_course_id uuid;
BEGIN
 SELECT l.course_id INTO v_course_id FROM public.lessons l WHERE l.id=p_lesson_id;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Reserved interface only: no demo UUIDs exist, and mutable flags grant nothing.
 RETURN public._paid_20260922_course_read(v_course_id,p_allow_learner);
END
$function$;

-- EXACT CURRENT metadata definition: paid_umk_20260922_can_read_assignment(uuid,uuid,boolean)
CREATE OR REPLACE FUNCTION public.paid_umk_20260922_can_read_assignment(_course_id uuid, _document_id uuid, _visible boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.paid_umk_20260922_assets a
    JOIN public.library_documents ld ON ld.id=a.library_document_id
    JOIN public.courses source ON source.id=a.source_course_id
    JOIN public.courses target ON target.id=_course_id
    WHERE ld.id=_document_id AND a.enabled AND ld.library_status='active'
      AND ld.organization_id=source.organization_id
      AND (
        -- Canonical source never becomes a free learner download.
        (target.id=source.id AND public._paid_20260922_course_scope(source.id)
          AND public._paid_20260922_course_read(source.id,false))
        OR (
          public.paid_umk_20260922_valid_grant(target.id,ld.id)
          AND public._paid_20260922_course_scope(target.id)
          AND (
            -- Explicit staff predicate excludes ordinary enrolled students.
            public._paid_20260922_course_read(target.id,false)
            OR (a.audience='learner' AND _visible AND public._paid_20260922_course_read(target.id,true))
          )
        )
      )
  );
$function$;

-- EXACT CURRENT metadata definition: paid_umk_20260922_can_read_document(uuid)
CREATE OR REPLACE FUNCTION public.paid_umk_20260922_can_read_document(_document_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.paid_umk_20260922_assets a
    JOIN public.library_documents ld ON ld.id=a.library_document_id
    JOIN public.courses source ON source.id=a.source_course_id
    WHERE ld.id=_document_id AND a.enabled AND ld.library_status='active'
      AND ld.organization_id=source.organization_id
      AND (
        (public._paid_20260922_course_scope(source.id) AND public._paid_20260922_course_read(source.id,false))
        OR EXISTS (
          SELECT 1 FROM public.course_documents cd WHERE cd.library_document_id=ld.id
            AND public.paid_umk_20260922_can_read_assignment(cd.course_id,ld.id,cd.visible_to_students)
        )
      )
  );
$function$;

-- EXACT CURRENT metadata definition: paid_umk_20260922_protect_assignment()
CREATE OR REPLACE FUNCTION public.paid_umk_20260922_protect_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_audience text;
BEGIN
  SELECT audience INTO v_audience FROM public.paid_umk_20260922_assets WHERE library_document_id=NEW.library_document_id;
  IF FOUND THEN
    IF NEW.file_url IS NOT NULL THEN RAISE EXCEPTION 'Paid files must not contain a persistent URL'; END IF;
    IF v_audience='staff' AND NEW.visible_to_students THEN
      RAISE EXCEPTION 'Staff paid file cannot be visible to learners';
    END IF;
    IF NEW.library_category IS DISTINCT FROM 'educational_materials' OR NEW.module_id IS NOT NULL THEN
      RAISE EXCEPTION 'Paid release files are course-wide educational materials';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- EXACT CURRENT metadata definition: validate_course_library_assignment_scope()
CREATE OR REPLACE FUNCTION public.validate_course_library_assignment_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_course_organization_id uuid;
  v_course_electronic_library_enabled boolean;
  v_document_organization_id uuid;
  v_module_course_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.library_document_id IS NOT NULL
     AND (
       NEW.library_document_id IS DISTINCT FROM OLD.library_document_id
       OR NEW.course_id IS DISTINCT FROM OLD.course_id
    )
  THEN
    RAISE EXCEPTION
      'linked library_document_id and course_id are immutable; hide the assignment instead';
  END IF;

  SELECT
    c.organization_id,
    COALESCE(
      c.landing_content @> '{"electronic_library":{"enabled":true}}'::jsonb,
      false
    )
  INTO v_course_organization_id, v_course_electronic_library_enabled
  FROM public.courses c
  WHERE c.id = NEW.course_id;

  IF v_course_organization_id IS NULL THEN
    RAISE EXCEPTION 'course % does not exist', NEW.course_id;
  END IF;

  IF NEW.library_document_id IS NOT NULL THEN
    IF NOT v_course_electronic_library_enabled THEN
      RAISE EXCEPTION 'electronic library is not explicitly enabled for course %', NEW.course_id;
    END IF;

    SELECT ld.organization_id
    INTO v_document_organization_id
    FROM public.library_documents ld
    WHERE ld.id = NEW.library_document_id;

    IF v_document_organization_id IS NULL THEN
      RAISE EXCEPTION 'library document % does not exist', NEW.library_document_id;
    END IF;
    IF v_document_organization_id <> v_course_organization_id
       AND NOT public.paid_umk_20260922_valid_grant(NEW.course_id, NEW.library_document_id) THEN
      RAISE EXCEPTION 'course and library document belong to different organizations';
    END IF;

  END IF;

  IF NEW.module_id IS NOT NULL THEN
    SELECT cm.course_id
    INTO v_module_course_id
    FROM public.course_modules cm
    WHERE cm.id = NEW.module_id;

    IF v_module_course_id IS NULL THEN
      RAISE EXCEPTION 'course module % does not exist', NEW.module_id;
    END IF;
    IF v_module_course_id <> NEW.course_id THEN
      RAISE EXCEPTION 'course document module belongs to another course';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- EXACT CURRENT metadata definition: _paid_20260922_course_scope(uuid)
CREATE OR REPLACE FUNCTION public._paid_20260922_course_scope(p_course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
 WITH RECURSIVE ancestry(id,source_course_id) AS (
   SELECT c.id,c.source_course_id FROM public.courses c WHERE c.id=p_course_id
   UNION
   SELECT p.id,p.source_course_id FROM public.courses p
   JOIN ancestry a ON p.id=a.source_course_id
 )
 SELECT COALESCE(p_course_id=ANY(public._paid_20260922_original_ids()),false)
   OR EXISTS (SELECT 1 FROM ancestry WHERE id=ANY(public._paid_20260922_original_ids()));
$function$;

-- EXACT CURRENT metadata definition: _paid_20260922_original_ids()
CREATE OR REPLACE FUNCTION public._paid_20260922_original_ids()
 RETURNS uuid[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT ARRAY[
    '8ae9739f-e87b-5397-94a5-86bfe99b0d77'::uuid, -- B01
    '26e65ccb-609f-5b3d-b59a-f280c9feae5b'::uuid, -- B02
    '271f5a00-3c75-5bc4-95d3-0bfb571af830'::uuid, -- B03
    'c54775d6-4fa6-5074-9fe4-0ee0e43e3d20'::uuid, -- B04
    'eee04ed8-712a-516b-b424-f4d3f2914789'::uuid, -- B07
    'da8f53b1-aeb3-554a-a6e3-c47cd38bb974'::uuid, -- B08
    'b17642a3-5640-58d5-88c0-42da3c7993c3'::uuid, -- B09
    '3ffe2add-d573-5e85-a0d9-e605bfb38cc4'::uuid, -- B10
    '5b36a622-2bef-55f6-8e07-4e3ed6ac5359'::uuid, -- B11
    '6956ec2f-a3bf-50fb-a26f-bb34f7d22686'::uuid, -- EDU-01
    '8f2649d4-7344-571c-b949-d3b17c0b6570'::uuid, -- EDU-02
    '43875168-01df-5f6e-bab2-05429690b670'::uuid, -- EDU-04
    '0ee6a051-f5e9-5261-a7c8-50d1c8557c95'::uuid, -- EDU-05
    '0dd53774-189b-5f79-afe1-e6a2f8ccf670'::uuid, -- EDU-06
    '556bdc4e-ca55-5e0e-b5bc-aabd06fb70e0'::uuid, -- EDU-07
    'c227f730-78f1-58e3-b911-a46cf70af792'::uuid, -- EDU-08
    '28d29085-e03a-53d3-815b-a2c8492b5fae'::uuid, -- REG-01
    'a49a8b3b-94c2-5741-9a24-bee66feb72d0'::uuid, -- REG-02
    '9012ac05-33f2-5543-a06c-dff399f718e3'::uuid, -- REG-04
    'd6cee67d-d16d-56ba-a17d-0ecc4f187fab'::uuid, -- REG-05
    'f913a85b-8b88-5e6c-9943-ee9fefaeea1f'::uuid, -- REG-06
    '39d4ed6c-c726-5974-be26-2ed2ae4ce548'::uuid, -- REG-07
    'ab68a4cb-a24d-56a8-aedb-d797c2185797'::uuid, -- REG-08
    '88407039-1664-5804-9750-9136c008287c'::uuid, -- REG-09
    'f09e8ae0-078f-519c-9025-f3c7b98d46f5'::uuid -- REG-11
 ];
$function$;

-- EXACT CURRENT metadata definition: can_access_lesson(uuid,text)
CREATE OR REPLACE FUNCTION public.can_access_lesson(_lesson_id uuid, _permission text DEFAULT 'courses.read'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.lessons l
    JOIN public.courses c ON c.id = l.course_id
    WHERE l.id = _lesson_id
      AND public.can_access_organization(c.organization_id, _permission)
  )
$function$;

-- EXACT CURRENT metadata definition: can_access_organization(uuid,text)
CREATE OR REPLACE FUNCTION public.can_access_organization(_organization_id uuid, _permission text DEFAULT 'settings.read'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _organization_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.profiles p ON p.user_id = ur.user_id
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'organization'::public.app_role
          AND p.organization_id = _organization_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.org_staff os
            WHERE os.user_id = auth.uid()
              AND os.organization_id = _organization_id
          )
      )
      OR (
        _permission IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.org_staff os
          WHERE os.user_id = auth.uid()
            AND os.organization_id = _organization_id
            AND (os.expires_at IS NULL OR os.expires_at > now())
        )
        AND public.has_org_staff_permission(auth.uid(), _organization_id, _permission)
      )
    )
$function$;

-- EXACT CURRENT metadata definition: guard_marketplace_order_delivery()
CREATE OR REPLACE FUNCTION public.guard_marketplace_order_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status IN ('paid', 'completed') AND NEW.paid_at IS NULL THEN
    RAISE EXCEPTION 'Settled marketplace order requires a payment timestamp'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('paid', 'completed')
     AND (
       TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM NEW.status
     )
     AND NOT EXISTS (
       SELECT 1
        FROM public.courses c
        JOIN public.marketplace_courses mc
          ON mc.id = NEW.marketplace_course_id
        WHERE c.source_order_id = NEW.id
          AND c.organization_id = NEW.buyer_organization_id
          AND c.source_course_id = mc.course_id
      )
  THEN
    RAISE EXCEPTION 'Paid marketplace order requires a delivered course'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

-- EXACT CURRENT metadata definition: paid_umk_20260922_deliver()
CREATE OR REPLACE FUNCTION public.paid_umk_20260922_deliver()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_source uuid; v_buyer uuid; v_count integer; v_asset record;
BEGIN
  IF NEW.status NOT IN ('paid','completed') OR (TG_OP='UPDATE' AND OLD.status IN ('paid','completed')) THEN RETURN NEW; END IF;
  SELECT course_id INTO v_source FROM public.marketplace_courses WHERE id=NEW.marketplace_course_id;
  IF NOT EXISTS(SELECT 1 FROM public.paid_umk_20260922_assets WHERE source_course_id=v_source) THEN RETURN NEW; END IF;
  IF NEW.buyer_type<>'organization' OR NEW.paid_at IS NULL THEN RAISE EXCEPTION 'Paid UMK requires a settled organization order'; END IF;
  SELECT count(*),min(id::text)::uuid INTO v_count,v_buyer FROM public.courses
    WHERE source_order_id=NEW.id AND source_course_id=v_source AND organization_id=NEW.buyer_organization_id;
  IF v_count<>1 THEN RAISE EXCEPTION 'Paid UMK requires exactly one corresponding buyer course'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=v_buyer AND landing_content @> '{"electronic_library":{"enabled":true}}'::jsonb)
    THEN RAISE EXCEPTION 'Electronic library must be enabled on paid clone'; END IF;
  SELECT count(*) INTO v_count FROM public.paid_umk_20260922_assets WHERE source_course_id=v_source AND enabled;
  IF v_count<>2 THEN RAISE EXCEPTION 'Paid UMK requires both learner and staff release files'; END IF;
  FOR v_asset IN SELECT a.*,ld.name,ld.description FROM public.paid_umk_20260922_assets a
    JOIN public.library_documents ld ON ld.id=a.library_document_id
    WHERE a.source_course_id=v_source AND a.enabled ORDER BY a.audience
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.library_documents ld JOIN public.courses c ON c.id=v_source
      JOIN storage.objects so ON so.bucket_id='library-files' AND so.name=ld.storage_path
      WHERE ld.id=v_asset.library_document_id AND ld.organization_id=c.organization_id
        AND ld.library_status='active' AND ld.file_url IS NULL AND ld.external_url IS NULL
        AND ld.file_size=v_asset.size_bytes)
    THEN RAISE EXCEPTION 'Canonical paid file missing/inactive/size mismatch: %',v_asset.id; END IF;
    INSERT INTO public.paid_umk_20260922_grants(buyer_course_id,asset_id,order_id)
      VALUES(v_buyer,v_asset.id,NEW.id) ON CONFLICT (buyer_course_id,asset_id) DO NOTHING;
    -- Source course_documents are intentionally NOT required: source files may
    -- stay unassigned in the seller library, avoiding legacy empty copies.
    INSERT INTO public.course_documents(course_id,name,type,description,file_url,library_document_id,library_category,sort_order,visible_to_students,allow_download)
      SELECT v_buyer,v_asset.name,'library_resource',v_asset.description,NULL,v_asset.library_document_id,'educational_materials',
        CASE WHEN v_asset.audience='learner' THEN 10 ELSE 20 END,v_asset.audience='learner',true
      WHERE NOT EXISTS(SELECT 1 FROM public.course_documents WHERE course_id=v_buyer AND library_document_id=v_asset.library_document_id);
  END LOOP;
  RETURN NEW;
END;
$function$;

-- EXACT CURRENT metadata definition: paid_umk_20260922_is_asset(uuid)
CREATE OR REPLACE FUNCTION public.paid_umk_20260922_is_asset(_document_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.paid_umk_20260922_assets a WHERE a.library_document_id=_document_id);
$function$;

-- EXACT CURRENT metadata definition: paid_umk_20260922_valid_grant(uuid,uuid)
CREATE OR REPLACE FUNCTION public.paid_umk_20260922_valid_grant(_course_id uuid, _document_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.paid_umk_20260922_grants g
    JOIN public.paid_umk_20260922_assets a ON a.id=g.asset_id
    JOIN public.library_documents ld ON ld.id=a.library_document_id
    JOIN public.courses source ON source.id=a.source_course_id
    JOIN public.courses buyer ON buyer.id=g.buyer_course_id
    JOIN public.marketplace_orders o ON o.id=g.order_id
    JOIN public.marketplace_courses listing ON listing.id=o.marketplace_course_id
    WHERE buyer.id=_course_id AND ld.id=_document_id
      AND a.enabled AND g.revoked_at IS NULL
      AND o.status IN ('paid','completed') AND o.paid_at IS NOT NULL AND o.buyer_type='organization'
      AND o.buyer_organization_id=buyer.organization_id
      AND buyer.source_order_id=o.id AND buyer.source_course_id=source.id
      AND listing.course_id=source.id
      AND (listing.organization_id=source.organization_id OR
        (listing.organization_id IS NULL AND source.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid))
      AND ld.organization_id=source.organization_id
      AND ld.storage_path IS NOT NULL AND ld.external_url IS NULL AND ld.file_url IS NULL
      AND ld.library_status='active'
      AND COALESCE(buyer.landing_content @> '{"electronic_library":{"enabled":true}}'::jsonb,false)
  );
$function$;

-- EXACT CURRENT metadata definition: account_deletion_subject_write_guard()
CREATE OR REPLACE FUNCTION public.account_deletion_subject_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE column_name text; target_id uuid; targets uuid[]; pep_targets uuid[];
BEGIN
 -- Sort locks to avoid deadlocks in two-person message rows.
 -- UPDATE may not move a revoked subject's data outside the deletion scope.
 SELECT array_agg(DISTINCT subject_id::uuid ORDER BY subject_id::uuid) INTO targets
 FROM unnest(TG_ARGV) c CROSS JOIN LATERAL (
  VALUES (to_jsonb(NEW)->>c),
         (CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->>c END)
 ) subjects(subject_id) WHERE subject_id IS NOT NULL;
 -- A signature may refer to a person's PEP agreement even if its party UUIDs
 -- differ. Keep that exact indirect relationship inside the same write fence.
 IF TG_TABLE_NAME='document_signatures' THEN
  SELECT array_agg(DISTINCT p.user_id) INTO pep_targets FROM public.pep_agreements p
  WHERE p.user_id IS NOT NULL AND p.id IN (
   (to_jsonb(NEW)->>'pep_agreement_id')::uuid,
   CASE WHEN TG_OP='UPDATE' THEN (to_jsonb(OLD)->>'pep_agreement_id')::uuid END);
  SELECT array_agg(DISTINCT x ORDER BY x) INTO targets
  FROM unnest(coalesce(targets,'{}'::uuid[])||coalesce(pep_targets,'{}'::uuid[])) x;
 END IF;
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
END;$function$;

-- EXACT CURRENT metadata definition: can_delete_course_enrollment(uuid)
CREATE OR REPLACE FUNCTION public.can_delete_course_enrollment(p_enrollment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT coalesce((SELECT public.uc_enrollment_delete_live_allowed(e.id,e.user_id,e.course_id) OR public.uc_enrollment_delete_has_witness(e.id,e.user_id,e.course_id)
 FROM public.enrollments e WHERE e.id=p_enrollment_id),false)
$function$;

-- EXACT CURRENT metadata definition: current_company_id()
CREATE OR REPLACE FUNCTION public.current_company_id()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
    SELECT c.id FROM public.companies c
    WHERE c.user_id = auth.uid()
    LIMIT 1
  );
END;
$function$;

-- EXACT CURRENT metadata definition: current_organization_id()
CREATE OR REPLACE FUNCTION public.current_organization_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT organization_id INTO v_org
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_org IS NOT NULL THEN
    RETURN v_org;
  END IF;

  SELECT organization_id INTO v_org
  FROM public.org_staff
  WHERE user_id = auth.uid()
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY
    CASE role
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'school_editor' THEN 3
      WHEN 'course_editor' THEN 4
      WHEN 'teacher' THEN 5
      WHEN 'sales_manager' THEN 6
      ELSE 10
    END,
    created_at ASC
  LIMIT 1;

  RETURN v_org;
END;
$function$;

-- EXACT CURRENT metadata definition: get_org_staff_permissions(uuid,uuid)
CREATE OR REPLACE FUNCTION public.get_org_staff_permissions(_user_id uuid, _organization_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  staff_role text;
  base_perms text[];
  override_perms text[];
BEGIN
  SELECT role,
         COALESCE(
           ARRAY(SELECT jsonb_array_elements_text(sections_access)),
           ARRAY[]::text[]
         )
    INTO staff_role, override_perms
    FROM public.org_staff
   WHERE user_id = _user_id AND organization_id = _organization_id
   LIMIT 1;

  IF staff_role IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  base_perms := public.org_role_default_permissions(staff_role);

  -- merge: union of base + overrides (overrides могут только добавлять права)
  RETURN ARRAY(
    SELECT DISTINCT unnest(base_perms || override_perms)
  );
END;
$function$;

-- EXACT CURRENT metadata definition: has_org_staff_permission(uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.has_org_staff_permission(_user_id uuid, _organization_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH perms AS (
    SELECT unnest(public.get_org_staff_permissions(_user_id, _organization_id)) AS permission
  )
  SELECT EXISTS (
    SELECT 1
    FROM perms
    WHERE permission = _permission
       OR permission = public.normalize_org_staff_permission(_permission)
       OR public.normalize_org_staff_permission(permission) = public.normalize_org_staff_permission(_permission)
  )
$function$;

-- EXACT CURRENT metadata definition: has_role(app_role,uuid)
CREATE OR REPLACE FUNCTION public.has_role(_role app_role, _user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
END;
$function$;

-- EXACT CURRENT metadata definition: has_role(uuid,app_role)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$function$;

-- EXACT CURRENT metadata definition: is_org_owner(uuid,uuid)
CREATE OR REPLACE FUNCTION public.is_org_owner(_user_id uuid, _organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'organization'::public.app_role
      AND p.organization_id = _organization_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.org_staff os
        WHERE os.user_id = _user_id
          AND os.organization_id = _organization_id
      )
  )
$function$;

-- EXACT CURRENT metadata definition: lesson_write_guard_allowed(uuid)
CREATE OR REPLACE FUNCTION public.lesson_write_guard_allowed(p_course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT coalesce(auth.role()='authenticated'AND auth.uid()IS NOT NULL
 AND public.account_deletion_access_allowed()
 AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid()AND u.deleted_at IS NULL AND(u.banned_until IS NULL OR u.banned_until<=now()))
 AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid()AND p.blocked_at IS NOT NULL)
 AND public.uc_platform_document_action_allowed(auth.uid(),'write')
 AND public.can_access_course(p_course_id,'courses.write'),false)
$function$;

-- EXACT CURRENT metadata definition: module_write_guard_allowed(uuid,uuid)
CREATE OR REPLACE FUNCTION public.module_write_guard_allowed(p_module_id uuid, p_expected_course_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT coalesce(EXISTS(SELECT 1 FROM public.course_modules m
  WHERE m.id=p_module_id AND (p_expected_course_id IS NULL OR m.course_id=p_expected_course_id)
  AND public.lesson_write_guard_allowed(m.course_id)),false)
$function$;

-- EXACT CURRENT metadata definition: normalize_org_staff_permission(text)
CREATE OR REPLACE FUNCTION public.normalize_org_staff_permission(_permission text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _permission IS NULL THEN NULL
    WHEN _permission LIKE '%.view'   THEN regexp_replace(_permission, '\.view$',   '.read')
    WHEN _permission LIKE '%.manage' THEN regexp_replace(_permission, '\.manage$', '.write')
    ELSE _permission
  END
$function$;

-- EXACT CURRENT metadata definition: org_role_default_permissions(text)
CREATE OR REPLACE FUNCTION public.org_role_default_permissions(_role text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _role
    WHEN 'owner' THEN ARRAY[
      'courses.read','courses.write','students.read','students.write',
      'companies.read','companies.write','library.read','library.write',
      'documents.read','documents.write','documents.sign','documents.issue','journals.read','journals.write',
      'frdo.read','frdo.write','labor_safety.read','labor_safety.write',
      'services.read','services.write','staff.read','staff.write',
      'billing.read','billing.write','settings.read','settings.write',
      'chats.read','chats.write','homework.read','homework.write',
      'webinars.read','webinars.write','sales.read','sales.write'
    ]
    WHEN 'admin' THEN ARRAY[
      'courses.read','courses.write','students.read','students.write',
      'companies.read','companies.write','library.read','library.write',
      'documents.read','documents.write','documents.sign','documents.issue','journals.read','journals.write',
      'frdo.read','frdo.write','labor_safety.read','labor_safety.write',
      'services.read','services.write','staff.read',
      'billing.read','settings.read',
      'chats.read','chats.write','homework.read','homework.write',
      'webinars.read','webinars.write','sales.read'
    ]
    WHEN 'school_editor' THEN ARRAY[
      'courses.read','courses.write','library.read','library.write',
      'documents.read','services.read','services.write',
      'settings.read','webinars.read','webinars.write'
    ]
    WHEN 'course_editor' THEN ARRAY[
      'courses.read','courses.write','library.read','library.write',
      'documents.read','webinars.read'
    ]
    WHEN 'teacher' THEN ARRAY[
      'courses.read','students.read','library.read','chats.read','chats.write',
      'homework.read','homework.write','documents.read','journals.read'
    ]
    WHEN 'sales_manager' THEN ARRAY[
      'sales.read','sales.write','companies.read','companies.write',
      'services.read','documents.read','chats.read','chats.write','students.read'
    ]
    ELSE ARRAY[]::text[]
  END
$function$;

-- EXACT CURRENT metadata definition: uc_document_scope_allowed(uuid,uuid,uuid)
CREATE OR REPLACE FUNCTION public.uc_document_scope_allowed(p_org uuid, p_group uuid DEFAULT NULL::uuid, p_enrollment uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_user uuid;v_course uuid;v_group_course uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() OR p_org IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org) THEN RETURN false; END IF;
 IF p_group IS NOT NULL THEN
  SELECT course_id INTO v_group_course FROM public.student_groups WHERE id=p_group AND organization_id=p_org;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_group_course IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=v_group_course AND c.organization_id=p_org) THEN RETURN false; END IF;
 END IF;
 IF p_enrollment IS NOT NULL THEN
  SELECT e.user_id,e.course_id INTO v_user,v_course FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id
   WHERE e.id=p_enrollment AND c.organization_id=p_org;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_group IS NOT NULL AND (v_group_course IS DISTINCT FROM v_course OR NOT EXISTS(
   SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=p_group AND m.user_id=v_user))
  THEN RETURN false; END IF;
 END IF;
 IF public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_org_owner(auth.uid(),p_org) THEN RETURN true; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.organization_id=p_org AND s.user_id=auth.uid()
   AND (s.expires_at IS NULL OR s.expires_at>now())) THEN RETURN false; END IF;
 IF NOT public.uc_document_teacher_limited(p_org) THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public.org_staff s JOIN public.org_staff_document_groups a ON a.staff_id=s.id AND a.organization_id=s.organization_id
  JOIN public.student_groups g ON g.id=a.group_id AND g.organization_id=a.organization_id
  WHERE s.organization_id=p_org AND s.user_id=auth.uid() AND (s.expires_at IS NULL OR s.expires_at>now())
   AND (p_group IS NULL OR g.id=p_group)
   AND (p_enrollment IS NULL OR (g.course_id=v_course AND EXISTS(SELECT 1 FROM public.student_group_memberships_effective m
     WHERE m.organization_id=p_org AND m.group_id=g.id AND m.user_id=v_user)))
   AND (p_group IS NOT NULL OR p_enrollment IS NOT NULL));
END;$function$;

-- EXACT CURRENT metadata definition: uc_document_teacher_limited(uuid)
CREATE OR REPLACE FUNCTION public.uc_document_teacher_limited(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT NOT public.has_role(auth.uid(),'admin'::public.app_role)
 AND EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=auth.uid() AND s.role='teacher')
 AND NOT public.is_org_owner(auth.uid(),p_org)
 AND NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=auth.uid() AND s.organization_id=p_org AND s.role<>'teacher'
  AND (s.expires_at IS NULL OR s.expires_at>now()));
$function$;

-- EXACT CURRENT metadata definition: uc_document_user_course_scope(uuid,uuid,uuid)
CREATE OR REPLACE FUNCTION public.uc_document_user_course_scope(p_org uuid, p_user uuid, p_course uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed() AND (p_user=auth.uid()
 OR NOT public.uc_document_teacher_limited(p_org) OR EXISTS(
 SELECT 1 FROM public.enrollments e WHERE e.user_id=p_user AND e.course_id=p_course
 AND public.uc_document_scope_allowed(p_org,NULL,e.id)));
$function$;

-- EXACT CURRENT metadata definition: uc_enrollment_delete_actor_writable()
CREATE OR REPLACE FUNCTION public.uc_enrollment_delete_actor_writable()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT coalesce(auth.role()='authenticated' AND auth.uid() IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid())
 AND public.uc_platform_document_action_allowed(auth.uid(),'write')
 AND NOT public.has_role(auth.uid(),'sales_manager'::public.app_role)
 AND NOT EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=auth.uid() AND(a.role NOT IN('super_admin','admin') OR a.expires_at<=now())),false)
$function$;

-- EXACT CURRENT metadata definition: uc_enrollment_delete_has_witness(uuid,uuid,uuid)
CREATE OR REPLACE FUNCTION public.uc_enrollment_delete_has_witness(p_enrollment uuid, p_user uuid, p_course uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT public.uc_enrollment_delete_actor_writable()
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND EXISTS(SELECT 1 FROM public.uc_enrollment_delete_witnesses w WHERE w.transaction_id=txid_current() AND w.backend_pid=pg_backend_pid() AND w.actor_id=auth.uid()
 AND w.enrollment_id=p_enrollment AND w.user_id=p_user AND w.course_id=p_course)
$function$;

-- EXACT CURRENT metadata definition: uc_enrollment_delete_live_allowed(uuid,uuid,uuid)
CREATE OR REPLACE FUNCTION public.uc_enrollment_delete_live_allowed(p_enrollment uuid, p_user uuid, p_course uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT public.uc_enrollment_delete_actor_writable()
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id JOIN public.profiles p ON p.user_id=e.user_id AND p.organization_id=c.organization_id
 WHERE e.id=p_enrollment AND e.user_id=p_user AND e.course_id=p_course
 AND public.uc_student_frdo_staff_org_allowed(auth.uid(),c.organization_id,'students.write')
 AND public.uc_document_scope_allowed(c.organization_id,NULL,e.id))
$function$;

-- EXACT CURRENT metadata definition: uc_platform_document_action_allowed(uuid,text)
CREATE OR REPLACE FUNCTION public.uc_platform_document_action_allowed(p_user uuid, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT p_user IS NOT NULL AND p_action IN ('read','write','sign','issue')
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND (NOT public.has_role('admin'::public.app_role,p_user)
  OR NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user)
  OR EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user AND
     (role IN ('super_admin','admin') OR p_action='read' AND role IN ('viewer','sales_manager'))
     AND (expires_at IS NULL OR expires_at>now()))
   AND NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user
     AND (NOT (role IN ('super_admin','admin') OR p_action='read' AND role IN ('viewer','sales_manager')) OR expires_at<=now())))
$function$;

-- EXACT CURRENT metadata definition: uc_student_frdo_staff_org_allowed(uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.uc_student_frdo_staff_org_allowed(p_actor uuid, p_org uuid, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT p_actor IS NOT NULL AND p_org IS NOT NULL AND p_permission IN('frdo.write','students.write','documents.write')
 AND EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org)
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)
 AND public.uc_platform_document_action_allowed(p_actor,'write')
  AND NOT public.has_role(p_actor,'sales_manager'::public.app_role)
  AND NOT EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=p_actor AND(a.role NOT IN('super_admin','admin') OR a.expires_at<=now()))
  AND(public.has_role(p_actor,'admin'::public.app_role) OR public.is_org_owner(p_actor,p_org)
   OR EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org AND(s.expires_at IS NULL OR s.expires_at>now()))
     AND public.has_org_staff_permission(p_actor,p_org,p_permission))
$function$;

-- EXACT CURRENT metadata definition: update_updated_at_column()
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.paid_umk_20260922_protect_canonical()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.paid_umk_20260922_assets WHERE library_document_id=OLD.id)
    AND ROW(NEW.organization_id,NEW.storage_path,NEW.external_url,NEW.file_url,NEW.file_size,NEW.original_filename,NEW.mime_type)
      IS DISTINCT FROM ROW(OLD.organization_id,OLD.storage_path,OLD.external_url,OLD.file_url,OLD.file_size,OLD.original_filename,OLD.mime_type)
  THEN RAISE EXCEPTION 'Paid release asset bytes/location metadata are immutable; create a new release'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_library_document_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_folder_organization_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'library document organization_id is immutable';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;

  NEW.source_name := NULLIF(btrim(NEW.source_name), '');
  NEW.external_url := NULLIF(btrim(NEW.external_url), '');
  NEW.storage_path := NULLIF(btrim(NEW.storage_path), '');
  NEW.original_filename := NULLIF(btrim(NEW.original_filename), '');
  NEW.mime_type := NULLIF(btrim(NEW.mime_type), '');
  NEW.edition_label := NULLIF(btrim(NEW.edition_label), '');

  IF NEW.last_checked_at > now() THEN
    RAISE EXCEPTION 'last_checked_at cannot be in the future';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       NEW.external_url IS DISTINCT FROM OLD.external_url
       OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.source_name IS DISTINCT FROM OLD.source_name
       OR NEW.edition_label IS DISTINCT FROM OLD.edition_label
       OR NEW.usage_basis IS DISTINCT FROM OLD.usage_basis
     )
     AND NEW.last_checked_at IS NOT DISTINCT FROM OLD.last_checked_at
  THEN
    NEW.last_checked_at := NULL;
    IF NEW.library_status = 'active' THEN
      NEW.library_status := 'needs_review';
    END IF;
  END IF;

  IF num_nonnulls(NEW.external_url, NEW.storage_path) > 0
     AND NEW.library_status IS NULL
  THEN
    NEW.library_status := 'needs_review';
  END IF;

  -- Incomplete cards remain saveable for administrators but cannot be exposed
  -- as active resources to teachers or learners.
  IF NEW.library_status = 'active'
     AND (
       NEW.source_name IS NULL
       OR NEW.usage_basis IS NULL
       OR NEW.last_checked_at IS NULL
       OR num_nonnulls(NEW.external_url, NEW.storage_path) <> 1
       OR NEW.edition_label IS NULL
     )
  THEN
    NEW.library_status := 'needs_review';
  END IF;

  IF NEW.folder_id IS NOT NULL THEN
    SELECT lf.organization_id
    INTO v_folder_organization_id
    FROM public.library_folders lf
    WHERE lf.id = NEW.folder_id;

    IF v_folder_organization_id IS NULL THEN
      RAISE EXCEPTION 'library folder % does not exist', NEW.folder_id;
    END IF;
    IF v_folder_organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'library document and folder belong to different organizations';
    END IF;
  END IF;

  IF NEW.library_status = 'archive' THEN
    IF TG_OP = 'INSERT' OR OLD.library_status IS DISTINCT FROM 'archive' THEN
      NEW.archived_at := now();
      NEW.archived_by := auth.uid();
    ELSE
      NEW.archived_at := OLD.archived_at;
      NEW.archived_by := OLD.archived_by;
    END IF;
  ELSE
    NEW.archived_at := NULL;
    NEW.archived_by := NULL;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.invalidate_marketplace_course_validation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old_course_id uuid;
  v_new_course_id uuid;
  v_old_lesson_id uuid;
  v_new_lesson_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'courses' THEN
    v_old_course_id := OLD.id;
    v_new_course_id := NEW.id;
  ELSIF TG_TABLE_NAME IN ('course_modules', 'lessons', 'course_documents') THEN
    IF TG_OP <> 'INSERT' THEN
      v_old_course_id := OLD.course_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      v_new_course_id := NEW.course_id;
    END IF;
  ELSIF TG_TABLE_NAME IN ('test_questions', 'lesson_attachments') THEN
    IF TG_OP <> 'INSERT' THEN
      v_old_lesson_id := OLD.lesson_id;
      SELECT l.course_id INTO v_old_course_id
      FROM public.lessons l
      WHERE l.id = v_old_lesson_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      v_new_lesson_id := NEW.lesson_id;
      SELECT l.course_id INTO v_new_course_id
      FROM public.lessons l
      WHERE l.id = v_new_lesson_id;
    END IF;
  END IF;

  UPDATE public.marketplace_courses mc
  SET is_validated = false
  WHERE mc.is_validated = true
    AND mc.course_id IN (v_old_course_id, v_new_course_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END
$function$;
CREATE TRIGGER invalidate_marketplace_course_on_document_mutation AFTER INSERT OR DELETE OR UPDATE ON public.course_documents FOR EACH ROW EXECUTE FUNCTION invalidate_marketplace_course_validation();
CREATE TRIGGER invalidate_marketplace_course_on_module_mutation AFTER INSERT OR DELETE OR UPDATE ON public.course_modules FOR EACH ROW EXECUTE FUNCTION invalidate_marketplace_course_validation();
CREATE TRIGGER invalidate_marketplace_course_on_course_update AFTER UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION invalidate_marketplace_course_validation();
CREATE TRIGGER invalidate_marketplace_course_on_attachment_mutation AFTER INSERT OR DELETE OR UPDATE ON public.lesson_attachments FOR EACH ROW EXECUTE FUNCTION invalidate_marketplace_course_validation();
CREATE TRIGGER invalidate_marketplace_course_on_lesson_mutation AFTER INSERT OR DELETE OR UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION invalidate_marketplace_course_validation();
SET LOCAL check_function_bodies=on;
REVOKE ALL ON FUNCTION public.account_deletion_access_allowed() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_access_allowed() TO anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_access_allowed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_access_allowed() TO service_role;
REVOKE ALL ON FUNCTION public.can_access_course_as_learner(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_access_course_as_learner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_course_as_learner(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.can_access_course(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_access_course(uuid,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_course(uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION public.can_access_course(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_course(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.can_manage_course_files_org(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_course_files_org(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_course_files_org(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.can_read_electronic_library_document(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_read_electronic_library_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_electronic_library_document(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.can_read_lesson_attachment(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_read_lesson_attachment(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_lesson_attachment(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_read_lesson_attachment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_lesson_attachment(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_course_electronic_library_shell(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_course_electronic_library_shell(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_electronic_library_shell(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.purchase_marketplace_course(uuid,uuid,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purchase_marketplace_course(uuid,uuid,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_marketplace_course(uuid,uuid,text,integer,text) TO service_role;
REVOKE ALL ON FUNCTION public.uc_enrollment_is_withdrawn(uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public._paid_20260922_course_read(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public._paid_20260922_course_read(uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public._paid_20260922_course_read(uuid,boolean) TO anon;
GRANT EXECUTE ON FUNCTION public._paid_20260922_course_read(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public._paid_20260922_lesson_read(uuid,boolean,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public._paid_20260922_lesson_read(uuid,boolean,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public._paid_20260922_lesson_read(uuid,boolean,boolean) TO anon;
GRANT EXECUTE ON FUNCTION public._paid_20260922_lesson_read(uuid,boolean,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.paid_umk_20260922_can_read_assignment(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.paid_umk_20260922_can_read_assignment(uuid,uuid,boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.paid_umk_20260922_can_read_assignment(uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.paid_umk_20260922_can_read_assignment(uuid,uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.paid_umk_20260922_can_read_document(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.paid_umk_20260922_can_read_document(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.paid_umk_20260922_can_read_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.paid_umk_20260922_can_read_document(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.paid_umk_20260922_protect_assignment() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.paid_umk_20260922_protect_assignment() TO service_role;
REVOKE ALL ON FUNCTION public.validate_course_library_assignment_scope() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.validate_course_library_assignment_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_course_library_assignment_scope() TO service_role;
REVOKE ALL ON FUNCTION public._paid_20260922_course_scope(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public._paid_20260922_course_scope(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._paid_20260922_course_scope(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public._paid_20260922_course_scope(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public._paid_20260922_original_ids() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public._paid_20260922_original_ids() TO service_role;
REVOKE ALL ON FUNCTION public.can_access_lesson(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_access_lesson(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_lesson(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.can_access_organization(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_access_organization(uuid,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_organization(uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION public.can_access_organization(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_organization(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.guard_marketplace_order_delivery() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.guard_marketplace_order_delivery() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_marketplace_order_delivery() TO service_role;
REVOKE ALL ON FUNCTION public.paid_umk_20260922_deliver() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.paid_umk_20260922_deliver() TO service_role;
REVOKE ALL ON FUNCTION public.paid_umk_20260922_is_asset(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.paid_umk_20260922_is_asset(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.paid_umk_20260922_is_asset(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.paid_umk_20260922_is_asset(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.paid_umk_20260922_valid_grant(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.paid_umk_20260922_valid_grant(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.account_deletion_subject_write_guard() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_subject_write_guard() TO service_role;
REVOKE ALL ON FUNCTION public.can_delete_course_enrollment(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_delete_course_enrollment(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO service_role;
REVOKE ALL ON FUNCTION public.current_organization_id() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO anon;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO service_role;
REVOKE ALL ON FUNCTION public.get_org_staff_permissions(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_org_staff_permissions(uuid,uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_staff_permissions(uuid,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_org_staff_permissions(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_staff_permissions(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.has_org_staff_permission(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.has_org_staff_permission(uuid,uuid,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_org_staff_permission(uuid,uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION public.has_org_staff_permission(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_staff_permission(uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.has_role(app_role,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.has_role(app_role,uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(app_role,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(app_role,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(app_role,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.has_role(uuid,app_role) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,app_role) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,app_role) TO service_role;
REVOKE ALL ON FUNCTION public.is_org_owner(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.is_org_owner(uuid,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_org_owner(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_owner(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.lesson_write_guard_allowed(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.lesson_write_guard_allowed(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.module_write_guard_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.module_write_guard_allowed(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.normalize_org_staff_permission(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.normalize_org_staff_permission(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_org_staff_permission(text) TO anon;
GRANT EXECUTE ON FUNCTION public.normalize_org_staff_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_org_staff_permission(text) TO service_role;
REVOKE ALL ON FUNCTION public.org_role_default_permissions(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.org_role_default_permissions(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_role_default_permissions(text) TO anon;
GRANT EXECUTE ON FUNCTION public.org_role_default_permissions(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_role_default_permissions(text) TO service_role;
REVOKE ALL ON FUNCTION public.uc_document_scope_allowed(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.uc_document_scope_allowed(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.uc_document_scope_allowed(uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.uc_document_teacher_limited(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.uc_document_teacher_limited(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.uc_document_teacher_limited(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.uc_document_user_course_scope(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.uc_document_user_course_scope(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.uc_document_user_course_scope(uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.uc_enrollment_delete_actor_writable() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.uc_enrollment_delete_has_witness(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.uc_enrollment_delete_live_allowed(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.uc_platform_document_action_allowed(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.uc_platform_document_action_allowed(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.uc_platform_document_action_allowed(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.uc_student_frdo_staff_org_allowed(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
ALTER TABLE public."course_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."course_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."lesson_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."lessons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."library_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."module_access_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."module_access_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."paid_umk_20260922_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."paid_umk_20260922_grants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_deletion_no_revoked_access" ON public."course_documents" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)) WITH CHECK (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed));
CREATE POLICY "course_documents_delete_legacy" ON public."course_documents" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((library_document_id IS NULL) AND can_access_course(course_id, 'courses.write'::text)));
CREATE POLICY "course_documents_insert" ON public."course_documents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((can_access_course(course_id, 'courses.write'::text) AND ((library_document_id IS NULL) OR (EXISTS ( SELECT 1
   FROM library_documents managed_document
  WHERE ((managed_document.id = course_documents.library_document_id) AND can_access_organization(managed_document.organization_id, 'library.write'::text)))))));
CREATE POLICY "course_documents_select" ON public."course_documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((can_access_course(course_id, 'courses.read'::text) AND ((library_document_id IS NULL) OR (visible_to_students AND can_read_electronic_library_document(library_document_id)) OR (EXISTS ( SELECT 1
   FROM library_documents managed_document
  WHERE ((managed_document.id = course_documents.library_document_id) AND can_access_organization(managed_document.organization_id, 'library.write'::text)))))) OR (can_access_course_as_learner(course_id) AND (((library_document_id IS NULL) AND (EXISTS ( SELECT 1
   FROM courses learner_course
  WHERE ((learner_course.id = course_documents.course_id) AND (learner_course.is_published = true))))) OR (visible_to_students AND can_read_electronic_library_document(library_document_id))))));
CREATE POLICY "course_documents_update" ON public."course_documents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((can_access_course(course_id, 'courses.write'::text) AND ((library_document_id IS NULL) OR (EXISTS ( SELECT 1
   FROM library_documents managed_document
  WHERE ((managed_document.id = course_documents.library_document_id) AND can_access_organization(managed_document.organization_id, 'library.write'::text))))))) WITH CHECK ((can_access_course(course_id, 'courses.write'::text) AND ((library_document_id IS NULL) OR (EXISTS ( SELECT 1
   FROM library_documents managed_document
  WHERE ((managed_document.id = course_documents.library_document_id) AND can_access_organization(managed_document.organization_id, 'library.write'::text)))))));
CREATE POLICY "paid_20260922_document_select" ON public."course_documents" AS RESTRICTIVE FOR SELECT TO PUBLIC USING (_paid_20260922_course_read(course_id, COALESCE(visible_to_students, false)));
CREATE POLICY "paid_umk_20260922_course_documents_boundary" ON public."course_documents" AS RESTRICTIVE FOR SELECT TO PUBLIC USING (((NOT paid_umk_20260922_is_asset(library_document_id)) OR paid_umk_20260922_can_read_assignment(course_id, library_document_id, visible_to_students)));
CREATE POLICY "paid_umk_20260922_course_documents_select" ON public."course_documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (paid_umk_20260922_can_read_assignment(course_id, library_document_id, visible_to_students));
CREATE POLICY "Modules viewable by course viewers" ON public."course_modules" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = course_modules.course_id) AND ((c.is_published = true) OR (c.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))))));
CREATE POLICY "Org and admins can create modules" ON public."course_modules" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = course_modules.course_id) AND ((c.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))))));
CREATE POLICY "Org and admins can delete modules" ON public."course_modules" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = course_modules.course_id) AND ((c.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))))));
CREATE POLICY "Org and admins can update modules" ON public."course_modules" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = course_modules.course_id) AND ((c.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))))));
CREATE POLICY "account_deletion_no_revoked_access" ON public."course_modules" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)) WITH CHECK (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed));
CREATE POLICY "course_library_unpublished_module_guard" ON public."course_modules" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM courses visible_course
  WHERE ((visible_course.id = course_modules.course_id) AND ((visible_course.is_published = true) OR (NOT COALESCE((visible_course.landing_content @> '{"electronic_library": {"enabled": true}}'::jsonb), false)) OR can_access_course(visible_course.id, 'courses.read'::text))))));
CREATE POLICY "module_write_guard_delete" ON public."course_modules" AS RESTRICTIVE FOR DELETE TO PUBLIC USING (lesson_write_guard_allowed(course_id));
CREATE POLICY "module_write_guard_insert" ON public."course_modules" AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK (lesson_write_guard_allowed(course_id));
CREATE POLICY "module_write_guard_update" ON public."course_modules" AS RESTRICTIVE FOR UPDATE TO PUBLIC USING (lesson_write_guard_allowed(course_id)) WITH CHECK (lesson_write_guard_allowed(course_id));
CREATE POLICY "Admins can manage all courses" ON public."courses" AS PERMISSIVE FOR ALL TO PUBLIC USING (has_role('admin'::app_role, auth.uid())) WITH CHECK (has_role('admin'::app_role, auth.uid()));
CREATE POLICY "Companies can view org courses" ON public."courses" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((organization_id = ( SELECT c.organization_id
   FROM companies c
  WHERE (c.id = current_company_id()))));
CREATE POLICY "Org staff can delete courses" ON public."courses" AS PERMISSIVE FOR DELETE TO "authenticated" USING (can_access_organization(organization_id, 'courses.write'::text));
CREATE POLICY "Org staff can insert courses" ON public."courses" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (can_access_organization(organization_id, 'courses.write'::text));
CREATE POLICY "Org staff can update courses" ON public."courses" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (can_access_organization(organization_id, 'courses.write'::text)) WITH CHECK (can_access_organization(organization_id, 'courses.write'::text));
CREATE POLICY "Org staff can view courses" ON public."courses" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_access_organization(organization_id, 'courses.read'::text));
CREATE POLICY "Published courses are viewable by all" ON public."courses" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_published = true));
CREATE POLICY "account_deletion_no_revoked_access" ON public."courses" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)) WITH CHECK (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed));
CREATE POLICY "course_library_unpublished_course_guard" ON public."courses" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (((is_published = true) OR (NOT COALESCE((landing_content @> '{"electronic_library": {"enabled": true}}'::jsonb), false)) OR can_access_course(id, 'courses.read'::text)));
CREATE POLICY "Companies can view employee enrollments" ON public."enrollments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id IN ( SELECT p.user_id
   FROM profiles p
  WHERE (p.company_id = current_company_id()))));
CREATE POLICY "Org staff can delete enrollments" ON public."enrollments" AS PERMISSIVE FOR DELETE TO "authenticated" USING (can_access_course(course_id, 'students.write'::text));
CREATE POLICY "Org staff can insert enrollments" ON public."enrollments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (can_access_course(course_id, 'students.write'::text));
CREATE POLICY "Org staff can update enrollments" ON public."enrollments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (can_access_course(course_id, 'students.write'::text)) WITH CHECK (can_access_course(course_id, 'students.write'::text));
CREATE POLICY "Org staff can view enrollments" ON public."enrollments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_access_course(course_id, 'students.read'::text));
CREATE POLICY "Org users and admins can delete enrollments" ON public."enrollments" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((has_role('admin'::app_role, auth.uid()) OR (EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = enrollments.course_id) AND (c.organization_id = current_organization_id()))))));
CREATE POLICY "Org users and admins can update enrollments" ON public."enrollments" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((has_role('admin'::app_role, auth.uid()) OR (EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = enrollments.course_id) AND (c.organization_id = current_organization_id()))))));
CREATE POLICY "Org users and admins can view enrollments for their courses" ON public."enrollments" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((user_id = auth.uid()) OR has_role('admin'::app_role, auth.uid()) OR (EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = enrollments.course_id) AND (c.organization_id = current_organization_id()))))));
CREATE POLICY "Users and org users can create enrollments" ON public."enrollments" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((user_id = auth.uid()) OR has_role('admin'::app_role, auth.uid()) OR (EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = enrollments.course_id) AND (c.organization_id = current_organization_id()))))));
CREATE POLICY "Users can update own enrollments" ON public."enrollments" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own enrollments" ON public."enrollments" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((user_id = auth.uid()));
CREATE POLICY "account_deletion_no_revoked_access" ON public."enrollments" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)) WITH CHECK (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed));
CREATE POLICY "uc_document_assigned_read" ON public."enrollments" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = enrollments.course_id) AND uc_document_user_course_scope(c.organization_id, enrollments.user_id, c.id)))));
CREATE POLICY "uc_enrollment_delete_boundary" ON public."enrollments" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (can_delete_course_enrollment(id));
CREATE POLICY "Lesson attachments readable by course participants" ON public."lesson_attachments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_read_lesson_attachment(lesson_id));
CREATE POLICY "Org or admin can delete lesson attachments" ON public."lesson_attachments" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role('admin'::app_role, auth.uid()) OR (EXISTS ( SELECT 1
   FROM (lessons l
     JOIN courses c ON ((c.id = l.course_id)))
  WHERE ((l.id = lesson_attachments.lesson_id) AND (c.organization_id = current_organization_id()))))));
CREATE POLICY "Org or admin can insert lesson attachments" ON public."lesson_attachments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role('admin'::app_role, auth.uid()) OR (EXISTS ( SELECT 1
   FROM (lessons l
     JOIN courses c ON ((c.id = l.course_id)))
  WHERE ((l.id = lesson_attachments.lesson_id) AND (c.organization_id = current_organization_id()))))));
CREATE POLICY "Org or admin can update lesson attachments" ON public."lesson_attachments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role('admin'::app_role, auth.uid()) OR (EXISTS ( SELECT 1
   FROM (lessons l
     JOIN courses c ON ((c.id = l.course_id)))
  WHERE ((l.id = lesson_attachments.lesson_id) AND (c.organization_id = current_organization_id()))))));
CREATE POLICY "Organization owners can delete lesson attachments" ON public."lesson_attachments" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (lessons l
     JOIN courses c ON ((c.id = l.course_id)))
  WHERE ((l.id = lesson_attachments.lesson_id) AND (c.organization_id = current_organization_id())))));
CREATE POLICY "Organization owners can insert lesson attachments" ON public."lesson_attachments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM (lessons l
     JOIN courses c ON ((c.id = l.course_id)))
  WHERE ((l.id = lesson_attachments.lesson_id) AND (c.organization_id = current_organization_id())))));
CREATE POLICY "Organization owners can update lesson attachments" ON public."lesson_attachments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (lessons l
     JOIN courses c ON ((c.id = l.course_id)))
  WHERE ((l.id = lesson_attachments.lesson_id) AND (c.organization_id = current_organization_id())))));
CREATE POLICY "account_deletion_no_revoked_access" ON public."lesson_attachments" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)) WITH CHECK (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed));
CREATE POLICY "paid_20260922_attachment_select" ON public."lesson_attachments" AS RESTRICTIVE FOR SELECT TO PUBLIC USING (_paid_20260922_lesson_read(lesson_id, false, true));
CREATE POLICY "Lessons viewable if enrolled or org user or admin" ON public."lessons" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((has_role('admin'::app_role, auth.uid()) OR (EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = lessons.course_id) AND (c.is_published = true)))) OR (EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = lessons.course_id) AND (c.organization_id = current_organization_id()))))));
CREATE POLICY "Org staff can manage lessons" ON public."lessons" AS PERMISSIVE FOR ALL TO "authenticated" USING (can_access_course(course_id, 'courses.write'::text)) WITH CHECK (can_access_course(course_id, 'courses.write'::text));
CREATE POLICY "Org staff can view lessons" ON public."lessons" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_access_course(course_id, 'courses.read'::text));
CREATE POLICY "Org users and admins can manage lessons" ON public."lessons" AS PERMISSIVE FOR ALL TO PUBLIC USING ((has_role('admin'::app_role, auth.uid()) OR (EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = lessons.course_id) AND (c.organization_id = current_organization_id())))))) WITH CHECK ((has_role('admin'::app_role, auth.uid()) OR (EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = lessons.course_id) AND (c.organization_id = current_organization_id()))))));
CREATE POLICY "account_deletion_no_revoked_access" ON public."lessons" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)) WITH CHECK (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed));
CREATE POLICY "lesson_write_guard_delete" ON public."lessons" AS RESTRICTIVE FOR DELETE TO PUBLIC USING (lesson_write_guard_allowed(course_id));
CREATE POLICY "lesson_write_guard_insert" ON public."lessons" AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK (lesson_write_guard_allowed(course_id));
CREATE POLICY "lesson_write_guard_update" ON public."lessons" AS RESTRICTIVE FOR UPDATE TO PUBLIC USING (lesson_write_guard_allowed(course_id)) WITH CHECK (lesson_write_guard_allowed(course_id));
CREATE POLICY "paid_20260922_lesson_select" ON public."lessons" AS RESTRICTIVE FOR SELECT TO PUBLIC USING (_paid_20260922_course_read(course_id, true));
CREATE POLICY "account_deletion_no_revoked_access" ON public."library_documents" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)) WITH CHECK (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed));
CREATE POLICY "library_documents_insert" ON public."library_documents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (can_access_organization(organization_id, 'library.write'::text));
CREATE POLICY "library_documents_select" ON public."library_documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_read_electronic_library_document(id));
CREATE POLICY "library_documents_update" ON public."library_documents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (can_access_organization(organization_id, 'library.write'::text)) WITH CHECK (can_access_organization(organization_id, 'library.write'::text));
CREATE POLICY "Admins can manage marketplace courses" ON public."marketplace_courses" AS PERMISSIVE FOR ALL TO PUBLIC USING (has_role('admin'::app_role, auth.uid())) WITH CHECK (has_role('admin'::app_role, auth.uid()));
CREATE POLICY "Anyone can view active marketplace courses" ON public."marketplace_courses" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((is_active = true) AND (is_validated = true)));
CREATE POLICY "Org users can manage their marketplace courses" ON public."marketplace_courses" AS PERMISSIVE FOR ALL TO PUBLIC USING (((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))) WITH CHECK (((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())));
CREATE POLICY "account_deletion_no_revoked_access" ON public."marketplace_courses" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)) WITH CHECK (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed));
CREATE POLICY "Buyers can view own orders" ON public."marketplace_orders" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((buyer_user_id = auth.uid()) OR (buyer_organization_id = current_organization_id())));
CREATE POLICY "Sellers can update orders for their courses" ON public."marketplace_orders" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM marketplace_courses mc
  WHERE ((mc.id = marketplace_orders.marketplace_course_id) AND ((mc.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))))));
CREATE POLICY "Sellers can view orders for their courses" ON public."marketplace_orders" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM marketplace_courses mc
  WHERE ((mc.id = marketplace_orders.marketplace_course_id) AND ((mc.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))))));
CREATE POLICY "account_deletion_no_revoked_access" ON public."marketplace_orders" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)) WITH CHECK (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed));
CREATE POLICY "Admins manage all module overrides" ON public."module_access_overrides" AS PERMISSIVE FOR ALL TO PUBLIC USING (has_role('admin'::app_role, auth.uid())) WITH CHECK (has_role('admin'::app_role, auth.uid()));
CREATE POLICY "Org manages module overrides of own courses" ON public."module_access_overrides" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM (course_modules m
     JOIN courses c ON ((c.id = m.course_id)))
  WHERE ((m.id = module_access_overrides.module_id) AND (c.organization_id = current_organization_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (course_modules m
     JOIN courses c ON ((c.id = m.course_id)))
  WHERE ((m.id = module_access_overrides.module_id) AND (c.organization_id = current_organization_id())))));
CREATE POLICY "Students read own module overrides" ON public."module_access_overrides" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((user_id = auth.uid()));
CREATE POLICY "account_deletion_no_revoked_access" ON public."module_access_overrides" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)) WITH CHECK (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed));
CREATE POLICY "module_override_write_guard_delete" ON public."module_access_overrides" AS RESTRICTIVE FOR DELETE TO PUBLIC USING (module_write_guard_allowed(module_id, NULL::uuid));
CREATE POLICY "module_override_write_guard_insert" ON public."module_access_overrides" AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK (module_write_guard_allowed(module_id, NULL::uuid));
CREATE POLICY "module_override_write_guard_update" ON public."module_access_overrides" AS RESTRICTIVE FOR UPDATE TO PUBLIC USING (module_write_guard_allowed(module_id, NULL::uuid)) WITH CHECK (module_write_guard_allowed(module_id, NULL::uuid));
CREATE POLICY "Admins manage all module schedules" ON public."module_access_schedules" AS PERMISSIVE FOR ALL TO PUBLIC USING (has_role('admin'::app_role, auth.uid())) WITH CHECK (has_role('admin'::app_role, auth.uid()));
CREATE POLICY "Enrolled students read module schedules" ON public."module_access_schedules" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.course_id = module_access_schedules.course_id) AND (e.user_id = auth.uid())))));
CREATE POLICY "Org manages module schedules of own courses" ON public."module_access_schedules" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = module_access_schedules.course_id) AND (c.organization_id = current_organization_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = module_access_schedules.course_id) AND (c.organization_id = current_organization_id())))));
CREATE POLICY "account_deletion_no_revoked_access" ON public."module_access_schedules" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)) WITH CHECK (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed));
CREATE POLICY "module_schedule_write_guard_delete" ON public."module_access_schedules" AS RESTRICTIVE FOR DELETE TO PUBLIC USING ((module_write_guard_allowed(module_id, NULL::uuid) AND lesson_write_guard_allowed(course_id)));
CREATE POLICY "module_schedule_write_guard_insert" ON public."module_access_schedules" AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK (module_write_guard_allowed(module_id, course_id));
CREATE POLICY "module_schedule_write_guard_update" ON public."module_access_schedules" AS RESTRICTIVE FOR UPDATE TO PUBLIC USING ((module_write_guard_allowed(module_id, NULL::uuid) AND lesson_write_guard_allowed(course_id))) WITH CHECK (module_write_guard_allowed(module_id, course_id));
CREATE POLICY "account_deletion_no_revoked_access" ON public."paid_umk_20260922_assets" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)) WITH CHECK (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed));
CREATE POLICY "account_deletion_no_revoked_access" ON public."paid_umk_20260922_grants" AS RESTRICTIVE FOR ALL TO "authenticated" USING (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)) WITH CHECK (( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed));
CREATE TRIGGER paid_umk_20260922_protect_assignment BEFORE INSERT OR UPDATE ON public.course_documents FOR EACH ROW EXECUTE FUNCTION paid_umk_20260922_protect_assignment();
CREATE TRIGGER update_course_documents_updated_at BEFORE UPDATE ON public.course_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER validate_course_library_assignment_scope_trigger BEFORE INSERT OR UPDATE ON public.course_documents FOR EACH ROW EXECUTE FUNCTION validate_course_library_assignment_scope();
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION account_deletion_subject_write_guard('user_id');
CREATE TRIGGER guard_marketplace_order_delivery BEFORE INSERT OR UPDATE OF status, paid_at ON public.marketplace_orders FOR EACH ROW EXECUTE FUNCTION guard_marketplace_order_delivery();
CREATE TRIGGER paid_umk_20260922_deliver AFTER INSERT OR UPDATE OF status ON public.marketplace_orders FOR EACH ROW EXECUTE FUNCTION paid_umk_20260922_deliver();
CREATE TRIGGER update_marketplace_orders_updated_at BEFORE UPDATE ON public.marketplace_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public.module_access_overrides FOR EACH ROW EXECUTE FUNCTION account_deletion_subject_write_guard('user_id');
CREATE TRIGGER trg_mao_updated_at BEFORE UPDATE ON public.module_access_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_mas_updated_at BEFORE UPDATE ON public.module_access_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER paid_umk_20260922_protect_canonical BEFORE UPDATE ON public.library_documents FOR EACH ROW EXECUTE FUNCTION paid_umk_20260922_protect_canonical();
CREATE TRIGGER update_library_documents_updated_at BEFORE UPDATE ON public.library_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER validate_library_document_scope_trigger BEFORE INSERT OR UPDATE ON public.library_documents FOR EACH ROW EXECUTE FUNCTION validate_library_document_scope();
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE ALL ON public.paid_umk_20260922_assets,public.paid_umk_20260922_grants,storage.buckets,storage.objects,public.org_documents,public.org_document_versions FROM PUBLIC,anon,authenticated,service_role;
REVOKE INSERT,UPDATE,DELETE ON public.user_roles,public.profiles,public.org_staff,public.admin_staff,public.account_deletion_revocations,public.organizations,public.companies,public.uc_enrollment_withdrawal_states,public.uc_course_assignment_removal_events,public.uc_enrollment_delete_witnesses,public.balance_transactions,public.qa_retained_results,public.test_questions,public.lesson_progress FROM authenticated;
CREATE FUNCTION public.prog_test_question_key_valid(p_options jsonb,p_answer integer)RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$SELECT jsonb_typeof(p_options)='array'AND p_answer>=0 AND p_answer<jsonb_array_length(p_options)$f$;
COMMIT;
