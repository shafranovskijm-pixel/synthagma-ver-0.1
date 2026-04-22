DROP POLICY IF EXISTS "Org members manage share links" ON public.org_document_share_links;
DROP POLICY IF EXISTS "Public read active share links by token" ON public.org_document_share_links;

CREATE POLICY "Org members select share links"
ON public.org_document_share_links FOR SELECT
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org members insert share links"
ON public.org_document_share_links FOR INSERT
WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org members update share links"
ON public.org_document_share_links FOR UPDATE
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org members delete share links"
ON public.org_document_share_links FOR DELETE
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));