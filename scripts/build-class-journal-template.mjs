import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(
  repoRoot,
  "supabase/functions/_shared/group-doc-templates/goreltech/class-journal/v1",
);
const sourcePath = process.argv[2] || path.join(
  repoRoot,
  "docs/group-documents/client-templates/goreltech-group-package-v1/source/class_journal.source.docx",
);

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();

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

function replaceTextNodes(xml, values) {
  let index = 0;
  return xml.replace(/(<w:t(?:\s[^>]*)?>)[\s\S]*?(<\/w:t>)/g, (node, open, close) => {
    if (index >= values.length || values[index] === null) {
      index += 1;
      return node;
    }
    const value = values[index];
    index += 1;
    return `${open}${value}${close}`;
  });
}

function replaceChild(parentXml, child, replacement) {
  return parentXml.slice(0, child.start) + replacement + parentXml.slice(child.end);
}

function constrainTable(tableXml, targetWidth, maxFontHalfPoints) {
  const widths = Array.from(tableXml.matchAll(/<w:gridCol\b[^>]*\bw:w="(\d+)"/g)).map(
    (match) => Number(match[1]),
  );
  const currentWidth = widths.reduce((sum, value) => sum + value, 0);
  if (!currentWidth) throw new Error("Journal table has no grid width");
  const factor = Math.min(1, targetWidth / currentWidth);
  let patched = tableXml
    .replace(/(<w:gridCol\b[^>]*\bw:w=")(-?\d+)(")/g, (_m, before, raw, after) =>
      `${before}${Math.max(1, Math.round(Number(raw) * factor))}${after}`,
    )
    .replace(/(<w:tcW\b[^>]*\bw:w=")(-?\d+)(")/g, (_m, before, raw, after) =>
      `${before}${Math.max(1, Math.round(Number(raw) * factor))}${after}`,
    )
    .replace(
      /<w:tblW\b[^>]*\/>/,
      `<w:tblW w:w="${Math.round(currentWidth * factor)}" w:type="dxa"/>`,
    );
  if (/<w:tblInd\b[^>]*\/>/.test(patched)) {
    patched = patched.replace(/<w:tblInd\b[^>]*\/>/, '<w:tblInd w:w="0" w:type="dxa"/>');
  } else {
    patched = patched.replace(/(<w:tblPr\b[^>]*>)/, '$1<w:tblInd w:w="0" w:type="dxa"/>');
  }
  return patched
    .replace(/(<w:sz\b[^>]*\bw:val=")([0-9]+)(")/g, (_m, before, raw, after) =>
      `${before}${Math.min(Number(raw), maxFontHalfPoints)}${after}`,
    )
    .replace(/(<w:szCs\b[^>]*\bw:val=")([0-9]+)(")/g, (_m, before, raw, after) =>
      `${before}${Math.min(Number(raw), maxFontHalfPoints)}${after}`,
    );
}

function patchTable(tableXml) {
  let rows = splitTopLevel(tableXml, ["w:tr"]);

  const patchCell = (rowIndex, cellIndex, values) => {
    const cells = splitTopLevel(rows[rowIndex].xml, ["w:tc"]);
    if (!cells[cellIndex]) throw new Error(`Missing table cell r${rowIndex}c${cellIndex}`);
    const cellXml = replaceTextNodes(cells[cellIndex].xml, values);
    const rowXml = replaceChild(rows[rowIndex].xml, cells[cellIndex], cellXml);
    tableXml = replaceChild(tableXml, rows[rowIndex], rowXml);
    rows = splitTopLevel(tableXml, ["w:tr"]);
  };

  ["[[DATE_1]]", "[[DATE_2]]", "[[DATE_3]]", "[[DATE_4]]"].forEach((token, i) => {
    patchCell(1, i + 2, [token, "", "", "", ""]);
  });
  patchCell(2, 0, ["[[N]]"]);
  patchCell(2, 1, ["[[STUDENT_NAME]]"]);
  ["[[MARK_1]]", "[[MARK_2]]", "[[MARK_3]]", "[[MARK_4]]"].forEach((token, i) => {
    patchCell(2, i + 2, [token]);
  });

  return constrainTable(tableXml, 9300, 15);
}

function patchDocumentXml(documentXml) {
  const bodyStart = documentXml.indexOf("<w:body>");
  const bodyEnd = documentXml.lastIndexOf("</w:body>");
  if (bodyStart < 0 || bodyEnd < 0) throw new Error("word/document.xml has no w:body");
  const prefixEnd = bodyStart + "<w:body>".length;
  const body = documentXml.slice(prefixEnd, bodyEnd);
  const elements = splitTopLevel(body, ["w:p", "w:tbl", "w:sectPr"]);

  const patchParagraph = (needle, values) => {
    const item = elements.find((el) => el.tag === "w:p" && elementText(el.xml).includes(needle));
    if (!item) throw new Error(`Paragraph not found: ${needle}`);
    item.xml = replaceTextNodes(item.xml, values);
  };

  patchParagraph("Журнал учета занятий", [
    "Журнал учета занятий Группа обучающихся ",
    "№ ",
    "[[GROUP_NUMBER]]",
    "",
    "",
    "",
  ]);
  patchParagraph("Курса повышения квалификации", [
    "Курса повышения квалификации ",
    "«[[PROGRAM_TITLE]]»",
  ]);
  patchParagraph("Количество учебных", [
    "Количество учебных ",
    "часов - [[PROGRAM_HOURS]]",
    "",
  ]);
  patchParagraph("Преподаватель", [
    "Преподаватели [[INSTRUCTOR_SHORT]] __________________________ Подпись __________________________",
    "",
    "",
    "",
    "",
    "",
  ]);
  patchParagraph("Руководитель учебного центра", [
    "[[SIGNATORY_POSITION]] [[SIGNATORY_SHORT]] __________________________________________",
    "",
  ]);

  const firstTable = elements.find((el) => el.tag === "w:tbl");
  if (!firstTable) throw new Error("Journal table not found");
  firstTable.xml = patchTable(firstTable.xml);

  const patchedBody = elements.map((el) => el.xml).join("");
  const patched = (
    documentXml.slice(0, prefixEnd) + patchedBody + documentXml.slice(bodyEnd)
  ).replace(/<w:pgSz\b[^>]*\/>/g, (node) => {
    let next = node
      .replace(/\s+w:orient="[^"]*"/g, "")
      .replace(/w:w="\d+"/, 'w:w="11906"')
      .replace(/w:h="\d+"/, 'w:h="16838"');
    if (!/w:w="/.test(next)) next = next.replace(/\/>$/, ' w:w="11906"/>');
    if (!/w:h="/.test(next)) next = next.replace(/\/>$/, ' w:h="16838"/>');
    return next;
  });
  const expected = [
    "[[GROUP_NUMBER]]",
    "[[PROGRAM_TITLE]]",
    "[[PROGRAM_HOURS]]",
    "[[INSTRUCTOR_SHORT]]",
    "[[SIGNATORY_POSITION]]",
    "[[SIGNATORY_SHORT]]",
    "[[DATE_1]]",
    "[[DATE_2]]",
    "[[DATE_3]]",
    "[[DATE_4]]",
    "[[N]]",
    "[[STUDENT_NAME]]",
    "[[MARK_1]]",
    "[[MARK_2]]",
    "[[MARK_3]]",
    "[[MARK_4]]",
  ];
  for (const token of expected) {
    if (!patched.includes(token)) throw new Error(`Token was not inserted: ${token}`);
  }
  return patched;
}

const sourceBytes = fs.readFileSync(path.resolve(sourcePath));
const sourceHash = sha256(sourceBytes);
const zip = await JSZip.loadAsync(sourceBytes);
const documentFile = zip.file("word/document.xml");
if (!documentFile) throw new Error("Source DOCX has no word/document.xml");
const documentDate = documentFile.date;
zip.file("word/document.xml", patchDocumentXml(await documentFile.async("string")), {
  date: documentDate,
  compression: "DEFLATE",
});

const templateBytes = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 6 },
});
const templateHash = sha256(templateBytes);

const manifest = {
  schema_version: 1,
  template_id: "goreltech.group.class_journal",
  template_version: "1.2.0-client-source",
  scenario: "group_class_journal",
  source_filename: "class_journal.source.docx",
  source_sha256: sourceHash,
  template_sha256: templateHash,
  fidelity_status: "client_source_with_telemost_corrections",
  source_evidence:
    "Client archive «для сайта (1).zip» received 2026-08-15; corrections from Telemost chat dated 2026-08-12",
  render_policy: "filled_docx_is_the_single_source_for_preview_pdf_and_download",
  variables: [
    { token: "[[GROUP_NUMBER]]", key: "group.number", type: "string", source: "student_groups.group_number", required: true },
    { token: "[[PROGRAM_TITLE]]", key: "program.title", type: "string", source: "student_groups.program_title_or_linked_course", required: true },
    { token: "[[PROGRAM_HOURS]]", key: "program.hours", type: "integer", source: "student_groups.program_hours_or_linked_course", required: true },
    { token: "[[INSTRUCTOR_SHORT]]", key: "group.instructor.short_name", type: "person_name", source: "student_groups.instructor_name", required: true },
    { token: "[[SIGNATORY_POSITION]]", key: "document.signatory.position", type: "string", source: "request_or_organizations.director_position", required: false },
    { token: "[[SIGNATORY_SHORT]]", key: "document.signatory.short_name", type: "person_name", source: "request_or_organizations.director_name", required: false },
    { token: "[[DATE_1]]", key: "group.training_dates[0]", type: "date", source: "student_groups.training_dates", required: true },
    { token: "[[DATE_2]]", key: "group.training_dates[1]", type: "date", source: "student_groups.training_dates", required: true },
    { token: "[[DATE_3]]", key: "group.training_dates[2]", type: "date", source: "student_groups.training_dates", required: true },
    { token: "[[DATE_4]]", key: "group.training_dates[3]", type: "date", source: "student_groups.training_dates", required: true },
    { token: "[[N]]", key: "student.row_number", type: "integer", source: "computed", required: true, scope: "students[]" },
    { token: "[[STUDENT_NAME]]", key: "student.full_name", type: "person_name", source: "profiles.full_name", required: true, scope: "students[]" },
    { token: "[[MARK_1]]", key: "student.attendance[0]", type: "string", source: "attendance_or_blank", required: false, scope: "students[]" },
    { token: "[[MARK_2]]", key: "student.attendance[1]", type: "string", source: "attendance_or_blank", required: false, scope: "students[]" },
    { token: "[[MARK_3]]", key: "student.attendance[2]", type: "string", source: "attendance_or_blank", required: false, scope: "students[]" },
    { token: "[[MARK_4]]", key: "student.attendance[3]", type: "string", source: "attendance_or_blank", required: false, scope: "students[]" },
  ],
  repeaters: {
    students: {
      table_index: 0,
      header_rows: 2,
      prototype_row: 2,
      minimum_rows: 6,
      strategy: "clone_prototype_preserve_minimum_rows",
    },
  },
  constraints: {
    training_dates_exact_count: 4,
    attendance_default: "blank",
    no_inferred_instructor: true,
    no_silent_date_truncation: true,
  },
  blocking_rules: [
    "group number, program title, program hours and instructor are present",
    "exactly four explicit training dates are present because the retained client form has four date columns",
    "at least one student with a non-empty full name is present",
    "attendance marks are never inferred from course completion",
    "explicitly blank document signatory fields remain blank",
    "no unresolved token remains after compilation",
  ],
  qa: {
    orientation: "portrait",
    inspect_all_pages: true,
    preserve_package_parts_except: ["word/document.xml"],
    status: "passed_all_filled_pages_word_16_2026-08-24",
    renderer: "Microsoft Word 16.0 ExportAsFixedFormat",
    rendered_pages: 1,
    evidence:
      "docs/group-documents/client-templates/goreltech-group-package-v1/render-evidence-v1.1.md",
  },
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "template.docx"), templateBytes);
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({ source_sha256: sourceHash, template_sha256: templateHash, outputDir }, null, 2)}\n`);
