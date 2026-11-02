-- Disposable native PostgreSQL model. These synthetic claims and identities are
-- only used in support_events_lab_* databases, never on the live Supabase host.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TYPE public.app_role AS ENUM('admin','student');
CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean DEFAULT false);
CREATE TABLE auth.oauth_clients(id uuid PRIMARY KEY,deleted_at timestamptz);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 oauth_client_id uuid REFERENCES auth.oauth_clients(id) ON DELETE CASCADE,not_after timestamptz,scopes text);
CREATE TABLE auth.oauth_consents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 client_id uuid REFERENCES auth.oauth_clients(id) ON DELETE CASCADE,scopes text NOT NULL DEFAULT 'email',granted_at timestamptz DEFAULT now(),revoked_at timestamptz,UNIQUE(user_id,client_id));
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE TABLE public.profiles(user_id uuid,blocked_at timestamptz);
CREATE TABLE public.account_deletion_revocations(user_id uuid PRIMARY KEY,revoked_at timestamptz DEFAULT now());
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(auth.jwt()->>'sub','')::uuid$$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;
CREATE FUNCTION public.is_user_blocked(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=_user_id AND blocked_at IS NOT NULL);
$$;
CREATE FUNCTION public.account_deletion_access_allowed() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid());
$$;
CREATE TABLE public.support_conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,
 unread_for_admin integer DEFAULT 7,unread_for_user integer DEFAULT 2,title text DEFAULT 'Synthetic private title',created_at timestamptz DEFAULT now());
CREATE TABLE public.support_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid REFERENCES public.support_conversations(id),
 role text,content text,sender_user_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE public.support_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,
 description text,screenshot_url text,contact_phone text,created_at timestamptz DEFAULT now());
