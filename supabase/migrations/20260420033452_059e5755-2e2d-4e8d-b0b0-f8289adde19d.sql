-- 1. Таблица диалогов поддержки
CREATE TABLE public.support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  guest_token TEXT,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'landing' CHECK (source IN ('landing','student','organization','company','partner','admin')),
  status TEXT NOT NULL DEFAULT 'ai' CHECK (status IN ('ai','human','closed')),
  title TEXT,
  telegram_topic_id BIGINT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unread_for_admin INT NOT NULL DEFAULT 0,
  unread_for_user INT NOT NULL DEFAULT 0,
  ai_failures_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_conv_owner_check CHECK (user_id IS NOT NULL OR guest_token IS NOT NULL)
);

CREATE INDEX idx_support_conv_user ON public.support_conversations(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_support_conv_guest ON public.support_conversations(guest_token) WHERE guest_token IS NOT NULL;
CREATE INDEX idx_support_conv_status ON public.support_conversations(status, last_message_at DESC);
CREATE INDEX idx_support_conv_topic ON public.support_conversations(telegram_topic_id) WHERE telegram_topic_id IS NOT NULL;

-- 2. Таблица сообщений
CREATE TABLE public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','ai','operator','system')),
  content TEXT NOT NULL,
  sender_user_id UUID,
  sender_name TEXT,
  telegram_message_id BIGINT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_msg_conv ON public.support_messages(conversation_id, created_at);
CREATE INDEX idx_support_msg_tg ON public.support_messages(telegram_message_id) WHERE telegram_message_id IS NOT NULL;

-- 3. Триггер обновления updated_at и last_message_at
CREATE OR REPLACE FUNCTION public.touch_support_conversation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.support_conversations
  SET last_message_at = NEW.created_at,
      updated_at = now(),
      unread_for_admin = CASE WHEN NEW.role IN ('user') THEN unread_for_admin + 1 ELSE unread_for_admin END,
      unread_for_user = CASE WHEN NEW.role IN ('ai','operator') THEN unread_for_user + 1 ELSE unread_for_user END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_touch_support_conversation
AFTER INSERT ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_support_conversation();

CREATE TRIGGER trg_support_conv_updated
BEFORE UPDATE ON public.support_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RLS
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- support_conversations: SELECT
CREATE POLICY "Users see their own conversations"
ON public.support_conversations FOR SELECT TO authenticated
USING (user_id = auth.uid() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Anon can read by guest token (server only)"
ON public.support_conversations FOR SELECT TO anon
USING (false);

-- INSERT: только через edge function (service role) — клиенты не пишут напрямую
CREATE POLICY "Authenticated can insert own conv"
ON public.support_conversations FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update conversations"
ON public.support_conversations FOR UPDATE TO authenticated
USING (has_role('admin'::app_role, auth.uid()))
WITH CHECK (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Users can update unread on own conv"
ON public.support_conversations FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- support_messages: SELECT
CREATE POLICY "Users see messages in their conversations"
ON public.support_messages FOR SELECT TO authenticated
USING (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.support_conversations c
    WHERE c.id = support_messages.conversation_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Users can post in own conv"
ON public.support_messages FOR INSERT TO authenticated
WITH CHECK (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.support_conversations c
    WHERE c.id = support_messages.conversation_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can update messages"
ON public.support_messages FOR UPDATE TO authenticated
USING (has_role('admin'::app_role, auth.uid()));

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER TABLE public.support_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;

-- 6. Telegram polling state
CREATE TABLE public.support_telegram_state (
  id INT PRIMARY KEY CHECK (id = 1),
  update_offset BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.support_telegram_state (id, update_offset) VALUES (1, 0);
ALTER TABLE public.support_telegram_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins can see telegram state"
ON public.support_telegram_state FOR SELECT TO authenticated
USING (has_role('admin'::app_role, auth.uid()));