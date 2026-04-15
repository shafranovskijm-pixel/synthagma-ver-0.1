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
  // Simplified Russian amount in words
  const rubles = Math.floor(amount);
  const kopecks = Math.round((amount - rubles) * 100);
  return `${rubles} руб. ${kopecks.toString().padStart(2, "0")} коп.`;
}

export async function generateAct({
  organizationId,
  orgName,
  orgInn,
  directorName,
  directorPosition,
  actDate,
  basis,
  amount,
}: ActParams): Promise<string | null> {
  try {
    const actNumber = `A-${Date.now().toString().slice(-6)}`;
    const formattedDate = format(actDate, "dd MMMM yyyy", { locale: ru });

    // Convert images to base64 for embedding
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
    .signatures { display: flex; justify-content: space-between; margin-top: 40px; page-break-inside: avoid; break-inside: avoid; }
    .sig-block { width: 45%; }
    .sig-block h4 { font-size: 12pt; margin-bottom: 15px; border-bottom: 1px solid #000; padding-bottom: 5px; }
    .sig-line { display: flex; align-items: flex-end; gap: 10px; margin-top: 30px; position: relative; min-height: 100px; }
    .sig-images { position: relative; width: 280px; height: 150px; overflow: visible; }
    .sig-images img { position: absolute; }
    .sig-stamp { left: 0; top: 0; width: 150px; height: auto; opacity: 0.9; }
    .sig-sign { left: 60px; top: 20px; width: 180px; height: auto; opacity: 0.9; }
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

  <div class="signatures">
    <div class="sig-block">
      <h4>Исполнитель</h4>
      <p>ИП Шафрановский М.М.</p>
      <div class="sig-line">
        <div class="sig-images">
          <img class="sig-stamp" src="${stampBase64}" alt="Печать" />
          <img class="sig-sign" src="${signatureBase64}" alt="Подпись" />
        </div>
        <span>/ Шафрановский М.М. /</span>
      </div>
    </div>
    <div class="sig-block">
      <h4>Заказчик</h4>
      <p>${customerName}</p>
      <div class="sig-line">
        <span>_________________ / ${customerDirector} /</span>
      </div>
      <p style="font-size:10pt; color:#666; margin-top:5px">${customerPosition}</p>
    </div>
  </div>
</body>
</html>`.trim();

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const fileName = `${organizationId}/acts/act_${actNumber}_${Date.now()}.html`;

    const { error: uploadError } = await supabase.storage
      .from("billing-documents")
      .upload(fileName, blob, { contentType: "text/html;charset=utf-8" });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return null;
    }

    const docName = `Акт № ${actNumber} от ${formattedDate} — ${basis}`;

    const { error: dbError } = await supabase
      .from("org_billing_documents")
      .insert({
        organization_id: organizationId,
        name: docName,
        doc_type: "act",
        file_url: fileName,
      } as any);

    if (dbError) {
      console.error("DB error:", dbError);
      return null;
    }

    return docName;
  } catch (error) {
    console.error("Error generating act:", error);
    return null;
  }
}
