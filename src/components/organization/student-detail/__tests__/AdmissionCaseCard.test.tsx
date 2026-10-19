import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {setOfflineAuthActor} from '@/utils/courseCache';
import * as f from '@/lib/admissionCases/__tests__/fixtures';
import * as c from '@/lib/admissionCases/contract';
import {AdmissionCaseCard} from '../AdmissionCaseCard';
const m=vi.hoisted(()=>({actor:'11111111-1111-4111-8111-000000000001',state:null as any,events:[] as any[],rpc:vi.fn(),invoke:vi.fn(),readOnly:false,own:false,prepared:null as any,emptyAssociation:null as 'missing_group'|'missing_enrollment'|null}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:m.actor},loading:false})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:m.actor},access_token:'SYNTHETIC_A'}},error:null})},rpc:m.rpc,functions:{invoke:m.invoke}}}));
function result(kind:c.AdmissionMutationResult['receipt']['kind'],request:string,reason:string|null=null) {
  const state=m.state as c.AdmissionStaffCase;
  const event=f.event({id:f.id(100+state.revision),case_revision:state.revision,kind,payload:{...f.event().payload,responsible_id:state.responsible_id,rule_set_id:state.rule_set_id,rule_set_digest:state.rule_set_digest,requirements:state.requirements,evidence_version_ids:state.evidence.map(item=>item.id),evidence:state.evidence,tasks:[],decision:state.decision,reason}});m.events.unshift(event);
  return {data:{...f.mutation(kind,state.revision,request),state},error:null};
}
beforeEach(()=>{
  vi.clearAllMocks();m.actor=f.actor;m.state=null;m.events=[];m.readOnly=false;m.own=false;m.emptyAssociation=null;setOfflineAuthActor(null);setOfflineAuthActor(f.actor);
  m.rpc.mockImplementation((name,args)=>({setHeader:async()=>{
    if(name==='read_student_admission_case'){
      const query=args.p_query;
      if(query.mode==='associations')return {data:m.emptyAssociation ? {...f.associations(),items:[],prerequisites:[{code:m.emptyAssociation,public_label:'Выберите подтверждённую учебную связь',next_action:'select_exact_association',persisted:false}]} : {...f.associations(),items:[{scope:f.scope,group_label:'Внутренняя группа QA',case_id:m.state?.id||null,prerequisites:[]}]},error:null};
      if(query.mode==='case'){
        if(m.own)return {data:{schema_version:1,mode:'case',projection:'learner',scope:f.scope,state:{id:f.caseId,scope:f.scope,revision:4,program_title:'Индивидуальная программа',outcome:'needs_information',outcome_recorded_at:f.at,later_review_required:false,tasks:[{id:f.id(200),public_label:'Нужны сведения для проверки',next_action:'upload_own_attachment',status:'open'}]},prerequisites:[]},error:null};
        const data=f.staffRead(m.state);return {data:{...data,capabilities:m.state?.capabilities||{...f.caps,can_initialize:true}},error:null};
      }
      if(query.mode==='options')return {data:{schema_version:1,mode:'options',case_id:f.caseId,case_revision:m.state.revision,kind:query.kind,items:query.kind==='responsibles'?[{user_id:f.actor,display_name:'Синтетический ответственный'}]:[{...f.localSource,type:'admission_rules',label:'Порядок внутренних учебных отношений',approval:{number:'QA-1',date:'2026-10-19',recorded_at:f.at,recorded_by:f.actor}}],has_more:false,next_after_id:null},error:null};
      if(query.mode==='candidates')return {data:{schema_version:1,mode:'candidates',case_id:f.caseId,case_revision:m.state.revision,items:[{kind:query.kind,id:f.id(70),version_id:null,fingerprint:f.hash,availability:'capturable',label:'Индивидуальное основание финансирования'}],has_more:false,next_after_id:null},error:null};
      if(query.mode==='history')return {data:{schema_version:1,mode:'history',case_id:f.caseId,ceiling_revision:m.state.revision,items:m.events,has_more:false,next_before_revision:null},error:null};
    }
    if(name==='prepare_admission_case_evidence'){m.prepared={schema_version:1,case_id:f.caseId,case_revision:m.state.revision,reservation_id:f.id(60),evidence_version_id:f.id(61),expires_at:'2026-10-19T01:00:00Z',source_kind:'existing',upload_slot:null};return {data:m.prepared,error:null};}
    const command=c.admissionCaseActionSchema.parse(args.p_command);const revision=command.expected_revision+1;
    if(command.action==='initialize')m.state=f.staffCase({revision,program_type:'internal_nonformal',responsible_id:null,rule_set_id:null,rule_set_digest:null,requirements:[],evidence:[],capabilities:{...f.caps,can_configure_rules:false,can_decide:false}});
    else if(command.action==='assign_responsible')m.state={...m.state,revision,responsible_id:command.responsible_id,capabilities:{...f.caps,can_decide:false}};
    else if(command.action==='review_local_rules')m.state={...m.state,revision,rule_set_id:f.id(22),rule_set_digest:f.hash,requirements:command.requirements.map((row,index)=>f.requirement({id:f.id(20+index),rule_id:f.id(220+index),label:row.staff_label})),capabilities:{...f.caps}};
    else if(command.action==='review_evidence')m.state={...m.state,revision,evidence:m.state.evidence.map((item:c.AdmissionEvidence)=>({...item,review:command.outcome,review_event_id:f.id(100+revision)}))};
    else if(command.action==='review_requirement')m.state={...m.state,revision,requirements:m.state.requirements.map((item:c.AdmissionRequirement)=>item.id===command.requirement_id?{...item,revision:item.revision+1,applicability:command.applicability,review_event_id:f.id(100+revision),evidence_version_ids:command.evidence_version_ids,current_state:command.applicability==='not_applicable'||command.evidence_version_ids.length?'satisfied':'missing'}:item)};
    else if(command.action==='record_decision')m.state={...m.state,revision,decision:{event_id:f.id(100+revision),case_revision:revision,outcome:command.outcome,recorded_at:f.at,responsible_id:f.actor,reason:command.reason,program_ref:f.program,rule_set_id:f.id(22),requirements_digest:f.hash,evidence_version_ids:command.evidence_version_ids,authority_snapshot_hash:f.hash,later_review_required:false}};
    return result(command.action,args.p_request_id,'reason' in command?command.reason:null);
  }}));
  m.invoke.mockImplementation(async(_name,args)=>{
    const source=[...m.rpc.mock.calls].reverse().find(call=>call[0]==='prepare_admission_case_evidence')![1].p_source;
    m.state={...m.state,revision:m.prepared.case_revision+1,evidence:[f.evidence({id:f.id(61),requirement_id:source.requirement_id,case_revision_created:m.prepared.case_revision+1})]};return result('evidence_committed',args.body.request_id);
  });
});
afterEach(()=>{cleanup();setOfflineAuthActor(null);});
describe('case Card preserves human review and existing UI boundaries',()=>{
  it('replaces the empty group selector with a useful explanation and read-only recovery',async()=>{
    m.emptyAssociation='missing_group';const openCourses=vi.fn();render(<AdmissionCaseCard organizationId={f.org} studentUserId={f.learner} onOpenCourses={openCourses}/>);
    await screen.findByText('Учебная связь для личного дела пока не настроена');
    expect(screen.queryByRole('combobox',{name:'Группа и зачисление'})).toBeNull();expect(screen.queryByText('Выберите подтверждённую учебную связь')).toBeNull();
    expect(screen.getByText(/Если ученик уже состоит в группе/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Открыть курсы ученика'}));expect(openCourses).toHaveBeenCalledOnce();
    m.emptyAssociation=null;fireEvent.click(screen.getByRole('button',{name:'Проверить связь снова'}));
    await screen.findByRole('combobox',{name:'Группа и зачисление'});await screen.findByRole('button',{name:'Открыть личное дело'});
    expect(m.rpc.mock.calls.every(call=>call[0]==='read_student_admission_case')).toBe(true);expect(m.invoke).not.toHaveBeenCalled();expect(m.state).toBeNull();
  });
  it('explains a missing enrollment without inventing a group or a persisted case',async()=>{
    m.emptyAssociation='missing_enrollment';render(<AdmissionCaseCard organizationId={f.org} studentUserId={f.learner}/>);
    await screen.findByText(/Сначала проверьте назначенные ученику курсы/);expect(screen.queryByRole('combobox')).toBeNull();expect(m.state).toBeNull();
    expect(m.rpc.mock.calls.every(call=>call[0]==='read_student_admission_case')).toBe(true);
  });
  it('keeps learner empty-state guidance separate from organization setup controls',async()=>{
    m.actor=f.learner;setOfflineAuthActor(f.learner);m.own=true;m.emptyAssociation='missing_group';
    render(<AdmissionCaseCard organizationId={f.org} studentUserId={f.learner} ownOnly onOpenCourses={vi.fn()}/>);
    await screen.findByText(/Ответственный центра ещё не настроил/);expect(screen.queryByRole('combobox')).toBeNull();expect(screen.queryByRole('button',{name:'Открыть курсы ученика'})).toBeNull();
    expect(screen.queryByText(/Если ученик уже состоит в группе/)).toBeNull();expect(m.rpc.mock.calls.every(call=>call[0]==='read_student_admission_case')).toBe(true);
  });
  it('runs a complete first synthetic case through the actual hook/client without a seeded rule set',async()=>{
    render(<AdmissionCaseCard organizationId={f.org} studentUserId={f.learner}/>);
    await screen.findByRole('button',{name:'Открыть личное дело'});expect(m.state).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Открыть личное дело'}));
    await screen.findByRole('button',{name:'Выбрать ответственного'});expect(m.state.decision).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Выбрать ответственного'}));
    await screen.findByLabelText('Ответственный');fireEvent.change(screen.getByLabelText('Ответственный'),{target:{value:f.actor}});fireEvent.change(screen.getByLabelText('Основание назначения'),{target:{value:'Синтетическое поручение организации'}});fireEvent.click(screen.getByRole('button',{name:'Назначить'}));
    await screen.findByRole('button',{name:'Выбрать утверждённые акты'});fireEvent.click(screen.getByRole('button',{name:'Выбрать утверждённые акты'}));
    fireEvent.click(await screen.findByLabelText(/Порядок внутренних учебных отношений/));for(let index=1;index<=3;index++)fireEvent.change(screen.getByLabelText(`Пункт акта ${index}`),{target:{value:`Синтетический пункт${index}`}});
    fireEvent.change(screen.getByLabelText('Основание проверки правил'),{target:{value:'Человек рассмотрел вопросы для внутренней программы; не юридическое заключение'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить проверенную редакцию'}));
    await screen.findByLabelText('Применимость: Основание обучения');expect(m.state.requirements.every((row:c.AdmissionRequirement)=>row.applicability==='unknown')).toBe(true);expect(m.state.decision).toBeNull();
    for(const label of ['Основание обучения','Заявление и учебные отношения']){
      fireEvent.change(screen.getByLabelText(`Применимость: ${label}`),{target:{value:'not_applicable'}});fireEvent.change(screen.getByLabelText(`Основание: ${label}`),{target:{value:'Ответственный указал основание неприменимости к синтетической внутренней программе'}});
      const section=screen.getByLabelText(`Применимость: ${label}`).parentElement!;fireEvent.click(within(section).getByRole('button',{name:'Записать рассмотрение'}));await waitFor(()=>expect(m.state.requirements.find((row:c.AdmissionRequirement)=>row.label===label).applicability).toBe('not_applicable'));
    }
    const contractLabel='Договор или основание финансирования';fireEvent.change(screen.getByLabelText(`Тип существующего источника: ${contractLabel}`),{target:{value:'enrollment_document'}});
    const question=screen.getByLabelText(`Применимость: ${contractLabel}`).parentElement!.parentElement!;
    fireEvent.click(within(question).getByRole('button',{name:'Выбрать существующий источник'}));fireEvent.click(await within(question).findByRole('button',{name:'Сохранить версию'}));await within(question).findByRole('button',{name:'Записать проверку версии'});expect(m.state.decision).toBeNull();
    fireEvent.change(screen.getByLabelText(`Основание проверки версии ${f.id(61)}`),{target:{value:'Рассмотрена эта индивидуальная версия и её относимость к зачислению'}});fireEvent.click(within(question).getByRole('button',{name:'Записать проверку версии'}));await waitFor(()=>expect(m.state.evidence[0].review).toBe('accepted'));
    fireEvent.change(screen.getByLabelText(`Применимость: ${contractLabel}`),{target:{value:'applicable'}});fireEvent.click(screen.getByLabelText(/Учитывать версию/));fireEvent.change(screen.getByLabelText(`Основание: ${contractLabel}`),{target:{value:'Применимо: рассмотрены точные версии и источник'}});fireEvent.click(within(screen.getByLabelText(`Применимость: ${contractLabel}`).parentElement!).getByRole('button',{name:'Записать рассмотрение'}));
    await waitFor(()=>expect(m.state.requirements.every((row:c.AdmissionRequirement)=>row.current_state==='satisfied')).toBe(true));fireEvent.change(screen.getByLabelText('Решение ответственного'),{target:{value:'admitted'}});fireEvent.change(screen.getByLabelText('Основание решения'),{target:{value:'Назначенный человек рассмотрел синтетическое дело; это только QA'}});fireEvent.click(screen.getByRole('button',{name:'Записать решение'}));
    await screen.findByText('Допуск зафиксирован ответственным');fireEvent.click(screen.getByRole('button',{name:'История личного дела'}));await screen.findByText(/Личное дело открыто ·/);
    const decisions=m.rpc.mock.calls.filter(call=>call[0]==='apply_student_admission_case_action'&&call[1].p_command.action==='record_decision');expect(decisions).toHaveLength(1);expect(decisions[0][1].p_command.evidence_version_ids).toEqual([f.id(61)]);expect(m.invoke).toHaveBeenCalledOnce();
  });
  it('read-only default has no staff actions or filename-based all-clear',async()=>{m.state=f.staffCase({capabilities:{can_initialize:false,can_assign:false,can_review:false,can_decide:false,can_prepare_evidence:false,can_configure_rules:false}});render(<AdmissionCaseCard organizationId={f.org} studentUserId={f.learner}/>);await screen.findByText('Синтетическая учебная программа');expect(screen.queryByRole('button',{name:'Назначить'})).toBeNull();expect(screen.queryByRole('button',{name:'Выбрать утверждённые акты'})).toBeNull();expect(screen.queryByRole('button',{name:'Записать решение'})).toBeNull();expect(screen.queryByText('Все документы в порядке')).toBeNull();});
  it('own learner sees safe outcome/tasks and existing upload callback, no staff proofs/notes/control',async()=>{m.actor=f.learner;setOfflineAuthActor(f.learner);m.own=true;const upload=vi.fn();render(<AdmissionCaseCard organizationId={f.org} studentUserId={f.learner} ownOnly onUploadOwn={upload}/>);await screen.findByText('Нужны сведения');fireEvent.click(screen.getByRole('button',{name:'Загрузить сведения'}));expect(upload).toHaveBeenCalledOnce();expect(screen.queryByText('Правила проверки личного дела')).toBeNull();expect(screen.queryByRole('button',{name:'История личного дела'})).toBeNull();expect(m.invoke).not.toHaveBeenCalled();});
});
