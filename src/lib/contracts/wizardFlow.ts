/**
 * Чистая логика шагов мастера генерации договора.
 * Вынесено из GenerateContractDialog для тестируемости:
 * quick-режим НЕ может пройти дальше шага 1 без явного выбора сценария.
 */
import type { ContractScenario } from "./scenarios";

export interface WizardState {
  step: number;
  scenarioChosen: boolean;
  counterparty: ContractScenario;
  hasTemplate: boolean;
  hasPrimaryStudent: boolean;
  multiStudentCount: number;
  hasCompany: boolean;
}

export interface ProceedResult {
  ok: boolean;
  reason?: string;
}

export function canProceedStep(s: number, st: WizardState): ProceedResult {
  if (s === 1) return st.scenarioChosen ? { ok: true } : { ok: false, reason: "Выберите сценарий договора" };
  if (s === 2) return st.hasTemplate ? { ok: true } : { ok: false, reason: "Выберите шаблон договора" };
  if (s === 3) {
    if (st.counterparty === "individual") {
      if (!st.hasPrimaryStudent && st.multiStudentCount === 0) {
        return { ok: false, reason: "Выберите хотя бы одного ученика" };
      }
      return { ok: true };
    }
    if (!st.hasCompany) return { ok: false, reason: "Выберите компанию-заказчика" };
    return { ok: true };
  }
  return { ok: true };
}

/**
 * Следующий шаг. quick=true уходит на финальную проверку только когда
 * сценарий выбран, автозаполнение возможно (quickDefaultsReady) и
 * обязательные для сценария данные уже есть (компания / ученики).
 */
export function nextStep(
  st: WizardState,
  opts: { quick?: boolean; programStepNeeded?: boolean; quickDefaultsReady?: boolean } = {},
) {
  const { quick = false, programStepNeeded = true, quickDefaultsReady = false } = opts;
  if (!canProceedStep(st.step, st).ok) return st.step;
  if (st.step === 1 && quick) {
    if (!st.hasTemplate) return 2;
    // Нет обязательных данных сценария — ведём на шаг выбора, а не на финал
    if (!canProceedStep(3, st).ok) return 3;
    return quickDefaultsReady ? 5 : 2;
  }
  let next = st.step + 1;
  if (next === 4 && !programStepNeeded) next = 5;
  return Math.min(5, next);
}


export function prevStep(step: number, programStepNeeded = true): number {
  let prev = step - 1;
  if (prev === 4 && !programStepNeeded) prev = 3;
  return Math.max(1, prev);
}
