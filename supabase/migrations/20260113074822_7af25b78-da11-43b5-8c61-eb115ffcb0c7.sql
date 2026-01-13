-- Создаём таблицу для хранения настроек функций системы
CREATE TABLE public.system_features (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_id TEXT NOT NULL UNIQUE,
  category_id TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Создаём таблицу для хранения базовых цен категорий
CREATE TABLE public.system_feature_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id TEXT NOT NULL UNIQUE,
  base_price NUMERIC NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Включаем RLS
ALTER TABLE public.system_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_feature_categories ENABLE ROW LEVEL SECURITY;

-- Политики для чтения (все могут читать)
CREATE POLICY "Anyone can read system features" 
ON public.system_features 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can read feature categories" 
ON public.system_feature_categories 
FOR SELECT 
USING (true);

-- Политики для записи (только админы)
CREATE POLICY "Only admins can modify system features" 
ON public.system_features 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Only admins can modify feature categories" 
ON public.system_feature_categories 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Триггеры для обновления updated_at
CREATE TRIGGER update_system_features_updated_at
BEFORE UPDATE ON public.system_features
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_feature_categories_updated_at
BEFORE UPDATE ON public.system_feature_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();