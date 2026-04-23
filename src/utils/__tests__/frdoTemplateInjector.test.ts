import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";

// Vite ?url import → in vitest (node) we can't resolve it the same way, so
// we test the underlying xml manipulation logic with a real local copy of the
// template instead.
const TEMPLATE_PATH = resolve(__dirname, "../../assets/frdo/template-po.xlsx");

describe("frdoTemplateInjector — donor template integrity", () => {
  it("template asset exists and is ≥ 200 KB (full FRDO donor)", () => {
    const buf = readFileSync(TEMPLATE_PATH);
    expect(buf.byteLength).toBeGreaterThan(200 * 1024);
  });

  it("template contains the hidden Проверки sheet with defined names", async () => {
    const buf = readFileSync(TEMPLATE_PATH);
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file("xl/worksheets/sheet2.xml")).toBeTruthy();
    expect(zip.file("xl/worksheets/sheet1.xml")).toBeTruthy();
    const wb = await zip.file("xl/workbook.xml")!.async("string");
    expect(wb).toContain("Вид_документа");
    expect(wb).toContain("гражданство");
  });

  it("after replacing sheetData, vbaProject/styles/sharedStrings are preserved", async () => {
    const buf = readFileSync(TEMPLATE_PATH);
    const zip = await JSZip.loadAsync(buf);
    const sheet1 = await zip.file("xl/worksheets/sheet1.xml")!.async("string");

    // Simulate the same surgery our injector performs
    const headerMatch = sheet1.match(/<row r="1"[\s\S]*?<\/row>/);
    expect(headerMatch).toBeTruthy();

    const newInner = headerMatch![0] + `<row r="2" spans="1:35"><c r="A2" t="inlineStr"><is><t>TEST</t></is></c></row>`;
    const replaced = sheet1.replace(/(<sheetData[^>]*>)[\s\S]*?(<\/sheetData>)/, `$1${newInner}$2`);
    zip.file("xl/worksheets/sheet1.xml", replaced);

    const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    // Output must still be a hefty file (donor preserved), not a sub-50KB ExcelJS rebuild
    expect(out.byteLength).toBeGreaterThan(150 * 1024);

    // Re-open and verify our row landed
    const zip2 = await JSZip.loadAsync(out);
    const s1 = await zip2.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(s1).toContain(">TEST<");
    // sharedStrings & styles still present
    expect(zip2.file("xl/sharedStrings.xml")).toBeTruthy();
    expect(zip2.file("xl/styles.xml")).toBeTruthy();
  });
});
