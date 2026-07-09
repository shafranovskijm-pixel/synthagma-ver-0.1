
INSERT INTO public.sales_companies_db (
  inn, ogrn, name, region, city, address, phone, email, website,
  license_number, license_issue_date, has_education_license,
  status, data_source, source_url, converted_to_lead_id, parsed_at
)
SELECT
  l.inn,
  NULLIF(l.ogrn, ''),
  l.org_name,
  NULLIF(l.region, ''),
  NULLIF(l.city, ''),
  NULLIF(l.address, ''),
  NULLIF(l.phone, ''),
  NULLIF(l.email, ''),
  NULLIF(l.website, ''),
  NULLIF(l.license_number, ''),
  l.license_date,
  (l.license_number IS NOT NULL AND l.license_number <> ''),
  'active',
  COALESCE(NULLIF(l.source, ''), 'sales_leads'),
  NULL,
  l.id,
  COALESCE(l.created_at, now())
FROM public.sales_leads l
WHERE l.inn IS NOT NULL
  AND l.inn <> ''
  AND l.org_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sales_companies_db c WHERE c.inn = l.inn
  );
