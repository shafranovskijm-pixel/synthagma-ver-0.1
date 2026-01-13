-- Create course requests table for "looking for course" announcements
CREATE TABLE public.course_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  budget_min INTEGER,
  budget_max INTEGER,
  students_count INTEGER DEFAULT 1,
  contact_email TEXT,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.course_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can view active requests
CREATE POLICY "Anyone can view active course requests"
ON public.course_requests
FOR SELECT
USING (status = 'active');

-- Users can view their own requests regardless of status
CREATE POLICY "Users can view own course requests"
ON public.course_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own requests
CREATE POLICY "Users can create course requests"
ON public.course_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own requests
CREATE POLICY "Users can update own course requests"
ON public.course_requests
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own requests
CREATE POLICY "Users can delete own course requests"
ON public.course_requests
FOR DELETE
USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_course_requests_updated_at
BEFORE UPDATE ON public.course_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample data
INSERT INTO public.course_requests (user_id, title, description, budget_min, budget_max, students_count, status)
VALUES 
  ('00000000-0000-0000-0000-000000000000', 'Ищу курс по охране труда', 'Нужен курс по охране труда для строительной организации. Желательно с выдачей удостоверения установленного образца. Рассмотрим предложения от аккредитованных учебных центров.', 3000, 8000, 15, 'active'),
  ('00000000-0000-0000-0000-000000000000', 'Программа повышения квалификации для бухгалтеров', 'Ищем программу повышения квалификации для главных бухгалтеров. Тема: изменения в налоговом законодательстве 2025. Объём не менее 72 часов.', 5000, 15000, 3, 'active'),
  ('00000000-0000-0000-0000-000000000000', 'Курс по пожарной безопасности', 'Требуется обучение по пожарно-техническому минимуму для руководителей и специалистов. Нужен официальный документ.', 2500, 6000, 8, 'active');