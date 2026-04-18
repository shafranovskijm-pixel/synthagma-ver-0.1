
-- 1. Таблица соглашений о ПЭП
CREATE TABLE public.pep_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID,
  email TEXT,
  full_name TEXT,
  agreement_text TEXT NOT NULL,
  agreement_version TEXT NOT NULL DEFAULT 'v1.0',
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pep_user_or_email CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX idx_pep_agreements_org ON public.pep_agreements(organization_id);
CREATE INDEX idx_pep_agreements_user ON public.pep_agreements(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_pep_agreements_email ON public.pep_agreements(email) WHERE email IS NOT NULL;

ALTER TABLE public.pep_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all pep_agreements"
  ON public.pep_agreements FOR SELECT
  USING (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org sees its pep_agreements"
  ON public.pep_agreements FOR SELECT
  USING (organization_id = current_organization_id());

CREATE POLICY "User sees own pep_agreements"
  ON public.pep_agreements FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Anyone authenticated can insert own pep_agreement"
  ON public.pep_agreements FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);


-- 2. Таблица процесса подписания
CREATE TABLE public.document_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL CHECK (document_type IN ('contract','consent','pep_agreement','act','order','custom_pdf')),
  document_id UUID,
  document_title TEXT NOT NULL,
  document_html TEXT,
  document_hash TEXT,
  document_snapshot_url TEXT,

  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL,
  sender_name TEXT,

  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('student','company','individual')),
  recipient_user_id UUID,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','viewed','signed','rejected','expired')),
  signature_token TEXT UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),

  pep_agreement_id UUID REFERENCES public.pep_agreements(id) ON DELETE SET NULL,

  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signed_ip TEXT,
  signed_user_agent TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_sig_org ON public.document_signatures(organization_id);
CREATE INDEX idx_doc_sig_recipient_user ON public.document_signatures(recipient_user_id) WHERE recipient_user_id IS NOT NULL;
CREATE INDEX idx_doc_sig_recipient_email ON public.document_signatures(recipient_email);
CREATE INDEX idx_doc_sig_token ON public.document_signatures(signature_token);
CREATE INDEX idx_doc_sig_status ON public.document_signatures(status);

ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all document_signatures"
  ON public.document_signatures FOR ALL
  USING (has_role('admin'::app_role, auth.uid()))
  WITH CHECK (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org manages its document_signatures"
  ON public.document_signatures FOR ALL
  USING (organization_id = current_organization_id())
  WITH CHECK (organization_id = current_organization_id());

CREATE POLICY "Recipient can view own document_signatures"
  ON public.document_signatures FOR SELECT
  USING (recipient_user_id = auth.uid());

CREATE POLICY "Recipient can update status own"
  ON public.document_signatures FOR UPDATE
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

CREATE TRIGGER update_doc_sig_updated_at
  BEFORE UPDATE ON public.document_signatures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 3. Storage bucket для финальных подписанных PDF
INSERT INTO storage.buckets (id, name, public)
VALUES ('signed-documents', 'signed-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can manage signed-documents"
  ON storage.objects FOR ALL
  USING (bucket_id = 'signed-documents' AND has_role('admin'::app_role, auth.uid()))
  WITH CHECK (bucket_id = 'signed-documents' AND has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org can manage own signed-documents"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'signed-documents'
    AND (storage.foldername(name))[1] = current_organization_id()::text
  )
  WITH CHECK (
    bucket_id = 'signed-documents'
    AND (storage.foldername(name))[1] = current_organization_id()::text
  );

CREATE POLICY "Authenticated users can read signed-documents in their org"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'signed-documents'
    AND auth.uid() IS NOT NULL
  );


-- 4. Публичная RPC для получения документа по токену (без авторизации)
CREATE OR REPLACE FUNCTION public.get_signature_by_token(p_token TEXT)
RETURNS TABLE(
  id UUID,
  document_type TEXT,
  document_title TEXT,
  document_html TEXT,
  document_hash TEXT,
  organization_id UUID,
  organization_name TEXT,
  organization_inn TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  recipient_user_id UUID,
  status TEXT,
  expires_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ds.id, ds.document_type, ds.document_title, ds.document_html, ds.document_hash,
    ds.organization_id, o.name, o.inn,
    ds.recipient_email, ds.recipient_name, ds.recipient_user_id,
    ds.status, ds.expires_at, ds.signed_at
  FROM public.document_signatures ds
  JOIN public.organizations o ON o.id = ds.organization_id
  WHERE ds.signature_token = p_token
  LIMIT 1;
END;
$$;
