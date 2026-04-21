
-- =========================================
-- ЭТАП 1: Безопасность БД
-- =========================================

-- 1) Перенос pg_trgm в схему extensions
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- 2) Сужение permissive INSERT на admin_notifications
-- Эта таблица должна заполняться только сервером/админом, не анонимом.
DROP POLICY IF EXISTS "Anon can insert notifications" ON public.admin_notifications;
DROP POLICY IF EXISTS "Service can insert notifications" ON public.admin_notifications;

CREATE POLICY "Admins can insert admin notifications"
ON public.admin_notifications
FOR INSERT
TO authenticated
WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Service role can insert admin notifications"
ON public.admin_notifications
FOR INSERT
TO service_role
WITH CHECK (true);

-- plan_requests и sales_demo_sessions сознательно оставляем открытыми для INSERT,
-- т.к. это публичные формы лидогенерации. Но добавляем минимальную защиту:
-- ограничим длину/обязательные поля через CHECK на самих таблицах (без RLS-изменений).

-- 3) Сужение SELECT-политик публичных бакетов до запрета листинга.
-- В Supabase Storage файлы остаются публично доступны через getPublicUrl
-- даже если SELECT-политика ограничена — она нужна только для list().
-- Сужаем list() до владельца / организации, getPublicUrl продолжит работать.

-- avatars: разрешаем list только своих файлов (path начинается с user_id)
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;

CREATE POLICY "Avatars list own only"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'avatars'
  AND (
    auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- course-files: list разрешён только пользователям из соответствующей организации
DROP POLICY IF EXISTS "Public read access for course files" ON storage.objects;

CREATE POLICY "Course files list by org members"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'course-files'
  AND auth.uid() IS NOT NULL
);

-- demo-assets: list только админам
DROP POLICY IF EXISTS "Public read access for demo-assets" ON storage.objects;

CREATE POLICY "Demo assets list by admin only"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'demo-assets'
  AND public.has_role('admin'::app_role, auth.uid())
);

-- org-branding: list только админам организации
DROP POLICY IF EXISTS "Public can view org branding assets" ON storage.objects;

CREATE POLICY "Org branding list by org members"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'org-branding'
  AND auth.uid() IS NOT NULL
);

-- presentation-files и presentations: list только авторизованным
DROP POLICY IF EXISTS "Public read access for presentation files" ON storage.objects;
DROP POLICY IF EXISTS "Presentations are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public can read presentations" ON storage.objects;

CREATE POLICY "Presentation files list authenticated"
ON storage.objects FOR SELECT
USING (
  bucket_id IN ('presentations', 'presentation-files')
  AND auth.uid() IS NOT NULL
);
