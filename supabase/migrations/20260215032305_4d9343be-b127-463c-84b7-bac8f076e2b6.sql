
CREATE OR REPLACE FUNCTION public.get_user_storage_files(bucket_name text)
RETURNS TABLE (
  file_name text,
  file_path text,
  bucket_id text,
  file_size bigint,
  created_at timestamptz,
  mime_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.name::text AS file_name,
    o.name::text AS file_path,
    o.bucket_id::text,
    COALESCE((o.metadata->>'size')::bigint, 0) AS file_size,
    o.created_at,
    COALESCE(o.metadata->>'mimetype', '')::text AS mime_type
  FROM storage.objects o
  WHERE o.bucket_id = bucket_name
    AND o.owner = auth.uid()
  ORDER BY o.created_at DESC;
END;
$$;
