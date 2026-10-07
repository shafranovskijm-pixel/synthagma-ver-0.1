"""Build an isolated S-042 fixture from read-only schema evidence (no DB connection).
Arguments: preflight.json supplement.json output.sql. Output must remain on D:.
The fixture preserves public columns, NOT NULL and all public foreign keys. It
uses harmless defaults for required values, does not recreate production data,
network/cron triggers, platform secrets or extensions. Targeted real trigger
bodies and tripwires below make the preservation/access tests meaningful.
"""
from pathlib import Path
import json,re,sys
root=Path(__file__).resolve().parents[2]
a=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
s=json.loads(Path(sys.argv[2]).read_text(encoding='utf-8-sig'))
out=Path(sys.argv[3]).resolve()
if out.drive.lower()!='d:':raise SystemExit('D: output required')
parts=['''DO $roles$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE authenticator; CREATE ROLE service_role BYPASSRLS; END IF; END; $roles$;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub' $$;
'''.replace("SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'", "SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid"),
'''CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text NOT NULL,name text NOT NULL,owner uuid,owner_id text,updated_at timestamptz DEFAULT now(),UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_storage_self ON storage.objects TO authenticated USING(owner=auth.uid()) WITH CHECK(owner=auth.uid());
''']
known={'uuid','text','integer','bigint','smallint','boolean','jsonb','json','date','time without time zone','timestamp with time zone','timestamp without time zone','double precision','real','bytea','inet'}
def typefix(t):
 base=t.removesuffix('[]')
 return t if base in known or base.startswith(('numeric','character varying','character(')) else 'text'
def default(t):
 if t.endswith('[]'):return "'{}'"
 if t=='uuid':return 'gen_random_uuid()'
 if t in ('json','jsonb'):return "'{}'"
 if t=='boolean':return 'false'
 if t in ('integer','bigint','smallint','double precision','real') or t.startswith('numeric'):return '0'
 if t.startswith('timestamp'):return 'now()'
 if t=='date':return 'current_date'
 if t.startswith('time '):return "'00:00:00'"
 if t=='bytea':return "''::bytea"
 if t=='inet':return "'127.0.0.1'::inet"
 return "''"
tables={t['table']:t for t in s['all_public_columns']}
for name,t in tables.items():
 defs=[]
 for c in t['columns']:
  ct=typefix(c['type']); nn=c['notNull']
  defs.append('"'+c['name']+'" '+ct+(' NOT NULL DEFAULT '+default(ct) if nn else ''))
 parts.append('CREATE TABLE public."'+name+'"('+','.join(defs)+');\nALTER TABLE public."'+name+'" ENABLE ROW LEVEL SECURITY;')
# Add target uniqueness before foreign keys; retain audited FK actions.
unique=set()
fks=[]
for fk in a['foreign_keys']:
 if fk['from_schema']!='public':continue
 definition=fk['definition']; target=fk['to_table']; schema=fk['to_schema']
 m=re.search(r'REFERENCES [^(]+\(([^)]+)\)',definition)
 if not m:raise ValueError(definition)
 if schema=='public':unique.add((target,m.group(1)))
 if schema in ('public','auth'):fks.append(fk)
# Public root IDs are unique in production (the input captured foreign keys,
# not every PK). Fixture duplicates would otherwise weaken row-count tests.
for name,t in tables.items():
 if any(c['name']=='id' for c in t['columns']):unique.add((name,'id'))
for i,(table,columns) in enumerate(sorted(unique)):
 parts.append(f'ALTER TABLE public."{table}" ADD CONSTRAINT fixture_unique_{i} UNIQUE({columns});')
for fk in fks:parts.append('ALTER TABLE public."'+fk['from_table']+'" ADD CONSTRAINT "'+fk['name']+'" '+fk['definition']+';')
for f in a['ownership_functions']:
 if f['name']=='is_org_owner':parts.append(f['definition'].replace('::public.app_role','::text').rstrip().rstrip(';')+';')
# A regression in history identity/status editing aborts, rather than merely
# asserting that a mock was called. Actual production has stricter 15 triggers.
parts.append('''CREATE FUNCTION fixture_no_learning_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Do not rewrite enrollment identity/progress/history'; END; $$;
CREATE TRIGGER fixture_learning_tripwire BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION fixture_no_learning_rewrite();
CREATE POLICY fixture_profile_self ON public.profiles TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY fixture_attempt_self ON public.test_attempts TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public,storage TO authenticated,service_role;
''')
# Optional exact live trigger definitions, never guessed from their names.
if len(sys.argv)>4:
 history=json.loads(Path(sys.argv[4]).read_text(encoding='utf-8-sig'))
 if isinstance(history,dict):history=history.get('functions',history.get('rows',[]))
 for f in history:
  parts.append(f['definition'].rstrip().rstrip(';')+';')
 parts.append("CREATE TRIGGER group_completion_history_immutable BEFORE UPDATE OR DELETE ON public.group_completion_decision_history FOR EACH ROW EXECUTE FUNCTION public.protect_group_completion_history();")
 parts.append("CREATE TRIGGER group_completion_decision_audit AFTER INSERT OR UPDATE ON public.group_completion_decisions FOR EACH ROW EXECUTE FUNCTION public.audit_group_completion_decision();")
 parts.append("CREATE TRIGGER zzzz_csz_homework_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.homework_submissions FOR EACH ROW EXECUTE FUNCTION public.csz_guard_homework_submission();")
for f in s['function_definitions']:
 if f['name'] in ('log_enrollment_change','auto_audit_log','log_org_staff_changes'):
  parts.append(f['definition'].rstrip().rstrip(';')+';')
parts.append("CREATE TRIGGER on_enrollment_delete AFTER DELETE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.log_enrollment_change();")
parts.append("CREATE TRIGGER audit_profiles AFTER DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.auto_audit_log();")
parts.append("CREATE TRIGGER trg_log_org_staff_changes AFTER DELETE ON public.org_staff FOR EACH ROW EXECUTE FUNCTION public.log_org_staff_changes();")
if len(sys.argv)>5:
 progress=json.loads(Path(sys.argv[5]).read_text(encoding='utf-8-sig'))
 if isinstance(progress,dict):progress=progress.get('functions',progress.get('rows',[]))
 for f in progress:parts.append(f['definition'].rstrip().rstrip(';')+';')
 parts.append("CREATE TRIGGER trg_recalc_enrollment_progress AFTER DELETE ON public.lesson_progress FOR EACH ROW EXECUTE FUNCTION public.recalc_enrollment_progress();")
 parts.append("CREATE TRIGGER zzzz_csz_lesson_progress_guard BEFORE DELETE ON public.lesson_progress FOR EACH ROW EXECUTE FUNCTION public.csz_guard_lesson_progress();")
if '--schema-only' not in sys.argv:
 parts.append((root/'supabase/migrations/20261007160000_self_account_deletion.sql').read_text(encoding='utf-8'))
out.write_text('\n\n'.join(parts),encoding='utf-8')
print(out)
