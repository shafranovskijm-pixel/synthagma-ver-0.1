export const ports = {
 calls: [] as Array<{kind:string;name:string;args?:unknown;select?:string}>,
 tables: {} as Record<string, unknown>,
 rpc: async (_name:string,_args:unknown):Promise<{data:unknown;error:unknown}>=>({data:[],error:null}),
 fetchCalls:0,
};
export const supabase = {
 from(name:string){
  const call={kind:'from',name,select:''};ports.calls.push(call);
  if(!['lessons','test_attempts','profiles'].includes(name)) throw new Error('UNAPPROVED_TABLE');
  const q={select(value:string){call.select=value;return q;},eq(){return q;},in(){return q;},order(){return q;},
   then(ok:any,bad:any){return Promise.resolve(ports.tables[name]).then(ok,bad);}};
  return q;
 },
 rpc(name:string,args:unknown){ports.calls.push({kind:'rpc',name,args});return ports.rpc(name,args);},
};
