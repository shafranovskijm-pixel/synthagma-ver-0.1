import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';

const root = process.cwd();
const out = resolve(root, 'netlify-bun-repro-evidence');
await mkdir(out, { recursive: true });
const digest = b => createHash('sha256').update(b).digest('hex');
const paths = ['package.json', 'package-lock.json', 'bun.lock', 'bun.lockb'];
async function hashes() {
  return Object.fromEntries(await Promise.all(paths.map(async path => {
    try { return [path, digest(await readFile(resolve(root, path)))]; }
    catch (e) { if (e.code === 'ENOENT') return [path, null]; throw e; }
  })));
}
const redact = s => s.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
  .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[REDACTED]@')
  .replace(/([?&](?:token|key|signature|password|secret)=)[^\s&]+/gi, '$1[REDACTED]');
async function command(label, program, args, options = {}) {
  const result = await new Promise((done, reject) => {
    const child = spawn(program, args, { cwd: root, env: process.env, ...options });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', (code, signal) => done({ code, signal, output: redact(output) }));
  });
  await writeFile(resolve(out, `${label}.log`), result.output);
  console.log(JSON.stringify({ label, program, args, code: result.code, signal: result.signal }));
  return { code: result.code, signal: result.signal, log: `${label}.log`, tail: result.output.slice(-2000) };
}
async function resolveEsbuild(requireFrom) {
  try { return { path: relative(root, requireFrom.resolve('esbuild')), version: requireFrom('esbuild').version }; }
  catch (error) { return { error: error.code ?? error.name }; }
}
const before = await hashes();
const report = {
  scope: 'Controlled Bun install/build reproduction; exact Netlify installer/version/command unknown. No claim of Netlify equivalence.',
  expectedSource: 'e964dbd65c7fa9379e6b0a71317a3ed5d437ed73',
  node: { version: process.version, arch: process.arch, platform: process.platform },
  before, commands: {},
};
let failed = false;
try {
  for (const [label, cmd, args] of [['bun-version', 'bun', ['--version']], ['bun-revision', 'bun', ['--revision']], ['npm-version', 'npm', ['--version']]]) {
    report.commands[label] = await command(label, cmd, args);
  }
  report.commands.install = await command('bun-install', 'bun', ['install', '--frozen-lockfile']);
  if (report.commands.install.code !== 0) { failed = true; }
  else {
    const rootRequire = createRequire(resolve(root, 'package.json'));
    const sdkEntry = rootRequire.resolve('@lovable.dev/mcp-js');
    const sdkRequire = createRequire(sdkEntry);
    let sdkDir = dirname(sdkEntry);
    let sdk;
    for (let i = 0; i < 5; i++, sdkDir = dirname(sdkDir)) {
      try { const p = JSON.parse(await readFile(resolve(sdkDir, 'package.json'), 'utf8')); if (p.name === '@lovable.dev/mcp-js') { sdk = p; break; } }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    report.resolution = { sdkEntry: relative(root, sdkEntry), sdkVersion: sdk?.version, sdkEsbuildDependency: sdk?.dependencies?.esbuild,
      rootEsbuild: await resolveEsbuild(rootRequire), sdkEsbuild: await resolveEsbuild(sdkRequire) };
    console.log(JSON.stringify({ resolution: report.resolution }));
    const generated = ['supabase/functions/mcp/index.ts', 'supabase/functions/_shared/support-mcp-events/runtime.bundle.mjs'];
    for (const [label, program, args] of [
      ['npm-build', 'npm', ['run', 'build']], ['bun-build', 'bun', ['run', 'build']],
      ['npm-build-dev', 'npm', ['run', 'build:dev']], ['bun-build-dev', 'bun', ['run', 'build:dev']],
    ]) {
      if (label.endsWith('-dev') && (report.commands['npm-build']?.code !== 0 || report.commands['bun-build']?.code !== 0)) continue;
      // Each command starts from the same tracked generated source. No source/lock/dependency fix is applied.
      const reset = await command(`${label}-reset-generated`, 'git', ['restore', '--source=HEAD', '--', ...generated]);
      if (reset.code !== 0) throw new Error('Generated-source reset failed');
      report.commands[label] = await command(label, program, args);
      if (report.commands[label].code !== 0) failed = true;
      report.commands[label].generated = Object.fromEntries(await Promise.all(generated.map(async p => [p, digest(await readFile(resolve(root, p)))])));
    }
  }
} catch (error) { report.harnessError = { name: error.name, message: redact(error.message) }; failed = true; }
report.after = await hashes();
report.packageAndLocksUnchanged = JSON.stringify(before) === JSON.stringify(report.after);
if (!report.packageAndLocksUnchanged) failed = true;
report.status = failed ? 'FAIL' : 'PASS';
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, packageAndLocksUnchanged: report.packageAndLocksUnchanged }));
process.exitCode = failed ? 1 : 0;
