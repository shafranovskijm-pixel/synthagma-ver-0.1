/** Read-only summary: an unfilled collection is unknown, never an inferred zero. */
export interface SummaryCollectionFact {
  fact_key: string;
  state: string;
  value: unknown;
  source_current: boolean;
}
export function selfExaminationSummaryCount(names: readonly string[], factKey: 'answer:programs' | 'answer:staff', facts: readonly SummaryCollectionFact[] = []): number | null {
  const entered = names.filter(name => name.trim().length > 0).length;
  if (entered > 0) return entered;
  if (names.length > 0) return null;
  const matching = facts.filter(fact => fact.fact_key === factKey);
  if (matching.length !== 1) return null;
  const fact = matching[0];
  return fact.state === 'confirmed' && fact.source_current && Array.isArray(fact.value) && fact.value.length === 0 ? 0 : null;
}
