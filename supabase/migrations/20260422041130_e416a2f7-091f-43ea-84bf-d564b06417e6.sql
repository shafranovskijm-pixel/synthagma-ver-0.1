CREATE TABLE public.marketplace_import_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  parent_category TEXT NOT NULL,
  sub_category TEXT,
  hours INTEGER,
  price_reference NUMERIC,
  description TEXT,
  source_url TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'imported', 'skipped', 'failed')),
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  error_message TEXT,
  imported_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_mic_status ON public.marketplace_import_catalog(status);
CREATE INDEX idx_mic_parent ON public.marketplace_import_catalog(parent_category);
CREATE INDEX idx_mic_course ON public.marketplace_import_catalog(course_id);

ALTER TABLE public.marketplace_import_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view import catalog"
  ON public.marketplace_import_catalog FOR SELECT
  USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can insert import catalog"
  ON public.marketplace_import_catalog FOR INSERT
  WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can update import catalog"
  ON public.marketplace_import_catalog FOR UPDATE
  USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can delete import catalog"
  ON public.marketplace_import_catalog FOR DELETE
  USING (public.has_role('admin'::app_role, auth.uid()));

CREATE TRIGGER update_marketplace_import_catalog_updated_at
  BEFORE UPDATE ON public.marketplace_import_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();