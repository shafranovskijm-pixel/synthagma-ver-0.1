-- Database-owner integration smoke. Synthetic rows, all changes rolled back.
-- Does not upload files/send mail. storage.objects fixtures test the SQL boundary
-- only; actual storage byte verification is exercised by the MCP unit tests.
BEGIN;
CREATE FUNCTION pg_temp.act_assert(ok boolean, description text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', description; END IF; END;
$$;
CREATE FUNCTION pg_temp.act_expect_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual = MESSAGE_TEXT; END;
  IF actual IS NULL OR strpos(actual, expected) = 0 THEN
    RAISE EXCEPTION 'EXPECTED ERROR %, GOT %', expected, actual;
  END IF;
END;
$$;

INSERT INTO auth.users(id,email) VALUES
  ('8b1987f0-0929-4000-8000-000000000001','platform-act-admin@example.invalid'),
  ('8b1987f0-0929-4000-8000-000000000002','platform-act-other@example.invalid');
INSERT INTO public.profiles(user_id,full_name,blocked_at) VALUES
  ('8b1987f0-0929-4000-8000-000000000001','Synthetic act admin',NULL),
  ('8b1987f0-0929-4000-8000-000000000002','Synthetic non-admin',NULL)
  ON CONFLICT(user_id) DO UPDATE SET blocked_at = NULL;
DELETE FROM public.user_roles WHERE user_id IN
  ('8b1987f0-0929-4000-8000-000000000001','8b1987f0-0929-4000-8000-000000000002');
INSERT INTO public.user_roles(user_id,role) VALUES
  ('8b1987f0-0929-4000-8000-000000000001','admin'),
  ('8b1987f0-0929-4000-8000-000000000002','student');
INSERT INTO public.organizations(id,name,email,inn,director_name,director_position) VALUES
  ('8b1987f0-0929-4000-8000-000000000010','SQL ACT TEST ORGANIZATION','act-org@example.invalid','1234567890','Source Director','Director'),
  ('8b1987f0-0929-4000-8000-000000000011','SQL ACT FOREIGN ORGANIZATION','act-foreign@example.invalid','1234567891','Foreign Director','Director');
INSERT INTO public.subscription_invoices(id,organization_id,invoice_number,invoice_date,amount,plan,period_months,buyer_name,buyer_inn) VALUES
  ('8b1987f0-0929-4000-8000-000000000020','8b1987f0-0929-4000-8000-000000000010','SQL-TEST-1','2026-09-01',3000.99,'start',1,'Other Invoice Buyer','9988776655'),
  ('8b1987f0-0929-4000-8000-000000000021','8b1987f0-0929-4000-8000-000000000010','SQL-TEST-2','2026-09-01',3100,'start',1,NULL,NULL),
  ('8b1987f0-0929-4000-8000-0000000000a2','8b1987f0-0929-4000-8000-000000000010','SQL-TEST-3','2026-09-01',3200,'start',1,NULL,NULL),
  ('8b1987f0-0929-4000-8000-000000000023','8b1987f0-0929-4000-8000-000000000010','SQL-TEST-4','2026-09-01',3300,'start',1,NULL,NULL);

SELECT set_config('request.jwt.claim.sub','8b1987f0-0929-4000-8000-000000000001',true);
DO $$
DECLARE
  org uuid := '8b1987f0-0929-4000-8000-000000000010';
  inv uuid := '8b1987f0-0929-4000-8000-000000000020';
  ctx jsonb; prepared jsonb; replay jsonb; final jsonb; pending jsonb; old_hash text;
  html text := '<html><body>' || repeat('Synthetic SQL act fixture; no real document.', 5) || '</body></html>';
BEGIN
  ctx := public.sintagma_platform_act_source(org,inv);
  PERFORM pg_temp.act_assert(ctx->'source'->>'amount_kopecks' = '300099','exact kopecks');
  PERFORM pg_temp.act_assert(ctx->'source'->'buyer'->>'name' = 'Other Invoice Buyer','invoice buyer overrides organization');
  PERFORM pg_temp.act_assert(ctx->'source'->'buyer'->>'director_name' IS NULL,'unknown other payer director stays null');
  PERFORM pg_temp.act_assert(ctx->>'act_number' = 'А-SQL-TEST-1','number follows source invoice');
  PERFORM pg_temp.act_assert(ctx->'source'->>'status' = 'pending','no invented paid-only gate');
  PERFORM pg_temp.act_expect_error(format('SELECT public.sintagma_platform_act_source(%L,%L)',
    '8b1987f0-0929-4000-8000-000000000011',inv),'invoice_not_found');

  old_hash := ctx->>'source_sha256';
  UPDATE public.subscription_invoices SET amount = 4000 WHERE id = inv;
  PERFORM pg_temp.act_expect_error(format('SELECT public.sintagma_prepare_platform_invoice_act(%L,%L,%L,%L,%L,%L)',
    org,inv,'8b1987f0-0929-4000-8000-000000000030','2026-09-29',old_hash,html),'invoice_source_changed');
  UPDATE public.subscription_invoices SET amount = 3000.99 WHERE id = inv;
  prepared := public.sintagma_prepare_platform_invoice_act(org,inv,'8b1987f0-0929-4000-8000-000000000030','2026-09-29',old_hash,html);
  PERFORM pg_temp.act_assert(prepared->'act'->>'status' = 'pending','initial snapshot pending');
  PERFORM pg_temp.act_assert(NOT EXISTS(SELECT 1 FROM public.org_billing_documents WHERE organization_id = org),'no visible row before upload');
  PERFORM pg_temp.act_expect_error(format('SELECT public.sintagma_finalize_platform_invoice_act(%L,%L)',
    prepared->'act'->>'id',prepared->'act'->>'html_sha256'),'artifact_not_uploaded');
  UPDATE public.subscription_invoices SET amount = 4000 WHERE id = inv;
  replay := public.sintagma_prepare_platform_invoice_act(org,inv,'8b1987f0-0929-4000-8000-000000000030','2026-09-29',old_hash,html || 'changed');
  PERFORM pg_temp.act_assert(replay->'act' = prepared->'act','retry returns unchanged saved snapshot after invoice changes');
  PERFORM pg_temp.act_expect_error(format('SELECT public.sintagma_prepare_platform_invoice_act(%L,%L,%L,%L,%L,%L)',
    org,inv,'8b1987f0-0929-4000-8000-000000000030','2026-09-30',old_hash,html),'request_id_conflict');
  PERFORM pg_temp.act_expect_error(format('SELECT public.sintagma_prepare_platform_invoice_act(%L,%L,%L,%L,%L,%L)',
    org,'8b1987f0-0929-4000-8000-000000000021','8b1987f0-0929-4000-8000-000000000030','2026-09-29',old_hash,html),'request_id_conflict');
  INSERT INTO storage.objects(bucket_id,name) VALUES('billing-documents',prepared->'act'->>'storage_path');
  PERFORM pg_temp.act_expect_error(format('SELECT public.sintagma_finalize_platform_invoice_act(%L,%L)',
    prepared->'act'->>'id',repeat('0',64)),'artifact_hash_mismatch');
  final := public.sintagma_finalize_platform_invoice_act((prepared->'act'->>'id')::uuid,prepared->'act'->>'html_sha256');
  PERFORM pg_temp.act_assert(final->>'status' = 'ready','finalization registers visible act');
  PERFORM pg_temp.act_assert(final->>'billing_document_id' IS NOT NULL,'billing doc link assigned');
  replay := public.sintagma_finalize_platform_invoice_act((prepared->'act'->>'id')::uuid,prepared->'act'->>'html_sha256');
  PERFORM pg_temp.act_assert(final = replay,'finalization idempotent');
  PERFORM pg_temp.act_assert((SELECT count(*) FROM public.org_billing_documents WHERE organization_id = org) = 1,'one visible act');
  PERFORM pg_temp.act_expect_error(format('INSERT INTO public.org_billing_documents(organization_id,name,doc_type,file_url) VALUES(%L,%L,''act'',%L)',
    org,'Another UI act' || chr(8203) || '<inv:' || inv || '>' || chr(8203),org || '/acts/ui.html'),'invoice_act_already_exists');
  UPDATE public.org_billing_documents SET deleted_at = now() WHERE id = (final->>'billing_document_id')::uuid;
  PERFORM pg_temp.act_expect_error(format('SELECT public.sintagma_platform_act_source(%L,%L)',org,inv),'act_in_trash');

  -- Uppercase legacy marker recognized without issuing another act.
  inv := '8b1987f0-0929-4000-8000-0000000000a2';
  INSERT INTO public.org_billing_documents(organization_id,name,doc_type,file_url)
    VALUES(org,'Legacy uppercase' || chr(8203) || '<inv:' || upper(inv::text) || '>' || chr(8203),'act',org || '/acts/legacy.html');
  ctx := public.sintagma_platform_act_source(org,inv);
  PERFORM pg_temp.act_assert(ctx->'legacy_act' <> 'null'::jsonb,'uppercase legacy recognized');
  replay := public.sintagma_prepare_platform_invoice_act(org,inv,'8b1987f0-0929-4000-8000-000000000032','2026-09-29',ctx->>'source_sha256',html);
  PERFORM pg_temp.act_assert(replay->'legacy_act' <> 'null'::jsonb,'legacy returned, no snapshot created');

  -- Existing UI can win between prepare and finalize; it must remain the only act.
  inv := '8b1987f0-0929-4000-8000-000000000023';
  ctx := public.sintagma_platform_act_source(org,inv);
  pending := public.sintagma_prepare_platform_invoice_act(org,inv,'8b1987f0-0929-4000-8000-000000000033','2026-09-29',ctx->>'source_sha256',html);
  INSERT INTO public.org_billing_documents(organization_id,name,doc_type,file_url)
    VALUES(org,'Concurrent UI act' || chr(8203) || '<inv:' || inv || '>' || chr(8203),'act',org || '/acts/concurrent.html');
  INSERT INTO storage.objects(bucket_id,name) VALUES('billing-documents',pending->'act'->>'storage_path');
  final := public.sintagma_finalize_platform_invoice_act((pending->'act'->>'id')::uuid,pending->'act'->>'html_sha256');
  PERFORM pg_temp.act_assert(final->'legacy_act' <> 'null'::jsonb,'finalize detects intervening UI act');
  PERFORM pg_temp.act_assert((SELECT count(*) FROM public.org_billing_documents
    WHERE organization_id = org AND strpos(name,inv::text) > 0) = 1,'no UI/MCP duplicate');
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_assert((SELECT count(*) FROM public.platform_invoice_acts) >= 1,'admin sees snapshots');
SELECT pg_temp.act_expect_error('UPDATE public.platform_invoice_acts SET html_snapshot = ''changed'' WHERE organization_id = ''8b1987f0-0929-4000-8000-000000000010''','permission denied');
RESET ROLE;
UPDATE public.profiles SET blocked_at = now() WHERE user_id = '8b1987f0-0929-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_assert((SELECT count(*) FROM public.platform_invoice_acts) = 0,'blocked admin cannot read snapshots');
SELECT pg_temp.act_expect_error('SELECT public.sintagma_search_billing_organizations(''SQL ACT'')','platform_admin_required');
SELECT pg_temp.act_expect_error('SELECT public.sintagma_platform_act_source(''8b1987f0-0929-4000-8000-000000000010'',''8b1987f0-0929-4000-8000-000000000020'')','platform_admin_required');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','8b1987f0-0929-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_assert((SELECT count(*) FROM public.platform_invoice_acts) = 0,'nonadmin sees no snapshots');
SELECT pg_temp.act_expect_error('SELECT public.sintagma_search_billing_organizations(''SQL ACT'')','platform_admin_required');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.act_expect_error('SELECT public.sintagma_search_billing_organizations(''SQL ACT'')','permission denied');
RESET ROLE;
ROLLBACK;
