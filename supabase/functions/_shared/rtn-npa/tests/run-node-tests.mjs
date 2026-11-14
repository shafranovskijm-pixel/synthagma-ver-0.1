import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Portable Node22 runner: only explicit offline fixtures, never live services.
const directory = new URL('./', import.meta.url);
const files = readdirSync(directory).filter(name => name.endsWith('.test.mjs')).sort().map(name => fileURLToPath(new URL(name, directory)));
const result = spawnSync(process.execPath, ['--experimental-transform-types', '--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
