/** UC025 canonical service decision. Historical orders keep their own recorded price. */
export const SELF_EXAMINATION_SERVICE = Object.freeze({
  id: 'self_examination_report_auto',
  title: 'Подготовка черновика отчёта о самообследовании',
  price: Object.freeze({
    status: 'approved' as 'approved' | 'pending_business_decision',
    amountRub: 3500 as number | null,
    revision: 'uc025-price-3500-user-approved-20261023',
    decision: 'Direct user decision23October2026:3500RUB' as string | null,
  }),
});

export function selfExaminationPriceLabel(): string {
  const price = SELF_EXAMINATION_SERVICE.price;
  return price.status === 'pending_business_decision' || price.amountRub === null
    ? 'Цена ожидает подтверждения'
    : new Intl.NumberFormat('ru-RU').format(price.amountRub) + ' ₽';
}

/** A reporting year is explicit; upload time and the current date never replace it. */
export function selfExaminationPeriod(year: number): { from: string; to: string; publicationReferenceDate: string } {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error('INVALID_REPORTING_YEAR');
  return { from: year + '-01-01', to: year + '-12-31', publicationReferenceDate: (year + 1) + '-04-20' };
}
