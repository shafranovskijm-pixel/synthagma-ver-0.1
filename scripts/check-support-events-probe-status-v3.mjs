// CI only: fixed backend source and unchanged application/MCP/SQL graph.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
const hash=b=>createHash('sha256').update(b).digest('hex');
const fixedFiles={
  "supabase/functions/_shared/support-mcp-events/crypto.ts": "17b3b107d7191cc9be4145f8e4abea3f02ac6e0d758173471bec17f7d8333c7e",
  "supabase/functions/_shared/support-mcp-events/pinned-https.ts": "933f50ba259426e723d1d4192add9c923c2b36f82db5c723fb595a407b331b0b",
  "supabase/functions/_shared/support-mcp-events/webhooks.ts": "db755778b0ba0e84a640ffc72511160b500b1ae5a033296b25627add53d94857",
  "supabase/functions/_shared/support-mcp-events/delivery.ts": "b73fb3f948edc9b0bf8e04ec24db5db656c85cb6c048a66536fb06e0cecb308c",
  "supabase/functions/_shared/support-mcp-events/worker-http.ts": "0f63a17230b815f00e18c55f50f751ee3409bf8f768e7515e3b8b2516abdcdd2",
  "supabase/functions/_shared/support-mcp-events/webhook-security.test.ts": "77aa669b00636071b049a3172a8a4ff0105b4b80bfbdfe41d332599fe6dd53b5",
  "supabase/functions/_shared/support-mcp-events/worker-http.test.ts": "4018c176f4b07284bad7ccc7dca1b5cd2fb54f314bb6a9e2ec069286809644a2",
  "supabase/functions/_shared/support-mcp-events/worker-probe-auth-v2.test.ts": "c31759321813867380d78a145f324b340762cafe33d03549c1fccef0af24d237",
  "supabase/functions/_shared/support-mcp-events/worker-probe-status-v3.test.ts": "81d1eb5423dc4efc3f6336fc4e9cf3893c210eead67e994b3ab144cd808f4fc2",
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
for(const [file,sha]of Object.entries(fixedFiles))assert.equal(hash(await fs.readFile(file)),sha,'fixed source changed: '+file);
for(const [file,sha]of Object.entries(protectedObjects))assert.equal(execFileSync('git',['rev-parse','HEAD:'+file],{encoding:'utf8'}).trim(),sha,'protected application/MCP/SQL object changed: '+file);
const allowedPaths=[
  ".github/workflows/support-events-probe-status-v3-ci-only.yml",
  "scripts/check-support-events-probe-status-v3.mjs",
  "supabase/functions/_shared/support-mcp-events/pinned-https.ts",
  "supabase/functions/_shared/support-mcp-events/worker-http.ts",
  "supabase/functions/_shared/support-mcp-events/worker-probe-status-v3.test.ts"
];
assert.deepEqual(execFileSync('git',['diff','--name-only','bddf4080cf85d6646113986cbc261bd35174fbc6','HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).sort(),allowedPaths);
const entry='supabase/functions/support-event-delivery/index.ts',base='supabase/functions/_shared/support-mcp-events/';
const expected=[entry,...['crypto.ts','pinned-https.ts','webhooks.ts','delivery.ts','worker-http.ts'].map(f=>base+f)].sort();
const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'neutral',format:'esm',target:'es2022',external:['node:*','npm:*'],metafile:true});
const inputs=Object.keys(result.metafile.inputs).map(f=>f.replaceAll('\\','/')).sort();
assert.deepEqual(inputs,expected);assert.equal(result.outputFiles.length,1);
const code=result.outputFiles[0].contents;
assert.equal(code.length,32335);assert.equal(hash(code),'a57a3adf983963863270bf7328aaa467e5575a72b40c61340b000a74d07eb3c7');
const out='outputs/support-events-probe-status-v3';await fs.mkdir(out,{recursive:true});
await fs.writeFile(out+'/worker.mjs',code);
const report={status:'SOURCE_GRAPH_ONLY_NOT_ACTUAL_RUNTIME',node:process.version,bytes:code.length,sha256:hash(code),inputs,fixedFiles,protectedObjects,allowedPaths,
limitations:['No actual Edge or network probe','2 runtime files and one new test only','Existing application build41488583561 retained; unchanged app/lock/MCP/SQL git objects verified','Readiness false and enabled config unchanged']};
await fs.writeFile(out+'/graph.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
