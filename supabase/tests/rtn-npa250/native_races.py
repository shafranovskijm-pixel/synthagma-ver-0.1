"""Genuine multi-session native races; all roles/identities are lab fixtures."""
import time,json,uuid,threading
from native_apply import ARTIFACTS,query
from pgwire_lab import LabConnection
ADMIN='81000000-0000-4000-8000-000000000999'
def prefix(role,actor=ADMIN):return f"SET ROLE {role};SELECT set_config('request.jwt.claim.role','{role}',false);SELECT set_config('request.jwt.claim.sub','{actor}',false);"
def auth(sql):return query(prefix('authenticated')+sql)
def service(sql):return query(prefix('service_role')+sql)
def check(name,ok):
 if not ok:raise AssertionError(name)
 query('SET ROLE postgres;SELECT lab.check('+"'"+name.replace("'","''")+"',true);")
def prepare_pair(edition):
 auth("SELECT lab.keep('race_a_queue',public.request_rtn_npa_editorial_check((lab.ctx('bank_id')#>>'{}')::uuid));")
 service("SELECT lab.keep('race_a',public.claim_rtn_npa_check((lab.ctx('race_a_queue')->>'run_id')::uuid));SELECT lab.keep('race_a_result',lab.npa_result((lab.ctx('race_a')->>'run_id')::uuid,"+str(edition)+"));SELECT public.complete_rtn_npa_check((lab.ctx('race_a')->>'run_id')::uuid,(lab.ctx('race_a')->>'lease_token')::uuid,lab.ctx('race_a_result'));")
 auth("SELECT lab.keep('race_b_queue',public.request_rtn_npa_editorial_check((lab.ctx('bank_id')#>>'{}')::uuid));")
 service("SELECT lab.keep('race_b',public.claim_rtn_npa_check((lab.ctx('race_b_queue')->>'run_id')::uuid));SELECT lab.keep('race_b_result',lab.npa_result((lab.ctx('race_b')->>'run_id')::uuid,"+str(edition+1)+"));")
def approval_sql():
 return "SELECT lab.keep('race_approved',public.approve_rtn_npa_manifest((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('race_a')->>'run_id')::uuid,(lab.ctx('configuration')->>'configuration_id')::uuid,(lab.ctx('race_a')->>'manifest_id')::uuid,(lab.ctx('race_a')->>'finding_epoch')::bigint,'Synthetic real multi-session approval race','"+str(uuid.uuid4())+"'));"
def complete_sql():return "SELECT lab.keep('race_completed',public.complete_rtn_npa_check((lab.ctx('race_b')->>'run_id')::uuid,(lab.ctx('race_b')->>'lease_token')::uuid,lab.ctx('race_b_result')));"
def spawn(name,sql):
 result={}
 def job():
  c=None
  try:c=LabConnection(application=name);result.update(code=0,out=c.query(sql),error='')
  except Exception as e:result.update(code=1,out='',error=str(e))
  finally:
   if c:c.close()
 t=threading.Thread(target=job);t.start();return t,result
def finish(p,name):
 t,r=p;t.join(timeout=15)
 if t.is_alive():raise TimeoutError(name)
 (ARTIFACTS/(name+'.native.log')).write_text(r['out']+'\n'+r['error'],encoding='utf-8');return r['code'],r['out'],r['error']
def observe(name,wait_type=None,event=None):
 until=time.monotonic()+8
 while time.monotonic()<until:
  rows=json.loads(query("SELECT coalesce(jsonb_agg(jsonb_build_object('wait',wait_event_type,'event',wait_event,'state',state)),'[]')FROM pg_stat_activity WHERE application_name='"+name+"';"))
  if any((not wait_type or r['wait']==wait_type)and(not event or r['event']==event)for r in rows):return True
  time.sleep(.05)
 return False
def reconcile(edition):
 auth("SELECT lab.keep('reconcile_q',public.request_rtn_npa_editorial_check((lab.ctx('bank_id')#>>'{}')::uuid));")
 service("SELECT lab.keep('reconcile_c',public.claim_rtn_npa_check((lab.ctx('reconcile_q')->>'run_id')::uuid));SELECT lab.keep('reconcile_r',lab.npa_result((lab.ctx('reconcile_c')->>'run_id')::uuid,"+str(edition)+"));SELECT lab.keep('reconcile_done',public.complete_rtn_npa_check((lab.ctx('reconcile_c')->>'run_id')::uuid,(lab.ctx('reconcile_c')->>'lease_token')::uuid,lab.ctx('reconcile_r')));")
 auth("SELECT public.approve_rtn_npa_manifest((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('reconcile_c')->>'run_id')::uuid,(lab.ctx('configuration')->>'configuration_id')::uuid,(lab.ctx('reconcile_c')->>'manifest_id')::uuid,(lab.ctx('reconcile_done')->>'finding_epoch')::bigint,'Synthetic reconciliation after confirmed race result','"+str(uuid.uuid4())+"');")
def run_races():
 prepare_pair(2)
 a=spawn('npa250-approval-wins',"BEGIN;"+prefix('authenticated')+approval_sql()+"SELECT pg_sleep(2);COMMIT;")
 check('250 native approval owns source before concurrent completion',observe('npa250-approval-wins',event='PgSleep'))
 b=spawn('npa250-complete-waits',"BEGIN;"+prefix('service_role')+complete_sql()+"COMMIT;")
 check('250 native old-manifest completion genuinely waits on source lock',observe('npa250-complete-waits','Lock'))
 ar=finish(a,'race-approval-wins');br=finish(b,'race-complete-after-approval')
 check('250 native both serialized transactions commit',ar[0]==br[0]==0)
 done=json.loads(query("SELECT lab.ctx('race_completed');"))
 check('250 native stale run preserves confirmed change and cannot renew',done['stale_manifest']and done['outcome']=='needs_subject_review'and done['confirmed_findings']==1 and done['valid_until_exclusive']is None)
 check('250 native stale positive fact blocks new admission',query("SET ROLE postgres;SELECT (rtn_private.npa_admission((lab.ctx('fresh_release')->>'release_id')::uuid,clock_timestamp())->>'allowed')::boolean;")=='f')
 reconcile(3)
 prepare_pair(3)
 b=spawn('npa250-completion-wins',"BEGIN;"+prefix('service_role')+complete_sql()+"SELECT pg_sleep(2);COMMIT;")
 check('250 native positive completion owns source before approval',observe('npa250-completion-wins',event='PgSleep'))
 a=spawn('npa250-approval-waits',"BEGIN;"+prefix('authenticated')+approval_sql()+"COMMIT;")
 check('250 native approval genuinely waits behind positive finding',observe('npa250-approval-waits','Lock'))
 br=finish(b,'race-completion-wins');ar=finish(a,'race-approval-after-finding')
 check('250 native current finding commits but stale approval CAS fails',br[0]==0 and ar[0]!=0 and'rtn_npa_approval_cas_conflict'in ar[2])
 reconcile(4)
 return 8
def run_source_races():
 staff='81000000-0000-4000-8000-000000000001'
 assign="SELECT public.assign_rtn_training('11111111-1111-4111-8111-111111111111',(lab.ctx('bank_id')#>>'{}')::uuid,ARRAY['71000000-0000-4000-8000-000000000101']::uuid[]);"
 write="SELECT lab.refresh_source(repeat('b',64));"
 a=spawn('npa250-assignment-wins',"BEGIN;"+prefix('authenticated',staff)+assign+"SELECT pg_sleep(2);COMMIT;")
 check('250 native assignment holds source SHARE through commit',observe('npa250-assignment-wins',event='PgSleep'))
 b=spawn('npa250-source-waits',"BEGIN;"+prefix('service_role')+write+"COMMIT;")
 check('250 native source update genuinely waits behind admitted assignment',observe('npa250-source-waits','Lock'))
 ar=finish(a,'race-assignment-wins');br=finish(b,'race-source-after-assignment')
 check('250 native valid assignment commits before later source generation',ar[0]==br[0]==0)
 # A genuine fresh reviewed A edition (new source generation) restores only
 # its manual window. No old key/release is rewritten to prepare the inverse.
 service("SELECT lab.refresh_source(repeat('a',64));")
 auth("SELECT lab.keep('race_source_review',public.review_rtn_keys((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('br_a_return')#>>'{}')::uuid,lab.ctx('keys'),'Synthetic restored A review for inverse native race',lab.ctx('module')||jsonb_build_object('review_before',(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date+1)));SELECT public.publish_rtn_release((lab.ctx('race_source_review')->>'key_set_id')::uuid,(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date,'Synthetic restored A current manual edition');")
 b=spawn('npa250-source-wins',"BEGIN;"+prefix('service_role')+write+"SELECT pg_sleep(2);COMMIT;")
 check('250 native source update wins inverse admission race',observe('npa250-source-wins',event='PgSleep'))
 a=spawn('npa250-assignment-waits',"BEGIN;"+prefix('authenticated',staff)+assign+"COMMIT;")
 check('250 native new assignment genuinely waits for source update',observe('npa250-assignment-waits','Lock'))
 br=finish(b,'race-source-wins');ar=finish(a,'race-assignment-after-source')
 check('250 native post-wait generation recheck denies obsolete assignment',br[0]==0 and ar[0]!=0 and'rtn_normative_review_required'in ar[2])
 return 6
def run_configure_intent_race():
 # A different genuine synthetic administrator publishes B; using the same
 # actor would serialize on42007 before source and would not exercise this race.
 publisher='81000000-0000-4000-8000-000000000998'
 query("SET ROLE postgres;INSERT INTO public.profiles(id,user_id,organization_id,full_name)VALUES('71000000-0000-4000-8000-000000000998','"+publisher+"','11111111-1111-4111-8111-111111111111','Synthetic second editorial admin');INSERT INTO public.user_roles(user_id,role)VALUES('"+publisher+"','admin');")
 service("SELECT lab.refresh_source(repeat('a',64));")
 auth("SELECT lab.keep('intent_review_a',public.review_rtn_keys((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('br_a_return')#>>'{}')::uuid,lab.ctx('keys'),'Synthetic prepared release A for configuration intent race',lab.ctx('module')||jsonb_build_object('review_before',(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date+1)));SELECT lab.keep('intent_release_a',public.publish_rtn_release((lab.ctx('intent_review_a')->>'key_set_id')::uuid,(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date,'Synthetic prepared A configuration scope'));")
 query("SET ROLE postgres;SELECT lab.keep('intent_before',jsonb_build_object('count',(SELECT count(*)FROM rtn_private.npa_configurations),'epoch',coalesce((SELECT max(epoch)FROM rtn_private.npa_findings),0),'config',(SELECT to_jsonb(c)FROM rtn_private.npa_configurations c WHERE id=(lab.ctx('configuration')->>'configuration_id')::uuid))); ")
 publish="SELECT lab.keep('intent_review_b',public.review_rtn_keys((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('br_a_return')#>>'{}')::uuid,lab.ctx('keys'),'Synthetic independently reviewed release B changes material context',jsonb_set(lab.ctx('module')||jsonb_build_object('title','Synthetic different release B','review_before',(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date+1),'{materials,0,body}',to_jsonb('Synthetic B has separately reviewed new material content.'::text))));SELECT lab.keep('intent_release_b',public.publish_rtn_release((lab.ctx('intent_review_b')->>'key_set_id')::uuid,(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date,'Synthetic B published while A configuration waits'));"
 configure="SELECT public.configure_rtn_npa_basis((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('configuration')->>'configuration_id')::uuid,(lab.ctx('intent_release_a')->>'release_id')::uuid,lab.ctx('basis'),(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date,'Synthetic basis explicitly prepared for release A','"+str(uuid.uuid4())+"');"
 b=spawn('npa250-publish-scope-b',"BEGIN;"+prefix('authenticated',publisher)+publish+"SELECT pg_sleep(2);COMMIT;")
 check('250 configure intent race publisher B holds source lock',observe('npa250-publish-scope-b',event='PgSleep'))
 a=spawn('npa250-configure-prepared-a',"BEGIN;"+prefix('authenticated')+configure+"COMMIT;")
 check('250 prepared A configuration genuinely waits behind publish B',observe('npa250-configure-prepared-a','Lock'))
 br=finish(b,'race-configure-intent-publish-b');ar=finish(a,'race-configure-intent-a-rejected')
 check('250 different actor B publishes but A configure fails40001',br[0]==0 and ar[0]!=0 and'40001'in ar[2]and'rtn_npa_configuration_release_conflict'in ar[2])
 after=json.loads(query("SET ROLE postgres;SELECT jsonb_build_object('count',(SELECT count(*)FROM rtn_private.npa_configurations),'epoch',coalesce((SELECT max(epoch)FROM rtn_private.npa_findings),0),'config',(SELECT to_jsonb(c)FROM rtn_private.npa_configurations c WHERE id=(lab.ctx('configuration')->>'configuration_id')::uuid));"))
 before=json.loads(query("SELECT lab.ctx('intent_before');"))
 check('250 failed scope CAS inserts no configuration and no finding epoch',after==before)
 check('250 published B is current rather than prepared A',query("SET ROLE postgres;SELECT rtn_private.npa_latest_release((lab.ctx('bank_id')#>>'{}')::uuid,clock_timestamp())=(lab.ctx('intent_release_b')->>'release_id')::uuid;")=='t')
 result=auth("SELECT public.configure_rtn_npa_basis((lab.ctx('bank_id')#>>'{}')::uuid,NULL,(lab.ctx('fresh_release')->>'release_id')::uuid,lab.ctx('basis'),(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date-1,'Synthetic complete basis configuration','85000000-0000-4000-8000-000000000001');")
 replay=json.loads(result.splitlines()[-1]);original=json.loads(query("SELECT lab.ctx('configuration');"))
 check('250 exact old A request replay after publish B preserves original receipt',replay['replayed']and replay['configuration_id']==original['configuration_id'])
 check('250 no obsolete configure overload remains callable',query("SELECT to_regprocedure('public.configure_rtn_npa_basis(uuid,uuid,jsonb,date,text,uuid)')IS NULL;")=='t')
 return 7
