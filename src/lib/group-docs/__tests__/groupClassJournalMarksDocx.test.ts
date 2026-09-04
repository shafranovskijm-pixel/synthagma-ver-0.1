import { createHash } from "node:crypto";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  buildGroupClassJournalMarks, type GroupClassJournalMarkRow,
} from "../../../../supabase/functions/_shared/docx-ooxml/groupClassJournalMarks";
import {
  compileClassJournalXml, formatJournalDate, type ClassJournalManifest,
} from "../../../../supabase/functions/_shared/docx-ooxml/classJournal";
import { findUnresolvedTokens } from "../../../../supabase/functions/_shared/docx-ooxml/xml";
import {
  CLASS_JOURNAL_MANIFEST_JSON, CLASS_JOURNAL_TEMPLATE_BASE64,
} from "../../../../supabase/functions/_shared/group-doc-templates/goreltech/class-journal/v1/embedded";

describe("saved group marks → retained class journal DOCX", () => {
  it.each(["data", "blank", "unavailable"] as const)("compiles %s without changing the original package layout", async mode => {
    const bytes = Buffer.from(CLASS_JOURNAL_TEMPLATE_BASE64, "base64");
    const manifest = JSON.parse(CLASS_JOURNAL_MANIFEST_JSON) as ClassJournalManifest;
    expect(createHash("sha256").update(bytes).digest("hex").toUpperCase()).toBe(manifest.template_sha256);
    const original = await JSZip.loadAsync(bytes);
    const output = await JSZip.loadAsync(bytes);
    const originalXml = await original.file("word/document.xml")!.async("string");
    const dates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];
    const rawMarks = ["Н", "ОП", "<&>", " 🟢 "];
    const marks: GroupClassJournalMarkRow[] = rawMarks.map((mark, i) => ({
      id: `mark-${i}`, organization_id: "org", group_id: "group", user_id: "learner",
      slot: i + 1, source_date: dates[i], course_id: "course", mark, revision: i + 1,
      updated_at: "2026-09-04T10:00:00Z", updated_by: "teacher",
    }));
    const fillMode = mode === "blank" ? "blank" : "data";
    const facts = buildGroupClassJournalMarks({
      fillMode,
      snapshot: {
        organization: { id: "org" },
        group: { id: "group", organization_id: "org", course_id: "course", training_dates: dates },
        profiles: [
          { user_id: "learner", full_name: "Тестовый Слушатель", organization_id: "org", student_group_id: "group", archived_at: null },
          { user_id: "unmarked", full_name: "Участник Без Отметок", organization_id: "org", student_group_id: "group", archived_at: null },
        ],
        source: {
          rows: [...marks, { ...marks[0], id: "inactive", user_id: "left-group", mark: "LEFT" }],
          sourceAvailable: mode !== "unavailable", sourceIssues: [],
        },
        // Arbitrary browser markup is not part of the server facts contract.
        ...{ html: "<tr>BROWSER_MARK</tr>", MARK_1: "BROWSER_MARK" },
      },
    });
    const compiledXml = compileClassJournalXml({
      documentXml: originalXml, manifest, fillMode,
      snapshot: {
        scalars: {
          GROUP_NUMBER: "ДЕМО-01", PROGRAM_TITLE: "Серверная программа <А> & Б", PROGRAM_HOURS: "32",
          INSTRUCTOR_SHORT: "И.И. Иванов", SIGNATORY_POSITION: "Руководитель", SIGNATORY_SHORT: "Иванов И.И.",
          ...Object.fromEntries(dates.map((date, i) => [`DATE_${i + 1}`, formatJournalDate(date)])),
        },
        students: facts.students,
      },
    });
    output.file("word/document.xml", compiledXml);
    const reloaded = await JSZip.loadAsync(await output.generateAsync({ type: "nodebuffer" }));
    const writtenXml = await reloaded.file("word/document.xml")!.async("string");
    const doc = new DOMParser().parseFromString(writtenXml, "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(findUnresolvedTokens(writtenXml)).toEqual([]);
    expect(writtenXml).toContain("Серверная программа &lt;А&gt; &amp; Б");
    expect(writtenXml).not.toMatch(/BROWSER_MARK|LEFT/);
    const repeater = manifest.repeaters.students;
    const table = doc.getElementsByTagName("w:tbl")[repeater.table_index];
    const rows = Array.from(table.getElementsByTagName("w:tr"));
    const cells = (rowIndex: number) => Array.from(rows[rowIndex].getElementsByTagName("w:tc"))
      .map(cell => Array.from(cell.getElementsByTagName("w:t")).map(text => text.textContent).join(""));
    const studentCells = cells(repeater.header_rows);
    expect(studentCells[1]).toBe("Тестовый Слушатель");
    expect(studentCells.slice(2, 6)).toEqual(mode === "data" ? rawMarks : ["", "", "", ""]);
    expect(cells(repeater.header_rows + 1)[1]).toBe("Участник Без Отметок");
    expect(cells(repeater.header_rows + 1).slice(2, 6)).toEqual(["", "", "", ""]);
    if (mode === "data") {
      expect(facts.markSources).toEqual(marks);
      expect(facts.attendanceSource).toBe("saved_manual_marks");
    } else expect(facts.markSources).toEqual([]);
    for (const date of dates) expect(writtenXml).toContain(formatJournalDate(date));
    // Retained sections contain orientation, margins and header/footer relationships.
    expect(writtenXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g))
      .toEqual(originalXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g));
    expect(Object.keys(reloaded.files).sort()).toEqual(Object.keys(original.files).sort());
    for (const [path, entry] of Object.entries(original.files)) {
      if (entry.dir || path === "word/document.xml") continue;
      expect(await reloaded.file(path)!.async("nodebuffer"), path).toEqual(await entry.async("nodebuffer"));
    }
  }, 15000);
});
