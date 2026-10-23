// Exact captured DEFAULT ACL semantics, not provider role login/membership emulation.
import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
const sourcePath='supabase/tests/fixtures/uc019-provider-default-acl-actual621.json';
const sourceHash='3f7e74a4f506451b4af7590f6e47c37699bc93d0e9090ea4f0f7d138288ebc92';
const one=async(db:any,sql:string,args:any[]=[])=>((await db.query(sql,args)).rows[0]);
const defaultSQL=`SELECT coalesce(jsonb_agg(jsonb_build_object('kind',d.defaclobjtype,'grants',(SELECT jsonb_agg(jsonb_build_object('grantee',pg_get_userbyid(a.grantee),'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)ORDER BY pg_get_userbyid(a.grantee),a.privilege_type,a.is_grantable)FROM aclexplode(d.defaclacl)a))ORDER BY d.defaclobjtype),'[]')d FROM pg_default_acl d WHERE d.defaclnamespace='public'::regnamespace AND d.defaclrole='postgres'::regrole AND d.defaclobjtype IN('r','f')`;
export async function installProviderDefaults(db:any){
 const raw=readFileSync(sourcePath);if(createHash('sha256').update(raw).digest('hex')!==sourceHash)throw Error('Exact actual DEFAULT ACL source required');const source=JSON.parse(raw.toString('utf8'));
 if(JSON.stringify(source.roles)!==JSON.stringify(['sandbox_exec_atxwvjxbqjgkbjlhsdch','sandbox_exec'])||source.defaults.length!==2)throw Error('Exact two captured provider roles/default ACLs required');
 for(const role of source.roles){const prior=await one(db,'SELECT count(*)::int n FROM pg_roles WHERE rolname=$1',[role]);if(prior.n!==0)throw Error('Owned provider fixture role must initially be absent');await db.exec('CREATE ROLE "'+role+'" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');}
 await db.exec('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres,anon,authenticated,service_role;ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO sandbox_exec_atxwvjxbqjgkbjlhsdch,sandbox_exec;ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO postgres,anon,authenticated,service_role,sandbox_exec_atxwvjxbqjgkbjlhsdch');
 const expected=(await one(db,`SELECT jsonb_agg(jsonb_build_object('kind',x->>'defaclobjtype','grants',(SELECT jsonb_agg(jsonb_build_object('grantee',pg_get_userbyid(a.grantee),'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)ORDER BY pg_get_userbyid(a.grantee),a.privilege_type,a.is_grantable)FROM aclexplode(ARRAY(SELECT jsonb_array_elements_text(x->'defaclacl'))::aclitem[])a))ORDER BY x->>'defaclobjtype')d FROM jsonb_array_elements($1::jsonb)x`,[JSON.stringify(source.defaults)])).d;
 const current=(await one(db,defaultSQL)).d;if(JSON.stringify(current)!==JSON.stringify(expected))throw Error('Native expanded DEFAULT ACL semantics must match captured actual621');
 // Restore the already captured old batch grant too. This is not a new grant in
 // production; raw K must preserve it while closing only the 77 new functions.
 await db.exec('GRANT EXECUTE ON FUNCTION public.issue_education_document_batch(uuid,uuid,uuid,jsonb)TO sandbox_exec_atxwvjxbqjgkbjlhsdch');
 const oldBatch=await one(db,"SELECT has_function_privilege('sandbox_exec_atxwvjxbqjgkbjlhsdch','public.issue_education_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')allowed");if(!oldBatch.allowed)throw Error('Captured old provider batch grant required before622');
 return{sourceHash,roles:source.roles,semantics:current,exactTwoActualDefaultACLsRestored:true,isolatedNoLoginRoleIdentitiesOnly:true,providerRoleLoginMembershipParityNotClaimed:true,oldCapturedBatchGrantPresent:true};
}
export async function verifyProviderDefaultsAfter(db:any,before:any,newFunctions:string[],newTables:string[]){
 if(JSON.stringify((await one(db,defaultSQL)).d)!==JSON.stringify(before.semantics))throw Error('Raw622 must not alter global default ACLs');
 for(const role of before.roles){for(const signature of newFunctions){if((await one(db,'SELECT has_function_privilege($1,$2,\'EXECUTE\')allowed',[role,signature])).allowed)throw Error('Provider direct execute on new private function '+signature);}for(const table of newTables){const row=await one(db,"SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')OR has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES')allowed",[role,'public.'+table]);if(row.allowed)throw Error('Provider direct privilege on new private table '+table);}}
 if(!(await one(db,"SELECT has_function_privilege('sandbox_exec_atxwvjxbqjgkbjlhsdch','public.issue_education_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')allowed")).allowed)throw Error('Existing old batch provider grant must remain');
 return{...before,all77NewFunctionsProviderExecuteDenied:true,all8NewTablesProviderDirectPrivilegeDenied:true,globalDefaultACLUnchanged:true,oldCapturedBatchProviderGrantPreserved:true,noOldObjectGrantRevoked:true};
}
