
-- Table: student login history
CREATE TABLE public.student_login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  logged_in_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);

ALTER TABLE public.student_login_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all login history"
  ON public.student_login_history FOR SELECT
  USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can view their students login history"
  ON public.student_login_history FOR SELECT
  USING (organization_id = public.current_organization_id());

CREATE POLICY "Users can insert own login history"
  ON public.student_login_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_login_history_user ON public.student_login_history(user_id);
CREATE INDEX idx_login_history_org ON public.student_login_history(organization_id);

-- Table: org-student messages
CREATE TABLE public.org_student_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL,
  sender_user_id uuid NOT NULL,
  content text,
  attachment_url text,
  attachment_name text,
  attachment_type text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_student_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all messages"
  ON public.org_student_messages FOR SELECT
  USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can view their org messages"
  ON public.org_student_messages FOR SELECT
  USING (organization_id = public.current_organization_id());

CREATE POLICY "Students can view their own messages"
  ON public.org_student_messages FOR SELECT
  USING (auth.uid() = student_user_id);

CREATE POLICY "Org users can send messages"
  ON public.org_student_messages FOR INSERT
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY "Students can send messages"
  ON public.org_student_messages FOR INSERT
  WITH CHECK (auth.uid() = student_user_id);

CREATE POLICY "Recipients can mark as read"
  ON public.org_student_messages FOR UPDATE
  USING (auth.uid() = student_user_id OR organization_id = public.current_organization_id())
  WITH CHECK (auth.uid() = student_user_id OR organization_id = public.current_organization_id());

CREATE INDEX idx_messages_org_student ON public.org_student_messages(organization_id, student_user_id);
CREATE INDEX idx_messages_created ON public.org_student_messages(created_at);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.org_student_messages;

-- Chat attachments bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', false);

CREATE POLICY "Authenticated users can upload chat attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "Authenticated users can view chat attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');
