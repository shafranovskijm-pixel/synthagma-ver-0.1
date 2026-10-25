/** Exact questionnaire values. null/missing means unknown; 0 and false are explicit values. */
export const SELF_EXAMINATION_ANSWER_STRINGS=['fullName','shortName','legalForm','legalAddress','phone','email','website','ogrn','inn','kpp','founders','licenseNumber','licenseDate','orderNumber','orderDate','directorFio','directorPosition','pedagogicalCouncilProtocolNumber','pedagogicalCouncilProtocolDate','testingPlatformName','testingPlatformUrl','finalAttestationForm','additionalEquipment','additionalNotes'] as const;
const numbers=['directorTermYears','totalStudents','completedStudents'];
const booleans=['hasPedagogicalCouncil','hasEmployerParticipation','hasWebsite','hasDistancePlatform','hasMultimedia','hasLibrary'];
const lists=['programTypes','controlTypes'];
const structures=['commissionChairman','commissionMembers','programs','staff'];
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown)=>typeof v==='string'&&v.length<=12000;
const number=(v:unknown)=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER;
function row(v:unknown,keys:string[],numeric:string[]=[]){return object(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k))&&keys.every(k=>numeric.includes(k)?number(v[k]):text(v[k]));}
export function validSelfExaminationAnswers(value:unknown):value is Record<string,unknown>{
 if(!object(value)||Object.keys(value).length>60)return false;
 for(const[key,v]of Object.entries(value)){
  if(![...SELF_EXAMINATION_ANSWER_STRINGS,...numbers,...booleans,...lists,...structures].includes(key))return false;
  if(v===null)continue;
  if((SELF_EXAMINATION_ANSWER_STRINGS as readonly string[]).includes(key)){if(!text(v))return false;}
  else if(numbers.includes(key)){if(!number(v)||key!=='directorTermYears'&&!Number.isInteger(v))return false;}
  else if(booleans.includes(key)){if(typeof v!=='boolean')return false;}
  else if(lists.includes(key)){if(!Array.isArray(v)||v.length>250||!v.every(text))return false;}
  else if(key==='commissionChairman'){if(!row(v,['fio','position']))return false;}
  else{if(!Array.isArray(v)||v.length>250)return false;for(const item of v){if(key==='programs'&&object(item)&&item.studentsCount!==null&&!Number.isInteger(item.studentsCount))return false;if(key==='commissionMembers'&&!row(item,['fio','position'])||key==='programs'&&!row(item,['name','type','studentsCount'],['studentsCount'])||key==='staff'&&!row(item,['fio','subject','education','experienceYears','employmentType'],['experienceYears']))return false;}}
 }
 return true;
}
