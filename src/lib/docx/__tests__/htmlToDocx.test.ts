import { describe, it, expect } from "vitest";
import { htmlToWordXml, sanitizeFileName, htmlToDocxBlob, htmlDocsToZipBlob } from "@/lib/docx/htmlToDocx";

describe("htmlToDocx", () => {
  it("переносит абзацы и жирный текст", () => {
    const xml = htmlToWordXml("<p>Договор <b>№ 1</b></p><p>Вторая строка</p>");
    expect(xml).toContain("<w:document");
    expect((xml.match(/<w:p>/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("Договор");
  });

  it("экранирует XML", () => {
    const xml = htmlToWordXml("<p>ООО &lt;Ромашка&gt; &amp; Ко</p>");
    expect(xml).toContain("&lt;Ромашка&gt;");
    expect(xml).not.toMatch(/<w:t[^>]*><Ромашка/);
  });

  it("конвертирует таблицы", () => {
    const xml = htmlToWordXml("<table><tr><th>№</th><th>ФИО</th></tr><tr><td>1</td><td>Петров</td></tr></table>");
    expect(xml).toContain("<w:tbl>");
    expect((xml.match(/<w:tr>/g) || []).length).toBe(2);
    expect(xml).toContain("Петров");
  });

  it("разворачивает списки в абзацы с маркерами", () => {
    const xml = htmlToWordXml("<ol><li>Первый</li><li>Второй</li></ol>");
    expect(xml).toContain("1. ");
    expect(xml).toContain("2. ");
  });

  it("держит заголовки и выравнивание", () => {
    const xml = htmlToWordXml('<h1 style="text-align:center">ДОГОВОР</h1>');
    expect(xml).toContain('w:pStyle w:val="Heading1"');
    expect(xml).toContain('w:jc w:val="center"');
  });

  it("санитизирует имена файлов", () => {
    expect(sanitizeFileName('Договор №1/2026', "docx")).toBe("Договор №1 2026.docx");
    expect(sanitizeFileName("", "docx")).toBe("document.docx");
  });

  it("собирает docx и zip", async () => {
    const docx = await htmlToDocxBlob("<p>Привет</p>");
    expect(docx.size).toBeGreaterThan(300);
    const zip = await htmlDocsToZipBlob([
      { name: "A", html: "<p>1</p>" },
      { name: "A", html: "<p>2</p>" },
    ]);
    expect(zip.size).toBeGreaterThan(400);
  });
});
