import{ArchiveError}from'@/lib/archiveCases/contract';
export const io:{current:boolean;token:string;response:()=>unknown;trace:any[];started:(()=>void)|null}={current:true,token:'qa-original-user-token',response:()=>({data:null,error:null,status:200}),trace:[],started:null};
export function assertArchiveScope(scope:any){if(!io.current||scope.current&&!scope.current())throw new ArchiveError('ACCESS_DENIED');}
export async function requireArchiveJwt(scope:any){assertArchiveScope(scope);return io.token;}
export const archiveMessages={ACCESS_DENIED:'Нет доступа',DEPENDENCY_UNAVAILABLE:'Операция временно недоступна',SOURCE_UNAVAILABLE:'Источник недоступен',SOURCE_CHANGED:'Источник изменился',REVISION_CONFLICT:'Редакция изменилась',NOT_FOUND:'Не найдено',BACKUP_POLICY_UNVERIFIED:'Резервное хранение не подтверждено',APPROVAL_REQUIRED:'Требуется отдельное утверждение',APPROVAL_STALE:'Редакция устарела',LEGAL_HOLD:'Действует удержание'};
