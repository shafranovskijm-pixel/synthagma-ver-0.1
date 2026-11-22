"""Fresh loopback PostgreSQL17/manual import lab, no production/source HTTP."""
import ast
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'supabase/tests/rtn-manual-source-import'
OUT = ROOT / 'outputs/rtn-manual-source-import-sql'
DB_NAME = 'rtn_manual_source_import_lab_ci'
MIGRATION = ROOT / 'supabase/migrations/20261123100000_rtn_manual_source_import.sql'
POSTIMAGES_SQL = """SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body_md5',md5(p.prosrc),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'proconfig',p.proconfig,'prosecdef',p.prosecdef,'provolatile',p.provolatile)ORDER BY p.oid::regprocedure::text)FROM pg_proc p WHERE p.oid IN('public.get_rtn_workspace(uuid)'::regprocedure,'public.get_rtn_editorial_workspace()'::regprocedure,'rtn_private.assert_manual_import_actor(uuid)'::regprocedure,'rtn_private.manual_source_intake_receipt(uuid,boolean)'::regprocedure,'public.finalize_rtn_manual_source_import(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb)'::regprocedure)),'table',(SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'acl',c.relacl::text,'triggers',(SELECT jsonb_agg(jsonb_build_object('name',tgname,'type',tgtype,'enabled',tgenabled,'function',tgfoid::regprocedure::text)ORDER BY tgname)FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal))FROM pg_class c WHERE c.oid='rtn_private.manual_source_intakes'::regclass))"""


def prepared():
    source = (ROOT / 'scripts/test-rtn-question-policy-sql.py').read_text(encoding='utf-8')
    node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'prepared')
    ns = {'ROOT': ROOT, 'HERE': ROOT / 'supabase/tests/rtn-question-review-policy', 'DB_NAME': DB_NAME, 'ast': ast, 're': re}
    exec(ast.get_source_segment(source, node), ns)
    prior = dict(ns['prepared']())
    files = [(n, prior[n]) for n in ['setup.sql','privacy.sql','old-seed.sql','normative.sql','global.sql','backoff.sql']]
    files += [('policy.sql', prior['candidate.sql']),
              ('manual-backoff.sql', 'SET ROLE postgres;BEGIN;\n' + (ROOT / 'supabase/migrations/20261122133000_rtn_manual_source_backoff.sql').read_text(encoding='utf-8') + '\nCOMMIT;'),
              ('before.sql', (HERE / 'before.sql').read_text(encoding='utf-8')),
              ('candidate.sql', 'SET ROLE postgres;BEGIN;\n' + MIGRATION.read_text(encoding='utf-8') + '\nCOMMIT;'),
              ('acceptance.sql', (HERE / 'acceptance.sql').read_text(encoding='utf-8'))]
    original = json.loads((ROOT / 'supabase/functions/_shared/rtn/data/a1-69349ffd5013.json').read_text(encoding='utf-8'))
    files.insert(-2, ('known-extraction.sql', "SET ROLE postgres;SELECT lab.keep('manual_known211'," + "'" + json.dumps([{'code':'A.1','questions':original}],ensure_ascii=False).replace("'","''") + "'::jsonb);"))
    return files


def native_cases(raw, psql):
    actor = '81000000-0000-4000-8000-000000000999'
    helper = raw("SET ROLE postgres;CREATE FUNCTION lab.mi_outcome(p_sql text)RETURNS jsonb LANGUAGE plpgsql AS $$DECLARE result jsonb;BEGIN EXECUTE p_sql INTO result;RETURN jsonb_build_object('code','00000','result',result);EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('code',SQLSTATE,'message',SQLERRM);END;$$;GRANT EXECUTE ON FUNCTION lab.mi_outcome(text)TO service_role;")
    if helper.returncode:
        raise AssertionError(helper.stderr)
    witnesses=[]
    for number,mode in [(101,'queued_after_wait'),(102,'worker_completes_cas'),(103,'actor_revoked'),(104,'exact_concurrent_replay')]:
        source='68000000-0000-4000-8000-'+str(number).zfill(12)
        request='69000000-0000-4000-8000-'+str(number).zfill(12)
        run='6a000000-0000-4000-8000-'+str(number).zfill(12)
        lease='6b000000-0000-4000-8000-'+str(number).zfill(12)
        path=source+'/'+('b'*64)+'.pdf'
        setup="SET ROLE postgres;INSERT INTO rtn_private.sources(id,code,title,page_url,document_url,trusted_anchor_rule,parser)VALUES('"+source+"','manual-native-"+str(number)+"','Synthetic native intake','https://www.gosnadzor.ru/service/list/normative-lab/','https://www.gosnadzor.ru/service/list/normative-lab/a1.pdf','a1','industrial-pdf');"
        setup+="INSERT INTO rtn_private.banks(source_id,code,title,domain)VALUES('"+source+"','MANUAL-NATIVE-"+str(number)+"','Synthetic native bank','industrial-safety');"
        setup+="INSERT INTO storage.objects(id,bucket_id,name,metadata)VALUES(gen_random_uuid(),'rtn-sources','"+path+"','{\"size\":1234,\"mimetype\":\"application/pdf\"}');"
        if mode=='worker_completes_cas':
            setup+="INSERT INTO rtn_private.check_runs(id,source_id,kind,status,lease_token,lease_expires_at,attempt_count)VALUES('"+run+"','"+source+"','weekly','running','"+lease+"',clock_timestamp()+interval '10 minutes',1);"
        seeded=raw(setup)
        if seeded.returncode:
            raise AssertionError(seeded.stderr)
        call="SELECT public.finalize_rtn_manual_source_import('"+actor+"','"+request+"','"+source+"',0,jsonb_build_object('sha256',repeat('b',64),'byte_size',1234,'media_type','application/pdf','original_path','"+path+"','parser','industrial-pdf','original_verified',true),lab.mi_provenance(),'[]')"
        service="SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);SELECT set_config('request.jwt.claim.sub','',false);"
        app='rtn_manual_intake_'+str(number)
        blocker=subprocess.Popen([psql,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
        pool=concurrent.futures.ThreadPoolExecutor(max_workers=2)
        try:
            begin="BEGIN;SET LOCAL statement_timeout='15s';"
            if mode=='exact_concurrent_replay':
                begin+=service+call+';'
            else:
                begin+="SET ROLE postgres;SELECT 1 FROM rtn_private.sources WHERE id='"+source+"'FOR UPDATE;"
            blocker.stdin.write(begin+"SELECT 'INTAKE_HELD:'||pg_backend_pid();\n")
            blocker.stdin.flush()
            def marker():
                for line in blocker.stdout:
                    if line.strip().startswith('INTAKE_HELD:'):
                        return int(line.strip().split(':')[1])
                raise AssertionError('Missing own native blocker PID')
            blocker_pid=pool.submit(marker).result(timeout=10)
            contender="SET application_name='"+app+"';SET statement_timeout='15s';BEGIN;"+service+"SELECT lab.mi_outcome($operation$"+call+"$operation$);COMMIT;"
            pending=pool.submit(raw,contender)
            observed=None
            expires=time.monotonic()+8
            while time.monotonic()<expires:
                query=raw("SELECT json_build_object('pid',pid,'blockers',pg_blocking_pids(pid))FROM pg_stat_activity WHERE datname=current_database()AND application_name='"+app+"'AND wait_event_type='Lock'AND "+str(blocker_pid)+"=ANY(pg_blocking_pids(pid));")
                if query.returncode:
                    raise AssertionError(query.stderr)
                if query.stdout.strip():
                    observed=json.loads(query.stdout.strip());break
                if pending.done():break
                time.sleep(.025)
            if observed is None:
                raise AssertionError('Intake did not wait on its actual blocker PID: '+mode)
            commit=''
            if mode=='queued_after_wait':
                commit="INSERT INTO rtn_private.check_runs(id,source_id,kind,status)VALUES('"+run+"','"+source+"','weekly','queued');"
            elif mode=='worker_completes_cas':
                commit=service+"SELECT public.complete_rtn_check('"+run+"','"+lease+"',jsonb_build_object('status','changed','sha256',repeat('d',64),'original_path','"+source+"/'||repeat('d',64)||'.pdf','media_type','application/pdf','byte_size',1234,'document_url','https://www.gosnadzor.ru/service/list/normative-lab/a1.pdf','normalized_banks','[]'::jsonb,'http_status',200));"
            elif mode=='actor_revoked':
                commit="INSERT INTO public.account_deletion_revocations VALUES('"+actor+"');"
            blocker.stdin.write(commit+'COMMIT;\n\\q\n');blocker.stdin.flush()
            _,stderr=blocker.communicate(timeout=10)
            outcome=pending.result(timeout=12)
            if blocker.returncode or outcome.returncode:
                raise AssertionError(stderr+outcome.stderr)
            reply=json.loads(outcome.stdout.strip().splitlines()[-1])
            expected=('00000' if mode=='exact_concurrent_replay' else '42501' if mode=='actor_revoked' else '40001')
            if reply.get('code')!=expected:
                raise AssertionError(mode+': '+json.dumps(reply))
            if mode=='queued_after_wait' and reply.get('message')!='rtn_manual_import_source_busy':
                raise AssertionError('Source busy was not preserved after wait')
            if mode=='worker_completes_cas' and reply.get('message')!='rtn_manual_import_generation_conflict':
                raise AssertionError('Committed legacy completion did not win CAS')
            if mode=='exact_concurrent_replay' and(not reply['result'].get('replayed')or not reply['result'].get('still_current')):
                raise AssertionError('Concurrent replay did not reuse the accepted receipt')
            state_reply=raw("SET ROLE postgres;SELECT jsonb_build_object('generation',s.source_generation,'sha',s.last_sha256,'intakes',(SELECT count(*)FROM rtn_private.manual_source_intakes WHERE source_id=s.id),'runs',(SELECT count(*)FROM rtn_private.check_runs WHERE source_id=s.id))FROM rtn_private.sources s WHERE s.id='"+source+"';")
            if state_reply.returncode:raise AssertionError(state_reply.stderr)
            state=json.loads(state_reply.stdout.strip())
            if mode=='exact_concurrent_replay':
                valid=state=={'generation':1,'sha':'b'*64,'intakes':1,'runs':0}
            elif mode=='worker_completes_cas':
                valid=state=={'generation':1,'sha':'d'*64,'intakes':0,'runs':1}
            else:
                valid=state=={'generation':0,'sha':None,'intakes':0,'runs':1 if mode=='queued_after_wait' else 0}
            if not valid:raise AssertionError('Unexpected post-wait mutation: '+json.dumps(state))
            name='native manual intake '+mode+' uses the committed state after an actual PID wait'
            saved=raw("SET ROLE postgres;SELECT lab.check('"+name+"',true);")
            if saved.returncode:raise AssertionError(saved.stderr)
            witnesses.append({'case':name,'blocker_pid':blocker_pid,'waiter':observed,'sqlstate':reply['code'],'state':state})
        finally:
            if blocker.poll()is None:
                blocker.terminate();blocker.communicate(timeout=5)
            pool.shutdown(wait=True,cancel_futures=True)
        if mode=='actor_revoked':
            restored=raw("SET ROLE postgres;DELETE FROM public.account_deletion_revocations WHERE user_id='"+actor+"';")
            if restored.returncode:raise AssertionError(restored.stderr)
    return witnesses


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = prepared()
    if sys.argv[1:] == ['--prepare-only']:
        for name, sql in files:
            (OUT / name).write_text(sql, encoding='utf-8', newline='\n')
        print(json.dumps({'status':'prepared_synthetic_manual_import_only','files':[n for n,_ in files]}))
        return
    if sys.argv[1:] or os.environ.get('PGDATABASE') != DB_NAME or os.environ.get('PGHOST') not in ('127.0.0.1','::1','localhost'):
        raise SystemExit('REFUSE: dedicated fresh loopback ' + DB_NAME + ' required')
    psql = os.environ.get('PSQL','psql')
    def raw(sql):
        return subprocess.run([psql,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1'],input=sql,text=True,encoding='utf-8',capture_output=True)
    probe = raw("SELECT current_database(),current_setting('server_version_num')::int,NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='rtn_private');")
    if probe.returncode or not probe.stdout.strip().startswith(DB_NAME+'|17') or not probe.stdout.strip().endswith('|t'):
        raise SystemExit('REFUSE: fresh PG17 fixture required; no reset attempted')
    for stream in ('stdout','stderr'):
        (OUT/('native.'+stream+'.txt')).write_text('',encoding='utf-8')
    for name,sql in files:
        response = raw(sql)
        for stream in ('stdout','stderr'):
            with (OUT/('native.'+stream+'.txt')).open('a',encoding='utf-8') as log:
                log.write('FILE '+name+'\n'+getattr(response,stream))
        if response.returncode:
            raise SystemExit(name+': '+response.stderr[-6000:])
    witnesses=native_cases(raw,psql)
    cases = raw('SET ROLE postgres;SELECT name FROM lab.results ORDER BY name;')
    post = raw('SET ROLE postgres;'+POSTIMAGES_SQL+';')
    if cases.returncode or post.returncode:
        raise SystemExit(cases.stderr+post.stderr)
    names = cases.stdout.strip().splitlines()
    if len(names)<30 or len(witnesses)!=4:
        raise SystemExit('Missing required manual source import coverage')
    receipt={'status':'passed','engine':'native PostgreSQL17 synthetic fixture','passed':len(names),'cases':names,
             'postimages':json.loads(post.stdout.strip()),'native_pid_witnesses':witnesses,
             'migration_sha256':hashlib.sha256(MIGRATION.read_bytes()).hexdigest(),
             'scope':'Synthetic trusted-storage, authority and source CAS only; not actual upload/source/Techservice proof'}
    (OUT/'native-result.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
    print(json.dumps(receipt))


if __name__=='__main__':
    main()
