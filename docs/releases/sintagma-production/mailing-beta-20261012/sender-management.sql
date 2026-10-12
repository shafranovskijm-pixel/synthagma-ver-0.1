-- Applies to RPC and legacy direct-column writes alike. No existing row changes.
CREATE OR REPLACE FUNCTION public.guard_mailing_sender_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $guard$
DECLARE smtp_changed boolean; imap_changed boolean;
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.smtp_status:='untested'; NEW.imap_status:='untested';
  NEW.last_tested_at:=NULL; NEW.imap_last_tested_at:=NULL;
  NEW.smtp_error_category:=NULL; NEW.imap_error_category:=NULL;
  NEW.smtp_latency_ms:=NULL; NEW.imap_latency_ms:=NULL;
  NEW.is_active:=false; NEW.warmup_enabled:=false;
  RETURN NEW;
 END IF;
 smtp_changed:=ROW(NEW.from_email,NEW.smtp_host,NEW.smtp_port,NEW.smtp_security,NEW.smtp_username,NEW.password_encrypted)
  IS DISTINCT FROM ROW(OLD.from_email,OLD.smtp_host,OLD.smtp_port,OLD.smtp_security,OLD.smtp_username,OLD.password_encrypted);
 imap_changed:=ROW(NEW.imap_host,NEW.imap_port,NEW.imap_security,coalesce(nullif(NEW.imap_username,''),NEW.smtp_username),NEW.password_encrypted)
  IS DISTINCT FROM ROW(OLD.imap_host,OLD.imap_port,OLD.imap_security,coalesce(nullif(OLD.imap_username,''),OLD.smtp_username),OLD.password_encrypted);
 IF smtp_changed THEN
  NEW.smtp_status:='untested'; NEW.last_tested_at:=NULL; NEW.smtp_error_category:=NULL; NEW.smtp_latency_ms:=NULL;
 END IF;
 IF imap_changed THEN
  NEW.imap_status:='untested'; NEW.imap_last_tested_at:=NULL; NEW.imap_error_category:=NULL; NEW.imap_latency_ms:=NULL;
 END IF;
 IF smtp_changed OR imap_changed THEN
  NEW.is_active:=false; NEW.warmup_enabled:=false; NEW.warmup_paused_reason:='credentials_changed'; NEW.last_error:=NULL;
 END IF;
 IF NEW.is_active AND (NEW.smtp_status<>'ok' OR NEW.imap_status<>'ok' OR nullif(NEW.password_encrypted,'') IS NULL) THEN
  RAISE EXCEPTION 'sender_requires_smtp_and_imap_verification' USING ERRCODE='22023';
 END IF;
 IF NOT NEW.is_active THEN
  NEW.warmup_enabled:=false;
  IF NOT smtp_changed AND NOT imap_changed AND OLD.is_active THEN NEW.warmup_paused_reason:='operator_disabled'; END IF;
 END IF;
 IF NEW.warmup_enabled AND (NOT NEW.is_active OR NEW.smtp_status<>'ok' OR NEW.imap_status<>'ok') THEN
  RAISE EXCEPTION 'warmup_requires_verified_active_sender' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION public.guard_mailing_sender_verification() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mailing_sender_verification_guard
BEFORE INSERT OR UPDATE OF from_email,smtp_host,smtp_port,smtp_security,smtp_username,password_encrypted,
 imap_host,imap_port,imap_security,imap_username,is_active,warmup_enabled
ON public.mailing_senders FOR EACH ROW EXECUTE FUNCTION public.guard_mailing_sender_verification();

CREATE OR REPLACE FUNCTION public.save_mailing_sender(
 p_sender_id uuid,p_organization_id uuid,p_settings jsonb,p_password text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $save$
DECLARE existing jsonb:='{}'; draft public.mailing_senders; sender_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed()
  OR NOT public.can_access_organization(p_organization_id,'sales.write') THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 IF p_settings IS NULL OR jsonb_typeof(p_settings)<>'object' THEN RAISE EXCEPTION 'settings_must_be_object' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_settings) k WHERE k NOT IN
  ('preset_key','label','from_name','from_email','smtp_host','smtp_port','smtp_security','smtp_username',
   'imap_host','imap_port','imap_security','imap_username','daily_limit')) THEN
  RAISE EXCEPTION 'unsupported_sender_setting' USING ERRCODE='22023';
 END IF;
 IF p_password IS NOT NULL AND (length(p_password)<1 OR length(p_password)>4096) THEN
  RAISE EXCEPTION 'invalid_password_length' USING ERRCODE='22023';
 END IF;
 IF p_sender_id IS NOT NULL THEN
  -- Deliberately select safe settings only; never decrypt or return the stored password.
  SELECT jsonb_build_object('preset_key',s.preset_key,'label',s.label,'from_name',s.from_name,'from_email',s.from_email,
   'smtp_host',s.smtp_host,'smtp_port',s.smtp_port,'smtp_security',s.smtp_security,'smtp_username',s.smtp_username,
   'imap_host',s.imap_host,'imap_port',s.imap_port,'imap_security',s.imap_security,'imap_username',s.imap_username,
   'daily_limit',s.daily_limit) INTO existing
  FROM public.mailing_senders s WHERE s.id=p_sender_id AND s.organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sender_not_found' USING ERRCODE='P0002'; END IF;
 ELSIF p_password IS NULL THEN RAISE EXCEPTION 'password_required' USING ERRCODE='22023';
 END IF;
 SELECT * INTO draft FROM jsonb_populate_record(NULL::public.mailing_senders,
  jsonb_build_object('smtp_port',465,'smtp_security','ssl','daily_limit',2)||existing||p_settings);
 draft.label:=btrim(draft.label); draft.from_email:=lower(btrim(draft.from_email));
 draft.smtp_host:=btrim(draft.smtp_host); draft.smtp_username:=btrim(draft.smtp_username);
 draft.imap_host:=nullif(btrim(draft.imap_host),''); draft.imap_username:=nullif(btrim(draft.imap_username),'');
 IF coalesce(draft.label,'')='' OR length(draft.label)>200 OR coalesce(draft.smtp_host,'')=''
  OR coalesce(draft.smtp_username,'')='' OR coalesce(draft.from_email,'') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  OR draft.smtp_host ~ '[[:space:]]' OR coalesce(draft.imap_host,'') ~ '[[:space:]]'
  OR draft.smtp_port IS NULL OR draft.smtp_port NOT BETWEEN 1 AND 65535
  OR draft.smtp_security IS NULL OR draft.smtp_security NOT IN ('ssl','starttls','none')
  OR draft.daily_limit IS NULL OR draft.daily_limit NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'invalid_sender_settings' USING ERRCODE='22023';
 END IF;
 IF draft.imap_host IS NOT NULL AND (draft.imap_port IS NULL OR draft.imap_port NOT BETWEEN 1 AND 65535
  OR draft.imap_security IS DISTINCT FROM 'ssl') THEN
  RAISE EXCEPTION 'imap_requires_tls_and_valid_port' USING ERRCODE='22023';
 END IF;
 IF p_sender_id IS NULL THEN
  INSERT INTO public.mailing_senders(organization_id,preset_key,label,from_name,from_email,
   smtp_host,smtp_port,smtp_security,smtp_username,password_encrypted,imap_host,imap_port,imap_security,imap_username,
   daily_limit,is_active,created_by)
  VALUES(p_organization_id,draft.preset_key,draft.label,draft.from_name,draft.from_email,
   draft.smtp_host,draft.smtp_port,draft.smtp_security,draft.smtp_username,public.encrypt_password(p_password),
   draft.imap_host,draft.imap_port,draft.imap_security,draft.imap_username,draft.daily_limit,false,auth.uid())
  RETURNING id INTO sender_id;
 ELSE
  UPDATE public.mailing_senders SET preset_key=draft.preset_key,label=draft.label,from_name=draft.from_name,
   from_email=draft.from_email,smtp_host=draft.smtp_host,smtp_port=draft.smtp_port,smtp_security=draft.smtp_security,
   smtp_username=draft.smtp_username,imap_host=draft.imap_host,imap_port=draft.imap_port,
   imap_security=draft.imap_security,imap_username=draft.imap_username,daily_limit=draft.daily_limit
  WHERE id=p_sender_id AND organization_id=p_organization_id;
  IF p_password IS NOT NULL THEN
   UPDATE public.mailing_senders SET password_encrypted=public.encrypt_password(p_password)
   WHERE id=p_sender_id AND organization_id=p_organization_id;
  END IF;
  sender_id:=p_sender_id;
 END IF;
 RETURN jsonb_build_object('id',sender_id);
END $save$;
REVOKE ALL ON FUNCTION public.save_mailing_sender(uuid,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_mailing_sender(uuid,uuid,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_mailing_sender_active(p_sender_id uuid,p_organization_id uuid,p_is_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $active$
DECLARE sender_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed()
  OR NOT public.can_access_organization(p_organization_id,'sales.write') THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 IF p_is_active IS NULL THEN RAISE EXCEPTION 'active_required' USING ERRCODE='22023'; END IF;
 UPDATE public.mailing_senders SET is_active=p_is_active WHERE id=p_sender_id AND organization_id=p_organization_id
 RETURNING id INTO sender_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'sender_not_found' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('id',sender_id,'is_active',p_is_active);
END $active$;
REVOKE ALL ON FUNCTION public.set_mailing_sender_active(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_mailing_sender_active(uuid,uuid,boolean) TO authenticated;
