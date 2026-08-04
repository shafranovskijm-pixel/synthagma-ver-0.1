import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  docNumberSequenceKey,
  formatGroupDocumentNumber,
  requiresDocumentNumber,
  reserveGroupDocumentNumbers,
} from "../documentNumbers";
import { generateDocument } from "../generate";
import { pickPassportIdentityDoc } from "../factualResolvers";
import { buildVariables } from "../variables";
import { sampleContext } from "../sampleContext";

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

  it("generateDocument без серверного номера бросает для приказа, но не для журнала", () => {
    const ctx = sampleContext();
    expect(() => generateDocument(ctx, "enrollment_order", {})).toThrow(/не зарезервирован/);
    const journal = generateDocument(ctx, "class_journal", {});
    expect(journal.document_number).toBe("");
    const order = generateDocument(ctx, "enrollment_order", {
      numbers: { enrollment_order: "УЦ-5/2026" },
    });
    expect(order.document_number).toBe("УЦ-5/2026");
  });
});

describe("create_group_document_batch сериализует параллельные пакеты", () => {
  it("advisory lock берётся ДО чтения MAX(package_version)", () => {
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const file = fs
      .readdirSync(dir)
      .filter((f) => fs.readFileSync(path.join(dir, f), "utf8").includes("create_group_document_batch"))
      .sort()
      .pop()!;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const lock = sql.indexOf("pg_advisory_xact_lock");
    const max = sql.indexOf("MAX(gd.package_version)");
    expect(lock).toBeGreaterThan(-1);
    expect(max).toBeGreaterThan(lock);
  });
});

describe("нет выдуманных production-defaults", () => {
  it("гражданство пустое, если его нет в данных ученика", () => {
    const ctx = sampleContext();
    ctx.students = ctx.students.map((s) => ({ ...s, citizenship: undefined }));
    const vars = buildVariables(ctx, { documentNumber: "", documentDate: "2026-08-05" });
    expect(vars.individual_citizenship).toBe("");
  });

  it("должность руководителя и форма обучения не подставляются", () => {
    const ctx = sampleContext();
    ctx.organization.director_position = "";
    ctx.group.program_form = "";
    const vars = buildVariables(ctx, { documentNumber: "", documentDate: "2026-08-05" });
    expect(vars.org_director_position).toBe("");
    expect(vars.program_form).toBe("");
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
