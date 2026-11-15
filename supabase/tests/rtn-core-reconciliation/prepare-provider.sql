-- Synthetic local reproduction of the exact two observed provider changes.
-- This file is never a production migration and never touches user data.
SET ROLE postgres;
DO $fixture$
DECLARE item record;definition text;body text;
BEGIN
 FOR item IN SELECT * FROM(VALUES
  ('public.save_rtn_settings(uuid,boolean,boolean)',
   '97aae32458ab9586a0132b9847b2bdf9','785506ee20900baaf24388ad8831e91f',
   E'\n ON CONFLICT(organization_id) DO UPDATE SET',E'\n  ON CONFLICT(organization_id) DO UPDATE SET'),
  ('public.get_rtn_workspace(uuid)',
   '409b1667afb34808dce69499898d3578','1da1b4c3931c2d6d861aac56de5b4f5a',
   E'\n    CASE WHEN b.parent_bank_id IS NOT NULL AND latest_parent.id IS DISTINCT FROM br.parent_bank_revision_id THEN ''unreviewed''',
   E'\n     CASE WHEN b.parent_bank_id IS NOT NULL AND latest_parent.id IS DISTINCT FROM br.parent_bank_revision_id THEN ''unreviewed''')
 )x(signature,canonical_md5,provider_md5,canonical_fragment,provider_fragment) LOOP
  SELECT pg_get_functiondef(p.oid),p.prosrc INTO definition,body FROM pg_proc p WHERE p.oid=to_regprocedure(item.signature);
  IF md5(body)<>item.canonical_md5 THEN RAISE EXCEPTION 'fixture_requires_canonical_core:%',item.signature;END IF;
  body:=replace(body,item.canonical_fragment,item.provider_fragment);
  EXECUTE replace(definition,(SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure(item.signature)),body);
  IF md5((SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure(item.signature)))<>item.provider_md5
  THEN RAISE EXCEPTION 'fixture_did_not_reproduce_observed_provider_body:%',item.signature;END IF;
 END LOOP;
END;$fixture$;
SELECT lab.check('fixture reproduces both exact observed provider body hashes',
 (SELECT md5(prosrc)='785506ee20900baaf24388ad8831e91f' FROM pg_proc WHERE oid='public.save_rtn_settings(uuid,boolean,boolean)'::regprocedure)
 AND(SELECT md5(prosrc)='1da1b4c3931c2d6d861aac56de5b4f5a' FROM pg_proc WHERE oid='public.get_rtn_workspace(uuid)'::regprocedure));
