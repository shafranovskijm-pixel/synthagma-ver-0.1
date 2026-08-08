import { describe, it, expect } from "vitest";
import {
  buildRawEmail,
  ensureFullHtmlDocument,
  htmlToPlainText,
  isFullHtmlDocument,
} from "../../../../supabase/functions/_shared/smtp-protocol";

const base = {
  from: "Тест <a@torgi.com.ru>",
  fromEmail: "a@torgi.com.ru",
  to: "b@example.com",
  subject: "Тема",
};

const decode = (b64: string) =>
  decodeURIComponent(escape(atob(b64.replace(/\r\n/g, ""))));

function partBody(raw: string, contentType: string): string {
  const idx = raw.indexOf(`Content-Type: ${contentType}`);
  expect(idx).toBeGreaterThan(-1);
  const after = raw.slice(idx);
  const body = after.split("\r\n\r\n")[1].split("\r\n--")[0];
  return decode(body);
}

describe("HTML wrapper", () => {
  it("оборачивает фрагмент в полноценный документ", () => {
    const out = ensureFullHtmlDocument("<p>hi</p>", "Тема");
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain('<html lang="ru">');
    expect(out).toContain('<meta charset="UTF-8">');
    expect(out).toContain("<p>hi</p>");
    expect(out).toContain("<title>Тема</title>");
  });

  it("не дублирует wrapper для готового документа", () => {
    const doc = '<!doctype html><html lang="ru"><head><meta charset="UTF-8"></head><body><p>x</p></body></html>';
    expect(isFullHtmlDocument(doc)).toBe(true);
    expect(ensureFullHtmlDocument(doc)).toBe(doc);
    const only = '<html><body>y</body></html>';
    expect(ensureFullHtmlDocument(only)).toBe(only);
  });
});

describe("htmlToPlainText", () => {
  it("безопасно строит текст из HTML", () => {
    const text = htmlToPlainText(
      '<style>p{color:red}</style><script>alert(1)</script><h1>Заголовок</h1><p>Абзац &laquo;тест&raquo;</p><a href="https://x.y/z">ссылка</a><img src="p.png">',
    );
    expect(text).not.toContain("alert(1)");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("<");
    expect(text).toContain("Заголовок");
    expect(text).toContain("Абзац «тест»");
    expect(text).toContain("ссылка (https://x.y/z)");
  });
});

describe("multipart/alternative", () => {
  it("строит text/plain + text/html с полным HTML-документом", () => {
    const { raw } = buildRawEmail({ ...base, html: "<p>Привет</p>" });
    expect(raw).toContain("MIME-Version: 1.0");
    expect(raw).toContain('Content-Type: multipart/alternative; boundary="');
    expect(raw).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(raw).toContain("Content-Type: text/html; charset=UTF-8");
    expect(raw).toContain("Content-Transfer-Encoding: base64");
    expect(partBody(raw, "text/plain; charset=UTF-8")).toContain("Привет");
    const html = partBody(raw, "text/html; charset=UTF-8");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect((html.match(/<html/gi) || []).length).toBe(1);
  });

  it("использует переданный text/plain", () => {
    const { raw } = buildRawEmail({ ...base, html: "<p>x</p>", text: "готовый текст" });
    expect(partBody(raw, "text/plain; charset=UTF-8")).toBe("готовый текст");
  });

  it("с вложениями: multipart/mixed содержит alternative", () => {
    const { raw } = buildRawEmail({
      ...base,
      html: "<p>x</p>",
      attachments: [{ filename: "invite.ics", content: "BEGIN:VCALENDAR", contentType: "text/calendar" }],
      boundary: "MIX",
      altBoundary: "ALT",
    });
    expect(raw).toContain('Content-Type: multipart/mixed; boundary="MIX"');
    expect(raw).toContain('Content-Type: multipart/alternative; boundary="ALT"');
    expect(raw).toContain("--ALT--");
    expect(raw).toContain("--MIX--");
    expect(raw).toContain('Content-Disposition: attachment; filename="invite.ics"');
  });

  it("пустые extra-заголовки не добавляются", () => {
    const { raw } = buildRawEmail({ ...base, html: "<p>x</p>", extraHeaders: { "List-Unsubscribe": "" } });
    expect(raw).not.toContain("List-Unsubscribe");
  });

  it("все строки заканчиваются CRLF", () => {
    const { raw } = buildRawEmail({ ...base, html: "<p>x</p>" });
    expect(raw.includes("\n")).toBe(true);
    expect(/[^\r]\n/.test(raw)).toBe(false);
  });
});
