import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
const api=vi.hoisted(()=>({listConductedSessions:vi.fn(),readFullConductedSession:vi.fn(),readSessionDraft:vi.fn(),prepareSessionMutation:vi.fn()}));
vi.mock('@/lib/conductedSessions/client',()=>({...api,sessionError:(e:any)=>e,sessionErrorMessage:{DEPENDENCY_UNAVAILABLE:'Проверка не подтверждена'}}));
vi.mock('@/lib/groupEducationFacts/client',()=>({captureEducationScope:(org:string,group:string,current:()=>boolean,course:string)=>({organizationId:org,groupId:group,current,courseId:course}),educationScopeCurrent:(s:any)=>s.current()}));
import {ConductedSessionsPanel} from '../ConductedSessionsPanel';
import {calendar,compatibleArtifactSnapshot,envelope,id,time,scope} from '@/lib/groupEducationFacts/__tests__/fixtures';
import {detail} from '@/lib/conductedSessions/__tests__/fixtures';
import type {useGroupEducationFacts} from '@/hooks/useGroupEducationFacts';
const facts=()=>({envelope:envelope(),calendarValue:{calendar:calendar()},scopeCurrent:()=>true,invalidateAccess:vi.fn(),busy:false,pending:false,mutate:vi.fn(),snapshot:vi.fn()}) as unknown as ReturnType<typeof useGroupEducationFacts>;
beforeEach(()=>{vi.clearAllMocks();api.listConductedSessions.mockResolvedValue({schema_version:1,scope,sessions:[],next_after_id:null});});
describe('conducted session group flow',()=>{
 it('does not turn a calendar plan or technical completion into attendance',async()=>{
  render(<ConductedSessionsPanel organizationId={scope.organization_id} groupId={scope.group_id} facts={facts()}/>);
  expect(await screen.findByText('Подтверждённых занятий пока нет.')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Подтвердить проведённое занятие'})).not.toBeInTheDocument();expect(api.prepareSessionMutation).not.toHaveBeenCalled();
 });
 it('captures exact lesson_roster at actual start and requires each mark and human acknowledgement',async()=>{
  const f=facts(),snapshot=compatibleArtifactSnapshot();f.calendarValue!.calendar=snapshot.projection.calendar;
  vi.mocked(f.mutate).mockResolvedValue({receipt:{snapshot_id:id(50)}} as never);vi.mocked(f.snapshot).mockResolvedValue(snapshot);
  render(<ConductedSessionsPanel organizationId={scope.organization_id} groupId={scope.group_id} facts={f}/>);
  fireEvent.change(screen.getByLabelText('Занятие для подтверждения'),{target:{value:snapshot.projection.calendar.lessons[0].lesson_id}});
  fireEvent.change(screen.getByLabelText('Фактическое начало занятия со смещением'),{target:{value:time}});fireEvent.change(screen.getByLabelText('Фактическое окончание занятия со смещением'),{target:{value:'2026-10-19T05:00:00Z'}});
  fireEvent.change(screen.getByLabelText('Основание занятия'),{target:{value:'Проверено преподавателем'}});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Зафиксировать состав на начало занятия'}));});
  expect(f.mutate).toHaveBeenCalledWith(expect.objectContaining({action:'capture_roster_snapshot',purpose:'lesson_roster',calendar_version_id:snapshot.header.calendar_version_id,as_of:{kind:'at',at:time,timezone:'Europe/Moscow'}}));
  const mark=screen.getByLabelText('Посещение: Учебная подпись');expect(mark).toHaveValue('');expect(screen.getByRole('button',{name:'Подтвердить проведённое занятие'})).toBeDisabled();
  fireEvent.change(mark,{target:{value:'absent'}});expect(screen.getByRole('button',{name:'Подтвердить проведённое занятие'})).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox',{name:'Подтверждаю фактическое проведение и каждую отметку посещения'}));expect(screen.getByRole('button',{name:'Подтвердить проведённое занятие'})).not.toBeDisabled();
 });
 it('read-only mode never exposes confirmation, correction or draft mutations',async()=>{
  render(<ConductedSessionsPanel organizationId={scope.organization_id} groupId={scope.group_id} facts={facts()} readonly/>);
  await waitFor(()=>expect(api.listConductedSessions).toHaveBeenCalled());expect(screen.queryByLabelText('Занятие для подтверждения')).not.toBeInTheDocument();expect(screen.queryByLabelText('Основание занятия')).not.toBeInTheDocument();expect(api.prepareSessionMutation).not.toHaveBeenCalled();
 });
 it('invalidates parent private state after an authoritative access denial',async()=>{
  const f=facts();api.listConductedSessions.mockRejectedValue({code:'ACCESS_DENIED'});render(<ConductedSessionsPanel organizationId={scope.organization_id} groupId={scope.group_id} facts={f}/>);await waitFor(()=>expect(f.invalidateAccess).toHaveBeenCalled());
 });
 it('keeps changed sources visible as unavailable and disables a new document',async()=>{
  const d=detail();d.source_current=false;api.listConductedSessions.mockResolvedValue({schema_version:1,scope,sessions:[{id:d.session.id,starts_at:time,revision:1,redacted:false}],next_after_id:null});api.readFullConductedSession.mockResolvedValue(d);
  render(<ConductedSessionsPanel organizationId={scope.organization_id} groupId={scope.group_id} facts={facts()}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Открыть занятие'}));expect(await screen.findByText(/Источники изменились/)).toBeInTheDocument();expect(screen.getByRole('button',{name:'Сохранить черновик для проверки'})).toBeDisabled();expect(screen.getByRole('button',{name:'Сохранить новую редакцию посещения'})).toBeDisabled();
 });
});
