import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const root=process.cwd(),out=path.join(root,'outputs/support-events-declaration-ci');
const shared='supabase/functions/_shared/support-mcp-events/';
const generated='supabase/functions/mcp/index.ts',declaration='scripts/support-mcp-events-build.d.mts';
const rawSha='a1f1ff4f3d61428e57ac1f0864b2cb343c3b65c44ca39a0ed7a34643577ea9cf';
const wrappedSha='154f6112b58f03e9349b71f62c86949edd406de16d83d90a2b338f8f5801a958';
const bundleSha='5ceeafe75a6098e17b1633b2a15b603d1d5cf2e1e81fe67f3d8b8e099ec0c9bb';
const sha=data=>createHash('sha256').update(data).digest('hex');
const redact=s=>s.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[REDACTED_JWT]').replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g,'$1[REDACTED]@').replace(/([?&](?:token|key|signature|password|secret)=)[^\s&]+/gi,'$1[REDACTED]');
async function command(label,program,args){
  const r=await new Promise((done,reject)=>{const child=spawn(program,args,{cwd:root,env:process.env});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('close',(code,signal)=>done({code,signal,output:redact(output)}));});
  await fs.writeFile(path.join(out,label+'.log'),r.output);console.log(JSON.stringify({label,code:r.code,signal:r.signal}));
  return{code:r.code,signal:r.signal,log:label+'.log',output:r.output};
}
async function files(dir){const result=[];for(const item of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const p=dir+'/'+item.name;result.push(...item.isDirectory()?await files(p):[p]);}return result.sort();}
async function hashes(paths){return Object.fromEntries(await Promise.all(paths.map(async p=>[p,sha(await fs.readFile(path.join(root,p)))])));}
const diagnostics=output=>output.split(/\r?\n/).filter(line=>/error TS\d+:/.test(line));
function compact(r){return{code:r.code,signal:r.signal,log:r.log,diagnostics:diagnostics(r.output),diagnosticSha256:sha(diagnostics(r.output).join('\n'))};}
await fs.mkdir(out,{recursive:true});
const preserve=['package.json','package-lock.json','bun.lock','bun.lockb','tsconfig.json','tsconfig.app.json','tsconfig.node.json','vite.config.ts','supabase/config.toml','scripts/support-mcp-events-build.mjs','scripts/support-mcp-events-build.test.mjs',declaration,...await files('src/lib/mcp'),...(await files(shared.slice(0,-1))).filter(p=>!p.endsWith('runtime.bundle.mjs'))];
const report={scope:'Declaration and explicit TypeScript coverage; one real Vite raw SDK input to wrapped output. No deployment, DB or network callback acceptance.',base:'055e5fe9248f53917cd60230c365ea79140205e1',node:process.version,before:await hashes(preserve),commands:{}};
const tsc=['node_modules/typescript/bin/tsc'];let failed=false;
try{
  const start=await fs.readFile(path.join(root,generated),'utf8');
  assert.equal(sha(start),rawSha,'fresh main055 raw SDK input');
  assert.equal(start.split('Deno.serve(createSupabaseHandler(mcp_default, { functionName: "mcp" }));').length-1,1);
  assert.ok(!start.includes('SINTAGMA_SUPPORT_MCP_EVENTS_POSTBUILD_V1'));
  report.initialRawSha256=sha(start);
  const rootCheck=await command('root-plain-types','node',[...tsc,'--noEmit','--pretty','false']);
  report.commands.rootPlainTypes=compact(rootCheck);assert.equal(rootCheck.code,0);
  const rootFiles=await command('root-list-files','node',[...tsc,'--noEmit','--listFilesOnly','--pretty','false']);
  assert.equal(rootFiles.code,0);report.rootProgramFiles=rootFiles.output.split(/\r?\n/).filter(Boolean);assert.equal(report.rootProgramFiles.length,0,'solution config files:[] does not typecheck referenced projects in plain tsc');
  const absolute=path.resolve(root,declaration),hidden=absolute+'.ci-hidden';
  assert.equal(path.dirname(absolute),path.join(root,'scripts'));assert.ok(absolute.endsWith('support-mcp-events-build.d.mts'));
  await fs.rename(absolute,hidden);
  try{
    const baseline=await command('baseline-node-types','node',[...tsc,'-p','tsconfig.node.json','--noEmit','--pretty','false']);
    report.commands.baselineNode=compact(baseline);
    assert.notEqual(baseline.code,0);assert.equal(report.commands.baselineNode.diagnostics.length,1);
    assert.match(report.commands.baselineNode.diagnostics[0],/^vite\.config\.ts\(8,45\): error TS7016:.*scripts\/support-mcp-events-build\.mjs/);
    report.commands.baselineApp=compact(await command('baseline-app-types','node',[...tsc,'-p','tsconfig.app.json','--noEmit','--pretty','false']));
    assert.equal(report.commands.baselineApp.signal,null,'baseline app typecheck completed without a signal');
    assert.ok(Number.isInteger(report.commands.baselineApp.code));
    if(report.commands.baselineApp.code!==0)assert.ok(report.commands.baselineApp.diagnostics.length>0,'a process failure is not a TypeScript diagnostic');
  }finally{await fs.rename(hidden,absolute);}
  assert.equal(sha(await fs.readFile(absolute)),report.before[declaration]);
  report.commands.candidateNode=compact(await command('candidate-node-types','node',[...tsc,'-p','tsconfig.node.json','--noEmit','--pretty','false']));
  assert.equal(report.commands.candidateNode.code,0,'explicit Node project');
  report.commands.candidateApp=compact(await command('candidate-app-types','node',[...tsc,'-p','tsconfig.app.json','--noEmit','--pretty','false']));
  assert.equal(report.commands.candidateApp.signal,null,'candidate app typecheck completed without a signal');
  assert.equal(report.commands.candidateApp.code,report.commands.baselineApp.code,'app exit unchanged');
  assert.equal(report.commands.candidateApp.signal,report.commands.baselineApp.signal,'app signal unchanged');
  assert.equal(report.commands.candidateApp.diagnosticSha256,report.commands.baselineApp.diagnosticSha256,'exact explicit app diagnostics unchanged');
  report.appCheck={status:report.commands.candidateApp.code===0?'PASS':'PREEXISTING_DIAGNOSTICS_UNCHANGED_NOT_FULL_APP_PASS',exitCode:report.commands.candidateApp.code,count:report.commands.candidateApp.diagnostics.length,diagnosticSha256:report.commands.candidateApp.diagnosticSha256};
  const contract=path.join(out,'type-contract.mts');
  await fs.writeFile(contract,`import type {Plugin} from 'vite';\nimport * as esbuild from 'esbuild';\nimport {buildSupportMcpEvents,supportMcpEventsBuildPlugin,wrapGeneratedMcp,type SupportMcpEventsBundler,type SupportMcpEventsBuildResult} from '../../scripts/support-mcp-events-build.mjs';\nconst plugin:Plugin=supportMcpEventsBuildPlugin('.');const real:SupportMcpEventsBundler=esbuild;const result:Promise<SupportMcpEventsBuildResult>=buildSupportMcpEvents('.',{esbuild:real});\nvoid result.then(r=>{const sdk:'0.23.0'=r.sdkVersion;const version:1=r.wrapperVersion;const flag:boolean=r.alreadyWrapped;void[sdk,version,flag];});\nconst text:string=wrapGeneratedMcp('');void[plugin,text];\n// @ts-expect-error source must be string\nwrapGeneratedMcp(42);\n// @ts-expect-error root must be string\nsupportMcpEventsBuildPlugin(42);\n// @ts-expect-error build method required\nbuildSupportMcpEvents('.',{esbuild:{}});\n`);
  report.commands.contract=compact(await command('declaration-contract','node',[...tsc,'--noEmit','--strict','--skipLibCheck','--target','ES2022','--module','ESNext','--moduleResolution','Bundler',contract]));assert.equal(report.commands.contract.code,0);
  // No runtime build helper or builder test has run yet: Vite is the first writer of the raw SDK input.
  assert.equal(sha(await fs.readFile(path.join(root,generated))),rawSha,'input remained raw through static checks');
  report.commands.vite=compact(await command('real-vite-build','npm',['run','build']));assert.equal(report.commands.vite.code,0);
  const afterVite=await fs.readFile(path.join(root,generated),'utf8');assert.equal(sha(afterVite),wrappedSha,'real Vite closeBundle wrapped the raw SDK input');
  assert.equal(sha(await fs.readFile(path.join(root,shared+'runtime.bundle.mjs'))),bundleSha);
  report.afterRealViteSha256=sha(afterVite);
  const boundary='// lovable-mcp-supabase-entry.ts';assert.equal(start.split(boundary).length,2);assert.equal(afterVite.split(boundary).length,2);assert.equal(start.split(boundary)[0],afterVite.split(boundary)[0]);
  report.originalToolOAuthPrefixSha256=sha(afterVite.split(boundary)[0]);assert.equal(report.originalToolOAuthPrefixSha256,'552a73568d24ff359cc1bc2c3ef36b627a297e5c9534f1cea18a828a58052d67');
  assert.equal(afterVite.split('SINTAGMA_SUPPORT_MCP_EVENTS_POSTBUILD_V1').length-1,1);
  const require=createRequire(path.join(root,'package.json')),sdkEntry=require.resolve('@lovable.dev/mcp-js'),sdkRequire=createRequire(sdkEntry),esbuild=sdkRequire('esbuild');
  const {buildSupportMcpEvents}=await import(path.join(root,'scripts/support-mcp-events-build.mjs'));let graph;
  const replay=await buildSupportMcpEvents(root,{esbuild:{async build(options){const r=await esbuild.build({...options,metafile:true});graph=r.metafile;return r;}}});
  assert.equal(replay.entrySha256,wrappedSha);assert.equal(replay.adapterSha256,bundleSha);assert.equal(replay.alreadyWrapped,true);
  const expected=['runtime-entry.ts','runtime-backend.ts','protocol.ts','crypto.ts','crypto-buffer.ts','callback-policy.ts','native-http1.ts','native-deno-https.ts','pinned-https.ts','webhooks.ts','delivery.ts','worker-http.ts'].map(p=>shared+p).sort();assert.deepEqual(Object.keys(graph.inputs).filter(p=>p.startsWith(shared)).sort(),expected);
  report.sdkBundler={version:esbuild.version,path:path.relative(root,sdkRequire.resolve('esbuild'))};report.replay=replay;report.sharedModules=expected;
  await fs.copyFile(path.join(root,generated),path.join(out,'generated-mcp-index.ts'));await fs.copyFile(path.join(root,shared+'runtime.bundle.mjs'),path.join(out,'runtime.bundle.mjs'));await fs.writeFile(path.join(out,'adapter-metafile.json'),JSON.stringify(graph,null,2)+'\n');
}catch(error){report.error={name:error.name,message:redact(error.message)};failed=true;}
report.after=await hashes(preserve);report.preserved=JSON.stringify(report.before)===JSON.stringify(report.after);if(!report.preserved)failed=true;
report.status=failed?'FAIL':'PASS_DECLARATION_NODE_AND_RAW_TO_WRAPPED_BUILD_APP_SEPARATE';
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,appCheck:report.appCheck,preserved:report.preserved,initialRaw:report.initialRawSha256,afterRealVite:report.afterRealViteSha256}));process.exitCode=failed?1:0;
