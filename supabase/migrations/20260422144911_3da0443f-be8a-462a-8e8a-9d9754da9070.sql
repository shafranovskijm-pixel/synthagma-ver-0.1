ALTER TABLE public.sales_demo_links 
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sales_demo_links_org ON public.sales_demo_links(organization_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_demo_links' AND policyname='Org sales managers can view org demo links') THEN
    CREATE POLICY "Org sales managers can view org demo links"
      ON public.sales_demo_links FOR SELECT TO authenticated
      USING (organization_id IS NOT NULL AND public.has_org_staff_permission(auth.uid(), organization_id, 'sales.read'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_demo_links' AND policyname='Org sales managers can insert org demo links') THEN
    CREATE POLICY "Org sales managers can insert org demo links"
      ON public.sales_demo_links FOR INSERT TO authenticated
      WITH CHECK (organization_id IS NOT NULL AND public.has_org_staff_permission(auth.uid(), organization_id, 'sales.write'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_demo_links' AND policyname='Org sales managers can update org demo links') THEN
    CREATE POLICY "Org sales managers can update org demo links"
      ON public.sales_demo_links FOR UPDATE TO authenticated
      USING (organization_id IS NOT NULL AND public.has_org_staff_permission(auth.uid(), organization_id, 'sales.write'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_demo_links' AND policyname='Org sales managers can delete org demo links') THEN
    CREATE POLICY "Org sales managers can delete org demo links"
      ON public.sales_demo_links FOR DELETE TO authenticated
      USING (organization_id IS NOT NULL AND public.has_org_staff_permission(auth.uid(), organization_id, 'sales.write'));
  END IF;
END $$;