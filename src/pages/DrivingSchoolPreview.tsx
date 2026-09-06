import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DrivingApp from '@/components/driving-school/DrivingApp';
import { Button } from '@/components/ui/button';
import { createPreviewAdapter } from '@/lib/driving-school/preview-adapter';
import type { State } from '@/lib/driving-school/types';
export default function DrivingSchoolPreview(){
 const [role,setRole]=useState<State['user']['role']>('owner'),[reset,setReset]=useState(0),[,setParams]=useSearchParams();
 const adapter=useMemo(()=>createPreviewAdapter(role),[role,reset]);
 if(!import.meta.env.DEV)return null;
 return <><div className="driving-school-root no-print" style={{padding:'10px 18px',background:'#fff0d2',borderBottom:'1px solid #e7c96d'}}><div className="actions"><strong>DEV · Синтетический стенд</strong><label style={{display:'flex',alignItems:'center'}}>Роль <select aria-label="Роль стенда" value={role} onChange={e=>{setRole(e.target.value as typeof role);setParams({});}}><option value="owner">Администратор</option><option value="student">Ученик</option><option value="instructor">Инструктор</option></select></label><Button variant="outline" onClick={()=>{adapter.failNext();}}>Проверить ошибку следующей записи</Button><Button variant="outline" onClick={()=>{setReset(n=>n+1);setParams({});}}>Сбросить пример</Button><small>Нет подключения к Cloud. Проверка интерфейса не доказывает готовность backend.</small></div></div><DrivingApp key={`${role}-${reset}`} adapter={adapter} preview onExit={()=>{setReset(n=>n+1);setParams({});}}/></>;
}

