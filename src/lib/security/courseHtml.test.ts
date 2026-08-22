import { describe, expect, it } from "vitest";
import { sanitizeCourseHtml } from "@/lib/security/courseHtml";

describe("sanitizeCourseHtml", () => {
  it("removes executable markup and unsafe URL schemes", () => {
    const sanitized = sanitizeCourseHtml(`
      <h2 class="lesson-title" style="color: navy">Раздел</h2>
      <img src="x" onerror="alert(document.domain)">
      <a href="javascript:alert(1)">опасная ссылка</a>
      <script>alert(2)</script>
      <iframe srcdoc="<script>alert(3)</script>"></iframe>
    `);

    expect(sanitized).toContain('<h2 class="lesson-title" style="color: navy">Раздел</h2>');
    expect(sanitized).not.toMatch(/onerror|javascript:|<script|<iframe|srcdoc/i);
  });

  it("preserves normal lesson formatting, tables and embedded document images", () => {
    const sanitized = sanitizeCourseHtml(`
      <p><strong>Важно</strong><br><em>Пояснение</em></p>
      <table class="lesson-table"><tbody><tr><td colspan="2">Данные</td></tr></tbody></table>
      <img src="data:image/png;base64,AA==" alt="Схема" class="rounded">
    `);

    expect(sanitized).toContain("<strong>Важно</strong>");
    expect(sanitized).toContain('<table class="lesson-table">');
    expect(sanitized).toContain('colspan="2"');
    expect(sanitized).toContain('src="data:image/png;base64,AA=="');
    expect(sanitized).toContain('alt="Схема"');
  });
});
