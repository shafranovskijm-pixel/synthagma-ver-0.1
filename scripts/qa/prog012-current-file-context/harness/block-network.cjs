/* Isolated UI harness only. No app/source imports. Installed by explicit --require. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { syncBuiltinESMExports } = require('node:module');
const deny = () => { throw new Error('UI_HARNESS_NETWORK_DISABLED'); };
for (const [name, methods] of [
  ['node:http', ['request', 'get']], ['node:https', ['request', 'get']],
  ['node:net', ['connect', 'createConnection']], ['node:tls', ['connect']],
  ['node:dgram', ['createSocket']],
  ['node:dns', ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse']],
  ['node:dns/promises', ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse']],
]) {
  const mod = require(name);
  for (const key of methods) if (typeof mod[key] === 'function') mod[key] = deny;
}
require('node:net').Socket.prototype.connect = deny;
require('node:net').Server.prototype.listen = deny;
globalThis.fetch = deny;
globalThis.WebSocket = class { constructor() { deny(); } };
function checkFile(value) {
  if (typeof value === 'number' || value == null) return;
  const name = value instanceof URL ? fileURLToPath(value) : String(value);
  if (/^\.env(?:\.|$)/.test(path.basename(name))) throw new Error('UI_HARNESS_ENV_FILE_READ_DISABLED');
}
for (const key of ['readFileSync', 'openSync', 'readFile', 'open', 'createReadStream']) {
  const original = fs[key];
  fs[key] = function (file, ...args) { checkFile(file); return original.call(this, file, ...args); };
}
for (const key of ['readFile', 'open']) {
  const original = fs.promises[key];
  fs.promises[key] = function (file, ...args) { checkFile(file); return original.call(this, file, ...args); };
}
syncBuiltinESMExports();
globalThis.__UI_NETWORK_GUARD_INSTALLED__ = true;
