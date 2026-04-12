UPDATE organizations 
SET branding = jsonb_set(
  COALESCE(branding::jsonb, '{}'::jsonb),
  '{primaryColor}',
  '"#0d9488"'
)
WHERE branding->>'primaryColor' = '#6366f1';

UPDATE organizations 
SET branding = jsonb_set(
  COALESCE(branding::jsonb, '{}'::jsonb),
  '{secondaryColor}',
  '"#14b8a6"'
)
WHERE branding->>'secondaryColor' = '#8b5cf6';