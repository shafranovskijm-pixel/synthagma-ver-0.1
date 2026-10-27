import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkVitestReport } from './check-vitest-report.mjs';

const checkout = fileURLToPath(new URL('../../', import.meta.url));
const manifestPath = path.join(checkout, '.ci/frontend-candidates/manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const variant = process.argv[2];
if (variant !== 'autoschool-entry') throw Error('Use autoschool-entry');
if (process.platform !== 'linux' || process.version !== 'v' + manifest.runtime.node) throw Error('This candidate requires its pinned Linux Node runtime');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const blob = bytes => crypto.createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
const validRelative = relative => typeof relative === 'string' && relative.length > 0 && !relative.includes('\\') && !relative.includes('\0') && !path.posix.isAbsolute(relative) && relative.split('/').every(part => part && part !== '.' && part !== '..');
const checkedPath = (root, relative) => {
  if (!validRelative(relative)) throw Error('Invalid relative path');
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw Error('Path escaped candidate root');
  return target;
};
const git = (args, cwd = checkout, binary = false) => {
  const result = spawnSync('git', args, { cwd, encoding: binary ? undefined : 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000, env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', GIT_TERMINAL_PROMPT: '0' } });
  if (result.error || result.status !== 0) throw Error('Local source verification failed: git ' + args[0] + ': ' + String(result.stderr || result.error));
  return result.stdout;
};
const jsonWrite = async (target, value) => fs.writeFile(target, JSON.stringify(value, null, 2) + '\n');
const reportDir = checkedPath(checkout, '.ci-artifacts/' + variant);
await fs.mkdir(reportDir, { recursive: true });
const summary = { schemaVersion: 1, variant, sourceBase: manifest.baseCommit, runtime: { node: process.version, platform: process.platform }, status: 'RUNNING', stages: [], enginesExecuted: [], noProductionSourceWrites: true, noBackendCredentials: true };
let temporaryRoot;
let sourceRoot;
let overlay = [];
let failed = false;
let preflightPassed = false;
const selected = manifest.variants[variant];

function verifyUnselected() {
  const changed = git(['diff', '--no-ext-diff', '--name-only', '--no-renames', '-z', manifest.baseCommit, '--'], sourceRoot).split('\0').filter(Boolean);
  const allowed = new Set(overlay.map(file => file.path));
  for (const relative of changed) if (!allowed.has(relative)) throw Error('Unselected tracked file changed: ' + relative);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], sourceRoot).split('\0').filter(Boolean);
  for (const relative of untracked) if (relative !== 'node_modules' && !allowed.has(relative)) throw Error('Unexpected untracked source file: ' + relative);
  return { changedTrackedPaths: changed.sort(), addedSourcePaths: untracked.filter(name => name !== 'node_modules').sort(), allUnselectedTrackedFilesPreserved: true };
}

function childEnvironment() {
  const guard = pathToFileURL(path.join(checkout, 'scripts/ci/deny-backend-network.mjs')).href;
  return { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: temporaryRoot, LANG: 'C.UTF-8', TZ: 'UTC', CI: 'true', NODE_ENV: 'test', NO_COLOR: '1', NODE_OPTIONS: '--max-old-space-size=4096 --import=' + guard };
}

async function runEngine(id, args, timeout) {
  // GNU timeout owns the command's process group, including Vitest's forked workers.
  const wrappedArgs = ['--signal=TERM', '--kill-after=10s', String(Math.ceil(timeout / 1000)) + 's', process.execPath, ...args];
  const result = spawnSync('timeout', wrappedArgs, { cwd: sourceRoot, env: childEnvironment(), encoding: 'utf8', timeout: timeout + 20000, killSignal: 'SIGKILL', maxBuffer: 32 * 1024 * 1024 });
  await fs.writeFile(path.join(reportDir, id + '.stdout.log'), result.stdout || '');
  await fs.writeFile(path.join(reportDir, id + '.stderr.log'), result.stderr || '');
  const entry = { id, executable: 'pinned node under GNU process-group timeout', args: args.map(arg => arg.startsWith(sourceRoot) ? '<source>' + arg.slice(sourceRoot.length) : arg.startsWith(checkout) ? '<ci-checkout>' + arg.slice(checkout.length) : arg), exitCode: result.status, signal: result.signal, timedOut: result.error?.code === 'ETIMEDOUT' || result.status === 124 || result.status === 137, passed: !result.error && result.status === 0 };
  summary.enginesExecuted.push(entry);
  if (!entry.passed) failed = true;
  console.log(id + ': ' + (entry.passed ? 'process passed' : 'FAILED; retained logs follow'));
  if (!entry.passed) {
    // Only public, offline synthetic tests run here; preserve bounded diagnostics in the API-readable job log too.
    console.error(id + ' stdout tail:\n' + String(result.stdout || '').slice(-12000));
    console.error(id + ' stderr tail:\n' + String(result.stderr || result.error || '').slice(-12000));
  }
  return entry;
}

try {
  const upstream = git(['rev-parse', 'refs/remotes/origin/main']).trim();
  if (upstream !== manifest.baseCommit) throw Error('origin/main drifted; rebase and re-review the candidate source pins');
  if (git(['cat-file', '-t', manifest.baseCommit]).trim() !== 'commit') throw Error('Missing exact baseline commit');
  const changedCi = git(['diff', '--no-ext-diff', '--name-only', '--no-renames', '-z', manifest.baseCommit, 'HEAD', '--']).split('\0').filter(Boolean);
  const allowedCi = new Set(manifest.ciCheckoutFiles);
  for (const relative of changedCi) if (!allowedCi.has(relative)) throw Error('CI branch changes a production/unselected file: ' + relative);
  if (git(['status', '--porcelain', '--untracked-files=no']).trim()) throw Error('CI checkout has unreviewed tracked changes');
  for (const pin of manifest.baselinePins) {
    const source = git(['show', manifest.baseCommit + ':' + pin.path], checkout, true);
    if (sha256(source) !== pin.sha256 || blob(source) !== pin.blob || source.length !== pin.bytes) throw Error('Baseline pin mismatch: ' + pin.path);
  }
  const packageBytes = await fs.readFile(path.join(checkout, 'package.json'));
  const lockBytes = await fs.readFile(path.join(checkout, 'package-lock.json'));
  if (blob(packageBytes) !== manifest.packageBlob || blob(lockBytes) !== manifest.lockBlob) throw Error('Package or lockfile changed in CI branch');
  const npmVersion = spawnSync('npm', ['--version'], { encoding: 'utf8', timeout: 15000 });
  if (npmVersion.status !== 0 || npmVersion.stdout.trim() !== manifest.runtime.npm) throw Error('Wrong pinned npm version');
  for (const dependency of manifest.installedDependencyPins) {
    const installed = JSON.parse(await fs.readFile(checkedPath(checkout, dependency.path + '/package.json'), 'utf8'));
    if (installed.version !== dependency.version) throw Error('Installed dependency drift: ' + dependency.path);
  }
  if (selected.packet) {
    const packetBytes = await fs.readFile(checkedPath(checkout, selected.packet.path));
    if (sha256(packetBytes) !== selected.packet.sha256) throw Error('Candidate payload SHA mismatch');
    const payload = JSON.parse(packetBytes);
    if (payload.baseCommit !== manifest.baseCommit || payload.id !== variant || !Array.isArray(payload.files)) throw Error('Wrong candidate payload identity');
    overlay = payload.files;
    if (overlay.length !== selected.sourceFiles || new Set(overlay.map(file => file.path)).size !== overlay.length) throw Error('Candidate source count mismatch');
    if (overlay.some(file => !selected.allowedPaths.includes(file.path)) || selected.allowedPaths.length !== overlay.length) throw Error('Candidate allowlist mismatch');
    for (const file of overlay) {
      if (!validRelative(file.path) || typeof file.content !== 'string' || sha256(Buffer.from(file.content, 'utf8')) !== file.afterSha256) throw Error('Invalid exact candidate source');
    }
  }
  temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sintagma-ci-'));
  sourceRoot = path.join(temporaryRoot, 'source');
  git(['worktree', 'add', '--detach', sourceRoot, manifest.baseCommit]);
  if (git(['rev-parse', 'HEAD'], sourceRoot).trim() !== manifest.baseCommit) throw Error('Temporary checkout has wrong source base');
  for (const file of overlay) {
    const target = checkedPath(sourceRoot, file.path);
    let before;
    try { before = await fs.readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (file.beforeSha256 === null ? before !== undefined : !before || sha256(before) !== file.beforeSha256) throw Error('Candidate before image mismatch: ' + file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, 'utf8');
    if (sha256(await fs.readFile(target)) !== file.afterSha256) throw Error('Candidate after image mismatch: ' + file.path);
  }
  await fs.symlink(path.join(checkout, 'node_modules'), path.join(sourceRoot, 'node_modules'), 'dir');
  summary.preflight = { upstream, baselinePinsVerified: manifest.baselinePins.length, overlaySourceFiles: overlay.map(file => ({ path: file.path, beforeSha256: file.beforeSha256, afterSha256: file.afterSha256 })), ...verifyUnselected() };
  preflightPassed = true;
  await jsonWrite(path.join(reportDir, 'source-pins.json'), summary.preflight);
  await runEngine('stock-tsconfig-app', [path.join(sourceRoot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.app.json', '--noEmit', '--pretty', 'false'], 300000);
  // Do not skip the actual hook/component cases when baseline TypeScript finds a pre-existing error.
  for (const suite of selected.suites) {
    const reportFile = path.join(reportDir, suite.id + '.json');
    const execution = await runEngine(suite.id, [path.join(sourceRoot, 'node_modules/vitest/vitest.mjs'), 'run', '--config', suite.config, '--pool=forks', '--reporter=json', '--outputFile=' + reportFile], 300000);
    try {
      const actualReport = JSON.parse(await fs.readFile(reportFile, 'utf8'));
      if (!execution.passed) {
        const diagnostics = { success: actualReport.success, total: actualReport.numTotalTests, passed: actualReport.numPassedTests, failed: actualReport.numFailedTests, pending: actualReport.numPendingTests, files: actualReport.testResults?.filter(file => file.status !== 'passed').map(file => ({ name: file.name, status: file.status, message: file.message, failedAssertions: file.assertionResults?.filter(assertion => assertion.status !== 'passed').map(assertion => ({ name: assertion.fullName, status: assertion.status, failures: assertion.failureMessages })) })), unhandledErrors: actualReport.unhandledErrors };
        console.error(suite.id + ' actual JSON failure diagnostics: ' + JSON.stringify(diagnostics).slice(0, 20000));
        throw Error('Vitest process failed or timed out');
      }
      const checked = checkVitestReport(actualReport, suite, sourceRoot);
      summary.stages.push({ ...checked, passed: true });
      console.log(suite.id + ': confirmed ' + checked.executed + '/' + suite.cases + ' assertions passed');
    } catch (error) {
      failed = true;
      summary.stages.push({ id: suite.id, passed: false, error: String(error.message) });
      console.error(suite.id + ': ' + String(error.message));
    }
  }
  summary.postflight = verifyUnselected();
  for (const file of overlay) if (sha256(await fs.readFile(checkedPath(sourceRoot, file.path))) !== file.afterSha256) throw Error('Test mutated pinned candidate source: ' + file.path);
} catch (error) {
  failed = true;
  summary.error = String(error.message);
  console.error(summary.error);
} finally {
  if (sourceRoot && preflightPassed) {
    try { summary.finalSourceCheck = verifyUnselected(); } catch (error) { failed = true; summary.finalSourceCheck = { passed: false, error: String(error.message) }; }
  }
  if (sourceRoot) {
    try { git(['worktree', 'remove', '--force', sourceRoot]); } catch (error) { summary.cleanupError = String(error.message); console.error('Temporary checkout cleanup failed: ' + error.message); failed = true; }
  }
  if (temporaryRoot && temporaryRoot.startsWith(path.join(os.tmpdir(), 'sintagma-ci-'))) {
    try { await fs.rm(temporaryRoot, { recursive: true, force: true }); } catch (error) { summary.cleanupError = String(error.message); failed = true; }
  }
  summary.status = failed ? 'FAIL' : 'PASS';
  summary.meaning = 'Only the pinned temporary frontend source was tested. No deployment, backend migration, live tenant acceptance or release approval is implied.';
  await jsonWrite(path.join(reportDir, 'summary.json'), summary);
}
if (failed) process.exitCode = 1;
