import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=fs.realpathSync(process.cwd()), here=path.dirname(new URL(import.meta.url).pathname);
const mode=process.argv[2];if(!['before','after'].includes(mode))throw new Error('FINITE_SNAPSHOT_MODE_REQUIRED');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function walk(relative){const results=[];for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const file=relative+'/'+entry.name;if(entry.isSymbolicLink())throw new Error('SRC_SYMLINK_FORBIDDEN');if(entry.isDirectory())results.push(...walk(file));else if(entry.isFile())results.push(file);else throw new Error('SRC_NONREGULAR_FORBIDDEN');}return results;}
const inputs=JSON.parse(fs.readFileSync(path.join(here,'inputs.json'),'utf8'));
const protectedPaths=[...new Set([...walk('src'),...inputs.files.map(p=>p.path),inputs.inputsPath,inputs.wrapperPath,inputs.workflowPath,...['package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','.node-version','.nvmrc','netlify.toml']])].sort();
const records=protectedPaths.map(p=>{const b=fs.readFileSync(path.join(root,p));return{path:p,bytes:b.length,sha256:sha(b)};});
const artifactRoot=path.join(process.env.RUNNER_TEMP,'prog012-current-file-context-'+process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT,'node');
fs.mkdirSync(artifactRoot,{recursive:true});
const file=path.join(artifactRoot,'protected-source-before.json');
if(mode==='before')fs.writeFileSync(file,JSON.stringify(records,null,2)+'\n');
else{const before=JSON.parse(fs.readFileSync(file,'utf8'));const exact=JSON.stringify(before)===JSON.stringify(records);fs.writeFileSync(path.join(artifactRoot,'protected-source-after.json'),JSON.stringify({exact,files:records.length,records,envContentsRead:false},null,2)+'\n');if(!exact)throw new Error('BUILD_OR_INSTALL_CHANGED_PROTECTED_SOURCE');}
