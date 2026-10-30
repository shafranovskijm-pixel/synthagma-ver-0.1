-- ISOLATED SYNTHETIC LAB ONLY; extend the frozen PR201 model, never production.
CREATE TABLE public.org_staff(user_id uuid,organization_id uuid,expires_at timestamptz);
CREATE FUNCTION public.is_org_owner(p_user uuid,p_org uuid)RETURNS boolean LANGUAGE sql STABLE AS $f$
 SELECT EXISTS(SELECT 1 FROM public.lab_staff WHERE user_id=p_user AND organization_id=p_org)$f$;
CREATE FUNCTION public.has_org_staff_permission(p_user uuid,p_org uuid,p_permission text)RETURNS boolean LANGUAGE sql STABLE AS $f$
 SELECT EXISTS(SELECT 1 FROM public.lab_staff WHERE user_id=p_user AND organization_id=p_org)$f$;
GRANT SELECT ON public.org_staff TO authenticated;
