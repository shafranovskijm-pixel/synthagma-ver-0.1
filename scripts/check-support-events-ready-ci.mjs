import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';
import { buildSupportMcpEvents } from './support-mcp-events-build.mjs';

const root = process.cwd(), out = path.join(root, 'outputs/ready-mcp-events-ci');
const base = '73d1baaa87de530bdf612491fb87a995beb1ab4d';
const shared = 'supabase/functions/_shared/support-mcp-events/';
const generated = 'supabase/functions/mcp/index.ts';
const boundary = '// lovable-mcp-supabase-entry.ts';
const sha = data => createHash('sha256').update(data).digest('hex');
const baselineFiles = ['crypto.ts','callback-policy.ts','native-http1.ts','native-deno-https.ts','pinned-https.ts','webhooks.ts','delivery.ts','worker-http.ts'];
const productPaths = ['vite.config.ts','scripts/support-mcp-events-build.mjs','scripts/support-mcp-events-build.test.mjs', ...['protocol.ts','protocol.test.ts','runtime-backend.ts','runtime-backend.test.ts','runtime-entry.ts','crypto-buffer.ts','crypto.ts','webhooks.ts','worker-http.ts','native-deno-https.ts','native-deno-https.test.ts','native-tls-shape-diagnostics.test.ts'].map(p => shared+p)];
const ciPaths = ['.github/workflows/support-events-ready-ci-only.yml','scripts/check-support-events-ready-ci.mjs','scripts/check-support-events-deno-types.mjs','scripts/support-mcp-events-crypto-vectors.test.mjs'];
const toolNames = ['whoami','get_my_profile','search_sintagma_invoices','get_sintagma_invoice_export','search_sintagma_billing_organizations','preview_sintagma_invoice_act','create_sintagma_invoice_act','get_sintagma_postpaid_billing_overview','prepare_sintagma_postpaid_statement','preview_sintagma_postpaid_statement','approve_sintagma_postpaid_statement','issue_sintagma_postpaid_invoice','search_sintagma_support_requests','get_sintagma_support_request'];
const previousBundles = ['2e04e091778d8a51de0c30bc3856338560f76fc18628c5ed522cf3d3609bff4f','80cc450cf9adaf452b7761b65e4dd39dce787fb852aa852c4cff5797f68e5905'];
function git(args) { return execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024}); }
async function allFiles(dir) {
  const files=[];
  for(const item of await fs.readdir(path.join(root,dir),{withFileTypes:true})) {
    const rel=`${dir}/${item.name}`; files.push(...(item.isDirectory()?await allFiles(rel):[rel]));
  }
  return files.sort();
}
async function hashes(files) { return Object.fromEntries(await Promise.all(files.map(async p=>[p,sha(await fs.readFile(path.join(root,p)))]))); }
function prefix(source) { assert.equal(source.split(boundary).length,2); return source.split(boundary)[0]; }
async function invariants() {
  const original=prefix(await fs.readFile(path.join(root,generated),'utf8'));
  for(const name of toolNames)assert.equal(original.split(`name: "${name}"`).length-1,1,name);
  assert.ok(original.includes('acceptedAudiences: "authenticated"'));
  assert.ok(original.includes('auth: auth.oauth.issuer({'));
  assert.match(await fs.readFile(path.join(root,shared+'pinned-https.ts'),'utf8'),/DENO_NODE_HTTPS_PINNING_PROVEN\s*=\s*false/);
  assert.match(await fs.readFile(path.join(root,shared+'native-deno-https.ts'),'utf8'),/DENO_NATIVE_HTTPS_PINNING_PROVEN\s*=\s*true/);
  return {prefixSha256:sha(original),mcpSources:await hashes(await allFiles('src/lib/mcp')),productSources:await hashes(productPaths),ciSources:await hashes(ciPaths),workerClosureSources:await hashes([...baselineFiles,'crypto-buffer.ts'].map(p=>shared+p))};
}
function tap(log,expected,label) {
  const value=key=>Number(new RegExp(`^# ${key} (\\d+)$`,'m').exec(log)?.[1]);
  const total=value('tests'),passed=value('pass'),failed=value('fail');
  assert.ok(Number.isSafeInteger(total)&&total>0,label);
  assert.equal(failed,0,label);assert.equal(passed,total,label);
  if(expected!==undefined)assert.equal(total,expected,label);
  return {total,pass:passed,fail:failed};
}
await fs.mkdir(out,{recursive:true});
if(process.argv[2]==='capture') {
  const changed=git(['diff','--name-only',base,'HEAD']).trim().split('\n').filter(Boolean).sort();
  assert.deepEqual(changed,[...productPaths,...ciPaths].sort(),'exact product/CI-only path allowlist');
  const baselineRoot=path.join(root,'scripts/.support-events-ci-baseline/_shared/support-mcp-events');
  await fs.mkdir(baselineRoot,{recursive:true});
  const baselineSources={};
  for(const name of baselineFiles) {
    const source=git(['show',`${base}:${shared+name}`]);
    await fs.writeFile(path.join(baselineRoot,name),source,'utf8');baselineSources[name]=sha(source);
  }
  assert.equal(baselineSources['crypto.ts'],'17b3b107d7191cc9be4145f8e4abea3f02ac6e0d758173471bec17f7d8333c7e');
  assert.equal(baselineSources['webhooks.ts'],'db755778b0ba0e84a640ffc72511160b500b1ae5a033296b25627add53d94857');
  assert.equal(baselineSources['worker-http.ts'],'bb92ac87a258bafa3edb1a46d71d97b02b70670e42d1ab87b537622d92dba3c8');
  const oldMcp=prefix(git(['show',`${base}:${generated}`]));
  const current=await invariants();assert.equal(current.prefixSha256,sha(oldMcp));
  await fs.writeFile(path.join(out,'baseline.json'),JSON.stringify({baseCommit:base,changedPaths:changed,baselineSources,...current},null,2)+'\n');
} else if(process.argv[2]==='verify') {
  const before=JSON.parse(await fs.readFile(path.join(out,'baseline.json'),'utf8')),after=await invariants();
  for(const key of ['prefixSha256','mcpSources','productSources','ciSources','workerClosureSources'])assert.deepEqual(after[key],before[key],key);
  let graph;
  const first=await buildSupportMcpEvents(root,{esbuild:{async build(options){const result=await esbuild.build({...options,metafile:true});graph=result.metafile;return result;}}});
  const second=await buildSupportMcpEvents(root);
  assert.equal(first.alreadyWrapped,true);assert.equal(second.alreadyWrapped,true);
  assert.equal(first.entrySha256,second.entrySha256);assert.equal(first.adapterSha256,second.adapterSha256);
  assert.ok(!previousBundles.includes(second.adapterSha256),'earlier accepted bundles do not describe this revision');
  const expectedShared=['runtime-entry.ts','runtime-backend.ts','protocol.ts','crypto.ts','crypto-buffer.ts','callback-policy.ts','native-http1.ts','native-deno-https.ts','pinned-https.ts','webhooks.ts','delivery.ts','worker-http.ts'].map(p=>shared+p).sort();
  assert.deepEqual(Object.keys(graph.inputs).filter(p=>p.startsWith(shared)).sort(),expectedShared,'exact twelve shared runtime modules');
  assert.ok(Object.keys(graph.inputs).every(p=>!/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(p)),'no test module in runtime bundle');
  const bundle=await fs.readFile(path.join(root,shared+'runtime.bundle.mjs'),'utf8');
  assert.match(bundle,/DENO_NODE_HTTPS_PINNING_PROVEN\s*=\s*false/);assert.match(bundle,/DENO_NATIVE_HTTPS_PINNING_PROVEN\s*=\s*true/);
  const entry=await fs.readFile(path.join(root,generated),'utf8');assert.equal(entry.split('// SINTAGMA_SUPPORT_MCP_EVENTS_POSTBUILD_V1').length-1,1);
  const workerExpected=Number(process.env.EXPECTED_WORKER_TESTS);assert.ok(Number.isSafeInteger(workerExpected)&&workerExpected>=218);
  const cases={worker:tap(await fs.readFile(path.join(out,'worker-tests.log'),'utf8'),workerExpected,'worker'),wrapper:tap(await fs.readFile(path.join(out,'wrapper-tests.log'),'utf8'),60,'wrapper'),cryptoVectors:tap(await fs.readFile(path.join(out,'crypto-vectors.log'),'utf8'),12,'crypto')};
  const types=await Promise.all(['2.1.4','2.8.3'].map(async version=>JSON.parse(await fs.readFile(path.join(out,`types-${version}.json`),'utf8'))));
  assert.ok(types.every(item=>item.status==='PASS'));
  const result={status:'SOURCE_BUILD_READINESS_CANDIDATE_NOT_POST_NETWORK_OR_CLOUD_ACCEPTANCE',baseCommit:base,node:process.version,...after,cases,denoTypes:types,toolNames,nodePinningMarker:false,nativePinningMarker:true,databaseConfigWrites:0,databaseAccessed:false,externalCallbacks:0,cloudSubscriptions:0,providedRootAcceptance:{requestId:124241,scope:'native TCP/TLS fixed data-free HEAD only'},build:second,generatedProductPaths:[generated,shared+'runtime.bundle.mjs'],graphInputs:Object.keys(graph.inputs).sort(),graphExternals:Object.values(graph.outputs).flatMap(v=>v.imports).filter(i=>i.external).map(i=>i.path).sort()};
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
  await fs.writeFile(path.join(out,'adapter-metafile.json'),JSON.stringify(graph,null,2)+'\n');
  await fs.copyFile(path.join(root,generated),path.join(out,'generated-mcp-index.ts'));await fs.copyFile(path.join(root,shared+'runtime.bundle.mjs'),path.join(out,'runtime.bundle.mjs'));
  console.log(JSON.stringify({status:result.status,cases,adapterSha256:second.adapterSha256,entrySha256:second.entrySha256,sharedRuntimeModules:expectedShared.length,nodePinningMarker:false,nativePinningMarker:true,databaseConfigWrites:0,externalCallbacks:0}));
} else throw new Error('expected_capture_or_verify');
