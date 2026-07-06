
ALTER TABLE public.email_sender_pool ADD COLUMN IF NOT EXISTS imap_last_uid bigint NOT NULL DEFAULT 0;
ALTER TABLE public.email_sender_pool ADD COLUMN IF NOT EXISTS imap_last_scan_at timestamptz;

CREATE TABLE IF NOT EXISTS public.email_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.email_sender_pool(id) ON DELETE CASCADE,
  remote_email text NOT NULL,
  remote_name text,
  subject text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_snippet text,
  last_direction text NOT NULL DEFAULT 'incoming',
  unread_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  campaign_id uuid,
  lead_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_id, remote_email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_conversations TO authenticated;
GRANT ALL ON public.email_conversations TO service_role;
ALTER TABLE public.email_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage conversations" ON public.email_conversations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_email_conv_sender_last ON public.email_conversations(sender_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_conv_status ON public.email_conversations(status);

CREATE TABLE IF NOT EXISTS public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.email_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('incoming','outgoing')),
  from_email text NOT NULL,
  from_name text,
  to_email text NOT NULL,
  subject text,
  body_text text,
  body_html text,
  message_id text,
  in_reply_to text,
  references_ids text,
  headers_raw text,
  received_at timestamptz NOT NULL DEFAULT now(),
  is_read boolean NOT NULL DEFAULT false,
  send_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_messages TO authenticated;
GRANT ALL ON public.email_messages TO service_role;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage messages" ON public.email_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_email_msg_conv ON public.email_messages(conversation_id, received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_msg_msgid ON public.email_messages(conversation_id, message_id) WHERE message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_email_conversation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.email_conversations
    SET last_message_at = NEW.received_at,
        last_snippet = LEFT(COALESCE(NEW.body_text, ''), 200),
        last_direction = NEW.direction,
        unread_count = CASE WHEN NEW.direction='incoming' AND NEW.is_read=false
                            THEN unread_count + 1 ELSE unread_count END,
        updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_touch_email_conv ON public.email_messages;
CREATE TRIGGER trg_touch_email_conv AFTER INSERT ON public.email_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_email_conversation();

-- Cron for inbox scanner (every 5 minutes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='inbox-scanner-every-5min') THEN
    PERFORM cron.unschedule('inbox-scanner-every-5min');
  END IF;
  PERFORM cron.schedule(
    'inbox-scanner-every-5min',
    '*/5 * * * *',
    $CRON$
    SELECT net.http_post(
      url := 'https://atxwvjxbqjgkbjlhsdch.supabase.co/functions/v1/inbox-scanner',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
    $CRON$
  );
END $$;
