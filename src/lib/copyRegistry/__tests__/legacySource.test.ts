import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  assertCopyImportSourceCurrent, captureBrowserCopySource, captureCopyFileSource,
  COPY_IMPORT_MAX_BYTES, downloadCopySourceBackup,
} from '../legacySource';

const key = 'copies_duplicates_org-a';
let current = true;
beforeEach(() => { localStorage.clear(); current = true; vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('exact preserved copies import source', () => {
  it('keeps malformed JSON and unknown fields byte-for-byte instead of silently repairing or deleting them', async () => {
    for (const raw of ['{broken original', '[{"id":"old","unknown":{"ФИО":"Исходник"}}]\n']) {
      localStorage.setItem(key, raw);
      const write = vi.spyOn(Storage.prototype, 'setItem');
      const remove = vi.spyOn(Storage.prototype, 'removeItem');
      const source = await captureBrowserCopySource('org-a', true, () => current);
      expect(source?.raw).toBe(raw);
      expect(source?.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(localStorage.getItem(key)).toBe(raw);
      expect(write).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
      write.mockRestore(); remove.mockRestore();
    }
  });

  it('does not inspect an organization-wide legacy key for a group-limited or stale actor', async () => {
    const read = vi.spyOn(Storage.prototype, 'getItem');
    await expect(captureBrowserCopySource('org-a', false, () => true)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    await expect(captureBrowserCopySource('org-a', true, () => false)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects a source changed during asynchronous hashing and leaves the newer source untouched', async () => {
    localStorage.setItem(key, 'old source');
    vi.stubGlobal('crypto', { subtle: { digest: async () => {
      localStorage.setItem(key, 'new source'); return new Uint8Array(32).buffer;
    } } });
    await expect(captureBrowserCopySource('org-a', true, () => current)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    expect(localStorage.getItem(key)).toBe('new source');
  });

  it('discards a source when actor or permission lifetime ends during hashing', async () => {
    localStorage.setItem(key, 'source');
    vi.stubGlobal('crypto', { subtle: { digest: async () => { current = false; return new Uint8Array(32).buffer; } } });
    await expect(captureBrowserCopySource('org-a', true, () => current)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(localStorage.getItem(key)).toBe('source');
  });

  it('requires the same raw source and organization immediately before import apply', async () => {
    localStorage.setItem(key, 'source');
    const source = (await captureBrowserCopySource('org-a', true, () => current))!;
    expect(() => assertCopyImportSourceCurrent(source, 'org-b', () => current)).toThrow();
    localStorage.setItem(key, 'changed');
    expect(() => assertCopyImportSourceCurrent(source, 'org-a', () => current)).toThrow();
    expect(localStorage.getItem(key)).toBe('changed');
  });

  it('preserves a UTF-8 BOM and rejects invalid UTF-8 instead of replacing bytes', async () => {
    const bytes = new TextEncoder().encode('\uFEFF[{"legacy":"данные"}]');
    const file = { name: 'source.json', size: bytes.length, arrayBuffer: async () => bytes.buffer } as File;
    const source = await captureCopyFileSource(file, () => current);
    expect(source.raw).toBe('\uFEFF[{"legacy":"данные"}]');
    const invalid = { name: 'bad.json', size: 2, arrayBuffer: async () => new Uint8Array([0xc3, 0x28]).buffer } as File;
    await expect(captureCopyFileSource(invalid, () => current)).rejects.toMatchObject({ code: 'INVALID_UTF8' });
  });

  it('rejects a literal unpaired browser surrogate without replacing it, while preserving emoji and a literal replacement character', async () => {
    const raw = 'literal\ud800source'; localStorage.setItem(key, raw);
    await expect(captureBrowserCopySource('org-a', true, () => current)).rejects.toMatchObject({ code: 'INVALID_UTF8' });
    expect(localStorage.getItem(key)).toBe(raw);
    for (const valid of ['😀\uFFFD', String.raw`{"escaped":"\ud800"}`]) {
      localStorage.setItem(key, valid);
      expect((await captureBrowserCopySource('org-a', true, () => current))?.raw).toBe(valid);
      expect(localStorage.getItem(key)).toBe(valid);
    }
  });

  it('refuses an oversized file before reading it and a storage security failure without a write', async () => {
    const readFile = vi.fn();
    await expect(captureCopyFileSource({ name: 'large.json', size: COPY_IMPORT_MAX_BYTES + 1, arrayBuffer: readFile } as unknown as File, () => current)).rejects.toMatchObject({ code: 'TOO_LARGE' });
    expect(readFile).not.toHaveBeenCalled();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await expect(captureBrowserCopySource('org-a', true, () => current)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
    expect(write).not.toHaveBeenCalled();
  });

  it('downloads the captured source without mutating storage and refuses a stale download', async () => {
    localStorage.setItem(key, '{unchanged');
    const source = (await captureBrowserCopySource('org-a', true, () => current))!;
    const create = vi.fn(() => 'blob:source'), revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const write = vi.spyOn(Storage.prototype, 'setItem'), remove = vi.spyOn(Storage.prototype, 'removeItem');
    downloadCopySourceBackup(source, () => current);
    expect(create).toHaveBeenCalledWith(expect.any(Blob)); expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download]')).toBeNull();
    expect(write).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
    current = false;
    expect(() => downloadCopySourceBackup(source, () => current)).toThrow();
    expect(click).toHaveBeenCalledOnce(); expect(localStorage.getItem(key)).toBe(source.raw);
  });
});
