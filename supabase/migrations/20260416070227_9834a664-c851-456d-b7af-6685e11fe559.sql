CREATE POLICY "Anyone can view active stations"
  ON public.radio_stations
  FOR SELECT
  TO anon
  USING (is_active = true);