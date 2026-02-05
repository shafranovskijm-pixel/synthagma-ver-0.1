-- Backfill legacy video_identifications rows that were created without organization_id.
-- 1) Users that exist in profiles
UPDATE public.video_identifications vi
SET organization_id = p.organization_id
FROM public.profiles p
WHERE vi.organization_id IS NULL
  AND vi.user_id = p.user_id
  AND p.organization_id IS NOT NULL;

-- 2) Users that don't have profiles rows but exist in labor_safety_profiles
UPDATE public.video_identifications vi
SET organization_id = lsp.organization_id
FROM public.labor_safety_profiles lsp
WHERE vi.organization_id IS NULL
  AND vi.user_id = lsp.user_id
  AND lsp.organization_id IS NOT NULL;
