/** Серверная реляционная валидация и согласованность манифеста/реестра. */
import { describe, expect, it } from "vitest";
import { validateExactContractRoster, validateRelations, validateTemplateConsistency } from "../../../../supabase/functions/_shared/docx-ooxml/relational";

const ORG = "11111111-1111-1111-1111-111111111111";
const OTHER_ORG = "22222222-2222-2222-2222-222222222222";
const GROUP = "33333333-3333-3333-3333-333333333333";
const OTHER_GROUP = "44444444-4444-4444-4444-444444444444";
const S1 = "55555555-5555-5555-5555-555555555555";
const S2 = "66666666-6666-6666-6666-666666666666";

const base = () => ({
  organizationId: ORG,
  companyId: "c1",
  groupId: GROUP as string | null,
  studentUserIds: [S1],
  studentsMetaIds: [S1],
  company: { id: "c1", organization_id: ORG },
  group: { id: GROUP, organization_id: ORG },
  profiles: [{ user_id: S1, organization_id: ORG, student_group_id: GROUP }],
});

describe("validateRelations", () => {
  it("пропускает согласованные связи", () => {
    expect(validateRelations(base())).toEqual({ ok: true, status: 200 });
  });

  it("отклоняет компанию другой организации с 403", () => {
    const r = validateRelations({ ...base(), company: { id: "c1", organization_id: OTHER_ORG } });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });

  it("отклоняет группу другой организации с 403", () => {
    const r = validateRelations({ ...base(), group: { id: GROUP, organization_id: OTHER_ORG } });
    expect(r.status).toBe(403);
  });

  it("отклоняет отсутствующую компанию и группу с 422", () => {
    expect(validateRelations({ ...base(), company: null }).status).toBe(422);
    expect(validateRelations({ ...base(), group: null }).status).toBe(422);
  });

  it("отклоняет слушателя из другой организации", () => {
    const r = validateRelations({
      ...base(),
      profiles: [{ user_id: S1, organization_id: OTHER_ORG, student_group_id: GROUP }],
    });
    expect(r.status).toBe(422);
    expect(r.issues).toEqual([S1]);
  });

  it("отклоняет слушателя из другой группы", () => {
    const r = validateRelations({
      ...base(),
      profiles: [{ user_id: S1, organization_id: ORG, student_group_id: OTHER_GROUP }],
    });
    expect(r.status).toBe(422);
  });

  it("отклоняет неизвестного слушателя (нет профиля)", () => {
    const r = validateRelations({ ...base(), studentUserIds: [S1, S2], studentsMetaIds: [S1, S2] });
    expect(r.status).toBe(422);
    expect(r.issues).toEqual([S2]);
  });

  it("отклоняет studentsMeta с посторонним пользователем", () => {
    const r = validateRelations({ ...base(), studentsMetaIds: [S1, S2] });
    expect(r.status).toBe(422);
    expect(r.issues).toEqual([S2]);
  });

  it("требует хотя бы одного слушателя", () => {
    expect(validateRelations({ ...base(), studentUserIds: [], studentsMetaIds: [] }).status).toBe(422);
  });

  it("без группы проверяет только организацию", () => {
    const r = validateRelations({
      ...base(),
      groupId: null,
      group: null,
      profiles: [{ user_id: S1, organization_id: ORG, student_group_id: OTHER_GROUP }],
    });
    expect(r.ok).toBe(true);
  });
});

describe("validateExactContractRoster", () => {
  const exact = () => ({
    studentUserIds: [S1, S2],
    studentsMeta: [
      { user_id: S1, full_name: "Иванов Иван Иванович" },
      { user_id: S2, full_name: "Петров Пётр Петрович" },
    ],
    studentRows: [
      { STUDENT_FIO: "Иванов Иван Иванович" },
      { STUDENT_FIO: "Петров Пётр Петрович" },
    ],
    activeProfiles: [
      { user_id: S1, full_name: "Иванов И. И." },
      { user_id: S2, full_name: "Петров Пётр Петрович" },
    ],
    frdoRows: [
      { user_id: S1, last_name: "Иванов", first_name: "Иван", middle_name: "Иванович" },
    ],
  });

  it("принимает ровно весь активный roster и ФИО из ФРДО с fallback на профиль", () => {
    expect(validateExactContractRoster(exact())).toEqual({ ok: true, status: 200 });
  });

  it("отклоняет подмножество, лишнего слушателя и дубли UUID", () => {
    expect(validateExactContractRoster({ ...exact(), studentUserIds: [S1] }).ok).toBe(false);
    expect(validateExactContractRoster({ ...exact(), studentUserIds: [S1, S2, OTHER_GROUP] }).ok).toBe(false);
    expect(validateExactContractRoster({ ...exact(), studentUserIds: [S1, S1] }).ok).toBe(false);
  });

  it("отклоняет переставленный studentsMeta и изменённое печатное ФИО", () => {
    const swapped = exact();
    swapped.studentsMeta = [swapped.studentsMeta[1], swapped.studentsMeta[0]];
    expect(validateExactContractRoster(swapped).issues).toEqual([S1, S2]);

    const renamed = exact();
    renamed.studentRows[1].STUDENT_FIO = "Другой Человек";
    expect(validateExactContractRoster(renamed).issues).toEqual([S2]);
  });

  it("нормализует Unicode и повторные пробелы, но не додумывает пустое ФИО", () => {
    const normalized = exact();
    normalized.studentsMeta[1].full_name = "  Петров   Пётр Петрович ";
    normalized.studentRows[1].STUDENT_FIO = "Петров\u00a0Пётр Петрович";
    expect(validateExactContractRoster(normalized).ok).toBe(true);

    normalized.activeProfiles[1].full_name = "";
    expect(validateExactContractRoster(normalized).ok).toBe(false);
  });
});

describe("validateTemplateConsistency", () => {
  const manifest = {
    template_id: "goreltech.company.paid_education",
    template_version: "1.0.0-draft",
    template_sha256: "AABB",
  };
  const registry = {
    template_key: "goreltech.company.paid_education",
    version_label: "1.0.0-draft",
    template_sha256: "aabb",
    manifest: { template_id: "goreltech.company.paid_education", template_version: "1.0.0-draft" },
  };

  it("согласованный шаблон не даёт замечаний", () => {
    expect(validateTemplateConsistency({ manifest, registry, computedSourceSha256: "aabb" })).toEqual([]);
  });

  it("ловит несовпадение ключа, версии и хеша", () => {
    const issues = validateTemplateConsistency({
      manifest: { ...manifest, template_id: "other", template_version: "2.0.0", template_sha256: "CCDD" },
      registry,
      computedSourceSha256: "ffff",
    });
    expect(issues.length).toBe(6);
  });

  it("ловit расхождение реестрового манифеста со встроенным", () => {
    const issues = validateTemplateConsistency({
      manifest,
      registry: { ...registry, manifest: { template_id: "legacy", template_version: "0.9" } },
      computedSourceSha256: "aabb",
    });
    expect(issues.length).toBe(2);
  });
});
