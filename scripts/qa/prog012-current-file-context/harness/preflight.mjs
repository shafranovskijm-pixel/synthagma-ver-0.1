import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import{execFileSync}from'node:child_process';
const here=path.dirname(new URL(import.meta.url).pathname),root=fs.realpathSync(process.cwd());
const raw=fs.readFileSync(path.join(here,'inputs.json')),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(process.argv[2]!==sha(raw))throw new Error('EXACT_REVIEWED_CI_INPUTS_REQUIRED');
const inputs=JSON.parse(raw),git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
if(globalThis.__UI_NETWORK_GUARD_INSTALLED__!==true||process.platform!=='linux'||process.arch!=='x64'||process.versions.node!==inputs.nodeVersion)throw new Error('NETWORK_GUARDED_NODE22_X64_REQUIRED');
if(git('rev-parse','HEAD^')!==inputs.baseCommit||process.env.GITHUB_REF!=='refs/heads/'+inputs.branch)throw new Error('CURRENT_MAIN196_PARENT_FIXED_BRANCH_REQUIRED');
const changed=git('diff','--name-only','--no-renames',inputs.baseCommit,'HEAD').split('\n').filter(Boolean).sort();
const expected=[...inputs.files.map(p=>p.path),inputs.inputsPath,inputs.wrapperPath,inputs.workflowPath].sort();
if(JSON.stringify(changed)!==JSON.stringify(expected))throw new Error('EXACT_FINITE_CI_PATH_SET_REQUIRED');
for(const p of inputs.files){const b=fs.readFileSync(path.join(root,p.path));if(b.length!==p.bytes||sha(b)!==p.sha256)throw new Error('SOURCE_DRIFT:'+p.path);}
for(const p of inputs.unchangedBase){if(git('hash-object',p.path)!==p.gitBlobSHA1)throw new Error('CURRENT_MAIN196_BASE_DRIFT:'+p.path);}
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
for(const p of Object.values(lock.packages))if(p.resolved&&!p.resolved.startsWith('https://registry.npmjs.org/'))throw new Error('PUBLIC_NPM_REGISTRY_ONLY');
const npm=execFileSync('npm',['--version'],{encoding:'utf8'}).trim();if(npm!==inputs.npmVersion)throw new Error('EXACT_NPM10_REQUIRED');
for(const key of Object.keys(process.env))if(/^(?:VITE_|SUPABASE_|LOVABLE_|DATABASE_URL$|NODE_OPTIONS$)/.test(key))delete process.env[key];
const artifactRoot=path.join(process.env.RUNNER_TEMP,'prog012-current-file-context-'+process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT,'node');
fs.mkdirSync(artifactRoot,{recursive:true});fs.writeFileSync(path.join(artifactRoot,'preflight.json'),JSON.stringify({status:'PASS_CLEAN_MAIN196_FINITE_SOURCE_PREFLIGHT',node:process.versions.node,npm,platform:process.platform,arch:process.arch,head:git('rev-parse','HEAD'),parent:inputs.baseCommit,sourceFiles:inputs.files.length,tests:inputs.expectedTests,envFileRead:false,Cloud:false},null,2)+'\n');
