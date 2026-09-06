import type { DrivingAdapter, State, Row, Entry } from './types';
import { schoolDateTime, schoolTimeToUtc } from './time';
// This module has no network, Auth, storage or database imports. It is loaded only by the DEV route.
export function createPreviewAdapter(role:State['user']['role']='owner'):DrivingAdapter&{failNext:()=>void} {
 if(!import.meta.env.DEV) throw new Error('Синтетический стенд недоступен в production');
 const zone='Asia/Vladivostok', today=schoolDateTime(Date.now(),zone).slice(0,10), at=(day:string,time:string)=>Date.parse(schoolTimeToUtc(`${day}T${time}`,zone));
 const tomorrow=schoolDateTime(Date.now()+86400000,zone).slice(0,10),yesterday=schoolDateTime(Date.now()-86400000,zone).slice(0,10);
 const program:Row<'program'>={id:'demo-program',kind:'program',name:'Категория B · синтетическая программа',active:1,data:{category:'B',version:'Учебный пример 2026',transmission:'MT',practiceMinutes:600}};
 const car:Row<'car'>={id:'demo-car',kind:'car',name:'Учебный автомобиль (пример)',active:1,data:{number:'СИНТЕТИЧЕСКИЙ',category:'B',transmission:'MT'}};
 const instructor:Row<'instructor'>={id:'demo-instructor',kind:'instructor',name:'Инструктор Пример',active:1,data:{email:'instructor@example.invalid',carId:car.id,windows:[today,tomorrow].map((day,i)=>({id:`demo-shift-${i}`,start:new Date(at(day,'08:00')).toISOString(),end:new Date(at(day,'21:00')).toISOString()}))}};
 const student:Row<'student'>={id:'demo-student',kind:'student',name:'Анна Учебная',active:1,data:{email:'student@example.invalid',phone:'',programId:program.id,groupId:'demo-group',instructorId:instructor.id,practiceMinutes:600,transmission:'MT'}};
 const second:Row<'student'>={...student,id:'demo-student-2',name:'Иван Пример',data:{...student.data,email:'student2@example.invalid'}};
 const fixture:State={user:{id:'synthetic-user',name:role==='owner'?'Администратор примера':role==='student'?student.name:instructor.name,email:'',role,resource_id:role==='student'?student.id:role==='instructor'?instructor.id:''},school:{id:'demo-school',name:'Автошкола «Учебный пример»',settings:JSON.stringify({timezone:zone,horizonDays:30,cancelHours:12})},resources:[program,car,instructor,{id:'demo-group',kind:'group',name:'Группа B-01 (пример)',active:1,data:{programId:program.id}},student,second,{id:'demo-course',kind:'course',name:'Подготовка к учебной поездке (пример)',active:1,data:{programId:program.id,material:'Синтетический материал для проверки интерфейса. Перед учебной поездкой настройте кресло и зеркала, пристегните ремень. Это не официальный банк ПДД.',passPercent:100,questions:[{text:'Что проверяет этот стенд?',options:['Работу интерфейса','Государственный экзамен']}]} }],lessons:[{id:'demo-completed',student_id:student.id,instructor_id:instructor.id,car_id:car.id,start:at(yesterday,'10:00'),end:at(yesterday,'11:00'),status:'completed',actual_minutes:55,topic:'Начало движения (пример)',note:''},{id:'demo-pending',student_id:student.id,instructor_id:instructor.id,car_id:car.id,start:at(yesterday,'12:00'),end:at(yesterday,'13:00'),status:'booked',actual_minutes:0,topic:'',note:''},{id:'demo-booked',student_id:student.id,instructor_id:instructor.id,car_id:car.id,start:at(tomorrow,'10:00'),end:at(tomorrow,'11:00'),status:'booked',actual_minutes:0,topic:'',note:''}],entries:[{id:'demo-charge',student_id:student.id,kind:'charge',created:at(yesterday,'09:00'),data:{kopecks:4500000,date:yesterday,note:'Синтетическое начисление'},reversal:null},{id:'demo-payment',student_id:student.id,kind:'payment',created:at(yesterday,'09:30'),data:{kopecks:1500000,date:yesterday,note:'Синтетическая оплата'},reversal:null}],balances:[],busy:[],audit:[]};
 let fail=false;const operations=new Map<string,{payload:string;id:string}>();
 function refresh(){fixture.balances=fixture.resources.filter((r):r is Row<'student'>=>r.kind==='student').map(s=>({id:s.id,planned:s.data.practiceMinutes,completed:fixture.lessons.filter(l=>l.student_id===s.id&&l.status==='completed').reduce((n,l)=>n+l.actual_minutes,0),reserved:fixture.lessons.filter(l=>l.student_id===s.id&&l.status==='booked').reduce((n,l)=>n+(l.end-l.start)/60000,0)}));fixture.busy=fixture.lessons.filter(l=>l.status==='booked'||l.status==='completed').map(l=>({start:l.start,end:l.end}));}
 function state(){refresh();const value=structuredClone(fixture);if(role==='student'){value.resources=value.resources.filter(r=>r.kind!=='student'||r.id===student.id);value.lessons=value.lessons.filter(l=>l.student_id===student.id);value.entries=value.entries.filter(e=>e.student_id===student.id);value.balances=value.balances.filter(b=>b.id===student.id);value.audit=[];}if(role==='instructor'){value.entries=value.entries.filter(e=>e.kind==='exam'||e.kind==='attempt');value.audit=[];}return value;}
 const string=(v:unknown)=>String(v??'');
 return {canCreateStudents:role==='owner',failNext(){fail=true;},async load(){return state();},async mutate(path,b){
  if(fail){fail=false;throw new Error('Синтетическая ошибка сохранения. Ничего не изменено. Повторите запрос.');}
  const id=crypto.randomUUID(),created=Date.now();
  if(path==='resources'){
   const common={id,name:string(b.name),active:1};let resource:Row;
   if(b.kind==='program')resource={...common,kind:'program',data:{version:string(b.version),transmission:string(b.transmission),practiceMinutes:Number(b.practiceMinutes),category:'B'}};
   else if(b.kind==='car')resource={...common,kind:'car',data:{number:string(b.number),transmission:string(b.transmission),category:'B'}};
   else if(b.kind==='group')resource={...common,kind:'group',data:{programId:string(b.programId)}};
   else if(b.kind==='instructor')resource={...common,kind:'instructor',data:{email:string(b.email),carId:string(b.carId),windows:[]}};
   else if(b.kind==='course')resource={...common,kind:'course',data:{programId:string(b.programId),material:string(b.material),passPercent:Number(b.passPercent),questions:b.questions as Row<'course'>['data']['questions']}};
   else if(b.kind==='student'){const p=fixture.resources.find((r):r is Row<'program'>=>r.id===b.programId&&r.kind==='program');if(!p)throw new Error('Выберите программу');resource={...common,kind:'student',data:{email:string(b.email),phone:string(b.phone),programId:p.id,groupId:string(b.groupId)||null,instructorId:string(b.instructorId)||null,practiceMinutes:p.data.practiceMinutes,transmission:p.data.transmission}};}
   else throw new Error('Тип ресурса не поддержан стендом');
   fixture.resources.push(resource);
  } else if(path==='shifts'){const i=fixture.resources.find((r):r is Row<'instructor'>=>r.id===b.instructorId&&r.kind==='instructor');if(!i)throw new Error('Инструктор не найден');if(Date.parse(string(b.end))<=Date.parse(string(b.start)))throw new Error('Конец смены должен быть позже начала');i.data.windows.push({id,start:string(b.start),end:string(b.end)});
  } else if(path==='lessons'||(path==='lesson-action'&&b.action==='reschedule')){
   const original=path==='lesson-action'?fixture.lessons.find(l=>l.id===b.id):undefined;
   if(path==='lesson-action'&&!original)throw new Error('Занятие не найдено');
   const studentId=original?.student_id||string(b.studentId),instructorId=original?.instructor_id||string(b.instructorId),carId=original?.car_id||string(b.carId),start=Date.parse(string(b.start)),end=Date.parse(string(b.end));
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('Проверьте начало и окончание занятия');
   if(fixture.lessons.some(l=>l.id!==original?.id&&l.status!=='cancelled'&&l.status!=='no_show'&&start<l.end&&l.start<end&&(l.student_id===studentId||l.instructor_id===instructorId||l.car_id===carId)))throw new Error('Это время уже занято учеником, инструктором или автомобилем');
   refresh();const bal=fixture.balances.find(b=>b.id===studentId);const released=original?(original.end-original.start)/60000:0;if(!bal||bal.completed+bal.reserved-released+(end-start)/60000>bal.planned)throw new Error('Недостаточно доступных минут практики');
   const item={id:original?.id||id,student_id:studentId,instructor_id:instructorId,car_id:carId,start,end,status:'booked',actual_minutes:0,topic:'',note:''};
   if(original)Object.assign(original,item);else fixture.lessons.push(item);
  } else if(path==='lesson-action'){
   const l=fixture.lessons.find(l=>l.id===b.id);if(!l)throw new Error('Занятие не найдено');if(b.action==='cancel'){l.status='cancelled';l.note=string(b.reason);}else{if(l.end>Date.now())throw new Error('Подтверждение доступно после окончания');const minutes=b.action==='no_show'?0:Number(b.actualMinutes);if(!Number.isInteger(minutes)||minutes<0||minutes>(l.end-l.start)/60000)throw new Error('Проверьте фактические минуты');l.status=b.action==='no_show'?'no_show':'completed';l.actual_minutes=minutes;l.topic=string(b.topic);l.note=string(b.reason);}
  } else if(path==='entries'){
   const payload=JSON.stringify(b),previous=operations.get(string(b.operationId));if(previous){if(previous.payload!==payload)throw new Error('Ключ уже использован для другой операции');return {id:previous.id};}
   const common={id,created,student_id:string(b.studentId),reversal:null};
   const entry:Entry=b.kind==='exam'?{...common,kind:'exam',data:{date:string(b.date),examType:string(b.examType),result:string(b.result),protocol:string(b.protocol),note:string(b.note)}}:{...common,kind:b.kind==='charge'?'charge':'payment',data:{date:string(b.date),kopecks:Number(b.kopecks),note:string(b.note)}};
   fixture.entries.unshift(entry);operations.set(string(b.operationId),{payload,id});
  } else if(path==='reverse-entry'){const e=fixture.entries.find(e=>e.id===b.id);if(!e)throw new Error('Запись не найдена');e.reversal={reason:string(b.reason),created};
  } else if(path==='assign-student'){const s=fixture.resources.find((r):r is Row<'student'>=>r.id===b.id&&r.kind==='student');if(!s)throw new Error('Ученик не найден');s.data.instructorId=string(b.instructorId)||null;s.data.groupId=string(b.groupId)||null;
  } else if(path==='resource-status'){const r=fixture.resources.find(r=>r.id===b.id);if(!r)throw new Error('Ресурс не найден');r.active=Number(!!b.active);
  } else if(path==='settings'){new Intl.DateTimeFormat('ru-RU',{timeZone:string(b.timezone)}).format();fixture.school.name=string(b.name);fixture.school.settings=JSON.stringify({timezone:b.timezone,horizonDays:Number(b.horizonDays),cancelHours:Number(b.cancelHours)});
  } else if(path==='attempts'){const course=fixture.resources.find((r):r is Row<'course'>=>r.id===b.courseId&&r.kind==='course');if(!course)throw new Error('Урок не найден');const answers=b.answers as number[],score=answers?.[0]===0?100:0;fixture.entries.unshift({id,kind:'attempt',created,student_id:student.id,data:{courseId:course.id,courseName:course.name,score,passed:score===100,answers:[]},reversal:null});return {id,score,passed:score===100};
  } else if(path==='invites'){throw new Error('В синтетическом стенде приглашения не создаются. Облачный сценарий требует отдельной приёмки.');}
  else throw new Error('Это действие не реализовано в синтетическом стенде');
  fixture.audit.unshift({action:path,target:id,created,detail:'Синтетическое действие интерфейса'});return {id};
 }};
}

