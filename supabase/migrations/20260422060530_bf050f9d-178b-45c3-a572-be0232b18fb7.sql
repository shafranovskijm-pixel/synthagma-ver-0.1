
-- ============================================================================
-- СПРИНТ 1: Авто-запись, напоминания, модерация, Q&A, опросы, чат
-- ============================================================================

-- 1) Расширяем таблицу webinars для авто-записи и напоминаний
ALTER TABLE public.webinars
  ADD COLUMN IF NOT EXISTS auto_record BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_egress_id TEXT,
  ADD COLUMN IF NOT EXISTS recording_status TEXT DEFAULT 'none' CHECK (recording_status IN ('none','starting','active','stopped','uploaded','failed')),
  ADD COLUMN IF NOT EXISTS recording_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recording_ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recording_external_url TEXT,
  ADD COLUMN IF NOT EXISTS reminders_sent JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_webinars_scheduled_pending_reminders
  ON public.webinars(scheduled_at) WHERE status = 'scheduled';

-- 2) Чат — устойчивое хранилище
CREATE TABLE IF NOT EXISTS public.webinar_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  sender_identity TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  is_host BOOLEAN NOT NULL DEFAULT false,
  is_guest BOOLEAN NOT NULL DEFAULT false,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webinar_chat_webinar ON public.webinar_chat_messages(webinar_id, created_at);
ALTER TABLE public.webinar_chat_messages ENABLE ROW LEVEL SECURITY;

-- Доступ: владельцы вебинара (org/admin), участники, и любой, кто видит сам вебинар
CREATE POLICY "Anyone with webinar access can view chat"
ON public.webinar_chat_messages FOR SELECT TO authenticated
USING (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (SELECT 1 FROM webinars w WHERE w.id = webinar_id AND w.organization_id = current_organization_id())
  OR EXISTS (SELECT 1 FROM webinar_participants wp WHERE wp.webinar_id = webinar_chat_messages.webinar_id AND wp.user_id = auth.uid())
);

CREATE POLICY "Authenticated can insert own chat"
ON public.webinar_chat_messages FOR INSERT TO authenticated
WITH CHECK (true);

-- Anon (гости) — только чтение архива чата при открытом allow_guests
CREATE POLICY "Guests can view chat for public webinars"
ON public.webinar_chat_messages FOR SELECT TO anon
USING (
  EXISTS (SELECT 1 FROM webinars w WHERE w.id = webinar_id AND w.allow_guests = true)
);

-- 3) Q&A
CREATE TABLE IF NOT EXISTS public.webinar_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  author_identity TEXT NOT NULL,
  author_name TEXT NOT NULL,
  question TEXT NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 0,
  answered BOOLEAN NOT NULL DEFAULT false,
  answer_text TEXT,
  answered_by UUID,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webinar_questions_webinar ON public.webinar_questions(webinar_id, created_at);
ALTER TABLE public.webinar_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View questions"
ON public.webinar_questions FOR SELECT TO authenticated
USING (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (SELECT 1 FROM webinars w WHERE w.id = webinar_id AND w.organization_id = current_organization_id())
  OR EXISTS (SELECT 1 FROM webinar_participants wp WHERE wp.webinar_id = webinar_questions.webinar_id AND wp.user_id = auth.uid())
);

CREATE POLICY "Auth can ask questions"
ON public.webinar_questions FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Host can update/delete questions"
ON public.webinar_questions FOR UPDATE TO authenticated
USING (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (SELECT 1 FROM webinars w WHERE w.id = webinar_id AND w.organization_id = current_organization_id())
);
CREATE POLICY "Host can delete questions"
ON public.webinar_questions FOR DELETE TO authenticated
USING (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (SELECT 1 FROM webinars w WHERE w.id = webinar_id AND w.organization_id = current_organization_id())
);

CREATE POLICY "Anon can view questions for public webinars"
ON public.webinar_questions FOR SELECT TO anon
USING (EXISTS (SELECT 1 FROM webinars w WHERE w.id = webinar_id AND w.allow_guests = true));

CREATE POLICY "Anon can ask in public webinars"
ON public.webinar_questions FOR INSERT TO anon
WITH CHECK (EXISTS (SELECT 1 FROM webinars w WHERE w.id = webinar_id AND w.allow_guests = true));

-- 4) Опросы (polls)
CREATE TABLE IF NOT EXISTS public.webinar_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.webinar_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.webinar_polls(id) ON DELETE CASCADE,
  voter_identity TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(poll_id, voter_identity)
);

CREATE INDEX IF NOT EXISTS idx_webinar_polls_webinar ON public.webinar_polls(webinar_id);
CREATE INDEX IF NOT EXISTS idx_webinar_poll_votes_poll ON public.webinar_poll_votes(poll_id);

ALTER TABLE public.webinar_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webinar_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View polls"
ON public.webinar_polls FOR SELECT TO authenticated
USING (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (SELECT 1 FROM webinars w WHERE w.id = webinar_id AND w.organization_id = current_organization_id())
  OR EXISTS (SELECT 1 FROM webinar_participants wp WHERE wp.webinar_id = webinar_polls.webinar_id AND wp.user_id = auth.uid())
);
CREATE POLICY "Host manage polls"
ON public.webinar_polls FOR ALL TO authenticated
USING (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (SELECT 1 FROM webinars w WHERE w.id = webinar_id AND w.organization_id = current_organization_id())
)
WITH CHECK (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (SELECT 1 FROM webinars w WHERE w.id = webinar_id AND w.organization_id = current_organization_id())
);
CREATE POLICY "Anon view polls in public webinars"
ON public.webinar_polls FOR SELECT TO anon
USING (EXISTS (SELECT 1 FROM webinars w WHERE w.id = webinar_id AND w.allow_guests = true));

CREATE POLICY "View votes"
ON public.webinar_poll_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can vote"
ON public.webinar_poll_votes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon view votes"
ON public.webinar_poll_votes FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can vote in public polls"
ON public.webinar_poll_votes FOR INSERT TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM webinar_polls p
    JOIN webinars w ON w.id = p.webinar_id
    WHERE p.id = webinar_poll_votes.poll_id AND w.allow_guests = true
  )
);

-- 5) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_polls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_poll_votes;
