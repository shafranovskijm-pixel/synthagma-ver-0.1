/**
 * Чистая логика «пакета документов группы».
 *
 * Договор НИКОГДА не входит в пакет docs: он создаётся только через
 * GenerateContractDialog (сценарии «Физическое лицо» / «Компания»).
 */
import { GROUP_DOCUMENT_TYPES } from "./groupDocuments";
import type { DocType } from "./schema";

export type ContractScenarioKind = "individual" | "legal";

/** Типы документов пакета: только folder=docs, без contract, каждый ровно один раз. */
export function buildPackageDocTypes(): DocType[] {
  const seen = new Set<string>();
  const out: DocType[] = [];
  for (const t of GROUP_DOCUMENT_TYPES) {
    if (t.folder !== "docs") continue;
    if (t.key === "contract") continue;
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    out.push(t.key as DocType);
  }
  return out;
}

export const PACKAGE_DOC_TYPES: DocType[] = buildPackageDocTypes();

/** Честное описание того, что будет создано. */
export function describePackagePlan(scenario: ContractScenarioKind, studentCount: number): string {
  const docs = PACKAGE_DOC_TYPES.length;
  return scenario === "individual"
    ? `${studentCount} договор(ов) + ${docs} документов группы`
    : `1 договор + ${docs} документов группы`;
}

/** Текст итогового toast после успешной генерации пакета. */
export function packageResultMessage(
  scenario: ContractScenarioKind,
  contractCount: number,
  docCount: number,
): string {
  const contracts = scenario === "individual"
    ? `договоров: ${contractCount}`
    : `договор: 1`;
  return `Пакет сформирован — ${contracts}, документов группы: ${docCount}`;
}

/**
 * Оркестрация: остальные документы генерируются РОВНО ОДИН РАЗ и только
 * если договоры были успешно созданы.
 */
export interface PackageOrchestrationState {
  contractsDone: boolean;
  contractCount: number;
  docsGenerated: boolean;
}

export function shouldGeneratePackageDocs(st: PackageOrchestrationState): boolean {
  return st.contractsDone && st.contractCount > 0 && !st.docsGenerated;
}
