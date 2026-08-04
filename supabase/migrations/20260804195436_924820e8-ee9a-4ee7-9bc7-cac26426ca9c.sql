ALTER TABLE public.group_documents
  ADD COLUMN IF NOT EXISTS package_batch_id uuid,
  ADD COLUMN IF NOT EXISTS package_version integer,
  ADD COLUMN IF NOT EXISTS doc_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS fill_mode text NOT NULL DEFAULT 'blank',
  ADD COLUMN IF NOT EXISTS layout_format text NOT NULL DEFAULT 'legacy_html',
  ADD COLUMN IF NOT EXISTS source_note text,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

ALTER TABLE public.group_documents
  DROP CONSTRAINT IF EXISTS group_documents_doc_status_check;
ALTER TABLE public.group_documents
  ADD CONSTRAINT group_documents_doc_status_check CHECK (doc_status IN ('draft','final'));

ALTER TABLE public.group_documents
  DROP CONSTRAINT IF EXISTS group_documents_fill_mode_check;
ALTER TABLE public.group_documents
  ADD CONSTRAINT group_documents_fill_mode_check CHECK (fill_mode IN ('blank','data'));

CREATE INDEX IF NOT EXISTS idx_group_documents_batch
  ON public.group_documents (group_id, package_batch_id, created_at DESC);