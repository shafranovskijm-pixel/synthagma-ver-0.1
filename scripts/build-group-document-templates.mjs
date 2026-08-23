/**
 * Distil the eight GORELTECH group-document templates from the client DOCX
 * archive. All source package parts are retained while word/document.xml is
 * patched with SINTAGMA tokens and the corrections from the 2026-08-12
 * Telemost chat. Existing client headers are retained byte-for-byte. The
 * registration book, whose source has no header, receives the exact landscape
 * banner from the client's enrollment-order source, scaled to its A3 page.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(
  repoRoot,
  "docs/group-documents/client-templates/goreltech-group-package-v1/source",
);
const outputDir = path.join(
  repoRoot,
  "supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1",
);
const templateDir = path.join(outputDir, "templates");
const manifestDir = path.join(outputDir, "manifests");
const VERSION = "1.1.0-client-source";

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();

const xmlEscape = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function splitTopLevel(xml, tags) {
  const out = [];
  const open = new RegExp(`<(${tags.join("|")})(\\s[^>]*?)?(/?)>`, "g");
  let match;
  let cursor = 0;
  while ((match = open.exec(xml))) {
    if (match.index < cursor) continue;
    const tag = match[1];
    if (match[3] === "/") {
      const end = match.index + match[0].length;
      out.push({ tag, xml: match[0], start: match.index, end });
      cursor = end;
      open.lastIndex = cursor;
      continue;
    }
    const nested = new RegExp(`<${tag}(\\s[^>]*?)?>|</${tag}>`, "g");
    nested.lastIndex = match.index + match[0].length;
    let depth = 1;
    let end = -1;
    let nestedMatch;
    while ((nestedMatch = nested.exec(xml))) {
      if (nestedMatch[0].startsWith("</")) {
        depth -= 1;
        if (depth === 0) {
          end = nestedMatch.index + nestedMatch[0].length;
          break;
        }
      } else {
        depth += 1;
      }
    }
    if (end < 0) throw new Error(`Unclosed OOXML element: ${tag}`);
    out.push({ tag, xml: xml.slice(match.index, end), start: match.index, end });
    cursor = end;
    open.lastIndex = cursor;
  }
  return out;
}

function elementText(xml) {
  return (xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
    .map((node) => node.replace(/<[^>]+>/g, ""))
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function replaceAllTextNodes(xml, value) {
  let index = 0;
  const escaped = xmlEscape(value);
  const patched = xml.replace(
    /(<w:t(?:\s[^>]*)?>)[\s\S]*?(<\/w:t>)/g,
    (_node, open, close) => {
      const text = index === 0 ? escaped : "";
      index += 1;
      return `${open}${text}${close}`;
    },
  );
  if (index === 0) {
    if (!/<\/w:p>/.test(xml)) {
      throw new Error(`OOXML element has no paragraph: ${String(value).slice(0, 80)}`);
    }
    return xml.replace(
      /<\/w:p>/,
      `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman"/></w:rPr><w:t>${escaped}</w:t></w:r></w:p>`,
    );
  }
  return patched;
}

function xmlUnescape(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/**
 * Replace a literal fragment even when Word split it across several runs.
 * Unrelated runs (especially the client's spacing/alignment runs) stay intact.
 */
function replaceTextFragment(xml, needle, value) {
  const nodes = Array.from(
    xml.matchAll(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g),
  ).map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    open: match[1],
    text: xmlUnescape(match[2]),
    close: match[3],
  }));
  const fullText = nodes.map((node) => node.text).join("");
  const fragmentStart = fullText.indexOf(needle);
  if (fragmentStart < 0) throw new Error(`Text fragment not found: ${needle}`);
  const fragmentEnd = fragmentStart + needle.length;
  let textCursor = 0;
  let inserted = false;
  const replacements = [];

  for (const node of nodes) {
    const nodeStart = textCursor;
    const nodeEnd = nodeStart + node.text.length;
    textCursor = nodeEnd;
    if (nodeEnd <= fragmentStart || nodeStart >= fragmentEnd) continue;

    const localStart = Math.max(0, fragmentStart - nodeStart);
    const localEnd = Math.min(node.text.length, fragmentEnd - nodeStart);
    const prefix = node.text.slice(0, localStart);
    const suffix = node.text.slice(localEnd);
    const nextText = `${prefix}${inserted ? "" : value}${suffix}`;
    inserted = true;
    replacements.push({
      start: node.start,
      end: node.end,
      xml: `${node.open}${xmlEscape(nextText)}${node.close}`,
    });
  }

  let patched = xml;
  for (const replacement of replacements.reverse()) {
    patched = patched.slice(0, replacement.start) + replacement.xml + patched.slice(replacement.end);
  }
  return patched;
}

function bodyParts(documentXml) {
  const bodyStart = documentXml.indexOf("<w:body>");
  const bodyEnd = documentXml.lastIndexOf("</w:body>");
  if (bodyStart < 0 || bodyEnd < 0) throw new Error("word/document.xml has no w:body");
  const prefixEnd = bodyStart + "<w:body>".length;
  return {
    prefix: documentXml.slice(0, prefixEnd),
    suffix: documentXml.slice(bodyEnd),
    elements: splitTopLevel(documentXml.slice(prefixEnd, bodyEnd), ["w:p", "w:tbl", "w:sectPr"]),
  };
}

function replaceParagraph(elements, needle, value, occurrence = 0) {
  const matches = elements.filter(
    (element) => element.tag === "w:p" && elementText(element.xml).includes(needle),
  );
  if (!matches[occurrence]) throw new Error(`Paragraph not found: ${needle} #${occurrence + 1}`);
  matches[occurrence].xml = replaceAllTextNodes(matches[occurrence].xml, value);
}

function replaceAllParagraphs(elements, needle, value) {
  const matches = elements.filter(
    (element) => element.tag === "w:p" && elementText(element.xml).includes(needle),
  );
  if (!matches.length) throw new Error(`Paragraph not found: ${needle}`);
  for (const element of matches) element.xml = replaceAllTextNodes(element.xml, value);
}

function replaceParagraphWithCopies(elements, needle, values, occurrence = 0) {
  const matches = elements
    .map((element, index) => ({ element, index }))
    .filter(
      ({ element }) => element.tag === "w:p" && elementText(element.xml).includes(needle),
    );
  const match = matches[occurrence];
  if (!match) throw new Error(`Paragraph not found: ${needle} #${occurrence + 1}`);

  const copies = values.map((value, index) => {
    const source = index === 0
      ? match.element.xml
      : match.element.xml
          .replace(/\s+w14:paraId="[^"]*"/g, "")
          .replace(/\s+w14:textId="[^"]*"/g, "");
    return {
      tag: "w:p",
      xml: replaceAllTextNodes(source, value),
      start: -1,
      end: -1,
    };
  });
  elements.splice(match.index, 1, ...copies);
}

function patchCell(tableXml, rowIndex, cellIndex, value) {
  const rows = splitTopLevel(tableXml, ["w:tr"]);
  if (!rows[rowIndex]) throw new Error(`Missing table row ${rowIndex}`);
  const cells = splitTopLevel(rows[rowIndex].xml, ["w:tc"]);
  if (!cells[cellIndex]) throw new Error(`Missing table cell r${rowIndex}c${cellIndex}`);
  const cellXml = replaceAllTextNodes(cells[cellIndex].xml, value);
  const rowXml =
    rows[rowIndex].xml.slice(0, cells[cellIndex].start) +
    cellXml +
    rows[rowIndex].xml.slice(cells[cellIndex].end);
  return tableXml.slice(0, rows[rowIndex].start) + rowXml + tableXml.slice(rows[rowIndex].end);
}

function patchRow(tableXml, rowIndex, values) {
  let patched = tableXml;
  values.forEach((value, cellIndex) => {
    patched = patchCell(patched, rowIndex, cellIndex, value);
  });
  return patched;
}

function scaleWidthAttributes(xml, factor) {
  return xml
    .replace(/(<w:gridCol\b[^>]*\bw:w=")(-?\d+)(")/g, (_m, before, raw, after) =>
      `${before}${Math.max(1, Math.round(Number(raw) * factor))}${after}`,
    )
    .replace(/(<w:tcW\b[^>]*\bw:w=")(-?\d+)(")/g, (_m, before, raw, after) =>
      `${before}${Math.max(1, Math.round(Number(raw) * factor))}${after}`,
    );
}

function constrainTable(tableXml, targetWidth, maxFontHalfPoints = null) {
  const gridValues = Array.from(tableXml.matchAll(/<w:gridCol\b[^>]*\bw:w="(\d+)"/g)).map(
    (match) => Number(match[1]),
  );
  const currentWidth = gridValues.reduce((sum, value) => sum + value, 0);
  if (!currentWidth) throw new Error("Table has no grid width");
  const factor = Math.min(1, targetWidth / currentWidth);
  let patched = scaleWidthAttributes(tableXml, factor);
  patched = patched.replace(
    /<w:tblW\b[^>]*\/>/,
    `<w:tblW w:w="${Math.round(currentWidth * factor)}" w:type="dxa"/>`,
  );
  if (/<w:tblInd\b[^>]*\/>/.test(patched)) {
    patched = patched.replace(/<w:tblInd\b[^>]*\/>/, '<w:tblInd w:w="0" w:type="dxa"/>');
  } else {
    patched = patched.replace(/(<w:tblPr\b[^>]*>)/, '$1<w:tblInd w:w="0" w:type="dxa"/>');
  }
  if (maxFontHalfPoints) {
    patched = patched
      .replace(/(<w:sz\b[^>]*\bw:val=")([0-9]+)(")/g, (_m, before, raw, after) =>
        `${before}${Math.min(Number(raw), maxFontHalfPoints)}${after}`,
      )
      .replace(/(<w:szCs\b[^>]*\bw:val=")([0-9]+)(")/g, (_m, before, raw, after) =>
        `${before}${Math.min(Number(raw), maxFontHalfPoints)}${after}`,
      );
  }
  return patched;
}

function setPortrait(documentXml) {
  return documentXml.replace(/<w:pgSz\b[^>]*\/>/g, (node) => {
    let patched = node
      .replace(/\s+w:orient="[^"]*"/g, "")
      .replace(/w:w="\d+"/, 'w:w="11906"')
      .replace(/w:h="\d+"/, 'w:h="16838"');
    if (!/w:w="/.test(patched)) patched = patched.replace(/\/>$/, ' w:w="11906"/>');
    if (!/w:h="/.test(patched)) patched = patched.replace(/\/>$/, ' w:h="16838"/>');
    return patched;
  });
}

function paragraphXml(text, { bold = false, center = false, after = 80 } = {}) {
  return (
    `<w:p><w:pPr>${center ? '<w:jc w:val="center"/>' : ""}` +
    `<w:spacing w:after="${after}"/></w:pPr><w:r><w:rPr>` +
    `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman"/>` +
    `<w:sz w:val="20"/><w:szCs w:val="20"/>${bold ? "<w:b/>" : ""}` +
    `</w:rPr><w:t>${xmlEscape(text)}</w:t></w:r></w:p>`
  );
}

function insertBeforeFirstTable(elements, paragraphs) {
  const index = elements.findIndex((element) => element.tag === "w:tbl");
  if (index < 0) throw new Error("Table not found for paragraph insertion");
  elements.splice(
    index,
    0,
    ...paragraphs.map((xml) => ({ tag: "w:p", xml, start: -1, end: -1 })),
  );
}

function insertBeforeSection(elements, paragraphs) {
  const index = elements.findIndex((element) => element.tag === "w:sectPr");
  const target = index < 0 ? elements.length : index;
  elements.splice(
    target,
    0,
    ...paragraphs.map((xml) => ({ tag: "w:p", xml, start: -1, end: -1 })),
  );
}

function keepParagraphWithNext(elements, needle, before = 0) {
  const paragraph = elements.find(
    (element) => element.tag === "w:p" && elementText(element.xml).includes(needle),
  );
  if (!paragraph) throw new Error(`Paragraph not found for keep-next: ${needle}`);
  if (paragraph.xml.includes("<w:keepNext")) return;
  if (paragraph.xml.includes("<w:pPr>")) {
    paragraph.xml = paragraph.xml.replace("<w:pPr>", "<w:pPr><w:keepNext/>");
  } else {
    paragraph.xml = paragraph.xml.replace(/(<w:p\b[^>]*>)/, "$1<w:pPr><w:keepNext/></w:pPr>");
  }
  if (before > 0) {
    if (/<w:spacing\b[^>]*\/>/.test(paragraph.xml)) {
      paragraph.xml = paragraph.xml.replace(/<w:spacing\b[^>]*\/>/, (node) =>
        /w:before="/.test(node)
          ? node.replace(/w:before="\d+"/, `w:before="${before}"`)
          : node.replace(/\/>$/, ` w:before="${before}"/>`),
      );
    } else {
      paragraph.xml = paragraph.xml.replace("<w:pPr>", `<w:pPr><w:spacing w:before="${before}"/>`);
    }
  }
}

function patchEnrollment(parts) {
  replaceParagraph(parts.elements, "ПРИКАЗ №", "ПРИКАЗ № [[ORDER_NUMBER]] от [[ORDER_DATE]]");
  replaceParagraph(
    parts.elements,
    "В соответствии с ФЗ",
    "В соответствии с Федеральным законом «Об образовании в Российской Федерации», Положением об учебном центре и Уставом [[ORG_SHORT_NAME]] приказываю:",
  );
  replaceParagraph(
    parts.elements,
    "1. Открыть курс",
    "1. Открыть курс в объеме [[PROGRAM_HOURS]] часов по дополнительной профессиональной образовательной программе повышения квалификации «[[PROGRAM_TITLE]]» с [[START_DATE_RU]].",
  );
  replaceParagraph(
    parts.elements,
    "2. На основании",
    "2. На основании заявления о зачислении зачислить в группу следующих обучающихся:",
  );
  replaceParagraph(parts.elements, "3. Присвоить", "3. Присвоить группе номер [[GROUP_NUMBER]].");
  replaceParagraph(
    parts.elements,
    "4. Ответственность",
    "4. Ответственность за организационно-методическое сопровождение курса возложить на [[RESPONSIBLE_PERSON_NAME]].",
  );
  replaceParagraph(
    parts.elements,
    "Руководитель учебного центра",
    "[[SIGNATORY_POSITION]] [[ORG_SHORT_NAME]] ________________________________ / [[SIGNATORY_SHORT]] /",
  );
  const table = parts.elements.find((element) => element.tag === "w:tbl");
  if (!table) throw new Error("Enrollment table not found");
  table.xml = patchCell(table.xml, 0, 2, "Часов");
  table.xml = patchRow(table.xml, 2, [
    "[[N]]",
    "[[STUDENT_NAME]]",
    "[[STUDENT_PROGRAM]]",
    "[[STUDENT_HOURS]]",
    "[[STUDENT_PERIOD]]",
    "[[STUDENT_BASIS]]",
  ]);
  table.xml = patchCell(table.xml, 3, 0, "[[N]]");
  table.xml = patchCell(table.xml, 3, 1, "[[STUDENT_NAME]]");
}

function patchExpulsion(parts) {
  replaceParagraph(parts.elements, "ПРИКАЗ №", "ПРИКАЗ № [[ORDER_NUMBER]] от [[ORDER_DATE]]");
  replaceParagraph(
    parts.elements,
    "1. Закрыть курс",
    "1. Закрыть курс в объеме [[PROGRAM_HOURS]] часов по дополнительной профессиональной образовательной программе повышения квалификации «[[PROGRAM_TITLE]]» с [[END_DATE_RU]].",
  );
  replaceParagraph(
    parts.elements,
    "2. По результатам",
    "2. По результатам проведения итоговой аттестации отчислить с выдачей удостоверений установленного образца из группы № [[GROUP_NUMBER]]",
  );
  replaceParagraph(
    parts.elements,
    "3. Отчислить без выдачи",
    "3. Отчислить без выдачи удостоверений, следующих обучающихся:",
  );
  keepParagraphWithNext(parts.elements, "3. Отчислить без выдачи", 2300);
  replaceAllParagraphs(
    parts.elements,
    "Руководитель учебного центра",
    "[[SIGNATORY_POSITION]] [[ORG_SHORT_NAME]] ________________________________ / [[SIGNATORY_SHORT]] /",
  );
  const tables = parts.elements.filter((element) => element.tag === "w:tbl");
  if (tables.length !== 2) throw new Error("Expulsion tables not found");
  tables[0].xml = patchCell(tables[0].xml, 0, 2, "Часов");
  tables[0].xml = patchRow(tables[0].xml, 2, [
    "[[N]]",
    "[[STUDENT_NAME]]",
    "[[STUDENT_PROGRAM]]",
    "[[STUDENT_HOURS]]",
    "[[STUDENT_PERIOD]]",
    "[[STUDENT_BASIS]]",
  ]);
  tables[0].xml = patchCell(tables[0].xml, 3, 0, "[[N]]");
  tables[0].xml = patchCell(tables[0].xml, 3, 1, "[[STUDENT_NAME]]");
  tables[1].xml = patchCell(tables[1].xml, 0, 2, "Часов");
  tables[1].xml = patchRow(tables[1].xml, 2, ["", "", "", "", "", ""]);
}

function patchStudentList(parts) {
  replaceParagraph(parts.elements, "Группа обучающихся", "Группа обучающихся № [[GROUP_NUMBER]]");
  replaceParagraph(parts.elements, "курса", "курса «[[PROGRAM_TITLE]]»");
  replaceParagraph(
    parts.elements,
    "Руководитель учебного центра",
    "[[SIGNATORY_POSITION]] [[SIGNATORY_SHORT]] __________________________________________",
  );
  const table = parts.elements.find((element) => element.tag === "w:tbl");
  if (!table) throw new Error("Student-list table not found");
  table.xml = patchRow(table.xml, 2, [
    "[[N]]",
    "[[STUDENT_NAME]]",
    "[[EMAIL]]",
    "[[PASSPORT_SERIES]]",
    "[[PASSPORT_NUMBER]]",
    "[[EDUCATION]]",
  ]);
  table.xml = constrainTable(table.xml, 9300, 15);
}

function patchSchedule(parts) {
  replaceParagraph(parts.elements, "«Проектирование", "«[[PROGRAM_TITLE]]»");
  replaceParagraph(parts.elements, "Продолжительность", "Продолжительность: [[PROGRAM_HOURS]] ак. ч.");
  replaceParagraphWithCopies(
    parts.elements,
    "Преподаватель",
    [
      "Преподаватель 1 [[INSTRUCTOR_1_SHORT]] __________________________ Подпись __________________________",
      "Преподаватель 2 [[INSTRUCTOR_2_SHORT]] __________________________ Подпись __________________________",
    ],
  );
  replaceParagraph(
    parts.elements,
    "Руководитель учебного центра",
    "[[SIGNATORY_POSITION]] [[SIGNATORY_SHORT]] __________________________________________",
  );
  const table = parts.elements.find((element) => element.tag === "w:tbl");
  if (!table) throw new Error("Schedule table not found");
  for (let index = 0; index < 4; index += 1) {
    table.xml = patchCell(
      table.xml,
      1,
      index,
      `Дата [[SCHEDULE_DATE_${index + 1}]] [[SCHEDULE_TIME_${index + 1}]]`,
    );
    table.xml = patchCell(
      table.xml,
      2,
      index,
      `Темы обучения [[SCHEDULE_TOPIC_${index + 1}]]`,
    );
  }
  table.xml = constrainTable(table.xml, 9300, 15);
}

function patchAttestation(parts) {
  const dateLine = parts.elements.find(
    (element) => element.tag === "w:p" && elementText(element.xml).includes("Дата "),
  );
  if (!dateLine) throw new Error("Attestation date/number line not found");
  dateLine.xml = replaceTextFragment(dateLine.xml, "16.01.2026", "[[END_DATE]]");
  dateLine.xml = replaceTextFragment(dateLine.xml, "N _1-ПК-26/ИА", "N [[GROUP_NUMBER]]/ИА");
  replaceParagraph(
    parts.elements,
    "Программа повышения",
    "Программа повышения квалификации «[[PROGRAM_TITLE]]» (наименование программы)",
  );
  replaceParagraph(parts.elements, "Группа ", "Группа [[GROUP_NUMBER]]");
  replaceParagraph(
    parts.elements,
    "Объем программы",
    "Объем программы [[PROGRAM_HOURS]] час. Срок обучения [[START_DATE]] – [[END_DATE]]",
  );
  replaceParagraphWithCopies(
    parts.elements,
    "Подпись преподавателя",
    [
      "Подпись преподавателя 1 __________________________ / [[INSTRUCTOR_1_SHORT]] /",
      "Подпись преподавателя 2 __________________________ / [[INSTRUCTOR_2_SHORT]] /",
    ],
  );
  replaceParagraph(
    parts.elements,
    "Руководитель учебного центра",
    "[[SIGNATORY_POSITION]] __________________________ / [[SIGNATORY_SHORT]] /",
  );
  const table = parts.elements.find((element) => element.tag === "w:tbl");
  if (!table) throw new Error("Attestation table not found");
  table.xml = patchRow(table.xml, 1, ["[[N]]", "[[STUDENT_NAME]]", "[[PERCENT]]", "[[GRADE]]"]);
}

function patchRegistration(parts) {
  insertBeforeFirstTable(parts.elements, [
    paragraphXml("КНИГА РЕГИСТРАЦИИ ВЫДАЧИ ДОКУМЕНТОВ О КВАЛИФИКАЦИИ", {
      bold: true,
      center: true,
      after: 120,
    }),
  ]);
  const table = parts.elements.find((element) => element.tag === "w:tbl");
  if (!table) throw new Error("Registration table not found");
  // The client source positions the table as a floating object above normal
  // document flow. Once the requested full header and title are restored that
  // absolute Y position makes all three layers overlap. Keep the exact table
  // itself, but let it follow the title in normal flow.
  table.xml = table.xml.replace(/<w:tblpPr\b[^>]*\/>/, "");
  table.xml = patchCell(table.xml, 0, 4, "Серия и номер бланка");
  table.xml = patchRow(table.xml, 2, [
    "[[N]]",
    "[[DOCUMENT_ISSUER]]",
    "[[PROGRAM_GROUP]]",
    "[[REGISTRATION_NUMBER_ISSUE_DATE]]",
    "[[SERIES_NUMBER]]",
    "[[STUDENT_NAME]]",
    "[[BIRTH_DATE]]",
    "[[GENDER]]",
    "[[IDENTITY_DOCUMENT]]",
    "[[CITIZENSHIP]]",
    "[[COMPLETION_ORDER]]",
    "[[DIRECTOR_SIGN]]",
    "[[RECIPIENT_SIGN]]",
    "[[TRUSTEE_SIGN]]",
    "[[LOSS_NOTE]]",
    "[[DUPLICATE_SIGN]]",
  ]);

  const section = parts.elements.find((element) => element.tag === "w:sectPr");
  if (!section) throw new Error("Registration section properties not found");
  section.xml = section.xml.replace(/<w:pgMar\b[^>]*\/>/, (node) =>
    node
      .replace(/w:top="\d+"/, 'w:top="4600"')
      .replace(/w:right="\d+"/, 'w:right="600"')
      .replace(/w:left="\d+"/, 'w:left="600"'),
  );
}

async function attachClientGoreltechHeader(zip, documentXml, definition) {
  const sourceBytes = fs.readFileSync(path.join(sourceDir, definition.headerSource));
  const sourceZip = await JSZip.loadAsync(sourceBytes);
  const sourceHeaderFile = sourceZip.file(definition.headerPart);
  const sourceHeaderRelsFile = sourceZip.file(definition.headerRelsPart);
  const sourceHeaderImageFile = sourceZip.file("word/media/image1.jpeg");
  if (!sourceHeaderFile || !sourceHeaderRelsFile || !sourceHeaderImageFile) {
    throw new Error(`Header source package is incomplete: ${definition.headerSource}`);
  }

  // The source header is the exact client A4-landscape banner. Scale its
  // drawing proportionally to the A3-landscape registration book and keep the
  // original image bytes unchanged.
  const a3ToA4LandscapeScale = 23811 / 16838;
  let headerXml = await sourceHeaderFile.async("string");
  headerXml = headerXml
    .replace('w:left="-851"', 'w:left="-600"')
    .replace(/\bcx="(\d+)"/g, (_match, value) =>
      `cx="${Math.round(Number(value) * a3ToA4LandscapeScale)}"`,
    )
    .replace(/\bcy="(\d+)"/g, (_match, value) =>
      `cy="${Math.round(Number(value) * a3ToA4LandscapeScale)}"`,
    );
  zip.file("word/header1.xml", headerXml, { date: sourceHeaderFile.date });
  zip.file(
    "word/_rels/header1.xml.rels",
    await sourceHeaderRelsFile.async("uint8array"),
    { date: sourceHeaderRelsFile.date },
  );
  zip.file(
    "word/media/image1.jpeg",
    await sourceHeaderImageFile.async("uint8array"),
    { date: sourceHeaderImageFile.date },
  );

  const contentTypesFile = zip.file("[Content_Types].xml");
  const relationsFile = zip.file("word/_rels/document.xml.rels");
  if (!contentTypesFile || !relationsFile) throw new Error("Registration DOCX relationships are missing");

  let contentTypes = await contentTypesFile.async("string");
  if (!/Extension="jpeg"/i.test(contentTypes)) {
    contentTypes = contentTypes.replace(
      "</Types>",
      '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>',
    );
  }
  if (!/PartName="\/word\/header1\.xml"/i.test(contentTypes)) {
    contentTypes = contentTypes.replace(
      "</Types>",
      '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>',
    );
  }
  zip.file("[Content_Types].xml", contentTypes, { date: contentTypesFile.date });

  let relations = await relationsFile.async("string");
  const existingHeaderRelationship = relations.match(
    /<Relationship\b[^>]*Id="([^"]+)"[^>]*Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/header"[^>]*Target="header1\.xml"[^>]*\/>/,
  );
  const headerRelationshipId = existingHeaderRelationship?.[1] || "rIdGoreltechHeader";
  if (!existingHeaderRelationship) {
    relations = relations.replace(
      "</Relationships>",
      '<Relationship Id="rIdGoreltechHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>',
    );
  }
  zip.file("word/_rels/document.xml.rels", relations, { date: relationsFile.date });

  if (/<w:headerReference\b[^>]*w:type="default"[^>]*\/>/.test(documentXml)) {
    documentXml = documentXml.replace(
      /<w:headerReference\b([^>]*?)w:type="default"([^>]*?)r:id="[^"]+"([^>]*?)\/>/,
      `<w:headerReference$1w:type="default"$2r:id="${headerRelationshipId}"$3/>`,
    );
  } else {
    documentXml = documentXml.replace(
      /(<w:sectPr\b[^>]*>)/,
      `$1<w:headerReference w:type="default" r:id="${headerRelationshipId}"/>`,
    );
  }
  return documentXml;
}

function patchTitlePage(parts) {
  replaceParagraph(parts.elements, "Учебный центр Общества", "[[ORG_HEADER_LINE_1]]");
  replaceParagraph(parts.elements, "ООО «ИЦ", "[[ORG_HEADER_LINE_2]]");
  replaceParagraph(parts.elements, "№ 1-ПК", "№ [[GROUP_NUMBER]]");
  replaceParagraph(parts.elements, "По программе", "По программе: [[PROGRAM_TITLE]]");
  replaceParagraph(
    parts.elements,
    "Сроки проведения",
    "Сроки проведения с [[START_DATE]] по [[END_DATE]]",
  );
  replaceParagraph(parts.elements, "г. Санкт-Петербург", "г. [[ORG_CITY]] [[YEAR]] г.");
}

function patchPass(parts) {
  replaceParagraph(parts.elements, "Группа обучающихся", "Группа обучающихся № [[GROUP_NUMBER]]");
  replaceParagraph(parts.elements, "курса", "курса «[[PROGRAM_TITLE]]»");
  replaceParagraph(parts.elements, "часов", "[[PROGRAM_HOURS]] часов");
  replaceParagraph(parts.elements, "Количество человек", "Количество человек: [[STUDENTS_COUNT]]");
  replaceParagraph(parts.elements, "Номер договора", "[[CONTRACT_BASIS_LINE]]");
  const table = parts.elements.find((element) => element.tag === "w:tbl");
  if (!table) throw new Error("Pass table not found");
  ["[[DAY1_DATE]]", "[[DAY2_DATE]]", "[[DAY3_DATE]]", "[[DAY4_DATE]]"].forEach(
    (token, index) => {
      table.xml = patchCell(table.xml, 1, index + 5, token);
    },
  );
  table.xml = patchRow(table.xml, 2, [
    "[[N]]",
    "[[STUDENT_NAME]]",
    "[[COMPANY]]",
    "[[EMAIL]]",
    "[[PHONE]]",
    "[[DAY_1]]",
    "[[DAY_2]]",
    "[[DAY_3]]",
    "[[DAY_4]]",
  ]);
  table.xml = constrainTable(table.xml, 9300, 13);
  insertBeforeSection(parts.elements, [
    paragraphXml(
      "[[SIGNATORY_POSITION]] ________________________________ / [[SIGNATORY_SHORT]] /",
      { after: 0 },
    ),
  ]);
}

const definitions = {
  enrollment_order: {
    source: "enrollment_order.source.docx",
    orientation: "landscape",
    row_source_key: "students_list_rows",
    row_tokens: ["N", "STUDENT_NAME", "STUDENT_PROGRAM", "STUDENT_HOURS", "STUDENT_PERIOD", "STUDENT_BASIS"],
    repeater: { table_index: 0, header_rows: 2, prototype_row: 2, continuation_row: 3, minimum_rows: 6 },
    patch: patchEnrollment,
  },
  expulsion_order: {
    source: "expulsion_order.source.docx",
    orientation: "landscape",
    row_source_key: "students_list_rows",
    row_tokens: ["N", "STUDENT_NAME", "STUDENT_PROGRAM", "STUDENT_HOURS", "STUDENT_PERIOD", "STUDENT_BASIS"],
    repeater: { table_index: 0, header_rows: 2, prototype_row: 2, continuation_row: 3, minimum_rows: 6 },
    patch: patchExpulsion,
  },
  student_list: {
    source: "student_list.source.docx",
    orientation: "portrait",
    row_source_key: "student_list_detail_rows",
    row_tokens: ["N", "STUDENT_NAME", "EMAIL", "PASSPORT_SERIES", "PASSPORT_NUMBER", "EDUCATION"],
    repeater: { table_index: 0, header_rows: 2, prototype_row: 2, minimum_rows: 6 },
    patch: patchStudentList,
    portrait: true,
  },
  schedule: {
    source: "schedule.source.docx",
    orientation: "portrait",
    row_source_key: null,
    row_tokens: [],
    repeater: null,
    patch: patchSchedule,
    portrait: true,
  },
  attestation_sheet: {
    source: "attestation_sheet.source.docx",
    orientation: "portrait",
    row_source_key: "attestation_rows",
    row_tokens: ["N", "STUDENT_NAME", "PERCENT", "GRADE"],
    repeater: { table_index: 0, header_rows: 1, prototype_row: 1, minimum_rows: 6 },
    patch: patchAttestation,
  },
  registration_book: {
    source: "registration_book.source.docx",
    orientation: "landscape",
    row_source_key: "registration_rows",
    row_tokens: [
      "N",
      "DOCUMENT_ISSUER",
      "PROGRAM_GROUP",
      "REGISTRATION_NUMBER_ISSUE_DATE",
      "SERIES_NUMBER",
      "STUDENT_NAME",
      "BIRTH_DATE",
      "GENDER",
      "IDENTITY_DOCUMENT",
      "CITIZENSHIP",
      "COMPLETION_ORDER",
      "DIRECTOR_SIGN",
      "RECIPIENT_SIGN",
      "TRUSTEE_SIGN",
      "LOSS_NOTE",
      "DUPLICATE_SIGN",
    ],
    repeater: { table_index: 0, header_rows: 2, prototype_row: 2, minimum_rows: 4 },
    patch: patchRegistration,
    repairHeader: true,
    headerSource: "enrollment_order.source.docx",
    headerPart: "word/header2.xml",
    headerRelsPart: "word/_rels/header2.xml.rels",
  },
  title_page: {
    source: "title_page.source.docx",
    orientation: "portrait",
    row_source_key: null,
    row_tokens: [],
    repeater: null,
    patch: patchTitlePage,
  },
  pass: {
    source: "pass.source.docx",
    orientation: "portrait",
    row_source_key: "pass_rows",
    row_tokens: ["N", "STUDENT_NAME", "COMPANY", "EMAIL", "PHONE", "DAY_1", "DAY_2", "DAY_3", "DAY_4"],
    repeater: { table_index: 0, header_rows: 2, prototype_row: 2, minimum_rows: 6 },
    patch: patchPass,
    portrait: true,
  },
};

function manifest(docType, definition, sourceHash, headerSourceHash = null) {
  const repairsHeader = definition.repairHeader === true;
  return {
    schema_version: 1,
    template_id: `goreltech.group.${docType}`,
    template_version: VERSION,
    scenario: `group_${docType}`,
    source_filename: definition.source,
    source_sha256: sourceHash,
    ...(repairsHeader
      ? {
          header_source_filename: definition.headerSource,
          header_source_part: definition.headerPart,
          header_source_rels_part: definition.headerRelsPart,
          header_source_sha256: headerSourceHash,
        }
      : {}),
    fidelity_status: "client_source_with_telemost_corrections",
    source_evidence:
      "Client archive «для сайта (1).zip» received 2026-08-15; corrections from Telemost chat dated 2026-08-12",
    orientation: definition.orientation,
    row_source_key: definition.row_source_key,
    row_tokens: definition.row_tokens,
    repeater: definition.repeater
      ? { ...definition.repeater, strategy: "clone_prototype_preserve_minimum_rows" }
      : null,
    changes_applied: [
      repairsHeader
        ? "full GORELTECH header restored from the exact client landscape-order source"
        : "full GORELTECH header retained from the client source",
      "client wording and signature corrections from Telemost applied",
      "portrait/landscape mode follows the Telemost instruction",
      "the original blank-form row capacity is preserved without inventing names or marks",
      "all runtime values use explicit tokens; no sample person remains",
    ],
    qa: {
      inspect_all_pages: true,
      preserve_package_parts_except: repairsHeader
        ? [
            "[Content_Types].xml",
            "word/document.xml",
            "word/_rels/document.xml.rels",
            "word/header1.xml",
            "word/_rels/header1.xml.rels",
            "word/media/image1.jpeg",
          ]
        : ["word/document.xml"],
      status: "passed_all_rendered_pages_2026-08-15",
    },
  };
}

async function buildOne(docType, definition) {
  const sourcePath = path.join(sourceDir, definition.source);
  const sourceBytes = fs.readFileSync(sourcePath);
  const zip = await JSZip.loadAsync(sourceBytes);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error(`${definition.source}: no word/document.xml`);
  const documentDate = documentFile.date;
  const parts = bodyParts(await documentFile.async("string"));
  definition.patch(parts);
  let documentXml = parts.prefix + parts.elements.map((element) => element.xml).join("") + parts.suffix;
  if (definition.portrait) documentXml = setPortrait(documentXml);
  if (definition.repairHeader) {
    documentXml = await attachClientGoreltechHeader(zip, documentXml, definition);
  }

  const unresolved = Array.from(documentXml.matchAll(/\[\[([A-Z0-9_]+)\]\]/g)).map(
    (match) => match[1],
  );
  if (!unresolved.length) throw new Error(`${docType}: no runtime tokens inserted`);
  zip.file("word/document.xml", documentXml, {
    date: documentDate,
    compression: "DEFLATE",
  });

  const templateBytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const headerSourceHash = definition.repairHeader
    ? sha256(fs.readFileSync(path.join(sourceDir, definition.headerSource)))
    : null;
  const docManifest = manifest(
    docType,
    definition,
    sha256(sourceBytes),
    headerSourceHash,
  );
  docManifest.template_sha256 = sha256(templateBytes);
  return { templateBytes, manifest: docManifest };
}

fs.mkdirSync(templateDir, { recursive: true });
fs.mkdirSync(manifestDir, { recursive: true });
const bundle = {};

for (const [docType, definition] of Object.entries(definitions)) {
  const built = await buildOne(docType, definition);
  fs.writeFileSync(path.join(templateDir, `${docType}.docx`), built.templateBytes);
  fs.writeFileSync(
    path.join(manifestDir, `${docType}.json`),
    `${JSON.stringify(built.manifest, null, 2)}\n`,
    "utf8",
  );
  bundle[docType] = {
    templateBase64: built.templateBytes.toString("base64"),
    manifestJson: JSON.stringify(built.manifest),
  };
}

fs.writeFileSync(
  path.join(outputDir, "embedded.ts"),
  "// Generated by scripts/build-group-document-templates.mjs. Do not edit manually.\n" +
    `export const GROUP_DOCUMENT_TEMPLATE_BUNDLE = ${JSON.stringify(bundle)} as const;\n`,
  "utf8",
);

process.stdout.write(
  `${JSON.stringify({ templates: Object.keys(definitions), version: VERSION, outputDir }, null, 2)}\n`,
);
