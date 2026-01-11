-- Add student dashboard settings to organizations table
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS student_dashboard_settings JSONB DEFAULT '{"showLibrary": true, "showAchievements": true, "showAiChat": true}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.organizations.student_dashboard_settings IS 'Settings for student dashboard: showLibrary, showAchievements, showAiChat';