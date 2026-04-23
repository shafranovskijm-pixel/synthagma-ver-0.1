ALTER TABLE public.webinars DROP CONSTRAINT IF EXISTS webinars_recording_status_check;
ALTER TABLE public.webinars ADD CONSTRAINT webinars_recording_status_check
  CHECK (recording_status = ANY (ARRAY['none'::text,'starting'::text,'active'::text,'stopped'::text,'processing'::text,'uploaded'::text,'failed'::text]));