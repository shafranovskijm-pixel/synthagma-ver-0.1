-- Reversible organization billing holds. No financial/user/Auth/privacy rows are updated.
-- Existing executable functions are replaced in place only after exact released-source CAS.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog,public;
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sintagma:organization-billing-hold:migration:v1',20261106));
CREATE TEMP TABLE billing_hold_function_before (
 signature text PRIMARY KEY, definition_md5 text NOT NULL, catalog jsonb NOT NULL
) ON COMMIT DROP;
DO $cas$ DECLARE expected record; p record;actual_hash text;BEGIN
 FOR expected IN SELECT * FROM(VALUES
 ('public.account_deletion_access_allowed()','64b0a90b7db9813950ccca6dff208f3a'),
 ('public.can_access_organization(uuid,text)','2e11495f3d3e6ca261af8a08ed874269'),
 ('public.is_user_blocked(uuid)','dc02aff89341bb5e29c09da37d4c5c0e'),
 ('public.has_role(app_role,uuid)','20c46f708cc2e7fa51b640290151a59e'),
 ('public.has_role(uuid,app_role)','82a7fa1cd06301bb83b010bc315aee0b'),
 ('public.can_access_course_as_learner(uuid)','52ace2cdf4ec9928758d5597aef745c8'),
 ('public.get_user_role(uuid)','7cdd82d7dc9b614e7609419972ae4e8d'),
 ('public.is_org_owner(uuid,uuid)','362aca6afc26c775be594843258b2ab2'),
 ('public.has_org_staff_permission(uuid,uuid,text)','3d1fedafe94778fa19dd47acb71a3782')
 ) v(signature,source_md5) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  IF NOT FOUND THEN RAISE EXCEPTION 'billing_hold_source_missing: %',expected.signature;END IF;
  actual_hash:=md5(pg_get_functiondef(p.oid));
  IF actual_hash IS DISTINCT FROM expected.source_md5 THEN
   RAISE EXCEPTION 'billing_hold_source_changed: %',expected.signature;
  END IF;
  IF p.proowner<>to_regrole('postgres') OR NOT p.prosecdef OR NOT EXISTS(
   SELECT 1 FROM pg_roles r WHERE r.oid=p.proowner AND(r.rolbypassrls OR r.rolsuper))
  THEN RAISE EXCEPTION 'billing_hold_unreviewed_function_owner: %',expected.signature;END IF;
  INSERT INTO pg_temp.billing_hold_function_before VALUES(expected.signature,actual_hash,
   jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl::text,'args',p.proargtypes::text,'argnames',p.proargnames,
    'result',p.prorettype,'volatility',p.provolatile,'strict',p.proisstrict,'security_definer',p.prosecdef,
    'config',p.proconfig,'language',p.prolang,'parallel',p.proparallel,'leakproof',p.proleakproof));
 END LOOP;
 IF to_regnamespace('billing_access_private') IS NOT NULL
 OR to_regprocedure('public.get_organization_billing_hold(uuid)') IS NOT NULL
 OR to_regprocedure('public.set_organization_billing_hold(uuid,uuid,text,uuid,text)') IS NOT NULL
 OR to_regprocedure('public.organization_billing_access_allowed(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'billing_hold_already_present';END IF;
END;$cas$;

CREATE SCHEMA billing_access_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA billing_access_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE billing_access_private.holds(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 created_at timestamptz NOT NULL,
 created_by uuid NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000 AND btrim(reason)=reason),
 UNIQUE(organization_id,id)
);
CREATE TABLE billing_access_private.active_holds(
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 hold_id uuid NOT NULL UNIQUE,
 FOREIGN KEY(organization_id,hold_id) REFERENCES billing_access_private.holds(organization_id,id)
);
CREATE TABLE billing_access_private.events(
 request_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 actor_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('hold','release')),
 hold_id uuid NOT NULL,
 reason text,
 created_at timestamptz NOT NULL,
 input jsonb NOT NULL,
 FOREIGN KEY(organization_id,hold_id) REFERENCES billing_access_private.holds(organization_id,id)
);
CREATE INDEX billing_hold_events_org_time ON billing_access_private.events(organization_id,created_at DESC);
ALTER TABLE billing_access_private.holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_access_private.active_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_access_private.events ENABLE ROW LEVEL SECURITY;

-- This helper bypasses RLS as the reviewed postgres owner, not by calling
-- has_role/account_deletion_access_allowed (which themselves compose this predicate).
-- Platform-admin bypass applies to billing only; privacy revocation always wins.
CREATE FUNCTION billing_access_private.actor_allowed(p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=p_actor)
 AND(
  p_actor IS NULL
  OR EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p_actor AND ur.role='admin'::public.app_role)
  OR NOT EXISTS(SELECT 1 FROM public.profiles p JOIN billing_access_private.active_holds h ON h.organization_id=p.organization_id
     WHERE p.user_id=p_actor)
 )
$fn$;
CREATE FUNCTION billing_access_private.target_allowed(p_organization_id uuid,p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT billing_access_private.actor_allowed(p_actor) AND(
  EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p_actor AND ur.role='admin'::public.app_role)
  OR NOT EXISTS(SELECT 1 FROM billing_access_private.active_holds h WHERE h.organization_id=p_organization_id)
 )
$fn$;
CREATE FUNCTION billing_access_private.assert_admin() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid:=auth.uid();BEGIN
 IF actor IS NULL OR auth.role() IS DISTINCT FROM 'authenticated'
 OR NOT billing_access_private.actor_allowed(actor)
 OR NOT EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=actor AND ur.role='admin'::public.app_role)
 OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=actor AND p.blocked_at IS NOT NULL)
 THEN RAISE EXCEPTION 'platform_admin_required' USING ERRCODE='42501';END IF;
 RETURN actor;
END;$fn$;
CREATE FUNCTION billing_access_private.status(p_organization_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('organization_id',p_organization_id,'active',h.id IS NOT NULL,
   'hold_id',h.id,'reason',h.reason,'held_at',h.created_at,
   'released_at',CASE WHEN h.id IS NULL THEN(SELECT max(e.created_at)FROM billing_access_private.events e
     WHERE e.organization_id=p_organization_id AND e.action='release')ELSE NULL END)
 FROM(VALUES(1))v(dummy)
 LEFT JOIN billing_access_private.active_holds a ON a.organization_id=p_organization_id
 LEFT JOIN billing_access_private.holds h ON h.id=a.hold_id AND h.organization_id=a.organization_id
$fn$;
CREATE FUNCTION billing_access_private.reject_history_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN RAISE EXCEPTION 'billing_hold_history_is_immutable' USING ERRCODE='42501';END;$fn$;
CREATE TRIGGER billing_hold_history_immutable BEFORE UPDATE OR DELETE ON billing_access_private.holds
FOR EACH ROW EXECUTE FUNCTION billing_access_private.reject_history_mutation();
CREATE TRIGGER billing_hold_history_no_truncate BEFORE TRUNCATE ON billing_access_private.holds
FOR EACH STATEMENT EXECUTE FUNCTION billing_access_private.reject_history_mutation();
CREATE TRIGGER billing_hold_events_immutable BEFORE UPDATE OR DELETE ON billing_access_private.events
FOR EACH ROW EXECUTE FUNCTION billing_access_private.reject_history_mutation();
CREATE TRIGGER billing_hold_events_no_truncate BEFORE TRUNCATE ON billing_access_private.events
FOR EACH STATEMENT EXECUTE FUNCTION billing_access_private.reject_history_mutation();

CREATE FUNCTION public.get_organization_billing_hold(p_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM billing_access_private.assert_admin();
 IF p_organization_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id)
 THEN RAISE EXCEPTION 'organization_not_found' USING ERRCODE='P0002';END IF;
 RETURN billing_access_private.status(p_organization_id);
END;$fn$;
CREATE FUNCTION public.set_organization_billing_hold(p_organization_id uuid,p_request_id uuid,p_action text,
 p_expected_hold_id uuid DEFAULT NULL,p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid;normalized_reason text:=nullif(btrim(p_reason),'');payload jsonb;prior billing_access_private.events;
 active_id uuid;new_id uuid;event_time timestamptz;BEGIN
 actor:=billing_access_private.assert_admin();
 IF p_organization_id IS NULL OR p_request_id IS NULL OR p_action IS NULL OR p_action NOT IN('hold','release')
 OR length(coalesce(normalized_reason,''))>1000 OR p_action='hold'AND(normalized_reason IS NULL OR p_expected_hold_id IS NOT NULL)
 OR p_action='release'AND p_expected_hold_id IS NULL THEN
  RAISE EXCEPTION 'billing_hold_invalid_input' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id)
 THEN RAISE EXCEPTION 'organization_not_found' USING ERRCODE='P0002';END IF;
 payload:=jsonb_build_object('organization_id',p_organization_id,'action',p_action,
  'expected_hold_id',p_expected_hold_id,'reason',normalized_reason);
 -- Lock order is request then organization. No caller can replace an active
 -- hold, double-create one, or release a newer hold with an old response.
 PERFORM pg_advisory_xact_lock(hashtextextended('sintagma:billing-hold:request:'||p_request_id::text,20261106));
 PERFORM pg_advisory_xact_lock(hashtextextended('sintagma:billing-hold:org:'||p_organization_id::text,20261106));
 SELECT *INTO prior FROM billing_access_private.events WHERE request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM actor OR prior.organization_id IS DISTINCT FROM p_organization_id OR prior.input IS DISTINCT FROM payload
  THEN RAISE EXCEPTION 'billing_hold_request_conflict' USING ERRCODE='40001';END IF;
  RETURN billing_access_private.status(p_organization_id)||jsonb_build_object('request_id',p_request_id,'replayed',true,'operation_hold_id',prior.hold_id);
 END IF;
 SELECT hold_id INTO active_id FROM billing_access_private.active_holds WHERE organization_id=p_organization_id FOR UPDATE;
 event_time:=clock_timestamp();
 IF p_action='hold' THEN
  IF active_id IS NOT NULL THEN RAISE EXCEPTION 'billing_hold_changed' USING ERRCODE='40001';END IF;
  new_id:=gen_random_uuid();
  INSERT INTO billing_access_private.holds VALUES(new_id,p_organization_id,event_time,actor,normalized_reason);
  INSERT INTO billing_access_private.active_holds VALUES(p_organization_id,new_id);
 ELSE
  IF active_id IS DISTINCT FROM p_expected_hold_id THEN RAISE EXCEPTION 'billing_hold_changed' USING ERRCODE='40001';END IF;
  new_id:=active_id;
  DELETE FROM billing_access_private.active_holds WHERE organization_id=p_organization_id AND hold_id=p_expected_hold_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing_hold_changed' USING ERRCODE='40001';END IF;
 END IF;
 INSERT INTO billing_access_private.events VALUES(p_request_id,p_organization_id,actor,p_action,new_id,normalized_reason,event_time,payload);
 RETURN billing_access_private.status(p_organization_id)||jsonb_build_object('request_id',p_request_id,'replayed',false,'operation_hold_id',new_id);
END;$fn$;

-- Narrow service gate for public registration before an Auth user exists.
-- It returns no hold reason or user data, and a missing organization fails closed.
CREATE FUNCTION public.organization_billing_access_allowed(p_organization_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';END IF;
 RETURN p_organization_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id)
  AND NOT EXISTS(SELECT 1 FROM billing_access_private.active_holds WHERE organization_id=p_organization_id);
END;$fn$;
-- Exact in-place composition: account_deletion_access_allowed()
CREATE OR REPLACE FUNCTION public.account_deletion_access_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid())
   AND billing_access_private.actor_allowed(auth.uid());
$function$;

-- Exact in-place composition: can_access_organization(uuid,text)
CREATE OR REPLACE FUNCTION public.can_access_organization(_organization_id uuid, _permission text DEFAULT 'settings.read'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.account_deletion_access_allowed()
    AND billing_access_private.target_allowed(_organization_id,auth.uid())
    AND _organization_id IS NOT NULL
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

-- Exact in-place composition: is_user_blocked(uuid)
CREATE OR REPLACE FUNCTION public.is_user_blocked(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT billing_access_private.actor_allowed(_user_id) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = _user_id AND blocked_at IS NOT NULL
  );
$function$;

-- Exact in-place composition: has_role(app_role,uuid)
CREATE OR REPLACE FUNCTION public.has_role(_role app_role, _user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN billing_access_private.actor_allowed(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
END;
$function$;

-- Exact in-place composition: has_role(uuid,app_role)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT billing_access_private.actor_allowed(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$function$;

-- Exact in-place composition: can_access_course_as_learner(uuid)
CREATE OR REPLACE FUNCTION public.can_access_course_as_learner(_course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.account_deletion_access_allowed() AND auth.uid() IS NOT NULL AND EXISTS (
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

-- Exact in-place composition: get_user_role(uuid)
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
 RETURNS app_role
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role app_role;
BEGIN
  IF NOT billing_access_private.actor_allowed(_user_id) THEN
    RAISE EXCEPTION 'organization_access_suspended' USING ERRCODE='42501';
  END IF;
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = _user_id LIMIT 1;

  IF v_role = 'admin' THEN
    RETURN 'admin';
  END IF;

  IF v_role = 'organization' THEN
    RETURN 'organization';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.org_staff s
    WHERE s.user_id = _user_id
      AND (s.expires_at IS NULL OR s.expires_at > now())
  ) THEN
    RETURN 'organization'::app_role;
  END IF;

  RETURN v_role;
END;
$function$;


-- Exact in-place composition: has_org_staff_permission(uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.has_org_staff_permission(_user_id uuid, _organization_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH perms AS (
    SELECT unnest(public.get_org_staff_permissions(_user_id, _organization_id)) AS permission
  )
  SELECT billing_access_private.target_allowed(_organization_id,_user_id) AND EXISTS (
    SELECT 1
    FROM perms
    WHERE permission = _permission
       OR permission = public.normalize_org_staff_permission(_permission)
       OR public.normalize_org_staff_permission(permission) = public.normalize_org_staff_permission(_permission)
  )
$function$;

-- Exact in-place composition: is_org_owner(uuid,uuid)
CREATE OR REPLACE FUNCTION public.is_org_owner(_user_id uuid, _organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT billing_access_private.target_allowed(_organization_id,_user_id) AND EXISTS (
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

-- Remove inherited/default grants on the newly created objects only.
-- Existing public function ACLs (including deployment-specific roles) are untouched.
DO $new_acl$ DECLARE obj record;grantee_row record;role_name text;BEGIN
 FOR obj IN SELECT p.oid,p.proowner,p.oid::regprocedure::text AS signature,n.nspname
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='billing_access_private' OR(p.oid IN(
   'public.get_organization_billing_hold(uuid)'::regprocedure,
   'public.set_organization_billing_hold(uuid,uuid,text,uuid,text)'::regprocedure,
   'public.organization_billing_access_allowed(uuid)'::regprocedure))
 LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',obj.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',obj.signature);
  FOR grantee_row IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
   WHERE p.oid=obj.oid AND a.grantee<>p.proowner AND a.grantee<>0
  LOOP
   role_name:=pg_get_userbyid(grantee_row.grantee);
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',obj.signature,role_name);
  END LOOP;
 END LOOP;
 FOR obj IN SELECT c.oid,c.relowner,c.oid::regclass::text AS relation FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='billing_access_private' AND c.relkind IN('r','S')
 LOOP
  EXECUTE format('ALTER %s %s OWNER TO postgres',CASE WHEN obj.relation LIKE '%_seq' THEN 'SEQUENCE' ELSE 'TABLE' END,obj.relation);
  EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC',obj.relation);
  FOR grantee_row IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a
   WHERE c.oid=obj.oid AND a.grantee<>c.relowner AND a.grantee<>0
  LOOP EXECUTE format('REVOKE ALL ON TABLE %s FROM %I',obj.relation,pg_get_userbyid(grantee_row.grantee));END LOOP;
 END LOOP;
END;$new_acl$;
GRANT EXECUTE ON FUNCTION public.get_organization_billing_hold(uuid),
 public.set_organization_billing_hold(uuid,uuid,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.organization_billing_access_allowed(uuid) TO service_role;

DO $abi$ DECLARE old record;p record;current_catalog jsonb;BEGIN
 FOR old IN SELECT *FROM pg_temp.billing_hold_function_before LOOP
  SELECT *INTO p FROM pg_proc WHERE oid=to_regprocedure(old.signature);
  current_catalog:=jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl::text,'args',p.proargtypes::text,'argnames',p.proargnames,
    'result',p.prorettype,'volatility',p.provolatile,'strict',p.proisstrict,'security_definer',p.prosecdef,
    'config',p.proconfig,'language',p.prolang,'parallel',p.proparallel,'leakproof',p.proleakproof);
  IF current_catalog IS DISTINCT FROM old.catalog THEN RAISE EXCEPTION 'billing_hold_existing_abi_changed: %',old.signature;END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM billing_access_private.holds)OR EXISTS(SELECT 1 FROM billing_access_private.active_holds)
 OR EXISTS(SELECT 1 FROM billing_access_private.events)THEN RAISE EXCEPTION 'billing_hold_install_must_not_apply_a_hold';END IF;
END;$abi$;
COMMIT;

