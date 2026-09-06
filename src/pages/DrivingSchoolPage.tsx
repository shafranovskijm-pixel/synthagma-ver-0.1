import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import DrivingApp from '@/components/driving-school/DrivingApp';
import { createCloudAdapter, drivingRpc } from '@/lib/driving-school/cloud-adapter';
import '@/components/driving-school/driving-school.css';
type School={organization_id:string;name:string;role:string};
type Status={installed:boolean;connected:boolean;can_manage:boolean};
function SchoolWorkspace({organizationId,onExit}:{organizationId:string;onExit:()=>void}){
 const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[zone,setZone]=useState('');
 const {userRole,user}=useAuth();
 const adapter=useMemo(()=>createCloudAdapter(organizationId,userRole==='organization'),[organizationId,userRole,user?.id]);
 const check=async()=>{setBusy(true);setError('');try {const next=await drivingRpc<Status>('driving_module_status',{_organization_id:organizationId});if(typeof next?.connected!=='boolean'||typeof next?.can_manage!=='boolean')throw new Error('Некорректный ответ проверки модуля');setStatus(next);}catch(e){setError(e instanceof Error?e.message:'Не удалось проверить модуль');}finally{setBusy(false);}};
 useEffect(()=>{let active=true;setStatus(null);setError('');drivingRpc<Status>('driving_module_status',{_organization_id:organizationId}).then(next=>{if(!active)return;if(typeof next?.connected!=='boolean'||typeof next?.can_manage!=='boolean')throw new Error('Некорректный ответ проверки модуля');setStatus(next);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[organizationId]);
 if(status?.connected)return <DrivingApp key={`${user?.id}:${organizationId}`} adapter={adapter} onExit={onExit}/>;
 return <main className="driving-school-root loading"><span className="tag">Автошколы · Beta</span><h1>{error?'Модуль пока недоступен':status?'Подключение автошколы':'Проверяем доступ…'}</h1>{error&&<div role="alert" className="error">{error}</div>}{status&&!error&&<><p>Организация уже существует в СИНТАГМЕ. Подключение добавит модуль к выбранной организации.</p>{status.can_manage?<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{new Intl.DateTimeFormat('ru-RU',{timeZone:zone}).format();await drivingRpc('driving_connect_module',{_organization_id:organizationId,_timezone:zone});await check();}catch(e){setError(e instanceof Error?e.message:'Подключение не подтверждено');}finally{setBusy(false);}}}><label>Часовой пояс школы (IANA)<Input required value={zone} onChange={e=>setZone(e.target.value)} placeholder="Например, Europe/Moscow"/><small>Выберите по месту работы школы. Все смены и занятия используют этот пояс.</small></label><Button type="submit" disabled={busy}>{busy?'Подключаем…':'Подключить модуль'}</Button></form>:<p>Подключить модуль может владелец или администратор.</p>}</>}{error&&<Button disabled={busy} onClick={()=>void check()}>Повторить проверку</Button>}<Button variant="outline" onClick={onExit}>Вернуться в СИНТАГМУ</Button></main>;
}
function DrivingSchoolAccount({organizationId}:{organizationId?:string}){
 const navigate=useNavigate(),[params,setParams]=useSearchParams();
 const [schools,setSchools]=useState<School[]|null>(null),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const token=params.get('invite');
 useEffect(()=>{if(organizationId||token)return;let active=true;drivingRpc<School[]>('driving_my_schools').then(s=>{if(!Array.isArray(s)||s.some(x=>typeof x.organization_id!=='string'||typeof x.name!=='string'))throw new Error('Некорректный список автошкол');if(active)setSchools(s);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[organizationId,token]);
 if(organizationId)return <SchoolWorkspace key={organizationId} organizationId={organizationId} onExit={()=>navigate('/organization')}/>;
 if(selected)return <SchoolWorkspace key={selected} organizationId={selected} onExit={()=>{setSelected('');setParams({});}}/>;
 return <main className="driving-school-root loading"><span className="tag">СИНТАГМА · Автошколы</span><h1>{token?'Принять приглашение':'Выберите автошколу'}</h1>{error&&<div role="alert" className="error">{error}</div>}{token?<><p>Только для действующего общего аккаунта этой организации. Новая организация при регистрации не подходит; за учётной записью обратитесь к владельцу автошколы. Сервер проверит подтверждённую почту, организацию и действительность приглашения.</p><Button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const result=await drivingRpc<{organization_id:string}>('driving_accept_invite',{_token:token});if(!result?.organization_id)throw new Error('Привязка не подтверждена');setParams({}, {replace:true});setSelected(result.organization_id);}catch(e){setError(e instanceof Error?e.message:'Приглашение не принято');}finally{setBusy(false);}}}>{busy?'Проверяем…':'Принять приглашение'}</Button></>:schools===null&&!error?<p>Проверяем привязки аккаунта…</p>:schools?.length?<div className="stack">{schools.map(s=><Button key={s.organization_id+':'+s.role} variant="outline" onClick={()=>setSelected(s.organization_id)}>{s.name} · {s.role==='student'?'Ученик':'Инструктор'}</Button>)}</div>:!error?<p>Действующих привязок к автошколам нет. Владелец подключает модуль в кабинете организации. Ученику или инструктору привязку оформляет автошкола — обратитесь к её владельцу.</p>:null}<Button variant="outline" onClick={()=>navigate('/auto-schools')}>Об автошколах</Button></main>;
}


/** An account change synchronously unmounts every cached school, form and request view. */
export default function DrivingSchoolPage(props:{organizationId?:string}) {
 const {user}=useAuth();
 if(!user)return <main className="driving-school-root loading"><h1>Войдите в СИНТАГМУ</h1><p>Для автошколы требуется действующая общая сессия.</p></main>;
 return <DrivingSchoolAccount key={user.id} {...props}/>;
}

