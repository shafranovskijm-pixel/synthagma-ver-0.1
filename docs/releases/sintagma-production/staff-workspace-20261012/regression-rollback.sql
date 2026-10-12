-- Called ONLY by supabase/tests/test-staff-workspace-access.mjs inside the isolated
-- fixture transaction. The runner always ROLLBACKs. Not a live smoke test.
DO $$ BEGIN
  IF current_setting('sintagma.staff_access_fixture',true) IS DISTINCT FROM 'isolated'
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='organizations' AND column_name='private_fixture_marker') THEN
    RAISE EXCEPTION 'Isolated synthetic fixture required';
  END IF;
END $$;
CREATE FUNCTION public.synthetic_uid(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
$$;
CREATE FUNCTION public.synthetic_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Staff regression failed: %',label; END IF;
  PERFORM set_config('sintagma.staff_assertions',(current_setting('sintagma.staff_assertions')::int+1)::text,true);
END $$;
CREATE FUNCTION public.synthetic_denied(statement text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM public.synthetic_assert(true,label); RETURN;
  END;
  RAISE EXCEPTION 'Expected SQLSTATE 42501: %',label;
END $$;

SELECT synthetic_assert(NOT has_function_privilege('anon','get_organization_core(uuid)','EXECUTE'),'anonymous core execute revoked');
SELECT synthetic_assert(has_function_privilege('authenticated','get_organization_core(uuid)','EXECUTE'),'authenticated core execute');
SELECT synthetic_assert(has_function_privilege('service_role','get_organization_core(uuid)','EXECUTE'),'service core execute');
SELECT synthetic_assert(NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='companies'
  AND policyname IN ('Org users can manage their companies','Org users can view their companies')),'legacy company policies replaced');
SELECT synthetic_assert((SELECT count(*)=3 FROM pg_policies WHERE schemaname='public' AND tablename IN ('companies','labor_safety_groups','labor_safety_records')
  AND policyname='account_deletion_no_revoked_access' AND permissive='RESTRICTIVE'),'restrictive deletion fences remain');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
SELECT synthetic_assert(current_organization_id()=synthetic_uid(200),'global current-org helper remains profile-first');
SELECT synthetic_assert((SELECT count(*)=1 FROM companies WHERE organization_id=synthetic_uid(100)),'staff companies from membership A despite profile B');
SELECT synthetic_assert((SELECT count(*)=0 FROM companies WHERE organization_id=synthetic_uid(200)),'staff cannot read profile school B companies');
SELECT synthetic_assert((SELECT count(*)=1 FROM labor_safety_groups WHERE organization_id=synthetic_uid(100)),'staff OT groups A');
SELECT synthetic_assert((SELECT count(*)=1 FROM labor_safety_records),'staff OT records A only');
SELECT synthetic_assert(get_organization_core(synthetic_uid(100))->>'name'='Synthetic A','staff core A');
SELECT synthetic_assert(NOT(get_organization_core(synthetic_uid(100))?'private_fixture_marker'),'core excludes private columns');
SELECT synthetic_assert((SELECT count(*)=0 FROM organizations),'core does not expand direct organization SELECT');
SELECT synthetic_denied('INSERT INTO labor_safety_groups VALUES(synthetic_uid(403),synthetic_uid(200),''denied'')','foreign OT insert');
SELECT synthetic_denied('UPDATE labor_safety_groups SET organization_id=synthetic_uid(200) WHERE id=synthetic_uid(401)','foreign OT move');
SELECT synthetic_denied('UPDATE labor_safety_records SET group_id=synthetic_uid(402) WHERE id=synthetic_uid(501)','foreign record move');
SELECT synthetic_denied('UPDATE companies SET organization_id=synthetic_uid(200) WHERE id=synthetic_uid(301)','foreign company move');
INSERT INTO labor_safety_groups VALUES(synthetic_uid(403),synthetic_uid(100),'staff created');
INSERT INTO labor_safety_records VALUES(synthetic_uid(503),synthetic_uid(403),'staff record');
UPDATE labor_safety_records SET full_name='staff updated' WHERE id=synthetic_uid(503);
SELECT synthetic_assert((SELECT full_name='staff updated' FROM labor_safety_records WHERE id=synthetic_uid(503)),'staff OT update');
DELETE FROM labor_safety_records WHERE id=synthetic_uid(503);
DELETE FROM labor_safety_groups WHERE id=synthetic_uid(403);
SELECT synthetic_assert((SELECT count(*)=0 FROM labor_safety_groups WHERE id=synthetic_uid(403)),'staff OT delete');

SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
SELECT synthetic_assert(get_organization_core(synthetic_uid(100))->>'id'=synthetic_uid(100)::text,'teacher shell without settings.read');
SELECT synthetic_assert(NOT has_org_staff_permission(auth.uid(),synthetic_uid(100),'settings.read'),'teacher not upgraded to settings');
SELECT synthetic_assert((SELECT count(*)=0 FROM companies),'teacher cannot read companies');
SELECT synthetic_assert((SELECT count(*)=0 FROM labor_safety_groups),'teacher cannot read OT without grant');
SELECT synthetic_denied('INSERT INTO companies VALUES(synthetic_uid(303),synthetic_uid(100),''denied'',NULL)','teacher cannot create companies');
SELECT synthetic_denied('INSERT INTO labor_safety_groups VALUES(synthetic_uid(403),synthetic_uid(100),''denied'')','teacher cannot create OT');

SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000010';
SELECT synthetic_assert((SELECT count(*)=1 FROM labor_safety_records),'personal OT read grant honored');
SELECT synthetic_assert((SELECT count(*)=1 FROM companies),'personal company read grant honored');
SELECT synthetic_denied('INSERT INTO labor_safety_records VALUES(synthetic_uid(503),synthetic_uid(401),''denied'')','read-only OT cannot insert');
SELECT synthetic_denied('INSERT INTO companies VALUES(synthetic_uid(303),synthetic_uid(100),''denied'',NULL)','read-only company cannot insert');
WITH changed AS (UPDATE labor_safety_records SET full_name='must stay unchanged' RETURNING id)
  SELECT synthetic_assert((SELECT count(*)=0 FROM changed),'read-only OT cannot update');
WITH changed AS (DELETE FROM companies RETURNING id)
  SELECT synthetic_assert((SELECT count(*)=0 FROM changed),'read-only company cannot delete');

SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000006';
SELECT synthetic_assert((SELECT count(*)=1 FROM companies),'sales manager SQL companies.read matches UI');
SELECT synthetic_assert((SELECT count(*)=0 FROM labor_safety_groups),'sales manager has no OT');
INSERT INTO companies VALUES(synthetic_uid(303),synthetic_uid(100),'sales created',NULL);
UPDATE companies SET name='sales updated' WHERE id=synthetic_uid(303);
SELECT synthetic_assert((SELECT name='sales updated' FROM companies WHERE id=synthetic_uid(303)),'sales company update');
DELETE FROM companies WHERE id=synthetic_uid(303);
SELECT synthetic_assert((SELECT count(*)=0 FROM companies WHERE id=synthetic_uid(303)),'sales company delete');

SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
SELECT synthetic_assert((SELECT count(*)=0 FROM companies),'expired same-profile staff companies denied');
SELECT synthetic_assert((SELECT count(*)=0 FROM labor_safety_groups),'expired same-profile staff OT denied');
SELECT synthetic_denied('SELECT get_organization_core(synthetic_uid(100))','expired staff core cannot use same profile fallback');

SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000009';
SELECT synthetic_assert((SELECT count(*)=0 FROM companies),'revoked staff companies denied by restrictive policy');
SELECT synthetic_assert((SELECT count(*)=0 FROM labor_safety_groups),'revoked staff groups denied by restrictive policy');
SELECT synthetic_assert((SELECT count(*)=0 FROM labor_safety_records),'revoked staff records denied by restrictive policy');
SELECT synthetic_denied('SELECT get_organization_core(synthetic_uid(100))','revoked staff core denied despite SECURITY DEFINER');

SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000007';
SELECT synthetic_assert((SELECT count(*)=1 FROM companies),'company owner own record retained');
UPDATE companies SET name='company owner changed' WHERE id=synthetic_uid(302);
SELECT synthetic_assert((SELECT name='company owner changed' FROM companies WHERE id=synthetic_uid(302)),'company owner update retained');
WITH removed AS (DELETE FROM companies RETURNING id)
  SELECT synthetic_assert((SELECT count(*)=0 FROM removed),'company owner cannot delete via staff policy');

SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000008';
SELECT synthetic_assert(get_organization_core(synthetic_uid(100))->>'name'='Synthetic A','genuine learner core preserved');
SELECT synthetic_assert((SELECT count(*)=0 FROM labor_safety_groups),'ordinary learner does not gain OT management');
SELECT synthetic_denied('SELECT get_organization_core(synthetic_uid(200))','foreign learner core denied');

SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SELECT synthetic_assert((SELECT count(*)=1 FROM companies),'real owner company access preserved');
SELECT synthetic_assert((SELECT count(*)=1 FROM labor_safety_records),'real owner OT access preserved');
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
SELECT synthetic_assert((SELECT count(*)=2 FROM companies),'global admin company access preserved');
SELECT synthetic_assert((SELECT count(*)=2 FROM labor_safety_groups),'global admin OT access preserved');
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000099';
SELECT synthetic_denied('SELECT get_organization_core(synthetic_uid(100))','outsider core denied');
SET LOCAL request.jwt.claim.sub='';
SELECT synthetic_denied('SELECT get_organization_core(synthetic_uid(100))','missing identity core denied');
RESET ROLE;
-- No COMMIT here. Runner retrieves assertions and issues ROLLBACK.
