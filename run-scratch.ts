import fs from "fs";
import JSZip from "jszip";
import { compileDocumentXml, parseBodyElements, curriculumTitleOfSection } from "./supabase/functions/_shared/docx-ooxml/compile.ts";
import { formatMoneyRu, moneyToWordsRu } from "./supabase/functions/_shared/docx-ooxml/money.ts";

const dir = "./supabase/functions/_shared/contract-templates/goreltech/company/v1";
const manifest = JSON.parse(fs.readFileSync(dir + "/manifest.json", "utf8"));
const buf = fs.readFileSync(dir + "/template.docx");
const zip = await JSZip.loadAsync(buf);
const docXml = await zip.file("word/document.xml")!.async("string");

const { elements } = parseBodyElements(docXml);
const cat = manifest.conditional_sections.curricula.catalog;
for (const [k, v] of Object.entries<any>(cat)) console.log(k, "=>", curriculumTitleOfSection(elements, v.section_index));
console.log("sections", Math.max(...elements.map(e=>e.sectionIndex)), "tables", elements.filter(e=>e.tableIndex!==null).length);

const title = curriculumTitleOfSection(elements, 2);
const amount = 15000;
const scalars: Record<string,string> = {};
for (const v of manifest.variables) if (!v.scope) scalars[v.token.slice(2,-2)] = "X-" + v.key;
Object.assign(scalars, { PRICE_NUM: formatMoneyRu(amount), PRICE_WORDS: moneyToWordsRu(amount) });
const students = [1,2,3].map(i => ({ STUDENT_FIO:`Иванов И${i}`, STUDENT_EDU:"высшее", STUDENT_CONTACTS:"a@b.ru\n+7", STUDENT_POSITION:"инженер", STUDENT_ADDRESS:"СПб", STUDENT_PROGRAM:title, STUDENT_DATES:"03.08.2026 — 07.08.2026" }));
const res = compileDocumentXml({ documentXml: docXml, manifest, snapshot: {
  scalars, programs: [{ PROG_TITLE: title, PROG_FORM: "Очная", PROG_COUNT: "3" }], students,
  curricula: [title], totalAmount: amount, taxClauseExplicit: true } });
console.log("kept", res.keptCurricula, "dropped", res.droppedCurricula);
console.log("unresolved", (res.documentXml.match(/\[\[[A-Z_0-9]+\]\]/g)||[]).length);
zip.file("word/document.xml", res.documentXml);
const out = await zip.generateAsync({ type: "nodebuffer" });
fs.writeFileSync("/tmp/h/out.docx", out);
console.log("bytes", out.length);
