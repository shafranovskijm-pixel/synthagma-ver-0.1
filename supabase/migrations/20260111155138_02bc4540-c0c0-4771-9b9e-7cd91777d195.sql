-- Add organization comments table
CREATE TABLE public.organization_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.organization_comments ENABLE ROW LEVEL SECURITY;

-- RLS policies for organization_comments
CREATE POLICY "Admins can manage organization comments"
ON public.organization_comments
FOR ALL
USING (has_role('admin'::app_role, auth.uid()));

-- Add organization reminders table
CREATE TABLE public.organization_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  reminder_date DATE NOT NULL,
  send_email BOOLEAN NOT NULL DEFAULT true,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.organization_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies for organization_reminders
CREATE POLICY "Admins can manage organization reminders"
ON public.organization_reminders
FOR ALL
USING (has_role('admin'::app_role, auth.uid()));

-- Add triggers for updated_at
CREATE TRIGGER update_organization_comments_updated_at
BEFORE UPDATE ON public.organization_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organization_reminders_updated_at
BEFORE UPDATE ON public.organization_reminders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();