-- Create table for storing student data required for FIS FRDO export
CREATE TABLE public.student_frdo_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  
  -- Personal data
  last_name TEXT, -- Фамилия получателя
  first_name TEXT, -- Имя получателя
  middle_name TEXT, -- Отчество получателя
  birth_date DATE, -- Дата рождения получателя
  gender TEXT, -- Пол получателя (Муж/Жен)
  snils TEXT, -- СНИЛС
  citizenship_code TEXT DEFAULT '643', -- Гражданство (код страны по ОКСМ), по умолчанию Россия
  
  -- Education document data (ВО/СПО)
  education_level TEXT, -- Уровень образования ВО/СПО
  education_doc_last_name TEXT, -- Фамилия указанная в дипломе о ВО или СПО
  education_doc_series TEXT, -- Серия документа о ВО/СПО
  education_doc_number TEXT, -- Номер документа о ВО/СПО
  
  -- Training info
  training_form TEXT DEFAULT 'Очная', -- Форма обучения
  financing_source TEXT DEFAULT 'Платное обучение', -- Источник финансирования обучения
  education_form TEXT DEFAULT 'в образовательной организации', -- Форма получения образования
  
  -- Professional activity (for DPO)
  professional_area TEXT, -- Наименование области профессиональной деятельности
  specialty_group TEXT, -- Укрупненные группы специальностей
  qualification_name TEXT, -- Наименование квалификации, профессии, специальности
  
  -- For professional training (ПО)
  profession_name TEXT, -- Наименование профессий рабочих, должностей служащих
  qualification_rank TEXT, -- Присвоенный квалификационный разряд, класс, категория
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint to prevent duplicates
  CONSTRAINT unique_user_org_frdo UNIQUE (user_id, organization_id)
);

-- Enable RLS
ALTER TABLE public.student_frdo_data ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Org users can manage their students FRDO data"
ON public.student_frdo_data
FOR ALL
USING (
  (organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())
)
WITH CHECK (
  (organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())
);

CREATE POLICY "Students can view their own FRDO data"
ON public.student_frdo_data
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Students can update their own FRDO data"
ON public.student_frdo_data
FOR UPDATE
USING (user_id = auth.uid());

-- Create index for faster lookups
CREATE INDEX idx_student_frdo_user_org ON public.student_frdo_data (user_id, organization_id);

-- Trigger for updated_at
CREATE TRIGGER update_student_frdo_data_updated_at
BEFORE UPDATE ON public.student_frdo_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();