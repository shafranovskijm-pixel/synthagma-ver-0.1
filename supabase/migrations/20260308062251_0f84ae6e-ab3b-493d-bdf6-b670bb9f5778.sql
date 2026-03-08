
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.find_similar_lesson_content(
  p_title text,
  p_min_similarity float DEFAULT 0.3
)
RETURNS TABLE(lesson_id uuid, title text, content text, similarity_score float)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    l.id AS lesson_id,
    l.title,
    l.content,
    similarity(lower(l.title), lower(p_title))::float AS similarity_score
  FROM lessons l
  WHERE l.type IN ('text', 'practice')
    AND l.content IS NOT NULL
    AND length(l.content) > 100
    AND l.content != '[]'
    AND similarity(lower(l.title), lower(p_title)) > p_min_similarity
  ORDER BY similarity_score DESC
  LIMIT 1;
$$;
