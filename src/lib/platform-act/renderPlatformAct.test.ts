import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderPlatformAct } from "./renderPlatformAct";
import { stampBase64, signatureBase64 } from "./facsimileAssets";
const input = { actNumber: "А-СЧ-2026/1", actDate: "2026-09-29", basis: "Счёт № СЧ-2026/1",
  amountKopecks: 100001, customerName: "Заказчик", customerInn: null, customerDirector: null,
  customerPosition: null, stampBase64, signatureBase64 };
describe("existing platform template", () => {
  it("embeds exact existing assets and preserves provider/service/template sections", () => {
    for (const [asset, file] of [[stampBase64, "stamp"], [signatureBase64, "signature"]]) {
      expect(Buffer.from(asset.split(",")[1], "base64")).toEqual(readFileSync(`src/assets/${file}-shafranovskiy.png`));
    }
    const html = renderPlatformAct(input);
    expect(html).toContain("ИП Шафрановский Максим Михайлович, ИНН 253615392404");
    expect(html).toContain("Предоставление доступа к платформе Sintagma");
    expect(html).toContain('class="signatures-table"');
    expect(html).toContain("1000 руб. 01 коп.");
    expect(html).toContain("29 сентября 2026");
    expect(html).toContain("_______________");
  });
  it("escapes source fields and cannot embed arbitrary remote image URLs", () => {
    expect(renderPlatformAct({ ...input, customerName: '<img src=x onerror="evil()">', basis: "<script>alert(1)</script>" })).not.toContain("<script>");
    expect(() => renderPlatformAct({ ...input, stampBase64: "https://external.invalid/x" })).toThrow("invalid_facsimile");
  });
  it("rejects invalid dates, negative or fractional kopecks", () => {
    expect(() => renderPlatformAct({ ...input, actDate: "2026-02-30" })).toThrow("invalid_date");
    expect(() => renderPlatformAct({ ...input, amountKopecks: 1.1 })).toThrow("invalid_amount");
    expect(() => renderPlatformAct({ ...input, amountKopecks: -1 })).toThrow("invalid_amount");
  });
});
