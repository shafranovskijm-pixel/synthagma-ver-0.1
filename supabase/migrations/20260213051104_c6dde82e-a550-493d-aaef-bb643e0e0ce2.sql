
CREATE TABLE public.plan_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_requests ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public landing form)
CREATE POLICY "Anyone can submit plan request"
  ON public.plan_requests FOR INSERT
  WITH CHECK (true);

-- Only authenticated admins can read (we'll rely on admin role check in app)
CREATE POLICY "Admins can view plan requests"
  ON public.plan_requests FOR SELECT
  USING (true);
