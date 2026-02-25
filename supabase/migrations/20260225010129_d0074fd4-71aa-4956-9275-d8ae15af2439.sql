
-- Allow anonymous users to view sent commercial proposals (for public proposal page)
CREATE POLICY "Public can view sent proposals"
ON public.commercial_proposals
FOR SELECT
TO anon
USING (status = 'sent');

-- Allow anonymous users to view services of sent proposals
CREATE POLICY "Public can view sent proposal services"
ON public.commercial_proposal_services
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.commercial_proposals cp
    WHERE cp.id = proposal_id AND cp.status = 'sent'
  )
);
