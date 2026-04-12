import { CONTRACT_SIGNATURE_B64, CONTRACT_STAMP_B64 } from './contractAssets';

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
}

const SELLER = {
  name: 'ИП Шафрановский Максим Михайлович',
  inn: '253615392404',
  ogrnip: '324253600042754',
  account: '40914810200040551529',
  bankName: 'ООО «Озон Банк»',
  bik: '044525068',
  corrAccount: '30101810645374525068',
  bankInn: '9703077050',
  bankKpp: '770301001',
};

function pluralMonths(n: number): string {
  if (n === 1) return '1 месяц';
  if (n >= 2 && n <= 4) return `${n} месяца`;
  return `${n} месяцев`;
}

export function generateInvoiceHtml(data: InvoiceData): string {
  const serviceName = `Предоставление доступа к платформе «Синтагма». Тариф «${data.planName}», ${pluralMonths(data.periodMonths)}`;
  const amountFormatted = data.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
      <div><b>${SELLER.bankName}</b></div>
      <div style="font-size: 9pt;">ИНН ${SELLER.bankInn} / КПП ${SELLER.bankKpp}</div>
    </td>
    <td style="width: 15%; font-size: 9pt;">БИК</td>
    <td style="width: 30%;">${SELLER.bik}</td>
  </tr>
  <tr>
    <td style="font-size: 9pt;">Корр. счёт</td>
    <td>${SELLER.corrAccount}</td>
  </tr>
  <tr>
    <td>
      <div style="font-size: 9pt; color: #555;">Получатель</div>
      <div><b>${SELLER.name}</b></div>
      <div style="font-size: 9pt;">ИНН ${SELLER.inn}, ОГРНИП ${SELLER.ogrnip}</div>
    </td>
    <td style="font-size: 9pt;">Счёт №</td>
    <td><b>${SELLER.account}</b></td>
  </tr>
</table>

<div class="header-line"></div>

<h1>Счёт на оплату № ${data.invoiceNumber} от ${data.invoiceDate}</h1>

<table style="margin-bottom: 20px; font-size: 11pt;">
  <tr>
    <td style="width: 130px; padding: 3px 0;"><b>Поставщик:</b></td>
    <td>${SELLER.name}, ИНН ${SELLER.inn}, ОГРНИП ${SELLER.ogrnip}</td>
  </tr>
  <tr>
    <td style="padding: 3px 0;"><b>Покупатель:</b></td>
    <td>${data.buyerName}${data.buyerInn ? `, ИНН ${data.buyerInn}` : ''}${data.buyerKpp ? `, КПП ${data.buyerKpp}` : ''}</td>
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
  <div style="font-size: 10pt; color: #555; margin-top: 4px;">НДС не облагается (УСН)</div>
</div>

<div class="sign-block" style="min-height: 120px;">
  <div style="margin-top: 30px;">
    <b>Индивидуальный предприниматель</b>
  </div>
  <div style="margin-top: 30px; position: relative;">
    <span>__________________ / Шафрановский М.М. /</span>
    <img src="data:image/png;base64,${CONTRACT_SIGNATURE_B64}" 
         style="position: absolute; left: -10px; top: -35px; height: 70px; opacity: 0.9;" />
    <img src="data:image/png;base64,${CONTRACT_STAMP_B64}" 
         style="position: absolute; left: 200px; top: -50px; height: 110px; opacity: 0.85;" />
  </div>
</div>

</body>
</html>`;
}
