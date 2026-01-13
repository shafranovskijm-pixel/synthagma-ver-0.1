-- Create table for journal instances (created journals for specific courses)
CREATE TABLE public.journal_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  journal_type TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for journal entries (attendance, grades, etc.)
CREATE TABLE public.journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_id UUID NOT NULL REFERENCES public.journal_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type TEXT NOT NULL DEFAULT 'attendance',
  value TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.journal_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for journal_instances
CREATE POLICY "Organization members can view their journal instances"
ON public.journal_instances
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Organization members can create journal instances"
ON public.journal_instances
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Organization members can update journal instances"
ON public.journal_instances
FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Organization members can delete journal instances"
ON public.journal_instances
FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- RLS policies for journal_entries
CREATE POLICY "Organization members can view their journal entries"
ON public.journal_entries
FOR SELECT
USING (
  journal_id IN (
    SELECT ji.id FROM public.journal_instances ji
    WHERE ji.organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Organization members can create journal entries"
ON public.journal_entries
FOR INSERT
WITH CHECK (
  journal_id IN (
    SELECT ji.id FROM public.journal_instances ji
    WHERE ji.organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Organization members can update journal entries"
ON public.journal_entries
FOR UPDATE
USING (
  journal_id IN (
    SELECT ji.id FROM public.journal_instances ji
    WHERE ji.organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Organization members can delete journal entries"
ON public.journal_entries
FOR DELETE
USING (
  journal_id IN (
    SELECT ji.id FROM public.journal_instances ji
    WHERE ji.organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);

-- Create indexes
CREATE INDEX idx_journal_instances_organization ON public.journal_instances(organization_id);
CREATE INDEX idx_journal_instances_course ON public.journal_instances(course_id);
CREATE INDEX idx_journal_entries_journal ON public.journal_entries(journal_id);
CREATE INDEX idx_journal_entries_user ON public.journal_entries(user_id);
CREATE INDEX idx_journal_entries_date ON public.journal_entries(entry_date);

-- Trigger for updated_at
CREATE TRIGGER update_journal_instances_updated_at
BEFORE UPDATE ON public.journal_instances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_journal_entries_updated_at
BEFORE UPDATE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();