
-- Knowledge Bank table
CREATE TABLE public.knowledge_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  source_filename TEXT,
  tags TEXT[] DEFAULT '{}',
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.knowledge_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on knowledge_bank" ON public.knowledge_bank
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()));

-- RPC for similarity search in knowledge bank
CREATE OR REPLACE FUNCTION public.find_knowledge_bank_content(
  p_title TEXT, p_min_similarity FLOAT DEFAULT 0.3
)
RETURNS TABLE(id UUID, title TEXT, content TEXT, similarity_score FLOAT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT kb.id, kb.title, kb.content,
         similarity(lower(kb.title), lower(p_title))::float AS similarity_score
  FROM knowledge_bank kb
  WHERE kb.content IS NOT NULL AND length(kb.content) > 100
    AND similarity(lower(kb.title), lower(p_title)) > p_min_similarity
  ORDER BY similarity_score DESC LIMIT 1;
$$;

-- Index for trigram similarity on knowledge_bank titles
CREATE INDEX idx_knowledge_bank_title_trgm ON public.knowledge_bank USING gin (title gin_trgm_ops);
