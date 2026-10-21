import {readFile,writeFile,lstat,readdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,relative,dirname,basename,isAbsolute} from 'node:path';
import {createServer} from 'vite';
import ts from 'typescript';
const folder=new URL('./',import.meta.url),root=new URL('../../../../',folder);
const norm=s=>s.replaceAll('\r\n','\n'),hash=(s,a='sha256')=>createHash(a).update(norm(s)).digest('hex');
const read=async p=>norm(await readFile(new URL(p,root),'utf8'));
// The111manifest and archived Git blobs are immutable witnesses, never current runtime.
const archivePath='docs/releases/sintagma-production/uc-program-facts-source-archive-20261019/';
const historicalFolder='docs/releases/sintagma-production/uc-program-facts-20261018/';
const archiveSha='0ac85bbd2159398ec5b338e066e3ba2165dfe80d775dfb8b14b179391c68f094';
const historicalSha='ccc1db421d6068a62af99fff68aa4a65727629b4c9fef24ee336841d5b6916cf';
async function verifyHistoricalArchive(){
 const fail=()=>{throw Error('Historical111 immutable archive mismatch');};
 const indexSource=await read(archivePath+'manifest.json');if(hash(indexSource)!==archiveSha||hash(await read(historicalFolder+'release-manifest.json'))!==historicalSha)fail();
 const index=JSON.parse(indexSource),original=JSON.parse(await read(historicalFolder+'release-manifest.json'));
 if(index.schemaVersion!==1||index.sourceCommit!=='d1089fc11c1115800e2b24423783eb324744e7b1'||index.entryCount!==18||index.objectCount!==18||index.entries.length!==18||original.productFiles.length!==18||index.originalReleaseManifest.canonicalLfSha256!==historicalSha)fail();
 const expected=new Map(original.productFiles.map(f=>[f.path,f.sourceSha256])),seen=new Set(),objects=new Set();
 for(const part of [new URL(archivePath,root),new URL(archivePath+'objects/',root)])if((await lstat(part)).isSymbolicLink()||await realpath(part)!==fileURLToPath(part).replace(/[\\/]$/,''))fail();
 if(JSON.stringify((await readdir(new URL(archivePath,root))).sort())!==JSON.stringify(['.gitattributes','manifest.json','objects'])||await read(archivePath+'.gitattributes')!=='objects/*.source -text\n')fail();
 for(const e of index.entries){const digest=expected.get(e.originalPath),name=`${digest}.source`,url=new URL(archivePath+'objects/'+name,root),stat=await lstat(url);
  if(!digest||seen.has(e.originalPath)||e.sourceCommit!==index.sourceCommit||e.rawSha256!==digest||e.canonicalLfSha256!==digest||e.archivePath!==archivePath+'objects/'+name||stat.isSymbolicLink()||!stat.isFile())fail();
  const bytes=await readFile(url);if(bytes.length!==e.sourceByteLength||createHash('sha256').update(bytes).digest('hex')!==digest||!bytes.equals(Buffer.from(norm(bytes.toString('utf8'))))||createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex')!==e.sourceGitBlobOid)fail();seen.add(e.originalPath);objects.add(name);
 }
 if(seen.size!==18||objects.size!==18||JSON.stringify((await readdir(new URL(archivePath+'objects/',root))).sort())!==JSON.stringify([...objects].sort()))fail();
 return{path:archivePath+'manifest.json',sourceSha256:archiveSha,originalManifest:{path:historicalFolder+'release-manifest.json',sourceSha256:historicalSha},sourceCommit:index.sourceCommit,entries:index.entries};
}
const historicalArchive=await verifyHistoricalArchive();
const unchangedHistoricalReleaseFiles=[{"path":"docs/releases/sintagma-production/uc-program-facts-20261018/release-manifest.json","sourceSha256":"ccc1db421d6068a62af99fff68aa4a65727629b4c9fef24ee336841d5b6916cf"},{"path":"docs/releases/sintagma-production/uc-program-facts-20261018/prepare-release.mjs","sourceSha256":"373422a24c8517196b7910132967237febabf018f51b5ee0fde22cd0bda015f5"},{"path":"docs/releases/sintagma-production/uc-program-facts-20261018/release-transaction.sql","sourceSha256":"e9b50a1c00d88fccb826adc6f70f728f84f352c5232a607252e01c3d6c335142"},{"path":"docs/releases/sintagma-production/uc-program-facts-20261018/preflight.sql","sourceSha256":"667d2cfa9072c1a6c5d7caffe089a1f87b2b0ad6b269de7bbf18f0b8fe6abab6"},{"path":"docs/releases/sintagma-production/uc-program-facts-20261018/postcheck.sql","sourceSha256":"80e1e6f71fff4547c907e1a98d6be1fcd8c2154c9ab616d98187f58ba3cb7f2b"}];
for(const f of unchangedHistoricalReleaseFiles)if(hash(await read(f.path))!==f.sourceSha256)throw Error("Changed historical111 release file "+f.path);
const quote=s=>"'"+s.replaceAll("'","''")+"'",list=a=>a.map(quote).join(',');
const file='20261019120000_uc_group_education_facts.sql',source=await read('supabase/migrations/'+file);
const migration={file,version:file.slice(0,14),name:file.slice(15,-4),sourceSha256:hash(source),sourceMd5:hash(source,'md5')};
// Source-only fold of the already reviewed47→48→51 sequence; metadata is regenerated below.
const counterWitnessPath='docs/releases/sintagma-production/uc-group-education-facts-20261019/counter51-integration-witness.json';
const counterWitnessRaw=await read(counterWitnessPath),counterWitness=JSON.parse(counterWitnessRaw);
if(hash(counterWitnessRaw)!=='6e6a0289efbaf9ecb937b6aa4bc7ab045ce9627666456d26d74800692062a729'||counterWitness.expectedFunctions51.length!==51||counterWitness.foldedMigrationSha256!==migration.sourceSha256)throw Error('Exact reviewed counter51 witness required');
const counterExtension=await read('docs/releases/sintagma-production/uc-group-education-facts-20261019/counter51-reviewed-extension.sql');
if(hash(counterExtension)!==counterWitness.counterSha256||!source.endsWith(counterWitness.foldSeparator+counterExtension)||hash(source.slice(0,-(counterWitness.foldSeparator+counterExtension).length))!==counterWitness.mode48Sha256)throw Error('Exact mode48 prefix and counter51 suffix required');
// Only the SHA-pinned counter extension has transport BEGIN/COMMIT. The ledger
// stores raw canonical source; the executable removes exactly this reversible pair.
const mode48Prefix=source.slice(0,-(counterWitness.foldSeparator+counterExtension).length);
const extensionBegin=counterExtension.indexOf('BEGIN;\n');
if(/^BEGIN(?: ISOLATION.*)?;$/m.test(mode48Prefix)||/^COMMIT;$/m.test(mode48Prefix)||extensionBegin<0
 ||[...counterExtension.matchAll(/^BEGIN;$/gm)].length!==1||[...counterExtension.matchAll(/^COMMIT;$/gm)].length!==1||!counterExtension.endsWith('COMMIT;\n'))throw Error('Exact counter-only transport framing required');
const executableExtension=counterExtension.slice(0,extensionBegin)+counterExtension.slice(extensionBegin+'BEGIN;\n'.length,-'COMMIT;\n'.length);
if(executableExtension.slice(0,extensionBegin)+'BEGIN;\n'+executableExtension.slice(extensionBegin)+'COMMIT;\n'!==counterExtension)throw Error('Nonreversible counter transport framing');
const executable=mode48Prefix+counterWitness.foldSeparator+executableExtension;
if(/^BEGIN(?: ISOLATION.*)?;$/m.test(executable)||/^COMMIT;$/m.test(executable)||hash(executable)!=='8480fa73eb403e8c9611aafe6121ef622287ea55e23a2b638259d01b1bd9b361')throw Error('Exact reviewed counter51 executable required');
migration.executableMd5=hash(executable,'md5');migration.executableSha256=hash(executable);
migration.transportFraming={rule:'Remove exactly one BEGIN; and final COMMIT; from the SHA-pinned counter51 extension only; raw ledger source unchanged.',counterExtensionSha256:counterWitness.counterSha256,reversible:true};
// Original26 passed on PostgreSQL17. This pins its actual51 catalog, not a current
// UC014/015/017/postpricing acceptance claim. Old48 table metadata cannot be reused.
const native51MetadataPath='docs/releases/sintagma-production/uc-group-education-facts-20261019/native51-accepted-full26-metadata.json';
const native51Raw=await read(native51MetadataPath),native51Metadata=JSON.parse(native51Raw);
if(hash(native51Raw)!=='2541eacd7496cce5e96a17baff294ebd676a755f37b4ef1f252a86246b061ea5'||native51Metadata.result.sha256!=='15bc0f137f135ec94dd3a58332c874872baf84f81287ddfebf0c06456069468a'||native51Metadata.result.tests!==26||native51Metadata.result.passed!==26||native51Metadata.result.failed!==0||native51Metadata.expectedPortableCatalog51.length!==51)throw Error('Exact accepted native26/51 metadata required');
for(const expected of counterWitness.expectedPortableCatalog51){const actual=native51Metadata.expectedPortableCatalog51.find(f=>f.signature===expected.signature);if(!actual||JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Native51 portable registry drift '+expected.signature);}
const privacyStackPath='docs/releases/sintagma-production/uc-full-cycle-20261021/privacy-stack-source-plan.json';
const privacyStackRaw=await read(privacyStackPath),privacyStack=JSON.parse(privacyStackRaw);
if(hash(privacyStackRaw)!=='f01acc00821f2082703f45c43601cc004b5924cd9b44745d3601721c1681545c'||privacyStack.status!=='CAPTURED_AND_REVIEWED_POSTPRICING_EXACT_SEQUENCE'||privacyStack.freshCapture.rootReviewed!==true||!privacyStack.freshCapture.artifact||!privacyStack.freshCapture.artifactSha256)throw Error('Fresh postpricing capture and reviewed UC013→014→015→017 privacy stack required before any fixture engine');
const actualCaptureRaw=await read(privacyStack.freshCapture.artifact),actualCapture=JSON.parse(actualCaptureRaw).rows?.[0]?.portable_capture;
if(hash(actualCaptureRaw)!==privacyStack.freshCapture.artifactSha256||actualCapture?.capture_kind!=='UC013_POST_SGT609_PORTABLE28_READONLY'||actualCapture.ledger_rows!==609||actualCapture.captured_dependency_count!==28||actualCapture.missing_signatures.length||JSON.stringify(actualCapture.context.resolved_schemas)!==JSON.stringify(['pg_catalog','public'])||actualCapture.context.timezone!=='UTC'||actualCapture.context.transaction_read_only!=='on')throw Error('Exact actual609 readonly dependency source capture required');


const previousFolder='docs/releases/sintagma-production/uc-admission-cases-20261019/';
const previousReleaseFiles=[{"path":"docs/releases/sintagma-production/uc-admission-cases-20261019/manifest.json","sourceSha256":"ecfc67886e9eb5e9a97d4951eb38ed95563fb10dab262e2c4eead3444717a842"},{"path":"docs/releases/sintagma-production/uc-admission-cases-20261019/prepare.mjs","sourceSha256":"4062f66b717507fcdf957ad9dcdda2f571bdb3cf8453b219969f9a596101b016"},{"path":"docs/releases/sintagma-production/uc-admission-cases-20261019/reviewed-source-anchors.json","sourceSha256":"6dc618a3fd22fb4b08a727ee5e1142e09d3561c23cc28928d14ba954d9db55a8"},{"path":"docs/releases/sintagma-production/uc-admission-cases-20261019/preflight.sql","sourceSha256":"fe869e4cc6604c64a6b95a208e61b8735652ce9ee6b15135a1f0510d53bcea3a"},{"path":"docs/releases/sintagma-production/uc-admission-cases-20261019/postcheck.sql","sourceSha256":"849e104bc96b3ade0a18a9974cbdc5d0bad80b20deb60e2fe632496fa2533617"},{"path":"docs/releases/sintagma-production/uc-admission-cases-20261019/production-batch.sql","sourceSha256":"f01a89f3d1387cd9d423c6e26179bcaec9b89bf5c2eec33e87b72a12728ef0e0"}];
for(const f of previousReleaseFiles)if(hash(await read(f.path))!==f.sourceSha256)throw Error('Changed immutable115 release file '+f.path);
const previous=JSON.parse(await read(previousFolder+'manifest.json'));
const prior=[...previous.priorMigrations,...previous.migrations];
if(prior.length!==16)throw Error('Expected exact100-115 prerequisite');
for(const m of prior)if(hash(await read('supabase/migrations/'+m.file),'md5')!==m.sourceMd5)throw Error('Changed prerequisite source '+m.version);
const urgentFile='20261020050000_students_page_scope_evaluation.sql',urgentSource=await read('supabase/migrations/'+urgentFile);
const urgent={file:urgentFile,version:'20261020050000',name:'students_page_scope_evaluation',sourceMd5:hash(urgentSource,'md5'),sourceSha256:hash(urgentSource),rpcDefinitionMd5:'f38189a9960f714e43a3ebcbc60f336e'};
if(urgent.sourceSha256!=='97a8b98cd254790b724bdf0aa4638fae49a38468c644c272eb904760bf814517'||urgent.sourceMd5!=='52b7991123db54e5e6baa856fe5ebf98')throw Error('Exact released urgent20050000 source required');
const urgentFlags=` (SELECT count(*)=1 FROM supabase_migrations.schema_migrations WHERE version='${urgent.version}' AND name='${urgent.name}' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='${urgent.sourceMd5}') AS exact_urgent20050000_ledger,
 coalesce(md5(pg_get_functiondef(to_regprocedure('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)')))='${urgent.rpcDefinitionMd5}',false) AS exact_urgent_students_rpc,`;
const preserved=[...new Set([...previous.preservedTables,...previous.expectedTables.map(t=>'public.'+t.table),...['organization_monthly_course_usage','organization_monthly_student_assignments','organization_monthly_training_completions'].map(t=>'public.'+t)])];
if(preserved.length!==80)throw Error('Expected80 preserved prior and monthly quota relations');
const tables=['uc_group_education_states','uc_group_education_events','uc_group_calendar_versions','uc_group_roster_snapshots','uc_group_education_requests'];
const functions=[...source.matchAll(/^CREATE FUNCTION public[.]([a-z_]+)[(]/gm)].map(m=>m[1]);
if(functions.length!==51||new Set(functions).size!==51||!functions.includes('uc_group_education_actor_facts')||!['uc_group_education_budget_counter','uc_group_education_budget_ticket_guard','uc_group_education_compact_budget_tickets'].every(name=>functions.includes(name)))throw Error('Exact integrated51 registry required');
const changed=['account_deletion_snapshot','account_deletion_personal_row_counts','account_deletion_erase_data','uc_guard_program_artifact'];
const baselinePath='supabase/tests/fixtures/uc-group-education-facts-baseline.json';
const baseline=JSON.parse(await read(baselinePath));
const dependencies=baseline.fixtureSelection.dependencySignatures.map(signature=>{const f=baseline.functions.find(f=>f.signature===signature);if(!f||hash(f.definition,'md5')!==f.definition_md5)throw Error('Missing/changed captured dependency '+signature);return {signature:'public.'+signature,definition_md5:f.definition_md5};});
if(dependencies.length!==28||new Set(dependencies.map(f=>f.signature)).size!==28)throw Error('Expected28 exact source/authority dependencies');
const sourceAnchorsPath='docs/releases/sintagma-production/uc-group-education-facts-20261019/reviewed-source-anchors.json';
const anchors=JSON.parse(await read(sourceAnchorsPath));
const candidate=process.argv.includes('--candidate');
if((anchors.status!=='FROZEN_WITH_SQL_SOURCE'&&!(candidate&&anchors.status==='HELD_FOR_NATIVE_VALIDATION'))||anchors.fourOnly.length!==4||anchors.migrationCanonicalLfSha256!==migration.sourceSha256)throw Error('Freeze reviewed four-body anchors only after SQL source freeze');
const reviewedChanges=anchors.fourOnly.map(p=>{
 const before=baseline.functions.find(f=>f.signature===p.signature);
 if(!before||before.definition_md5!==p.beforeMd5||hash(before.definition,'md5')!==p.beforeMd5)throw Error('Unreviewed prior body '+p.signature);
 let definition=before.definition;
 for(const a of p.anchors){if(definition.split(a.needle).length!==2)throw Error('Exact source anchor count '+p.signature);definition=definition.replace(a.needle,a.replacement);}
 return{signature:p.signature,historical_before_definition_md5:p.historicalBeforeMd5??p.beforeMd5,before_definition_md5:p.beforeMd5,definition_md5:hash(definition,'md5')};
});
const ledger=items=>items.map(s=>`(version='${s.version}' AND name='${s.name}' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='${s.sourceMd5}')`).join(' OR ');
// PG17/18 semantic parity: attnotnull is retained; only redundant PG18
// pg_constraint NOT NULL rows are omitted from the portable fingerprint.
const tableShape=t=>`SELECT md5(jsonb_build_object(
 'owner_acl',(SELECT jsonb_build_array(pg_get_userbyid(relowner),relacl::text) FROM pg_class WHERE oid='public.${t}'::regclass),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attacl) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.${t}'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.${t}'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='${t}'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='${t}'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.${t}'::regclass AND NOT tgisinternal),
 'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.${t}'::regclass))::text) hash`;
const legacyTables=['group_program_bindings','group_program_enrollment_snapshots'];
const legacyManifest=JSON.parse(await read(historicalFolder+'release-manifest.json'));
const linkedConstraintPredicate=(c,ref='pg_constraint')=>`${ref}.conrelid='${c.schema_name}.${c.table_name}'::regclass AND ${ref}.conname=${quote(c.name)} AND ${ref}.contype='t' AND md5(pg_get_constraintdef(${ref}.oid))='${c.definition_md5}' AND EXISTS(SELECT 1 FROM pg_trigger nt WHERE nt.tgconstraint=${ref}.oid AND nt.tgrelid='${c.schema_name}.${c.table_name}'::regclass AND nt.tgname=${quote(c.trigger_name)} AND nt.tgenabled='${c.enabled}' AND md5(pg_get_triggerdef(nt.oid))='${c.trigger_definition_md5}')`;
const legacyTableShape=(t,exclude=[])=>tableShape(t)
 .replace(" 'owner_acl',(SELECT jsonb_build_array(pg_get_userbyid(relowner),relacl::text) FROM pg_class WHERE oid='public."+t+"'::regclass),\n",'')
 .replace("AND contype<>'n')",`AND contype<>'n'${exclude.length?' AND NOT('+expectedNewConstraints.filter(c=>c.table_name===t&&exclude.includes(c.trigger_name)).map(c=>'('+linkedConstraintPredicate(c)+')').join(' OR ')+')':''})`)
 .replace('AND NOT tgisinternal)',`AND NOT tgisinternal${exclude.length?' AND tgname NOT IN('+list(exclude)+')':''})`);
// Preserve old relation structure and grants independently from intentional new
// triggers/policies, which have their own old-only and exact-new witnesses.
// This compares metadata inside one database; type/collation/owner OIDs never
// cross environments. attnotnull keeps NOT NULL semantics on PG17 and PG18.
const preservedShape=`SELECT md5(jsonb_build_object(
 'relation',(SELECT jsonb_build_array(relowner,relacl,relrowsecurity,relforcerowsecurity,relkind,relpersistence,reloptions,relreplident,relispartition,relam,reltablespace) FROM pg_catalog.pg_class WHERE oid=t::regclass),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated,a.attcollation,a.attacl,a.attstorage,a.attcompression,a.attoptions,a.attfdwoptions) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=t::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,contype,condeferrable,condeferred,convalidated,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_catalog.pg_constraint WHERE conrelid=t::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexrelid::regclass::text,pg_get_indexdef(indexrelid),indisunique,indisprimary,indisexclusion,indimmediate,indisclustered,indisvalid,indisready,indislive,indisreplident) ORDER BY indexrelid::regclass::text) FROM pg_catalog.pg_index WHERE indrelid=t::regclass))::text)`;
// The production preparation route consumes actual FC01 stage51 metadata. It
// only reads/verifies files and authors SQL: no Vite/PGlite/PostgreSQL starts.
const argValue=name=>{const prefix='--'+name+'=';const found=process.argv.filter(a=>a.startsWith(prefix));if(found.length>1)throw Error('Duplicate '+name);return found[0]?.slice(prefix.length);};
const nativeFile=argValue('native-stage51-metadata-file');
let nativeStage51Preparation=null;
async function actualNativeStage51(){
 const workspace=resolve(fileURLToPath(root),'../..');
 const localPath=value=>{if(!value||!isAbsolute(value))throw Error('Explicit absolute native evidence file required');const p=resolve(value),rel=relative(workspace,p);if(rel==='..'||rel.startsWith('..'+String.fromCharCode(92))||rel.startsWith('../')||isAbsolute(rel))throw Error('Native evidence outside workspace');return p;};
 const checked=async(name)=>{const p=localPath(argValue(name+'-file')),sha=argValue(name+'-sha256');if(!/^[a-f0-9]{64}$/.test(sha||''))throw Error('Explicit actual '+name+' SHA required');const raw=await readFile(p);if(createHash('sha256').update(raw).digest('hex')!==sha)throw Error('Actual '+name+' file drift');return{path:p,sha256:sha,value:JSON.parse(raw.toString('utf8'))};};
 const capture=await checked('native-stage51-metadata'),result=await checked('native10-result'),profile=await checked('native10-manifest');
 if(basename(result.path)!=='result.json'||basename(dirname(dirname(result.path)))!=='results'||!basename(dirname(result.path)).startsWith('uc-full-cycle-native-linux-'))throw Error('Owned actual native10 result required');
 const n=result.value,m=profile.value,c=m.actualTestContract,requiredChecks=['exactActual10Counts','exactSingleCombinedSuite','all10ExactAssertionTitlesPassed','adapterPass','exact10SequentialDatabasesClosed','threeInitiallyAbsentRolesExactlyRestored','oneExactConstructorSeam','exactReadyClusterForAdapter','actualFolded51StageInstalledForEveryCase','all10CaseFactsRecorded','nativeRaceSessionsIndependent','actualFC09FailFastWinnerFence','actualFC10ErasureFenceNoResurrection','sourceMirrorRuntimePinsUnchanged'];
 if(n.status!=='PASS'||n.kind!=='ACTUAL_UC013_017_COMBINED_NATIVE10_LINUX_NODE_WSL_PG17'||n.manifestSha256!==profile.sha256||n.allOriginalAndNewSourcePinsUnchanged!==true||!requiredChecks.every(k=>n.checks?.[k]===true)||!Object.values(n.checks||{}).every(v=>v===true))throw Error('Exact actual combined native10 security/race proof required');
 if(JSON.stringify(n.actualCounts)!==JSON.stringify({success:true,numTotalTests:10,numPassedTests:10,numFailedTests:0,numPendingTests:0,numTodoTests:0})||n.PGStarts!==1||n.testLaunches!==1||n.NodeVersionLaunches!==0||n.automaticRetries!==0||n.cloud!==0||n.installs!==0||n.ownedNodeStop?.status!=='PASS_OWNED_LINUX_NODE_HELPER_EXITED_AND_CAPTURED_OBJECTS_CLEANED'||n.ownedPgStop?.status!=='PASS_OWNED_WSL_PG17_STOPPED')throw Error('Actual native10 single run/cleanup proof required');
 const migrationNames=['20261019120000_uc_group_education_facts.sql','20261020140000_uc_learning_outcome_foundation.sql','20261020150000_uc_server_custom_journals.sql','20261021160000_uc_conducted_sessions.sql'];
 if(c?.expectedCases!==10||c.expectedDatabases!==10||Object.keys(c.migrationCanonicalSHA256||{}).length!==4)throw Error('Native10 exact four migration contract required');
 for(const name of migrationNames)if(hash(await read('supabase/migrations/'+name))!==c.migrationCanonicalSHA256[name])throw Error('Native10 current migration source changed '+name);
 let bound=false;
 for(const e of Object.values(n.evidence||{})){const p=localPath(e.path);if(dirname(p)!==dirname(result.path)||createHash('sha256').update(await readFile(p)).digest('hex')!==e.sha256)throw Error('Actual native10 evidence drift');if(p===capture.path&&e.sha256===capture.sha256)bound=true;}
 if(!bound)throw Error('Stage51 metadata must be actual native10 evidence');
 for(const e of m.originalPins){const p=resolve(workspace,e.path),bytes=await readFile(p);if(bytes.length!==e.bytes||createHash('sha256').update(bytes).digest('hex')!==e.sha256)throw Error('Native10 frozen source drift '+e.path);}
 const found=[];const find=(x,depth=0)=>{if(depth>8)return;if(Array.isArray(x)){for(const a of x)find(a,depth+1);}else if(x&&typeof x==='object'){if(x.kind==='UC013_STAGE51_NATIVE_PREPARE_METADATA_V1'){found.push(x);return;}for(const key of['rows','structuredContent','result','metadata','stage51_metadata','capture'])if(key in x)find(x[key],depth+1);}};find(capture.value);
 if(found.length!==1)throw Error('One actual stage51 metadata payload required');const data=found[0],ctx=data.context;
 if(data.migration_source_sha256!==migration.sourceSha256||ctx?.search_path!=='pg_catalog,public'||JSON.stringify(ctx.resolved_schemas)!==JSON.stringify(['pg_catalog','public'])||ctx.timezone!=='UTC'||ctx.current_user!=='postgres'||ctx.session_user!=='postgres'||ctx.database!=='uc116_case_001'||Number(ctx.server_version_num)<170000||Number(ctx.server_version_num)>=180000)throw Error('Actual stage51 source/context changed');
 nativeStage51Preparation={mode:'ACTUAL_NATIVE10_FC01_STAGE51_READONLY_METADATA_NO_PREPARATION_ENGINE',metadata:{path:capture.path,sha256:capture.sha256},native10:{path:result.path,sha256:result.sha256},manifest:{path:profile.path,sha256:profile.sha256},noPreparationEngineLaunched:true};
 return data;
}
let db,server,expectedFunctions,expectedChangedFunctions,expectedTables,expectedPolicies,expectedTriggers,expectedLegacyShapes,expectedNewConstraints;
if(nativeFile){
 ({expectedFunctions,expectedChangedFunctions,expectedTables,expectedPolicies,expectedTriggers,expectedLegacyShapes,expectedNewConstraints}=await actualNativeStage51());
}else{
 if(process.argv.some(a=>a.startsWith('--native-')||a.startsWith('--native10-')))throw Error('Incomplete native preparation evidence arguments');
 server=await createServer({root:fileURLToPath(root),configFile:false,logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
try{
 const fixture=await server.ssrLoadModule('/supabase/functions/_shared/uc-group-education-facts.fixture.ts');
 db=await fixture.createUcGroupEducationFixture(false);
 await db.exec(urgentSource);
 await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES($1,$2,$3)',[urgent.version,urgent.name,[urgentSource]]);
 const oldShapes=new Map();for(const t of legacyTables){const before=(await db.query(legacyTableShape(t))).rows[0].hash,original=legacyManifest.expectedTables.find(e=>e.table===t);if(!original||before!==original.schemaMd5)throw Error('Nonexact111 starting shape '+t);oldShapes.set(t,before);}
 await db.exec(executable);
 expectedFunctions=(await db.query(`SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) definition_md5,pg_get_userbyid(p.proowner) owner_name,p.proacl::text acl,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('anon',p.oid,'EXECUTE') anon,
 has_function_privilege('service_role',p.oid,'EXECUTE') service_role
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${list(functions)}) ORDER BY 1`)).rows;
 expectedChangedFunctions=(await db.query(`SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) definition_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${list(changed)}) ORDER BY 1`)).rows;
 if(expectedFunctions.length!==51||counterWitness.expectedFunctions51.some(expected=>{const actual=expectedFunctions.find(f=>f.signature===expected.signature);return !actual||Object.entries(expected).some(([key,value])=>JSON.stringify(actual[key])!==JSON.stringify(value));}))throw Error('Integrated51 catalog differs from exact captured native51 owner/body/ACL/role registry');

 expectedTables=[];for(const t of tables)expectedTables.push({table:t,schemaMd5:(await db.query(tableShape(t))).rows[0].hash});
 expectedPolicies=(await db.query("SELECT schemaname,tablename,policyname,md5(to_jsonb(p)::text) definition_md5 FROM pg_policies p WHERE schemaname IN('public','storage') AND policyname LIKE 'uc_group_education_%' ORDER BY schemaname,tablename,policyname")).rows;
 expectedTriggers=(await db.query("SELECT n.nspname schema_name,c.relname table_name,t.tgname name,md5(pg_get_triggerdef(t.oid)) definition_md5,t.tgenabled enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage') AND NOT t.tgisinternal AND t.tgfoid IN(SELECT p.oid FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname IN("+list(functions)+")) ORDER BY 1,2,3")).rows;
 if(!expectedTriggers.some(t=>t.schema_name==='public'&&t.table_name==='uc_group_education_requests'&&t.name==='aaa_uc013_budget_ticket_guard'&&t.enabled==='O'&&t.definition_md5===hash(counterWitness.structureDelta.addedTrigger.definition,'md5')))throw Error('Exact counter51 budget ticket trigger required');
 expectedNewConstraints=(await db.query("SELECT n.nspname schema_name,c.relname table_name,con.conname name,con.contype type,md5(pg_get_constraintdef(con.oid))definition_md5,t.tgname trigger_name,t.tgenabled enabled,md5(pg_get_triggerdef(t.oid))trigger_definition_md5 FROM pg_constraint con JOIN pg_trigger t ON t.tgconstraint=con.oid JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE t.tgfoid IN(SELECT p.oid FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public'AND p.proname IN("+list(functions)+"))ORDER BY 1,2,3")).rows;
 if(expectedNewConstraints.length!==8||expectedNewConstraints.some(c=>c.type!=='t'||c.schema_name!=='public'||c.name!=='uc013_source_fold'||c.trigger_name!=='uc013_source_fold'||c.enabled!=='O'))throw Error('Exact8 linked constraint-trigger metadata required');
 expectedLegacyShapes=[];for(const t of legacyTables){const added=expectedTriggers.filter(x=>x.schema_name==='public'&&x.table_name===t);if(!added.length)throw Error('Missing exact116 observer '+t);const reconstructed=(await db.query(legacyTableShape(t,added.map(x=>x.name)))).rows[0].hash;if(reconstructed!==oldShapes.get(t))throw Error('Beyond-new-trigger111 schema change '+t);expectedLegacyShapes.push({table:t,beforeMd5:oldShapes.get(t),afterMd5:(await db.query(legacyTableShape(t))).rows[0].hash,reconstructedMd5:reconstructed,excludedNewTriggers:added});}
 }finally{await db?.close();await server.close();}
}
// Shared validation applies to the actual native metadata route and the historical fixture route.
if(![expectedFunctions,expectedChangedFunctions,expectedTables,expectedPolicies,expectedTriggers,expectedLegacyShapes,expectedNewConstraints].every(Array.isArray))throw Error('Missing exact native preparation arrays');
if(expectedFunctions.length!==51||counterWitness.expectedFunctions51.some(expected=>{const actual=expectedFunctions.find(f=>f.signature===expected.signature);return !actual||Object.entries(expected).some(([key,value])=>JSON.stringify(actual[key])!==JSON.stringify(value));}))throw Error('Integrated51 native owner/body/ACL/role registry drift');
if(expectedNewConstraints.length!==8||expectedNewConstraints.some(c=>c.type!=='t'||c.schema_name!=='public'||c.name!=='uc013_source_fold'||c.trigger_name!=='uc013_source_fold'||c.enabled!=='O'))throw Error('Exact8 native linked constraint-trigger witnesses required');
if(!expectedTriggers.some(t=>t.schema_name==='public'&&t.table_name==='uc_group_education_requests'&&t.name==='aaa_uc013_budget_ticket_guard'&&t.enabled==='O'&&t.definition_md5===hash(counterWitness.structureDelta.addedTrigger.definition,'md5')))throw Error('Exact native counter51 trigger required');
if(expectedTables.length!==5||new Set(expectedTables.map(t=>t.table)).size!==5||expectedTables.some(t=>!tables.includes(t.table)||! /^[a-f0-9]{32}$/.test(t.schemaMd5)))throw Error('Exact5 native private table shapes required');
if(expectedLegacyShapes.length!==2||new Set(expectedLegacyShapes.map(t=>t.table)).size!==2)throw Error('Exact2 native legacy shapes required');
for(const shape of expectedLegacyShapes){const original=legacyManifest.expectedTables.find(t=>t.table===shape.table),added=expectedTriggers.filter(t=>t.schema_name==='public'&&t.table_name===shape.table);
 if(!legacyTables.includes(shape.table)||!original||shape.beforeMd5!==original.schemaMd5||shape.reconstructedMd5!==original.schemaMd5||! /^[a-f0-9]{32}$/.test(shape.afterMd5)||!Array.isArray(shape.excludedNewTriggers)||!added.length||shape.excludedNewTriggers.length!==added.length||added.some(t=>!shape.excludedNewTriggers.some(x=>Object.entries(t).every(([key,value])=>x[key]===value))))throw Error('Native legacy111 reconstruction drift '+shape.table);}
if(expectedFunctions.length!==functions.length||expectedChangedFunctions.length!==4||expectedPolicies.length!==0||expectedTables.length!==5||!expectedTriggers.length)throw Error('Missing expected private group education boundaries');
for(const reviewed of reviewedChanges){const actual=expectedChangedFunctions.find(f=>f.signature===reviewed.signature);if(!actual||actual.definition_md5!==reviewed.definition_md5)throw Error('Nonexact reviewed body transformation '+reviewed.signature);}
const strip=sql=>sql.trim().replace(/;$/,'');
const previousPostcheck=strip(await read(previousFolder+'postcheck.sql'));
function historicalCompatibility(previousPostcheck,reviewedChanges,historicalClauses,shapePredicates,hash){
 const exact=(text,needle,replacement,label)=>{if(text.split(needle).length!==2)throw Error('Exact compatibility predicate count '+label);return text.replace(needle,replacement);};
 let result=previousPostcheck;
 const accountChanges=reviewedChanges.filter(r=>r.signature.startsWith('account_deletion_'));
 const clauseSignatures={exact_reviewed_five_erasure_bodies:['account_deletion_erase_data(uuid,text)','account_deletion_personal_row_counts(uuid)','account_deletion_snapshot(uuid)'],exact_reviewed_registration_erasure_bodies:['account_deletion_erase_data(uuid,text)','account_deletion_personal_row_counts(uuid)'],exact_unchanged_authority_dependencies:['account_deletion_snapshot(uuid)']};
 const clauseLabels=Object.keys(clauseSignatures);
 if(accountChanges.length!==3||reviewedChanges.length!==4||!Array.isArray(historicalClauses)||historicalClauses.length!==3||JSON.stringify(historicalClauses.map(c=>c.label).sort())!==JSON.stringify([...clauseLabels].sort()))throw Error('Reviewed three exact historical clauses required');
 for(const clause of historicalClauses){
  const lines=result.split('\n').filter(l=>new RegExp(' AS '+clause.label+'(?:,|\\s|\\))').test(l)&&hash(l)===clause.canonicalLfSha256);
  if(lines.length!==1||hash(lines[0])!==clause.canonicalLfSha256)throw Error('Exact historical clause label/hash/count '+clause.label);
  const signatures=clauseSignatures[clause.label];if(JSON.stringify(clause.signatures)!==JSON.stringify(signatures))throw Error('Exact historical clause signature inventory '+clause.label);
  let rewritten=lines[0];for(const signature of signatures){const r=accountChanges.find(r=>r.signature===signature);if(!r)throw Error('Missing reviewed account body '+signature);const before=`coalesce(md5(pg_get_functiondef(to_regprocedure('public.${r.signature}')))='${r.historical_before_definition_md5??r.before_definition_md5}',false)`,after=`coalesce(md5(pg_get_functiondef(to_regprocedure('public.${r.signature}')))='${r.definition_md5}',false)`;rewritten=exact(rewritten,before,after,clause.label+' '+r.signature);}
  result=exact(result,lines[0],rewritten,clause.label);
 }
 for(const r of reviewedChanges.filter(r=>!r.signature.startsWith('account_deletion_'))){
  const before=`coalesce(md5(pg_get_functiondef(to_regprocedure('public.${r.signature}')))='${r.historical_before_definition_md5??r.before_definition_md5}',false)`,after=`coalesce(md5(pg_get_functiondef(to_regprocedure('public.${r.signature}')))='${r.definition_md5}',false)`;
  result=exact(result,before,after,r.signature);
 }
 if(shapePredicates.length!==2)throw Error('Two exact legacy shapes required');
 for(const shape of shapePredicates)result=exact(result,shape.before,shape.after,shape.table);
 return result;
}
const historicalClauses=anchors.historicalAccountClauses;
const shapePredicates=expectedLegacyShapes.map(t=>({table:t.table,before:`(${legacyTableShape(t.table)})='${t.beforeMd5}'`,after:`(${legacyTableShape(t.table)})='${t.afterMd5}'` }));
const previousCompatiblePostcheck=historicalCompatibility(previousPostcheck,reviewedChanges,historicalClauses,shapePredicates,hash);
const previousCompatiblePreflight=historicalCompatibility(previousPostcheck,reviewedChanges.map(r=>({...r,definition_md5:r.before_definition_md5})),historicalClauses,shapePredicates.map(s=>({...s,after:s.before})),hash);

const exactFunctions=fs=>fs.map(f=>`coalesce(md5(pg_get_functiondef(to_regprocedure('public.${f.signature}')))='${f.definition_md5}',false)`).join(' AND ');
const preflight=`-- Read-only: exact installed100-115 ledger, prior postcheck and28 captured source/authority bodies.
SELECT
${urgentFlags}
 (SELECT count(*)=16 FROM supabase_migrations.schema_migrations WHERE ${ledger(prior)}) AS exact_prior_ledger,
 NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${migration.version}') AS migration_absent,
 ${tables.map(t=>`to_regclass('public.${t}') IS NULL`).join(' AND ')} AS new_state_absent,
 NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${list(functions)})) AS new_functions_absent,
 ${dependencies.map(f=>`coalesce(md5(pg_get_functiondef(to_regprocedure('${f.signature}')))='${f.definition_md5}',false)`).join(' AND ')} AS exact_authority_and_erasure_dependencies,
 NOT EXISTS(SELECT 1 FROM (${previousCompatiblePreflight}) q CROSS JOIN LATERAL jsonb_each(to_jsonb(q)) e WHERE e.value IS DISTINCT FROM 'true'::jsonb) AS exact_previous_release;
`;
const postcheck=`-- Repeatable metadata-only acceptance; does not inspect personal rows.
SELECT
${urgentFlags}
 (SELECT count(*)=1 FROM supabase_migrations.schema_migrations WHERE ${ledger([migration])}) AS exact_group_education_ledger,
 ${exactFunctions(expectedFunctions)} AS exact_new_functions,
 ${exactFunctions(expectedChangedFunctions)} AS exact_reviewed_four_function_bodies,
 ${dependencies.filter(f=>!changed.some(name=>f.signature.startsWith('public.'+name+'('))).map(f=>`coalesce(md5(pg_get_functiondef(to_regprocedure('${f.signature}')))='${f.definition_md5}',false)`).join(' AND ')} AS exact_unchanged_authority_dependencies,
 ${expectedTables.map(t=>`(${tableShape(t.table)})='${t.schemaMd5}'`).join(' AND ')} AS exact_new_schema,
 ${tables.map(t=>['authenticated','anon','service_role'].map(r=>`NOT has_table_privilege('${r}','public.${t}','SELECT,INSERT,UPDATE,DELETE') AND NOT has_any_column_privilege('${r}','public.${t}','SELECT,INSERT,UPDATE')`).join(' AND ')).join(' AND ')} AS private_rpc_state,
 ${expectedFunctions.map(f=>['authenticated','anon','service_role'].map(role=>`has_function_privilege('${role}','public.${f.signature}','EXECUTE')=${f[role]}`).join(' AND ')).join(' AND ')} AS exact_function_grants,
 ${expectedFunctions.map(f=>`EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='public.${f.signature}'::regprocedure AND pg_get_userbyid(p.proowner)=${quote(f.owner_name)} AND p.proacl::text IS NOT DISTINCT FROM ${f.acl===null?'NULL':quote(f.acl)})`).join(' AND ')} AS exact_new_function_owners_and_acls,
 ${expectedTriggers.map(t=>`EXISTS(SELECT 1 FROM pg_trigger t WHERE tgrelid='${t.schema_name}.${t.table_name}'::regclass AND tgname='${t.name}' AND tgenabled='${t.enabled}' AND md5(pg_get_triggerdef(t.oid))='${t.definition_md5}')`).join(' AND ')} AS exact_source_and_history_triggers,
 ${expectedNewConstraints.map(c=>`EXISTS(SELECT 1 FROM pg_constraint WHERE ${linkedConstraintPredicate(c)})`).join(' AND ')} AS exact_eight_linked_constraint_trigger_rows,
 ${expectedLegacyShapes.map(t=>`(${legacyTableShape(t.table,t.excludedNewTriggers.map(x=>x.name))})='${t.beforeMd5}'`).join(' AND ')} AS exact_legacy111_except_specific_new_triggers,
 NOT EXISTS(SELECT 1 FROM (${previousCompatiblePostcheck}) q CROSS JOIN LATERAL jsonb_each(to_jsonb(q)) e WHERE e.value IS DISTINCT FROM 'true'::jsonb) AS exact_previous_release_compatible;
`;
const preservedShapeAfter=preservedShape.replace("AND contype<>'n')","AND contype<>'n' AND NOT("+expectedNewConstraints.map(c=>'('+linkedConstraintPredicate(c)+')').join(' OR ')+"))");
const assert=(sql,label)=>`DO $assert$ DECLARE r jsonb;BEGIN SELECT to_jsonb(q) INTO r FROM (${strip(sql)}) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(r) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION '${label}: %',r;END IF;END $assert$;`;
const batch=`-- Generated UC group education facts security. Submit this ENTIRE file in ONE request.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL search_path=pg_catalog,public;SET LOCAL timezone='UTC';
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
${assert(preflight,'UC group education facts preflight failed')}
LOCK TABLE ${preserved.join(',')} IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE uc_group_education_ledger_before ON COMMIT DROP AS SELECT version,md5(to_jsonb(m)::text)row_hash FROM supabase_migrations.schema_migrations m;
CREATE TEMP TABLE uc_group_education_before(table_name text PRIMARY KEY,row_count bigint,row_hash text,metadata_hash text NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE uc_group_education_relations_before ON COMMIT DROP AS SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage') AND c.relkind IN('r','p','v','m','S','f');
CREATE TEMP TABLE uc_group_education_policies_before ON COMMIT DROP AS SELECT * FROM pg_policies WHERE schemaname IN('public','storage');
CREATE TEMP TABLE uc_group_education_functions_before ON COMMIT DROP AS SELECT p.oid,md5(pg_get_functiondef(p.oid)) definition_hash,p.proowner,p.proacl,to_jsonb(p)-'prosrc' metadata FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','storage','auth') AND p.prokind IN('f','p');
CREATE TEMP TABLE uc_group_education_triggers_before ON COMMIT DROP AS SELECT t.oid,t.tgenabled,md5(pg_get_triggerdef(t.oid)) hash FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage') AND NOT t.tgisinternal;
CREATE TEMP TABLE uc_group_education_cron_before ON COMMIT DROP AS SELECT jobid,md5(to_jsonb(j)::text) hash FROM cron.job j;
CREATE TEMP TABLE uc_group_education_default_acl_before ON COMMIT DROP AS SELECT oid,md5(to_jsonb(d)::text) hash FROM pg_default_acl d;
DO $snapshot$ DECLARE t text;n bigint;h text;shape text;BEGIN
 FOREACH t IN ARRAY ARRAY[${list(preserved)}] LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\\n'' ORDER BY to_jsonb(r)::text),'''')) FROM %s r%s',t,'') INTO n,h;
 ${preservedShape} INTO shape;
 INSERT INTO uc_group_education_before VALUES(t,n,h,shape);END LOOP;END $snapshot$;
DO $migration$ DECLARE v_source text:=$source_116$${source}$source_116$;v_executable text:=$executable_116$${executable}$executable_116$;BEGIN
 IF md5(v_source)<>'${migration.sourceMd5}' OR md5(v_executable)<>'${migration.executableMd5}' THEN RAISE EXCEPTION 'Source or executable hash mismatch ${migration.version}';END IF;
 EXECUTE v_executable;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('${migration.version}','${migration.name}',ARRAY[v_source]);
END $migration$;
${assert(postcheck,'UC group education facts postcheck failed')}
DO $preserve$ DECLARE r record;n bigint;h text;t text;shape text;BEGIN
 IF EXISTS(SELECT 1 FROM uc_group_education_ledger_before b FULL JOIN(SELECT version,md5(to_jsonb(m)::text)row_hash FROM supabase_migrations.schema_migrations m WHERE version<>'20261019120000')a USING(version)WHERE b.row_hash IS DISTINCT FROM a.row_hash)THEN RAISE EXCEPTION 'Existing full ledger content changed';END IF;
 FOR r IN SELECT * FROM uc_group_education_before LOOP
 t:=r.table_name;${preservedShapeAfter} INTO shape;
 IF shape IS DISTINCT FROM r.metadata_hash THEN RAISE EXCEPTION 'Historical relation metadata changed in %',r.table_name;END IF;
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(x)::text,E''\\n'' ORDER BY to_jsonb(x)::text),'''')) FROM %s x%s',r.table_name,'') INTO n,h;
 IF (n,h) IS DISTINCT FROM (r.row_count,r.row_hash) THEN RAISE EXCEPTION 'Historical data changed in %',r.table_name;END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN uc_group_education_relations_before b ON b.oid=c.oid WHERE n.nspname IN('public','storage') AND c.relkind IN('r','p','v','m','S','f') AND b.oid IS NULL AND NOT(n.nspname='public' AND c.relname IN(${list(tables)}))) THEN RAISE EXCEPTION 'Unreviewed additional relation';END IF;
 IF EXISTS(SELECT 1 FROM uc_group_education_policies_before b LEFT JOIN pg_policies p USING(schemaname,tablename,policyname) WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(p)) THEN RAISE EXCEPTION 'Existing policy changed';END IF;
 IF EXISTS(SELECT 1 FROM pg_policies p LEFT JOIN uc_group_education_policies_before b USING(schemaname,tablename,policyname) WHERE p.schemaname IN('public','storage') AND b.policyname IS NULL) THEN RAISE EXCEPTION 'Unreviewed additional policy';END IF;
 IF EXISTS(SELECT 1 FROM uc_group_education_functions_before b LEFT JOIN pg_proc p ON p.oid=b.oid WHERE b.metadata IS DISTINCT FROM (to_jsonb(p)-'prosrc') OR b.proowner IS DISTINCT FROM p.proowner OR b.proacl IS DISTINCT FROM p.proacl OR(b.definition_hash IS DISTINCT FROM md5(pg_get_functiondef(p.oid)) AND NOT(${expectedChangedFunctions.map(f=>`(p.oid='public.${f.signature}'::regprocedure AND md5(pg_get_functiondef(p.oid))='${f.definition_md5}')`).join(' OR ')}))) THEN RAISE EXCEPTION 'Unreviewed existing function or ACL changed';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace LEFT JOIN uc_group_education_functions_before b ON b.oid=p.oid WHERE n.nspname IN('public','storage','auth') AND p.prokind IN('f','p') AND b.oid IS NULL AND p.oid NOT IN(${expectedFunctions.map(f=>`'public.${f.signature}'::regprocedure`).join(',')})) THEN RAISE EXCEPTION 'Unreviewed additional function';END IF;
 IF EXISTS(SELECT 1 FROM uc_group_education_triggers_before b LEFT JOIN pg_trigger t ON t.oid=b.oid WHERE b.hash IS DISTINCT FROM md5(pg_get_triggerdef(t.oid)) OR b.tgenabled IS DISTINCT FROM t.tgenabled) THEN RAISE EXCEPTION 'Existing trigger changed';END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN uc_group_education_triggers_before b ON b.oid=t.oid WHERE n.nspname IN('public','storage') AND NOT t.tgisinternal AND b.oid IS NULL AND NOT(${expectedTriggers.map(t=>`(n.nspname='${t.schema_name}' AND c.relname='${t.table_name}' AND t.tgname='${t.name}')`).join(' OR ')})) THEN RAISE EXCEPTION 'Unreviewed additional trigger';END IF;
 IF EXISTS(SELECT 1 FROM uc_group_education_cron_before b FULL JOIN (SELECT jobid,md5(to_jsonb(j)::text) hash FROM cron.job j) a USING(jobid) WHERE b.hash IS DISTINCT FROM a.hash) THEN RAISE EXCEPTION 'Cron metadata changed';END IF;
 IF EXISTS(SELECT 1 FROM uc_group_education_default_acl_before b FULL JOIN (SELECT oid,md5(to_jsonb(d)::text) hash FROM pg_default_acl d) a USING(oid) WHERE b.hash IS DISTINCT FROM a.hash) THEN RAISE EXCEPTION 'Default ACL metadata changed';END IF;
 IF ${tables.map(t=>`EXISTS(SELECT 1 FROM public.${t})`).join(' OR ')} THEN RAISE EXCEPTION 'Unexpected prospective group education backfill';END IF;
END $preserve$;
NOTIFY pgrst,'reload schema';COMMIT;
${postcheck}`;
for(const [name,value] of [['preflight.sql',preflight],['postcheck.sql',postcheck],['production-batch.sql',batch]])await writeFile(new URL(name,folder),value);
// Closed selected UI/runtime inventory plus every actual relative native import.
const edgeFunctions=['compile-group-class-journal','register-student','landing-self-enroll'];
const nativeGraph=new Set();async function visitNative(path){if(nativeGraph.has(path))return;if(!path.startsWith('supabase/functions/')||!path.endsWith('.ts')||path.includes('/__tests__/')||path.endsWith('.test.ts'))throw Error('Unexpected native source path '+path);nativeGraph.add(path);const text=await read(path),ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true);for(const n of ast.statements){if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)&&n.moduleSpecifier.text.startsWith('.')){const url=new URL(n.moduleSpecifier.text,new URL(path,root)),relative=fileURLToPath(url).slice(fileURLToPath(root).length).replaceAll('\\','/');await visitNative(relative);}}}
for(const fn of edgeFunctions)await visitNative('supabase/functions/'+fn+'/index.ts');
const requiredRuntimePaths=[...new Set([...legacyManifest.productFiles.map(f=>f.path),...nativeGraph,
 'supabase/config.toml','supabase/functions/_shared/group-education-artifact.ts',
 'src/lib/groupEducationFacts/contract.ts','src/lib/groupEducationFacts/client.ts','src/hooks/useGroupEducationFacts.ts','src/components/organization/groups/GroupEducationFactsPanel.tsx',
 'src/components/organization/GroupSettingsDialog.tsx','src/components/organization/JournalsManager.tsx','src/lib/journals/groupJournalContext.ts','src/lib/group-docs/docxJournal.ts','src/pages/CourseLanding.tsx',
 'src/hooks/useCopiesJournalScope.ts','src/lib/journals/copiesJournalStorage.ts'
])].sort();
const productFiles=anchors.productFiles;
if(!Array.isArray(productFiles)||JSON.stringify(productFiles.map(f=>f.path).sort())!==JSON.stringify(requiredRuntimePaths)||new Set(productFiles.map(f=>f.path)).size!==productFiles.length)throw Error('Exact closed runtime inventory required');
for(const f of productFiles){const expectedKind=nativeGraph.has(f.path)?'native_edge_ts':f.path==='supabase/config.toml'?'config_semantic':'current_runtime';if(f.kind!==expectedKind||hash(await read(f.path))!==f.sourceSha256)throw Error('Frozen runtime/source drift '+f.path);}
const runtimePaths=nativeGraph;
await writeFile(new URL('manifest.json',folder),JSON.stringify({release:'uc-group-education-facts-20261019',preparedOnly:true,nativeStage51Preparation,sourceFreezeStatus:anchors.status,candidatePreparation:candidate,counter51Integration:{witness:counterWitnessPath,witnessSha256:hash(counterWitnessRaw),exactMode48PrefixSha256:counterWitness.mode48Sha256,counterExtensionSha256:counterWitness.counterSha256,expectedFunctions:51,nativeIntegratedAcceptance:false,nativeOriginal26Acceptance:{path:native51MetadataPath,sha256:hash(native51Raw),resultSha256:native51Metadata.result.sha256,tests:26},privacyStackSource:{path:privacyStackPath,sha256:hash(privacyStackRaw),freshCapture:privacyStack.freshCapture},currentIntegratedCandidateAcceptance:false},migrationCount:1,batchSha256:hash(batch),newlineHashNormalization:'CRLF to LF only; executable and ledger store canonical LF source',migrations:[migration],priorMigrations:prior.map(({file,version,name,sourceMd5})=>({file,version,name,sourceMd5})),previousReleaseManifest:{path:previousFolder+'manifest.json',sourceSha256:hash(await read(previousFolder+'manifest.json'))},previousReleaseFiles,preservedTables:preserved,dependencies,unchangedPriorFunctionBodiesExceptReviewed:expectedChangedFunctions.map(f=>f.signature),previousReleaseCompatibility:{rule:'Three reviewed account bodies substituted in three SHA-pinned historical clauses with exact applicable signature inventories3/2/1; guard and two specific trigger-only legacy111 fingerprints each global-count1. Historical source files unchanged.',reviewedChanges,historicalClauses,legacyShapes:expectedLegacyShapes,shapePredicates},historicalArchive,unchangedHistoricalReleaseFiles,sourceAnchors:{path:sourceAnchorsPath,sourceSha256:hash(await read(sourceAnchorsPath))},baselineCapture:{path:baselinePath,sourceSha256:hash(await read(baselinePath))},expectedFunctions,expectedChangedFunctions,expectedTables,expectedPolicies,expectedTriggers,expectedNewConstraints,productFiles,edgeFunctions,edgeRuntimeGraph:[...runtimePaths].sort(),mode48Integration:anchors.integration,urgentPreservation:urgent,deploymentOrder:['Check exact16 prior ledger sources and unchanged115 preflight','Submit entire116 atomic transaction once; every final flag must be true','Root performs exact native source/type/build, PostgreSQL17 multi-session and safe live acceptance; no backfill or official document issuance']},null,2)+'\n');
console.log('Prepared single116 atomic release; no deployment performed.');
