import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import * as oldCrypto from './.support-events-ci-baseline/_shared/support-mcp-events/crypto.ts';
import * as nextCrypto from '../supabase/functions/_shared/support-mcp-events/crypto.ts';
import { ownedArrayBuffer } from '../supabase/functions/_shared/support-mcp-events/crypto-buffer.ts';
import { signWebhook as oldWebhook } from './.support-events-ci-baseline/_shared/support-mcp-events/webhooks.ts';
import { signWebhook as nextWebhook } from '../supabase/functions/_shared/support-mcp-events/webhooks.ts';
import { signProbe as oldProbe, signWake as oldWake } from './.support-events-ci-baseline/_shared/support-mcp-events/worker-http.ts';
import { signProbe as nextProbe, signWake as nextWake } from '../supabase/functions/_shared/support-mcp-events/worker-http.ts';

const enc = new TextEncoder();
const key = oldCrypto.base64Encode(new Uint8Array(32).fill(31));
const secret = 'whsec_' + oldCrypto.base64Encode(new Uint8Array(32).fill(17));
const previousSecret = 'whsec_' + oldCrypto.base64Encode(new Uint8Array(32).fill(19));
const aad = oldCrypto.secretAad({ owner_user_id: '11111111-1111-4111-8111-111111111111', oauth_client_id: '22222222-2222-4222-8222-222222222222', event_name: 'support.problem_report.created', callback_url: 'https://receiver.openai.com/events' });
function cryptoFacade(importOverride, fixedIv) {
  return {
    subtle: {
      digest: crypto.subtle.digest.bind(crypto.subtle),
      importKey: importOverride ?? crypto.subtle.importKey.bind(crypto.subtle),
      encrypt: crypto.subtle.encrypt.bind(crypto.subtle),
      decrypt: crypto.subtle.decrypt.bind(crypto.subtle),
      sign: crypto.subtle.sign.bind(crypto.subtle),
    },
    getRandomValues(view) { if (fixedIv) { view.set(fixedIv); return view; } return crypto.getRandomValues(view); },
  };
}

test('owned buffer copies only the visible offset slice and has no alias', () => {
  const backing = new Uint8Array([90, 91, 1, 2, 3, 92]), input = backing.subarray(2, 5);
  const result = ownedArrayBuffer(input);
  assert.ok(result instanceof ArrayBuffer); assert.equal(result.byteLength, 3);
  assert.deepEqual([...new Uint8Array(result)], [1, 2, 3]);
  input.fill(7); assert.deepEqual([...new Uint8Array(result)], [1, 2, 3]);
  new Uint8Array(result).fill(8); assert.deepEqual([...backing], [90, 91, 7, 7, 7, 92]);
});
test('empty view yields an owned zero-length ArrayBuffer', () => {
  const result = ownedArrayBuffer(new Uint8Array());
  assert.ok(result instanceof ArrayBuffer); assert.equal(result.byteLength, 0);
});
test('helper snapshots a SharedArrayBuffer view into a non-shared ArrayBuffer', () => {
  const input = new Uint8Array(new SharedArrayBuffer(5)); input.set([1, 2, 3, 4, 5]);
  const result = ownedArrayBuffer(input.subarray(1, 4)); input.fill(0);
  assert.ok(result instanceof ArrayBuffer); assert.deepEqual([...new Uint8Array(result)], [2, 3, 4]);
});
test('SHA256 known vector and sliced-byte hash remain identical', async () => {
  assert.equal(await nextCrypto.sha256Hex(enc.encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const slice = enc.encode('__hello мир__').subarray(2, -2);
  assert.equal(await nextCrypto.sha256Hex(slice), await oldCrypto.sha256Hex(slice));
  assert.equal(await nextCrypto.sha256Hex(slice), createHash('sha256').update(slice).digest('hex'));
});
test('SHA256 temporary input is zeroized after success without mutating the caller view', async () => {
  const caller = new Uint8Array([90, 31, 17, 23, 91]).subarray(1, 4), before = [...caller];
  let captured;
  const api = cryptoFacade();
  api.subtle.digest = async (...args) => { captured = args[1]; assert.ok(captured instanceof ArrayBuffer); assert.deepEqual([...new Uint8Array(captured)], before); return await crypto.subtle.digest(...args); };
  assert.equal(await nextCrypto.sha256Hex(caller, api), await oldCrypto.sha256Hex(caller));
  assert.ok(new Uint8Array(captured).every(b => b === 0)); assert.deepEqual([...caller], before);
});
test('SHA256 temporary input is zeroized after rejection without mutating the caller view', async () => {
  const caller = new Uint8Array([31, 17, 23]), before = [...caller];
  let captured;
  const api = cryptoFacade();
  api.subtle.digest = async (_algorithm, bytes) => { captured = bytes; assert.ok(captured instanceof ArrayBuffer); throw Error('synthetic digest rejection'); };
  await assert.rejects(nextCrypto.sha256Hex(caller, api), /synthetic digest rejection/);
  assert.ok(new Uint8Array(captured).every(b => b === 0)); assert.deepEqual([...caller], before);
  let imported = 0;
  const digestFailure = new Error('synthetic key-id digest rejection');
  api.subtle.importKey = async () => { imported++; throw Error('unexpected import'); };
  api.subtle.digest = async (_algorithm, bytes) => { captured = bytes; throw digestFailure; };
  await assert.rejects(nextCrypto.createSecretCrypto(key, api), error => error === digestFailure);
  assert.equal(imported, 0); assert.ok(new Uint8Array(captured).every(b => b === 0));
  await assert.rejects(nextCrypto.hashSecret(secret, api), error => error === digestFailure);
  assert.equal(imported, 0); assert.ok(new Uint8Array(captured).every(b => b === 0));
});
test('AES-GCM ciphertext, IV, kid, AAD and envelope are byte-identical with the same nonce', async () => {
  const fixed = cryptoFacade(undefined, new Uint8Array(12).fill(7));
  const before = await oldCrypto.createSecretCrypto(key, fixed), after = await nextCrypto.createSecretCrypto(key, fixed);
  assert.equal(before.kid, after.kid);
  assert.deepEqual(await after.encryptSecret(secret, aad), await before.encryptSecret(secret, aad));
});
test('old and candidate AES-GCM envelopes decrypt in both directions; tampered AAD still fails', async () => {
  const before = await oldCrypto.createSecretCrypto(key), after = await nextCrypto.createSecretCrypto(key);
  assert.equal(await after.decryptSecret(await before.encryptSecret(secret, aad), aad), secret);
  assert.equal(await before.decryptSecret(await after.encryptSecret(secret, aad), aad), secret);
  await assert.rejects(after.decryptSecret(await before.encryptSecret(secret, aad), aad + 'tampered'), e => e.code === 'decryption_failed');
});
test('AES and both HMAC key copies are zeroized after successful import', async () => {
  const captured = [];
  const api = cryptoFacade(async (...args) => {
    assert.ok(args[1] instanceof ArrayBuffer);
    captured.push({ buffer: args[1], before: Uint8Array.from(new Uint8Array(args[1])) });
    return await crypto.subtle.importKey(...args);
  });
  await nextCrypto.createSecretCrypto(key, api);
  await nextWebhook({ eventId: 'evt_vector', subscriptionId: 'sub_vector', body: enc.encode('{}'), secret, signedAt: 1700000000000 }, api);
  await nextProbe('1700000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', key, api);
  assert.equal(captured.length, 3);
  for (const item of captured) { assert.ok(item.before.some(b => b !== 0)); assert.ok(new Uint8Array(item.buffer).every(b => b === 0)); }
});
test('all three temporary imported-key copies are zeroized when import rejects', async () => {
  const captured = [];
  const api = cryptoFacade(async (_format, bytes) => { assert.ok(bytes instanceof ArrayBuffer); captured.push(bytes); throw Error('synthetic import rejection'); });
  await assert.rejects(nextCrypto.createSecretCrypto(key, api), /synthetic import rejection/);
  await assert.rejects(nextWebhook({ eventId: 'evt_vector', subscriptionId: 'sub_vector', body: enc.encode('{}'), secret, signedAt: 1700000000000 }, api), /synthetic import rejection/);
  await assert.rejects(nextWake('1700000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', key, api), /synthetic import rejection/);
  assert.equal(captured.length, 3); for (const bytes of captured) assert.ok(new Uint8Array(bytes).every(b => b === 0));
});
test('webhook signature bytes and rotation order remain identical', async () => {
  const input = { eventId: 'evt_vector', subscriptionId: 'sub_vector', body: enc.encode('{"value":"мир"}'), secret, previousSecret, signedAt: 1700000000000, previousValidUntil: new Date(1700000060000).toISOString() };
  assert.deepEqual(await nextWebhook(input), await oldWebhook(input));
});
test('wake and probe purpose-separated HMACs and constant-time decisions stay identical', async () => {
  const args = ['1700000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', key];
  assert.equal(await nextProbe(...args), await oldProbe(...args));
  assert.equal(await nextWake(...args), await oldWake(...args));
  assert.notEqual(await nextProbe(...args), await nextWake(...args));
  for (const [a, b] of [['equal', 'equal'], ['мир', 'мир'], ['equal', 'other'], ['a', 'aa']]) assert.equal(await nextCrypto.constantTimeTextEqual(a, b), await oldCrypto.constantTimeTextEqual(a, b));
});
