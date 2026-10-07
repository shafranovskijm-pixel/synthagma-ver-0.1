import { Capacitor, registerPlugin } from '@capacitor/core';
import { toast } from 'sonner';

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const NativeFiles = registerPlugin<{
  save(options: { data: string; fileName: string; mimeType: string }): Promise<{ saved: boolean }>;
}>('NativeFiles');

export function safeDownloadName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 180) || 'document';
}

export async function downloadAsBase64(blob: Blob): Promise<string> {
  if (blob.size > MAX_DOWNLOAD_BYTES) throw new Error('В приложении можно сохранить файл размером до 20 МБ.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

let installed = false;
async function saveUrl(href: string, fileName: string): Promise<void> {
  try {
    const url = new URL(href);
    if (!['blob:', 'data:', 'https:'].includes(url.protocol)) throw new Error('Неподдерживаемая ссылка на файл.');
    const response = await fetch(url.href);
    if (!response.ok) throw new Error('Файл недоступен. Повторите загрузку.');
    const blob = await response.blob();
    const result = await NativeFiles.save({
      data: await downloadAsBase64(blob),
      fileName: safeDownloadName(fileName),
      mimeType: blob.type || 'application/octet-stream',
    });
    if (result.saved) toast.success('Файл сохранён');
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Не удалось сохранить файл');
  }
}

export function installNativeDownloads(): void {
  if (installed || !Capacitor.isNativePlatform()) return;
  installed = true;
  // Several existing exporters click an unattached anchor and immediately
  // revoke its Blob URL. Start fetch in that same call, before revocation.
  // Only native download anchors are handled; all ordinary clicks are delegated.
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download') && this.href) {
      void saveUrl(this.href, this.download);
      return;
    }
    originalAnchorClick.call(this);
  };
  window.addEventListener('sintagma:native-download', (event) => {
    const detail = (event as CustomEvent<{ url?: string; fileName?: string }>).detail;
    if (detail && typeof detail.url === 'string') void saveUrl(detail.url, detail.fileName || 'document');
  });
  // PDF/XLSX/DOCX generators use <a download> with blob/data URLs. Android
  // WebView cannot download those URLs itself; use the system document picker.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('a[download]') : null;
    if (!(target instanceof HTMLAnchorElement) || !target.href) return;
    event.preventDefault();
    void saveUrl(target.href, target.download);
  }, true);
}
