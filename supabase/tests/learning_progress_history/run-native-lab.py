"""Isolated PostgreSQL17 history/current-progress lab. Never executes against Cloud."""
from __future__ import annotations
import argparse,hashlib,json,os,platform,sys,time
from pathlib import Path
from datetime import datetime,timezone
import psycopg

parser=argparse.ArgumentParser()
parser.add_argument("--repo-root",default=".")
parser.add_argument("--expected-migration-sha")
args=parser.parse_args()
root=Path(args.repo_root).resolve()
out=root/"outputs"/"learning-progress-history-native"
out.mkdir(parents=True,exist_ok=True)
proof={"status":"RUNNING","startedAt":datetime.now(timezone.utc).isoformat(),
 "qualification":"Isolated PostgreSQL17 synthetic auth/access; no genuine JWT/Cloud/customer data or production acceptance.",
 "sourceCommit":os.environ.get("GITHUB_SHA"),"githubRunId":os.environ.get("GITHUB_RUN_ID"),
 "runtime":{"python":sys.version.split()[0],"psycopg":psycopg.__version__,"platform":platform.platform()},
 "stages":[],"sources":[],"assertions":0}
started=time.monotonic()
def save():
 proof["elapsedSeconds"]=round(time.monotonic()-started,3)
 (out/"native-proof.json").write_text(json.dumps(proof,indent=2)+"\n",encoding="utf-8")
try:
 host=os.environ.get("PGHOST","")
 db=os.environ.get("PGDATABASE","")
 if host not in("127.0.0.1","localhost")or not db.startswith("lpr_history_lab")or os.environ.get("PGUSER")!="postgres":
  raise RuntimeError("Refusing endpoint outside fresh isolated local history lab")
 paths=[
  "supabase/tests/learning_progress_reset/lab-setup.sql",
  "supabase/migrations/20261030000000_learning_progress_reset_epoch.sql",
  "supabase/tests/learning_progress_history/lab-setup.sql",
  "supabase/migrations/20261030010000_learning_progress_history_separation.sql",
  "supabase/tests/learning_progress_history/lab-tests.sql",
  "supabase/tests/learning_progress_history/run-native-lab.py",
  ".github/workflows/learning-progress-history-native.yml"]
 sources=[]
 for rel in paths:
  p=(root/rel).resolve()
  p.relative_to(root)
  raw=p.read_bytes()
  meta={"path":rel,"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)}
  sources.append((raw,meta));proof["sources"].append(meta)
 if sources[1][1]["sha256"]!="9c7e2ce70a42f739614f2f5b84828ab4f930aba5a53c5fd3a1f16a36f76db48b":
  raise RuntimeError("Frozen655 source changed")
 if args.expected_migration_sha and sources[3][1]["sha256"]!=args.expected_migration_sha:
  raise RuntimeError("656 source differs from reviewed freeze")
 (out/"source-manifest.json").write_text(json.dumps(proof["sources"],indent=2)+"\n",encoding="utf-8")
 with psycopg.connect(host=host,port=int(os.environ.get("PGPORT","5432")),dbname=db,user="postgres",
  password=os.environ.get("PGPASSWORD",""),connect_timeout=5,autocommit=True,application_name="lpr-history-native")as conn:
  version,num,owner=conn.execute("SELECT version(),current_setting('server_version_num')::integer,current_user").fetchone()
  proof["postgresVersion"]=version
  if not 170000<=num<180000 or "wasm"in version.lower()or owner!="postgres":raise RuntimeError("Native PostgreSQL17 required")
  if conn.execute("SELECT count(*)FROM pg_catalog.pg_tables WHERE schemaname='public'").fetchone()[0]!=0:
   raise RuntimeError("Refusing nonempty database")
  labels=[]
  log=None
  def notice(diag):
   message=diag.message_primary or""
   if log:log.write((diag.severity or"NOTICE")+": "+message+"\n")
   if message.startswith("PASS: "):labels.append(message[6:])
  conn.add_notice_handler(notice)
  for n,(raw,meta)in enumerate(sources[:5],1):
   before=len(labels)
   stage={"path":meta["path"],"sha256":meta["sha256"],"status":"RUNNING"}
   proof["stages"].append(stage);save()
   with(out/("stage-"+str(n)+".stdout.txt")).open("w",encoding="utf-8")as stage_log:
    log=stage_log
    cur=conn.execute(raw.decode("utf-8"),prepare=False)
    statements=0
    while True:
     statements+=1;log.write((cur.statusmessage or"UNKNOWN")+"\n")
     if not cur.nextset():break
    log=None
   stage.update(status="PASS",statements=statements,assertions=len(labels)-before)
   print(json.dumps(stage),flush=True)
  proof["assertions"]=len(labels);proof["assertionLabels"]=labels
  if len(labels)!=76:raise RuntimeError("Expected exactly76 reviewed history regression cases, got "+str(len(labels)))
  if conn.execute("SELECT count(*)FROM public.enrollments").fetchone()[0]!=0:
   raise RuntimeError("Fixture transaction was not rolled back")
 proof["status"]="PASS";save()
 print(json.dumps({"status":"PASS","assertions":len(labels),"proofPath":str((out/"native-proof.json").relative_to(root))}),flush=True)
except BaseException as exc:
 proof["status"]="FAIL";proof["failure"]={"type":type(exc).__name__,"sqlstate":getattr(exc,"sqlstate",None),"message":str(exc).splitlines()[0]};save()
 print(json.dumps(proof["failure"]),file=sys.stderr,flush=True)
 raise
