import { describe, expect, it } from 'vitest';
import { escapeDocumentHtml, preparePrintHtml } from '../printHtmlSafety';
const png = 'data:image/png;base64,aGVsbG8=';
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
describe('inert print HTML keeps layout and truthful resources', () => {
  it('preserves page/table/body CSS, a local QR and HTTPS signature while removing executable/navigation content', () => {
    const html = '<html><head><style>@page{size:A4 landscape}.signature{position:absolute;left:20px}</style></head><body class="original" style="font-size:14px"><table style="width:100%"><tr><td>Договор</td><td><img src="https://files.example.org/stamp.png?token=a&amp;b=c" style="width:120px" onerror="steal()"></td></tr></table><img src="' + png + '"><script>window.parent.steal()</script><iframe src="https://evil.example"></iframe><form action="https://evil.example"><input name="secret"></form><a href="javascript:steal()">Ссылка</a></body></html>';
    const doc = parse(preparePrintHtml(html, '</title><script>injected()</script>', 'marker'));
    expect(doc.querySelector('script,iframe,form,input,a[href],base')).toBeNull(); expect(doc.body.className).toBe('original'); expect(doc.body.style.fontSize).toBe('14px'); expect(doc.querySelector('style')?.textContent).toContain('@page'); expect(doc.body.innerHTML).toContain('position:absolute');
    expect(doc.images).toHaveLength(2); expect(doc.images[0].getAttribute('src')).toBe('https://files.example.org/stamp.png?token=a&b=c'); expect(doc.images[0].getAttribute('onerror')).toBeNull(); expect(doc.images[0].getAttribute('referrerpolicy')).toBe('no-referrer'); expect(doc.images[1].getAttribute('src')).toBe(png);
    expect(doc.title).toBe('</title><script>injected()</script>'); expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("script-src 'none'"); expect(doc.querySelector('meta[name="sintagma-print-document"]')?.getAttribute('content')).toBe('marker');
  });
  it.each(['<img src="javascript:alert(1)">', '<img src="data:image/svg+xml,<svg onload=alert(1)></svg>">', '<img src="http://old.example.org/stamp.png">', '<img src="https://user:password@files.example.org/a.png">', '<link rel="stylesheet" href="https://external.example/style.css"><p>Текст</p>', '<div style="background:url(https://external.example/stamp.png)">Текст</div>', '<style>@import "https://external.example/a.css";</style><p>Текст</p>', '<style>p{background:u\\72l(https://external.example/a)}</style><p>Текст</p>'])('explicitly refuses an unsafe or unverifiable resource instead of silently losing it: %s', html => {
    expect(() => preparePrintHtml(html, 'Документ', 'marker')).toThrow();
  });
  it('requires readable content and marks raster images anonymous so a missing CORS signature fails rather than disappearing', () => {
    expect(() => preparePrintHtml('<style>p{color:red}</style>', 'Документ', 'marker')).toThrow('пуст');
    const doc = parse(preparePrintHtml('<p>Текст</p><img src="https://files.example.org/signature.png">', 'Документ', 'marker', true)); expect(doc.images[0].getAttribute('crossorigin')).toBe('anonymous');
    expect(escapeDocumentHtml('A & <B> "C"')).toBe('A &amp; &lt;B&gt; &quot;C&quot;');
  });
});
