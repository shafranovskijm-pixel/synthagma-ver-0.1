
ALTER TABLE public.commercial_proposals
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_commercial_proposals_is_template
  ON public.commercial_proposals(is_template)
  WHERE is_template = true;

-- Allow sales managers (and admins) to read platform templates
DROP POLICY IF EXISTS "Sales can read platform proposal templates" ON public.commercial_proposals;
CREATE POLICY "Sales can read platform proposal templates"
  ON public.commercial_proposals
  FOR SELECT
  TO authenticated
  USING (is_template = true AND scope = 'platform');

DROP POLICY IF EXISTS "Sales can read template services" ON public.commercial_proposal_services;
CREATE POLICY "Sales can read template services"
  ON public.commercial_proposal_services
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.commercial_proposals p
    WHERE p.id = commercial_proposal_services.proposal_id
      AND p.is_template = true
      AND p.scope = 'platform'
  ));
