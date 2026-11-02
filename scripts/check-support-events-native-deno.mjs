// CI only: frozen native transport and unchanged old Node/App/MCP/SQL.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
const hash=b=>createHash('sha256').update(b).digest('hex');
const fixedFiles={
  "supabase/functions/_shared/support-mcp-events/crypto.ts": "17b3b107d7191cc9be4145f8e4abea3f02ac6e0d758173471bec17f7d8333c7e",
  "supabase/functions/_shared/support-mcp-events/callback-policy.ts": "01ac6b83176a0443f0a3be057bf2879426a577d0d884abf8e53321c7554086dd",
  "supabase/functions/_shared/support-mcp-events/pinned-https.ts": "5a197231ec2e232d487e1e93e7b688639da1edf390f4a226c51659f427ae4f5a",
  "supabase/functions/_shared/support-mcp-events/native-http1.ts": "1b74744e928f5a5502899bf8438e7d8127498fe6507ce43701b11d9e736f65f2",
  "supabase/functions/_shared/support-mcp-events/native-deno-https.ts": "a3feff689b34f1844e732bd634da76529b39442485b7bb7549dc18a4f2e75fe1",
  "supabase/functions/_shared/support-mcp-events/webhooks.ts": "db755778b0ba0e84a640ffc72511160b500b1ae5a033296b25627add53d94857",
  "supabase/functions/_shared/support-mcp-events/delivery.ts": "b73fb3f948edc9b0bf8e04ec24db5db656c85cb6c048a66536fb06e0cecb308c",
  "supabase/functions/_shared/support-mcp-events/worker-http.ts": "2364bd452a105c803318b884401b6b689360e4567cf8029f2327b6440b582017",
  "supabase/functions/_shared/support-mcp-events/webhook-security.test.ts": "77aa669b00636071b049a3172a8a4ff0105b4b80bfbdfe41d332599fe6dd53b5",
  "supabase/functions/_shared/support-mcp-events/worker-http.test.ts": "4018c176f4b07284bad7ccc7dca1b5cd2fb54f314bb6a9e2ec069286809644a2",
  "supabase/functions/_shared/support-mcp-events/worker-probe-auth-v2.test.ts": "c31759321813867380d78a145f324b340762cafe33d03549c1fccef0af24d237",
  "supabase/functions/_shared/support-mcp-events/worker-probe-status-v3.test.ts": "81d1eb5423dc4efc3f6336fc4e9cf3893c210eead67e994b3ab144cd808f4fc2",
  "supabase/functions/_shared/support-mcp-events/native-deno-https.test.ts": "e23202d8f5cdd5e25bb56c57daada597cc402e3d5f59222d7bbfa8aeddd5a9a1",
  "supabase/functions/_shared/support-mcp-events/native-http1-adversarial-peer.test.ts": "0ea1c72bab012c0a79c47a6fffe284318774840bbcce8fceb31f3893763cf0ad",
  "supabase/functions/support-event-delivery/index.ts": "c670508cd36235d15d822c25af4de8a52e66fe3109657d0813e5bfe2e91b2f3a"
};
const protectedObjects={
  "bun.lockb": "495270568c33b979477cfd3b4f8a96076eb4d25b",
  "eslint.config.js": "e9be6dfba41093fadc6b25d3f601bb2735406c60",
  "index.html": "f3279e1fed0defaffae8c6bf27db1442e61feffd",
  "package-lock.json": "0a28f39a785ca995a80628612dcef891cbc5e4a8",
  "package.json": "5d296992c60f788453f0c8f80f7c3fdab031c007",
  "postcss.config.js": "2aa7205d4b402a1bdfbe07110c61df920b370066",
  "public": "842cd23f7e31d8ee5763bf4799ac486b6e07ce40",
  "src": "eed2963c496f1469c74371a7d055136f1126e88b",
  "supabase/config.toml": "d75ea5808e9f7a55ae5deb7e219926da2e453bdb",
  "supabase/functions/mcp/index.ts": "ccd4b7d23b2c20f4ed31cf275f0c4eebeabbb6fe",
  "supabase/migrations": "8a33585af5679caeefb8fb377f8726366069e561",
  "tailwind.config.ts": "a3a5b66c42063e495a0c0f93ab3e214226599ea6",
  "tsconfig.app.json": "dbf29bcd37532cc07aac60f7789b8c367957b2eb",
  "tsconfig.json": "6b68d80b7d92d0c4a5d774897f2bedfa95b42669",
  "tsconfig.node.json": "3133162c20350e1741b94b8d2ff77b811bec8363",
  "vite.config.ts": "e9cf0a3a3a0256838fae5db055dd2d3d1bb52467"
};
for(const [file,sha]of Object.entries(fixedFiles))assert.equal(hash(await fs.readFile(file)),sha,'frozen source changed: '+file);
for(const [file,sha]of Object.entries(protectedObjects))assert.equal(execFileSync('git',['rev-parse','HEAD:'+file],{encoding:'utf8'}).trim(),sha,'protected App/MCP/SQL object changed: '+file);
const allowedPaths=[
  ".github/workflows/support-events-native-deno-ci-only.yml",
  "scripts/check-support-events-native-deno.mjs",
  "supabase/functions/_shared/support-mcp-events/callback-policy.ts",
  "supabase/functions/_shared/support-mcp-events/native-deno-https.test.ts",
  "supabase/functions/_shared/support-mcp-events/native-deno-https.ts",
  "supabase/functions/_shared/support-mcp-events/native-http1-adversarial-peer.test.ts",
  "supabase/functions/_shared/support-mcp-events/native-http1.ts",
  "supabase/functions/_shared/support-mcp-events/pinned-https.ts",
  "supabase/functions/_shared/support-mcp-events/worker-http.ts"
];
assert.deepEqual(execFileSync('git',['diff','--name-only','c9491c8731eca07f55c8be9424498439dcf01ece','HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).sort(),allowedPaths);
const base='supabase/functions/_shared/support-mcp-events/',entry='supabase/functions/support-event-delivery/index.ts';
const oldNode=execFileSync('git',['show','c9491c8731eca07f55c8be9424498439dcf01ece:'+base+'pinned-https.ts'],{encoding:'utf8'});
const currentNode=await fs.readFile(base+'pinned-https.ts','utf8');
const nodeSend=s=>s.slice(s.indexOf('  async function send('),s.lastIndexOf('\n  return {'));
assert.equal(nodeSend(currentNode),nodeSend(oldNode),'old Node send body changed');
assert.match(currentNode,/DENO_NODE_HTTPS_PINNING_PROVEN=false/);
assert.match(await fs.readFile(base+'native-deno-https.ts','utf8'),/DENO_NATIVE_HTTPS_PINNING_PROVEN=false/);
const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'neutral',format:'esm',target:'es2022',external:['node:*','npm:*'],metafile:true});
const expectedInputs=[
  "supabase/functions/_shared/support-mcp-events/callback-policy.ts",
  "supabase/functions/_shared/support-mcp-events/crypto.ts",
  "supabase/functions/_shared/support-mcp-events/delivery.ts",
  "supabase/functions/_shared/support-mcp-events/native-deno-https.ts",
  "supabase/functions/_shared/support-mcp-events/native-http1.ts",
  "supabase/functions/_shared/support-mcp-events/pinned-https.ts",
  "supabase/functions/_shared/support-mcp-events/webhooks.ts",
  "supabase/functions/_shared/support-mcp-events/worker-http.ts",
  "supabase/functions/support-event-delivery/index.ts"
];
assert.deepEqual(Object.keys(result.metafile.inputs).map(p=>p.replaceAll('\\','/')).sort(),expectedInputs);assert.equal(result.outputFiles.length,1);
const code=result.outputFiles[0].contents;assert.equal(code.length,48289);assert.equal(hash(code),'6a11be868b3a375400b9bc35eb90282ed162a679042d8221ad631162154ef739');
const out='outputs/support-events-native-deno';await fs.mkdir(out,{recursive:true});await fs.writeFile(out+'/worker.mjs',code);
const report={status:'SOURCE_GRAPH_ONLY_ACTUAL_NATIVE_RUNTIME_OPEN',node:process.version,bytes:code.length,sha256:hash(code),inputs:expectedInputs,fixedFiles,protectedObjects,allowedPaths,oldNodeSendBodyExact:true,nodeMarker:false,nativeMarker:false,
limits:['All networking uses doubles','No actual Edge DNS/TLS/Cloud proof','Old92 included in210, not added again','NoSQL/nativeSQLsuites/noHTTP/stockappbuild in this CI','Prior fullbuild41488583561 retained; App/MCP/SQL objects unchanged']};
await fs.writeFile(out+'/graph.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
