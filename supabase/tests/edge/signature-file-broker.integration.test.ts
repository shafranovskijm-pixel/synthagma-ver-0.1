// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {createUcSignatureFilesFixture} from '../../functions/_shared/uc-signature-files.fixture';
import {signatureFileRequest} from '../../functions/_shared/signature-file-broker';
it('connects the actual anonymous handler to real SQL token, exact revision, source provenance and expiry gates',async()=>{
 const db=await createUcSignatureFilesFixture();
 const org='00000000-0000-4000-8000-000000000100',owner='00000000-0000-4000-8000-000000000001';
 const signature='91000000-0000-4000-8000-000000000001',object='91000000-0000-4000-8000-000000000002',path=`${org}/signature-files/${signature}/${object}.pdf`,origin='https://safe.supabase.co';
 const actor=async(role:string,uid='')=>db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.sub','${uid}',false);SELECT set_config('request.jwt.claim.role','${role}',false);SET ROLE ${role}`);
 try{
  await actor('authenticated',owner);
  await db.query("INSERT INTO storage.objects(bucket_id,name,owner,owner_id,metadata)VALUES('external-contracts',$1,$2::uuid,$2::uuid::text,'{\"size\":20}')",[path,owner]);
  await db.query("SELECT create_external_contract_signature_v2($1,$2,'Synthetic.pdf','application/pdf','Synthetic broker integration','synthetic@example.invalid','Synthetic',NULL,$3)",[signature,path,org]);
  const data=(await db.query<any>('SELECT signature_token,current_revision_id FROM document_signatures WHERE id=$1',[signature])).rows[0];
  const before=(await db.query<any>('SELECT to_jsonb(s) value FROM document_signatures s WHERE id=$1',[signature])).rows[0].value;
  await actor('service_role');
  const rpc=vi.fn(async(_name:string,args:any)=>{try{return {data:(await db.query<any>('SELECT uc_signature_file_context($1,$2,$3) data',[args.p_token,args.p_kind,args.p_revision_id])).rows[0].data,error:null}}catch(e:any){return {data:null,error:{code:e.code}}}});
  const download=vi.fn(async()=>({data:new Blob(['Synthetic broker bytes']),error:null}));
  const signed=vi.fn(async(key:string)=>({data:{signedUrl:`${origin}/storage/v1/object/sign/external-contracts/${key}?token=synthetic-storage-token`},error:null}));
  const deps={supabaseUrl:origin,serviceConfigured:true,createDb:()=>({rpc,storage:{from:()=>({download,createSignedUrl:signed})}})};
  const request=(over:any={})=>new Request(origin+'/get-signature-file',{method:'POST',body:JSON.stringify({token:data.signature_token,revisionId:data.current_revision_id,...over})});
  expect((await signatureFileRequest(request(),deps)).status).toBe(200);expect(download).toHaveBeenCalledWith(path);expect(signed).toHaveBeenCalledWith(path,60);
  await db.exec("RESET ROLE");
  const after=(await db.query<any>('SELECT to_jsonb(s) value FROM document_signatures s WHERE id=$1',[signature])).rows[0].value;
  expect(after).toEqual(before);download.mockClear();signed.mockClear();await actor("service_role");
  expect((await signatureFileRequest(request({revisionId:object}),deps)).status).toBe(404);expect(download).not.toHaveBeenCalled();expect(signed).not.toHaveBeenCalled();
  await actor('authenticated',owner);await db.query("UPDATE document_signatures SET expires_at=now()-interval '1 second' WHERE id=$1",[signature]);await actor('service_role');
  expect((await signatureFileRequest(request(),deps)).status).toBe(410);expect(download).not.toHaveBeenCalled();expect(signed).not.toHaveBeenCalled();
 }finally{await db.close()}
},30000);
