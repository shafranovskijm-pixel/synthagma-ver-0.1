-- Create labor_safety_groups table (Группы охраны труда)
CREATE TABLE public.labor_safety_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create labor_safety_records table (Записи охраны труда)
CREATE TABLE public.labor_safety_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.labor_safety_groups(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  snils TEXT,
  position TEXT,
  inn TEXT,
  organization_name TEXT,
  protocol_number TEXT,
  program_name TEXT,
  exam_date DATE,
  is_passed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.labor_safety_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_safety_records ENABLE ROW LEVEL SECURITY;

-- RLS policies for labor_safety_groups
CREATE POLICY "Users can view labor safety groups of their organization"
ON public.labor_safety_groups
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create labor safety groups in their organization"
ON public.labor_safety_groups
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update labor safety groups in their organization"
ON public.labor_safety_groups
FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete labor safety groups in their organization"
ON public.labor_safety_groups
FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- RLS policies for labor_safety_records
CREATE POLICY "Users can view labor safety records"
ON public.labor_safety_records
FOR SELECT
USING (
  group_id IN (
    SELECT id FROM public.labor_safety_groups WHERE organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create labor safety records"
ON public.labor_safety_records
FOR INSERT
WITH CHECK (
  group_id IN (
    SELECT id FROM public.labor_safety_groups WHERE organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update labor safety records"
ON public.labor_safety_records
FOR UPDATE
USING (
  group_id IN (
    SELECT id FROM public.labor_safety_groups WHERE organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete labor safety records"
ON public.labor_safety_records
FOR DELETE
USING (
  group_id IN (
    SELECT id FROM public.labor_safety_groups WHERE organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);

-- Create triggers for updated_at
CREATE TRIGGER update_labor_safety_groups_updated_at
BEFORE UPDATE ON public.labor_safety_groups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_labor_safety_records_updated_at
BEFORE UPDATE ON public.labor_safety_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes
CREATE INDEX idx_labor_safety_groups_org ON public.labor_safety_groups(organization_id);
CREATE INDEX idx_labor_safety_records_group ON public.labor_safety_records(group_id);