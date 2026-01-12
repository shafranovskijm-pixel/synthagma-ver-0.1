-- Таблица для хранения согласий на обработку персональных данных
CREATE TABLE public.student_consents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  enrollment_id UUID REFERENCES public.enrollments(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('individual', 'organization')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'rejected', 'expired')),
  full_name TEXT,
  passport_data TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  signed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Таблица для хранения видеоидентификации
CREATE TABLE public.video_identifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  enrollment_id UUID REFERENCES public.enrollments(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'expired')),
  photo_url TEXT,
  video_url TEXT,
  verified_by UUID,
  verified_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  device_info JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.student_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_identifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for student_consents
CREATE POLICY "Students can view their own consents"
ON public.student_consents FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Students can create their own consents"
ON public.student_consents FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can update their own pending consents"
ON public.student_consents FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Organizations can view consents of their students"
ON public.student_consents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.organization_id = student_consents.organization_id
  )
);

CREATE POLICY "Organizations can update consent status"
ON public.student_consents FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.organization_id = student_consents.organization_id
  )
);

-- RLS policies for video_identifications
CREATE POLICY "Students can view their own identifications"
ON public.video_identifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Students can create their own identifications"
ON public.video_identifications FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can update their own pending identifications"
ON public.video_identifications FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Organizations can view identifications of their students"
ON public.video_identifications FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.organization_id = video_identifications.organization_id
  )
);

CREATE POLICY "Organizations can update identification status"
ON public.video_identifications FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.organization_id = video_identifications.organization_id
  )
);

-- Triggers for updated_at
CREATE TRIGGER update_student_consents_updated_at
BEFORE UPDATE ON public.student_consents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_video_identifications_updated_at
BEFORE UPDATE ON public.video_identifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();