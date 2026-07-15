-- 1) Удаляем placeholder-уроки «Новый ...» в welcome-курсах
DELETE FROM public.lessons
WHERE course_id IN (SELECT id FROM public.courses WHERE title ILIKE 'Добро пожаловать в СИНТАГМА')
  AND (
    title ILIKE 'Новый видеоурок%'
    OR title ILIKE 'Новый презентация%'
    OR title ILIKE 'Новый урок%'
    OR title ILIKE 'Новый тест%'
  );

-- 2) Вставляем урок «Демонстрация возможностей» в конец каждого welcome-курса
INSERT INTO public.lessons (course_id, title, type, order_index, content)
SELECT
  c.id,
  'Демонстрация возможностей',
  'text',
  COALESCE((SELECT MAX(order_index) + 1 FROM public.lessons WHERE course_id = c.id), 0),
  $json$[
    {"id":"demo-h1","type":"heading1","content":"Демонстрация возможностей 🎬"},
    {"id":"demo-p1","type":"paragraph","content":"Три коротких видео покажут ключевые сценарии работы в СИНТАГМА — создание курса, добавление ученика и выдачу документов."},
    {"id":"demo-h2-1","type":"heading2","content":"1. Создание курса"},
    {"id":"demo-v1","type":"video","content":"","videoUrl":"kinescope:0zLbxNWaXqqVirutHe2hFX"},
    {"id":"demo-h2-2","type":"heading2","content":"2. Добавление ученика"},
    {"id":"demo-v2","type":"video","content":"","videoUrl":"kinescope:8oJbrRNKBv7byqNjBPsZg9"},
    {"id":"demo-h2-3","type":"heading2","content":"3. Выдача документов"},
    {"id":"demo-v3","type":"video","content":"","videoUrl":"kinescope:aB9Q2ScCA7PrPrrHm8TdaT"}
  ]$json$
FROM public.courses c
WHERE c.title ILIKE 'Добро пожаловать в СИНТАГМА'
  AND NOT EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.course_id = c.id AND l.title = 'Демонстрация возможностей'
  );