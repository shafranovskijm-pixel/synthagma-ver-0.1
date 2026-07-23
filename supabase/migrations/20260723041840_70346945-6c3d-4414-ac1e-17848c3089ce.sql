
CREATE TABLE public.student_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  related_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX student_notifications_user_created_idx
  ON public.student_notifications(user_id, created_at DESC);
CREATE INDEX student_notifications_user_unread_idx
  ON public.student_notifications(user_id) WHERE is_read = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_notifications TO authenticated;
GRANT ALL ON public.student_notifications TO service_role;

ALTER TABLE public.student_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own notifications"
  ON public.student_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Students mark own notifications"
  ON public.student_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Students delete own notifications"
  ON public.student_notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Only service_role writes new rows (edge-функции). Клиент не создаёт напрямую.
CREATE POLICY "Service role manages notifications"
  ON public.student_notifications FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_notifications;
