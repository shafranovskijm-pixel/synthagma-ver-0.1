-- 1. RLS: allow org users to INSERT into org_billing_documents
CREATE POLICY "Org users can insert own billing documents"
ON public.org_billing_documents
FOR INSERT
TO authenticated
WITH CHECK (organization_id = public.current_organization_id());

-- 2. Storage: allow org users to upload to billing-documents bucket (their org folder)
CREATE POLICY "Org users can upload billing documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'billing-documents'
  AND (storage.foldername(name))[1] = public.current_organization_id()::text
);

-- 3. Add buyer fields to subscription_invoices
ALTER TABLE public.subscription_invoices
ADD COLUMN IF NOT EXISTS buyer_name TEXT,
ADD COLUMN IF NOT EXISTS buyer_inn TEXT,
ADD COLUMN IF NOT EXISTS buyer_kpp TEXT;