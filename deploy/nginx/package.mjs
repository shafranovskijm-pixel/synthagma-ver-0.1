#!/usr/bin/env node
// Packages an existing production dist; never rebuilds or edits it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {spawn, spawnSync} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';

const args=process.argv.slice(2), options={};
for(let i=0;i<args.length;i++) {
  if(args[i]==='--write') options.write=true;
  else if(['--dist','--out','--release','--expected-commit','--public-settings-sha256'].includes(args[i])&&args[i+1]&&!args[i+1].startsWith('--')) options[args[i].slice(2)]=args[++i];
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}
const repo=fileURLToPath(new URL('../..',import.meta.url));
const dist=path.resolve(options.dist??path.join(repo,'dist'));
const git=(...parts)=>{
  const r=spawnSync('git',parts,{cwd:repo,encoding:'utf8'});
  if(r.status!==0) throw new Error('Cannot read source Git revision');
  return r.stdout.trim();
};
const commit=git('rev-parse','HEAD');
if(options['expected-commit']&&options['expected-commit']!==commit) throw new Error('Source HEAD differs from --expected-commit');
const release=options.release??`${new Date().toISOString().replace(/[-:.]/g,'').replace('T','-').replace('Z','')}-${commit.slice(0,12)}`;
if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(release)||release.includes('..')) throw new Error('Invalid release identifier');
const settingsSha=options['public-settings-sha256']?.toLowerCase()??null;
if(settingsSha&&!/^[a-f0-9]{64}$/.test(settingsSha)) throw new Error('Expected lowercase SHA256 for public build settings');
if(options.write&&(!options.out||!options['expected-commit']||!settingsSha)) throw new Error('--write requires --out, --expected-commit and --public-settings-sha256');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const gzipPattern=/\.(?:js|css|html|json|svg|txt|xml|webmanifest|wasm)$/i;
const files=[];
function walk(dir,prefix='') {
  for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const name=prefix+item.name, full=path.join(dir,item.name);
    if(item.isSymbolicLink()||!item.isDirectory()&&!item.isFile()) throw new Error(`Only regular files/directories are allowed: ${name}`);
    if(name.split('/').some(p=>!p||p==='.'||p==='..'||/[\\:\x00-\x1f]/.test(p))) throw new Error(`Unsafe path: ${name}`);
    if(item.isDirectory()) walk(full,name+'/');
    else files.push({name,full});
  }
}
walk(dist);
if(!files.some(f=>f.name==='index.html')||!files.some(f=>f.name==='sw.js')) throw new Error('Production dist must contain index.html and sw.js');
const output=options.out?path.resolve(options.out):null;
if(output&&(output===dist||output.startsWith(dist+path.sep))) throw new Error('Output directory must be outside dist');
if(process.platform==='win32'&&output&&!/^D:\\/i.test(output)) throw new Error('Windows output must stay on drive D');
const stage=output?path.join(output,`stage-${release}`):null;
if(options.write&&fs.existsSync(stage)) throw new Error('Release stage already exists; choose a new release identifier');
if(options.write) fs.mkdirSync(path.join(stage,'site'),{recursive:true});
const entries=[];
for(const file of files) {
  const data=fs.readFileSync(file.full);
  entries.push({path:file.name,bytes:data.length,sha256:sha(data)});
  if(options.write) {
    const destination=path.join(stage,'site',file.name);
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.writeFileSync(destination,data,{flag:'wx'});
  }
  if(gzipPattern.test(file.name)&&!files.some(f=>f.name===file.name+'.gz')) {
    const compressed=zlib.gzipSync(data,{level:9,mtime:0});
    entries.push({path:file.name+'.gz',bytes:compressed.length,sha256:sha(compressed),encoding:'gzip',original:file.name});
    if(options.write) fs.writeFileSync(path.join(stage,'site',file.name+'.gz'),compressed,{flag:'wx'});
  }
}
const dirty=git('status','--porcelain','--untracked-files=no').split(/\r?\n/).filter(Boolean);
const diff=spawnSync('git',['diff','HEAD','--binary','--','src','public','vite.config.ts','package.json','package-lock.json','scripts'],{cwd:repo});
if(diff.status!==0) throw new Error('Cannot fingerprint frontend source diff');
const manifest={schemaVersion:1,releaseId:release,createdAt:new Date().toISOString(),source:{gitCommit:commit,trackedDirtyPaths:dirty,frontendDiffSha256:sha(diff.stdout)},build:{mode:'production',publicSettingsSha256:settingsSha,settingsEvidence:'operator-supplied fingerprint; source/build linkage must be checked in the build record'},files:entries.sort((a,b)=>a.path.localeCompare(b.path))};
const summary={mode:options.write?'write':'dry-run',releaseId:release,gitCommit:commit,trackedDirtyPaths:dirty,frontendDiffSha256:manifest.source.frontendDiffSha256,publicSettingsSha256:settingsSha,originalFiles:files.length,packedFiles:entries.length,uncompressedBytes:entries.reduce((n,f)=>n+f.bytes,0)};
if(options.write) {
  fs.writeFileSync(path.join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  const archive=path.join(output,`${release}.tar.gz`);
  if(fs.existsSync(archive)) throw new Error('Archive already exists');
  const tar=spawn('tar',['-cf','-','-C',stage,'--','manifest.json','site'],{stdio:['ignore','pipe','pipe']});
  let tarError=''; tar.stderr.on('data',data=>tarError+=data.toString());
  const completion=new Promise((resolve,reject)=>{tar.once('error',reject);tar.once('close',code=>code===0?resolve():reject(new Error(`tar failed: ${tarError.slice(0,400)}`)));});
  await Promise.all([pipeline(tar.stdout,zlib.createGzip({level:9,mtime:0}),fs.createWriteStream(archive,{flags:'wx'})),completion]);
  const archiveSha=crypto.createHash('sha256');
  for await(const chunk of fs.createReadStream(archive)) archiveSha.update(chunk);
  summary.archive=archive; summary.archiveSha256=archiveSha.digest('hex'); summary.archiveBytes=fs.statSync(archive).size;
  fs.writeFileSync(archive+'.sha256',`${summary.archiveSha256}  ${path.basename(archive)}\n`,{flag:'wx'});
  fs.writeFileSync(path.join(output,`${release}.manifest.json`),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
}
console.log(JSON.stringify(summary,null,2));
