
CREATE TABLE public.admin_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  related_entity_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all notifications"
  ON public.admin_notifications FOR SELECT
  TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can update notifications"
  ON public.admin_notifications FOR UPDATE
  TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Service can insert notifications"
  ON public.admin_notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anon can insert notifications"
  ON public.admin_notifications FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE INDEX idx_admin_notifications_is_read ON public.admin_notifications (is_read);
CREATE INDEX idx_admin_notifications_created_at ON public.admin_notifications (created_at DESC);
