-- Two new review cases only. The prior58case receipt/source remain immutable.
SELECT lab.archive_case('cross-SCAN repeated URL cannot close a boundary and keeps all page observations',$s$
 SELECT lab.keep('claim',lab.archive_gap());SELECT lab.keep('page1',lab.archive_page(lab.ctx('claim'),300));
 SELECT lab.keep('extra',jsonb_set(jsonb_set(jsonb_set(lab.ctx('page1')#>'{page,items,0}','{canonical_url}','"https://www.gosnadzor.ru/news/67/301/"'),'{title}','"Archive synthetic 301"'),'{ordinal}','2'));
 SELECT lab.keep('page1',jsonb_set(lab.ctx('page1'),'{page,items}',(lab.ctx('page1')#>'{page,items}')||jsonb_build_array(lab.ctx('extra'))));
 SELECT lab.archive_complete(lab.ctx('claim'),lab.ctx('page1'));
 SELECT lab.keep('claim',lab.archive_next(lab.ctx('claim')));
 SELECT lab.keep('receipt',lab.archive_complete(lab.ctx('claim'),lab.archive_page(lab.ctx('claim'),301,true)));
 SELECT lab.archive_assert((SELECT status='needs_review'AND stop_reason='moving_pagination'AND unique_pages=2 AND candidate_count=3 FROM rtn_private.news_archive_gaps));
 SELECT lab.archive_assert((SELECT count(*)=2 AND sum(jsonb_array_length(parsed_page->'items'))=4 FROM rtn_private.news_archive_requests WHERE status='accepted'));
 SELECT lab.archive_assert((SELECT observation_count=2 FROM rtn_private.news_archive_candidates WHERE canonical_url='https://www.gosnadzor.ru/news/67/301/'));
 SELECT lab.archive_assert(lab.ctx('receipt')->>'status'='needs_review');
$s$);
SELECT lab.archive_case('head and boundary revalidation repeats remain valid without unique-budget duplication',$s$
 SELECT lab.keep('claim',lab.archive_gap());SELECT lab.archive_complete(lab.ctx('claim'),lab.archive_page(lab.ctx('claim'),300));
 SELECT lab.keep('claim',lab.archive_next(lab.ctx('claim')));SELECT lab.archive_complete(lab.ctx('claim'),jsonb_set(lab.archive_page(lab.ctx('claim'),301),'{yield_after}','true'));
 SELECT lab.keep('resume',public.claim_rtn_news_archive_gap());SELECT lab.archive_assert(lab.ctx('resume')#>>'{request,purpose}'='head_revalidate');
 SELECT lab.archive_complete(lab.ctx('resume'),lab.archive_page(lab.ctx('resume'),300));
 SELECT lab.keep('resume',lab.archive_next(lab.ctx('resume')));SELECT lab.archive_assert(lab.ctx('resume')#>>'{request,purpose}'='boundary_revalidate');
 SELECT lab.archive_complete(lab.ctx('resume'),lab.archive_page(lab.ctx('resume'),301));
 SELECT lab.archive_assert((SELECT status='running'AND stop_reason IS NULL AND candidate_count=2 AND campaign_get_reserved=4 FROM rtn_private.news_archive_gaps));
 SELECT lab.archive_assert((SELECT count(*)=2 AND bool_and(observation_count=2)FROM rtn_private.news_archive_candidates));
$s$);
