
-- Chat groups
CREATE TABLE public.chat_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their groups" ON public.chat_groups
  FOR SELECT USING (
    organization_id = public.current_organization_id()
    OR public.has_role('admin'::app_role, auth.uid())
  );

CREATE POLICY "Org members can create groups" ON public.chat_groups
  FOR INSERT WITH CHECK (
    organization_id = public.current_organization_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "Group creator can update" ON public.chat_groups
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Group creator can delete" ON public.chat_groups
  FOR DELETE USING (created_by = auth.uid());

-- Chat group members
CREATE TABLE public.chat_group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view group members" ON public.chat_group_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.chat_groups g WHERE g.id = group_id AND (g.organization_id = public.current_organization_id() OR public.has_role('admin'::app_role, auth.uid())))
  );

CREATE POLICY "Group creator can manage members" ON public.chat_group_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.chat_groups g WHERE g.id = group_id AND g.created_by = auth.uid())
  );

CREATE POLICY "Group creator can remove members" ON public.chat_group_members
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.chat_groups g WHERE g.id = group_id AND g.created_by = auth.uid())
    OR user_id = auth.uid()
  );

-- Chat group messages
CREATE TABLE public.chat_group_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_group_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can read messages" ON public.chat_group_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.chat_group_members m WHERE m.group_id = chat_group_messages.group_id AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.chat_groups g WHERE g.id = chat_group_messages.group_id AND g.created_by = auth.uid())
  );

CREATE POLICY "Group members can send messages" ON public.chat_group_messages
  FOR INSERT WITH CHECK (
    sender_user_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.chat_group_members m WHERE m.group_id = chat_group_messages.group_id AND m.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.chat_groups g WHERE g.id = chat_group_messages.group_id AND g.created_by = auth.uid())
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_group_messages;
