import { parseCourseBinding, trainingFormLabels } from "@/lib/programFacts";
import { FRDO_DOCUMENT_TYPES } from "@/constants/frdo";
import { parseEducationProfile, type EducationProfileV1 } from "@/lib/uc-compliance/model";

export const CONTRACT_FACT_LABELS = {
  org_license_number: "Номер лицензии организации",
  org_license_date: "Дата лицензии организации",
  org_license_issuer: "Орган, выдавший лицензию организации",
  education_form: "Форма обучения по утверждённой программе",
  document_type_name: "Вид документа по утверждённой программе",
} as const;
export type ContractFactKey = keyof typeof CONTRACT_FACT_LABELS;
export type ContractFacts = Record<ContractFactKey, string | null> & {
  organizationProfile?: { organizationId: string; revision: number; license: EducationProfileV1["license"] };
};
export const emptyContractFacts = (): ContractFacts => ({
  org_license_number: null, org_license_date: null, org_license_issuer: null,
  education_form: null, document_type_name: null,
});

export class ContractFactsError extends Error {
  constructor(readonly code: "MISSING_FACT" | "UNKNOWN_PLACEHOLDER" | "SOURCE_UNAVAILABLE", readonly fields: string[]) {
    super(code === "MISSING_FACT"
      ? `Не подтверждены сведения для договора: ${fields.map(key => CONTRACT_FACT_LABELS[key as ContractFactKey] ?? key).join(", ")}. ${fields.some(key => key.startsWith("org_license_")) ? "Номер и орган укажите в «Документы центра → Профиль деятельности → Лицензия». Дата выдачи в профиле пока не хранится: в конструкторе замените переменную даты лицензии фактической датой из документа. Шаблон автоматически не меняется. " : "Проверьте утверждённую программу и её связь с курсом; для нескольких разных программ используйте отдельные договоры. "}Договор не сформирован.`
      : code === "UNKNOWN_PLACEHOLDER"
      ? "В шаблоне есть неизвестная или неподставленная переменная. Исправьте её в конструкторе. Договор не сформирован."
      : "Не удалось проверить сведения программы. Обновите данные и повторите действие. Договор не сформирован.");
  }
}

export function contractTemplateKeys(template: string): string[] {
  const keys: string[] = [];
  const rest = template.replace(/\{\{([^{}]*)\}\}/g, (_token, raw: string) => {
    const key = raw.trim();
    if (!/^[a-z_]+$/.test(key)) throw new ContractFactsError("UNKNOWN_PLACEHOLDER", []);
    if (!keys.includes(key)) keys.push(key);
    return "";
  });
  if (rest.includes("{{") || rest.includes("}}")) throw new ContractFactsError("UNKNOWN_PLACEHOLDER", []);
  return keys;
}

type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };

/** Original-caller approved course binding, never editable FRDO labels or sales leads. */
export async function resolveContractFacts(db: RpcClient, organizationId: string, courseIds: string[], template: string): Promise<ContractFacts> {
  const facts = emptyContractFacts(), requested = contractTemplateKeys(template);
  // Profile values are the centre's recorded declarations, not regulator verification.
  if (requested.some(key => key.startsWith("org_license_"))) {
    try {
      const result = await db.rpc("get_organization_education_profile", { p_organization_id: organizationId });
      const envelope = result.data as { organization_id?: unknown; revision?: unknown; profile?: unknown } | null;
      if (result.error || !envelope || envelope.organization_id !== organizationId
        || !Number.isSafeInteger(envelope.revision) || (envelope.revision as number) < 0) throw new Error("PROFILE_SCOPE");
      const profile = parseEducationProfile(envelope.profile);
      facts.organizationProfile = { organizationId, revision: envelope.revision as number, license: profile.license };
      if (profile.license.status === "declared_active") {
        facts.org_license_number = profile.license.registryNumber;
        facts.org_license_issuer = profile.license.authority;
      }
      // checkedOn means when the centre checked a source, never the issue date.
      // No issue-date field exists in this version of the saved profile.
    } catch { throw new ContractFactsError("SOURCE_UNAVAILABLE", []); }
  }
  if (!requested.some(key => key === "education_form" || key === "document_type_name")) return facts;
  const selected = [...new Set(courseIds)];
  if (!selected.length) return facts;
  const forms: Array<string | null> = [], documents: Array<string | null> = [];
  for (const courseId of selected) {
    let binding: ReturnType<typeof parseCourseBinding>;
    try {
      const result = await db.rpc("get_course_program_binding", { p_organization_id: organizationId, p_course_id: courseId });
      if (result.error) throw result.error;
      binding = parseCourseBinding(result.data, organizationId, courseId);
    } catch { throw new ContractFactsError("SOURCE_UNAVAILABLE", []); }
    const approved = binding.version?.facts;
    forms.push(approved?.training_form ? trainingFormLabels[approved.training_form] : null);
    const kind = approved?.program_type;
    const documentKey = kind === "dpo_upskilling" ? "qualification_upgrade"
      : kind === "dpo_retraining" ? "professional_retraining"
      : kind === "professional_training" ? "professional_training" : null;
    documents.push(documentKey ? FRDO_DOCUMENT_TYPES[documentKey] ?? null : null);
  }
  // A single scalar cannot silently describe only the first of several programmes.
  const common = (values: Array<string | null>): string | null => values.every(value => !!value && value === values[0]) ? values[0] : null;
  facts.education_form = common(forms);
  facts.document_type_name = common(documents);
  return facts;
}

/** Validate before generating any output. Replacements run once, never recursively. */
export function substituteContractTemplate(template: string, replacements: Record<string, string>, facts: ContractFacts,
  encodeFact: (value: string) => string = value => value): string {
  const keys = contractTemplateKeys(template);
  const isFact = (key: string): key is ContractFactKey => Object.prototype.hasOwnProperty.call(CONTRACT_FACT_LABELS, key);
  const unknown = keys.filter(key => !isFact(key) && !Object.prototype.hasOwnProperty.call(replacements, `{{${key}}}`));
  if (unknown.length) throw new ContractFactsError("UNKNOWN_PLACEHOLDER", unknown);
  const missing = keys.filter(key => isFact(key) && !facts[key]?.trim());
  if (missing.length) throw new ContractFactsError("MISSING_FACT", missing);
  const result = template.replace(/\{\{([^{}]*)\}\}/g, (_token, raw: string) => {
    const key = raw.trim();
    return isFact(key) ? encodeFact(facts[key]!) : replacements[`{{${key}}}`];
  });
  if (result.includes("{{") || result.includes("}}")) throw new ContractFactsError("UNKNOWN_PLACEHOLDER", []);
  return result;
}

export function contractFactsMessage(error: unknown, fallback: string): string {
  return error instanceof ContractFactsError ? error.message : fallback;
}

export function assertContractOutput(html: string): string {
  if (html.includes("{{") || html.includes("}}")) throw new ContractFactsError("UNKNOWN_PLACEHOLDER", []);
  return html;
}
