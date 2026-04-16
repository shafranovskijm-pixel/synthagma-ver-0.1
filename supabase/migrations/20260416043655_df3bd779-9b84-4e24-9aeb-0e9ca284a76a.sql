
-- Create org_general_messages table
CREATE TABLE public.org_general_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL,
  content TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.org_general_messages ENABLE ROW LEVEL SECURITY;

-- Policy: org members can read messages
CREATE POLICY "Org members can read general messages"
ON public.org_general_messages
FOR SELECT
TO authenticated
USING (
  organization_id = public.current_organization_id()
  OR public.has_role('admin'::app_role, auth.uid())
);

-- Policy: org members can insert messages
CREATE POLICY "Org members can insert general messages"
ON public.org_general_messages
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = public.current_organization_id()
  AND sender_user_id = auth.uid()
);

-- Index for fast queries
CREATE INDEX idx_org_general_messages_org_id ON public.org_general_messages(organization_id, created_at);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.org_general_messages;

-- Add notification_sound column to chat_notification_settings
ALTER TABLE public.chat_notification_settings
ADD COLUMN notification_sound TEXT NOT NULL DEFAULT 'message-1';
