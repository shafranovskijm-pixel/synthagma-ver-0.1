
CREATE OR REPLACE FUNCTION public.admin_collect_media_references()
RETURNS TABLE(
  reference_url text,
  entity_type text,
  entity_id uuid,
  entity_title text,
  organization_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role('admin'::app_role, auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  -- lessons.video_url / audio_url / image_url + lessons.content (jsonb scan)
  RETURN QUERY
  SELECT 
    l.video_url::text AS reference_url,
    'lesson_video'::text AS entity_type,
    l.id AS entity_id,
    l.title AS entity_title,
    c.organization_id
  FROM lessons l
  JOIN courses c ON c.id = l.course_id
  WHERE l.video_url IS NOT NULL AND l.video_url <> '';

  RETURN QUERY
  SELECT 
    l.audio_url::text,
    'lesson_audio'::text,
    l.id,
    l.title,
    c.organization_id
  FROM lessons l
  JOIN courses c ON c.id = l.course_id
  WHERE l.audio_url IS NOT NULL AND l.audio_url <> '';

  RETURN QUERY
  SELECT 
    l.image_url::text,
    'lesson_image'::text,
    l.id,
    l.title,
    c.organization_id
  FROM lessons l
  JOIN courses c ON c.id = l.course_id
  WHERE l.image_url IS NOT NULL AND l.image_url <> '';

  -- Scan lessons.content jsonb for url fields
  RETURN QUERY
  SELECT 
    val::text AS reference_url,
    'lesson_content'::text,
    l.id,
    l.title,
    c.organization_id
  FROM lessons l
  JOIN courses c ON c.id = l.course_id,
  LATERAL jsonb_path_query(l.content, 'strict $.**.url') AS val
  WHERE l.content IS NOT NULL 
    AND jsonb_typeof(l.content) IN ('array','object');

  -- Course covers
  RETURN QUERY
  SELECT 
    c.cover_image_url::text,
    'course_cover'::text,
    c.id,
    c.title,
    c.organization_id
  FROM courses c
  WHERE c.cover_image_url IS NOT NULL AND c.cover_image_url <> '';

  -- Course documents
  RETURN QUERY
  SELECT 
    cd.file_url::text,
    'course_document'::text,
    cd.id,
    cd.name,
    c.organization_id
  FROM course_documents cd
  JOIN courses c ON c.id = cd.course_id
  WHERE cd.file_url IS NOT NULL AND cd.file_url <> '';

  -- Organization branding (logo/cover from organization_branding if exists)
  RETURN QUERY
  SELECT 
    o.logo_url::text,
    'org_logo'::text,
    o.id,
    o.name,
    o.id
  FROM organizations o
  WHERE o.logo_url IS NOT NULL AND o.logo_url <> '';

  -- Company stamps and signatures
  RETURN QUERY
  SELECT 
    co.stamp_url::text,
    'company_stamp'::text,
    co.id,
    co.name,
    co.organization_id
  FROM companies co
  WHERE co.stamp_url IS NOT NULL AND co.stamp_url <> '';

  RETURN QUERY
  SELECT 
    co.signature_url::text,
    'company_signature'::text,
    co.id,
    co.name,
    co.organization_id
  FROM companies co
  WHERE co.signature_url IS NOT NULL AND co.signature_url <> '';

  -- Company documents
  RETURN QUERY
  SELECT 
    cmd.file_url::text,
    'company_document'::text,
    cmd.id,
    cmd.name,
    co.organization_id
  FROM company_documents cmd
  JOIN companies co ON co.id = cmd.company_id
  WHERE cmd.file_url IS NOT NULL AND cmd.file_url <> '';

  RETURN;
END;
$$;
