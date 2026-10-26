import type { State } from '@/lib/driving-school/types';
export function deferred<T>() { let resolve!:(value:T)=>void; let reject!:(error:unknown)=>void; const promise=new Promise<T>((ok,no)=>{resolve=ok;reject=no;}); return {promise,resolve,reject}; }
/** Newly authored synthetic state only; not a production export or a legal programme. */
export function schoolState(name='QA School A',schoolId='qa-school'):State {
 return {user:{id:'qa-owner',name:'QA Owner',email:'owner@example.invalid',role:'owner',resource_id:''},
  school:{id:schoolId,name,settings:JSON.stringify({timezone:'Europe/Moscow',horizonDays:30,cancelHours:12})},
  resources:[
   {id:'program',kind:'program',name:'QA Program',active:1,data:{version:'qa-v1',category:'B',transmission:'MT',practiceMinutes:600}},
   {id:'car',kind:'car',name:'QA Car',active:1,data:{number:'SYNTHETIC',category:'B',transmission:'MT'}},
   {id:'instructor',kind:'instructor',name:'Private QA Instructor',active:1,data:{email:'instructor@example.invalid',carId:'car',windows:[]}},
   {id:'student',kind:'student',name:'Private QA Student',active:1,data:{email:'student@example.invalid',phone:'',programId:'program',groupId:null,instructorId:'instructor',practiceMinutes:600,transmission:'MT'}},
  ],entries:[],lessons:[],balances:[{id:'student',completed:0,reserved:0,planned:600}],busy:[],audit:[]};
}
export function rawStudentState() {
 return {connected:true,can_manage:false,viewer:{role:'student',student_id:'student',instructor_id:null},
  school:{organization_id:'qa-school',name:'QA School',timezone:'Europe/Moscow',horizon_days:30,cancel_hours:12},
  programs:[],cars:[],groups:[],instructors:[],
  students:[{id:'student',name:'QA Student',active:true,program_id:'program',group_id:null,instructor_id:'instructor',practice_minutes:600,transmission:'MT'}],
  courses:[],lessons:[],entries:[],balances:[{id:'student',completed:0,reserved:0,planned:600}],busy:[],audit:[]};
}
