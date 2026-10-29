"""Run only the isolated synthetic PostgreSQL reset lab; never production.
No Cloud URL, JWT, service key or user data is read. Artifacts contain synthetic tests only."""
from __future__ import annotations
import argparse, hashlib, json, os, platform, subprocess, sys, time, traceback
from datetime import datetime, timezone
from pathlib import Path
import psycopg

parser=argparse.ArgumentParser()
parser.add_argument("--repo-root",default=".")
parser.add_argument("--expected-migration-sha")
args=parser.parse_args()
ROOT=Path(args.repo_root).resolve()
OUT=ROOT/"outputs"/"learning-progress-reset-native"
OUT.mkdir(parents=True,exist_ok=True)
REPORT=OUT/"native-proof.json"
START=time.monotonic()
proof={"status":"RUNNING","qualification":"Isolated native PostgreSQL synthetic Auth/access stand-ins. No genuine JWT/Auth/Cloud/Storage or customer acceptance.",
       "startedAt":datetime.now(timezone.utc).isoformat(),"sourceCommit":os.environ.get("GITHUB_SHA"),
       "githubRunId":os.environ.get("GITHUB_RUN_ID"),"githubRunAttempt":os.environ.get("GITHUB_RUN_ATTEMPT"),
       "runtime":{"python":sys.version.split()[0],"platform":platform.platform(),"psycopg":psycopg.__version__},
       "stages":[],"serialAssertions":0,"nativeConcurrentRaces":0}
def save_report():
    proof["elapsedSeconds"]=round(time.monotonic()-START,3)
    REPORT.write_text(json.dumps(proof,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
def contained(path: Path)->Path:
    resolved=path.resolve()
    resolved.relative_to(ROOT)
    if not resolved.is_file(): raise RuntimeError("Missing reviewed lab source: "+str(path.relative_to(ROOT)))
    return resolved
def read_source(rel: str):
    p=contained(ROOT/rel);raw=p.read_bytes()
    return p,raw,{"path":rel,"bytes":len(raw),"sha256":hashlib.sha256(raw).hexdigest()}
def safe_error(exc):
    # Only static synthetic test SQL is executed. Never print the connection environment.
    return {"type":type(exc).__name__,"sqlstate":getattr(exc,"sqlstate",None),"message":str(exc).splitlines()[0]}
try:
    host=os.environ.get("PGHOST","")
    db=os.environ.get("PGDATABASE","")
    if host not in ("127.0.0.1","localhost") or not db.startswith(("lpr_reset_lab","sintagma_reset_lab")):
        raise RuntimeError("Refusing non-local host or database outside explicit reset-lab prefixes")
    if os.environ.get("PGUSER")!="postgres":
        raise RuntimeError("Isolated fixture requires the disposable postgres owner")
    paths=[
        "supabase/tests/learning_progress_reset/lab-setup.sql",
        "supabase/migrations/20261030000000_learning_progress_reset_epoch.sql",
        "supabase/tests/learning_progress_reset/lab-tests.sql",
        "supabase/tests/learning_progress_reset/lab-concurrency.py",
        "supabase/tests/learning_progress_reset/run-native-lab.py",
        ".github/workflows/learning-progress-reset-native.yml",
    ]
    sources=[read_source(p)for p in paths]
    proof["sources"]=[x[2]for x in sources]
    if args.expected_migration_sha and sources[1][2]["sha256"]!=args.expected_migration_sha:
        raise RuntimeError("Migration SHA differs from the reviewed workflow freeze")
    (OUT/"source-manifest.json").write_text(json.dumps(proof["sources"],indent=2)+"\n",encoding="utf-8")
    # Pin only the local synthetic endpoint. Do not accept a DATABASE_URL.
    conn=psycopg.connect(host=host,port=int(os.environ.get("PGPORT","5432")),dbname=db,user="postgres",
                          password=os.environ.get("PGPASSWORD",""),connect_timeout=5,autocommit=True,
                          application_name="lpr-native-serial")
    try:
        version,num,owner=conn.execute("SELECT version(),current_setting('server_version_num')::integer,current_user").fetchone()
        proof["postgresVersion"]=version
        if not(170000<=num<180000) or "wasm" in version.lower() or owner!="postgres":
            raise RuntimeError("Requires genuine native PostgreSQL 17 owned by postgres")
        if conn.execute("SELECT count(*)FROM pg_catalog.pg_tables WHERE schemaname='public'").fetchone()[0]!=0:
            raise RuntimeError("Refusing nonempty public schema; lab must be a fresh service database")
        passed=[]
        stage_notice_file=None
        def notice(diag):
            message=diag.message_primary or ""
            if stage_notice_file:
                stage_notice_file.write((diag.severity or "NOTICE")+": "+message+"\n")
                stage_notice_file.flush()
            if message.startswith("PASS: "): passed.append(message[6:])
        conn.add_notice_handler(notice)
        for i,(path,raw,meta)in enumerate(sources[:3]):
            before=len(passed)
            stage={"source":meta["path"],"sha256":meta["sha256"],"status":"RUNNING"}
            proof["stages"].append(stage);save_report()
            # Notice logs contain only synthetic case labels; SQL result bodies/answer keys are not exported.
            with (OUT/("stage-"+str(i+1)+".stdout.txt")).open("w",encoding="utf-8")as log:
                stage_notice_file=log
                cur=conn.execute(raw.decode("utf-8"),prepare=False)
                statements=0
                while True:
                    statements+=1
                    log.write((cur.statusmessage or "UNKNOWN")+"\n")
                    if not cur.nextset():break
                stage_notice_file=None
            stage.update(status="PASS",statements=statements,assertions=len(passed)-before)
            print(json.dumps(stage),flush=True)
        proof["serialAssertions"]=len(passed)
        proof["serialAssertionLabels"]=passed
        if len(passed)!=90:
            raise RuntimeError("Expected exactly 90 serial assertions, observed "+str(len(passed)))
        marker=conn.execute("SELECT value FROM public.lab_progress_reset_fixture_marker").fetchone()
        if marker!=("ISOLATED_SYNTHETIC_ONLY",):
            raise RuntimeError("Fixture marker mismatch")
    finally:
        conn.close()
    # The concurrency harness opens separate real backend connections and checks Lock waits.
    cpath=sources[3][0]
    proc=subprocess.run([sys.executable,str(cpath)],cwd=ROOT,env=os.environ.copy(),
                        text=True,capture_output=True,timeout=120,check=False)
    (OUT/"concurrency.stdout.txt").write_text(proc.stdout,encoding="utf-8")
    (OUT/"concurrency.stderr.txt").write_text(proc.stderr,encoding="utf-8")
    if proc.returncode!=0:
        raise RuntimeError("Native concurrency harness failed; inspect synthetic concurrency.stderr.txt")
    lines=[line for line in proc.stdout.splitlines()if line.strip()]
    concurrent=json.loads(lines[-1])if lines else{}
    if concurrent.get("status")!="PASS" or concurrent.get("native_concurrent_races")!=5 or len(concurrent.get("proof",[]))!=5:
        raise RuntimeError("Missing exact five native lock-barrier race proofs")
    proof["nativeConcurrentRaces"]=5
    proof["concurrency"]=concurrent
    proof["status"]="PASS"
    save_report()
    print(json.dumps({"status":"PASS","serialAssertions":90,"nativeConcurrentRaces":5,
                      "proofPath":str(REPORT.relative_to(ROOT))}),flush=True)
except BaseException as exc:
    proof["status"]="FAIL";proof["failure"]=safe_error(exc);save_report()
    print(json.dumps({"status":"FAIL","failure":proof["failure"]}),file=sys.stderr,flush=True)
    raise

