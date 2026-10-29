import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=fs.realpathSync(process.cwd()), here=path.dirname(new URL(import.meta.url).pathname), label=process.argv[2];
const guarded=['--max-old-space-size=4096','--require',path.join(here,'block-network.cjs')];
const stages={
 'npm-ci':{exe:'npm',args:['ci','--ignore-scripts','--legacy-peer-deps','--no-audit','--no-fund','--registry=https://registry.npmjs.org'],timeout:600000},
 'stock-tsc':{exe:process.execPath,args:[...guarded,path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.app.json','--noEmit'],timeout:300000},
 'context-suites':{exe:process.execPath,args:[...guarded,path.join(here,'run-tests.mjs')],timeout:180000},
};
const stage=stages[label];if(!stage)throw new Error('FINITE_STAGE_REQUIRED');
const artifactRoot=path.join(process.env.RUNNER_TEMP,'prog012-current-file-context-'+process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT,'node');
fs.mkdirSync(artifactRoot,{recursive:true});
const dir=artifactRoot, stdout=fs.openSync(path.join(dir,label+'.stdout.log'),'wx'),stderr=fs.openSync(path.join(dir,label+'.stderr.log'),'wx');
const started=Date.now();let timedOut=false,spawnError=null,finished=false;
fs.writeFileSync(path.join(dir,label+'.started.json'),JSON.stringify({label,args:stage.args,startedAtUtc:new Date().toISOString(),timeoutMs:stage.timeout,shell:false,networkAllowed:label==='npm-ci'?'public npm dependencies only':false},null,2)+'\n');
const child=spawn(stage.exe,stage.args,{cwd:root,shell:false,detached:true,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',b=>{fs.writeSync(stdout,b);process.stdout.write(b);});child.stderr.on('data',b=>{fs.writeSync(stderr,b);process.stderr.write(b);});
const timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGTERM');}catch{}setTimeout(()=>{if(!finished)try{process.kill(-child.pid,'SIGKILL');}catch{}},2000).unref();},stage.timeout);
child.on('error',e=>{spawnError={name:e.name,code:e.code??null,message:e.message};});
child.on('close',(code,signal)=>{finished=true;clearTimeout(timer);fs.closeSync(stdout);fs.closeSync(stderr);const ok=!timedOut&&!spawnError&&signal===null&&code===0;fs.writeFileSync(path.join(dir,label+'.process.json'),JSON.stringify({label,pid:child.pid??null,elapsedMs:Date.now()-started,exitCode:code,signal,timedOut,spawnError,naturalExit:!timedOut&&!spawnError&&signal===null,success:ok},null,2)+'\n');if(!ok)process.exitCode=1;});
