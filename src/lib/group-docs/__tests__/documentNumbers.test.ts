import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  docNumberSequenceKey,
  formatGroupDocumentNumber,
  requiresDocumentNumber,
  reserveGroupDocumentNumbers,
  typesRequiringReservation,

} from "../documentNumbers";
import { generateDocument } from "../generate";
import { pickPassportIdentityDoc } from "../factualResolvers";
import { buildVariables } from "../variables";
import { SAMPLE_CONTEXT } from "../sampleContext";
import { GORELTECH_ORGANIZATION_ID } from "../clientProfile";

/** Серверная последовательность: состояние живёт в БД, а не в модуле. */
function fakeServer() {
  const state = new Map<string, number>();
  return async (seqKey: string, year: number) => {
    const k = `${seqKey}:${year}`;
    const next = (state.get(k) || 0) + 1;
    state.set(k, next);
    return next;
  };
}

describe("нумерация документов группы", () => {
  it("приказы — УЦ-N/YYYY, договор — YYYY-NNN, только серверный N", () => {
    expect(formatGroupDocumentNumber("enrollment_order", 4, 2026)).toBe("УЦ-4/2026");
    expect(formatGroupDocumentNumber("expulsion_order", 12, 2026)).toBe("УЦ-12/2026");
    expect(formatGroupDocumentNumber("contract", 7, 2026)).toBe("2026-007");
    expect(() => formatGroupDocumentNumber("enrollment_order", 0, 2026)).toThrow();
  });

  it("номер обязателен только для приказов и договора", () => {
    expect(requiresDocumentNumber("enrollment_order")).toBe(true);
    expect(requiresDocumentNumber("contract")).toBe(true);
    expect(requiresDocumentNumber("class_journal")).toBe(false);
    expect(docNumberSequenceKey("contract")).toBe("group_contract");
    expect(docNumberSequenceKey("enrollment_order")).toBe("group_order");
  });

  it("два последовательных вызова (в т.ч. после reload) дают разные номера", async () => {
    const reserve = fakeServer();
    const first = await reserveGroupDocumentNumbers(["enrollment_order", "class_journal"], 2026, reserve);
    const second = await reserveGroupDocumentNumbers(["enrollment_order"], 2026, reserve);
    expect(first.enrollment_order).toBe("УЦ-1/2026");
    expect(second.enrollment_order).toBe("УЦ-2/2026");
    // документы без обязательного номера номер не тратят
    expect(first.class_journal).toBeUndefined();
  });

  it("ошибка RPC нумерации прерывает генерацию до сохранения", async () => {
    const reserve = vi.fn().mockRejectedValue(new Error("rpc down"));
    await expect(
      reserveGroupDocumentNumbers(["enrollment_order"], 2026, reserve),
    ).rejects.toThrow("rpc down");
  });

  it("черновик номерного документа остаётся без номера, final требует серверный номер", () => {
    const ctx = structuredClone(SAMPLE_CONTEXT);

    // Бланк/черновик: номер не нужен и не подставляется, даже если передан.
    const draft = generateDocument(ctx, "enrollment_order", {});
    expect(draft.doc_status).toBe("draft");
    expect(draft.document_number).toBe("");
    const draftWithNumber = generateDocument(ctx, "enrollment_order", {
      numbers: { enrollment_order: "УЦ-5/2026" },
    });
    expect(draftWithNumber.document_number).toBe("");
    expect(draftWithNumber.name).not.toContain("УЦ-5/2026");

    const journal = generateDocument(ctx, "class_journal", {});
    expect(journal.document_number).toBe("");

    // Final без зарезервированного номера — fail-closed.
    expect(() =>
      generateDocument(ctx, "enrollment_order", { mode: "data", requestedStatus: "final" }),
    ).toThrow(/не зарезервирован/);

    const final = generateDocument(ctx, "enrollment_order", {
      mode: "data",
      requestedStatus: "final",
      numbers: { enrollment_order: "УЦ-5/2026" },
    });
    expect(final.doc_status).toBe("final");
    expect(final.document_number).toBe("УЦ-5/2026");
  });

  it("резервирование только для документов, которые действительно станут final", async () => {
    const reserve = vi.fn(fakeServer());

    // Бланк-пакет: ни одного вызова серверной нумерации.
    const blank = typesRequiringReservation(["contract", "enrollment_order", "class_journal"], {
      mode: "blank",
      requestedStatus: "draft",
      finalBlocked: () => false,
    });
    expect(blank).toEqual([]);
    await reserveGroupDocumentNumbers(blank, 2026, reserve);
    expect(reserve).toHaveBeenCalledTimes(0);

    // Документ, который readiness понизит до черновика, номер не тратит.
    const blocked = typesRequiringReservation(["contract", "enrollment_order"], {
      mode: "data",
      requestedStatus: "final",
      finalBlocked: t => t === "contract",
    });
    expect(blocked).toEqual(["enrollment_order"]);

    // Готовые final-приказы получают ровно по одному номеру.
    const ready = typesRequiringReservation(["contract", "enrollment_order", "class_journal"], {
      mode: "data",
      requestedStatus: "final",
      finalBlocked: () => false,
    });
    expect(ready).toEqual(["contract", "enrollment_order"]);
    const nums = await reserveGroupDocumentNumbers(ready, 2026, reserve);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(nums.contract).toBe("2026-001");
    expect(nums.enrollment_order).toBe("УЦ-1/2026");
  });

  it("сбой RPC нумерации: ничего не генерируется и не сохраняется", async () => {
    const reserve = vi.fn().mockRejectedValue(new Error("rpc down"));
    const types = typesRequiringReservation(["enrollment_order"], {
      mode: "data",
      requestedStatus: "final",
      finalBlocked: () => false,
    });
    await expect(reserveGroupDocumentNumbers(types, 2026, reserve)).rejects.toThrow("rpc down");
    // Без номеров final сгенерировать нельзя — вставка невозможна.
    expect(() =>
      generateDocument(structuredClone(SAMPLE_CONTEXT), "enrollment_order", {
        mode: "data",
        requestedStatus: "final",
      }),
    ).toThrow(/не зарезервирован/);
  });

});

describe("create_group_document_batch сериализует параллельные пакеты", () => {
  it("advisory lock берётся ДО чтения MAX(package_version)", () => {
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const definition = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?create_group_document_batch\s*\(/i;
    // Search newest first and stop at the current definition. Reading every
    // historical migration caused I/O timeouts in the full Windows test run.
    const file = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .reverse()
      .find((f) => definition.test(fs.readFileSync(path.join(dir, f), "utf8")));
    expect(file, "current create_group_document_batch definition").toBeDefined();
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const lock = sql.indexOf("pg_advisory_xact_lock");
    const max = sql.indexOf("MAX(gd.package_version)");
    expect(lock).toBeGreaterThan(-1);
    expect(max).toBeGreaterThan(lock);
  });
});

describe("нет выдуманных production-defaults", () => {
  it("гражданство пустое, если его нет в данных ученика", () => {
    const ctx = structuredClone(SAMPLE_CONTEXT);
    ctx.students = ctx.students.map((s) => ({ ...s, citizenship: undefined }));
    const vars = buildVariables(ctx, { documentNumber: "", documentDate: "2026-08-05" });
    expect(vars.individual_citizenship).toBe("");
  });

  it("не подставляет чужую должность руководителя обычной организации", () => {
    const ctx = structuredClone(SAMPLE_CONTEXT);
    ctx.organization.name = 'ЧОУ ДПО «Другая организация»';
    ctx.organization.inn = "0000000000";
    ctx.organization.director_position = "";
    ctx.group.program_form = "";
    const vars = buildVariables(ctx, { documentNumber: "", documentDate: "2026-08-05" });
    expect(vars.org_director_position).toBe("");
    expect(vars.program_form).toBe("");
  });

  it("для ГОРЭЛТЕХ оставляет графу основания пустой для ручного заполнения", () => {
    const ctx = structuredClone(SAMPLE_CONTEXT);
    ctx.organization.id = GORELTECH_ORGANIZATION_ID;
    ctx.extras = { ...(ctx.extras || {}), contract_basis: "Договор № 2026-123" };
    const vars = buildVariables(ctx, {
      documentNumber: "УЦ-10/2026",
      documentDate: "2026-08-07",
    });
    expect(vars.students_list_rows).not.toContain("Договор № 2026-123");
    expect(vars.students_list_rows).not.toContain("Договор № УЦ-10/2026");
  });

  it("для обычной организации сохраняет явно переданное основание", () => {
    const ctx = structuredClone(SAMPLE_CONTEXT);
    ctx.organization.name = 'ЧОУ ДПО «Другая организация»';
    ctx.organization.inn = "0000000000";
    ctx.extras = { ...(ctx.extras || {}), contract_basis: "Договор № 2026-123" };
    const vars = buildVariables(ctx, {
      documentNumber: "УЦ-10/2026",
      documentDate: "2026-08-07",
    });
    expect(vars.students_list_rows).toContain("Договор № 2026-123");
    expect(vars.students_list_rows).not.toContain("Договор № УЦ-10/2026");
  });

  it("дата в приказе не получает вторую точку", () => {
    const doc = generateDocument(structuredClone(SAMPLE_CONTEXT), "enrollment_order", {
      mode: "data",
      requestedStatus: "final",
      documentDate: "2026-08-07",
      numbers: { enrollment_order: "УЦ-10/2026" },
    });
    expect(doc.html).not.toContain("г..</p>");
  });
});

describe("выбор паспорта среди нескольких identity-документов", () => {
  it("берёт документ типа паспорт детерминированно", () => {
    const rows = [
      { document_type: "СНИЛС", series: "", number: "123-456" },
      { document_type: "Водительское удостоверение", series: "99", number: "111" },
      { document_type: "Паспорт РФ", series: "25 04", number: "654321" },
      { document_type: "passport", series: "25 03", number: "111111" },
    ];
    const picked = pickPassportIdentityDoc(rows)!;
    expect(picked.number).toBe("111111"); // стабильная сортировка по series|number
    expect(pickPassportIdentityDoc(rows.slice(0, 2))).toBeNull();
    expect(pickPassportIdentityDoc([])).toBeNull();
  });
});
