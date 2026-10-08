import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const release = process.argv.includes('--release');
const artifactRoot = resolve(root, 'artifacts/android');
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Capacitor 8 requires Node.js 22+.');
const sdk = process.env.ANDROID_HOME;
const java = process.env.JAVA_HOME;
if (!sdk || !existsSync(resolve(sdk, 'platforms/android-36/android.jar'))) throw new Error('Set ANDROID_HOME to an SDK containing Android 36.');
if (!java || !existsSync(resolve(java, 'bin/java.exe'))) throw new Error('Set JAVA_HOME to JDK 21.');
mkdirSync(artifactRoot, { recursive: true });
const env = { ...process.env, CAPACITOR_BUILD: 'true' };
function run(command, args, cwd = root, shell = false) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}

run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android']);
// Capacitor resolves junctions on Windows; keep generated Gradle paths portable
// even when this checkout reuses an existing, identical node_modules directory.
const settingsPath = resolve(root, 'android/capacitor.settings.gradle');
writeFileSync(settingsPath, readFileSync(settingsPath, 'utf8').replace(
  /project\(':capacitor-android'\)\.projectDir = new File\('[^']+'\)/,
  "project(':capacitor-android').projectDir = new File('../node_modules/@capacitor/android/capacitor')",
));
writeFileSync(resolve(root, 'android/local.properties'), `sdk.dir=${sdk.replaceAll('\\', '/')}\n`);
run(resolve(root, 'android/gradlew.bat'), [release ? ':app:assembleRelease' : ':app:assembleDebug', '--no-daemon', '--max-workers=2'], resolve(root, 'android'), true);
const variant = release ? 'release' : 'debug';
const source = resolve(root, `android/app/build/outputs/apk/${variant}/app-${variant}${release ? '-unsigned' : ''}.apk`);
const output = resolve(artifactRoot, `SINTAGMA-1.0-${release ? 'release-unsigned' : 'test'}.apk`);
copyFileSync(source, output);
writeFileSync(`${output}.sha256`, `${createHash('sha256').update(readFileSync(output)).digest('hex')}  ${output.split(/[\\/]/).at(-1)}\n`);
console.log(`APK: ${output}`);
if (release) console.log('UNSIGNED: use the persistent publisher signing key before RuStore upload.');
