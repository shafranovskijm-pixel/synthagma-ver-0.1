import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import stampImg from "@/assets/stamp-shafranovskiy.png";
import signatureImg from "@/assets/signature-shafranovskiy.png";

interface ActParams {
  organizationId: string;
  orgName: string;
  orgInn: string | null;
  directorName: string | null;
  directorPosition: string | null;
  actDate: Date;
  basis: string;
  amount: number;
}

async function imageToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function amountInWords(amount: number): string {
  const rubles = Math.floor(amount);
  const kopecks = Math.round((amount - rubles) * 100);
  return `${rubles} руб. ${kopecks.toString().padStart(2, "0")} коп.`;
}

export interface GeneratedAct {
  html: string;
  actNumber: string;
  docName: string;
  organizationId: string;
  basis: string;
}

/**
 * Generate act HTML without saving to DB.
 * Call saveActDocument() to persist after download/print/email.
 */
export async function generateActHtml(params: ActParams): Promise<GeneratedAct | null> {
  try {
    const { organizationId, orgName, orgInn, directorName, directorPosition, actDate, basis, amount } = params;
    const actNumber = `A-${Date.now().toString().slice(-6)}`;
    const formattedDate = format(actDate, "dd MMMM yyyy", { locale: ru });

    const [stampBase64, signatureBase64] = await Promise.all([
      imageToBase64(stampImg),
      imageToBase64(signatureImg),
    ]);

    const customerName = orgName || "_______________";
    const customerInn = orgInn || "_______________";
    const customerDirector = directorName || "_______________";
    const customerPosition = directorPosition || "Руководитель";

    const html = `
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
  <div class="act-number">№ ${actNumber} от ${formattedDate} г.</div>
  
  <div class="parties">
    <p><strong>Исполнитель:</strong> ИП Шафрановский Максим Михайлович, ИНН 253615392404</p>
    <p><strong>Заказчик:</strong> ${customerName}${customerInn ? `, ИНН ${customerInn}` : ""}</p>
    <p><strong>Основание:</strong> ${basis}</p>
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
        <td style="text-align:right">${formatAmount(amount)}</td>
        <td style="text-align:right">${formatAmount(amount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="total">Итого: ${formatAmount(amount)} руб.</div>
  <div class="total-words">Всего оказано услуг на сумму: ${amountInWords(amount)}</div>

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

    const docName = `Акт № ${actNumber} от ${formattedDate} — ${basis}`;
    return { html, actNumber, docName, organizationId, basis };
  } catch (error) {
    console.error("Error generating act HTML:", error);
    return null;
  }
}

/**
 * Save a generated act to storage and DB.
 * Call this only when the user explicitly downloads, prints, or emails the act.
 */
export async function saveActDocument(act: GeneratedAct): Promise<string | null> {
  try {
    const blob = new Blob([act.html], { type: "text/html;charset=utf-8" });
    const fileName = `${act.organizationId}/acts/act_${act.actNumber}_${Date.now()}.html`;

    const { error: uploadError } = await supabase.storage
      .from("billing-documents")
      .upload(fileName, blob, { contentType: "text/html;charset=utf-8" });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return null;
    }

    const { error: dbError } = await supabase
      .from("org_billing_documents")
      .insert({
        organization_id: act.organizationId,
        name: act.docName,
        doc_type: "act",
        file_url: fileName,
      } as any);

    if (dbError) {
      console.error("DB error:", dbError);
      return null;
    }

    return act.docName;
  } catch (error) {
    console.error("Error saving act:", error);
    return null;
  }
}

/**
 * Legacy wrapper — generates AND saves (kept for backward compatibility).
 * @deprecated Use generateActHtml() + saveActDocument() separately.
 */
export async function generateAct(params: ActParams): Promise<string | null> {
  const act = await generateActHtml(params);
  if (!act) return null;
  return saveActDocument(act);
}
