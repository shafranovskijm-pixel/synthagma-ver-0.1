-- Без SELECT-политики storage.buckets supabase-js считает любой бакет
-- несуществующим и возвращает "Bucket not found" при попытке загрузки/чтения.
-- Метаданные бакета (id, name, public) безопасно публиковать — настоящие
-- ограничения доступа лежат на storage.objects.

DROP POLICY IF EXISTS "Buckets are viewable by everyone" ON storage.buckets;

CREATE POLICY "Buckets are viewable by everyone"
ON storage.buckets
FOR SELECT
TO public
USING (true);