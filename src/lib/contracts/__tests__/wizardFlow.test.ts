import { describe, it, expect } from "vitest";
import { canProceedStep, nextStep, prevStep, type WizardState } from "../wizardFlow";

const base: WizardState = {
  step: 1,
  scenarioChosen: false,
  counterparty: "individual",
  hasTemplate: false,
  hasPrimaryStudent: false,
  multiStudentCount: 0,
  hasCompany: false,
};

describe("contract wizard flow", () => {
  it("quick-режим не проходит дальше шага 1 без явного выбора сценария", () => {
    const st = { ...base, step: 1, scenarioChosen: false };
    expect(canProceedStep(1, st).ok).toBe(false);
    expect(nextStep(st, { quick: true, quickDefaultsReady: true })).toBe(1);
  });

  it("quick-режим после выбора сценария идёт на финальную проверку", () => {
    const st = { ...base, step: 1, scenarioChosen: true, hasTemplate: true, hasPrimaryStudent: true };
    expect(nextStep(st, { quick: true, quickDefaultsReady: true })).toBe(5);
  });

  it("quick-режим без готовых автоданных идёт на шаг выбора шаблона", () => {
    const st = { ...base, step: 1, scenarioChosen: true, hasTemplate: true, hasPrimaryStudent: true };
    expect(nextStep(st, { quick: true, quickDefaultsReady: false })).toBe(2);
  });

  it("quick-режим без шаблона идёт на шаг 2", () => {
    const st = { ...base, step: 1, scenarioChosen: true, hasTemplate: false };
    expect(nextStep(st, { quick: true, quickDefaultsReady: true })).toBe(2);
  });

  it("quick-режим для компании без выбранного заказчика идёт на шаг 3", () => {
    const st = { ...base, step: 1, scenarioChosen: true, hasTemplate: true, counterparty: "legal" as const, hasCompany: false };
    expect(nextStep(st, { quick: true, quickDefaultsReady: true })).toBe(3);
    expect(nextStep({ ...st, hasCompany: true }, { quick: true, quickDefaultsReady: true })).toBe(5);
  });

  it("quick-режим для физлица без учеников идёт на шаг 3", () => {
    const st = { ...base, step: 1, scenarioChosen: true, hasTemplate: true };
    expect(nextStep(st, { quick: true, quickDefaultsReady: true })).toBe(3);
  });


  it("обычный режим требует шаблон на шаге 2", () => {
    const st = { ...base, step: 2, scenarioChosen: true, hasTemplate: false };
    expect(canProceedStep(2, st).ok).toBe(false);
    expect(nextStep(st)).toBe(2);
    expect(nextStep({ ...st, hasTemplate: true })).toBe(3);
  });

  it("шаг 3: физлицо требует ученика, компания требует заказчика", () => {
    const ind = { ...base, step: 3, scenarioChosen: true, hasTemplate: true };
    expect(canProceedStep(3, ind).ok).toBe(false);
    expect(canProceedStep(3, { ...ind, multiStudentCount: 2 }).ok).toBe(true);
    const legal = { ...ind, counterparty: "legal" as const };
    expect(canProceedStep(3, legal).ok).toBe(false);
    expect(canProceedStep(3, { ...legal, hasCompany: true }).ok).toBe(true);
  });

  it("шаг 4 пропускается, если программа не нужна", () => {
    const st = { ...base, step: 3, scenarioChosen: true, hasTemplate: true, hasPrimaryStudent: true };
    expect(nextStep(st, { programStepNeeded: false })).toBe(5);
    expect(nextStep(st, { programStepNeeded: true })).toBe(4);
    expect(prevStep(5, false)).toBe(3);
    expect(prevStep(5, true)).toBe(4);
  });
});
