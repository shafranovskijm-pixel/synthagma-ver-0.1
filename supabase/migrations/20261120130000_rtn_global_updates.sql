-- Shared public-source RTN update metadata only. No personal subscription,
-- delivery, ingestion authority, source fetch, historical projection or schedule
-- is enabled here. Existing course/result/RTN history and guards are untouched.
CREATE TEMP TABLE rtn_updates_existing_functions ON COMMIT DROP AS
 SELECT p.oid,to_jsonb(p) AS catalog FROM pg_proc p;
DO $precondition$ DECLARE expected record;actual pg_proc%ROWTYPE;BEGIN
 IF current_user<>'postgres' OR to_regclass('rtn_private.rollout_state') IS NULL
  OR to_regprocedure('rtn_private.assert_staff(uuid,text)') IS NULL
  OR to_regprocedure('rtn_private.assert_entitled(uuid,uuid)') IS NULL
  OR to_regprocedure('rtn_private.entitled(uuid,uuid)') IS NULL
  OR to_regprocedure('rtn_private.personal_counts(uuid)') IS NULL
  OR to_regprocedure('rtn_private.lock_actor()') IS NULL
 THEN RAISE EXCEPTION 'RTN_UPDATES_REQUIRES_INSTALLED_REVIEWED_BASE';END IF;
 IF to_regclass('rtn_private.news_sources') IS NOT NULL OR to_regclass('rtn_private.update_events') IS NOT NULL
  OR to_regprocedure('public.get_rtn_updates(uuid,text,text,bigint,integer)') IS NOT NULL
  OR to_regprocedure('public.get_rtn_update(uuid,uuid)') IS NOT NULL
  OR to_regprocedure('public.get_rtn_update_summary(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'RTN_UPDATES_ALREADY_EXISTS_REQUIRES_READBACK';END IF;
 -- Bound to root's SELECT-only actual managed authority capture20Nov10:33UTC.
 -- These bodies/authorities are required, never replaced by this migration.
 FOR expected IN SELECT * FROM(VALUES
  ('rtn_private.actor_allowed()','6adb3d9af11b2c5c07826dccb18f871a','s'),
  ('rtn_private.assert_entitled(uuid,uuid)','3830455633b8df1b36aeb684201c65ca','s'),
  ('rtn_private.assert_staff(uuid,text)','7821002b867b0a082c7798a382d3a70d','s'),
  ('rtn_private.personal_counts(uuid)','e3e42d1bd3065bbcff2cd2a75a59d3b4','s'),
  ('rtn_private.lock_actor()','d5723b819f698349820eeac316b0a668','v'),
  ('rtn_private.organization_retention_count(uuid,uuid)','78763e875bcada85981df96922d1f0c9','s'),
  ('rtn_private.erase_account_links(uuid,uuid)','54a692cd9a6d72451f896242a595b88e','v')
 )x(signature,body_md5,volatility) LOOP
  SELECT * INTO actual FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  IF actual.oid IS NULL OR md5(actual.prosrc) IS DISTINCT FROM expected.body_md5
   OR NOT actual.prosecdef OR actual.provolatile::text IS DISTINCT FROM expected.volatility
   OR pg_get_userbyid(actual.proowner)<>'postgres' OR actual.proacl::text IS DISTINCT FROM '{postgres=X/postgres}'
   OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']
  THEN RAISE EXCEPTION 'RTN_UPDATES_AUTHORITY_PREIMAGE_CHANGED:%',expected.signature;END IF;
 END LOOP;
END;$precondition$;

-- A fixed identity rather than a caller-selected address. RSS is a finite
-- discovery window; no successful RSS fetch can prove complete archive coverage.
CREATE TABLE rtn_private.news_sources(
 id smallint PRIMARY KEY CHECK(id=1),
 code text NOT NULL UNIQUE CHECK(code='official-news-rss'),
 feed_url text NOT NULL CHECK(feed_url='https://www.gosnadzor.ru/news/rss/'),
 title text NOT NULL CHECK(title='Новости Ростехнадзора'),
 last_checked_at timestamptz,last_success_at timestamptz,
 last_status text NOT NULL DEFAULT 'never_checked' CHECK(last_status IN('never_checked','success','partial','error','blocked')),
 coverage_kind text NOT NULL DEFAULT 'unknown' CHECK(coverage_kind IN('unknown','finite_rss_window','verified_archive_interval')),
 coverage_from timestamptz,coverage_until timestamptz,
 last_error_code text CHECK(last_error_code IS NULL OR last_error_code ~ '^RTN_NEWS_[A-Z0-9_]{1,80}$'),
 CHECK(last_success_at IS NULL OR(last_checked_at IS NOT NULL AND last_success_at<=last_checked_at)),
 CHECK((coverage_from IS NULL)=(coverage_until IS NULL)),
 CHECK(coverage_from IS NULL OR coverage_from<=coverage_until),
 CHECK(coverage_kind<>'verified_archive_interval' OR coverage_from IS NOT NULL),
 CHECK(last_status NOT IN('error','blocked') OR last_error_code IS NOT NULL)
);
INSERT INTO rtn_private.news_sources(id,code,feed_url,title)
 VALUES(1,'official-news-rss','https://www.gosnadzor.ru/news/rss/','Новости Ростехнадзора');

-- One append-only UUID resolves the same event in the feed, homepage and future
-- personal delivery. No actor, organization, recipient, arbitrary JSON/HTML,
-- original file path or answer payload is copied into this global catalogue.
CREATE TABLE rtn_private.update_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE CHECK(sequence BETWEEN 1 AND 9007199254740991),
 kind text NOT NULL CHECK(kind IN('news','source_change','bank_release')),
 topic text NOT NULL CHECK(topic ~ '^[a-z][a-z0-9_-]{0,63}$'),
 event_key text NOT NULL CHECK(length(event_key) BETWEEN 1 AND 1024),
 content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
 previous_event_id uuid UNIQUE REFERENCES rtn_private.update_events(id),
 news_source_id smallint REFERENCES rtn_private.news_sources(id),
 bank_id uuid REFERENCES rtn_private.banks(id),
 source_revision_id uuid REFERENCES rtn_private.source_revisions(id),
 release_id uuid REFERENCES rtn_private.releases(id),
 canonical_url text NOT NULL CHECK(length(canonical_url)<=2048),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 1000 AND title !~ '[<>[:cntrl:]]'),
 source_excerpt text NOT NULL DEFAULT '' CHECK(length(source_excerpt)<=600 AND source_excerpt !~ '[<>[:cntrl:]]'),
 own_summary text NOT NULL DEFAULT '' CHECK(length(own_summary)<=600 AND own_summary !~ '[<>[:cntrl:]]'),
 published_at timestamptz,effective_from date,
 observed_at timestamptz NOT NULL DEFAULT now(),
 historical boolean NOT NULL DEFAULT true,
 notifiable boolean NOT NULL DEFAULT false CHECK(NOT historical OR NOT notifiable),
 UNIQUE(kind,event_key,content_sha256),
 CHECK((kind='news' AND news_source_id IS NOT NULL AND news_source_id=1 AND bank_id IS NULL AND source_revision_id IS NULL AND release_id IS NULL
   AND published_at IS NOT NULL AND effective_from IS NULL
   AND topic IN('general','industrial-safety','energy_supervision_knowledge_check')
   AND canonical_url ~ '^https://www[.]gosnadzor[.]ru/news/[1-9][0-9]{0,5}/[1-9][0-9]{0,11}/$'
   AND event_key=canonical_url)
  OR(kind='source_change' AND news_source_id IS NULL AND bank_id IS NOT NULL AND source_revision_id IS NOT NULL
   AND release_id IS NULL AND previous_event_id IS NULL AND published_at IS NULL AND effective_from IS NULL)
  OR(kind='bank_release' AND news_source_id IS NULL AND bank_id IS NOT NULL AND source_revision_id IS NOT NULL
   AND release_id IS NOT NULL AND previous_event_id IS NULL AND published_at IS NOT NULL AND effective_from IS NOT NULL))
);
CREATE UNIQUE INDEX rtn_updates_first_version ON rtn_private.update_events(kind,event_key) WHERE previous_event_id IS NULL;
CREATE INDEX rtn_updates_feed_cursor ON rtn_private.update_events(sequence DESC);
CREATE INDEX rtn_updates_kind_topic_cursor ON rtn_private.update_events(kind,topic,sequence DESC);
ALTER TABLE rtn_private.news_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE rtn_private.update_events ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION rtn_private.validate_update_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
DECLARE prior rtn_private.update_events%ROWTYPE;b rtn_private.banks%ROWTYPE;sr rtn_private.source_revisions%ROWTYPE;
 r rtn_private.releases%ROWTYPE;actual_source uuid;BEGIN
 -- Serialize first/correction insertions by the canonical identity. Unique
 -- constraints still reject duplicate content and competing successor versions.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.kind||':'||NEW.event_key,42020));
 IF NEW.previous_event_id IS NOT NULL THEN
  SELECT * INTO prior FROM rtn_private.update_events WHERE id=NEW.previous_event_id;
  IF prior.id IS NULL OR prior.kind IS DISTINCT FROM NEW.kind OR prior.event_key IS DISTINCT FROM NEW.event_key
   OR prior.sequence>=NEW.sequence OR prior.content_sha256=NEW.content_sha256
   OR EXISTS(SELECT 1 FROM rtn_private.update_events WHERE kind=NEW.kind AND event_key=NEW.event_key AND sequence>prior.sequence)
  THEN RAISE EXCEPTION 'rtn_update_correction_requires_current_same_identity' USING ERRCODE='23514';END IF;
 END IF;
 IF NEW.kind<>'news' THEN
  SELECT * INTO b FROM rtn_private.banks WHERE id=NEW.bank_id;
  SELECT * INTO sr FROM rtn_private.source_revisions WHERE id=NEW.source_revision_id;
  IF b.id IS NULL OR sr.id IS NULL OR b.source_id IS DISTINCT FROM sr.source_id
   OR NEW.topic IS DISTINCT FROM b.domain OR NEW.canonical_url IS DISTINCT FROM sr.document_url
   OR NEW.content_sha256 IS DISTINCT FROM sr.sha256
  THEN RAISE EXCEPTION 'rtn_update_requires_exact_bank_source' USING ERRCODE='23514';END IF;
  IF NEW.kind='source_change' THEN
   IF NEW.event_key IS DISTINCT FROM NEW.bank_id::text||':'||NEW.source_revision_id::text
   THEN RAISE EXCEPTION 'rtn_update_source_identity_invalid' USING ERRCODE='23514';END IF;
  ELSE
   SELECT * INTO r FROM rtn_private.releases WHERE id=NEW.release_id;
   SELECT br.source_revision_id INTO actual_source FROM rtn_private.key_sets k
    JOIN rtn_private.bank_revisions br ON br.id=k.bank_revision_id WHERE k.id=r.key_set_id;
   IF r.id IS NULL OR r.bank_id IS DISTINCT FROM NEW.bank_id OR actual_source IS DISTINCT FROM NEW.source_revision_id
    OR NEW.event_key IS DISTINCT FROM NEW.release_id::text OR NEW.published_at IS DISTINCT FROM r.published_at
    OR NEW.effective_from IS DISTINCT FROM r.effective_from
   THEN RAISE EXCEPTION 'rtn_update_requires_exact_published_release' USING ERRCODE='23514';END IF;
  END IF;
 END IF;
 RETURN NEW;
END;$fn$;
CREATE FUNCTION rtn_private.reject_update_event_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN RAISE EXCEPTION 'rtn_update_history_is_immutable' USING ERRCODE='42501';END;$fn$;
CREATE TRIGGER rtn_updates_validate BEFORE INSERT ON rtn_private.update_events
 FOR EACH ROW EXECUTE FUNCTION rtn_private.validate_update_event();
CREATE TRIGGER rtn_updates_immutable BEFORE UPDATE OR DELETE ON rtn_private.update_events
 FOR EACH ROW EXECUTE FUNCTION rtn_private.reject_update_event_mutation();
CREATE TRIGGER rtn_updates_no_truncate BEFORE TRUNCATE ON rtn_private.update_events
 FOR EACH STATEMENT EXECUTE FUNCTION rtn_private.reject_update_event_mutation();

-- This projection is explicit so future internal columns cannot leak to a
-- browser. It contains no unread count or personal notification semantics.
CREATE FUNCTION rtn_private.update_event_payload(e rtn_private.update_events) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('id',e.id,'sequence',e.sequence,'kind',e.kind,'topic',e.topic,
  'previous_event_id',e.previous_event_id,'bank_id',e.bank_id,'source_revision_id',e.source_revision_id,'release_id',e.release_id,
  'canonical_url',e.canonical_url,'title',e.title,'source_excerpt',e.source_excerpt,'own_summary',e.own_summary,
  'published_at',e.published_at,'effective_from',e.effective_from,'observed_at',e.observed_at,
  'historical',e.historical,'notifiable',e.notifiable)
$fn$;
CREATE FUNCTION rtn_private.update_source_health() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('code',s.code,'feed_url',s.feed_url,'last_checked_at',s.last_checked_at,
  'last_success_at',s.last_success_at,'status',s.last_status,'coverage_kind',s.coverage_kind,
  'coverage_from',s.coverage_from,'coverage_until',s.coverage_until,'error_code',s.last_error_code,
  'complete_archive',false) FROM rtn_private.news_sources s WHERE s.id=1
$fn$;

CREATE FUNCTION public.get_rtn_updates(p_organization_id uuid,p_kind text DEFAULT NULL,p_topic text DEFAULT NULL,
 p_before_sequence bigint DEFAULT NULL,p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE items jsonb;more boolean;next_cursor bigint;BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.read');
 PERFORM rtn_private.assert_entitled(p_organization_id);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR(p_before_sequence IS NOT NULL AND p_before_sequence NOT BETWEEN 1 AND 9007199254740991)
  OR(p_kind IS NOT NULL AND p_kind NOT IN('news','source_change','bank_release','questions'))
  OR(p_topic IS NOT NULL AND p_topic !~ '^[a-z][a-z0-9_-]{0,63}$')
 THEN RAISE EXCEPTION 'rtn_update_filter_invalid' USING ERRCODE='22023';END IF;
 WITH page AS MATERIALIZED(
  SELECT e FROM rtn_private.update_events e
  WHERE(p_before_sequence IS NULL OR e.sequence<p_before_sequence)
   AND(p_kind IS NULL OR e.kind=p_kind OR(p_kind='questions' AND e.kind IN('source_change','bank_release')))
   AND(p_topic IS NULL OR e.topic=p_topic) AND(e.bank_id IS NULL OR rtn_private.entitled(p_organization_id,e.bank_id))
  ORDER BY e.sequence DESC LIMIT p_limit+1
 ),selected AS(SELECT e FROM page ORDER BY(e).sequence DESC LIMIT p_limit)
 SELECT coalesce(jsonb_agg(rtn_private.update_event_payload(e) ORDER BY(e).sequence DESC),'[]'::jsonb),
  (SELECT count(*)>p_limit FROM page),min((e).sequence) INTO items,more,next_cursor FROM selected;
 RETURN jsonb_build_object('events',items,'has_more',more,'next_before_sequence',CASE WHEN more THEN next_cursor END,
  'source_health',rtn_private.update_source_health());
END;$fn$;
CREATE FUNCTION public.get_rtn_update(p_organization_id uuid,p_event_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE event rtn_private.update_events%ROWTYPE;BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.read');
 PERFORM rtn_private.assert_entitled(p_organization_id);
 SELECT * INTO event FROM rtn_private.update_events WHERE id=p_event_id;
 IF event.id IS NULL OR(event.bank_id IS NOT NULL AND NOT rtn_private.entitled(p_organization_id,event.bank_id))
 THEN RAISE EXCEPTION 'rtn_update_not_available' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('event',rtn_private.update_event_payload(event),'source_health',rtn_private.update_source_health());
END;$fn$;
CREATE FUNCTION public.get_rtn_update_summary(p_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE n integer;latest jsonb;BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.read');
 PERFORM rtn_private.assert_entitled(p_organization_id);
 WITH recent AS MATERIALIZED(SELECT e FROM rtn_private.update_events e
  WHERE e.bank_id IS NULL OR rtn_private.entitled(p_organization_id,e.bank_id) ORDER BY e.sequence DESC LIMIT 1001)
 SELECT count(*)::integer,(SELECT rtn_private.update_event_payload(e) FROM recent ORDER BY(e).sequence DESC LIMIT 1) INTO n,latest FROM recent;
 RETURN jsonb_build_object('latest_event',latest,'event_count',least(n,1000),'count_is_lower_bound',n>1000,
  'count_semantics','known_events_not_unread','source_health',rtn_private.update_source_health());
END;$fn$;

-- Scrub actual provider default grants on new OIDs only, including unknown
-- provider-role defaults. No role, schema grant, old function or default ACL is
-- broadened or changed. New tables/sequences have no direct client grants.
DO $acl$ DECLARE f record;g record;t record;BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.oid::regprocedure AS signature,n.nspname
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE NOT EXISTS(SELECT 1 FROM pg_temp.rtn_updates_existing_functions old WHERE old.oid=p.oid)
   AND(n.nspname='rtn_private' OR(n.nspname='public' AND p.proname IN('get_rtn_updates','get_rtn_update','get_rtn_update_summary'))) LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=f.oid),acldefault('f',f.proowner)))a
   WHERE a.grantee<>f.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',f.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
  IF f.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
 FOR t IN SELECT c.oid,c.relowner,c.relkind,c.oid::regclass AS qualified_name FROM pg_class c
  WHERE c.oid IN('rtn_private.news_sources'::regclass,'rtn_private.update_events'::regclass,
   pg_get_serial_sequence('rtn_private.update_events','sequence')::regclass) LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid=t.oid),acldefault(CASE WHEN t.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,t.relowner)))a
   WHERE a.grantee<>t.relowner LOOP
   EXECUTE format('REVOKE ALL ON %s %s FROM %s',CASE WHEN t.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,t.qualified_name,
    CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_temp.rtn_updates_existing_functions old JOIN pg_proc p ON p.oid=old.oid WHERE old.catalog IS DISTINCT FROM to_jsonb(p))
 THEN RAISE EXCEPTION 'RTN_UPDATES_EXISTING_FUNCTION_CHANGED';END IF;
END;$acl$;
