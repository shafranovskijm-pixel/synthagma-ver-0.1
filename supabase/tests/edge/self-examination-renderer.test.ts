import { describe, expect, it } from "vitest";
import { renderSelfExaminationDraft, type SelfExaminationDraftInput, type SelfExaminationFact } from "../../functions/_shared/self-examination-renderer";

const fact = (overrides: Partial<SelfExaminationFact> = {}): SelfExaminationFact => ({ key: "learners", label: "Численность обучающихся", section: "Образовательная деятельность",
  unit: "чел.", state: "confirmed", value: 17, sourceCurrent: true, location: "Сводный журнал за отчётный год", reviewNote: null, ...overrides });
const input = (overrides: Partial<SelfExaminationDraftInput> = {}): SelfExaminationDraftInput => ({ organizationTitle: "Учебный центр", reportingYear: 2025,
  providerLabel: "Программы дополнительного профессионального образования", legalBasisNote: "Основания требуют проверки центром",
  facts: [fact()], indicators: [fact({ key: "indicator", value: { count: 17, share: 85, undefined_share_reason: null } })],
  legalReferences: [{ title: "Официальный источник", url: "https://publication.pravo.gov.ru/document/0001201801090025" }], generatedAt: "2026-10-23T14:00:00Z", ...overrides });

describe("factual self-examination HTML draft", () => {
  it("keeps the reporting year separate, shows a draft and generates no approval or automatic publication", () => {
    const html = renderSelfExaminationDraft(input());
    expect(html).toContain("за 2025 год — черновик");
    expect(html).toContain("2026-10-23T14:00:00.000Z");
    expect(html).toContain("ЧЕРНОВИК. Требуется проверка центра.");
    expect(html).toContain("Он не подтверждает утверждение отчёта");
    expect(html).not.toContain("Заключение: соответствует");
    expect(html).not.toContain("Отчёт утверждён");
  });
  it("renders a confirmed current fact including zero and false without inventing a positive finding", () => {
    const html = renderSelfExaminationDraft(input({ facts: [fact({ value: 0 }), fact({ key: "b", label: "Есть общежитие", value: false })] }));
    expect(html).toContain("<td>0</td>");
    expect(html).toContain("<td>Нет</td>");
    expect(html).toContain("17; доля 85%");
  });
  it("never renders an unknown, entered or stale value as confirmed and lists each reason", () => {
    const html = renderSelfExaminationDraft(input({ facts: [fact({ value: "SECRET_ENTERED_VALUE", state: "entered" }),
      fact({ key: "unknown", value: "SECRET_UNKNOWN_VALUE", state: "unknown" }), fact({ key: "stale", value: "SECRET_STALE_VALUE", sourceCurrent: false })] }));
    expect(html).not.toMatch(/SECRET_(?:ENTERED|UNKNOWN|STALE)_VALUE/);
    expect(html).toContain("Введённые сведения ещё не подтверждены");
    expect(html).toContain("Подтверждённые сведения отсутствуют");
    expect(html).toContain("Источник изменился или его актуальность не подтверждена");
  });
  it("renders NA only with an explicit current reason and never silently turns it into zero", () => {
    const html = renderSelfExaminationDraft(input({ facts: [fact({ state: "not_applicable", value: 0, reviewNote: "Не реализуем этот вид деятельности" }),
      fact({ key: "missing-reason", state: "not_applicable", value: 0 }), fact({ key: "old-reason", state: "not_applicable", value: 0, reviewNote: "Старое решение", sourceCurrent: false })] }));
    expect(html).toContain("Не применяется: Не реализуем этот вид деятельности");
    expect(html).toContain("Отсутствует явное обоснование неприменимости");
    expect(html).not.toContain("<td>0</td>");
    expect(html).not.toContain("Не применяется: Старое решение");
  });
  it("keeps an undefined share distinct from0 and asks for its basis when absent", () => {
    const html = renderSelfExaminationDraft(input({ indicators: [fact({ value: { count: 0, share: null, undefined_share_reason: "Нулевой знаменатель" } }),
      fact({ key: "missing-denominator", value: { count: 3, share: null, undefined_share_reason: null } })] }));
    expect(html).toContain("0; доля не рассчитана: Нулевой знаменатель");
    expect(html).not.toContain("доля 0%");
    expect(html).toContain("Нет значения доли и причины, по которой она не определена");
  });
  it("does not turn malformed numeric values into report indicators", () => {
    const html = renderSelfExaminationDraft(input({ facts: [fact({ value: Number.NaN }), fact({ key: "inf", value: Infinity })],
      indicators: [fact({ value: { count: -1, share: 101, undefined_share_reason: null } })] }));
    expect(html).not.toMatch(/<td>(?:NaN|Infinity|-1)/);
    expect(html).toContain("Подтверждённое значение отсутствует или некорректно");
  });
  it("escapes all data-bearing HTML fields and never executes input markup", () => {
    const bad = '<img src=x onerror="alert(1)">&';
    const html = renderSelfExaminationDraft(input({ organizationTitle: bad, providerLabel: bad, legalBasisNote: bad,
      facts: [fact({ label: bad, section: bad, unit: bad, value: bad, location: bad, reviewNote: bad })],
      indicators: [fact({ state: "not_applicable", reviewNote: bad })], legalReferences: [{ title: bad, url: "https://pravo.gov.ru/?a=1&b=2" }] }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;");
    expect(html).toContain('href="https://pravo.gov.ru/?a=1&amp;b=2"');
  });
  it("links only known official primary http(s) hosts and escapes rejected link titles", () => {
    const references = ["javascript:alert(1)", "data:text/html,bad", "https://pravo.gov.ru.evil.org/", "https://user:pass@pravo.gov.ru/",
      "https://publication.pravo.gov.ru:8443/", "https://example.com/", "file:///C:/private.pdf", "https://pravo.gov.ru/?access_token=SECRET"].map((url, i) => ({ title: `Ref${i}`, url }));
    const html = renderSelfExaminationDraft(input({ legalReferences: [...references, { title: "Allowed", url: "http://obrnadzor.gov.ru/" }] }));
    expect((html.match(/<a href=/g) ?? []).length).toBe(1);
    expect(html).toContain('href="http://obrnadzor.gov.ru/"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("user:pass");
    expect(html).toContain("адрес источника требует проверки");
  });
  it("does not include known private document locators or credentials from source locations", () => {
    const html = renderSelfExaminationDraft(input({ facts: [fact({ location: "org-documents/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/file.pdf" }),
      fact({ key: "signed", location: "https://api.school.ru/sb-storage/object/sign/private.pdf?token=SECRET_TOKEN" }),
      fact({ key: "local", location: "C:\\private\\student-file.pdf" })] }));
    expect(html).not.toContain("SECRET_TOKEN");
    expect(html).not.toContain("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(html).not.toContain("student-file.pdf");
    expect(html).toContain("Источник доступен в защищённом кабинете центра");
  });
  it("preserves the exact official Ministry of Justice registry paths while rejecting deceptive paths and ordinary consultant pages", () => {
    const html = renderSelfExaminationDraft(input({ legalReferences: [
      { title: "462", url: "https://minjust.consultant.ru/documents/6631" },
      { title: "1324", url: "https://minjust.consultant.ru/documents/8799" },
      { title: "Scan", url: "https://minjust.consultant.ru/files/6631" },
      { title: "Wrong host", url: "https://consultant.ru/documents/6631" },
      { title: "Deceptive suffix", url: "https://minjust.consultant.ru/documents/6631/redirect" },
      { title: "Wrong path", url: "https://minjust.consultant.ru/redirect/6631" },
      { title: "Encoded separator", url: "https://minjust.consultant.ru/documents/6631%2fredirect" },
    ] }));
    expect((html.match(/<a href=/g) ?? []).length).toBe(3);
    expect(html).toContain('href="https://minjust.consultant.ru/documents/6631"');
    expect(html).toContain('href="https://minjust.consultant.ru/documents/8799"');
    expect(html).not.toContain('href="https://consultant.ru/');
    expect(html).not.toContain('href="https://minjust.consultant.ru/documents/6631/redirect');
  });
  it("renders negative or unsafe scalar numbers as missing while retaining a valid fractional value", () => {
    const html = renderSelfExaminationDraft(input({ facts: [fact({ value: -1 }), fact({ key: "unsafe", value: Number.MAX_SAFE_INTEGER + 1 }),
      fact({ key: "fraction", value: 12.5 })] }));
    expect(html).not.toContain("<td>-1</td>");
    expect(html).not.toContain(`<td>${Number.MAX_SAFE_INTEGER + 1}</td>`);
    expect(html).toContain("<td>12.5</td>");
    expect(html).toContain("Подтверждённое значение отсутствует или некорректно");
  });
  it("keeps empty facts, missing legal basis and missing official sources visible as unfinished work", () => {
    const html = renderSelfExaminationDraft(input({ facts: [], indicators: [], legalBasisNote: null, legalReferences: [] }));
    expect(html).toContain("Раздел не содержит подтверждённых фактов");
    expect(html).toContain("Нужно проверить правовой статус центра");
    expect(html).toContain("Нужно указать и проверить применимые официальные источники");
  });
  it("rejects malformed projection identity and duplicate facts instead of overwriting or inventing data", () => {
    for (const value of [input({ reportingYear: 2025.5 }), input({ organizationTitle: " " }), input({ generatedAt: "yesterday" }), input({ generatedAt: "2026-02-30T10:00:00Z" }),
      input({ facts: [fact(), fact()] }), input({ facts: [fact({ sourceCurrent: "true" as unknown as boolean })] })]) {
      expect(() => renderSelfExaminationDraft(value)).toThrow("INVALID_SELF_EXAMINATION_DRAFT");
    }
  });
  it("is deterministic, preserves the input and keeps notes separate from the generated conclusion", () => {
    const value = input(), before = JSON.stringify(value);
    expect(renderSelfExaminationDraft(value)).toBe(renderSelfExaminationDraft(value));
    expect(JSON.stringify(value)).toBe(before);
    expect(renderSelfExaminationDraft(value)).toContain("Проверка содержания и отдельное утверждение центром по-прежнему необходимы");
  });
});
