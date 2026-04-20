-- Auto-seed welcome course for every new organization
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_seed_welcome_course()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  request_id bigint;
BEGIN
  -- Skip the platform marketplace org
  IF NEW.id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT net.http_post(
      url := 'https://atxwvjxbqjgkbjlhsdch.supabase.co/functions/v1/seed-welcome-course',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0eHd2anhicWpna2JqbGhzZGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwODM5MjcsImV4cCI6MjA4MzY1OTkyN30.5mIZX4EYVPbQbCbHWww8ROD5taCQ51o5qNHOMcKK_s4'
      ),
      body := jsonb_build_object('organizationId', NEW.id::text),
      timeout_milliseconds := 60000
    ) INTO request_id;
  EXCEPTION WHEN OTHERS THEN
    -- Never block organization creation if seeding fails
    RAISE WARNING 'seed-welcome-course invocation failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_seed_welcome_course ON public.organizations;
CREATE TRIGGER auto_seed_welcome_course
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.trigger_seed_welcome_course();