import {state,call,SECRET} from './telephony-ports';
export class NovofonApiError extends Error{code?:number;mnemonic?:string;status?:number;constructor(message:string,options:any={}){super(message);Object.assign(this,options);}}
export const describeNovofonError=()=>{throw Error('RAW_ERROR_DESCRIPTION_FORBIDDEN')};
export const normalizeNovofonPhone=(x:string)=>x.replace(/[^0-9]/g,'');
export const getConfiguredVirtualPhoneNumber=()=>{call('configVirtual',[]);return '79000000001';};
export const getConfiguredOperatorNumber=(fallback='')=>{call('configOperator',[fallback]);return '79000000002';};
export const getConfiguredSipLogin=()=>{call('configSip',[]);return 'synthetic-sip';};
export const hasClassicApiCredentials=()=>state.classic;
export const hasCallApiCredentials=()=>state.callApi;
export async function novofonClassicRequest(...args:any[]){call('classic',args);return state.classicResponse??{status:'success',time:123,key:'synthetic-webrtc-key'};}
export const novofonRequest=novofonClassicRequest;
export async function novofonRpc(...args:any[]){call('rpc',args);return{call_session_id:123};}
export async function novofonDataRpc(...args:any[]){call('data',args);return args[0]==='get.virtual_numbers'?[{virtual_phone_number:'79000000001',status:'active'}]:[{full_record_file_link:'https://media.invalid/own-fresh-record',talk_duration:4}];}
export async function getNovofonEmployees(){call('employees',[]);return[{id:1}];}
export async function resolveNovofonEmployee(...args:any[]){call('resolveEmployee',args);return{employee:{id:1},reason:'matched',phoneNumber:'79000000002'};}
export async function startNovofonEmployeeCall(...args:any[]){call('employeeCall',args);return{data:{call_session_id:123},employee:{id:1,full_name:'Synthetic operator'},employeePhoneNumber:'79000000002'};}
