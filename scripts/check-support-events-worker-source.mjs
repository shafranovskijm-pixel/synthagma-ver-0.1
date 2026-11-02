// CI-only worker graph verification. Does not import/execute the Deno entry.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const root=process.cwd(),require=createRequire(path.join(root,'package.json'));
const esbuild=require('esbuild');
const entry='supabase/functions/support-event-delivery/index.ts';
const shared='supabase/functions/_shared/support-mcp-events/';
const expected=[entry,...['crypto.ts','pinned-https.ts','webhooks.ts','delivery.ts','worker-http.ts'].map(x=>shared+x)].sort();
const result=await esbuild.build({entryPoints:[entry],outfile:'outputs/support-events-worker/worker.mjs',bundle:true,write:false,metafile:true,
  platform:'neutral',format:'esm',target:'es2022',sourcemap:false,logLevel:'silent',external:['node:*','npm:*']});
assert.equal(result.outputFiles.length,1);
const inputs=Object.keys(result.metafile.inputs).map(x=>x.replaceAll('\\','/')).sort();
assert.deepEqual(inputs,expected);
const code=result.outputFiles[0].contents;
const text=new TextDecoder().decode(code);
assert.ok(text.includes('npm:@supabase/supabase-js@2.90.1'));
assert.ok(!text.includes('withSupportMcpEvents'));
assert.ok(!inputs.some(x=>/protocol|runtime-backend|runtime-entry|\/mcp\/index/.test(x)));
const out=path.join(root,'outputs/support-events-worker');await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'worker.mjs'),code);
const report={status:'NEUTRAL_ESBUILD_GRAPH_ONLY_NOT_DENO_ACCEPTANCE',node:process.version,bytes:code.byteLength,
 sha256:createHash('sha256').update(code).digest('hex'),inputs,externalImports:Object.values(result.metafile.outputs).flatMap(o=>o.imports.filter(i=>i.external).map(i=>i.path)),
 limits:['Does not execute/import Deno entry','No real network, TLS or Cloud subscription','Production pinning gate remains false']};
await fs.writeFile(path.join(out,'graph.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
