ALTER TABLE public.webinars ADD COLUMN IF NOT EXISTS stream_url text;
ALTER TABLE public.webinars ADD COLUMN IF NOT EXISTS stream_platform text DEFAULT 'telemost';