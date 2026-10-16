import { CONTRACT_SIGNATURE_B64, CONTRACT_STAMP_B64 } from './contractAssets';
import { clampRequisite, escapeHtml } from '@/lib/html/escapeHtml';
import { DEFAULT_OPERATOR_REQUISITES, readStoredCompanyCardRequisites, type OperatorRequisites } from './operatorDetails';
import { loadOperatorRequisites } from '@/hooks/useOperatorRequisites';

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  // Buyer (organization)
  buyerName: string;
  buyerInn?: string | null;
  buyerKpp?: string | null;
  buyerAddress?: string | null;
  // Service
  planName: string;
  periodMonths: number;
  amount: number;
  postpaid?: PostpaidInvoiceCalculation;
}

export interface PostpaidInvoiceCalculation {
  period_start: string;
  period_end: string;
  access_period_start: string;
  access_period_end: string;
  courses_count: number;
  learners_count: number;
  features: Record<string, boolean>;
  access_days: number;
  month_days: number;
  contract_reference: string;
  terms_version: string;
  monthly_amount: number;
  amount: number;
}

const billingDate = (value: string, previousDay = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Некорректная дата расчёта');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Некорректная дата расчёта');
  if (previousDay) date.setUTCDate(date.getUTCDate() - 1);
  return date.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
};

function postpaidCalculationHtml(calculation: PostpaidInvoiceCalculation, amount: number): string {
  const p = calculation;
  if (p.terms_version !== '59-09-26-v1' || !Number.isFinite(p.amount) || p.amount !== amount
    || ![4490, 6990, 16990].includes(p.monthly_amount)
    || ![p.courses_count, p.learners_count, p.access_days, p.month_days].every(n => Number.isSafeInteger(n) && n >= 0)
    || p.month_days < 28 || p.month_days > 31 || p.access_days < 1 || p.access_days > p.month_days
    || p.period_end <= p.period_start || p.access_period_end <= p.access_period_start) {
    throw new Error('Счёт не соответствует подтверждённому расчёту постоплаты');
  }
  const names: Record<string, string> = { crm: 'CRM и продажи', webinar: 'Вебинары', videoserviceplus: 'Видеосервис+', frdoplus: 'ФИС ФРДО+' };
  const functions = Object.entries(p.features).filter(([,used]) => used === true).map(([key]) => names[key]).filter(Boolean);
  const prorata = p.access_days !== p.month_days
    ? `${p.monthly_amount.toLocaleString('ru-RU')} ₽ × ${p.access_days} / ${p.month_days} дней`
    : `${p.monthly_amount.toLocaleString('ru-RU')} ₽ за полный месяц`;
  return `<section style="margin-top:20px;font-size:11pt;break-inside:avoid">
    <b>Расчёт по фактическому использованию</b>
    <p>Основание: ${escapeHtml(clampRequisite(p.contract_reference, 500))}.<br>
    Расчётный месяц: ${billingDate(p.period_start)} — ${billingDate(p.period_end, true)}.<br>
    Доступ предоставлен: ${billingDate(p.access_period_start)} — ${billingDate(p.access_period_end, true)}.</p>
    <p>Использованных курсов: ${p.courses_count}. Уникальных обучавшихся: ${p.learners_count}.<br>
    Функции, учтённые с предварительным подтверждением: ${functions.length ? functions.join(', ') : 'нет'}.<br>
    Стоимость доступа: ${prorata}. Применяется один тариф за месяц.<br>
    Дополнительные услуги в этот счёт не включены.</p>
    <p>Оплата в течение 5 рабочих дней с даты получения счёта и акта с расчётом.</p>
  </section>`;
}

function pluralMonths(n: number): string {
  if (n === 1) return '1 месяц';
  if (n >= 2 && n <= 4) return `${n} месяца`;
  return `${n} месяцев`;
}

/**
 * Генерирует HTML счёта на оплату подписки.
 * Реквизиты оператора читаются из app_settings (с фолбэком на дефолтные).
 * Передайте `requisitesOverride`, чтобы избежать повторного запроса к БД.
 */
export async function generateInvoiceHtml(
  data: InvoiceData,
  requisitesOverride?: OperatorRequisites,
): Promise<string> {
  const seller = requisitesOverride ?? (await loadOperatorRequisites());
  return renderInvoiceHtml(data, seller);
}

/** Синхронная версия — для случаев, когда реквизиты уже загружены. */
export function generateInvoiceHtmlSync(
  data: InvoiceData,
  requisites: OperatorRequisites = DEFAULT_OPERATOR_REQUISITES,
): string {
  return renderInvoiceHtml(data, requisites);
}

function renderInvoiceHtml(data: InvoiceData, requisites: OperatorRequisites): string {
  const seller = readStoredCompanyCardRequisites(requisites);
  const calculationHtml = data.postpaid ? postpaidCalculationHtml(data.postpaid, data.amount) : '';
  const servicePeriod = data.postpaid
    ? `постоплата за ${billingDate(data.postpaid.access_period_start)} — ${billingDate(data.postpaid.access_period_end, true)}`
    : pluralMonths(data.periodMonths);
  const serviceName = `Предоставление доступа к платформе «Синтагма». Тариф «${escapeHtml(clampRequisite(data.planName))}», ${servicePeriod}`;
  const buyerName = escapeHtml(clampRequisite(data.buyerName));
  const buyerInn = escapeHtml(clampRequisite(data.buyerInn));
  const buyerKpp = escapeHtml(clampRequisite(data.buyerKpp));
  const buyerAddress = escapeHtml(clampRequisite(data.buyerAddress));
  const invoiceNumberSafe = escapeHtml(data.invoiceNumber);
  const invoiceDateSafe = escapeHtml(data.invoiceDate);
  const amountFormatted = data.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const supplierLine =
    `${seller.fullName}, ИНН ${seller.inn}, ОГРНИП ${seller.ogrnip}` +
    (seller.address ? `, ${seller.address}` : '') +
    (seller.phone ? `, тел.: ${seller.phone}` : '');

  return `
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #000; margin: 0; padding: 20px; }
  table { border-collapse: collapse; width: 100%; }
  .bank-table td { border: 1px solid #000; padding: 4px 8px; font-size: 10pt; }
  .items-table td, .items-table th { border: 1px solid #000; padding: 6px 10px; font-size: 11pt; }
  .items-table th { background: #f5f5f5; text-align: center; }
  h1 { font-size: 16pt; margin: 20px 0 10px; }
  .header-line { border-top: 3px solid #000; border-bottom: 1px solid #000; padding: 4px 0; margin-bottom: 20px; }
  .sign-block { margin-top: 40px; position: relative; }
  .sign-block img { position: absolute; }
  .no-print { margin: 20px 0; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>

<!-- Bank requisites block -->
<table class="bank-table" style="margin-bottom: 10px;">
  <tr>
    <td rowspan="2" style="width: 55%;">
      <div style="font-size: 9pt; color: #555;">Банк получателя</div>
      <div><b>${seller.bankName}</b></div>
      <div style="font-size: 9pt;">ИНН ${seller.bankInn} / КПП ${seller.bankKpp}</div>
    </td>
    <td style="width: 15%; font-size: 9pt;">БИК</td>
    <td style="width: 30%;">${seller.bik}</td>
  </tr>
  <tr>
    <td style="font-size: 9pt;">Корр. счёт</td>
    <td>${seller.corrAccount}</td>
  </tr>
  <tr>
    <td>
      <div style="font-size: 9pt; color: #555;">Получатель</div>
      <div><b>${seller.fullName}</b></div>
      <div style="font-size: 9pt;">ИНН ${seller.inn}, ОГРНИП ${seller.ogrnip}</div>
    </td>
    <td style="font-size: 9pt;">Счёт №</td>
    <td><b>${seller.bankAccount}</b></td>
  </tr>
</table>

<div class="header-line"></div>

<h1>Счёт на оплату № ${invoiceNumberSafe} от ${invoiceDateSafe}</h1>

<table style="margin-bottom: 20px; font-size: 11pt;">
  <tr>
    <td style="width: 130px; padding: 3px 0; vertical-align: top;"><b>Поставщик:</b></td>
    <td>${supplierLine}</td>
  </tr>
  <tr>
    <td style="padding: 3px 0; vertical-align: top;"><b>Покупатель:</b></td>
    <td style="overflow-wrap:anywhere;word-break:break-word;">${buyerName}${buyerInn ? `, ИНН ${buyerInn}` : ''}${buyerKpp ? `, КПП ${buyerKpp}` : ''}${buyerAddress ? `, ${buyerAddress}` : ''}</td>
  </tr>
</table>

<table class="items-table">
  <thead>
    <tr>
      <th style="width: 40px;">№</th>
      <th>Наименование товара / услуги</th>
      <th style="width: 60px;">Кол-во</th>
      <th style="width: 50px;">Ед.</th>
      <th style="width: 110px;">Цена, ₽</th>
      <th style="width: 110px;">Сумма, ₽</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="text-align: center;">1</td>
      <td>${serviceName}</td>
      <td style="text-align: center;">1</td>
      <td style="text-align: center;">усл.</td>
      <td style="text-align: right;">${amountFormatted}</td>
      <td style="text-align: right;">${amountFormatted}</td>
    </tr>
  </tbody>
</table>

<div style="text-align: right; margin-top: 10px; font-size: 12pt;">
  <div><b>Итого: ${amountFormatted} ₽</b></div>
  <div style="font-size: 10pt; color: #555; margin-top: 4px;">${data.postpaid ? 'НДС не начисляется (НПД, п. 4.8 договора)' : 'НДС не облагается (УСН)'}</div>
</div>

${calculationHtml}

<div class="sign-block" style="min-height: 180px;">
  <div style="margin-top: 30px;">
    <b>Индивидуальный предприниматель</b>
  </div>
  <div style="margin-top: 30px; position: relative;">
    <span>__________________ / ${seller.shortName} /</span>
    <img src="data:image/png;base64,${CONTRACT_SIGNATURE_B64}"
         style="position: absolute; left: -10px; top: -40px; height: 90px; opacity: 0.9;" />
    <img src="data:image/png;base64,${CONTRACT_STAMP_B64}"
         style="position: absolute; left: 180px; top: -65px; height: 160px; opacity: 0.85;" />
  </div>
</div>

</body>
</html>`;
}
