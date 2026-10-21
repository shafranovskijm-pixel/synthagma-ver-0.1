-- UC013 generic HTML: all validated planned lessons; four-date client Word
-- remains strict. No backfill, artifact rewrite, RLS, ACL or ownership changes.
DO $uc_generic_calendar_preflight$
DECLARE v_proc pg_proc%ROWTYPE;
BEGIN
 SELECT p.* INTO v_proc FROM pg_proc p WHERE p.oid=to_regprocedure('public.uc_group_education_validate_artifact(jsonb)');
 IF v_proc.oid IS NULL OR md5(v_proc.prosrc)NOT IN('88961556ea23c95ea25b1fd1ca838cf9','622611f5109cb0843d2b49ef25a9b1c5')
 OR(md5(v_proc.prosrc)='88961556ea23c95ea25b1fd1ca838cf9'AND md5(pg_get_functiondef(v_proc.oid))<>'e26fda60fe424fe09bdd0e2f3fbfdd6d')
 OR pg_get_userbyid(v_proc.proowner)<>'postgres'OR v_proc.proacl::text IS DISTINCT FROM '{postgres=X/postgres}'
 OR v_proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
 OR NOT v_proc.prosecdef OR v_proc.provolatile<>'v'OR v_proc.prorettype<>'void'::regtype OR v_proc.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
 THEN RAISE EXCEPTION 'UC013_GENERIC_CALENDAR_EXPECTED_CURRENT_VALIDATOR_CHANGED';END IF;
END;$uc_generic_calendar_preflight$;

CREATE OR REPLACE FUNCTION public.uc_group_education_validate_artifact(p_row jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE org uuid:=(p_row->>'organization_id')::uuid;grp uuid:=(p_row->>'group_id')::uuid;vs jsonb:=p_row->'variables_snapshot';src jsonb:=vs->'education_source';s public.uc_group_roster_snapshots;c public.uc_group_calendar_versions;page jsonb;header jsonb;expected_source jsonb;expected_students jsonb;expected_ids jsonb;facts jsonb;cal jsonb;canonical jsonb;rendered jsonb;vars jsonb:=coalesce(p_row->'variables','{}');k text;v jsonb;l jsonb;teacher uuid;teacher_label text;clock_value text;uniform text;parts text[];accounts uuid[];i integer:=0;item jsonb;row_item jsonb;period text;group_label text;student_count integer;form text;notice constant text:='Word-бланк отображает четыре даты и общие поля; полный поурочный план сохранён в источнике. Имена — отдельно наблюдённые отображаемые подписи, не подтверждённые юридические имена.';generic_notice constant text:='Подтверждённый состав и полный поурочный план сохранены в источнике. Отметки посещаемости и результаты не подставляются из прохождения курса. Имена — отдельно наблюдённые отображаемые подписи, не подтверждённые юридические имена.';word_layout boolean;four_date_projection boolean;lesson_count integer;hours_sum numeric:=0;teacher_ids uuid[]:='{}';teacher_labels text[]:='{}';clock_values text[]:='{}';clock_uniform boolean:=true;teacher_current uuid;teacher_current_label text;teacher_current_index integer;previous_lesson_key text:='';lesson_key text;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_group_education_actor_allowed(auth.uid(),org,grp,false)OR NOT public.uc_group_education_actor_allowed(auth.uid(),org,grp,true)THEN PERFORM public.uc_group_education_error('ACCESS_DENIED');END IF;
 IF p_row->>'doc_type'NOT IN('class_journal','enrollment_order','expulsion_order','student_list','schedule','attestation_sheet','registration_book','title_page','pass')OR p_row->>'doc_status'IS DISTINCT FROM'draft'OR p_row->'document_number'IS DISTINCT FROM'null'::jsonb OR p_row->>'student_user_id'IS NOT NULL THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 -- Stored format selects validation; generic HTML cannot carry private DOCX metadata.
 IF p_row->>'layout_format' IS NULL OR p_row->>'layout_format' NOT IN('docx_ooxml','legacy_html')THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 word_layout:=p_row->>'layout_format'='docx_ooxml';
 IF NOT word_layout AND vs->>'education_source_notice'=generic_notice AND(p_row->>'file_path' IS NOT NULL OR p_row->>'docx_sha256' IS NOT NULL)THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 -- Old generic four-date artifacts keep their exact original strict projection.
 four_date_projection:=word_layout OR vs->>'education_source_notice'=notice;
 IF NOT public.uc_admission_shape(src,ARRAY['schema_version','snapshot_id','source_hash','roster_hash','calendar_version_id','calendar_hash','as_of','timezone','knowledge_revision','coverage_segment_id'])OR src->>'schema_version'<>'1'OR NOT public.uc_admission_uuid(src->'snapshot_id')THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 IF jsonb_typeof(vs)IS DISTINCT FROM'object'OR EXISTS(SELECT 1 FROM jsonb_object_keys(vs)AS keys(key_name)WHERE NOT key_name=ANY(ARRAY['education_source','education_calendar','education_source_notice','education_lesson_ids','program_facts','student_user_ids','students','scalars','rows','signatory_source','fidelity_status','attendance_source']))THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 SELECT * INTO s FROM public.uc_group_roster_snapshots WHERE id=(src->>'snapshot_id')::uuid AND organization_id=org AND group_id=grp;IF NOT FOUND THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
 SELECT * INTO c FROM public.uc_group_calendar_versions WHERE id=s.calendar_version_id;
 SELECT coalesce(array_agg(DISTINCT u ORDER BY u),'{}')INTO accounts FROM(SELECT(x->>'user_id')::uuid u FROM jsonb_array_elements(s.roster_rows)x UNION SELECT(x->>'teacher_user_id')::uuid FROM jsonb_array_elements(c.lessons)x)q WHERE u IS NOT NULL;
 PERFORM public.uc_group_education_lock(org,grp,accounts,NULL,false);
 SELECT x.* INTO s FROM public.uc_group_roster_snapshots x WHERE x.id=s.id FOR SHARE NOWAIT;
 SELECT * INTO c FROM public.uc_group_calendar_versions WHERE id=s.calendar_version_id FOR SHARE NOWAIT;
 page:=public.uc_group_education_snapshot_page(org,grp,s.id,NULL,100);header:=page->'header';IF NOT(header->>'available')::boolean OR s.purpose<>'document_batch'OR c.redacted THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
 expected_source:=jsonb_build_object('schema_version',1,'snapshot_id',s.id,'source_hash',s.source_hash,'roster_hash',s.roster_hash,'calendar_version_id',s.calendar_version_id,'calendar_hash',s.calendar_hash,'as_of',s.as_of,'timezone',s.timezone,'knowledge_revision',s.knowledge_revision,'coverage_segment_id',s.coverage_segment_id);
 IF src IS DISTINCT FROM expected_source OR vs->'program_facts'IS DISTINCT FROM s.program_proof OR vs->'education_calendar'IS DISTINCT FROM page->'artifact_projection'->'calendar'OR (CASE WHEN word_layout THEN vs->>'education_source_notice'IS DISTINCT FROM notice ELSE coalesce(vs->>'education_source_notice'NOT IN(notice,generic_notice),true)END) THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 cal:=page->'artifact_projection'->'calendar';facts:=s.program_proof->'facts_snapshot';
 lesson_count:=jsonb_array_length(c.lessons);
 IF c.published_at IS NULL OR c.coverage<>'whole_program'OR c.partial_reason IS NOT NULL OR lesson_count NOT BETWEEN 1 AND 250 OR(four_date_projection AND lesson_count<>4)OR c.missing_hours_count<>0 OR c.known_academic_hours_total<>(facts->>'academic_hours')::numeric OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.lessons)x WHERE x->>'status'<>'planned'OR x->'teacher_user_id'='null'OR x->>'teacher_label_state'<>'available')THEN PERFORM public.uc_group_education_error('TEMPLATE_INCOMPATIBLE');END IF;
 IF(SELECT count(DISTINCT x->>'lesson_id')FROM jsonb_array_elements(c.lessons)x)<>lesson_count THEN PERFORM public.uc_group_education_error('TEMPLATE_INCOMPATIBLE');END IF;
 teacher:=(c.lessons->0->>'teacher_user_id')::uuid;teacher_label:=c.lessons->0->>'teacher_label';
 FOR l IN SELECT x FROM jsonb_array_elements(c.lessons)x LOOP
  IF NOT public.uc_admission_uuid(l->'teacher_user_id')OR nullif(l->>'teacher_label','')IS NULL OR l->'teacher_label_observed_at'='null'OR l->'teacher_label_source'='null'OR coalesce(l->>'teacher_source_hash','')!~'^[a-f0-9]{64}$'OR(l->'teacher_label_source'->>'kind'='authorized_current_profile'AND l->'teacher_label_source'->>'subject_user_id'IS DISTINCT FROM l->>'teacher_user_id')THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
  teacher_current:=(l->>'teacher_user_id')::uuid;teacher_current_label:=l->>'teacher_label';
  IF NOT public.uc_group_education_teacher_allowed(teacher_current,org,grp)THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
  IF four_date_projection AND(teacher_current<>teacher OR teacher_current_label IS DISTINCT FROM teacher_label)THEN PERFORM public.uc_group_education_error('TEMPLATE_INCOMPATIBLE');END IF;
  teacher_current_index:=array_position(teacher_ids,teacher_current);
  IF teacher_current_index IS NULL THEN teacher_ids:=array_append(teacher_ids,teacher_current);teacher_labels:=array_append(teacher_labels,teacher_current_label);
  ELSIF teacher_labels[teacher_current_index]IS DISTINCT FROM teacher_current_label THEN PERFORM public.uc_group_education_error('TEMPLATE_INCOMPATIBLE');END IF;
  IF coalesce(l->>'academic_hours','')!~'^(0|[1-9][0-9]*)([.][0-9]{1,2})?$'OR(l->>'academic_hours')::numeric<=0 OR(l->>'academic_hours')::numeric>10000 THEN PERFORM public.uc_group_education_error('TEMPLATE_INCOMPATIBLE');END IF;
  hours_sum:=hours_sum+(l->>'academic_hours')::numeric;
  lesson_key:=(l->>'local_date')||'|'||coalesce(l->>'starts_at','~')||'|'||(l->>'lesson_id');
  IF(previous_lesson_key<>''AND lesson_key<=previous_lesson_key)OR(l->>'local_date')::date NOT BETWEEN c.planned_start_date AND c.planned_end_date OR((l->>'starts_at')IS NULL)IS DISTINCT FROM((l->>'ends_at')IS NULL)THEN PERFORM public.uc_group_education_error('TEMPLATE_INCOMPATIBLE');END IF;previous_lesson_key:=lesson_key;
  IF l->>'starts_at'IS NOT NULL AND((l->>'ends_at')::timestamptz<=(l->>'starts_at')::timestamptz OR(l->>'ends_at')::timestamptz-(l->>'starts_at')::timestamptz>interval'24 hours'OR((l->>'starts_at')::timestamptz AT TIME ZONE c.timezone)::date<>(l->>'local_date')::date)THEN PERFORM public.uc_group_education_error('TEMPLATE_INCOMPATIBLE');END IF;
  clock_value:='';IF l->'starts_at'<>'null'THEN
   clock_value:=to_char((l->>'starts_at')::timestamptz AT TIME ZONE c.timezone,'HH24:MI')||CASE WHEN extract(second FROM(l->>'starts_at')::timestamptz AT TIME ZONE c.timezone)<>0 THEN to_char((l->>'starts_at')::timestamptz AT TIME ZONE c.timezone,':SS')ELSE''END||'–'||to_char((l->>'ends_at')::timestamptz AT TIME ZONE c.timezone,'HH24:MI')||CASE WHEN extract(second FROM(l->>'ends_at')::timestamptz AT TIME ZONE c.timezone)<>0 THEN to_char((l->>'ends_at')::timestamptz AT TIME ZONE c.timezone,':SS')ELSE''END||CASE WHEN((l->>'ends_at')::timestamptz AT TIME ZONE c.timezone)::date>(l->>'local_date')::date THEN' (+1 день)'ELSE''END;
  END IF;
  IF uniform IS NOT NULL AND clock_value<>uniform THEN IF four_date_projection THEN PERFORM public.uc_group_education_error('TEMPLATE_INCOMPATIBLE');END IF;clock_uniform:=false;END IF;
  IF uniform IS NULL THEN uniform:=clock_value;END IF;clock_values:=array_append(clock_values,clock_value);
 END LOOP;
 IF hours_sum<>c.known_academic_hours_total OR hours_sum<>(facts->>'academic_hours')::numeric THEN PERFORM public.uc_group_education_error('TEMPLATE_INCOMPATIBLE');END IF;
 IF NOT four_date_projection THEN teacher_label:=array_to_string(teacher_labels,'; ');IF NOT clock_uniform THEN uniform:='';END IF;END IF;
 SELECT coalesce(jsonb_agg(x->'user_id'ORDER BY x->>'user_id'),'[]'),coalesce(jsonb_agg(jsonb_build_object('row_number',n,'user_id',x->'user_id','full_name',x->'subject_label','label_observed_at',x->'label_observed_at','label_source',x->'label_source')ORDER BY x->>'user_id'),'[]')INTO expected_ids,expected_students FROM jsonb_array_elements(s.roster_rows)WITH ORDINALITY t(x,n);
 IF vs->'student_user_ids'IS DISTINCT FROM expected_ids OR vs->'students'IS DISTINCT FROM expected_students OR vs->'education_lesson_ids'IS DISTINCT FROM(SELECT jsonb_agg(x->'lesson_id'ORDER BY n)FROM jsonb_array_elements(c.lessons)WITH ORDINALITY t(x,n))THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 form:=CASE facts->>'training_form'WHEN'full_time'THEN'Очная'WHEN'part_time'THEN'Заочная'WHEN'mixed'THEN'Очно-заочная'END;
 period:=to_char(c.planned_start_date,'DD.MM.YYYY')||' — '||to_char(c.planned_end_date,'DD.MM.YYYY');student_count:=jsonb_array_length(s.roster_rows);
 group_label:='Программа «'||(facts->>'full_title')||'»'||CASE WHEN coalesce(s.program_proof->'group_snapshot'->>'name','')<>''THEN'; группа «'||(s.program_proof->'group_snapshot'->>'name')||'»'ELSE''END||'; срок обучения '||period;
 canonical:=public.uc_program_render_scalars(facts,jsonb_build_object('name',s.program_proof->'group_snapshot'->'name','start_date',c.planned_start_date,'end_date',c.planned_end_date,'training_dates',(SELECT jsonb_agg(x->'local_date'ORDER BY n)FROM jsonb_array_elements(c.lessons)WITH ORDINALITY t(x,n)),'schedule_text',uniform,'instructor_name',teacher_label))||jsonb_build_object('PROGRAM_TITLE',facts->'full_title','PROGRAM_HOURS',facts->>'academic_hours','PROGRAM_FORM',form,'INSTRUCTOR_NAME',teacher_label,'INSTRUCTOR_SHORT',public.uc_group_education_short_name(teacher_label),'INSTRUCTOR_1_SHORT',public.uc_group_education_short_name(teacher_label),'INSTRUCTOR_2_SHORT','','STUDENTS_COUNT',student_count::text);
 IF four_date_projection THEN
 FOR i IN 1..4 LOOP canonical:=canonical||jsonb_build_object('DATE_'||i,to_char((c.lessons->(i-1)->>'local_date')::date,'DD.MM.YYYY'),'SCHEDULE_DATE_'||i,to_char((c.lessons->(i-1)->>'local_date')::date,'DD.MM.YYYY'),'SCHEDULE_TIME_'||i,uniform,'SCHEDULE_TEACHER_'||i,teacher_label,'SCHEDULE_TOPIC_'||i,'','SCHEDULE_HOURS_'||i,'');END LOOP;
 ELSE
  -- Every real lesson is retained. Empty legacy slots never invent dates.
  FOR i IN 1..greatest(lesson_count,4) LOOP
   IF i<=lesson_count THEN
    l:=c.lessons->(i-1);canonical:=canonical||jsonb_build_object('DAY'||i||'_DATE',to_char((l->>'local_date')::date,'DD.MM.YYYY'),'day'||i||'_date',to_char((l->>'local_date')::date,'DD.MM.YYYY'),'DATE_'||i,to_char((l->>'local_date')::date,'DD.MM.YYYY'),'SCHEDULE_DATE_'||i,to_char((l->>'local_date')::date,'DD.MM.YYYY'),'SCHEDULE_TIME_'||i,clock_values[i],'SCHEDULE_TEACHER_'||i,l->'teacher_label','SCHEDULE_TOPIC_'||i,l->'topic','SCHEDULE_HOURS_'||i,l->'academic_hours');
   ELSE
    canonical:=canonical||jsonb_build_object('DAY'||i||'_DATE','','day'||i||'_date','','DATE_'||i,'','SCHEDULE_DATE_'||i,'','SCHEDULE_TIME_'||i,'','SCHEDULE_TEACHER_'||i,'','SCHEDULE_TOPIC_'||i,'','SCHEDULE_HOURS_'||i,'');
   END IF;
  END LOOP;
 END IF;
 rendered:=CASE WHEN p_row->>'layout_format'='docx_ooxml'THEN vs->'scalars'ELSE vars END;
 IF p_row->>'layout_format'='docx_ooxml'AND jsonb_typeof(rendered)IS DISTINCT FROM'object'THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 FOR k,v IN SELECT * FROM jsonb_each(canonical)LOOP IF rendered?k AND rendered->k IS DISTINCT FROM v THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
 FOR k,v IN SELECT * FROM jsonb_each(jsonb_build_object('program_title',facts->'full_title','program_hours',facts->>'academic_hours','program_form',form))LOOP IF vars?k AND vars->k IS DISTINCT FROM v THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
 IF jsonb_typeof(vs->'rows')='array'THEN
  IF jsonb_array_length(vs->'rows')<>student_count AND p_row->>'doc_type'<>'schedule'THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;i:=0;
  FOR item IN SELECT x FROM jsonb_array_elements(vs->'rows')x LOOP
   i:=i+1;row_item:=s.roster_rows->(i-1);FOR k,v IN SELECT * FROM jsonb_each(canonical)LOOP IF item?k AND item->k IS DISTINCT FROM v THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
   FOR k,v IN SELECT * FROM jsonb_each(jsonb_build_object('N',i::text,'STUDENT_NAME',row_item->'subject_label','STUDENT_PROGRAM',facts->'full_title','STUDENT_HOURS',facts->>'academic_hours','STUDENT_PERIOD',period,'PROGRAM_GROUP',group_label))LOOP IF item?k AND item->k IS DISTINCT FROM v THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
  END LOOP;
 END IF;
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');WHEN invalid_text_representation OR numeric_value_out_of_range THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END;$fn$;


DO $uc_generic_calendar_postcheck$
BEGIN
 IF(SELECT md5(p.prosrc)FROM pg_proc p WHERE p.oid=to_regprocedure('public.uc_group_education_validate_artifact(jsonb)'))IS DISTINCT FROM '622611f5109cb0843d2b49ef25a9b1c5'
 THEN RAISE EXCEPTION 'UC013_GENERIC_CALENDAR_NEW_VALIDATOR_SOURCE_CHANGED';END IF;
END;$uc_generic_calendar_postcheck$;
