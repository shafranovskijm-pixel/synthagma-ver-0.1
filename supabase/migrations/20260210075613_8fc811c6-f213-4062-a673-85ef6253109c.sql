
-- Update RLS policy to allow organization role users to also manage landing content
DROP POLICY IF EXISTS "Admins can update landing content" ON public.landing_content;

CREATE POLICY "Admins and org users can manage landing content"
  ON public.landing_content
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'organization')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'organization')
    )
  );
