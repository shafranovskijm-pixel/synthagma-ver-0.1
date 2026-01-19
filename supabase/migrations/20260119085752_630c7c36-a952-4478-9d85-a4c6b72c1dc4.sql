-- Create table for storing patch updates
CREATE TABLE public.system_patches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  patch_type VARCHAR(50) NOT NULL DEFAULT 'full',
  patch_data JSONB NOT NULL,
  migrations JSONB,
  applied_at TIMESTAMP WITH TIME ZONE,
  applied_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_applied BOOLEAN NOT NULL DEFAULT false,
  source_project_url TEXT,
  UNIQUE(version)
);

-- Enable RLS
ALTER TABLE public.system_patches ENABLE ROW LEVEL SECURITY;

-- Only admins can view patches
CREATE POLICY "Admins can view patches"
  ON public.system_patches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Only admins can insert patches
CREATE POLICY "Admins can insert patches"
  ON public.system_patches
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Only admins can update patches
CREATE POLICY "Admins can update patches"
  ON public.system_patches
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Only admins can delete patches
CREATE POLICY "Admins can delete patches"
  ON public.system_patches
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );