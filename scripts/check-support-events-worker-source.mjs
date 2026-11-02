// CI-only worker graph verification. Does not import/execute the Deno entry.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const root=process.cwd(),require=createRequire(path.join(root,'package.json'));
const esbuild=require('esbuild');
const fixedFiles={
  "supabase/functions/_shared/support-mcp-events/crypto.ts": "17b3b107d7191cc9be4145f8e4abea3f02ac6e0d758173471bec17f7d8333c7e",
  "supabase/functions/_shared/support-mcp-events/pinned-https.ts": "abff3330970d1196e80df9ed2705652cd9ac692215eae7c1b8ae7f4fe29ea942",
  "supabase/functions/_shared/support-mcp-events/webhooks.ts": "db755778b0ba0e84a640ffc72511160b500b1ae5a033296b25627add53d94857",
  "supabase/functions/_shared/support-mcp-events/delivery.ts": "b73fb3f948edc9b0bf8e04ec24db5db656c85cb6c048a66536fb06e0cecb308c",
  "supabase/functions/_shared/support-mcp-events/worker-http.ts": "5975b21c0a5fe3b25b5de5ff23543d9adcdc7df1d5e0fe924b36c161ff0ee49b",
  "supabase/functions/_shared/support-mcp-events/webhook-security.test.ts": "77aa669b00636071b049a3172a8a4ff0105b4b80bfbdfe41d332599fe6dd53b5",
  "supabase/functions/_shared/support-mcp-events/worker-http.test.ts": "4018c176f4b07284bad7ccc7dca1b5cd2fb54f314bb6a9e2ec069286809644a2",
  "supabase/functions/_shared/support-mcp-events/worker-probe-auth-v2.test.ts": "c31759321813867380d78a145f324b340762cafe33d03549c1fccef0af24d237",
  "supabase/functions/support-event-delivery/index.ts": "c670508cd36235d15d822c25af4de8a52e66fe3109657d0813e5bfe2e91b2f3a",
  "supabase/migrations/20261103012000_support_mcp_events_disabled_probe.sql": "59ae4a4692e0709d96da0a93e12e40aecb92a3edad93f2888508303f0261c7e2"
};
const protectedBlobs={
  "src/lib/mcp/get-my-profile.test.ts": "a4a546684a47966cd831e11e43dfe7a971d2aa30",
  "src/lib/mcp/index.ts": "715fa940824dc2600dd3dc0e4ad2d7b7bf925ec9",
  "src/lib/mcp/invoice-source.test.ts": "7abfbb08e9ae9aeeaff394bf52b6e9afc6bf0181",
  "src/lib/mcp/invoice-source.ts": "36d051b8bf353ce254e7dacc3468f025e8f40808",
  "src/lib/mcp/platform-acts.test.ts": "94c82195f3c9b12a8675458022429ef8b79af502",
  "src/lib/mcp/platform-acts.ts": "b45e9e436d8011e3316f5879a83bd8196410cf4e",
  "src/lib/mcp/postpaid-billing.test.ts": "2c970aafc041545cce8cd2b7d7c2ebe784cdc9e9",
  "src/lib/mcp/postpaid-billing.ts": "9cd348fe85137e455a7ad32bf117175f424ab07f",
  "src/lib/mcp/support-read.test.ts": "aa1ff78f4cab967e985910371143d1b31629cdfd",
  "src/lib/mcp/support-read.ts": "0df55a478fc842373eeb766180a4bc96823581a5",
  "src/lib/mcp/tools/approve-sintagma-postpaid-statement.ts": "8409231ae75f59da7a5fbd9b725ee0def640b13e",
  "src/lib/mcp/tools/create-sintagma-invoice-act.ts": "b56a698ef5fac918ff808df26c133683b1e9d395",
  "src/lib/mcp/tools/get-my-profile.ts": "d3ce9cf127f7fe80301201fb3bf38991f6e9603f",
  "src/lib/mcp/tools/get-sintagma-invoice-export.ts": "dbcef57d672a79999377500e23ceae95827c7069",
  "src/lib/mcp/tools/get-sintagma-postpaid-billing-overview.ts": "9f89e9faaa25110f51c282a5143c8180ecb3d8f8",
  "src/lib/mcp/tools/get-sintagma-support-request.ts": "9b271cb30b98f3d9ae73c35e461fe2fecbcbd3ee",
  "src/lib/mcp/tools/issue-sintagma-postpaid-invoice.ts": "858a547451ff5b12aa7c064309c5aa07a0b2e33e",
  "src/lib/mcp/tools/prepare-sintagma-postpaid-statement.ts": "b22f8a6434ac2f210e77ea19487085d28640fe4e",
  "src/lib/mcp/tools/preview-sintagma-invoice-act.ts": "01774f958f7177a2b9b5db4e6bd620ddf1bea2c2",
  "src/lib/mcp/tools/preview-sintagma-postpaid-statement.ts": "f5b2252dde3b145bc8513ffe19eb7e382c1eca0a",
  "src/lib/mcp/tools/search-sintagma-billing-organizations.ts": "7a3b55ecec1303992409154324137161199c4d64",
  "src/lib/mcp/tools/search-sintagma-invoices.ts": "ef0c2299eaa12a57b871e438d51774616d2f2e50",
  "src/lib/mcp/tools/search-sintagma-support-requests.ts": "38c0370a7eb4777cfd4ec7402a6403606647da1e",
  "src/lib/mcp/tools/whoami.ts": "821519e0e317717fb6a63ebb06e272b2f0f08195",
  "supabase/config.toml": "d75ea5808e9f7a55ae5deb7e219926da2e453bdb",
  "supabase/functions/mcp/index.ts": "ccd4b7d23b2c20f4ed31cf275f0c4eebeabbb6fe",
  "vite.config.ts": "e9cf0a3a3a0256838fae5db055dd2d3d1bb52467"
};
for(const [file,sha] of Object.entries(fixedFiles)){
 const b=await fs.readFile(file);assert.equal(createHash('sha256').update(b).digest('hex'),sha,'fixed source changed: '+file);
}
for(const [file,sha] of Object.entries(protectedBlobs)){
 const b=await fs.readFile(file);const actual=createHash('sha1').update(Buffer.from('blob '+b.length+'\u0000')).update(b).digest('hex');assert.equal(actual,sha,'protected base changed: '+file);
}
const entry='supabase/functions/support-event-delivery/index.ts';
const shared='supabase/functions/_shared/support-mcp-events/';
const expected=[entry,...['crypto.ts','pinned-https.ts','webhooks.ts','delivery.ts','worker-http.ts'].map(x=>shared+x)].sort();
const result=await esbuild.build({entryPoints:[entry],outfile:'outputs/support-events-worker/worker.mjs',bundle:true,write:false,metafile:true,
  platform:'neutral',format:'esm',target:'es2022',sourcemap:false,logLevel:'silent',external:['node:*','npm:*']});
assert.equal(result.outputFiles.length,1);
assert.equal(result.outputFiles[0].contents.byteLength,32130);
assert.equal(createHash('sha256').update(result.outputFiles[0].contents).digest('hex'),'0ff44c219ae283ba44a1b0a02e92c5e215ab03deb03b52d0af6077fe307c7a46');
const inputs=Object.keys(result.metafile.inputs).map(x=>x.replaceAll('\\','/')).sort();
assert.deepEqual(inputs,expected);
const code=result.outputFiles[0].contents;
const text=new TextDecoder().decode(code);
assert.ok(text.includes('npm:@supabase/supabase-js@2.90.1'));
assert.ok(!text.includes('withSupportMcpEvents'));
assert.ok(!inputs.some(x=>/protocol|runtime-backend|runtime-entry|\/mcp\/index/.test(x)));
const out=path.join(root,'outputs/support-events-worker');await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'worker.mjs'),code);
const report={status:'NEUTRAL_ESBUILD_GRAPH_ONLY_NOT_DENO_ACCEPTANCE',node:process.version,fixedFiles,protectedBlobs,bytes:code.byteLength,
 sha256:createHash('sha256').update(code).digest('hex'),inputs,externalImports:Object.values(result.metafile.outputs).flatMap(o=>o.imports.filter(i=>i.external).map(i=>i.path)),
 limits:['Does not execute/import Deno entry','No real network, TLS or Cloud subscription','Production pinning gate remains false']};
await fs.writeFile(path.join(out,'graph.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
