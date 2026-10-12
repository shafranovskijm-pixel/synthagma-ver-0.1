-- Isolated organization CRM. Legacy platform CRM is deliberately not referenced.
CREATE TABLE public.org_crm_clients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 org_name text NOT NULL CHECK(length(btrim(org_name)) BETWEEN 1 AND 300),
 inn text CHECK(length(inn)<=32),
 email text CHECK(email IS NULL OR (length(email)<=320 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
 phone text CHECK(length(phone)<=100), address text CHECK(length(address)<=1000), notes text CHECK(length(notes)<=10000),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,id)
);
CREATE TABLE public.org_crm_deals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 client_id uuid NOT NULL,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 300),
 stage text NOT NULL DEFAULT 'new' CHECK(stage IN('new','contacted','negotiation','won','lost')),
 amount numeric(16,2) NOT NULL DEFAULT 0 CHECK(amount>=0 AND amount<100000000000000),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,client_id,id),
 FOREIGN KEY(organization_id,client_id) REFERENCES public.org_crm_clients(organization_id,id) ON DELETE RESTRICT
);
CREATE TABLE public.org_crm_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 client_id uuid NOT NULL, deal_id uuid,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 300), description text CHECK(length(description)<=10000),
 type text NOT NULL DEFAULT 'call' CHECK(type IN('call','email','meeting','followup','other')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','done','cancelled')),
 due_date timestamptz NOT NULL CHECK(isfinite(due_date)),
 assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 completed_at timestamptz,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((status='done')=(completed_at IS NOT NULL)),
 FOREIGN KEY(organization_id,client_id) REFERENCES public.org_crm_clients(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,client_id,deal_id) REFERENCES public.org_crm_deals(organization_id,client_id,id) ON DELETE RESTRICT
);
CREATE TABLE public.org_crm_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 client_id uuid NOT NULL, deal_id uuid,
 activity_type text NOT NULL CHECK(activity_type IN('call','email','meeting','note')),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 10000),
 actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,client_id) REFERENCES public.org_crm_clients(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,client_id,deal_id) REFERENCES public.org_crm_deals(organization_id,client_id,id) ON DELETE RESTRICT
);
CREATE INDEX org_crm_clients_order ON public.org_crm_clients(organization_id,updated_at DESC,id);
CREATE INDEX org_crm_deals_order ON public.org_crm_deals(organization_id,updated_at DESC,id);
CREATE INDEX org_crm_tasks_due ON public.org_crm_tasks(organization_id,due_date,id);
CREATE INDEX org_crm_activities_order ON public.org_crm_activities(organization_id,created_at DESC,id);

CREATE FUNCTION public.org_crm_access_allowed(p_organization_id uuid,p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND p_permission IN('sales.read','sales.write')
 AND public.account_deletion_access_allowed()
 AND public.can_access_organization(p_organization_id,p_permission)
 AND EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_organization_id
   AND o.subscription_plan::text IN('standard','professional','maximum'))
$fn$;
REVOKE ALL ON FUNCTION public.org_crm_access_allowed(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.org_crm_access_allowed(uuid,text) TO authenticated,service_role;

DO $security$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['org_crm_clients','org_crm_deals','org_crm_tasks','org_crm_activities'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY org_crm_read ON public.%I FOR SELECT TO authenticated USING(public.org_crm_access_allowed(organization_id,''sales.read''))',t);
  EXECUTE format('CREATE POLICY account_deletion_no_revoked_access ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()))',t);
 END LOOP;
END $security$;

-- Internal helpers are callable by the security-definer entry points only.
CREATE FUNCTION public.org_crm_require_write(p_organization_id uuid,p_values jsonb,p_keys text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT COALESCE(public.org_crm_access_allowed(p_organization_id,'sales.write'),false) THEN
  RAISE EXCEPTION 'crm_forbidden' USING ERRCODE='42501';
 END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object'
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_values) k WHERE NOT(k=ANY(p_keys))) THEN
  RAISE EXCEPTION 'crm_invalid_fields' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_values) e WHERE
  jsonb_typeof(e.value) NOT IN('string','null') AND NOT(e.key='amount' AND jsonb_typeof(e.value)='number')) THEN
  RAISE EXCEPTION 'crm_invalid_field_type' USING ERRCODE='22023';
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.org_crm_require_write(uuid,jsonb,text[]) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.org_crm_task_assignees(p_organization_id uuid)
RETURNS TABLE(user_id uuid,full_name text,role text,email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT s.user_id,COALESCE(NULLIF(s.display_name,''),NULLIF(p.full_name,''),'Сотрудник'),s.role,NULL::text
 FROM public.org_staff s LEFT JOIN public.profiles p ON p.user_id=s.user_id
 WHERE s.organization_id=p_organization_id AND s.can_receive_crm_tasks
 AND(s.expires_at IS NULL OR s.expires_at>now())
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=s.user_id)
 UNION
 SELECT p.user_id,COALESCE(NULLIF(p.full_name,''),'Владелец'),'owner'::text,NULL::text
 FROM public.profiles p WHERE p.organization_id=p_organization_id
 AND public.is_org_owner(p.user_id,p_organization_id)
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=p.user_id)
$fn$;
REVOKE ALL ON FUNCTION public.org_crm_task_assignees(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.org_crm_snapshot(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE counts jsonb;
BEGIN
 IF NOT COALESCE(public.org_crm_access_allowed(p_organization_id,'sales.read'),false) THEN
  RAISE EXCEPTION 'crm_forbidden' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object(
 'clients',(SELECT count(*) FROM public.org_crm_clients WHERE organization_id=p_organization_id),
 'deals',(SELECT count(*) FROM public.org_crm_deals WHERE organization_id=p_organization_id),
 'tasks',(SELECT count(*) FROM public.org_crm_tasks WHERE organization_id=p_organization_id),
 'activities',(SELECT count(*) FROM public.org_crm_activities WHERE organization_id=p_organization_id)) INTO counts;
 RETURN jsonb_build_object(
 'clients',COALESCE((SELECT jsonb_agg(to_jsonb(c)-'created_by' ORDER BY c.updated_at DESC,c.id) FROM(SELECT * FROM public.org_crm_clients WHERE organization_id=p_organization_id ORDER BY updated_at DESC,id LIMIT 1000)c),'[]'::jsonb),
 'deals',COALESCE((SELECT jsonb_agg(to_jsonb(d)-'created_by' ORDER BY d.updated_at DESC,d.id) FROM(SELECT * FROM public.org_crm_deals WHERE organization_id=p_organization_id ORDER BY updated_at DESC,id LIMIT 1000)d),'[]'::jsonb),
 'tasks',COALESCE((SELECT jsonb_agg(to_jsonb(t)-'created_by' ORDER BY t.due_date,t.id) FROM(SELECT * FROM public.org_crm_tasks WHERE organization_id=p_organization_id ORDER BY due_date,id LIMIT 1000)t),'[]'::jsonb),
 'activities',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC,a.id) FROM(SELECT * FROM public.org_crm_activities WHERE organization_id=p_organization_id ORDER BY created_at DESC,id LIMIT 500)a),'[]'::jsonb),
 'assignees',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.full_name,a.user_id) FROM public.org_crm_task_assignees(p_organization_id)a),'[]'::jsonb),
 'counts',counts,'truncated',jsonb_build_object('clients',(counts->>'clients')::bigint>1000,'deals',(counts->>'deals')::bigint>1000,'tasks',(counts->>'tasks')::bigint>1000,'activities',(counts->>'activities')::bigint>500));
END $fn$;

CREATE FUNCTION public.org_crm_save_client(p_organization_id uuid,p_id uuid,p_values jsonb,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.org_crm_clients%ROWTYPE; v jsonb;
BEGIN
 PERFORM public.org_crm_require_write(p_organization_id,p_values,ARRAY['org_name','inn','email','phone','address','notes']);
 IF p_id IS NOT NULL THEN
  SELECT * INTO r FROM public.org_crm_clients WHERE id=p_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'crm_not_found' USING ERRCODE='P0002'; END IF;
  IF p_expected_updated_at IS NULL OR r.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'crm_conflict' USING ERRCODE='40001'; END IF;
  v:=to_jsonb(r)||p_values;
 ELSE
  IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'crm_invalid_version' USING ERRCODE='22023'; END IF;
  v:=p_values;
 END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.org_crm_clients(organization_id,org_name,inn,email,phone,address,notes,created_by)
  VALUES(p_organization_id,btrim(v->>'org_name'),NULLIF(btrim(v->>'inn'),''),NULLIF(btrim(v->>'email'),''),NULLIF(btrim(v->>'phone'),''),NULLIF(btrim(v->>'address'),''),NULLIF(btrim(v->>'notes'),''),auth.uid()) RETURNING * INTO r;
 ELSE
  UPDATE public.org_crm_clients SET org_name=btrim(v->>'org_name'),inn=NULLIF(btrim(v->>'inn'),''),email=NULLIF(btrim(v->>'email'),''),phone=NULLIF(btrim(v->>'phone'),''),address=NULLIF(btrim(v->>'address'),''),notes=NULLIF(btrim(v->>'notes'),''),updated_at=GREATEST(clock_timestamp(),r.updated_at+interval '1 microsecond')
  WHERE id=p_id AND organization_id=p_organization_id RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('id',r.id,'updated_at',r.updated_at);
END $fn$;

CREATE FUNCTION public.org_crm_save_deal(p_organization_id uuid,p_id uuid,p_values jsonb,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.org_crm_deals%ROWTYPE; v jsonb; client uuid;
BEGIN
 PERFORM public.org_crm_require_write(p_organization_id,p_values,ARRAY['client_id','title','stage','amount']);
 IF p_id IS NOT NULL THEN
  SELECT * INTO r FROM public.org_crm_deals WHERE id=p_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'crm_not_found' USING ERRCODE='P0002'; END IF;
  IF p_expected_updated_at IS NULL OR r.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'crm_conflict' USING ERRCODE='40001'; END IF;
  v:=to_jsonb(r)||p_values;
 ELSE
  IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'crm_invalid_version' USING ERRCODE='22023'; END IF;
  v:=jsonb_build_object('stage','new','amount',0)||p_values;
 END IF;
 client:=(v->>'client_id')::uuid;
 PERFORM 1 FROM public.org_crm_clients WHERE organization_id=p_organization_id AND id=client FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'crm_client_not_found' USING ERRCODE='P0002'; END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.org_crm_deals(organization_id,client_id,title,stage,amount,created_by)
  VALUES(p_organization_id,client,btrim(v->>'title'),v->>'stage',(v->>'amount')::numeric,auth.uid()) RETURNING * INTO r;
 ELSE
  UPDATE public.org_crm_deals SET client_id=client,title=btrim(v->>'title'),stage=v->>'stage',amount=(v->>'amount')::numeric,updated_at=GREATEST(clock_timestamp(),r.updated_at+interval '1 microsecond')
  WHERE id=p_id AND organization_id=p_organization_id RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('id',r.id,'updated_at',r.updated_at);
END $fn$;

CREATE FUNCTION public.org_crm_save_task(p_organization_id uuid,p_id uuid,p_values jsonb,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.org_crm_tasks%ROWTYPE; v jsonb; client uuid; deal uuid; assignee uuid; completion timestamptz;
BEGIN
 PERFORM public.org_crm_require_write(p_organization_id,p_values,ARRAY['client_id','deal_id','title','description','type','status','due_date','assigned_user_id']);
 IF p_id IS NOT NULL THEN
  SELECT * INTO r FROM public.org_crm_tasks WHERE id=p_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'crm_not_found' USING ERRCODE='P0002'; END IF;
  IF p_expected_updated_at IS NULL OR r.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'crm_conflict' USING ERRCODE='40001'; END IF;
  v:=to_jsonb(r)||p_values;
 ELSE
  IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'crm_invalid_version' USING ERRCODE='22023'; END IF;
  v:=jsonb_build_object('status','pending','type','call')||p_values;
 END IF;
 client:=(v->>'client_id')::uuid; deal:=NULLIF(v->>'deal_id','')::uuid; assignee:=NULLIF(v->>'assigned_user_id','')::uuid;
 PERFORM 1 FROM public.org_crm_clients WHERE organization_id=p_organization_id AND id=client FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'crm_client_not_found' USING ERRCODE='P0002'; END IF;
 IF deal IS NOT NULL THEN
  PERFORM 1 FROM public.org_crm_deals WHERE organization_id=p_organization_id AND client_id=client AND id=deal FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'crm_deal_not_found' USING ERRCODE='P0002'; END IF;
 END IF;
 -- Existing tasks remain completable when an assignee expires; new assignments must be eligible now.
 IF assignee IS NOT NULL AND (p_id IS NULL OR assignee IS DISTINCT FROM r.assigned_user_id) THEN
  IF NOT EXISTS(SELECT 1 FROM public.org_crm_task_assignees(p_organization_id) a WHERE a.user_id=assignee) THEN
   RAISE EXCEPTION 'crm_assignee_unavailable' USING ERRCODE='22023';
  END IF;
 END IF;
 completion:=CASE WHEN v->>'status'='done' THEN COALESCE(r.completed_at,clock_timestamp()) ELSE NULL END;
 IF p_id IS NULL THEN
  INSERT INTO public.org_crm_tasks(organization_id,client_id,deal_id,title,description,type,status,due_date,assigned_user_id,completed_at,created_by)
  VALUES(p_organization_id,client,deal,btrim(v->>'title'),NULLIF(btrim(v->>'description'),''),v->>'type',v->>'status',(v->>'due_date')::timestamptz,assignee,completion,auth.uid()) RETURNING * INTO r;
 ELSE
  UPDATE public.org_crm_tasks SET client_id=client,deal_id=deal,title=btrim(v->>'title'),description=NULLIF(btrim(v->>'description'),''),type=v->>'type',status=v->>'status',due_date=(v->>'due_date')::timestamptz,assigned_user_id=assignee,completed_at=completion,updated_at=GREATEST(clock_timestamp(),r.updated_at+interval '1 microsecond')
  WHERE id=p_id AND organization_id=p_organization_id RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('id',r.id,'updated_at',r.updated_at);
END $fn$;

CREATE FUNCTION public.org_crm_add_activity(p_organization_id uuid,p_client_id uuid,p_deal_id uuid,p_activity_type text,p_description text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.org_crm_activities%ROWTYPE;
BEGIN
 PERFORM public.org_crm_require_write(p_organization_id,'{}'::jsonb,ARRAY[]::text[]);
 PERFORM 1 FROM public.org_crm_clients WHERE organization_id=p_organization_id AND id=p_client_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'crm_client_not_found' USING ERRCODE='P0002'; END IF;
 IF p_deal_id IS NOT NULL THEN
  PERFORM 1 FROM public.org_crm_deals WHERE organization_id=p_organization_id AND client_id=p_client_id AND id=p_deal_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'crm_deal_not_found' USING ERRCODE='P0002'; END IF;
 END IF;
 INSERT INTO public.org_crm_activities(organization_id,client_id,deal_id,activity_type,description,actor_user_id)
 VALUES(p_organization_id,p_client_id,p_deal_id,p_activity_type,btrim(p_description),auth.uid()) RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'created_at',r.created_at);
END $fn$;

REVOKE ALL ON FUNCTION public.org_crm_snapshot(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.org_crm_save_client(uuid,uuid,jsonb,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.org_crm_save_deal(uuid,uuid,jsonb,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.org_crm_save_task(uuid,uuid,jsonb,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.org_crm_add_activity(uuid,uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.org_crm_snapshot(uuid),public.org_crm_save_client(uuid,uuid,jsonb,timestamptz),public.org_crm_save_deal(uuid,uuid,jsonb,timestamptz),public.org_crm_save_task(uuid,uuid,jsonb,timestamptz),public.org_crm_add_activity(uuid,uuid,uuid,text,text) TO authenticated,service_role;
