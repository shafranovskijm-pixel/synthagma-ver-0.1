ALTER TABLE public.generation_history
  ADD COLUMN IF NOT EXISTS stream_index smallint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duration_ms integer DEFAULT NULL;