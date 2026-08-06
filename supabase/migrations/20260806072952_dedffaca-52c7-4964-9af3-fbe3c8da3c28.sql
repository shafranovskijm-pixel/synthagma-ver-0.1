REVOKE ALL ON FUNCTION public.storage_try_uuid(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_signed_contract_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_try_uuid(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_signed_contract_object(text) TO authenticated, service_role;