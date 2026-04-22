CREATE TABLE IF NOT EXISTS public.email_drip_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  recipient_source text NOT NULL DEFAULT 'manual',
  trigger_type text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_drip_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.email_drip_sequences(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  delay_days int NOT NULL DEFAULT 0,
  delay_hours int NOT NULL DEFAULT 0,
  subject text NOT NULL,
  html text NOT NULL,
  template_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_drip_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.email_drip_sequences(id) ON DELETE CASCADE,
  email text NOT NULL,
  recipient_name text,
  organization_id uuid,
  status text NOT NULL DEFAULT 'active',
  current_step int NOT NULL DEFAULT 0,
  next_send_at timestamptz NOT NULL DEFAULT now(),
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  completed_at timestamptz,
  UNIQUE (sequence_id, email)
);

CREATE TABLE IF NOT EXISTS public.email_drip_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES public.email_drip_subscribers(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.email_drip_steps(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent',
  error text
);

CREATE INDEX IF NOT EXISTS idx_drip_subs_pending ON public.email_drip_subscribers(next_send_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_drip_steps_seq ON public.email_drip_steps(sequence_id, step_order);

ALTER TABLE public.email_drip_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_drip_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_drip_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_drip_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage drip sequences" ON public.email_drip_sequences
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()))
  WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins manage drip steps" ON public.email_drip_steps
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()))
  WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins manage drip subscribers" ON public.email_drip_subscribers
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()))
  WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins view drip sends" ON public.email_drip_sends
  FOR SELECT TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()));