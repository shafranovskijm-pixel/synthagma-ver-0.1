DROP FUNCTION IF EXISTS public.get_signature_by_token(text);

CREATE OR REPLACE FUNCTION public.get_signature_by_token(p_token text)
 RETURNS TABLE(
   id uuid,
   document_type text,
   document_title text,
   document_html text,
   document_hash text,
   organization_id uuid,
   organization_name text,
   organization_inn text,
   recipient_email text,
   recipient_name text,
   recipient_user_id uuid,
   status text,
   mode text,
   current_revision_id uuid,
   expires_at timestamp with time zone,
   signed_at timestamp with time zone,
   signed_ip text,
   sender_signed_at timestamp with time zone,
   sender_signed_ip text,
   sender_name text,
   signature_method text,
   handwritten_scan_path text,
   signed_document_path text,
   pep_agreement_id uuid
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    ds.id, ds.document_type, ds.document_title, ds.document_html, ds.document_hash,
    ds.organization_id, o.name, o.inn,
    ds.recipient_email, ds.recipient_name, ds.recipient_user_id,
    ds.status, ds.mode, ds.current_revision_id, ds.expires_at, ds.signed_at,
    ds.signed_ip, ds.sender_signed_at, ds.sender_signed_ip, ds.sender_name,
    ds.signature_method, ds.handwritten_scan_path, ds.signed_document_path,
    ds.pep_agreement_id
  FROM public.document_signatures ds
  JOIN public.organizations o ON o.id = ds.organization_id
  WHERE ds.signature_token = p_token
  LIMIT 1;
END;
$function$;