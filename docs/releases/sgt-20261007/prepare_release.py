"""Produce a guarded, exact-source release from reviewed live function backups."""
import hashlib
import json
import re
import sys
from pathlib import Path

folder = Path(__file__).resolve().parent
root = folder.parents[2]
backup = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
norm = lambda text: text.replace('\r\n', '\n')
md5 = lambda text: hashlib.md5(norm(text).encode()).hexdigest()
sqlstr = lambda text: "'" + text.replace("'", "''") + "'"
sources = []
for name in ['20261007100000_student_archive_removal', '20261007101000_student_learning_results']:
    text = norm((root / 'supabase/migrations' / (name + '.sql')).read_text(encoding='utf-8'))
    version, label = name.split('_', 1)
    sources.append((version, label, text))

def body(text):
    match = re.search(r'\bAS\s+(\$[A-Za-z_]*\$)', text)
    return text[match.end():text.index(match[1], match.end())]

signatures = {
 'get_organization_students_page': 'uuid,integer,integer,text,uuid,text,text,text,text',
 'get_organization_students_counts': 'uuid', 'get_organization_student_group_counts': 'uuid',
 'get_organization_dashboard_summary': 'uuid', 'get_organization_course_overview': 'uuid',
 'get_course_student_test_results_page': 'uuid,integer,integer,text,text,text',
 'get_course_students_page': 'uuid,integer,integer,text,text', 'get_course_students_stats': 'uuid',
}
if {item['name'] for item in backup} != set(signatures):
    raise ValueError('The release requires exactly the eight reviewed functions')
expected_old = []
expected_new = []
for item in backup:
    signature = 'public.' + item['name'] + '(' + signatures[item['name']] + ')'
    definition = norm(item['definition'])
    expected_old.append((signature, md5(definition)))
    if item['name'].startswith('get_organization_'):
        old = 'p.organization_id = p_organization_id'
        new = old + ' AND NOT EXISTS (SELECT 1 FROM public.student_roster_removals srr WHERE srr.organization_id = p_organization_id AND srr.user_id = p.user_id)'
    else:
        old = 'WHERE e.course_id = p_course_id'
        new = old + ' AND NOT EXISTS (SELECT 1 FROM public.student_roster_removals srr WHERE srr.organization_id = v_org AND srr.user_id = e.user_id)'
    if old not in definition or 'student_roster_removals' in definition:
        raise ValueError('Unreviewed definition: ' + signature)
    expected_new.append((signature, md5(body(definition.replace(old, new)))))

new_signatures = ['public.set_archived_student_removed(uuid,uuid,boolean)', 'public.get_student_learning_results(uuid,uuid)']
expected_new.extend((sig, md5(body(text))) for sig, (_, _, text) in zip(new_signatures, sources))
rows = lambda data: ',\n '.join('(' + ','.join(sqlstr(value) for value in row) + ')' for row in data)
columns = [('profiles','user_id','uuid'),('profiles','organization_id','uuid'),('profiles','archived_at','timestamp with time zone'),
 ('profiles','full_name','text'),('profiles','email','text'),('profiles','login','text'),
 ('org_staff','user_id','uuid'),('org_staff','organization_id','uuid'),('org_staff','expires_at','timestamp with time zone'),
 ('courses','id','uuid'),('courses','organization_id','uuid'),('courses','title','text'),
 ('enrollments','id','uuid'),('enrollments','user_id','uuid'),('enrollments','course_id','uuid'),('enrollments','progress','integer'),
 ('enrollments','status','text'),('enrollments','started_at','timestamp with time zone'),('enrollments','completed_at','timestamp with time zone'),('enrollments','time_spent','integer'),
 ('lessons','id','uuid'),('lessons','course_id','uuid'),('lessons','type','text'),('lessons','title','text'),('lessons','order_index','integer'),('lessons','test_passing_score','integer'),
 ('test_attempts','id','uuid'),('test_attempts','user_id','uuid'),('test_attempts','lesson_id','uuid'),('test_attempts','score','integer'),('test_attempts','max_score','integer'),('test_attempts','passing_score','integer'),('test_attempts','passed','boolean'),('test_attempts','completed_at','timestamp with time zone'),
 ('course_manual_credits','enrollment_id','uuid'),('course_manual_credits','credited_at','timestamp with time zone'),('course_manual_credits','revoked_at','timestamp with time zone'),
 ('student_deletion_log','student_id','uuid'),('student_deletion_log','organization_id','uuid'),('student_deletion_log','deleted_by','uuid'),('student_deletion_log','metadata','jsonb')]
pre = f'''WITH expected_functions(signature,expected_md5) AS (VALUES {rows(expected_old)}),
required_columns(table_name,column_name,type_name) AS (VALUES {rows(columns)}),
checks(check_name,ok) AS (
 SELECT 'exact live definition: '||signature, COALESCE(md5(replace(pg_get_functiondef(to_regprocedure(signature)),chr(13)||chr(10),chr(10)))=expected_md5,false) FROM expected_functions
 UNION ALL SELECT 'function ownership: '||e.signature,COALESCE(pg_has_role(current_user,p.proowner,'USAGE'),false) FROM expected_functions e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 UNION ALL SELECT 'column: '||r.table_name||'.'||r.column_name,EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||r.table_name) AND a.attname=r.column_name AND a.attnum>0 AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)=r.type_name) FROM required_columns r
 UNION ALL SELECT 'required helpers',NOT EXISTS(SELECT 1 FROM (VALUES ('auth.uid()'),('public.has_role(uuid,public.app_role)'),('public.is_org_owner(uuid,uuid)'),('public.is_student_profile(uuid,uuid)'),('public.has_org_staff_permission(uuid,uuid,text)')) f(signature) WHERE to_regprocedure(signature) IS NULL)
 UNION ALL SELECT 'public schema create',has_schema_privilege(current_user,'public','CREATE')
 UNION ALL SELECT 'organizations reference permission',has_table_privilege(current_user,'public.organizations','REFERENCES')
 UNION ALL SELECT 'ledger access',has_table_privilege(current_user,'supabase_migrations.schema_migrations','SELECT') AND has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT')
 UNION ALL SELECT 'both ledger rows absent',NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20261007100000','20261007101000'))
 UNION ALL SELECT 'marker table absent',to_regclass('public.student_roster_removals') IS NULL
 UNION ALL SELECT 'new RPCs absent',to_regprocedure('{new_signatures[0]}') IS NULL AND to_regprocedure('{new_signatures[1]}') IS NULL
)'''
post = f'''WITH expected_bodies(signature,expected_md5) AS (VALUES {rows(expected_new)}),
new_functions AS (SELECT * FROM pg_proc WHERE oid IN (to_regprocedure('{new_signatures[0]}'),to_regprocedure('{new_signatures[1]}'))),
checks(check_name,ok) AS (
 SELECT 'exact RPC body: '||e.signature,COALESCE(md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=e.expected_md5,false) FROM expected_bodies e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 UNION ALL SELECT 'marker RLS',COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.student_roster_removals')),false)
 UNION ALL SELECT 'no direct authenticated marker writes',NOT has_table_privilege('authenticated','public.student_roster_removals','INSERT,UPDATE,DELETE')
 UNION ALL SELECT 'no anon marker access',NOT has_table_privilege('anon','public.student_roster_removals','SELECT,INSERT,UPDATE,DELETE')
 UNION ALL SELECT 'new RPC security definer and fixed path',count(*)=2 AND bool_and(prosecdef AND proconfig @> ARRAY['search_path=public, pg_temp']) FROM new_functions
 UNION ALL SELECT 'new RPC authenticated execute',count(*)=2 AND bool_and(has_function_privilege('authenticated',oid,'EXECUTE')) FROM new_functions
 UNION ALL SELECT 'new RPC anon denied',count(*)=2 AND bool_and(NOT has_function_privilege('anon',oid,'EXECUTE')) FROM new_functions
 UNION ALL SELECT 'new RPC PUBLIC denied',NOT EXISTS(SELECT 1 FROM new_functions f,LATERAL aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
'''
for version, label, text in sources:
    post += f" UNION ALL SELECT 'exact ledger: {version}',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='{version}' AND name='{label}' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='{md5(text)}')\n"
post += ')'
(folder / 'preflight.sql').write_text(pre + '\nSELECT current_user AS executor,check_name,ok FROM checks ORDER BY check_name;\n',encoding='utf-8')
(folder / 'postcheck.sql').write_text(post + '\nSELECT check_name,ok FROM checks ORDER BY check_name;\n',encoding='utf-8')
wrapper = '''-- S041 only. Both exact source migrations are atomic; no learner rows are removed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $s041_release$
DECLARE v_failures text;
'''
for index, (_, _, text) in enumerate(sources):
    wrapper += f' v_source_{index} text := $s041_source_{index}$' + text + f'$s041_source_{index}$;\n'
wrapper += 'BEGIN\n'
for index, (_, _, text) in enumerate(sources):
    wrapper += f" IF md5(replace(v_source_{index},chr(13)||chr(10),chr(10)))<>'{md5(text)}' THEN RAISE EXCEPTION 'S041 embedded source {index} changed'; END IF;\n"
wrapper += pre + "\nSELECT string_agg(check_name,', ' ORDER BY check_name) INTO v_failures FROM checks WHERE ok IS DISTINCT FROM true;\nIF v_failures IS NOT NULL THEN RAISE EXCEPTION 'S041 preconditions failed: %',v_failures; END IF;\n"
for index, (version, label, _) in enumerate(sources):
    wrapper += f" EXECUTE v_source_{index};\n INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('{version}','{label}',ARRAY[v_source_{index}]);\n"
wrapper += post + "\nSELECT string_agg(check_name,', ' ORDER BY check_name) INTO v_failures FROM checks WHERE ok IS DISTINCT FROM true;\nIF v_failures IS NOT NULL THEN RAISE EXCEPTION 'S041 postconditions failed: %',v_failures; END IF;\nEND;\n$s041_release$;\nNOTIFY pgrst,'reload schema';\nCOMMIT;\n"
(folder / 'release-transaction.sql').write_text(wrapper,encoding='utf-8')
(folder / 'source-hashes.json').write_text(json.dumps({version: {'name': label, 'normalized_md5': md5(text), 'sha256': hashlib.sha256(text.encode()).hexdigest()} for version, label, text in sources},indent=2)+'\n',encoding='utf-8')
print('Prepared preflight.sql, release-transaction.sql, postcheck.sql, source-hashes.json')
