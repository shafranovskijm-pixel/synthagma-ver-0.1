import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface OrderParams {
  organizationId: string;
  organizationName: string;
  directorName?: string | null;
  directorPosition?: string | null;
  studentNames: string[];
  courseName: string;
  orderType: "enrollment" | "expulsion";
  orderDate?: Date;
}

export async function generateEnrollmentOrder({
  organizationId,
  organizationName,
  directorName,
  directorPosition,
  studentNames,
  courseName,
  orderType,
  orderDate = new Date(),
}: OrderParams): Promise<string | null> {
  try {
    const filePrefix = orderType === "enrollment" ? "Z" : "O";
    const orderNumber = `${filePrefix}-${Date.now().toString().slice(-6)}`;
    const displayPrefix = orderType === "enrollment" ? "З" : "О";
    const displayNumber = `${displayPrefix}-${orderNumber.split("-")[1]}`;
    const formattedDate = format(orderDate, "dd MMMM yyyy", { locale: ru });
    
    const orderTitle = orderType === "enrollment" 
      ? "ПРИКАЗ О ЗАЧИСЛЕНИИ"
      : "ПРИКАЗ ОБ ОТЧИСЛЕНИИ";
    
    const actionVerb = orderType === "enrollment" 
      ? "зачислить"
      : "отчислить";
    
    const actionPastVerb = orderType === "enrollment"
      ? "Зачислен(а/ы)"
      : "Отчислен(а/ы)";

    const studentsListHtml = studentNames.map((name, i) => 
      `<p style="margin-left: 20px;">${i + 1}. ${name}</p>`
    ).join("\n");

    const orderHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Times New Roman', Times, serif; font-size: 14pt; line-height: 1.5; padding: 40px; }
    .header { text-align: center; margin-bottom: 30px; }
    .org-name { font-weight: bold; font-size: 16pt; }
    .order-title { font-weight: bold; font-size: 18pt; margin: 30px 0; text-align: center; }
    .order-number { text-align: center; margin-bottom: 20px; }
    .content { margin: 20px 0; text-align: justify; }
    .signature { margin-top: 50px; display: flex; justify-content: space-between; }
    .signature-left { text-align: left; }
    .signature-right { text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <div class="org-name">${organizationName}</div>
  </div>
  
  <div class="order-title">${orderTitle}</div>
  
  <div class="order-number">
    № ${orderNumber} от ${formattedDate} г.
  </div>
  
  <div class="content">
    <p>На основании Правил приёма на обучение по программам дополнительного профессионального образования,</p>
    
    <p style="font-weight: bold; margin-top: 20px;">ПРИКАЗЫВАЮ:</p>
    
    <p>1. ${actionVerb.charAt(0).toUpperCase() + actionVerb.slice(1)} на обучение по дополнительной профессиональной программе «${courseName}» следующих слушателей:</p>
    
    ${studentsListHtml}
    
    <p style="margin-top: 20px;">2. Контроль за исполнением настоящего приказа оставляю за собой.</p>
  </div>
  
  <div class="signature">
    <div class="signature-left">
      <p>${directorPosition || "Руководитель"}</p>
    </div>
    <div class="signature-right">
      <p>_________________ / ${directorName || "_________________"} /</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    // Create blob and upload to storage
    const blob = new Blob([orderHtml], { type: "text/html" });
    const fileName = `${organizationId}/orders/${orderType}_${orderNumber}_${Date.now()}.html`;

    const { error: uploadError } = await supabase.storage
      .from("org-documents")
      .upload(fileName, blob);

    let fileUrl: string | null = null;
    if (uploadError) {
      console.error("Storage upload error:", uploadError);
    } else {
      const { data: urlData } = supabase.storage
        .from("org-documents")
        .getPublicUrl(fileName);
      fileUrl = urlData.publicUrl;
    }

    // Save to org_documents
    const docType = orderType === "enrollment" ? "enrollment_order" : "expulsion_order";
    const docName = `${orderTitle} № ${displayNumber} от ${formattedDate} - ${courseName}`;

    const { error: dbError } = await supabase
      .from("org_documents")
      .insert({
        organization_id: organizationId,
        name: docName,
        type: docType,
        file_url: fileUrl,
      });

    if (dbError) {
      console.error("Error saving order to database:", dbError);
      return null;
    }

    return docName;
  } catch (error) {
    console.error("Error generating order:", error);
    return null;
  }
}
