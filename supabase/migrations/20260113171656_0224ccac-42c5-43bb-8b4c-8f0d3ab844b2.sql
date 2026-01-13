-- Create program_categories table for categorizing programs
CREATE TABLE public.program_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create program_folders table for folder structure
CREATE TABLE public.program_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.program_folders(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.program_categories(id) ON DELETE SET NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create program_documents table for files
CREATE TABLE public.program_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.program_folders(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.program_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  file_size BIGINT,
  file_type TEXT DEFAULT 'document',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.program_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for program_categories
CREATE POLICY "Users can view program categories for their org"
ON public.program_categories FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Users can create program categories for their org"
ON public.program_categories FOR INSERT
WITH CHECK (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update program categories for their org"
ON public.program_categories FOR UPDATE
USING (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete program categories for their org"
ON public.program_categories FOR DELETE
USING (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

-- RLS Policies for program_folders
CREATE POLICY "Users can view program folders for their org"
ON public.program_folders FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Users can create program folders for their org"
ON public.program_folders FOR INSERT
WITH CHECK (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update program folders for their org"
ON public.program_folders FOR UPDATE
USING (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete program folders for their org"
ON public.program_folders FOR DELETE
USING (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

-- RLS Policies for program_documents
CREATE POLICY "Users can view program documents for their org"
ON public.program_documents FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Users can create program documents for their org"
ON public.program_documents FOR INSERT
WITH CHECK (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update program documents for their org"
ON public.program_documents FOR UPDATE
USING (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete program documents for their org"
ON public.program_documents FOR DELETE
USING (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

-- Create trigger for updated_at
CREATE TRIGGER update_program_documents_updated_at
BEFORE UPDATE ON public.program_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for program files if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('program-files', 'program-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for program files
CREATE POLICY "Public can view program files"
ON storage.objects FOR SELECT
USING (bucket_id = 'program-files');

CREATE POLICY "Authenticated users can upload program files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'program-files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update program files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'program-files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete program files"
ON storage.objects FOR DELETE
USING (bucket_id = 'program-files' AND auth.role() = 'authenticated');