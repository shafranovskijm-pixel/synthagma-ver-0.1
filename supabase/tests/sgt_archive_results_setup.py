"""Build isolated SQL fixtures from checked-in function definitions; never connects to a DB."""
import re
import sys
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
output = Path(sys.argv[1]).resolve()
if output.drive.lower() != 'd:':
    raise SystemExit('Fixture output must remain on D:')
parts = [(root / 'supabase/tests/sgt_multigroup_fixture.sql').read_text(encoding='utf-8')]

def function(file, name):
    source = (root / 'supabase/migrations' / file).read_text(encoding='utf-8')
    start = source.index('CREATE OR REPLACE FUNCTION public.' + name + '(') if ('CREATE OR REPLACE FUNCTION public.' + name + '(') in source else source.index('CREATE OR REPLACE FUNCTION public.' + name + '\n')
    tail = source[start:]
    match = re.search(r'\bAS\s+(\$[A-Za-z_]*\$)', tail)
    if not match:
        raise ValueError(name)
    end = tail.index(match[1] + ';', match.end()) + len(match[1]) + 1
    parts.append(tail[:end])

parts.append('''
CREATE FUNCTION public.can_access_course(p_course uuid, p_permission text) RETURNS boolean LANGUAGE sql STABLE AS
 $$ SELECT public.can_access_organization((SELECT organization_id FROM courses WHERE id=p_course),p_permission) $$;
CREATE TABLE public.lessons(id uuid PRIMARY KEY, course_id uuid, title text, type text, order_index integer, test_passing_score integer, test_max_attempts integer);
CREATE TABLE public.test_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,lesson_id uuid,score integer,max_score integer,passed boolean,passing_score integer,completed_at timestamptz);
CREATE TABLE public.course_manual_credits(id uuid DEFAULT gen_random_uuid(),enrollment_id uuid,credited_at timestamptz,credited_by uuid,revoked_at timestamptz);
''')
function('20260822122025_6be7e00b-82ec-44a9-8476-fac0e09cdd0c.sql', 'is_org_owner')
function('20260729092507_1963e085-8e9c-4a15-8b5f-69b86e0f6bf8.sql', 'is_student_profile')
parts.append((root / 'supabase/migrations/20260512003552_9f4c2c5b-2a87-4ff7-9de8-7759c1c7b23f.sql').read_text(encoding='utf-8'))
for name in ['get_organization_students_page','get_organization_students_counts','get_organization_student_group_counts']:
    function('20260728091917_1f5084b9-10aa-4afd-ba19-6d3ab8e5a0d7.sql',name)
for name in ['get_organization_dashboard_summary','get_organization_course_overview']:
    function('20260729050631_20b3d3b0-b017-424f-85dc-f5041c8fa6a3.sql',name)
function('20260728082057_30b03430-7cf8-40cf-98b1-177ed1a5be26.sql','get_course_students_page')
function('20260728084747_3bef5dbb-48ac-48c8-a344-2faad90ef295.sql','get_course_students_stats')
function('20260907120001_course_manual_credits.sql','get_course_student_test_results_page')
function('20261001130000_sgt_multigroup_memberships.sql','get_organization_student_group_counts')
parts.append('''CREATE VIEW public.student_group_memberships_effective AS
 SELECT organization_id, user_id, student_group_id AS group_id FROM profiles WHERE student_group_id IS NOT NULL;''')
if len(sys.argv) > 2:
    definitions = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8-sig'))
    if len(definitions) != 8 or len({item['name'] for item in definitions}) != 8:
        raise ValueError('Expected the eight reviewed production functions')
    parts.extend(item['definition'].rstrip().rstrip(';') + ';' for item in definitions)
parts.extend((root / 'supabase/migrations' / file).read_text(encoding='utf-8') for file in [
 '20261007100000_student_archive_removal.sql', '20261007101000_student_learning_results.sql'])
parts.append('GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;')
output.write_text('\n\n'.join(parts),encoding='utf-8')
print(output)
