UPDATE public.organizations
SET menu_settings = COALESCE(menu_settings, '{}'::jsonb)
  || jsonb_build_object('showCompanies', false, 'showAITutors', false);