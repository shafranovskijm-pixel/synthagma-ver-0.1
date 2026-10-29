"""ISOLATED native PostgreSQL concurrency proof. Never connects to a non-local host.
Requires psycopg 3 and a fresh lab DB created with lab-setup.sql + candidate migration.
Runs after lab-tests.sql (which rolls back all serial fixtures). Does not connect to Cloud."""
import json, os, threading, time
import psycopg

HOST=os.environ.get("PGHOST","127.0.0.1")
DB=os.environ.get("PGDATABASE","")
if HOST not in ("127.0.0.1","localhost") or not DB.startswith(("lpr_reset_lab","sintagma_reset_lab")):
    raise SystemExit("Refusing: requires local host and explicit isolated reset-lab database name")
KW=dict(host=HOST,port=int(os.environ.get("PGPORT","5432")),dbname=DB,
        user=os.environ.get("PGUSER","postgres"),password=os.environ.get("PGPASSWORD",""),
        autocommit=True,connect_timeout=5)
O="d0000000-0000-0000-0000-000000000001"
U="d1000000-0000-0000-0000-000000000001"
S="d1000000-0000-0000-0000-000000000002"
C="d2000000-0000-0000-0000-000000000001"
CSZ="7630559a-6caf-42e7-97f9-1cd0e4598c39"
L="d3000000-0000-0000-0000-000000000001"
T="d3000000-0000-0000-0000-000000000002"
H="d3000000-0000-0000-0000-000000000003"
E="d4000000-0000-0000-0000-000000000001"
CE="d4000000-0000-0000-0000-000000000002"
OLD_SESSION="d5000000-0000-0000-0000-000000000001"
OLD_HW="d6000000-0000-0000-0000-000000000001"
Q="d7000000-0000-0000-0000-000000000001"
K=784231

def connect(actor=None,app="lpr-control",auth=False):
    c=psycopg.connect(**KW,application_name=app)
    c.execute("SET statement_timeout='15s'")
    c.execute("SELECT set_config('test.actor',%s,false)",(actor or "",))
    if auth: c.execute("SET ROLE authenticated")
    return c

def check(condition,label):
    if not condition: raise AssertionError(label)

with connect() as c:
    check(c.execute("SELECT value FROM public.lab_progress_reset_fixture_marker").fetchone()==("ISOLATED_SYNTHETIC_ONLY",),
          "isolated fixture marker")
    check(c.execute("SELECT current_user").fetchone()[0]=="postgres","isolated owner postgres")
    check(not c.execute("SELECT EXISTS(SELECT 1 FROM public.organizations WHERE id=%s::uuid)",(O,)).fetchone()[0],
          "race fixture must be created only once in this lab")
    c.execute("INSERT INTO organizations(id,name)VALUES(%s::uuid,'Synthetic native race lab')",(O,))
    c.execute("INSERT INTO profiles(user_id,organization_id,full_name)VALUES(%s::uuid,%s::uuid,'Synthetic race learner'),(%s::uuid,%s::uuid,'Synthetic race staff')",(U,O,S,O))
    c.execute("INSERT INTO lab_staff VALUES(%s::uuid,%s::uuid)",(S,O))
    c.execute("INSERT INTO courses(id,organization_id,title)VALUES(%s::uuid,%s::uuid,'Synthetic race course'),(%s::uuid,%s::uuid,'Synthetic protected race course')",(C,O,CSZ,O))
    c.execute("INSERT INTO lessons(id,course_id,title,type)VALUES(%s::uuid,%s::uuid,'Text','text'),(%s::uuid,%s::uuid,'Test','test'),(%s::uuid,%s::uuid,'Homework','homework')",(L,C,T,C,H,CSZ))
    c.execute("INSERT INTO enrollments(id,user_id,course_id)VALUES(%s::uuid,%s::uuid,%s::uuid),(%s::uuid,%s::uuid,%s::uuid)",(E,U,C,CE,U,CSZ))
    c.execute("INSERT INTO test_questions(id,lesson_id,question,options,correct_answer,order_index)VALUES(%s::uuid,%s::uuid,'Synthetic question','[\"A\",\"B\"]',0,1)",(Q,T))
    questions=json.dumps([{"id":Q,"correct_answer":0,"options":["A","B"]}])
    c.execute("INSERT INTO test_attempt_sessions(id,user_id,lesson_id,request_id,started_at,questions_snapshot,passing_score,show_answers)VALUES(%s::uuid,%s::uuid,%s::uuid,gen_random_uuid(),clock_timestamp()-interval '1 hour',%s::jsonb,70,true)",(OLD_SESSION,U,T,questions))
    c.execute("SELECT set_config('test.actor',%s,false)",(U,))
    c.execute("INSERT INTO homework_submissions(id,lesson_id,student_id,course_id,organization_id,content,status,learning_progress_epoch)VALUES(%s::uuid,%s::uuid,%s::uuid,%s::uuid,%s::uuid,'Synthetic old pending','pending',0)",(OLD_HW,H,U,CSZ,O))
    old_session=c.execute("SELECT to_jsonb(s)::text FROM test_attempt_sessions s WHERE id=%s::uuid",(OLD_SESSION,)).fetchone()[0]
    old_hw=c.execute("SELECT to_jsonb(h)::text FROM homework_submissions h WHERE id=%s::uuid",(OLD_HW,)).fetchone()[0]

def race(label,left_actor,left,right_actor,right,wanted_right=None):
    results={}
    control=connect(app="lpr-control-"+label)
    control.execute("SELECT pg_advisory_lock(%s,2)",(K,))
    def worker(side,actor,fn,hold):
        try:
            with connect(actor,app="lpr-race-"+label+"-"+side,auth=True) as c:
                c.execute("BEGIN")
                result=fn(c)
                if hold:
                    c.execute("SELECT pg_advisory_xact_lock(%s,1)",(K,))
                    c.execute("SELECT pg_advisory_xact_lock(%s,2)",(K,))
                c.execute("COMMIT")
                results[side]=("OK",result)
        except Exception as exc:
            results[side]=(getattr(exc,"sqlstate",None),str(exc).splitlines()[0])
    a=threading.Thread(target=worker,args=("left",left_actor,left,True))
    b=threading.Thread(target=worker,args=("right",right_actor,right,False))
    a.start()
    deadline=time.monotonic()+10
    while True:
        available=control.execute("SELECT pg_try_advisory_lock(%s,1)",(K,)).fetchone()[0]
        if not available: break
        control.execute("SELECT pg_advisory_unlock(%s,1)",(K,))
        if time.monotonic()>deadline: raise TimeoutError("left never reached real DB barrier: "+label)
        time.sleep(.02)
    b.start()
    while True:
        blocked=control.execute("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=%s AND wait_event_type='Lock')",
                                ("lpr-race-"+label+"-right",)).fetchone()[0]
        if blocked: break
        if time.monotonic()>deadline: raise TimeoutError("right never blocked on real database lock: "+label)
        time.sleep(.02)
    control.execute("SELECT pg_advisory_unlock(%s,2)",(K,))
    a.join(10);b.join(10);control.close()
    check(not a.is_alive()and not b.is_alive(),"no stuck worker "+label)
    check(results.get("left",("",))[0]=="OK","left committed "+label+": "+str(results))
    check(results.get("right",("",))[0]==(wanted_right or "OK"),"right outcome "+label+": "+str(results))
    if wanted_right=="P0001":
        check(results["right"][1]=="LEARNING_PROGRESS_RESET","right reset fence message "+label+": "+str(results))
    return results

def save(c,epoch):
    return c.execute("SELECT save_own_lesson_progress(%s::uuid,%s::uuid,%s,true)",(E,L,str(epoch))).fetchone()[0]
def reset(c,eid):
    return c.execute("SELECT reset_course_learning_progress(%s::uuid,%s::uuid)",(eid,O)).fetchone()[0]
def state():
    with connect(U,auth=True)as c:
        return c.execute("SELECT get_course_learning_snapshot(%s::uuid)",(C,)).fetchone()[0]

proof=[]
race("write_then_reset",U,lambda c:save(c,0),S,lambda c:reset(c,E))
s=state();check(s["learning_progress_epoch"]=="1"and s["enrollment"]["progress"]==0 and s["lesson_progress"]==[],
                "committed completion before reset is cleared")
proof.append({"race":"write_then_reset","result":"reset1/current0"})

race("reset_then_stale_write",S,lambda c:reset(c,E),U,lambda c:save(c,1),"P0001")
s=state();check(s["learning_progress_epoch"]=="2"and s["enrollment"]["progress"]==0 and s["lesson_progress"]==[],
                "stale write cannot resurrect after reset commit")
proof.append({"race":"reset_then_stale_write","result":"stale1 refused/current2/current0"})

def start(c):
    return c.execute("SELECT start_test_attempt_at_epoch(%s::uuid,gen_random_uuid(),'2')",(T,)).fetchone()[0]
r=race("two_current_starts",U,start,U,start)
check(r["left"][1]["attemptId"]==r["right"][1]["attemptId"],"both concurrent tabs receive one current session")
proof.append({"race":"two_current_starts","result":"same current session; historical active kept"})

with connect(S,auth=True)as c: reset(c,CE)
def submit_hw(c,epoch):
    return str(c.execute("INSERT INTO homework_submissions(lesson_id,student_id,course_id,organization_id,content,learning_progress_epoch)VALUES(%s::uuid,%s::uuid,%s::uuid,%s::uuid,'Synthetic new pending',%s)RETURNING id",
                        (H,U,CSZ,O,epoch)).fetchone()[0])
race("two_current_homework",U,lambda c:submit_hw(c,1),U,lambda c:submit_hw(c,1),"23505")
proof.append({"race":"two_current_homework","result":"one pending epoch1; old pending0 exact"})

race("reset_then_stale_homework",S,lambda c:reset(c,CE),U,lambda c:submit_hw(c,1),"P0001")
proof.append({"race":"reset_then_stale_homework","result":"stale queued1 refused after committed reset2"})

with connect()as c:
    check(c.execute("SELECT to_jsonb(s)::text FROM test_attempt_sessions s WHERE id=%s::uuid",(OLD_SESSION,)).fetchone()[0]==old_session,
          "old in_progress session byte payload exact")
    check(c.execute("SELECT to_jsonb(h)::text FROM homework_submissions h WHERE id=%s::uuid",(OLD_HW,)).fetchone()[0]==old_hw,
          "old pending homework byte payload exact")
    check(c.execute("SELECT count(*)FROM homework_submissions WHERE student_id=%s::uuid AND lesson_id=%s::uuid",(U,H)).fetchone()[0]==2,
          "only old0 and committed current1 homework remain")
    check(c.execute("SELECT count(*)FROM test_attempt_sessions WHERE user_id=%s::uuid AND lesson_id=%s::uuid",(U,T)).fetchone()[0]==2,
          "only old0 and one current2 session remain")
print(json.dumps({"status":"PASS","native_concurrent_races":5,"proof":proof,
                  "boundary":"synthetic PostgreSQL roles/access stand-ins; no Cloud/Auth/JWT/Storage proof"},ensure_ascii=False))

