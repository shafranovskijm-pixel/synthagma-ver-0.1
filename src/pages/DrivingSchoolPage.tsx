import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import DrivingApp from '@/components/driving-school/DrivingApp';
import { createCloudAdapter, drivingRpc, DrivingFailure } from '@/lib/driving-school/cloud-adapter';
import '@/components/driving-school/driving-school.css';
type School={organization_id:string;name:string;role:string};
type Status={installed:boolean;connected:boolean;can_manage:boolean};
/** Ordinary role defaults only. Opening this module never changes an account's role. */
export function ordinaryDrivingExit(role: string | null): string {
 return role==='admin'?'/admin':role==='organization'?'/organization':role==='company'?'/company':role==='sales_manager'?'/sales':'/student';
}
function checkedStatus(next: Status): Status {
 if(next?.installed!==true||typeof next.connected!=='boolean'||typeof next.can_manage!=='boolean')
  throw new DrivingFailure('Некорректный ответ проверки модуля', 'context');
 return next;
}
function SchoolWorkspace({organizationId,onExit}:{organizationId:string;onExit:()=>void}){
 const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[zone,setZone]=useState('');
 const {userRole,user}=useAuth();
 const adapter=useMemo(()=>createCloudAdapter(organizationId,userRole==='organization'),[organizationId,userRole,user?.id]);
  const check=async()=>{setBusy(true);setStatus(null);setError('');try {setStatus(checkedStatus(await drivingRpc<Status>('driving_module_status',{_organization_id:organizationId})));}catch(e){setError(e instanceof Error?e.message:'Не удалось проверить модуль');}finally{setBusy(false);}};
  useEffect(()=>{let active=true;setStatus(null);setError('');drivingRpc<Status>('driving_module_status',{_organization_id:organizationId}).then(next=>{if(active)setStatus(checkedStatus(next));}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[organizationId]);
 if(status?.connected)return <DrivingApp key={`${user?.id}:${organizationId}`} adapter={adapter} onExit={onExit}/>;
 return <main className="driving-school-root loading"><span className="tag">Автошколы · Beta</span><h1>{error?'Модуль пока недоступен':status?'Подключение автошколы':'Проверяем доступ…'}</h1>{error&&<div role="alert" className="error">{error}</div>}{status&&!error&&<><p>Организация уже существует в СИНТАГМЕ. Подключение добавит модуль к выбранной организации.</p>{status.can_manage?<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{new Intl.DateTimeFormat('ru-RU',{timeZone:zone}).format();await drivingRpc('driving_connect_module',{_organization_id:organizationId,_timezone:zone});await check();}catch(e){setError(e instanceof Error?e.message:'Подключение не подтверждено');}finally{setBusy(false);}}}><label>Часовой пояс школы (IANA)<Input required value={zone} onChange={e=>setZone(e.target.value)} placeholder="Например, Europe/Moscow"/><small>Выберите по месту работы школы. Все смены и занятия используют этот пояс.</small></label><Button type="submit" disabled={busy}>{busy?'Подключаем…':'Подключить модуль'}</Button></form>:<p>Подключить модуль может владелец или администратор.</p>}</>}{error&&<Button disabled={busy} onClick={()=>void check()}>Повторить проверку</Button>}<Button variant="outline" onClick={onExit}>Вернуться в СИНТАГМУ</Button></main>;
}
function DrivingSchoolAccount({organizationId}:{organizationId?:string}){
 const navigate=useNavigate(),[params,setParams]=useSearchParams();
  const {userRole}=useAuth();
  const ordinaryPath=ordinaryDrivingExit(userRole);
 const [schools,setSchools]=useState<School[]|null>(null),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [checkVersion,setCheckVersion]=useState(0);
 const token=params.get('invite');
  const accountActive=useRef(true),currentInvite=useRef(token);
  currentInvite.current=token;
  useEffect(()=>{accountActive.current=true;return()=>{accountActive.current=false;};},[]);
  useEffect(()=>{setBusy(false);},[token]);
  useEffect(()=>{if(organizationId||token)return;let active=true;setSchools(null);setError('');drivingRpc<School[]>('driving_my_schools').then(s=>{if(!Array.isArray(s)||s.some(x=>typeof x.organization_id!=='string'||!x.organization_id||typeof x.name!=='string'||!['student','instructor'].includes(x.role)))throw new DrivingFailure('Не подтверждены привязки к автошколам','context');if(active)setSchools(s);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[organizationId,token,checkVersion]);
 if(organizationId)return <SchoolWorkspace key={organizationId} organizationId={organizationId} onExit={()=>navigate('/organization')}/>;
  if(selected&&!token)return <SchoolWorkspace key={selected} organizationId={selected} onExit={()=>{setSelected('');setParams({});}}/>;
  const hasSchools=!!schools?.length;
  return <main className="driving-school-root loading">
   <span className="tag">СИНТАГМА · Автошколы · Beta</span>
   <h1>{token?'Принять приглашение':error?'Доступ к автошколе не подтверждён':hasSchools?'Выберите автошколу':schools===null?'Проверяем доступ…':'Автошкола не подключена к аккаунту'}</h1>
   {error&&<div role="alert" className="error">{error}</div>}
   {token?<>
    <p>Только для действующего общего аккаунта этой организации. Новая организация при регистрации не подходит; за учётной записью обратитесь к владельцу автошколы. Сервер проверит подтверждённую почту, организацию и действительность приглашения.</p>
    <Button disabled={busy} onClick={async()=>{const intent=token;setBusy(true);setError('');try{
     const result=await drivingRpc<{organization_id:string}>('driving_accept_invite',{_token:token});
     if(!accountActive.current||currentInvite.current!==intent)return;
     if(!result?.organization_id)throw new DrivingFailure('Привязка не подтверждена','context');
     const next=new URLSearchParams(params);next.delete('invite');setParams(next,{replace:true});setSelected(result.organization_id);
    }catch(e){if(accountActive.current&&currentInvite.current===intent)setError(e instanceof Error?e.message:'Приглашение не принято');}finally{if(accountActive.current&&currentInvite.current===intent)setBusy(false);}}}>{busy?'Проверяем…':'Принять приглашение'}</Button>
   </>:schools===null&&!error?<p>Проверяем привязки аккаунта…</p>:hasSchools?<div className="stack">{schools!.map(s=><Button key={s.organization_id+':'+s.role} variant="outline" onClick={()=>setSelected(s.organization_id)}>{s.name} · {s.role==='student'?'Ученик':'Инструктор'}</Button>)}</div>:!error?<p>Ваш обычный кабинет СИНТАГМЫ доступен как прежде. Для обучения в автошколе нужна действующая привязка: её оформляет владелец школы. Переход на эту страницу не создаёт новую роль или организацию.</p>:null}
   {error&&!token&&<Button variant="outline" onClick={()=>setCheckVersion(n=>n+1)}>Повторить проверку</Button>}
   <Button onClick={()=>navigate(ordinaryPath)}>В обычный кабинет</Button>
   <Button variant="outline" onClick={()=>navigate('/auto-schools')}>Об автошколах</Button>
  </main>;
}


/** An account change synchronously unmounts every cached school, form and request view. */
export default function DrivingSchoolPage(props:{organizationId?:string}) {
 const {user}=useAuth();
 if(!user)return <main className="driving-school-root loading"><h1>Войдите в СИНТАГМУ</h1><p>Для автошколы требуется действующая общая сессия.</p></main>;
 return <DrivingSchoolAccount key={user.id} {...props}/>;
}

