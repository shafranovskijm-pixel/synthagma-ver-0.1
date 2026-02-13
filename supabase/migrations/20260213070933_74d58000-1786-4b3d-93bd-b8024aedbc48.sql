
-- Create student groups table
CREATE TABLE public.student_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add group_id to profiles
ALTER TABLE public.profiles ADD COLUMN student_group_id UUID REFERENCES public.student_groups(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;

-- Org users can manage their own groups
CREATE POLICY "Org users can manage student groups"
  ON public.student_groups FOR ALL
  USING (organization_id = current_organization_id() OR has_role('admin', auth.uid()));

-- Admin full access
CREATE POLICY "Admin full access to student groups"
  ON public.student_groups FOR ALL
  USING (has_role('admin', auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_student_groups_updated_at
  BEFORE UPDATE ON public.student_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
