const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const safe=(base,relative)=>{if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw Error('Unsafe finite input path');const resolved=path.resolve(base,relative);if(!resolved.startsWith(path.resolve(base)+path.sep))throw Error('Input outside intended package');return resolved;};
function deriveHeldBytes(bytes,item){
 const transform=item.source.gitBlobReconstruction;
 if(!transform)return {bytes,derived:false};
 if(item.source.kind!=='repository'||transform.transform!=='lf_to_crlf'||!/^[a-f0-9]{64}$/.test(transform.sha256)||!Number.isSafeInteger(transform.bytes)||transform.bytes<1)throw Error('Invalid pinned input derivation: '+item.target);
 if(bytes.length!==transform.bytes||sha(bytes)!==transform.sha256)return {bytes,derived:false};
 const text=bytes.toString('utf8');if(!Buffer.from(text,'utf8').equals(bytes))throw Error('Non-UTF8 pinned input derivation: '+item.target);
 return {bytes:Buffer.from(text.replace(/\r?\n/g,'\r\n'),'utf8'),derived:true};
}
module.exports=function prepareNative(packageRoot,repository,output){
 const manifest=JSON.parse(fs.readFileSync(path.join(packageRoot,'manifest.json'),'utf8')),mirror=path.join(output,'mirror'),profile=path.join(output,'profile');fs.mkdirSync(mirror);fs.mkdirSync(profile);const receipt={scope:manifest.scope,inputs:[],sutSourcePins:[]};
 for(const pin of manifest.sutSourcePins){const raw=fs.readFileSync(safe(repository,pin.path)),actual=sha(raw);if(!pin.allowedExactSha256.includes(actual))throw Error('Actual SUT source changed: '+pin.path);receipt.sutSourcePins.push({path:pin.path,sha256:actual});}
 for(const item of manifest.inputs){
  let method=item.source.kind;const sourceBase=item.source.kind==='repository'?repository:packageRoot;
  let bytes=fs.readFileSync(safe(sourceBase,item.source.path)),sourceSha=sha(bytes);
  if(bytes.length!==item.bytes||sourceSha!==item.sha256){
   let derived=deriveHeldBytes(bytes,item);bytes=derived.bytes;if(derived.derived)method='pinned_git_lf_to_held_crlf';
   if((bytes.length!==item.bytes||sha(bytes)!==item.sha256)&&item.source.kind==='repository'&&item.source.allowExactGitBlob){
    const git=cp.spawnSync('git',['show','HEAD:'+item.source.path],{cwd:repository,windowsHide:true,maxBuffer:6*1024*1024});
    if(git.status!==0)throw Error('Missing pinned Git blob: '+item.source.path);
    sourceSha=sha(git.stdout);derived=deriveHeldBytes(git.stdout,item);bytes=derived.bytes;method=derived.derived?'exact_git_blob_pinned_crlf':'exact_git_blob';
   }
  }
  if(bytes.length!==item.bytes||sha(bytes)!==item.sha256)throw Error('Finite input pin changed: '+item.target);
  const target=safe(mirror,item.target);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
  receipt.inputs.push({target:item.target,source:item.source.path,method,sourceSha256:sourceSha,bytes:bytes.length,sha256:item.sha256});
 }
 fs.writeFileSync(path.join(mirror,'package.json'),JSON.stringify({private:true,type:'module'})+'\n');const modules=path.join(repository,'node_modules');if(!fs.statSync(modules).isDirectory())throw Error('Install repository dependencies first');fs.symlinkSync(modules,path.join(mirror,'node_modules'),process.platform==='win32'?'junction':'dir');
 for(const name of ['b1-native.setup.mjs','b1-native.vitest.config.mjs','profile-contract.json'])fs.copyFileSync(path.join(packageRoot,'profile',name),path.join(profile,name));
 fs.writeFileSync(path.join(output,'input-pin-receipt.json'),JSON.stringify(receipt,null,2)+'\n');return{mirror,profile,manifest};
};
