ALTER TABLE public.organizations REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.organizations;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;