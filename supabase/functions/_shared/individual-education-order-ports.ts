/** Narrow genuine SDK ports shared by the individual order workers. No IO or old renderer graph. */
type Result<T> = {data:T|null;error:unknown};
export interface IndividualOrderStorage {
  from(bucket:string):{
    info(path:string):PromiseLike<Result<unknown>>;
    download(path:string):PromiseLike<Result<Blob>>;
    upload(path:string,bytes:ArrayBuffer,options:{contentType:string;upsert:false;cacheControl:string;metadata?:Record<string,string>}):PromiseLike<Result<{id?:string}>>;
  };
}
export interface IndividualOrderService {
  rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>;
  storage:IndividualOrderStorage;
}
export interface IndividualOrderCaller extends IndividualOrderService {
  auth:{getUser(jwt:string):PromiseLike<{data:{user:{id:string}|null};error:unknown}>};
}
