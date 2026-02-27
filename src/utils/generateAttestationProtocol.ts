import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface CommissionMember {
  name: string;
  position: string;
  role: "chairman" | "member" | "secretary";
}

interface ProtocolParams {
  organizationId: string;
  organizationName: string;
  directorName?: string | null;
  directorPosition?: string | null;
  studentName: string;
  courseName: string;
  courseDuration?: string | null;
  completedAt?: Date;
  testScore?: number;
  testMaxScore?: number;
}

export async function generateAttestationProtocol({
  organizationId,
  organizationName,
  directorName,
  directorPosition,
  studentName,
  courseName,
  courseDuration,
  completedAt = new Date(),
  testScore,
  testMaxScore,
}: ProtocolParams): Promise<string | null> {
  try {
    // Load branding settings for protocol template, commission, stamp/signature
    const { data: orgData } = await supabase
      .from("organizations")
      .select("branding, stamp_url, signature_url")
      .eq("id", organizationId)
      .single();

    const branding = orgData?.branding as Record<string, unknown> | null;
    const stampUrl = orgData?.stamp_url as string | null;
    const signatureUrl = orgData?.signature_url as string | null;
    const commissionMembers = (branding?.commissionMembers as CommissionMember[]) || [];
    const protocolTemplate = branding?.protocolTemplate as string | null;

    const protocolNumber = `ПАК-${Date.now().toString().slice(-6)}`;
    const formattedDate = format(completedAt, "dd MMMM yyyy", { locale: ru });
    
    const scoreText = testScore !== undefined && testMaxScore !== undefined
      ? `${testScore} из ${testMaxScore} (${Math.round((testScore / testMaxScore) * 100)}%)`
      : "Зачёт";
    
    const decision = testScore !== undefined && testMaxScore !== undefined
      ? (testScore / testMaxScore >= 0.6 ? "Аттестован(а)" : "Не аттестован(а)")
      : "Аттестован(а)";

    // Build commission HTML
    const chairman = commissionMembers.find(m => m.role === "chairman");
    const members = commissionMembers.filter(m => m.role !== "chairman");
    
    const commissionHtml = commissionMembers.length > 0
      ? `<p>Председатель комиссии: ${chairman?.name || directorName || "_________________"} (${chairman?.position || directorPosition || "Руководитель"})</p>
         ${members.map(m => `<p>${m.role === "secretary" ? "Секретарь" : "Член комиссии"}: ${m.name} (${m.position})</p>`).join("\n")}`
      : `<p>Председатель комиссии: ${directorName || "_________________"} (${directorPosition || "Руководитель"})</p>
         <p>Члены комиссии: _________________</p>`;

    // Build stamp/signature HTML
    const stampSignatureHtml = (stampUrl || signatureUrl) ? `
      <div style="display: flex; gap: 40px; margin-top: 20px; align-items: flex-end;">
        ${signatureUrl ? `<img src="${signatureUrl}" alt="Подпись" style="max-height: 60px; max-width: 150px; object-fit: contain;" />` : ''}
        ${stampUrl ? `<img src="${stampUrl}" alt="Печать" style="max-height: 80px; max-width: 80px; object-fit: contain;" />` : ''}
      </div>` : '';

    const chairmanName = chairman?.name || directorName || "_________________";

    const protocolHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Times New Roman', Times, serif; font-size: 14pt; line-height: 1.5; padding: 40px; }
    .header { text-align: center; margin-bottom: 30px; }
    .org-name { font-weight: bold; font-size: 16pt; }
    .protocol-title { font-weight: bold; font-size: 18pt; margin: 30px 0; text-align: center; }
    .protocol-number { text-align: center; margin-bottom: 20px; }
    .content { margin: 20px 0; }
    .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .table th, .table td { border: 1px solid #000; padding: 10px; text-align: left; }
    .table th { background-color: #f5f5f5; }
    .signature { margin-top: 50px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="org-name">${organizationName}</div>
  </div>
  
  <div class="protocol-title">ПРОТОКОЛ ЗАСЕДАНИЯ АТТЕСТАЦИОННОЙ КОМИССИИ</div>
  
  <div class="protocol-number">
    № ${protocolNumber} от ${formattedDate} г.
  </div>
  
  <div class="content">
    <p><strong>Программа обучения:</strong> ${courseName}</p>
    ${courseDuration ? `<p><strong>Объём программы:</strong> ${courseDuration}</p>` : ''}
    
    <p style="margin-top: 20px;"><strong>Состав комиссии:</strong></p>
    ${commissionHtml}
    
    <p style="margin-top: 20px;"><strong>Повестка дня:</strong></p>
    <p>Итоговая аттестация слушателя по результатам освоения дополнительной профессиональной программы.</p>
    
    <table class="table">
      <thead>
        <tr>
          <th>№ п/п</th>
          <th>ФИО слушателя</th>
          <th>Результат аттестации</th>
          <th>Решение комиссии</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <td>${studentName}</td>
          <td>${scoreText}</td>
          <td>${decision}</td>
        </tr>
      </tbody>
    </table>
    
    <p style="margin-top: 20px;"><strong>РЕШИЛИ:</strong></p>
    <p>Признать ${studentName} успешно прошедшим(ей) итоговую аттестацию по дополнительной профессиональной программе «${courseName}».</p>
    <p>Выдать документ о квалификации установленного образца.</p>
  </div>
  
  <div class="signature">
    <p style="margin-top: 40px;">Председатель комиссии: _________________ / ${chairmanName} /</p>
    ${members.length > 0
      ? members.map(m => `<p style="margin-top: 20px;">${m.role === "secretary" ? "Секретарь" : "Член комиссии"}: _________________ / ${m.name} /</p>`).join("\n")
      : `<p style="margin-top: 20px;">Члены комиссии: _________________ / _________________ /</p>`
    }
    ${stampSignatureHtml}
  </div>
</body>
</html>
    `.trim();

    // Create blob and upload to storage
    const blob = new Blob([protocolHtml], { type: "text/html" });
    const fileName = `${organizationId}/protocols/attestation_${protocolNumber}_${Date.now()}.html`;

    const { error: uploadError } = await supabase.storage
      .from("org-documents")
      .upload(fileName, blob);

    let fileUrl: string | null = null;
    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from("org-documents")
        .getPublicUrl(fileName);
      fileUrl = urlData.publicUrl;
    }

    // Save to org_documents with attestation_protocol type
    const docName = `Протокол АК № ${protocolNumber} от ${formattedDate} - ${studentName} - ${courseName}`;

    const { error: dbError } = await supabase
      .from("org_documents")
      .insert({
        organization_id: organizationId,
        name: docName,
        type: "attestation_protocol",
        file_url: fileUrl,
      });

    if (dbError) {
      console.error("Error saving protocol to database:", dbError);
      return null;
    }

    return docName;
  } catch (error) {
    console.error("Error generating attestation protocol:", error);
    return null;
  }
}
