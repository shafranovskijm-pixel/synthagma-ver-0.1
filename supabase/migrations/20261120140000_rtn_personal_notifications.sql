-- Personal RTN opt-in and own-pull delivery. Candidate; no history projection,
-- source fetch, schedule, impersonation, business-data or account erasure here.
CREATE TEMP TABLE rtn_personal_old_functions ON COMMIT DROP AS
 SELECT p.oid,to_jsonb(p) AS catalog,p.prosrc,
 CASE WHEN p.oid IN(to_regprocedure('rtn_private.personal_counts(uuid)'),
  to_regprocedure('rtn_private.erase_account_links(uuid,uuid)'),to_regprocedure('rtn_private.organization_retention_count(uuid,uuid)'))
 THEN pg_get_functiondef(p.oid) END AS definition FROM pg_proc p;
DO $precondition$ DECLARE e record;p pg_proc%ROWTYPE;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'RTN_PERSONAL_REQUIRES_EXISTING_OWNER';END IF;
 FOR e IN SELECT * FROM(VALUES
  ('rtn_private.actor_allowed()','6adb3d9af11b2c5c07826dccb18f871a','s'),
  ('rtn_private.assert_staff(uuid,text)','7821002b867b0a082c7798a382d3a70d','s'),
  ('rtn_private.assert_entitled(uuid,uuid)','3830455633b8df1b36aeb684201c65ca','s'),
  ('rtn_private.lock_actor()','d5723b819f698349820eeac316b0a668','v'),
  ('rtn_private.personal_counts(uuid)','e3e42d1bd3065bbcff2cd2a75a59d3b4','s'),
  ('rtn_private.erase_account_links(uuid,uuid)','54a692cd9a6d72451f896242a595b88e','v'),
  ('rtn_private.organization_retention_count(uuid,uuid)','78763e875bcada85981df96922d1f0c9','s')
 )x(signature,body_md5,volatility) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(e.signature);
  IF p.oid IS NULL OR md5(p.prosrc) IS DISTINCT FROM e.body_md5 OR pg_get_userbyid(p.proowner)<>'postgres'
   OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres}' OR NOT p.prosecdef
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] OR p.provolatile::text<>e.volatility
  THEN RAISE EXCEPTION 'RTN_PERSONAL_AUTHORITY_PREIMAGE_CHANGED:%',e.signature;END IF;
 END LOOP;
 IF to_regclass('rtn_private.update_events') IS NULL
  OR to_regprocedure('rtn_private.update_event_payload(rtn_private.update_events)') IS NULL
  OR to_regprocedure('public.get_rtn_update(uuid,uuid)') IS NULL
  OR to_regprocedure('rtn_private.erasure_allowed(uuid)') IS NULL
  OR to_regprocedure('rtn_private.entitled(uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'RTN_PERSONAL_REQUIRES_REVIEWED_GLOBAL_AND_ERASURE';END IF;
 IF to_regclass('rtn_private.personal_subscriptions') IS NOT NULL OR to_regclass('rtn_private.personal_deliveries') IS NOT NULL
  OR to_regprocedure('public.get_my_rtn_subscription(uuid)') IS NOT NULL
  OR to_regprocedure('public.save_my_rtn_subscription(uuid,boolean,text[],text[],bigint)') IS NOT NULL
  OR to_regprocedure('public.get_my_rtn_notifications(uuid,bigint,integer)') IS NOT NULL
  OR to_regprocedure('public.mark_my_rtn_notifications_read(uuid,uuid[])') IS NOT NULL
  OR EXISTS(SELECT 1 FROM pg_proc np JOIN pg_namespace n ON n.oid=np.pronamespace WHERE n.nspname='rtn_private'
   AND np.proname IN('personal_topic_options','personal_subscription_valid','personal_subscription_payload','lock_personal_subject','personal_notification_link_guard'))
 THEN RAISE EXCEPTION 'RTN_PERSONAL_ALREADY_EXISTS_REQUIRES_READBACK';END IF;
END;$precondition$;

CREATE TABLE rtn_private.personal_subscriptions(
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT false,
 topics text[] NOT NULL DEFAULT '{}',kinds text[] NOT NULL DEFAULT '{}',
 generation bigint NOT NULL CHECK(generation>=1),
 enabled_since timestamptz,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,user_id),
 CHECK(cardinality(topics)<=32 AND cardinality(kinds)<=3),
 CHECK(NOT enabled OR(cardinality(topics)>0 AND cardinality(kinds)>0 AND enabled_since IS NOT NULL))
);
CREATE TABLE rtn_private.personal_deliveries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,recipient_user_id uuid NOT NULL,
 event_id uuid NOT NULL REFERENCES rtn_private.update_events(id) ON DELETE RESTRICT,
 subscription_generation bigint NOT NULL CHECK(subscription_generation>=1),
 delivered_at timestamptz NOT NULL DEFAULT clock_timestamp(),read_at timestamptz,
 UNIQUE(organization_id,recipient_user_id,event_id),
 FOREIGN KEY(organization_id,recipient_user_id) REFERENCES rtn_private.personal_subscriptions(organization_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX rtn_personal_unread ON rtn_private.personal_deliveries(organization_id,recipient_user_id) WHERE read_at IS NULL;
ALTER TABLE rtn_private.personal_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rtn_private.personal_deliveries ENABLE ROW LEVEL SECURITY;

-- Only the currently authorized organization topic vocabulary is selectable.
CREATE FUNCTION rtn_private.personal_topic_options(p_org uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT ARRAY(SELECT topic FROM(
  SELECT 'general'::text AS topic UNION
  SELECT b.domain FROM rtn_private.banks b WHERE rtn_private.entitled(p_org,b.id)
   AND b.domain ~ '^[a-z][a-z0-9_-]{0,63}$'
 )t ORDER BY topic COLLATE "C")
$fn$;
CREATE FUNCTION rtn_private.personal_subscription_valid(s rtn_private.personal_subscriptions,p_topics text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT CASE WHEN s.generation>=1 AND s.enabled_since IS NOT NULL
  AND s.topics IS NOT NULL AND s.kinds IS NOT NULL
  AND cardinality(s.topics) BETWEEN 1 AND 32 AND cardinality(s.kinds) BETWEEN 1 AND 3
  AND array_ndims(s.topics)=1 AND array_ndims(s.kinds)=1
 THEN coalesce(array_position(s.topics,NULL) IS NULL AND array_position(s.kinds,NULL) IS NULL
  AND cardinality(s.topics)=(SELECT count(DISTINCT v) FROM unnest(s.topics)v)
  AND cardinality(s.kinds)=(SELECT count(DISTINCT v) FROM unnest(s.kinds)v)
  AND s.topics<@p_topics AND s.kinds<@ARRAY['news','source_change','bank_release']::text[],false) ELSE false END
$fn$;
CREATE FUNCTION rtn_private.personal_subscription_payload(s rtn_private.personal_subscriptions,p_topics text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('enabled',coalesce(s.enabled,false),
  'effective_enabled',coalesce(s.enabled AND rtn_private.personal_subscription_valid(s,p_topics),false),
  'needs_reconfiguration',coalesce(s.enabled AND NOT rtn_private.personal_subscription_valid(s,p_topics),false),
  'topics',coalesce(s.topics,'{}'::text[]),'kinds',coalesce(s.kinds,'{}'::text[]),
  'generation',coalesce(s.generation,0),'enabled_since',s.enabled_since,'updated_at',s.updated_at)
$fn$;
CREATE FUNCTION rtn_private.lock_personal_subject(p_org uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid;BEGIN
 actor:=rtn_private.lock_actor();
 IF p_org IS NULL THEN RAISE EXCEPTION 'rtn_personal_organization_required' USING ERRCODE='22023';END IF;
 -- Deny a foreign or unpaid caller before it can wait on or acquire the
 -- organization's shared lock. Keep the same checks after every lock wait.
 PERFORM rtn_private.assert_staff(p_org,'courses.read');
 PERFORM rtn_private.assert_entitled(p_org);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text,42));
 PERFORM 1 FROM public.organizations WHERE id=p_org FOR KEY SHARE;
 -- Subject lock was acquired first; all authority is rechecked after waits.
 PERFORM rtn_private.lock_actor();
 PERFORM rtn_private.assert_staff(p_org,'courses.read');
 PERFORM rtn_private.assert_entitled(p_org);
 RETURN actor;
END;$fn$;

CREATE FUNCTION rtn_private.personal_notification_link_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
DECLARE subject uuid;BEGIN
 IF TG_TABLE_NAME='personal_subscriptions' THEN
  subject:=OLD.user_id;
  IF TG_OP='UPDATE' THEN
   IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
   THEN RAISE EXCEPTION 'rtn_personal_identity_is_immutable' USING ERRCODE='42501';END IF;
   RETURN NEW;
  END IF;
 ELSE
  subject:=OLD.recipient_user_id;
  IF TG_OP='UPDATE' THEN
   IF to_jsonb(NEW)-'read_at' IS DISTINCT FROM to_jsonb(OLD)-'read_at'
    OR OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at OR NEW.read_at IS NULL
   THEN RAISE EXCEPTION 'rtn_personal_delivery_is_immutable' USING ERRCODE='42501';END IF;
   RETURN NEW;
  END IF;
 END IF;
 IF TG_OP='DELETE' AND rtn_private.erasure_allowed(subject) THEN RETURN OLD;END IF;
 RAISE EXCEPTION 'rtn_personal_delete_requires_confirmed_erasure' USING ERRCODE='42501';
END;$fn$;
CREATE TRIGGER rtn_personal_subscription_links BEFORE UPDATE OR DELETE ON rtn_private.personal_subscriptions
 FOR EACH ROW EXECUTE FUNCTION rtn_private.personal_notification_link_guard();
CREATE TRIGGER rtn_personal_delivery_links BEFORE UPDATE OR DELETE ON rtn_private.personal_deliveries
 FOR EACH ROW EXECUTE FUNCTION rtn_private.personal_notification_link_guard();

-- Recognize ONLY these declared links. Unknown personal UUID occurrences still
-- trigger the existing content-retention review. Preserve every old branch.
DO $privacy_bridge$ DECLARE old record;body text;anchor text;BEGIN
 SELECT * INTO STRICT old FROM pg_temp.rtn_personal_old_functions WHERE oid='rtn_private.personal_counts(uuid)'::regprocedure;
 anchor:='   ELSIF t.tablename=''key_sets'' AND r->>''reviewed_by''=p_user::text THEN v:=r-ARRAY[''reviewed_by'',''review_note''];';
 IF(length(old.prosrc)-length(replace(old.prosrc,anchor,'')))/length(anchor)<>1
 THEN RAISE EXCEPTION 'RTN_PERSONAL_COUNT_ANCHOR_CHANGED';END IF;
 body:=replace(old.prosrc,anchor,
  E'   ELSIF t.tablename=''personal_subscriptions'' AND r->>''user_id''=p_user::text THEN v:=r-''user_id'';\n'
  ||E'   ELSIF t.tablename=''personal_deliveries'' AND r->>''recipient_user_id''=p_user::text THEN v:=r-''recipient_user_id'';\n'||anchor);
 EXECUTE replace(old.definition,old.prosrc,body);
 SELECT * INTO STRICT old FROM pg_temp.rtn_personal_old_functions WHERE oid='rtn_private.erase_account_links(uuid,uuid)'::regprocedure;
 anchor:=' INSERT INTO rtn_private.erasure_contexts VALUES(pg_backend_pid(),txid_current(),p_user,p_request);';
 IF(length(old.prosrc)-length(replace(old.prosrc,anchor,'')))/length(anchor)<>1
 THEN RAISE EXCEPTION 'RTN_PERSONAL_ERASURE_ANCHOR_CHANGED';END IF;
 body:=replace(old.prosrc,anchor,anchor
  ||E'\n DELETE FROM rtn_private.personal_deliveries WHERE recipient_user_id=p_user;'
  ||E'\n DELETE FROM rtn_private.personal_subscriptions WHERE user_id=p_user;');
 EXECUTE replace(old.definition,old.prosrc,body);
 SELECT * INTO STRICT old FROM pg_temp.rtn_personal_old_functions WHERE oid='rtn_private.organization_retention_count(uuid,uuid)'::regprocedure;
 body:=old.prosrc
  ||E' +(SELECT count(*) FROM rtn_private.personal_subscriptions WHERE organization_id=p_org AND user_id IS DISTINCT FROM p_user)\n'
  ||E' +(SELECT count(*) FROM rtn_private.personal_deliveries WHERE organization_id=p_org AND recipient_user_id IS DISTINCT FROM p_user)\n';
 EXECUTE replace(old.definition,old.prosrc,body);
END;$privacy_bridge$;

CREATE FUNCTION public.get_my_rtn_subscription(p_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s rtn_private.personal_subscriptions%ROWTYPE;options text[];BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.read');PERFORM rtn_private.assert_entitled(p_organization_id);
 SELECT * INTO s FROM rtn_private.personal_subscriptions WHERE organization_id=p_organization_id AND user_id=auth.uid();
 options:=rtn_private.personal_topic_options(p_organization_id);
 RETURN jsonb_build_object('organization_id',p_organization_id,'actor_id',auth.uid(),
  'subscription',rtn_private.personal_subscription_payload(s,options),
  'options',jsonb_build_object('topics',options,'kinds',ARRAY['news','source_change','bank_release']),
  'delivery_mode','own_pull');
END;$fn$;
CREATE FUNCTION public.save_my_rtn_subscription(p_organization_id uuid,p_enabled boolean,p_topics text[],p_kinds text[],p_expected_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid;s rtn_private.personal_subscriptions%ROWTYPE;options text[];topics text[];kinds text[];BEGIN
 actor:=rtn_private.lock_personal_subject(p_organization_id);
 options:=rtn_private.personal_topic_options(p_organization_id);
 IF p_enabled IS NULL OR p_expected_generation IS NULL OR p_expected_generation<0 OR p_topics IS NULL OR p_kinds IS NULL
  OR cardinality(p_topics)>32 OR cardinality(p_kinds)>3
  OR(cardinality(p_topics)>0 AND array_ndims(p_topics)<>1) OR(cardinality(p_kinds)>0 AND array_ndims(p_kinds)<>1)
  OR EXISTS(SELECT 1 FROM unnest(p_topics)v WHERE v IS NULL)
  OR EXISTS(SELECT 1 FROM unnest(p_kinds)v WHERE v IS NULL)
  OR cardinality(p_topics)<>(SELECT count(DISTINCT v) FROM unnest(p_topics)v)
  OR cardinality(p_kinds)<>(SELECT count(DISTINCT v) FROM unnest(p_kinds)v)
  OR NOT(p_topics<@options) OR NOT(p_kinds<@ARRAY['news','source_change','bank_release']::text[])
  OR(p_enabled AND(cardinality(p_topics)=0 OR cardinality(p_kinds)=0))
 THEN RAISE EXCEPTION 'rtn_personal_subscription_invalid' USING ERRCODE='22023';END IF;
 topics:=ARRAY(SELECT v FROM unnest(p_topics)v ORDER BY v COLLATE "C");
 kinds:=ARRAY(SELECT v FROM unnest(p_kinds)v ORDER BY v COLLATE "C");
 SELECT * INTO s FROM rtn_private.personal_subscriptions WHERE organization_id=p_organization_id AND user_id=actor FOR UPDATE;
 IF coalesce(s.generation,0)<>p_expected_generation
 THEN RAISE EXCEPTION 'rtn_personal_subscription_conflict' USING ERRCODE='40001';END IF;
 IF coalesce(s.enabled,false)=p_enabled AND coalesce(s.topics,'{}')=topics AND coalesce(s.kinds,'{}')=kinds
 THEN RETURN jsonb_build_object('organization_id',p_organization_id,'actor_id',actor,
  'subscription',rtn_private.personal_subscription_payload(s,options),
  'options',jsonb_build_object('topics',options,'kinds',ARRAY['news','source_change','bank_release']),'delivery_mode','own_pull');END IF;
 INSERT INTO rtn_private.personal_subscriptions(organization_id,user_id,enabled,topics,kinds,generation,enabled_since,updated_at)
 VALUES(p_organization_id,actor,p_enabled,topics,kinds,coalesce(s.generation,0)+1,
  CASE WHEN p_enabled THEN clock_timestamp() END,clock_timestamp())
 ON CONFLICT(organization_id,user_id) DO UPDATE SET enabled=excluded.enabled,topics=excluded.topics,kinds=excluded.kinds,
  generation=excluded.generation,enabled_since=excluded.enabled_since,updated_at=excluded.updated_at RETURNING * INTO s;
 RETURN jsonb_build_object('organization_id',p_organization_id,'actor_id',actor,
  'subscription',rtn_private.personal_subscription_payload(s,options),
  'options',jsonb_build_object('topics',options,'kinds',ARRAY['news','source_change','bank_release']),'delivery_mode','own_pull');
END;$fn$;

CREATE FUNCTION public.get_my_rtn_notifications(p_organization_id uuid,p_before_sequence bigint DEFAULT NULL,p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid;s rtn_private.personal_subscriptions%ROWTYPE;options text[];effective boolean;inserted integer:=0;
 items jsonb;more boolean;pending boolean:=false;next_cursor bigint;unread bigint;BEGIN
 actor:=rtn_private.lock_personal_subject(p_organization_id);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR(p_before_sequence IS NOT NULL AND p_before_sequence<=0)
 THEN RAISE EXCEPTION 'rtn_personal_notification_filter_invalid' USING ERRCODE='22023';END IF;
 SELECT * INTO s FROM rtn_private.personal_subscriptions WHERE organization_id=p_organization_id AND user_id=actor FOR UPDATE;
 options:=rtn_private.personal_topic_options(p_organization_id);
 effective:=coalesce(s.enabled AND rtn_private.personal_subscription_valid(s,options),false);
 IF effective THEN
  -- NO max(sequence) high-water mark. A smaller sequence may commit later.
  INSERT INTO rtn_private.personal_deliveries(organization_id,recipient_user_id,event_id,subscription_generation)
  SELECT p_organization_id,actor,e.id,s.generation FROM rtn_private.update_events e
  WHERE e.notifiable AND NOT e.historical AND e.observed_at>s.enabled_since
   AND(e.kind='source_change' OR e.published_at>=s.enabled_since)
   AND e.kind=ANY(s.kinds) AND e.topic=ANY(s.topics)
   AND(e.bank_id IS NULL OR rtn_private.entitled(p_organization_id,e.bank_id))
   AND NOT EXISTS(SELECT 1 FROM rtn_private.personal_deliveries d WHERE d.organization_id=p_organization_id AND d.recipient_user_id=actor AND d.event_id=e.id)
  ORDER BY e.sequence LIMIT 50 ON CONFLICT(organization_id,recipient_user_id,event_id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  SELECT EXISTS(SELECT 1 FROM rtn_private.update_events e
   WHERE e.notifiable AND NOT e.historical AND e.observed_at>s.enabled_since
    AND(e.kind='source_change' OR e.published_at>=s.enabled_since)
    AND e.kind=ANY(s.kinds) AND e.topic=ANY(s.topics)
    AND(e.bank_id IS NULL OR rtn_private.entitled(p_organization_id,e.bank_id))
    AND NOT EXISTS(SELECT 1 FROM rtn_private.personal_deliveries d WHERE d.organization_id=p_organization_id AND d.recipient_user_id=actor AND d.event_id=e.id)
  ) INTO pending;
 END IF;
 SELECT count(*) INTO unread FROM rtn_private.personal_deliveries d JOIN rtn_private.update_events e ON e.id=d.event_id
 WHERE d.organization_id=p_organization_id AND d.recipient_user_id=actor AND d.read_at IS NULL
  AND(e.bank_id IS NULL OR rtn_private.entitled(p_organization_id,e.bank_id));
 WITH page AS MATERIALIZED(
  SELECT d.id,d.delivered_at,d.read_at,d.subscription_generation,e FROM rtn_private.personal_deliveries d JOIN rtn_private.update_events e ON e.id=d.event_id
  WHERE d.organization_id=p_organization_id AND d.recipient_user_id=actor
   AND(p_before_sequence IS NULL OR e.sequence<p_before_sequence)
   AND(e.bank_id IS NULL OR rtn_private.entitled(p_organization_id,e.bank_id))
  ORDER BY e.sequence DESC LIMIT p_limit+1
 ),selected AS(SELECT * FROM page ORDER BY(e).sequence DESC LIMIT p_limit)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'event',rtn_private.update_event_payload(e),'delivered_at',delivered_at,
  'read_at',read_at,'subscription_generation',subscription_generation)ORDER BY(e).sequence DESC),'[]'::jsonb),
  (SELECT count(*)>p_limit FROM page),min((e).sequence) INTO items,more,next_cursor FROM selected;
 RETURN jsonb_build_object('organization_id',p_organization_id,'actor_id',actor,
  'items',items,'unread_count',unread,'has_more',more,
  'next_before_sequence',CASE WHEN more THEN next_cursor END,'materialization_pending',pending,'materialized_count',inserted,
  'subscription_generation',coalesce(s.generation,0),'subscription_enabled',effective,'delivery_mode','own_pull');
END;$fn$;

CREATE FUNCTION public.mark_my_rtn_notifications_read(p_organization_id uuid,p_event_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid;ids uuid[];n integer;BEGIN
 actor:=rtn_private.lock_personal_subject(p_organization_id);
 IF p_event_ids IS NULL OR cardinality(p_event_ids)>100 OR(cardinality(p_event_ids)>0 AND array_ndims(p_event_ids)<>1)
  OR EXISTS(SELECT 1 FROM unnest(p_event_ids)v WHERE v IS NULL)
  OR cardinality(p_event_ids)<>(SELECT count(DISTINCT v) FROM unnest(p_event_ids)v)
 THEN RAISE EXCEPTION 'rtn_personal_read_ids_invalid' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_event_ids)v WHERE NOT EXISTS(SELECT 1 FROM rtn_private.update_events e WHERE e.id=v
   AND(e.bank_id IS NULL OR rtn_private.entitled(p_organization_id,e.bank_id))))
 THEN RAISE EXCEPTION 'rtn_personal_event_unavailable' USING ERRCODE='42501';END IF;
 WITH changed AS(UPDATE rtn_private.personal_deliveries SET read_at=coalesce(read_at,clock_timestamp())
  WHERE organization_id=p_organization_id AND recipient_user_id=actor AND event_id=ANY(p_event_ids) RETURNING event_id)
 SELECT coalesce(array_agg(event_id ORDER BY event_id),'{}'::uuid[]),count(*)::integer INTO ids,n FROM changed;
 RETURN jsonb_build_object('organization_id',p_organization_id,'actor_id',actor,'read_event_ids',ids,'matched_count',n);
END;$fn$;

-- Scrub provider-specific default grants only on new OIDs; never old objects.
DO $new_acl$ DECLARE f record;g record;t record;BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.oid::regprocedure::text signature,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE NOT EXISTS(SELECT 1 FROM pg_temp.rtn_personal_old_functions old WHERE old.oid=p.oid)
   AND(n.nspname='rtn_private' OR(n.nspname='public' AND p.proname IN('get_my_rtn_subscription','save_my_rtn_subscription','get_my_rtn_notifications','mark_my_rtn_notifications_read'))) LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=f.oid),acldefault('f',f.proowner)))a WHERE a.grantee<>f.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',f.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
  IF f.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
 FOR t IN SELECT c.oid,c.relowner,c.oid::regclass::text identity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='rtn_private' AND c.relname IN('personal_subscriptions','personal_deliveries') LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid=t.oid),acldefault('r',t.relowner)))a WHERE a.grantee<>t.relowner LOOP
   EXECUTE format('REVOKE ALL ON TABLE %s FROM %s',t.identity,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
 END LOOP;
END;$new_acl$;
DO $postimage$ DECLARE f record;p pg_proc%ROWTYPE;BEGIN
 FOR f IN SELECT * FROM pg_temp.rtn_personal_old_functions LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=f.oid;
  IF p.oid IS NULL OR to_jsonb(p)-'prosrc' IS DISTINCT FROM f.catalog-'prosrc'
   OR(p.oid NOT IN('rtn_private.personal_counts(uuid)'::regprocedure,'rtn_private.erase_account_links(uuid,uuid)'::regprocedure,
    'rtn_private.organization_retention_count(uuid,uuid)'::regprocedure) AND p.prosrc IS DISTINCT FROM f.prosrc)
  THEN RAISE EXCEPTION 'RTN_PERSONAL_OLD_AUTHORITY_OR_UNRELATED_BODY_CHANGED:%',f.oid;END IF;
 END LOOP;
END;$postimage$;
