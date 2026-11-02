-- Isolated model only. Synthetic actor bindings are never used in production.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('lab.actor',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
CREATE TABLE organizations(id uuid PRIMARY KEY, subscription_plan text DEFAULT 'free', custom_max_courses integer);
CREATE TABLE lab_editors(actor uuid,organization_id uuid,PRIMARY KEY(actor,organization_id));
CREATE FUNCTION public.can_access_organization(p_org uuid,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p_action='courses.write' AND EXISTS(SELECT 1 FROM lab_editors WHERE actor=auth.uid() AND organization_id=p_org)
$$;
CREATE TABLE courses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),title text,description text,is_published boolean DEFAULT false,landing_content jsonb,system_key text);
CREATE TABLE course_modules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid REFERENCES courses(id) ON DELETE CASCADE,title text,order_index integer);
CREATE TABLE lessons(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid REFERENCES courses(id) ON DELETE CASCADE,module_id uuid REFERENCES course_modules(id),title text,type text,content text,order_index integer,test_passing_score integer,test_questions_count integer,test_show_answers boolean,is_locked boolean,metadata jsonb);
CREATE TABLE test_questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lesson_id uuid REFERENCES lessons(id) ON DELETE CASCADE,question text,options jsonb,correct_answer integer,order_index integer,explanation text,is_bank_question boolean,
 CHECK(correct_answer>=0 AND correct_answer<jsonb_array_length(options)));
CREATE TABLE organization_billing_agreements(organization_id uuid,effective_from date,effective_to date);
CREATE TABLE attempts(id uuid PRIMARY KEY,score integer,answers jsonb);
INSERT INTO attempts VALUES('99999999-9999-4999-8999-999999999999',81,'{"old":true}');
INSERT INTO organizations VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','free',3),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','free',3);
INSERT INTO lab_editors VALUES('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
