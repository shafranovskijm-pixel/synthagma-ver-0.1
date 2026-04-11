
-- Create platform_updates table
CREATE TABLE public.platform_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_updates ENABLE ROW LEVEL SECURITY;

-- Anyone can read published updates
CREATE POLICY "Anyone can view published updates"
ON public.platform_updates
FOR SELECT
USING (is_published = true);

-- Admins can do everything
CREATE POLICY "Admins can manage all updates"
ON public.platform_updates
FOR ALL
TO authenticated
USING (public.has_role('admin'::app_role, auth.uid()))
WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_platform_updates_updated_at
BEFORE UPDATE ON public.platform_updates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed with recent platform changes
INSERT INTO public.platform_updates (title, description, is_published, published_at) VALUES
('Партнёрская программа', 'Запущена реферальная система с комиссиями до 25%. Партнёры получают кабинет со статистикой, материалами и выводом средств.', true, '2026-04-10'),
('Редизайн кабинета ученика', 'Кабинет слушателя переработан в стиле SkillSpace: новый sidebar с иконками, каталог курсов, баннер организации и футер.', true, '2026-04-09'),
('Лендинги курсов', 'Каждый курс теперь имеет настраиваемую продающую страницу с описанием, программой и кнопкой записи.', true, '2026-04-08'),
('Электронная подпись документов', 'Добавлена возможность подписывать согласия на обработку персональных данных электронной подписью.', true, '2026-04-07'),
('ИИ-генерация курсов', 'Создавайте курсы с помощью искусственного интеллекта: автоматическая генерация уроков, тестов и контента.', true, '2026-04-05'),
('Система достижений', 'Геймификация обучения: ученики получают достижения за прохождение уроков, тестов и курсов.', true, '2026-04-03'),
('Охрана труда', 'Новый модуль для проведения проверки знаний по охране труда с протоколами и группами.', true, '2026-04-01'),
('Интеграция с ФРДО', 'Автоматическая выгрузка данных о выданных документах в Федеральный реестр сведений о документах об образовании.', true, '2026-03-28');
