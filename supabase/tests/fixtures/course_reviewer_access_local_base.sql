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
CREATE SCHEMA IF NOT EXISTS public;

GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE public.app_role AS ENUM ('admin', 'organization', 'student');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  role public.app_role NOT NULL
);

CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles role_row
    WHERE role_row.user_id = _user_id AND role_row.role = _role
  )
$$;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  organization_id uuid REFERENCES public.organizations(id),
  full_name text,
  email text,
  login text UNIQUE
);

CREATE TABLE public.courses (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  title text NOT NULL,
  description text,
  duration text,
  is_published boolean NOT NULL DEFAULT false,
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
  module_id uuid REFERENCES public.course_modules(id),
  title text NOT NULL,
  type text NOT NULL DEFAULT 'text',
  content text,
  order_index integer NOT NULL DEFAULT 0,
  is_locked boolean NOT NULL DEFAULT false,
  test_passing_score integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.test_questions (
  id uuid PRIMARY KEY,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id),
  question text NOT NULL,
  options jsonb NOT NULL,
  correct_answer integer,
  order_index integer NOT NULL DEFAULT 0,
  image_url text,
  explanation text
);

CREATE TABLE public.lesson_attachments (
  id uuid PRIMARY KEY,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id),
  name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  category text NOT NULL DEFAULT 'material',
  order_index integer NOT NULL DEFAULT 0
);

CREATE TABLE public.library_documents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  type text NOT NULL,
  description text,
  file_url text,
  source_name text,
  external_url text,
  storage_path text,
  original_filename text,
  mime_type text,
  edition_label text,
  last_checked_at timestamptz,
  usage_basis text,
  library_status text
);

CREATE TABLE public.course_documents (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id),
  name text NOT NULL,
  type text NOT NULL,
  description text,
  file_url text,
  library_document_id uuid REFERENCES public.library_documents(id),
  module_id uuid REFERENCES public.course_modules(id),
  library_category text,
  sort_order integer NOT NULL DEFAULT 0,
  visible_to_students boolean NOT NULL DEFAULT true,
  allow_download boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id)
);

CREATE TABLE public.lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id)
);

CREATE TABLE public.test_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id)
);

CREATE TABLE public.homework_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id)
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

CREATE OR REPLACE FUNCTION public.test_assert(condition boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', message;
  END IF;
END;
$$;
