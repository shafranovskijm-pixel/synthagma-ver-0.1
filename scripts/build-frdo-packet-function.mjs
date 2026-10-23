import { readFile, writeFile, realpath, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
console.log(JSON.stringify({ stage: 'frdo_bundle_builder_entry' }));
const { build, version: esbuildVersion } = await import('esbuild');
console.log(JSON.stringify({ stage: 'frdo_exact_esbuild_loaded', version: esbuildVersion }));

// Build the actual handler from the same canonical J implementation. No network,
// install, environment secret, alternate mapper, DOM global or provider action.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const own = resolve(root, 'supabase/functions/frdo-packet-artifact');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--xmldom-dir' || !isAbsolute(args[1])) throw Error('Usage: node scripts/build-frdo-packet-function.mjs --xmldom-dir ABSOLUTE_ISOLATED_XMLDOM_0_9_12_DIRECTORY');
const xml = await realpath(args[1]);
const deps = await realpath(resolve(root, 'node_modules'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const metadata = JSON.parse(await readFile(resolve(xml, 'package.json'), 'utf8'));
const xmlLock = JSON.parse(await readFile(resolve(own, 'xml-package-integrity.json'), 'utf8'));
if (metadata.name !== xmlLock.name || metadata.version !== xmlLock.version || esbuildVersion !== '0.25.12') throw Error('FRDO_EXACT_RUNTIME_VERSION_REQUIRED');
for (const file of xmlLock.files) {
  const target = resolve(xml, file.path); if (relative(xml, target).startsWith('..') || isAbsolute(relative(xml, target))) throw Error('FRDO_XML_PATH_OUTSIDE_PACKAGE');
  const bytes = await readFile(target); if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw Error('FRDO_XML_PACKAGE_CHANGED');
}
for (const [name, version] of [['zod', '3.25.76'], ['jszip', '3.10.1']]) {
  if (JSON.parse(await readFile(resolve(root, 'node_modules', name, 'package.json'), 'utf8')).version !== version) throw Error('FRDO_EXACT_DEPENDENCY_VERSION_REQUIRED');
}
console.log(JSON.stringify({ stage: 'frdo_source_and_xml_pins_validated' }));
const result = await build({ absWorkingDir: root, entryPoints: ['supabase/functions/frdo-packet-artifact/nativeEntry.ts'], outfile: 'supabase/functions/frdo-packet-artifact/runtime.bundle.js', bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', minify: true, sourcemap: false, metafile: true, legalComments: 'eof', charset: 'utf8', alias: { '@': resolve(root, 'src'), 'npm:@xmldom/xmldom@0.9.12': resolve(xml, 'lib/index.js') }, logLevel: 'silent' });
console.log(JSON.stringify({ stage: 'frdo_esbuild_returned', outputFiles: result.outputFiles.length }));
if (result.outputFiles.length !== 1 || Object.values(result.metafile.outputs).some(output => output.imports.length)) throw Error('FRDO_BUNDLE_NOT_SELF_CONTAINED');
const bundle = result.outputFiles[0].contents;
if (bundle.length < 1000 || bundle.length > 4500000) throw Error('FRDO_BUNDLE_SIZE_OUTSIDE_REVIEWED_BOUND');
const source = [];
for (const input of Object.keys(result.metafile.inputs).sort()) {
  if (input.startsWith('(disabled):')) { source.push({ id: input.replaceAll('\\', '/'), virtual: true }); continue; }
  const target = resolve(root, input), raw = await readFile(target), inRoot = relative(root, target), inXml = relative(xml, target), inDeps = relative(deps, target);
  let id;
  if (!inXml.startsWith('..') && !isAbsolute(inXml)) id = 'npm:@xmldom/xmldom@0.9.12/' + inXml.split(sep).join('/');
  else if (!inDeps.startsWith('..') && !isAbsolute(inDeps)) id = 'node_modules/' + inDeps.split(sep).join('/');
  else if (!inRoot.startsWith('..') && !isAbsolute(inRoot)) id = inRoot.split(sep).join('/');
  else throw Error('FRDO_UNREVIEWED_INPUT_OUTSIDE_SOURCE_CLOSURE');
  source.push({ id, bytes: raw.length, sha256: hash(raw) });
}
const index = '// Generated runtime bundle uses the canonical UC020 source; see bundle-source-manifest.json.\nimport "./runtime.bundle.js";\n';
const manifest = { schema_version: 1, kind: 'frdo_same_source_hosted_bundle', esbuild: esbuildVersion, entry: 'nativeEntry.ts', output: { path: 'runtime.bundle.js', bytes: bundle.length, sha256: hash(bundle) }, index: { path: 'index.ts', bytes: Buffer.byteLength(index), sha256: hash(index) }, xml_integrity: xmlLock.integrity, sources: source, contains_external_imports: false, external_network_at_build: false, signature_verified: false, legal_policy_verified: false, provider_acceptance: false };
await mkdir(own, { recursive: true });
await writeFile(resolve(own, 'runtime.bundle.js'), bundle);
await writeFile(resolve(own, 'index.ts'), index);
await writeFile(resolve(own, 'bundle-source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output: manifest.output, inputs: source.length, network: false, provider_acceptance: false }));
