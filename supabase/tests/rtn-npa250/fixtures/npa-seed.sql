-- SYNTHETIC native fixture only. No official facts or credentials.
SET ROLE postgres;
CREATE FUNCTION lab.artifact(p_run uuid,p_url text,p_sha text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE path text:='npa250/'||p_run::text||'/'||p_sha||'.json';BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='rtn-sources'AND name=path)THEN
 INSERT INTO storage.objects(bucket_id,name,metadata,created_at)VALUES('rtn-sources',path,'{"size":123}',clock_timestamp());END IF;
 RETURN jsonb_build_object('path',path,'sha256',p_sha,'bytes',123,'request_url',p_url,'http_status',200,'transport',split_part(p_url,':',1),'received_at',rtn_private.npa_iso(clock_timestamp()));END;$$;
CREATE FUNCTION lab.npa_result(p_run uuid,p_edition integer DEFAULT 1,p_question_sha text DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE run rtn_private.npa_check_runs;a jsonb;q jsonb;obs jsonb;stamp text;BEGIN
 SELECT * INTO STRICT run FROM rtn_private.npa_check_runs WHERE id=p_run;
 a:=lab.artifact(p_run,'http://actual.pravo.gov.ru:8000/api/ebpi/redtext',repeat('e',64));
 q:=lab.artifact(p_run,'https://www.gosnadzor.ru/service/list/normative-lab/a1.pdf',coalesce(p_question_sha,run.context->>'source_sha256'));
 stamp:=rtn_private.npa_iso(clock_timestamp());
 obs:=jsonb_build_object('adapter_version','actual-pravo-federal-law-v1','server_date',(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date,'fetched_at',stamp,'stable_read_set',true,'identity_count',1,'current_count',1,'error_code',NULL,
 'stable',jsonb_build_object('identity',jsonb_build_object('country','RU','kind','FederalLaw','issuer','Synthetic jurisdiction','date','1997-07-21','number','116-FZ','title','Synthetic industrial law','docid',38355,'dochash','synthetic-doc-hash'),
 'current',jsonb_build_object('redid',p_edition,'effective_from','2026-01-01','actual',true,'official',true,'checked',true,'redcompleted',true,'hascontent',true,'contentcomplete',true,'text_sha256',repeat(p_edition::text,64)),
 'graph',jsonb_build_object('canonical',jsonb_build_object('card',jsonb_build_object('synthetic_edition',p_edition,'all_refs',jsonb_build_array('reference-alpha')),'editions',jsonb_build_array(jsonb_build_object('redid',p_edition))),'future_editions','[]'::jsonb)),
 'artifacts',jsonb_build_object('identity',a,'redactions',a,'redtext',a,'card',a));
 RETURN jsonb_build_object('protocol','rtn-npa-v1','worker_version','rtn-npa-official-v1','status','complete','basis',jsonb_build_array(obs),'additional_artifacts','[]'::jsonb,'runtime_egress_verified',true,'error_code',NULL,
 'question_source',jsonb_build_object('source_id',run.context->'source_id','source_generation',run.context->'source_generation','sha256',coalesce(p_question_sha,run.context->>'source_sha256'),'parent_normalization_sha256',run.context->'parent_normalization_sha256','child_normalization_sha256',run.context->'child_normalization_sha256','catalog_complete',true,'fetched_at',stamp,'artifact',q),
 'discovery',jsonb_build_object('source','publication-pravo-federal-laws','from',run.discovery_from,'to_exclusive',run.discovery_to_exclusive,'complete',true,'reported_total',0,'relevance_complete',true,'unresolved_candidates','[]'::jsonb,'resolved_publications','[]'::jsonb,'error_code',NULL,
 'pages',jsonb_build_array(jsonb_build_object('index',1,'reported_total',0,'publication_ids','[]'::jsonb,'artifact',lab.artifact(p_run,'http://publication.pravo.gov.ru/search',repeat('f',64))))));
END;$$;
GRANT EXECUTE ON FUNCTION lab.artifact(uuid,text,text),lab.npa_result(uuid,integer,text)TO postgres,authenticated,service_role;
CREATE FUNCTION lab.refresh_source(p_sha text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE due jsonb;c jsonb;sid uuid:=(lab.ctx('source')->>'source_id')::uuid;BEGIN
 IF auth.role()<>'service_role'THEN RAISE EXCEPTION'Synthetic service fixture only';END IF;
 -- Synthetic elapsed clock to make the real scheduled core API due. No
 -- application source/hash/generation row is forged by this adapter.
 UPDATE rtn_private.sources SET last_checked_at=clock_timestamp()-interval'2 days',last_full_check_at=clock_timestamp()-interval'8 days'WHERE id=sid;
 due:=public.enqueue_due_rtn_checks();c:=public.claim_rtn_check((due->'run_ids'->>0)::uuid);
 RETURN public.complete_rtn_check((c->>'run_id')::uuid,(c->>'lease_token')::uuid,
 jsonb_build_object('status','changed','sha256',p_sha,'original_path',sid::text||'/'||p_sha||'.pdf','media_type','application/pdf','byte_size',1234,
 'document_url','https://www.gosnadzor.ru/service/list/normative-lab/a1.pdf','metadata',jsonb_build_object('approved_on','2026-08-10','effective_from','2026-09-01'),'normalized_banks',lab.ctx('normalized')));
END;$$;
GRANT EXECUTE ON FUNCTION lab.refresh_source(text)TO service_role;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000999',false);
SELECT lab.keep('fresh_review',public.review_rtn_keys((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('bank_revision_id')#>>'{}')::uuid,lab.ctx('keys'),'Synthetic fresh review one day window',lab.ctx('module')||jsonb_build_object('review_before',(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date+1)));
SELECT lab.keep('fresh_release',public.publish_rtn_release((lab.ctx('fresh_review')->>'key_set_id')::uuid,(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date,'Synthetic newly reviewed edition'));
SELECT lab.keep('basis','[{"country":"RU","kind":"FederalLaw","date":"1997-07-21","number":"116-FZ","title":"Synthetic industrial law","docid":38355}]');
SELECT lab.keep('configuration',public.configure_rtn_npa_basis((lab.ctx('bank_id')#>>'{}')::uuid,NULL,(lab.ctx('fresh_release')->>'release_id')::uuid,lab.ctx('basis'),(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date-1,'Synthetic complete basis configuration','85000000-0000-4000-8000-000000000001'));
