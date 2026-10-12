// Isolated PostgreSQL with live catalog definitions and synthetic rows only.
// Never connects to hosted databases or SMTP. Encryption primitive is a test stub.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const [catalogPath,extraPath]=process.argv.slice(2);
const atomic=process.argv.includes('--bundle');
assert.ok(catalogPath&&extraPath,'Pass saved catalog and contact/report RPC metadata');
const catalog=JSON.parse(await readFile(catalogPath,'utf8'));
const extraRaw=JSON.parse(await readFile(extraPath,'utf8'));
const functions=[...catalog.functions,...(Array.isArray(extraRaw)?extraRaw:extraRaw.contact_report_rpc_backup)];
const read=p=>readFile(root+p,'utf8');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE_PATH||'D:/Codex/workspaces/2026-09-28/new-chat/work/crm-lovable-documents-api/node_modules/@electric-sql/pglite/dist/index.js').href);
const db=new PGlite();let assertions=0;
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const uid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const equal=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const actor=async n=>db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${uid(n)}'`);
const query=(sql,params)=>db.query(sql,params);
const rpc=async(name,args)=>(await query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
const denied=async(fn,pattern=/forbidden|not authorized|permission denied|row-level security|sender_not_found/)=>{
 await db.exec('SAVEPOINT expected_denial');
 await assert.rejects(fn,e=>pattern.test(e.message));assertions++;
 await db.exec('ROLLBACK TO SAVEPOINT expected_denial; RELEASE SAVEPOINT expected_denial');
};
const snapshot=async()=>({policies:(await query("SELECT * FROM pg_policies WHERE tablename LIKE 'mailing_%' ORDER BY tablename,policyname")).rows,
 functions:(await query("SELECT oid::regprocedure::text signature,pg_get_functiondef(oid) definition,proacl FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f' ORDER BY signature")).rows,
 tableAcl:(await query("SELECT relname,relacl FROM pg_class WHERE oid IN ('mailing_senders'::regclass,'mailing_deliverability_seeds'::regclass,'org_smtp_settings'::regclass) ORDER BY relname")).rows});
try{
 await db.exec('BEGIN');
 await db.exec(await read('docs/releases/sintagma-production/staff-workspace-20261012/synthetic-fixture.sql'));
 await db.exec(`CREATE SCHEMA extensions; DROP FUNCTION has_role(uuid,app_role); DROP FUNCTION has_role(app_role,uuid);
 CREATE FUNCTION public.encrypt_password(t text) RETURNS text LANGUAGE sql AS $$ SELECT 'ENC:fixture:'||md5(t) $$;
 CREATE FUNCTION public.decrypt_password(t text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture must not decrypt'; END $$;
 CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=now(); RETURN NEW; END $$;
 SET LOCAL check_function_bodies=off;`);
 const oldOrg=await read('supabase/migrations/20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql');
 await db.exec(oldOrg.match(/CREATE OR REPLACE FUNCTION public\.current_organization_id\([\s\S]*?\$\$;/)[0]);
 for(const t of catalog.tables){
  const columns=catalog.columns.filter(c=>c.table===t.name);
  await db.exec(`CREATE TABLE public.${ident(t.name)}(${columns.map(c=>ident(c.name)+' '+c.type+(c.not_null?' NOT NULL':'')+(c.default?' DEFAULT '+c.default:'')).join(',')})`);
  if(t.rls)await db.exec(`ALTER TABLE public.${ident(t.name)} ENABLE ROW LEVEL SECURITY`);
 }
 for(const c of catalog.constraints.filter(c=>/PRIMARY KEY|CHECK/.test(c.definition)))await db.exec(`ALTER TABLE public.${ident(c.table)} ADD CONSTRAINT ${ident(c.name)} ${c.definition}`);
 await db.exec('CREATE UNIQUE INDEX fixture_sender_org_email ON mailing_senders(organization_id,lower(from_email)); CREATE UNIQUE INDEX fixture_contacts_org_email ON mailing_contacts(organization_id,lower(email))');
 for(const f of functions)await db.exec(f.definition);
 const roles=new Set((await query('SELECT rolname FROM pg_roles')).rows.map(r=>r.rolname));
 const privilege={a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN',X:'EXECUTE'};
 const grants=async(acl,object,column=null)=>{
  for(const entry of acl||[]){
   const [,who,letters]=entry.match(/^([^=]*)=([^/]+)\//)||[];assert.ok(letters,entry);
   if(who&&!roles.has(who)){await db.exec('CREATE ROLE '+ident(who));roles.add(who);}
   for(const letter of letters.replaceAll('*',''))await db.exec(`GRANT ${privilege[letter]}${column?' ('+ident(column)+')':''} ON ${object} TO ${who?ident(who):'PUBLIC'}`);
  }
 };
 for(const t of catalog.tables)await grants(t.acl,'TABLE public.'+ident(t.name));
 for(const c of catalog.columns)await grants(c.acl,'TABLE public.'+ident(c.table),c.name);
 for(const f of functions){await db.exec('REVOKE ALL ON FUNCTION public.'+f.signature+' FROM PUBLIC');await grants(f.acl,'FUNCTION public.'+f.signature);}
 for(const p of catalog.policies)await db.exec(`CREATE POLICY ${ident(p.policyname)} ON public.${ident(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(ident).join(',')} ${p.qual?'USING ('+p.qual+')':''} ${p.with_check?'WITH CHECK ('+p.with_check+')':''}`);
 for(const t of catalog.triggers.filter(t=>['encrypt_mailing_sender_password_trg','mailing_senders_updated_at'].includes(t.name)))await db.exec(t.definition);
 await db.exec(`UPDATE org_staff SET sections_access='["sales.write"]' WHERE user_id IN ('${uid(3)}','${uid(9)}');
 INSERT INTO mailing_senders(id,organization_id,label,from_email,smtp_host,smtp_username,password_encrypted,imap_host,imap_username,smtp_status,imap_status,is_active,warmup_enabled)
 VALUES('${uid(901)}','${uid(100)}','Synthetic A','a@example.test','smtp.example.test','a@example.test','fixture-password','imap.example.test','a@example.test','ok','ok',true,true),
 ('${uid(902)}','${uid(200)}','Synthetic B','b@example.test','smtp.example.test','b@example.test','fixture-password','imap.example.test','b@example.test','ok','ok',true,false);
 INSERT INTO mailing_contacts(id,organization_id,email) VALUES('${uid(911)}','${uid(100)}','contact-a@example.test'),('${uid(912)}','${uid(200)}','contact-b@example.test');`);
 const before=await snapshot();
 const migration=await read('supabase/migrations/20261012160000_mailing_beta_sender_access.sql');
 await db.exec('SAVEPOINT drift');await db.exec('CREATE POLICY fixture_drift ON mailing_contacts FOR SELECT USING(true)');
 await denied(()=>db.exec(migration),/Mailing policy inventory drift/);await db.exec('ROLLBACK TO SAVEPOINT drift; RELEASE SAVEPOINT drift');
 if(atomic){
  await db.exec('CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]); COMMIT');
  const bundle=await read('docs/releases/sintagma-production/mailing-beta-20261012/release-transaction.sql');
  await db.exec("ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT fixture_ledger_failure CHECK(version<>'20261012160000')");
  await assert.rejects(()=>db.exec(bundle),e=>e.message.includes('fixture_ledger_failure'));assertions++;
  await db.exec('ROLLBACK');equal(await snapshot(),before,'ledger failure rolls back all DDL and grants');
  await db.exec('ALTER TABLE supabase_migrations.schema_migrations DROP CONSTRAINT fixture_ledger_failure');
  const applied=await db.exec(bundle);
  const result=applied.flatMap(r=>r.rows||[]).find(r=>r.release_result)?.release_result;
  equal(result?.checks_passed,50,'exact atomic bundle 50 asserting postchecks');
  equal(result?.preserved_security,true,'unrelated helpers/policies/grants/owners/triggers retained');
  equal((await query("SELECT statements FROM supabase_migrations.schema_migrations WHERE version='20261012160000'")).rows[0].statements,[migration],'exact source ledger');
  const committed=await snapshot();
  await assert.rejects(()=>db.exec(bundle),e=>e.message.includes('replay refused'));assertions++;
  await db.exec('ROLLBACK');equal(await snapshot(),committed,'replay refusal preserves release');
  await db.exec('BEGIN');
 } else await db.exec(migration);
 equal((await query("SELECT count(*)::int n FROM pg_policies WHERE tablename LIKE 'mailing_%' AND permissive='RESTRICTIVE'")).rows[0].n,10,'all restrictive revocation policies retained');
 for(const n of [3,6]){
  await actor(n);equal((await query('SELECT id FROM mailing_senders')).rows.length,1,'sales writer sees assigned tenant '+n);
  await rpc('save_mailing_sender',[uid(901),uid(100),{label:'Label '+n},null]);
  equal((await query('SELECT smtp_status,imap_status,is_active FROM mailing_senders WHERE id=$1',[uid(901)])).rows[0],{smtp_status:'ok',imap_status:'ok',is_active:true},'cosmetic edit preserves verification');
  await denied(()=>rpc('save_mailing_sender',[uid(902),uid(200),{label:'Foreign'},null]));
  await denied(()=>rpc('save_mailing_sender',[uid(902),uid(100),{label:'Foreign'},null]));
 }
 await actor(3);
 // A direct legacy write cannot bypass the new verification guard.
 await query("UPDATE mailing_senders SET smtp_host='legacy-edited.example.test' WHERE id=$1",[uid(901)]);
 equal((await query('SELECT smtp_status,is_active,warmup_enabled FROM mailing_senders WHERE id=$1',[uid(901)])).rows[0],{smtp_status:'untested',is_active:false,warmup_enabled:false},'direct SMTP update also resets verification');
 await db.exec('RESET ROLE');await query("UPDATE mailing_senders SET smtp_status='ok',imap_status='ok' WHERE id=$1",[uid(901)]);
 await actor(3);await rpc('set_mailing_sender_active',[uid(901),uid(100),true]);
 for(const [table,column] of [['mailing_senders','password_encrypted'],['mailing_deliverability_seeds','secret_encrypted'],['org_smtp_settings','password']]){
  const actual=catalog.columns.find(c=>c.table===table&&/password|secret/.test(c.name))?.name;assert.ok(actual);
  await denied(()=>query(`SELECT ${ident(actual)} FROM ${ident(table)}`),/permission denied/);
 }
 await denied(()=>rpc('save_mailing_sender',[uid(901),uid(100),{smtp_status:'ok'},null]),/unsupported_sender_setting/);
 await rpc('save_mailing_sender',[uid(901),uid(100),{smtp_host:'new-smtp.example.test'},null]);
 equal((await query('SELECT smtp_status,imap_status,is_active,warmup_enabled FROM mailing_senders WHERE id=$1',[uid(901)])).rows[0],
  {smtp_status:'untested',imap_status:'ok',is_active:false,warmup_enabled:false},'SMTP change clears only SMTP and disables sender/warmup');
 await denied(()=>rpc('set_mailing_sender_active',[uid(901),uid(100),true]),/sender_requires/);
 await denied(()=>rpc('set_mailing_sender_warmup',[uid(901),true,2]),/warmup_requires/);
 await db.exec('RESET ROLE');await query("UPDATE mailing_senders SET smtp_status='ok',imap_status='ok' WHERE id=$1",[uid(901)]);
 await actor(3);await rpc('set_mailing_sender_active',[uid(901),uid(100),true]);
 await rpc('save_mailing_sender',[uid(901),uid(100),{imap_host:'new-imap.example.test'},null]);
 equal((await query('SELECT smtp_status,imap_status,is_active FROM mailing_senders WHERE id=$1',[uid(901)])).rows[0],
  {smtp_status:'ok',imap_status:'untested',is_active:false},'IMAP change clears only IMAP');
 await rpc('save_mailing_sender',[uid(901),uid(100),{},'replacement-fixture-password']);
 equal((await query('SELECT smtp_status,imap_status FROM mailing_senders WHERE id=$1',[uid(901)])).rows[0],
  {smtp_status:'untested',imap_status:'untested'},'shared password invalidates both protocols');
 await db.exec('RESET ROLE');
 const secret=(await query('SELECT password_encrypted FROM mailing_senders WHERE id=$1',[uid(901)])).rows[0].password_encrypted;
 equal(secret.startsWith('ENC:fixture:'),true,'write invokes encryption primitive');
 await query("UPDATE mailing_senders SET smtp_status='ok',imap_status='ok' WHERE id=$1",[uid(901)]);
 await actor(3);await rpc('set_mailing_sender_active',[uid(901),uid(100),true]);await rpc('set_mailing_sender_warmup',[uid(901),true,2]);
 await rpc('set_mailing_sender_active',[uid(901),uid(100),false]);
 equal((await query('SELECT is_active,warmup_enabled FROM mailing_senders WHERE id=$1',[uid(901)])).rows[0],{is_active:false,warmup_enabled:false},'disable pauses warmup');
 const created=await rpc('save_mailing_sender',[null,uid(100),{label:'New draft',from_email:'draft@example.test',smtp_host:'smtp.example.test',smtp_username:'draft@example.test'},'fixture-password']);
 equal(Object.keys(created),['id'],'create returns only id');
 equal((await query('SELECT is_active,smtp_status,imap_status FROM mailing_senders WHERE id=$1',[created.id])).rows[0],{is_active:false,smtp_status:'untested',imap_status:'untested'},'new sender starts inactive/unverified');
 for(const n of [4,5,8,9]){await actor(n);equal((await query('SELECT id FROM mailing_senders')).rows.length,0,'teacher/expired/student/revoked sender read denied '+n);await denied(()=>rpc('save_mailing_sender',[uid(901),uid(100),{label:'Forbidden'},null]));}
 // Default admin can read sales but cannot write; personal override is required.
 await db.exec(`RESET ROLE; UPDATE org_staff SET sections_access='[]' WHERE user_id='${uid(3)}'`);await actor(3);
 equal((await query('SELECT id FROM mailing_contacts')).rows.length,1,'sales.read sees contacts');
 equal((await query("UPDATE mailing_contacts SET city='Forbidden' RETURNING id")).rows.length,0,'sales.read cannot mutate contacts');
 await denied(()=>rpc('import_mailing_contacts',[uid(100),[{email:'new@example.test'}]]));
 await denied(()=>rpc('import_mailing_senders_batch',[uid(100),[{email:'new@example.test',password:'fixture'}]]));
 await denied(()=>rpc('activate_verified_mailing_senders',[uid(100)]));
 for(const n of [1,2]){await actor(n);await rpc('save_mailing_sender',[uid(901),uid(100),{label:'Authorized '+n},null]);assertions++;}
 await db.exec('RESET ROLE; ROLLBACK');
 if(atomic)equal((await query('SELECT count(*)::int n FROM mailing_senders')).rows[0].n,2,'post-release synthetic business mutations rolled back');
 else equal((await query("SELECT to_regclass('public.mailing_senders') value")).rows[0].value,null,'all fixture business/schema changes rolled back');
 const result={passed:true,assertions,isolatedInMemory:true,liveApplied:false,mailSent:false,
  atomicBundleTested:atomic,postchecks:atomic?50:undefined,
  cryptoPrimitive:'Deterministic fixture stub; real trigger and RPC call path tested, production encryption not attested.'};
 await writeFile(root+'docs/releases/sintagma-production/mailing-beta-20261012/'+(atomic?'validation-atomic.json':'validation.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){console.error(JSON.stringify({passed:false,assertions,code:error.code,message:error.message,where:error.where}));process.exitCode=1;}
finally{await db.close();}
