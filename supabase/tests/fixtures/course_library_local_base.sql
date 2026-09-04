\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION storage.foldername(object_name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_split_to_array(trim(both '/' from object_name), '/')
$$;

CREATE TYPE public.app_role AS ENUM ('admin', 'organization', 'student');

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text,
  branding jsonb,
  student_dashboard_settings jsonb,
  subscription_plan text
);

CREATE TABLE public.courses (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  title text NOT NULL,
  description text,
  duration text,
  is_published boolean NOT NULL DEFAULT false,
  landing_content jsonb,
  skip_video_identification boolean,
  cover_image_url text
);

CREATE TABLE public.course_modules (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id),
  title text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lessons (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id),
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.test_questions (
  id uuid PRIMARY KEY,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id),
  question text NOT NULL
);

CREATE TABLE public.lesson_progress (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id),
  completed boolean NOT NULL DEFAULT false
);

CREATE TABLE public.library_folders (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  parent_id uuid REFERENCES public.library_folders(id),
  name text NOT NULL
);

CREATE TABLE public.library_documents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  type text NOT NULL,
  description text,
  file_url text,
  file_size bigint,
  folder_id uuid REFERENCES public.library_folders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.course_documents (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id),
  name text NOT NULL,
  type text NOT NULL,
  description text,
  file_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id),
  progress integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  time_spent integer NOT NULL DEFAULT 0,
  expires_at timestamptz
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  organization_id uuid REFERENCES public.organizations(id),
  full_name text,
  onboarding_completed boolean NOT NULL DEFAULT false
);

CREATE TABLE public.student_groups (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL
);

CREATE TABLE public.labor_safety_profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.student_identity_documents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL
);

CREATE TABLE public.video_identifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  status text NOT NULL
);

CREATE TABLE public.sintagma_staging_guard (
  token text PRIMARY KEY
);

CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  public boolean NOT NULL DEFAULT false
);

CREATE TABLE storage.objects (
  id uuid PRIMARY KEY,
  bucket_id text NOT NULL REFERENCES storage.buckets(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.storage_try_uuid(value text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN value::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_organization(
  organization_id uuid,
  permission_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    organization_id = '11111111-1111-1111-1111-111111111111'::uuid
    AND (
      (
        auth.uid() = 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
        AND permission_name IN ('library.read', 'library.write')
      )
      OR (
        auth.uid() = '77777777-7777-7777-7777-777777777777'::uuid
        AND permission_name = 'library.read'
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_access_course(
  course_id uuid,
  permission_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses fixture_course
    WHERE fixture_course.id = course_id
      AND fixture_course.organization_id =
        '11111111-1111-1111-1111-111111111111'::uuid
      AND (
        (
          auth.uid() = 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
          AND permission_name IN ('courses.read', 'courses.write')
        )
        OR (
          auth.uid() = '77777777-7777-7777-7777-777777777777'::uuid
          AND permission_name = 'courses.read'
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(
  requested_role public.app_role,
  user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.has_org_staff_permission(
  user_id uuid,
  organization_id uuid,
  permission_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$ SELECT false $$;

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY fixture_course_select
ON public.courses
FOR SELECT TO authenticated
USING (
  is_published
  OR organization_id = NULLIF(
    current_setting('request.jwt.claim.org_id', true),
    ''
  )::uuid
);

CREATE POLICY fixture_module_select
ON public.course_modules
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.courses course_row
    WHERE course_row.id = course_modules.course_id
  )
);

GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, storage
  TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, auth, storage
  TO authenticated, service_role;

INSERT INTO public.organizations (
  id, name, description, branding, student_dashboard_settings, subscription_plan
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Local staging organization',
  'Parser and RLS fixture only',
  '{}'::jsonb,
  '{}'::jsonb,
  'free'
);

INSERT INTO public.courses (
  id, organization_id, title, description, duration, is_published,
  landing_content, skip_video_identification, cover_image_url
) VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Protected published course',
  'Must remain unchanged by dry-run',
  '72',
  true,
  '{}'::jsonb,
  false,
  'https://example.test/cover.png'
),
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '11111111-1111-1111-1111-111111111111',
  'Unpublished 178-hour library course',
  'Must never reach learner shell',
  '178',
  false,
  '{"electronic_library":{"enabled":true}}'::jsonb,
  false,
  'https://example.test/private-cover.png'
);

INSERT INTO public.course_modules (id, course_id, title, order_index) VALUES
(
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Published module',
  1
),
(
  'cccccccc-cccc-cccc-cccc-ccccccccccc2',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Draft library module',
  1
);

INSERT INTO public.lessons (id, course_id, title) VALUES
(
  '14141414-1414-1414-1414-141414141414',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Protected lesson'
),
(
  '15151515-1515-1515-1515-151515151515',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Private draft lesson'
);

INSERT INTO public.test_questions (id, lesson_id, question) VALUES
(
  '16161616-1616-1616-1616-161616161616',
  '14141414-1414-1414-1414-141414141414',
  'Protected question'
),
(
  '17171717-1717-1717-1717-171717171717',
  '15151515-1515-1515-1515-151515151515',
  'Private draft question'
);

INSERT INTO public.course_documents (
  id, course_id, name, type, description, file_url
) VALUES (
  '13131313-1313-1313-1313-131313131313',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Protected legacy document',
  'pdf',
  'Must remain unchanged',
  'https://example.test/protected.pdf'
);

INSERT INTO public.profiles (id, user_id, organization_id, full_name) VALUES
(
  '18181818-1818-1818-1818-181818181818',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '11111111-1111-1111-1111-111111111111',
  'Enrolled learner'
),
(
  '19191919-1919-1919-1919-191919191919',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  '11111111-1111-1111-1111-111111111111',
  'Unenrolled tenant user'
),
(
  '20202020-2020-2020-2020-202020202020',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  '11111111-1111-1111-1111-111111111111',
  'Authorized staff'
),
(
  '29292929-2929-2929-2929-292929292929',
  '77777777-7777-7777-7777-777777777777',
  '11111111-1111-1111-1111-111111111111',
  'Read-only teacher'
);

INSERT INTO public.enrollments (
  id, user_id, course_id, status, expires_at
) VALUES (
  '21212121-2121-2121-2121-212121212121',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'active',
  now() + interval '7 days'
);

INSERT INTO storage.buckets (id, public)
VALUES ('library-files', true);

INSERT INTO public.sintagma_staging_guard (token)
VALUES ('local-isolated-course-library');
