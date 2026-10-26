type Call = { method: string; args: unknown[] };
export const publicCatalogPort = { calls: [] as Call[] };
export const publicCatalogClient = { from(table: string) {
 if(table !== 'marketplace_courses') throw new Error('Unexpected public catalogue table');
 publicCatalogPort.calls.push({method:'from',args:[table]});
 const query = { select(...args:unknown[]){publicCatalogPort.calls.push({method:'select',args});return query;}, eq(...args:unknown[]){publicCatalogPort.calls.push({method:'eq',args});return query;},order(...args:unknown[]){publicCatalogPort.calls.push({method:'order',args});return query;},range(...args:unknown[]){publicCatalogPort.calls.push({method:'range',args});return query;},abortSignal(...args:unknown[]){publicCatalogPort.calls.push({method:'abortSignal',args});return query;},then(resolve: (value:unknown)=>unknown,reject:(error:unknown)=>unknown){return Promise.resolve({data:[],error:null}).then(resolve,reject);} };
 return query;
}};
