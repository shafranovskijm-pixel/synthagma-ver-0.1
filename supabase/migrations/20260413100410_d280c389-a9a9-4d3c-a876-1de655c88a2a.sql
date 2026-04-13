
-- Add organization_id and is_template to achievements
ALTER TABLE public.achievements 
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN is_template BOOLEAN NOT NULL DEFAULT false;

-- Index for fast org lookups
CREATE INDEX idx_achievements_organization_id ON public.achievements(organization_id);

-- Drop existing policies if any
DROP POLICY IF EXISTS "Anyone can view achievements" ON public.achievements;
DROP POLICY IF EXISTS "Admins can manage achievements" ON public.achievements;

-- RLS policies
CREATE POLICY "View global and own org achievements"
  ON public.achievements FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id = public.current_organization_id()
    OR public.has_role('admin'::app_role, auth.uid())
  );

CREATE POLICY "Org can insert own achievements"
  ON public.achievements FOR INSERT
  WITH CHECK (
    (organization_id = public.current_organization_id() AND public.has_role('organization'::app_role, auth.uid()))
    OR public.has_role('admin'::app_role, auth.uid())
  );

CREATE POLICY "Org can update own achievements"
  ON public.achievements FOR UPDATE
  USING (
    (organization_id = public.current_organization_id() AND public.has_role('organization'::app_role, auth.uid()))
    OR public.has_role('admin'::app_role, auth.uid())
  );

CREATE POLICY "Org can delete own achievements"
  ON public.achievements FOR DELETE
  USING (
    (organization_id = public.current_organization_id() AND public.has_role('organization'::app_role, auth.uid()))
    OR public.has_role('admin'::app_role, auth.uid())
  );

-- Insert achievement templates (is_template = true, organization_id = NULL)
INSERT INTO public.achievements (code, name, description, icon, color, rarity, category, condition_type, is_template, is_secret) VALUES
  -- Construction
  ('tpl_foreman', 'Прораб', 'Завершил 5 курсов по строительной тематике', '🏗️', '#f59e0b', 'rare', 'progress', 'courses_completed', true, false),
  ('tpl_mason', 'Каменщик знаний', 'Набрал 100% на 3 тестах подряд', '🧱', '#d97706', 'epic', 'assessment', 'perfect_tests', true, false),
  ('tpl_architect', 'Архитектор', 'Прошёл все курсы в категории', '🏛️', '#b45309', 'legendary', 'progress', 'category_complete', true, false),
  ('tpl_safety_hat', 'Каска надета', 'Прошёл первый курс по охране труда', '⛑️', '#ea580c', 'common', 'start', 'first_course', true, false),
  ('tpl_builder', 'Строитель', 'Провёл на платформе более 10 часов', '👷', '#c2410c', 'rare', 'activity', 'time_spent', true, false),
  -- Medicine
  ('tpl_doctor', 'Доктор наук', 'Завершил 10 медицинских курсов', '💊', '#8b5cf6', 'legendary', 'progress', 'courses_completed', true, false),
  ('tpl_first_aid', 'Первая помощь', 'Прошёл курс по оказанию первой помощи', '🩺', '#7c3aed', 'common', 'start', 'first_course', true, false),
  ('tpl_researcher', 'Исследователь', 'Изучил все материалы курса без пропусков', '🔬', '#6d28d9', 'epic', 'progress', 'all_materials', true, false),
  ('tpl_healer', 'Целитель', 'Помог 5 коллегам с обучением', '💉', '#5b21b6', 'rare', 'activity', 'help_others', true, false),
  ('tpl_hygiene', 'Чистые руки', 'Прошёл курс по гигиене и санитарии', '🧼', '#4c1d95', 'common', 'start', 'first_course', true, false),
  -- IT
  ('tpl_coder', 'Кодер', 'Завершил первый IT-курс', '💻', '#06b6d4', 'common', 'start', 'first_course', true, false),
  ('tpl_bug_hunter', 'Баг-хантер', 'Нашёл и исправил все ошибки в тесте', '🐛', '#0891b2', 'rare', 'assessment', 'perfect_tests', true, false),
  ('tpl_deploy_master', 'Деплой мастер', 'Завершил все курсы за неделю', '🚀', '#0e7490', 'epic', 'activity', 'speed_complete', true, false),
  ('tpl_hacker', 'Хакер', 'Прошёл продвинутый курс по безопасности', '🔐', '#155e75', 'legendary', 'progress', 'advanced_course', true, false),
  -- General
  ('tpl_star', 'Звезда курса', 'Лучший результат в группе', '🌟', '#eab308', 'epic', 'assessment', 'top_score', true, false),
  ('tpl_bookworm', 'Книжный червь', 'Прочитал все учебные материалы', '📖', '#84cc16', 'rare', 'progress', 'all_materials', true, false),
  ('tpl_champion', 'Чемпион', 'Получил все достижения в категории', '🏆', '#f97316', 'legendary', 'progress', 'all_achievements', true, false),
  ('tpl_lightning', 'Молниеносный', 'Завершил курс быстрее среднего времени', '⚡', '#facc15', 'rare', 'activity', 'speed_complete', true, false),
  ('tpl_team_player', 'Командный игрок', 'Активно участвовал в обсуждениях', '🤝', '#22c55e', 'common', 'activity', 'discussions', true, false);
