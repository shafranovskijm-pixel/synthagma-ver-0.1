-- Разрешаем авторизованным пользователям загружать/обновлять/читать подписанные PDF
-- в папке signed/ бакета external-contracts. Сам файл всегда раздаётся через
-- createSignedUrl, поэтому публичность бакета не требуется.

DO $$
BEGIN
  -- Проверим, существует ли бакет; если нет — создадим как непубличный
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'external-contracts') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('external-contracts', 'external-contracts', false);
  END IF;
END $$;

-- Удаляем возможные дубликаты политик (идемпотентность)
DROP POLICY IF EXISTS "external_contracts_signed_select" ON storage.objects;
DROP POLICY IF EXISTS "external_contracts_signed_insert" ON storage.objects;
DROP POLICY IF EXISTS "external_contracts_signed_update" ON storage.objects;

CREATE POLICY "external_contracts_signed_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'external-contracts'
  AND (storage.foldername(name))[1] = 'signed'
);

CREATE POLICY "external_contracts_signed_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'external-contracts'
  AND (storage.foldername(name))[1] = 'signed'
);

CREATE POLICY "external_contracts_signed_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'external-contracts'
  AND (storage.foldername(name))[1] = 'signed'
)
WITH CHECK (
  bucket_id = 'external-contracts'
  AND (storage.foldername(name))[1] = 'signed'
);