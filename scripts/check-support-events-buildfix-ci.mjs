import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { buildSupportMcpEvents } from './support-mcp-events-build.mjs';

const root=process.cwd(),manager=process.argv[2];
assert.ok(['npm','bun'].includes(manager));
const out=path.join(root,'outputs/support-events-buildfix-'+manager);
await fs.mkdir(out,{recursive:true});
const sha=data=>createHash('sha256').update(data).digest('hex');
const shared='supabase/functions/_shared/support-mcp-events/';
const generated=['supabase/functions/mcp/index.ts',shared+'runtime.bundle.mjs'];
const locks=['package.json','package-lock.json','bun.lock','bun.lockb'];
async function hashes(paths){return Object.fromEntries(await Promise.all(paths.map(async p=>[p,sha(await fs.readFile(path.join(root,p)))])));}
async function files(dir){const result=[];for(const item of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const p=dir+'/'+item.name;result.push(...item.isDirectory()?await files(p):[p]);}return result.sort();}
const redact=s=>s.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[REDACTED_JWT]').replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g,'$1[REDACTED]@').replace(/([?&](?:token|key|signature|password|secret)=)[^\s&]+/gi,'$1[REDACTED]');
async function command(label,program,args){
  const r=await new Promise((done,reject)=>{const child=spawn(program,args,{cwd:root,env:process.env});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',(code,signal)=>done({code,signal,output:redact(output)}));});
  await fs.writeFile(path.join(out,label+'.log'),r.output);console.log(JSON.stringify({label,code:r.code,signal:r.signal}));
  return {code:r.code,signal:r.signal,log:label+'.log',tail:r.output.slice(-2000)};
}
const originalSources=await files('src/lib/mcp');
const runtimeSources=(await files(shared.slice(0,-1))).filter(p=>!p.endsWith('runtime.bundle.mjs'));
const preserved=[...locks,...originalSources,...runtimeSources,'vite.config.ts'];
const report={scope:'SDK-declared esbuild build-portability candidate; no deployment, DB access, callback or Cloud subscription acceptance',manager,node:{version:process.version,arch:process.arch,platform:process.platform},before:await hashes(preserved),commands:{}};
let failed=false;
try {
  for(const [name,cmd,args]of[['npm-version','npm',['--version']],['bun-version','bun',['--version']],['bun-revision','bun',['--revision']]])report.commands[name]=await command(name,cmd,args);
  report.commands.install=await command(manager+'-install',manager,manager==='npm'?['ci']:['install','--frozen-lockfile']);
  assert.equal(report.commands.install.code,0,'fresh install');
  const require=createRequire(path.join(root,'package.json')),sdkEntry=require.resolve('@lovable.dev/mcp-js'),sdkRequire=createRequire(sdkEntry),esbuild=sdkRequire('esbuild');
  const sdk=JSON.parse(await fs.readFile(path.resolve(path.dirname(sdkEntry),'../package.json'),'utf8'));
  let rootEsbuild;try{rootEsbuild={path:path.relative(root,require.resolve('esbuild')),version:require('esbuild').version};}catch(e){rootEsbuild={error:e.code};}
  report.resolution={sdkEntry:path.relative(root,sdkEntry),sdkVersion:sdk.version,sdkEsbuildDependency:sdk.dependencies.esbuild,rootEsbuild,sdkEsbuild:{path:path.relative(root,sdkRequire.resolve('esbuild')),version:esbuild.version}};
  console.log(JSON.stringify({resolution:report.resolution}));
  report.commands.tests=await command('build-tests','node',['--test','--test-concurrency=1','--test-reporter=tap','scripts/support-mcp-events-build.test.mjs']);
  assert.equal(report.commands.tests.code,0,'build cases');
  const tap=await fs.readFile(path.join(out,'build-tests.log'),'utf8');
  const number=key=>Number(new RegExp('^# '+key+' (\\d+)$','m').exec(tap)?.[1]);
  assert.equal(number('tests'),10);assert.equal(number('pass'),10);assert.equal(number('fail'),0);
  report.cases={tests:10,pass:10,fail:0};
  report.commands.types=await command('stock-types','node',['node_modules/typescript/bin/tsc','--noEmit']);
  assert.equal(report.commands.types.code,0,'stock types');
  for(const [label,program,script]of[['npm-build','npm','build'],['bun-build','bun','build'],['npm-build-dev','npm','build:dev'],['bun-build-dev','bun','build:dev']]){
    const reset=await command(label+'-reset','git',['restore','--source=HEAD','--',...generated]);assert.equal(reset.code,0);
    report.commands[label]=await command(label,program,['run',script]);assert.equal(report.commands[label].code,0,label);
    report.commands[label].generated=await hashes(generated);
  }
  let graph;
  const first=await buildSupportMcpEvents(root,{esbuild:{async build(options){const r=await esbuild.build({...options,metafile:true});graph=r.metafile;return r;}}});
  const second=await buildSupportMcpEvents(root);
  assert.equal(first.adapterSha256,second.adapterSha256);assert.equal(first.entrySha256,second.entrySha256);assert.equal(second.alreadyWrapped,true);
  const expected=['runtime-entry.ts','runtime-backend.ts','protocol.ts','crypto.ts','crypto-buffer.ts','callback-policy.ts','native-http1.ts','native-deno-https.ts','pinned-https.ts','webhooks.ts','delivery.ts','worker-http.ts'].map(p=>shared+p).sort();
  assert.deepEqual(Object.keys(graph.inputs).filter(p=>p.startsWith(shared)).sort(),expected);
  const entry=await fs.readFile(path.join(root,generated[0]),'utf8'),boundary='// lovable-mcp-supabase-entry.ts';
  assert.equal(entry.split(boundary).length,2);const prefix=entry.split(boundary)[0];
  assert.equal(sha(prefix),'552a73568d24ff359cc1bc2c3ef36b627a297e5c9534f1cea18a828a58052d67');
  for(const name of ['whoami','get_my_profile','search_sintagma_invoices','get_sintagma_invoice_export','search_sintagma_billing_organizations','preview_sintagma_invoice_act','create_sintagma_invoice_act','get_sintagma_postpaid_billing_overview','prepare_sintagma_postpaid_statement','preview_sintagma_postpaid_statement','approve_sintagma_postpaid_statement','issue_sintagma_postpaid_invoice','search_sintagma_support_requests','get_sintagma_support_request'])assert.equal(prefix.split('name: "'+name+'"').length-1,1,name);
  assert.ok(prefix.includes('acceptedAudiences: "authenticated"'));assert.ok(prefix.includes('auth: auth.oauth.issuer({'));
  assert.equal(entry.split('// SINTAGMA_SUPPORT_MCP_EVENTS_POSTBUILD_V1').length-1,1);
  const bundle=await fs.readFile(path.join(root,generated[1]),'utf8');assert.match(bundle,/DENO_NODE_HTTPS_PINNING_PROVEN\s*=\s*false/);assert.match(bundle,/DENO_NATIVE_HTTPS_PINNING_PROVEN\s*=\s*true/);
  report.build=second;report.graphShared=expected;report.prefixSha256=sha(prefix);
  await fs.writeFile(path.join(out,'adapter-metafile.json'),JSON.stringify(graph,null,2)+'\n');
  await fs.copyFile(path.join(root,generated[0]),path.join(out,'generated-mcp-index.ts'));await fs.copyFile(path.join(root,generated[1]),path.join(out,'runtime.bundle.mjs'));
  // Load the real compiled ESM in Deno without env/net permissions. This is not an Edge/Cloud test.
  const smoke=`import { withSupportMcpEvents } from ${JSON.stringify(path.join(root,generated[1]).replaceAll('\\','/'))};\nDeno.test('compiled wrapper loads and preserves legacy GET without environment access', async () => {\n  if ((await Deno.permissions.query({name:'env'})).state !== 'denied') throw new Error('env_permission_must_be_denied');\n  if ((await Deno.permissions.query({name:'net'})).state !== 'denied') throw new Error('net_permission_must_be_denied');\n  let calls = 0; const request = new Request('https://example.invalid/legacy');\n  const handler = withSupportMcpEvents(async incoming => { if (incoming !== request) throw new Error('request_identity_changed'); calls++; return new Response('legacy-ok', {status:207,headers:{'x-legacy':'preserved'}}); });\n  const response = await handler(request);\n  if (calls !== 1 || response.status !== 207 || response.headers.get('x-legacy') !== 'preserved' || await response.text() !== 'legacy-ok') throw new Error('legacy_fallback_changed');\n});\n`;
  const smokeFile=path.join(out,'compiled-wrapper-smoke.test.ts'),smokeConfig=path.join(out,'deno-smoke.json');
  await fs.writeFile(smokeFile,smoke);await fs.writeFile(smokeConfig,'{"nodeModulesDir":"none"}\n');
  report.commands.denoVersion=await command('deno-version','deno',['--version']);
  report.commands.denoSmoke=await command('compiled-deno-smoke','deno',['test','--no-check','--no-prompt','--allow-read','--config='+smokeConfig,smokeFile]);
  assert.equal(report.commands.denoSmoke.code,0,'compiled Deno module smoke');
} catch(error){report.error={name:error.name,message:redact(error.message)};failed=true;}
report.after=await hashes(preserved);report.preserved=JSON.stringify(report.before)===JSON.stringify(report.after);if(!report.preserved)failed=true;
report.status=failed?'FAIL':'PASS';await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,preserved:report.preserved,build:report.build}));process.exitCode=failed?1:0;
