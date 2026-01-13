-- Таблица для хранения настроек функций по организациям
CREATE TABLE public.organization_features (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, feature_id)
);

-- Таблица для хранения настроек категорий по организациям
CREATE TABLE public.organization_feature_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, category_id)
);

-- Включаем RLS
ALTER TABLE public.organization_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_feature_categories ENABLE ROW LEVEL SECURITY;

-- Политики для чтения (организации могут читать свои настройки, админы - все)
CREATE POLICY "Organizations can read own features" 
ON public.organization_features 
FOR SELECT 
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Organizations can read own feature categories" 
ON public.organization_feature_categories 
FOR SELECT 
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Политики для записи (только админы)
CREATE POLICY "Only admins can modify organization features" 
ON public.organization_features 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Only admins can modify organization feature categories" 
ON public.organization_feature_categories 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Триггеры для обновления updated_at
CREATE TRIGGER update_organization_features_updated_at
BEFORE UPDATE ON public.organization_features
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organization_feature_categories_updated_at
BEFORE UPDATE ON public.organization_feature_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Индексы для быстрого поиска
CREATE INDEX idx_organization_features_org_id ON public.organization_features(organization_id);
CREATE INDEX idx_organization_feature_categories_org_id ON public.organization_feature_categories(organization_id);