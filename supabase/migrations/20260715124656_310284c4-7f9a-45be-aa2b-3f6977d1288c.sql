
CREATE TABLE public.landing_popups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  badge_text TEXT NOT NULL DEFAULT '',
  cta_text TEXT NOT NULL DEFAULT 'Отправить',
  image_url TEXT,
  delay_seconds INTEGER NOT NULL DEFAULT 300,
  storage_key TEXT NOT NULL DEFAULT 'landing_popup_dismissed',
  show_for_authenticated BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_tag TEXT NOT NULL DEFAULT 'popup',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.landing_popups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_popups TO authenticated;
GRANT ALL ON public.landing_popups TO service_role;

ALTER TABLE public.landing_popups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view enabled popups"
ON public.landing_popups FOR SELECT
USING (enabled = true OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert popups"
ON public.landing_popups FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update popups"
ON public.landing_popups FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete popups"
ON public.landing_popups FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_landing_popups_updated_at
BEFORE UPDATE ON public.landing_popups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.landing_popups (name, enabled, title, subtitle, description, badge_text, cta_text, delay_seconds, storage_key, sort_order, source_tag)
VALUES (
  'Спецпредложение 30%',
  true,
  'Специальные условия',
  'Только для новых клиентов',
  'Оставьте заявку и получите персональное предложение для вашей организации',
  'до 30% выгода',
  'Получить предложение',
  300,
  'special_offer_dismissed',
  0,
  'special_offer'
);
