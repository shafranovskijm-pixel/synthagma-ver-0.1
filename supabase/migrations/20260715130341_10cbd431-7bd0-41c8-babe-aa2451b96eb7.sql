
-- Seed default hide_proxy_badge = true so index.html defensive script has a value to read
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES ('hide_proxy_badge', '{"value": true}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- Ensure anon can read this specific key (needed by index.html boot script)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_settings'
      AND policyname = 'Anon can read hide_proxy_badge'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Anon can read hide_proxy_badge"
      ON public.app_settings
      FOR SELECT
      TO anon, authenticated
      USING (setting_key = 'hide_proxy_badge')
    $p$;
  END IF;
END $$;

GRANT SELECT ON public.app_settings TO anon;
