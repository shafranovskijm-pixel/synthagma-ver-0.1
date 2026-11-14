SET ROLE postgres;
DO $contract$
DECLARE spec text;path text[];variant integer;v jsonb;valid jsonb:=lab.ctx('npa_result');run rtn_private.npa_check_runs;bad boolean;n integer:=0;
 fields text[]:=ARRAY['protocol','worker_version','status','basis','question_source','discovery','additional_artifacts','runtime_egress_verified',
 'basis.0.adapter_version','basis.0.stable_read_set','basis.0.identity_count','basis.0.current_count','basis.0.server_date','basis.0.fetched_at','basis.0.stable','basis.0.artifacts',
 'basis.0.stable.identity','basis.0.stable.identity.country','basis.0.stable.identity.kind','basis.0.stable.identity.issuer','basis.0.stable.identity.date','basis.0.stable.identity.number','basis.0.stable.identity.title','basis.0.stable.identity.docid','basis.0.stable.identity.dochash',
 'basis.0.stable.current','basis.0.stable.current.redid','basis.0.stable.current.effective_from','basis.0.stable.current.actual','basis.0.stable.current.official','basis.0.stable.current.checked','basis.0.stable.current.redcompleted','basis.0.stable.current.hascontent','basis.0.stable.current.contentcomplete','basis.0.stable.current.text_sha256',
 'basis.0.stable.graph','basis.0.stable.graph.canonical','basis.0.stable.graph.canonical.card','basis.0.stable.graph.canonical.editions','basis.0.stable.graph.future_editions',
 'question_source.source_id','question_source.source_generation','question_source.sha256','question_source.parent_normalization_sha256','question_source.child_normalization_sha256','question_source.fetched_at','question_source.artifact','question_source.catalog_complete',
 'discovery.source','discovery.from','discovery.to_exclusive','discovery.complete','discovery.reported_total','discovery.pages','discovery.relevance_complete','discovery.unresolved_candidates','discovery.resolved_publications',
 'discovery.pages.0.index','discovery.pages.0.reported_total','discovery.pages.0.publication_ids','discovery.pages.0.artifact'];
 name text;field text;BEGIN
 SELECT * INTO STRICT run FROM rtn_private.npa_check_runs WHERE id=(lab.ctx('npa_claim')->>'run_id')::uuid;
 IF rtn_private.npa_proof(valid,run,clock_timestamp())->'full'IS DISTINCT FROM'true'::jsonb THEN RAISE EXCEPTION'Synthetic positive protocol control failed';END IF;
 FOREACH name IN ARRAY ARRAY['identity','redactions','redtext','card']LOOP
  fields:=array_append(fields,'basis.0.artifacts.'||name);
  FOREACH field IN ARRAY ARRAY['path','sha256','bytes','request_url','http_status','transport','received_at']LOOP fields:=array_append(fields,'basis.0.artifacts.'||name||'.'||field);END LOOP;
 END LOOP;
 FOREACH field IN ARRAY ARRAY['path','sha256','bytes','request_url','http_status','transport','received_at']LOOP fields:=array_append(fields,'question_source.artifact.'||field);END LOOP;
 FOREACH spec IN ARRAY fields LOOP
  path:=string_to_array(spec,'.');
  FOR variant IN 0..1 LOOP
   v:=CASE WHEN variant=0 THEN valid#-path ELSE jsonb_set(valid,path,'null')END;bad:=false;
   BEGIN bad:=NOT coalesce((rtn_private.npa_proof(v,run,clock_timestamp())->>'full')::boolean,false);EXCEPTION WHEN SQLSTATE'22023'THEN bad:=true;END;
   PERFORM lab.check(format('250 typed contract missing/null %s variant%s',spec,variant),bad);n:=n+1;
  END LOOP;
 END LOOP;
 valid:=lab.ctx('publication_proof');
 FOREACH spec IN ARRAY ARRAY['publication_id','relation','basis_docids','artifact','graph_reference_ids']LOOP
  path:=ARRAY['discovery','resolved_publications','0',spec];
  FOR variant IN 0..1 LOOP
   v:=CASE WHEN variant=0 THEN valid#-path ELSE jsonb_set(valid,path,'null')END;bad:=false;
   BEGIN bad:=NOT coalesce((rtn_private.npa_proof(v,run,clock_timestamp())->>'full')::boolean,false);EXCEPTION WHEN SQLSTATE'22023'THEN bad:=true;END;
   PERFORM lab.check(format('250 typed contract publication %s variant%s',spec,variant),bad);n:=n+1;
  END LOOP;
 END LOOP;
 PERFORM lab.keep('negative_contract_checks',to_jsonb(n));
END;$contract$;
