-- Create achievements table
CREATE TABLE public.achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'blue',
  rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  category TEXT NOT NULL,
  condition_type TEXT NOT NULL,
  condition_value INTEGER DEFAULT 1,
  is_secret BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_achievements table
CREATE TABLE public.user_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_seen BOOLEAN DEFAULT false,
  UNIQUE(user_id, achievement_id)
);

-- Enable RLS
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- Achievements are readable by everyone
CREATE POLICY "Achievements are viewable by everyone" 
ON public.achievements 
FOR SELECT 
USING (true);

-- Users can view their own achievements
CREATE POLICY "Users can view their own achievements" 
ON public.user_achievements 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can update their own achievements (mark as seen)
CREATE POLICY "Users can update their own achievements" 
ON public.user_achievements 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Insert policy for system/triggers
CREATE POLICY "System can insert achievements" 
ON public.user_achievements 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Insert initial achievements
INSERT INTO public.achievements (code, name, description, icon, color, rarity, category, condition_type, condition_value, is_secret) VALUES
-- Старт обучения
('first_step', 'Первый шаг', 'Путь в тысячу уроков начинается с одного клика!', '🚀', 'blue', 'common', 'start', 'registration', 1, false),
('curious_newbie', 'Любопытный новичок', 'Ты уже что-то начал — это больше, чем 90% людей!', '👀', 'yellow', 'common', 'start', 'first_lesson_opened', 1, false),
('on_your_marks', 'На старт!', 'Образование — это путешествие. Ты в пути!', '🏁', 'green', 'common', 'start', 'first_lesson_completed', 1, false),

-- Прогресс
('warmup', 'Разогрев', 'Мозг включился, кофе готов!', '🔥', 'orange', 'common', 'progress', 'lessons_completed', 5, false),
('marathon_runner', 'Марафонец', 'Ты не бежишь — ты летишь!', '🏃', 'purple', 'rare', 'progress', 'lessons_completed', 25, false),
('halfway', 'Полпути', 'Экватор пройден!', '⚡', 'yellow', 'rare', 'progress', 'course_progress', 50, false),
('almost_there', 'Почти там', 'Финиш уже виден!', '🎯', 'red', 'epic', 'progress', 'course_progress', 90, false),
('graduate', 'Выпускник', 'Курс пройден. Ты — молодец!', '🎓', 'gold', 'epic', 'progress', 'course_completed', 1, false),
('knowledge_collector', 'Коллекционер знаний', 'Один курс? Мало!', '📚', 'blue', 'legendary', 'progress', 'courses_completed', 3, false),

-- Активность
('early_bird', 'Ранняя пташка', 'Кто рано встаёт, тот всё успевает!', '🐦', 'pink', 'rare', 'activity', 'early_learning', 1, false),
('night_owl', 'Сова', 'Ночь — время истинных знаний', '🦉', 'indigo', 'rare', 'activity', 'late_learning', 1, false),
('stability', 'Стабильность', '7 дней подряд — это сила воли!', '📅', 'green', 'rare', 'activity', 'streak_days', 7, false),
('iron_discipline', 'Железная дисциплина', 'Месяц без пропусков!', '💪', 'red', 'epic', 'activity', 'streak_days', 30, false),
('sprinter', 'Спринтер', 'Быстрее ветра!', '⚡', 'cyan', 'common', 'activity', 'fast_lesson', 1, false),
('thoughtful', 'Вдумчивый', 'Не торопишься — молодец!', '🧘', 'teal', 'rare', 'activity', 'long_lesson', 1, false),

-- Аттестация
('first_blood', 'Первая кровь', 'Тест? Да легко!', '✅', 'green', 'common', 'assessment', 'first_test_passed', 1, false),
('perfectionist', 'Перфекционист', 'Ни одной ошибки!', '💎', 'cyan', 'epic', 'assessment', 'perfect_test', 1, false),
('persistent', 'Упорный', 'Упал — встал — пересдал!', '🔄', 'orange', 'rare', 'assessment', 'test_retake_success', 1, false),
('test_terror', 'Гроза тестов', 'Тесты боятся тебя!', '👑', 'gold', 'legendary', 'assessment', 'high_score_tests', 10, false),

-- Возвращение
('comeback', 'Камбэк', 'Скучал по учёбе? Мы тоже!', '🔙', 'purple', 'rare', 'return', 'return_after_days', 7, false),
('phoenix', 'Феникс', 'Из пепла — к знаниям!', '🔥', 'orange', 'epic', 'return', 'return_after_days', 30, false),
('unsinkable', 'Непотопляемый', 'Ты не сдаёшься!', '🚢', 'blue', 'legendary', 'return', 'return_after_days', 90, false),

-- Секретные
('easter_egg', '???', 'Кто-то нажал куда не надо...', '🥚', 'rainbow', 'rare', 'secret', 'easter_egg', 1, true),
('midnight_snack', 'Ночной дожор', 'Обучение под пиццу — это законно!', '🍕', 'orange', 'epic', 'secret', 'weekend_midnight', 1, true),
('first_place', 'Первый!', 'Ты здесь раньше всех!', '🥇', 'gold', 'legendary', 'secret', 'first_in_group', 1, true);