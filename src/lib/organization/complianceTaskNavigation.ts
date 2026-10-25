import { readConstructorView, type DocumentConstructorView } from './documentWorkspaceNavigation.ts';

/** Only editors already present in ConstructorSection. These are preparation
 * tools and previews; they do not approve a policy, template version or issue. */
const PREPARATION_TOOLS = {
  paid_services: {
    view: "contract", label: "Шаблоны и предпросмотр договора",
    help: "Подготовьте проект договора и проверьте его для своего состава сторон, программы и условий. Выбор шаблона не подтверждает правовую готовность.",
  },
  personal_data: {
    view: "consent", label: "Подготовить проект согласия на ПД",
    help: "Этот инструмент готовит отдельное согласие. Оно не заменяет политику, основания обработки и остальные меры центра по персональным данным.",
  },
  attestation_protocol: {
    view: "protocol", label: "Шаблон и предпросмотр протокола",
    help: "Настройка шаблона не создаёт результат аттестации. Документы и фактические результаты конкретной группы открываются в её папке.",
  },
  qualification_issuance: {
    view: "documents", label: "Предпросмотр оформления документов",
    help: "Предпросмотр оформления не утверждает точную версию образца и не создаёт выдачу. Порядок, полномочия и факт выдачи проверяются отдельно.",
  },
  doc_forms_approval: {
    view: "documents", label: "Предпросмотр оформления документов",
    help: "Предпросмотр оформления не заменяет отдельное утверждение точной версии образца уполномоченным лицом центра.",
  },
} as const satisfies Record<string, { view: DocumentConstructorView; label: string; help: string }>;

export function compliancePreparation(requirementId: string) {
  if (!Object.prototype.hasOwnProperty.call(PREPARATION_TOOLS, requirementId)) return null;
  const tool = PREPARATION_TOOLS[requirementId as keyof typeof PREPARATION_TOOLS];
  const params = new URLSearchParams({ tab: "documents", documentView: "constructor", constructorView: tool.view, documentRequirement: requirementId });
  return { ...tool, href: `/organization?${params.toString()}` };
}

/** Context is shown only for the exact existing editor named by the shortcut. */
export function readCompliancePreparation(params: URLSearchParams) {
  if (params.get("tab") !== "documents" || params.get("documentView") !== "constructor") return null;
  const tool = compliancePreparation(params.get("documentRequirement") ?? "");
  return tool && tool.view === readConstructorView(params) ? tool : null;
}

export function isGroupDocumentTask(requirementId: string): boolean {
  return ["enrollment_order", "expulsion_order", "attestation_protocol"].includes(requirementId);
}

/** A centre-wide task has no group ID. Open the existing authorized group
 * selector; the user chooses the group and its “Документы группы” folder. */
export function groupDocumentSelectionPath(): string {
  return "/organization?tab=students&studentsView=groups";
}
