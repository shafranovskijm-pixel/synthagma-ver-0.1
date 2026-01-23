-- Создание таблицы для отслеживания принятия публичной оферты
CREATE TABLE IF NOT EXISTS public.organization_offer_acceptances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  offer_version TEXT DEFAULT '1.0'
);

-- Уникальный индекс: одна организация = одно принятие
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_offer_unique ON public.organization_offer_acceptances(organization_id);

-- Включение RLS
ALTER TABLE public.organization_offer_acceptances ENABLE ROW LEVEL SECURITY;

-- Политики RLS
CREATE POLICY "Users can view their org acceptances" ON public.organization_offer_acceptances FOR SELECT USING (true);
CREATE POLICY "Users can insert acceptances" ON public.organization_offer_acceptances FOR INSERT WITH CHECK (auth.uid() = user_id);