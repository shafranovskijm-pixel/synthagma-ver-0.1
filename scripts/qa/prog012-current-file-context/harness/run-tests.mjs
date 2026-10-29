import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const here=path.dirname(new URL(import.meta.url).pathname),root=fs.realpathSync(process.cwd()),deps=path.join(root,'node_modules');
if(globalThis.__UI_NETWORK_GUARD_INSTALLED__!==true)throw new Error('EXPLICIT_NETWORK_PRELOAD_REQUIRED');
const inputs=JSON.parse(fs.readFileSync(path.join(here,'inputs.json'),'utf8'));
for(const key of Object.keys(process.env))if(/^(?:VITE_|SUPABASE_|LOVABLE_|DATABASE_URL$|NODE_OPTIONS$)/.test(key))delete process.env[key];
process.env.NODE_ENV='test';process.env.VITEST='true';process.env.TEST='true';
const ts=(await import(pathToFileURL(path.join(deps,'typescript/lib/typescript.js')).href)).default;
const {startVitest}=await import(pathToFileURL(path.join(deps,'vitest/dist/node.js')).href);
const requireRoot=createRequire(path.join(root,'package.json'));
const installer={isPackageExists(name){try{requireRoot.resolve(name);return true;}catch{return false;}},async ensureInstalled(name){if(!this.isPackageExists(name))throw new Error('INSTALL_DURING_TEST_FORBIDDEN:'+name);return true;}};
const tsPlugin={name:'current-file-context-typescript-only',enforce:'pre',
 resolveId(id){if(/^https?:\/\//i.test(id))throw new Error('REMOTE_MODULE_FORBIDDEN');},
 load(id){if(id.replaceAll('\\','/').split('?')[0].endsWith('/src/integrations/supabase/client.ts'))
 return 'throw new Error("UNMOCKED_REAL_SUPABASE_CLIENT_FORBIDDEN"); export const supabase=undefined;';},
 transform(code,id){const file=id.split('?')[0];if(!/\.[cm]?tsx?$/.test(file)||file.replaceAll('\\','/').includes('/node_modules/'))return null;
 const result=ts.transpileModule(code,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,
 module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,isolatedModules:true,sourceMap:true,inlineSources:true}});
 const errors=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 if(errors.length)throw new Error('TRANSPILE_SYNTAX_ERROR:'+ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>root,getNewLine:()=>'\n'}));
 return{code:result.outputText,map:result.sourceMapText?JSON.parse(result.sourceMapText):null};}};
const artifactRoot=path.join(process.env.RUNNER_TEMP,'prog012-current-file-context-'+process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT,'node');
const output=path.join(artifactRoot,'vitest-results.json');let context,failure=null,closeError=null,reported=null;
try{context=await startVitest('test',[],{root,config:false,run:true,watch:false,ui:false,api:false,open:false,environment:'node',globals:true,include:inputs.exactSuites,setupFiles:[path.join(here,'network-setup.ts')],pool:'threads',maxWorkers:1,fileParallelism:false,isolate:true,execArgv:['--require',path.join(here,'block-network.cjs')],deps:{optimizer:{client:{enabled:false},ssr:{enabled:false}}},coverage:{enabled:false},typecheck:{enabled:false},testTimeout:15000,hookTimeout:15000,teardownTimeout:5000,reporters:['default','json'],outputFile:{json:output}},{configFile:false,envFile:false,esbuild:false,plugins:[tsPlugin],clearScreen:false,root,cacheDir:path.join(here,'vite-cache'),resolve:{alias:{'@':path.join(root,'src')}},optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',middlewareMode:true,hmr:false,ws:false,watch:null,fs:{strict:true,allow:[here,root,deps]}}},{packageInstaller:installer});reported=JSON.parse(fs.readFileSync(output,'utf8'));}catch(e){failure={name:e?.name??null,message:String(e?.message??e),stack:e?.stack??null};}finally{if(context)try{await context.close();}catch(e){closeError={name:e?.name??null,message:String(e?.message??e)};}}
const expected=inputs.exactSuites.map(p=>path.resolve(root,p)).sort();const actual=(reported?.testResults??[]).map(p=>path.resolve(p.name)).sort();
const cases=(reported?.testResults??[]).flatMap(p=>p.assertionResults??[]);
const exactSuites=JSON.stringify(expected)===JSON.stringify(actual)&&actual.length===2;
const allCasesPassed=cases.length>0&&cases.every(p=>p.status==='passed')&&(reported?.testResults??[]).every(p=>(p.assertionResults??[]).length>0);
const passed=!failure&&!closeError&&(process.exitCode??0)===0&&exactSuites&&allCasesPassed&&reported?.success===true&&cases.length===inputs.expectedTests&&reported.numTotalTests===cases.length&&reported.numFailedTests===0&&reported.numFailedTestSuites===0&&(reported.numPendingTests??0)===0&&(reported.numTodoTests??0)===0;
fs.writeFileSync(path.join(artifactRoot,'offline-suite-result.json'),JSON.stringify({status:passed?'PASS_EXACT_TWO_CURRENT_FILE_CONTEXT71_OFFLINE_SUITES':'FAIL_OR_INCOMPLETE_CURRENT_FILE_CONTEXT_SUITES',exactSuites,allCasesPassed,totalCases:cases.length,reportedSuccess:reported?.success??null,failure,closeError,exitAfterClose:process.exitCode??0,realAuthSQLHTTPOrSMTP:false,actualNotificationDelivered:false,productionAccepted:false,fullGoalAccepted:false},null,2)+'\n');
if(!passed)process.exitCode=1;
