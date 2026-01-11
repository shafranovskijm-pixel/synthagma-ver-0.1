-- Create library_documents table for organization educational materials
CREATE TABLE public.library_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'document',
  description TEXT,
  file_url TEXT,
  file_size BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.library_documents ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view library documents of their organization"
ON public.library_documents
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Organization users can manage their library documents"
ON public.library_documents
FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all library documents"
ON public.library_documents
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Create storage bucket for library files
INSERT INTO storage.buckets (id, name, public)
VALUES ('library-files', 'library-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for library-files bucket
CREATE POLICY "Library files are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'library-files');

CREATE POLICY "Authenticated users can upload library files"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'library-files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update library files"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'library-files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete library files"
ON storage.objects
FOR DELETE
USING (bucket_id = 'library-files' AND auth.role() = 'authenticated');

-- Create index for faster queries
CREATE INDEX idx_library_documents_organization_id ON public.library_documents(organization_id);
CREATE INDEX idx_library_documents_type ON public.library_documents(type);

-- Add trigger for updating updated_at
CREATE TRIGGER update_library_documents_updated_at
BEFORE UPDATE ON public.library_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();