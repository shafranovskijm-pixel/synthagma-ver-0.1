import { rmSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

// Web downloads must not be bundled inside a future Capacitor APK.
// Remove Vite's copied public downloads before Capacitor's subsequent sync.
export function excludeAndroidDownloads(capacitorBuild) {
  let downloadsDir;
  return {
    name: 'exclude-android-downloads',
    apply: 'build',
    configResolved(config) {
      const root = resolve(config.root);
      downloadsDir = resolve(root, config.build.outDir, 'downloads');
      const fromRoot = relative(root, downloadsDir);
      if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
        throw new Error('Android download exclusion must stay inside the project.');
      }
    },
    writeBundle() {
      if (capacitorBuild) rmSync(downloadsDir, { recursive: true, force: true });
    },
  };
}
