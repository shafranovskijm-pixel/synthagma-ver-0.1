import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  buildGroupDocumentScalars,
  compileGroupDocumentXml,
  parseGeneratedHtmlRows,
  type GroupDocumentManifest,
} from "../groupDocument";
import { findUnresolvedTokens } from "../xml";
import { generateDocument } from "../../../../../src/lib/group-docs/generate";
import { SAMPLE_CONTEXT } from "../../../../../src/lib/group-docs/sampleContext";
import type { DocType } from "../../../../../src/lib/group-docs/schema";

const ROOT = path.resolve(
  __dirname,
  "../../group-doc-templates/goreltech/group-package/v1",
);
const SOURCE_ROOT = path.resolve(
  __dirname,
  "../../../../../docs/group-documents/client-templates/goreltech-group-package-v1/source",
);

const sha256 = (value: Buffer | Uint8Array) =>
  crypto.createHash("sha256").update(value).digest("hex").toUpperCase();

async function zipPart(zip: JSZip, name: string): Promise<Buffer | null> {
  const file = zip.file(name);
  return file ? Buffer.from(await file.async("uint8array")) : null;
}

describe("групповые DOCX Beta", () => {
  it("превращает HTML-строки только в чистые ячейки", () => {
    const rows = parseGeneratedHtmlRows(
      '<tr><td>1</td><td><b>Иванов &amp; Петров</b></td><td></td></tr>',
      ["N", "NAME", "BASIS"],
    );
    expect(rows).toEqual([{ N: "1", NAME: "Иванов & Петров", BASIS: "" }]);
  });

  it("изолирует фирменную шапку ГОРЭЛТЕХ", () => {
    const goreltech = buildGroupDocumentScalars({
      org_name: 'ООО «Инжиниринговый центр «ГОРЭЛТЕХ»',
      org_short_name: 'ООО «ИЦ «ГОРЭЛТЕХ»',
    });
    const generic = buildGroupDocumentScalars({ org_name: 'ЧОУ ДПО «Другая»' });
    expect(goreltech.ORG_HEADER_LINE_1).toContain("ГОРЭЛТЕХ");
    expect(generic.ORG_HEADER_LINE_1).toBe('ЧОУ ДПО «Другая»');
    expect(generic.ORG_HEADER_LINE_2).toBe("");
  });

  it("компилирует все восемь шаблонов без артефактов", async () => {
    const manifestFiles = fs.readdirSync(path.join(ROOT, "manifests"));
    expect(manifestFiles).toHaveLength(8);

    for (const filename of manifestFiles) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(ROOT, "manifests", filename), "utf8"),
      ) as GroupDocumentManifest;
      const template = fs.readFileSync(
        path.join(ROOT, "templates", filename.replace(/\.json$/, ".docx")),
      );
      const zip = await JSZip.loadAsync(template);
      const xml = await zip.file("word/document.xml")!.async("string");
      const scalars: Record<string, string> = {};
      for (const token of Array.from(xml.matchAll(/\[\[([A-Z0-9_]+)\]\]/g))) {
        scalars[token[1]] = token[1] === "ORG_HEADER_LINE_2" ? "" : `value-${token[1]}`;
      }
      const rows = manifest.row_tokens.length
        ? [Object.fromEntries(manifest.row_tokens.map((token) => [token, `row-${token}`]))]
        : [];
      const compiled = compileGroupDocumentXml({
        documentXml: xml,
        manifest,
        snapshot: { scalars, rows },
      });
      expect(findUnresolvedTokens(compiled), manifest.template_id).toEqual([]);
      expect(compiled, manifest.template_id).not.toContain("[[");
    }
  });

  it("компилирует все восемь шаблонов из реальных данных генератора", async () => {
    const manifestFiles = fs.readdirSync(path.join(ROOT, "manifests"));

    for (const filename of manifestFiles) {
      const docType = filename.replace(/\.json$/, "") as DocType;
      const manifest = JSON.parse(
        fs.readFileSync(path.join(ROOT, "manifests", filename), "utf8"),
      ) as GroupDocumentManifest;
      const generated = generateDocument(structuredClone(SAMPLE_CONTEXT), docType, {
        mode: "blank",
      });
      const rowHtml = manifest.row_source_key
        ? generated.variables[manifest.row_source_key]
        : "";
      const rows = parseGeneratedHtmlRows(rowHtml, manifest.row_tokens);
      const template = fs.readFileSync(
        path.join(ROOT, "templates", filename.replace(/\.json$/, ".docx")),
      );
      const zip = await JSZip.loadAsync(template);
      const xml = await zip.file("word/document.xml")!.async("string");

      const compiled = compileGroupDocumentXml({
        documentXml: xml,
        manifest,
        snapshot: {
          scalars: buildGroupDocumentScalars(generated.variables),
          rows,
        },
      });

      expect(findUnresolvedTokens(compiled), manifest.template_id).toEqual([]);
      if (manifest.row_tokens.length > 0) {
        expect(rows.length, `${manifest.template_id}: rows`).toBeGreaterThan(0);
      }
      expect(compiled, manifest.template_id).toContain(SAMPLE_CONTEXT.group.program_title);

      const headerParts = Object.keys(zip.files).filter((name) => /^word\/header\d+\.xml$/.test(name));
      const headerXml = await Promise.all(
        headerParts.map((name) => zip.file(name)!.async("string")),
      );
      const mediaParts = Object.keys(zip.files).filter((name) => /^word\/media\/image\d+\./.test(name));
      const mediaBytes = await Promise.all(mediaParts.map((name) => zipPart(zip, name)));
      expect(
        headerXml.some((xml) => xml.includes("<w:drawing")),
        `${manifest.template_id}: exact client header`,
      ).toBe(true);
      expect(
        mediaBytes.some((bytes) => (bytes?.byteLength || 0) > 1000),
        `${manifest.template_id}: header image`,
      ).toBe(true);
    }
  });

  it("сохраняет неизменяемые части клиентских DOCX байт-в-байт", async () => {
    const manifestFiles = fs.readdirSync(path.join(ROOT, "manifests"));

    for (const filename of manifestFiles) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(ROOT, "manifests", filename), "utf8"),
      ) as GroupDocumentManifest;
      const sourceBytes = fs.readFileSync(path.join(SOURCE_ROOT, manifest.source_filename));
      const templateBytes = fs.readFileSync(
        path.join(ROOT, "templates", filename.replace(/\.json$/, ".docx")),
      );
      expect(sha256(sourceBytes), `${manifest.template_id}: source hash`).toBe(
        manifest.source_sha256,
      );
      expect(sha256(templateBytes), `${manifest.template_id}: template hash`).toBe(
        manifest.template_sha256,
      );

      const sourceZip = await JSZip.loadAsync(sourceBytes);
      const templateZip = await JSZip.loadAsync(templateBytes);
      const allowed = new Set(manifest.qa?.preserve_package_parts_except || []);
      const sourceParts = Object.keys(sourceZip.files).filter((name) => !name.endsWith("/"));
      const templateParts = Object.keys(templateZip.files).filter((name) => !name.endsWith("/"));
      const allParts = new Set([...sourceParts, ...templateParts]);
      for (const partName of allParts) {
        if (allowed.has(partName)) continue;
        const sourcePart = await zipPart(sourceZip, partName);
        const templatePart = await zipPart(templateZip, partName);
        expect(templatePart, `${manifest.template_id}: missing ${partName}`).not.toBeNull();
        expect(sourcePart, `${manifest.template_id}: unexpected ${partName}`).not.toBeNull();
        expect(sha256(templatePart!), `${manifest.template_id}: changed ${partName}`).toBe(
          sha256(sourcePart!),
        );
      }

      const documentXml = await templateZip.file("word/document.xml")!.async("string");
      const pageSize = documentXml.match(/<w:pgSz\b[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"[^>]*>/);
      expect(pageSize, `${manifest.template_id}: page size`).not.toBeNull();
      const width = Number(pageSize![1]);
      const height = Number(pageSize![2]);
      expect(
        width > height ? "landscape" : "portrait",
        `${manifest.template_id}: orientation`,
      ).toBe(manifest.orientation);
    }
  });

  it("добавляет книге регистрации точную фирменную шапку из клиентского альбомного приказа", async () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "manifests", "registration_book.json"), "utf8"),
    ) as GroupDocumentManifest;
    const headerSourceBytes = fs.readFileSync(
      path.join(SOURCE_ROOT, manifest.header_source_filename!),
    );
    expect(sha256(headerSourceBytes)).toBe(manifest.header_source_sha256);

    const headerSourceZip = await JSZip.loadAsync(headerSourceBytes);
    const templateZip = await JSZip.loadAsync(
      fs.readFileSync(path.join(ROOT, "templates", "registration_book.docx")),
    );
    expect(await zipPart(templateZip, "word/header1.xml")).not.toBeNull();
    expect(sha256((await zipPart(templateZip, "word/_rels/header1.xml.rels"))!)).toBe(
      sha256((await zipPart(headerSourceZip, manifest.header_source_rels_part!))!),
    );
    expect(sha256((await zipPart(templateZip, "word/media/image1.jpeg"))!)).toBe(
      sha256((await zipPart(headerSourceZip, "word/media/image1.jpeg"))!),
    );

    const sourceHeaderXml = (await headerSourceZip.file(manifest.header_source_part!)!.async("string"));
    const templateHeaderXml = (await templateZip.file("word/header1.xml")!.async("string"));
    expect(sourceHeaderXml).toContain("<w:drawing");
    expect(templateHeaderXml).toContain("<w:drawing");
    expect(templateHeaderXml).not.toBe(sourceHeaderXml);
  });

  it("сохраняет разнесение даты и номера в ведомости итоговой аттестации", async () => {
    const templateZip = await JSZip.loadAsync(
      fs.readFileSync(path.join(ROOT, "templates", "attestation_sheet.docx")),
    );
    const documentXml = await templateZip.file("word/document.xml")!.async("string");
    const line = Array.from(documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g))
      .map((match) => match[0])
      .find((paragraph) => paragraph.includes("[[END_DATE]]"));
    expect(line).toBeTruthy();
    const text = (line!.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
      .map((node) => node.replace(/<[^>]+>/g, ""))
      .join("");
    expect(text).toMatch(/Дата \[\[END_DATE\]\]\s{10,}N \[\[GROUP_NUMBER\]\]\/ИА/);
  });
});
