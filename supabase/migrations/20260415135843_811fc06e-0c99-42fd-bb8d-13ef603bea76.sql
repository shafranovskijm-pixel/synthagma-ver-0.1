
-- Radio stations table
CREATE TABLE public.radio_stations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  stream_url TEXT NOT NULL,
  logo_url TEXT,
  genre TEXT DEFAULT 'mixed',
  radioapi_stream_id INTEGER,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.radio_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active stations"
  ON public.radio_stations FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage stations"
  ON public.radio_stations FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()))
  WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

-- Seed popular Russian radio stations
INSERT INTO public.radio_stations (name, stream_url, genre, sort_order) VALUES
  ('Radio Record', 'https://radiorecord.hostingradio.ru/rr_main96.aacp', 'dance', 1),
  ('Europa Plus', 'https://ep256.hostingradio.ru:8052/europaplus256.mp3', 'pop', 2),
  ('Русское Радио', 'https://rusradio.hostingradio.ru/rusradio128.mp3', 'pop', 3),
  ('DFM', 'https://dfm.hostingradio.ru/dfm96.aacp', 'dance', 4),
  ('Retro FM', 'https://retro.hostingradio.ru/retro256.mp3', 'retro', 5),
  ('Relax FM', 'https://relaxfm.hostingradio.ru/relaxfm128.mp3', 'lounge', 6),
  ('Nashe Radio', 'https://nashe.hostingradio.ru/nashe-128.mp3', 'rock', 7),
  ('Record Deep', 'https://radiorecord.hostingradio.ru/deep96.aacp', 'deep house', 8),
  ('Record Chill-Out', 'https://radiorecord.hostingradio.ru/chillout96.aacp', 'chillout', 9),
  ('Lofi Hip Hop', 'https://radiorecord.hostingradio.ru/lofi96.aacp', 'lofi', 10);
