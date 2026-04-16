-- Create chat_notification_settings table
CREATE TABLE public.chat_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chat_type text NOT NULL,
  chat_partner_id uuid,
  muted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Unique index that handles NULL chat_partner_id
CREATE UNIQUE INDEX idx_chat_notif_unique 
ON public.chat_notification_settings (user_id, chat_type, COALESCE(chat_partner_id, '00000000-0000-0000-0000-000000000000'));

-- Enable RLS
ALTER TABLE public.chat_notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users manage own notification settings"
ON public.chat_notification_settings FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);