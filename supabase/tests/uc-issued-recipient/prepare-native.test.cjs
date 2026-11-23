// Preparation/diagnostic tests only: no database, Docker command or old suite.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const packageRoot=__dirname,repository=path.resolve(packageRoot,'../../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(packageRoot,'manifest.json'),'utf8'));
const artifactRoot=path.resolve(process.env.B1_NATIVE_ARTIFACTS||path.join(repository,'outputs','uc-issued-recipient-native'));
fs.mkdirSync(artifactRoot,{recursive:true});
const root=path.join(artifactRoot,'prepare-only-'+crypto.randomBytes(6).toString('hex'));
fs.mkdirSync(root);const virtualRepository=path.join(root,'linux-checkout');fs.mkdirSync(virtualRepository);
const git=process.argv.find(arg=>arg.startsWith('--git='))?.slice(6)||process.env.B1_TEST_GIT_BINARY||'git';
const runGit=args=>{const result=cp.spawnSync(git,args,{cwd:repository,encoding:null,windowsHide:true,maxBuffer:64*1024*1024});if(result.status!==0)throw Error('Git read failed: '+args[0]);return result.stdout;};
const tree=new Map(runGit(['ls-tree','-r','--full-tree','HEAD']).toString('utf8').trim().split('\n').map(line=>{const[meta,file]=line.split('\t');return[file,meta.split(' ')[2]];}));
const sourcePaths=[...new Set([...manifest.inputs.filter(x=>x.source.kind==='repository').map(x=>x.source.path),...manifest.sutSourcePins.map(x=>x.path),'package.json'])];
for(const file of sourcePaths)assert.ok(tree.has(file),'Missing actual Git source '+file);
const batch=cp.spawnSync(git,['cat-file','--batch'],{cwd:repository,input:sourcePaths.map(file=>tree.get(file)).join('\n')+'\n',windowsHide:true,maxBuffer:64*1024*1024});
assert.equal(batch.status,0);let cursor=0;
for(const file of sourcePaths){
 const end=batch.stdout.indexOf(10,cursor),header=batch.stdout.subarray(cursor,end).toString('ascii').split(' ');
 assert.equal(header[1],'blob');const size=Number(header[2]);
 const bytes=batch.stdout.subarray(end+1,end+1+size);cursor=end+1+size+1;
 const output=path.join(virtualRepository,file);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,bytes);
}
const modules=path.join(repository,'node_modules');assert.ok(fs.statSync(modules).isDirectory());
fs.symlinkSync(modules,path.join(virtualRepository,'node_modules'),process.platform==='win32'?'junction':'dir');
const prepare=require('./prepare-native.cjs'),preparedOutput=path.join(root,'all-git-inputs');fs.mkdirSync(preparedOutput);
prepare(packageRoot,virtualRepository,preparedOutput);
const receipt=JSON.parse(fs.readFileSync(path.join(preparedOutput,'input-pin-receipt.json'),'utf8'));
assert.equal(receipt.inputs.length,manifest.inputs.length);
const reconstructed=receipt.inputs.filter(x=>x.method==='pinned_git_lf_to_held_crlf');
assert.equal(reconstructed.length,58);
for(const item of receipt.inputs){const actual=fs.readFileSync(path.join(preparedOutput,'mirror',item.target));assert.equal(sha(actual),item.sha256);assert.equal(actual.length,item.bytes);}

// An unknown source digest may not be normalized into an accepted fixture.
const selected=manifest.inputs.find(x=>x.source.gitBlobReconstruction);
assert.ok(selected);const badPackage=path.join(root,'bad-derivation'),badOutput=path.join(root,'bad-output');
fs.mkdirSync(badPackage);fs.mkdirSync(badOutput);
const invalid=structuredClone(selected);invalid.source.allowExactGitBlob=false;invalid.source.gitBlobReconstruction.sha256='0'.repeat(64);
fs.writeFileSync(path.join(badPackage,'manifest.json'),JSON.stringify({scope:'SYNTHETIC_NEGATIVE',sutSourcePins:[],inputs:[invalid]}));
assert.throws(()=>prepare(badPackage,virtualRepository,badOutput),/Finite input pin changed/);

// A preparation failure must itself produce an artifact, before Docker exists.
const failingPackage=path.join(virtualRepository,'supabase/tests/uc-issued-recipient');
for(const file of ['manifest.json','prepare-native.cjs','run-native.cjs','case/b1.core.native.test.ts','profile/b1-native.setup.mjs','profile/b1-native.vitest.config.mjs','profile/profile-contract.json']){
 const destination=path.join(failingPackage,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(packageRoot,file),destination);
}
const invalidManifest=structuredClone(manifest);invalidManifest.inputs[0].sha256='0'.repeat(64);invalidManifest.inputs[0].source.allowExactGitBlob=false;
fs.writeFileSync(path.join(failingPackage,'manifest.json'),JSON.stringify(invalidManifest));
const failureRoot=path.join(root,'expected-early-failure');
const failure=cp.spawnSync(process.execPath,[path.join(failingPackage,'run-native.cjs')],{cwd:virtualRepository,
 env:{...process.env,B1_NATIVE_ARTIFACTS:failureRoot},encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024});
assert.equal(failure.status,1);
const failures=fs.readdirSync(failureRoot).filter(name=>name.startsWith('run-'));assert.equal(failures.length,1);
const failed=JSON.parse(fs.readFileSync(path.join(failureRoot,failures[0],'run-result.json'),'utf8'));
assert.equal(failed.status,'FAIL');assert.equal(failed.phase,'finite_input_preparation');assert.equal(failed.containerStarts,0);assert.equal(failed.testStarts,0);
assert.match(failed.error.message,/Finite input pin changed/);
const result={scope:'PREPARATION_ONLY_EXACT_GIT_BLOBS_NO_DATABASE_OR_OLD_TESTS',passed:3,
 exactInputs:receipt.inputs.length,exactCrlfReconstructions:reconstructed.length,heldTargetDigestsChanged:0,
 wrongCanonicalDigestRejected:true,earlyFailureArtifactVerified:true,dockerStarts:0,
 testSourceSha256:sha(fs.readFileSync(__filename))};
fs.writeFileSync(path.join(root,'acceptance.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output:root,...result}));
