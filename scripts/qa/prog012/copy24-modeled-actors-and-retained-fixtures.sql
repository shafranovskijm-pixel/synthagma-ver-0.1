-- SYNTHETIC SQL fixtures only, in the guarded private copy24 model.
\set ON_ERROR_STOP on
DO $g$BEGIN IF current_database()<>'sintagma_copy24_lab_20261028'OR current_user<>'postgres'OR session_user<>'postgres'OR inet_server_addr()IS DISTINCT FROM'127.0.0.1'::inet OR inet_server_port()<>5432 OR current_setting('data_directory')<>'/var/lib/postgresql/data'OR current_setting('pcr.lab_authorized',true)IS DISTINCT FROM'source-reviewed-root-run-only'OR current_setting('server_version_num')<>'170011'THEN RAISE EXCEPTION 'COPY24_SYNTHETIC_ONLY';END IF;END;$g$;
INSERT INTO public.organizations(id,balance)VALUES
('4ac2c05a-d8b5-4e72-ba31-f2c743091d95',100000),('20000000-0000-0000-0000-000000000001',100000),('20000000-0000-0000-0000-000000000002',100000);
INSERT INTO auth.users(id)VALUES
('11000000-0000-0000-0000-000000000001'),('11000000-0000-0000-0000-000000000002'),('11000000-0000-0000-0000-000000000003'),('11000000-0000-0000-0000-000000000004'),('11000000-0000-0000-0000-000000000005'),('11000000-0000-0000-0000-000000000006'),('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
INSERT INTO public.profiles(user_id,organization_id)VALUES
('11000000-0000-0000-0000-000000000001','4ac2c05a-d8b5-4e72-ba31-f2c743091d95'),
('11000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001'),
('11000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001'),
('11000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001'),
('11000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000002'),
('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','4ac2c05a-d8b5-4e72-ba31-f2c743091d95');
INSERT INTO public.user_roles(user_id,role)VALUES
('11000000-0000-0000-0000-000000000001','admin'),('11000000-0000-0000-0000-000000000002','organization'),('11000000-0000-0000-0000-000000000003','organization'),('11000000-0000-0000-0000-000000000004','student'),('11000000-0000-0000-0000-000000000005','student'),('11000000-0000-0000-0000-000000000006','admin'),('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','admin');
INSERT INTO storage.buckets(id,name,public)VALUES('course-files','course-files',false),('library-files','library-files',false),('org-documents','org-documents',false);
INSERT INTO public.courses(id,organization_id,title,is_published,price)VALUES
('30000000-0000-0000-0000-00000000000e','20000000-0000-0000-0000-000000000001','OLD CLIENT SYNTHETIC',true,1749),
('30000000-0000-0000-0000-00000000000f','4ac2c05a-d8b5-4e72-ba31-f2c743091d95','OLD OWN LEGACY SYNTHETIC',true,0);
INSERT INTO public.course_modules(id,course_id,title,order_index)VALUES('40000000-0000-0000-0000-00000000000e','30000000-0000-0000-0000-00000000000e','OLD',0);
INSERT INTO public.lessons(id,course_id,module_id,title,type,content,order_index)VALUES('50000000-0000-0000-0000-00000000000e','30000000-0000-0000-0000-00000000000e','40000000-0000-0000-0000-00000000000e','OLD synthetic','text','Preserve old synthetic content',0);
INSERT INTO public.test_questions(id,lesson_id,question,options,correct_answer,order_index)VALUES('60000000-0000-0000-0000-00000000000e','50000000-0000-0000-0000-00000000000e','Synthetic old control?','["28","17"]',0,0);
INSERT INTO public.course_documents(id,course_id,name,file_url)VALUES
('80000000-0000-0000-0000-00000000000e','30000000-0000-0000-0000-00000000000e','OLD CLIENT','https://example.invalid/old-client.pdf'),
('80000000-0000-0000-0000-00000000000f','30000000-0000-0000-0000-00000000000f','OLD OWN','https://example.invalid/old-own.pdf');
INSERT INTO public.marketplace_courses(id,course_id,organization_id,is_validated,is_active,price_organization)VALUES
('70000000-0000-0000-0000-00000000000e','30000000-0000-0000-0000-00000000000e','20000000-0000-0000-0000-000000000001',true,true,1749),
('70000000-0000-0000-0000-00000000000f','30000000-0000-0000-0000-00000000000f',NULL,true,true,0);
INSERT INTO public.qa_retained_results(id,source_course_id,score,answers)VALUES(1,'30000000-0000-0000-0000-00000000000e',73,'{"old_synthetic_answer":"retained"}');
