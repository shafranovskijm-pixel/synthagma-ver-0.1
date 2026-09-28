import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { clampRequisite, escapeHtml } from "../html/escapeHtml";

export interface PlatformActRenderInput {
  actNumber: string;
  actDate: string;
  basis: string;
  amountKopecks: number;
  customerName: string | null;
  customerInn: string | null;
  customerDirector: string | null;
  customerPosition: string | null;
  stampBase64: string;
  signatureBase64: string;
}

function formatAmount(kopecks: number): string {
  return (kopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function amountInWords(kopecks: number): string {
  return Math.floor(kopecks / 100) + " руб. " + String(kopecks % 100).padStart(2, "0") + " коп.";
}

// Extracted unchanged document layout from utils/generateAct.ts. No database, browser or network access.
export function renderPlatformAct(input: PlatformActRenderInput): string {
  const { actNumber, actDate, basis, amountKopecks, stampBase64, signatureBase64 } = input;
  if (!Number.isSafeInteger(amountKopecks) || amountKopecks < 0) throw new Error("invalid_amount");
  const date = parseISO(actDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(actDate) || !Number.isFinite(date.getTime()) || format(date, "yyyy-MM-dd") !== actDate) throw new Error("invalid_date");
  for (const asset of [stampBase64, signatureBase64]) {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(asset)) throw new Error("invalid_facsimile");
  }
  const formattedDate = format(date, "dd MMMM yyyy", { locale: ru });
  const customerName = escapeHtml(clampRequisite(input.customerName) || "_______________");
  const customerInn = escapeHtml(clampRequisite(input.customerInn) || "_______________");
  const customerDirector = escapeHtml(clampRequisite(input.customerDirector) || "_______________");
  const customerPosition = escapeHtml(clampRequisite(input.customerPosition) || "_______________");
  const basisSafe = escapeHtml(clampRequisite(basis));
  const actNumberSafe = escapeHtml(actNumber);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 15mm 20mm; }
    @media print {
      body { padding: 0; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .signatures { page-break-inside: avoid; break-inside: avoid; }
    }
    body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.4; padding: 40px 50px; color: #000; }
    .header { text-align: center; margin-bottom: 20px; }
    .act-title { font-weight: bold; font-size: 16pt; text-align: center; margin: 20px 0 5px; }
    .act-number { text-align: center; margin-bottom: 20px; font-size: 12pt; }
    .parties { margin-bottom: 20px; }
    .parties p { margin: 4px 0; }
    table.act-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    table.act-table th, table.act-table td { border: 1px solid #000; padding: 6px 8px; text-align: left; font-size: 11pt; }
    table.act-table th { background: #f0f0f0; text-align: center; }
    .total { text-align: right; font-weight: bold; margin: 10px 0; font-size: 12pt; }
    .total-words { margin: 10px 0 30px; }
    .signatures-table { width: 100%; margin-top: 40px; page-break-inside: avoid; break-inside: avoid; border: none; border-collapse: collapse; }
    .signatures-table td { width: 50%; vertical-align: top; padding: 0 10px; border: none; }
    .sig-title { font-size: 12pt; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #000; padding-bottom: 5px; }
    .sig-facsimile { position: relative; height: 160px; margin: 10px 0; }
    .sig-facsimile img { position: absolute; }
    .sig-stamp { left: 0; top: 0; width: 150px; height: auto; opacity: 0.9; }
    .sig-sign { left: 70px; top: 30px; width: 170px; height: auto; opacity: 0.9; }
    .sig-name { border-top: 1px solid #000; padding-top: 5px; margin-top: 0; }
    .no-print { display: none; }
  </style>
</head>
<body>
  <div class="act-title">АКТ</div>
  <div class="act-number">№ ${actNumberSafe} от ${formattedDate} г.</div>
  
  <div class="parties">
    <p><strong>Исполнитель:</strong> ИП Шафрановский Максим Михайлович, ИНН 253615392404</p>
    <p><strong>Заказчик:</strong> ${customerName}${customerInn ? `, ИНН ${customerInn}` : ""}</p>
    <p><strong>Основание:</strong> ${basisSafe}</p>
  </div>

  <p>Исполнитель оказал, а Заказчик принял следующие услуги:</p>

  <table class="act-table">
    <thead>
      <tr>
        <th style="width:40px">№</th>
        <th>Наименование услуги</th>
        <th style="width:60px">Кол-во</th>
        <th style="width:100px">Цена, руб.</th>
        <th style="width:100px">Сумма, руб.</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="text-align:center">1</td>
        <td>Предоставление доступа к платформе Sintagma</td>
        <td style="text-align:center">1</td>
        <td style="text-align:right">${formatAmount(amountKopecks)}</td>
        <td style="text-align:right">${formatAmount(amountKopecks)}</td>
      </tr>
    </tbody>
  </table>

  <div class="total">Итого: ${formatAmount(amountKopecks)} руб.</div>
  <div class="total-words">Всего оказано услуг на сумму: ${amountInWords(amountKopecks)}</div>

  <p>Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.</p>

  <table class="signatures-table">
    <tr>
      <td>
        <div class="sig-title">Исполнитель</div>
        <p>ИП Шафрановский М.М.</p>
        <div class="sig-facsimile">
          <img class="sig-stamp" src="${stampBase64}" alt="Печать" />
          <img class="sig-sign" src="${signatureBase64}" alt="Подпись" />
        </div>
        <div class="sig-name">/ Шафрановский М.М. /</div>
      </td>
      <td>
        <div class="sig-title">Заказчик</div>
        <p>${customerName}</p>
        <div style="height: 160px;"></div>
        <div class="sig-name">_________________ / ${customerDirector} /</div>
        <p style="font-size:10pt; color:#666; margin-top:5px">${customerPosition}</p>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
