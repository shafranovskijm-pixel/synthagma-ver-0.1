
-- Создаём таблицу компаний
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  inn TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Добавляем поле company_id в profiles
ALTER TABLE public.profiles ADD COLUMN company_id UUID REFERENCES public.companies(id);

-- Включаем RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Политики для компаний
CREATE POLICY "Org users can manage their companies" 
ON public.companies 
FOR ALL 
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can view their companies" 
ON public.companies 
FOR SELECT 
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

-- Индекс для быстрого поиска
CREATE INDEX idx_companies_organization ON public.companies(organization_id);
CREATE INDEX idx_profiles_company ON public.profiles(company_id);

-- Триггер для обновления updated_at
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
