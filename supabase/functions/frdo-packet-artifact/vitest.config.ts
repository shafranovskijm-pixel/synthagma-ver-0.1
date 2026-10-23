import {defineConfig} from 'vitest/config';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

// Tests use the exact separately verified official package archive. Never silently
// resolve the application's older xmldom, run npm install or change shared deps.
const directory=process.env.UC020_XMLDOM_0_9_12_DIR;
if(!directory||!isAbsolute(directory))throw Error('UC020_XMLDOM_0_9_12_DIR must be the absolute isolated package directory');
const metadata=JSON.parse(readFileSync(resolve(directory,'package.json'),'utf8'));
if(metadata.name!=='@xmldom/xmldom'||metadata.version!=='0.9.12')throw Error('UC020 requires the exact @xmldom/xmldom0.9.12 source package');
const entry=resolve(directory,'lib/index.js');if(!existsSync(entry))throw Error('UC020 pinned XML entry unavailable');
const root=fileURLToPath(new URL('../../../',import.meta.url));
export default defineConfig({
 root,
 resolve:{alias:[{find:/^npm:@xmldom\/xmldom@0\.9\.12$/,replacement:entry},{find:'@',replacement:resolve(root,'src')}]},
 test:{environment:'jsdom',globals:false,include:['src/lib/frdoFoundation/__tests__/template.test.ts','supabase/functions/frdo-packet-artifact/__tests__/frdo-server.cases.ts']},
});
