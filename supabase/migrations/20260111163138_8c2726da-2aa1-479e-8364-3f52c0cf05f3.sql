-- Create library_folders table for organizing documents
CREATE TABLE public.library_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.library_folders(id) ON DELETE CASCADE,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on library_folders
ALTER TABLE public.library_folders ENABLE ROW LEVEL SECURITY;

-- RLS policies for library_folders
CREATE POLICY "Users can view library folders of their organization"
ON public.library_folders FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Organization users can create library folders"
ON public.library_folders FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Organization users can update their library folders"
ON public.library_folders FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Organization users can delete their library folders"
ON public.library_folders FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Add folder_id column to library_documents
ALTER TABLE public.library_documents
ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.library_folders(id) ON DELETE SET NULL;

-- Create index for faster folder queries
CREATE INDEX IF NOT EXISTS idx_library_documents_folder ON public.library_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_library_folders_org ON public.library_folders(organization_id);
CREATE INDEX IF NOT EXISTS idx_library_folders_parent ON public.library_folders(parent_id);