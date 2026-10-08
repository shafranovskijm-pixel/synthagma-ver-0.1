import { describe, expect, it } from 'vitest';
import { downloadAsBase64, safeDownloadName } from './nativeDownloads';

describe('Android document export', () => {
  it('removes path/control characters while preserving Russian names', () => {
    expect(safeDownloadName('../Акт:№1.pdf')).toBe('.._Акт_№1.pdf');
    expect(safeDownloadName('')).toBe('document');
  });
  it('preserves document bytes for the system save picker', async () => {
    expect(await downloadAsBase64(new Blob(['%PDF-test'], { type: 'application/pdf' }))).toBe('JVBERi10ZXN0');
  });
  it('rejects an oversized file before crossing the native bridge', async () => {
    await expect(downloadAsBase64(new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]))).rejects.toThrow('20 МБ');
  });
});
