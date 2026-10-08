-- Run only after account_deletion_assertions.sql in the disposable fixture.
-- App roles all use DB role authenticated. The new restriction must be true
-- for any live identity, false for a revoked identity even with app admin role.
BEGIN;
INSERT INTO auth.users(id,email)
 SELECT ('72000000-0000-4000-8000-00000000000'||n)::uuid,'role'||n||'@example.invalid'
 FROM generate_series(1,5) n;
INSERT INTO user_roles(user_id,role)
 SELECT ('72000000-0000-4000-8000-00000000000'||n)::uuid,
  (ARRAY['admin','organization','student','company','sales_manager'])[n]
 FROM generate_series(1,5) n;
INSERT INTO profiles(user_id,full_name)
 SELECT ('72000000-0000-4000-8000-00000000000'||n)::uuid,'Synthetic role '||n
 FROM generate_series(1,5) n;
SET ROLE authenticated;
DO $$ DECLARE n integer; BEGIN
 FOR n IN 1..5 LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','72000000-0000-4000-8000-00000000000'||n)::text,true);
  PERFORM fixture_assert(account_deletion_access_allowed(),'live app role '||n||' passes revocation guard');
  PERFORM fixture_assert((SELECT count(*)=1 FROM profiles),'live app role '||n||' retains fixture own-profile access');
  UPDATE profiles SET bio='Synthetic role update' WHERE user_id=auth.uid();
  PERFORM fixture_assert((SELECT bio='Synthetic role update' FROM profiles WHERE user_id=auth.uid()),'live app role '||n||' retains own-profile write');
 END LOOP;
END; $$;
RESET ROLE;
-- Add a permissive read path as broad as a normal admin policy. It still
-- cannot defeat a restrictive denial for the revoked principal.
CREATE POLICY fixture_role_admin_read ON profiles FOR SELECT TO authenticated USING(true);
INSERT INTO account_deletion_revocations(user_id) VALUES('72000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000001"}',false);
SELECT fixture_assert((SELECT count(*)=0 FROM profiles),'revoked app admin cannot use another permissive read policy');
DO $$ BEGIN
 INSERT INTO profiles(user_id,full_name) VALUES('72000000-0000-4000-8000-000000000001','Cannot restore revoked profile');
 RAISE EXCEPTION 'revoked admin INSERT accepted';
EXCEPTION WHEN insufficient_privilege THEN NULL; END; $$;
RESET ROLE;
GRANT SELECT ON profiles TO anon;
SET ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',false);
SELECT fixture_assert(account_deletion_access_allowed(),'anon requests not rejected by revocation prehook');
SELECT fixture_assert((SELECT count(*)=0 FROM profiles),'anon did not gain a new permissive policy');
RESET ROLE;
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
SELECT fixture_assert((SELECT count(*)>=5 FROM profiles),'service-role maintenance keeps existing BYPASSRLS behavior');
RESET ROLE;
ROLLBACK;
SELECT 'S042 DB role guards passed' AS result;
